import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, eq } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { assert, beforeAll, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";

import {
  ControlPlaneActor,
  ControlPlaneClearPreviewTargetRequest,
  ControlPlanePutPreviewTargetRequest,
} from "../../../../src/contracts/control-plane";
import { AuthUserId, EnvironmentId, ProjectId } from "../../../../src/contracts/platform";
import { PreviewHandoffRequest } from "../../../../src/contracts/preview-handoff";
import { TelemetryLive } from "../../../../src/observability/telemetry";
import {
  issuePreviewHandoff,
  readPreviewHandoff,
} from "../../../../src/operations/preview-handoff";
import {
  makePreviewHandoffRepository,
  PreviewHandoffRepository,
} from "../../../../src/services/preview-handoff/repository";
import { makePreviewHandoffSignerLive } from "../../../../src/services/preview-handoff/signer";
import {
  makePreviewRepository,
  PreviewRepository,
} from "../../../../src/services/preview/repository";
import { makePreviewTargetRepository } from "../../../../src/services/preview-target/repository";
import { makeRateLimitManagerLive } from "../../../../src/services/rate-limit/manager";
import {
  MemoryRateLimitFallbackStoreLive,
  MemoryRateLimitStoreLive,
} from "../../../../src/services/rate-limit/store";
import {
  createFixtureEntry,
  createRevisionFixture,
  saveFixtureDraft,
  type RevisionFixture,
} from "../../../support/revision-fixture";

const targets = makePreviewTargetRepository();
const services = Layer.mergeAll(
  makePreviewHandoffSignerLive({
    activeSecret: "preview-handoff-integration-secret-32-characters-long",
  }),
  Layer.succeed(PreviewHandoffRepository, makePreviewHandoffRepository()),
  Layer.succeed(PreviewRepository, makePreviewRepository()),
  makeRateLimitManagerLive({
    fingerprintSecret: "preview-handoff-integration-rate-limit-secret-32",
  }).pipe(
    Layer.provide(
      Layer.mergeAll(MemoryRateLimitStoreLive, MemoryRateLimitFallbackStoreLive, TelemetryLive),
    ),
  ),
  TelemetryLive,
);

let fixture: RevisionFixture;
let entryId: string;
const revisions: Record<string, string> = {};

function decode<A, I>(schema: Schema.Codec<A, I>, value: unknown): A {
  return Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value);
}

function actor(id: string) {
  return decode(ControlPlaneActor, { kind: "user", id });
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
  return typeof error === "object" && error !== null && "_tag" in error
    ? String(error._tag)
    : undefined;
}

function ids() {
  return {
    projectId: decode(ProjectId, fixture.projectId),
    environmentId: decode(EnvironmentId, fixture.environmentId),
  };
}

function issue(userId: string, revisionId: string | null, locale = "en") {
  return Effect.runPromiseExit(
    issuePreviewHandoff(
      decode(AuthUserId, userId),
      {
        projectId: fixture.projectId,
        environmentId: fixture.environmentId,
        collectionId: fixture.collectionId,
        entryId,
        locale,
      },
      decode(PreviewHandoffRequest, {
        source: revisionId === null ? "current" : "revision",
        revisionId,
      }),
      "authoring",
      `m20b-handoff-${randomUUID()}`,
    ).pipe(Effect.provide(services)),
  );
}

function read(token: string) {
  return Effect.runPromiseExit(
    readPreviewHandoff(`Bearer ${token}`, `m20b-handoff-read-${randomUUID()}`).pipe(
      Effect.provide(services),
    ),
  );
}

async function putTarget(url: string, expectedVersion: number | null) {
  return Effect.runPromise(
    targets.put(
      actor(fixture.ownerId),
      ids().projectId,
      ids().environmentId,
      decode(ControlPlanePutPreviewTargetRequest, {
        commandId: randomUUID(),
        expectedVersion,
        previewUrl: url,
      }),
      `m20b-target-${randomUUID()}`,
    ),
  );
}

beforeAll(async () => {
  fixture = await createRevisionFixture("m20b-handoff");
  entryId = await createFixtureEntry(fixture, "Handoff entry");
  const first = await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.note]: "Note one" },
    localized: { [fixture.fields.title]: "Title one" },
  });
  const second = await saveFixtureDraft(fixture, entryId, {
    localized: { [fixture.fields.title]: "Title two" },
  });
  const third = await saveFixtureDraft(fixture, entryId, {
    shared: { [fixture.fields.note]: "Note two" },
  });
  revisions.sharedOne = String(first.sharedRevisionId);
  revisions.localizedOne = String(first.localizedRevisionId);
  revisions.localizedTwo = String(second.localizedRevisionId);
  revisions.sharedTwo = String(third.sharedRevisionId);
});

