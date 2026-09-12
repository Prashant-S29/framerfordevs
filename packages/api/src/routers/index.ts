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
  DeliveryConfigurationOutputSchema,
  GetDeliveryConfigurationInputSchema,
  UpdateDeliveryConfigurationInputSchema,
} from "../contracts/delivery";
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
} from "../contracts/entry";
import {
  GetCurrentUserPreviewInputSchema,
  GetRevisionUserPreviewInputSchema,
  PreviewItemOutputSchema,
} from "../contracts/preview";
import {
  EntryPublicationPageOutputSchema,
  EntryPublicationPlanOutputSchema,
  EntryPublicationStatusOutputSchema,
  GetEntryPublicationStatusInputSchema,
  ListEntryPublicationsInputSchema,
  PublishEntryInputSchema,
  PublishEntryResultOutputSchema,
  UnpublishEntryInputSchema,
  UnpublishEntryResultOutputSchema,
  ValidateEntryPublicationInputSchema,
} from "../contracts/publication";
import {
  CreateProjectLocaleInputSchema,
  ListProjectLocalesInputSchema,
  ProjectLocaleListOutputSchema,
  ProjectLocaleOutputSchema,
  ReorderProjectLocalesInputSchema,
  UpdateProjectLocaleDisplayNameInputSchema,
  UpdateProjectLocaleStatusInputSchema,
} from "../contracts/locale";
import {
  CollectionPresentationOutputSchema,
  GetCollectionPresentationInputSchema,
  PublishCollectionPresentationInputSchema,
  PublishCollectionPresentationOutputSchema,
} from "../contracts/presentation/management";
import {
  CmsCollectionOutputSchema,
  CmsCollectionPageOutputSchema,
  CollectionDraftSchemaOutputSchema,
  GetCollectionDraftInputSchema,
  GetCollectionInputSchema,
  GetDraftGeneratedFormInputSchema,
  GeneratedFormDefinitionOutputSchema,
  GetLatestPublishedSchemaInputSchema,
  GetPublishedGeneratedFormInputSchema,
  GetPublishedSchemaRevisionInputSchema,
  ListCollectionsInputSchema,
  PublishedSchemaRevisionOutputSchema,
} from "../contracts/schema";
import {
  CreateInvalidationRouteMappingInputSchema,
  CreateWebhookEndpointInputSchema,
  InvalidationRouteMappingOutputSchema,
  InvalidationRouteMappingPageOutputSchema,
  IssuedWebhookEndpointOutputSchema,
  ListInvalidationRouteMappingsInputSchema,
  ListWebhookAttemptsInputSchema,
  ListWebhookDeliveriesInputSchema,
  ListWebhookEndpointsInputSchema,
  ReplayWebhookEventInputSchema,
  ReplaceWebhookSubscriptionsInputSchema,
  RotatedWebhookSecretOutputSchema,
  SetInvalidationRouteMappingStateInputSchema,
  SetWebhookEndpointStateInputSchema,
  StartWebhookSecretRotationInputSchema,
  UpdateInvalidationRouteMappingInputSchema,
  UpdateWebhookEndpointInputSchema,
  ChangeWebhookSecretRotationInputSchema,
  ReplayWebhookEventResultOutputSchema,
  WebhookAttemptPageOutputSchema,
  WebhookDeliveryPageOutputSchema,
  WebhookEndpointOutputSchema,
  WebhookEndpointPageOutputSchema,
} from "../contracts/webhook";
import {
  ControlPlanePutStudioRegistrationInputSchema,
  ControlPlanePutStudioRegistrationOutputSchema,
  ControlPlaneStudioRegistrationScopeSchema,
  StudioRegistrationOutputSchema,
} from "../contracts/control-plane";
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
  RestoreProjectInputSchema,
  UpdateProjectInputSchema,
  WorkspaceOutputSchema,
  WorkspacePageOutputSchema,
} from "../contracts/platform";
import { executeProcedure, protectedProcedure, publicProcedure } from "..";
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
import { getDeliveryConfiguration, updateDeliveryConfiguration } from "../operations/delivery/api";
import {
  createEntry,
  getEntryDraft,
  listEntries,
  listEntryRevisions,
  renameEntry,
  restoreEntryRevision,
  saveEntryDraft,
} from "../operations/entries";
import { getUserCurrentPreview, getUserRevisionPreview } from "../operations/preview/api";
import {
  getEntryPublicationStatus,
  listEntryPublications,
  publishEntryLocale,
  unpublishEntryLocale,
  validateEntryPublication,
} from "../operations/publications";
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
  getCollection,
  getCollectionDraft,
  getCollectionPresentation,
  getDraftGeneratedForm,
  getLatestPublishedSchema,
  getPublishedGeneratedForm,
  getPublishedSchemaRevision,
  listCollections,
  publishCollectionPresentation,
} from "../operations/schemas";
import {
  archiveProject,
  createProject,
  createWorkspace,
  enableCapability,
  getProject,
  listProjects,
  listWorkspaces,
  restoreProject,
  updateProject,
} from "../operations/platform";
import {
  getStudioRegistrationForSession,
  putStudioRegistrationForSession,
} from "../operations/control-plane";
import { healthCheck, loadPrivateData } from "../operations/system";
import {
  createInvalidationMapping,
  createWebhookEndpoint,
  listInvalidationMappings,
  listWebhookAttempts,
  listWebhookDeliveries,
  listWebhookEndpoints,
  replayWebhookEvent,
  replaceWebhookSubscriptions,
  setInvalidationMappingState,
  setWebhookEndpointState,
  startWebhookSecretRotation,
  changeWebhookSecretRotation,
  updateInvalidationMapping,
  updateWebhookEndpoint,
} from "../operations/webhook/api";

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
  webhooks: {
    endpoints: {
      create: protectedProcedure
        .input(CreateWebhookEndpointInputSchema)
        .output(IssuedWebhookEndpointOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.endpoint.create",
            createWebhookEndpoint(context.session.user.id, input, context.request.requestId),
            "Webhook endpoint created. Copy the signing secret now.",
          ),
        ),
      update: protectedProcedure
        .input(UpdateWebhookEndpointInputSchema)
        .output(WebhookEndpointOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.endpoint.update",
            updateWebhookEndpoint(context.session.user.id, input, context.request.requestId),
            "Webhook endpoint updated.",
          ),
        ),
      list: protectedProcedure
        .input(ListWebhookEndpointsInputSchema)
        .output(WebhookEndpointPageOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.endpoint.list",
            listWebhookEndpoints(context.session.user.id, input),
            "Webhook endpoints loaded.",
          ),
        ),
      setState: protectedProcedure
        .input(SetWebhookEndpointStateInputSchema)
        .output(WebhookEndpointOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.endpoint.state",
            setWebhookEndpointState(context.session.user.id, input, context.request.requestId),
            "Webhook endpoint state updated.",
          ),
        ),
      replaceSubscriptions: protectedProcedure
        .input(ReplaceWebhookSubscriptionsInputSchema)
        .output(WebhookEndpointOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.subscription.replace",
            replaceWebhookSubscriptions(context.session.user.id, input, context.request.requestId),
            "Webhook subscriptions updated.",
          ),
        ),
      startRotation: protectedProcedure
        .input(StartWebhookSecretRotationInputSchema)
        .output(RotatedWebhookSecretOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.secret.start",
            startWebhookSecretRotation(context.session.user.id, input, context.request.requestId),
            "Next webhook signing secret generated. Copy it now.",
          ),
        ),
      changeRotation: protectedProcedure
        .input(ChangeWebhookSecretRotationInputSchema)
        .output(WebhookEndpointOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.secret.change",
            changeWebhookSecretRotation(context.session.user.id, input, context.request.requestId),
            "Webhook secret rotation updated.",
          ),
        ),
    },
    mappings: {
      create: protectedProcedure
        .input(CreateInvalidationRouteMappingInputSchema)
        .output(InvalidationRouteMappingOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.mapping.create",
            createInvalidationMapping(context.session.user.id, input, context.request.requestId),
            "Invalidation mapping created.",
          ),
        ),
      update: protectedProcedure
        .input(UpdateInvalidationRouteMappingInputSchema)
        .output(InvalidationRouteMappingOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.mapping.update",
            updateInvalidationMapping(context.session.user.id, input, context.request.requestId),
            "Invalidation mapping updated.",
          ),
        ),
      setState: protectedProcedure
        .input(SetInvalidationRouteMappingStateInputSchema)
        .output(InvalidationRouteMappingOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.mapping.state",
            setInvalidationMappingState(context.session.user.id, input, context.request.requestId),
            "Invalidation mapping state updated.",
          ),
        ),
      list: protectedProcedure
        .input(ListInvalidationRouteMappingsInputSchema)
        .output(InvalidationRouteMappingPageOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.mapping.list",
            listInvalidationMappings(context.session.user.id, input),
            "Invalidation mappings loaded.",
          ),
        ),
    },
    deliveries: {
      list: protectedProcedure
        .input(ListWebhookDeliveriesInputSchema)
        .output(WebhookDeliveryPageOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.delivery.list",
            listWebhookDeliveries(context.session.user.id, input),
            "Webhook deliveries loaded.",
          ),
        ),
      replay: protectedProcedure
        .input(ReplayWebhookEventInputSchema)
        .output(ReplayWebhookEventResultOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.delivery.replay",
            replayWebhookEvent(context.session.user.id, input, context.request.requestId),
            "Webhook event replay queued.",
          ),
        ),
    },
    attempts: {
      list: protectedProcedure
        .input(ListWebhookAttemptsInputSchema)
        .output(WebhookAttemptPageOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.attempt.list",
            listWebhookAttempts(context.session.user.id, input),
            "Webhook attempts loaded.",
          ),
        ),
    },
  },
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
      studioRegistration: {
        get: protectedProcedure
          .input(ControlPlaneStudioRegistrationScopeSchema)
          .output(StudioRegistrationOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.control-plane.studio-registration.get",
              getStudioRegistrationForSession(context.session.user.id, input),
              "Studio registration loaded.",
            ),
          ),
        put: protectedProcedure
          .input(ControlPlanePutStudioRegistrationInputSchema)
          .output(ControlPlanePutStudioRegistrationOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.control-plane.studio-registration.put",
              putStudioRegistrationForSession(
                context.session.user.id,
                input,
                context.request.requestId,
              ),
              "Studio registration saved.",
            ),
          ),
      },
      restore: protectedProcedure
        .input(RestoreProjectInputSchema)
        .output(ProjectOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.platform.project.restore",
            restoreProject(context.session.user.id, input, context.request.requestId),
            "Project restored.",
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
        deliveryConfiguration: {
          get: protectedProcedure
            .input(GetDeliveryConfigurationInputSchema)
            .output(DeliveryConfigurationOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.delivery.configuration.get",
                getDeliveryConfiguration(context.session.user.id, input),
                "Delivery configuration loaded.",
              ),
            ),
          update: protectedProcedure
            .input(UpdateDeliveryConfigurationInputSchema)
            .output(DeliveryConfigurationOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.delivery.configuration.update",
                updateDeliveryConfiguration(
                  context.session.user.id,
                  input,
                  context.request.requestId,
                ),
                "Delivery configuration updated.",
              ),
            ),
        },
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
          preview: {
            current: protectedProcedure
              .input(GetCurrentUserPreviewInputSchema)
              .output(PreviewItemOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.preview.user.current",
                  getUserCurrentPreview(context.session.user.id, input, context.request.requestId),
                  "Preview entry loaded.",
                ),
              ),
            revision: protectedProcedure
              .input(GetRevisionUserPreviewInputSchema)
              .output(PreviewItemOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.preview.user.revision",
                  getUserRevisionPreview(context.session.user.id, input, context.request.requestId),
                  "Preview entry loaded.",
                ),
              ),
          },
          publications: {
            status: protectedProcedure
              .input(GetEntryPublicationStatusInputSchema)
              .output(EntryPublicationStatusOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.entry.publication.status",
                  getEntryPublicationStatus(context.session.user.id, input),
                  "Publication status loaded.",
                ),
              ),
            validate: protectedProcedure
              .input(ValidateEntryPublicationInputSchema)
              .output(EntryPublicationPlanOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.entry.publication.validate",
                  validateEntryPublication(context.session.user.id, input),
                  "Publication validation completed.",
                ),
              ),
            publish: protectedProcedure
              .input(PublishEntryInputSchema)
              .output(PublishEntryResultOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.entry.publication.publish",
                  publishEntryLocale(context.session.user.id, input, context.request.requestId),
                  "Entry locale published.",
                ),
              ),
            unpublish: protectedProcedure
              .input(UnpublishEntryInputSchema)
              .output(UnpublishEntryResultOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.entry.publication.unpublish",
                  unpublishEntryLocale(context.session.user.id, input, context.request.requestId),
                  "Entry locale unpublished.",
                ),
              ),
            list: protectedProcedure
              .input(ListEntryPublicationsInputSchema)
              .output(EntryPublicationPageOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.entry.publication.list",
                  listEntryPublications(context.session.user.id, input),
                  "Publication history loaded.",
                ),
              ),
          },
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
          presentation: {
            get: protectedProcedure
              .input(GetCollectionPresentationInputSchema)
              .output(CollectionPresentationOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.presentation.get",
                  getCollectionPresentation(context.session.user.id, input),
                  "Collection presentation loaded.",
                ),
              ),
            publish: protectedProcedure
              .input(PublishCollectionPresentationInputSchema)
              .output(PublishCollectionPresentationOutputSchema)
              .handler(({ context, input }) =>
                executeProcedure(
                  context,
                  "api.schema.presentation.publish",
                  publishCollectionPresentation(
                    context.session.user.id,
                    input,
                    context.request.requestId,
                  ),
                  "Collection presentation published.",
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
