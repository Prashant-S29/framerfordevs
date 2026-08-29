// Generates the tenant-neutral public Delivery OpenAPI contract from Effect response schemas and protocol metadata.

import { JSONSchema, Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import { DeliveryApiFailure, DeliveryItem, DeliveryPage } from "..";

const exampleProjectId = "019fae8b-1234-7000-8000-000000000001";
const exampleCollectionId = "019fae8b-1234-7000-8000-000000000002";
const exampleEntryId = "019fae8b-1234-7000-8000-000000000003";
const examplePublicationId = "019fae8b-1234-7000-8000-000000000004";
const exampleSchemaRevisionId = "019fae8b-1234-7000-8000-000000000005";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Repoints Effect's local definitions into one OpenAPI components registry. */
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
  const localReference = Reflect.get(root, "$ref");
  if (localReference !== `#/$defs/${name}`) {
    components[name] = rewriteSchemaReferences(root);
  }
}

function schemaComponents(): Readonly<Record<string, unknown>> {
  const components: Record<string, unknown> = {};
  addEffectSchema(components, "DeliveryItemResponse", ApiSuccessSchema(DeliveryItem));
  addEffectSchema(components, "DeliveryPageResponse", ApiSuccessSchema(DeliveryPage));
  addEffectSchema(components, "DeliveryApiFailure", DeliveryApiFailure);
  return components;
}

const responseHeaders = {
  ETag: { $ref: "#/components/headers/ETag" },
  "Last-Modified": { $ref: "#/components/headers/LastModified" },
  "Cache-Control": { $ref: "#/components/headers/CacheControl" },
  "X-Request-Id": { $ref: "#/components/headers/RequestId" },
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
} as const;

const rateLimitedHeaders = {
  ...responseHeaders,
  "Retry-After": { $ref: "#/components/headers/RetryAfter" },
} as const;

function successResponse(kind: "item" | "page") {
  return {
    description:
      kind === "item"
        ? "The exact-locale published entry."
        : "A generation-stable page. Total counts and page numbers are intentionally omitted.",
    headers: responseHeaders,
    content: {
      "application/json": {
        schema: {
          $ref:
            kind === "item"
              ? "#/components/schemas/DeliveryItemResponse"
              : "#/components/schemas/DeliveryPageResponse",
        },
        example: kind === "item" ? itemSuccessExample : pageSuccessExample,
      },
    },
  };
}

function headSuccessResponse(kind: "item" | "page") {
  return {
    description: `${kind === "item" ? "Entry" : "Page"} metadata only. HEAD never includes a response body.`,
    headers: responseHeaders,
  };
}

function failureResponse(description: string, code: string, status: number, retryable = false) {
  return {
    description,
    "x-http-status": status,
    headers:
      code === "RATE_LIMITED"
        ? rateLimitedHeaders
        : { "X-Request-Id": responseHeaders["X-Request-Id"] },
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/DeliveryApiFailure" },
        example: {
          ok: false,
          data: null,
          error: {
            code,
            message: description,
            retryable,
            requestId: "request.example-123",
          },
          message: description,
        },
      },
    },
  };
}

const notModifiedResponse = {
  description: "The authenticated representation has not changed. 304 never includes a body.",
  headers: responseHeaders,
};

const optionsOperation = {
  summary: "Inspect Delivery cross-origin request support",
  description:
    "Delivery permits wildcard, non-credentialed CORS for GET and HEAD. Authorization is accepted as a request header but browser credentials mode is not enabled.",
  security: [],
  responses: {
    "204": {
      description: "The requested GET or HEAD preflight is allowed.",
      headers: {
        "Access-Control-Allow-Origin": {
          description: "Always `*` for Delivery.",
          schema: { type: "string", const: "*" },
        },
        "Access-Control-Allow-Methods": {
          description: "Supported Delivery methods.",
          schema: { type: "string", example: "GET, HEAD, OPTIONS" },
        },
        "Access-Control-Allow-Headers": {
          description: "The closed Delivery request-header allowlist.",
          schema: {
            type: "string",
            example: "Authorization, If-None-Match, If-Modified-Since, Traceparent, X-Request-Id",
          },
        },
      },
    },
    "403": failureResponse("The requested Delivery preflight is not allowed.", "FORBIDDEN", 403),
  },
} as const;

