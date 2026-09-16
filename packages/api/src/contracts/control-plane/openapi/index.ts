// Generates the canonical bearer-only Control Plane v1 OpenAPI contract.

import { JSONSchema, Schema } from "effect";

import {
  ControlPlaneApiFailure,
  ControlPlaneCapabilityListResponse,
  ControlPlaneCreateInvitationRequest,
  ControlPlaneCreateLocaleRequest,
  ControlPlaneCreateLocaleResponse,
  ControlPlaneCreateProjectRequest,
  ControlPlaneCreateProjectResponse,
  ControlPlaneCreateWorkspaceRequest,
  ControlPlaneCreateWorkspaceResponse,
  ControlPlaneEnableCapabilityRequest,
  ControlPlaneEnableCapabilityResponse,
  ControlPlaneGovernanceResponse,
  ControlPlaneInspectedInvitationResponse,
  ControlPlaneInvitationPageResponse,
  ControlPlaneInvitationResponse,
  ControlPlaneInvitationTokenRequest,
  ControlPlaneIssuedInvitationResponse,
  ControlPlaneLocaleListResponse,
  ControlPlaneLocaleOrderRequest,
  ControlPlaneLocaleResponse,
  ControlPlaneLocaleStatusRequest,
  controlPlaneLimits,
  ControlPlaneMemberPageResponse,
  ControlPlaneMemberPolicyRequest,
  ControlPlaneMemberResponse,
  ControlPlaneProjectLifecycleRequest,
  ControlPlaneProjectPageResponse,
  ControlPlaneProjectResponse,
  ControlPlanePutStudioRegistrationRequest,
  ControlPlanePutStudioRegistrationResponse,
  ControlPlaneUpdateLocaleRequest,
  ControlPlaneUpdateProjectRequest,
  ControlPlaneVersionRequest,
  ControlPlaneWorkspacePageResponse,
  ControlPlaneWorkspaceResponse,
  StudioRegistrationResponse,
} from "..";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rewriteSchemaReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteSchemaReferences);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "$schema")
      .map(([key, item]) => [
        key,
        key === "$ref" && typeof item === "string"
          ? item.replace("#/$defs/", "#/components/schemas/")
          : rewriteSchemaReferences(item),
      ]),
  );
}

function addEffectSchema(
  components: Record<string, unknown>,
  name: string,
  schema: Schema.Schema.Any,
): void {
  const generated = JSONSchema.make(schema);
  const definitions = Reflect.get(generated, "$defs");
  if (isRecord(definitions)) {
    for (const [definitionName, definition] of Object.entries(definitions)) {
      components[definitionName] = rewriteSchemaReferences(definition);
    }
  }
  const root = Object.fromEntries(
    Object.entries(generated).filter(([key]) => key !== "$schema" && key !== "$defs"),
  );
  if (Reflect.get(root, "$ref") !== `#/$defs/${name}`) {
    components[name] = rewriteSchemaReferences(root);
  }
}

