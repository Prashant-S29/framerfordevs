// Proves Delivery cursor signing, rolling expiry, key rotation, authority binding, and stale-generation recovery.

import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, TestClock } from "effect";

import { makeDeliveryCursorSigner, type SignDeliveryCursorInput } from "./index";

const authority = {
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
  collectionId: "019fae8b-1234-7000-8000-000000000003",
  localeId: "019fae8b-1234-7000-8000-000000000004",
  configVersion: 2,
  schemaRevisionId: "019fae8b-1234-7000-8000-000000000005",
  generation: 7,
  queryHash: "a".repeat(64),
};

const page = {
  ...authority,
  sort: {
    kind: "date_time",
    direction: "desc",
    value: "2026-08-09T12:00:00.000Z",
    entryId: "019fae8b-1234-7000-8000-000000000006",
  },
  finalEntryId: "019fae8b-1234-7000-8000-000000000006",
} satisfies SignDeliveryCursorInput;

/** Reads a tagged expected failure without flattening defects or interruption. */
function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  return typeof failure === "object" &&
    failure !== null &&
    "_tag" in failure &&
    typeof failure._tag === "string"
    ? failure._tag
    : undefined;
}

describe("DeliveryCursorSigner", () => {
  it.effect("round trips every ordering authority without exposing secret or query values", () =>
    Effect.gen(function* () {
      const secret = "active-delivery-cursor-test-secret-at-least-32-bytes";
      const signer = makeDeliveryCursorSigner({ activeSecret: secret });
      const cursor = yield* signer.sign(page);
      const verified = yield* signer.verify(cursor, authority);

      assert.strictEqual(verified.finalEntryId, page.finalEntryId);
      assert.strictEqual(verified.sort?.value, page.sort.value);
      assert.isAtMost(cursor.length, 1_024);
      assert.notInclude(cursor, secret);
      assert.notInclude(cursor, page.sort.value);
    }),
  );

  it.effect("issues a fresh rolling 15-minute lifetime for each continuation page", () =>
    Effect.gen(function* () {
      const signer = makeDeliveryCursorSigner({
        activeSecret: "rolling-delivery-cursor-test-secret-at-least-32-bytes",
      });
      const first = yield* signer.sign(page);
      const firstVerified = yield* signer.verify(first, authority);
      yield* TestClock.adjust("10 minutes");
      const second = yield* signer.sign(page);
      const secondVerified = yield* signer.verify(second, authority);

      assert.strictEqual(secondVerified.expiresAtEpochMs - firstVerified.expiresAtEpochMs, 600_000);
      yield* TestClock.adjust("6 minutes");
      assert.strictEqual(
        failureTag(yield* Effect.exit(signer.verify(first, authority))),
        "DeliveryCursorInvalidFailure",
      );
      yield* signer.verify(second, authority);
    }),
  );

  it.effect("accepts the previous key once and reissues continuations under the active key", () =>
    Effect.gen(function* () {
      const oldSecret = "previous-delivery-cursor-test-secret-at-least-32-bytes";
      const newSecret = "current-delivery-cursor-test-secret-at-least-32-bytes";
      const oldSigner = makeDeliveryCursorSigner({ activeSecret: oldSecret });
      const rotatingSigner = makeDeliveryCursorSigner({
        activeSecret: newSecret,
        previousSecret: oldSecret,
      });
      const activeOnlySigner = makeDeliveryCursorSigner({ activeSecret: newSecret });
      const oldCursor = yield* oldSigner.sign(page);

      yield* rotatingSigner.verify(oldCursor, authority);
      const reissued = yield* rotatingSigner.sign(page);
      yield* activeOnlySigner.verify(reissued, authority);
      assert.strictEqual(
        failureTag(yield* Effect.exit(activeOnlySigner.verify(oldCursor, authority))),
        "DeliveryCursorInvalidFailure",
      );
    }),
  );

  it.effect("returns stale only for a valid cursor whose persisted generation changed", () =>
    Effect.gen(function* () {
      const signer = makeDeliveryCursorSigner({
        activeSecret: "stale-delivery-cursor-test-secret-at-least-32-bytes",
      });
      const cursor = yield* signer.sign(page);
      const stale = yield* Effect.exit(signer.verify(cursor, { ...authority, generation: 8 }));
      const wrongQuery = yield* Effect.exit(
        signer.verify(cursor, { ...authority, queryHash: "b".repeat(64) }),
      );

      assert.strictEqual(failureTag(stale), "DeliveryCursorStaleFailure");
      assert.strictEqual(failureTag(wrongQuery), "DeliveryCursorInvalidFailure");
    }),
  );

  it.effect(
    "fails tampered, oversized, cross-scope, config, schema, and future-issued cursors generically",
    () =>
      Effect.gen(function* () {
        const signer = makeDeliveryCursorSigner({
          activeSecret: "invalid-delivery-cursor-test-secret-at-least-32-bytes",
        });
        const cursor = yield* signer.sign(page);
        const tampered = `${cursor.slice(0, -1)}${cursor.endsWith("a") ? "b" : "a"}`;
        const authorities = [
          { ...authority, projectId: "019fae8b-1234-7000-8000-000000000099" },
          { ...authority, configVersion: 3 },
          { ...authority, schemaRevisionId: "019fae8b-1234-7000-8000-000000000099" },
        ];

        assert.strictEqual(
          failureTag(yield* Effect.exit(signer.verify(tampered, authority))),
          "DeliveryCursorInvalidFailure",
        );
        assert.strictEqual(
          failureTag(yield* Effect.exit(signer.verify("a".repeat(1_025), authority))),
          "DeliveryCursorInvalidFailure",
        );
        for (const changed of authorities) {
          assert.strictEqual(
            failureTag(yield* Effect.exit(signer.verify(cursor, changed))),
            "DeliveryCursorInvalidFailure",
          );
        }
      }),
  );
});