const itemSuccessExample = {
  ok: true,
  data: {
    id: exampleEntryId,
    collectionId: exampleCollectionId,
    collection: "posts",
    locale: "en",
    publication: {
      id: examplePublicationId,
      sequence: 3,
      schemaRevisionId: exampleSchemaRevisionId,
      publishedAt: "2026-08-11T12:00:00.000Z",
    },
    data: {
      title: "Delivery API quickstart",
      slug: "delivery-api-quickstart",
    },
  },
  error: null,
  message: "Delivery entry loaded.",
};

const pageSuccessExample = {
  ok: true,
  data: {
    items: [itemSuccessExample.data],
    page: {
      limit: 20,
      hasMore: true,
      nextCursor: "eyJ2IjoxLCJleHAiOjE3ODY0NTY4MDB9.example",
    },
  },
  error: null,
  message: "Delivery entries loaded.",
};

const projectParameter = {
  name: "projectId",
  in: "path",
  required: true,
  description: "Stable project UUID.",
  schema: { type: "string", format: "uuid" },
  example: exampleProjectId,
} as const;
const environmentParameter = {
  name: "environmentKey",
  in: "path",
  required: true,
  description: "Canonical environment key.",
  schema: { type: "string", pattern: "^[a-z][a-z0-9-]{0,62}$", maxLength: 63 },
  example: "main",
} as const;
const collectionParameter = {
  name: "collectionKey",
  in: "path",
  required: true,
  description: "Published collection API key.",
  schema: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$", maxLength: 63 },
  example: "posts",
} as const;
const localeParameter = {
  name: "locale",
  in: "query",
  required: true,
  description:
    "One explicit enabled canonical BCP 47 locale. Delivery never falls back to another locale.",
  schema: { type: "string", minLength: 2, maxLength: 35 },
  example: "en",
} as const;
const entryParameter = {
  name: "entryId",
  in: "path",
  required: true,
  description: "Stable entry UUID.",
  schema: { type: "string", format: "uuid" },
  example: exampleEntryId,
} as const;
const expansionParameter = {
  name: "expand",
  in: "query",
  required: false,
  description:
    "Comma-separated configured reference paths. At most 10 unique paths, each one or two field-key segments. Expansion follows pinned publication references and never silently truncates.",
  schema: { type: "string", maxLength: 639 },
  example: "author,related_entry.author",
} as const;
const conditionalParameters = [
  {
    name: "If-None-Match",
    in: "header",
    required: false,
    description: "Strong or weak ETag validator. Takes precedence over If-Modified-Since.",
    schema: { type: "string" },
  },
  {
    name: "If-Modified-Since",
    in: "header",
    required: false,
    description: "Conservative HTTP-date validator used only when If-None-Match is absent.",
    schema: { type: "string", format: "http-date" },
  },
] as const;

const commonFailures = {
  "400": failureResponse(
    "The request path or strict query grammar is invalid.",
    "DELIVERY_QUERY_INVALID",
    400,
  ),
  "401": failureResponse(
    "A required or supplied Delivery credential is invalid.",
    "CREDENTIAL_INVALID",
    401,
  ),
  "404": failureResponse(
    "The exact project, environment, collection, locale, or publication is unavailable.",
    "NOT_FOUND",
    404,
  ),
  "413": failureResponse(
    "The requested representation exceeds 4 MiB.",
    "DELIVERY_RESPONSE_TOO_LARGE",
    413,
  ),
  "429": failureResponse("Too many requests. Try again later.", "RATE_LIMITED", 429, true),
  "500": failureResponse("An unexpected internal error occurred.", "INTERNAL_ERROR", 500, true),
  "503": failureResponse(
    "A required service is temporarily unavailable.",
    "SERVICE_UNAVAILABLE",
    503,
    true,
  ),
} as const;

