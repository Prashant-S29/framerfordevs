import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";
import { TestClock } from "effect/testing";

import { PreviewHandoffClaims, previewHandoffLimits } from "../../../contracts/preview-handoff";
import { isPreviewHandoffToken, makePreviewHandoffSigner, type PreviewHandoffClaimsInput } from ".";

const activeSecret = "preview-handoff-active-secret-with-32-plus-characters";
const previousSecret = "preview-handoff-previous-secret-with-32-plus-characters";

const claims = Schema.decodeUnknownSync(
  PreviewHandoffClaims.mapFields((fields) => {
    const {
      version: _version,
      issuedAtEpochMs: _issued,
      expiresAtEpochMs: _expires,
      ...rest
    } = fields;
    return rest;
  }),
  { onExcessProperty: "error" },
)({
  issuer: "studio",
  userId: "user-1",
  workspaceId: "019fae8b-4234-7000-8000-000000000001",
  projectId: "019fae8b-4234-7000-8000-000000000002",
  environmentId: "019fae8b-4234-7000-8000-000000000003",
  collectionId: "019fae8b-4234-7000-8000-000000000004",
  entryId: "019fae8b-4234-7000-8000-000000000005",
  locale: "en",
  source: "current",
  schemaRevisionId: null,
  sharedRevisionId: null,
  localizedRevisionId: null,
  targetVersion: 2,
}) satisfies PreviewHandoffClaimsInput;

function tamper(token: string, index: number): string {
  const character = token[index] === "A" ? "B" : "A";
  return `${token.slice(0, index)}${character}${token.slice(index + 1)}`;
}

describe("Preview handoff signer", () => {
  it.effect("signs a bounded ffd_pvh_ token and verifies its exact claims", () =>
    Effect.gen(function* () {
      const signer = makePreviewHandoffSigner({ activeSecret });
      const signed = yield* signer.sign(claims);
      assert.isTrue(isPreviewHandoffToken(signed.token));
      assert.isAtMost(signed.token.length, previewHandoffLimits.tokenBytes);
      const verified = yield* signer.verify(signed.token);
      assert.deepStrictEqual({ ...verified }, { ...signed.claims });
      assert.strictEqual(
        verified.expiresAtEpochMs - verified.issuedAtEpochMs,
        previewHandoffLimits.lifetimeMs,
      );
    }),
  );

  it.effect("rejects changed payloads, changed signatures, and another secret", () =>
    Effect.gen(function* () {
      const signer = makePreviewHandoffSigner({ activeSecret });
      const { token } = yield* signer.sign(claims);
      for (const changed of [tamper(token, 12), tamper(token, token.length - 2), `${token}x`]) {
        const exit = yield* Effect.exit(signer.verify(changed));
        assert.isTrue(Exit.isFailure(exit), changed);
      }
      const other = makePreviewHandoffSigner({ activeSecret: previousSecret });
      assert.isTrue(Exit.isFailure(yield* Effect.exit(other.verify(token))));
    }),
  );

  it.effect("accepts tokens signed with the previous secret during rotation", () =>
    Effect.gen(function* () {
      const old = makePreviewHandoffSigner({ activeSecret: previousSecret });
      const { token } = yield* old.sign(claims);
      const rotated = makePreviewHandoffSigner({ activeSecret, previousSecret });
      assert.strictEqual((yield* rotated.verify(token)).entryId, claims.entryId);
    }),
  );

  it.effect("expires after five minutes", () =>
    Effect.gen(function* () {
      const signer = makePreviewHandoffSigner({ activeSecret });
      const { token } = yield* signer.sign(claims);
      yield* TestClock.adjust(previewHandoffLimits.lifetimeMs - 1);
      assert.isTrue(Exit.isSuccess(yield* Effect.exit(signer.verify(token))));
      yield* TestClock.adjust(1);
      assert.isTrue(Exit.isFailure(yield* Effect.exit(signer.verify(token))));
    }),
  );

  it.effect("rejects incoherent source claims", () =>
    Effect.gen(function* () {
      const signer = makePreviewHandoffSigner({ activeSecret });
      const { token } = yield* signer.sign({
        ...claims,
        source: "revision",
        schemaRevisionId: null,
      });
      assert.isTrue(Exit.isFailure(yield* Effect.exit(signer.verify(token))));
    }),
  );
});
