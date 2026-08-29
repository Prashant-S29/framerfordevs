// Locks the dedicated Preview OpenAPI surface, bearer authority, source grammar, and isolation metadata.

import { describe, expect, it } from "vitest";

import { previewOpenApiDocument } from "./index";

const currentPath =
  "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}/draft";
const revisionPath =
  "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}/revisions/{schemaRevisionId}";

describe("Preview OpenAPI", () => {
  it("publishes only the two exact Preview source routes and tenant-neutral docs", () => {
    expect(previewOpenApiDocument.openapi).toBe("3.1.0");
    expect(previewOpenApiDocument.info.title).toBe("Framer for Devs Preview API");
    expect(Object.keys(previewOpenApiDocument.paths).sort()).toEqual(
      [currentPath, revisionPath].sort(),
    );
    expect(Object.keys(previewOpenApiDocument.paths[currentPath]).sort()).toEqual([
      "get",
      "head",
      "options",
    ]);
    const serialized = JSON.stringify(previewOpenApiDocument);
    expect(serialized).not.toContain("platform.workspaces");
    expect(serialized).not.toContain("delivery.read");
    expect(serialized).not.toContain("Better Auth");
    expect(serialized).not.toContain("ffd_prev_example");
  });

  it("requires bearer Preview authority and explicit historical selectors", () => {
    const currentGet = previewOpenApiDocument.paths[currentPath].get;
    const revisionGet = previewOpenApiDocument.paths[revisionPath].get;
    const parameterNames = revisionGet.parameters.map((parameter) => parameter.name);

    expect(currentGet.security).toEqual([{ previewBearer: [] }]);
    expect(previewOpenApiDocument.components.securitySchemes.previewBearer).toEqual(
      expect.objectContaining({ type: "http", scheme: "bearer" }),
    );
    expect(parameterNames).toEqual(
      expect.arrayContaining(["schemaRevisionId", "locale", "sharedRevision", "localizedRevision"]),
    );
    expect(revisionGet.parameters.find((parameter) => parameter.name === "sharedRevision")).toEqual(
      expect.objectContaining({ required: true }),
    );
    expect(previewOpenApiDocument.paths[revisionPath].options.security).toEqual([]);
  });

  it("documents no-store, no-referrer transport behavior and exact resource limits", () => {
    const serialized = JSON.stringify(previewOpenApiDocument);

    expect(previewOpenApiDocument.components.headers.CacheControl.schema.const).toBe(
      "private, no-store, max-age=0",
    );
    expect(previewOpenApiDocument.components.headers.WwwAuthenticate.schema.const).toBe(
      'Bearer realm="preview"',
    );
    expect(previewOpenApiDocument.components.headers.ReferrerPolicy.schema.const).toBe(
      "no-referrer",
    );
    expect(
      previewOpenApiDocument.paths[currentPath].head.responses["200"].headers["Content-Length"],
    ).toEqual({ $ref: "#/components/headers/ContentLength" });
    expect(previewOpenApiDocument["x-preview-limits"]).toEqual({
      queryBytes: 4_096,
      responseBytes: 2_621_440,
      validationIssues: 50,
      referenceExpansion: false,
    });
    expect(serialized).not.toContain("ETag");
    expect(serialized).not.toContain("Last-Modified");
    expect(serialized).not.toContain("304");
    expect(serialized).toContain("browser storage");
  });

  it("keeps the public failure schema Preview-only and response references resolvable", () => {
    const schemas = previewOpenApiDocument.components.schemas;
    const serialized = JSON.stringify(schemas);
    const references = [...serialized.matchAll(/#\/components\/schemas\/([^"}]+)/gu)].map(
      (match) => match[1],
    );

    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining(["PreviewItemResponse", "PreviewApiFailure"]),
    );
    for (const reference of references) {
      expect(Object.hasOwn(schemas, reference ?? "")).toBe(true);
    }
    expect(serialized).not.toContain("DELIVERY_CURSOR_STALE");
    expect(serialized).not.toContain("INVITATION_INVALID");
  });
});