function itemOperations(options: { readonly immutable: boolean; readonly unique: boolean }) {
  const operationParameters = [
    projectParameter,
    environmentParameter,
    collectionParameter,
    localeParameter,
    ...(options.unique
      ? [
          {
            name: "fieldKey",
            in: "path",
            required: true,
            description: "A configured unique-lookup field key.",
            schema: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$", maxLength: 63 },
            example: "slug",
          } as const,
          {
            name: "value",
            in: "query",
            required: true,
            description: "The exact typed unique value. At most 2,048 characters.",
            schema: { type: "string", minLength: 1, maxLength: 2_048 },
            example: "delivery-api-quickstart",
          } as const,
        ]
      : [entryParameter]),
    ...(options.immutable
      ? [
          {
            name: "publicationId",
            in: "path",
            required: true,
            description: "Immutable publication UUID.",
            schema: { type: "string", format: "uuid" },
            example: examplePublicationId,
          } as const,
        ]
      : []),
    expansionParameter,
    ...conditionalParameters,
  ];
  const qualifier = options.immutable ? "immutable" : options.unique ? "unique" : "current";
  return {
    get: {
      operationId: `getDeliveryEntryBy${options.immutable ? "Publication" : options.unique ? "UniqueField" : "Id"}`,
      tags: ["Entries"],
      summary:
        qualifier === "immutable"
          ? "Get an immutable publication"
          : qualifier === "unique"
            ? "Get the current entry by unique field"
            : "Get the current entry by ID",
      description:
        qualifier === "immutable"
          ? "Returns one exact immutable publication artifact. Later publish or unpublish operations never change this URL."
          : qualifier === "unique"
            ? "Resolves exactly one current publication through a configured unique field in the requested locale."
            : "Returns the current publication for exactly the requested locale.",
      security: [{ DeliveryBearer: [] }, {}],
      parameters: operationParameters,
      responses: {
        "200": successResponse("item"),
        "304": notModifiedResponse,
        ...commonFailures,
      },
    },
    head: {
      operationId: `headDeliveryEntryBy${options.immutable ? "Publication" : options.unique ? "UniqueField" : "Id"}`,
      tags: ["Entries"],
      summary: "Inspect entry validators without a body",
      description:
        "Authentication, authorization, rate limits, and conditional validators are identical to GET.",
      security: [{ DeliveryBearer: [] }, {}],
      parameters: operationParameters,
      responses: {
        "200": headSuccessResponse("item"),
        "304": notModifiedResponse,
        ...commonFailures,
      },
    },
    options: optionsOperation,
  };
}

