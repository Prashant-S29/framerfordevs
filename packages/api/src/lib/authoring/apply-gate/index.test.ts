import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AuthoringSchemaAuthority,
  CollectionSourceKey,
  ProjectStructureManifestHash,
  SchemaApplyCommandId,
  SchemaApplyFingerprint,
  SchemaPlanHash,
} from "../../../contracts/authoring";
import {
  AcknowledgedAuthoringSchemaChangeIds,
  AuthoringSchemaPlan,
} from "../../../contracts/authoring/schema";
import { SchemaChangeId, SchemaRevisionId } from "../../../contracts/schema";
import {
  decideSchemaApplyReplay,
  hasExactAllocatedProjectChanges,
  verifyAuthoringSchemaApply,
} from "./index";

const posts = CollectionSourceKey.make("posts");
const revisionId = SchemaRevisionId.make("019fae8b-1234-7000-8000-000000000901");
const planHash = SchemaPlanHash.make("a".repeat(64));
const changeId = SchemaChangeId.make("b".repeat(64));
const current = AuthoringSchemaAuthority.make({
  projectManifestHash: ProjectStructureManifestHash.make("c".repeat(64)),
  revisionIds: { [posts]: revisionId },
});
const plan = Schema.decodeUnknownSync(AuthoringSchemaPlan)({
  valid: true,
  current,
  planHash,
  issues: [],
  changes: [
    {
      changeId,
      code: "field.added.required",
      classification: "potentially_breaking",
      collectionSourceKey: posts,
      fieldSourceKey: "title",
      summary: "A required field was added.",
    },
  ],
  candidates: [],
});

function acknowledgements(...ids: ReadonlyArray<SchemaChangeId>) {
  return Schema.decodeUnknownSync(AcknowledgedAuthoringSchemaChangeIds)(ids);
}

describe("Authoring schema apply gate", () => {
  it("accepts only exact current authority, recomputed plan, and risky acknowledgements", () => {
    assert.deepStrictEqual(
      verifyAuthoringSchemaApply({
        expectedCurrent: current,
        actualCurrent: current,
        expectedPlanHash: planHash,
        actualPlan: plan,
        acknowledgedChangeIds: acknowledgements(changeId),
      }),
      { accepted: true },
    );
  });

  it("rejects stale authority before considering otherwise matching plan data", () => {
    const stale = AuthoringSchemaAuthority.make({
      projectManifestHash: ProjectStructureManifestHash.make("d".repeat(64)),
      revisionIds: { [posts]: revisionId },
    });
    const result = verifyAuthoringSchemaApply({
      expectedCurrent: stale,
      actualCurrent: current,
      expectedPlanHash: planHash,
      actualPlan: plan,
      acknowledgedChangeIds: acknowledgements(changeId),
    });

    assert.deepStrictEqual(result, { accepted: false, code: "stale_schema_authority" });
  });

  it("rejects plan mismatch and both missing and extraneous acknowledgements", () => {
    const mismatchedPlan = verifyAuthoringSchemaApply({
      expectedCurrent: current,
      actualCurrent: current,
      expectedPlanHash: SchemaPlanHash.make("e".repeat(64)),
      actualPlan: plan,
      acknowledgedChangeIds: acknowledgements(changeId),
    });
    const missing = verifyAuthoringSchemaApply({
      expectedCurrent: current,
      actualCurrent: current,
      expectedPlanHash: planHash,
      actualPlan: plan,
      acknowledgedChangeIds: acknowledgements(),
    });
    const extra = verifyAuthoringSchemaApply({
      expectedCurrent: current,
      actualCurrent: current,
      expectedPlanHash: planHash,
      actualPlan: plan,
      acknowledgedChangeIds: acknowledgements(changeId, SchemaChangeId.make("f".repeat(64))),
    });

    assert.strictEqual(mismatchedPlan.accepted, false);
    assert.deepStrictEqual(missing, {
      accepted: false,
      code: "schema_acknowledgement_mismatch",
    });
    assert.deepStrictEqual(extra, {
      accepted: false,
      code: "schema_acknowledgement_mismatch",
    });
  });

  it("requires post-allocation changes to equal the read-only plan exactly", () => {
    if (!plan.valid) throw new Error("Expected a valid plan fixture.");
    const reordered = [...plan.changes].reverse();
    const changed = plan.changes.map((change) => ({
      ...change,
      summary: "Different structural change.",
    }));

    assert.isTrue(hasExactAllocatedProjectChanges(plan.changes, reordered));
    assert.isFalse(hasExactAllocatedProjectChanges(plan.changes, changed));
  });

  it("replays only an exact command fingerprint and rejects command reuse", () => {
    const commandId = SchemaApplyCommandId.make("019fae8b-1234-7000-8000-000000000902");
    const fingerprint = SchemaApplyFingerprint.make("1".repeat(64));
    const receipt = { commandId, fingerprint, result: { revision: revisionId } };

    assert.deepStrictEqual(decideSchemaApplyReplay(commandId, fingerprint, null), {
      kind: "proceed",
    });
    assert.deepStrictEqual(decideSchemaApplyReplay(commandId, fingerprint, receipt), {
      kind: "replay",
      result: { revision: revisionId },
    });
    assert.deepStrictEqual(
      decideSchemaApplyReplay(commandId, SchemaApplyFingerprint.make("2".repeat(64)), receipt),
      { kind: "command_conflict" },
    );
  });
});
