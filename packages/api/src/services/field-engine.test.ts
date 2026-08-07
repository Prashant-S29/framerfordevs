// Verifies the Effect service boundary around strict field configuration and pure value validation.

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import type { ValueFieldDefinition } from "../lib/field-validation";
import { FieldEngine, FieldEngineLive } from "./field-engine";

describe("FieldEngine", () => {
  it.effect("strictly decodes kind-correlated configurations", () =>
    Effect.gen(function* () {
      const engine = yield* FieldEngine;
      const text = yield* engine.validateConfiguration("short_text", {
        minLength: 1,
        maxLength: 100,
      });
      const unknown = yield* engine.validateConfiguration("short_text", {
        minLength: 1,
        unsupported: true,
      });
      const money = yield* engine.validateConfiguration("money", {
        currencies: ["USD", "JPY"],
        allowNegative: false,
      });

      assert.isTrue(text.valid);
      assert.isFalse(unknown.valid);
      assert.isTrue(money.valid);
    }).pipe(Effect.provide(FieldEngineLive)),
  );

  it.effect("validates values through the replaceable service", () =>
    Effect.gen(function* () {
      const engine = yield* FieldEngine;
      const definition: ValueFieldDefinition = {
        id: "title",
        apiKey: "title",
        required: true,
        localization: "localized",
        nodeRole: "root",
        position: 0,
        children: [],
        kind: "short_text",
        configuration: { minLength: 2, maxLength: 10 },
      };

      const valid = yield* engine.validateValue(definition, "Hello");
      const missing = yield* engine.validateValue(definition, undefined);

      assert.isTrue(valid.valid);
      assert.isFalse(missing.valid);
      assert.strictEqual(missing.issues[0]?.code, "required");
    }).pipe(Effect.provide(FieldEngineLive)),
  );
});
