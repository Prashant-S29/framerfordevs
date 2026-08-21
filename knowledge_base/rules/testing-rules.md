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

## Test placement

Use test scope to determine placement:

- Keep a focused unit, component, pure-kernel, or isolated Effect test beside its single owning source module as `*.test.ts` or `*.test.tsx`.
- Put real database, HTTP application, filesystem, multi-module, and subsystem tests under the owning workspace's `test/integration/` directory.
- Put independent public-protocol tests under `test/contract/`.
- Put cross-component accessibility suites without one source owner under `test/accessibility/`.
- Put shared workspace-local test fixtures and helpers under `test/support/`.
- Put cross-workspace system and performance suites in private pnpm/Turborepo workspaces under `tools/`; do not create an anonymous dependency-owning root test tree.

Production code must never import a test file or anything under `test/`. Tests may import package internals only within their owning workspace; cross-workspace tests use declared package exports. Follow `knowledge_base/decisions/repository-test-structure.md` for rationale and examples.

Stop independently running workers before database integration or coverage tests that use the same development database.
