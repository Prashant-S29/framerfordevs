// Composes Express transport middleware, protocol routes, CORS boundaries, and the shared Effect runtime.

import { createHash } from "node:crypto";

import { createContext, type Context } from "@framerfordevs/api/context";
import { EffectSchemaToJsonSchemaConverter } from "@framerfordevs/api/contracts/effect-schema-converter";
import {
  apiFailure,
  type ApiData,
  type ApiResponse,
} from "@framerfordevs/api/contracts/api-response";
import type { DeliveryAccessPrincipal } from "@framerfordevs/api/contracts/delivery";
import { deliveryOpenApiDocument } from "@framerfordevs/api/contracts/delivery-openapi";
import { previewOpenApiDocument } from "@framerfordevs/api/contracts/preview-openapi";
import type { RateLimitDecision } from "@framerfordevs/api/contracts/rate-limit";
import { selectCanonicalNetworkSource } from "@framerfordevs/api/lib/network-source";
import {
  authenticatePreviewRequest,
  evaluatePreviewCredentialRateLimit,
  evaluatePreviewGlobalRateLimit,
  getCredentialCurrentPreview,
  getCredentialRevisionPreview,
  makeCurrentPreviewRouteScope,
  makeRevisionPreviewRouteScope,
} from "@framerfordevs/api/operations/preview-public";
import {
  authenticateDeliveryRequest,
  evaluateDeliveryGlobalRateLimit,
  evaluateDeliveryIdentityRateLimit,
  getCurrentDeliveryEntry,
  getImmutableDeliveryEntry,
  getUniqueDeliveryEntry,
  listDeliveryEntries,
  makeDeliveryRouteScope,
  resolveDeliveryScope,
} from "@framerfordevs/api/operations/delivery-public";
import type {
  DeliveryRouteScopeInput,
  ResolvedDeliveryScope,
} from "@framerfordevs/api/services/delivery-read-repository";
import { readinessCheck, healthCheck } from "@framerfordevs/api/operations/system";
import { makeRequestContext } from "@framerfordevs/api/observability/request-context";
import type { PreviewQueryRejectionCategory } from "@framerfordevs/api/observability/telemetry";
import {
  observeHttpRequest,
  observePreviewQueryRejection,
  reportBoundaryDefect,
} from "@framerfordevs/api/runtime";
import { appRouter } from "@framerfordevs/api/routers/index";
import { auth } from "@framerfordevs/auth";
import { env } from "@framerfordevs/env/server";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { RPCHandler } from "@orpc/server/node";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { apiReference } from "@scalar/express-api-reference";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from "express";

const rpcHandler = new RPCHandler(appRouter);

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new EffectSchemaToJsonSchemaConverter(), new ZodToJsonSchemaConverter()],
    }),
  ],
});

function routeParameter(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function requestContext(req: Request) {
  return makeRequestContext({
    requestId: req.headers["x-request-id"],
    traceParent: req.headers.traceparent,
    method: req.method,
    path: req.path,
  });
}

const deliveryAllowedHeaders = new Set([
  "authorization",
  "if-none-match",
  "if-modified-since",
  "traceparent",
  "x-request-id",
]);
const deliveryExposedHeaders = [
  "ETag",
  "Last-Modified",
  "Cache-Control",
  "X-Request-Id",
  "RateLimit-Limit",
  "RateLimit-Remaining",
  "RateLimit-Reset",
  "Retry-After",
].join(", ");
const maximumDeliveryResponseBytes = 4 * 1_024 * 1_024;

/** Applies wildcard, non-credentialed CORS exclusively to the Delivery protocol boundary. */
function setDeliveryCorsHeaders(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, If-None-Match, If-Modified-Since, Traceparent, X-Request-Id",
  );
  res.setHeader("Access-Control-Expose-Headers", deliveryExposedHeaders);
  res.setHeader("X-Content-Type-Options", "nosniff");
}

/** Sends the existing application envelope while preserving HEAD's bodyless protocol semantics. */
function sendApplicationResponse(
  req: Request,
  res: Response,
  status: number,
  response: ApiResponse<ApiData>,
): void {
  if (!response.ok) res.setHeader("Cache-Control", "no-store");
  if (req.method === "HEAD") {
    res.status(status).end();
    return;
  }
  res.status(status).json(response);
}

