import { db } from "@framerfordevs/db";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionField,
  cmsCollectionSchemaHead,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import { environment, projectCapability, auditEvent } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import type { ProjectPermissionAction } from "../contracts/access";
import {
  CmsCapabilityRequiredFailure,
  CollectionKeyConflictFailure,
  ConflictFailure,
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  NotFoundFailure,
  SchemaChangeAcknowledgementRequiredFailure,
  SchemaInvalidFailure,
  VersionConflictFailure,
} from "../contracts/errors";
import { decodeCollectionCursor, encodeCollectionCursor } from "../contracts/schema-cursor";
import {
  CmsCollection,
  CmsCollectionPage,
  CollectionDraftSchema,
  CollectionFieldDefinition,
  CollectionSchemaValidation,
  PublishedSchemaField,
  PublishedSchemaRevision,
  SchemaHash,
  type CreateCollectionFieldInput,
  type CreateCollectionInput,
  type GetCollectionDraftInput,
  type GetCollectionInput,
  type GetLatestPublishedSchemaInput,
  type GetPublishedSchemaRevisionInput,
  type ListCollectionsInput,
  type PublishCollectionSchemaInput,
  type RemoveCollectionFieldInput,
  type ReorderCollectionFieldsInput,
  type UpdateCollectionFieldInput,
  type UpdateCollectionInput,
  type ValidateCollectionSchemaInput,
} from "../contracts/schemas";
import type { AuthUserId } from "../contracts/platform";
import {
  classifyCollectionSchemaChanges,
  fingerprintSchemaPublication,
  hashCollectionDraft,
  requiredAcknowledgementChanges,
  validateCollectionDraft,
} from "./schema-engine";
import {
  type ApplicationDb,
  type ApplicationExecutor,
  authorizeUserProject,
} from "./project-access";

function outcome<K extends string>(kind: K): { readonly kind: K } {
  return { kind };
}

function outcomeWith<K extends string, A extends object>(
  kind: K,
  value: A,
): { readonly kind: K } & A {
  return { kind, ...value };
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function hasConstraint(cause: unknown, constraint: string, depth = 0): boolean {
  if (depth > 3 || typeof cause !== "object" || cause === null) return false;
  if (
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === constraint
  ) {
    return true;
  }
  return "cause" in cause && hasConstraint(cause.cause, constraint, depth + 1);
}

function decodeDatabaseValue<A, I>(
  operation: string,
  schema: Schema.Schema<A, I, never>,
  value: unknown,
) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause) => databaseFailure(`${operation}.decode`, cause)),
  );
}

function toIso(value: Date): string {
  return value.toISOString();
}

interface CollectionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly apiKey: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly version: number;
  readonly draftVersion: number;
  readonly draftBaseRevisionId: string | null;
  readonly currentPublishedRevisionId: string | null;
  readonly currentPublishedSequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function collectionValue(row: CollectionRow) {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

const collectionProjection = {
  id: cmsCollection.id,
  workspaceId: cmsCollection.workspaceId,
  projectId: cmsCollection.projectId,
  environmentId: cmsCollection.environmentId,
  apiKey: cmsCollection.apiKey,
  displayName: cmsCollection.displayName,
  description: cmsCollection.description,
  version: cmsCollection.version,
  draftVersion: cmsCollectionSchemaHead.draftVersion,
  draftBaseRevisionId: cmsCollectionSchemaHead.draftBaseRevisionId,
  currentPublishedRevisionId: cmsCollectionSchemaHead.currentPublishedRevisionId,
  currentPublishedSequence: cmsCollectionSchemaHead.currentPublishedSequence,
  createdAt: cmsCollection.createdAt,
  updatedAt: cmsCollection.updatedAt,
};

function makeAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceId: string;
  readonly resourceType?: string;
  readonly requestId: string;
}) {
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    actorType: "user",
    actorId: options.actorId,
    action: options.action,
    resourceType: options.resourceType ?? "cms_collection",
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

async function lockProjectShared(executor: ApplicationExecutor, projectId: string) {
  await executor.execute(sql`select id from project where id = ${projectId} for share`);
}

async function authorizeEnvironment(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  projectId: string,
  environmentId: string,
  action: ProjectPermissionAction,
) {
  const authorization = await authorizeUserProject(executor, actorId, projectId, action);
  if (authorization.kind !== "allowed") return authorization;

  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, environmentId),
        eq(environment.projectId, projectId),
        eq(environment.workspaceId, authorization.access.project.workspaceId),
      ),
    )
    .limit(1);
  if (!environmentRow) return outcome("not_found");

  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, authorization.access.project.workspaceId),
        eq(projectCapability.projectId, projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  if (!capability) return outcome("cms_required");
  return authorization;
}

