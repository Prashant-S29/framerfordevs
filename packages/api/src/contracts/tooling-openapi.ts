// Generates the tenant-neutral public Tooling OpenAPI contract from Effect schemas and protocol metadata.

import { JSONSchema, Schema } from "effect";

import {
  ToolingApiFailure,
  ToolingCollectionContractRevisionResponse,
  ToolingEnvironmentPageResponse,
  toolingLimits,
  ToolingProjectPageResponse,
  ToolingSchemaManifestPageResponse,
} from "./tooling";

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
  addEffectSchema(components, "ToolingProjectPageResponse", ToolingProjectPageResponse);
  addEffectSchema(components, "ToolingEnvironmentPageResponse", ToolingEnvironmentPageResponse);
  addEffectSchema(
    components,
    "ToolingSchemaManifestPageResponse",
    ToolingSchemaManifestPageResponse,
  );
  addEffectSchema(
    components,
    "ToolingCollectionContractRevisionResponse",
    ToolingCollectionContractRevisionResponse,
  );
  addEffectSchema(components, "ToolingApiFailure", ToolingApiFailure);
  return components;
}

const responseHeaders = {
  ETag: { $ref: "#/components/headers/ETag" },
  "Cache-Control": { $ref: "#/components/headers/CacheControl" },
  "X-Request-Id": { $ref: "#/components/headers/RequestId" },
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
} as const;

