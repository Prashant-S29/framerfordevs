// Composes current Studio user, locale, schema projection, and anomaly-audit authority.

import { db } from "@framerfordevs/db";
import { and, eq, gt, inArray, isNotNull, lt, or, sql } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionSchemaHead,
  cmsEntry,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import { environment, projectCapability } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import { ProjectRole } from "../../../contracts/access";
import { type LocaleTag, ProjectLocaleId } from "../../../contracts/locale";
import { type AuthUserId, IsoDateTime, WorkspaceId } from "../../../contracts/platform";
import {
  CmsCapabilityRequiredFailure,
  DatabaseFailure,
  ForbiddenFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
} from "../../../contracts/response/errors";
import { SchemaRevisionId } from "../../../contracts/schema";
import {
  StudioContentCollection,
  StudioContentContext,
  StudioContentCursorStaleFailure,
  StudioContentLocale,
  type StudioContentPageLimit,
  StudioContentScope,
  StudioCollectionConfigurationInvalidFailure,
  StudioCollectionConfigurationNotice,
  type StudioCollectionLocaleScope,
  StudioEntryPage,
  StudioEntrySummary,
} from "../../../contracts/studio-content";
import { generatedFormDefinition } from "../../../lib/field/form-definition";
import { projectStudioForm } from "../../../lib/studio-content/form-projection";
import { decideStudioCollectionProjection } from "../../../lib/studio-content/projection";
import type { StudioSearchAuthority } from "../../../lib/studio-content/search";
import { boundedStudioMatchCount } from "../../../lib/studio-content/search";
import { isRoleAllowed } from "../../policy";
import { type ApplicationDb, selectUserProjectAccess } from "../../project-access";
import { decodePublishedSchemaRevisionSync } from "../../schema/repository";
import { ensureProjectionInvalidAudit } from "../projection-audit";

interface StudioContentRepositoryOptions {
  readonly database?: Pick<ApplicationDb, "transaction">;
}

export interface StudioCollectionAuthority {
  readonly workspaceId: WorkspaceId;
  readonly role: typeof ProjectRole.Type;
  readonly localeId: ProjectLocaleId;
  readonly locale: LocaleTag;
  readonly schemaRevisionId: SchemaRevisionId;
  readonly canCreate: boolean;
  readonly canRename: boolean;
  readonly canWriteLocalized: boolean;
  readonly canWriteShared: boolean;
}

export interface StudioEntryBrowseOrder {
  readonly createdAt: string;
  readonly entryId: string;
}

export interface StudioEntrySearchOrder {
  readonly foldedDisplayName: string;
  readonly entryId: string;
}

export interface ListStudioEntriesInput {
  readonly scope: StudioCollectionLocaleScope;
  readonly expectedSchemaRevisionId: SchemaRevisionId;
  readonly limit: StudioContentPageLimit;
  readonly search: StudioSearchAuthority | null;
  readonly browseOrder: StudioEntryBrowseOrder | null;
  readonly searchOrder: StudioEntrySearchOrder | null;
}

export interface StudioEntryPageResult {
  readonly page: StudioEntryPage;
  readonly finalBrowseOrder: StudioEntryBrowseOrder | null;
  readonly finalSearchOrder: StudioEntrySearchOrder | null;
}

function failure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function placementCount(form: ReturnType<typeof generatedFormDefinition>): number {
  let count = 0;
  for (const tab of form.editorLayout.tabs) {
    for (const group of tab.groups) count += group.fields.length;
  }
  for (const group of form.editorLayout.sidebarGroups) count += group.fields.length;
  return count;
}

