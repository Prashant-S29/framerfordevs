import { describe, expect, it } from "@effect/vitest";

import { makeOpenTelemetryConfiguration, signalUrl } from "./index";

describe("OpenTelemetry configuration", () => {
  it("uses a safe local default without network exporters", () => {
    const configuration = makeOpenTelemetryConfiguration({
      serviceName: "framerfordevs-test",
      serviceVersion: "1.0.0",
      environment: "test",
    });

    expect(configuration.resource).toEqual({
      serviceName: "framerfordevs-test",
      serviceVersion: "1.0.0",
      attributes: { "deployment.environment.name": "test" },
    });
    expect(configuration.spanProcessor).toBeUndefined();
    expect(configuration.metricReader).toBeUndefined();
  });

  it("uses the safe console span exporter for local development", () => {
    const configuration = makeOpenTelemetryConfiguration({
      serviceName: "framerfordevs-test",
      serviceVersion: "1.0.0",
      environment: "development",
    });

    expect(configuration.spanProcessor).toBeDefined();
    expect(configuration.metricReader).toBeUndefined();
  });

  it("configures OTLP trace and metric exporters only when an endpoint is provided", () => {
    const configuration = makeOpenTelemetryConfiguration({
      endpoint: "https://telemetry.example/",
      serviceName: "framerfordevs-test",
      serviceVersion: "1.0.0",
      environment: "production",
    });

    expect(configuration.spanProcessor).toBeDefined();
    expect(configuration.metricReader).toBeDefined();
    expect(signalUrl("https://telemetry.example/", "traces")).toBe(
      "https://telemetry.example/v1/traces",
    );
    expect(signalUrl("https://telemetry.example", "metrics")).toBe(
      "https://telemetry.example/v1/metrics",
    );
  });
});
