// Verifies Standard Webhooks-compatible signatures over exact raw bytes before parsing events.

import { createHmac, timingSafeEqual } from "node:crypto";

import { parseWebhookEvent } from "./event.js";
import type { VerificationResult } from "./types.js";

const eventIdPattern = /^[0-9a-f-]{36}$/u;
const signaturePattern = /^v1,([A-Za-z0-9+/]+={0,2})$/u;

/** Decodes one strict endpoint signing secret into its 32-byte HMAC key. */
function signingKey(secret: string): Buffer | null {
  if (!/^whsec_[A-Za-z0-9_-]{43}$/u.test(secret)) return null;
  const encoded = secret.slice(6);
  const key = Buffer.from(encoded, "base64url");
  return key.length === 32 && key.toString("base64url") === encoded ? key : null;
}

/** Parses one or two bounded Standard Webhooks v1 signatures. */
function parseSignatures(value: string): ReadonlyArray<Buffer> | null {
  const entries = value.split(" ").filter((entry) => entry.length > 0);
  if (entries.length < 1 || entries.length > 2) return null;
  const signatures: Array<Buffer> = [];
  for (const entry of entries) {
    const match = signaturePattern.exec(entry);
    if (match?.[1] === undefined) return null;
    const decoded = Buffer.from(match[1], "base64");
    if (decoded.length !== 32 || decoded.toString("base64") !== match[1]) return null;
    signatures.push(decoded);
  }
  return signatures;
}

/** Compares fixed-length HMAC values without timing-dependent string equality. */
function signatureMatches(expected: Buffer, received: Buffer): boolean {
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export interface SignatureVerificationInput {
  readonly webhookId: string | null;
  readonly webhookTimestamp: string | null;
  readonly webhookSignature: string | null;
  readonly body: Uint8Array;
  readonly secrets: ReadonlyArray<string>;
  readonly nowEpochSeconds: number;
  readonly toleranceSeconds: number;
}

/** Verifies headers, freshness, HMAC, and the approved event body in security order. */
export function verifyWebhook(input: SignatureVerificationInput): VerificationResult {
  if (input.secrets.length < 1) return { ok: false, category: "missing_secret" };
  if (
    input.webhookId === null ||
    !eventIdPattern.test(input.webhookId) ||
    input.webhookTimestamp === null ||
    !/^\d{1,12}$/u.test(input.webhookTimestamp) ||
    input.webhookSignature === null
  ) {
    return { ok: false, category: "malformed_headers" };
  }
  const signatures = parseSignatures(input.webhookSignature);
  if (signatures === null) return { ok: false, category: "malformed_headers" };
  const timestamp = Number(input.webhookTimestamp);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(input.nowEpochSeconds - timestamp) > input.toleranceSeconds
  ) {
    return { ok: false, category: "stale_timestamp" };
  }
  const message = Buffer.concat([
    Buffer.from(`${input.webhookId}.${timestamp}.`, "utf8"),
    Buffer.from(input.body.buffer, input.body.byteOffset, input.body.byteLength),
  ]);
  let accepted = false;
  for (const secret of input.secrets) {
    const key = signingKey(secret);
    if (key === null) return { ok: false, category: "malformed_headers" };
    const expected = createHmac("sha256", key).update(message).digest();
    for (const received of signatures) accepted = signatureMatches(expected, received) || accepted;
  }
  if (!accepted) return { ok: false, category: "invalid_signature" };
  const event = parseWebhookEvent(input.body, input.webhookId);
  return event === null
    ? { ok: false, category: "invalid_payload" }
    : { ok: true, category: "verified", event };
}
