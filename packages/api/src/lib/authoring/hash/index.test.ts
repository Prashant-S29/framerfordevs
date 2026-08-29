import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EnumOptionId } from "../../../contracts/field";
import { CollectionFieldId, CollectionId, SchemaRevisionId } from "../../../contracts/schema";
import { validateCompleteProjectSchema } from "../schema-document";
import {
  computeCollectionStructureHash,
  computeProjectStructureManifestHash,
  type StructureIdentityMap,
} from "./index";

function project(reverseFields = false, reverseOptions = false) {
  const title = {
    sourceKey: "title",
    apiKey: "title",
    kind: "short_text",
    required: true,
    localization: "localized",
    configuration: { maxLength: 160 },
  } as const;
  const status = {
    sourceKey: "status",
    apiKey: "status",
    kind: "enum",
    required: true,
    localization: "shared",
    configuration: {
      options: reverseOptions
        ? [
            { sourceKey: "published", value: "published" },
            { sourceKey: "draft", value: "draft" },
          ]
        : [
            { sourceKey: "draft", value: "draft" },
            { sourceKey: "published", value: "published" },
          ],
      default: "draft",
    },
  } as const;
  return {
    collections: [
      {
        sourceKey: "posts",
        apiKey: "posts",
        fields: reverseFields ? [status, title] : [title, status],
      },
    ],
  };
}

function typedCollection(value: unknown) {
  const result = validateCompleteProjectSchema(value, []);
  if (!result.valid) throw new Error(`Invalid hash fixture: ${JSON.stringify(result.issues)}`);
  const collection = result.project.collections[0];
  if (!collection) throw new Error("Expected a collection fixture.");
  return collection;
}

const collectionId = Schema.decodeUnknownSync(CollectionId)("019fae8b-1234-7000-8000-000000000101");
const titleId = Schema.decodeUnknownSync(CollectionFieldId)("019fae8b-1234-7000-8000-000000000102");
const statusId = Schema.decodeUnknownSync(CollectionFieldId)(
  "019fae8b-1234-7000-8000-000000000103",
);
const draftId = Schema.decodeUnknownSync(EnumOptionId)("019fae8b-1234-7000-8000-000000000104");
const publishedId = Schema.decodeUnknownSync(EnumOptionId)("019fae8b-1234-7000-8000-000000000105");

const identities: StructureIdentityMap = {
  collections: [{ sourceKey: "posts", collectionId }],
  fields: [
    { collectionSourceKey: "posts", sourceKey: "title", fieldId: titleId },
    { collectionSourceKey: "posts", sourceKey: "status", fieldId: statusId },
  ],
  enumOptions: [
    {
      collectionSourceKey: "posts",
      fieldSourceKey: "status",
      sourceKey: "draft",
      optionId: draftId,
    },
    {
      collectionSourceKey: "posts",
      fieldSourceKey: "status",
      sourceKey: "published",
      optionId: publishedId,
    },
  ],
};

describe("code-owned structure hash", () => {
  it("is stable across collection-field and enum presentation ordering", () => {
    const first = computeCollectionStructureHash(typedCollection(project()), identities);
    const reordered = computeCollectionStructureHash(
      typedCollection(project(true, true)),
      identities,
    );

    assert.isTrue(first.valid);
    assert.isTrue(reordered.valid);
    if (first.valid && reordered.valid) {
      assert.strictEqual(first.structureHash, reordered.structureHash);
      assert.strictEqual(first.canonicalJson, reordered.canonicalJson);
    }
  });

  it("changes when code-owned structure changes", () => {
    const first = computeCollectionStructureHash(typedCollection(project()), identities);
    const original = project();
    const collection = original.collections[0];
    if (!collection) throw new Error("Expected the project fixture collection.");
    const renamed = { collections: [{ ...collection, apiKey: "articles" }] };
    const second = computeCollectionStructureHash(typedCollection(renamed), identities);

    assert.isTrue(first.valid);
    assert.isTrue(second.valid);
    if (first.valid && second.valid)
      assert.notStrictEqual(first.structureHash, second.structureHash);
  });

  it("binds source identities to server-generated stable IDs", () => {
    const first = computeCollectionStructureHash(typedCollection(project()), identities);
    const replacementTitleId = Schema.decodeUnknownSync(CollectionFieldId)(
      "019fae8b-1234-7000-8000-000000000199",
    );
    const replaced = computeCollectionStructureHash(typedCollection(project()), {
      ...identities,
      fields: identities.fields.map((identity) =>
        identity.sourceKey === "title" ? { ...identity, fieldId: replacementTitleId } : identity,
      ),
    });

    assert.isTrue(first.valid);
    assert.isTrue(replaced.valid);
    if (first.valid && replaced.valid)
      assert.notStrictEqual(first.structureHash, replaced.structureHash);
  });

  it("fails closed before hashing when any field or enum source identity is unresolved", () => {
    const missingField = computeCollectionStructureHash(typedCollection(project()), {
      ...identities,
      fields: identities.fields.filter((identity) => identity.sourceKey !== "title"),
      enumOptions: identities.enumOptions.filter((identity) => identity.sourceKey !== "draft"),
    });

    assert.isFalse(missingField.valid);
    if (!missingField.valid) {
      assert.deepStrictEqual(
        [...new Set(missingField.issues.map((issue) => issue.code))],
        ["source_identity_missing"],
      );
      assert.isTrue(missingField.issues.length >= 2);
    }
  });

  it("binds sorted per-collection revision authority into one project manifest hash", () => {
    const collection = computeCollectionStructureHash(typedCollection(project()), identities);
    if (!collection.valid) throw new Error("Expected a resolved collection structure.");
    const firstRevision = Schema.decodeUnknownSync(SchemaRevisionId)(
      "019fae8b-1234-7000-8000-000000000190",
    );
    const secondRevision = Schema.decodeUnknownSync(SchemaRevisionId)(
      "019fae8b-1234-7000-8000-000000000191",
    );
    const first = computeProjectStructureManifestHash([
      {
        collectionSourceKey: "posts",
        collectionId,
        revisionId: firstRevision,
        structureHash: collection.structureHash,
      },
    ]);
    const repeated = computeProjectStructureManifestHash([
      {
        collectionSourceKey: "posts",
        collectionId,
        revisionId: firstRevision,
        structureHash: collection.structureHash,
      },
    ]);
    const advanced = computeProjectStructureManifestHash([
      {
        collectionSourceKey: "posts",
        collectionId,
        revisionId: secondRevision,
        structureHash: collection.structureHash,
      },
    ]);

    assert.strictEqual(first, repeated);
    assert.notStrictEqual(first, advanced);
  });
});