function schemaComponents() {
  const components: Record<string, unknown> = {};
  const schemas = [
    ["ControlPlaneApiFailure", ControlPlaneApiFailure],
    ["ControlPlaneWorkspaceResponse", ControlPlaneWorkspaceResponse],
    ["ControlPlaneWorkspacePageResponse", ControlPlaneWorkspacePageResponse],
    ["ControlPlaneCreateWorkspaceRequest", ControlPlaneCreateWorkspaceRequest],
    ["ControlPlaneCreateWorkspaceResponse", ControlPlaneCreateWorkspaceResponse],
    ["ControlPlaneProjectResponse", ControlPlaneProjectResponse],
    ["ControlPlaneProjectPageResponse", ControlPlaneProjectPageResponse],
    ["ControlPlaneCreateProjectRequest", ControlPlaneCreateProjectRequest],
    ["ControlPlaneCreateProjectResponse", ControlPlaneCreateProjectResponse],
    ["ControlPlaneUpdateProjectRequest", ControlPlaneUpdateProjectRequest],
    ["ControlPlaneProjectLifecycleRequest", ControlPlaneProjectLifecycleRequest],
    ["ControlPlaneCapabilityListResponse", ControlPlaneCapabilityListResponse],
    ["ControlPlaneEnableCapabilityRequest", ControlPlaneEnableCapabilityRequest],
    ["ControlPlaneEnableCapabilityResponse", ControlPlaneEnableCapabilityResponse],
    ["StudioRegistrationResponse", StudioRegistrationResponse],
    ["ControlPlanePutStudioRegistrationRequest", ControlPlanePutStudioRegistrationRequest],
    ["ControlPlanePutStudioRegistrationResponse", ControlPlanePutStudioRegistrationResponse],
    ["ControlPlaneGovernanceResponse", ControlPlaneGovernanceResponse],
    ["ControlPlaneMemberPageResponse", ControlPlaneMemberPageResponse],
    ["ControlPlaneMemberResponse", ControlPlaneMemberResponse],
    ["ControlPlaneMemberPolicyRequest", ControlPlaneMemberPolicyRequest],
    ["ControlPlaneVersionRequest", ControlPlaneVersionRequest],
    ["ControlPlaneInvitationPageResponse", ControlPlaneInvitationPageResponse],
    ["ControlPlaneInvitationResponse", ControlPlaneInvitationResponse],
    ["ControlPlaneCreateInvitationRequest", ControlPlaneCreateInvitationRequest],
    ["ControlPlaneIssuedInvitationResponse", ControlPlaneIssuedInvitationResponse],
    ["ControlPlaneInvitationTokenRequest", ControlPlaneInvitationTokenRequest],
    ["ControlPlaneInspectedInvitationResponse", ControlPlaneInspectedInvitationResponse],
    ["ControlPlaneLocaleListResponse", ControlPlaneLocaleListResponse],
    ["ControlPlaneCreateLocaleRequest", ControlPlaneCreateLocaleRequest],
    ["ControlPlaneCreateLocaleResponse", ControlPlaneCreateLocaleResponse],
    ["ControlPlaneUpdateLocaleRequest", ControlPlaneUpdateLocaleRequest],
    ["ControlPlaneLocaleResponse", ControlPlaneLocaleResponse],
    ["ControlPlaneLocaleOrderRequest", ControlPlaneLocaleOrderRequest],
    ["ControlPlaneLocaleStatusRequest", ControlPlaneLocaleStatusRequest],
  ] as const;
  for (const [name, schema] of schemas) addEffectSchema(components, name, schema);
  return components;
}

const responseHeaders = {
  "Cache-Control": { $ref: "#/components/headers/CacheControl" },
  "X-Request-Id": { $ref: "#/components/headers/RequestId" },
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
  "Retry-After": { $ref: "#/components/headers/RetryAfter" },
} as const;

function successResponse(schema: string, description: string) {
  return {
    description,
    headers: responseHeaders,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
    "x-cache-policy": "no-store",
  };
}

function failureResponse(description: string) {
  return {
    description,
    headers: responseHeaders,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ControlPlaneApiFailure" },
      },
    },
  };
}

const commonFailures = {
  "400": failureResponse("The closed request or cursor is invalid."),
  "401": failureResponse("Bearer authority is missing or invalid."),
  "403": failureResponse("The principal lacks the required effective authority."),
  "404": failureResponse("The scoped resource is unavailable."),
  "409": failureResponse("The command, version, key, or lifecycle transition conflicts."),
  "413": failureResponse("The bounded request or response limit was exceeded."),
  "429": failureResponse("The request exceeded a Control Plane rate policy."),
  "500": failureResponse("A sanitized internal contract defect occurred."),
  "503": failureResponse("A required dependency is temporarily unavailable."),
} as const;

