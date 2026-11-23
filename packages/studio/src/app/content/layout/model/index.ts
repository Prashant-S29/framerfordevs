import type { StudioJsonObject } from "../../../../contracts/content";
import type {
  StudioPresentationDto,
  StudioPresentationEnumOptionDto,
  StudioPresentationFieldDto,
  StudioPresentationGroupDto,
} from "../../../../contracts/presentation";

export interface LayoutPlacementDraft {
  readonly fieldId: string;
  readonly helpTextOverride: string;
}

export interface LayoutGroupDraft {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly columns: 1 | 2;
  readonly fields: ReadonlyArray<LayoutPlacementDraft>;
}

export interface LayoutTabDraft {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly groups: ReadonlyArray<LayoutGroupDraft>;
}

export interface LayoutFieldDraft {
  readonly fieldId: string;
  readonly parentFieldId: string | null;
  readonly kind: string;
  readonly displayLabel: string;
  readonly helpText: string;
  readonly placeholder: string;
  readonly position: number;
  readonly enumOptions: ReadonlyArray<{ readonly optionId: string; readonly label: string }>;
}

export interface LayoutDraft {
  readonly displayName: string;
  readonly description: string;
  readonly fields: ReadonlyArray<LayoutFieldDraft>;
  readonly tabs: ReadonlyArray<LayoutTabDraft>;
  readonly sidebarGroups: ReadonlyArray<LayoutGroupDraft>;
}

function byPosition<T extends { readonly position: number }>(items: ReadonlyArray<T>) {
  return [...items].sort((left, right) => left.position - right.position);
}

function groupDraft(group: StudioPresentationGroupDto): LayoutGroupDraft {
  return {
    id: group.id,
    title: group.title,
    description: group.description ?? "",
    columns: group.columns,
    fields: byPosition(group.fields).map((placement) => ({
      fieldId: placement.fieldId,
      helpTextOverride: placement.helpTextOverride ?? "",
    })),
  };
}

function enumDraft(options: ReadonlyArray<StudioPresentationEnumOptionDto>) {
  return byPosition(options).map((option) => ({ optionId: option.optionId, label: option.label }));
}

function fieldDraft(field: StudioPresentationFieldDto): LayoutFieldDraft {
  return {
    fieldId: field.fieldId,
    parentFieldId: field.parentFieldId,
    kind: field.kind,
    displayLabel: field.displayLabel ?? "",
    helpText: field.helpText ?? "",
    placeholder: field.placeholder ?? "",
    position: field.position,
    enumOptions: enumDraft(field.enumOptions),
  };
}

export function layoutDraft(presentation: StudioPresentationDto): LayoutDraft {
  const document = presentation.presentation;
  return {
    displayName: document.displayName,
    description: document.description ?? "",
    fields: document.fields.map(fieldDraft),
    tabs: byPosition(document.layout.tabs).map((tab) => ({
      id: tab.id,
      title: tab.title,
      description: tab.description ?? "",
      groups: byPosition(tab.groups).map(groupDraft),
    })),
    sidebarGroups: byPosition(document.layout.sidebarGroups).map(groupDraft),
  };
}

function nullable(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function groupBody(group: LayoutGroupDraft, position: number): StudioJsonObject {
  return {
    id: group.id,
    title: group.title,
    description: nullable(group.description),
    position,
    columns: group.columns,
    fields: group.fields.map((placement, index) => ({
      fieldId: placement.fieldId,
      position: index,
      helpTextOverride: nullable(placement.helpTextOverride),
    })),
  };
}

export function layoutPublishBody(
  presentation: StudioPresentationDto,
  draft: LayoutDraft,
  commandId: string,
): StudioJsonObject {
  return {
    commandId,
    expectedRevisionId: presentation.revisionId,
    expectedSequence: presentation.sequence,
    presentation: {
      displayName: draft.displayName.trim(),
      description: nullable(draft.description),
      fields: draft.fields.map((field) => ({
        fieldId: field.fieldId,
        displayLabel: nullable(field.displayLabel),
        position: field.position,
        helpText: nullable(field.helpText),
        placeholder: nullable(field.placeholder),
        enumOptions: field.enumOptions.map((option, index) => ({
          optionId: option.optionId,
          label: option.label,
          position: index,
        })),
      })),
      layout: {
        tabs: draft.tabs.map((tab, position) => ({
          id: tab.id,
          title: tab.title,
          description: nullable(tab.description),
          position,
          groups: tab.groups.map(groupBody),
        })),
        sidebarGroups: draft.sidebarGroups.map(groupBody),
      },
    },
  };
}

export function moveItem<T>(
  items: ReadonlyArray<T>,
  index: number,
  delta: -1 | 1,
): ReadonlyArray<T> {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item === undefined) return items;
  next.splice(target, 0, item);
  return next;
}

function mapGroups(
  draft: LayoutDraft,
  update: (group: LayoutGroupDraft) => LayoutGroupDraft,
): LayoutDraft {
  return {
    ...draft,
    tabs: draft.tabs.map((tab) => ({ ...tab, groups: tab.groups.map(update) })),
    sidebarGroups: draft.sidebarGroups.map(update),
  };
}

export function updateGroup(
  draft: LayoutDraft,
  groupId: string,
  update: (group: LayoutGroupDraft) => LayoutGroupDraft,
): LayoutDraft {
  return mapGroups(draft, (group) => (group.id === groupId ? update(group) : group));
}

export function movePlacement(
  draft: LayoutDraft,
  fieldId: string,
  targetGroupId: string,
): LayoutDraft {
  let moved: LayoutPlacementDraft | undefined;
  const removed = mapGroups(draft, (group) => {
    if (group.id === targetGroupId) return group;
    const placement = group.fields.find((candidate) => candidate.fieldId === fieldId);
    if (placement === undefined) return group;
    moved = placement;
    return { ...group, fields: group.fields.filter((candidate) => candidate.fieldId !== fieldId) };
  });
  const placement = moved;
  if (placement === undefined) return draft;
  return updateGroup(removed, targetGroupId, (group) => ({
    ...group,
    fields: [...group.fields, placement],
  }));
}

export function emptyGroup(id: string, title: string): LayoutGroupDraft {
  return { id, title, description: "", columns: 1, fields: [] };
}

export function allGroups(draft: LayoutDraft): ReadonlyArray<LayoutGroupDraft> {
  return [...draft.tabs.flatMap((tab) => tab.groups), ...draft.sidebarGroups];
}

export function layoutDraftValid(draft: LayoutDraft): boolean {
  const titles = [...draft.tabs, ...allGroups(draft)].every(
    (node) => node.title.trim().length >= 1 && node.title.length <= 100,
  );
  return (
    draft.displayName.trim().length >= 1 &&
    draft.displayName.length <= 100 &&
    draft.tabs.length >= 1 &&
    draft.tabs.length <= 10 &&
    draft.sidebarGroups.length <= 10 &&
    draft.tabs.every((tab) => tab.groups.length >= 1 && tab.groups.length <= 20) &&
    titles &&
    draft.fields.every(
      (field) =>
        field.displayLabel.length <= 100 &&
        field.enumOptions.every((option) => option.label.trim().length >= 1),
    )
  );
}
