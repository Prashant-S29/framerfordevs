# Agent Session Context

**Last updated:** 2026-08-11
**Current phase:** Milestone 9 approved and committed; Milestone 10 design discovery not started
**Active milestone:** Milestone 10 — Preview API

## What this project is

Framer for Devs is a backend-agnostic visual frontend and website-operations platform. The CMS is its first and foundational capability. Developers define versioned schemas; clients edit generated multilingual forms; each locale publishes independently; external frontends consume fast published JSON. Future visual sites must bind to the same stable CMS resources without content migration.

## Read first

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every rule linked by `knowledge_base/rules/index.md`
4. This file
5. `knowledge_base/progress.md`
6. The active section in `knowledge_base/milestone.md`
7. `knowledge_base/learnings.md`
8. Check `git log`

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

- `.agents/skills/effect-ts/`

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
- Approved and fully implemented M6 design at `knowledge_base/decisions/m6-field-system-and-generated-forms-design.md`: all 18 fields, recursive trees, exact decimal/money, mixed localization, strict Portable Text, external assets, references, editor layouts, independent hashes, role-aware form projections, generated controls, and bounded validation
- Developer-approved M7 design at `knowledge_base/decisions/m7-entries-multilingual-drafts-and-revisions-design.md`: stable entries, published-schema authoring, stable-ID sparse fragments, independent shared/locale heads, durable idempotency receipts, permissive bounded drafts, immutable revisions, restore, field policy, pagination, and entry-editor UX
- The developer generated and applied `0006_create_entries_and_locale_revisions.sql`; the agent inspected the complete SQL/snapshot and verified the live catalog read-only: six empty tables, 82 columns, 26 foreign keys, 25 checks, 16 primary/unique constraints, 38 valid/ready indexes including constraint indexes, and zero unvalidated constraints
- Complete M7 management workflows: stable idempotent entry creation, scope-bound cursor lists, published-contract authority, independent shared/exact-locale heads, bounded stable-ID mutations, permissive draft issues, batched tenant-safe references, optimistic conflict details, durable receipts, immutable revision metadata, restore-as-new-revision, field projection/authorization, partition audits, and zero draft outbox events
- M7 collection entries and generated multilingual editor UI with shared/read-only authority, exact-locale tabs, explicit save states, dirty-locale guards, preserved conflict edits, authoritative reload, separate histories, restore confirmation, and route-prefetched TanStack Query data
- Developer-approved M7 manual-review amendment for user-controlled CMS-only entry names, locale-neutral entry lists, URL-driven locale tabs, version-0 defaults, saved rich-text hydration, and hiding mixed-object localization from ineligible kinds
- The developer generated and applied `0007_add_entry_display_names.sql`; the agent inspected the complete SQL/snapshot and verified the live catalog read-only: nullable bounded `display_name`, positive defaulted `name_version`, three validated name constraints, eight migration records, four preserved legacy null names, and zero invalid/unready M7 constraints or indexes
- The M7 manual-review corrections are implemented: required names on new entries, optimistic CMS-only rename with no-op/conflict/rollback behavior, locale-neutral lists, URL-driven exact-locale tabs, version-0-only default projection, saved Portable Text hydration, object-only mixed-localization controls, error-free unpublished-schema entry-list empty states, and type-appropriate schema-default editors
- The entry workspace now reads collection publication metadata first, skips published-form and entry-page queries when no schema is published, keeps direct missing-resource 404 semantics for genuine callers, and allows locale-neutral management lists to return an empty page without requiring a published value contract
- Rich-text defaults now use the lazy official Portable Text editor instead of raw JSON, honor configured styles/decorators/lists, and expose list controls; long-text defaults use a multiline control, date-time defaults use a local date-time picker with canonical instant storage, exact decimals declare decimal input mode, and object/list JSON controls enforce their root shape immediately
- Class-backed rich-text, money, and external-asset defaults are copied to inert JSON data before value validation, preventing valid decoded Effect Schema values from being rejected as non-plain objects
- Entry-editor diffs retain atomic root mutations for ordinary fields but descend through mixed-object containers to exact shared/localized child paths, matching server partition authority without weakening its default-deny checks
- The refreshed M7 automated gate passes with 603 tests, API coverage at 89.72% statements and 71.07% branches, clean production/full audits, production builds, rebuilt healthy Docker services, HTTP 200 liveness/readiness/API-reference/SSR-login checks, and `git diff --check`
- The developer completed manual review, approved Milestone 7, and committed it as `60bd96f` (`feat(m7): entries, multilingual drafts, and revision history`)
- The developer approved the complete M8 design at `knowledge_base/decisions/m8-independent-locale-publication-and-snapshots-design.md`; M8 contracts and the pure compiler are implemented, and the exact fixture report passes at 692,046 combined canonical bytes with 34.00% maximum headroom
- The developer explicitly confirmed the fixture report and provisional 1 MiB profile; the approved Drizzle schema is implemented with five publication tables, aggregate snapshot counters, outbox scope, constraints, relations, and indexes
- The developer generated, augmented, and applied `0008_add_locale_publications_and_delivery_snapshots.sql`; the agent did not generate, edit, or apply it and verified the complete migration/snapshot and live catalog read-only
- Live verification confirms five empty publication tables, nine journal rows, correct entry/outbox backfills, zero unvalidated constraints, zero invalid/unready indexes, the approved partial indexes, and four enabled append-only triggers using one hardened function
- The M8 pre-Drizzle readiness gate passes with 611 tests, API coverage at 89.84% statements and 71.45% branches, pure-compiler coverage at 89.56% statements and 79.10% branches, and clean production builds
- M8 now has a replaceable `PublicationEngine`, focused `PublicationRepository`, explicit production `READ COMMITTED` transactions, deterministic locks, one grouped exact-locale target-resolution statement, strict/redacted plans, immutable publication/snapshot/reference persistence, independent heads, durable publish/unpublish replay, atomic audit/outbox events, status/staleness/history reads, and real locale publication dependency counts
- Named publication operations, centralized invalid/conflict failures, bounded telemetry, shared runtime Layers, and all five protected management oRPC/OpenAPI procedures are wired; no public Delivery API route was added
- The entry editor now prefetches exact-locale status/history and provides textual staleness, save-before-publish validation, measured size errors, permission-aware publish/unpublish controls, authorized reference-target links, recent immutable history, and targeted cache invalidation
- Rollback-contained PostgreSQL coverage proves invalid validation, actionable exact-locale references, independent English/Hindi heads, publish/replay/history/unpublish/no-op behavior, append-only trigger rejection, intended query plans, inspected `read committed`, and rollback at all eight material artifact stages without leaving immutable fixtures
- Final M8 PostgreSQL hardening proves shared-snapshot immutability/staleness, before/after grouped-reference-resolution outcomes, stale same-locale and publish/unpublish command conflicts, independent locale-local sequences, contiguous concurrent entry event sequencing, and rollback at every material artifact stage
- The complete role/locale matrix covers publication reads and mutations across every role and `all`/`selected`/`none` locale access; anonymous route denial and automated exact-locale dialog accessibility remain covered
- The final M8 readiness gate passes with 627 tests, API coverage at 89.83% statements and 72.19% branches, publication-repository coverage at 90.00% statements and 76.12% branches, clean production/full audits, production builds, `git diff --check`, four enabled immutable triggers, and zero durable M8 test artifacts
- The developer approved and committed M8 as `ad3cd5e` (`feat(m8): add independent locale publication and immutable snapshots`) after the complete automated gate
- M9 requirements, prior decisions, Delivery credentials, Express/CORS, immutable publication reads, query/index constraints, cache validators, rate/resource controls, and applicable skills/standards have been reviewed
- The developer approved `knowledge_base/decisions/m9-production-delivery-api-design.md` and authorized M9 implementation, including the versioned REST/OpenAPI surface, protected/public configuration, typed query read model, unique claims, signed generation-bound cursors, pinned expansion, HTTP caching, Delivery CORS, central generic Redis/memory rate-limit manager, observability, backfill/migration gate, and load baseline
- M9 implementation includes the shared Redis/memory weighted rate-limit architecture, opaque identities and canonical network sources, strict Delivery contracts/query parsing/root projections, rolling active/previous-key cursor signing, and the approved four-table Drizzle read model with typed/unique indexes and current-head authority
- The developer generated, corrected, and applied `0009_add_production_delivery_api_read_model.sql`; read-only verification confirms all four tables, protected configuration backfill, validated authority/tenant constraints, and valid/ready typed and unique indexes
- Collection creation now writes protected Delivery configuration atomically; owner/unrestricted-developer management supports complete-set optimistic capability updates, public acknowledgement, compatibility/unique checks, no-op suppression, and audit/outbox persistence
- M8 publish/unpublish transactions now atomically maintain typed current projections, deterministic unique-claim locking, and broad collection-locale cursor generations with rollback-injection coverage
- The Delivery read repository serves only current/immutable publication artifacts with exact enabled locale, public/protected checks, stable typed filters/sorts/unique lookup, signed stale-aware pagination, pinned two-depth expansion, and repeatable-read bounded list transactions
- Express now exposes the rollout-gated `/api/delivery/v1` GET/HEAD/OPTIONS surface, isolated wildcard no-credentials CORS, Delivery credential authentication, global/identity quotas, conditional validators, public/protected cache policies, response cap, and dedicated OpenAPI/reference routes
- Collection settings expose access and kind-safe field capabilities with permission-aware read-only behavior and accessible irreversible-public warning; schema publication blocks incompatible configured field removal/kind changes
- The developer ran the clean operator-controlled Delivery backfill apply; read-only verification reports three current heads, three generation-1 collection-locale states, no missing state, zero expected scalar projections for unsupported historical roots, and no open non-idle transaction
- Explicit PostgreSQL pool maximum/acquisition/idle bounds, list transaction statement/idle timeouts, Redis infrastructure, canonical-byte expansion preflight plus exact final response cap, and a manual k6 three-scenario baseline profile are present
- The refreshed M9 automated gate passes `pnpm run ready` with 704 tests and 89.01% API statement coverage; a subsequent manual-review correction adds typed malformed-reference handling and stale-field-issue clearing with focused coverage
- The developer-authorized deterministic load utility created 10,000 current English fixture publications and 40 load-only Delivery credentials without printing secrets; the ignored local environment now contains the bounded sample authority
- All three approved production-topology capacity scenarios pass after 15-second warm-up plus 60 measured seconds: mixed latest/unique at 200/s (p95 16.54 ms, p99 53.06 ms), indexed list at 100/s (p95 24.45 ms, p99 31.90 ms), and pinned expansion at 25/s (p95 15.33 ms, p99 16.91 ms), with zero errors or dropped iterations
- The remaining approved M9 load gates also pass: conditional revalidation produced 6,001 measured 304s; one weighted hot credential shared across two server processes produced 1,350 intentional credential 429s with the stable contract; a 15-second hard Redis outage kept 3,001 measured reads successful and recreated 41 keys after recovery; and 301 oversized list reads returned stable 413s while repeated memory sampling stayed bounded
- The oversized boundary utility restored all current fixture drafts/heads after each run; final read-only checks report 10,000 current publications, 4,794 maximum current canonical bytes, zero boundary documents, zero duplicate unique claims, and zero active/waiting/open application transactions
- The tenant-neutral Delivery OpenAPI 3.1 document is now generated from/reconciled against Delivery Effect Schemas and fully documents all four GET/HEAD/OPTIONS paths, strict query bounds, schema-backed success/failure envelopes, conditional/cache/rate headers, authentication, examples, response limits, and cursor recovery; Scalar provides the interactive reference
- The complete management oRPC reference is disabled by default and environment validation forbids enabling it in production; local/test opt-in remains available for internal contract inspection, while snapshot/HTTP tests prove public Delivery documentation excludes management/auth/operator contracts
- The rebuilt production Docker server returns 200 for Delivery OpenAPI, Scalar docs, and a protected fixture read; `/api-reference` returns 404, the public document has 4 paths/12 operations/10 public schemas, and all primary services are healthy
- M12 now owns the allowlisted public developer portal, versioned public specifications, guides, and generated tooling; M14 owns production marketing/application/API/developer/operator host and ingress separation
- Final refreshed `pnpm run ready` passes after all load and documentation-boundary work with 712 tests and 89.40% API statement coverage; production/full audits and builds pass
- The developer completed manual review, approved M9, and committed it as `8559aa4` (`feat(m9): production delivery API`)
- The developer generated and applied `0005_add_field_system_and_editor_layout.sql`; the agent inspected the complete SQL and snapshot and verified the live catalog read-only: 15 expected columns, 35 validated constraints, 16 valid/ready indexes, and valid legacy backfills
- Complete M6 repository/API/UI/property/PostgreSQL/accessibility/bundle coverage with 551 passing tests and a clean production/full pnpm audit
- Cold Docker manual review found and fixed a schema-builder hook-order crash during query hydration; hooks are now unconditional and `react-hooks/rules-of-hooks` is enforced workspace-wide
- The collection route now uses a visual field tree plus persistent inspector, a synchronized versioned field-schema JSON view, and a separate bounded sample-JSON inference flow; every field configuration and editor role setting is exposed without adopting code or architecture from the UX reference repository
- One optimistic `fields.replace` operation atomically validates and replaces the complete active tree, preserves active stable IDs, generates IDs for new nodes, rejects identity reparenting, reconciles layout placements, and exposes precise validation details without any database schema or migration change
- Property, Effect service, PostgreSQL concurrency/isolation/index-plan, API, UI validation, and automated accessibility tests
- First-party project memberships, fixed default-deny role policies, invitations, and last-owner protection
- Environment-bound management/delivery/preview credentials with one-time keys, immediate revocation, rotation, bounded attempt limiting, and security telemetry
- Permission-aware project access management and fragment-safe invitation acceptance UI
- Stable project locales with required English, generated/pinned IANA-registry BCP 47 identity validation, ordering, reversible lifecycle, exact enabled-locale resolution, audits, telemetry, and strict no-fallback contracts
- Durable per-membership locale access with owner invariants and restricted-member credential escalation prevention
- Permission-aware locale settings, locale-access controls, client validation, and accessible stable-ID locale tabs with unsaved-change guards

