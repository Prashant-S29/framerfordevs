import { describe, expect, it } from "vitest";

import { decodeEditorOperationRequest, editorMutationOperations } from "./index";

const entryId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const digest = "a".repeat(64);
const scope = { collectionKey: "posts", locale: "en-US" };
const identified = { ...scope, entryId };

describe("editor closed operation protocol", () => {
  it("strictly decodes every allowlisted read and mutation operation", () => {
    const requests = [
      { operation: "schema.local" },
      { operation: "form.get", collectionKey: "posts" },
      { operation: "entries.list", ...scope, limit: 50, cursor: "cursor_1" },
      { operation: "entry.get", ...identified },
      {
        operation: "entry.create",
        ...scope,
        displayName: " Post ",
        schemaRevisionId: revisionId,
        contractHash: digest,
        mutations: [],
      },
      {
        operation: "entry.rename",
        ...identified,
        displayName: "Renamed",
        expectedNameVersion: 1,
      },
      {
        operation: "entry.save",
        ...identified,
        schemaRevisionId: revisionId,
        contractHash: digest,
        expectedSharedVersion: 0,
        expectedLocalizedVersion: 1,
        mutations: [{ operation: "set", scope: "localized", path: ["title"], value: "Updated" }],
      },
      { operation: "publication.status", ...identified },
      { operation: "publication.validate", ...identified },
      {
        operation: "publication.publish",
        ...identified,
        authorityHash: digest,
        expectedStateVersion: 0,
        expectedPublicationId: null,
        expectedSchemaRevisionId: revisionId,
        expectedContractHash: digest,
        expectedSharedVersion: 0,
        expectedSharedRevisionId: null,
        expectedLocalizedVersion: 1,
        expectedLocalizedRevisionId: revisionId,
      },
      {
        operation: "publication.unpublish",
        ...identified,
        expectedStateVersion: 1,
        expectedPublicationId: revisionId,
      },
    ];

    expect(requests.map((request) => decodeEditorOperationRequest(request).operation)).toEqual(
      requests.map((request) => request.operation),
    );
    expect(decodeEditorOperationRequest(requests[4])).toMatchObject({ displayName: "Post" });
  });

  it.each([
    [{ operation: "proxy", url: "https://evil.test" }],
    [{ operation: "entries.list", ...scope, limit: 51 }],
    [{ operation: "entry.get", ...identified, token: "secret" }],
    [{ operation: "entry.save", ...identified, mutations: [] }],
    [
      {
        operation: "entry.rename",
        ...identified,
        displayName: "Post",
        expectedNameVersion: 0,
      },
    ],
    [
      {
        operation: "entry.create",
        ...scope,
        displayName: "Post",
        schemaRevisionId: revisionId,
        contractHash: digest,
        mutations: [{ operation: "set", scope: "localized", path: [], value: "x" }],
      },
    ],
  ])("rejects unknown, excessive, or malformed operation authority", (request) => {
    expect(() => decodeEditorOperationRequest(request)).toThrow();
  });

  it("classifies only hosted mutations as drift-gated", () => {
    expect([...editorMutationOperations].sort()).toEqual([
      "entry.create",
      "entry.rename",
      "entry.save",
      "publication.publish",
      "publication.unpublish",
    ]);
    expect(editorMutationOperations.has("publication.validate")).toBe(false);
  });
});
