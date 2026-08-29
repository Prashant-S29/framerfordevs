# CMS Development Progress

**Overall status:** Milestone 13 is complete and developer-accepted; release rollout remains separate
**Active milestone:** None — M13 is accepted; release rollout and the next milestone require separate execution/planning
**Last updated:** 2026-08-27

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
| 4   | Project locales                          | `[A]`  | 453 passing     | Approved      | `68b6f6e` |
| 5   | Versioned schema engine                  | `[A]`  | 509 passing     | Approved      | `28ca04d` |
| 6   | Field system and generated forms         | `[A]`  | 551 passing     | Approved      | `fbb4767` |
| 7   | Entries and multilingual drafts          | `[A]`  | 603 passing     | Approved      | `60bd96f` |
| 8   | Per-locale publication and snapshots     | `[A]`  | 627 passing     | Approved      | `ad3cd5e` |
| 9   | Delivery API                             | `[A]`  | 712 passing     | Approved      | `8559aa4` |
| 10  | Preview API                              | `[A]`  | 780 passing     | Approved      | `aa177b5` |
| 11  | Events, webhooks, invalidation           | `[A]`  | 868 passing     | Approved      | `fef7205` |
| 12  | Developer portal and generated tooling   | `[A]`  | 962 passing     | Approved      | `4e87908` |
| 13  | Code-first authoring and local editor    | `[A]`  | 1,184 passing   | Approved      | Pending   |
| 14  | Client handover                          | `[ ]`  | Not run         | Pending       | None      |
| 15  | Production hardening                     | `[ ]`  | Not run         | Pending       | None      |
| 16  | Visual-builder readiness contracts       | `[ ]`  | Not run         | Pending       | None      |

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
- `[x]` Split mandatory rules into a discoverable `knowledge_base/rules/` index with one focused file per concern.
- `[x]` Added mandatory Git-state verification and structured source-code comment rules.
- `[x]` Added a mandatory implementation-reporting structure covering status, implemented work, measurable validation, developer-testable flows, unavailable/blocked flows, remaining work, and developer-controlled actions.

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
- `[x]` Incorporate first developer review: defer database-level `en` existence enforcement to M15, specify owner-demotion locale access, make the shared version-conflict wording correction explicit/tested, document durable configured allowlists, and require draft-lockout confirmation copy.
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
- `[A]` Developer approved and committed Milestone 4 as `68b6f6e` (`feat(m4): project locales and strict locale contracts`).

## Milestone 5 checklist — design approval gate

- `[x]` Re-read product, CMS PRD, mandatory rules, active milestone, context, progress, learnings, and prior architecture decisions.
- `[x]` Apply materially relevant Effect, Drizzle, PostgreSQL, Express, security, TanStack, shadcn/ui, React, Turborepo, and web-interface guidance.
- `[x]` Review the current database schema, platform/access/locale contracts, policy, repositories, operations, runtime, router, tests, query composition, and project UI.
- `[x]` Propose the complete collection, schema-revision lifecycle, stable identity, API-key, change-classification, authorization, audit/outbox, observability, UI, threat, and test design in `knowledge_base/decisions/m5-versioned-schema-engine-design.md`.
- `[x]` Reconcile milestone scope by moving recursive object/list and validation-configuration classification criteria to M6, and preserve draft version across publication because publication changes the baseline rather than draft content.
- `[A]` Developer approved the M5 design and authorized implementation.
- `[x]` Add branded collection/field/revision/command/event contracts, strict reserved API keys, M5 field definitions, mutation/publication inputs, bounded outputs, collection cursors, and centralized schema errors.
- `[x]` Add the pure Effect `SchemaEngine` Layer with bounded validation, canonical hashing, deterministic classification/change IDs, exact acknowledgements, and persisted publication-command fingerprints.
- `[x]` Add the six approved Drizzle tables with UUIDv7 identities, complete tenant scope, stable field identities, immutable revision snapshots, schema-head pointers, generic outbox, restrictive foreign keys, checks, and query-path indexes.
- `[x]` Pass database/API type checks, 37 targeted contract/engine/error tests, workspace formatting/lint, and `git diff --check` without generating or applying a migration.
- `[x]` Developer generated and applied `0004_create_versioned_collection_schemas.sql`; the agent inspected the complete DDL and verified the live schema read-only.
- `[x]` Implement collection create/list/get/update repository workflows with CMS gating, tenant non-enumeration, project/collection locks, keyset pagination, optimistic metadata/draft versions, no-op behavior, and transactional audits.
- `[x]` Extend locale-restricted policy for project-global schema mutation, compose schema services into the shared runtime, and expose the initial collection management procedures.
- `[x]` Implement field create/update/remove/reorder transactions, draft retrieval, complete-set ordering, stable soft-removed identities, no-op suppression, optimistic conflicts, and transactional audits.
- `[x]` Implement publication validation, deterministic classification/hash, exact acknowledgement, immutable snapshots, fingerprinted command retries, no-op publication, monotonic concurrent publication, head pointers, audits, and outbox events atomically.
- `[x]` Implement latest/revision-addressable published retrieval, bounded schema metrics, complete oRPC wiring, anonymous-denial coverage, replaceable operation Layers, and OpenAPI-compatible contracts.
- `[x]` Implement the permission-aware collection surface and dedicated accessible schema builder with targeted route loading/query invalidation, field controls, validation/change review, publication acknowledgement, immutable revision summary, and conflict refetch.
- `[x]` Pass the complete automated readiness gate and clean read-only PostgreSQL fixture verification.
- `[x]` Fix the schema-builder route composition issue found during manual review and add a route-tree regression test.
- `[A]` Developer manually verified the representative collection lifecycle, risky-change acknowledgement, publication, and immutable revision behavior; approved Milestone 5; and committed it as `28ca04d`.

## Milestone 6 checklist — design approval gate

- `[x]` Re-read the product vision, CMS PRD, every mandatory rule, active milestone, context, progress, learnings, and relevant M1/M3/M4/M5 decisions.
- `[x]` Inspect current Git state and reconcile the completed M5 state with the repository history.
- `[x]` Load and apply materially relevant Effect, Drizzle, PostgreSQL, Express, security, TanStack, shadcn/ui, React, Turborepo, Better Auth-boundary, and web-interface guidance.
- `[x]` Inspect the M5 schema contracts, pure engine, repository transactions, policy, operations, runtime, router, builder, browser validation, and automated test seams that M6 extends.
- `[x]` Research Portable Text, ProseMirror/Tiptap/Lexical trade-offs, safe RE2-compatible patterns, URL/date/email/slug standards, structured rich-text safety, and current package compatibility.
- `[x]` Inspect shadcn Base UI project context and installed components; no component or dependency was changed.
- `[x]` Use the required skill-discovery workflow for the uncovered rich-text domain and review candidate source quality, adoption, and security audits.
- `[x]` Propose the complete M6 field vocabulary, recursive relational model, value validation, rich-text profile, external assets, references, editor layout, role-aware generated forms, security, observability, migration compatibility, and test matrix in `knowledge_base/decisions/m6-field-system-and-generated-forms-design.md`.
- `[x]` Incorporate developer-approved review changes: centrally profiled depth 8, a 1 MiB aggregate canonical schema limit, and rejection of direct list-of-list definitions in favor of an object boundary.
- `[x]` Resolve the remaining product decisions: mixed localization is supported through object-only fragment merging with atomic list subtrees; exact decimal and dedicated money fields are included in M6.
- `[x]` Update the CMS PRD and M6 success criteria to make the approved localization, decimal, and money behavior authoritative.
- `[x]` Developer approved the complete M6 design and explicitly authorized implementation.
- `[x]` Developer installed `sanity-io/agent-toolkit@portable-text-serialization`; the agent read the complete skill and React rule.
- `[x]` Add approved `re2js` and `@portabletext/editor` dependencies with pnpm and review their lockfile impact.
- `[x]` Generate and pin the browser-safe official SIX ISO 4217 profile `iso-4217@2026-01-01` with 165 currencies and no runtime fetch.
- `[x]` Implement strict Effect contracts for all 18 field kinds, exact decimal, money, Portable Text, external assets, editor metadata, editor layout, and central validation profiles.
- `[x]` Implement dependency-light value/tree/layout/aggregate validators, RE2 patterns, depth 8, direct list-of-list rejection, mixed-object/atomic-list localization, and the 1 MiB schema limit.
- `[x]` Add the replaceable named Effect `FieldEngine` to the shared production runtime.
- `[x]` Add 19 targeted contract, pure-kernel, layout, aggregate-limit, and Effect service tests.
- `[x]` Update only the approved Drizzle schema for recursive field nodes, immutable snapshots, editor metadata/layout, reference targets, validation/currency profiles, and decimal/money kinds.
- `[x]` `@framerfordevs/db` and `@framerfordevs/api` type checks pass after the Drizzle-schema update; no migration command was run.
- `[x]` Developer generated and applied migration `add_field_system_and_editor_layout`; the agent did neither.
- `[x]` Agent inspected the complete generated SQL and version-7 snapshot and verified the live schema read-only: all 15 expected columns, 35 new validated constraints, and 16 valid/ready indexes exist; 3 stable fields, 6 revision fields, 3 revisions, and 1 head satisfy legacy backfill invariants.
- `[x]` Rename project-owned agent skills from `.pi/skills/` to vendor-neutral `.agents/skills/` and add root `AGENTS.md` with repository-specific rules.
- `[x]` Integrate recursive fields, pinned profiles, independent schema/contract hashing, classification, layouts, references, and generated-form projection through the repository, operations, router, and runtime.
- `[x]` Implement transactional recursive field/layout mutation and immutable publication snapshots with aggregate bounds, currency pinning, tenant-safe references, no-op behavior, rollback, and role projection.
- `[x]` Implement all 18 generated control kinds, nested object/list authoring, exact decimal/money controls, external asset metadata, timezone-explicit date-time handling, and the lazy official Portable Text adapter.
- `[x]` Add property, contract, pure-kernel, Effect service, PostgreSQL, API authorization, browser validation, generated-form, accessibility, aggregate, hashing, classification, and bundle coverage.
- `[x]` Complete the workspace readiness gate, read-only PostgreSQL invariant/fixture verification, and production bundle boundary review.
- `[x]` Remediate every `pnpm audit --prod` finding after M6 testing; both production-only and full audits now report no known vulnerabilities.
- `[x]` Fix the production-only React hook-order crash found during cold Docker manual review; make the reorder mutation hook unconditional and enforce `react-hooks/rules-of-hooks` workspace-wide.
- `[x]` Replace the route's dialog-only workflow with a visual field tree, persistent inspector, explicit local save/discard state, and guarded navigation while preserving the existing granular APIs as compatibility surfaces.
- `[x]` Expose every kind-specific configuration plus help, placeholder, visibility roles, and editable roles; suggest unique sibling API keys and render duplicate-key/server validation feedback inline and in an accessible summary.
- `[x]` Add a versioned synchronized schema-definition JSON view and a separate bounded sample-content JSON inference flow with preview, warnings, explicit local replacement, and no sample-value persistence or server transfer.
- `[x]` Add the optimistic atomic `fields.replace` contract, operation, telemetry, router, repository transaction, layout reconciliation, audit, OpenAPI, PostgreSQL rollback/identity, UI, pure inference, and accessibility coverage without changing the database schema or migration artifacts.
- `[x]` Pass the refreshed complete readiness gate with 551 tests and preserve the lazy Portable Text/boundary-reviewed production bundle.
- `[A]` Developer completed manual review, approved Milestone 6, and committed it as `fbb4767` (`feat(m6): field system, structured rich text, external assets, and editor layout`).

## Milestone 7 checklist — design approval gate