async function selectCollectionAuthority(
  executor: Parameters<Parameters<ApplicationDb["transaction"]>[0]>[0],
  actorId: AuthUserId,
  scope: StudioCollectionLocaleScope,
  now: Date,
) {
  const access = await selectUserProjectAccess(executor, actorId, scope.projectId);
  if (
    !access ||
    access.project.archivedAt !== null ||
    !isRoleAllowed(access.role, "content.read")
  ) {
    return { kind: "not_found" as const };
  }
  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, scope.environmentId),
        eq(environment.projectId, scope.projectId),
        eq(environment.workspaceId, access.project.workspaceId),
      ),
    )
    .limit(1);
  if (!environmentRow) return { kind: "not_found" as const };
  const [capability] = await executor
    .select({ status: projectCapability.status })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, access.project.workspaceId),
        eq(projectCapability.projectId, scope.projectId),
        eq(projectCapability.key, "cms"),
      ),
    )
    .limit(1);
  if (capability?.status !== "enabled") return { kind: "cms_disabled" as const };
  const [locale] = await executor
    .select({ id: projectLocale.id })
    .from(projectLocale)
    .where(
      and(
        eq(projectLocale.workspaceId, access.project.workspaceId),
        eq(projectLocale.projectId, scope.projectId),
        eq(projectLocale.tag, scope.locale),
        eq(projectLocale.status, "enabled"),
      ),
    )
    .limit(1);
  if (!locale) return { kind: "locale_unavailable" as const };
  if (
    access.localeAccessMode !== "all" &&
    !(access.localeAccessMode === "selected" && access.allowedLocaleIds.includes(locale.id))
  ) {
    return { kind: "not_found" as const };
  }
  const [revision] = await executor
    .select({ revision: cmsSchemaRevision })
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
    .innerJoin(
      cmsSchemaRevision,
      eq(cmsSchemaRevision.id, cmsCollectionSchemaHead.currentPublishedRevisionId),
    )
    .where(
      and(
        eq(cmsCollection.id, scope.collectionId),
        eq(cmsCollection.workspaceId, access.project.workspaceId),
        eq(cmsCollection.projectId, scope.projectId),
        eq(cmsCollection.environmentId, scope.environmentId),
      ),
    )
    .limit(1);
  if (!revision) return { kind: "not_found" as const };
  const persistedFields = await executor
    .select()
    .from(cmsSchemaRevisionField)
    .where(eq(cmsSchemaRevisionField.revisionId, revision.revision.id))
    .orderBy(cmsSchemaRevisionField.position, cmsSchemaRevisionField.fieldId);
  const role = Schema.decodeUnknownSync(ProjectRole)(access.role);
  if (persistedFields.length === 0) {
    return role === "owner" || role === "developer"
      ? { kind: "configuration_invalid" as const, reason: "empty_schema" as const }
      : { kind: "not_found" as const };
  }
  let projectedRootFieldCount = 0;
  let projectedPlacementCount = 0;
  let projectedEditableFieldCount = 0;
  try {
    const published = decodePublishedSchemaRevisionSync({
      revision: revision.revision,
      fields: persistedFields,
    });
    const form = generatedFormDefinition({
      source: "published",
      collectionId: revision.revision.collectionId,
      revisionId: revision.revision.id,
      formatVersion: published.formatVersion,
      validationProfile: published.validationProfile,
      currencyRegistryProfile: published.currencyRegistryProfile,
      contractHash: published.contractHash,
      role,
      canEdit: isRoleAllowed(role, "content.write"),
      fields: published.fields,
      editorLayout: published.editorLayout,
    });
    const projectedForm = projectStudioForm(form);
    projectedRootFieldCount = projectedForm.fields.length;
    projectedPlacementCount = placementCount(form);
    projectedEditableFieldCount = projectedForm.editableFieldIds.length;
  } catch {
    projectedRootFieldCount = 0;
    projectedPlacementCount = 0;
  }
  const decision = decideStudioCollectionProjection({
    role,
    activeFieldCount: persistedFields.length,
    projectedRootFieldCount,
    projectedPlacementCount,
  });
  if (decision.kind === "hidden") return { kind: "not_found" as const };
  if (decision.kind === "configuration_invalid") {
    if (decision.reason === "projection_invalid") {
      await ensureProjectionInvalidAudit(executor, {
        workspaceId: Schema.decodeUnknownSync(WorkspaceId)(access.project.workspaceId),
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        schemaRevisionId: Schema.decodeUnknownSync(SchemaRevisionId)(revision.revision.id),
        actorId,
        occurredAt: now,
      });
    }
    return decision;
  }
  const canWriteLocalized = isRoleAllowed(role, "content.write") && projectedEditableFieldCount > 0;
  return {
    kind: "success" as const,
    authority: {
      workspaceId: Schema.decodeUnknownSync(WorkspaceId)(access.project.workspaceId),
      role,
      localeId: Schema.decodeUnknownSync(ProjectLocaleId)(locale.id),
      locale: scope.locale,
      schemaRevisionId: Schema.decodeUnknownSync(SchemaRevisionId)(revision.revision.id),
      canCreate: canWriteLocalized,
      canRename: canWriteLocalized,
      canWriteLocalized,
      canWriteShared: canWriteLocalized && access.localeAccessMode === "all",
    } satisfies StudioCollectionAuthority,
  };
}

