// Locks the approved pre-Drizzle realistic M8 snapshot fixture and its exact byte report.

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EntryValues } from "../../../contracts/entry";
import {
  CollectionFieldDefinition,
  type CollectionFieldDefinition as CollectionField,
} from "../../../contracts/schema";
import {
  compilePublicationSnapshot,
  publicationSnapshotLimits,
  type ResolvedPublicationReference,
} from "./index";

const editor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: ["owner"],
  editableByRoles: ["owner"],
};

function uuid(index: number): string {
  return `019fae8b-1234-7000-8000-${String(200_000 + index).padStart(12, "0")}`;
}

function decodeField(value: unknown): CollectionField {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)(value);
}

function textField(options: {
  readonly index: number;
  readonly position: number;
  readonly apiKey: string;
  readonly localization: "shared" | "localized";
}): CollectionField {
  return decodeField({
    id: uuid(options.index),
    parentFieldId: null,
    nodeRole: "root",
    apiKey: options.apiKey,
    displayLabel: `Long-form section ${options.position}`,
    kind: "long_text",
    required: true,
    localization: options.localization,
    deprecated: false,
    position: options.position,
    editor,
    configuration: { maxLength: 50_000 },
    children: [],
  });
}

function realisticFixture() {
  const targetCollectionId = uuid(900);
  const richTextFieldId = uuid(1);
  const mixedFieldId = uuid(20);
  const sharedMetadataFieldId = uuid(21);
  const localizedMediaFieldId = uuid(22);
  const assetListFieldId = uuid(23);
  const assetItemFieldId = uuid(24);
  const singularReferenceFieldId = uuid(30);
  const referenceListFieldId = uuid(31);
  const referenceItemFieldId = uuid(32);
  const jsonFieldId = uuid(40);
  const sharedTextFields = Array.from({ length: 6 }, (_, index) =>
    textField({
      index: 100 + index,
      position: 1 + index,
      apiKey: `shared_long_form_content_section_with_realistic_key_${index}`,
      localization: "shared",
    }),
  );
  const localizedTextFields = Array.from({ length: 4 }, (_, index) =>
    textField({
      index: 120 + index,
      position: 7 + index,
      apiKey: `localized_long_form_content_section_with_realistic_key_${index}`,
      localization: "localized",
    }),
  );
  const fields: ReadonlyArray<CollectionField> = [
    decodeField({
      id: richTextFieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "multilingual_portable_text_article_body_with_long_api_key",
      displayLabel: "Multilingual Portable Text article body",
      kind: "rich_text",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor,
      configuration: {},
      children: [],
    }),
    ...sharedTextFields,
    ...localizedTextFields,
    decodeField({
      id: mixedFieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "mixed_editorial_metadata_and_localized_media_collection",
      displayLabel: "Mixed editorial metadata and localized media",
      kind: "object",
      required: null,
      localization: "mixed",
      deprecated: false,
      position: 11,
      editor,
      configuration: {},
      children: [
        {
          id: sharedMetadataFieldId,
          parentFieldId: mixedFieldId,
          nodeRole: "object_property",
          apiKey: "shared_editorial_summary_with_unicode_content",
          displayLabel: "Shared editorial summary",
          kind: "long_text",
          required: true,
          localization: "shared",
          deprecated: false,
          position: 0,
          editor,
          configuration: { maxLength: 50_000 },
          children: [],
        },
        {
          id: localizedMediaFieldId,
          parentFieldId: mixedFieldId,
          nodeRole: "object_property",
          apiKey: "localized_media_gallery_with_external_assets",
          displayLabel: "Localized media gallery",
          kind: "object",
          required: true,
          localization: "localized",
          deprecated: false,
          position: 1,
          editor,
          configuration: {},
          children: [
            {
              id: assetListFieldId,
              parentFieldId: localizedMediaFieldId,
              nodeRole: "object_property",
              apiKey: "external_assets_with_descriptive_metadata",
              displayLabel: "External assets",
              kind: "list",
              required: true,
              localization: null,
              deprecated: false,
              position: 0,
              editor,
              configuration: { minItems: 1, maxItems: 20 },
              children: [
                {
                  id: assetItemFieldId,
                  parentFieldId: assetListFieldId,
                  nodeRole: "list_item",
                  apiKey: null,
                  displayLabel: null,
                  kind: "external_asset",
                  required: null,
                  localization: null,
                  deprecated: false,
                  position: 0,
                  editor,
                  configuration: {},
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    }),
    decodeField({
      id: singularReferenceFieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "primary_related_entry_requiring_exact_locale_publication",
      displayLabel: "Primary related entry",
      kind: "reference",
      required: true,
      localization: "shared",
      deprecated: false,
      position: 12,
      editor,
      configuration: { targetCollectionId },
      children: [],
    }),
    decodeField({
      id: referenceListFieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "related_entries_with_occurrence_level_pinned_manifest",
      displayLabel: "Related entries",
      kind: "list",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 13,
      editor,
      configuration: { minItems: 1, maxItems: 100 },
      children: [
        {
          id: referenceItemFieldId,
          parentFieldId: referenceListFieldId,
          nodeRole: "list_item",
          apiKey: null,
          displayLabel: null,
          kind: "reference",
          required: null,
          localization: null,
          deprecated: false,
          position: 0,
          editor,
          configuration: { targetCollectionId },
          children: [],
        },
      ],
    }),
    decodeField({
      id: jsonFieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "structured_json_configuration_with_multilingual_unicode_data",
      displayLabel: "Structured JSON configuration",
      kind: "json",
      required: true,
      localization: "shared",
      deprecated: false,
      position: 14,
      editor,
      configuration: { maxBytes: 65_536, maxDepth: 10 },
      children: [],
    }),
  ];

  const unicodeLongText = (label: string) =>
    `${label} — भारत, ગુજરાત, café, 東京, 🌏\n${"realistic editorial prose ".repeat(1_665)}`;
  const richText = {
    version: 1,
    profile: "ffd-portable-text",
    blocks: [
      {
        _key: "article-block-1",
        _type: "block",
        style: "normal",
        children: [
          {
            _key: "article-span-1",
            _type: "span",
            text: "भारत café ગુજરાતી हिंदी 🌏 long-form editorial content ".repeat(1_650),
            marks: ["strong"],
          },
        ],
        markDefs: [],
      },
    ],
  };
  const assets = Array.from({ length: 12 }, (_, index) => ({
    source: "external",
    url: `https://cdn.example.test/library/${index}/${"descriptive-path-segment-".repeat(45)}image.webp`,
    kind: "image",
    title: `Editorial image ${index} — चित्र`,
    alt: `Localized alternative text ${index} — ગુજરાતી`,
    width: 2400,
    height: 1600,
  }));
  const targetEntryIds = Array.from({ length: 10 }, (_, index) => uuid(500 + index));
  const resolvedReferences: ReadonlyArray<ResolvedPublicationReference> = targetEntryIds.map(
    (targetEntryId, index) => ({
      targetCollectionId,
      targetEntryId,
      targetPublicationId: uuid(600 + index),
      targetPublicationSequence: index + 1,
    }),
  );

  const shared: Record<string, unknown> = {
    [sharedMetadataFieldId]: unicodeLongText("Shared nested editorial metadata"),
    [singularReferenceFieldId]: targetEntryIds[0],
    [jsonFieldId]: {
      profile: "realistic-fixture@1",
      multilingual: "नमस्ते café ગુજરાતી 東京 🌏",
      nested: { values: Array.from({ length: 120 }, (_, index) => ({ index, enabled: true })) },
      payload: "bounded-json-content-".repeat(1_250),
    },
  };
  for (const [index, field] of sharedTextFields.entries()) {
    Reflect.set(shared, field.id, unicodeLongText(`Shared section ${index}`));
  }
  Reflect.set(shared, mixedFieldId, { [sharedMetadataFieldId]: shared[sharedMetadataFieldId] });
  Reflect.deleteProperty(shared, sharedMetadataFieldId);

  const localized: Record<string, unknown> = {
    [richTextFieldId]: richText,
    [mixedFieldId]: {
      [localizedMediaFieldId]: { [assetListFieldId]: assets },
    },
    [referenceListFieldId]: Array.from(
      { length: 50 },
      (_, index) => targetEntryIds[index % targetEntryIds.length],
    ),
  };
  for (const [index, field] of localizedTextFields.entries()) {
    Reflect.set(localized, field.id, unicodeLongText(`Localized section ${index}`));
  }

  return compilePublicationSnapshot({
    fields,
    sharedValues: Schema.decodeUnknownSync(EntryValues)(shared),
    localizedValues: Schema.decodeUnknownSync(EntryValues)(localized),
    resolvedReferences,
    authority: {
      sharedRevisionId: uuid(700),
      sharedVersion: 8,
      localizedRevisionId: uuid(701),
      localizedVersion: 5,
    },
    document: {
      entryId: uuid(800),
      collectionId: uuid(801),
      locale: "hi",
      schemaRevisionId: uuid(802),
      contractHash: "b".repeat(64),
      publicationId: uuid(803),
      publicationSequence: 4,
      publishedAt: "2026-03-21T12:00:00.000Z",
    },
  });
}

describe("M8 realistic publication fixture gate", () => {
  it("retains at least 25 percent aggregate headroom with exact locked measurements", () => {
    const result = realisticFixture();

    assert.isTrue(result.valid);
    assert.isNotNull(result.candidate);
    assert.strictEqual(result.candidate?.referenceManifest.length, 51);
    assert.strictEqual(result.candidate?.size.documentBytes, 675_221);
    assert.strictEqual(result.candidate?.size.referenceManifestBytes, 16_825);
    assert.strictEqual(result.candidate?.size.combinedBytes, 692_046);
    assert.isTrue(
      (result.candidate?.size.combinedBytes ?? Number.POSITIVE_INFINITY) <=
        publicationSnapshotLimits.fixtureHeadroomBytes,
    );
  });
});
