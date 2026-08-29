// Reads only current or immutable M8 publication artifacts through bounded M9 Delivery query authority.

import { db } from "@framerfordevs/db";
import { and, eq, inArray, sql, type SQL } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionDeliveryField,
  cmsCollectionLocaleDeliveryState,
  cmsCollectionSchemaHead,
  cmsEntryLocaleDeliveryCurrentValue,
  cmsEntryLocaleDeliverySnapshot,
  cmsEntryLocalePublication,
  cmsEntryLocalePublicationHead,
  cmsSchemaRevisionField,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import { environment, project, projectCapability } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import { DeliveryItem, DeliveryPage, DeliveryQueryScalarKind } from "../../contracts/delivery";
import {
  DatabaseFailure,
  DeliveryCursorInvalidFailure,
  DeliveryCursorStaleFailure,
  DeliveryQueryInvalidFailure,
  DeliveryResponseTooLargeFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  SecurityServiceFailure,
} from "../../contracts/response/errors";
import {
  decodeDeliveryFilterValue,
  parseDeliveryListQuery,
  type DeliveryFilter,
  type DeliveryQueryCapability,
  type ParsedDeliveryListQuery,
} from "../../lib/delivery/query";
import { DeliveryCursorSigner } from "./cursor-signer";
import type { ApplicationDb, ApplicationExecutor, ApplicationTransaction } from "../project-access";

export interface DeliveryRouteScopeInput {
  readonly projectId: string;
  readonly environmentKey: string;
  readonly collectionKey: string;
  readonly locale: string;
}

export interface ResolvedDeliveryScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly collectionKey: string;
  readonly localeId: string;
  readonly locale: string;
  readonly access: "protected" | "public";
  readonly configVersion: number;
  readonly schemaRevisionId: string;
  readonly generation: number;
  readonly configUpdatedAt: Date;
  readonly generationChangedAt: Date | null;
  readonly schemaUpdatedAt: Date;
}

interface DeliveryArtifactRow {
  readonly entryId: string;
  readonly collectionId: string;
  readonly collectionKey: string;
  readonly locale: string;
  readonly publicationId: string;
  readonly publicationSequence: number;
  readonly schemaRevisionId: string;
  readonly publishedAt: Date;
  readonly document: Readonly<Record<string, unknown>>;
  readonly referenceManifest: ReadonlyArray<unknown>;
}

const maximumSafeGeneration = BigInt(Number.MAX_SAFE_INTEGER);

function databaseFailure(operation: string, cause: unknown): DatabaseFailure {
  return DatabaseFailure.make({ operation, cause });
}

function deliveryReadFailure(operation: string, cause: unknown) {
  if (cause instanceof DeliveryResponseSizeFailure) {
    return DeliveryResponseTooLargeFailure.make();
  }
  return cause instanceof DeliveryExpansionFailure
    ? DeliveryQueryInvalidFailure.make({
        details: [
          {
            path: "expand",
            code: "delivery_expansion_invalid",
            message: "The requested expansion is unavailable or exceeds a fixed limit.",
          },
        ],
      })
    : databaseFailure(operation, cause);
}

/** Safely maps persisted bigint authority into the JSON cursor number profile. */
function generationNumber(value: bigint | null): number {
  if (value === null) return 0;
  if (value < 0n || value > maximumSafeGeneration) {
    throw new Error("Delivery generation exceeded the supported cursor range.");
  }
  return Number(value);
}