export function makeStudioContentRepository(options: StudioContentRepositoryOptions = {}) {
  const database = options.database ?? db;

  return {
    authorizeCollection: Effect.fn("StudioContentRepository.authorizeCollection")(function* (
      actorId: AuthUserId,
      scope: StudioCollectionLocaleScope,
      now: Date,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction((transaction) =>
            selectCollectionAuthority(transaction, actorId, scope, now),
          ),
        catch: (cause) => failure("studio_content.collection.authorize", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "studio_collection" });
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_disabled") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "configuration_invalid") {
        return yield* StudioCollectionConfigurationInvalidFailure.make({ reason: result.reason });
      }
      return result.authority;
    }),

    listEntries: Effect.fn("StudioContentRepository.listEntries")(function* (
      actorId: AuthUserId,
      input: ListStudioEntriesInput,
      now: Date,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await selectCollectionAuthority(
              transaction,
              actorId,
              input.scope,
              now,
            );
            if (authorization.kind !== "success") return authorization;
            if (authorization.authority.schemaRevisionId !== input.expectedSchemaRevisionId) {
              return { kind: "stale_cursor" as const };
            }
            const foldedDisplayName = sql<string>`lower(${cmsEntry.displayName}) collate "C"`;
            const baseCondition = and(
              eq(cmsEntry.workspaceId, authorization.authority.workspaceId),
              eq(cmsEntry.projectId, input.scope.projectId),
              eq(cmsEntry.environmentId, input.scope.environmentId),
              eq(cmsEntry.collectionId, input.scope.collectionId),
              isNotNull(cmsEntry.displayName),
              input.search === null
                ? undefined
                : sql`${foldedDisplayName} like lower(${input.search.databaseLikePrefix}) escape '\\'`,
            );
            const continuation =
              input.search === null
                ? input.browseOrder === null
                  ? undefined
                  : or(
                      lt(cmsEntry.createdAt, new Date(input.browseOrder.createdAt)),
                      and(
                        eq(cmsEntry.createdAt, new Date(input.browseOrder.createdAt)),
                        lt(cmsEntry.id, input.browseOrder.entryId),
                      ),
                    )
                : input.searchOrder === null
                  ? undefined
                  : or(
                      sql`${foldedDisplayName} ~>~ ${input.searchOrder.foldedDisplayName}`,
                      and(
                        eq(foldedDisplayName, input.searchOrder.foldedDisplayName),
                        gt(cmsEntry.id, input.searchOrder.entryId),
                      ),
                    );
            const query = transaction
              .select({
                id: cmsEntry.id,
                displayName: cmsEntry.displayName,
                nameVersion: cmsEntry.nameVersion,
                createdAt: cmsEntry.createdAt,
                updatedAt: cmsEntry.updatedAt,
                foldedDisplayName,
              })
              .from(cmsEntry)
              .where(and(baseCondition, continuation));
            const rows =
              input.search === null
                ? await query
                    .orderBy(
                      sql`${cmsEntry.createdAt} desc nulls last`,
                      sql`${cmsEntry.id} desc nulls last`,
                    )
                    .limit(input.limit + 1)
                : await query
                    .orderBy(sql`${foldedDisplayName} using ~<~`, cmsEntry.id)
                    .limit(input.limit + 1);
            const countRows = await transaction
              .select({ id: cmsEntry.id })
              .from(cmsEntry)
              .where(baseCondition)
              .limit(1_001);
            const visibleRows = rows.slice(0, input.limit);
            const items = visibleRows.map((row) => {
              if (row.displayName === null) {
                throw new Error("Studio entry query returned a null display name.");
              }
              return Schema.decodeUnknownSync(StudioEntrySummary)({
                id: row.id,
                displayName: row.displayName,
                nameVersion: row.nameVersion,
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.updatedAt.toISOString(),
              });
            });
            const final = visibleRows.at(-1);
            return {
              kind: "success" as const,
              result: {
                page: Schema.decodeUnknownSync(StudioEntryPage)({
                  items,
                  hasMore: rows.length > input.limit,
                  nextCursor: null,
                  count: boundedStudioMatchCount(countRows.length),
                }),
                finalBrowseOrder:
                  input.search === null && final !== undefined
                    ? {
                        createdAt: Schema.decodeUnknownSync(IsoDateTime)(
                          final.createdAt.toISOString(),
                        ),
                        entryId: final.id,
                      }
                    : null,
                finalSearchOrder:
                  input.search !== null && final !== undefined
                    ? { foldedDisplayName: final.foldedDisplayName, entryId: final.id }
                    : null,
              } satisfies StudioEntryPageResult,
            };
          }),
        catch: (cause) => failure("studio_content.entries.list", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "studio_collection" });
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_disabled") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "configuration_invalid") {
        return yield* StudioCollectionConfigurationInvalidFailure.make({ reason: result.reason });
      }
      if (result.kind === "stale_cursor") return yield* StudioContentCursorStaleFailure.make();
      return result.result;
    }),

    getContext: Effect.fn("StudioContentRepository.getContext")(function* (
      actorId: AuthUserId,
      scope: StudioContentScope,
      now: Date,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const access = await selectUserProjectAccess(transaction, actorId, scope.projectId);
            if (!access || access.project.archivedAt !== null) {
              return { kind: "not_found" as const };
            }
            if (!isRoleAllowed(access.role, "content.read")) {
              return { kind: "forbidden" as const };
            }
            const [environmentRow] = await transaction
              .select({ id: environment.id })
              .from(environment)
              .where(
                and(
                  eq(environment.id, scope.environmentId),
                  eq(environment.projectId, scope.projectId),
                  eq(environment.workspaceId, access.project.workspaceId),
                ),
              )
              .limit(1);
            if (!environmentRow) return { kind: "not_found" as const };
            const [capability] = await transaction
              .select({ status: projectCapability.status })
              .from(projectCapability)
              .where(
                and(
                  eq(projectCapability.workspaceId, access.project.workspaceId),
                  eq(projectCapability.projectId, scope.projectId),
                  eq(projectCapability.key, "cms"),
                ),
              )
              .limit(1);
            if (capability?.status !== "enabled") return { kind: "cms_disabled" as const };

            const role = Schema.decodeUnknownSync(ProjectRole)(access.role);
            const enabledLocales = await transaction
              .select({
                id: projectLocale.id,
                tag: projectLocale.tag,
                displayName: projectLocale.displayName,
                position: projectLocale.position,
              })
              .from(projectLocale)
              .where(
                and(
                  eq(projectLocale.workspaceId, access.project.workspaceId),
                  eq(projectLocale.projectId, scope.projectId),
                  eq(projectLocale.status, "enabled"),
                ),
              )
              .orderBy(projectLocale.position, projectLocale.id);
            const allowedLocaleIds = new Set(access.allowedLocaleIds);
            const effectiveLocales = enabledLocales.filter(
              (locale) =>
                access.localeAccessMode === "all" ||
                (access.localeAccessMode === "selected" && allowedLocaleIds.has(locale.id)),
            );
            const roleCanWrite = isRoleAllowed(role, "content.write");
            const locales = effectiveLocales.map((locale) =>
              Schema.decodeUnknownSync(StudioContentLocale)({
                id: locale.id,
                tag: locale.tag,
                displayName: locale.displayName,
                canRead: true,
                canWrite: roleCanWrite,
              }),
            );
            if (locales.length === 0) {
              return {
                kind: "success" as const,
                context: Schema.decodeUnknownSync(StudioContentContext)({
                  locales: [],
                  collections: [],
                  configurationNotices: [],
                }),
              };
            }

            const revisionRows = await transaction
              .select({ revision: cmsSchemaRevision })
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
              .innerJoin(
                cmsSchemaRevision,
                eq(cmsSchemaRevision.id, cmsCollectionSchemaHead.currentPublishedRevisionId),
              )
              .where(
                and(
                  eq(cmsCollection.workspaceId, access.project.workspaceId),
                  eq(cmsCollection.projectId, scope.projectId),
                  eq(cmsCollection.environmentId, scope.environmentId),
                ),
              )
              .orderBy(cmsCollection.createdAt, cmsCollection.id)
              .limit(50);
            const revisionIds = revisionRows.map(({ revision }) => revision.id);
            const fieldRows =
              revisionIds.length === 0
                ? []
                : await transaction
                    .select()
                    .from(cmsSchemaRevisionField)
                    .where(inArray(cmsSchemaRevisionField.revisionId, revisionIds))
                    .orderBy(
                      cmsSchemaRevisionField.revisionId,
                      cmsSchemaRevisionField.position,
                      cmsSchemaRevisionField.fieldId,
                    );
            const fieldsByRevision = new Map<
              string,
              Array<typeof cmsSchemaRevisionField.$inferSelect>
            >();
            for (const field of fieldRows) {
              const fields = fieldsByRevision.get(field.revisionId) ?? [];
              fields.push(field);
              fieldsByRevision.set(field.revisionId, fields);
            }

            const collections: Array<StudioContentCollection> = [];
            const configurationNotices: Array<StudioCollectionConfigurationNotice> = [];
            const supportRole = role === "owner" || role === "developer";
            for (const { revision } of revisionRows) {
              const persistedFields = fieldsByRevision.get(revision.id) ?? [];
              if (persistedFields.length === 0) {
                if (supportRole) {
                  configurationNotices.push(
                    Schema.decodeUnknownSync(StudioCollectionConfigurationNotice)({
                      collectionId: revision.collectionId,
                      displayName: revision.collectionDisplayName,
                      reason: "empty_schema",
                    }),
                  );
                }
                continue;
              }

              let projectedRootFieldCount = 0;
              let projectedPlacementCount = 0;
              let projectedEditableFieldCount = 0;
              let projectionFailed = false;
              try {
                const published = decodePublishedSchemaRevisionSync({
                  revision,
                  fields: persistedFields,
                });
                const form = generatedFormDefinition({
                  source: "published",
                  collectionId: revision.collectionId,
                  revisionId: revision.id,
                  formatVersion: published.formatVersion,
                  validationProfile: published.validationProfile,
                  currencyRegistryProfile: published.currencyRegistryProfile,
                  contractHash: published.contractHash,
                  role,
                  canEdit: roleCanWrite,
                  fields: published.fields,
                  editorLayout: published.editorLayout,
                });
                const projectedForm = projectStudioForm(form);
                projectedRootFieldCount = projectedForm.fields.length;
                projectedPlacementCount = placementCount(form);
                projectedEditableFieldCount = projectedForm.editableFieldIds.length;
              } catch {
                projectionFailed = true;
              }
              const decision = decideStudioCollectionProjection({
                role,
                activeFieldCount: persistedFields.length,
                projectedRootFieldCount: projectionFailed ? 0 : projectedRootFieldCount,
                projectedPlacementCount: projectionFailed ? 0 : projectedPlacementCount,
              });
              if (decision.kind === "hidden") continue;
              if (decision.kind === "configuration_invalid") {
                configurationNotices.push(
                  Schema.decodeUnknownSync(StudioCollectionConfigurationNotice)({
                    collectionId: revision.collectionId,
                    displayName: revision.collectionDisplayName,
                    reason: decision.reason,
                  }),
                );
                if (decision.reason === "projection_invalid") {
                  await ensureProjectionInvalidAudit(transaction, {
                    workspaceId: Schema.decodeUnknownSync(WorkspaceId)(access.project.workspaceId),
                    projectId: scope.projectId,
                    environmentId: scope.environmentId,
                    schemaRevisionId: Schema.decodeUnknownSync(SchemaRevisionId)(revision.id),
                    actorId,
                    occurredAt: now,
                  });
                }
                continue;
              }
              const canMutate = roleCanWrite && projectedEditableFieldCount > 0;
              collections.push(
                Schema.decodeUnknownSync(StudioContentCollection)({
                  id: revision.collectionId,
                  displayName: revision.collectionDisplayName,
                  capabilities: {
                    canCreate: canMutate,
                    canRename: canMutate,
                    canSaveLocalized: canMutate,
                    canSaveShared: canMutate && access.localeAccessMode === "all",
                  },
                }),
              );
            }
            return {
              kind: "success" as const,
              context: Schema.decodeUnknownSync(StudioContentContext)({
                locales,
                collections,
                configurationNotices,
              }),
            };
          }),
        catch: (cause) => failure("studio_content.context", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "studio_content" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_disabled") return yield* CmsCapabilityRequiredFailure.make();
      return result.context;
    }),
  };
}

export type StudioContentRepositoryService = ReturnType<typeof makeStudioContentRepository>;

export class StudioContentRepository extends Context.Tag("StudioContentRepository")<
  StudioContentRepository,
  StudioContentRepositoryService
>() {}

export const StudioContentRepositoryLive = Layer.succeed(
  StudioContentRepository,
  makeStudioContentRepository(),
);
