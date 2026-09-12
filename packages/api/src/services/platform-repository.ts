import { db } from "@framerfordevs/db";
import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { studioRegistration as studioRegistrationTable } from "@framerfordevs/db/schema/control-plane";
import { projectLocale } from "@framerfordevs/db/schema/locale";
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
import type { ProjectPermissionAction } from "../contracts/access";
import {
  ControlPlaneCommandConflictFailure,
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  NotFoundFailure,
  ProjectKeyConflictFailure,
  VersionConflictFailure,
} from "../contracts/response/errors";
import {
  type ControlPlaneActor,
  type ControlPlaneCommandId,
  type ControlPlaneCreateProjectRequest,
  ControlPlaneCreateProjectResult,
  type ControlPlaneCreateWorkspaceRequest,
  ControlPlaneCreateWorkspaceResult,
  ControlPlaneEnableCapabilityResult,
  ControlPlaneProject,
  type ControlPlaneProjectAction,
  type ControlPlaneUpdateProjectRequest,
  ControlPlanePutStudioRegistrationResult,
  type ControlPlanePutStudioRegistrationRequest,
  ControlPlaneWorkspace,
  StudioRegistration,
} from "../contracts/control-plane";
import {
  type ArchiveProjectInput,
  type AuthUserId,
  Capability,
  type CreateProjectInput,
  type CreateWorkspaceInput,
  type EnableCapabilityInput,
  EnvironmentId,
  type GetProjectInput,
  type ListProjectsInput,
  type ListWorkspacesInput,
  Project,
  ProjectId,
  ProjectPage,
  ProjectSummary,
  type RestoreProjectInput,
  type UpdateProjectInput,
  Workspace,
  WorkspaceId,
  WorkspaceMembershipId,
  WorkspacePage,
} from "../contracts/platform";
import {
  controlPlaneActorReferences,
  controlPlaneCommandFingerprint,
} from "../lib/control-plane/command-fingerprint";
import {
  authorizeControlPlaneProject,
  controlPlaneProjectPolicyAction,
} from "./control-plane/authorization";
import {
  inspectControlPlaneCreateReceipt,
  inspectControlPlaneReceipt,
  persistControlPlaneReceipt,
  type ControlPlaneCreateReceiptExpectation,
  type ControlPlaneReceiptExpectation,
} from "./control-plane/command-receipt";
import { decideCredentialPolicy, decideUserPolicy } from "./policy";
import { authorizeUserProject, type UserProjectAccess } from "./project-access";

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

async function loadProjectDetail(
  executor: PlatformExecutor,
  projectRow: typeof project.$inferSelect,
) {
  const environmentRows = await executor
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
    .limit(1);
  const capabilityRows = await executor
    .select()
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, projectRow.workspaceId),
        eq(projectCapability.projectId, projectRow.id),
        eq(projectCapability.key, "cms"),
      ),
    )
    .limit(1);

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

const controlPlaneProjectActions: ReadonlyArray<ControlPlaneProjectAction> = [
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.capability.manage",
  "studio_registration.read",
  "studio_registration.write",
];

function controlPlaneEffectiveActions(
  actor: ControlPlaneActor,
  access: UserProjectAccess,
): ReadonlyArray<ControlPlaneProjectAction> {
  return controlPlaneProjectActions.filter((action) => {
    const archived = access.project.archivedAt !== null;
    if (archived) {
      if (
        action === "project.update" ||
        action === "project.archive" ||
        action === "project.capability.manage" ||
        action === "studio_registration.write"
      ) {
        return false;
      }
    } else if (action === "project.restore") {
      return false;
    }
    const policyAction = controlPlaneProjectPolicyAction(action);
    if (actor.kind === "user") {
      return decideUserPolicy({
        action: policyAction,
        role: access.role,
        subjectWorkspaceId: access.project.workspaceId,
        subjectProjectId: access.project.id,
        workspaceId: access.project.workspaceId,
        projectId: access.project.id,
        localeAccessMode: access.localeAccessMode,
        allowedLocaleIds: access.allowedLocaleIds,
        requestedLocaleId: null,
        isActive: true,
      }).allowed;
    }
    const credential = access.credentialAuthority;
    if (!credential) return false;
    return decideCredentialPolicy({
      action: policyAction,
      family: credential.family,
      scopes: credential.scopes,
      subjectWorkspaceId: access.project.workspaceId,
      subjectProjectId: access.project.id,
      subjectEnvironmentId: credential.environmentId,
      workspaceId: access.project.workspaceId,
      projectId: access.project.id,
      environmentId: credential.environmentId,
      isActive: true,
    }).allowed;
  });
}

async function loadControlPlaneProjectDetail(
  executor: PlatformExecutor,
  actor: ControlPlaneActor,
  access: UserProjectAccess,
) {
  const detail = await loadProjectDetail(executor, access.project);
  return {
    id: detail.id,
    workspaceId: detail.workspaceId,
    name: detail.name,
    key: detail.key,
    description: detail.description,
    version: detail.version,
    status: detail.archivedAt === null ? "active" : "archived",
    archivedAt: detail.archivedAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    primaryEnvironment: detail.environment,
    capabilities: detail.capabilities,
    effectiveActions: controlPlaneEffectiveActions(actor, access),
  };
}

function controlPlaneWorkspaceValue(workspaceRow: typeof workspace.$inferSelect, role: string) {
  return {
    id: workspaceRow.id,
    name: workspaceRow.name,
    version: workspaceRow.version,
    role,
    createdAt: toIso(workspaceRow.createdAt),
    updatedAt: toIso(workspaceRow.updatedAt),
  };
}