export const deliveryOpenApiDocument: Readonly<Record<string, unknown>> = {
  openapi: "3.1.0",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "Framer for Devs Delivery API",
    version: "1.0.0",
    description:
      "Portable, versioned HTTP/JSON access to exact-locale published CMS snapshots. Drafts and locale fallback are never exposed.",
    license: { name: "Proprietary" },
  },
  servers: [{ url: "/api/delivery/v1", description: "Current installation" }],
  tags: [{ name: "Entries", description: "Published exact-locale content reads." }],
  security: [{ DeliveryBearer: [] }, {}],
  paths: {
    "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries": {
      get: {
        operationId: "listDeliveryEntries",
        tags: ["Entries"],
        summary: "List current exact-locale publications",
        description:
          "Returns a stable keyset page. The query string is limited to 8,192 bytes and rejects unknown or duplicate parameters. Up to five configured filters use `filter.{fieldKey}.{operator}`; equality kinds support `eq|ne`, while ordered kinds support `eq|ne|gt|gte|lt|lte`. A collection-locale publication change can return `DELIVERY_CURSOR_STALE`; restart from page one. Successful continuations receive a fresh 15-minute cursor. Total counts and page numbers are intentionally omitted.",
        security: [{ DeliveryBearer: [] }, {}],
        parameters: [
          projectParameter,
          environmentParameter,
          collectionParameter,
          localeParameter,
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Page size.",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            description:
              "Opaque continuation cursor bound to collection, locale, generation, and query.",
            schema: {
              type: "string",
              minLength: 1,
              maxLength: 1_024,
              pattern: "^[A-Za-z0-9_-]+$",
            },
          },
          {
            name: "sort",
            in: "query",
            required: false,
            description: "One configured sortable root field. Prefix `-` for descending order.",
            schema: { type: "string", pattern: "^-?[a-z][a-z0-9_]{0,62}$", maxLength: 64 },
            example: "-published_at",
          },
          {
            name: "filter.{fieldKey}.{operator}",
            in: "query",
            required: false,
            description: "Dynamic configured filter; at most five unique predicates.",
            schema: { type: "string", maxLength: 2_048 },
            example: "guide",
          },
          expansionParameter,
          ...conditionalParameters,
        ],
        responses: {
          "200": successResponse("page"),
          "304": notModifiedResponse,
          ...commonFailures,
          "409": failureResponse(
            "The collection-locale generation changed; restart pagination from page one.",
            "DELIVERY_CURSOR_STALE",
            409,
          ),
        },
      },
      head: {
        operationId: "headDeliveryEntries",
        tags: ["Entries"],
        summary: "Inspect page validators without a body",
        description:
          "Uses the same strict query, authentication, authorization, and rate-limit behavior as GET.",
        security: [{ DeliveryBearer: [] }, {}],
        parameters: [
          projectParameter,
          environmentParameter,
          collectionParameter,
          localeParameter,
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: "cursor",
            in: "query",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 1_024 },
          },
          {
            name: "sort",
            in: "query",
            required: false,
            schema: { type: "string", maxLength: 64 },
          },
          {
            name: "filter.{fieldKey}.{operator}",
            in: "query",
            required: false,
            description: "Dynamic configured filter; at most five unique predicates.",
            schema: { type: "string", maxLength: 2_048 },
          },
          expansionParameter,
          ...conditionalParameters,
        ],
        responses: {
          "200": headSuccessResponse("page"),
          "304": notModifiedResponse,
          ...commonFailures,
          "409": failureResponse(
            "The collection-locale generation changed; restart pagination from page one.",
            "DELIVERY_CURSOR_STALE",
            409,
          ),
        },
      },
      options: optionsOperation,
    },
    "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}":
      itemOperations({ immutable: false, unique: false }),
    "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/by/{fieldKey}":
      itemOperations({ immutable: false, unique: true }),
    "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}/publications/{publicationId}":
      itemOperations({ immutable: true, unique: false }),
  },
  components: {
    securitySchemes: {
      DeliveryBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "ffd_del_…",
        description:
          "Optional only for public collections. Protected collections require an environment-scoped `delivery.read` credential. A supplied invalid credential is rejected even when a collection is public. Never place credentials in URLs.",
      },
    },
    headers: {
      ETag: {
        description: "Strong validator for the exact response bytes.",
        schema: { type: "string" },
      },
      LastModified: {
        description: "Latest authority timestamp represented by the response.",
        schema: { type: "string", format: "http-date" },
      },
      CacheControl: {
        description: "Public/protected and mutable/immutable cache policy.",
        schema: { type: "string" },
      },
      RequestId: {
        description: "Bounded request correlation identifier.",
        schema: { type: "string", maxLength: 128 },
      },
      RateLimitLimit: {
        description: "Limit for the policy governing the response.",
        schema: { type: "integer", minimum: 1 },
      },
      RateLimitRemaining: {
        description: "Whole weighted tokens currently available.",
        schema: { type: "integer", minimum: 0 },
      },
      RateLimitReset: {
        description: "Unix timestamp in seconds when the bucket is fully replenished.",
        schema: { type: "integer", minimum: 0 },
      },
      RetryAfter: {
        description: "Whole seconds before the rejected weighted request can retry.",
        schema: { type: "integer", minimum: 1 },
      },
    },
    schemas: schemaComponents(),
  },
  externalDocs: {
    description: "Interactive Delivery API reference",
    url: "/api/delivery/v1/docs",
  },
};
