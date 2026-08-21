// Persists exact-locale publication heads and immutable delivery artifacts atomically.

import { createHash } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, desc, eq, inArray, lt, or, sql } from "@framerfordevs/db/query";
import {
  cmsCollectionDeliveryField,
  cmsCollectionLocaleDeliveryState,
  cmsCollectionSchemaHead,
  cmsEntry,
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
import { auditEvent, environment, projectCapability } from "@framerfordevs/db/schema/platform";
import { cmsInvalidationRouteMapping } from "@framerfordevs/db/schema/webhooks";
import { Context, Effect, Layer, Schema } from "effect";

import { ApiErrorDetail } from "../contracts/api-response";
import type { EntryValues } from "../contracts/entries";
import {
  CmsCapabilityRequiredFailure,
  DatabaseFailure,
  EntryCommandConflictFailure,
  EntryPublicationConflictFailure,
  EntryPublicationInvalidFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  PublishedSchemaRequiredFailure,
} from "../contracts/errors";
import { decodePublicationCursor, encodePublicationCursor } from "../contracts/publication-cursor";
import {
  EntryPublicationPage,
  EntryPublicationPlan,
  EntryPublicationStatus,
  EntryPublicationSummary,
  EntryPublicationValidationIssue,
  EntryPublicationId,
  EntryPublicationSequence,
  PublishEntryResult,
  UnpublishEntryResult,
  type GetEntryPublicationStatusInput,
  type ListEntryPublicationsInput,
  type PublishEntryInput,
  type UnpublishEntryInput,
  type ValidateEntryPublicationInput,
} from "../contracts/publications";
import type { AuthUserId } from "../contracts/platform";
import {
  CollectionFieldDefinition,
  CollectionFieldId,
  defaultFieldEditorMetadata,
  type CollectionFieldDefinition as CollectionField,
} from "../contracts/schemas";
import { reconstructFieldTree } from "../lib/field-tree";
import {
  compilePublicationSnapshot,
  type CompilePublicationSnapshotInput,
  type PublicationCompilationIssue,
  type PublicationReferenceUse,
  type ResolvedPublicationReference,
} from "../lib/publication-snapshot";
import { compileDeliveryProjections, type DeliveryProjectionRow } from "../lib/delivery-projection";
import { canonicalizeEntryValue } from "../lib/entry-values";
import { matchInvalidationMappings } from "../lib/invalidation-mappings";
import type { ApplicationDb, ApplicationExecutor, ApplicationTransaction } from "./project-access";
import { authorizeUserProject, selectUserProjectAccess } from "./project-access";
import { PublicationEngine } from "./publication-engine";
import { hashSchemaContract } from "./schema-engine";

function outcome<K extends string>(kind: K): { readonly kind: K } {
  return { kind };
}

function withValue<K extends string, A extends object>(
  kind: K,
  value: A,
): { readonly kind: K } & A {
  return { kind, ...value };
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function toIso(value: Date): string {
  return value.toISOString();
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalizeEntryValue(value)).digest("hex");
}

const deliveryUniqueConstraints = new Set([
  "cms_entry_locale_delivery_value_text_unique",
  "cms_entry_locale_delivery_value_number_unique",
  "cms_entry_locale_delivery_value_decimal_unique",
  "cms_entry_locale_delivery_value_date_unique",
  "cms_entry_locale_delivery_value_date_time_unique",
  "cms_entry_locale_delivery_value_reference_unique",
]);

/** Finds a known PostgreSQL constraint through bounded wrapped causes. */
function hasConstraint(cause: unknown, constraints: ReadonlySet<string>, depth = 0): boolean {
  if (depth > 4 || typeof cause !== "object" || cause === null) return false;
  const constraint = Reflect.get(cause, "constraint");
  const nestedCause = Reflect.get(cause, "cause");
  return (
    (typeof constraint === "string" && constraints.has(constraint)) ||
    (nestedCause !== undefined && hasConstraint(nestedCause, constraints, depth + 1))
  );
}

/** Maps the final race-safe unique authority without exposing the conflicting value. */
function publicationPersistenceFailure(operation: string, cause: unknown) {
  return hasConstraint(cause, deliveryUniqueConstraints)
    ? EntryPublicationInvalidFailure.make({
        issues: [
          EntryPublicationValidationIssue.make({
            fieldId: null,
            path: "data",
            code: "delivery_unique_value_conflict",
            message: "A current publication already claims this configured unique value.",
          }),
        ],
      })
    : databaseFailure(operation, cause);
}

/** Converts one pure typed projection into exactly one populated database value column. */
function projectionInsertValue(options: {
  readonly row: DeliveryProjectionRow;
  readonly publicationId: string;
  readonly entry: typeof cmsEntry.$inferSelect;
  readonly localeId: string;
}): typeof cmsEntryLocaleDeliveryCurrentValue.$inferInsert {
  const common = {
    entryId: options.entry.id,
    localeId: options.localeId,
    fieldId: options.row.fieldId,
    publicationId: options.publicationId,
    workspaceId: options.entry.workspaceId,
    projectId: options.entry.projectId,
    environmentId: options.entry.environmentId,
    collectionId: options.entry.collectionId,
    valueKind: options.row.kind,
    uniqueLookup: options.row.uniqueLookup,
  };
  if (
    options.row.kind === "short_text" ||
    options.row.kind === "slug" ||
    options.row.kind === "email" ||
    options.row.kind === "enum"
  ) {
    return { ...common, textValue: String(options.row.value) };
  }
  if (options.row.kind === "number") return { ...common, numberValue: Number(options.row.value) };
  if (options.row.kind === "decimal") return { ...common, decimalValue: String(options.row.value) };
  if (options.row.kind === "boolean") {
    return { ...common, booleanValue: options.row.value === true };
  }
  if (options.row.kind === "date") return { ...common, dateValue: String(options.row.value) };
  if (options.row.kind === "date_time") {
    return { ...common, dateTimeValue: String(options.row.value) };
  }
  return { ...common, referenceValue: String(options.row.value) };
}

/** Serializes potential unique claims in deterministic digest order before index enforcement. */
async function lockUniqueDeliveryClaims(
  transaction: ApplicationTransaction,
  rows: ReadonlyArray<DeliveryProjectionRow>,
  scope: { readonly collectionId: string; readonly localeId: string },
): Promise<void> {
  const claims = rows
    .filter((row) => row.uniqueLookup)
    .map((row) =>
      createHash("sha256")
        .update(
          canonicalizeEntryValue([
            scope.collectionId,
            scope.localeId,
            row.fieldId,
            row.kind,
            row.value,
          ]),
        )
        .digest("hex"),
    )
    .sort();
  for (const claim of claims) {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${claim}, 0))`);
  }
}

/** Increments the conservative collection-locale traversal generation once per state change. */
async function incrementDeliveryGeneration(
  transaction: ApplicationTransaction,
  options: {
    readonly entry: typeof cmsEntry.$inferSelect;
    readonly localeId: string;
    readonly now: Date;
  },
): Promise<void> {
  await transaction
    .insert(cmsCollectionLocaleDeliveryState)
    .values({
      collectionId: options.entry.collectionId,
      localeId: options.localeId,
      workspaceId: options.entry.workspaceId,
      projectId: options.entry.projectId,
      environmentId: options.entry.environmentId,
      generation: 1n,
      lastChangedAt: options.now,
    })
    .onConflictDoUpdate({
      target: [
        cmsCollectionLocaleDeliveryState.collectionId,
        cmsCollectionLocaleDeliveryState.localeId,
      ],
      set: {
        generation: sql`${cmsCollectionLocaleDeliveryState.generation} + 1`,
        lastChangedAt: options.now,
      },
    });
}

function entryValues(value: unknown): EntryValues {
  return Schema.decodeUnknownSync(Schema.Record({ key: Schema.UUID, value: Schema.Unknown }))(
    value,
  );
}

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

interface PublicationContract {
  readonly revision: typeof cmsSchemaRevision.$inferSelect;
  readonly fields: ReadonlyArray<CollectionField>;
  readonly contractHash: string;
}

async function loadPublishedContract(
  executor: ApplicationExecutor,
  input: {
    readonly projectId: string;
    readonly environmentId: string;
    readonly collectionId: string;
  },
): Promise<PublicationContract | null | undefined> {
  const [head] = await executor
    .select({
      revisionId: cmsCollectionSchemaHead.currentPublishedRevisionId,
      workspaceId: cmsCollectionSchemaHead.workspaceId,
    })
    .from(cmsCollectionSchemaHead)
    .where(
      and(
        eq(cmsCollectionSchemaHead.collectionId, input.collectionId),
        eq(cmsCollectionSchemaHead.projectId, input.projectId),
        eq(cmsCollectionSchemaHead.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!head) return undefined;
  if (head.revisionId === null) return null;
  const [revision] = await executor
    .select()
    .from(cmsSchemaRevision)
    .where(
      and(
        eq(cmsSchemaRevision.id, head.revisionId),
        eq(cmsSchemaRevision.workspaceId, head.workspaceId),
        eq(cmsSchemaRevision.projectId, input.projectId),
        eq(cmsSchemaRevision.environmentId, input.environmentId),
        eq(cmsSchemaRevision.collectionId, input.collectionId),
      ),
    )
    .limit(1);
  if (!revision) throw new Error("Published schema head does not resolve to a revision.");
  const rows = await executor
    .select()
    .from(cmsSchemaRevisionField)
    .where(
      and(
        eq(cmsSchemaRevisionField.revisionId, revision.id),
        eq(cmsSchemaRevisionField.workspaceId, head.workspaceId),
        eq(cmsSchemaRevisionField.projectId, input.projectId),
        eq(cmsSchemaRevisionField.environmentId, input.environmentId),
        eq(cmsSchemaRevisionField.collectionId, input.collectionId),
      ),
    )
    .orderBy(
      cmsSchemaRevisionField.parentFieldId,
      cmsSchemaRevisionField.position,
      cmsSchemaRevisionField.fieldId,
    );
  const tree = reconstructFieldTree(rows.map(fieldValue));
  if (!tree.valid) throw new Error("Published field tree is invalid.");
  return {
    revision,
    fields: tree.roots,
    contractHash: hashSchemaContract({
      formatVersion: revision.formatVersion,
      validationProfile: revision.validationProfile,
      currencyRegistryProfile: revision.currencyRegistryProfile,
      collectionApiKey: revision.collectionApiKey,
      fields: tree.roots,
    }),
  };
}

interface ScopeAccess {
  readonly workspaceId: string;
  readonly role: string;
  readonly locale: typeof projectLocale.$inferSelect;
}

async function authorizeScope(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  input: { readonly projectId: string; readonly environmentId: string; readonly locale: string },
  action: "content.read" | "content.publish",
) {
  const access = await selectUserProjectAccess(executor, actorId, input.projectId);
  if (!access) return outcome("not_found");
  const [locale] = await executor
    .select()
    .from(projectLocale)
    .where(
      and(
        eq(projectLocale.workspaceId, access.project.workspaceId),
        eq(projectLocale.projectId, input.projectId),
        sql`lower(${projectLocale.tag}) = lower(${input.locale})`,
        eq(projectLocale.status, "enabled"),
      ),
    )
    .limit(1);
  if (!locale) return outcome("locale_unavailable");
  const authorization = await authorizeUserProject(
    executor,
    actorId,
    input.projectId,
    action,
    locale.id,
  );
  if (authorization.kind === "not_found") return outcome("not_found");
  if (authorization.kind === "forbidden") return outcome("forbidden");
  if (authorization.access.project.archivedAt) return outcome("invalid_state");
  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.workspaceId, access.project.workspaceId),
        eq(environment.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (!environmentRow) return outcome("not_found");
  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, access.project.workspaceId),
        eq(projectCapability.projectId, input.projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  if (!capability) return outcome("cms_required");
  return withValue("success", {
    access: {
      workspaceId: access.project.workspaceId,
      role: access.role,
      locale,
    } satisfies ScopeAccess,
  });
}

async function allocatePublicationId(executor: ApplicationExecutor): Promise<string> {
  const result = await executor.execute(sql`select uuidv7()::text as id`);
  const decoded = Schema.decodeUnknownSync(
    Schema.Struct({ rows: Schema.Array(Schema.Struct({ id: Schema.String })) }),
  )(result);
  const row = decoded.rows[0];
  if (!row) throw new Error("Publication identity allocation returned no row.");
  return row.id;
}

async function lockProjectShared(executor: ApplicationExecutor, projectId: string) {
  await executor.execute(sql`select id from project where id = ${projectId} for share`);
}

async function lockCollectionShared(executor: ApplicationExecutor, collectionId: string) {
  await executor.execute(sql`select id from cms_collection where id = ${collectionId} for share`);
}

async function lockEntry(executor: ApplicationExecutor, entryId: string) {
  await executor.execute(sql`select id from cms_entry where id = ${entryId} for update`);
}

async function selectEntry(
  executor: ApplicationExecutor,
  workspaceId: string,
  input: {
    readonly projectId: string;
    readonly environmentId: string;
    readonly collectionId: string;
    readonly entryId: string;
  },
) {
  const [row] = await executor
    .select()
    .from(cmsEntry)
    .where(
      and(
        eq(cmsEntry.id, input.entryId),
        eq(cmsEntry.workspaceId, workspaceId),
        eq(cmsEntry.projectId, input.projectId),
        eq(cmsEntry.environmentId, input.environmentId),
        eq(cmsEntry.collectionId, input.collectionId),
      ),
    )
    .limit(1);
  return row;
}

async function loadSources(
  executor: ApplicationExecutor,
  entry: typeof cmsEntry.$inferSelect,
  localeId: string,
  lock: boolean,
) {
  const sharedQuery = executor
    .select()
    .from(cmsEntrySharedDraft)
    .where(
      and(
        eq(cmsEntrySharedDraft.entryId, entry.id),
        eq(cmsEntrySharedDraft.workspaceId, entry.workspaceId),
        eq(cmsEntrySharedDraft.projectId, entry.projectId),
        eq(cmsEntrySharedDraft.environmentId, entry.environmentId),
        eq(cmsEntrySharedDraft.collectionId, entry.collectionId),
      ),
    );
  const localeQuery = executor
    .select()
    .from(cmsEntryLocaleDraft)
    .where(
      and(
        eq(cmsEntryLocaleDraft.entryId, entry.id),
        eq(cmsEntryLocaleDraft.localeId, localeId),
        eq(cmsEntryLocaleDraft.workspaceId, entry.workspaceId),
        eq(cmsEntryLocaleDraft.projectId, entry.projectId),
        eq(cmsEntryLocaleDraft.environmentId, entry.environmentId),
        eq(cmsEntryLocaleDraft.collectionId, entry.collectionId),
      ),
    );
  const [sharedHead] = await (lock ? sharedQuery.for("share") : sharedQuery).limit(1);
  const [localeHead] = await (lock ? localeQuery.for("share") : localeQuery).limit(1);
  const [sharedRevision] = sharedHead
    ? await executor
        .select()
        .from(cmsEntrySharedRevision)
        .where(
          and(
            eq(cmsEntrySharedRevision.id, sharedHead.currentRevisionId),
            eq(cmsEntrySharedRevision.entryId, entry.id),
            eq(cmsEntrySharedRevision.workspaceId, entry.workspaceId),
            eq(cmsEntrySharedRevision.projectId, entry.projectId),
            eq(cmsEntrySharedRevision.environmentId, entry.environmentId),
            eq(cmsEntrySharedRevision.collectionId, entry.collectionId),
            eq(cmsEntrySharedRevision.sequence, sharedHead.version),
          ),
        )
        .limit(1)
    : [];
  const [localeRevision] = localeHead
    ? await executor
        .select()
        .from(cmsEntryLocaleRevision)
        .where(
          and(
            eq(cmsEntryLocaleRevision.id, localeHead.currentRevisionId),
            eq(cmsEntryLocaleRevision.entryId, entry.id),
            eq(cmsEntryLocaleRevision.localeId, localeId),
            eq(cmsEntryLocaleRevision.workspaceId, entry.workspaceId),
            eq(cmsEntryLocaleRevision.projectId, entry.projectId),
            eq(cmsEntryLocaleRevision.environmentId, entry.environmentId),
            eq(cmsEntryLocaleRevision.collectionId, entry.collectionId),
            eq(cmsEntryLocaleRevision.sequence, localeHead.version),
          ),
        )
        .limit(1)
    : [];
  return {
    sharedVersion: sharedHead?.version ?? 0,
    sharedRevisionId: sharedRevision?.id ?? null,
    sharedValues: entryValues(sharedRevision?.values ?? {}),
    localizedVersion: localeHead?.version ?? 0,
    localizedRevisionId: localeRevision?.id ?? null,
    localizedValues: entryValues(localeRevision?.values ?? {}),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectReferenceUses(
  fields: ReadonlyArray<CollectionField>,
  sharedValues: EntryValues,
  localizedValues: EntryValues,
): ReadonlyArray<PublicationReferenceUse> {
  const uses: Array<PublicationReferenceUse> = [];
  const visit = (
    field: CollectionField,
    shared: unknown,
    localized: unknown,
    path: string,
    inherited: "shared" | "localized" | null,
  ) => {
    const effective = inherited ?? field.localization;
    if (effective === "mixed" && field.kind === "object") {
      for (const child of field.children) {
        if (child.apiKey !== null)
          visit(
            child,
            isRecord(shared) ? Reflect.get(shared, child.id) : undefined,
            isRecord(localized) ? Reflect.get(localized, child.id) : undefined,
            `${path}.${child.apiKey}`,
            null,
          );
      }
      return;
    }
    const value = effective === "shared" ? shared : localized;
    if (field.kind === "reference" && typeof value === "string") {
      uses.push({
        sourceFieldId: field.id,
        path,
        targetCollectionId: field.configuration.targetCollectionId,
        targetEntryId: value,
      });
      return;
    }
    if (field.kind === "object" && isRecord(value)) {
      for (const child of field.children) {
        if (child.apiKey !== null)
          visit(
            child,
            Reflect.get(value, child.id),
            Reflect.get(value, child.id),
            `${path}.${child.apiKey}`,
            effective === "shared" || effective === "localized" ? effective : null,
          );
      }
      return;
    }
    const item = field.children[0];
    if (field.kind === "list" && item && Array.isArray(value)) {
      value.forEach((itemValue, index) =>
        visit(
          item,
          itemValue,
          itemValue,
          `${path}[${index}]`,
          effective === "shared" || effective === "localized" ? effective : null,
        ),
      );
    }
  };
  for (const field of fields) {
    if (field.apiKey !== null)
      visit(
        field,
        Reflect.get(sharedValues, field.id),
        Reflect.get(localizedValues, field.id),
        field.apiKey,
        null,
      );
  }
  return uses;
}

interface AvailableReferenceTarget {
  readonly collectionId: string;
  readonly entryId: string;
  readonly displayName: string | null;
}

interface ReferenceResolution {
  readonly references: ReadonlyArray<ResolvedPublicationReference>;
  readonly availableTargets: ReadonlyMap<string, AvailableReferenceTarget>;
}

async function resolveReferences(
  executor: ApplicationExecutor,
  options: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly environmentId: string;
    readonly localeId: string;
    readonly uses: ReadonlyArray<PublicationReferenceUse>;
  },
): Promise<ReferenceResolution> {
  const groups = new Map<string, Set<string>>();
  for (const use of options.uses) {
    const ids = groups.get(use.targetCollectionId) ?? new Set<string>();
    ids.add(use.targetEntryId);
    groups.set(use.targetCollectionId, ids);
  }
  if (groups.size === 0) return { references: [], availableTargets: new Map() };
  const groupConditions = [...groups.entries()].map(([collectionId, ids]) =>
    and(eq(cmsEntry.collectionId, collectionId), inArray(cmsEntry.id, [...ids].sort())),
  );
  const rows = await executor
    .select({
      targetCollectionId: cmsEntry.collectionId,
      targetEntryId: cmsEntry.id,
      targetDisplayName: cmsEntry.displayName,
      targetPublicationId: cmsEntryLocalePublication.id,
      targetPublicationSequence: cmsEntryLocalePublication.publicationSequence,
    })
    .from(cmsEntry)
    .leftJoin(
      cmsEntryLocalePublicationHead,
      and(
        eq(cmsEntryLocalePublicationHead.entryId, cmsEntry.id),
        eq(cmsEntryLocalePublicationHead.localeId, options.localeId),
        eq(cmsEntryLocalePublicationHead.workspaceId, cmsEntry.workspaceId),
        eq(cmsEntryLocalePublicationHead.projectId, cmsEntry.projectId),
        eq(cmsEntryLocalePublicationHead.environmentId, cmsEntry.environmentId),
        eq(cmsEntryLocalePublicationHead.collectionId, cmsEntry.collectionId),
        sql`${cmsEntryLocalePublicationHead.currentPublicationId} is not null`,
      ),
    )
    .leftJoin(
      cmsEntryLocalePublication,
      and(
        eq(cmsEntryLocalePublication.id, cmsEntryLocalePublicationHead.currentPublicationId),
        eq(cmsEntryLocalePublication.entryId, cmsEntry.id),
        eq(cmsEntryLocalePublication.localeId, options.localeId),
        eq(cmsEntryLocalePublication.workspaceId, cmsEntry.workspaceId),
        eq(cmsEntryLocalePublication.projectId, cmsEntry.projectId),
        eq(cmsEntryLocalePublication.environmentId, cmsEntry.environmentId),
        eq(cmsEntryLocalePublication.collectionId, cmsEntry.collectionId),
      ),
    )
    .where(
      and(
        eq(cmsEntry.workspaceId, options.workspaceId),
        eq(cmsEntry.projectId, options.projectId),
        eq(cmsEntry.environmentId, options.environmentId),
        or(...groupConditions),
      ),
    );
  const availableTargets = new Map<string, AvailableReferenceTarget>();
  const references: Array<ResolvedPublicationReference> = [];
  for (const row of rows) {
    availableTargets.set(`${row.targetCollectionId}:${row.targetEntryId}`, {
      collectionId: row.targetCollectionId,
      entryId: row.targetEntryId,
      displayName: row.targetDisplayName,
    });
    if (row.targetPublicationId !== null && row.targetPublicationSequence !== null) {
      references.push({
        targetCollectionId: row.targetCollectionId,
        targetEntryId: row.targetEntryId,
        targetPublicationId: row.targetPublicationId,
        targetPublicationSequence: row.targetPublicationSequence,
      });
    }
  }
  return { references, availableTargets };
}

async function loadHead(
  executor: ApplicationExecutor,
  entry: typeof cmsEntry.$inferSelect,
  localeId: string,
  lock: boolean,
) {
  const query = executor
    .select()
    .from(cmsEntryLocalePublicationHead)
    .where(
      and(
        eq(cmsEntryLocalePublicationHead.entryId, entry.id),
        eq(cmsEntryLocalePublicationHead.localeId, localeId),
        eq(cmsEntryLocalePublicationHead.workspaceId, entry.workspaceId),
        eq(cmsEntryLocalePublicationHead.projectId, entry.projectId),
        eq(cmsEntryLocalePublicationHead.environmentId, entry.environmentId),
        eq(cmsEntryLocalePublicationHead.collectionId, entry.collectionId),
      ),
    );
  const [head] = await (lock ? query.for("update") : query).limit(1);
  return head;
}

async function loadPublicationArtifact(
  executor: ApplicationExecutor,
  publicationId: string | null,
  entry: typeof cmsEntry.$inferSelect,
  localeId: string,
) {
  if (publicationId === null) return null;
  const [row] = await executor
    .select({ publication: cmsEntryLocalePublication, snapshot: cmsEntryLocaleDeliverySnapshot })
    .from(cmsEntryLocalePublication)
    .innerJoin(
      cmsEntryLocaleDeliverySnapshot,
      eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
    )
    .where(
      and(
        eq(cmsEntryLocalePublication.id, publicationId),
        eq(cmsEntryLocalePublication.entryId, entry.id),
        eq(cmsEntryLocalePublication.localeId, localeId),
        eq(cmsEntryLocalePublication.workspaceId, entry.workspaceId),
        eq(cmsEntryLocalePublication.projectId, entry.projectId),
        eq(cmsEntryLocalePublication.environmentId, entry.environmentId),
        eq(cmsEntryLocalePublication.collectionId, entry.collectionId),
      ),
    )
    .limit(1);
  return row ?? null;
}

function publicationSummary(
  row: {
    readonly publication: typeof cmsEntryLocalePublication.$inferSelect;
    readonly snapshot: typeof cmsEntryLocaleDeliverySnapshot.$inferSelect;
  },
  locale: typeof projectLocale.$inferSelect,
  current: boolean,
) {
  return Schema.decodeUnknownSync(EntryPublicationSummary)({
    id: row.publication.id,
    snapshotId: row.snapshot.publicationId,
    entryId: row.publication.entryId,
    localeId: row.publication.localeId,
    locale: locale.tag,
    sequence: row.publication.publicationSequence,
    schemaRevisionId: row.publication.schemaRevisionId,
    contractHash: row.publication.contractHash,
    sharedRevisionId: row.publication.sharedSourceRevisionId,
    sharedVersion: row.publication.sharedSourceVersion,
    localizedRevisionId: row.publication.localeSourceRevisionId,
    localizedVersion: row.publication.localeSourceVersion,
    contentHash: row.publication.contentHash,
    authorityHash: row.publication.authorityHash,
    documentHash: row.snapshot.documentHash,
    changedFieldIds: row.publication.changedFieldIds,
    size: {
      documentBytes: row.snapshot.canonicalDocumentBytes,
      referenceManifestBytes: row.snapshot.canonicalReferenceManifestBytes,
      combinedBytes: row.snapshot.canonicalCombinedBytes,
      maximumBytes: 1_048_576,
      bucket:
        row.snapshot.canonicalCombinedBytes <= 262_144
          ? "small"
          : row.snapshot.canonicalCombinedBytes <= 524_288
            ? "medium"
            : row.snapshot.canonicalCombinedBytes <= 786_432
              ? "large"
              : "near_limit",
    },
    publishedByUserId: row.publication.publishedByUserId,
    publishedAt: toIso(row.publication.publishedAt),
    current,
  });
}

function fieldVisibility(fields: ReadonlyArray<CollectionField>, role: string) {
  const ids = new Set<string>();
  const paths = new Map<string, boolean>();
  const visit = (field: CollectionField, parentVisible: boolean, path: string) => {
    const fieldVisible =
      parentVisible && field.editor.visibleToRoles.some((candidate) => candidate === role);
    if (fieldVisible) ids.add(field.id);
    paths.set(path, fieldVisible);
    for (const child of field.children) {
      const childPath = child.apiKey === null ? path : `${path}.${child.apiKey}`;
      visit(child, fieldVisible, childPath);
    }
  };
  for (const field of fields) {
    if (field.apiKey !== null) visit(field, true, field.apiKey);
  }
  return { ids, paths };
}

function pathIsVisible(path: string, paths: ReadonlyMap<string, boolean>): boolean {
  const normalized = path.replaceAll(/\[\d+\]/gu, "");
  let matchedPath = "";
  let visible = true;
  for (const [candidate, candidateVisible] of paths) {
    if (
      candidate.length >= matchedPath.length &&
      (normalized === candidate || normalized.startsWith(`${candidate}.`))
    ) {
      matchedPath = candidate;
      visible = candidateVisible;
    }
  }
  return visible;
}

function publicIssues(
  issues: ReadonlyArray<PublicationCompilationIssue>,
  fields: ReadonlyArray<CollectionField>,
  role: string,
  uses: ReadonlyArray<PublicationReferenceUse>,
  availableTargets: ReadonlyMap<string, AvailableReferenceTarget>,
) {
  const visibility = fieldVisibility(fields, role);
  const result: Array<{
    fieldId: string | null;
    path: string;
    code: string;
    message: string;
    target?: AvailableReferenceTarget;
  }> = [];
  let hidden = false;
  for (const issue of issues) {
    if (
      issue.fieldId !== null &&
      (!visibility.ids.has(issue.fieldId) || !pathIsVisible(issue.path, visibility.paths))
    ) {
      hidden = true;
      continue;
    }
    const use =
      issue.code === "reference_target_locale_unpublished"
        ? uses.find(
            (candidate) =>
              candidate.sourceFieldId === issue.fieldId && candidate.path === issue.path,
          )
        : undefined;
    const target = use
      ? availableTargets.get(`${use.targetCollectionId}:${use.targetEntryId}`)
      : undefined;
    result.push({ ...issue, ...(target ? { target } : {}) });
  }
  if (hidden && result.length < 50)
    result.push({
      fieldId: null,
      path: "data",
      code: "hidden_field_blocks_publication",
      message:
        "A field unavailable to your role blocks publication. Ask an authorized content or schema manager to resolve it.",
    });
  return result
    .slice(0, 50)
    .map((issue) => Schema.decodeUnknownSync(EntryPublicationValidationIssue)(issue));
}

interface AuthorityState {
  readonly entry: typeof cmsEntry.$inferSelect;
  readonly contract: PublicationContract;
  readonly sources: Awaited<ReturnType<typeof loadSources>>;
  readonly head: typeof cmsEntryLocalePublicationHead.$inferSelect | undefined;
  readonly current: Awaited<ReturnType<typeof loadPublicationArtifact>>;
  readonly resolvedReferences: ReadonlyArray<ResolvedPublicationReference>;
  readonly availableTargets: ReadonlyMap<string, AvailableReferenceTarget>;
  readonly uses: ReadonlyArray<PublicationReferenceUse>;
}

async function loadAuthority(
  executor: ApplicationExecutor,
  access: ScopeAccess,
  input: GetEntryPublicationStatusInput,
  lock: boolean,
  includeReferences: boolean,
): Promise<AuthorityState | { readonly missing: "collection" | "entry" | "schema" }> {
  const contract = await loadPublishedContract(executor, input);
  if (contract === undefined) return { missing: "collection" };
  if (contract === null) return { missing: "schema" };
  const entry = await selectEntry(executor, access.workspaceId, input);
  if (!entry) return { missing: "entry" };
  const sources = await loadSources(executor, entry, access.locale.id, lock);
  const head = await loadHead(executor, entry, access.locale.id, lock);
  const current = await loadPublicationArtifact(
    executor,
    head?.currentPublicationId ?? null,
    entry,
    access.locale.id,
  );
  const uses = includeReferences
    ? collectReferenceUses(contract.fields, sources.sharedValues, sources.localizedValues)
    : [];
  const resolution = includeReferences
    ? await resolveReferences(executor, {
        workspaceId: entry.workspaceId,
        projectId: entry.projectId,
        environmentId: entry.environmentId,
        localeId: access.locale.id,
        uses,
      })
    : { references: [], availableTargets: new Map<string, AvailableReferenceTarget>() };
  return {
    entry,
    contract,
    sources,
    head,
    current,
    resolvedReferences: resolution.references,
    availableTargets: resolution.availableTargets,
    uses,
  };
}

function previousData(
  current: AuthorityState["current"],
): Readonly<Record<string, unknown>> | null {
  if (!current) return null;
  const data = Reflect.get(current.snapshot.document, "data");
  return isRecord(data) ? data : null;
}

function compileAuthority(
  compile: (
    input: CompilePublicationSnapshotInput,
  ) => ReturnType<typeof compilePublicationSnapshot>,
  state: AuthorityState,
  access: ScopeAccess,
  options: { readonly publicationId: string; readonly sequence: number; readonly now: Date },
) {
  return compile({
    fields: state.contract.fields,
    sharedValues: state.sources.sharedValues,
    localizedValues: state.sources.localizedValues,
    resolvedReferences: state.resolvedReferences,
    authority: {
      sharedRevisionId: state.sources.sharedRevisionId,
      sharedVersion: state.sources.sharedVersion,
      localizedRevisionId: state.sources.localizedRevisionId,
      localizedVersion: state.sources.localizedVersion,
    },
    document: {
      entryId: state.entry.id,
      collectionId: state.entry.collectionId,
      locale: access.locale.tag,
      schemaRevisionId: state.contract.revision.id,
      contractHash: state.contract.contractHash,
      publicationId: options.publicationId,
      publicationSequence: options.sequence,
      publishedAt: toIso(options.now),
    },
    previousData: previousData(state.current),
  });
}

function conflictDetail(path: string, message: string) {
  return ApiErrorDetail.make({ path, code: "publication_authority_changed", message });
}

function authorityConflict(
  state: AuthorityState,
  input: PublishEntryInput,
): ReadonlyArray<ApiErrorDetail> {
  const details: Array<ApiErrorDetail> = [];
  const currentId = state.head?.currentPublicationId ?? null;
  if (
    (state.head?.version ?? 0) !== input.expectedStateVersion ||
    currentId !== input.expectedPublicationId
  )
    details.push(conflictDetail("expectedStateVersion", "The locale publication state changed."));
  if (
    state.contract.revision.id !== input.expectedSchemaRevisionId ||
    state.contract.contractHash !== input.expectedContractHash
  )
    details.push(conflictDetail("expectedSchemaRevisionId", "The published schema changed."));
  if (
    state.sources.sharedVersion !== input.expectedSharedVersion ||
    state.sources.sharedRevisionId !== input.expectedSharedRevisionId
  )
    details.push(conflictDetail("expectedSharedVersion", "The shared draft changed."));
  if (
    state.sources.localizedVersion !== input.expectedLocalizedVersion ||
    state.sources.localizedRevisionId !== input.expectedLocalizedRevisionId
  )
    details.push(conflictDetail("expectedLocalizedVersion", "The localized draft changed."));
  return details;
}

function planValue(
  state: AuthorityState,
  access: ScopeAccess,
  compiled: ReturnType<typeof compilePublicationSnapshot>,
) {
  const candidate = compiled.candidate;
  const currentAuthority = state.current?.publication.authorityHash ?? null;
  const visibleIssues = publicIssues(
    compiled.issues,
    state.contract.fields,
    access.role,
    state.uses,
    state.availableTargets,
  );
  const referencesWouldRefresh =
    candidate !== null && state.current !== null
      ? canonicalizeEntryValue(state.current.snapshot.referenceManifest) !==
        candidate.canonicalReferenceManifest
      : candidate !== null && candidate.referenceManifest.length > 0;
  return Schema.decodeUnknownSync(EntryPublicationPlan)({
    entryId: state.entry.id,
    localeId: access.locale.id,
    locale: access.locale.tag,
    stateVersion: state.head?.version ?? 0,
    currentPublicationId: state.head?.currentPublicationId ?? null,
    schemaRevisionId: state.contract.revision.id,
    contractHash: state.contract.contractHash,
    sharedRevisionId: state.sources.sharedRevisionId,
    sharedVersion: state.sources.sharedVersion,
    localizedRevisionId: state.sources.localizedRevisionId,
    localizedVersion: state.sources.localizedVersion,
    valid: compiled.valid,
    issues: visibleIssues,
    capped: compiled.capped,
    contentHash: compiled.valid ? (candidate?.contentHash ?? null) : null,
    authorityHash: compiled.valid ? (candidate?.authorityHash ?? null) : null,
    changedFieldIds: candidate?.changedFieldIds ?? [],
    size: candidate?.size ?? null,
    referencesWouldRefresh,
    wouldCreatePublication:
      compiled.valid && (state.current === null || currentAuthority !== candidate?.authorityHash),
  });
}

function mapScopeFailure(kind: string) {
  switch (kind) {
    case "not_found":
      return NotFoundFailure.make({ resource: "entry" });
    case "forbidden":
      return ForbiddenFailure.make();
    case "locale_unavailable":
      return LocaleUnavailableFailure.make();
    case "cms_required":
      return CmsCapabilityRequiredFailure.make();
    default:
      return InvalidStateTransitionFailure.make();
  }
}

function publicationFingerprint(
  actorId: AuthUserId,
  workspaceId: string,
  localeId: string,
  operation: string,
  input: object,
) {
  return digest({ operation, actorId, workspaceId, localeId, ...input });
}

async function loadInvalidationSnapshot(
  transaction: ApplicationTransaction,
  entry: typeof cmsEntry.$inferSelect,
  localeId: string,
  eventType: "cms.entry.published" | "cms.entry.unpublished",
) {
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
        eq(cmsInvalidationRouteMapping.workspaceId, entry.workspaceId),
        eq(cmsInvalidationRouteMapping.projectId, entry.projectId),
        eq(cmsInvalidationRouteMapping.environmentId, entry.environmentId),
        eq(cmsInvalidationRouteMapping.collectionId, entry.collectionId),
        eq(cmsInvalidationRouteMapping.state, "enabled"),
        sql`${eventType} = any(${cmsInvalidationRouteMapping.eventTypes})`,
        or(
          sql`${cmsInvalidationRouteMapping.entryId} is null`,
          eq(cmsInvalidationRouteMapping.entryId, entry.id),
        ),
        or(
          sql`${cmsInvalidationRouteMapping.localeId} is null`,
          eq(cmsInvalidationRouteMapping.localeId, localeId),
        ),
      ),
    )
    .orderBy(cmsInvalidationRouteMapping.id);
  return matchInvalidationMappings(mappings, { eventType, entryId: entry.id, localeId });
}

function makeAudit(options: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceId: string;
  readonly requestId: string;
}) {
  return { ...options, actorType: "user", resourceType: "cms_entry_publication" };
}

export type PublicationFailureStage =
  | "event_sequence"
  | "publication"
  | "snapshot"
  | "references"
  | "pointer"
  | "projection"
  | "generation"
  | "invalidation_mapping_load"
  | "invalidation_projection"
  | "event_size_validation"
  | "pre_outbox"
  | "audit"
  | "outbox"
  | "receipt";

interface RepositoryOptions {
  readonly database?: ApplicationDb;
  readonly executor?: ApplicationExecutor;
  readonly runTransaction?: <A>(
    work: (transaction: ApplicationTransaction) => Promise<A>,
  ) => Promise<A>;
  readonly onTransactionOpened?: (transaction: ApplicationTransaction) => Promise<void>;
  readonly onReferencesResolved?: (transaction: ApplicationTransaction) => Promise<void>;
  readonly compile?: typeof compilePublicationSnapshot;
  readonly failAfter?: PublicationFailureStage;
}

export function makePublicationRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;
  const executor = options.executor ?? database;
  const runTransaction =
    options.runTransaction ??
    (<A>(work: (transaction: ApplicationTransaction) => Promise<A>) =>
      database.transaction(work, { isolationLevel: "read committed", accessMode: "read write" }));
  const compile = options.compile ?? compilePublicationSnapshot;
  const failAfter = (stage: PublicationFailureStage) => {
    if (options.failAfter === stage)
      throw new Error(`Injected publication failure after ${stage}.`);
  };

  return {
    getStatus: Effect.fn("PublicationRepository.getStatus")(function* (
      actorId: AuthUserId,
      input: GetEntryPublicationStatusInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const scope = await authorizeScope(executor, actorId, input, "content.read");
          if (scope.kind !== "success") return scope;
          const state = await loadAuthority(executor, scope.access, input, false, false);
          if ("missing" in state)
            return outcome(state.missing === "schema" ? "published_required" : "not_found");
          return withValue("success", { state, access: scope.access });
        },
        catch: (cause) => databaseFailure("publication.status", cause),
      });
      if (result.kind !== "success") {
        if (result.kind === "published_required")
          return yield* PublishedSchemaRequiredFailure.make();
        return yield* mapScopeFailure(result.kind);
      }
      const { state, access } = result;
      const current = state.current ? publicationSummary(state.current, access.locale, true) : null;
      const sharedChanged =
        current !== null &&
        (current.sharedVersion !== state.sources.sharedVersion ||
          current.sharedRevisionId !== state.sources.sharedRevisionId);
      const localizedChanged =
        current !== null &&
        (current.localizedVersion !== state.sources.localizedVersion ||
          current.localizedRevisionId !== state.sources.localizedRevisionId);
      const schemaChanged =
        current !== null &&
        (current.schemaRevisionId !== state.contract.revision.id ||
          current.contractHash !== state.contract.contractHash);
      return Schema.decodeUnknownSync(EntryPublicationStatus)({
        entryId: state.entry.id,
        localeId: access.locale.id,
        locale: access.locale.tag,
        state: current === null ? "unpublished" : "published",
        stateVersion: state.head?.version ?? 0,
        currentPublication: current,
        currentSchemaRevisionId: state.contract.revision.id,
        currentContractHash: state.contract.contractHash,
        currentSharedRevisionId: state.sources.sharedRevisionId,
        currentSharedVersion: state.sources.sharedVersion,
        currentLocalizedRevisionId: state.sources.localizedRevisionId,
        currentLocalizedVersion: state.sources.localizedVersion,
        sharedChanged,
        localizedChanged,
        schemaChanged,
        changedSincePublication: sharedChanged || localizedChanged || schemaChanged,
      });
    }),

    validate: Effect.fn("PublicationRepository.validate")(function* (
      actorId: AuthUserId,
      input: ValidateEntryPublicationInput,
      now: Date,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const scope = await authorizeScope(executor, actorId, input, "content.publish");
          if (scope.kind !== "success") return scope;
          const state = await loadAuthority(executor, scope.access, input, false, true);
          if ("missing" in state)
            return outcome(state.missing === "schema" ? "published_required" : "not_found");
          const publicationId = await allocatePublicationId(executor);
          const compiled = compileAuthority(compile, state, scope.access, {
            publicationId,
            sequence: (state.head?.latestPublicationSequence ?? 0) + 1,
            now,
          });
          return withValue("success", { state, access: scope.access, compiled });
        },
        catch: (cause) => databaseFailure("publication.validate", cause),
      });
      if (result.kind !== "success") {
        if (result.kind === "published_required")
          return yield* PublishedSchemaRequiredFailure.make();
        return yield* mapScopeFailure(result.kind);
      }
      return planValue(result.state, result.access, result.compiled);
    }),

    publish: Effect.fn("PublicationRepository.publish")(function* (
      actorId: AuthUserId,
      input: PublishEntryInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          runTransaction(async (transaction) => {
            await options.onTransactionOpened?.(transaction);
            await lockProjectShared(transaction, input.projectId);
            const scope = await authorizeScope(transaction, actorId, input, "content.publish");
            if (scope.kind !== "success") return scope;
            await lockCollectionShared(transaction, input.collectionId);
            await lockEntry(transaction, input.entryId);
            const entry = await selectEntry(transaction, scope.access.workspaceId, input);
            if (!entry) return outcome("not_found");
            const fingerprint = publicationFingerprint(
              actorId,
              entry.workspaceId,
              scope.access.locale.id,
              "publish",
              input,
            );
            const [receipt] = await transaction
              .select()
              .from(cmsEntryPublicationCommand)
              .where(
                and(
                  eq(cmsEntryPublicationCommand.entryId, entry.id),
                  eq(cmsEntryPublicationCommand.commandId, input.commandId),
                  eq(cmsEntryPublicationCommand.workspaceId, entry.workspaceId),
                ),
              )
              .limit(1);
            if (receipt) {
              if (receipt.commandFingerprint !== fingerprint || receipt.operation !== "publish")
                return outcome("command_conflict");
              const artifact = await loadPublicationArtifact(
                transaction,
                receipt.resultCurrentPublicationId,
                entry,
                scope.access.locale.id,
              );
              if (!artifact)
                throw new Error("Publish receipt does not resolve to its publication.");
              return withValue("replay", { receipt, artifact, access: scope.access });
            }
            const contract = await loadPublishedContract(transaction, input);
            if (contract === undefined) return outcome("not_found");
            if (contract === null) return outcome("published_required");
            const sources = await loadSources(transaction, entry, scope.access.locale.id, true);
            const head = await loadHead(transaction, entry, scope.access.locale.id, true);
            const current = await loadPublicationArtifact(
              transaction,
              head?.currentPublicationId ?? null,
              entry,
              scope.access.locale.id,
            );
            const uses = collectReferenceUses(
              contract.fields,
              sources.sharedValues,
              sources.localizedValues,
            );
            const resolution = await resolveReferences(transaction, {
              workspaceId: entry.workspaceId,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              localeId: scope.access.locale.id,
              uses,
            });
            await options.onReferencesResolved?.(transaction);
            const state: AuthorityState = {
              entry,
              contract,
              sources,
              head,
              current,
              uses,
              resolvedReferences: resolution.references,
              availableTargets: resolution.availableTargets,
            };
            const conflicts = authorityConflict(state, input);
            if (conflicts.length > 0)
              return withValue("publication_conflict", { details: conflicts });
            const publicationId = await allocatePublicationId(transaction);
            const compiled = compileAuthority(compile, state, scope.access, {
              publicationId,
              sequence: (head?.latestPublicationSequence ?? 0) + 1,
              now,
            });
            const issues = publicIssues(
              compiled.issues,
              contract.fields,
              scope.access.role,
              state.uses,
              state.availableTargets,
            );
            if (!compiled.valid || !compiled.candidate) return withValue("invalid", { issues });
            if (compiled.candidate.authorityHash !== input.authorityHash)
              return withValue("publication_conflict", {
                details: [
                  conflictDetail("authorityHash", "The validated publication candidate changed."),
                ],
              });
            if (current?.publication.authorityHash === compiled.candidate.authorityHash) {
              await transaction.insert(cmsEntryPublicationCommand).values({
                entryId: entry.id,
                commandId: input.commandId,
                workspaceId: entry.workspaceId,
                projectId: entry.projectId,
                environmentId: entry.environmentId,
                collectionId: entry.collectionId,
                localeId: scope.access.locale.id,
                operation: "publish",
                commandFingerprint: fingerprint,
                resultKind: "no_op",
                resultHeadVersion: head?.version ?? 0,
                resultCurrentPublicationId: current.publication.id,
                resultLatestPublicationSequence:
                  head?.latestPublicationSequence ?? current.publication.publicationSequence,
                resultEventSequence: null,
                completedByUserId: actorId,
                completedAt: now,
              });
              failAfter("receipt");
              return withValue("completed", {
                artifact: current,
                access: scope.access,
                stateVersion: head?.version ?? 0,
                resultKind: "no_op" as const,
              });
            }
            const deliveryCapabilities = await transaction
              .select({
                fieldId: cmsCollectionDeliveryField.fieldId,
                uniqueLookup: cmsCollectionDeliveryField.uniqueLookup,
              })
              .from(cmsCollectionDeliveryField)
              .where(eq(cmsCollectionDeliveryField.collectionId, entry.collectionId));
            const projection = compileDeliveryProjections(
              contract.fields,
              compiled.candidate.document.data,
              deliveryCapabilities,
            );
            if (!projection.valid) {
              return withValue("invalid", {
                issues: projection.issues.map((issue) =>
                  EntryPublicationValidationIssue.make({
                    fieldId:
                      issue.fieldId === null
                        ? null
                        : Schema.decodeUnknownSync(CollectionFieldId)(issue.fieldId),
                    path: issue.path,
                    code: issue.code,
                    message: issue.message,
                  }),
                ),
              });
            }
            await lockUniqueDeliveryClaims(transaction, projection.rows, {
              collectionId: entry.collectionId,
              localeId: scope.access.locale.id,
            });
            const publicationSequence = (head?.latestPublicationSequence ?? 0) + 1;
            const eventSequence = entry.publicationEventSequence + 1;
            await transaction
              .update(cmsEntry)
              .set({ publicationEventSequence: eventSequence })
              .where(
                and(
                  eq(cmsEntry.id, entry.id),
                  eq(cmsEntry.workspaceId, entry.workspaceId),
                  eq(cmsEntry.publicationEventSequence, entry.publicationEventSequence),
                ),
              );
            failAfter("event_sequence");
            const candidate = compiled.candidate;
            const [publication] = await transaction
              .insert(cmsEntryLocalePublication)
              .values({
                id: publicationId,
                workspaceId: entry.workspaceId,
                projectId: entry.projectId,
                environmentId: entry.environmentId,
                collectionId: entry.collectionId,
                entryId: entry.id,
                localeId: scope.access.locale.id,
                publicationSequence,
                eventSequence,
                previousPublicationId:
                  head === undefined
                    ? null
                    : head.latestPublicationSequence > 0
                      ? ((
                          await transaction
                            .select({ id: cmsEntryLocalePublication.id })
                            .from(cmsEntryLocalePublication)
                            .where(
                              and(
                                eq(cmsEntryLocalePublication.workspaceId, entry.workspaceId),
                                eq(cmsEntryLocalePublication.projectId, entry.projectId),
                                eq(cmsEntryLocalePublication.environmentId, entry.environmentId),
                                eq(cmsEntryLocalePublication.collectionId, entry.collectionId),
                                eq(cmsEntryLocalePublication.entryId, entry.id),
                                eq(cmsEntryLocalePublication.localeId, scope.access.locale.id),
                                eq(
                                  cmsEntryLocalePublication.publicationSequence,
                                  head.latestPublicationSequence,
                                ),
                              ),
                            )
                            .limit(1)
                        )[0]?.id ?? null)
                      : null,
                schemaRevisionId: contract.revision.id,
                contractHash: contract.contractHash,
                sharedSourceVersion: sources.sharedVersion,
                sharedSourceRevisionId: sources.sharedRevisionId,
                localeSourceVersion: sources.localizedVersion,
                localeSourceRevisionId: sources.localizedRevisionId,
                contentHash: candidate.contentHash,
                authorityHash: candidate.authorityHash,
                changedFieldIds: [...candidate.changedFieldIds],
                commandId: input.commandId,
                commandFingerprint: fingerprint,
                publishedByUserId: actorId,
                publishedAt: now,
              })
              .returning();
            if (!publication) throw new Error("Publication insert returned no row.");
            failAfter("publication");
            await transaction.insert(cmsEntryLocaleDeliverySnapshot).values({
              publicationId: publication.id,
              workspaceId: entry.workspaceId,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              collectionId: entry.collectionId,
              entryId: entry.id,
              localeId: scope.access.locale.id,
              formatVersion: 1,
              document: { ...candidate.document },
              documentHash: candidate.documentHash,
              referenceManifest: candidate.referenceManifest,
              referenceManifestHash: candidate.referenceManifestHash,
              canonicalDocumentBytes: candidate.size.documentBytes,
              canonicalReferenceManifestBytes: candidate.size.referenceManifestBytes,
              canonicalCombinedBytes: candidate.size.combinedBytes,
            });
            failAfter("snapshot");
            const edgeMap = new Map<string, (typeof candidate.referenceManifest)[number]>();
            for (const item of candidate.referenceManifest)
              edgeMap.set(`${item.sourceFieldId}:${item.targetPublicationId}`, item);
            if (edgeMap.size > 0)
              await transaction.insert(cmsEntryLocalePublicationReference).values(
                [...edgeMap.values()].map((item) => ({
                  sourcePublicationId: publication.id,
                  sourceFieldId: item.sourceFieldId,
                  targetPublicationId: item.targetPublicationId,
                  workspaceId: entry.workspaceId,
                  projectId: entry.projectId,
                  environmentId: entry.environmentId,
                  sourceCollectionId: entry.collectionId,
                  sourceEntryId: entry.id,
                  localeId: scope.access.locale.id,
                  targetCollectionId: item.targetCollectionId,
                  targetEntryId: item.targetEntryId,
                })),
              );
            failAfter("references");
            await transaction
              .delete(cmsEntryLocaleDeliveryCurrentValue)
              .where(
                and(
                  eq(cmsEntryLocaleDeliveryCurrentValue.entryId, entry.id),
                  eq(cmsEntryLocaleDeliveryCurrentValue.localeId, scope.access.locale.id),
                ),
              );
            const stateVersion = (head?.version ?? 0) + 1;
            await transaction
              .insert(cmsEntryLocalePublicationHead)
              .values({
                entryId: entry.id,
                localeId: scope.access.locale.id,
                workspaceId: entry.workspaceId,
                projectId: entry.projectId,
                environmentId: entry.environmentId,
                collectionId: entry.collectionId,
                version: stateVersion,
                latestPublicationSequence: publicationSequence,
                currentPublicationId: publication.id,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .onConflictDoUpdate({
                target: [
                  cmsEntryLocalePublicationHead.entryId,
                  cmsEntryLocalePublicationHead.localeId,
                ],
                set: {
                  version: stateVersion,
                  latestPublicationSequence: publicationSequence,
                  currentPublicationId: publication.id,
                  changedByUserId: actorId,
                  updatedAt: now,
                },
              });
            failAfter("pointer");
            if (projection.rows.length > 0) {
              await transaction.insert(cmsEntryLocaleDeliveryCurrentValue).values(
                projection.rows.map((row) =>
                  projectionInsertValue({
                    row,
                    publicationId: publication.id,
                    entry,
                    localeId: scope.access.locale.id,
                  }),
                ),
              );
            }
            failAfter("projection");
            await incrementDeliveryGeneration(transaction, {
              entry,
              localeId: scope.access.locale.id,
              now,
            });
            failAfter("generation");
            await transaction.insert(auditEvent).values(
              makeAudit({
                workspaceId: entry.workspaceId,
                projectId: entry.projectId,
                environmentId: entry.environmentId,
                actorId,
                action: "cms.entry.locale.published",
                resourceId: publication.id,
                requestId,
              }),
            );
            failAfter("audit");
            const invalidationSnapshot = await loadInvalidationSnapshot(
              transaction,
              entry,
              scope.access.locale.id,
              "cms.entry.published",
            );
            failAfter("invalidation_mapping_load");
            const invalidationTags = [
              `project:${entry.projectId}`,
              `environment:${entry.environmentId}`,
              `collection:${entry.collectionId}`,
              `entry:${entry.id}`,
              `locale:${scope.access.locale.id}`,
              ...candidate.changedFieldIds.map((fieldId) => `field:${fieldId}`),
            ];
            failAfter("invalidation_projection");
            const eventPayload = {
              version: 1,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              collectionId: entry.collectionId,
              entryId: entry.id,
              localeId: scope.access.locale.id,
              locale: scope.access.locale.tag,
              publicationId: publication.id,
              publicationSequence,
              eventSequence,
              schemaRevisionId: publication.schemaRevisionId,
              contractHash: publication.contractHash,
              changedFieldIds: publication.changedFieldIds,
              invalidationTags,
              semanticTags: invalidationSnapshot.semanticTags,
              routes: invalidationSnapshot.routes,
            };
            if (Buffer.byteLength(canonicalizeEntryValue(eventPayload), "utf8") > 131_072) {
              throw new Error("Publication event payload exceeded the fixed M11 limit.");
            }
            failAfter("event_size_validation");
            failAfter("pre_outbox");
            await transaction.insert(outboxEvent).values({
              workspaceId: entry.workspaceId,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              eventType: "cms.entry.published",
              subjectType: "cms.entry",
              subjectId: entry.id,
              schemaRevisionId: publication.schemaRevisionId,
              localeId: scope.access.locale.id,
              entryPublicationId: publication.id,
              aggregateSequence: eventSequence,
              payload: eventPayload,
              occurredAt: now,
              availableAt: now,
            });
            failAfter("outbox");
            await transaction.insert(cmsEntryPublicationCommand).values({
              entryId: entry.id,
              commandId: input.commandId,
              workspaceId: entry.workspaceId,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              collectionId: entry.collectionId,
              localeId: scope.access.locale.id,
              operation: "publish",
              commandFingerprint: fingerprint,
              resultKind: "changed",
              resultHeadVersion: stateVersion,
              resultCurrentPublicationId: publication.id,
              resultLatestPublicationSequence: publicationSequence,
              resultEventSequence: eventSequence,
              completedByUserId: actorId,
              completedAt: now,
            });
            failAfter("receipt");
            const artifact = await loadPublicationArtifact(
              transaction,
              publication.id,
              entry,
              scope.access.locale.id,
            );
            if (!artifact) throw new Error("Inserted publication artifact cannot be loaded.");
            return withValue("completed", {
              artifact,
              access: scope.access,
              stateVersion,
              resultKind: "changed" as const,
            });
          }),
        catch: (cause) => publicationPersistenceFailure("publication.publish", cause),
      });
      if (result.kind === "command_conflict") return yield* EntryCommandConflictFailure.make();
      if (result.kind === "publication_conflict")
        return yield* EntryPublicationConflictFailure.make({ details: result.details });
      if (result.kind === "invalid")
        return yield* EntryPublicationInvalidFailure.make({ issues: result.issues });
      if (result.kind !== "completed" && result.kind !== "replay") {
        if (result.kind === "published_required")
          return yield* PublishedSchemaRequiredFailure.make();
        return yield* mapScopeFailure(result.kind);
      }
      const stateVersion =
        result.kind === "replay" ? result.receipt.resultHeadVersion : result.stateVersion;
      const resultKind = result.kind === "replay" ? result.receipt.resultKind : result.resultKind;
      return Schema.decodeUnknownSync(PublishEntryResult)({
        entryId: result.artifact.publication.entryId,
        localeId: result.access.locale.id,
        locale: result.access.locale.tag,
        commandId: input.commandId,
        stateVersion,
        resultKind,
        publication: publicationSummary(result.artifact, result.access.locale, true),
      });
    }),

    unpublish: Effect.fn("PublicationRepository.unpublish")(function* (
      actorId: AuthUserId,
      input: UnpublishEntryInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          runTransaction(async (transaction) => {
            await options.onTransactionOpened?.(transaction);
            await lockProjectShared(transaction, input.projectId);
            const scope = await authorizeScope(transaction, actorId, input, "content.publish");
            if (scope.kind !== "success") return scope;
            await lockCollectionShared(transaction, input.collectionId);
            await lockEntry(transaction, input.entryId);
            const entry = await selectEntry(transaction, scope.access.workspaceId, input);
            if (!entry) return outcome("not_found");
            const fingerprint = publicationFingerprint(
              actorId,
              entry.workspaceId,
              scope.access.locale.id,
              "unpublish",
              input,
            );
            const [receipt] = await transaction
              .select()
              .from(cmsEntryPublicationCommand)
              .where(
                and(
                  eq(cmsEntryPublicationCommand.entryId, entry.id),
                  eq(cmsEntryPublicationCommand.commandId, input.commandId),
                  eq(cmsEntryPublicationCommand.workspaceId, entry.workspaceId),
                ),
              )
              .limit(1);
            if (receipt) {
              if (receipt.commandFingerprint !== fingerprint || receipt.operation !== "unpublish")
                return outcome("command_conflict");
              return withValue("replay", { receipt, entry, access: scope.access });
            }
            const head = await loadHead(transaction, entry, scope.access.locale.id, true);
            const stateVersion = head?.version ?? 0;
            const currentId = head?.currentPublicationId ?? null;
            if (
              stateVersion !== input.expectedStateVersion ||
              currentId !== input.expectedPublicationId
            )
              return withValue("publication_conflict", {
                details: [
                  conflictDetail("expectedStateVersion", "The locale publication state changed."),
                ],
              });
            if (currentId === null) {
              await transaction.insert(cmsEntryPublicationCommand).values({
                entryId: entry.id,
                commandId: input.commandId,
                workspaceId: entry.workspaceId,
                projectId: entry.projectId,
                environmentId: entry.environmentId,
                collectionId: entry.collectionId,
                localeId: scope.access.locale.id,
                operation: "unpublish",
                commandFingerprint: fingerprint,
                resultKind: "no_op",
                resultHeadVersion: stateVersion,
                resultCurrentPublicationId: null,
                resultLatestPublicationSequence: head?.latestPublicationSequence ?? 0,
                resultEventSequence: null,
                completedByUserId: actorId,
                completedAt: now,
              });
              failAfter("receipt");
              return withValue("completed", {
                access: scope.access,
                stateVersion,
                resultKind: "no_op" as const,
                publication: null,
              });
            }
            const artifact = await loadPublicationArtifact(
              transaction,
              currentId,
              entry,
              scope.access.locale.id,
            );
            if (!artifact || !head) throw new Error("Current publication head does not resolve.");
            const eventSequence = entry.publicationEventSequence + 1;
            await transaction
              .update(cmsEntry)
              .set({ publicationEventSequence: eventSequence })
              .where(
                and(
                  eq(cmsEntry.id, entry.id),
                  eq(cmsEntry.workspaceId, entry.workspaceId),
                  eq(cmsEntry.publicationEventSequence, entry.publicationEventSequence),
                ),
              );
            failAfter("event_sequence");
            await transaction
              .delete(cmsEntryLocaleDeliveryCurrentValue)
              .where(
                and(
                  eq(cmsEntryLocaleDeliveryCurrentValue.entryId, entry.id),
                  eq(cmsEntryLocaleDeliveryCurrentValue.localeId, scope.access.locale.id),
                ),
              );
            const nextVersion = head.version + 1;
            await transaction
              .update(cmsEntryLocalePublicationHead)
              .set({
                version: nextVersion,
                currentPublicationId: null,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(
                and(
                  eq(cmsEntryLocalePublicationHead.entryId, entry.id),
                  eq(cmsEntryLocalePublicationHead.localeId, scope.access.locale.id),
                  eq(cmsEntryLocalePublicationHead.version, head.version),
                  eq(cmsEntryLocalePublicationHead.currentPublicationId, currentId),
                ),
              );
            failAfter("pointer");
            failAfter("projection");
            await incrementDeliveryGeneration(transaction, {
              entry,
              localeId: scope.access.locale.id,
              now,
            });
            failAfter("generation");
            await transaction.insert(auditEvent).values(
              makeAudit({
                workspaceId: entry.workspaceId,
                projectId: entry.projectId,
                environmentId: entry.environmentId,
                actorId,
                action: "cms.entry.locale.unpublished",
                resourceId: currentId,
                requestId,
              }),
            );
            failAfter("audit");
            const invalidationSnapshot = await loadInvalidationSnapshot(
              transaction,
              entry,
              scope.access.locale.id,
              "cms.entry.unpublished",
            );
            failAfter("invalidation_mapping_load");
            const publishedFieldRows = await transaction
              .select({ id: cmsSchemaRevisionField.fieldId })
              .from(cmsSchemaRevisionField)
              .where(
                and(
                  eq(cmsSchemaRevisionField.revisionId, artifact.publication.schemaRevisionId),
                  eq(cmsSchemaRevisionField.collectionId, entry.collectionId),
                  eq(cmsSchemaRevisionField.environmentId, entry.environmentId),
                  eq(cmsSchemaRevisionField.projectId, entry.projectId),
                  eq(cmsSchemaRevisionField.workspaceId, entry.workspaceId),
                ),
              )
              .orderBy(cmsSchemaRevisionField.fieldId);
            const changedFieldIds = publishedFieldRows.map((field) => field.id);
            const invalidationTags = [
              `project:${entry.projectId}`,
              `environment:${entry.environmentId}`,
              `collection:${entry.collectionId}`,
              `entry:${entry.id}`,
              `locale:${scope.access.locale.id}`,
              ...changedFieldIds.map((fieldId) => `field:${fieldId}`),
            ];
            failAfter("invalidation_projection");
            const eventPayload = {
              version: 1,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              collectionId: entry.collectionId,
              entryId: entry.id,
              localeId: scope.access.locale.id,
              locale: scope.access.locale.tag,
              publicationId: currentId,
              publicationSequence: artifact.publication.publicationSequence,
              eventSequence,
              schemaRevisionId: artifact.publication.schemaRevisionId,
              contractHash: artifact.publication.contractHash,
              changedFieldIds,
              invalidationTags,
              semanticTags: invalidationSnapshot.semanticTags,
              routes: invalidationSnapshot.routes,
            };
            if (Buffer.byteLength(canonicalizeEntryValue(eventPayload), "utf8") > 131_072) {
              throw new Error("Publication event payload exceeded the fixed M11 limit.");
            }
            failAfter("event_size_validation");
            failAfter("pre_outbox");
            await transaction.insert(outboxEvent).values({
              workspaceId: entry.workspaceId,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              eventType: "cms.entry.unpublished",
              subjectType: "cms.entry",
              subjectId: entry.id,
              schemaRevisionId: artifact.publication.schemaRevisionId,
              localeId: scope.access.locale.id,
              entryPublicationId: currentId,
              aggregateSequence: eventSequence,
              payload: eventPayload,
              occurredAt: now,
              availableAt: now,
            });
            failAfter("outbox");
            await transaction.insert(cmsEntryPublicationCommand).values({
              entryId: entry.id,
              commandId: input.commandId,
              workspaceId: entry.workspaceId,
              projectId: entry.projectId,
              environmentId: entry.environmentId,
              collectionId: entry.collectionId,
              localeId: scope.access.locale.id,
              operation: "unpublish",
              commandFingerprint: fingerprint,
              resultKind: "changed",
              resultHeadVersion: nextVersion,
              resultCurrentPublicationId: null,
              resultLatestPublicationSequence: head.latestPublicationSequence,
              resultEventSequence: eventSequence,
              completedByUserId: actorId,
              completedAt: now,
            });
            failAfter("receipt");
            return withValue("completed", {
              access: scope.access,
              stateVersion: nextVersion,
              resultKind: "changed" as const,
              publication: artifact.publication,
            });
          }),
        catch: (cause) => databaseFailure("publication.unpublish", cause),
      });
      if (result.kind === "command_conflict") return yield* EntryCommandConflictFailure.make();
      if (result.kind === "publication_conflict")
        return yield* EntryPublicationConflictFailure.make({ details: result.details });
      if (result.kind !== "completed" && result.kind !== "replay")
        return yield* mapScopeFailure(result.kind);
      let publication = result.kind === "completed" ? result.publication : null;
      if (result.kind === "replay" && result.receipt.resultKind === "changed") {
        const [row] = yield* Effect.tryPromise({
          try: () =>
            executor
              .select()
              .from(cmsEntryLocalePublication)
              .where(
                and(
                  eq(cmsEntryLocalePublication.workspaceId, result.entry.workspaceId),
                  eq(cmsEntryLocalePublication.projectId, result.entry.projectId),
                  eq(cmsEntryLocalePublication.environmentId, result.entry.environmentId),
                  eq(cmsEntryLocalePublication.collectionId, result.entry.collectionId),
                  eq(cmsEntryLocalePublication.entryId, result.entry.id),
                  eq(cmsEntryLocalePublication.localeId, result.access.locale.id),
                  eq(
                    cmsEntryLocalePublication.publicationSequence,
                    result.receipt.resultLatestPublicationSequence,
                  ),
                ),
              )
              .limit(1),
          catch: (cause) => databaseFailure("publication.unpublish.replay", cause),
        });
        publication = row ?? null;
      }
      const receipt = result.kind === "replay" ? result.receipt : null;
      const finalStateVersion =
        result.kind === "replay" ? result.receipt.resultHeadVersion : result.stateVersion;
      const finalResultKind =
        result.kind === "replay" ? result.receipt.resultKind : result.resultKind;
      return Schema.decodeUnknownSync(UnpublishEntryResult)({
        entryId: input.entryId,
        localeId: result.access.locale.id,
        locale: result.access.locale.tag,
        commandId: input.commandId,
        stateVersion: finalStateVersion,
        resultKind: finalResultKind,
        unpublishedPublicationId: publication?.id ?? null,
        unpublishedPublicationSequence: publication?.publicationSequence ?? null,
        unpublishedAt: toIso(receipt?.completedAt ?? now),
      });
    }),

    list: Effect.fn("PublicationRepository.list")(function* (
      actorId: AuthUserId,
      input: ListEntryPublicationsInput,
    ) {
      const cursor =
        input.cursor === null ? null : yield* decodePublicationCursor(input.cursor, input);
      const result = yield* Effect.tryPromise({
        try: async () => {
          const scope = await authorizeScope(executor, actorId, input, "content.read");
          if (scope.kind !== "success") return scope;
          const entry = await selectEntry(executor, scope.access.workspaceId, input);
          if (!entry) return outcome("not_found");
          const head = await loadHead(executor, entry, scope.access.locale.id, false);
          const rows = await executor
            .select({
              publication: cmsEntryLocalePublication,
              snapshot: cmsEntryLocaleDeliverySnapshot,
            })
            .from(cmsEntryLocalePublication)
            .innerJoin(
              cmsEntryLocaleDeliverySnapshot,
              eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
            )
            .where(
              and(
                eq(cmsEntryLocalePublication.workspaceId, entry.workspaceId),
                eq(cmsEntryLocalePublication.projectId, entry.projectId),
                eq(cmsEntryLocalePublication.environmentId, entry.environmentId),
                eq(cmsEntryLocalePublication.collectionId, entry.collectionId),
                eq(cmsEntryLocalePublication.entryId, entry.id),
                eq(cmsEntryLocalePublication.localeId, scope.access.locale.id),
                cursor === null
                  ? undefined
                  : or(
                      lt(cmsEntryLocalePublication.publicationSequence, cursor.sequence),
                      and(
                        eq(cmsEntryLocalePublication.publicationSequence, cursor.sequence),
                        lt(cmsEntryLocalePublication.id, cursor.publicationId),
                      ),
                    ),
              ),
            )
            .orderBy(
              desc(cmsEntryLocalePublication.publicationSequence),
              desc(cmsEntryLocalePublication.id),
            )
            .limit(input.limit + 1);
          return withValue("success", { rows, head, access: scope.access });
        },
        catch: (cause) => databaseFailure("publication.list", cause),
      });
      if (result.kind !== "success") return yield* mapScopeFailure(result.kind);
      const pageRows = result.rows.slice(0, input.limit);
      const items = pageRows.map((row) =>
        publicationSummary(
          row,
          result.access.locale,
          row.publication.id === result.head?.currentPublicationId,
        ),
      );
      const last = pageRows.at(-1);
      const nextCursor =
        result.rows.length > input.limit && last
          ? yield* encodePublicationCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              collectionId: input.collectionId,
              entryId: input.entryId,
              locale: input.locale,
              sequence: Schema.decodeUnknownSync(EntryPublicationSequence)(
                last.publication.publicationSequence,
              ),
              publicationId: Schema.decodeUnknownSync(EntryPublicationId)(last.publication.id),
            })
          : null;
      return EntryPublicationPage.make({ items, nextCursor });
    }),
  };
}

export class PublicationRepository extends Context.Tag("PublicationRepository")<
  PublicationRepository,
  ReturnType<typeof makePublicationRepository>
>() {}

export const PublicationRepositoryLive = Layer.effect(
  PublicationRepository,
  Effect.map(PublicationEngine, (engine) =>
    makePublicationRepository({ compile: engine.compileSync }),
  ),
);
