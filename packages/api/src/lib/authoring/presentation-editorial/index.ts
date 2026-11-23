import { createHash, randomUUID } from "node:crypto";

import { Option, Schema } from "effect";

import { type ProjectRole, projectRoleValues } from "../../../contracts/access";
import { AuthoringCollectionPresentation } from "../../../contracts/authoring/presentation";
import type { EditorLayout, EditorLayoutGroup } from "../../../contracts/field";
import type { CmsActor } from "../../../contracts/authoring";
import {
  type CollectionFieldDefinition,
  type PublishedSchemaRevision,
  SchemaPublicationFingerprint,
} from "../../../contracts/schema";
import {
  StudioPresentationDocument,
  type StudioPresentationEdit,
  type StudioPresentationGroup,
} from "../../../contracts/studio-content";
import { canonicalizeSchemaDocument } from "../../field/document";
import { generatedFormDefinition } from "../../field/form-definition";
import { flattenFieldTree } from "../../field/tree";

export const editorialDefaultRoles: ReadonlyArray<ProjectRole> = projectRoleValues;

function sameRoles(left: ReadonlyArray<ProjectRole>, right: ReadonlyArray<ProjectRole>): boolean {
  return left.length === right.length && left.every((role, index) => right[index] === role);
}

function layoutGroups(layout: EditorLayout): ReadonlyArray<EditorLayoutGroup> {
  return [...layout.tabs.flatMap((tab) => tab.groups), ...layout.sidebarGroups];
}

export function isPresentationVisibleToRole(
  current: PublishedSchemaRevision,
  role: ProjectRole,
): boolean {
  return (
    flattenFieldTree(current.fields).every((field) => field.editor.visibleToRoles.includes(role)) &&
    current.editorLayout.tabs.every((tab) => tab.visibleToRoles.includes(role)) &&
    layoutGroups(current.editorLayout).every(
      (group) =>
        group.visibleToRoles.includes(role) &&
        group.fields.every((placement) => placement.visibleToRoles.includes(role)),
    )
  );
}

function roleListsUnchanged(
  current: PublishedSchemaRevision,
  candidateFields: ReadonlyArray<CollectionFieldDefinition>,
  candidateLayout: EditorLayout,
): boolean {
  const currentFields = new Map(flattenFieldTree(current.fields).map((field) => [field.id, field]));
  for (const field of flattenFieldTree(candidateFields)) {
    const before = currentFields.get(field.id);
    if (
      before === undefined ||
      !sameRoles(before.editor.visibleToRoles, field.editor.visibleToRoles) ||
      !sameRoles(before.editor.editableByRoles, field.editor.editableByRoles)
    ) {
      return false;
    }
  }
  const currentTabs = new Map(current.editorLayout.tabs.map((tab) => [tab.id, tab.visibleToRoles]));
  if (
    candidateLayout.tabs.some(
      (tab) => !sameRoles(currentTabs.get(tab.id) ?? editorialDefaultRoles, tab.visibleToRoles),
    )
  ) {
    return false;
  }
  const currentGroups = new Map(
    layoutGroups(current.editorLayout).map((group) => [group.id, group.visibleToRoles]),
  );
  const currentPlacements = new Map(
    layoutGroups(current.editorLayout).flatMap((group) =>
      group.fields.map((placement) => [placement.fieldId, placement.visibleToRoles] as const),
    ),
  );
  return layoutGroups(candidateLayout).every(
    (group) =>
      sameRoles(currentGroups.get(group.id) ?? editorialDefaultRoles, group.visibleToRoles) &&
      group.fields.every((placement) => {
        const before = currentPlacements.get(placement.fieldId);
        return before !== undefined && sameRoles(before, placement.visibleToRoles);
      }),
  );
}

function effectiveAccess(
  current: PublishedSchemaRevision,
  fields: ReadonlyArray<CollectionFieldDefinition>,
  editorLayout: EditorLayout,
  role: ProjectRole,
): string {
  const form = generatedFormDefinition({
    source: "published",
    collectionId: current.collectionId,
    revisionId: current.id,
    formatVersion: current.formatVersion,
    validationProfile: current.validationProfile,
    currencyRegistryProfile: current.currencyRegistryProfile,
    contractHash: current.contractHash,
    role,
    canEdit: true,
    fields,
    editorLayout,
  });
  const placed = layoutGroups(form.editorLayout)
    .flatMap((group) => group.fields.map((placement) => placement.fieldId))
    .sort();
  return JSON.stringify({ placed, editable: [...form.editableFieldIds].sort() });
}

