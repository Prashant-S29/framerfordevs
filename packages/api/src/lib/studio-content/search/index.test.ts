import { assert, describe, it } from "@effect/vitest";

import { boundedStudioMatchCount, studioSearchAuthority } from "./index";

describe("Studio content search kernel", () => {
  it("normalizes case and whitespace while escaping LIKE metacharacters literally", () => {
    const authority = studioSearchAuthority("  100%_Path\\Name  ");

    assert.strictEqual(authority.normalized, "100%_Path\\Name");
    assert.strictEqual(authority.folded, "100%_path\\name");
    assert.strictEqual(authority.likePrefix, "100\\%\\_path\\\\name%");
    assert.strictEqual(authority.databaseLikePrefix, "100\\%\\_Path\\\\Name%");
    assert.match(authority.queryDigest, /^[0-9a-f]{64}$/u);
    assert.strictEqual(studioSearchAuthority("100%_PATH\\NAME").queryDigest, authority.queryDigest);
    const unicode = studioSearchAuthority("  Cafe\u0301  ");
    assert.strictEqual(unicode.normalized, "Café");
    assert.strictEqual(unicode.folded, "café");
    assert.strictEqual(unicode.databaseLikePrefix, "Café%");
    assert.strictEqual(unicode.queryDigest, studioSearchAuthority("CAFÉ").queryDigest);
  });

  it("rejects empty, one-character, control-bearing, and oversized searches", () => {
    for (const query of [" ", "a", "ab\u0000", "x".repeat(101)]) {
      assert.throws(() => studioSearchAuthority(query));
    }
  });

  it("caps count probes without claiming an unbounded exact total", () => {
    assert.deepEqual(boundedStudioMatchCount(0), { value: 0, relation: "exact" });
    assert.deepEqual(boundedStudioMatchCount(1), { value: 1, relation: "exact" });
    assert.deepEqual(boundedStudioMatchCount(999), { value: 999, relation: "exact" });
    assert.deepEqual(boundedStudioMatchCount(1_000), { value: 1_000, relation: "exact" });
    assert.deepEqual(boundedStudioMatchCount(1_001), {
      value: 1_000,
      relation: "at_least",
    });
    assert.throws(() => boundedStudioMatchCount(1_002));
  });
});
