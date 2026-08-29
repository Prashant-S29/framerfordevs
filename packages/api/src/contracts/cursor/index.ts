import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "../response/api";
import { ValidationFailure } from "../response/errors";
import {
  Cursor,
  IsoDateTime,
  ProjectId,
  ProjectListStatus,
  WorkspaceMembershipId,
  type ProjectListStatus as ProjectListStatusType,
} from "../platform";

class WorkspaceCursorPayload extends Schema.Class<WorkspaceCursorPayload>("WorkspaceCursorPayload")(
  {
    version: Schema.Literal(1),
    kind: Schema.Literal("workspace"),
    createdAt: IsoDateTime,
    membershipId: WorkspaceMembershipId,
  },
) {}

class ProjectCursorPayload extends Schema.Class<ProjectCursorPayload>("ProjectCursorPayload")({
  version: Schema.Literal(1),
  kind: Schema.Literal("project"),
  status: ProjectListStatus,
  sortAt: IsoDateTime,
  projectId: ProjectId,
}) {}

const invalidCursor = () =>
  ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "cursor",
        code: "invalid_cursor",
        message: "The pagination cursor is invalid or does not match this list.",
      }),
    ],
  });

const encodePayload = Effect.fn("cursor.encode")(function* (payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return yield* Schema.decodeUnknown(Cursor)(encoded).pipe(Effect.mapError(() => invalidCursor()));
});

const decodePayload = Effect.fn("cursor.decode")(function* <A, I>(
  cursor: Cursor,
  schema: Schema.Schema<A, I, never>,
) {
  const json = yield* Effect.try({
    try: () => Buffer.from(cursor, "base64url").toString("utf8"),
    catch: () => invalidCursor(),
  });
  const unknownPayload = yield* Effect.try({
    try: (): unknown => JSON.parse(json),
    catch: () => invalidCursor(),
  });
  return yield* Schema.decodeUnknown(schema)(unknownPayload).pipe(
    Effect.mapError(() => invalidCursor()),
  );
});

export function encodeWorkspaceCursor(payload: {
  readonly createdAt: string;
  readonly membershipId: WorkspaceMembershipId;
}) {
  return encodePayload({
    version: 1,
    kind: "workspace",
    createdAt: payload.createdAt,
    membershipId: payload.membershipId,
  });
}

export function decodeWorkspaceCursor(cursor: Cursor) {
  return decodePayload(cursor, WorkspaceCursorPayload);
}

export function encodeProjectCursor(payload: {
  readonly status: ProjectListStatusType;
  readonly sortAt: string;
  readonly projectId: ProjectId;
}) {
  return encodePayload({
    version: 1,
    kind: "project",
    status: payload.status,
    sortAt: payload.sortAt,
    projectId: payload.projectId,
  });
}

export const decodeProjectCursor = Effect.fn("cursor.decodeProject")(function* (
  cursor: Cursor,
  status: ProjectListStatusType,
) {
  const payload = yield* decodePayload(cursor, ProjectCursorPayload);
  if (payload.status !== status) {
    return yield* invalidCursor();
  }
  return payload;
});
