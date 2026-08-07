import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { EffectSchemaToJsonSchemaConverter } from "./effect-schema-converter";
import { decodeCollectionCursor, encodeCollectionCursor } from "./schema-cursor";
import {
  AcknowledgedSchemaChangeIds,
  CollectionApiKey,
  CollectionFieldApiKey,
  CollectionFieldConfiguration,
  CollectionFieldKind,
  CollectionFieldOrder,
  CollectionId,
  CreateCollectionFieldInput,
  CreateCollectionFieldInputSchema,
  CreateCollectionInputSchema,
  defaultFieldEditorMetadata,
  OutboxEventId,
  PublishCollectionSchemaInputSchema,
  PublishedSchemaRevisionOutputSchema,
  ReplaceCollectionDraftFieldsInput,
  ReplaceCollectionDraftFieldsInputSchema,
  SchemaPublicationCommandId,
  SchemaRevisionId,
} from "./schemas";
import { EnvironmentId } from "./platform";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000002");
const otherEnvironmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000003");
const collectionId = CollectionId.make("019fae8b-1234-7000-8000-000000000004");
const firstFieldId = "019fae8b-1234-7000-8000-000000000005";
const secondFieldId = "019fae8b-1234-7000-8000-000000000006";
const createdAt = "2026-08-01T12:00:00.000Z";

