# Agent Session Context

**Last updated:** 2026-07-28  
**Current phase:** Milestone 0 automated criteria complete; awaiting developer review  
**Active milestone:** Milestone 0 — Validate the existing foundation

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

The starter currently has:

- Basic Better Auth schema and email/password configuration
- Basic sign-in/sign-up/dashboard UI
- Express server mounting Better Auth and oRPC/OpenAPI handlers
- Public health and protected sample procedures
- Drizzle PostgreSQL connection
- Docker Compose for web, server, and PostgreSQL
- Repeatable Vitest integration tests and V8 coverage for the baseline
- Explicit CORS rejection, environment-aware auth cookies, session expiry/refresh tests, and guest-only login routing
- Workspace-wide check, type-check, test, coverage, and build tasks

The starter does not yet have:

- CMS domain models
- Effect runtime dependencies or application architecture
- Central application response/error system
- Production observability stack
- CMS-specific test suites
- Workspaces/projects/memberships/permissions
- Locale/schema/content/publication/delivery systems

## Mandatory constraints

- Never generate, push, apply, or run a migration.
- For schema changes, provide migration name and exact commands to the developer, then wait.
- Never commit; the developer manually reviews and commits.
- Complete one milestone and its tests at a time.
- Do not expose `.env`, auth/session secrets, credentials, or content payloads in logs.
- Update `progress.md`, this file, and `learnings.md` as work proceeds.

## What to do next

Milestone 0 is complete automatically. The developer must manually:

1. Run `pnpm run dev` and verify sign-up, sign-in, dashboard refresh, protected access, sign-out, and that an authenticated visit to `/login` redirects to `/dashboard`.
2. Confirm local cookie behavior and the production `Secure; SameSite=None` policy.
3. Review the generated initial auth migration and the Milestone 0 source changes.
4. Approve or request changes.
5. Commit manually if approved.

PostgreSQL remains running locally; Docker web/server containers were stopped after successful health validation so they do not block ports 3000/3001.

The developer generated and applied `packages/db/src/migrations/0000_initial_auth_schema.sql`. Do not generate or apply another migration. Do not begin the Effect migration until Milestone 0 is explicitly approved.
