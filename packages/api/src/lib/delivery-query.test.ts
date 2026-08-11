// Exercises the strict raw Delivery list grammar, typed values, bounds, and canonical query authority.

import { describe, expect, it } from "vitest";

import { parseDeliveryListQuery, type DeliveryQueryCapability } from "./delivery-query";

const fields: ReadonlyArray<DeliveryQueryCapability> = [
  {
    fieldId: "019fae8b-1234-7000-8000-000000000001",
    fieldKey: "title",
    kind: "short_text",
    filterable: true,
    sortable: true,
  },
  {
    fieldId: "019fae8b-1234-7000-8000-000000000002",
    fieldKey: "rating",
    kind: "number",
    filterable: true,
    sortable: true,
  },
  {
    fieldId: "019fae8b-1234-7000-8000-000000000003",
    fieldKey: "price",
    kind: "decimal",
    filterable: true,
    sortable: true,
  },
  {
    fieldId: "019fae8b-1234-7000-8000-000000000004",
    fieldKey: "featured",
    kind: "boolean",
    filterable: true,
    sortable: true,
  },
  {
    fieldId: "019fae8b-1234-7000-8000-000000000005",
    fieldKey: "body",
    kind: "short_text",
    filterable: false,
    sortable: false,
  },
];

describe("Delivery list query parser", () => {
  it("parses exact typed filters, one sort, expansion, and canonical locale", () => {
    const result = parseDeliveryListQuery(
      "locale=EN&limit=25&filter.rating.gte=4&filter.price.lt=19.99&filter.featured.eq=true&sort=-rating&expand=author,related.author",
      fields,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.locale).toBe("en");
    expect(result.value.limit).toBe(25);
    expect(result.value.filters.map((filter) => filter.value)).toEqual([4, "19.99", true]);
    expect(result.value.sort).toMatchObject({ fieldKey: "rating", direction: "desc" });
    expect(result.value.expand).toEqual(["author", "related.author"]);
    expect(result.value.queryHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("produces one hash for semantically equivalent filter order and NFC text", () => {
    const first = parseDeliveryListQuery(
      "locale=en&filter.title.eq=e%CC%81&filter.rating.eq=4",
      fields,
    );
    const second = parseDeliveryListQuery(
      "filter.rating.eq=4&filter.title.eq=%C3%A9&locale=en",
      fields,
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.queryHash).toBe(second.value.queryHash);
  });

  it.each([
    ["", "locale_required"],
    ["locale=en&locale=hi", "duplicate_parameter"],
    ["locale=en&unknown=value", "query_parameter_unknown"],
    ["locale=en&limit=0", "limit_invalid"],
    ["locale=en&limit=01", "limit_invalid"],
    ["locale=en&filter.title.gt=x", "filter_operator_unsupported"],
    ["locale=en&filter.featured.gte=true", "filter_operator_unsupported"],
    ["locale=en&filter.body.eq=secret", "filter_field_unsupported"],
    ["locale=en&filter.rating.eq=01", "filter_value_invalid"],
    ["locale=en&filter.price.eq=1.00", "filter_value_invalid"],
    ["locale=en&filter.featured.eq=yes", "filter_value_invalid"],
    ["locale=en&sort=body", "sort_field_unsupported"],
    ["locale=en&sort=title&sort=-title", "duplicate_parameter"],
    ["locale=en&expand=authors.0", "expand_path_invalid"],
    ["locale=en&expand=author,author", "expand_path_duplicate"],
    ["locale=en&cursor=not%2Ba%2Fcursor", "cursor_invalid"],
  ])("rejects strict grammar case %s", (query, expectedCode) => {
    const result = parseDeliveryListQuery(query, fields);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((item) => item.code)).toContain(expectedCode);
  });

  it("bounds raw bytes, filter count, expansion count, and cursor size before persistence", () => {
    const oversized = parseDeliveryListQuery(`locale=en&x=${"a".repeat(8_193)}`, fields);
    const filters = parseDeliveryListQuery(
      `locale=en&${Array.from({ length: 6 }, (_, index) => `filter.unknown_${index}.eq=x`).join("&")}`,
      fields,
    );
    const expansions = parseDeliveryListQuery(
      `locale=en&expand=${Array.from({ length: 11 }, (_, index) => `field_${index}`).join(",")}`,
      fields,
    );
    const cursor = parseDeliveryListQuery(`locale=en&cursor=${"a".repeat(1_025)}`, fields);

    expect(oversized.ok).toBe(false);
    expect(filters.ok).toBe(false);
    expect(expansions.ok).toBe(false);
    expect(cursor.ok).toBe(false);
    if (!filters.ok)
      expect(filters.issues.map((item) => item.code)).toContain("filter_limit_exceeded");
    if (!expansions.ok)
      expect(expansions.issues.map((item) => item.code)).toContain("expand_path_limit_exceeded");
  });

  it("never echoes invalid filter values in issues", () => {
    const sensitiveValue = "not-a-number-secret";
    const result = parseDeliveryListQuery(`locale=en&filter.rating.eq=${sensitiveValue}`, fields);

    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(sensitiveValue);
  });
});
