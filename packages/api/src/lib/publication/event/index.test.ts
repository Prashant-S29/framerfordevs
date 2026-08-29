// Locks M11 outbox compatibility, authority checks, locale isolation, and canonical event bytes.

import { createHash } from "node:crypto";

import { assert, describe, it } from "@effect/vitest";

import { projectPublicationEvent, type PublicationOutboxRecord } from "./index";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const schemaRevisionId = "019fae8b-1234-7000-8000-000000000004";
const eventId = "019fae8b-1234-7000-8000-000000000005";
const entryId = "019fae8b-1234-7000-8000-000000000006";
const localeId = "019fae8b-1234-7000-8000-000000000007";
const publicationId = "019fae8b-1234-7000-8000-000000000008";
const fieldId = "019fae8b-1234-7000-8000-000000000009";

function entryRecord(overrides: Partial<PublicationOutboxRecord> = {}): PublicationOutboxRecord {
  return {
    id: eventId,
    projectId,
    environmentId,
    eventType: "cms.entry.published",
    subjectType: "cms.entry",
    subjectId: entryId,
    schemaRevisionId,
    localeId,
    entryPublicationId: publicationId,
    aggregateSequence: 7,
    occurredAt: new Date("2026-08-13T12:34:56.789Z"),
    payload: {
      version: 1,
      projectId,
      environmentId,
      collectionId,
      entryId,
      localeId,
      locale: "gu",
      publicationId,
      publicationSequence: 3,
      eventSequence: 7,
      schemaRevisionId,
      contractHash: "b".repeat(64),
      changedFieldIds: [fieldId],
      invalidationTags: [
        `locale:${localeId}`,
        `entry:${entryId}`,
        `project:${projectId}`,
        `environment:${environmentId}`,
        `collection:${collectionId}`,
        `field:${fieldId}`,
      ],
      semanticTags: ["site:homepage"],
      routes: ["/gu", "/"],
    },
    ...overrides,
  };
}

describe("publication event projector", () => {
  it("projects exact entry locale authority into stable canonical bytes", () => {
    const first = projectPublicationEvent(entryRecord());
    const second = projectPublicationEvent(entryRecord());

    assert.isTrue(first.ok);
    assert.deepStrictEqual(second, first);
    if (!first.ok) return;
    assert.strictEqual(first.value.event.type, "cms.entry.published");
    if (first.value.event.type !== "cms.entry.published") return;
    assert.strictEqual(first.value.event.data.locale.tag, "gu");
    assert.strictEqual(first.value.event.data.aggregate.sequence, 7);
    assert.deepStrictEqual([...first.value.event.data.invalidation.routes], ["/", "/gu"]);
    assert.notInclude(first.value.canonicalBody, "workspace");
    assert.strictEqual(
      first.value.bodyHash,
      createHash("sha256").update(first.value.canonicalBody, "utf8").digest("hex"),
    );
    assert.strictEqual(first.value.bodyBytes, Buffer.byteLength(first.value.canonicalBody, "utf8"));
  });

  it("projects schema publication and preserves absent M11 metadata as empty arrays", () => {
    const result = projectPublicationEvent({
      id: eventId,
      projectId,
      environmentId,
      eventType: "cms.schema.published",
      subjectType: "cms.collection",
      subjectId: collectionId,
      schemaRevisionId,
      localeId: null,
      entryPublicationId: null,
      aggregateSequence: 2,
      occurredAt: "2026-08-13T12:34:56.789Z",
      payload: {
        version: 1,
        projectId,
        environmentId,
        collectionId,
        schemaRevisionId,
        sequence: 2,
        schemaHash: "a".repeat(64),
        contractHash: "b".repeat(64),
        changedFieldIds: [],
        invalidationTags: [
          `project:${projectId}`,
          `environment:${environmentId}`,
          `collection:${collectionId}`,
        ],
      },
    });

    assert.isTrue(result.ok);
    if (!result.ok) return;
    assert.strictEqual(result.value.event.type, "cms.schema.published");
    assert.deepStrictEqual(result.value.event.data.invalidation.semanticTags, []);
    assert.deepStrictEqual(result.value.event.data.invalidation.routes, []);
  });

  it("projects the 1,000-node recursive-schema boundary inside the byte cap", () => {
    const fieldIds = Array.from(
      { length: 1_000 },
      (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    );
    const result = projectPublicationEvent({
      id: eventId,
      projectId,
      environmentId,
      eventType: "cms.schema.published",
      subjectType: "cms.collection",
      subjectId: collectionId,
      schemaRevisionId,
      localeId: null,
      entryPublicationId: null,
      aggregateSequence: 3,
      occurredAt: "2026-08-13T12:34:56.789Z",
      payload: {
        version: 1,
        projectId,
        environmentId,
        collectionId,
        schemaRevisionId,
        sequence: 3,
        schemaHash: "a".repeat(64),
        contractHash: "b".repeat(64),
        changedFieldIds: fieldIds,
        invalidationTags: fieldIds.map((id) => `field:${id}`),
      },
    });
    assert.isTrue(result.ok);
    if (!result.ok) return;
    assert.isBelow(result.value.bodyBytes, 128 * 1_024);
  });

  it("fails closed for unsupported, malformed, and cross-authority records", () => {
    assert.deepStrictEqual(
      projectPublicationEvent(entryRecord({ eventType: "cms.collection.delivery_config.updated" })),
      { ok: false, category: "unsupported_type" },
    );
    assert.deepStrictEqual(projectPublicationEvent(entryRecord({ aggregateSequence: 8 })), {
      ok: false,
      category: "invalid_outbox_authority",
    });
    const payload = entryRecord().payload;
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("Entry fixture payload is not an object.");
    }
    assert.deepStrictEqual(
      projectPublicationEvent(
        entryRecord({
          payload: { ...payload, locale: "private-invalid" },
        }),
      ),
      { ok: false, category: "invalid_payload" },
    );
  });
});
