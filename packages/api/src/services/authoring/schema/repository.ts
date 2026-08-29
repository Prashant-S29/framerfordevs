import { db } from "@framerfordevs/db";
import { and, eq, sql } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionField,
  cmsCollectionSchemaHead,
  cmsEnumOptionSourceIdentity,
} from "@framerfordevs/db/schema/cms";
import { environment, projectCapability } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  AuthoringSchemaAuthority,
  CollectionSourceKey,
  EnumOptionSourceKey,
  FieldSourceKey,
  StructureHash,
  type CmsActor,
} from "../../../contracts/authoring";
import {
  AppliedCollectionRevision,
  AppliedCollectionSourceIdentity,
  AppliedEnumOptionSourceIdentity,
  AppliedFieldSourceIdentity,
  type AuthoringSchemaApplyInput,
  type AuthoringSchemaExportInput,
  AuthoringSchemaExportResult,
  type AuthoringSchemaPlanInput,
  AuthoringSchemaPlan,
} from "../../../contracts/authoring/schema";
import {
  CmsCapabilityRequiredFailure,
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
  PublishedSchemaRequiredFailure,
} from "../../../contracts/response/errors";
import { EnumOptionId } from "../../../contracts/field";
import {
  CmsCollection,
  CollectionFieldId,
  CollectionId,
  SchemaRevisionId,
} from "../../../contracts/schema";
import {
  buildAuthoringProjectPlan,
  type AuthoringProjectPlanContext,
} from "../../../lib/authoring/project-plan";
import { buildAuthoringSchemaExport } from "../../../lib/authoring/schema-export";
import { compareCanonicalText } from "../../../lib/field/document";
import { flattenFieldTree } from "../../../lib/field/tree";
import { computeProjectStructureManifestHash } from "../../../lib/authoring/hash";
import {
  applyAuthoringProjectSchema,
  type AuthoringSchemaApplyDecision,
  type AuthoringSchemaApplyFailureStage,
} from "./apply";
import {
  authorizeCmsActorProject,
  type ApplicationDb,
  type ApplicationExecutor,
} from "../../project-access";
import {
  decodePublishedSchemaRevisionSync,
  loadPublishedRevisionRows,
} from "../../schema/repository";

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function persistedNodeRole(value: string): "root" | "property" | "list_item" {
  switch (value) {
    case "root":
    case "list_item":
      return value;
    case "object_property":
      return "property";
    default:
      throw new Error("Persisted schema field has an unsupported node role.");
  }
}

async function authorizeAuthoringEnvironment(
  executor: ApplicationExecutor,
  actor: CmsActor,
  projectId: string,
  environmentId: string,
  action: "schema.read" | "schema.write" | "schema.publish",
) {
  const authorization = await authorizeCmsActorProject(
    executor,
    actor,
    projectId,
    environmentId,
    action,
  );
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
  if (!environmentRow) return { kind: "not_found" } as const;

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
  return capability ? authorization : ({ kind: "cms_required" } as const);
}

