import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, eq } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { outboxEvent } from "@framerfordevs/db/schema/cms";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, Schema } from "effect";

import { AuthoringProjectScope, CmsActor } from "../../../../src/contracts/authoring";
import {
  AuthoringCollectionPresentation,
  AuthoringPublishPresentationRequest,
  type AuthoringPresentationSnapshot,
} from "../../../../src/contracts/authoring/presentation";
import {
  StudioPublishPresentationRequest,
  type StudioPresentation,
} from "../../../../src/contracts/studio-content";
import { makeAuthoringPresentationRepository } from "../../../../src/services/authoring/presentation-repository";
import { createRevisionFixture, type RevisionFixture } from "../../../support/revision-fixture";

const collectionKey = "revision_articles";
const presentation = makeAuthoringPresentationRepository();
let fixture: RevisionFixture;

function actor(id: string) {
  return Schema.decodeUnknownSync(CmsActor, { onExcessProperty: "error" })({ kind: "user", id });
}

function scope() {
  return Schema.decodeUnknownSync(AuthoringProjectScope, { onExcessProperty: "error" })({
    projectId: fixture.projectId,
    environmentId: fixture.environmentId,
  });
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

function current() {
  return Effect.runPromise(presentation.get(actor(fixture.ownerId), scope(), collectionKey));
}

function relabeled(snapshot: AuthoringPresentationSnapshot, label: string) {
  return Schema.decodeUnknownSync(AuthoringCollectionPresentation, { onExcessProperty: "error" })({
    ...snapshot.presentation,
    fields: snapshot.presentation.fields.map((field) =>
      field.fieldId === fixture.fields.title
        ? { ...field, displayLabel: label, editor: { ...field.editor, helpText: `${label} help` } }
        : field,
    ),
  });
}

function publishRequest(
  snapshot: AuthoringPresentationSnapshot,
  value: AuthoringCollectionPresentation,
) {
  return Schema.decodeUnknownSync(AuthoringPublishPresentationRequest, {
    onExcessProperty: "error",
  })({
    commandId: randomUUID(),
    expectedRevisionId: snapshot.revision.revisionId,
    expectedSequence: snapshot.revision.sequence,
    presentation: value,
  });
}

function publishAs(
  userId: string,
  snapshot: AuthoringPresentationSnapshot,
  value: AuthoringCollectionPresentation,
) {
  return Effect.runPromiseExit(
    presentation.publish(
      actor(userId),
      scope(),
      collectionKey,
      publishRequest(snapshot, value),
      new Date("2026-11-23T10:00:00.000Z"),
      `m20b-presentation-${randomUUID()}`,
    ),
  );
}

function studioRequest(
  snapshot: StudioPresentation,
  label: string,
  commandId: string = randomUUID(),
) {
  return Schema.decodeUnknownSync(StudioPublishPresentationRequest, { onExcessProperty: "error" })({
    commandId,
    expectedRevisionId: snapshot.revisionId,
    expectedSequence: snapshot.sequence,
    presentation: {
      displayName: snapshot.presentation.displayName,
      description: snapshot.presentation.description,
      fields: snapshot.presentation.fields.map((field) => ({
        fieldId: field.fieldId,
        displayLabel: field.fieldId === fixture.fields.title ? label : field.displayLabel,
        position: field.position,
        helpText: field.helpText,
        placeholder: field.placeholder,
        enumOptions: field.enumOptions,
      })),
      layout: snapshot.presentation.layout,
    },
  });
}

function roleLists(snapshot: AuthoringPresentationSnapshot) {
  return {
    fields: snapshot.presentation.fields.map((field) => [
      field.fieldId,
      field.editor.visibleToRoles,
      field.editor.editableByRoles,
    ]),
    tabs: snapshot.presentation.editorLayout.tabs.map((tab) => [
      tab.id,
      tab.visibleToRoles,
      tab.groups.map((group) => [
        group.id,
        group.visibleToRoles,
        group.fields.map((placement) => [placement.fieldId, placement.visibleToRoles]),
      ]),
    ]),
  };
}

beforeAll(async () => {
  fixture = await createRevisionFixture("m20b-presentation");
});

describe("editorial presentation publication", () => {
  it("lets content_admin publish labels with attribution, audit, and outbox in one revision", async () => {
    const before = await current();
    const exit = await publishAs(fixture.contentAdminId, before, relabeled(before, "Headline"));
    assert.isTrue(Exit.isSuccess(exit));
    if (!Exit.isSuccess(exit)) return;
    const published = exit.value;
    assert.isFalse(published.noOp);
    assert.strictEqual(published.revision.sequence, before.revision.sequence + 1);
    assert.strictEqual(published.revision.contractHash, before.revision.contractHash);
    const title = published.presentation.fields.find(
      (field) => field.fieldId === fixture.fields.title,
    );
    assert.strictEqual(title?.displayLabel, "Headline");

    const audits = await db
      .select({ actorId: auditEvent.actorId })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.resourceId, fixture.collectionId),
          eq(auditEvent.action, "cms.schema.presentation.published"),
          eq(auditEvent.actorId, fixture.contentAdminId),
        ),
      );
    assert.strictEqual(audits.length, 1);
    const events = await db
      .select({ eventType: outboxEvent.eventType })
      .from(outboxEvent)
      .where(eq(outboxEvent.schemaRevisionId, published.revision.revisionId));
    assert.deepStrictEqual(events, [{ eventType: "cms.schema.published" }]);
  });

  it("rejects an editorial role-list change but accepts the same change from the owner", async () => {
    const before = await current();
    const changed = Schema.decodeUnknownSync(AuthoringCollectionPresentation, {
      onExcessProperty: "error",
    })({
      ...before.presentation,
      fields: before.presentation.fields.map((field) =>
        field.fieldId === fixture.fields.note
          ? {
              ...field,
              editor: {
                ...field.editor,
                editableByRoles: field.editor.editableByRoles.filter((role) => role !== "editor"),
              },
            }
          : field,
      ),
    });
    const editorial = await publishAs(fixture.contentAdminId, before, changed);
    assert.strictEqual(failureTag(editorial), "PresentationRoleVisibilityForbiddenFailure");
    const structural = await publishAs(fixture.ownerId, before, changed);
    assert.isTrue(Exit.isSuccess(structural));
  });

  it("denies roles without presentation authority and content_admin without all-locale access", async () => {
    const before = await current();
    const value = relabeled(before, "Denied");
    assert.strictEqual(
      failureTag(await publishAs(fixture.editorId, before, value)),
      "ForbiddenFailure",
    );
    assert.strictEqual(
      failureTag(await publishAs(fixture.reviewerId, before, value)),
      "ForbiddenFailure",
    );
    const studioRead = await Effect.runPromiseExit(
      presentation.getStudio(actor(fixture.editorId), scope(), collectionKey),
    );
    assert.strictEqual(failureTag(studioRead), "ForbiddenFailure");

    const membership = and(
      eq(projectMembership.projectId, fixture.projectId),
      eq(projectMembership.userId, fixture.contentAdminId),
    );
    await db.update(projectMembership).set({ localeAccessMode: "selected" }).where(membership);
    try {
      assert.strictEqual(
        failureTag(await publishAs(fixture.contentAdminId, before, value)),
        "ForbiddenFailure",
      );
    } finally {
      await db.update(projectMembership).set({ localeAccessMode: "all" }).where(membership);
    }
  });

  it("publishes a Studio edit without role lists, then replays and rejects a conflicting replay", async () => {
    const before = await current();
    const studio = await Effect.runPromise(
      presentation.getStudio(actor(fixture.contentAdminId), scope(), collectionKey),
    );
    assert.strictEqual(studio.revisionId, before.revision.revisionId);
    assert.notInclude(JSON.stringify(studio), "visibleToRoles");
    const request = studioRequest(studio, "Studio headline");
    const publish = (value: StudioPublishPresentationRequest) =>
      Effect.runPromiseExit(
        presentation.publishStudio(
          actor(fixture.contentAdminId),
          scope(),
          collectionKey,
          value,
          new Date("2026-11-23T10:05:00.000Z"),
          `m20b-studio-presentation-${randomUUID()}`,
        ),
      );
    const first = await publish(request);
    assert.isTrue(Exit.isSuccess(first));
    if (!Exit.isSuccess(first)) return;
    assert.isFalse(first.value.replayed);
    assert.strictEqual(first.value.presentation.sequence, studio.sequence + 1);
    const after = await current();
    assert.deepStrictEqual(roleLists(after), roleLists(before));
    assert.strictEqual(
      after.presentation.fields.find((field) => field.fieldId === fixture.fields.title)
        ?.displayLabel,
      "Studio headline",
    );

    const replay = await publish(request);
    assert.isTrue(Exit.isSuccess(replay) && replay.value.replayed);
    const conflict = await publish(studioRequest(studio, "Other headline", request.commandId));
    assert.strictEqual(failureTag(conflict), "AuthoringCommandConflictFailure");
  });

  it("restricts editorial access when the owner hides a field from content_admin", async () => {
    const before = await current();
    const ownerRoles = ["owner", "developer"] as const;
    const hidden = Schema.decodeUnknownSync(AuthoringCollectionPresentation, {
      onExcessProperty: "error",
    })({
      ...before.presentation,
      fields: before.presentation.fields.map((field) =>
        field.fieldId === fixture.fields.legacy
          ? {
              ...field,
              editor: { ...field.editor, visibleToRoles: ownerRoles, editableByRoles: ownerRoles },
            }
          : field,
      ),
      editorLayout: {
        ...before.presentation.editorLayout,
        tabs: before.presentation.editorLayout.tabs.map((tab) => ({
          ...tab,
          groups: tab.groups.map((group) => ({
            ...group,
            fields: group.fields.map((placement) =>
              placement.fieldId === fixture.fields.legacy
                ? { ...placement, visibleToRoles: ownerRoles }
                : placement,
            ),
          })),
        })),
      },
    });
    const structural = await publishAs(fixture.ownerId, before, hidden);
    assert.isTrue(Exit.isSuccess(structural));

    const restricted = await current();
    assert.strictEqual(
      failureTag(
        await publishAs(fixture.contentAdminId, restricted, relabeled(restricted, "Hidden")),
      ),
      "PresentationScopeRestrictedFailure",
    );
    const studioRead = await Effect.runPromiseExit(
      presentation.getStudio(actor(fixture.contentAdminId), scope(), collectionKey),
    );
    assert.strictEqual(failureTag(studioRead), "PresentationScopeRestrictedFailure");
    const ownerRead = await Effect.runPromiseExit(
      presentation.getStudio(actor(fixture.ownerId), scope(), collectionKey),
    );
    assert.isTrue(Exit.isSuccess(ownerRead));
  });
});
