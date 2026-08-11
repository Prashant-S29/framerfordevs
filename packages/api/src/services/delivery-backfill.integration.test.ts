// Exercises the operator backfill's read-only whole-database preflight without mutating publication authority.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { runDeliveryBackfill } from "./delivery-backfill";

describe("Delivery backfill integration", () => {
  it.effect(
    "scans current heads in bounded keyset batches and reports only content-free counts",
    () =>
      Effect.gen(function* () {
        const report = yield* runDeliveryBackfill({ mode: "dry_run", batchSize: 500 });

        assert.strictEqual(report.mode, "dry_run");
        assert.isAtLeast(report.currentHeadCount, 0);
        assert.isAtLeast(report.projectionRowCount, 0);
        assert.isAtLeast(report.collectionLocaleCount, 0);
        assert.strictEqual(report.duplicateUniqueClaimCount, 0);
        assert.strictEqual(report.invalidSnapshotCount, 0);
        assert.strictEqual(report.appliedHeadCount, 0);
      }),
    30_000,
  );

  it.effect("rejects an operator-controlled batch outside the closed bound before querying", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(runDeliveryBackfill({ mode: "dry_run", batchSize: 0 }));
      assert.isTrue(Exit.isFailure(exit));
    }),
  );
});
