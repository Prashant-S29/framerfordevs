import { db } from "@framerfordevs/db";
import { and, eq, inArray, isNull, lt, or, sql } from "@framerfordevs/db/query";
import { projectInvitation, projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { projectLocale, projectMembershipLocaleAccess } from "@framerfordevs/db/schema/locale";
import { auditEvent, project, workspaceMembership } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  type CanonicalEmail,
  type CreateProjectInvitationInput,
  CurrentProjectAccess,
  type GetCurrentProjectAccessInput,
  InspectedProjectInvitation,
  type ListProjectInvitationsInput,
  type ListProjectMembersInput,
  ProjectInvitation,
  ProjectInvitationId,
  ProjectInvitationPage,
  ProjectMember,
  ProjectMemberPage,
  ProjectMembershipId,
  projectPermissionActionValues,
  type RemoveProjectMemberInput,
  type RevokeProjectInvitationInput,
  type UpdateProjectMemberLocaleAccessInput,
  type UpdateProjectMemberRoleInput,
} from "../contracts/access";
import {
  decodeProjectInvitationCursor,
  decodeProjectMemberCursor,
  encodeProjectInvitationCursor,
  encodeProjectMemberCursor,
} from "../contracts/access/page-cursor";
import {
  DatabaseFailure,
  ForbiddenFailure,
  InvitationConflictFailure,
  InvitationInvalidFailure,
  InvalidStateTransitionFailure,
  LastOwnerRequiredFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  VersionConflictFailure,
} from "../contracts/response/errors";
import type { AuthUserId } from "../contracts/platform";
import {
  type ApplicationDb,
  type ApplicationExecutor,
  authorizeUserProject,
} from "./project-access";
import { isRoleAllowed } from "./policy";

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

function canonicalEmail(value: string): string {
  return value.trim().normalize("NFC").toLowerCase();
}

