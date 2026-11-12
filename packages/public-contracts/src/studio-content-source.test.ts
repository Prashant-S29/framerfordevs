import { createHash } from "node:crypto";

import { studioContentOpenApiDocument } from "@framerfordevs/api/contracts/studio-content/openapi";
import { studioContentV2OpenApiDocument } from "@framerfordevs/api/contracts/studio-content/openapi/v2";
import { describe, expect, it } from "vitest";

import { canonicalizePublicArtifact, generatePublicArtifacts } from "./artifacts";

function digest(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

describe("Studio Content v1 contract source", () => {
  it("is deterministic and closed", () => {
    const first = canonicalizePublicArtifact("openapi", studioContentOpenApiDocument);
    const second = canonicalizePublicArtifact("openapi", studioContentOpenApiDocument);

    expect(second).toBe(first);
    expect(digest(first)).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).toContain('"operationId": "getStudioContentContext"');
    expect(first).toContain('"operationId": "saveStudioEntryDraft"');
    expect(
      Object.values(studioContentOpenApiDocument.paths)
        .flatMap((path) => Object.values(path).map((operation) => operation.operationId))
        .toSorted(),
    ).toEqual(
      [
        "browseStudioEntries",
        "createStudioEntry",
        "getStudioEntryWorkspace",
        "saveStudioEntryDraft",
        "renameStudioEntry",
        "getStudioNewEntryWorkspace",
        "searchStudioEntries",
        "getStudioContentContext",
      ].toSorted(),
    );
    expect(first).not.toContain("access_token");
  });

  it("publishes the complete v2 successor with only the bounded resolution addition", () => {
    const bytes = canonicalizePublicArtifact("openapi", studioContentV2OpenApiDocument);
    expect(studioContentV2OpenApiDocument.info.version).toBe("2.0.0");
    expect(bytes).toContain('"operationId": "resolveStudioEntryLabels"');
    expect(
      Object.values(studioContentV2OpenApiDocument.paths).flatMap((path) =>
        Object.values(path).map((operation) => operation.operationId),
      ),
    ).toHaveLength(9);
    expect(bytes).not.toContain("access_token");
  });

  it("leaves accepted Authoring, Control Plane, and Studio v1 bytes unchanged", () => {
    const artifacts = new Map(
      generatePublicArtifacts().map((artifact) => [artifact.key, artifact.digest]),
    );
    expect(artifacts.get("authoring/v1")).toBe(
      "fe9876d93d76f893bf40a0f4f7d5e7dee9725ccb4481bdaef1ceca8f5a8c6610",
    );
    expect(artifacts.get("control-plane/v1")).toBe(
      "d151581190e0532300c9dd05787ea054227e9c24a46eaaefb91a11151ef0e3d5",
    );
    expect(artifacts.get("studio/v1")).toBe(
      "35913414f519316097cea6e73dfb1cb3a8e9097bb9083a76543adff25c6eed8f",
    );
    expect(artifacts.get("studio-content/v1")).toBe(
      "f0166c8346c4e0771ed5f97570c08302dd3bd94e0b0ff566cfd41a6654f6afe0",
    );
  });
});
