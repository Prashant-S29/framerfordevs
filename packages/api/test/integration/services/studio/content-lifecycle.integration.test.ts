import { randomUUID } from "node:crypto";

import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";

import { EntryId, EntryRevisionId } from "../../../../src/contracts/entry";
import { RateLimitDecision, rateLimitPolicies } from "../../../../src/contracts/rate-limit";
import { StudioBootstrap } from "../../../../src/contracts/studio";
import {
  StudioCollectionLocaleScope,
  StudioListPublicationsQuery,
  StudioListRevisionsQuery,
  StudioPublishEntryRequest,
  StudioRestoreRevisionRequest,
  StudioUnpublishEntryRequest,
} from "../../../../src/contracts/studio-content";
import { ApplicationLogger } from "../../../../src/observability/logger";
import {
  compareStudioEntryRevisions,
  getStudioEntryPublication,
  getStudioEntryRevision,
  getStudioEntryWorkspace,
  listStudioEntryPublications,
  listStudioEntryRevisions,
  publishStudioEntry,
  restoreStudioEntryRevision,
  unpublishStudioEntry,
  validateStudioEntryPublication,
} from "../../../../src/operations/studio-content-public";
import { EntryRepository, makeEntryRepository } from "../../../../src/services/entry/repository";
import {
  makePublicationRepository,
  PublicationRepository,
} from "../../../../src/services/publication/repository";
import { RateLimitManager } from "../../../../src/services/rate-limit/manager";
import { makeSchemaRepository, SchemaRepository } from "../../../../src/services/schema/repository";
import { makeStudioRepository, StudioRepository } from "../../../../src/services/studio/repository";
import {
  makeStudioContentRepository,
  StudioContentRepository,
} from "../../../../src/services/studio-content/repository";
import {
  createPublishedCollectionFixture,
  type PublishedCollectionFixture,
} from "../../../support/published-collection";
import {
  createFixtureEntry,
  createRevisionFixture,
  saveFixtureDraft,
  type RevisionFixture,
} from "../../../support/revision-fixture";

let fixture: RevisionFixture;
let foreign: PublishedCollectionFixture;
let entryId: EntryId;
let sharedRevisionIds: Array<EntryRevisionId> = [];
let localizedRevisionIds: Array<EntryRevisionId> = [];
let hindiRevisionId: EntryRevisionId;
let localizedVersion = 0;
const now = new Date("2026-11-01T14:00:00.000Z");

function principal(userId: string): StudioOAuthPrincipal {
  return {
    kind: "studio_oauth_user",
    userId,
    clientId: "ffd-studio-v1-019fae8b-1234-7000-8000-000000000031",
    registrationId: "019fae8b-1234-7000-8000-000000000031",
    registrationVersion: 1,
    projectId: fixture.projectId,
    environmentId: fixture.environmentId,
    grantId: "019fae8b-1234-7000-8000-000000000032",
    auditMarkerId: "019fae8b-1234-7000-8000-000000000033",
    grantExpiresAtEpochSeconds: 1_900_000_000,
    scopes: ["studio:session", "offline_access"],
    expiresAtEpochSeconds: 1_900_000_000,
  };
}

const services = Layer.mergeAll(
  Layer.succeed(StudioRepository, {
    ...makeStudioRepository(),
    getBootstrap: () =>
      Effect.succeed(
        Schema.decodeUnknownSync(StudioBootstrap, { onExcessProperty: "error" })({
          formatVersion: 1,
          host: {
            kind: "mounted",
            registration: {
              id: "019fae8b-1234-7000-8000-000000000031",
              version: 1,
              applicationOrigin: "https://application.example.test",
              mountPath: "/studio",
            },
          },
          project: {
            id: fixture.projectId,
            name: "Project",
            workspaceId: fixture.workspaceId,
          },
          environment: { id: fixture.environmentId, key: "main", name: "main" },
          user: { id: fixture.ownerId, name: "User", email: "user@example.test" },
          role: "owner",
          effectiveActions: ["project.read"],
          session: { expiresAt: "2027-01-15T08:00:00.000Z" },
        }),
      ),
  }),
  Layer.succeed(RateLimitManager, {
    evaluate: (input) =>
      Effect.succeed(
        Schema.decodeUnknownSync(RateLimitDecision, { onExcessProperty: "error" })({
          allowed: true,
          policy: input.policy,
          cost: input.cost,
          limit: rateLimitPolicies[input.policy].limitPerInterval,
          remaining: rateLimitPolicies[input.policy].capacity,
          resetAtEpochMs: now.getTime() + rateLimitPolicies[input.policy].intervalMs,
          retryAfterSeconds: null,
          enforcementMode: "memory",
        }),
      ),
    reset: () => Effect.void,
    retainedFallbackEntryCount: Effect.succeed(0),
  }),
  Layer.succeed(ApplicationLogger, { info: () => Effect.void, error: () => Effect.void }),
  Layer.succeed(StudioContentRepository, makeStudioContentRepository()),
  Layer.succeed(SchemaRepository, makeSchemaRepository()),
  Layer.succeed(EntryRepository, makeEntryRepository()),
  Layer.succeed(PublicationRepository, makePublicationRepository()),
);

