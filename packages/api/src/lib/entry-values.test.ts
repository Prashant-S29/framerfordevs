// Exercises atomic stable-path draft mutations, resource bounds, canonical no-ops, and sparse-fragment merging.

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { CollectionFieldId } from "../contracts/schemas";
import {
  applyEntryMutations,
  canonicalizeEntryValue,
  entryValueLimits,
  mergeEntryFragments,
  validateEntryDocument,
} from "./entry-values";

const sharedFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000001");
const localizedFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000002");
const objectFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000003");
const childFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000004");
const listFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000005");

describe("entry value kernel", () => {
  it("canonicalizes object keys while preserving array order", () => {
    assert.strictEqual(
      canonicalizeEntryValue({ b: 2, a: ["second", "first"] }),
      '{"a":["second","first"],"b":2}',
    );
  });

  it("applies nested stable-ID set/unset mutations atomically", () => {
    const current = { [objectFieldId]: { [childFieldId]: "old" } };
    const changed = applyEntryMutations(current, [
      { operation: "set", path: [objectFieldId, childFieldId], value: "new" },
    ]);
    const removed = applyEntryMutations(changed.values, [
      { operation: "unset", path: [objectFieldId, childFieldId] },
    ]);

    assert.isTrue(changed.valid);
    assert.isTrue(changed.changed);
    assert.deepEqual(changed.changedFieldIds, [objectFieldId]);
    assert.deepEqual(changed.values, { [objectFieldId]: { [childFieldId]: "new" } });
    assert.deepEqual(removed.values, { [objectFieldId]: {} });
    assert.deepEqual(current, { [objectFieldId]: { [childFieldId]: "old" } });
  });

  it("suppresses canonical no-ops and changed-field noise", () => {
    const result = applyEntryMutations({ [sharedFieldId]: "same" }, [
      { operation: "set", path: [sharedFieldId], value: "same" },
    ]);

    assert.isTrue(result.valid);
    assert.isFalse(result.changed);
    assert.deepEqual(result.changedFieldIds, []);
  });

  it("supports explicit bounded list insertion, update, and removal", () => {
    const inserted = applyEntryMutations({ [listFieldId]: ["a"] }, [
      { operation: "list_insert", path: [listFieldId], index: 1, value: "b" },
    ]);
    const updated = applyEntryMutations(inserted.values, [
      { operation: "set", path: [listFieldId, 0], value: "updated" },
    ]);
    const removed = applyEntryMutations(updated.values, [
      { operation: "list_remove", path: [listFieldId], index: 1 },
    ]);

    assert.deepEqual(inserted.values, { [listFieldId]: ["a", "b"] });
    assert.deepEqual(updated.values, { [listFieldId]: ["updated", "b"] });
    assert.deepEqual(removed.values, { [listFieldId]: ["updated"] });
  });

  it("rolls back the complete command when one path is invalid", () => {
    const current = { [sharedFieldId]: "original" };
    const result = applyEntryMutations(current, [
      { operation: "set", path: [sharedFieldId], value: "changed" },
      { operation: "set", path: [listFieldId, 0], value: "invalid" },
    ]);

    assert.isFalse(result.valid);
    assert.deepEqual(result.values, current);
    assert.deepEqual(result.changedFieldIds, []);
    assert.strictEqual(result.issues[0]?.code, "entry_value_path_invalid");
  });

  it("rejects invalid list paths, indexes, implicit removal, and aggregate overflow", () => {
    const fullList = Array.from({ length: 100 }, (_, index) => index);
    const cases = [
      applyEntryMutations({}, [
        { operation: "list_insert", path: [listFieldId], index: 0, value: "x" },
      ]),
      applyEntryMutations({ [listFieldId]: [] }, [
        { operation: "list_insert", path: [listFieldId], index: 1, value: "x" },
      ]),
      applyEntryMutations({ [listFieldId]: fullList }, [
        { operation: "list_insert", path: [listFieldId], index: 100, value: "x" },
      ]),
      applyEntryMutations({ [listFieldId]: [] }, [
        { operation: "list_remove", path: [listFieldId], index: 0 },
      ]),
      applyEntryMutations({ [listFieldId]: ["x"] }, [
        { operation: "unset", path: [listFieldId, 0] },
      ]),
      applyEntryMutations({ [listFieldId]: [] }, [
        { operation: "set", path: [listFieldId, childFieldId], value: "x" },
      ]),
    ];
    const overflow = applyEntryMutations({}, [
      { operation: "set", path: [sharedFieldId], value: "x".repeat(600_000) },
      { operation: "set", path: [localizedFieldId], value: "y".repeat(600_000) },
    ]);

    assert.deepEqual(
      cases.map((result) => result.issues[0]?.code),
      [
        "entry_list_path_invalid",
        "entry_list_index_invalid",
        "entry_list_index_invalid",
        "entry_list_index_invalid",
        "entry_list_operation_required",
        "entry_value_path_invalid",
      ],
    );
    assert.strictEqual(overflow.issues[0]?.code, "entry_value_bytes_exceeded");
  });

  it("rejects excessive commands, unsafe current state, and unsafe mutation values", () => {
    const mutation = { operation: "unset", path: [sharedFieldId] } as const;
    const excessive = applyEntryMutations(
      {},
      Array.from({ length: entryValueLimits.mutations + 1 }, () => mutation),
    );
    const unsafeCurrent = applyEntryMutations({ [sharedFieldId]: Number.NaN }, []);
    const unsafeValue = applyEntryMutations({}, [
      { operation: "set", path: [sharedFieldId], value: Number.NaN },
    ]);

    assert.strictEqual(excessive.issues[0]?.code, "entry_mutations_exceeded");
    assert.strictEqual(unsafeCurrent.issues[0]?.code, "entry_value_not_json");
    assert.strictEqual(unsafeValue.issues[0]?.code, "entry_value_not_json");
  });

  it("rejects cyclic, non-plain, non-finite, deep, and oversized documents", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let index = 0; index <= entryValueLimits.documentDepth; index += 1) {
      const next: Record<string, unknown> = {};
      deep.next = next;
      deep = next;
    }

    assert.strictEqual(validateEntryDocument(cyclic)[0]?.code, "entry_value_cycle");
    assert.strictEqual(validateEntryDocument(new Date())[0]?.code, "entry_value_not_plain_json");
    assert.strictEqual(
      validateEntryDocument(Number.POSITIVE_INFINITY)[0]?.code,
      "entry_value_not_json",
    );
    assert.strictEqual(validateEntryDocument(root)[0]?.code, "entry_value_depth_exceeded");
    assert.strictEqual(
      validateEntryDocument("x".repeat(entryValueLimits.documentBytes + 1))[0]?.code,
      "entry_value_bytes_exceeded",
    );
  });

  it("deep-merges disjoint mixed-object fragments deterministically", () => {
    const merged = mergeEntryFragments(
      { [objectFieldId]: { [sharedFieldId]: "shared" } },
      { [objectFieldId]: { [localizedFieldId]: "localized" } },
    );

    assert.isTrue(merged.valid);
    assert.deepEqual(merged.values, {
      [objectFieldId]: {
        [localizedFieldId]: "localized",
        [sharedFieldId]: "shared",
      },
    });
  });

  it("rejects terminal and array ownership collisions", () => {
    const terminal = mergeEntryFragments(
      { [sharedFieldId]: "shared" },
      { [sharedFieldId]: "localized" },
    );
    const array = mergeEntryFragments({ [listFieldId]: ["shared"] }, { [listFieldId]: ["local"] });

    assert.isFalse(terminal.valid);
    assert.strictEqual(terminal.issues[0]?.code, "entry_fragment_collision");
    assert.isFalse(array.valid);
    assert.strictEqual(array.issues[0]?.code, "entry_fragment_collision");
  });

  it.effect("keeps stable field IDs schema-backed in fixtures", () =>
    Schema.decodeUnknown(CollectionFieldId)(sharedFieldId),
  );
});
