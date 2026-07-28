# Milestone 1 Effect and protocol boundaries

**Status:** Implemented for developer review  
**Date:** 2026-07-29

## Runtime versions

- `effect`: `3.22.0`
- `@effect/vitest`: `0.30.0`
- `@effect/platform`: `0.97.0`
- `@effect/opentelemetry`: `0.64.0`

These versions are aligned with the stable Effect 3.22 release. Effect v4 and unstable native Drizzle integration remain deferred.

## Application boundary

Application-owned work returns typed `Effect` values and runs through one shared `ManagedRuntime`. Database access, Better Auth session lookup, structured logging, telemetry, and clock access are replaceable services/Layers. Framework handlers are adapters that execute Effects and map their exits centrally.

Application-owned API contracts use the schema-backed discriminated response union:

- Success: `{ ok: true, data, error: null, message }`
- Failure: `{ ok: false, data: null, error, message }`

Expected failures, defects, and interruption remain distinct internally. Public failures are sanitized and deterministically mapped to HTTP status codes.

## Better Auth compatibility exception

Better Auth owns `/api/auth/**` as a protocol. Its clients depend on Better Auth's native response bodies, errors, status codes, and cookies. Wrapping those responses in the application envelope would break protocol compatibility and generated client behavior.

Therefore:

- Better Auth HTTP responses remain native.
- Internal session lookup is wrapped by `AuthSessionService` and translates Promise rejection into `AuthSessionFailure`.
- Auth requests still receive request IDs, CORS policy, structured request telemetry, safe logging, and tracing at the server boundary.

## Database boundary

Stable Drizzle remains the database integration used by Better Auth. Application code accesses database behavior through typed Effect services. Promise rejection is translated into `DatabaseFailure`; raw driver errors never enter public contracts.

## Observability defaults

- Development without an OTLP endpoint emits bounded, redacted trace summaries to the console for local inspection.
- Test uses in-memory exporters and replaceable logger/telemetry Layers.
- Production without an OTLP endpoint performs no network export.
- Setting `OTEL_EXPORTER_OTLP_ENDPOINT` enables OTLP/HTTP traces and metrics.
- Exporter lifecycle is owned by the application Layer and shuts down with the ManagedRuntime.

Only bounded request dimensions are used for metrics. Authorization, cookies, credentials, request bodies, and content payloads are excluded or redacted.
