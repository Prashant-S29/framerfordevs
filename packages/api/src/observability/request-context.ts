import { randomUUID } from "node:crypto";

import { Schema } from "effect";

import { RequestIdSchema } from "../contracts/api-response";

export const HttpMethodSchema = Schema.Literal(
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "OTHER",
);

export type HttpMethod = typeof HttpMethodSchema.Type;

export const RouteFamilySchema = Schema.Literal(
  "health",
  "readiness",
  "auth",
  "rpc",
  "openapi",
  "other",
);

export type RouteFamily = typeof RouteFamilySchema.Type;

export class TraceParent extends Schema.Class<TraceParent>("TraceParent")({
  traceId: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{32}$/)),
  spanId: Schema.String.pipe(Schema.pattern(/^[0-9a-f]{16}$/)),
  traceFlags: Schema.Literal(0, 1),
}) {}

export class RequestContext extends Schema.Class<RequestContext>("RequestContext")({
  requestId: RequestIdSchema,
  method: HttpMethodSchema,
  routeFamily: RouteFamilySchema,
  traceParent: Schema.NullOr(TraceParent),
}) {}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const traceParentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-(0[01])$/;

function firstHeader(value: string | ReadonlyArray<string> | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

export function normalizeRequestId(value: string | ReadonlyArray<string> | undefined): string {
  const candidate = firstHeader(value)?.trim();
  return candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();
}

export function parseTraceParent(
  value: string | ReadonlyArray<string> | undefined,
): TraceParent | null {
  const candidate = firstHeader(value)?.trim().toLowerCase();
  if (!candidate) return null;

  const match = traceParentPattern.exec(candidate);
  if (!match) return null;

  const traceId = match[1];
  const spanId = match[2];
  const encodedFlags = match[3];
  if (!traceId || !spanId || !encodedFlags) return null;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;

  return TraceParent.make({
    traceId,
    spanId,
    traceFlags: encodedFlags === "01" ? 1 : 0,
  });
}

export function normalizeHttpMethod(method: string): HttpMethod {
  switch (method.toUpperCase()) {
    case "GET":
      return "GET";
    case "POST":
      return "POST";
    case "PUT":
      return "PUT";
    case "PATCH":
      return "PATCH";
    case "DELETE":
      return "DELETE";
    case "OPTIONS":
      return "OPTIONS";
    case "HEAD":
      return "HEAD";
    default:
      return "OTHER";
  }
}

export function classifyRoute(path: string): RouteFamily {
  if (path === "/") return "health";
  if (path === "/ready") return "readiness";
  if (path.startsWith("/api/auth")) return "auth";
  if (path.startsWith("/rpc")) return "rpc";
  if (path.startsWith("/api-reference")) return "openapi";
  return "other";
}

export function makeRequestContext(options: {
  readonly requestId: string | ReadonlyArray<string> | undefined;
  readonly traceParent: string | ReadonlyArray<string> | undefined;
  readonly method: string;
  readonly path: string;
}): RequestContext {
  return RequestContext.make({
    requestId: normalizeRequestId(options.requestId),
    traceParent: parseTraceParent(options.traceParent),
    method: normalizeHttpMethod(options.method),
    routeFamily: classifyRoute(options.path),
  });
}
