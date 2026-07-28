import { Context, Effect, Layer, Metric, MetricBoundaries, Schema } from "effect";

import type { HttpMethod, RouteFamily } from "./request-context";

export const StatusFamilySchema = Schema.Literal("1xx", "2xx", "3xx", "4xx", "5xx");
export type StatusFamily = typeof StatusFamilySchema.Type;

export const OperationOutcomeSchema = Schema.Literal("success", "failure", "defect", "interrupted");
export type OperationOutcome = typeof OperationOutcomeSchema.Type;

export interface HttpRequestMetric {
  readonly method: HttpMethod;
  readonly routeFamily: RouteFamily;
  readonly statusFamily: StatusFamily;
  readonly durationMs: number;
}

const requestCount = Metric.counter("http_requests_total", {
  description: "Total inbound HTTP requests",
  incremental: true,
});

const requestLatency = Metric.histogram(
  "http_request_duration_ms",
  MetricBoundaries.exponential({ start: 1, factor: 2, count: 16 }),
  "Inbound HTTP request duration in milliseconds",
);

const defectCount = Metric.counter("application_unhandled_defects_total", {
  description: "Unhandled application defects",
  incremental: true,
});

function withRequestLabels<Type, In, Out>(
  metric: Metric.Metric<Type, In, Out>,
  event: HttpRequestMetric,
): Metric.Metric<Type, In, Out> {
  return Metric.tagged(
    Metric.tagged(Metric.tagged(metric, "method", event.method), "route", event.routeFamily),
    "status_family",
    event.statusFamily,
  );
}

export class Telemetry extends Context.Tag("Telemetry")<
  Telemetry,
  {
    readonly recordHttpRequest: (event: HttpRequestMetric) => Effect.Effect<void>;
    readonly recordDefect: (routeFamily: RouteFamily) => Effect.Effect<void>;
  }
>() {}

export const TelemetryLive = Layer.succeed(Telemetry, {
  recordHttpRequest: (event) =>
    Effect.all([
      Metric.update(withRequestLabels(requestCount, event), 1),
      Metric.update(withRequestLabels(requestLatency, event), event.durationMs),
    ]).pipe(Effect.asVoid),
  recordDefect: (routeFamily) => Metric.update(Metric.tagged(defectCount, "route", routeFamily), 1),
});

export function toStatusFamily(status: number): StatusFamily {
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}
