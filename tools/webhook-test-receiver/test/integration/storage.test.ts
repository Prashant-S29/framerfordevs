// Verifies traversal-safe capture hierarchy, atomic persistence, and event-id reservation behavior.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createCapture, finalizeCapture, reserveAcceptedEvent } from "../../src/storage.js";
import type { CaptureRecord } from "../../src/types.js";
import { testEvent, testEventId } from "../support/helpers.js";

/** Creates one safe capture record without signatures, secrets, or arbitrary headers. */
function captureRecord(): CaptureRecord {
  return {
    schemaVersion: 1,
    captureId: "019fae8b-1234-7000-8000-000000000099",
    phase: "received",
    receivedAt: "2026-08-21T12:00:00.000Z",
    completedAt: null,
    scenario: "success",
    bodyBytes: 128,
    bodySha256: "a".repeat(64),
    headers: {
      contentType: "application/cloudevents+json; charset=utf-8",
      contentLength: "128",
      userAgent: "FramerForDevs-Webhooks/1",
      webhookId: testEventId,
      webhookTimestamp: "1776945600",
      webhookDeliveryId: "019fae8b-1234-7000-8000-000000000007",
      webhookAttemptId: "019fae8b-1234-7000-8000-000000000008",
      webhookAttemptNumber: 1,
      webhookReplay: false,
    },
    verification: {
      ok: true,
      category: "verified",
      duplicateAcceptedEvent: false,
    },
    event: testEvent(),
    response: {
      status: 204,
      delayMs: 0,
      retryAfter: null,
      location: null,
      code: "accepted",
      acceptsEvent: true,
    },
  };
}

test("stores and finalizes one capture under its date/scenario/event hierarchy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ffd-webhook-capture-"));
  try {
    const record = captureRecord();
    const location = await createCapture(directory, record);
    assert.match(
      location.absolutePath,
      /captures\/2026\/08\/21\/success\/[0-9a-f-]{36}\/[0-9a-f-]{36}\//u,
    );
    await finalizeCapture(location, {
      ...record,
      phase: "responded",
      completedAt: "2026-08-21T12:00:00.010Z",
    });
    const stored = await readFile(location.absolutePath, "utf8");
    assert.match(stored, /"phase": "responded"/u);
    assert.doesNotMatch(stored, /webhook-signature|whsec_/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("atomically reports duplicate accepted event IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ffd-webhook-state-"));
  try {
    assert.equal(
      await reserveAcceptedEvent(directory, "idempotent", testEventId, "2026-08-21T12:00:00Z"),
      true,
    );
    assert.equal(
      await reserveAcceptedEvent(directory, "idempotent", testEventId, "2026-08-21T12:00:01Z"),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