- `[x]` Re-read the product vision, CMS PRD, every mandatory rule, active milestone, context, progress, learnings, and prior M1–M6 decisions.
- `[x]` Verify Git state and preserve the uncommitted M6 approval-documentation changes.
- `[x]` Apply materially relevant Effect, Drizzle, PostgreSQL, Express, security, TanStack, shadcn/ui, React, Portable Text, Turborepo, and web-interface guidance.
- `[x]` Inspect the implemented M4–M6 locale, schema, field, policy, repository, API, UI, migration-gate, and test seams.
- `[x]` Reconcile stable entry identity, mixed shared/localized fragments, locale-independent concurrency, permissive draft validation, field permissions, references, revisions, restore, pagination, and delivery isolation.
- `[x]` Propose the complete design in `knowledge_base/decisions/m7-entries-multilingual-drafts-and-revisions-design.md`.
- `[A]` Developer reviewed the corrected proposal, explicitly approved the complete M7 design, and authorized implementation.
- `[x]` Add the six approved Drizzle tables for stable entries, immutable shared/locale revisions, shared/locale heads, and durable save/restore command receipts.
- `[x]` Add complete tenant/schema/locale/history foreign keys, optimistic head-version correlation, value/fingerprint bounds, changed-field arrays, and list/revision/dependency indexes.
- `[x]` Add Drizzle relations and pass targeted formatting, lint, database type-check, and `git diff --check` without generating or applying a migration.
- `[x]` Developer generated and applied `0006_create_entries_and_locale_revisions.sql`; the agent generated/applied neither operation.
- `[x]` Inspect all 185 generated SQL lines and version-7 snapshot; confirm only the six approved new tables, their foreign keys, checks, indexes, and journal entry were generated with no destructive/backfill SQL.
- `[x]` Verify the live catalog read-only: six empty tables, 82 columns, 26 foreign keys, 25 checks, 16 primary/unique constraints, 38 valid/ready indexes including constraint indexes, zero unvalidated constraints, and seven applied migrations.
- `[x]` Add schema-backed entry/draft/mutation/revision contracts, shared `PageLimit` pagination, scope-bound entry/revision cursors, structured conflict metadata, and four centralized M7 errors.
- `[x]` Add the dependency-light stable-ID entry-value kernel for bounded JSON preflight, atomic set/unset/list mutations, canonical no-op detection, changed-field IDs, and disjoint sparse-fragment merging.
- `[x]` Add the replaceable named `EntryEngine` Effect service to the shared `ManagedRuntime` and focused contract/kernel/service/cursor/error tests.
- `[x]` Replace the M4 zero-draft locale dependency placeholder with a project-locked, tenant-scoped, capped `cms_entry_locale_draft` query; existing transition/integration tests pass.
- `[x]` Implement tenant-scoped create/list/get/save/revision/restore transactions with project → collection → entry lock order, command-scoped create serialization, independent partition versions, canonical no-op suppression, durable replay receipts, immutable revision lineage, restore append, and partition audits.
- `[x]` Enforce current published-contract authority, exact enabled-locale access, all-locale shared authority, recursive field visibility/editability, wrong-partition rejection, hidden-value projection, bounded storage safety, permissive content issues, and grouped tenant-safe reference availability checks.
- `[x]` Add all six named entry operations, shared runtime repository Layer, protected oRPC procedures, standardized outputs/errors, scoped cursors, and locale dependency integration.
- `[x]` Add stable-cursor collection entry lists and generated multilingual editor routes with shared/read-only controls, exact locale tabs, dirty-switch confirmation, explicit save states, preserved conflict edits, authoritative reload, separate histories, restore confirmation, and targeted query invalidation.
- `[x]` Add contract/kernel/service/operation/PostgreSQL tests for create/save idempotency and command conflicts, malformed hard gates, permissive issues, reference availability, locale concurrency/isolation, shared conflicts, selected-locale denial, rollback, no-op receipts, immutable restore history, delivery isolation, and intended query plans.
- `[x]` Pass the complete automated readiness, coverage, production/full audit, production build, rebuilt Docker health, read-only PostgreSQL fixture/invariant, and `git diff --check` gates.
- `[x]` Begin developer manual review and verify mixed-object nesting/publication behavior against live schema draft v5.
- `[x]` Approve the M7 manual-review amendment: CMS-only entry names, locale-neutral lists, URL-driven locale tabs, version-0 defaults, saved Portable Text hydration, and eligible-only mixed-object options.
- `[x]` Add only the approved nullable `cms_entry.display_name`, positive defaulted `name_version`, and bounded Drizzle checks; database package type-check and `git diff --check` pass without running a migration command.
- `[x]` Developer generated and applied `0007_add_entry_display_names.sql`; inspect the complete SQL/snapshot and verify the live catalog read-only without modifying or applying the migration.
- `[x]` Require bounded CMS-only names for new entries and implement optimistic rename, no-op suppression, command conflicts, transactional audits, rollback, standard oRPC responses, and accessible create/rename workflows.
- `[x]` Make entry lists locale-neutral, drive editor locale from validated URL search state, project defaults only for version-0 partitions, hydrate saved Portable Text documents, and hide mixed localization for every ineligible non-object kind.
- `[x]` Add contract, operation, PostgreSQL, API, defaults, rich-text, route, generated-form, schema-workbench, and accessibility regression coverage.
- `[x]` Pass the refreshed readiness, coverage, audit, build, read-only PostgreSQL invariant, and `git diff --check` gates.
- `[x]` Treat an unpublished schema as an expected entry-workspace state: read collection publication metadata first, skip unavailable form/list prefetches, return an empty locale-neutral management list without requiring a value contract, and preserve direct 404 semantics for genuinely missing resources.
- `[x]` Replace the raw-JSON rich-text default control with the configured lazy Portable Text editor and audit every other field kind’s default-entry method; correct long-text, date-time, exact-decimal, and structured root-shape controls, then normalize class-backed rich-text/money/asset defaults before server value validation.
- `[x]` Emit entry-editor mutations at exact descendant paths beneath mixed objects while retaining atomic root mutations elsewhere, so generated default values respect server-enforced shared/localized partition authority.
- `[A]` Developer completed manual English/Hindi/Gujarati review, approved Milestone 7, and committed it as `60bd96f` (`feat(m7): entries, multilingual drafts, and revision history`).

## Milestone 8 checklist — design approval gate

- `[x]` Re-read the product vision, CMS PRD, mandatory rules, M8 milestone criteria, M1–M7 decisions, context, progress, and learnings for M8 design discovery.
- `[x]` Inspect the committed M7 publication seams, schema/revision identity, locale isolation, references, audits, outbox, repository locking, API/UI, and test infrastructure.
- `[x]` Author and revise `knowledge_base/decisions/m8-independent-locale-publication-and-snapshots-design.md` for independent locale publication, immutable snapshots, shared-value staleness, shared-only exact-locale reference requirements and UI guidance, explicit `READ COMMITTED` semantics, a realistic 1 MiB fixture gate, locale-leading indexing, unpublish, idempotency, concurrency, retention, and atomic audit/outbox behavior.
- `[x]` Developer explicitly approved the complete revised M8 design and authorized implementation.
- `[x]` Implement M8 management contracts and OpenAPI conversion coverage.
- `[x]` Implement the dependency-light strict publication compiler: schema-guided partition selection, defaults, normalization, API-key projection, exact-locale reference pinning, canonical hashes, changed roots, aggregate bounds, and no truncation.
- `[x]` Lock the realistic-content fixture report at 675,221 document bytes + 16,825 manifest bytes = 692,046 combined bytes, leaving 356,530 bytes (34.00%) maximum headroom and passing the 786,432-byte gate.
- `[x]` Lock synthetic 1,048,575 / 1,048,576 / 1,048,577-byte boundary behavior.
- `[x]` Developer confirmed the realistic fixture report and provisional 1 MiB profile, authorizing Drizzle schema work.
- `[x]` Implement the approved Drizzle schema: entry event sequence, five publication tables, strict tenant/source/reference/head/receipt constraints, aggregate snapshot counters, locale-leading current-head index, outbox scope extensions, relations, and entry-event uniqueness.
- `[x]` Developer generated, augmented with the reviewed append-only triggers, and applied `0008_add_locale_publications_and_delivery_snapshots.sql`; agent inspected the complete migration/snapshot and live catalog read-only.
- `[x]` Implement the replaceable `PublicationEngine` and focused `PublicationRepository` with explicit production `READ COMMITTED` transactions, deterministic project/collection/entry/source/head locking, grouped exact-locale target resolution, strict hidden-field issue redaction, and actionable authorized target links.
- `[x]` Implement status, validation-plan, publish, unpublish, durable changed/no-op replay, staleness, immutable history pagination, snapshot/reference-edge persistence, audit/outbox atomicity, and centralized publication invalid/conflict errors.
- `[x]` Wire named publication operations, runtime Layers, management oRPC/OpenAPI procedures, bounded publication metrics, and real locale current-publication dependency counts.
- `[x]` Add selected-locale publication status/history, save-before-publish validation, measured size feedback, exact-locale reference guidance, publish/unpublish confirmation, targeted invalidation, and route-prefetched status/history to the entry editor.
- `[x]` Add contract/cursor/engine/operation tests plus rollback-contained PostgreSQL coverage for invalid validation, authorized unpublished-target guidance, exact-locale target pinning, independent English/Hindi heads, publication/replay/history/unpublish/no-op behavior, all eight failure-injection stages under inspected `read committed`, append-only trigger rejection, and intended query indexes.
- `[x]` Add anonymous denial for all five management routes and automated axe coverage for exact-locale publish/unpublish dialogs.
- `[x]` Complete shared-snapshot staleness/immutability, exact-locale reference linearization, stale same-locale publish and publish/unpublish authority conflicts, concurrent entry event sequencing, and complete role/locale-access policy matrices.
- `[x]` Complete final readiness, coverage, production/full audits, builds, bundle review, `git diff --check`, and read-only database fixture/invariant verification.
- `[A]` Developer approved and committed M8 as `ad3cd5e` (`feat(m8): add independent locale publication and immutable snapshots`).

## Milestone 9 checklist — design approval gate

- `[x]` Re-read the product vision, CMS PRD, mandatory rules, M9 milestone criteria, M1-M8 decisions, context, progress, and learnings.
- `[x]` Inspect the committed M8 current-publication/snapshot/reference authority, Delivery credentials/policy, Express/CORS/runtime/error/telemetry boundaries, schema/field/query seams, database indexes, UI conventions, and test infrastructure.
- `[x]` Apply materially relevant Effect, Drizzle, PostgreSQL, Express, Better Auth, security, TanStack, shadcn/ui, React, Turborepo, and web-interface guidance.
- `[x]` Research conditional HTTP validators/cache directives, wildcard non-credentialed CORS, signed cursor/resource-limit behavior, PostgreSQL typed indexes/keyset stability/advisory locks/query plans, connection use, and N+1 avoidance.
- `[x]` Propose the complete design in `knowledge_base/decisions/m9-production-delivery-api-design.md`, including REST/OpenAPI contracts, strict locale behavior, protected/public access, typed query projections, uniqueness, signed generation-bound cursors, pinned expansion, cache/CORS/rate policy, observability, migration/backfill gates, and load targets.
- `[x]` Amend the proposal with explicit collection-locale cursor invalidation guidance, rolling 15-minute continuation cursors, environment-wide credential trust semantics, complete published-field Delivery behavior, count omission, generic documentation scope, and a reusable generic Redis/memory rate-limit manager with cross-process credential quotas and no valid-credential source bucket.
- `[A]` Developer explicitly approved the complete M9 design and authorized implementation.
- `[x]` Implement the central weighted token-bucket manager, memory/Redis stores, atomic Redis Lua enforcement, HMAC identities, bounded degraded fallback, canonical network-source handling, adapted credential-attempt limiter, runtime/configuration wiring, and Redis integration infrastructure.
- `[x]` Implement schema-backed Delivery contracts/errors, the strict bounded typed query parser, complete supported-root projection compiler, and rolling active/previous-key cursor signer with authority/generation/expiry binding.
- `[x]` Implement the approved Drizzle read-model schema for protected-by-default collection configuration, field capabilities, collection-locale generation, typed current projections, current-head authority, tenant foreign keys, checks, and typed/unique indexes.
- `[x]` Complete the developer-controlled `add_production_delivery_api_read_model` migration gate, including the protected existing-collection backfill, corrected current-head authority ordering, successful developer application, and read-only catalog verification.
- `[x]` Create protected Delivery configuration with each collection and implement authorized complete-set optimistic management with public acknowledgement, published-field compatibility, unique capability checks, no-op suppression, audit, and outbox persistence.
- `[x]` Extend publish/unpublish transactions with typed projection replacement/removal, deterministic advisory locking for unique claims, collection-locale generation changes, and rollback-injection coverage.
- `[x]` Implement current/immutable/unique/list Delivery reads with exact locale and tenant authority, typed indexed predicates, signed rolling keyset pagination, broad stale detection, and bounded pinned-reference expansion.
- `[x]` Add the rollout-gated versioned Express Delivery surface with GET/HEAD/OPTIONS, isolated wildcard no-credentials CORS, conditional credential authentication, global/identity rate limits, validators/cache policy, final response cap, and dedicated OpenAPI/reference routes.
- `[x]` Protect configured Delivery fields from incompatible schema publication and add accessible permission-aware collection settings for access and kind-safe capabilities.
- `[x]` Add the explicit dry-run/apply backfill utility; developer application and read-only verification confirm all three durable current scopes have generation state and require zero typed rows for their unsupported historical root kinds.
- `[x]` Make PostgreSQL pool and Delivery transaction time bounds explicit and add the approved manual k6 baseline profile.
- `[x]` Pass the refreshed complete readiness gate and final read-only database invariants.
- `[x]` Create the deterministic 10,000-publication fixture and 40 load-only credentials without exposing one-time secrets.
- `[x]` Pass all three approved production-topology capacity scenarios and post-run connection/Redis/database invariants.
- `[x]` Pass the separate conditional-304, weighted hot-credential cross-process 429, hard Redis outage/degraded-memory/recovery, and oversized-response rejection/memory-stability gates; restore all current boundary fixture heads/drafts and verify final invariants.
- `[x]` Complete the schema-reconciled Delivery-only OpenAPI 3.1 document and interactive reference, snapshot-lock all four GET/HEAD/OPTIONS surfaces and protocol headers, exclude internal contracts, and disable the complete management oRPC reference by default and unconditionally in production.
- `[x]` Amend M12 to own the allowlisted developer portal/generated tooling and M15 to prove production marketing/application/API/developer/operator host separation.
- `[A]` Developer approved and committed M9 as `8559aa4` (`feat(m9): production delivery API`).

## Milestone 10 checklist — approved completion

