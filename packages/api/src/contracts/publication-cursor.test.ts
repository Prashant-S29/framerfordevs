// Verifies publication-history cursors are opaque, bounded, and exact-scope bound.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { Cursor } from "./platform";
import { decodePublicationCursor, encodePublicationCursor } from "./publication-cursor";
import {
  EntryPublicationId,
  EntryPublicationSequence,
  GetEntryPublicationStatusInput,
} from "./publications";

const scope = Schema.decodeUnknownSync(GetEntryPublicationStatusInput)({
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
  collectionId: "019fae8b-1234-7000-8000-000000000003",
  entryId: "019fae8b-1234-7000-8000-000000000004",
  locale: "hi",
});

const publicationId = Schema.decodeUnknownSync(EntryPublicationId)(
  "019fae8b-1234-7000-8000-000000000005",
);
const sequence = Schema.decodeUnknownSync(EntryPublicationSequence)(3);

describe("publication cursor", () => {
  it.effect("round trips immutable ordering authority", () =>
    Effect.gen(function* () {
      const cursor = yield* encodePublicationCursor({ ...scope, sequence, publicationId });
      const decoded = yield* decodePublicationCursor(cursor, scope);

      assert.strictEqual(decoded.sequence, 3);
      assert.strictEqual(decoded.publicationId, publicationId);
    }),
  );

  it.effect("rejects malformed and cross-locale cursors uniformly", () =>
    Effect.gen(function* () {
      const malformed = Schema.decodeUnknownSync(Cursor)("not-json");
      const cursor = yield* encodePublicationCursor({ ...scope, sequence, publicationId });
      const malformedExit = yield* Effect.exit(decodePublicationCursor(malformed, scope));
      const wrongScopeExit = yield* Effect.exit(
        decodePublicationCursor(
          cursor,
          Schema.decodeUnknownSync(GetEntryPublicationStatusInput)({ ...scope, locale: "en" }),
        ),
      );

      assert.isTrue(Exit.isFailure(malformedExit));
      assert.isTrue(Exit.isFailure(wrongScopeExit));
    }),
  );
});
