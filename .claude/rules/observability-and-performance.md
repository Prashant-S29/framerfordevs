---
paths:
  - "packages/api/src/**"
  - "apps/server/src/**"
  - "apps/worker/src/**"
  - "packages/studio-server/src/**"
---

# Observability and performance

- Assign or propagate request IDs and valid trace context. Use named spans at business and infrastructure boundaries.
- Log structured fields, never concatenated strings. Keep audit events separate from diagnostic logs.
- Metric labels have bounded cardinality.
- Redact authorization headers, cookies, passwords, tokens, secrets, database URLs, webhook secrets, and content. Do not log full request or response bodies.
- A telemetry failure must not crash the product or buffer without bound.
- Compile Delivery snapshots at publication and optimize reads. Use cursor pagination.
- Bound page size, filters, sorting, expansion depth, nested values, and response size.
- Prevent N+1 queries, select only required columns, and add indexes for real query paths.
- Avoid unbounded concurrency, retries, queues, and in-memory caches. Measure before you optimize.
