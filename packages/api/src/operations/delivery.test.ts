// Verifies M9 management/public orchestration through replaceable repositories, credentials, and central quotas.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Layer, Schema } from "effect";

import { TelemetryLive } from "../observability/telemetry";
import { CredentialPrincipal } from "../contracts/access";
import {
  DeliveryAccessPrincipal,
  DeliveryCollectionConfiguration,
  DeliveryItem,
  DeliveryPage,
  GetDeliveryConfigurationInput,
  UpdateDeliveryConfigurationInput,
} from "../contracts/delivery";
import { RateLimitDecision } from "../contracts/rate-limit";
import {
  CredentialAttemptLimiter,
  makeCredentialAttemptLimiter,
} from "../services/credential-attempt-limiter";
import { CredentialAuthenticator } from "../services/credential-authenticator";
import { CredentialRepositoryLive } from "../services/credential-repository";
import { makeDeliveryCursorSignerLive } from "../services/delivery-cursor-signer";
import {
  DeliveryReadRepository,
  type DeliveryReadRepositoryService,
  type ResolvedDeliveryScope,
} from "../services/delivery-read-repository";
import {
  DeliveryRepository,
  type DeliveryRepositoryService,
} from "../services/delivery-repository";
import { PolicyServiceLive } from "../services/policy";
import { RateLimitManager, type RateLimitManagerService } from "../services/rate-limit-manager";
import { SecretGeneratorLive } from "../services/secret-generator";
import {
  authenticateDeliveryRequest,
  evaluateDeliveryGlobalRateLimit,
  evaluateDeliveryIdentityRateLimit,
  getCurrentDeliveryEntry,
  getImmutableDeliveryEntry,
  getUniqueDeliveryEntry,
  listDeliveryEntries,
  makeDeliveryRouteScope,
} from "./delivery-public";
import { getDeliveryConfiguration, updateDeliveryConfiguration } from "./delivery";

const ids = {
  workspace: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  collection: "019fae8b-1234-7000-8000-000000000004",
  locale: "019fae8b-1234-7000-8000-000000000005",
  entry: "019fae8b-1234-7000-8000-000000000006",
  publication: "019fae8b-1234-7000-8000-000000000007",
  schema: "019fae8b-1234-7000-8000-000000000008",
  credential: "019fae8b-1234-7000-8000-000000000009",
};
const timestamp = "2026-08-09T12:00:00.000Z";
const scopeInput = {
  projectId: ids.project,
  environmentKey: "main",
  collectionKey: "articles",
  locale: "en",
};
const resolvedScope: ResolvedDeliveryScope = {
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  collectionId: ids.collection,
  collectionKey: "articles",
  localeId: ids.locale,
  locale: "en",
  access: "public",
  configVersion: 1,
  schemaRevisionId: ids.schema,
  generation: 1,
  configUpdatedAt: new Date(timestamp),
  generationChangedAt: new Date(timestamp),
  schemaUpdatedAt: new Date(timestamp),
};
const item = Schema.decodeUnknownSync(DeliveryItem)({
  id: ids.entry,
  collectionId: ids.collection,
  collection: "articles",
  locale: "en",
  publication: {
    id: ids.publication,
    sequence: 1,
    schemaRevisionId: ids.schema,
    publishedAt: timestamp,
  },
  data: { title: "Published" },
});
const page = Schema.decodeUnknownSync(DeliveryPage)({
  items: [item],
  page: { limit: 20, nextCursor: null, hasMore: false },
});
const configuration = Schema.decodeUnknownSync(DeliveryCollectionConfiguration)({
  projectId: ids.project,
  environmentId: ids.environment,
  collectionId: ids.collection,
  collectionKey: "articles",
  access: "protected",
  version: 1,
  fields: [],
  updatedByUserId: "delivery-owner",
  updatedAt: timestamp,
});
const anonymous = Schema.decodeUnknownSync(DeliveryAccessPrincipal)({
  kind: "anonymous",
  credentialId: null,
});
const credential = Schema.decodeUnknownSync(DeliveryAccessPrincipal)({
  kind: "credential",
  credentialId: ids.credential,
});

function makeLayers(calls: Array<string>) {
  const management: DeliveryRepositoryService = {
    getConfiguration: () => Effect.sync(() => (calls.push("config.get"), configuration)),
    updateConfiguration: () => Effect.sync(() => (calls.push("config.update"), configuration)),
  };
  const reads: DeliveryReadRepositoryService = {
    resolve: () => Effect.succeed(resolvedScope),
    getCurrentById: () => Effect.sync(() => (calls.push("current"), item)),
    getByUnique: () => Effect.sync(() => (calls.push("unique"), item)),
    getImmutable: () => Effect.sync(() => (calls.push("immutable"), item)),
    list: () => Effect.sync(() => (calls.push("list"), page)),
  };
  const rateDecision = Schema.decodeUnknownSync(RateLimitDecision)({
    allowed: true,
    policy: "delivery.global",
    cost: 1,
    limit: 30_000,
    remaining: 29_999,
    resetAtEpochMs: 1_000,
    retryAfterSeconds: null,
    enforcementMode: "memory",
  });
  const rates: RateLimitManagerService = {
    evaluate: (input) =>
      Effect.sync(() => {
        calls.push(input.policy);
        return RateLimitDecision.make({ ...rateDecision, policy: input.policy });
      }),
    reset: () => Effect.void,
    retainedFallbackEntryCount: Effect.succeed(0),
  };
  const principal = Schema.decodeUnknownSync(CredentialPrincipal)({
    credentialId: ids.credential,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    family: "delivery",
    scopes: ["delivery.read"],
  });
  const authenticator = {
    verify: () => Effect.succeed(principal),
    authenticate: () => Effect.succeed(principal),
  };
  return Layer.mergeAll(
    Layer.succeed(DeliveryRepository, management),
    Layer.succeed(DeliveryReadRepository, reads),
    Layer.succeed(RateLimitManager, rates),
    Layer.succeed(CredentialAttemptLimiter, makeCredentialAttemptLimiter(rates)),
    Layer.succeed(CredentialAuthenticator, authenticator),
    CredentialRepositoryLive,
    SecretGeneratorLive,
    PolicyServiceLive,
    TelemetryLive,
    makeDeliveryCursorSignerLive({ activeSecret: "a".repeat(32) }),
  );
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
  return typeof failure === "object" && failure !== null && "_tag" in failure
    ? String(failure._tag)
    : undefined;
}

