// Generates the tenant-neutral public Authoring schema and hosted-content OpenAPI contract.

import { JSONSchema, Schema } from "effect";

import { AuthoringApiFailure, authoringLimits } from "..";
import {
  AuthoringCreateEntryRequest,
  AuthoringCreateEntryResponse,
  AuthoringEntryDraftResponse,
  AuthoringEntryPageResponse,
  AuthoringGeneratedFormResponse,
  AuthoringRenameEntryRequest,
  AuthoringRenameEntryResponse,
  AuthoringSaveEntryDraftRequest,
  AuthoringSaveEntryDraftResponse,
} from "../content";
import {
  AuthoringPresentationSnapshotResponse,
  AuthoringPublishPresentationRequest,
  AuthoringPublishPresentationResponse,
} from "../presentation";
import {
  AuthoringPublicationPlanResponse,
  AuthoringPublicationStatusResponse,
  AuthoringPublishEntryRequest,
  AuthoringPublishEntryResponse,
  AuthoringUnpublishEntryRequest,
  AuthoringUnpublishEntryResponse,
  AuthoringValidatePublicationRequest,
} from "../publication";
import { AuthoringSchemaApplyResponse, AuthoringSchemaPlanResponse } from "../schema";

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

const sourceKey = {
  type: "string",
  minLength: 1,
  maxLength: 63,
  pattern: "^[a-z][a-z0-9_-]{0,62}$",
} as const;
const apiKey = {
  type: "string",
  minLength: 1,
  maxLength: 63,
  pattern: "^[a-z][a-z0-9_]{0,62}$",
} as const;
const hash = { type: "string", minLength: 64, maxLength: 64, pattern: "^[0-9a-f]{64}$" } as const;

const fieldConfigurationSchema = {
  type: "object",
  description:
    "Kind-correlated configuration. The server applies the stricter closed @framerfordevs/schema grammar.",
  maxProperties: 12,
} as const;

const commonFieldProperties = {
  sourceKey,
  kind: {
    type: "string",
    enum: [
      "short_text",
      "long_text",
      "rich_text",
      "number",
      "decimal",
      "money",
      "boolean",
      "date",
      "date_time",
      "enum",
      "url",
      "email",
      "slug",
      "json",
      "object",
      "list",
      "reference",
      "external_asset",
    ],
  },
  localization: { type: "string", enum: ["localized", "shared", "mixed"] },
  deprecated: { type: "boolean" },
  configuration: fieldConfigurationSchema,
} as const;

const listItemSchema = {
  type: "object",
  required: ["sourceKey", "kind", "localization", "configuration"],
  properties: {
    ...commonFieldProperties,
    fields: {
      type: "array",
      maxItems: 100,
      items: { $ref: "#/components/schemas/AuthoringFieldSchema" },
    },
    item: { $ref: "#/components/schemas/AuthoringListItemSchema" },
  },
  additionalProperties: false,
} as const;

const fieldSchema = {
  type: "object",
  required: ["sourceKey", "apiKey", "kind", "required", "localization", "configuration"],
  properties: {
    ...commonFieldProperties,
    apiKey,
    required: { type: "boolean" },
    fields: {
      type: "array",
      maxItems: 100,
      items: { $ref: "#/components/schemas/AuthoringFieldSchema" },
    },
    item: { $ref: "#/components/schemas/AuthoringListItemSchema" },
  },
  additionalProperties: false,
} as const;

