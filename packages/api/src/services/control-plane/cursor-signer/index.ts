// Signs short-lived Control Plane pages bound to principal, route, tenant, status filter, and limit.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { Clock, Context, Effect, Layer, Schema } from "effect";

import type { ControlPlaneProjectStatus } from "../../../contracts/control-plane";
import {
  ControlPlaneCursorInvalidFailure,
  SecurityServiceFailure,
} from "../../../contracts/response/errors";

const cursorLifetimeMs = 15 * 60 * 1_000;
const cursorMaximumLength = 512;
const EpochMillis = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));

const ControlPlaneCursorPayload = Schema.Struct({
  version: Schema.Literal(1),
  kind: Schema.Literal("control_plane_page"),
  authorityDigest: Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u)),
  finalSortAtEpochMs: EpochMillis,
  finalId: Schema.UUID,
  issuedAtEpochMs: EpochMillis,
  expiresAtEpochMs: EpochMillis,
});

export type ControlPlaneCursorRoute = "workspaces" | "projects";

export interface ControlPlaneCursorAuthority {
  readonly route: ControlPlaneCursorRoute;
  readonly principalKey: string;
  readonly workspaceId: string | null;
  readonly projectStatus: ControlPlaneProjectStatus | null;
  readonly limit: number;
}

export interface ControlPlaneCursorPosition {
  readonly finalSortAtEpochMs: number;
  readonly finalId: string;
}

export interface ControlPlaneCursorSignerOptions {
  readonly activeSecret: string;
  readonly previousSecret?: string;
}

export interface ControlPlaneCursorSignerService {
  readonly sign: (
    authority: ControlPlaneCursorAuthority,
    position: ControlPlaneCursorPosition,
  ) => Effect.Effect<string, SecurityServiceFailure>;
  readonly verify: (
    cursor: string,
    authority: ControlPlaneCursorAuthority,
  ) => Effect.Effect<
    ControlPlaneCursorPosition,
    ControlPlaneCursorInvalidFailure | SecurityServiceFailure
  >;
}

function invalidCursor() {
  return ControlPlaneCursorInvalidFailure.make();
}

function securityFailure(operation: string, cause: unknown) {
  return SecurityServiceFailure.make({ operation, cause });
}

function signPayload(secret: string, payload: string) {
  return Effect.try({
    try: () =>
      createHmac("sha256", secret)
        .update(`control-plane-v1:${payload}`, "utf8")
        .digest("base64url"),
    catch: (cause) => securityFailure("control-plane.cursor.hmac", cause),
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

function authorityDigest(authority: ControlPlaneCursorAuthority): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        authority.route,
        authority.principalKey,
        authority.workspaceId,
        authority.projectStatus,
        authority.limit,
      ]),
      "utf8",
    )
    .digest("hex");
}

export function makeControlPlaneCursorSigner(
  options: ControlPlaneCursorSignerOptions,
): ControlPlaneCursorSignerService {
  return {
    sign: (authority, position) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const payload = Buffer.from(
          JSON.stringify({
            version: 1,
            kind: "control_plane_page",
            authorityDigest: authorityDigest(authority),
            finalSortAtEpochMs: position.finalSortAtEpochMs,
            finalId: position.finalId,
            issuedAtEpochMs: now,
            expiresAtEpochMs: now + cursorLifetimeMs,
          }),
          "utf8",
        ).toString("base64url");
        const signature = yield* signPayload(options.activeSecret, payload);
        const cursor = `${payload}${signature}`;
        if (cursor.length > cursorMaximumLength) {
          return yield* securityFailure(
            "control-plane.cursor.output",
            new Error("Signed cursor exceeded its output bound."),
          );
        }
        return cursor;
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
        const payload = yield* Schema.decodeUnknown(ControlPlaneCursorPayload)(unknownPayload).pipe(
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
        return {
          finalSortAtEpochMs: payload.finalSortAtEpochMs,
          finalId: payload.finalId,
        };
      }),
  };
}

export class ControlPlaneCursorSigner extends Context.Tag("ControlPlaneCursorSigner")<
  ControlPlaneCursorSigner,
  ControlPlaneCursorSignerService
>() {}

export function makeControlPlaneCursorSignerLive(options: ControlPlaneCursorSignerOptions) {
  return Layer.succeed(ControlPlaneCursorSigner, makeControlPlaneCursorSigner(options));
}