/** Unwraps an internal shared-runtime step or forwards its centralized failure once. */
function stepData<A extends ApiData>(
  req: Request,
  res: Response,
  result: { readonly status: number; readonly response: ApiResponse<A> },
): A | null {
  if (!result.response.ok) {
    sendApplicationResponse(req, res, result.status, result.response);
    return null;
  }
  return result.response.data;
}

/** Writes standard bounded quota metadata from the policy that governs this response. */
function setRateLimitHeaders(res: Response, decision: RateLimitDecision): void {
  res.setHeader("RateLimit-Limit", String(decision.limit));
  res.setHeader("RateLimit-Remaining", String(decision.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(decision.resetAtEpochMs / 1_000)));
  if (decision.retryAfterSeconds !== null) {
    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
  }
}

/** Uses a bounded pre-query estimate; expansion occurrence costs are charged by later resolution. */
function deliveryRequestCost(req: Request, kind: "list" | "item"): number {
  if (kind === "item") return 1;
  const parameters = new URLSearchParams(req.originalUrl.split("?", 2)[1] ?? "");
  const parsedLimit = Number(parameters.get("limit") ?? "20");
  const limit =
    Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 50 ? parsedLimit : 20;
  const expansion = parameters.get("expand");
  const depth =
    expansion === null
      ? 0
      : Math.min(2, Math.max(0, ...expansion.split(",").map((path) => path.split(".").length)));
  return Math.min(100, 1 + Math.ceil(limit / 10) + depth * 2);
}

/** Implements If-None-Match weak comparison for safe GET/HEAD revalidation. */
function etagMatches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const target = etag.replace(/^W\//u, "");
  return header
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value.replace(/^W\//u, "") === target);
}

/** Returns the latest precise authority timestamp represented by this immutable response. */
function deliveryLastModified(scope: ResolvedDeliveryScope, data: ApiData): Date {
  const times = [scope.configUpdatedAt.getTime(), scope.schemaUpdatedAt.getTime()];
  if (scope.generationChangedAt !== null) times.push(scope.generationChangedAt.getTime());
  const visited = new Set<object>();
  const inspectItem = (value: unknown) => {
    if (typeof value !== "object" || value === null || visited.has(value)) return;
    visited.add(value);
    const publication = Reflect.get(value, "publication");
    if (typeof publication === "object" && publication !== null) {
      const publishedAt = Reflect.get(publication, "publishedAt");
      if (typeof publishedAt === "string") {
        const parsed = Date.parse(publishedAt);
        if (Number.isFinite(parsed)) times.push(parsed);
      }
    }
    if (Array.isArray(value)) {
      value.forEach(inspectItem);
      return;
    }
    Object.values(value).forEach(inspectItem);
  };
  if (typeof data === "object" && data !== null && "items" in data) {
    const items = Reflect.get(data, "items");
    if (Array.isArray(items)) items.forEach(inspectItem);
  } else {
    inspectItem(data);
  }
  return new Date(Math.max(...times));
}

/** Serializes once, derives exact validators, handles conditional requests, and enforces 4 MiB. */
function sendDeliveryRepresentation(options: {
  readonly req: Request;
  readonly res: Response;
  readonly scope: ResolvedDeliveryScope;
  readonly response: ApiResponse<ApiData>;
  readonly immutable: boolean;
}): void {
  const { req, res, scope, response } = options;
  if (!response.ok) {
    sendApplicationResponse(req, res, 500, response);
    return;
  }
  const body = Buffer.from(JSON.stringify(response), "utf8");
  if (body.byteLength > maximumDeliveryResponseBytes) {
    sendApplicationResponse(
      req,
      res,
      413,
      apiFailure({
        code: "DELIVERY_RESPONSE_TOO_LARGE",
        message: "Reduce the page size or requested expansion.",
        requestId: requestContext(req).requestId,
        retryable: false,
      }),
    );
    return;
  }
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  const lastModified = deliveryLastModified(scope, response.data);
  res.setHeader("ETag", etag);
  res.setHeader("Last-Modified", lastModified.toUTCString());
  res.setHeader(
    "Cache-Control",
    scope.access === "public"
      ? options.immutable
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, s-maxage=60, stale-while-revalidate=300"
      : "private, no-cache",
  );
  const ifNoneMatch = req.headers["if-none-match"];
  const ifModifiedSince = req.headers["if-modified-since"];
  const modifiedSince = ifModifiedSince === undefined ? Number.NaN : Date.parse(ifModifiedSince);
  const notModified =
    etagMatches(ifNoneMatch, etag) ||
    (ifNoneMatch === undefined &&
      Number.isFinite(modifiedSince) &&
      lastModified.getTime() <= modifiedSince);
  if (notModified) {
    res.status(304).end();
    return;
  }
  res.status(200).setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", String(body.byteLength));
    res.end();
    return;
  }
  res.setHeader("Content-Length", String(body.byteLength));
  res.end(body);
}

