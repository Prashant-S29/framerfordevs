// Provides the explicit dry-run/apply/reconcile gate for current-publication Delivery projections and generations.

import { db } from "@framerfordevs/db";
import { and, eq, inArray, sql } from "@framerfordevs/db/query";
import {
  cmsCollectionDeliveryField,
  cmsCollectionLocaleDeliveryState,
  cmsEntryLocaleDeliveryCurrentValue,
  cmsEntryLocaleDeliverySnapshot,
  cmsEntryLocalePublication,
  cmsEntryLocalePublicationHead,
  cmsSchemaRevisionField,
} from "@framerfordevs/db/schema/cms";
import { Effect, Schema } from "effect";

import { DatabaseFailure } from "../contracts/errors";
import {
  CollectionFieldDefinition,
  defaultFieldEditorMetadata,
  type CollectionFieldDefinition as CollectionField,
} from "../contracts/schemas";
import { compileDeliveryProjections, type DeliveryProjectionRow } from "../lib/delivery-projection";
import { reconstructFieldTree } from "../lib/field-tree";
import type { ApplicationDb, ApplicationTransaction } from "./project-access";

export interface DeliveryBackfillOptions {
  readonly mode: "dry_run" | "apply";
  readonly batchSize: number;
}

export interface DeliveryBackfillReport {
  readonly mode: "dry_run" | "apply";
  readonly currentHeadCount: number;
  readonly projectionRowCount: number;
  readonly collectionLocaleCount: number;
  readonly duplicateUniqueClaimCount: number;
  readonly invalidSnapshotCount: number;
  readonly appliedHeadCount: number;
}

interface HeadArtifact {
  readonly entryId: string;
  readonly localeId: string;
  readonly publicationId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
  readonly headUpdatedAt: Date;
  readonly document: Readonly<Record<string, unknown>>;
}

interface HeadPlan {
  readonly head: HeadArtifact;
  readonly projections: ReadonlyArray<DeliveryProjectionRow>;
}

function databaseFailure(operation: string, cause: unknown): DatabaseFailure {
  return DatabaseFailure.make({ operation, cause });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reconstructs an immutable historical field row without consulting current draft state. */
function fieldValue(row: typeof cmsSchemaRevisionField.$inferSelect): CollectionField {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id: row.fieldId,
    parentFieldId: row.parentFieldId,
    nodeRole: row.nodeRole,
    apiKey: row.apiKey,
    displayLabel: row.displayLabel,
    kind: row.kind,
    required: row.required,
    localization: row.localization,
    deprecated: row.deprecated,
    position: row.position,
    editor:
      Object.keys(row.editorMetadata).length === 0
        ? defaultFieldEditorMetadata
        : row.editorMetadata,
    configuration: row.configuration,
    children: [],
  });
}

/** Converts one pure row to exactly one typed database column. */
function projectionValue(
  head: HeadArtifact,
  row: DeliveryProjectionRow,
): typeof cmsEntryLocaleDeliveryCurrentValue.$inferInsert {
  const common = {
    entryId: head.entryId,
    localeId: head.localeId,
    fieldId: row.fieldId,
    publicationId: head.publicationId,
    workspaceId: head.workspaceId,
    projectId: head.projectId,
    environmentId: head.environmentId,
    collectionId: head.collectionId,
    valueKind: row.kind,
    uniqueLookup: row.uniqueLookup,
  };
  if (
    row.kind === "short_text" ||
    row.kind === "slug" ||
    row.kind === "email" ||
    row.kind === "enum"
  ) {
    return { ...common, textValue: String(row.value) };
  }
  if (row.kind === "number") return { ...common, numberValue: Number(row.value) };
  if (row.kind === "decimal") return { ...common, decimalValue: String(row.value) };
  if (row.kind === "boolean") return { ...common, booleanValue: row.value === true };
  if (row.kind === "date") return { ...common, dateValue: String(row.value) };
  if (row.kind === "date_time") return { ...common, dateTimeValue: String(row.value) };
  return { ...common, referenceValue: String(row.value) };
}

