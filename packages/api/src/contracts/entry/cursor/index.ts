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
  sequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  revisionId: EntryRevisionId,
}) {}

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

const encodePayload = Effect.fn("entryCursor.encode")(function* (payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return yield* Schema.decodeUnknownEffect(Cursor, { onExcessProperty: "error" })(encoded).pipe(
    Effect.mapError(() => invalidEntryCursor()),
  );
});

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
  const payload = yield* Schema.decodeUnknownEffect(EntryCursorPayload, {
    onExcessProperty: "error",
  })(unknownPayload).pipe(Effect.mapError(() => invalidEntryCursor()));
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
  const payload = yield* Schema.decodeUnknownEffect(EntryRevisionCursorPayload, {
    onExcessProperty: "error",
  })(unknownPayload).pipe(Effect.mapError(() => invalidEntryCursor()));
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
