// Verifies the core M8 publication lifecycle against PostgreSQL while rolling append-only artifacts back.

import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, inArray, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionDeliveryField,
  cmsCollectionField,
  cmsCollectionLocaleDeliveryState,
  cmsCollectionSchemaHead,
  cmsEntry,
  cmsEntryDraftCommand,
  cmsEntryLocaleDeliveryCurrentValue,
  cmsEntryLocaleDeliverySnapshot,
  cmsEntryLocaleDraft,
  cmsEntryLocalePublication,
  cmsEntryLocalePublicationHead,
  cmsEntryLocalePublicationReference,
  cmsEntryLocaleRevision,
  cmsEntryPublicationCommand,
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

import { CreateEntryInput, SaveEntryDraftInput } from "../contracts/entries";
import { CreateProjectLocaleInput } from "../contracts/locales";
import {
  GetEntryPublicationStatusInput,
  ListEntryPublicationsInput,
  PublishEntryInput,
  UnpublishEntryInput,
  ValidateEntryPublicationInput,
} from "../contracts/publications";
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
  defaultFieldEditorMetadata,
  PublishCollectionSchemaInput,
  ValidateCollectionSchemaInput,
  type CmsCollection,
  type PublishedSchemaRevision,
} from "../contracts/schemas";
import { makeDeliveryCursorSignerLive } from "./delivery-cursor-signer";
import { makeDeliveryReadRepository } from "./delivery-read-repository";
import { makeEntryRepository } from "./entry-repository";
import { makeLocaleRepository } from "./locale-repository";
import { makePlatformRepository } from "./platform-repository";
import { makePublicationRepository, type PublicationFailureStage } from "./publication-repository";
import { makeSchemaRepository } from "./schema-repository";

const suffix = randomUUID();
const ownerId = `m8-publication-owner-${suffix}`;
const ownerActor = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const platform = makePlatformRepository();
const schemas = makeSchemaRepository();
const entries = makeEntryRepository();
const locales = makeLocaleRepository();

let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;
let collectionModel: CmsCollection | undefined;
let publishedModel: PublishedSchemaRevision | undefined;
let entryId: string | undefined;
let targetEntryId: string | undefined;
let titleFieldId: string | undefined;
let referenceFieldId: string | undefined;
let sharedFieldId: string | undefined;

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
  await db.insert(user).values({
    id: ownerId,
    name: "M8 Publication Owner",
    email: `m8-publication-${suffix}@example.test`,
    emailVerified: true,
  });
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      ownerActor,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M8 Publication Workspace" }),
      `m8-workspace-${suffix}`,
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M8 Publication Project",
        key: `pub-${suffix.slice(0, 8)}`,
        description: null,
      }),
      `m8-project-${suffix}`,
    ),
  );
  const currentProject = required(projectModel, "project");
  await Effect.runPromise(
    platform.enableCapability(
      ownerActor,
      Schema.decodeUnknownSync(EnableCapabilityInput)({
        projectId: currentProject.id,
        capability: "cms",
      }),
      `m8-capability-${suffix}`,
    ),
  );
  await Effect.runPromise(
    locales.createLocale(
      ownerActor,
      Schema.decodeUnknownSync(CreateProjectLocaleInput)({
        projectId: currentProject.id,
        tag: "hi",
        displayName: "Hindi",
      }),
      new Date("2026-08-09T09:59:00.000Z"),
      `m8-hindi-${suffix}`,
    ),
  );
  collectionModel = await Effect.runPromise(
    schemas.createCollection(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        apiKey: "publication_articles",
        displayName: "Publication articles",
        description: null,
      }),
      new Date("2026-08-09T10:00:00.000Z"),
      `m8-collection-${suffix}`,
    ),
  );
  const draft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: required(collectionModel, "collection").draftVersion,
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
      new Date("2026-08-09T10:01:00.000Z"),
      `m8-field-${suffix}`,
    ),
  );
  titleFieldId = draft.fields[0]?.id;
  const referenceDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: draft.collection.draftVersion,
        parentFieldId: null,
        field: {
          apiKey: "related_entry",
          displayLabel: "Related entry",
          kind: "reference",
          required: false,
          localization: "localized",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: { targetCollectionId: required(collectionModel, "collection").id },
        },
      }),
      new Date("2026-08-09T10:01:30.000Z"),
      `m8-reference-field-${suffix}`,
    ),
  );
  referenceFieldId = referenceDraft.fields[1]?.id;
  const sharedDraft = await Effect.runPromise(
    schemas.createField(
      ownerActor,
      Schema.decodeUnknownSync(CreateCollectionFieldInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        draftVersion: referenceDraft.collection.draftVersion,
        parentFieldId: null,
        field: {
          apiKey: "shared_note",
          displayLabel: "Shared note",
          kind: "short_text",
          required: false,
          localization: "shared",
          deprecated: false,
          editor: defaultFieldEditorMetadata,
          configuration: {},
        },
      }),
      new Date("2026-08-09T10:01:45.000Z"),
      `m8-shared-field-${suffix}`,
    ),
  );
  sharedFieldId = sharedDraft.fields[2]?.id;
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
        draftVersion: sharedDraft.collection.draftVersion,
        expectedPublishedRevisionId: null,
        commandId: randomUUID(),
        acknowledgedChangeIds: validation.changes.items
          .filter((change) => change.classification !== "non_breaking")
          .map((change) => change.changeId),
      }),
      new Date("2026-08-09T10:02:00.000Z"),
      `m8-schema-publish-${suffix}`,
    ),
  );
  const created = await Effect.runPromise(
    entries.createEntry(
      ownerActor,
      Schema.decodeUnknownSync(CreateEntryInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        locale: "en",
        displayName: "Publication entry",
        schemaRevisionId: required(publishedModel, "published schema").id,
        contractHash: required(publishedModel, "published schema").contractHash,
        commandId: randomUUID(),
      }),
      new Date("2026-08-09T10:03:00.000Z"),
      `m8-entry-${suffix}`,
    ),
  );
  entryId = created.id;
  const target = await Effect.runPromise(
    entries.createEntry(
      ownerActor,
      Schema.decodeUnknownSync(CreateEntryInput)({
        projectId: currentProject.id,
        environmentId: currentProject.environment.id,
        collectionId: required(collectionModel, "collection").id,
        locale: "en",
        displayName: "Reference target",
        schemaRevisionId: required(publishedModel, "published schema").id,
        contractHash: required(publishedModel, "published schema").contractHash,
        commandId: randomUUID(),
      }),
      new Date("2026-08-09T10:03:30.000Z"),
      `m8-target-entry-${suffix}`,
    ),
  );
  targetEntryId = target.id;
});