/** Resolves tenant scope before locale so unavailable locales retain their stable error contract. */
async function resolveScope(
  executor: ApplicationExecutor,
  input: DeliveryRouteScopeInput,
): Promise<ResolvedDeliveryScope | "not_found" | "locale_unavailable"> {
  const [base] = await executor
    .select({
      workspaceId: project.workspaceId,
      projectId: project.id,
      environmentId: environment.id,
      collectionId: cmsCollection.id,
      collectionKey: cmsCollection.apiKey,
      access: cmsCollectionDeliveryConfig.access,
      configVersion: cmsCollectionDeliveryConfig.version,
      configUpdatedAt: cmsCollectionDeliveryConfig.updatedAt,
      schemaRevisionId: cmsCollectionSchemaHead.currentPublishedRevisionId,
      schemaUpdatedAt: cmsCollectionSchemaHead.updatedAt,
    })
    .from(project)
    .innerJoin(
      environment,
      and(eq(environment.projectId, project.id), eq(environment.workspaceId, project.workspaceId)),
    )
    .innerJoin(
      projectCapability,
      and(
        eq(projectCapability.projectId, project.id),
        eq(projectCapability.workspaceId, project.workspaceId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .innerJoin(
      cmsCollection,
      and(
        eq(cmsCollection.environmentId, environment.id),
        eq(cmsCollection.projectId, project.id),
        eq(cmsCollection.workspaceId, project.workspaceId),
      ),
    )
    .innerJoin(
      cmsCollectionDeliveryConfig,
      and(
        eq(cmsCollectionDeliveryConfig.collectionId, cmsCollection.id),
        eq(cmsCollectionDeliveryConfig.environmentId, environment.id),
        eq(cmsCollectionDeliveryConfig.projectId, project.id),
        eq(cmsCollectionDeliveryConfig.workspaceId, project.workspaceId),
      ),
    )
    .innerJoin(
      cmsCollectionSchemaHead,
      and(
        eq(cmsCollectionSchemaHead.collectionId, cmsCollection.id),
        eq(cmsCollectionSchemaHead.environmentId, environment.id),
        eq(cmsCollectionSchemaHead.projectId, project.id),
        eq(cmsCollectionSchemaHead.workspaceId, project.workspaceId),
      ),
    )
    .where(
      and(
        eq(project.id, sql.placeholder("projectId")),
        sql`${project.archivedAt} is null`,
        eq(environment.key, sql.placeholder("environmentKey")),
        eq(cmsCollection.apiKey, sql.placeholder("collectionKey")),
      ),
    )
    .limit(1)
    .prepare("delivery_scope_base_v1")
    .execute({
      projectId: input.projectId,
      environmentKey: input.environmentKey,
      collectionKey: input.collectionKey,
    });
  if (base === undefined || base.schemaRevisionId === null) return "not_found";

  const [locale] = await executor
    .select({ id: projectLocale.id, tag: projectLocale.tag })
    .from(projectLocale)
    .where(
      and(
        eq(projectLocale.workspaceId, sql.placeholder("workspaceId")),
        eq(projectLocale.projectId, sql.placeholder("projectId")),
        eq(projectLocale.tag, sql.placeholder("locale")),
        eq(projectLocale.status, "enabled"),
      ),
    )
    .limit(1)
    .prepare("delivery_scope_locale_v1")
    .execute({
      workspaceId: base.workspaceId,
      projectId: base.projectId,
      locale: input.locale,
    });
  if (locale === undefined) return "locale_unavailable";

  const [state] = await executor
    .select({
      generation: cmsCollectionLocaleDeliveryState.generation,
      changedAt: cmsCollectionLocaleDeliveryState.lastChangedAt,
    })
    .from(cmsCollectionLocaleDeliveryState)
    .where(
      and(
        eq(cmsCollectionLocaleDeliveryState.collectionId, sql.placeholder("collectionId")),
        eq(cmsCollectionLocaleDeliveryState.localeId, sql.placeholder("localeId")),
      ),
    )
    .limit(1)
    .prepare("delivery_scope_generation_v1")
    .execute({ collectionId: base.collectionId, localeId: locale.id });

  return {
    ...base,
    access: base.access === "public" ? "public" : "protected",
    schemaRevisionId: base.schemaRevisionId,
    localeId: locale.id,
    locale: locale.tag,
    generation: generationNumber(state?.generation ?? null),
    generationChangedAt: state?.changedAt ?? null,
  };
}

/** Loads current configured capability keys through the exact current schema revision. */
async function loadCapabilities(
  executor: ApplicationExecutor,
  scope: ResolvedDeliveryScope,
): Promise<ReadonlyArray<DeliveryQueryCapability>> {
  const rows = await executor
    .select({
      fieldId: cmsCollectionDeliveryField.fieldId,
      fieldKey: cmsSchemaRevisionField.apiKey,
      kind: cmsSchemaRevisionField.kind,
      filterable: cmsCollectionDeliveryField.filterable,
      sortable: cmsCollectionDeliveryField.sortable,
    })
    .from(cmsCollectionDeliveryField)
    .innerJoin(
      cmsSchemaRevisionField,
      and(
        eq(cmsSchemaRevisionField.revisionId, scope.schemaRevisionId),
        eq(cmsSchemaRevisionField.fieldId, cmsCollectionDeliveryField.fieldId),
        eq(cmsSchemaRevisionField.collectionId, scope.collectionId),
      ),
    )
    .where(eq(cmsCollectionDeliveryField.collectionId, scope.collectionId));
  return rows.flatMap((row) =>
    row.fieldKey === null
      ? []
      : [
          {
            fieldId: row.fieldId,
            fieldKey: row.fieldKey,
            kind: Schema.decodeUnknownSync(DeliveryQueryScalarKind)(row.kind),
            filterable: row.filterable,
            sortable: row.sortable,
          },
        ],
  );
}

/** Resolves one current configured unique field key through stable field identity. */
async function loadUniqueCapability(
  executor: ApplicationExecutor,
  scope: ResolvedDeliveryScope,
  fieldKey: string,
): Promise<{ readonly fieldId: string; readonly kind: DeliveryQueryScalarKind } | null> {
  const [row] = await executor
    .select({
      fieldId: cmsCollectionDeliveryField.fieldId,
      kind: cmsSchemaRevisionField.kind,
    })
    .from(cmsCollectionDeliveryField)
    .innerJoin(
      cmsSchemaRevisionField,
      and(
        eq(cmsSchemaRevisionField.revisionId, scope.schemaRevisionId),
        eq(cmsSchemaRevisionField.fieldId, cmsCollectionDeliveryField.fieldId),
        eq(cmsSchemaRevisionField.collectionId, scope.collectionId),
      ),
    )
    .where(
      and(
        eq(cmsCollectionDeliveryField.collectionId, sql.placeholder("collectionId")),
        eq(cmsCollectionDeliveryField.uniqueLookup, true),
        eq(cmsSchemaRevisionField.apiKey, sql.placeholder("fieldKey")),
      ),
    )
    .limit(1)
    .prepare("delivery_unique_capability_v1")
    .execute({ collectionId: scope.collectionId, fieldKey });
  return row === undefined
    ? null
    : {
        fieldId: row.fieldId,
        kind: Schema.decodeUnknownSync(DeliveryQueryScalarKind)(row.kind),
      };
}

/** Chooses the one typed projection column for a closed field kind. */
function projectionColumn(kind: DeliveryQueryScalarKind) {
  if (kind === "short_text" || kind === "slug" || kind === "email" || kind === "enum") {
    return cmsEntryLocaleDeliveryCurrentValue.textValue;
  }
  if (kind === "number") return cmsEntryLocaleDeliveryCurrentValue.numberValue;
  if (kind === "decimal") return cmsEntryLocaleDeliveryCurrentValue.decimalValue;
  if (kind === "boolean") return cmsEntryLocaleDeliveryCurrentValue.booleanValue;
  if (kind === "date") return cmsEntryLocaleDeliveryCurrentValue.dateValue;
  if (kind === "date_time") return cmsEntryLocaleDeliveryCurrentValue.dateTimeValue;
  return cmsEntryLocaleDeliveryCurrentValue.referenceValue;
}

/** Compiles a closed operator to parameterized SQL; no caller token is interpolated. */
function comparison(filter: DeliveryFilter): SQL {
  const column = projectionColumn(filter.kind);
  if (filter.operator === "eq") return sql`${column} = ${filter.value}`;
  if (filter.operator === "ne") return sql`${column} <> ${filter.value}`;
  if (filter.operator === "gt") return sql`${column} > ${filter.value}`;
  if (filter.operator === "gte") return sql`${column} >= ${filter.value}`;
  if (filter.operator === "lt") return sql`${column} < ${filter.value}`;
  return sql`${column} <= ${filter.value}`;
}

/** Uses EXISTS per bounded predicate so missing values never satisfy positive or `ne` filters. */
function filterPredicates(
  scope: ResolvedDeliveryScope,
  query: ParsedDeliveryListQuery,
): ReadonlyArray<SQL> {
  return query.filters.map(
    (filter) => sql`exists (
      select 1
      from ${cmsEntryLocaleDeliveryCurrentValue}
      where ${cmsEntryLocaleDeliveryCurrentValue.entryId} = ${cmsEntryLocalePublicationHead.entryId}
        and ${cmsEntryLocaleDeliveryCurrentValue.localeId} = ${scope.localeId}
        and ${cmsEntryLocaleDeliveryCurrentValue.collectionId} = ${scope.collectionId}
        and ${cmsEntryLocaleDeliveryCurrentValue.fieldId} = ${filter.fieldId}
        and ${cmsEntryLocaleDeliveryCurrentValue.valueKind} = ${filter.kind}
        and ${comparison(filter)}
    )`,
  );
}

/** Produces the configured correlated sort scalar without accepting SQL identifiers from callers. */
function sortExpression(scope: ResolvedDeliveryScope, query: ParsedDeliveryListQuery): SQL | null {
  if (query.sort === null) return null;
  const column = projectionColumn(query.sort.kind);
  return sql`(
    select ${column}
    from ${cmsEntryLocaleDeliveryCurrentValue}
    where ${cmsEntryLocaleDeliveryCurrentValue.entryId} = ${cmsEntryLocalePublicationHead.entryId}
      and ${cmsEntryLocaleDeliveryCurrentValue.localeId} = ${scope.localeId}
      and ${cmsEntryLocaleDeliveryCurrentValue.collectionId} = ${scope.collectionId}
      and ${cmsEntryLocaleDeliveryCurrentValue.fieldId} = ${query.sort.fieldId}
      and ${cmsEntryLocaleDeliveryCurrentValue.valueKind} = ${query.sort.kind}
  )`;
}

interface ManifestReference {
  readonly path: string;
  readonly targetPublicationId: string;
}

interface ExpansionOccurrence {
  readonly rowIndex: number;
  readonly sourcePublicationId: string;
  readonly manifest: ManifestReference;
  readonly nestedPath: string | null;
}

class DeliveryExpansionFailure extends Error {}
class DeliveryResponseSizeFailure extends Error {}

const maximumDeliveryResponseBytes = 4 * 1_024 * 1_024;
const deliveryResponseMetadataReserveBytes = 64 * 1_024;

function manifestReference(value: unknown): ManifestReference | null {
  if (typeof value !== "object" || value === null) return null;
  const path = Reflect.get(value, "path");
  const targetPublicationId = Reflect.get(value, "targetPublicationId");
  return typeof path === "string" && typeof targetPublicationId === "string"
    ? { path, targetPublicationId }
    : null;
}

/** Converts compiler paths such as `related[0].author` to caller-visible key paths. */
function normalizedManifestPath(path: string): string {
  return path
    .replace(/\[([0-9]+)\]/gu, ".$1")
    .split(".")
    .filter((segment) => segment.length > 0 && !/^[0-9]+$/u.test(segment))
    .join(".");
}

function concretePathSegments(path: string): ReadonlyArray<string> {
  return path
    .replace(/\[([0-9]+)\]/gu, ".$1")
    .split(".")
    .filter((segment) => segment.length > 0);
}

/** Replaces one compiler-owned concrete path without evaluating caller-provided property access. */
function replaceConcretePath(root: unknown, path: string, replacement: unknown): boolean {
  const segments = concretePathSegments(path);
  if (segments.length === 0) return false;
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return false;
      current = current[index];
      continue;
    }
    if (typeof current !== "object" || current === null || !Object.hasOwn(current, segment)) {
      return false;
    }
    current = Reflect.get(current, segment);
  }
  const final = segments.at(-1);
  if (final === undefined) return false;
  if (Array.isArray(current)) {
    const index = Number(final);
    if (!Number.isInteger(index) || index < 0 || index >= current.length) return false;
    current[index] = replacement;
    return true;
  }
  if (typeof current !== "object" || current === null || !Object.hasOwn(current, final)) {
    return false;
  }
  Reflect.set(current, final, replacement);
  return true;
}

/** Builds the stable nested Delivery object from one authorized pinned publication artifact. */
function expandedTargetValue(row: DeliveryArtifactRow, data: unknown) {
  return Schema.decodeUnknownSync(DeliveryItem)({
    id: row.entryId,
    collectionId: row.collectionId,
    collection: row.collectionKey,
    locale: row.locale,
    publication: {
      id: row.publicationId,
      sequence: row.publicationSequence,
      schemaRevisionId: row.schemaRevisionId,
      publishedAt: row.publishedAt.toISOString(),
    },
    data,
  });
}

/** Loads one bounded breadth level and enforces current target collection access generically. */
async function loadExpansionTargets(
  executor: ApplicationExecutor,
  scope: ResolvedDeliveryScope,
  publicationIds: ReadonlyArray<string>,
  authenticated: boolean,
  budget: { usedBytes: number },
): Promise<ReadonlyMap<string, DeliveryArtifactRow>> {
  if (publicationIds.length === 0) return new Map();
  const rows = await executor
    .select({
      entryId: cmsEntryLocalePublication.entryId,
      collectionId: cmsEntryLocalePublication.collectionId,
      collectionKey: cmsCollection.apiKey,
      locale: projectLocale.tag,
      publicationId: cmsEntryLocalePublication.id,
      publicationSequence: cmsEntryLocalePublication.publicationSequence,
      schemaRevisionId: cmsEntryLocalePublication.schemaRevisionId,
      publishedAt: cmsEntryLocalePublication.publishedAt,
      canonicalCombinedBytes: cmsEntryLocaleDeliverySnapshot.canonicalCombinedBytes,
      access: cmsCollectionDeliveryConfig.access,
    })
    .from(cmsEntryLocalePublication)
    .innerJoin(
      cmsEntryLocaleDeliverySnapshot,
      eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
    )
    .innerJoin(cmsCollection, eq(cmsCollection.id, cmsEntryLocalePublication.collectionId))
    .innerJoin(
      cmsCollectionDeliveryConfig,
      eq(cmsCollectionDeliveryConfig.collectionId, cmsEntryLocalePublication.collectionId),
    )
    .innerJoin(projectLocale, eq(projectLocale.id, cmsEntryLocalePublication.localeId))
    .where(
      and(
        inArray(cmsEntryLocalePublication.id, publicationIds),
        eq(cmsEntryLocalePublication.workspaceId, scope.workspaceId),
        eq(cmsEntryLocalePublication.projectId, scope.projectId),
        eq(cmsEntryLocalePublication.environmentId, scope.environmentId),
        eq(cmsEntryLocalePublication.localeId, scope.localeId),
      ),
    );
  const available = rows.filter((row) => authenticated || row.access === "public");
  if (available.length !== publicationIds.length) {
    throw new DeliveryExpansionFailure("An expansion target is unavailable.");
  }
  budget.usedBytes += available.reduce((total, row) => total + row.canonicalCombinedBytes, 0);
  if (budget.usedBytes > maximumDeliveryResponseBytes) {
    throw new DeliveryResponseSizeFailure("Expansion artifacts exceed the response budget.");
  }
  const payloads = await executor
    .select({
      publicationId: cmsEntryLocaleDeliverySnapshot.publicationId,
      document: cmsEntryLocaleDeliverySnapshot.document,
      referenceManifest: cmsEntryLocaleDeliverySnapshot.referenceManifest,
    })
    .from(cmsEntryLocaleDeliverySnapshot)
    .where(
      and(
        inArray(cmsEntryLocaleDeliverySnapshot.publicationId, publicationIds),
        eq(cmsEntryLocaleDeliverySnapshot.workspaceId, scope.workspaceId),
        eq(cmsEntryLocaleDeliverySnapshot.projectId, scope.projectId),
        eq(cmsEntryLocaleDeliverySnapshot.environmentId, scope.environmentId),
        eq(cmsEntryLocaleDeliverySnapshot.localeId, scope.localeId),
      ),
    );
  if (payloads.length !== publicationIds.length) {
    throw new DeliveryExpansionFailure("An expansion payload is unavailable.");
  }
  const payloadByPublication = new Map(payloads.map((row) => [row.publicationId, row]));
  return new Map(
    available.flatMap((row) => {
      const payload = payloadByPublication.get(row.publicationId);
      return payload === undefined ? [] : [[row.publicationId, { ...row, ...payload }] as const];
    }),
  );
}

/** Expands at most two breadth-first pinned-reference levels with cycle and aggregate bounds. */
async function expandArtifacts<A extends DeliveryArtifactRow>(
  executor: ApplicationExecutor,
  scope: ResolvedDeliveryScope,
  rows: ReadonlyArray<A>,
  requestedPaths: ReadonlyArray<string>,
  authenticated: boolean,
): Promise<ReadonlyArray<A>> {
  const budget = {
    usedBytes:
      deliveryResponseMetadataReserveBytes +
      rows.reduce(
        (total, row) =>
          total +
          Buffer.byteLength(JSON.stringify(row.document)) +
          Buffer.byteLength(JSON.stringify(row.referenceManifest)),
        0,
      ),
  };
  if (budget.usedBytes > maximumDeliveryResponseBytes) {
    throw new DeliveryResponseSizeFailure("Source artifacts exceed the response budget.");
  }
  if (requestedPaths.length === 0) return rows;
  const occurrences: Array<ExpansionOccurrence> = [];
  const matchedPaths = new Set<string>();
  rows.forEach((row, rowIndex) => {
    for (const rawManifest of row.referenceManifest) {
      const manifest = manifestReference(rawManifest);
      if (manifest === null) continue;
      const normalized = normalizedManifestPath(manifest.path);
      for (const requested of requestedPaths) {
        if (requested === normalized || requested.startsWith(`${normalized}.`)) {
          matchedPaths.add(requested);
          occurrences.push({
            rowIndex,
            sourcePublicationId: row.publicationId,
            manifest,
            nestedPath: requested === normalized ? null : requested.slice(normalized.length + 1),
          });
        }
      }
    }
  });
  if (matchedPaths.size !== requestedPaths.length || occurrences.length > 100) {
    throw new DeliveryExpansionFailure("Expansion paths or occurrences are invalid.");
  }
  const rootTargetIds = [
    ...new Set(
      occurrences.flatMap((occurrence) =>
        occurrence.manifest.targetPublicationId === occurrence.sourcePublicationId
          ? []
          : [occurrence.manifest.targetPublicationId],
      ),
    ),
  ];
  if (rootTargetIds.length > 50) {
    throw new DeliveryExpansionFailure("Expansion target limit exceeded.");
  }
  const rootTargets = await loadExpansionTargets(
    executor,
    scope,
    rootTargetIds,
    authenticated,
    budget,
  );

  const nestedOccurrences: Array<{
    readonly rootTargetId: string;
    readonly requestedPath: string;
    readonly manifest: ManifestReference;
  }> = [];
  for (const occurrence of occurrences) {
    if (occurrence.nestedPath === null) continue;
    const target = rootTargets.get(occurrence.manifest.targetPublicationId);
    if (target === undefined) continue;
    for (const rawManifest of target.referenceManifest) {
      const manifest = manifestReference(rawManifest);
      if (manifest !== null && normalizedManifestPath(manifest.path) === occurrence.nestedPath) {
        nestedOccurrences.push({
          rootTargetId: target.publicationId,
          requestedPath: occurrence.nestedPath,
          manifest,
        });
      }
    }
  }
  if (
    nestedOccurrences.length > 100 ||
    occurrences.some(
      (occurrence) =>
        occurrence.nestedPath !== null &&
        !nestedOccurrences.some(
          (nested) =>
            nested.rootTargetId === occurrence.manifest.targetPublicationId &&
            nested.requestedPath === occurrence.nestedPath,
        ),
    )
  ) {
    throw new DeliveryExpansionFailure("Nested expansion path is unavailable.");
  }
  const nestedTargetIds = [
    ...new Set(
      nestedOccurrences.flatMap((occurrence) =>
        occurrence.manifest.targetPublicationId === occurrence.rootTargetId ||
        rootTargetIds.includes(occurrence.manifest.targetPublicationId) ||
        rows.some((row) => row.publicationId === occurrence.manifest.targetPublicationId)
          ? []
          : [occurrence.manifest.targetPublicationId],
      ),
    ),
  ];
  if (new Set([...rootTargetIds, ...nestedTargetIds]).size > 50) {
    throw new DeliveryExpansionFailure("Expansion target limit exceeded.");
  }
  const nestedTargets = await loadExpansionTargets(
    executor,
    scope,
    nestedTargetIds,
    authenticated,
    budget,
  );

  return rows.map((row, rowIndex) => {
    const sourceData = structuredClone(Reflect.get(row.document, "data"));
    for (const occurrence of occurrences.filter((item) => item.rowIndex === rowIndex)) {
      if (occurrence.manifest.targetPublicationId === row.publicationId) continue;
      const target = rootTargets.get(occurrence.manifest.targetPublicationId);
      if (target === undefined) continue;
      const targetData = structuredClone(Reflect.get(target.document, "data"));
      for (const nested of nestedOccurrences.filter(
        (item) => item.rootTargetId === target.publicationId,
      )) {
        if (
          nested.manifest.targetPublicationId === target.publicationId ||
          nested.manifest.targetPublicationId === row.publicationId
        ) {
          continue;
        }
        const nestedTarget =
          nestedTargets.get(nested.manifest.targetPublicationId) ??
          rootTargets.get(nested.manifest.targetPublicationId);
        if (nestedTarget === undefined) continue;
        const nestedData = structuredClone(Reflect.get(nestedTarget.document, "data"));
        if (
          !replaceConcretePath(
            targetData,
            nested.manifest.path,
            expandedTargetValue(nestedTarget, nestedData),
          )
        ) {
          throw new DeliveryExpansionFailure("Nested expansion path could not be applied.");
        }
      }
      if (
        !replaceConcretePath(
          sourceData,
          occurrence.manifest.path,
          expandedTargetValue(target, targetData),
        )
      ) {
        throw new DeliveryExpansionFailure("Expansion path could not be applied.");
      }
    }
    return { ...row, document: { ...row.document, data: sourceData } };
  });
}

/** Reconstructs only the public immutable outer contract from persisted snapshot data. */
function decodeItem(row: DeliveryArtifactRow) {
  const data = Reflect.get(row.document, "data");
  return Schema.decodeUnknown(DeliveryItem)({
    id: row.entryId,
    collectionId: row.collectionId,
    collection: row.collectionKey,
    locale: row.locale,
    publication: {
      id: row.publicationId,
      sequence: row.publicationSequence,
      schemaRevisionId: row.schemaRevisionId,
      publishedAt: row.publishedAt.toISOString(),
    },
    data,
  }).pipe(Effect.mapError((cause) => databaseFailure("delivery.item.decode", cause)));
}

/** Ensures access did not become protected after the caller's authentication decision. */
function accessAllowed(scope: ResolvedDeliveryScope, authenticated: boolean): boolean {
  return scope.access === "public" || authenticated;
}

/** Compares all traversal authority after entering the final repeatable-read snapshot. */
function sameCursorAuthority(
  current: ResolvedDeliveryScope,
  expected: ResolvedDeliveryScope,
): "same" | "stale" | "invalid" {
  if (
    current.workspaceId !== expected.workspaceId ||
    current.environmentId !== expected.environmentId ||
    current.collectionId !== expected.collectionId ||
    current.localeId !== expected.localeId ||
    current.configVersion !== expected.configVersion ||
    current.schemaRevisionId !== expected.schemaRevisionId
  ) {
    return "invalid";
  }
  return current.generation === expected.generation ? "same" : "stale";
}

export interface DeliveryReadRepositoryService {
  readonly resolve: (
    input: DeliveryRouteScopeInput,
  ) => Effect.Effect<
    ResolvedDeliveryScope,
    NotFoundFailure | LocaleUnavailableFailure | DatabaseFailure
  >;
  readonly getCurrentById: (
    input: DeliveryRouteScopeInput,
    entryId: string,
    authenticated: boolean,
    requestedPaths: ReadonlyArray<string>,
  ) => Effect.Effect<
    DeliveryItem,
    | NotFoundFailure
    | LocaleUnavailableFailure
    | DeliveryQueryInvalidFailure
    | DeliveryResponseTooLargeFailure
    | DatabaseFailure
  >;
  readonly getByUnique: (
    input: DeliveryRouteScopeInput,
    fieldKey: string,
    rawValue: string,
    authenticated: boolean,
    requestedPaths: ReadonlyArray<string>,
  ) => Effect.Effect<
    DeliveryItem,
    | NotFoundFailure
    | LocaleUnavailableFailure
    | DeliveryQueryInvalidFailure
    | DeliveryResponseTooLargeFailure
    | DatabaseFailure
  >;
  readonly getImmutable: (
    input: DeliveryRouteScopeInput,
    entryId: string,
    publicationId: string,
    authenticated: boolean,
    requestedPaths: ReadonlyArray<string>,
  ) => Effect.Effect<
    DeliveryItem,
    | NotFoundFailure
    | LocaleUnavailableFailure
    | DeliveryQueryInvalidFailure
    | DeliveryResponseTooLargeFailure
    | DatabaseFailure
  >;
  readonly list: (
    input: DeliveryRouteScopeInput,
    rawQuery: string,
    authenticated: boolean,
  ) => Effect.Effect<
    DeliveryPage,
    | NotFoundFailure
    | LocaleUnavailableFailure
    | DeliveryQueryInvalidFailure
    | DeliveryCursorInvalidFailure
    | DeliveryCursorStaleFailure
    | DeliveryResponseTooLargeFailure
    | SecurityServiceFailure
    | DatabaseFailure,
    DeliveryCursorSigner
  >;
}

export interface DeliveryReadRepositoryOptions {
  readonly database?: ApplicationDb;
  readonly executor?: ApplicationExecutor;
  readonly runReadTransaction?: <A>(
    work: (transaction: ApplicationTransaction) => Promise<A>,
  ) => Promise<A>;
}

/** Creates the bounded Delivery read adapter over the shared pool. */
export function makeDeliveryReadRepository(
  options: DeliveryReadRepositoryOptions = {},
): DeliveryReadRepositoryService {
  const database = options.database ?? db;
  const executor = options.executor ?? database;
  const runReadTransaction =
    options.runReadTransaction ??
    (<A>(work: (transaction: ApplicationTransaction) => Promise<A>) =>
      database.transaction(work, { isolationLevel: "repeatable read", accessMode: "read only" }));
  return {
    resolve: Effect.fn("DeliveryReadRepository.resolve")(function* (input) {
      const result = yield* Effect.tryPromise({
        try: () => resolveScope(executor, input),
        catch: (cause) => databaseFailure("delivery.scope.resolve", cause),
      });
      if (result === "not_found") return yield* NotFoundFailure.make({ resource: "collection" });
      if (result === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      return result;
    }),

    getCurrentById: Effect.fn("DeliveryReadRepository.getCurrentById")(
      function* (input, entryId, authenticated, requestedPaths) {
        const result = yield* Effect.tryPromise({
          try: async () => {
            const scope = await resolveScope(executor, input);
            if (typeof scope === "string") return scope;
            if (!accessAllowed(scope, authenticated)) return "not_found" as const;
            const [row] = await executor
              .select({
                entryId: cmsEntryLocalePublication.entryId,
                collectionId: cmsEntryLocalePublication.collectionId,
                collectionKey: cmsCollection.apiKey,
                locale: projectLocale.tag,
                publicationId: cmsEntryLocalePublication.id,
                publicationSequence: cmsEntryLocalePublication.publicationSequence,
                schemaRevisionId: cmsEntryLocalePublication.schemaRevisionId,
                publishedAt: cmsEntryLocalePublication.publishedAt,
                document: cmsEntryLocaleDeliverySnapshot.document,
                referenceManifest: cmsEntryLocaleDeliverySnapshot.referenceManifest,
              })
              .from(cmsEntryLocalePublicationHead)
              .innerJoin(
                cmsEntryLocalePublication,
                eq(
                  cmsEntryLocalePublication.id,
                  cmsEntryLocalePublicationHead.currentPublicationId,
                ),
              )
              .innerJoin(
                cmsEntryLocaleDeliverySnapshot,
                eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
              )
              .innerJoin(
                cmsCollection,
                eq(cmsCollection.id, cmsEntryLocalePublication.collectionId),
              )
              .innerJoin(projectLocale, eq(projectLocale.id, cmsEntryLocalePublication.localeId))
              .where(
                and(
                  eq(cmsEntryLocalePublicationHead.entryId, sql.placeholder("entryId")),
                  eq(cmsEntryLocalePublicationHead.localeId, sql.placeholder("localeId")),
                  eq(cmsEntryLocalePublicationHead.collectionId, sql.placeholder("collectionId")),
                  eq(cmsEntryLocalePublicationHead.environmentId, sql.placeholder("environmentId")),
                  eq(cmsEntryLocalePublicationHead.projectId, sql.placeholder("projectId")),
                  sql`${cmsEntryLocalePublicationHead.currentPublicationId} is not null`,
                ),
              )
              .limit(1)
              .prepare("delivery_current_item_v1")
              .execute({
                entryId,
                localeId: scope.localeId,
                collectionId: scope.collectionId,
                environmentId: scope.environmentId,
                projectId: scope.projectId,
              });
            if (row === undefined) return "not_found";
            const expanded = await expandArtifacts(
              executor,
              scope,
              [row],
              requestedPaths,
              authenticated,
            );
            return expanded[0] ?? "not_found";
          },
          catch: (cause) => deliveryReadFailure("delivery.item.current", cause),
        });
        if (result === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
        if (result === "not_found") return yield* NotFoundFailure.make({ resource: "entry" });
        return yield* decodeItem(result);
      },
    ),

    getByUnique: Effect.fn("DeliveryReadRepository.getByUnique")(
      function* (input, fieldKey, rawValue, authenticated, requestedPaths) {
        const result = yield* Effect.tryPromise({
          try: async () => {
            const scope = await resolveScope(executor, input);
            if (typeof scope === "string") return { kind: scope } as const;
            if (!accessAllowed(scope, authenticated)) return { kind: "not_found" as const };
            const capability = await loadUniqueCapability(executor, scope, fieldKey);
            if (capability === null) return { kind: "unsupported" as const };
            const value = decodeDeliveryFilterValue(capability.kind, rawValue);
            if (value === null) return { kind: "invalid_value" as const };
            const column = projectionColumn(capability.kind);
            const [row] = await executor
              .select({
                entryId: cmsEntryLocalePublication.entryId,
                collectionId: cmsEntryLocalePublication.collectionId,
                collectionKey: cmsCollection.apiKey,
                locale: projectLocale.tag,
                publicationId: cmsEntryLocalePublication.id,
                publicationSequence: cmsEntryLocalePublication.publicationSequence,
                schemaRevisionId: cmsEntryLocalePublication.schemaRevisionId,
                publishedAt: cmsEntryLocalePublication.publishedAt,
                document: cmsEntryLocaleDeliverySnapshot.document,
                referenceManifest: cmsEntryLocaleDeliverySnapshot.referenceManifest,
              })
              .from(cmsEntryLocaleDeliveryCurrentValue)
              .innerJoin(
                cmsEntryLocalePublicationHead,
                and(
                  eq(
                    cmsEntryLocalePublicationHead.entryId,
                    cmsEntryLocaleDeliveryCurrentValue.entryId,
                  ),
                  eq(
                    cmsEntryLocalePublicationHead.localeId,
                    cmsEntryLocaleDeliveryCurrentValue.localeId,
                  ),
                  eq(
                    cmsEntryLocalePublicationHead.currentPublicationId,
                    cmsEntryLocaleDeliveryCurrentValue.publicationId,
                  ),
                ),
              )
              .innerJoin(
                cmsEntryLocalePublication,
                eq(cmsEntryLocalePublication.id, cmsEntryLocaleDeliveryCurrentValue.publicationId),
              )
              .innerJoin(
                cmsEntryLocaleDeliverySnapshot,
                eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
              )
              .innerJoin(
                cmsCollection,
                eq(cmsCollection.id, cmsEntryLocalePublication.collectionId),
              )
              .innerJoin(projectLocale, eq(projectLocale.id, cmsEntryLocalePublication.localeId))
              .where(
                and(
                  eq(cmsEntryLocaleDeliveryCurrentValue.localeId, scope.localeId),
                  eq(cmsEntryLocaleDeliveryCurrentValue.collectionId, scope.collectionId),
                  eq(cmsEntryLocaleDeliveryCurrentValue.fieldId, capability.fieldId),
                  eq(cmsEntryLocaleDeliveryCurrentValue.valueKind, capability.kind),
                  eq(cmsEntryLocaleDeliveryCurrentValue.uniqueLookup, true),
                  sql`${column} = ${sql.placeholder("value")}`,
                ),
              )
              .limit(1)
              .prepare(`delivery_unique_item_${capability.kind}_v1`)
              .execute({ value: value.value });
            if (row === undefined) return { kind: "not_found" as const };
            const expanded = await expandArtifacts(
              executor,
              scope,
              [row],
              requestedPaths,
              authenticated,
            );
            return { kind: "success" as const, row: expanded[0] };
          },
          catch: (cause) => deliveryReadFailure("delivery.item.unique", cause),
        });
        if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
        if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "entry" });
        if (result.kind === "unsupported" || result.kind === "invalid_value") {
          return yield* DeliveryQueryInvalidFailure.make({
            details: [
              {
                path: "value",
                code:
                  result.kind === "unsupported"
                    ? "unique_field_unsupported"
                    : "unique_value_invalid",
                message:
                  result.kind === "unsupported"
                    ? "This field is not configured for unique lookup."
                    : "The unique lookup value is invalid for this field kind.",
              },
            ],
          });
        }
        if (result.row === undefined) {
          return yield* databaseFailure(
            "delivery.item.unique",
            new Error("Unique Delivery lookup returned no row."),
          );
        }
        return yield* decodeItem(result.row);
      },
    ),

    getImmutable: Effect.fn("DeliveryReadRepository.getImmutable")(
      function* (input, entryId, publicationId, authenticated, requestedPaths) {
        const result = yield* Effect.tryPromise({
          try: async () => {
            const scope = await resolveScope(executor, input);
            if (typeof scope === "string") return scope;
            if (!accessAllowed(scope, authenticated)) return "not_found" as const;
            const [row] = await executor
              .select({
                entryId: cmsEntryLocalePublication.entryId,
                collectionId: cmsEntryLocalePublication.collectionId,
                collectionKey: cmsCollection.apiKey,
                locale: projectLocale.tag,
                publicationId: cmsEntryLocalePublication.id,
                publicationSequence: cmsEntryLocalePublication.publicationSequence,
                schemaRevisionId: cmsEntryLocalePublication.schemaRevisionId,
                publishedAt: cmsEntryLocalePublication.publishedAt,
                document: cmsEntryLocaleDeliverySnapshot.document,
                referenceManifest: cmsEntryLocaleDeliverySnapshot.referenceManifest,
              })
              .from(cmsEntryLocalePublication)
              .innerJoin(
                cmsEntryLocaleDeliverySnapshot,
                eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
              )
              .innerJoin(
                cmsCollection,
                eq(cmsCollection.id, cmsEntryLocalePublication.collectionId),
              )
              .innerJoin(projectLocale, eq(projectLocale.id, cmsEntryLocalePublication.localeId))
              .where(
                and(
                  eq(cmsEntryLocalePublication.id, publicationId),
                  eq(cmsEntryLocalePublication.entryId, entryId),
                  eq(cmsEntryLocalePublication.localeId, scope.localeId),
                  eq(cmsEntryLocalePublication.collectionId, scope.collectionId),
                  eq(cmsEntryLocalePublication.environmentId, scope.environmentId),
                  eq(cmsEntryLocalePublication.projectId, scope.projectId),
                ),
              )
              .limit(1);
            if (row === undefined) return "not_found";
            const expanded = await expandArtifacts(
              executor,
              scope,
              [row],
              requestedPaths,
              authenticated,
            );
            return expanded[0] ?? "not_found";
          },
          catch: (cause) => deliveryReadFailure("delivery.item.immutable", cause),
        });
        if (result === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
        if (result === "not_found") return yield* NotFoundFailure.make({ resource: "publication" });
        return yield* decodeItem(result);
      },
    ),

    list: Effect.fn("DeliveryReadRepository.list")(function* (input, rawQuery, authenticated) {
      const initial = yield* Effect.tryPromise({
        try: async () => {
          const scope = await resolveScope(executor, input);
          if (typeof scope === "string") return scope;
          const capabilities = await loadCapabilities(executor, scope);
          return { scope, capabilities };
        },
        catch: (cause) => databaseFailure("delivery.list.authority", cause),
      });
      if (initial === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (initial === "not_found" || !accessAllowed(initial.scope, authenticated)) {
        return yield* NotFoundFailure.make({ resource: "collection" });
      }
      const parsed = parseDeliveryListQuery(rawQuery, initial.capabilities);
      if (!parsed.ok)
        return yield* DeliveryQueryInvalidFailure.make({ details: [...parsed.issues] });
      const signer = yield* DeliveryCursorSigner;
      const cursor =
        parsed.value.cursor === null
          ? null
          : yield* signer.verify(parsed.value.cursor, {
              projectId: initial.scope.projectId,
              environmentId: initial.scope.environmentId,
              collectionId: initial.scope.collectionId,
              localeId: initial.scope.localeId,
              configVersion: initial.scope.configVersion,
              schemaRevisionId: initial.scope.schemaRevisionId,
              generation: initial.scope.generation,
              queryHash: parsed.value.queryHash,
            });

      const page = yield* Effect.tryPromise({
        try: () =>
          runReadTransaction(async (transaction) => {
            await transaction.execute(sql`set local statement_timeout = '750ms'`);
            await transaction.execute(
              sql`set local idle_in_transaction_session_timeout = '2000ms'`,
            );
            const scope = await resolveScope(transaction, input);
            if (typeof scope === "string" || !accessAllowed(scope, authenticated)) {
              return { kind: "not_found" as const };
            }
            const authority = sameCursorAuthority(scope, initial.scope);
            if (authority === "invalid") return { kind: "invalid" as const };
            if (authority === "stale") return { kind: "stale" as const };
            const sort = sortExpression(scope, parsed.value);
            const predicates: Array<SQL> = [
              eq(cmsEntryLocalePublicationHead.localeId, scope.localeId),
              eq(cmsEntryLocalePublicationHead.collectionId, scope.collectionId),
              eq(cmsEntryLocalePublicationHead.environmentId, scope.environmentId),
              eq(cmsEntryLocalePublicationHead.projectId, scope.projectId),
              sql`${cmsEntryLocalePublicationHead.currentPublicationId} is not null`,
              ...filterPredicates(scope, parsed.value),
            ];
            if (cursor !== null) {
              if (sort === null) {
                predicates.push(
                  sql`${cmsEntryLocalePublicationHead.entryId} > ${cursor.finalEntryId}`,
                );
              } else if (cursor.sort?.value === null) {
                predicates.push(
                  sql`${sort} is null and ${cmsEntryLocalePublicationHead.entryId} > ${cursor.finalEntryId}`,
                );
              } else if (cursor.sort !== null) {
                const ordered =
                  parsed.value.sort?.direction === "desc"
                    ? sql`${sort} < ${cursor.sort.value}`
                    : sql`${sort} > ${cursor.sort.value}`;
                predicates.push(
                  sql`((${sort} is not null and (${ordered} or (${sort} = ${cursor.sort.value} and ${cmsEntryLocalePublicationHead.entryId} > ${cursor.finalEntryId}))) or ${sort} is null)`,
                );
              }
            }
            const order =
              sort === null
                ? [sql`${cmsEntryLocalePublicationHead.entryId} asc`]
                : parsed.value.sort?.direction === "desc"
                  ? [
                      sql`${sort} is null asc`,
                      sql`${sort} desc`,
                      sql`${cmsEntryLocalePublicationHead.entryId} asc`,
                    ]
                  : [
                      sql`${sort} is null asc`,
                      sql`${sort} asc`,
                      sql`${cmsEntryLocalePublicationHead.entryId} asc`,
                    ];
            const rows = await transaction
              .select({
                entryId: cmsEntryLocalePublication.entryId,
                collectionId: cmsEntryLocalePublication.collectionId,
                collectionKey: cmsCollection.apiKey,
                locale: projectLocale.tag,
                publicationId: cmsEntryLocalePublication.id,
                publicationSequence: cmsEntryLocalePublication.publicationSequence,
                schemaRevisionId: cmsEntryLocalePublication.schemaRevisionId,
                publishedAt: cmsEntryLocalePublication.publishedAt,
                document: cmsEntryLocaleDeliverySnapshot.document,
                referenceManifest: cmsEntryLocaleDeliverySnapshot.referenceManifest,
                sortValue: sort ?? sql<null>`null`,
              })
              .from(cmsEntryLocalePublicationHead)
              .innerJoin(
                cmsEntryLocalePublication,
                eq(
                  cmsEntryLocalePublication.id,
                  cmsEntryLocalePublicationHead.currentPublicationId,
                ),
              )
              .innerJoin(
                cmsEntryLocaleDeliverySnapshot,
                eq(cmsEntryLocaleDeliverySnapshot.publicationId, cmsEntryLocalePublication.id),
              )
              .innerJoin(
                cmsCollection,
                eq(cmsCollection.id, cmsEntryLocalePublication.collectionId),
              )
              .innerJoin(projectLocale, eq(projectLocale.id, cmsEntryLocalePublication.localeId))
              .where(and(...predicates))
              .orderBy(...order)
              .limit(parsed.value.limit + 1);
            const hasMore = rows.length > parsed.value.limit;
            const expandedRows = await expandArtifacts(
              transaction,
              scope,
              rows.slice(0, parsed.value.limit),
              parsed.value.expand,
              authenticated,
            );
            return { kind: "success" as const, scope, rows: expandedRows, hasMore };
          }),
        catch: (cause) => deliveryReadFailure("delivery.list.query", cause),
      });
      if (page.kind === "not_found") return yield* NotFoundFailure.make({ resource: "collection" });
      if (page.kind === "invalid") return yield* DeliveryCursorInvalidFailure.make();
      if (page.kind === "stale") return yield* DeliveryCursorStaleFailure.make();

      const hasMore = page.hasMore;
      const visibleRows = page.rows;
      const items = yield* Effect.forEach(visibleRows, decodeItem);
      const final = visibleRows.at(-1);
      const nextCursor =
        hasMore && final !== undefined
          ? yield* signer.sign({
              projectId: page.scope.projectId,
              environmentId: page.scope.environmentId,
              collectionId: page.scope.collectionId,
              localeId: page.scope.localeId,
              configVersion: page.scope.configVersion,
              schemaRevisionId: page.scope.schemaRevisionId,
              generation: page.scope.generation,
              queryHash: parsed.value.queryHash,
              sort:
                parsed.value.sort === null
                  ? null
                  : {
                      kind: parsed.value.sort.kind,
                      direction: parsed.value.sort.direction,
                      value:
                        typeof final.sortValue === "string" ||
                        typeof final.sortValue === "number" ||
                        typeof final.sortValue === "boolean"
                          ? final.sortValue
                          : null,
                      entryId: final.entryId,
                    },
              finalEntryId: final.entryId,
            })
          : null;
      return yield* Schema.decodeUnknown(DeliveryPage)({
        items,
        page: { limit: parsed.value.limit, nextCursor, hasMore },
      }).pipe(Effect.mapError((cause) => databaseFailure("delivery.list.decode", cause)));
    }),
  };
}

export class DeliveryReadRepository extends Context.Tag("DeliveryReadRepository")<
  DeliveryReadRepository,
  DeliveryReadRepositoryService
>() {}

export const DeliveryReadRepositoryLive = Layer.succeed(
  DeliveryReadRepository,
  makeDeliveryReadRepository(),
);
