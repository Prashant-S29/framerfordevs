// Persists M9 Delivery configuration with tenant authorization, complete replacement, audit, and outbox atomicity.

import { db } from "@framerfordevs/db";
import { and, eq, inArray, sql } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionDeliveryField,
  cmsCollectionSchemaHead,
  cmsEntryLocaleDeliveryCurrentValue,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import { auditEvent, environment, projectCapability } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import {
  DeliveryCollectionConfiguration,
  DeliveryFieldCapability,
  type GetDeliveryConfigurationInput,
  type UpdateDeliveryConfigurationInput,
} from "../contracts/delivery";
import {
  CmsCapabilityRequiredFailure,
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  NotFoundFailure,
  PublishedSchemaRequiredFailure,
  SchemaInvalidFailure,
  VersionConflictFailure,
} from "../contracts/errors";
import type { AuthUserId } from "../contracts/platform";
import { SchemaValidationIssue } from "../contracts/schemas";
import type { ApplicationDb, ApplicationExecutor } from "./project-access";
import { authorizeUserProject } from "./project-access";

const supportedKinds = new Set([
  "short_text",
  "slug",
  "email",
  "enum",
  "number",
  "decimal",
  "boolean",
  "date",
  "date_time",
  "reference",
]);
const uniqueKinds = new Set([
  "short_text",
  "slug",
  "email",
  "enum",
  "number",
  "decimal",
  "date",
  "date_time",
  "reference",
]);

interface DeliveryConfigurationRow {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly collectionKey: string;
  readonly access: string;
  readonly version: number;
  readonly changedByUserId: string | null;
  readonly changedByCredentialId: string | null;
  readonly updatedAt: Date;
}

interface CurrentFieldRow {
  readonly fieldId: string;
  readonly fieldKey: string | null;
  readonly kind: string;
  readonly nodeRole: string;
}

interface ConfigurationScope {
  readonly collection: typeof cmsCollection.$inferSelect;
  readonly configuration: typeof cmsCollectionDeliveryConfig.$inferSelect;
}

type ScopeOutcome =
  | { readonly kind: "success"; readonly scope: ConfigurationScope }
  | { readonly kind: "not_found" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "cms_required" }
  | { readonly kind: "invalid_state" };

function databaseFailure(operation: string, cause: unknown): DatabaseFailure {
  return DatabaseFailure.make({ operation, cause });
}

/** Finds a PostgreSQL constraint identifier through wrapped driver causes without exposing values. */
function hasConstraint(cause: unknown, constraints: ReadonlySet<string>, depth = 0): boolean {
  if (depth > 4 || typeof cause !== "object" || cause === null) return false;
  const constraint = Reflect.get(cause, "constraint");
  const nestedCause = Reflect.get(cause, "cause");
  return (
    (typeof constraint === "string" && constraints.has(constraint)) ||
    (nestedCause !== undefined && hasConstraint(nestedCause, constraints, depth + 1))
  );
}

const deliveryUniqueConstraints = new Set([
  "cms_entry_locale_delivery_value_text_unique",
  "cms_entry_locale_delivery_value_number_unique",
  "cms_entry_locale_delivery_value_decimal_unique",
  "cms_entry_locale_delivery_value_date_unique",
  "cms_entry_locale_delivery_value_date_time_unique",
  "cms_entry_locale_delivery_value_reference_unique",
]);

/** Maps a race-safe unique-index rejection to value-free management guidance. */
function configurationPersistenceFailure(cause: unknown) {
  return hasConstraint(cause, deliveryUniqueConstraints)
    ? SchemaInvalidFailure.make({
        issues: [
          SchemaValidationIssue.make({
            path: "fields",
            code: "delivery_unique_value_conflict",
            message: "Current publications contain duplicate values for a requested unique field.",
          }),
        ],
      })
    : databaseFailure("delivery.configuration.update", cause);
}