/** Builds one validated scope/auth/quota context shared by every public Delivery read. */
async function prepareDeliveryRequest(
  req: Request,
  res: Response,
  context: Context,
  kind: "list" | "item",
  deliveryApiEnabled: boolean,
): Promise<
  | {
      readonly scopeInput: DeliveryRouteScopeInput;
      readonly scope: ResolvedDeliveryScope;
      readonly principal: DeliveryAccessPrincipal;
    }
  | undefined
> {
  if (!deliveryApiEnabled) {
    sendApplicationResponse(
      req,
      res,
      503,
      apiFailure({
        code: "SERVICE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
        requestId: context.request.requestId,
        retryable: true,
      }),
    );
    return undefined;
  }
  const rawQuery = req.originalUrl.split("?", 2)[1] ?? "";
  if (Buffer.byteLength(rawQuery, "utf8") > 8_192) {
    sendApplicationResponse(
      req,
      res,
      400,
      apiFailure({
        code: "DELIVERY_QUERY_INVALID",
        message: "The Delivery query is invalid.",
        requestId: context.request.requestId,
        retryable: false,
      }),
    );
    return undefined;
  }
  const cost = deliveryRequestCost(req, kind);
  const globalResult = await context.execute(
    "api.delivery.rate_limit.global",
    evaluateDeliveryGlobalRateLimit(cost),
    "Delivery installation quota evaluated.",
  );
  const global = stepData(req, res, globalResult);
  if (global === null) return undefined;
  setRateLimitHeaders(res, global);
  if (!global.allowed) {
    sendApplicationResponse(
      req,
      res,
      429,
      apiFailure({
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
        requestId: context.request.requestId,
        retryable: true,
      }),
    );
    return undefined;
  }
  const query = new URLSearchParams(rawQuery);
  const scopeInputResult = await context.execute(
    "api.delivery.scope.decode",
    makeDeliveryRouteScope({
      projectId: routeParameter(req, "projectId"),
      environmentKey: routeParameter(req, "environmentKey"),
      collectionKey: routeParameter(req, "collectionKey"),
      localeValues: query.getAll("locale"),
    }),
    "Delivery scope decoded.",
  );
  const scopeInput = stepData(req, res, scopeInputResult);
  if (scopeInput === null) return undefined;
  const scopeResult = await context.execute(
    "api.delivery.scope.resolve",
    resolveDeliveryScope(scopeInput),
    "Delivery scope resolved.",
  );
  const scope = stepData(req, res, scopeResult);
  if (scope === null) return undefined;
  const source = selectCanonicalNetworkSource(req.ip, req.socket.remoteAddress);
  const authorization = req.headers.authorization ?? null;
  const principalResult = await context.execute(
    "api.delivery.authenticate",
    authenticateDeliveryRequest(scope, authorization, source),
    "Delivery access resolved.",
  );
  const principal = stepData(req, res, principalResult);
  if (principal === null) return undefined;
  const identityResult = await context.execute(
    "api.delivery.rate_limit.identity",
    evaluateDeliveryIdentityRateLimit(principal, source, cost),
    "Delivery identity quota evaluated.",
  );
  const identity = stepData(req, res, identityResult);
  if (identity === null) return undefined;
  setRateLimitHeaders(res, identity);
  if (!identity.allowed) {
    sendApplicationResponse(
      req,
      res,
      429,
      apiFailure({
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
        requestId: context.request.requestId,
        retryable: true,
      }),
    );
    return undefined;
  }
  return { scopeInput, scope, principal };
}

