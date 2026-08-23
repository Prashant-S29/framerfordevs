import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  DeliveryItem,
  DeliveryPage,
  PreviewItem,
  decodePublicEnvelope,
  recognizeDeliveryContract,
} from "./effect";

const entry = {
  id: "019fae8b-1234-7000-8000-000000000001",
  collectionId: "019fae8b-1234-7000-8000-000000000002",
  collection: "blog_posts",
  locale: "en",
  publication: {
    id: "019fae8b-1234-7000-8000-000000000003",
    sequence: 1,
    schemaRevisionId: "019fae8b-1234-7000-8000-000000000004",
    publishedAt: "2026-08-01T12:00:00.000Z",
  },
  data: { title: "Hello" },
};

describe("SDK Effect validators", () => {
  it.effect("decodes exact Delivery and Preview transport envelopes", () =>
    Effect.gen(function* () {
      const delivery = yield* decodePublicEnvelope(DeliveryPage, {
        ok: true,
        data: {
          items: [entry],
          page: { limit: 20, nextCursor: null, hasMore: false },
        },
        error: null,
        message: "Success.",
      });
      const preview = yield* decodePublicEnvelope(PreviewItem, {
        ok: true,
        data: {
          id: entry.id,
          collectionId: entry.collectionId,
          collection: entry.collection,
          locale: entry.locale,
          preview: {
            version: 1,
            schemaRevisionId: entry.publication.schemaRevisionId,
            contractHash: "a".repeat(64),
            sharedRevisionId: null,
            sharedVersion: 0,
            localizedRevisionId: null,
            localizedVersion: 0,
            source: "current",
          },
          data: entry.data,
          validation: { valid: true, issues: [], capped: false },
        },
        error: null,
        message: "Success.",
      });

      assert.isTrue(delivery.ok);
      assert.isTrue(preview.ok);
    }),
  );

  it.effect("rejects contradictory envelopes and unknown transport properties", () =>
    Effect.gen(function* () {
      const contradictory = yield* Effect.exit(
        decodePublicEnvelope(DeliveryItem, {
          ok: true,
          data: entry,
          error: { code: "INTERNAL_ERROR" },
          message: "Invalid.",
        }),
      );
      const unknown = yield* Effect.exit(
        decodePublicEnvelope(DeliveryItem, {
          ok: true,
          data: { ...entry, workspaceId: "private" },
          error: null,
          message: "Invalid.",
        }),
      );

      assert.isTrue(Exit.isFailure(contradictory));
      assert.isTrue(Exit.isFailure(unknown));
    }),
  );

  it.effect("never narrows an unrecognized immutable revision to the locked type", () =>
    Effect.gen(function* () {
      const item = Schema.decodeUnknownSync(DeliveryItem)(entry);
      const recognized = yield* recognizeDeliveryContract(
        item,
        item.publication.schemaRevisionId,
        Schema.Struct({ title: Schema.String }),
      );
      const unrecognized = yield* recognizeDeliveryContract(
        item,
        "019fae8b-1234-7000-8000-000000000099",
        Schema.Struct({ title: Schema.String }),
      );

      assert.strictEqual(recognized.kind, "recognized_contract");
      assert.strictEqual(recognized.data.title, "Hello");
      assert.strictEqual(unrecognized.kind, "unrecognized_revision");
      assert.deepEqual(unrecognized.data, { title: "Hello" });
    }),
  );
});
