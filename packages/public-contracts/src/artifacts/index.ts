// Canonicalizes and validates only registry-declared public artifacts before hashing or publication.

import { createHash } from "node:crypto";

import {
  publicContractRegistry,
  publicContractRegistryKeys,
  type PublicArtifactKind,
  type PublicContractRegistryKey,
} from "../registry";

export interface GeneratedPublicArtifact {
  readonly key: PublicContractRegistryKey;
  readonly kind: PublicArtifactKind;
  readonly outputPath: string;
  readonly baselinePath: string;
  readonly digest: string;
  readonly bytes: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertJsonValue(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite numbers are forbidden`);
    return;
  }
  if (typeof value !== "object") throw new Error(`${path}: unsupported JSON value`);
  if (seen.has(value)) throw new Error(`${path}: cyclic values are forbidden`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}/${index}`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}/${key}`, seen);
    }
  }
  seen.delete(value);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

function resolveJsonPointer(document: unknown, reference: string): unknown {
  if (!reference.startsWith("#/")) return undefined;
  let current = document;
  for (const encodedPart of reference.slice(2).split("/")) {
    const part = encodedPart.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = Reflect.get(current, part);
    if (current === undefined) return undefined;
  }
  return current;
}

function validateReferences(document: unknown, value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateReferences(document, item, `${path}/${index}`));
    return;
  }
  if (!isRecord(value)) return;
  const reference = value.$ref;
  if (typeof reference === "string") {
    if (!reference.startsWith("#/") || resolveJsonPointer(document, reference) === undefined) {
      throw new Error(`${path}/$ref: unresolved or external reference ${reference}`);
    }
  }
  for (const [key, item] of Object.entries(value)) {
    validateReferences(document, item, `${path}/${key}`);
  }
}

function validateOperationIds(document: Readonly<Record<string, unknown>>): void {
  const paths = document.paths;
  if (!isRecord(paths)) throw new Error("OpenAPI artifact requires paths");
  const operationIds = new Set<string>();
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) throw new Error(`paths/${path}: path item must be an object`);
    for (const method of ["get", "head", "post", "put", "patch", "delete", "options"]) {
      const operation = pathItem[method];
      if (operation === undefined) continue;
      if (!isRecord(operation)) {
        throw new Error(`paths/${path}/${method}: operation must be an object`);
      }
      if (operation.operationId === undefined) continue;
      if (typeof operation.operationId !== "string" || operation.operationId.length === 0) {
        throw new Error(`paths/${path}/${method}: operationId must be a non-empty string`);
      }
      if (operationIds.has(operation.operationId)) {
        throw new Error(`duplicate operationId ${operation.operationId}`);
      }
      operationIds.add(operation.operationId);
    }
  }
}

function validateKind(kind: PublicArtifactKind, document: unknown): void {
  if (!isRecord(document)) throw new Error("Public artifact root must be an object");
  if (kind === "openapi") {
    if (document.openapi !== "3.1.0") throw new Error("OpenAPI artifacts must target 3.1.0");
    validateOperationIds(document);
    return;
  }
  if (document.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error("JSON Schema artifacts must target draft 2020-12");
  }
}

const forbiddenPublicSurface = [
  /(?:^|["/])rpc(?:["/]|$)/iu,
  /platform\.workspaces/iu,
  /better[ -]?auth/iu,
  /credential-management/iu,
  /(?:^|["/])metrics(?:["/]|$)/iu,
  /(?:^|["/])ready(?:["/]|$)/iu,
] as const;

function validateForbiddenSurface(bytes: string): void {
  for (const pattern of forbiddenPublicSurface) {
    if (pattern.test(bytes))
      throw new Error(`Forbidden internal surface matched ${pattern.source}`);
  }
}

function digest(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** Validates and serializes one explicit source without filesystem discovery. */
export function canonicalizePublicArtifact(kind: PublicArtifactKind, source: unknown): string {
  assertJsonValue(source, kind, new Set());
  validateKind(kind, source);
  validateReferences(source, source, kind);
  const bytes = `${JSON.stringify(canonicalValue(source), null, 2)}\n`;
  validateForbiddenSurface(bytes);
  return bytes;
}

/** Produces byte-stable artifacts without scanning source or output directories. */
export function generatePublicArtifacts(): ReadonlyArray<GeneratedPublicArtifact> {
  return publicContractRegistryKeys.map((key) => {
    const entry = publicContractRegistry[key];
    const bytes = canonicalizePublicArtifact(entry.kind, entry.source());
    return {
      key,
      kind: entry.kind,
      outputPath: entry.outputPath,
      baselinePath: entry.baselinePath,
      digest: digest(bytes),
      bytes,
    };
  });
}
