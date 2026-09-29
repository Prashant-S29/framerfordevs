import { createHmac } from "node:crypto";

import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, Schema, TestClock } from "effect";

import { StudioContentCursor } from "../../../contracts/studio-content";
import { makeStudioContentCursorSigner } from ".";

const authority = {
  mode: "search" as const,
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
  collectionId: "019fae8b-1234-7000-8000-000000000003",
  locale: "en",
  schemaRevisionId: "019fae8b-1234-7000-8000-000000000004",
  queryDigest: "a".repeat(64),
};

function failureTag(exit: Exit.Exit<unknown, unknown>): string | undefined {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
  return typeof failure === "object" &&
    failure !== null &&
    "_tag" in failure &&
    typeof failure._tag === "string"
    ? failure._tag
    : undefined;
}

describe("Studio Content cursor signer", () => {
  it.effect("round trips search ordering while binding scope and query digest", () =>
    Effect.gen(function* () {
      const signer = makeStudioContentCursorSigner({
        activeSecret: "studio-content-cursor-active-secret-at-least-32-bytes",
      });
      const cursor = yield* signer.sign({
        ...authority,
        browseOrder: null,
        searchOrder: {
          foldedDisplayName: "article",
          entryId: "019fae8b-1234-7000-8000-000000000005",
        },
      });
      const verified = yield* signer.verify(cursor, authority);

      assert.strictEqual(verified.searchOrder?.foldedDisplayName, "article");
      assert.isAtMost(cursor.length, 1_024);
      const decodedPayload = Buffer.from(cursor.slice(0, -43), "base64url").toString("utf8");
      assert.notInclude(decodedPayload, "Secret Query");
      for (const forbidden of [
        "accessToken",
        "refreshToken",
        "authorization",
        "sourceKey",
        "apiKey",
        "secret",
        "roles",
      ]) {
        assert.notInclude(decodedPayload, forbidden);
      }
      assert.strictEqual(
        failureTag(
          yield* Effect.exit(signer.verify(cursor, { ...authority, queryDigest: "b".repeat(64) })),
        ),
        "StudioContentCursorInvalidFailure",
      );
    }),
  );

  it.effect("rejects tampering and reports a current-schema change as stale", () =>
    Effect.gen(function* () {
      const signer = makeStudioContentCursorSigner({
        activeSecret: "studio-content-cursor-stale-secret-at-least-32-bytes",
      });
      const cursor = yield* signer.sign({
        ...authority,
        browseOrder: null,
        searchOrder: {
          foldedDisplayName: "article",
          entryId: "019fae8b-1234-7000-8000-000000000005",
        },
      });
      const tampered = Schema.decodeUnknownSync(StudioContentCursor)(
        `${cursor.slice(0, -1)}${cursor.endsWith("a") ? "b" : "a"}`,
      );

      assert.strictEqual(
        failureTag(yield* Effect.exit(signer.verify(tampered, authority))),
        "StudioContentCursorInvalidFailure",
      );
      assert.strictEqual(
        failureTag(
          yield* Effect.exit(
            signer.verify(cursor, {
              ...authority,
              schemaRevisionId: "019fae8b-1234-7000-8000-000000000099",
            }),
          ),
        ),
        "StudioContentCursorStaleFailure",
      );
    }),
  );

  it.effect("binds every scope dimension and browse/search mode", () =>
    Effect.gen(function* () {
      const signer = makeStudioContentCursorSigner({
        activeSecret: "studio-content-cursor-scope-secret-at-least-32-bytes",
      });
      const browseAuthority = { ...authority, mode: "browse" as const, queryDigest: null };
      const cursor = yield* signer.sign({
        ...browseAuthority,
        browseOrder: {
          createdAt: "2026-09-27T00:00:00.000Z",
          entryId: "019fae8b-1234-7000-8000-000000000005",
        },
        searchOrder: null,
      });
      const verified = yield* signer.verify(cursor, browseAuthority);
      assert.strictEqual(verified.browseOrder?.entryId, "019fae8b-1234-7000-8000-000000000005");

      const mismatches = [
        { ...browseAuthority, mode: "search" as const, queryDigest: "a".repeat(64) },
        { ...browseAuthority, projectId: "019fae8b-1234-7000-8000-000000000091" },
        { ...browseAuthority, environmentId: "019fae8b-1234-7000-8000-000000000092" },
        { ...browseAuthority, collectionId: "019fae8b-1234-7000-8000-000000000093" },
        { ...browseAuthority, locale: "fr" },
      ];
      for (const mismatch of mismatches) {
        assert.strictEqual(
          failureTag(yield* Effect.exit(signer.verify(cursor, mismatch))),
          "StudioContentCursorInvalidFailure",
        );
      }
    }),
  );

  it.effect("supports one prior signing secret and rejects expiration at the exact boundary", () =>
    Effect.gen(function* () {
      const oldSecret = "studio-content-cursor-old-secret-at-least-32-bytes";
      const oldSigner = makeStudioContentCursorSigner({ activeSecret: oldSecret });
      const cursor = yield* oldSigner.sign({
        ...authority,
        browseOrder: null,
        searchOrder: {
          foldedDisplayName: "article",
          entryId: "019fae8b-1234-7000-8000-000000000005",
        },
      });
      const rotated = makeStudioContentCursorSigner({
        activeSecret: "studio-content-cursor-new-secret-at-least-32-bytes",
        previousSecret: oldSecret,
      });
      yield* rotated.verify(cursor, authority);
      const withoutPrevious = makeStudioContentCursorSigner({
        activeSecret: "studio-content-cursor-other-secret-at-least-32-bytes",
      });
      assert.strictEqual(
        failureTag(yield* Effect.exit(withoutPrevious.verify(cursor, authority))),
        "StudioContentCursorInvalidFailure",
      );

      yield* TestClock.adjust(899_999);
      yield* rotated.verify(cursor, authority);
      yield* TestClock.adjust(1);
      assert.strictEqual(
        failureTag(yield* Effect.exit(rotated.verify(cursor, authority))),
        "StudioContentCursorInvalidFailure",
      );
      yield* TestClock.adjust(1);
      assert.strictEqual(
        failureTag(yield* Effect.exit(rotated.verify(cursor, authority))),
        "StudioContentCursorInvalidFailure",
      );
    }),
  );

  it.effect("rejects malformed, truncated, extended, and excess-property payloads", () =>
    Effect.gen(function* () {
      const secret = "studio-content-cursor-malformed-secret-at-least-32-bytes";
      const signer = makeStudioContentCursorSigner({ activeSecret: secret });
      for (const value of ["a".repeat(43), "a".repeat(44), "a".repeat(1_024)]) {
        const cursor = Schema.decodeUnknownSync(StudioContentCursor)(value);
        assert.strictEqual(
          failureTag(yield* Effect.exit(signer.verify(cursor, authority))),
          "StudioContentCursorInvalidFailure",
        );
      }
      const now = yield* Effect.clockWith((clock) => clock.currentTimeMillis);
      const payload = Buffer.from(
        JSON.stringify({
          version: 1,
          kind: "studio_content_entries",
          ...authority,
          browseOrder: null,
          searchOrder: {
            foldedDisplayName: "article",
            entryId: "019fae8b-1234-7000-8000-000000000005",
          },
          issuedAtEpochMs: now,
          expiresAtEpochMs: now + 15 * 60 * 1_000,
          unexpected: true,
        }),
        "utf8",
      ).toString("base64url");
      const signature = createHmac("sha256", secret)
        .update(`ffd:studio-content-cursor:v1:${payload}`, "utf8")
        .digest("base64url");
      const excess = Schema.decodeUnknownSync(StudioContentCursor)(`${payload}${signature}`);
      assert.strictEqual(
        failureTag(yield* Effect.exit(signer.verify(excess, authority))),
        "StudioContentCursorInvalidFailure",
      );
    }),
  );

  it.effect("rejects inconsistent browse/search mode authority before signing", () =>
    Effect.gen(function* () {
      const signer = makeStudioContentCursorSigner({
        activeSecret: "studio-content-cursor-mode-secret-at-least-32-bytes",
      });
      const exit = yield* Effect.exit(
        signer.sign({
          ...authority,
          browseOrder: {
            createdAt: "2026-09-27T00:00:00.000Z",
            entryId: "019fae8b-1234-7000-8000-000000000005",
          },
          searchOrder: null,
        }),
      );

      assert.strictEqual(failureTag(exit), "SecurityServiceFailure");
    }),
  );
});