/** Creates the isolated wildcard-CORS Delivery protocol router before management CORS. */
function createDeliveryRouter(deliveryApiEnabled: boolean): Router {
  const router = express.Router();
  router.use((req, res, next) => {
    setDeliveryCorsHeaders(res);
    if (req.method !== "OPTIONS") {
      next();
      return;
    }
    const requestedMethod = req.headers["access-control-request-method"]?.toUpperCase();
    const requestedHeaders = (req.headers["access-control-request-headers"] ?? "")
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
    if (
      (requestedMethod !== undefined && requestedMethod !== "GET" && requestedMethod !== "HEAD") ||
      requestedHeaders.some((header) => !deliveryAllowedHeaders.has(header))
    ) {
      sendApplicationResponse(
        req,
        res,
        403,
        apiFailure({
          code: "FORBIDDEN",
          message: "The requested Delivery preflight is not allowed.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    res.status(204).end();
  });

  const collectionPath =
    "/projects/:projectId/environments/:environmentKey/collections/:collectionKey";
  router.get("/openapi.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(deliveryOpenApiDocument);
  });
  router.get(
    "/docs",
    (_req, res, next) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      next();
    },
    apiReference({
      pageTitle: "Framer for Devs Delivery API",
      url: "/api/delivery/v1/openapi.json",
    }),
  );

  router.get(`${collectionPath}/entries`, async (req, res) => {
    const context = createContext({ req });
    const prepared = await prepareDeliveryRequest(req, res, context, "list", deliveryApiEnabled);
    if (prepared === undefined) return;
    const rawQuery = req.originalUrl.split("?", 2)[1] ?? "";
    const result = await context.execute(
      "api.delivery.entries.list",
      listDeliveryEntries(prepared.scopeInput, rawQuery, prepared.principal),
      "Delivery entries loaded.",
    );
    if (!result.response.ok) {
      sendApplicationResponse(req, res, result.status, result.response);
      return;
    }
    sendDeliveryRepresentation({
      req,
      res,
      scope: prepared.scope,
      response: result.response,
      immutable: false,
    });
  });
  router.head(`${collectionPath}/entries`, async (req, res) => {
    const context = createContext({ req });
    const prepared = await prepareDeliveryRequest(req, res, context, "list", deliveryApiEnabled);
    if (prepared === undefined) return;
    const result = await context.execute(
      "api.delivery.entries.list",
      listDeliveryEntries(
        prepared.scopeInput,
        req.originalUrl.split("?", 2)[1] ?? "",
        prepared.principal,
      ),
      "Delivery entries loaded.",
    );
    if (!result.response.ok) {
      sendApplicationResponse(req, res, result.status, result.response);
      return;
    }
    sendDeliveryRepresentation({
      req,
      res,
      scope: prepared.scope,
      response: result.response,
      immutable: false,
    });
  });

  const uniqueHandler = async (req: Request, res: Response) => {
    const context = createContext({ req });
    const prepared = await prepareDeliveryRequest(req, res, context, "item", deliveryApiEnabled);
    if (prepared === undefined) return;
    const result = await context.execute(
      "api.delivery.entry.unique",
      getUniqueDeliveryEntry(
        prepared.scopeInput,
        routeParameter(req, "fieldKey"),
        req.originalUrl.split("?", 2)[1] ?? "",
        prepared.principal,
      ),
      "Delivery entry loaded by unique value.",
    );
    if (!result.response.ok) {
      sendApplicationResponse(req, res, result.status, result.response);
      return;
    }
    sendDeliveryRepresentation({
      req,
      res,
      scope: prepared.scope,
      response: result.response,
      immutable: false,
    });
  };
  router.get(`${collectionPath}/entries/by/:fieldKey`, uniqueHandler);
  router.head(`${collectionPath}/entries/by/:fieldKey`, uniqueHandler);

  const currentHandler = async (req: Request, res: Response) => {
    const context = createContext({ req });
    const prepared = await prepareDeliveryRequest(req, res, context, "item", deliveryApiEnabled);
    if (prepared === undefined) return;
    const result = await context.execute(
      "api.delivery.entry.current",
      getCurrentDeliveryEntry(
        prepared.scopeInput,
        routeParameter(req, "entryId"),
        req.originalUrl.split("?", 2)[1] ?? "",
        prepared.principal,
      ),
      "Delivery entry loaded.",
    );
    if (!result.response.ok) {
      sendApplicationResponse(req, res, result.status, result.response);
      return;
    }
    sendDeliveryRepresentation({
      req,
      res,
      scope: prepared.scope,
      response: result.response,
      immutable: false,
    });
  };
  router.get(`${collectionPath}/entries/:entryId`, currentHandler);
  router.head(`${collectionPath}/entries/:entryId`, currentHandler);

  const immutableHandler = async (req: Request, res: Response) => {
    const context = createContext({ req });
    const prepared = await prepareDeliveryRequest(req, res, context, "item", deliveryApiEnabled);
    if (prepared === undefined) return;
    const result = await context.execute(
      "api.delivery.entry.immutable",
      getImmutableDeliveryEntry(
        prepared.scopeInput,
        routeParameter(req, "entryId"),
        routeParameter(req, "publicationId"),
        req.originalUrl.split("?", 2)[1] ?? "",
        prepared.principal,
      ),
      "Immutable Delivery entry loaded.",
    );
    if (!result.response.ok) {
      sendApplicationResponse(req, res, result.status, result.response);
      return;
    }
    sendDeliveryRepresentation({
      req,
      res,
      scope: prepared.scope,
      response: result.response,
      immutable: true,
    });
  };
  router.get(`${collectionPath}/entries/:entryId/publications/:publicationId`, immutableHandler);
  router.head(`${collectionPath}/entries/:entryId/publications/:publicationId`, immutableHandler);

  router.use((req, res) => {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    sendApplicationResponse(
      req,
      res,
      req.method === "GET" || req.method === "HEAD" ? 404 : 405,
      apiFailure({
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: requestContext(req).requestId,
        retryable: false,
      }),
    );
  });
  return router;
}

const previewAllowedHeaders = new Set(["authorization", "traceparent", "x-request-id"]);
const previewExposedHeaders = [
  "Cache-Control",
  "X-Request-Id",
  "RateLimit-Limit",
  "RateLimit-Remaining",
  "RateLimit-Reset",
  "Retry-After",
].join(", ");

/** Applies the complete isolated Preview CORS and anti-leak header set. */
function setPreviewHeaders(res: Response): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Traceparent, X-Request-Id");
  res.setHeader("Access-Control-Expose-Headers", previewExposedHeaders);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

/** Sends a no-store Preview envelope without validators or a body for HEAD. */
function sendPreviewResponse(
  req: Request,
  res: Response,
  status: number,
  response: ApiResponse<ApiData>,
): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.removeHeader("ETag");
  res.removeHeader("Last-Modified");
  if (status === 401) res.setHeader("WWW-Authenticate", 'Bearer realm="preview"');
  const body = Buffer.from(JSON.stringify(response), "utf8");
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(body.byteLength));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}

