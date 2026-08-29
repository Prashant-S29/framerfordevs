import { createHash, randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { and, eq, inArray, sql } from "@framerfordevs/db/query";
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
  cmsEnumOptionSourceIdentity,
  cmsProjectSchemaApplyCommand,
  cmsProjectSchemaApplyRevision,
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
import { Effect, Schema } from "effect";

import { ApiCredentialId } from "../../../src/contracts/access";
import { CmsActor } from "../../../src/contracts/authoring";
import {
  AuthoringPublishPresentationRequest,
  AuthoringCollectionPresentation,
} from "../../../src/contracts/authoring-presentation";
import {
  AuthoringSchemaApplyInput,
  AuthoringSchemaExportInput,
  AuthoringSchemaPlanInput,
} from "../../../src/contracts/authoring-schema";
import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  type Project as ProjectModel,
  type Workspace as WorkspaceModel,
} from "../../../src/contracts/platform";
import { makeAuthoringPresentationRepository } from "../../../src/services/authoring-presentation-repository";
import { makeAuthoringSchemaRepository } from "../../../src/services/authoring-schema-repository";
import { makePlatformRepository } from "../../../src/services/platform-repository";

const suffix = randomUUID();
const ownerId = `m13-apply-owner-${suffix}`;
const ownerUserId = Schema.decodeUnknownSync(AuthUserId)(ownerId);
const ownerActor = Schema.decodeUnknownSync(CmsActor)({ kind: "user", id: ownerUserId });
const managementCredentialId = Schema.decodeUnknownSync(ApiCredentialId)(randomUUID());
const managementActor = Schema.decodeUnknownSync(CmsActor)({
  kind: "credential",
  id: managementCredentialId,
});
const platform = makePlatformRepository();
const authoring = makeAuthoringSchemaRepository();
const presentation = makeAuthoringPresentationRepository();

let workspaceModel: WorkspaceModel | undefined;
let projectModel: ProjectModel | undefined;

const projectDocument = {
  collections: [
    {
      sourceKey: "authors",
      apiKey: "authors",
      fields: [
        {
          sourceKey: "name",
          apiKey: "name",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: { maxLength: 120 },
        },
        {
          sourceKey: "favorite_post",
          apiKey: "favorite_post",
          kind: "reference",
          required: false,
          localization: "localized",
          configuration: { targetCollectionSourceKey: "posts" },
        },
      ],
    },
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: { maxLength: 160 },
        },
        {
          sourceKey: "author",
          apiKey: "author",
          kind: "reference",
          required: true,
          localization: "shared",
          configuration: { targetCollectionSourceKey: "authors" },
        },
        {
          sourceKey: "status",
          apiKey: "status",
          kind: "enum",
          required: true,
          localization: "shared",
          configuration: {
            options: [
              { sourceKey: "draft", value: "draft" },
              { sourceKey: "published", value: "published" },
            ],
            default: "draft",
          },
        },
      ],
    },
  ],
} as const;

function required<A>(value: A | undefined, label: string): A {
  if (value === undefined) throw new Error(`${label} is not initialized.`);
  return value;
}

beforeAll(async () => {
  await db.insert(user).values({
    id: ownerId,
    name: "M13 Apply Owner",
    email: `m13-apply-${suffix}@example.test`,
    emailVerified: true,
  });
  workspaceModel = await Effect.runPromise(
    platform.createWorkspace(
      ownerUserId,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: "M13 Apply Workspace" }),
      `m13-apply-workspace-${suffix}`,
    ),
  );
  projectModel = await Effect.runPromise(
    platform.createProject(
      ownerUserId,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: required(workspaceModel, "workspace").id,
        name: "M13 Apply Project",
        key: `m13-apply-${suffix.slice(0, 8)}`,
        description: null,
      }),
      `m13-apply-project-${suffix}`,
    ),
  );
  await Effect.runPromise(
    platform.enableCapability(
      ownerUserId,
      Schema.decodeUnknownSync(EnableCapabilityInput)({
        projectId: required(projectModel, "project").id,
        capability: "cms",
      }),
      `m13-apply-capability-${suffix}`,
    ),
  );
  const currentWorkspace = required(workspaceModel, "workspace");
  const currentProject = required(projectModel, "project");
  await db.insert(apiCredential).values({
    id: managementCredentialId,
    workspaceId: currentWorkspace.id,
    projectId: currentProject.id,
    environmentId: currentProject.environment.id,
    family: "management",
    name: "M13 schema apply",
    keyPrefix: `ffd_mgmt_${managementCredentialId}`,
    keyDigest: createHash("sha256").update(managementCredentialId).digest("hex"),
    createdByUserId: ownerId,
  });
  await db.insert(apiCredentialScope).values(
    ["schema.read", "schema.write", "schema.publish"].map((scope) => ({
      credentialId: managementCredentialId,
      workspaceId: currentWorkspace.id,
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
      scope,
    })),
  );
});

