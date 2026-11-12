import { describe, expect, it } from "vitest";

import { StudioContentClientError } from "../../../content-client";
import {
  contentErrorMessage,
  contentRetryDelay,
  normalizeStudioSearch,
  retryContentQuery,
} from ".";

function failure(code: string, status: number, retryable = false): StudioContentClientError {
  return new StudioContentClientError({
    code,
    status,
    message: "Bounded failure.",
    retryable,
  });
}

describe("Studio content data policy", () => {
  it("normalizes bounded in-memory search text without control characters", () => {
    expect(normalizeStudioSearch("  cafe\u0301\u0000\n  ")).toBe("café");
    expect(normalizeStudioSearch("x".repeat(120))).toHaveLength(100);
  });

  it("uses deterministic bounded retry delays and retries only transient failures", () => {
    expect([0, 1, 2, 3, 4].map(contentRetryDelay)).toEqual([267, 570, 1022, 2000, 2000]);
    expect(retryContentQuery(0, failure("SERVICE_UNAVAILABLE", 503))).toBe(true);
    expect(retryContentQuery(0, failure("STUDIO_UPSTREAM_UNAVAILABLE", 0, true))).toBe(true);
    expect(retryContentQuery(2, failure("SERVICE_UNAVAILABLE", 503))).toBe(false);
    expect(retryContentQuery(0, failure("DRAFT_VERSION_CONFLICT", 409))).toBe(false);
  });

  it("maps finite protocol failure codes to safe actionable messages", () => {
    expect(contentErrorMessage(failure("DRAFT_VERSION_CONFLICT", 409))).toContain(
      "draft changed elsewhere",
    );
    expect(contentErrorMessage(failure("STALE_SCHEMA", 409))).toContain("content model changed");
    expect(contentErrorMessage(failure("RATE_LIMITED", 429))).toContain("temporarily busy");
    expect(contentErrorMessage(failure("NOT_FOUND", 404))).not.toContain("not found");
    expect(contentErrorMessage(failure("INTERNAL_ERROR", 500))).toBe(
      "Studio could not load content. Try again.",
    );
  });
});
