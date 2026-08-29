// Signs and verifies rolling, scope/query/config/schema/generation-bound public Delivery cursors.

import { createHmac, timingSafeEqual } from "node:crypto";

import { Clock, Context, Effect, Layer, Schema } from "effect";

import type { DeliveryQueryScalarKind, DeliverySortDirection } from "../../../contracts/delivery";
import {
  DeliveryCursorInvalidFailure,
  DeliveryCursorStaleFailure,
  SecurityServiceFailure,
} from "../../../contracts/response/errors";
import { EntryId } from "../../../contracts/entry";
import { ProjectLocaleId } from "../../../contracts/locale";
import { EnvironmentId, ProjectId, ResourceVersion } from "../../../contracts/platform";
import { CollectionId, SchemaRevisionId } from "../../../contracts/schema";

const cursorLifetimeMs = 15 * 60 * 1_000;
const cursorMaximumLength = 1_024;
const Digest = Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u));
const EpochMillis = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
const Generation = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
const SortValue = Schema.Union(Schema.String, Schema.Number, Schema.Boolean, Schema.Null);

class DeliveryCursorSortTuple extends Schema.Class<DeliveryCursorSortTuple>(
  "DeliveryCursorSortTuple",
)({
  kind: Schema.Literal(
    "short_text",
    "slug",
    "email",
    "enum",
    "number",
    "decimal",
    "boolean",
    "date",
    "date_time",
    "reference",
  ),
  direction: Schema.Literal("asc", "desc"),
  value: SortValue,
  entryId: EntryId,
}) {}

class DeliveryCursorPayload extends Schema.Class<DeliveryCursorPayload>("DeliveryCursorPayload")({
  version: Schema.Literal(1),
  kind: Schema.Literal("delivery_list"),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  localeId: ProjectLocaleId,
  configVersion: ResourceVersion,
  schemaRevisionId: SchemaRevisionId,
  generation: Generation,
  queryHash: Digest,
  sort: Schema.NullOr(DeliveryCursorSortTuple),
  finalEntryId: EntryId,
  issuedAtEpochMs: EpochMillis,
  expiresAtEpochMs: EpochMillis,
}) {}

class DeliveryCursorEnvelope extends Schema.Class<DeliveryCursorEnvelope>("DeliveryCursorEnvelope")(
  {
    payload: Schema.String.pipe(
      Schema.minLength(1),
      Schema.maxLength(900),
      Schema.pattern(/^[A-Za-z0-9_-]+$/u),
    ),
    signature: Schema.String.pipe(Schema.length(43), Schema.pattern(/^[A-Za-z0-9_-]+$/u)),
  },
) {}

export interface DeliveryCursorAuthority {
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly localeId: string;
  readonly configVersion: number;
  readonly schemaRevisionId: string;
  readonly generation: number;
  readonly queryHash: string;
}

export interface SignDeliveryCursorInput extends DeliveryCursorAuthority {
  readonly sort: {
    readonly kind: DeliveryQueryScalarKind;
    readonly direction: DeliverySortDirection;
    readonly value: string | number | boolean | null;
    readonly entryId: string;
  } | null;
  readonly finalEntryId: string;
}

