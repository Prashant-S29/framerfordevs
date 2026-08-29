import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull, sql } from "@framerfordevs/db/query";
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
import { auditEvent } from "@framerfordevs/db/schema/platform";
import { cmsInvalidationRouteMapping } from "@framerfordevs/db/schema/webhooks";
import { Schema } from "effect";

import {
  CollectionSourceKey,
  EnumOptionSourceKey,
  FieldSourceKey,
  ProjectStructureManifestHash,
  StructureHash,
  type CmsActor,
  type SchemaApplyFingerprint,
} from "../../../contracts/authoring";
import {
  AppliedCollectionRevision,
  AppliedCollectionSourceIdentity,
  AppliedEnumOptionSourceIdentity,
  AppliedFieldSourceIdentity,
  AuthoringSchemaApplyResult,
  type AuthoringSchemaApplyInput,
} from "../../../contracts/authoring/schema";
import { EditorLayoutNodeId, EnumOptionId } from "../../../contracts/field";
import {
  CmsCollection,
  CollectionApiKey,
  CollectionDisplayName,
  CollectionFieldId,
  CollectionId,
  SchemaRevisionId,
} from "../../../contracts/schema";
import { ResourceVersion } from "../../../contracts/platform";
import { buildAllocatedProjectCandidates } from "../../../lib/authoring/allocated";
import { buildAuthoringProjectPlan } from "../../../lib/authoring/project-plan";
import { fingerprintAuthoringSchemaApply } from "../../../lib/authoring/apply-authority";
import {
  hasExactAllocatedProjectChanges,
  verifyAuthoringSchemaApply,
} from "../../../lib/authoring/apply-gate";
import { validateCompleteProjectSchema } from "../../../lib/authoring/schema-document";
import { canonicalizeEntryValue } from "../../../lib/entry/values";
import { flattenFieldTree } from "../../../lib/field/tree";
import { matchInvalidationMappings } from "../../../lib/invalidation-mappings";
import { reconcileProjectSourceIdentities } from "../../../lib/authoring/sources";
import {
  computeProjectStructureManifestHash,
  type StructureIdentityMap,
} from "../../../lib/authoring/hash";
import { cmsActorMatches, cmsActorReferences, cmsAuditActor } from "../../cms-actor";
import type { ApplicationTransaction } from "../../project-access";
import { loadAuthoringProjectPlanContext } from "./repository";

export type AuthoringSchemaApplyFailureStage =
  | "identities"
  | "revisions"
  | "publications"
  | "receipt";

export type AuthoringSchemaApplyDecision =
  | { readonly kind: "success"; readonly result: AuthoringSchemaApplyResult }
  | { readonly kind: "command_conflict" }
  | {
      readonly kind:
        | "stale_schema_authority"
        | "schema_plan_invalid"
        | "schema_plan_mismatch"
        | "schema_acknowledgement_mismatch"
        | "source_identity_conflict"
        | "allocated_candidate_mismatch";
      readonly issues?: ReadonlyArray<{ readonly path: string; readonly code: string }>;
    };

const JsonObject = Schema.Record({ key: Schema.String, value: Schema.Unknown });

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  return Schema.decodeUnknownSync(JsonObject)(JSON.parse(JSON.stringify(value)));
}

