// Applies bounded stable-field entry mutations and merges disjoint shared/localized fragments without Effect or server dependencies.

import type { EntryValueMutation, EntryValuePath, EntryValues } from "../contracts/entries";

export const entryValueLimits = {
  documentBytes: 1_048_576,
  documentDepth: 20,
  documentNodes: 20_000,
  mutations: 500,
} as const;

export interface EntryValueKernelIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface EntryMutationResult {
  readonly valid: boolean;
  readonly values: EntryValues;
  readonly changed: boolean;
  readonly changedFieldIds: ReadonlyArray<string>;
  readonly issues: ReadonlyArray<EntryValueKernelIssue>;
}

export interface EntryMergeResult {
  readonly valid: boolean;
  readonly values: Readonly<Record<string, unknown>>;
  readonly issues: ReadonlyArray<EntryValueKernelIssue>;
}

/** Narrows JSON object containers while excluding arrays and class instances. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Renders one stable mutation path without exposing values. */
function renderPath(path: EntryValuePath): string {
  let rendered = "values";
  for (const segment of path) {
    rendered += typeof segment === "number" ? `[${segment}]` : `.${segment}`;
  }
  return rendered;
}

/** Produces deterministic JSON for value hashes and no-op comparison. */
export function canonicalizeEntryValue(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeEntryValue).join(",")}]`;
  }
  if (!isPlainRecord(value)) return "null";
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalizeEntryValue(Reflect.get(value, key))}`);
  return `{${entries.join(",")}}`;
}

/** Rejects cyclic, non-JSON, excessively deep, large, or complex draft documents. */
export function validateEntryDocument(value: unknown): ReadonlyArray<EntryValueKernelIssue> {
  const issues: Array<EntryValueKernelIssue> = [];
  const seen = new WeakSet<object>();
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 1 }];
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > entryValueLimits.documentNodes) {
      issues.push({
        path: "values",
        code: "entry_value_nodes_exceeded",
        message: `Draft values cannot exceed ${entryValueLimits.documentNodes} JSON nodes.`,
      });
      break;
    }
    if (current.depth > entryValueLimits.documentDepth) {
      issues.push({
        path: "values",
        code: "entry_value_depth_exceeded",
        message: `Draft values cannot exceed ${entryValueLimits.documentDepth} JSON levels.`,
      });
      break;
    }
    const item = current.value;
    if (
      item === null ||
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      continue;
    }
    if (typeof item !== "object") {
      issues.push({
        path: "values",
        code: "entry_value_not_json",
        message: "Draft values must contain only JSON-compatible data.",
      });
      break;
    }
    if (seen.has(item)) {
      issues.push({
        path: "values",
        code: "entry_value_cycle",
        message: "Draft values cannot contain cyclic references.",
      });
      break;
    }
    seen.add(item);
    if (Array.isArray(item)) {
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index], depth: current.depth + 1 });
      }
      continue;
    }
    if (!isPlainRecord(item)) {
      issues.push({
        path: "values",
        code: "entry_value_not_plain_json",
        message: "Draft objects must use plain JSON object containers.",
      });
      break;
    }
    const keys = Object.keys(item);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key !== undefined) {
        stack.push({ value: Reflect.get(item, key), depth: current.depth + 1 });
      }
    }
  }

  if (issues.length === 0) {
    const bytes = new TextEncoder().encode(canonicalizeEntryValue(value)).byteLength;
    if (bytes > entryValueLimits.documentBytes) {
      issues.push({
        path: "values",
        code: "entry_value_bytes_exceeded",
        message: `One draft partition cannot exceed ${entryValueLimits.documentBytes} bytes.`,
      });
    }
  }
  return issues;
}

/** Resolves a complete stable path against an existing document. */
function resolvePath(document: Record<string, unknown>, path: EntryValuePath): unknown {
  let current: unknown = document;
  for (const segment of path) {
    if (typeof segment === "string") {
      if (!isPlainRecord(current)) return undefined;
      current = Reflect.get(current, segment);
      continue;
    }
    if (!Array.isArray(current) || segment >= current.length) return undefined;
    current = current[segment];
  }
  return current;
}

/** Resolves the parent container for a set/unset mutation without inventing list structure. */
function resolveParent(
  document: Record<string, unknown>,
  path: EntryValuePath,
): {
  readonly parent: Record<string, unknown> | Array<unknown>;
  readonly leaf: string | number;
} | null {
  const leaf = path[path.length - 1];
  if (leaf === undefined) return null;
  let current: unknown = document;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const next = path[index + 1];
    if (typeof segment === "string") {
      if (!isPlainRecord(current)) return null;
      let child = Reflect.get(current, segment);
      if (child === undefined && typeof next === "string") {
        child = {};
        Reflect.set(current, segment, child);
      }
      current = child;
      continue;
    }
    if (!Array.isArray(current) || segment === undefined || segment >= current.length) return null;
    current = current[segment];
  }
  return isPlainRecord(current) || Array.isArray(current) ? { parent: current, leaf } : null;
}

