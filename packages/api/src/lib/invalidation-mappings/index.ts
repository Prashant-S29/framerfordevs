// Matches bounded persisted route mappings into deterministic publication invalidation snapshots.

export type PublicationInvalidationEventType =
  | "cms.schema.published"
  | "cms.entry.published"
  | "cms.entry.unpublished";

export interface InvalidationMappingRecord {
  readonly eventTypes: ReadonlyArray<string>;
  readonly entryId: string | null;
  readonly localeId: string | null;
  readonly routePath: string;
  readonly semanticTags: ReadonlyArray<string>;
}

export interface PublicationInvalidationScope {
  readonly eventType: PublicationInvalidationEventType;
  readonly entryId: string | null;
  readonly localeId: string | null;
}

export interface PublicationInvalidationSnapshot {
  readonly semanticTags: ReadonlyArray<string>;
  readonly routes: ReadonlyArray<string>;
}

function uniqueSorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function matches(mapping: InvalidationMappingRecord, scope: PublicationInvalidationScope): boolean {
  if (!mapping.eventTypes.includes(scope.eventType)) return false;
  if (scope.eventType === "cms.schema.published") {
    return mapping.entryId === null && mapping.localeId === null;
  }
  return (
    (mapping.entryId === null || mapping.entryId === scope.entryId) &&
    (mapping.localeId === null || mapping.localeId === scope.localeId)
  );
}

/** Produces the exact immutable mapping contribution observed by a publication transaction. */
export function matchInvalidationMappings(
  mappings: ReadonlyArray<InvalidationMappingRecord>,
  scope: PublicationInvalidationScope,
): PublicationInvalidationSnapshot {
  const matched = mappings.filter((mapping) => matches(mapping, scope));
  return {
    semanticTags: uniqueSorted(matched.flatMap((mapping) => mapping.semanticTags)),
    routes: uniqueSorted(matched.map((mapping) => mapping.routePath)),
  };
}
