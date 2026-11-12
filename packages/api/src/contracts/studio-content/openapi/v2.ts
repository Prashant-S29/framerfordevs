import { Schema } from "effect";

import { make as makeJsonSchema } from "../../response/json-schema";

import { StudioResolveEntriesRequest, StudioResolveEntriesResponse, studioContentLimits } from "..";
import { studioContentOpenApiDocument } from ".";

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

function schemaComponents(): Readonly<Record<string, unknown>> {
  const components: Record<string, unknown> = {};
  addEffectSchema(components, "StudioResolveEntriesRequest", StudioResolveEntriesRequest);
  addEffectSchema(components, "StudioResolveEntriesResponse", StudioResolveEntriesResponse);
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
  "400": failure("The strict path or request body is invalid."),
  "401": failure("A current Studio bearer token is required."),
  "403": failure("The current Studio user is not allowed to perform this operation."),
  "404": failure("The exact authorized Studio Content scope is unavailable."),
  "409": failure("Current schema or collection configuration authority conflicts."),
  "413": failure("The request or projected response exceeds its fixed bound."),
  "429": failure("The Studio request quota is exhausted."),
  "500": failure("An unexpected internal error occurred."),
  "503": failure("A required service is temporarily unavailable."),
} as const;

const root = "/projects/{projectId}/environments/{environmentId}";
const entries = `${root}/collections/{collectionId}/locales/{locale}/entries`;
const collectionParameters = [
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

export const studioContentV2OpenApiDocument = {
  ...studioContentOpenApiDocument,
  info: {
    ...studioContentOpenApiDocument.info,
    version: "2.0.0",
    description:
      "Complete bounded Studio Content successor with safe batch reference-label resolution. It reuses the exact Studio OAuth grant and never exposes bearer authority to browser JavaScript.",
  },
  servers: [{ url: "/api/studio-content/v2" }],
  paths: {
    ...studioContentOpenApiDocument.paths,
    [`${entries}/resolve`]: {
      post: {
        operationId: "resolveStudioEntryLabels",
        summary: "Resolve requested authorized entry IDs to safe display names",
        security: [{ studioBearer: [] }],
        parameters: collectionParameters,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StudioResolveEntriesRequest" },
            },
          },
          "x-maximum-bytes": studioContentLimits.resolveRequestBytes,
        },
        responses: {
          "200": {
            description: "Requested available labels in first-requested order.",
            headers: responseHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StudioResolveEntriesResponse" },
              },
            },
          },
          ...commonFailures,
        },
      },
    },
  },
  components: {
    ...studioContentOpenApiDocument.components,
    schemas: {
      ...studioContentOpenApiDocument.components.schemas,
      ...schemaComponents(),
    },
  },
} as const;

export const studioContentV2OpenApiJson = `${JSON.stringify(studioContentV2OpenApiDocument)}\n`;
