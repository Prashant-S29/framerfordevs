import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  ControlPlaneCreateProjectResult,
  ControlPlaneCreateWorkspaceResult,
  ControlPlaneProject,
  ControlPlaneWorkspace,
} from "../../contracts/control-plane";
import {
  ArchiveProjectInput,
  Capability,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  GetProjectInput,
  ListProjectsInput,
  ListWorkspacesInput,
  Project,
  ProjectPage,
  ProjectSummary,
  RestoreProjectInput,
  UpdateProjectInput,
  Workspace,
  WorkspacePage,
} from "../../contracts/platform";
import { PlatformRepository, makePlatformRepository } from "../../services/platform-repository";
import {
  archiveProject,
  createProject,
  createWorkspace,
  enableCapability,
  getProject,
  listProjects,
  listWorkspaces,
  restoreProject,
  updateProject,
} from "./index";

import * as SchemaStrict from "../../lib/schema-strict";
const workspace = SchemaStrict.decodeUnknownSync(Workspace)({
  id: "019fae8b-1234-7000-8000-000000000001",
  name: "Test Workspace",
  version: 1,
  role: "owner",
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:00:00.000Z",
});
const project = SchemaStrict.decodeUnknownSync(Project)({
  id: "019fae8b-1234-7000-8000-000000000002",
  workspaceId: workspace.id,
  name: "Test Project",
  key: "test-project",
  description: null,
  version: 1,
  archivedAt: null,
  createdAt: "2026-07-29T12:00:00.000Z",
  updatedAt: "2026-07-29T12:00:00.000Z",
  environment: {
    id: "019fae8b-1234-7000-8000-000000000003",
    key: "main",
    name: "main",
    isPrimary: true,
    createdAt: "2026-07-29T12:00:00.000Z",
  },
  capabilities: [
    {
      id: null,
      key: "cms",
      status: "disabled",
      version: null,
      changedAt: null,
    },
  ],
});
const projectSummary = SchemaStrict.decodeUnknownSync(ProjectSummary)({
  id: project.id,
  workspaceId: project.workspaceId,
  name: project.name,
  key: project.key,
  description: project.description,
  version: project.version,
  archivedAt: project.archivedAt,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});
const controlPlaneWorkspace = SchemaStrict.decodeUnknownSync(ControlPlaneWorkspace)(workspace);
const controlPlaneProject = SchemaStrict.decodeUnknownSync(ControlPlaneProject)({
  ...project,
  status: "active",
  primaryEnvironment: project.environment,
  effectiveActions: [
    "project.read",
    "project.update",
    "project.archive",
    "project.capability.manage",
    "studio_registration.read",
    "studio_registration.write",
  ],
});
const capability = SchemaStrict.decodeUnknownSync(Capability)({
  id: "019fae8b-1234-7000-8000-000000000004",
  key: "cms",
  status: "enabled",
  version: 1,
  changedAt: "2026-07-29T12:00:00.000Z",
});
const workspacePage = WorkspacePage.make({ items: [workspace], nextCursor: null });
const projectPage = ProjectPage.make({ items: [projectSummary], nextCursor: null });

let createCalls = 0;
const operationCalls: Array<string> = [];

const PlatformRepositoryTest = Layer.succeed(PlatformRepository, {
  ...makePlatformRepository(),
  createControlPlaneWorkspace: () =>
    Effect.sync(() => {
      createCalls += 1;
      operationCalls.push("createControlPlaneWorkspace");
      return ControlPlaneCreateWorkspaceResult.make({
        workspace: controlPlaneWorkspace,
        replayed: false,
      });
    }),
  listWorkspaces: () =>
    Effect.sync(() => {
      operationCalls.push("listWorkspaces");
      return workspacePage;
    }),
  createControlPlaneProject: () =>
    Effect.sync(() => {
      operationCalls.push("createControlPlaneProject");
      return ControlPlaneCreateProjectResult.make({
        project: controlPlaneProject,
        replayed: false,
      });
    }),
  listProjects: () =>
    Effect.sync(() => {
      operationCalls.push("listProjects");
      return projectPage;
    }),
  getProject: () =>
    Effect.sync(() => {
      operationCalls.push("getProject");
      return project;
    }),
  updateControlPlaneProject: () =>
    Effect.sync(() => {
      operationCalls.push("updateControlPlaneProject");
      return controlPlaneProject;
    }),
  archiveProject: () =>
    Effect.sync(() => {
      operationCalls.push("archiveProject");
      return project;
    }),
  restoreProject: () =>
    Effect.sync(() => {
      operationCalls.push("restoreProject");
      return project;
    }),
  enableControlPlaneCapability: () =>
    Effect.sync(() => {
      operationCalls.push("enableControlPlaneCapability");
      return { capability, replayed: false };
    }),
});

describe("platform operations", () => {
  layer(PlatformRepositoryTest)((it) => {
    it.effect("uses the replaceable repository service", () =>
      Effect.gen(function* () {
        createCalls = 0;
        const input = yield* SchemaStrict.decodeUnknownEffect(CreateWorkspaceInput)({
          name: "Test Workspace",
        });
        const result = yield* createWorkspace("user-1", input, "request-platform-operation");

        assert.strictEqual(result.id, workspace.id);
        assert.strictEqual(createCalls, 1);
      }),
    );

    it.effect("forwards every platform workflow through the repository layer", () =>
      Effect.gen(function* () {
        operationCalls.length = 0;
        const actor = "user-1";
        const requestId = "request-platform-workflows";

        yield* listWorkspaces(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(ListWorkspacesInput)({ cursor: null, limit: 20 }),
        );
        yield* createProject(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(CreateProjectInput)({
            workspaceId: workspace.id,
            name: project.name,
            key: project.key,
            description: null,
          }),
          requestId,
        );
        yield* listProjects(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(ListProjectsInput)({
            workspaceId: workspace.id,
            status: "active",
            cursor: null,
            limit: 20,
          }),
        );
        yield* getProject(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(GetProjectInput)({ projectId: project.id }),
        );
        yield* updateProject(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(UpdateProjectInput)({
            projectId: project.id,
            version: project.version,
            name: project.name,
            description: null,
          }),
          requestId,
        );
        yield* archiveProject(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(ArchiveProjectInput)({
            projectId: project.id,
            version: project.version,
          }),
          requestId,
        );
        yield* restoreProject(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(RestoreProjectInput)({
            projectId: project.id,
            version: project.version,
          }),
          requestId,
        );
        yield* enableCapability(
          actor,
          yield* SchemaStrict.decodeUnknownEffect(EnableCapabilityInput)({
            projectId: project.id,
            capability: "cms",
          }),
          requestId,
        );

        assert.deepEqual(operationCalls, [
          "listWorkspaces",
          "createControlPlaneProject",
          "listProjects",
          "getProject",
          "updateControlPlaneProject",
          "archiveProject",
          "restoreProject",
          "enableControlPlaneCapability",
        ]);
      }),
    );

    it.effect("rejects malformed actors before invoking persistence", () =>
      Effect.gen(function* () {
        createCalls = 0;
        const input = yield* SchemaStrict.decodeUnknownEffect(CreateWorkspaceInput)({
          name: "Test Workspace",
        });
        const exit = yield* Effect.exit(createWorkspace("", input, "request-invalid-actor"));

        assert.isTrue(exit._tag === "Failure");
        assert.strictEqual(createCalls, 0);
      }),
    );
  });
});
