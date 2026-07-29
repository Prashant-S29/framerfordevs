import { Effect, Schema } from "effect";

import { UnauthorizedFailure } from "../contracts/errors";
import {
  type ArchiveProjectInput,
  AuthUserId,
  type CreateProjectInput,
  type CreateWorkspaceInput,
  type EnableCapabilityInput,
  type GetProjectInput,
  type ListProjectsInput,
  type ListWorkspacesInput,
  type UpdateProjectInput,
} from "../contracts/platform";
import { PlatformRepository } from "../services/platform-repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

export const createWorkspace = Effect.fn("platform.workspace.create")(function* (
  actorUserId: string,
  input: CreateWorkspaceInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const repository = yield* PlatformRepository;
  return yield* repository.createWorkspace(actorId, input, requestId);
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
  return yield* repository.createProject(actorId, input, requestId);
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
  return yield* repository.updateProject(actorId, input, requestId);
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
  return yield* repository.enableCapability(actorId, input, requestId);
});
