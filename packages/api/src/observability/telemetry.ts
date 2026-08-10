import { Context, Effect, Layer, Metric, MetricBoundaries, Schema } from "effect";

import type { HttpMethod, RouteFamily } from "./request-context";

export const StatusFamilySchema = Schema.Literal("1xx", "2xx", "3xx", "4xx", "5xx");
export type StatusFamily = typeof StatusFamilySchema.Type;

export const OperationOutcomeSchema = Schema.Literal("success", "failure", "defect", "interrupted");
export type OperationOutcome = typeof OperationOutcomeSchema.Type;

export interface HttpRequestMetric {
  readonly method: HttpMethod;
  readonly routeFamily: RouteFamily;
  readonly statusFamily: StatusFamily;
  readonly durationMs: number;
}

export interface CredentialVerificationMetric {
  readonly family: "management" | "delivery" | "preview";
  readonly outcome: "success" | "invalid" | "rate_limited";
}

export interface LocaleMutationMetric {
  readonly action: "create" | "update_display_name" | "reorder" | "update_status";
  readonly outcome: "success" | "failure";
}

export interface SchemaMutationMetric {
  readonly action:
    | "collection_create"
    | "collection_update"
    | "field_create"
    | "field_update"
    | "field_replace"
    | "field_remove"
    | "field_reorder"
    | "layout_update";
  readonly outcome: "success" | "failure";
}

export interface SchemaValidationMetric {
  readonly outcome: "valid" | "invalid" | "failure";
}

export interface SchemaPublicationMetric {
  readonly outcome: "success" | "failure";
  readonly severity: "none" | "non_breaking" | "potentially_breaking" | "breaking";
  readonly fieldCountBucket: "1-10" | "11-50" | "51-100";
  readonly durationMs: number;
}

export interface EntryPublicationMetric {
  readonly operation: "validate" | "publish" | "unpublish";
  readonly outcome: "success" | "invalid" | "conflict" | "failure";
  readonly sizeBucket: "none" | "small" | "medium" | "large" | "near_limit" | "over_limit";
  readonly durationMs: number;
}

export type EntryPublicationValidationCategory =
  | "field_invalid"
  | "hidden_field"
  | "reference_target_locale_unpublished"
  | "snapshot_size_exceeded"
  | "other";

const requestCount = Metric.counter("http_requests_total", {
  description: "Total inbound HTTP requests",
  incremental: true,
});

const requestLatency = Metric.histogram(
  "http_request_duration_ms",
  MetricBoundaries.exponential({ start: 1, factor: 2, count: 16 }),
  "Inbound HTTP request duration in milliseconds",
);

const defectCount = Metric.counter("application_unhandled_defects_total", {
  description: "Unhandled application defects",
  incremental: true,
});

const credentialVerificationCount = Metric.counter("credential_verifications_total", {
  description: "Credential verification outcomes by bounded family and result",
  incremental: true,
});

const localeMutationCount = Metric.counter("project_locale_mutations_total", {
  description: "Project locale mutation outcomes by bounded action and result",
  incremental: true,
});

const schemaMutationCount = Metric.counter("cms_schema_mutations_total", {
  description: "CMS schema mutation outcomes by bounded action and result",
  incremental: true,
});

const schemaValidationCount = Metric.counter("cms_schema_validations_total", {
  description: "CMS schema validation outcomes",
  incremental: true,
});

const schemaPublicationCount = Metric.counter("cms_schema_publications_total", {
  description: "CMS schema publication outcomes by bounded severity and field-count bucket",
  incremental: true,
});

const schemaPublicationLatency = Metric.histogram(
  "cms_schema_publication_duration_ms",
  MetricBoundaries.exponential({ start: 1, factor: 2, count: 16 }),
  "CMS schema publication duration in milliseconds",
);

const entryPublicationCount = Metric.counter("cms_entry_publication_operations_total", {
  description: "Entry publication outcomes by bounded operation, result, and size bucket",
  incremental: true,
});

const entryPublicationLatency = Metric.histogram(
  "cms_entry_publication_duration_ms",
  MetricBoundaries.exponential({ start: 1, factor: 2, count: 16 }),
  "Entry publication operation duration in milliseconds",
);

