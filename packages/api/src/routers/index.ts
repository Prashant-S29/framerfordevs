import type { RouterClient } from "@orpc/server";

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
    },
  },
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
