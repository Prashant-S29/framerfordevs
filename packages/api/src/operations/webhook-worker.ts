// Defines bounded dispatcher polling through the worker-owned Effect runtime.

import { Clock, Effect } from "effect";

import { SecurityServiceFailure } from "../contracts/errors";
import { WebhookTelemetry } from "../observability/webhook-telemetry";
import { WebhookCrypto } from "../services/webhook-crypto";
import { WebhookWorkerRepository } from "../services/webhook-worker-repository";
import { runOneWebhookAttempt } from "./webhook-attempt";

export const dispatchWebhookOutboxBatch = Effect.fn("webhook.worker.dispatch_batch")(function* () {
  const now = new Date(yield* Clock.currentTimeMillis);
  const telemetry = yield* WebhookTelemetry;
  const result = yield* (yield* WebhookWorkerRepository)
    .dispatchBatch(now, 100)
    .pipe(
      Effect.tapError((error) =>
        Effect.all(
          [
            telemetry.recordProjection(
              error._tag === "WebhookEventInvalidFailure" ? "invalid" : "failure",
            ),
            telemetry.recordDispatchPoll("failure"),
          ],
          { discard: true },
        ),
      ),
    );
  yield* telemetry.recordDispatchPoll(result.claimed > 0 ? "work" : "idle");
  if (result.projected > 0) yield* telemetry.recordProjection("success");
  if (result.invalid > 0) yield* telemetry.recordProjection("invalid");
  return result;
});

/** Polls until interruption while backing off when no due outbox work exists. */
export const runWebhookDispatcher = Effect.fn("webhook.worker.dispatcher")(function* () {
  while (true) {
    const result = yield* dispatchWebhookOutboxBatch();
    yield* Effect.sleep(result.claimed > 0 ? "250 millis" : "2 seconds");
  }
});

export const runWebhookAttemptLoop = Effect.fn("webhook.worker.attempt_loop")(function* () {
  while (true) {
    const claimed = yield* runOneWebhookAttempt();
    if (claimed) yield* Effect.yieldNow();
    else yield* Effect.sleep("500 millis");
  }
});

export const webhookWorkerAttemptConcurrency = 32;

export const webhookWorkerLiveness = Effect.fn("webhook.worker.liveness")(() =>
  Effect.succeed({ status: "ok" as const }),
);

export const webhookWorkerReadiness = Effect.fn("webhook.worker.readiness")(function* () {
  const repository = yield* WebhookWorkerRepository;
  const crypto = yield* WebhookCrypto;
  yield* repository.pendingCount();
  const keyIds = yield* repository.referencedEncryptionKeyIds();
  const available = yield* Effect.forEach(keyIds, (keyId) => crypto.hasEncryptionKey(keyId));
  if (available.some((value) => !value)) {
    return yield* Effect.fail(
      SecurityServiceFailure.make({ operation: "webhook.worker.readiness", cause: "missing_key" }),
    );
  }
  return { status: "ready" as const };
});

export const runWebhookWorker = Effect.fn("webhook.worker.run")(function* () {
  const attempts = Array.from({ length: webhookWorkerAttemptConcurrency }, () =>
    runWebhookAttemptLoop(),
  );
  yield* Effect.all([runWebhookDispatcher(), ...attempts], {
    concurrency: "unbounded",
    discard: true,
  });
});