- `[x]` Re-read the product vision, CMS PRD, every mandatory rule, active milestone, context, progress, learnings, and M1–M9 decisions.
- `[x]` Verify clean Git state and reconcile M9 completion with `main`/`origin/main` at `70ce4fd` and implementation commit `8559aa4`.
- `[x]` Load materially relevant Effect, security, Express, Better Auth, Drizzle, PostgreSQL, TanStack Start/Router/Query, shadcn, React, Turborepo, Portable Text, and web-interface guidance.
- `[x]` Verify stable Effect 3.22/`@effect/vitest` behavior, current shadcn Base UI project context, installed components, and current public component/web-interface guidance.
- `[x]` Inspect the committed Preview credential, policy, draft/revision, publication, Delivery, rate-limit, Express/CORS/cache/OpenAPI, runtime/Layer, dashboard route/editor, database schema, and representative test seams.
- `[x]` Research bearer-header, no-store, no-referrer, and wildcard non-credentialed CORS constraints from authoritative HTTP/security sources.
- `[x]` Resolve the separate shared/locale history ambiguity with explicit schema plus shared/localized revision-source selection rather than inferred historical counterparts.
- `[x]` Propose the complete M10 API, credential, projection, cache/CORS, session-handoff, rate-limit, audit, Effect, UI, threat, performance, and maximum-coverage design at `knowledge_base/decisions/m10-preview-api-and-ux-design.md`.
- `[x]` Review credential blast radius, M3/M8 cross-milestone risk, repeatable-read audit concurrency, rate-gate preservation, and invalid-selector UX; amend the proposal with concrete controls.
- `[x]` Inventory Preview credentials read-only without exposing identifiers or secrets: one active non-expiring non-test Preview credential currently requires normal replacement/revocation before rollout.
- `[A]` Developer separately approved environment-wide/full-field Preview authority only with an expiring-only server-enforced 30-day maximum, dedicated authority warning/acknowledgement, and pre-rollout noncompliant-credential replacement/revocation.
- `[A]` Developer approved the complete amended M10 design and authorized implementation.
- `[x]` Tighten M3 Preview credentials to mandatory acknowledged environment-wide authority, server-clock expiry, a 30-day maximum original lifetime, fail-closed legacy authentication/rotation, and complete credential regressions/UI warning coverage, including an accessible fail-closed warning on inventoried legacy non-expiring Preview rows.
- `[x]` Extract shared stable-ID projection primitives from the M8 compiler and prove publication fixtures/hashes plus M9 Delivery behavior unchanged.
- `[x]` Implement M10 source/query/response/error contracts, strict query parser, permissive bounded compiler, role-safe projection, and replaceable `PreviewDocumentEngine` with focused tests.
- `[x]` Implement the exact-scope `PreviewRepository`, current/historical source loading, short `REPEATABLE READ` source-plus-audit transactions, 750 ms/2 s timeouts, one-time `40001` whole-transaction retry, runtime Layer, and named credential/user operations.
- `[x]` Add PostgreSQL coverage for version-0/current/history sources, old API keys, incompatible contracts, full machine versus role-projected values, locale/role/lifecycle denial and restoration, audit rollback/content absence, concurrent-save coherence, parallel audit counts, retry classification, and intended indexes.
- `[x]` Add closed Preview global/credential/user rate policies, bounded Preview telemetry, operation ordering tests, rollout configuration, bearer-only Express GET/HEAD/OPTIONS routes, wildcard non-credentialed CORS, exact no-store/no-referrer headers, and dedicated Preview OpenAPI/Scalar documentation.
- `[x]` Add the protected non-nested dashboard Preview route, strict URL source state with no malformed historical fallback, current/revision controls, validation/source/production status, renderer-neutral JSON, credential-free endpoint copying, save-before-preview guards, explicit history Preview links, targeted invalidation, global referrer protection, and accessibility/route tests.
- `[x]` Reconcile approved non-load contract/property/HTTP/authorization/observability/coverage requirements and pass the refreshed full automated readiness gate: `pnpm run ready` passes with 780 tests, 90.29% API statements, 74.89% API branches, 100% Preview parser statements/branches/functions, 100% Preview compiler statements/functions, 98% Preview repository statements, and 81.57% Preview repository branches. Preview UI coverage is measured explicitly at 95.89% statements/85.71% branches with source/status/error/empty/accessibility interactions; production and full pnpm audits report no known vulnerabilities.
- `[x]` Implement and k6-parse the separate current, revision, two-process quota, Redis outage, oversized-response, concurrent-save/read coherence-allowlist, and fixed-count parallel-audit harness plus secret-safe orchestration/runbook and normal audited short-lived load-credential issuance utility.
- `[x]` Complete the full 15-second warm-up/60-second current Preview capacity profile: 4,503 measured 2xx at the 75 req/s target, p95 30.30 ms, p99 47.46 ms, and zero unexpected errors/drops.
- `[x]` Complete the full 15-second warm-up/60-second revision Preview capacity profile: 3,001 measured 2xx at the 50 req/s target, p95 20.38 ms, p99 22.27 ms, and zero unexpected errors/drops.
- `[x]` Complete the two-process 300-unit credential quota/429 profile: 300 measured 2xx plus 600 stable 429s split across both processes, with zero unexpected errors/drops.
- `[x]` Complete the Redis outage/degraded-memory/recovery profile: 3,001 measured 2xx through a 15-second hard outage, p95 308.40 ms/p99 326.29 ms, zero errors/drops, and bounded limiter-key recovery.
- `[x]` Complete the oversized-response/memory-stability profile: 300/300 measured stable 413 responses at 5 req/s, p95 84.15 ms/p99 86.70 ms, zero unexpected errors/drops, and server memory returned from the transient peak to near baseline after the run.
- `[x]` Complete concurrent save/read and parallel same-entry read/audit/serialization profiles: the audited save loop completed 488 alternating saves and restored the original value; the 60-second read gate returned 4,500 measured 2xx with zero unknown/torn tuples, errors, or drops (p95 16.82 ms), and fixed-count parallel audit passed with exactly 1,000/1,000 successes and 1,000 distinct content-free audits.
- `[x]` Rebuild the production Docker server/web images and verify healthy containers, web reachability, dedicated Preview OpenAPI 3.1/Scalar reachability, and rollout-disabled data routes returning no-store HTTP 503; explicitly exclude both secret-bearing load environment files from Git/Docker contexts and verify neither exists in rebuilt images; developer-approved dangling-image pruning removed obsolete local layers and left current services healthy.
- `[x]` Verify read-only post-test invariants: zero M10 fixture users/audits, zero non-idle external transactions, unchanged durable publication/snapshot counts, and no migration activity.
- `[A]` Developer manually verified current and historical Gujarati Preview behavior, approved M10, and committed it as `aa177b5` (`feat(m10): preview API`).
- `[A]` Developer confirmed the family-first public API versioning policy for first launch: independently versioned `/api/delivery/v1` and `/api/preview/v1` families, SemVer SDK releases in M12, additive evolution within an API major, parallel major-version migrations, and no date-based behavioral versioning until demonstrated need.

## Milestone 11 checklist — design approval gate

- `[x]` Re-read the product vision, CMS PRD, every mandatory rule, active milestone, context, progress, learnings, and M1–M10 decisions.
- `[x]` Verify clean Git state and reconcile M10 completion with `main`/`origin/main` at `14881fe` and implementation commit `aa177b5`.
- `[x]` Load materially relevant Effect, Drizzle/PostgreSQL, Express, security, TanStack, shadcn, React, Turborepo, and accessibility guidance.
- `[x]` Inspect the committed transactional outbox, schema/entry publication writers, exact-locale sequences, invalidation tags, policy scopes, credentials, audits, runtime Layers, Express process, UI, and test seams.
- `[x]` Research `FOR UPDATE SKIP LOCKED`, leases/stale-worker guards, Standard Webhooks signing, CloudEvents envelopes, SSRF/DNS-rebinding controls, `Retry-After`, bounded retries, Effect schedules, and deterministic Clock testing.
- `[x]` Propose the complete M11 event, endpoint, subscription, encrypted destination/secret, signing/rotation, SSRF, worker, retry/dead-letter/replay, invalidation, authorization, UI, observability, migration, rollout, retention, and maximum-coverage design in `knowledge_base/decisions/m11-publication-events-webhooks-and-invalidation-design.md`.
- `[x]` Validate external review against repository history and constraints; amend only confirmed gaps with pre-application FK-order inspection, transactional endpoint/destination staging, plain-JSON replay fingerprints, named publication invalidation failure stages, cross-process Docker key continuity, combined dispatcher/attempt contention, and explicit workspace-quota/tenant-fairness deferral.
- `[A]` Developer explicitly approved the complete amended M11 design and authorized implementation.
- `[x]` Add the approved eight-table Drizzle schema, reciprocal endpoint/destination staging authority, complete tenant/event/delivery constraints, queue/lease/history indexes, outbox event-scope uniqueness, and schema exports without generating or applying a migration.
- `[x]` Add foundational schema-backed webhook/event/invalidation/endpoint/secret/delivery/attempt/replay contracts, discriminated CloudEvents authority, browser-safe bounded validation, centralized typed errors/status mappings, OpenAPI conversion coverage, and focused regression tests.
- `[x]` Pass database/API/workspace type checks, all 554 API tests, workspace lint/format checks, and `git diff --check` without migration activity.
- `[x]` Developer generated `0010_add_webhook_delivery_system.sql`; the agent inspected the complete SQL/snapshot without modifying or applying either artifact.
- `[x]` Pre-application reinspection passed after the developer moved `outbox_event_id_scope_unique` before `publication_event_outbox_scope_fk`: each appears exactly once in the required order, SQL and snapshot authorities align, every FK has exact PK/unique authority, the diff adds only the eight intended tables plus the outbox unique authority, and no destructive/data-mutation SQL is present.
- `[x]` Developer applied `0010_add_webhook_delivery_system.sql` successfully; the agent did not apply it.
- `[x]` Read-only live verification confirms all eight intended tables, 11 applied migration records, zero unvalidated constraints, and zero invalid/unready indexes.
- `[x]` Implement the pure strict outbox-to-CloudEvents projector/canonical serializer, Standard Webhooks raw-byte signer/verifier with atomic replay reservation, bounded retry/`Retry-After` policy, all-answer SSRF destination policy using reviewed `ipaddr.js`, and scoped AES-256-GCM key-ring service with focused tests.
- `[x]` Workspace lint/format and all package type checks pass; 19 focused new pure/crypto tests pass.
- `[!]` The full API run passes 572/573 tests; the sole failure is an existing M10 query-plan name assertion for `cms_entry_shared_revision_id_entry_sequence_unique`. It reproduces in isolation after the M11 migration even though read-only catalog verification confirms the index remains valid and present, indicating planner-choice/test brittleness rather than an M11 functional regression.
- `[x]` Pre-integration review found the applied migration omitted the approved outbox payload-check increase: `outbox_event_payload_valid` remained 16 KiB, which cannot safely persist the bounded route/tag snapshot profile before projection to the 128 KiB event body. The Drizzle source now raises only that check to 131,072 bytes.
- `[x]` Developer generated `0011_raise_outbox_event_payload_limit.sql`; complete SQL/snapshot inspection confirms it only drops/recreates that check at 131,072 bytes, changes only `public.outbox_event.checkConstraints`, preserves the exact snapshot chain, and contains no table/data/index/FK changes.
- `[x]` Developer applied `0011_raise_outbox_event_payload_limit.sql`; read-only verification confirms the validated 131,072-byte check, 12 applied migration records, zero unvalidated constraints, and zero invalid/unready indexes.
- `[x]` Integrate deterministic mapping matches into schema publish, entry publish, and entry unpublish transactions with exact tenant/collection/entry/locale/event authority, sorted/deduplicated route/tag snapshots, 128 KiB pre-outbox validation, all four named M11 failure boundaries, rollback coverage, and all-field unpublish invalidation.
- `[x]` Add `webhook.read` and `webhook.manage` to the policy's unrestricted-locale action set and prove selected-locale developers are denied both.
- `[x]` Pass 201 focused invalidation/publication/schema/policy tests, API/database type checks, workspace lint/format, and `git diff --check`.
- `[x]` Add the replaceable strict event projector service and atomic PostgreSQL dispatcher using bounded `FOR UPDATE SKIP LOCKED`, immutable canonical-event insertion, event-time endpoint/subscription eligibility, conflict-safe initial fan-out, known internal-event completion, and processed-marker atomicity.
- `[x]` Add a dedicated `apps/worker` package with one worker-owned `ManagedRuntime`, bounded dispatcher polling, interruption-aware shutdown, Turborepo tasks, successful type-check/build, and PostgreSQL zero-endpoint/two-dispatcher claim coverage.
- `[x]` Add strict persistent key-ring environment parsing with fail-closed unavailable service behavior, replaceable DNS/all-answer destination validation, and initial authorized endpoint create/list repository/operations/protected oRPC wiring with atomic disabled staging, encrypted immutable destination, active secret, subscriptions, pointer enablement, one-time secret response, endpoint cap serialization, and secret-free audit.
- `[x]` Pass workspace lint/format, all nine package type checks, worker production build, focused key-ring/DNS/crypto/dispatcher/policy tests, and `git diff --check`.
- `[x]` Implement initial delivery-attempt runtime: one endpoint lease, due delivery claim, immutable started attempt, active/retiring secret authority, expired-lease abandonment/requeue, scoped decrypt, send-time DNS revalidation, pinned-address HTTPS with fixed headers/no redirects/proxy agent, raw-byte signatures, HTTP/network outcome classification, retry scheduling, and lease-token-guarded finalization.
- `[x]` Add protected route-mapping create/list, delivery/attempt history, and command-idempotent manual replay repository/operations/oRPC surfaces with tenant authorization, plain transport-JSON fingerprinting, current endpoint destination authority, and secret-free replay audit.
- `[x]` Add worker Docker image/service, independent pool bound, shared key-ring environment contract, server/worker key-ring parsing, and environment tests for complete/incomplete configuration.
- `[x]` Add optimistic endpoint enable/disable with queued cancellation, complete-set interval-preserving subscription replacement with removed-type cancellation, and two-phase secret start/activate/cancel/complete persistence with encrypted pending disclosure, 24-hour retiring overlap, ciphertext destruction, lifecycle audits, operations, and protected routes.
- `[x]` Add the lazy non-nested protected Webhooks workspace and project navigation, with endpoint status/subscriptions, masked destination, mapping summary, and delivery history; production web build regenerates the typed route tree and keeps the workspace in a separate chunk.
- `[x]` Make worker delivery explicitly disabled by default and reject enabled startup without a persistent key ring; update environment tests.
- `[x]` Replace the brittle M10 shared-revision exact-index assertion with a bounded set of valid ID/entry-leading indexed authorities after read-only `EXPLAIN` confirmed PostgreSQL 18 selected the valid entry-leading index; isolated regression now passes.
- `[x]` Add the approved 32-slot work-conserving attempt scheduler, dependency-free liveness, database/schema/key-reference readiness, independent HTTP health boundary, Compose health check, graceful-shutdown outcome metric, and closed low-cardinality projection/poll/attempt/retry/dead-letter/lease-recovery telemetry.
- `[x]` Add PostgreSQL attempt lifecycle coverage proving parallel one-endpoint claim serialization, stale-token finalization rejection, expired-lease abandonment/reclaim, and exactly one terminal attempt; fix the discovered claim transition by persisting the constraint-required fixed `attempt_started` outcome.
- `[x]` Complete endpoint update/destination replacement and mapping update/state APIs with optimistic versions, tenant authorization, audits, immutable destinations, active-limit serialization, and authorization-before-DNS ordering; fix secret activation ordering against partial unique indexes and preserve delivery outcome constraints during queued cancellation.
- `[x]` Expand the lazy Webhooks workspace with endpoint create/edit/state/secret-rotation controls, one-time disclosure acknowledgement, collection-level invalidation mapping create/state controls, delivery attempts, dead-letter replay, masked URLs, targeted query invalidation, and focused automated axe coverage.
- `[x]` Pass the complete 589-test API suite before the final management additions, then pass focused webhook contract/response/management/worker tests, PostgreSQL endpoint/mapping lifecycle tests, authorization-before-DNS operation tests, worker/environment tests, all workspace type checks, worker/web production builds, Docker worker image build, and a live healthy Compose worker readiness check.
- `[x]` Add scope/filter-bound keyset pagination for endpoint, mapping, delivery, and attempt lists, including malformed/cross-scope/changed-filter rejection and a real two-page PostgreSQL mapping traversal.
- `[x]` Add deterministic attempt orchestration coverage for idle/recovery, exact bytes/dual signatures, 2xx, retryable HTTP/network, bounded `Retry-After`, permanent HTTP, redirect, destination-policy, crypto configuration, exhaustion, and telemetry; add adapter-level pinned TLS/SNI/address/path/timeout/error/response-discard coverage and worker HTTP health tests.
- `[x]` With developer authorization, drain 10,155 existing supported outbox rows while outbound delivery remained disabled. Two valid historical schema events with 146/180 changed nodes exposed and corrected an undocumented 100-node contract assumption; the approved profile now permits 1,000 stable field IDs/tags within the unchanged 128 KiB cap. Reconciliation reports 10,154 canonical external events, one internal completion, zero pending supported rows, zero missing events, and zero deliveries.
- `[x]` Replace serial per-event dispatcher persistence with bounded batch projection insertion, one event-time interval subscription query (including historically closed intervals), conflict-safe bulk fan-out, and one processed update. The cleaned dedicated 10,000-event no-endpoint profile passes in 3,625 ms and a post-hardening repeat passes in 4,817 ms versus the ≤30 s target, with exact reconciliation and zero leaked load rows; evidence is in `apps/worker/load/m11-baseline-2026-08-13.md`.
- `[x]` Remediate the newly published `nanoid <3.3.18` advisory through the pnpm override/update workflow; production and full audits report no known vulnerabilities.
- `[x]` Pass refreshed `pnpm run ready`: 608 API, 109 server, 115 web, 12 environment, and 2 worker tests (846 total), coverage, formatting/lint, all package type checks, and all production builds. API coverage is 88.87% statements/74.46% branches; attempt orchestration is 96.51% statements/81.81% branches, pinned transport 92.75%/93.33%, cursor 98.29%/90.90%, and worker repository 81.01%/78.84%.
- `[x]` Rebuild/recreate the current worker Docker image and verify healthy readiness with delivery disabled. Final read-only catalog/reconciliation reports 12 migrations, all eight M11 tables, zero unvalidated constraints/invalid indexes, 10,154 canonical events, zero missing/pending/deliveries/started attempts/expired leases/non-idle external transactions, and `git diff --check` passes.
- `[x]` Pass the secret-safe Docker cross-image key-continuity gate: a separately built server image creates ciphertext, the worker decrypts it across process restart, a rebuilt worker reads both generations after active-key rotation, removal of the still-referenced old key returns readiness 503, current image histories/logs contain neither ephemeral key, load files are absent, and fixture cleanup restores a healthy disabled worker with zero deliveries/started attempts.
- `[x]` Pass all four controlled-TLS attempt gates through the real crypto/signing/pinned-transport/PostgreSQL path: 10,000 healthy fan-out attempts in 73,177 ms at 100% first-attempt success; one endpoint sustains 25.61 attempts/s with 20 ms receiver latency; nine healthy endpoints finish in 302 ms beside one 10-second endpoint; and 5,000 retryable failures each schedule exactly once within the 15–29 second first-attempt jitter window without hot polling. Every profile remains below 256 MiB heap growth and cleans all fixtures/leases/transactions.
- `[x]` Correct the live Node 24 pinned-lookup `all: true` shape and use one private non-keepalive HTTPS agent with a bounded 100-session TLS cache. Every attempt still opens a new connection and executes its validated pinned lookup; bounded session resumption is required to retain the approved one-endpoint throughput target.
- `[x]` Pass combined multi-process contention: one sustained producer, two dispatchers, and two attempt processes reconcile 1,000 events, 3,000 unique deliveries/attempts, equal 1,500-delivery fixture shares across two projects, zero duplicates/waiters/expired leases, and complete cleanup; maximum observed queue latency is 74,503 ms without an M11 workspace fairness claim.
- `[x]` Pass deterministic PostgreSQL crash/lifecycle-race coverage for parallel dispatch/claim, lease abandonment and reclaim, stale-token rejection, guarded finalization, and disable/subscription/destination cancellation; pass a live PostgreSQL restart with exact authority preservation and worker readiness recovery.
- `[x]` Add the developer-approved closed `webhook.replay.user` policy at 30 commands/minute with burst 5; a stable 429 is enforced before replay persistence and covered by contract/operation tests.
- `[x]` Apply the developer-approved behavior-led management-repository coverage amendment: 92.76% statements with explicit lifecycle/authorization/conflict/pagination/replay/cancellation outcomes and recorded 46.66% defensive branch coverage instead of artificial driver-corruption mocks. Worker repository coverage is 97.63% statements/80.59% branches and passes its original gate.
- `[x]` Reconcile the Webhooks workspace against the approved manual-review UX after the first handoff exposed omissions: add subscription replacement, mapping edit plus exact entry/locale scope, system-tag preview, endpoint rotation/outcome/dead-letter summaries, fixed overlap time, consequence confirmations, URL-backed delivery filters, keyset load-more controls, complete delivery metadata, content-free canonical event detail, paginated attempts, and idempotency-aware replay confirmation. Extend the management output with safe event/summary metadata and focused interaction, accessibility, route-search, and PostgreSQL assertions.
- `[x]` Pass refreshed `pnpm run ready`: 609 API, 109 server, 117 web, 12 environment, and 2 worker tests (849 total), formatting/lint, all type checks, coverage, and production builds. API coverage is 90.15% statements/74.40% branches; the management repository is 93.00%/48.49%, attempt orchestration is 96.51%/81.81%, pinned transport is 93.50%/94.11%, webhook cursor is 98.29%/91.30%, and worker repository remains 97.63%/80.59%.
- `[x]` Pass production/full audits with no known vulnerabilities, `git diff --check`, refreshed server/worker/web Docker builds and healthy runtime checks, image load-file absence, and final read-only catalog/reconciliation: 12 migrations, eight M11 tables, zero unvalidated constraints/invalid indexes/missing or pending events/enabled endpoints/test fixtures/mappings/deliveries/attempts/expired leases/non-idle external transactions. The canonical event count is 10,158 after four legitimate publications during final testing.
- `[x]` Validate live delivery through Webhook.site, then harden the adjacent network boundary without relaxing SSRF policy: typed retryable DNS-resolution failures, a two-second resolver deadline, an independent three-second TCP/TLS establishment deadline inside the existing ten-second total bound, send-time pinned-address lookup, and explicit DNS-mutation/rebinding coverage. The 31-test focused destination/transport/attempt suite and API type check pass.
- `[x]` Create the private developer-only `tools/webhook-test-receiver` workspace package with raw-byte Standard Webhooks verification, active/retiring secret overlap, exact allowlisted content-free event validation, deterministic success/retry/rate-limit/permanent/redirect/slow/idempotency scenarios, atomic signature-free capture storage, reports, Docker health, and named/Quick Cloudflare Tunnel configuration/scripts. Its 15 local deterministic tests and 94.00% line/71.58% branch coverage participate in root readiness while live tunnel checks remain opt-in; package checks/build/audit, the in-repository Docker build, container health, and image secret/data-absence inspection pass. A free temporary Quick Tunnel passed public A/AAAA, Cloudflare edge TLS, synthetic signed delivery, and one real worker `cms.entry.published` delivery with exact verified/responded HTTP 204 receiver evidence and one succeeded database attempt. The temporary endpoint was disabled, the tunnel removed, and local secret/capture artifacts cleaned. The package is excluded from production Docker contexts/manifests; stable named activation still requires a developer-owned domain.
- `[x]` Complete the public event payload minimization review. Keep version 1 unchanged: every field supports CloudEvents interoperability, direct scope, idempotency/ordering, exact publication/schema lookup, compatibility, changed-field processing, or action-ready invalidation; bounded duplicate IDs avoid URI parsing and no content, actor, display-name, credential, destination, or request authority is exposed.
- `[x]` Assign production webhook-worker egress filtering, cloud metadata hardening, and validator-bypass production-topology tests to M15 without weakening M11 application controls.
- `[x]` Pass final `pnpm run ready` with 613 API, 109 server, 117 web, 15 external-receiver, 12 environment, and 2 worker tests (868 total), 90.14% API statement/74.44% branch coverage, formatting/lint, all package type checks, coverage, and production builds. Production/full audits report no vulnerabilities; rebuilt server/web/worker images exclude the receiver and are healthy, return HTTP 200 readiness, contain no secret/load environment files, and the delivery-enabled worker has zero pending supported outbox rows, queued work, started attempts, expired leases, or known test users.
- `[A]` The developer completed manual review, approved M11, and committed it as `fef7205` (`feat(m11): publication events, webhooks, retries, and invalidation`) on 2026-08-21. A stable named Cloudflare hostname remains optional and is not an M11 completion requirement.

