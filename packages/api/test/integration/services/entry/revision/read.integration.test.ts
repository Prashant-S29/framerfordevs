import { randomUUID } from "node:crypto";

import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, Schema } from "effect";

import {
  CompareEntryRevisionsInput,
  GetEntryRevisionInput,
  ListEntryRevisionsInput,
  RestoreEntryRevisionInput,
} from "../../../../../src/contracts/entry";
import { AuthUserId } from "../../../../../src/contracts/platform";
import { makeEntryRepository } from "../../../../../src/services/entry/repository";
import {
  createPublishedCollectionFixture,
  type PublishedCollectionFixture,
} from "../../../../support/published-collection";
import {
  createFixtureEntry,
  createRevisionFixture,
  removeFixtureFieldAndPublish,
  saveFixtureDraft,
  type RevisionFixture,
} from "../../../../support/revision-fixture";

const entries = makeEntryRepository();

let fixture: RevisionFixture;
let foreign: PublishedCollectionFixture;
let entryId: string;
let otherEntryId: string;
let sharedRevisionIds: Array<string> = [];
let localizedRevisionIds: Array<string> = [];
let hindiRevisionId: string;
let otherEntryRevisionId: string;

function failure(exit: Exit.Exit<unknown, unknown>): {
  readonly tag?: string;
  readonly value: unknown;
} {
  if (Exit.isSuccess(exit)) return { value: undefined };
  const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
  const tag =
    typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string"
      ? error._tag
      : undefined;
  return tag === undefined ? { value: error } : { tag, value: error };
}

function scope(
  overrides: Partial<
    Record<"projectId" | "environmentId" | "collectionId" | "locale" | "entryId", string>
  > = {},
) {
  return {
    projectId: fixture.projectId,
    environmentId: fixture.environmentId,
    collectionId: fixture.collectionId,
    locale: "en",
    entryId,
    ...overrides,
  };
}

function getInput(revisionId: string, overrides: Parameters<typeof scope>[0] = {}) {
  return Schema.decodeUnknownSync(GetEntryRevisionInput, { onExcessProperty: "error" })({
    ...scope(overrides),
    revisionId,
  });
}

function compareInput(from: string, to: string, overrides: Parameters<typeof scope>[0] = {}) {
  return Schema.decodeUnknownSync(CompareEntryRevisionsInput, { onExcessProperty: "error" })({
    ...scope(overrides),
    fromRevisionId: from,
    toRevisionId: to,
  });
}

beforeAll(async () => {
  fixture = await createRevisionFixture("m20a-read");
  foreign = await createPublishedCollectionFixture(
    "m20a-read-foreign",
    new Date("2026-11-01T10:00:00.000Z"),
  );
  entryId = await createFixtureEntry(fixture, "Revision entry");
  otherEntryId = await createFixtureEntry(fixture, "Other entry");
  const first = await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.note]: "Note one", [fixture.fields.secret]: "Secret one" },
    localized: { [fixture.fields.title]: "Title one" },
  });
  const second = await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.secret]: "Secret two" },
    localized: { [fixture.fields.title]: "Title two" },
  });
  const third = await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.note]: "Note three", [fixture.fields.legacy]: "Legacy value" },
  });
  sharedRevisionIds = [first.sharedRevisionId, second.sharedRevisionId, third.sharedRevisionId].map(
    (id) => {
      if (id === null) throw new Error("Shared revision is missing.");
      return id;
    },
  );
  localizedRevisionIds = [first.localizedRevisionId, second.localizedRevisionId].map((id) => {
    if (id === null) throw new Error("Localized revision is missing.");
    return id;
  });
  const hindi = await saveFixtureDraft(
    fixture,
    entryId,
    { localized: { [fixture.fields.title]: "Shirshak" } },
    { locale: "hi" },
  );
  if (hindi.localizedRevisionId === null) throw new Error("Hindi revision is missing.");
  hindiRevisionId = hindi.localizedRevisionId;
  const other = await saveFixtureDraft(fixture, otherEntryId, {
    shared: { [fixture.fields.note]: "Other note" },
  });
  if (other.sharedRevisionId === null) throw new Error("Other revision is missing.");
  otherEntryRevisionId = other.sharedRevisionId;
});

