import { randomUUID } from "node:crypto";

import { assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq } from "@framerfordevs/db/query";
import { cmsEntryLocalePublication, outboxEvent } from "@framerfordevs/db/schema/cms";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Option, Schema } from "effect";

import { RestoreEntryRevisionInput } from "../../../../src/contracts/entry";
import {
  GetEntryPublicationStatusInput,
  PublishEntryInput,
  UnpublishEntryInput,
  ValidateEntryPublicationInput,
} from "../../../../src/contracts/publication";
import { makeEntryRepository } from "../../../../src/services/entry/repository";
import { makePublicationRepository } from "../../../../src/services/publication/repository";
import {
  createFixtureEntry,
  createRevisionFixture,
  saveFixtureDraft,
  type RevisionFixture,
} from "../../../support/revision-fixture";

const entries = makeEntryRepository();
const publications = makePublicationRepository();

let fixture: RevisionFixture;

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

function scope(entryId: string, locale = "en") {
  return {
    projectId: fixture.projectId,
    environmentId: fixture.environmentId,
    collectionId: fixture.collectionId,
    entryId,
    locale,
  };
}

function status(entryId: string, locale = "en") {
  return Effect.runPromise(
    publications.getStatus(
      fixture.ownerId,
      Schema.decodeUnknownSync(GetEntryPublicationStatusInput, { onExcessProperty: "error" })(
        scope(entryId, locale),
      ),
    ),
  );
}

async function publish(entryId: string, commandId = randomUUID(), locale = "en") {
  const plan = await Effect.runPromise(
    publications.validate(
      fixture.ownerId,
      Schema.decodeUnknownSync(ValidateEntryPublicationInput, { onExcessProperty: "error" })(
        scope(entryId, locale),
      ),
      new Date("2026-11-01T13:00:00.000Z"),
    ),
  );
  assert.isTrue(plan.valid);
  const input = Schema.decodeUnknownSync(PublishEntryInput, { onExcessProperty: "error" })({
    ...scope(entryId, locale),
    commandId,
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
  const result = await Effect.runPromise(
    publications.publish(fixture.ownerId, input, new Date("2026-11-01T13:01:00.000Z"), "publish"),
  );
  return { input, result };
}

async function unpublish(entryId: string, commandId = randomUUID()) {
  const current = await status(entryId);
  const input = Schema.decodeUnknownSync(UnpublishEntryInput, { onExcessProperty: "error" })({
    ...scope(entryId),
    commandId,
    expectedStateVersion: current.stateVersion,
    expectedPublicationId: current.currentPublication?.id ?? null,
  });
  const result = await Effect.runPromise(
    publications.unpublish(
      fixture.ownerId,
      input,
      new Date("2026-11-01T13:02:00.000Z"),
      "unpublish",
    ),
  );
  return { input, result };
}

async function seededEntry(label: string) {
  const entryId = await createFixtureEntry(fixture, label);
  await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.secret]: "Secret", [fixture.fields.note]: "Published note" },
    localized: { [fixture.fields.title]: "Published title" },
  });
  return entryId;
}

beforeAll(async () => {
  fixture = await createRevisionFixture("m20a-publication");
});

describe("value-based changed since publication", () => {
  it("reports changes by draft values and clears them after restoring the published values", async () => {
    const entryId = await seededEntry("Value change entry");
    const before = await status(entryId);
    assert.strictEqual(before.state, "unpublished");
    assert.strictEqual(before.stateVersion, 0);
    assert.isFalse(before.changedSincePublication);
    const { result } = await publish(entryId);
    const publishedLocalizedRevisionId = result.publication.localizedRevisionId;
    if (publishedLocalizedRevisionId === null) throw new Error("Published revision is missing.");
    const clean = await status(entryId);
    assert.isFalse(clean.sharedChanged);
    assert.isFalse(clean.localizedChanged);
    assert.isFalse(clean.changedSincePublication);

    const edited = await saveFixtureDraft(fixture, entryId, {
      localized: { [fixture.fields.title]: "Edited title" },
    });
    const dirty = await status(entryId);
    assert.isTrue(dirty.localizedChanged);
    assert.isFalse(dirty.sharedChanged);
    assert.isTrue(dirty.changedSincePublication);

    const restored = await Effect.runPromise(
      entries.restoreRevision(
        fixture.ownerId,
        Schema.decodeUnknownSync(RestoreEntryRevisionInput, { onExcessProperty: "error" })({
          ...scope(entryId),
          scope: "localized",
          revisionId: publishedLocalizedRevisionId,
          schemaRevisionId: fixture.schemaRevisionId,
          contractHash: fixture.contractHash,
          expectedVersion: edited.localizedVersion,
          commandId: randomUUID(),
        }),
        new Date("2026-11-01T13:05:00.000Z"),
        "restore-published",
      ),
    );
    assert.notStrictEqual(restored.localizedRevisionId, publishedLocalizedRevisionId);
    const afterRestore = await status(entryId);
    assert.strictEqual(afterRestore.currentLocalizedRevisionId, restored.localizedRevisionId);
    assert.isFalse(afterRestore.localizedChanged);
    assert.isFalse(afterRestore.changedSincePublication);

    await saveFixtureDraft(fixture, entryId, { shared: { [fixture.fields.note]: "Shared edit" } });
    const sharedDirty = await status(entryId);
    assert.isTrue(sharedDirty.sharedChanged);
    assert.isFalse(sharedDirty.localizedChanged);
    await saveFixtureDraft(fixture, entryId, {
      shared: { [fixture.fields.note]: "Published note" },
    });
    const sharedClean = await status(entryId);
    assert.isFalse(sharedClean.sharedChanged);
    assert.isFalse(sharedClean.changedSincePublication);
  });

  it("keeps each locale's changed flags independent", async () => {
    const entryId = await seededEntry("Locale independence entry");
    await saveFixtureDraft(
      fixture,
      entryId,
      { localized: { [fixture.fields.title]: "Hindi title" } },
      { locale: "hi" },
    );
    await publish(entryId);
    const hindi = await status(entryId, "hi");
    assert.strictEqual(hindi.state, "unpublished");
    assert.isFalse(hindi.changedSincePublication);
    await saveFixtureDraft(fixture, entryId, {
      localized: { [fixture.fields.title]: "English edit" },
    });
    assert.isTrue((await status(entryId)).localizedChanged);
    assert.isFalse((await status(entryId, "hi")).localizedChanged);
  });
});