describe("Preview target and handoff", () => {
  it("stores a versioned Preview target with replay, conflicts, and authority", async () => {
    const missing = await Effect.runPromiseExit(
      targets.get(actor(fixture.ownerId), ids().projectId, ids().environmentId),
    );
    assert.strictEqual(failureTag(missing), "NotFoundFailure");
    const commandId = randomUUID();
    const request = decode(ControlPlanePutPreviewTargetRequest, {
      commandId,
      expectedVersion: null,
      previewUrl: "https://preview.example.test/api/ffd-preview",
    });
    const created = await Effect.runPromise(
      targets.put(actor(fixture.ownerId), ids().projectId, ids().environmentId, request, "r1"),
    );
    assert.isTrue(created.created);
    assert.strictEqual(created.target.version, 1);
    const replay = await Effect.runPromise(
      targets.put(actor(fixture.ownerId), ids().projectId, ids().environmentId, request, "r2"),
    );
    assert.isTrue(replay.replayed);
    const stale = await Effect.runPromiseExit(
      targets.put(
        actor(fixture.ownerId),
        ids().projectId,
        ids().environmentId,
        decode(ControlPlanePutPreviewTargetRequest, {
          commandId: randomUUID(),
          expectedVersion: null,
          previewUrl: "https://preview.example.test/other",
        }),
        "r3",
      ),
    );
    assert.strictEqual(failureTag(stale), "VersionConflictFailure");
    const denied = await Effect.runPromiseExit(
      targets.put(
        actor(fixture.contentAdminId),
        ids().projectId,
        ids().environmentId,
        decode(ControlPlanePutPreviewTargetRequest, {
          commandId: randomUUID(),
          expectedVersion: 1,
          previewUrl: "https://preview.example.test/other",
        }),
        "r4",
      ),
    );
    assert.strictEqual(failureTag(denied), "ForbiddenFailure");
    const audits = await db
      .select({ action: auditEvent.action })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.projectId, fixture.projectId),
          eq(auditEvent.action, "preview_target.updated"),
        ),
      );
    assert.strictEqual(audits.length, 1);
  });

  it("issues a current handoff and reads the current draft as the user", async () => {
    const issued = await issue(fixture.contentAdminId, null);
    assert.isTrue(Exit.isSuccess(issued));
    if (!Exit.isSuccess(issued)) return;
    assert.strictEqual(issued.value.previewUrl, "https://preview.example.test/api/ffd-preview");
    assert.match(issued.value.token, /^ffd_pvh_/u);
    const item = await read(issued.value.token);
    assert.isTrue(Exit.isSuccess(item));
    if (!Exit.isSuccess(item)) return;
    assert.strictEqual(item.value.id, entryId);
    assert.strictEqual(item.value.preview.source, "current");
    assert.include(JSON.stringify(item.value.data), "Title two");
  });

  it("pairs a historical revision with the other scope as it was at that time", async () => {
    const localized = await issue(fixture.ownerId, revisions.localizedTwo ?? "");
    assert.isTrue(Exit.isSuccess(localized));
    if (!Exit.isSuccess(localized)) return;
    assert.strictEqual(localized.value.localizedRevisionId, revisions.localizedTwo);
    assert.strictEqual(localized.value.sharedRevisionId, revisions.sharedOne);
    const shared = await issue(fixture.ownerId, revisions.sharedOne ?? "");
    assert.isTrue(Exit.isSuccess(shared));
    if (!Exit.isSuccess(shared)) return;
    assert.strictEqual(shared.value.localizedRevisionId, revisions.localizedOne);
    const item = await read(localized.value.token);
    assert.isTrue(Exit.isSuccess(item));
    if (Exit.isSuccess(item)) assert.strictEqual(item.value.preview.source, "revision");
  });

  it("denies users without locale access and rejects foreign revisions", async () => {
    const membership = and(
      eq(projectMembership.projectId, fixture.projectId),
      eq(projectMembership.userId, fixture.editorId),
    );
    await db.update(projectMembership).set({ localeAccessMode: "none" }).where(membership);
    try {
      assert.strictEqual(failureTag(await issue(fixture.editorId, null)), "ForbiddenFailure");
    } finally {
      await db.update(projectMembership).set({ localeAccessMode: "all" }).where(membership);
    }
    assert.strictEqual(failureTag(await issue(fixture.ownerId, randomUUID())), "NotFoundFailure");
    assert.strictEqual(failureTag(await issue("m20b-stranger", null)), "NotFoundFailure");
  });

  it("stops a token at once when the member loses access or the target changes", async () => {
    const issued = await issue(fixture.editorId, null);
    assert.isTrue(Exit.isSuccess(issued));
    if (!Exit.isSuccess(issued)) return;
    const membership = and(
      eq(projectMembership.projectId, fixture.projectId),
      eq(projectMembership.userId, fixture.editorId),
    );
    await db.update(projectMembership).set({ localeAccessMode: "none" }).where(membership);
    try {
      assert.isTrue(Exit.isFailure(await read(issued.value.token)));
    } finally {
      await db.update(projectMembership).set({ localeAccessMode: "all" }).where(membership);
    }
    assert.isTrue(Exit.isSuccess(await read(issued.value.token)));

    const current = await Effect.runPromise(
      targets.get(actor(fixture.ownerId), ids().projectId, ids().environmentId),
    );
    await putTarget("https://preview.example.test/v2", current.version);
    assert.strictEqual(failureTag(await read(issued.value.token)), "CredentialInvalidFailure");
    assert.strictEqual(
      failureTag(await read(`${issued.value.token.slice(0, -2)}xx`)),
      "CredentialInvalidFailure",
    );
  });

  it("refuses a handoff after the target is cleared", async () => {
    const current = await Effect.runPromise(
      targets.get(actor(fixture.ownerId), ids().projectId, ids().environmentId),
    );
    const cleared = await Effect.runPromise(
      targets.clear(
        actor(fixture.ownerId),
        ids().projectId,
        ids().environmentId,
        decode(ControlPlaneClearPreviewTargetRequest, {
          commandId: randomUUID(),
          expectedVersion: current.version,
        }),
        "clear",
      ),
    );
    assert.isNull(cleared.target.previewUrl);
    assert.strictEqual(cleared.target.version, current.version + 1);
    assert.strictEqual(
      failureTag(await issue(fixture.ownerId, null)),
      "PreviewTargetRequiredFailure",
    );
  });
});
