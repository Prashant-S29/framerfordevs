# CMS Development Progress

**Overall status:** Milestone 0 approved; Milestone 1 ready to begin
**Active milestone:** Milestone 1 — Effect foundation, error contract, and observability
**Last updated:** 2026-07-29

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Automated criteria complete
- `[R]` Awaiting developer manual review
- `[A]` Developer approved
- `[!]` Blocked

## Milestone tracker

| #   | Milestone                                | Status | Automated tests | Manual review | Commit    |
| --- | ---------------------------------------- | ------ | --------------- | ------------- | --------- |
| 0   | Validate existing foundation             | `[A]`  | 26 passing      | Approved      | `7d5a312` |
| 1   | Effect foundation, errors, observability | `[ ]`  | Not run         | Pending       | None      |
| 2   | Platform kernel                          | `[ ]`  | Not run         | Pending       | None      |
| 3   | Membership, policies, credentials        | `[ ]`  | Not run         | Pending       | None      |
| 4   | Project locales                          | `[ ]`  | Not run         | Pending       | None      |
| 5   | Versioned schema engine                  | `[ ]`  | Not run         | Pending       | None      |
| 6   | Field system and generated forms         | `[ ]`  | Not run         | Pending       | None      |
| 7   | Entries and multilingual drafts          | `[ ]`  | Not run         | Pending       | None      |
| 8   | Per-locale publication and snapshots     | `[ ]`  | Not run         | Pending       | None      |
| 9   | Delivery API                             | `[ ]`  | Not run         | Pending       | None      |
| 10  | Preview API                              | `[ ]`  | Not run         | Pending       | None      |
| 11  | Events, webhooks, invalidation           | `[ ]`  | Not run         | Pending       | None      |
| 12  | Generated developer tooling              | `[ ]`  | Not run         | Pending       | None      |
| 13  | Client handover                          | `[ ]`  | Not run         | Pending       | None      |
| 14  | Production hardening                     | `[ ]`  | Not run         | Pending       | None      |
| 15  | Visual-builder readiness contracts       | `[ ]`  | Not run         | Pending       | None      |

## Documentation completed

- `[x]` Read original product vision and CMS PRD.
- `[x]` Replaced the oversized CMS PRD with `knowledge_base/prd/cms.md`.
- `[x]` Defined per-locale publication from the start.
- `[x]` Defined snapshot-per-locale semantics for shared fields.
- `[x]` Defined strict explicit-locale Delivery API behavior.
- `[x]` Defined versioned schema draft/publish lifecycle.
- `[x]` Defined structured rich text and external-link-only assets.
- `[x]` Defined one visible `main` environment with future-ready environment scoping.
- `[x]` Defined the discriminated `{ ok, data, error, message }` application response contract with schema-backed error codes.
- `[x]` Defined Effect v3, central errors, and observability requirements.
- `[x]` Created milestone plan with test-heavy success criteria.
- `[x]` Created mandatory agent rules, session context, and product/architecture learnings log.

## Tooling/research completed

- `[x]` Confirmed actual repository stack.
- `[x]` Installed Drizzle, Postgres, Express, and TanStack skills.
- `[x]` Installed the official Effect skill.
- `[x]` Added the official Effect source prepare setup.
- `[x]` Cloned the complete Effect repository for local research.
- `[x]` Pinned the current local research checkout to stable Effect 3.22.0.
- `[x]` Confirmed Better Auth has no official Effect-native adapter.
- `[x]` Confirmed protocol-owned auth responses must remain native.
- `[x]` Selected stable Effect v3 instead of Effect v4 beta/Drizzle RC.

## Completed Milestone 0 checklist

### Foundation checks

- `[x]` Inspect all package scripts and workspace task coverage.
- `[x]` Verify install/prepare idempotency.
- `[x]` Run formatting/lint baseline — clean; generated migrations, vendored Effect source, and installed skills are excluded from formatting.
- `[x]` Run type-check baseline — all seven TypeScript packages pass; the config-only package has no source task.
- `[x]` Run production build baseline — server and web pass; Turbo web outputs and tsdown dependency settings are corrected.
- `[x]` Confirm no validation command triggers migration generation/application.

