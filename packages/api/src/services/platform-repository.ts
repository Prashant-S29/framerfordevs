import { db } from "@framerfordevs/db";
import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "@framerfordevs/db/query";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  decodeProjectCursor,
  decodeWorkspaceCursor,
  encodeProjectCursor,
  encodeWorkspaceCursor,
} from "../contracts/cursor";
import {
  DatabaseFailure,
  InvalidStateTransitionFailure,
  NotFoundFailure,
  ProjectKeyConflictFailure,
  VersionConflictFailure,
} from "../contracts/errors";
import {
  type ArchiveProjectInput,
  type AuthUserId,
  Capability,
  type CreateProjectInput,
  type CreateWorkspaceInput,
  type EnableCapabilityInput,
  type GetProjectInput,
  type ListProjectsInput,
  type ListWorkspacesInput,
  Project,
  ProjectId,
  ProjectPage,
  ProjectSummary,
  type UpdateProjectInput,
  Workspace,
  WorkspaceMembershipId,
  WorkspacePage,
} from "../contracts/platform";

const mainEnvironment: {
  readonly key: "main";
  readonly name: "main";
  readonly isPrimary: true;
} = {
  key: "main",
  name: "main",
  isPrimary: true,
};

function outcome<K extends string>(kind: K): { readonly kind: K } {
  return { kind };
}

function outcomeWith<K extends string, A extends object>(
  kind: K,
  value: A,
): { readonly kind: K } & A {
  return { kind, ...value };
}

type PlatformDb = typeof db;
type PlatformTransaction = Parameters<Parameters<PlatformDb["transaction"]>[0]>[0];
type PlatformExecutor = PlatformDb | PlatformTransaction;

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function hasConstraint(cause: unknown, constraint: string, depth = 0): boolean {
  if (depth > 3 || typeof cause !== "object" || cause === null) return false;
  if (
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === constraint
  ) {
    return true;
  }
  return "cause" in cause && hasConstraint(cause.cause, constraint, depth + 1);
}

function decodeDatabaseValue<A, I>(
  operation: string,
  schema: Schema.Schema<A, I, never>,
  value: unknown,
) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause) => databaseFailure(`${operation}.decode`, cause)),
  );
}

function toIso(value: Date): string {
  return value.toISOString();
}

