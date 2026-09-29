// Signs bounded Studio Content cursors with explicit mode, scope, locale, query, and schema authority.

import { createHmac, timingSafeEqual } from "node:crypto";

import { Clock, Context, Effect, Layer, Schema } from "effect";

import { EntryId } from "../../../contracts/entry";
import { LocaleTag } from "../../../contracts/locale";
import { EnvironmentId, IsoDateTime, ProjectId } from "../../../contracts/platform";
import { SecurityServiceFailure } from "../../../contracts/response/errors";
import { CollectionId, SchemaRevisionId } from "../../../contracts/schema";
import {
  StudioContentCursor,
  StudioContentCursorInvalidFailure,
  StudioContentCursorStaleFailure,
} from "../../../contracts/studio-content";

const cursorLifetimeMs = 15 * 60 * 1_000;
const cursorDomain = "ffd:studio-content-cursor:v1:";
const Digest = Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u));
const EpochMillis = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
const SearchOrderName = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100));

const BrowseOrder = Schema.Struct({
  createdAt: IsoDateTime,
  entryId: EntryId,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const SearchOrder = Schema.Struct({
  foldedDisplayName: SearchOrderName,
  entryId: EntryId,
}).annotations({ parseOptions: { onExcessProperty: "error" } });

class StudioContentCursorPayload extends Schema.Class<StudioContentCursorPayload>(
  "StudioContentCursorPayload",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    kind: Schema.Literal("studio_content_entries"),
    mode: Schema.Literal("browse", "search"),
    projectId: ProjectId,
    environmentId: EnvironmentId,
    collectionId: CollectionId,
    locale: LocaleTag,
    schemaRevisionId: SchemaRevisionId,
    queryDigest: Schema.NullOr(Digest),
    browseOrder: Schema.NullOr(BrowseOrder),
    searchOrder: Schema.NullOr(SearchOrder),
    issuedAtEpochMs: EpochMillis,
    expiresAtEpochMs: EpochMillis,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

class StudioContentCursorEnvelope extends Schema.Class<StudioContentCursorEnvelope>(
  "StudioContentCursorEnvelope",
)(
  Schema.Struct({
    payload: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(900)),
    signature: Schema.String.pipe(Schema.length(43), Schema.pattern(/^[A-Za-z0-9_-]+$/u)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export interface StudioContentCursorAuthority {
  readonly mode: "browse" | "search";
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly locale: string;
  readonly schemaRevisionId: string;
  readonly queryDigest: string | null;
}

export interface SignStudioContentCursorInput extends StudioContentCursorAuthority {
  readonly browseOrder: { readonly createdAt: string; readonly entryId: string } | null;
  readonly searchOrder: { readonly foldedDisplayName: string; readonly entryId: string } | null;
}

export interface StudioContentCursorSignerOptions {
  readonly activeSecret: string;
  readonly previousSecret?: string;
}

export interface StudioContentCursorSignerService {
  readonly sign: (
    input: SignStudioContentCursorInput,
  ) => Effect.Effect<StudioContentCursor, SecurityServiceFailure>;
  readonly verify: (
    cursor: StudioContentCursor,
    authority: StudioContentCursorAuthority,
  ) => Effect.Effect<
    Pick<StudioContentCursorPayload, "browseOrder" | "searchOrder">,
    StudioContentCursorInvalidFailure | StudioContentCursorStaleFailure | SecurityServiceFailure
  >;
}

function securityFailure(operation: string, cause: unknown) {
  return SecurityServiceFailure.make({ operation, cause });
}

function signature(secret: string, payload: string) {
  return Effect.try({
    try: () =>
      createHmac("sha256", secret).update(`${cursorDomain}${payload}`, "utf8").digest("base64url"),
    catch: (cause) => securityFailure("studio_content.cursor.hmac", cause),
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

function invalidCursor() {
  return StudioContentCursorInvalidFailure.make();
}

function validModeShape(payload: StudioContentCursorPayload): boolean {
  return payload.mode === "browse"
    ? payload.queryDigest === null && payload.browseOrder !== null && payload.searchOrder === null
    : payload.queryDigest !== null && payload.browseOrder === null && payload.searchOrder !== null;
}

export function makeStudioContentCursorSigner(
  options: StudioContentCursorSignerOptions,
): StudioContentCursorSignerService {
  return {
    sign: Effect.fn("StudioContentCursorSigner.sign")(function* (input) {
      const now = yield* Clock.currentTimeMillis;
      const payload = yield* Schema.decodeUnknown(StudioContentCursorPayload)({
        version: 1,
        kind: "studio_content_entries",
        ...input,
        issuedAtEpochMs: now,
        expiresAtEpochMs: now + cursorLifetimeMs,
      }).pipe(Effect.mapError((cause) => securityFailure("studio_content.cursor.payload", cause)));
      if (!validModeShape(payload)) {
        return yield* securityFailure(
          "studio_content.cursor.mode",
          new Error("Studio Content cursor mode authority is inconsistent."),
        );
      }
      const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
      const encodedSignature = yield* signature(options.activeSecret, encodedPayload);
      return yield* Schema.decodeUnknown(StudioContentCursor)(
        `${encodedPayload}${encodedSignature}`,
      ).pipe(Effect.mapError((cause) => securityFailure("studio_content.cursor.size", cause)));
    }),
    verify: Effect.fn("StudioContentCursorSigner.verify")(function* (cursor, authority) {
      if (cursor.length <= 43) return yield* invalidCursor();
      const signatureStart = cursor.length - 43;
      const envelope = yield* Schema.decodeUnknown(StudioContentCursorEnvelope)({
        payload: cursor.slice(0, signatureStart),
        signature: cursor.slice(signatureStart),
      }).pipe(Effect.mapError(() => invalidCursor()));
      const active = yield* signature(options.activeSecret, envelope.payload);
      let matches = signatureMatches(active, envelope.signature);
      if (!matches && options.previousSecret !== undefined) {
        const previous = yield* signature(options.previousSecret, envelope.payload);
        matches = signatureMatches(previous, envelope.signature);
      }
      if (!matches) return yield* invalidCursor();
      const unknownPayload = yield* Effect.try({
        try: (): unknown => JSON.parse(Buffer.from(envelope.payload, "base64url").toString("utf8")),
        catch: () => invalidCursor(),
      });
      const payload = yield* Schema.decodeUnknown(StudioContentCursorPayload)(unknownPayload).pipe(
        Effect.mapError(() => invalidCursor()),
      );
      const now = yield* Clock.currentTimeMillis;
      if (
        payload.expiresAtEpochMs <= now ||
        payload.issuedAtEpochMs > now ||
        payload.expiresAtEpochMs - payload.issuedAtEpochMs !== cursorLifetimeMs ||
        !validModeShape(payload) ||
        payload.mode !== authority.mode ||
        payload.projectId !== authority.projectId ||
        payload.environmentId !== authority.environmentId ||
        payload.collectionId !== authority.collectionId ||
        payload.locale !== authority.locale ||
        payload.queryDigest !== authority.queryDigest
      ) {
        return yield* invalidCursor();
      }
      if (payload.schemaRevisionId !== authority.schemaRevisionId) {
        return yield* StudioContentCursorStaleFailure.make();
      }
      return { browseOrder: payload.browseOrder, searchOrder: payload.searchOrder };
    }),
  };
}

export class StudioContentCursorSigner extends Context.Tag("StudioContentCursorSigner")<
  StudioContentCursorSigner,
  StudioContentCursorSignerService
>() {}

export function makeStudioContentCursorSignerLive(options: StudioContentCursorSignerOptions) {
  return Layer.succeed(StudioContentCursorSigner, makeStudioContentCursorSigner(options));
}