/** Applies one decoded mutation and reports only path-safe feedback. */
function applyMutation(
  document: Record<string, unknown>,
  mutation: EntryValueMutation,
): EntryValueKernelIssue | null {
  const path = renderPath(mutation.path);
  if (mutation.operation === "list_insert" || mutation.operation === "list_remove") {
    const list = resolvePath(document, mutation.path);
    if (!Array.isArray(list)) {
      return { path, code: "entry_list_path_invalid", message: "The mutation path is not a list." };
    }
    if (mutation.operation === "list_insert") {
      if (mutation.index > list.length || list.length >= 100) {
        return {
          path,
          code: "entry_list_index_invalid",
          message: "The list insertion index is outside the bounded list.",
        };
      }
      list.splice(mutation.index, 0, structuredClone(mutation.value));
      return null;
    }
    if (mutation.index >= list.length) {
      return {
        path,
        code: "entry_list_index_invalid",
        message: "The list removal index does not exist.",
      };
    }
    list.splice(mutation.index, 1);
    return null;
  }

  const resolved = resolveParent(document, mutation.path);
  if (!resolved) {
    return {
      path,
      code: "entry_value_path_invalid",
      message: "The mutation path does not resolve to an editable value.",
    };
  }
  if (typeof resolved.leaf === "number") {
    if (!Array.isArray(resolved.parent) || resolved.leaf >= resolved.parent.length) {
      return {
        path,
        code: "entry_list_index_invalid",
        message: "The list item index does not exist.",
      };
    }
    if (mutation.operation === "unset") {
      return {
        path,
        code: "entry_list_operation_required",
        message: "Use an explicit list removal operation for list items.",
      };
    }
    resolved.parent[resolved.leaf] = structuredClone(mutation.value);
    return null;
  }
  if (!isPlainRecord(resolved.parent)) {
    return {
      path,
      code: "entry_value_path_invalid",
      message: "The mutation path does not resolve to an object field.",
    };
  }
  if (mutation.operation === "unset") {
    Reflect.deleteProperty(resolved.parent, resolved.leaf);
  } else {
    Reflect.set(resolved.parent, resolved.leaf, structuredClone(mutation.value));
  }
  return null;
}

/** Applies one bounded command atomically and derives deterministic changed root field IDs. */
export function applyEntryMutations(
  currentValues: EntryValues,
  mutations: ReadonlyArray<EntryValueMutation>,
): EntryMutationResult {
  if (mutations.length > entryValueLimits.mutations) {
    return {
      valid: false,
      values: currentValues,
      changed: false,
      changedFieldIds: [],
      issues: [
        {
          path: "mutations",
          code: "entry_mutations_exceeded",
          message: `One command cannot exceed ${entryValueLimits.mutations} mutations.`,
        },
      ],
    };
  }
  const inputIssues = validateEntryDocument(currentValues);
  if (inputIssues.length > 0) {
    return {
      valid: false,
      values: currentValues,
      changed: false,
      changedFieldIds: [],
      issues: inputIssues,
    };
  }
  const nextValues = structuredClone(currentValues);
  const changedFieldIds = new Set<string>();
  const issues: Array<EntryValueKernelIssue> = [];
  for (const mutation of mutations) {
    const valueIssues =
      mutation.operation === "set" || mutation.operation === "list_insert"
        ? validateEntryDocument(mutation.value)
        : [];
    if (valueIssues.length > 0) {
      issues.push(...valueIssues.map((issue) => ({ ...issue, path: renderPath(mutation.path) })));
      break;
    }
    const issue = applyMutation(nextValues, mutation);
    if (issue) {
      issues.push(issue);
      break;
    }
    const rootFieldId = mutation.path[0];
    if (typeof rootFieldId === "string") changedFieldIds.add(rootFieldId);
  }
  if (issues.length > 0) {
    return {
      valid: false,
      values: currentValues,
      changed: false,
      changedFieldIds: [],
      issues: issues.slice(0, 50),
    };
  }
  const outputIssues = validateEntryDocument(nextValues);
  if (outputIssues.length > 0) {
    return {
      valid: false,
      values: currentValues,
      changed: false,
      changedFieldIds: [],
      issues: outputIssues,
    };
  }
  const changed = canonicalizeEntryValue(currentValues) !== canonicalizeEntryValue(nextValues);
  return {
    valid: true,
    values: nextValues,
    changed,
    changedFieldIds: changed ? [...changedFieldIds].sort() : [],
    issues: [],
  };
}

/** Deep-merges disjoint sparse object fragments while rejecting terminal ownership collisions. */
export function mergeEntryFragments(
  sharedValues: Readonly<Record<string, unknown>>,
  localizedValues: Readonly<Record<string, unknown>>,
): EntryMergeResult {
  const issues = [
    ...validateEntryDocument(sharedValues),
    ...validateEntryDocument(localizedValues),
  ];
  if (issues.length > 0) return { valid: false, values: {}, issues: issues.slice(0, 50) };

  const mergeRecords = (
    shared: Readonly<Record<string, unknown>>,
    localized: Readonly<Record<string, unknown>>,
    path: string,
  ): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(shared), ...Object.keys(localized)]);
    for (const key of [...keys].sort()) {
      const sharedHas = Object.hasOwn(shared, key);
      const localizedHas = Object.hasOwn(localized, key);
      const sharedValue = Reflect.get(shared, key);
      const localizedValue = Reflect.get(localized, key);
      if (!sharedHas) {
        Reflect.set(merged, key, structuredClone(localizedValue));
      } else if (!localizedHas) {
        Reflect.set(merged, key, structuredClone(sharedValue));
      } else if (isPlainRecord(sharedValue) && isPlainRecord(localizedValue)) {
        Reflect.set(merged, key, mergeRecords(sharedValue, localizedValue, `${path}.${key}`));
      } else {
        issues.push({
          path: `${path}.${key}`,
          code: "entry_fragment_collision",
          message: "Shared and localized fragments cannot own the same terminal path.",
        });
      }
    }
    return merged;
  };

  const values = mergeRecords(sharedValues, localizedValues, "values");
  return { valid: issues.length === 0, values: issues.length === 0 ? values : {}, issues };
}
