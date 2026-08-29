import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import type { ProjectSchema } from "@framerfordevs/schema";

import {
  AuthUserId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  WorkspaceId,
} from "../contracts/platform";
import {
  CollectionApiKey,
  CollectionDisplayName,
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
import { EditorLayout, EnumOptionId } from "../contracts/field-system";
import { compileCodeCollectionFields } from "./code-schema-candidate";
import { validateDefinitionTree } from "./field-validation";
import type { StructureIdentityMap } from "./structure-hash";

const decodeCollectionId = Schema.decodeUnknownSync(CollectionId);
const decodeFieldId = Schema.decodeUnknownSync(CollectionFieldId);
const decodeOptionId = Schema.decodeUnknownSync(EnumOptionId);
const postsId = decodeCollectionId("019fae8b-1234-7000-8000-000000000401");
const authorsId = decodeCollectionId("019fae8b-1234-7000-8000-000000000402");
const authorId = decodeFieldId("019fae8b-1234-7000-8000-000000000403");
const statusId = decodeFieldId("019fae8b-1234-7000-8000-000000000404");
const titleId = decodeFieldId("019fae8b-1234-7000-8000-000000000405");
const summaryId = decodeFieldId("019fae8b-1234-7000-8000-000000000406");
const draftId = decodeOptionId("019fae8b-1234-7000-8000-000000000407");
const publishedId = decodeOptionId("019fae8b-1234-7000-8000-000000000408");

function project(includeSummary = false): ProjectSchema {
  return {
    collections: [
      {
        sourceKey: "posts",
        apiKey: "posts",
        fields: [
          {
            sourceKey: "status",
            apiKey: "status",
            kind: "enum",
            required: true,
            localization: "shared",
            configuration: {
              options: [
                { sourceKey: "published", value: "published" },
                { sourceKey: "draft", value: "draft" },
              ],
              default: "draft",
            },
          },
          {
            sourceKey: "author",
            apiKey: "author",
            kind: "reference",
            required: false,
            localization: "shared",
            configuration: { targetCollectionSourceKey: "authors" },
          },
          {
            sourceKey: "title",
            apiKey: "title",
            kind: "short_text",
            required: true,
            localization: "localized",
            configuration: { maxLength: 160 },
          },
          ...(includeSummary
            ? [
                {
                  sourceKey: "summary",
                  apiKey: "summary",
                  kind: "long_text" as const,
                  required: false,
                  localization: "localized" as const,
                  configuration: {},
                },
              ]
            : []),
        ],
      },
      { sourceKey: "authors", apiKey: "authors", fields: [] },
    ],
  };
}

const identities: StructureIdentityMap = {
  collections: [
    { sourceKey: "posts", collectionId: postsId },
    { sourceKey: "authors", collectionId: authorsId },
  ],
  fields: [
    { collectionSourceKey: "posts", sourceKey: "author", fieldId: authorId },
    { collectionSourceKey: "posts", sourceKey: "status", fieldId: statusId },
    { collectionSourceKey: "posts", sourceKey: "title", fieldId: titleId },
    { collectionSourceKey: "posts", sourceKey: "summary", fieldId: summaryId },
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

function requireCompiled(includeSummary = false, published: PublishedSchemaRevision | null = null) {
  const posts = project(includeSummary).collections[0];
  if (!posts) throw new Error("Expected the posts fixture.");
  const result = compileCodeCollectionFields(posts, identities, published);
  if (!result.valid) throw new Error(`Candidate failed: ${JSON.stringify(result.issues)}`);
  return result.fields;
}

function publishedRevision(fields: ReadonlyArray<CollectionFieldDefinition>) {
  const layout = Schema.decodeUnknownSync(EditorLayout)({
    version: 1,
    tabs: [
      {
        id: "00000000-0000-4000-8000-000000000411",
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
        groups: [
          {
            id: "00000000-0000-4000-8000-000000000412",
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
            fields: fields.map((field, position) => ({
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
  return PublishedSchemaRevision.make({
    id: SchemaRevisionId.make("019fae8b-1234-7000-8000-000000000413"),
    workspaceId: WorkspaceId.make("019fae8b-1234-7000-8000-000000000414"),
    projectId: ProjectId.make("019fae8b-1234-7000-8000-000000000415"),
    environmentId: EnvironmentId.make("019fae8b-1234-7000-8000-000000000416"),
    collectionId: postsId,
    sequence: 1,
    previousRevisionId: null,
    formatVersion: 2,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: null,
    collectionApiKey: CollectionApiKey.make("posts"),
    collectionDisplayName: CollectionDisplayName.make("Posts"),
    collectionDescription: null,
    schemaHash: SchemaHash.make("a".repeat(64)),
    contractHash: ContractHash.make("b".repeat(64)),
    commandId: SchemaPublicationCommandId.make("019fae8b-1234-7000-8000-000000000417"),
    nonBreakingChangeCount: 0,
    potentiallyBreakingChangeCount: 0,
    breakingChangeCount: 0,
    publishedByUserId: AuthUserId.make("candidate-test-user"),
    publishedByCredentialId: null,
    publishedAt: IsoDateTime.make("2026-08-23T12:00:00.000Z"),
    fields,
    editorLayout: layout,
  });
}

describe("code schema collection candidate", () => {
  it("translates source references and enum options to server-generated stable IDs", () => {
    const fields = requireCompiled();
    const author = fields.find((field) => field.id === authorId);
    const status = fields.find((field) => field.id === statusId);

    assert.strictEqual(author?.kind, "reference");
    if (author?.kind === "reference")
      assert.strictEqual(author.configuration.targetCollectionId, authorsId);
    assert.strictEqual(status?.kind, "enum");
    if (status?.kind === "enum") {
      assert.deepStrictEqual(
        status.configuration.options.map(({ id, value, label, position }) => ({
          id,
          value,
          label,
          position,
        })),
        [
          { id: draftId, value: "draft", label: "Draft", position: 0 },
          { id: publishedId, value: "published", label: "Published", position: 1 },
        ],
      );
    }
    assert.isTrue(validateDefinitionTree(fields).valid);
  });

  it("preserves existing field and enum presentation while appending new fields deterministically", () => {
    const initial = requireCompiled();
    const presented = initial
      .map((field) => {
        if (field.id === titleId)
          return Schema.decodeUnknownSync(CollectionFieldDefinition)({
            ...field,
            displayLabel: CollectionFieldDisplayLabel.make("Headline"),
            position: 0,
          });
        if (field.id === statusId && field.kind === "enum")
          return Schema.decodeUnknownSync(CollectionFieldDefinition)({
            ...field,
            displayLabel: CollectionFieldDisplayLabel.make("Workflow"),
            position: 1,
            configuration: {
              ...field.configuration,
              options: [...field.configuration.options].reverse().map((option, position) => ({
                ...option,
                label: option.value === "draft" ? "Working" : "Live",
                position,
              })),
            },
          });
        return Schema.decodeUnknownSync(CollectionFieldDefinition)({ ...field, position: 2 });
      })
      .sort((left, right) => left.position - right.position);
    const candidate = requireCompiled(true, publishedRevision(presented));
    const title = candidate.find((field) => field.id === titleId);
    const status = candidate.find((field) => field.id === statusId);

    assert.deepStrictEqual(
      candidate.map((field) => field.id),
      [titleId, statusId, authorId, summaryId],
    );
    assert.strictEqual(title?.displayLabel, "Headline");
    assert.strictEqual(status?.displayLabel, "Workflow");
    if (status?.kind === "enum") {
      assert.deepStrictEqual(
        status.configuration.options.map((option) => option.label),
        ["Live", "Working"],
      );
    }
    assert.strictEqual(candidate.at(-1)?.displayLabel, "Summary");
  });

  it("fails closed without leaking configuration when an identity is unresolved", () => {
    const posts = project().collections[0];
    if (!posts) throw new Error("Expected the posts fixture.");
    const result = compileCodeCollectionFields(
      posts,
      {
        ...identities,
        fields: identities.fields.filter((identity) => identity.sourceKey !== "title"),
      },
      null,
    );

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.include(
        result.issues.map((issue) => issue.code),
        "source_identity_missing",
      );
      assert.notInclude(JSON.stringify(result.issues), "maxLength");
    }
  });
});
