// Locks HTTP classification, bounded exponential equal jitter, Retry-After, and exhaustion behavior.

import { assert, describe, it } from "@effect/vitest";

import {
  classifyWebhookHttpStatus,
  parseWebhookRetryAfter,
  scheduleWebhookRetry,
  webhookBackoffCapSeconds,
  webhookEqualJitterSeconds,
} from "./index";

describe("webhook retry policy", () => {
  it("classifies every HTTP family with explicit redirect and permanent-client behavior", () => {
    for (const status of [200, 201, 204, 299]) {
      assert.deepStrictEqual(classifyWebhookHttpStatus(status), {
        outcome: "succeeded",
        retryable: false,
      });
    }
    assert.deepStrictEqual(classifyWebhookHttpStatus(302), {
      outcome: "redirect_rejected",
      retryable: false,
    });
    for (const status of [408, 425, 429, 500, 503, 599]) {
      assert.deepStrictEqual(classifyWebhookHttpStatus(status), {
        outcome: "retryable_http",
        retryable: true,
      });
    }
    assert.deepStrictEqual(classifyWebhookHttpStatus(422), {
      outcome: "permanent_http",
      retryable: false,
    });
  });

  it("uses bounded equal jitter for all twelve attempt numbers", () => {
    const caps = Array.from({ length: 12 }, (_, index) => webhookBackoffCapSeconds(index + 1));
    assert.deepStrictEqual(
      caps,
      [30, 60, 120, 240, 480, 960, 1920, 3840, 7680, 15360, 21600, 21600],
    );
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const cap = webhookBackoffCapSeconds(attempt);
      assert.strictEqual(webhookEqualJitterSeconds(attempt, 0), cap / 2);
      assert.isAtMost(webhookEqualJitterSeconds(attempt, 0.999_999), cap - 1);
    }
  });

  it("honors valid Retry-After and caps excessive delay", () => {
    const now = Date.parse("2026-08-13T12:00:00.000Z");
    assert.strictEqual(parseWebhookRetryAfter("120", now), 120);
    assert.strictEqual(parseWebhookRetryAfter("999999", now), 86_400);
    assert.strictEqual(parseWebhookRetryAfter("Thu, 13 Aug 2026 12:05:00 GMT", now), 300);
    assert.isNull(parseWebhookRetryAfter("malformed", now));
    assert.isNull(parseWebhookRetryAfter("Thu, 13 Aug 2026 11:55:00 GMT", now));
    assert.strictEqual(
      scheduleWebhookRetry({ attemptNumber: 2, entropy: 0, retryAfterSeconds: 120 }),
      120,
    );
  });

  it("stops scheduling after the twelfth attempt and rejects invalid entropy", () => {
    assert.isNull(scheduleWebhookRetry({ attemptNumber: 12, entropy: 0 }));
    assert.throws(() => webhookEqualJitterSeconds(1, 1), RangeError);
    assert.throws(() => webhookBackoffCapSeconds(0), RangeError);
  });
});