/** Loads one stable keyset batch of exact current heads and immutable artifacts. */
async function loadBatch(
  database: ApplicationDb,
  batchSize: number,
  after: { readonly entryId: string; readonly localeId: string } | null,
): Promise<ReadonlyArray<HeadArtifact>> {
  return database
    .select({
      entryId: cmsEntryLocalePublicationHead.entryId,
      localeId: cmsEntryLocalePublicationHead.localeId,
      publicationId: cmsEntryLocalePublication.id,
      workspaceId: cmsEntryLocalePublication.workspaceId,
      projectId: cmsEntryLocalePublication.projectId,
      environmentId: cmsEntryLocalePublication.environmentId,
      collectionId: cmsEntryLocalePublication.collectionId,
      schemaRevisionId: cmsEntryLocalePublication.schemaRevisionId,
      headUpdatedAt: cmsEntryLocalePublicationHead.updatedAt,
      document: cmsEntryLocaleDeliverySnapshot.document,
    })
    .from(cmsEntryLocalePublicationHead)
    .innerJoin(
      cmsEntryLocalePublication,
      eq(cmsEntryLocalePublication.id, cmsEntryLocalePublicationHead.currentPublicationId),
    )
    .innerJoin(
      cmsEntryLocaleDeliverySnapshot,
      eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
    )
    .where(
      and(
        sql`${cmsEntryLocalePublicationHead.currentPublicationId} is not null`,
        after === null
          ? sql`true`
          : sql`(${cmsEntryLocalePublicationHead.entryId}, ${cmsEntryLocalePublicationHead.localeId}) > (${after.entryId}::uuid, ${after.localeId}::uuid)`,
      ),
    )
    .orderBy(cmsEntryLocalePublicationHead.entryId, cmsEntryLocalePublicationHead.localeId)
    .limit(batchSize);
}

/** Compiles a batch from historical schemas and current capability flags without writing. */
async function planBatch(
  database: ApplicationDb,
  heads: ReadonlyArray<HeadArtifact>,
): Promise<{ readonly plans: ReadonlyArray<HeadPlan>; readonly invalidCount: number }> {
  if (heads.length === 0) return { plans: [], invalidCount: 0 };
  const revisionIds = [...new Set(heads.map((head) => head.schemaRevisionId))];
  const collectionIds = [...new Set(heads.map((head) => head.collectionId))];
  const [fieldRows, capabilityRows] = await Promise.all([
    database
      .select()
      .from(cmsSchemaRevisionField)
      .where(inArray(cmsSchemaRevisionField.revisionId, revisionIds))
      .orderBy(
        cmsSchemaRevisionField.revisionId,
        cmsSchemaRevisionField.parentFieldId,
        cmsSchemaRevisionField.position,
        cmsSchemaRevisionField.fieldId,
      ),
    database
      .select({
        collectionId: cmsCollectionDeliveryField.collectionId,
        fieldId: cmsCollectionDeliveryField.fieldId,
        uniqueLookup: cmsCollectionDeliveryField.uniqueLookup,
      })
      .from(cmsCollectionDeliveryField)
      .where(inArray(cmsCollectionDeliveryField.collectionId, collectionIds)),
  ]);
  const fieldsByRevision = new Map<string, Array<typeof cmsSchemaRevisionField.$inferSelect>>();
  for (const row of fieldRows) {
    const rows = fieldsByRevision.get(row.revisionId) ?? [];
    rows.push(row);
    fieldsByRevision.set(row.revisionId, rows);
  }
  const capabilitiesByCollection = new Map<
    string,
    Array<{ readonly fieldId: string; readonly uniqueLookup: boolean }>
  >();
  for (const row of capabilityRows) {
    const rows = capabilitiesByCollection.get(row.collectionId) ?? [];
    rows.push({ fieldId: row.fieldId, uniqueLookup: row.uniqueLookup });
    capabilitiesByCollection.set(row.collectionId, rows);
  }

  const plans: Array<HeadPlan> = [];
  let invalidCount = 0;
  for (const head of heads) {
    const tree = reconstructFieldTree(
      (fieldsByRevision.get(head.schemaRevisionId) ?? []).map(fieldValue),
    );
    const data = Reflect.get(head.document, "data");
    if (!isRecord(data) || !tree.valid) {
      invalidCount += 1;
      continue;
    }
    const compiled = compileDeliveryProjections(
      tree.roots,
      data,
      capabilitiesByCollection.get(head.collectionId) ?? [],
    );
    if (!compiled.valid) {
      invalidCount += 1;
      continue;
    }
    plans.push({ head, projections: compiled.rows });
  }
  return { plans, invalidCount };
}