describe("entry revision read and compare", () => {
  it("returns one revision with all values for the owner and a credential-equivalent full view", async () => {
    const revision = await Effect.runPromise(
      entries.getRevision(fixture.ownerId, getInput(sharedRevisionIds[1] ?? "")),
    );
    assert.strictEqual(revision.revision.scope, "shared");
    assert.strictEqual(revision.revision.sequence, 2);
    assert.isTrue(revision.compatible);
    assert.strictEqual(revision.currentContractHash, fixture.contractHash);
    assert.deepStrictEqual(
      { ...revision.values },
      { [fixture.fields.note]: "Note one", [fixture.fields.secret]: "Secret two" },
    );
    assert.deepStrictEqual([...revision.revision.changedFieldIds], [fixture.fields.secret]);
  });

  it("projects values and changed field IDs for a role that cannot see a field", async () => {
    const revision = await Effect.runPromise(
      entries.getRevision(fixture.editorId, getInput(sharedRevisionIds[1] ?? "")),
    );
    assert.deepStrictEqual({ ...revision.values }, { [fixture.fields.note]: "Note one" });
    assert.deepStrictEqual([...revision.revision.changedFieldIds], []);
    assert.notInclude(JSON.stringify(revision), "Secret");
  });

  it("reads a localized revision only through its own locale", async () => {
    const english = await Effect.runPromise(
      entries.getRevision(fixture.ownerId, getInput(localizedRevisionIds[0] ?? "")),
    );
    assert.strictEqual(english.revision.scope, "localized");
    assert.deepStrictEqual({ ...english.values }, { [fixture.fields.title]: "Title one" });
    const crossLocale = await Effect.runPromiseExit(
      entries.getRevision(fixture.ownerId, getInput(hindiRevisionId)),
    );
    assert.strictEqual(failure(crossLocale).tag, "NotFoundFailure");
    const hindi = await Effect.runPromise(
      entries.getRevision(fixture.ownerId, getInput(hindiRevisionId, { locale: "hi" })),
    );
    assert.strictEqual(hindi.locale, "hi");
  });

  it("denies cross-entry, cross-collection, cross-environment, cross-project, and cross-workspace reads", async () => {
    const revisionId = sharedRevisionIds[0] ?? "";
    const exits = await Promise.all([
      Effect.runPromiseExit(entries.getRevision(fixture.ownerId, getInput(otherEntryRevisionId))),
      Effect.runPromiseExit(
        entries.getRevision(fixture.ownerId, getInput(revisionId, { entryId: otherEntryId })),
      ),
      Effect.runPromiseExit(
        entries.getRevision(
          fixture.ownerId,
          getInput(revisionId, { collectionId: foreign.collectionId }),
        ),
      ),
      Effect.runPromiseExit(
        entries.getRevision(
          fixture.ownerId,
          getInput(revisionId, { environmentId: foreign.environmentId }),
        ),
      ),
      Effect.runPromiseExit(
        entries.getRevision(
          fixture.ownerId,
          getInput(revisionId, {
            projectId: foreign.projectId,
            environmentId: foreign.environmentId,
            collectionId: foreign.collectionId,
          }),
        ),
      ),
      Effect.runPromiseExit(
        entries.getRevision(
          Schema.decodeUnknownSync(AuthUserId, { onExcessProperty: "error" })(foreign.ownerId),
          getInput(revisionId),
        ),
      ),
      Effect.runPromiseExit(entries.getRevision(fixture.ownerId, getInput(randomUUID()))),
    ]);
    for (const exit of exits) {
      assert.isTrue(Exit.isFailure(exit));
      assert.include(["NotFoundFailure", "ForbiddenFailure"], failure(exit).tag);
    }
  });

  it("rejects an unknown locale before reading revisions", async () => {
    const exit = await Effect.runPromiseExit(
      entries.getRevision(fixture.ownerId, getInput(sharedRevisionIds[0] ?? "", { locale: "fr" })),
    );
    assert.strictEqual(failure(exit).tag, "LocaleUnavailableFailure");
  });

  it("compares two revisions by stable field ID in current schema order", async () => {
    const comparison = await Effect.runPromise(
      entries.compareRevisions(
        fixture.ownerId,
        compareInput(sharedRevisionIds[0] ?? "", sharedRevisionIds[2] ?? ""),
      ),
    );
    assert.strictEqual(comparison.scope, "shared");
    assert.isFalse(comparison.restrictedChanges);
    assert.isFalse(comparison.schemaDiffers);
    assert.deepStrictEqual(
      comparison.items.map((item) => ({ ...item, fieldId: String(item.fieldId) })),
      [
        {
          fieldId: fixture.fields.note,
          change: "changed",
          before: "Note one",
          after: "Note three",
          inCurrentSchema: true,
        },
        {
          fieldId: fixture.fields.secret,
          change: "changed",
          before: "Secret one",
          after: "Secret two",
          inCurrentSchema: true,
        },
        {
          fieldId: fixture.fields.legacy,
          change: "added",
          after: "Legacy value",
          inCurrentSchema: true,
        },
      ],
    );
    const same = await Effect.runPromise(
      entries.compareRevisions(
        fixture.ownerId,
        compareInput(sharedRevisionIds[0] ?? "", sharedRevisionIds[0] ?? ""),
      ),
    );
    assert.deepStrictEqual(same.items, []);
  });

  it("hides restricted differences from roles without naming or counting them", async () => {
    const comparison = await Effect.runPromise(
      entries.compareRevisions(
        fixture.editorId,
        compareInput(sharedRevisionIds[0] ?? "", sharedRevisionIds[1] ?? ""),
      ),
    );
    assert.deepStrictEqual(comparison.items, []);
    assert.isTrue(comparison.restrictedChanges);
    assert.notInclude(JSON.stringify(comparison), fixture.fields.secret);
    const visibleOnly = await Effect.runPromise(
      entries.compareRevisions(
        fixture.editorId,
        compareInput(sharedRevisionIds[1] ?? "", sharedRevisionIds[2] ?? ""),
      ),
    );
    assert.deepStrictEqual(
      visibleOnly.items.map((item) => String(item.fieldId)),
      [fixture.fields.note, fixture.fields.legacy],
    );
    assert.isFalse(visibleOnly.restrictedChanges);
  });

  it("rejects comparisons across scopes, entries, and locales", async () => {
    const mixed = await Effect.runPromiseExit(
      entries.compareRevisions(
        fixture.ownerId,
        compareInput(sharedRevisionIds[0] ?? "", localizedRevisionIds[0] ?? ""),
      ),
    );
    assert.strictEqual(failure(mixed).tag, "ValidationFailure");
    const crossEntry = await Effect.runPromiseExit(
      entries.compareRevisions(
        fixture.ownerId,
        compareInput(sharedRevisionIds[0] ?? "", otherEntryRevisionId),
      ),
    );
    assert.strictEqual(failure(crossEntry).tag, "NotFoundFailure");
    const crossLocale = await Effect.runPromiseExit(
      entries.compareRevisions(
        fixture.ownerId,
        compareInput(localizedRevisionIds[0] ?? "", hindiRevisionId),
      ),
    );
    assert.strictEqual(failure(crossLocale).tag, "NotFoundFailure");
  });

  it("enforces stale versions and command replay for restore", async () => {
    const draftVersion = 3;
    const restore = (commandId: string, expectedVersion: number, revisionId: string) =>
      Schema.decodeUnknownSync(RestoreEntryRevisionInput, { onExcessProperty: "error" })({
        ...scope(),
        scope: "shared",
        revisionId,
        schemaRevisionId: fixture.schemaRevisionId,
        contractHash: fixture.contractHash,
        expectedVersion,
        commandId,
      });
    const stale = await Effect.runPromiseExit(
      entries.restoreRevision(
        fixture.ownerId,
        restore(randomUUID(), draftVersion - 1, sharedRevisionIds[0] ?? ""),
        new Date("2026-11-01T12:00:00.000Z"),
        "restore-stale",
      ),
    );
    assert.strictEqual(failure(stale).tag, "EntryDraftConflictFailure");
    const commandId = randomUUID();
    const restored = await Effect.runPromise(
      entries.restoreRevision(
        fixture.ownerId,
        restore(commandId, draftVersion, sharedRevisionIds[0] ?? ""),
        new Date("2026-11-01T12:00:00.000Z"),
        "restore-first",
      ),
    );
    assert.isTrue(restored.sharedChanged);
    assert.strictEqual(restored.sharedVersion, draftVersion + 1);
    const replay = await Effect.runPromise(
      entries.restoreRevision(
        fixture.ownerId,
        restore(commandId, draftVersion, sharedRevisionIds[0] ?? ""),
        new Date("2026-11-01T12:01:00.000Z"),
        "restore-replay",
      ),
    );
    assert.strictEqual(replay.sharedRevisionId, restored.sharedRevisionId);
    const conflict = await Effect.runPromiseExit(
      entries.restoreRevision(
        fixture.ownerId,
        restore(commandId, draftVersion, sharedRevisionIds[1] ?? ""),
        new Date("2026-11-01T12:02:00.000Z"),
        "restore-conflict",
      ),
    );
    assert.strictEqual(failure(conflict).tag, "EntryCommandConflictFailure");
    const editorRestore = await Effect.runPromiseExit(
      entries.restoreRevision(
        fixture.editorId,
        restore(randomUUID(), draftVersion + 1, sharedRevisionIds[1] ?? ""),
        new Date("2026-11-01T12:03:00.000Z"),
        "restore-hidden",
      ),
    );
    assert.strictEqual(failure(editorRestore).tag, "ForbiddenFailure");
    const latest = await Effect.runPromise(
      entries.getRevision(fixture.ownerId, getInput(restored.sharedRevisionId ?? "")),
    );
    assert.strictEqual(latest.revision.restoredFromRevisionId, sharedRevisionIds[0]);
    const page = await Effect.runPromise(
      entries.listRevisions(
        fixture.ownerId,
        Schema.decodeUnknownSync(ListEntryRevisionsInput, { onExcessProperty: "error" })({
          ...scope(),
          scope: "shared",
          cursor: null,
          limit: 2,
        }),
      ),
    );
    assert.strictEqual(page.items.length, 2);
    assert.isNotNull(page.nextCursor);
  });
});

