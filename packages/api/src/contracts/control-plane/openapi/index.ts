// Generates the canonical bearer-only Control Plane v1 OpenAPI contract.

import { JSONSchema, Schema } from "effect";

import {
  ControlPlaneApiFailure,
  ControlPlaneCapabilityListResponse,
  ControlPlaneCreateProjectRequest,
  ControlPlaneCreateProjectResponse,
  ControlPlaneCreateWorkspaceRequest,
  ControlPlaneCreateWorkspaceResponse,
  ControlPlaneEnableCapabilityRequest,
  ControlPlaneEnableCapabilityResponse,
  controlPlaneLimits,
  ControlPlaneProjectLifecycleRequest,
  ControlPlaneProjectPageResponse,
  ControlPlaneProjectResponse,
  ControlPlanePutStudioRegistrationRequest,
  ControlPlanePutStudioRegistrationResponse,
  ControlPlaneUpdateProjectRequest,
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
      "Originless bearer-only workspace/project bootstrap, lifecycle recovery, capability, and inert Studio-registration authority for the official CLI and exact management credentials.",
  },
  servers: [{ url: "/api/control-plane/v1" }],
  tags: [{ name: "Control Plane", description: "Bootstrap control-plane resources" }],
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
