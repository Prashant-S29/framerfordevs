import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { projectRoleValues } from "../../../contracts/access";
import { EditorLayout } from "../../../contracts/field";
import {
  CmsCollection,
  CollectionFieldDefinition,
  PublishedSchemaRevision,
} from "../../../contracts/schema";
import { hashCollectionContract, hashCollectionDraft } from "../../../services/schema/engine";
import { StudioPresentationEdit } from "../../../contracts/studio-content";
import {
  isPresentationVisibleToRole,
  mergeStudioPresentation,
  preservesRoleVisibility,
  studioPresentationDocument,
} from "./index";

const collectionId = "019fae8b-2234-7000-8000-000000000101";
const revisionId = "019fae8b-2234-7000-8000-000000000102";
const titleId = "019fae8b-2234-7000-8000-000000000103";
const notesId = "019fae8b-2234-7000-8000-000000000104";
const contentTabId = "019fae8b-2234-7000-8000-000000000110";
const mainGroupId = "019fae8b-2234-7000-8000-000000000111";
const internalGroupId = "019fae8b-2234-7000-8000-000000000112";
const titlePlacementId = "019fae8b-2234-7000-8000-000000000113";
const notesPlacementId = "019fae8b-2234-7000-8000-000000000114";
const newTabId = "019fae8b-2234-7000-8000-000000000115";
const newGroupId = "019fae8b-2234-7000-8000-000000000116";
const allRoles = projectRoleValues;
const staffRoles = ["owner", "developer", "content_admin"] as const;
const writeRoles = ["owner", "developer", "content_admin", "editor", "client_editor"] as const;

function field(id: string, apiKey: string, position: number) {
  return Schema.decodeUnknownSync(CollectionFieldDefinition, { onExcessProperty: "error" })({
    id,
    parentFieldId: null,
    nodeRole: "root",
    apiKey,
    displayLabel: apiKey,
    kind: "short_text",
    required: false,
    localization: "localized",
    deprecated: false,
    position,
    editor: {
      helpText: null,
      placeholder: null,
      visibleToRoles: allRoles,
      editableByRoles: writeRoles,
    },
    configuration: { maxLength: 100 },
    children: [],
  });
}

const fields = [field(titleId, "title", 0), field(notesId, "notes", 1)];

function placement(id: string, fieldId: string, position: number) {
  return { id, fieldId, position, helpTextOverride: null, visibleToRoles: allRoles };
}

function layoutValue(overrides: { readonly internalRoles?: ReadonlyArray<string> } = {}) {
  return {
    version: 1,
    tabs: [
      {
        id: contentTabId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: allRoles,
        groups: [
          {
            id: mainGroupId,
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: allRoles,
            fields: [placement(titlePlacementId, titleId, 0)],
          },
          {
            id: internalGroupId,
            title: "Internal",
            description: null,
            position: 1,
            columns: 1,
            visibleToRoles: overrides.internalRoles ?? staffRoles,
            fields: [placement(notesPlacementId, notesId, 0)],
          },
        ],
      },
    ],
    sidebarGroups: [],
  };
}

function layout(value: unknown) {
  return Schema.decodeUnknownSync(EditorLayout, { onExcessProperty: "error" })(value);
}

function revision(editorLayout: EditorLayout) {
  const draft = {
    formatVersion: 1 as const,
    validationProfile: "ffd-fields@1" as const,
    currencyRegistryProfile: null,
    collection: Schema.decodeUnknownSync(CmsCollection, { onExcessProperty: "error" })({
      id: collectionId,
      workspaceId: "019fae8b-2234-7000-8000-000000000120",
      projectId: "019fae8b-2234-7000-8000-000000000121",
      environmentId: "019fae8b-2234-7000-8000-000000000122",
      apiKey: "articles",
      displayName: "Articles",
      description: null,
      version: 1,
      draftVersion: 1,
      draftBaseRevisionId: revisionId,
      currentPublishedRevisionId: revisionId,
      currentPublishedSequence: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    }),
    fields,
    editorLayout,
  };
  return Schema.decodeUnknownSync(PublishedSchemaRevision, { onExcessProperty: "error" })({
    id: revisionId,
    workspaceId: draft.collection.workspaceId,
    projectId: draft.collection.projectId,
    environmentId: draft.collection.environmentId,
    collectionId,
    sequence: 1,
    previousRevisionId: null,
    formatVersion: 1,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: null,
    collectionApiKey: "articles",
    collectionDisplayName: "Articles",
    collectionDescription: null,
    schemaHash: hashCollectionDraft(draft),
    contractHash: hashCollectionContract(draft),
    commandId: "019fae8b-2234-7000-8000-000000000123",
    nonBreakingChangeCount: 0,
    potentiallyBreakingChangeCount: 0,
    breakingChangeCount: 0,
    publishedByUserId: "user-1",
    publishedByCredentialId: null,
    publishedAt: "2026-11-01T00:00:00.000Z",
    fields,
    editorLayout,
  });
}