The repository does not yet have:

- Preview API workflows (M10)
- Production telemetry backend/collector deployment

## Mandatory constraints

- Read and follow every rule linked by `knowledge_base/rules/index.md`.
- Inspect current Git status and recent history before reporting repository, milestone, approval, or commit state.
- Apply the structured source-comment standard in `knowledge_base/rules/comment-rules.md` to new and materially modified hand-authored code.
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

## Milestone 3 completion

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
- The developer approved and committed Milestone 3 as `a74aeb8` (`feat(m3): add project access, invitations, and API credentials`).

## Milestone 4 completion

- Repository, requirements, standards, security, database, Effect, API, policy, UI, and test discovery is complete.
- The developer approved `knowledge_base/decisions/m4-project-locales-design.md`, including the first-review revisions.
- The Drizzle schema now defines project locales, membership locale-access modes, normalized membership allowlists, tenant-composite foreign keys, lifecycle checks, and query-path indexes.
- Foundational Effect contracts now define canonical BCP 47 tags, stable locale IDs, strict explicit-locale context, locale management inputs/models, discriminated member locale access, and the three locale error codes.
- Browser and API validation share an official IANA Language Subtag Registry snapshot pinned at `File-Date: 2026-06-14`. Validation is deterministic and runtime-network/OS/ICU independent, accepts registered preferred aliases, and rejects unknown subtags, extensions, private use, reserved ranges, and grandfathered tags without safe preferred replacements.
- `VERSION_CONFLICT` feedback is resource-neutral and covered by a targeted contract test. Locale dependency feedback carries bounded safe details and explicit draft-lockout guidance.
- Non-migration database/API type checks and 31 targeted contract tests pass.
- The developer generated and applied `0003_add_project_locales.sql`. The agent inspected its structural DDL and, with explicit developer authorization, added the existing-project enabled-English backfill using each project's workspace, creator, and timestamps. The agent did not generate or apply the migration.
- Read-only verification confirms both locale tables and nine intended indexes exist, all four current projects have exactly one enabled `en`, all seven memberships use `locale_access_mode = all`, and no owner has an invalid locale mode.
- New projects create enabled English in the project transaction. Locale management, exact resolution, dependency policy, membership access, owner transitions, API wiring, audit events, and bounded telemetry are implemented and tested.
- The project UI now provides locale creation/editing/ordering/lifecycle controls, configured membership allowlists, owner-demotion guidance, restricted-credential UX, BCP 47 validation, and accessible stable-ID tabs with missing-selection and unsaved-change guards.
- With explicit developer authorization, a guarded transaction permanently deleted exactly the three soft-removed invalid manual-test rows (`doekdoek`, `oedll`, and `xlw`) after confirming no membership grants referenced them.
- Workspace checks, all package type checks, 453 tests, coverage, and production builds pass. Final read-only checks report zero missing/duplicate enabled-English project invariants, zero restricted owners, zero configured locale grants on removed memberships, and zero registry-invalid rows across all 11 persisted locale records.
- The developer approved Milestone 4 and committed it as `68b6f6e` (`feat(m4): project locales and strict locale contracts`).

