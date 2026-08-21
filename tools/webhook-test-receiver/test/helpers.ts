// Provides deterministic signed CloudEvent fixtures for receiver tests without external network access.

import { createHmac } from "node:crypto";

import type { VerifiedEvent } from "../src/types.js";

export const testSecret = `whsec_${Buffer.alloc(32, 7).toString("base64url")}`;
export const testEventId = "019fae8b-1234-7000-8000-000000000006";

/** Creates the smallest approved content-free entry publication event fixture. */
export function testEvent(): VerifiedEvent {
  return {
    specversion: "1.0",
    id: testEventId,
    source:
      "urn:framerfordevs:project:019fae8b-1234-7000-8000-000000000002:environment:019fae8b-1234-7000-8000-000000000003",
    type: "cms.entry.published",
    subject: "cms.entry/019fae8b-1234-7000-8000-000000000004",
    time: "2026-08-21T12:00:00.000Z",
    datacontenttype: "application/json",
    data: {
      version: 1,
      projectId: "019fae8b-1234-7000-8000-000000000002",
      environmentId: "019fae8b-1234-7000-8000-000000000003",
      collectionId: "019fae8b-1234-7000-8000-000000000005",
      entryId: "019fae8b-1234-7000-8000-000000000004",
      locale: { id: "019fae8b-1234-7000-8000-000000000007", tag: "en" },
      publication: { id: "019fae8b-1234-7000-8000-000000000008", sequence: 2 },
      aggregate: {
        type: "cms.entry",
        id: "019fae8b-1234-7000-8000-000000000004",
        sequence: 3,
      },
      schema: {
        revisionId: "019fae8b-1234-7000-8000-000000000009",
        contractHash: "a".repeat(64),
      },
      changes: { fieldIds: [] },
      invalidation: { systemTags: [], semanticTags: [], routes: [] },
    },
  };
}

/** Encodes the fixture exactly once so signature tests preserve raw-byte behavior. */
export function testBody(): Buffer {
  return Buffer.from(JSON.stringify(testEvent()), "utf8");
}

/** Produces one Standard Webhooks-compatible signature for deterministic tests. */
export function testSignature(timestamp: number, body: Uint8Array): string {
  const key = Buffer.from(testSecret.slice(6), "base64url");
  const message = Buffer.concat([
    Buffer.from(`${testEventId}.${timestamp}.`, "utf8"),
    Buffer.from(body.buffer, body.byteOffset, body.byteLength),
  ]);
  return `v1,${createHmac("sha256", key).update(message).digest("base64")}`;
}
