import { assert, describe, expect, it } from "@effect/vitest";

import {
  classifyRoute,
  makeRequestContext,
  normalizeHttpMethod,
  normalizeRequestId,
  parseTraceParent,
} from "./request-context";
import { toStatusFamily } from "./telemetry";

describe("request correlation", () => {
  it("preserves a valid inbound request ID", () => {
    expect(normalizeRequestId("request.valid-123")).toBe("request.valid-123");
  });

  it.each(["", "contains spaces", "x".repeat(129), "line\nbreak"])(
    "replaces an invalid request ID: %s",
    (input) => {
      const generated = normalizeRequestId(input);

      expect(generated).not.toBe(input);
      expect(generated).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    },
  );

  it("uses the first request ID when a header has multiple values", () => {
    expect(normalizeRequestId(["first", "second"])).toBe("first");
  });
});

describe("trace context", () => {
  it("accepts a valid W3C traceparent", () => {
    const parent = parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");

    expect(parent).toMatchObject({
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      traceFlags: 1,
    });
  });

  it.each([
    "invalid",
    "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
    "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01",
    "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-ff",
  ])("safely ignores malformed trace context: %s", (input) => {
    expect(parseTraceParent(input)).toBeNull();
  });
});

describe("bounded HTTP metric dimensions", () => {
  it("normalizes unknown methods and paths to bounded labels", () => {
    assert.strictEqual(normalizeHttpMethod("connect"), "OTHER");
    assert.strictEqual(classifyRoute("/users/arbitrary-id"), "other");
  });

  it("classifies known route families", () => {
    expect([
      classifyRoute("/"),
      classifyRoute("/ready"),
      classifyRoute("/api/auth/get-session"),
      classifyRoute("/rpc/privateData"),
      classifyRoute("/api-reference"),
      classifyRoute("/api/tooling/v1/projects/private-project-id"),
    ]).toEqual(["health", "readiness", "auth", "rpc", "openapi", "tooling"]);
  });

  it("classifies status families", () => {
    expect([199, 200, 302, 404, 503].map(toStatusFamily)).toEqual([
      "1xx",
      "2xx",
      "3xx",
      "4xx",
      "5xx",
    ]);
  });

  it("builds request context without retaining raw headers or paths", () => {
    const context = makeRequestContext({
      requestId: "request-1",
      traceParent: undefined,
      method: "POST",
      path: "/entries/private-resource-id",
    });

    expect(context).toEqual({
      requestId: "request-1",
      traceParent: null,
      method: "POST",
      routeFamily: "other",
    });
    expect(context).not.toHaveProperty("path");
    expect(context).not.toHaveProperty("headers");
  });
});