type Services =
  | StudioRepository
  | RateLimitManager
  | ApplicationLogger
  | StudioContentRepository
  | SchemaRepository
  | EntryRepository
  | PublicationRepository;

function run<A, E>(effect: Effect.Effect<A, E, Services>) {
  return Effect.runPromise(Effect.provide(effect, services));
}

function runExit<A, E>(effect: Effect.Effect<A, E, Services>) {
  return Effect.runPromiseExit(Effect.provide(effect, services));
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
  return typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    typeof error._tag === "string"
    ? error._tag
    : undefined;
}

function studioScope(overrides: Partial<Record<"collectionId" | "locale", string>> = {}) {
  return Schema.decodeUnknownSync(StudioCollectionLocaleScope, { onExcessProperty: "error" })({
    projectId: fixture.projectId,
    environmentId: fixture.environmentId,
    collectionId: fixture.collectionId,
    locale: "en",
    ...overrides,
  });
}

function revisionsQuery(value: unknown) {
  return Schema.decodeUnknownSync(StudioListRevisionsQuery, { onExcessProperty: "error" })(value);
}

function revisionId(value: string | null): EntryRevisionId {
  return Schema.decodeUnknownSync(EntryRevisionId, { onExcessProperty: "error" })(value);
}

beforeAll(async () => {
  fixture = await createRevisionFixture("m20a-studio");
  foreign = await createPublishedCollectionFixture(
    "m20a-studio-foreign",
    new Date("2026-11-01T10:00:00.000Z"),
  );
  entryId = Schema.decodeUnknownSync(EntryId)(await createFixtureEntry(fixture, "Studio entry"));
  const first = await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.secret]: "Secret one", [fixture.fields.note]: "Note one" },
    localized: { [fixture.fields.title]: "Title one" },
  });
  const second = await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.secret]: "Secret two" },
    localized: { [fixture.fields.title]: "Title two" },
  });
  sharedRevisionIds = [revisionId(first.sharedRevisionId), revisionId(second.sharedRevisionId)];
  localizedRevisionIds = [
    revisionId(first.localizedRevisionId),
    revisionId(second.localizedRevisionId),
  ];
  localizedVersion = second.localizedVersion;
  const hindi = await saveFixtureDraft(
    fixture,
    entryId,
    { localized: { [fixture.fields.title]: "Hindi" } },
    { locale: "hi" },
  );
  hindiRevisionId = revisionId(hindi.localizedRevisionId);
});

