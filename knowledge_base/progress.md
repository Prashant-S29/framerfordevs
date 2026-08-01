# CMS Development Progress

**Overall status:** Milestone 4 automated implementation complete; awaiting developer manual review
**Active milestone:** Milestone 4 — Project locales and strict locale contracts
**Last updated:** 2026-08-01

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
| 1   | Effect foundation, errors, observability | `[A]`  | 90 passing      | Approved      | `c28f6fa` |
| 2   | Platform kernel                          | `[A]`  | 163 passing     | Approved      | `60adb39` |
| 3   | Membership, policies, credentials        | `[A]`  | 381 passing     | Approved      | `a74aeb8` |
| 4   | Project locales                          | `[R]`  | 453 passing     | Pending       | None      |
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

## Completed Milestone 1 checklist

- `[x]` Install aligned stable Effect 3.22 runtime, testing, platform, and OpenTelemetry packages.
- `[x]` Implement schema-backed API response, error detail, error-code, and request-ID contracts.
- `[x]` Implement schema-backed tagged application and infrastructure failures.
- `[x]` Add deterministic HTTP mapping and centralized failure/defect/interruption handling.
- `[x]` Add validated request IDs and W3C traceparent parsing/continuation.
- `[x]` Add structured logging with bounded recursive secret redaction.
- `[x]` Add bounded request count, latency, status-family, and defect metrics.
- `[x]` Add safe development trace summaries and optional OTLP/HTTP trace/metric export.
- `[x]` Add replaceable Database, Better Auth session, logger, telemetry, and clock test Layers.
- `[x]` Route liveness, readiness, public oRPC, and protected oRPC operations through one ManagedRuntime.
- `[x]` Preserve native Better Auth protocol responses while observing the HTTP boundary.
- `[x]` Add graceful runtime resource initialization and shutdown.
- `[x]` Add property, contract snapshot, redaction, propagation, adapter, lifecycle, and cause-classification tests.
- `[x]` Document Effect, Drizzle, Better Auth, and observability boundaries.
- `[x]` Request developer manual review.
- `[A]` Developer manually verified and approved Milestone 1.

## Completed Milestone 2 checklist

- `[x]` Review and approve the platform-kernel domain and database design.
- `[x]` Implement workspaces, projects, capability state, stable branded IDs, and the internal `main` environment.
- `[x]` Add ownership/membership and audit-event foundations.
- `[x]` Add project creation, listing, editing, and archive APIs/UI.
- `[x]` Add tenant-isolation, concurrency, pagination, index, audit, and contract tests.
- `[x]` Validate development runtime, OpenAPI generation, production builds, and Docker health.
- `[x]` Request developer manual review.
- `[A]` Developer manually verified and approved Milestone 2.

## Completed Milestone 3 checklist

- `[x]` Re-read the product, CMS PRD, mandatory rules, current context, milestone plan, progress, and learnings.
- `[x]` Apply the installed Better Auth, Effect, Drizzle, PostgreSQL, Express, TanStack, shadcn/ui, React performance, and web-interface guidance relevant to M3.
- `[x]` Review the current platform schema, Effect services, repository workflows, API contracts, UI, and M2 test patterns.
- `[x]` Review current Better Auth 1.6 organization, API-key, and security documentation.
- `[x]` Reconcile stale M2 documentation with commit `60adb39`.
- `[x]` Propose the complete M3 access and credential design in `knowledge_base/decisions/m3-access-and-credentials-design.md`.
- `[A]` Developer approved the M3 design.
- `[x]` Update the Drizzle access/platform schema and foundational access/error contracts.
- `[x]` Pass database/API type checks and 19 targeted access/response contract tests.
- `[x]` Developer generated `0002_add_memberships_policies_credentials.sql`; the agent inspected it without applying it.
- `[x]` Developer installed the reviewed `security-and-hardening` skill; apply it throughout M3 security-sensitive work.
- `[x]` After explicit developer authorization, add and inspect the existing-project owner-membership backfill without applying the migration.
- `[x]` Developer reviewed and applied the migration; read-only verification confirms the access tables and exact owner backfill.
- `[x]` Implement explicit owner membership on project creation and policy-backed access for all existing project operations.
- `[x]` Implement the exhaustive default-deny role/action and credential-family policy service.
- `[x]` Implement invitation create/list/inspect/accept/revoke and membership list/role-update/remove workflows.
- `[x]` Preserve stable membership identity, serialize cross-project collaborator cleanup, and protect the last explicit project owner under concurrency.
- `[x]` Implement management/delivery/preview credential issue/list/rotate/revoke/authentication, strict scope/environment isolation, and immediate revocation.
- `[x]` Implement high-entropy one-time secrets, digest-only persistence, constant-time verification, source fingerprinting, and bounded attempt limiting.
- `[x]` Add M3 oRPC routes, response/error mappings, runtime Layers, spans, bounded security metrics, and secret-free audits.
- `[x]` Add permission-aware member/invitation/credential management UI and fragment-safe invitation acceptance through authentication.
- `[x]` Add API, PostgreSQL concurrency/isolation/index-plan, service, UI fragment-safety, and automated accessibility coverage.
- `[x]` Run workspace readiness and read-only fixture/invariant verification.
- `[A]` Developer manually approved and committed Milestone 3 as `a74aeb8`.