describe("Delivery read-back", () => {
  it("verifies publish, replay, no-op, and unpublish against the committed head", async () => {
    const entryId = await seededEntry("Read-back entry");
    const commandId = randomUUID();
    const first = await publish(entryId, commandId);
    assert.deepStrictEqual(
      { ...first.result.delivery },
      { status: "verified", currentPublicationId: first.result.publication.id },
    );
    assert.isTrue(first.result.publication.current);
    const [audit] = await db
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.resourceId, first.result.publication.id),
          eq(auditEvent.action, "cms.entry.locale.published"),
        ),
      );
    const [outbox] = await db
      .select({ id: outboxEvent.id })
      .from(outboxEvent)
      .where(eq(outboxEvent.entryPublicationId, first.result.publication.id));
    assert.isDefined(audit);
    assert.isDefined(outbox);

    const replay = await Effect.runPromise(
      publications.publish(
        fixture.ownerId,
        first.input,
        new Date("2026-11-01T13:03:00.000Z"),
        "publish-replay",
      ),
    );
    assert.strictEqual(replay.delivery.status, "verified");
    assert.strictEqual(replay.publication.id, first.result.publication.id);

    const noOp = await publish(entryId);
    assert.strictEqual(noOp.result.resultKind, "no_op");
    assert.deepStrictEqual(
      { ...noOp.result.delivery },
      { status: "verified", currentPublicationId: first.result.publication.id },
    );

    const unpublishCommand = randomUUID();
    const removed = await unpublish(entryId, unpublishCommand);
    assert.strictEqual(removed.result.resultKind, "changed");
    assert.deepStrictEqual(
      { ...removed.result.delivery },
      { status: "verified", currentPublicationId: null },
    );

    const superseded = await Effect.runPromise(
      publications.publish(
        fixture.ownerId,
        first.input,
        new Date("2026-11-01T13:04:00.000Z"),
        "publish-superseded",
      ),
    );
    assert.deepStrictEqual(
      { ...superseded.delivery },
      { status: "superseded", currentPublicationId: null },
    );
    assert.isFalse(superseded.publication.current);

    const noOpUnpublish = await unpublish(entryId);
    assert.strictEqual(noOpUnpublish.result.resultKind, "no_op");
    assert.strictEqual(noOpUnpublish.result.delivery.status, "verified");

    const republished = await publish(entryId);
    assert.strictEqual(republished.result.delivery.status, "verified");
    const staleUnpublishReplay = await Effect.runPromise(
      publications.unpublish(
        fixture.ownerId,
        removed.input,
        new Date("2026-11-01T13:06:00.000Z"),
        "unpublish-replay",
      ),
    );
    assert.deepStrictEqual(
      { ...staleUnpublishReplay.delivery },
      { status: "superseded", currentPublicationId: republished.result.publication.id },
    );
    const publicationRows = await db
      .select({ id: cmsEntryLocalePublication.id })
      .from(cmsEntryLocalePublication)
      .where(eq(cmsEntryLocalePublication.entryId, entryId));
    assert.strictEqual(publicationRows.length, 2);
  });

  it("rejects stale publication state and reused command identifiers", async () => {
    const entryId = await seededEntry("Conflict entry");
    const first = await publish(entryId);
    const stale = await Effect.runPromiseExit(
      publications.unpublish(
        fixture.ownerId,
        Schema.decodeUnknownSync(UnpublishEntryInput, { onExcessProperty: "error" })({
          ...scope(entryId),
          commandId: randomUUID(),
          expectedStateVersion: 0,
          expectedPublicationId: null,
        }),
        new Date("2026-11-01T13:07:00.000Z"),
        "unpublish-stale",
      ),
    );
    assert.strictEqual(failureTag(stale), "EntryPublicationConflictFailure");
    const reused = await Effect.runPromiseExit(
      publications.unpublish(
        fixture.ownerId,
        Schema.decodeUnknownSync(UnpublishEntryInput, { onExcessProperty: "error" })({
          ...scope(entryId),
          commandId: first.input.commandId,
          expectedStateVersion: first.result.stateVersion,
          expectedPublicationId: first.result.publication.id,
        }),
        new Date("2026-11-01T13:08:00.000Z"),
        "unpublish-reused",
      ),
    );
    assert.strictEqual(failureTag(reused), "EntryCommandConflictFailure");
  });
});
