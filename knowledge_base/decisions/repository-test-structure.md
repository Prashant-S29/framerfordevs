# Repository test structure

**Status:** Approved, implemented, and committed as `fe69a76` on 2026-08-21

**Date:** 2026-08-21

## Decision

The repository uses test scope, not one universal physical folder, to determine test placement:

- Focused unit, component, pure-kernel, and isolated Effect tests stay beside their single owning source module as `*.test.ts` or `*.test.tsx`.
- Tests that exercise a real database, HTTP application, filesystem, multiple production modules, or another subsystem boundary live in the owning workspace under `test/integration/`.
- Independent public-protocol verification lives under the owning workspace's `test/contract/` directory.
- Cross-component accessibility suites that have no single component owner live under `test/accessibility/`.
- Shared test-only fixtures and helpers live under `test/support/`; production code never imports them.
- Cross-workspace system and performance suites must be private pnpm/Turborepo workspaces under `tools/`, not dependency-owning code in an anonymous root test directory.

Workspace test directories use the singular name `test/`, matching the existing API setup and external receiver package. Integration and contract tests are organized by capability rather than mirroring every source directory mechanically.

## Why this structure

Colocation keeps a focused behavioral specification discoverable beside the implementation it changes with. Broader tests have different resource, lifecycle, isolation, and ownership concerns; moving those tests out of `src/` makes those boundaries explicit without creating a duplicate source tree that can drift.

Every executable test remains owned by one workspace. Its dependencies, configuration, scripts, cache inputs, and generated reports therefore stay inside the Turborepo package graph. A naked root `tests/` tree is not introduced because it would weaken dependency and task ownership unless it became a workspace itself.

The path becomes a deterministic scope signal for agents:

```text
src/lib/parser.ts
src/lib/parser.test.ts

test/integration/publication/repository.test.ts
test/contract/webhooks/signature.test.ts
test/accessibility/platform.test.tsx
test/support/fixtures.ts

tools/system-tests/
tools/performance/
```

## Boundaries

- Production modules must not import `*.test.*` files or anything under `test/`.
- Tests may import package internals only inside their owning workspace. Cross-workspace tests use declared package exports.
- Package-specific helpers remain local. A shared private test-support package is created only after the same stable helper is needed by at least two workspaces.
- Generated `coverage`, `dist`, `.output`, and Turbo artifacts remain ignored and must not be used as agent context.
- Build entrypoints and production build configurations must continue excluding test artifacts; physical placement is not treated as the only build boundary.
- Database integration tests must not share their database with an independently running worker.

## Initial normalization

The first behavior-neutral normalization will:

1. Move API PostgreSQL/Redis integration suites from `src/services/` to `packages/api/test/integration/services/`.
2. Move server HTTP/application suites to `apps/server/test/integration/`.
3. Move the broad web platform accessibility suite to `apps/web/test/accessibility/`.
4. Classify the external receiver's independent event/signature suites as contract tests, its real HTTP/filesystem suites as integration tests, and keep its focused scenario planner test colocated.
5. Add package-owned targeted test scripts while preserving each package's existing complete `test` and `test:coverage` gates.
6. Update Vitest/test-runner discovery, rules, and documentation without changing product behavior or production imports.

Milestone 12 remains unstarted until this normalization passes the full readiness gate and receives developer review.
