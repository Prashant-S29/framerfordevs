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
  ValidateCollectionSchemaInput,
  type CmsCollection,
  type PublishedSchemaRevision,
} from "../../../src/contracts/schema";
import { resolveAuthoringMutations } from "../../../src/lib/authoring/mutations";
import { makeAuthoringContentRepository } from "../../../src/services/authoring/content-repository";
import { makeEntryRepository } from "../../../src/services/entry/repository";
import { makeLocaleRepository } from "../../../src/services/locale/repository";
import { makePlatformRepository } from "../../../src/services/platform-repository";
import { makeSchemaRepository } from "../../../src/services/schema/repository";

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
          entries.listEntries(
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
      assert.deepStrictEqual(page.items, []);
      assert.strictEqual(page.nextCursor, null);
    }),
  );

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
      const created = yield* entries.createEntryWithDraft(
        managementActor,
        input,
        new Date("2026-08-08T10:59:00.000Z"),
        `m13-create-with-draft-${suffix}`,
      );
      const replay = yield* entries.createEntryWithDraft(
        managementActor,
        input,
        new Date("2026-08-08T10:59:30.000Z"),
        `m13-create-with-draft-replay-${suffix}`,
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
      const rollbackCommandId = randomUUID();
      const rolledBack = yield* Effect.exit(
        makeEntryRepository({ failAfter: "audit" }).createEntryWithDraft(
          managementActor,
          yield* Schema.decodeUnknown(CreateEntryWithDraftInput)({
            ...input,
            commandId: rollbackCommandId,
            displayName: "Injected rollback",
          }),
          new Date("2026-08-08T10:59:50.000Z"),
          `m13-create-with-draft-rollback-${suffix}`,
        ),
      );
      const [rollbackRows] = yield* Effect.promise(() =>
        db
          .select({
            entries: sql<number>`(select count(*)::int from cms_entry where create_command_id = ${rollbackCommandId})`,
            shared: sql<number>`(select count(*)::int from cms_entry_shared_revision where command_id = ${rollbackCommandId})`,
            localized: sql<number>`(select count(*)::int from cms_entry_locale_revision where command_id = ${rollbackCommandId})`,
          })
          .from(cmsCollection)
          .limit(1),
      );

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
      assert.strictEqual(failureTag(failed), "ValidationFailure");
      assert.strictEqual(failedRows?.count, 0);
      assert.strictEqual(failureTag(rolledBack), "DatabaseFailure");
      assert.deepStrictEqual(rollbackRows, { entries: 0, shared: 0, localized: 0 });
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
        const rollback = yield* Effect.exit(
          makeEntryRepository({ failAfter: "revision" }).saveDraft(
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
              localizedMutations: [{ operation: "set", path: [localizedId], value: "Rolled back" }],
            }),
            new Date("2026-08-08T11:03:45.000Z"),
            `m7-rollback-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(rollback), "DatabaseFailure");
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
        const noOpCommand = randomUUID();
        const noOpInput = yield* Schema.decodeUnknown(SaveEntryDraftInput)({
          projectId: project.id,
          environmentId: project.environment.id,
          collectionId: collection.id,
          entryId: entry.id,
          locale: "en",
          schemaRevisionId: published.id,
          contractHash: published.contractHash,
          commandId: noOpCommand,
          expectedSharedVersion: 1,
          expectedLocalizedVersion: 1,
          sharedMutations: [{ operation: "set", path: [sharedId], value: "Alpha" }],
          localizedMutations: [],
        });
        const noOp = yield* entries.saveDraft(
          ownerActor,
          noOpInput,
          new Date("2026-08-08T11:04:00.000Z"),
          `m7-noop-${suffix}`,
        );
        const replay = yield* entries.saveDraft(
          ownerActor,
          noOpInput,
          new Date("2026-08-08T11:05:00.000Z"),
          `m7-noop-replay-${suffix}`,
        );
        assert.isFalse(noOp.sharedChanged);
        assert.strictEqual(replay.sharedVersion, 1);
        const commandConflict = yield* Effect.exit(
          entries.saveDraft(
            ownerActor,
            yield* Schema.decodeUnknown(SaveEntryDraftInput)({
              ...noOpInput,
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
              ...noOpInput,
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
        const outboxResult = yield* Effect.promise(() =>
          db.execute(
            sql`select count(*)::int as count from outbox_event where subject_id = ${entry.id} or payload::text like ${`%${entry.id}%`}`,
          ),
        );
        assert.strictEqual(Number(outboxResult.rows[0]?.count), 0);
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
});
