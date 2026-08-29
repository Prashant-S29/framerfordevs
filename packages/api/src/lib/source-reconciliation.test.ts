import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EnumOptionId } from "../contracts/field-system";
import { CollectionFieldId, CollectionId } from "../contracts/schemas";
import { validateCompleteProjectSchema } from "./authoring-schema-document";
import {
  type PersistedProjectSourceIdentities,
  reconcileProjectSourceIdentities,
} from "./source-reconciliation";

function project(includeStatus = true) {
  return {
    collections: [
      {
        sourceKey: "posts",
        apiKey: "articles",
        fields: [
          {
            sourceKey: "seo",
            apiKey: "seo",
            kind: "object",
            required: false,
            localization: "localized",
            configuration: {},
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
          ...(includeStatus
            ? [
                {
                  sourceKey: "status",
                  apiKey: "status",
                  kind: "enum",
                  required: true,
                  localization: "shared",
                  configuration: {
                    options: [
                      { sourceKey: "draft", value: "draft" },
                      { sourceKey: "published", value: "published" },
                    ],
                  },
                } as const,
              ]
            : []),
          {
            sourceKey: "summary",
            apiKey: "summary",
            kind: "long_text",
            required: false,
            localization: "localized",
            configuration: {},
          },
        ],
      },
    ],
  } as const;
}

function typedProject(value: unknown) {
  const result = validateCompleteProjectSchema(value, []);
  if (!result.valid)
    throw new Error(`Invalid reconciliation fixture: ${JSON.stringify(result.issues)}`);
  return result.project;
}

const decodeCollectionId = Schema.decodeUnknownSync(CollectionId);
const decodeFieldId = Schema.decodeUnknownSync(CollectionFieldId);
const decodeOptionId = Schema.decodeUnknownSync(EnumOptionId);
const postsId = decodeCollectionId("019fae8b-1234-7000-8000-000000000201");
const seoId = decodeFieldId("019fae8b-1234-7000-8000-000000000202");
const titleId = decodeFieldId("019fae8b-1234-7000-8000-000000000203");
const statusId = decodeFieldId("019fae8b-1234-7000-8000-000000000204");
const draftId = decodeOptionId("019fae8b-1234-7000-8000-000000000205");
const publishedId = decodeOptionId("019fae8b-1234-7000-8000-000000000206");

const persisted: PersistedProjectSourceIdentities = {
  collections: [{ sourceKey: "posts", collectionId: postsId, state: "active" }],
  fields: [
    {
      collectionSourceKey: "posts",
      sourceKey: "seo",
      fieldId: seoId,
      parentFieldId: null,
      nodeRole: "root",
      state: "active",
    },
    {
      collectionSourceKey: "posts",
      sourceKey: "title",
      fieldId: titleId,
      parentFieldId: seoId,
      nodeRole: "property",
      state: "active",
    },
    {
      collectionSourceKey: "posts",
      sourceKey: "status",
      fieldId: statusId,
      parentFieldId: null,
      nodeRole: "root",
      state: "active",
    },
  ],
  enumOptions: [
    {
      collectionSourceKey: "posts",
      fieldSourceKey: "status",
      sourceKey: "draft",
      optionId: draftId,
      state: "active",
    },
    {
      collectionSourceKey: "posts",
      fieldSourceKey: "status",
      sourceKey: "published",
      optionId: publishedId,
      state: "active",
    },
  ],
};

describe("project source identity reconciliation", () => {
  it("preserves stable IDs across API-key changes and leaves new IDs server-owned", () => {
    const result = reconcileProjectSourceIdentities(typedProject(project()), persisted);

    assert.isTrue(result.valid);
    if (result.valid) {
      assert.deepStrictEqual(result.collections[0], {
        sourceKey: "posts",
        collectionId: postsId,
        status: "existing",
      });
      assert.deepStrictEqual(
        result.fields.find((identity) => identity.sourceKey === "title"),
        {
          collectionSourceKey: "posts",
          sourceKey: "title",
          fieldId: titleId,
          parentSourceKey: "seo",
          nodeRole: "property",
          status: "existing",
        },
      );
      assert.deepStrictEqual(
        result.fields.find((identity) => identity.sourceKey === "summary"),
        {
          collectionSourceKey: "posts",
          sourceKey: "summary",
          fieldId: null,
          parentSourceKey: null,
          nodeRole: "root",
          status: "new",
        },
      );
    }
  });

  it("fails when an existing source identity is reparented", () => {
    const input = project();
    const posts = input.collections[0];
    const seo = posts.fields[0];
    if (!seo || seo.kind !== "object") throw new Error("Expected the SEO object fixture.");
    const title = seo.fields[0];
    if (!title) throw new Error("Expected the title fixture.");
    const reparented = {
      collections: [{ ...posts, fields: [title, ...posts.fields.slice(1)] }],
    };
    const result = reconcileProjectSourceIdentities(typedProject(reparented), persisted);

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.include(
        result.issues.map((issue) => issue.code),
        "source_identity_reparented",
      );
    }
  });

  it("fails closed when retired identities are reused", () => {
    const result = reconcileProjectSourceIdentities(typedProject(project()), {
      ...persisted,
      fields: persisted.fields.map((identity) =>
        identity.sourceKey === "status" ? { ...identity, state: "retired" as const } : identity,
      ),
    });

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.include(
        result.issues.map((issue) => issue.code),
        "source_identity_retired",
      );
    }
  });

  it("marks omitted fields and enum options as removed without treating omission as identity reuse", () => {
    const result = reconcileProjectSourceIdentities(typedProject(project(false)), persisted);

    assert.isTrue(result.valid);
    if (result.valid) {
      assert.deepStrictEqual(result.removedFieldIds, [statusId]);
      assert.deepStrictEqual(result.removedEnumOptionIds, [draftId, publishedId]);
    }
  });

  it("rejects persistence drift that maps two source keys to one stable ID", () => {
    const result = reconcileProjectSourceIdentities(typedProject(project()), {
      ...persisted,
      fields: [
        ...persisted.fields,
        {
          collectionSourceKey: "posts",
          sourceKey: "summary",
          fieldId: titleId,
          parentFieldId: null,
          nodeRole: "root",
          state: "active",
        },
      ],
    });

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.include(
        result.issues.map((issue) => issue.code),
        "source_identity_persistence_duplicate",
      );
    }
  });

  it("rejects omission of an active collection defensively", () => {
    const result = reconcileProjectSourceIdentities(
      typedProject({ collections: [{ sourceKey: "pages", apiKey: "pages", fields: [] }] }),
      persisted,
    );

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.deepStrictEqual(result.issues, [
        {
          path: "$.collections[sourceKey=posts]",
          code: "active_collection_omitted",
        },
      ]);
    }
  });
});