export async function loadAuthoringProjectPlanContext(
  executor: ApplicationExecutor,
  options: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly environmentId: string;
  },
): Promise<AuthoringProjectPlanContext> {
  const collectionRows = await executor
    .select({ collection: cmsCollection, head: cmsCollectionSchemaHead })
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
        eq(cmsCollection.workspaceId, options.workspaceId),
        eq(cmsCollection.projectId, options.projectId),
        eq(cmsCollection.environmentId, options.environmentId),
      ),
    )
    .orderBy(cmsCollection.sourceKey);

  const fieldRows = await executor
    .select({ field: cmsCollectionField, collectionSourceKey: cmsCollection.sourceKey })
    .from(cmsCollectionField)
    .innerJoin(
      cmsCollection,
      and(
        eq(cmsCollection.id, cmsCollectionField.collectionId),
        eq(cmsCollection.workspaceId, cmsCollectionField.workspaceId),
        eq(cmsCollection.projectId, cmsCollectionField.projectId),
        eq(cmsCollection.environmentId, cmsCollectionField.environmentId),
      ),
    )
    .where(
      and(
        eq(cmsCollection.workspaceId, options.workspaceId),
        eq(cmsCollection.projectId, options.projectId),
        eq(cmsCollection.environmentId, options.environmentId),
      ),
    );
  const optionRows = await executor
    .select({
      option: cmsEnumOptionSourceIdentity,
      collectionSourceKey: cmsCollection.sourceKey,
      fieldSourceKey: cmsCollectionField.sourceKey,
    })
    .from(cmsEnumOptionSourceIdentity)
    .innerJoin(
      cmsCollection,
      and(
        eq(cmsCollection.id, cmsEnumOptionSourceIdentity.collectionId),
        eq(cmsCollection.workspaceId, cmsEnumOptionSourceIdentity.workspaceId),
        eq(cmsCollection.projectId, cmsEnumOptionSourceIdentity.projectId),
        eq(cmsCollection.environmentId, cmsEnumOptionSourceIdentity.environmentId),
      ),
    )
    .innerJoin(
      cmsCollectionField,
      and(
        eq(cmsCollectionField.id, cmsEnumOptionSourceIdentity.fieldId),
        eq(cmsCollectionField.collectionId, cmsEnumOptionSourceIdentity.collectionId),
      ),
    )
    .where(
      and(
        eq(cmsCollection.workspaceId, options.workspaceId),
        eq(cmsCollection.projectId, options.projectId),
        eq(cmsCollection.environmentId, options.environmentId),
      ),
    );

  const collections: Array<AuthoringProjectPlanContext["collections"][number]> = [];
  const manifestItems: Array<Parameters<typeof computeProjectStructureManifestHash>[0][number]> =
    [];
  const revisionIds: Record<string, SchemaRevisionId> = {};
  for (const { collection, head } of collectionRows) {
    const model = Schema.decodeUnknownSync(CmsCollection)({
      id: collection.id,
      workspaceId: collection.workspaceId,
      projectId: collection.projectId,
      environmentId: collection.environmentId,
      apiKey: collection.apiKey,
      displayName: collection.displayName,
      description: collection.description,
      version: collection.version,
      draftVersion: head.draftVersion,
      draftBaseRevisionId: head.draftBaseRevisionId,
      currentPublishedRevisionId: head.currentPublishedRevisionId,
      currentPublishedSequence: head.currentPublishedSequence,
      createdAt: collection.createdAt.toISOString(),
      updatedAt: collection.updatedAt.toISOString(),
    });
    const publishedRows =
      head.currentPublishedRevisionId === null
        ? null
        : await loadPublishedRevisionRows(executor, {
            collectionId: collection.id,
            projectId: collection.projectId,
            environmentId: collection.environmentId,
            revisionId: head.currentPublishedRevisionId,
          });
    const published =
      publishedRows === null ? null : decodePublishedSchemaRevisionSync(publishedRows);
    collections.push({ sourceKey: collection.sourceKey, collection: model, published });
    if (head.currentPublishedRevisionId !== null && head.currentPublishedStructureHash !== null) {
      const sourceKey = CollectionSourceKey.make(collection.sourceKey);
      const revisionId = SchemaRevisionId.make(head.currentPublishedRevisionId);
      revisionIds[sourceKey] = revisionId;
      manifestItems.push({
        collectionSourceKey: sourceKey,
        collectionId: CollectionId.make(collection.id),
        revisionId,
        structureHash: StructureHash.make(head.currentPublishedStructureHash),
      });
    }
  }

  return {
    workspaceId: Schema.decodeUnknownSync(CmsCollection.fields.workspaceId)(options.workspaceId),
    projectId: Schema.decodeUnknownSync(CmsCollection.fields.projectId)(options.projectId),
    environmentId: Schema.decodeUnknownSync(CmsCollection.fields.environmentId)(
      options.environmentId,
    ),
    current: AuthoringSchemaAuthority.make({
      projectManifestHash: computeProjectStructureManifestHash(manifestItems),
      revisionIds,
    }),
    activeCollectionSourceKeys: collectionRows.map(({ collection }) =>
      CollectionSourceKey.make(collection.sourceKey),
    ),
    persistedIdentities: {
      collections: collectionRows.map(({ collection }) => ({
        sourceKey: collection.sourceKey,
        collectionId: CollectionId.make(collection.id),
        state: "active" as const,
      })),
      fields: fieldRows.map(({ field, collectionSourceKey }) => ({
        collectionSourceKey,
        sourceKey: field.sourceKey,
        fieldId: CollectionFieldId.make(field.id),
        parentFieldId:
          field.parentFieldId === null ? null : CollectionFieldId.make(field.parentFieldId),
        nodeRole: persistedNodeRole(field.nodeRole),
        state: field.removedAt === null ? ("active" as const) : ("retired" as const),
      })),
      enumOptions: optionRows.map(({ option, collectionSourceKey, fieldSourceKey }) => ({
        collectionSourceKey,
        fieldSourceKey,
        sourceKey: option.sourceKey,
        optionId: EnumOptionId.make(option.id),
        state: option.retiredAt === null ? ("active" as const) : ("retired" as const),
      })),
    },
    collections,
  };
}

interface RepositoryOptions {
  readonly database?: ApplicationDb;
  readonly testFailApplyAfter?: AuthoringSchemaApplyFailureStage;
}

