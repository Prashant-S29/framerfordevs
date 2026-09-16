// Exposes M15 governance and locale operations through shared repository authorities.

import { Clock, Effect, Schema } from "effect";

import {
  type AcceptProjectInvitationInput,
  type CreateProjectInvitationInput,
  type ListProjectInvitationsInput,
  type ListProjectMembersInput,
  ProjectInvitationId,
  ProjectMembershipId,
  type RemoveProjectMemberInput,
  type RevokeProjectInvitationInput,
  type UpdateProjectMemberPolicyInput,
} from "../../../contracts/access";
import {
  ControlPlaneCursor,
  ControlPlaneGovernance,
  ControlPlaneInvitationPage,
  ControlPlaneLocaleList,
  ControlPlaneMemberPage,
  ControlPlaneProjectRolePolicy,
  type ControlPlaneActor,
  type ControlPlaneCommandId,
  type ControlPlaneProjectScope,
} from "../../../contracts/control-plane";
import type {
  CreateProjectLocaleInput,
  ListProjectLocalesInput,
  ReorderProjectLocalesInput,
  UpdateProjectLocaleDisplayNameInput,
  UpdateProjectLocaleStatusInput,
} from "../../../contracts/locale";

import {
  ControlPlaneCursorInvalidFailure,
  ForbiddenFailure,
  SecurityServiceFailure,
} from "../../../contracts/response/errors";
import {
  acceptProjectInvitation,
  createProjectInvitation,
  inspectProjectInvitation,
} from "../../access";
import { AccessRepository } from "../../../services/access-repository";
import {
  ControlPlaneCursorSigner,
  controlPlaneSearchDigest,
} from "../../../services/control-plane/cursor-signer";
import { LocaleRepository } from "../../../services/locale/repository";
import { fixedProjectRolePolicies } from "../../../services/policy";
import { PlatformRepository } from "../../../services/platform-repository";
import {
  encodeProjectInvitationCursor,
  encodeProjectMemberCursor,
} from "../../../contracts/access/page-cursor";

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis));

function requireUser(actor: ControlPlaneActor) {
  return actor.kind === "user" ? Effect.succeed(actor.id) : Effect.fail(ForbiddenFailure.make());
}

function decodeSignedCursor(value: string) {
  return Schema.decodeUnknown(ControlPlaneCursor)(value).pipe(
    Effect.mapError((cause) =>
      SecurityServiceFailure.make({ operation: "control-plane.cursor.output", cause }),
    ),
  );
}

function decodeCursorId<A, I>(schema: Schema.Schema<A, I, never>, value: string) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause) =>
      SecurityServiceFailure.make({ operation: "control-plane.cursor.position", cause }),
    ),
  );
}

function cursorDate(value: number) {
  return Effect.try({
    try: () => new Date(value).toISOString(),
    catch: () => ControlPlaneCursorInvalidFailure.make(),
  });
}

export const getGovernance = Effect.fn("control-plane.governance.get")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneProjectScope,
) {
  const actorId = yield* requireUser(actor);
  const repository = yield* AccessRepository;
  const access = yield* repository.getCurrentAccess(actorId, input);
  const project = yield* (yield* PlatformRepository).getControlPlaneProject(actor, input.projectId);
  const actions = new Set(access.effectiveProjectActions);

  return ControlPlaneGovernance.make({
    projectId: input.projectId,
    primaryEnvironment: project.primaryEnvironment,
    role: access.role,
    localeAccess: access.localeAccess,
    baseRoleActions: access.baseRoleActions,
    effectiveProjectActions: access.effectiveProjectActions,
    effectiveLocaleIds: access.effectiveLocaleIds,
    effectiveLocaleActions: access.effectiveLocaleActions,
    fixedRolePolicies: fixedProjectRolePolicies.map((policy) =>
      ControlPlaneProjectRolePolicy.make({
        role: policy.role,
        baseRoleActions: policy.baseRoleActions,
        requiresAllLocales: policy.requiresAllLocaleAccess,
      }),
    ),
    canReadMembers: actions.has("project.member.read"),
    canInviteMembers: actions.has("project.member.invite"),
    canUpdateMemberPolicy:
      actions.has("project.member.role.update") && actions.has("project.member.locale.update"),
    canRemoveMembers: actions.has("project.member.remove"),
  });
});

export const listMembers = Effect.fn("control-plane.member.list")(function* (
  actor: ControlPlaneActor,
  principalKey: string,
  input: ListProjectMembersInput,
) {
  const actorId = yield* requireUser(actor);
  const authority = {
    route: "members" as const,
    principalKey,
    workspaceId: null,
    projectId: input.projectId,
    projectStatus: null,
    memberRole: input.role,
    invitationStatus: null,
    searchDigest: controlPlaneSearchDigest(input.search),
    limit: input.limit,
  };
  const signer = yield* ControlPlaneCursorSigner;
  const position = input.cursor === null ? null : yield* signer.verify(input.cursor, authority);
  const cursor = position
    ? yield* encodeProjectMemberCursor({
        projectId: input.projectId,
        createdAt: yield* cursorDate(position.finalSortAtEpochMs),
        membershipId: yield* decodeCursorId(ProjectMembershipId, position.finalId),
      })
    : null;
  const page = yield* (yield* AccessRepository).listMembers(actorId, { ...input, cursor });
  const last = page.items.at(-1);
  const nextCursor =
    page.nextCursor === null || !last
      ? null
      : yield* decodeSignedCursor(
          yield* signer.sign(authority, {
            finalSortAtEpochMs: new Date(last.createdAt).getTime(),
            finalId: last.id,
          }),
        );
  return ControlPlaneMemberPage.make({ items: page.items, nextCursor });
});