afterAll(async () => {
  const collectionId = collectionModel?.id;
  if (collectionId) {
    await db.delete(outboxEvent).where(eq(outboxEvent.subjectId, collectionId));
    await db
      .delete(cmsEntryDraftCommand)
      .where(eq(cmsEntryDraftCommand.collectionId, collectionId));
    await db
      .delete(cmsEntryLocaleDeliveryCurrentValue)
      .where(eq(cmsEntryLocaleDeliveryCurrentValue.collectionId, collectionId));
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
    await db
      .delete(cmsCollectionDeliveryField)
      .where(eq(cmsCollectionDeliveryField.collectionId, collectionId));
    await db.delete(cmsCollectionField).where(eq(cmsCollectionField.collectionId, collectionId));
    await db
      .delete(cmsCollectionLocaleDeliveryState)
      .where(eq(cmsCollectionLocaleDeliveryState.collectionId, collectionId));
    await db
      .delete(cmsCollectionDeliveryConfig)
      .where(eq(cmsCollectionDeliveryConfig.collectionId, collectionId));
    await db.delete(cmsCollection).where(eq(cmsCollection.id, collectionId));
  }
  await db.delete(auditEvent).where(eq(auditEvent.actorId, ownerId));
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
  await db.delete(workspaceMembership).where(eq(workspaceMembership.userId, ownerId));
  await db.delete(workspace).where(eq(workspace.id, required(workspaceModel, "workspace").id));
  await db.delete(user).where(eq(user.id, ownerId));
});

