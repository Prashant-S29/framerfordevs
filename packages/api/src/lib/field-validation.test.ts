// Verifies deterministic field values, recursive bounds, localization, and structured-content safety.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  DecimalConfiguration,
  ExternalAssetConfiguration,
  ListConfiguration,
  MoneyConfiguration,
  ObjectConfiguration,
  RichTextConfiguration,
  ShortTextConfiguration,
  SlugConfiguration,
} from "../contracts/field-system";
import {
  compareExactDecimals,
  parseExactDecimal,
  type ValueFieldDefinition,
  validateDefinitionTree,
  validateFieldValue,
} from "./field-validation";

const emptyShortText = Schema.decodeUnknownSync(ShortTextConfiguration)({});
const emptyObject = Schema.decodeUnknownSync(ObjectConfiguration)({});
const emptyList = Schema.decodeUnknownSync(ListConfiguration)({});

/** Creates a root or nested object definition for recursive-shape tests. */
function objectField(
  id: string,
  children: ReadonlyArray<ValueFieldDefinition>,
  localization: "localized" | "shared" | "mixed" | null = "localized",
  nodeRole: "root" | "object_property" | "list_item" = "object_property",
): ValueFieldDefinition {
  return {
    id,
    apiKey: nodeRole === "list_item" ? null : id,
    required: nodeRole === "list_item" ? null : localization === "mixed" ? null : false,
    localization,
    nodeRole,
    position: 0,
    children: children.map((child, position) => ({ ...child, position })),
    kind: "object",
    configuration: emptyObject,
  };
}

/** Creates a short-text leaf with inherited or explicit localization. */
function textField(id: string, localization: "localized" | "shared" | null): ValueFieldDefinition {
  return {
    id,
    apiKey: id,
    required: false,
    localization,
    nodeRole: "object_property",
    position: 0,
    children: [],
    kind: "short_text",
    configuration: emptyShortText,
  };
}

/** Creates a list definition with one supplied item node. */
function listField(
  id: string,
  item: ValueFieldDefinition,
  localization: "localized" | "shared" = "localized",
): ValueFieldDefinition {
  return {
    id,
    apiKey: id,
    required: false,
    localization,
    nodeRole: "root",
    position: 0,
    children: [{ ...item, position: 0 }],
    kind: "list",
    configuration: emptyList,
  };
}

/** Nests object definitions to an exact field depth with a leaf at the bottom. */
function nestedObjectDepth(depth: number): ValueFieldDefinition {
  let child = textField(`leaf_${depth}`, null);
  for (let current = depth - 1; current >= 1; current -= 1) {
    child = objectField(
      `object_${current}`,
      [child],
      current === 1 ? "localized" : null,
      current === 1 ? "root" : "object_property",
    );
  }
  return child;
}

describe("exact decimal and money validation", () => {
  it("compares canonical decimal strings without floating-point conversion", () => {
    const oneTenth = parseExactDecimal("0.1");
    const tenHundredths = parseExactDecimal("0.10");
    const negative = parseExactDecimal("-1000.001");
    const zero = parseExactDecimal("0");

    assert.isNotNull(oneTenth);
    assert.isNull(tenHundredths);
    assert.isNotNull(negative);
    assert.isNotNull(zero);
    if (oneTenth && negative && zero) {
      assert.strictEqual(compareExactDecimals(negative, zero), -1);
      assert.strictEqual(compareExactDecimals(oneTenth, zero), 1);
    }
  });

  it("enforces decimal precision, scale, and exact bounds", () => {
    const configuration = Schema.decodeUnknownSync(DecimalConfiguration)({
      precision: 6,
      scale: 2,
      minimum: "-10.5",
      maximum: "999.99",
    });
    const field: ValueFieldDefinition = {
      id: "price",
      apiKey: "price",
      required: true,
      localization: "shared",
      nodeRole: "root",
      position: 0,
      children: [],
      kind: "decimal",
      configuration,
    };

    assert.isTrue(validateFieldValue(field, "12.34").valid);
    assert.isFalse(validateFieldValue(field, "12.345").valid);
    assert.isFalse(validateFieldValue(field, "1000").valid);
    assert.isFalse(validateFieldValue(field, 12.34).valid);
  });

  it("validates money currencies and minor units without rounding", () => {
    const configuration = Schema.decodeUnknownSync(MoneyConfiguration)({
      currencies: ["USD", "JPY"],
      allowNegative: false,
    });
    const field: ValueFieldDefinition = {
      id: "price",
      apiKey: "price",
      required: true,
      localization: "shared",
      nodeRole: "root",
      position: 0,
      children: [],
      kind: "money",
      configuration,
    };

    assert.isTrue(validateFieldValue(field, { amount: "19.99", currency: "USD" }).valid);
    assert.isFalse(validateFieldValue(field, { amount: "19.999", currency: "USD" }).valid);
    assert.isFalse(validateFieldValue(field, { amount: "1.1", currency: "JPY" }).valid);
    assert.isFalse(validateFieldValue(field, { amount: "-1", currency: "USD" }).valid);
    assert.isFalse(validateFieldValue(field, { amount: "1", currency: "EUR" }).valid);
    assert.isFalse(
      validateFieldValue(field, {
        amount: "123456789012345678901234567890123456789",
        currency: "USD",
      }).valid,
    );
  });
});

