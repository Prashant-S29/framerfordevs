// Publishes presentation-only immutable schema revisions under exact collection authority.

import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, eq, isNull, sql } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionField,
  cmsCollectionSchemaHead,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import { auditEvent, environment, projectCapability } from "@framerfordevs/db/schema/platform";
import { cmsInvalidationRouteMapping } from "@framerfordevs/db/schema/webhooks";
import { Context, Effect, Layer, Schema } from "effect";

import { ApiErrorDetail } from "../contracts/api-response";
import type { AuthoringProjectScope, CmsActor } from "../contracts/authoring";
import {
  AuthoringPresentationRevision,
  AuthoringPresentationSnapshot,
  AuthoringPublishPresentationResult,
  type AuthoringPublishPresentationRequest,
} from "../contracts/authoring-presentation";
import {
  AuthoringCommandConflictFailure,
  AuthoringStaleSchemaFailure,
  CmsCapabilityRequiredFailure,
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
  PublishedSchemaRequiredFailure,
  ValidationFailure,
} from "../contracts/errors";
import { SchemaRevisionId } from "../contracts/schemas";
import {
  buildAuthoringPresentationCandidate,
  fingerprintAuthoringPresentation,
  publishedPresentation,
} from "../lib/authoring-presentation";
import { canonicalizeEntryValue } from "../lib/entry-values";
import { canonicalizeSchemaDocument } from "../lib/field-system-document";
import { flattenFieldTree } from "../lib/field-tree";
import { matchInvalidationMappings } from "../lib/invalidation-mappings";
import { cmsActorMatches, cmsActorReferences, cmsAuditActor } from "./cms-actor";
import {
  authorizeCmsActorProject,
  type ApplicationDb,
  type ApplicationExecutor,
} from "./project-access";
import { classifyCollectionSchemaChanges } from "./schema-engine";
import { decodePublishedSchemaRevisionSync, loadPublishedRevisionRows } from "./schema-repository";

export type AuthoringPresentationFailureStage =
  | "revision"
  | "active_presentation"
  | "head"
  | "audit"
  | "outbox";

interface RepositoryOptions {
  readonly database?: ApplicationDb;
  readonly testFailAfter?: AuthoringPresentationFailureStage;
}

const JsonObject = Schema.Record({ key: Schema.String, value: Schema.Unknown });

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  return Schema.decodeUnknownSync(JsonObject)(JSON.parse(JSON.stringify(value)));
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

async function authorizePresentation(
  executor: ApplicationExecutor,
  actor: CmsActor,
  scope: AuthoringProjectScope,
  actions: ReadonlyArray<"schema.read" | "schema.write" | "schema.publish">,
) {
  let workspaceId: string | null = null;
  for (const action of actions) {
    const authorization = await authorizeCmsActorProject(
      executor,
      actor,
      scope.projectId,
      scope.environmentId,
      action,
    );
    if (authorization.kind !== "allowed") return authorization;
    if (authorization.access.project.archivedAt !== null) return { kind: "forbidden" } as const;
    workspaceId = authorization.access.project.workspaceId;
  }
  if (workspaceId === null) return { kind: "not_found" } as const;
  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, scope.environmentId),
        eq(environment.projectId, scope.projectId),
        eq(environment.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!environmentRow) return { kind: "not_found" } as const;
  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, workspaceId),
        eq(projectCapability.projectId, scope.projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  return capability === undefined
    ? ({ kind: "cms_required" } as const)
    : ({ kind: "allowed", workspaceId } as const);
}

function presentationRevision(options: {
  readonly collectionId: string;
  readonly revision: typeof cmsSchemaRevision.$inferSelect;
  readonly contractHash: string;
}) {
  return Schema.decodeUnknownSync(AuthoringPresentationRevision)({
    collectionId: options.collectionId,
    revisionId: options.revision.id,
    previousRevisionId: options.revision.previousRevisionId,
    sequence: options.revision.sequence,
    schemaHash: options.revision.schemaHash,
    structureHash: options.revision.structureHash,
    contractHash: options.contractHash,
    publishedAt: options.revision.publishedAt.toISOString(),
  });
}

