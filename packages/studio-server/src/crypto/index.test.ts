import { describe, expect, it } from "vitest";

import { decryptStudioRecord, encryptStudioRecord, validateStudioKeyRing } from ".";

const authority = {
  kind: "session" as const,
  registrationDigest: "a".repeat(64),
  recordDigest: "b".repeat(64),
  expiresAtEpochMs: 1_800_000_000_000,
  generation: 1,
};

describe("Studio session envelope", () => {
  it("decrypts old-key records during rotation and writes only with the active key", () => {
    const oldOnly = validateStudioKeyRing({
      activeKeyId: "old",
      keys: [{ id: "old", key: new Uint8Array(32).fill(1) }],
    });
    const encrypted = encryptStudioRecord(oldOnly, authority, { refreshToken: "provider-secret" });
    const rotating = validateStudioKeyRing({
      activeKeyId: "new",
      keys: [
        { id: "new", key: new Uint8Array(32).fill(2) },
        { id: "old", key: new Uint8Array(32).fill(1) },
      ],
    });
    expect(decryptStudioRecord(rotating, authority, encrypted)).toEqual({
      refreshToken: "provider-secret",
    });
    expect(encryptStudioRecord(rotating, authority, { value: true }).keyId).toBe("new");
    const retired = validateStudioKeyRing({
      activeKeyId: "new",
      keys: [{ id: "new", key: new Uint8Array(32).fill(2) }],
    });
    expect(() => decryptStudioRecord(retired, authority, encrypted)).toThrow(
      "STUDIO_ENVELOPE_INVALID",
    );
  });

  it("rejects ciphertext and associated-data tampering", () => {
    const ring = validateStudioKeyRing({
      activeKeyId: "active",
      keys: [{ id: "active", key: new Uint8Array(32).fill(3) }],
    });
    const encrypted = encryptStudioRecord(ring, authority, { token: "secret" });
    expect(() =>
      decryptStudioRecord(ring, { ...authority, recordDigest: "c".repeat(64) }, encrypted),
    ).toThrow("STUDIO_ENVELOPE_INVALID");
    expect(() =>
      decryptStudioRecord(ring, { ...authority, generation: authority.generation + 1 }, encrypted),
    ).toThrow("STUDIO_ENVELOPE_INVALID");
    expect(() =>
      decryptStudioRecord(
        ring,
        { ...authority, expiresAtEpochMs: authority.expiresAtEpochMs + 1 },
        encrypted,
      ),
    ).toThrow("STUDIO_ENVELOPE_INVALID");
    expect(() =>
      decryptStudioRecord(ring, authority, {
        ...encrypted,
        ciphertext: `${encrypted.ciphertext.startsWith("A") ? "B" : "A"}${encrypted.ciphertext.slice(1)}`,
      }),
    ).toThrow("STUDIO_ENVELOPE_INVALID");
  });

  it("enforces the exact attempt and session plaintext byte limits", () => {
    const ring = validateStudioKeyRing({
      activeKeyId: "active",
      keys: [{ id: "active", key: new Uint8Array(32).fill(4) }],
    });
    for (const [kind, maximum] of [
      ["attempt", 16 * 1_024],
      ["session", 64 * 1_024],
    ] as const) {
      const exactAuthority = { ...authority, kind };
      const exact = "x".repeat(maximum - 2);
      const encrypted = encryptStudioRecord(ring, exactAuthority, exact);
      expect(Buffer.from(encrypted.ciphertext, "base64url")).toHaveLength(maximum);
      expect(decryptStudioRecord(ring, exactAuthority, encrypted)).toBe(exact);
      expect(() => encryptStudioRecord(ring, exactAuthority, `${exact}x`)).toThrow(
        "STUDIO_ENVELOPE_INVALID",
      );
    }
  });

  it("requires one to four exact 32-byte uniquely named keys", () => {
    expect(() =>
      validateStudioKeyRing({
        activeKeyId: "active",
        keys: [{ id: "active", key: new Uint8Array(31) }],
      }),
    ).toThrow("STUDIO_KEY_RING_INVALID");
    expect(() =>
      validateStudioKeyRing({
        activeKeyId: "active",
        keys: Array.from({ length: 5 }, (_, index) => ({
          id: index === 0 ? "active" : `old-${index}`,
          key: new Uint8Array(32).fill(index),
        })),
      }),
    ).toThrow("STUDIO_KEY_RING_INVALID");
  });
});