const projectSchema = {
  type: "object",
  required: ["collections"],
  properties: {
    collections: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        required: ["sourceKey", "apiKey", "fields"],
        properties: {
          sourceKey,
          apiKey,
          fields: {
            type: "array",
            maxItems: 100,
            items: { $ref: "#/components/schemas/AuthoringFieldSchema" },
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

function schemaComponents() {
  const components: Record<string, unknown> = {
    AuthoringProjectSchema: projectSchema,
    AuthoringFieldSchema: fieldSchema,
    AuthoringListItemSchema: listItemSchema,
    AuthoringSchemaExportResponse: {
      type: "object",
      required: ["ok", "data", "error", "message"],
      properties: {
        ok: { const: true },
        data: {
          type: "object",
          required: ["project", "current", "collections", "fields", "enumOptions", "revisions"],
          properties: {
            project: { $ref: "#/components/schemas/AuthoringProjectSchema" },
            current: {
              type: "object",
              required: ["projectManifestHash", "revisionIds"],
              properties: {
                projectManifestHash: hash,
                revisionIds: {
                  type: "object",
                  propertyNames: sourceKey,
                  additionalProperties: { type: "string", format: "uuid" },
                  maxProperties: 100,
                },
              },
              additionalProperties: false,
            },
            collections: {
              type: "array",
              maxItems: 100,
              items: {
                type: "object",
                required: ["sourceKey", "collectionId", "apiKey"],
                properties: {
                  sourceKey,
                  collectionId: { type: "string", format: "uuid" },
                  apiKey,
                },
                additionalProperties: false,
              },
            },
            fields: {
              type: "array",
              maxItems: 10_000,
              items: {
                type: "object",
                required: ["collectionSourceKey", "sourceKey", "fieldId", "apiKey"],
                properties: {
                  collectionSourceKey: sourceKey,
                  sourceKey,
                  fieldId: { type: "string", format: "uuid" },
                  apiKey: { anyOf: [apiKey, { type: "null" }] },
                },
                additionalProperties: false,
              },
            },
            enumOptions: {
              type: "array",
              maxItems: 10_000,
              items: {
                type: "object",
                required: ["collectionSourceKey", "fieldSourceKey", "sourceKey", "optionId"],
                properties: {
                  collectionSourceKey: sourceKey,
                  fieldSourceKey: sourceKey,
                  sourceKey,
                  optionId: { type: "string", format: "uuid" },
                },
                additionalProperties: false,
              },
            },
            revisions: {
              type: "array",
              maxItems: 100,
              items: {
                type: "object",
                required: [
                  "collectionSourceKey",
                  "collectionId",
                  "revisionId",
                  "structureHash",
                  "contractHash",
                  "changed",
                ],
                properties: {
                  collectionSourceKey: sourceKey,
                  collectionId: { type: "string", format: "uuid" },
                  revisionId: { type: "string", format: "uuid" },
                  structureHash: hash,
                  contractHash: hash,
                  changed: { type: "boolean" },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
        error: { type: "null" },
        message: { type: "string", minLength: 1, maxLength: 512 },
      },
      additionalProperties: false,
    },
    AuthoringSchemaPlanRequest: {
      type: "object",
      required: ["project"],
      properties: { project: { $ref: "#/components/schemas/AuthoringProjectSchema" } },
      additionalProperties: false,
    },
    AuthoringSchemaApplyRequest: {
      type: "object",
      required: [
        "project",
        "commandId",
        "expectedCurrent",
        "expectedPlanHash",
        "acknowledgedChangeIds",
      ],
      properties: {
        project: { $ref: "#/components/schemas/AuthoringProjectSchema" },
        commandId: { type: "string", format: "uuid" },
        expectedCurrent: {
          type: "object",
          required: ["projectManifestHash", "revisionIds"],
          properties: {
            projectManifestHash: hash,
            revisionIds: {
              type: "object",
              propertyNames: sourceKey,
              additionalProperties: { type: "string", format: "uuid" },
              maxProperties: 100,
            },
          },
          additionalProperties: false,
        },
        expectedPlanHash: hash,
        acknowledgedChangeIds: {
          type: "array",
          maxItems: 10_000,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 255 },
        },
      },
      additionalProperties: false,
    },
  };
  addEffectSchema(components, "AuthoringSchemaPlanResponse", AuthoringSchemaPlanResponse);
  addEffectSchema(components, "AuthoringSchemaApplyResponse", AuthoringSchemaApplyResponse);
  addEffectSchema(
    components,
    "AuthoringPresentationSnapshotResponse",
    AuthoringPresentationSnapshotResponse,
  );
  addEffectSchema(
    components,
    "AuthoringPublishPresentationRequest",
    AuthoringPublishPresentationRequest,
  );
  addEffectSchema(
    components,
    "AuthoringPublishPresentationResponse",
    AuthoringPublishPresentationResponse,
  );
  addEffectSchema(components, "AuthoringEntryPageResponse", AuthoringEntryPageResponse);
  addEffectSchema(components, "AuthoringCreateEntryRequest", AuthoringCreateEntryRequest);
  addEffectSchema(components, "AuthoringCreateEntryResponse", AuthoringCreateEntryResponse);
  addEffectSchema(components, "AuthoringEntryDraftResponse", AuthoringEntryDraftResponse);
  addEffectSchema(components, "AuthoringGeneratedFormResponse", AuthoringGeneratedFormResponse);
  addEffectSchema(components, "AuthoringRenameEntryRequest", AuthoringRenameEntryRequest);
  addEffectSchema(components, "AuthoringRenameEntryResponse", AuthoringRenameEntryResponse);
  addEffectSchema(components, "AuthoringSaveEntryDraftRequest", AuthoringSaveEntryDraftRequest);
  addEffectSchema(components, "AuthoringSaveEntryDraftResponse", AuthoringSaveEntryDraftResponse);
  addEffectSchema(
    components,
    "AuthoringPublicationStatusResponse",
    AuthoringPublicationStatusResponse,
  );
  addEffectSchema(components, "AuthoringPublicationPlanResponse", AuthoringPublicationPlanResponse);
  addEffectSchema(
    components,
    "AuthoringValidatePublicationRequest",
    AuthoringValidatePublicationRequest,
  );
  addEffectSchema(components, "AuthoringPublishEntryRequest", AuthoringPublishEntryRequest);
  addEffectSchema(components, "AuthoringPublishEntryResponse", AuthoringPublishEntryResponse);
  addEffectSchema(components, "AuthoringUnpublishEntryRequest", AuthoringUnpublishEntryRequest);
  addEffectSchema(components, "AuthoringUnpublishEntryResponse", AuthoringUnpublishEntryResponse);
  addEffectSchema(components, "AuthoringApiFailure", AuthoringApiFailure);
  return components;
}

const responseHeaders = {
  "Cache-Control": { $ref: "#/components/headers/CacheControl" },
  "X-Request-Id": { $ref: "#/components/headers/RequestId" },
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
} as const;

function response(schema: string, description: string) {
  return {
    description,
    headers: responseHeaders,
    content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } },
  };
}

function failure(description: string) {
  return {
    description,
    headers: responseHeaders,
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/AuthoringApiFailure" } },
    },
  };
}

const commonFailures = {
  "400": failure("The bounded route scope or request body is invalid."),
  "401": failure("Bearer authentication is missing or invalid."),
  "403": failure("The principal lacks the required grant or current project policy."),
  "404": failure("The tenant-scoped project or environment is unavailable."),
  "409": failure("Current schema, command, acknowledgement, or source authority conflicts."),
  "413": failure("The bounded request or response limit was exceeded."),
  "429": failure("The request exceeded an Authoring rate policy."),
  "500": failure("A sanitized internal contract defect occurred."),
  "503": failure("A required dependency is temporarily unavailable."),
} as const;

const pathParameters = [
  {
    name: "projectId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  {
    name: "environmentId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
] as const;

const collectionPathParameters = [
  ...pathParameters,
  {
    name: "collectionKey",
    in: "path",
    required: true,
    schema: apiKey,
  },
] as const;

const entryPathParameters = [
  ...collectionPathParameters,
  {
    name: "locale",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 2, maxLength: 35 },
  },
] as const;

function schemaOperation(options: {
  readonly operationId: string;
  readonly summary: string;
  readonly request: string;
  readonly result: string;
  readonly oauthScope: string;
  readonly managementScopes: ReadonlyArray<string>;
}) {
  return {
    post: {
      operationId: options.operationId,
      summary: options.summary,
      security: [{ AuthoringOAuth: [options.oauthScope] }, { AuthoringManagementCredential: [] }],
      parameters: pathParameters,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: `#/components/schemas/${options.request}` },
          },
        },
      },
      responses: {
        "200": response(options.result, options.summary),
        ...commonFailures,
      },
      "x-required-oauth-scope": options.oauthScope,
      "x-required-management-scopes": options.managementScopes,
    },
    options: {
      operationId: `deny${options.operationId}BrowserPreflight`,
      summary: "Authoring data routes do not support browser CORS",
      security: [],
      responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
    },
  };
}

function publicationOperation(options: {
  readonly operationId: string;
  readonly summary: string;
  readonly method: "GET" | "POST";
  readonly request?: string;
  readonly result: string;
  readonly oauthScope: "authoring:read" | "authoring:content:publish";
  readonly managementScope: "content.read" | "content.publish";
}) {
  const operation = {
    operationId: options.operationId,
    summary: options.summary,
    security: [{ AuthoringOAuth: [options.oauthScope] }, { AuthoringManagementCredential: [] }],
    parameters: [
      ...entryPathParameters,
      {
        name: "entryId",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    ...(options.request === undefined
      ? {}
      : {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: `#/components/schemas/${options.request}` },
              },
            },
          },
        }),
    responses: { "200": response(options.result, options.summary), ...commonFailures },
    "x-required-oauth-scope": options.oauthScope,
    "x-required-management-scopes": [options.managementScope],
  };
  const preflight = {
    operationId: `deny${options.operationId}BrowserPreflight`,
    summary: "Authoring data routes do not support browser CORS",
    security: [],
    responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
  };
  return options.method === "GET"
    ? { get: operation, options: preflight }
    : { post: operation, options: preflight };
}

