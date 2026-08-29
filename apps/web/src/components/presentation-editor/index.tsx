import type {
  AuthoringCollectionPresentation,
  AuthoringFieldPresentation,
  AuthoringPresentationSnapshot,
} from "@framerfordevs/api/contracts/authoring/presentation/index";
import { projectRoleValues, type ProjectRole } from "@framerfordevs/api/contracts/access/index";
import {
  EditorLayoutNodeId,
  type EditorLayout,
  type EditorLayoutGroup,
} from "@framerfordevs/api/contracts/field/index";
import {
  CollectionDescription,
  CollectionDisplayName,
  CollectionFieldDisplayLabel,
  type CollectionFieldDefinition,
  type PublishedSchemaRevision,
} from "@framerfordevs/api/contracts/schema/index";
import { Alert, AlertDescription, AlertTitle } from "@framerfordevs/ui/components/alert";
import { Badge } from "@framerfordevs/ui/components/badge";
import { Button } from "@framerfordevs/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@framerfordevs/ui/components/card";
import { Checkbox } from "@framerfordevs/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@framerfordevs/ui/components/field";
import { Input } from "@framerfordevs/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@framerfordevs/ui/components/native-select";
import { Separator } from "@framerfordevs/ui/components/separator";
import { Spinner } from "@framerfordevs/ui/components/spinner";
import { Textarea } from "@framerfordevs/ui/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

interface PresentationScope {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
}

const roleLabels: Readonly<Record<ProjectRole, string>> = {
  owner: "Owner",
  developer: "Developer",
  content_admin: "Content admin",
  editor: "Editor",
  reviewer: "Reviewer",
  client_editor: "Client editor",
  read_only: "Read only",
};
const contentWriteRoles = new Set<ProjectRole>([
  "owner",
  "developer",
  "content_admin",
  "editor",
  "client_editor",
]);

function normalizePositions<Item extends { readonly position: number }>(
  items: ReadonlyArray<Item>,
): ReadonlyArray<Item> {
  return items.map((item, position) => ({ ...item, position }));
}

function moveItem<Item extends { readonly position: number }>(
  items: ReadonlyArray<Item>,
  index: number,
  direction: -1 | 1,
): ReadonlyArray<Item> {
  const ordered = [...items].sort((left, right) => left.position - right.position);
  const target = index + direction;
  const current = ordered[index];
  const other = ordered[target];
  if (!current || !other) return items;
  ordered[index] = other;
  ordered[target] = current;
  return normalizePositions(ordered);
}

function updateGroup(
  layout: EditorLayout,
  groupId: string,
  update: (group: EditorLayoutGroup) => EditorLayoutGroup,
): EditorLayout {
  return {
    ...layout,
    tabs: layout.tabs.map((tab) => ({
      ...tab,
      groups: tab.groups.map((group) => (group.id === groupId ? update(group) : group)),
    })),
    sidebarGroups: layout.sidebarGroups.map((group) =>
      group.id === groupId ? update(group) : group,
    ),
  };
}

function allGroups(layout: EditorLayout): ReadonlyArray<EditorLayoutGroup> {
  return [...layout.tabs.flatMap((tab) => tab.groups), ...layout.sidebarGroups];
}

function movePlacement(
  layout: EditorLayout,
  placementId: string,
  targetGroupId: string,
): EditorLayout {
  const placement = allGroups(layout)
    .flatMap((group) => group.fields)
    .find((candidate) => candidate.id === placementId);
  if (!placement) return layout;
  const withoutPlacement: EditorLayout = {
    ...layout,
    tabs: layout.tabs.map((tab) => ({
      ...tab,
      groups: tab.groups.map((group) => ({
        ...group,
        fields: normalizePositions(group.fields.filter((field) => field.id !== placementId)),
      })),
    })),
    sidebarGroups: layout.sidebarGroups.map((group) => ({
      ...group,
      fields: normalizePositions(group.fields.filter((field) => field.id !== placementId)),
    })),
  };
  return updateGroup(withoutPlacement, targetGroupId, (group) => ({
    ...group,
    fields: [...group.fields, { ...placement, position: group.fields.length }],
  }));
}

function canonicalRoles(values: ReadonlySet<ProjectRole>): ReadonlyArray<ProjectRole> {
  return projectRoleValues.filter((role) => values.has(role));
}