function projectSummaryValue(row: typeof project.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    key: row.key,
    description: row.description,
    version: row.version,
    archivedAt: row.archivedAt ? toIso(row.archivedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

async function selectAuthorizedProject(
  executor: PlatformExecutor,
  actorId: AuthUserId,
  projectId: string,
) {
  const [row] = await executor
    .select({ project })
    .from(project)
    .innerJoin(
      workspaceMembership,
      and(
        eq(workspaceMembership.workspaceId, project.workspaceId),
        eq(workspaceMembership.userId, actorId),
        eq(workspaceMembership.role, "owner"),
      ),
    )
    .where(eq(project.id, projectId))
    .limit(1);
  return row?.project;
}

async function selectProjectDetail(
  executor: PlatformExecutor,
  actorId: AuthUserId,
  projectId: string,
) {
  const projectRow = await selectAuthorizedProject(executor, actorId, projectId);
  if (!projectRow) return undefined;

  const [environmentRows, capabilityRows] = await Promise.all([
    executor
      .select()
      .from(environment)
      .where(
        and(
          eq(environment.workspaceId, projectRow.workspaceId),
          eq(environment.projectId, projectRow.id),
          eq(environment.key, "main"),
          eq(environment.isPrimary, true),
        ),
      )
      .limit(1),
    executor
      .select()
      .from(projectCapability)
      .where(
        and(
          eq(projectCapability.workspaceId, projectRow.workspaceId),
          eq(projectCapability.projectId, projectRow.id),
          eq(projectCapability.key, "cms"),
        ),
      )
      .limit(1),
  ]);

  const environmentRow = environmentRows[0];
  if (!environmentRow) {
    throw new Error("Project is missing its primary environment.");
  }

  const capabilityRow = capabilityRows[0];
  return {
    ...projectSummaryValue(projectRow),
    environment: {
      id: environmentRow.id,
      key: "main",
      name: "main",
      isPrimary: true,
      createdAt: toIso(environmentRow.createdAt),
    },
    capabilities: [
      capabilityRow
        ? {
            id: capabilityRow.id,
            key: "cms",
            status: capabilityRow.status,
            version: capabilityRow.version,
            changedAt: toIso(capabilityRow.updatedAt),
          }
        : {
            id: null,
            key: "cms",
            status: "disabled",
            version: null,
            changedAt: null,
          },
    ],
  };
}

function makeAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly environmentId?: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
}) {
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    actorType: "user",
    actorId: options.actorId,
    action: options.action,
    resourceType: options.resourceType,
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

interface RepositoryOptions {
  readonly database?: PlatformDb;
}

export function makePlatformRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;

  return {
    createWorkspace: Effect.fn("PlatformRepository.createWorkspace")(function* (
      actorId: AuthUserId,
      input: CreateWorkspaceInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [workspaceRow] = await transaction
              .insert(workspace)
              .values({ name: input.name, createdByUserId: actorId })
              .returning();
            if (!workspaceRow) throw new Error("Workspace insert returned no row.");

            const [membershipRow] = await transaction
              .insert(workspaceMembership)
              .values({ workspaceId: workspaceRow.id, userId: actorId, role: "owner" })
              .returning();
            if (!membershipRow) throw new Error("Membership insert returned no row.");

            await transaction.insert(auditEvent).values([
              makeAuditValues({
                workspaceId: workspaceRow.id,
                actorId,
                action: "workspace.created",
                resourceType: "workspace",
                resourceId: workspaceRow.id,
                requestId,
              }),
              makeAuditValues({
                workspaceId: workspaceRow.id,
                actorId,
                action: "workspace.membership.created",
                resourceType: "workspace_membership",
                resourceId: membershipRow.id,
                requestId,
              }),
            ]);

            return {
              id: workspaceRow.id,
              name: workspaceRow.name,
              version: workspaceRow.version,
              role: "owner",
              createdAt: toIso(workspaceRow.createdAt),
              updatedAt: toIso(workspaceRow.updatedAt),
            };
          }),
        catch: (cause) => databaseFailure("platform.workspace.create", cause),
      });

      return yield* decodeDatabaseValue("platform.workspace.create", Workspace, result);
    }),

    listWorkspaces: Effect.fn("PlatformRepository.listWorkspaces")(function* (
      actorId: AuthUserId,
      input: ListWorkspacesInput,
    ) {
      const cursor = input.cursor ? yield* decodeWorkspaceCursor(input.cursor) : null;
      const rows = yield* Effect.tryPromise({
        try: () => {
          const cursorCondition = cursor
            ? or(
                lt(workspaceMembership.createdAt, new Date(cursor.createdAt)),
                and(
                  eq(workspaceMembership.createdAt, new Date(cursor.createdAt)),
                  lt(workspaceMembership.id, cursor.membershipId),
                ),
              )
            : undefined;

          return database
            .select({ workspace, membership: workspaceMembership })
            .from(workspaceMembership)
            .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
            .where(
              and(
                eq(workspaceMembership.userId, actorId),
                eq(workspaceMembership.role, "owner"),
                cursorCondition,
              ),
            )
            .orderBy(desc(workspaceMembership.createdAt), desc(workspaceMembership.id))
            .limit(input.limit + 1);
        },
        catch: (cause) => databaseFailure("platform.workspace.list", cause),
      });

      const hasNextPage = rows.length > input.limit;
      const visibleRows = rows.slice(0, input.limit);
      const items = yield* Effect.forEach(visibleRows, (row) =>
        decodeDatabaseValue("platform.workspace.list", Workspace, {
          id: row.workspace.id,
          name: row.workspace.name,
          version: row.workspace.version,
          role: "owner",
          createdAt: toIso(row.workspace.createdAt),
          updatedAt: toIso(row.workspace.updatedAt),
        }),
      );
      const last = visibleRows.at(-1);
      const nextCursor =
        hasNextPage && last
          ? yield* encodeWorkspaceCursor({
              createdAt: toIso(last.membership.createdAt),
              membershipId: yield* decodeDatabaseValue(
                "platform.workspace.list",
                WorkspaceMembershipId,
                last.membership.id,
              ),
            })
          : null;

      return WorkspacePage.make({ items, nextCursor });
    }),

    createProject: Effect.fn("PlatformRepository.createProject")(function* (
      actorId: AuthUserId,
      input: CreateProjectInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [owner] = await transaction
              .select({ id: workspaceMembership.id })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, input.workspaceId),
                  eq(workspaceMembership.userId, actorId),
                  eq(workspaceMembership.role, "owner"),
                ),
              )
              .limit(1);
            if (!owner) return outcome("not_found");

            const [projectRow] = await transaction
              .insert(project)
              .values({
                workspaceId: input.workspaceId,
                name: input.name,
                key: input.key,
                description: input.description,
                createdByUserId: actorId,
              })
              .returning();
            if (!projectRow) throw new Error("Project insert returned no row.");

            const [environmentRow] = await transaction
              .insert(environment)
              .values({
                workspaceId: input.workspaceId,
                projectId: projectRow.id,
                ...mainEnvironment,
                createdByUserId: actorId,
              })
              .returning();
            if (!environmentRow) throw new Error("Environment insert returned no row.");

            await transaction.insert(auditEvent).values([
              makeAuditValues({
                workspaceId: input.workspaceId,
                projectId: projectRow.id,
                actorId,
                action: "project.created",
                resourceType: "project",
                resourceId: projectRow.id,
                requestId,
              }),
              makeAuditValues({
                workspaceId: input.workspaceId,
                projectId: projectRow.id,
                environmentId: environmentRow.id,
                actorId,
                action: "environment.created",
                resourceType: "environment",
                resourceId: environmentRow.id,
                requestId,
              }),
            ]);

            const detail = await selectProjectDetail(transaction, actorId, projectRow.id);
            if (!detail) throw new Error("Created project could not be loaded.");
            return outcomeWith("success", { detail });
          }),
        catch: (cause) =>
          hasConstraint(cause, "project_workspace_key_unique")
            ? ProjectKeyConflictFailure.make()
            : databaseFailure("platform.project.create", cause),
      });

      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "workspace" });
      }
      return yield* decodeDatabaseValue("platform.project.create", Project, result.detail);
    }),

    listProjects: Effect.fn("PlatformRepository.listProjects")(function* (
      actorId: AuthUserId,
      input: ListProjectsInput,
    ) {
      const cursor = input.cursor ? yield* decodeProjectCursor(input.cursor, input.status) : null;
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [owner] = await transaction
              .select({ id: workspaceMembership.id })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, input.workspaceId),
                  eq(workspaceMembership.userId, actorId),
                  eq(workspaceMembership.role, "owner"),
                ),
              )
              .limit(1);
            if (!owner) return outcomeWith("not_found", { rows: [] });

            const sortColumn = input.status === "active" ? project.createdAt : project.archivedAt;
            const archiveCondition =
              input.status === "active"
                ? isNull(project.archivedAt)
                : isNotNull(project.archivedAt);
            const cursorCondition = cursor
              ? or(
                  lt(sortColumn, new Date(cursor.sortAt)),
                  and(eq(sortColumn, new Date(cursor.sortAt)), lt(project.id, cursor.projectId)),
                )
              : undefined;
            const rows = await transaction
              .select()
              .from(project)
              .where(
                and(eq(project.workspaceId, input.workspaceId), archiveCondition, cursorCondition),
              )
              .orderBy(desc(sortColumn), desc(project.id))
              .limit(input.limit + 1);
            return outcomeWith("success", { rows });
          }),
        catch: (cause) => databaseFailure("platform.project.list", cause),
      });

      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "workspace" });
      }

      const hasNextPage = result.rows.length > input.limit;
      const visibleRows = result.rows.slice(0, input.limit);
      const items = yield* Effect.forEach(visibleRows, (row) =>
        decodeDatabaseValue("platform.project.list", ProjectSummary, projectSummaryValue(row)),
      );
      const last = visibleRows.at(-1);
      const lastSortAt = last
        ? input.status === "active"
          ? last.createdAt
          : last.archivedAt
        : null;
      const nextCursor =
        hasNextPage && last && lastSortAt
          ? yield* encodeProjectCursor({
              status: input.status,
              sortAt: toIso(lastSortAt),
              projectId: yield* decodeDatabaseValue("platform.project.list", ProjectId, last.id),
            })
          : null;

      return ProjectPage.make({ items, nextCursor });
    }),

    getProject: Effect.fn("PlatformRepository.getProject")(function* (
      actorId: AuthUserId,
      input: GetProjectInput,
    ) {
      const detail = yield* Effect.tryPromise({
        try: () =>
          database.transaction((transaction) =>
            selectProjectDetail(transaction, actorId, input.projectId),
          ),
        catch: (cause) => databaseFailure("platform.project.get", cause),
      });
      if (!detail) return yield* NotFoundFailure.make({ resource: "project" });
      return yield* decodeDatabaseValue("platform.project.get", Project, detail);
    }),

    updateProject: Effect.fn("PlatformRepository.updateProject")(function* (
      actorId: AuthUserId,
      input: UpdateProjectInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const current = await selectAuthorizedProject(transaction, actorId, input.projectId);
            if (!current) return outcome("not_found");
            if (current.archivedAt) return outcome("invalid_state");
            if (current.version !== input.version) return outcome("version_conflict");

            const isUnchanged =
              current.name === input.name && current.description === input.description;
            if (isUnchanged) {
              const detail = await selectProjectDetail(transaction, actorId, input.projectId);
              if (!detail) throw new Error("Project disappeared during update.");
              return outcomeWith("success", { detail });
            }

            const [updated] = await transaction
              .update(project)
              .set({
                name: input.name,
                description: input.description,
                version: sql`${project.version} + 1`,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(project.id, input.projectId),
                  eq(project.workspaceId, current.workspaceId),
                  eq(project.version, input.version),
                  isNull(project.archivedAt),
                ),
              )
              .returning({ id: project.id });
            if (!updated) return outcome("version_conflict");

            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.workspaceId,
                projectId: current.id,
                actorId,
                action: "project.updated",
                resourceType: "project",
                resourceId: current.id,
                requestId,
              }),
            );
            const detail = await selectProjectDetail(transaction, actorId, input.projectId);
            if (!detail) throw new Error("Updated project could not be loaded.");
            return outcomeWith("success", { detail });
          }),
        catch: (cause) => databaseFailure("platform.project.update", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "success":
          return yield* decodeDatabaseValue("platform.project.update", Project, result.detail);
      }
    }),

    archiveProject: Effect.fn("PlatformRepository.archiveProject")(function* (
      actorId: AuthUserId,
      input: ArchiveProjectInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const current = await selectAuthorizedProject(transaction, actorId, input.projectId);
            if (!current) return outcome("not_found");
            if (current.archivedAt) return outcome("invalid_state");
            if (current.version !== input.version) return outcome("version_conflict");

            const archivedAt = new Date();
            const [archived] = await transaction
              .update(project)
              .set({
                archivedAt,
                archivedByUserId: actorId,
                version: sql`${project.version} + 1`,
                updatedAt: archivedAt,
              })
              .where(
                and(
                  eq(project.id, input.projectId),
                  eq(project.workspaceId, current.workspaceId),
                  eq(project.version, input.version),
                  isNull(project.archivedAt),
                ),
              )
              .returning({ id: project.id });
            if (!archived) return outcome("version_conflict");

            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.workspaceId,
                projectId: current.id,
                actorId,
                action: "project.archived",
                resourceType: "project",
                resourceId: current.id,
                requestId,
              }),
            );
            const detail = await selectProjectDetail(transaction, actorId, input.projectId);
            if (!detail) throw new Error("Archived project could not be loaded.");
            return outcomeWith("success", { detail });
          }),
        catch: (cause) => databaseFailure("platform.project.archive", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "success":
          return yield* decodeDatabaseValue("platform.project.archive", Project, result.detail);
      }
    }),

    enableCapability: Effect.fn("PlatformRepository.enableCapability")(function* (
      actorId: AuthUserId,
      input: EnableCapabilityInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const current = await selectAuthorizedProject(transaction, actorId, input.projectId);
            if (!current) return outcome("not_found");
            if (current.archivedAt) return outcome("invalid_state");

            const [capabilityRow] = await transaction
              .insert(projectCapability)
              .values({
                workspaceId: current.workspaceId,
                projectId: current.id,
                key: input.capability,
                status: "enabled",
                changedByUserId: actorId,
              })
              .returning();
            if (!capabilityRow) throw new Error("Capability insert returned no row.");

            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.workspaceId,
                projectId: current.id,
                actorId,
                action: "project.capability.enabled",
                resourceType: "project_capability",
                resourceId: capabilityRow.id,
                requestId,
              }),
            );
            return outcomeWith("success", { capabilityRow });
          }),
        catch: (cause) =>
          hasConstraint(cause, "project_capability_project_key_unique")
            ? InvalidStateTransitionFailure.make()
            : databaseFailure("platform.project.capability.enable", cause),
      });

      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "project" });
      }
      if (result.kind === "invalid_state") {
        return yield* InvalidStateTransitionFailure.make();
      }
      return yield* decodeDatabaseValue("platform.project.capability.enable", Capability, {
        id: result.capabilityRow.id,
        key: "cms",
        status: result.capabilityRow.status,
        version: result.capabilityRow.version,
        changedAt: toIso(result.capabilityRow.updatedAt),
      });
    }),
  };
}

export class PlatformRepository extends Context.Tag("PlatformRepository")<
  PlatformRepository,
  ReturnType<typeof makePlatformRepository>
>() {}

export const PlatformRepositoryLive = Layer.succeed(PlatformRepository, makePlatformRepository());
