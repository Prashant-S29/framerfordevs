import { createHash } from "node:crypto";

import { assert, describe, it, layer } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  AuthUserId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "../../../contracts/platform";
import {
  type AcknowledgedSchemaChangeIds,
  CmsCollection,
  CollectionApiKey,
  CollectionDescription,
  CollectionDisplayName,
  CollectionFieldApiKey,
  CollectionFieldDefinition,
  CollectionFieldDisplayLabel,
  ContractHash,
  defaultFieldEditorMetadata,
  CollectionFieldId,
  type CollectionFieldKind,
  type CollectionFieldLocalization,
  CollectionId,
  PublishedSchemaRevision,
  PublishCollectionSchemaInput,
  SchemaChangeId,
  SchemaHash,
  SchemaPublicationCommandId,
  SchemaRevisionId,
} from "../../../contracts/schema";
import { EditorLayout } from "../../../contracts/field";
import { ToolingCollectionContract } from "../../../contracts/tooling";
import { toolingJsonData } from "../../../lib/tooling-json";
import {
  SchemaEngine,
  SchemaEngineLive,
  classifyCollectionSchemaChanges,
  compileCollectionContract,
  fingerprintSchemaPublication,
  hashCollectionContract,
  hashCollectionDraft,
  hashPublishedSchemaRevision,
  requiredAcknowledgementChanges,
  validateCollectionDraft,
  type SchemaDraftState,
} from "./index";

const workspaceId = WorkspaceId.make("019fae8b-1234-7000-8000-000000000001");
const projectId = ProjectId.make("019fae8b-1234-7000-8000-000000000002");
const environmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000003");
const collectionId = CollectionId.make("019fae8b-1234-7000-8000-000000000004");
const firstFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000005");
const secondFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000006");
const thirdFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000007");
const revisionId = SchemaRevisionId.make("019fae8b-1234-7000-8000-000000000008");
const commandId = SchemaPublicationCommandId.make("019fae8b-1234-7000-8000-000000000009");
const actorId = AuthUserId.make("user_schema_engine");
const timestamp = IsoDateTime.make("2026-08-01T12:00:00.000Z");

interface FieldOptions {
  readonly id: CollectionFieldId;
  readonly apiKey?: string;
  readonly displayLabel?: string;
  readonly kind?: CollectionFieldKind;
  readonly required?: boolean;
  readonly localization?: CollectionFieldLocalization;
  readonly deprecated?: boolean;
  readonly position?: number;
  readonly configuration?: unknown;
}

function makeField(options: FieldOptions): CollectionFieldDefinition {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id: options.id,
    parentFieldId: null,
    nodeRole: "root",
    apiKey: CollectionFieldApiKey.make(options.apiKey ?? "title"),
    displayLabel: CollectionFieldDisplayLabel.make(options.displayLabel ?? "Title"),
    kind: options.kind ?? "short_text",
    required: options.required ?? false,
    localization: options.localization ?? "localized",
    deprecated: options.deprecated ?? false,
    position: options.position ?? 0,
    editor: defaultFieldEditorMetadata,
    configuration: options.configuration ?? {},
    children: [],
  });
}