describe("recursive definition policy", () => {
  it("accepts depth eight and rejects depth nine", () => {
    assert.isTrue(validateDefinitionTree([nestedObjectDepth(8)]).valid);
    const depthNine = validateDefinitionTree([nestedObjectDepth(9)]);
    assert.isFalse(depthNine.valid);
    assert.isTrue(depthNine.issues.some((issue) => issue.code === "field_depth_exceeded"));
  });

  it("rejects direct list-of-list and accepts an object boundary", () => {
    const nestedListItem: ValueFieldDefinition = {
      id: "inner_list",
      apiKey: null,
      required: null,
      localization: null,
      nodeRole: "list_item",
      position: 0,
      children: [
        {
          id: "inner_text",
          apiKey: null,
          required: null,
          localization: null,
          nodeRole: "list_item",
          position: 0,
          children: [],
          kind: "short_text",
          configuration: emptyShortText,
        },
      ],
      kind: "list",
      configuration: emptyList,
    };
    assert.isFalse(validateDefinitionTree([listField("outer", nestedListItem)]).valid);

    const wrappedItem = objectField(
      "row",
      [
        {
          ...nestedListItem,
          id: "items",
          apiKey: "items",
          required: false,
          nodeRole: "object_property",
        },
      ],
      null,
      "list_item",
    );
    assert.isTrue(validateDefinitionTree([listField("outer", wrappedItem)]).valid);
  });

  it("supports mixed objects but keeps list subtrees atomic", () => {
    const product = objectField(
      "product",
      [textField("sku", "shared"), textField("title", "localized")],
      "mixed",
      "root",
    );
    assert.isTrue(validateDefinitionTree([product]).valid);

    const mixedListItem = objectField(
      "product_item",
      [textField("sku", "shared"), textField("title", "localized")],
      "mixed",
      "list_item",
    );
    const result = validateDefinitionTree([listField("products", mixedListItem)]);
    assert.isFalse(result.valid);
    assert.isTrue(result.issues.some((issue) => issue.code === "localization_list_mixed"));
  });
});

