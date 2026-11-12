---
paths:
  - "**/*.test.{ts,tsx}"
  - "**/test/**"
  - "**/vitest.config.ts"
  - "tools/browser-tests/**"
---

# Testing

- Cover success, failure, authorization, boundary, and regression cases. Use property or fuzz tests for schemas and parsers, database tests for constraints and transactions, and failure injection for atomic workflows and workers.
- Tests are deterministic. Do not add retries unless the behavior under test is retry behavior.
- Placement: a unit or component test sits beside its single owning module as `*.test.ts(x)`. Database, HTTP, filesystem, and multi-module tests go in the owning workspace's `test/integration/`. Public protocol tests go in `test/contract/`. Cross-component accessibility suites go in `test/accessibility/`. Shared helpers go in `test/support/`. Cross-workspace system and performance suites are private workspaces under `tools/`.
- Production code never imports a test file or anything under `test/`. Cross-workspace tests use declared package exports.
- Browser specs live in `tools/browser-tests`. They run headless, retry-free, without screenshots, traces, or video, against validated loopback origins, through `pnpm test:browser`. They need the Docker app stack with the worker stopped. Add a browser spec only for behavior that component and API tests cannot prove.
- Vitest 5 compares Effect class instances and object literals as different types. Compare plain copies, for example `{ ...value }`.
