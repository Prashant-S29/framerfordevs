import type { ContentFormDefinition, ContentFormField } from "@framerfordevs/content-form";

export type StudioRebaseReason =
  | "removed_or_hidden"
  | "read_only"
  | "kind_changed"
  | "localization_changed"
  | "concurrent_change"
  | "invalid_value"
  | "parent_changed"
  | "list_changed";

export interface StudioUnresolvedChange {
  readonly fieldId: string;
  readonly label: string;
  readonly section: "shared" | "localized";
  readonly reason: StudioRebaseReason;
  readonly canKeep: boolean;
  readonly path: ReadonlyArray<string>;
  readonly localValue: unknown;
}

export interface StudioRebaseResult {
  readonly values: Readonly<Record<string, unknown>>;
  readonly unresolved: ReadonlyArray<StudioUnresolvedChange>;
  readonly carriedCount: number;
}

interface IndexedField {
  readonly field: ContentFormField;
  readonly parentPath: ReadonlyArray<string>;
  readonly localization: "shared" | "localized" | "mixed" | null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && equal(left[key], right[key]))
    );
  }
  return false;
}

function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy);
  if (isRecord(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  return value;
}

function atPath(values: Readonly<Record<string, unknown>>, path: ReadonlyArray<string>): unknown {
  let current: unknown = values;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = Reflect.get(current, segment);
  }
  return current;
}

function withValue(
  values: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (path.length === 0) return values;
  const output: Record<string, unknown> = Object.fromEntries(Object.entries(values));
  let target = output;
  for (const [index, segment] of path.entries()) {
    if (index === path.length - 1) {
      if (value === undefined) delete target[segment];
      else Reflect.set(target, segment, copy(value));
      break;
    }
    const current = Reflect.get(target, segment);
    const child: Record<string, unknown> = isRecord(current)
      ? Object.fromEntries(Object.entries(current))
      : {};
    Reflect.set(target, segment, child);
    target = child;
  }
  return output;
}

function indexFields(definition: ContentFormDefinition): ReadonlyMap<string, IndexedField> {
  const output = new Map<string, IndexedField>();
  const visit = (
    fields: ReadonlyArray<ContentFormField>,
    parentPath: ReadonlyArray<string>,
    inherited: "shared" | "localized" | "mixed" | null,
  ) => {
    for (const field of fields) {
      const localization = field.localization ?? inherited;
      output.set(field.id, { field, parentPath, localization });
      visit(field.children, [...parentPath, field.id], localization);
    }
  };
  visit(definition.fields, [], null);
  return output;
}

function validUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function configuredNumber(field: ContentFormField, key: string): number | undefined {
  const candidate = Reflect.get(field.configuration, key);
  return typeof candidate === "number" ? candidate : undefined;
}

function configuredString(field: ContentFormField, key: string): string | undefined {
  const candidate = Reflect.get(field.configuration, key);
  return typeof candidate === "string" ? candidate : undefined;
}

function validValue(
  field: ContentFormField,
  value: unknown,
  depth = 0,
  rejectPattern = false,
): boolean {
  if (value === undefined || value === null || value === "") return !field.required;
  if (depth > 24) return false;
  switch (field.kind) {
    case "short_text":
    case "long_text":
    case "slug": {
      if (typeof value !== "string") return false;
      const minimum = configuredNumber(field, "minLength");
      const maximum = configuredNumber(field, "maxLength");
      const pattern = configuredString(field, "pattern");
      if (
        (minimum !== undefined && value.length < minimum) ||
        (maximum !== undefined && value.length > maximum)
      )
        return false;
      if (pattern !== undefined && rejectPattern) return false;
      return true;
    }
    case "rich_text":
      return (
        isRecord(value) &&
        value.version === 1 &&
        value.profile === "ffd-portable-text" &&
        Array.isArray(value.blocks)
      );
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      const mode = Reflect.get(field.configuration, "mode");
      const minimum = configuredNumber(field, "minimum");
      const maximum = configuredNumber(field, "maximum");
      return (
        (mode !== "integer" || Number.isInteger(value)) &&
        (minimum === undefined || value >= minimum) &&
        (maximum === undefined || value <= maximum)
      );
    }
    case "decimal":
      return typeof value === "string" && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u.test(value);
    case "money": {
      if (
        !isRecord(value) ||
        typeof value.amount !== "string" ||
        typeof value.currency !== "string"
      )
        return false;
      const currencies = Reflect.get(field.configuration, "currencies");
      return Array.isArray(currencies) && currencies.includes(value.currency);
    }
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value);
    case "date_time":
      return typeof value === "string" && !Number.isNaN(Date.parse(value));
    case "enum": {
      if (typeof value !== "string") return false;
      const options = Reflect.get(field.configuration, "options");
      return (
        Array.isArray(options) &&
        options.some((option) => isRecord(option) && Reflect.get(option, "value") === value)
      );
    }
    case "url":
      return typeof value === "string" && validUrl(value);
    case "email":
      return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
    case "json":
      try {
        copy(value);
        return true;
      } catch {
        return false;
      }
    case "object":
      return (
        isRecord(value) &&
        field.children.every((child) =>
          validValue(child, Reflect.get(value, child.id), depth + 1, rejectPattern),
        )
      );
    case "list": {
      if (!Array.isArray(value)) return false;
      const minimum = configuredNumber(field, "minItems") ?? 0;
      const maximum = configuredNumber(field, "maxItems") ?? 100;
      const item = field.children[0];
      return (
        value.length >= minimum &&
        value.length <= maximum &&
        item !== undefined &&
        value.every((candidate) => validValue(item, candidate, depth + 1, rejectPattern))
      );
    }
    case "reference":
      return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
      );
    case "external_asset":
      return (
        isRecord(value) &&
        value.source === "external" &&
        typeof value.url === "string" &&
        validUrl(value.url)
      );
  }
}