## Post-M11 repository structure normalization

- `[x]` Record the developer-authorized hybrid test-placement decision in `knowledge_base/decisions/repository-test-structure.md`: focused single-owner tests remain colocated, broader integration/contract/accessibility suites use categorized workspace-owned `test/` directories, and future cross-workspace suites use private `tools/*` workspaces.
- `[x]` Move all 12 API PostgreSQL/Redis integration files to `packages/api/test/integration/services/`, all three server HTTP/application suites to `apps/server/test/integration/`, the broad web suite to `apps/web/test/accessibility/`, and classify the receiver as one colocated unit file plus contract/integration/support directories. The repository now has 91 colocated focused tests, 17 integration tests, two contract tests, one broad accessibility test, and zero integration tests under `src/`.
- `[x]` Add package-owned targeted `test:unit`, `test:integration`, `test:contract`, and `test:accessibility` commands with root Turborepo delegation while preserving complete `test`/coverage behavior.
- `[x]` Add the repo-wide `check:structure` gate to enforce singular categorized test directories, reject integration tests under `src/`, reject anonymous root test trees, and prevent production source imports from test-only modules.
- `[x]` Keep production outputs test-free, including an explicit receiver build exclusion; the receiver build contains zero test artifacts.
- `[x]` Pass targeted type, unit, integration, contract, and accessibility gates plus final `pnpm run ready` with the unchanged 868-test total, formatting/lint, structure enforcement, coverage, production builds, and `git diff --check`. The external worker remained stopped throughout database integration/coverage, and final reconciliation reports zero pending supported outbox rows, active deliveries, or started attempts.
- `[A]` The developer reviewed, approved, committed, and pushed the repository structure normalization as `fe69a76` (`refactor(repo): normalize test structure and ownership`) on 2026-08-21. Milestone 12 remains unstarted.

## Post-M11 agent context normalization

- `[x]` Replace the accumulated milestone journal in `context.md` with a concise zero-context entrypoint containing discovery order, truth reconciliation, stack/workspace boundaries, non-negotiable invariants, one precise M0–M11 capability table, architecture landmarks, a selective decision map, validation baseline, and next scope.
- `[x]` Update session, source-of-truth, decision, documentation, and repository-agent rules so agents inspect current implementation first and read only decisions/learnings relevant to the task's actual dependencies.
- `[x]` Preserve the authority distinction: code/tests/configuration/migration history describe current executable behavior, while product/PRD/rules/active criteria/relevant approved decisions govern intended behavior and constraints; drift must be reported rather than hidden.
- `[A]` The developer reviewed, approved, committed, and pushed the agent context normalization as `18618d4` (`docs: streamline agent context and exploration rules`) on 2026-08-21. Milestone 12 remains unstarted.

## Milestone 12 checklist — design approval gate

