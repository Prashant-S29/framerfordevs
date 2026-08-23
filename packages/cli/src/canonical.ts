import { createHash } from "node:crypto";

import type { JsonValue } from "./schema";

function isJsonArray(value: JsonValue): value is ReadonlyArray<JsonValue> {
  return Array.isArray(value);
}

export function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) output[key] = toJsonValue(Reflect.get(value, key));
    return output;
  }
  throw new Error("Value is not bounded JSON.");
}

export function canonicalizeJson(value: JsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON does not support non-finite numbers.");
    return JSON.stringify(value);
  }
  if (isJsonArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      const item = value[key];
      if (item === undefined) throw new Error("Canonical JSON does not support undefined values.");
      return `${JSON.stringify(key)}:${canonicalizeJson(item)}`;
    })
    .join(",")}}`;
}

export function canonicalJsonBytes(value: JsonValue): string {
  const parsed: JsonValue = JSON.parse(canonicalizeJson(value));
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
