import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import { ForbiddenFailure } from "../contracts/errors";
import { RateLimitCost, RateLimitDecision } from "../contracts/rate-limit";
import {
  CreateWebhookEndpointInput,
  ReplayWebhookEventInput,
  UpdateWebhookEndpointInput,
} from "../contracts/webhooks";
import { makeWebhookCrypto, WebhookCrypto } from "../services/webhook-crypto";
import { WebhookDestinationValidator } from "../services/webhook-destination-validator";
import { RateLimitManager } from "../services/rate-limit-manager";
import { makeWebhookRepository, WebhookRepository } from "../services/webhook-repository";
import { createWebhookEndpoint, replayWebhookEvent, updateWebhookEndpoint } from "./webhooks";

let destinationValidationCalls = 0;
const repository = makeWebhookRepository();
const OperationTest = Layer.mergeAll(
  Layer.succeed(WebhookRepository, {
    ...repository,
    resolveManagementScope: () => Effect.fail(ForbiddenFailure.make()),
  }),
  Layer.succeed(
    WebhookCrypto,
    makeWebhookCrypto({
      activeKeyId: "active",
      keys: { active: Buffer.alloc(32, 4).toString("base64url") },
    }),
  ),
  Layer.succeed(WebhookDestinationValidator, {
    validate: () => {
      destinationValidationCalls += 1;
      return Effect.die("Unauthorized destination validation must not run.");
    },
  }),
);

let replayRepositoryCalls = 0;
const ReplayRateLimitTest = Layer.merge(
  Layer.succeed(WebhookRepository, {
    ...repository,
    replayEvent: () => {
      replayRepositoryCalls += 1;
      return Effect.die("A limited replay must not reach persistence.");
    },
  }),
  Layer.succeed(RateLimitManager, {
    evaluate: () =>
      Effect.succeed(
        RateLimitDecision.make({
          allowed: false,
          policy: "webhook.replay.user",
          cost: RateLimitCost.make(1),
          limit: 30,
          remaining: 0,
          resetAtEpochMs: 60_000,
          retryAfterSeconds: 60,
          enforcementMode: "memory",
        }),
      ),
    reset: () => Effect.void,
    retainedFallbackEntryCount: Effect.succeed(0),
  }),
);

describe("Webhook management operations", () => {
  layer(OperationTest)((it) => {
    it.effect("authorizes endpoint creation before performing external DNS validation", () =>
      Effect.gen(function* () {
        destinationValidationCalls = 0;
        const input = Schema.decodeUnknownSync(CreateWebhookEndpointInput)({
          projectId: "019fae8b-1234-7000-8000-000000000001",
          environmentId: "019fae8b-1234-7000-8000-000000000002",
          name: "Receiver",
          destination: "https://hooks.example.test/private",
          subscriptions: ["cms.entry.published"],
          authorityAcknowledged: true,
        });
        const failure = yield* Effect.flip(
          createWebhookEndpoint("operation-test-user", input, "webhook.test.create"),
        );
        assert.strictEqual(failure._tag, "ForbiddenFailure");
        assert.strictEqual(destinationValidationCalls, 0);
      }),
    );

    it.effect("authorizes destination replacement before performing external DNS validation", () =>
      Effect.gen(function* () {
        destinationValidationCalls = 0;
        const input = Schema.decodeUnknownSync(UpdateWebhookEndpointInput)({
          projectId: "019fae8b-1234-7000-8000-000000000001",
          environmentId: "019fae8b-1234-7000-8000-000000000002",
          endpointId: "019fae8b-1234-7000-8000-000000000003",
          expectedVersion: 1,
          name: "Receiver",
          destination: "https://hooks.example.test/replacement",
        });
        const failure = yield* Effect.flip(
          updateWebhookEndpoint("operation-test-user", input, "webhook.test.update"),
        );
        assert.strictEqual(failure._tag, "ForbiddenFailure");
        assert.strictEqual(destinationValidationCalls, 0);
      }),
    );
  });

  layer(ReplayRateLimitTest)((it) => {
    it.effect("rate-limits manual replay before persistence", () =>
      Effect.gen(function* () {
        replayRepositoryCalls = 0;
        const input = Schema.decodeUnknownSync(ReplayWebhookEventInput)({
          projectId: "019fae8b-1234-7000-8000-000000000001",
          environmentId: "019fae8b-1234-7000-8000-000000000002",
          endpointId: "019fae8b-1234-7000-8000-000000000003",
          eventId: "019fae8b-1234-7000-8000-000000000004",
          sourceDeliveryId: null,
          commandId: "019fae8b-1234-7000-8000-000000000005",
        });
        const failure = yield* Effect.flip(
          replayWebhookEvent("operation-test-user", input, "webhook.test.replay"),
        );
        assert.strictEqual(failure._tag, "RateLimitedFailure");
        assert.strictEqual(replayRepositoryCalls, 0);
      }),
    );
  });
});
