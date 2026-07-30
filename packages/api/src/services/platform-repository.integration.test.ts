import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, or, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Option, Schema } from "effect";

import {
  ArchiveProjectInput,
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  GetProjectInput,
  ListProjectsInput,
  ListWorkspacesInput,
  type Project as ProjectModel,
  UpdateProjectInput,
  type Workspace as WorkspaceModel,
} from "../contracts/platform";
import { makePlatformRepository } from "./platform-repository";

const repository = makePlatformRepository();
const suffix = randomUUID();
const firstUserId = `m2-owner-a-${suffix}`;
const secondUserId = `m2-owner-b-${suffix}`;
const firstEmail = `m2-owner-a-${suffix}@example.test`;
const secondEmail = `m2-owner-b-${suffix}@example.test`;
const firstActor = Schema.decodeUnknownSync(AuthUserId)(firstUserId);
const secondActor = Schema.decodeUnknownSync(AuthUserId)(secondUserId);

let firstWorkspace: WorkspaceModel | undefined;
let secondWorkspace: WorkspaceModel | undefined;
let primaryProject: ProjectModel | undefined;

function required<A>(value: A | undefined, label: string): A {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  if (typeof failure === "object" && failure !== null && "_tag" in failure) {
    return typeof failure._tag === "string" ? failure._tag : undefined;
  }
  return undefined;
}

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: firstUserId,
      name: "M2 Owner A",
      email: firstEmail,
      emailVerified: true,
    },
    {
      id: secondUserId,
      name: "M2 Owner B",
      email: secondEmail,
      emailVerified: true,
    },
  ]);
});

afterAll(async () => {
  const actorCondition = or(
    eq(auditEvent.actorId, firstUserId),
    eq(auditEvent.actorId, secondUserId),
  );
  await db.delete(auditEvent).where(actorCondition);
  await db
    .delete(projectCapability)
    .where(
      or(
        eq(projectCapability.changedByUserId, firstUserId),
        eq(projectCapability.changedByUserId, secondUserId),
      ),
    );
  await db
    .delete(environment)
    .where(
      or(
        eq(environment.createdByUserId, firstUserId),
        eq(environment.createdByUserId, secondUserId),
      ),
    );
  await db
    .delete(projectMembership)
    .where(
      or(eq(projectMembership.userId, firstUserId), eq(projectMembership.userId, secondUserId)),
    );
  await db
    .delete(project)
    .where(or(eq(project.createdByUserId, firstUserId), eq(project.createdByUserId, secondUserId)));
  await db
    .delete(workspaceMembership)
    .where(
      or(eq(workspaceMembership.userId, firstUserId), eq(workspaceMembership.userId, secondUserId)),
    );
  await db
    .delete(workspace)
    .where(
      or(eq(workspace.createdByUserId, firstUserId), eq(workspace.createdByUserId, secondUserId)),
    );
  await db.delete(user).where(or(eq(user.id, firstUserId), eq(user.id, secondUserId)));
  await db.$client.end();
});