const current = revision(layout(layoutValue()));

function withMainGroup(mutate: (value: ReturnType<typeof layoutValue>) => unknown) {
  return layout(mutate(layoutValue()));
}

describe("editorial presentation authority", () => {
  it("requires the editorial role to see every field and layout node", () => {
    assert.isTrue(isPresentationVisibleToRole(current, "owner"));
    assert.isTrue(isPresentationVisibleToRole(current, "content_admin"));
    assert.isFalse(isPresentationVisibleToRole(current, "editor"));
    assert.isTrue(
      isPresentationVisibleToRole(
        revision(layout(layoutValue({ internalRoles: allRoles }))),
        "editor",
      ),
    );
  });

  it("allows relabels, reorders, and new containers that keep every role projection", () => {
    const candidate = withMainGroup((value) => ({
      ...value,
      tabs: [
        {
          ...value.tabs[0],
          title: "Story",
          groups: [
            { ...value.tabs[0]!.groups[1]!, title: "Staff notes", position: 0 },
            { ...value.tabs[0]!.groups[0]!, columns: 2, position: 1 },
          ],
        },
        {
          id: newTabId,
          title: "Extra",
          description: null,
          position: 1,
          visibleToRoles: allRoles,
          groups: [
            {
              id: newGroupId,
              title: "Empty",
              description: null,
              position: 0,
              columns: 1,
              visibleToRoles: allRoles,
              fields: [],
            },
          ],
        },
      ],
    }));
    assert.isTrue(preservesRoleVisibility(current, fields, candidate));
  });

  it("rejects a changed field role list", () => {
    const changed = [
      Schema.decodeUnknownSync(CollectionFieldDefinition, { onExcessProperty: "error" })({
        ...fields[0],
        editor: { ...fields[0]!.editor, editableByRoles: ["owner", "developer", "content_admin"] },
      }),
      fields[1]!,
    ];
    assert.isFalse(preservesRoleVisibility(current, changed, current.editorLayout));
  });

  it("rejects a changed container or placement role list", () => {
    const widened = withMainGroup((value) => ({
      ...value,
      tabs: [
        {
          ...value.tabs[0],
          groups: [
            value.tabs[0]!.groups[0],
            { ...value.tabs[0]!.groups[1], visibleToRoles: allRoles },
          ],
        },
      ],
    }));
    assert.isFalse(preservesRoleVisibility(current, fields, widened));

    const narrowed = withMainGroup((value) => ({
      ...value,
      tabs: [
        {
          ...value.tabs[0],
          groups: [
            {
              ...value.tabs[0]!.groups[0],
              fields: [{ ...placement(titlePlacementId, titleId, 0), visibleToRoles: staffRoles }],
            },
            value.tabs[0]!.groups[1],
          ],
        },
      ],
    }));
    assert.isFalse(preservesRoleVisibility(current, fields, narrowed));
  });

  it("rejects a new container that does not use every role", () => {
    const candidate = withMainGroup((value) => ({
      ...value,
      tabs: [
        value.tabs[0],
        {
          id: newTabId,
          title: "Staff",
          description: null,
          position: 1,
          visibleToRoles: staffRoles,
          groups: [
            {
              id: newGroupId,
              title: "Empty",
              description: null,
              position: 0,
              columns: 1,
              visibleToRoles: staffRoles,
              fields: [],
            },
          ],
        },
      ],
    }));
    assert.isFalse(preservesRoleVisibility(current, fields, candidate));
  });

  it("rejects moving a placement out of a narrower container", () => {
    const candidate = withMainGroup((value) => ({
      ...value,
      tabs: [
        {
          ...value.tabs[0],
          groups: [
            {
              ...value.tabs[0]!.groups[0],
              fields: [
                placement(titlePlacementId, titleId, 0),
                placement(notesPlacementId, notesId, 1),
              ],
            },
            { ...value.tabs[0]!.groups[1], fields: [] },
          ],
        },
      ],
    }));
    assert.isFalse(preservesRoleVisibility(current, fields, candidate));
  });

  it("keeps the current presentation unchanged", () => {
    assert.isTrue(preservesRoleVisibility(current, current.fields, current.editorLayout));
  });
});