describe("structured and untrusted values", () => {
  it("accepts the approved Portable Text profile and rejects unsafe links", () => {
    const configuration = Schema.decodeUnknownSync(RichTextConfiguration)({});
    const field: ValueFieldDefinition = {
      id: "body",
      apiKey: "body",
      required: false,
      localization: "localized",
      nodeRole: "root",
      position: 0,
      children: [],
      kind: "rich_text",
      configuration,
    };
    const document = {
      version: 1,
      profile: "ffd-portable-text",
      blocks: [
        {
          _key: "block1",
          _type: "block",
          style: "normal",
          children: [{ _key: "span1", _type: "span", text: "Hello", marks: ["link1"] }],
          markDefs: [{ _key: "link1", _type: "link", href: "https://example.com" }],
        },
      ],
    };

    assert.isTrue(validateFieldValue(field, document).valid);
    assert.isFalse(validateFieldValue(field, { ...document, html: "<script />" }).valid);
    const firstBlock = document.blocks[0];
    const firstMark = firstBlock?.markDefs[0];
    if (!firstMark) throw new Error("The rich-text fixture must include one link mark.");
    firstMark.href = "javascript:alert(1)";
    assert.isFalse(validateFieldValue(field, document).valid);
  });

  it.effect.prop(
    "preserves rich text, nested/list, mixed localization, decimal, money, slug, and asset invariants",
    [Schema.String, Schema.Int, Schema.Boolean],
    ([text, integer, negative]) =>
      Effect.sync(() => {
        const magnitude = Math.abs(integer % 100_000);
        const exact = `${negative && magnitude > 0 ? "-" : ""}${magnitude}`;
        const decimalField: ValueFieldDefinition = {
          id: "decimal_property",
          apiKey: "decimal_property",
          required: true,
          localization: "shared",
          nodeRole: "root",
          position: 0,
          children: [],
          kind: "decimal",
          configuration: Schema.decodeUnknownSync(DecimalConfiguration)({
            precision: 6,
            scale: 2,
          }),
        };
        const moneyField: ValueFieldDefinition = {
          ...decimalField,
          id: "money_property",
          apiKey: "money_property",
          kind: "money",
          configuration: Schema.decodeUnknownSync(MoneyConfiguration)({
            currencies: ["USD"],
            allowNegative: true,
          }),
        };
        const slugField: ValueFieldDefinition = {
          ...decimalField,
          id: "slug_property",
          apiKey: "slug_property",
          kind: "slug",
          configuration: Schema.decodeUnknownSync(SlugConfiguration)({}),
        };
        const richTextField: ValueFieldDefinition = {
          ...decimalField,
          id: "rich_property",
          apiKey: "rich_property",
          kind: "rich_text",
          configuration: Schema.decodeUnknownSync(RichTextConfiguration)({}),
        };
        const assetField: ValueFieldDefinition = {
          ...decimalField,
          id: "asset_property",
          apiKey: "asset_property",
          kind: "external_asset",
          configuration: Schema.decodeUnknownSync(ExternalAssetConfiguration)({}),
        };
        const mixedObject = objectField(
          "mixed_property",
          [textField("shared_property", "shared"), textField("localized_property", "localized")],
          "mixed",
          "root",
        );
        const listObject = objectField(
          "list_item_property",
          [textField("label_property", null)],
          null,
          "list_item",
        );
        const nestedList = listField("list_property", listObject);
        const depth = Math.abs(integer % 9) + 2;
        const safeText = text.slice(0, 128);

        assert.isTrue(validateFieldValue(decimalField, exact).valid);
        assert.isTrue(validateFieldValue(moneyField, { amount: exact, currency: "USD" }).valid);
        assert.isTrue(validateFieldValue(slugField, `item-${magnitude}`).valid);
        assert.isTrue(validateFieldValue(slugField, "हिंदी-सामग्री").valid);
        assert.isFalse(validateFieldValue(slugField, "Bad--Slug").valid);
        assert.isTrue(
          validateFieldValue(richTextField, {
            version: 1,
            profile: "ffd-portable-text",
            blocks: [
              {
                _key: "block_property",
                _type: "block",
                style: "normal",
                children: [{ _key: "span_property", _type: "span", text: safeText, marks: [] }],
                markDefs: [],
              },
            ],
          }).valid,
        );
        assert.isTrue(
          validateFieldValue(assetField, {
            source: "external",
            url: `https://example.com/assets/${magnitude}`,
            kind: "other",
            title: safeText,
            alt: null,
            width: null,
            height: null,
          }).valid,
        );
        assert.isTrue(validateDefinitionTree([mixedObject, { ...nestedList, position: 1 }]).valid);
        assert.isTrue(validateFieldValue(nestedList, [{ label_property: safeText }]).valid);
        assert.strictEqual(validateDefinitionTree([nestedObjectDepth(depth)]).valid, depth <= 8);
      }),
  );

  it("rejects cyclic JSON and unsafe external assets without fetching", () => {
    const jsonField: ValueFieldDefinition = {
      id: "payload",
      apiKey: "payload",
      required: false,
      localization: "shared",
      nodeRole: "root",
      position: 0,
      children: [],
      kind: "json",
      configuration: {},
    };
    const cyclic: Array<unknown> = [];
    cyclic.push(cyclic);
    assert.isFalse(validateFieldValue(jsonField, cyclic).valid);
    const shared = { safe: true };
    assert.isTrue(validateFieldValue(jsonField, { first: shared, second: shared }).valid);

    const assetField: ValueFieldDefinition = {
      id: "asset",
      apiKey: "asset",
      required: false,
      localization: "shared",
      nodeRole: "root",
      position: 0,
      children: [],
      kind: "external_asset",
      configuration: Schema.decodeUnknownSync(ExternalAssetConfiguration)({}),
    };
    const result = validateFieldValue(assetField, {
      source: "external",
      url: "http://127.0.0.1/private",
      kind: "image",
      title: null,
      alt: "",
      width: null,
      height: null,
    });
    assert.isFalse(result.valid);
    assert.isTrue(result.issues.some((issue) => issue.code === "external_asset_url"));
  });
});