function section(indexed: IndexedField): "shared" | "localized" {
  return indexed.localization === "shared" ? "shared" : "localized";
}

export function validateStudioValues(
  definition: ContentFormDefinition,
  values: Readonly<Record<string, unknown>>,
): ReadonlyArray<{ readonly fieldId: string; readonly message: string }> {
  const editable = new Set(definition.editableFieldIds);
  const issues: Array<{ readonly fieldId: string; readonly message: string }> = [];
  const visit = (field: ContentFormField, fieldValue: unknown) => {
    if (field.kind === "object" && isRecord(fieldValue)) {
      for (const child of field.children) visit(child, Reflect.get(fieldValue, child.id));
      return;
    }
    if (editable.has(field.id) && !validValue(field, fieldValue)) {
      issues.push({ fieldId: field.id, message: "This field value is invalid." });
    }
  };
  for (const field of definition.fields) visit(field, Reflect.get(values, field.id));
  return issues;
}

/**
 * Conservatively carries uncontested stable-ID edits onto separately fetched authority.
 * It is pure and never fetches, persists, logs, or mutates an input.
 */
export function rebaseStudioValues(input: {
  readonly oldDefinition: ContentFormDefinition;
  readonly oldBaseline: Readonly<Record<string, unknown>>;
  readonly localValues: Readonly<Record<string, unknown>>;
  readonly latestDefinition: ContentFormDefinition;
  readonly latestValues: Readonly<Record<string, unknown>>;
}): StudioRebaseResult {
  const oldFields = indexFields(input.oldDefinition);
  const latestFields = indexFields(input.latestDefinition);
  const latestEditable = new Set(input.latestDefinition.editableFieldIds);
  let values: Readonly<Record<string, unknown>> = Object.fromEntries(
    Object.entries(input.latestValues).map(([key, value]) => [key, copy(value)]),
  );
  const unresolved: Array<StudioUnresolvedChange> = [];
  let carriedCount = 0;

  for (const [fieldId, oldIndexed] of oldFields) {
    const field = oldIndexed.field;
    if (field.kind === "object" || field.nodeRole === "list_item") continue;
    const path = [...oldIndexed.parentPath, fieldId];
    const oldValue = atPath(input.oldBaseline, path);
    const localValue = atPath(input.localValues, path);
    if (equal(oldValue, localValue)) continue;
    const latestIndexed = latestFields.get(fieldId);
    let reason: StudioRebaseReason | undefined;
    let canKeep = false;
    if (field.kind === "list") reason = "list_changed";
    else if (latestIndexed === undefined) reason = "removed_or_hidden";
    else if (!equal(oldIndexed.parentPath, latestIndexed.parentPath)) reason = "parent_changed";
    else if (field.kind !== latestIndexed.field.kind) reason = "kind_changed";
    else if (oldIndexed.localization !== latestIndexed.localization)
      reason = "localization_changed";
    else if (!latestEditable.has(fieldId)) reason = "read_only";
    else if (!validValue(latestIndexed.field, localValue, 0, true)) reason = "invalid_value";
    else if (!equal(oldValue, atPath(input.latestValues, path))) {
      reason = "concurrent_change";
      canKeep = true;
    }
    if (reason !== undefined) {
      unresolved.push({
        fieldId,
        label: field.displayLabel ?? "Unnamed field",
        section: section(oldIndexed),
        reason,
        canKeep,
        path,
        localValue: copy(localValue),
      });
      continue;
    }
    values = withValue(values, path, localValue);
    carriedCount += 1;
  }
  return { values, unresolved, carriedCount };
}

export function keepStudioUnresolvedChange(
  values: Readonly<Record<string, unknown>>,
  change: StudioUnresolvedChange,
): Readonly<Record<string, unknown>> {
  return change.canKeep ? withValue(values, change.path, change.localValue) : values;
}
