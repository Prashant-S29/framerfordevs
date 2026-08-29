// Verifies deterministic full-schema canonicalization and the aggregate one-mebibyte safety bound.

import { assert, describe, it } from "@effect/vitest";

import {
  canonicalizeSchemaDocument,
  compareCanonicalText,
  validateAggregateSchemaDocument,
} from "./field-system-document";

describe("aggregate schema documents", () => {
  it("canonicalizes object keys deterministically without reordering arrays", () => {
    const left = { z: 1, a: { y: 2, x: [3, 1] } };
    const right = { a: { x: [3, 1], y: 2 }, z: 1 };

    assert.strictEqual(canonicalizeSchemaDocument(left), canonicalizeSchemaDocument(right));
  });

  it("orders canonical text by code units rather than locale collation", () => {
    assert.strictEqual(compareCanonicalText("a-b", "a_b"), -1);
    assert.strictEqual(compareCanonicalText("a_b", "a-b"), 1);
    assert.strictEqual(compareCanonicalText("same", "same"), 0);
  });

  it("accepts a bounded document and rejects a cumulative payload above one MiB", () => {
    const bounded = validateAggregateSchemaDocument({ fields: [{ default: "x".repeat(900_000) }] });
    const excessive = validateAggregateSchemaDocument({
      fields: [{ default: "x".repeat(1_048_576) }],
    });

    assert.isTrue(bounded.valid);
    assert.isFalse(excessive.valid);
    assert.strictEqual(excessive.issues[0]?.code, "schema_size_exceeded");
  });

  it("allows repeated JSON references but rejects actual cycles", () => {
    const shared = { safe: true };
    assert.isTrue(validateAggregateSchemaDocument({ first: shared, second: shared }).valid);

    const cyclic: Array<unknown> = [];
    cyclic.push(cyclic);
    const result = validateAggregateSchemaDocument(cyclic);

    assert.isFalse(result.valid);
    assert.strictEqual(result.issues[0]?.code, "schema_cycle");
  });
});
