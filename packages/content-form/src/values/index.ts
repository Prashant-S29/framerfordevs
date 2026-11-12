import type {
  ContentEditorLayout,
  ContentFormDefinition,
  ContentFormField,
  ContentLayoutGroup,
} from "../model";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function objectValue(value: unknown, key: string): unknown {
  return isRecord(value) ? Reflect.get(value, key) : undefined;
}

function mapNestedValue(
  field: ContentFormField,
  value: unknown,
  childKey: (child: ContentFormField) => string | null,
  outputKey: (child: ContentFormField) => string | null,
): unknown {
  if (field.kind === "object" && isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      const sourceKey = childKey(child);
      const targetKey = outputKey(child);
      if (sourceKey === null || targetKey === null) continue;
      const childValue = Reflect.get(value, sourceKey);
      if (childValue !== undefined)
        Reflect.set(result, targetKey, mapNestedValue(child, childValue, childKey, outputKey));
    }
    return result;
  }
  const item = field.children[0];
  if (field.kind === "list" && Array.isArray(value) && item)
    return value.map((itemValue) => mapNestedValue(item, itemValue, childKey, outputKey));
  return value;
}

export function apiKeyValuesToStableIds(
  fields: ReadonlyArray<ContentFormField>,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.apiKey === null) continue;
    const value = Reflect.get(values, field.apiKey);
    if (value !== undefined)
      Reflect.set(
        result,
        field.id,
        mapNestedValue(
          field,
          value,
          (child) => child.apiKey,
          (child) => child.id,
        ),
      );
  }
  return result;
}

export function stableIdValuesToApiKeys(
  fields: ReadonlyArray<ContentFormField>,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.apiKey === null) continue;
    const value = Reflect.get(values, field.id);
    if (value !== undefined)
      Reflect.set(
        result,
        field.apiKey,
        mapNestedValue(
          field,
          value,
          (child) => child.id,
          (child) => child.apiKey,
        ),
      );
  }
  return result;
}

export type ContentDefaultKeying = "api_key" | "field_id";

function projectedDefaultValue(
  field: ContentFormField,
  value: unknown,
  keying: ContentDefaultKeying,
  editableFieldIds?: ReadonlySet<string>,
): unknown {
  if (field.kind === "object" && isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      if (editableFieldIds !== undefined && !hasEditableDefaultAuthority(child, editableFieldIds)) {
        continue;
      }
      const sourceKey = keying === "field_id" ? child.id : child.apiKey;
      if (sourceKey === null) continue;
      const childValue = Reflect.get(value, sourceKey);
      if (childValue !== undefined) {
        Reflect.set(
          result,
          child.id,
          projectedDefaultValue(child, childValue, keying, editableFieldIds),
        );
      }
    }
    return result;
  }
  const item = field.children[0];
  if (field.kind === "list" && Array.isArray(value) && item) {
    return value.map((itemValue) =>
      projectedDefaultValue(item, itemValue, keying, editableFieldIds),
    );
  }
  return value;
}

function fieldDefault(
  field: ContentFormField,
  keying: ContentDefaultKeying,
  editableFieldIds?: ReadonlySet<string>,
): unknown {
  const configured = Reflect.get(field.configuration, "default");
  if (configured !== undefined)
    return projectedDefaultValue(field, configured, keying, editableFieldIds);
  if (field.kind !== "object") return undefined;
  const result: Record<string, unknown> = {};
  for (const child of field.children) {
    if (editableFieldIds !== undefined && !hasEditableDefaultAuthority(child, editableFieldIds)) {
      continue;
    }
    const childValue = fieldDefault(child, keying, editableFieldIds);
    if (childValue !== undefined) Reflect.set(result, child.id, childValue);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export interface ContentDefaultOptions {
  readonly keying?: ContentDefaultKeying;
  readonly editableFieldIds?: ReadonlySet<string>;
}

export function applyGeneratedFormDefaults(
  fields: ReadonlyArray<ContentFormField>,
  values: Readonly<Record<string, unknown>>,
  options: ContentDefaultOptions = {},
): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...values };
  const keying = options.keying ?? "api_key";
  for (const field of fields) {
    if (
      Reflect.get(result, field.id) !== undefined ||
      (options.editableFieldIds !== undefined &&
        !hasEditableDefaultAuthority(field, options.editableFieldIds))
    ) {
      continue;
    }
    const value = fieldDefault(field, keying, options.editableFieldIds);
    if (value !== undefined) Reflect.set(result, field.id, value);
  }
  return result;
}

function hasEditableDefaultAuthority(
  field: ContentFormField,
  editableFieldIds: ReadonlySet<string>,
): boolean {
  return (
    editableFieldIds.has(field.id) ||
    field.children.some((child) => hasEditableDefaultAuthority(child, editableFieldIds))
  );
}

