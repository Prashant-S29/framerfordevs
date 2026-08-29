import { assert, describe, it } from "@effect/vitest";
import {
  publicationEvent,
  webhookDelivery,
  webhookEndpoint,
  webhookEndpointDestination,
  webhookEndpointSecret,
} from "@framerfordevs/db/schema/webhooks";
import { Effect, Layer } from "effect";

import {
  SecurityServiceFailure,
  WebhookDestinationResolutionFailure,
  WebhookDestinationUnsafeFailure,
} from "../../../contracts/response/errors";
import {
  WebhookTelemetry,
  type WebhookAttemptMetric,
} from "../../../observability/webhook-telemetry";
import { WebhookCrypto } from "../../../services/webhook/crypto";
import {
  makeWebhookDestinationValidator,
  WebhookDestinationValidator,
} from "../../../services/webhook/destination-validator";
import { WebhookTransport } from "../../../services/webhook/transport";
import {
  type ClaimedWebhookAttempt,
  type FinalizeWebhookAttemptInput,
  makeWebhookWorkerRepository,
  WebhookWorkerRepository,
} from "../../../services/webhook/worker-repository";
import { runOneWebhookAttempt } from "./index";

const now = new Date("2026-08-13T12:00:00.000Z");
const ids = {
  workspace: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  endpoint: "019fae8b-1234-7000-8000-000000000004",
  destination: "019fae8b-1234-7000-8000-000000000005",
  event: "019fae8b-1234-7000-8000-000000000006",
  delivery: "019fae8b-1234-7000-8000-000000000007",
  attempt: "019fae8b-1234-7000-8000-000000000008",
  activeSecret: "019fae8b-1234-7000-8000-000000000009",
  retiringSecret: "019fae8b-1234-7000-8000-000000000010",
};

const delivery = {
  id: ids.delivery,
  eventId: ids.event,
  endpointId: ids.endpoint,
  destinationId: ids.destination,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  kind: "initial",
  sourceDeliveryId: null,
  replayCommandId: null,
  replayCommandFingerprint: null,
  replayedByUserId: null,
  status: "delivering",
  attemptCount: 1,
  nextAttemptAt: null,
  leaseToken: "019fae8b-1234-7000-8000-000000000011",
  leaseExpiresAt: new Date(now.getTime() + 30_000),
  completedAt: null,
  lastOutcome: "attempt_started",
  createdAt: new Date(now.getTime() - 2_000),
  updatedAt: now,
} satisfies typeof webhookDelivery.$inferSelect;

const endpoint = {
  id: ids.endpoint,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  name: "Receiver",
  state: "enabled",
  version: 1,
  currentDestinationId: ids.destination,
  enabledAt: new Date(now.getTime() - 60_000),
  disabledAt: null,
  createdByUserId: "worker-test-user",
  changedByUserId: "worker-test-user",
  leaseToken: delivery.leaseToken,
  leaseExpiresAt: delivery.leaseExpiresAt,
  createdAt: new Date(now.getTime() - 60_000),
  updatedAt: now,
} satisfies typeof webhookEndpoint.$inferSelect;

const event = {
  eventId: ids.event,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  eventType: "cms.entry.published",
  envelopeVersion: 1,
  canonicalBody: `{"id":"${ids.event}"}`,
  bodyHash: "a".repeat(64),
  bodyBytes: 45,
  occurredAt: new Date(now.getTime() - 5_000),
  projectedAt: new Date(now.getTime() - 4_000),
} satisfies typeof publicationEvent.$inferSelect;

const destination = {
  id: ids.destination,
  endpointId: ids.endpoint,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  sequence: 1,
  displayOrigin: "https://hooks.example.test",
  encryptionKeyId: "active",
  nonce: "A".repeat(16),
  ciphertext: "A".repeat(22),
  keyedFingerprint: "a".repeat(64),
  createdByUserId: "worker-test-user",
  createdAt: now,
} satisfies typeof webhookEndpointDestination.$inferSelect;

function secret(
  id: string,
  sequence: number,
  state: "active" | "retiring",
): typeof webhookEndpointSecret.$inferSelect {
  return {
    id,
    endpointId: ids.endpoint,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    sequence,
    state,
    encryptionKeyId: "active",
    nonce: "A".repeat(16),
    ciphertext: "A".repeat(22),
    fingerprint: "a".repeat(16),
    activatedAt: new Date(now.getTime() - 60_000),
    retireAt: state === "retiring" ? new Date(now.getTime() + 60_000) : null,
    retiredAt: null,
    createdByUserId: "worker-test-user",
    changedByUserId: "worker-test-user",
    createdAt: now,
    updatedAt: now,
  };
}

