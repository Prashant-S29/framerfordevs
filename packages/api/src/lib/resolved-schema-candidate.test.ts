import { assert, describe, it } from "@effect/vitest";

import type { CollectionSchema } from "@framerfordevs/schema";

import { EditorLayoutNodeId } from "../contracts/field-system";
import {
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "../contracts/platform";
import {
  CmsCollection,
  CollectionApiKey,
  CollectionDisplayName,
  CollectionFieldId,
  CollectionId,
} from "../contracts/schemas";
import { buildResolvedSchemaCandidate } from "./resolved-schema-candidate";
import type { StructureIdentityMap } from "./structure-hash";

const collectionId = CollectionId.make("019fae8b-1234-7000-8000-000000000601");
const titleId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000602");
const tabId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000603");
const groupId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000604");
const placementId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000605");

const schema: CollectionSchema = {
  sourceKey: "posts",
  apiKey: "articles",
  fields: [
    {
      sourceKey: "title",
      apiKey: "title",
      kind: "short_text",
      required: true,
      localization: "localized",
      configuration: { maxLength: 160 },
    },
  ],
};

const identities: StructureIdentityMap = {
  collections: [{ sourceKey: "posts", collectionId }],
  fields: [{ collectionSourceKey: "posts", sourceKey: "title", fieldId: titleId }],
  enumOptions: [],
};

const collection = CmsCollection.make({
  id: collectionId,
  workspaceId: WorkspaceId.make("019fae8b-1234-7000-8000-000000000606"),
  projectId: ProjectId.make("019fae8b-1234-7000-8000-000000000607"),
  environmentId: EnvironmentId.make("019fae8b-1234-7000-8000-000000000608"),
  apiKey: CollectionApiKey.make("posts"),
  displayName: CollectionDisplayName.make("Editorial posts"),
  description: null,
  version: ResourceVersion.make(1),
  draftVersion: ResourceVersion.make(1),
  draftBaseRevisionId: null,
  currentPublishedRevisionId: null,
  currentPublishedSequence: 0,
  createdAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
  updatedAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
});

describe("resolved code schema candidate", () => {
  it("reuses M5/M6 validation, hashes, and exact risky-change classification", () => {
    const result = buildResolvedSchemaCandidate({
      schema,
      collection,
      identities,
      currentPublished: null,
      layoutAllocations: {
        tabId,
        groupId,
        placementIds: new Map([[titleId, placementId]]),
      },
    });

    assert.isTrue(result.valid);
    if (result.valid) {
      assert.strictEqual(result.candidate.draft.collection.apiKey, "articles");
      assert.strictEqual(result.candidate.draft.collection.displayName, "Editorial posts");
      assert.match(result.candidate.structureHash, /^[0-9a-f]{64}$/u);
      assert.match(result.candidate.contractHash, /^[0-9a-f]{64}$/u);
      assert.match(result.candidate.schemaHash, /^[0-9a-f]{64}$/u);
      assert.deepStrictEqual(
        result.candidate.changes.items.map((change) => ({
          code: change.code,
          classification: change.classification,
        })),
        [{ code: "field.added.required", classification: "potentially_breaking" }],
      );
      const riskyChange = result.candidate.changes.items[0];
      if (!riskyChange) throw new Error("Expected one risky change.");
      assert.deepStrictEqual(result.candidate.requiredAcknowledgementIds, [riskyChange.changeId]);
      assert.isFalse(result.candidate.noOp);
    }
  });

  it("fails before validation when server-owned presentation IDs were not allocated", () => {
    const result = buildResolvedSchemaCandidate({
      schema,
      collection,
      identities,
      currentPublished: null,
      layoutAllocations: { tabId, groupId, placementIds: new Map() },
    });

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.strictEqual(result.issues[0]?.code, "layout_identity_missing");
    }
  });
});