/** Records only the closed parser category and never the raw rejected Preview query. */
function observePreviewScopeFailure(response: ApiResponse<ApiData>): void {
  if (response.ok || response.error.code !== "PREVIEW_QUERY_INVALID") return;
  const detail = response.error.details?.[0];
  const code = detail?.code;
  let category: PreviewQueryRejectionCategory;
  switch (code) {
    case "query_too_large":
    case "duplicate_parameter":
      category = code;
      break;
    case "query_parameter_unknown":
      category = ["token", "key", "credential", "authorization"].includes(detail?.path ?? "")
        ? "credential_in_query"
        : "unknown_parameter";
      break;
    case "locale_required":
    case "revision_selector_required":
      category = "missing_parameter";
      break;
    case "locale_invalid":
    case "revision_selector_invalid":
    default:
      category = "invalid_parameter";
  }
  void observePreviewQueryRejection(category).catch(() => undefined);
}

/** Unwraps one Preview runtime step while preserving no-store failures and bearer challenges. */
function previewStepData<A extends ApiData>(
  req: Request,
  res: Response,
  result: { readonly status: number; readonly response: ApiResponse<A> },
): A | null {
  if (!result.response.ok) {
    sendPreviewResponse(req, res, result.status, result.response);
    return null;
  }
  return result.response.data;
}

