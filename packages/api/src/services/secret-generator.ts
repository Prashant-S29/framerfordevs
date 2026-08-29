// Generates one-time invitation/API credentials and verifies digest-only persistence material.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Context, Effect, Layer, Option, Schema } from "effect";

import {
  ApiCredentialId,
  CredentialKeyPrefix,
  CredentialSecret,
  type CredentialFamily,
  InvitationToken,
} from "../contracts/access";
import { SecurityServiceFailure } from "../contracts/response/errors";

export interface CredentialMaterial {
  readonly key: CredentialSecret;
  readonly keyPrefix: CredentialKeyPrefix;
  readonly keyDigest: string;
}

export interface ParsedCredentialKey {
  readonly id: ApiCredentialId;
  readonly family: CredentialFamily;
}

const familyPrefix: Readonly<Record<CredentialFamily, string>> = {
  management: "ffd_mgmt_",
  delivery: "ffd_del_",
  preview: "ffd_prev_",
};

function securityFailure(operation: string, cause: unknown) {
  return SecurityServiceFailure.make({ operation, cause });
}

function decodeGenerated<A, I>(
  operation: string,
  schema: Schema.Schema<A, I, never>,
  value: unknown,
) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause) => securityFailure(`${operation}.decode`, cause)),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseCredentialKey(value: string): ParsedCredentialKey | undefined {
  const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(CredentialSecret)(value));
  if (decoded === undefined) return undefined;
  const match = /^ffd_(mgmt|del|prev)_([0-9a-f-]{36})_[A-Za-z0-9_-]{43}$/u.exec(decoded);
  const familyCode = match?.[1];
  const id = Option.getOrUndefined(Schema.decodeUnknownOption(ApiCredentialId)(match?.[2]));
  if (id === undefined) return undefined;

  switch (familyCode) {
    case "mgmt":
      return { id, family: "management" };
    case "del":
      return { id, family: "delivery" };
    case "prev":
      return { id, family: "preview" };
    default:
      return undefined;
  }
}

/** Creates the cryptographic service without retaining credential or invitation material. */
export function makeSecretGenerator() {
  return {
    generateInvitationToken: Effect.fn("SecretGenerator.generateInvitationToken")(function* () {
      const encoded = yield* Effect.try({
        try: () => randomBytes(32).toString("base64url"),
        catch: (cause) => securityFailure("security.invitation.random", cause),
      });
      return yield* decodeGenerated("security.invitation.token", InvitationToken, encoded);
    }),

    generateCredentialMaterial: Effect.fn("SecretGenerator.generateCredentialMaterial")(function* (
      family: CredentialFamily,
      id: ApiCredentialId,
    ) {
      const randomSecret = yield* Effect.try({
        try: () => randomBytes(32).toString("base64url"),
        catch: (cause) => securityFailure("security.credential.random", cause),
      });
      const keyPrefix = yield* decodeGenerated(
        "security.credential.prefix",
        CredentialKeyPrefix,
        `${familyPrefix[family]}${id}`,
      );
      const key = yield* decodeGenerated(
        "security.credential.key",
        CredentialSecret,
        `${keyPrefix}_${randomSecret}`,
      );
      const keyDigest = yield* Effect.try({
        try: () => sha256(key),
        catch: (cause) => securityFailure("security.credential.digest", cause),
      });
      return { key, keyPrefix, keyDigest };
    }),

    digest: Effect.fn("SecretGenerator.digest")(function* (value: string) {
      return yield* Effect.try({
        try: () => sha256(value),
        catch: (cause) => securityFailure("security.digest", cause),
      });
    }),

    verifyDigest: Effect.fn("SecretGenerator.verifyDigest")(function* (
      value: string,
      expectedDigest: string,
    ) {
      return yield* Effect.try({
        try: () => {
          if (!/^[0-9a-f]{64}$/u.test(expectedDigest)) return false;
          const actual = Buffer.from(sha256(value), "hex");
          const expected = Buffer.from(expectedDigest, "hex");
          return actual.length === expected.length && timingSafeEqual(actual, expected);
        },
        catch: (cause) => securityFailure("security.digest.verify", cause),
      });
    }),
  };
}

export class SecretGenerator extends Context.Tag("SecretGenerator")<
  SecretGenerator,
  ReturnType<typeof makeSecretGenerator>
>() {}

export const SecretGeneratorLive = Layer.succeed(SecretGenerator, makeSecretGenerator());
