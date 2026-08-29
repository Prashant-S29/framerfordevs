// Verifies Standard Webhooks-compatible signatures over exact raw bytes before bounded event decoding.

import { createHmac, timingSafeEqual } from "node:crypto";

import type { JsonObject, JsonValue } from "../client";

const signaturePattern = /^v1,([A-Za-z0-9+/]+={0,2})$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const eventTypes = new Set([
  "cms.schema.published",
  "cms.entry.published",
  "cms.entry.unpublished",
]);
const reservedSemanticNamespaces = new Set([
  "project",
  "environment",
  "collection",
  "entry",
  "locale",
  "field",
]);
const maximumSignatures = 2;
const maximumEventBytes = 128 * 1_024;
const defaultToleranceSeconds = 5 * 60;

export interface VerifiedPublicationWebhookEvent {
  readonly specversion: "1.0";
  readonly id: string;
  readonly source: string;
  readonly subject: string;
  readonly type: "cms.schema.published" | "cms.entry.published" | "cms.entry.unpublished";
  readonly time: string;
  readonly datacontenttype: "application/json";
  readonly data: JsonObject & {
    readonly projectId: string;
    readonly environmentId: string;
    readonly collectionId: string;
    readonly invalidation: {
      readonly systemTags: ReadonlyArray<string>;
      readonly semanticTags: ReadonlyArray<string>;
      readonly routes: ReadonlyArray<string>;
    };
  };
}

export type WebhookVerificationFailureCategory =
  | "malformed_headers"
  | "stale_timestamp"
  | "invalid_signature"
  | "invalid_payload"
  | "duplicate_event";

export type WebhookVerificationResult =
  | { readonly ok: true; readonly event: VerifiedPublicationWebhookEvent }
  | { readonly ok: false; readonly category: WebhookVerificationFailureCategory };

export interface VerifyWebhookInput {
  readonly webhookId: string;
  readonly webhookTimestamp: string;
  readonly webhookSignature: string;
  readonly body: Uint8Array;
  readonly secrets: ReadonlyArray<string>;
  readonly nowEpochSeconds: number;
  readonly toleranceSeconds?: number;
  readonly reserveEventId: (eventId: string) => boolean | Promise<boolean>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonValue(value: unknown, depth = 0): JsonValue {
  if (depth > 24) throw new Error("Webhook JSON depth exceeded.");
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, depth + 1));
  if (isRecord(value)) {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) output[key] = jsonValue(item, depth + 1);
    return output;
  }
  throw new Error("Webhook payload is not JSON.");
}

function stringArray(
  value: unknown,
  maximum: number,
  valid: (value: string) => boolean,
): ReadonlyArray<string> | null {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    !value.every((item) => typeof item === "string" && valid(item)) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return value;
}

function isEventType(value: string): value is VerifiedPublicationWebhookEvent["type"] {
  return eventTypes.has(value);
}

function safeRoute(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("?") &&
    !value.includes("#") &&
    !value.includes("*") &&
    !value.includes("\\") &&
    !/%(?:2e|2f|5c|3f|23)/iu.test(value) &&
    !value.split("/").some((segment) => segment === "." || segment === "..") &&
    Buffer.byteLength(value, "utf8") <= 512
  );
}

function exactKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function positiveInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validChanges(value: unknown): boolean {
  if (!isRecord(value) || !exactKeys(value, ["fieldIds"])) return false;
  const fields = value.fieldIds;
  return (
    Array.isArray(fields) &&
    fields.length <= 1_000 &&
    fields.every((field) => typeof field === "string" && uuidPattern.test(field)) &&
    fields.every((field, index) => index === 0 || String(fields[index - 1]) < field)
  );
}

function validAggregate(value: unknown, type: "cms.collection" | "cms.entry", id: string): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ["type", "id", "sequence"]) &&
    value.type === type &&
    value.id === id &&
    positiveInteger(value.sequence)
  );
}

