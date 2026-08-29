import { describe, expect, it } from "vitest";

import { editorProxySizeBucket, editorProxyStatusFamily } from "./index";

describe("editor proxy telemetry", () => {
  it("uses only closed status and request-size buckets", () => {
    expect([200, 399, 400, 499, 500, 599].map(editorProxyStatusFamily)).toEqual([
      "2xx",
      "2xx",
      "4xx",
      "4xx",
      "5xx",
      "5xx",
    ]);
    expect([0, 1, 16_384, 16_385, 262_144, 262_145, 1_048_576].map(editorProxySizeBucket)).toEqual([
      "none",
      "small",
      "small",
      "medium",
      "medium",
      "large",
      "large",
    ]);
  });
});
