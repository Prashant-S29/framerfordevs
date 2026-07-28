import * as NodeSdk from "@effect/opentelemetry/NodeSdk";
import { env } from "@framerfordevs/env/server";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Duration, Effect } from "effect";

import { SafeConsoleSpanExporter } from "./safe-console-span-exporter";

export function signalUrl(endpoint: string, signal: "traces" | "metrics") {
  return `${endpoint.replace(/\/$/, "")}/v1/${signal}`;
}

export function makeOpenTelemetryConfiguration(options: {
  readonly endpoint?: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
}): NodeSdk.Configuration {
  const resource = {
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion,
    attributes: {
      "deployment.environment.name": options.environment,
    },
  };

  if (!options.endpoint) {
    return options.environment === "development"
      ? {
          resource,
          spanProcessor: new SimpleSpanProcessor(new SafeConsoleSpanExporter()),
        }
      : { resource };
  }

  return {
    resource,
    spanProcessor: new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: signalUrl(options.endpoint, "traces"),
      }),
    ),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: signalUrl(options.endpoint, "metrics"),
      }),
      exportIntervalMillis: 10_000,
    }),
    shutdownTimeout: Duration.seconds(5),
  };
}

export const OpenTelemetryLive = NodeSdk.layer(
  Effect.sync(() =>
    makeOpenTelemetryConfiguration({
      ...(env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
        ? {}
        : { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }),
      serviceName: env.OTEL_SERVICE_NAME,
      serviceVersion: env.OTEL_SERVICE_VERSION,
      environment: env.NODE_ENV,
    }),
  ),
);
