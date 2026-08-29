// Records only closed, low-cardinality M11 worker metrics; resource identities never become labels.

import { Context, Effect, Layer, Metric, MetricBoundaries } from "effect";

import type { WebhookPublicEventType } from "../../contracts/webhook";
import type { WebhookAttemptOutcome } from "../../lib/webhook/retry";

export type WebhookStatusFamily = "none" | "1xx" | "2xx" | "3xx" | "4xx" | "5xx";
export type WebhookQueueAgeBucket = "under_1s" | "1s_10s" | "10s_1m" | "1m_10m" | "over_10m";
export type WebhookRetryDelayBucket =
  | "none"
  | "under_1m"
  | "1m_10m"
  | "10m_1h"
  | "1h_6h"
  | "over_6h";

export interface WebhookAttemptMetric {
  readonly eventType: WebhookPublicEventType;
  readonly kind: "initial" | "replay";
  readonly outcome: WebhookAttemptOutcome;
  readonly statusFamily: WebhookStatusFamily;
  readonly durationMs: number;
  readonly queueAge: WebhookQueueAgeBucket;
  readonly retryDelay: WebhookRetryDelayBucket;
}

export interface WebhookTelemetryService {
  readonly recordDispatchPoll: (result: "work" | "idle" | "failure") => Effect.Effect<void>;
  readonly recordProjection: (outcome: "success" | "invalid" | "failure") => Effect.Effect<void>;
  readonly recordAttempt: (event: WebhookAttemptMetric) => Effect.Effect<void>;
  readonly recordLeaseRecovery: () => Effect.Effect<void>;
  readonly recordGracefulShutdown: (outcome: "success" | "failure") => Effect.Effect<void>;
}

const pollCount = Metric.counter("webhook_worker_polls_total", {
  description: "Webhook worker poll outcomes",
  incremental: true,
});
const projectionCount = Metric.counter("webhook_event_projections_total", {
  description: "Canonical webhook event projection outcomes",
  incremental: true,
});
const attemptCount = Metric.counter("webhook_delivery_attempts_total", {
  description: "Webhook attempts by bounded event, delivery kind, outcome, and status family",
  incremental: true,
});
const attemptDuration = Metric.histogram(
  "webhook_delivery_attempt_duration_ms",
  MetricBoundaries.exponential({ start: 1, factor: 2, count: 16 }),
  "Webhook attempt duration in milliseconds",
);
const retryCount = Metric.counter("webhook_delivery_retries_total", {
  description: "Webhook retries by bounded delay bucket",
  incremental: true,
});
const deadLetterCount = Metric.counter("webhook_delivery_dead_letters_total", {
  description: "Webhook dead letters by bounded event type and reason",
  incremental: true,
});
const leaseRecoveryCount = Metric.counter("webhook_delivery_lease_recoveries_total", {
  description: "Expired webhook delivery leases recovered",
  incremental: true,
});
const shutdownCount = Metric.counter("webhook_worker_shutdowns_total", {
  description: "Webhook worker graceful shutdown outcomes",
  incremental: true,
});

function attemptLabels<Type, In, Out>(
  metric: Metric.Metric<Type, In, Out>,
  event: WebhookAttemptMetric,
): Metric.Metric<Type, In, Out> {
  return Metric.tagged(
    Metric.tagged(
      Metric.tagged(
        Metric.tagged(Metric.tagged(metric, "event_type", event.eventType), "kind", event.kind),
        "outcome",
        event.outcome,
      ),
      "status_family",
      event.statusFamily,
    ),
    "queue_age",
    event.queueAge,
  );
}

export function webhookQueueAgeBucket(milliseconds: number): WebhookQueueAgeBucket {
  if (milliseconds < 1_000) return "under_1s";
  if (milliseconds < 10_000) return "1s_10s";
  if (milliseconds < 60_000) return "10s_1m";
  if (milliseconds < 600_000) return "1m_10m";
  return "over_10m";
}

export function webhookRetryDelayBucket(seconds: number | null): WebhookRetryDelayBucket {
  if (seconds === null) return "none";
  if (seconds < 60) return "under_1m";
  if (seconds < 600) return "1m_10m";
  if (seconds < 3_600) return "10m_1h";
  if (seconds <= 21_600) return "1h_6h";
  return "over_6h";
}

export class WebhookTelemetry extends Context.Tag("WebhookTelemetry")<
  WebhookTelemetry,
  WebhookTelemetryService
>() {}

export const WebhookTelemetryLive = Layer.succeed(WebhookTelemetry, {
  recordDispatchPoll: (result) => Metric.update(Metric.tagged(pollCount, "result", result), 1),
  recordProjection: (outcome) =>
    Metric.update(Metric.tagged(projectionCount, "outcome", outcome), 1),
  recordAttempt: (event) => {
    const effects = [
      Metric.update(attemptLabels(attemptCount, event), 1),
      Metric.update(attemptLabels(attemptDuration, event), event.durationMs),
    ];
    if (event.retryDelay !== "none") {
      effects.push(
        Metric.update(
          Metric.tagged(
            Metric.tagged(retryCount, "event_type", event.eventType),
            "delay",
            event.retryDelay,
          ),
          1,
        ),
      );
    }
    if (event.outcome !== "succeeded" && event.retryDelay === "none") {
      effects.push(
        Metric.update(
          Metric.tagged(
            Metric.tagged(deadLetterCount, "event_type", event.eventType),
            "reason",
            event.outcome,
          ),
          1,
        ),
      );
    }
    return Effect.all(effects, { discard: true });
  },
  recordLeaseRecovery: () => Metric.update(leaseRecoveryCount, 1),
  recordGracefulShutdown: (outcome) =>
    Metric.update(Metric.tagged(shutdownCount, "outcome", outcome), 1),
});