/** Converts database timestamps and current field keys to the schema-backed management model. */
function configurationValue(
  row: DeliveryConfigurationRow,
  fields: ReadonlyArray<DeliveryFieldCapability>,
) {
  return {
    projectId: row.projectId,
    environmentId: row.environmentId,
    collectionId: row.collectionId,
    collectionKey: row.collectionKey,
    access: row.access,
    version: row.version,
    fields,
    updatedByUserId: row.changedByUserId,
    updatedByCredentialId: row.changedByCredentialId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Decodes repository output at the persistence boundary. */
function decodeConfiguration(
  row: DeliveryConfigurationRow,
  fields: ReadonlyArray<DeliveryFieldCapability>,
) {
  return Schema.decodeUnknown(DeliveryCollectionConfiguration)(
    configurationValue(row, fields),
  ).pipe(Effect.mapError((cause) => databaseFailure("delivery.configuration.decode", cause)));
}

/** Loads one exact environment and requires enabled CMS authority. */
async function authorizeEnvironment(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  input: GetDeliveryConfigurationInput,
): Promise<ScopeOutcome> {
  const authorization = await authorizeUserProject(
    executor,
    actorId,
    input.projectId,
    "delivery.configure",
  );
  if (authorization.kind === "not_found") return { kind: "not_found" };
  if (authorization.kind === "forbidden") return { kind: "forbidden" };
  if (authorization.access.project.archivedAt !== null) return { kind: "invalid_state" };

  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.projectId, input.projectId),
        eq(environment.workspaceId, authorization.access.project.workspaceId),
      ),
    )
    .limit(1);
  if (environmentRow === undefined) return { kind: "not_found" };

  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, authorization.access.project.workspaceId),
        eq(projectCapability.projectId, input.projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  if (capability === undefined) return { kind: "cms_required" };

  const [row] = await executor
    .select({ collection: cmsCollection, configuration: cmsCollectionDeliveryConfig })
    .from(cmsCollection)
    .innerJoin(
      cmsCollectionDeliveryConfig,
      and(
        eq(cmsCollectionDeliveryConfig.collectionId, cmsCollection.id),
        eq(cmsCollectionDeliveryConfig.environmentId, cmsCollection.environmentId),
        eq(cmsCollectionDeliveryConfig.projectId, cmsCollection.projectId),
        eq(cmsCollectionDeliveryConfig.workspaceId, cmsCollection.workspaceId),
      ),
    )
    .where(
      and(
        eq(cmsCollection.id, input.collectionId),
        eq(cmsCollection.projectId, input.projectId),
        eq(cmsCollection.environmentId, input.environmentId),
        eq(cmsCollection.workspaceId, authorization.access.project.workspaceId),
      ),
    )
    .limit(1);
  return row === undefined ? { kind: "not_found" } : { kind: "success", scope: row };
}

/** Maps scope outcomes without revealing cross-tenant resource existence. */
function scopeFailure(outcome: Exclude<ScopeOutcome, { readonly kind: "success" }>) {
  if (outcome.kind === "forbidden") return ForbiddenFailure.make();
  if (outcome.kind === "cms_required") return CmsCapabilityRequiredFailure.make();
  if (outcome.kind === "invalid_state") return InvalidStateTransitionFailure.make();
  return NotFoundFailure.make({ resource: "collection" });
}

/** Loads configured fields through the current published revision so API-key renames remain current. */
async function loadConfigurationRows(
  executor: ApplicationExecutor,
  scope: ConfigurationScope,
): Promise<ReadonlyArray<DeliveryFieldCapability>> {
  return executor
    .select({
      fieldId: cmsCollectionDeliveryField.fieldId,
      fieldKey: cmsSchemaRevisionField.apiKey,
      kind: cmsSchemaRevisionField.kind,
      filterable: cmsCollectionDeliveryField.filterable,
      sortable: cmsCollectionDeliveryField.sortable,
      uniqueLookup: cmsCollectionDeliveryField.uniqueLookup,
    })
    .from(cmsCollectionDeliveryField)
    .innerJoin(
      cmsCollectionSchemaHead,
      and(
        eq(cmsCollectionSchemaHead.collectionId, cmsCollectionDeliveryField.collectionId),
        eq(cmsCollectionSchemaHead.environmentId, cmsCollectionDeliveryField.environmentId),
        eq(cmsCollectionSchemaHead.projectId, cmsCollectionDeliveryField.projectId),
        eq(cmsCollectionSchemaHead.workspaceId, cmsCollectionDeliveryField.workspaceId),
      ),
    )
    .innerJoin(
      cmsSchemaRevisionField,
      and(
        eq(cmsSchemaRevisionField.revisionId, cmsCollectionSchemaHead.currentPublishedRevisionId),
        eq(cmsSchemaRevisionField.fieldId, cmsCollectionDeliveryField.fieldId),
        eq(cmsSchemaRevisionField.collectionId, cmsCollectionDeliveryField.collectionId),
        eq(cmsSchemaRevisionField.environmentId, cmsCollectionDeliveryField.environmentId),
        eq(cmsSchemaRevisionField.projectId, cmsCollectionDeliveryField.projectId),
        eq(cmsSchemaRevisionField.workspaceId, cmsCollectionDeliveryField.workspaceId),
      ),
    )
    .where(eq(cmsCollectionDeliveryField.collectionId, scope.collection.id))
    .orderBy(cmsSchemaRevisionField.position, cmsSchemaRevisionField.fieldId)
    .then((rows) =>
      rows.map((row) =>
        Schema.decodeUnknownSync(DeliveryFieldCapability)({
          fieldId: row.fieldId,
          fieldKey: row.fieldKey,
          kind: row.kind,
          filterable: row.filterable,
          sortable: row.sortable,
          uniqueLookup: row.uniqueLookup,
        }),
      ),
    );
}

