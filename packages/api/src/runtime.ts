import * as OtelTracer from "@effect/opentelemetry/Tracer";
import { Cause, Chunk, Clock, Effect, Exit, Layer, ManagedRuntime, Option } from "effect";

import { type ApiData, type ApiResponse, apiSuccess } from "./contracts/api-response";
import {
  type ApplicationError,
  apiErrorHttpStatus,
  applicationFailure,
  internalFailure,
} from "./contracts/errors";
import { ApplicationLogger, ApplicationLoggerLive, sanitizeCause } from "./observability/logger";
import { OpenTelemetryLive } from "./observability/opentelemetry";
import type { RequestContext } from "./observability/request-context";
import { Telemetry, TelemetryLive, toStatusFamily } from "./observability/telemetry";
import { AccessRepository, AccessRepositoryLive } from "./services/access-repository";
import { AuthSessionLive, AuthSessionService } from "./services/auth-session";
import {
  CredentialAttemptLimiter,
  CredentialAttemptLimiterLive,
} from "./services/credential-attempt-limiter";
import {
  CredentialAuthenticator,
  CredentialAuthenticatorLive,
} from "./services/credential-authenticator";
import { CredentialRepository, CredentialRepositoryLive } from "./services/credential-repository";
import { Database, DatabaseLive } from "./services/database";
import { LocaleRepository, LocaleRepositoryLive } from "./services/locale-repository";
import { PlatformRepository, PlatformRepositoryLive } from "./services/platform-repository";
import { PolicyService, PolicyServiceLive } from "./services/policy";
import { SchemaEngine, SchemaEngineLive } from "./services/schema-engine";
import { SchemaRepository, SchemaRepositoryLive } from "./services/schema-repository";
import { SecretGenerator, SecretGeneratorLive } from "./services/secret-generator";

export type ApplicationServices =
  | ApplicationLogger
  | Telemetry
  | AuthSessionService
  | Database
  | PlatformRepository
  | LocaleRepository
  | AccessRepository
  | PolicyService
  | SecretGenerator
  | CredentialAttemptLimiter
  | CredentialRepository
  | CredentialAuthenticator
  | SchemaEngine
  | SchemaRepository;

const InfrastructureLive = Layer.mergeAll(
  ApplicationLoggerLive,
  TelemetryLive,
  AuthSessionLive,
  DatabaseLive,
  PlatformRepositoryLive,
  LocaleRepositoryLive,
  AccessRepositoryLive,
  PolicyServiceLive,
  SecretGeneratorLive,
  CredentialAttemptLimiterLive,
  CredentialRepositoryLive,
  CredentialAuthenticatorLive,
  SchemaEngineLive,
  SchemaRepositoryLive,
);

export const ApplicationLive = Layer.mergeAll(InfrastructureLive, OpenTelemetryLive);

export const applicationRuntime = ManagedRuntime.make(ApplicationLive);

export type CauseClassification<E> =
  | { readonly kind: "failure"; readonly error: E }
  | { readonly kind: "defect"; readonly defects: ReadonlyArray<unknown> }
  | { readonly kind: "interrupted" };

export function classifyCause<E>(cause: Cause.Cause<E>): CauseClassification<E> {
  const defects = Cause.defects(cause);
  if (Chunk.isNonEmpty(defects)) {
    return { kind: "defect", defects: Array.from(defects) };
  }
  if (Cause.isInterruptedOnly(cause)) {
    return { kind: "interrupted" };
  }

  const failure = Option.getOrUndefined(Cause.failureOption(cause));
  if (failure !== undefined) {
    return { kind: "failure", error: failure };
  }

  return { kind: "interrupted" };
}

export function withRequestSpan<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  request: RequestContext,
  operation: string,
) {
  const traced = effect.pipe(
    Effect.withSpan(operation, {
      attributes: {
        "app.request_id": request.requestId,
        "http.request.method": request.method,
        "http.route.family": request.routeFamily,
      },
    }),
  );

  if (!request.traceParent) return traced;

  return Effect.withParentSpan(
    traced,
    OtelTracer.makeExternalSpan({
      traceId: request.traceParent.traceId,
      spanId: request.traceParent.spanId,
      traceFlags: request.traceParent.traceFlags,
    }),
  );
}

