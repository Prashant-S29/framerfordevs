import { db } from "@framerfordevs/db";
import { and, eq, inArray, sql } from "@framerfordevs/db/query";
import { cmsEntryLocaleDraft, cmsEntryLocalePublicationHead } from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import type { ProjectPermissionAction } from "../../contracts/access";
import {
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  LocaleConflictFailure,
  LocaleDependenciesExistFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  VersionConflictFailure,
} from "../../contracts/response/errors";
import {
  type CreateProjectLocaleInput,
  type ListProjectLocalesInput,
  LocaleDependencySummary,
  ProjectLocale,
  ProjectLocaleList,
  type ProjectLocaleStatus,
  type ReorderProjectLocalesInput,
  ResolvedProjectLocale,
  type UpdateProjectLocaleDisplayNameInput,
  type UpdateProjectLocaleStatusInput,
} from "../../contracts/locale";
import type { AuthUserId } from "../../contracts/platform";
import { decideLocaleTransition } from "./transition";
import {
  type ApplicationDb,
  type ApplicationExecutor,
  authorizeUserProject,
  selectUserProjectAccess,
} from "../project-access";
import { isRoleAllowed } from "../policy";

function outcome<K extends string>(kind: K): { readonly kind: K } {
  return { kind };
}

function outcomeWith<K extends string, A extends object>(
  kind: K,
  value: A,
): { readonly kind: K } & A {
  return { kind, ...value };
}

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

function decodeLocaleStatus(value: string): ProjectLocaleStatus {
  switch (value) {
    case "enabled":
    case "disabled":
    case "removed":
      return value;
    default:
      throw new Error("Project locale has an invalid status.");
  }
}

