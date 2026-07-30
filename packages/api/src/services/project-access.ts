import { db } from "@framerfordevs/db";
import { and, eq, isNull } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { project, workspaceMembership } from "@framerfordevs/db/schema/platform";

import type { ProjectPermissionAction } from "../contracts/access";
import type { AuthUserId } from "../contracts/platform";
import { decideUserPolicy } from "./policy";

export type ApplicationDb = typeof db;
export type ApplicationTransaction = Parameters<Parameters<ApplicationDb["transaction"]>[0]>[0];
export type ApplicationExecutor = ApplicationDb | ApplicationTransaction;

export interface UserProjectAccess {
  readonly project: typeof project.$inferSelect;
  readonly role: string;
  readonly projectMembershipId: string | null;
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
      isWorkspaceOwner: true,
    };
  }

  const [membership] = await executor
    .select({ id: projectMembership.id, role: projectMembership.role })
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

  return {
    project: projectRow,
    role: membership.role,
    projectMembershipId: membership.id,
    isWorkspaceOwner: false,
  };
}

export async function authorizeUserProject(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  projectId: string,
  action: ProjectPermissionAction,
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
    isActive: true,
  });
  return decision.allowed ? { kind: "allowed", access } : { kind: "forbidden", access };
}