- `[x]` Re-read the product vision, CMS PRD, every mandatory rule, current context, M12 criteria, status/tracker, and relevant implementation learnings.
- `[x]` Verify clean synchronized Git state and reconcile the committed M11/post-M11 baseline at `f06ae1c`.
- `[x]` Load and apply materially relevant Effect, Better Auth, Express, security, Drizzle/PostgreSQL, TanStack, shadcn, React, Turborepo, Portable Text, and accessibility guidance.
- `[x]` Read the approved M1–M6 and M9–M11 contracts that M12 consumes, plus the repository test-ownership decision.
- `[x]` Inspect current public Delivery/Preview OpenAPI generation and HTTP routes, webhook event/verifier contracts, published-schema authority, credential/auth boundaries, runtime Layers, package exports/manifests, portal absence, and test seams.
- `[x]` Research OAuth device authorization, Better Auth OAuth Provider compatibility, explicit JSON Schema/OpenAPI targets, package release/provenance, compatibility checking, and secure CLI credential storage.
- `[A]` Developer selected scoped OAuth device authorization for CLI login, accepting an aligned Better Auth 1.7.x/OAuth Provider design subject to migration and regression gates.
- `[A]` Developer selected release-ready SDK/CLI packages, pack/dry-run tests, Changesets, and trusted-publishing-ready configuration without an automatic first npm publication in M12.
- `[x]` Reconcile the missing public schema surface by proposing an explicitly allowlisted Tooling API v1 rather than exposing dashboard oRPC.
- `[x]` Propose the complete portal, public registry, OAuth, Tooling API, schema projection, CLI, generator, lock, SDK, webhook helper, versioning, release, security, observability, migration, and test design in `knowledge_base/decisions/m12-developer-portal-and-generated-tooling-design.md`.
- `[A]` Developer approved the complete M12 design and explicitly authorized implementation on 2026-08-22.
- `[x]` Upgrade all catalog consumers from Better Auth 1.6.26 to 1.7.1 through pnpm and add the official `@better-auth/oauth-provider` 1.7.1 plus its exact required peer dependencies; deduplicate compatible transitive versions so plugin/core types share one authority.
- `[x]` Review package provenance, MIT licensing, publish contents/scripts, installed declarations, OAuth/device/JWT options, Better Auth's 1.7 issuer migration guide, and production TLS/device-approval requirements. Production and full dependency audits report no known vulnerabilities.
- `[x]` Add a disabled-by-default OAuth device rollout gate, canonical Tooling resource validation, 10-minute access/device lifetimes, 30-day rotating refresh authority, exact scopes/resource, fixed official CLI identity, closed dynamic/client/resource management, JWT signing, and source-controlled browser routes.
- `[x]` Update Drizzle authority for all 13 merged Better Auth models: the 1.7 account issuer/compound identity, seven OAuth Provider models, device codes, and JWT keys. A read-only schema comparison confirms every required plugin field plus nullability/default/field uniqueness.
- `[x]` Keep OAuth/device routes disabled until migration and explicit rollout, preventing pre-migration OAuth-table access. Environment tests pass (16), all workspace type checks pass, formatting/structure checks pass, and production/full audits pass; Better Auth core database tests now wait on the required issuer migration.
- `[x]` Complete the developer-controlled `0012_add_cli_oauth_device_authorization.sql` migration gate. The developer generated, manually corrected from the ignored draft, and applied the reinspected migration; the agent did not modify the real artifact or generate/apply migration commands. Post-application read-only verification reports 13 migration records, all 9 expected OAuth/device/JWT tables, all 7 existing accounts mapped to non-null `local:credential`, zero identity mismatches/collisions, zero unvalidated constraints, zero invalid/unready indexes, and empty OAuth/device/key authorities. The obsolete temporary draft was removed.
- `[x]` Restore the complete post-migration regression baseline: all 872 tests pass (API 613, server 109, web 117, environment 16, worker 2, webhook receiver 15).
- `[x]` Implement idempotent startup reconciliation for the fixed secretless native CLI client and its sole Tooling resource link, including exact device/refresh grants, source-controlled scopes, 10-minute access tokens, 30-day refresh authority, and fail-closed startup before listening.
- `[x]` Implement local JWT access-token verification and the shared Effect Tooling-principal authenticator: exact issuer/audience/client/authorized-party/scope/expiry checks, management-only `schema.read` fallback, and explicit Delivery/Preview credential denial.
- `[x]` Implement the authenticated `/device` approval UI with same-code/client/scope/resource display, phishing warning, explicit approve/deny, safe same-origin login return paths, and no plaintext token handling.
- `[x]` Cover rollout-disabled routes, idempotent client/resource authority, dynamic-registration denial, pending/approval/device exchange, audience-bound token verification, tamper rejection, refresh rotation/replay denial, typed OAuth dependency errors, and credential-family isolation. Workspace checks/types, web production build, production audit, and all 887 tests pass (API 617, server 113, web 124, environment 16, worker 2, webhook receiver 15). Read-only cleanup verification reports one exact official client/resource/link, one signing key, and zero device/token/consent/test-user residue.
- `[x]` Add the private `@framerfordevs/public-contracts` workspace with a closed four-entry Delivery/Preview/Tooling/webhook v1 registry, canonical OpenAPI 3.1/JSON Schema 2020-12 generation, local-reference/duplicate-operation/non-finite/internal-surface rejection, SHA-256 baseline authority, generated artifacts, immutable initial baselines, root drift checks, and server byte-equality delivery for existing public OpenAPI routes.
- `[x]` Define the Tooling v1 Effect response/error contracts and canonical four-route OpenAPI artifact without exposing workspace, dashboard oRPC, Better Auth, credential management, health, metrics, authoring, or operator surfaces. Registry, targeted API/server tests, formatting/structure, and all workspace type checks pass.
- `[x]` Resolve Tooling integrity-authority drift without another migration: reconstruct each immutable published revision, fail closed unless its canonical full-schema hash matches stored `schema_hash`, and only then derive the public projection and `contractHash` through `compileCollectionContract`. This verifies a superset of the public contract and avoids duplicate persisted authority.
- `[x]` Store the developer's future code-first schema/content authoring and local agent-editor proposal at `knowledge_base/proposals/m13-code-first-schema-and-local-agent-editor.md` without treating it as an approved design.
- `[x]` Sequence that proposal as future M13 and renumber client handover, production hardening, and visual-builder readiness to M14, M15, and M16. M13 discovery/design remains blocked until M12 is complete and the developer explicitly starts it.
- `[x]` Implement signed, principal/scope-bound Tooling cursors; OAuth-user and management-credential project/environment discovery; tenant/environment/CMS authorization; enabled-locale manifests; immutable revision reads; full-revision integrity verification; bounded repeatable-read transactions; content-free first-page audits; and closed Tooling quotas/errors.
- `[x]` Serve the exact four-route Tooling v1 HTTP boundary with GET/HEAD semantics, private ETags, no-store errors, bearer-only browser isolation, strict query/path decoding, bounded response serialization, released OpenAPI paths, and targeted operation/repository/HTTP tests. Authenticated management-credential HTTP coverage proves an empty published manifest, bodyless HEAD, stable private ETag/304, one content-free audit per first-page access, discovery denial, cross-project denial, revocation, and secret-free responses.
- `[x]` Add the public `@framerfordevs/sdk` workspace with bounded Delivery v1 and Preview v1 clients, exact Effect transport schemas, immutable-revision recognition, typed envelopes/errors, Standard Webhooks-compatible raw-byte verification, rotation/replay controls, and invalidation normalization. Its 10 focused tests, type check, and production build pass.
- `[x]` Add the public `@framerfordevs/cli` workspace with strict ancestor config discovery, bounded Tooling HTTP reconciliation, deterministic six-file generation and lock authority, stable-ID drift categories, transactional owned-directory commits/rollback, native OS keychain-only OAuth authority, RFC 8628 polling/refresh rotation, management-token CI fallback, strict commands/flags/JSON modes, and 32 focused tests including strict command parsing, generated TypeScript compilation and injected filesystem failures.
- `[A]` Developer selected MIT for the first public SDK/CLI releases on 2026-08-22; both packages now carry aligned MIT files/metadata, support matrices, public-only READMEs, ESM declarations/exports, Node 22 engines, provenance-ready publish metadata, and prepack build/type/test gates.
- `[x]` Add Changesets with one initial minor-release record while keeping version application and first publication developer-controlled. Reviewed local tarballs contain only dist declarations/modules, README, LICENSE, and package metadata; a clean isolated fixture resolves all exports, compiles under NodeNext, and executes the packaged `ffd` binary.
- `[x]` Add the separate prerendered `apps/developers` TanStack Start portal with an explicit public-content/search registry, overview/guides/security/versioning/changelog, lazy reference routes, closed route probes, security headers, responsive accessible navigation, and build-time exact public artifact emission guarded by immutable SHA-256 baselines. Fifteen public routes prerender and the landing bundle excludes internal contract source packages.
- `[x]` Complete real OAuth-user Tooling HTTP readiness with a dynamically rollout-enabled isolated fixture: device approval/token issuance, signed two-project continuation, environment discovery, a two-collection non-empty manifest, signed manifest continuation, immutable revision GET/HEAD/ETag/304, authorization before 304, exact first-page-only content-free auditing, and complete teardown all pass.
- `[x]` Add bounded Tooling observability: a dedicated low-cardinality HTTP route family; request metrics by closed endpoint, principal kind, outcome/status family, response-size bucket, manifest/list count bucket, and duration; plus OAuth-verification outcomes. No tenant, user, token, cursor, collection, locale, path, schema hash, or body becomes a metric label.
- `[x]` Record the deterministic local Tooling readiness baseline in `apps/server/load/m12-baseline-2026-08-22.md`: 10 alternating authenticated manifest/revision reads, 10/10 HTTP 200, every response within 1.5 MiB, and p95 357.01 ms under the complete server coverage run, below the existing 750 ms statement/readiness ceiling.
- `[x]` Complete the pre-amendment M12 automated readiness baseline. `pnpm run ready` passes with 957 tests and all participating coverage/build gates; contracts, formatting/lint/structure, type checks, production/full audits, Changesets status, and `git diff --check` pass. Rebuilt server/web/worker Docker images are healthy; root/readiness/login and exact Tooling artifact checks pass; OAuth remains rollout-disabled. The production Compose smoke now supplies an HTTPS Tooling resource identifier instead of restart-looping on the production TLS invariant.

### M12 developer-documentation amendment

- `[A]` Developer manual review rejected the prototype portal as the final developer experience: the canonical schemas and API-server Scalar references exist, but the portal's short custom pages do not provide a Better Auth/Next.js-style onboarding, concept, SDK, CLI, webhook, guide, troubleshooting, and reference journey.
- `[A]` Developer selected self-hosted Fumadocs integrated into the existing TanStack Start `apps/developers` application, source-controlled MDX, self-hosted static search, and canonical-artifact-backed secondary API references. Managed documentation/search/CMS services and a new Next.js/Astro application are excluded.
- `[x]` Research current Fumadocs TanStack Start, Vite MDX, static prerender, self-hosted search, OpenAPI, package/license, and dependency compatibility. Current releases align with repository React 19.2, TanStack Router 1.x, Vite 8, and Tailwind 4; Fumadocs is MIT licensed.
- `[x]` Amend the approved M12 design, milestone criteria, progress state, and current context before implementation.
- `[x]` Complete the bounded Fumadocs compatibility slice in the existing TanStack Start app. Reviewed MIT packages are pinned in the developer workspace; React 19.2/TanStack Router 1/Vite 8/Tailwind 4 types align; providers, Tailwind, typed async MDX, prerender, and self-hosted static search build successfully. Production/full audits report no known vulnerabilities.
- `[x]` Replace the prototype custom shell and `docs.ts` registry with Fumadocs MDX navigation, TOC, search, code components, responsive layout, and accessible loading/not-found behavior. The initial authored pages cover introduction, first-success setup, SDK, CLI/generation, and webhooks; the old custom content components and route are removed.
- `[x]` Prove the compatibility build and runtime slice: 15 routes/assets prerender, all 10 requested landing/docs/reference/search/spec URLs return HTTP 200 with expected content types, the local static index is 177,809 bytes, all four artifact routes remain emitted, developer types and 3 public-boundary tests pass, and contract drift checks pass.
- `[x]` Author and validate 27 current-product MDX pages across Get Started, Core Concepts, Content Modeling, Delivery, Preview, SDK, CLI and Code Generation, Webhooks, Guides, Troubleshooting, Reference, and API Contracts. Internal links are checked against the closed docs/reference route sets.
- `[x]` Add secondary lazy Delivery/Preview/Tooling OpenAPI references from exact canonical artifacts and a webhook reference rendered from canonical JSON Schema; all raw `/specs/**` bytes still match immutable baselines. Browser playgrounds are disabled for the read-only contract area.
- `[x]` Keep structural wire facts generated: API source tests prove all 3 rendered OpenAPI page path sets equal their canonical documents, the webhook page derives event types and complete schema from the canonical JSON artifact, and existing SDK/CLI/package compilation gates remain authority for exported code examples.
- `[x]` Pass public-only route/search/link probes, MDX compilation, 36-route prerender, 571,523-byte self-hosted search export, CSP/security runtime smoke, representative axe coverage, canonical artifact equality, bundle measurement, dependency audits, and complete `pnpm run ready` with 962 tests.
- `[x]` Retain API-server Scalar UIs as non-canonical compatibility/diagnostic references for now rather than remove a working public path during M12. The Fumadocs portal is canonical; M15 may add redirects after final production origins are approved. Machine-readable API-server OpenAPI endpoints remain unchanged.
- `[A]` The developer completed renewed manual review, approved M12 with OAuth intentionally rollout-disabled, committed it as `4e87908` (`feat(m12): developer portal and generated tooling`), and pushed it to `origin/main` on 2026-08-23.

## Milestone 13 — code-first authoring and local editor

**Status:** `[A]` Complete and developer-accepted. All 13 manual scenarios, builder retirement, final 1,184-test readiness, release staging, and approved stale-fixture cleanup are complete. Package publication/versioning, production OAuth rollout, production configuration, commit, and deployment remain separate release actions. The approved design is `knowledge_base/decisions/m13-code-first-authoring-and-local-editor-design.md`.

### Completed implementation

