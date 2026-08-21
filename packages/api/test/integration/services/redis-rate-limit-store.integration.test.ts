// Exercises the production Lua token bucket against Redis for atomic weighted concurrency and reset behavior.

import { randomUUID } from "node:crypto";

import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import { makeRedisRateLimitStoreLive } from "../../../src/services/redis-rate-limit-store";
import { RateLimitStore, type RateLimitStoreRequest } from "../../../src/services/rate-limit-store";

const RedisRateLimitTestLive = makeRedisRateLimitStoreLive({
  url: process.env.RATE_LIMIT_REDIS_URL ?? "redis://127.0.0.1:6379",
  timeoutMs: 500,
  reconnectAttempts: 2,
});

describe("Redis rate-limit store integration", () => {
  layer(RedisRateLimitTestLive)((it) => {
    it.effect(
      "atomically admits only the configured capacity under concurrent weighted calls",
      () =>
        Effect.gen(function* () {
          const store = yield* RateLimitStore;
          const key = `ffd:rate-limit:v1:integration:${randomUUID()}`;
          const request = {
            key,
            policy: {
              policy: "delivery.credential",
              limitPerInterval: 1,
              intervalMs: 60_000,
              capacity: 100,
            },
            cost: 1,
          } satisfies RateLimitStoreRequest;

          const decisions = yield* Effect.all(
            Array.from({ length: 120 }, () => store.evaluate(request)),
            { concurrency: 20 },
          );
          yield* store.reset(key);

          assert.strictEqual(decisions.filter((decision) => decision.allowed).length, 100);
          assert.strictEqual(decisions.filter((decision) => !decision.allowed).length, 20);
        }),
    );

    it.effect("deletes a bucket so the next request receives full capacity", () =>
      Effect.gen(function* () {
        const store = yield* RateLimitStore;
        const key = `ffd:rate-limit:v1:integration:${randomUUID()}`;
        const request = {
          key,
          policy: {
            policy: "credential.verification.invalid",
            limitPerInterval: 10,
            intervalMs: 60_000,
            capacity: 10,
          },
          cost: 10,
        } satisfies RateLimitStoreRequest;

        const first = yield* store.evaluate(request);
        const limited = yield* store.evaluate({ ...request, cost: 1 });
        yield* store.reset(key);
        const reset = yield* store.evaluate(request);
        yield* store.reset(key);

        assert.isTrue(first.allowed);
        assert.isFalse(limited.allowed);
        assert.isTrue(reset.allowed);
      }),
    );
  });
});