describe("collection schema contracts", () => {
  it.effect("accepts trimmed lowercase snake-case keys and keeps collection and field brands", () =>
    Effect.gen(function* () {
      const collectionKey = yield* Schema.decodeUnknown(CollectionApiKey)("  blog_posts  ");
      const fieldKey = yield* Schema.decodeUnknown(CollectionFieldApiKey)("hero_title");

      assert.strictEqual(collectionKey, "blog_posts");
      assert.strictEqual(fieldKey, "hero_title");
    }),
  );

  it.effect("rejects reserved, ambiguous, uppercase, trailing, and oversized API keys", () =>
    Effect.gen(function* () {
      const invalid = [
        "id",
        "constructor",
        "BlogPosts",
        "blog-posts",
        "blog__posts",
        "blog_posts_",
        "2_posts",
        "x".repeat(64),
      ];
      const exits = yield* Effect.forEach(invalid, (key) =>
        Effect.exit(Schema.decodeUnknown(CollectionApiKey)(key)),
      );

      assert.isTrue(exits.every(Exit.isFailure));
    }),
  );

  it.effect("exposes all M6 kinds and strict type-specific configuration", () =>
    Effect.gen(function* () {
      const kinds = [
        "short_text",
        "long_text",
        "rich_text",
        "number",
        "decimal",
        "money",
        "boolean",
        "date",
        "date_time",
        "enum",
        "url",
        "email",
        "slug",
        "json",
        "object",
        "list",
        "reference",
        "external_asset",
      ] as const;
      for (const kind of kinds) {
        assert.strictEqual(yield* Schema.decodeUnknown(CollectionFieldKind)(kind), kind);
      }

      const unsupportedKind = yield* Effect.exit(
        Schema.decodeUnknown(CollectionFieldKind)("markdown"),
      );
      const emptyConfiguration = yield* Schema.decodeUnknown(CollectionFieldConfiguration)({});
      const configured = yield* Schema.decodeUnknown(CollectionFieldConfiguration)({
        minLength: 1,
      });

      assert.isTrue(Exit.isFailure(unsupportedKind));
      assert.deepEqual(emptyConfiguration, {});
      assert.deepEqual(configured, { minLength: 1 });
    }),
  );

  it.effect("keeps server-owned field identity out of create-field authority", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
        projectId,
        environmentId,
        collectionId,
        draftVersion: 1,
        parentFieldId: null,
        field: {
          apiKey: "title",
          displayLabel: "Title",
          kind: "short_text",
          required: true,
          localization: "localized",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: {},
        },
        id: firstFieldId,
        position: 99,
      });

      assert.isFalse("id" in decoded);
      assert.isFalse("position" in decoded);
    }),
  );

  it.effect("accepts a recursive authoring tree with nullable identities", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(ReplaceCollectionDraftFieldsInput)({
        projectId,
        environmentId,
        collectionId,
        draftVersion: 1,
        authoringVersion: 1,
        fields: [
          {
            id: firstFieldId,
            apiKey: "details",
            displayLabel: "Details",
            kind: "object",
            required: false,
            localization: "localized",
            deprecated: false,
            editor: defaultFieldEditorMetadata,
            configuration: {},
            children: [
              {
                id: null,
                apiKey: "summary",
                displayLabel: "Summary",
                kind: "long_text",
                required: false,
                localization: null,
                deprecated: false,
                editor: defaultFieldEditorMetadata,
                configuration: { maxLength: 5000 },
                children: [],
              },
            ],
          },
        ],
      });

      assert.strictEqual(decoded.fields[0]?.id, firstFieldId);
      assert.strictEqual(decoded.fields[0]?.children[0]?.id, null);
      assert.strictEqual(decoded.fields[0]?.children[0]?.kind, "long_text");
    }),
  );

  it.effect("requires unique bounded reorder and acknowledgement sets", () =>
    Effect.gen(function* () {
      const order = yield* Schema.decodeUnknown(CollectionFieldOrder)([
        firstFieldId,
        secondFieldId,
      ]);
      const duplicateOrder = yield* Effect.exit(
        Schema.decodeUnknown(CollectionFieldOrder)([firstFieldId, firstFieldId]),
      );
      const acknowledgements = yield* Schema.decodeUnknown(AcknowledgedSchemaChangeIds)([
        "a".repeat(64),
        "b".repeat(64),
      ]);
      const duplicateAcknowledgements = yield* Effect.exit(
        Schema.decodeUnknown(AcknowledgedSchemaChangeIds)(["a".repeat(64), "a".repeat(64)]),
      );

      assert.strictEqual(order.length, 2);
      assert.isTrue(Exit.isFailure(duplicateOrder));
      assert.strictEqual(acknowledgements.length, 2);
      assert.isTrue(Exit.isFailure(duplicateAcknowledgements));
    }),
  );

  it.effect("keeps collection, field, revision, command, and event UUID contracts distinct", () =>
    Effect.gen(function* () {
      const validUuid = "019fae8b-1234-7000-8000-000000000099";
      const values = yield* Effect.all([
        Schema.decodeUnknown(CollectionId)(validUuid),
        Schema.decodeUnknown(SchemaRevisionId)(validUuid),
        Schema.decodeUnknown(SchemaPublicationCommandId)(validUuid),
        Schema.decodeUnknown(OutboxEventId)(validUuid),
      ]);
      const malformed = yield* Effect.exit(Schema.decodeUnknown(CollectionId)("collection_1"));

      assert.isTrue(values.every((value) => value === validUuid));
      assert.isTrue(Exit.isFailure(malformed));
    }),
  );

  it("converts collection, field, publication, and revision contracts into OpenAPI JSON Schema", async () => {
    const converter = new EffectSchemaToJsonSchemaConverter();
    const schemas = await Promise.all([
      converter.convert(CreateCollectionInputSchema, { strategy: "input" }),
      converter.convert(CreateCollectionFieldInputSchema, { strategy: "input" }),
      converter.convert(ReplaceCollectionDraftFieldsInputSchema, { strategy: "input" }),
      converter.convert(PublishCollectionSchemaInputSchema, { strategy: "input" }),
      converter.convert(PublishedSchemaRevisionOutputSchema, { strategy: "output" }),
    ]);
    const serialized = schemas.map(([, jsonSchema]) => JSON.stringify(jsonSchema)).join("\n");

    assert.isTrue(schemas.every(([required]) => required));
    assert.include(serialized, "environmentId");
    assert.include(serialized, "configuration");
    assert.include(serialized, "acknowledgedChangeIds");
    assert.include(serialized, "schemaHash");
  });

  it.effect.prop(
    "every accepted API key is already canonical and idempotent",
    [Schema.String],
    ([value]) =>
      Effect.gen(function* () {
        const first = yield* Effect.option(Schema.decodeUnknown(CollectionApiKey)(value));
        if (first._tag === "Some") {
          assert.strictEqual(
            yield* Schema.decodeUnknown(CollectionApiKey)(first.value),
            first.value,
          );
        }
      }),
  );
});

describe("collection cursor contracts", () => {
  it.effect("round trips collection cursors and binds them to the environment", () =>
    Effect.gen(function* () {
      const cursor = yield* encodeCollectionCursor({
        environmentId,
        createdAt,
        collectionId,
      });
      const decoded = yield* decodeCollectionCursor(cursor, environmentId);
      const mismatched = yield* Effect.exit(decodeCollectionCursor(cursor, otherEnvironmentId));

      assert.strictEqual(decoded.collectionId, collectionId);
      assert.strictEqual(decoded.environmentId, environmentId);
      assert.isTrue(Exit.isFailure(mismatched));
    }),
  );
});
