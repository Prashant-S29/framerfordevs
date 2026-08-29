// Verifies M6 schema contracts, strict structured values, and pinned field profiles.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  CollectionFieldKind,
  collectionFieldKindValues,
  ExternalAssetValue,
  fieldSystemLimits,
  fieldSystemValidationProfile,
  MoneyValue,
  PortableTextDocument,
  iso4217MinorUnits,
  iso4217RegistryProfile,
} from "./index";

describe("M6 field contracts", () => {
  it.effect("exposes all eighteen approved field kinds", () =>
    Effect.gen(function* () {
      assert.strictEqual(collectionFieldKindValues.length, 18);
      for (const kind of collectionFieldKindValues) {
        assert.strictEqual(yield* Schema.decodeUnknown(CollectionFieldKind)(kind), kind);
      }
    }),
  );

  it.effect("rejects unknown keys in money, assets, and Portable Text", () =>
    Effect.gen(function* () {
      const money = yield* Effect.exit(
        Schema.decodeUnknown(MoneyValue)({ amount: "19.99", currency: "USD", cents: 1999 }),
      );
      const asset = yield* Effect.exit(
        Schema.decodeUnknown(ExternalAssetValue)({
          source: "external",
          url: "https://cdn.example.com/a.png",
          kind: "image",
          title: null,
          alt: "",
          width: null,
          height: null,
          html: "<script />",
        }),
      );
      const richText = yield* Effect.exit(
        Schema.decodeUnknown(PortableTextDocument)({
          version: 1,
          profile: "ffd-portable-text",
          blocks: [],
          html: "<script />",
        }),
      );

      assert.isTrue(Exit.isFailure(money));
      assert.isTrue(Exit.isFailure(asset));
      assert.isTrue(Exit.isFailure(richText));
    }),
  );

  it("pins deterministic limits and the official currency profile", () => {
    assert.strictEqual(fieldSystemValidationProfile, "ffd-fields@1");
    assert.strictEqual(fieldSystemLimits.definitionMaxDepth, 8);
    assert.strictEqual(fieldSystemLimits.aggregateSchemaBytes, 1_048_576);
    assert.strictEqual(iso4217RegistryProfile, "iso-4217@2026-01-01");
    assert.strictEqual(iso4217MinorUnits.USD, 2);
    assert.strictEqual(iso4217MinorUnits.JPY, 0);
    assert.strictEqual(iso4217MinorUnits.KWD, 3);
    assert.isAbove(Object.keys(iso4217MinorUnits).length, 150);
  });
});