- `[A]` **Design and dependency gates:** The developer approved the M13 authority model and phased implementation. Tier 1 uses exactly `typescript@6.0.3`; Tier 2 uses QuickJS Emscripten `0.32.0` only as an explicit, experimental, default-off generator.
- `[x]` **Schema package and safe extraction:** `@framerfordevs/schema` defines and validates the complete dependency-free 18-kind project grammar, nested roles, references, and enum source identities. The Tier 1 worker statically reduces a bounded, symlink-safe local TypeScript graph before credentials and never transpiles or executes project modules. Hostile packaged tests prove environment, file, and network isolation.
- `[x]` **Experimental schema generation:** `ffd schema build [--check]` runs only in a credential-blind QuickJS worker with bounded local modules, CPU, stack, graph, and output. It atomically owns deterministic Tier 1 output and a content-safe input manifest, rejects Node/npm/bare/dynamic imports, and always reports `memoryLimitHard: false`. Schema plan, push, and editor only verify this manifest; they never invoke Tier 2.
- `[x]` **Stable schema authority:** Server-owned collection, field, and enum IDs are reconciled through immutable source keys. Per-revision `structureHash`, `schemaHash`, `contractHash`, and the project structural manifest remain distinct; `candidateStructureHash` is `null` until new identities are allocated. Read-only plan and locked apply preserve IDs, classify exact changes, require exact acknowledgements, and atomically write immutable revisions, heads, audits, outbox events, and replay receipts.
- `[x]` **Database authority:** Developer-generated/applied migrations `0013_add_code_first_authoring_authorities` and `0014_normalize_authoring_actor_foreign_keys` add source/hash/apply authority and exactly-one user-or-credential attribution with tenant-qualified credential foreign keys. Credential writes and replay are attributed to the credential, never its issuer.
- `[x]` **Authoring v1:** Twelve bearer-only, originless, redirect-free, `no-store` paths cover schema export/plan/apply, role-projected generated forms, immutable presentation get/publish, entry list/get/create/rename/save, and exact-locale status/validate/publish/unpublish. Inputs and outputs are recursively exact and bounded; authorization uses operation-specific OAuth grants or management scopes. Canonical OpenAPI SHA-256: `d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205`.
- `[x]` **HTTP and repository proof:** Successful and adversarial fixtures cover schema, presentation, content, and publication mutation; replay/no-op/conflict/stale authority; exact acknowledgements; credential lifecycle and attribution; tenant/locale non-enumeration; malformed/oversized/traversal/query/origin requests; rollback; and residue reconciliation. Immutable publication tests use transaction-bound repositories rather than deleting protected artifacts.
- `[x]` **Authoring SDK:** Promise and Effect clients strictly decode every Authoring route and expose current-authority save, validate-then-publish, repeated-cursor-safe pagination, and bounded ordered import helpers. Transport permits only HTTPS or explicit localhost, rejects redirects/origin escape, bounds bytes/timeouts, and never hides optimistic conflicts.
- `[x]` **CLI schema and content workflows:** Config v2, schema lock v2, `schema export/plan/push/build`, and `entry list/get/create/update/publish/unpublish` are implemented with exact environment/locale/revision authority. Project-contained owned files reject symlinks, escape, mutation overflow, or unauthorized modification. Mutation and apply journals contain only operation, command ID, and fingerprint; credentials, schema/content bodies, values, API keys, and actor data are excluded.
- `[x]` **Presentation authority:** Presentation-only publication edits labels, help, enum labels, roles, ordering, tabs, groups, columns, sidebar, and placements while preserving `structureHash` and `contractHash`. It advances immutable revision authority, serializes with code apply, rejects stale plans/commands, and atomically writes presentation, audit, and outbox state. The dashboard presentation editor includes conflict preservation, explicit reload, navigation warnings, interaction tests, and axe coverage.
- `[x]` **Shared content form:** Private browser-safe `@framerfordevs/content-form` owns the exhaustive controlled renderer, recursive shared/localized values, defaults, stable-ID/API-key adapters, tabs/groups/sidebar, role projection, local focus/IDs, server issues, and lazy Portable Text. Dashboard entry and schema-preview forms use it; the package contains no credentials, fetching, routing, policy, persistence, browser storage, app aliases, or server-heavy imports.
- `[x]` **Local editor:** `ffd editor` ships a bundled React/TanStack Query UI for collection/entry/locale navigation, create/rename/save, validation, exact-locale publish/unpublish, Preview templates, conflict reload, and unsaved-change guards. It watches only verified Tier 1 graph files, polls hosted authority, enables writes only on structural match, and otherwise projects the last valid local schema read-only through source identity, including unpublished fields without allocating authoritative IDs.
- `[x]` **Loopback security and lifecycle:** The editor binds only ephemeral `127.0.0.1`, uses a fragment-delivered 256-bit session challenge and exact operation union, and rejects non-loopback peers, Host/Origin confusion, queries, traversal, redirects, unsupported routes/methods/content types, and oversized bodies. Strict CSP/frame/COOP/CORP/referrer/no-store headers apply. Hosted credentials stay in Node: management authority is removed from `process.env`, opener children receive a sanitized environment, SDK clients are request-local, and shutdown nulls token authority before cleanup.
- `[x]` **Packaging and controlled launch:** Built assets enforce split content-form and nested Portable Text chunks, one React/React DOM `19.2.8` resolution, a sub-500 kB initial-JS budget, and forbidden-secret scans. Packaged tests exercise pre-auth failures, every schema/content CLI workflow, controlled loopback launch/session/form reads, token isolation, and clean SIGTERM shutdown. A clean offline install loads reviewed schema, SDK, and CLI tarballs; nothing was published.
- `[x]` **Observability and redaction:** Closed named spans and bounded metrics cover Authoring authentication, all 15 HTTP operation classes, schema decode/plan/apply, source resolution, content translation, draft/publication wrappers, and editor proxy operations. Sentinel tests prove sensitive schema, presentation, content, command, credential, URL, email, and token data is excluded from logs/traces/metrics/errors/generated files; audits and outbox retain only approved identifiers and bounded metadata.
- `[x]` **Reliability and query evidence:** PostgreSQL plans cover source/current-head/replay/credential paths using approved equivalent index families. Concurrency and failure injection cover project-lock schema/presentation serialization, shared/localized drafts, exact-locale publication, every schema and presentation transaction stage, initial draft creation, publication stages, and every owned-file commit stage. A deterministic 256-case token fuzzer plus pathological parser/evaluator termination corpus passes without side effects.
- `[x]` **Measured performance and browser evidence:** Representative HTTP load records plan p95 137.01 ms, no-op apply p95 183.37 ms, and the valid 50-collection/2,452-field boundary at 341,165 request bytes in 1,733.79 ms during complete coverage. Editor loopback p95 remains below 25 ms in the complete run. Controlled headless Firefox proves fragment removal, keyboard input/focus, conflict preservation and explicit reload, exact publish/unpublish, valid/matched status, a 500 px responsive viewport without overflow, named controls, unique IDs, and no hosted-content persistence.
- `[x]` **Documentation and release staging:** The portal now has task-oriented code-first schema, local-editor, and content-automation guides; schema/SDK examples compile; schema/SDK/CLI READMEs are current; and the M13 Changeset stages minor schema, SDK, and CLI releases. Publication and version application remain developer-controlled.

### Manual acceptance and separate release controls

- `[x]` Developer approved exact canceled-run cleanup. With the worker stopped, one guarded transaction removed 10 test users/projects, eight workspaces, six draft entries, 16 outbox rows, 14 derived publication events, and 178 audits; it removed zero immutable content-publication artifacts. Post-cleanup residue and invariant checks pass, and the worker is healthy.
- `[x]` **Manual scenario 1:** The developer accepted dashboard-authored export after reviewing readable stable source identities, exact field/enum configuration, and UUID/hash isolation in lock v2. The first attempt correctly failed closed against a stale active Compose server; activating a current server/dashboard runtime restored strict SDK/server parity. A developer-requested clean local reset and re-export also passed.
- `[x]` **Manual scenario 2:** The developer accepted presentation-only publication after a fresh export/generate baseline. Source, structure hash, contract hash, generated client/index, and normalized type shape stayed exact; only the expected immutable revision ID/sequence advanced. Review exposed and resolved recursively exact Tooling JSON normalization for absent enum/money/rich-text options and the config-v2 authoring/generated lock-path collision. Clean export/generate/presentation/export/generate passes without `--force` using separate authoring and generated locks.
- `[x]` **Manual scenario 3:** The developer accepted a code-only optional localized `teaser` field after exact one-change plan/push, server stable-ID allocation, immutable revision advancement, management-credential attribution, and five-field dashboard/local-editor parity. Review exposed and resolved the editor's invalid hardcoded `en-US` default by loading bounded hosted locale authority and defaulting to the first hosted locale. A real retained-journal conflict also exposed `Effect.runPromise` failure wrapping; the loopback now unwraps typed journal failures and reports `409 EDITOR_COMMAND_PENDING` instead of a false upstream 502. After exact server-command reconciliation and developer-approved removal of only the proven local create journal, entry `01a046d2-6d46-711c-8cca-12cb0f924e35` saved and published in exact locale `en`; the developer confirmed side-by-side dashboard parity. Read-only PostgreSQL evidence records localized draft version 2 and current publication sequence 1 against schema revision `441fde1f-07b2-4720-9171-a6e4c08d12e3` and contract hash `adee849e…`, attributed to a credential.
- `[x]` **Manual scenario 4:** The developer changed field source key `teaser` from API key `teaser` to `summary`. Plan emitted exactly one breaking `field.api_key.updated` change with no issues; unacknowledged push exited 2 and returned exactly acknowledgement `a319a80a…`. The exact acknowledged push applied once under command `611f1dcc-9009-4521-a60c-01c2a89a9cdd`, advancing the collection to sequence 7/revision `82d35537-2701-418c-a34f-7d010ecfc4b9`. Read-only proof confirms field ID `da885d6d-0b07-48c6-8ef6-8ee50cc5d5d9` remained stable, both current/revision API keys are `summary`, the revision records one breaking change, credential attribution is honest, and no apply journal remains.
- `[x]` **Manual scenario 5:** One complete-project plan resolved new `authors.featured_topic → topics` and `topics.lead_author → authors` references with both collection IDs/hashes correctly unallocated and no issues. The developer supplied exactly the two required-field acknowledgements and applied command `110bceb0-bd86-4528-b0bc-0b40ee063ac6`; existing `articles` remained unchanged while both new collections received sequence-1 immutable revisions. Read-only proof confirms all four server-generated field IDs, reciprocal target collection IDs, credential attribution, zero mismatched targets, and no pending apply journal. Dashboard review exposed two companion-boundary defects: code-created collections omitted the default protected Delivery configuration, then the legacy management DTO rejected honest credential attribution. Future apply creates protected configuration atomically; Delivery responses now expose nullable user/credential actors and user updates clear prior credential attribution. The developer approved an exact two-row local repair, focused PostgreSQL/API/dashboard/type/build evidence passes, current image `f49e6eca…` is healthy, and the developer confirmed both retained builder pages load.
- `[x]` **Manual scenario 6:** Under explicit local-only approval, OAuth Device Authorization was temporarily enabled against an exact HTTP development-mode review container; native device login and secure-store logout passed. OAuth schema plan/read succeeded, then an exact-locale entry-list denial exposed missing locale context in user policy pre-resolution. All exact-locale content paths now resolve enabled locale authority before user authorization; generated form reads retain project/role projection while exact writes remain locale-gated. OAuth then successfully listed, updated, and republished the English entry, with PostgreSQL proving user—not credential—attribution. Read-only management credential `test-management-cred` succeeded only for schema export and failed non-enumeratingly for schema plan, content read, draft update, and publication. OAuth was restored disabled, the normal production-mode image `dcf6bf08…` is healthy, native authority was removed, and developer-approved guarded cleanup deleted exactly two review refresh rows plus two expired device-code rows while preserving the older M12 refresh row.
- `[x]` **Manual scenario 7:** With developer approval, a temporary ngrok HTTPS tunnel and hardened receiver verified a real exact-locale lifecycle on new Topics entry `01a047fe-d5ac-75b9-b552-a040af3f5eb3`. CLI create persisted required English content atomically; a standalone built-SDK script performed optimistic update and validate-then-publish; public Delivery returned sequence 1 and `Scenario 7 updated`; CLI unpublish advanced state and Delivery then returned exact `404 NOT_FOUND`. Signed content-free `cms.entry.published` and `cms.entry.unpublished` CloudEvents verified exact project/environment/collection/entry/locale/schema/publication authority and returned 204. The publication succeeded after receiver-proven retries caused by an already-bound local receiver port; unpublish succeeded on attempt 1. Topics was restored protected, the endpoint disabled, ngrok stopped, exact local secrets/captures removed, no command journal remains, and all primary services are healthy.
- `[x]` **Manual scenario 8:** The developer opened the English Scenario 3 entry in `ffd editor`, retained an unsaved local title while a dashboard save won concurrently, observed the optimistic conflict without losing local input, explicitly reloaded the hosted winner, then saved `Scenario 8 recovered in local editor`. Read-only PostgreSQL confirms current localized draft version/sequence 5, exact recovered value, and management-credential attribution. Refreshing the loopback tab then failed closed as designed because the fragment-only challenge had been consumed and no browser session authority is persisted; dashboard refresh remains independent.
- `[x]` **Manual scenario 9:** A local-only optional localized `preview_note` field appeared live in the Scenario 3 form without planning/pushing or server ID allocation. The editor clearly reported structural drift and disabled create/rename/save/publish/unpublish while the dashboard correctly omitted the field. Removing only that local block caused the running watcher to remove the field, return to matched authority, and re-enable writes without restart or hosted mutation.
- `[x]` **Manual scenario 10:** DevTools confirmed the one-time challenge disappears, browser traffic remains on the ephemeral loopback origin, operation requests contain no hosted Authorization/Cookie authority, and browser storage contains no hosted credential/content; hard refresh remains fail-closed. Local scans found no credential-like material or reviewed hosted content in editor-owned persistence, generated output, or browser assets. Additional Linux `/proc` inspection found that deleting an initially exported environment variable cannot erase its original OS environment bytes. The editor now supports bounded `--token-stdin` after pre-auth preparation and rejects ambiguous exported management authority. Relaunch through a non-exported shell variable proved credential keys absent from initial OS environment and credentials absent from process arguments. Focused editor tests (36), type checks, production build, shutdown, no-journal, and healthy-service evidence pass.
- `[x]` **Manual scenario 11:** After explicit parity-based retirement approval, the developer confirmed that the hosted dashboard no longer exposes collection creation or collection/field/layout/schema-publication controls. Collection navigation, read-only current structure/revision authority, content editing, the complete Presentation editor, and Delivery configuration remain usable. Direct authenticated legacy mutations fail with stable `410 DASHBOARD_SCHEMA_AUTHORING_RETIRED`, while anonymous requests retain 401 precedence and no retired mutation reaches a repository.
- `[x]` **Manual scenario 12:** The developer followed the live portal's Authoring overview, code-first schema, local-editor, content-automation, CLI, and SDK journey in order. It coherently matched the completed export/plan/acknowledge/push, hosted-locale editor, drift/conflict/security, OAuth/management grants, standalone SDK publication, Delivery, webhook, and troubleshooting experience without requiring raw API contracts as the primary guide. The temporary portal process was stopped after review.
- `[x]` **Manual scenario 13:** In an isolated credential-free fixture, explicit Tier 2 factories/helpers, loops, spread, local modules, and reciprocal references built deterministic static Tier 1 bytes exactly matching the accepted source and stable-ID authoring-lock file hash. The content-safe manifest records two input hashes, output hash, TypeScript `6.0.3`, QuickJS runtime, and honest `memoryLimitHard: false`. Input-only drift made check exit 2 and authenticated plan fail pre-auth with exact `CLI_SCHEMA_BUILD_STALE`; restoration returned check to accepted. Seven focused opt-in/isolation/hostile-import/nontermination/capability tests pass. The developer accepted Tier 2 only as experimental, explicit, default-off, and non-production.
- `[x]` All 13 manual scenarios are accepted; code-first/local-editor parity and post-retirement dashboard capability boundaries are confirmed.
- `[x]` The developer approved dashboard-builder retirement after parity; the implementation and stable gone/code-authority behavior were revalidated before scenario 11.
- `[A]` The developer accepted and closed Milestone 13.
- `[x]` Keep package versioning/publication, OAuth production rollout, production configuration, commit, and deployment outside M13 acceptance as separate release actions.

### Blockers and developer-controlled gates

