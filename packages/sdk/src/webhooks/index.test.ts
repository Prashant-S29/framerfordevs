import { assert, describe, it } from "@effect/vitest";

import { normalizeInvalidation } from "../invalidation";
import { signWebhookRequest, verifyWebhookRequest } from "./index";

const ids = {
  event: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  collection: "019fae8b-1234-7000-8000-000000000004",
  revision: "019fae8b-1234-7000-8000-000000000005",
  field: "019fae8b-1234-7000-8000-000000000006",
};
const activeSecret = `whsec_${Buffer.alloc(32, 7).toString("base64url")}`;
const retiringSecret = `whsec_${Buffer.alloc(32, 9).toString("base64url")}`;
const timestamp = 1_800_000_000;

function event(extraData: Readonly<Record<string, unknown>> = {}) {
  return {
    specversion: "1.0",
    id: ids.event,
    source: `urn:framerfordevs:project:${ids.project}:environment:${ids.environment}`,
    subject: `cms.collection/${ids.collection}`,
    type: "cms.schema.published",
    time: "2026-08-01T12:00:00.000Z",
    datacontenttype: "application/json",
    data: {
      version: 1,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      aggregate: { type: "cms.collection", id: ids.collection, sequence: 1 },
      schema: {
        revisionId: ids.revision,
        schemaHash: "a".repeat(64),
        contractHash: "b".repeat(64),
      },
      changes: { fieldIds: [ids.field] },
      invalidation: {
        systemTags: [`collection:${ids.collection}`, `project:${ids.project}`],
        semanticTags: ["content:blog"],
        routes: ["/blog", "/"],
      },
      ...extraData,
    },
  };
}

function body(value = event()) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

describe("SDK webhook verification", () => {
  it("verifies exact raw bytes, reserves replay authority, and normalizes invalidation", async () => {
    const raw = body();
    let reservations = 0;
    const result = await verifyWebhookRequest({
      webhookId: ids.event,
      webhookTimestamp: String(timestamp),
      webhookSignature: signWebhookRequest(activeSecret, ids.event, timestamp, raw),
      body: raw,
      secrets: [activeSecret],
      nowEpochSeconds: timestamp,
      reserveEventId: () => {
        reservations += 1;
        return true;
      },
    });

    assert.isTrue(result.ok);
    assert.strictEqual(reservations, 1);
    if (result.ok) {
      assert.deepEqual(normalizeInvalidation(result.event), {
        eventId: ids.event,
        eventType: "cms.schema.published",
        projectId: ids.project,
        environmentId: ids.environment,
        collectionId: ids.collection,
        systemTags: [`collection:${ids.collection}`, `project:${ids.project}`],
        semanticTags: ["content:blog"],
        routes: ["/", "/blog"],
      });
    }
  });

  it("accepts active/retiring overlap but rejects tampering and stale timestamps", async () => {
    const raw = body();
    const overlap = await verifyWebhookRequest({
      webhookId: ids.event,
      webhookTimestamp: String(timestamp),
      webhookSignature: [
        signWebhookRequest(retiringSecret, ids.event, timestamp, raw),
        signWebhookRequest(activeSecret, ids.event, timestamp, raw),
      ].join(" "),
      body: raw,
      secrets: [activeSecret, retiringSecret],
      nowEpochSeconds: timestamp,
      reserveEventId: () => true,
    });
    const tampered = await verifyWebhookRequest({
      webhookId: ids.event,
      webhookTimestamp: String(timestamp),
      webhookSignature: signWebhookRequest(activeSecret, ids.event, timestamp, raw),
      body: Buffer.from(`${raw.toString("utf8")} `, "utf8"),
      secrets: [activeSecret],
      nowEpochSeconds: timestamp,
      reserveEventId: () => true,
    });
    const stale = await verifyWebhookRequest({
      webhookId: ids.event,
      webhookTimestamp: String(timestamp),
      webhookSignature: signWebhookRequest(activeSecret, ids.event, timestamp, raw),
      body: raw,
      secrets: [activeSecret],
      nowEpochSeconds: timestamp + 301,
      reserveEventId: () => true,
    });

    assert.isTrue(overlap.ok);
    assert.deepEqual(tampered, { ok: false, category: "invalid_signature" });
    assert.deepEqual(stale, { ok: false, category: "stale_timestamp" });
  });

  it("decodes only after signatures and rejects duplicate or inexact events", async () => {
    const invalidRaw = body(event({ privateValue: "not-public" }));
    const invalid = await verifyWebhookRequest({
      webhookId: ids.event,
      webhookTimestamp: String(timestamp),
      webhookSignature: signWebhookRequest(activeSecret, ids.event, timestamp, invalidRaw),
      body: invalidRaw,
      secrets: [activeSecret],
      nowEpochSeconds: timestamp,
      reserveEventId: () => true,
    });
    const raw = body();
    const duplicate = await verifyWebhookRequest({
      webhookId: ids.event,
      webhookTimestamp: String(timestamp),
      webhookSignature: signWebhookRequest(activeSecret, ids.event, timestamp, raw),
      body: raw,
      secrets: [activeSecret],
      nowEpochSeconds: timestamp,
      reserveEventId: async () => false,
    });

    assert.deepEqual(invalid, { ok: false, category: "invalid_payload" });
    assert.deepEqual(duplicate, { ok: false, category: "duplicate_event" });
  });
});