/** Loads the exact current published root fields used as configuration authority. */
async function loadCurrentFields(
  executor: ApplicationExecutor,
  scope: ConfigurationScope,
): Promise<ReadonlyArray<CurrentFieldRow> | null> {
  const [head] = await executor
    .select({ revisionId: cmsCollectionSchemaHead.currentPublishedRevisionId })
    .from(cmsCollectionSchemaHead)
    .where(eq(cmsCollectionSchemaHead.collectionId, scope.collection.id))
    .limit(1);
  if (head?.revisionId === null || head?.revisionId === undefined) return null;
  return executor
    .select({
      fieldId: cmsSchemaRevisionField.fieldId,
      fieldKey: cmsSchemaRevisionField.apiKey,
      kind: cmsSchemaRevisionField.kind,
      nodeRole: cmsSchemaRevisionField.nodeRole,
    })
    .from(cmsSchemaRevisionField)
    .where(
      and(
        eq(cmsSchemaRevisionField.revisionId, head.revisionId),
        eq(cmsSchemaRevisionField.collectionId, scope.collection.id),
      ),
    );
}

/** Produces bounded value-free configuration issues against current schema and projection kinds. */
async function validateCapabilities(
  executor: ApplicationExecutor,
  scope: ConfigurationScope,
  requested: ReadonlyArray<DeliveryFieldCapability>,
): Promise<ReadonlyArray<SchemaValidationIssue> | null> {
  const currentFields = await loadCurrentFields(executor, scope);
  if (currentFields === null) return null;
  const currentById = new Map(currentFields.map((field) => [field.fieldId, field]));
  const requestedIds = requested.map((field) => field.fieldId);
  const projectedKinds =
    requestedIds.length === 0
      ? []
      : await executor
          .select({
            fieldId: cmsEntryLocaleDeliveryCurrentValue.fieldId,
            kind: cmsEntryLocaleDeliveryCurrentValue.valueKind,
          })
          .from(cmsEntryLocaleDeliveryCurrentValue)
          .where(
            and(
              eq(cmsEntryLocaleDeliveryCurrentValue.collectionId, scope.collection.id),
              inArray(cmsEntryLocaleDeliveryCurrentValue.fieldId, requestedIds),
            ),
          )
          .groupBy(
            cmsEntryLocaleDeliveryCurrentValue.fieldId,
            cmsEntryLocaleDeliveryCurrentValue.valueKind,
          );
  const projectedByField = new Map<string, Set<string>>();
  for (const row of projectedKinds) {
    const kinds = projectedByField.get(row.fieldId) ?? new Set<string>();
    kinds.add(row.kind);
    projectedByField.set(row.fieldId, kinds);
  }

  const issues: Array<SchemaValidationIssue> = [];
  for (const capability of requested) {
    const field = currentById.get(capability.fieldId);
    const path = `fields.${capability.fieldKey}`;
    if (
      field === undefined ||
      field.nodeRole !== "root" ||
      field.fieldKey === null ||
      !supportedKinds.has(field.kind)
    ) {
      issues.push(
        SchemaValidationIssue.make({
          path,
          code: "delivery_capability_field_unsupported",
          message: "Select a supported root scalar from the current published schema.",
        }),
      );
      continue;
    }
    if (field.fieldKey !== capability.fieldKey || field.kind !== capability.kind) {
      issues.push(
        SchemaValidationIssue.make({
          path,
          code: "delivery_capability_field_stale",
          message: "Refresh the current published schema field identity and try again.",
        }),
      );
      continue;
    }
    if (capability.uniqueLookup && !uniqueKinds.has(field.kind)) {
      issues.push(
        SchemaValidationIssue.make({
          path,
          code: "delivery_unique_kind_unsupported",
          message: "Unique lookup is not supported for this field kind.",
        }),
      );
    }
    const staleKinds = projectedByField.get(field.fieldId);
    if (staleKinds !== undefined && [...staleKinds].some((kind) => kind !== field.kind)) {
      issues.push(
        SchemaValidationIssue.make({
          path,
          code: "delivery_projection_kind_incompatible",
          message:
            "Remove the capability, publish the schema, republish affected locales, then enable it again.",
        }),
      );
    }
    if (issues.length >= 50) break;
  }
  return issues;
}

