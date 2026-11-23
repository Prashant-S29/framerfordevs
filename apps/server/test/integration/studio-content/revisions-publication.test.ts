import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import {
  CmsEntry,
  CmsEntryRevision,
  EntryRevisionComparison,
  EntryRevisionPage,
  EntryRevisionSummary,
  SaveEntryDraftResult,
} from "@framerfordevs/api/contracts/entry";
import { EditorLayout } from "@framerfordevs/api/contracts/field";
import { LocaleTag, ProjectLocaleId } from "@framerfordevs/api/contracts/locale";
import { WorkspaceId } from "@framerfordevs/api/contracts/platform";
import {
  EntryPublicationPage,
  EntryPublicationValidationIssue,
  EntryPublicationPlan,
  EntryPublicationStatus,
  EntryPublicationSummary,
  PublishEntryResult,
  UnpublishEntryResult,
} from "@framerfordevs/api/contracts/publication";
import { RateLimitDecision, rateLimitPolicies } from "@framerfordevs/api/contracts/rate-limit";
import { ApiErrorDetail } from "@framerfordevs/api/contracts/response/api";
import {
  EntryCommandConflictFailure,
  EntryDraftConflictFailure,
  EntryPublicationConflictFailure,
  EntryPublicationInvalidFailure,
  EntryRevisionIncompatibleFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  ValidationFailure,
} from "@framerfordevs/api/contracts/response/errors";
import {
  CollectionFieldDefinition,
  ContractHash,
  GeneratedFormDefinition,
  SchemaRevisionId,
} from "@framerfordevs/api/contracts/schema";
import { StudioBootstrap } from "@framerfordevs/api/contracts/studio";
import { studioContentLimits } from "@framerfordevs/api/contracts/studio-content";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import { EntryRepository, makeEntryRepository } from "@framerfordevs/api/services/entry/repository";
import {
  makePublicationRepository,
  PublicationRepository,
} from "@framerfordevs/api/services/publication/repository";
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
import {
  makeStudioContentRepository,
  StudioContentRepository,
} from "@framerfordevs/api/services/studio-content/repository";
import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { Effect, Schema } from "effect";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../../src/app";

const ids = {
  workspace: "019fae8b-2234-7000-8000-000000000001",
  project: "019fae8b-2234-7000-8000-000000000002",
  environment: "019fae8b-2234-7000-8000-000000000003",
  collection: "019fae8b-2234-7000-8000-000000000004",
  entry: "019fae8b-2234-7000-8000-000000000005",
  schemaRevision: "019fae8b-2234-7000-8000-000000000006",
  field: "019fae8b-2234-7000-8000-000000000007",
  locale: "019fae8b-2234-7000-8000-000000000008",
  registration: "019fae8b-2234-7000-8000-000000000009",
  grant: "019fae8b-2234-7000-8000-000000000010",
  audit: "019fae8b-2234-7000-8000-000000000011",
  tab: "019fae8b-2234-7000-8000-000000000012",
  group: "019fae8b-2234-7000-8000-000000000013",
  placement: "019fae8b-2234-7000-8000-000000000014",
  command: "019fae8b-2234-7000-8000-000000000015",
  revisionOne: "019fae8b-2234-7000-8000-000000000016",
  revisionTwo: "019fae8b-2234-7000-8000-000000000017",
  hiddenField: "019fae8b-2234-7000-8000-000000000018",
  publication: "019fae8b-2234-7000-8000-000000000019",
  snapshot: "019fae8b-2234-7000-8000-000000000020",
  otherProject: "019fae8b-2234-7000-8000-000000000021",
  otherEntry: "019fae8b-2234-7000-8000-000000000022",
} as const;
const token = "studio-content-history-token";
const userId = "studio-content-history-user";
const hash = "a".repeat(64);
const oldHash = "b".repeat(64);
const now = "2026-10-01T00:00:00.000Z";
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

