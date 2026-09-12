// Exposes shared Control Plane domain operations independently of session or bearer transport.

import { Effect, Schema } from "effect";

import {
  type ControlPlaneActor,
  type ControlPlaneCreateProjectInput,
  type ControlPlaneCreateWorkspaceRequest,
  type ControlPlaneEnableCapabilityInput,
  ControlPlaneCapabilityList,
  ControlPlaneCursor,
  type ControlPlaneListProjectsInput,
  type ControlPlaneListWorkspacesQuery,
  ControlPlaneProjectPage,
  type ControlPlaneProjectLifecycleInput,
  type ControlPlaneProjectScope,
  type ControlPlanePutStudioRegistrationInput,
  type ControlPlaneUpdateProjectInput,
  type ControlPlaneWorkspaceScope,
  ControlPlaneWorkspacePage,
  ControlPlanePutStudioRegistrationRequest,
  type ControlPlaneStudioRegistrationScope,
} from "../../contracts/control-plane";
import { ArchiveProjectInput, AuthUserId, RestoreProjectInput } from "../../contracts/platform";
import {
  ForbiddenFailure,
  SecurityServiceFailure,
  UnauthorizedFailure,
} from "../../contracts/response/errors";
import { ControlPlaneCursorSigner } from "../../services/control-plane/cursor-signer";
import { PlatformRepository } from "../../services/platform-repository";

const decodeSessionActor = (userId: string) =>
  Schema.decodeUnknown(AuthUserId)(userId).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
    Effect.map((id): ControlPlaneActor => ({ kind: "user", id })),
  );

function decodeSignedCursor(value: string) {
  return Schema.decodeUnknown(ControlPlaneCursor)(value).pipe(
    Effect.mapError((cause) =>
      SecurityServiceFailure.make({ operation: "control-plane.cursor.output", cause }),
    ),
  );
}

export const listWorkspaces = Effect.fn("control-plane.workspace.list")(function* (
  actor: ControlPlaneActor,
  principalKey: string,
  query: ControlPlaneListWorkspacesQuery,
) {
  const authority = {
    route: "workspaces" as const,
    principalKey,
    workspaceId: null,
    projectStatus: null,
    limit: query.limit,
  };
  const signer = yield* ControlPlaneCursorSigner;
  const position = query.cursor === null ? null : yield* signer.verify(query.cursor, authority);
  const result = yield* (yield* PlatformRepository).listControlPlaneWorkspaces(
    actor,
    query.limit,
    position,
  );
  const nextCursor =
    result.nextPosition === null
      ? null
      : yield* decodeSignedCursor(yield* signer.sign(authority, result.nextPosition));
  return ControlPlaneWorkspacePage.make({ items: result.items, nextCursor });
});

export const createWorkspace = Effect.fn("control-plane.workspace.create")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneCreateWorkspaceRequest,
  requestId: string,
) {
  const repository = yield* PlatformRepository;
  return yield* repository.createControlPlaneWorkspace(actor, input, requestId);
});

export const createWorkspaceForSession = Effect.fn("control-plane.workspace.create-session")(
  function* (userId: string, input: ControlPlaneCreateWorkspaceRequest, requestId: string) {
    return yield* createWorkspace(yield* decodeSessionActor(userId), input, requestId);
  },
);

export const listProjects = Effect.fn("control-plane.project.list")(function* (
  actor: ControlPlaneActor,
  principalKey: string,
  input: ControlPlaneListProjectsInput,
) {
  const authority = {
    route: "projects" as const,
    principalKey,
    workspaceId: input.workspaceId,
    projectStatus: input.status,
    limit: input.limit,
  };
  const signer = yield* ControlPlaneCursorSigner;
  const position = input.cursor === null ? null : yield* signer.verify(input.cursor, authority);
  const result = yield* (yield* PlatformRepository).listControlPlaneProjects(
    actor,
    input.workspaceId,
    input.status,
    input.limit,
    position,
  );
  const nextCursor =
    result.nextPosition === null
      ? null
      : yield* decodeSignedCursor(yield* signer.sign(authority, result.nextPosition));
  return ControlPlaneProjectPage.make({ items: result.items, nextCursor });
});

export const createProject = Effect.fn("control-plane.project.create")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneCreateProjectInput,
  requestId: string,
) {
  yield* Effect.annotateCurrentSpan({ workspaceId: input.workspaceId });
  const repository = yield* PlatformRepository;
  return yield* repository.createControlPlaneProject(
    actor,
    input.workspaceId,
    {
      commandId: input.commandId,
      name: input.name,
      key: input.key,
      description: input.description,
      initialCapabilities: input.initialCapabilities,
    },
    requestId,
  );
});

export const createProjectForSession = Effect.fn("control-plane.project.create-session")(function* (
  userId: string,
  input: ControlPlaneCreateProjectInput,
  requestId: string,
) {
  return yield* createProject(yield* decodeSessionActor(userId), input, requestId);
});

export const getWorkspace = Effect.fn("control-plane.workspace.get")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneWorkspaceScope,
) {
  yield* Effect.annotateCurrentSpan({ workspaceId: input.workspaceId });
  return yield* (yield* PlatformRepository).getControlPlaneWorkspace(actor, input.workspaceId);
});