/** Compares complete normalized configuration sets without depending on input ordering. */
function sameConfiguration(
  current: ConfigurationScope["configuration"],
  currentFields: ReadonlyArray<DeliveryFieldCapability>,
  input: UpdateDeliveryConfigurationInput,
): boolean {
  if (current.access !== input.access || currentFields.length !== input.fields.length) return false;
  const normalize = (fields: ReadonlyArray<DeliveryFieldCapability>) =>
    fields
      .map((field) =>
        [
          field.fieldId,
          field.fieldKey,
          field.kind,
          field.filterable,
          field.sortable,
          field.uniqueLookup,
        ].join(":"),
      )
      .sort();
  return JSON.stringify(normalize(currentFields)) === JSON.stringify(normalize(input.fields));
}

export interface DeliveryRepositoryService {
  readonly getConfiguration: (
    actorId: AuthUserId,
    input: GetDeliveryConfigurationInput,
  ) => Effect.Effect<
    DeliveryCollectionConfiguration,
    | NotFoundFailure
    | ForbiddenFailure
    | CmsCapabilityRequiredFailure
    | InvalidStateTransitionFailure
    | DatabaseFailure
  >;
  readonly updateConfiguration: (
    actorId: AuthUserId,
    input: UpdateDeliveryConfigurationInput,
    now: Date,
    requestId: string,
  ) => Effect.Effect<
    DeliveryCollectionConfiguration,
    | NotFoundFailure
    | ForbiddenFailure
    | CmsCapabilityRequiredFailure
    | InvalidStateTransitionFailure
    | PublishedSchemaRequiredFailure
    | SchemaInvalidFailure
    | VersionConflictFailure
    | DatabaseFailure
  >;
}

