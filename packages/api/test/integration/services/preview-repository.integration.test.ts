// Verifies exact Preview scope/source authority, role projection, coherent transactions, retries, and audits in PostgreSQL.

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
  cmsEntry,
  cmsEntryLocaleDraft,
  cmsEntryLocaleRevision,
  cmsEntrySharedDraft,
  cmsEntrySharedRevision,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
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

import { CredentialPrincipal } from "../../../src/contracts/access";
import {
  GetCurrentUserPreviewInput,
  GetRevisionCredentialPreviewInput,
  GetRevisionUserPreviewInput,
  PreviewRouteScope,
} from "../../../src/contracts/preview";
import { AuthUserId } from "../../../src/contracts/platform";
import {
  CollectionFieldDefinition,
  defaultFieldEditorMetadata,
} from "../../../src/contracts/schemas";
import { compilePreviewDocument } from "../../../src/lib/preview-document";
import { PreviewDocumentEngineLive } from "../../../src/services/preview-document-engine";
import { hashSchemaContract } from "../../../src/services/schema-engine";
import {
  makePreviewRepository,
  PreviewRepository,
  PreviewRepositoryLive,
} from "../../../src/services/preview-repository";

const suffix = randomUUID();
const ids = {
  workspace: randomUUID(),
  project: randomUUID(),
  environment: randomUUID(),
  locale: randomUUID(),
  disabledLocale: randomUUID(),
  collection: randomUUID(),
  schemaOne: randomUUID(),
  schemaTwo: randomUUID(),
  sharedField: randomUUID(),
  localizedField: randomUUID(),
  entry: randomUUID(),
  emptyEntry: randomUUID(),
  sharedRevision: randomUUID(),
  localizedRevisionOne: randomUUID(),
  localizedRevisionTwo: randomUUID(),
  credential: randomUUID(),
};
const ownerId = `m10-preview-owner-${suffix}`;
const viewerId = `m10-preview-viewer-${suffix}`;
const viewerActor = Schema.decodeUnknownSync(AuthUserId)(viewerId);
const hiddenEditor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: ["owner"],
  editableByRoles: ["owner"],
} as const;

const sharedV1 = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: ids.sharedField,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "secret_note",
  displayLabel: "Secret note",
  kind: "short_text",
  required: false,
  localization: "shared",
  deprecated: false,
  position: 0,
  editor: hiddenEditor,
  configuration: {},
  children: [],
});
const sharedV2 = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  ...sharedV1,
  apiKey: "internal_note",
});
const localizedField = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: ids.localizedField,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "title",
  displayLabel: "Title",
  kind: "short_text",
  required: true,
  localization: "localized",
  deprecated: false,
  position: 1,
  editor: defaultFieldEditorMetadata,
  configuration: {},
  children: [],
});
const contractOne = hashSchemaContract({
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  collectionApiKey: "articles",
  fields: [sharedV1, localizedField],
});
const contractTwo = hashSchemaContract({
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  collectionApiKey: "articles",
  fields: [sharedV2, localizedField],
});
const principal = Schema.decodeUnknownSync(CredentialPrincipal)({
  credentialId: ids.credential,
  workspaceId: ids.workspace,
  projectId: ids.project,
  environmentId: ids.environment,
  family: "preview",
  scopes: ["preview.read"],
});
const currentCredentialInput = Schema.decodeUnknownSync(PreviewRouteScope)({
  projectId: ids.project,
  environmentKey: "main",
  collectionKey: "articles",
  entryId: ids.entry,
  locale: "en",
});
const revisionCredentialInput = Schema.decodeUnknownSync(GetRevisionCredentialPreviewInput)({
  ...currentCredentialInput,
  schemaRevisionId: ids.schemaOne,
  sharedRevisionId: ids.sharedRevision,
  localizedRevisionId: ids.localizedRevisionOne,
});
const currentUserInput = Schema.decodeUnknownSync(GetCurrentUserPreviewInput)({
  projectId: ids.project,
  environmentId: ids.environment,
  collectionId: ids.collection,
  entryId: ids.entry,
  locale: "en",
});
const revisionUserInput = Schema.decodeUnknownSync(GetRevisionUserPreviewInput)({
  ...currentUserInput,
  schemaRevisionId: ids.schemaOne,
  sharedRevisionId: ids.sharedRevision,
  localizedRevisionId: ids.localizedRevisionOne,
});

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  return typeof failure === "object" && failure !== null && "_tag" in failure
    ? String(failure._tag)
    : undefined;
}

function failureOperation(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  return typeof failure === "object" && failure !== null && "operation" in failure
    ? String(failure.operation)
    : undefined;
}

function revisionFieldValues(
  revisionId: string,
  field: typeof CollectionFieldDefinition.Type,
): typeof cmsSchemaRevisionField.$inferInsert {
  return {
    revisionId,
    fieldId: field.id,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    collectionId: ids.collection,
    parentFieldId: null,
    nodeRole: "root",
    referenceCollectionId: null,
    apiKey: field.apiKey,
    displayLabel: field.displayLabel,
    kind: field.kind,
    required: field.required,
    localization: field.localization,
    deprecated: field.deprecated,
    position: field.position,
    editorMetadata: { ...field.editor },
    configuration: { ...field.configuration },
  };
}

