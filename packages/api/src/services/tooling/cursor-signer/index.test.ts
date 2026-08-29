import { assert, describe, it } from "@effect/vitest";
import { Effect, TestClock } from "effect";

import { makeToolingCursorSigner } from "./index";

const authority = {
  route: "manifest" as const,
  principalKey: "oauth:user-1",
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentKey: "main",
  limit: 20,
};

const signer = makeToolingCursorSigner({ activeSecret: "a".repeat(32) });

describe("Tooling cursor signer", () => {
  it.effect("round-trips one scope-bound cursor", () =>
    Effect.gen(function* () {
      const cursor = yield* signer.sign(authority, "019fae8b-1234-7000-8000-000000000002");
      const finalId = yield* signer.verify(cursor, authority);

      assert.strictEqual(finalId, "019fae8b-1234-7000-8000-000000000002");
    }),
  );

  it.effect("rejects tampering and cross-principal replay", () =>
    Effect.gen(function* () {
      const cursor = yield* signer.sign(authority, "019fae8b-1234-7000-8000-000000000002");
      const tampered = yield* Effect.flip(signer.verify(`${cursor.slice(0, -1)}x`, authority));
      const replayed = yield* Effect.flip(
        signer.verify(cursor, { ...authority, principalKey: "oauth:user-2" }),
      );

      assert.strictEqual(tampered._tag, "ToolingCursorInvalidFailure");
      assert.strictEqual(replayed._tag, "ToolingCursorInvalidFailure");
    }),
  );

  it.effect("rejects expired cursors", () =>
    Effect.gen(function* () {
      const cursor = yield* signer.sign(authority, "019fae8b-1234-7000-8000-000000000002");
      yield* TestClock.adjust("16 minutes");
      const failure = yield* Effect.flip(signer.verify(cursor, authority));

      assert.strictEqual(failure._tag, "ToolingCursorInvalidFailure");
    }),
  );
});