function observeOperation<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  request: RequestContext,
  operation: string,
) {
  const observed = Effect.gen(function* () {
    const startedAt = yield* Clock.currentTimeMillis;
    const logger = yield* ApplicationLogger;
    const telemetry = yield* Telemetry;

    return yield* effect.pipe(
      Effect.onExit((exit) =>
        Effect.gen(function* () {
          const finishedAt = yield* Clock.currentTimeMillis;
          const durationMs = Math.max(0, finishedAt - startedAt);
          const currentSpan = yield* Effect.option(Effect.currentSpan);
          const baseFields = {
            requestId: request.requestId,
            traceId: Option.match(currentSpan, {
              onNone: () => request.traceParent?.traceId,
              onSome: (span) => span.traceId,
            }),
            operation,
            durationMs,
            routeFamily: request.routeFamily,
          };

          if (Exit.isSuccess(exit)) {
            yield* logger.info("application.operation.completed", {
              ...baseFields,
              outcome: "success",
            });
            return;
          }

          const classification = classifyCause(exit.cause);
          if (classification.kind === "failure") {
            const errorTag =
              typeof classification.error === "object" &&
              classification.error !== null &&
              "_tag" in classification.error &&
              typeof classification.error._tag === "string"
                ? classification.error._tag
                : "UnknownFailure";
            yield* logger.info("application.operation.completed", {
              ...baseFields,
              outcome: "failure",
              errorTag,
            });
            return;
          }

          if (classification.kind === "interrupted") {
            yield* logger.info("application.operation.completed", {
              ...baseFields,
              outcome: "interrupted",
            });
            return;
          }

          yield* telemetry.recordDefect(request.routeFamily);
          yield* logger.error("application.operation.defect", {
            ...baseFields,
            outcome: "defect",
            defects: sanitizeCause(classification.defects),
          });
        }),
      ),
    );
  });

  return withRequestSpan(observed, request, operation);
}

export interface ApplicationResult<A extends ApiData> {
  readonly status: number;
  readonly response: ApiResponse<A>;
}

export interface ApplicationRuntime<R> {
  readonly runPromiseExit: <A, E>(effect: Effect.Effect<A, E, R>) => Promise<Exit.Exit<A, E>>;
}

export async function executeWithRuntime<A extends ApiData, R>(
  runtime: ApplicationRuntime<R | ApplicationLogger | Telemetry>,
  operation: string,
  request: RequestContext,
  effect: Effect.Effect<A, ApplicationError, R>,
  successMessage: string,
): Promise<ApplicationResult<A>> {
  const exit = await runtime.runPromiseExit(observeOperation(effect, request, operation));

  if (Exit.isSuccess(exit)) {
    return {
      status: 200,
      response: apiSuccess(exit.value, successMessage),
    };
  }

  const classification = classifyCause(exit.cause);
  if (classification.kind === "failure") {
    const response = applicationFailure(classification.error, request.requestId);
    return {
      status: apiErrorHttpStatus[response.error.code],
      response,
    };
  }

  const response = internalFailure(request.requestId);
  return {
    status: apiErrorHttpStatus.INTERNAL_ERROR,
    response,
  };
}

export function executeApplication<A extends ApiData>(
  operation: string,
  request: RequestContext,
  effect: Effect.Effect<A, ApplicationError, ApplicationServices>,
  successMessage: string,
): Promise<ApplicationResult<A>> {
  return executeWithRuntime<A, ApplicationServices>(
    applicationRuntime,
    operation,
    request,
    effect,
    successMessage,
  );
}

export const recordHttpRequest = Effect.fn("recordHttpRequest")(function* (
  request: RequestContext,
  status: number,
  durationMs: number,
) {
  const telemetry = yield* Telemetry;
  const logger = yield* ApplicationLogger;
  const statusFamily = toStatusFamily(status);

  yield* telemetry.recordHttpRequest({
    method: request.method,
    routeFamily: request.routeFamily,
    statusFamily,
    durationMs,
  });
  yield* logger.info("http.request.completed", {
    requestId: request.requestId,
    traceId: request.traceParent?.traceId,
    operation: "http.request",
    outcome: status < 500 ? "completed" : "failed",
    durationMs,
    method: request.method,
    routeFamily: request.routeFamily,
    statusFamily,
  });
});

export function observeHttpRequest(
  request: RequestContext,
  status: number,
  durationMs: number,
): Promise<void> {
  return applicationRuntime.runPromise(recordHttpRequest(request, status, durationMs));
}

const reportBoundaryDefectEffect = Effect.fn("reportBoundaryDefect")(function* (
  request: RequestContext,
  cause: unknown,
) {
  const telemetry = yield* Telemetry;
  const logger = yield* ApplicationLogger;
  yield* telemetry.recordDefect(request.routeFamily);
  yield* logger.error("application.boundary.defect", {
    requestId: request.requestId,
    traceId: request.traceParent?.traceId,
    operation: "http.boundary",
    outcome: "defect",
    cause: sanitizeCause(cause),
  });
});

export function reportBoundaryDefect(request: RequestContext, cause: unknown): Promise<void> {
  return applicationRuntime.runPromise(reportBoundaryDefectEffect(request, cause));
}

export function disposeApplicationRuntime(): Promise<void> {
  return applicationRuntime.dispose();
}