### Runtime checks

- `[x]` Validate PostgreSQL health and read-only connectivity.
- `[x]` Validate Express health.
- `[x]` Validate oRPC public and protected procedures.
- `[x]` Validate OpenAPI reference through GET.
- `[x]` Validate configured CORS behavior — configured origin and preflight pass; untrusted requests/preflights return 403 without CORS headers.
- `[x]` Validate complete Docker web/server/PostgreSQL health behavior and HTTP reachability.

### Authentication checks

- `[x]` Validate sign-up.
- `[x]` Validate duplicate sign-up.
- `[x]` Validate sign-in success and invalid credentials.
- `[x]` Validate session retrieval, database expiry, refresh timing, and invalidation behavior.
- `[x]` Validate protected API access anonymously and with an authenticated session.
- `[x]` Validate sign-out/session invalidation.
- `[x]` Review cookie attributes — development/test use `HttpOnly; SameSite=Lax` without `Secure`; production uses `HttpOnly; Secure; SameSite=None`.

### Test foundation

- `[x]` Add Vitest and V8 coverage infrastructure.
- `[x]` Add repeatable environment, database, Express, CORS, oRPC, OpenAPI, Better Auth, session, cookie-policy, and authenticated-navigation tests.
- `[x]` Resolve/document the pre-existing lint, task-coverage, CORS, cookie, build-output, and Docker-build issues.
- `[x]` Run all Milestone 0 automated criteria.
- `[x]` Update this file with commands and results.
- `[x]` Request developer manual review.
- `[A]` Developer manually verified and approved Milestone 0.

## Milestone 1 readiness

- `[x]` Stable Effect v3 direction selected.
- `[x]` Stable `effect@3.22.0` source pinned for local research.
- `[x]` Better Auth protocol-boundary exception documented.
- `[x]` ManagedRuntime and typed adapter direction documented.
- `[ ]` Install aligned Effect runtime, testing, and OpenTelemetry packages.
- `[ ]` Implement central schemas for API responses and error codes.
- `[ ]` Implement request correlation, tracing, structured logging, metrics, Layers, and ManagedRuntime.
- `[ ]` Wrap database and Better Auth session access with typed Effect adapters.
- `[ ]` Route application-owned oRPC procedures through the runtime and central error boundary.
- `[ ]` Add property, contract, redaction, lifecycle, and failure-translation tests.

## Current blockers

None. Milestone 1 may begin.

## Database actions awaiting developer

The developer generated and applied `0000_initial_auth_schema`. Milestone 1 is an application-architecture milestone and is not expected to require another database migration.

## Test results

- `pnpm run check`: pass.
- `pnpm run check-types`: pass across all seven TypeScript packages.
- `pnpm run test`: 26 tests pass across four files.
- `pnpm run test:coverage`: pass; environment package and authenticated-navigation helper 100%; server application module 97.05% statements and 92.3% branches.
- `pnpm run build`: server and web pass without the prior Turbo/tsdown warnings.
- PostgreSQL 18, Express, oRPC, OpenAPI, Better Auth, sessions, CORS, and cookie policy: pass.
- Combined development runtime: server, web root, and login return HTTP 200 and remain healthy.
- Docker images build successfully; PostgreSQL, server, and web health checks pass; container HTTP checks return 200.
- Invalid configuration and unreachable database failures are covered.
- Test users are removed after each suite; no M0 fixtures remain.

## Manual review log

The developer found that authenticated users could revisit `/login`. The route now checks the server session before rendering and redirects authenticated users to `/dashboard`; automated coverage and a live HTTP 307 integration check pass.

Milestone 0 was manually approved and committed by the developer as `7d5a312` (`feat(m0): harden and validate the application foundation`).
