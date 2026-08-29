// Reads tenant-scoped Tooling discovery and immutable published-contract projections.

import { createHash } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, eq, gt, inArray, isNotNull, isNull, or, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import {
  cmsCollection,
  cmsCollectionSchemaHead,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import { AuthUserId } from "../contracts/platform";
import {
  CmsCapabilityRequiredFailure,
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
  ToolingResponseTooLargeFailure,
} from "../contracts/errors";
import {
  ToolingCollectionContractRevision,
  ToolingCollectionSummary,
  ToolingEnvironmentPage,
  ToolingEnvironmentSummary,
  ToolingLocaleSummary,
  ToolingProjectSummary,
  ToolingSchemaManifestPage,
  toolingLimits,
} from "../contracts/tooling";
import { canonicalizeEntryValue } from "../lib/entry-values";
import { toolingJsonData } from "../lib/tooling-json";
import { compileCollectionContract } from "./schema-engine";
import { decodePublishedSchemaRevisionSync } from "./schema-repository";
import type { ToolingPrincipal } from "./tooling-principal-authenticator";
import {
  authorizeUserProject,
  type ApplicationDb,
  type ApplicationExecutor,
  type ApplicationTransaction,
} from "./project-access";

interface PageInput {
  readonly afterId: string | null;
  readonly limit: number;
}

interface ScopedPageInput extends PageInput {
  readonly principal: ToolingPrincipal;
  readonly requestId: string;
  readonly projectId: string;
  readonly environmentKey: string;
}

interface EnvironmentPageInput extends PageInput {
  readonly userId: string;
  readonly projectId: string;
}

interface CollectionRevisionInput {
  readonly principal: ToolingPrincipal;
  readonly projectId: string;
  readonly environmentKey: string;
  readonly collectionKey: string;
  readonly revisionId: string;
}

interface ToolingScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly environmentKey: string;
}

interface ToolingRepositoryOptions {
  readonly database?: ApplicationDb;
  readonly executor?: ApplicationExecutor;
  readonly runReadTransaction?: <A>(
    work: (transaction: ApplicationTransaction) => Promise<A>,
  ) => Promise<A>;
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pageAfter(column: typeof project.id, afterId: string | null) {
  return afterId === null ? undefined : gt(column, afterId);
}

async function resolveScope(
  executor: ApplicationExecutor,
  principal: ToolingPrincipal,
  projectId: string,
  environmentKey: string,
): Promise<ToolingScope | "not_found" | "forbidden" | "cms_required"> {
  let workspaceId: string;
  if (principal.kind === "oauth_user") {
    const authorization = await authorizeUserProject(
      executor,
      AuthUserId.make(principal.userId),
      projectId,
      "schema.read",
    );
    if (authorization.kind === "not_found") return "not_found";
    if (authorization.kind === "forbidden") return "forbidden";
    if (authorization.access.project.archivedAt !== null) return "not_found";
    workspaceId = authorization.access.project.workspaceId;
  } else {
    if (principal.credential.projectId !== projectId) return "forbidden";
    workspaceId = principal.credential.workspaceId;
  }

  const [environmentRow] = await executor
    .select({
      id: environment.id,
      workspaceId: environment.workspaceId,
      projectId: environment.projectId,
      key: environment.key,
      archivedAt: project.archivedAt,
    })
    .from(environment)
    .innerJoin(
      project,
      and(eq(project.id, environment.projectId), eq(project.workspaceId, environment.workspaceId)),
    )
    .where(
      and(
        eq(environment.projectId, projectId),
        eq(environment.workspaceId, workspaceId),
        eq(environment.key, environmentKey),
      ),
    )
    .limit(1);
  if (!environmentRow || environmentRow.archivedAt !== null) return "not_found";
  if (
    principal.kind === "management_credential" &&
    principal.credential.environmentId !== environmentRow.id
  ) {
    return "forbidden";
  }

  const [capability] = await executor
    .select({ status: projectCapability.status })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, workspaceId),
        eq(projectCapability.projectId, projectId),
        eq(projectCapability.key, "cms"),
      ),
    )
    .limit(1);
  if (!capability || capability.status !== "enabled") return "cms_required";

  return {
    workspaceId,
    projectId,
    environmentId: environmentRow.id,
    environmentKey: environmentRow.key,
  };
}

