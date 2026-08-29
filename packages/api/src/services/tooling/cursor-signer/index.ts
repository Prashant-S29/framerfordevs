// Signs short-lived Tooling pagination cursors bound to principal, route, scope, and page size.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { Clock, Context, Effect, Layer, Schema } from "effect";

import {
  ToolingCursorInvalidFailure,
  SecurityServiceFailure,
} from "../../../contracts/response/errors";

const cursorLifetimeMs = 15 * 60 * 1_000;
const cursorMaximumLength = 512;
const EpochMillis = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));

const ToolingCursorPayload = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("tooling_page"),
  authorityDigest: Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u)),
  finalId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  issuedAtEpochMs: EpochMillis,
  expiresAtEpochMs: EpochMillis,
});

type ToolingCursorRoute = "projects" | "environments" | "manifest";

export interface ToolingCursorAuthority {
  readonly route: ToolingCursorRoute;
  readonly principalKey: string;
  readonly projectId: string | null;
  readonly environmentKey: string | null;
  readonly limit: number;
}

export interface ToolingCursorSignerOptions {
  readonly activeSecret: string;
  readonly previousSecret?: string;
}

export interface ToolingCursorSignerService {
  readonly sign: (
    authority: ToolingCursorAuthority,
    finalId: string,
  ) => Effect.Effect<string, SecurityServiceFailure>;
  readonly verify: (
    cursor: string,
    authority: ToolingCursorAuthority,
  ) => Effect.Effect<string, ToolingCursorInvalidFailure | SecurityServiceFailure>;
}

function invalidCursor() {
  return ToolingCursorInvalidFailure.make();
}

function securityFailure(operation: string, cause: unknown) {
  return SecurityServiceFailure.make({ operation, cause });
}

function signPayload(secret: string, payload: string) {
  return Effect.try({
    try: () =>
      createHmac("sha256", secret).update(`tooling-v1:${payload}`, "utf8").digest("base64url"),
    catch: (cause) => securityFailure("tooling.cursor.hmac", cause),
  });
}

function signatureMatches(expected: string, received: string): boolean {
  try {
    const expectedBytes = Buffer.from(expected, "base64url");
    const receivedBytes = Buffer.from(received, "base64url");
    return (
      expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
    );
  } catch {
    return false;
  }
}

function authorityDigest(authority: ToolingCursorAuthority): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        authority.route,
        authority.principalKey,
        authority.projectId,
        authority.environmentKey,
        authority.limit,
      ]),
      "utf8",
    )
    .digest("hex");
}

export function makeToolingCursorSigner(
  options: ToolingCursorSignerOptions,
): ToolingCursorSignerService {
  return {
    sign: (authority, finalId) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const payload = Buffer.from(
          JSON.stringify({
            version: 1,
            kind: "tooling_page",
            authorityDigest: authorityDigest(authority),
            finalId,
            issuedAtEpochMs: now,
            expiresAtEpochMs: now + cursorLifetimeMs,
          }),
          "utf8",
        ).toString("base64url");
        const signature = yield* signPayload(options.activeSecret, payload);
        return `${payload}${signature}`;
      }),
    verify: (cursor, authority) =>
      Effect.gen(function* () {
        if (
          cursor.length <= 43 ||
          cursor.length > cursorMaximumLength ||
          !/^[A-Za-z0-9_-]+$/u.test(cursor)
        ) {
          return yield* invalidCursor();
        }
        const signatureStart = cursor.length - 43;
        const payloadText = cursor.slice(0, signatureStart);
        const receivedSignature = cursor.slice(signatureStart);
        const activeSignature = yield* signPayload(options.activeSecret, payloadText);
        let valid = signatureMatches(activeSignature, receivedSignature);
        if (!valid && options.previousSecret !== undefined) {
          const previousSignature = yield* signPayload(options.previousSecret, payloadText);
          valid = signatureMatches(previousSignature, receivedSignature);
        }
        if (!valid) return yield* invalidCursor();
        const unknownPayload = yield* Effect.try({
          try: (): unknown => JSON.parse(Buffer.from(payloadText, "base64url").toString("utf8")),
          catch: () => invalidCursor(),
        });
        const payload = yield* Schema.decodeUnknown(ToolingCursorPayload)(unknownPayload).pipe(
          Effect.mapError(() => invalidCursor()),
        );
        const now = yield* Clock.currentTimeMillis;
        if (
          payload.authorityDigest !== authorityDigest(authority) ||
          payload.expiresAtEpochMs <= now ||
          payload.issuedAtEpochMs > now ||
          payload.expiresAtEpochMs - payload.issuedAtEpochMs !== cursorLifetimeMs
        ) {
          return yield* invalidCursor();
        }
        return payload.finalId;
      }),
  };
}

export class ToolingCursorSigner extends Context.Tag("ToolingCursorSigner")<
  ToolingCursorSigner,
  ToolingCursorSignerService
>() {}

export function makeToolingCursorSignerLive(options: ToolingCursorSignerOptions) {
  return Layer.succeed(ToolingCursorSigner, makeToolingCursorSigner(options));
}
