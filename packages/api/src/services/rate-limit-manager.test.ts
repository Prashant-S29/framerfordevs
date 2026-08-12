// Proves central policy enforcement, opaque identities, refill, bounded storage, and degraded recovery.

import { assert, describe, it } from "@effect/vitest";
import { Effect, TestClock } from "effect";

import type { RateLimitPolicyConfiguration } from "../contracts/rate-limit";
import type {
  RateLimitDecisionMetric,
  RateLimitStoreMetric,
  TelemetryService,
} from "../observability/telemetry";
import { makeRateLimitManager } from "./rate-limit-manager";
import {
  RateLimitStoreFailure,
  makeMemoryRateLimitStore,
  type RateLimitStoreRequest,
  type RateLimitStoreService,
} from "./rate-limit-store";

interface TelemetryCapture {
  readonly decisions: Array<RateLimitDecisionMetric>;
  readonly stores: Array<RateLimitStoreMetric>;
  readonly service: TelemetryService;
}

/** Creates a no-content telemetry fake that records only bounded rate-limit events. */
function makeTelemetryCapture(): TelemetryCapture {
  const decisions: Array<RateLimitDecisionMetric> = [];
  const stores: Array<RateLimitStoreMetric> = [];
  return {
    decisions,
    stores,
    service: {
      recordHttpRequest: () => Effect.void,
      recordDefect: () => Effect.void,
      recordCredentialVerification: () => Effect.void,
      recordLocaleMutation: () => Effect.void,
      recordSchemaMutation: () => Effect.void,
      recordSchemaValidation: () => Effect.void,
      recordSchemaPublication: () => Effect.void,
      recordEntryPublication: () => Effect.void,
      recordEntryPublicationValidationFailure: () => Effect.void,
      recordPreviewRead: () => Effect.void,
      recordPreviewQueryRejection: () => Effect.void,
      recordPreviewAuditFailure: () => Effect.void,
      recordRateLimitDecision: (event) =>
        Effect.sync(() => {
          decisions.push(event);
        }),
      recordRateLimitStore: (event) =>
        Effect.sync(() => {
          stores.push(event);
        }),
    },
  };
}

/** Creates an isolated manager with independent primary and fallback memory state. */
function makeTestManager(capture = makeTelemetryCapture()) {
  return {
    capture,
    manager: makeRateLimitManager({
      primary: makeMemoryRateLimitStore({ maxEntries: 100 }),
      fallback: makeMemoryRateLimitStore({ maxEntries: 100 }),
      telemetry: capture.service,
      fingerprintSecret: "rate-limit-manager-test-secret-that-is-at-least-32-bytes",
    }),
  };
}

