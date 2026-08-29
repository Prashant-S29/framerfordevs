// Classifies lock, immutable authority, locale, field, and generated-file drift by stable identity.

import { canonicalizeJson } from "../canonical";
import type {
  JsonValue,
  LockedCollection,
  NormalizedContractFieldType,
  SchemaLock,
} from "../schema";

export const driftCategories = [
  "up_to_date",
  "metadata_only",
  "locale_additive",
  "locale_breaking",
  "schema_additive",
  "schema_potentially_breaking",
  "schema_breaking",
  "collection_added",
  "collection_removed",
  "generated_file_modified",
  "authority_changed_during_pull",
] as const;
export type DriftCategory = (typeof driftCategories)[number];

export interface DriftDiagnostic {
  readonly category: Exclude<DriftCategory, "up_to_date">;
  readonly collectionId: string | null;
  readonly fieldId: string | null;
  readonly path: string;
}

export interface DriftReport {
  readonly category: DriftCategory;
  readonly diagnostics: ReadonlyArray<DriftDiagnostic>;
}

const categoryRank: Readonly<Record<DriftCategory, number>> = {
  up_to_date: 0,
  metadata_only: 1,
  locale_additive: 2,
  schema_additive: 3,
  collection_added: 4,
  schema_potentially_breaking: 5,
  locale_breaking: 6,
  schema_breaking: 7,
  collection_removed: 8,
  generated_file_modified: 9,
  authority_changed_during_pull: 10,
};

function plainJson(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(plainJson);
  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) output[key] = plainJson(Reflect.get(value, key));
    return output;
  }
  throw new Error("Drift input is not JSON.");
}

function exact(left: unknown, right: unknown): boolean {
  return canonicalizeJson(plainJson(left)) === canonicalizeJson(plainJson(right));
}

function flattenFields(
  fields: ReadonlyArray<NormalizedContractFieldType>,
): ReadonlyMap<string, NormalizedContractFieldType> {
  const output = new Map<string, NormalizedContractFieldType>();
  const visit = (field: NormalizedContractFieldType) => {
    output.set(field.id, field);
    field.children.forEach(visit);
  };
  fields.forEach(visit);
  return output;
}

function requiredPresence(field: NormalizedContractFieldType): boolean {
  const configuredDefault =
    typeof field.configuration === "object" &&
    field.configuration !== null &&
    !Array.isArray(field.configuration) &&
    Object.hasOwn(field.configuration, "default");
  return (
    field.required === true ||
    configuredDefault ||
    (field.kind === "object" && field.children.some(requiredPresence))
  );
}

function fieldChangeCategory(
  before: NormalizedContractFieldType,
  after: NormalizedContractFieldType,
): "schema_potentially_breaking" | "schema_breaking" {
  if (
    before.apiKey !== after.apiKey ||
    before.kind !== after.kind ||
    before.localization !== after.localization ||
    before.required !== after.required ||
    requiredPresence(before) !== requiredPresence(after)
  ) {
    return "schema_breaking";
  }
  return "schema_potentially_breaking";
}

function compareCollection(
  before: LockedCollection,
  after: LockedCollection,
  diagnostics: Array<DriftDiagnostic>,
): void {
  if (before.contractHash === after.contractHash) {
    if (
      before.revisionId !== after.revisionId ||
      before.revisionSequence !== after.revisionSequence
    ) {
      diagnostics.push({
        category: "metadata_only",
        collectionId: after.id,
        fieldId: null,
        path: `collections.${after.id}.revisionId`,
      });
    }
    return;
  }
  const beforeFields = flattenFields(before.contract.fields);
  const afterFields = flattenFields(after.contract.fields);
  for (const [fieldId, field] of beforeFields) {
    const current = afterFields.get(fieldId);
    if (current === undefined) {
      diagnostics.push({
        category: "schema_breaking",
        collectionId: after.id,
        fieldId,
        path: `collections.${after.id}.fields.${fieldId}`,
      });
      continue;
    }
    if (!exact(field, current)) {
      diagnostics.push({
        category: fieldChangeCategory(field, current),
        collectionId: after.id,
        fieldId,
        path: `collections.${after.id}.fields.${fieldId}`,
      });
    }
  }
  for (const [fieldId, field] of afterFields) {
    if (beforeFields.has(fieldId)) continue;
    diagnostics.push({
      category: field.required === true ? "schema_breaking" : "schema_additive",
      collectionId: after.id,
      fieldId,
      path: `collections.${after.id}.fields.${fieldId}`,
    });
  }
}

export function classifySchemaDrift(options: {
  readonly locked: SchemaLock;
  readonly current: SchemaLock;
  readonly actualFileDigests: Readonly<Record<string, string | undefined>>;
}): DriftReport {
  const diagnostics: Array<DriftDiagnostic> = [];
  if (
    options.locked.projectId !== options.current.projectId ||
    options.locked.environmentId !== options.current.environmentId ||
    options.locked.environmentKey !== options.current.environmentKey ||
    options.locked.toolingApi !== options.current.toolingApi
  ) {
    diagnostics.push({
      category: "authority_changed_during_pull",
      collectionId: null,
      fieldId: null,
      path: "authority",
    });
  }

  const expectedFiles = new Map(options.locked.files.map((file) => [file.path, file.sha256]));
  for (const [path, digest] of expectedFiles) {
    if (options.actualFileDigests[path] !== digest) {
      diagnostics.push({
        category: "generated_file_modified",
        collectionId: null,
        fieldId: null,
        path,
      });
    }
  }

  const beforeLocales = new Map(options.locked.locales.map((locale) => [locale.id, locale.tag]));
  const afterLocales = new Map(options.current.locales.map((locale) => [locale.id, locale.tag]));
  for (const [id, tag] of beforeLocales) {
    if (afterLocales.get(id) !== tag) {
      diagnostics.push({
        category: "locale_breaking",
        collectionId: null,
        fieldId: null,
        path: `locales.${id}`,
      });
    }
  }
  for (const id of afterLocales.keys()) {
    if (!beforeLocales.has(id)) {
      diagnostics.push({
        category: "locale_additive",
        collectionId: null,
        fieldId: null,
        path: `locales.${id}`,
      });
    }
  }

  const beforeCollections = new Map(
    options.locked.collections.map((collection) => [collection.id, collection]),
  );
  const afterCollections = new Map(
    options.current.collections.map((collection) => [collection.id, collection]),
  );
  for (const [id, collection] of beforeCollections) {
    const current = afterCollections.get(id);
    if (current === undefined) {
      diagnostics.push({
        category: "collection_removed",
        collectionId: id,
        fieldId: null,
        path: `collections.${id}`,
      });
      continue;
    }
    compareCollection(collection, current, diagnostics);
  }
  for (const id of afterCollections.keys()) {
    if (!beforeCollections.has(id)) {
      diagnostics.push({
        category: "collection_added",
        collectionId: id,
        fieldId: null,
        path: `collections.${id}`,
      });
    }
  }

  const ordered = diagnostics.sort(
    (left, right) =>
      categoryRank[right.category] - categoryRank[left.category] ||
      left.path.localeCompare(right.path),
  );
  return {
    category: ordered[0]?.category ?? "up_to_date",
    diagnostics: ordered,
  };
}
