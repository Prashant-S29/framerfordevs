// Verifies deterministic strict M8 snapshot compilation, pinning, hashing, and aggregate bounds.

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EntryValues } from "../contracts/entries";
import {
  CollectionFieldDefinition,
  type CollectionFieldDefinition as CollectionField,
} from "../contracts/schemas";
import {
  compilePublicationSnapshot,
  publicationSnapshotLimits,
  type CompilePublicationSnapshotInput,
  type ResolvedPublicationReference,
} from "./publication-snapshot";

const ids = {
  entry: "019fae8b-1234-7000-8000-000000000001",
  collection: "019fae8b-1234-7000-8000-000000000002",
  targetCollection: "019fae8b-1234-7000-8000-000000000003",
  targetEntry: "019fae8b-1234-7000-8000-000000000004",
  targetPublication: "019fae8b-1234-7000-8000-000000000005",
  schemaRevision: "019fae8b-1234-7000-8000-000000000006",
  publication: "019fae8b-1234-7000-8000-000000000007",
  titleField: "019fae8b-1234-7000-8000-000000000008",
  detailsField: "019fae8b-1234-7000-8000-000000000009",
  skuField: "019fae8b-1234-7000-8000-000000000010",
  descriptionField: "019fae8b-1234-7000-8000-000000000011",
  referencesField: "019fae8b-1234-7000-8000-000000000012",
  referenceItemField: "019fae8b-1234-7000-8000-000000000013",
  assetField: "019fae8b-1234-7000-8000-000000000014",
} as const;

const editor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: ["owner"],
  editableByRoles: ["owner"],
};

function decodeField(value: unknown): CollectionField {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)(value);
}

function fieldId(index: number): string {
  return `019fae8b-1234-7000-8000-${String(100_000 + index).padStart(12, "0")}`;
}

function compilerFields(): ReadonlyArray<CollectionField> {
  return [
    decodeField({
      id: ids.titleField,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "title",
      displayLabel: "Title",
      kind: "short_text",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor,
      configuration: {},
      children: [],
    }),
    decodeField({
      id: ids.detailsField,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "details",
      displayLabel: "Details",
      kind: "object",
      required: null,
      localization: "mixed",
      deprecated: false,
      position: 1,
      editor,
      configuration: {},
      children: [
        {
          id: ids.skuField,
          parentFieldId: ids.detailsField,
          nodeRole: "object_property",
          apiKey: "sku",
          displayLabel: "SKU",
          kind: "short_text",
          required: false,
          localization: "shared",
          deprecated: false,
          position: 0,
          editor,
          configuration: { default: "default-sku" },
          children: [],
        },
        {
          id: ids.descriptionField,
          parentFieldId: ids.detailsField,
          nodeRole: "object_property",
          apiKey: "description",
          displayLabel: "Description",
          kind: "long_text",
          required: true,
          localization: "localized",
          deprecated: false,
          position: 1,
          editor,
          configuration: {},
          children: [],
        },
      ],
    }),
    decodeField({
      id: ids.referencesField,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "related_entries",
      displayLabel: "Related entries",
      kind: "list",
      required: false,
      localization: "localized",
      deprecated: false,
      position: 2,
      editor,
      configuration: { maxItems: 10 },
      children: [
        {
          id: ids.referenceItemField,
          parentFieldId: ids.referencesField,
          nodeRole: "list_item",
          apiKey: null,
          displayLabel: null,
          kind: "reference",
          required: null,
          localization: null,
          deprecated: false,
          position: 0,
          editor,
          configuration: { targetCollectionId: ids.targetCollection },
          children: [],
        },
      ],
    }),
    decodeField({
      id: ids.assetField,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "hero_asset",
      displayLabel: "Hero asset",
      kind: "external_asset",
      required: false,
      localization: "shared",
      deprecated: false,
      position: 3,
      editor,
      configuration: {
        default: {
          source: "external",
          url: "https://cdn.example.test/hero.png",
          kind: "image",
          title: null,
          alt: "Default hero",
          width: 1600,
          height: 900,
        },
      },
      children: [],
    }),
  ];
}

