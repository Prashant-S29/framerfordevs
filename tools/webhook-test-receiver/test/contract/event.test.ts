// Proves the receiver persists only the exact reviewed content-free public event contract.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseWebhookEvent } from "../../src/event.js";
import { testEvent, testEventId } from "../support/helpers.js";

/** Encodes one mutated fixture without changing the signed event identity under test. */
function body(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), "utf8");
}

describe("content-free event validation", () => {
  it("accepts the exact reviewed entry publication shapes", () => {
    const published = testEvent();
    const unpublished = { ...published, type: "cms.entry.unpublished" as const };
    assert.deepEqual(parseWebhookEvent(body(published), testEventId), published);
    assert.deepEqual(parseWebhookEvent(body(unpublished), testEventId), unpublished);
  });

  it("accepts the exact reviewed schema publication shape", () => {
    const entry = testEvent();
    const schema = {
      ...entry,
      type: "cms.schema.published" as const,
      subject: "cms.collection/019fae8b-1234-7000-8000-000000000005",
      data: {
        version: 1,
        projectId: entry.data.projectId,
        environmentId: entry.data.environmentId,
        collectionId: entry.data.collectionId,
        aggregate: {
          type: "cms.collection",
          id: entry.data.collectionId,
          sequence: 4,
        },
        schema: {
          revisionId: "019fae8b-1234-7000-8000-000000000009",
          schemaHash: "b".repeat(64),
          contractHash: "a".repeat(64),
        },
        changes: { fieldIds: [] },
        invalidation: { systemTags: [], semanticTags: [], routes: [] },
      },
    };
    assert.deepEqual(parseWebhookEvent(body(schema), testEventId), schema);
  });

  it("rejects unreviewed additive data even when it is not a known secret key", () => {
    const event = testEvent();
    assert.equal(
      parseWebhookEvent(
        body({ ...event, data: { ...event.data, arbitraryMetadata: "must-not-persist" } }),
        testEventId,
      ),
      null,
    );
  });

  it("rejects envelope identities that disagree with direct data authority", () => {
    const event = testEvent();
    assert.equal(
      parseWebhookEvent(
        body({
          ...event,
          source:
            "urn:framerfordevs:project:019fae8b-1234-7000-8000-000000000010:environment:019fae8b-1234-7000-8000-000000000003",
        }),
        testEventId,
      ),
      null,
    );
  });

  it("rejects noncanonical changed-field arrays", () => {
    const event = testEvent();
    assert.equal(
      parseWebhookEvent(
        body({
          ...event,
          data: {
            ...event.data,
            changes: {
              fieldIds: [
                "019fae8b-1234-7000-8000-000000000012",
                "019fae8b-1234-7000-8000-000000000011",
              ],
            },
          },
        }),
        testEventId,
      ),
      null,
    );
  });
});
