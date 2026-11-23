import { Schema } from "effect";

import { make as makeJsonSchema } from "../../response/json-schema";
import { PreviewHandoffRequest, PreviewHandoffResponse } from "../../preview-handoff";

import {
  StudioContentApiFailure,
  StudioContentContextResponse,
  StudioCreateEntryRequest,
  StudioCreateEntryResponse,
  StudioEntryPageResponse,
  StudioEntryWorkspaceResponse,
  StudioNewEntryWorkspaceResponse,
  StudioPublicationPageResponse,
  StudioPublicationPlanResponse,
  StudioPublicationStatusResponse,
  StudioPresentationResponse,
  StudioPublishEntryRequest,
  StudioPublishPresentationRequest,
  StudioPublishPresentationResponse,
  StudioPublishResponse,
  StudioRenameEntryRequest,
  StudioRenameEntryResponse,
  StudioResolveEntriesRequest,
  StudioResolveEntriesResponse,
  StudioRestoreRevisionRequest,
  StudioRestoreRevisionResponse,
  StudioRevisionComparisonResponse,
  StudioRevisionPageResponse,
  StudioRevisionResponse,
  StudioSaveEntryDraftRequest,
  StudioSaveEntryDraftResponse,
  StudioSearchEntriesRequest,
  StudioUnpublishEntryRequest,
  StudioUnpublishResponse,
  StudioValidatePublicationRequest,
  studioContentLimits,
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
  schema: Schema.Top,
): void {
  const generated = makeJsonSchema(schema);
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
  for (const [name, schema] of [
    ["StudioContentApiFailure", StudioContentApiFailure],
    ["StudioContentContextResponse", StudioContentContextResponse],
    ["StudioEntryPageResponse", StudioEntryPageResponse],
    ["StudioSearchEntriesRequest", StudioSearchEntriesRequest],
    ["StudioResolveEntriesRequest", StudioResolveEntriesRequest],
    ["StudioResolveEntriesResponse", StudioResolveEntriesResponse],
    ["StudioNewEntryWorkspaceResponse", StudioNewEntryWorkspaceResponse],
    ["StudioEntryWorkspaceResponse", StudioEntryWorkspaceResponse],
    ["StudioCreateEntryRequest", StudioCreateEntryRequest],
    ["StudioCreateEntryResponse", StudioCreateEntryResponse],
    ["StudioRenameEntryRequest", StudioRenameEntryRequest],
    ["StudioRenameEntryResponse", StudioRenameEntryResponse],
    ["StudioSaveEntryDraftRequest", StudioSaveEntryDraftRequest],
    ["StudioSaveEntryDraftResponse", StudioSaveEntryDraftResponse],
    ["StudioRevisionPageResponse", StudioRevisionPageResponse],
    ["StudioRevisionResponse", StudioRevisionResponse],
    ["StudioRevisionComparisonResponse", StudioRevisionComparisonResponse],
    ["StudioRestoreRevisionRequest", StudioRestoreRevisionRequest],
    ["StudioRestoreRevisionResponse", StudioRestoreRevisionResponse],
    ["StudioPublicationStatusResponse", StudioPublicationStatusResponse],
    ["StudioPublicationPageResponse", StudioPublicationPageResponse],
    ["StudioValidatePublicationRequest", StudioValidatePublicationRequest],
    ["StudioPublicationPlanResponse", StudioPublicationPlanResponse],
    ["StudioPublishEntryRequest", StudioPublishEntryRequest],
    ["StudioPublishResponse", StudioPublishResponse],
    ["StudioUnpublishEntryRequest", StudioUnpublishEntryRequest],
    ["StudioUnpublishResponse", StudioUnpublishResponse],
    ["StudioPresentationResponse", StudioPresentationResponse],
    ["PreviewHandoffRequest", PreviewHandoffRequest],
    ["PreviewHandoffResponse", PreviewHandoffResponse],
    ["StudioPublishPresentationRequest", StudioPublishPresentationRequest],
    ["StudioPublishPresentationResponse", StudioPublishPresentationResponse],
  ] as const) {
    addEffectSchema(components, name, schema);
  }
  return components;
}

const responseHeaders = {
  "Cache-Control": { $ref: "#/components/headers/CacheControl" },
  "Referrer-Policy": { $ref: "#/components/headers/ReferrerPolicy" },
  "X-Content-Type-Options": { $ref: "#/components/headers/ContentTypeOptions" },
  "X-Request-Id": { $ref: "#/components/headers/RequestId" },
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
} as const;