describe("entry revision compare after a schema change", () => {
  it("lists fields removed from the current schema and marks old revisions incompatible", async () => {
    const changed = await createRevisionFixture("m20a-schema");
    const changedEntryId = await createFixtureEntry(changed, "Schema change entry");
    const before = await saveFixtureDraft(changed, changedEntryId, {
      shared: { [changed.fields.note]: "Kept", [changed.fields.secret]: "Hidden" },
    });
    const withLegacy = await saveFixtureDraft(changed, changedEntryId, {
      shared: { [changed.fields.legacy]: "Removed later" },
    });
    const republished = await removeFixtureFieldAndPublish(changed, changed.fields.legacy);
    const after = await saveFixtureDraft(
      changed,
      changedEntryId,
      { shared: { [changed.fields.note]: "Kept after" } },
      { schema: republished },
    );
    const input = (from: string | null, to: string | null) =>
      Schema.decodeUnknownSync(CompareEntryRevisionsInput, { onExcessProperty: "error" })({
        projectId: changed.projectId,
        environmentId: changed.environmentId,
        collectionId: changed.collectionId,
        locale: "en",
        entryId: changedEntryId,
        fromRevisionId: from,
        toRevisionId: to,
      });
    const comparison = await Effect.runPromise(
      entries.compareRevisions(
        changed.ownerId,
        input(before.sharedRevisionId, after.sharedRevisionId),
      ),
    );
    assert.isTrue(comparison.schemaDiffers);
    assert.deepStrictEqual(
      comparison.items.map((item) => [String(item.fieldId), item.change, item.inCurrentSchema]),
      [
        [changed.fields.note, "changed", true],
        [changed.fields.legacy, "added", false],
      ],
    );
    const reverse = await Effect.runPromise(
      entries.compareRevisions(
        changed.ownerId,
        input(withLegacy.sharedRevisionId, before.sharedRevisionId),
      ),
    );
    assert.deepStrictEqual(
      reverse.items.map((item) => [String(item.fieldId), item.change, item.inCurrentSchema]),
      [[changed.fields.legacy, "removed", false]],
    );
    assert.isFalse(reverse.schemaDiffers);
    const editorView = await Effect.runPromise(
      entries.compareRevisions(
        changed.editorId,
        input(before.sharedRevisionId, after.sharedRevisionId),
      ),
    );
    assert.deepStrictEqual(
      editorView.items.map((item) => String(item.fieldId)),
      [changed.fields.note, changed.fields.legacy],
    );
    const old = await Effect.runPromise(
      entries.getRevision(
        changed.ownerId,
        Schema.decodeUnknownSync(GetEntryRevisionInput, { onExcessProperty: "error" })({
          projectId: changed.projectId,
          environmentId: changed.environmentId,
          collectionId: changed.collectionId,
          locale: "en",
          entryId: changedEntryId,
          revisionId: withLegacy.sharedRevisionId,
        }),
      ),
    );
    assert.isFalse(old.compatible);
    assert.strictEqual(Reflect.get(old.values, changed.fields.legacy), "Removed later");
    const incompatible = await Effect.runPromiseExit(
      entries.restoreRevision(
        changed.ownerId,
        Schema.decodeUnknownSync(RestoreEntryRevisionInput, { onExcessProperty: "error" })({
          projectId: changed.projectId,
          environmentId: changed.environmentId,
          collectionId: changed.collectionId,
          locale: "en",
          entryId: changedEntryId,
          scope: "shared",
          revisionId: withLegacy.sharedRevisionId,
          schemaRevisionId: republished.schemaRevisionId,
          contractHash: republished.contractHash,
          expectedVersion: after.sharedVersion,
          commandId: randomUUID(),
        }),
        new Date("2026-11-01T12:10:00.000Z"),
        "restore-incompatible",
      ),
    );
    assert.strictEqual(failure(incompatible).tag, "EntryRevisionIncompatibleFailure");
  });
});