/** Executes authentication and closed Preview quotas before any persisted route scope lookup. */
async function preparePreviewRequest(
  req: Request,
  res: Response,
  context: Context,
  previewApiEnabled: boolean,
) {
  if (!previewApiEnabled) {
    sendPreviewResponse(
      req,
      res,
      503,
      apiFailure({
        code: "SERVICE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
        requestId: context.request.requestId,
        retryable: true,
      }),
    );
    return undefined;
  }
  const globalResult = await context.execute(
    "api.preview.rate_limit.global",
    evaluatePreviewGlobalRateLimit(),
    "Preview installation quota evaluated.",
  );
  const global = previewStepData(req, res, globalResult);
  if (global === null) return undefined;
  setRateLimitHeaders(res, global);
  if (!global.allowed) {
    sendPreviewResponse(
      req,
      res,
      429,
      apiFailure({
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
        requestId: context.request.requestId,
        retryable: true,
      }),
    );
    return undefined;
  }
  const principalResult = await context.execute(
    "api.preview.authenticate",
    authenticatePreviewRequest(
      req.headers.authorization ?? null,
      selectCanonicalNetworkSource(req.ip, req.socket.remoteAddress),
    ),
    "Preview credential authenticated.",
  );
  const principal = previewStepData(req, res, principalResult);
  if (principal === null) return undefined;
  const identityResult = await context.execute(
    "api.preview.rate_limit.credential",
    evaluatePreviewCredentialRateLimit(principal.credentialId),
    "Preview credential quota evaluated.",
  );
  const identity = previewStepData(req, res, identityResult);
  if (identity === null) return undefined;
  setRateLimitHeaders(res, identity);
  if (!identity.allowed) {
    sendPreviewResponse(
      req,
      res,
      429,
      apiFailure({
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
        requestId: context.request.requestId,
        retryable: true,
      }),
    );
    return undefined;
  }
  return principal;
}

/** Creates the isolated bearer-only Preview router before credentialed management CORS. */
function createPreviewRouter(previewApiEnabled: boolean): Router {
  const router = express.Router();
  router.use((req, res, next) => {
    setPreviewHeaders(res);
    if (req.method !== "OPTIONS") {
      next();
      return;
    }
    const requestedMethod = req.headers["access-control-request-method"]?.toUpperCase();
    const requestedHeaders = (req.headers["access-control-request-headers"] ?? "")
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
    if (
      (requestedMethod !== undefined && requestedMethod !== "GET" && requestedMethod !== "HEAD") ||
      requestedHeaders.some((header) => !previewAllowedHeaders.has(header))
    ) {
      sendPreviewResponse(
        req,
        res,
        403,
        apiFailure({
          code: "FORBIDDEN",
          message: "The requested Preview preflight is not allowed.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    res.status(204).end();
  });

  router.get("/openapi.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(previewOpenApiDocument);
  });
  router.get(
    "/docs",
    (_req, res, next) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      next();
    },
    apiReference({
      pageTitle: "Framer for Devs Preview API",
      url: "/api/preview/v1/openapi.json",
    }),
  );

  const entryPath =
    "/projects/:projectId/environments/:environmentKey/collections/:collectionKey/entries/:entryId";
  const currentHandler = async (req: Request, res: Response) => {
    const context = createContext({ req });
    const principal = await preparePreviewRequest(req, res, context, previewApiEnabled);
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.preview.scope.current.decode",
      makeCurrentPreviewRouteScope({
        projectId: routeParameter(req, "projectId"),
        environmentKey: routeParameter(req, "environmentKey"),
        collectionKey: routeParameter(req, "collectionKey"),
        entryId: routeParameter(req, "entryId"),
        rawQuery: req.originalUrl.split("?", 2)[1] ?? "",
      }),
      "Preview scope decoded.",
    );
    observePreviewScopeFailure(scopeResult.response);
    const scope = previewStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.preview.current",
      getCredentialCurrentPreview(principal, scope, context.request.requestId),
      "Preview entry loaded.",
    );
    sendPreviewResponse(req, res, result.status, result.response);
  };
  router.get(`${entryPath}/draft`, currentHandler);
  router.head(`${entryPath}/draft`, currentHandler);

  const revisionHandler = async (req: Request, res: Response) => {
    const context = createContext({ req });
    const principal = await preparePreviewRequest(req, res, context, previewApiEnabled);
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.preview.scope.revision.decode",
      makeRevisionPreviewRouteScope({
        projectId: routeParameter(req, "projectId"),
        environmentKey: routeParameter(req, "environmentKey"),
        collectionKey: routeParameter(req, "collectionKey"),
        entryId: routeParameter(req, "entryId"),
        schemaRevisionId: routeParameter(req, "schemaRevisionId"),
        rawQuery: req.originalUrl.split("?", 2)[1] ?? "",
      }),
      "Preview revision scope decoded.",
    );
    observePreviewScopeFailure(scopeResult.response);
    const scope = previewStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.preview.revision",
      getCredentialRevisionPreview(principal, scope, context.request.requestId),
      "Preview entry loaded.",
    );
    sendPreviewResponse(req, res, result.status, result.response);
  };
  router.get(`${entryPath}/revisions/:schemaRevisionId`, revisionHandler);
  router.head(`${entryPath}/revisions/:schemaRevisionId`, revisionHandler);

  router.use((req, res) => {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    sendPreviewResponse(
      req,
      res,
      req.method === "GET" || req.method === "HEAD" ? 404 : 405,
      apiFailure({
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: requestContext(req).requestId,
        retryable: false,
      }),
    );
  });
  router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const context = requestContext(req);
    void reportBoundaryDefect(context, error).catch(() => undefined);
    sendPreviewResponse(
      req,
      res,
      500,
      apiFailure({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: context.requestId,
        retryable: false,
      }),
    );
  });
  return router;
}