## Milestone 4 checklist — design approval gate

- `[x]` Re-read product, CMS PRD, mandatory rules, active milestone, context, progress, learnings, and prior architecture decisions.
- `[x]` Apply materially relevant Effect, Drizzle, PostgreSQL, Express, security, TanStack, shadcn/ui, React, Turborepo, and web-interface guidance.
- `[x]` Review current platform/access schemas, contracts, policy, repositories, operations, runtime, router, tests, query composition, and project UI.
- `[x]` Research BCP 47 canonicalization, case-insensitive identity, runtime behavior, and documented length limits.
- `[x]` Propose the complete locale domain, lifecycle, ordering, permission, strict-contract, audit, observability, UI, threat, and test design in `knowledge_base/decisions/m4-project-locales-design.md`.
- `[x]` Incorporate first developer review: defer database-level `en` existence enforcement to M14, specify owner-demotion locale access, make the shared version-conflict wording correction explicit/tested, document durable configured allowlists, and require draft-lockout confirmation copy.
- `[A]` Developer approved the M4 design and authorized implementation.
- `[x]` Add the `project_locale` and `project_membership_locale_access` Drizzle models plus membership locale-access mode, constraints, tenant foreign keys, and query-path indexes.
- `[x]` Add canonical BCP 47, strict explicit-locale, locale management, member locale-access, and locale error contracts.
- `[x]` Replace structural-only host canonicalization with browser/API validation against a generated official IANA registry snapshot pinned at `File-Date: 2026-06-14`; reject unknown subtags, extensions, private use, and unsafe grandfathered forms.
- `[x]` Pass database/API type checks and 31 targeted locale/access/response contract tests without generating or applying a migration.
- `[x]` Developer generated `0003_add_project_locales.sql`; the agent inspected the structural DDL without applying it.
- `[x]` With explicit developer authorization, add the existing-project enabled-`en` backfill using project tenant, creator, and timestamp values.
- `[x]` Developer reviewed and applied `0003_add_project_locales.sql`; the agent did not generate or apply it.
- `[x]` Read-only verification confirms both tables, all intended indexes, exactly one enabled `en` for each current project, all existing memberships defaulted to `all`, and no invalid owner locale mode.
- `[x]` Create enabled English atomically with every new project and emit a secret-free audit event.
- `[x]` Implement locale repository lifecycle, stable ordering, optimistic concurrency, dependency guards, exact-tag resolution, tenant isolation, audits, and bounded telemetry.
- `[x]` Implement locale-aware policy hooks, durable member allowlists, owner role-transition invariants, and restricted-member credential escalation prevention.
- `[x]` Add locale management and member locale-access oRPC routes with standard response unions and runtime Layer wiring.
- `[x]` Add permission-aware locale settings, BCP 47 client validation, locale ordering/lifecycle controls, membership access controls, demotion guidance, and restricted-credential UX.
- `[x]` Add accessible stable-ID locale tabs with keyboard semantics, explicit missing-selection handling, and unsaved-change confirmation.
- `[x]` Add contract, operation, policy, transition, repository, PostgreSQL concurrency/isolation/index, API, telemetry, validation, and accessibility tests.
- `[x]` Permanently delete the explicitly authorized soft-removed invalid `doekdoek`, `oedll`, and `xlw` rows after verifying no membership grants referenced them.
- `[x]` Pass workspace checks, type checks, 453 tests, coverage, production builds, and `git diff --check`.
- `[R]` Await developer manual review of English/Hindi/Gujarati management, tabs, member restrictions, and credential restrictions.