function baseEdit() {
  const document = studioPresentationDocument(current);
  return {
    displayName: document.displayName,
    description: document.description,
    fields: document.fields.map(({ parentFieldId: _parent, kind: _kind, ...field }) => field),
    layout: document.layout,
  };
}

function editFromDocument(overrides: (value: ReturnType<typeof baseEdit>) => unknown) {
  return Schema.decodeUnknownSync(StudioPresentationEdit, { onExcessProperty: "error" })(
    overrides(baseEdit()),
  );
}

describe("Studio editorial presentation projection", () => {
  it("projects labels and layout without any role list", () => {
    const document = studioPresentationDocument(current);
    assert.notInclude(JSON.stringify(document), "visibleToRoles");
    assert.notInclude(JSON.stringify(document), "editableByRoles");
    assert.deepStrictEqual(
      document.fields.map((field) => [field.fieldId, field.kind, field.parentFieldId]),
      [
        [titleId, "short_text", null],
        [notesId, "short_text", null],
      ],
    );
    assert.strictEqual(document.layout.tabs[0]?.groups[1]?.title, "Internal");
  });

  it("copies current role lists back by stable ID and keeps the role projection", () => {
    const edit = editFromDocument((value) => ({
      ...value,
      displayName: "Stories",
      fields: value.fields.map((field) =>
        field.fieldId === titleId ? { ...field, displayLabel: "Headline" } : field,
      ),
    }));
    const merged = mergeStudioPresentation(current, edit);
    assert.isNotNull(merged);
    if (merged === null) return;
    assert.strictEqual(merged.displayName, "Stories");
    assert.deepStrictEqual(
      merged.editorLayout.tabs[0]?.groups.map((group) => [String(group.id), group.visibleToRoles]),
      [
        [mainGroupId, allRoles],
        [internalGroupId, staffRoles],
      ],
    );
    assert.deepStrictEqual(
      merged.editorLayout.tabs[0]?.groups[1]?.fields.map((placement) => String(placement.id)),
      [notesPlacementId],
    );
    assert.deepStrictEqual(
      merged.fields.map((field) => field.editor.editableByRoles),
      [writeRoles, writeRoles],
    );
  });

  it("gives new containers every role and returns null for duplicate field entries", () => {
    const withTab = editFromDocument((value) => {
      return {
        ...value,
        layout: {
          ...value.layout,
          tabs: [
            ...value.layout.tabs,
            {
              id: newTabId,
              title: "Extra",
              description: null,
              position: 1,
              groups: [
                {
                  id: newGroupId,
                  title: "Empty",
                  description: null,
                  position: 0,
                  columns: 1,
                  fields: [],
                },
              ],
            },
          ],
        },
      };
    });
    const merged = mergeStudioPresentation(current, withTab);
    assert.deepStrictEqual(merged?.editorLayout.tabs[1]?.visibleToRoles, allRoles);
    assert.deepStrictEqual(merged?.editorLayout.tabs[1]?.groups[0]?.visibleToRoles, allRoles);

    const duplicate = editFromDocument((value) => ({
      ...value,
      fields: [...value.fields, value.fields[0]],
    }));
    assert.isNull(mergeStudioPresentation(current, duplicate));
  });
});
