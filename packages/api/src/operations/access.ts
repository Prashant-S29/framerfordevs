import { Clock, Effect, Schema } from "effect";

import {
  type AcceptProjectInvitationInput,
  CanonicalEmail,
  type CreateProjectInvitationInput,
  type GetCurrentProjectAccessInput,
  IssuedProjectInvitation,
  type InspectProjectInvitationInput,
  type ListProjectInvitationsInput,
  type ListProjectMembersInput,
  type RemoveProjectMemberInput,
  type RevokeProjectInvitationInput,
  type UpdateProjectMemberLocaleAccessInput,
  type UpdateProjectMemberRoleInput,
} from "../contracts/access";
import { UnauthorizedFailure } from "../contracts/errors";
import { AuthUserId } from "../contracts/platform";
import { AccessRepository } from "../services/access-repository";
import { SecretGenerator } from "../services/secret-generator";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1_000;

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

const decodeActorEmail = (email: string) =>
  Schema.decodeUnknown(CanonicalEmail)(email).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
  );

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

export const createProjectInvitation = Effect.fn("access.invitation.create")(function* (
  actorUserId: string,
  input: CreateProjectInvitationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId, role: input.role });
  const secrets = yield* SecretGenerator;
  const repository = yield* AccessRepository;
  const token = yield* secrets.generateInvitationToken();
  const tokenDigest = yield* secrets.digest(token);
  const now = yield* currentDate;
  const invitation = yield* repository.createInvitation(
    actorId,
    input,
    tokenDigest,
    now,
    new Date(now.getTime() + invitationLifetimeMs),
    requestId,
  );
  return IssuedProjectInvitation.make({ invitation, token });
});

export const listProjectInvitations = Effect.fn("access.invitation.list")(function* (
  actorUserId: string,
  input: ListProjectInvitationsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* AccessRepository;
  return yield* repository.listInvitations(actorId, input, yield* currentDate);
});

export const inspectProjectInvitation = Effect.fn("access.invitation.inspect")(function* (
  actorEmail: string,
  input: InspectProjectInvitationInput,
) {
  const email = yield* decodeActorEmail(actorEmail);
  const secrets = yield* SecretGenerator;
  const repository = yield* AccessRepository;
  const tokenDigest = yield* secrets.digest(input.token);
  return yield* repository.inspectInvitation(email, tokenDigest, yield* currentDate);
});

export const acceptProjectInvitation = Effect.fn("access.invitation.accept")(function* (
  actorUserId: string,
  actorEmail: string,
  input: AcceptProjectInvitationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const email = yield* decodeActorEmail(actorEmail);
  const secrets = yield* SecretGenerator;
  const repository = yield* AccessRepository;
  const tokenDigest = yield* secrets.digest(input.token);
  return yield* repository.acceptInvitation(
    actorId,
    email,
    tokenDigest,
    yield* currentDate,
    requestId,
  );
});

export const revokeProjectInvitation = Effect.fn("access.invitation.revoke")(function* (
  actorUserId: string,
  input: RevokeProjectInvitationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ invitationId: input.invitationId });
  const repository = yield* AccessRepository;
  return yield* repository.revokeInvitation(actorId, input, yield* currentDate, requestId);
});

export const getCurrentProjectAccess = Effect.fn("access.current.get")(function* (
  actorUserId: string,
  input: GetCurrentProjectAccessInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* AccessRepository;
  return yield* repository.getCurrentAccess(actorId, input);
});

export const listProjectMembers = Effect.fn("access.member.list")(function* (
  actorUserId: string,
  input: ListProjectMembersInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* AccessRepository;
  return yield* repository.listMembers(actorId, input);
});

export const updateProjectMemberRole = Effect.fn("access.member.role.update")(function* (
  actorUserId: string,
  input: UpdateProjectMemberRoleInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ membershipId: input.membershipId, role: input.role });
  const repository = yield* AccessRepository;
  return yield* repository.updateMemberRole(actorId, input, yield* currentDate, requestId);
});

export const updateProjectMemberLocaleAccess = Effect.fn("access.member.locale.update")(function* (
  actorUserId: string,
  input: UpdateProjectMemberLocaleAccessInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    membershipId: input.membershipId,
    localeAccessMode: input.access.mode,
  });
  const repository = yield* AccessRepository;
  return yield* repository.updateMemberLocaleAccess(actorId, input, yield* currentDate, requestId);
});

export const removeProjectMember = Effect.fn("access.member.remove")(function* (
  actorUserId: string,
  input: RemoveProjectMemberInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ membershipId: input.membershipId });
  const repository = yield* AccessRepository;
  return yield* repository.removeMember(actorId, input, yield* currentDate, requestId);
});
