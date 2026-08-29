import { Effect, Schema } from "effect";

import { ApiCredentialId, ProjectInvitationId, ProjectMembershipId } from "..";
import { ApiErrorDetail } from "../../response/api";
import { ValidationFailure } from "../../response/errors";
import { Cursor, EnvironmentId, IsoDateTime, ProjectId } from "../../platform";

class ProjectMemberCursorPayload extends Schema.Class<ProjectMemberCursorPayload>(
  "ProjectMemberCursorPayload",
)({
  version: Schema.Literal(1),
  kind: Schema.Literal("project-member"),
  projectId: ProjectId,
  createdAt: IsoDateTime,
  membershipId: ProjectMembershipId,
}) {}

class ProjectInvitationCursorPayload extends Schema.Class<ProjectInvitationCursorPayload>(
  "ProjectInvitationCursorPayload",
)({
  version: Schema.Literal(1),
  kind: Schema.Literal("project-invitation"),
  projectId: ProjectId,
  createdAt: IsoDateTime,
  invitationId: ProjectInvitationId,
}) {}

class ApiCredentialCursorPayload extends Schema.Class<ApiCredentialCursorPayload>(
  "ApiCredentialCursorPayload",
)({
  version: Schema.Literal(1),
  kind: Schema.Literal("api-credential"),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  createdAt: IsoDateTime,
  credentialId: ApiCredentialId,
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

const encodePayload = Effect.fn("accessCursor.encode")(function* (payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return yield* Schema.decodeUnknown(Cursor)(encoded).pipe(Effect.mapError(() => invalidCursor()));
});

const decodePayload = Effect.fn("accessCursor.decode")(function* <A, I>(
  cursor: Cursor,
  schema: Schema.Schema<A, I, never>,
) {
  const json = yield* Effect.try({
    try: () => Buffer.from(cursor, "base64url").toString("utf8"),
    catch: () => invalidCursor(),
  });
  const payload = yield* Effect.try({
    try: (): unknown => JSON.parse(json),
    catch: () => invalidCursor(),
  });
  return yield* Schema.decodeUnknown(schema)(payload).pipe(Effect.mapError(() => invalidCursor()));
});

export function encodeProjectMemberCursor(payload: {
  readonly projectId: ProjectId;
  readonly createdAt: string;
  readonly membershipId: ProjectMembershipId;
}) {
  return encodePayload({ version: 1, kind: "project-member", ...payload });
}

export const decodeProjectMemberCursor = Effect.fn("accessCursor.decodeProjectMember")(function* (
  cursor: Cursor,
  projectId: ProjectId,
) {
  const payload = yield* decodePayload(cursor, ProjectMemberCursorPayload);
  if (payload.projectId !== projectId) return yield* invalidCursor();
  return payload;
});

export function encodeProjectInvitationCursor(payload: {
  readonly projectId: ProjectId;
  readonly createdAt: string;
  readonly invitationId: ProjectInvitationId;
}) {
  return encodePayload({ version: 1, kind: "project-invitation", ...payload });
}

export const decodeProjectInvitationCursor = Effect.fn("accessCursor.decodeProjectInvitation")(
  function* (cursor: Cursor, projectId: ProjectId) {
    const payload = yield* decodePayload(cursor, ProjectInvitationCursorPayload);
    if (payload.projectId !== projectId) return yield* invalidCursor();
    return payload;
  },
);

export function encodeApiCredentialCursor(payload: {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly createdAt: string;
  readonly credentialId: ApiCredentialId;
}) {
  return encodePayload({ version: 1, kind: "api-credential", ...payload });
}

export const decodeApiCredentialCursor = Effect.fn("accessCursor.decodeApiCredential")(function* (
  cursor: Cursor,
  projectId: ProjectId,
  environmentId: EnvironmentId,
) {
  const payload = yield* decodePayload(cursor, ApiCredentialCursorPayload);
  if (payload.projectId !== projectId || payload.environmentId !== environmentId) {
    return yield* invalidCursor();
  }
  return payload;
});
