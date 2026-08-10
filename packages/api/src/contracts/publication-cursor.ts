// Encodes scope-bound opaque cursors for immutable locale publication history.

import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "./api-response";
import { EntryId } from "./entries";
import { ValidationFailure } from "./errors";
import { LocaleTag } from "./locales";
import { Cursor, EnvironmentId, ProjectId } from "./platform";
import { EntryPublicationId, EntryPublicationSequence } from "./publications";
import { CollectionId } from "./schemas";

class PublicationCursorPayload extends Schema.Class<PublicationCursorPayload>(
  "PublicationCursorPayload",
)({
  version: Schema.Literal(1),
  kind: Schema.Literal("cms_entry_publication"),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  entryId: EntryId,
  locale: LocaleTag,
  sequence: EntryPublicationSequence,
  publicationId: EntryPublicationId,
}) {}

function invalidPublicationCursor() {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "cursor",
        code: "invalid_cursor",
        message: "The pagination cursor is invalid or does not match this publication scope.",
      }),
    ],
  });
}

export function encodePublicationCursor(
  payload: Omit<PublicationCursorPayload, "version" | "kind">,
) {
  const encoded = Buffer.from(
    JSON.stringify({ version: 1, kind: "cms_entry_publication", ...payload }),
    "utf8",
  ).toString("base64url");
  return Schema.decodeUnknown(Cursor)(encoded).pipe(
    Effect.mapError(() => invalidPublicationCursor()),
  );
}

export const decodePublicationCursor = Effect.fn("publicationCursor.decode")(function* (
  cursor: Cursor,
  scope: Pick<
    PublicationCursorPayload,
    "projectId" | "environmentId" | "collectionId" | "entryId" | "locale"
  >,
) {
  const unknownPayload = yield* Effect.try({
    try: (): unknown => JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    catch: () => invalidPublicationCursor(),
  });
  const payload = yield* Schema.decodeUnknown(PublicationCursorPayload)(unknownPayload).pipe(
    Effect.mapError(() => invalidPublicationCursor()),
  );
  if (
    payload.projectId !== scope.projectId ||
    payload.environmentId !== scope.environmentId ||
    payload.collectionId !== scope.collectionId ||
    payload.entryId !== scope.entryId ||
    payload.locale !== scope.locale
  ) {
    return yield* invalidPublicationCursor();
  }
  return payload;
});
