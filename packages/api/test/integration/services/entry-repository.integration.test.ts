// Verifies M7 entry identity, partition concurrency, idempotency, history, restore, authorization, and audit persistence.

import { createHash, randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, or, sql } from "@framerfordevs/db/query";
import {
  apiCredential,
  apiCredentialScope,
  projectMembership,
} from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionField,
  cmsCollectionSchemaHead,
  cmsEntry,
  cmsEntryDraftCommand,
  cmsEntryLocaleDraft,
  cmsEntryLocaleRevision,
  cmsEntrySharedDraft,
  cmsEntrySharedRevision,
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

import { ApiCredentialId } from "../../../src/contracts/access";
import { AuthoringValueMutations, CmsActor } from "../../../src/contracts/authoring";
import {
  CreateEntryInput,
  CreateEntryWithDraftInput,
  GetEntryDraftInput,
  ListEntriesInput,
  ListEntryRevisionsInput,
  RenameEntryInput,
  RestoreEntryRevisionInput,
  SaveEntryDraftInput,
} from "../../../src/contracts/entry";
import { CreateProjectLocaleInput } from "../../../src/contracts/locale";
import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  type Project as ProjectModel,
  type Workspace as WorkspaceModel,
} from "../../../src/contracts/platform";
import {
  CollectionFieldId,
  CreateCollectionFieldInput,
  CreateCollectionInput,
  defaultFieldEditorMetadata,
  PublishCollectionSchemaInput,
  SchemaRevisionId,
  ValidateCollectionSchemaInput,
  type CmsCollection,
  type PublishedSchemaRevision,
} from "../../../src/contracts/schema";
import {
  StudioCollectionLocaleScope,
  StudioContentPageLimit,
  StudioContentScope,
} from "../../../src/contracts/studio-content";
import { resolveAuthoringMutations } from "../../../src/lib/authoring/mutations";
import { studioSearchAuthority } from "../../../src/lib/studio-content/search";
import { makeAuthoringContentRepository } from "../../../src/services/authoring/content-repository";
import { makeEntryRepository } from "../../../src/services/entry/repository";
import { makeLocaleRepository } from "../../../src/services/locale/repository";
import { makePlatformRepository } from "../../../src/services/platform-repository";
import { makeSchemaRepository } from "../../../src/services/schema/repository";
import { makeStudioContentRepository } from "../../../src/services/studio-content/repository";

const suffix = randomUUID();
const ownerId = `m7-entry-owner-${suffix}`;
const editorId = `m7-entry-editor-${suffix}`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const ownerCmsActor = Schema.decodeUnknownSync(CmsActor)({ kind: "user", id: ownerActor });
const editorActor = Schema.decodeUnknownSync(AuthUserId)(editorId);
const managementCredentialId = Schema.decodeUnknownSync(ApiCredentialId)(randomUUID());
const managementActor = Schema.decodeUnknownSync(CmsActor)({
  kind: "credential",
  id: managementCredentialId,
});
const platform = makePlatformRepository();
const schemas = makeSchemaRepository();
const entries = makeEntryRepository();
const localeRepository = makeLocaleRepository();
const studioContent = makeStudioContentRepository();

let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;
let collectionModel: CmsCollection | undefined;
let publishedModel: PublishedSchemaRevision | undefined;
let sharedFieldId: string | undefined;
let localizedFieldId: string | undefined;
let referenceFieldId: string | undefined;
let mixedObjectFieldId: string | undefined;
let mixedSharedFieldId: string | undefined;
let mixedLocalizedFieldId: string | undefined;
let primaryEntryId: string | undefined;

function required<A>(value: A | undefined, label: string): A {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  return typeof failure === "object" &&
    failure !== null &&
    "_tag" in failure &&
    typeof failure._tag === "string"
    ? failure._tag
    : undefined;
}

