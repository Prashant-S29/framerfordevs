import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { assert, beforeEach, describe, layer } from "@effect/vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect } from "effect";

import { decodeAuthoringSchemaPlanRequest } from "../operations/authoring-public";
import { withRequestSpan } from "../runtime";
import { RequestContext, TraceParent } from "./request-context";

const exporter = new InMemorySpanExporter();
const TracingTest = NodeSdk.layer(() => ({
  resource: { serviceName: "api-tracing-test" },
  spanProcessor: new SimpleSpanProcessor(exporter),
}));

beforeEach(() => {
  exporter.reset();
});

describe("OpenTelemetry trace propagation", () => {
  layer(TracingTest)((it) => {
    it.effect("continues a valid inbound trace and creates a named operation span", () => {
      const request = RequestContext.make({
        requestId: "request-trace-1",
        method: "POST",
        routeFamily: "rpc",
        traceParent: TraceParent.make({
          traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
          spanId: "00f067aa0ba902b7",
          traceFlags: 1,
        }),
      });

      return Effect.gen(function* () {
        yield* withRequestSpan(Effect.void, request, "api.trace-test");

        const spans = exporter.getFinishedSpans();
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.isDefined(span);
        if (!span) return;
        assert.strictEqual(span.name, "api.trace-test");
        assert.strictEqual(span.spanContext().traceId, request.traceParent?.traceId);
        assert.strictEqual(span.parentSpanContext?.spanId, request.traceParent?.spanId);
        assert.strictEqual(span.attributes["app.request_id"], request.requestId);
      });
    });

    it.effect("keeps rejected Authoring schema input out of trace data", () => {
      const sentinel = "must-not-enter-authoring-traces";

      return Effect.gen(function* () {
        yield* Effect.exit(
          decodeAuthoringSchemaPlanRequest({
            token: sentinel,
            project: { collections: [{ sourceKey: sentinel, apiKey: sentinel }] },
          }),
        );

        const spans = exporter.getFinishedSpans();
        const decodeSpan = spans.find((span) => span.name === "authoring.public.input.decode");
        assert.isDefined(decodeSpan);
        const encoded = JSON.stringify({
          attributes: decodeSpan?.attributes,
          status: decodeSpan?.status,
          events: decodeSpan?.events.map((event) => ({
            name: event.name,
            attributes: event.attributes,
          })),
        });
        assert.notInclude(encoded, sentinel);
      });
    });

    it.effect("starts a safe new trace when inbound context is absent", () => {
      const request = RequestContext.make({
        requestId: "request-trace-2",
        method: "GET",
        routeFamily: "health",
        traceParent: null,
      });

      return Effect.gen(function* () {
        yield* withRequestSpan(Effect.void, request, "api.new-trace");

        const span = exporter.getFinishedSpans()[0];
        assert.isDefined(span);
        if (!span) return;
        assert.match(span.spanContext().traceId, /^[0-9a-f]{32}$/);
        assert.isUndefined(span.parentSpanContext);
      });
    });
  });
});
