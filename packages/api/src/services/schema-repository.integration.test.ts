import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { eq, or, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import {
  cmsCollection,
  cmsCollectionField,
  cmsCollectionSchemaHead,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Cause, Effect, Exit, Option, Schema } from "effect";

import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  type Project as ProjectModel,
  type Workspace as WorkspaceModel,
} from "../contracts/platform";
import {
  CreateCollectionFieldInput,
  CreateCollectionInput,
  GetCollectionDraftInput,
  GetCollectionInput,
  GetLatestPublishedSchemaInput,
  GetPublishedSchemaRevisionInput,
  ListCollectionsInput,
  PublishCollectionSchemaInput,
  RemoveCollectionFieldInput,
  ReorderCollectionFieldsInput,
  UpdateCollectionFieldInput,
  UpdateCollectionInput,
  ValidateCollectionSchemaInput,
  type CmsCollection as CmsCollectionModel,
} from "../contracts/schemas";
import { makePlatformRepository } from "./platform-repository";
import { makeSchemaRepository } from "./schema-repository";

const suffix = randomUUID();
const ownerId = `m5-schema-owner-${suffix}`;
const foreignId = `m5-schema-foreign-${suffix}`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const foreignActor = Schema.decodeUnknownSync(AuthUserId)(foreignId);
const platform = makePlatformRepository();
const schemas = makeSchemaRepository();

let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;
let disabledProject: ProjectModel | undefined;
let foreignWorkspace: WorkspaceModel | undefined;
let foreignProject: ProjectModel | undefined;
let firstCollection: CmsCollectionModel | undefined;

