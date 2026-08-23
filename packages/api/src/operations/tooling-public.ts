// Orchestrates Tooling bearer authority, strict inputs, signed pagination, and tenant-scoped reads.

import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "../contracts/api-response";
import { ForbiddenFailure, UnauthorizedFailure, ValidationFailure } from "../contracts/errors";
import { RateLimitCost } from "../contracts/rate-limit";
import {
  ToolingCollectionRevisionScope,
  ToolingEnvironmentPage,
  ToolingEnvironmentScope,
  ToolingPageQuery,
  ToolingProjectPage,
  ToolingProjectScope,
  ToolingSchemaManifestPage,
  toolingLimits,
} from "../contracts/tooling";
import {
  ToolingCursorSigner,
  type ToolingCursorAuthority,
} from "../services/tooling-cursor-signer";
import {
  ToolingPrincipalAuthenticator,
  type ToolingPrincipal,
} from "../services/tooling-principal-authenticator";
import { RateLimitManager } from "../services/rate-limit-manager";
import { ToolingRepository } from "../services/tooling-repository";

const bearerPattern = /^Bearer ([^\s,]+)$/u;
const allowedQueryKeys = new Set(["limit", "cursor"]);

function validationFailure(path: string, code: string, message: string) {
  return ValidationFailure.make({
    details: [ApiErrorDetail.make({ path, code, message })],
  });
}

function decodeInput<A, I>(schema: Schema.Schema<A, I, never>, value: unknown, path: string) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError(() =>
      validationFailure(path, "tooling_input_invalid", "Use valid Tooling route and query values."),
    ),
  );
}

export function parseToolingPageQuery(rawQuery: string) {
  return Effect.gen(function* () {
    if (Buffer.byteLength(rawQuery, "utf8") > toolingLimits.queryBytes) {
      return yield* validationFailure(
        "query",
        "tooling_query_too_large",
        "The Tooling query string is too large.",
      );
    }
    const parameters = new URLSearchParams(rawQuery);
    for (const key of parameters.keys()) {
      if (!allowedQueryKeys.has(key) || parameters.getAll(key).length !== 1) {
        return yield* validationFailure(
          `query.${key}`,
          "tooling_query_invalid",
          "Use each supported Tooling query parameter at most once.",
        );
      }
    }
    const rawLimit = parameters.get("limit");
    if (rawLimit !== null && !/^[1-9][0-9]*$/u.test(rawLimit)) {
      return yield* validationFailure(
        "query.limit",
        "tooling_limit_invalid",
        "Use an integer Tooling page size within the documented bounds.",
      );
    }
    return yield* decodeInput(
      ToolingPageQuery,
      {
        limit: rawLimit === null ? toolingLimits.defaultPageSize : Number(rawLimit),
        cursor: parameters.get("cursor"),
      },
      "query",
    );
  });
}

export function validateToolingEmptyQuery(rawQuery: string) {
  if (rawQuery.length === 0) return Effect.succeed({});
  return Effect.fail(
    validationFailure(
      "query",
      "tooling_query_invalid",
      "This Tooling route does not accept query parameters.",
    ),
  );
}

export function decodeToolingProjectScope(projectId: string) {
  return decodeInput(ToolingProjectScope, { projectId }, "path");
}

export function decodeToolingEnvironmentScope(projectId: string, environmentKey: string) {
  return decodeInput(ToolingEnvironmentScope, { projectId, environmentKey }, "path");
}

export function decodeToolingCollectionRevisionScope(input: {
  readonly projectId: string;
  readonly environmentKey: string;
  readonly collectionKey: string;
  readonly revisionId: string;
}) {
  return decodeInput(ToolingCollectionRevisionScope, input, "path");
}

export const authenticateToolingRequest = Effect.fn("tooling.public.authenticate")(function* (
  authorization: string | null,
  source: string,
) {
  if (authorization === null) return yield* UnauthorizedFailure.make();
  const token = bearerPattern.exec(authorization)?.[1];
  if (token === undefined) return yield* UnauthorizedFailure.make();
  return yield* (yield* ToolingPrincipalAuthenticator).authenticate({ token, source });
});

export function toolingPrincipalKey(principal: ToolingPrincipal): string {
  return principal.kind === "oauth_user"
    ? `oauth:${principal.clientId}:${principal.userId}`
    : `credential:${principal.credential.credentialId}`;
}

export function toolingManifestCost(limit: number): number {
  return 1 + Math.ceil(limit / 10);
}

export function toolingRevisionCost(canonicalBytes: number): number {
  return 1 + Math.ceil(canonicalBytes / 262_144);
}

export const evaluateToolingGlobalRateLimit = Effect.fn("tooling.public.rate_limit.global")(
  function* (cost: number) {
    return yield* (yield* RateLimitManager).evaluate({
      policy: "tooling.global",
      identity: "installation",
      cost: RateLimitCost.make(cost),
    });
  },
);

