import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "../../response/api";
import { ValidationFailure } from "../../response/errors";
import { Cursor, EnvironmentId, IsoDateTime } from "../../platform";
import { CollectionId } from "..";

class CollectionCursorPayload extends Schema.Class<CollectionCursorPayload>(
  "CollectionCursorPayload",
)({
  version: Schema.Literal(1),
  kind: Schema.Literal("cms_collection"),
  environmentId: EnvironmentId,
  createdAt: IsoDateTime,
  collectionId: CollectionId,
}) {}

const invalidCursor = () =>
  ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "cursor",
        code: "invalid_cursor",
        message: "The pagination cursor is invalid or does not match this collection list.",
      }),
    ],
  });

const encodePayload = Effect.fn("schemaCursor.encode")(function* (payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return yield* Schema.decodeUnknown(Cursor)(encoded).pipe(Effect.mapError(() => invalidCursor()));
});

const decodePayload = Effect.fn("schemaCursor.decode")(function* (cursor: Cursor) {
  const json = yield* Effect.try({
    try: () => Buffer.from(cursor, "base64url").toString("utf8"),
    catch: () => invalidCursor(),
  });
  const unknownPayload = yield* Effect.try({
    try: (): unknown => JSON.parse(json),
    catch: () => invalidCursor(),
  });
  return yield* Schema.decodeUnknown(CollectionCursorPayload)(unknownPayload).pipe(
    Effect.mapError(() => invalidCursor()),
  );
});

export function encodeCollectionCursor(payload: {
  readonly environmentId: EnvironmentId;
  readonly createdAt: string;
  readonly collectionId: CollectionId;
}) {
  return encodePayload({
    version: 1,
    kind: "cms_collection",
    environmentId: payload.environmentId,
    createdAt: payload.createdAt,
    collectionId: payload.collectionId,
  });
}

export const decodeCollectionCursor = Effect.fn("schemaCursor.decodeCollection")(function* (
  cursor: Cursor,
  environmentId: EnvironmentId,
) {
  const payload = yield* decodePayload(cursor);
  if (payload.environmentId !== environmentId) {
    return yield* invalidCursor();
  }
  return payload;
});
