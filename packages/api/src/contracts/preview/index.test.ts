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
      const current = yield* Schema.decodeUnknownEffect(ApiSuccessSchema(PreviewItem), {
        onExcessProperty: "error",
      })({
        ok: true,
        data: item(),
        error: null,
        message: "Preview entry loaded.",
      });
      const revision = yield* Schema.decodeUnknownEffect(PreviewItem, {
        onExcessProperty: "error",
      })({
        ...item(),
        preview: { ...item().preview, source: "revision" },
      });
      assert.strictEqual(current.data.preview.source, "current");
      assert.strictEqual(revision.preview.source, "revision");
    }),
  );

  it.effect("accepts only explicit none or a branded revision selector", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* Schema.decodeUnknownEffect(PreviewRevisionSelector, { onExcessProperty: "error" })(
          "none",
        ),
        "none",
      );
      assert.strictEqual(
        yield* Schema.decodeUnknownEffect(PreviewRevisionSelector, { onExcessProperty: "error" })(
          ids.revision,
        ),
        ids.revision,
      );
      const malformed = yield* Effect.exit(
        Schema.decodeUnknownEffect(PreviewRevisionSelector, { onExcessProperty: "error" })(
          "current",
        ),
      );
      assert.isTrue(Exit.isFailure(malformed));
    }),
  );

  it.effect("bounds route keys and rejects caller-supplied subject authority", () =>
    Effect.gen(function* () {
      const strict = { onExcessProperty: "error" } as const;
      const scopeInput = {
        projectId: ids.entry,
        environmentKey: "main",
        collectionKey: "articles",
        entryId: ids.entry,
        locale: "GU",
      };
      const scope = yield* Schema.decodeUnknownEffect(PreviewRouteScope, strict)(scopeInput);
      assert.strictEqual(scope.locale, "gu");
      const injectedCredential = yield* Effect.exit(
        Schema.decodeUnknownEffect(
          PreviewRouteScope,
          strict,
        )({
          ...scopeInput,
          credentialId: ids.revision,
        }),
      );
      assert.isTrue(Exit.isFailure(injectedCredential));
      const injectedActor = yield* Effect.exit(
        Schema.decodeUnknownEffect(
          GetCurrentUserPreviewInput,
          strict,
        )({
          projectId: ids.entry,
          environmentId: ids.collection,
          collectionId: ids.collection,
          entryId: ids.entry,
          locale: "gu",
          role: "owner",
          actorId: "injected",
        }),
      );
      assert.isTrue(Exit.isFailure(injectedActor));
      const historical = yield* Schema.decodeUnknownEffect(
        GetRevisionCredentialPreviewInput,
        strict,
      )({
        ...scope,
        schemaRevisionId: ids.schema,
        sharedRevisionId: null,
        localizedRevisionId: ids.revision,
      });
      assert.isNull(historical.sharedRevisionId);
      const invalidEnvironment = yield* Effect.exit(
        Schema.decodeUnknownEffect(
          PreviewRouteScope,
          strict,
        )({
          ...scope,
          environmentKey: "bad--key",
        }),
      );
      assert.isTrue(Exit.isFailure(invalidEnvironment));
    }),
  );

  it.effect("allowlists Preview errors without importing Delivery-only cursor contracts", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* Schema.decodeUnknownEffect(PreviewApiErrorCode, { onExcessProperty: "error" })(
          "PREVIEW_REVISION_INCOMPATIBLE",
        ),
        "PREVIEW_REVISION_INCOMPATIBLE",
      );
      const deliveryOnly = yield* Effect.exit(
        Schema.decodeUnknownEffect(PreviewApiErrorCode, { onExcessProperty: "error" })(
          "DELIVERY_CURSOR_STALE",
        ),
      );
      assert.isTrue(Exit.isFailure(deliveryOnly));
      const failure = yield* Schema.decodeUnknownEffect(PreviewApiFailure, {
        onExcessProperty: "error",
      })({
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
