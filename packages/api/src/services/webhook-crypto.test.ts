// Verifies webhook secret generation, scoped AES-GCM, corruption rejection, and key-ring rotation.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { makeWebhookCrypto, type WebhookEncryptionScope } from "./webhook-crypto";

const keyOne = Buffer.alloc(32, 1).toString("base64url");
const keyTwo = Buffer.alloc(32, 2).toString("base64url");
const scope: WebhookEncryptionScope = {
  workspaceId: "019fae8b-1234-7000-8000-000000000001",
  projectId: "019fae8b-1234-7000-8000-000000000002",
  environmentId: "019fae8b-1234-7000-8000-000000000003",
  endpointId: "019fae8b-1234-7000-8000-000000000004",
  resourceId: "019fae8b-1234-7000-8000-000000000005",
  purpose: "destination",
};

describe("WebhookCrypto", () => {
  it.effect("generates strict 256-bit endpoint signing secrets", () =>
    Effect.gen(function* () {
      let byte = 0;
      const crypto = makeWebhookCrypto({
        activeKeyId: "key-1",
        keys: { "key-1": keyOne },
        random: (length) => Buffer.alloc(length, byte++),
      });
      const first = yield* crypto.generateSigningSecret();
      const second = yield* crypto.generateSigningSecret();
      assert.match(first, /^whsec_[A-Za-z0-9_-]{43}$/u);
      assert.notStrictEqual(first, second);
      assert.strictEqual((yield* crypto.shortFingerprint(first)).length, 16);
    }),
  );

  it.effect("round trips only under exact tenant/resource additional authority", () =>
    Effect.gen(function* () {
      const crypto = makeWebhookCrypto({
        activeKeyId: "key-1",
        keys: { "key-1": keyOne },
        random: (length) => Buffer.alloc(length, 7),
      });
      const encrypted = yield* crypto.encrypt("https://hooks.example.com/opaque", scope);
      assert.strictEqual(encrypted.encryptionKeyId, "key-1");
      assert.strictEqual(
        yield* crypto.decrypt(encrypted, scope),
        "https://hooks.example.com/opaque",
      );
      const swapped = yield* Effect.exit(
        crypto.decrypt(encrypted, { ...scope, endpointId: scope.resourceId }),
      );
      const corrupted = yield* Effect.exit(
        crypto.decrypt(
          { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -1)}A` },
          scope,
        ),
      );
      assert.isTrue(Exit.isFailure(swapped));
      assert.isTrue(Exit.isFailure(corrupted));
    }),
  );

  it.effect("decrypts old ciphertext after active-key rotation and writes with the new key", () =>
    Effect.gen(function* () {
      const oldCrypto = makeWebhookCrypto({
        activeKeyId: "key-1",
        keys: { "key-1": keyOne },
        random: (length) => Buffer.alloc(length, 8),
      });
      const oldCiphertext = yield* oldCrypto.encrypt("secret", scope);
      const rotated = makeWebhookCrypto({
        activeKeyId: "key-2",
        keys: { "key-1": keyOne, "key-2": keyTwo },
        random: (length) => Buffer.alloc(length, 9),
      });
      assert.strictEqual(yield* rotated.decrypt(oldCiphertext, scope), "secret");
      assert.strictEqual((yield* rotated.encrypt("next", scope)).encryptionKeyId, "key-2");
      const missingOld = makeWebhookCrypto({
        activeKeyId: "key-2",
        keys: { "key-2": keyTwo },
      });
      assert.isTrue(Exit.isFailure(yield* Effect.exit(missingOld.decrypt(oldCiphertext, scope))));
    }),
  );

  it("fails configuration closed for missing, malformed, or short keys", () => {
    assert.throws(() => makeWebhookCrypto({ activeKeyId: "missing", keys: { "key-1": keyOne } }));
    assert.throws(() => makeWebhookCrypto({ activeKeyId: "key-1", keys: { "key-1": "short" } }));
  });
});