export interface CreateAppOptions {
  readonly deliveryApiEnabled?: boolean;
  readonly previewApiEnabled?: boolean;
  readonly managementApiReferenceEnabled?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const deliveryApiEnabled = options.deliveryApiEnabled ?? env.DELIVERY_API_ENABLED;
  const previewApiEnabled = options.previewApiEnabled ?? env.PREVIEW_API_ENABLED;
  const managementApiReferenceEnabled =
    options.managementApiReferenceEnabled ?? env.MANAGEMENT_API_REFERENCE_ENABLED;
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use((req, res, next) => {
    const context = requestContext(req);
    const startedAt = performance.now();

    req.headers["x-request-id"] = context.requestId;
    res.setHeader("x-request-id", context.requestId);
    res.once("finish", () => {
      const durationMs = Math.max(0, performance.now() - startedAt);
      void observeHttpRequest(context, res.statusCode, durationMs).catch(() => undefined);
    });

    next();
  });

  app.use("/api/delivery/v1", createDeliveryRouter(deliveryApiEnabled));
  app.use("/api/preview/v1", createPreviewRouter(previewApiEnabled));

  app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (origin && origin !== env.CORS_ORIGIN) {
      const failure = apiFailure({
        code: "FORBIDDEN",
        message: "The request origin is not allowed.",
        requestId: requestContext(req).requestId,
        retryable: false,
      });
      res.status(403).json(failure);
      return;
    }

    next();
  });

  app.use(
    cors({
      origin(origin, callback) {
        callback(null, origin === env.CORS_ORIGIN);
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Traceparent", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id"],
      credentials: true,
    }),
  );

  app.all("/api/auth{/*path}", toNodeHandler(auth));

  app.use(async (req, res, next) => {
    const context = createContext({ req });
    const rpcResult = await rpcHandler.handle(req, res, {
      prefix: "/rpc",
      context,
    });
    if (rpcResult.matched) return;

    if (managementApiReferenceEnabled) {
      const apiResult = await apiHandler.handle(req, res, {
        prefix: "/api-reference",
        context,
      });
      if (apiResult.matched) return;
    }

    next();
  });

  app.use(express.json());

  app.get("/", async (req, res) => {
    const context = createContext({ req });
    const result = await context.execute("http.health", healthCheck(), "Service is healthy.");
    res.status(result.status).json(result.response);
  });

  app.get("/ready", async (req, res) => {
    const context = createContext({ req });
    const result = await context.execute("http.readiness", readinessCheck(), "Service is ready.");
    res.status(result.status).json(result.response);
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const context = requestContext(req);
    void reportBoundaryDefect(context, error).catch(() => undefined);
    res.status(500).json(
      apiFailure({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: context.requestId,
        retryable: false,
      }),
    );
  });

  return app;
}
