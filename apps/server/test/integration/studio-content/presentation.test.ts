import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import { RateLimitDecision, rateLimitPolicies } from "@framerfordevs/api/contracts/rate-limit";
import {
  AuthoringCommandConflictFailure,
  AuthoringStaleSchemaFailure,
  NotFoundFailure,
  PresentationRoleVisibilityForbiddenFailure,
  PresentationScopeRestrictedFailure,
} from "@framerfordevs/api/contracts/response/errors";
import { CmsCollection } from "@framerfordevs/api/contracts/schema";
import { StudioBootstrap } from "@framerfordevs/api/contracts/studio";
import {
  StudioPresentation,
  StudioPublishPresentationResult,
  studioContentLimits,
  type StudioPublishPresentationRequest,
} from "@framerfordevs/api/contracts/studio-content";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import {
  AuthoringPresentationRepository,
  makeAuthoringPresentationRepository,
} from "@framerfordevs/api/services/authoring/presentation-repository";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager";
import {
  makeSchemaRepository,
  SchemaRepository,
} from "@framerfordevs/api/services/schema/repository";
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
} as const;
const token = "studio-presentation-token";
const userId = "studio-presentation-user";
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

const layout = {
  tabs: [
    {
      id: ids.tab,
      title: "Content",
      description: null,
      position: 0,
      groups: [
        {
          id: ids.group,
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          fields: [{ fieldId: ids.field, position: 0, helpTextOverride: null }],
        },
      ],
    },
  ],
  sidebarGroups: [],
};
const editField = {
  fieldId: ids.field,
  displayLabel: "Title",
  position: 0,
  helpText: null,
  placeholder: null,
  enumOptions: [],
};
const presentation = decode(StudioPresentation, {
  collectionId: ids.collection,
  revisionId: ids.revision,
  sequence: 3,
  presentation: {
    displayName: "Articles",
    description: null,
    fields: [{ ...editField, parentFieldId: null, kind: "short_text" }],
    layout,
  },
});
const publishBody = {
  commandId: ids.command,
  expectedRevisionId: ids.revision,
  expectedSequence: 3,
  presentation: { displayName: "Stories", description: null, fields: [editField], layout },
};

const behavior: {
  failure: unknown;
  collectionMissing: boolean;
  published: Array<{
    readonly collectionKey: string;
    readonly request: StudioPublishPresentationRequest;
  }>;
} = { failure: null, collectionMissing: false, published: [] };