function required<A>(value: A | undefined, label: string): A {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  if (typeof failure === "object" && failure !== null && "_tag" in failure) {
    return typeof failure._tag === "string" ? failure._tag : undefined;
  }
  return undefined;
}

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: ownerId,
      name: "M5 Schema Owner",
      email: `m5-schema-owner-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: foreignId,
      name: "M5 Schema Foreign",
      email: `m5-schema-foreign-${suffix}@example.test`,
      emailVerified: true,
    },
  ]);
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      ownerActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M5 Schema Workspace" }),
      "request-m5-schema-workspace",
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M5 Schema Project",
        key: `schema-${suffix.slice(0, 8)}`,
        description: null,
      }),
      "request-m5-schema-project",
    ),
  );
  await Effect.runPromise(
    platform.enableCapability(
      ownerActor,
      Schema.decodeUnknownSync(EnableCapabilityInput)({
        projectId: required(projectModel, "project").id,
        capability: "cms",
      }),
      "request-m5-schema-enable",
    ),
  );
  disabledProject = await Effect.runPromise(
    platform.createProject(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M5 Disabled Project",
        key: `disabled-${suffix.slice(0, 8)}`,
        description: null,
      }),
      "request-m5-disabled-project",
    ),
  );
  foreignWorkspace = await Effect.runPromise(
    platform.createWorkspace(
      foreignActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M5 Foreign Workspace" }),
      "request-m5-foreign-workspace",
    ),
  );
  foreignProject = await Effect.runPromise(
    platform.createProject(
      foreignActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(foreignWorkspace, "foreign workspace").id,
        name: "M5 Foreign Project",
        key: `foreign-${suffix.slice(0, 8)}`,
        description: null,
      }),
      "request-m5-foreign-project",
    ),
  );
  await Effect.runPromise(
    platform.enableCapability(
      foreignActor,
      Schema.decodeUnknownSync(EnableCapabilityInput)({
        projectId: required(foreignProject, "foreign project").id,
        capability: "cms",
      }),
      "request-m5-foreign-enable",
    ),
  );
});

afterAll(async () => {
  const actorIds = [ownerId, foreignId];
  const ownedCollections = sql`select id from cms_collection where created_by_user_id in (${ownerId}, ${foreignId})`;
  await db.delete(outboxEvent).where(sql`${outboxEvent.subjectId} in (${ownedCollections})`);
  await db
    .delete(cmsCollectionSchemaHead)
    .where(sql`${cmsCollectionSchemaHead.collectionId} in (${ownedCollections})`);
  await db
    .delete(cmsSchemaRevisionField)
    .where(sql`${cmsSchemaRevisionField.collectionId} in (${ownedCollections})`);
  await db
    .delete(cmsSchemaRevision)
    .where(sql`${cmsSchemaRevision.collectionId} in (${ownedCollections})`);
  await db
    .delete(cmsCollectionField)
    .where(sql`${cmsCollectionField.collectionId} in (${ownedCollections})`);
  await db
    .delete(cmsCollection)
    .where(
      or(eq(cmsCollection.createdByUserId, ownerId), eq(cmsCollection.createdByUserId, foreignId)),
    );
  await db
    .delete(auditEvent)
    .where(or(...actorIds.map((actorId) => eq(auditEvent.actorId, actorId))));
  await db
    .delete(projectCapability)
    .where(or(...actorIds.map((actorId) => eq(projectCapability.changedByUserId, actorId))));
  await db
    .delete(projectLocale)
    .where(or(...actorIds.map((actorId) => eq(projectLocale.createdByUserId, actorId))));
  await db
    .delete(projectMembership)
    .where(or(...actorIds.map((actorId) => eq(projectMembership.userId, actorId))));
  await db
    .delete(environment)
    .where(or(...actorIds.map((actorId) => eq(environment.createdByUserId, actorId))));
  await db
    .delete(project)
    .where(or(...actorIds.map((actorId) => eq(project.createdByUserId, actorId))));
  await db
    .delete(workspaceMembership)
    .where(or(...actorIds.map((actorId) => eq(workspaceMembership.userId, actorId))));
  await db
    .delete(workspace)
    .where(or(...actorIds.map((actorId) => eq(workspace.createdByUserId, actorId))));
  await db.delete(user).where(or(...actorIds.map((actorId) => eq(user.id, actorId))));
  await db.$client.end();
});

describe.sequential("schema repository PostgreSQL integration", () => {
  it.effect("atomically creates a collection, schema head, and payload-free audit", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      firstCollection = yield* schemas.createCollection(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionInput)({
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          apiKey: "blog_posts",
          displayName: "Blog posts",
          description: "Editorial posts",
        }),
        new Date("2026-08-01T12:00:00.000Z"),
        "request-m5-collection-create",
      );

      assert.strictEqual(firstCollection.draftVersion, 1);
      assert.isNull(firstCollection.currentPublishedRevisionId);
      const [head] = yield* Effect.promise(() =>
        db
          .select()
          .from(cmsCollectionSchemaHead)
          .where(
            eq(cmsCollectionSchemaHead.collectionId, required(firstCollection, "collection").id),
          ),
      );
      const [audit] = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(eq(auditEvent.requestId, "request-m5-collection-create")),
      );
      assert.strictEqual(head?.draftVersion, 1);
      assert.strictEqual(audit?.action, "cms.collection.created");
      assert.strictEqual(audit?.resourceId, firstCollection.id);
    }),
  );

  it.effect("reserves collection keys and requires an enabled CMS capability", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      const duplicate = yield* Effect.exit(
        schemas.createCollection(
          ownerActor,
          yield* Schema.decodeUnknown(CreateCollectionInput)({
            projectId: currentProject.id,
            environmentId: currentProject.environment.id,
            apiKey: "blog_posts",
            displayName: "Duplicate",
            description: null,
          }),
          new Date(),
          "request-m5-duplicate",
        ),
      );
      const disabled = required(disabledProject, "disabled project");
      const capabilityRequired = yield* Effect.exit(
        schemas.createCollection(
          ownerActor,
          yield* Schema.decodeUnknown(CreateCollectionInput)({
            projectId: disabled.id,
            environmentId: disabled.environment.id,
            apiKey: "posts",
            displayName: "Posts",
            description: null,
          }),
          new Date(),
          "request-m5-disabled",
        ),
      );

      const foreign = required(foreignProject, "foreign project");
      const sameKeyInOtherEnvironment = yield* schemas.createCollection(
        foreignActor,
        yield* Schema.decodeUnknown(CreateCollectionInput)({
          projectId: foreign.id,
          environmentId: foreign.environment.id,
          apiKey: "blog_posts",
          displayName: "Foreign blog posts",
          description: null,
        }),
        new Date(),
        "request-m5-foreign-same-key",
      );

      assert.strictEqual(failureTag(duplicate), "CollectionKeyConflictFailure");
      assert.strictEqual(failureTag(capabilityRequired), "CmsCapabilityRequiredFailure");
      assert.strictEqual(sameKeyInOtherEnvironment.apiKey, "blog_posts");
    }),
  );

  it.effect("uses stable keyset pagination and non-enumerating tenant checks", () =>
    Effect.gen(function* () {
      const currentProject = required(projectModel, "project");
      yield* schemas.createCollection(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionInput)({
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          apiKey: "authors",
          displayName: "Authors",
          description: null,
        }),
        new Date("2026-08-01T12:00:01.000Z"),
        "request-m5-authors",
      );
      const firstPage = yield* schemas.listCollections(
        ownerActor,
        yield* Schema.decodeUnknown(ListCollectionsInput)({
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          cursor: null,
          limit: 1,
        }),
      );
      const secondPage = yield* schemas.listCollections(
        ownerActor,
        yield* Schema.decodeUnknown(ListCollectionsInput)({
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          cursor: firstPage.nextCursor,
          limit: 1,
        }),
      );
      const foreign = required(foreignProject, "foreign project");
      const crossTenant = yield* Effect.exit(
        schemas.getCollection(
          ownerActor,
          yield* Schema.decodeUnknown(GetCollectionInput)({
            projectId: foreign.id,
            environmentId: foreign.environment.id,
            collectionId: required(firstCollection, "collection").id,
          }),
        ),
      );

      assert.isNotNull(firstPage.nextCursor);
      assert.notStrictEqual(firstPage.items[0]?.id, secondPage.items[0]?.id);
      assert.strictEqual(failureTag(crossTenant), "NotFoundFailure");
    }),
  );

  it.effect("increments metadata and draft versions once while keeping no-op updates quiet", () =>
    Effect.gen(function* () {
      const collection = required(firstCollection, "collection");
      const noOp = yield* schemas.updateCollection(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateCollectionInput)({
          projectId: collection.projectId,
          environmentId: collection.environmentId,
          collectionId: collection.id,
          version: collection.version,
          draftVersion: collection.draftVersion,
          displayName: collection.displayName,
          description: collection.description,
        }),
        new Date("2026-08-01T12:01:00.000Z"),
        "request-m5-noop",
      );
      const updated = yield* schemas.updateCollection(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateCollectionInput)({
          projectId: collection.projectId,
          environmentId: collection.environmentId,
          collectionId: collection.id,
          version: noOp.version,
          draftVersion: noOp.draftVersion,
          displayName: "Articles",
          description: "Published articles",
        }),
        new Date("2026-08-01T12:02:00.000Z"),
        "request-m5-update",
      );
      const stale = yield* Effect.exit(
        schemas.updateCollection(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateCollectionInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
            version: collection.version,
            draftVersion: collection.draftVersion,
            displayName: "Stale",
            description: null,
          }),
          new Date(),
          "request-m5-stale",
        ),
      );

      assert.strictEqual(noOp.version, collection.version);
      assert.strictEqual(updated.version, collection.version + 1);
      assert.strictEqual(updated.draftVersion, collection.draftVersion + 1);
      assert.strictEqual(failureTag(stale), "VersionConflictFailure");
    }),
  );

  it.effect(
    "mutates bounded draft fields with stable identities, no-op suppression, and complete-set reorder",
    () =>
      Effect.gen(function* () {
        const collection = required(firstCollection, "collection");
        const current = yield* schemas.getCollection(
          ownerActor,
          yield* Schema.decodeUnknown(GetCollectionInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
          }),
        );
        const titleDraft = yield* schemas.createField(
          ownerActor,
          yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
            draftVersion: current.draftVersion,
            apiKey: "title",
            displayLabel: "Title",
            kind: "short_text",
            required: true,
            localization: "localized",
            deprecated: false,
            configuration: {},
          }),
          new Date("2026-08-01T13:00:00.000Z"),
          "request-m5-field-title",
        );
        const title = titleDraft.fields[0];
        if (!title) throw new Error("Title field was not created.");
        const noOp = yield* schemas.updateField(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateCollectionFieldInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
            fieldId: title.id,
            draftVersion: titleDraft.collection.draftVersion,
            apiKey: title.apiKey,
            displayLabel: title.displayLabel,
            kind: title.kind,
            required: title.required,
            localization: title.localization,
            deprecated: title.deprecated,
            configuration: title.configuration,
          }),
          new Date(),
          "request-m5-field-noop",
        );
        const summaryDraft = yield* schemas.createField(
          ownerActor,
          yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
            draftVersion: noOp.collection.draftVersion,
            apiKey: "summary",
            displayLabel: "Summary",
            kind: "short_text",
            required: false,
            localization: "localized",
            deprecated: false,
            configuration: {},
          }),
          new Date("2026-08-01T13:01:00.000Z"),
          "request-m5-field-summary",
        );
        const summary = summaryDraft.fields[1];
        if (!summary) throw new Error("Summary field was not created.");
        const reordered = yield* schemas.reorderFields(
          ownerActor,
          yield* Schema.decodeUnknown(ReorderCollectionFieldsInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
            draftVersion: summaryDraft.collection.draftVersion,
            fieldIds: [summary.id, title.id],
          }),
          new Date("2026-08-01T13:02:00.000Z"),
          "request-m5-field-reorder",
        );

        assert.strictEqual(noOp.collection.draftVersion, titleDraft.collection.draftVersion);
        assert.strictEqual(reordered.fields[0]?.id, summary.id);
        assert.strictEqual(reordered.fields[1]?.id, title.id);
        assert.strictEqual(
          reordered.collection.draftVersion,
          summaryDraft.collection.draftVersion + 1,
        );
      }),
  );

  it.effect("rolls back every publication artifact after injected transaction failures", () =>
    Effect.gen(function* () {
      const collection = required(firstCollection, "collection");
      const scope = {
        projectId: collection.projectId,
        environmentId: collection.environmentId,
        collectionId: collection.id,
      };
      const draft = yield* schemas.getDraft(
        ownerActor,
        yield* Schema.decodeUnknown(GetCollectionDraftInput)(scope),
      );
      const validation = yield* schemas.validateSchema(
        ownerActor,
        yield* Schema.decodeUnknown(ValidateCollectionSchemaInput)(scope),
      );
      const acknowledgedChangeIds = validation.changes.items
        .filter((change) => change.classification !== "non_breaking")
        .map((change) => change.changeId);

      yield* Effect.forEach(
        ["revision", "snapshots", "head", "audit", "outbox"] as const,
        (step) =>
          Effect.gen(function* () {
            const injected = makeSchemaRepository({ testFailPublicationAfter: step });
            const exit = yield* Effect.exit(
              injected.publishSchema(
                ownerActor,
                yield* Schema.decodeUnknown(PublishCollectionSchemaInput)({
                  ...scope,
                  draftVersion: draft.collection.draftVersion,
                  expectedPublishedRevisionId: null,
                  commandId: randomUUID(),
                  acknowledgedChangeIds,
                }),
                new Date(),
                `request-m5-failure-${step}`,
              ),
            );
            assert.strictEqual(failureTag(exit), "DatabaseFailure");
            const countResult = yield* Effect.promise(() =>
              db.execute(sql`select
                (select count(*)::int from cms_schema_revision where collection_id = ${collection.id}) as revisions,
                (select count(*)::int from cms_schema_revision_field where collection_id = ${collection.id}) as snapshots,
                (select count(*)::int from outbox_event where subject_id = ${collection.id}) as events,
                (select count(*)::int from audit_event where request_id = ${`request-m5-failure-${step}`}) as audits`),
            );
            const counts = yield* Schema.decodeUnknown(
              Schema.Struct({
                revisions: Schema.Number,
                snapshots: Schema.Number,
                events: Schema.Number,
                audits: Schema.Number,
              }),
            )(countResult.rows[0]);
            assert.strictEqual(counts.revisions, 0);
            assert.strictEqual(counts.snapshots, 0);
            assert.strictEqual(counts.events, 0);
            assert.strictEqual(counts.audits, 0);
          }),
        { concurrency: 1 },
      );
    }),
  );

  it.effect(
    "publishes immutable revisions atomically with exact acknowledgement and idempotent commands",
    () =>
      Effect.gen(function* () {
        const collection = required(firstCollection, "collection");
        const scope = {
          projectId: collection.projectId,
          environmentId: collection.environmentId,
          collectionId: collection.id,
        };
        const draft = yield* schemas.getDraft(
          ownerActor,
          yield* Schema.decodeUnknown(GetCollectionDraftInput)(scope),
        );
        const validation = yield* schemas.validateSchema(
          ownerActor,
          yield* Schema.decodeUnknown(ValidateCollectionSchemaInput)(scope),
        );
        assert.isTrue(validation.valid);
        assert.isTrue(validation.changes.requiresAcknowledgement);
        const baseInput = {
          ...scope,
          draftVersion: draft.collection.draftVersion,
          expectedPublishedRevisionId: null,
          commandId: randomUUID(),
          acknowledgedChangeIds: validation.changes.items
            .filter((change) => change.classification !== "non_breaking")
            .map((change) => change.changeId),
        };
        const missingAcknowledgement = yield* Effect.exit(
          schemas.publishSchema(
            ownerActor,
            yield* Schema.decodeUnknown(PublishCollectionSchemaInput)({
              ...baseInput,
              acknowledgedChangeIds: [],
            }),
            new Date(),
            "request-m5-publish-missing",
          ),
        );
        assert.strictEqual(
          failureTag(missingAcknowledgement),
          "SchemaChangeAcknowledgementRequiredFailure",
        );

        const decodedInput = yield* Schema.decodeUnknown(PublishCollectionSchemaInput)(baseInput);
        const published = yield* schemas.publishSchema(
          ownerActor,
          decodedInput,
          new Date("2026-08-01T14:00:00.000Z"),
          "request-m5-publish",
        );
        const replay = yield* schemas.publishSchema(
          ownerActor,
          decodedInput,
          new Date("2026-08-01T14:01:00.000Z"),
          "request-m5-publish-replay",
        );
        const latest = yield* schemas.getLatestPublished(
          ownerActor,
          yield* Schema.decodeUnknown(GetLatestPublishedSchemaInput)(scope),
        );
        const original = yield* schemas.getPublishedRevision(
          ownerActor,
          yield* Schema.decodeUnknown(GetPublishedSchemaRevisionInput)({
            ...scope,
            revisionId: published.id,
          }),
        );
        const events = yield* Effect.promise(() =>
          db.select().from(outboxEvent).where(eq(outboxEvent.subjectId, collection.id)),
        );
        const audits = yield* Effect.promise(() =>
          db.select().from(auditEvent).where(eq(auditEvent.action, "cms.schema.published")),
        );

        assert.strictEqual(published.sequence, 1);
        assert.strictEqual(replay.id, published.id);
        assert.strictEqual(latest.id, published.id);
        assert.deepStrictEqual(original, published);
        assert.strictEqual(events.length, 1);
        assert.strictEqual(audits.filter((audit) => audit.resourceId === collection.id).length, 1);
        assert.strictEqual(events[0]?.schemaRevisionId, published.id);
        assert.strictEqual(events[0]?.payload["collectionId"], collection.id);

        const noOp = yield* schemas.publishSchema(
          ownerActor,
          yield* Schema.decodeUnknown(PublishCollectionSchemaInput)({
            ...scope,
            draftVersion: draft.collection.draftVersion,
            expectedPublishedRevisionId: published.id,
            commandId: randomUUID(),
            acknowledgedChangeIds: [],
          }),
          new Date(),
          "request-m5-publish-noop",
        );
        assert.strictEqual(noOp.id, published.id);
        const finalEvents = yield* Effect.promise(() =>
          db.select().from(outboxEvent).where(eq(outboxEvent.subjectId, collection.id)),
        );
        assert.strictEqual(finalEvents.length, 1);

        const title = draft.fields.find((field) => field.apiKey === "title");
        if (!title) throw new Error("Published title field was not found.");
        const renamedDraft = yield* schemas.updateField(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateCollectionFieldInput)({
            ...scope,
            fieldId: title.id,
            draftVersion: draft.collection.draftVersion,
            apiKey: "headline",
            displayLabel: "Headline",
            kind: title.kind,
            required: title.required,
            localization: title.localization,
            deprecated: title.deprecated,
            configuration: title.configuration,
          }),
          new Date("2026-08-01T14:02:00.000Z"),
          "request-m5-title-rename",
        );
        const changed = yield* schemas.validateSchema(
          ownerActor,
          yield* Schema.decodeUnknown(ValidateCollectionSchemaInput)(scope),
        );
        assert.isTrue(
          changed.changes.items.some((change) => change.code === "field.api_key.updated"),
        );
        const second = yield* schemas.publishSchema(
          ownerActor,
          yield* Schema.decodeUnknown(PublishCollectionSchemaInput)({
            ...scope,
            draftVersion: renamedDraft.collection.draftVersion,
            expectedPublishedRevisionId: published.id,
            commandId: randomUUID(),
            acknowledgedChangeIds: changed.changes.items
              .filter((change) => change.classification !== "non_breaking")
              .map((change) => change.changeId),
          }),
          new Date("2026-08-01T14:03:00.000Z"),
          "request-m5-publish-second",
        );
        const originalAfterLaterPublication = yield* schemas.getPublishedRevision(
          ownerActor,
          yield* Schema.decodeUnknown(GetPublishedSchemaRevisionInput)({
            ...scope,
            revisionId: published.id,
          }),
        );
        assert.strictEqual(second.sequence, 2);
        assert.strictEqual(second.previousRevisionId, published.id);
        assert.strictEqual(
          second.fields.find((field) => field.id === title.id)?.apiKey,
          "headline",
        );
        assert.deepStrictEqual(originalAfterLaterPublication, published);
        assert.strictEqual(renamedDraft.collection.draftVersion, draft.collection.draftVersion + 1);

        const summary = renamedDraft.fields.find((field) => field.apiKey === "summary");
        if (!summary) throw new Error("Summary field was not found.");
        const concurrencyDraft = yield* schemas.updateField(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateCollectionFieldInput)({
            ...scope,
            fieldId: summary.id,
            draftVersion: renamedDraft.collection.draftVersion,
            apiKey: summary.apiKey,
            displayLabel: "Excerpt",
            kind: summary.kind,
            required: summary.required,
            localization: summary.localization,
            deprecated: summary.deprecated,
            configuration: summary.configuration,
          }),
          new Date("2026-08-01T14:04:00.000Z"),
          "request-m5-concurrent-draft",
        );
        const concurrentInput = {
          ...scope,
          draftVersion: concurrencyDraft.collection.draftVersion,
          expectedPublishedRevisionId: second.id,
          acknowledgedChangeIds: [],
        };
        const concurrentPublishes = yield* Effect.all(
          [
            schemas
              .publishSchema(
                ownerActor,
                yield* Schema.decodeUnknown(PublishCollectionSchemaInput)({
                  ...concurrentInput,
                  commandId: randomUUID(),
                }),
                new Date("2026-08-01T14:05:00.000Z"),
                "request-m5-concurrent-a",
              )
              .pipe(Effect.exit),
            schemas
              .publishSchema(
                ownerActor,
                yield* Schema.decodeUnknown(PublishCollectionSchemaInput)({
                  ...concurrentInput,
                  commandId: randomUUID(),
                }),
                new Date("2026-08-01T14:05:00.000Z"),
                "request-m5-concurrent-b",
              )
              .pipe(Effect.exit),
          ],
          { concurrency: "unbounded" },
        );
        assert.strictEqual(concurrentPublishes.filter(Exit.isSuccess).length, 1);
        assert.strictEqual(
          concurrentPublishes.filter((exit) => failureTag(exit) === "VersionConflictFailure")
            .length,
          1,
        );
      }),
  );

  it.effect(
    "uses intended indexes, protects published identities, and rejects archived mutations",
    () =>
      Effect.gen(function* () {
        const collection = required(firstCollection, "collection");
        const [revision] = yield* Effect.promise(() =>
          db
            .select()
            .from(cmsSchemaRevision)
            .where(eq(cmsSchemaRevision.collectionId, collection.id))
            .orderBy(sql`${cmsSchemaRevision.sequence} desc`)
            .limit(1),
        );
        if (!revision) throw new Error("Published revision was not found.");
        const [field] = yield* Effect.promise(() =>
          db
            .select()
            .from(cmsCollectionField)
            .where(eq(cmsCollectionField.collectionId, collection.id))
            .limit(1),
        );
        if (!field) throw new Error("Stable field was not found.");
        const revisionDelete = yield* Effect.exit(
          Effect.promise(() =>
            db.delete(cmsSchemaRevision).where(eq(cmsSchemaRevision.id, revision.id)),
          ),
        );
        const fieldDelete = yield* Effect.exit(
          Effect.promise(() =>
            db.delete(cmsCollectionField).where(eq(cmsCollectionField.id, field.id)),
          ),
        );
        assert.isTrue(Exit.isFailure(revisionDelete));
        assert.isTrue(Exit.isFailure(fieldDelete));

        const plans = yield* Effect.promise(() =>
          db.transaction(async (transaction) => {
            await transaction.execute(sql`set local enable_seqscan = off`);
            const collectionPlan = await transaction.execute(
              sql`explain (format json) select id from cms_collection where environment_id = ${collection.environmentId} order by created_at desc, id desc limit 20`,
            );
            const fieldPlan = await transaction.execute(
              sql`explain (format json) select id from cms_collection_field where collection_id = ${collection.id} and removed_at is null order by position, id`,
            );
            const revisionPlan = await transaction.execute(
              sql`explain (format json) select id from cms_schema_revision where collection_id = ${collection.id} order by sequence desc limit 1`,
            );
            const outboxPlan = await transaction.execute(
              sql`explain (format json) select id from outbox_event where processed_at is null order by available_at, id limit 20`,
            );
            return JSON.stringify([
              collectionPlan.rows,
              fieldPlan.rows,
              revisionPlan.rows,
              outboxPlan.rows,
            ]);
          }),
        );
        assert.include(plans, "cms_collection_environment_created_id_idx");
        assert.include(plans, "cms_field_collection_active_position_id_idx");
        assert.match(plans, /cms_revision_collection_(sequence_desc_idx|sequence_unique)/u);
        assert.include(plans, "outbox_event_pending_available_id_idx");

        const beforeRemoval = yield* schemas.getDraft(
          ownerActor,
          yield* Schema.decodeUnknown(GetCollectionDraftInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
          }),
        );
        const removedDraft = yield* schemas.removeField(
          ownerActor,
          yield* Schema.decodeUnknown(RemoveCollectionFieldInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
            fieldId: field.id,
            draftVersion: beforeRemoval.collection.draftVersion,
          }),
          new Date("2026-08-01T14:06:00.000Z"),
          "request-m5-field-remove",
        );
        const [removedIdentity] = yield* Effect.promise(() =>
          db.select().from(cmsCollectionField).where(eq(cmsCollectionField.id, field.id)),
        );
        const latestPublished = yield* schemas.getLatestPublished(
          ownerActor,
          yield* Schema.decodeUnknown(GetLatestPublishedSchemaInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
          }),
        );
        assert.strictEqual(removedDraft.fields.length, beforeRemoval.fields.length - 1);
        assert.isNotNull(removedIdentity?.removedAt);
        assert.isTrue(
          latestPublished.fields.some((publishedField) => publishedField.id === field.id),
        );

        yield* Effect.promise(() =>
          db
            .update(project)
            .set({
              archivedAt: new Date("2026-08-01T15:00:00.000Z"),
              archivedByUserId: ownerId,
            })
            .where(eq(project.id, collection.projectId)),
        );
        const currentDraft = yield* schemas.getDraft(
          ownerActor,
          yield* Schema.decodeUnknown(GetCollectionDraftInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
          }),
        );
        const archivedMutation = yield* Effect.exit(
          schemas.createField(
            ownerActor,
            yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
              projectId: collection.projectId,
              environmentId: collection.environmentId,
              collectionId: collection.id,
              draftVersion: currentDraft.collection.draftVersion,
              apiKey: "archived_field",
              displayLabel: "Archived field",
              kind: "boolean",
              required: false,
              localization: "shared",
              deprecated: false,
              configuration: {},
            }),
            new Date(),
            "request-m5-archived-mutation",
          ),
        );
        assert.strictEqual(failureTag(archivedMutation), "InvalidStateTransitionFailure");
      }),
  );
});