- QuickJS issue `justjake/quickjs-emscripten#255` blocks only Tier 2 production/default activation and hard-memory proof. Normal M13 work and acceptance remain unblocked while Tier 2 stays experimental/default-off and reports `memoryLimitHard: false`.
- Developer-approved stale-fixture cleanup is complete. The first guarded transaction rolled back unchanged when a workspace-level audit foreign key exposed 16 additional scoped rows; after renewed approval, the final transaction removed the exact graph with 178 total audits and no immutable content-publication artifacts.
- Dashboard-builder retirement, all manual scenarios, and milestone acceptance were developer-approved and completed. OAuth production rollout, package versioning/publication, commits, production configuration, and deployment remain developer-controlled release actions and have not been performed.

### Database state

- The live database records 15 migrations through developer-applied `0014`; no further M13 database change is approved or currently known to be required.
- Post-cleanup read-only verification reports zero matching stale users, matching application/database structure hashes, and zero source, enum, actor, head, foreign-key, apply-receipt, or webhook-aggregate violations. Supported outbox projection is current, no worker lease is expired, and the worker is running healthy.
- Migration SQL and snapshots are immutable. The agent inspected and verified them but did not generate or apply them.

### Current validation evidence

- **Complete workspace baseline:** After retirement and the final locale-availability authority correction, `pnpm run ready` passes end to end with 1,184 tests, 15 type-check tasks, canonical contract drift checks, formatting, lint, repository structure, coverage, and all eight builds. Reported workspace suites include 13 content-form, 18 SDK, 105 CLI, 723 API, 138 server, and 115 dashboard tests. The independent worker was stopped for shared-database testing and restarted healthy afterward.
- **Focused retirement and authority evidence:** 19 focused API tests, 22 dashboard/router/accessibility tests, and the combined 78 platform/Authoring server tests pass. All nine authenticated legacy schema mutations return stable 410 responses; unavailable exact locales retain `LOCALE_UNAVAILABLE` after authorization while missing collections retain non-enumerating `NOT_FOUND` precedence. The prior detailed coverage baseline was CLI 75.34% statements/76.15% branches, editor-app 82.11%/72.20%, and API 88.39%/74.33%; the final full run passed every configured coverage threshold.
- **Package/API provenance:** Authoring OpenAPI remains exactly 465,278 bytes with SHA-256 `d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205`. Final tarballs are schema 8,286/34,205 bytes (9 files), SDK 29,119/210,637 bytes (16 files), and refreshed CLI 447,177/1,611,594 bytes (48 files); SHA-256 values are recorded under `tmp/m13-release-artifacts/`. Production and full audits report no known vulnerabilities.
- **Docker and bundle provenance:** Final local server image `sha256:d1d82e10c8c69de82215a512b2d6cb1f76c2bc8840bb99a94bb259a297595d52` and web image `sha256:4b217605e79e36c311aa602c14a8eea72bc2293cf590cf7ea279b754f138d1f5` are healthy with PostgreSQL, Redis, and the restarted worker. Prior image inspection proved the packaged schema runtime and absence of `.env`, auth/key material, Git, knowledge-base, or `tmp` files outside dependencies. Initial editor JS remains 480.16 kB raw/145.84 kB gzip; CSS 94.25/14.97 kB; selected-entry UI plus form 92.52/29.94 kB; Portable Text 625.90/194.33 kB nested-lazy.
- **Scenario-3 focused evidence:** Hosted-locale status/defaulting and real Effect journal-conflict regressions pass with the editor boundary/application suites: 27 tests, CLI and editor TypeScript checks, and the complete CLI/editor production build. The 1,192-test run remains the historical pre-retirement baseline; the authoritative final baseline is the later 1,184-test run above.
- **Readiness:** All 13 manual scenarios are accepted, builder retirement is complete, and the developer has accepted and closed M13. Only separately controlled release actions remain.

### Milestone 12 approved automated gate

- Formatting/lint/repository structure, contract baseline drift, all 13 package type-check tasks, `git diff --check`, Changesets status, production audit, and full audit pass.
- The complete workspace test run passes 962 tests: API 630, server 120, dashboard web 124, environment 16, worker 2, webhook receiver 15, public contracts 4, SDK 10, CLI 32, and developer portal 9.
- Coverage passes across all participating workspaces. API coverage is 89.97% statements and 74.70% branches; SDK is 82.69% statements/71.35% branches; CLI is 78.02% statements/83.85% branches with generator statements at 99.29%; dashboard web is 74.50% statements/79.58% branches; developer public-content authority is 99.11% statements. One earlier highly parallel API coverage run exposed an existing webhook integration isolation race, while standalone and final dependency-filtered coverage pass all 630 API tests.
- The full Turborepo production build passes for server, worker, dashboard web, SDK, CLI, webhook receiver, and developer portal. The portal prerenders 36 routes spanning 27 MDX documents, local search, landing, API-reference overview, 3 OpenAPI families, webhook schema, and exact static artifacts. Emitted artifact SHA-256 values equal all four immutable registry baselines.
- Developer-portal runtime smoke checks pass for landing, representative onboarding/concept/Delivery/Preview/SDK/CLI/webhook/troubleshooting pages, all 4 API references, local search, all 4 raw specs, CSP, Permissions-Policy, Referrer-Policy, nosniff, and frame denial. Focused axe coverage finds no detectable violations in the compiled first-success guide; accessible code regions receive content-derived labels.
- The measured Fumadocs landing initial CSS/JS asset set is 592,825 bytes minified/182,334 bytes gzip; the main docs page is 663,476/202,977 bytes and the read-only Delivery contract is 1,095,222/339,123 bytes. OpenAPI/Shiki weight remains route-specific and does not enter the landing route. The self-hosted static search export is 571,523 bytes for 27 MDX pages.
- Final SDK/CLI prepack gates pass. Reviewed tarballs contain 14 SDK and 12 CLI files, restricted to ESM dist modules/declarations plus README, LICENSE, and package metadata; no source maps, tests, fixtures, environment files, migration/knowledge-base content, or source files are present. A clean isolated NodeNext fixture installs both local tarballs, compiles every documented export family, and executes `ffd help --json`.
- The complete standard test/build/check/audit/package gate is green. The first final `ready` attempt exposed an unrelated five-second web accessibility-test timeout under concurrent coverage; its explicit ten-second test budget passes standalone and in the complete rerun. Turbo cancellation interrupted the concurrently starting Tooling fixture before teardown, so developer-approved transactional cleanup removed the two exact canceled/failed `m12-tooling` test graphs only after proving zero content publications; final read-only verification reports zero matching residue. The Tooling fixture now registers its idempotent teardown before its first write.
- All M12 automated proof and manual review are complete. The developer approved, committed, and pushed M12 at `4e87908`; OAuth rollout and SDK/CLI publication remain intentionally deferred developer-controlled release decisions.

### Milestone 10 approved completion gate

- `pnpm run ready`: pass end to end with formatting/lint, workspace type checks, coverage tests, and production server/web builds.
- 780 tests pass: 549 API/domain/PostgreSQL, 109 server, 113 web, and 9 environment tests.
- API coverage is 90.29% statements and 74.89% branches; Preview parser statements/branches/functions and compiler statements/functions are 100%, Preview repository coverage is 98% statements/81.57% branches, and Preview UI coverage is 95.89% statements/85.71% branches.
- Production and full dependency audits, `git diff --check`, Docker image secret-exclusion checks, service health checks, and final read-only PostgreSQL/credential invariants pass.
- All separate current, revision, distributed quota, Redis outage/recovery, oversized response/memory, concurrent save/read coherence, and parallel-audit load gates pass; accepted evidence is recorded in `apps/server/load/m10-baseline-2026-08-12.md`.
- The legacy active non-expiring Preview credential was replaced through audited controls by one acknowledged compliant 30-day credential and revoked; all temporary load credentials were revoked.
- The developer manually verified current and historical Gujarati Preview behavior, production separation, exact source metadata, validation/JSON behavior, navigation, and credential-free endpoint copying.
- The developer approved M10 and committed it as `aa177b5` (`feat(m10): preview API`). M10 required no database migration.

### Milestone 9 approved completion gate

- `pnpm run ready`: pass end to end, including formatting/lint, all package type checks, tests, coverage, and production server/web builds.
- 712 tests pass: 499 API/domain/PostgreSQL, 98 server, 106 web, and 9 environment tests.
- API coverage is 89.40% statements and 72.64% branches; the Delivery OpenAPI generator and Delivery contracts have 100% statement/branch coverage.
- Focused API, server, web, environment, Redis, publication dual-write, Delivery configuration/read/backfill, operation, HTTP/CORS/cache, and accessibility suites pass.
- Manual fixture entry authoring exposed and resolved two boundary defects: malformed reference strings are now rejected as typed validation before PostgreSQL UUID predicates, and edited controls immediately clear stale server-side field issues. Rebuilt Docker web/server services are healthy.
- Developer backfill apply report: 3 current heads, 3 collection-locale scopes, 0 invalid snapshots, 0 duplicate unique claims, 0 expected scalar projection rows, and 3 applied heads.
- Read-only post-backfill verification: no current scope lacks state, generation range is `1..1`, zero unexpected projection rows, and zero open non-idle transactions.
- `pnpm audit --prod`, `pnpm audit`, and `git diff --check` pass.
- Final read-only catalog verification reports 10 migrations, all four M9 tables, zero invalid constraints/indexes, zero collections without protected-by-default configuration, zero unintended public configurations, zero current scopes without generation state, zero M9 test users, and zero open non-idle transactions.
- With explicit developer approval, two stale pre-M9 failed-test workspace graphs (and their associated reader) were removed transactionally after proving they contained zero immutable publications/snapshots; read-only verification reports zero remaining identified users/projects and unchanged three current heads with complete generation state.
- The production-topology capacity gate passes: mixed latest/unique at 200/s reached p95 16.54 ms and p99 53.06 ms; indexed list at 100/s reached p95 24.45 ms and p99 31.90 ms; pinned expansion at 25/s reached p95 15.33 ms and p99 16.91 ms. All measured stages had zero errors and zero dropped iterations.
- The supplemental M9 load gates pass independently: conditional ETag traffic returned 6,001 measured 304s; weighted hot-credential traffic shared through Redis across two server processes returned 450 successes and 1,350 intentional credential 429s with the stable headers/envelope; a 15-second Redis hard outage returned 3,001 measured successes and recreated 41 bounded keys after automatic recovery; and 301 oversized list requests returned stable 413s.
- The oversized fixture was restored after each run to 10,000 current publications and a 4,794-byte current maximum. A repeated boundary run sampled server memory at 288.0 MiB initially, 288.2 MiB peak, and 282.3 MiB finally. Final verification reports zero active/waiting/open application transactions, zero current boundary documents, zero duplicate unique claims, positive bounded Redis TTLs, healthy primary services, and no temporary second server.
- The schema-reconciled public Delivery OpenAPI document now covers every GET/HEAD/OPTIONS route, strict query bounds, schema-backed envelopes, conditional/cache/rate headers, security, examples, stale-cursor recovery, and public-only error codes; Scalar serves the interactive reference.
- The complete management oRPC reference is disabled by default, rejected by environment validation in production, and available only through explicit local/test enablement. Snapshot/HTTP tests prove the public document excludes management/auth/operator contracts.
- The rebuilt production Docker server serves the OpenAPI JSON and interactive reference with HTTP 200, exposes 4 paths/12 operations/10 public schemas, returns 404 for `/api-reference`, and still serves a protected fixture read with HTTP 200; all primary services are healthy.
- The final refreshed `pnpm run ready`, production/full audits, production builds, and `git diff --check` pass after all load and documentation-boundary work.
- The developer completed manual review, approved M9, and committed it as `8559aa4` (`feat(m9): production delivery API`).

### Milestone 8 complete automated gate

- Workspace API, web, and server type checks pass after publication repository, operations, router/runtime, and UI integration.
- Rollback-contained PostgreSQL coverage proves the complete lifecycle and all eight material failure-injection stages without leaving append-only fixtures.
- Deterministic statement-order coverage proves a target unpublish before grouped resolution rejects the source, while unpublish after resolution preserves the pinned immutable target; stale same-locale publish and publish/unpublish commands conflict after the serialized winner.
- Shared-head advancement marks both locale publications stale, Hindi-only republish captures the newer shared value without changing English's snapshot, and independent locale publication sequences remain monotonic.
- Two real concurrent `READ COMMITTED` entry writers serialize on the production event-sequence lock and return contiguous sequences before restoring the mutable fixture.
- The complete policy matrix covers `content.read` and `content.publish` across every role and `all`/`selected`/`none` exact-locale access outcome.
- The refreshed complete workspace test run passes: 430 API/domain/PostgreSQL + 90 server + 102 web + 5 environment = 627 tests.
- Refreshed coverage passes: API/domain is 89.83% statements and 72.19% branches; the publication repository is 90.00% statements and 76.12% branches, with contracts/cursor/engine fully covered by statements.
- `pnpm run ready` passes end to end, including format/lint, all package type checks, tests, coverage, and production builds; production/full dependency audits and `git diff --check` also pass. The entry-editor route remains a small dedicated chunk while Portable Text stays lazy.
- Final read-only verification reports nine applied migrations, four enabled immutable-artifact triggers, zero unvalidated constraints, zero invalid publication indexes, and zero M8 test users, publications, snapshots, reference edges, heads, or command receipts.
- No migration command or migration artifact modification occurred.

### Milestone 8 applied migration verification

- Developer generated and applied `packages/db/src/migrations/0008_add_locale_publications_and_delivery_snapshots.sql`; the agent did not generate, edit, or apply it.
- Complete migration review confirms five publication tables, the entry/outbox extensions, tenant/source/reference/head/receipt constraints, approved indexes, and four append-only triggers backed by one hardened trigger function.
- Snapshot lineage is valid: five tables added, only `cms_entry` and `outbox_event` changed, no table removed, and enums/schemas/sequences/roles/policies/views are unchanged.
- Live PostgreSQL reports nine migration journal rows; all five new tables are empty, all eight existing entries have event sequence zero, and all 11 existing outbox rows have null paired publication scope.
- All new constraints are validated; all new indexes are valid/ready; the locale-leading partial head index and entry-event unique index match the approved predicates.
- All four triggers are enabled for `UPDATE` and `DELETE`; the one trigger function returns `trigger` with `search_path=pg_catalog`.

### Milestone 8 Drizzle schema gate