function failWith<E>(failure: unknown, value: E) {
  return failure instanceof PresentationScopeRestrictedFailure ||
    failure instanceof PresentationRoleVisibilityForbiddenFailure ||
    failure instanceof AuthoringStaleSchemaFailure ||
    failure instanceof AuthoringCommandConflictFailure
    ? Effect.fail(failure)
    : Effect.succeed(value);
}

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
  role: "content_admin",
  effectiveActions: ["project.read"],
  session: { expiresAt: "2027-01-15T08:00:00.000Z" },
});
const collection = decode(CmsCollection, {
  id: ids.collection,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  apiKey: "articles",
  displayName: "Articles",
  description: null,
  version: 1,
  draftVersion: 1,
  draftBaseRevisionId: ids.revision,
  currentPublishedRevisionId: ids.revision,
  currentPublishedSequence: 3,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
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
    Effect.provideService(SchemaRepository, {
      ...makeSchemaRepository(),
      getCollection: () =>
        behavior.collectionMissing
          ? Effect.fail(NotFoundFailure.make({ resource: "collection" }))
          : Effect.succeed(collection),
    }),
    Effect.provideService(AuthoringPresentationRepository, {
      ...makeAuthoringPresentationRepository(),
      getStudio: () =>
        behavior.failure instanceof PresentationScopeRestrictedFailure
          ? Effect.fail(behavior.failure)
          : Effect.succeed(presentation),
      publishStudio: (_actor, _scope, collectionKey, input) => {
        behavior.published.push({ collectionKey, request: input });
        return failWith(
          behavior.failure,
          StudioPublishPresentationResult.make({ replayed: false, noOp: false, presentation }),
        );
      },
    }),
    Effect.provideService(RateLimitManager, rateLimitManager),
  );
const api = request(createApp({ hostRoutingEnabled: false, studioEffectTransform: transform }));
const headers = { Authorization: `Bearer ${token}` };
const base = `/api/studio-content/v1/projects/${ids.project}/environments/${ids.environment}/collections/${ids.collection}/presentation`;

function expectFailure(response: request.Response, status: number, code: string): void {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  expect(response.body.ok).toBe(false);
  expect(response.body.error.code).toBe(code);
  expect(response.headers["cache-control"]).toContain("no-store");
}

beforeEach(() => {
  behavior.failure = null;
  behavior.collectionMissing = false;
  behavior.published = [];
});

afterAll(async () => {
  await disposeApplicationRuntime();
});

describe("Studio Content presentation routes", () => {
  it("reads and publishes the editorial form layout by collection key", async () => {
    const read = await api.get(base).set(headers);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    expect(read.body.data.revisionId).toBe(ids.revision);
    expect(JSON.stringify(read.body)).not.toContain("visibleToRoles");

    const published = await api.post(`${base}/publish`).set(headers).send(publishBody);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body.data).toMatchObject({ replayed: false, noOp: false });
    expect(behavior.published).toHaveLength(1);
    expect(behavior.published[0]?.collectionKey).toBe("articles");
    expect(behavior.published[0]?.request.presentation.displayName).toBe("Stories");
  });

  it("rejects browser credentials, queries, excess keys, role lists, and oversized bodies", async () => {
    expectFailure(
      await api.get(base).set({ ...headers, Origin: "https://evil.example" }),
      403,
      "FORBIDDEN",
    );
    expectFailure(await api.get(`${base}?expand=roles`).set(headers), 400, "VALIDATION_ERROR");
    expectFailure(
      await api
        .post(`${base}/publish`)
        .set(headers)
        .send({ ...publishBody, force: true }),
      400,
      "VALIDATION_ERROR",
    );
    expectFailure(
      await api
        .post(`${base}/publish`)
        .set(headers)
        .send({
          ...publishBody,
          presentation: {
            ...publishBody.presentation,
            fields: [{ ...editField, visibleToRoles: ["owner"] }],
          },
        }),
      400,
      "VALIDATION_ERROR",
    );
    expectFailure(
      await api
        .post(`${base}/publish`)
        .set({ ...headers, "Content-Type": "application/json" })
        .send(
          JSON.stringify({
            ...publishBody,
            padding: "x".repeat(studioContentLimits.presentationRequestBytes),
          }),
        ),
      413,
      "REQUEST_TOO_LARGE",
    );
    expectFailure(
      await api.get(base.replace(ids.collection, "not-a-uuid")).set(headers),
      400,
      "VALIDATION_ERROR",
    );
    expect(behavior.published).toHaveLength(0);
  });

  it("maps editorial, stale, replay, and missing collection failures to exact codes", async () => {
    for (const [failure, status, code] of [
      [new PresentationScopeRestrictedFailure(), 403, "PRESENTATION_SCOPE_RESTRICTED"],
      [
        new PresentationRoleVisibilityForbiddenFailure(),
        403,
        "PRESENTATION_ROLE_VISIBILITY_FORBIDDEN",
      ],
      [new AuthoringStaleSchemaFailure(), 409, "STALE_SCHEMA"],
      [new AuthoringCommandConflictFailure(), 409, "COMMAND_CONFLICT"],
    ] as const) {
      behavior.failure = failure;
      expectFailure(await api.post(`${base}/publish`).set(headers).send(publishBody), status, code);
    }
    behavior.failure = new PresentationScopeRestrictedFailure();
    expectFailure(await api.get(base).set(headers), 403, "PRESENTATION_SCOPE_RESTRICTED");
    behavior.failure = null;
    behavior.collectionMissing = true;
    expectFailure(await api.get(base).set(headers), 404, "NOT_FOUND");
  });
});
