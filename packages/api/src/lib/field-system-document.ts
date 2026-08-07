// Canonicalizes and bounds complete M6 management schema documents before hashing or persistence.

import type { FieldValidationIssue } from "../contracts/field-system";
import { fieldSystemLimits } from "./field-system-profile";

export interface AggregateSchemaValidationResult {
  readonly valid: boolean;
  readonly bytes: number;
  readonly canonical: string | null;
  readonly issues: ReadonlyArray<FieldValidationIssue>;
}

const textEncoder = new TextEncoder();

/** Returns whether a value is a plain JSON object. */
function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Rejects non-JSON, cyclic, dangerous-key, or excessively deep aggregate documents iteratively. */
function preflightAggregate(value: unknown): FieldValidationIssue | null {
  const stack: Array<{
    readonly value: unknown;
    readonly depth: number;
    readonly path: string;
    readonly leaving: boolean;
  }> = [{ value, depth: 1, path: "schema", leaving: false }];
  const ancestors = new WeakSet<object>();
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.leaving) {
      if (typeof current.value === "object" && current.value !== null)
        ancestors.delete(current.value);
      continue;
    }
    nodes += 1;
    if (nodes > 50_000) {
      return {
        path: "schema",
        code: "schema_nodes_exceeded",
        message: "The schema document contains too many JSON nodes.",
      };
    }
    if (current.depth > 32) {
      return {
        path: current.path,
        code: "schema_depth_exceeded",
        message: "The schema document exceeds the aggregate structural depth limit.",
      };
    }

    const currentValue = current.value;
    if (
      currentValue === null ||
      typeof currentValue === "string" ||
      typeof currentValue === "boolean"
    ) {
      continue;
    }
    if (typeof currentValue === "number") {
      if (!Number.isFinite(currentValue)) {
        return {
          path: current.path,
          code: "schema_number_invalid",
          message: "Schema documents cannot contain non-finite numbers.",
        };
      }
      continue;
    }
    if (typeof currentValue !== "object") {
      return {
        path: current.path,
        code: "schema_value_invalid",
        message: "Schema documents must contain only JSON-compatible values.",
      };
    }
    if (ancestors.has(currentValue)) {
      return {
        path: current.path,
        code: "schema_cycle",
        message: "Schema documents cannot contain cyclic values.",
      };
    }
    ancestors.add(currentValue);
    stack.push({ ...current, leaving: true });

    if (Array.isArray(currentValue)) {
      for (let index = 0; index < currentValue.length; index += 1) {
        if (!Object.hasOwn(currentValue, index)) {
          return {
            path: `${current.path}.${index}`,
            code: "schema_sparse_array",
            message: "Schema documents cannot contain sparse arrays.",
          };
        }
        stack.push({
          value: currentValue[index],
          depth: current.depth + 1,
          path: `${current.path}.${index}`,
          leaving: false,
        });
      }
      continue;
    }
    if (!isPlainRecord(currentValue)) {
      return {
        path: current.path,
        code: "schema_object_invalid",
        message: "Schema documents must use plain objects.",
      };
    }
    for (const key of Object.keys(currentValue)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        return {
          path: `${current.path}.${key}`,
          code: "schema_key_unsafe",
          message: "The schema document contains a reserved object key.",
        };
      }
      stack.push({
        value: Reflect.get(currentValue, key),
        depth: current.depth + 1,
        path: `${current.path}.${key}`,
        leaving: false,
      });
    }
  }
  return null;
}

/** Converts preflighted JSON-compatible values into deterministic key-ordered text. */
export function canonicalizeSchemaDocument(value: unknown): string {
  if (Array.isArray(value)) {
    const items: Array<string> = [];
    for (const item of value) items.push(canonicalizeSchemaDocument(item));
    return `[${items.join(",")}]`;
  }
  if (!isPlainRecord(value)) return JSON.stringify(value) ?? "null";
  const entries: Array<string> = [];
  for (const key of Object.keys(value).sort()) {
    entries.push(`${JSON.stringify(key)}:${canonicalizeSchemaDocument(Reflect.get(value, key))}`);
  }
  return `{${entries.join(",")}}`;
}

/** Validates and measures the exact canonical management document against the 1 MiB ceiling. */
export function validateAggregateSchemaDocument(value: unknown): AggregateSchemaValidationResult {
  const preflightIssue = preflightAggregate(value);
  if (preflightIssue) {
    return { valid: false, bytes: 0, canonical: null, issues: [preflightIssue] };
  }

  const canonical = canonicalizeSchemaDocument(value);
  const bytes = textEncoder.encode(canonical).byteLength;
  if (bytes > fieldSystemLimits.aggregateSchemaBytes) {
    return {
      valid: false,
      bytes,
      canonical: null,
      issues: [
        {
          path: "schema",
          code: "schema_size_exceeded",
          message: `The complete schema document cannot exceed ${fieldSystemLimits.aggregateSchemaBytes} UTF-8 bytes.`,
        },
      ],
    };
  }
  return { valid: true, bytes, canonical, issues: [] };
}
