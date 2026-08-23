import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";

import {
  makeToolingOAuthTokenVerifier,
  makeToolingPrincipalAuthenticator,
} from "./tooling-principal-authenticator";

const unusedManagementVerifier = () => Effect.never;
const allowInvalidAttempt = () => Effect.void;

describe("Tooling principal authentication", () => {
  it.effect("translates OAuth verifier rejection into a typed auth dependency failure", () =>
    Effect.gen(function* () {
      const verifier = makeToolingOAuthTokenVerifier(() =>
        Promise.reject(new Error("verification unavailable")),
      );
      const result = yield* Effect.exit(verifier.verify("token"));

      assert.isTrue(Exit.isFailure(result));
      if (Exit.isFailure(result)) {
        const error = Option.getOrUndefined(Cause.failureOption(result.cause));
        assert.strictEqual(error?._tag, "AuthSessionFailure");
      }
    }),
  );

  it.effect("accepts a verified official OAuth user principal", () => {
    const principal = {
      kind: "oauth_user" as const,
      userId: "user-1",
      clientId: "framerfordevs-cli" as const,
      scopes: ["tooling:read"],
      expiresAtEpochSeconds: 1_800_000_000,
    };
    const authenticator = makeToolingPrincipalAuthenticator(
      unusedManagementVerifier,
      () => Effect.succeed(principal),
      allowInvalidAttempt,
    );

    return authenticator
      .authenticate({ token: "jwt.access.token", source: "source-1" })
      .pipe(Effect.tap((result) => Effect.sync(() => assert.deepStrictEqual(result, principal))));
  });

  it.effect("rejects an invalid OAuth token with the closed credential failure", () => {
    const authenticator = makeToolingPrincipalAuthenticator(
      unusedManagementVerifier,
      () => Effect.succeed(null),
      allowInvalidAttempt,
    );

    return Effect.exit(authenticator.authenticate({ token: "invalid", source: "source-1" })).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          assert.isTrue(Exit.isFailure(result));
          if (Exit.isFailure(result)) {
            const error = Option.getOrUndefined(Cause.failureOption(result.cause));
            assert.strictEqual(error?._tag, "CredentialInvalidFailure");
          }
        }),
      ),
    );
  });

  it.effect("rejects Delivery and Preview credentials without OAuth fallback", () => {
    let oauthCalls = 0;
    const authenticator = makeToolingPrincipalAuthenticator(
      unusedManagementVerifier,
      () => {
        oauthCalls += 1;
        return Effect.succeed(null);
      },
      allowInvalidAttempt,
    );

    return Effect.all([
      Effect.exit(authenticator.authenticate({ token: "ffd_del_invalid", source: "source-1" })),
      Effect.exit(authenticator.authenticate({ token: "ffd_prev_invalid", source: "source-1" })),
    ]).pipe(
      Effect.tap((results) =>
        Effect.sync(() => {
          assert.strictEqual(oauthCalls, 0);
          for (const result of results) {
            assert.isTrue(Exit.isFailure(result));
            if (Exit.isFailure(result)) {
              const error = Option.getOrUndefined(Cause.failureOption(result.cause));
              assert.strictEqual(error?._tag, "CredentialInvalidFailure");
            }
          }
        }),
      ),
    );
  });
});