function validSchema(value: unknown, includeSchemaHash: boolean): boolean {
  if (!isRecord(value)) return false;
  const keys = includeSchemaHash
    ? ["revisionId", "schemaHash", "contractHash"]
    : ["revisionId", "contractHash"];
  return (
    exactKeys(value, keys) &&
    typeof value.revisionId === "string" &&
    uuidPattern.test(value.revisionId) &&
    typeof value.contractHash === "string" &&
    /^[0-9a-f]{64}$/u.test(value.contractHash) &&
    (!includeSchemaHash ||
      (typeof value.schemaHash === "string" && /^[0-9a-f]{64}$/u.test(value.schemaHash)))
  );
}

function validSchemaData(data: Record<string, unknown>): boolean {
  return (
    exactKeys(data, [
      "version",
      "projectId",
      "environmentId",
      "collectionId",
      "aggregate",
      "schema",
      "changes",
      "invalidation",
    ]) &&
    data.version === 1 &&
    typeof data.collectionId === "string" &&
    validAggregate(data.aggregate, "cms.collection", data.collectionId) &&
    validSchema(data.schema, true) &&
    validChanges(data.changes)
  );
}

function validEntryData(data: Record<string, unknown>): boolean {
  if (
    !exactKeys(data, [
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
    ]) ||
    data.version !== 1 ||
    typeof data.entryId !== "string" ||
    !uuidPattern.test(data.entryId) ||
    !validAggregate(data.aggregate, "cms.entry", data.entryId) ||
    !validSchema(data.schema, false) ||
    !validChanges(data.changes) ||
    !isRecord(data.locale) ||
    !exactKeys(data.locale, ["id", "tag"]) ||
    typeof data.locale.id !== "string" ||
    !uuidPattern.test(data.locale.id) ||
    typeof data.locale.tag !== "string" ||
    !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u.test(data.locale.tag) ||
    !isRecord(data.publication) ||
    !exactKeys(data.publication, ["id", "sequence"]) ||
    typeof data.publication.id !== "string" ||
    !uuidPattern.test(data.publication.id) ||
    !positiveInteger(data.publication.sequence)
  ) {
    return false;
  }
  return true;
}

function decodeEvent(value: unknown): VerifiedPublicationWebhookEvent | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "specversion",
      "id",
      "source",
      "subject",
      "type",
      "time",
      "datacontenttype",
      "data",
    ]) ||
    value.specversion !== "1.0" ||
    typeof value.id !== "string" ||
    !uuidPattern.test(value.id) ||
    typeof value.source !== "string" ||
    typeof value.subject !== "string" ||
    typeof value.type !== "string" ||
    !isEventType(value.type) ||
    typeof value.time !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.time) ||
    value.datacontenttype !== "application/json" ||
    !isRecord(value.data)
  ) {
    return null;
  }
  const data = value.data;
  const invalidation = data.invalidation;
  if (
    typeof data.projectId !== "string" ||
    !uuidPattern.test(data.projectId) ||
    typeof data.environmentId !== "string" ||
    !uuidPattern.test(data.environmentId) ||
    typeof data.collectionId !== "string" ||
    !uuidPattern.test(data.collectionId) ||
    !isRecord(invalidation)
  ) {
    return null;
  }
  const systemTags = stringArray(invalidation.systemTags, 1_005, (tag) =>
    /^(?:project|environment|collection|entry|locale|field):[0-9a-f-]{36}$/u.test(tag),
  );
  const semanticTags = stringArray(
    invalidation.semanticTags,
    100,
    (tag) =>
      /^[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31}$/u.test(tag) &&
      !reservedSemanticNamespaces.has(tag.split(":", 1)[0] ?? ""),
  );
  const routes = stringArray(invalidation.routes, 100, safeRoute);
  if (systemTags === null || semanticTags === null || routes === null) return null;
  if (
    (value.type === "cms.schema.published" && !validSchemaData(data)) ||
    (value.type !== "cms.schema.published" && !validEntryData(data))
  ) {
    return null;
  }
  const source = `urn:framerfordevs:project:${data.projectId}:environment:${data.environmentId}`;
  const entryId = data.entryId;
  const subject =
    value.type === "cms.schema.published"
      ? `cms.collection/${data.collectionId}`
      : typeof entryId === "string" && uuidPattern.test(entryId)
        ? `cms.entry/${entryId}`
        : null;
  if (value.source !== source || subject === null || value.subject !== subject) return null;
  const decodedData = jsonValue(data);
  if (!isRecord(decodedData)) return null;
  return {
    specversion: "1.0",
    id: value.id,
    source: value.source,
    subject: value.subject,
    type: value.type,
    time: value.time,
    datacontenttype: "application/json",
    data: {
      ...decodedData,
      projectId: data.projectId,
      environmentId: data.environmentId,
      collectionId: data.collectionId,
      invalidation: { systemTags, semanticTags, routes },
    },
  };
}

