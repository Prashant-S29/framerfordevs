# Repository browser test workflow

**Status:** Approved by explicit developer instruction and implemented during the M15 review workstream on 2026-09-16

## Decision

The repository separates repeatable browser specifications from interactive browser exploration.

Automated browser coverage is owned by the private cross-workspace package `tools/browser-tests` and runs through `pnpm test:browser`. Its ordinary `test` script also places the suite in the repository readiness graph. The suite:

- uses pinned project dependencies and a separately installed pinned Chromium rather than global tooling;
- targets only a validated loopback origin and fails with a bounded preflight diagnostic when the local stack is unavailable;
- runs headlessly with one worker, isolated browser contexts, no retries, and no screenshots, traces, videos, or HTML report;
- asserts user-visible behavior with semantic locators and web-first expectations rather than CSS structure or image comparison;
- begins with a small critical shell/auth/invitation-security smoke layer and grows only for durable browser-specific regressions that lower-level tests cannot prove;
- owns no production source and follows the existing cross-workspace `tools/*` test boundary.

Interactive `playwright-cli` sessions, headed/UI/debug modes, screenshots, traces, videos, and manual visual or breakpoint tours require an explicit developer request in the current conversation. This permission boundary is always loaded from `AGENTS.md`; the project-local `project-browser-validation` skill supplies the authorized workflow without relying on a machine-global skill.

## Rationale

The repository already has a mature package-owned unit, Effect, component, accessibility, contract, database, HTTP, concurrency, and failure-injection pyramid. Consolidating those suites would weaken ownership and contradict the approved test-placement decision. The missing layer was a small reproducible real-browser system suite.

A committed Playwright Test suite gives every clone the same assertions and versions while keeping normal agent output compact. Separating it from interactive exploration prevents expensive screenshot-driven tours from becoming an implicit validation default before the product reaches its dedicated visual-polish phase.

## Boundaries

- Browser tests do not duplicate exhaustive role, schema, API, or policy matrices already proved below the browser boundary.
- Tests must not use real credentials or retain invitation proofs, cookies, session state, or other secrets in output artifacts.
- Stateful browser fixtures require exact isolation and cleanup authority; the initial suite is read-only and account-free.
- Retries cannot hide nondeterminism. A flaky browser test is fixed or removed from the gate.
- Chromium is the routine baseline. Additional engines, devices, visual snapshots, and broad responsive review are release- or developer-directed work, not default execution.
- Browser binaries remain outside Git. A fresh clone runs `pnpm install` and then `pnpm browser:install` once before the browser suite.

## References

- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Playwright test configuration](https://playwright.dev/docs/test-configuration)
- [`repository-test-structure.md`](repository-test-structure.md)
