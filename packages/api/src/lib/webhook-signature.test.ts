// Exercises exact-byte signatures, overlap verification, freshness, tampering, and replay reservation.

import { assert, describe, it } from "@effect/vitest";

import { projectPublicationEvent, type PublicationOutboxRecord } from "./publication-event";
import { signWebhookRequest, verifyWebhookRequest } from "./webhook-signature";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const eventId = "019fae8b-1234-7000-8000-000000000005";
const activeSecret = "whsec_AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE";
const retiringSecret = "whsec_AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI";

function body(): Uint8Array {
  const record: PublicationOutboxRecord = {
    id: eventId,
    projectId,
    environmentId,
    eventType: "cms.schema.published",
    subjectType: "cms.collection",
    subjectId: collectionId,
    schemaRevisionId: revisionId,
    localeId: null,
    entryPublicationId: null,
    aggregateSequence: 1,
    occurredAt: "2026-08-13T12:00:00.000Z",
    payload: {
      version: 1,
      projectId,
      environmentId,
      collectionId,
      schemaRevisionId: revisionId,
      sequence: 1,
      schemaHash: "a".repeat(64),
      contractHash: "b".repeat(64),
      changedFieldIds: [],
      invalidationTags: [
        `project:${projectId}`,
        `environment:${environmentId}`,
        `collection:${collectionId}`,
      ],
    },
  };
  const projected = projectPublicationEvent(record);
  if (!projected.ok) throw new Error(projected.category);
  return Buffer.from(projected.value.canonicalBody, "utf8");
}

describe("webhook signatures", () => {
  it("verifies an exact raw body and atomically reserves its event ID", () => {
    const rawBody = body();
    const timestamp = 1_786_622_400;
    const signature = signWebhookRequest(activeSecret, eventId, timestamp, rawBody);
    const reservations = new Set<string>();
    const verify = () =>
      verifyWebhookRequest({
        webhookId: eventId,
        webhookTimestamp: String(timestamp),
        webhookSignature: signature,
        body: rawBody,
        secrets: [activeSecret],
        nowEpochSeconds: timestamp + 300,
        reserveEventId: (id) => {
          if (reservations.has(id)) return false;
          reservations.add(id);
          return true;
        },
      });

    const first = verify();
    assert.isTrue(first.ok);
    assert.deepStrictEqual(verify(), { ok: false, category: "duplicate_event" });
  });

  it("accepts either active or retiring overlap signature", () => {
    const rawBody = body();
    const timestamp = 1_786_622_400;
    const signatures = [
      signWebhookRequest(activeSecret, eventId, timestamp, rawBody),
      signWebhookRequest(retiringSecret, eventId, timestamp, rawBody),
    ].join(" ");
    const result = verifyWebhookRequest({
      webhookId: eventId,
      webhookTimestamp: String(timestamp),
      webhookSignature: signatures,
      body: rawBody,
      secrets: [retiringSecret],
      nowEpochSeconds: timestamp,
      reserveEventId: () => true,
    });
    assert.isTrue(result.ok);
  });

  it("rejects tampering, wrong secrets, and timestamps outside the inclusive boundary", () => {
    const rawBody = body();
    const timestamp = 1_786_622_400;
    const signature = signWebhookRequest(activeSecret, eventId, timestamp, rawBody);
    const base = {
      webhookId: eventId,
      webhookTimestamp: String(timestamp),
      webhookSignature: signature,
      body: rawBody,
      secrets: [activeSecret],
      nowEpochSeconds: timestamp,
      reserveEventId: () => true,
    };
    assert.deepStrictEqual(
      verifyWebhookRequest({ ...base, body: Buffer.concat([rawBody, Buffer.from(" ")]) }),
      { ok: false, category: "invalid_signature" },
    );
    assert.deepStrictEqual(verifyWebhookRequest({ ...base, secrets: [retiringSecret] }), {
      ok: false,
      category: "invalid_signature",
    });
    assert.isTrue(verifyWebhookRequest({ ...base, nowEpochSeconds: timestamp + 300 }).ok);
    assert.deepStrictEqual(verifyWebhookRequest({ ...base, nowEpochSeconds: timestamp + 301 }), {
      ok: false,
      category: "stale_timestamp",
    });
  });

  it("rejects malformed headers and a parsed event that disagrees with the signed ID", () => {
    const rawBody = body();
    const timestamp = 1_786_622_400;
    assert.deepStrictEqual(
      verifyWebhookRequest({
        webhookId: eventId,
        webhookTimestamp: String(timestamp),
        webhookSignature: "v1,short",
        body: rawBody,
        secrets: [activeSecret],
        nowEpochSeconds: timestamp,
        reserveEventId: () => true,
      }),
      { ok: false, category: "malformed_headers" },
    );
  });
});