- `pnpm --filter @framerfordevs/db check-types`: pass.
- `pnpm --filter @framerfordevs/api check-types`: pass.
- Focused publication compiler, realistic-fixture, and publication-contract suites: 8 tests pass.
- `oxlint`, focused formatting, and `git diff --check`: pass.
- The Drizzle schema adds no migration artifact; full PostgreSQL integration/readiness intentionally awaits the developer-generated/applied migration because the live catalog does not yet contain the new schema.
- No agent command generated, edited, applied, pushed, or executed a migration.

### Milestone 8 pre-Drizzle compiler fixture gate

- `pnpm run ready`: pass, including workspace format/lint, all package type checks, 611 tests, measured V8 coverage, and server/web production builds.
- Test distribution: 420 API/domain/PostgreSQL, 85 server/API integration, 101 web validation/UI/accessibility/route, and 5 environment tests.
- API coverage passes at 89.84% statements and 71.45% branches; the new publication contracts have 100% statements and branches, and the pure compiler has 89.56% statements, 79.10% branches, and 100% functions.
- Focused M8 coverage locks contract/OpenAPI conversion, class-backed default materialization, strict partition ownership, removed-field omission, Unicode normalization, API-key projection, occurrence-level immutable reference pins, byte-stable hashes, metadata-only changed roots, exact-locale unpublished-target rejection, and below/exact/above aggregate boundaries without truncation.
- The realistic fixture passes at 675,221 document bytes + 16,825 manifest bytes = 692,046 combined bytes, 94,386 bytes below the 786,432-byte gate and with 356,530 bytes (34.00%) remaining under the 1 MiB maximum.
- No Drizzle schema or migration artifact was changed, generated, applied, pushed, edited, or executed.
- `git diff --check`: pass.

### Milestone 7 refreshed complete gate after manual-review corrections

- `pnpm run ready`: pass, including format/lint, all package type checks, 603 tests, measured coverage, and server/web production builds.
- Test distribution: 412 API/domain/PostgreSQL, 85 server/API integration, 101 web validation/UI/accessibility/route, and 5 environment tests.
- API coverage passes at 89.72% statements and 71.07% branches; entry contracts, operations, and engine reach 100% statements.
- API/domain coverage proves class-backed rich-text, money, and external-asset defaults become inert JSON before value validation; PostgreSQL replacement coverage persists a decoded rich-text default.
- New PostgreSQL coverage proves named-create replay/conflict behavior, optimistic rename/no-op/conflict, rename rollback after an injected audit failure, and a successful empty management list before schema publication alongside the existing multilingual draft/history invariants.
- Web coverage proves locale-neutral named rows, accessible create/rename dialogs, validated locale search state, version-0-only recursive defaults without clear-value resurrection, partition-safe mixed-object mutation paths, saved Portable Text hydration, configured Portable Text default editing, type-appropriate scalar/temporal default controls, structured object/list root checks, and object-only mixed localization controls.
- `pnpm audit --prod` and full `pnpm audit`: no known vulnerabilities after resolving `nanoid` to patched `3.3.17` through the workspace transitive override.
- Read-only PostgreSQL verification reports eight migration records, four valid legacy null names, zero invalid name versions, zero unvalidated M7 constraints, and zero invalid/unready M7 indexes.
- Rebuilt Docker images contain the corrected M7 implementation; PostgreSQL, server, and web are healthy, root liveness, readiness, API reference, and SSR login return HTTP 200, and recent server/web logs contain no relevant errors.
- `git diff --check`: pass. The agent did not generate, apply, execute, or modify migrations `0006` or `0007`.

### Milestone 7 entry-name amendment pre-migration gate

- `pnpm --filter @framerfordevs/db check-types`: pass.
- Changed decision/PRD/milestone/schema files format successfully.
- `git diff --check`: pass.
- No migration command or PostgreSQL write was run.

### Milestone 7 complete automated gate before manual-review amendment

- `pnpm run ready`: pass, including workspace format/lint, all package type checks, all tests, measured coverage, and server/web production builds.
- 582 tests pass: 410 API/domain/PostgreSQL, 78 server/API integration, 89 web validation/UI/accessibility/route, and 5 environment tests.
- API coverage passes at 89.16% statements and 70.17% branches; `entry-repository.ts` reports 82.62% statements, entry operations/engine report 100%, and `entry-values.ts` reports 94.11% statements and 87.17% branches.
- Measured web coverage passes with 100% statements for configured libraries, 77.52% statements for locale tabs, and generated-form interaction coverage across controlled stable-ID values and accessibility checks.
- PostgreSQL integration proves concurrent idempotent create, independent English/Hindi saves, command mismatch rejection, stale shared conflict, malformed hard rejection, permissive issues, unavailable-reference feedback, rollback after revision insertion, field/locale authorization, no-op receipts, restore append/no-op replay, zero draft outbox writes, and intended entry/revision indexes.
- Final read-only verification reports zero M7 fixture users/audits/resources, zero unvalidated M7 constraints, and zero invalid/unready M7 indexes.
- Production-only and full `pnpm audit` report no known vulnerabilities after pinning patched `js-yaml@4.3.1` through the workspace transitive override.
- Rebuilt server/web Docker images include M7; PostgreSQL, server, and web are healthy, and liveness, readiness, API reference, and SSR login return HTTP 200.
- `git diff --check`: pass. The agent did not generate, apply, execute, or modify migration `0006`.

### Milestone 7 pre-migration gate

- `pnpm run check`: pass across all 245 formatted/linted files.
- `pnpm run check-types`: pass across all seven TypeScript packages.
- `pnpm --filter @framerfordevs/db check-types`: pass after the six-table M7 Drizzle schema and relations.
- Explicit PostgreSQL constraint/index identifiers are unique where required and remain within the 63-byte identifier ceiling.
- `git diff --check`: pass.
- No migration command or PostgreSQL write was run. Database integration tests begin only after the developer-generated migration is reviewed and applied.

### Milestone 6 complete automated gate

- `pnpm run ready`: pass after the schema-authoring UX extension, including formatting, lint, all package type checks, tests, coverage, and server/web production builds.
- `pnpm run test`: 551 tests pass: 380 API/domain, 78 server/API integration, 88 web validation/UI/accessibility, and 5 environment tests.
- API/domain coverage passes at 89.73% statements and 72.15% branches; configured tested web helpers pass at 100% statements and 91.89% branches.
- PostgreSQL integration covers recursive fields, reference targets, pinned money profiles, independent hashes, layout mutation, draft/published role projection, immutable snapshots, aggregate rollback, tenant isolation, restrictive lifecycle behavior, and intended index paths.
- Property coverage exercises rich-text trees, nested object/list definitions and values, mixed localization, exact decimal/money, Unicode-safe slugs, external assets, and the depth profile.
- Server tests deny anonymous callers for the three new layout/form procedures as well as the complete M5/M6 schema surface.
- Generated-form and platform accessibility tests pass with no detected Axe violations; all 18 field kinds are exhaustively mapped through the typed control registry.
- Production builds preserve the official Portable Text editor as a lazy client chunk; M6 client route chunks contain no database/server imports. The schema-authoring collection chunk is 235.80 kB raw/68.25 kB gzip; the lazy editor remains 622.84 kB raw/193.43 kB gzip and triggers Vite's informational 500 kB chunk warning without entering the initial route chunk.
- Read-only live checks report zero unvalidated M6 constraints, zero invalid/unready M6 indexes, zero invalid recursive/reference rows, zero money heads/revisions missing required currency profiles, and zero leaked M5/M6 integration users.
- `pnpm audit --prod` and the full `pnpm audit` both report no known vulnerabilities after aligned OpenTelemetry/Better Auth/shadcn patch updates, moving the shadcn CLI to development-only dependencies, and package-manager-generated patched transitive overrides.
- Cold Docker review exposed React error 310 because the builder's loading path skipped a mutation hook; the hook now executes before every conditional return, React Hooks linting is mandatory, focused web checks pass, and rebuilt containers are healthy.
- The refreshed production Docker images containing the schema-authoring workbench build successfully; PostgreSQL, server, and web report healthy, server root and web login return HTTP 200, and recent server/web logs contain no relevant errors.
- Manual review found the reference-collection query requesting 100 items against the API's maximum page limit of 50; both the query and matching invalidation key now use 50, all 88 web tests and the production build pass, and the corrected Docker image is healthy.
- `git diff --check`: pass. The agent did not generate, apply, execute, or modify migration `0005`.

### Milestone 6 pre-migration gate

- New field-system contract, value/tree, editor-layout, aggregate-document, and Effect service tests: 19 targeted passing.
- `pnpm --filter @framerfordevs/db check-types`: pass after the M6 Drizzle-schema update.
- `pnpm --filter @framerfordevs/api check-types`: pass after the M6 Drizzle-schema update.
- Existing API suite plus the first M6 tests reached 366 passing before the final layout/aggregate test additions; the complete readiness suite is deferred until after the developer migration.
- `git diff --check` and changed-file formatting checks pass at the migration handoff.
- No migration file was generated or applied by the agent.
- Post-application read-only verification confirms migration journal count 6, all 35 M6 constraints validated, all 16 M6 indexes valid/ready, and all historical rows satisfy root/profile backfill invariants.

### Milestone 5 foundational database gate

- `pnpm --filter @framerfordevs/db check-types`: pass.
- `pnpm --filter @framerfordevs/api check-types`: pass.
- Targeted schema contract, pure engine/classifier, and centralized error tests: 37 pass across 3 files.
- `pnpm run check`: pass across the workspace.
- `git diff --check`: pass.
- Static schema review reports 56 explicitly named M5 constraints/indexes/foreign keys, no duplicate names, and no PostgreSQL identifiers over 63 characters.
- The generated migration contains the six approved tables, 18 tenant/actor/lineage foreign keys, 33 checks, 17 primary/unique constraints, and 38 total valid/ready indexes.
- Read-only live verification confirms all six tables and the non-null 64-character command fingerprint column exist; all six M5 tables are initially empty.
- The developer generated and applied the migration. No agent command generated, applied, pushed, or executed it.
- After the initial collection repository/API tranche, `pnpm run check`, `pnpm run check-types`, and `pnpm run test` pass. The full suite has 478 tests: 347 API/domain, 61 server, 65 web, and 5 environment tests.
- PostgreSQL collection coverage proves atomic collection/head/audit creation, permanent environment key reservation, CMS capability gating, stable keyset pagination, cross-tenant non-enumeration, no-op updates, and optimistic metadata/draft version conflicts.
- Read-only post-suite cleanup reports zero M5 collections, heads, fields, revisions, revision fields, outbox events, test audits, and test users.

### Milestone 5 complete automated gate

- `pnpm run ready`: pass, including formatting, lint, all package type checks, tests, coverage, and production builds.
- `pnpm run test`: 509 tests pass across 38 files: 353 API/domain, 74 server/API integration, 77 web routing/validation/accessibility, and 5 environment tests.
- API/domain coverage passes at 93.10% statements and 75.98% branches; tested web helpers pass at 100% statements.
- PostgreSQL tests cover environment key scope, CMS/archived gating, tenant non-enumeration, stable field identities, no-op/version behavior, complete-set reorder, remove lifecycle, exact acknowledgements, immutable revision history, idempotent command fingerprints, no-op publication, concurrent monotonic publication, rollback after all five publication artifact stages, restrictive deletion, and intended index plans.
- Server tests deny anonymous callers for every M5 procedure and preserve the standard response envelope.
- UI tests cover browser/API key parity, collection and field dialog accessibility, and mandatory risky-change acknowledgement.
- Server and web production builds pass; the schema-builder route is emitted as a separate route chunk.
- Final read-only cleanup reports zero M5 resources and test fixtures.

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
- UI coverage includes registry-backed BCP 47 validation, locale creation and member-access dialog accessibility, and unsaved locale-tab switching. Developer review is complete.
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

Milestone 4 automated criteria and developer review are complete. The developer approved and committed Milestone 4 as `68b6f6e` (`feat(m4): project locales and strict locale contracts`). The developer approved the Milestone 5 design and applied its inspected migration. During Milestone 5 manual review, the developer found that the schema-builder URL rendered only the project panel because its route was nested below a page component without an outlet. The builder is now an explicit non-nested TanStack route with a route-tree regression test. The developer then verified the representative collection lifecycle, risky-change acknowledgement, publication, and immutable revision behavior; approved Milestone 5; and committed it as `28ca04d` (`feat(m5): versioned collection schema engine`).

Milestone 6 automated criteria and developer/client review are complete. Manual review found and resolved the cold-hydration React hook-order crash and the invalid reference-collection page limit. The developer approved Milestone 6 and committed it as `fbb4767` (`feat(m6): field system, structured rich text, external assets, and editor layout`).

Milestone 7 manual review found locale-dependent list presentation, missing CMS-only names, non-URL locale state, absent version-0 defaults, missing Portable Text hydration, a raw-JSON editor for rich-text defaults, other mismatched default controls, mixed-localization controls on ineligible kinds, and expected unpublished-schema absence surfacing as three global query-error toasts. The developer approved the amendment and generated/applied the inspected `0007_add_entry_display_names.sql` migration. The workspace now derives schema availability from collection metadata and avoids unavailable dependent queries while retaining genuine error semantics. The developer completed English/Hindi/Gujarati review, approved Milestone 7, and committed it as `60bd96f`; the documentation reconciliation was committed as `d90b31b`.

Milestone 8 independent locale publication, immutable snapshots, exact-locale reference pinning, management API/UI, observability, concurrency, policy, append-only enforcement, and final readiness are complete with 627 passing tests and clean invariants. The developer approved and committed M8 as `ad3cd5e` (`feat(m8): add independent locale publication and immutable snapshots`).

Milestone 9 Delivery API was manually approved and committed by the developer as `8559aa4` (`feat(m9): production delivery API`).

Milestone 10 Preview API passed all automated, security, credential-remediation, load/resilience, and invariant gates with 780 tests. The developer manually verified current and historical Gujarati Preview behavior, approved M10, and committed it as `aa177b5` (`feat(m10): preview API`). The developer also confirmed family-first independent API major versions and the initial M12 SDK/versioning policy.

Milestone 12 passed its renewed 962-test readiness gate after the Fumadocs amendment. The developer reviewed and approved the developer portal and generated tooling with OAuth intentionally rollout-disabled, committed the milestone as `4e87908` (`feat(m12): developer portal and generated tooling`), and pushed it to `origin/main` on 2026-08-23.