function claim(
  secrets: ReadonlyArray<typeof webhookEndpointSecret.$inferSelect>,
  attemptNumber = 1,
): ClaimedWebhookAttempt {
  return {
    leaseToken: delivery.leaseToken,
    leaseExpiresAt: delivery.leaseExpiresAt,
    attemptId: ids.attempt,
    attemptNumber,
    requestTimestamp: Math.floor(now.getTime() / 1_000),
    delivery,
    endpoint,
    event,
    destination,
    secrets,
  };
}

function attemptLayer(options: {
  readonly claim: ClaimedWebhookAttempt | null;
  readonly recovered?: boolean;
  readonly response?: { readonly status: number; readonly retryAfter?: string };
  readonly failure?: "destination" | "dns" | "crypto" | "transport";
  readonly finalized: Array<FinalizeWebhookAttemptInput>;
  readonly metrics: Array<WebhookAttemptMetric>;
  readonly recoveries: Array<boolean>;
  readonly sentHeaders: Array<Readonly<Record<string, string>>>;
}) {
  const repository = makeWebhookWorkerRepository();
  return Layer.mergeAll(
    Layer.succeed(WebhookWorkerRepository, {
      ...repository,
      claimAttempt: () =>
        Effect.succeed({ claim: options.claim, recovered: options.recovered ?? false }),
      finalizeAttempt: (input) => {
        options.finalized.push(input);
        return Effect.succeed(true);
      },
    }),
    Layer.succeed(WebhookCrypto, {
      generateSigningSecret: () => Effect.die("unused"),
      encrypt: () => Effect.die("unused"),
      decrypt: (_value, scope) =>
        options.failure === "crypto"
          ? Effect.fail(
              SecurityServiceFailure.make({
                operation: "webhook.crypto.decrypt",
                cause: "corrupt",
              }),
            )
          : Effect.succeed(
              scope.purpose === "destination"
                ? "https://hooks.example.test/callback"
                : "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            ),
      keyedFingerprint: () => Effect.die("unused"),
      shortFingerprint: () => Effect.die("unused"),
      hasEncryptionKey: () => Effect.succeed(true),
    }),
    Layer.succeed(
      WebhookDestinationValidator,
      options.failure === "destination"
        ? { validate: () => Effect.fail(WebhookDestinationUnsafeFailure.make()) }
        : options.failure === "dns"
          ? { validate: () => Effect.fail(WebhookDestinationResolutionFailure.make()) }
          : makeWebhookDestinationValidator(async () => ["93.184.216.34"]),
    ),
    Layer.succeed(WebhookTransport, {
      send: (request) => {
        options.sentHeaders.push(request.headers);
        return options.failure === "transport"
          ? Effect.fail(
              SecurityServiceFailure.make({
                operation: "webhook.transport.send",
                cause: "connection",
              }),
            )
          : Effect.succeed({
              status: options.response?.status ?? 204,
              retryAfter: options.response?.retryAfter,
            });
      },
    }),
    Layer.succeed(WebhookTelemetry, {
      recordDispatchPoll: () => Effect.void,
      recordProjection: () => Effect.void,
      recordAttempt: (metric) => Effect.sync(() => options.metrics.push(metric)),
      recordLeaseRecovery: () => Effect.sync(() => options.recoveries.push(true)),
      recordGracefulShutdown: () => Effect.void,
    }),
  );
}

function state() {
  return {
    finalized: [] as Array<FinalizeWebhookAttemptInput>,
    metrics: [] as Array<WebhookAttemptMetric>,
    recoveries: [] as Array<boolean>,
    sentHeaders: [] as Array<Readonly<Record<string, string>>>,
  };
}

describe("Webhook attempt orchestration", () => {
  it.effect("returns idle and records stale lease recovery without attempting transport", () => {
    const values = state();
    return Effect.gen(function* () {
      assert.isFalse(yield* runOneWebhookAttempt());
      assert.lengthOf(values.recoveries, 1);
      assert.lengthOf(values.finalized, 0);
    }).pipe(Effect.provide(attemptLayer({ ...values, claim: null, recovered: true })));
  });

  it.effect("sends exact canonical bytes with dual signatures and finalizes 2xx success", () => {
    const values = state();
    return Effect.gen(function* () {
      assert.isTrue(yield* runOneWebhookAttempt());
      assert.deepInclude(values.finalized[0], {
        state: "succeeded",
        outcome: "succeeded",
        httpStatus: 204,
        statusFamily: "2xx",
      });
      assert.strictEqual(
        values.sentHeaders[0]?.["content-length"],
        String(Buffer.byteLength(event.canonicalBody)),
      );
      assert.strictEqual(values.sentHeaders[0]?.["webhook-id"], ids.event);
      assert.lengthOf(values.sentHeaders[0]?.["webhook-signature"]?.split(" ") ?? [], 2);
      assert.strictEqual(values.metrics[0]?.outcome, "succeeded");
    }).pipe(
      Effect.provide(
        attemptLayer({
          ...values,
          claim: claim([
            secret(ids.activeSecret, 2, "active"),
            secret(ids.retiringSecret, 1, "retiring"),
          ]),
        }),
      ),
    );
  });

  it.effect("schedules bounded HTTP and network retries", () => {
    const http = state();
    const network = state();
    return Effect.gen(function* () {
      yield* runOneWebhookAttempt().pipe(
        Effect.provide(
          attemptLayer({
            ...http,
            claim: claim([secret(ids.activeSecret, 1, "active")]),
            response: { status: 503, retryAfter: "120" },
          }),
        ),
      );
      yield* runOneWebhookAttempt().pipe(
        Effect.provide(
          attemptLayer({
            ...network,
            claim: claim([secret(ids.activeSecret, 1, "active")]),
            failure: "transport",
          }),
        ),
      );
      assert.deepInclude(http.finalized[0], {
        state: "retry_scheduled",
        outcome: "retryable_http",
        httpStatus: 503,
        retryAfterSeconds: 120,
      });
      const dns = state();
      yield* runOneWebhookAttempt().pipe(
        Effect.provide(
          attemptLayer({
            ...dns,
            claim: claim([secret(ids.activeSecret, 1, "active")]),
            failure: "dns",
          }),
        ),
      );
      assert.deepInclude(network.finalized[0], {
        state: "retry_scheduled",
        outcome: "retryable_network",
        httpStatus: null,
      });
      assert.deepInclude(dns.finalized[0], {
        state: "retry_scheduled",
        outcome: "retryable_network",
        httpStatus: null,
      });
    });
  });

  it.effect(
    "dead-letters unsafe destinations, crypto configuration failures, and exhausted retries",
    () => {
      const unsafe = state();
      const cryptoFailure = state();
      const exhausted = state();
      return Effect.gen(function* () {
        yield* runOneWebhookAttempt().pipe(
          Effect.provide(
            attemptLayer({
              ...unsafe,
              claim: claim([secret(ids.activeSecret, 1, "active")]),
              failure: "destination",
            }),
          ),
        );
        yield* runOneWebhookAttempt().pipe(
          Effect.provide(
            attemptLayer({
              ...cryptoFailure,
              claim: claim([secret(ids.activeSecret, 1, "active")]),
              failure: "crypto",
            }),
          ),
        );
        yield* runOneWebhookAttempt().pipe(
          Effect.provide(
            attemptLayer({
              ...exhausted,
              claim: claim([secret(ids.activeSecret, 1, "active")], 12),
              failure: "transport",
            }),
          ),
        );
        assert.deepInclude(unsafe.finalized[0], {
          state: "dead_letter",
          outcome: "security_rejected",
        });
        assert.deepInclude(cryptoFailure.finalized[0], {
          state: "dead_letter",
          outcome: "configuration_error",
        });
        assert.deepInclude(exhausted.finalized[0], {
          state: "dead_letter",
          outcome: "retryable_network",
        });
      });
    },
  );

  it.effect("dead-letters permanent and redirect HTTP responses", () => {
    const permanent = state();
    const redirect = state();
    return Effect.gen(function* () {
      yield* runOneWebhookAttempt().pipe(
        Effect.provide(
          attemptLayer({
            ...permanent,
            claim: claim([secret(ids.activeSecret, 1, "active")]),
            response: { status: 400 },
          }),
        ),
      );
      yield* runOneWebhookAttempt().pipe(
        Effect.provide(
          attemptLayer({
            ...redirect,
            claim: claim([secret(ids.activeSecret, 1, "active")]),
            response: { status: 302 },
          }),
        ),
      );
      assert.deepInclude(permanent.finalized[0], {
        state: "dead_letter",
        outcome: "permanent_http",
      });
      assert.deepInclude(redirect.finalized[0], {
        state: "dead_letter",
        outcome: "redirect_rejected",
      });
    });
  });
});