async function selectProjectDetail(
  executor: PlatformExecutor,
  actorId: AuthUserId,
  projectId: string,
  action: ProjectPermissionAction,
) {
  const authorization = await authorizeUserProject(executor, actorId, projectId, action);
  if (authorization.kind === "not_found") return outcome("not_found");
  if (authorization.kind === "forbidden") return outcome("forbidden");
  const detail = await loadProjectDetail(executor, authorization.access.project);
  return outcomeWith("success", { detail });
}

function studioRegistrationValue(row: typeof studioRegistrationTable.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    applicationOrigin: row.applicationOrigin,
    mountPath: row.mountPath,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
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

function makeControlPlaneAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly actor: ControlPlaneActor;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
}) {
  const actor = controlPlaneActorReferences(options.actor);
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    actorType: actor.actorType,
    actorId: actor.actorId,
    action: options.action,
    resourceType: options.resourceType,
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

export interface ControlPlaneListPosition {
  readonly finalSortAtEpochMs: number;
  readonly finalId: string;
}

export interface ControlPlaneListResult<A> {
  readonly items: ReadonlyArray<A>;
  readonly nextPosition: ControlPlaneListPosition | null;
}

interface RepositoryOptions {
  readonly database?: PlatformDb;
}

export function makePlatformRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;

  return {
    createControlPlaneWorkspace: Effect.fn("PlatformRepository.createControlPlaneWorkspace")(
      function* (
        actor: ControlPlaneActor,
        input: ControlPlaneCreateWorkspaceRequest,
        requestId: string,
      ) {
        if (actor.kind !== "user") return yield* ForbiddenFailure.make();
        const result = yield* Effect.tryPromise({
          try: () =>
            database.transaction(async (transaction) => {
              const fingerprint = controlPlaneCommandFingerprint({
                operation: "workspace.create",
                actor,
                scope: { workspaceId: null, projectId: null, environmentId: null },
                input: { name: input.name },
              });
              const createExpectation: ControlPlaneCreateReceiptExpectation = {
                commandId: input.commandId,
                operation: "workspace.create",
                actor,
                fingerprint,
                workspaceId: null,
              };
              const receipt = await inspectControlPlaneCreateReceipt(
                transaction,
                createExpectation,
              );
              if (receipt.kind === "conflict") return outcome("command_conflict");
              if (receipt.kind === "replay") {
                const [row] = await transaction
                  .select({ workspace, membership: workspaceMembership })
                  .from(workspaceMembership)
                  .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
                  .where(
                    and(
                      eq(workspace.id, receipt.resourceId),
                      eq(workspaceMembership.userId, actor.id),
                      isNull(workspaceMembership.revokedAt),
                    ),
                  )
                  .limit(1);
                return row
                  ? outcomeWith("success", {
                      workspace: row.workspace,
                      role: row.membership.role,
                      replayed: true,
                    })
                  : outcome("not_found");
              }

              const now = new Date();
              const [workspaceRow] = await transaction
                .insert(workspace)
                .values({
                  name: input.name,
                  createdByUserId: actor.id,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              if (!workspaceRow) throw new Error("Workspace insert returned no row.");
              const [membershipRow] = await transaction
                .insert(workspaceMembership)
                .values({
                  workspaceId: workspaceRow.id,
                  userId: actor.id,
                  role: "owner",
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              if (!membershipRow) throw new Error("Membership insert returned no row.");
              await transaction.insert(auditEvent).values([
                makeAuditValues({
                  workspaceId: workspaceRow.id,
                  actorId: actor.id,
                  action: "workspace.created",
                  resourceType: "workspace",
                  resourceId: workspaceRow.id,
                  requestId,
                }),
                makeAuditValues({
                  workspaceId: workspaceRow.id,
                  actorId: actor.id,
                  action: "workspace.membership.created",
                  resourceType: "workspace_membership",
                  resourceId: membershipRow.id,
                  requestId,
                }),
              ]);
              await persistControlPlaneReceipt(
                transaction,
                {
                  commandId: input.commandId,
                  operation: "workspace.create",
                  actor,
                  fingerprint,
                  workspaceId: WorkspaceId.make(workspaceRow.id),
                  projectId: null,
                  environmentId: null,
                },
                {
                  resourceType: "workspace",
                  resourceId: workspaceRow.id,
                  disposition: "created",
                },
                now,
              );
              return outcomeWith("success", {
                workspace: workspaceRow,
                role: "owner",
                replayed: false,
              });
            }),
          catch: (cause) => databaseFailure("platform.control-plane.workspace.create", cause),
        });
        if (result.kind === "not_found") {
          return yield* NotFoundFailure.make({ resource: "workspace" });
        }
        if (result.kind === "command_conflict") {
          return yield* ControlPlaneCommandConflictFailure.make();
        }
        const workspaceModel = yield* decodeDatabaseValue(
          "platform.control-plane.workspace.create",
          ControlPlaneWorkspace,
          controlPlaneWorkspaceValue(result.workspace, result.role),
        );
        return ControlPlaneCreateWorkspaceResult.make({
          workspace: workspaceModel,
          replayed: result.replayed,
        });
      },
    ),

    createControlPlaneProject: Effect.fn("PlatformRepository.createControlPlaneProject")(function* (
      actor: ControlPlaneActor,
      workspaceId: WorkspaceId,
      input: ControlPlaneCreateProjectRequest,
      requestId: string,
    ) {
      if (actor.kind !== "user") return yield* ForbiddenFailure.make();
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [owner] = await transaction
              .select({ id: workspaceMembership.id })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, workspaceId),
                  eq(workspaceMembership.userId, actor.id),
                  eq(workspaceMembership.role, "owner"),
                  isNull(workspaceMembership.revokedAt),
                ),
              )
              .limit(1);
            if (!owner) return outcome("not_found");
            const fingerprint = controlPlaneCommandFingerprint({
              operation: "project.create",
              actor,
              scope: { workspaceId, projectId: null, environmentId: null },
              input: {
                name: input.name,
                key: input.key,
                description: input.description,
                initialCapabilities: input.initialCapabilities,
              },
            });
            const receipt = await inspectControlPlaneCreateReceipt(transaction, {
              commandId: input.commandId,
              operation: "project.create",
              actor,
              fingerprint,
              workspaceId,
            });
            if (receipt.kind === "conflict") return outcome("command_conflict");
            if (receipt.kind === "replay") {
              if (receipt.projectId === null) return outcome("command_conflict");
              const authorization = await authorizeControlPlaneProject(
                transaction,
                actor,
                receipt.projectId,
                "project.read",
              );
              if (authorization.kind !== "allowed") return outcome("not_found");
              return outcomeWith("success", {
                detail: await loadControlPlaneProjectDetail(
                  transaction,
                  actor,
                  authorization.access,
                ),
                replayed: true,
              });
            }

            const now = new Date();
            const [projectRow] = await transaction
              .insert(project)
              .values({
                workspaceId,
                name: input.name,
                key: input.key,
                description: input.description,
                createdByUserId: actor.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!projectRow) throw new Error("Project insert returned no row.");
            const [membershipRow] = await transaction
              .insert(projectMembership)
              .values({
                workspaceId,
                projectId: projectRow.id,
                userId: actor.id,
                role: "owner",
                createdByUserId: actor.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning({ id: projectMembership.id });
            if (!membershipRow) throw new Error("Project membership insert returned no row.");
            const [environmentRow] = await transaction
              .insert(environment)
              .values({
                workspaceId,
                projectId: projectRow.id,
                ...mainEnvironment,
                createdByUserId: actor.id,
                createdAt: now,
              })
              .returning();
            if (!environmentRow) throw new Error("Environment insert returned no row.");
            const [localeRow] = await transaction
              .insert(projectLocale)
              .values({
                workspaceId,
                projectId: projectRow.id,
                tag: "en",
                displayName: "English",
                status: "enabled",
                position: 0,
                createdByUserId: actor.id,
                changedByUserId: actor.id,
                createdAt: now,
                updatedAt: now,
              })
              .returning({ id: projectLocale.id });
            if (!localeRow) throw new Error("English locale insert returned no row.");
            const initialCmsEnabled = input.initialCapabilities.includes("cms");
            const [capabilityRow] = initialCmsEnabled
              ? await transaction
                  .insert(projectCapability)
                  .values({
                    workspaceId,
                    projectId: projectRow.id,
                    key: "cms",
                    status: "enabled",
                    changedByUserId: actor.id,
                    createdAt: now,
                    updatedAt: now,
                  })
                  .returning()
              : [undefined];
            if (initialCmsEnabled && !capabilityRow) {
              throw new Error("Initial capability insert returned no row.");
            }
            await transaction.insert(auditEvent).values([
              makeAuditValues({
                workspaceId,
                projectId: projectRow.id,
                actorId: actor.id,
                action: "project.created",
                resourceType: "project",
                resourceId: projectRow.id,
                requestId,
              }),
              makeAuditValues({
                workspaceId,
                projectId: projectRow.id,
                actorId: actor.id,
                action: "project.membership.created",
                resourceType: "project_membership",
                resourceId: membershipRow.id,
                requestId,
              }),
              makeAuditValues({
                workspaceId,
                projectId: projectRow.id,
                environmentId: environmentRow.id,
                actorId: actor.id,
                action: "environment.created",
                resourceType: "environment",
                resourceId: environmentRow.id,
                requestId,
              }),
              makeAuditValues({
                workspaceId,
                projectId: projectRow.id,
                actorId: actor.id,
                action: "project.locale.created",
                resourceType: "project_locale",
                resourceId: localeRow.id,
                requestId,
              }),
              ...(capabilityRow
                ? [
                    makeAuditValues({
                      workspaceId,
                      projectId: projectRow.id,
                      environmentId: environmentRow.id,
                      actorId: actor.id,
                      action: "project.capability.enabled",
                      resourceType: "project_capability",
                      resourceId: capabilityRow.id,
                      requestId,
                    }),
                  ]
                : []),
            ]);
            await persistControlPlaneReceipt(
              transaction,
              {
                commandId: input.commandId,
                operation: "project.create",
                actor,
                fingerprint,
                workspaceId,
                projectId: ProjectId.make(projectRow.id),
                environmentId: null,
              },
              {
                resourceType: "project",
                resourceId: projectRow.id,
                disposition: "created",
              },
              now,
            );
            const authorization = await authorizeControlPlaneProject(
              transaction,
              actor,
              projectRow.id,
              "project.read",
            );
            if (authorization.kind !== "allowed") {
              throw new Error("Created project authorization was not materialized.");
            }
            return outcomeWith("success", {
              detail: await loadControlPlaneProjectDetail(transaction, actor, authorization.access),
              replayed: false,
            });
          }),
        catch: (cause) =>
          hasConstraint(cause, "project_workspace_key_unique")
            ? ProjectKeyConflictFailure.make()
            : databaseFailure("platform.control-plane.project.create", cause),
      });
      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "workspace" });
      }
      if (result.kind === "command_conflict") {
        return yield* ControlPlaneCommandConflictFailure.make();
      }
      const projectModel = yield* decodeDatabaseValue(
        "platform.control-plane.project.create",
        ControlPlaneProject,
        result.detail,
      );
      return ControlPlaneCreateProjectResult.make({
        project: projectModel,
        replayed: result.replayed,
      });
    }),

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
                isNull(workspaceMembership.revokedAt),
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
          role: row.membership.role,
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
                  isNull(workspaceMembership.revokedAt),
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

            const [projectMembershipRow] = await transaction
              .insert(projectMembership)
              .values({
                workspaceId: input.workspaceId,
                projectId: projectRow.id,
                userId: actorId,
                role: "owner",
                createdByUserId: actorId,
              })
              .returning({ id: projectMembership.id });
            if (!projectMembershipRow) {
              throw new Error("Project owner membership insert returned no row.");
            }

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

            const [localeRow] = await transaction
              .insert(projectLocale)
              .values({
                workspaceId: input.workspaceId,
                projectId: projectRow.id,
                tag: "en",
                displayName: "English",
                status: "enabled",
                position: 0,
                createdByUserId: actorId,
                changedByUserId: actorId,
              })
              .returning({ id: projectLocale.id });
            if (!localeRow) throw new Error("English locale insert returned no row.");

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
                actorId,
                action: "project.membership.created",
                resourceType: "project_membership",
                resourceId: projectMembershipRow.id,
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
              makeAuditValues({
                workspaceId: input.workspaceId,
                projectId: projectRow.id,
                actorId,
                action: "project.locale.created",
                resourceType: "project_locale",
                resourceId: localeRow.id,
                requestId,
              }),
            ]);

            const detail = await loadProjectDetail(transaction, projectRow);
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
            const [workspaceAccess] = await transaction
              .select({ role: workspaceMembership.role })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, input.workspaceId),
                  eq(workspaceMembership.userId, actorId),
                  isNull(workspaceMembership.revokedAt),
                ),
              )
              .limit(1);
            if (!workspaceAccess) return outcomeWith("not_found", { rows: [] });

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
            const rows =
              workspaceAccess.role === "owner"
                ? await transaction
                    .select()
                    .from(project)
                    .where(
                      and(
                        eq(project.workspaceId, input.workspaceId),
                        archiveCondition,
                        cursorCondition,
                      ),
                    )
                    .orderBy(desc(sortColumn), desc(project.id))
                    .limit(input.limit + 1)
                : (
                    await transaction
                      .select({ project })
                      .from(projectMembership)
                      .innerJoin(
                        project,
                        and(
                          eq(project.id, projectMembership.projectId),
                          eq(project.workspaceId, projectMembership.workspaceId),
                        ),
                      )
                      .where(
                        and(
                          eq(projectMembership.workspaceId, input.workspaceId),
                          eq(projectMembership.userId, actorId),
                          isNull(projectMembership.removedAt),
                          archiveCondition,
                          cursorCondition,
                        ),
                      )
                      .orderBy(desc(sortColumn), desc(project.id))
                      .limit(input.limit + 1)
                  ).map((row) => row.project);
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
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction((transaction) =>
            selectProjectDetail(transaction, actorId, input.projectId, "project.read"),
          ),
        catch: (cause) => databaseFailure("platform.project.get", cause),
      });
      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "project" });
      }
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      return yield* decodeDatabaseValue("platform.project.get", Project, result.detail);
    }),

    updateProject: Effect.fn("PlatformRepository.updateProject")(function* (
      actorId: AuthUserId,
      input: UpdateProjectInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.update",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const current = authorization.access.project;
            if (current.archivedAt) return outcome("invalid_state");
            if (current.version !== input.version) return outcome("version_conflict");

            const isUnchanged =
              current.name === input.name && current.description === input.description;
            if (isUnchanged) {
              const detail = await loadProjectDetail(transaction, current);
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
              .returning();
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
            const detail = await loadProjectDetail(transaction, updated);
            return outcomeWith("success", { detail });
          }),
        catch: (cause) => databaseFailure("platform.project.update", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
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
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.archive",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const current = authorization.access.project;
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
              .returning();
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
            const detail = await loadProjectDetail(transaction, archived);
            return outcomeWith("success", { detail });
          }),
        catch: (cause) => databaseFailure("platform.project.archive", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "success":
          return yield* decodeDatabaseValue("platform.project.archive", Project, result.detail);
      }
    }),

    restoreProject: Effect.fn("PlatformRepository.restoreProject")(function* (
      actorId: AuthUserId,
      input: RestoreProjectInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from project where id = ${input.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.restore",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const current = authorization.access.project;
            if (!current.archivedAt) return outcome("invalid_state");
            if (current.version !== input.version) return outcome("version_conflict");

            const restoredAt = new Date();
            const [restored] = await transaction
              .update(project)
              .set({
                archivedAt: null,
                archivedByUserId: null,
                version: sql`${project.version} + 1`,
                updatedAt: restoredAt,
              })
              .where(
                and(
                  eq(project.id, input.projectId),
                  eq(project.workspaceId, current.workspaceId),
                  eq(project.version, input.version),
                  isNotNull(project.archivedAt),
                ),
              )
              .returning();
            if (!restored) return outcome("version_conflict");

            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.workspaceId,
                projectId: current.id,
                actorId,
                action: "project.restored",
                resourceType: "project",
                resourceId: current.id,
                requestId,
              }),
            );
            const detail = await loadProjectDetail(transaction, restored);
            return outcomeWith("success", { detail });
          }),
        catch: (cause) => databaseFailure("platform.project.restore", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "success":
          return yield* decodeDatabaseValue("platform.project.restore", Project, result.detail);
      }
    }),

    listControlPlaneWorkspaces: Effect.fn("PlatformRepository.listControlPlaneWorkspaces")(
      function* (
        actor: ControlPlaneActor,
        limit: number,
        position: ControlPlaneListPosition | null,
      ) {
        if (actor.kind !== "user") return yield* ForbiddenFailure.make();
        const rows = yield* Effect.tryPromise({
          try: () => {
            const cursorCondition = position
              ? or(
                  lt(workspaceMembership.createdAt, new Date(position.finalSortAtEpochMs)),
                  and(
                    eq(workspaceMembership.createdAt, new Date(position.finalSortAtEpochMs)),
                    lt(workspaceMembership.id, position.finalId),
                  ),
                )
              : undefined;
            return database
              .select({ workspace, membership: workspaceMembership })
              .from(workspaceMembership)
              .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
              .where(
                and(
                  eq(workspaceMembership.userId, actor.id),
                  isNull(workspaceMembership.revokedAt),
                  cursorCondition,
                ),
              )
              .orderBy(desc(workspaceMembership.createdAt), desc(workspaceMembership.id))
              .limit(limit + 1);
          },
          catch: (cause) => databaseFailure("platform.control-plane.workspace.list", cause),
        });
        const hasNextPage = rows.length > limit;
        const visibleRows = rows.slice(0, limit);
        const items = yield* Effect.forEach(visibleRows, (row) =>
          decodeDatabaseValue(
            "platform.control-plane.workspace.list",
            ControlPlaneWorkspace,
            controlPlaneWorkspaceValue(row.workspace, row.membership.role),
          ),
        );
        const last = visibleRows.at(-1);
        return {
          items,
          nextPosition:
            hasNextPage && last
              ? {
                  finalSortAtEpochMs: last.membership.createdAt.getTime(),
                  finalId: last.membership.id,
                }
              : null,
        } satisfies ControlPlaneListResult<ControlPlaneWorkspace>;
      },
    ),

    getControlPlaneWorkspace: Effect.fn("PlatformRepository.getControlPlaneWorkspace")(function* (
      actor: ControlPlaneActor,
      workspaceId: WorkspaceId,
    ) {
      if (actor.kind !== "user") return yield* ForbiddenFailure.make();
      const result = yield* Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select({ workspace, membership: workspaceMembership })
            .from(workspaceMembership)
            .innerJoin(workspace, eq(workspace.id, workspaceMembership.workspaceId))
            .where(
              and(
                eq(workspace.id, workspaceId),
                eq(workspaceMembership.userId, actor.id),
                isNull(workspaceMembership.revokedAt),
              ),
            )
            .limit(1);
          return row ?? null;
        },
        catch: (cause) => databaseFailure("platform.control-plane.workspace.get", cause),
      });
      if (!result) return yield* NotFoundFailure.make({ resource: "workspace" });
      return yield* decodeDatabaseValue(
        "platform.control-plane.workspace.get",
        ControlPlaneWorkspace,
        controlPlaneWorkspaceValue(result.workspace, result.membership.role),
      );
    }),

    listControlPlaneProjects: Effect.fn("PlatformRepository.listControlPlaneProjects")(function* (
      actor: ControlPlaneActor,
      workspaceId: WorkspaceId,
      status: "active" | "archived",
      limit: number,
      position: ControlPlaneListPosition | null,
    ) {
      if (actor.kind !== "user") return yield* ForbiddenFailure.make();
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [workspaceAccess] = await transaction
              .select({ role: workspaceMembership.role })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, workspaceId),
                  eq(workspaceMembership.userId, actor.id),
                  isNull(workspaceMembership.revokedAt),
                ),
              )
              .limit(1);
            if (!workspaceAccess) return outcomeWith("not_found", { rows: [] });
            const sortColumn = status === "active" ? project.createdAt : project.archivedAt;
            const archiveCondition =
              status === "active" ? isNull(project.archivedAt) : isNotNull(project.archivedAt);
            const cursorCondition = position
              ? or(
                  lt(sortColumn, new Date(position.finalSortAtEpochMs)),
                  and(
                    eq(sortColumn, new Date(position.finalSortAtEpochMs)),
                    lt(project.id, position.finalId),
                  ),
                )
              : undefined;
            const rows =
              workspaceAccess.role === "owner"
                ? await transaction
                    .select()
                    .from(project)
                    .where(
                      and(eq(project.workspaceId, workspaceId), archiveCondition, cursorCondition),
                    )
                    .orderBy(desc(sortColumn), desc(project.id))
                    .limit(limit + 1)
                : (
                    await transaction
                      .select({ project })
                      .from(projectMembership)
                      .innerJoin(
                        project,
                        and(
                          eq(project.id, projectMembership.projectId),
                          eq(project.workspaceId, projectMembership.workspaceId),
                        ),
                      )
                      .where(
                        and(
                          eq(projectMembership.workspaceId, workspaceId),
                          eq(projectMembership.userId, actor.id),
                          isNull(projectMembership.removedAt),
                          archiveCondition,
                          cursorCondition,
                        ),
                      )
                      .orderBy(desc(sortColumn), desc(project.id))
                      .limit(limit + 1)
                  ).map((row) => row.project);
            return outcomeWith("success", { rows });
          }),
        catch: (cause) => databaseFailure("platform.control-plane.project.list", cause),
      });
      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "workspace" });
      }
      const hasNextPage = result.rows.length > limit;
      const visibleRows = result.rows.slice(0, limit);
      const items = yield* Effect.forEach(visibleRows, (row) =>
        Effect.gen(function* () {
          const detail = yield* Effect.tryPromise({
            try: () =>
              database.transaction(async (transaction) => {
                const authorization = await authorizeControlPlaneProject(
                  transaction,
                  actor,
                  row.id,
                  "project.read",
                );
                if (authorization.kind !== "allowed") return null;
                return loadControlPlaneProjectDetail(transaction, actor, authorization.access);
              }),
            catch: (cause) => databaseFailure("platform.control-plane.project.list.detail", cause),
          });
          if (!detail) return yield* NotFoundFailure.make({ resource: "project" });
          return yield* decodeDatabaseValue(
            "platform.control-plane.project.list.detail",
            ControlPlaneProject,
            detail,
          );
        }),
      );
      const last = visibleRows.at(-1);
      const lastSortAt = last ? (status === "active" ? last.createdAt : last.archivedAt) : null;
      return {
        items,
        nextPosition:
          hasNextPage && last && lastSortAt
            ? { finalSortAtEpochMs: lastSortAt.getTime(), finalId: last.id }
            : null,
      } satisfies ControlPlaneListResult<ControlPlaneProject>;
    }),

    getControlPlaneProject: Effect.fn("PlatformRepository.getControlPlaneProject")(function* (
      actor: ControlPlaneActor,
      projectId: ProjectId,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeControlPlaneProject(
              transaction,
              actor,
              projectId,
              "project.read",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            return outcomeWith("success", {
              detail: await loadControlPlaneProjectDetail(transaction, actor, authorization.access),
            });
          }),
        catch: (cause) => databaseFailure("platform.control-plane.project.get", cause),
      });
      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "project" });
      }
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      return yield* decodeDatabaseValue(
        "platform.control-plane.project.get",
        ControlPlaneProject,
        result.detail,
      );
    }),

    updateControlPlaneProject: Effect.fn("PlatformRepository.updateControlPlaneProject")(function* (
      actor: ControlPlaneActor,
      projectId: ProjectId,
      input: ControlPlaneUpdateProjectRequest,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeControlPlaneProject(
              transaction,
              actor,
              projectId,
              "project.update",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const current = authorization.access.project;
            if (current.archivedAt) return outcome("invalid_state");
            if (current.version !== input.expectedVersion) return outcome("version_conflict");
            const unchanged =
              current.name === input.name && current.description === input.description;
            if (unchanged) {
              return outcomeWith("success", {
                detail: await loadControlPlaneProjectDetail(
                  transaction,
                  actor,
                  authorization.access,
                ),
              });
            }
            const now = new Date();
            const [updated] = await transaction
              .update(project)
              .set({
                name: input.name,
                description: input.description,
                version: sql`${project.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(project.id, projectId),
                  eq(project.workspaceId, current.workspaceId),
                  eq(project.version, input.expectedVersion),
                  isNull(project.archivedAt),
                ),
              )
              .returning();
            if (!updated) return outcome("version_conflict");
            const [primaryEnvironment] = await transaction
              .select({ id: environment.id })
              .from(environment)
              .where(
                and(
                  eq(environment.workspaceId, current.workspaceId),
                  eq(environment.projectId, projectId),
                  eq(environment.isPrimary, true),
                ),
              )
              .limit(1);
            if (!primaryEnvironment) throw new Error("Project is missing its primary environment.");
            await transaction.insert(auditEvent).values(
              makeControlPlaneAuditValues({
                workspaceId: current.workspaceId,
                projectId,
                environmentId: primaryEnvironment.id,
                actor,
                action: "project.updated",
                resourceType: "project",
                resourceId: projectId,
                requestId,
              }),
            );
            return outcomeWith("success", {
              detail: await loadControlPlaneProjectDetail(transaction, actor, {
                ...authorization.access,
                project: updated,
              }),
            });
          }),
        catch: (cause) => databaseFailure("platform.control-plane.project.update", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "platform.control-plane.project.update",
            ControlPlaneProject,
            result.detail,
          );
      }
    }),

    getStudioRegistration: Effect.fn("PlatformRepository.getStudioRegistration")(function* (
      actor: ControlPlaneActor,
      projectId: ProjectId,
      environmentId: EnvironmentId,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeControlPlaneProject(
              transaction,
              actor,
              projectId,
              "studio_registration.read",
              environmentId,
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const [registration] = await transaction
              .select()
              .from(studioRegistrationTable)
              .where(
                and(
                  eq(studioRegistrationTable.workspaceId, authorization.access.project.workspaceId),
                  eq(studioRegistrationTable.projectId, projectId),
                  eq(studioRegistrationTable.environmentId, environmentId),
                ),
              )
              .limit(1);
            return registration ? outcomeWith("success", { registration }) : outcome("not_found");
          }),
        catch: (cause) => databaseFailure("platform.studio-registration.get", cause),
      });

      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "studio_registration" });
      }
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      return yield* decodeDatabaseValue(
        "platform.studio-registration.get",
        StudioRegistration,
        studioRegistrationValue(result.registration),
      );
    }),

    putStudioRegistration: Effect.fn("PlatformRepository.putStudioRegistration")(function* (
      actor: ControlPlaneActor,
      projectId: ProjectId,
      environmentId: EnvironmentId,
      input: ControlPlanePutStudioRegistrationRequest,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeControlPlaneProject(
              transaction,
              actor,
              projectId,
              "studio_registration.write",
              environmentId,
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const currentProject = authorization.access.project;
            const workspaceId = WorkspaceId.make(currentProject.workspaceId);
            const fingerprint = controlPlaneCommandFingerprint({
              operation: "studio_registration.put",
              actor,
              scope: {
                workspaceId,
                projectId,
                environmentId,
              },
              input: {
                expectedVersion: input.expectedVersion,
                applicationOrigin: input.applicationOrigin,
                mountPath: input.mountPath,
              },
            });
            const receiptExpectation: ControlPlaneReceiptExpectation = {
              commandId: input.commandId,
              operation: "studio_registration.put",
              actor,
              fingerprint,
              workspaceId,
              projectId,
              environmentId,
            };
            const receipt = await inspectControlPlaneReceipt(transaction, receiptExpectation);
            if (receipt.kind === "conflict") return outcome("command_conflict");
            if (receipt.kind === "replay") {
              if (receipt.resourceType !== "studio_registration") {
                return outcome("command_conflict");
              }
              const [registration] = await transaction
                .select()
                .from(studioRegistrationTable)
                .where(
                  and(
                    eq(studioRegistrationTable.id, receipt.resourceId),
                    eq(studioRegistrationTable.workspaceId, currentProject.workspaceId),
                    eq(studioRegistrationTable.projectId, projectId),
                    eq(studioRegistrationTable.environmentId, environmentId),
                  ),
                )
                .limit(1);
              return registration
                ? outcomeWith("success", {
                    registration,
                    created: receipt.disposition === "created",
                    replayed: true,
                    noOp: receipt.disposition === "no_op",
                  })
                : outcome("not_found");
            }
            if (currentProject.archivedAt) return outcome("invalid_state");

            await transaction.execute(
              sql`select id from studio_registration where workspace_id = ${currentProject.workspaceId} and project_id = ${projectId} and environment_id = ${environmentId} for update`,
            );
            const [current] = await transaction
              .select()
              .from(studioRegistrationTable)
              .where(
                and(
                  eq(studioRegistrationTable.workspaceId, currentProject.workspaceId),
                  eq(studioRegistrationTable.projectId, projectId),
                  eq(studioRegistrationTable.environmentId, environmentId),
                ),
              )
              .limit(1);
            if (!current && input.expectedVersion !== null) return outcome("not_found");
            if (current && input.expectedVersion === null) return outcome("version_conflict");
            if (current && current.version !== input.expectedVersion) {
              return outcome("version_conflict");
            }

            const now = new Date();
            const actorRefs = controlPlaneActorReferences(actor);
            if (!current) {
              const [created] = await transaction
                .insert(studioRegistrationTable)
                .values({
                  workspaceId: currentProject.workspaceId,
                  projectId,
                  environmentId,
                  applicationOrigin: input.applicationOrigin,
                  mountPath: input.mountPath,
                  createdByUserId: actorRefs.userId,
                  createdByCredentialId: actorRefs.credentialId,
                  changedByUserId: actorRefs.userId,
                  changedByCredentialId: actorRefs.credentialId,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              if (!created) throw new Error("Studio registration insert returned no row.");
              await transaction.insert(auditEvent).values(
                makeControlPlaneAuditValues({
                  workspaceId: currentProject.workspaceId,
                  projectId,
                  environmentId,
                  actor,
                  action: "studio_registration.created",
                  resourceType: "studio_registration",
                  resourceId: created.id,
                  requestId,
                }),
              );
              await persistControlPlaneReceipt(
                transaction,
                receiptExpectation,
                {
                  resourceType: "studio_registration",
                  resourceId: created.id,
                  disposition: "created",
                },
                now,
              );
              return outcomeWith("success", {
                registration: created,
                created: true,
                replayed: false,
                noOp: false,
              });
            }

            const unchanged =
              current.applicationOrigin === input.applicationOrigin &&
              current.mountPath === input.mountPath;
            if (unchanged) {
              await persistControlPlaneReceipt(
                transaction,
                receiptExpectation,
                {
                  resourceType: "studio_registration",
                  resourceId: current.id,
                  disposition: "no_op",
                },
                now,
              );
              return outcomeWith("success", {
                registration: current,
                created: false,
                replayed: false,
                noOp: true,
              });
            }

            const [updated] = await transaction
              .update(studioRegistrationTable)
              .set({
                applicationOrigin: input.applicationOrigin,
                mountPath: input.mountPath,
                version: sql`${studioRegistrationTable.version} + 1`,
                changedByUserId: actorRefs.userId,
                changedByCredentialId: actorRefs.credentialId,
                updatedAt: now,
              })
              .where(
                and(
                  eq(studioRegistrationTable.id, current.id),
                  eq(studioRegistrationTable.workspaceId, currentProject.workspaceId),
                  eq(studioRegistrationTable.projectId, projectId),
                  eq(studioRegistrationTable.environmentId, environmentId),
                  eq(studioRegistrationTable.version, current.version),
                ),
              )
              .returning();
            if (!updated) return outcome("version_conflict");
            await transaction.insert(auditEvent).values(
              makeControlPlaneAuditValues({
                workspaceId: currentProject.workspaceId,
                projectId,
                environmentId,
                actor,
                action: "studio_registration.updated",
                resourceType: "studio_registration",
                resourceId: updated.id,
                requestId,
              }),
            );
            await persistControlPlaneReceipt(
              transaction,
              receiptExpectation,
              {
                resourceType: "studio_registration",
                resourceId: updated.id,
                disposition: "updated",
              },
              now,
            );
            return outcomeWith("success", {
              registration: updated,
              created: false,
              replayed: false,
              noOp: false,
            });
          }),
        catch: (cause) =>
          hasConstraint(cause, "studio_registration_environment_unique")
            ? VersionConflictFailure.make()
            : databaseFailure("platform.studio-registration.put", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "studio_registration" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "command_conflict":
          return yield* ControlPlaneCommandConflictFailure.make();
        case "success": {
          const registration = yield* decodeDatabaseValue(
            "platform.studio-registration.put",
            StudioRegistration,
            studioRegistrationValue(result.registration),
          );
          return ControlPlanePutStudioRegistrationResult.make({
            registration,
            created: result.created,
            replayed: result.replayed,
            noOp: result.noOp,
          });
        }
      }
    }),

    enableControlPlaneCapability: Effect.fn("PlatformRepository.enableControlPlaneCapability")(
      function* (
        actor: ControlPlaneActor,
        projectId: ProjectId,
        commandId: ControlPlaneCommandId,
        requestId: string,
      ) {
        const result = yield* Effect.tryPromise({
          try: () =>
            database.transaction(async (transaction) => {
              const authorization = await authorizeControlPlaneProject(
                transaction,
                actor,
                projectId,
                "project.capability.manage",
              );
              if (authorization.kind === "not_found") return outcome("not_found");
              if (authorization.kind === "forbidden") return outcome("forbidden");
              const currentProject = authorization.access.project;
              const workspaceId = WorkspaceId.make(currentProject.workspaceId);
              const [primaryEnvironment] = await transaction
                .select({ id: environment.id })
                .from(environment)
                .where(
                  and(
                    eq(environment.workspaceId, currentProject.workspaceId),
                    eq(environment.projectId, projectId),
                    eq(environment.isPrimary, true),
                    eq(environment.key, "main"),
                  ),
                )
                .limit(1);
              if (!primaryEnvironment) return outcome("not_found");
              const environmentId = EnvironmentId.make(primaryEnvironment.id);
              const fingerprint = controlPlaneCommandFingerprint({
                operation: "project.capability.enable",
                actor,
                scope: { workspaceId, projectId, environmentId },
                input: { capability: "cms" },
              });
              const receiptExpectation: ControlPlaneReceiptExpectation = {
                commandId,
                operation: "project.capability.enable",
                actor,
                fingerprint,
                workspaceId,
                projectId,
                environmentId,
              };
              const receipt = await inspectControlPlaneReceipt(transaction, receiptExpectation);
              if (receipt.kind === "conflict") return outcome("command_conflict");
              if (receipt.kind === "replay") {
                if (receipt.resourceType !== "project_capability") {
                  return outcome("command_conflict");
                }
                const [capabilityRow] = await transaction
                  .select()
                  .from(projectCapability)
                  .where(
                    and(
                      eq(projectCapability.id, receipt.resourceId),
                      eq(projectCapability.workspaceId, currentProject.workspaceId),
                      eq(projectCapability.projectId, projectId),
                      eq(projectCapability.key, "cms"),
                      eq(projectCapability.status, "enabled"),
                    ),
                  )
                  .limit(1);
                return capabilityRow
                  ? outcomeWith("success", { capabilityRow, replayed: true })
                  : outcome("not_found");
              }
              if (currentProject.archivedAt) return outcome("invalid_state");

              await transaction.execute(
                sql`select id from project where id = ${projectId} and workspace_id = ${currentProject.workspaceId} for update`,
              );
              const [existing] = await transaction
                .select({ id: projectCapability.id })
                .from(projectCapability)
                .where(
                  and(
                    eq(projectCapability.workspaceId, currentProject.workspaceId),
                    eq(projectCapability.projectId, projectId),
                    eq(projectCapability.key, "cms"),
                  ),
                )
                .limit(1);
              if (existing) return outcome("invalid_state");

              const now = new Date();
              const actorRefs = controlPlaneActorReferences(actor);
              const [capabilityRow] = await transaction
                .insert(projectCapability)
                .values({
                  workspaceId: currentProject.workspaceId,
                  projectId,
                  key: "cms",
                  status: "enabled",
                  changedByUserId: actorRefs.userId,
                  changedByCredentialId: actorRefs.credentialId,
                  changedByCredentialEnvironmentId:
                    actor.kind === "credential" ? environmentId : null,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();
              if (!capabilityRow) throw new Error("Capability insert returned no row.");
              await transaction.insert(auditEvent).values(
                makeControlPlaneAuditValues({
                  workspaceId: currentProject.workspaceId,
                  projectId,
                  environmentId,
                  actor,
                  action: "project.capability.enabled",
                  resourceType: "project_capability",
                  resourceId: capabilityRow.id,
                  requestId,
                }),
              );
              await persistControlPlaneReceipt(
                transaction,
                receiptExpectation,
                {
                  resourceType: "project_capability",
                  resourceId: capabilityRow.id,
                  disposition: "created",
                },
                now,
              );
              return outcomeWith("success", { capabilityRow, replayed: false });
            }),
          catch: (cause) =>
            hasConstraint(cause, "project_capability_project_key_unique")
              ? InvalidStateTransitionFailure.make()
              : databaseFailure("platform.project.capability.control-plane-enable", cause),
        });

        switch (result.kind) {
          case "not_found":
            return yield* NotFoundFailure.make({ resource: "project" });
          case "forbidden":
            return yield* ForbiddenFailure.make();
          case "invalid_state":
            return yield* InvalidStateTransitionFailure.make();
          case "command_conflict":
            return yield* ControlPlaneCommandConflictFailure.make();
          case "success": {
            const capability = yield* decodeDatabaseValue(
              "platform.project.capability.control-plane-enable",
              Capability,
              {
                id: result.capabilityRow.id,
                key: "cms",
                status: result.capabilityRow.status,
                version: result.capabilityRow.version,
                changedAt: toIso(result.capabilityRow.updatedAt),
              },
            );
            return ControlPlaneEnableCapabilityResult.make({
              capability,
              replayed: result.replayed,
            });
          }
        }
      },
    ),

    enableCapability: Effect.fn("PlatformRepository.enableCapability")(function* (
      actorId: AuthUserId,
      input: EnableCapabilityInput,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.capability.manage",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const current = authorization.access.project;
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
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
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
