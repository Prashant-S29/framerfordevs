// Executes one claimed webhook attempt outside database transactions and finalizes by lease token.

import { Cause, Clock, Effect, Exit, Option, Random } from "effect";

import type { WebhookPublicEventType } from "../../../contracts/webhook";
import { normalizeWebhookDestination } from "../../../lib/webhook/destination";
import {
  classifyWebhookHttpStatus,
  parseWebhookRetryAfter,
  scheduleWebhookRetry,
} from "../../../lib/webhook/retry";
import { signWebhookRequest } from "../../../lib/webhook/signature";
import {
  WebhookTelemetry,
  webhookQueueAgeBucket,
  webhookRetryDelayBucket,
} from "../../../observability/webhook-telemetry";
import { WebhookCrypto } from "../../../services/webhook/crypto";
import { WebhookDestinationValidator } from "../../../services/webhook/destination-validator";
import { WebhookTransport } from "../../../services/webhook/transport";
import { WebhookWorkerRepository } from "../../../services/webhook/worker-repository";

function statusFamily(status: number): "1xx" | "2xx" | "3xx" | "4xx" | "5xx" {
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}

function deliveryKind(value: string): "initial" | "replay" {
  if (value === "initial" || value === "replay") return value;
  throw new Error("A claimed webhook delivery has an unsupported kind.");
}

function publicEventType(value: string): WebhookPublicEventType {
  switch (value) {
    case "cms.schema.published":
    case "cms.entry.published":
    case "cms.entry.unpublished":
      return value;
    default:
      throw new Error("A claimed webhook delivery has an unsupported event type.");
  }
}

