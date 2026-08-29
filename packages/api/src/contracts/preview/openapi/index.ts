// Generates the tenant-neutral public Preview OpenAPI contract from Effect schemas and protocol metadata.

import { JSONSchema, Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import { PreviewApiFailure, PreviewItem, previewLimits } from "..";

const examples = {
  project: "019fae8b-1234-7000-8000-000000000001",
  collection: "019fae8b-1234-7000-8000-000000000002",
  entry: "019fae8b-1234-7000-8000-000000000003",
  schema: "019fae8b-1234-7000-8000-000000000004",
  shared: "019fae8b-1234-7000-8000-000000000005",
  localized: "019fae8b-1234-7000-8000-000000000006",
} as const;

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
  addEffectSchema(components, "PreviewItemResponse", ApiSuccessSchema(PreviewItem));
  addEffectSchema(components, "PreviewApiFailure", PreviewApiFailure);
  return components;
}

const responseHeaders = {
  "Cache-Control": { $ref: "#/components/headers/CacheControl" },
  Pragma: { $ref: "#/components/headers/Pragma" },
  Expires: { $ref: "#/components/headers/Expires" },
  "Referrer-Policy": { $ref: "#/components/headers/ReferrerPolicy" },
  "X-Content-Type-Options": { $ref: "#/components/headers/ContentTypeOptions" },
  "X-Request-Id": { $ref: "#/components/headers/RequestId" },
  "Content-Length": { $ref: "#/components/headers/ContentLength" },
  "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
  "RateLimit-Remaining": { $ref: "#/components/headers/RateLimitRemaining" },
  "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
} as const;

const successExample = {
  ok: true,
  data: {
    id: examples.entry,
    collectionId: examples.collection,
    collection: "articles",
    locale: "gu",
    preview: {
      version: 1,
      source: "current",
      schemaRevisionId: examples.schema,
      contractHash: "a".repeat(64),
      sharedRevisionId: examples.shared,
      sharedVersion: 2,
      localizedRevisionId: examples.localized,
      localizedVersion: 4,
    },
    data: {
      title: "અપ્રકાશિત પૂર્વાવલોકન",
      summary: "This safe draft may still be incomplete.",
    },
    validation: {
      valid: false,
      issues: [
        {
          fieldId: examples.localized,
          path: "summary",
          code: "min_length",
          message: "Enter at least 60 characters.",
        },
      ],
      capped: false,
    },
  },
  error: null,
  message: "Preview entry loaded.",
} as const;

function successResponse(head: boolean) {
  return {
    description: head
      ? "The authenticated Preview representation metadata. HEAD has no body but performs the same read and audit as GET."
      : "The exact selected unpublished Preview document. Soft-invalid content returns 200 with validation feedback.",
    headers: responseHeaders,
    ...(head
      ? {}
      : {
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PreviewItemResponse" },
              example: successExample,
            },
          },
        }),
  };
}

