import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EnumOptionId } from "../../../contracts/field";
import {
  CollectionFieldDefinition,
  CollectionFieldId,
  CollectionId,
} from "../../../contracts/schema";
import { defaultFieldEditorMetadata } from "../../../contracts/schema";
import { buildAuthoringSchemaExport } from "./index";

const postsId = CollectionId.make("019fae8b-1234-7000-8000-000000000001");
const authorsId = CollectionId.make("019fae8b-1234-7000-8000-000000000002");
const statusId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000003");
const draftId = EnumOptionId.make("019fae8b-1234-7000-8000-000000000004");
const authorId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000005");
const seoId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000006");
const titleId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000007");

function field(value: unknown) {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)(value);
}

const status = field({
  id: statusId,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "status",
  displayLabel: "Hosted status label",
  kind: "enum",
  required: true,
  localization: "shared",
  deprecated: false,
  position: 8,
  editor: { ...defaultFieldEditorMetadata, helpText: "Hosted presentation only" },
  configuration: {
    options: [{ id: draftId, value: "draft", label: "Draft label", position: 9 }],
    default: "draft",
  },
  children: [],
});
const author = field({
  id: authorId,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "author",
  displayLabel: "Author",
  kind: "reference",
  required: false,
  localization: "shared",
  deprecated: true,
  position: 4,
  editor: defaultFieldEditorMetadata,
  configuration: { targetCollectionId: authorsId },
  children: [],
});
const title = field({
  id: titleId,
  parentFieldId: seoId,
  nodeRole: "object_property",
  apiKey: "title",
  displayLabel: "SEO title",
  kind: "short_text",
  required: true,
  localization: "localized",
  deprecated: false,
  position: 0,
  editor: defaultFieldEditorMetadata,
  configuration: { maxLength: 160 },
  children: [],
});
const seo = field({
  id: seoId,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "seo",
  displayLabel: "SEO",
  kind: "object",
  required: false,
  localization: "mixed",
  deprecated: false,
  position: 2,
  editor: defaultFieldEditorMetadata,
  configuration: {},
  children: [title],
});

const identities = {
  collections: [
    { sourceKey: "posts", collectionId: postsId, state: "active" as const },
    { sourceKey: "authors", collectionId: authorsId, state: "active" as const },
  ],
  fields: [
    {
      collectionSourceKey: "posts",
      sourceKey: "status",
      fieldId: statusId,
      parentFieldId: null,
      nodeRole: "root" as const,
      state: "active" as const,
    },
    {
      collectionSourceKey: "posts",
      sourceKey: "author",
      fieldId: authorId,
      parentFieldId: null,
      nodeRole: "root" as const,
      state: "active" as const,
    },
    {
      collectionSourceKey: "posts",
      sourceKey: "seo",
      fieldId: seoId,
      parentFieldId: null,
      nodeRole: "root" as const,
      state: "active" as const,
    },
    {
      collectionSourceKey: "posts",
      sourceKey: "seo_title",
      fieldId: titleId,
      parentFieldId: seoId,
      nodeRole: "property" as const,
      state: "active" as const,
    },
  ],
  enumOptions: [
    {
      collectionSourceKey: "posts",
      fieldSourceKey: "status",
      sourceKey: "draft",
      optionId: draftId,
      state: "active" as const,
    },
  ],
};

describe("Authoring schema export", () => {
  it("exports only code-owned structure with authoritative source keys", () => {
    const result = buildAuthoringSchemaExport({
      collections: [
        {
          sourceKey: "posts",
          collectionId: postsId,
          apiKey: "posts",
          published: { fields: [status, author, seo] },
        },
        {
          sourceKey: "authors",
          collectionId: authorsId,
          apiKey: "authors",
          published: { fields: [] },
        },
      ],
      persistedIdentities: identities,
    });

    assert.isTrue(result.valid);
    if (!result.valid) return;
    assert.deepStrictEqual(result.project, {
      collections: [
        { sourceKey: "authors", apiKey: "authors", fields: [] },
        {
          sourceKey: "posts",
          apiKey: "posts",
          fields: [
            {
              sourceKey: "author",
              apiKey: "author",
              kind: "reference",
              required: false,
              localization: "shared",
              deprecated: true,
              configuration: { targetCollectionSourceKey: "authors" },
            },
            {
              sourceKey: "seo",
              apiKey: "seo",
              kind: "object",
              required: false,
              localization: "mixed",
              configuration: {},
              fields: [
                {
                  sourceKey: "seo_title",
                  apiKey: "title",
                  kind: "short_text",
                  required: true,
                  localization: "localized",
                  configuration: { maxLength: 160 },
                },
              ],
            },
            {
              sourceKey: "status",
              apiKey: "status",
              kind: "enum",
              required: true,
              localization: "shared",
              configuration: {
                options: [{ sourceKey: "draft", value: "draft" }],
                default: "draft",
              },
            },
          ],
        },
      ],
    });
    assert.notMatch(JSON.stringify(result.project), /Hosted|label|helpText|position|[0-9a-f]{8}-/u);
  });

  it("fails closed when published stable IDs lack source authority", () => {
    const result = buildAuthoringSchemaExport({
      collections: [
        {
          sourceKey: "posts",
          collectionId: postsId,
          apiKey: "posts",
          published: { fields: [status] },
        },
      ],
      persistedIdentities: { ...identities, enumOptions: [] },
    });

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.deepStrictEqual(
        result.issues.map((issue) => issue.code),
        ["enum_option_source_identity_missing"],
      );
    }
  });
});
