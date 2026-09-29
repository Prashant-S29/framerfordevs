import { createHash } from "node:crypto";

import { studioContentOpenApiDocument } from "@framerfordevs/api/contracts/studio-content/openapi/index";
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

  it("leaves accepted Authoring, Control Plane, and Studio v1 bytes unchanged", () => {
    const artifacts = new Map(
      generatePublicArtifacts().map((artifact) => [artifact.key, artifact.digest]),
    );
    expect(artifacts.get("authoring/v1")).toBe(
      "d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205",
    );
    expect(artifacts.get("control-plane/v1")).toBe(
      "3dd7c890b7a0448bfb497db663fadfee7f3eeaf614a026e405da3638a595d59b",
    );
    expect(artifacts.get("studio/v1")).toBe(
      "f3a70dee4d72057a3df982a6b4a4ff5192daea850b57810cfeb7caa498ef5b03",
    );
    expect(artifacts.get("studio-content/v1")).toBe(
      "c9226fdcc767d704a41e100a5440560afbb7f64977209f82d42dad20bc48a9fc",
    );
  });
});
