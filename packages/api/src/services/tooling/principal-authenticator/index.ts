// Narrows Tooling bearer credentials into OAuth-user or exact management-credential principals.

import {
  type CliApiOAuthScope,
  TOOLING_READ_SCOPE,
  verifyToolingOAuthAccessToken,
  type ToolingOAuthPrincipal,
} from "@framerfordevs/auth";
import { Context, Effect, Layer } from "effect";

import type { CredentialPrincipal, CredentialScope } from "../../../contracts/access";
import { AuthSessionFailure, CredentialInvalidFailure } from "../../../contracts/response/errors";
import { Telemetry } from "../../../observability/telemetry";
import { CredentialAttemptLimiter } from "../../credential/attempt-limiter";
import {
  CredentialAuthenticator,
  type VerifyCredentialInput,
} from "../../credential/authenticator";

export type ToolingPrincipal =
  | ToolingOAuthPrincipal
  | {
      readonly kind: "management_credential";
      readonly credential: CredentialPrincipal;
    };

export interface AuthenticateOAuthBearerInput {
  readonly token: string;
  readonly source: string;
  readonly oauthScope?: CliApiOAuthScope;
}

export interface AuthenticateToolingBearerInput {
  readonly token: string;
  readonly source: string;
  readonly oauthScope?: CliApiOAuthScope;
  readonly managementScopes?: ReadonlyArray<CredentialScope>;
}

/** Adapts Better Auth's protocol verifier into the application Effect error boundary. */
export function makeToolingOAuthTokenVerifier(
  verify: (token: string, requiredScope: CliApiOAuthScope) => Promise<ToolingOAuthPrincipal | null>,
) {
  return {
    verify: (token: string, requiredScope: CliApiOAuthScope = TOOLING_READ_SCOPE) =>
      Effect.tryPromise({
        try: () => verify(token, requiredScope),
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
    requiredScope: CliApiOAuthScope,
  ) => Effect.Effect<ToolingOAuthPrincipal | null, OAuthError, OAuthServices>,
  assertInvalidAttemptAllowed: (
    source: string,
  ) => Effect.Effect<void, InvalidAttemptError, InvalidAttemptServices>,
) {
  return {
    authenticateOAuth: Effect.fn("ToolingPrincipalAuthenticator.authenticateOAuth")(function* (
      input: AuthenticateOAuthBearerInput,
    ) {
      if (input.token.startsWith("ffd_")) {
        yield* assertInvalidAttemptAllowed(input.source);
        return yield* CredentialInvalidFailure.make();
      }
      const principal = yield* verifyOAuth(input.token, input.oauthScope ?? TOOLING_READ_SCOPE);
      if (principal === null) {
        yield* assertInvalidAttemptAllowed(input.source);
        return yield* CredentialInvalidFailure.make();
      }
      return principal;
    }),
    authenticate: Effect.fn("ToolingPrincipalAuthenticator.authenticate")(function* (
      input: AuthenticateToolingBearerInput,
    ) {
      if (input.token.startsWith("ffd_mgmt_")) {
        const requiredScopes = input.managementScopes ?? ["schema.read"];
        const firstScope = requiredScopes[0];
        if (firstScope === undefined) return yield* CredentialInvalidFailure.make();
        const credential = yield* verifyManagement({
          key: input.token,
          expectedFamily: "management",
          requiredScope: firstScope,
          source: input.source,
        });
        if (requiredScopes.some((scope) => !credential.scopes.includes(scope))) {
          return yield* CredentialInvalidFailure.make();
        }
        return {
          kind: "management_credential" as const,
          credential,
        };
      }

      if (input.token.startsWith("ffd_del_") || input.token.startsWith("ffd_prev_")) {
        yield* assertInvalidAttemptAllowed(input.source);
        return yield* CredentialInvalidFailure.make();
      }

      const principal = yield* verifyOAuth(input.token, input.oauthScope ?? TOOLING_READ_SCOPE);
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
  (token, requiredScope) =>
    Effect.flatMap(ToolingOAuthTokenVerifier, (service) =>
      service.verify(token, requiredScope),
    ).pipe(
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
