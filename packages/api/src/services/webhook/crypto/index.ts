// Encrypts persisted webhook authority with AES-256-GCM and endpoint-bound additional data.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

import { Context, Effect, Layer, Schema } from "effect";

import { WebhookSecret } from "../../../contracts/webhook";
import { SecurityServiceFailure } from "../../../contracts/response/errors";
import { canonicalizeEntryValue } from "../../../lib/entry/values";

export interface WebhookEncryptionScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly endpointId: string;
  readonly resourceId: string;
  readonly purpose: "destination" | "signing_secret";
}

export interface WebhookCiphertext {
  readonly encryptionKeyId: string;
  readonly nonce: string;
  readonly ciphertext: string;
}

export interface WebhookCryptoOptions {
  readonly activeKeyId: string;
  readonly keys: Readonly<Record<string, string>>;
  readonly random?: (bytes: number) => Buffer;
}

export interface WebhookCryptoService {
  readonly generateSigningSecret: () => Effect.Effect<WebhookSecret, SecurityServiceFailure>;
  readonly encrypt: (
    plaintext: string,
    scope: WebhookEncryptionScope,
  ) => Effect.Effect<WebhookCiphertext, SecurityServiceFailure>;
  readonly decrypt: (
    value: WebhookCiphertext,
    scope: WebhookEncryptionScope,
  ) => Effect.Effect<string, SecurityServiceFailure>;
  readonly keyedFingerprint: (value: string) => Effect.Effect<string, SecurityServiceFailure>;
  readonly shortFingerprint: (value: string) => Effect.Effect<string, SecurityServiceFailure>;
  readonly hasEncryptionKey: (keyId: string) => Effect.Effect<boolean>;
}

function failure(operation: string, cause: unknown): SecurityServiceFailure {
  return SecurityServiceFailure.make({ operation, cause });
}

function decodeKeys(options: WebhookCryptoOptions): ReadonlyMap<string, Buffer> {
  const entries = Object.entries(options.keys);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(options.activeKeyId) || entries.length < 1) {
    throw new Error("The webhook key ring is invalid.");
  }
  const decoded = new Map<string, Buffer>();
  for (const [id, encoded] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(id)) {
      throw new Error("The webhook key ring contains an invalid key ID.");
    }
    const key = Buffer.from(encoded, "base64url");
    if (key.length !== 32 || key.toString("base64url") !== encoded) {
      throw new Error("Every webhook encryption key must contain exactly 32 bytes.");
    }
    decoded.set(id, key);
  }
  if (!decoded.has(options.activeKeyId)) throw new Error("The active webhook key is missing.");
  return decoded;
}

function additionalData(scope: WebhookEncryptionScope): Buffer {
  return Buffer.from(canonicalizeEntryValue({ version: 1, ...scope }), "utf8");
}

/** Builds one validated key-ring service without retaining plaintext beyond each operation. */
export function makeWebhookCrypto(options: WebhookCryptoOptions): WebhookCryptoService {
  const keys = decodeKeys(options);
  const activeKey = keys.get(options.activeKeyId);
  if (activeKey === undefined) throw new Error("The active webhook key is missing.");
  const generateRandom = options.random ?? randomBytes;

  return {
    generateSigningSecret: Effect.fn("WebhookCrypto.generateSigningSecret")(function* () {
      const value = yield* Effect.try({
        try: () => `whsec_${generateRandom(32).toString("base64url")}`,
        catch: (cause) => failure("webhook.crypto.secret.generate", cause),
      });
      return yield* Schema.decodeUnknown(WebhookSecret)(value).pipe(
        Effect.mapError((cause) => failure("webhook.crypto.secret.decode", cause)),
      );
    }),

    encrypt: Effect.fn("WebhookCrypto.encrypt")(function* (plaintext, scope) {
      return yield* Effect.try({
        try: () => {
          const nonce = generateRandom(12);
          const cipher = createCipheriv("aes-256-gcm", activeKey, nonce);
          cipher.setAAD(additionalData(scope));
          const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
          const ciphertext = Buffer.concat([encrypted, cipher.getAuthTag()]);
          return {
            encryptionKeyId: options.activeKeyId,
            nonce: nonce.toString("base64url"),
            ciphertext: ciphertext.toString("base64url"),
          };
        },
        catch: (cause) => failure("webhook.crypto.encrypt", cause),
      });
    }),

    decrypt: Effect.fn("WebhookCrypto.decrypt")(function* (value, scope) {
      return yield* Effect.try({
        try: () => {
          const key = keys.get(value.encryptionKeyId);
          if (key === undefined) throw new Error("The referenced webhook key is unavailable.");
          const nonce = Buffer.from(value.nonce, "base64url");
          const combined = Buffer.from(value.ciphertext, "base64url");
          if (nonce.length !== 12 || combined.length < 17) {
            throw new Error("The webhook ciphertext encoding is invalid.");
          }
          const encrypted = combined.subarray(0, -16);
          const tag = combined.subarray(-16);
          const decipher = createDecipheriv("aes-256-gcm", key, nonce);
          decipher.setAAD(additionalData(scope));
          decipher.setAuthTag(tag);
          return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
        },
        catch: (cause) => failure("webhook.crypto.decrypt", cause),
      });
    }),

    keyedFingerprint: Effect.fn("WebhookCrypto.keyedFingerprint")((value) =>
      Effect.try({
        try: () => createHmac("sha256", activeKey).update(value, "utf8").digest("hex"),
        catch: (cause) => failure("webhook.crypto.fingerprint", cause),
      }),
    ),

    shortFingerprint: Effect.fn("WebhookCrypto.shortFingerprint")((value) =>
      Effect.try({
        try: () => createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16),
        catch: (cause) => failure("webhook.crypto.short_fingerprint", cause),
      }),
    ),

    hasEncryptionKey: Effect.fn("WebhookCrypto.hasEncryptionKey")((keyId) =>
      Effect.succeed(keys.has(keyId)),
    ),
  };
}

export class WebhookCrypto extends Context.Tag("WebhookCrypto")<
  WebhookCrypto,
  WebhookCryptoService
>() {}

/** Keeps management paths fail-closed when no persistent deployment key ring is configured. */
export const WebhookCryptoUnavailableLive = Layer.succeed(WebhookCrypto, {
  generateSigningSecret: () => Effect.fail(failure("webhook.crypto.configuration", "missing")),
  encrypt: () => Effect.fail(failure("webhook.crypto.configuration", "missing")),
  decrypt: () => Effect.fail(failure("webhook.crypto.configuration", "missing")),
  keyedFingerprint: () => Effect.fail(failure("webhook.crypto.configuration", "missing")),
  shortFingerprint: () => Effect.fail(failure("webhook.crypto.configuration", "missing")),
  hasEncryptionKey: () => Effect.succeed(false),
});

export function makeWebhookCryptoLive(options: WebhookCryptoOptions) {
  return Layer.succeed(WebhookCrypto, makeWebhookCrypto(options));
}
