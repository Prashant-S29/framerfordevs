import type { RouterClient } from "@orpc/server";

import {
  AcceptProjectInvitationInputSchema,
  ApiCredentialOutputSchema,
  ApiCredentialPageOutputSchema,
  ApiCredentialRotationOutputSchema,
  ChangeApiCredentialRotationInputSchema,
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
  StartApiCredentialRotationInputSchema,
  StartedApiCredentialRotationOutputSchema,
  UpdateProjectMemberPolicyInputSchema,
} from "../contracts/access";
import {
  DeliveryConfigurationOutputSchema,
  GetDeliveryConfigurationInputSchema,
  UpdateDeliveryConfigurationInputSchema,
} from "../contracts/delivery";
import { CmsEntryPageOutputSchema, ListEntriesInputSchema } from "../contracts/entry";
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
  CmsCollectionPageOutputSchema,
  CollectionDraftSchemaOutputSchema,
  GetCollectionDraftInputSchema,
  GetLatestPublishedSchemaInputSchema,
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
  ControlPlaneCredentialPageOutputSchema,
  ControlPlaneProjectAuditPageOutputSchema,
  ControlPlaneWebhookAttemptListOutputSchema,
  ControlPlaneWebhookDeliveryDetailOutputSchema,
  ControlPlaneWebhookDeliveryPageOutputSchema,
  ControlPlanePutStudioRegistrationInputSchema,
  ControlPlanePutStudioRegistrationOutputSchema,
  ControlPlaneSetStudioRuntimeInputSchema,
  ControlPlaneSetStudioRuntimeOutputSchema,
  ControlPlaneStudioRegistrationScopeSchema,
  HostedOperationalCredentialListInputSchema,
  HostedProjectAuditListInputSchema,
  HostedWebhookDeliveryInputSchema,
  HostedWebhookDeliveryListInputSchema,
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
  updateProjectMemberPolicy,
} from "../operations/access";
import { getDeliveryConfiguration, updateDeliveryConfiguration } from "../operations/delivery/api";
import { listEntries } from "../operations/entries";
import {
  changeApiCredentialRotation,
  issueApiCredential,
  listApiCredentials,
  revokeApiCredential,
  startApiCredentialRotation,
} from "../operations/credentials";
import {
  createProjectLocale,
  listProjectLocales,
  reorderProjectLocales,
  updateProjectLocaleDisplayName,
  updateProjectLocaleStatus,
} from "../operations/locales";
import {
  getCollectionDraft,
  getLatestPublishedSchema,
  getPublishedSchemaRevision,
  listCollections,
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
  setStudioRuntimeForSession,
} from "../operations/control-plane";
import { listControlPlaneCredentials } from "../operations/control-plane/operational";
import { listProjectAuditEvents } from "../operations/audit";
import { healthCheck, loadPrivateData } from "../operations/system";
import {
  getHostedWebhookDelivery,
  listHostedWebhookAttempts,
  listHostedWebhookDeliveries,
} from "../operations/webhook/hosted";
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
      operationalList: protectedProcedure
        .input(HostedWebhookDeliveryListInputSchema)
        .output(ControlPlaneWebhookDeliveryPageOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.delivery.operational_list",
            listHostedWebhookDeliveries(
              context.session.user.id,
              `session:${context.session.user.id}`,
              input,
            ),
            "Webhook delivery summaries loaded.",
          ),
        ),
      detail: protectedProcedure
        .input(HostedWebhookDeliveryInputSchema)
        .output(ControlPlaneWebhookDeliveryDetailOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.delivery.detail",
            getHostedWebhookDelivery(context.session.user.id, input),
            "Webhook delivery detail loaded.",
          ),
        ),
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
      operationalList: protectedProcedure
        .input(HostedWebhookDeliveryInputSchema)
        .output(ControlPlaneWebhookAttemptListOutputSchema)
        .handler(({ context, input }) =>
          executeProcedure(
            context,
            "api.webhook.attempt.operational_list",
            listHostedWebhookAttempts(context.session.user.id, input),
            "Webhook attempts loaded.",
          ),
        ),
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
        setRuntime: protectedProcedure
          .input(ControlPlaneSetStudioRuntimeInputSchema)
          .output(ControlPlaneSetStudioRuntimeOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.control-plane.studio-registration.runtime.set",
              setStudioRuntimeForSession(context.session.user.id, input, context.request.requestId),
              input.enabled ? "Studio runtime activated." : "Studio runtime deactivated.",
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
        updatePolicy: protectedProcedure
          .input(UpdateProjectMemberPolicyInputSchema)
          .output(ProjectMemberOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.access.member.policy.update",
              updateProjectMemberPolicy(context.session.user.id, input, context.request.requestId),
              "Member policy updated.",
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
      operations: {
        audit: {
          list: protectedProcedure
            .input(HostedProjectAuditListInputSchema)
            .output(ControlPlaneProjectAuditPageOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.audit.project.list",
                listProjectAuditEvents(
                  context.session.user.id,
                  `session:${context.session.user.id}`,
                  input.projectId,
                  input.query,
                  context.request.requestId,
                ),
                "Project audit events loaded.",
              ),
            ),
        },
      },
      credentials: {
        operationalList: protectedProcedure
          .input(HostedOperationalCredentialListInputSchema)
          .output(ControlPlaneCredentialPageOutputSchema)
          .handler(({ context, input }) =>
            executeProcedure(
              context,
              "api.credential.operational_list",
              listControlPlaneCredentials(
                context.session.user.id,
                `session:${context.session.user.id}`,
                input.projectId,
                input.environmentId,
                input.query,
              ),
              "Operational credentials loaded.",
            ),
          ),
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
        rotation: {
          start: protectedProcedure
            .input(StartApiCredentialRotationInputSchema)
            .output(StartedApiCredentialRotationOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                "api.credential.rotation.start",
                startApiCredentialRotation(
                  context.session.user.id,
                  input,
                  context.request.requestId,
                ),
                "Credential rotation started. Copy the pending key now.",
              ),
            ),
          change: protectedProcedure
            .input(ChangeApiCredentialRotationInputSchema)
            .output(ApiCredentialRotationOutputSchema)
            .handler(({ context, input }) =>
              executeProcedure(
                context,
                `api.credential.rotation.${input.action}`,
                changeApiCredentialRotation(
                  context.session.user.id,
                  input,
                  context.request.requestId,
                ),
                "Credential rotation updated.",
              ),
            ),
        },
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
