import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, isNull, or, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionDeliveryField,
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
  GetDeliveryConfigurationInput,
  UpdateDeliveryConfigurationInput,
} from "../../../src/contracts/delivery";
import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  type Project as ProjectModel,
  type Workspace as WorkspaceModel,
} from "../../../src/contracts/platform";
import {
  CreateCollectionFieldInput,
  CreateCollectionInput,
  defaultFieldEditorMetadata,
  GetCollectionDraftInput,
  GetCollectionInput,
  GetDraftGeneratedFormInput,
  GetLatestPublishedSchemaInput,
  GetPublishedGeneratedFormInput,
  GetPublishedSchemaRevisionInput,
  ListCollectionsInput,
  PublishCollectionSchemaInput,
  RemoveCollectionFieldInput,
  ReorderCollectionFieldsInput,
  ReplaceCollectionDraftFieldsInput,
  UpdateCollectionFieldInput,
  UpdateCollectionInput,
  UpdateEditorLayoutInput,
  ValidateCollectionSchemaInput,
  type CmsCollection as CmsCollectionModel,
} from "../../../src/contracts/schemas";
import { makeDeliveryRepository } from "../../../src/services/delivery-repository";
import { makePlatformRepository } from "../../../src/services/platform-repository";
import { makeSchemaRepository } from "../../../src/services/schema-repository";

const suffix = randomUUID();
const ownerId = `m5-schema-owner-${suffix}`;
const foreignId = `m5-schema-foreign-${suffix}`;
const readerId = `m6-schema-reader-${suffix}`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const foreignActor = Schema.decodeUnknownSync(AuthUserId)(foreignId);
const readerActor = Schema.decodeUnknownSync(AuthUserId)(readerId);
const platform = makePlatformRepository();
const schemas = makeSchemaRepository();
const delivery = makeDeliveryRepository();

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