const entryPublicationValidationFailureCount = Metric.counter(
  "cms_entry_publication_validation_failures_total",
  { description: "Entry publication validation failures by bounded category", incremental: true },
);

function withRequestLabels<Type, In, Out>(
  metric: Metric.Metric<Type, In, Out>,
  event: HttpRequestMetric,
): Metric.Metric<Type, In, Out> {
  return Metric.tagged(
    Metric.tagged(Metric.tagged(metric, "method", event.method), "route", event.routeFamily),
    "status_family",
    event.statusFamily,
  );
}

export class Telemetry extends Context.Tag("Telemetry")<
  Telemetry,
  {
    readonly recordHttpRequest: (event: HttpRequestMetric) => Effect.Effect<void>;
    readonly recordDefect: (routeFamily: RouteFamily) => Effect.Effect<void>;
    readonly recordCredentialVerification: (
      event: CredentialVerificationMetric,
    ) => Effect.Effect<void>;
    readonly recordLocaleMutation: (event: LocaleMutationMetric) => Effect.Effect<void>;
    readonly recordSchemaMutation: (event: SchemaMutationMetric) => Effect.Effect<void>;
    readonly recordSchemaValidation: (event: SchemaValidationMetric) => Effect.Effect<void>;
    readonly recordSchemaPublication: (event: SchemaPublicationMetric) => Effect.Effect<void>;
    readonly recordEntryPublication: (event: EntryPublicationMetric) => Effect.Effect<void>;
    readonly recordEntryPublicationValidationFailure: (
      category: EntryPublicationValidationCategory,
    ) => Effect.Effect<void>;
  }
>() {}

export const TelemetryLive = Layer.succeed(Telemetry, {
  recordHttpRequest: (event) =>
    Effect.all([
      Metric.update(withRequestLabels(requestCount, event), 1),
      Metric.update(withRequestLabels(requestLatency, event), event.durationMs),
    ]).pipe(Effect.asVoid),
  recordDefect: (routeFamily) => Metric.update(Metric.tagged(defectCount, "route", routeFamily), 1),
  recordCredentialVerification: (event) =>
    Metric.update(
      Metric.tagged(
        Metric.tagged(credentialVerificationCount, "family", event.family),
        "outcome",
        event.outcome,
      ),
      1,
    ),
  recordLocaleMutation: (event) =>
    Metric.update(
      Metric.tagged(
        Metric.tagged(localeMutationCount, "action", event.action),
        "outcome",
        event.outcome,
      ),
      1,
    ),
  recordSchemaMutation: (event) =>
    Metric.update(
      Metric.tagged(
        Metric.tagged(schemaMutationCount, "action", event.action),
        "outcome",
        event.outcome,
      ),
      1,
    ),
  recordSchemaValidation: (event) =>
    Metric.update(Metric.tagged(schemaValidationCount, "outcome", event.outcome), 1),
  recordSchemaPublication: (event) => {
    const labels = Metric.tagged(
      Metric.tagged(
        Metric.tagged(schemaPublicationCount, "outcome", event.outcome),
        "severity",
        event.severity,
      ),
      "field_count",
      event.fieldCountBucket,
    );
    const latency = Metric.tagged(
      Metric.tagged(
        Metric.tagged(schemaPublicationLatency, "outcome", event.outcome),
        "severity",
        event.severity,
      ),
      "field_count",
      event.fieldCountBucket,
    );
    return Effect.all([Metric.update(labels, 1), Metric.update(latency, event.durationMs)]).pipe(
      Effect.asVoid,
    );
  },
  recordEntryPublication: (event) => {
    const labels = Metric.tagged(
      Metric.tagged(
        Metric.tagged(entryPublicationCount, "operation", event.operation),
        "outcome",
        event.outcome,
      ),
      "size_bucket",
      event.sizeBucket,
    );
    const latency = Metric.tagged(
      Metric.tagged(entryPublicationLatency, "operation", event.operation),
      "outcome",
      event.outcome,
    );
    return Effect.all([Metric.update(labels, 1), Metric.update(latency, event.durationMs)]).pipe(
      Effect.asVoid,
    );
  },
  recordEntryPublicationValidationFailure: (category) =>
    Metric.update(Metric.tagged(entryPublicationValidationFailureCount, "category", category), 1),
});

export function toStatusFamily(status: number): StatusFamily {
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}