## Current blockers

None. The M4 database gate is complete.

## Database migration state

The developer generated and applied `packages/db/src/migrations/0001_create_platform_kernel.sql`. The agent inspected the generated SQL and live PostgreSQL catalog against the approved design. The agent did not generate, run, or apply the migration.

The developer generated and applied `packages/db/src/migrations/0002_add_memberships_policies_credentials.sql`. The agent inspected it and confirmed the structural tables, constraints, tenant foreign keys, lifecycle checks, indexes, and authorized owner-membership backfill match the approved design. Read-only verification reports four access tables, two projects, two active owner memberships, and zero projects without exactly one active owner.

The developer generated and applied `packages/db/src/migrations/0003_add_project_locales.sql`. The agent inspected it and, with explicit authorization, added the existing-project enabled-English backfill before developer application. Read-only verification confirms both locale tables, all nine intended indexes, one enabled `en` for every project, membership defaults of `all`, and valid owner locale access. The agent did not generate or apply the migration.

## Test results

### Milestone 4 complete automated gate

- `pnpm run check`: pass.
- `pnpm run check-types`: pass across all TypeScript packages.
- `pnpm run test`: 453 tests pass across 32 files: 322 API/domain, 61 server/API integration, 65 web validation/accessibility, and 5 environment tests.
- `pnpm run test:coverage`: pass; API/domain code is 93.58% statements and 79.24% branches; tested web helpers remain 100% statements.
- `pnpm run build`: server and web production builds pass.
- `git diff --check`: pass.
- PostgreSQL coverage includes required English, canonical creation, tenant isolation, immutable identity, lifecycle transitions, dependency guards, ordering, version conflicts, durable member allowlists, owner invariants, concurrency, cleanup, and intended index plans.
- Final read-only invariant checks report zero projects without exactly one enabled `en`, zero owners with restricted locale mode, zero configured locale grants attached to removed memberships, and zero invalid rows across all 11 persisted locale records.
- API/server coverage includes anonymous denial, role boundaries, exact locale errors, locale lifecycle routes, member locale access, and restricted credential issue/rotation behavior.
- Locale validation uses the generated official IANA registry snapshot pinned at `File-Date: 2026-06-14`; API/browser tests accept registered tags and aliases while rejecting the three discovered invalid tags, unknown component subtags, extensions, private use, and reserved ranges.
- UI coverage includes registry-backed BCP 47 validation, locale creation and member-access dialog accessibility, and unsaved locale-tab switching. Manual review remains required.
- The guarded authorized cleanup deleted exactly three soft-removed invalid locale rows, found no related membership grants, and left zero matching rows.
- No agent command generated, applied, pushed, or executed a migration.

### Milestone 4 database gate

- `pnpm --filter @framerfordevs/db check-types`: pass.
- `pnpm --filter @framerfordevs/api check-types`: pass.
- Targeted locale, access, and API-response contracts: 31 tests pass across 3 files.
- No agent command generated, applied, pushed, or executed a migration. The developer generated and applied it.

### Milestone 3

