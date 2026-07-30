import type { RouterClient } from "@orpc/server";

import {
  AcceptProjectInvitationInputSchema,
  ApiCredentialOutputSchema,
  ApiCredentialPageOutputSchema,
  CreateProjectInvitationInputSchema,
  CurrentProjectAccessOutputSchema,
  GetCurrentProjectAccessInputSchema,
  InspectProjectInvitationInputSchema,
  InspectedProjectInvitationOutputSchema,
  IssueApiCredentialInputSchema,
  IssuedApiCredentialOutputSchema,
  IssuedProjectInvitationOutputSchema,
  ListApiCredentialsInputSchema,
  ListProjectInvitationsInputSchema,
  ListProjectMembersInputSchema,
  ProjectInvitationOutputSchema,
  ProjectInvitationPageOutputSchema,
  ProjectMemberOutputSchema,
  ProjectMemberPageOutputSchema,
  RemoveProjectMemberInputSchema,
  RevokeApiCredentialInputSchema,
  RevokeProjectInvitationInputSchema,
  RotateApiCredentialInputSchema,
  UpdateProjectMemberRoleInputSchema,
} from "../contracts/access";
import {
  ArchiveProjectInputSchema,
  CapabilityOutputSchema,
  CreateProjectInputSchema,
  CreateWorkspaceInputSchema,
  EnableCapabilityInputSchema,
  GetProjectInputSchema,
  ListProjectsInputSchema,
  ListWorkspacesInputSchema,
  ProjectOutputSchema,
  ProjectPageOutputSchema,
  UpdateProjectInputSchema,
  WorkspaceOutputSchema,
  WorkspacePageOutputSchema,
} from "../contracts/platform";
import { executeProcedure, protectedProcedure, publicProcedure } from "../index";
import {
  acceptProjectInvitation,
  createProjectInvitation,
  getCurrentProjectAccess,
  inspectProjectInvitation,
  listProjectInvitations,
  listProjectMembers,
  removeProjectMember,
  revokeProjectInvitation,
  updateProjectMemberRole,
} from "../operations/access";
import {
  issueApiCredential,
  listApiCredentials,
  revokeApiCredential,
  rotateApiCredential,
} from "../operations/credentials";
import {
  archiveProject,
  createProject,
  createWorkspace,
  enableCapability,
  getProject,
  listProjects,
  listWorkspaces,
  updateProject,
} from "../operations/platform";
import { healthCheck, loadPrivateData } from "../operations/system";

