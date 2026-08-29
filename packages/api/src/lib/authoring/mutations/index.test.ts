import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { AuthoringValueMutations } from "../../../contracts/authoring";
import { CollectionFieldId } from "../../../contracts/schema";
import { projectAuthoringValue, resolveAuthoringMutations } from "./index";

const titleFieldId = "019fae8b-1234-7000-8000-000000000011";
const seoFieldId = "019fae8b-1234-7000-8000-000000000012";

const decodeInput = Schema.decodeUnknown(AuthoringValueMutations);

describe("authoring public mutations", () => {
  it.effect("resolves API-key paths to stable field IDs without changing values", () =>
    Effect.gen(function* () {
      const [titleId, seoId] = yield* Effect.all([
        Schema.decodeUnknown(CollectionFieldId)(titleFieldId),
        Schema.decodeUnknown(CollectionFieldId)(seoFieldId),
      ]);
      const mutations = yield* decodeInput([
        {
          operation: "set",
          scope: "localized",
          path: ["seo", "title"],
          value: "Hello",
        },
        { operation: "unset", scope: "shared", path: ["title"] },
      ]);
      const result = resolveAuthoringMutations(mutations, [
        {
          apiPath: ["seo", "title"],
          stablePath: [seoId, titleId],
          scope: "localized",
          editable: true,
        },
        {
          apiPath: ["title"],
          stablePath: [titleId],
          scope: "shared",
          editable: true,
        },
      ]);

      assert.isTrue(result.valid);
      if (result.valid) {
        assert.deepStrictEqual(result.mutations, [
          { operation: "set", path: [seoId, titleId], value: "Hello" },
          { operation: "unset", path: [titleId] },
        ]);
      }
    }),
  );

  it.effect(
    "rejects unknown, scope-mismatched, and non-editable paths without values in issues",
    () =>
      Effect.gen(function* () {
        const titleId = yield* Schema.decodeUnknown(CollectionFieldId)(titleFieldId);
        const mutations = yield* decodeInput([
          { operation: "set", scope: "localized", path: ["unknown"], value: "secret-a" },
          { operation: "set", scope: "localized", path: ["title"], value: "secret-b" },
          { operation: "unset", scope: "shared", path: ["locked"] },
        ]);
        const result = resolveAuthoringMutations(mutations, [
          { apiPath: ["title"], stablePath: [titleId], scope: "shared", editable: true },
          { apiPath: ["locked"], stablePath: [titleId], scope: "shared", editable: false },
        ]);

        assert.isFalse(result.valid);
        if (!result.valid) {
          assert.deepStrictEqual(
            result.issues.map((issue) => issue.code),
            ["mutation_path_unknown", "mutation_scope_mismatch", "mutation_field_not_editable"],
          );
          assert.notInclude(JSON.stringify(result.issues), "secret");
        }
      }),
  );

  it.effect("rejects duplicate or ancestor-overlapping mutations within one scope", () =>
    Effect.gen(function* () {
      const [titleId, seoId] = yield* Effect.all([
        Schema.decodeUnknown(CollectionFieldId)(titleFieldId),
        Schema.decodeUnknown(CollectionFieldId)(seoFieldId),
      ]);
      const mutations = yield* decodeInput([
        { operation: "set", scope: "localized", path: ["seo"], value: {} },
        { operation: "set", scope: "localized", path: ["seo", "title"], value: "Hello" },
      ]);
      const result = resolveAuthoringMutations(mutations, [
        { apiPath: ["seo"], stablePath: [seoId], scope: "localized", editable: true },
        {
          apiPath: ["seo", "title"],
          stablePath: [seoId, titleId],
          scope: "localized",
          editable: true,
        },
      ]);

      assert.isFalse(result.valid);
      if (!result.valid)
        assert.include(
          result.issues.map((issue) => issue.code),
          "mutation_conflict",
        );
    }),
  );

  it.effect("translates whole object and list values without allowing hidden nested writes", () =>
    Effect.gen(function* () {
      const [seoId, titleId] = yield* Effect.all([
        Schema.decodeUnknown(CollectionFieldId)(seoFieldId),
        Schema.decodeUnknown(CollectionFieldId)(titleFieldId),
      ]);
      const shape = {
        kind: "object" as const,
        fields: [
          {
            fieldId: titleId,
            apiKey: "title",
            editable: true,
            shape: { kind: "scalar" as const },
          },
        ],
      };
      const mutations = yield* decodeInput([
        {
          operation: "set",
          scope: "localized",
          path: ["seo"],
          value: { title: "Hello" },
        },
      ]);
      const result = resolveAuthoringMutations(mutations, [
        {
          apiPath: ["seo"],
          stablePath: [seoId],
          scope: "localized",
          editable: true,
          valueShape: shape,
        },
      ]);

      assert.isTrue(result.valid);
      if (result.valid)
        assert.deepStrictEqual(result.mutations[0], {
          operation: "set",
          path: [seoId],
          value: { [titleId]: "Hello" },
        });
      assert.deepStrictEqual(projectAuthoringValue({ [titleId]: "Hello" }, shape), {
        valid: true,
        value: { title: "Hello" },
      });

      const hidden = yield* decodeInput([
        {
          operation: "set",
          scope: "localized",
          path: ["seo"],
          value: { secret: "must-not-cross-boundary" },
        },
      ]);
      const rejected = resolveAuthoringMutations(hidden, [
        {
          apiPath: ["seo"],
          stablePath: [seoId],
          scope: "localized",
          editable: true,
          valueShape: shape,
        },
      ]);
      assert.isFalse(rejected.valid);
      assert.notInclude(JSON.stringify(rejected), "must-not-cross-boundary");
    }),
  );

  it.effect("enforces recursive value depth without returning submitted content", () =>
    Effect.gen(function* () {
      const titleId = yield* Schema.decodeUnknown(CollectionFieldId)(titleFieldId);
      let value: Record<string, unknown> = {};
      for (let index = 0; index < 25; index += 1) value = { nested: value };
      const mutations = yield* decodeInput([
        { operation: "set", scope: "localized", path: ["payload"], value },
      ]);
      const result = resolveAuthoringMutations(mutations, [
        {
          apiPath: ["payload"],
          stablePath: [titleId],
          scope: "localized",
          editable: true,
        },
      ]);

      assert.isFalse(result.valid);
      if (!result.valid) {
        assert.strictEqual(result.issues[0]?.code, "mutation_value_too_deep");
        assert.notProperty(result.issues[0] ?? {}, "value");
      }
    }),
  );
});
