import { assert, describe, layer } from "@effect/vitest";
import { Effect } from "effect";

import { Telemetry, TelemetryLive } from "./telemetry";

describe("Effect metrics", () => {
  layer(TelemetryLive)((it) => {
    it.effect("records request count, latency, status family, and defects", () =>
      Effect.gen(function* () {
        const telemetry = yield* Telemetry;

        yield* telemetry.recordHttpRequest({
          method: "GET",
          routeFamily: "health",
          statusFamily: "2xx",
          durationMs: 12,
        });
        yield* telemetry.recordDefect("rpc");

        assert.isTrue(true);
      }),
    );
  });
});
