// Preserves the credential-verification limiter facade while delegating enforcement to the central manager.

import { Context, Effect, Layer } from "effect";

import { RateLimitedFailure } from "../contracts/errors";
import { RateLimitManager, type RateLimitManagerService } from "./rate-limit-manager";

/** Adapts credential verification to the shared weighted policy without exposing arbitrary limits. */
export function makeCredentialAttemptLimiter(manager: RateLimitManagerService) {
  return {
    assertAllowed: Effect.fn("CredentialAttemptLimiter.assertAllowed")(function* (source: string) {
      const decision = yield* manager.evaluate({
        policy: "credential.verification.invalid",
        identity: source,
        cost: 1,
      });
      if (!decision.allowed) return yield* RateLimitedFailure.make();
    }),

    // Consumption occurs before verification so malformed inputs cannot avoid the central limiter.
    recordFailure: Effect.fn("CredentialAttemptLimiter.recordFailure")(
      (_source: string) => Effect.void,
    ),

    reset: Effect.fn("CredentialAttemptLimiter.reset")((source: string) =>
      manager.reset({ policy: "credential.verification.invalid", identity: source }),
    ),

    retainedEntryCount: Effect.fn("CredentialAttemptLimiter.retainedEntryCount")(
      () => manager.retainedFallbackEntryCount,
    ),
  };
}

export class CredentialAttemptLimiter extends Context.Tag("CredentialAttemptLimiter")<
  CredentialAttemptLimiter,
  ReturnType<typeof makeCredentialAttemptLimiter>
>() {}

export const CredentialAttemptLimiterLive = Layer.effect(
  CredentialAttemptLimiter,
  Effect.map(RateLimitManager, makeCredentialAttemptLimiter),
);
