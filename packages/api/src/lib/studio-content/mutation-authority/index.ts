// Rejects stable-ID mutations outside the exact role-projected Studio form before M7 execution.

import type { EntryValueMutation } from "../../../contracts/entry";
import {
  studioContentLimits,
  type StudioFormProjection,
  type StudioFormField,
} from "../../../contracts/studio-content";

interface IndexedField {
  readonly field: StudioFormField;
  readonly parent: StudioFormField | null;
}

function indexFields(fields: ReadonlyArray<StudioFormField>): ReadonlyMap<string, IndexedField> {
  const index = new Map<string, IndexedField>();
  const visit = (field: StudioFormField, parent: StudioFormField | null): void => {
    index.set(field.id, { field, parent });
    for (const child of field.children) visit(child, field);
  };
  for (const field of fields) visit(field, null);
  return index;
}

function valueIsBounded(value: unknown): boolean {
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    nodes += 1;
    if (
      nodes > studioContentLimits.mutationValueNodes ||
      current.depth > studioContentLimits.mutationValueDepth
    ) {
      return false;
    }
    if (typeof current.value !== "object" || current.value === null) continue;
    if (seen.has(current.value)) return false;
    seen.add(current.value);
    const nested = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (const item of nested) stack.push({ value: item, depth: current.depth + 1 });
  }
  return true;
}

function valueUsesAuthority(
  field: StudioFormField,
  value: unknown,
  editableIds: ReadonlySet<string>,
): boolean {
  if (!editableIds.has(field.id)) return false;
  if (field.kind === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return true;
    const children = new Map<string, StudioFormField>(
      field.children.map((child) => [child.id, child]),
    );
    return Object.keys(value).every((id) => {
      const child = children.get(id);
      return child !== undefined && valueUsesAuthority(child, Reflect.get(value, id), editableIds);
    });
  }
  if (field.kind === "list") {
    if (!Array.isArray(value)) return true;
    const item = field.children[0];
    return (
      item !== undefined &&
      value.every((itemValue) => valueUsesAuthority(item, itemValue, editableIds))
    );
  }
  return true;
}

export function studioMutationsUseProjectedAuthority(
  mutations: ReadonlyArray<EntryValueMutation>,
  form: StudioFormProjection,
): boolean {
  const indexed = indexFields(form.fields);
  const editableIds = new Set<string>(form.editableFieldIds);
  for (const mutation of mutations) {
    let current: StudioFormField | null = null;
    let valid = true;
    for (const segment of mutation.path) {
      if (typeof segment === "number") {
        if (current?.kind !== "list" || current.children.length !== 1) {
          valid = false;
          break;
        }
        current = current.children[0] ?? null;
        if (current === null || !editableIds.has(current.id)) {
          valid = false;
          break;
        }
        continue;
      }
      const candidate = indexed.get(segment);
      if (candidate === undefined || !editableIds.has(candidate.field.id)) {
        valid = false;
        break;
      }
      if (current === null) {
        if (candidate.parent !== null) {
          valid = false;
          break;
        }
      } else if (current.kind === "object") {
        if (candidate.parent?.id !== current.id) {
          valid = false;
          break;
        }
      } else {
        valid = false;
        break;
      }
      current = candidate.field;
    }
    if (current === null || !valid) return false;
    if (
      (mutation.operation === "list_insert" || mutation.operation === "list_remove") &&
      current.kind !== "list"
    ) {
      return false;
    }
    if (
      mutation.operation === "set" &&
      (!valueIsBounded(mutation.value) || !valueUsesAuthority(current, mutation.value, editableIds))
    ) {
      return false;
    }
    if (mutation.operation === "list_insert") {
      const item = current.children[0];
      if (
        item === undefined ||
        !valueIsBounded(mutation.value) ||
        !valueUsesAuthority(item, mutation.value, editableIds)
      ) {
        return false;
      }
    }
  }
  return true;
}
