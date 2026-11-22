import { createHash } from "node:crypto";

import { studioContentOpenApiDocument } from "@framerfordevs/api/contracts/studio-content/openapi";
import { describe, expect, it } from "vitest";

import { canonicalizePublicArtifact } from "./artifacts";

function digest(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

describe("Studio Content contract source", () => {
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
        "resolveStudioEntryLabels",
        "getStudioContentContext",
        "listStudioEntryRevisions",
        "getStudioEntryRevision",
        "compareStudioEntryRevisions",
        "restoreStudioEntryRevision",
        "getStudioEntryPublication",
        "listStudioEntryPublications",
        "validateStudioEntryPublication",
        "publishStudioEntry",
        "unpublishStudioEntry",
      ].toSorted(),
    );
    expect(first).toContain("REVISION_INCOMPATIBLE");
    expect(first).toContain("PUBLICATION_STATE_CONFLICT");
    expect(first).toContain("PUBLICATION_INVALID");
    expect(first).not.toContain("access_token");
  });
});