beforeAll(async () => {
  await db.insert(user).values([
    {
      id: ownerId,
      name: "M7 Entry Owner",
      email: `m7-owner-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: editorId,
      name: "M7 Entry Editor",
      email: `m7-editor-${suffix}@example.test`,
      emailVerified: true,
    },
  ]);
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      ownerActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M7 Entry Workspace" }),
      `m7-workspace-${suffix}`,
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M7 Entry Project",
        key: `entry-${suffix.slice(0, 8)}`,
        description: null,
      }),
      `m7-project-${suffix}`,
    ),
  );
  await Effect.runPromise(
    platform.enableCapability(
      ownerActor,
      Schema.decodeUnknownSync(EnableCapabilityInput)({
        projectId: required(projectModel, "project").id,
        capability: "cms",
      }),
      `m7-capability-${suffix}`,
    ),
  );
  const currentWorkspace = required(workspaceModel, "workspace");
  const credentialProject = required(projectModel, "project");
  await db.insert(apiCredential).values({
    id: managementCredentialId,
    workspaceId: currentWorkspace.id,
    projectId: credentialProject.id,
    environmentId: credentialProject.environment.id,
    family: "management",
    name: "M13 entry integration",
    keyPrefix: `ffd_mgmt_${managementCredentialId}`,
    keyDigest: createHash("sha256").update(managementCredentialId).digest("hex"),
    createdByUserId: ownerId,
    activatedAt: new Date(),
  });
  await db.insert(apiCredentialScope).values(
    ["content.read", "content.write"].map((scope) => ({
      credentialId: managementCredentialId,
      workspaceId: currentWorkspace.id,
      projectId: credentialProject.id,
      environmentId: credentialProject.environment.id,
      scope,
    })),
  );
  await db.insert(workspaceMembership).values({
    workspaceId: required(workspaceModel, "workspace").id,
    userId: editorId,
    role: "collaborator",
  });
  await db.insert(projectMembership).values({
    workspaceId: required(workspaceModel, "workspace").id,
    projectId: required(projectModel, "project").id,
    userId: editorId,
    role: "editor",
    localeAccessMode: "selected",
    createdByUserId: ownerId,
  });

  const currentProject = required(projectModel, "project");
  collectionModel = await Effect.runPromise(
    schemas.createCollection(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        apiKey: "articles",
        displayName: "Articles",
        description: null,
      }),
      new Date("2026-08-08T10:00:00.000Z"),
      `m7-collection-${suffix}`,
    ),
  );
  const sharedDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: required(collectionModel, "collection").draftVersion,
        parentFieldId: null,
        field: {
          apiKey: "internal_name",
          displayLabel: "Internal name",
          kind: "short_text",
          required: false,
          localization: "shared",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: {},
        },
      }),
      new Date("2026-08-08T10:01:00.000Z"),
      `m7-shared-field-${suffix}`,
    ),
  );
  sharedFieldId = sharedDraft.fields[0]?.id;
  const localizedDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: sharedDraft.collection.draftVersion,
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
      new Date("2026-08-08T10:02:00.000Z"),
      `m7-localized-field-${suffix}`,
    ),
  );
  localizedFieldId = localizedDraft.fields[1]?.id;
  const referenceDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: localizedDraft.collection.draftVersion,
        parentFieldId: null,
        field: {
          apiKey: "related",
          displayLabel: "Related entry",
          kind: "reference",
          required: false,
          localization: "localized",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: { targetCollectionId: required(collectionModel, "collection").id },
        },
      }),
      new Date("2026-08-08T10:02:30.000Z"),
      `m7-reference-field-${suffix}`,
    ),
  );
  referenceFieldId = referenceDraft.fields[2]?.id;
  const mixedDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: referenceDraft.collection.draftVersion,
        parentFieldId: null,
        field: {
          apiKey: "hero",
          displayLabel: "Hero",
          kind: "object",
          required: null,
          localization: "mixed",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: {},
        },
      }),
      new Date("2026-08-08T10:02:35.000Z"),
      `m7-mixed-field-${suffix}`,
    ),
  );
  mixedObjectFieldId = mixedDraft.fields[3]?.id;
  const mixedSharedDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: mixedDraft.collection.draftVersion,
        parentFieldId: required(mixedObjectFieldId, "mixed object field"),
        field: {
          apiKey: "layout",
          displayLabel: "Layout",
          kind: "short_text",
          required: false,
          localization: "shared",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: {},
        },
      }),
      new Date("2026-08-08T10:02:40.000Z"),
      `m7-mixed-shared-${suffix}`,
    ),
  );
  mixedSharedFieldId = mixedSharedDraft.fields[3]?.children[0]?.id;
  const mixedLocalizedDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: mixedSharedDraft.collection.draftVersion,
        parentFieldId: required(mixedObjectFieldId, "mixed object field"),
        field: {
          apiKey: "heading",
          displayLabel: "Heading",
          kind: "short_text",
          required: false,
          localization: "localized",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: {},
        },
      }),
      new Date("2026-08-08T10:02:45.000Z"),
      `m7-mixed-localized-${suffix}`,
    ),
  );
  mixedLocalizedFieldId = mixedLocalizedDraft.fields[3]?.children[1]?.id;
  const validation = await Effect.runPromise(
    schemas.validateSchema(
      ownerActor,
      Schema.decodeUnknownSync(ValidateCollectionSchemaInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
      }),
    ),
  );
  publishedModel = await Effect.runPromise(
    schemas.publishSchema(
      ownerActor,
      Schema.decodeUnknownSync(PublishCollectionSchemaInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: mixedLocalizedDraft.collection.draftVersion,
        expectedPublishedRevisionId: null,
        commandId: randomUUID(),
        acknowledgedChangeIds: validation.changes.items
          .filter((change) => change.classification !== "non_breaking")
          .map((change) => change.changeId),
      }),
      new Date("2026-08-08T10:03:00.000Z"),
      `m7-publish-${suffix}`,
    ),
  );
  await Effect.runPromise(
    localeRepository.createLocale(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectLocaleInput)({
        projectId: currentProject.id,
        tag: "hi",
        displayName: "Hindi",
      }),
      new Date("2026-08-08T10:04:00.000Z"),
      `m7-hindi-${suffix}`,
    ),
  );

  const [english] = await db
    .select()
    .from(projectLocale)
    .where(and(eq(projectLocale.projectId, currentProject.id), eq(projectLocale.tag, "en")))
    .limit(1);
  const [membership] = await db
    .select()
    .from(projectMembership)
    .where(
      and(
        eq(projectMembership.projectId, currentProject.id),
        eq(projectMembership.userId, editorId),
      ),
    )
    .limit(1);
  if (!english || !membership) throw new Error("M7 locale access fixture was not created.");
  await db.execute(
    sql`insert into project_membership_locale_access (membership_id, workspace_id, project_id, locale_id) values (${membership.id}, ${membership.workspaceId}, ${membership.projectId}, ${english.id})`,
  );
});

afterAll(async () => {
  const collectionId = collectionModel?.id;
  if (collectionId) {
    await db.delete(outboxEvent).where(eq(outboxEvent.subjectId, collectionId));
    await db
      .delete(cmsEntryDraftCommand)
      .where(eq(cmsEntryDraftCommand.collectionId, collectionId));
    await db.delete(cmsEntrySharedDraft).where(eq(cmsEntrySharedDraft.collectionId, collectionId));
    await db.delete(cmsEntryLocaleDraft).where(eq(cmsEntryLocaleDraft.collectionId, collectionId));
    await db
      .delete(cmsEntrySharedRevision)
      .where(eq(cmsEntrySharedRevision.collectionId, collectionId));
    await db
      .delete(cmsEntryLocaleRevision)
      .where(eq(cmsEntryLocaleRevision.collectionId, collectionId));
    await db.delete(cmsEntry).where(eq(cmsEntry.collectionId, collectionId));
    await db
      .delete(cmsCollectionSchemaHead)
      .where(eq(cmsCollectionSchemaHead.collectionId, collectionId));
    await db
      .delete(cmsSchemaRevisionField)
      .where(eq(cmsSchemaRevisionField.collectionId, collectionId));
    await db.delete(cmsSchemaRevision).where(eq(cmsSchemaRevision.collectionId, collectionId));
    await db.delete(cmsCollectionField).where(eq(cmsCollectionField.collectionId, collectionId));
    await db
      .delete(cmsCollectionDeliveryConfig)
      .where(eq(cmsCollectionDeliveryConfig.collectionId, collectionId));
    await db.delete(cmsCollection).where(eq(cmsCollection.id, collectionId));
  }
  await db
    .delete(auditEvent)
    .where(
      or(
        eq(auditEvent.actorId, ownerId),
        eq(auditEvent.actorId, editorId),
        eq(auditEvent.actorId, managementCredentialId),
      ),
    );
  await db
    .delete(apiCredentialScope)
    .where(eq(apiCredentialScope.credentialId, managementCredentialId));
  await db.delete(apiCredential).where(eq(apiCredential.id, managementCredentialId));
  await db.execute(
    sql`delete from project_membership_locale_access where project_id = ${projectModel?.id ?? randomUUID()}`,
  );
  await db
    .delete(projectMembership)
    .where(eq(projectMembership.projectId, required(projectModel, "project").id));
  await db
    .delete(projectCapability)
    .where(eq(projectCapability.projectId, required(projectModel, "project").id));
  await db
    .delete(projectLocale)
    .where(eq(projectLocale.projectId, required(projectModel, "project").id));
  await db
    .delete(environment)
    .where(eq(environment.projectId, required(projectModel, "project").id));
  await db.delete(project).where(eq(project.id, required(projectModel, "project").id));
  await db
    .delete(workspaceMembership)
    .where(or(eq(workspaceMembership.userId, ownerId), eq(workspaceMembership.userId, editorId)));
  await db.delete(workspace).where(eq(workspace.id, required(workspaceModel, "workspace").id));
  await db.delete(user).where(or(eq(user.id, ownerId), eq(user.id, editorId)));
});

describe.sequential("entry repository PostgreSQL integration", () => {
  it.effect("returns an empty management list before the collection schema is published", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const page = yield* Effect.acquireUseRelease(
        schemas.createCollection(
          ownerActor,
          Schema.decodeUnknownSync(CreateCollectionInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            apiKey: "unpublished_entries",
            displayName: "Unpublished entries",
            description: null,
          }),
          new Date("2026-08-08T10:04:30.000Z"),
          `m7-unpublished-${suffix}`,
        ),
        (collection) =>
          Effect.all({
            page: entries.listEntries(
              ownerActor,
              Schema.decodeUnknownSync(ListEntriesInput)({
                projectId: project.id,
                environmentId: project.environment.id,
                collectionId: collection.id,
                locale: "en",
                cursor: null,
                limit: 25,
              }),
            ),
            context: studioContent.getContext(
              ownerActor,
              Schema.decodeUnknownSync(StudioContentScope)({
                projectId: project.id,
                environmentId: project.environment.id,
              }),
              new Date(),
            ),
          }),
        (collection) =>
          Effect.promise(async () => {
            await db
              .delete(cmsCollectionSchemaHead)
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            await db
              .delete(cmsCollectionDeliveryConfig)
              .where(eq(cmsCollectionDeliveryConfig.collectionId, collection.id));
            await db.delete(cmsCollection).where(eq(cmsCollection.id, collection.id));
          }),
      );
      assert.deepStrictEqual(page.page.items, []);
      assert.strictEqual(page.page.nextCursor, null);
      assert.isFalse(
        page.context.collections.some(({ displayName }) => displayName === "Unpublished entries"),
      );
      assert.isFalse(
        page.context.configurationNotices.some(
          ({ displayName }) => displayName === "Unpublished entries",
        ),
      );
    }),
  );

  it.effect("projects Studio context and exact-locale shared-write authority", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = required(collectionModel, "collection");
      const published = required(publishedModel, "published schema");
      const contextScope = Schema.decodeUnknownSync(StudioContentScope)({
        projectId: project.id,
        environmentId: project.environment.id,
      });
      const englishScope = Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
        ...contextScope,
        collectionId: collection.id,
        locale: "en",
      });
      const hindiScope = Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
        ...contextScope,
        collectionId: collection.id,
        locale: "hi",
      });

      const ownerContext = yield* studioContent.getContext(ownerActor, contextScope, new Date());
      const editorContext = yield* studioContent.getContext(editorActor, contextScope, new Date());
      const ownerAuthority = yield* studioContent.authorizeCollection(
        ownerActor,
        englishScope,
        new Date(),
      );
      const editorAuthority = yield* studioContent.authorizeCollection(
        editorActor,
        englishScope,
        new Date(),
      );
      const hiddenLocale = yield* Effect.exit(
        studioContent.authorizeCollection(editorActor, hindiScope, new Date()),
      );
      const foreignEnvironment = yield* Effect.exit(
        studioContent.authorizeCollection(
          ownerActor,
          Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
            ...englishScope,
            environmentId: randomUUID(),
          }),
          new Date(),
        ),
      );
      const foreignCollection = yield* Effect.exit(
        studioContent.authorizeCollection(
          ownerActor,
          Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
            ...englishScope,
            collectionId: randomUUID(),
          }),
          new Date(),
        ),
      );
      const foreignProject = yield* Effect.exit(
        studioContent.authorizeCollection(
          ownerActor,
          Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
            ...englishScope,
            projectId: randomUUID(),
            environmentId: randomUUID(),
          }),
          new Date(),
        ),
      );
      const staleSchema = yield* Effect.exit(
        studioContent.listEntries(
          ownerActor,
          {
            scope: englishScope,
            expectedSchemaRevisionId: Schema.decodeUnknownSync(SchemaRevisionId)(randomUUID()),
            limit: Schema.decodeUnknownSync(StudioContentPageLimit)(25),
            search: null,
            browseOrder: null,
            searchOrder: null,
          },
          new Date(),
        ),
      );

      assert.deepStrictEqual(
        ownerContext.locales.map(({ tag }) => tag),
        ["en", "hi"],
      );
      assert.deepStrictEqual(
        editorContext.locales.map(({ tag }) => tag),
        ["en"],
      );
      assert.strictEqual(ownerContext.collections[0]?.capabilities.canSaveShared, true);
      assert.strictEqual(editorContext.collections[0]?.capabilities.canSaveShared, false);
      assert.strictEqual(ownerAuthority.schemaRevisionId, published.id);
      assert.strictEqual(ownerAuthority.canWriteShared, true);
      assert.strictEqual(editorAuthority.canWriteLocalized, true);
      assert.strictEqual(editorAuthority.canWriteShared, false);
      assert.strictEqual(failureTag(hiddenLocale), "NotFoundFailure");
      assert.strictEqual(failureTag(foreignEnvironment), "NotFoundFailure");
      assert.strictEqual(failureTag(foreignCollection), "NotFoundFailure");
      assert.strictEqual(failureTag(foreignProject), "NotFoundFailure");
      assert.strictEqual(failureTag(staleSchema), "StudioContentCursorStaleFailure");
    }),
  );

  it("enforces the Studio fixed-role and locale-access capability matrix", async () => {
    const currentProject = required(projectModel, "project");
    const currentCollection = required(collectionModel, "collection");
    const scope = Schema.decodeUnknownSync(StudioContentScope)({
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
    });
    const localeScope = Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
      ...scope,
      collectionId: currentCollection.id,
      locale: "en",
    });
    const rollback = new Error("rollback Studio role matrix");

    try {
      await db.transaction(async (transaction) => {
        const repository = makeStudioContentRepository({
          database: { transaction: (callback) => callback(transaction) },
        });
        for (const [role, canWrite] of [
          ["developer", true],
          ["content_admin", true],
          ["editor", true],
          ["reviewer", false],
          ["client_editor", true],
          ["read_only", false],
        ] as const) {
          await transaction
            .update(projectMembership)
            .set({ role, localeAccessMode: "all" })
            .where(eq(projectMembership.userId, editorId));
          const context = await Effect.runPromise(
            repository.getContext(editorActor, scope, new Date()),
          );
          const authority = await Effect.runPromise(
            repository.authorizeCollection(editorActor, localeScope, new Date()),
          );
          assert.strictEqual(context.locales[0]?.canWrite, canWrite, role);
          assert.strictEqual(context.collections[0]?.capabilities.canCreate, canWrite, role);
          assert.strictEqual(context.collections[0]?.capabilities.canRename, canWrite, role);
          assert.strictEqual(context.collections[0]?.capabilities.canSaveLocalized, canWrite, role);
          assert.strictEqual(context.collections[0]?.capabilities.canSaveShared, canWrite, role);
          assert.strictEqual(authority.canWriteLocalized, canWrite, role);
          assert.strictEqual(authority.canWriteShared, canWrite, role);
        }

        await transaction
          .update(projectMembership)
          .set({ role: "editor", localeAccessMode: "selected" })
          .where(eq(projectMembership.userId, editorId));
        const selected = await Effect.runPromise(
          repository.authorizeCollection(editorActor, localeScope, new Date()),
        );
        assert.strictEqual(selected.canWriteLocalized, true);
        assert.strictEqual(selected.canWriteShared, false);

        await transaction
          .update(projectMembership)
          .set({ localeAccessMode: "none" })
          .where(eq(projectMembership.userId, editorId));
        const noneContext = await Effect.runPromise(
          repository.getContext(editorActor, scope, new Date()),
        );
        const noneDirect = await Effect.runPromiseExit(
          repository.authorizeCollection(editorActor, localeScope, new Date()),
        );
        assert.deepStrictEqual(noneContext.locales, []);
        assert.deepStrictEqual(noneContext.collections, []);
        assert.strictEqual(failureTag(noneDirect), "NotFoundFailure");

        for (const status of ["disabled", "removed"] as const) {
          await transaction
            .update(projectLocale)
            .set({ status, position: status === "removed" ? null : 1 })
            .where(
              and(eq(projectLocale.projectId, currentProject.id), eq(projectLocale.tag, "hi")),
            );
          const lifecycleContext = await Effect.runPromise(
            repository.getContext(ownerActor, scope, new Date()),
          );
          assert.deepStrictEqual(
            lifecycleContext.locales.map(({ tag }) => tag),
            ["en"],
            status,
          );
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    const ownerAuthority = await Effect.runPromise(
      studioContent.authorizeCollection(ownerActor, localeScope, new Date()),
    );
    assert.strictEqual(ownerAuthority.role, "owner");
    assert.strictEqual(ownerAuthority.canWriteLocalized, true);
    assert.strictEqual(ownerAuthority.canWriteShared, true);
  });

  it("keeps Studio anomaly diagnostics support-only and response-gated", async () => {
    const currentProject = required(projectModel, "project");
    const currentCollection = required(collectionModel, "collection");
    const published = required(publishedModel, "published schema");
    const scope = Schema.decodeUnknownSync(StudioContentScope)({
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
    });
    const localeScope = Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
      ...scope,
      collectionId: currentCollection.id,
      locale: "en",
    });
    const rollback = new Error("rollback Studio anomaly fixture");

    try {
      await db.transaction(async (transaction) => {
        const repository = makeStudioContentRepository({
          database: { transaction: (callback) => callback(transaction) },
        });
        await transaction
          .delete(cmsSchemaRevisionField)
          .where(eq(cmsSchemaRevisionField.revisionId, published.id));

        const ownerContext = await Effect.runPromise(
          repository.getContext(ownerActor, scope, new Date()),
        );
        const ownerDirect = await Effect.runPromiseExit(
          repository.authorizeCollection(ownerActor, localeScope, new Date()),
        );
        await transaction
          .update(projectMembership)
          .set({ role: "developer", localeAccessMode: "all" })
          .where(eq(projectMembership.userId, editorId));
        const developerContext = await Effect.runPromise(
          repository.getContext(editorActor, scope, new Date()),
        );
        const developerDirect = await Effect.runPromiseExit(
          repository.authorizeCollection(editorActor, localeScope, new Date()),
        );
        await transaction
          .update(projectMembership)
          .set({ role: "editor", localeAccessMode: "selected" })
          .where(eq(projectMembership.userId, editorId));
        const editorContext = await Effect.runPromise(
          repository.getContext(editorActor, scope, new Date()),
        );
        const editorDirect = await Effect.runPromiseExit(
          repository.authorizeCollection(editorActor, localeScope, new Date()),
        );
        const audits = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.resourceId, published.id),
              eq(auditEvent.action, "cms.schema.projection_invalid_detected"),
            ),
          );

        assert.deepStrictEqual(ownerContext.configurationNotices, [
          {
            collectionId: currentCollection.id,
            displayName: currentCollection.displayName,
            reason: "empty_schema",
          },
        ]);
        assert.deepStrictEqual(
          developerContext.configurationNotices,
          ownerContext.configurationNotices,
        );
        assert.deepStrictEqual(editorContext.configurationNotices, []);
        assert.strictEqual(failureTag(ownerDirect), "StudioCollectionConfigurationInvalidFailure");
        assert.strictEqual(
          failureTag(developerDirect),
          "StudioCollectionConfigurationInvalidFailure",
        );
        assert.strictEqual(failureTag(editorDirect), "NotFoundFailure");
        assert.strictEqual(audits[0]?.count, 0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    try {
      await db.transaction(async (transaction) => {
        const repository = makeStudioContentRepository({
          database: { transaction: (callback) => callback(transaction) },
        });
        await transaction
          .update(cmsSchemaRevisionField)
          .set({
            editorMetadata: {
              helpText: null,
              placeholder: null,
              visibleToRoles: ["editor"],
              editableByRoles: ["editor"],
            },
          })
          .where(eq(cmsSchemaRevisionField.revisionId, published.id));

        const editorBeforeSupport = await Effect.runPromise(
          repository.getContext(editorActor, scope, new Date()),
        );
        const editorDirectBeforeSupport = await Effect.runPromiseExit(
          repository.authorizeCollection(editorActor, localeScope, new Date()),
        );
        const [beforeSupportAudit] = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.resourceId, published.id),
              eq(auditEvent.action, "cms.schema.projection_invalid_detected"),
            ),
          );
        const ownerContext = await Effect.runPromise(
          repository.getContext(ownerActor, scope, new Date()),
        );
        const repeatedOwnerContext = await Effect.runPromise(
          repository.getContext(ownerActor, scope, new Date()),
        );
        const ownerDetections = [];
        for (let index = 0; index < 7; index += 1) {
          ownerDetections.push(
            await Effect.runPromiseExit(
              repository.authorizeCollection(ownerActor, localeScope, new Date()),
            ),
          );
        }
        await transaction
          .update(projectMembership)
          .set({ role: "developer", localeAccessMode: "all" })
          .where(eq(projectMembership.userId, editorId));
        const developerContext = await Effect.runPromise(
          repository.getContext(editorActor, scope, new Date()),
        );
        const developerDirect = await Effect.runPromiseExit(
          repository.authorizeCollection(editorActor, localeScope, new Date()),
        );
        await transaction
          .update(projectMembership)
          .set({ role: "editor", localeAccessMode: "selected" })
          .where(eq(projectMembership.userId, editorId));
        const editorContext = await Effect.runPromise(
          repository.getContext(editorActor, scope, new Date()),
        );
        const editorDirect = await Effect.runPromiseExit(
          repository.authorizeCollection(editorActor, localeScope, new Date()),
        );
        const audits = await transaction
          .select({ actorId: auditEvent.actorId })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.resourceId, published.id),
              eq(auditEvent.action, "cms.schema.projection_invalid_detected"),
            ),
          );

        assert.deepStrictEqual(editorBeforeSupport.configurationNotices, []);
        assert.isFalse(
          editorBeforeSupport.collections.some(({ id }) => id === currentCollection.id),
        );
        assert.strictEqual(failureTag(editorDirectBeforeSupport), "NotFoundFailure");
        assert.strictEqual(beforeSupportAudit?.count, 0);
        assert.deepStrictEqual(ownerContext.configurationNotices, [
          {
            collectionId: currentCollection.id,
            displayName: currentCollection.displayName,
            reason: "projection_invalid",
          },
        ]);
        assert.deepStrictEqual(
          repeatedOwnerContext.configurationNotices,
          ownerContext.configurationNotices,
        );
        assert.deepStrictEqual(
          developerContext.configurationNotices,
          ownerContext.configurationNotices,
        );
        assert.deepStrictEqual(editorContext.configurationNotices, []);
        assert.strictEqual(ownerDetections.length, 7);
        assert.isTrue(
          ownerDetections.every(
            (detection) => failureTag(detection) === "StudioCollectionConfigurationInvalidFailure",
          ),
        );
        assert.strictEqual(
          failureTag(developerDirect),
          "StudioCollectionConfigurationInvalidFailure",
        );
        assert.strictEqual(failureTag(editorDirect), "NotFoundFailure");
        assert.deepStrictEqual(audits, [{ actorId: ownerId }]);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    try {
      await db.transaction(async (transaction) => {
        await transaction
          .update(cmsSchemaRevisionField)
          .set({
            editorMetadata: {
              helpText: null,
              placeholder: null,
              visibleToRoles: ["editor"],
              editableByRoles: ["editor"],
            },
          })
          .where(eq(cmsSchemaRevisionField.revisionId, published.id));
        const failingTransaction = new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === "insert") {
              return () => {
                throw new Error("injected projection audit persistence failure");
              };
            }
            return Reflect.get(target, property, receiver);
          },
        });
        const repository = makeStudioContentRepository({
          database: { transaction: (callback) => callback(failingTransaction) },
        });
        const failed = await Effect.runPromiseExit(
          repository.getContext(ownerActor, scope, new Date()),
        );
        const audits = await transaction
          .select({ count: sql<number>`count(*)::int` })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.resourceId, published.id),
              eq(auditEvent.action, "cms.schema.projection_invalid_detected"),
            ),
          );
        assert.strictEqual(failureTag(failed), "DatabaseFailure");
        assert.strictEqual(audits[0]?.count, 0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    const originalFields = await db
      .select({
        fieldId: cmsSchemaRevisionField.fieldId,
        editorMetadata: cmsSchemaRevisionField.editorMetadata,
      })
      .from(cmsSchemaRevisionField)
      .where(eq(cmsSchemaRevisionField.revisionId, published.id));
    try {
      await db
        .update(cmsSchemaRevisionField)
        .set({
          editorMetadata: {
            helpText: null,
            placeholder: null,
            visibleToRoles: ["editor"],
            editableByRoles: ["editor"],
          },
        })
        .where(eq(cmsSchemaRevisionField.revisionId, published.id));
      const [concurrentContext, concurrentDetections] = await Promise.all([
        Effect.runPromise(studioContent.getContext(ownerActor, scope, new Date())),
        Promise.all(
          Array.from({ length: 7 }, () =>
            Effect.runPromiseExit(
              studioContent.authorizeCollection(ownerActor, localeScope, new Date()),
            ),
          ),
        ),
      ]);
      const concurrentAudits = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditEvent)
        .where(
          and(
            eq(auditEvent.resourceId, published.id),
            eq(auditEvent.action, "cms.schema.projection_invalid_detected"),
          ),
        );
      assert.strictEqual(concurrentContext.configurationNotices[0]?.reason, "projection_invalid");
      assert.isTrue(
        concurrentDetections.every(
          (detection) => failureTag(detection) === "StudioCollectionConfigurationInvalidFailure",
        ),
      );
      assert.strictEqual(concurrentAudits[0]?.count, 1);
    } finally {
      for (const field of originalFields) {
        await db
          .update(cmsSchemaRevisionField)
          .set({ editorMetadata: field.editorMetadata })
          .where(
            and(
              eq(cmsSchemaRevisionField.revisionId, published.id),
              eq(cmsSchemaRevisionField.fieldId, field.fieldId),
            ),
          );
      }
      await db
        .delete(auditEvent)
        .where(
          and(
            eq(auditEvent.resourceId, published.id),
            eq(auditEvent.action, "cms.schema.projection_invalid_detected"),
          ),
        );
    }
  });

  it.effect("creates one stable entry idempotently and lists it only in scope", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = required(collectionModel, "collection");
      const published = required(publishedModel, "published schema");
      const commandId = randomUUID();
      const input = yield* Schema.decodeUnknown(CreateEntryInput)({
        projectId: project.id,
        environmentId: project.environment.id,
        collectionId: collection.id,
        locale: "en",
        displayName: "Primary entry",
        schemaRevisionId: published.id,
        contractHash: published.contractHash,
        commandId,
      });
      const [created, replay] = yield* Effect.all(
        [
          entries.createEntry(
            ownerActor,
            input,
            new Date("2026-08-08T11:00:00.000Z"),
            `m7-create-${suffix}`,
          ),
          entries.createEntry(
            ownerActor,
            input,
            new Date("2026-08-08T11:01:00.000Z"),
            `m7-create-replay-${suffix}`,
          ),
        ],
        { concurrency: "unbounded" },
      );
      const page = yield* entries.listEntries(
        ownerActor,
        yield* Schema.decodeUnknown(ListEntriesInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          locale: "en",
          cursor: null,
          limit: 25,
        }),
      );
      primaryEntryId = created.id;
      assert.strictEqual(replay.id, created.id);
      const commandConflict = yield* Effect.exit(
        entries.createEntry(
          ownerActor,
          yield* Schema.decodeUnknown(CreateEntryInput)({ ...input, locale: "hi" }),
          new Date("2026-08-08T11:01:30.000Z"),
          `m7-create-conflict-${suffix}`,
        ),
      );
      assert.strictEqual(failureTag(commandConflict), "EntryCommandConflictFailure");
      const nameCommandConflict = yield* Effect.exit(
        entries.createEntry(
          ownerActor,
          yield* Schema.decodeUnknown(CreateEntryInput)({
            ...input,
            displayName: "Different command name",
          }),
          new Date("2026-08-08T11:01:45.000Z"),
          `m7-create-name-conflict-${suffix}`,
        ),
      );
      assert.strictEqual(failureTag(nameCommandConflict), "EntryCommandConflictFailure");
      assert.strictEqual(page.items[0]?.entry.id, created.id);
      assert.strictEqual(page.items[0]?.displayName, "Primary entry");
      const renamed = yield* entries.renameEntry(
        ownerActor,
        yield* Schema.decodeUnknown(RenameEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: created.id,
          locale: "en",
          displayName: "Renamed primary entry",
          expectedNameVersion: 1,
        }),
        new Date("2026-08-08T11:02:00.000Z"),
        `m7-rename-${suffix}`,
      );
      assert.strictEqual(renamed.displayName, "Renamed primary entry");
      assert.strictEqual(renamed.nameVersion, 2);
      const noOpRename = yield* entries.renameEntry(
        ownerActor,
        yield* Schema.decodeUnknown(RenameEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: created.id,
          locale: "en",
          displayName: "Renamed primary entry",
          expectedNameVersion: 2,
        }),
        new Date("2026-08-08T11:03:00.000Z"),
        `m7-rename-no-op-${suffix}`,
      );
      assert.strictEqual(noOpRename.nameVersion, 2);
      const rollbackRename = yield* Effect.exit(
        makeEntryRepository({ failAfter: "audit" }).renameEntry(
          ownerActor,
          yield* Schema.decodeUnknown(RenameEntryInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: created.id,
            locale: "en",
            displayName: "Rolled-back name",
            expectedNameVersion: 2,
          }),
          new Date("2026-08-08T11:03:30.000Z"),
          `m7-rename-rollback-${suffix}`,
        ),
      );
      assert.strictEqual(failureTag(rollbackRename), "DatabaseFailure");
      const afterRenameRollback = yield* entries.getDraft(
        ownerActor,
        yield* Schema.decodeUnknown(GetEntryDraftInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: created.id,
          locale: "en",
        }),
      );
      assert.strictEqual(afterRenameRollback.entry.displayName, "Renamed primary entry");
      assert.strictEqual(afterRenameRollback.entry.nameVersion, 2);
      const staleRename = yield* Effect.exit(
        entries.renameEntry(
          ownerActor,
          yield* Schema.decodeUnknown(RenameEntryInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: created.id,
            locale: "en",
            displayName: "Stale name",
            expectedNameVersion: 1,
          }),
          new Date("2026-08-08T11:04:00.000Z"),
          `m7-rename-stale-${suffix}`,
        ),
      );
      assert.strictEqual(failureTag(staleRename), "VersionConflictFailure");
      const renamedPage = yield* entries.listEntries(
        ownerActor,
        yield* Schema.decodeUnknown(ListEntriesInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          locale: "hi",
          cursor: null,
          limit: 25,
        }),
      );
      assert.strictEqual(renamedPage.items[0]?.displayName, "Renamed primary entry");
      const renameAudits = yield* Effect.promise(() =>
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.resourceId, created.id),
              eq(auditEvent.action, "cms.entry.name.updated"),
            ),
          ),
      );
      assert.strictEqual(renameAudits[0]?.count, 1);
    }),
  );

  it.effect("resolves authorized API-key mutation paths from current published authority", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const authority = yield* makeAuthoringContentRepository().resolveMutationAuthority(
        managementActor,
        {
          projectId: project.id,
          environmentId: project.environment.id,
          collectionKey: "articles",
          locale: "en",
        },
      );
      const oauthCollectionId = yield* makeAuthoringContentRepository().resolveCollection(
        ownerCmsActor,
        {
          projectId: project.id,
          environmentId: project.environment.id,
          collectionKey: "articles",
          locale: "en",
          action: "content.read",
        },
      );
      const mutations = yield* Schema.decodeUnknown(AuthoringValueMutations)([
        { operation: "set", scope: "shared", path: ["internal_name"], value: "Internal" },
        { operation: "set", scope: "localized", path: ["hero", "heading"], value: "Hello" },
      ]);
      const resolved = resolveAuthoringMutations(mutations, authority.fields);

      assert.strictEqual(authority.collectionId, required(collectionModel, "collection").id);
      assert.strictEqual(oauthCollectionId, authority.collectionId);
      assert.strictEqual(authority.revisionId, required(publishedModel, "published schema").id);
      assert.strictEqual(
        authority.contractHash,
        required(publishedModel, "published schema").contractHash,
      );
      assert.isTrue(resolved.valid);
      if (resolved.valid) {
        const sharedId = Schema.decodeUnknownSync(CollectionFieldId)(
          required(sharedFieldId, "shared field"),
        );
        const mixedObjectId = Schema.decodeUnknownSync(CollectionFieldId)(
          required(mixedObjectFieldId, "mixed object field"),
        );
        const mixedLocalizedId = Schema.decodeUnknownSync(CollectionFieldId)(
          required(mixedLocalizedFieldId, "mixed localized field"),
        );
        assert.deepStrictEqual(resolved.mutations, [
          { operation: "set", path: [sharedId], value: "Internal" },
          {
            operation: "set",
            path: [mixedObjectId, mixedLocalizedId],
            value: "Hello",
          },
        ]);
      }
    }),
  );

  it.effect("atomically creates initial shared/localized drafts and replays one command", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = required(collectionModel, "collection");
      const published = required(publishedModel, "published schema");
      const commandId = randomUUID();
      const input = yield* Schema.decodeUnknown(CreateEntryWithDraftInput)({
        projectId: project.id,
        environmentId: project.environment.id,
        collectionId: collection.id,
        locale: "en",
        displayName: "Atomic initial draft",
        schemaRevisionId: published.id,
        contractHash: published.contractHash,
        commandId,
        sharedMutations: [
          {
            operation: "set",
            path: [required(sharedFieldId, "shared field")],
            value: "Initial internal",
          },
        ],
        localizedMutations: [
          {
            operation: "set",
            path: [required(localizedFieldId, "localized field")],
            value: "Initial title",
          },
        ],
      });
      const [created, replay] = yield* Effect.all(
        [
          entries.createEntryWithDraft(
            managementActor,
            input,
            new Date("2026-08-08T10:59:00.000Z"),
            `m13-create-with-draft-${suffix}`,
          ),
          entries.createEntryWithDraft(
            managementActor,
            input,
            new Date("2026-08-08T10:59:30.000Z"),
            `m13-create-with-draft-replay-${suffix}`,
          ),
        ],
        { concurrency: "unbounded" },
      );
      const draft = yield* entries.getDraft(
        managementActor,
        yield* Schema.decodeUnknown(GetEntryDraftInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: created.entry.id,
          locale: "en",
        }),
      );
      const conflictingCommandId = randomUUID();
      const conflictingInputs = [
        yield* Schema.decodeUnknown(CreateEntryWithDraftInput)({
          ...input,
          commandId: conflictingCommandId,
          displayName: "Concurrent conflict A",
        }),
        yield* Schema.decodeUnknown(CreateEntryWithDraftInput)({
          ...input,
          commandId: conflictingCommandId,
          displayName: "Concurrent conflict B",
        }),
      ] as const;
      const conflictingResults = yield* Effect.all(
        conflictingInputs.map((conflictingInput, index) =>
          Effect.exit(
            entries.createEntryWithDraft(
              managementActor,
              conflictingInput,
              new Date(`2026-08-08T10:59:4${index}.000Z`),
              `m13-create-with-draft-conflict-${index}-${suffix}`,
            ),
          ),
        ),
        { concurrency: "unbounded" },
      );
      const [conflictingRows] = yield* Effect.promise(() =>
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(cmsEntry)
          .where(eq(cmsEntry.createCommandId, conflictingCommandId)),
      );
      const failedCommandId = randomUUID();
      const failed = yield* Effect.exit(
        entries.createEntryWithDraft(
          managementActor,
          yield* Schema.decodeUnknown(CreateEntryWithDraftInput)({
            ...input,
            commandId: failedCommandId,
            displayName: "Must roll back",
            localizedMutations: [
              {
                operation: "set",
                path: [required(localizedFieldId, "localized field")],
                value: "bad\u0000value",
              },
            ],
          }),
          new Date("2026-08-08T10:59:45.000Z"),
          `m13-create-with-draft-failed-${suffix}`,
        ),
      );
      const [failedRows] = yield* Effect.promise(() =>
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(cmsEntry)
          .where(eq(cmsEntry.createCommandId, failedCommandId)),
      );
      const rollbackResults: Array<{
        readonly tag: string | undefined;
        readonly rows: {
          readonly entries: number;
          readonly shared: number;
          readonly localized: number;
          readonly audits: number;
        };
      }> = [];
      for (const stage of ["entry", "revision", "head", "audit"] as const) {
        const rollbackCommandId = randomUUID();
        const rollbackRequestId = `m13-create-with-draft-rollback-${stage}-${suffix}`;
        const rolledBack = yield* Effect.exit(
          makeEntryRepository({ failAfter: stage }).createEntryWithDraft(
            managementActor,
            yield* Schema.decodeUnknown(CreateEntryWithDraftInput)({
              ...input,
              commandId: rollbackCommandId,
              displayName: `Injected ${stage} rollback`,
            }),
            new Date("2026-08-08T10:59:50.000Z"),
            rollbackRequestId,
          ),
        );
        const [rows] = yield* Effect.promise(() =>
          db
            .select({
              entries: sql<number>`(select count(*)::int from cms_entry where create_command_id = ${rollbackCommandId})`,
              shared: sql<number>`(select count(*)::int from cms_entry_shared_revision where command_id = ${rollbackCommandId})`,
              localized: sql<number>`(select count(*)::int from cms_entry_locale_revision where command_id = ${rollbackCommandId})`,
              audits: sql<number>`(select count(*)::int from audit_event where request_id = ${rollbackRequestId})`,
            })
            .from(cmsCollection)
            .limit(1),
        );
        rollbackResults.push({
          tag: failureTag(rolledBack),
          rows: required(rows, `${stage} rollback rows`),
        });
      }

      assert.strictEqual(replay.entry.id, created.entry.id);
      assert.strictEqual(created.entry.createdByUserId, null);
      assert.strictEqual(created.entry.createdByCredentialId, managementCredentialId);
      assert.strictEqual(created.sharedVersion, 1);
      assert.strictEqual(created.localizedVersion, 1);
      assert.strictEqual(replay.sharedRevisionId, created.sharedRevisionId);
      assert.strictEqual(replay.localizedRevisionId, created.localizedRevisionId);
      assert.strictEqual(
        Reflect.get(draft.sharedValues, required(sharedFieldId, "shared field")),
        "Initial internal",
      );
      assert.strictEqual(
        Reflect.get(draft.localizedValues, required(localizedFieldId, "localized field")),
        "Initial title",
      );
      assert.strictEqual(conflictingResults.filter(Exit.isSuccess).length, 1);
      assert.deepStrictEqual(conflictingResults.filter(Exit.isFailure).map(failureTag), [
        "EntryCommandConflictFailure",
      ]);
      assert.strictEqual(conflictingRows?.count, 1);
      assert.strictEqual(failureTag(failed), "ValidationFailure");
      assert.strictEqual(failedRows?.count, 0);
      assert.deepStrictEqual(
        rollbackResults,
        Array.from({ length: 4 }, () => ({
          tag: "DatabaseFailure",
          rows: { entries: 0, shared: 0, localized: 0, audits: 0 },
        })),
      );
    }),
  );

  it.effect(
    "saves independent heads, suppresses no-ops, returns soft issues, and rejects stale shared writes",
    () =>
      Effect.gen(function* () {
        const project = required(projectModel, "project");
        const collection = required(collectionModel, "collection");
        const published = required(publishedModel, "published schema");
        const page = yield* entries.listEntries(
          ownerActor,
          yield* Schema.decodeUnknown(ListEntriesInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            locale: "en",
            cursor: null,
            limit: 25,
          }),
        );
        const entry = required(page.items[0], "entry list item").entry;
        const sharedId = required(sharedFieldId, "shared field");
        const localizedId = required(localizedFieldId, "localized field");
        const mixedId = required(mixedObjectFieldId, "mixed object field");
        const mixedSharedId = required(mixedSharedFieldId, "mixed shared field");
        const mixedLocalizedId = required(mixedLocalizedFieldId, "mixed localized field");
        const first = yield* entries.saveDraft(
          ownerActor,
          yield* Schema.decodeUnknown(SaveEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            commandId: randomUUID(),
            expectedSharedVersion: 0,
            expectedLocalizedVersion: 0,
            sharedMutations: [
              { operation: "set", path: [sharedId], value: "Alpha" },
              { operation: "set", path: [mixedId, mixedSharedId], value: "Wide" },
            ],
            localizedMutations: [],
          }),
          new Date("2026-08-08T11:02:00.000Z"),
          `m7-save-shared-${suffix}`,
        );
        assert.strictEqual(first.sharedVersion, 1);
        assert.isFalse(first.validation.valid);
        assert.strictEqual(first.validation.issues[0]?.code, "required");
        const localized = yield* entries.saveDraft(
          ownerActor,
          yield* Schema.decodeUnknown(SaveEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            commandId: randomUUID(),
            expectedSharedVersion: 0,
            expectedLocalizedVersion: 0,
            sharedMutations: [],
            localizedMutations: [
              { operation: "set", path: [localizedId], value: "English title" },
              {
                operation: "set",
                path: [mixedId, mixedLocalizedId],
                value: "English heading",
              },
            ],
          }),
          new Date("2026-08-08T11:03:00.000Z"),
          `m7-save-locale-${suffix}`,
        );
        assert.strictEqual(localized.localizedVersion, 1);
        assert.isTrue(localized.validation.valid);
        const malformed = yield* Effect.exit(
          entries.saveDraft(
            ownerActor,
            yield* Schema.decodeUnknown(SaveEntryDraftInput)({
              projectId: project.id,
              environmentId: project.environment.id,
              collectionId: collection.id,
              entryId: entry.id,
              locale: "en",
              schemaRevisionId: published.id,
              contractHash: published.contractHash,
              commandId: randomUUID(),
              expectedSharedVersion: 1,
              expectedLocalizedVersion: 1,
              sharedMutations: [],
              localizedMutations: [{ operation: "set", path: [localizedId], value: {} }],
            }),
            new Date("2026-08-08T11:03:30.000Z"),
            `m7-malformed-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(malformed), "ValidationFailure");
        for (const stage of ["revision", "head", "audit", "receipt"] as const) {
          const rollbackCommandId = randomUUID();
          const rollbackRequestId = `m7-rollback-${stage}-${suffix}`;
          const rollback = yield* Effect.exit(
            makeEntryRepository({ failAfter: stage }).saveDraft(
              ownerActor,
              yield* Schema.decodeUnknown(SaveEntryDraftInput)({
                projectId: project.id,
                environmentId: project.environment.id,
                collectionId: collection.id,
                entryId: entry.id,
                locale: "en",
                schemaRevisionId: published.id,
                contractHash: published.contractHash,
                commandId: rollbackCommandId,
                expectedSharedVersion: 1,
                expectedLocalizedVersion: 1,
                sharedMutations: [],
                localizedMutations: [
                  { operation: "set", path: [localizedId], value: `Rolled back ${stage}` },
                ],
              }),
              new Date("2026-08-08T11:03:45.000Z"),
              rollbackRequestId,
            ),
          );
          assert.strictEqual(failureTag(rollback), "DatabaseFailure");
          const [rollbackRows] = yield* Effect.promise(() =>
            db
              .select({
                revisions: sql<number>`(select count(*)::int from cms_entry_locale_revision where command_id = ${rollbackCommandId})`,
                receipts: sql<number>`(select count(*)::int from cms_entry_draft_command where command_id = ${rollbackCommandId})`,
                audits: sql<number>`(select count(*)::int from audit_event where request_id = ${rollbackRequestId})`,
              })
              .from(cmsCollection)
              .limit(1),
          );
          assert.deepStrictEqual(rollbackRows, { revisions: 0, receipts: 0, audits: 0 });
        }
        const afterRollback = yield* entries.getDraft(
          ownerActor,
          yield* Schema.decodeUnknown(GetEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
          }),
        );
        assert.strictEqual(afterRollback.localizedVersion, 1);
        assert.strictEqual(
          Reflect.get(afterRollback.localizedValues, localizedId),
          "English title",
        );
        const sharedMixed = Reflect.get(afterRollback.sharedValues, mixedId);
        const localizedMixed = Reflect.get(afterRollback.localizedValues, mixedId);
        assert.strictEqual(
          typeof sharedMixed === "object" && sharedMixed !== null
            ? Reflect.get(sharedMixed, mixedSharedId)
            : undefined,
          "Wide",
        );
        assert.strictEqual(
          typeof localizedMixed === "object" && localizedMixed !== null
            ? Reflect.get(localizedMixed, mixedLocalizedId)
            : undefined,
          "English heading",
        );
        const replayCommand = randomUUID();
        const replayInput = yield* Schema.decodeUnknown(SaveEntryDraftInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: entry.id,
          locale: "en",
          schemaRevisionId: published.id,
          contractHash: published.contractHash,
          commandId: replayCommand,
          expectedSharedVersion: 1,
          expectedLocalizedVersion: 1,
          sharedMutations: [{ operation: "set", path: [sharedId], value: "Concurrent replay" }],
          localizedMutations: [],
        });
        const [saved, replay] = yield* Effect.all(
          [
            entries.saveDraft(
              ownerActor,
              replayInput,
              new Date("2026-08-08T11:04:00.000Z"),
              `m7-replay-${suffix}`,
            ),
            entries.saveDraft(
              ownerActor,
              replayInput,
              new Date("2026-08-08T11:05:00.000Z"),
              `m7-replay-concurrent-${suffix}`,
            ),
          ],
          { concurrency: "unbounded" },
        );
        assert.isTrue(saved.sharedChanged);
        assert.strictEqual(saved.sharedVersion, 2);
        assert.strictEqual(replay.sharedVersion, 2);
        assert.strictEqual(replay.sharedRevisionId, saved.sharedRevisionId);
        const noOp = yield* entries.saveDraft(
          ownerActor,
          yield* Schema.decodeUnknown(SaveEntryDraftInput)({
            ...replayInput,
            commandId: randomUUID(),
            expectedSharedVersion: 2,
          }),
          new Date("2026-08-08T11:05:30.000Z"),
          `m7-noop-${suffix}`,
        );
        assert.isFalse(noOp.sharedChanged);
        assert.strictEqual(noOp.sharedVersion, 2);
        const commandConflict = yield* Effect.exit(
          entries.saveDraft(
            ownerActor,
            yield* Schema.decodeUnknown(SaveEntryDraftInput)({
              ...replayInput,
              sharedMutations: [{ operation: "set", path: [sharedId], value: "Different" }],
            }),
            new Date(),
            `m7-save-command-conflict-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(commandConflict), "EntryCommandConflictFailure");
        const stale = yield* Effect.exit(
          entries.saveDraft(
            ownerActor,
            yield* Schema.decodeUnknown(SaveEntryDraftInput)({
              ...replayInput,
              commandId: randomUUID(),
              expectedSharedVersion: 0,
              sharedMutations: [{ operation: "set", path: [sharedId], value: "Beta" }],
            }),
            new Date(),
            `m7-stale-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(stale), "EntryDraftConflictFailure");
      }),
  );

  it.effect("allows independent exact-locale saves to succeed concurrently", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = required(collectionModel, "collection");
      const published = required(publishedModel, "published schema");
      const localizedId = required(localizedFieldId, "localized field");
      const referenceId = required(referenceFieldId, "reference field");
      const missingReferenceId = randomUUID();
      const entry = yield* entries.createEntry(
        ownerActor,
        yield* Schema.decodeUnknown(CreateEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          locale: "en",
          displayName: "Concurrent locale entry",
          schemaRevisionId: published.id,
          contractHash: published.contractHash,
          commandId: randomUUID(),
        }),
        new Date("2026-08-08T11:08:00.000Z"),
        `m7-concurrent-create-${suffix}`,
      );
      const malformedReference = yield* Effect.exit(
        entries.saveDraft(
          ownerActor,
          Schema.decodeUnknownSync(SaveEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            commandId: randomUUID(),
            expectedSharedVersion: 0,
            expectedLocalizedVersion: 0,
            sharedMutations: [],
            localizedMutations: [
              { operation: "set", path: [referenceId], value: "not-an-entry-uuid" },
            ],
          }),
          new Date("2026-08-08T11:08:30.000Z"),
          `m7-malformed-reference-${suffix}`,
        ),
      );
      assert.strictEqual(failureTag(malformedReference), "ValidationFailure");

      const save = (locale: "en" | "hi", value: string) =>
        entries.saveDraft(
          ownerActor,
          Schema.decodeUnknownSync(SaveEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale,
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            commandId: randomUUID(),
            expectedSharedVersion: 0,
            expectedLocalizedVersion: 0,
            sharedMutations: [],
            localizedMutations: [
              { operation: "set", path: [localizedId], value },
              ...(locale === "hi"
                ? [{ operation: "set" as const, path: [referenceId], value: missingReferenceId }]
                : []),
            ],
          }),
          new Date("2026-08-08T11:09:00.000Z"),
          `m7-concurrent-${locale}-${suffix}`,
        );
      const [english, hindi] = yield* Effect.all(
        [save("en", "English concurrent"), save("hi", "Hindi concurrent")],
        { concurrency: "unbounded" },
      );
      assert.strictEqual(english.localizedVersion, 1);
      assert.strictEqual(hindi.localizedVersion, 1);
      assert.include(
        hindi.validation.issues.map((issue) => issue.code),
        "reference_unavailable",
      );
      const [englishDraft, hindiDraft] = yield* Effect.all([
        entries.getDraft(
          ownerActor,
          yield* Schema.decodeUnknown(GetEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
          }),
        ),
        entries.getDraft(
          ownerActor,
          yield* Schema.decodeUnknown(GetEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "hi",
          }),
        ),
      ]);
      assert.strictEqual(
        Reflect.get(englishDraft.localizedValues, localizedId),
        "English concurrent",
      );
      assert.strictEqual(Reflect.get(hindiDraft.localizedValues, localizedId), "Hindi concurrent");
    }),
  );

  it.effect(
    "projects drafts, denies selected-locale shared writes, and appends restore history",
    () =>
      Effect.gen(function* () {
        const project = required(projectModel, "project");
        const collection = required(collectionModel, "collection");
        const published = required(publishedModel, "published schema");
        const page = yield* entries.listEntries(
          ownerActor,
          yield* Schema.decodeUnknown(ListEntriesInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            locale: "en",
            cursor: null,
            limit: 25,
          }),
        );
        const entry = required(
          page.items.find((item) => item.entry.id === required(primaryEntryId, "primary entry")),
          "original entry list item",
        ).entry;
        const draft = yield* entries.getDraft(
          editorActor,
          yield* Schema.decodeUnknown(GetEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
          }),
        );
        assert.isFalse(draft.canEditShared);
        assert.strictEqual(
          Reflect.get(draft.localizedValues, required(localizedFieldId, "localized field")),
          "English title",
        );
        const unauthorizedLocale = yield* Effect.exit(
          entries.getDraft(
            editorActor,
            yield* Schema.decodeUnknown(GetEntryDraftInput)({
              projectId: project.id,
              environmentId: project.environment.id,
              collectionId: collection.id,
              entryId: entry.id,
              locale: "hi",
            }),
          ),
        );
        assert.strictEqual(failureTag(unauthorizedLocale), "ForbiddenFailure");
        const denied = yield* Effect.exit(
          entries.saveDraft(
            editorActor,
            yield* Schema.decodeUnknown(SaveEntryDraftInput)({
              projectId: project.id,
              environmentId: project.environment.id,
              collectionId: collection.id,
              entryId: entry.id,
              locale: "en",
              schemaRevisionId: published.id,
              contractHash: published.contractHash,
              commandId: randomUUID(),
              expectedSharedVersion: 1,
              expectedLocalizedVersion: 1,
              sharedMutations: [
                {
                  operation: "set",
                  path: [required(sharedFieldId, "shared field")],
                  value: "Denied",
                },
              ],
              localizedMutations: [],
            }),
            new Date(),
            `m7-denied-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(denied), "ForbiddenFailure");
        const localizedHistory = yield* entries.listRevisions(
          ownerActor,
          yield* Schema.decodeUnknown(ListEntryRevisionsInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
            scope: "localized",
            cursor: null,
            limit: 25,
          }),
        );
        const target = required(localizedHistory.items[0], "localized revision");
        const changed = yield* entries.saveDraft(
          ownerActor,
          yield* Schema.decodeUnknown(SaveEntryDraftInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            commandId: randomUUID(),
            expectedSharedVersion: 1,
            expectedLocalizedVersion: 1,
            sharedMutations: [],
            localizedMutations: [
              {
                operation: "set",
                path: [required(localizedFieldId, "localized field")],
                value: "Changed",
              },
            ],
          }),
          new Date("2026-08-08T11:06:00.000Z"),
          `m7-change-${suffix}`,
        );
        const restored = yield* entries.restoreRevision(
          ownerActor,
          yield* Schema.decodeUnknown(RestoreEntryRevisionInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
            scope: "localized",
            revisionId: target.id,
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            expectedVersion: changed.localizedVersion,
            commandId: randomUUID(),
          }),
          new Date("2026-08-08T11:07:00.000Z"),
          `m7-restore-${suffix}`,
        );
        assert.strictEqual(restored.localizedVersion, 3);
        const restoreNoOpInput = yield* Schema.decodeUnknown(RestoreEntryRevisionInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: entry.id,
          locale: "en",
          scope: "localized",
          revisionId: target.id,
          schemaRevisionId: published.id,
          contractHash: published.contractHash,
          expectedVersion: 3,
          commandId: randomUUID(),
        });
        const restoreNoOp = yield* entries.restoreRevision(
          ownerActor,
          restoreNoOpInput,
          new Date("2026-08-08T11:08:00.000Z"),
          `m7-restore-noop-${suffix}`,
        );
        const restoreReplay = yield* entries.restoreRevision(
          ownerActor,
          restoreNoOpInput,
          new Date("2026-08-08T11:09:00.000Z"),
          `m7-restore-replay-${suffix}`,
        );
        assert.isFalse(restoreNoOp.localizedChanged);
        assert.strictEqual(restoreReplay.localizedVersion, 3);
        const revisions = yield* entries.listRevisions(
          ownerActor,
          yield* Schema.decodeUnknown(ListEntryRevisionsInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            entryId: entry.id,
            locale: "en",
            scope: "localized",
            cursor: null,
            limit: 25,
          }),
        );
        assert.strictEqual(revisions.items[0]?.restoredFromRevisionId, target.id);
        assert.strictEqual(revisions.items.length, 3);
        const draftIsolation = yield* Effect.promise(() =>
          db.execute(sql`
            select
              (select count(*)::int from cms_entry_locale_publication where entry_id = ${entry.id}) as publications,
              (select count(*)::int from cms_entry_locale_delivery_snapshot where entry_id = ${entry.id}) as snapshots,
              (select count(*)::int from cms_entry_locale_publication_head where entry_id = ${entry.id}) as publication_heads,
              (select count(*)::int from outbox_event where subject_id = ${entry.id} or payload::text like ${`%${entry.id}%`}) as outbox
          `),
        );
        assert.deepStrictEqual(draftIsolation.rows[0], {
          publications: 0,
          snapshots: 0,
          publication_heads: 0,
          outbox: 0,
        });
      }),
  );

  it.effect("attributes management-credential entry writes without issuer impersonation", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = required(collectionModel, "collection");
      const entryId = required(primaryEntryId, "primary entry");
      const current = yield* entries.getDraft(
        managementActor,
        yield* Schema.decodeUnknown(GetEntryDraftInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId,
          locale: "en",
        }),
      );
      const requestId = `m13-entry-credential-${suffix}`;
      const renamed = yield* entries.renameEntry(
        managementActor,
        yield* Schema.decodeUnknown(RenameEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId,
          locale: "en",
          displayName: "Credential-attributed entry",
          expectedNameVersion: current.entry.nameVersion,
        }),
        new Date("2026-08-24T01:10:00.000Z"),
        requestId,
      );
      const [stored] = yield* Effect.promise(() =>
        db
          .select({
            changedByUserId: cmsEntry.changedByUserId,
            changedByCredentialId: cmsEntry.changedByCredentialId,
          })
          .from(cmsEntry)
          .where(eq(cmsEntry.id, entryId)),
      );
      const [audit] = yield* Effect.promise(() =>
        db
          .select({ actorType: auditEvent.actorType, actorId: auditEvent.actorId })
          .from(auditEvent)
          .where(eq(auditEvent.requestId, requestId)),
      );

      assert.strictEqual(renamed.displayName, "Credential-attributed entry");
      assert.isNull(stored?.changedByUserId);
      assert.strictEqual(stored?.changedByCredentialId, managementCredentialId);
      assert.deepStrictEqual(audit, {
        actorType: "credential",
        actorId: managementCredentialId,
      });
    }),
  );

  it.effect("pages Studio browse and escaped case-insensitive prefix search", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = required(collectionModel, "collection");
      const published = required(publishedModel, "published schema");
      const alphaNames = Array.from(
        { length: 12 },
        (_, index) => `${index % 2 === 0 ? "Alpha" : "alpha"} ${String(index).padStart(2, "0")}`,
      );
      const entryIdsByName = new Map<string, string>();
      for (const displayName of [
        ...alphaNames,
        "%_literal",
        String.raw`\slash literal`,
        "İstanbul unicode",
        "Beta target",
      ]) {
        const created = yield* entries.createEntry(
          ownerActor,
          yield* Schema.decodeUnknown(CreateEntryInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            locale: "en",
            displayName,
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            commandId: randomUUID(),
          }),
          new Date(),
          `m19-list-${randomUUID()}`,
        );
        entryIdsByName.set(displayName, created.id);
      }
      const scope = Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
        projectId: project.id,
        environmentId: project.environment.id,
        collectionId: collection.id,
        locale: "en",
      });
      const limit = Schema.decodeUnknownSync(StudioContentPageLimit)(10);
      const firstBrowse = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: null,
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      yield* entries.createEntry(
        ownerActor,
        yield* Schema.decodeUnknown(CreateEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          locale: "en",
          displayName: "Browse concurrent",
          schemaRevisionId: published.id,
          contractHash: published.contractHash,
          commandId: randomUUID(),
        }),
        new Date(),
        `m19-list-concurrent-browse-create-${randomUUID()}`,
      );
      const secondBrowse = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: null,
          browseOrder: firstBrowse.finalBrowseOrder,
          searchOrder: null,
        },
        new Date(),
      );
      const alpha = studioSearchAuthority("ALPHA");
      const firstSearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: alpha,
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      yield* entries.createEntry(
        ownerActor,
        yield* Schema.decodeUnknown(CreateEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          locale: "en",
          displayName: "Alpha 10a",
          schemaRevisionId: published.id,
          contractHash: published.contractHash,
          commandId: randomUUID(),
        }),
        new Date(),
        `m19-list-concurrent-create-${randomUUID()}`,
      );
      yield* entries.renameEntry(
        ownerActor,
        yield* Schema.decodeUnknown(RenameEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: required(entryIdsByName.get("alpha 11"), "concurrent rename-out entry"),
          locale: "en",
          displayName: "Beta moved",
          expectedNameVersion: 1,
        }),
        new Date(),
        `m19-list-concurrent-rename-out-${randomUUID()}`,
      );
      yield* entries.renameEntry(
        ownerActor,
        yield* Schema.decodeUnknown(RenameEntryInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: required(entryIdsByName.get("Beta target"), "concurrent rename-in entry"),
          locale: "en",
          displayName: "Alpha 13",
          expectedNameVersion: 1,
        }),
        new Date(),
        `m19-list-concurrent-rename-in-${randomUUID()}`,
      );
      const secondSearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: alpha,
          browseOrder: null,
          searchOrder: firstSearch.finalSearchOrder,
        },
        new Date(),
      );
      const literalSearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: studioSearchAuthority("%_"),
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      const escapeSearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: studioSearchAuthority(String.raw`\s`),
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      const unicodeCaseSearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: studioSearchAuthority("İS"),
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      const emptySearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: studioSearchAuthority(`missing-${suffix}`),
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      const exactSearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit: Schema.decodeUnknownSync(StudioContentPageLimit)(13),
          search: alpha,
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      const fullBrowse = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit: Schema.decodeUnknownSync(StudioContentPageLimit)(50),
          search: null,
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      yield* Effect.promise(() =>
        db
          .update(cmsEntry)
          .set({ displayName: null })
          .where(
            eq(cmsEntry.id, required(entryIdsByName.get("alpha 11"), "null display-name entry")),
          ),
      );
      const nullDisplayNameSearch = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit,
          search: studioSearchAuthority("Beta moved"),
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );

      assert.strictEqual(firstBrowse.page.hasMore, true);
      assert.strictEqual(firstBrowse.page.items.length, 10);
      assert.isFalse(
        secondBrowse.page.items.some(({ id }) =>
          firstBrowse.page.items.some((first) => first.id === id),
        ),
      );
      assert.strictEqual(firstSearch.page.hasMore, true);
      assert.deepStrictEqual(firstSearch.page.count, { value: 12, relation: "exact" });
      assert.strictEqual(firstSearch.page.items.length, 10);
      assert.strictEqual(secondSearch.page.items.length, 3);
      assert.deepStrictEqual(secondSearch.page.count, { value: 13, relation: "exact" });
      assert.deepStrictEqual(
        [...firstSearch.page.items, ...secondSearch.page.items].map(({ displayName }) =>
          displayName.toLocaleLowerCase("en-US"),
        ),
        [
          ...alphaNames.slice(0, 11).map((displayName) => displayName.toLocaleLowerCase("en-US")),
          "alpha 10a",
          "alpha 13",
        ],
      );
      assert.strictEqual(literalSearch.page.items[0]?.displayName, "%_literal");
      assert.strictEqual(escapeSearch.page.items[0]?.displayName, String.raw`\slash literal`);
      assert.strictEqual(unicodeCaseSearch.page.items[0]?.displayName, "İstanbul unicode");
      assert.deepStrictEqual(emptySearch.page, {
        items: [],
        hasMore: false,
        nextCursor: null,
        count: { value: 0, relation: "exact" },
      });
      assert.strictEqual(exactSearch.page.items.length, 13);
      assert.strictEqual(exactSearch.page.hasMore, false);
      assert.isNull(exactSearch.page.nextCursor);
      assert.strictEqual(fullBrowse.page.hasMore, false);
      assert.isNull(fullBrowse.page.nextCursor);
      assert.isAtMost(fullBrowse.page.items.length, 50);
      assert.deepStrictEqual(nullDisplayNameSearch.page, {
        items: [],
        hasMore: false,
        nextCursor: null,
        count: { value: 0, relation: "exact" },
      });
    }),
  );

  it.effect("uses stable entry IDs to continue equal-name Studio search rows", () =>
    Effect.gen(function* () {
      const project = required(projectModel, "project");
      const collection = required(collectionModel, "collection");
      const published = required(publishedModel, "published schema");
      const displayName = `Tie ${suffix.slice(0, 8)}`;
      const createdIds: Array<string> = [];
      for (let index = 0; index < 12; index += 1) {
        const created = yield* entries.createEntry(
          ownerActor,
          yield* Schema.decodeUnknown(CreateEntryInput)({
            projectId: project.id,
            environmentId: project.environment.id,
            collectionId: collection.id,
            locale: "en",
            displayName,
            schemaRevisionId: published.id,
            contractHash: published.contractHash,
            commandId: randomUUID(),
          }),
          new Date(),
          `m19-list-tie-${randomUUID()}`,
        );
        createdIds.push(created.id);
      }
      const scope = Schema.decodeUnknownSync(StudioCollectionLocaleScope)({
        projectId: project.id,
        environmentId: project.environment.id,
        collectionId: collection.id,
        locale: "en",
      });
      const search = studioSearchAuthority(displayName);
      const first = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit: Schema.decodeUnknownSync(StudioContentPageLimit)(10),
          search,
          browseOrder: null,
          searchOrder: null,
        },
        new Date(),
      );
      const second = yield* studioContent.listEntries(
        ownerActor,
        {
          scope,
          expectedSchemaRevisionId: published.id,
          limit: Schema.decodeUnknownSync(StudioContentPageLimit)(10),
          search,
          browseOrder: null,
          searchOrder: first.finalSearchOrder,
        },
        new Date(),
      );
      const pagedIds = [...first.page.items, ...second.page.items].map(({ id }) => String(id));
      assert.deepStrictEqual(pagedIds, createdIds.toSorted());
      assert.strictEqual(new Set(pagedIds).size, 12);
      assert.deepStrictEqual(first.page.count, { value: 12, relation: "exact" });
      assert.strictEqual(first.page.hasMore, true);
      assert.strictEqual(second.page.hasMore, false);
    }),
  );

  it.effect("uses the intended immutable entry and revision list indexes", () =>
    Effect.gen(function* () {
      const collectionId = required(collectionModel, "collection").id;
      const entryId = required(primaryEntryId, "primary entry");
      const [english] = yield* Effect.promise(() =>
        db
          .select({ id: projectLocale.id })
          .from(projectLocale)
          .where(
            and(
              eq(projectLocale.projectId, required(projectModel, "project").id),
              eq(projectLocale.tag, "en"),
            ),
          )
          .limit(1),
      );
      if (!english) throw new Error("English locale fixture is unavailable.");
      const plans = yield* Effect.promise(() =>
        db.transaction(async (transaction) => {
          await transaction.execute(sql`set local enable_seqscan = off`);
          const entriesPlan = await transaction.execute(
            sql`explain (format json) select id from cms_entry where collection_id = ${collectionId} order by created_at desc, id desc limit 25`,
          );
          const sharedPlan = await transaction.execute(
            sql`explain (format json) select id from cms_entry_shared_revision where entry_id = ${entryId} order by sequence desc limit 25`,
          );
          const localePlan = await transaction.execute(
            sql`explain (format json) select id from cms_entry_locale_revision where entry_id = ${entryId} and locale_id = ${english.id} order by sequence desc limit 25`,
          );
          const createReplayPlan = await transaction.execute(
            sql`explain (format json) select id from cms_entry where collection_id = ${collectionId} and create_command_id = ${randomUUID()} order by create_command_id limit 1`,
          );
          const saveReplayPlan = await transaction.execute(
            sql`explain (format json) select result_kind from cms_entry_draft_command where entry_id = ${entryId} and command_id = ${randomUUID()} limit 1`,
          );
          const entryCredentialPlan = await transaction.execute(
            sql`explain (format json) select id from cms_entry where created_by_credential_id = ${managementCredentialId} limit 20`,
          );
          const sharedCredentialPlan = await transaction.execute(
            sql`explain (format json) select id from cms_entry_shared_revision where authored_by_credential_id = ${managementCredentialId} limit 20`,
          );
          const localeCredentialPlan = await transaction.execute(
            sql`explain (format json) select id from cms_entry_locale_revision where authored_by_credential_id = ${managementCredentialId} limit 20`,
          );
          const commandCredentialPlan = await transaction.execute(
            sql`explain (format json) select command_id from cms_entry_draft_command where completed_by_credential_id = ${managementCredentialId} limit 20`,
          );
          return JSON.stringify([
            entriesPlan.rows,
            sharedPlan.rows,
            localePlan.rows,
            createReplayPlan.rows,
            saveReplayPlan.rows,
            entryCredentialPlan.rows,
            sharedCredentialPlan.rows,
            localeCredentialPlan.rows,
            commandCredentialPlan.rows,
          ]);
        }),
      );
      assert.include(plans, "cms_entry_collection_created_id_idx");
      assert.match(plans, /cms_entry_shared_revision_entry_(sequence_idx|sequence_unique)/u);
      assert.match(plans, /cms_entry_locale_revision_entry_locale_(sequence_idx|sequence_unique)/u);
      assert.match(plans, /cms_entry_collection_(?:create_command_unique|created_id_idx)/u);
      assert.match(plans, /cms_entry_draft_command_(?:entry_command_pk|entry_completed_idx)/u);
      assert.include(plans, "cms_entry_created_by_credential_idx");
      assert.include(plans, "cms_entry_shared_revision_author_credential_idx");
      assert.include(plans, "cms_entry_locale_revision_author_credential_idx");
      assert.include(plans, "cms_entry_draft_command_completed_by_credential_idx");
    }),
  );

  it("uses the Studio browse, prefix-search, continuation, and capped-count indexes at 100,000 entries", async () => {
    const currentWorkspace = required(workspaceModel, "workspace");
    const currentProject = required(projectModel, "project");
    const currentCollection = required(collectionModel, "collection");
    const prefix = `m19plan${suffix.slice(0, 8)}`;
    const pattern = `${prefix}%`;
    const rollback = new Error("rollback M19 query-plan fixture");
    const timings = {
      browse: [] as Array<number>,
      search: [] as Array<number>,
      searchWithCappedCount: [] as Array<number>,
    };
    const executionTime = (rows: unknown) => {
      const match = /"Execution Time":([0-9.]+)/u.exec(JSON.stringify(rows));
      if (match?.[1] === undefined) throw new Error("PostgreSQL execution time was unavailable.");
      return Number(match[1]);
    };
    const percentile95 = (values: ReadonlyArray<number>) => {
      const sorted = values.toSorted((left, right) => left - right);
      const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
      const value = sorted[index];
      if (value === undefined) throw new Error("Performance sample was unavailable.");
      return value;
    };
    let plans = "";

    try {
      await db.transaction(async (transaction) => {
        await transaction.execute(sql`
          insert into cms_entry (
            id,
            workspace_id,
            project_id,
            environment_id,
            collection_id,
            display_name,
            create_command_id,
            create_command_fingerprint,
            created_by_user_id,
            changed_by_user_id
          )
          select
            uuidv7(),
            ${currentWorkspace.id},
            ${currentProject.id},
            ${currentProject.environment.id},
            ${currentCollection.id},
            ${prefix} || lpad(value::text, 6, '0'),
            uuidv7(),
            repeat('a', 64),
            ${ownerId},
            ${ownerId}
          from generate_series(1, 100000) as fixture(value)
        `);
        await transaction.execute(sql`analyze cms_entry`);

        const browseQuery = sql`select id, display_name from cms_entry where collection_id = ${currentCollection.id} order by created_at desc nulls last, id desc nulls last limit 51`;
        const searchQuery = sql`select id, display_name from cms_entry where workspace_id = ${currentWorkspace.id} and project_id = ${currentProject.id} and environment_id = ${currentProject.environment.id} and collection_id = ${currentCollection.id} and display_name is not null and lower(display_name) collate "C" like ${pattern} escape '\\' order by lower(display_name) collate "C" using ~<~, id limit 51`;
        const continuationQuery = sql`select id, display_name from cms_entry where workspace_id = ${currentWorkspace.id} and project_id = ${currentProject.id} and environment_id = ${currentProject.environment.id} and collection_id = ${currentCollection.id} and display_name is not null and lower(display_name) collate "C" like ${pattern} escape '\\' and (lower(display_name) collate "C" ~>~ ${`${prefix}050000`} or (lower(display_name) collate "C" = ${`${prefix}050000`} and id > ${randomUUID()})) order by lower(display_name) collate "C" using ~<~, id limit 51`;
        const cappedCountQuery = sql`select id from cms_entry where workspace_id = ${currentWorkspace.id} and project_id = ${currentProject.id} and environment_id = ${currentProject.environment.id} and collection_id = ${currentCollection.id} and display_name is not null and lower(display_name) collate "C" like ${pattern} escape '\\' limit 1001`;

        await transaction.execute(sql`set local enable_seqscan = off`);
        const browse = await transaction.execute(sql`explain (format json) ${browseQuery}`);
        await transaction.execute(sql`set local enable_seqscan = on`);
        const search = await transaction.execute(sql`explain (format json) ${searchQuery}`);
        const continuation = await transaction.execute(
          sql`explain (format json) ${continuationQuery}`,
        );
        const cappedCount = await transaction.execute(
          sql`explain (format json) ${cappedCountQuery}`,
        );
        plans = JSON.stringify([browse.rows, search.rows, continuation.rows, cappedCount.rows]);

        for (let sample = 0; sample < 20; sample += 1) {
          const browseTiming = await transaction.execute(
            sql`explain (analyze, format json, timing off) ${browseQuery}`,
          );
          const searchTiming = await transaction.execute(
            sql`explain (analyze, format json, timing off) ${searchQuery}`,
          );
          const cappedCountTiming = await transaction.execute(
            sql`explain (analyze, format json, timing off) ${cappedCountQuery}`,
          );
          const searchMilliseconds = executionTime(searchTiming.rows);
          timings.browse.push(executionTime(browseTiming.rows));
          timings.search.push(searchMilliseconds);
          timings.searchWithCappedCount.push(
            searchMilliseconds + executionTime(cappedCountTiming.rows),
          );
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }

    const [residue] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cmsEntry)
      .where(sql`${cmsEntry.displayName} like ${`${prefix}%`}`);
    assert.strictEqual(residue?.count, 0);
    assert.include(plans, "cms_entry_collection_created_id_idx");
    assert.strictEqual(plans.match(/cms_entry_studio_name_search_idx/gu)?.length, 3, plans);
    assert.notInclude(plans, '"Node Type":"Sort"');
    assert.notInclude(plans, '"Node Type":"Seq Scan"');
    assert.isBelow(percentile95(timings.browse), 150, "browse database p95 exceeded 150 ms");
    assert.isBelow(percentile95(timings.search), 150, "search database p95 exceeded 150 ms");
    assert.isBelow(
      percentile95(timings.searchWithCappedCount),
      300,
      "search plus capped-count database p95 exceeded 300 ms",
    );
  }, 30_000);
});
