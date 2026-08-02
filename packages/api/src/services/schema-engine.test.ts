import { assert, describe, it, layer } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  AuthUserId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "../contracts/platform";
import {
  type AcknowledgedSchemaChangeIds,
  CmsCollection,
  CollectionApiKey,
  CollectionDescription,
  CollectionDisplayName,
  CollectionDraftSchema,
  CollectionFieldApiKey,
  CollectionFieldDefinition,
  CollectionFieldDisplayLabel,
  CollectionFieldId,
  type CollectionFieldKind,
  type CollectionFieldLocalization,
  CollectionId,
  PublishedSchemaField,
  PublishedSchemaRevision,
  PublishCollectionSchemaInput,
  SchemaChangeId,
  SchemaHash,
  SchemaPublicationCommandId,
  SchemaRevisionId,
} from "../contracts/schemas";
import {
  SchemaEngine,
  SchemaEngineLive,
  classifyCollectionSchemaChanges,
  fingerprintSchemaPublication,
  hashCollectionDraft,
  requiredAcknowledgementChanges,
  validateCollectionDraft,
} from "./schema-engine";

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
  readonly configuration?: Readonly<Record<string, unknown>>;
}

function makeField(options: FieldOptions): CollectionFieldDefinition {
  return CollectionFieldDefinition.make({
    id: options.id,
    apiKey: CollectionFieldApiKey.make(options.apiKey ?? "title"),
    displayLabel: CollectionFieldDisplayLabel.make(options.displayLabel ?? "Title"),
    kind: options.kind ?? "short_text",
    required: options.required ?? false,
    localization: options.localization ?? "localized",
    deprecated: options.deprecated ?? false,
    position: options.position ?? 0,
    configuration: options.configuration ?? {},
  });
}

function makeCollection(options?: {
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
    apiKey: CollectionApiKey.make("blog_posts"),
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

function makeDraft(
  fields: ReadonlyArray<CollectionFieldDefinition>,
  collection = makeCollection(),
): CollectionDraftSchema {
  return CollectionDraftSchema.make({ collection, fields });
}

function toPublishedField(field: CollectionFieldDefinition): PublishedSchemaField {
  return PublishedSchemaField.make({
    id: field.id,
    apiKey: field.apiKey,
    displayLabel: field.displayLabel,
    kind: field.kind,
    required: field.required,
    localization: field.localization,
    deprecated: field.deprecated,
    position: field.position,
    configuration: field.configuration,
  });
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
    collectionApiKey: CollectionApiKey.make("blog_posts"),
    collectionDisplayName: CollectionDisplayName.make("Blog posts"),
    collectionDescription: CollectionDescription.make("Editorial posts"),
    schemaHash: SchemaHash.make("a".repeat(64)),
    commandId,
    nonBreakingChangeCount: 0,
    potentiallyBreakingChangeCount: 0,
    breakingChangeCount: 0,
    publishedByUserId: actorId,
    publishedAt: timestamp,
    fields: fields.map(toPublishedField),
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

  it("reports duplicate identities, keys, positions, sparse ordering, and M6 configuration", () => {
    const configuredField = {
      ...makeField({
        id: firstFieldId,
        apiKey: "title",
        position: 0,
      }),
      configuration: { minLength: 1 },
    };
    const invalid = {
      collection: makeCollection(),
      fields: [
        makeField({ id: firstFieldId, position: 0 }),
        configuredField,
        makeField({ id: thirdFieldId, apiKey: "other", position: 2 }),
      ],
    };
    const result = validateCollectionDraft(invalid, "publication");
    const codes = new Set(result.issues.map((validationIssue) => validationIssue.code));

    assert.isFalse(result.valid);
    assert.isTrue(codes.has("field_id_duplicate"));
    assert.isTrue(codes.has("field_api_key_duplicate"));
    assert.isTrue(codes.has("field_position_duplicate"));
    assert.isTrue(codes.has("field_position_not_dense"));
    assert.isTrue(codes.has("field_configuration_unsupported"));
  });

  it("bounds active fields before publication work", () => {
    const oversized = {
      collection: makeCollection(),
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
