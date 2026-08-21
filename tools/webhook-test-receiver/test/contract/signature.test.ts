// Proves exact-byte signature verification, freshness, tamper rejection, and content-free parsing.

import assert from "node:assert/strict";
import { test } from "node:test";

import { verifyWebhook } from "../../src/signature.js";
import { testBody, testEventId, testSecret, testSignature } from "../support/helpers.js";

const now = 1_776_945_600;

/** Builds the valid baseline verification input used by focused failure variants. */
function validInput() {
  const body = testBody();
  return {
    webhookId: testEventId,
    webhookTimestamp: String(now),
    webhookSignature: testSignature(now, body),
    body,
    secrets: [testSecret],
    nowEpochSeconds: now,
    toleranceSeconds: 300,
  };
}

test("accepts a fresh signature over the exact approved body", () => {
  const result = verifyWebhook(validInput());
  assert.equal(result.ok, true);
  assert.equal(result.event?.id, testEventId);
});

test("rejects a body changed after signing", () => {
  const input = validInput();
  const result = verifyWebhook({ ...input, body: Buffer.concat([input.body, Buffer.from(" ")]) });
  assert.deepEqual(result, { ok: false, category: "invalid_signature" });
});

test("rejects timestamps beyond the bounded freshness window", () => {
  const input = validInput();
  const result = verifyWebhook({ ...input, nowEpochSeconds: now + 301 });
  assert.deepEqual(result, { ok: false, category: "stale_timestamp" });
});

test("fails closed when a scenario signing secret is not configured", () => {
  const result = verifyWebhook({ ...validInput(), secrets: [] });
  assert.deepEqual(result, { ok: false, category: "missing_secret" });
});