describe("Studio Content revisions", () => {
  it("adds publication state and the publish capability to the entry workspace", async () => {
    const owner = await run(
      getStudioEntryWorkspace(principal(fixture.ownerId), studioScope(), entryId, now),
    );
    assert.strictEqual(owner.publication.state, "never_published");
    assert.isTrue(owner.capabilities.canPublish);
    const editor = await run(
      getStudioEntryWorkspace(principal(fixture.editorId), studioScope(), entryId, now),
    );
    assert.isFalse(editor.capabilities.canPublish);
    const reviewer = await run(
      getStudioEntryWorkspace(principal(fixture.reviewerId), studioScope(), entryId, now),
    );
    assert.isTrue(reviewer.capabilities.canPublish);
    assert.isFalse(reviewer.capabilities.canSaveLocalized);
  });

  it("lists, reads, and compares revisions with hidden fields projected away", async () => {
    const editor = principal(fixture.editorId);
    const page = await run(
      listStudioEntryRevisions(
        editor,
        studioScope(),
        entryId,
        revisionsQuery({ scope: "shared", limit: 10 }),
        now,
      ),
    );
    assert.deepStrictEqual(
      page.items.map((item) => [String(item.id), item.compatible]),
      [
        [String(sharedRevisionIds[1]), true],
        [String(sharedRevisionIds[0]), true],
      ],
    );
    assert.deepStrictEqual([...(page.items[0]?.changedFieldIds ?? [])], []);
    assert.isNull(page.nextCursor);
    const revision = await run(
      getStudioEntryRevision(
        editor,
        studioScope(),
        entryId,
        sharedRevisionIds[0] ?? hindiRevisionId,
        now,
      ),
    );
    assert.deepStrictEqual({ ...revision.values }, { [fixture.fields.note]: "Note one" });
    const comparison = await run(
      compareStudioEntryRevisions(
        editor,
        studioScope(),
        entryId,
        sharedRevisionIds[0] ?? hindiRevisionId,
        sharedRevisionIds[1] ?? hindiRevisionId,
        now,
      ),
    );
    assert.deepStrictEqual(comparison.items, []);
    assert.isTrue(comparison.restrictedChanges);
    assert.isFalse(comparison.schemaDiffers);
    for (const value of [page, revision, comparison]) {
      assert.notInclude(JSON.stringify(value), fixture.fields.secret);
      assert.notInclude(JSON.stringify(value), "Secret");
    }
    const owner = await run(
      compareStudioEntryRevisions(
        principal(fixture.ownerId),
        studioScope(),
        entryId,
        sharedRevisionIds[0] ?? hindiRevisionId,
        sharedRevisionIds[1] ?? hindiRevisionId,
        now,
      ),
    );
    assert.deepStrictEqual(
      owner.items.map((item) => String(item.fieldId)),
      [fixture.fields.secret],
    );
    assert.isFalse(owner.restrictedChanges);
  });

  it("pages revisions with a Studio cursor and rejects a malformed cursor", async () => {
    const owner = principal(fixture.ownerId);
    const scope = studioScope();
    const listPage = (cursor: string | null) =>
      run(
        listStudioEntryRevisions(
          owner,
          scope,
          entryId,
          revisionsQuery({ scope: "localized", cursor, limit: 10 }),
          now,
        ),
      );
    let cursor: string | null = null;
    let page: Awaited<ReturnType<typeof listPage>>;
    const seen: Array<string> = [];
    for (let index = 0; index < 12; index += 1) {
      await saveFixtureDraft(fixture, entryId, {
        localized: { [fixture.fields.title]: `Paged ${index}` },
      });
    }
    do {
      page = await listPage(cursor);
      seen.push(...page.items.map((item) => String(item.id)));
      cursor = page.nextCursor;
    } while (cursor !== null);
    assert.strictEqual(new Set(seen).size, seen.length);
    assert.isAtLeast(seen.length, 14);
    localizedVersion += 12;
    const invalid = await runExit(
      listStudioEntryRevisions(
        owner,
        scope,
        entryId,
        revisionsQuery({ scope: "localized", cursor: "bm90LWEtY3Vyc29y", limit: 10 }),
        now,
      ),
    );
    assert.strictEqual(failureTag(invalid), "StudioContentCursorInvalidFailure");
  });

  it("denies cross-collection, cross-locale, and cross-project reads", async () => {
    const owner = principal(fixture.ownerId);
    const exits = await Promise.all([
      runExit(
        getStudioEntryRevision(
          owner,
          studioScope({ collectionId: foreign.collectionId }),
          entryId,
          sharedRevisionIds[0] ?? hindiRevisionId,
          now,
        ),
      ),
      runExit(getStudioEntryRevision(owner, studioScope(), entryId, hindiRevisionId, now)),
      runExit(
        getStudioEntryRevision(
          principal(foreign.ownerId),
          studioScope(),
          entryId,
          sharedRevisionIds[0] ?? hindiRevisionId,
          now,
        ),
      ),
      runExit(
        getStudioEntryRevision(owner, studioScope({ locale: "fr" }), entryId, hindiRevisionId, now),
      ),
    ]);
    assert.deepStrictEqual(exits.map(failureTag), [
      "NotFoundFailure",
      "NotFoundFailure",
      "NotFoundFailure",
      "LocaleUnavailableFailure",
    ]);
  });

  it("restores a localized revision with stale, replay, conflict, and authorization checks", async () => {
    const editor = principal(fixture.editorId);
    const request = (
      commandId: string,
      expectedVersion: number,
      scope: "shared" | "localized" = "localized",
    ) =>
      Schema.decodeUnknownSync(StudioRestoreRevisionRequest, { onExcessProperty: "error" })({
        scope,
        schemaRevisionId: fixture.schemaRevisionId,
        contractHash: fixture.contractHash,
        expectedVersion,
        commandId,
      });
    const target = localizedRevisionIds[0] ?? hindiRevisionId;
    const stale = await runExit(
      restoreStudioEntryRevision(
        editor,
        studioScope(),
        entryId,
        target,
        request(randomUUID(), 1),
        now,
        "studio-restore-stale",
      ),
    );
    assert.strictEqual(failureTag(stale), "StudioDraftVersionConflictFailure");
    const commandId = randomUUID();
    const receipt = await run(
      restoreStudioEntryRevision(
        editor,
        studioScope(),
        entryId,
        target,
        request(commandId, localizedVersion),
        now,
        "studio-restore",
      ),
    );
    assert.isTrue(receipt.localizedChanged);
    assert.strictEqual(receipt.localizedVersion, localizedVersion + 1);
    const replay = await run(
      restoreStudioEntryRevision(
        editor,
        studioScope(),
        entryId,
        target,
        request(commandId, localizedVersion),
        now,
        "studio-restore-replay",
      ),
    );
    assert.strictEqual(replay.localizedRevisionId, receipt.localizedRevisionId);
    const conflict = await runExit(
      restoreStudioEntryRevision(
        editor,
        studioScope(),
        entryId,
        localizedRevisionIds[1] ?? hindiRevisionId,
        request(commandId, localizedVersion),
        now,
        "studio-restore-conflict",
      ),
    );
    assert.strictEqual(failureTag(conflict), "StudioCommandConflictFailure");
    const hiddenShared = await runExit(
      restoreStudioEntryRevision(
        editor,
        studioScope(),
        entryId,
        sharedRevisionIds[0] ?? hindiRevisionId,
        request(randomUUID(), 2, "shared"),
        now,
        "studio-restore-hidden",
      ),
    );
    assert.strictEqual(failureTag(hiddenShared), "ForbiddenFailure");
    const reviewer = await runExit(
      restoreStudioEntryRevision(
        principal(fixture.reviewerId),
        studioScope(),
        entryId,
        target,
        request(randomUUID(), localizedVersion + 1),
        now,
        "studio-restore-reviewer",
      ),
    );
    assert.strictEqual(failureTag(reviewer), "ForbiddenFailure");
    const staleSchema = await runExit(
      restoreStudioEntryRevision(
        editor,
        studioScope(),
        entryId,
        target,
        Schema.decodeUnknownSync(StudioRestoreRevisionRequest, { onExcessProperty: "error" })({
          scope: "localized",
          schemaRevisionId: fixture.schemaRevisionId,
          contractHash: "f".repeat(64),
          expectedVersion: localizedVersion + 1,
          commandId: randomUUID(),
        }),
        now,
        "studio-restore-stale-schema",
      ),
    );
    assert.strictEqual(failureTag(staleSchema), "AuthoringStaleSchemaFailure");
  });
});

