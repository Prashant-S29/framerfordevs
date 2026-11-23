import { randomUUID } from "node:crypto";

import { assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { environmentPreviewTarget } from "@framerfordevs/db/schema/control-plane";
import { project, projectCapability } from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";

import { PreviewTargetUrl } from "../../../../src/contracts/control-plane";
import { EnvironmentId, ProjectId } from "../../../../src/contracts/platform";
import { RateLimitDecision, rateLimitPolicies } from "../../../../src/contracts/rate-limit";
import {
  StudioCollectionLocaleScope,
  StudioListEntriesQuery,
} from "../../../../src/contracts/studio-content";
import { ApplicationLogger } from "../../../../src/observability/logger";
import { browseStudioEntries } from "../../../../src/operations/studio-content-public";
import { RateLimitManager } from "../../../../src/services/rate-limit/manager";
import { makeSchemaRepository, SchemaRepository } from "../../../../src/services/schema/repository";
import type { StudioEditorPrincipal } from "../../../../src/services/studio/principal-authenticator";
import { makeStudioRepository, StudioRepository } from "../../../../src/services/studio/repository";
import { makeStudioContentCursorSignerLive } from "../../../../src/services/studio-content/cursor-signer";
import {
  makeStudioContentRepository,
  StudioContentRepository,
} from "../../../../src/services/studio-content/repository";
import { createRevisionFixture, type RevisionFixture } from "../../../support/revision-fixture";

let fixture: RevisionFixture;
let outsiderId = "";
const studio = makeStudioRepository();
const rateLimitIdentities: Array<string> = [];

function editor(userId: string): StudioEditorPrincipal {
  return { kind: "studio_editor_user", userId, expiresAtEpochSeconds: 1_900_000_000 };
}

function bootstrap(principal: StudioEditorPrincipal, environmentId = fixture.environmentId) {
  return studio.getBootstrap({
    principal,
    projectId: ProjectId.make(fixture.projectId),
    environmentId: EnvironmentId.make(environmentId),
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

const services = Layer.mergeAll(
  Layer.succeed(StudioRepository, studio),
  Layer.succeed(RateLimitManager, {
    evaluate: (input) =>
      Effect.sync(() => {
        rateLimitIdentities.push(input.identity);
        return Schema.decodeUnknownSync(RateLimitDecision, { onExcessProperty: "error" })({
          allowed: true,
          policy: input.policy,
          cost: input.cost,
          limit: rateLimitPolicies[input.policy].limitPerInterval,
          remaining: rateLimitPolicies[input.policy].capacity,
          resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
          retryAfterSeconds: null,
          enforcementMode: "memory",
        });
      }),
    reset: () => Effect.void,
    retainedFallbackEntryCount: Effect.succeed(0),
  }),
  Layer.succeed(ApplicationLogger, { info: () => Effect.void, error: () => Effect.void }),
  Layer.succeed(StudioContentRepository, makeStudioContentRepository()),
  Layer.succeed(SchemaRepository, makeSchemaRepository()),
  makeStudioContentCursorSignerLive({
    activeSecret: "studio-content-cursor-editor-principal-secret-32-bytes",
  }),
);

beforeAll(async () => {
  fixture = await createRevisionFixture("m20c-editor-principal");
  outsiderId = `m20c-outsider-${randomUUID()}`;
  await db.insert(user).values({
    id: outsiderId,
    name: "Outsider",
    email: `${outsiderId}@example.test`,
    emailVerified: true,
  });
});

describe("Studio local editor principal", () => {
  it.effect("returns a local editor host for the workspace owner without registration", () =>
    Effect.gen(function* () {
      const result = yield* bootstrap(editor(fixture.ownerId));
      assert.deepStrictEqual({ ...result.host }, { kind: "local_editor", previewUrl: null });
      assert.strictEqual(result.role, "owner");
      assert.strictEqual(result.project.id, fixture.projectId);
      assert.strictEqual(result.session.expiresAt, new Date(1_900_000_000_000).toISOString());
    }),
  );

  it.effect("returns the exact project role for a project member", () =>
    Effect.gen(function* () {
      const result = yield* bootstrap(editor(fixture.editorId));
      assert.strictEqual(result.role, "editor");
      assert.deepStrictEqual(result.effectiveActions, ["project.read"]);
    }),
  );

  it.effect("returns the environment Preview URL", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db.insert(environmentPreviewTarget).values({
          workspaceId: fixture.workspaceId,
          projectId: fixture.projectId,
          environmentId: fixture.environmentId,
          previewUrl: Schema.decodeUnknownSync(PreviewTargetUrl)(
            "https://www.example.test/api/ffd-preview",
          ),
          createdByUserId: fixture.ownerId,
          changedByUserId: fixture.ownerId,
        }),
      );
      const result = yield* bootstrap(editor(fixture.reviewerId)).pipe(
        Effect.ensuring(
          Effect.promise(() =>
            db
              .delete(environmentPreviewTarget)
              .where(eq(environmentPreviewTarget.environmentId, fixture.environmentId)),
          ),
        ),
      );
      assert.strictEqual(
        result.host.kind === "local_editor" ? result.host.previewUrl : "mounted",
        "https://www.example.test/api/ffd-preview",
      );
    }),
  );

  it.effect("hides the project from a user who is not a member", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(bootstrap(editor(outsiderId)));
      assert.strictEqual(failureTag(exit), "NotFoundFailure");
    }),
  );

  it.effect("rejects an environment outside the project", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(bootstrap(editor(fixture.ownerId), randomUUID()));
      assert.strictEqual(failureTag(exit), "NotFoundFailure");
    }),
  );

  it.effect("rejects a removed project member on the next request", () =>
    Effect.gen(function* () {
      const membership = and(
        eq(projectMembership.projectId, fixture.projectId),
        eq(projectMembership.userId, fixture.contentAdminId),
      );
      yield* bootstrap(editor(fixture.contentAdminId));
      yield* Effect.promise(() =>
        db
          .update(projectMembership)
          .set({ removedAt: new Date(), removedByUserId: fixture.ownerId })
          .where(membership),
      );
      const exit = yield* Effect.exit(bootstrap(editor(fixture.contentAdminId))).pipe(
        Effect.ensuring(
          Effect.promise(() =>
            db
              .update(projectMembership)
              .set({ removedAt: null, removedByUserId: null })
              .where(membership),
          ),
        ),
      );
      assert.strictEqual(failureTag(exit), "NotFoundFailure");
    }),
  );

  it.effect("rejects an archived project and a disabled CMS", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        db
          .update(project)
          .set({ archivedAt: new Date(), archivedByUserId: fixture.ownerId })
          .where(eq(project.id, fixture.projectId)),
      );
      const archived = yield* Effect.exit(bootstrap(editor(fixture.ownerId))).pipe(
        Effect.ensuring(
          Effect.promise(() =>
            db
              .update(project)
              .set({ archivedAt: null, archivedByUserId: null })
              .where(eq(project.id, fixture.projectId)),
          ),
        ),
      );
      assert.strictEqual(failureTag(archived), "NotFoundFailure");

      const capability = and(
        eq(projectCapability.projectId, fixture.projectId),
        eq(projectCapability.key, "cms"),
      );
      yield* Effect.promise(() =>
        db.update(projectCapability).set({ status: "disabled" }).where(capability),
      );
      const disabled = yield* Effect.exit(bootstrap(editor(fixture.ownerId))).pipe(
        Effect.ensuring(
          Effect.promise(() =>
            db.update(projectCapability).set({ status: "enabled" }).where(capability),
          ),
        ),
      );
      assert.strictEqual(failureTag(disabled), "CmsCapabilityRequiredFailure");
    }),
  );

  it.effect("authorizes Studio Content by role and rate-limits by editor identity", () =>
    Effect.gen(function* () {
      const scope = Schema.decodeUnknownSync(StudioCollectionLocaleScope, {
        onExcessProperty: "error",
      })({
        projectId: fixture.projectId,
        environmentId: fixture.environmentId,
        collectionId: fixture.collectionId,
        locale: "en",
      });
      const query = Schema.decodeUnknownSync(StudioListEntriesQuery, {
        onExcessProperty: "error",
      })({});
      rateLimitIdentities.length = 0;
      const page = yield* browseStudioEntries(editor(fixture.editorId), scope, query, new Date());
      assert.isArray(page.items);
      assert.include(rateLimitIdentities, `editor:${fixture.editorId}`);

      const denied = yield* Effect.exit(
        browseStudioEntries(editor(outsiderId), scope, query, new Date()),
      );
      assert.strictEqual(failureTag(denied), "NotFoundFailure");
    }).pipe(Effect.provide(services)),
  );
});
