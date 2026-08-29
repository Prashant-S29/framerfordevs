import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

import { redactValue } from "../logger";

function durationMilliseconds(span: ReadableSpan) {
  return span.duration[0] * 1_000 + span.duration[1] / 1_000_000;
}

function safeAttributes(span: ReadableSpan) {
  const allowedKeys = ["app.request_id", "http.request.method", "http.route.family"];
  return Object.fromEntries(
    allowedKeys.flatMap((key) => {
      const value = span.attributes[key];
      return value === undefined ? [] : [[key, redactValue(value, key)]];
    }),
  );
}

export class SafeConsoleSpanExporter implements SpanExporter {
  export(spans: Array<ReadableSpan>, resultCallback: (result: { code: ExportResultCode }) => void) {
    for (const span of spans) {
      console.info(
        JSON.stringify({
          type: "trace",
          name: span.name,
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          parentSpanId: span.parentSpanContext?.spanId,
          status: span.status.code,
          durationMs: durationMilliseconds(span),
          attributes: safeAttributes(span),
        }),
      );
    }

    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
