// Verifies DNS resolution remains replaceable and all-address failures are typed and closed.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Fiber, TestClock } from "effect";

import { makeWebhookDestinationValidator } from "./webhook-destination-validator";

describe("WebhookDestinationValidator", () => {
  it.effect("returns normalized authority only after every answer is public", () =>
    Effect.gen(function* () {
      const validator = makeWebhookDestinationValidator(async () => ["93.184.216.34"]);
      const result = yield* validator.validate("https://HOOKS.example.com/opaque");
      assert.strictEqual(result.hostname, "hooks.example.com");
      assert.deepStrictEqual(result.addresses, ["93.184.216.34"]);
    }),
  );

  it.effect("rejects mixed public/private answers without returning addresses", () =>
    Effect.gen(function* () {
      const validator = makeWebhookDestinationValidator(async () => ["93.184.216.34", "10.0.0.1"]);
      const exit = yield* Effect.exit(validator.validate("https://hooks.example.com/opaque"));
      assert.isTrue(Exit.isFailure(exit));
    }),
  );

  it.effect("translates resolver rejection into a retryable typed resolution failure", () =>
    Effect.gen(function* () {
      const validator = makeWebhookDestinationValidator(async () => {
        throw new Error("resolver detail must remain internal");
      });
      const failure = yield* Effect.flip(validator.validate("https://hooks.example.com/opaque"));
      assert.strictEqual(failure._tag, "WebhookDestinationResolutionFailure");
    }),
  );

  it.effect("fails DNS resolution at the deterministic two-second boundary", () =>
    Effect.gen(function* () {
      const validator = makeWebhookDestinationValidator(
        () => new Promise<ReadonlyArray<string>>(() => undefined),
      );
      const fiber = yield* Effect.fork(
        Effect.flip(validator.validate("https://hooks.example.com/opaque")),
      );
      yield* TestClock.adjust("2 seconds");
      const failure = yield* Fiber.join(fiber);
      assert.strictEqual(failure._tag, "WebhookDestinationResolutionFailure");
    }),
  );
});