describe.sequential("publication repository PostgreSQL integration", () => {
  it("linearizes exact-locale references and serializes publication command authority atomically", async () => {
    const currentProject = required(projectModel, "project");
    const currentCollection = required(collectionModel, "collection");
    const currentPublished = required(publishedModel, "published schema");
    const currentEntryId = required(entryId, "entry");
    const currentTargetEntryId = required(targetEntryId, "target entry");
    const currentTitleFieldId = required(titleFieldId, "title field");
    const currentReferenceFieldId = required(referenceFieldId, "reference field");
    const currentSharedFieldId = required(sharedFieldId, "shared field");
    const scope = {
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
      collectionId: currentCollection.id,
      entryId: currentEntryId,
      locale: "en",
    };
    const invalid = await Effect.runPromise(
      makePublicationRepository().validate(
        ownerActor,
        Schema.decodeUnknownSync(ValidateEntryPublicationInput)(scope),
        new Date("2026-08-09T10:04:00.000Z"),
      ),
    );
    assert.isFalse(invalid.valid);
    assert.strictEqual(invalid.issues[0]?.code, "required");
    await Effect.runPromise(
      entries.saveDraft(
        ownerActor,
        Schema.decodeUnknownSync(SaveEntryDraftInput)({
          ...scope,
          schemaRevisionId: currentPublished.id,
          contractHash: currentPublished.contractHash,
          commandId: randomUUID(),
          expectedSharedVersion: 0,
          expectedLocalizedVersion: 0,
          sharedMutations: [],
          localizedMutations: [
            { operation: "set", path: [currentTitleFieldId], value: "Published title" },
            {
              operation: "set",
              path: [currentReferenceFieldId],
              value: currentTargetEntryId,
            },
          ],
        }),
        new Date("2026-08-09T10:05:00.000Z"),
        `m8-save-${suffix}`,
      ),
    );
    const targetScope = { ...scope, entryId: currentTargetEntryId };
    await Effect.runPromise(
      entries.saveDraft(
        ownerActor,
        Schema.decodeUnknownSync(SaveEntryDraftInput)({
          ...targetScope,
          schemaRevisionId: currentPublished.id,
          contractHash: currentPublished.contractHash,
          commandId: randomUUID(),
          expectedSharedVersion: 0,
          expectedLocalizedVersion: 0,
          sharedMutations: [
            { operation: "set", path: [currentSharedFieldId], value: "Shared value one" },
          ],
          localizedMutations: [
            { operation: "set", path: [currentTitleFieldId], value: "Reference target" },
          ],
        }),
        new Date("2026-08-09T10:05:30.000Z"),
        `m8-save-target-${suffix}`,
      ),
    );
    const hindiTargetScope = { ...targetScope, locale: "hi" };
    await Effect.runPromise(
      entries.saveDraft(
        ownerActor,
        Schema.decodeUnknownSync(SaveEntryDraftInput)({
          ...hindiTargetScope,
          schemaRevisionId: currentPublished.id,
          contractHash: currentPublished.contractHash,
          commandId: randomUUID(),
          expectedSharedVersion: 1,
          expectedLocalizedVersion: 0,
          sharedMutations: [],
          localizedMutations: [
            { operation: "set", path: [currentTitleFieldId], value: "संदर्भ लक्ष्य" },
          ],
        }),
        new Date("2026-08-09T10:05:45.000Z"),
        `m8-save-target-hi-${suffix}`,
      ),
    );

    let reachedRollback = false;
    try {
      await db.transaction(async (transaction) => {
        const publications = makePublicationRepository({
          executor: transaction,
          runTransaction: (work) => work(transaction),
        });
        await transaction
          .update(cmsCollectionDeliveryConfig)
          .set({ version: 2 })
          .where(eq(cmsCollectionDeliveryConfig.collectionId, currentCollection.id));
        await transaction.insert(cmsCollectionDeliveryField).values({
          collectionId: currentCollection.id,
          fieldId: currentTitleFieldId,
          workspaceId: currentProject.workspaceId,
          projectId: currentProject.id,
          environmentId: currentProject.environment.id,
          filterable: true,
          sortable: true,
          uniqueLookup: true,
        });
        const missingTargetPlan = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(scope),
            new Date("2026-08-09T10:06:00.000Z"),
          ),
        );
        assert.isFalse(missingTargetPlan.valid);
        const referenceIssue = missingTargetPlan.issues.find(
          (issue) => issue.code === "reference_target_locale_unpublished",
        );
        assert.strictEqual(referenceIssue?.target?.entryId, currentTargetEntryId);
        assert.strictEqual(referenceIssue?.target?.displayName, "Reference target");

        const targetPlan = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(targetScope),
            new Date("2026-08-09T10:06:15.000Z"),
          ),
        );
        const targetPublished = await Effect.runPromise(
          publications.publish(
            ownerActor,
            Schema.decodeUnknownSync(PublishEntryInput)({
              ...targetScope,
              commandId: randomUUID(),
              authorityHash: targetPlan.authorityHash,
              expectedStateVersion: targetPlan.stateVersion,
              expectedPublicationId: targetPlan.currentPublicationId,
              expectedSchemaRevisionId: targetPlan.schemaRevisionId,
              expectedContractHash: targetPlan.contractHash,
              expectedSharedVersion: targetPlan.sharedVersion,
              expectedSharedRevisionId: targetPlan.sharedRevisionId,
              expectedLocalizedVersion: targetPlan.localizedVersion,
              expectedLocalizedRevisionId: targetPlan.localizedRevisionId,
            }),
            new Date("2026-08-09T10:06:15.000Z"),
            `m8-publish-target-${suffix}`,
          ),
        );
        const hindiTargetPlan = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(hindiTargetScope),
            new Date("2026-08-09T10:06:20.000Z"),
          ),
        );
        const hindiTargetPublished = await Effect.runPromise(
          publications.publish(
            ownerActor,
            Schema.decodeUnknownSync(PublishEntryInput)({
              ...hindiTargetScope,
              commandId: randomUUID(),
              authorityHash: hindiTargetPlan.authorityHash,
              expectedStateVersion: hindiTargetPlan.stateVersion,
              expectedPublicationId: hindiTargetPlan.currentPublicationId,
              expectedSchemaRevisionId: hindiTargetPlan.schemaRevisionId,
              expectedContractHash: hindiTargetPlan.contractHash,
              expectedSharedVersion: hindiTargetPlan.sharedVersion,
              expectedSharedRevisionId: hindiTargetPlan.sharedRevisionId,
              expectedLocalizedVersion: hindiTargetPlan.localizedVersion,
              expectedLocalizedRevisionId: hindiTargetPlan.localizedRevisionId,
            }),
            new Date("2026-08-09T10:06:20.000Z"),
            `m8-publish-target-hi-${suffix}`,
          ),
        );
        assert.strictEqual(targetPublished.publication.sequence, 1);
        assert.strictEqual(hindiTargetPublished.publication.sequence, 1);
        assert.notStrictEqual(targetPublished.publication.id, hindiTargetPublished.publication.id);
        const plan = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(scope),
            new Date("2026-08-09T10:06:30.000Z"),
          ),
        );
        assert.isTrue(plan.valid);
        assert.isNotNull(plan.authorityHash);
        const commandId = randomUUID();
        const publishInput = Schema.decodeUnknownSync(PublishEntryInput)({
          ...scope,
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
        const published = await Effect.runPromise(
          publications.publish(
            ownerActor,
            publishInput,
            new Date("2026-08-09T10:06:30.000Z"),
            `m8-publish-${suffix}`,
          ),
        );
        const replay = await Effect.runPromise(
          publications.publish(
            ownerActor,
            publishInput,
            new Date("2026-08-09T10:07:00.000Z"),
            `m8-publish-replay-${suffix}`,
          ),
        );
        assert.strictEqual(published.resultKind, "changed");
        assert.strictEqual(replay.publication.id, published.publication.id);
        const projectedAfterPublish = await transaction
          .select()
          .from(cmsEntryLocaleDeliveryCurrentValue)
          .where(
            and(
              eq(cmsEntryLocaleDeliveryCurrentValue.entryId, currentEntryId),
              eq(cmsEntryLocaleDeliveryCurrentValue.localeId, published.localeId),
            ),
          );
        const [generationAfterPublish] = await transaction
          .select()
          .from(cmsCollectionLocaleDeliveryState)
          .where(
            and(
              eq(cmsCollectionLocaleDeliveryState.collectionId, currentCollection.id),
              eq(cmsCollectionLocaleDeliveryState.localeId, published.localeId),
            ),
          );
        assert.isAtLeast(projectedAfterPublish.length, 2);
        assert.isTrue(
          projectedAfterPublish.every(
            (projection) => projection.publicationId === published.publication.id,
          ),
        );
        assert.strictEqual(generationAfterPublish?.generation, 2n);
        const deliveryReads = makeDeliveryReadRepository({
          executor: transaction,
          runReadTransaction: (work) => work(transaction),
        });
        const cursorLayer = makeDeliveryCursorSignerLive({
          activeSecret: "publication-integration-delivery-cursor-secret-32-bytes",
        });
        const deliveryScope = {
          projectId: currentProject.id,
          environmentKey: currentProject.environment.key,
          collectionKey: currentCollection.apiKey,
          locale: "en",
        };
        const currentDeliveryItem = await Effect.runPromise(
          deliveryReads.getCurrentById(deliveryScope, currentEntryId, true, []),
        );
        const immutableDeliveryItem = await Effect.runPromise(
          deliveryReads.getImmutable(
            deliveryScope,
            currentEntryId,
            published.publication.id,
            true,
            [],
          ),
        );
        const uniqueDeliveryItem = await Effect.runPromise(
          deliveryReads.getByUnique(deliveryScope, "title", "Published title", true, []),
        );
        const filteredDeliveryPage = await Effect.runPromise(
          deliveryReads
            .list(deliveryScope, "locale=en&filter.title.eq=Published%20title", true)
            .pipe(Effect.provide(cursorLayer)),
        );
        const expandedDeliveryPage = await Effect.runPromise(
          deliveryReads
            .list(
              deliveryScope,
              "locale=en&filter.title.eq=Published%20title&expand=related_entry",
              true,
            )
            .pipe(Effect.provide(cursorLayer)),
        );
        const firstDeliveryPage = await Effect.runPromise(
          deliveryReads
            .list(deliveryScope, "locale=en&limit=1&sort=title", true)
            .pipe(Effect.provide(cursorLayer)),
        );
        assert.strictEqual(currentDeliveryItem.id, currentEntryId);
        assert.strictEqual(immutableDeliveryItem.publication.id, published.publication.id);
        assert.strictEqual(uniqueDeliveryItem.id, currentEntryId);
        assert.deepStrictEqual(
          filteredDeliveryPage.items.map((item) => item.id),
          [currentEntryId],
        );
        const expandedReference = Reflect.get(
          expandedDeliveryPage.items[0]?.data ?? {},
          "related_entry",
        );
        assert.strictEqual(Reflect.get(expandedReference ?? {}, "id"), currentTargetEntryId);
        assert.strictEqual(firstDeliveryPage.items.length, 1);
        assert.isTrue(firstDeliveryPage.page.hasMore);
        assert.isNotNull(firstDeliveryPage.page.nextCursor);
        const secondDeliveryPage = await Effect.runPromise(
          deliveryReads
            .list(
              deliveryScope,
              `locale=en&limit=1&sort=title&cursor=${firstDeliveryPage.page.nextCursor}`,
              true,
            )
            .pipe(Effect.provide(cursorLayer)),
        );
        assert.strictEqual(secondDeliveryPage.items.length, 1);
        assert.notStrictEqual(secondDeliveryPage.items[0]?.id, firstDeliveryPage.items[0]?.id);
        for (const statement of [
          sql`update cms_entry_locale_publication set content_hash = content_hash where id = ${published.publication.id}`,
          sql`delete from cms_entry_locale_publication where id = ${published.publication.id}`,
          sql`update cms_entry_locale_delivery_snapshot set document_hash = document_hash where publication_id = ${published.publication.id}`,
          sql`delete from cms_entry_locale_delivery_snapshot where publication_id = ${published.publication.id}`,
          sql`update cms_entry_locale_publication_reference set source_field_id = source_field_id where source_publication_id = ${published.publication.id}`,
          sql`delete from cms_entry_locale_publication_reference where source_publication_id = ${published.publication.id}`,
          sql`update cms_entry_publication_command set command_fingerprint = command_fingerprint where entry_id = ${currentEntryId} and command_id = ${commandId}`,
          sql`delete from cms_entry_publication_command where entry_id = ${currentEntryId} and command_id = ${commandId}`,
        ]) {
          let rejected = false;
          try {
            await transaction.transaction(async (savepoint) => {
              await savepoint.execute(statement);
            });
          } catch {
            rejected = true;
          }
          assert.isTrue(rejected);
        }

        const status = await Effect.runPromise(
          publications.getStatus(
            ownerActor,
            Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(scope),
          ),
        );
        const history = await Effect.runPromise(
          publications.list(
            ownerActor,
            Schema.decodeUnknownSync(ListEntryPublicationsInput)({
              ...scope,
              cursor: null,
              limit: 25,
            }),
          ),
        );
        assert.strictEqual(status.state, "published");
        assert.strictEqual(history.items.length, 1);
        assert.isTrue(history.items[0]?.current);

        const unpublished = await Effect.runPromise(
          publications.unpublish(
            ownerActor,
            Schema.decodeUnknownSync(UnpublishEntryInput)({
              ...scope,
              commandId: randomUUID(),
              expectedStateVersion: published.stateVersion,
              expectedPublicationId: published.publication.id,
            }),
            new Date("2026-08-09T10:08:00.000Z"),
            `m8-unpublish-${suffix}`,
          ),
        );
        assert.strictEqual(unpublished.resultKind, "changed");
        assert.strictEqual(unpublished.unpublishedPublicationId, published.publication.id);
        const projectedAfterUnpublish = await transaction
          .select()
          .from(cmsEntryLocaleDeliveryCurrentValue)
          .where(
            and(
              eq(cmsEntryLocaleDeliveryCurrentValue.entryId, currentEntryId),
              eq(cmsEntryLocaleDeliveryCurrentValue.localeId, published.localeId),
            ),
          );
        const [generationAfterUnpublish] = await transaction
          .select()
          .from(cmsCollectionLocaleDeliveryState)
          .where(
            and(
              eq(cmsCollectionLocaleDeliveryState.collectionId, currentCollection.id),
              eq(cmsCollectionLocaleDeliveryState.localeId, published.localeId),
            ),
          );
        assert.deepStrictEqual(projectedAfterUnpublish, []);
        assert.strictEqual(generationAfterUnpublish?.generation, 3n);
        const staleDeliveryCursor = await Effect.runPromiseExit(
          deliveryReads
            .list(
              deliveryScope,
              `locale=en&limit=1&sort=title&cursor=${firstDeliveryPage.page.nextCursor}`,
              true,
            )
            .pipe(Effect.provide(cursorLayer)),
        );
        assert.strictEqual(failureTag(staleDeliveryCursor), "DeliveryCursorStaleFailure");
        const noOpCommandId = randomUUID();
        const noOpInput = Schema.decodeUnknownSync(UnpublishEntryInput)({
          ...scope,
          commandId: noOpCommandId,
          expectedStateVersion: unpublished.stateVersion,
          expectedPublicationId: null,
        });
        const noOp = await Effect.runPromise(
          publications.unpublish(
            ownerActor,
            noOpInput,
            new Date("2026-08-09T10:09:00.000Z"),
            `m8-unpublish-no-op-${suffix}`,
          ),
        );
        const noOpReplay = await Effect.runPromise(
          publications.unpublish(
            ownerActor,
            noOpInput,
            new Date("2026-08-09T10:10:00.000Z"),
            `m8-unpublish-no-op-replay-${suffix}`,
          ),
        );
        const unpublishedStatus = await Effect.runPromise(
          publications.getStatus(
            ownerActor,
            Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(scope),
          ),
        );
        assert.strictEqual(noOp.resultKind, "no_op");
        assert.strictEqual(noOpReplay.resultKind, "no_op");
        assert.strictEqual(unpublishedStatus.state, "unpublished");
        const [englishTargetStatus, hindiTargetStatus] = await Promise.all([
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(targetScope),
            ),
          ),
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(hindiTargetScope),
            ),
          ),
        ]);
        assert.strictEqual(englishTargetStatus.state, "published");
        assert.strictEqual(hindiTargetStatus.state, "published");
        const targetEvents = await transaction
          .select({
            localeId: cmsEntryLocalePublication.localeId,
            publicationSequence: cmsEntryLocalePublication.publicationSequence,
            eventSequence: cmsEntryLocalePublication.eventSequence,
          })
          .from(cmsEntryLocalePublication)
          .where(eq(cmsEntryLocalePublication.entryId, currentTargetEntryId))
          .orderBy(cmsEntryLocalePublication.eventSequence);
        assert.deepEqual(
          targetEvents.map(({ publicationSequence, eventSequence }) => ({
            publicationSequence,
            eventSequence,
          })),
          [
            { publicationSequence: 1, eventSequence: 1 },
            { publicationSequence: 1, eventSequence: 2 },
          ],
        );

        // Advance the shared head inside this rollback-only transaction so both historical
        // publications remain visible while the status and snapshot staleness rules are asserted.
        const [targetEntry, targetSharedHead] = await Promise.all([
          transaction
            .select()
            .from(cmsEntry)
            .where(eq(cmsEntry.id, currentTargetEntryId))
            .limit(1)
            .then((rows) => rows[0]),
          transaction
            .select()
            .from(cmsEntrySharedDraft)
            .where(eq(cmsEntrySharedDraft.entryId, currentTargetEntryId))
            .limit(1)
            .then((rows) => rows[0]),
        ]);
        if (!targetEntry || !targetSharedHead)
          throw new Error("Target shared draft fixture is unavailable.");
        const nextSharedRevisionId = randomUUID();
        await transaction.insert(cmsEntrySharedRevision).values({
          id: nextSharedRevisionId,
          workspaceId: targetEntry.workspaceId,
          projectId: targetEntry.projectId,
          environmentId: targetEntry.environmentId,
          collectionId: targetEntry.collectionId,
          entryId: targetEntry.id,
          sequence: 2,
          previousRevisionId: targetSharedHead.currentRevisionId,
          schemaRevisionId: currentPublished.id,
          contractHash: currentPublished.contractHash,
          values: { [currentSharedFieldId]: "Shared value two" },
          valuesHash: "e".repeat(64),
          changedFieldIds: [currentSharedFieldId],
          commandId: randomUUID(),
          commandFingerprint: "f".repeat(64),
          restoredFromRevisionId: null,
          authoredByUserId: ownerId,
          authoredAt: new Date("2026-08-09T10:10:15.000Z"),
        });
        await transaction
          .update(cmsEntrySharedDraft)
          .set({
            version: 2,
            currentRevisionId: nextSharedRevisionId,
            changedByUserId: ownerId,
            updatedAt: new Date("2026-08-09T10:10:15.000Z"),
          })
          .where(
            and(
              eq(cmsEntrySharedDraft.entryId, currentTargetEntryId),
              eq(cmsEntrySharedDraft.version, 1),
            ),
          );
        const [staleEnglishTarget, staleHindiTarget] = await Promise.all([
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(targetScope),
            ),
          ),
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(hindiTargetScope),
            ),
          ),
        ]);
        assert.isTrue(staleEnglishTarget.sharedChanged);
        assert.isTrue(staleHindiTarget.sharedChanged);

        const hindiSharedPlan = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(hindiTargetScope),
            new Date("2026-08-09T10:10:30.000Z"),
          ),
        );
        const hindiSharedPublished = await Effect.runPromise(
          publications.publish(
            ownerActor,
            Schema.decodeUnknownSync(PublishEntryInput)({
              ...hindiTargetScope,
              commandId: randomUUID(),
              authorityHash: hindiSharedPlan.authorityHash,
              expectedStateVersion: hindiSharedPlan.stateVersion,
              expectedPublicationId: hindiSharedPlan.currentPublicationId,
              expectedSchemaRevisionId: hindiSharedPlan.schemaRevisionId,
              expectedContractHash: hindiSharedPlan.contractHash,
              expectedSharedVersion: hindiSharedPlan.sharedVersion,
              expectedSharedRevisionId: hindiSharedPlan.sharedRevisionId,
              expectedLocalizedVersion: hindiSharedPlan.localizedVersion,
              expectedLocalizedRevisionId: hindiSharedPlan.localizedRevisionId,
            }),
            new Date("2026-08-09T10:10:45.000Z"),
            `m8-publish-target-hi-shared-two-${suffix}`,
          ),
        );
        const [englishAfterHindiRepublish, hindiAfterHindiRepublish] = await Promise.all([
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(targetScope),
            ),
          ),
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(hindiTargetScope),
            ),
          ),
        ]);
        assert.isTrue(englishAfterHindiRepublish.sharedChanged);
        assert.isFalse(hindiAfterHindiRepublish.sharedChanged);
        assert.strictEqual(
          englishAfterHindiRepublish.currentPublication?.id,
          targetPublished.publication.id,
        );
        assert.strictEqual(hindiSharedPublished.publication.sequence, 2);

        const immutableSnapshots = await transaction
          .select({
            publicationId: cmsEntryLocaleDeliverySnapshot.publicationId,
            document: cmsEntryLocaleDeliverySnapshot.document,
          })
          .from(cmsEntryLocaleDeliverySnapshot)
          .where(
            inArray(cmsEntryLocaleDeliverySnapshot.publicationId, [
              targetPublished.publication.id,
              hindiSharedPublished.publication.id,
            ]),
          );
        const snapshotSharedValue = (publicationId: string) => {
          const document = immutableSnapshots.find(
            (snapshot) => snapshot.publicationId === publicationId,
          )?.document;
          const data =
            typeof document === "object" && document !== null
              ? Reflect.get(document, "data")
              : undefined;
          return typeof data === "object" && data !== null
            ? Reflect.get(data, "shared_note")
            : undefined;
        };
        assert.strictEqual(snapshotSharedValue(targetPublished.publication.id), "Shared value one");
        assert.strictEqual(
          snapshotSharedValue(hindiSharedPublished.publication.id),
          "Shared value two",
        );

        const sourcePlanBeforeTargetUnpublish = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(scope),
            new Date("2026-08-09T10:11:00.000Z"),
          ),
        );
        const targetUnpublishedBeforeResolution = await Effect.runPromise(
          publications.unpublish(
            ownerActor,
            Schema.decodeUnknownSync(UnpublishEntryInput)({
              ...targetScope,
              commandId: randomUUID(),
              expectedStateVersion: targetPublished.stateVersion,
              expectedPublicationId: targetPublished.publication.id,
            }),
            new Date("2026-08-09T10:11:15.000Z"),
            `m8-unpublish-target-before-resolution-${suffix}`,
          ),
        );
        const publishAfterTargetUnpublish = await Effect.runPromiseExit(
          publications.publish(
            ownerActor,
            Schema.decodeUnknownSync(PublishEntryInput)({
              ...scope,
              commandId: randomUUID(),
              authorityHash: sourcePlanBeforeTargetUnpublish.authorityHash,
              expectedStateVersion: sourcePlanBeforeTargetUnpublish.stateVersion,
              expectedPublicationId: sourcePlanBeforeTargetUnpublish.currentPublicationId,
              expectedSchemaRevisionId: sourcePlanBeforeTargetUnpublish.schemaRevisionId,
              expectedContractHash: sourcePlanBeforeTargetUnpublish.contractHash,
              expectedSharedVersion: sourcePlanBeforeTargetUnpublish.sharedVersion,
              expectedSharedRevisionId: sourcePlanBeforeTargetUnpublish.sharedRevisionId,
              expectedLocalizedVersion: sourcePlanBeforeTargetUnpublish.localizedVersion,
              expectedLocalizedRevisionId: sourcePlanBeforeTargetUnpublish.localizedRevisionId,
            }),
            new Date("2026-08-09T10:11:30.000Z"),
            `m8-publish-after-target-unpublish-${suffix}`,
          ),
        );
        assert.strictEqual(
          failureTag(publishAfterTargetUnpublish),
          "EntryPublicationInvalidFailure",
        );

        const targetRepublishPlan = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(targetScope),
            new Date("2026-08-09T10:12:00.000Z"),
          ),
        );
        const targetRepublished = await Effect.runPromise(
          publications.publish(
            ownerActor,
            Schema.decodeUnknownSync(PublishEntryInput)({
              ...targetScope,
              commandId: randomUUID(),
              authorityHash: targetRepublishPlan.authorityHash,
              expectedStateVersion: targetRepublishPlan.stateVersion,
              expectedPublicationId: targetRepublishPlan.currentPublicationId,
              expectedSchemaRevisionId: targetRepublishPlan.schemaRevisionId,
              expectedContractHash: targetRepublishPlan.contractHash,
              expectedSharedVersion: targetRepublishPlan.sharedVersion,
              expectedSharedRevisionId: targetRepublishPlan.sharedRevisionId,
              expectedLocalizedVersion: targetRepublishPlan.localizedVersion,
              expectedLocalizedRevisionId: targetRepublishPlan.localizedRevisionId,
            }),
            new Date("2026-08-09T10:12:15.000Z"),
            `m8-republish-target-${suffix}`,
          ),
        );
        assert.strictEqual(targetRepublished.publication.sequence, 2);
        assert.strictEqual(targetUnpublishedBeforeResolution.stateVersion, 2);

        const sourcePlanAfterTargetRepublish = await Effect.runPromise(
          publications.validate(
            ownerActor,
            Schema.decodeUnknownSync(ValidateEntryPublicationInput)(scope),
            new Date("2026-08-09T10:12:30.000Z"),
          ),
        );
        assert.isTrue(sourcePlanAfterTargetRepublish.valid);
        assert.isTrue(sourcePlanAfterTargetRepublish.referencesWouldRefresh);
        let targetUnpublishedAfterResolution = false;
        const linearizedPublications = makePublicationRepository({
          executor: transaction,
          runTransaction: (work) => work(transaction),
          onReferencesResolved: async (currentTransaction) => {
            const targetRepository = makePublicationRepository({
              executor: currentTransaction,
              runTransaction: (work) => work(currentTransaction),
            });
            await Effect.runPromise(
              targetRepository.unpublish(
                ownerActor,
                Schema.decodeUnknownSync(UnpublishEntryInput)({
                  ...targetScope,
                  commandId: randomUUID(),
                  expectedStateVersion: targetRepublished.stateVersion,
                  expectedPublicationId: targetRepublished.publication.id,
                }),
                new Date("2026-08-09T10:12:45.000Z"),
                `m8-unpublish-target-after-resolution-${suffix}`,
              ),
            );
            targetUnpublishedAfterResolution = true;
          },
        });
        const sourcePublishedBeforeTargetUnpublish = await Effect.runPromise(
          linearizedPublications.publish(
            ownerActor,
            Schema.decodeUnknownSync(PublishEntryInput)({
              ...scope,
              commandId: randomUUID(),
              authorityHash: sourcePlanAfterTargetRepublish.authorityHash,
              expectedStateVersion: sourcePlanAfterTargetRepublish.stateVersion,
              expectedPublicationId: sourcePlanAfterTargetRepublish.currentPublicationId,
              expectedSchemaRevisionId: sourcePlanAfterTargetRepublish.schemaRevisionId,
              expectedContractHash: sourcePlanAfterTargetRepublish.contractHash,
              expectedSharedVersion: sourcePlanAfterTargetRepublish.sharedVersion,
              expectedSharedRevisionId: sourcePlanAfterTargetRepublish.sharedRevisionId,
              expectedLocalizedVersion: sourcePlanAfterTargetRepublish.localizedVersion,
              expectedLocalizedRevisionId: sourcePlanAfterTargetRepublish.localizedRevisionId,
            }),
            new Date("2026-08-09T10:12:40.000Z"),
            `m8-source-linearized-before-target-unpublish-${suffix}`,
          ),
        );
        assert.isTrue(targetUnpublishedAfterResolution);
        const pinnedEdges = await transaction
          .select({ targetPublicationId: cmsEntryLocalePublicationReference.targetPublicationId })
          .from(cmsEntryLocalePublicationReference)
          .where(
            eq(
              cmsEntryLocalePublicationReference.sourcePublicationId,
              sourcePublishedBeforeTargetUnpublish.publication.id,
            ),
          );
        assert.deepEqual(
          pinnedEdges.map(({ targetPublicationId }) => targetPublicationId),
          [targetRepublished.publication.id],
        );
        const [sourceAfterLinearization, targetAfterLinearization] = await Promise.all([
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(scope),
            ),
          ),
          Effect.runPromise(
            publications.getStatus(
              ownerActor,
              Schema.decodeUnknownSync(GetEntryPublicationStatusInput)(targetScope),
            ),
          ),
        ]);
        assert.strictEqual(sourceAfterLinearization.state, "published");
        assert.strictEqual(targetAfterLinearization.state, "unpublished");

        const staleSameLocaleCommand = await Effect.runPromiseExit(
          publications.publish(
            ownerActor,
            Schema.decodeUnknownSync(PublishEntryInput)({
              ...scope,
              commandId: randomUUID(),
              authorityHash: sourcePlanAfterTargetRepublish.authorityHash,
              expectedStateVersion: sourcePlanAfterTargetRepublish.stateVersion,
              expectedPublicationId: sourcePlanAfterTargetRepublish.currentPublicationId,
              expectedSchemaRevisionId: sourcePlanAfterTargetRepublish.schemaRevisionId,
              expectedContractHash: sourcePlanAfterTargetRepublish.contractHash,
              expectedSharedVersion: sourcePlanAfterTargetRepublish.sharedVersion,
              expectedSharedRevisionId: sourcePlanAfterTargetRepublish.sharedRevisionId,
              expectedLocalizedVersion: sourcePlanAfterTargetRepublish.localizedVersion,
              expectedLocalizedRevisionId: sourcePlanAfterTargetRepublish.localizedRevisionId,
            }),
            new Date("2026-08-09T10:13:00.000Z"),
            `m8-stale-same-locale-publish-${suffix}`,
          ),
        );
        assert.strictEqual(failureTag(staleSameLocaleCommand), "EntryPublicationConflictFailure");

        const stalePublishVersusUnpublish = await Effect.runPromiseExit(
          publications.unpublish(
            ownerActor,
            Schema.decodeUnknownSync(UnpublishEntryInput)({
              ...scope,
              commandId: randomUUID(),
              expectedStateVersion: sourcePlanAfterTargetRepublish.stateVersion,
              expectedPublicationId: sourcePlanAfterTargetRepublish.currentPublicationId,
            }),
            new Date("2026-08-09T10:13:15.000Z"),
            `m8-stale-publish-versus-unpublish-${suffix}`,
          ),
        );
        assert.strictEqual(
          failureTag(stalePublishVersusUnpublish),
          "EntryPublicationConflictFailure",
        );
        reachedRollback = true;
        transaction.rollback();
      });
    } catch (cause) {
      if (!reachedRollback) throw cause;
    }
    assert.isTrue(reachedRollback);
  });

  it("rolls every material failure-injection stage back without sequence gaps", async () => {
    const currentProject = required(projectModel, "project");
    const currentCollection = required(collectionModel, "collection");
    const currentEntryId = required(targetEntryId, "target entry");
    const scope = {
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
      collectionId: currentCollection.id,
      entryId: currentEntryId,
      locale: "en",
    };
    const stages: ReadonlyArray<PublicationFailureStage> = [
      "event_sequence",
      "publication",
      "snapshot",
      "references",
      "pointer",
      "projection",
      "generation",
      "audit",
      "invalidation_mapping_load",
      "invalidation_projection",
      "event_size_validation",
      "pre_outbox",
      "outbox",
      "receipt",
    ];
    for (const stage of stages) {
      let isolation: string | undefined;
      const repository = makePublicationRepository({
        failAfter: stage,
        onTransactionOpened: async (transaction) => {
          const result = await transaction.execute(sql`show transaction_isolation`);
          const decoded = Schema.decodeUnknownSync(
            Schema.Struct({
              rows: Schema.Array(Schema.Struct({ transaction_isolation: Schema.String })),
            }),
          )(result);
          isolation = decoded.rows[0]?.transaction_isolation;
        },
      });
      const now = new Date("2026-08-09T11:00:00.000Z");
      const plan = await Effect.runPromise(
        repository.validate(
          ownerActor,
          Schema.decodeUnknownSync(ValidateEntryPublicationInput)(scope),
          now,
        ),
      );
      const exit = await Effect.runPromiseExit(
        repository.publish(
          ownerActor,
          Schema.decodeUnknownSync(PublishEntryInput)({
            ...scope,
            commandId: randomUUID(),
            authorityHash: plan.authorityHash,
            expectedStateVersion: plan.stateVersion,
            expectedPublicationId: plan.currentPublicationId,
            expectedSchemaRevisionId: plan.schemaRevisionId,
            expectedContractHash: plan.contractHash,
            expectedSharedVersion: plan.sharedVersion,
            expectedSharedRevisionId: plan.sharedRevisionId,
            expectedLocalizedVersion: plan.localizedVersion,
            expectedLocalizedRevisionId: plan.localizedRevisionId,
          }),
          now,
          `m8-failure-${stage}-${suffix}`,
        ),
      );
      assert.strictEqual(failureTag(exit), "DatabaseFailure");
      assert.strictEqual(isolation, "read committed");

      const [entry] = await db
        .select({ publicationEventSequence: cmsEntry.publicationEventSequence })
        .from(cmsEntry)
        .where(eq(cmsEntry.id, currentEntryId))
        .limit(1);
      const publications = await db
        .select({ id: cmsEntryLocalePublication.id })
        .from(cmsEntryLocalePublication)
        .where(eq(cmsEntryLocalePublication.entryId, currentEntryId));
      const snapshots = await db
        .select({ id: cmsEntryLocaleDeliverySnapshot.publicationId })
        .from(cmsEntryLocaleDeliverySnapshot)
        .where(eq(cmsEntryLocaleDeliverySnapshot.entryId, currentEntryId));
      const references = await db
        .select({ id: cmsEntryLocalePublicationReference.sourcePublicationId })
        .from(cmsEntryLocalePublicationReference)
        .where(eq(cmsEntryLocalePublicationReference.sourceEntryId, currentEntryId));
      const heads = await db
        .select({ id: cmsEntryLocalePublicationHead.entryId })
        .from(cmsEntryLocalePublicationHead)
        .where(eq(cmsEntryLocalePublicationHead.entryId, currentEntryId));
      const receipts = await db
        .select({ id: cmsEntryPublicationCommand.entryId })
        .from(cmsEntryPublicationCommand)
        .where(eq(cmsEntryPublicationCommand.entryId, currentEntryId));
      const publicationAudits = await db
        .select({ id: auditEvent.id })
        .from(auditEvent)
        .where(
          and(eq(auditEvent.actorId, ownerId), eq(auditEvent.action, "cms.entry.locale.published")),
        );
      const publicationEvents = await db
        .select({ id: outboxEvent.id })
        .from(outboxEvent)
        .where(
          and(
            eq(outboxEvent.subjectId, currentEntryId),
            eq(outboxEvent.eventType, "cms.entry.published"),
          ),
        );
      assert.strictEqual(entry?.publicationEventSequence, 0);
      assert.strictEqual(publications.length, 0);
      assert.strictEqual(snapshots.length, 0);
      assert.strictEqual(references.length, 0);
      assert.strictEqual(heads.length, 0);
      assert.strictEqual(receipts.length, 0);
      assert.strictEqual(publicationAudits.length, 0);
      assert.strictEqual(publicationEvents.length, 0);
    }
  });

  it("serializes concurrent entry event-sequence writers without gaps", async () => {
    const currentEntryId = required(targetEntryId, "target entry");
    const advance = () =>
      db.transaction(
        async (transaction) => {
          const result = await transaction.execute(
            sql`select publication_event_sequence from cms_entry where id = ${currentEntryId} for update`,
          );
          const decoded = Schema.decodeUnknownSync(
            Schema.Struct({
              rows: Schema.Array(Schema.Struct({ publication_event_sequence: Schema.Number })),
            }),
          )(result);
          const currentSequence = decoded.rows[0]?.publication_event_sequence;
          if (currentSequence === undefined)
            throw new Error("Concurrent publication entry fixture is unavailable.");
          const nextSequence = currentSequence + 1;
          await transaction
            .update(cmsEntry)
            .set({ publicationEventSequence: nextSequence })
            .where(
              and(
                eq(cmsEntry.id, currentEntryId),
                eq(cmsEntry.publicationEventSequence, currentSequence),
              ),
            );
          return nextSequence;
        },
        { isolationLevel: "read committed", accessMode: "read write" },
      );

    try {
      const sequences = await Promise.all([advance(), advance()]);
      assert.deepEqual(
        [...sequences].sort((left, right) => left - right),
        [1, 2],
      );
      const [entry] = await db
        .select({ publicationEventSequence: cmsEntry.publicationEventSequence })
        .from(cmsEntry)
        .where(eq(cmsEntry.id, currentEntryId))
        .limit(1);
      assert.strictEqual(entry?.publicationEventSequence, 2);
    } finally {
      await db
        .update(cmsEntry)
        .set({ publicationEventSequence: 0 })
        .where(eq(cmsEntry.id, currentEntryId));
    }
  });

  it("uses the intended current-head, history, receipt, and reverse-reference indexes", async () => {
    const currentProject = required(projectModel, "project");
    const currentCollection = required(collectionModel, "collection");
    const currentEntryId = required(entryId, "entry");
    const [english] = await db
      .select({ id: projectLocale.id })
      .from(projectLocale)
      .where(and(eq(projectLocale.projectId, currentProject.id), eq(projectLocale.tag, "en")))
      .limit(1);
    if (!english) throw new Error("English locale fixture is unavailable.");
    const targetPublicationId = randomUUID();
    const plans = await db.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      const exactHead = await transaction.execute(
        sql`explain (format json) select entry_id from cms_entry_locale_publication_head where entry_id = ${currentEntryId} and locale_id = ${english.id}`,
      );
      const localeCurrent = await transaction.execute(
        sql`explain (format json) select entry_id from cms_entry_locale_publication_head where locale_id = ${english.id} and collection_id = ${currentCollection.id} and current_publication_id is not null order by entry_id`,
      );
      const history = await transaction.execute(
        sql`explain (format json) select id from cms_entry_locale_publication where entry_id = ${currentEntryId} and locale_id = ${english.id} order by publication_sequence desc, id desc limit 25`,
      );
      const receipt = await transaction.execute(
        sql`explain (format json) select entry_id from cms_entry_publication_command where entry_id = ${currentEntryId} and command_id = ${randomUUID()}`,
      );
      const reverseReference = await transaction.execute(
        sql`explain (format json) select source_publication_id from cms_entry_locale_publication_reference where target_publication_id = ${targetPublicationId}`,
      );
      return JSON.stringify([
        exactHead.rows,
        localeCurrent.rows,
        history.rows,
        receipt.rows,
        reverseReference.rows,
      ]);
    });
    assert.include(plans, "cms_entry_pub_head_entry_locale_pk");
    assert.include(plans, "cms_entry_pub_head_locale_collection_current_idx");
    assert.match(plans, /cms_entry_pub_(history_idx|entry_locale_sequence_unique)/u);
    assert.include(plans, "cms_entry_pub_command_entry_command_pk");
    assert.include(plans, "cms_entry_pub_ref_target_publication_idx");
  });
});
