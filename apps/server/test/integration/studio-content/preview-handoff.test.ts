import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import { RateLimitDecision, rateLimitPolicies } from "@framerfordevs/api/contracts/rate-limit";
import { LocaleTag, ProjectLocaleId } from "@framerfordevs/api/contracts/locale";
import { EnvironmentId, ProjectId, WorkspaceId } from "@framerfordevs/api/contracts/platform";
import { EntryId } from "@framerfordevs/api/contracts/entry";
import { PreviewTargetUrl } from "@framerfordevs/api/contracts/control-plane";
import {
  PreviewRevisionIncompatibleFailure,
  PreviewTargetRequiredFailure,
} from "@framerfordevs/api/contracts/response/errors";
import { CollectionId, SchemaRevisionId } from "@framerfordevs/api/contracts/schema";
import { StudioBootstrap } from "@framerfordevs/api/contracts/studio";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import {
  makePreviewHandoffRepository,
  PreviewHandoffRepository,
} from "@framerfordevs/api/services/preview-handoff/repository";
import { makePreviewHandoffSignerLive } from "@framerfordevs/api/services/preview-handoff/signer";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager";
import {
  makeStudioContentRepository,
  StudioContentRepository,
} from "@framerfordevs/api/services/studio-content/repository";
import {
  makeStudioOAuthTokenVerifier,
  StudioOAuthTokenVerifier,
} from "@framerfordevs/api/services/studio/principal-authenticator";
import {
  makeStudioRepository,
  StudioRepository,
} from "@framerfordevs/api/services/studio/repository";
import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { Effect, Schema } from "effect";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../../src/app";

const ids = {
  workspace: "019fae8b-3234-7000-8000-000000000001",
  project: "019fae8b-3234-7000-8000-000000000002",
  environment: "019fae8b-3234-7000-8000-000000000003",
  collection: "019fae8b-3234-7000-8000-000000000004",
  revision: "019fae8b-3234-7000-8000-000000000005",
  field: "019fae8b-3234-7000-8000-000000000006",
  tab: "019fae8b-3234-7000-8000-000000000007",
  group: "019fae8b-3234-7000-8000-000000000008",
  registration: "019fae8b-3234-7000-8000-000000000009",
  grant: "019fae8b-3234-7000-8000-000000000010",
  audit: "019fae8b-3234-7000-8000-000000000011",
  command: "019fae8b-3234-7000-8000-000000000012",
  entry: "019fae8b-3234-7000-8000-000000000013",
  locale: "019fae8b-3234-7000-8000-000000000014",
} as const;
const token = "studio-preview-handoff-token";
const userId = "studio-preview-handoff-user";
const principal: StudioOAuthPrincipal = {
  kind: "studio_oauth_user",
  userId,
  clientId: `ffd-studio-v1-${ids.registration}`,
  registrationId: ids.registration,
  registrationVersion: 1,
  projectId: ids.project,
  environmentId: ids.environment,
  grantId: ids.grant,
  auditMarkerId: ids.audit,
  grantExpiresAtEpochSeconds: 1_900_000_000,
  scopes: ["studio:session", "offline_access"],
  expiresAtEpochSeconds: 1_900_000_000,
};

function decode<A, I>(schema: Schema.Codec<A, I>, value: unknown): A {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
}

const previewUrl = "https://preview.example.test/api/ffd-preview";
const behavior: { failure: unknown; prepared: Array<unknown> } = { failure: null, prepared: [] };

