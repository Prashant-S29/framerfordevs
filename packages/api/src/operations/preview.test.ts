// Verifies strict Preview route decoding, bearer-only authentication, closed quotas, and operation dispatch.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Layer, Schema } from "effect";

import { CredentialPrincipal } from "../contracts/access";
import {
  GetCurrentUserPreviewInput,
  GetRevisionUserPreviewInput,
  PreviewItem,
} from "../contracts/preview";
import { RateLimitDecision } from "../contracts/rate-limit";
import { TelemetryLive } from "../observability/telemetry";
import {
  CredentialAttemptLimiter,
  makeCredentialAttemptLimiter,
} from "../services/credential-attempt-limiter";
import { CredentialAuthenticator } from "../services/credential-authenticator";
import { CredentialRepositoryLive } from "../services/credential-repository";
import { PolicyServiceLive } from "../services/policy";
import { PreviewRepository, makePreviewRepository } from "../services/preview-repository";
import { RateLimitManager, type RateLimitManagerService } from "../services/rate-limit-manager";
import { SecretGeneratorLive } from "../services/secret-generator";
import {
  authenticatePreviewRequest,
  evaluatePreviewCredentialRateLimit,
  evaluatePreviewGlobalRateLimit,
  getCredentialCurrentPreview,
  getCredentialRevisionPreview,
  makeCurrentPreviewRouteScope,
  makeRevisionPreviewRouteScope,
} from "./preview-public";
import {
  evaluatePreviewUserRateLimit,
  getUserCurrentPreview,
  getUserRevisionPreview,
} from "./preview";

const ids = {
  workspace: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  collection: "019fae8b-1234-7000-8000-000000000004",
  entry: "019fae8b-1234-7000-8000-000000000005",
  schema: "019fae8b-1234-7000-8000-000000000006",
  shared: "019fae8b-1234-7000-8000-000000000007",
  localized: "019fae8b-1234-7000-8000-000000000008",
  credential: "019fae8b-1234-7000-8000-000000000009",
};

const principal = Schema.decodeUnknownSync(CredentialPrincipal)({
  credentialId: ids.credential,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  family: "preview",
  scopes: ["preview.read"],
});

const item = Schema.decodeUnknownSync(PreviewItem)({
  id: ids.entry,
  collectionId: ids.collection,
  collection: "articles",
  locale: "gu",
  preview: {
    version: 1,
    source: "current",
    schemaRevisionId: ids.schema,
    contractHash: "a".repeat(64),
    sharedRevisionId: ids.shared,
    sharedVersion: 1,
    localizedRevisionId: ids.localized,
    localizedVersion: 2,
  },
  data: { title: "પૂર્વાવલોકન" },
  validation: { valid: true, issues: [], capped: false },
});

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit) || exit.cause._tag !== "Fail") return undefined;
  const failure = exit.cause.error;
  return typeof failure === "object" && failure !== null && "_tag" in failure
    ? String(failure._tag)
    : undefined;
}

function makeLayers(
  calls: Array<string>,
  deniedPolicy: "preview.global" | "preview.user" | null = null,
) {
  const repository: ReturnType<typeof makePreviewRepository> = {
    getCredentialCurrent: () => Effect.sync(() => (calls.push("credential.current"), item)),
    getCredentialRevision: () => Effect.sync(() => (calls.push("credential.revision"), item)),
    getUserCurrent: () => Effect.sync(() => (calls.push("user.current"), item)),
    getUserRevision: () => Effect.sync(() => (calls.push("user.revision"), item)),
  };
  const authenticator = {
    verify: () => Effect.sync(() => (calls.push("authenticate"), principal)),
    authenticate: () => Effect.succeed(principal),
  };
  const rates: RateLimitManagerService = {
    evaluate: (input) =>
      Effect.sync(() => {
        calls.push(`${input.policy}:${input.identity}`);
        return Schema.decodeUnknownSync(RateLimitDecision)({
          allowed: input.policy !== deniedPolicy,
          policy: input.policy,
          cost: 1,
          limit: input.policy === "preview.global" ? 12_000 : 300,
          remaining: 299,
          resetAtEpochMs: 1_000,
          retryAfterSeconds: null,
          enforcementMode: "memory",
        });
      }),
    reset: () => Effect.void,
    retainedFallbackEntryCount: Effect.succeed(0),
  };
  return Layer.mergeAll(
    Layer.succeed(PreviewRepository, repository),
    Layer.succeed(CredentialAuthenticator, authenticator),
    Layer.succeed(RateLimitManager, rates),
    Layer.succeed(CredentialAttemptLimiter, makeCredentialAttemptLimiter(rates)),
    CredentialRepositoryLive,
    SecretGeneratorLive,
    PolicyServiceLive,
    TelemetryLive,
  );
}