describe.sequential("platform repository PostgreSQL integration", () => {
  it.effect("atomically creates a workspace, owner membership, and safe audit events", () =>
    Effect.gen(function* () {
      firstWorkspace = yield* repository.createWorkspace(
        firstActor,
        yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Agency Workspace" }),
        "request-m2-workspace-a",
      );
      secondWorkspace = yield* repository.createWorkspace(
        secondActor,
        yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Client Workspace" }),
        "request-m2-workspace-b",
      );

      const created = required(firstWorkspace, "first workspace");
      const memberships = yield* Effect.promise(() =>
        db
          .select()
          .from(workspaceMembership)
          .where(eq(workspaceMembership.workspaceId, created.id)),
      );
      const audits = yield* Effect.promise(() =>
        db.select().from(auditEvent).where(eq(auditEvent.workspaceId, created.id)),
      );

      assert.strictEqual(created.role, "owner");
      assert.strictEqual(memberships.length, 1);
      assert.strictEqual(memberships[0]?.role, "owner");
      assert.deepEqual(audits.map((event) => event.action).sort(), [
        "workspace.created",
        "workspace.membership.created",
      ]);
      assert.isTrue(audits.every((event) => event.requestId === "request-m2-workspace-a"));
    }),
  );

  it.effect("rolls back workspace state when the final audit insert fails", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        repository.createWorkspace(
          firstActor,
          yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Rollback Workspace" }),
          "invalid request id",
        ),
      );
      const rows = yield* Effect.promise(() =>
        db.select().from(workspace).where(eq(workspace.name, "Rollback Workspace")),
      );

      assert.isTrue(Exit.isFailure(exit));
      assert.strictEqual(failureTag(exit), "DatabaseFailure");
      assert.strictEqual(rows.length, 0);
    }),
  );

  it.effect("lists only the actor's workspaces with bounded cursors", () =>
    Effect.gen(function* () {
      const additionalWorkspace = yield* repository.createWorkspace(
        firstActor,
        yield* Schema.decodeUnknown(CreateWorkspaceInput)({ name: "Second Agency Workspace" }),
        "request-m2-workspace-additional",
      );
      const firstPage = yield* repository.listWorkspaces(
        firstActor,
        yield* Schema.decodeUnknown(ListWorkspacesInput)({ cursor: null, limit: 1 }),
      );
      assert.isNotNull(firstPage.nextCursor);
      if (!firstPage.nextCursor) return;
      const secondPage = yield* repository.listWorkspaces(
        firstActor,
        yield* Schema.decodeUnknown(ListWorkspacesInput)({
          cursor: firstPage.nextCursor,
          limit: 1,
        }),
      );
      const foreignPage = yield* repository.listWorkspaces(
        secondActor,
        yield* Schema.decodeUnknown(ListWorkspacesInput)({ cursor: null, limit: 50 }),
      );

      assert.strictEqual(firstPage.items.length, 1);
      assert.strictEqual(firstPage.items[0]?.id, additionalWorkspace.id);
      assert.strictEqual(secondPage.items[0]?.id, required(firstWorkspace, "first workspace").id);
      assert.strictEqual(foreignPage.items.length, 1);
      assert.strictEqual(
        foreignPage.items[0]?.id,
        required(secondWorkspace, "second workspace").id,
      );
    }),
  );

  it.effect(
    "atomically creates a project, explicit owner membership, and primary environment",
    () =>
      Effect.gen(function* () {
        const ownerWorkspace = required(firstWorkspace, "first workspace");
        primaryProject = yield* repository.createProject(
          firstActor,
          yield* Schema.decodeUnknown(CreateProjectInput)({
            workspaceId: ownerWorkspace.id,
            name: "Marketing Site",
            key: "marketing-site",
            description: "secret=must-not-enter-audit",
          }),
          "request-m2-project-create",
        );

        const created = required(primaryProject, "primary project");
        const environments = yield* Effect.promise(() =>
          db.select().from(environment).where(eq(environment.projectId, created.id)),
        );
        const memberships = yield* Effect.promise(() =>
          db.select().from(projectMembership).where(eq(projectMembership.projectId, created.id)),
        );
        const audits = yield* Effect.promise(() =>
          db.select().from(auditEvent).where(eq(auditEvent.projectId, created.id)),
        );

        assert.strictEqual(created.environment.key, "main");
        assert.isTrue(created.environment.isPrimary);
        assert.strictEqual(created.capabilities[0]?.status, "disabled");
        assert.strictEqual(environments.length, 1);
        assert.strictEqual(memberships.length, 1);
        assert.strictEqual(memberships[0]?.userId, firstUserId);
        assert.strictEqual(memberships[0]?.role, "owner");
        assert.deepEqual(audits.map((event) => event.action).sort(), [
          "environment.created",
          "project.created",
          "project.membership.created",
        ]);
        assert.notInclude(JSON.stringify(audits), "must-not-enter-audit");
      }),
  );

  it.effect("rolls back project and environment when audit creation fails", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const exit = yield* Effect.exit(
        repository.createProject(
          firstActor,
          yield* Schema.decodeUnknown(CreateProjectInput)({
            workspaceId: ownerWorkspace.id,
            name: "Rollback Project",
            key: "rollback-project",
            description: null,
          }),
          "invalid request id",
        ),
      );
      const projects = yield* Effect.promise(() =>
        db
          .select()
          .from(project)
          .where(
            and(eq(project.workspaceId, ownerWorkspace.id), eq(project.key, "rollback-project")),
          ),
      );

      assert.isTrue(Exit.isFailure(exit));
      assert.strictEqual(projects.length, 0);
    }),
  );

  it.effect("enforces project-key uniqueness under concurrency but permits another workspace", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const input = yield* Schema.decodeUnknown(CreateProjectInput)({
        workspaceId: ownerWorkspace.id,
        name: "Concurrent Project",
        key: "concurrent-project",
        description: null,
      });
      const exits = yield* Effect.forEach(
        Array.from({ length: 8 }),
        (_, index) =>
          Effect.exit(
            repository.createProject(firstActor, input, `request-m2-concurrent-${index}`),
          ),
        { concurrency: 8 },
      );
      const sameKeyElsewhere = yield* repository.createProject(
        secondActor,
        yield* Schema.decodeUnknown(CreateProjectInput)({
          workspaceId: required(secondWorkspace, "second workspace").id,
          name: "Concurrent Project",
          key: "concurrent-project",
          description: null,
        }),
        "request-m2-cross-workspace",
      );

      assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        exits.filter((exit) => failureTag(exit) === "ProjectKeyConflictFailure").length,
        7,
      );
      assert.strictEqual(sameKeyElsewhere.key, "concurrent-project");
    }),
  );

  it.effect(
    "denies cross-tenant read, list, update, archive, and capability access without inference",
    () =>
      Effect.gen(function* () {
        const created = required(primaryProject, "primary project");
        const foreignWorkspace = required(firstWorkspace, "first workspace");
        const exits = yield* Effect.all([
          Effect.exit(
            repository.getProject(
              secondActor,
              yield* Schema.decodeUnknown(GetProjectInput)({ projectId: created.id }),
            ),
          ),
          Effect.exit(
            repository.listProjects(
              secondActor,
              yield* Schema.decodeUnknown(ListProjectsInput)({
                workspaceId: foreignWorkspace.id,
                status: "active",
                cursor: null,
                limit: 20,
              }),
            ),
          ),
          Effect.exit(
            repository.updateProject(
              secondActor,
              yield* Schema.decodeUnknown(UpdateProjectInput)({
                projectId: created.id,
                version: created.version,
                name: "Foreign Update",
                description: null,
              }),
              "request-m2-foreign-update",
            ),
          ),
          Effect.exit(
            repository.archiveProject(
              secondActor,
              yield* Schema.decodeUnknown(ArchiveProjectInput)({
                projectId: created.id,
                version: created.version,
              }),
              "request-m2-foreign-archive",
            ),
          ),
          Effect.exit(
            repository.enableCapability(
              secondActor,
              yield* Schema.decodeUnknown(EnableCapabilityInput)({
                projectId: created.id,
                capability: "cms",
              }),
              "request-m2-foreign-capability",
            ),
          ),
        ]);

        assert.isTrue(exits.every((exit) => failureTag(exit) === "NotFoundFailure"));
      }),
  );

  it.effect(
    "allows one optimistic update, rejects stale concurrency, and avoids no-op audit noise",
    () =>
      Effect.gen(function* () {
        const created = required(primaryProject, "primary project");
        const firstInput = yield* Schema.decodeUnknown(UpdateProjectInput)({
          projectId: created.id,
          version: created.version,
          name: "Updated Marketing Site",
          description: created.description,
        });
        const secondInput = yield* Schema.decodeUnknown(UpdateProjectInput)({
          projectId: created.id,
          version: created.version,
          name: "Competing Update",
          description: created.description,
        });
        const exits = yield* Effect.forEach(
          [firstInput, secondInput],
          (input, index) =>
            Effect.exit(repository.updateProject(firstActor, input, `request-m2-update-${index}`)),
          { concurrency: 2 },
        );
        const winner = exits.find(Exit.isSuccess);
        assert.isDefined(winner);
        if (!winner || Exit.isFailure(winner)) return;
        primaryProject = winner.value;

        const beforeAudits = yield* Effect.promise(() =>
          db
            .select({ id: auditEvent.id })
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.projectId, winner.value.id),
                eq(auditEvent.action, "project.updated"),
              ),
            ),
        );
        const noOp = yield* repository.updateProject(
          firstActor,
          yield* Schema.decodeUnknown(UpdateProjectInput)({
            projectId: winner.value.id,
            version: winner.value.version,
            name: winner.value.name,
            description: winner.value.description,
          }),
          "request-m2-noop",
        );
        const afterAudits = yield* Effect.promise(() =>
          db
            .select({ id: auditEvent.id })
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.projectId, winner.value.id),
                eq(auditEvent.action, "project.updated"),
              ),
            ),
        );

        assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
        assert.strictEqual(
          exits.filter((exit) => failureTag(exit) === "VersionConflictFailure").length,
          1,
        );
        assert.strictEqual(noOp.version, winner.value.version);
        assert.strictEqual(afterAudits.length, beforeAudits.length);
      }),
  );

  it.effect("enables CMS exactly once under concurrency and records one audit event", () =>
    Effect.gen(function* () {
      const created = required(primaryProject, "primary project");
      const input = yield* Schema.decodeUnknown(EnableCapabilityInput)({
        projectId: created.id,
        capability: "cms",
      });
      const exits = yield* Effect.forEach(
        ["a", "b", "c"],
        (suffixValue) =>
          Effect.exit(
            repository.enableCapability(firstActor, input, `request-m2-capability-${suffixValue}`),
          ),
        { concurrency: 3 },
      );
      const rows = yield* Effect.promise(() =>
        db.select().from(projectCapability).where(eq(projectCapability.projectId, created.id)),
      );
      const audits = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.projectId, created.id),
              eq(auditEvent.action, "project.capability.enabled"),
            ),
          ),
      );

      assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
      assert.strictEqual(
        exits.filter((exit) => failureTag(exit) === "InvalidStateTransitionFailure").length,
        2,
      );
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(audits.length, 1);
    }),
  );

  it.effect("paginates active projects without duplicate records", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const firstPage = yield* repository.listProjects(
        firstActor,
        yield* Schema.decodeUnknown(ListProjectsInput)({
          workspaceId: ownerWorkspace.id,
          status: "active",
          cursor: null,
          limit: 1,
        }),
      );
      assert.isNotNull(firstPage.nextCursor);
      if (!firstPage.nextCursor) return;
      const secondPage = yield* repository.listProjects(
        firstActor,
        yield* Schema.decodeUnknown(ListProjectsInput)({
          workspaceId: ownerWorkspace.id,
          status: "active",
          cursor: firstPage.nextCursor,
          limit: 1,
        }),
      );
      const ids = [...firstPage.items, ...secondPage.items].map((item) => item.id);

      assert.strictEqual(new Set(ids).size, ids.length);
    }),
  );

  it.effect("archives without cascading state and permanently reserves the project key", () =>
    Effect.gen(function* () {
      const current = required(primaryProject, "primary project");
      const archived = yield* repository.archiveProject(
        firstActor,
        yield* Schema.decodeUnknown(ArchiveProjectInput)({
          projectId: current.id,
          version: current.version,
        }),
        "request-m2-archive",
      );
      primaryProject = archived;
      const environments = yield* Effect.promise(() =>
        db.select().from(environment).where(eq(environment.projectId, archived.id)),
      );
      const capabilities = yield* Effect.promise(() =>
        db.select().from(projectCapability).where(eq(projectCapability.projectId, archived.id)),
      );
      const duplicate = yield* Effect.exit(
        repository.createProject(
          firstActor,
          yield* Schema.decodeUnknown(CreateProjectInput)({
            workspaceId: archived.workspaceId,
            name: "Replacement",
            key: archived.key,
            description: null,
          }),
          "request-m2-reuse-key",
        ),
      );
      const repeatedArchive = yield* Effect.exit(
        repository.archiveProject(
          firstActor,
          yield* Schema.decodeUnknown(ArchiveProjectInput)({
            projectId: archived.id,
            version: archived.version,
          }),
          "request-m2-repeat-archive",
        ),
      );

      assert.isNotNull(archived.archivedAt);
      assert.strictEqual(environments.length, 1);
      assert.strictEqual(capabilities.length, 1);
      assert.strictEqual(failureTag(duplicate), "ProjectKeyConflictFailure");
      assert.strictEqual(failureTag(repeatedArchive), "InvalidStateTransitionFailure");
    }),
  );

  it.effect("enforces composite tenant foreign keys", () =>
    Effect.gen(function* () {
      const archived = required(primaryProject, "primary project");
      const foreignWorkspace = required(secondWorkspace, "second workspace");
      const rejected = yield* Effect.tryPromise({
        try: () =>
          db
            .insert(environment)
            .values({
              workspaceId: foreignWorkspace.id,
              projectId: archived.id,
              key: "preview",
              name: "preview",
              isPrimary: false,
              createdByUserId: secondUserId,
            })
            .then(
              () => false,
              () => true,
            ),
        catch: () => false,
      });

      assert.isTrue(rejected);
    }),
  );

  it.effect("uses the intended active and archived project list indexes", () =>
    Effect.gen(function* () {
      const ownerWorkspace = required(firstWorkspace, "first workspace");
      const plans = yield* Effect.promise(() =>
        db.transaction(async (transaction) => {
          await transaction.execute(sql`set local enable_seqscan = off`);
          const active = await transaction.execute(
            sql`explain (format json) select id from project where workspace_id = ${ownerWorkspace.id} and archived_at is null order by created_at desc, id desc limit 20`,
          );
          const archived = await transaction.execute(
            sql`explain (format json) select id from project where workspace_id = ${ownerWorkspace.id} and archived_at is not null order by archived_at desc, id desc limit 20`,
          );
          return JSON.stringify([active.rows, archived.rows]);
        }),
      );

      assert.include(plans, "project_workspace_active_created_id_idx");
      assert.include(plans, "project_workspace_archived_at_id_idx");
    }),
  );
});
