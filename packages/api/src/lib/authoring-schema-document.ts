// Validates complete code-owned project documents and binds deterministic plans to current authority.

import { createHash } from "node:crypto";

import type { ProjectSchema } from "@framerfordevs/schema";
import { isProjectSchema, validateProjectSchema } from "@framerfordevs/schema/validate";

import {
  type CollectionSourceKey,
  type ProjectStructureManifestHash,
  SchemaPlanHash,
  type SchemaPlanHash as SchemaPlanHashType,
} from "../contracts/authoring";
import {
  canonicalizeSchemaDocument,
  validateAggregateSchemaDocument,
} from "./field-system-document";

export interface AuthoringSchemaDocumentIssue {
  readonly path: string;
  readonly code: string;
}

export type ValidateCompleteProjectSchemaResult =
  | {
      readonly valid: true;
      readonly project: ProjectSchema;
      readonly canonicalJson: string;
      readonly bytes: number;
    }
  | { readonly valid: false; readonly issues: ReadonlyArray<AuthoringSchemaDocumentIssue> };

/**
 * Validates the closed shared schema contract and proves that no currently active collection was
 * omitted. New collection source keys are allowed; omission never means deletion.
 */
export function validateCompleteProjectSchema(
  value: unknown,
  activeCollectionSourceKeys: ReadonlyArray<CollectionSourceKey>,
): ValidateCompleteProjectSchemaResult {
  const aggregate = validateAggregateSchemaDocument(value);
  if (!aggregate.valid || aggregate.canonical === null) {
    return {
      valid: false,
      issues: aggregate.issues.map(({ path, code }) => ({ path, code })),
    };
  }

  if (!isProjectSchema(value)) {
    const validation = validateProjectSchema(value);
    return {
      valid: false,
      issues: validation.valid
        ? [{ path: "$", code: "schema_invalid" }]
        : validation.issues.map(({ path, code }) => ({ path, code })),
    };
  }

  const submitted = new Set(value.collections.map((collection) => collection.sourceKey));
  const issues = activeCollectionSourceKeys
    .filter((sourceKey) => !submitted.has(sourceKey))
    .sort()
    .slice(0, 50)
    .map((sourceKey) => ({
      path: `$.collections[sourceKey=${sourceKey}]`,
      code: "active_collection_omitted",
    }));
  if (issues.length > 0) return { valid: false, issues };

  return {
    valid: true,
    project: value,
    canonicalJson: aggregate.canonical,
    bytes: aggregate.bytes,
  };
}

/** Binds the exact canonical code document to the current project structural authority. */
export function computeSchemaPlanHash(
  canonicalProjectJson: string,
  currentManifestHash: ProjectStructureManifestHash,
): SchemaPlanHashType {
  const canonicalPlanAuthority = canonicalizeSchemaDocument({
    currentManifestHash,
    project: canonicalProjectJson,
    version: 1,
  });
  return SchemaPlanHash.make(
    createHash("sha256").update(canonicalPlanAuthority, "utf8").digest("hex"),
  );
}
