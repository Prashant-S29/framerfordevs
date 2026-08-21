// Owns the dedicated webhook dispatcher, health boundary, and graceful Effect interruption.

import {
  runWebhookWorker,
  webhookWorkerLiveness,
  webhookWorkerReadiness,
} from "@framerfordevs/api/operations/webhook-worker";
import { WebhookTelemetry } from "@framerfordevs/api/observability/webhook-telemetry";
import {
  disposeWebhookWorkerRuntime,
  webhookWorkerRuntime,
} from "@framerfordevs/api/worker-runtime";
import { env } from "@framerfordevs/env/server";
import { Effect } from "effect";

import { createWorkerHealthServer } from "./health";

const controller = new AbortController();
const workerEffect = env.WEBHOOK_WORKER_ENABLED
  ? runWebhookWorker()
  : Effect.gen(function* () {
      while (true) yield* Effect.sleep("1 hour");
    });
const running = webhookWorkerRuntime.runPromise(workerEffect.pipe(Effect.interruptible), {
  signal: controller.signal,
});

const healthServer = createWorkerHealthServer({
  liveness: () => webhookWorkerRuntime.runPromise(webhookWorkerLiveness()),
  readiness: () => webhookWorkerRuntime.runPromise(webhookWorkerReadiness()),
});
healthServer.listen(env.WEBHOOK_WORKER_PORT, "0.0.0.0");

let stopping = false;
function shutdown(signal: NodeJS.Signals | "worker_failure", outcome: "success" | "failure") {
  if (stopping) return;
  stopping = true;
  if (outcome === "failure") process.exitCode = 1;
  controller.abort();
  healthServer.close();
  void running
    .catch(() => undefined)
    .then(() =>
      webhookWorkerRuntime.runPromise(
        Effect.flatMap(WebhookTelemetry, (telemetry) => telemetry.recordGracefulShutdown(outcome)),
      ),
    )
    .catch(() => undefined)
    .then(() => disposeWebhookWorkerRuntime())
    .catch(() => undefined)
    .finally(() => {
      console.log(JSON.stringify({ level: "info", event: "worker.stopped", signal, outcome }));
    });
}

console.log(
  JSON.stringify({
    level: "info",
    event: "worker.started",
    deliveryEnabled: env.WEBHOOK_WORKER_ENABLED,
  }),
);
void running.catch(() => {
  console.error(JSON.stringify({ level: "error", event: "worker.failed" }));
  shutdown("worker_failure", "failure");
});
process.once("SIGINT", (signal) => shutdown(signal, "success"));
process.once("SIGTERM", (signal) => shutdown(signal, "success"));
