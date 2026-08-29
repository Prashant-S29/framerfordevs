// Verifies strict bounded current and historical Preview query parsing without fallback.

import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import { previewLimits } from "../../../contracts/preview";
import { parseCurrentPreviewQuery, parseRevisionPreviewQuery } from "./index";

const revisionId = "019fae8b-1234-7000-8000-000000000001";

/** Returns the first stable issue code for a rejected parser result. */
function issueCode(result: ReturnType<typeof parseCurrentPreviewQuery>): string | undefined {
  return result.ok ? undefined : result.issues[0]?.code;
}

describe("Preview query grammar", () => {
  it.effect("canonicalizes exactly one current locale and accepts no other authority", () =>
    Effect.sync(() => {
      const parsed = parseCurrentPreviewQuery("locale=GU");
      assert.isTrue(parsed.ok);
      if (parsed.ok) assert.strictEqual(parsed.value.locale, "gu");
      assert.strictEqual(issueCode(parseCurrentPreviewQuery("")), "locale_required");
      assert.strictEqual(
        issueCode(parseCurrentPreviewQuery("locale=not_a_locale")),
        "locale_invalid",
      );
      assert.strictEqual(
        issueCode(parseCurrentPreviewQuery("locale=en&locale=gu")),
        "duplicate_parameter",
      );
      assert.strictEqual(
        issueCode(parseCurrentPreviewQuery("locale=en&token=secret")),
        "query_parameter_unknown",
      );
    }),
  );

  it.effect("requires both explicit historical selectors and preserves version-0 none", () =>
    Effect.sync(() => {
      const parsed = parseRevisionPreviewQuery(
        `locale=hi&sharedRevision=none&localizedRevision=${revisionId}`,
      );
      assert.isTrue(parsed.ok);
      if (parsed.ok) {
        assert.strictEqual(parsed.value.locale, "hi");
        assert.strictEqual(parsed.value.sharedRevision, "none");
        assert.strictEqual(parsed.value.localizedRevision, revisionId);
      }
      const invalidBase = parseRevisionPreviewQuery("sharedRevision=none&localizedRevision=none");
      assert.isFalse(invalidBase.ok);
      const missing = parseRevisionPreviewQuery("locale=hi&sharedRevision=none");
      assert.isFalse(missing.ok);
      if (!missing.ok) assert.strictEqual(missing.issues[0]?.path, "localizedRevision");
      const malformed = parseRevisionPreviewQuery(
        "locale=hi&sharedRevision=not-a-revision&localizedRevision=none",
      );
      assert.isFalse(malformed.ok);
      if (!malformed.ok) assert.strictEqual(malformed.issues[0]?.code, "revision_selector_invalid");
      const malformedLocalized = parseRevisionPreviewQuery(
        "locale=hi&sharedRevision=none&localizedRevision=not-a-revision",
      );
      assert.isFalse(malformedLocalized.ok);
    }),
  );

  it.effect("accepts the byte boundary and rejects one byte above it before domain work", () =>
    Effect.sync(() => {
      const prefix = "locale=en&";
      const atLimit = `${prefix}${"x".repeat(previewLimits.queryBytes - prefix.length)}`;
      const aboveLimit = `${atLimit}x`;
      assert.notStrictEqual(issueCode(parseCurrentPreviewQuery(atLimit)), "query_too_large");
      assert.strictEqual(issueCode(parseCurrentPreviewQuery(aboveLimit)), "query_too_large");
    }),
  );
});