// Editorial publishers may relabel and rearrange the form, but each role must keep exactly
// the same visible and editable fields. Comparing the role-projected forms catches a move of
// a placement into a container with a wider role list, not only a direct role-list edit.
export function preservesRoleVisibility(
  current: PublishedSchemaRevision,
  candidateFields: ReadonlyArray<CollectionFieldDefinition>,
  candidateLayout: EditorLayout,
): boolean {
  if (!roleListsUnchanged(current, candidateFields, candidateLayout)) return false;
  return projectRoleValues.every(
    (role) =>
      effectiveAccess(current, current.fields, current.editorLayout, role) ===
      effectiveAccess(current, candidateFields, candidateLayout, role),
  );
}

function studioGroup(group: EditorLayoutGroup) {
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    position: group.position,
    columns: group.columns,
    fields: group.fields.map((placement) => ({
      fieldId: placement.fieldId,
      position: placement.position,
      helpTextOverride: placement.helpTextOverride,
    })),
  };
}

export function studioPresentationDocument(
  current: PublishedSchemaRevision,
): StudioPresentationDocument {
  return Schema.decodeUnknownSync(StudioPresentationDocument, { onExcessProperty: "error" })({
    displayName: current.collectionDisplayName,
    description: current.collectionDescription,
    fields: flattenFieldTree(current.fields).map((field) => ({
      fieldId: field.id,
      parentFieldId: field.parentFieldId,
      kind: field.kind,
      displayLabel: field.displayLabel,
      position: field.position,
      helpText: field.editor.helpText,
      placeholder: field.editor.placeholder,
      enumOptions:
        field.kind === "enum"
          ? field.configuration.options.map((option) => ({
              optionId: option.id,
              label: option.label,
              position: option.position,
            }))
          : [],
    })),
    layout: {
      tabs: current.editorLayout.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        description: tab.description,
        position: tab.position,
        groups: tab.groups.map(studioGroup),
      })),
      sidebarGroups: current.editorLayout.sidebarGroups.map(studioGroup),
    },
  });
}

// The Studio never carries role lists. Merging copies every role list back from the current
// revision by stable ID, so the editorial publish rules see an unchanged role projection.
export function mergeStudioPresentation(
  current: PublishedSchemaRevision,
  edit: StudioPresentationEdit,
): AuthoringCollectionPresentation | null {
  const currentFields = new Map(flattenFieldTree(current.fields).map((field) => [field.id, field]));
  const currentTabs = new Map(current.editorLayout.tabs.map((tab) => [tab.id, tab.visibleToRoles]));
  const currentGroups = new Map(
    layoutGroups(current.editorLayout).map((group) => [group.id, group.visibleToRoles]),
  );
  const currentPlacements = new Map(
    layoutGroups(current.editorLayout).flatMap((group) =>
      group.fields.map((placement) => [placement.fieldId, placement] as const),
    ),
  );
  const group = (value: StudioPresentationGroup) => ({
    ...value,
    visibleToRoles: currentGroups.get(value.id) ?? editorialDefaultRoles,
    fields: value.fields.map((placement) => {
      const before = currentPlacements.get(placement.fieldId);
      return {
        id: before?.id ?? randomUUID(),
        fieldId: placement.fieldId,
        position: placement.position,
        helpTextOverride: placement.helpTextOverride,
        visibleToRoles: before?.visibleToRoles ?? editorialDefaultRoles,
      };
    }),
  });
  return Option.getOrNull(
    Schema.decodeUnknownOption(AuthoringCollectionPresentation, { onExcessProperty: "error" })({
      displayName: edit.displayName,
      description: edit.description,
      fields: edit.fields.map((field) => {
        const before = currentFields.get(field.fieldId);
        return {
          fieldId: field.fieldId,
          displayLabel: field.displayLabel,
          position: field.position,
          editor: {
            helpText: field.helpText,
            placeholder: field.placeholder,
            visibleToRoles: before?.editor.visibleToRoles ?? [],
            editableByRoles: before?.editor.editableByRoles ?? [],
          },
          enumOptions: field.enumOptions,
        };
      }),
      editorLayout: {
        version: 1,
        tabs: edit.layout.tabs.map((tab) => ({
          ...tab,
          visibleToRoles: currentTabs.get(tab.id) ?? editorialDefaultRoles,
          groups: tab.groups.map(group),
        })),
        sidebarGroups: edit.layout.sidebarGroups.map(group),
      },
    }),
  );
}

export function fingerprintStudioPresentation(options: {
  readonly actor: CmsActor;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionKey: string;
  readonly commandId: string;
  readonly expectedRevisionId: string;
  readonly expectedSequence: number;
  readonly presentation: StudioPresentationEdit;
}): SchemaPublicationFingerprint {
  return SchemaPublicationFingerprint.make(
    createHash("sha256")
      .update(
        canonicalizeSchemaDocument({
          version: 1,
          operation: "studio.presentation.publish",
          ...options,
        }),
        "utf8",
      )
      .digest("hex"),
  );
}
