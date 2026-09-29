import { request as requestHttp } from "node:http";

import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import {
  CmsEntry,
  CmsEntryDraft,
  CreateEntryWithDraftResult,
  SaveEntryDraftResult,
} from "@framerfordevs/api/contracts/entry/index";
import { EditorLayout } from "@framerfordevs/api/contracts/field/index";
import { LocaleTag, ProjectLocaleId } from "@framerfordevs/api/contracts/locale/index";
import { IsoDateTime, WorkspaceId } from "@framerfordevs/api/contracts/platform/index";
import {
  CollectionFieldDefinition,
  ContractHash,
  GeneratedFormDefinition,
  SchemaRevisionId,
} from "@framerfordevs/api/contracts/schema/index";
import { StudioBootstrap } from "@framerfordevs/api/contracts/studio/index";
import {
  StudioContentContext,
  StudioEntryPage,
} from "@framerfordevs/api/contracts/studio-content/index";
import {
  RateLimitDecision,
  rateLimitPolicies,
} from "@framerfordevs/api/contracts/rate-limit/index";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import { makeEntryRepository, EntryRepository } from "@framerfordevs/api/services/entry/repository";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager/index";
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
import {
  makeStudioContentRepository,
  StudioContentRepository,
} from "@framerfordevs/api/services/studio-content/repository/index";
import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { Effect, Schema } from "effect";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createApp } from "../../../src/app";