export function applyNewEntryPartitionDefaults(
  fields: ReadonlyArray<ContentFormField>,
  values: Readonly<Record<string, unknown>>,
  version: number,
  options: ContentDefaultOptions = {},
): Readonly<Record<string, unknown>> {
  return version === 0 ? applyGeneratedFormDefaults(fields, values, options) : values;
}

function withChildren(
  field: ContentFormField,
  children: ReadonlyArray<ContentFormField>,
): ContentFormField {
  return { ...field, children };
}

function partitionField(
  field: ContentFormField,
  scope: "shared" | "localized",
  inherited: "shared" | "localized" | null = null,
): ContentFormField | null {
  const effective = inherited ?? field.localization;
  if (effective === scope) return field;
  if (effective !== "mixed" || field.kind !== "object") return null;
  const children = field.children.flatMap((child) => {
    const projected = partitionField(child, scope);
    return projected ? [projected] : [];
  });
  return children.length > 0 ? withChildren(field, children) : null;
}

function partitionGroup(
  group: ContentLayoutGroup,
  visibleRootIds: ReadonlySet<string>,
): ContentLayoutGroup | null {
  const fields = group.fields.filter((placement) => visibleRootIds.has(placement.fieldId));
  return fields.length > 0 ? { ...group, fields } : null;
}

function partitionLayout(
  layout: ContentEditorLayout,
  visibleRootIds: ReadonlySet<string>,
): ContentEditorLayout {
  return {
    version: 1,
    tabs: layout.tabs.flatMap((tab) => {
      const groups = tab.groups.flatMap((group) => {
        const projected = partitionGroup(group, visibleRootIds);
        return projected ? [projected] : [];
      });
      return groups.length > 0 ? [{ ...tab, groups }] : [];
    }),
    sidebarGroups: layout.sidebarGroups.flatMap((group) => {
      const projected = partitionGroup(group, visibleRootIds);
      return projected ? [projected] : [];
    }),
  };
}

export function partitionContentFormDefinition(
  definition: ContentFormDefinition,
  scope: "shared" | "localized",
  canEdit: boolean,
): ContentFormDefinition {
  const fields = definition.fields.flatMap((field) => {
    const projected = partitionField(field, scope);
    return projected ? [projected] : [];
  });
  const visibleFieldIds = new Set<string>();
  const stack = [...fields];
  while (stack.length > 0) {
    const field = stack.pop();
    if (!field) continue;
    visibleFieldIds.add(field.id);
    stack.push(...field.children);
  }
  const visibleRootIds = new Set(fields.map((field) => field.id));
  return {
    ...definition,
    canEdit: definition.canEdit && canEdit,
    fields,
    editableFieldIds: definition.editableFieldIds.filter((id) => visibleFieldIds.has(id)),
    editorLayout: partitionLayout(definition.editorLayout, visibleRootIds),
  };
}

export interface MutationField {
  readonly id: string;
  readonly kind: string;
  readonly localization: "shared" | "localized" | "mixed" | null;
  readonly children: ReadonlyArray<MutationField>;
}

export type DraftMutationPath = readonly [string, ...ReadonlyArray<string>];
export type ContentDraftMutation =
  | { readonly operation: "set"; readonly path: DraftMutationPath; readonly value: unknown }
  | { readonly operation: "unset"; readonly path: DraftMutationPath };

function cleanJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanJson).filter((item) => item !== undefined);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanJson(item)]),
  );
}

function appendChangedValue(
  mutations: Array<ContentDraftMutation>,
  path: DraftMutationPath,
  current: unknown,
  baseline: unknown,
): void {
  const value = cleanJson(current);
  const previous = cleanJson(baseline);
  if (JSON.stringify(value) === JSON.stringify(previous)) return;
  mutations.push(
    value === undefined ? { operation: "unset", path } : { operation: "set", path, value },
  );
}

function appendFieldMutations(
  mutations: Array<ContentDraftMutation>,
  field: MutationField,
  path: DraftMutationPath,
  current: unknown,
  baseline: unknown,
): void {
  if (field.kind !== "object" || field.localization !== "mixed") {
    appendChangedValue(mutations, path, current, baseline);
    return;
  }
  for (const child of field.children) {
    appendFieldMutations(
      mutations,
      child,
      [...path, child.id],
      objectValue(current, child.id),
      objectValue(baseline, child.id),
    );
  }
}

export function fieldMutations(
  current: Readonly<Record<string, unknown>>,
  baseline: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<MutationField>,
): ReadonlyArray<ContentDraftMutation> {
  const mutations: Array<ContentDraftMutation> = [];
  for (const field of fields) {
    appendFieldMutations(
      mutations,
      field,
      [field.id],
      Reflect.get(current, field.id),
      Reflect.get(baseline, field.id),
    );
  }
  return mutations;
}