describe("Studio Content publication", () => {
  it("validates with restricted issues for a role that cannot see the blocking field", async () => {
    const hiddenEntry = Schema.decodeUnknownSync(EntryId)(
      await createFixtureEntry(fixture, "Missing secret"),
    );
    await saveFixtureDraft(fixture, hiddenEntry, {
      localized: { [fixture.fields.title]: "Visible title" },
    });
    const plan = await run(
      validateStudioEntryPublication(
        principal(fixture.reviewerId),
        studioScope(),
        hiddenEntry,
        {},
        now,
      ),
    );
    assert.strictEqual(plan.validation.status, "restricted_issues");
    assert.isNull(plan.authorityHash);
    assert.notInclude(JSON.stringify(plan), fixture.fields.secret);
    const editor = await runExit(
      validateStudioEntryPublication(
        principal(fixture.editorId),
        studioScope(),
        hiddenEntry,
        {},
        now,
      ),
    );
    assert.strictEqual(failureTag(editor), "ForbiddenFailure");
    const invalidPublish = await runExit(
      publishStudioEntry(
        principal(fixture.reviewerId),
        studioScope(),
        hiddenEntry,
        Schema.decodeUnknownSync(StudioPublishEntryRequest, { onExcessProperty: "error" })({
          commandId: randomUUID(),
          authorityHash: "a".repeat(64),
          expectedStateVersion: plan.stateVersion,
          expectedPublicationId: plan.currentPublicationId,
          expectedSchemaRevisionId: plan.schemaRevisionId,
          expectedContractHash: plan.contractHash,
          expectedSharedVersion: plan.sharedVersion,
          expectedSharedRevisionId: plan.sharedRevisionId,
          expectedLocalizedVersion: plan.localizedVersion,
          expectedLocalizedRevisionId: plan.localizedRevisionId,
        }),
        now,
        "studio-publish-invalid",
      ),
    );
    assert.strictEqual(failureTag(invalidPublish), "StudioPublicationInvalidFailure");
    assert.notInclude(JSON.stringify(invalidPublish), fixture.fields.secret);
  });

  it("validates, publishes, lists, and unpublishes with Delivery read-back", async () => {
    const owner = principal(fixture.ownerId);
    const plan = await run(validateStudioEntryPublication(owner, studioScope(), entryId, {}, now));
    assert.strictEqual(plan.validation.status, "valid");
    assert.isTrue(plan.wouldCreatePublication);
    const publishRequest = Schema.decodeUnknownSync(StudioPublishEntryRequest, {
      onExcessProperty: "error",
    })({
      commandId: randomUUID(),
      authorityHash: plan.authorityHash,
      expectedStateVersion: plan.stateVersion,
      expectedPublicationId: plan.currentPublicationId,
      expectedSchemaRevisionId: plan.schemaRevisionId,
      expectedContractHash: plan.contractHash,
      expectedSharedVersion: plan.sharedVersion,
      expectedSharedRevisionId: plan.sharedRevisionId,
      expectedLocalizedVersion: plan.localizedVersion,
      expectedLocalizedRevisionId: plan.localizedRevisionId,
    });
    const published = await run(
      publishStudioEntry(owner, studioScope(), entryId, publishRequest, now, "studio-publish"),
    );
    assert.strictEqual(published.resultKind, "changed");
    assert.deepStrictEqual(
      { ...published.delivery },
      { status: "verified", currentPublicationId: published.publication.id },
    );
    const status = await run(getStudioEntryPublication(owner, studioScope(), entryId, now));
    assert.strictEqual(status.state, "published");
    assert.isFalse(status.changedSincePublication);
    const editorStatus = await run(
      getStudioEntryPublication(principal(fixture.editorId), studioScope(), entryId, now),
    );
    assert.notInclude(JSON.stringify(editorStatus), fixture.fields.secret);
    const hindi = await run(
      getStudioEntryPublication(owner, studioScope({ locale: "hi" }), entryId, now),
    );
    assert.strictEqual(hindi.state, "never_published");
    const page = await run(
      listStudioEntryPublications(
        owner,
        studioScope(),
        entryId,
        Schema.decodeUnknownSync(StudioListPublicationsQuery, { onExcessProperty: "error" })({}),
        now,
      ),
    );
    assert.deepStrictEqual(
      page.items.map((item) => [String(item.id), item.current]),
      [[String(published.publication.id), true]],
    );
    const stalePublish = await runExit(
      publishStudioEntry(
        owner,
        studioScope(),
        entryId,
        StudioPublishEntryRequest.make({
          ...publishRequest,
          commandId: Schema.decodeUnknownSync(StudioPublishEntryRequest.fields.commandId)(
            randomUUID(),
          ),
        }),
        now,
        "studio-publish-stale",
      ),
    );
    assert.strictEqual(failureTag(stalePublish), "StudioPublicationStateConflictFailure");
    const editorPublish = await runExit(
      publishStudioEntry(
        principal(fixture.editorId),
        studioScope(),
        entryId,
        publishRequest,
        now,
        "studio-publish-editor",
      ),
    );
    assert.strictEqual(failureTag(editorPublish), "ForbiddenFailure");
    const unpublishRequest = Schema.decodeUnknownSync(StudioUnpublishEntryRequest, {
      onExcessProperty: "error",
    })({
      commandId: randomUUID(),
      expectedStateVersion: status.stateVersion,
      expectedPublicationId: published.publication.id,
    });
    const unpublished = await run(
      unpublishStudioEntry(
        owner,
        studioScope(),
        entryId,
        unpublishRequest,
        now,
        "studio-unpublish",
      ),
    );
    assert.strictEqual(unpublished.resultKind, "changed");
    assert.deepStrictEqual(
      { ...unpublished.delivery },
      { status: "verified", currentPublicationId: null },
    );
    const reusedCommand = await runExit(
      unpublishStudioEntry(
        owner,
        studioScope(),
        entryId,
        StudioUnpublishEntryRequest.make({
          ...unpublishRequest,
          commandId: publishRequest.commandId,
        }),
        now,
        "studio-unpublish-reused",
      ),
    );
    assert.strictEqual(failureTag(reusedCommand), "StudioCommandConflictFailure");
    const after = await run(getStudioEntryPublication(owner, studioScope(), entryId, now));
    assert.strictEqual(after.state, "unpublished");
  });
});
