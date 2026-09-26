// Orchestrates strict Studio bearer authentication, quota authority, and bootstrap reads.

import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { env } from "@framerfordevs/env/server";
import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "../../contracts/response/api";
import {
  SecurityServiceFailure,
  UnauthorizedFailure,
  ValidationFailure,
} from "../../contracts/response/errors";
import { RateLimitCost } from "../../contracts/rate-limit";
import { StudioBootstrapScope } from "../../contracts/studio";
import { RateLimitManager } from "../../services/rate-limit/manager";
import { authenticateStudioBearer } from "../../services/studio/principal-authenticator";
import { StudioRepository } from "../../services/studio/repository";

const bearerPattern = /^Bearer ([^\s,]+)$/u;

function invalidStudioInput(
  path: "path" | "query",
  code: "studio_path_invalid" | "studio_query_invalid",
  message: string,
) {
  return ValidationFailure.make({
    details: [ApiErrorDetail.make({ path, code, message })],
  });
}

export function validateStudioEmptyQuery(rawQuery: string) {
  return rawQuery.length === 0
    ? Effect.succeed({})
    : Effect.fail(
        invalidStudioInput(
          "query",
          "studio_query_invalid",
          "The Studio bootstrap route does not accept query parameters.",
        ),
      );
}

export function decodeStudioBootstrapScope(projectId: string, environmentId: string) {
  return Schema.decodeUnknown(StudioBootstrapScope)({ projectId, environmentId }).pipe(
    Effect.mapError(() =>
      invalidStudioInput(
        "path",
        "studio_path_invalid",
        "Use valid Studio project and environment identifiers.",
      ),
    ),
  );
}

export const authenticateStudioRequest = Effect.fn("studio.public.authenticate")(function* (
  authorization: string | null,
) {
  if (authorization === null) return yield* UnauthorizedFailure.make();
  const token = bearerPattern.exec(authorization)?.[1];
  if (token === undefined) return yield* UnauthorizedFailure.make();
  return yield* authenticateStudioBearer(token);
});

function requireSharedProductionRateLimit<A extends { readonly enforcementMode: string }>(
  decision: A,
) {
  return env.NODE_ENV === "production" && decision.enforcementMode !== "redis"
    ? Effect.fail(
        SecurityServiceFailure.make({
          operation: "studio.rate_limit.shared_required",
          cause: new Error("Shared Studio rate-limit storage is unavailable."),
        }),
      )
    : Effect.succeed(decision);
}

export const evaluateStudioOAuthGlobalRateLimit = Effect.fn("studio.oauth.rate_limit.global")(
  function* () {
    const decision = yield* (yield* RateLimitManager).evaluate({
      policy: "studio.oauth.global",
      identity: "installation",
      cost: RateLimitCost.make(1),
    });
    return yield* requireSharedProductionRateLimit(decision);
  },
);

export const evaluateStudioOAuthClientRateLimit = Effect.fn("studio.oauth.rate_limit.client")(
  function* (clientId: string) {
    const decision = yield* (yield* RateLimitManager).evaluate({
      policy: "studio.oauth.client",
      identity: clientId,
      cost: RateLimitCost.make(1),
    });
    return yield* requireSharedProductionRateLimit(decision);
  },
);

export const evaluateStudioOAuthUserRateLimit = Effect.fn("studio.oauth.rate_limit.user")(
  function* (clientId: string, userId: string) {
    const decision = yield* (yield* RateLimitManager).evaluate({
      policy: "studio.oauth.user",
      identity: `${clientId}:${userId}`,
      cost: RateLimitCost.make(1),
    });
    return yield* requireSharedProductionRateLimit(decision);
  },
);

export const evaluateStudioGlobalRateLimit = Effect.fn("studio.public.rate_limit.global")(
  function* (cost: number) {
    const decision = yield* (yield* RateLimitManager).evaluate({
      policy: "studio.global",
      identity: "installation",
      cost: RateLimitCost.make(cost),
    });
    return yield* requireSharedProductionRateLimit(decision);
  },
);

export const evaluateStudioUserRateLimit = Effect.fn("studio.public.rate_limit.user")(function* (
  principal: StudioOAuthPrincipal,
  cost: number,
) {
  const decision = yield* (yield* RateLimitManager).evaluate({
    policy: "studio.user",
    identity: `${principal.registrationId}:${principal.userId}`,
    cost: RateLimitCost.make(cost),
  });
  return yield* requireSharedProductionRateLimit(decision);
});

export const authorizeStudioOAuth = Effect.fn("studio.oauth.authorize")(function* (
  clientId: string,
  userId: string,
) {
  return yield* (yield* StudioRepository).authorizeOAuth(clientId, userId);
});

export const getStudioBootstrap = Effect.fn("studio.public.bootstrap.get")(function* (
  principal: StudioOAuthPrincipal,
  scope: StudioBootstrapScope,
) {
  return yield* (yield* StudioRepository).getBootstrap({
    principal,
    projectId: scope.projectId,
    environmentId: scope.environmentId,
  });
});
