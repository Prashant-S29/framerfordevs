# Agent Session Context

**Last updated:** 2026-07-30
**Current phase:** Milestone 3 automated criteria complete; awaiting developer manual review
**Active milestone:** Milestone 3 — Membership, roles, policies, and API credentials

## What this project is

Framer for Devs is a backend-agnostic visual frontend and website-operations platform. The CMS is its first and foundational capability. Developers define versioned schemas; clients edit generated multilingual forms; each locale publishes independently; external frontends consume fast published JSON. Future visual sites must bind to the same stable CMS resources without content migration.

## Read first

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. `knowledge_base/rules.md`
4. This file
5. `knowledge_base/progress.md`
6. The active section in `knowledge_base/milestone.md`
7. `knowledge_base/learnings.md`

## Confirmed stack

- Monorepo: pnpm + Turborepo
- Frontend: React 19 + TanStack Start/Router/Query/Form + Vite
- UI: Tailwind CSS + shared shadcn/ui package
- Backend host: Node.js + Express 5
- API: oRPC with OpenAPI support
- Database: PostgreSQL 18 locally
- ORM/schema: Drizzle ORM
- Authentication: Better Auth
- Runtime validation currently present: Zod
- Required application model moving forward: stable Effect v3
- Required testing direction: Vitest with `@effect/vitest` for Effect code
- Required observability direction: Effect observability + OpenTelemetry-compatible export

The repository is not using Next.js. Better Auth is the correct auth product name.

## Confirmed product decisions

- English (`en`) is required and enabled by default.
- Developers may enable additional BCP 47 locales such as Hindi (`hi`) and Gujarati (`gu`).
- Every content request requires explicit locale.
- Delivery uses strict locale behavior with no silent fallback.
- Locale draft/publish/unpublish state is independent from the start.
- Shared fields are snapshotted per locale publication. A shared-field edit reaches a locale only after that locale is republished.
- Schema changes use draft, validation, change classification, and explicit publication from the start.
- Rich text uses validated structured document JSON.
- Assets are structured external URL references only; no upload/file-management system initially.
- The initial UI exposes one environment named `main`, but all scoped contracts include environment ID.
- Application-owned APIs use the discriminated `{ ok, data, error, message }` union defined in `prd/cms.md`: success has `ok: true`, typed data, and no error; failure has `ok: false`, null data, and a typed structured error.
- Better Auth/protocol-owned endpoints retain native response contracts while participating in centralized observability and safe boundary handling.
- Stable Effect v3 is selected for production reliability.
- Effect v4 and Drizzle's beta/RC native Effect driver are deferred until stable and compatibility-tested.
- Architecture decisions must prioritize goal alignment, correctness, security, reliability, performance, UX, DX, observability, and maintainability.

## Effect research setup

The official Effect skill is installed at:

- `.pi/skills/effect-ts/`

A complete ignored Effect repository checkout is available at:

- `.repos/effect/`

The checkout is currently detached at the stable `effect@3.22.0` source for implementation research. `scripts/prepare-effect.sh` and the root `prepare` script recreate the source checkout when missing. `.repos/effect` is ignored by Git.

Relevant installed skills also include:

- Better Auth best practices
- Drizzle ORM patterns
- PostgreSQL best practices
- Express TypeScript
- TanStack Start/Router/Query
- Turborepo
- shadcn/ui
- React performance and composition
- Web interface guidelines

## Important Effect integration findings

- Better Auth has no official Effect-native integration. Preserve its protocol and wrap session/application calls at an adapter boundary with typed Effects.
- Stable Effect v3 includes `@effect/sql-drizzle`, but compatibility concerns exist around Drizzle 0.45.x.
- Do not change Drizzle or Effect versions speculatively. Milestone 1 must use a tested compatibility approach with stable dependencies.
- The safe baseline is to keep Better Auth's regular Drizzle adapter and expose application database/auth capabilities through typed Effect services.
- Use a shared ManagedRuntime at Express/oRPC boundaries rather than creating/providing Layers per request.
- Use `Effect.fn`, schema-backed tagged errors, Layers, structured logs, spans, metrics, and `@effect/vitest` patterns.

## Current repository state

The repository currently has:

- Basic Better Auth schema and email/password configuration
- Basic sign-in/sign-up/dashboard UI
- Express server mounting Better Auth and oRPC/OpenAPI handlers
- Public health and protected sample procedures
- Drizzle PostgreSQL connection
- Docker Compose for web, server, and PostgreSQL
- Repeatable Vitest integration tests and V8 coverage for the baseline
- Explicit CORS rejection, environment-aware auth cookies, session expiry/refresh tests, and guest-only login routing
- Workspace-wide check, type-check, test, coverage, and build tasks
- Stable Effect 3.22 application runtime with typed services, Layers, errors, and cause handling
- Schema-backed application response/error contracts and deterministic HTTP mapping
- Request correlation, W3C trace continuation, structured redacted logs, bounded metrics, and OpenTelemetry export
- Separate liveness/readiness and graceful ManagedRuntime shutdown
- Migrated workspace, owner-membership, project, internal `main` environment, capability, and immutable audit-event tables
- Branded Effect platform contracts, opaque keyset cursors, typed conflicts, and Effect-backed oRPC/OpenAPI procedures
- Transactional Drizzle repository workflows with tenant non-enumeration, optimistic concurrency, rollback guarantees, and audit persistence
- TanStack/shadcn workspace and project management UI with create/edit/archive/CMS-enable flows
- Property, Effect service, PostgreSQL concurrency/isolation/index-plan, API, UI validation, and automated accessibility tests
- First-party project memberships, fixed default-deny role policies, invitations, and last-owner protection
- Environment-bound management/delivery/preview credentials with one-time keys, immediate revocation, rotation, bounded attempt limiting, and security telemetry
- Permission-aware project access management and fragment-safe invitation acceptance UI

