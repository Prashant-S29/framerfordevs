// Implements Standard Webhooks-compatible signing and raw-byte verification with replay reservation.

import { createHmac, timingSafeEqual } from "node:crypto";

import { Schema } from "effect";

import { PublicationWebhookEvent } from "../contracts/webhooks";

const signaturePattern = /^v1,([A-Za-z0-9+/]+={0,2})$/u;
const maximumSignatures = 2;
const defaultToleranceSeconds = 5 * 60;

export type WebhookVerificationFailureCategory =
  | "malformed_headers"
  | "stale_timestamp"
  | "invalid_signature"
  | "invalid_payload"
  | "duplicate_event";

export type WebhookVerificationResult =
  | { readonly ok: true; readonly event: PublicationWebhookEvent }
  | { readonly ok: false; readonly category: WebhookVerificationFailureCategory };

export interface VerifyWebhookInput {
  readonly webhookId: string;
  readonly webhookTimestamp: string;
  readonly webhookSignature: string;
  readonly body: Uint8Array;
  readonly secrets: ReadonlyArray<string>;
  readonly nowEpochSeconds: number;
  readonly toleranceSeconds?: number;
  readonly reserveEventId: (eventId: string) => boolean;
}

function signingKey(secret: string): Buffer {
  if (!/^whsec_[A-Za-z0-9_-]{43}$/u.test(secret)) {
    throw new Error("The webhook signing secret is malformed.");
  }
  const encoded = secret.slice(6);
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== encoded) {
    throw new Error("The webhook signing secret encoding is malformed.");
  }
  return key;
}

function signedBytes(eventId: string, timestamp: number, body: Uint8Array): Buffer {
  return Buffer.concat([
    Buffer.from(`${eventId}.${timestamp}.`, "utf8"),
    Buffer.from(body.buffer, body.byteOffset, body.byteLength),
  ]);
}

/** Signs the exact raw body without parsing or reserializing its JSON. */
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
  const entries = value.split(" ").filter((entry) => entry.length > 0);
  if (entries.length < 1 || entries.length > maximumSignatures) return null;
  const signatures: Array<string> = [];
  for (const entry of entries) {
    const match = signaturePattern.exec(entry);
    if (!match?.[1]) return null;
    try {
      const decoded = Buffer.from(match[1], "base64");
      if (decoded.length !== 32 || decoded.toString("base64") !== match[1]) return null;
      signatures.push(match[1]);
    } catch {
      return null;
    }
  }
  return signatures;
}

/** Verifies signature and timestamp before event parsing and atomic replay reservation. */
export function verifyWebhookRequest(input: VerifyWebhookInput): WebhookVerificationResult {
  if (
    !/^[0-9a-f-]{36}$/u.test(input.webhookId) ||
    !/^\d{1,12}$/u.test(input.webhookTimestamp) ||
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
      for (const received of signatures)
        accepted = signatureMatches(expected, received) || accepted;
    }
  } catch {
    return { ok: false, category: "malformed_headers" };
  }
  if (!accepted) return { ok: false, category: "invalid_signature" };

  let event: PublicationWebhookEvent;
  try {
    event = Schema.decodeUnknownSync(PublicationWebhookEvent)(
      JSON.parse(Buffer.from(input.body).toString("utf8")),
    );
  } catch {
    return { ok: false, category: "invalid_payload" };
  }
  if (event.id !== input.webhookId) return { ok: false, category: "invalid_payload" };
  if (!input.reserveEventId(event.id)) return { ok: false, category: "duplicate_event" };
  return { ok: true, event };
}
