import { JSONSchema } from "effect";
import { describe, expect, it } from "vitest";

import { toolingOpenApiDocument } from "./index";
import { ToolingCollectionContractRevisionResponse, ToolingSchemaManifestPageResponse } from "..";

function collectReferences(value: unknown, references: Array<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferences(item, references));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const reference = Reflect.get(value, "$ref");
  if (typeof reference === "string") references.push(reference);
  Object.values(value).forEach((item) => collectReferences(item, references));
}

describe("Tooling public contract", () => {
  it("publishes exactly the four approved data paths and closed bearer schemes", () => {
    expect(toolingOpenApiDocument.openapi).toBe("3.1.0");
    expect(Object.keys(toolingOpenApiDocument.paths)).toEqual([
      "/projects",
      "/projects/{projectId}/environments",
      "/projects/{projectId}/environments/{environmentKey}/schema/manifest",
      "/projects/{projectId}/environments/{environmentKey}/schema/collections/{collectionKey}/revisions/{revisionId}",
    ]);
    expect(toolingOpenApiDocument.components.securitySchemes).toEqual(
      expect.objectContaining({
        ToolingOAuth: expect.objectContaining({ type: "http", scheme: "bearer" }),
        ToolingManagementCredential: expect.objectContaining({
          type: "http",
          scheme: "bearer",
        }),
      }),
    );
    expect(JSON.stringify(toolingOpenApiDocument)).not.toContain("/rpc");
    expect(JSON.stringify(toolingOpenApiDocument)).not.toContain("workspaceId");
  });

  it("emits resolvable local Effect schema references", () => {
    const references: Array<string> = [];
    collectReferences(toolingOpenApiDocument, references);

    expect(references.length).toBeGreaterThan(0);
    expect(references.every((reference) => reference.startsWith("#/components/"))).toBe(true);
    expect(() => JSONSchema.make(ToolingSchemaManifestPageResponse)).not.toThrow();
    expect(() => JSONSchema.make(ToolingCollectionContractRevisionResponse)).not.toThrow();
  });

  it("requires locale, revision, stable identity, and contract hashes in generated schemas", () => {
    const text = JSON.stringify(toolingOpenApiDocument.components.schemas);
    for (const field of [
      "localeContractHash",
      "contractHash",
      "revisionId",
      "revisionSequence",
      "collectionId",
      "environmentId",
    ]) {
      expect(text).toContain(field);
    }
  });
});
