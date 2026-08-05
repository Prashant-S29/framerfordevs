# Observability Rules

Every meaningful operation must be diagnosable without exposing sensitive data.

- Assign or propagate request IDs.
- Propagate valid trace context.
- Use named spans at business and infrastructure boundaries.
- Use structured logs, not concatenated debug strings.
- Add metrics at meaningful boundaries with bounded-cardinality labels.
- Record duration, result, and safe stable resource context where useful.
- Keep audit events separate from diagnostic logs.
- Redact authorization headers, cookies, passwords, tokens, secrets, database URLs, webhook secrets, and sensitive content.
- Do not log complete request/response bodies or content entries by default.
- Telemetry failures must not crash the product or create unbounded buffering.
