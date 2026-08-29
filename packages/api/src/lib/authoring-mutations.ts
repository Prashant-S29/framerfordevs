// Validates public API-key mutations and resolves them to the stable-ID entry kernel boundary.

import type { AuthoringMutationScope, AuthoringValueMutation } from "../contracts/authoring";
import { authoringLimits } from "../contracts/authoring";
import type { EntryValueMutation } from "../contracts/entries";
import type { CollectionFieldId } from "../contracts/schemas";
import { canonicalizeSchemaDocument } from "./field-system-document";

export interface AuthoringValueShapeField {
  readonly fieldId: CollectionFieldId;
  readonly apiKey: string;
  readonly editable: boolean;
  readonly shape: AuthoringValueShape;
}

export type AuthoringValueShape =
  | { readonly kind: "scalar" }
  | { readonly kind: "object"; readonly fields: ReadonlyArray<AuthoringValueShapeField> }
  | { readonly kind: "list"; readonly item: AuthoringValueShape };

export interface AuthoringMutationFieldAuthority {
  readonly apiPath: ReadonlyArray<string>;
  readonly stablePath: ReadonlyArray<CollectionFieldId>;
  readonly scope: AuthoringMutationScope;
  readonly editable: boolean;
  /** Structural containers translate nested API keys to stable IDs before entering M7. */
  readonly valueShape?: AuthoringValueShape;
}

export interface AuthoringMutationIssue {
  readonly path: string;
  readonly code:
    | "mutation_conflict"
    | "mutation_path_unknown"
    | "mutation_scope_mismatch"
    | "mutation_field_not_editable"
    | "mutation_value_invalid"
    | "mutation_value_too_deep"
    | "mutation_value_too_large";
}

export type ResolveAuthoringMutationsResult =
  | { readonly valid: true; readonly mutations: ReadonlyArray<EntryValueMutation> }
  | { readonly valid: false; readonly issues: ReadonlyArray<AuthoringMutationIssue> };

const textEncoder = new TextEncoder();

function pathKey(path: ReadonlyArray<string>): string {
  return JSON.stringify(path);
}

function displayPath(path: ReadonlyArray<string>): string {
  return path.join(".");
}

function pathsOverlap(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  const common = Math.min(left.length, right.length);
  for (let index = 0; index < common; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function valueDepth(value: unknown, depth = 0): number {
  if (value === null || typeof value !== "object") return depth;
  if (Array.isArray(value)) {
    let maximum = depth;
    for (const item of value) maximum = Math.max(maximum, valueDepth(item, depth + 1));
    return maximum;
  }
  let maximum = depth;
  for (const nested of Object.values(value)) {
    maximum = Math.max(maximum, valueDepth(nested, depth + 1));
  }
  return maximum;
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function translateValue(
  value: unknown,
  shape: AuthoringValueShape,
): { readonly valid: true; readonly value: unknown } | { readonly valid: false } {
  if (shape.kind === "scalar") return { valid: true, value };
  if (shape.kind === "list") {
    if (!Array.isArray(value)) return { valid: false };
    const translated: Array<unknown> = [];
    for (const item of value) {
      const result = translateValue(item, shape.item);
      if (!result.valid) return result;
      translated.push(result.value);
    }
    return { valid: true, value: translated };
  }
  if (!isObject(value)) return { valid: false };
  const fields = new Map(shape.fields.map((field) => [field.apiKey, field]));
  const translated: Record<string, unknown> = {};
  for (const [apiKey, nestedValue] of Object.entries(value)) {
    const field = fields.get(apiKey);
    if (!field || !field.editable) return { valid: false };
    const result = translateValue(nestedValue, field.shape);
    if (!result.valid) return result;
    translated[field.fieldId] = result.value;
  }
  return { valid: true, value: translated };
}

/**
 * Resolves public API-key paths only through an already role-projected published authority.
 * It never traverses list indexes and returns no submitted value in diagnostics.
 */
export function resolveAuthoringMutations(
  mutations: ReadonlyArray<AuthoringValueMutation>,
  fields: ReadonlyArray<AuthoringMutationFieldAuthority>,
): ResolveAuthoringMutationsResult {
  const authorities = new Map(fields.map((field) => [pathKey(field.apiPath), field]));
  const issues: Array<AuthoringMutationIssue> = [];
  const accepted: Array<EntryValueMutation> = [];

  for (let index = 0; index < mutations.length; index += 1) {
    const mutation = mutations[index];
    if (!mutation) continue;
    const mutationPath = `mutations.${index}.path`;

    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = mutations[previousIndex];
      if (
        previous &&
        previous.scope === mutation.scope &&
        pathsOverlap(previous.path, mutation.path)
      ) {
        issues.push({ path: mutationPath, code: "mutation_conflict" });
        break;
      }
    }

    const authority = authorities.get(pathKey(mutation.path));
    if (!authority) {
      issues.push({ path: mutationPath, code: "mutation_path_unknown" });
      continue;
    }
    if (authority.scope !== mutation.scope) {
      issues.push({ path: mutationPath, code: "mutation_scope_mismatch" });
      continue;
    }
    if (!authority.editable) {
      issues.push({ path: mutationPath, code: "mutation_field_not_editable" });
      continue;
    }

    if (mutation.operation === "set") {
      if (valueDepth(mutation.value) > authoringLimits.mutationValueDepth) {
        issues.push({ path: `mutations.${index}.value`, code: "mutation_value_too_deep" });
        continue;
      }
      const translated = translateValue(mutation.value, authority.valueShape ?? { kind: "scalar" });
      if (!translated.valid) {
        issues.push({ path: `mutations.${index}.value`, code: "mutation_value_invalid" });
        continue;
      }
      const canonicalValue = canonicalizeSchemaDocument(translated.value);
      if (textEncoder.encode(canonicalValue).byteLength > authoringLimits.requestBytes) {
        issues.push({ path: `mutations.${index}.value`, code: "mutation_value_too_large" });
        continue;
      }
      accepted.push({ operation: "set", path: authority.stablePath, value: translated.value });
    } else {
      accepted.push({ operation: "unset", path: authority.stablePath });
    }
  }

  if (issues.length > 0) return { valid: false, issues: issues.slice(0, 50) };
  return { valid: true, mutations: accepted };
}

export type ProjectAuthoringValueResult =
  | { readonly valid: true; readonly value: unknown }
  | { readonly valid: false };

/** Projects stable-ID container keys to API keys and omits fields outside the role projection. */
export function projectAuthoringValue(
  value: unknown,
  shape: AuthoringValueShape,
): ProjectAuthoringValueResult {
  if (shape.kind === "scalar") return { valid: true, value };
  if (shape.kind === "list") {
    if (!Array.isArray(value)) return { valid: false };
    const projected: Array<unknown> = [];
    for (const item of value) {
      const result = projectAuthoringValue(item, shape.item);
      if (!result.valid) return result;
      projected.push(result.value);
    }
    return { valid: true, value: projected };
  }
  if (!isObject(value)) return { valid: false };
  const fields = new Map(shape.fields.map((field) => [field.fieldId, field]));
  const projected: Record<string, unknown> = {};
  for (const [fieldId, nestedValue] of Object.entries(value)) {
    const field = fields.get(fieldId as CollectionFieldId);
    if (!field) continue;
    const result = projectAuthoringValue(nestedValue, field.shape);
    if (!result.valid) return result;
    projected[field.apiKey] = result.value;
  }
  return { valid: true, value: projected };
}

/** Content-safe path formatter for CLI/API diagnostics. */
export function formatAuthoringMutationPath(path: ReadonlyArray<string>): string {
  return displayPath(path);
}
