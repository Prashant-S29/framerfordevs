// Verifies stale authority, plan correlation, acknowledgements, and idempotent replay before writes.

import type {
  AuthoringSchemaAuthority,
  SchemaApplyCommandId,
  SchemaApplyFingerprint,
  SchemaPlanHash,
} from "../../../contracts/authoring";
import type {
  AcknowledgedAuthoringSchemaChangeIds,
  AuthoringSchemaChange,
  AuthoringSchemaPlan,
} from "../../../contracts/authoring/schema";
import { canonicalizeSchemaDocument } from "../../field/document";
import { hasExactProjectSchemaAcknowledgements } from "../apply-authority";

export type VerifyAuthoringSchemaApplyResult =
  | { readonly accepted: true }
  | {
      readonly accepted: false;
      readonly code:
        | "stale_schema_authority"
        | "schema_plan_invalid"
        | "schema_plan_mismatch"
        | "schema_acknowledgement_mismatch";
    };

/** Requires exact current manifest/revisions, recomputed plan hash, and exact risky acknowledgements. */
export function verifyAuthoringSchemaApply(options: {
  readonly expectedCurrent: AuthoringSchemaAuthority;
  readonly actualCurrent: AuthoringSchemaAuthority;
  readonly expectedPlanHash: SchemaPlanHash;
  readonly actualPlan: AuthoringSchemaPlan;
  readonly acknowledgedChangeIds: AcknowledgedAuthoringSchemaChangeIds;
}): VerifyAuthoringSchemaApplyResult {
  if (
    canonicalizeSchemaDocument(options.expectedCurrent) !==
    canonicalizeSchemaDocument(options.actualCurrent)
  ) {
    return { accepted: false, code: "stale_schema_authority" };
  }
  if (!options.actualPlan.valid) return { accepted: false, code: "schema_plan_invalid" };
  if (options.actualPlan.planHash !== options.expectedPlanHash) {
    return { accepted: false, code: "schema_plan_mismatch" };
  }
  if (
    !hasExactProjectSchemaAcknowledgements(
      options.actualPlan.changes,
      options.acknowledgedChangeIds,
    )
  ) {
    return { accepted: false, code: "schema_acknowledgement_mismatch" };
  }
  return { accepted: true };
}

/** Proves post-allocation rebuilding produced the exact source-qualified plan changes. */
export function hasExactAllocatedProjectChanges(
  planned: ReadonlyArray<AuthoringSchemaChange>,
  allocated: ReadonlyArray<AuthoringSchemaChange>,
): boolean {
  const canonical = (changes: ReadonlyArray<AuthoringSchemaChange>) =>
    canonicalizeSchemaDocument(
      [...changes].sort((left, right) => left.changeId.localeCompare(right.changeId)),
    );
  return canonical(planned) === canonical(allocated);
}

export interface ExistingSchemaApplyReceipt<Result> {
  readonly commandId: SchemaApplyCommandId;
  readonly fingerprint: SchemaApplyFingerprint;
  readonly result: Result;
}

export type SchemaApplyReplayDecision<Result> =
  | { readonly kind: "proceed" }
  | { readonly kind: "replay"; readonly result: Result }
  | { readonly kind: "command_conflict" };

/** Distinguishes a safe exact replay from command-ID reuse with different authority or content. */
export function decideSchemaApplyReplay<Result>(
  commandId: SchemaApplyCommandId,
  fingerprint: SchemaApplyFingerprint,
  existing: ExistingSchemaApplyReceipt<Result> | null,
): SchemaApplyReplayDecision<Result> {
  if (existing === null) return { kind: "proceed" };
  if (existing.commandId === commandId && existing.fingerprint === fingerprint) {
    return { kind: "replay", result: existing.result };
  }
  return { kind: "command_conflict" };
}