- `pnpm run ready`: pass, including formatting, lint, all package type checks, tests, V8 coverage, and production builds.
- `pnpm run test`: 381 tests pass across 28 files: 283 API/domain, 54 server/API integration, 39 web helper/accessibility, and 5 environment tests.
- `pnpm run test:coverage`: pass; API/domain code is 93.62% statements, 81.85% branches, and 77.61% functions; tested web helpers are 100% statements.
- The exhaustive policy suite covers all 164 role/action and credential-family decisions, including unknown/default-deny behavior.
- PostgreSQL integration covers owner creation/backfill, invitation uniqueness/reuse/acceptance, stable membership reactivation, cross-tenant isolation, last-owner concurrency, immediate access removal, credential family/scope/environment isolation, rotation/revocation races, secret-free persistence/audits, bounded pagination, and intended index plans.
- Server tests cover every protected management group anonymously plus authenticated invitation, membership, role-boundary, and complete credential lifecycle workflows while preserving the standard response union.
- UI tests cover invitation and credential dialog accessibility; fragment-safety tests prove tokens remain out of query parameters.
- Read-only cleanup/invariant verification reports two expected active owner memberships, zero invitations, zero credentials, zero projects without an owner, and zero leaked test audit rows.
- The developer generated/applied the migration; the agent did not generate or apply any migration.

### Milestone 2

- `pnpm run ready`: pass, including formatting, lint, all package type checks, tests, V8 coverage, and production builds.
- `pnpm run test`: 163 tests pass across 21 files: 85 API/domain, 39 server/API integration, 34 web URL-resolution/validation/accessibility, and 5 environment tests.
- `pnpm run test:coverage`: pass; API/domain code is 96.26% statements, 86.51% branches, and 84.94% functions; tested web helpers are 100%.
- PostgreSQL integration covers transactional workspace/project creation, rollback, audit rows, tenant isolation, key reservation, pagination, composite constraints, and intended index plans.
- Concurrent same-key project creation, same-version updates, and CMS enablement each produce exactly one winner with typed loser conflicts.
- Every protected platform procedure denies anonymous callers and preserves non-enumerating cross-tenant behavior.
- Effect-backed input and success-output contracts are represented in the generated OpenAPI reference.
- Automated axe checks pass for create-workspace, create-project, edit-project, and archive-confirmation dialogs; a source-level web-interface-guideline review found no remaining M2 issues.
- Development runtime liveness/readiness/OpenAPI/frontend smoke checks pass.
- Docker images build; PostgreSQL, server, and web are healthy; container liveness, readiness, OpenAPI, frontend, and SSR login checks return HTTP 200.
- Docker SSR resolves the API through `http://server:3000`; the browser retains `http://localhost:3000`. The web health check now exercises `/login` and therefore its auth dependency.
- Cleanup verification reports zero Milestone 2 test users and workspaces remaining in PostgreSQL.
- The developer generated/applied the migration; the agent did not generate or apply any migration.

### Milestone 1

- `pnpm run check`: pass.
- `pnpm run check-types`: pass across all TypeScript packages.
- `pnpm run test`: 90 tests pass across 14 files.
- `pnpm run test:coverage`: pass; Effect/API foundation 93.1% statements, 87.79% branches, and 89.36% functions.
- `pnpm run build`: server and web production builds pass.
- Development runtime: liveness, readiness, public oRPC, anonymous protected rejection, frontend, structured logs, and safe trace summaries pass.
- Valid inbound W3C trace context is continued; malformed context is ignored safely.
- Docker images build; PostgreSQL, server, and web become healthy; container liveness/readiness/frontend checks pass.
- No database schema change or migration is required.

### Milestone 0

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

Milestone 1 was manually approved and committed by the developer as `c28f6fa` (`feat(m1): add Effect runtime, typed errors, and observability`). The anonymous protected-route review returned the expected HTTP 401, request correlation, and standardized `UNAUTHORIZED` failure without exposing sensitive data.

Milestone 2 automated criteria are complete. During manual review, the developer found Docker SSR could not load `/login`; the internal service URL was corrected and covered by URL-resolution tests plus the container health check. The developer verified the corrected Docker login flow, approved Milestone 2, and committed it as `60adb39` (`feat(m2): add workspace and project platform kernel`).

Milestone 3 started after the Milestone 2 commit was confirmed. The developer approved its membership, invitation, role-policy, and credential design, then generated and applied the inspected migration/backfill. After automated readiness and manual review, the developer approved and committed Milestone 3 as `a74aeb8` (`feat(m3): add project access, invitations, and API credentials`).
