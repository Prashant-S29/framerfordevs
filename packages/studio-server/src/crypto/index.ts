// A256GCM envelope encryption with explicit key IDs and authority-bound associated data.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { StudioCiphertext } from "../store";

const keyIdPattern = /^[A-Za-z0-9_-]{1,32}$/u;

export interface StudioEncryptionKey {
  readonly id: string;
  readonly key: Uint8Array;
}

export interface StudioEncryptionKeyRing {
  readonly activeKeyId: string;
  readonly keys: ReadonlyArray<StudioEncryptionKey>;
}

export type StudioRecordKind = "attempt" | "session";

export interface StudioEncryptionAuthority {
  readonly kind: StudioRecordKind;
  readonly registrationDigest: string;
  readonly recordDigest: string;
  readonly expiresAtEpochMs: number;
  readonly generation: number;
}

export interface ValidatedStudioKeyRing {
  readonly activeKeyId: string;
  readonly keys: ReadonlyMap<string, Uint8Array>;
}

export function validateStudioKeyRing(input: StudioEncryptionKeyRing): ValidatedStudioKeyRing {
  if (!keyIdPattern.test(input.activeKeyId) || input.keys.length < 1 || input.keys.length > 4) {
    throw new Error("STUDIO_KEY_RING_INVALID");
  }
  const keys = new Map<string, Uint8Array>();
  for (const candidate of input.keys) {
    if (
      !keyIdPattern.test(candidate.id) ||
      candidate.key.byteLength !== 32 ||
      keys.has(candidate.id)
    ) {
      throw new Error("STUDIO_KEY_RING_INVALID");
    }
    keys.set(candidate.id, Uint8Array.from(candidate.key));
  }
  if (!keys.has(input.activeKeyId)) throw new Error("STUDIO_KEY_RING_INVALID");
  return { activeKeyId: input.activeKeyId, keys };
}

function associatedData(authority: StudioEncryptionAuthority, keyId: string): Buffer {
  if (
    !/^[a-f0-9]{64}$/u.test(authority.registrationDigest) ||
    !/^[a-f0-9]{64}$/u.test(authority.recordDigest) ||
    !Number.isSafeInteger(authority.expiresAtEpochMs) ||
    authority.expiresAtEpochMs <= 0 ||
    !Number.isSafeInteger(authority.generation) ||
    authority.generation < 0
  ) {
    throw new Error("STUDIO_ENCRYPTION_AUTHORITY_INVALID");
  }
  return Buffer.from(
    `ffd-studio-envelope:v1\0${authority.kind}\0${authority.registrationDigest}\0${authority.recordDigest}\0${authority.expiresAtEpochMs}\0${authority.generation}\0${keyId}`,
    "utf8",
  );
}

export function encryptStudioRecord(
  keyRing: ValidatedStudioKeyRing,
  authority: StudioEncryptionAuthority,
  value: unknown,
): StudioCiphertext {
  const key = keyRing.keys.get(keyRing.activeKeyId);
  if (key === undefined) throw new Error("STUDIO_KEY_RING_INVALID");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData(authority, keyRing.activeKeyId));
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const maximumBytes = authority.kind === "attempt" ? 16 * 1_024 : 64 * 1_024;
  if (plaintext.byteLength > maximumBytes) throw new Error("STUDIO_ENVELOPE_INVALID");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    keyId: keyRing.activeKeyId,
    nonce: nonce.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptStudioRecord(
  keyRing: ValidatedStudioKeyRing,
  authority: StudioEncryptionAuthority,
  envelope: StudioCiphertext,
): unknown {
  const key = keyRing.keys.get(envelope.keyId);
  if (envelope.version !== 1 || key === undefined) throw new Error("STUDIO_ENVELOPE_INVALID");
  try {
    const nonce = Buffer.from(envelope.nonce, "base64url");
    const tag = Buffer.from(envelope.tag, "base64url");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
    const maximumBytes = authority.kind === "attempt" ? 16 * 1_024 : 64 * 1_024;
    if (nonce.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength > maximumBytes) {
      throw new Error("STUDIO_ENVELOPE_INVALID");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(associatedData(authority, envelope.keyId));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintext.byteLength > maximumBytes) throw new Error("STUDIO_ENVELOPE_INVALID");
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("STUDIO_ENVELOPE_INVALID");
  }
}