function RoleControls({
  idPrefix,
  visible,
  editable,
  disabled,
  onVisibleChange,
  onEditableChange,
  allowedVisible,
}: {
  readonly idPrefix: string;
  readonly visible: ReadonlyArray<ProjectRole>;
  readonly editable?: ReadonlyArray<ProjectRole>;
  readonly allowedVisible?: ReadonlyArray<ProjectRole>;
  readonly disabled: boolean;
  readonly onVisibleChange: (roles: ReadonlyArray<ProjectRole>) => void;
  readonly onEditableChange?: (roles: ReadonlyArray<ProjectRole>) => void;
}) {
  const visibleSet = new Set(visible);
  const editableSet = new Set(editable ?? []);
  const allowedVisibleSet = new Set(allowedVisible ?? projectRoleValues);
  return (
    <FieldSet>
      <FieldLegend variant="label">Role access</FieldLegend>
      <div className="overflow-x-auto">
        <table className="w-full min-w-lg text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="px-2 py-2 font-medium">Role</th>
              <th className="px-2 py-2 font-medium">Visible</th>
              {editable === undefined ? null : <th className="px-2 py-2 font-medium">Editable</th>}
            </tr>
          </thead>
          <tbody>
            {projectRoleValues.map((role) => {
              const required = role === "owner" || role === "developer";
              const visibleId = `${idPrefix}-${role}-visible`;
              const editableId = `${idPrefix}-${role}-editable`;
              return (
                <tr key={role} className="border-b last:border-b-0">
                  <th scope="row" className="px-2 py-2 font-normal">
                    {roleLabels[role]}
                  </th>
                  <td className="px-2 py-2">
                    <Checkbox
                      id={visibleId}
                      aria-label={`${roleLabels[role]} visible`}
                      checked={visibleSet.has(role)}
                      disabled={
                        disabled ||
                        required ||
                        (!visibleSet.has(role) && !allowedVisibleSet.has(role))
                      }
                      onCheckedChange={(checked) => {
                        const next = new Set(visibleSet);
                        if (checked === true) next.add(role);
                        else next.delete(role);
                        onVisibleChange(canonicalRoles(next));
                        if (checked !== true && onEditableChange) {
                          const nextEditable = new Set(editableSet);
                          nextEditable.delete(role);
                          onEditableChange(canonicalRoles(nextEditable));
                        }
                      }}
                    />
                  </td>
                  {editable === undefined ? null : (
                    <td className="px-2 py-2">
                      <Checkbox
                        id={editableId}
                        aria-label={`${roleLabels[role]} editable`}
                        checked={editableSet.has(role)}
                        disabled={
                          disabled ||
                          required ||
                          !visibleSet.has(role) ||
                          !contentWriteRoles.has(role)
                        }
                        onCheckedChange={(checked) => {
                          const next = new Set(editableSet);
                          if (checked === true) next.add(role);
                          else next.delete(role);
                          onEditableChange?.(canonicalRoles(next));
                        }}
                      />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </FieldSet>
  );
}

function flattenFields(fields: ReadonlyArray<CollectionFieldDefinition>) {
  const result: Array<CollectionFieldDefinition> = [];
  const visit = (field: CollectionFieldDefinition) => {
    result.push(field);
    field.children.forEach(visit);
  };
  fields.forEach(visit);
  return result;
}

function orderedFields(
  fields: ReadonlyArray<CollectionFieldDefinition>,
  presentationById: ReadonlyMap<string, AuthoringFieldPresentation>,
) {
  const result: Array<{ readonly field: CollectionFieldDefinition; readonly depth: number }> = [];
  const visit = (field: CollectionFieldDefinition, depth: number) => {
    result.push({ field, depth });
    [...field.children]
      .sort(
        (left, right) =>
          (presentationById.get(left.id)?.position ?? left.position) -
          (presentationById.get(right.id)?.position ?? right.position),
      )
      .forEach((child) => visit(child, depth + 1));
  };
  [...fields]
    .sort(
      (left, right) =>
        (presentationById.get(left.id)?.position ?? left.position) -
        (presentationById.get(right.id)?.position ?? right.position),
    )
    .forEach((field) => visit(field, 0));
  return result;
}

export function PresentationFieldCard({
  field,
  depth,
  presentation,
  siblingIndex,
  siblingCount,
  disabled,
  onChange,
  onMove,
}: {
  readonly field: CollectionFieldDefinition;
  readonly depth: number;
  readonly presentation: AuthoringFieldPresentation;
  readonly siblingIndex: number;
  readonly siblingCount: number;
  readonly disabled: boolean;
  readonly onChange: (next: AuthoringFieldPresentation) => void;
  readonly onMove: (direction: -1 | 1) => void;
}) {
  const labelId = `presentation-field-${field.id}-label`;
  return (
    <Card className={depth > 0 ? "ml-4" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{presentation.displayLabel ?? "List item"}</CardTitle>
            <CardDescription>
              <span className="font-mono" translate="no">
                {field.apiKey ?? "item"}
              </span>{" "}
              · {field.kind.replaceAll("_", " ")}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Move ${presentation.displayLabel ?? "list item"} up`}
              disabled={disabled || siblingIndex === 0}
              onClick={() => onMove(-1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Move ${presentation.displayLabel ?? "list item"} down`}
              disabled={disabled || siblingIndex === siblingCount - 1}
              onClick={() => onMove(1)}
            >
              <ArrowDownIcon />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {field.nodeRole === "list_item" ? null : (
            <Field data-disabled={disabled || undefined}>
              <FieldLabel htmlFor={labelId}>Display label</FieldLabel>
              <Input
                id={labelId}
                value={presentation.displayLabel ?? ""}
                maxLength={100}
                disabled={disabled}
                onChange={(event) =>
                  event.target.value === ""
                    ? undefined
                    : onChange({
                        ...presentation,
                        displayLabel: CollectionFieldDisplayLabel.make(event.target.value),
                      })
                }
              />
            </Field>
          )}
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={`${labelId}-help`}>Help text</FieldLabel>
            <Textarea
              id={`${labelId}-help`}
              value={presentation.editor.helpText ?? ""}
              maxLength={500}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...presentation,
                  editor: { ...presentation.editor, helpText: event.target.value || null },
                })
              }
            />
          </Field>
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={`${labelId}-placeholder`}>Placeholder</FieldLabel>
            <Input
              id={`${labelId}-placeholder`}
              value={presentation.editor.placeholder ?? ""}
              maxLength={200}
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...presentation,
                  editor: { ...presentation.editor, placeholder: event.target.value || null },
                })
              }
            />
          </Field>
          <RoleControls
            idPrefix={`field-${field.id}`}
            visible={presentation.editor.visibleToRoles}
            editable={presentation.editor.editableByRoles}
            disabled={disabled}
            onVisibleChange={(visibleToRoles) =>
              onChange({
                ...presentation,
                editor: { ...presentation.editor, visibleToRoles },
              })
            }
            onEditableChange={(editableByRoles) =>
              onChange({
                ...presentation,
                editor: { ...presentation.editor, editableByRoles },
              })
            }
          />
          {field.kind === "enum" ? (
            <FieldSet>
              <FieldLegend variant="label">Enum labels and order</FieldLegend>
              <FieldDescription>
                Values remain code-owned; only labels and authoring order change here.
              </FieldDescription>
              <FieldGroup>
                {[...presentation.enumOptions]
                  .sort((left, right) => left.position - right.position)
                  .map((option, index) => {
                    const structural = field.configuration.options.find(
                      (candidate) => candidate.id === option.optionId,
                    );
                    return (
                      <Field key={option.optionId} orientation="responsive">
                        <div className="min-w-28">
                          <FieldLabel htmlFor={`enum-${option.optionId}`}>
                            {structural?.value}
                          </FieldLabel>
                        </div>
                        <Input
                          id={`enum-${option.optionId}`}
                          value={option.label}
                          maxLength={100}
                          disabled={disabled}
                          onChange={(event) =>
                            onChange({
                              ...presentation,
                              enumOptions: presentation.enumOptions.map((current) =>
                                current.optionId === option.optionId
                                  ? { ...current, label: event.target.value }
                                  : current,
                              ),
                            })
                          }
                        />
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            aria-label={`Move ${option.label} up`}
                            disabled={disabled || index === 0}
                            onClick={() =>
                              onChange({
                                ...presentation,
                                enumOptions: moveItem(presentation.enumOptions, index, -1),
                              })
                            }
                          >
                            <ArrowUpIcon />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            aria-label={`Move ${option.label} down`}
                            disabled={disabled || index === presentation.enumOptions.length - 1}
                            onClick={() =>
                              onChange({
                                ...presentation,
                                enumOptions: moveItem(presentation.enumOptions, index, 1),
                              })
                            }
                          >
                            <ArrowDownIcon />
                          </Button>
                        </div>
                      </Field>
                    );
                  })}
              </FieldGroup>
            </FieldSet>
          ) : null}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

export function LayoutGroupEditor({
  group,
  groupIndex,
  groupCount,
  layout,
  rootFields,
  disabled,
  onLayoutChange,
  onMoveGroup,
  onDelete,
  allowDeleteLast,
}: {
  readonly group: EditorLayoutGroup;
  readonly groupIndex: number;
  readonly groupCount: number;
  readonly layout: EditorLayout;
  readonly rootFields: ReadonlyMap<string, CollectionFieldDefinition>;
  readonly disabled: boolean;
  readonly onLayoutChange: (layout: EditorLayout) => void;
  readonly onMoveGroup: (direction: -1 | 1) => void;
  readonly onDelete: () => void;
  readonly allowDeleteLast: boolean;
}) {
  const groups = allGroups(layout);
  const change = (next: EditorLayoutGroup) =>
    onLayoutChange(updateGroup(layout, group.id, () => next));
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{group.title}</CardTitle>
            <CardDescription>{group.fields.length} field placements</CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Move ${group.title} up`}
              disabled={disabled || groupIndex === 0}
              onClick={() => onMoveGroup(-1)}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Move ${group.title} down`}
              disabled={disabled || groupIndex === groupCount - 1}
              onClick={() => onMoveGroup(1)}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={`Delete ${group.title}`}
              disabled={
                disabled || group.fields.length > 0 || (!allowDeleteLast && groupCount === 1)
              }
              onClick={onDelete}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={`group-${group.id}-title`}>Group title</FieldLabel>
            <Input
              id={`group-${group.id}-title`}
              value={group.title}
              maxLength={100}
              disabled={disabled}
              onChange={(event) => change({ ...group, title: event.target.value })}
            />
          </Field>
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={`group-${group.id}-description`}>Description</FieldLabel>
            <Textarea
              id={`group-${group.id}-description`}
              value={group.description ?? ""}
              maxLength={500}
              disabled={disabled}
              onChange={(event) => change({ ...group, description: event.target.value || null })}
            />
          </Field>
          <Field data-disabled={disabled || undefined}>
            <FieldLabel htmlFor={`group-${group.id}-columns`}>Columns</FieldLabel>
            <NativeSelect
              id={`group-${group.id}-columns`}
              value={String(group.columns)}
              disabled={disabled}
              onChange={(event) =>
                change({ ...group, columns: event.target.value === "2" ? 2 : 1 })
              }
            >
              <NativeSelectOption value="1">One column</NativeSelectOption>
              <NativeSelectOption value="2">Two columns</NativeSelectOption>
            </NativeSelect>
          </Field>
          <RoleControls
            idPrefix={`group-${group.id}`}
            visible={group.visibleToRoles}
            disabled={disabled}
            onVisibleChange={(visibleToRoles) => change({ ...group, visibleToRoles })}
          />
          <FieldSet>
            <FieldLegend variant="label">Field placements</FieldLegend>
            <FieldGroup>
              {[...group.fields]
                .sort((left, right) => left.position - right.position)
                .map((placement, index) => (
                  <Field key={placement.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {rootFields.get(placement.fieldId)?.displayLabel ?? "Unknown field"}
                        </p>
                        <p className="text-muted-foreground font-mono text-xs" translate="no">
                          {rootFields.get(placement.fieldId)?.apiKey}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label="Move placement up"
                          disabled={disabled || index === 0}
                          onClick={() =>
                            change({ ...group, fields: moveItem(group.fields, index, -1) })
                          }
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          aria-label="Move placement down"
                          disabled={disabled || index === group.fields.length - 1}
                          onClick={() =>
                            change({ ...group, fields: moveItem(group.fields, index, 1) })
                          }
                        >
                          <ArrowDownIcon />
                        </Button>
                      </div>
                    </div>
                    <FieldGroup>
                      <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor={`placement-${placement.id}-group`}>Group</FieldLabel>
                        <NativeSelect
                          id={`placement-${placement.id}-group`}
                          value={group.id}
                          disabled={disabled}
                          onChange={(event) =>
                            onLayoutChange(movePlacement(layout, placement.id, event.target.value))
                          }
                        >
                          {groups.map((candidate) => (
                            <NativeSelectOption key={candidate.id} value={candidate.id}>
                              {candidate.title}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </Field>
                      <Field data-disabled={disabled || undefined}>
                        <FieldLabel htmlFor={`placement-${placement.id}-help`}>
                          Help override
                        </FieldLabel>
                        <Textarea
                          id={`placement-${placement.id}-help`}
                          value={placement.helpTextOverride ?? ""}
                          maxLength={500}
                          disabled={disabled}
                          onChange={(event) =>
                            change({
                              ...group,
                              fields: group.fields.map((current) =>
                                current.id === placement.id
                                  ? { ...current, helpTextOverride: event.target.value || null }
                                  : current,
                              ),
                            })
                          }
                        />
                      </Field>
                      <RoleControls
                        idPrefix={`placement-${placement.id}`}
                        visible={placement.visibleToRoles}
                        allowedVisible={rootFields.get(placement.fieldId)?.editor.visibleToRoles}
                        disabled={disabled}
                        onVisibleChange={(visibleToRoles) =>
                          change({
                            ...group,
                            fields: group.fields.map((current) =>
                              current.id === placement.id
                                ? { ...current, visibleToRoles }
                                : current,
                            ),
                          })
                        }
                      />
                    </FieldGroup>
                  </Field>
                ))}
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function PresentationWorkspace({
  scope,
  initial,
  published,
  canPublish,
}: {
  readonly scope: PresentationScope;
  readonly initial: AuthoringPresentationSnapshot;
  readonly published: PublishedSchemaRevision;
  readonly canPublish: boolean;
}) {
  const queryClient = useQueryClient();
  const [presentation, setPresentation] = useState<AuthoringCollectionPresentation>(
    initial.presentation,
  );
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () =>
      !globalThis.confirm("Leave this page and discard your unpublished presentation changes?"),
  });
  const change = (next: AuthoringCollectionPresentation) => {
    setPresentation(next);
    setDirty(true);
    setConflict(false);
  };
  const publish = useMutation(
    orpc.platform.projects.collections.schema.presentation.publish.mutationOptions({
      onSuccess: async (response) => {
        setDirty(false);
        setConflict(false);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.collections.schema.presentation.get.queryOptions({
              input: scope,
            }).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.collections.schema.draft.get.queryOptions({
              input: scope,
            }).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.platform.projects.collections.schema.form.getDraft.queryOptions({
              input: scope,
            }).queryKey,
          }),
        ]);
        toast.success(response.message);
      },
      onError: (error) => {
        setConflict(true);
        toast.error(error.message);
      },
    }),
  );
  const structures = flattenFields(published.fields);
  const presentationById = new Map(
    presentation.fields.map((field) => [field.fieldId, field] as const),
  );
  const roots = new Map(
    structures
      .filter((field) => field.nodeRole === "root")
      .map((field) => [field.id, field] as const),
  );
  const ordered = orderedFields(published.fields, presentationById);
  const siblingFields = (field: CollectionFieldDefinition) =>
    structures
      .filter((candidate) => candidate.parentFieldId === field.parentFieldId)
      .sort(
        (left, right) =>
          (presentationById.get(left.id)?.position ?? left.position) -
          (presentationById.get(right.id)?.position ?? right.position),
      );
  const updateField = (fieldId: string, next: AuthoringFieldPresentation) => {
    const visible = new Set(next.editor.visibleToRoles);
    const narrowPlacement = (group: EditorLayoutGroup): EditorLayoutGroup => ({
      ...group,
      fields: group.fields.map((placement) =>
        placement.fieldId === fieldId
          ? {
              ...placement,
              visibleToRoles: placement.visibleToRoles.filter((role) => visible.has(role)),
            }
          : placement,
      ),
    });
    change({
      ...presentation,
      fields: presentation.fields.map((field) => (field.fieldId === fieldId ? next : field)),
      editorLayout: {
        ...presentation.editorLayout,
        tabs: presentation.editorLayout.tabs.map((tab) => ({
          ...tab,
          groups: tab.groups.map(narrowPlacement),
        })),
        sidebarGroups: presentation.editorLayout.sidebarGroups.map(narrowPlacement),
      },
    });
  };
  const moveField = (field: CollectionFieldDefinition, direction: -1 | 1) => {
    const siblings = siblingFields(field);
    const index = siblings.findIndex((candidate) => candidate.id === field.id);
    const moved = moveItem(
      siblings.map((candidate) => {
        const current = presentationById.get(candidate.id);
        if (!current) throw new Error("Field presentation is unavailable.");
        return current;
      }),
      index,
      direction,
    );
    const movedById = new Map(moved.map((current) => [current.fieldId, current] as const));
    change({
      ...presentation,
      fields: presentation.fields.map((current) => movedById.get(current.fieldId) ?? current),
    });
  };
  const layoutChange = (editorLayout: EditorLayout) => change({ ...presentation, editorLayout });
  const addGroup = (
    location: { readonly kind: "tab"; readonly tabId: string } | { readonly kind: "sidebar" },
  ) => {
    const group: EditorLayoutGroup = {
      id: EditorLayoutNodeId.make(crypto.randomUUID()),
      title: "New group",
      description: null,
      position:
        location.kind === "sidebar"
          ? presentation.editorLayout.sidebarGroups.length
          : (presentation.editorLayout.tabs.find((tab) => tab.id === location.tabId)?.groups
              .length ?? 0),
      columns: 1,
      visibleToRoles: [...projectRoleValues],
      fields: [],
    };
    layoutChange(
      location.kind === "sidebar"
        ? {
            ...presentation.editorLayout,
            sidebarGroups: [...presentation.editorLayout.sidebarGroups, group],
          }
        : {
            ...presentation.editorLayout,
            tabs: presentation.editorLayout.tabs.map((tab) =>
              tab.id === location.tabId ? { ...tab, groups: [...tab.groups, group] } : tab,
            ),
          },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {conflict ? (
        <Alert variant="destructive">
          <AlertTitle>Presentation changed elsewhere</AlertTitle>
          <AlertDescription>
            Your local edits are preserved. Review them, then reload explicitly to use the newest
            published authority.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Collection presentation</CardTitle>
          <CardDescription>
            Labels and descriptions change the authoring experience without changing code or
            generated types.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-disabled={!canPublish || undefined}>
              <FieldLabel htmlFor="presentation-collection-name">Display name</FieldLabel>
              <Input
                id="presentation-collection-name"
                value={presentation.displayName}
                maxLength={100}
                disabled={!canPublish}
                onChange={(event) =>
                  event.target.value === ""
                    ? undefined
                    : change({
                        ...presentation,
                        displayName: CollectionDisplayName.make(event.target.value),
                      })
                }
              />
            </Field>
            <Field data-disabled={!canPublish || undefined}>
              <FieldLabel htmlFor="presentation-collection-description">Description</FieldLabel>
              <Textarea
                id="presentation-collection-description"
                value={presentation.description ?? ""}
                maxLength={500}
                disabled={!canPublish}
                onChange={(event) =>
                  change({
                    ...presentation,
                    description:
                      event.target.value === ""
                        ? null
                        : CollectionDescription.make(event.target.value),
                  })
                }
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-4" aria-labelledby="presentation-fields-heading">
        <div>
          <h2 id="presentation-fields-heading" className="text-xl font-semibold">
            Fields
          </h2>
          <p className="text-muted-foreground text-sm">
            Edit nested order, labels, help, placeholders, enum labels, visibility, and editability.
          </p>
        </div>
        {ordered.map(({ field, depth }) => {
          const current = presentationById.get(field.id);
          if (!current) return null;
          const siblings = siblingFields(field);
          return (
            <PresentationFieldCard
              key={field.id}
              field={field}
              depth={depth}
              presentation={current}
              siblingIndex={siblings.findIndex((candidate) => candidate.id === field.id)}
              siblingCount={siblings.length}
              disabled={!canPublish}
              onChange={(next) => updateField(field.id, next)}
              onMove={(direction) => moveField(field, direction)}
            />
          );
        })}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="presentation-layout-heading">
        <div>
          <h2 id="presentation-layout-heading" className="text-xl font-semibold">
            Editor layout
          </h2>
          <p className="text-muted-foreground text-sm">
            Configure tabs, groups, sidebar groups, columns, placements, help, and role visibility.
          </p>
        </div>
        {[...presentation.editorLayout.tabs]
          .sort((left, right) => left.position - right.position)
          .map((tab, tabIndex) => (
            <Card key={tab.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{tab.title}</CardTitle>
                    <CardDescription>Tab {tabIndex + 1}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Move ${tab.title} up`}
                      disabled={!canPublish || tabIndex === 0}
                      onClick={() =>
                        layoutChange({
                          ...presentation.editorLayout,
                          tabs: moveItem(presentation.editorLayout.tabs, tabIndex, -1),
                        })
                      }
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Move ${tab.title} down`}
                      disabled={
                        !canPublish || tabIndex === presentation.editorLayout.tabs.length - 1
                      }
                      onClick={() =>
                        layoutChange({
                          ...presentation.editorLayout,
                          tabs: moveItem(presentation.editorLayout.tabs, tabIndex, 1),
                        })
                      }
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label={`Delete ${tab.title}`}
                      disabled={
                        !canPublish ||
                        presentation.editorLayout.tabs.length === 1 ||
                        tab.groups.some((group) => group.fields.length > 0)
                      }
                      onClick={() =>
                        layoutChange({
                          ...presentation.editorLayout,
                          tabs: normalizePositions(
                            presentation.editorLayout.tabs.filter(
                              (candidate) => candidate.id !== tab.id,
                            ),
                          ),
                        })
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field data-disabled={!canPublish || undefined}>
                    <FieldLabel htmlFor={`tab-${tab.id}-title`}>Tab title</FieldLabel>
                    <Input
                      id={`tab-${tab.id}-title`}
                      value={tab.title}
                      maxLength={100}
                      disabled={!canPublish}
                      onChange={(event) =>
                        layoutChange({
                          ...presentation.editorLayout,
                          tabs: presentation.editorLayout.tabs.map((current) =>
                            current.id === tab.id
                              ? { ...current, title: event.target.value }
                              : current,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field data-disabled={!canPublish || undefined}>
                    <FieldLabel htmlFor={`tab-${tab.id}-description`}>Description</FieldLabel>
                    <Textarea
                      id={`tab-${tab.id}-description`}
                      value={tab.description ?? ""}
                      maxLength={500}
                      disabled={!canPublish}
                      onChange={(event) =>
                        layoutChange({
                          ...presentation.editorLayout,
                          tabs: presentation.editorLayout.tabs.map((current) =>
                            current.id === tab.id
                              ? { ...current, description: event.target.value || null }
                              : current,
                          ),
                        })
                      }
                    />
                  </Field>
                  <RoleControls
                    idPrefix={`tab-${tab.id}`}
                    visible={tab.visibleToRoles}
                    disabled={!canPublish}
                    onVisibleChange={(visibleToRoles) =>
                      layoutChange({
                        ...presentation.editorLayout,
                        tabs: presentation.editorLayout.tabs.map((current) =>
                          current.id === tab.id ? { ...current, visibleToRoles } : current,
                        ),
                      })
                    }
                  />
                  <Separator />
                  <div className="flex flex-col gap-4">
                    {[...tab.groups]
                      .sort((left, right) => left.position - right.position)
                      .map((group, groupIndex) => (
                        <LayoutGroupEditor
                          key={group.id}
                          group={group}
                          groupIndex={groupIndex}
                          groupCount={tab.groups.length}
                          layout={presentation.editorLayout}
                          rootFields={roots}
                          disabled={!canPublish}
                          onLayoutChange={layoutChange}
                          onMoveGroup={(direction) =>
                            layoutChange({
                              ...presentation.editorLayout,
                              tabs: presentation.editorLayout.tabs.map((current) =>
                                current.id === tab.id
                                  ? {
                                      ...current,
                                      groups: moveItem(current.groups, groupIndex, direction),
                                    }
                                  : current,
                              ),
                            })
                          }
                          allowDeleteLast={false}
                          onDelete={() =>
                            layoutChange({
                              ...presentation.editorLayout,
                              tabs: presentation.editorLayout.tabs.map((current) =>
                                current.id === tab.id
                                  ? {
                                      ...current,
                                      groups: normalizePositions(
                                        current.groups.filter(
                                          (candidate) => candidate.id !== group.id,
                                        ),
                                      ),
                                    }
                                  : current,
                              ),
                            })
                          }
                        />
                      ))}
                  </div>
                </FieldGroup>
              </CardContent>
              <CardFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canPublish || tab.groups.length >= 20}
                  onClick={() => addGroup({ kind: "tab", tabId: tab.id })}
                >
                  <PlusIcon data-icon="inline-start" />
                  Add group
                </Button>
              </CardFooter>
            </Card>
          ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={!canPublish || presentation.editorLayout.tabs.length >= 10}
          onClick={() => {
            const tabId = EditorLayoutNodeId.make(crypto.randomUUID());
            const groupId = EditorLayoutNodeId.make(crypto.randomUUID());
            layoutChange({
              ...presentation.editorLayout,
              tabs: [
                ...presentation.editorLayout.tabs,
                {
                  id: tabId,
                  title: "New tab",
                  description: null,
                  position: presentation.editorLayout.tabs.length,
                  visibleToRoles: [...projectRoleValues],
                  groups: [
                    {
                      id: groupId,
                      title: "Main",
                      description: null,
                      position: 0,
                      columns: 1,
                      visibleToRoles: [...projectRoleValues],
                      fields: [],
                    },
                  ],
                },
              ],
            });
          }}
        >
          <PlusIcon data-icon="inline-start" />
          Add tab
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Sidebar groups</CardTitle>
            <CardDescription>
              Move root field placements into sidebar groups when they should remain alongside the
              main form.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {presentation.editorLayout.sidebarGroups.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sidebar groups.</p>
            ) : (
              [...presentation.editorLayout.sidebarGroups]
                .sort((left, right) => left.position - right.position)
                .map((group, groupIndex) => (
                  <LayoutGroupEditor
                    key={group.id}
                    group={group}
                    groupIndex={groupIndex}
                    groupCount={presentation.editorLayout.sidebarGroups.length}
                    layout={presentation.editorLayout}
                    rootFields={roots}
                    disabled={!canPublish}
                    onLayoutChange={layoutChange}
                    onMoveGroup={(direction) =>
                      layoutChange({
                        ...presentation.editorLayout,
                        sidebarGroups: moveItem(
                          presentation.editorLayout.sidebarGroups,
                          groupIndex,
                          direction,
                        ),
                      })
                    }
                    allowDeleteLast
                    onDelete={() =>
                      layoutChange({
                        ...presentation.editorLayout,
                        sidebarGroups: normalizePositions(
                          presentation.editorLayout.sidebarGroups.filter(
                            (candidate) => candidate.id !== group.id,
                          ),
                        ),
                      })
                    }
                  />
                ))
            )}
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!canPublish || presentation.editorLayout.sidebarGroups.length >= 10}
              onClick={() => addGroup({ kind: "sidebar" })}
            >
              <PlusIcon data-icon="inline-start" />
              Add sidebar group
            </Button>
          </CardFooter>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Publish presentation</CardTitle>
          <CardDescription>
            Creates an immutable revision. Structure and content contract hashes must remain
            unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">Revision {initial.revision.sequence}</Badge>
          <Badge variant="outline">Structure unchanged</Badge>
          <Badge variant="outline">Contract unchanged</Badge>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!canPublish || !dirty || publish.isPending}
            onClick={() =>
              publish.mutate({
                ...scope,
                commandId: crypto.randomUUID(),
                expectedRevisionId: initial.revision.revisionId,
                expectedSequence: initial.revision.sequence,
                presentation,
              })
            }
          >
            {publish.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {publish.isPending ? "Publishing…" : "Publish presentation"}
          </Button>
          {conflict ? (
            <Button type="button" variant="outline" onClick={() => globalThis.location.reload()}>
              Reload current presentation
            </Button>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}

export function PresentationEditor({
  projectId,
  collectionId,
}: {
  readonly projectId: string;
  readonly collectionId: string;
}) {
  const project = useQuery(orpc.platform.projects.get.queryOptions({ input: { projectId } }));
  const access = useQuery(orpc.platform.projects.access.queryOptions({ input: { projectId } }));
  const environmentId = project.data?.data.environment.id;
  const scope = {
    projectId,
    environmentId: environmentId ?? "00000000-0000-0000-0000-000000000000",
    collectionId,
  };
  const presentation = useQuery({
    ...orpc.platform.projects.collections.schema.presentation.get.queryOptions({ input: scope }),
    enabled: Boolean(environmentId),
  });
  const revisionId = presentation.data?.data.revision.revisionId;
  const published = useQuery({
    ...orpc.platform.projects.collections.schema.published.getRevision.queryOptions({
      input: {
        ...scope,
        revisionId: revisionId ?? "00000000-0000-0000-0000-000000000000",
      },
    }),
    enabled: Boolean(environmentId && revisionId),
  });

  if (project.isPending || access.isPending || presentation.isPending || published.isPending) {
    return (
      <main className="mx-auto flex min-h-64 w-full max-w-6xl items-center justify-center">
        <Spinner />
        <span className="sr-only">Loading presentation editor</span>
      </main>
    );
  }
  if (!project.data || !access.data || !presentation.data || !published.data || !environmentId)
    return null;
  const allowed = new Set(access.data.data.allowedActions);
  const canPublish =
    allowed.has("schema.read") &&
    allowed.has("schema.write") &&
    allowed.has("schema.publish") &&
    project.data.data.archivedAt === null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Button
        variant="ghost"
        className="self-start"
        render={
          <Link
            to="/projects/$projectId/collections/$collectionId"
            params={{ projectId, collectionId }}
          />
        }
      >
        <ArrowLeftIcon data-icon="inline-start" />
        Back to schema
      </Button>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Presentation v{presentation.data.data.revision.sequence}</Badge>
          <Badge variant="outline">Immutable publication</Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Presentation editor</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Manage the hosted authoring experience while code remains the only structural schema
            authority.
          </p>
        </div>
      </header>
      {!canPublish ? (
        <Alert>
          <AlertTitle>Read-only presentation</AlertTitle>
          <AlertDescription>
            Schema read, write, and publish permission are all required to publish presentation
            revisions.
          </AlertDescription>
        </Alert>
      ) : null}
      <PresentationWorkspace
        key={presentation.data.data.revision.revisionId}
        scope={scope}
        initial={presentation.data.data}
        published={published.data.data}
        canPublish={canPublish}
      />
    </main>
  );
}