function entryValues(value: unknown) {
  return Schema.decodeUnknownSync(EntryValues)(value);
}

function resolvedReference(): ResolvedPublicationReference {
  return {
    targetCollectionId: ids.targetCollection,
    targetEntryId: ids.targetEntry,
    targetPublicationId: ids.targetPublication,
    targetPublicationSequence: 3,
  };
}

function compileInput(
  overrides: Partial<CompilePublicationSnapshotInput> = {},
): CompilePublicationSnapshotInput {
  return {
    fields: compilerFields(),
    sharedValues: entryValues({}),
    localizedValues: entryValues({
      [ids.titleField]: "Cafe\u0301",
      [ids.detailsField]: { [ids.descriptionField]: "Localized description" },
      [ids.referencesField]: [ids.targetEntry.toUpperCase(), ids.targetEntry],
    }),
    resolvedReferences: [resolvedReference()],
    authority: {
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: "019fae8b-1234-7000-8000-000000000015",
      localizedVersion: 2,
    },
    document: {
      entryId: ids.entry,
      collectionId: ids.collection,
      locale: "hi",
      schemaRevisionId: ids.schemaRevision,
      contractHash: "a".repeat(64),
      publicationId: ids.publication,
      publicationSequence: 1,
      publishedAt: "2026-03-21T12:00:00.000Z",
    },
    ...overrides,
  };
}

function sizedFields(): ReadonlyArray<CollectionField> {
  return Array.from({ length: 24 }, (_, index) =>
    decodeField({
      id: fieldId(index),
      parentFieldId: null,
      nodeRole: "root",
      apiKey: `large_field_${String(index).padStart(2, "0")}`,
      displayLabel: `Large field ${index}`,
      kind: "long_text",
      required: true,
      localization: index % 2 === 0 ? "shared" : "localized",
      deprecated: false,
      position: index,
      editor,
      configuration: { maxLength: 50_000 },
      children: [],
    }),
  );
}

function compileAtCombinedBytes(targetBytes: number) {
  const fields = sizedFields();
  const lengths = Array.from({ length: fields.length }, () => 40_000);
  const values = () => {
    const shared: Record<string, unknown> = {};
    const localized: Record<string, unknown> = {};
    fields.forEach((field, index) => {
      Reflect.set(index % 2 === 0 ? shared : localized, field.id, "x".repeat(lengths[index] ?? 0));
    });
    return { shared, localized };
  };
  const initialValues = values();
  const initial = compilePublicationSnapshot(
    compileInput({
      fields,
      sharedValues: entryValues(initialValues.shared),
      localizedValues: entryValues(initialValues.localized),
      resolvedReferences: [],
    }),
  );
  assert.isNotNull(initial.candidate);
  let remaining = targetBytes - (initial.candidate?.size.combinedBytes ?? targetBytes);
  for (let index = 0; index < lengths.length && remaining > 0; index += 1) {
    const addition = Math.min(10_000, remaining);
    lengths[index] = (lengths[index] ?? 0) + addition;
    remaining -= addition;
  }
  assert.strictEqual(remaining, 0);
  const adjusted = values();
  return compilePublicationSnapshot(
    compileInput({
      fields,
      sharedValues: entryValues(adjusted.shared),
      localizedValues: entryValues(adjusted.localized),
      resolvedReferences: [],
    }),
  );
}

