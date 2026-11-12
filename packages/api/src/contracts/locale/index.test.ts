import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { localeRegistryFileDate } from "./registry";
import { validateAndCanonicalizeLocaleTag } from "./tag";
import {
  CreateProjectLocaleInput,
  ExplicitLocaleContext,
  LocaleDisplayName,
  LocaleTag,
  ProjectLocaleOrder,
  canonicalizeLocaleTag,
} from "./index";

import * as SchemaStrict from "../../lib/schema-strict";
const projectId = "019fae8b-1234-7000-8000-000000000001";
const firstLocaleId = "019fae8b-1234-7000-8000-000000000002";
const secondLocaleId = "019fae8b-1234-7000-8000-000000000003";

describe("locale contracts", () => {
  it.effect("canonicalizes registered locale tags and safe registry aliases", () =>
    Effect.gen(function* () {
      const fixtures = [
        [" EN ", "en"],
        ["en-us", "en-US"],
        ["zh-hant-tw", "zh-Hant-TW"],
        ["iw", "he"],
        ["de-1901", "de-1901"],
        ["i-klingon", "tlh"],
        ["zh-cmn-Hans", "cmn-Hans"],
      ] as const;

      for (const [input, expected] of fixtures) {
        assert.strictEqual(
          String(yield* SchemaStrict.decodeUnknownEffect(LocaleTag)(input)),
          expected,
        );
        assert.strictEqual(canonicalizeLocaleTag(input), expected);
      }
    }),
  );

  it("uses the pinned IANA registry and reports deterministic rejection reasons", () => {
    assert.strictEqual(localeRegistryFileDate, "2026-06-14");
    assert.deepStrictEqual(validateAndCanonicalizeLocaleTag("doekdoek"), {
      ok: false,
      code: "unknown_language",
    });
    assert.deepStrictEqual(validateAndCanonicalizeLocaleTag("en-Abcd"), {
      ok: false,
      code: "unknown_script",
    });
    assert.deepStrictEqual(validateAndCanonicalizeLocaleTag("en-WW"), {
      ok: false,
      code: "unknown_region",
    });
    assert.deepStrictEqual(validateAndCanonicalizeLocaleTag("en-foobar"), {
      ok: false,
      code: "unknown_variant",
    });
    assert.deepStrictEqual(validateAndCanonicalizeLocaleTag("de-DE-u-co-phonebk"), {
      ok: false,
      code: "unsupported_extension",
    });
    assert.deepStrictEqual(validateAndCanonicalizeLocaleTag("en-x-private"), {
      ok: false,
      code: "unsupported_private_use",
    });
    assert.deepStrictEqual(validateAndCanonicalizeLocaleTag("i-default"), {
      ok: false,
      code: "unsupported_grandfathered",
    });
  });

  it.effect("keeps exact regional locale identity instead of reducing to a base language", () =>
    Effect.gen(function* () {
      const base = yield* SchemaStrict.decodeUnknownEffect(LocaleTag)("en");
      const regional = yield* SchemaStrict.decodeUnknownEffect(LocaleTag)("en-GB");

      assert.notStrictEqual(base, regional);
      assert.strictEqual(regional, "en-GB");
    }),
  );

  it.effect("rejects malformed, non-ASCII, control, multiple, and oversized locale tags", () =>
    Effect.gen(function* () {
      const invalid = [
        "",
        "doekdoek",
        "oedll",
        "xlw",
        "en_US",
        "en--US",
        "en,fr",
        "é",
        "en\nUS",
        "x-private",
        "en-x-private",
        "de-DE-u-co-phonebk",
        "qaa",
        "en-Qaaa",
        "en-AA",
        "a".repeat(65),
      ];
      const exits = yield* Effect.forEach(invalid, (tag) =>
        Effect.exit(SchemaStrict.decodeUnknownEffect(LocaleTag)(tag)),
      );

      assert.isTrue(exits.every(Exit.isFailure));
    }),
  );

  it.effect("normalizes safe display names and rejects empty, control, and oversized values", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* SchemaStrict.decodeUnknownEffect(LocaleDisplayName)("  Franc\u0327ais  "),
        "Français",
      );
      const exits = yield* Effect.all([
        Effect.exit(SchemaStrict.decodeUnknownEffect(LocaleDisplayName)("   ")),
        Effect.exit(SchemaStrict.decodeUnknownEffect(LocaleDisplayName)("Unsafe\nname")),
        Effect.exit(SchemaStrict.decodeUnknownEffect(LocaleDisplayName)("x".repeat(101))),
      ]);

      assert.isTrue(exits.every(Exit.isFailure));
    }),
  );

  it.effect("requires explicit locale context without supplying English", () =>
    Effect.gen(function* () {
      const context = yield* SchemaStrict.decodeUnknownEffect(ExplicitLocaleContext)({
        locale: "EN",
      });
      const missing = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(ExplicitLocaleContext)({}),
      );
      const empty = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(ExplicitLocaleContext)({ locale: "" }),
      );

      assert.strictEqual(context.locale, "en");
      assert.isTrue(Exit.isFailure(missing));
      assert.isTrue(Exit.isFailure(empty));
    }),
  );

  it.effect("canonicalizes locale creation at the transport boundary", () =>
    Effect.gen(function* () {
      const input = yield* SchemaStrict.decodeUnknownEffect(CreateProjectLocaleInput)({
        projectId,
        tag: "GU-in",
        displayName: " Gujarati ",
      });

      assert.strictEqual(input.tag, "gu-IN");
      assert.strictEqual(input.displayName, "Gujarati");
    }),
  );

  it.effect("accepts a complete unique bounded order and rejects duplicate locale IDs", () =>
    Effect.gen(function* () {
      const order = yield* SchemaStrict.decodeUnknownEffect(ProjectLocaleOrder)([
        { localeId: firstLocaleId, version: 1 },
        { localeId: secondLocaleId, version: 2 },
      ]);
      const duplicate = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(ProjectLocaleOrder)([
          { localeId: firstLocaleId, version: 1 },
          { localeId: firstLocaleId, version: 1 },
        ]),
      );

      assert.strictEqual(order.length, 2);
      assert.isTrue(Exit.isFailure(duplicate));
    }),
  );

  it.effect.prop(
    "canonicalization is idempotent for every accepted locale tag",
    [Schema.String],
    ([value]) =>
      Effect.gen(function* () {
        const first = yield* Effect.option(SchemaStrict.decodeUnknownEffect(LocaleTag)(value));
        if (first._tag === "Some") {
          assert.strictEqual(
            yield* SchemaStrict.decodeUnknownEffect(LocaleTag)(first.value),
            first.value,
          );
        }
      }),
  );
});
