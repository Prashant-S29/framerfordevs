import { createHmac, timingSafeEqual } from "node:crypto";

import { Clock, Context, Effect, Layer, Schema } from "effect";

import {
  PreviewHandoffClaims,
  PreviewHandoffToken,
  previewHandoffLimits,
} from "../../../contracts/preview-handoff";
import {
  CredentialInvalidFailure,
  SecurityServiceFailure,
} from "../../../contracts/response/errors";

const tokenPrefix = "ffd_pvh_";
const signatureDomain = "ffd:preview-handoff:v1:";

export interface PreviewHandoffSignerOptions {
  readonly activeSecret: string;
  readonly previousSecret?: string;
}

export type PreviewHandoffClaimsInput = Omit<
  PreviewHandoffClaims,
  "version" | "issuedAtEpochMs" | "expiresAtEpochMs"
>;

function signature(secret: string, payload: string) {
  return Effect.try({
    try: () =>
      createHmac("sha256", secret)
        .update(`${signatureDomain}${payload}`, "utf8")
        .digest("base64url"),
    catch: (cause) => SecurityServiceFailure.make({ operation: "preview_handoff.hmac", cause }),
  });
}

function signatureMatches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, "base64url");
  const receivedBytes = Buffer.from(received, "base64url");
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export function isPreviewHandoffToken(value: string): boolean {
  return value.startsWith(tokenPrefix);
}

export function makePreviewHandoffSigner(options: PreviewHandoffSignerOptions) {
  return {
    sign: Effect.fn("PreviewHandoffSigner.sign")(function* (input: PreviewHandoffClaimsInput) {
      const now = yield* Clock.currentTimeMillis;
      const claims = yield* Schema.decodeUnknownEffect(PreviewHandoffClaims, {
        onExcessProperty: "error",
      })({
        ...input,
        version: 1,
        issuedAtEpochMs: now,
        expiresAtEpochMs: now + previewHandoffLimits.lifetimeMs,
      }).pipe(
        Effect.mapError((cause) =>
          SecurityServiceFailure.make({ operation: "preview_handoff.claims", cause }),
        ),
      );
      const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
      const signed = yield* signature(options.activeSecret, payload);
      const token = yield* Schema.decodeUnknownEffect(PreviewHandoffToken, {
        onExcessProperty: "error",
      })(`${tokenPrefix}${payload}.${signed}`).pipe(
        Effect.mapError((cause) =>
          SecurityServiceFailure.make({ operation: "preview_handoff.size", cause }),
        ),
      );
      return { token, claims };
    }),

    verify: Effect.fn("PreviewHandoffSigner.verify")(function* (value: string) {
      const token = yield* Schema.decodeUnknownEffect(PreviewHandoffToken, {
        onExcessProperty: "error",
      })(value).pipe(Effect.mapError(() => CredentialInvalidFailure.make()));
      const separator = token.lastIndexOf(".");
      const payload = token.slice(tokenPrefix.length, separator);
      const received = token.slice(separator + 1);
      let matches = signatureMatches(yield* signature(options.activeSecret, payload), received);
      if (!matches && options.previousSecret !== undefined) {
        matches = signatureMatches(yield* signature(options.previousSecret, payload), received);
      }
      if (!matches) return yield* CredentialInvalidFailure.make();
      const decoded = yield* Effect.try({
        try: (): unknown => JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
        catch: () => CredentialInvalidFailure.make(),
      });
      const claims = yield* Schema.decodeUnknownEffect(PreviewHandoffClaims, {
        onExcessProperty: "error",
      })(decoded).pipe(Effect.mapError(() => CredentialInvalidFailure.make()));
      const now = yield* Clock.currentTimeMillis;
      const coherent =
        claims.source === "current"
          ? claims.schemaRevisionId === null &&
            claims.sharedRevisionId === null &&
            claims.localizedRevisionId === null
          : claims.schemaRevisionId !== null &&
            (claims.sharedRevisionId !== null || claims.localizedRevisionId !== null);
      if (
        !coherent ||
        claims.expiresAtEpochMs <= now ||
        claims.issuedAtEpochMs > now ||
        claims.expiresAtEpochMs - claims.issuedAtEpochMs !== previewHandoffLimits.lifetimeMs
      ) {
        return yield* CredentialInvalidFailure.make();
      }
      return claims;
    }),
  };
}

export class PreviewHandoffSigner extends Context.Service<
  PreviewHandoffSigner,
  ReturnType<typeof makePreviewHandoffSigner>
>()("PreviewHandoffSigner") {}

export function makePreviewHandoffSignerLive(options: PreviewHandoffSignerOptions) {
  return Layer.succeed(PreviewHandoffSigner, makePreviewHandoffSigner(options));
}
