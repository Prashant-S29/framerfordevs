# Testing Rules

Every behavior needs success, failure, authorization, boundary, and regression coverage as applicable.

Use a balanced test pyramid:

- Pure unit tests for domain rules
- Effect tests with test Layers
- Property and fuzz tests for schemas, invariants, and parsers
- Database integration tests for constraints and transactions
- API contract tests for envelopes and status mapping
- Authorization matrix and tenant-isolation tests
- Browser tests for critical UX and accessibility
- Load and concurrency tests for delivery and publication paths
- Failure-injection tests for atomic workflows and workers

Tests must be deterministic. Do not hide failures with retries unless the behavior being tested is explicitly retry-related.