function makeCollection(options?: {
  readonly apiKey?: string;
  readonly displayName?: string;
  readonly description?: string | null;
  readonly publishedRevisionId?: SchemaRevisionId | null;
  readonly publishedSequence?: number;
}): CmsCollection {
  const publishedRevisionId = options?.publishedRevisionId ?? null;
  return CmsCollection.make({
    id: collectionId,
    workspaceId,
    projectId,
    environmentId,
    apiKey: CollectionApiKey.make(options?.apiKey ?? "blog_posts"),
    displayName: CollectionDisplayName.make(options?.displayName ?? "Blog posts"),
    description:
      options?.description === null
        ? null
        : CollectionDescription.make(options?.description ?? "Editorial posts"),
    version: ResourceVersion.make(1),
    draftVersion: ResourceVersion.make(1),
    draftBaseRevisionId: publishedRevisionId,
    currentPublishedRevisionId: publishedRevisionId,
    currentPublishedSequence: options?.publishedSequence ?? 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function makeLayout(fields: ReadonlyArray<CollectionFieldDefinition>) {
  return Schema.decodeUnknownSync(EditorLayout)({
    version: 1,
    tabs: [
      {
        id: "00000000-0000-4000-8000-000000000011",
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
        groups: [
          {
            id: "00000000-0000-4000-8000-000000000012",
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
            fields: [...fields]
              .sort((left, right) => left.position - right.position)
              .map((field, position) => ({
                id: field.id,
                fieldId: field.id,
                position,
                helpTextOverride: null,
                visibleToRoles: field.editor.visibleToRoles,
              })),
          },
        ],
      },
    ],
    sidebarGroups: [],
  });
}

function makeDraft(
  fields: ReadonlyArray<CollectionFieldDefinition>,
  collection = makeCollection(),
): SchemaDraftState {
  return {
    formatVersion: 2,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: null,
    collection,
    fields,
    editorLayout: makeLayout(fields),
  };
}

function makePublished(fields: ReadonlyArray<CollectionFieldDefinition>): PublishedSchemaRevision {
  return PublishedSchemaRevision.make({
    id: revisionId,
    workspaceId,
    projectId,
    environmentId,
    collectionId,
    sequence: 1,
    previousRevisionId: null,
    formatVersion: 2,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: null,
    collectionApiKey: CollectionApiKey.make("blog_posts"),
    collectionDisplayName: CollectionDisplayName.make("Blog posts"),
    collectionDescription: CollectionDescription.make("Editorial posts"),
    schemaHash: SchemaHash.make("a".repeat(64)),
    contractHash: ContractHash.make("b".repeat(64)),
    commandId,
    nonBreakingChangeCount: 0,
    potentiallyBreakingChangeCount: 0,
    breakingChangeCount: 0,
    publishedByUserId: actorId,
    publishedByCredentialId: null,
    publishedAt: timestamp,
    fields,
    editorLayout: makeLayout(fields),
  });
}

const optionalTitle = makeField({ id: firstFieldId });
const requiredSummary = makeField({
  id: secondFieldId,
  apiKey: "summary",
  displayLabel: "Summary",
  required: true,
  position: 1,
});

describe("schema draft validation", () => {
  it("allows an empty working draft but rejects it for publication", () => {
    const draft = makeDraft([]);

    assert.isTrue(validateCollectionDraft(draft, "draft").valid);
    const publication = validateCollectionDraft(draft, "publication");
    assert.isFalse(publication.valid);
    assert.deepEqual(
      publication.issues.map((validationIssue) => validationIssue.code),
      ["field_count_required"],
    );
  });

  it("classifies a collection API-key rename as breaking while preserving collection identity", () => {
    const published = makePublished([optionalTitle]);
    const draft = makeDraft(
      [optionalTitle],
      makeCollection({
        apiKey: "articles",
        publishedRevisionId: revisionId,
        publishedSequence: 1,
      }),
    );
    const changes = classifyCollectionSchemaChanges(published, draft);

    assert.deepInclude(changes.items[0], {
      code: "collection.api_key.updated",
      classification: "breaking",
      fieldId: null,
    });
    assert.strictEqual(draft.collection.id, published.collectionId);
  });

  it("reports duplicate identities, keys, positions, sparse ordering, and M6 configuration", () => {
    const configuredField = makeField({
      id: firstFieldId,
      apiKey: "title",
      position: 0,
      configuration: { minLength: 10, maxLength: 1 },
    });
    const invalid = makeDraft([
      makeField({ id: firstFieldId, position: 0 }),
      configuredField,
      makeField({ id: thirdFieldId, apiKey: "other", position: 2 }),
    ]);
    const result = validateCollectionDraft(invalid, "publication");
    const codes = new Set(result.issues.map((validationIssue) => validationIssue.code));

    assert.isFalse(result.valid);
    assert.isTrue(codes.has("field_id_duplicate"));
    assert.isTrue(codes.has("field_api_key_duplicate"));
    assert.isTrue(codes.has("field_position_duplicate"));
    assert.isTrue(codes.has("field_position_not_dense"));
    assert.isTrue(codes.has("configuration_range_invalid"));
  });

  it("bounds active fields before publication work", () => {
    const oversized = {
      ...makeDraft([]),
      fields: Array.from({ length: 101 }, () => optionalTitle),
    };
    const result = validateCollectionDraft(oversized, "publication");

    assert.isTrue(result.issues.some((value) => value.code === "field_count_exceeded"));
    assert.isAtMost(result.issues.length, 50);
  });

  it("produces the same canonical hash regardless of field array order", () => {
    const ordered = makeDraft([optionalTitle, requiredSummary]);
    const reversed = makeDraft([requiredSummary, optionalTitle]);

    assert.strictEqual(hashCollectionDraft(ordered), hashCollectionDraft(reversed));
  });

  it("reconstructs current and legacy persisted schema-hash authority", () => {
    const draft = makeDraft([optionalTitle]);
    const current = hashPublishedSchemaRevision({
      formatVersion: draft.formatVersion,
      validationProfile: draft.validationProfile,
      currencyRegistryProfile: draft.currencyRegistryProfile,
      collectionApiKey: draft.collection.apiKey,
      collectionDisplayName: draft.collection.displayName,
      collectionDescription: draft.collection.description,
      fields: draft.fields,
      editorLayout: draft.editorLayout,
    });
    const legacyDocument = JSON.stringify({
      collection: {
        apiKey: "blog_posts",
        description: "Editorial posts",
        displayName: "Blog posts",
      },
      fields: [
        {
          apiKey: "title",
          configuration: {},
          deprecated: false,
          displayLabel: "Title",
          id: firstFieldId,
          kind: "short_text",
          localization: "localized",
          position: 0,
          required: false,
        },
      ],
      formatVersion: 1,
    });
    const expectedLegacy = createHash("sha256").update(legacyDocument, "utf8").digest("hex");
    const legacy = hashPublishedSchemaRevision({
      formatVersion: 1,
      validationProfile: "legacy-m5",
      currencyRegistryProfile: null,
      collectionApiKey: draft.collection.apiKey,
      collectionDisplayName: draft.collection.displayName,
      collectionDescription: draft.collection.description,
      fields: draft.fields,
      editorLayout: draft.editorLayout,
    });

    assert.strictEqual(current, hashCollectionDraft(draft));
    assert.strictEqual(legacy, expectedLegacy);
  });

  it("keeps the contract hash stable for layout-only management changes", () => {
    const draft = makeDraft([optionalTitle, requiredSummary]);
    const changed: SchemaDraftState = {
      ...draft,
      editorLayout: Schema.decodeUnknownSync(EditorLayout)({
        ...draft.editorLayout,
        tabs: draft.editorLayout.tabs.map((tab) => ({
          ...tab,
          groups: tab.groups.map((group) => ({ ...group, columns: 2 })),
        })),
      }),
    };

    assert.notStrictEqual(hashCollectionDraft(draft), hashCollectionDraft(changed));
    assert.strictEqual(hashCollectionContract(draft), hashCollectionContract(changed));
    const changes = classifyCollectionSchemaChanges(
      makePublished([optionalTitle, requiredSummary]),
      changed,
    );
    assert.isTrue(
      changes.items.some(
        (change) =>
          change.code === "editor_layout.updated" && change.classification === "non_breaking",
      ),
    );
  });

  it("projects optional contract configuration to recursively valid Tooling JSON", () => {
    const contract = compileCollectionContract({
      formatVersion: 2,
      validationProfile: "m6-strict",
      currencyRegistryProfile: "iso-4217@2025-05-12",
      collectionApiKey: "articles",
      fields: [
        makeField({
          id: firstFieldId,
          apiKey: "status",
          kind: "enum",
          configuration: {
            options: [
              {
                id: "019fae8b-1234-7000-8000-000000000011",
                value: "draft",
                label: "Draft",
                position: 0,
              },
            ],
          },
        }),
        makeField({
          id: secondFieldId,
          apiKey: "budget",
          kind: "money",
          position: 1,
          configuration: { currencies: ["USD"] },
        }),
        makeField({
          id: thirdFieldId,
          apiKey: "body",
          kind: "rich_text",
          position: 2,
          configuration: {},
        }),
      ],
    });

    const toolingContract = toolingJsonData(contract);
    assert.include(JSON.stringify(toolingContract), '"default":null');
    assert.doesNotThrow(() =>
      Schema.decodeUnknownSync(ToolingCollectionContract)(toolingContract, {
        onExcessProperty: "error",
      }),
    );
  });

  it("fingerprints exact publication authority independently of acknowledgement order", () => {
    const schemaHash = hashCollectionDraft(makeDraft([optionalTitle, requiredSummary]));
    const firstChangeId = SchemaChangeId.make("a".repeat(64));
    const secondChangeId = SchemaChangeId.make("b".repeat(64));
    const first = PublishCollectionSchemaInput.make({
      projectId,
      environmentId,
      collectionId,
      draftVersion: ResourceVersion.make(1),
      expectedPublishedRevisionId: null,
      commandId,
      acknowledgedChangeIds: [firstChangeId, secondChangeId],
    });
    const reordered = PublishCollectionSchemaInput.make({
      ...first,
      acknowledgedChangeIds: [secondChangeId, firstChangeId],
    });
    const incompatible = PublishCollectionSchemaInput.make({
      ...first,
      draftVersion: ResourceVersion.make(2),
    });

    assert.strictEqual(
      fingerprintSchemaPublication(first, schemaHash),
      fingerprintSchemaPublication(reordered, schemaHash),
    );
    assert.notStrictEqual(
      fingerprintSchemaPublication(first, schemaHash),
      fingerprintSchemaPublication(incompatible, schemaHash),
    );
  });
});

describe("schema change classification", () => {
  it("classifies initial optional and required additions independently", () => {
    const changes = classifyCollectionSchemaChanges(
      null,
      makeDraft([optionalTitle, requiredSummary]),
    );

    assert.deepEqual(
      changes.items.map((change) => [change.code, change.classification]),
      [
        ["field.added.required", "potentially_breaking"],
        ["field.added.optional", "non_breaking"],
      ],
    );
    assert.strictEqual(changes.potentiallyBreakingCount, 1);
    assert.strictEqual(changes.nonBreakingCount, 1);
    assert.isTrue(changes.requiresAcknowledgement);
  });

  it("classifies every M5 published-field mutation by stable field ID", () => {
    const published = makePublished([optionalTitle, requiredSummary]);
    const changedTitle = makeField({
      id: firstFieldId,
      apiKey: "headline",
      displayLabel: "Headline",
      kind: "number",
      required: true,
      localization: "shared",
      deprecated: true,
      position: 1,
    });
    const added = makeField({
      id: thirdFieldId,
      apiKey: "featured",
      displayLabel: "Featured",
      kind: "boolean",
      position: 0,
    });
    const draft = makeDraft(
      [added, changedTitle],
      makeCollection({
        displayName: "Articles",
        description: "Published articles",
        publishedRevisionId: revisionId,
        publishedSequence: 1,
      }),
    );
    const changes = classifyCollectionSchemaChanges(published, draft);
    const classifications = new Map(
      changes.items.map((change) => [change.code, change.classification]),
    );

    assert.strictEqual(classifications.get("field.api_key.updated"), "breaking");
    assert.strictEqual(classifications.get("field.kind.updated"), "breaking");
    assert.strictEqual(classifications.get("field.localization.updated"), "breaking");
    assert.strictEqual(classifications.get("field.removed"), "breaking");
    assert.strictEqual(classifications.get("field.required.enabled"), "potentially_breaking");
    assert.strictEqual(classifications.get("field.label.updated"), "non_breaking");
    assert.strictEqual(classifications.get("field.deprecated"), "non_breaking");
    assert.strictEqual(classifications.get("field.position.updated"), "non_breaking");
    assert.strictEqual(classifications.get("field.added.optional"), "non_breaking");
    assert.strictEqual(classifications.get("collection.metadata.updated"), "non_breaking");
    assert.isTrue(
      changes.items.every(
        (change) => change.fieldId !== secondFieldId || change.code === "field.removed",
      ),
    );
  });

  it("classifies money currency removal and enum value removal as breaking", () => {
    const moneyId = firstFieldId;
    const enumId = secondFieldId;
    const publishedMoney = makeField({
      id: moneyId,
      apiKey: "price",
      kind: "money",
      configuration: { currencies: ["USD", "EUR"] },
    });
    const publishedEnum = makeField({
      id: enumId,
      apiKey: "status",
      kind: "enum",
      position: 1,
      configuration: {
        options: [
          {
            id: "019fae8b-1234-7000-8000-000000000021",
            value: "draft",
            label: "Draft",
            position: 0,
          },
          {
            id: "019fae8b-1234-7000-8000-000000000022",
            value: "published",
            label: "Published",
            position: 1,
          },
        ],
      },
    });
    const draft = makeDraft([
      makeField({
        id: moneyId,
        apiKey: "price",
        kind: "money",
        configuration: { currencies: ["USD"] },
      }),
      makeField({
        id: enumId,
        apiKey: "status",
        kind: "enum",
        position: 1,
        configuration: {
          options: [
            {
              id: "019fae8b-1234-7000-8000-000000000021",
              value: "draft",
              label: "Draft state",
              position: 0,
            },
          ],
        },
      }),
    ]);
    const changes = classifyCollectionSchemaChanges(
      makePublished([publishedMoney, publishedEnum]),
      draft,
    );
    const configurationChanges = changes.items.filter(
      (change) => change.code === "field.configuration.updated",
    );

    assert.strictEqual(configurationChanges.length, 2);
    assert.isTrue(configurationChanges.every((change) => change.classification === "breaking"));
  });

  it("treats required-to-optional, label, order, and deprecation changes as non-breaking", () => {
    const publishedField = makeField({ id: firstFieldId, required: true, deprecated: true });
    const published = makePublished([publishedField]);
    const draftField = makeField({
      id: firstFieldId,
      displayLabel: "New title",
      required: false,
      deprecated: false,
    });
    const changes = classifyCollectionSchemaChanges(
      published,
      makeDraft(
        [draftField],
        makeCollection({ publishedRevisionId: revisionId, publishedSequence: 1 }),
      ),
    );

    assert.isTrue(changes.items.every((change) => change.classification === "non_breaking"));
    assert.deepEqual(
      new Set(changes.items.map((change) => change.code)),
      new Set(["field.label.updated", "field.required.disabled", "field.undeprecated"]),
    );
    assert.strictEqual(draftField.apiKey, publishedField.apiKey);
  });

  it("keeps change IDs and ordering deterministic", () => {
    const published = makePublished([optionalTitle, requiredSummary]);
    const draft = makeDraft(
      [makeField({ id: firstFieldId, apiKey: "headline", required: true }), requiredSummary],
      makeCollection({ publishedRevisionId: revisionId, publishedSequence: 1 }),
    );

    const first = classifyCollectionSchemaChanges(published, draft);
    const second = classifyCollectionSchemaChanges(published, draft);

    assert.deepEqual(first, second);
    assert.strictEqual(first.items[0]?.classification, "breaking");
  });

  it.effect.prop(
    "changing only required state never changes stable field or API-key identity",
    [Schema.Boolean],
    ([required]) =>
      Effect.sync(() => {
        const publishedField = makeField({ id: firstFieldId, required: false });
        const draftField = makeField({ id: firstFieldId, required });
        const changes = classifyCollectionSchemaChanges(
          makePublished([publishedField]),
          makeDraft(
            [draftField],
            makeCollection({ publishedRevisionId: revisionId, publishedSequence: 1 }),
          ),
        );

        assert.strictEqual(draftField.id, publishedField.id);
        assert.strictEqual(draftField.apiKey, publishedField.apiKey);
        assert.isTrue(
          changes.items.every((change) =>
            required ? change.code === "field.required.enabled" : false,
          ),
        );
      }),
    10_000,
  );
});

describe("SchemaEngine service", () => {
  layer(SchemaEngineLive)((it) => {
    it.effect("fails publication validation with schema-backed issues", () =>
      Effect.gen(function* () {
        const engine = yield* SchemaEngine;
        const exit = yield* Effect.exit(engine.requirePublishable(makeDraft([])));

        assert.isTrue(Exit.isFailure(exit));
      }),
    );

    it.effect("requires the exact current risky change acknowledgement set", () =>
      Effect.gen(function* () {
        const engine = yield* SchemaEngine;
        const changes = yield* engine.classifyChanges(
          null,
          makeDraft([optionalTitle, requiredSummary]),
        );
        const required = requiredAcknowledgementChanges(changes);
        const exact: AcknowledgedSchemaChangeIds = required.map((change) => change.changeId);
        const accepted = yield* engine.verifyAcknowledgements(changes, exact);
        const missing = yield* Effect.exit(engine.verifyAcknowledgements(changes, []));
        const stale = yield* Effect.exit(
          engine.verifyAcknowledgements(changes, [SchemaChangeId.make("f".repeat(64))]),
        );
        const nonBreaking = changes.items.find(
          (change) => change.classification === "non_breaking",
        );
        if (nonBreaking === undefined) {
          return yield* Effect.die("Expected a non-breaking fixture change.");
        }
        const extra = yield* Effect.exit(
          engine.verifyAcknowledgements(changes, [...exact, nonBreaking.changeId]),
        );

        assert.isTrue(accepted.accepted);
        assert.isTrue(Exit.isFailure(missing));
        assert.isTrue(Exit.isFailure(stale));
        assert.isTrue(Exit.isFailure(extra));
      }),
    );
  });
});