/** Applies only still-current plans under current-head locks; any high-water drift aborts the batch. */
async function applyBatch(
  transaction: ApplicationTransaction,
  plans: ReadonlyArray<HeadPlan>,
): Promise<void> {
  for (const plan of plans) {
    const [locked] = await transaction
      .select({ publicationId: cmsEntryLocalePublicationHead.currentPublicationId })
      .from(cmsEntryLocalePublicationHead)
      .where(
        and(
          eq(cmsEntryLocalePublicationHead.entryId, plan.head.entryId),
          eq(cmsEntryLocalePublicationHead.localeId, plan.head.localeId),
        ),
      )
      .for("update")
      .limit(1);
    if (locked?.publicationId !== plan.head.publicationId) {
      throw new Error("A current publication changed during Delivery backfill.");
    }
    await transaction
      .delete(cmsEntryLocaleDeliveryCurrentValue)
      .where(
        and(
          eq(cmsEntryLocaleDeliveryCurrentValue.entryId, plan.head.entryId),
          eq(cmsEntryLocaleDeliveryCurrentValue.localeId, plan.head.localeId),
        ),
      );
    if (plan.projections.length > 0) {
      await transaction
        .insert(cmsEntryLocaleDeliveryCurrentValue)
        .values(plan.projections.map((row) => projectionValue(plan.head, row)));
    }
    await transaction
      .insert(cmsCollectionLocaleDeliveryState)
      .values({
        collectionId: plan.head.collectionId,
        localeId: plan.head.localeId,
        workspaceId: plan.head.workspaceId,
        projectId: plan.head.projectId,
        environmentId: plan.head.environmentId,
        generation: 1n,
        lastChangedAt: plan.head.headUpdatedAt,
      })
      .onConflictDoNothing();
  }
}

/** Runs the bounded operator-controlled backfill; apply is refused unless the complete dry run is clean. */
export function runDeliveryBackfill(
  options: DeliveryBackfillOptions,
  database: ApplicationDb = db,
): Effect.Effect<DeliveryBackfillReport, DatabaseFailure> {
  return Effect.tryPromise({
    try: async () => {
      if (
        !Number.isInteger(options.batchSize) ||
        options.batchSize < 1 ||
        options.batchSize > 500
      ) {
        throw new Error("Delivery backfill batch size must be from 1 through 500.");
      }
      let after: { readonly entryId: string; readonly localeId: string } | null = null;
      let currentHeadCount = 0;
      let projectionRowCount = 0;
      let invalidSnapshotCount = 0;
      let appliedHeadCount = 0;
      const scopes = new Set<string>();
      const uniqueClaims = new Map<string, string>();
      let duplicateUniqueClaimCount = 0;

      while (true) {
        const heads = await loadBatch(database, options.batchSize, after);
        if (heads.length === 0) break;
        const planned = await planBatch(database, heads);
        currentHeadCount += heads.length;
        invalidSnapshotCount += planned.invalidCount;
        for (const plan of planned.plans) {
          projectionRowCount += plan.projections.length;
          scopes.add(`${plan.head.collectionId}:${plan.head.localeId}`);
          for (const row of plan.projections.filter((projection) => projection.uniqueLookup)) {
            const claim = JSON.stringify([
              plan.head.collectionId,
              plan.head.localeId,
              row.fieldId,
              row.kind,
              row.value,
            ]);
            const prior = uniqueClaims.get(claim);
            if (prior !== undefined && prior !== plan.head.entryId) duplicateUniqueClaimCount += 1;
            else uniqueClaims.set(claim, plan.head.entryId);
          }
        }
        const last = heads.at(-1);
        if (last === undefined) break;
        after = { entryId: last.entryId, localeId: last.localeId };
      }

      if (invalidSnapshotCount > 0 || duplicateUniqueClaimCount > 0) {
        if (options.mode === "apply") {
          throw new Error("Delivery backfill dry-run invariants are not clean.");
        }
      } else if (options.mode === "apply") {
        after = null;
        while (true) {
          const heads = await loadBatch(database, options.batchSize, after);
          if (heads.length === 0) break;
          const planned = await planBatch(database, heads);
          if (planned.invalidCount > 0) {
            throw new Error("Delivery backfill authority changed after the clean dry run.");
          }
          await database.transaction((transaction) => applyBatch(transaction, planned.plans));
          appliedHeadCount += planned.plans.length;
          const last = heads.at(-1);
          if (last === undefined) break;
          after = { entryId: last.entryId, localeId: last.localeId };
        }
      }

      return {
        mode: options.mode,
        currentHeadCount,
        projectionRowCount,
        collectionLocaleCount: scopes.size,
        duplicateUniqueClaimCount,
        invalidSnapshotCount,
        appliedHeadCount,
      };
    },
    catch: (cause) => databaseFailure("delivery.backfill", cause),
  });
}
