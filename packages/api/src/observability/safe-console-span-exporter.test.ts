import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { expect, it, vi } from "@effect/vitest";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect, ManagedRuntime } from "effect";

import { SafeConsoleSpanExporter } from "./safe-console-span-exporter";

it("exports bounded trace summaries without arbitrary span attributes", async () => {
  const output: Array<string> = [];
  const consoleInfo = vi.spyOn(console, "info").mockImplementation((value) => {
    if (typeof value === "string") output.push(value);
  });
  const runtime = ManagedRuntime.make(
    NodeSdk.layer(() => ({
      resource: { serviceName: "safe-console-exporter-test" },
      spanProcessor: new SimpleSpanProcessor(new SafeConsoleSpanExporter()),
    })),
  );

  try {
    await runtime.runPromise(
      Effect.void.pipe(
        Effect.withSpan("safe.trace", {
          attributes: {
            "app.request_id": "request-1",
            "http.request.method": "GET",
            "private.payload": "must-not-be-exported",
          },
        }),
      ),
    );
  } finally {
    await runtime.dispose();
    consoleInfo.mockRestore();
  }

  expect(output).toHaveLength(1);
  expect(output[0]).toContain('"type":"trace"');
  expect(output[0]).toContain('"name":"safe.trace"');
  expect(output[0]).toContain('"app.request_id":"request-1"');
  expect(output[0]).not.toContain("must-not-be-exported");
  expect(output[0]).not.toContain("private.payload");
});