function invitationValue(row: typeof projectInvitation.$inferSelect, now: Date) {
  const status = row.status === "pending" && row.expiresAt <= now ? "expired" : row.status;
  return {
    id: row.id,
    projectId: row.projectId,
    email: row.email,
    role: row.role,
    status,
    version: row.version,
    expiresAt: toIso(row.expiresAt),
    acceptedAt: row.acceptedAt ? toIso(row.acceptedAt) : null,
    revokedAt: row.revokedAt ? toIso(row.revokedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

interface MemberRecord {
  readonly membership: typeof projectMembership.$inferSelect;
  readonly member: typeof user.$inferSelect;
  readonly localeIds: ReadonlyArray<string>;
}

function localeAccessValue(mode: string, localeIds: ReadonlyArray<string>) {
  return mode === "selected" ? { mode, localeIds } : { mode };
}

function isActionVisibleForLocaleAccess(
  action: (typeof projectPermissionActionValues)[number],
  role: string,
  mode: string,
  localeIds: ReadonlyArray<string>,
): boolean {
  if (!isRoleAllowed(role, action)) return false;
  if (
    mode !== "all" &&
    (action === "locale.manage" ||
      action === "project.credential.issue" ||
      action === "project.credential.rotate")
  ) {
    return false;
  }
  if (action.startsWith("content.")) {
    return mode === "all" || (mode === "selected" && localeIds.length > 0);
  }
  return true;
}

function memberValue(row: MemberRecord) {
  return {
    id: row.membership.id,
    projectId: row.membership.projectId,
    userId: row.membership.userId,
    name: row.member.name,
    email: canonicalEmail(row.member.email),
    role: row.membership.role,
    localeAccess: localeAccessValue(row.membership.localeAccessMode, row.localeIds),
    version: row.membership.version,
    removedAt: row.membership.removedAt ? toIso(row.membership.removedAt) : null,
    createdAt: toIso(row.membership.createdAt),
    updatedAt: toIso(row.membership.updatedAt),
  };
}

function makeAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
}) {
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    actorType: "user",
    actorId: options.actorId,
    action: options.action,
    resourceType: options.resourceType,
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

async function selectMemberById(
  executor: ApplicationExecutor,
  membershipId: string,
): Promise<MemberRecord | undefined> {
  const [row] = await executor
    .select({ membership: projectMembership, member: user })
    .from(projectMembership)
    .innerJoin(user, eq(user.id, projectMembership.userId))
    .where(eq(projectMembership.id, membershipId))
    .limit(1);
  if (!row) return undefined;
  const localeIds =
    row.membership.localeAccessMode === "selected"
      ? (
          await executor
            .select({ localeId: projectMembershipLocaleAccess.localeId })
            .from(projectMembershipLocaleAccess)
            .where(eq(projectMembershipLocaleAccess.membershipId, membershipId))
        ).map((access) => access.localeId)
      : [];
  return { ...row, localeIds };
}

async function attachLocaleAccess(
  executor: ApplicationExecutor,
  rows: ReadonlyArray<{
    readonly membership: typeof projectMembership.$inferSelect;
    readonly member: typeof user.$inferSelect;
  }>,
): Promise<ReadonlyArray<MemberRecord>> {
  const selectedMembershipIds = rows
    .filter((row) => row.membership.localeAccessMode === "selected")
    .map((row) => row.membership.id);
  const accessRows =
    selectedMembershipIds.length === 0
      ? []
      : await executor
          .select({
            membershipId: projectMembershipLocaleAccess.membershipId,
            localeId: projectMembershipLocaleAccess.localeId,
          })
          .from(projectMembershipLocaleAccess)
          .where(inArray(projectMembershipLocaleAccess.membershipId, selectedMembershipIds));
  const localeIdsByMembership = new Map<string, Array<string>>();
  for (const access of accessRows) {
    const localeIds = localeIdsByMembership.get(access.membershipId) ?? [];
    localeIds.push(access.localeId);
    localeIdsByMembership.set(access.membershipId, localeIds);
  }
  return rows.map((row) => ({
    ...row,
    localeIds: localeIdsByMembership.get(row.membership.id) ?? [],
  }));
}

async function activeOwnerCount(executor: ApplicationExecutor, projectId: string) {
  const [result] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(projectMembership)
    .where(
      and(
        eq(projectMembership.projectId, projectId),
        eq(projectMembership.role, "owner"),
        isNull(projectMembership.removedAt),
      ),
    );
  return result?.count ?? 0;
}

interface RepositoryOptions {
  readonly database?: ApplicationDb;
}

export function makeAccessRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;

  return {
    createInvitation: Effect.fn("AccessRepository.createInvitation")(function* (
      actorId: AuthUserId,
      input: CreateProjectInvitationInput,
      tokenDigest: string,
      now: Date,
      expiresAt: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.member.invite",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);

            await transaction
              .update(projectInvitation)
              .set({
                status: "expired",
                version: sql`${projectInvitation.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projectInvitation.projectId, input.projectId),
                  eq(projectInvitation.email, input.email),
                  eq(projectInvitation.status, "pending"),
                  sql`${projectInvitation.expiresAt} <= ${now}`,
                ),
              );

            const [row] = await transaction
              .insert(projectInvitation)
              .values({
                workspaceId: authorization.access.project.workspaceId,
                projectId: input.projectId,
                email: input.email,
                role: input.role,
                tokenDigest,
                invitedByUserId: actorId,
                expiresAt,
              })
              .returning();
            if (!row) throw new Error("Invitation insert returned no row.");

            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                actorId,
                action: "project.invitation.created",
                resourceType: "project_invitation",
                resourceId: row.id,
                requestId,
              }),
            );
            return outcomeWith("success", { row });
          }),
        catch: (cause) =>
          hasConstraint(cause, "project_invitation_project_pending_email_unique")
            ? InvitationConflictFailure.make()
            : databaseFailure("access.invitation.create", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "project" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "access.invitation.create",
            ProjectInvitation,
            invitationValue(result.row, now),
          );
      }
    }),

    listInvitations: Effect.fn("AccessRepository.listInvitations")(function* (
      actorId: AuthUserId,
      input: ListProjectInvitationsInput,
      now: Date,
    ) {
      const cursor = input.cursor
        ? yield* decodeProjectInvitationCursor(input.cursor, input.projectId)
        : null;
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.member.read",
            );
            if (authorization.kind !== "allowed") {
              return outcomeWith(authorization.kind, { rows: [] });
            }
            const cursorCondition = cursor
              ? or(
                  lt(projectInvitation.createdAt, new Date(cursor.createdAt)),
                  and(
                    eq(projectInvitation.createdAt, new Date(cursor.createdAt)),
                    lt(projectInvitation.id, cursor.invitationId),
                  ),
                )
              : undefined;
            const rows = await transaction
              .select()
              .from(projectInvitation)
              .where(and(eq(projectInvitation.projectId, input.projectId), cursorCondition))
              .orderBy(
                sql`${projectInvitation.createdAt} desc nulls last`,
                sql`${projectInvitation.id} desc nulls last`,
              )
              .limit(input.limit + 1);
            return outcomeWith("success", { rows });
          }),
        catch: (cause) => databaseFailure("access.invitation.list", cause),
      });

      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();

      const hasNextPage = result.rows.length > input.limit;
      const visible = result.rows.slice(0, input.limit);
      const items = yield* Effect.forEach(visible, (row) =>
        decodeDatabaseValue("access.invitation.list", ProjectInvitation, invitationValue(row, now)),
      );
      const last = visible.at(-1);
      const nextCursor =
        hasNextPage && last
          ? yield* encodeProjectInvitationCursor({
              projectId: input.projectId,
              createdAt: toIso(last.createdAt),
              invitationId: yield* decodeDatabaseValue(
                "access.invitation.list",
                ProjectInvitationId,
                last.id,
              ),
            })
          : null;
      return ProjectInvitationPage.make({ items, nextCursor });
    }),

    inspectInvitation: Effect.fn("AccessRepository.inspectInvitation")(function* (
      actorEmail: CanonicalEmail,
      tokenDigest: string,
      now: Date,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [row] = await transaction
              .select({
                invitation: projectInvitation,
                projectName: project.name,
                inviterName: user.name,
              })
              .from(projectInvitation)
              .innerJoin(project, eq(project.id, projectInvitation.projectId))
              .innerJoin(user, eq(user.id, projectInvitation.invitedByUserId))
              .where(
                and(
                  eq(projectInvitation.tokenDigest, tokenDigest),
                  eq(projectInvitation.email, actorEmail),
                ),
              )
              .limit(1);
            if (!row || row.invitation.status !== "pending") return outcome("invalid");
            if (row.invitation.expiresAt <= now) {
              await transaction
                .update(projectInvitation)
                .set({
                  status: "expired",
                  version: sql`${projectInvitation.version} + 1`,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(projectInvitation.id, row.invitation.id),
                    eq(projectInvitation.status, "pending"),
                  ),
                );
              return outcome("invalid");
            }
            return outcomeWith("success", { row });
          }),
        catch: (cause) => databaseFailure("access.invitation.inspect", cause),
      });
      if (result.kind === "invalid") return yield* InvitationInvalidFailure.make();
      return yield* decodeDatabaseValue("access.invitation.inspect", InspectedProjectInvitation, {
        projectId: result.row.invitation.projectId,
        projectName: result.row.projectName,
        role: result.row.invitation.role,
        inviterName: result.row.inviterName,
        expiresAt: toIso(result.row.invitation.expiresAt),
      });
    }),

    acceptInvitation: Effect.fn("AccessRepository.acceptInvitation")(function* (
      actorId: AuthUserId,
      actorEmail: CanonicalEmail,
      tokenDigest: string,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from project_invitation where token_digest = ${tokenDigest} for update`,
            );
            const [invitation] = await transaction
              .select()
              .from(projectInvitation)
              .where(
                and(
                  eq(projectInvitation.tokenDigest, tokenDigest),
                  eq(projectInvitation.email, actorEmail),
                ),
              )
              .limit(1);
            if (!invitation || invitation.status !== "pending") return outcome("invalid");
            if (invitation.expiresAt <= now) {
              await transaction
                .update(projectInvitation)
                .set({
                  status: "expired",
                  version: sql`${projectInvitation.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(projectInvitation.id, invitation.id));
              return outcome("invalid");
            }

            await transaction.execute(sql`select id from "user" where id = ${actorId} for update`);
            let workspaceMembershipAudit:
              | { readonly action: string; readonly resourceId: string }
              | undefined;
            const [workspaceMembershipRow] = await transaction
              .select()
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, invitation.workspaceId),
                  eq(workspaceMembership.userId, actorId),
                ),
              )
              .limit(1);
            if (!workspaceMembershipRow) {
              const [created] = await transaction
                .insert(workspaceMembership)
                .values({
                  workspaceId: invitation.workspaceId,
                  userId: actorId,
                  role: "collaborator",
                })
                .returning({ id: workspaceMembership.id });
              if (!created) throw new Error("Workspace membership insert returned no row.");
              workspaceMembershipAudit = {
                action: "workspace.membership.created",
                resourceId: created.id,
              };
            } else if (workspaceMembershipRow.revokedAt) {
              await transaction
                .update(workspaceMembership)
                .set({
                  revokedAt: null,
                  revokedByUserId: null,
                  version: sql`${workspaceMembership.version} + 1`,
                  updatedAt: now,
                })
                .where(eq(workspaceMembership.id, workspaceMembershipRow.id));
              workspaceMembershipAudit = {
                action: "workspace.membership.reactivated",
                resourceId: workspaceMembershipRow.id,
              };
            }

            let membershipAction:
              | "project.membership.created"
              | "project.membership.reactivated"
              | undefined;
            let membershipId: string;
            const [existingMembership] = await transaction
              .select()
              .from(projectMembership)
              .where(
                and(
                  eq(projectMembership.projectId, invitation.projectId),
                  eq(projectMembership.userId, actorId),
                ),
              )
              .limit(1);
            if (!existingMembership) {
              const [created] = await transaction
                .insert(projectMembership)
                .values({
                  workspaceId: invitation.workspaceId,
                  projectId: invitation.projectId,
                  userId: actorId,
                  role: invitation.role,
                  createdByUserId: invitation.invitedByUserId,
                })
                .returning({ id: projectMembership.id });
              if (!created) throw new Error("Project membership insert returned no row.");
              membershipId = created.id;
              membershipAction = "project.membership.created";
            } else {
              membershipId = existingMembership.id;
              if (existingMembership.removedAt) {
                await transaction
                  .update(projectMembership)
                  .set({
                    role: invitation.role,
                    localeAccessMode: "all",
                    removedAt: null,
                    removedByUserId: null,
                    version: sql`${projectMembership.version} + 1`,
                    updatedAt: now,
                  })
                  .where(eq(projectMembership.id, existingMembership.id));
                await transaction
                  .delete(projectMembershipLocaleAccess)
                  .where(eq(projectMembershipLocaleAccess.membershipId, existingMembership.id));
                membershipAction = "project.membership.reactivated";
              }
            }

            const [accepted] = await transaction
              .update(projectInvitation)
              .set({
                status: "accepted",
                acceptedAt: now,
                acceptedByUserId: actorId,
                version: sql`${projectInvitation.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projectInvitation.id, invitation.id),
                  eq(projectInvitation.status, "pending"),
                ),
              )
              .returning({ id: projectInvitation.id });
            if (!accepted) return outcome("invalid");

            const audits = [
              makeAuditValues({
                workspaceId: invitation.workspaceId,
                projectId: invitation.projectId,
                actorId,
                action: "project.invitation.accepted",
                resourceType: "project_invitation",
                resourceId: invitation.id,
                requestId,
              }),
            ];
            if (workspaceMembershipAudit) {
              audits.push(
                makeAuditValues({
                  workspaceId: invitation.workspaceId,
                  actorId,
                  action: workspaceMembershipAudit.action,
                  resourceType: "workspace_membership",
                  resourceId: workspaceMembershipAudit.resourceId,
                  requestId,
                }),
              );
            }
            if (membershipAction) {
              audits.push(
                makeAuditValues({
                  workspaceId: invitation.workspaceId,
                  projectId: invitation.projectId,
                  actorId,
                  action: membershipAction,
                  resourceType: "project_membership",
                  resourceId: membershipId,
                  requestId,
                }),
              );
            }
            await transaction.insert(auditEvent).values(audits);
            const member = await selectMemberById(transaction, membershipId);
            if (!member) throw new Error("Accepted project membership could not be loaded.");
            return outcomeWith("success", { member });
          }),
        catch: (cause) => databaseFailure("access.invitation.accept", cause),
      });
      if (result.kind === "invalid") return yield* InvitationInvalidFailure.make();
      return yield* decodeDatabaseValue(
        "access.invitation.accept",
        ProjectMember,
        memberValue(result.member),
      );
    }),

    revokeInvitation: Effect.fn("AccessRepository.revokeInvitation")(function* (
      actorId: AuthUserId,
      input: RevokeProjectInvitationInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from project_invitation where id = ${input.invitationId} for update`,
            );
            const [invitation] = await transaction
              .select()
              .from(projectInvitation)
              .where(eq(projectInvitation.id, input.invitationId))
              .limit(1);
            if (!invitation) return outcome("not_found");
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              invitation.projectId,
              "project.member.invite",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            if (invitation.version !== input.version) return outcome("version_conflict");
            if (invitation.status !== "pending" || invitation.expiresAt <= now) {
              if (invitation.status === "pending") {
                await transaction
                  .update(projectInvitation)
                  .set({
                    status: "expired",
                    version: sql`${projectInvitation.version} + 1`,
                    updatedAt: now,
                  })
                  .where(eq(projectInvitation.id, invitation.id));
              }
              return outcome("invalid");
            }
            const [updated] = await transaction
              .update(projectInvitation)
              .set({
                status: "revoked",
                revokedAt: now,
                revokedByUserId: actorId,
                version: sql`${projectInvitation.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projectInvitation.id, invitation.id),
                  eq(projectInvitation.version, input.version),
                  eq(projectInvitation.status, "pending"),
                ),
              )
              .returning();
            if (!updated) return outcome("version_conflict");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: invitation.workspaceId,
                projectId: invitation.projectId,
                actorId,
                action: "project.invitation.revoked",
                resourceType: "project_invitation",
                resourceId: invitation.id,
                requestId,
              }),
            );
            return outcomeWith("success", { row: updated });
          }),
        catch: (cause) => databaseFailure("access.invitation.revoke", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "invitation" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "invalid":
          return yield* InvitationInvalidFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "access.invitation.revoke",
            ProjectInvitation,
            invitationValue(result.row, now),
          );
      }
    }),

    getCurrentAccess: Effect.fn("AccessRepository.getCurrentAccess")(function* (
      actorId: AuthUserId,
      input: GetCurrentProjectAccessInput,
    ) {
      const authorization = yield* Effect.tryPromise({
        try: () => authorizeUserProject(database, actorId, input.projectId, "project.read"),
        catch: (cause) => databaseFailure("access.current.get", cause),
      });
      if (authorization.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "project" });
      }
      if (authorization.kind === "forbidden") return yield* ForbiddenFailure.make();
      return yield* decodeDatabaseValue("access.current.get", CurrentProjectAccess, {
        projectId: input.projectId,
        role: authorization.access.role,
        localeAccess: localeAccessValue(
          authorization.access.localeAccessMode,
          authorization.access.allowedLocaleIds,
        ),
        allowedActions: projectPermissionActionValues.filter((action) =>
          isActionVisibleForLocaleAccess(
            action,
            authorization.access.role,
            authorization.access.localeAccessMode,
            authorization.access.allowedLocaleIds,
          ),
        ),
      });
    }),

    listMembers: Effect.fn("AccessRepository.listMembers")(function* (
      actorId: AuthUserId,
      input: ListProjectMembersInput,
    ) {
      const cursor = input.cursor
        ? yield* decodeProjectMemberCursor(input.cursor, input.projectId)
        : null;
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "project.member.read",
            );
            if (authorization.kind !== "allowed") {
              return outcomeWith(authorization.kind, { rows: [] });
            }
            const cursorCondition = cursor
              ? or(
                  lt(projectMembership.createdAt, new Date(cursor.createdAt)),
                  and(
                    eq(projectMembership.createdAt, new Date(cursor.createdAt)),
                    lt(projectMembership.id, cursor.membershipId),
                  ),
                )
              : undefined;
            const rows = await transaction
              .select({ membership: projectMembership, member: user })
              .from(projectMembership)
              .innerJoin(user, eq(user.id, projectMembership.userId))
              .where(
                and(
                  eq(projectMembership.projectId, input.projectId),
                  isNull(projectMembership.removedAt),
                  cursorCondition,
                ),
              )
              .orderBy(
                sql`${projectMembership.createdAt} desc nulls last`,
                sql`${projectMembership.id} desc nulls last`,
              )
              .limit(input.limit + 1);
            return outcomeWith("success", {
              rows: await attachLocaleAccess(transaction, rows),
            });
          }),
        catch: (cause) => databaseFailure("access.member.list", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();

      const hasNextPage = result.rows.length > input.limit;
      const visible = result.rows.slice(0, input.limit);
      const items = yield* Effect.forEach(visible, (row) =>
        decodeDatabaseValue("access.member.list", ProjectMember, memberValue(row)),
      );
      const last = visible.at(-1);
      const nextCursor =
        hasNextPage && last
          ? yield* encodeProjectMemberCursor({
              projectId: input.projectId,
              createdAt: toIso(last.membership.createdAt),
              membershipId: yield* decodeDatabaseValue(
                "access.member.list",
                ProjectMembershipId,
                last.membership.id,
              ),
            })
          : null;
      return ProjectMemberPage.make({ items, nextCursor });
    }),

    updateMemberRole: Effect.fn("AccessRepository.updateMemberRole")(function* (
      actorId: AuthUserId,
      input: UpdateProjectMemberRoleInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const initial = await selectMemberById(transaction, input.membershipId);
            if (!initial) return outcome("not_found");
            await transaction.execute(
              sql`select id from project where id = ${initial.membership.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              initial.membership.projectId,
              "project.member.role.update",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            const current = await selectMemberById(transaction, input.membershipId);
            if (!current || current.membership.removedAt) return outcome("not_found");
            if (current.membership.version !== input.version) return outcome("version_conflict");
            if (current.membership.role === input.role) {
              return outcomeWith("success", { member: current });
            }
            if (
              current.membership.role === "owner" &&
              input.role !== "owner" &&
              (await activeOwnerCount(transaction, current.membership.projectId)) <= 1
            ) {
              return outcome("last_owner");
            }
            const [updated] = await transaction
              .update(projectMembership)
              .set({
                role: input.role,
                ...(input.role === "owner" ? { localeAccessMode: "all" } : {}),
                version: sql`${projectMembership.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projectMembership.id, input.membershipId),
                  eq(projectMembership.version, input.version),
                  isNull(projectMembership.removedAt),
                ),
              )
              .returning({ id: projectMembership.id });
            if (!updated) return outcome("version_conflict");
            if (input.role === "owner") {
              await transaction
                .delete(projectMembershipLocaleAccess)
                .where(eq(projectMembershipLocaleAccess.membershipId, input.membershipId));
            }
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.membership.workspaceId,
                projectId: current.membership.projectId,
                actorId,
                action: "project.membership.role.updated",
                resourceType: "project_membership",
                resourceId: current.membership.id,
                requestId,
              }),
            );
            const member = await selectMemberById(transaction, input.membershipId);
            if (!member) throw new Error("Updated membership could not be loaded.");
            return outcomeWith("success", { member });
          }),
        catch: (cause) => databaseFailure("access.member.role.update", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "membership" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "last_owner":
          return yield* LastOwnerRequiredFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "access.member.role.update",
            ProjectMember,
            memberValue(result.member),
          );
      }
    }),

    updateMemberLocaleAccess: Effect.fn("AccessRepository.updateMemberLocaleAccess")(function* (
      actorId: AuthUserId,
      input: UpdateProjectMemberLocaleAccessInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const initial = await selectMemberById(transaction, input.membershipId);
            if (!initial) return outcome("not_found");
            await transaction.execute(
              sql`select id from project where id = ${initial.membership.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              initial.membership.projectId,
              "project.member.locale.update",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            const current = await selectMemberById(transaction, input.membershipId);
            if (!current || current.membership.removedAt) return outcome("not_found");
            if (current.membership.version !== input.version) return outcome("version_conflict");
            if (current.membership.role === "owner" && input.access.mode !== "all") {
              return outcome("invalid_state");
            }

            const requestedLocaleIds =
              input.access.mode === "selected" ? [...input.access.localeIds].sort() : [];
            if (input.access.mode === "selected") {
              const localeRows = await transaction
                .select({ id: projectLocale.id })
                .from(projectLocale)
                .where(
                  and(
                    eq(projectLocale.workspaceId, current.membership.workspaceId),
                    eq(projectLocale.projectId, current.membership.projectId),
                    eq(projectLocale.status, "enabled"),
                    inArray(projectLocale.id, requestedLocaleIds),
                  ),
                );
              if (localeRows.length !== requestedLocaleIds.length) {
                return outcome("locale_unavailable");
              }
            }

            const currentLocaleIds = [...current.localeIds].sort();
            if (
              current.membership.localeAccessMode === input.access.mode &&
              currentLocaleIds.length === requestedLocaleIds.length &&
              currentLocaleIds.every((localeId, index) => localeId === requestedLocaleIds[index])
            ) {
              return outcomeWith("success", { member: current });
            }

            const [updated] = await transaction
              .update(projectMembership)
              .set({
                localeAccessMode: input.access.mode,
                version: sql`${projectMembership.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projectMembership.id, input.membershipId),
                  eq(projectMembership.version, input.version),
                  isNull(projectMembership.removedAt),
                ),
              )
              .returning({ id: projectMembership.id });
            if (!updated) return outcome("version_conflict");

            await transaction
              .delete(projectMembershipLocaleAccess)
              .where(eq(projectMembershipLocaleAccess.membershipId, input.membershipId));
            if (input.access.mode === "selected") {
              await transaction.insert(projectMembershipLocaleAccess).values(
                requestedLocaleIds.map((localeId) => ({
                  membershipId: input.membershipId,
                  workspaceId: current.membership.workspaceId,
                  projectId: current.membership.projectId,
                  localeId,
                })),
              );
            }
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.membership.workspaceId,
                projectId: current.membership.projectId,
                actorId,
                action: "project.membership.locale_access.updated",
                resourceType: "project_membership",
                resourceId: current.membership.id,
                requestId,
              }),
            );
            const member = await selectMemberById(transaction, input.membershipId);
            if (!member) throw new Error("Updated membership could not be loaded.");
            return outcomeWith("success", { member });
          }),
        catch: (cause) => databaseFailure("access.member.locale.update", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "membership" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "invalid_state":
          return yield* InvalidStateTransitionFailure.make();
        case "locale_unavailable":
          return yield* LocaleUnavailableFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "access.member.locale.update",
            ProjectMember,
            memberValue(result.member),
          );
      }
    }),

    removeMember: Effect.fn("AccessRepository.removeMember")(function* (
      actorId: AuthUserId,
      input: RemoveProjectMemberInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const initial = await selectMemberById(transaction, input.membershipId);
            if (!initial) return outcome("not_found");
            await transaction.execute(
              sql`select id from project where id = ${initial.membership.projectId} for update`,
            );
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              initial.membership.projectId,
              "project.member.remove",
            );
            if (authorization.kind !== "allowed") return outcome(authorization.kind);
            const current = await selectMemberById(transaction, input.membershipId);
            if (!current || current.membership.removedAt) return outcome("not_found");
            if (current.membership.version !== input.version) return outcome("version_conflict");
            if (
              current.membership.role === "owner" &&
              (await activeOwnerCount(transaction, current.membership.projectId)) <= 1
            ) {
              return outcome("last_owner");
            }
            await transaction.execute(
              sql`select id from workspace_membership where workspace_id = ${current.membership.workspaceId} and user_id = ${current.membership.userId} for update`,
            );
            const [removed] = await transaction
              .update(projectMembership)
              .set({
                removedAt: now,
                removedByUserId: actorId,
                version: sql`${projectMembership.version} + 1`,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projectMembership.id, input.membershipId),
                  eq(projectMembership.version, input.version),
                  isNull(projectMembership.removedAt),
                ),
              )
              .returning({ id: projectMembership.id });
            if (!removed) return outcome("version_conflict");

            const [remaining] = await transaction
              .select({ count: sql<number>`count(*)::int` })
              .from(projectMembership)
              .where(
                and(
                  eq(projectMembership.workspaceId, current.membership.workspaceId),
                  eq(projectMembership.userId, current.membership.userId),
                  isNull(projectMembership.removedAt),
                ),
              );
            if ((remaining?.count ?? 0) === 0) {
              await transaction
                .update(workspaceMembership)
                .set({
                  revokedAt: now,
                  revokedByUserId: actorId,
                  version: sql`${workspaceMembership.version} + 1`,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(workspaceMembership.workspaceId, current.membership.workspaceId),
                    eq(workspaceMembership.userId, current.membership.userId),
                    eq(workspaceMembership.role, "collaborator"),
                    isNull(workspaceMembership.revokedAt),
                  ),
                );
            }
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.membership.workspaceId,
                projectId: current.membership.projectId,
                actorId,
                action: "project.membership.removed",
                resourceType: "project_membership",
                resourceId: current.membership.id,
                requestId,
              }),
            );
            const member = await selectMemberById(transaction, input.membershipId);
            if (!member) throw new Error("Removed membership could not be loaded.");
            return outcomeWith("success", { member });
          }),
        catch: (cause) => databaseFailure("access.member.remove", cause),
      });
      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "membership" });
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "version_conflict":
          return yield* VersionConflictFailure.make();
        case "last_owner":
          return yield* LastOwnerRequiredFailure.make();
        case "success":
          return yield* decodeDatabaseValue(
            "access.member.remove",
            ProjectMember,
            memberValue(result.member),
          );
      }
    }),
  };
}

export class AccessRepository extends Context.Tag("AccessRepository")<
  AccessRepository,
  ReturnType<typeof makeAccessRepository>
>() {}

export const AccessRepositoryLive = Layer.succeed(AccessRepository, makeAccessRepository());
