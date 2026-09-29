// Redacts role and source-key schema authority from the browser-visible Studio form projection.

import { Schema } from "effect";

import { EntryValues } from "../../../contracts/entry";
import type { CollectionFieldDefinition, GeneratedFormDefinition } from "../../../contracts/schema";
import { StudioFormField, StudioFormProjection } from "../../../contracts/studio-content";

function projectField(
  field: CollectionFieldDefinition,
  role: GeneratedFormDefinition["role"],
): StudioFormField | null {
  if (!field.editor.visibleToRoles.includes(role)) return null;
  const children: Array<StudioFormField> = [];
  for (const child of field.children) {
    const projected = projectField(child, role);
    if (projected !== null) children.push(projected);
  }
  if ((field.kind === "object" || field.kind === "list") && children.length === 0) return null;
  return Schema.decodeUnknownSync(StudioFormField)({
    id: field.id,
    parentFieldId: field.parentFieldId,
    nodeRole: field.nodeRole,
    displayLabel: field.displayLabel,
    kind: field.kind,
    required: field.required,
    localization: field.localization,
    position: field.position,
    helpText: field.editor.helpText,
    placeholder: field.editor.placeholder,
    configuration: field.configuration,
    children,
  });
}

function collectFieldIds(fields: ReadonlyArray<StudioFormField>, ids: Set<string>): void {
  for (const field of fields) {
    ids.add(field.id);
    collectFieldIds(field.children, ids);
  }
}

export function projectStudioValues(
  values: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<StudioFormField>,
): EntryValues {
  const projectField = (field: StudioFormField, value: unknown): unknown => {
    if (
      field.kind === "object" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const projected: Record<string, unknown> = {};
      for (const child of field.children) {
        const childValue = projectField(child, Reflect.get(value, child.id));
        if (childValue !== undefined) Reflect.set(projected, child.id, childValue);
      }
      return Object.keys(projected).length > 0 ? projected : undefined;
    }
    if (field.kind === "list" && Array.isArray(value)) {
      const item = field.children[0];
      return item === undefined ? undefined : value.map((entry) => projectField(item, entry));
    }
    return value;
  };
  const projected: Record<string, unknown> = {};
  for (const field of fields) {
    const value = projectField(field, Reflect.get(values, field.id));
    if (value !== undefined) Reflect.set(projected, field.id, value);
  }
  return Schema.decodeUnknownSync(EntryValues)(projected);
}

export function projectStudioForm(form: GeneratedFormDefinition): StudioFormProjection {
  const layoutPlacedRootIds = new Set<string>();
  for (const tab of form.editorLayout.tabs) {
    if (!tab.visibleToRoles.includes(form.role)) continue;
    for (const group of tab.groups) {
      if (!group.visibleToRoles.includes(form.role)) continue;
      for (const placement of group.fields) {
        if (placement.visibleToRoles.includes(form.role)) {
          layoutPlacedRootIds.add(placement.fieldId);
        }
      }
    }
  }
  for (const group of form.editorLayout.sidebarGroups) {
    if (!group.visibleToRoles.includes(form.role)) continue;
    for (const placement of group.fields) {
      if (placement.visibleToRoles.includes(form.role)) {
        layoutPlacedRootIds.add(placement.fieldId);
      }
    }
  }
  const fields: Array<StudioFormField> = [];
  for (const field of form.fields) {
    if (!layoutPlacedRootIds.has(field.id)) continue;
    const projected = projectField(field, form.role);
    if (projected !== null) fields.push(projected);
  }
  const projectedFieldIds = new Set<string>();
  collectFieldIds(fields, projectedFieldIds);
  const projectedRootIds = new Set<string>(fields.map((field) => field.id));
  const editableFieldIds = form.editableFieldIds.filter((fieldId) =>
    projectedFieldIds.has(fieldId),
  );
  const emittedRootIds = new Set<string>();
  const projectGroup = (group: (typeof form.editorLayout.tabs)[number]["groups"][number]) => {
    if (!group.visibleToRoles.includes(form.role)) return null;
    const placements = group.fields
      .filter((placement) => {
        if (
          !placement.visibleToRoles.includes(form.role) ||
          !projectedRootIds.has(placement.fieldId) ||
          emittedRootIds.has(placement.fieldId)
        ) {
          return false;
        }
        emittedRootIds.add(placement.fieldId);
        return true;
      })
      .map((placement) => ({
        id: placement.id,
        fieldId: placement.fieldId,
        position: placement.position,
        helpTextOverride: placement.helpTextOverride,
      }));
    return placements.length === 0
      ? null
      : {
          id: group.id,
          title: group.title,
          description: group.description,
          position: group.position,
          columns: group.columns,
          fields: placements,
        };
  };
  const tabs = form.editorLayout.tabs.flatMap((tab) => {
    if (!tab.visibleToRoles.includes(form.role)) return [];
    const groups = tab.groups.flatMap((group) => {
      const projected = projectGroup(group);
      return projected === null ? [] : [projected];
    });
    return groups.length === 0
      ? []
      : [
          {
            id: tab.id,
            title: tab.title,
            description: tab.description,
            position: tab.position,
            groups,
          },
        ];
  });
  const sidebarGroups = form.editorLayout.sidebarGroups.flatMap((group) => {
    const projected = projectGroup(group);
    return projected === null ? [] : [projected];
  });

  return Schema.decodeUnknownSync(StudioFormProjection)({
    collectionId: form.collectionId,
    schemaRevisionId: form.revisionId,
    contractHash: form.contractHash,
    canEdit: form.canEdit && editableFieldIds.length > 0,
    fields,
    editableFieldIds,
    tabs,
    sidebarGroups,
    currencyMinorUnits: form.currencyMinorUnits,
  });
}
