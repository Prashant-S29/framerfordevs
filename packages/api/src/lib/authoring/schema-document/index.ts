import { createHash } from "node:crypto";

import type { ProjectSchema } from "@framerfordevs/schema";
import { isProjectSchema, validateProjectSchema } from "@framerfordevs/schema/validate";

import {
  type CollectionSourceKey,
  type ProjectStructureManifestHash,
  SchemaPlanHash,
  type SchemaPlanHash as SchemaPlanHashType,
} from "../../../contracts/authoring";
import { canonicalizeSchemaDocument, validateAggregateSchemaDocument } from "../../field/document";

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