## Milestone 5 completion

- The developer approved `knowledge_base/decisions/m5-versioned-schema-engine-design.md` and authorized implementation.
- Requirements, prior decisions, installed guidance, repository architecture, database patterns, Effect contracts, policy, API, UI, and test patterns have been reviewed.
- `knowledge_base/decisions/m5-versioned-schema-engine-design.md` proposes environment-scoped collections, stable field IDs, one optimistic relational draft, immutable relational published revisions, deterministic hashing/change classification, exact risk acknowledgement, and an atomic generic outbox.
- M5/M6 criteria now match the implementation boundary: recursive object/list validation and type-specific validation-change classification belong to M6. Publication updates the published baseline without incrementing draft version; concurrent publishes use the expected published revision identity.
- The design preserves the stable Effect 3.22 and Promise-native Drizzle boundary, adds no speculative dependency change, and keeps all migration work developer-controlled.
- Foundational contracts now cover branded identities, strict reserved API keys, collection/draft/revision models, focused mutations, publication authority, bounded validation/change contracts, collection cursors, and four centralized M5 errors.
- The pure Effect `SchemaEngine` validates bounded drafts, hashes canonical schemas, classifies changes by stable field ID, derives deterministic change IDs, enforces exact risky-change acknowledgement, and fingerprints state-changing publication commands.
- `packages/db/src/schema/cms.ts` defines all six approved tenant-scoped tables, restrictive foreign keys, immutable revision snapshots, schema-head pointers, and the generic transactional outbox.
- The developer generated and applied `0004_create_versioned_collection_schemas.sql`. The agent inspected it completely and verified all six empty tables, 18 foreign keys, 33 checks, 17 primary/unique constraints, 38 valid/ready indexes, and the command-fingerprint column read-only.
- The correct workspace generation command is `pnpm --filter @framerfordevs/db db:generate --name=create_versioned_collection_schemas`; the agent must not add the unnecessary `run ... --` form in future handoffs.
- The first live repository/API tranche implements collection create/list/get/update with CMS capability checks, non-enumerating tenant scope, shared project locks, collection write locks, optimistic metadata/draft versions, keyset pagination, no-op semantics, and transactional audits.
- Locale-restricted members are now denied project-global `schema.write` and `schema.publish`; `SchemaEngine` and `SchemaRepository` are composed into the shared runtime.
- The complete repository/API lifecycle now supports draft retrieval, field create/update/remove/reorder, publication validation, immutable revision publication/retrieval, exact risk acknowledgement, fingerprinted retries, monotonic concurrent publication, transactional audits/outbox events, and bounded schema metrics.
- PostgreSQL integration covers rollback injection after every publication artifact, restrictive revision/field deletion, stable identities, no-op behavior, environment key scope, tenant non-enumeration, archived mutation denial, and intended query plans.
- The project collections surface and dedicated schema-builder route implement create/list/load-more, add/edit/remove/reorder, validation/change review, exact acknowledgement, publication, immutable revision summaries, permission states, targeted invalidation, conflict refetch, and accessible dialogs/controls.
- `pnpm run ready` passes with 509 tests after the final readiness run, API/domain coverage above the configured gate, and server/web production builds. Read-only cleanup verification reports zero M5 fixtures.
- During manual review, the developer found that the schema-builder URL matched but rendered only the project panel because a page-shaped route was nested under a component without an outlet. The builder now uses TanStack Router's non-nested trailing-underscore convention and has a route-tree regression test.
- The developer manually verified the representative collection lifecycle, change acknowledgement, publication, and immutable revision behavior; approved Milestone 5; and had already committed it as `28ca04d` (`feat(m5): versioned collection schema engine`).

## Milestone 6 completion

- The approved field-system design is fully implemented across contracts, validation kernels, Effect services, PostgreSQL repositories, management APIs, schema-authoring UI, generated-form controls, and accessibility coverage.
- The developer generated and applied `0005_add_field_system_and_editor_layout.sql`; the agent inspected the migration and live catalog read-only and did not generate, apply, execute, or modify it.
- The refreshed automated gate passed with 551 tests, production builds, clean production/full pnpm audits, Docker health, read-only database invariants, and `git diff --check`.
- Manual review found and resolved the cold-hydration React hook-order crash and the out-of-contract reference-collection page limit.
- The developer completed manual review, approved Milestone 6, and committed it as `fbb4767` (`feat(m6): field system, structured rich text, external assets, and editor layout`).

## What to do next

1. Begin M10 Preview API discovery by rereading the active milestone, product/PRD requirements, M1-M9 decisions, current implementation boundaries, and relevant skills.
2. Inspect the committed M9 Delivery/publication/credential/cache/OpenAPI seams that Preview must reuse without exposing drafts through Delivery.
3. Propose and obtain developer approval for the complete M10 design before changing schema or implementation code.
