import { assert, describe, it } from "@effect/vitest";

import {
  compareRevisionValues,
  hiddenRevisionResidue,
  projectChangedFieldIds,
  projectRevisionComparison,
  projectRevisionValues,
  visibleFieldIds,
} from ".";

interface Node {
  readonly id: string;
  readonly kind: string;
  readonly hidden: boolean;
  readonly children: ReadonlyArray<Node>;
}

function node(id: string, kind = "short_text", hidden = false, children: Array<Node> = []): Node {
  return { id, kind, hidden, children };
}

const visible = (field: Node) => !field.hidden;

const title = node("title");
const secret = node("secret", "short_text", true);
const seoTitle = node("seo_title");
const seoNote = node("seo_note", "short_text", true);
const seo = node("seo", "object", false, [seoTitle, seoNote]);
const tagItem = node("tag_item", "object", false, [
  node("tag_label"),
  node("tag_code", "short_text", true),
]);
const tags = node("tags", "list", false, [tagItem]);
const roots = [title, secret, seo, tags];

describe("revision value projection", () => {
  it("keeps visible fields and drops hidden fields, unknown keys, and empty objects", () => {
    assert.deepStrictEqual(
      projectRevisionValues(
        {
          title: "Hello",
          secret: "classified",
          unknown: "value",
          seo: { seo_title: "SEO", seo_note: "hidden", stray: 1 },
          tags: [{ tag_label: "a", tag_code: "x" }, { tag_code: "y" }],
        },
        roots,
        visible,
      ),
      {
        title: "Hello",
        seo: { seo_title: "SEO" },
        tags: [{ tag_label: "a" }, {}],
      },
    );
    assert.deepStrictEqual(
      projectRevisionValues({ seo: { seo_note: "only" } }, roots, visible),
      {},
    );
  });

  it("drops a list whose item field is hidden", () => {
    const hiddenItemList = node("list", "list", false, [node("item", "short_text", true)]);
    assert.deepStrictEqual(
      projectRevisionValues({ list: ["a", "b"] }, [hiddenItemList], visible),
      {},
    );
  });

  it("returns hidden residue for hidden fields, nested hidden children, and unknown keys", () => {
    assert.deepStrictEqual(
      hiddenRevisionResidue(
        {
          title: "Hello",
          secret: "classified",
          unknown: 1,
          seo: { seo_title: "SEO", seo_note: "hidden" },
          tags: [{ tag_label: "a", tag_code: "x" }],
        },
        roots,
        visible,
      ),
      {
        secret: "classified",
        unknown: 1,
        seo: { seo_note: "hidden" },
        tags: [{ tag_code: "x" }],
      },
    );
    assert.deepStrictEqual(
      hiddenRevisionResidue({ title: "Hello", tags: [{ tag_label: "a" }] }, roots, visible),
      {},
    );
  });
});

describe("revision value comparison", () => {
  it("orders current schema fields first, then removed fields by ID, and skips equal values", () => {
    const items = compareRevisionValues(
      { b: 1, a: { x: 1, y: 2 }, legacy_b: true, legacy_a: "old" },
      { b: 2, a: { y: 2, x: 1 }, c: "new", legacy_a: "old" },
      ["c", "b", "a"],
    );
    assert.deepStrictEqual(
      items.map((item) => ({ ...item })),
      [
        { fieldId: "c", change: "added", after: "new", inCurrentSchema: true },
        { fieldId: "b", change: "changed", before: 1, after: 2, inCurrentSchema: true },
        { fieldId: "legacy_b", change: "removed", before: true, inCurrentSchema: false },
      ],
    );
  });

  it("returns no items for identical documents", () => {
    assert.deepStrictEqual(compareRevisionValues({ a: [1, 2] }, { a: [1, 2] }, ["a"]), []);
  });

  it("projects items to visible fields and signals hidden differences without naming them", () => {
    const comparison = projectRevisionComparison({
      before: { title: "A", secret: "one", seo: { seo_title: "S", seo_note: "n1" } },
      after: { title: "B", secret: "two", seo: { seo_title: "S", seo_note: "n2" } },
      roots,
      currentRootIds: ["title", "secret", "seo", "tags"],
      visible,
    });
    assert.deepStrictEqual(
      comparison.items.map((item) => ({ ...item })),
      [{ fieldId: "title", change: "changed", before: "A", after: "B", inCurrentSchema: true }],
    );
    assert.strictEqual(comparison.restrictedChanges, true);
    assert.notInclude(JSON.stringify(comparison), "secret");
    assert.notInclude(JSON.stringify(comparison), "seo_note");
  });

  it("does not signal restricted changes when hidden values are equal", () => {
    const comparison = projectRevisionComparison({
      before: { title: "A", secret: "same" },
      after: { title: "B", secret: "same" },
      roots,
      currentRootIds: ["title", "secret"],
      visible,
    });
    assert.strictEqual(comparison.items.length, 1);
    assert.strictEqual(comparison.restrictedChanges, false);
  });

  it("signals a hidden change inside a list item", () => {
    const comparison = projectRevisionComparison({
      before: { tags: [{ tag_label: "a", tag_code: "x" }] },
      after: { tags: [{ tag_label: "a", tag_code: "y" }] },
      roots,
      currentRootIds: ["tags"],
      visible,
    });
    assert.deepStrictEqual(comparison.items, []);
    assert.strictEqual(comparison.restrictedChanges, true);
  });

  it("filters changed field IDs and collects visible IDs through visible parents only", () => {
    const ids = visibleFieldIds(roots, visible);
    assert.deepStrictEqual([...ids].sort(), [
      "seo",
      "seo_title",
      "tag_item",
      "tag_label",
      "tags",
      "title",
    ]);
    assert.deepStrictEqual(projectChangedFieldIds(["title", "secret", "seo_note"], ids), ["title"]);
  });
});