afterAll(async () => {
  const currentProject = required(projectModel, "project");
  const collectionRows = await db
    .select({ id: cmsCollection.id })
    .from(cmsCollection)
    .where(eq(cmsCollection.projectId, currentProject.id));
  const collectionIds = collectionRows.map(({ id }) => id);
  if (collectionIds.length > 0) {
    await db.delete(outboxEvent).where(inArray(outboxEvent.subjectId, collectionIds));
    await db
      .delete(cmsProjectSchemaApplyRevision)
      .where(eq(cmsProjectSchemaApplyRevision.projectId, currentProject.id));
    await db
      .delete(cmsProjectSchemaApplyCommand)
      .where(eq(cmsProjectSchemaApplyCommand.projectId, currentProject.id));
    await db
      .delete(cmsCollectionDeliveryConfig)
      .where(inArray(cmsCollectionDeliveryConfig.collectionId, collectionIds));
    await db
      .delete(cmsCollectionSchemaHead)
      .where(inArray(cmsCollectionSchemaHead.collectionId, collectionIds));
    await db
      .delete(cmsSchemaRevisionField)
      .where(inArray(cmsSchemaRevisionField.collectionId, collectionIds));
    await db
      .delete(cmsSchemaRevision)
      .where(inArray(cmsSchemaRevision.collectionId, collectionIds));
    await db
      .delete(cmsEnumOptionSourceIdentity)
      .where(inArray(cmsEnumOptionSourceIdentity.collectionId, collectionIds));
    await db
      .delete(cmsCollectionField)
      .where(inArray(cmsCollectionField.collectionId, collectionIds));
    await db.delete(cmsCollection).where(inArray(cmsCollection.id, collectionIds));
  }
  await db.delete(auditEvent).where(inArray(auditEvent.actorId, [ownerId, managementCredentialId]));
  await db
    .delete(apiCredentialScope)
    .where(eq(apiCredentialScope.credentialId, managementCredentialId));
  await db.delete(apiCredential).where(eq(apiCredential.id, managementCredentialId));
  await db.delete(projectCapability).where(eq(projectCapability.projectId, currentProject.id));
  await db.delete(projectLocale).where(eq(projectLocale.projectId, currentProject.id));
  await db.delete(environment).where(eq(environment.projectId, currentProject.id));
  await db.delete(projectMembership).where(eq(projectMembership.projectId, currentProject.id));
  await db.delete(project).where(eq(project.id, currentProject.id));
  await db.delete(workspaceMembership).where(eq(workspaceMembership.userId, ownerId));
  await db.delete(workspace).where(eq(workspace.id, required(workspaceModel, "workspace").id));
  await db.delete(user).where(eq(user.id, ownerId));
});