export const authoringOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Framer for Developers Authoring API",
    version: "1.0.0",
    description:
      "Originless bearer-only code-schema and exact-locale hosted-content authority for the official CLI and approved CI integrations.",
  },
  servers: [{ url: "/api/authoring/v1" }],
  tags: [{ name: "Authoring", description: "Code-first schema and hosted content authoring" }],
  paths: {
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/presentation": {
      get: {
        operationId: "getAuthoringPresentation",
        summary: "Get complete current stable-ID presentation authority",
        security: [{ AuthoringOAuth: ["authoring:read"] }, { AuthoringManagementCredential: [] }],
        parameters: collectionPathParameters,
        responses: {
          "200": response(
            "AuthoringPresentationSnapshotResponse",
            "Current presentation authority",
          ),
          ...commonFailures,
        },
        "x-required-oauth-scope": "authoring:read",
        "x-required-management-scopes": ["schema.read"],
      },
      post: {
        operationId: "publishAuthoringPresentation",
        summary: "Publish one immutable presentation-only schema revision",
        security: [
          { AuthoringOAuth: ["authoring:schema:push"] },
          { AuthoringManagementCredential: [] },
        ],
        parameters: collectionPathParameters,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AuthoringPublishPresentationRequest" },
            },
          },
        },
        responses: {
          "200": response(
            "AuthoringPublishPresentationResponse",
            "Published presentation revision",
          ),
          ...commonFailures,
        },
        "x-required-oauth-scope": "authoring:schema:push",
        "x-required-management-scopes": ["schema.read", "schema.write", "schema.publish"],
      },
      options: {
        operationId: "denyAuthoringPresentationBrowserPreflight",
        summary: "Authoring data routes do not support browser CORS",
        security: [],
        responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
      },
    },
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/form": {
      get: {
        operationId: "getAuthoringGeneratedForm",
        summary: "Get current role-projected generated-form and presentation authority",
        security: [{ AuthoringOAuth: ["authoring:read"] }, { AuthoringManagementCredential: [] }],
        parameters: collectionPathParameters,
        responses: {
          "200": response("AuthoringGeneratedFormResponse", "Role-projected generated form"),
          ...commonFailures,
        },
        "x-required-oauth-scope": "authoring:read",
        "x-required-management-scopes": ["content.read"],
      },
      options: {
        operationId: "denyGetAuthoringGeneratedFormBrowserPreflight",
        summary: "Authoring data routes do not support browser CORS",
        security: [],
        responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
      },
    },
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/locales/{locale}/entries":
      {
        get: {
          operationId: "listAuthoringEntries",
          summary: "List exact-locale hosted entries with bounded keyset pagination",
          security: [{ AuthoringOAuth: ["authoring:read"] }, { AuthoringManagementCredential: [] }],
          parameters: [
            ...entryPathParameters,
            {
              name: "cursor",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 2048 },
            },
            {
              name: "limit",
              in: "query",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
            },
          ],
          responses: {
            "200": response("AuthoringEntryPageResponse", "Exact-locale entry page"),
            ...commonFailures,
          },
          "x-required-oauth-scope": "authoring:read",
          "x-required-management-scopes": ["content.read"],
        },
        post: {
          operationId: "createAuthoringEntry",
          summary: "Atomically create one entry with optional initial API-key mutations",
          security: [
            { AuthoringOAuth: ["authoring:draft:write"] },
            { AuthoringManagementCredential: [] },
          ],
          parameters: entryPathParameters,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthoringCreateEntryRequest" },
              },
            },
          },
          responses: {
            "200": response("AuthoringCreateEntryResponse", "Atomically created entry draft"),
            ...commonFailures,
          },
          "x-required-oauth-scope": "authoring:draft:write",
          "x-required-management-scopes": ["content.write"],
        },
        options: {
          operationId: "denyListAuthoringEntriesBrowserPreflight",
          summary: "Authoring data routes do not support browser CORS",
          security: [],
          responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
        },
      },
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/locales/{locale}/entries/{entryId}":
      {
        patch: {
          operationId: "renameAuthoringEntry",
          summary: "Optimistically rename locale-neutral entry metadata",
          security: [
            { AuthoringOAuth: ["authoring:draft:write"] },
            { AuthoringManagementCredential: [] },
          ],
          parameters: [
            ...entryPathParameters,
            {
              name: "entryId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthoringRenameEntryRequest" },
              },
            },
          },
          responses: {
            "200": response("AuthoringRenameEntryResponse", "Renamed entry summary"),
            ...commonFailures,
          },
          "x-required-oauth-scope": "authoring:draft:write",
          "x-required-management-scopes": ["content.write"],
        },
        options: {
          operationId: "denyRenameAuthoringEntryBrowserPreflight",
          summary: "Authoring data routes do not support browser CORS",
          security: [],
          responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
        },
      },
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/locales/{locale}/entries/{entryId}/draft":
      {
        get: {
          operationId: "getAuthoringEntryDraft",
          summary: "Get one exact-locale hosted draft and optimistic authority",
          security: [{ AuthoringOAuth: ["authoring:read"] }, { AuthoringManagementCredential: [] }],
          parameters: [
            ...entryPathParameters,
            {
              name: "entryId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": response("AuthoringEntryDraftResponse", "Exact-locale entry draft"),
            ...commonFailures,
          },
          "x-required-oauth-scope": "authoring:read",
          "x-required-management-scopes": ["content.read"],
        },
        patch: {
          operationId: "saveAuthoringEntryDraft",
          summary: "Save API-key draft mutations with exact optimistic authority",
          security: [
            { AuthoringOAuth: ["authoring:draft:write"] },
            { AuthoringManagementCredential: [] },
          ],
          parameters: [
            ...entryPathParameters,
            {
              name: "entryId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthoringSaveEntryDraftRequest" },
              },
            },
          },
          responses: {
            "200": response("AuthoringSaveEntryDraftResponse", "Saved exact-locale entry draft"),
            ...commonFailures,
          },
          "x-required-oauth-scope": "authoring:draft:write",
          "x-required-management-scopes": ["content.write"],
        },
        options: {
          operationId: "denyGetAuthoringEntryDraftBrowserPreflight",
          summary: "Authoring data routes do not support browser CORS",
          security: [],
          responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
        },
      },
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/locales/{locale}/entries/{entryId}/publication":
      publicationOperation({
        operationId: "getAuthoringPublicationStatus",
        summary: "Get exact-locale publication and current draft authority",
        method: "GET",
        result: "AuthoringPublicationStatusResponse",
        oauthScope: "authoring:read",
        managementScope: "content.read",
      }),
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/locales/{locale}/entries/{entryId}/publication/validate":
      publicationOperation({
        operationId: "validateAuthoringPublication",
        summary: "Validate the exact current locale publication candidate",
        method: "POST",
        request: "AuthoringValidatePublicationRequest",
        result: "AuthoringPublicationPlanResponse",
        oauthScope: "authoring:content:publish",
        managementScope: "content.publish",
      }),
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/locales/{locale}/entries/{entryId}/publication/publish":
      publicationOperation({
        operationId: "publishAuthoringEntry",
        summary: "Publish exact locale from exact validated authority",
        method: "POST",
        request: "AuthoringPublishEntryRequest",
        result: "AuthoringPublishEntryResponse",
        oauthScope: "authoring:content:publish",
        managementScope: "content.publish",
      }),
    "/projects/{projectId}/environments/{environmentId}/collections/{collectionKey}/locales/{locale}/entries/{entryId}/publication/unpublish":
      publicationOperation({
        operationId: "unpublishAuthoringEntry",
        summary: "Unpublish exact locale from exact current publication state",
        method: "POST",
        request: "AuthoringUnpublishEntryRequest",
        result: "AuthoringUnpublishEntryResponse",
        oauthScope: "authoring:content:publish",
        managementScope: "content.publish",
      }),
    "/projects/{projectId}/environments/{environmentId}/schema/export": {
      get: {
        operationId: "exportAuthoringProjectSchema",
        summary: "Export the complete current code-owned project schema and source mappings",
        security: [{ AuthoringOAuth: ["authoring:read"] }, { AuthoringManagementCredential: [] }],
        parameters: pathParameters,
        responses: {
          "200": response("AuthoringSchemaExportResponse", "Current project schema export"),
          ...commonFailures,
        },
        "x-required-oauth-scope": "authoring:read",
        "x-required-management-scopes": ["schema.read"],
      },
      options: {
        operationId: "denyExportAuthoringProjectSchemaBrowserPreflight",
        summary: "Authoring data routes do not support browser CORS",
        security: [],
        responses: { "403": failure("Browser-origin Authoring requests are not allowed.") },
      },
    },
    "/projects/{projectId}/environments/{environmentId}/schema/plan": schemaOperation({
      operationId: "planAuthoringProjectSchema",
      summary: "Plan one complete code-owned project schema",
      request: "AuthoringSchemaPlanRequest",
      result: "AuthoringSchemaPlanResponse",
      oauthScope: "authoring:schema:push",
      managementScopes: ["schema.read", "schema.write", "schema.publish"],
    }),
    "/projects/{projectId}/environments/{environmentId}/schema/apply": schemaOperation({
      operationId: "applyAuthoringProjectSchema",
      summary: "Atomically apply one previously planned complete project schema",
      request: "AuthoringSchemaApplyRequest",
      result: "AuthoringSchemaApplyResponse",
      oauthScope: "authoring:schema:push",
      managementScopes: ["schema.read", "schema.write", "schema.publish"],
    }),
  },
  components: {
    securitySchemes: {
      AuthoringOAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Official CLI OAuth device access token with the exact operation-specific Authoring grant.",
        "x-device-authorization-url": "/api/auth/device/code",
        "x-token-url": "/api/auth/oauth2/token",
        "x-scopes": [
          "authoring:read",
          "authoring:draft:write",
          "authoring:content:publish",
          "authoring:schema:push",
        ],
      },
      AuthoringManagementCredential: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "ffd_mgmt_…",
        description:
          "Existing project/environment-bound management credential with each operation's exact listed scopes.",
      },
    },
    headers: {
      CacheControl: {
        description: "Authoring responses are never stored.",
        schema: { type: "string", const: "no-store" },
      },
      RequestId: {
        description: "Bounded request correlation identifier.",
        schema: { type: "string", maxLength: 128 },
      },
      RateLimitLimit: {
        description: "Current Authoring policy rate.",
        schema: { type: "integer" },
      },
      RateLimitRemaining: { description: "Remaining weighted units.", schema: { type: "integer" } },
      RateLimitReset: { description: "Reset time as Unix seconds.", schema: { type: "integer" } },
    },
    schemas: schemaComponents(),
  },
  "x-authoring-limits": authoringLimits,
} as const;
