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
  UpdateProjectMemberLocaleAccessInputSchema,
  UpdateProjectMemberRoleInputSchema,
} from "../contracts/access";
import {
  CmsEntryDraftOutputSchema,
  CmsEntryOutputSchema,
  CmsEntryPageOutputSchema,
  CreateEntryInputSchema,
  EntryRevisionPageOutputSchema,
  GetEntryDraftInputSchema,
  ListEntriesInputSchema,
  ListEntryRevisionsInputSchema,
  RenameEntryInputSchema,
  RestoreEntryRevisionInputSchema,
  SaveEntryDraftInputSchema,
  SaveEntryDraftResultOutputSchema,
} from "../contracts/entries";
import {
  CreateProjectLocaleInputSchema,
  ListProjectLocalesInputSchema,
  ProjectLocaleListOutputSchema,
  ProjectLocaleOutputSchema,
  ReorderProjectLocalesInputSchema,
  UpdateProjectLocaleDisplayNameInputSchema,
  UpdateProjectLocaleStatusInputSchema,
} from "../contracts/locales";
import {
  CmsCollectionOutputSchema,
  CmsCollectionPageOutputSchema,
  CollectionDraftSchemaOutputSchema,
  CollectionSchemaValidationOutputSchema,
  CreateCollectionFieldInputSchema,
  CreateCollectionInputSchema,
  GetCollectionDraftInputSchema,
  GetCollectionInputSchema,
  GetDraftGeneratedFormInputSchema,
  GeneratedFormDefinitionOutputSchema,
  GetLatestPublishedSchemaInputSchema,
  GetPublishedGeneratedFormInputSchema,
  GetPublishedSchemaRevisionInputSchema,
  ListCollectionsInputSchema,
  PublishCollectionSchemaInputSchema,
  PublishedSchemaRevisionOutputSchema,
  RemoveCollectionFieldInputSchema,
  ReplaceCollectionDraftFieldsInputSchema,
  ReorderCollectionFieldsInputSchema,
  UpdateCollectionFieldInputSchema,
  UpdateCollectionInputSchema,
  UpdateEditorLayoutInputSchema,
  ValidateCollectionSchemaInputSchema,
} from "../contracts/schemas";
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
  updateProjectMemberLocaleAccess,
  updateProjectMemberRole,
} from "../operations/access";
import {
  createEntry,
  getEntryDraft,
  listEntries,
  listEntryRevisions,
  renameEntry,
  restoreEntryRevision,
  saveEntryDraft,
} from "../operations/entries";
import {
  issueApiCredential,
  listApiCredentials,
  revokeApiCredential,
  rotateApiCredential,
} from "../operations/credentials";
import {
  createProjectLocale,
  listProjectLocales,
  reorderProjectLocales,
  updateProjectLocaleDisplayName,
  updateProjectLocaleStatus,
} from "../operations/locales";
import {
  createCollection,
  createCollectionField,
  getCollection,
  getCollectionDraft,
  getDraftGeneratedForm,
  getLatestPublishedSchema,
  getPublishedGeneratedForm,
  getPublishedSchemaRevision,
  listCollections,
  publishCollectionSchema,
  removeCollectionField,
  replaceCollectionDraftFields,
  reorderCollectionFields,
  updateCollection,
  updateCollectionField,
  updateEditorLayout,
  validateCollectionSchema,
} from "../operations/schemas";
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
        updateLocaleAccess: protectedProcedure
          .input(UpdateProjectMemberLocaleAccessInputSchema)
          .output(ProjectMemberOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.member.locale.update",
              updateProjectMemberLocaleAccess(
                context.session.user.id,
                input,
                context.request.requestId,
              ),
              "Member locale access updated.",
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
      locales: {
        list: protectedProcedure
          .input(ListProjectLocalesInputSchema)
          .output(ProjectLocaleListOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.locale.list",
              listProjectLocales(context.session.user.id, input),
              "Project locales loaded.",
            ),
          ),
        create: protectedProcedure
          .input(CreateProjectLocaleInputSchema)
          .output(ProjectLocaleOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.locale.create",
              createProjectLocale(context.session.user.id, input, context.request.requestId),
              "Locale created.",
            ),
          ),
        updateDisplayName: protectedProcedure
          .input(UpdateProjectLocaleDisplayNameInputSchema)
          .output(ProjectLocaleOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.locale.display_name.update",
              updateProjectLocaleDisplayName(
                context.session.user.id,
                input,
                context.request.requestId,
              ),
              "Locale display name updated.",
            ),
          ),
        reorder: protectedProcedure
          .input(ReorderProjectLocalesInputSchema)
          .output(ProjectLocaleListOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.locale.reorder",
              reorderProjectLocales(context.session.user.id, input, context.request.requestId),
              "Locales reordered.",
            ),
          ),
        updateStatus: protectedProcedure
          .input(UpdateProjectLocaleStatusInputSchema)
          .output(ProjectLocaleOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.locale.status.update",
              updateProjectLocaleStatus(context.session.user.id, input, context.request.requestId),
              "Locale status updated.",
            ),
          ),
      },
      collections: {
        list: protectedProcedure
          .input(ListCollectionsInputSchema)
          .output(CmsCollectionPageOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.schema.collection.list",
              listCollections(context.session.user.id, input),
              "Collections loaded.",
            ),
          ),
        create: protectedProcedure
          .input(CreateCollectionInputSchema)
          .output(CmsCollectionOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.schema.collection.create",
              createCollection(context.session.user.id, input, context.request.requestId),
              "Collection created.",
            ),
          ),
        get: protectedProcedure
          .input(GetCollectionInputSchema)
          .output(CmsCollectionOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.schema.collection.get",
              getCollection(context.session.user.id, input),
              "Collection loaded.",
            ),
          ),
        update: protectedProcedure
          .input(UpdateCollectionInputSchema)
          .output(CmsCollectionOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.schema.collection.update",
              updateCollection(context.session.user.id, input, context.request.requestId),
              "Collection updated.",
            ),
          ),
        entries: {
          list: protectedProcedure
            .input(ListEntriesInputSchema)
            .output(CmsEntryPageOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.entry.list",
                listEntries(context.session.user.id, input),
                "Entries loaded.",
              ),
            ),
          create: protectedProcedure
            .input(CreateEntryInputSchema)
            .output(CmsEntryOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.entry.create",
                createEntry(context.session.user.id, input, context.request.requestId),
                "Entry created.",
              ),
            ),
          rename: protectedProcedure
            .input(RenameEntryInputSchema)
            .output(CmsEntryOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.entry.rename",
                renameEntry(context.session.user.id, input, context.request.requestId),
                "Entry renamed.",
              ),
            ),
          getDraft: protectedProcedure
            .input(GetEntryDraftInputSchema)
            .output(CmsEntryDraftOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.entry.draft.get",
                getEntryDraft(context.session.user.id, input),
                "Entry draft loaded.",
              ),
            ),
          saveDraft: protectedProcedure
            .input(SaveEntryDraftInputSchema)
            .output(SaveEntryDraftResultOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.entry.draft.save",
                saveEntryDraft(context.session.user.id, input, context.request.requestId),
                "Entry draft saved.",
              ),
            ),
          listRevisions: protectedProcedure
            .input(ListEntryRevisionsInputSchema)
            .output(EntryRevisionPageOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.entry.revision.list",
                listEntryRevisions(context.session.user.id, input),
                "Entry revisions loaded.",
              ),
            ),
          restoreRevision: protectedProcedure
            .input(RestoreEntryRevisionInputSchema)
            .output(SaveEntryDraftResultOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.entry.revision.restore",
                restoreEntryRevision(context.session.user.id, input, context.request.requestId),
                "Entry revision restored.",
              ),
            ),
        },
        schema: {
          draft: {
            get: protectedProcedure
              .input(GetCollectionDraftInputSchema)
              .output(CollectionDraftSchemaOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.draft.get",
                  getCollectionDraft(context.session.user.id, input),
                  "Draft schema loaded.",
                ),
              ),
          },
          fields: {
            create: protectedProcedure
              .input(CreateCollectionFieldInputSchema)
              .output(CollectionDraftSchemaOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.field.create",
                  createCollectionField(context.session.user.id, input, context.request.requestId),
                  "Field created.",
                ),
              ),
            update: protectedProcedure
              .input(UpdateCollectionFieldInputSchema)
              .output(CollectionDraftSchemaOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.field.update",
                  updateCollectionField(context.session.user.id, input, context.request.requestId),
                  "Field updated.",
                ),
              ),
            replace: protectedProcedure
              .input(ReplaceCollectionDraftFieldsInputSchema)
              .output(CollectionDraftSchemaOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.field.replace",
                  replaceCollectionDraftFields(
                    context.session.user.id,
                    input,
                    context.request.requestId,
                  ),
                  "Schema fields saved.",
                ),
              ),
            remove: protectedProcedure
              .input(RemoveCollectionFieldInputSchema)
              .output(CollectionDraftSchemaOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.field.remove",
                  removeCollectionField(context.session.user.id, input, context.request.requestId),
                  "Field removed.",
                ),
              ),
            reorder: protectedProcedure
              .input(ReorderCollectionFieldsInputSchema)
              .output(CollectionDraftSchemaOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.field.reorder",
                  reorderCollectionFields(
                    context.session.user.id,
                    input,
                    context.request.requestId,
                  ),
                  "Fields reordered.",
                ),
              ),
          },
          layout: {
            update: protectedProcedure
              .input(UpdateEditorLayoutInputSchema)
              .output(CollectionDraftSchemaOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.layout.update",
                  updateEditorLayout(context.session.user.id, input, context.request.requestId),
                  "Editor layout updated.",
                ),
              ),
          },
          form: {
            getDraft: protectedProcedure
              .input(GetDraftGeneratedFormInputSchema)
              .output(GeneratedFormDefinitionOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.form.get_draft",
                  getDraftGeneratedForm(context.session.user.id, input),
                  "Draft form definition loaded.",
                ),
              ),
            getPublished: protectedProcedure
              .input(GetPublishedGeneratedFormInputSchema)
              .output(GeneratedFormDefinitionOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.form.get_published",
                  getPublishedGeneratedForm(context.session.user.id, input),
                  "Published form definition loaded.",
                ),
              ),
          },
          validate: protectedProcedure
            .input(ValidateCollectionSchemaInputSchema)
            .output(CollectionSchemaValidationOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.schema.validate",
                validateCollectionSchema(context.session.user.id, input),
                "Schema validation completed.",
              ),
            ),
          publish: protectedProcedure
            .input(PublishCollectionSchemaInputSchema)
            .output(PublishedSchemaRevisionOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.schema.publish",
                publishCollectionSchema(context.session.user.id, input, context.request.requestId),
                "Schema published.",
              ),
            ),
          published: {
            getLatest: protectedProcedure
              .input(GetLatestPublishedSchemaInputSchema)
              .output(PublishedSchemaRevisionOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.published.get_latest",
                  getLatestPublishedSchema(context.session.user.id, input),
                  "Published schema loaded.",
                ),
              ),
            getRevision: protectedProcedure
              .input(GetPublishedSchemaRevisionInputSchema)
              .output(PublishedSchemaRevisionOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.published.get_revision",
                  getPublishedSchemaRevision(context.session.user.id, input),
                  "Published schema revision loaded.",
                ),
              ),
          },
        },
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