describe("publication snapshot compiler", () => {
  it("merges exact partitions, applies class-backed defaults, normalizes, and pins every occurrence", () => {
    const historicalFieldId = "019fae8b-1234-7000-8000-000000000099";
    const first = compilePublicationSnapshot(
      compileInput({ sharedValues: entryValues({ [historicalFieldId]: "removed history" }) }),
    );
    const second = compilePublicationSnapshot(
      compileInput({ sharedValues: entryValues({ [historicalFieldId]: "removed history" }) }),
    );

    assert.isTrue(first.valid);
    assert.isNotNull(first.candidate);
    assert.deepEqual(first.candidate?.document.data, {
      title: "Café",
      details: { sku: "default-sku", description: "Localized description" },
      related_entries: [ids.targetEntry, ids.targetEntry],
      hero_asset: {
        source: "external",
        url: "https://cdn.example.test/hero.png",
        kind: "image",
        title: null,
        alt: "Default hero",
        width: 1600,
        height: 900,
      },
    });
    assert.deepEqual(
      first.candidate?.referenceManifest.map((item) => [item.path, item.targetPublicationId]),
      [
        ["related_entries[0]", ids.targetPublication],
        ["related_entries[1]", ids.targetPublication],
      ],
    );
    assert.strictEqual(first.candidate?.contentHash, second.candidate?.contentHash);
    assert.strictEqual(first.candidate?.authorityHash, second.candidate?.authorityHash);
    assert.strictEqual(first.candidate?.documentHash, second.candidate?.documentHash);
    assert.strictEqual(
      first.candidate?.referenceManifestHash,
      second.candidate?.referenceManifestHash,
    );
  });

  it("rejects missing required values and present references without exact-locale publications", () => {
    const missingRequired = compilePublicationSnapshot(
      compileInput({ localizedValues: entryValues({}), resolvedReferences: [] }),
    );
    const missingTarget = compilePublicationSnapshot(compileInput({ resolvedReferences: [] }));

    assert.isFalse(missingRequired.valid);
    assert.isTrue(missingRequired.issues.some((issue) => issue.code === "required"));
    assert.isFalse(missingTarget.valid);
    assert.isTrue(
      missingTarget.issues.some((issue) => issue.code === "reference_target_locale_unpublished"),
    );
    assert.isNull(missingTarget.candidate);
  });

  it("rejects terminal shared/localized ownership collisions", () => {
    const result = compilePublicationSnapshot(
      compileInput({
        sharedValues: entryValues({ [ids.titleField]: "Wrong partition" }),
      }),
    );

    assert.isFalse(result.valid);
    assert.isTrue(result.issues.some((issue) => issue.code === "entry_fragment_collision"));
  });

  it("derives stable changed root IDs while allowing metadata-only publication changes", () => {
    const initial = compilePublicationSnapshot(compileInput());
    assert.isNotNull(initial.candidate);
    const previousData = initial.candidate?.document.data ?? null;
    const unchanged = compilePublicationSnapshot(compileInput({ previousData }));

    assert.deepEqual(unchanged.candidate?.changedFieldIds, []);
  });

  it("accepts below/exact aggregate boundary bytes and rejects one byte above without truncation", () => {
    const below = compileAtCombinedBytes(publicationSnapshotLimits.combinedBytes - 1);
    const exact = compileAtCombinedBytes(publicationSnapshotLimits.combinedBytes);
    const above = compileAtCombinedBytes(publicationSnapshotLimits.combinedBytes + 1);

    assert.isTrue(below.valid);
    assert.strictEqual(
      below.candidate?.size.combinedBytes,
      publicationSnapshotLimits.combinedBytes - 1,
    );
    assert.isTrue(exact.valid);
    assert.strictEqual(
      exact.candidate?.size.combinedBytes,
      publicationSnapshotLimits.combinedBytes,
    );
    assert.strictEqual(exact.candidate?.size.bucket, "near_limit");
    assert.isFalse(above.valid);
    assert.strictEqual(
      above.candidate?.size.combinedBytes,
      publicationSnapshotLimits.combinedBytes + 1,
    );
    assert.strictEqual(above.candidate?.size.bucket, "over_limit");
    assert.isTrue(above.issues.some((issue) => issue.code === "publication_snapshot_too_large"));
    const untruncatedValue = above.candidate?.document.data.large_field_00;
    if (typeof untruncatedValue !== "string") assert.fail("Expected untruncated string data.");
    assert.isTrue(untruncatedValue.length >= 40_000);
  });
});
