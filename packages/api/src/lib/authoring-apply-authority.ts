// Qualifies collection changes for project scope and fingerprints exact atomic apply authority.

import { createHash } from "node:crypto";

import { Either, Schema } from "effect";

import {
  type AuthoringSchemaAuthority,
  type CmsActor,
  CollectionSourceKey,
  FieldSourceKey,
  type SchemaApplyCommandId,
  SchemaApplyFingerprint,
  type SchemaApplyFingerprint as SchemaApplyFingerprintType,
  type SchemaPlanHash,
} from "../contracts/authoring";
import { AuthoringSchemaChange } from "../contracts/authoring-schema";
import type { ProjectId, EnvironmentId } from "../contracts/platform";
import { SchemaChangeId, type SchemaChangeSet } from "../contracts/schemas";
import type { AcknowledgedAuthoringSchemaChangeIds } from "../contracts/authoring-schema";
import { canonicalizeSchemaDocument } from "./field-system-document";

export type QualifyProjectSchemaChangesResult =
  | { readonly valid: true; readonly changes: ReadonlyArray<AuthoringSchemaChange> }
  | {
      readonly valid: false;
      readonly issues: ReadonlyArray<{
        readonly path: string;
        readonly code: "source_identity_missing";
      }>;
    };

/** Ensures collection-level M5/M6 change IDs cannot collide in one complete-project plan. */
export function qualifyProjectSchemaChanges(
  collectionSourceKey: string,
  changes: SchemaChangeSet,
  fieldSourceKeysById: ReadonlyMap<string, string>,
): QualifyProjectSchemaChangesResult {
  const qualified: Array<AuthoringSchemaChange> = [];
  const issues: Array<{ readonly path: string; readonly code: "source_identity_missing" }> = [];
  const decodedCollectionSourceKey =
    Schema.decodeUnknownEither(CollectionSourceKey)(collectionSourceKey);
  if (Either.isLeft(decodedCollectionSourceKey)) {
    return {
      valid: false,
      issues: [{ path: "collectionSourceKey", code: "source_identity_missing" }],
    };
  }
  const presentationOnlyCodes = new Set([
    "collection.metadata.updated",
    "editor_layout.updated",
    "field.label.updated",
    "field.position.updated",
    "field.editor.updated",
  ]);
  for (const change of changes.items) {
    if (presentationOnlyCodes.has(change.code)) continue;
    const fieldSourceKey =
      change.fieldId === null ? null : (fieldSourceKeysById.get(change.fieldId) ?? null);
    if (change.fieldId !== null && fieldSourceKey === null) {
      issues.push({
        path: `changes.${change.changeId}.fieldId`,
        code: "source_identity_missing",
      });
      continue;
    }
    const decodedFieldSourceKey =
      fieldSourceKey === null ? null : Schema.decodeUnknownEither(FieldSourceKey)(fieldSourceKey);
    if (decodedFieldSourceKey !== null && Either.isLeft(decodedFieldSourceKey)) {
      issues.push({
        path: `changes.${change.changeId}.fieldId`,
        code: "source_identity_missing",
      });
      continue;
    }
    const changeId = SchemaChangeId.make(
      createHash("sha256")
        .update(
          canonicalizeSchemaDocument({
            version: 1,
            collectionSourceKey,
            fieldSourceKey,
            code: change.code,
          }),
          "utf8",
        )
        .digest("hex"),
    );
    qualified.push(
      AuthoringSchemaChange.make({
        changeId,
        code: change.code,
        classification: change.classification,
        collectionSourceKey: decodedCollectionSourceKey.right,
        fieldSourceKey: decodedFieldSourceKey?.right ?? null,
        summary: change.summary,
      }),
    );
  }
  return issues.length > 0 ? { valid: false, issues } : { valid: true, changes: qualified };
}

export function hasExactProjectSchemaAcknowledgements(
  changes: ReadonlyArray<AuthoringSchemaChange>,
  acknowledgedChangeIds: AcknowledgedAuthoringSchemaChangeIds,
): boolean {
  const required = changes.filter((change) => change.classification !== "non_breaking");
  const acknowledged = new Set<string>(acknowledgedChangeIds);
  return (
    required.length === acknowledged.size &&
    required.every((change) => acknowledged.has(change.changeId))
  );
}

/** Fingerprints the actor, exact document, stale authority, plan, command, and acknowledgement set. */
export function fingerprintAuthoringSchemaApply(options: {
  readonly actor: CmsActor;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly commandId: SchemaApplyCommandId;
  readonly canonicalProjectJson: string;
  readonly expectedCurrent: AuthoringSchemaAuthority;
  readonly expectedPlanHash: SchemaPlanHash;
  readonly acknowledgedChangeIds: AcknowledgedAuthoringSchemaChangeIds;
}): SchemaApplyFingerprintType {
  const canonical = canonicalizeSchemaDocument({
    version: 1,
    actor: options.actor,
    projectId: options.projectId,
    environmentId: options.environmentId,
    commandId: options.commandId,
    project: options.canonicalProjectJson,
    expectedCurrent: options.expectedCurrent,
    expectedPlanHash: options.expectedPlanHash,
    acknowledgedChangeIds: [...options.acknowledgedChangeIds].sort(),
  });
  return SchemaApplyFingerprint.make(createHash("sha256").update(canonical, "utf8").digest("hex"));
}