const bootstrap = decode(StudioBootstrap, {
  formatVersion: 1,
  host: {
    kind: "mounted",
    registration: {
      id: ids.registration,
      version: 1,
      applicationOrigin: "https://application.example.test",
      mountPath: "/studio",
    },
  },
  project: { id: ids.project, name: "Studio Project", workspaceId: ids.workspace },
  environment: { id: ids.environment, key: "main", name: "main" },
  user: { id: userId, name: "Studio User", email: "studio@example.test" },
  role: "editor",
  effectiveActions: ["project.read"],
  session: { expiresAt: "2027-01-15T08:00:00.000Z" },
});
const field = decode(CollectionFieldDefinition, {
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
    visibleToRoles: ["editor"],
    editableByRoles: ["editor"],
  },
  configuration: { maxLength: 100 },
  children: [],
});
const layout = decode(EditorLayout, {
  version: 1,
  tabs: [
    {
      id: ids.tab,
      title: "Content",
      description: null,
      position: 0,
      visibleToRoles: ["editor"],
      groups: [
        {
          id: ids.group,
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: ["editor"],
          fields: [
            {
              id: ids.placement,
              fieldId: ids.field,
              position: 0,
              helpTextOverride: null,
              visibleToRoles: ["editor"],
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [],
});
const form = decode(GeneratedFormDefinition, {
  source: "published",
  collectionId: ids.collection,
  revisionId: ids.schemaRevision,
  formatVersion: 1,
  validationProfile: "field-system@1",
  currencyRegistryProfile: "iso-4217@2026-01-01",
  contractHash: ContractHash.make(hash),
  role: "editor",
  canEdit: true,
  fields: [field],
  editableFieldIds: [ids.field],
  editorLayout: layout,
  currencyMinorUnits: {},
});
const entry = decode(CmsEntry, {
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

function revisionSummary(id: string, contractHash: string, sequence: number) {
  return decode(EntryRevisionSummary, {
    id,
    entryId: ids.entry,
    localeId: ids.locale,
    scope: "localized",
    sequence,
    previousRevisionId: sequence === 1 ? null : ids.revisionOne,
    schemaRevisionId: ids.schemaRevision,
    contractHash,
    changedFieldIds: [ids.field, ids.hiddenField],
    restoredFromRevisionId: null,
    authoredByUserId: userId,
    authoredByCredentialId: null,
    authoredAt: now,
  });
}

const publicationSummary = decode(EntryPublicationSummary, {
  id: ids.publication,
  snapshotId: ids.snapshot,
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "en",
  sequence: 1,
  schemaRevisionId: ids.schemaRevision,
  contractHash: hash,
  sharedRevisionId: null,
  sharedVersion: 0,
  localizedRevisionId: ids.revisionTwo,
  localizedVersion: 2,
  contentHash: "c".repeat(64),
  authorityHash: "d".repeat(64),
  documentHash: "e".repeat(64),
  changedFieldIds: [ids.field, ids.hiddenField],
  size: {
    documentBytes: 10,
    referenceManifestBytes: 0,
    combinedBytes: 10,
    maximumBytes: 1_000,
    bucket: "small",
  },
  publishedByUserId: userId,
  publishedByCredentialId: null,
  publishedAt: now,
  current: true,
});

function publicationStatus(state: "published" | "unpublished", stateVersion: number) {
  return decode(EntryPublicationStatus, {
    entryId: ids.entry,
    localeId: ids.locale,
    locale: "en",
    state,
    stateVersion,
    currentPublication: state === "published" ? publicationSummary : null,
    currentSchemaRevisionId: ids.schemaRevision,
    currentContractHash: hash,
    currentSharedRevisionId: null,
    currentSharedVersion: 0,
    currentLocalizedRevisionId: ids.revisionTwo,
    currentLocalizedVersion: 2,
    sharedChanged: false,
    localizedChanged: true,
    schemaChanged: false,
    changedSincePublication: true,
  });
}

function publicationPlan(valid: boolean) {
  return decode(EntryPublicationPlan, {
    entryId: ids.entry,
    localeId: ids.locale,
    locale: "en",
    stateVersion: 1,
    currentPublicationId: ids.publication,
    schemaRevisionId: ids.schemaRevision,
    contractHash: hash,
    sharedRevisionId: null,
    sharedVersion: 0,
    localizedRevisionId: ids.revisionTwo,
    localizedVersion: 2,
    valid,
    issues: valid
      ? []
      : [
          {
            fieldId: ids.hiddenField,
            path: ids.hiddenField,
            code: "required",
            message: "The hidden field is required.",
          },
        ],
    capped: false,
    contentHash: valid ? "c".repeat(64) : null,
    authorityHash: valid ? "d".repeat(64) : null,
    changedFieldIds: [ids.field],
    size: null,
    referencesWouldRefresh: false,
    wouldCreatePublication: valid,
  });
}

type EntryService = ReturnType<typeof makeEntryRepository>;
type PublicationService = ReturnType<typeof makePublicationRepository>;
type ContentService = ReturnType<typeof makeStudioContentRepository>;
type ErrorOf<F> = F extends (...args: never) => Effect.Effect<unknown, infer E, never> ? E : never;

interface Failures {
  listRevisions?: ErrorOf<EntryService["listRevisions"]>;
  getRevision?: ErrorOf<EntryService["getRevision"]>;
  compareRevisions?: ErrorOf<EntryService["compareRevisions"]>;
  restoreRevision?: ErrorOf<EntryService["restoreRevision"]>;
  getStatus?: ErrorOf<PublicationService["getStatus"]>;
  list?: ErrorOf<PublicationService["list"]>;
  validate?: ErrorOf<PublicationService["validate"]>;
  publish?: ErrorOf<PublicationService["publish"]>;
  unpublish?: ErrorOf<PublicationService["unpublish"]>;
}

interface Behavior {
  canPublish: boolean;
  canWriteLocalized: boolean;
  authorize: ErrorOf<ContentService["authorizeCollection"]> | null;
  failures: Failures;
  planValid: boolean;
  readBack: "verified" | "superseded";
}

const behavior: Behavior = {
  canPublish: true,
  canWriteLocalized: true,
  authorize: null,
  failures: {},
  planValid: true,
  readBack: "verified",
};
const calls: Array<{ readonly method: string; readonly input: Record<string, unknown> }> = [];

function respond<A, E>(method: string, input: object, failure: E | undefined, value: () => A) {
  calls.push({ method, input: { ...input } });
  return failure === undefined ? Effect.succeed(value()) : Effect.fail(failure);
}

function notFoundEverywhere(): Failures {
  const failure = NotFoundFailure.make({ resource: "entry" });
  return {
    listRevisions: failure,
    getRevision: failure,
    compareRevisions: failure,
    restoreRevision: failure,
    getStatus: failure,
    list: failure,
    validate: failure,
    publish: failure,
    unpublish: failure,
  };
}

const verifier = makeStudioOAuthTokenVerifier((value) =>
  Promise.resolve(value === token ? principal : null),
);
const studioRepository = {
  ...makeStudioRepository(),
  authorizeOAuth: () => Effect.succeed({ allowed: true as const }),
  getBootstrap: () => Effect.succeed(bootstrap),
};
const contentRepository = {
  ...makeStudioContentRepository(),
  authorizeCollection: () =>
    behavior.authorize !== null
      ? Effect.fail(behavior.authorize)
      : Effect.succeed({
          workspaceId: decode(WorkspaceId, ids.workspace),
          role: "editor" as const,
          localeId: decode(ProjectLocaleId, ids.locale),
          locale: decode(LocaleTag, "en"),
          schemaRevisionId: decode(SchemaRevisionId, ids.schemaRevision),
          canCreate: true,
          canRename: true,
          canWriteLocalized: behavior.canWriteLocalized,
          canWriteShared: false,
          canPublish: behavior.canPublish,
          canPublishPresentation: false,
        }),
};
const schemaRepository = {
  ...makeSchemaRepository(),
  getPublishedForm: () => Effect.succeed(form),
};
const entryRepository = {
  ...makeEntryRepository(),
  listRevisions: (_actor: unknown, input: object) =>
    respond("listRevisions", input, behavior.failures.listRevisions, () =>
      decode(EntryRevisionPage, {
        items: [
          revisionSummary(ids.revisionTwo, hash, 2),
          revisionSummary(ids.revisionOne, oldHash, 1),
        ],
        nextCursor: null,
      }),
    ),
  getRevision: (_actor: unknown, input: object) =>
    respond("getRevision", input, behavior.failures.getRevision, () =>
      decode(CmsEntryRevision, {
        entry,
        localeId: ids.locale,
        locale: "en",
        revision: revisionSummary(ids.revisionOne, oldHash, 1),
        values: { [ids.field]: "Old title", [ids.hiddenField]: "secret" },
        compatible: false,
        currentSchemaRevisionId: ids.schemaRevision,
        currentContractHash: hash,
      }),
    ),
  compareRevisions: (_actor: unknown, input: object) =>
    respond("compareRevisions", input, behavior.failures.compareRevisions, () =>
      decode(EntryRevisionComparison, {
        entry,
        localeId: ids.locale,
        locale: "en",
        scope: "localized",
        from: revisionSummary(ids.revisionOne, hash, 1),
        to: revisionSummary(ids.revisionTwo, hash, 2),
        items: [
          {
            fieldId: ids.field,
            change: "changed",
            before: "Old title",
            after: "New title",
            inCurrentSchema: true,
          },
          {
            fieldId: ids.hiddenField,
            change: "changed",
            before: "secret one",
            after: "secret two",
            inCurrentSchema: true,
          },
        ],
        restrictedChanges: false,
        schemaDiffers: false,
        currentSchemaRevisionId: ids.schemaRevision,
        currentContractHash: hash,
      }),
    ),
  restoreRevision: (_actor: unknown, input: object) =>
    respond("restoreRevision", input, behavior.failures.restoreRevision, () =>
      decode(SaveEntryDraftResult, {
        entryId: ids.entry,
        commandId: ids.command,
        sharedChanged: false,
        sharedVersion: 0,
        sharedRevisionId: null,
        localizedChanged: true,
        localizedVersion: 3,
        localizedRevisionId: ids.revisionTwo,
        validation: { valid: true, issues: [], capped: false },
      }),
    ),
};
const publicationRepository = {
  ...makePublicationRepository(),
  getStatus: (_actor: unknown, input: object) =>
    respond("getStatus", input, behavior.failures.getStatus, () =>
      publicationStatus("published", 1),
    ),
  list: (_actor: unknown, input: object) =>
    respond("list", input, behavior.failures.list, () =>
      decode(EntryPublicationPage, { items: [publicationSummary], nextCursor: null }),
    ),
  validate: (_actor: unknown, input: object) =>
    respond("validate", input, behavior.failures.validate, () =>
      publicationPlan(behavior.planValid),
    ),
  publish: (_actor: unknown, input: object) =>
    respond("publish", input, behavior.failures.publish, () =>
      decode(PublishEntryResult, {
        entryId: ids.entry,
        localeId: ids.locale,
        locale: "en",
        commandId: ids.command,
        stateVersion: 2,
        resultKind: "changed",
        publication: publicationSummary,
        delivery: {
          status: behavior.readBack,
          currentPublicationId: behavior.readBack === "verified" ? ids.publication : null,
        },
      }),
    ),
  unpublish: (_actor: unknown, input: object) =>
    respond("unpublish", input, behavior.failures.unpublish, () =>
      decode(UnpublishEntryResult, {
        entryId: ids.entry,
        localeId: ids.locale,
        locale: "en",
        commandId: ids.command,
        stateVersion: 3,
        resultKind: "changed",
        unpublishedPublicationId: ids.publication,
        unpublishedPublicationSequence: 1,
        unpublishedAt: now,
        delivery: {
          status: behavior.readBack,
          currentPublicationId: behavior.readBack === "verified" ? null : ids.publication,
        },
      }),
    ),
};
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
  Effect.provideService(effect, StudioOAuthTokenVerifier, verifier).pipe(
    Effect.provideService(StudioRepository, studioRepository),
    Effect.provideService(StudioContentRepository, contentRepository),
    Effect.provideService(SchemaRepository, schemaRepository),
    Effect.provideService(EntryRepository, entryRepository),
    Effect.provideService(PublicationRepository, publicationRepository),
    Effect.provideService(RateLimitManager, rateLimitManager),
  );
const api = request(createApp({ hostRoutingEnabled: false, studioEffectTransform: transform }));
const headers = { Authorization: `Bearer ${token}` };
const root = `/api/studio-content/v1/projects/${ids.project}/environments/${ids.environment}`;
const entryBase = `${root}/collections/${ids.collection}/locales/en/entries/${ids.entry}`;

const restoreBody = {
  scope: "localized",
  schemaRevisionId: ids.schemaRevision,
  contractHash: hash,
  expectedVersion: 2,
  commandId: ids.command,
};
const publishBody = {
  commandId: ids.command,
  authorityHash: "d".repeat(64),
  expectedStateVersion: 1,
  expectedPublicationId: ids.publication,
  expectedSchemaRevisionId: ids.schemaRevision,
  expectedContractHash: hash,
  expectedSharedVersion: 0,
  expectedSharedRevisionId: null,
  expectedLocalizedVersion: 2,
  expectedLocalizedRevisionId: ids.revisionTwo,
};
const unpublishBody = {
  commandId: ids.command,
  expectedStateVersion: 1,
  expectedPublicationId: ids.publication,
};

const routes = {
  revisions: () => api.get(`${entryBase}/revisions?scope=localized&limit=10`).set(headers),
  revision: () => api.get(`${entryBase}/revisions/${ids.revisionOne}`).set(headers),
  compare: () =>
    api.get(`${entryBase}/revisions/${ids.revisionOne}/compare/${ids.revisionTwo}`).set(headers),
  restore: () =>
    api.post(`${entryBase}/revisions/${ids.revisionOne}/restore`).set(headers).send(restoreBody),
  publication: () => api.get(`${entryBase}/publication`).set(headers),
  publications: () => api.get(`${entryBase}/publications`).set(headers),
  validate: () => api.post(`${entryBase}/publication/validate`).set(headers).send({}),
  publish: () => api.post(`${entryBase}/publication/publish`).set(headers).send(publishBody),
  unpublish: () => api.post(`${entryBase}/publication/unpublish`).set(headers).send(unpublishBody),
} as const;

function expectFailure(response: request.Response, status: number, code: string): void {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  expect(response.body.ok).toBe(false);
  expect(response.body.data).toBeNull();
  expect(response.body.error.code).toBe(code);
  expect(response.headers["cache-control"]).toContain("no-store");
  const serialized = JSON.stringify(response.body);
  expect(serialized).not.toContain(ids.hiddenField);
  expect(serialized).not.toContain("private_source_key");
}

beforeEach(() => {
  behavior.canPublish = true;
  behavior.canWriteLocalized = true;
  behavior.authorize = null;
  behavior.failures = {};
  behavior.planValid = true;
  behavior.readBack = "verified";
  calls.length = 0;
});

afterAll(async () => {
  await disposeApplicationRuntime();
});

describe("Studio Content revision and publication routes", () => {
  it("serves all nine operations with projected no-store responses", async () => {
    for (const [name, send] of Object.entries(routes)) {
      const response = await send();
      expect(response.status, `${name} ${JSON.stringify(response.body)}`).toBe(200);
      expect(response.body.ok).toBe(true);
      expect(response.body.error).toBeNull();
      expect(response.headers["cache-control"]).toContain("no-store");
      const serialized = JSON.stringify(response.body);
      expect(serialized, name).not.toContain(ids.hiddenField);
      expect(serialized, name).not.toContain("secret");
      expect(serialized, name).not.toContain("private_source_key");
      expect(serialized, name).not.toContain(token);
    }
  });

  it("projects revision summaries, values, comparison, and plans to the caller role", async () => {
    const page = await routes.revisions();
    expect(page.body.data.items.map((item: { id: string }) => item.id)).toEqual([
      ids.revisionTwo,
      ids.revisionOne,
    ]);
    expect(page.body.data.items[0].changedFieldIds).toEqual([ids.field]);
    expect(page.body.data.items.map((item: { compatible: boolean }) => item.compatible)).toEqual([
      true,
      false,
    ]);

    const revision = await routes.revision();
    expect(revision.body.data.values).toEqual({ [ids.field]: "Old title" });
    expect(revision.body.data.revision.compatible).toBe(false);

    const comparison = await routes.compare();
    expect(comparison.body.data.items).toEqual([
      {
        fieldId: ids.field,
        change: "changed",
        before: "Old title",
        after: "New title",
        inCurrentSchema: true,
      },
    ]);
    expect(comparison.body.data.restrictedChanges).toBe(true);

    behavior.planValid = false;
    const plan = await routes.validate();
    expect(plan.status).toBe(200);
    expect(plan.body.data.validation.status).toBe("restricted_issues");
    expect(plan.body.data.validation.issues).toEqual([]);
    expect(plan.body.data.authorityHash).toBeNull();

    const status = await routes.publication();
    expect(status.body.data.state).toBe("published");
    expect(status.body.data.changedSincePublication).toBe(true);
    expect(status.body.data.currentPublication.changedFieldIds).toEqual([ids.field]);
  });

  it("returns the Delivery read-back after publish and unpublish", async () => {
    const published = await routes.publish();
    expect(published.body.data.delivery).toEqual({
      status: "verified",
      currentPublicationId: ids.publication,
    });
    const unpublished = await routes.unpublish();
    expect(unpublished.body.data.delivery).toEqual({
      status: "verified",
      currentPublicationId: null,
    });
    behavior.readBack = "superseded";
    const superseded = await routes.publish();
    expect(superseded.body.data.delivery.status).toBe("superseded");
  });

  it("passes the exact route scope to every repository call", async () => {
    for (const send of Object.values(routes)) await send();
    expect(calls.map((call) => call.method).toSorted()).toEqual(
      [
        "listRevisions",
        "getRevision",
        "compareRevisions",
        "restoreRevision",
        "getStatus",
        "list",
        "validate",
        "publish",
        "unpublish",
      ].toSorted(),
    );
    for (const call of calls) {
      expect(call.input, call.method).toMatchObject({
        projectId: ids.project,
        environmentId: ids.environment,
        collectionId: ids.collection,
        locale: "en",
        entryId: ids.entry,
      });
    }
    expect(calls.find((call) => call.method === "listRevisions")?.input).toMatchObject({
      scope: "localized",
      limit: 10,
      cursor: null,
    });
    expect(calls.find((call) => call.method === "compareRevisions")?.input).toMatchObject({
      fromRevisionId: ids.revisionOne,
      toRevisionId: ids.revisionTwo,
    });
    expect(calls.find((call) => call.method === "restoreRevision")?.input).toMatchObject({
      revisionId: ids.revisionOne,
      expectedVersion: 2,
    });
  });

  it("maps restore failures to stable Studio error codes", async () => {
    const cases = [
      [EntryRevisionIncompatibleFailure.make(), 409, "REVISION_INCOMPATIBLE"],
      [
        EntryDraftConflictFailure.make({
          details: [
            ApiErrorDetail.make({
              path: "expectedVersion",
              code: "entry_draft_version_conflict",
              message: "The draft changed.",
            }),
          ],
        }),
        409,
        "DRAFT_VERSION_CONFLICT",
      ],
      [EntryCommandConflictFailure.make(), 409, "COMMAND_CONFLICT"],
      [NotFoundFailure.make({ resource: "entry_revision" }), 404, "NOT_FOUND"],
    ] as const;
    for (const [failure, status, code] of cases) {
      behavior.failures = { restoreRevision: failure };
      expectFailure(await routes.restore(), status, code);
    }
    behavior.failures = {};
    expectFailure(
      await api
        .post(`${entryBase}/revisions/${ids.revisionOne}/restore`)
        .set(headers)
        .send({ ...restoreBody, contractHash: oldHash }),
      409,
      "STALE_SCHEMA",
    );
    behavior.canWriteLocalized = false;
    expectFailure(await routes.restore(), 403, "FORBIDDEN");
    expect(calls.filter((call) => call.method === "restoreRevision")).toHaveLength(4);
  });

  it("maps publication failures to stable Studio error codes", async () => {
    behavior.failures = {
      publish: EntryPublicationInvalidFailure.make({
        issues: [
          decode(EntryPublicationValidationIssue, {
            fieldId: ids.hiddenField,
            path: ids.hiddenField,
            code: "required",
            message: "Hidden field required.",
          }),
        ],
      }),
    };
    const invalid = await routes.publish();
    expectFailure(invalid, 422, "PUBLICATION_INVALID");
    expect(invalid.body.error.details[0].code).not.toBe("required");

    const stale = EntryPublicationConflictFailure.make({
      details: [
        ApiErrorDetail.make({
          path: "expectedStateVersion",
          code: "publication_state_stale",
          message: "The publication state changed.",
        }),
      ],
    });
    behavior.failures = { publish: stale, unpublish: stale };
    expectFailure(await routes.publish(), 409, "PUBLICATION_STATE_CONFLICT");
    expectFailure(await routes.unpublish(), 409, "PUBLICATION_STATE_CONFLICT");

    behavior.failures = { publish: EntryCommandConflictFailure.make() };
    expectFailure(await routes.publish(), 409, "COMMAND_CONFLICT");

    behavior.failures = {};
    behavior.canPublish = false;
    for (const send of [routes.validate, routes.publish, routes.unpublish]) {
      expectFailure(await send(), 403, "FORBIDDEN");
    }
    expect(calls.filter((call) => call.method === "validate")).toHaveLength(0);
  });

  it("fails closed when the repository rejects a cross-scope revision comparison", async () => {
    behavior.failures = {
      compareRevisions: ValidationFailure.make({
        details: [
          ApiErrorDetail.make({
            path: "toRevisionId",
            code: "entry_revision_scope_mismatch",
            message: "Both revisions must belong to the same scope.",
          }),
        ],
      }),
    };
    const response = await routes.compare();
    expectFailure(response, 400, "VALIDATION_ERROR");
    expect(response.body.error.details[0].code).toBe("entry_revision_scope_mismatch");
  });

  it("denies other workspaces, projects, collections, entries, and locales", async () => {
    behavior.authorize = LocaleUnavailableFailure.make();
    for (const [name, send] of Object.entries(routes)) {
      const response = await send();
      expect(response.status, name).toBe(404);
      expect(response.body.error.code).toBe("LOCALE_UNAVAILABLE");
    }
    behavior.authorize = NotFoundFailure.make({ resource: "collection" });
    for (const send of Object.values(routes)) expectFailure(await send(), 404, "NOT_FOUND");
    expect(calls).toHaveLength(0);

    behavior.authorize = null;
    behavior.failures = notFoundEverywhere();
    const otherEntry = entryBase.replace(ids.entry, ids.otherEntry);
    for (const route of [
      `${otherEntry}/revisions?scope=shared`,
      `${otherEntry}/revisions/${ids.revisionOne}`,
      `${otherEntry}/publication`,
      `${otherEntry}/publications`,
      `${entryBase.replace("/locales/en/", "/locales/fr/")}/publication`,
    ]) {
      expectFailure(await api.get(route).set(headers), 404, "NOT_FOUND");
    }
    const otherProject = await api
      .get(`${entryBase.replace(ids.project, ids.otherProject)}/publication`)
      .set(headers);
    expect(otherProject.status).toBe(404);
  });

  it("rejects unknown keys, invalid identifiers, and unbounded input", async () => {
    const invalid = [
      api.get(`${entryBase}/revisions`).set(headers),
      api.get(`${entryBase}/revisions?scope=all`).set(headers),
      api.get(`${entryBase}/revisions?scope=shared&limit=9`).set(headers),
      api.get(`${entryBase}/revisions?scope=shared&limit=51`).set(headers),
      api.get(`${entryBase}/revisions?scope=shared&limit=10&limit=10`).set(headers),
      api.get(`${entryBase}/revisions?scope=shared&extra=1`).set(headers),
      api.get(`${entryBase}/publications?scope=shared`).set(headers),
      api.get(`${entryBase}/publication?expand=all`).set(headers),
      api.get(`${entryBase}/revisions/not-a-uuid`).set(headers),
      api.get(`${entryBase}/revisions/${ids.revisionOne}/compare/not-a-uuid`).set(headers),
      api
        .post(`${entryBase}/revisions/${ids.revisionOne}/restore`)
        .set(headers)
        .send({ ...restoreBody, extra: true }),
      api
        .post(`${entryBase}/revisions/${ids.revisionOne}/restore`)
        .set(headers)
        .send({ ...restoreBody, scope: "both" }),
      api.post(`${entryBase}/publication/validate`).set(headers).send({ dryRun: true }),
      api
        .post(`${entryBase}/publication/publish`)
        .set(headers)
        .send({ ...publishBody, force: true }),
      api
        .post(`${entryBase}/publication/publish`)
        .set(headers)
        .send({ ...publishBody, authorityHash: undefined }),
      api
        .post(`${entryBase}/publication/unpublish`)
        .set(headers)
        .send({ ...unpublishBody, extra: 1 }),
    ];
    for (const pending of invalid) {
      const response = await pending;
      expectFailure(response, 400, "VALIDATION_ERROR");
    }
    expect(calls).toHaveLength(0);

    const oversized = await api
      .post(`${entryBase}/publication/publish`)
      .set(headers)
      .send({ ...publishBody, padding: "x".repeat(studioContentLimits.commandRequestBytes) });
    expectFailure(oversized, 413, "REQUEST_TOO_LARGE");

    const notJson = await api
      .post(`${entryBase}/publication/validate`)
      .set(headers)
      .set("Content-Type", "text/plain")
      .send("{}");
    expectFailure(notJson, 400, "VALIDATION_ERROR");

    const withBody = await api
      .get(`${entryBase}/publication`)
      .set(headers)
      .set("Content-Length", "2");
    expect(withBody.status).toBe(400);

    const wrongMethod = await api.delete(`${entryBase}/publication`).set(headers);
    expectFailure(wrongMethod, 404, "NOT_FOUND");
    const browserOrigin = await routes.publication().set("Origin", "https://evil.example");
    expectFailure(browserOrigin, 403, "FORBIDDEN");
    const unauthenticated = await api.get(`${entryBase}/publication`);
    expectFailure(unauthenticated, 401, "UNAUTHORIZED");
  });

  it("routes compare paths without shadowing single-revision reads", async () => {
    await routes.compare();
    await routes.revision();
    expect(calls.map((call) => call.method)).toEqual(["compareRevisions", "getRevision"]);
    const extraSegment = await api
      .get(`${entryBase}/revisions/${ids.revisionOne}/compare/${ids.revisionTwo}/extra`)
      .set(headers);
    expectFailure(extraSegment, 404, "NOT_FOUND");
  });
});