describe.sequential("Authoring schema repository PostgreSQL integration", () => {
  it("atomically allocates mutual references, publishes revisions, replays, and records no-ops", async () => {
    const currentProject = required(projectModel, "project");
    const scope = {
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
    };
    const plan = await Effect.runPromise(
      authoring.plan(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaPlanInput)({ scope, project: projectDocument }),
      ),
    );
    assert.isTrue(plan.valid);
    if (!plan.valid) throw new Error("Expected a valid initial Authoring plan.");
    assert.isTrue(plan.candidates.every((candidate) => candidate.containsUnallocatedIdentities));

    const commandId = randomUUID();
    const input = Schema.decodeUnknownSync(AuthoringSchemaApplyInput)({
      scope,
      project: projectDocument,
      commandId,
      expectedCurrent: plan.current,
      expectedPlanHash: plan.planHash,
      acknowledgedChangeIds: plan.changes
        .filter((change) => change.classification !== "non_breaking")
        .map((change) => change.changeId),
    });
    const concurrent = await Promise.all([
      Effect.runPromise(
        authoring.apply(
          ownerActor,
          input,
          new Date("2026-08-24T02:00:00.000Z"),
          `m13-apply-a-${suffix}`,
        ),
      ),
      Effect.runPromise(
        authoring.apply(
          ownerActor,
          input,
          new Date("2026-08-24T02:00:00.001Z"),
          `m13-apply-b-${suffix}`,
        ),
      ),
    ]);
    assert.isTrue(concurrent.every((decision) => decision.kind === "success"));
    const successful = concurrent.flatMap((decision) =>
      decision.kind === "success" ? [decision.result] : [],
    );
    assert.deepStrictEqual(successful.map((result) => result.replayed).sort(), [false, true]);
    const appliedResult = successful.find((result) => !result.replayed);
    if (!appliedResult) throw new Error("Initial apply result was not found.");
    const applied = { kind: "success" as const, result: appliedResult };
    assert.isFalse(applied.result.noOp);
    assert.isFalse(applied.result.replayed);
    assert.lengthOf(applied.result.collections, 2);
    assert.lengthOf(applied.result.fields, 5);
    assert.lengthOf(applied.result.enumOptions, 2);
    assert.lengthOf(applied.result.revisions, 2);
    assert.isTrue(applied.result.revisions.every((revision) => revision.changed));

    const exported = await Effect.runPromise(
      authoring.exportSchema(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaExportInput)({ scope }),
      ),
    );
    assert.deepStrictEqual(
      exported.project.collections.map((collection) => collection.sourceKey),
      ["authors", "posts"],
    );
    assert.lengthOf(exported.collections, 2);
    assert.lengthOf(exported.fields, 5);
    assert.lengthOf(exported.enumOptions, 2);
    assert.lengthOf(exported.revisions, 2);
    assert.deepStrictEqual(
      exported.revisions.map((revision) => ({
        sourceKey: revision.collectionSourceKey,
        revisionId: revision.revisionId,
        structureHash: revision.structureHash,
        contractHash: revision.contractHash,
        changed: revision.changed,
      })),
      applied.result.revisions.map((revision) => ({
        sourceKey: revision.collectionSourceKey,
        revisionId: revision.revisionId,
        structureHash: revision.structureHash,
        contractHash: revision.contractHash,
        changed: false,
      })),
    );
    assert.strictEqual(exported.current.projectManifestHash, applied.result.projectManifestHash);
    const exportedPosts = exported.project.collections.find(
      (collection) => collection.sourceKey === "posts",
    );
    const exportedAuthor = exportedPosts?.fields.find((field) => field.sourceKey === "author");
    assert.deepStrictEqual(
      exportedAuthor?.kind === "reference" ? exportedAuthor.configuration : null,
      { targetCollectionSourceKey: "authors" },
    );
    assert.notMatch(
      JSON.stringify(exported.project),
      /displayLabel|helpText|editorLayout|workspaceId|publishedBy/u,
    );

    const replay = await Effect.runPromise(
      authoring.apply(
        ownerActor,
        input,
        new Date("2026-08-24T02:00:01.000Z"),
        `m13-replay-${suffix}`,
      ),
    );
    assert.strictEqual(replay.kind, "success");
    if (replay.kind !== "success") throw new Error("Expected exact command replay.");
    assert.isTrue(replay.result.replayed);
    assert.strictEqual(replay.result.projectManifestHash, applied.result.projectManifestHash);

    const commandConflict = await Effect.runPromise(
      authoring.apply(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaApplyInput)({
          ...input,
          project: {
            ...projectDocument,
            collections: projectDocument.collections.map((collection) =>
              collection.sourceKey === "posts" ? { ...collection, apiKey: "articles" } : collection,
            ),
          },
        }),
        new Date("2026-08-24T02:00:01.500Z"),
        `m13-command-conflict-${suffix}`,
      ),
    );
    assert.strictEqual(commandConflict.kind, "command_conflict");

    const stale = await Effect.runPromise(
      authoring.apply(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaApplyInput)({
          ...input,
          commandId: randomUUID(),
        }),
        new Date("2026-08-24T02:00:01.750Z"),
        `m13-stale-${suffix}`,
      ),
    );
    assert.strictEqual(stale.kind, "stale_schema_authority");

    const currentPlan = await Effect.runPromise(
      authoring.plan(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaPlanInput)({ scope, project: projectDocument }),
      ),
    );
    assert.isTrue(currentPlan.valid);
    if (!currentPlan.valid) throw new Error("Expected a valid current Authoring plan.");
    const noOp = await Effect.runPromise(
      authoring.apply(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaApplyInput)({
          scope,
          project: projectDocument,
          commandId: randomUUID(),
          expectedCurrent: currentPlan.current,
          expectedPlanHash: currentPlan.planHash,
          acknowledgedChangeIds: [],
        }),
        new Date("2026-08-24T02:00:02.000Z"),
        `m13-noop-${suffix}`,
      ),
    );
    assert.strictEqual(noOp.kind, "success");
    if (noOp.kind !== "success") throw new Error("Expected no-op apply success.");
    assert.isTrue(noOp.result.noOp);
    assert.isTrue(noOp.result.revisions.every((revision) => !revision.changed));

    const [counts] = await db
      .select({
        collections: db.$count(cmsCollection, eq(cmsCollection.projectId, currentProject.id)),
        fields: db.$count(cmsCollectionField, eq(cmsCollectionField.projectId, currentProject.id)),
        deliveryConfigs: db.$count(
          cmsCollectionDeliveryConfig,
          eq(cmsCollectionDeliveryConfig.projectId, currentProject.id),
        ),
        revisions: db.$count(cmsSchemaRevision, eq(cmsSchemaRevision.projectId, currentProject.id)),
        commands: db.$count(
          cmsProjectSchemaApplyCommand,
          eq(cmsProjectSchemaApplyCommand.projectId, currentProject.id),
        ),
      })
      .from(project)
      .where(eq(project.id, currentProject.id));
    assert.deepStrictEqual(counts, {
      collections: 2,
      fields: 5,
      deliveryConfigs: 2,
      revisions: 2,
      commands: 2,
    });
  });

  it("publishes presentation-only revisions with replay, optimistic conflict, attribution, and hash separation", async () => {
    const currentProject = required(projectModel, "project");
    const scope = {
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
    };
    const stalePlan = await Effect.runPromise(
      authoring.plan(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaPlanInput)({ scope, project: projectDocument }),
      ),
    );
    assert.isTrue(stalePlan.valid);
    if (!stalePlan.valid) throw new Error("Expected a valid pre-presentation plan.");
    const current = await Effect.runPromise(presentation.get(managementActor, scope, "posts"));
    const title = current.presentation.fields[0];
    const status = current.presentation.fields[2];
    if (!title || !status) throw new Error("Expected complete posts presentation fields.");
    const changed = Schema.decodeUnknownSync(AuthoringCollectionPresentation)({
      ...current.presentation,
      displayName: "Editorial Posts",
      description: "Presentation-only metadata",
      fields: current.presentation.fields.map((field) => ({
        ...field,
        displayLabel: field.fieldId === title.fieldId ? "Headline" : field.displayLabel,
        editor:
          field.fieldId === title.fieldId
            ? { ...field.editor, helpText: "Use a concise headline." }
            : field.editor,
        enumOptions: field.enumOptions.map((option) => ({
          ...option,
          label: option.optionId === status.enumOptions[1]?.optionId ? "Live" : option.label,
        })),
      })),
    });
    const commandId = randomUUID();
    const request = Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)({
      commandId,
      expectedRevisionId: current.revision.revisionId,
      expectedSequence: current.revision.sequence,
      presentation: changed,
    });
    const concurrent = await Promise.all([
      Effect.runPromise(
        presentation.publish(
          managementActor,
          scope,
          "posts",
          request,
          new Date("2026-08-24T02:00:10.000Z"),
          `m13-presentation-a-${suffix}`,
        ),
      ),
      Effect.runPromise(
        presentation.publish(
          managementActor,
          scope,
          "posts",
          request,
          new Date("2026-08-24T02:00:10.001Z"),
          `m13-presentation-b-${suffix}`,
        ),
      ),
    ]);
    assert.deepStrictEqual(concurrent.map((result) => result.replayed).sort(), [false, true]);
    const published = concurrent.find((result) => !result.replayed);
    if (!published) throw new Error("Published presentation result is missing.");
    assert.isFalse(published.noOp);
    assert.strictEqual(published.revision.previousRevisionId, current.revision.revisionId);
    assert.strictEqual(published.revision.sequence, current.revision.sequence + 1);
    assert.strictEqual(published.revision.structureHash, current.revision.structureHash);
    assert.strictEqual(published.revision.contractHash, current.revision.contractHash);
    assert.notStrictEqual(published.revision.schemaHash, current.revision.schemaHash);
    assert.strictEqual(published.presentation.displayName, "Editorial Posts");
    assert.strictEqual(published.presentation.fields[0]?.displayLabel, "Headline");

    const staleApply = await Effect.runPromise(
      authoring.apply(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaApplyInput)({
          scope,
          project: projectDocument,
          commandId: randomUUID(),
          expectedCurrent: stalePlan.current,
          expectedPlanHash: stalePlan.planHash,
          acknowledgedChangeIds: [],
        }),
        new Date("2026-08-24T02:00:11.000Z"),
        `m13-presentation-stale-apply-${suffix}`,
      ),
    );
    assert.strictEqual(staleApply.kind, "stale_schema_authority");

    const noOpRequest = Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)({
      commandId: randomUUID(),
      expectedRevisionId: published.revision.revisionId,
      expectedSequence: published.revision.sequence,
      presentation: published.presentation,
    });
    const noOp = await Effect.runPromise(
      presentation.publish(
        managementActor,
        scope,
        "posts",
        noOpRequest,
        new Date("2026-08-24T02:00:12.000Z"),
        `m13-presentation-noop-${suffix}`,
      ),
    );
    assert.isTrue(noOp.noOp);
    assert.strictEqual(noOp.revision.revisionId, published.revision.revisionId);

    const staleExit = await Effect.runPromiseExit(
      presentation.publish(
        managementActor,
        scope,
        "posts",
        Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)({
          ...noOpRequest,
          commandId: randomUUID(),
          expectedRevisionId: current.revision.revisionId,
          expectedSequence: current.revision.sequence,
        }),
        new Date("2026-08-24T02:00:13.000Z"),
        `m13-presentation-stale-${suffix}`,
      ),
    );
    assert.strictEqual(staleExit._tag, "Failure");

    const conflictExit = await Effect.runPromiseExit(
      presentation.publish(
        managementActor,
        scope,
        "posts",
        Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)({
          ...request,
          presentation: { ...request.presentation, displayName: "Conflicting reuse" },
        }),
        new Date("2026-08-24T02:00:14.000Z"),
        `m13-presentation-command-conflict-${suffix}`,
      ),
    );
    assert.strictEqual(conflictExit._tag, "Failure");

    const [revisionRow, headRow, collectionRow, audits, events] = await Promise.all([
      db
        .select()
        .from(cmsSchemaRevision)
        .where(eq(cmsSchemaRevision.id, published.revision.revisionId))
        .then((rows) => rows[0]),
      db
        .select()
        .from(cmsCollectionSchemaHead)
        .where(
          eq(cmsCollectionSchemaHead.currentPublishedRevisionId, published.revision.revisionId),
        )
        .then((rows) => rows[0]),
      db
        .select()
        .from(cmsCollection)
        .where(
          and(eq(cmsCollection.projectId, currentProject.id), eq(cmsCollection.apiKey, "posts")),
        )
        .then((rows) => rows[0]),
      db
        .select({ actorType: auditEvent.actorType, actorId: auditEvent.actorId })
        .from(auditEvent)
        .where(eq(auditEvent.action, "cms.schema.presentation.published")),
      db
        .select({ revisionId: outboxEvent.schemaRevisionId })
        .from(outboxEvent)
        .where(eq(outboxEvent.schemaRevisionId, published.revision.revisionId)),
    ]);
    assert.strictEqual(revisionRow?.publishedByCredentialId, managementCredentialId);
    assert.strictEqual(headRow?.currentPublishedStructureHash, current.revision.structureHash);
    assert.strictEqual(collectionRow?.displayName, "Editorial Posts");
    assert.isTrue(
      audits.some(
        (audit) => audit.actorType === "credential" && audit.actorId === managementCredentialId,
      ),
    );
    assert.deepStrictEqual(events, [{ revisionId: published.revision.revisionId }]);

    const plans = await db.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      const collectionPlan = await transaction.execute(
        sql`explain (format json) select id from cms_collection where workspace_id = ${required(workspaceModel, "workspace").id} and project_id = ${currentProject.id} and environment_id = ${currentProject.environment.id} and api_key = 'posts' limit 1`,
      );
      const revisionPlan = await transaction.execute(
        sql`explain (format json) select id from cms_schema_revision where collection_id = ${published.revision.collectionId} and command_id = ${commandId} limit 1`,
      );
      const fieldsPlan = await transaction.execute(
        sql`explain (format json) select field_id from cms_schema_revision_field where revision_id = ${published.revision.revisionId} order by position, field_id`,
      );
      const collectionSourcePlan = await transaction.execute(
        sql`explain (format json) select id from cms_collection where environment_id = ${currentProject.environment.id} and source_key = 'posts' limit 1`,
      );
      const fieldSourcePlan = await transaction.execute(
        sql`explain (format json) select id from cms_collection_field where collection_id = ${published.revision.collectionId} and source_key = 'status' order by source_key limit 1`,
      );
      const enumSourcePlan = await transaction.execute(
        sql`explain (format json) select id from cms_enum_option_source_identity where field_id = (select id from cms_collection_field where collection_id = ${published.revision.collectionId} and source_key = 'status' order by source_key limit 1) and source_key = 'draft' order by source_key limit 1`,
      );
      const currentAuthorityPlan = await transaction.execute(
        sql`explain (format json) select current_published_revision_id from cms_collection_schema_head where collection_id = ${published.revision.collectionId} limit 1`,
      );
      const applyReplayPlan = await transaction.execute(
        sql`explain (format json) select result from cms_project_schema_apply_command where environment_id = ${currentProject.environment.id} and command_id = ${randomUUID()} limit 1`,
      );
      const revisionCredentialPlan = await transaction.execute(
        sql`explain (format json) select id from cms_schema_revision where published_by_credential_id = ${managementCredentialId} limit 20`,
      );
      const headCredentialPlan = await transaction.execute(
        sql`explain (format json) select collection_id from cms_collection_schema_head where changed_by_credential_id = ${managementCredentialId} limit 20`,
      );
      const applyCredentialPlan = await transaction.execute(
        sql`explain (format json) select command_id from cms_project_schema_apply_command where completed_by_credential_id = ${managementCredentialId} limit 20`,
      );
      return JSON.stringify([
        collectionPlan.rows,
        revisionPlan.rows,
        fieldsPlan.rows,
        collectionSourcePlan.rows,
        fieldSourcePlan.rows,
        enumSourcePlan.rows,
        currentAuthorityPlan.rows,
        applyReplayPlan.rows,
        revisionCredentialPlan.rows,
        headCredentialPlan.rows,
        applyCredentialPlan.rows,
      ]);
    });
    assert.match(plans, /cms_collection_environment_(?:key|source_key)_unique/u);
    assert.match(plans, /cms_field_collection_(?:source_key_unique|idx)/u);
    assert.match(plans, /cms_enum_option_(?:field_source_key_unique|collection_field_idx)/u);
    assert.match(
      plans,
      /cms_revision_collection_(?:command_unique|sequence_unique|sequence_desc_idx)/u,
    );
    assert.match(plans, /cms_revision_field_(?:revision_field_pk|parent_position_idx)/u);
    assert.match(plans, /cms_collection_schema_head_pkey/u);
    assert.match(plans, /cms_project_schema_apply_(?:command_pk|completed_idx)/u);
    assert.match(plans, /cms_revision_published_by_credential_idx/u);
    assert.match(plans, /cms_head_changed_by_credential_idx/u);
    assert.match(plans, /cms_project_schema_apply_completed_by_credential_idx/u);
  });

  it("rolls every presentation publication stage back atomically", async () => {
    const currentProject = required(projectModel, "project");
    const scope = {
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
    };
    const baseline = await Effect.runPromise(presentation.get(managementActor, scope, "posts"));
    const [before] = await db
      .select({
        revisions: db.$count(cmsSchemaRevision, eq(cmsSchemaRevision.projectId, currentProject.id)),
        audits: db.$count(auditEvent, eq(auditEvent.projectId, currentProject.id)),
        outbox: db.$count(outboxEvent, eq(outboxEvent.projectId, currentProject.id)),
      })
      .from(project)
      .where(eq(project.id, currentProject.id));
    for (const stage of ["revision", "active_presentation", "head", "audit", "outbox"] as const) {
      const commandId = randomUUID();
      const failed = await Effect.runPromiseExit(
        makeAuthoringPresentationRepository({ testFailAfter: stage }).publish(
          managementActor,
          scope,
          "posts",
          Schema.decodeUnknownSync(AuthoringPublishPresentationRequest)({
            commandId,
            expectedRevisionId: baseline.revision.revisionId,
            expectedSequence: baseline.revision.sequence,
            presentation: {
              ...baseline.presentation,
              displayName: `Rejected ${stage.replaceAll("_", " ")}`,
            },
          }),
          new Date("2026-08-24T02:00:20.000Z"),
          `m13-presentation-rollback-${stage}-${suffix}`,
        ),
      );
      assert.strictEqual(failed._tag, "Failure");
      const [after, commandRows, currentCollection] = await Promise.all([
        db
          .select({
            revisions: db.$count(
              cmsSchemaRevision,
              eq(cmsSchemaRevision.projectId, currentProject.id),
            ),
            audits: db.$count(auditEvent, eq(auditEvent.projectId, currentProject.id)),
            outbox: db.$count(outboxEvent, eq(outboxEvent.projectId, currentProject.id)),
          })
          .from(project)
          .where(eq(project.id, currentProject.id))
          .then((rows) => rows[0]),
        db
          .select({ id: cmsSchemaRevision.id })
          .from(cmsSchemaRevision)
          .where(eq(cmsSchemaRevision.commandId, commandId)),
        db
          .select({ displayName: cmsCollection.displayName })
          .from(cmsCollection)
          .where(
            and(eq(cmsCollection.projectId, currentProject.id), eq(cmsCollection.apiKey, "posts")),
          )
          .then((rows) => rows[0]),
      ]);
      assert.deepStrictEqual(after, before);
      assert.lengthOf(commandRows, 0);
      assert.strictEqual(currentCollection?.displayName, baseline.presentation.displayName);
      const current = await Effect.runPromise(presentation.get(managementActor, scope, "posts"));
      assert.strictEqual(current.revision.revisionId, baseline.revision.revisionId);
      assert.deepStrictEqual(current.presentation, baseline.presentation);
    }
  });

  it("rolls identity, revision, pointer, audit, outbox, and receipt writes back together", async () => {
    const currentProject = required(projectModel, "project");
    const scope = {
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
    };
    const renamedProject = {
      ...projectDocument,
      collections: projectDocument.collections.map((collection) =>
        collection.sourceKey === "posts"
          ? {
              ...collection,
              apiKey: "articles",
              fields: [
                ...collection.fields,
                {
                  sourceKey: "rollback_probe",
                  apiKey: "rollback_probe",
                  kind: "short_text" as const,
                  required: false,
                  localization: "localized" as const,
                  configuration: {},
                },
              ],
            }
          : collection,
      ),
    };
    const plan = await Effect.runPromise(
      authoring.plan(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaPlanInput)({ scope, project: renamedProject }),
      ),
    );
    assert.isTrue(plan.valid);
    if (!plan.valid) throw new Error("Expected a valid rename plan.");
    const baseline = {
      collections: await db.$count(cmsCollection, eq(cmsCollection.projectId, currentProject.id)),
      fields: await db.$count(
        cmsCollectionField,
        eq(cmsCollectionField.projectId, currentProject.id),
      ),
      revisions: await db.$count(
        cmsSchemaRevision,
        eq(cmsSchemaRevision.projectId, currentProject.id),
      ),
      audits: await db.$count(auditEvent, eq(auditEvent.projectId, currentProject.id)),
      outbox: await db.$count(outboxEvent, eq(outboxEvent.projectId, currentProject.id)),
      receipts: await db.$count(
        cmsProjectSchemaApplyCommand,
        eq(cmsProjectSchemaApplyCommand.projectId, currentProject.id),
      ),
    };
    for (const stage of ["identities", "revisions", "publications", "receipt"] as const) {
      const commandId = randomUUID();
      const failed = await Effect.runPromiseExit(
        makeAuthoringSchemaRepository({ testFailApplyAfter: stage }).apply(
          ownerActor,
          Schema.decodeUnknownSync(AuthoringSchemaApplyInput)({
            scope,
            project: renamedProject,
            commandId,
            expectedCurrent: plan.current,
            expectedPlanHash: plan.planHash,
            acknowledgedChangeIds: plan.changes
              .filter((change) => change.classification !== "non_breaking")
              .map((change) => change.changeId),
          }),
          new Date("2026-08-24T02:01:00.000Z"),
          `m13-rollback-${stage}-${suffix}`,
        ),
      );
      assert.strictEqual(failed._tag, "Failure");
      const [receipt, posts] = await Promise.all([
        db
          .select({ commandId: cmsProjectSchemaApplyCommand.commandId })
          .from(cmsProjectSchemaApplyCommand)
          .where(eq(cmsProjectSchemaApplyCommand.commandId, commandId)),
        db
          .select({ apiKey: cmsCollection.apiKey })
          .from(cmsCollection)
          .where(
            and(
              eq(cmsCollection.projectId, currentProject.id),
              eq(cmsCollection.sourceKey, "posts"),
            ),
          ),
      ]);
      assert.lengthOf(receipt, 0);
      assert.strictEqual(posts[0]?.apiKey, "posts");
      assert.deepStrictEqual(
        {
          collections: await db.$count(
            cmsCollection,
            eq(cmsCollection.projectId, currentProject.id),
          ),
          fields: await db.$count(
            cmsCollectionField,
            eq(cmsCollectionField.projectId, currentProject.id),
          ),
          revisions: await db.$count(
            cmsSchemaRevision,
            eq(cmsSchemaRevision.projectId, currentProject.id),
          ),
          audits: await db.$count(auditEvent, eq(auditEvent.projectId, currentProject.id)),
          outbox: await db.$count(outboxEvent, eq(outboxEvent.projectId, currentProject.id)),
          receipts: await db.$count(
            cmsProjectSchemaApplyCommand,
            eq(cmsProjectSchemaApplyCommand.projectId, currentProject.id),
          ),
        },
        baseline,
      );
    }

    const unchanged = await Effect.runPromise(
      authoring.plan(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaPlanInput)({ scope, project: projectDocument }),
      ),
    );
    assert.isTrue(unchanged.valid);
    assert.strictEqual(unchanged.current.projectManifestHash, plan.current.projectManifestHash);
  });

  it("swaps collection API keys without replacing stable source identities", async () => {
    const currentProject = required(projectModel, "project");
    const scope = {
      projectId: currentProject.id,
      environmentId: currentProject.environment.id,
    };
    const swappedProject = {
      ...projectDocument,
      collections: projectDocument.collections.map((collection) => ({
        ...collection,
        apiKey: collection.sourceKey === "authors" ? "posts" : "authors",
      })),
    };
    const before = await db
      .select({ id: cmsCollection.id, sourceKey: cmsCollection.sourceKey })
      .from(cmsCollection)
      .where(eq(cmsCollection.projectId, currentProject.id));
    const plan = await Effect.runPromise(
      authoring.plan(
        ownerActor,
        Schema.decodeUnknownSync(AuthoringSchemaPlanInput)({ scope, project: swappedProject }),
      ),
    );
    assert.isTrue(plan.valid);
    if (!plan.valid) throw new Error("Expected a valid API-key swap plan.");
    const commandId = randomUUID();
    const requestId = `m13-swap-${suffix}`;
    const decision = await Effect.runPromise(
      authoring.apply(
        managementActor,
        Schema.decodeUnknownSync(AuthoringSchemaApplyInput)({
          scope,
          project: swappedProject,
          commandId,
          expectedCurrent: plan.current,
          expectedPlanHash: plan.planHash,
          acknowledgedChangeIds: plan.changes
            .filter((change) => change.classification !== "non_breaking")
            .map((change) => change.changeId),
        }),
        new Date("2026-08-24T02:02:00.000Z"),
        requestId,
      ),
    );
    assert.strictEqual(decision.kind, "success");
    const after = await db
      .select({
        id: cmsCollection.id,
        sourceKey: cmsCollection.sourceKey,
        apiKey: cmsCollection.apiKey,
      })
      .from(cmsCollection)
      .where(eq(cmsCollection.projectId, currentProject.id));
    assert.deepStrictEqual(
      after
        .map(({ sourceKey, apiKey }) => ({ sourceKey, apiKey }))
        .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
      [
        { sourceKey: "authors", apiKey: "posts" },
        { sourceKey: "posts", apiKey: "authors" },
      ],
    );
    assert.deepStrictEqual(
      after
        .map(({ id, sourceKey }) => ({ id, sourceKey }))
        .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
      before
        .map(({ id, sourceKey }) => ({ id, sourceKey }))
        .sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
    );
    const [receipt, revisions, audits] = await Promise.all([
      db
        .select({
          userId: cmsProjectSchemaApplyCommand.completedByUserId,
          credentialId: cmsProjectSchemaApplyCommand.completedByCredentialId,
        })
        .from(cmsProjectSchemaApplyCommand)
        .where(eq(cmsProjectSchemaApplyCommand.commandId, commandId)),
      db
        .select({
          userId: cmsSchemaRevision.publishedByUserId,
          credentialId: cmsSchemaRevision.publishedByCredentialId,
        })
        .from(cmsSchemaRevision)
        .where(eq(cmsSchemaRevision.commandId, commandId)),
      db
        .select({ actorType: auditEvent.actorType, actorId: auditEvent.actorId })
        .from(auditEvent)
        .where(eq(auditEvent.requestId, requestId)),
    ]);
    assert.deepStrictEqual(receipt, [{ userId: null, credentialId: managementCredentialId }]);
    assert.lengthOf(revisions, 2);
    assert.isTrue(
      revisions.every(
        (revision) => revision.userId === null && revision.credentialId === managementCredentialId,
      ),
    );
    assert.lengthOf(audits, 2);
    assert.isTrue(
      audits.every(
        (audit) => audit.actorType === "credential" && audit.actorId === managementCredentialId,
      ),
    );
  });
});