function failureResponse(description: string, code: string, status: number, retryable = false) {
  return {
    description,
    "x-http-status": status,
    headers: {
      ...responseHeaders,
      ...(status === 401
        ? { "WWW-Authenticate": { $ref: "#/components/headers/WwwAuthenticate" } }
        : {}),
      ...(status === 429 ? { "Retry-After": { $ref: "#/components/headers/RetryAfter" } } : {}),
    },
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/PreviewApiFailure" },
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

const commonFailures = {
  "400": failureResponse(
    "The strict Preview path or query grammar is invalid.",
    "PREVIEW_QUERY_INVALID",
    400,
  ),
  "401": failureResponse(
    "A Preview bearer credential is required and must remain active.",
    "CREDENTIAL_INVALID",
    401,
  ),
  "404": failureResponse("The exact Preview resource or locale is unavailable.", "NOT_FOUND", 404),
  "409": failureResponse(
    "The selected Preview sources are incompatible.",
    "PREVIEW_REVISION_INCOMPATIBLE",
    409,
  ),
  "413": failureResponse(
    "The Preview representation exceeds 2.5 MiB.",
    "PREVIEW_RESPONSE_TOO_LARGE",
    413,
  ),
  "429": failureResponse("Too many Preview requests. Try again later.", "RATE_LIMITED", 429, true),
  "500": failureResponse("An unexpected internal error occurred.", "INTERNAL_ERROR", 500, true),
  "503": failureResponse(
    "A required service is temporarily unavailable.",
    "SERVICE_UNAVAILABLE",
    503,
    true,
  ),
} as const;

const pathParameters = [
  {
    name: "projectId",
    in: "path",
    required: true,
    description: "Stable project UUID matching the Preview credential authority.",
    schema: { type: "string", format: "uuid" },
    example: examples.project,
  },
  {
    name: "environmentKey",
    in: "path",
    required: true,
    description: "Canonical environment key matching the Preview credential environment.",
    schema: { type: "string", pattern: "^[a-z][a-z0-9-]{0,62}$", maxLength: 63 },
    example: "main",
  },
  {
    name: "collectionKey",
    in: "path",
    required: true,
    description: "Current collection API key.",
    schema: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$", maxLength: 63 },
    example: "articles",
  },
  {
    name: "entryId",
    in: "path",
    required: true,
    description: "Stable logical entry UUID.",
    schema: { type: "string", format: "uuid" },
    example: examples.entry,
  },
] as const;

const localeParameter = {
  name: "locale",
  in: "query",
  required: true,
  description:
    "One exact enabled canonical locale. Preview never falls back or negotiates language.",
  schema: { type: "string", minLength: 2, maxLength: 35 },
  example: "gu",
} as const;

const selectorParameters = ["sharedRevision", "localizedRevision"].map((name) => ({
  name,
  in: "query",
  required: true,
  description: "An exact immutable entry revision UUID, or `none` for explicit version-0 absence.",
  schema: {
    oneOf: [
      { type: "string", const: "none" },
      { type: "string", format: "uuid" },
    ],
  },
  example: name === "sharedRevision" ? examples.shared : examples.localized,
}));

const optionsOperation = {
  summary: "Inspect Preview cross-origin request support",
  description:
    "Preview permits wildcard, non-credentialed CORS for GET and HEAD. Authorization is an explicit request header; cookies and browser credential mode are not used.",
  security: [],
  responses: {
    "204": {
      description: "The requested GET or HEAD preflight is allowed.",
      headers: {
        "Access-Control-Allow-Origin": {
          description: "Always `*` for public Preview.",
          schema: { type: "string", const: "*" },
        },
        "Access-Control-Allow-Methods": {
          description: "Supported Preview methods.",
          schema: { type: "string", example: "GET, HEAD, OPTIONS" },
        },
        "Access-Control-Allow-Headers": {
          description: "The closed Preview request-header allowlist.",
          schema: {
            type: "string",
            example: "Authorization, Traceparent, X-Request-Id",
          },
        },
      },
    },
    "403": failureResponse("The requested Preview preflight is not allowed.", "FORBIDDEN", 403),
  },
} as const;

function readOperation(source: "current" | "revision", head: boolean) {
  return {
    summary:
      source === "current"
        ? "Preview the current persisted draft"
        : "Preview an explicit compatible historical source combination",
    description:
      "Requires `Authorization: Bearer ffd_prev_...`. The response may contain unpublished and soft-invalid values and never changes Delivery or publication state. Keep Preview credentials in server-side configuration; never place them in URLs, browser storage, analytics, or public bundles.",
    security: [{ previewBearer: [] }],
    parameters: [
      ...pathParameters,
      ...(source === "revision"
        ? [
            {
              name: "schemaRevisionId",
              in: "path",
              required: true,
              description: "Explicit immutable schema revision UUID.",
              schema: { type: "string", format: "uuid" },
              example: examples.schema,
            },
          ]
        : []),
      localeParameter,
      ...(source === "revision" ? selectorParameters : []),
    ],
    responses: { "200": successResponse(head), ...commonFailures },
  };
}

const currentPath =
  "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}/draft";
const revisionPath =
  "/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}/revisions/{schemaRevisionId}";

export const previewOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Framer for Devs Preview API",
    version: "1.0.0",
    description:
      "Authenticated, exact-locale access to persisted current drafts and explicit compatible historical sources. Preview is isolated from Delivery, never publishes content, and always returns private no-store responses.",
  },
  servers: [{ url: "/api/preview/v1" }],
  tags: [{ name: "Preview", description: "Read-only unpublished content access." }],
  paths: {
    [currentPath]: {
      get: readOperation("current", false),
      head: readOperation("current", true),
      options: optionsOperation,
    },
    [revisionPath]: {
      get: readOperation("revision", false),
      head: readOperation("revision", true),
      options: optionsOperation,
    },
  },
  components: {
    schemas: schemaComponents(),
    securitySchemes: {
      previewBearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "ffd_prev_<credential-id>_<secret>",
        description:
          "Environment-wide Preview credential with `preview.read`, a mandatory expiry, and a maximum original lifetime of 30 days.",
      },
    },
    headers: {
      CacheControl: {
        description: "Always `private, no-store, max-age=0` for content responses.",
        schema: { type: "string", const: "private, no-store, max-age=0" },
      },
      Pragma: {
        description: "Legacy cache prevention.",
        schema: { type: "string", const: "no-cache" },
      },
      Expires: {
        description: "Immediate expiry for legacy intermediaries.",
        schema: { type: "string", const: "0" },
      },
      ReferrerPolicy: {
        description: "Preview URLs are never sent as referrers.",
        schema: { type: "string", const: "no-referrer" },
      },
      ContentTypeOptions: {
        description: "Disables MIME sniffing.",
        schema: { type: "string", const: "nosniff" },
      },
      RequestId: {
        description: "Bounded request correlation identifier.",
        schema: { type: "string", maxLength: 128 },
      },
      ContentLength: {
        description: "Exact UTF-8 representation length; HEAD sends this metadata without a body.",
        schema: { type: "integer", minimum: 0 },
      },
      RateLimitLimit: { description: "Current identity policy rate.", schema: { type: "integer" } },
      RateLimitRemaining: { description: "Remaining quota units.", schema: { type: "integer" } },
      RateLimitReset: { description: "Reset time as Unix seconds.", schema: { type: "integer" } },
      RetryAfter: {
        description: "Seconds before retrying a limited request.",
        schema: { type: "integer" },
      },
      WwwAuthenticate: {
        description: "Safe Preview bearer challenge.",
        schema: { type: "string", const: 'Bearer realm="preview"' },
      },
    },
  },
  "x-preview-limits": {
    queryBytes: previewLimits.queryBytes,
    responseBytes: previewLimits.responseBytes,
    validationIssues: previewLimits.issues,
    referenceExpansion: false,
  },
} as const;
