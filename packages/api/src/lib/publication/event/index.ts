// Projects strict versioned outbox authority into one immutable, content-free CloudEvents body.

import { createHash } from "node:crypto";

import { Schema } from "effect";

import { PublicationWebhookEvent, type WebhookPublicEventType } from "../../../contracts/webhook";
import { canonicalizeEntryValue } from "../../entry/values";

const maximumEventBytes = 128 * 1_024;
const digestPattern = /^[0-9a-f]{64}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface OutboxPayloadBase {
  readonly version: number;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly changedFieldIds: ReadonlyArray<string>;
  readonly invalidationTags: ReadonlyArray<string>;
  readonly semanticTags?: ReadonlyArray<string>;
  readonly routes?: ReadonlyArray<string>;
}

interface SchemaPublishedOutboxPayload extends OutboxPayloadBase {
  readonly sequence: number;
  readonly schemaHash: string;
}

interface EntryPublishedOutboxPayload extends OutboxPayloadBase {
  readonly entryId: string;
  readonly localeId: string;
  readonly locale: string;
  readonly publicationId: string;
  readonly publicationSequence: number;
  readonly eventSequence: number;
}

export interface PublicationOutboxRecord {
  readonly id: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly eventType: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly schemaRevisionId: string | null;
  readonly localeId: string | null;
  readonly entryPublicationId: string | null;
  readonly aggregateSequence: number;
  readonly payload: unknown;
  readonly occurredAt: Date | string;
}

export interface ProjectedPublicationEvent {
  readonly event: PublicationWebhookEvent;
  readonly canonicalBody: string;
  readonly bodyHash: string;
  readonly bodyBytes: number;
}

export type PublicationEventProjectionResult =
  | { readonly ok: true; readonly value: ProjectedPublicationEvent }
  | { readonly ok: false; readonly category: PublicationEventProjectionFailureCategory };

export type PublicationEventProjectionFailureCategory =
  | "unsupported_type"
  | "invalid_outbox_authority"
  | "invalid_payload"
  | "event_too_large";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && digestPattern.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function stringArray(value: unknown): ReadonlyArray<string> | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function uniqueSorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function readBasePayload(value: unknown): OutboxPayloadBase | null {
  if (!isRecord(value)) return null;
  const changedFieldIds = stringArray(value.changedFieldIds);
  const invalidationTags = stringArray(value.invalidationTags);
  const semanticTags = value.semanticTags === undefined ? [] : stringArray(value.semanticTags);
  const routes = value.routes === undefined ? [] : stringArray(value.routes);
  if (
    value.version !== 1 ||
    !isUuid(value.projectId) ||
    !isUuid(value.environmentId) ||
    !isUuid(value.collectionId) ||
    !isUuid(value.schemaRevisionId) ||
    !isDigest(value.contractHash) ||
    changedFieldIds === null ||
    invalidationTags === null ||
    semanticTags === null ||
    routes === null
  ) {
    return null;
  }
  return {
    version: 1,
    projectId: value.projectId,
    environmentId: value.environmentId,
    collectionId: value.collectionId,
    schemaRevisionId: value.schemaRevisionId,
    contractHash: value.contractHash,
    changedFieldIds: uniqueSorted(changedFieldIds),
    invalidationTags: uniqueSorted(invalidationTags),
    semanticTags: uniqueSorted(semanticTags),
    routes: uniqueSorted(routes),
  };
}

function readSchemaPayload(value: unknown): SchemaPublishedOutboxPayload | null {
  const base = readBasePayload(value);
  if (
    !base ||
    !isRecord(value) ||
    !isPositiveInteger(value.sequence) ||
    !isDigest(value.schemaHash)
  ) {
    return null;
  }
  return { ...base, sequence: value.sequence, schemaHash: value.schemaHash };
}

function readEntryPayload(value: unknown): EntryPublishedOutboxPayload | null {
  const base = readBasePayload(value);
  if (
    !base ||
    !isRecord(value) ||
    !isUuid(value.entryId) ||
    !isUuid(value.localeId) ||
    typeof value.locale !== "string" ||
    !isUuid(value.publicationId) ||
    !isPositiveInteger(value.publicationSequence) ||
    !isPositiveInteger(value.eventSequence)
  ) {
    return null;
  }
  return {
    ...base,
    entryId: value.entryId,
    localeId: value.localeId,
    locale: value.locale,
    publicationId: value.publicationId,
    publicationSequence: value.publicationSequence,
    eventSequence: value.eventSequence,
  };
}

