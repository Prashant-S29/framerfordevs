import { assert, describe, it, layer } from "@effect/vitest";
import { Effect, TestClock } from "effect";

import { ApiCredentialId, type CredentialFamily } from "../contracts/access";
import { makeCredentialAttemptLimiter } from "./credential-attempt-limiter";
import { makeRateLimitManager } from "./rate-limit-manager";
import { makeMemoryRateLimitStore } from "./rate-limit-store";
import { SecretGenerator, SecretGeneratorLive, parseCredentialKey } from "./secret-generator";
import type { TelemetryService } from "../observability/telemetry";

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
  });
});

const NoopTelemetry: TelemetryService = {
  recordHttpRequest: () => Effect.void,
  recordDefect: () => Effect.void,
  recordCredentialVerification: () => Effect.void,
  recordLocaleMutation: () => Effect.void,
  recordSchemaMutation: () => Effect.void,
  recordSchemaValidation: () => Effect.void,
  recordSchemaPublication: () => Effect.void,
  recordEntryPublication: () => Effect.void,
  recordEntryPublicationValidationFailure: () => Effect.void,
  recordPreviewRead: () => Effect.void,
  recordPreviewQueryRejection: () => Effect.void,
  recordPreviewAuditFailure: () => Effect.void,
  recordToolingRequest: () => Effect.void,
  recordToolingOAuthVerification: () => Effect.void,
  recordRateLimitDecision: () => Effect.void,
  recordRateLimitStore: () => Effect.void,
};

/** Creates an isolated central manager for each credential limiter behavior test. */
function makeTestCredentialLimiter() {
  const manager = makeRateLimitManager({
    primary: makeMemoryRateLimitStore({ maxEntries: 10 }),
    fallback: makeMemoryRateLimitStore({ maxEntries: 10 }),
    telemetry: NoopTelemetry,
    fingerprintSecret: "credential-attempt-test-secret-that-is-long-enough",
  });
  return makeCredentialAttemptLimiter(manager);
}

describe("CredentialAttemptLimiter", () => {
  it.effect("limits repeated invalid attempts and clears a successful source", () =>
    Effect.gen(function* () {
      const limiter = makeTestCredentialLimiter();
      const source = "198.51.100.10";

      for (let attempt = 0; attempt < 10; attempt += 1) {
        yield* limiter.assertAllowed(source);
        yield* limiter.recordFailure(source);
      }
      const limited = yield* Effect.exit(limiter.assertAllowed(source));
      assert.strictEqual(limited._tag, "Failure");

      yield* limiter.reset(source);
      yield* limiter.assertAllowed(source);
    }),
  );

  it.effect("uses gradual refill instead of retaining a permanent fixed window", () =>
    Effect.gen(function* () {
      const limiter = makeTestCredentialLimiter();
      const source = "198.51.100.11";
      for (let attempt = 0; attempt < 10; attempt += 1) {
        yield* limiter.assertAllowed(source);
      }

      yield* TestClock.adjust("6 seconds");
      yield* limiter.assertAllowed(source);
    }),
  );
});
