import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AuthoringCollectionPresentation,
  AuthoringPublishPresentationRequest,
} from "../contracts/authoring-presentation";
import { EditorLayout } from "../contracts/field-system";
import {
  CmsCollection,
  CollectionFieldDefinition,
  PublishedSchemaRevision,
  SchemaPublicationCommandId,
} from "../contracts/schemas";
import { hashCollectionContract, hashCollectionDraft } from "../services/schema-engine";
import {
  buildAuthoringPresentationCandidate,
  hasEqualPublishedStructure,
  publishedPresentation,
} from "./authoring-presentation";

const collectionId = "019fae8b-1234-7000-8000-000000000101";
const revisionId = "019fae8b-1234-7000-8000-000000000102";
const titleId = "019fae8b-1234-7000-8000-000000000103";
const statusId = "019fae8b-1234-7000-8000-000000000104";
const draftId = "019fae8b-1234-7000-8000-000000000105";
const liveId = "019fae8b-1234-7000-8000-000000000106";
const roles = ["owner", "developer"] as const;

function field(value: unknown) {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)(value);
}

const fields = [
  field({
    id: titleId,
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "title",
    displayLabel: "Title",
    kind: "short_text",
    required: true,
    localization: "localized",
    deprecated: false,
    position: 0,
    editor: {
      helpText: null,
      placeholder: "Title",
      visibleToRoles: roles,
      editableByRoles: roles,
    },
    configuration: { maxLength: 100 },
    children: [],
  }),
  field({
    id: statusId,
    parentFieldId: null,
    nodeRole: "root",
    apiKey: "status",
    displayLabel: "Status",
    kind: "enum",
    required: false,
    localization: "shared",
    deprecated: false,
    position: 1,
    editor: {
      helpText: null,
      placeholder: null,
      visibleToRoles: roles,
      editableByRoles: roles,
    },
    configuration: {
      options: [
        { id: draftId, value: "draft", label: "Draft", position: 0 },
        { id: liveId, value: "live", label: "Live", position: 1 },
      ],
    },
    children: [],
  }),
];

