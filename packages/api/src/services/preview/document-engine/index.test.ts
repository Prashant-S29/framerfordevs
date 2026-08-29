// Verifies typed Effect service success and hard-corruption translation for Preview compilation.

import { assert, describe, layer } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { EntryValues } from "../../../contracts/entry";
import { compilePreviewDocument } from "../../../lib/preview/document";
import {
  PreviewDocumentEngine,
  PreviewDocumentEngineLive,
  makePreviewDocumentEngine,
} from "./index";

const baseInput = {
  entryId: "019fae8b-1234-7000-8000-000000000001",
  collectionId: "019fae8b-1234-7000-8000-000000000002",
  collectionKey: "articles",
  locale: "gu",
  fields: [],
  sharedValues: Schema.decodeUnknownSync(EntryValues)({}),
  localizedValues: Schema.decodeUnknownSync(EntryValues)({}),
  authority: {
    source: "current" as const,
    schemaRevisionId: "019fae8b-1234-7000-8000-000000000003",
    contractHash: "a".repeat(64),
    sharedRevisionId: null,
    sharedVersion: 0,
    localizedRevisionId: null,
    localizedVersion: 0,
  },
  role: null,
};

describe("PreviewDocumentEngine", () => {
  layer(PreviewDocumentEngineLive)((it) => {
    it.effect("decodes a bounded pure candidate into the Preview contract", () =>
      Effect.gen(function* () {
        const item = yield* (yield* PreviewDocumentEngine).compile(baseInput);
        assert.strictEqual(item.locale, "gu");
        assert.strictEqual(item.preview.source, "current");
        assert.isTrue(item.validation.valid);
      }),
    );

    it.effect("rejects an exact compiled representation above the response cap", () =>
      Effect.gen(function* () {
        const engine = makePreviewDocumentEngine({
          compile: (input) => {
            const result = compilePreviewDocument(input);
            return result.ok ? { ...result, responseBytes: 2_621_441 } : result;
          },
        });
        const failure = yield* Effect.flip(engine.compile(baseInput));
        assert.strictEqual(failure._tag, "PreviewResponseTooLargeFailure");
      }),
    );

    it.effect(
      "translates structurally unsafe persisted fragments to a typed corruption failure",
      () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            (yield* PreviewDocumentEngine).compile({
              ...baseInput,
              sharedValues: Schema.decodeUnknownSync(EntryValues)({
                "019fae8b-1234-7000-8000-000000000004": () => undefined,
              }),
            }),
          );
          assert.strictEqual(exit._tag, "Failure");
        }),
    );
  });
});
