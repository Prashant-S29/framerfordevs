// Verifies the replaceable M7 EntryEngine Layer delegates to deterministic bounded kernel behavior.

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { CollectionFieldId } from "../contracts/schemas";
import { EntryEngine, EntryEngineLive } from "./entry-engine";

const fieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000001");

describe("EntryEngine", () => {
  it.effect("applies mutations through the live Layer", () =>
    Effect.gen(function* () {
      const engine = yield* EntryEngine;
      const result = yield* engine.applyMutations({}, [
        { operation: "set", path: [fieldId], value: "draft" },
      ]);

      assert.isTrue(result.valid);
      assert.deepEqual(result.values, { [fieldId]: "draft" });
    }).pipe(Effect.provide(EntryEngineLive)),
  );

  it.effect("merges fragments and canonicalizes results through named operations", () =>
    Effect.gen(function* () {
      const engine = yield* EntryEngine;
      const merged = yield* engine.mergeFragments({ [fieldId]: { a: 1 } }, { [fieldId]: { b: 2 } });
      const canonical = yield* engine.canonicalize(merged.values);
      const issues = yield* engine.validateDocument(merged.values);

      assert.isTrue(merged.valid);
      assert.strictEqual(canonical, `{"${fieldId}":{"a":1,"b":2}}`);
      assert.deepEqual(issues, []);
    }).pipe(Effect.provide(EntryEngineLive)),
  );
});