function failureIssueCodes(exit: Exit.Exit<unknown, unknown>): ReadonlyArray<string> {
  if (Exit.isSuccess(exit)) return [];
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  if (typeof failure !== "object" || failure === null || !("issues" in failure)) return [];
  if (!Array.isArray(failure.issues)) return [];
  return failure.issues.flatMap((issue) =>
    typeof issue === "object" && issue !== null && "code" in issue && typeof issue.code === "string"
      ? [issue.code]
      : [],
  );
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
    {
      id: readerId,
      name: "M6 Schema Reader",
      email: `m6-schema-reader-${suffix}@example.test`,
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
  await db.insert(workspaceMembership).values({
    workspaceId: required(workspaceModel, "workspace").id,
    userId: readerId,
    role: "collaborator",
  });
  await db.insert(projectMembership).values({
    workspaceId: required(workspaceModel, "workspace").id,
    projectId: required(projectModel, "project").id,
    userId: readerId,
    role: "read_only",
    createdByUserId: ownerId,
  });
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
  const actorIds = [ownerId, foreignId, readerId];
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
    .delete(cmsCollectionDeliveryField)
    .where(sql`${cmsCollectionDeliveryField.collectionId} in (${ownedCollections})`);
  await db
    .delete(cmsCollectionField)
    .where(sql`${cmsCollectionField.collectionId} in (${ownedCollections})`);
  await db
    .delete(cmsCollectionDeliveryConfig)
    .where(sql`${cmsCollectionDeliveryConfig.collectionId} in (${ownedCollections})`);
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
      const [configuration] = yield* Effect.promise(() =>
        db
          .select()
          .from(cmsCollectionDeliveryConfig)
          .where(
            eq(
              cmsCollectionDeliveryConfig.collectionId,
              required(firstCollection, "collection").id,
            ),
          ),
      );
      const [audit] = yield* Effect.promise(() =>
        db
          .select()
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.requestId, "request-m5-collection-create"),
              eq(auditEvent.actorId, ownerId),
            ),
          ),
      );
      assert.strictEqual(head?.draftVersion, 1);
      assert.strictEqual(configuration?.access, "protected");
      assert.strictEqual(configuration?.version, 1);
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
            parentFieldId: null,
            field: {
              apiKey: "title",
              displayLabel: "Title",
              kind: "short_text",
              required: true,
              localization: "localized",
              deprecated: false,
              editor: defaultFieldEditorMetadata,
              configuration: {},
            },
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
            field: {
              apiKey: title.apiKey,
              displayLabel: title.displayLabel,
              kind: title.kind,
              required: title.required,
              localization: title.localization,
              deprecated: title.deprecated,
              editor: title.editor,
              configuration: title.configuration,
            },
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
            parentFieldId: null,
            field: {
              apiKey: "summary",
              displayLabel: "Summary",
              kind: "short_text",
              required: false,
              localization: "localized",
              deprecated: false,
              editor: defaultFieldEditorMetadata,
              configuration: {},
            },
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
            parentFieldId: null,
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

  it.effect("atomically replaces authoring fields while preserving active identities", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = yield* schemas.createCollection(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          apiKey: `bulk_${suffix.replaceAll("-", "").slice(0, 20)}`,
          displayName: "Bulk authoring",
          description: null,
        }),
        new Date("2026-08-01T13:02:30.000Z"),
        "request-m6-bulk-collection",
      );
      const scope = {
        projectId: collection.projectId,
        environmentId: collection.environmentId,
        collectionId: collection.id,
      };
      const duplicate = yield* Effect.exit(
        schemas.replaceFields(
          ownerActor,
          yield* Schema.decodeUnknown(ReplaceCollectionDraftFieldsInput)({
            ...scope,
            draftVersion: collection.draftVersion,
            authoringVersion: 1,
            fields: [
              {
                id: null,
                apiKey: "title",
                displayLabel: "Title",
                kind: "short_text",
                required: true,
                localization: "localized",
                deprecated: false,
                editor: defaultFieldEditorMetadata,
                configuration: {},
                children: [],
              },
              {
                id: null,
                apiKey: "title",
                displayLabel: "Duplicate title",
                kind: "short_text",
                required: false,
                localization: "localized",
                deprecated: false,
                editor: defaultFieldEditorMetadata,
                configuration: {},
                children: [],
              },
            ],
          }),
          new Date("2026-08-01T13:02:31.000Z"),
          "request-m6-bulk-duplicate",
        ),
      );
      const afterFailure = yield* schemas.getDraft(
        ownerActor,
        yield* Schema.decodeUnknown(GetCollectionDraftInput)(scope),
      );
      assert.strictEqual(failureTag(duplicate), "SchemaInvalidFailure");
      assert.include(failureIssueCodes(duplicate), "field_api_key_duplicate");
      assert.strictEqual(afterFailure.fields.length, 0);

      const created = yield* schemas.replaceFields(
        ownerActor,
        yield* Schema.decodeUnknown(ReplaceCollectionDraftFieldsInput)({
          ...scope,
          draftVersion: afterFailure.collection.draftVersion,
          authoringVersion: 1,
          fields: [
            {
              id: null,
              apiKey: "title",
              displayLabel: "Title",
              kind: "short_text",
              required: true,
              localization: "localized",
              deprecated: false,
              editor: defaultFieldEditorMetadata,
              configuration: { maxLength: 200 },
              children: [],
            },
            {
              id: null,
              apiKey: "body",
              displayLabel: "Body",
              kind: "rich_text",
              required: false,
              localization: "localized",
              deprecated: false,
              editor: defaultFieldEditorMetadata,
              configuration: {
                default: {
                  version: 1,
                  profile: "ffd-portable-text",
                  blocks: [
                    {
                      _key: "block1",
                      _type: "block",
                      style: "normal",
                      children: [
                        {
                          _key: "span1",
                          _type: "span",
                          text: "Default body",
                          marks: ["strong"],
                        },
                      ],
                      markDefs: [],
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        }),
        new Date("2026-08-01T13:02:32.000Z"),
        "request-m6-bulk-create",
      );
      const title = required(created.fields[0], "bulk title");
      const updated = yield* schemas.replaceFields(
        ownerActor,
        yield* Schema.decodeUnknown(ReplaceCollectionDraftFieldsInput)({
          ...scope,
          draftVersion: created.collection.draftVersion,
          authoringVersion: 1,
          fields: [
            {
              id: title.id,
              apiKey: title.apiKey,
              displayLabel: "Heading",
              kind: title.kind,
              required: title.required,
              localization: title.localization,
              deprecated: title.deprecated,
              editor: title.editor,
              configuration: title.configuration,
              children: [],
            },
            {
              id: null,
              apiKey: "summary",
              displayLabel: "Heading",
              kind: "long_text",
              required: false,
              localization: "localized",
              deprecated: false,
              editor: defaultFieldEditorMetadata,
              configuration: {},
              children: [],
            },
          ],
        }),
        new Date("2026-08-01T13:02:33.000Z"),
        "request-m6-bulk-update",
      );

      assert.strictEqual(updated.fields[0]?.id, title.id);
      assert.strictEqual(updated.fields[0]?.displayLabel, "Heading");
      assert.strictEqual(updated.fields[1]?.displayLabel, "Heading");
      assert.notStrictEqual(updated.fields[1]?.id, title.id);
      assert.strictEqual(updated.editorLayout.tabs[0]?.groups[0]?.fields.length, 2);
    }),
  );

  it.effect("persists recursive M6 fields, pinned money, layout, and role-projected forms", () =>
    Effect.gen(function* () {
      const collection = required(firstCollection, "collection");
      const scope = {
        projectId: collection.projectId,
        environmentId: collection.environmentId,
        collectionId: collection.id,
      };
      let draft = yield* schemas.getDraft(
        ownerActor,
        yield* Schema.decodeUnknown(GetCollectionDraftInput)(scope),
      );
      draft = yield* schemas.createField(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          parentFieldId: null,
          field: {
            apiKey: "product",
            displayLabel: "Product",
            kind: "object",
            required: null,
            localization: "mixed",
            deprecated: false,
            editor: defaultFieldEditorMetadata,
            configuration: {},
          },
        }),
        new Date("2026-08-01T13:03:00.000Z"),
        "request-m6-object",
      );
      const product = draft.fields.find((field) => field.apiKey === "product");
      if (!product) throw new Error("Product object was not created.");
      draft = yield* schemas.createField(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          parentFieldId: product.id,
          field: {
            apiKey: "sku",
            displayLabel: "SKU",
            kind: "short_text",
            required: true,
            localization: "shared",
            deprecated: false,
            editor: defaultFieldEditorMetadata,
            configuration: { minLength: 1, maxLength: 50 },
          },
        }),
        new Date("2026-08-01T13:04:00.000Z"),
        "request-m6-object-child",
      );
      draft = yield* schemas.createField(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          parentFieldId: null,
          field: {
            apiKey: "prices",
            displayLabel: "Prices",
            kind: "list",
            required: false,
            localization: "shared",
            deprecated: false,
            editor: defaultFieldEditorMetadata,
            configuration: { maxItems: 10 },
          },
        }),
        new Date("2026-08-01T13:05:00.000Z"),
        "request-m6-list",
      );
      const prices = draft.fields.find((field) => field.apiKey === "prices");
      if (!prices) throw new Error("Prices list was not created.");
      draft = yield* schemas.createField(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          parentFieldId: prices.id,
          field: {
            apiKey: null,
            displayLabel: null,
            kind: "decimal",
            required: null,
            localization: null,
            deprecated: false,
            editor: prices.editor,
            configuration: { precision: 10, scale: 2 },
          },
        }),
        new Date("2026-08-01T13:06:00.000Z"),
        "request-m6-list-item",
      );
      draft = yield* schemas.createField(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          parentFieldId: null,
          field: {
            apiKey: "amount",
            displayLabel: "Amount",
            kind: "money",
            required: false,
            localization: "shared",
            deprecated: false,
            editor: defaultFieldEditorMetadata,
            configuration: { currencies: ["USD", "JPY"] },
          },
        }),
        new Date("2026-08-01T13:07:00.000Z"),
        "request-m6-money",
      );
      draft = yield* schemas.createField(
        ownerActor,
        yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          parentFieldId: null,
          field: {
            apiKey: "related",
            displayLabel: "Related",
            kind: "reference",
            required: false,
            localization: "shared",
            deprecated: false,
            editor: defaultFieldEditorMetadata,
            configuration: { targetCollectionId: collection.id },
          },
        }),
        new Date("2026-08-01T13:08:00.000Z"),
        "request-m6-reference",
      );

      const reloadedProduct = draft.fields.find((field) => field.id === product.id);
      const reloadedPrices = draft.fields.find((field) => field.id === prices.id);
      const form = yield* schemas.getDraftForm(
        ownerActor,
        yield* Schema.decodeUnknown(GetDraftGeneratedFormInput)(scope),
      );
      const firstTab = draft.editorLayout.tabs[0];
      const firstGroup = firstTab?.groups[0];
      if (!firstTab || !firstGroup) throw new Error("Synthetic editor layout was not created.");
      const updatedLayout = {
        ...draft.editorLayout,
        tabs: draft.editorLayout.tabs.map((tab) => ({
          ...tab,
          groups: tab.groups.map((group) =>
            group.id === firstGroup.id ? { ...group, columns: 2 } : group,
          ),
        })),
      };
      draft = yield* schemas.updateEditorLayout(
        ownerActor,
        yield* Schema.decodeUnknown(UpdateEditorLayoutInput)({
          ...scope,
          draftVersion: draft.collection.draftVersion,
          editorLayout: updatedLayout,
        }),
        new Date("2026-08-01T13:09:00.000Z"),
        "request-m6-layout",
      );
      const [head] = yield* Effect.promise(() =>
        db
          .select()
          .from(cmsCollectionSchemaHead)
          .where(eq(cmsCollectionSchemaHead.collectionId, collection.id)),
      );

      assert.strictEqual(reloadedProduct?.children[0]?.apiKey, "sku");
      assert.strictEqual(reloadedPrices?.children[0]?.nodeRole, "list_item");
      assert.strictEqual(draft.currencyRegistryProfile, "iso-4217@2026-01-01");
      assert.strictEqual(head?.currencyRegistryProfile, "iso-4217@2026-01-01");
      assert.strictEqual(draft.editorLayout.tabs[0]?.groups[0]?.columns, 2);
      assert.strictEqual(form.role, "owner");
      assert.isTrue(form.canEdit);
      assert.isTrue(form.currencyMinorUnits["USD"] === 2);

      const temporaryIds = draft.fields
        .filter((field) => ["product", "prices", "amount", "related"].includes(field.apiKey ?? ""))
        .map((field) => field.id);
      for (const fieldId of temporaryIds) {
        draft = yield* schemas.removeField(
          ownerActor,
          yield* Schema.decodeUnknown(RemoveCollectionFieldInput)({
            ...scope,
            fieldId,
            draftVersion: draft.collection.draftVersion,
          }),
          new Date("2026-08-01T13:10:00.000Z"),
          `request-m6-cleanup-${fieldId}`,
        );
      }
      assert.strictEqual(draft.fields.length, 2);
      assert.isNull(draft.currencyRegistryProfile);
    }),
  );

  it.effect(
    "rejects aggregate schema overflow without partial field, version, or audit writes",
    () =>
      Effect.gen(function* () {
        const currentProject = required(projectModel, "project");
        const collection = yield* schemas.createCollection(
          ownerActor,
          yield* Schema.decodeUnknown(CreateCollectionInput)({
            projectId: currentProject.id,
            environmentId: currentProject.environment.id,
            apiKey: `aggregate_${suffix.slice(0, 8)}`,
            displayName: "Aggregate bound",
            description: null,
          }),
          new Date("2026-08-01T13:20:00.000Z"),
          "request-m6-aggregate-collection",
        );
        let draft = yield* schemas.getDraft(
          ownerActor,
          yield* Schema.decodeUnknown(GetCollectionDraftInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
          }),
        );
        let accepted = 0;
        let rejected = false;
        for (let index = 0; index < 20; index += 1) {
          const exit = yield* Effect.exit(
            schemas.createField(
              ownerActor,
              yield* Schema.decodeUnknown(CreateCollectionFieldInput)({
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                collectionId: collection.id,
                draftVersion: draft.collection.draftVersion,
                parentFieldId: null,
                field: {
                  apiKey: `payload_${index}`,
                  displayLabel: `Payload ${index}`,
                  kind: "json",
                  required: false,
                  localization: "shared",
                  deprecated: false,
                  editor: defaultFieldEditorMetadata,
                  configuration: { default: "x".repeat(64_000) },
                },
              }),
              new Date("2026-08-01T13:21:00.000Z"),
              `request-m6-aggregate-${index}`,
            ),
          );
          if (Exit.isFailure(exit)) {
            assert.strictEqual(failureTag(exit), "SchemaInvalidFailure");
            rejected = true;
            break;
          }
          draft = exit.value;
          accepted += 1;
        }
        const activeRows = yield* Effect.promise(() =>
          db
            .select()
            .from(cmsCollectionField)
            .where(
              and(
                eq(cmsCollectionField.collectionId, collection.id),
                isNull(cmsCollectionField.removedAt),
              ),
            ),
        );
        const current = yield* schemas.getCollection(
          ownerActor,
          yield* Schema.decodeUnknown(GetCollectionInput)({
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            collectionId: collection.id,
          }),
        );
        const audits = yield* Effect.promise(() =>
          db
            .select()
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.resourceType, "cms_collection_field"),
                eq(auditEvent.projectId, collection.projectId),
                eq(auditEvent.environmentId, collection.environmentId),
              ),
            ),
        );

        assert.isTrue(rejected);
        assert.strictEqual(activeRows.length, accepted);
        assert.strictEqual(current.draftVersion, 1 + accepted);
        assert.strictEqual(
          audits.filter((audit) => activeRows.some((field) => field.id === audit.resourceId))
            .length,
          accepted,
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
        [
          "revision",
          "snapshots",
          "head",
          "audit",
          "invalidation_mapping_load",
          "invalidation_projection",
          "event_size_validation",
          "pre_outbox",
          "outbox",
        ] as const,
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
        const readerForm = yield* schemas.getPublishedForm(
          readerActor,
          yield* Schema.decodeUnknown(GetPublishedGeneratedFormInput)({
            ...scope,
            revisionId: null,
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
        assert.strictEqual(readerForm.role, "read_only");
        assert.isFalse(readerForm.canEdit);
        assert.deepEqual(readerForm.editableFieldIds, []);
        assert.strictEqual(readerForm.fields.length, published.fields.length);
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
            field: {
              apiKey: "headline",
              displayLabel: "Headline",
              kind: title.kind,
              required: title.required,
              localization: title.localization,
              deprecated: title.deprecated,
              editor: title.editor,
              configuration: title.configuration,
            },
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
            field: {
              apiKey: summary.apiKey,
              displayLabel: "Excerpt",
              kind: summary.kind,
              required: summary.required,
              localization: summary.localization,
              deprecated: summary.deprecated,
              editor: summary.editor,
              configuration: summary.configuration,
            },
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
    "manages protected-by-default Delivery configuration as one optimistic complete set",
    () =>
      Effect.gen(function* () {
        const collection = required(firstCollection, "collection");
        const scope = {
          projectId: collection.projectId,
          environmentId: collection.environmentId,
          collectionId: collection.id,
        };
        const initial = yield* delivery.getConfiguration(
          ownerActor,
          yield* Schema.decodeUnknown(GetDeliveryConfigurationInput)(scope),
        );
        const denied = yield* Effect.exit(
          delivery.getConfiguration(
            readerActor,
            yield* Schema.decodeUnknown(GetDeliveryConfigurationInput)(scope),
          ),
        );
        const published = yield* schemas.getLatestPublished(
          ownerActor,
          yield* Schema.decodeUnknown(GetLatestPublishedSchemaInput)(scope),
        );
        const field = published.fields.find(
          (candidate) => candidate.nodeRole === "root" && candidate.kind === "short_text",
        );
        if (field?.apiKey === null || field === undefined) {
          throw new Error("A current root short-text field was not found.");
        }
        const capability = {
          fieldId: field.id,
          fieldKey: field.apiKey,
          kind: field.kind,
          filterable: true,
          sortable: true,
          uniqueLookup: false,
        };
        const unacknowledged = yield* Effect.exit(
          delivery.updateConfiguration(
            ownerActor,
            yield* Schema.decodeUnknown(UpdateDeliveryConfigurationInput)({
              ...scope,
              expectedVersion: initial.version,
              access: "public",
              publicAccessAcknowledged: false,
              fields: [capability],
            }),
            new Date("2026-08-01T14:05:30.000Z"),
            `request-m9-delivery-unacknowledged-${suffix}`,
          ),
        );
        const configured = yield* delivery.updateConfiguration(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateDeliveryConfigurationInput)({
            ...scope,
            expectedVersion: initial.version,
            access: "protected",
            publicAccessAcknowledged: false,
            fields: [capability],
          }),
          new Date("2026-08-01T14:05:31.000Z"),
          `request-m9-delivery-fields-${suffix}`,
        );
        const publicConfiguration = yield* delivery.updateConfiguration(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateDeliveryConfigurationInput)({
            ...scope,
            expectedVersion: configured.version,
            access: "public",
            publicAccessAcknowledged: true,
            fields: [capability],
          }),
          new Date("2026-08-01T14:05:32.000Z"),
          `request-m9-delivery-public-${suffix}`,
        );
        const noOp = yield* delivery.updateConfiguration(
          ownerActor,
          yield* Schema.decodeUnknown(UpdateDeliveryConfigurationInput)({
            ...scope,
            expectedVersion: publicConfiguration.version,
            access: "public",
            publicAccessAcknowledged: false,
            fields: [capability],
          }),
          new Date("2026-08-01T14:05:33.000Z"),
          `request-m9-delivery-no-op-${suffix}`,
        );
        const stale = yield* Effect.exit(
          delivery.updateConfiguration(
            ownerActor,
            yield* Schema.decodeUnknown(UpdateDeliveryConfigurationInput)({
              ...scope,
              expectedVersion: configured.version,
              access: "protected",
              publicAccessAcknowledged: false,
              fields: [],
            }),
            new Date("2026-08-01T14:05:34.000Z"),
            `request-m9-delivery-stale-${suffix}`,
          ),
        );
        const [mutationCount] = yield* Effect.promise(() =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(auditEvent)
            .where(
              and(
                eq(auditEvent.actorId, ownerId),
                eq(auditEvent.action, "cms.collection.delivery_config.updated"),
                eq(auditEvent.resourceId, collection.id),
              ),
            ),
        );

        assert.strictEqual(initial.access, "protected");
        assert.strictEqual(initial.version, 1);
        assert.deepStrictEqual(initial.fields, []);
        assert.strictEqual(failureTag(denied), "ForbiddenFailure");
        assert.include(
          failureIssueCodes(unacknowledged),
          "delivery_public_access_acknowledgement_required",
        );
        assert.strictEqual(configured.version, 2);
        assert.strictEqual(publicConfiguration.version, 3);
        assert.strictEqual(noOp.version, 3);
        assert.strictEqual(noOp.access, "public");
        assert.strictEqual(failureTag(stale), "VersionConflictFailure");
        assert.strictEqual(mutationCount?.count, 2);
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
            .where(
              and(
                eq(cmsCollectionField.collectionId, collection.id),
                isNull(cmsCollectionField.removedAt),
              ),
            )
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
              sql`explain (format json) select id from cms_collection_field where collection_id = ${collection.id} and removed_at is null and node_role = 'root' order by position`,
            );
            const revisionPlan = await transaction.execute(
              sql`explain (format json) select id from cms_schema_revision where collection_id = ${collection.id} order by sequence desc limit 1`,
            );
            const outboxPlan = await transaction.execute(
              sql`explain (format json) select id from outbox_event where processed_at is null order by available_at, id limit 20`,
            );
            const fieldIndex = await transaction.execute(
              sql`select to_regclass('public.cms_field_collection_active_root_position_unique')::text as name`,
            );
            return JSON.stringify([
              collectionPlan.rows,
              fieldPlan.rows,
              revisionPlan.rows,
              outboxPlan.rows,
              fieldIndex.rows,
            ]);
          }),
        );
        assert.include(plans, "cms_collection_environment_created_id_idx");
        assert.include(plans, "cms_field_collection_active_root_position_unique");
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
              parentFieldId: null,
              field: {
                apiKey: "archived_field",
                displayLabel: "Archived field",
                kind: "boolean",
                required: false,
                localization: "shared",
                deprecated: false,
                editor: defaultFieldEditorMetadata,
                configuration: {},
              },
            }),
            new Date(),
            "request-m5-archived-mutation",
          ),
        );
        assert.strictEqual(failureTag(archivedMutation), "InvalidStateTransitionFailure");
      }),
  );
});
