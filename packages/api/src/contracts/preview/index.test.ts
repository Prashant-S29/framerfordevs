// Verifies Preview source authority, response envelopes, selectors, and public error allowlisting.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { ApiSuccessSchema } from "../response/api";
import {
  GetCurrentUserPreviewInput,
  GetRevisionCredentialPreviewInput,
  PreviewApiErrorCode,
  PreviewApiFailure,
  PreviewItem,
  PreviewRouteScope,
  PreviewRevisionSelector,
} from "./index";

const ids = {
  entry: "019fae8b-1234-7000-8000-000000000001",
  collection: "019fae8b-1234-7000-8000-000000000002",
  schema: "019fae8b-1234-7000-8000-000000000003",
  revision: "019fae8b-1234-7000-8000-000000000004",
};

/** Creates one valid current Preview item for contract round trips. */
function item() {
  return {
    id: ids.entry,
    collectionId: ids.collection,
    collection: "articles",
    locale: "gu",
    preview: {
      version: 1,
      source: "current",
      schemaRevisionId: ids.schema,
      contractHash: "a".repeat(64),
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: ids.revision,
      localizedVersion: 2,
    },
    data: { title: "નમસ્તે" },
    validation: { valid: true, issues: [], capped: false },
  };
}

describe("Preview contracts", () => {
  it.effect("decodes current and revision source metadata through the success envelope", () =>
    Effect.gen(function* () {
      const current = yield* Schema.decodeUnknown(ApiSuccessSchema(PreviewItem))({
        ok: true,
        data: item(),
        error: null,
        message: "Preview entry loaded.",
      });
      const revision = yield* Schema.decodeUnknown(PreviewItem)({
        ...item(),
        preview: { ...item().preview, source: "revision" },
      });
      assert.strictEqual(current.data.preview.source, "current");
      assert.strictEqual(revision.preview.source, "revision");
    }),
  );

  it.effect("accepts only explicit none or a branded revision selector", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* Schema.decodeUnknown(PreviewRevisionSelector)("none"), "none");
      assert.strictEqual(
        yield* Schema.decodeUnknown(PreviewRevisionSelector)(ids.revision),
        ids.revision,
      );
      const malformed = yield* Effect.exit(
        Schema.decodeUnknown(PreviewRevisionSelector)("current"),
      );
      assert.isTrue(Exit.isFailure(malformed));
    }),
  );

  it.effect("bounds route keys and strips caller-supplied subject authority", () =>
    Effect.gen(function* () {
      const scope = yield* Schema.decodeUnknown(PreviewRouteScope)({
        projectId: ids.entry,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        locale: "GU",
        credentialId: ids.revision,
      });
      const user = yield* Schema.decodeUnknown(GetCurrentUserPreviewInput)({
        projectId: ids.entry,
        environmentId: ids.collection,
        collectionId: ids.collection,
        entryId: ids.entry,
        locale: "gu",
        role: "owner",
        actorId: "injected",
      });
      const historical = yield* Schema.decodeUnknown(GetRevisionCredentialPreviewInput)({
        ...scope,
        schemaRevisionId: ids.schema,
        sharedRevisionId: null,
        localizedRevisionId: ids.revision,
      });
      assert.strictEqual(scope.locale, "gu");
      assert.isFalse(Object.hasOwn(scope, "credentialId"));
      assert.isFalse(Object.hasOwn(user, "role"));
      assert.isFalse(Object.hasOwn(user, "actorId"));
      assert.isNull(historical.sharedRevisionId);
      const invalidEnvironment = yield* Effect.exit(
        Schema.decodeUnknown(PreviewRouteScope)({ ...scope, environmentKey: "bad--key" }),
      );
      assert.isTrue(Exit.isFailure(invalidEnvironment));
    }),
  );

  it.effect("allowlists Preview errors without importing Delivery-only cursor contracts", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* Schema.decodeUnknown(PreviewApiErrorCode)("PREVIEW_REVISION_INCOMPATIBLE"),
        "PREVIEW_REVISION_INCOMPATIBLE",
      );
      const deliveryOnly = yield* Effect.exit(
        Schema.decodeUnknown(PreviewApiErrorCode)("DELIVERY_CURSOR_STALE"),
      );
      assert.isTrue(Exit.isFailure(deliveryOnly));
      const failure = yield* Schema.decodeUnknown(PreviewApiFailure)({
        ok: false,
        data: null,
        error: {
          code: "PREVIEW_QUERY_INVALID",
          message: "The Preview query is invalid.",
          retryable: false,
          requestId: "request-preview-1",
        },
        message: "The Preview query is invalid.",
      });
      assert.isFalse(failure.ok);
    }),
  );
});
