import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalizePublicArtifact, generatePublicArtifacts } from "./artifacts";
import {
  publicContractRegistry,
  publicContractRegistryKeys,
  publicContractFamilies,
} from "./registry";

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

describe("closed public contract registry", () => {
  it("contains exactly the four approved v1 families", () => {
    expect(publicContractRegistryKeys).toEqual([
      "delivery/v1",
      "preview/v1",
      "tooling/v1",
      "webhooks/v1",
    ]);
    expect(publicContractFamilies).toEqual(["delivery", "preview", "tooling", "webhooks"]);
    expect(Object.keys(publicContractRegistry)).toEqual([...publicContractRegistryKeys]);
    expect(Object.values(publicContractRegistry).map((entry) => entry.kind)).toEqual([
      "openapi",
      "openapi",
      "openapi",
      "json-schema",
    ]);
  });

  it("generates byte-stable artifacts with the declared baseline digests", () => {
    const first = generatePublicArtifacts();
    const second = generatePublicArtifacts();

    expect(second).toEqual(first);
    for (const artifact of first) {
      expect(artifact.bytes.endsWith("\n")).toBe(true);
      expect(sha256(artifact.bytes)).toBe(artifact.digest);
      expect(publicContractRegistry[artifact.key].baselineDigest).toBe(artifact.digest);
    }
  });

  it("contains no internal dashboard, auth, operator, or health surfaces", () => {
    const bytes = generatePublicArtifacts()
      .map((artifact) => artifact.bytes)
      .join("\n")
      .toLowerCase();

    expect(bytes).not.toContain('"/rpc');
    expect(bytes).not.toContain("platform.workspaces");
    expect(bytes).not.toContain("better auth");
    expect(bytes).not.toContain('"/metrics');
    expect(bytes).not.toContain('"/ready');
  });

  it("rejects duplicate operation IDs, external references, and non-finite values", () => {
    expect(() =>
      canonicalizePublicArtifact("openapi", {
        openapi: "3.1.0",
        paths: {
          "/one": { get: { operationId: "duplicate" } },
          "/two": { get: { operationId: "duplicate" } },
        },
      }),
    ).toThrow("duplicate operationId");

    expect(() =>
      canonicalizePublicArtifact("json-schema", {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $ref: "https://untrusted.example/schema.json",
      }),
    ).toThrow("unresolved or external reference");

    expect(() =>
      canonicalizePublicArtifact("json-schema", {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        maximum: Number.POSITIVE_INFINITY,
      }),
    ).toThrow("non-finite");
  });
});
