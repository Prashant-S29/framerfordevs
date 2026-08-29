import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AuthoringSchemaAuthority,
  CollectionSourceKey,
  ProjectStructureManifestHash,
} from "../contracts/authoring";
import { EditorLayout } from "../contracts/field-system";
import {
  AuthUserId,
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
  CollectionFieldApiKey,
  CollectionFieldDefinition,
  CollectionFieldDisplayLabel,
  CollectionFieldId,
  CollectionId,
  ContractHash,
  defaultFieldEditorMetadata,
  PublishedSchemaRevision,
  SchemaHash,
  SchemaPublicationCommandId,
  SchemaRevisionId,
} from "../contracts/schemas";
import {
  type AuthoringProjectPlanContext,
  buildAuthoringProjectPlan,
} from "./authoring-project-plan";

const workspaceId = WorkspaceId.make("019fae8b-1234-7000-8000-000000000801");
const projectId = ProjectId.make("019fae8b-1234-7000-8000-000000000802");
const environmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000803");
const postsId = CollectionId.make("019fae8b-1234-7000-8000-000000000804");
const titleId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000805");
const summaryId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000806");
const revisionId = SchemaRevisionId.make("019fae8b-1234-7000-8000-000000000807");
const postsSourceKey = CollectionSourceKey.make("posts");