function signingKey(secret: string): Buffer {
  if (!/^whsec_[A-Za-z0-9_-]{43}$/u.test(secret)) {
    throw new Error("Webhook signing secret is malformed.");
  }
  const encoded = secret.slice(6);
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encoded) {
    throw new Error("Webhook signing secret encoding is malformed.");
  }
  return key;
}

function signedBytes(eventId: string, timestamp: number, body: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from(`${eventId}.${timestamp}.`, "utf8"),
    Buffer.from(body.buffer, body.byteOffset, body.byteLength),
  ]);
}

export function signWebhookRequest(
  secret: string,
  eventId: string,
  timestamp: number,
  body: Uint8Array,
): string {
  return `v1,${createHmac("sha256", signingKey(secret))
    .update(signedBytes(eventId, timestamp, body))
    .digest("base64")}`;
}

function signatureMatches(expected: string, received: string): boolean {
  try {
    const left = Buffer.from(expected, "base64");
    const right = Buffer.from(received, "base64");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function parseSignatures(value: string): ReadonlyArray<string> | null {
  const entries = value.split(" ").filter(Boolean);
  if (entries.length < 1 || entries.length > maximumSignatures) return null;
  const signatures: Array<string> = [];
  for (const entry of entries) {
    const match = signaturePattern.exec(entry);
    const signature = match?.[1];
    if (signature === undefined) return null;
    const decoded = Buffer.from(signature, "base64");
    if (decoded.length !== 32 || decoded.toString("base64") !== signature) return null;
    signatures.push(signature);
  }
  return signatures;
}

export async function verifyWebhookRequest(
  input: VerifyWebhookInput,
): Promise<WebhookVerificationResult> {
  if (
    !uuidPattern.test(input.webhookId) ||
    !/^\d{1,12}$/u.test(input.webhookTimestamp) ||
    input.body.byteLength > maximumEventBytes ||
    input.secrets.length < 1 ||
    input.secrets.length > maximumSignatures
  ) {
    return { ok: false, category: "malformed_headers" };
  }
  const signatures = parseSignatures(input.webhookSignature);
  if (signatures === null) return { ok: false, category: "malformed_headers" };
  const timestamp = Number(input.webhookTimestamp);
  const tolerance = input.toleranceSeconds ?? defaultToleranceSeconds;
  if (
    !Number.isSafeInteger(timestamp) ||
    !Number.isSafeInteger(input.nowEpochSeconds) ||
    !Number.isSafeInteger(tolerance) ||
    tolerance < 0 ||
    Math.abs(input.nowEpochSeconds - timestamp) > tolerance
  ) {
    return { ok: false, category: "stale_timestamp" };
  }
  const message = signedBytes(input.webhookId, timestamp, input.body);
  let accepted = false;
  try {
    for (const secret of input.secrets) {
      const expected = createHmac("sha256", signingKey(secret)).update(message).digest("base64");
      for (const received of signatures) {
        accepted = signatureMatches(expected, received) || accepted;
      }
    }
  } catch {
    return { ok: false, category: "malformed_headers" };
  }
  if (!accepted) return { ok: false, category: "invalid_signature" };
  let event: VerifiedPublicationWebhookEvent | null = null;
  try {
    event = decodeEvent(JSON.parse(Buffer.from(input.body).toString("utf8")));
  } catch {
    return { ok: false, category: "invalid_payload" };
  }
  if (event === null || event.id !== input.webhookId) {
    return { ok: false, category: "invalid_payload" };
  }
  if (!(await input.reserveEventId(event.id))) {
    return { ok: false, category: "duplicate_event" };
  }
  return { ok: true, event };
}
