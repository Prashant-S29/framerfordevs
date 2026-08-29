import { Effect, Exit, Schema } from "effect";
import { assert, describe, it } from "@effect/vitest";

import {
  AuthoringApiErrorCode,
  AuthoringValueMutations,
  CmsActor,
  CollectionSourceKey,
  EnumOptionSourceKey,
  FieldSourceKey,
  StructureHash,
} from "./authoring";

const userId = "019fae8b-1234-7000-8000-000000000001";
const credentialId = "019fae8b-1234-7000-8000-000000000002";

describe("authoring contracts", () => {
  it.effect(
    "accepts canonical distinct source identities and rejects reserved or ambiguous keys",
    () =>
      Effect.gen(function* () {
        const accepted = yield* Effect.all([
          Schema.decodeUnknown(CollectionSourceKey)("blog-posts"),
          Schema.decodeUnknown(FieldSourceKey)("seo_title"),
          Schema.decodeUnknown(EnumOptionSourceKey)("in-review"),
        ]);
        const rejected = yield* Effect.all(
          ["id", "BadKey", "double--dash", "double__underscore", "trailing-"].map((value) =>
            Effect.exit(Schema.decodeUnknown(CollectionSourceKey)(value)),
          ),
        );

        assert.deepStrictEqual(accepted, ["blog-posts", "seo_title", "in-review"]);
        assert.isTrue(rejected.every(Exit.isFailure));
      }),
  );

  it.effect("keeps user and credential actor attribution explicit", () =>
    Effect.gen(function* () {
      const user = yield* Schema.decodeUnknown(CmsActor)({ kind: "user", id: userId });
      const credential = yield* Schema.decodeUnknown(CmsActor)({
        kind: "credential",
        id: credentialId,
      });
      const impersonation = yield* Effect.exit(
        Schema.decodeUnknown(CmsActor)({ kind: "credential", id: credentialId, userId }),
      );

      assert.strictEqual(user.kind, "user");
      assert.strictEqual(credential.kind, "credential");
      assert.isTrue(Exit.isFailure(impersonation));
    }),
  );

  it.effect("accepts only finite JSON mutations and canonical digest authorities", () =>
    Effect.gen(function* () {
      const mutations = yield* Schema.decodeUnknown(AuthoringValueMutations)([
        {
          operation: "set",
          scope: "localized",
          path: ["seo", "title"],
          value: { text: "Hello" },
        },
      ]);
      const invalidNumber = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringValueMutations)([
          { operation: "set", scope: "localized", path: ["title"], value: Infinity },
        ]),
      );
      const hash = yield* Schema.decodeUnknown(StructureHash)("a".repeat(64));

      assert.strictEqual(mutations.length, 1);
      assert.isTrue(Exit.isFailure(invalidNumber));
      assert.strictEqual(hash, "a".repeat(64));
    }),
  );

  it.effect("defines a closed content-safe Authoring error vocabulary", () =>
    Effect.gen(function* () {
      const known = yield* Schema.decodeUnknown(AuthoringApiErrorCode)("SOURCE_IDENTITY_CONFLICT");
      const unknown = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringApiErrorCode)("DATABASE_CONSTRAINT_FAILED"),
      );

      assert.strictEqual(known, "SOURCE_IDENTITY_CONFLICT");
      assert.isTrue(Exit.isFailure(unknown));
    }),
  );
});
