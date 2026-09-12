import { assert, describe, it } from "@effect/vitest";
import { Effect, TestClock } from "effect";

import { makeControlPlaneCursorSigner } from "./index";

const authority = {
  route: "projects" as const,
  principalKey: "oauth:framerfordevs-cli:user-1",
  workspaceId: "019fae8b-1234-7000-8000-000000000001",
  projectStatus: "active" as const,
  limit: 20,
};
const position = {
  finalSortAtEpochMs: 1_800_000_000_000,
  finalId: "019fae8b-1234-7000-8000-000000000002",
};
const signer = makeControlPlaneCursorSigner({ activeSecret: "a".repeat(32) });

describe("Control Plane cursor signer", () => {
  it.effect("round-trips one bounded authority-bound cursor", () =>
    Effect.gen(function* () {
      const cursor = yield* signer.sign(authority, position);
      const decoded = yield* signer.verify(cursor, authority);

      assert.isAtMost(cursor.length, 512);
      assert.deepEqual(decoded, position);
    }),
  );

  it.effect("rejects tampering and every authority substitution", () =>
    Effect.gen(function* () {
      const cursor = yield* signer.sign(authority, position);
      const variants = [
        { ...authority, route: "workspaces" as const },
        { ...authority, principalKey: "oauth:framerfordevs-cli:user-2" },
        { ...authority, workspaceId: "019fae8b-1234-7000-8000-000000000099" },
        { ...authority, projectStatus: "archived" as const },
        { ...authority, limit: 21 },
      ];
      const failures = yield* Effect.all([
        Effect.flip(signer.verify(`${cursor.slice(0, -1)}x`, authority)),
        ...variants.map((variant) => Effect.flip(signer.verify(cursor, variant))),
      ]);

      assert.isTrue(
        failures.every((failure) => failure._tag === "ControlPlaneCursorInvalidFailure"),
      );
    }),
  );

  it.effect("rejects expired, oversized, and malformed cursors", () =>
    Effect.gen(function* () {
      const cursor = yield* signer.sign(authority, position);
      const malformed = yield* Effect.flip(signer.verify("not.a.cursor", authority));
      const oversized = yield* Effect.flip(signer.verify("a".repeat(513), authority));
      yield* TestClock.adjust("16 minutes");
      const expired = yield* Effect.flip(signer.verify(cursor, authority));

      assert.deepEqual(
        [malformed, oversized, expired].map((failure) => failure._tag),
        [
          "ControlPlaneCursorInvalidFailure",
          "ControlPlaneCursorInvalidFailure",
          "ControlPlaneCursorInvalidFailure",
        ],
      );
    }),
  );

  it.effect("accepts the previous rotation secret but not an unrelated secret", () =>
    Effect.gen(function* () {
      const oldSigner = makeControlPlaneCursorSigner({ activeSecret: "o".repeat(32) });
      const cursor = yield* oldSigner.sign(authority, position);
      const rotatingSigner = makeControlPlaneCursorSigner({
        activeSecret: "n".repeat(32),
        previousSecret: "o".repeat(32),
      });
      const unrelatedSigner = makeControlPlaneCursorSigner({ activeSecret: "x".repeat(32) });

      assert.deepEqual(yield* rotatingSigner.verify(cursor, authority), position);
      const failure = yield* Effect.flip(unrelatedSigner.verify(cursor, authority));
      assert.strictEqual(failure._tag, "ControlPlaneCursorInvalidFailure");
    }),
  );
});