export const updateMemberPolicy = Effect.fn("control-plane.member.policy.update")(function* (
  actor: ControlPlaneActor,
  input: UpdateProjectMemberPolicyInput,
  requestId: string,
) {
  const actorId = yield* requireUser(actor);
  return yield* (yield* AccessRepository).updateMemberPolicy(
    actorId,
    input,
    yield* currentDate,
    requestId,
  );
});

export const removeMember = Effect.fn("control-plane.member.remove")(function* (
  actor: ControlPlaneActor,
  input: RemoveProjectMemberInput,
  requestId: string,
) {
  const actorId = yield* requireUser(actor);
  return yield* (yield* AccessRepository).removeMember(
    actorId,
    input,
    yield* currentDate,
    requestId,
  );
});

export const listInvitations = Effect.fn("control-plane.invitation.list")(function* (
  actor: ControlPlaneActor,
  principalKey: string,
  input: ListProjectInvitationsInput,
) {
  const actorId = yield* requireUser(actor);
  const authority = {
    route: "invitations" as const,
    principalKey,
    workspaceId: null,
    projectId: input.projectId,
    projectStatus: null,
    memberRole: null,
    invitationStatus: input.status,
    searchDigest: controlPlaneSearchDigest(input.search),
    limit: input.limit,
  };
  const signer = yield* ControlPlaneCursorSigner;
  const verified = input.cursor === null ? null : yield* signer.verify(input.cursor, authority);
  const asOfEpochMs = verified?.asOfEpochMs ?? (yield* Clock.currentTimeMillis);
  if (verified !== null && verified.asOfEpochMs == null) {
    return yield* ControlPlaneCursorInvalidFailure.make();
  }
  yield* cursorDate(asOfEpochMs);
  const cursor = verified
    ? yield* encodeProjectInvitationCursor({
        projectId: input.projectId,
        createdAt: yield* cursorDate(verified.finalSortAtEpochMs),
        invitationId: yield* decodeCursorId(ProjectInvitationId, verified.finalId),
      })
    : null;
  const page = yield* (yield* AccessRepository).listInvitations(
    actorId,
    { ...input, cursor },
    new Date(asOfEpochMs),
  );
  const last = page.items.at(-1);
  const nextCursor =
    page.nextCursor === null || !last
      ? null
      : yield* decodeSignedCursor(
          yield* signer.sign(authority, {
            finalSortAtEpochMs: new Date(last.createdAt).getTime(),
            finalId: last.id,
            asOfEpochMs,
          }),
        );
  return ControlPlaneInvitationPage.make({ items: page.items, nextCursor });
});

export const createInvitation = Effect.fn("control-plane.invitation.create")(function* (
  actor: ControlPlaneActor,
  input: CreateProjectInvitationInput,
  requestId: string,
) {
  return yield* createProjectInvitation(yield* requireUser(actor), input, requestId);
});

export const revokeInvitation = Effect.fn("control-plane.invitation.revoke")(function* (
  actor: ControlPlaneActor,
  input: RevokeProjectInvitationInput,
  requestId: string,
) {
  const actorId = yield* requireUser(actor);
  return yield* (yield* AccessRepository).revokeInvitation(
    actorId,
    input,
    yield* currentDate,
    requestId,
  );
});

export const inspectInvitation = Effect.fn("control-plane.invitation.inspect")(function* (
  actor: ControlPlaneActor,
  input: AcceptProjectInvitationInput,
) {
  const actorId = yield* requireUser(actor);
  const email = yield* (yield* AccessRepository).getActorEmail(actorId);
  return yield* inspectProjectInvitation(email, input);
});

export const acceptInvitation = Effect.fn("control-plane.invitation.accept")(function* (
  actor: ControlPlaneActor,
  input: AcceptProjectInvitationInput,
  requestId: string,
) {
  const actorId = yield* requireUser(actor);
  const email = yield* (yield* AccessRepository).getActorEmail(actorId);
  return yield* acceptProjectInvitation(actorId, email, input, requestId);
});

export const listLocales = Effect.fn("control-plane.locale.list")(function* (
  actor: ControlPlaneActor,
  input: ListProjectLocalesInput,
) {
  const list = yield* (yield* LocaleRepository).listLocales(actor, input);
  return ControlPlaneLocaleList.make({ items: list.items });
});

export const createLocale = Effect.fn("control-plane.locale.create")(function* (
  actor: ControlPlaneActor,
  input: CreateProjectLocaleInput,
  commandId: ControlPlaneCommandId,
  requestId: string,
) {
  return yield* (yield* LocaleRepository).createLocale(
    actor,
    input,
    yield* currentDate,
    requestId,
    commandId,
  );
});

export const updateLocale = Effect.fn("control-plane.locale.update")(function* (
  actor: ControlPlaneActor,
  input: UpdateProjectLocaleDisplayNameInput,
  requestId: string,
) {
  return yield* (yield* LocaleRepository).updateDisplayName(
    actor,
    input,
    yield* currentDate,
    requestId,
  );
});

export const reorderLocales = Effect.fn("control-plane.locale.reorder")(function* (
  actor: ControlPlaneActor,
  input: ReorderProjectLocalesInput,
  requestId: string,
) {
  const list = yield* (yield* LocaleRepository).reorderLocales(
    actor,
    input,
    yield* currentDate,
    requestId,
  );
  return ControlPlaneLocaleList.make({ items: list.items });
});

export const updateLocaleStatus = Effect.fn("control-plane.locale.status.update")(function* (
  actor: ControlPlaneActor,
  input: UpdateProjectLocaleStatusInput,
  requestId: string,
) {
  return yield* (yield* LocaleRepository).updateStatus(actor, input, yield* currentDate, requestId);
});
