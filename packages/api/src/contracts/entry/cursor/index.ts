// Encodes and validates scope-bound opaque cursors for immutable entry and revision ordering.

import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "../../response/api";
import { EntryId, EntryRevisionId, EntryRevisionScope } from "..";
import { ValidationFailure } from "../../response/errors";
import { LocaleTag } from "../../locale";
import { Cursor, EnvironmentId, IsoDateTime, ProjectId } from "../../platform";
import { CollectionId } from "../../schema";

class EntryCursorPayload extends Schema.Class<EntryCursorPayload>("EntryCursorPayload")({
  version: Schema.Literal(1),
  kind: Schema.Literal("cms_entry"),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  locale: LocaleTag,
  createdAt: IsoDateTime,
  entryId: EntryId,
}) {}

class EntryRevisionCursorPayload extends Schema.Class<EntryRevisionCursorPayload>(
  "EntryRevisionCursorPayload",
)({
  version: Schema.Literal(1),
  kind: Schema.Literal("cms_entry_revision"),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  entryId: EntryId,
  locale: LocaleTag,
  scope: EntryRevisionScope,
  sequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  revisionId: EntryRevisionId,
}) {}

/** Produces one non-enumerating bounded cursor validation failure. */
function invalidEntryCursor() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "cursor",
        code: "invalid_cursor",
        message: "The pagination cursor is invalid or does not match this entry scope.",
      }),
    ],
  });
}

/** Encodes a checked cursor payload into the shared opaque cursor contract. */
const encodePayload = Effect.fn("entryCursor.encode")(function* (payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return yield* Schema.decodeUnknown(Cursor)(encoded).pipe(
    Effect.mapError(() => invalidEntryCursor()),
  );
});

/** Decodes unknown base64url JSON while containing parser defects as validation failures. */
const decodeUnknownPayload = Effect.fn("entryCursor.decodeUnknown")(function* (cursor: Cursor) {
  const json = yield* Effect.try({
    try: () => Buffer.from(cursor, "base64url").toString("utf8"),
    catch: () => invalidEntryCursor(),
  });
  return yield* Effect.try({
    try: (): unknown => JSON.parse(json),
    catch: () => invalidEntryCursor(),
  });
});

/** Encodes immutable collection-entry ordering and all scope dependencies. */
export function encodeEntryCursor(payload: {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly collectionId: CollectionId;
  readonly locale: LocaleTag;
  readonly createdAt: string;
  readonly entryId: EntryId;
}) {
  return encodePayload({ version: 1, kind: "cms_entry", ...payload });
}

/** Decodes an entry cursor and rejects reuse in another tenant, collection, or locale scope. */
export const decodeEntryCursor = Effect.fn("entryCursor.decodeEntry")(function* (
  cursor: Cursor,
  scope: {
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly collectionId: CollectionId;
    readonly locale: LocaleTag;
  },
) {
  const unknownPayload = yield* decodeUnknownPayload(cursor);
  const payload = yield* Schema.decodeUnknown(EntryCursorPayload)(unknownPayload).pipe(
    Effect.mapError(() => invalidEntryCursor()),
  );
  if (
    payload.projectId !== scope.projectId ||
    payload.environmentId !== scope.environmentId ||
    payload.collectionId !== scope.collectionId ||
    payload.locale !== scope.locale
  ) {
    return yield* invalidEntryCursor();
  }
  return payload;
});

/** Encodes immutable per-scope revision ordering and every cursor scope dependency. */
export function encodeEntryRevisionCursor(payload: {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly collectionId: CollectionId;
  readonly entryId: EntryId;
  readonly locale: LocaleTag;
  readonly scope: EntryRevisionScope;
  readonly sequence: number;
  readonly revisionId: EntryRevisionId;
}) {
  return encodePayload({ version: 1, kind: "cms_entry_revision", ...payload });
}

/** Decodes a revision cursor and rejects entry, locale, or partition reuse. */
export const decodeEntryRevisionCursor = Effect.fn("entryCursor.decodeRevision")(function* (
  cursor: Cursor,
  scope: {
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly collectionId: CollectionId;
    readonly entryId: EntryId;
    readonly locale: LocaleTag;
    readonly scope: EntryRevisionScope;
  },
) {
  const unknownPayload = yield* decodeUnknownPayload(cursor);
  const payload = yield* Schema.decodeUnknown(EntryRevisionCursorPayload)(unknownPayload).pipe(
    Effect.mapError(() => invalidEntryCursor()),
  );
  if (
    payload.projectId !== scope.projectId ||
    payload.environmentId !== scope.environmentId ||
    payload.collectionId !== scope.collectionId ||
    payload.entryId !== scope.entryId ||
    payload.locale !== scope.locale ||
    payload.scope !== scope.scope
  ) {
    return yield* invalidEntryCursor();
  }
  return payload;
});
