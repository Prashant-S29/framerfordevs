// Rebuilds every collection with real server allocations before the atomic apply persistence phase.

import type { ProjectSchema } from "@framerfordevs/schema";

import type { AuthoringSchemaChange } from "../../../contracts/authoring/schema";
import type { CmsCollection, PublishedSchemaRevision } from "../../../contracts/schema";
import { qualifyProjectSchemaChanges } from "../apply-authority";
import type { CodeLayoutAllocations } from "../layout";
import { buildResolvedSchemaCandidate, type ResolvedSchemaCandidate } from "../resolved";
import type { StructureIdentityMap } from "../hash";

export interface AllocatedCollectionApplyState {
  readonly sourceKey: string;
  readonly collection: CmsCollection;
  readonly currentPublished: PublishedSchemaRevision | null;
  readonly layoutAllocations: CodeLayoutAllocations;
}

export interface AllocatedProjectCollectionCandidate {
  readonly sourceKey: string;
  readonly candidate: ResolvedSchemaCandidate;
}

export type BuildAllocatedProjectCandidatesResult =
  | {
      readonly valid: true;
      readonly collections: ReadonlyArray<AllocatedProjectCollectionCandidate>;
      readonly changes: ReadonlyArray<AuthoringSchemaChange>;
    }
  | {
      readonly valid: false;
      readonly issues: ReadonlyArray<{
        readonly path: string;
        readonly code: string;
      }>;
    };

/**
 * Rebuilds from the exact submitted document after IDs are allocated under project locks. No
 * provisional identity can cross this boundary into persistence.
 */
export function buildAllocatedProjectCandidates(options: {
  readonly project: ProjectSchema;
  readonly identities: StructureIdentityMap;
  readonly collections: ReadonlyArray<AllocatedCollectionApplyState>;
}): BuildAllocatedProjectCandidatesResult {
  const states = new Map(options.collections.map((state) => [state.sourceKey, state]));
  const collections: Array<AllocatedProjectCollectionCandidate> = [];
  const changes: Array<AuthoringSchemaChange> = [];
  const issues: Array<{ readonly path: string; readonly code: string }> = [];

  for (const schema of options.project.collections) {
    const state = states.get(schema.sourceKey);
    if (!state) {
      issues.push({
        path: `$.collections.${schema.sourceKey}`,
        code: "allocated_collection_missing",
      });
      continue;
    }
    const candidate = buildResolvedSchemaCandidate({
      schema,
      collection: state.collection,
      identities: options.identities,
      currentPublished: state.currentPublished,
      layoutAllocations: state.layoutAllocations,
    });
    if (!candidate.valid) {
      issues.push(...candidate.issues.map(({ path, code }) => ({ path, code })));
      continue;
    }
    const fieldSourceKeysById = new Map(
      options.identities.fields
        .filter((identity) => identity.collectionSourceKey === schema.sourceKey)
        .map((identity) => [identity.fieldId, identity.sourceKey]),
    );
    const qualified = qualifyProjectSchemaChanges(
      schema.sourceKey,
      candidate.candidate.changes,
      fieldSourceKeysById,
    );
    if (!qualified.valid) {
      issues.push(...qualified.issues);
      continue;
    }
    collections.push({ sourceKey: schema.sourceKey, candidate: candidate.candidate });
    changes.push(...qualified.changes);
  }

  if (states.size !== options.project.collections.length) {
    for (const sourceKey of states.keys()) {
      if (!options.project.collections.some((schema) => schema.sourceKey === sourceKey)) {
        issues.push({
          path: `collections.${sourceKey}`,
          code: "allocated_collection_extraneous",
        });
      }
    }
  }

  return issues.length > 0
    ? { valid: false, issues: issues.slice(0, 50) }
    : { valid: true, collections, changes };
}
