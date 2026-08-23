// Narrows Tooling bearer credentials into OAuth-user or exact management-credential principals.

import { verifyToolingOAuthAccessToken, type ToolingOAuthPrincipal } from "@framerfordevs/auth";
import { Context, Effect, Layer } from "effect";

import type { CredentialPrincipal } from "../contracts/access";
import { AuthSessionFailure, CredentialInvalidFailure } from "../contracts/errors";
import { Telemetry } from "../observability/telemetry";
import { CredentialAttemptLimiter } from "./credential-attempt-limiter";
import { CredentialAuthenticator, type VerifyCredentialInput } from "./credential-authenticator";

export type ToolingPrincipal =
  | ToolingOAuthPrincipal
  | {
      readonly kind: "management_credential";
      readonly credential: CredentialPrincipal;
    };

export interface AuthenticateToolingBearerInput {
  readonly token: string;
  readonly source: string;
}

/** Adapts Better Auth's protocol verifier into the application Effect error boundary. */
export function makeToolingOAuthTokenVerifier(
  verify: (token: string) => Promise<ToolingOAuthPrincipal | null>,
) {
  return {
    verify: (token: string) =>
      Effect.tryPromise({
        try: () => verify(token),
        catch: (cause) =>
          AuthSessionFailure.make({
            operation: "tooling.oauth.verify",
            cause,
          }),
      }),
  };
}

export class ToolingOAuthTokenVerifier extends Context.Tag("ToolingOAuthTokenVerifier")<
  ToolingOAuthTokenVerifier,
  ReturnType<typeof makeToolingOAuthTokenVerifier>
>() {}

export const ToolingOAuthTokenVerifierLive = Layer.succeed(
  ToolingOAuthTokenVerifier,
  makeToolingOAuthTokenVerifier(verifyToolingOAuthAccessToken),
);

/** Selects only the two approved Tooling bearer authorities without credential fallback. */
export function makeToolingPrincipalAuthenticator<
  ManagementError,
  OAuthError,
  ManagementServices,
  OAuthServices,
  InvalidAttemptError,
  InvalidAttemptServices,
>(
  verifyManagement: (
    input: VerifyCredentialInput,
  ) => Effect.Effect<CredentialPrincipal, ManagementError, ManagementServices>,
  verifyOAuth: (
    token: string,
  ) => Effect.Effect<ToolingOAuthPrincipal | null, OAuthError, OAuthServices>,
  assertInvalidAttemptAllowed: (
    source: string,
  ) => Effect.Effect<void, InvalidAttemptError, InvalidAttemptServices>,
) {
  return {
    authenticate: Effect.fn("ToolingPrincipalAuthenticator.authenticate")(function* (
      input: AuthenticateToolingBearerInput,
    ) {
      if (input.token.startsWith("ffd_mgmt_")) {
        const credential = yield* verifyManagement({
          key: input.token,
          expectedFamily: "management",
          requiredScope: "schema.read",
          source: input.source,
        });
        return {
          kind: "management_credential" as const,
          credential,
        };
      }

      if (input.token.startsWith("ffd_del_") || input.token.startsWith("ffd_prev_")) {
        yield* assertInvalidAttemptAllowed(input.source);
        return yield* CredentialInvalidFailure.make();
      }

      const principal = yield* verifyOAuth(input.token);
      if (principal === null) {
        yield* assertInvalidAttemptAllowed(input.source);
        return yield* CredentialInvalidFailure.make();
      }
      return principal;
    }),
  };
}

const toolingPrincipalAuthenticatorLiveService = makeToolingPrincipalAuthenticator(
  (input) => Effect.flatMap(CredentialAuthenticator, (service) => service.verify(input)),
  (token) =>
    Effect.flatMap(ToolingOAuthTokenVerifier, (service) => service.verify(token)).pipe(
      Effect.tap((principal) =>
        Effect.flatMap(Telemetry, (telemetry) =>
          telemetry.recordToolingOAuthVerification(principal === null ? "invalid" : "success"),
        ),
      ),
      Effect.tapError(() =>
        Effect.flatMap(Telemetry, (telemetry) =>
          telemetry.recordToolingOAuthVerification("failure"),
        ),
      ),
    ),
  (source) => Effect.flatMap(CredentialAttemptLimiter, (service) => service.assertAllowed(source)),
);

export class ToolingPrincipalAuthenticator extends Context.Tag("ToolingPrincipalAuthenticator")<
  ToolingPrincipalAuthenticator,
  typeof toolingPrincipalAuthenticatorLiveService
>() {}

export const ToolingPrincipalAuthenticatorLive = Layer.succeed(
  ToolingPrincipalAuthenticator,
  toolingPrincipalAuthenticatorLiveService,
);
