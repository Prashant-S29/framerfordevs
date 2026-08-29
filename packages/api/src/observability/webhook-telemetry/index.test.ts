import { assert, describe, it, layer } from "@effect/vitest";
import { Effect } from "effect";

import {
  WebhookTelemetry,
  WebhookTelemetryLive,
  webhookQueueAgeBucket,
  webhookRetryDelayBucket,
} from "./index";

describe("Webhook telemetry", () => {
  it("uses exhaustive bounded queue-age and retry-delay buckets", () => {
    assert.deepStrictEqual(
      [999, 1_000, 9_999, 10_000, 59_999, 60_000, 599_999, 600_000].map(webhookQueueAgeBucket),
      ["under_1s", "1s_10s", "1s_10s", "10s_1m", "10s_1m", "1m_10m", "1m_10m", "over_10m"],
    );
    assert.deepStrictEqual(
      [null, 59, 60, 599, 600, 3_599, 3_600, 21_600, 21_601].map(webhookRetryDelayBucket),
      ["none", "under_1m", "1m_10m", "1m_10m", "10m_1h", "10m_1h", "1h_6h", "1h_6h", "over_6h"],
    );
  });

  layer(WebhookTelemetryLive)((it) => {
    it.effect("records closed worker outcomes without resource labels", () =>
      Effect.gen(function* () {
        const telemetry = yield* WebhookTelemetry;
        yield* telemetry.recordDispatchPoll("work");
        yield* telemetry.recordProjection("success");
        yield* telemetry.recordLeaseRecovery();
        yield* telemetry.recordAttempt({
          eventType: "cms.entry.published",
          kind: "replay",
          outcome: "retryable_http",
          statusFamily: "5xx",
          durationMs: 42,
          queueAge: "1s_10s",
          retryDelay: "1m_10m",
        });
        yield* telemetry.recordAttempt({
          eventType: "cms.entry.unpublished",
          kind: "initial",
          outcome: "permanent_http",
          statusFamily: "4xx",
          durationMs: 18,
          queueAge: "under_1s",
          retryDelay: "none",
        });
        yield* telemetry.recordGracefulShutdown("success");
        assert.isTrue(true);
      }),
    );
  });
});
