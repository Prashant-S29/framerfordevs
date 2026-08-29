// Verifies M7 entry/revision cursors preserve immutable ordering and reject cross-scope reuse.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  decodeEntryCursor,
  decodeEntryRevisionCursor,
  encodeEntryCursor,
  encodeEntryRevisionCursor,
} from "./index";
import { EntryId, EntryRevisionId } from "..";
import { LocaleTag } from "../../locale";
import { Cursor, EnvironmentId, ProjectId } from "../../platform";
import { CollectionId } from "../../schema";

const projectId = ProjectId.make("019fae8b-1234-7000-8000-000000000001");
const environmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000002");
const collectionId = CollectionId.make("019fae8b-1234-7000-8000-000000000003");
const entryId = EntryId.make("019fae8b-1234-7000-8000-000000000004");
const revisionId = EntryRevisionId.make("019fae8b-1234-7000-8000-000000000005");
const locale = LocaleTag.make("hi");
const createdAt = "2026-08-07T12:00:00.000Z";

const scope = { projectId, environmentId, collectionId, locale };

describe("entry cursors", () => {
  it.effect("round-trips immutable entry ordering", () =>
    Effect.gen(function* () {
      const cursor = yield* encodeEntryCursor({ ...scope, createdAt, entryId });
      const decoded = yield* decodeEntryCursor(cursor, scope);

      assert.strictEqual(decoded.createdAt, createdAt);
      assert.strictEqual(decoded.entryId, entryId);
    }),
  );

  it.effect("rejects entry cursor reuse under another collection or locale", () =>
    Effect.gen(function* () {
      const cursor = yield* encodeEntryCursor({ ...scope, createdAt, entryId });
      const collectionExit = yield* Effect.exit(
        decodeEntryCursor(cursor, {
          ...scope,
          collectionId: CollectionId.make("019fae8b-1234-7000-8000-000000000006"),
        }),
      );
      const localeExit = yield* Effect.exit(
        decodeEntryCursor(cursor, { ...scope, locale: LocaleTag.make("gu") }),
      );

      assert.isTrue(Exit.isFailure(collectionExit));
      assert.isTrue(Exit.isFailure(localeExit));
    }),
  );

  it.effect("round-trips revision scope and rejects partition reuse", () =>
    Effect.gen(function* () {
      const revisionScope = { ...scope, entryId, scope: "localized" as const };
      const cursor = yield* encodeEntryRevisionCursor({
        ...revisionScope,
        sequence: 3,
        revisionId,
      });
      const decoded = yield* decodeEntryRevisionCursor(cursor, revisionScope);
      const wrongScope = yield* Effect.exit(
        decodeEntryRevisionCursor(cursor, { ...revisionScope, scope: "shared" }),
      );

      assert.strictEqual(decoded.sequence, 3);
      assert.strictEqual(decoded.revisionId, revisionId);
      assert.isTrue(Exit.isFailure(wrongScope));
    }),
  );

  it.effect("rejects malformed and wrong-kind payloads without defects", () =>
    Effect.gen(function* () {
      const malformed = yield* Effect.exit(
        decodeEntryCursor(yield* Schema.decodeUnknown(Cursor)("bm90LWpzb24"), scope),
      );
      const revisionCursor = yield* encodeEntryRevisionCursor({
        ...scope,
        entryId,
        scope: "localized",
        sequence: 1,
        revisionId,
      });
      const wrongKind = yield* Effect.exit(decodeEntryCursor(revisionCursor, scope));

      assert.isTrue(Exit.isFailure(malformed));
      assert.isTrue(Exit.isFailure(wrongKind));
    }),
  );
});
