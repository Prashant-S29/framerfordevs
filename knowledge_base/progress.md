# CMS Development Progress

**Overall status:** Milestone 9 approved and committed; Milestone 10 not started
**Active milestone:** Milestone 10 — Preview API
**Last updated:** 2026-08-11

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
| 10  | Preview API                              | `[ ]`  | Not run         | Pending       | None      |
| 11  | Events, webhooks, invalidation           | `[ ]`  | Not run         | Pending       | None      |
| 12  | Developer portal and generated tooling   | `[ ]`  | Not run         | Pending       | None      |
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
- `[x]` Split mandatory rules into a discoverable `knowledge_base/rules/` index with one focused file per concern.
- `[x]` Added mandatory Git-state verification and structured source-code comment rules.

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
- `[x]` Amend M12 to own the allowlisted developer portal/generated tooling and M14 to prove production marketing/application/API/developer/operator host separation.
- `[A]` Developer approved and committed M9 as `8559aa4` (`feat(m9): production delivery API`).

## Current blockers

None. M9 is approved and committed; M10 Preview API design discovery has not started.

## Database migration state

The developer generated and applied `packages/db/src/migrations/0001_create_platform_kernel.sql`. The agent inspected the generated SQL and live PostgreSQL catalog against the approved design. The agent did not generate, run, or apply the migration.

The developer generated and applied `packages/db/src/migrations/0002_add_memberships_policies_credentials.sql`. The agent inspected it and confirmed the structural tables, constraints, tenant foreign keys, lifecycle checks, indexes, and authorized owner-membership backfill match the approved design. Read-only verification reports four access tables, two projects, two active owner memberships, and zero projects without exactly one active owner.

The developer generated and applied `packages/db/src/migrations/0003_add_project_locales.sql`. The agent inspected it and, with explicit authorization, added the existing-project enabled-English backfill before developer application. Read-only verification confirms both locale tables, all nine intended indexes, one enabled `en` for every project, membership defaults of `all`, and valid owner locale access. The agent did not generate or apply the migration.

The developer generated and applied `packages/db/src/migrations/0004_create_versioned_collection_schemas.sql` using `pnpm --filter @framerfordevs/db db:generate --name=create_versioned_collection_schemas` followed by `pnpm --filter @framerfordevs/db run db:migrate`. The agent inspected the complete generated DDL and snapshot metadata without modifying or applying them.

The developer generated and applied `packages/db/src/migrations/0005_add_field_system_and_editor_layout.sql` using the approved migration name. The agent inspected the complete SQL and snapshot metadata and verified the applied catalog read-only. The agent did not generate, apply, execute, or modify the migration.

The developer generated and applied `packages/db/src/migrations/0006_create_entries_and_locale_revisions.sql`. The agent inspected all 185 SQL lines and the version-7 snapshot without modifying either artifact, then verified the six empty live tables, constraints, indexes, and migration count read-only. The agent did not generate or apply the migration.

The developer generated and applied `packages/db/src/migrations/0007_add_entry_display_names.sql`. The agent inspected the complete SQL and snapshot without modification and verified the live catalog read-only: `display_name` is nullable `varchar(100)`, `name_version` is non-null with default `1`, all three name constraints are validated, eight migrations are recorded, four legacy entries remain null-named at valid version `1`, and no M7 constraint or index is invalid/unready. The agent did not generate, apply, execute, or modify the migration.

The developer generated, corrected, and applied `packages/db/src/migrations/0009_add_production_delivery_api_read_model.sql`. The first application failed transactionally because current-head unique authority followed its referencing foreign key; read-only verification proved complete rollback. The developer replaced it with the reviewed order and applied it successfully. Live verification confirms four M9 tables, protected configuration for all existing collections, validated constraints, valid/ready indexes, and no unintended public configuration. The agent neither generated nor applied the migration.

## Test results

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