export function makeAuthoringSchemaRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;
  return {
    exportSchema: Effect.fn("AuthoringSchemaRepository.exportSchema")(function* (
      actor: CmsActor,
      input: AuthoringSchemaExportInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeAuthoringEnvironment(
            database,
            actor,
            input.scope.projectId,
            input.scope.environmentId,
            "schema.read",
          );
          if (authorization.kind !== "allowed") return { kind: authorization.kind } as const;
          if (authorization.access.project.archivedAt) return { kind: "forbidden" } as const;
          const context = await loadAuthoringProjectPlanContext(database, {
            workspaceId: authorization.access.project.workspaceId,
            projectId: input.scope.projectId,
            environmentId: input.scope.environmentId,
          });
          if (
            context.collections.length === 0 ||
            context.collections.some((collection) => collection.published === null)
          ) {
            return { kind: "published_required" } as const;
          }
          const publishedCollections = context.collections
            .flatMap((collection) =>
              collection.published === null
                ? []
                : [
                    {
                      sourceKey: collection.sourceKey,
                      collectionId: collection.collection.id,
                      apiKey: collection.collection.apiKey,
                      published: collection.published,
                    },
                  ],
            )
            .sort((left, right) => compareCanonicalText(left.sourceKey, right.sourceKey));
          const exported = buildAuthoringSchemaExport({
            collections: publishedCollections,
            persistedIdentities: context.persistedIdentities,
          });
          if (!exported.valid) {
            throw new Error("Published Authoring source authority cannot be exported.");
          }
          const headRows = await database
            .select({
              collectionId: cmsCollectionSchemaHead.collectionId,
              structureHash: cmsCollectionSchemaHead.currentPublishedStructureHash,
            })
            .from(cmsCollectionSchemaHead)
            .where(
              and(
                eq(cmsCollectionSchemaHead.workspaceId, authorization.access.project.workspaceId),
                eq(cmsCollectionSchemaHead.projectId, input.scope.projectId),
                eq(cmsCollectionSchemaHead.environmentId, input.scope.environmentId),
              ),
            );
          const structureHashes = new Map<string, string>();
          for (const row of headRows) {
            if (row.structureHash !== null) {
              structureHashes.set(row.collectionId, row.structureHash);
            }
          }
          const publishedFields = new Map(
            publishedCollections.flatMap((collection) =>
              flattenFieldTree(collection.published.fields).map(
                (field) => [JSON.stringify([collection.sourceKey, field.id]), field] as const,
              ),
            ),
          );
          const fieldSourceKeys = new Map(
            context.persistedIdentities.fields.map((identity) => [
              JSON.stringify([identity.collectionSourceKey, identity.fieldId]),
              identity.sourceKey,
            ]),
          );
          const publishedEnumOptionIds = new Set(
            publishedCollections.flatMap((collection) =>
              flattenFieldTree(collection.published.fields).flatMap((field) => {
                if (field.kind !== "enum") return [];
                const fieldSourceKey = fieldSourceKeys.get(
                  JSON.stringify([collection.sourceKey, field.id]),
                );
                if (fieldSourceKey === undefined) return [];
                return field.configuration.options.map((option) =>
                  JSON.stringify([collection.sourceKey, fieldSourceKey, option.id]),
                );
              }),
            ),
          );
          return {
            kind: "success",
            value: AuthoringSchemaExportResult.make({
              project: exported.project,
              current: context.current,
              collections: publishedCollections.map((collection) =>
                AppliedCollectionSourceIdentity.make({
                  sourceKey: CollectionSourceKey.make(collection.sourceKey),
                  collectionId: collection.collectionId,
                  apiKey: collection.apiKey,
                }),
              ),
              fields: context.persistedIdentities.fields
                .flatMap((identity) => {
                  if (identity.state !== "active") return [];
                  const field = publishedFields.get(
                    JSON.stringify([identity.collectionSourceKey, identity.fieldId]),
                  );
                  return field === undefined
                    ? []
                    : [
                        AppliedFieldSourceIdentity.make({
                          collectionSourceKey: CollectionSourceKey.make(
                            identity.collectionSourceKey,
                          ),
                          sourceKey: FieldSourceKey.make(identity.sourceKey),
                          fieldId: identity.fieldId,
                          apiKey: field.apiKey,
                        }),
                      ];
                })
                .sort((left, right) =>
                  compareCanonicalText(
                    `${left.collectionSourceKey}\0${left.sourceKey}`,
                    `${right.collectionSourceKey}\0${right.sourceKey}`,
                  ),
                ),
              enumOptions: context.persistedIdentities.enumOptions
                .flatMap((identity) =>
                  identity.state === "active" &&
                  publishedEnumOptionIds.has(
                    JSON.stringify([
                      identity.collectionSourceKey,
                      identity.fieldSourceKey,
                      identity.optionId,
                    ]),
                  )
                    ? [
                        AppliedEnumOptionSourceIdentity.make({
                          collectionSourceKey: CollectionSourceKey.make(
                            identity.collectionSourceKey,
                          ),
                          fieldSourceKey: FieldSourceKey.make(identity.fieldSourceKey),
                          sourceKey: EnumOptionSourceKey.make(identity.sourceKey),
                          optionId: identity.optionId,
                        }),
                      ]
                    : [],
                )
                .sort((left, right) =>
                  compareCanonicalText(
                    `${left.collectionSourceKey}\0${left.fieldSourceKey}\0${left.sourceKey}`,
                    `${right.collectionSourceKey}\0${right.fieldSourceKey}\0${right.sourceKey}`,
                  ),
                ),
              revisions: publishedCollections.map((collection) => {
                const structureHash = structureHashes.get(collection.collectionId);
                if (structureHash === undefined) {
                  throw new Error("Published Authoring structure authority is unavailable.");
                }
                return AppliedCollectionRevision.make({
                  collectionSourceKey: CollectionSourceKey.make(collection.sourceKey),
                  collectionId: collection.collectionId,
                  revisionId: collection.published.id,
                  structureHash: StructureHash.make(structureHash),
                  contractHash: collection.published.contractHash,
                  changed: false,
                });
              }),
            }),
          } as const;
        },
        catch: (cause) => databaseFailure("authoring.schema.export", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      if (result.kind === "success") return result.value;
      return yield* Effect.die(new Error("Unknown Authoring schema export decision."));
    }),

    apply: Effect.fn("AuthoringSchemaRepository.apply")(function* (
      actor: CmsActor,
      input: AuthoringSchemaApplyInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: async (): Promise<
          | { readonly kind: "not_found" }
          | { readonly kind: "forbidden" }
          | { readonly kind: "cms_required" }
          | { readonly kind: "decision"; readonly decision: AuthoringSchemaApplyDecision }
        > => {
          for (const action of ["schema.read", "schema.write", "schema.publish"] as const) {
            const authorization = await authorizeAuthoringEnvironment(
              database,
              actor,
              input.scope.projectId,
              input.scope.environmentId,
              action,
            );
            if (authorization.kind !== "allowed") return { kind: authorization.kind };
            if (authorization.access.project.archivedAt) return { kind: "forbidden" };
          }
          return database.transaction(async (transaction) => {
            await transaction.execute(
              sql`select id from project where id = ${input.scope.projectId} for update`,
            );
            let workspaceId: string | null = null;
            for (const action of ["schema.read", "schema.write", "schema.publish"] as const) {
              const authorization = await authorizeAuthoringEnvironment(
                transaction,
                actor,
                input.scope.projectId,
                input.scope.environmentId,
                action,
              );
              if (authorization.kind !== "allowed") return { kind: authorization.kind } as const;
              if (authorization.access.project.archivedAt) return { kind: "forbidden" } as const;
              workspaceId = authorization.access.project.workspaceId;
            }
            if (workspaceId === null)
              throw new Error("Authoring workspace authority was not found.");
            return {
              kind: "decision",
              decision: await applyAuthoringProjectSchema({
                transaction,
                workspaceId,
                actor,
                input,
                now,
                requestId,
                failAfter: options.testFailApplyAfter,
              }),
            } as const;
          });
        },
        catch: (cause) => databaseFailure("authoring.schema.apply", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.decision;
    }),

    plan: Effect.fn("AuthoringSchemaRepository.plan")(function* (
      actor: CmsActor,
      input: AuthoringSchemaPlanInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeAuthoringEnvironment(
            database,
            actor,
            input.scope.projectId,
            input.scope.environmentId,
            "schema.read",
          );
          if (authorization.kind !== "allowed") return { kind: authorization.kind } as const;
          if (authorization.access.project.archivedAt) return { kind: "forbidden" } as const;
          const context = await loadAuthoringProjectPlanContext(database, {
            workspaceId: authorization.access.project.workspaceId,
            projectId: input.scope.projectId,
            environmentId: input.scope.environmentId,
          });
          return {
            kind: "success",
            plan: buildAuthoringProjectPlan(input.project, context),
          } as const;
        },
        catch: (cause) => databaseFailure("authoring.schema.plan", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return Schema.decodeUnknownSync(AuthoringSchemaPlan)(result.plan);
    }),
  };
}

export class AuthoringSchemaRepository extends Context.Tag("AuthoringSchemaRepository")<
  AuthoringSchemaRepository,
  ReturnType<typeof makeAuthoringSchemaRepository>
>() {}

export const AuthoringSchemaRepositoryLive = Layer.succeed(
  AuthoringSchemaRepository,
  makeAuthoringSchemaRepository(),
);
