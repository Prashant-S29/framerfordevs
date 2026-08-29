// Builds bounded role-projected generated-form authority independently from persistence and transport.

import { Schema } from "effect";

import { ProjectRole } from "../contracts/access";
import { EditorLayout } from "../contracts/field-system";
import {
  type CollectionFieldDefinition,
  ContractHash,
  GeneratedFormDefinition,
} from "../contracts/schemas";
import { iso4217MinorUnits } from "../registry/iso-4217.generated";
import { flattenFieldTree } from "./field-tree";

const allProjectRoles = [
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
] as const;

function compareFieldPosition(
  left: CollectionFieldDefinition,
  right: CollectionFieldDefinition,
): number {
  return left.position - right.position || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function syntheticEditorLayout(fields: ReadonlyArray<CollectionFieldDefinition>) {
  return Schema.decodeUnknownSync(EditorLayout)({
    version: 1,
    tabs: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: allProjectRoles,
        groups: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: allProjectRoles,
            fields: [...fields].sort(compareFieldPosition).map((field, position) => ({
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
}

function projectFieldForRole(
  field: CollectionFieldDefinition,
  role: typeof ProjectRole.Type,
): CollectionFieldDefinition | null {
  if (!field.editor.visibleToRoles.includes(role)) return null;
  const children: Array<CollectionFieldDefinition> = [];
  for (const child of field.children) {
    const projected = projectFieldForRole(child, role);
    if (projected) children.push(projected);
  }
  return { ...field, children };
}

function projectLayoutForRole(
  layout: EditorLayout,
  visibleFieldIds: ReadonlySet<string>,
  role: typeof ProjectRole.Type,
): EditorLayout {
  const tabs = layout.tabs
    .filter((tab) => tab.visibleToRoles.includes(role))
    .map((tab, tabPosition) => ({
      ...tab,
      position: tabPosition,
      groups: tab.groups
        .filter((group) => group.visibleToRoles.includes(role))
        .map((group, groupPosition) => ({
          ...group,
          position: groupPosition,
          fields: group.fields
            .filter(
              (placement) =>
                placement.visibleToRoles.includes(role) && visibleFieldIds.has(placement.fieldId),
            )
            .map((placement, position) => ({ ...placement, position })),
        })),
    }))
    .filter((tab) => tab.groups.length > 0);
  const sidebarGroups = layout.sidebarGroups
    .filter((group) => group.visibleToRoles.includes(role))
    .map((group, position) => ({
      ...group,
      position,
      fields: group.fields
        .filter(
          (placement) =>
            placement.visibleToRoles.includes(role) && visibleFieldIds.has(placement.fieldId),
        )
        .map((placement, fieldPosition) => ({ ...placement, position: fieldPosition })),
    }));
  if (tabs.length === 0) return syntheticEditorLayout([]);
  return Schema.decodeUnknownSync(EditorLayout)({ version: 1, tabs, sidebarGroups });
}

export function generatedFormDefinition(options: {
  readonly source: "draft" | "published";
  readonly collectionId: string;
  readonly revisionId: string | null;
  readonly formatVersion: number;
  readonly validationProfile: string;
  readonly currencyRegistryProfile: string | null;
  readonly contractHash: ContractHash;
  readonly role: typeof ProjectRole.Type;
  readonly canEdit: boolean;
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
  readonly editorLayout: EditorLayout;
}) {
  const fields: Array<CollectionFieldDefinition> = [];
  for (const field of options.fields) {
    const projected = projectFieldForRole(field, options.role);
    if (projected) fields.push(projected);
  }
  const flattened = flattenFieldTree(fields);
  const fieldIds = new Set(flattened.map((field) => field.id));
  const editableFieldIds = options.canEdit
    ? flattened
        .filter((field) => field.editor.editableByRoles.includes(options.role))
        .map((field) => field.id)
    : [];
  const currencies = new Set<string>();
  for (const field of flattened) {
    if (field.kind === "money") {
      for (const currency of field.configuration.currencies) currencies.add(currency);
    }
  }
  const currencyMinorUnits: Record<string, number> = {};
  for (const currency of [...currencies].sort()) {
    const minorUnit = Reflect.get(iso4217MinorUnits, currency);
    if (typeof minorUnit === "number") currencyMinorUnits[currency] = minorUnit;
  }
  return Schema.decodeUnknownSync(GeneratedFormDefinition)({
    ...options,
    fields,
    editableFieldIds,
    editorLayout: projectLayoutForRole(options.editorLayout, fieldIds, options.role),
    currencyMinorUnits,
  });
}