const title = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: titleId,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: CollectionFieldApiKey.make("title"),
  displayLabel: CollectionFieldDisplayLabel.make("Headline"),
  kind: "short_text",
  required: false,
  localization: "localized",
  deprecated: false,
  position: 0,
  editor: defaultFieldEditorMetadata,
  configuration: { maxLength: 160 },
  children: [],
});
const layout = Schema.decodeUnknownSync(EditorLayout)({
  version: 1,
  tabs: [
    {
      id: "019fae8b-1234-7000-8000-000000000808",
      title: "Writing",
      description: null,
      position: 0,
      visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
      groups: [
        {
          id: "019fae8b-1234-7000-8000-000000000809",
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
          fields: [
            {
              id: "019fae8b-1234-7000-8000-000000000810",
              fieldId: titleId,
              position: 0,
              helpTextOverride: "Use a concise headline.",
              visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [],
});
const collection = CmsCollection.make({
  id: postsId,
  workspaceId,
  projectId,
  environmentId,
  apiKey: CollectionApiKey.make("posts"),
  displayName: CollectionDisplayName.make("Editorial posts"),
  description: null,
  version: ResourceVersion.make(1),
  draftVersion: ResourceVersion.make(1),
  draftBaseRevisionId: revisionId,
  currentPublishedRevisionId: revisionId,
  currentPublishedSequence: 1,
  createdAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
  updatedAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
});
const published = PublishedSchemaRevision.make({
  id: revisionId,
  workspaceId,
  projectId,
  environmentId,
  collectionId: postsId,
  sequence: 1,
  previousRevisionId: null,
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  collectionApiKey: CollectionApiKey.make("posts"),
  collectionDisplayName: CollectionDisplayName.make("Editorial posts"),
  collectionDescription: null,
  schemaHash: SchemaHash.make("a".repeat(64)),
  contractHash: ContractHash.make("b".repeat(64)),
  commandId: SchemaPublicationCommandId.make("019fae8b-1234-7000-8000-000000000811"),
  nonBreakingChangeCount: 0,
  potentiallyBreakingChangeCount: 0,
  breakingChangeCount: 0,
  publishedByUserId: AuthUserId.make("plan-test-user"),
  publishedByCredentialId: null,
  publishedAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
  fields: [title],
  editorLayout: layout,
});

function document(includeSummary = false, includePages = false) {
  return {
    collections: [
      {
        sourceKey: "posts",
        apiKey: "posts",
        fields: [
          {
            sourceKey: "title",
            apiKey: "title",
            kind: "short_text",
            required: false,
            localization: "localized",
            configuration: { maxLength: 160 },
          },
          ...(includeSummary
            ? [
                {
                  sourceKey: "summary",
                  apiKey: "summary",
                  kind: "long_text" as const,
                  required: true,
                  localization: "localized" as const,
                  configuration: {},
                },
              ]
            : []),
        ],
      },
      ...(includePages
        ? [
            {
              sourceKey: "pages",
              apiKey: "pages",
              fields: [
                {
                  sourceKey: "heading",
                  apiKey: "heading",
                  kind: "short_text" as const,
                  required: false,
                  localization: "localized" as const,
                  configuration: {},
                },
              ],
            },
          ]
        : []),
    ],
  };
}

function context(summaryAllocated = false): AuthoringProjectPlanContext {
  return {
    workspaceId,
    projectId,
    environmentId,
    current: AuthoringSchemaAuthority.make({
      projectManifestHash: ProjectStructureManifestHash.make("c".repeat(64)),
      revisionIds: { [postsSourceKey]: revisionId },
    }),
    activeCollectionSourceKeys: [postsSourceKey],
    persistedIdentities: {
      collections: [{ sourceKey: "posts", collectionId: postsId, state: "active" }],
      fields: [
        {
          collectionSourceKey: "posts",
          sourceKey: "title",
          fieldId: titleId,
          parentFieldId: null,
          nodeRole: "root",
          state: "active",
        },
        ...(summaryAllocated
          ? [
              {
                collectionSourceKey: "posts",
                sourceKey: "summary",
                fieldId: summaryId,
                parentFieldId: null,
                nodeRole: "root" as const,
                state: "active" as const,
              },
            ]
          : []),
      ],
      enumOptions: [],
    },
    collections: [{ sourceKey: "posts", collection, published }],
  };
}

describe("complete-project Authoring schema plan", () => {
  it("returns real candidate hashes when every stable identity is already allocated", () => {
    const plan = buildAuthoringProjectPlan(document(), context());

    assert.isTrue(plan.valid);
    if (plan.valid) {
      assert.match(plan.planHash, /^[0-9a-f]{64}$/u);
      assert.strictEqual(plan.candidates[0]?.containsUnallocatedIdentities, false);
      assert.match(plan.candidates[0]?.candidateStructureHash ?? "", /^[0-9a-f]{64}$/u);
      assert.deepStrictEqual(plan.changes, []);
    }
  });

  it("returns an always-present null candidate hash for new identities", () => {
    const plan = buildAuthoringProjectPlan(document(true), context());

    assert.isTrue(plan.valid);
    if (plan.valid) {
      assert.strictEqual(plan.candidates[0]?.collectionId, postsId);
      assert.strictEqual(plan.candidates[0]?.candidateStructureHash, null);
      assert.strictEqual(plan.candidates[0]?.candidateContractHash, null);
      const change = plan.changes[0];
      if (!change) throw new Error("Expected one project change.");
      assert.strictEqual(change.collectionSourceKey, "posts");
      assert.strictEqual(change.fieldSourceKey, "summary");
      assert.strictEqual(change.code, "field.added.required");
      assert.strictEqual(change.classification, "potentially_breaking");
    }
  });

  it("keeps project change IDs stable when apply later allocates the real field ID", () => {
    const beforeAllocation = buildAuthoringProjectPlan(document(true), context());
    const afterAllocation = buildAuthoringProjectPlan(document(true), context(true));

    assert.isTrue(beforeAllocation.valid);
    assert.isTrue(afterAllocation.valid);
    if (beforeAllocation.valid && afterAllocation.valid) {
      assert.strictEqual(
        beforeAllocation.changes[0]?.changeId,
        afterAllocation.changes[0]?.changeId,
      );
      assert.strictEqual(beforeAllocation.candidates[0]?.candidateStructureHash, null);
      assert.match(afterAllocation.candidates[0]?.candidateStructureHash ?? "", /^[0-9a-f]{64}$/u);
    }
  });

  it("represents a completely new collection only by source key until apply", () => {
    const plan = buildAuthoringProjectPlan(document(false, true), context());

    assert.isTrue(plan.valid);
    if (plan.valid) {
      const pages = plan.candidates.find((candidate) => candidate.collectionSourceKey === "pages");
      assert.strictEqual(pages?.collectionId, null);
      assert.strictEqual(pages?.candidateStructureHash, null);
    }
  });

  it("rejects omission of an active collection without producing a plan hash", () => {
    const plan = buildAuthoringProjectPlan(
      { collections: [{ sourceKey: "pages", apiKey: "pages", fields: [] }] },
      context(),
    );

    assert.isFalse(plan.valid);
    if (!plan.valid) {
      assert.strictEqual(plan.planHash, null);
      assert.strictEqual(plan.issues[0]?.code, "active_collection_omitted");
    }
  });
});