export const runOneWebhookAttempt = Effect.fn("webhook.worker.attempt")(function* () {
  const repository = yield* WebhookWorkerRepository;
  const crypto = yield* WebhookCrypto;
  const validator = yield* WebhookDestinationValidator;
  const transport = yield* WebhookTransport;
  const telemetry = yield* WebhookTelemetry;
  const startedAt = new Date(yield* Clock.currentTimeMillis);
  const claimed = yield* repository.claimAttempt(startedAt);
  if (claimed.recovered) yield* telemetry.recordLeaseRecovery();
  const claim = claimed.claim;
  if (claim === null) return false;
  const eventType = publicEventType(claim.event.eventType);
  const kind = deliveryKind(claim.delivery.kind);
  const queueAge = webhookQueueAgeBucket(startedAt.getTime() - claim.delivery.createdAt.getTime());

  const sendExit = yield* Effect.exit(
    Effect.gen(function* () {
      const destinationScope = {
        workspaceId: claim.delivery.workspaceId,
        projectId: claim.delivery.projectId,
        environmentId: claim.delivery.environmentId,
        endpointId: claim.endpoint.id,
        resourceId: claim.destination.id,
        purpose: "destination" as const,
      };
      const destinationUrl = yield* crypto.decrypt(claim.destination, destinationScope);
      const normalized = normalizeWebhookDestination(destinationUrl);
      if (!normalized.ok) return yield* Effect.fail(new Error("Destination policy rejected."));
      const validated = yield* validator.validate(destinationUrl);
      const secretValues = yield* Effect.forEach(claim.secrets, (secret) => {
        if (secret.nonce === null || secret.ciphertext === null) {
          throw new Error("Active webhook secret material is missing.");
        }
        return crypto.decrypt(
          {
            encryptionKeyId: secret.encryptionKeyId,
            nonce: secret.nonce,
            ciphertext: secret.ciphertext,
          },
          {
            workspaceId: claim.delivery.workspaceId,
            projectId: claim.delivery.projectId,
            environmentId: claim.delivery.environmentId,
            endpointId: claim.endpoint.id,
            resourceId: secret.id,
            purpose: "signing_secret",
          },
        );
      });
      const address = validated.addresses[0];
      if (address === undefined)
        return yield* Effect.fail(new Error("Destination has no address."));
      const body = Buffer.from(claim.event.canonicalBody, "utf8");
      const signatures = secretValues.map((secret) =>
        signWebhookRequest(secret, claim.event.eventId, claim.requestTimestamp, body),
      );
      return yield* transport.send({
        url: destinationUrl,
        hostname: validated.hostname,
        address,
        body,
        connectTimeoutMs: 3_000,
        timeoutMs: 10_000,
        headers: {
          "content-type": "application/cloudevents+json; charset=utf-8",
          "content-length": String(body.byteLength),
          "user-agent": "FramerForDevs-Webhooks/1",
          "webhook-id": claim.event.eventId,
          "webhook-timestamp": String(claim.requestTimestamp),
          "webhook-signature": signatures.join(" "),
          "webhook-delivery-id": claim.delivery.id,
          "webhook-attempt-id": claim.attemptId,
          "webhook-attempt-number": String(claim.attemptNumber),
          "webhook-replay": String(claim.delivery.kind === "replay"),
        },
      });
    }),
  );

  const completedAt = new Date(yield* Clock.currentTimeMillis);
  if (Exit.isFailure(sendExit)) {
    const failure = Option.getOrUndefined(Cause.failureOption(sendExit.cause));
    const operation =
      typeof failure === "object" &&
      failure !== null &&
      "operation" in failure &&
      typeof failure.operation === "string"
        ? failure.operation
        : "";
    const outcome =
      typeof failure === "object" && failure !== null && "_tag" in failure
        ? failure._tag === "WebhookDestinationUnsafeFailure"
          ? "security_rejected"
          : failure._tag === "WebhookDestinationResolutionFailure" ||
              operation === "webhook.transport.send"
            ? "retryable_network"
            : operation.startsWith("webhook.crypto")
              ? "configuration_error"
              : "internal_error"
        : "internal_error";
    const entropy = yield* Random.next;
    const retryDelay =
      outcome === "retryable_network"
        ? scheduleWebhookRetry({ attemptNumber: claim.attemptNumber, entropy })
        : null;
    const durationMs = completedAt.getTime() - startedAt.getTime();
    yield* repository.finalizeAttempt({
      deliveryId: claim.delivery.id,
      endpointId: claim.endpoint.id,
      attemptId: claim.attemptId,
      leaseToken: claim.leaseToken,
      state: retryDelay === null ? "dead_letter" : "retry_scheduled",
      outcome,
      completedAt,
      durationMs,
      httpStatus: null,
      statusFamily: null,
      retryAfterSeconds: null,
      nextAttemptAt:
        retryDelay === null ? null : new Date(completedAt.getTime() + retryDelay * 1_000),
    });
    yield* telemetry.recordAttempt({
      eventType,
      kind,
      outcome,
      statusFamily: "none",
      durationMs,
      queueAge,
      retryDelay: webhookRetryDelayBucket(retryDelay),
    });
    return true;
  }

  const response = sendExit.value;
  const classification = classifyWebhookHttpStatus(response.status);
  const retryAfterSeconds =
    response.status === 429 || response.status === 503
      ? parseWebhookRetryAfter(response.retryAfter, completedAt.getTime())
      : null;
  const entropy = yield* Random.next;
  const retryDelay = classification.retryable
    ? scheduleWebhookRetry({ attemptNumber: claim.attemptNumber, entropy, retryAfterSeconds })
    : null;
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const responseStatusFamily = statusFamily(response.status);
  yield* repository.finalizeAttempt({
    deliveryId: claim.delivery.id,
    endpointId: claim.endpoint.id,
    attemptId: claim.attemptId,
    leaseToken: claim.leaseToken,
    state:
      classification.outcome === "succeeded"
        ? "succeeded"
        : retryDelay === null
          ? "dead_letter"
          : "retry_scheduled",
    outcome: classification.outcome,
    completedAt,
    durationMs,
    httpStatus: response.status,
    statusFamily: responseStatusFamily,
    retryAfterSeconds,
    nextAttemptAt:
      retryDelay === null ? null : new Date(completedAt.getTime() + retryDelay * 1_000),
  });
  yield* telemetry.recordAttempt({
    eventType,
    kind,
    outcome: classification.outcome,
    statusFamily: responseStatusFamily,
    durationMs,
    queueAge,
    retryDelay: webhookRetryDelayBucket(retryDelay),
  });
  return true;
});