const ids = {
  workspace: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  collection: "019fae8b-1234-7000-8000-000000000004",
  entry: "019fae8b-1234-7000-8000-000000000005",
  revision: "019fae8b-1234-7000-8000-000000000006",
  field: "019fae8b-1234-7000-8000-000000000007",
  locale: "019fae8b-1234-7000-8000-000000000008",
  registration: "019fae8b-1234-7000-8000-000000000009",
  grant: "019fae8b-1234-7000-8000-000000000010",
  audit: "019fae8b-1234-7000-8000-000000000011",
  tab: "019fae8b-1234-7000-8000-000000000012",
  group: "019fae8b-1234-7000-8000-000000000013",
  placement: "019fae8b-1234-7000-8000-000000000014",
  command: "019fae8b-1234-7000-8000-000000000015",
  sharedRevision: "019fae8b-1234-7000-8000-000000000016",
  localizedRevision: "019fae8b-1234-7000-8000-000000000017",
} as const;
const token = "studio-content-success-token";
const userId = "studio-content-success-user";
const hash = "a".repeat(64);
const now = "2026-09-28T00:00:00.000Z";
const principal: StudioOAuthPrincipal = {
  kind: "studio_oauth_user",
  userId,
  clientId: `ffd-studio-v1-${ids.registration}`,
  registrationId: ids.registration,
  registrationVersion: 3,
  projectId: ids.project,
  environmentId: ids.environment,
  grantId: ids.grant,
  auditMarkerId: ids.audit,
  grantExpiresAtEpochSeconds: 1_900_000_000,
  scopes: ["studio:session", "offline_access"],
  expiresAtEpochSeconds: 1_900_000_000,
};
const bootstrap = Schema.decodeUnknownSync(StudioBootstrap)({
  formatVersion: 1,
  registration: {
    id: ids.registration,
    version: 3,
    applicationOrigin: "https://application.example.test",
    mountPath: "/studio",
  },
  project: { id: ids.project, name: "Studio Project", workspaceId: ids.workspace },
  environment: { id: ids.environment, key: "main", name: "main" },
  user: { id: userId, name: "Studio User", email: "studio@example.test" },
  role: "developer",
  effectiveActions: ["project.read", "project.update"],
  session: { expiresAt: "2027-01-15T08:00:00.000Z" },
});
const field = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: ids.field,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "private_source_key",
  displayLabel: "Title",
  kind: "short_text",
  required: false,
  localization: "localized",
  deprecated: false,
  position: 0,
  editor: {
    helpText: null,
    placeholder: null,
    visibleToRoles: ["developer"],
    editableByRoles: ["developer"],
  },
  configuration: { maxLength: 100 },
  children: [],
});
const layout = Schema.decodeUnknownSync(EditorLayout)({
  version: 1,
  tabs: [
    {
      id: ids.tab,
      title: "Content",
      description: null,
      position: 0,
      visibleToRoles: ["developer"],
      groups: [
        {
          id: ids.group,
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: ["developer"],
          fields: [
            {
              id: ids.placement,
              fieldId: ids.field,
              position: 0,
              helpTextOverride: null,
              visibleToRoles: ["developer"],
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [],
});
const form = Schema.decodeUnknownSync(GeneratedFormDefinition)({
  source: "published",
  collectionId: ids.collection,
  revisionId: ids.revision,
  formatVersion: 2,
  validationProfile: "field-system@1",
  currencyRegistryProfile: "iso-4217@2026-01-01",
  contractHash: ContractHash.make(hash),
  role: "developer",
  canEdit: true,
  fields: [field],
  editableFieldIds: [ids.field],
  editorLayout: layout,
  currencyMinorUnits: {},
});
const entry = Schema.decodeUnknownSync(CmsEntry)({
  id: ids.entry,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  collectionId: ids.collection,
  displayName: "Article",
  nameVersion: 1,
  createdByUserId: userId,
  createdByCredentialId: null,
  changedByUserId: userId,
  changedByCredentialId: null,
  createdAt: now,
  updatedAt: now,
});
const validation = { valid: true, issues: [], capped: false } as const;
const draft = Schema.decodeUnknownSync(CmsEntryDraft)({
  entry,
  localeId: ids.locale,
  locale: "en",
  schemaRevisionId: ids.revision,
  contractHash: hash,
  sharedVersion: 1,
  sharedRevisionId: ids.sharedRevision,
  sharedValues: {},
  localizedVersion: 1,
  localizedRevisionId: ids.localizedRevision,
  localizedValues: { [ids.field]: "Visible title" },
  canEditShared: true,
  validation,
});
const context = Schema.decodeUnknownSync(StudioContentContext)({
  locales: [{ id: ids.locale, tag: "en", displayName: "English", canRead: true, canWrite: true }],
  collections: [
    {
      id: ids.collection,
      displayName: "Articles",
      capabilities: {
        canCreate: true,
        canRename: true,
        canSaveLocalized: true,
        canSaveShared: true,
      },
    },
  ],
  configurationNotices: [],
});
const page = Schema.decodeUnknownSync(StudioEntryPage)({
  items: [
    {
      id: ids.entry,
      displayName: "Article",
      nameVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  ],
  hasMore: false,
  nextCursor: null,
  count: { value: 1, relation: "exact" },
});

const verifier = makeStudioOAuthTokenVerifier((value) =>
  Promise.resolve(value === token ? principal : null),
);
const studioRepository: ReturnType<typeof makeStudioRepository> = {
  authorizeOAuth: () => Effect.succeed({ allowed: true as const }),
  getBootstrap: () => Effect.succeed(bootstrap),
};
const contentRepository: ReturnType<typeof makeStudioContentRepository> = {
  authorizeCollection: () =>
    Effect.succeed({
      workspaceId: Schema.decodeUnknownSync(WorkspaceId)(ids.workspace),
      role: "developer" as const,
      localeId: Schema.decodeUnknownSync(ProjectLocaleId)(ids.locale),
      locale: Schema.decodeUnknownSync(LocaleTag)("en"),
      schemaRevisionId: Schema.decodeUnknownSync(SchemaRevisionId)(ids.revision),
      canCreate: true,
      canRename: true,
      canWriteLocalized: true,
      canWriteShared: true,
    }),
  getContext: () => Effect.succeed(context),
  listEntries: (_actor, input) =>
    Effect.succeed({
      page,
      finalBrowseOrder:
        input.search === null
          ? { createdAt: Schema.decodeUnknownSync(IsoDateTime)(now), entryId: ids.entry }
          : null,
      finalSearchOrder:
        input.search === null ? null : { foldedDisplayName: "article", entryId: ids.entry },
    }),
};
const schemaRepository = {
  ...makeSchemaRepository(),
  getPublishedForm: () => Effect.succeed(form),
};
const entryRepository = {
  ...makeEntryRepository(),
  getDraft: () => Effect.succeed(draft),
  createEntryWithDraft: () =>
    Effect.succeed(
      Schema.decodeUnknownSync(CreateEntryWithDraftResult)({
        entry,
        commandId: ids.command,
        sharedVersion: 1,
        sharedRevisionId: ids.sharedRevision,
        localizedVersion: 1,
        localizedRevisionId: ids.localizedRevision,
        validation,
      }),
    ),
  renameEntry: () => Effect.succeed(entry),
  saveDraft: () =>
    Effect.succeed(
      Schema.decodeUnknownSync(SaveEntryDraftResult)({
        entryId: ids.entry,
        commandId: ids.command,
        sharedChanged: false,
        sharedVersion: 1,
        sharedRevisionId: ids.sharedRevision,
        localizedChanged: true,
        localizedVersion: 2,
        localizedRevisionId: ids.localizedRevision,
        validation,
      }),
    ),
};
const rateLimitManager: RateLimitManagerService = {
  evaluate: (input) =>
    Effect.succeed(
      Schema.decodeUnknownSync(RateLimitDecision)({
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
  Effect.provideService(effect, StudioOAuthTokenVerifier, verifier).pipe(
    Effect.provideService(StudioRepository, studioRepository),
    Effect.provideService(StudioContentRepository, contentRepository),
    Effect.provideService(SchemaRepository, schemaRepository),
    Effect.provideService(EntryRepository, entryRepository),
    Effect.provideService(RateLimitManager, rateLimitManager),
  );
const api = request(createApp({ hostRoutingEnabled: false, studioEffectTransform: transform }));
const headers = { Authorization: `Bearer ${token}` };
const root = `/api/studio-content/v1/projects/${ids.project}/environments/${ids.environment}`;
const entries = `${root}/collections/${ids.collection}/locales/en/entries`;

function mutationBody() {
  return {
    schemaRevisionId: ids.revision,
    contractHash: hash,
    commandId: ids.command,
    expectedSharedVersion: 1,
    expectedLocalizedVersion: 1,
    sharedMutations: [],
    localizedMutations: [{ operation: "set", path: [ids.field], value: "Updated" }],
  };
}

function percentile95(values: ReadonlyArray<number>) {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

afterAll(async () => {
  await disposeApplicationRuntime();
});

describe("Studio Content HTTP success surface", () => {
  it("serves all finite success families with projected no-store responses", async () => {
    const responses = [
      await api.get(`${root}/context`).set(headers),
      await api.get(entries).set(headers),
      await api.post(`${entries}/search`).set(headers).send({ query: "Ar", limit: 25 }),
      await api.get(`${entries}/new`).set(headers),
      await api.get(`${entries}/${ids.entry}`).set(headers),
      await api
        .post(entries)
        .set(headers)
        .send({
          displayName: "Article",
          schemaRevisionId: ids.revision,
          contractHash: hash,
          commandId: ids.command,
          sharedMutations: [],
          localizedMutations: [{ operation: "set", path: [ids.field], value: "Created" }],
        }),
      await api.patch(`${entries}/${ids.entry}/name`).set(headers).send({
        displayName: "Article",
        expectedNameVersion: 1,
      }),
      await api.patch(`${entries}/${ids.entry}/draft`).set(headers).send(mutationBody()),
    ];

    for (const response of responses) {
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.error).toBeNull();
      expect(response.headers["cache-control"]).toContain("no-store");
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain("private_source_key");
      expect(serialized).not.toContain("visibleToRoles");
      expect(serialized).not.toContain("editableByRoles");
      expect(serialized).not.toContain(token);
    }
    expect(responses[0]?.body.data.collections[0].id).toBe(ids.collection);
    expect(responses[1]?.body.data.items[0].id).toBe(ids.entry);
    expect(responses[4]?.body.data.draft.localizedValues[ids.field]).toBe("Visible title");
    expect(responses[7]?.body.data.localizedVersion).toBe(2);
  });

  it("interrupts platform work when the caller aborts the request", async () => {
    let markStarted: (() => void) | undefined;
    let markInterrupted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const interrupted = new Promise<void>((resolve) => {
      markInterrupted = resolve;
    });
    const slowContentRepository = {
      ...contentRepository,
      getContext: () =>
        Effect.sync(() => markStarted?.()).pipe(
          Effect.zipRight(Effect.never),
          Effect.ensuring(Effect.sync(() => markInterrupted?.())),
        ),
    };
    const slowTransform: ApplicationEffectTransform = (effect) =>
      Effect.provideService(effect, StudioOAuthTokenVerifier, verifier).pipe(
        Effect.provideService(StudioRepository, studioRepository),
        Effect.provideService(StudioContentRepository, slowContentRepository),
        Effect.provideService(SchemaRepository, schemaRepository),
        Effect.provideService(EntryRepository, entryRepository),
        Effect.provideService(RateLimitManager, rateLimitManager),
      );
    const server = createApp({
      hostRoutingEnabled: false,
      studioEffectTransform: slowTransform,
    }).listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("Studio Content abort test server did not bind.");
      }
      const outbound = requestHttp({
        hostname: "127.0.0.1",
        port: address.port,
        path: `${root}/context`,
        method: "GET",
        headers,
      });
      const closed = new Promise<void>((resolve) => {
        outbound.once("error", () => resolve());
        outbound.once("close", () => resolve());
      });
      outbound.end();
      await started;
      outbound.destroy();
      await closed;
      await interrupted;
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });

  it("fails closed when the ten-second platform deadline expires", async () => {
    vi.useFakeTimers();
    try {
      let markStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const slowContentRepository = {
        ...contentRepository,
        getContext: () => Effect.sync(() => markStarted?.()).pipe(Effect.zipRight(Effect.never)),
      };
      const slowTransform: ApplicationEffectTransform = (effect) =>
        Effect.provideService(effect, StudioOAuthTokenVerifier, verifier).pipe(
          Effect.provideService(StudioRepository, studioRepository),
          Effect.provideService(StudioContentRepository, slowContentRepository),
          Effect.provideService(SchemaRepository, schemaRepository),
          Effect.provideService(EntryRepository, entryRepository),
          Effect.provideService(RateLimitManager, rateLimitManager),
        );
      const deadlineApi = request(
        createApp({ hostRoutingEnabled: false, studioEffectTransform: slowTransform }),
      );
      const pending = deadlineApi
        .get(`${root}/context`)
        .set(headers)
        .then((response) => response);
      await started;
      await vi.advanceTimersByTimeAsync(10_001);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(JSON.stringify(response.body)).not.toContain("deadline");
      expect(response.headers["cache-control"]).toContain("no-store");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps platform browse, search, and workspace adaptation within local p95 targets", async () => {
    const samples = {
      browse: [] as Array<number>,
      search: [] as Array<number>,
      workspace: [] as Array<number>,
    };

    for (let sample = 0; sample < 20; sample += 1) {
      let startedAt = performance.now();
      const browse = await api.get(entries).set(headers);
      samples.browse.push(performance.now() - startedAt);
      expect(browse.status).toBe(200);

      startedAt = performance.now();
      const search = await api
        .post(`${entries}/search`)
        .set(headers)
        .send({ query: "Ar", limit: 25 });
      samples.search.push(performance.now() - startedAt);
      expect(search.status).toBe(200);

      startedAt = performance.now();
      const workspace = await api.get(`${entries}/${ids.entry}`).set(headers);
      samples.workspace.push(performance.now() - startedAt);
      expect(workspace.status).toBe(200);
    }

    expect(percentile95(samples.browse)).toBeLessThan(500);
    expect(percentile95(samples.search)).toBeLessThan(500);
    expect(percentile95(samples.workspace)).toBeLessThan(1_000);
  });
});
