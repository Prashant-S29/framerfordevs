import { describe, expect, it } from "vitest";

import {
  authoringPresentationPublishBearerRequirement,
  authoringSchemaExportBearerRequirement,
  authoringSchemaPlanBearerRequirement,
} from "../operations/authoring-public";
import { authoringOpenApiDocument } from "./authoring-openapi";

function collectReferences(value: unknown, references: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectReferences(item, references));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string") references.add(item);
    collectReferences(item, references);
  }
}

describe("Authoring public contract", () => {
  it("publishes schema and exact-locale content reads with exact grants", () => {
    expect(authoringOpenApiDocument.openapi).toBe("3.1.0");
    const collectionPath =
      "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}";
    const formPath = `${collectionPath}/form` as const;
    const presentationPath = `${collectionPath}/presentation` as const;
    const entriesPath = `${collectionPath}/locales/{locale}/entries` as const;
    const entryPath = `${entriesPath}/{entryId}` as const;
    const draftPath = `${entryPath}/draft` as const;
    const publicationPath = `${entriesPath}/{entryId}/publication` as const;
    expect(Object.keys(authoringOpenApiDocument.paths)).toEqual([
      presentationPath,
      formPath,
      entriesPath,
      entryPath,
      draftPath,
      publicationPath,
      `${publicationPath}/validate`,
      `${publicationPath}/publish`,
      `${publicationPath}/unpublish`,
      "/projects/{projectId}/environments/{environmentId}/schema/export",
      "/projects/{projectId}/environments/{environmentId}/schema/plan",
      "/projects/{projectId}/environments/{environmentId}/schema/apply",
    ]);
    expect(authoringOpenApiDocument.paths[presentationPath].get["x-required-oauth-scope"]).toBe(
      "authoring:read",
    );
    expect(
      authoringOpenApiDocument.paths[presentationPath].get["x-required-management-scopes"],
    ).toEqual(["schema.read"]);
    expect(authoringOpenApiDocument.paths[presentationPath].post["x-required-oauth-scope"]).toBe(
      "authoring:schema:push",
    );
    expect(
      authoringOpenApiDocument.paths[presentationPath].post["x-required-management-scopes"],
    ).toEqual(["schema.read", "schema.write", "schema.publish"]);
    expect(authoringPresentationPublishBearerRequirement).toEqual({
      oauthScope: "authoring:schema:push",
      managementScopes: ["schema.read", "schema.write", "schema.publish"],
    });
    expect(authoringOpenApiDocument.paths[formPath].get["x-required-oauth-scope"]).toBe(
      "authoring:read",
    );
    expect(authoringOpenApiDocument.paths[formPath].get["x-required-management-scopes"]).toEqual([
      "content.read",
    ]);
    expect(authoringOpenApiDocument.paths[entriesPath].get["x-required-oauth-scope"]).toBe(
      "authoring:read",
    );
    expect(authoringOpenApiDocument.paths[entriesPath].get["x-required-management-scopes"]).toEqual(
      ["content.read"],
    );
    expect(authoringOpenApiDocument.paths[entriesPath].post["x-required-oauth-scope"]).toBe(
      "authoring:draft:write",
    );
    expect(
      authoringOpenApiDocument.paths[entriesPath].post["x-required-management-scopes"],
    ).toEqual(["content.write"]);
    expect(authoringOpenApiDocument.paths[entryPath].patch["x-required-oauth-scope"]).toBe(
      "authoring:draft:write",
    );
    expect(authoringOpenApiDocument.paths[entryPath].patch["x-required-management-scopes"]).toEqual(
      ["content.write"],
    );
    expect(authoringOpenApiDocument.paths[draftPath].get["x-required-management-scopes"]).toEqual([
      "content.read",
    ]);
    expect(authoringOpenApiDocument.paths[draftPath].patch["x-required-oauth-scope"]).toBe(
      "authoring:draft:write",
    );
    expect(authoringOpenApiDocument.paths[draftPath].patch["x-required-management-scopes"]).toEqual(
      ["content.write"],
    );
    expect(authoringOpenApiDocument.paths[publicationPath].get?.["x-required-oauth-scope"]).toBe(
      "authoring:read",
    );
    expect(
      authoringOpenApiDocument.paths[publicationPath].get?.["x-required-management-scopes"],
    ).toEqual(["content.read"]);
    expect(
      authoringOpenApiDocument.paths[`${publicationPath}/publish`].post?.["x-required-oauth-scope"],
    ).toBe("authoring:content:publish");
    expect(authoringSchemaExportBearerRequirement).toEqual({
      oauthScope: "authoring:read",
      managementScopes: ["schema.read"],
    });
    const plan =
      authoringOpenApiDocument.paths[
        "/projects/{projectId}/environments/{environmentId}/schema/plan"
      ];
    const apply =
      authoringOpenApiDocument.paths[
        "/projects/{projectId}/environments/{environmentId}/schema/apply"
      ];
    expect(plan.post["x-required-oauth-scope"]).toBe("authoring:schema:push");
    expect(plan.post["x-required-management-scopes"]).toEqual([
      "schema.read",
      "schema.write",
      "schema.publish",
    ]);
    expect(authoringSchemaPlanBearerRequirement).toEqual({
      oauthScope: "authoring:schema:push",
      managementScopes: ["schema.read", "schema.write", "schema.publish"],
    });
    expect(apply.post["x-required-oauth-scope"]).toBe("authoring:schema:push");
    expect(apply.post["x-required-management-scopes"]).toEqual([
      "schema.read",
      "schema.write",
      "schema.publish",
    ]);
  });

  it("keeps internal and browser-session surfaces out of the contract", () => {
    const text = JSON.stringify(authoringOpenApiDocument);
    expect(text).not.toContain("workspaceId");
    expect(text).not.toContain("/rpc");
    expect(text).not.toContain("cookie");
    expect(text).not.toContain("audit");
    expect(text).not.toContain("credentialId");
    expect(text).not.toContain("completedBy");
  });

  it("uses only local resolvable component references", () => {
    const references = new Set<string>();
    collectReferences(authoringOpenApiDocument, references);
    for (const reference of references) {
      expect(reference.startsWith("#/components/")).toBe(true);
      const parts = reference.slice(2).split("/");
      let value: unknown = authoringOpenApiDocument;
      for (const part of parts) value = Reflect.get(value as object, part);
      expect(value).not.toBeUndefined();
    }
  });
});