async function selectCollection(
  executor: ApplicationExecutor,
  input: {
    readonly collectionId: string;
    readonly projectId: string;
    readonly environmentId: string;
  },
) {
  const [row] = await executor
    .select(collectionProjection)
    .from(cmsCollection)
    .innerJoin(
      cmsCollectionSchemaHead,
      and(
        eq(cmsCollectionSchemaHead.collectionId, cmsCollection.id),
        eq(cmsCollectionSchemaHead.environmentId, cmsCollection.environmentId),
        eq(cmsCollectionSchemaHead.projectId, cmsCollection.projectId),
        eq(cmsCollectionSchemaHead.workspaceId, cmsCollection.workspaceId),
      ),
    )
    .where(
      and(
        eq(cmsCollection.id, input.collectionId),
        eq(cmsCollection.projectId, input.projectId),
        eq(cmsCollection.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  return row;
}

function fieldValue(row: typeof cmsCollectionField.$inferSelect) {
  return {
    id: row.id,
    apiKey: row.apiKey,
    displayLabel: row.displayLabel,
    kind: row.kind,
    required: row.required,
    localization: row.localization,
    deprecated: row.deprecated,
    position: row.position,
    configuration: row.configuration,
  };
}

async function loadActiveFieldRows(executor: ApplicationExecutor, collectionId: string) {
  return executor
    .select()
    .from(cmsCollectionField)
    .where(
      and(eq(cmsCollectionField.collectionId, collectionId), isNull(cmsCollectionField.removedAt)),
    )
    .orderBy(cmsCollectionField.position, cmsCollectionField.id);
}

function decodeDraftSync(
  collection: CollectionRow,
  rows: ReadonlyArray<typeof cmsCollectionField.$inferSelect>,
) {
  return CollectionDraftSchema.make({
    collection: Schema.decodeUnknownSync(CmsCollection)(collectionValue(collection)),
    fields: rows.map((row) => Schema.decodeUnknownSync(CollectionFieldDefinition)(fieldValue(row))),
  });
}

async function loadPublishedRevisionRows(
  executor: ApplicationExecutor,
  input: {
    readonly collectionId: string;
    readonly projectId: string;
    readonly environmentId: string;
    readonly revisionId: string;
  },
) {
  const [revision] = await executor
    .select()
    .from(cmsSchemaRevision)
    .where(
      and(
        eq(cmsSchemaRevision.id, input.revisionId),
        eq(cmsSchemaRevision.collectionId, input.collectionId),
        eq(cmsSchemaRevision.projectId, input.projectId),
        eq(cmsSchemaRevision.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!revision) return null;
  const fields = await executor
    .select()
    .from(cmsSchemaRevisionField)
    .where(eq(cmsSchemaRevisionField.revisionId, revision.id))
    .orderBy(cmsSchemaRevisionField.position, cmsSchemaRevisionField.fieldId);
  return { revision, fields };
}

function decodePublishedSync(
  rows: NonNullable<Awaited<ReturnType<typeof loadPublishedRevisionRows>>>,
) {
  const { revision, fields } = rows;
  return Schema.decodeUnknownSync(PublishedSchemaRevision)({
    id: revision.id,
    workspaceId: revision.workspaceId,
    projectId: revision.projectId,
    environmentId: revision.environmentId,
    collectionId: revision.collectionId,
    sequence: revision.sequence,
    previousRevisionId: revision.previousRevisionId,
    collectionApiKey: revision.collectionApiKey,
    collectionDisplayName: revision.collectionDisplayName,
    collectionDescription: revision.collectionDescription,
    schemaHash: revision.schemaHash,
    commandId: revision.commandId,
    nonBreakingChangeCount: revision.nonBreakingChangeCount,
    potentiallyBreakingChangeCount: revision.potentiallyBreakingChangeCount,
    breakingChangeCount: revision.breakingChangeCount,
    publishedByUserId: revision.publishedByUserId,
    publishedAt: toIso(revision.publishedAt),
    fields: fields.map((field) =>
      Schema.decodeUnknownSync(PublishedSchemaField)({
        id: field.fieldId,
        apiKey: field.apiKey,
        displayLabel: field.displayLabel,
        kind: field.kind,
        required: field.required,
        localization: field.localization,
        deprecated: field.deprecated,
        position: field.position,
        configuration: field.configuration,
      }),
    ),
  });
}

async function lockCollection(executor: ApplicationExecutor, collectionId: string) {
  await executor.execute(sql`select id from cms_collection where id = ${collectionId} for update`);
}

async function lockActiveFields(executor: ApplicationExecutor, collectionId: string) {
  await executor.execute(
    sql`select id from cms_collection_field where collection_id = ${collectionId} and removed_at is null order by id for update`,
  );
}

async function bumpDraft(
  executor: ApplicationExecutor,
  collectionId: string,
  actorId: AuthUserId,
  now: Date,
) {
  await executor
    .update(cmsCollectionSchemaHead)
    .set({
      changedByUserId: actorId,
      draftVersion: sql`${cmsCollectionSchemaHead.draftVersion} + 1`,
      updatedAt: now,
    })
    .where(eq(cmsCollectionSchemaHead.collectionId, collectionId));
}

function exactAcknowledgements(
  changes: ReturnType<typeof classifyCollectionSchemaChanges>,
  acknowledged: ReadonlyArray<string>,
) {
  const required = requiredAcknowledgementChanges(changes);
  const values = new Set(acknowledged);
  return required.length === values.size && required.every((change) => values.has(change.changeId));
}

type PublicationStep = "revision" | "snapshots" | "head" | "audit" | "outbox";

interface RepositoryOptions {
  readonly database?: ApplicationDb;
  readonly testFailPublicationAfter?: PublicationStep;
}

export function makeSchemaRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;
  const failPublicationAfter = (step: PublicationStep) => {
    if (options.testFailPublicationAfter === step) {
      throw new Error(`Injected schema publication failure after ${step}.`);
    }
  };

  return {
    listCollections: Effect.fn("SchemaRepository.listCollections")(function* (
      actorId: AuthUserId,
      input: ListCollectionsInput,
    ) {
      const cursor =
        input.cursor === null
          ? null
          : yield* decodeCollectionCursor(input.cursor, input.environmentId);
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind !== "allowed")
            return outcomeWith(authorization.kind, { rows: [] });

          const cursorCondition =
            cursor === null
              ? undefined
              : or(
                  lt(cmsCollection.createdAt, new Date(cursor.createdAt)),
                  and(
                    eq(cmsCollection.createdAt, new Date(cursor.createdAt)),
                    lt(cmsCollection.id, cursor.collectionId),
                  ),
                );
          const rows = await database
            .select(collectionProjection)
            .from(cmsCollection)
            .innerJoin(
              cmsCollectionSchemaHead,
              eq(cmsCollectionSchemaHead.collectionId, cmsCollection.id),
            )
            .where(
              and(
                eq(cmsCollection.workspaceId, authorization.access.project.workspaceId),
                eq(cmsCollection.projectId, input.projectId),
                eq(cmsCollection.environmentId, input.environmentId),
                cursorCondition,
              ),
            )
            .orderBy(desc(cmsCollection.createdAt), desc(cmsCollection.id))
            .limit(input.limit + 1);
          return outcomeWith("success", { rows });
        },
        catch: (cause) => databaseFailure("schema.collection.list", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();

      const hasMore = result.rows.length > input.limit;
      const pageRows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
      const items = yield* Effect.forEach(pageRows, (row) =>
        decodeDatabaseValue("schema.collection.list", CmsCollection, collectionValue(row)),
      );
      const last = pageRows.at(-1);
      const lastItem = items.at(-1);
      const nextCursor =
        hasMore && last && lastItem
          ? yield* encodeCollectionCursor({
              environmentId: input.environmentId,
              createdAt: toIso(last.createdAt),
              collectionId: lastItem.id,
            })
          : null;
      return CmsCollectionPage.make({ items, nextCursor });
    }),

    createCollection: Effect.fn("SchemaRepository.createCollection")(function* (
      actorId: AuthUserId,
      input: CreateCollectionInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");

            const [collection] = await transaction
              .insert(cmsCollection)
              .values({
                workspaceId: authorization.access.project.workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                apiKey: input.apiKey,
                displayName: input.displayName,
                description: input.description,
                createdByUserId: actorId,
                changedByUserId: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!collection) throw new Error("Collection insert returned no row.");
            await transaction.insert(cmsCollectionSchemaHead).values({
              collectionId: collection.id,
              workspaceId: collection.workspaceId,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
              changedByUserId: actorId,
              updatedAt: now,
            });
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.collection.created",
                resourceId: collection.id,
                requestId,
              }),
            );
            const row = await selectCollection(transaction, {
              collectionId: collection.id,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
            });
            if (!row) throw new Error("Created collection could not be loaded.");
            return outcomeWith("success", { row });
          }),
        catch: (cause) =>
          hasConstraint(cause, "cms_collection_environment_key_unique")
            ? CollectionKeyConflictFailure.make()
            : databaseFailure("schema.collection.create", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      return yield* decodeDatabaseValue(
        "schema.collection.create",
        CmsCollection,
        collectionValue(result.row),
      );
    }),

    getCollection: Effect.fn("SchemaRepository.getCollection")(function* (
      actorId: AuthUserId,
      input: GetCollectionInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind === "not_found") {
            return outcomeWith("not_found", { row: null });
          }
          if (authorization.kind === "forbidden") {
            return outcomeWith("forbidden", { row: null });
          }
          if (authorization.kind === "cms_required") {
            return outcomeWith("cms_required", { row: null });
          }
          const row = await selectCollection(database, input);
          if (!row || row.workspaceId !== authorization.access.project.workspaceId) {
            return outcomeWith("not_found", { row: null });
          }
          return outcomeWith("success", { row });
        },
        catch: (cause) => databaseFailure("schema.collection.get", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return yield* decodeDatabaseValue(
        "schema.collection.get",
        CmsCollection,
        collectionValue(result.row),
      );
    }),

    updateCollection: Effect.fn("SchemaRepository.updateCollection")(function* (
      actorId: AuthUserId,
      input: UpdateCollectionInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await transaction.execute(
              sql`select id from cms_collection where id = ${input.collectionId} for update`,
            );
            const current = await selectCollection(transaction, input);
            if (!current || current.workspaceId !== authorization.access.project.workspaceId) {
              return outcome("not_found");
            }
            if (current.version !== input.version || current.draftVersion !== input.draftVersion) {
              return outcome("version_conflict");
            }
            if (
              current.displayName === input.displayName &&
              current.description === input.description
            ) {
              return outcomeWith("success", { row: current });
            }
            await transaction
              .update(cmsCollection)
              .set({
                displayName: input.displayName,
                description: input.description,
                changedByUserId: actorId,
                version: sql`${cmsCollection.version} + 1`,
                updatedAt: now,
              })
              .where(eq(cmsCollection.id, input.collectionId));
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                changedByUserId: actorId,
                draftVersion: sql`${cmsCollectionSchemaHead.draftVersion} + 1`,
                updatedAt: now,
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, input.collectionId));
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.workspaceId,
                projectId: current.projectId,
                environmentId: current.environmentId,
                actorId,
                action: "cms.collection.updated",
                resourceId: current.id,
                requestId,
              }),
            );
            const row = await selectCollection(transaction, input);
            if (!row) throw new Error("Updated collection could not be loaded.");
            return outcomeWith("success", { row });
          }),
        catch: (cause) => databaseFailure("schema.collection.update", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      return yield* decodeDatabaseValue(
        "schema.collection.update",
        CmsCollection,
        collectionValue(result.row),
      );
    }),

    getDraft: Effect.fn("SchemaRepository.getDraft")(function* (
      actorId: AuthUserId,
      input: GetCollectionDraftInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.write",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId) {
            return outcome("not_found");
          }
          return outcomeWith("success", {
            draft: decodeDraftSync(
              collection,
              await loadActiveFieldRows(database, input.collectionId),
            ),
          });
        },
        catch: (cause) => databaseFailure("schema.draft.get", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.draft;
    }),

    createField: Effect.fn("SchemaRepository.createField")(function* (
      actorId: AuthUserId,
      input: CreateCollectionFieldInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            if (rows.length >= 100) return outcome("conflict");
            const [created] = await transaction
              .insert(cmsCollectionField)
              .values({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                collectionId: collection.id,
                apiKey: input.apiKey,
                displayLabel: input.displayLabel,
                kind: input.kind,
                required: input.required,
                localization: input.localization,
                deprecated: input.deprecated,
                position: rows.length,
                configuration: input.configuration,
                createdByUserId: actorId,
                changedByUserId: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!created) throw new Error("Field insert returned no row.");
            const nextRows = [...rows, created];
            const draft = decodeDraftSync(collection, nextRows);
            if (!validateCollectionDraft(draft, "draft").valid) return outcome("conflict");
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.field.created",
                resourceType: "cms_collection_field",
                resourceId: created.id,
                requestId,
              }),
            );
            const current = await selectCollection(transaction, input);
            if (!current) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", { draft: decodeDraftSync(current, nextRows) });
          }),
        catch: (cause) =>
          hasConstraint(cause, "cms_field_collection_active_key_unique")
            ? ConflictFailure.make()
            : databaseFailure("schema.field.create", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      return result.draft;
    }),

    updateField: Effect.fn("SchemaRepository.updateField")(function* (
      actorId: AuthUserId,
      input: UpdateCollectionFieldInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            const current = rows.find((row) => row.id === input.fieldId);
            if (!current) return outcome("not_found");
            const unchanged =
              current.apiKey === input.apiKey &&
              current.displayLabel === input.displayLabel &&
              current.kind === input.kind &&
              current.required === input.required &&
              current.localization === input.localization &&
              current.deprecated === input.deprecated &&
              JSON.stringify(current.configuration) === JSON.stringify(input.configuration);
            if (unchanged)
              return outcomeWith("success", { draft: decodeDraftSync(collection, rows) });
            await transaction
              .update(cmsCollectionField)
              .set({
                apiKey: input.apiKey,
                displayLabel: input.displayLabel,
                kind: input.kind,
                required: input.required,
                localization: input.localization,
                deprecated: input.deprecated,
                configuration: input.configuration,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(
                and(
                  eq(cmsCollectionField.id, input.fieldId),
                  eq(cmsCollectionField.collectionId, input.collectionId),
                  isNull(cmsCollectionField.removedAt),
                ),
              );
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.field.updated",
                resourceType: "cms_collection_field",
                resourceId: current.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                nextCollection,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) =>
          hasConstraint(cause, "cms_field_collection_active_key_unique")
            ? ConflictFailure.make()
            : databaseFailure("schema.field.update", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "field" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      return result.draft;
    }),

    removeField: Effect.fn("SchemaRepository.removeField")(function* (
      actorId: AuthUserId,
      input: RemoveCollectionFieldInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            const removed = rows.find((row) => row.id === input.fieldId);
            if (!removed) return outcome("not_found");
            const affected = rows.filter(
              (row) =>
                row.position !== null &&
                removed.position !== null &&
                row.position > removed.position,
            );
            if (affected.length > 0) {
              await transaction
                .update(cmsCollectionField)
                .set({ removedAt: now, removedByUserId: actorId, position: null })
                .where(
                  inArray(
                    cmsCollectionField.id,
                    affected.map((row) => row.id),
                  ),
                );
            }
            await transaction
              .update(cmsCollectionField)
              .set({
                removedAt: now,
                removedByUserId: actorId,
                position: null,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(eq(cmsCollectionField.id, removed.id));
            for (const row of affected) {
              await transaction
                .update(cmsCollectionField)
                .set({ removedAt: null, removedByUserId: null, position: (row.position ?? 0) - 1 })
                .where(eq(cmsCollectionField.id, row.id));
            }
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.field.removed",
                resourceType: "cms_collection_field",
                resourceId: removed.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                nextCollection,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) => databaseFailure("schema.field.remove", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "field" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      return result.draft;
    }),

    reorderFields: Effect.fn("SchemaRepository.reorderFields")(function* (
      actorId: AuthUserId,
      input: ReorderCollectionFieldsInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            const currentIds = rows.map((row) => row.id);
            if (
              input.fieldIds.length !== currentIds.length ||
              input.fieldIds.some((id) => !currentIds.includes(id))
            )
              return outcome("conflict");
            if (input.fieldIds.every((id, index) => currentIds[index] === id))
              return outcomeWith("success", { draft: decodeDraftSync(collection, rows) });
            await transaction
              .update(cmsCollectionField)
              .set({ removedAt: now, removedByUserId: actorId, position: null })
              .where(inArray(cmsCollectionField.id, currentIds));
            for (const [position, fieldId] of input.fieldIds.entries()) {
              await transaction
                .update(cmsCollectionField)
                .set({
                  removedAt: null,
                  removedByUserId: null,
                  position,
                  changedByUserId: actorId,
                  updatedAt: now,
                })
                .where(eq(cmsCollectionField.id, fieldId));
            }
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.fields.reordered",
                resourceId: collection.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                nextCollection,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) => databaseFailure("schema.field.reorder", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      return result.draft;
    }),

    getPublishedRevision: Effect.fn("SchemaRepository.getPublishedRevision")(function* (
      actorId: AuthUserId,
      input: GetPublishedSchemaRevisionInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
            return outcome("not_found");
          const rows = await loadPublishedRevisionRows(database, input);
          if (!rows || rows.revision.workspaceId !== collection.workspaceId)
            return outcome("not_found");
          return outcomeWith("success", { revision: decodePublishedSync(rows) });
        },
        catch: (cause) => databaseFailure("schema.published.get_revision", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "schema_revision" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.revision;
    }),

    getLatestPublished: Effect.fn("SchemaRepository.getLatestPublished")(function* (
      actorId: AuthUserId,
      input: GetLatestPublishedSchemaInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (
            !collection ||
            collection.workspaceId !== authorization.access.project.workspaceId ||
            collection.currentPublishedRevisionId === null
          )
            return outcome("not_found");
          const rows = await loadPublishedRevisionRows(database, {
            ...input,
            revisionId: collection.currentPublishedRevisionId,
          });
          if (!rows) return outcome("not_found");
          return outcomeWith("success", { revision: decodePublishedSync(rows) });
        },
        catch: (cause) => databaseFailure("schema.published.get_latest", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "schema_revision" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.revision;
    }),

    validateSchema: Effect.fn("SchemaRepository.validateSchema")(function* (
      actorId: AuthUserId,
      input: ValidateCollectionSchemaInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.write",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
            return outcome("not_found");
          const draft = decodeDraftSync(
            collection,
            await loadActiveFieldRows(database, input.collectionId),
          );
          const publishedRows =
            collection.currentPublishedRevisionId === null
              ? null
              : await loadPublishedRevisionRows(database, {
                  ...input,
                  revisionId: collection.currentPublishedRevisionId,
                });
          return outcomeWith("success", {
            draft,
            published: publishedRows === null ? null : decodePublishedSync(publishedRows),
          });
        },
        catch: (cause) => databaseFailure("schema.validate", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      const validation = validateCollectionDraft(result.draft, "publication");
      return CollectionSchemaValidation.make({
        valid: validation.valid,
        issues: validation.issues,
        schemaHash: validation.valid ? hashCollectionDraft(result.draft) : null,
        changes: classifyCollectionSchemaChanges(result.published, result.draft),
      });
    }),

    publishSchema: Effect.fn("SchemaRepository.publishSchema")(function* (
      actorId: AuthUserId,
      input: PublishCollectionSchemaInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.publish",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");

            const [existing] = await transaction
              .select()
              .from(cmsSchemaRevision)
              .where(
                and(
                  eq(cmsSchemaRevision.collectionId, input.collectionId),
                  eq(cmsSchemaRevision.commandId, input.commandId),
                ),
              )
              .limit(1);
            if (existing) {
              const expected = fingerprintSchemaPublication(
                input,
                Schema.decodeUnknownSync(SchemaHash)(existing.schemaHash),
              );
              if (existing.commandFingerprint !== expected) return outcome("conflict");
              const rows = await loadPublishedRevisionRows(transaction, {
                ...input,
                revisionId: existing.id,
              });
              if (!rows) throw new Error("Published command revision could not be loaded.");
              return outcomeWith("success", { revision: decodePublishedSync(rows) });
            }
            if (
              collection.draftVersion !== input.draftVersion ||
              collection.currentPublishedRevisionId !== input.expectedPublishedRevisionId
            )
              return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const draft = decodeDraftSync(
              collection,
              await loadActiveFieldRows(transaction, input.collectionId),
            );
            const validation = validateCollectionDraft(draft, "publication");
            if (!validation.valid)
              return outcomeWith("schema_invalid", { issues: validation.issues });
            const schemaHash = hashCollectionDraft(draft);
            const publishedRows =
              collection.currentPublishedRevisionId === null
                ? null
                : await loadPublishedRevisionRows(transaction, {
                    ...input,
                    revisionId: collection.currentPublishedRevisionId,
                  });
            const published = publishedRows === null ? null : decodePublishedSync(publishedRows);
            if (published !== null && published.schemaHash === schemaHash)
              return outcomeWith("success", { revision: published });
            const changes = classifyCollectionSchemaChanges(published, draft);
            if (!exactAcknowledgements(changes, input.acknowledgedChangeIds))
              return outcomeWith("acknowledgement_required", {
                changes: requiredAcknowledgementChanges(changes),
              });
            const sequence = collection.currentPublishedSequence + 1;
            const [revisionRow] = await transaction
              .insert(cmsSchemaRevision)
              .values({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                collectionId: collection.id,
                sequence,
                previousRevisionId: collection.currentPublishedRevisionId,
                collectionApiKey: collection.apiKey,
                collectionDisplayName: collection.displayName,
                collectionDescription: collection.description,
                schemaHash,
                commandId: input.commandId,
                commandFingerprint: fingerprintSchemaPublication(input, schemaHash),
                nonBreakingChangeCount: changes.nonBreakingCount,
                potentiallyBreakingChangeCount: changes.potentiallyBreakingCount,
                breakingChangeCount: changes.breakingCount,
                publishedByUserId: actorId,
                publishedAt: now,
              })
              .returning();
            if (!revisionRow) throw new Error("Schema revision insert returned no row.");
            failPublicationAfter("revision");
            if (draft.fields.length > 0) {
              await transaction.insert(cmsSchemaRevisionField).values(
                draft.fields.map((field) => ({
                  revisionId: revisionRow.id,
                  fieldId: field.id,
                  workspaceId: collection.workspaceId,
                  projectId: collection.projectId,
                  environmentId: collection.environmentId,
                  collectionId: collection.id,
                  apiKey: field.apiKey,
                  displayLabel: field.displayLabel,
                  kind: field.kind,
                  required: field.required,
                  localization: field.localization,
                  deprecated: field.deprecated,
                  position: field.position,
                  configuration: field.configuration,
                })),
              );
            }
            failPublicationAfter("snapshots");
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                draftBaseRevisionId: revisionRow.id,
                currentPublishedRevisionId: revisionRow.id,
                currentPublishedSequence: sequence,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            failPublicationAfter("head");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.published",
                resourceId: collection.id,
                requestId,
              }),
            );
            failPublicationAfter("audit");
            const changedFieldIds = [
              ...new Set(
                changes.items.flatMap((change) =>
                  change.fieldId === null ? [] : [change.fieldId],
                ),
              ),
            ].sort();
            await transaction.insert(outboxEvent).values({
              workspaceId: collection.workspaceId,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
              eventType: "cms.schema.published",
              subjectType: "cms.collection",
              subjectId: collection.id,
              schemaRevisionId: revisionRow.id,
              aggregateSequence: sequence,
              payload: {
                version: 1,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                collectionId: collection.id,
                schemaRevisionId: revisionRow.id,
                sequence,
                schemaHash,
                changedFieldIds,
                invalidationTags: [
                  `project:${collection.projectId}`,
                  `environment:${collection.environmentId}`,
                  `collection:${collection.id}`,
                  ...changedFieldIds.map((fieldId) => `field:${fieldId}`),
                ],
              },
              occurredAt: now,
              availableAt: now,
            });
            failPublicationAfter("outbox");
            const rows = await loadPublishedRevisionRows(transaction, {
              ...input,
              revisionId: revisionRow.id,
            });
            if (!rows) throw new Error("Published revision could not be loaded.");
            return outcomeWith("success", { revision: decodePublishedSync(rows) });
          }),
        catch: (cause) => databaseFailure("schema.publish", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      if (result.kind === "schema_invalid")
        return yield* SchemaInvalidFailure.make({ issues: result.issues });
      if (result.kind === "acknowledgement_required")
        return yield* SchemaChangeAcknowledgementRequiredFailure.make({
          requiredChanges: result.changes,
        });
      return result.revision;
    }),
  };
}

export class SchemaRepository extends Context.Tag("SchemaRepository")<
  SchemaRepository,
  ReturnType<typeof makeSchemaRepository>
>() {}

export const SchemaRepositoryLive = Layer.succeed(SchemaRepository, makeSchemaRepository());
