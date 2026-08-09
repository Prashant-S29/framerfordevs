// Projects schema-configured defaults into stable-ID generated-form values for new draft partitions.

import type { CollectionFieldDefinition } from "@framerfordevs/api/contracts/schemas";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toStableValue = (field: CollectionFieldDefinition, value: unknown): unknown => {
  if (field.kind === "object" && isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const childValue = Reflect.get(value, child.apiKey);
      if (childValue !== undefined) Reflect.set(result, child.id, toStableValue(child, childValue));
    }
    return result;
  }
  const item = field.children[0];
  if (field.kind === "list" && Array.isArray(value) && item)
    return value.map((itemValue) => toStableValue(item, itemValue));
  return value;
};

const fieldDefault = (field: CollectionFieldDefinition): unknown => {
  const configured = Reflect.get(field.configuration, "default");
  if (configured !== undefined) return toStableValue(field, configured);
  if (field.kind !== "object") return undefined;
  const result: Record<string, unknown> = {};
  for (const child of field.children) {
    const childValue = fieldDefault(child);
    if (childValue !== undefined) Reflect.set(result, child.id, childValue);
  }
  return Object.keys(result).length > 0 ? result : undefined;
};

export const applyGeneratedFormDefaults = (
  fields: ReadonlyArray<CollectionFieldDefinition>,
  values: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const result: Record<string, unknown> = { ...values };
  for (const field of fields) {
    if (Reflect.get(result, field.id) !== undefined) continue;
    const value = fieldDefault(field);
    if (value !== undefined) Reflect.set(result, field.id, value);
  }
  return result;
};

export const applyNewEntryPartitionDefaults = (
  fields: ReadonlyArray<CollectionFieldDefinition>,
  values: Readonly<Record<string, unknown>>,
  version: number,
): Readonly<Record<string, unknown>> =>
  version === 0 ? applyGeneratedFormDefaults(fields, values) : values;
