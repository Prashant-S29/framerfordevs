import { assert, describe, it } from "@effect/vitest";

import type { ProjectSchema } from "@framerfordevs/schema";

import {
  AuthoringSchemaAuthority,
  ProjectStructureManifestHash,
} from "../../../contracts/authoring";
import { EditorLayoutNodeId } from "../../../contracts/field";
import {
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "../../../contracts/platform";
import {
  CmsCollection,
  CollectionApiKey,
  CollectionDisplayName,
  CollectionFieldId,
  CollectionId,
} from "../../../contracts/schema";
import { buildAllocatedProjectCandidates } from "./index";
import { buildAuthoringProjectPlan } from "../project-plan";
import type { StructureIdentityMap } from "../hash";

const workspaceId = WorkspaceId.make("019fae8b-1234-7000-8000-000000000a01");
const projectId = ProjectId.make("019fae8b-1234-7000-8000-000000000a02");
const environmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000a03");
const collectionId = CollectionId.make("019fae8b-1234-7000-8000-000000000a04");
const fieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000a05");
const tabId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000a06");
const groupId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000a07");
const placementId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000a08");

const project: ProjectSchema = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: {},
        },
      ],
    },
  ],
};
const identities: StructureIdentityMap = {
  collections: [{ sourceKey: "posts", collectionId }],
  fields: [{ collectionSourceKey: "posts", sourceKey: "title", fieldId }],
  enumOptions: [],
};
const collection = CmsCollection.make({
  id: collectionId,
  workspaceId,
  projectId,
  environmentId,
  apiKey: CollectionApiKey.make("posts"),
  displayName: CollectionDisplayName.make("Posts"),
  description: null,
  version: ResourceVersion.make(1),
  draftVersion: ResourceVersion.make(1),
  draftBaseRevisionId: null,
  currentPublishedRevisionId: null,
  currentPublishedSequence: 0,
  createdAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
  updatedAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
});
const layoutAllocations = {
  tabId,
  groupId,
  placementIds: new Map([[fieldId, placementId]]),
};

describe("allocated project candidates", () => {
  it("replaces plan-only identities with real server IDs while preserving project change IDs", () => {
    const plan = buildAuthoringProjectPlan(project, {
      workspaceId,
      projectId,
      environmentId,
      current: AuthoringSchemaAuthority.make({
        projectManifestHash: ProjectStructureManifestHash.make("a".repeat(64)),
        revisionIds: {},
      }),
      activeCollectionSourceKeys: [],
      persistedIdentities: { collections: [], fields: [], enumOptions: [] },
      collections: [],
    });
    const allocated = buildAllocatedProjectCandidates({
      project,
      identities,
      collections: [
        {
          sourceKey: "posts",
          collection,
          currentPublished: null,
          layoutAllocations,
        },
      ],
    });

    assert.isTrue(plan.valid);
    assert.isTrue(allocated.valid);
    if (plan.valid && allocated.valid) {
      assert.strictEqual(plan.candidates[0]?.candidateStructureHash, null);
      assert.match(allocated.collections[0]?.candidate.structureHash ?? "", /^[0-9a-f]{64}$/u);
      assert.strictEqual(plan.changes[0]?.changeId, allocated.changes[0]?.changeId);
      assert.strictEqual(allocated.collections[0]?.candidate.draft.collection.id, collectionId);
      assert.strictEqual(allocated.collections[0]?.candidate.draft.fields[0]?.id, fieldId);
    }
  });

  it("fails closed on missing or extraneous allocated collection state", () => {
    const missing = buildAllocatedProjectCandidates({
      project,
      identities,
      collections: [],
    });
    const extraneous = buildAllocatedProjectCandidates({
      project: { collections: [] },
      identities,
      collections: [
        {
          sourceKey: "posts",
          collection,
          currentPublished: null,
          layoutAllocations,
        },
      ],
    });

    assert.isFalse(missing.valid);
    assert.isFalse(extraneous.valid);
    if (!missing.valid) assert.strictEqual(missing.issues[0]?.code, "allocated_collection_missing");
    if (!extraneous.valid)
      assert.strictEqual(extraneous.issues[0]?.code, "allocated_collection_extraneous");
  });
});