const bootstrap = decode(StudioBootstrap, {
  formatVersion: 1,
  registration: {
    id: ids.registration,
    version: 1,
    applicationOrigin: "https://application.example.test",
    mountPath: "/studio",
  },
  project: { id: ids.project, name: "Studio Project", workspaceId: ids.workspace },
  environment: { id: ids.environment, key: "main", name: "main" },
  user: { id: userId, name: "Studio User", email: "studio@example.test" },
  role: "editor",
  effectiveActions: ["project.read"],
  session: { expiresAt: "2027-01-15T08:00:00.000Z" },
});
const rateLimitManager: RateLimitManagerService = {
  evaluate: (input) =>
    Effect.succeed(
      decode(RateLimitDecision, {
        allowed: true,
        policy: input.policy,
        cost: input.cost,
        limit: rateLimitPolicies[input.policy].limitPerInterval,
        remaining: rateLimitPolicies[input.policy].capacity,
        resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
        retryAfterSeconds: null,
        enforcementMode: "memory",
      }),
    ),
  reset: () => Effect.void,
  retainedFallbackEntryCount: Effect.succeed(0),
};
const transform: ApplicationEffectTransform = (effect) =>
  Effect.provideService(
    effect,
    StudioOAuthTokenVerifier,
    makeStudioOAuthTokenVerifier((value) => Promise.resolve(value === token ? principal : null)),
  ).pipe(
    Effect.provideService(StudioRepository, {
      ...makeStudioRepository(),
      authorizeOAuth: () => Effect.succeed({ allowed: true as const }),
      getBootstrap: () => Effect.succeed(bootstrap),
    }),
    Effect.provideService(StudioContentRepository, {
      ...makeStudioContentRepository(),
      authorizeCollection: () =>
        Effect.succeed({
          workspaceId: decode(WorkspaceId, ids.workspace),
          role: "editor" as const,
          localeId: decode(ProjectLocaleId, ids.locale),
          locale: decode(LocaleTag, "en"),
          schemaRevisionId: decode(SchemaRevisionId, ids.revision),
          canCreate: true,
          canRename: true,
          canWriteLocalized: true,
          canWriteShared: false,
          canPublish: false,
          canPublishPresentation: false,
        }),
    }),
    Effect.provideService(PreviewHandoffRepository, {
      ...makePreviewHandoffRepository(),
      prepare: (actorId, scope, request, issuer) => {
        behavior.prepared.push({ actorId, scope, request, issuer });
        if (behavior.failure instanceof PreviewTargetRequiredFailure) {
          return Effect.fail(behavior.failure);
        }
        if (behavior.failure instanceof PreviewRevisionIncompatibleFailure) {
          return Effect.fail(behavior.failure);
        }
        return Effect.succeed({
          claims: {
            issuer,
            userId: actorId,
            workspaceId: decode(WorkspaceId, ids.workspace),
            projectId: decode(ProjectId, scope.projectId),
            environmentId: decode(EnvironmentId, scope.environmentId),
            collectionId: decode(CollectionId, scope.collectionId),
            entryId: decode(EntryId, scope.entryId),
            locale: decode(LocaleTag, scope.locale),
            source: request.source,
            schemaRevisionId: null,
            sharedRevisionId: null,
            localizedRevisionId: null,
            targetVersion: 1,
          },
          previewUrl: decode(PreviewTargetUrl, previewUrl),
        });
      },
    }),
    Effect.provideService(RateLimitManager, rateLimitManager),
    Effect.provide(
      makePreviewHandoffSignerLive({
        activeSecret: "studio-handoff-route-secret-32-characters-long",
      }),
    ),
  );
const api = request(createApp({ hostRoutingEnabled: false, studioEffectTransform: transform }));
const headers = { Authorization: `Bearer ${token}` };
const path = `/api/studio-content/v1/projects/${ids.project}/environments/${ids.environment}/collections/${ids.collection}/locales/en/entries/${ids.entry}/preview-handoffs`;

beforeEach(() => {
  behavior.failure = null;
  behavior.prepared = [];
});

afterAll(async () => {
  await disposeApplicationRuntime();
});

describe("Studio Content Preview handoff route", () => {
  it("issues a signed handoff for the exact entry scope as the Studio user", async () => {
    const response = await api
      .post(path)
      .set(headers)
      .send({ source: "current", revisionId: null });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data.previewUrl).toBe(previewUrl);
    expect(response.body.data.token).toMatch(/^ffd_pvh_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(behavior.prepared).toEqual([
      {
        actorId: userId,
        scope: {
          projectId: ids.project,
          environmentId: ids.environment,
          collectionId: ids.collection,
          locale: "en",
          entryId: ids.entry,
        },
        request: { source: "current", revisionId: null },
        issuer: "studio",
      },
    ]);
  });

  it("rejects browser credentials, excess keys, and oversized bodies before issuing", async () => {
    expect(
      (
        await api
          .post(path)
          .set({ ...headers, Origin: "https://evil.example" })
          .send({})
      ).status,
    ).toBe(403);
    const extra = await api
      .post(path)
      .set(headers)
      .send({ source: "current", revisionId: null, ttl: 9 });
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe("VALIDATION_ERROR");
    const large = await api
      .post(path)
      .set({ ...headers, "Content-Type": "application/json" })
      .send(JSON.stringify({ source: "current", revisionId: null, padding: "x".repeat(5_000) }));
    expect(large.status).toBe(413);
    expect(behavior.prepared).toHaveLength(0);
  });

  it("maps a missing target and an incompatible pair to exact codes", async () => {
    for (const [failure, code] of [
      [new PreviewTargetRequiredFailure(), "PREVIEW_TARGET_REQUIRED"],
      [new PreviewRevisionIncompatibleFailure(), "PREVIEW_REVISION_INCOMPATIBLE"],
    ] as const) {
      behavior.failure = failure;
      const response = await api
        .post(path)
        .set(headers)
        .send({ source: "current", revisionId: null });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(code);
    }
  });
});