describe("RateLimitManager", () => {
  it.effect("globally bounds each credential identity without a shared-egress source bucket", () =>
    Effect.gen(function* () {
      const { manager } = makeTestManager();
      for (let unit = 0; unit < 100; unit += 1) {
        const first = yield* manager.evaluate({
          policy: "delivery.credential",
          identity: "credential-a",
          cost: 1,
        });
        const second = yield* manager.evaluate({
          policy: "delivery.credential",
          identity: "credential-b",
          cost: 1,
        });
        assert.isTrue(first.allowed);
        assert.isTrue(second.allowed);
      }

      const firstLimited = yield* manager.evaluate({
        policy: "delivery.credential",
        identity: "credential-a",
        cost: 1,
      });
      const secondLimited = yield* manager.evaluate({
        policy: "delivery.credential",
        identity: "credential-b",
        cost: 1,
      });
      assert.isFalse(firstLimited.allowed);
      assert.isFalse(secondLimited.allowed);
    }),
  );

  it.effect("refills weighted buckets through the Effect test clock", () =>
    Effect.gen(function* () {
      const { manager } = makeTestManager();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const decision = yield* manager.evaluate({
          policy: "credential.verification.invalid",
          identity: "198.51.100.5",
          cost: 1,
        });
        assert.isTrue(decision.allowed);
      }
      const limited = yield* manager.evaluate({
        policy: "credential.verification.invalid",
        identity: "198.51.100.5",
        cost: 1,
      });
      assert.isFalse(limited.allowed);
      assert.strictEqual(limited.retryAfterSeconds, 6);

      yield* TestClock.adjust("6 seconds");
      const refilled = yield* manager.evaluate({
        policy: "credential.verification.invalid",
        identity: "198.51.100.5",
        cost: 1,
      });
      assert.isTrue(refilled.allowed);
    }),
  );

  it.effect("sends only a policy-domain-separated HMAC key to stores", () =>
    Effect.gen(function* () {
      const requests: Array<RateLimitStoreRequest> = [];
      const store: RateLimitStoreService = {
        mode: "memory",
        evaluate: (request) =>
          Effect.sync(() => {
            requests.push(request);
            return {
              allowed: true,
              remaining: 9,
              resetAtEpochMs: 1_000,
              retryAfterSeconds: null,
              scriptReloaded: false,
            };
          }),
        reset: () => Effect.void,
        retainedEntryCount: Effect.succeed(0),
      };
      const capture = makeTelemetryCapture();
      const manager = makeRateLimitManager({
        primary: store,
        fallback: makeMemoryRateLimitStore(),
        telemetry: capture.service,
        fingerprintSecret: "opaque-rate-limit-test-secret-that-is-at-least-32-bytes",
      });

      yield* manager.evaluate({
        policy: "delivery.anonymous",
        identity: "4:c0000201",
        cost: 1,
      });

      assert.strictEqual(requests.length, 1);
      assert.match(requests[0]?.key ?? "", /^ffd:rate-limit:v1:delivery\.anonymous:[0-9a-f]{64}$/u);
      assert.notInclude(requests[0]?.key ?? "", "c0000201");
    }),
  );

  it.effect("falls back locally on Redis failure and reports automatic recovery", () =>
    Effect.gen(function* () {
      let unavailable = true;
      const primary: RateLimitStoreService = {
        mode: "redis",
        evaluate: () =>
          unavailable
            ? Effect.fail(
                RateLimitStoreFailure.make({
                  operation: "test.redis",
                  reason: "timeout",
                  cause: new Error("contained"),
                }),
              )
            : Effect.succeed({
                allowed: true,
                remaining: 9,
                resetAtEpochMs: 1_000,
                retryAfterSeconds: null,
                scriptReloaded: false,
              }),
        reset: () => Effect.void,
        retainedEntryCount: Effect.succeed(0),
      };
      const capture = makeTelemetryCapture();
      const manager = makeRateLimitManager({
        primary,
        fallback: makeMemoryRateLimitStore(),
        telemetry: capture.service,
        fingerprintSecret: "degraded-rate-limit-test-secret-that-is-at-least-32-bytes",
      });

      const degraded = yield* manager.evaluate({
        policy: "delivery.anonymous",
        identity: "4:c0000202",
        cost: 1,
      });
      unavailable = false;
      const recovered = yield* manager.evaluate({
        policy: "delivery.anonymous",
        identity: "4:c0000202",
        cost: 1,
      });

      assert.strictEqual(degraded.enforcementMode, "degraded_memory");
      assert.strictEqual(recovered.enforcementMode, "redis");
      assert.deepStrictEqual(
        capture.stores.map((event) => event.result),
        ["timeout", "degraded", "success", "recovered"],
      );
    }),
  );

  it.effect("rejects out-of-contract costs and identities before store access", () =>
    Effect.gen(function* () {
      const { manager } = makeTestManager();
      const invalidCost = yield* Effect.exit(
        manager.evaluate({ policy: "delivery.anonymous", identity: "source", cost: 101 }),
      );
      const invalidIdentity = yield* Effect.exit(
        manager.evaluate({
          policy: "delivery.anonymous",
          identity: "x".repeat(513),
          cost: 1,
        }),
      );

      assert.strictEqual(invalidCost._tag, "Failure");
      assert.strictEqual(invalidIdentity._tag, "Failure");
    }),
  );
});

describe("MemoryRateLimitStore", () => {
  it.effect("evicts the least-recent opaque entry at its configured cap", () =>
    Effect.gen(function* () {
      const store = makeMemoryRateLimitStore({ maxEntries: 2 });
      const policy: RateLimitPolicyConfiguration = {
        policy: "delivery.anonymous",
        limitPerInterval: 60,
        intervalMs: 60_000,
        capacity: 10,
      };
      yield* store.evaluate({ key: "a", policy, cost: 1 });
      yield* TestClock.adjust("1 millis");
      yield* store.evaluate({ key: "b", policy, cost: 1 });
      yield* TestClock.adjust("1 millis");
      yield* store.evaluate({ key: "c", policy, cost: 1 });

      assert.strictEqual(yield* store.retainedEntryCount, 2);
    }),
  );
});
