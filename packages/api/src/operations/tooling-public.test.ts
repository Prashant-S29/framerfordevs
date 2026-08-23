import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";

import {
  decodeToolingCollectionRevisionScope,
  parseToolingPageQuery,
  toolingManifestCost,
  toolingRevisionCost,
  validateToolingEmptyQuery,
} from "./tooling-public";

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  return typeof failure === "object" && failure !== null && "_tag" in failure
    ? String(failure._tag)
    : undefined;
}

describe("Tooling public operations", () => {
  it.effect("applies closed defaults and bounds to page queries", () =>
    Effect.gen(function* () {
      const defaults = yield* parseToolingPageQuery("");
      const explicit = yield* parseToolingPageQuery("limit=50");
      const repeated = yield* Effect.exit(parseToolingPageQuery("limit=20&limit=21"));
      const unknown = yield* Effect.exit(parseToolingPageQuery("draft=true"));
      const oversized = yield* Effect.exit(parseToolingPageQuery(`cursor=${"a".repeat(4_100)}`));

      assert.strictEqual(defaults.limit, 20);
      assert.isNull(defaults.cursor);
      assert.strictEqual(explicit.limit, 50);
      assert.strictEqual(failureTag(repeated), "ValidationFailure");
      assert.strictEqual(failureTag(unknown), "ValidationFailure");
      assert.strictEqual(failureTag(oversized), "ValidationFailure");
    }),
  );

  it.effect("rejects query parameters on immutable revision routes", () =>
    Effect.gen(function* () {
      yield* validateToolingEmptyQuery("");
      const failure = yield* Effect.exit(validateToolingEmptyQuery("limit=1"));

      assert.strictEqual(failureTag(failure), "ValidationFailure");
    }),
  );

  it.effect("decodes the released collection-key revision route", () =>
    Effect.gen(function* () {
      const scope = yield* decodeToolingCollectionRevisionScope({
        projectId: "019fae8b-1234-7000-8000-000000000001",
        environmentKey: "main",
        collectionKey: "blog_posts",
        revisionId: "019fae8b-1234-7000-8000-000000000002",
      });
      const invalid = yield* Effect.exit(
        decodeToolingCollectionRevisionScope({
          projectId: "not-a-project",
          environmentKey: "main",
          collectionKey: "Blog Posts",
          revisionId: "not-a-revision",
        }),
      );

      assert.strictEqual(scope.collectionKey, "blog_posts");
      assert.strictEqual(failureTag(invalid), "ValidationFailure");
    }),
  );

  it("uses the approved weighted request costs", () => {
    assert.strictEqual(toolingManifestCost(1), 2);
    assert.strictEqual(toolingManifestCost(20), 3);
    assert.strictEqual(toolingManifestCost(50), 6);
    assert.strictEqual(toolingRevisionCost(1), 2);
    assert.strictEqual(toolingRevisionCost(262_144), 2);
    assert.strictEqual(toolingRevisionCost(262_145), 3);
    assert.strictEqual(toolingRevisionCost(1_572_864), 7);
  });
});
