// Generates the tenant-neutral Studio v1 bootstrap OpenAPI contract from Effect schemas.

import { JSONSchema, Schema } from "effect";

import { StudioApiFailure, StudioBootstrapResponse, studioLimits } from "..";

const examples = {
  registration: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  workspace: "019fae8b-1234-7000-8000-000000000004",
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
  addEffectSchema(components, "StudioBootstrapResponse", StudioBootstrapResponse);
  addEffectSchema(components, "StudioApiFailure", StudioApiFailure);
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
        schema: { $ref: "#/components/schemas/StudioApiFailure" },
        example: {
          ok: false,
          data: null,
          error: {
            code,
            message: description,
            retryable,
            requestId: "request.m18-studio-example",
          },
          message: description,
        },
      },
    },
  };
}

const bootstrapPath = "/projects/{projectId}/environments/{environmentId}/bootstrap";

export const studioOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Framer for Devs Studio API",
    version: "1.0.0",
    description:
      "Server-to-server bootstrap authority for an explicitly activated project Studio. Browser JavaScript never calls this API or receives its bearer token.",
  },
  servers: [{ url: "/api/studio/v1" }],
  paths: {
    [bootstrapPath]: {
      get: {
        operationId: "getStudioBootstrap",
        summary: "Load current Studio bootstrap authority",
        description:
          "Revalidates the active registration, exact token authority, current project membership, role, CMS capability, and audited grant marker. No content or management credential is returned.",
        security: [{ studioBearer: [] }],
        parameters: [
          {
            name: "projectId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            example: examples.project,
          },
          {
            name: "environmentId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
            example: examples.environment,
          },
        ],
        responses: {
          "200": {
            description: "The bounded current-user Studio shell projection.",
            headers: responseHeaders,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StudioBootstrapResponse" },
                example: {
                  ok: true,
                  data: {
                    formatVersion: 1,
                    registration: {
                      id: examples.registration,
                      version: 3,
                      applicationOrigin: "https://application.example.test",
                      mountPath: "/studio",
                    },
                    project: {
                      id: examples.project,
                      name: "Customer Site",
                      workspaceId: examples.workspace,
                    },
                    environment: { id: examples.environment, key: "main", name: "main" },
                    user: {
                      id: "studio-user",
                      name: "Studio User",
                      email: "studio@example.test",
                    },
                    role: "developer",
                    effectiveActions: ["project.read", "project.update"],
                    session: { expiresAt: "2026-09-21T20:00:00.000Z" },
                  },
                  error: null,
                  message: "Studio bootstrap loaded.",
                },
              },
            },
          },
          "400": failureResponse(
            "The strict Studio path or request grammar is invalid.",
            "VALIDATION_ERROR",
            400,
          ),
          "401": failureResponse("A current Studio bearer token is required.", "UNAUTHORIZED", 401),
          "403": failureResponse(
            "The current user is not allowed to access this Studio.",
            "FORBIDDEN",
            403,
          ),
          "404": failureResponse("The exact Studio scope is unavailable.", "NOT_FOUND", 404),
          "413": failureResponse(
            "The Studio bootstrap representation exceeds 64 KiB.",
            "STUDIO_RESPONSE_TOO_LARGE",
            413,
          ),
          "429": failureResponse(
            "Too many Studio requests. Try again later.",
            "RATE_LIMITED",
            429,
            true,
          ),
          "500": failureResponse(
            "An unexpected internal error occurred.",
            "INTERNAL_ERROR",
            500,
            true,
          ),
          "503": failureResponse(
            "A required service is temporarily unavailable.",
            "SERVICE_UNAVAILABLE",
            503,
            true,
          ),
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
          "A five-minute Studio access token for the exact Studio v1 resource and `studio:session` scope. Cookies and browser storage are never accepted.",
      },
    },
    headers: {
      CacheControl: {
        description: "Bootstrap responses are never reusable authority.",
        schema: { type: "string", const: "private, no-store, max-age=0" },
      },
      ReferrerPolicy: { schema: { type: "string", const: "no-referrer" } },
      ContentTypeOptions: { schema: { type: "string", const: "nosniff" } },
      RequestId: { schema: { type: "string", minLength: 1, maxLength: 128 } },
      WwwAuthenticate: {
        schema: {
          type: "string",
          const: 'Bearer realm="studio", error="invalid_token"',
        },
      },
      RetryAfter: { schema: { type: "integer", minimum: 1 } },
      RateLimitLimit: { schema: { type: "integer", minimum: 1 } },
      RateLimitRemaining: { schema: { type: "integer", minimum: 0 } },
      RateLimitReset: { schema: { type: "integer", minimum: 0 } },
    },
    schemas: schemaComponents(),
  },
  "x-studio-limits": {
    requestBytes: studioLimits.requestBytes,
    responseBytes: studioLimits.responseBytes,
    authorizationBytes: studioLimits.maximumAuthorizationBytes,
    accessTokenLifetimeSeconds: studioLimits.accessTokenLifetimeSeconds,
    refreshTokenLifetimeSeconds: studioLimits.refreshTokenLifetimeSeconds,
  },
} as const;

export const studioOpenApiJson = `${JSON.stringify(studioOpenApiDocument, null, 2)}\n`;