const workspaceParameter = {
  name: "workspaceId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const projectParameter = {
  name: "projectId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const membershipParameter = {
  name: "membershipId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const invitationParameter = {
  name: "invitationId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const localeParameter = {
  name: "localeId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const environmentParameter = {
  name: "environmentId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const paginationParameters = [
  {
    name: "limit",
    in: "query",
    required: false,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: controlPlaneLimits.maximumPageSize,
      default: controlPlaneLimits.defaultPageSize,
    },
  },
  {
    name: "cursor",
    in: "query",
    required: false,
    schema: {
      type: "string",
      minLength: 1,
      maxLength: controlPlaneLimits.maximumCursorInputBytes,
    },
  },
] as const;

const oauthRead = [{ ControlPlaneOAuthRead: [] }] as const;
const oauthWrite = [{ ControlPlaneOAuthWrite: [] }] as const;
const oauthLifecycle = [{ ControlPlaneOAuthLifecycle: [] }] as const;
const oauthGovernanceRead = [{ ControlPlaneOAuthGovernanceRead: [] }] as const;
const oauthGovernanceWrite = [{ ControlPlaneOAuthGovernanceWrite: [] }] as const;
const exactGovernanceRead = [
  { ControlPlaneOAuthGovernanceRead: [] },
  { ControlPlaneManagementCredential: [] },
] as const;
const exactGovernanceWrite = [
  { ControlPlaneOAuthGovernanceWrite: [] },
  { ControlPlaneManagementCredential: [] },
] as const;
const exactRead = [
  { ControlPlaneOAuthRead: [] },
  { ControlPlaneManagementCredential: [] },
] as const;
const exactWrite = [
  { ControlPlaneOAuthWrite: [] },
  { ControlPlaneManagementCredential: [] },
] as const;

const denyPreflight = (operationId: string) => ({
  operationId,
  summary: "Control Plane data routes reject browser preflight",
  security: [],
  responses: { "403": failureResponse("Browser-origin Control Plane requests are not allowed.") },
});

const jsonBody = (schema: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
});