beforeAll(async () => {
  const now = new Date("2026-08-12T12:00:00.000Z");
  await db.insert(user).values([
    {
      id: ownerId,
      name: "M10 Preview Owner",
      email: `m10-preview-owner-${suffix}@example.test`,
      emailVerified: true,
    },
    {
      id: viewerId,
      name: "M10 Preview Viewer",
      email: `m10-preview-viewer-${suffix}@example.test`,
      emailVerified: true,
    },
  ]);
  await db.insert(workspace).values({
    id: ids.workspace,
    name: "M10 Preview Workspace",
    createdByUserId: ownerId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(workspaceMembership).values([
    {
      workspaceId: ids.workspace,
      userId: ownerId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    },
    {
      workspaceId: ids.workspace,
      userId: viewerId,
      role: "collaborator",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(project).values({
    id: ids.project,
    workspaceId: ids.workspace,
    name: "M10 Preview Project",
    key: `preview-${suffix.slice(0, 8)}`,
    description: null,
    createdByUserId: ownerId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(projectMembership).values({
    workspaceId: ids.workspace,
    projectId: ids.project,
    userId: viewerId,
    role: "read_only",
    localeAccessMode: "all",
    createdByUserId: ownerId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(environment).values({
    id: ids.environment,
    workspaceId: ids.workspace,
    projectId: ids.project,
    key: "main",
    name: "Main",
    isPrimary: true,
    createdByUserId: ownerId,
    createdAt: now,
  });
  await db.insert(projectCapability).values({
    workspaceId: ids.workspace,
    projectId: ids.project,
    key: "cms",
    status: "enabled",
    changedByUserId: ownerId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(projectLocale).values([
    {
      id: ids.locale,
      workspaceId: ids.workspace,
      projectId: ids.project,
      tag: "en",
      displayName: "English",
      status: "enabled",
      position: 0,
      createdByUserId: ownerId,
      changedByUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.disabledLocale,
      workspaceId: ids.workspace,
      projectId: ids.project,
      tag: "hi",
      displayName: "Hindi",
      status: "enabled",
      position: 1,
      createdByUserId: ownerId,
      changedByUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(cmsCollection).values({
    id: ids.collection,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    apiKey: "articles",
    displayName: "Articles",
    description: null,
    createdByUserId: ownerId,
    changedByUserId: ownerId,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(cmsCollectionField).values([
    {
      id: ids.sharedField,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      parentFieldId: null,
      nodeRole: "root",
      referenceCollectionId: null,
      apiKey: sharedV2.apiKey,
      displayLabel: sharedV2.displayLabel,
      kind: sharedV2.kind,
      required: sharedV2.required,
      localization: sharedV2.localization,
      deprecated: false,
      position: 0,
      editorMetadata: { ...sharedV2.editor },
      configuration: {},
      createdByUserId: ownerId,
      changedByUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.localizedField,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      parentFieldId: null,
      nodeRole: "root",
      referenceCollectionId: null,
      apiKey: localizedField.apiKey,
      displayLabel: localizedField.displayLabel,
      kind: localizedField.kind,
      required: localizedField.required,
      localization: localizedField.localization,
      deprecated: false,
      position: 1,
      editorMetadata: { ...localizedField.editor },
      configuration: {},
      createdByUserId: ownerId,
      changedByUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(cmsSchemaRevision).values([
    {
      id: ids.schemaOne,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      sequence: 1,
      previousRevisionId: null,
      collectionApiKey: "articles",
      collectionDisplayName: "Articles",
      collectionDescription: null,
      formatVersion: 2,
      validationProfile: "ffd-fields@1",
      currencyRegistryProfile: null,
      editorLayout: null,
      schemaHash: "1".repeat(64),
      commandId: randomUUID(),
      commandFingerprint: "2".repeat(64),
      publishedByUserId: ownerId,
      publishedAt: now,
    },
    {
      id: ids.schemaTwo,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      sequence: 2,
      previousRevisionId: ids.schemaOne,
      collectionApiKey: "articles",
      collectionDisplayName: "Articles",
      collectionDescription: null,
      formatVersion: 2,
      validationProfile: "ffd-fields@1",
      currencyRegistryProfile: null,
      editorLayout: null,
      schemaHash: "3".repeat(64),
      commandId: randomUUID(),
      commandFingerprint: "4".repeat(64),
      publishedByUserId: ownerId,
      publishedAt: new Date("2026-08-12T12:01:00.000Z"),
    },
  ]);
  await db
    .insert(cmsSchemaRevisionField)
    .values([
      revisionFieldValues(ids.schemaOne, sharedV1),
      revisionFieldValues(ids.schemaOne, localizedField),
      revisionFieldValues(ids.schemaTwo, sharedV2),
      revisionFieldValues(ids.schemaTwo, localizedField),
    ]);
  await db.insert(cmsCollectionSchemaHead).values({
    collectionId: ids.collection,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    draftVersion: 3,
    draftBaseRevisionId: ids.schemaTwo,
    currentPublishedRevisionId: ids.schemaTwo,
    currentPublishedSequence: 2,
    validationProfile: "ffd-fields@1",
    currencyRegistryProfile: null,
    editorLayout: null,
    changedByUserId: ownerId,
    updatedAt: new Date("2026-08-12T12:01:00.000Z"),
  });
  await db.insert(cmsEntry).values([
    {
      id: ids.entry,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      displayName: "Preview entry",
      createCommandId: randomUUID(),
      createCommandFingerprint: "5".repeat(64),
      createdByUserId: ownerId,
      changedByUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ids.emptyEntry,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      displayName: "Empty entry",
      createCommandId: randomUUID(),
      createCommandFingerprint: "6".repeat(64),
      createdByUserId: ownerId,
      changedByUserId: ownerId,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await db.insert(cmsEntrySharedRevision).values({
    id: ids.sharedRevision,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    collectionId: ids.collection,
    entryId: ids.entry,
    sequence: 1,
    previousRevisionId: null,
    schemaRevisionId: ids.schemaOne,
    contractHash: contractOne,
    values: { [ids.sharedField]: "Hidden draft" },
    valuesHash: "7".repeat(64),
    changedFieldIds: [ids.sharedField],
    commandId: randomUUID(),
    commandFingerprint: "8".repeat(64),
    restoredFromRevisionId: null,
    authoredByUserId: ownerId,
    authoredAt: now,
  });
  await db.insert(cmsEntryLocaleRevision).values([
    {
      id: ids.localizedRevisionOne,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      localeId: ids.locale,
      sequence: 1,
      previousRevisionId: null,
      schemaRevisionId: ids.schemaOne,
      contractHash: contractOne,
      values: { [ids.localizedField]: "Historical title" },
      valuesHash: "9".repeat(64),
      changedFieldIds: [ids.localizedField],
      commandId: randomUUID(),
      commandFingerprint: "a".repeat(64),
      restoredFromRevisionId: null,
      authoredByUserId: ownerId,
      authoredAt: now,
    },
    {
      id: ids.localizedRevisionTwo,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      localeId: ids.locale,
      sequence: 2,
      previousRevisionId: ids.localizedRevisionOne,
      schemaRevisionId: ids.schemaTwo,
      contractHash: contractTwo,
      values: { [ids.localizedField]: "Current title" },
      valuesHash: "b".repeat(64),
      changedFieldIds: [ids.localizedField],
      commandId: randomUUID(),
      commandFingerprint: "c".repeat(64),
      restoredFromRevisionId: null,
      authoredByUserId: ownerId,
      authoredAt: new Date("2026-08-12T12:02:00.000Z"),
    },
  ]);
  await db.insert(cmsEntrySharedDraft).values({
    entryId: ids.entry,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    collectionId: ids.collection,
    version: 1,
    currentRevisionId: ids.sharedRevision,
    changedByUserId: ownerId,
    updatedAt: now,
  });
  await db.insert(cmsEntryLocaleDraft).values({
    entryId: ids.entry,
    localeId: ids.locale,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    collectionId: ids.collection,
    version: 2,
    currentRevisionId: ids.localizedRevisionTwo,
    changedByUserId: ownerId,
    updatedAt: new Date("2026-08-12T12:02:00.000Z"),
  });
});

afterAll(async () => {
  await db.delete(auditEvent).where(eq(auditEvent.workspaceId, ids.workspace));
  await db.delete(cmsEntrySharedDraft).where(eq(cmsEntrySharedDraft.collectionId, ids.collection));
  await db.delete(cmsEntryLocaleDraft).where(eq(cmsEntryLocaleDraft.collectionId, ids.collection));
  await db
    .delete(cmsEntrySharedRevision)
    .where(eq(cmsEntrySharedRevision.collectionId, ids.collection));
  await db
    .delete(cmsEntryLocaleRevision)
    .where(eq(cmsEntryLocaleRevision.collectionId, ids.collection));
  await db.delete(cmsEntry).where(eq(cmsEntry.collectionId, ids.collection));
  await db
    .delete(cmsCollectionSchemaHead)
    .where(eq(cmsCollectionSchemaHead.collectionId, ids.collection));
  await db
    .delete(cmsSchemaRevisionField)
    .where(eq(cmsSchemaRevisionField.collectionId, ids.collection));
  await db.delete(cmsSchemaRevision).where(eq(cmsSchemaRevision.collectionId, ids.collection));
  await db.delete(cmsCollectionField).where(eq(cmsCollectionField.collectionId, ids.collection));
  await db.delete(cmsCollection).where(eq(cmsCollection.id, ids.collection));
  await db.delete(projectMembership).where(eq(projectMembership.projectId, ids.project));
  await db.delete(projectCapability).where(eq(projectCapability.projectId, ids.project));
  await db.delete(projectLocale).where(eq(projectLocale.projectId, ids.project));
  await db.delete(environment).where(eq(environment.projectId, ids.project));
  await db.delete(project).where(eq(project.id, ids.project));
  await db
    .delete(workspaceMembership)
    .where(or(eq(workspaceMembership.userId, ownerId), eq(workspaceMembership.userId, viewerId)));
  await db.delete(workspace).where(eq(workspace.id, ids.workspace));
  await db.delete(user).where(or(eq(user.id, ownerId), eq(user.id, viewerId)));
});

describe.sequential("Preview repository PostgreSQL integration", () => {
  it.effect(
    "projects current mixed-contract heads under the published schema and audits full credential authority",
    () =>
      Effect.gen(function* () {
        const item = yield* makePreviewRepository().getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:00:00.000Z"),
          "preview.current.credential",
        );
        const audits = yield* Effect.promise(() =>
          db
            .select()
            .from(auditEvent)
            .where(eq(auditEvent.requestId, "preview.current.credential")),
        );

        assert.strictEqual(String(item.preview.schemaRevisionId), ids.schemaTwo);
        assert.strictEqual(String(item.preview.sharedRevisionId), ids.sharedRevision);
        assert.strictEqual(String(item.preview.localizedRevisionId), ids.localizedRevisionTwo);
        assert.strictEqual(Reflect.get(item.data, "internal_note"), "Hidden draft");
        assert.strictEqual(Reflect.get(item.data, "title"), "Current title");
        assert.isFalse(Object.hasOwn(item.data, "secret_note"));
        assert.strictEqual(audits.length, 1);
        assert.strictEqual(audits[0]?.actorType, "credential");
        assert.strictEqual(audits[0]?.actorId, ids.credential);
        assert.strictEqual(audits[0]?.action, "cms.entry.preview.current.read");
        assert.strictEqual(audits[0]?.resourceId, ids.entry);
        assert.notInclude(JSON.stringify(audits), "Hidden draft");
        assert.notInclude(JSON.stringify(audits), "Current title");
      }),
  );

  it.effect("projects dashboard values and validation server-side for the authenticated role", () =>
    Effect.gen(function* () {
      const item = yield* makePreviewRepository().getUserCurrent(
        viewerActor,
        currentUserInput,
        new Date("2026-08-12T13:01:00.000Z"),
        "preview.current.user",
      );

      assert.isFalse(Object.hasOwn(item.data, "internal_note"));
      assert.strictEqual(Reflect.get(item.data, "title"), "Current title");
      const [audit] = yield* Effect.promise(() =>
        db.select().from(auditEvent).where(eq(auditEvent.requestId, "preview.current.user")),
      );
      assert.strictEqual(audit?.actorType, "user");
      assert.strictEqual(audit?.actorId, viewerId);
    }),
  );

  it.effect("projects the dashboard visibility matrix for every project role", () =>
    Effect.gen(function* () {
      const roles = [
        "owner",
        "developer",
        "content_admin",
        "editor",
        "reviewer",
        "client_editor",
        "read_only",
      ] as const;
      for (const role of roles) {
        yield* Effect.promise(() =>
          db.update(projectMembership).set({ role }).where(eq(projectMembership.userId, viewerId)),
        );
        const item = yield* makePreviewRepository().getUserCurrent(
          viewerActor,
          currentUserInput,
          new Date("2026-08-12T13:01:10.000Z"),
          `preview.role.${role}`,
        );
        assert.strictEqual(
          Object.hasOwn(item.data, "internal_note"),
          role === "owner",
          `${role} visibility must be server-projected`,
        );
        assert.strictEqual(Reflect.get(item.data, "title"), "Current title");
      }
      yield* Effect.promise(() =>
        db
          .update(projectMembership)
          .set({ role: "read_only" })
          .where(eq(projectMembership.userId, viewerId)),
      );
    }),
  );

  it.effect("enforces dashboard locale policy before reading or auditing content", () =>
    Effect.acquireUseRelease(
      Effect.promise(() =>
        db
          .update(projectMembership)
          .set({ localeAccessMode: "none" })
          .where(eq(projectMembership.userId, viewerId)),
      ),
      () =>
        Effect.gen(function* () {
          const denied = yield* Effect.exit(
            makePreviewRepository().getUserCurrent(
              viewerActor,
              currentUserInput,
              new Date("2026-08-12T13:01:30.000Z"),
              "preview.user.forbidden",
            ),
          );
          assert.strictEqual(failureTag(denied), "ForbiddenFailure");
          const audits = yield* Effect.promise(() =>
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(auditEvent)
              .where(eq(auditEvent.requestId, "preview.user.forbidden")),
          );
          assert.strictEqual(audits[0]?.count, 0);
        }),
      () =>
        Effect.promise(() =>
          db
            .update(projectMembership)
            .set({ localeAccessMode: "all" })
            .where(eq(projectMembership.userId, viewerId)),
        ),
    ),
  );

  it("fails lifecycle changes closed and restores access without changing preserved drafts", async () => {
    const repository = makePreviewRepository();
    await db
      .update(projectLocale)
      .set({ status: "disabled" })
      .where(eq(projectLocale.id, ids.disabledLocale));
    try {
      const disabledLocale = await Effect.runPromiseExit(
        repository.getCredentialCurrent(
          principal,
          Schema.decodeUnknownSync(PreviewRouteScope)({
            ...currentCredentialInput,
            locale: "hi",
          }),
          new Date("2026-08-12T13:01:40.000Z"),
          "preview.lifecycle.locale",
        ),
      );
      assert.strictEqual(failureTag(disabledLocale), "LocaleUnavailableFailure");
    } finally {
      await db
        .update(projectLocale)
        .set({ status: "enabled" })
        .where(eq(projectLocale.id, ids.disabledLocale));
    }

    await db
      .update(cmsCollectionSchemaHead)
      .set({
        draftBaseRevisionId: null,
        currentPublishedRevisionId: null,
        currentPublishedSequence: 0,
      })
      .where(eq(cmsCollectionSchemaHead.collectionId, ids.collection));
    try {
      const unpublished = await Effect.runPromiseExit(
        repository.getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:01:45.000Z"),
          "preview.lifecycle.unpublished",
        ),
      );
      assert.strictEqual(failureTag(unpublished), "PublishedSchemaRequiredFailure");
    } finally {
      await db
        .update(cmsCollectionSchemaHead)
        .set({
          draftBaseRevisionId: ids.schemaTwo,
          currentPublishedRevisionId: ids.schemaTwo,
          currentPublishedSequence: 2,
        })
        .where(eq(cmsCollectionSchemaHead.collectionId, ids.collection));
    }

    await db
      .update(projectCapability)
      .set({ status: "disabled" })
      .where(eq(projectCapability.projectId, ids.project));
    try {
      const publicDisabled = await Effect.runPromiseExit(
        repository.getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:01:50.000Z"),
          "preview.lifecycle.cms.public",
        ),
      );
      const userDisabled = await Effect.runPromiseExit(
        repository.getUserCurrent(
          viewerActor,
          currentUserInput,
          new Date("2026-08-12T13:01:51.000Z"),
          "preview.lifecycle.cms.user",
        ),
      );
      assert.strictEqual(failureTag(publicDisabled), "NotFoundFailure");
      assert.strictEqual(failureTag(userDisabled), "CmsCapabilityRequiredFailure");
    } finally {
      await db
        .update(projectCapability)
        .set({ status: "enabled" })
        .where(eq(projectCapability.projectId, ids.project));
    }

    await db
      .update(project)
      .set({
        archivedAt: new Date("2026-08-12T13:01:55.000Z"),
        archivedByUserId: ownerId,
      })
      .where(eq(project.id, ids.project));
    try {
      const publicArchived = await Effect.runPromiseExit(
        repository.getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:01:56.000Z"),
          "preview.lifecycle.archived.public",
        ),
      );
      const userArchived = await Effect.runPromiseExit(
        repository.getUserCurrent(
          viewerActor,
          currentUserInput,
          new Date("2026-08-12T13:01:57.000Z"),
          "preview.lifecycle.archived.user",
        ),
      );
      assert.strictEqual(failureTag(publicArchived), "NotFoundFailure");
      assert.strictEqual(failureTag(userArchived), "InvalidStateTransitionFailure");
    } finally {
      await db
        .update(project)
        .set({ archivedAt: null, archivedByUserId: null })
        .where(eq(project.id, ids.project));
    }

    const restored = await Effect.runPromise(
      repository.getCredentialCurrent(
        principal,
        currentCredentialInput,
        new Date("2026-08-12T13:01:58.000Z"),
        "preview.lifecycle.restored",
      ),
    );
    assert.strictEqual(Reflect.get(restored.data, "title"), "Current title");
  });

  it.effect(
    "reproduces explicit historical API keys, supports none, and rejects mixed contracts",
    () =>
      Effect.gen(function* () {
        const repository = makePreviewRepository();
        const historical = yield* repository.getCredentialRevision(
          principal,
          revisionCredentialInput,
          new Date("2026-08-12T13:02:00.000Z"),
          "preview.revision.compatible",
        );
        const none = yield* repository.getUserRevision(
          viewerActor,
          Schema.decodeUnknownSync(GetRevisionUserPreviewInput)({
            ...revisionUserInput,
            sharedRevisionId: null,
            localizedRevisionId: null,
          }),
          new Date("2026-08-12T13:03:00.000Z"),
          "preview.revision.none",
        );
        const incompatible = yield* Effect.exit(
          repository.getCredentialRevision(
            principal,
            Schema.decodeUnknownSync(GetRevisionCredentialPreviewInput)({
              ...revisionCredentialInput,
              localizedRevisionId: ids.localizedRevisionTwo,
            }),
            new Date("2026-08-12T13:04:00.000Z"),
            "preview.revision.incompatible",
          ),
        );

        assert.strictEqual(historical.preview.source, "revision");
        assert.strictEqual(Reflect.get(historical.data, "secret_note"), "Hidden draft");
        assert.strictEqual(Reflect.get(historical.data, "title"), "Historical title");
        assert.strictEqual(none.preview.sharedVersion, 0);
        assert.strictEqual(none.preview.localizedVersion, 0);
        assert.isFalse(none.validation.valid);
        assert.strictEqual(none.validation.issues[0]?.code, "required");
        assert.strictEqual(failureTag(incompatible), "PreviewRevisionIncompatibleFailure");
        const failedAudits = yield* Effect.promise(() =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(auditEvent)
            .where(eq(auditEvent.requestId, "preview.revision.incompatible")),
        );
        assert.strictEqual(failedAudits[0]?.count, 0);
      }),
  );

  it.effect("uses exact version-zero current sources for entries without draft heads", () =>
    Effect.gen(function* () {
      const item = yield* makePreviewRepository().getCredentialCurrent(
        principal,
        Schema.decodeUnknownSync(PreviewRouteScope)({
          ...currentCredentialInput,
          entryId: ids.emptyEntry,
        }),
        new Date("2026-08-12T13:05:00.000Z"),
        "preview.current.empty",
      );

      assert.strictEqual(item.preview.sharedVersion, 0);
      assert.strictEqual(item.preview.localizedVersion, 0);
      assert.isNull(item.preview.sharedRevisionId);
      assert.isNull(item.preview.localizedRevisionId);
      assert.isFalse(item.validation.valid);
    }),
  );

  it.effect(
    "fails scope, oversized, corruption, and audit outcomes closed without successful-access audits",
    () =>
      Effect.gen(function* () {
        const wrongFamily = yield* Effect.exit(
          makePreviewRepository().getCredentialCurrent(
            Schema.decodeUnknownSync(CredentialPrincipal)({
              ...principal,
              family: "delivery",
              scopes: ["delivery.read"],
            }),
            currentCredentialInput,
            new Date("2026-08-12T13:05:50.000Z"),
            "preview.failed.family",
          ),
        );
        const missingScope = yield* Effect.exit(
          makePreviewRepository().getCredentialCurrent(
            Schema.decodeUnknownSync(CredentialPrincipal)({
              ...principal,
              scopes: ["content.read"],
            }),
            currentCredentialInput,
            new Date("2026-08-12T13:05:55.000Z"),
            "preview.failed.required-scope",
          ),
        );
        const wrongProject = yield* Effect.exit(
          makePreviewRepository().getCredentialCurrent(
            principal,
            Schema.decodeUnknownSync(PreviewRouteScope)({
              ...currentCredentialInput,
              projectId: randomUUID(),
            }),
            new Date("2026-08-12T13:05:58.000Z"),
            "preview.failed.project",
          ),
        );
        const wrongPrincipal = Schema.decodeUnknownSync(CredentialPrincipal)({
          ...principal,
          environmentId: randomUUID(),
        });
        const wrongScope = yield* Effect.exit(
          makePreviewRepository().getCredentialCurrent(
            wrongPrincipal,
            currentCredentialInput,
            new Date("2026-08-12T13:06:00.000Z"),
            "preview.failed.scope",
          ),
        );
        const missingCollection = yield* Effect.exit(
          makePreviewRepository().getCredentialCurrent(
            principal,
            Schema.decodeUnknownSync(PreviewRouteScope)({
              ...currentCredentialInput,
              collectionKey: "missing",
            }),
            new Date("2026-08-12T13:06:10.000Z"),
            "preview.failed.collection",
          ),
        );
        const missingEntry = yield* Effect.exit(
          makePreviewRepository().getCredentialCurrent(
            principal,
            Schema.decodeUnknownSync(PreviewRouteScope)({
              ...currentCredentialInput,
              entryId: randomUUID(),
            }),
            new Date("2026-08-12T13:06:20.000Z"),
            "preview.failed.entry",
          ),
        );
        const missingLocale = yield* Effect.exit(
          makePreviewRepository().getCredentialCurrent(
            principal,
            Schema.decodeUnknownSync(PreviewRouteScope)({
              ...currentCredentialInput,
              locale: "fr",
            }),
            new Date("2026-08-12T13:06:30.000Z"),
            "preview.failed.locale",
          ),
        );
        const missingRevision = yield* Effect.exit(
          makePreviewRepository().getCredentialRevision(
            principal,
            Schema.decodeUnknownSync(GetRevisionCredentialPreviewInput)({
              ...revisionCredentialInput,
              localizedRevisionId: randomUUID(),
            }),
            new Date("2026-08-12T13:06:40.000Z"),
            "preview.failed.revision",
          ),
        );
        const oversized = yield* Effect.exit(
          makePreviewRepository({
            compile: (input) => {
              const result = compilePreviewDocument(input);
              return result.ok ? { ...result, responseBytes: 2_621_441 } : result;
            },
          }).getCredentialCurrent(
            principal,
            currentCredentialInput,
            new Date("2026-08-12T13:07:00.000Z"),
            "preview.failed.oversized",
          ),
        );
        const corrupt = yield* Effect.exit(
          makePreviewRepository({
            compile: () => ({ ok: false, issues: [], capped: false }),
          }).getCredentialCurrent(
            principal,
            currentCredentialInput,
            new Date("2026-08-12T13:08:00.000Z"),
            "preview.failed.corrupt",
          ),
        );
        const auditFailure = yield* Effect.exit(
          makePreviewRepository({ testFailBeforeAudit: true }).getCredentialCurrent(
            principal,
            currentCredentialInput,
            new Date("2026-08-12T13:09:00.000Z"),
            "preview.failed.audit",
          ),
        );

        assert.strictEqual(failureTag(wrongFamily), "CredentialInvalidFailure");
        assert.strictEqual(failureTag(missingScope), "CredentialInvalidFailure");
        assert.strictEqual(failureTag(wrongProject), "CredentialInvalidFailure");
        assert.strictEqual(failureTag(wrongScope), "CredentialInvalidFailure");
        assert.strictEqual(failureTag(missingCollection), "NotFoundFailure");
        assert.strictEqual(failureTag(missingEntry), "NotFoundFailure");
        assert.strictEqual(failureTag(missingLocale), "LocaleUnavailableFailure");
        assert.strictEqual(failureTag(missingRevision), "NotFoundFailure");
        assert.strictEqual(failureTag(oversized), "PreviewResponseTooLargeFailure");
        assert.strictEqual(failureTag(corrupt), "PreviewDocumentCorruptFailure");
        assert.strictEqual(failureTag(auditFailure), "DatabaseFailure");
        assert.strictEqual(failureOperation(auditFailure), "preview.audit");
        const failedAuditCount = yield* Effect.promise(() =>
          db
            .select({ count: sql<number>`count(*)::int` })
            .from(auditEvent)
            .where(sql`${auditEvent.requestId} like 'preview.failed.%'`),
        );
        assert.strictEqual(failedAuditCount[0]?.count, 0);
      }),
  );

  it("never combines source heads across a concurrent atomic save", async () => {
    const nextSharedRevisionId = randomUUID();
    const nextLocalizedRevisionId = randomUUID();
    await db.insert(cmsEntrySharedRevision).values({
      id: nextSharedRevisionId,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      sequence: 2,
      previousRevisionId: ids.sharedRevision,
      schemaRevisionId: ids.schemaTwo,
      contractHash: contractTwo,
      values: { [ids.sharedField]: "Concurrent hidden draft" },
      valuesHash: "d".repeat(64),
      changedFieldIds: [ids.sharedField],
      commandId: randomUUID(),
      commandFingerprint: "e".repeat(64),
      restoredFromRevisionId: null,
      authoredByUserId: ownerId,
      authoredAt: new Date("2026-08-12T13:09:30.000Z"),
    });
    await db.insert(cmsEntryLocaleRevision).values({
      id: nextLocalizedRevisionId,
      workspaceId: ids.workspace,
      projectId: ids.project,
      environmentId: ids.environment,
      collectionId: ids.collection,
      entryId: ids.entry,
      localeId: ids.locale,
      sequence: 3,
      previousRevisionId: ids.localizedRevisionTwo,
      schemaRevisionId: ids.schemaTwo,
      contractHash: contractTwo,
      values: { [ids.localizedField]: "Concurrent current title" },
      valuesHash: "f".repeat(64),
      changedFieldIds: [ids.localizedField],
      commandId: randomUUID(),
      commandFingerprint: "0".repeat(64),
      restoredFromRevisionId: null,
      authoredByUserId: ownerId,
      authoredAt: new Date("2026-08-12T13:09:30.000Z"),
    });
    let saved = false;
    try {
      const item = await Effect.runPromise(
        makePreviewRepository({
          testAfterSharedHeadRead: async () => {
            if (saved) return;
            saved = true;
            await db.transaction(async (transaction) => {
              await transaction
                .update(cmsEntrySharedDraft)
                .set({ version: 2, currentRevisionId: nextSharedRevisionId })
                .where(eq(cmsEntrySharedDraft.entryId, ids.entry));
              await transaction
                .update(cmsEntryLocaleDraft)
                .set({ version: 3, currentRevisionId: nextLocalizedRevisionId })
                .where(eq(cmsEntryLocaleDraft.entryId, ids.entry));
            });
          },
        }).getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:09:31.000Z"),
          "preview.concurrent.coherent",
        ),
      );

      assert.strictEqual(String(item.preview.sharedRevisionId), ids.sharedRevision);
      assert.strictEqual(String(item.preview.localizedRevisionId), ids.localizedRevisionTwo);
      assert.strictEqual(Reflect.get(item.data, "internal_note"), "Hidden draft");
      assert.strictEqual(Reflect.get(item.data, "title"), "Current title");
    } finally {
      await db.transaction(async (transaction) => {
        await transaction
          .update(cmsEntrySharedDraft)
          .set({ version: 1, currentRevisionId: ids.sharedRevision })
          .where(eq(cmsEntrySharedDraft.entryId, ids.entry));
        await transaction
          .update(cmsEntryLocaleDraft)
          .set({ version: 2, currentRevisionId: ids.localizedRevisionTwo })
          .where(eq(cmsEntryLocaleDraft.entryId, ids.entry));
      });
      await db
        .delete(cmsEntrySharedRevision)
        .where(eq(cmsEntrySharedRevision.id, nextSharedRevisionId));
      await db
        .delete(cmsEntryLocaleRevision)
        .where(eq(cmsEntryLocaleRevision.id, nextLocalizedRevisionId));
    }
  });

  it.effect("retries the whole transaction once only for SQLSTATE 40001", () =>
    Effect.gen(function* () {
      let attempts = 0;
      const repository = makePreviewRepository({
        runTransaction: async (work) => {
          attempts += 1;
          if (attempts === 1) {
            throw Object.assign(new Error("serialization failure"), { code: "40001" });
          }
          return db.transaction(
            async (transaction) => {
              const result = await work(transaction);
              const settings = await transaction.execute(sql`
                select
                  current_setting('transaction_isolation') as isolation,
                  current_setting('statement_timeout') as statement_timeout,
                  current_setting('idle_in_transaction_session_timeout') as idle_timeout
              `);
              const decoded = Schema.decodeUnknownSync(
                Schema.Struct({
                  rows: Schema.Array(
                    Schema.Struct({
                      isolation: Schema.String,
                      statement_timeout: Schema.String,
                      idle_timeout: Schema.String,
                    }),
                  ),
                }),
              )(settings);
              assert.strictEqual(decoded.rows[0]?.isolation, "repeatable read");
              assert.strictEqual(decoded.rows[0]?.statement_timeout, "750ms");
              assert.strictEqual(decoded.rows[0]?.idle_timeout, "2s");
              return result;
            },
            {
              isolationLevel: "repeatable read",
              accessMode: "read write",
            },
          );
        },
      });
      const item = yield* repository.getCredentialCurrent(
        principal,
        currentCredentialInput,
        new Date("2026-08-12T13:10:00.000Z"),
        "preview.retry.once",
      );
      let repeatedAttempts = 0;
      const repeated = yield* Effect.exit(
        makePreviewRepository({
          runTransaction: async () => {
            repeatedAttempts += 1;
            throw Object.assign(new Error("serialization failure"), { code: "40001" });
          },
        }).getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:11:00.000Z"),
          "preview.retry.repeated",
        ),
      );
      let deadlockAttempts = 0;
      const deadlock = yield* Effect.exit(
        makePreviewRepository({
          runTransaction: async () => {
            deadlockAttempts += 1;
            throw Object.assign(new Error("deadlock detected"), { code: "40P01" });
          },
        }).getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:11:30.000Z"),
          "preview.retry.deadlock",
        ),
      );
      let unknownAttempts = 0;
      const unknown = yield* Effect.exit(
        makePreviewRepository({
          runTransaction: async () => {
            unknownAttempts += 1;
            throw Object.assign(new Error("connection lost"), { code: "08006" });
          },
        }).getCredentialCurrent(
          principal,
          currentCredentialInput,
          new Date("2026-08-12T13:12:00.000Z"),
          "preview.retry.unknown",
        ),
      );

      assert.strictEqual(String(item.id), ids.entry);
      assert.strictEqual(attempts, 2);
      assert.strictEqual(repeatedAttempts, 2);
      assert.strictEqual(deadlockAttempts, 1);
      assert.strictEqual(unknownAttempts, 1);
      assert.strictEqual(failureTag(repeated), "DatabaseFailure");
      assert.strictEqual(failureTag(deadlock), "DatabaseFailure");
      assert.strictEqual(failureTag(unknown), "DatabaseFailure");
      const audits = yield* Effect.promise(() =>
        db.select().from(auditEvent).where(eq(auditEvent.requestId, "preview.retry.once")),
      );
      assert.strictEqual(audits.length, 1);
    }),
  );

  it.effect("composes the live repository Layer with the shared compiler", () =>
    Effect.gen(function* () {
      const repository = yield* PreviewRepository;
      const item = yield* repository.getCredentialCurrent(
        principal,
        currentCredentialInput,
        new Date("2026-08-12T13:15:00.000Z"),
        "preview.live.layer",
      );
      assert.strictEqual(String(item.id), ids.entry);
    }).pipe(Effect.provide(PreviewRepositoryLive), Effect.provide(PreviewDocumentEngineLive)),
  );

  it("uses direct current-head, revision, schema-field, and audit indexes", async () => {
    const plans = await db.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      const sharedHead = await transaction.execute(
        sql`explain (format json) select current_revision_id from cms_entry_shared_draft where entry_id = ${ids.entry}`,
      );
      const localizedHead = await transaction.execute(
        sql`explain (format json) select current_revision_id from cms_entry_locale_draft where entry_id = ${ids.entry} and locale_id = ${ids.locale}`,
      );
      const sharedRevision = await transaction.execute(
        sql`explain (format json) select values from cms_entry_shared_revision where id = ${ids.sharedRevision} and entry_id = ${ids.entry} and collection_id = ${ids.collection} and environment_id = ${ids.environment} and project_id = ${ids.project} and workspace_id = ${ids.workspace}`,
      );
      const localizedRevision = await transaction.execute(
        sql`explain (format json) select values from cms_entry_locale_revision where id = ${ids.localizedRevisionTwo} and entry_id = ${ids.entry} and locale_id = ${ids.locale} and collection_id = ${ids.collection} and environment_id = ${ids.environment} and project_id = ${ids.project} and workspace_id = ${ids.workspace}`,
      );
      const schemaFields = await transaction.execute(
        sql`explain (format json) select field_id from cms_schema_revision_field where revision_id = ${ids.schemaTwo} order by parent_field_id, position, field_id`,
      );
      const audits = await transaction.execute(
        sql`explain (format json) select id from audit_event where environment_id = ${ids.environment}`,
      );
      return JSON.stringify([
        sharedHead.rows,
        localizedHead.rows,
        sharedRevision.rows,
        localizedRevision.rows,
        schemaFields.rows,
        audits.rows,
      ]);
    });

    assert.include(plans, "cms_entry_shared_draft_pkey");
    assert.include(plans, "cms_entry_locale_draft_locale_entry_idx");
    assert.match(
      plans,
      /cms_entry_shared_revision_(?:pkey|id_entry_scope_unique|id_entry_sequence_unique|entry_sequence_idx)/u,
      "shared revision loading must use indexed ID or entry authority",
    );
    assert.include(plans, "cms_entry_locale_revision_locale_idx");
    assert.match(
      plans,
      /cms_revision_field_(?:revision_field_pk|parent_position_idx)/u,
      "schema field loading must use a revision-leading index",
    );
    assert.include(plans, "audit_event_environment_idx");
  });

  it.effect("runs parallel same-entry reads with one independent audit per success", () =>
    Effect.gen(function* () {
      const repository = makePreviewRepository();
      const reads = Array.from({ length: 8 }, (_, index) =>
        repository.getUserCurrent(
          viewerActor,
          currentUserInput,
          new Date(`2026-08-12T13:20:0${index}.000Z`),
          `preview.parallel.${index}`,
        ),
      );
      const items = yield* Effect.all(reads, { concurrency: "unbounded" });
      const audits = yield* Effect.promise(() =>
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(auditEvent)
          .where(sql`${auditEvent.requestId} like 'preview.parallel.%'`),
      );

      assert.strictEqual(items.length, 8);
      assert.strictEqual(audits[0]?.count, 8);
    }),
  );
});