describe("Delivery operations", () => {
  it("strictly decodes route authority and mandatory locale", async () => {
    const decoded = await Effect.runPromise(
      makeDeliveryRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        localeValues: ["EN"],
      }),
    );
    const missing = await Effect.runPromiseExit(
      makeDeliveryRouteScope({
        projectId: ids.project,
        environmentKey: "main",
        collectionKey: "articles",
        localeValues: [],
      }),
    );

    assert.strictEqual(decoded.locale, "en");
    assert.strictEqual(failureTag(missing), "ValidationFailure");
  });

  it("forwards management reads and optimistic updates with decoded actors", async () => {
    const calls: Array<string> = [];
    const layer = makeLayers(calls);
    const input = Schema.decodeUnknownSync(GetDeliveryConfigurationInput)({
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
    });
    const update = Schema.decodeUnknownSync(UpdateDeliveryConfigurationInput)({
      ...input,
      expectedVersion: 1,
      access: "protected",
      publicAccessAcknowledged: false,
      fields: [],
    });

    await Effect.runPromise(
      getDeliveryConfiguration("delivery-owner", input).pipe(Effect.provide(layer)),
    );
    await Effect.runPromise(
      updateDeliveryConfiguration("delivery-owner", update, "delivery.request-1").pipe(
        Effect.provide(layer),
      ),
    );
    assert.deepStrictEqual(calls, ["config.get", "config.update"]);
  });

  it("uses the anonymous fast path only for public collections", async () => {
    const layer = makeLayers([]);
    const publicPrincipal = await Effect.runPromise(
      authenticateDeliveryRequest(resolvedScope, null, "4:7f000001").pipe(Effect.provide(layer)),
    );
    const denied = await Effect.runPromiseExit(
      authenticateDeliveryRequest(
        { ...resolvedScope, access: "protected" },
        null,
        "4:7f000001",
      ).pipe(Effect.provide(layer)),
    );

    assert.strictEqual(publicPrincipal.kind, "anonymous");
    assert.strictEqual(failureTag(denied), "UnauthorizedFailure");
  });

  it("accepts an explicit matching Delivery credential and never treats malformed input as anonymous", async () => {
    const layer = makeLayers([]);
    const accepted = await Effect.runPromise(
      authenticateDeliveryRequest(resolvedScope, "Bearer ffd_del_demo", "4:7f000001").pipe(
        Effect.provide(layer),
      ),
    );
    const malformed = await Effect.runPromiseExit(
      authenticateDeliveryRequest(resolvedScope, "Basic demo", "4:7f000001").pipe(
        Effect.provide(layer),
      ),
    );

    assert.strictEqual(accepted.kind, "credential");
    assert.strictEqual(failureTag(malformed), "CredentialInvalidFailure");
  });

  it("applies global and identity policies and forwards every read shape", async () => {
    const calls: Array<string> = [];
    const layer = makeLayers(calls);

    await Effect.runPromise(evaluateDeliveryGlobalRateLimit(1).pipe(Effect.provide(layer)));
    await Effect.runPromise(
      evaluateDeliveryIdentityRateLimit(anonymous, "4:7f000001", 1).pipe(Effect.provide(layer)),
    );
    await Effect.runPromise(
      evaluateDeliveryIdentityRateLimit(credential, "4:7f000001", 1).pipe(Effect.provide(layer)),
    );
    await Effect.runPromise(
      listDeliveryEntries(scopeInput, "locale=en", anonymous).pipe(Effect.provide(layer)),
    );
    await Effect.runPromise(
      getCurrentDeliveryEntry(scopeInput, ids.entry, "locale=en", anonymous).pipe(
        Effect.provide(layer),
      ),
    );
    await Effect.runPromise(
      getUniqueDeliveryEntry(scopeInput, "title", "locale=en&value=Published", anonymous).pipe(
        Effect.provide(layer),
      ),
    );
    await Effect.runPromise(
      getImmutableDeliveryEntry(
        scopeInput,
        ids.entry,
        ids.publication,
        "locale=en",
        anonymous,
      ).pipe(Effect.provide(layer)),
    );

    assert.deepStrictEqual(calls, [
      "delivery.global",
      "delivery.anonymous",
      "delivery.credential",
      "list",
      "current",
      "unique",
      "immutable",
    ]);
  });
});
