// Verifies complete supported root-scalar projection, exact representations, and invariant failure behavior.

import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import {
  CollectionFieldDefinition,
  type CollectionFieldDefinition as CollectionField,
} from "../contracts/schemas";
import { compileDeliveryProjections } from "./delivery-projection";

const editor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: ["owner"],
  editableByRoles: ["owner"],
};

function field(value: unknown): CollectionField {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)(value);
}

function root(
  index: number,
  apiKey: string,
  kind: string,
  configuration: Readonly<Record<string, unknown>>,
): CollectionField {
  return field({
    id: `019fae8b-1234-7000-8000-${String(index).padStart(12, "0")}`,
    parentFieldId: null,
    nodeRole: "root",
    apiKey,
    displayLabel: apiKey,
    kind,
    required: false,
    localization: "localized",
    deprecated: false,
    position: index,
    editor,
    configuration,
    children: [],
  });
}

const fields = [
  root(1, "title", "short_text", {}),
  root(2, "rating", "number", {}),
  root(3, "price", "decimal", { precision: 10, scale: 2 }),
  root(4, "featured", "boolean", {}),
  root(5, "published_on", "date", {}),
  root(6, "launch_at", "date_time", {}),
  root(7, "author", "reference", {
    targetCollectionId: "019fae8b-1234-7000-8000-000000000099",
  }),
  root(8, "body", "long_text", {}),
];

describe("Delivery projection compiler", () => {
  it("materializes all present supported roots regardless of enabled query capabilities", () => {
    const result = compileDeliveryProjections(
      fields,
      {
        title: "Café",
        rating: 4.5,
        price: "19.99",
        featured: true,
        published_on: "2026-08-09",
        launch_at: "2026-08-09T12:00:00Z",
        author: "019FAE8B-1234-7000-8000-000000000099",
        body: "not projected",
      },
      [{ fieldId: fields[0]?.id ?? "", uniqueLookup: true }],
    );

    expect(result.valid).toBe(true);
    expect(result.rows.map((row) => [row.fieldKey, row.value, row.uniqueLookup])).toEqual([
      ["title", "Café", true],
      ["rating", 4.5, false],
      ["price", "19.99", false],
      ["featured", true, false],
      ["published_on", "2026-08-09", false],
      ["launch_at", "2026-08-09T12:00:00.000Z", false],
      ["author", "019fae8b-1234-7000-8000-000000000099", false],
    ]);
  });

  it("omits missing values instead of inventing null comparison rows", () => {
    const result = compileDeliveryProjections(fields, { title: "Present" }, []);

    expect(result.valid).toBe(true);
    expect(result.rows.map((row) => row.fieldKey)).toEqual(["title"]);
  });

  it("fails closed when a supposedly strict snapshot contains an invalid supported value", () => {
    const secret = "invalid-secret-decimal";
    const result = compileDeliveryProjections(fields, { price: secret }, []);

    expect(result.valid).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        fieldId: fields[2]?.id,
        path: "price",
        code: "delivery_projection_value_invalid",
      }),
    ]);
    expect(JSON.stringify(result.issues)).not.toContain(secret);
  });
});