function occurredAtIso(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function matchesBaseAuthority(
  record: PublicationOutboxRecord,
  payload: OutboxPayloadBase,
): boolean {
  return (
    record.projectId === payload.projectId &&
    record.environmentId === payload.environmentId &&
    record.schemaRevisionId === payload.schemaRevisionId &&
    record.subjectId ===
      (record.eventType === "cms.schema.published" ? payload.collectionId : record.subjectId)
  );
}

function invalidation(payload: OutboxPayloadBase) {
  return {
    systemTags: uniqueSorted(payload.invalidationTags),
    semanticTags: uniqueSorted(payload.semanticTags ?? []),
    routes: uniqueSorted(payload.routes ?? []),
  };
}

function decodeAndCanonicalize(value: unknown): PublicationEventProjectionResult {
  try {
    const event = Schema.decodeUnknownSync(PublicationWebhookEvent)(value);
    const transport = Schema.encodeSync(PublicationWebhookEvent)(event);
    const canonicalBody = canonicalizeEntryValue(transport);
    const bodyBytes = Buffer.byteLength(canonicalBody, "utf8");
    if (bodyBytes > maximumEventBytes) return { ok: false, category: "event_too_large" };
    return {
      ok: true,
      value: {
        event,
        canonicalBody,
        bodyHash: createHash("sha256").update(canonicalBody, "utf8").digest("hex"),
        bodyBytes,
      },
    };
  } catch {
    return { ok: false, category: "invalid_payload" };
  }
}

/** Projects one supported outbox row without database, network, or mutable configuration access. */
export function projectPublicationEvent(
  record: PublicationOutboxRecord,
): PublicationEventProjectionResult {
  if (
    record.eventType !== "cms.schema.published" &&
    record.eventType !== "cms.entry.published" &&
    record.eventType !== "cms.entry.unpublished"
  ) {
    return { ok: false, category: "unsupported_type" };
  }
  const time = occurredAtIso(record.occurredAt);
  if (!isUuid(record.id) || !isUuid(record.subjectId) || time === null) {
    return { ok: false, category: "invalid_outbox_authority" };
  }

  const common = {
    specversion: "1.0" as const,
    id: record.id,
    source: `urn:framerfordevs:project:${record.projectId}:environment:${record.environmentId}`,
    time,
    datacontenttype: "application/json" as const,
  };

  if (record.eventType === "cms.schema.published") {
    const payload = readSchemaPayload(record.payload);
    if (
      payload === null ||
      !matchesBaseAuthority(record, payload) ||
      record.subjectType !== "cms.collection" ||
      record.aggregateSequence !== payload.sequence ||
      record.localeId !== null ||
      record.entryPublicationId !== null
    ) {
      return { ok: false, category: "invalid_outbox_authority" };
    }
    return decodeAndCanonicalize({
      ...common,
      type: record.eventType,
      subject: `cms.collection/${record.subjectId}`,
      data: {
        version: 1,
        projectId: payload.projectId,
        environmentId: payload.environmentId,
        collectionId: payload.collectionId,
        aggregate: { type: "cms.collection", id: payload.collectionId, sequence: payload.sequence },
        schema: {
          revisionId: payload.schemaRevisionId,
          schemaHash: payload.schemaHash,
          contractHash: payload.contractHash,
        },
        changes: { fieldIds: payload.changedFieldIds },
        invalidation: invalidation(payload),
      },
    });
  }

  const payload = readEntryPayload(record.payload);
  if (
    payload === null ||
    !matchesBaseAuthority(record, payload) ||
    record.subjectType !== "cms.entry" ||
    record.subjectId !== payload.entryId ||
    record.localeId !== payload.localeId ||
    record.entryPublicationId !== payload.publicationId ||
    record.aggregateSequence !== payload.eventSequence
  ) {
    return { ok: false, category: "invalid_outbox_authority" };
  }
  const eventType: WebhookPublicEventType = record.eventType;
  return decodeAndCanonicalize({
    ...common,
    type: eventType,
    subject: `cms.entry/${payload.entryId}`,
    data: {
      version: 1,
      projectId: payload.projectId,
      environmentId: payload.environmentId,
      collectionId: payload.collectionId,
      entryId: payload.entryId,
      locale: { id: payload.localeId, tag: payload.locale },
      publication: { id: payload.publicationId, sequence: payload.publicationSequence },
      aggregate: { type: "cms.entry", id: payload.entryId, sequence: payload.eventSequence },
      schema: { revisionId: payload.schemaRevisionId, contractHash: payload.contractHash },
      changes: { fieldIds: payload.changedFieldIds },
      invalidation: invalidation(payload),
    },
  });
}