export const controlPlaneOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Framer for Developers Control Plane API",
    version: "1.0.0",
    description:
      "Originless bearer-only workspace/project bootstrap, fixed governance, locale administration, lifecycle recovery, capability, and inert Studio-registration authority for the official CLI and exact management credentials.",
  },
  servers: [{ url: "/api/control-plane/v1" }],
  tags: [{ name: "Control Plane", description: "Portable control-plane resources" }],
  paths: {
    "/workspaces": {
      get: {
        operationId: "listControlPlaneWorkspaces",
        summary: "List active workspace memberships",
        security: oauthRead,
        parameters: paginationParameters,
        responses: {
          "200": successResponse("ControlPlaneWorkspacePageResponse", "Workspace page."),
          ...commonFailures,
        },
      },
      post: {
        operationId: "createControlPlaneWorkspace",
        summary: "Create a workspace idempotently",
        security: oauthWrite,
        requestBody: jsonBody("ControlPlaneCreateWorkspaceRequest"),
        responses: {
          "200": successResponse("ControlPlaneCreateWorkspaceResponse", "Workspace result."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneWorkspacesPreflight"),
    },
    "/workspaces/{workspaceId}": {
      get: {
        operationId: "getControlPlaneWorkspace",
        summary: "Get one authorized workspace",
        security: oauthRead,
        parameters: [workspaceParameter],
        responses: {
          "200": successResponse("ControlPlaneWorkspaceResponse", "Workspace detail."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneWorkspacePreflight"),
    },
    "/workspaces/{workspaceId}/projects": {
      get: {
        operationId: "listControlPlaneProjects",
        summary: "List authorized projects in one workspace",
        security: oauthRead,
        parameters: [
          workspaceParameter,
          {
            name: "status",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["active", "archived"], default: "active" },
          },
          ...paginationParameters,
        ],
        responses: {
          "200": successResponse("ControlPlaneProjectPageResponse", "Project page."),
          ...commonFailures,
        },
      },
      post: {
        operationId: "createControlPlaneProject",
        summary: "Create a project and its required defaults idempotently",
        security: oauthWrite,
        parameters: [workspaceParameter],
        requestBody: jsonBody("ControlPlaneCreateProjectRequest"),
        responses: {
          "200": successResponse("ControlPlaneCreateProjectResponse", "Project result."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneProjectsPreflight"),
    },
    "/projects/{projectId}": {
      get: {
        operationId: "getControlPlaneProject",
        summary: "Get one authorized project",
        security: exactRead,
        parameters: [projectParameter],
        responses: {
          "200": successResponse("ControlPlaneProjectResponse", "Project detail."),
          ...commonFailures,
        },
      },
      patch: {
        operationId: "updateControlPlaneProject",
        summary: "Update project metadata optimistically",
        security: exactWrite,
        parameters: [projectParameter],
        requestBody: jsonBody("ControlPlaneUpdateProjectRequest"),
        responses: {
          "200": successResponse("ControlPlaneProjectResponse", "Updated project detail."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneProjectPreflight"),
    },
    "/projects/{projectId}/archive": {
      post: {
        operationId: "archiveControlPlaneProject",
        summary: "Soft-archive a project",
        security: oauthLifecycle,
        parameters: [projectParameter],
        requestBody: jsonBody("ControlPlaneProjectLifecycleRequest"),
        responses: {
          "200": successResponse("ControlPlaneProjectResponse", "Archived project detail."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneProjectArchivePreflight"),
    },
    "/projects/{projectId}/restore": {
      post: {
        operationId: "restoreControlPlaneProject",
        summary: "Restore a soft-archived project",
        security: oauthLifecycle,
        parameters: [projectParameter],
        requestBody: jsonBody("ControlPlaneProjectLifecycleRequest"),
        responses: {
          "200": successResponse("ControlPlaneProjectResponse", "Restored project detail."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneProjectRestorePreflight"),
    },
    "/projects/{projectId}/capabilities": {
      get: {
        operationId: "listControlPlaneProjectCapabilities",
        summary: "Inspect all known project capabilities",
        security: exactRead,
        parameters: [projectParameter],
        responses: {
          "200": successResponse("ControlPlaneCapabilityListResponse", "Capability list."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneCapabilitiesPreflight"),
    },
    "/projects/{projectId}/capabilities/cms": {
      put: {
        operationId: "enableControlPlaneCmsCapability",
        summary: "Enable the CMS capability idempotently",
        security: exactWrite,
        parameters: [projectParameter],
        requestBody: jsonBody("ControlPlaneEnableCapabilityRequest"),
        responses: {
          "200": successResponse("ControlPlaneEnableCapabilityResponse", "Capability result."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneCmsCapabilityPreflight"),
    },
    "/projects/{projectId}/governance": {
      get: {
        operationId: "getControlPlaneGovernance",
        summary: "Inspect current fixed governance policy",
        security: oauthGovernanceRead,
        parameters: [projectParameter],
        responses: {
          "200": successResponse("ControlPlaneGovernanceResponse", "Governance projection."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneGovernancePreflight"),
    },
    "/projects/{projectId}/members": {
      get: {
        operationId: "listControlPlaneMembers",
        summary: "List or search active project members",
        security: oauthGovernanceRead,
        parameters: [
          projectParameter,
          {
            name: "role",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: [
                "owner",
                "developer",
                "content_admin",
                "editor",
                "reviewer",
                "client_editor",
                "read_only",
              ],
            },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 100 },
          },
          ...paginationParameters,
        ],
        responses: {
          "200": successResponse("ControlPlaneMemberPageResponse", "Member page."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneMembersPreflight"),
    },
    "/projects/{projectId}/members/{membershipId}/policy": {
      put: {
        operationId: "updateControlPlaneMemberPolicy",
        summary: "Atomically update complete member role and locale policy",
        security: oauthGovernanceWrite,
        parameters: [projectParameter, membershipParameter],
        requestBody: jsonBody("ControlPlaneMemberPolicyRequest"),
        responses: {
          "200": successResponse("ControlPlaneMemberResponse", "Updated member."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneMemberPolicyPreflight"),
    },
    "/projects/{projectId}/members/{membershipId}/remove": {
      post: {
        operationId: "removeControlPlaneMember",
        summary: "Remove a project member optimistically",
        security: oauthGovernanceWrite,
        parameters: [projectParameter, membershipParameter],
        requestBody: jsonBody("ControlPlaneVersionRequest"),
        responses: {
          "200": successResponse("ControlPlaneMemberResponse", "Removed member."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneMemberRemovePreflight"),
    },
    "/projects/{projectId}/invitations": {
      get: {
        operationId: "listControlPlaneInvitations",
        summary: "List or search project invitations",
        security: oauthGovernanceRead,
        parameters: [
          projectParameter,
          {
            name: "status",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["all", "pending", "accepted", "revoked", "expired"],
              default: "all",
            },
          },
          {
            name: "search",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 100 },
          },
          ...paginationParameters,
        ],
        responses: {
          "200": successResponse("ControlPlaneInvitationPageResponse", "Invitation page."),
          ...commonFailures,
        },
      },
      post: {
        operationId: "createControlPlaneInvitation",
        summary: "Create an invitation with complete fixed policy",
        description:
          "Returns the raw token once. Ambiguous-response recovery is list/search, explicit revoke, then reissue; invitation creation is intentionally not command-receipt replayable.",
        security: oauthGovernanceWrite,
        parameters: [projectParameter],
        requestBody: jsonBody("ControlPlaneCreateInvitationRequest"),
        responses: {
          "200": successResponse(
            "ControlPlaneIssuedInvitationResponse",
            "Invitation and one-time token.",
          ),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneInvitationsPreflight"),
    },
    "/projects/{projectId}/invitations/{invitationId}/revoke": {
      post: {
        operationId: "revokeControlPlaneInvitation",
        summary: "Revoke a pending invitation optimistically",
        security: oauthGovernanceWrite,
        parameters: [projectParameter, invitationParameter],
        requestBody: jsonBody("ControlPlaneVersionRequest"),
        responses: {
          "200": successResponse("ControlPlaneInvitationResponse", "Revoked invitation."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneInvitationRevokePreflight"),
    },
    "/invitations/inspect": {
      post: {
        operationId: "inspectControlPlaneInvitation",
        summary: "Inspect an invitation using bounded token proof",
        security: oauthGovernanceRead,
        requestBody: jsonBody("ControlPlaneInvitationTokenRequest"),
        responses: {
          "200": successResponse(
            "ControlPlaneInspectedInvitationResponse",
            "Safe invitation projection.",
          ),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneInvitationInspectPreflight"),
    },
    "/invitations/accept": {
      post: {
        operationId: "acceptControlPlaneInvitation",
        summary: "Accept an invitation atomically",
        security: oauthGovernanceWrite,
        requestBody: jsonBody("ControlPlaneInvitationTokenRequest"),
        responses: {
          "200": successResponse("ControlPlaneMemberResponse", "Accepted member policy."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneInvitationAcceptPreflight"),
    },
    "/projects/{projectId}/locales": {
      get: {
        operationId: "listControlPlaneLocales",
        summary: "List effective or settings locale projections",
        security: exactGovernanceRead,
        parameters: [
          projectParameter,
          {
            name: "view",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["effective", "settings"], default: "effective" },
          },
          {
            name: "includeRemoved",
            in: "query",
            required: false,
            schema: { type: "boolean", default: false },
          },
        ],
        responses: {
          "200": successResponse("ControlPlaneLocaleListResponse", "Locale list."),
          ...commonFailures,
        },
      },
      post: {
        operationId: "createControlPlaneLocale",
        summary: "Create a locale idempotently",
        security: exactGovernanceWrite,
        parameters: [projectParameter],
        requestBody: jsonBody("ControlPlaneCreateLocaleRequest"),
        responses: {
          "200": successResponse("ControlPlaneCreateLocaleResponse", "Created or replayed locale."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneLocalesPreflight"),
    },
    "/projects/{projectId}/locales/{localeId}": {
      patch: {
        operationId: "updateControlPlaneLocale",
        summary: "Update a locale display name optimistically",
        security: exactGovernanceWrite,
        parameters: [projectParameter, localeParameter],
        requestBody: jsonBody("ControlPlaneUpdateLocaleRequest"),
        responses: {
          "200": successResponse("ControlPlaneLocaleResponse", "Updated locale."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneLocalePreflight"),
    },
    "/projects/{projectId}/locales/order": {
      put: {
        operationId: "reorderControlPlaneLocales",
        summary: "Replace the complete active locale order optimistically",
        security: exactGovernanceWrite,
        parameters: [projectParameter],
        requestBody: jsonBody("ControlPlaneLocaleOrderRequest"),
        responses: {
          "200": successResponse("ControlPlaneLocaleListResponse", "Reordered locales."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneLocaleOrderPreflight"),
    },
    "/projects/{projectId}/locales/{localeId}/status": {
      put: {
        operationId: "updateControlPlaneLocaleStatus",
        summary: "Update locale lifecycle status optimistically",
        security: exactGovernanceWrite,
        parameters: [projectParameter, localeParameter],
        requestBody: jsonBody("ControlPlaneLocaleStatusRequest"),
        responses: {
          "200": successResponse("ControlPlaneLocaleResponse", "Updated locale."),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneLocaleStatusPreflight"),
    },
    "/projects/{projectId}/environments/{environmentId}/studio-registration": {
      get: {
        operationId: "getControlPlaneStudioRegistration",
        summary: "Get inert Studio registration metadata",
        security: exactRead,
        parameters: [projectParameter, environmentParameter],
        responses: {
          "200": successResponse("StudioRegistrationResponse", "Studio registration."),
          ...commonFailures,
        },
      },
      put: {
        operationId: "putControlPlaneStudioRegistration",
        summary: "Create or update inert Studio registration metadata",
        security: exactWrite,
        parameters: [projectParameter, environmentParameter],
        requestBody: jsonBody("ControlPlanePutStudioRegistrationRequest"),
        responses: {
          "200": successResponse(
            "ControlPlanePutStudioRegistrationResponse",
            "Studio registration result.",
          ),
          ...commonFailures,
        },
      },
      options: denyPreflight("denyControlPlaneStudioRegistrationPreflight"),
    },
  },
  components: {
    securitySchemes: {
      ControlPlaneOAuthRead: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Official CLI OAuth access token for Control Plane reads.",
        "x-required-scope": "control-plane:read",
      },
      ControlPlaneOAuthWrite: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Official CLI OAuth access token for Control Plane writes.",
        "x-required-scope": "control-plane:write",
      },
      ControlPlaneOAuthLifecycle: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Official CLI OAuth access token for archive and restore.",
        "x-required-scope": "control-plane:project:lifecycle",
      },
      ControlPlaneOAuthGovernanceRead: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Official CLI OAuth access token for governance inspection.",
        "x-required-scope": "control-plane:governance:read",
      },
      ControlPlaneOAuthGovernanceWrite: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Official CLI OAuth access token for governance mutations.",
        "x-required-scope": "control-plane:governance:write",
      },
      ControlPlaneManagementCredential: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "ffd_mgmt_…",
        description:
          "Exact project/environment management credential. Route-specific project scopes remain mandatory.",
      },
    },
    headers: {
      CacheControl: {
        description: "Always `no-store` on data responses.",
        schema: { type: "string" },
      },
      RequestId: {
        description: "Bounded request correlation identifier.",
        schema: { type: "string", maxLength: 128 },
      },
      RateLimitLimit: {
        description: "Current Control Plane policy rate.",
        schema: { type: "integer" },
      },
      RateLimitRemaining: { description: "Remaining weighted units.", schema: { type: "integer" } },
      RateLimitReset: { description: "Reset time as Unix seconds.", schema: { type: "integer" } },
      RetryAfter: {
        description: "Whole seconds until a rate-limited request may be retried.",
        schema: { type: "integer", minimum: 1 },
      },
    },
    schemas: schemaComponents(),
  },
  "x-control-plane-limits": controlPlaneLimits,
  "x-sdk-supported": false,
} as const;