function localeValue(row: typeof projectLocale.$inferSelect) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    tag: row.tag,
    displayName: row.displayName,
    status: row.status,
    position: row.position,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function makeAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceId: string;
  readonly requestId: string;
}) {
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    actorType: "user",
    actorId: options.actorId,
    action: options.action,
    resourceType: "project_locale",
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

async function lockProject(executor: ApplicationExecutor, projectId: string) {
  await executor.execute(sql`select id from project where id = ${projectId} for update`);
}

async function selectLocaleById(executor: ApplicationExecutor, localeId: string) {
  const [row] = await executor
    .select()
    .from(projectLocale)
    .where(eq(projectLocale.id, localeId))
    .limit(1);
  return row;
}

/** Counts exact-locale draft heads under the project lock without scanning unbounded history. */
async function selectLocaleDependencies(
  executor: ApplicationExecutor,
  locale: typeof projectLocale.$inferSelect,
) {
  const drafts = await executor
    .select({ entryId: cmsEntryLocaleDraft.entryId })
    .from(cmsEntryLocaleDraft)
    .where(
      and(
        eq(cmsEntryLocaleDraft.workspaceId, locale.workspaceId),
        eq(cmsEntryLocaleDraft.projectId, locale.projectId),
        eq(cmsEntryLocaleDraft.localeId, locale.id),
      ),
    )
    .limit(101);
  const currentPublications = await executor
    .select({ entryId: cmsEntryLocalePublicationHead.entryId })
    .from(cmsEntryLocalePublicationHead)
    .where(
      and(
        eq(cmsEntryLocalePublicationHead.workspaceId, locale.workspaceId),
        eq(cmsEntryLocalePublicationHead.projectId, locale.projectId),
        eq(cmsEntryLocalePublicationHead.localeId, locale.id),
        sql`${cmsEntryLocalePublicationHead.currentPublicationId} is not null`,
      ),
    )
    .limit(101);
  return LocaleDependencySummary.make({
    draftCount: Math.min(drafts.length, 100),
    currentPublicationCount: Math.min(currentPublications.length, 100),
    draftCountCapped: drafts.length > 100,
    currentPublicationCountCapped: currentPublications.length > 100,
  });
}

interface RepositoryOptions {
  readonly database?: ApplicationDb;
}

export function makeLocaleRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;

  return {
    listLocales: Effect.fn("LocaleRepository.listLocales")(function* (
      actorId: AuthUserId,
      input: ListProjectLocalesInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const action = input.view === "settings" ? "locale.manage" : "locale.read";
          const authorization = await authorizeUserProject(
            database,
            actorId,
            input.projectId,
            action,
          );
          if (authorization.kind !== "allowed") {
            return outcomeWith(authorization.kind, { rows: [] });
          }
          if (input.view === "enabled" && authorization.access.localeAccessMode === "none") {
            return outcomeWith("success", { rows: [] });
          }

          const accessCondition =
            input.view === "enabled" && authorization.access.localeAccessMode === "selected"
              ? inArray(projectLocale.id, authorization.access.allowedLocaleIds)
              : undefined;
          const statusCondition =
            input.view === "enabled"
              ? eq(projectLocale.status, "enabled")
              : input.includeRemoved
                ? undefined
                : sql`${projectLocale.status} <> 'removed'`;
          const rows = await database
            .select()
            .from(projectLocale)
            .where(
              and(
                eq(projectLocale.workspaceId, authorization.access.project.workspaceId),
                eq(projectLocale.projectId, input.projectId),
                statusCondition,
                accessCondition,
              ),
            )
            .orderBy(
              sql`case when ${projectLocale.status} = 'removed' then 1 else 0 end`,
              sql`${projectLocale.position} asc nulls last`,
              projectLocale.id,
            );
          return outcomeWith("success", { rows });
        },
        catch: (cause) => databaseFailure("locale.list", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      const items = yield* Effect.forEach(result.rows, (row) =>
        decodeDatabaseValue("locale.list", ProjectLocale, localeValue(row)),
      );
      return ProjectLocaleList.make({ items });
    }),

    createLocale: Effect.fn("LocaleRepository.createLocale")(function* (
      actorId: AuthUserId,
      input: CreateProjectLocaleInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProject(transaction, input.projectId);
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "locale.manage",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            const [summary] = await transaction
              .select({
                count: sql<number>`count(*)::int`,
                maxPosition: sql<number>`coalesce(max(${projectLocale.position}), -1)::int`,
              })
              .from(projectLocale)
              .where(
                and(
                  eq(projectLocale.projectId, input.projectId),
                  sql`${projectLocale.status} <> 'removed'`,
                ),
              );
            if ((summary?.count ?? 0) >= 100) return outcome("locale_conflict");
            const [row] = await transaction
              .insert(projectLocale)
              .values({
                workspaceId: authorization.access.project.workspaceId,
                projectId: input.projectId,
                tag: input.tag,
                displayName: input.displayName,
                status: "enabled",
                position: (summary?.maxPosition ?? -1) + 1,
                createdByUserId: actorId,
                changedByUserId: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!row) throw new Error("Locale insert returned no row.");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                actorId,
                action: "project.locale.created",
                resourceId: row.id,
                requestId,
              }),
            );
            return outcomeWith("success", { row });
          }),
        catch: (cause) =>
          hasConstraint(cause, "project_locale_project_tag_ci_unique") ||
          hasConstraint(cause, "project_locale_project_position_unique")
            ? LocaleConflictFailure.make()
            : databaseFailure("locale.create", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "locale_conflict") return yield* LocaleConflictFailure.make();
      return yield* decodeDatabaseValue("locale.create", ProjectLocale, localeValue(result.row));
    }),

    updateDisplayName: Effect.fn("LocaleRepository.updateDisplayName")(function* (
      actorId: AuthUserId,
      input: UpdateProjectLocaleDisplayNameInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const initial = await selectLocaleById(transaction, input.localeId);
            if (!initial) return outcome("not_found");
            await lockProject(transaction, initial.projectId);
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              initial.projectId,
              "locale.manage",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const current = await selectLocaleById(transaction, input.localeId);
            if (!current || current.workspaceId !== authorization.access.project.workspaceId) {
              return outcome("not_found");
            }
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            if (current.version !== input.version) return outcome("version_conflict");
            if (current.displayName === input.displayName) {
              return outcomeWith("success", { row: current });
            }
            const [row] = await transaction
              .update(projectLocale)
              .set({
                displayName: input.displayName,
                changedByUserId: actorId,
                version: sql`${projectLocale.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(eq(projectLocale.id, input.localeId), eq(projectLocale.version, input.version)),
              )
              .returning();
            if (!row) return outcome("version_conflict");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                actorId,
                action: "project.locale.display_name.updated",
                resourceId: row.id,
                requestId,
              }),
            );
            return outcomeWith("success", { row });
          }),
        catch: (cause) => databaseFailure("locale.display_name.update", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "locale" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      return yield* decodeDatabaseValue(
        "locale.display_name.update",
        ProjectLocale,
        localeValue(result.row),
      );
    }),

    reorderLocales: Effect.fn("LocaleRepository.reorderLocales")(function* (
      actorId: AuthUserId,
      input: ReorderProjectLocalesInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProject(transaction, input.projectId);
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "locale.manage",
            );
            if (authorization.kind === "not_found") {
              return outcomeWith("not_found", { rows: [] });
            }
            if (authorization.kind === "forbidden") {
              return outcomeWith("forbidden", { rows: [] });
            }
            if (authorization.access.project.archivedAt) {
              return outcomeWith("invalid_state", { rows: [] });
            }
            await transaction.execute(
              sql`select id from project_locale where project_id = ${input.projectId} and status <> 'removed' order by id for update`,
            );
            const rows = await transaction
              .select()
              .from(projectLocale)
              .where(
                and(
                  eq(projectLocale.projectId, input.projectId),
                  sql`${projectLocale.status} <> 'removed'`,
                ),
              )
              .orderBy(projectLocale.id);
            const currentById = new Map(rows.map((row) => [row.id, row]));
            if (
              rows.length !== input.locales.length ||
              input.locales.some((item) => !currentById.has(item.localeId))
            ) {
              return outcomeWith("locale_unavailable", { rows: [] });
            }
            if (
              input.locales.some((item) => currentById.get(item.localeId)?.version !== item.version)
            ) {
              return outcomeWith("version_conflict", { rows: [] });
            }
            const changed = input.locales
              .map((item, position) => ({
                id: item.localeId,
                position,
                currentPosition: currentById.get(item.localeId)?.position,
              }))
              .filter((item) => item.currentPosition !== item.position);
            if (changed.length === 0) {
              const ordered = [...rows].sort(
                (left, right) =>
                  (left.position ?? 0) - (right.position ?? 0) || left.id.localeCompare(right.id),
              );
              return outcomeWith("success", { rows: ordered });
            }

            const maxPosition = Math.max(...rows.map((row) => row.position ?? 0));
            const changedIds = changed.map((item) => item.id);
            await transaction
              .update(projectLocale)
              .set({ position: sql`${projectLocale.position} + ${maxPosition + 1}` })
              .where(inArray(projectLocale.id, changedIds));
            const positionCases = changed.map(
              (item) => sql`when ${projectLocale.id} = ${item.id} then ${item.position}`,
            );
            await transaction
              .update(projectLocale)
              .set({
                position: sql`case ${sql.join(positionCases, sql.raw(" "))} else ${projectLocale.position} end`,
                changedByUserId: actorId,
                version: sql`${projectLocale.version} + 1`,
                updatedAt: now,
              })
              .where(inArray(projectLocale.id, changedIds));
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: authorization.access.project.workspaceId,
                projectId: input.projectId,
                actorId,
                action: "project.locale.reordered",
                resourceId: input.projectId,
                requestId,
              }),
            );
            const ordered = await transaction
              .select()
              .from(projectLocale)
              .where(
                and(
                  eq(projectLocale.projectId, input.projectId),
                  sql`${projectLocale.status} <> 'removed'`,
                ),
              )
              .orderBy(projectLocale.position, projectLocale.id);
            return outcomeWith("success", { rows: ordered });
          }),
        catch: (cause) => databaseFailure("locale.reorder", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      const items = yield* Effect.forEach(result.rows, (row) =>
        decodeDatabaseValue("locale.reorder", ProjectLocale, localeValue(row)),
      );
      return ProjectLocaleList.make({ items });
    }),

    updateStatus: Effect.fn("LocaleRepository.updateStatus")(function* (
      actorId: AuthUserId,
      input: UpdateProjectLocaleStatusInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const initial = await selectLocaleById(transaction, input.localeId);
            if (!initial) return outcome("not_found");
            await lockProject(transaction, initial.projectId);
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              initial.projectId,
              "locale.manage",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            const current = await selectLocaleById(transaction, input.localeId);
            if (!current || current.workspaceId !== authorization.access.project.workspaceId) {
              return outcome("not_found");
            }
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            if (current.version !== input.version) return outcome("version_conflict");
            const dependencies = await selectLocaleDependencies(transaction, current);
            const transition = decideLocaleTransition({
              currentStatus: decodeLocaleStatus(current.status),
              requestedStatus: input.status,
              isEnglish: current.tag.toLowerCase() === "en",
              confirmDraftImpact: input.confirmDraftImpact,
              dependencies,
            });
            if (transition.kind === "no_change") {
              return outcomeWith("success", { row: current });
            }
            if (transition.kind === "invalid") return outcome("invalid_state");
            if (transition.kind === "dependencies") {
              return outcomeWith("dependencies", { dependencies });
            }

            const nextPosition =
              current.status === "removed" && input.status === "enabled"
                ? await transaction
                    .select({
                      position: sql<number>`coalesce(max(${projectLocale.position}), -1)::int + 1`,
                    })
                    .from(projectLocale)
                    .where(
                      and(
                        eq(projectLocale.projectId, current.projectId),
                        sql`${projectLocale.status} <> 'removed'`,
                      ),
                    )
                    .then((rows) => rows[0]?.position ?? 0)
                : input.status === "removed"
                  ? null
                  : current.position;
            const [row] = await transaction
              .update(projectLocale)
              .set({
                status: input.status,
                position: nextPosition,
                changedByUserId: actorId,
                version: sql`${projectLocale.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(eq(projectLocale.id, input.localeId), eq(projectLocale.version, input.version)),
              )
              .returning();
            if (!row) return outcome("version_conflict");
            const action =
              current.status === "removed"
                ? "project.locale.restored"
                : input.status === "enabled"
                  ? "project.locale.enabled"
                  : input.status === "disabled"
                    ? "project.locale.disabled"
                    : "project.locale.removed";
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                actorId,
                action,
                resourceId: row.id,
                requestId,
              }),
            );
            return outcomeWith("success", { row });
          }),
        catch: (cause) =>
          hasConstraint(cause, "project_locale_project_position_unique")
            ? LocaleConflictFailure.make()
            : databaseFailure("locale.status.update", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "locale" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "dependencies") {
        if (input.status !== "disabled" && input.status !== "removed") {
          return yield* InvalidStateTransitionFailure.make();
        }
        return yield* LocaleDependenciesExistFailure.make({
          requestedStatus: input.status,
          dependencies: result.dependencies,
        });
      }
      return yield* decodeDatabaseValue(
        "locale.status.update",
        ProjectLocale,
        localeValue(result.row),
      );
    }),

    resolveEnabledLocale: Effect.fn("LocaleRepository.resolveEnabledLocale")(function* (
      actorId: AuthUserId,
      projectId: string,
      tag: string,
      action: ProjectPermissionAction,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const access = await selectUserProjectAccess(database, actorId, projectId);
          if (!access) return outcome("not_found");
          if (!isRoleAllowed(access.role, action)) return outcome("forbidden");
          const [row] = await database
            .select()
            .from(projectLocale)
            .where(
              and(
                eq(projectLocale.workspaceId, access.project.workspaceId),
                eq(projectLocale.projectId, projectId),
                sql`lower(${projectLocale.tag}) = lower(${tag})`,
                eq(projectLocale.status, "enabled"),
              ),
            )
            .limit(1);
          if (!row) return outcome("locale_unavailable");
          if (
            access.localeAccessMode === "none" ||
            (access.localeAccessMode === "selected" && !access.allowedLocaleIds.includes(row.id))
          ) {
            return outcome("locale_unavailable");
          }
          return outcomeWith("success", { row });
        },
        catch: (cause) => databaseFailure("locale.resolve", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      return yield* decodeDatabaseValue("locale.resolve", ResolvedProjectLocale, {
        id: result.row.id,
        workspaceId: result.row.workspaceId,
        projectId: result.row.projectId,
        tag: result.row.tag,
      });
    }),
  };
}

export class LocaleRepository extends Context.Tag("LocaleRepository")<
  LocaleRepository,
  ReturnType<typeof makeLocaleRepository>
>() {}

export const LocaleRepositoryLive = Layer.succeed(LocaleRepository, makeLocaleRepository());
