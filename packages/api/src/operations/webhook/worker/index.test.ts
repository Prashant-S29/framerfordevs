import { assert, describe, it, layer } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { makeWebhookCrypto, WebhookCrypto } from "../../../services/webhook/crypto";
import {
  makeWebhookWorkerRepository,
  WebhookWorkerRepository,
} from "../../../services/webhook/worker-repository";
import {
  webhookWorkerAttemptConcurrency,
  webhookWorkerLiveness,
  webhookWorkerReadiness,
} from "./index";

const crypto = makeWebhookCrypto({
  activeKeyId: "active",
  keys: { active: Buffer.alloc(32, 9).toString("base64url") },
});

function testLayer(keyIds: ReadonlyArray<string>) {
  const repository = makeWebhookWorkerRepository();
  return Layer.merge(
    Layer.succeed(WebhookCrypto, crypto),
    Layer.succeed(WebhookWorkerRepository, {
      ...repository,
      pendingCount: () => Effect.succeed(0),
      referencedEncryptionKeyIds: () => Effect.succeed([...keyIds]),
    }),
  );
}

describe("Webhook worker operations", () => {
  it("keeps the approved global attempt scheduler bound", () => {
    assert.strictEqual(webhookWorkerAttemptConcurrency, 32);
  });

  layer(testLayer(["active"]))((it) => {
    it.effect("separates dependency-free liveness from database and key readiness", () =>
      Effect.gen(function* () {
        assert.deepStrictEqual(yield* webhookWorkerLiveness(), { status: "ok" });
        assert.deepStrictEqual(yield* webhookWorkerReadiness(), { status: "ready" });
      }),
    );
  });

  layer(testLayer(["retired-but-referenced"]))((it) => {
    it.effect("fails readiness when any referenced ciphertext key is unavailable", () =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(webhookWorkerReadiness());
        assert.strictEqual(failure._tag, "SecurityServiceFailure");
        assert.strictEqual(failure.operation, "webhook.worker.readiness");
      }),
    );
  });
});
