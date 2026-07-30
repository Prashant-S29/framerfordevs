import { assert, describe, layer } from "@effect/vitest";
import { Effect, TestClock } from "effect";

import { ApiCredentialId, type CredentialFamily } from "../contracts/access";
import {
  CredentialAttemptLimiter,
  CredentialAttemptLimiterLive,
  makeCredentialAttemptLimiter,
} from "./credential-attempt-limiter";
import { SecretGenerator, SecretGeneratorLive, parseCredentialKey } from "./secret-generator";

const credentialId = ApiCredentialId.make("019fae8b-1234-7000-8000-000000000001");

describe("SecretGenerator", () => {
  layer(SecretGeneratorLive)((it) => {
    it.effect(
      "generates unique 256-bit invitation tokens and digest-only verification material",
      () =>
        Effect.gen(function* () {
          const secrets = yield* SecretGenerator;
          const tokens = yield* Effect.all(
            Array.from({ length: 32 }, () => secrets.generateInvitationToken()),
          );
          const digest = yield* secrets.digest(tokens[0] ?? "");

          assert.strictEqual(new Set(tokens).size, tokens.length);
          assert.isTrue(tokens.every((token) => token.length === 43));
          assert.match(digest, /^[0-9a-f]{64}$/u);
          assert.isTrue(yield* secrets.verifyDigest(tokens[0] ?? "", digest));
          assert.isFalse(yield* secrets.verifyDigest(tokens[1] ?? "", digest));
        }),
    );

    it.effect(
      "generates strict family-specific credential keys that parse without widening scope",
      () =>
        Effect.gen(function* () {
          const secrets = yield* SecretGenerator;
          const families: ReadonlyArray<CredentialFamily> = ["management", "delivery", "preview"];
          for (const family of families) {
            const material = yield* secrets.generateCredentialMaterial(family, credentialId);
            const parsed = parseCredentialKey(material.key);

            assert.strictEqual(parsed?.id, credentialId);
            assert.strictEqual(parsed?.family, family);
            assert.isTrue(material.key.startsWith(`${material.keyPrefix}_`));
            assert.isTrue(yield* secrets.verifyDigest(material.key, material.keyDigest));
            assert.notInclude(material.keyDigest, material.key.slice(-16));
          }
        }),
    );

    it.effect("rejects malformed credentials before persistence lookup", () =>
      Effect.sync(() => {
        assert.isUndefined(parseCredentialKey(""));
        assert.isUndefined(parseCredentialKey(`ffd_mgmt_${credentialId}_short`));
        assert.isUndefined(
          parseCredentialKey(
            `ffd_unknown_${credentialId}_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`,
          ),
        );
      }),
    );

    it.effect("creates a bounded non-raw source fingerprint", () =>
      Effect.gen(function* () {
        const secrets = yield* SecretGenerator;
        const source = "198.51.100.12";
        const fingerprint = yield* secrets.fingerprintSource(source);

        assert.match(fingerprint, /^[0-9a-f]{64}$/u);
        assert.notInclude(fingerprint, source);
      }),
    );
  });
});

describe("CredentialAttemptLimiter", () => {
  layer(CredentialAttemptLimiterLive)((it) => {
    it.effect(
      "allows bounded failures, rate limits the next attempt, and resets after the window",
      () =>
        Effect.gen(function* () {
          const limiter = makeCredentialAttemptLimiter({
            maxFailures: 2,
            windowMs: 1_000,
            maxEntries: 10,
          });
          const fingerprint = "a".repeat(64);

          yield* limiter.assertAllowed(fingerprint);
          yield* limiter.recordFailure(fingerprint);
          yield* limiter.assertAllowed(fingerprint);
          yield* limiter.recordFailure(fingerprint);
          const limited = yield* Effect.exit(limiter.assertAllowed(fingerprint));
          assert.strictEqual(limited._tag, "Failure");

          yield* TestClock.adjust("1 second");
          yield* limiter.assertAllowed(fingerprint);
        }),
    );

    it.effect("caps retained source fingerprints and clears successful sources", () =>
      Effect.gen(function* () {
        const limiter = makeCredentialAttemptLimiter({
          maxFailures: 3,
          windowMs: 60_000,
          maxEntries: 2,
        });
        yield* limiter.recordFailure("a".repeat(64));
        yield* TestClock.adjust("1 millis");
        yield* limiter.recordFailure("b".repeat(64));
        yield* TestClock.adjust("1 millis");
        yield* limiter.recordFailure("c".repeat(64));
        assert.strictEqual(yield* limiter.retainedEntryCount(), 2);

        yield* limiter.reset("c".repeat(64));
        assert.strictEqual(yield* limiter.retainedEntryCount(), 1);
      }),
    );

    it.effect("exposes a replaceable live limiter service", () =>
      Effect.gen(function* () {
        const limiter = yield* CredentialAttemptLimiter;
        const fingerprint = "d".repeat(64);
        yield* limiter.assertAllowed(fingerprint);
        yield* limiter.recordFailure(fingerprint);
        yield* limiter.reset(fingerprint);
      }),
    );
  });
});
