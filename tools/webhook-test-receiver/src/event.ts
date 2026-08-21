// Validates the exact content-free Framer for Devs CloudEvent before any body is persisted.

import type { VerifiedEvent } from "./types.js";

const eventTypes = new Set([
  "cms.schema.published",
  "cms.entry.published",
  "cms.entry.unpublished",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;
const systemTagPattern = /^(?:project|environment|collection|entry|locale|field):[0-9a-f-]{36}$/u;
const semanticTagPattern = /^[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31}$/u;
const localeTagPattern = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

/** Narrows unknown JSON objects without trusting arrays or null. */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects additive or missing keys so captures cannot retain unreviewed public data. */
function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** Recognizes one bounded positive event sequence. */
function isPositiveSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

/** Requires canonical ISO instants rather than implementation-dependent date strings. */
function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

/** Validates one bounded, sorted, duplicate-free string array. */
function isSortedStringArray(
  value: unknown,
  maximumItems: number,
  predicate: (entry: string) => boolean,
): value is ReadonlyArray<string> {
  if (!Array.isArray(value) || value.length > maximumItems) return false;
  let previous: string | undefined;
  for (const entry of value) {
    if (
      typeof entry !== "string" ||
      !predicate(entry) ||
      (previous !== undefined && previous >= entry)
    ) {
      return false;
    }
    previous = entry;
  }
  return true;
}

/** Validates one bounded duplicate-free array whose canonical order is sender-owned. */
function isUniqueStringArray(
  value: unknown,
  maximumItems: number,
  predicate: (entry: string) => boolean,
): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) &&
    value.length <= maximumItems &&
    value.every((entry) => typeof entry === "string" && predicate(entry)) &&
    new Set(value).size === value.length
  );
}

/** Detects control characters forbidden by the sender's route contract. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

/** Mirrors the sender's exact origin-relative route safety boundary. */
function isSafeRoute(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("*") ||
    value.includes("\\") ||
    /%(?:2e|2f|5c|3f|23)/iu.test(value) ||
    /%(?![0-9a-f]{2})/iu.test(value) ||
    hasControlCharacter(value) ||
    Buffer.byteLength(value, "utf8") > 512
  ) {
    return false;
  }
  return !value.split("/").some((segment) => segment === "." || segment === "..");
}

/** Validates the exact invalidation projection shared by every public event. */
function isInvalidation(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["systemTags", "semanticTags", "routes"]) &&
    isUniqueStringArray(value.systemTags, 1_005, (entry) => systemTagPattern.test(entry)) &&
    isUniqueStringArray(
      value.semanticTags,
      100,
      (entry) => entry.normalize("NFC") === entry && semanticTagPattern.test(entry),
    ) &&
    isUniqueStringArray(value.routes, 100, isSafeRoute)
  );
}

/** Validates the bounded changed-field identity projection. */
function isChanges(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["fieldIds"]) &&
    isSortedStringArray(value.fieldIds, 1_000, (entry) => uuidPattern.test(entry))
  );
}

/** Validates stable locale identity plus its ergonomic canonical tag. */
function isLocale(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "tag"]) &&
    typeof value.id === "string" &&
    uuidPattern.test(value.id) &&
    typeof value.tag === "string" &&
    value.tag.length <= 64 &&
    localeTagPattern.test(value.tag)
  );
}

/** Validates the immutable publication identity used by entry events. */
function isPublication(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "sequence"]) &&
    typeof value.id === "string" &&
    uuidPattern.test(value.id) &&
    isPositiveSequence(value.sequence)
  );
}

/** Validates generic aggregate identity and binds it to the concrete event resource. */
function isAggregate(value: unknown, type: "cms.collection" | "cms.entry", id: string): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["type", "id", "sequence"]) &&
    value.type === type &&
    value.id === id &&
    isPositiveSequence(value.sequence)
  );
}

