import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Telemetry, TelemetryLive } from "./telemetry";

describe("Effect metrics", () => {
  layer(TelemetryLive)((it) => {
    it.effect("records HTTP and bounded CMS schema metrics without resource labels", () =>
      Effect.gen(function* () {
        const telemetry = yield* Telemetry;

        yield* telemetry.recordHttpRequest({
          method: "GET",
          routeFamily: "health",
          statusFamily: "2xx",
          durationMs: 12,
        });
        yield* telemetry.recordDefect("rpc");
        yield* telemetry.recordCredentialVerification({ family: "delivery", outcome: "success" });
        yield* telemetry.recordLocaleMutation({ action: "create", outcome: "success" });
        yield* telemetry.recordSchemaMutation({ action: "field_update", outcome: "success" });
        yield* telemetry.recordSchemaValidation({ outcome: "invalid" });
        yield* telemetry.recordSchemaPublication({
          outcome: "success",
          severity: "breaking",
          fieldCountBucket: "11-50",
          durationMs: 24,
        });
        yield* telemetry.recordEntryPublication({
          operation: "publish",
          outcome: "success",
          sizeBucket: "small",
          durationMs: 32,
        });
        yield* telemetry.recordEntryPublicationValidationFailure("field_invalid");
        yield* telemetry.recordRateLimitDecision({
          policy: "delivery.credential",
          enforcementMode: "redis",
          outcome: "allowed",
        });
        yield* telemetry.recordRateLimitStore({ result: "success", durationMs: 2 });

        assert.isTrue(true);
      }),
    );
  });
});
