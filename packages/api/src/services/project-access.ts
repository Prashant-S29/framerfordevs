import { db } from "@framerfordevs/db";
import { and, eq, gt, isNull, or, sql } from "@framerfordevs/db/query";
import {
  apiCredential,
  apiCredentialScope,
  projectMembership,
} from "@framerfordevs/db/schema/access";
import { projectMembershipLocaleAccess } from "@framerfordevs/db/schema/locale";
import { project, workspaceMembership } from "@framerfordevs/db/schema/platform";

import type { ProjectPermissionAction } from "../contracts/access";
import type { CmsActor } from "../contracts/authoring";
import type { AuthUserId } from "../contracts/platform";
import { decideCredentialPolicy, decideUserPolicy } from "./policy";

export type ApplicationDb = typeof db;
export type ApplicationTransaction = Parameters<Parameters<ApplicationDb["transaction"]>[0]>[0];
export type ApplicationExecutor = ApplicationDb | ApplicationTransaction;

export interface UserProjectAccess {
  readonly project: typeof project.$inferSelect;
  readonly role: string;
  readonly projectMembershipId: string | null;
  readonly localeAccessMode: string;
  readonly allowedLocaleIds: ReadonlyArray<string>;
  readonly isWorkspaceOwner: boolean;
}

export type UserProjectAuthorization =
  | { readonly kind: "not_found" }
  | { readonly kind: "forbidden"; readonly access: UserProjectAccess }
  | { readonly kind: "allowed"; readonly access: UserProjectAccess };

export async function selectUserProjectAccess(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  projectId: string,
): Promise<UserProjectAccess | undefined> {
  const [projectRow] = await executor
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (!projectRow) return undefined;

  const [workspaceAccess] = await executor
    .select({ role: workspaceMembership.role })
    .from(workspaceMembership)
    .where(
      and(
        eq(workspaceMembership.workspaceId, projectRow.workspaceId),
        eq(workspaceMembership.userId, actorId),
        isNull(workspaceMembership.revokedAt),
      ),
    )
    .limit(1);
  if (!workspaceAccess) return undefined;
  if (workspaceAccess.role === "owner") {
    return {
      project: projectRow,
      role: "owner",
      projectMembershipId: null,
      localeAccessMode: "all",
      allowedLocaleIds: [],
      isWorkspaceOwner: true,
    };
  }

  const [membership] = await executor
    .select({
      id: projectMembership.id,
      role: projectMembership.role,
      localeAccessMode: projectMembership.localeAccessMode,
    })
    .from(projectMembership)
    .where(
      and(
        eq(projectMembership.workspaceId, projectRow.workspaceId),
        eq(projectMembership.projectId, projectRow.id),
        eq(projectMembership.userId, actorId),
        isNull(projectMembership.removedAt),
      ),
    )
    .limit(1);
  if (!membership) return undefined;

  const allowedLocaleIds =
    membership.localeAccessMode === "selected"
      ? (
          await executor
            .select({ localeId: projectMembershipLocaleAccess.localeId })
            .from(projectMembershipLocaleAccess)
            .where(
              and(
                eq(projectMembershipLocaleAccess.membershipId, membership.id),
                eq(projectMembershipLocaleAccess.workspaceId, projectRow.workspaceId),
                eq(projectMembershipLocaleAccess.projectId, projectRow.id),
              ),
            )
        ).map((row) => row.localeId)
      : [];

  return {
    project: projectRow,
    role: membership.role,
    projectMembershipId: membership.id,
    localeAccessMode: membership.localeAccessMode,
    allowedLocaleIds,
    isWorkspaceOwner: false,
  };
}

export async function authorizeCmsActorProject(
  executor: ApplicationExecutor,
  actor: CmsActor,
  projectId: string,
  environmentId: string,
  action: ProjectPermissionAction,
  requestedLocaleId: string | null = null,
): Promise<UserProjectAuthorization> {
  if (actor.kind === "user") {
    return authorizeUserProject(executor, actor.id, projectId, action, requestedLocaleId);
  }

  const [credential] = await executor
    .select()
    .from(apiCredential)
    .where(
      and(
        eq(apiCredential.id, actor.id),
        eq(apiCredential.projectId, projectId),
        eq(apiCredential.environmentId, environmentId),
        isNull(apiCredential.revokedAt),
        or(isNull(apiCredential.expiresAt), gt(apiCredential.expiresAt, sql`now()`)),
      ),
    )
    .limit(1);
  if (!credential) return { kind: "not_found" };

  const [projectRow, scopeRows] = await Promise.all([
    executor
      .select()
      .from(project)
      .where(
        and(eq(project.id, credential.projectId), eq(project.workspaceId, credential.workspaceId)),
      )
      .limit(1)
      .then((rows) => rows[0]),
    executor
      .select({ scope: apiCredentialScope.scope })
      .from(apiCredentialScope)
      .where(
        and(
          eq(apiCredentialScope.credentialId, credential.id),
          eq(apiCredentialScope.workspaceId, credential.workspaceId),
          eq(apiCredentialScope.projectId, credential.projectId),
          eq(apiCredentialScope.environmentId, credential.environmentId),
        ),
      ),
  ]);
  if (!projectRow) return { kind: "not_found" };

  const access: UserProjectAccess = {
    project: projectRow,
    role: "developer",
    projectMembershipId: null,
    localeAccessMode: "all",
    allowedLocaleIds: [],
    isWorkspaceOwner: false,
  };
  const decision = decideCredentialPolicy({
    action,
    family: credential.family,
    scopes: scopeRows.map((row) => row.scope),
    subjectWorkspaceId: credential.workspaceId,
    subjectProjectId: credential.projectId,
    subjectEnvironmentId: credential.environmentId,
    workspaceId: projectRow.workspaceId,
    projectId: projectRow.id,
    environmentId,
    isActive: true,
  });
  return decision.allowed ? { kind: "allowed", access } : { kind: "forbidden", access };
}

export async function authorizeUserProject(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  projectId: string,
  action: ProjectPermissionAction,
  requestedLocaleId: string | null = null,
): Promise<UserProjectAuthorization> {
  const access = await selectUserProjectAccess(executor, actorId, projectId);
  if (!access) return { kind: "not_found" };

  const decision = decideUserPolicy({
    action,
    role: access.role,
    subjectWorkspaceId: access.project.workspaceId,
    subjectProjectId: access.project.id,
    workspaceId: access.project.workspaceId,
    projectId: access.project.id,
    localeAccessMode: access.localeAccessMode,
    allowedLocaleIds: access.allowedLocaleIds,
    requestedLocaleId,
    isActive: true,
  });
  return decision.allowed ? { kind: "allowed", access } : { kind: "forbidden", access };
}
