// Records closed local-editor proxy metrics without retaining request bodies or hosted authority.

import { Effect, Metric, MetricBoundaries } from "effect";

import type { EditorOperationRequest } from "./editor-protocol";

export type EditorProxyOperation = EditorOperationRequest["operation"];
export type EditorProxyOutcome = "success" | "rejected" | "upstream_failure" | "failure";
export type EditorProxyStatusFamily = "2xx" | "4xx" | "5xx";
export type EditorProxySizeBucket = "none" | "small" | "medium" | "large";

export interface EditorProxyMetric {
  readonly operation: EditorProxyOperation;
  readonly mutation: boolean;
  readonly outcome: EditorProxyOutcome;
  readonly statusFamily: EditorProxyStatusFamily;
  readonly requestSizeBucket: EditorProxySizeBucket;
  readonly durationMs: number;
}

const proxyCount = Metric.counter("editor_proxy_operations_total", {
  description: "Local-editor proxy outcomes by closed operation and status family",
  incremental: true,
});

const proxyLatency = Metric.histogram(
  "editor_proxy_operation_duration_ms",
  MetricBoundaries.exponential({ start: 1, factor: 2, count: 14 }),
  "Local-editor proxy duration by closed operation and outcome",
);

const proxyRequestSize = Metric.counter("editor_proxy_request_sizes_total", {
  description: "Local-editor proxy request size buckets by closed operation",
  incremental: true,
});

export function editorProxyStatusFamily(status: number): EditorProxyStatusFamily {
  if (status < 400) return "2xx";
  if (status < 500) return "4xx";
  return "5xx";
}

export function editorProxySizeBucket(bytes: number): EditorProxySizeBucket {
  if (bytes <= 0) return "none";
  if (bytes <= 16 * 1_024) return "small";
  if (bytes <= 256 * 1_024) return "medium";
  return "large";
}

export const recordEditorProxyMetric = Effect.fn("cli.editor.proxy.observe")(function* (
  event: EditorProxyMetric,
) {
  const count = Metric.tagged(
    Metric.tagged(
      Metric.tagged(
        Metric.tagged(proxyCount, "operation", event.operation),
        "mutation",
        event.mutation ? "true" : "false",
      ),
      "outcome",
      event.outcome,
    ),
    "status_family",
    event.statusFamily,
  );
  const latency = Metric.tagged(
    Metric.tagged(proxyLatency, "operation", event.operation),
    "outcome",
    event.outcome,
  );
  const size = Metric.tagged(
    Metric.tagged(proxyRequestSize, "operation", event.operation),
    "request_size",
    event.requestSizeBucket,
  );
  yield* Effect.all([
    Metric.update(count, 1),
    Metric.update(latency, event.durationMs),
    Metric.update(size, 1),
  ]).pipe(Effect.asVoid);
});