describe("Preview operations", () => {
  it("decodes current and explicit historical route authority without fallback", async () => {
    const current = await Effect.runPromise(
      makeCurrentPreviewRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        rawQuery: "locale=GU",
      }),
    );
    const revision = await Effect.runPromise(
      makeRevisionPreviewRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        schemaRevisionId: ids.schema,
        rawQuery: `locale=gu&sharedRevision=none&localizedRevision=${ids.localized}`,
      }),
    );
    const invalidCurrentQuery = await Effect.runPromiseExit(
      makeCurrentPreviewRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        rawQuery: "",
      }),
    );
    const invalidQuery = await Effect.runPromiseExit(
      makeRevisionPreviewRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        schemaRevisionId: ids.schema,
        rawQuery: "locale=gu&sharedRevision=none",
      }),
    );
    const invalidRevisionPath = await Effect.runPromiseExit(
      makeRevisionPreviewRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        schemaRevisionId: "invalid",
        rawQuery: "locale=gu&sharedRevision=none&localizedRevision=none",
      }),
    );
    const invalidPath = await Effect.runPromiseExit(
      makeCurrentPreviewRouteScope({
        projectId: "invalid",
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        rawQuery: "locale=gu",
      }),
    );

    assert.strictEqual(current.locale, "gu");
    assert.isNull(revision.sharedRevisionId);
    assert.strictEqual(revision.localizedRevisionId, ids.localized);
    assert.strictEqual(failureTag(invalidCurrentQuery), "PreviewQueryInvalidFailure");
    assert.strictEqual(failureTag(invalidQuery), "PreviewQueryInvalidFailure");
    assert.strictEqual(failureTag(invalidRevisionPath), "ValidationFailure");
    assert.strictEqual(failureTag(invalidPath), "ValidationFailure");
  });

  it("requires one Preview bearer and delegates base verification only for valid header shape", async () => {
    const calls: Array<string> = [];
    const layer = makeLayers(calls);
    const missing = await Effect.runPromiseExit(
      authenticatePreviewRequest(null, "4:7f000001").pipe(Effect.provide(layer)),
    );
    const malformed = await Effect.runPromiseExit(
      authenticatePreviewRequest("Basic secret", "4:7f000001").pipe(Effect.provide(layer)),
    );
    const accepted = await Effect.runPromise(
      authenticatePreviewRequest("Bearer ffd_prev_example", "4:7f000001").pipe(
        Effect.provide(layer),
      ),
    );

    assert.strictEqual(failureTag(missing), "UnauthorizedFailure");
    assert.strictEqual(failureTag(malformed), "CredentialInvalidFailure");
    assert.strictEqual(accepted.credentialId, ids.credential);
    assert.deepStrictEqual(calls, ["authenticate"]);
  });

  it("uses only the closed global, credential, and dashboard-user identities", async () => {
    const calls: Array<string> = [];
    const layer = makeLayers(calls);

    await Effect.runPromise(evaluatePreviewGlobalRateLimit().pipe(Effect.provide(layer)));
    await Effect.runPromise(
      evaluatePreviewCredentialRateLimit(ids.credential).pipe(Effect.provide(layer)),
    );
    await Effect.runPromise(
      evaluatePreviewUserRateLimit("preview-user").pipe(Effect.provide(layer)),
    );

    assert.deepStrictEqual(calls, [
      "preview.global:installation",
      `preview.credential:${ids.credential}`,
      "preview.user:preview-user",
    ]);
  });

  it("stops dashboard reads at the global or user quota before repository access", async () => {
    const currentUser = Schema.decodeUnknownSync(GetCurrentUserPreviewInput)({
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      locale: "gu",
    });
    const globalCalls: Array<string> = [];
    const globalDenied = await Effect.runPromiseExit(
      getUserCurrentPreview("preview-user", currentUser, "preview.request-rate-global").pipe(
        Effect.provide(makeLayers(globalCalls, "preview.global")),
      ),
    );
    const userCalls: Array<string> = [];
    const userDenied = await Effect.runPromiseExit(
      getUserCurrentPreview("preview-user", currentUser, "preview.request-rate-user").pipe(
        Effect.provide(makeLayers(userCalls, "preview.user")),
      ),
    );

    assert.strictEqual(failureTag(globalDenied), "RateLimitedFailure");
    assert.strictEqual(failureTag(userDenied), "RateLimitedFailure");
    assert.deepStrictEqual(globalCalls, ["preview.global:installation"]);
    assert.deepStrictEqual(userCalls, ["preview.global:installation", "preview.user:preview-user"]);
  });

  it("dispatches all four named reads with server-owned actor and time authority", async () => {
    const calls: Array<string> = [];
    const layer = makeLayers(calls);
    const currentRoute = await Effect.runPromise(
      makeCurrentPreviewRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        rawQuery: "locale=gu",
      }),
    );
    const revisionRoute = await Effect.runPromise(
      makeRevisionPreviewRouteScope({
        ...currentRoute,
        schemaRevisionId: ids.schema,
        rawQuery: `locale=gu&sharedRevision=${ids.shared}&localizedRevision=${ids.localized}`,
      }),
    );
    const currentUser = Schema.decodeUnknownSync(GetCurrentUserPreviewInput)({
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      locale: "gu",
    });
    const revisionUser = Schema.decodeUnknownSync(GetRevisionUserPreviewInput)({
      ...currentUser,
      schemaRevisionId: ids.schema,
      sharedRevisionId: ids.shared,
      localizedRevisionId: ids.localized,
    });

    await Effect.runPromise(
      getCredentialCurrentPreview(principal, currentRoute, "preview.request-1").pipe(
        Effect.provide(layer),
      ),
    );
    await Effect.runPromise(
      getCredentialRevisionPreview(principal, revisionRoute, "preview.request-2").pipe(
        Effect.provide(layer),
      ),
    );
    await Effect.runPromise(
      getUserCurrentPreview("preview-user", currentUser, "preview.request-3").pipe(
        Effect.provide(layer),
      ),
    );
    await Effect.runPromise(
      getUserRevisionPreview("preview-user", revisionUser, "preview.request-4").pipe(
        Effect.provide(layer),
      ),
    );

    assert.deepStrictEqual(calls, [
      "credential.current",
      "credential.revision",
      "preview.global:installation",
      "preview.user:preview-user",
      "user.current",
      "preview.global:installation",
      "preview.user:preview-user",
      "user.revision",
    ]);
  });
});