function displayName(apiKey: string): string {
  return apiKey
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function collectionModel(options: {
  readonly id: CollectionId;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly sourceApiKey: string;
  readonly now: Date;
}): CmsCollection {
  return Schema.decodeUnknownSync(CmsCollection)({
    id: options.id,
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    apiKey: CollectionApiKey.make(options.sourceApiKey),
    displayName: CollectionDisplayName.make(displayName(options.sourceApiKey)),
    description: null,
    version: ResourceVersion.make(1),
    draftVersion: ResourceVersion.make(1),
    draftBaseRevisionId: null,
    currentPublishedRevisionId: null,
    currentPublishedSequence: 0,
    createdAt: options.now.toISOString(),
    updatedAt: options.now.toISOString(),
  });
}

function referenceCollectionId(field: ReturnType<typeof flattenFieldTree>[number]) {
  return field.kind === "reference" ? field.configuration.targetCollectionId : null;
}

function actorAuditValues(actor: CmsActor) {
  return cmsAuditActor(actor);
}

async function loadReplay(
  transaction: ApplicationTransaction,
  input: AuthoringSchemaApplyInput,
  actor: CmsActor,
  fingerprint: SchemaApplyFingerprint,
): Promise<AuthoringSchemaApplyDecision | null> {
  const [receipt] = await transaction
    .select()
    .from(cmsProjectSchemaApplyCommand)
    .where(
      and(
        eq(cmsProjectSchemaApplyCommand.environmentId, input.scope.environmentId),
        eq(cmsProjectSchemaApplyCommand.commandId, input.commandId),
      ),
    )
    .limit(1);
  if (!receipt) return null;
  if (
    receipt.commandFingerprint !== fingerprint ||
    !cmsActorMatches(actor, {
      userId: receipt.completedByUserId,
      credentialId: receipt.completedByCredentialId,
    })
  ) {
    return { kind: "command_conflict" };
  }
  const result = Schema.decodeUnknownSync(AuthoringSchemaApplyResult)(receipt.result);
  return {
    kind: "success",
    result: AuthoringSchemaApplyResult.make({ ...result, replayed: true }),
  };
}

/** Executes only after project authorization and inside one project-scoped transaction. */
export async function applyAuthoringProjectSchema(options: {
  readonly transaction: ApplicationTransaction;
  readonly workspaceId: string;
  readonly actor: CmsActor;
  readonly input: AuthoringSchemaApplyInput;
  readonly now: Date;
  readonly requestId: string;
  readonly failAfter?: AuthoringSchemaApplyFailureStage;
}): Promise<AuthoringSchemaApplyDecision> {
  const { transaction, input, actor, workspaceId, now, requestId } = options;
  const failAfter = (stage: AuthoringSchemaApplyFailureStage) => {
    if (options.failAfter === stage)
      throw new Error(`Injected Authoring apply failure after ${stage}.`);
  };
  const document = validateCompleteProjectSchema(input.project, []);
  if (!document.valid) {
    return { kind: "schema_plan_invalid", issues: document.issues };
  }
  const fingerprint = fingerprintAuthoringSchemaApply({
    actor,
    projectId: input.scope.projectId,
    environmentId: input.scope.environmentId,
    commandId: input.commandId,
    canonicalProjectJson: document.canonicalJson,
    expectedCurrent: input.expectedCurrent,
    expectedPlanHash: input.expectedPlanHash,
    acknowledgedChangeIds: input.acknowledgedChangeIds,
  });

  await transaction.execute(
    sql`select id from project where id = ${input.scope.projectId} and workspace_id = ${workspaceId} for update`,
  );
  const replay = await loadReplay(transaction, input, actor, fingerprint);
  if (replay) return replay;
  await transaction.execute(
    sql`select id from cms_collection where workspace_id = ${workspaceId} and project_id = ${input.scope.projectId} and environment_id = ${input.scope.environmentId} order by id for update`,
  );

  const context = await loadAuthoringProjectPlanContext(transaction, {
    workspaceId,
    projectId: input.scope.projectId,
    environmentId: input.scope.environmentId,
  });
  const actualPlan = buildAuthoringProjectPlan(input.project, context);
  const gate = verifyAuthoringSchemaApply({
    expectedCurrent: input.expectedCurrent,
    actualCurrent: context.current,
    expectedPlanHash: input.expectedPlanHash,
    actualPlan,
    acknowledgedChangeIds: input.acknowledgedChangeIds,
  });
  if (!gate.accepted) return { kind: gate.code };

  const reconciliation = reconcileProjectSourceIdentities(
    input.project,
    context.persistedIdentities,
  );
  if (!reconciliation.valid) {
    return { kind: "source_identity_conflict", issues: reconciliation.issues };
  }
  const collectionIds = reconciliation.collections.map((identity) => ({
    sourceKey: identity.sourceKey,
    collectionId: identity.collectionId ?? CollectionId.make(randomUUID()),
    isNew: identity.status === "new",
  }));
  const fieldIds = reconciliation.fields.map((identity) => ({
    collectionSourceKey: identity.collectionSourceKey,
    sourceKey: identity.sourceKey,
    fieldId: identity.fieldId ?? CollectionFieldId.make(randomUUID()),
    isNew: identity.status === "new",
  }));
  const optionIds = reconciliation.enumOptions.map((identity) => ({
    collectionSourceKey: identity.collectionSourceKey,
    fieldSourceKey: identity.fieldSourceKey,
    sourceKey: identity.sourceKey,
    optionId: identity.optionId ?? EnumOptionId.make(randomUUID()),
    isNew: identity.status === "new",
  }));
  const identities: StructureIdentityMap = {
    collections: collectionIds,
    fields: fieldIds,
    enumOptions: optionIds,
  };
  const currentStates = new Map(context.collections.map((state) => [state.sourceKey, state]));
  const allocatedStates = input.project.collections.map((schema) => {
    const identity = collectionIds.find((item) => item.sourceKey === schema.sourceKey);
    if (!identity) throw new Error("Allocated collection identity was not found.");
    const current = currentStates.get(schema.sourceKey);
    const collection =
      current?.collection ??
      collectionModel({
        id: identity.collectionId,
        workspaceId,
        projectId: input.scope.projectId,
        environmentId: input.scope.environmentId,
        sourceApiKey: schema.apiKey,
        now,
      });
    const collectionFields = fieldIds.filter(
      (field) => field.collectionSourceKey === schema.sourceKey,
    );
    return {
      sourceKey: schema.sourceKey,
      collection,
      currentPublished: current?.published ?? null,
      layoutAllocations: {
        tabId: EditorLayoutNodeId.make(randomUUID()),
        groupId: EditorLayoutNodeId.make(randomUUID()),
        placementIds: new Map(
          collectionFields.map((field) => [field.fieldId, EditorLayoutNodeId.make(randomUUID())]),
        ),
      },
    };
  });
  const allocated = buildAllocatedProjectCandidates({
    project: input.project,
    identities,
    collections: allocatedStates,
  });
  if (!allocated.valid) {
    return { kind: "source_identity_conflict", issues: allocated.issues };
  }
  if (!hasExactAllocatedProjectChanges(actualPlan.changes, allocated.changes)) {
    return { kind: "allocated_candidate_mismatch" };
  }

  const actorRefs = cmsActorReferences(actor);
  const changedCandidates = allocated.collections.filter(({ candidate }) => !candidate.noOp);
  for (const { sourceKey, candidate } of changedCandidates) {
    if (!currentStates.has(sourceKey)) continue;
    const temporaryApiKey = `tmp_${candidate.draft.collection.id.replaceAll("-", "").slice(-12)}`;
    await transaction
      .update(cmsCollection)
      .set({ apiKey: temporaryApiKey })
      .where(eq(cmsCollection.id, candidate.draft.collection.id));
  }
  const newCollections = collectionIds.filter((identity) => identity.isNew);
  if (newCollections.length > 0) {
    await transaction.insert(cmsCollection).values(
      newCollections.map((identity) => {
        const schema = input.project.collections.find(
          (collection) => collection.sourceKey === identity.sourceKey,
        );
        if (!schema) throw new Error("New collection schema was not found.");
        return {
          id: identity.collectionId,
          workspaceId,
          projectId: input.scope.projectId,
          environmentId: input.scope.environmentId,
          sourceKey: identity.sourceKey,
          apiKey: schema.apiKey,
          displayName: displayName(schema.apiKey),
          description: null,
          createdByUserId: actorRefs.userId,
          createdByCredentialId: actorRefs.credentialId,
          changedByUserId: actorRefs.userId,
          changedByCredentialId: actorRefs.credentialId,
          createdAt: now,
          updatedAt: now,
        };
      }),
    );
    await transaction.insert(cmsCollectionSchemaHead).values(
      newCollections.map((identity) => ({
        collectionId: identity.collectionId,
        workspaceId,
        projectId: input.scope.projectId,
        environmentId: input.scope.environmentId,
        changedByUserId: actorRefs.userId,
        changedByCredentialId: actorRefs.credentialId,
        updatedAt: now,
      })),
    );
    await transaction.insert(cmsCollectionDeliveryConfig).values(
      newCollections.map((identity) => ({
        collectionId: identity.collectionId,
        workspaceId,
        projectId: input.scope.projectId,
        environmentId: input.scope.environmentId,
        access: "protected" as const,
        version: 1,
        changedByUserId: actorRefs.userId,
        changedByCredentialId: actorRefs.credentialId,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  const changedCollectionIds = changedCandidates.map(
    ({ candidate }) => candidate.draft.collection.id,
  );
  if (changedCollectionIds.length > 0) {
    await transaction
      .update(cmsCollectionField)
      .set({
        removedAt: now,
        removedByUserId: actorRefs.userId,
        removedByCredentialId: actorRefs.credentialId,
        position: null,
        changedByUserId: actorRefs.userId,
        changedByCredentialId: actorRefs.credentialId,
        updatedAt: now,
      })
      .where(
        and(
          inArray(cmsCollectionField.collectionId, changedCollectionIds),
          isNull(cmsCollectionField.removedAt),
        ),
      );
  }

  const activeFieldValues = changedCandidates.flatMap(({ sourceKey, candidate }) => {
    const sourceKeys = new Map(
      fieldIds
        .filter((field) => field.collectionSourceKey === sourceKey)
        .map((field) => [field.fieldId, field.sourceKey]),
    );
    return flattenFieldTree(candidate.draft.fields).map((field) => ({
      id: field.id,
      workspaceId,
      projectId: input.scope.projectId,
      environmentId: input.scope.environmentId,
      collectionId: candidate.draft.collection.id,
      sourceKey: sourceKeys.get(field.id) ?? "missing",
      parentFieldId: field.parentFieldId,
      nodeRole: field.nodeRole,
      referenceCollectionId: referenceCollectionId(field),
      apiKey: field.apiKey,
      displayLabel: field.displayLabel,
      kind: field.kind,
      required: field.required,
      localization: field.localization,
      deprecated: field.deprecated,
      position: field.position,
      editorMetadata: jsonObject(field.editor),
      configuration: jsonObject(field.configuration),
      createdByUserId: actorRefs.userId,
      createdByCredentialId: actorRefs.credentialId,
      changedByUserId: actorRefs.userId,
      changedByCredentialId: actorRefs.credentialId,
      removedAt: null,
      removedByUserId: null,
      removedByCredentialId: null,
      createdAt: now,
      updatedAt: now,
    }));
  });
  if (activeFieldValues.some((field) => field.sourceKey === "missing")) {
    throw new Error("Allocated field source identity was not found.");
  }
  if (activeFieldValues.length > 0) {
    await transaction
      .insert(cmsCollectionField)
      .values(activeFieldValues)
      .onConflictDoUpdate({
        target: cmsCollectionField.id,
        set: {
          parentFieldId: sql`excluded.parent_field_id`,
          nodeRole: sql`excluded.node_role`,
          referenceCollectionId: sql`excluded.reference_collection_id`,
          apiKey: sql`excluded.api_key`,
          displayLabel: sql`excluded.display_label`,
          kind: sql`excluded.kind`,
          required: sql`excluded.required`,
          localization: sql`excluded.localization`,
          deprecated: sql`excluded.deprecated`,
          position: sql`excluded.position`,
          editorMetadata: sql`excluded.editor_metadata`,
          configuration: sql`excluded.configuration`,
          changedByUserId: actorRefs.userId,
          changedByCredentialId: actorRefs.credentialId,
          removedAt: null,
          removedByUserId: null,
          removedByCredentialId: null,
          updatedAt: now,
        },
      });
  }

  const newOptions = optionIds.filter((identity) => identity.isNew);
  if (newOptions.length > 0) {
    await transaction.insert(cmsEnumOptionSourceIdentity).values(
      newOptions.map((identity) => {
        const collectionId = collectionIds.find(
          (collection) => collection.sourceKey === identity.collectionSourceKey,
        )?.collectionId;
        const fieldId = fieldIds.find(
          (field) =>
            field.collectionSourceKey === identity.collectionSourceKey &&
            field.sourceKey === identity.fieldSourceKey,
        )?.fieldId;
        if (!collectionId || !fieldId)
          throw new Error("Enum option parent identity was not found.");
        return {
          id: identity.optionId,
          workspaceId,
          projectId: input.scope.projectId,
          environmentId: input.scope.environmentId,
          collectionId,
          fieldId,
          sourceKey: identity.sourceKey,
          createdByUserId: actorRefs.userId,
          createdByCredentialId: actorRefs.credentialId,
          createdAt: now,
        };
      }),
    );
  }
  if (reconciliation.removedEnumOptionIds.length > 0) {
    await transaction
      .update(cmsEnumOptionSourceIdentity)
      .set({
        retiredAt: now,
        retiredByUserId: actorRefs.userId,
        retiredByCredentialId: actorRefs.credentialId,
      })
      .where(inArray(cmsEnumOptionSourceIdentity.id, reconciliation.removedEnumOptionIds));
  }

  failAfter("identities");

  const revisions = changedCandidates.map(({ sourceKey, candidate }) => {
    const current = currentStates.get(sourceKey);
    return {
      sourceKey,
      id: SchemaRevisionId.make(randomUUID()),
      candidate,
      sequence: (current?.collection.currentPublishedSequence ?? 0) + 1,
      previousRevisionId: current?.collection.currentPublishedRevisionId ?? null,
    };
  });
  if (revisions.length > 0) {
    await transaction.insert(cmsSchemaRevision).values(
      revisions.map(({ id, candidate, sequence, previousRevisionId }) => ({
        id,
        workspaceId,
        projectId: input.scope.projectId,
        environmentId: input.scope.environmentId,
        collectionId: candidate.draft.collection.id,
        sequence,
        previousRevisionId,
        collectionApiKey: candidate.draft.collection.apiKey,
        collectionDisplayName: candidate.draft.collection.displayName,
        collectionDescription: candidate.draft.collection.description,
        formatVersion: candidate.draft.formatVersion,
        validationProfile: candidate.draft.validationProfile,
        currencyRegistryProfile: candidate.draft.currencyRegistryProfile,
        editorLayout: jsonObject(candidate.draft.editorLayout),
        schemaHash: candidate.schemaHash,
        structureHash: candidate.structureHash,
        commandId: input.commandId,
        commandFingerprint: fingerprint,
        nonBreakingChangeCount: candidate.changes.nonBreakingCount,
        potentiallyBreakingChangeCount: candidate.changes.potentiallyBreakingCount,
        breakingChangeCount: candidate.changes.breakingCount,
        publishedByUserId: actorRefs.userId,
        publishedByCredentialId: actorRefs.credentialId,
        publishedAt: now,
      })),
    );
    const snapshots = revisions.flatMap(({ id, candidate }) =>
      flattenFieldTree(candidate.draft.fields).map((field) => ({
        revisionId: id,
        fieldId: field.id,
        workspaceId,
        projectId: input.scope.projectId,
        environmentId: input.scope.environmentId,
        collectionId: candidate.draft.collection.id,
        parentFieldId: field.parentFieldId,
        nodeRole: field.nodeRole,
        referenceCollectionId: referenceCollectionId(field),
        apiKey: field.apiKey,
        displayLabel: field.displayLabel,
        kind: field.kind,
        required: field.required,
        localization: field.localization,
        deprecated: field.deprecated,
        position: field.position,
        editorMetadata: jsonObject(field.editor),
        configuration: jsonObject(field.configuration),
      })),
    );
    if (snapshots.length > 0) await transaction.insert(cmsSchemaRevisionField).values(snapshots);
  }
  failAfter("revisions");

  for (const revision of revisions) {
    const { candidate } = revision;
    const current = currentStates.get(revision.sourceKey);
    if (current) {
      await transaction
        .update(cmsCollection)
        .set({
          apiKey: candidate.draft.collection.apiKey,
          version:
            current.collection.apiKey === candidate.draft.collection.apiKey
              ? current.collection.version
              : sql`${cmsCollection.version} + 1`,
          changedByUserId: actorRefs.userId,
          changedByCredentialId: actorRefs.credentialId,
          updatedAt: now,
        })
        .where(eq(cmsCollection.id, candidate.draft.collection.id));
    }
    await transaction
      .update(cmsCollectionSchemaHead)
      .set({
        draftVersion: sql`${cmsCollectionSchemaHead.draftVersion} + 1`,
        draftBaseRevisionId: revision.id,
        currentPublishedRevisionId: revision.id,
        currentPublishedSequence: revision.sequence,
        currentPublishedStructureHash: candidate.structureHash,
        validationProfile: candidate.draft.validationProfile,
        currencyRegistryProfile: candidate.draft.currencyRegistryProfile,
        editorLayout: jsonObject(candidate.draft.editorLayout),
        changedByUserId: actorRefs.userId,
        changedByCredentialId: actorRefs.credentialId,
        updatedAt: now,
      })
      .where(eq(cmsCollectionSchemaHead.collectionId, candidate.draft.collection.id));
    await transaction.insert(auditEvent).values({
      workspaceId,
      projectId: input.scope.projectId,
      environmentId: input.scope.environmentId,
      ...actorAuditValues(actor),
      action: "cms.schema.published",
      resourceType: "cms_collection",
      resourceId: candidate.draft.collection.id,
      requestId,
    });
    const mappings = await transaction
      .select({
        eventTypes: cmsInvalidationRouteMapping.eventTypes,
        entryId: cmsInvalidationRouteMapping.entryId,
        localeId: cmsInvalidationRouteMapping.localeId,
        routePath: cmsInvalidationRouteMapping.routePath,
        semanticTags: cmsInvalidationRouteMapping.semanticTags,
      })
      .from(cmsInvalidationRouteMapping)
      .where(
        and(
          eq(cmsInvalidationRouteMapping.workspaceId, workspaceId),
          eq(cmsInvalidationRouteMapping.projectId, input.scope.projectId),
          eq(cmsInvalidationRouteMapping.environmentId, input.scope.environmentId),
          eq(cmsInvalidationRouteMapping.collectionId, candidate.draft.collection.id),
          eq(cmsInvalidationRouteMapping.state, "enabled"),
          sql`'cms.schema.published' = any(${cmsInvalidationRouteMapping.eventTypes})`,
          isNull(cmsInvalidationRouteMapping.entryId),
          isNull(cmsInvalidationRouteMapping.localeId),
        ),
      );
    const invalidation = matchInvalidationMappings(mappings, {
      eventType: "cms.schema.published",
      entryId: null,
      localeId: null,
    });
    const changedFieldIds = [
      ...new Set(
        candidate.changes.items.flatMap((change) =>
          change.fieldId === null ? [] : [change.fieldId],
        ),
      ),
    ].sort();
    const payload = {
      version: 1,
      projectId: input.scope.projectId,
      environmentId: input.scope.environmentId,
      collectionId: candidate.draft.collection.id,
      schemaRevisionId: revision.id,
      sequence: revision.sequence,
      schemaHash: candidate.schemaHash,
      contractHash: candidate.contractHash,
      changedFieldIds,
      invalidationTags: [
        `project:${input.scope.projectId}`,
        `environment:${input.scope.environmentId}`,
        `collection:${candidate.draft.collection.id}`,
        ...changedFieldIds.map((fieldId) => `field:${fieldId}`),
      ],
      semanticTags: invalidation.semanticTags,
      routes: invalidation.routes,
    };
    if (Buffer.byteLength(canonicalizeEntryValue(payload), "utf8") > 131_072) {
      throw new Error("Schema publication event payload exceeded the fixed limit.");
    }
    await transaction.insert(outboxEvent).values({
      workspaceId,
      projectId: input.scope.projectId,
      environmentId: input.scope.environmentId,
      eventType: "cms.schema.published",
      subjectType: "cms.collection",
      subjectId: candidate.draft.collection.id,
      schemaRevisionId: revision.id,
      aggregateSequence: revision.sequence,
      payload,
      occurredAt: now,
      availableAt: now,
    });
  }

  failAfter("publications");

  const revisionBySource = new Map(revisions.map((revision) => [revision.sourceKey, revision]));
  const appliedRevisions = allocated.collections.map(({ sourceKey, candidate }) => {
    const changed = revisionBySource.get(sourceKey);
    const current = currentStates.get(sourceKey);
    const revisionId = changed?.id ?? current?.published?.id;
    if (!revisionId) throw new Error("Applied collection has no published revision.");
    return AppliedCollectionRevision.make({
      collectionSourceKey: CollectionSourceKey.make(sourceKey),
      collectionId: candidate.draft.collection.id,
      revisionId,
      structureHash: candidate.structureHash,
      contractHash: candidate.contractHash,
      changed: changed !== undefined,
    });
  });
  const manifestHash = computeProjectStructureManifestHash(
    appliedRevisions.map((revision) => ({
      collectionSourceKey: revision.collectionSourceKey,
      collectionId: revision.collectionId,
      revisionId: revision.revisionId,
      structureHash: revision.structureHash,
    })),
  );
  const result = AuthoringSchemaApplyResult.make({
    commandId: input.commandId,
    replayed: false,
    noOp: revisions.length === 0,
    projectManifestHash: ProjectStructureManifestHash.make(manifestHash),
    collections: collectionIds.map((identity) =>
      AppliedCollectionSourceIdentity.make({
        sourceKey: CollectionSourceKey.make(identity.sourceKey),
        collectionId: identity.collectionId,
        apiKey: CollectionApiKey.make(
          input.project.collections.find(
            (collection) => collection.sourceKey === identity.sourceKey,
          )?.apiKey ?? "missing",
        ),
      }),
    ),
    fields: fieldIds.map((identity) => {
      const candidate = allocated.collections.find(
        (collection) => collection.sourceKey === identity.collectionSourceKey,
      );
      const field = candidate
        ? flattenFieldTree(candidate.candidate.draft.fields).find(
            (item) => item.id === identity.fieldId,
          )
        : undefined;
      if (!field) throw new Error("Applied field was not found.");
      return AppliedFieldSourceIdentity.make({
        collectionSourceKey: CollectionSourceKey.make(identity.collectionSourceKey),
        sourceKey: FieldSourceKey.make(identity.sourceKey),
        fieldId: identity.fieldId,
        apiKey: field.apiKey,
      });
    }),
    enumOptions: optionIds.map((identity) =>
      AppliedEnumOptionSourceIdentity.make({
        collectionSourceKey: CollectionSourceKey.make(identity.collectionSourceKey),
        fieldSourceKey: FieldSourceKey.make(identity.fieldSourceKey),
        sourceKey: EnumOptionSourceKey.make(identity.sourceKey),
        optionId: identity.optionId,
      }),
    ),
    revisions: appliedRevisions,
  });
  await transaction.insert(cmsProjectSchemaApplyCommand).values({
    commandId: input.commandId,
    workspaceId,
    projectId: input.scope.projectId,
    environmentId: input.scope.environmentId,
    commandFingerprint: fingerprint,
    expectedManifestHash: input.expectedCurrent.projectManifestHash,
    planHash: input.expectedPlanHash,
    resultManifestHash: StructureHash.make(manifestHash),
    noOp: result.noOp,
    result: jsonObject(result),
    completedByUserId: actorRefs.userId,
    completedByCredentialId: actorRefs.credentialId,
    completedAt: now,
  });
  if (appliedRevisions.length > 0) {
    await transaction.insert(cmsProjectSchemaApplyRevision).values(
      appliedRevisions.map((revision) => ({
        environmentId: input.scope.environmentId,
        commandId: input.commandId,
        workspaceId,
        projectId: input.scope.projectId,
        collectionId: revision.collectionId,
        revisionId: revision.revisionId,
        structureHash: revision.structureHash,
        contractHash: revision.contractHash,
        changed: revision.changed,
      })),
    );
  }
  failAfter("receipt");
  return { kind: "success", result };
}
