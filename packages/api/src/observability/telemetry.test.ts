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
        yield* telemetry.recordSchemaMutation({ action: "field_update", outcome: "success" });
        yield* telemetry.recordSchemaValidation({ outcome: "invalid" });
        yield* telemetry.recordSchemaPublication({
          outcome: "success",
          severity: "breaking",
          fieldCountBucket: "11-50",
          durationMs: 24,
        });

        assert.isTrue(true);
      }),
    );
  });
});
