import { fromNodeHeaders } from "better-auth/node";
import type { Effect } from "effect";
import type { Request } from "express";

import type { ApiData } from "./contracts/api-response";
import type { ApplicationError } from "./contracts/errors";
import { makeRequestContext, type RequestContext } from "./observability/request-context";
import { type ApplicationResult, type ApplicationServices, executeApplication } from "./runtime";

export interface ApplicationEffectTransform {
  <A extends ApiData>(
    effect: Effect.Effect<A, ApplicationError, ApplicationServices>,
  ): Effect.Effect<A, ApplicationError, ApplicationServices>;
}

interface CreateContextOptions {
  readonly req: Request;
  readonly transformEffect?: ApplicationEffectTransform;
}

export interface Context {
  readonly headers: Headers;
  readonly request: RequestContext;
  readonly execute: <A extends ApiData>(
    operation: string,
    effect: Effect.Effect<A, ApplicationError, ApplicationServices>,
    successMessage: string,
  ) => Promise<ApplicationResult<A>>;
}

export function createContext({ req, transformEffect }: CreateContextOptions): Context {
  const request = makeRequestContext({
    requestId: req.headers["x-request-id"],
    traceParent: req.headers.traceparent,
    method: req.method,
    path: req.path,
  });

  return {
    headers: fromNodeHeaders(req.headers),
    request,
    execute: (operation, effect, successMessage) =>
      executeApplication(
        operation,
        request,
        transformEffect === undefined ? effect : transformEffect(effect),
        successMessage,
      ),
  };
}