export interface VerifiedDeliveryCursor {
  readonly sort: DeliveryCursorSortTuple | null;
  readonly finalEntryId: EntryId;
  readonly issuedAtEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface DeliveryCursorSignerOptions {
  readonly activeSecret: string;
  readonly previousSecret?: string;
}

export interface DeliveryCursorSignerService {
  readonly sign: (input: SignDeliveryCursorInput) => Effect.Effect<string, SecurityServiceFailure>;
  readonly verify: (
    cursor: string,
    authority: DeliveryCursorAuthority,
  ) => Effect.Effect<
    VerifiedDeliveryCursor,
    DeliveryCursorInvalidFailure | DeliveryCursorStaleFailure | SecurityServiceFailure
  >;
}

/** Contains cryptographic runtime failures without exposing key or cursor material. */
function securityFailure(operation: string, cause: unknown): SecurityServiceFailure {
  return SecurityServiceFailure.make({ operation, cause });
}

/** Produces a base64url HMAC over the exact encoded payload. */
function signature(secret: string, payload: string): Effect.Effect<string, SecurityServiceFailure> {
  return Effect.try({
    try: () => createHmac("sha256", secret).update(payload, "utf8").digest("base64url"),
    catch: (cause) => securityFailure("delivery.cursor.hmac", cause),
  });
}

/** Compares equal-length signatures without value-dependent early exit. */
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

/** Returns one generic cursor failure for syntax, signature, expiry, and authority mismatch. */
function invalidCursor(): DeliveryCursorInvalidFailure {
  return DeliveryCursorInvalidFailure.make();
}

/** Decodes the bounded outer envelope before any signature or payload work. */
function decodeEnvelope(
  cursor: string,
): Effect.Effect<DeliveryCursorEnvelope, DeliveryCursorInvalidFailure> {
  if (
    cursor.length < 1 ||
    cursor.length > cursorMaximumLength ||
    cursor.length <= 43 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  ) {
    return Effect.fail(invalidCursor());
  }
  const signatureStart = cursor.length - 43;
  return Schema.decodeUnknown(DeliveryCursorEnvelope)({
    payload: cursor.slice(0, signatureStart),
    signature: cursor.slice(signatureStart),
  }).pipe(Effect.mapError(() => invalidCursor()));
}

/** Decodes a signed payload only after the envelope signature has been accepted. */
function decodePayload(
  payload: string,
): Effect.Effect<DeliveryCursorPayload, DeliveryCursorInvalidFailure> {
  return Effect.try({
    try: (): unknown => JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    catch: () => invalidCursor(),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknown(DeliveryCursorPayload)),
    Effect.mapError(() => invalidCursor()),
  );
}

/** Checks every non-generation authority before generation receives its recoverable stale outcome. */
function authorityMatches(
  payload: DeliveryCursorPayload,
  authority: DeliveryCursorAuthority,
): boolean {
  return (
    payload.projectId === authority.projectId &&
    payload.environmentId === authority.environmentId &&
    payload.collectionId === authority.collectionId &&
    payload.localeId === authority.localeId &&
    payload.configVersion === authority.configVersion &&
    payload.schemaRevisionId === authority.schemaRevisionId &&
    payload.queryHash === authority.queryHash
  );
}

/** Creates a signer with one active key and one optional bounded rotation-overlap key. */
export function makeDeliveryCursorSigner(
  options: DeliveryCursorSignerOptions,
): DeliveryCursorSignerService {
  return {
    sign: Effect.fn("DeliveryCursorSigner.sign")(function* (input) {
      const now = yield* Clock.currentTimeMillis;
      const payload = yield* Schema.decodeUnknown(DeliveryCursorPayload)({
        version: 1,
        kind: "delivery_list",
        ...input,
        issuedAtEpochMs: now,
        expiresAtEpochMs: now + cursorLifetimeMs,
      }).pipe(Effect.mapError((cause) => securityFailure("delivery.cursor.payload", cause)));
      const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
      const encodedSignature = yield* signature(options.activeSecret, encodedPayload);
      const cursor = `${encodedPayload}${encodedSignature}`;
      if (cursor.length > cursorMaximumLength) {
        return yield* securityFailure(
          "delivery.cursor.size",
          new Error("Encoded Delivery cursor exceeded its fixed bound."),
        );
      }
      return cursor;
    }),

    verify: Effect.fn("DeliveryCursorSigner.verify")(function* (cursor, authority) {
      const envelope = yield* decodeEnvelope(cursor);
      const activeSignature = yield* signature(options.activeSecret, envelope.payload);
      let validSignature = signatureMatches(activeSignature, envelope.signature);
      if (!validSignature && options.previousSecret !== undefined) {
        const previousSignature = yield* signature(options.previousSecret, envelope.payload);
        validSignature = signatureMatches(previousSignature, envelope.signature);
      }
      if (!validSignature) return yield* invalidCursor();
      const payload = yield* decodePayload(envelope.payload);
      const now = yield* Clock.currentTimeMillis;
      if (
        payload.expiresAtEpochMs <= now ||
        payload.issuedAtEpochMs > now ||
        payload.expiresAtEpochMs - payload.issuedAtEpochMs !== cursorLifetimeMs ||
        !authorityMatches(payload, authority)
      ) {
        return yield* invalidCursor();
      }
      if (payload.generation !== authority.generation) {
        return yield* DeliveryCursorStaleFailure.make();
      }
      return {
        sort: payload.sort,
        finalEntryId: payload.finalEntryId,
        issuedAtEpochMs: payload.issuedAtEpochMs,
        expiresAtEpochMs: payload.expiresAtEpochMs,
      };
    }),
  };
}

export class DeliveryCursorSigner extends Context.Tag("DeliveryCursorSigner")<
  DeliveryCursorSigner,
  DeliveryCursorSignerService
>() {}

/** Builds the stateless signer once; secret-length validation remains at environment startup. */
export function makeDeliveryCursorSignerLive(options: DeliveryCursorSignerOptions) {
  return Layer.succeed(DeliveryCursorSigner, makeDeliveryCursorSigner(options));
}