export const evaluateToolingPrincipalRateLimit = Effect.fn("tooling.public.rate_limit.principal")(
  function* (principal: ToolingPrincipal, cost: number) {
    return yield* (yield* RateLimitManager).evaluate({
      policy: principal.kind === "oauth_user" ? "tooling.user" : "tooling.credential",
      identity: toolingPrincipalKey(principal),
      cost: RateLimitCost.make(cost),
    });
  },
);

function cursorAuthority(options: {
  readonly route: ToolingCursorAuthority["route"];
  readonly principal: ToolingPrincipal;
  readonly projectId: string | null;
  readonly environmentKey: string | null;
  readonly limit: number;
}): ToolingCursorAuthority {
  return {
    route: options.route,
    principalKey: toolingPrincipalKey(options.principal),
    projectId: options.projectId,
    environmentKey: options.environmentKey,
    limit: options.limit,
  };
}

function resolveAfterId(cursor: string | null, authority: ToolingCursorAuthority) {
  if (cursor === null) return Effect.succeed(null);
  return Effect.map(
    Effect.flatMap(ToolingCursorSigner, (signer) => signer.verify(cursor, authority)),
    (finalId) => finalId,
  );
}

function signNextCursor(finalId: string | null, authority: ToolingCursorAuthority) {
  if (finalId === null) return Effect.succeed(null);
  return Effect.flatMap(ToolingCursorSigner, (signer) => signer.sign(authority, finalId));
}

export const listToolingProjects = Effect.fn("tooling.public.projects.list")(function* (
  principal: ToolingPrincipal,
  query: ToolingPageQuery,
) {
  if (principal.kind !== "oauth_user") return yield* ForbiddenFailure.make();
  const authority = cursorAuthority({
    route: "projects",
    principal,
    projectId: null,
    environmentKey: null,
    limit: query.limit,
  });
  const afterId = yield* resolveAfterId(query.cursor, authority);
  const page = yield* (yield* ToolingRepository).listProjects(principal.userId, {
    afterId,
    limit: query.limit,
  });
  const nextCursor = yield* signNextCursor(page.nextAfterId, authority);
  return yield* Schema.decodeUnknown(ToolingProjectPage)({
    items: page.items,
    nextCursor,
  }).pipe(Effect.orDie);
});

export const listToolingEnvironments = Effect.fn("tooling.public.environments.list")(function* (
  principal: ToolingPrincipal,
  scope: ToolingProjectScope,
  query: ToolingPageQuery,
) {
  if (principal.kind !== "oauth_user") return yield* ForbiddenFailure.make();
  const authority = cursorAuthority({
    route: "environments",
    principal,
    projectId: scope.projectId,
    environmentKey: null,
    limit: query.limit,
  });
  const afterId = yield* resolveAfterId(query.cursor, authority);
  const page = yield* (yield* ToolingRepository).listEnvironments({
    userId: principal.userId,
    projectId: scope.projectId,
    afterId,
    limit: query.limit,
  });
  const nextCursor = yield* signNextCursor(page.nextAfterId, authority);
  return yield* Schema.decodeUnknown(ToolingEnvironmentPage)({
    projectId: page.projectId,
    items: page.items,
    nextCursor,
  }).pipe(Effect.orDie);
});

export const getToolingManifestPage = Effect.fn("tooling.public.manifest.get")(function* (
  principal: ToolingPrincipal,
  scope: ToolingEnvironmentScope,
  query: ToolingPageQuery,
  requestId: string,
) {
  const authority = cursorAuthority({
    route: "manifest",
    principal,
    projectId: scope.projectId,
    environmentKey: scope.environmentKey,
    limit: query.limit,
  });
  const afterId = yield* resolveAfterId(query.cursor, authority);
  const page = yield* (yield* ToolingRepository).getManifestPage({
    principal,
    requestId,
    projectId: scope.projectId,
    environmentKey: scope.environmentKey,
    afterId,
    limit: query.limit,
  });
  const nextCursor = yield* signNextCursor(page.nextAfterId ?? null, authority);
  return yield* Schema.decodeUnknown(ToolingSchemaManifestPage)({
    projectId: page.projectId,
    environmentId: page.environmentId,
    environmentKey: page.environmentKey,
    locales: page.locales,
    localeContractHash: page.localeContractHash,
    collections: page.collections,
    nextCursor,
  }).pipe(Effect.orDie);
});

export const getToolingCollectionRevision = Effect.fn("tooling.public.revision.get")(function* (
  principal: ToolingPrincipal,
  scope: ToolingCollectionRevisionScope,
) {
  return yield* (yield* ToolingRepository).getCollectionRevision({ principal, ...scope });
});