function successResponse(schema: string, description: string, immutable = false) {
  return {
    description,
    headers: responseHeaders,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schema}` },
      },
    },
    "x-cache-policy": immutable ? "private, max-age=31536000, immutable" : "private, no-cache",
  };
}

function headSuccessResponse(description: string) {
  return {
    description,
    headers: responseHeaders,
  };
}

function failureResponse(description: string) {
  return {
    description,
    headers: {
      "Cache-Control": { $ref: "#/components/headers/CacheControl" },
      "X-Request-Id": { $ref: "#/components/headers/RequestId" },
    },
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/ToolingApiFailure" },
      },
    },
  };
}

const commonFailures = {
  "400": failureResponse("Invalid query, cursor, or route parameters."),
  "401": failureResponse("Missing or invalid bearer authority."),
  "403": failureResponse("The principal cannot read this project or environment."),
  "404": failureResponse("The scoped public resource is unavailable."),
  "409": failureResponse("Published schema authority changed or is unavailable."),
  "413": failureResponse("The bounded Tooling response would be too large."),
  "429": failureResponse("The request exceeded a Tooling rate policy."),
  "500": failureResponse("A sanitized internal contract defect occurred."),
  "503": failureResponse("A required dependency is temporarily unavailable."),
} as const;

const projectParameter = {
  name: "projectId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;

const environmentParameter = {
  name: "environmentKey",
  in: "path",
  required: true,
  schema: {
    type: "string",
    minLength: 1,
    maxLength: 63,
    pattern: "^[a-z][a-z0-9-]{0,62}$",
  },
} as const;

const paginationParameters = [
  {
    name: "limit",
    in: "query",
    required: false,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: toolingLimits.maximumPageSize,
      default: toolingLimits.defaultPageSize,
    },
  },
  {
    name: "cursor",
    in: "query",
    required: false,
    schema: { type: "string", minLength: 1, maxLength: 2_048 },
  },
] as const;

const closedOptions = {
  summary: "Tooling data routes do not support browser CORS",
  security: [],
  responses: {
    "403": failureResponse("Browser-origin Tooling requests are not allowed."),
  },
} as const;

function dataOperations(options: {
  readonly getOperationId: string;
  readonly headOperationId: string;
  readonly summary: string;
  readonly schema: string;
  readonly parameters: ReadonlyArray<unknown>;
  readonly security: ReadonlyArray<Readonly<Record<string, ReadonlyArray<string>>>>;
  readonly immutable?: boolean;
}) {
  return {
    get: {
      operationId: options.getOperationId,
      summary: options.summary,
      security: options.security,
      parameters: options.parameters,
      responses: {
        "200": successResponse(options.schema, options.summary, options.immutable),
        "304": headSuccessResponse("The authenticated representation is unchanged."),
        ...commonFailures,
      },
    },
    head: {
      operationId: options.headOperationId,
      summary: `${options.summary} metadata`,
      security: options.security,
      parameters: options.parameters,
      responses: {
        "200": headSuccessResponse(options.summary),
        "304": headSuccessResponse("The authenticated representation is unchanged."),
        ...commonFailures,
      },
    },
    options: {
      ...closedOptions,
      operationId: `deny${options.getOperationId}BrowserPreflight`,
    },
  };
}

const oauthSecurity = [{ ToolingOAuth: [] }] as const;
const readSecurity = [{ ToolingOAuth: [] }, { ToolingManagementCredential: [] }] as const;

export const toolingOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Framer for Developers Tooling API",
    version: "1.0.0",
    description:
      "Originless, bearer-only project discovery and immutable published-schema retrieval for the official CLI and approved CI integrations.",
  },
  servers: [{ url: "/api/tooling/v1" }],
  tags: [{ name: "Tooling", description: "Published schema tooling" }],
  paths: {
    "/projects": dataOperations({
      getOperationId: "listToolingProjects",
      headOperationId: "headToolingProjects",
      summary: "List projects visible to the OAuth user",
      schema: "ToolingProjectPageResponse",
      parameters: paginationParameters,
      security: oauthSecurity,
    }),
    "/projects/{projectId}/environments": dataOperations({
      getOperationId: "listToolingEnvironments",
      headOperationId: "headToolingEnvironments",
      summary: "List readable project environments",
      schema: "ToolingEnvironmentPageResponse",
      parameters: [projectParameter, ...paginationParameters],
      security: oauthSecurity,
    }),
    "/projects/{projectId}/environments/{environmentKey}/schema/manifest": dataOperations({
      getOperationId: "getToolingSchemaManifest",
      headOperationId: "headToolingSchemaManifest",
      summary: "Read a page of current published collection contracts",
      schema: "ToolingSchemaManifestPageResponse",
      parameters: [projectParameter, environmentParameter, ...paginationParameters],
      security: readSecurity,
    }),
    "/projects/{projectId}/environments/{environmentKey}/schema/collections/{collectionKey}/revisions/{revisionId}":
      dataOperations({
        getOperationId: "getToolingCollectionContractRevision",
        headOperationId: "headToolingCollectionContractRevision",
        summary: "Read one immutable published collection contract",
        schema: "ToolingCollectionContractRevisionResponse",
        parameters: [
          projectParameter,
          environmentParameter,
          {
            name: "collectionKey",
            in: "path",
            required: true,
            schema: {
              type: "string",
              minLength: 1,
              maxLength: 63,
              pattern: "^[a-z][a-z0-9_]{0,62}$",
            },
          },
          {
            name: "revisionId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        security: readSecurity,
        immutable: true,
      }),
  },
  components: {
    securitySchemes: {
      ToolingOAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Official CLI OAuth device access token. It must target the Tooling resource and include `tooling:read`.",
        "x-device-authorization-url": "/api/auth/device/code",
        "x-token-url": "/api/auth/oauth2/token",
        "x-required-scope": "tooling:read",
      },
      ToolingManagementCredential: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "ffd_mgmt_…",
        description:
          "Project/environment-bound management credential with `schema.read`. It cannot enumerate projects or environments.",
      },
    },
    headers: {
      ETag: {
        description: "Strong validator for the exact authenticated representation.",
        schema: { type: "string" },
      },
      CacheControl: {
        description:
          "Private current or immutable authenticated cache policy; errors are no-store.",
        schema: { type: "string" },
      },
      RequestId: {
        description: "Bounded request correlation identifier.",
        schema: { type: "string", maxLength: 128 },
      },
      RateLimitLimit: { description: "Current Tooling policy rate.", schema: { type: "integer" } },
      RateLimitRemaining: { description: "Remaining weighted units.", schema: { type: "integer" } },
      RateLimitReset: { description: "Reset time as Unix seconds.", schema: { type: "integer" } },
    },
    schemas: schemaComponents(),
  },
  "x-tooling-limits": toolingLimits,
} as const;