function success(schema: string, description: string) {
  return {
    description,
    headers: responseHeaders,
    content: {
      "application/json": { schema: { $ref: `#/components/schemas/${schema}` } },
    },
  };
}

function failure(description: string) {
  return {
    description,
    headers: responseHeaders,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/StudioContentApiFailure" },
      },
    },
  };
}

const commonFailures = {
  "400": failure("The strict path, query, cursor, or request body is invalid."),
  "401": failure("A current Studio bearer token is required."),
  "403": failure(
    "The current Studio user is not allowed to perform this operation, or a form layout change is outside editorial authority (PRESENTATION_ROLE_VISIBILITY_FORBIDDEN, PRESENTATION_SCOPE_RESTRICTED).",
  ),
  "404": failure("The exact authorized Studio Content scope is unavailable."),
  "409": failure(
    "Current schema, configuration, name, draft, command, revision compatibility (REVISION_INCOMPATIBLE), or publication state (PUBLICATION_STATE_CONFLICT) authority conflicts.",
  ),
  "413": failure("The request or projected response exceeds its fixed bound."),
  "429": failure("The Studio request quota is exhausted."),
  "500": failure("An unexpected internal error occurred."),
  "503": failure("A required service is temporarily unavailable."),
} as const;

const projectParameters = [
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
const presentationParameters = [
  ...projectParameters,
  {
    name: "collectionId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
] as const;
const collectionParameters = [
  ...projectParameters,
  {
    name: "collectionId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  {
    name: "locale",
    in: "path",
    required: true,
    schema: { type: "string", minLength: 2, maxLength: 35 },
  },
] as const;
const entryParameters = [
  ...collectionParameters,
  {
    name: "entryId",
    in: "path",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
] as const;

function jsonBody(schema: string, maximumBytes: number = studioContentLimits.requestBytes) {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schema}` },
      },
    },
    "x-maximum-bytes": maximumBytes,
  };
}

const revisionParameter = {
  name: "revisionId",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
} as const;
const pageParameters = [
  {
    name: "cursor",
    in: "query",
    required: false,
    schema: { type: "string", minLength: 1, maxLength: 1_024 },
  },
  {
    name: "limit",
    in: "query",
    required: false,
    schema: {
      type: "integer",
      minimum: studioContentLimits.pageLimitMinimum,
      maximum: studioContentLimits.pageLimitMaximum,
      default: studioContentLimits.pageLimitDefault,
    },
  },
] as const;

const root = "/projects/{projectId}/environments/{environmentId}";
const entries = `${root}/collections/{collectionId}/locales/{locale}/entries`;

export const studioContentOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Framer for Devs Studio Content API",
    version: "1.0.0",
    description:
      "Bounded server-to-server content projection for the mounted Studio and the `ffd editor` local Studio. It reuses the exact Studio OAuth grant or the CLI `studio:content` grant, and never exposes bearer authority to browser JavaScript.",
  },
  servers: [{ url: "/api/studio-content/v1" }],
  paths: {
    [`${root}/context`]: {
      get: {
        operationId: "getStudioContentContext",
        summary: "Load effective locales and role-visible published collections",
        security: [{ studioBearer: [] }],
        parameters: projectParameters,
        responses: {
          "200": success("StudioContentContextResponse", "The bounded current content context."),
          ...commonFailures,
        },
      },
    },
    [entries]: {
      get: {
        operationId: "browseStudioEntries",
        summary: "Browse one exact-locale collection by immutable creation order",
        security: [{ studioBearer: [] }],
        parameters: [
          ...collectionParameters,
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 1_024 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: {
              type: "integer",
              minimum: studioContentLimits.pageLimitMinimum,
              maximum: studioContentLimits.pageLimitMaximum,
              default: studioContentLimits.pageLimitDefault,
            },
          },
        ],
        responses: {
          "200": success("StudioEntryPageResponse", "A bounded entry page and capped count."),
          ...commonFailures,
        },
      },
      post: {
        operationId: "createStudioEntry",
        summary: "Create an entry and initial exact-locale draft through M7 authority",
        security: [{ studioBearer: [] }],
        parameters: collectionParameters,
        requestBody: jsonBody("StudioCreateEntryRequest"),
        responses: {
          "200": success("StudioCreateEntryResponse", "The receipt-backed create result."),
          ...commonFailures,
        },
      },
    },
    [`${entries}/search`]: {
      post: {
        operationId: "searchStudioEntries",
        summary: "Search literal case-insensitive display-name prefixes",
        security: [{ studioBearer: [] }],
        parameters: collectionParameters,
        requestBody: jsonBody("StudioSearchEntriesRequest", studioContentLimits.searchRequestBytes),
        responses: {
          "200": success("StudioEntryPageResponse", "A bounded search page and capped count."),
          ...commonFailures,
        },
      },
    },
    [`${entries}/resolve`]: {
      post: {
        operationId: "resolveStudioEntryLabels",
        summary: "Resolve requested authorized entry IDs to safe display names",
        security: [{ studioBearer: [] }],
        parameters: collectionParameters,
        requestBody: jsonBody(
          "StudioResolveEntriesRequest",
          studioContentLimits.resolveRequestBytes,
        ),
        responses: {
          "200": success(
            "StudioResolveEntriesResponse",
            "Requested available labels in first-requested order.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/new`]: {
      get: {
        operationId: "getStudioNewEntryWorkspace",
        summary: "Load the current role-projected create workspace",
        security: [{ studioBearer: [] }],
        parameters: collectionParameters,
        responses: {
          "200": success(
            "StudioNewEntryWorkspaceResponse",
            "The immutable projected form and current create authority.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}`]: {
      get: {
        operationId: "getStudioEntryWorkspace",
        summary: "Load one coherent projected form and exact-locale draft workspace",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        responses: {
          "200": success(
            "StudioEntryWorkspaceResponse",
            "The schema-revision-bound form and draft workspace.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/name`]: {
      patch: {
        operationId: "renameStudioEntry",
        summary: "Optimistically rename locale-neutral entry metadata",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        requestBody: jsonBody("StudioRenameEntryRequest"),
        responses: {
          "200": success("StudioRenameEntryResponse", "The renamed entry summary."),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/draft`]: {
      patch: {
        operationId: "saveStudioEntryDraft",
        summary: "Save stable-field-ID shared and exact-locale draft mutations",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        requestBody: jsonBody("StudioSaveEntryDraftRequest"),
        responses: {
          "200": success("StudioSaveEntryDraftResponse", "The receipt-backed save result."),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/revisions`]: {
      get: {
        operationId: "listStudioEntryRevisions",
        summary: "List one bounded page of shared or exact-locale revision summaries",
        security: [{ studioBearer: [] }],
        parameters: [
          ...entryParameters,
          {
            name: "scope",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["shared", "localized"] },
          },
          ...pageParameters,
        ],
        responses: {
          "200": success(
            "StudioRevisionPageResponse",
            "A bounded page of role-projected revision summaries, newest first.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/revisions/{revisionId}`]: {
      get: {
        operationId: "getStudioEntryRevision",
        summary: "Read one immutable revision with role-visible values",
        security: [{ studioBearer: [] }],
        parameters: [...entryParameters, revisionParameter],
        responses: {
          "200": success("StudioRevisionResponse", "The revision summary and projected values."),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/revisions/{fromRevisionId}/compare/{toRevisionId}`]: {
      get: {
        operationId: "compareStudioEntryRevisions",
        summary: "Compare two revisions of the same entry and scope by stable field ID",
        security: [{ studioBearer: [] }],
        parameters: [
          ...entryParameters,
          { ...revisionParameter, name: "fromRevisionId" },
          { ...revisionParameter, name: "toRevisionId" },
        ],
        responses: {
          "200": success(
            "StudioRevisionComparisonResponse",
            "Role-visible field differences. Hidden differences only set restrictedChanges.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/revisions/{revisionId}/restore`]: {
      post: {
        operationId: "restoreStudioEntryRevision",
        summary: "Restore one compatible revision as a new draft revision of its scope",
        security: [{ studioBearer: [] }],
        parameters: [...entryParameters, revisionParameter],
        requestBody: jsonBody(
          "StudioRestoreRevisionRequest",
          studioContentLimits.commandRequestBytes,
        ),
        responses: {
          "200": success("StudioRestoreRevisionResponse", "The receipt-backed restore result."),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/publication`]: {
      get: {
        operationId: "getStudioEntryPublication",
        summary: "Read the exact-locale publication state and value-based change flags",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        responses: {
          "200": success("StudioPublicationStatusResponse", "The current publication status."),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/publications`]: {
      get: {
        operationId: "listStudioEntryPublications",
        summary: "List one bounded page of immutable exact-locale publications",
        security: [{ studioBearer: [] }],
        parameters: [...entryParameters, ...pageParameters],
        responses: {
          "200": success(
            "StudioPublicationPageResponse",
            "A bounded page of publication summaries, newest first.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/publication/validate`]: {
      post: {
        operationId: "validateStudioEntryPublication",
        summary: "Validate the current draft and return the publish authority plan",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        requestBody: jsonBody(
          "StudioValidatePublicationRequest",
          studioContentLimits.commandRequestBytes,
        ),
        responses: {
          "200": success(
            "StudioPublicationPlanResponse",
            "The publication plan with role-projected validation.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/publication/publish`]: {
      post: {
        operationId: "publishStudioEntry",
        summary: "Publish the exact-locale draft named by a current plan",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        requestBody: jsonBody("StudioPublishEntryRequest", studioContentLimits.commandRequestBytes),
        responses: {
          "200": success(
            "StudioPublishResponse",
            "The immutable publication and the Delivery origin read-back.",
          ),
          ...commonFailures,
          "422": failure(
            "Publication authority fails validation (PUBLICATION_INVALID). Details name only role-visible fields.",
          ),
        },
      },
    },
    [`${entries}/{entryId}/publication/unpublish`]: {
      post: {
        operationId: "unpublishStudioEntry",
        summary: "Unpublish the current exact-locale publication",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        requestBody: jsonBody(
          "StudioUnpublishEntryRequest",
          studioContentLimits.commandRequestBytes,
        ),
        responses: {
          "200": success(
            "StudioUnpublishResponse",
            "The unpublish result and the Delivery origin read-back.",
          ),
          ...commonFailures,
        },
      },
    },
    [`${entries}/{entryId}/preview-handoffs`]: {
      post: {
        operationId: "issueStudioPreviewHandoff",
        summary: "Issue a five-minute Preview handoff token for the Studio server",
        description:
          "Only the Studio server calls this operation. It posts the token to the environment Preview URL and never exposes it to Studio browser JavaScript.",
        security: [{ studioBearer: [] }],
        parameters: entryParameters,
        requestBody: jsonBody("PreviewHandoffRequest", studioContentLimits.commandRequestBytes),
        responses: {
          "200": success("PreviewHandoffResponse", "The signed handoff and the Preview URL."),
          ...commonFailures,
        },
      },
    },
    [`${root}/collections/{collectionId}/presentation`]: {
      get: {
        operationId: "getStudioPresentation",
        summary: "Load the editorial form layout without role visibility",
        security: [{ studioBearer: [] }],
        parameters: presentationParameters,
        responses: {
          "200": success("StudioPresentationResponse", "The current editorial form layout."),
          ...commonFailures,
        },
      },
    },
    [`${root}/collections/{collectionId}/presentation/publish`]: {
      post: {
        operationId: "publishStudioPresentation",
        summary: "Publish labels, order, tabs, and groups as one presentation revision",
        security: [{ studioBearer: [] }],
        parameters: presentationParameters,
        requestBody: jsonBody(
          "StudioPublishPresentationRequest",
          studioContentLimits.presentationRequestBytes,
        ),
        responses: {
          "200": success(
            "StudioPublishPresentationResponse",
            "The published, replayed, or unchanged form layout revision.",
          ),
          ...commonFailures,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      studioBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "The existing five-minute Studio access token for the exact Studio v1 resource and `studio:session offline_access` scope set, or an official CLI access token with the `studio:content` scope. Every request revalidates current project membership.",
      },
    },
    headers: {
      CacheControl: { schema: { type: "string", const: "private, no-store, max-age=0" } },
      ReferrerPolicy: { schema: { type: "string", const: "no-referrer" } },
      ContentTypeOptions: { schema: { type: "string", const: "nosniff" } },
      RequestId: { schema: { type: "string", minLength: 1, maxLength: 128 } },
      RateLimitLimit: { schema: { type: "integer", minimum: 0 } },
      RateLimitRemaining: { schema: { type: "integer", minimum: 0 } },
      RateLimitReset: { schema: { type: "integer", minimum: 0 } },
    },
    schemas: schemaComponents(),
  },
} as const;

export const studioContentOpenApiJson = `${JSON.stringify(studioContentOpenApiDocument)}\n`;