export const getWorkspaceForSession = Effect.fn("control-plane.workspace.get-session")(function* (
  userId: string,
  input: ControlPlaneWorkspaceScope,
) {
  return yield* getWorkspace(yield* decodeSessionActor(userId), input);
});

export const getProject = Effect.fn("control-plane.project.get")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneProjectScope,
) {
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  return yield* (yield* PlatformRepository).getControlPlaneProject(actor, input.projectId);
});

export const getProjectForSession = Effect.fn("control-plane.project.get-session")(function* (
  userId: string,
  input: ControlPlaneProjectScope,
) {
  return yield* getProject(yield* decodeSessionActor(userId), input);
});

export const updateProject = Effect.fn("control-plane.project.update")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneUpdateProjectInput,
  requestId: string,
) {
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  return yield* (yield* PlatformRepository).updateControlPlaneProject(
    actor,
    input.projectId,
    {
      expectedVersion: input.expectedVersion,
      name: input.name,
      description: input.description,
    },
    requestId,
  );
});

export const archiveProject = Effect.fn("control-plane.project.archive")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneProjectLifecycleInput,
  requestId: string,
) {
  if (actor.kind !== "user") return yield* ForbiddenFailure.make();
  const repository = yield* PlatformRepository;
  yield* repository.archiveProject(
    actor.id,
    ArchiveProjectInput.make({ projectId: input.projectId, version: input.expectedVersion }),
    requestId,
  );
  return yield* repository.getControlPlaneProject(actor, input.projectId);
});

export const archiveProjectForSession = Effect.fn("control-plane.project.archive-session")(
  function* (userId: string, input: ControlPlaneProjectLifecycleInput, requestId: string) {
    return yield* archiveProject(yield* decodeSessionActor(userId), input, requestId);
  },
);

export const restoreProject = Effect.fn("control-plane.project.restore")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneProjectLifecycleInput,
  requestId: string,
) {
  if (actor.kind !== "user") return yield* ForbiddenFailure.make();
  const repository = yield* PlatformRepository;
  yield* repository.restoreProject(
    actor.id,
    RestoreProjectInput.make({ projectId: input.projectId, version: input.expectedVersion }),
    requestId,
  );
  return yield* repository.getControlPlaneProject(actor, input.projectId);
});

export const restoreProjectForSession = Effect.fn("control-plane.project.restore-session")(
  function* (userId: string, input: ControlPlaneProjectLifecycleInput, requestId: string) {
    return yield* restoreProject(yield* decodeSessionActor(userId), input, requestId);
  },
);

export const updateProjectForSession = Effect.fn("control-plane.project.update-session")(function* (
  userId: string,
  input: ControlPlaneUpdateProjectInput,
  requestId: string,
) {
  return yield* updateProject(yield* decodeSessionActor(userId), input, requestId);
});

export const listCapabilities = Effect.fn("control-plane.capability.list")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneProjectScope,
) {
  const project = yield* getProject(actor, input);
  return ControlPlaneCapabilityList.make({ items: project.capabilities });
});

export const listCapabilitiesForSession = Effect.fn("control-plane.capability.list-session")(
  function* (userId: string, input: ControlPlaneProjectScope) {
    return yield* listCapabilities(yield* decodeSessionActor(userId), input);
  },
);

export const enableCapability = Effect.fn("control-plane.capability.enable")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneEnableCapabilityInput,
  requestId: string,
) {
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId, capability: "cms" });
  const repository = yield* PlatformRepository;
  return yield* repository.enableControlPlaneCapability(
    actor,
    input.projectId,
    input.commandId,
    requestId,
  );
});

export const enableCapabilityForSession = Effect.fn("control-plane.capability.enable-session")(
  function* (userId: string, input: ControlPlaneEnableCapabilityInput, requestId: string) {
    return yield* enableCapability(yield* decodeSessionActor(userId), input, requestId);
  },
);

export const getStudioRegistration = Effect.fn("control-plane.studio-registration.get")(function* (
  actor: ControlPlaneActor,
  input: ControlPlaneStudioRegistrationScope,
) {
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  const repository = yield* PlatformRepository;
  return yield* repository.getStudioRegistration(actor, input.projectId, input.environmentId);
});

export const getStudioRegistrationForSession = Effect.fn(
  "control-plane.studio-registration.get-session",
)(function* (userId: string, input: ControlPlaneStudioRegistrationScope) {
  return yield* getStudioRegistration(yield* decodeSessionActor(userId), input);
});

export const putStudioRegistration = Effect.fn("control-plane.studio-registration.put")(function* (
  actor: ControlPlaneActor,
  input: ControlPlanePutStudioRegistrationInput,
  requestId: string,
) {
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
  });
  const repository = yield* PlatformRepository;
  return yield* repository.putStudioRegistration(
    actor,
    input.projectId,
    input.environmentId,
    ControlPlanePutStudioRegistrationRequest.make({
      commandId: input.commandId,
      expectedVersion: input.expectedVersion,
      applicationOrigin: input.applicationOrigin,
      mountPath: input.mountPath,
    }),
    requestId,
  );
});

export const putStudioRegistrationForSession = Effect.fn(
  "control-plane.studio-registration.put-session",
)(function* (userId: string, input: ControlPlanePutStudioRegistrationInput, requestId: string) {
  return yield* putStudioRegistration(yield* decodeSessionActor(userId), input, requestId);
});