function publicationResult(options: {
  readonly commandId: AuthoringPublishPresentationRequest["commandId"];
  readonly replayed: boolean;
  readonly noOp: boolean;
  readonly rows: NonNullable<Awaited<ReturnType<typeof loadPublishedRevisionRows>>>;
}) {
  const published = decodePublishedSchemaRevisionSync(options.rows);
  return AuthoringPublishPresentationResult.make({
    commandId: options.commandId,
    replayed: options.replayed,
    noOp: options.noOp,
    revision: presentationRevision({
      collectionId: published.collectionId,
      revision: options.rows.revision,
      contractHash: published.contractHash,
    }),
    presentation: publishedPresentation(published),
  });
}

function fieldPresentationValue(field: ReturnType<typeof flattenFieldTree>[number]) {
  return {
    displayLabel: field.displayLabel,
    position: field.position,
    editor: field.editor,
    configuration: field.configuration,
  };
}

export function makeAuthoringPresentationRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;
  const failAfter = (stage: AuthoringPresentationFailureStage) => {
    if (options.testFailAfter === stage)
      throw new Error(`Injected Authoring presentation failure after ${stage}.`);
  };

  return {
    get: Effect.fn("AuthoringPresentationRepository.get")(function* (
      actor: CmsActor,
      scope: AuthoringProjectScope,
      collectionKey: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizePresentation(database, actor, scope, [
            "schema.read",
          ]);
          if (authorization.kind !== "allowed") return authorization;
          const [current] = await database
            .select({
              collectionId: cmsCollection.id,
              revisionId: cmsCollectionSchemaHead.currentPublishedRevisionId,
            })
            .from(cmsCollection)
            .innerJoin(
              cmsCollectionSchemaHead,
              and(
                eq(cmsCollectionSchemaHead.collectionId, cmsCollection.id),
                eq(cmsCollectionSchemaHead.workspaceId, cmsCollection.workspaceId),
                eq(cmsCollectionSchemaHead.projectId, cmsCollection.projectId),
                eq(cmsCollectionSchemaHead.environmentId, cmsCollection.environmentId),
              ),
            )
            .where(
              and(
                eq(cmsCollection.workspaceId, authorization.workspaceId),
                eq(cmsCollection.projectId, scope.projectId),
                eq(cmsCollection.environmentId, scope.environmentId),
                eq(cmsCollection.apiKey, collectionKey),
              ),
            )
            .limit(1);
          if (!current) return { kind: "not_found" } as const;
          if (current.revisionId === null) return { kind: "published_required" } as const;
          const rows = await loadPublishedRevisionRows(database, {
            collectionId: current.collectionId,
            projectId: scope.projectId,
            environmentId: scope.environmentId,
            revisionId: current.revisionId,
          });
          if (!rows) throw new Error("Current presentation revision is missing.");
          const published = decodePublishedSchemaRevisionSync(rows);
          return {
            kind: "success",
            value: AuthoringPresentationSnapshot.make({
              revision: presentationRevision({
                collectionId: current.collectionId,
                revision: rows.revision,
                contractHash: published.contractHash,
              }),
              presentation: publishedPresentation(published),
            }),
          } as const;
        },
        catch: (cause) => databaseFailure("authoring.presentation.get", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      return result.value;
    }),

    publish: Effect.fn("AuthoringPresentationRepository.publish")(function* (
      actor: CmsActor,
      scope: AuthoringProjectScope,
      collectionKey: string,
      request: AuthoringPublishPresentationRequest,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from project where id = ${scope.projectId} for update`,
            );
            const authorization = await authorizePresentation(transaction, actor, scope, [
              "schema.read",
              "schema.write",
              "schema.publish",
            ]);
            if (authorization.kind !== "allowed") return authorization;
            const [collection] = await transaction
              .select()
              .from(cmsCollection)
              .where(
                and(
                  eq(cmsCollection.workspaceId, authorization.workspaceId),
                  eq(cmsCollection.projectId, scope.projectId),
                  eq(cmsCollection.environmentId, scope.environmentId),
                  eq(cmsCollection.apiKey, collectionKey),
                ),
              )
              .limit(1);
            if (!collection) return { kind: "not_found" } as const;
            await transaction.execute(
              sql`select collection_id from cms_collection_schema_head where collection_id = ${collection.id} for update`,
            );
            const [head] = await transaction
              .select()
              .from(cmsCollectionSchemaHead)
              .where(
                and(
                  eq(cmsCollectionSchemaHead.collectionId, collection.id),
                  eq(cmsCollectionSchemaHead.workspaceId, authorization.workspaceId),
                  eq(cmsCollectionSchemaHead.projectId, scope.projectId),
                  eq(cmsCollectionSchemaHead.environmentId, scope.environmentId),
                ),
              )
              .limit(1);
            if (!head) return { kind: "not_found" } as const;
            if (head.currentPublishedRevisionId === null)
              return { kind: "published_required" } as const;

            const fingerprint = fingerprintAuthoringPresentation({
              actor,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              collectionKey,
              commandId: request.commandId,
              expectedRevisionId: request.expectedRevisionId,
              expectedSequence: request.expectedSequence,
              presentation: request.presentation,
            });
            const [existing] = await transaction
              .select()
              .from(cmsSchemaRevision)
              .where(
                and(
                  eq(cmsSchemaRevision.collectionId, collection.id),
                  eq(cmsSchemaRevision.commandId, request.commandId),
                ),
              )
              .limit(1);
            if (existing) {
              if (
                existing.commandFingerprint !== fingerprint ||
                !cmsActorMatches(actor, {
                  userId: existing.publishedByUserId,
                  credentialId: existing.publishedByCredentialId,
                })
              ) {
                return { kind: "command_conflict" } as const;
              }
              const rows = await loadPublishedRevisionRows(transaction, {
                collectionId: collection.id,
                projectId: scope.projectId,
                environmentId: scope.environmentId,
                revisionId: existing.id,
              });
              if (!rows) throw new Error("Presentation replay revision is missing.");
              return {
                kind: "success",
                value: publicationResult({
                  commandId: request.commandId,
                  replayed: true,
                  noOp: false,
                  rows,
                }),
              } as const;
            }
            if (
              head.currentPublishedRevisionId !== request.expectedRevisionId ||
              head.currentPublishedSequence !== request.expectedSequence
            ) {
              return { kind: "stale" } as const;
            }
            const currentRows = await loadPublishedRevisionRows(transaction, {
              collectionId: collection.id,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              revisionId: head.currentPublishedRevisionId,
            });
            if (!currentRows) throw new Error("Current presentation revision is missing.");
            const current = decodePublishedSchemaRevisionSync(currentRows);
            const candidate = buildAuthoringPresentationCandidate({
              current,
              presentation: request.presentation,
            });
            if (!candidate.valid) return { kind: "invalid", issues: candidate.issues } as const;
            if (candidate.noOp) {
              return {
                kind: "success",
                value: publicationResult({
                  commandId: request.commandId,
                  replayed: false,
                  noOp: true,
                  rows: currentRows,
                }),
              } as const;
            }
            const changes = classifyCollectionSchemaChanges(current, candidate.draft);
            if (changes.breakingCount > 0 || changes.potentiallyBreakingCount > 0) {
              throw new Error("Presentation candidate unexpectedly changed structural authority.");
            }
            const sequence = head.currentPublishedSequence + 1;
            const revisionId = SchemaRevisionId.make(randomUUID());
            const actorReferences = cmsActorReferences(actor);
            const [revision] = await transaction
              .insert(cmsSchemaRevision)
              .values({
                id: revisionId,
                workspaceId: authorization.workspaceId,
                projectId: scope.projectId,
                environmentId: scope.environmentId,
                collectionId: collection.id,
                sequence,
                previousRevisionId: current.id,
                collectionApiKey: current.collectionApiKey,
                collectionDisplayName: candidate.draft.collection.displayName,
                collectionDescription: candidate.draft.collection.description,
                formatVersion: 2,
                validationProfile: current.validationProfile,
                currencyRegistryProfile: current.currencyRegistryProfile,
                editorLayout: jsonObject(candidate.draft.editorLayout),
                schemaHash: candidate.schemaHash,
                structureHash: currentRows.revision.structureHash,
                commandId: request.commandId,
                commandFingerprint: fingerprint,
                nonBreakingChangeCount: changes.nonBreakingCount,
                potentiallyBreakingChangeCount: 0,
                breakingChangeCount: 0,
                publishedByUserId: actorReferences.userId,
                publishedByCredentialId: actorReferences.credentialId,
                publishedAt: now,
              })
              .returning();
            if (!revision) throw new Error("Presentation revision insert returned no row.");
            const flattened = flattenFieldTree(candidate.draft.fields);
            await transaction.insert(cmsSchemaRevisionField).values(
              flattened.map((field) => ({
                revisionId,
                fieldId: field.id,
                workspaceId: authorization.workspaceId,
                projectId: scope.projectId,
                environmentId: scope.environmentId,
                collectionId: collection.id,
                parentFieldId: field.parentFieldId,
                nodeRole: field.nodeRole,
                referenceCollectionId:
                  field.kind === "reference" ? field.configuration.targetCollectionId : null,
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
            failAfter("revision");

            const activeRows = await transaction
              .select()
              .from(cmsCollectionField)
              .where(
                and(
                  eq(cmsCollectionField.workspaceId, authorization.workspaceId),
                  eq(cmsCollectionField.projectId, scope.projectId),
                  eq(cmsCollectionField.environmentId, scope.environmentId),
                  eq(cmsCollectionField.collectionId, collection.id),
                  isNull(cmsCollectionField.removedAt),
                ),
              );
            const candidateById = new Map<string, (typeof flattened)[number]>(
              flattened.map((field) => [field.id, field]),
            );
            if (
              activeRows.length !== flattened.length ||
              activeRows.some((field) => !candidateById.has(field.id))
            ) {
              throw new Error("Active schema fields diverged from current published authority.");
            }
            const changedActiveRows = activeRows.filter((row) => {
              const field = candidateById.get(row.id);
              if (!field) return false;
              return (
                canonicalizeSchemaDocument({
                  displayLabel: row.displayLabel,
                  position: row.position,
                  editor: row.editorMetadata,
                  configuration: row.configuration,
                }) !== canonicalizeSchemaDocument(fieldPresentationValue(field))
              );
            });
            if (changedActiveRows.length > 0) {
              await transaction
                .insert(cmsCollectionField)
                .values(
                  changedActiveRows.map((row) => {
                    const field = candidateById.get(row.id);
                    if (!field) throw new Error("Candidate field is missing.");
                    return {
                      ...row,
                      displayLabel: field.displayLabel,
                      position: field.position,
                      editorMetadata: jsonObject(field.editor),
                      configuration: jsonObject(field.configuration),
                      changedByUserId: actorReferences.userId,
                      changedByCredentialId: actorReferences.credentialId,
                      updatedAt: now,
                    };
                  }),
                )
                .onConflictDoUpdate({
                  target: cmsCollectionField.id,
                  set: {
                    displayLabel: sql`excluded.display_label`,
                    position: sql`excluded.position`,
                    editorMetadata: sql`excluded.editor_metadata`,
                    configuration: sql`excluded.configuration`,
                    changedByUserId: actorReferences.userId,
                    changedByCredentialId: actorReferences.credentialId,
                    updatedAt: now,
                  },
                });
            }
            if (
              collection.displayName !== candidate.draft.collection.displayName ||
              collection.description !== candidate.draft.collection.description
            ) {
              await transaction
                .update(cmsCollection)
                .set({
                  displayName: candidate.draft.collection.displayName,
                  description: candidate.draft.collection.description,
                  version: sql`${cmsCollection.version} + 1`,
                  changedByUserId: actorReferences.userId,
                  changedByCredentialId: actorReferences.credentialId,
                  updatedAt: now,
                })
                .where(eq(cmsCollection.id, collection.id));
            }
            failAfter("active_presentation");

            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                draftVersion: sql`${cmsCollectionSchemaHead.draftVersion} + 1`,
                draftBaseRevisionId: revisionId,
                currentPublishedRevisionId: revisionId,
                currentPublishedSequence: sequence,
                currentPublishedStructureHash: currentRows.revision.structureHash,
                editorLayout: jsonObject(candidate.draft.editorLayout),
                changedByUserId: actorReferences.userId,
                changedByCredentialId: actorReferences.credentialId,
                updatedAt: now,
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            failAfter("head");

            await transaction.insert(auditEvent).values({
              workspaceId: authorization.workspaceId,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              ...cmsAuditActor(actor),
              action: "cms.schema.presentation.published",
              resourceType: "cms_collection",
              resourceId: collection.id,
              requestId,
            });
            failAfter("audit");

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
                  eq(cmsInvalidationRouteMapping.workspaceId, authorization.workspaceId),
                  eq(cmsInvalidationRouteMapping.projectId, scope.projectId),
                  eq(cmsInvalidationRouteMapping.environmentId, scope.environmentId),
                  eq(cmsInvalidationRouteMapping.collectionId, collection.id),
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
                changes.items.flatMap((change) =>
                  change.fieldId === null ? [] : [change.fieldId],
                ),
              ),
            ].sort();
            const payload = {
              version: 1,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              collectionId: collection.id,
              schemaRevisionId: revisionId,
              sequence,
              schemaHash: candidate.schemaHash,
              contractHash: candidate.contractHash,
              changedFieldIds,
              invalidationTags: [
                `project:${scope.projectId}`,
                `environment:${scope.environmentId}`,
                `collection:${collection.id}`,
                ...changedFieldIds.map((fieldId) => `field:${fieldId}`),
              ],
              semanticTags: invalidation.semanticTags,
              routes: invalidation.routes,
            };
            if (Buffer.byteLength(canonicalizeEntryValue(payload), "utf8") > 131_072) {
              throw new Error("Presentation publication event exceeded the fixed limit.");
            }
            await transaction.insert(outboxEvent).values({
              workspaceId: authorization.workspaceId,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              eventType: "cms.schema.published",
              subjectType: "cms.collection",
              subjectId: collection.id,
              schemaRevisionId: revisionId,
              aggregateSequence: sequence,
              payload,
              occurredAt: now,
              availableAt: now,
            });
            failAfter("outbox");

            const rows = await loadPublishedRevisionRows(transaction, {
              collectionId: collection.id,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              revisionId,
            });
            if (!rows) throw new Error("Published presentation revision is missing.");
            return {
              kind: "success",
              value: publicationResult({
                commandId: request.commandId,
                replayed: false,
                noOp: false,
                rows,
              }),
            } as const;
          }),
        catch: (cause) => databaseFailure("authoring.presentation.publish", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      if (result.kind === "command_conflict") return yield* AuthoringCommandConflictFailure.make();
      if (result.kind === "stale") return yield* AuthoringStaleSchemaFailure.make();
      if (result.kind === "invalid") {
        return yield* ValidationFailure.make({
          details: result.issues.map((current) =>
            ApiErrorDetail.make({
              path: current.path,
              code: current.code,
              message: current.message,
            }),
          ),
        });
      }
      return result.value;
    }),
  };
}

export class AuthoringPresentationRepository extends Context.Tag("AuthoringPresentationRepository")<
  AuthoringPresentationRepository,
  ReturnType<typeof makeAuthoringPresentationRepository>
>() {}

export const AuthoringPresentationRepositoryLive = Layer.succeed(
  AuthoringPresentationRepository,
  makeAuthoringPresentationRepository(),
);
