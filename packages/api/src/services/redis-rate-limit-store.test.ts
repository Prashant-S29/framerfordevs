// Verifies Redis script-cache handling, reply validation, typed failures, and reset behavior without network access.

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import type { RateLimitStoreRequest } from "./rate-limit-store";
import { makeRedisRateLimitStore, redisRateLimitScript } from "./redis-rate-limit-store";

const request = {
  key: "ffd:rate-limit:v1:test:opaque",
  policy: {
    policy: "delivery.anonymous",
    limitPerInterval: 120,
    intervalMs: 60_000,
    capacity: 30,
  },
  cost: 6,
} satisfies RateLimitStoreRequest;

describe("RedisRateLimitStore", () => {
  it.effect("uses the cached script digest and parses the fixed reply", () =>
    Effect.gen(function* () {
      let evaluatedScript = false;
      const store = makeRedisRateLimitStore({
        evaluateSha: () => Promise.resolve(["1", "24", "120000", "0"]),
        evaluate: () => {
          evaluatedScript = true;
          return Promise.resolve([]);
        },
        delete: () => Promise.resolve(1),
      });

      const result = yield* store.evaluate(request);

      assert.isTrue(result.allowed);
      assert.strictEqual(result.remaining, 24);
      assert.strictEqual(result.resetAtEpochMs, 120_000);
      assert.isNull(result.retryAfterSeconds);
      assert.isFalse(result.scriptReloaded);
      assert.isFalse(evaluatedScript);
    }),
  );

  it.effect("reloads only after NOSCRIPT and marks the bounded outcome", () =>
    Effect.gen(function* () {
      let script = "";
      const store = makeRedisRateLimitStore({
        evaluateSha: () => Promise.reject(new Error("NOSCRIPT missing script")),
        evaluate: (receivedScript) => {
          script = receivedScript;
          return Promise.resolve(["0", "2", "125000", "2"]);
        },
        delete: () => Promise.resolve(1),
      });

      const result = yield* store.evaluate(request);

      assert.strictEqual(script, redisRateLimitScript);
      assert.isFalse(result.allowed);
      assert.strictEqual(result.retryAfterSeconds, 2);
      assert.isTrue(result.scriptReloaded);
    }),
  );

  it.effect("rejects malformed Redis replies through the typed store channel", () =>
    Effect.gen(function* () {
      const store = makeRedisRateLimitStore({
        evaluateSha: () => Promise.resolve(["unexpected"]),
        evaluate: () => Promise.resolve([]),
        delete: () => Promise.resolve(1),
      });

      const exit = yield* Effect.exit(store.evaluate(request));

      assert.strictEqual(exit._tag, "Failure");
    }),
  );

  it.effect("does not retry arbitrary command errors as script-cache misses", () =>
    Effect.gen(function* () {
      let evaluations = 0;
      const store = makeRedisRateLimitStore({
        evaluateSha: () => Promise.reject(new Error("connection closed")),
        evaluate: () => {
          evaluations += 1;
          return Promise.resolve([]);
        },
        delete: () => Promise.resolve(1),
      });

      const exit = yield* Effect.exit(store.evaluate(request));

      assert.strictEqual(exit._tag, "Failure");
      assert.strictEqual(evaluations, 0);
    }),
  );

  it.effect("deletes only the supplied opaque key on reset", () =>
    Effect.gen(function* () {
      const deleted: Array<string> = [];
      const store = makeRedisRateLimitStore({
        evaluateSha: () => Promise.resolve(["1", "1", "1", "0"]),
        evaluate: () => Promise.resolve([]),
        delete: (key) => {
          deleted.push(key);
          return Promise.resolve(1);
        },
      });

      yield* store.reset(request.key);

      assert.deepStrictEqual(deleted, [request.key]);
    }),
  );
});
