import { randomUUID } from "node:crypto";

import { Effect, Schema } from "effect";

import {
  ControlPlaneCommandId,
  ControlPlaneCreateProjectInput,
  ControlPlaneCreateWorkspaceRequest,
  type ControlPlaneProject,
} from "../../contracts/control-plane";
import { UnauthorizedFailure } from "../../contracts/response/errors";
import {
  type ArchiveProjectInput,
  AuthUserId,
  type CreateProjectInput,
  type CreateWorkspaceInput,
  type EnableCapabilityInput,
  Environment,
  type GetProjectInput,
  type ListProjectsInput,
  type ListWorkspacesInput,
  Project,
  type RestoreProjectInput,
  type UpdateProjectInput,
} from "../../contracts/platform";
import { PlatformRepository } from "../../services/platform-repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

function platformProject(project: ControlPlaneProject): Project {
  return Project.make({
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    key: project.key,
    description: project.description,
    version: project.version,
    archivedAt: project.archivedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    environment: Environment.make({
      id: project.primaryEnvironment.id,
      key: project.primaryEnvironment.key,
      name: project.primaryEnvironment.name,
      isPrimary: project.primaryEnvironment.isPrimary,
      createdAt: project.primaryEnvironment.createdAt,
    }),
    capabilities: project.capabilities,
  });
}

export const createWorkspace = Effect.fn("platform.workspace.create")(function* (
  actorUserId: string,
  input: CreateWorkspaceInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const repository = yield* PlatformRepository;
  const result = yield* repository.createControlPlaneWorkspace(
    { kind: "user", id: actorId },
    ControlPlaneCreateWorkspaceRequest.make({
      commandId: ControlPlaneCommandId.make(randomUUID()),
      name: input.name,
    }),
    requestId,
  );
  return result.workspace;
});

export const listWorkspaces = Effect.fn("platform.workspace.list")(function* (
  actorUserId: string,
  input: ListWorkspacesInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const repository = yield* PlatformRepository;
  return yield* repository.listWorkspaces(actorId, input);
});

export const createProject = Effect.fn("platform.project.create")(function* (
  actorUserId: string,
  input: CreateProjectInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ workspaceId: input.workspaceId });
  const repository = yield* PlatformRepository;
  const result = yield* repository.createControlPlaneProject(
    { kind: "user", id: actorId },
    input.workspaceId,
    ControlPlaneCreateProjectInput.make({
      workspaceId: input.workspaceId,
      commandId: ControlPlaneCommandId.make(randomUUID()),
      name: input.name,
      key: input.key,
      description: input.description,
      initialCapabilities: input.initialCapabilities,
    }),
    requestId,
  );
  return platformProject(result.project);
});

export const listProjects = Effect.fn("platform.project.list")(function* (
  actorUserId: string,
  input: ListProjectsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ workspaceId: input.workspaceId });
  const repository = yield* PlatformRepository;
  return yield* repository.listProjects(actorId, input);
});

export const getProject = Effect.fn("platform.project.get")(function* (
  actorUserId: string,
  input: GetProjectInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* PlatformRepository;
  return yield* repository.getProject(actorId, input);
});

export const updateProject = Effect.fn("platform.project.update")(function* (
  actorUserId: string,
  input: UpdateProjectInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* PlatformRepository;
  const result = yield* repository.updateControlPlaneProject(
    { kind: "user", id: actorId },
    input.projectId,
    {
      expectedVersion: input.version,
      name: input.name,
      description: input.description,
    },
    requestId,
  );
  return platformProject(result);
});

export const archiveProject = Effect.fn("platform.project.archive")(function* (
  actorUserId: string,
  input: ArchiveProjectInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* PlatformRepository;
  return yield* repository.archiveProject(actorId, input, requestId);
});

export const restoreProject = Effect.fn("platform.project.restore")(function* (
  actorUserId: string,
  input: RestoreProjectInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({ projectId: input.projectId });
  const repository = yield* PlatformRepository;
  return yield* repository.restoreProject(actorId, input, requestId);
});

export const enableCapability = Effect.fn("platform.project.capability.enable")(function* (
  actorUserId: string,
  input: EnableCapabilityInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    capability: input.capability,
  });
  const repository = yield* PlatformRepository;
  const result = yield* repository.enableControlPlaneCapability(
    { kind: "user", id: actorId },
    input.projectId,
    ControlPlaneCommandId.make(randomUUID()),
    requestId,
  );
  return result.capability;
});