const layout = Schema.decodeUnknownSync(EditorLayout)({
  version: 1,
  tabs: [
    {
      id: "019fae8b-1234-7000-8000-000000000110",
      title: "Content",
      description: null,
      position: 0,
      visibleToRoles: roles,
      groups: [
        {
          id: "019fae8b-1234-7000-8000-000000000111",
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: roles,
          fields: [
            {
              id: "019fae8b-1234-7000-8000-000000000112",
              fieldId: titleId,
              position: 0,
              helpTextOverride: null,
              visibleToRoles: roles,
            },
            {
              id: "019fae8b-1234-7000-8000-000000000113",
              fieldId: statusId,
              position: 1,
              helpTextOverride: null,
              visibleToRoles: roles,
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [],
});

function currentRevision() {
  const draft = {
    formatVersion: 2 as const,
    validationProfile: "ffd-fields@1" as const,
    currencyRegistryProfile: null,
    collection: Schema.decodeUnknownSync(CmsCollection)({
      id: collectionId,
      workspaceId: "019fae8b-1234-7000-8000-000000000120",
      projectId: "019fae8b-1234-7000-8000-000000000121",
      environmentId: "019fae8b-1234-7000-8000-000000000122",
      apiKey: "articles",
      displayName: "Articles",
      description: null,
      version: 1,
      draftVersion: 1,
      draftBaseRevisionId: revisionId,
      currentPublishedRevisionId: revisionId,
      currentPublishedSequence: 1,
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    }),
    fields,
    editorLayout: layout,
  };
  return Schema.decodeUnknownSync(PublishedSchemaRevision)({
    id: revisionId,
    workspaceId: draft.collection.workspaceId,
    projectId: draft.collection.projectId,
    environmentId: draft.collection.environmentId,
    collectionId,
    sequence: 1,
    previousRevisionId: null,
    formatVersion: 2,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: null,
    collectionApiKey: "articles",
    collectionDisplayName: "Articles",
    collectionDescription: null,
    schemaHash: hashCollectionDraft(draft),
    contractHash: hashCollectionContract(draft),
    commandId: "019fae8b-1234-7000-8000-000000000123",
    nonBreakingChangeCount: 1,
    potentiallyBreakingChangeCount: 0,
    breakingChangeCount: 0,
    publishedByUserId: "user-1",
    publishedByCredentialId: null,
    publishedAt: "2026-08-25T00:00:00.000Z",
    fields,
    editorLayout: layout,
  });
}

function changedPresentation() {
  const current = publishedPresentation(currentRevision());
  return Schema.decodeUnknownSync(AuthoringCollectionPresentation)({
    ...current,
    displayName: "Stories",
    description: "Editorial stories",
    fields: current.fields.map((presentation) => ({
      ...presentation,
      displayLabel: presentation.fieldId === titleId ? "Headline" : presentation.displayLabel,
      editor:
        presentation.fieldId === titleId
          ? { ...presentation.editor, helpText: "Use a clear headline." }
          : presentation.editor,
      enumOptions: presentation.enumOptions.map((option) => ({
        ...option,
        label: option.optionId === liveId ? "Published" : option.label,
      })),
    })),
  });
}

describe("Authoring presentation publication", () => {
  it("strictly rejects structural and duplicate authority", () => {
    const request = {
      commandId: SchemaPublicationCommandId.make("019fae8b-1234-7000-8000-000000000130"),
      expectedRevisionId: revisionId,
      expectedSequence: 1,
      presentation: changedPresentation(),
    };
    assert.doesNotThrow(() =>
      Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)(request),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)({
        ...request,
        presentation: { ...request.presentation, apiKey: "forbidden" },
      }),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)({
        ...request,
        presentation: {
          ...request.presentation,
          fields: [request.presentation.fields[0], request.presentation.fields[0]],
        },
      }),
    );
  });

  it("changes complete presentation while preserving structure and contract hashes", () => {
    const current = currentRevision();
    const result = buildAuthoringPresentationCandidate({
      current,
      presentation: changedPresentation(),
    });
    assert.isTrue(result.valid);
    if (!result.valid) return;
    assert.isFalse(result.noOp);
    assert.strictEqual(result.contractHash, current.contractHash);
    assert.notStrictEqual(result.schemaHash, current.schemaHash);
    assert.isTrue(hasEqualPublishedStructure(current.fields, result.draft.fields));
    assert.strictEqual(result.draft.collection.apiKey, current.collectionApiKey);
    assert.strictEqual(result.draft.collection.displayName, "Stories");
    assert.strictEqual(result.draft.fields[0]?.displayLabel, "Headline");
    const enumField = result.draft.fields[1];
    assert.strictEqual(enumField?.kind, "enum");
    if (enumField?.kind === "enum") {
      assert.strictEqual(enumField.configuration.options[1]?.label, "Published");
      assert.strictEqual(enumField.configuration.options[1]?.value, "live");
    }
  });

  it("detects no-ops and rejects incomplete, unknown, or kind-incompatible identities", () => {
    const current = currentRevision();
    const noOp = buildAuthoringPresentationCandidate({
      current,
      presentation: publishedPresentation(current),
    });
    assert.isTrue(noOp.valid && noOp.noOp);

    const changed = changedPresentation();
    const missing = buildAuthoringPresentationCandidate({
      current,
      presentation: { ...changed, fields: changed.fields.slice(0, 1) },
    });
    assert.isFalse(missing.valid);
    if (!missing.valid) assert.strictEqual(missing.issues[0]?.code, "presentation_field_missing");

    const incompatible = buildAuthoringPresentationCandidate({
      current,
      presentation: {
        ...changed,
        fields: changed.fields.map((presentation) =>
          presentation.fieldId === titleId
            ? { ...presentation, enumOptions: changed.fields[1]?.enumOptions ?? [] }
            : presentation,
        ),
      },
    });
    assert.isFalse(incompatible.valid);
    if (!incompatible.valid)
      assert.strictEqual(incompatible.issues[0]?.code, "presentation_enum_options_unavailable");
  });
});