async function loadRevisionFields(
  executor: ApplicationExecutor,
  revisionIds: ReadonlyArray<string>,
) {
  if (revisionIds.length === 0) return [];
  return executor
    .select()
    .from(cmsSchemaRevisionField)
    .where(inArray(cmsSchemaRevisionField.revisionId, [...revisionIds]))
    .orderBy(
      cmsSchemaRevisionField.revisionId,
      cmsSchemaRevisionField.position,
      cmsSchemaRevisionField.fieldId,
    );
}

function fieldsByRevision(
  rows: ReadonlyArray<typeof cmsSchemaRevisionField.$inferSelect>,
): ReadonlyMap<string, ReadonlyArray<typeof cmsSchemaRevisionField.$inferSelect>> {
  const grouped = new Map<string, Array<typeof cmsSchemaRevisionField.$inferSelect>>();
  for (const row of rows) {
    const fields = grouped.get(row.revisionId) ?? [];
    fields.push(row);
    grouped.set(row.revisionId, fields);
  }
  return grouped;
}

function responseWithinLimit(value: unknown): boolean {
  return Buffer.byteLength(canonicalizeEntryValue(value), "utf8") <= toolingLimits.responseBytes;
}

export function makeToolingRepository(options: ToolingRepositoryOptions = {}) {
  const database = options.database ?? db;
  const executor = options.executor ?? database;
  const runReadTransaction =
    options.runReadTransaction ??
    (<A>(work: (transaction: ApplicationTransaction) => Promise<A>) =>
      database.transaction(
        async (transaction) => {
          await transaction.execute(sql`set local statement_timeout = '750ms'`);
          await transaction.execute(sql`set local idle_in_transaction_session_timeout = '2000ms'`);
          return work(transaction);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ));

  return {
    listProjects: Effect.fn("ToolingRepository.listProjects")(function* (
      userId: string,
      input: PageInput,
    ) {
      const rows = yield* Effect.tryPromise({
        try: () =>
          executor
            .selectDistinct({ id: project.id, key: project.key, name: project.name })
            .from(project)
            .innerJoin(
              workspaceMembership,
              and(
                eq(workspaceMembership.workspaceId, project.workspaceId),
                eq(workspaceMembership.userId, userId),
                isNull(workspaceMembership.revokedAt),
              ),
            )
            .leftJoin(
              projectMembership,
              and(
                eq(projectMembership.workspaceId, project.workspaceId),
                eq(projectMembership.projectId, project.id),
                eq(projectMembership.userId, userId),
                isNull(projectMembership.removedAt),
              ),
            )
            .where(
              and(
                isNull(project.archivedAt),
                pageAfter(project.id, input.afterId),
                or(eq(workspaceMembership.role, "owner"), isNotNull(projectMembership.id)),
              ),
            )
            .orderBy(project.id)
            .limit(input.limit + 1),
        catch: (cause) => databaseFailure("tooling.projects.list", cause),
      });
      const pageRows = rows.slice(0, input.limit);
      return {
        items: pageRows.map((row) => Schema.decodeUnknownSync(ToolingProjectSummary)(row)),
        nextAfterId: rows.length > input.limit ? (pageRows.at(-1)?.id ?? null) : null,
      };
    }),

    listEnvironments: Effect.fn("ToolingRepository.listEnvironments")(function* (
      input: EnvironmentPageInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeUserProject(
            executor,
            AuthUserId.make(input.userId),
            input.projectId,
            "schema.read",
          );
          if (authorization.kind === "not_found") return { kind: "not_found" as const };
          if (authorization.kind === "forbidden") return { kind: "forbidden" as const };
          if (authorization.access.project.archivedAt !== null) {
            return { kind: "not_found" as const };
          }
          const rows = await executor
            .select({
              id: environment.id,
              key: environment.key,
              name: environment.name,
              primary: environment.isPrimary,
            })
            .from(environment)
            .where(
              and(
                eq(environment.workspaceId, authorization.access.project.workspaceId),
                eq(environment.projectId, input.projectId),
                input.afterId === null ? undefined : gt(environment.id, input.afterId),
              ),
            )
            .orderBy(environment.id)
            .limit(input.limit + 1);
          return { kind: "success" as const, rows };
        },
        catch: (cause) => databaseFailure("tooling.environments.list", cause),
      });
      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "project" });
      }
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      const pageRows = result.rows.slice(0, input.limit);
      return {
        projectId: Schema.decodeUnknownSync(ToolingEnvironmentPage.fields.projectId)(
          input.projectId,
        ),
        items: pageRows.map((row) => Schema.decodeUnknownSync(ToolingEnvironmentSummary)(row)),
        nextAfterId: result.rows.length > input.limit ? (pageRows.at(-1)?.id ?? null) : null,
      };
    }),

    getManifestPage: Effect.fn("ToolingRepository.getManifestPage")(function* (
      input: ScopedPageInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const readResult = await runReadTransaction(async (transaction) => {
            const scope = await resolveScope(
              transaction,
              input.principal,
              input.projectId,
              input.environmentKey,
            );
            if (typeof scope === "string") return { kind: scope } as const;
            const locales = await transaction
              .select({ id: projectLocale.id, tag: projectLocale.tag })
              .from(projectLocale)
              .where(
                and(
                  eq(projectLocale.workspaceId, scope.workspaceId),
                  eq(projectLocale.projectId, scope.projectId),
                  eq(projectLocale.status, "enabled"),
                ),
              )
              .orderBy(projectLocale.position, projectLocale.id)
              .limit(101);
            if (locales.length > 100) throw new Error("Enabled locale limit was exceeded.");

            const rows = await transaction
              .select({ revision: cmsSchemaRevision })
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
              .innerJoin(
                cmsSchemaRevision,
                and(
                  eq(cmsSchemaRevision.id, cmsCollectionSchemaHead.currentPublishedRevisionId),
                  eq(cmsSchemaRevision.collectionId, cmsCollection.id),
                  eq(cmsSchemaRevision.environmentId, cmsCollection.environmentId),
                  eq(cmsSchemaRevision.projectId, cmsCollection.projectId),
                  eq(cmsSchemaRevision.workspaceId, cmsCollection.workspaceId),
                ),
              )
              .where(
                and(
                  eq(cmsCollection.workspaceId, scope.workspaceId),
                  eq(cmsCollection.projectId, scope.projectId),
                  eq(cmsCollection.environmentId, scope.environmentId),
                  input.afterId === null ? undefined : gt(cmsCollection.id, input.afterId),
                ),
              )
              .orderBy(cmsCollection.id)
              .limit(input.limit + 1);
            const pageRows = rows.slice(0, input.limit);
            const fieldRows = await loadRevisionFields(
              transaction,
              pageRows.map((row) => row.revision.id),
            );
            const groupedFields = fieldsByRevision(fieldRows);
            const collections = pageRows.map(({ revision }) => {
              const published = decodePublishedSchemaRevisionSync({
                revision,
                fields: groupedFields.get(revision.id) ?? [],
              });
              return Schema.decodeUnknownSync(ToolingCollectionSummary)({
                id: published.collectionId,
                key: published.collectionApiKey,
                revisionId: published.id,
                revisionSequence: published.sequence,
                contractHash: published.contractHash,
              });
            });
            const localeItems = locales.map((locale) =>
              Schema.decodeUnknownSync(ToolingLocaleSummary)(locale),
            );
            const page = Schema.decodeUnknownSync(ToolingSchemaManifestPage)({
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              environmentKey: scope.environmentKey,
              locales: localeItems,
              localeContractHash: sha256(canonicalizeEntryValue(localeItems)),
              collections,
              nextCursor: null,
            });
            if (!responseWithinLimit(page)) return { kind: "too_large" as const };
            return {
              kind: "success" as const,
              page,
              scope,
              nextAfterId:
                rows.length > input.limit ? (pageRows.at(-1)?.revision.collectionId ?? null) : null,
            };
          });
          if (readResult.kind === "success" && input.afterId === null) {
            await executor.insert(auditEvent).values({
              workspaceId: readResult.scope.workspaceId,
              projectId: readResult.scope.projectId,
              environmentId: readResult.scope.environmentId,
              actorType: input.principal.kind === "oauth_user" ? "user" : "credential",
              actorId:
                input.principal.kind === "oauth_user"
                  ? input.principal.userId
                  : input.principal.credential.credentialId,
              action: "tooling.schema_manifest.read",
              resourceType: "environment",
              resourceId: readResult.scope.environmentId,
              requestId: input.requestId,
            });
          }
          return readResult;
        },
        catch: (cause) => databaseFailure("tooling.manifest.get", cause),
      });
      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "environment" });
      }
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "too_large") return yield* ToolingResponseTooLargeFailure.make();
      if (result.kind !== "success") {
        return yield* NotFoundFailure.make({ resource: "environment" });
      }
      return { ...result.page, nextAfterId: result.nextAfterId };
    }),

    getCollectionRevision: Effect.fn("ToolingRepository.getCollectionRevision")(function* (
      input: CollectionRevisionInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          runReadTransaction(async (transaction) => {
            const scope = await resolveScope(
              transaction,
              input.principal,
              input.projectId,
              input.environmentKey,
            );
            if (typeof scope === "string") return { kind: scope } as const;
            const [revision] = await transaction
              .select()
              .from(cmsSchemaRevision)
              .where(
                and(
                  eq(cmsSchemaRevision.id, input.revisionId),
                  eq(cmsSchemaRevision.collectionApiKey, input.collectionKey),
                  eq(cmsSchemaRevision.environmentId, scope.environmentId),
                  eq(cmsSchemaRevision.projectId, scope.projectId),
                  eq(cmsSchemaRevision.workspaceId, scope.workspaceId),
                ),
              )
              .limit(1);
            if (!revision) return { kind: "not_found" as const };
            const fields = await loadRevisionFields(transaction, [revision.id]);
            const published = decodePublishedSchemaRevisionSync({ revision, fields });
            const response = Schema.decodeUnknownSync(ToolingCollectionContractRevision)({
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              environmentKey: scope.environmentKey,
              collectionId: published.collectionId,
              collectionKey: published.collectionApiKey,
              revisionId: published.id,
              revisionSequence: published.sequence,
              contractHash: published.contractHash,
              publishedAt: published.publishedAt,
              contract: toolingJsonData(
                compileCollectionContract({
                  formatVersion: published.formatVersion,
                  validationProfile: published.validationProfile,
                  currencyRegistryProfile: published.currencyRegistryProfile,
                  collectionApiKey: published.collectionApiKey,
                  fields: published.fields,
                }),
              ),
            });
            if (!responseWithinLimit(response)) return { kind: "too_large" as const };
            return { kind: "success" as const, response };
          }),
        catch: (cause) => databaseFailure("tooling.revision.get", cause),
      });
      if (result.kind === "not_found") {
        return yield* NotFoundFailure.make({ resource: "schema_revision" });
      }
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "too_large") return yield* ToolingResponseTooLargeFailure.make();
      if (result.kind !== "success") {
        return yield* NotFoundFailure.make({ resource: "schema_revision" });
      }
      return result.response;
    }),
  };
}

export class ToolingRepository extends Context.Tag("ToolingRepository")<
  ToolingRepository,
  ReturnType<typeof makeToolingRepository>
>() {}

export const ToolingRepositoryLive = Layer.succeed(ToolingRepository, makeToolingRepository());