The repository does not yet have:

- CMS domain models and CMS-specific workflows
- Locale/schema/content/publication/delivery systems
- Production telemetry backend/collector deployment

## Mandatory constraints

- Never generate, push, apply, or run a migration.
- For schema changes, provide migration name and exact commands to the developer, then wait.
- Never commit; the developer manually reviews and commits.
- Complete one milestone and its tests at a time.
- Do not expose `.env`, auth/session secrets, credentials, or content payloads in logs.
- Update `progress.md`, this file, and `learnings.md` as work proceeds.

## Milestone 0 completion

Milestone 0 passed `pnpm run ready`, 26 automated tests, coverage, local runtime checks, Docker health validation, and developer manual review. The developer approved and committed it as `7d5a312` (`feat(m0): harden and validate the application foundation`).

The validated Docker PostgreSQL, server, and web services are currently running for developer manual review.

## Milestone 1 completion

- Stable package set: `effect@3.22.0`, `@effect/vitest@0.30.0`, `@effect/platform@0.97.0`, and `@effect/opentelemetry@0.64.0`.
- `packages/api/src/contracts/` owns the schema-backed response and error contracts.
- `packages/api/src/services/` owns typed Drizzle/PostgreSQL and Better Auth session adapters.
- `packages/api/src/observability/` owns request context, redaction, metrics, OpenTelemetry configuration, and safe local trace export.
- `packages/api/src/runtime.ts` owns the shared Layer graph, ManagedRuntime, cause classification, framework execution boundary, and shutdown.
- Application-owned health and oRPC responses use the standard envelope. Better Auth remains protocol-native.
- `knowledge_base/decisions/m1-effect-boundaries.md` records compatibility and observability decisions.
- The developer manually verified the anonymous protected-route failure contract, approved Milestone 1, and committed it as `c28f6fa` (`feat(m1): add Effect runtime, typed errors, and observability`).

## Milestone 2 completion

- The developer generated and applied `0001_create_platform_kernel.sql`; the agent only inspected it and never generated or applied a migration.
- All platform contracts, repository workflows, APIs, UI flows, and planned automated test categories are implemented.
- `pnpm run ready` passes with 163 tests across 21 files, API/domain coverage at 96.26% statements, and production builds for server and web.
- Docker images build, all three services are healthy, and container liveness, readiness, OpenAPI, frontend, and SSR login checks return HTTP 200.
- Docker SSR uses the internal `server` service URL while browser API calls retain the public `localhost:3000` URL.
- Milestone test fixtures are fully removed from PostgreSQL.
- The developer manually verified the corrected Docker login flow and approved Milestone 2.
- The developer committed Milestone 2 as `60adb39` (`feat(m2): add workspace and project platform kernel`).

## Milestone 3 implementation status

- The developer approved `knowledge_base/decisions/m3-access-and-credentials-design.md`, which defines first-party project invitations, memberships, fixed role presets, a default-deny Effect policy service, and environment-bound management/delivery/preview credentials.
- Better Auth remains the identity/session boundary; its organization and API-key plugins are not adopted because they would duplicate the platform tenant model and cannot enforce the full application resource/environment contract.
- Invitation and credential secrets use 32 random bytes, one-time disclosure, SHA-256 digest-only storage, strict parsing, safe URL-fragment handoff for invitations, and secret-free logs/audits.
- The design includes explicit goal-alignment, correctness, security, reliability, performance, UX, DX, observability, and maintainability review plus the complete M3 test matrix.
- The developer installed `addyosmani/agent-skills@security-and-hardening`; its threat-model, authorization, least-privilege, secret-handling, and audit guidance now applies to M3 implementation and review.
- `packages/db/src/schema/access.ts` and the extended platform schema define memberships, invitations, environment-bound credentials/scopes, lifecycle constraints, tenant foreign keys, and query-path indexes.
- `packages/api/src/contracts/access.ts` and the centralized error registry define branded IDs, role/action/scope registries, secret formats, management inputs/models, and safe M3 error contracts.
- The developer applied `0002_add_memberships_policies_credentials.sql`. Read-only verification confirms all four access tables exist and both existing projects have exactly one active owner membership.
- New project creation atomically creates its explicit owner membership and audit event; collaborator discovery and every existing project operation now use active access plus policy decisions.
- Invitation create/list/inspect/accept/revoke and membership list/role-update/remove workflows are transactional, non-enumerating, optimistic, concurrency-tested, and last-owner-safe.
- Management, delivery, and preview credential issue/list/rotate/revoke/authentication workflows enforce family/scope/environment isolation, one-time disclosure, digest-only storage, immediate revocation, bounded attempts, and secret-free auditing.
- Permission-aware member/invitation/credential management UI and fragment-safe invitation acceptance are implemented with one-time-secret acknowledgement and accessibility coverage.
- `pnpm run ready` passes: 381 tests across 28 files, API/domain coverage of 93.62% statements and 81.85% branches, plus server and web production builds.
- Read-only cleanup verification reports two expected active owner memberships, zero projects without an owner, zero invitations, zero credentials, and zero leaked test audit rows.

## What to do next

1. Developer manually reviews the M3 role, invitation, membership, credential, and one-time-secret flows.
2. Address any findings, rerun `pnpm run ready`, and wait for explicit developer approval.
3. The developer commits M3. Do not start Milestone 4 before approval and commit confirmation.

The agent must never generate or apply migrations.