export const appRouter = {
  healthCheck: publicProcedure.handler(({ context }) =>
    executeProcedure(context, "api.health", healthCheck(), "Service is healthy."),
  ),
  privateData: protectedProcedure.handler(({ context }) =>
    executeProcedure(
      context,
      "api.private-data",
      loadPrivateData(context.session),
      "Private data loaded.",
    ),
  ),
  platform: {
    workspaces: {
      create: protectedProcedure
        .input(CreateWorkspaceInputSchema)
        .output(WorkspaceOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.workspace.create",
            createWorkspace(context.session.user.id, input, context.request.requestId),
            "Workspace created.",
          ),
        ),
      list: protectedProcedure
        .input(ListWorkspacesInputSchema)
        .output(WorkspacePageOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.workspace.list",
            listWorkspaces(context.session.user.id, input),
            "Workspaces loaded.",
          ),
        ),
    },
    projects: {
      create: protectedProcedure
        .input(CreateProjectInputSchema)
        .output(ProjectOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.project.create",
            createProject(context.session.user.id, input, context.request.requestId),
            "Project created.",
          ),
        ),
      list: protectedProcedure
        .input(ListProjectsInputSchema)
        .output(ProjectPageOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.project.list",
            listProjects(context.session.user.id, input),
            "Projects loaded.",
          ),
        ),
      get: protectedProcedure
        .input(GetProjectInputSchema)
        .output(ProjectOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.project.get",
            getProject(context.session.user.id, input),
            "Project loaded.",
          ),
        ),
      update: protectedProcedure
        .input(UpdateProjectInputSchema)
        .output(ProjectOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.project.update",
            updateProject(context.session.user.id, input, context.request.requestId),
            "Project updated.",
          ),
        ),
      archive: protectedProcedure
        .input(ArchiveProjectInputSchema)
        .output(ProjectOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.project.archive",
            archiveProject(context.session.user.id, input, context.request.requestId),
            "Project archived.",
          ),
        ),
      enableCapability: protectedProcedure
        .input(EnableCapabilityInputSchema)
        .output(CapabilityOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.project.capability.enable",
            enableCapability(context.session.user.id, input, context.request.requestId),
            "Capability enabled.",
          ),
        ),
      access: protectedProcedure
        .input(GetCurrentProjectAccessInputSchema)
        .output(CurrentProjectAccessOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.access.current.get",
            getCurrentProjectAccess(context.session.user.id, input),
            "Project access loaded.",
          ),
        ),
      members: {
        list: protectedProcedure
          .input(ListProjectMembersInputSchema)
          .output(ProjectMemberPageOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.member.list",
              listProjectMembers(context.session.user.id, input),
              "Project members loaded.",
            ),
          ),
        updateRole: protectedProcedure
          .input(UpdateProjectMemberRoleInputSchema)
          .output(ProjectMemberOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.member.role.update",
              updateProjectMemberRole(context.session.user.id, input, context.request.requestId),
              "Member role updated.",
            ),
          ),
        remove: protectedProcedure
          .input(RemoveProjectMemberInputSchema)
          .output(ProjectMemberOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.member.remove",
              removeProjectMember(context.session.user.id, input, context.request.requestId),
              "Member removed.",
            ),
          ),
      },
      credentials: {
        issue: protectedProcedure
          .input(IssueApiCredentialInputSchema)
          .output(IssuedApiCredentialOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.credential.issue",
              issueApiCredential(context.session.user.id, input, context.request.requestId),
              "Credential issued. Copy the key now.",
            ),
          ),
        list: protectedProcedure
          .input(ListApiCredentialsInputSchema)
          .output(ApiCredentialPageOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.credential.list",
              listApiCredentials(context.session.user.id, input),
              "API credentials loaded.",
            ),
          ),
        rotate: protectedProcedure
          .input(RotateApiCredentialInputSchema)
          .output(IssuedApiCredentialOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.credential.rotate",
              rotateApiCredential(context.session.user.id, input, context.request.requestId),
              "Credential rotated. Copy the new key now.",
            ),
          ),
        revoke: protectedProcedure
          .input(RevokeApiCredentialInputSchema)
          .output(ApiCredentialOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.credential.revoke",
              revokeApiCredential(context.session.user.id, input, context.request.requestId),
              "Credential revoked.",
            ),
          ),
      },
      invitations: {
        create: protectedProcedure
          .input(CreateProjectInvitationInputSchema)
          .output(IssuedProjectInvitationOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.invitation.create",
              createProjectInvitation(context.session.user.id, input, context.request.requestId),
              "Invitation created. Copy the one-time link now.",
            ),
          ),
        list: protectedProcedure
          .input(ListProjectInvitationsInputSchema)
          .output(ProjectInvitationPageOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.invitation.list",
              listProjectInvitations(context.session.user.id, input),
              "Project invitations loaded.",
            ),
          ),
        inspect: protectedProcedure
          .input(InspectProjectInvitationInputSchema)
          .output(InspectedProjectInvitationOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.invitation.inspect",
              inspectProjectInvitation(context.session.user.email, input),
              "Invitation loaded.",
            ),
          ),
        accept: protectedProcedure
          .input(AcceptProjectInvitationInputSchema)
          .output(ProjectMemberOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.invitation.accept",
              acceptProjectInvitation(
                context.session.user.id,
                context.session.user.email,
                input,
                context.request.requestId,
              ),
              "Invitation accepted.",
            ),
          ),
        revoke: protectedProcedure
          .input(RevokeProjectInvitationInputSchema)
          .output(ProjectInvitationOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.invitation.revoke",
              revokeProjectInvitation(context.session.user.id, input, context.request.requestId),
              "Invitation revoked.",
            ),
          ),
      },
    },
  },
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