/** Creates the production repository against the shared Drizzle pool. */
export function makeDeliveryRepository(database: ApplicationDb = db): DeliveryRepositoryService {
  return {
    getConfiguration: Effect.fn("DeliveryRepository.getConfiguration")(function* (actorId, input) {
      const loaded = yield* Effect.tryPromise({
        try: async () => {
          const outcome = await authorizeEnvironment(database, actorId, input);
          if (outcome.kind !== "success") return outcome;
          const fields = await loadConfigurationRows(database, outcome.scope);
          return { kind: "success" as const, scope: outcome.scope, fields };
        },
        catch: (cause) => databaseFailure("delivery.configuration.get", cause),
      });
      if (loaded.kind !== "success") return yield* scopeFailure(loaded);
      return yield* decodeConfiguration(
        {
          ...loaded.scope.configuration,
          collectionKey: loaded.scope.collection.apiKey,
        },
        loaded.fields,
      );
    }),

    updateConfiguration: Effect.fn("DeliveryRepository.updateConfiguration")(
      function* (actorId, input, now, requestId) {
        const result = yield* Effect.tryPromise({
          try: () =>
            database.transaction(async (transaction) => {
              await transaction.execute(
                sql`select id from project where id = ${input.projectId} for share`,
              );
              const authorized = await authorizeEnvironment(transaction, actorId, input);
              if (authorized.kind !== "success") return authorized;
              const [locked] = await transaction
                .select({ id: cmsCollection.id })
                .from(cmsCollection)
                .where(eq(cmsCollection.id, input.collectionId))
                .for("update")
                .limit(1);
              if (locked === undefined) return { kind: "not_found" as const };

              const currentFields = await loadConfigurationRows(transaction, authorized.scope);
              if (authorized.scope.configuration.version !== input.expectedVersion) {
                return { kind: "version_conflict" as const };
              }
              if (
                authorized.scope.configuration.access === "protected" &&
                input.access === "public" &&
                !input.publicAccessAcknowledged
              ) {
                return {
                  kind: "invalid" as const,
                  issues: [
                    SchemaValidationIssue.make({
                      path: "publicAccessAcknowledged",
                      code: "delivery_public_access_acknowledgement_required",
                      message: "Confirm that external caches and downloads cannot be revoked.",
                    }),
                  ],
                };
              }
              const issues = await validateCapabilities(
                transaction,
                authorized.scope,
                input.fields,
              );
              if (issues === null) return { kind: "published_schema_required" as const };
              if (issues.length > 0) return { kind: "invalid" as const, issues };
              if (sameConfiguration(authorized.scope.configuration, currentFields, input)) {
                return {
                  kind: "success" as const,
                  scope: authorized.scope,
                  fields: currentFields,
                };
              }

              const nextVersion = authorized.scope.configuration.version + 1;
              const updated = await transaction
                .update(cmsCollectionDeliveryConfig)
                .set({
                  access: input.access,
                  version: nextVersion,
                  changedByUserId: actorId,
                  changedByCredentialId: null,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(cmsCollectionDeliveryConfig.collectionId, input.collectionId),
                    eq(cmsCollectionDeliveryConfig.version, input.expectedVersion),
                  ),
                )
                .returning();
              if (updated.length !== 1) return { kind: "version_conflict" as const };
              await transaction
                .delete(cmsCollectionDeliveryField)
                .where(eq(cmsCollectionDeliveryField.collectionId, input.collectionId));
              if (input.fields.length > 0) {
                await transaction.insert(cmsCollectionDeliveryField).values(
                  input.fields.map((field) => ({
                    collectionId: input.collectionId,
                    fieldId: field.fieldId,
                    workspaceId: authorized.scope.collection.workspaceId,
                    projectId: input.projectId,
                    environmentId: input.environmentId,
                    filterable: field.filterable,
                    sortable: field.sortable,
                    uniqueLookup: field.uniqueLookup,
                  })),
                );
              }
              await transaction
                .update(cmsEntryLocaleDeliveryCurrentValue)
                .set({ uniqueLookup: false })
                .where(
                  and(
                    eq(cmsEntryLocaleDeliveryCurrentValue.collectionId, input.collectionId),
                    eq(cmsEntryLocaleDeliveryCurrentValue.uniqueLookup, true),
                  ),
                );
              const uniqueFieldIds = input.fields
                .filter((field) => field.uniqueLookup)
                .map((field) => field.fieldId);
              if (uniqueFieldIds.length > 0) {
                await transaction
                  .update(cmsEntryLocaleDeliveryCurrentValue)
                  .set({ uniqueLookup: true })
                  .where(
                    and(
                      eq(cmsEntryLocaleDeliveryCurrentValue.collectionId, input.collectionId),
                      inArray(cmsEntryLocaleDeliveryCurrentValue.fieldId, uniqueFieldIds),
                    ),
                  );
              }
              await transaction.insert(auditEvent).values({
                workspaceId: authorized.scope.collection.workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                actorType: "user",
                actorId,
                action: "cms.collection.delivery_config.updated",
                resourceType: "cms_collection",
                resourceId: input.collectionId,
                requestId,
                occurredAt: now,
              });
              await transaction.insert(outboxEvent).values({
                workspaceId: authorized.scope.collection.workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                eventType: "cms.collection.delivery_config.updated",
                subjectType: "cms.collection",
                subjectId: input.collectionId,
                schemaRevisionId: null,
                aggregateSequence: nextVersion,
                payload: {
                  version: 1,
                  projectId: input.projectId,
                  environmentId: input.environmentId,
                  collectionId: input.collectionId,
                  configVersion: nextVersion,
                  access: input.access,
                  fieldIds: input.fields.map((field) => field.fieldId).sort(),
                  invalidationTags: [
                    `project:${input.projectId}`,
                    `environment:${input.environmentId}`,
                    `collection:${input.collectionId}`,
                  ],
                },
                occurredAt: now,
                availableAt: now,
              });
              const configuration = updated[0];
              if (configuration === undefined)
                throw new Error("Delivery configuration update vanished.");
              return {
                kind: "success" as const,
                scope: {
                  collection: authorized.scope.collection,
                  configuration,
                },
                fields: input.fields,
              };
            }),
          catch: configurationPersistenceFailure,
        });
        if (
          result.kind === "not_found" ||
          result.kind === "forbidden" ||
          result.kind === "cms_required" ||
          result.kind === "invalid_state"
        ) {
          return yield* scopeFailure(result);
        }
        if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
        if (result.kind === "published_schema_required") {
          return yield* PublishedSchemaRequiredFailure.make();
        }
        if (result.kind === "invalid")
          return yield* SchemaInvalidFailure.make({ issues: result.issues });
        return yield* decodeConfiguration(
          {
            ...result.scope.configuration,
            collectionKey: result.scope.collection.apiKey,
          },
          result.fields,
        );
      },
    ),
  };
}

export class DeliveryRepository extends Context.Tag("DeliveryRepository")<
  DeliveryRepository,
  DeliveryRepositoryService
>() {}

export const DeliveryRepositoryLive = Layer.succeed(DeliveryRepository, makeDeliveryRepository());