/** Validates exact schema authority for collection and entry publication variants. */
function isSchema(value: unknown, includeSchemaHash: boolean): boolean {
  const keys = includeSchemaHash
    ? ["revisionId", "schemaHash", "contractHash"]
    : ["revisionId", "contractHash"];
  return (
    isRecord(value) &&
    hasExactKeys(value, keys) &&
    typeof value.revisionId === "string" &&
    uuidPattern.test(value.revisionId) &&
    typeof value.contractHash === "string" &&
    digestPattern.test(value.contractHash) &&
    (!includeSchemaHash ||
      (typeof value.schemaHash === "string" && digestPattern.test(value.schemaHash)))
  );
}

interface EventScope {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
}

/** Reads the direct scope repeated intentionally in every data variant. */
function eventScope(value: Readonly<Record<string, unknown>>): EventScope | null {
  if (
    value.version !== 1 ||
    typeof value.projectId !== "string" ||
    !uuidPattern.test(value.projectId) ||
    typeof value.environmentId !== "string" ||
    !uuidPattern.test(value.environmentId) ||
    typeof value.collectionId !== "string" ||
    !uuidPattern.test(value.collectionId)
  ) {
    return null;
  }
  return {
    projectId: value.projectId,
    environmentId: value.environmentId,
    collectionId: value.collectionId,
  };
}

/** Validates one schema-publication data variant and its repeated identity bindings. */
function isSchemaData(value: unknown): value is Readonly<Record<string, unknown>> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "projectId",
      "environmentId",
      "collectionId",
      "aggregate",
      "schema",
      "changes",
      "invalidation",
    ])
  ) {
    return false;
  }
  const scope = eventScope(value);
  return (
    scope !== null &&
    isAggregate(value.aggregate, "cms.collection", scope.collectionId) &&
    isSchema(value.schema, true) &&
    isChanges(value.changes) &&
    isInvalidation(value.invalidation)
  );
}

/** Validates one entry publish/unpublish data variant and its repeated identity bindings. */
function isEntryData(value: unknown): value is Readonly<Record<string, unknown>> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "version",
      "projectId",
      "environmentId",
      "collectionId",
      "entryId",
      "locale",
      "publication",
      "aggregate",
      "schema",
      "changes",
      "invalidation",
    ])
  ) {
    return false;
  }
  const scope = eventScope(value);
  return (
    scope !== null &&
    typeof value.entryId === "string" &&
    uuidPattern.test(value.entryId) &&
    isLocale(value.locale) &&
    isPublication(value.publication) &&
    isAggregate(value.aggregate, "cms.entry", value.entryId) &&
    isSchema(value.schema, false) &&
    isChanges(value.changes) &&
    isInvalidation(value.invalidation)
  );
}

/** Parses the exact approved CloudEvent shape and binds every repeated scope to its envelope. */
export function parseWebhookEvent(body: Uint8Array, expectedEventId: string): VerifiedEvent | null {
  let input: unknown;
  try {
    input = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    return null;
  }
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "specversion",
      "id",
      "source",
      "type",
      "subject",
      "time",
      "datacontenttype",
      "data",
    ]) ||
    input.specversion !== "1.0" ||
    input.id !== expectedEventId ||
    typeof input.source !== "string" ||
    typeof input.type !== "string" ||
    !eventTypes.has(input.type) ||
    typeof input.subject !== "string" ||
    !isIsoDateTime(input.time) ||
    input.datacontenttype !== "application/json"
  ) {
    return null;
  }

  const type = input.type;
  if (
    type !== "cms.schema.published" &&
    type !== "cms.entry.published" &&
    type !== "cms.entry.unpublished"
  ) {
    return null;
  }
  const dataValid =
    type === "cms.schema.published" ? isSchemaData(input.data) : isEntryData(input.data);
  if (!dataValid || !isRecord(input.data)) return null;
  const scope = eventScope(input.data);
  if (scope === null) return null;
  const source = `urn:framerfordevs:project:${scope.projectId}:environment:${scope.environmentId}`;
  const subject =
    type === "cms.schema.published"
      ? `cms.collection/${scope.collectionId}`
      : `cms.entry/${String(input.data.entryId)}`;
  if (input.source !== source || input.subject !== subject) return null;

  return {
    specversion: "1.0",
    id: expectedEventId,
    source,
    type,
    subject,
    time: input.time,
    datacontenttype: "application/json",
    data: input.data,
  };
}
