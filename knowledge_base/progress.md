# CMS Development Progress

**Overall status:** Milestones 0–13 and post-M13 repository/context normalization are developer-approved and committed. M14 implementation, automated readiness, and the delegated manual review are complete; explicit developer acceptance is pending. M15–M30 remain sequenced context only.
**Next gate:** Explicit developer M14 acceptance; do not begin M15.
**Last updated:** 2026-09-10

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[D]` Design pending
- `[P]` Planned and sequenced; design not started
- `[R]` Awaiting developer review
- `[A]` Developer approved
- `[!]` Blocked

## Milestone tracker

| #   | Capability                              | Status | Accepted tests | Commit    |
| --- | --------------------------------------- | ------ | -------------: | --------- |
| 0   | Foundation validation                   | `[A]`  |             26 | `7d5a312` |
| 1   | Effect, errors, observability           | `[A]`  |             90 | `c28f6fa` |
| 2   | Platform kernel                         | `[A]`  |            163 | `60adb39` |
| 3   | Membership, policy, credentials         | `[A]`  |            381 | `a74aeb8` |
| 4   | Project locales                         | `[A]`  |            453 | `68b6f6e` |
| 5   | Versioned schema engine                 | `[A]`  |            509 | `28ca04d` |
| 6   | Field system and generated forms        | `[A]`  |            551 | `fbb4767` |
| 7   | Entries, multilingual drafts, revisions | `[A]`  |            603 | `60bd96f` |
| 8   | Per-locale publication and snapshots    | `[A]`  |            627 | `ad3cd5e` |
| 9   | Delivery API                            | `[A]`  |            712 | `8559aa4` |
| 10  | Preview API                             | `[A]`  |            780 | `aa177b5` |
| 11  | Events, webhooks, invalidation          | `[A]`  |            868 | `fef7205` |
| 12  | Developer portal and generated tooling  | `[A]`  |            962 | `4e87908` |
| 13  | Code-first authoring and local editor   | `[A]`  |          1,184 | `9c68942` |
| 14  | Control-plane bootstrap contracts       | `[R]`  |              — | —         |
| 15  | Governance automation parity            | `[P]`  |              — | —         |
| 16  | Operational administration and recovery | `[P]`  |              — | —         |
| 17  | Hosted surface separation               | `[P]`  |              — | —         |
| 18  | Studio mount and security runtime       | `[P]`  |              — | —         |
| 19  | Studio content and localization         | `[P]`  |              — | —         |
| 20  | Studio editorial lifecycle              | `[P]`  |              — | —         |
| 21  | Client handover and editorial safety    | `[P]`  |              — | —         |
| 22  | Data durability and portability         | `[P]`  |              — | —         |
| 23  | Production security and operations      | `[P]`  |              — | —         |
| 24  | Environment lifecycle and promotion     | `[P]`  |              — | —         |
| 25  | Managed assets and media                | `[P]`  |              — | —         |
| 26  | Workflow automation and scheduling      | `[P]`  |              — | —         |
| 27  | Visual-builder readiness contracts      | `[P]`  |              — | —         |
| 28  | Visual Studio composition               | `[P]`  |              — | —         |
| 29  | Visual publication and dependencies     | `[P]`  |              — | —         |
| 30  | Renderer SDK and framework adapters     | `[P]`  |              — | —         |

M14 is the sole active implementation milestone. M15–M30 preserve the developer-approved sequence and detailed context but are not designed or authorized for implementation.

## Post-M13 repository/context normalization

- `[x]` Reconcile M13 approval with Git commit `9c68942` and remove stale pending status.
- `[x]` Rewrite this file as one ordered, concise milestone record rather than interleaved checklists and reverse-ordered evidence.
- `[x]` Reduce `learnings.md` to the requested two-field format without deleting durable lessons or prevention rules.
- `[x]` Move always-on agent rules into Pi’s auto-loaded root `AGENTS.md`; keep deeper rules and skills selectively loaded.
- `[x]` Add a decision index that tells agents exactly when prior decisions are relevant; do not require chronological decision loading.
- `[x]` Improve repository discovery and enforce ordered progress, concise learnings, complete decision routing, test placement, established domain ownership, universal implementation/test ownership, and repeated sibling-prefix ownership across all 16 workspaces plus root scripts.
- `[x]` Reorganize the repository-wide flat module families into dedicated owner directories, including every colocated implementation/test pair, the complete API contract surface, deeper API kernels/services/operations/scripts, CLI command/schema/editor/generator workflows, dashboard features, package modules, UI prefix families, developer-portal checks, and utility scripts. Preserve generated route conventions, package export paths, direct imports, and runtime behavior without introducing internal barrels.
- `[x]` Remove the obsolete ignored 92 MiB `tmp/` tree containing M13 evidence, fixtures, package archives, installs, and an applied-migration draft; all contents were reproducible or already recorded in authoritative sources.
- `[x]` Pass formatting, lint, generalized structure enforcement, contract drift, all 15 type-check tasks, 1,184 tests, coverage, and all eight production builds with the worker stopped for shared-database gates. Across server, worker, CLI, dashboard, and developer-portal outputs, all 1,089 JS/CSS artifact counts remain unchanged while aggregate output decreases by 822,525 raw bytes and 201,790 gzip bytes to 43,467,370 raw/8,706,685 gzip; legal and optimizer annotations remain preserved; the server remains seven chunks, and rebuilt PostgreSQL/Redis/server/web/worker services are healthy.
- `[x]` After a worker-isolation mistake projected two test graphs, obtain explicit cleanup approval, delete only the reconciled scope in a guarded transaction, verify zero residue, rerun all 138 server integration tests with the worker stopped, and restore it healthy. The existing worker-isolation learning already covers the prevention rule.
- `[A]` Developer approved and committed the normalization as `cd31102`; it is the structural and context baseline for M14 onward.

## Completed milestone record

### Milestone 0 — Foundation validation

- Verified pnpm/Turborepo tasks, PostgreSQL, Express, oRPC, OpenAPI, CORS, Docker, environment failure behavior, and Better Auth signup/session/signout.
- Established deterministic Vitest/V8 coverage and corrected baseline task, build-output, CORS, cookie, and container-health drift.
- Developer approved the 26-test baseline and committed `7d5a312`.

### Milestone 1 — Effect, errors, and observability

- Added stable Effect 3.22, schema-backed response/errors, deterministic HTTP mapping, one shared `ManagedRuntime`, typed Layers, request/trace propagation, redacted logs, bounded metrics, and OTLP-compatible telemetry.
- Better Auth retained native protocol responses at its boundary; expected failures, defects, and interruption remain distinct.
- Developer approved 90 tests and committed `c28f6fa`.

### Milestone 2 — Platform kernel

- Added workspaces, projects, optional capabilities, internal `main` environments, ownership, audits, project CRUD/archive, pagination, and tenant isolation.
- Validated concurrency, query indexes, OpenAPI, production builds, and Docker behavior.
- Developer approved 163 tests and committed `60adb39`.

### Milestone 3 — Membership, policy, and credentials

- Added explicit memberships, invitations, default-deny role/action policy, locale-ready access boundaries, last-owner protection, and serialized collaborator cleanup.
- Added management/delivery/preview credential issue/list/rotate/revoke/authentication with one-time secrets, digest-only persistence, attempt limiting, exact family/scope/environment isolation, audits, and permission-aware UI.
- Developer generated/applied migration `0002_add_memberships_policies_credentials`; 381 tests passed; commit `a74aeb8`.

### Milestone 4 — Project locales

- Added enabled/disabled locale lifecycle, required `en`, stable ordering, exact BCP 47 resolution, membership locale allowlists, dependency guards, optimistic concurrency, audits, policy, and accessible locale UI.
- Browser/server validation uses a pinned official IANA registry rather than structural parsing alone; three invalid legacy rows were removed only after approved dependency reconciliation.
- Developer generated/applied `0003_add_project_locales`; 453 tests passed; commit `68b6f6e`.

### Milestone 5 — Versioned schema engine

- Added stable collection/field/revision identities, draft schema mutation, deterministic hash/classification/change IDs, exact risky-change acknowledgements, immutable publication, idempotent command fingerprints, heads, audits, and outbox events.
- Added tenant-safe repository locking, no-op/replay/conflict behavior, collection/schema APIs, and the initial accessible builder; manual review corrected route composition.
- Developer generated/applied `0004_create_versioned_collection_schemas`; 509 tests passed; commit `28ca04d`.

### Milestone 6 — Field system and generated forms

- Added all 18 field kinds, recursive objects/lists, mixed-object and atomic-list localization, exact decimal/money, pinned currency data, Portable Text, external assets, references, validation profiles, editor layout, role projection, and generated forms.
- Added atomic complete-field replacement, synchronized visual/JSON/sample-inference authoring, lazy rich text, aggregate limits, browser-safe validation, and bundle/a11y/security coverage.
- Developer generated/applied `0005_add_field_system_and_editor_layout`; 551 tests passed; commit `fbb4767`.

### Milestone 7 — Entries, multilingual drafts, and revisions

- Added stable entries, CMS-only names, independent shared/localized revisions and heads, exact descendant mutations for mixed objects, command receipts, optimistic rename/save/restore, no-op suppression, revision history, and role/locale/field projection.
- Added locale-neutral lists and URL-driven editing, shared/localized histories, conflict-preserving UX, Portable Text hydration, and unpublished-schema empty states without draft leakage.
- Developer generated/applied `0006_create_entries_and_locale_revisions` and `0007_add_entry_display_names`; 603 tests passed; commit `60bd96f`.

### Milestone 8 — Per-locale publication and immutable snapshots

- Added strict publication compilation, exact-locale reference pinning, immutable snapshots/edges/history, independent publish/unpublish heads, shared-value staleness, idempotent receipts, atomic audits/outbox, and Delivery-ready projections.
- Boundary and realistic fixtures proved the 1 MiB profile; transaction, append-only, concurrency, rollback, policy, and accessible publication UX gates passed.
- Developer generated/applied `0008_add_locale_publications_and_delivery_snapshots`; 627 tests passed; commit `ad3cd5e`.

### Milestone 9 — Production Delivery API

- Added public/protected Delivery configuration, typed indexed projections, current/immutable/unique/list reads, strict locales, signed generation-bound cursors, bounded expansion, GET/HEAD/OPTIONS, ETags/cache policy, isolated CORS, Redis/memory quotas, and rollout gates.
- Capacity, conditional requests, cross-process quota, Redis outage/recovery, oversized response, query-plan, memory, connection, and restoration gates passed.
- Developer generated/applied corrected `0009_add_production_delivery_api_read_model`; 712 tests passed; commit `8559aa4`.

### Milestone 10 — Preview API

- Added expiring environment-wide Preview credentials, current/historical source selection, role-safe projection, no-store bearer HTTP routes, bounded retry/rate/response behavior, audited repeatable-read access, and renderer-neutral dashboard Preview UX.
- Full capacity, concurrent save/read coherence, audit serialization, Redis outage, oversized response, accessibility, Docker, and residue gates passed.
- Developer approved 780 tests and committed `aa177b5`; OAuth/Preview production rollout remained separate.

### Milestone 11 — Events, webhooks, and invalidation

- Added CloudEvents projection, Standard Webhooks signing/rotation/replay, encrypted destinations/secrets, SSRF/DNS-rebinding controls, subscriptions/mappings, durable delivery/attempt state, bounded retries/dead letters, leases, dispatcher/attempt workers, management UI, and a private external receiver tool.
- Historical outbox cardinality, 10,000-event dispatch, 10,000-attempt fan-out, slow-endpoint isolation, retries, multi-process contention, crash/recovery, TLS key continuity, and cleanup/invariant gates passed.
- Developer generated/applied `0010_add_webhook_delivery_system` and `0011_raise_outbox_event_payload_limit`; 868 tests passed; commit `fef7205`.

### Post-M11 repository normalization

- Commit `fe69a76` established scope-based test placement: focused tests colocate; integration/contract/accessibility suites live under package-owned `test/`; cross-workspace suites live under `tools/*`.
- Commit `18618d4` introduced concise session context and selective decision/learning discovery, but later milestone journals accumulated again; this maintenance workstream corrects that drift and adds enforcement.

### Milestone 12 — Developer portal and generated tooling

- Added rollout-disabled OAuth device authorization, fixed native CLI client/resource authority, signed access/refresh validation, secure keychain CLI login, and public Tooling v1 discovery/manifest/revision APIs without exposing dashboard internals.
- Added canonical public-contract registry/artifacts, SDK, CLI generation/locks, Changesets/release staging, MIT package metadata, and a self-hosted Fumadocs portal with task guides, search, and canonical secondary references.
- Developer generated/applied `0012_add_cli_oauth_device_authorization`; 962 tests passed; commit `4e87908`. OAuth production rollout and npm publication remained disabled.

### Milestone 13 — Code-first authoring and local editor

- Added dependency-light `@framerfordevs/schema`, bounded non-executing Tier 1 TypeScript extraction, stable source reconciliation, separate structure/schema/contract hashes, complete-project plan/apply, exact acknowledgements, immutable receipts/revisions, and honest user-or-credential attribution.
- Added bearer-only Authoring v1, Promise/Effect SDK paths, schema/content CLI workflows, generated forms, immutable editorial Presentation, exact-locale content publication, and a loopback-only `ffd editor` that keeps hosted authority out of browser code/storage.
- Experimental Tier 2 uses credential-blind QuickJS 0.32.0 only to emit verified Tier 1 output; it remains explicit/default-off and reports `memoryLimitHard: false`. Upstream issue #255 still blocks production/default enablement and hard-memory proof.
- Manual scenarios 1–5 proved export/hash/type parity, presentation-only revisions, code push, stable rename identity, exact acknowledgements, and reciprocal collection creation. Scenarios 6–7 proved OAuth/scope/actor authority plus CLI/SDK/Delivery/webhook lifecycles. Scenarios 8–10 proved conflict recovery, drift-safe live forms, and browser/process secret isolation. Scenarios 11–13 proved dashboard builder retirement, portal coherence, and Tier 2 isolation/staleness.
- Dashboard collection/field/layout/schema-publication mutation procedures are removed completely with no pre-release compatibility tombstones; content, editorial Presentation, Delivery, navigation, and read-only structure remain.
- Developer generated/applied `0013_add_code_first_authoring_authorities` and `0014_normalize_authoring_actor_foreign_keys`; final readiness passed 1,184 tests; commit `9c68942`.

## Planned milestone record

These entries remain concise because `milestone.md` owns the detailed pending context. M14 has an approved decision record and active implementation; M15–M30 must not be designed or implemented ahead of their developer gate. The original pre-normalization M14–M16 scope is retained explicitly in M21–M23 and M27 rather than discarded.

### Milestone 14 — Control-plane bootstrap contracts

- Approved design: `knowledge_base/decisions/m14-control-plane-bootstrap-contracts-design.md` defines portable workspace/project bootstrap and recovery, exact principal/grant authority, receipt idempotency, signed cursors, inert Studio-registration metadata, and shared HTTP/CLI/dashboard/link authority. Control Plane v1 has `sdkSupported: false`; the CLI remains the complete agent/operator surface; the retired dashboard authoring routes remain absent. Implementation has added the proposed Drizzle authority and targeted metadata tests for command receipts, Studio registration, and honest project-capability credential attribution. Developer-generated/applied `0015_add_control_plane_bootstrap_authorities` passed full artifact inspection and read-only verification. Migration journal entry `16`, both new tables, expected columns/constraints/indexes/FKs, 18 existing capability rows under the new actor invariant, and zero initial receipt/registration rows are correct.
- Added closed Control Plane v1 schemas and canonical OpenAPI ownership for all 13 operations: strict/excess-free requests, byte-bounded canonical Studio origin/path metadata, closed errors, OAuth/management authority separation, no-store responses, rejected preflight, and `sdkSupported: false`; 12 focused contract tests and API type-check pass.
- Added the three fixed CLI OAuth grants, OAuth-only enumeration/creation/lifecycle narrowing, exact management-scope requirements, owner-only `project.restore`, centralized Control Plane failures, canonical actor/operation/scope/input fingerprints, advisory-serialized receipts, and signed principal/route/tenant/filter/limit-bound public cursors with rotation and expiry coverage.
- Extended the existing `PlatformRepository` rather than introducing a second authority: restore now locks, reauthorizes, versions, clears archive attribution, audits, and is available through the protected dashboard route/UI; dashboard capability enablement now adapts to the receipt-backed shared operation. CMS enable commands serialize exact replay and reject a new command against enabled state without an orphan receipt. Studio registration implements exact environment authorization, receipt-first replay, create-only/update-only/version rules, successful no-op receipts without version/audit noise, archived-write denial, and honest user/credential attribution. Protected dashboard Studio controls use the same operations and retain inert metadata semantics. Shared Control Plane workspace/project creation, retrieval, update, lifecycle, capability inspection, and signed keyset lists now use the same repository authority. The isolated PostgreSQL suite passes 24 scenarios, including concurrent receipt replay, singleton Studio create/update races, list pagination, management-credential attribution, and compact receipt-growth evidence; the worker was stopped and restored healthy. Focused API/CLI/web type, contract, policy, auth, cursor, operation, accessibility, and UI checks pass.
- Added the canonical Control Plane public-registry artifact and immutable baseline with `sdkSupported: false`, developer-portal API reference/task guide, complete redirect-free bounded CLI HTTP client, explicit-`--api` command family, content-free retry journal, and online exact-authority `ffd link` verification. The developer approved independent 60-second Control Plane token buckets after measured PostgreSQL evidence: global 3,000/capacity 250, OAuth user 120/capacity 20, management credential 120/capacity 20; costs are read/list 1, create 5, update 3, lifecycle 5, and Studio write 5.
- A mistaken package-script filter ran shared-database suites while the worker was active. After developer-approved exact cleanup, five temporary graphs were removed in a guarded transaction, zero residue was verified, all six affected files/42 tests passed with the worker stopped, and the worker was restored healthy. The existing worker-isolation learning now requires direct focused Vitest execution and reported file-count verification.
- Completed the bearer-only `/api/control-plane/v1` transport and all 13 routes with exact method/path/content/query/body closure, OAuth-versus-management authentication, weighted global/principal quotas, bounded telemetry, canonical OpenAPI serving, and success/security integration coverage. Completed the complete explicit-`--api` CLI command family, stable machine errors, content-free response-loss journals, exact archive confirmation, and online `ffd link`; no Control Plane authority entered the public SDK.
- During final readiness, the independent worker was mistakenly restarted before a shared-database gate and claimed rows from one test run. Developer-approved read-only reconciliation identified exactly 10 test users, eight test workspaces, and eight test projects in the failed-run time/prefix scope. The first two guarded cleanup attempts rolled back unchanged on constraint guards; the corrected transaction deleted only the exact tenant graph and users, and read-only verification found zero matching users/workspaces/projects. Clean integration/readiness reruns passed with the worker stopped; the existing worker-isolation learning remains authoritative.
- Canonical Control Plane artifact and baseline SHA-256 are `747cc0c897ed2738adb5bbc476aee6a284d0f10e89ca8208c3a813a59890a935`. The initial complete readiness gate passed 1,256 tests. Exact patched transitive overrides clear high/critical audit findings and the runtime `qs` advisories; four moderate findings remain only on the repository's Vitest 3 test-tool graph pending a separately reviewed Vitest 4 upgrade.
- Completed all eight delegated manual-review scenarios with temporary local-only OAuth: native CLI login/whoami, workspace/project bootstrap, verified linking, schema export/plan/push, dashboard/CLI bidirectional projection, dropped-response replay with exactly one resource/receipt/audit, command conflict, tenant and principal-bound cursor isolation, read-only-role denial, exact management-credential permission and actor attribution, inert Studio registration, archive denial across Tooling/Authoring/Delivery/Preview, exact restore preservation, live artifact/docs parity, package-boundary inspection, and secret/content-redaction inspection. Manual review found and corrected two gaps: deterministic non-retryable Control Plane HTTP failures now clear their retry journal while ambiguous transport failures retain it, and the dashboard suppresses the global toast only for the component-owned missing-Studio empty state. Disposable users, credentials, workspaces, projects, content, receipts, audits, OAuth state, browser state, and private evidence were guardedly removed with the worker verified stopped; all target references are absent, temporary OAuth configuration is removed, and the normal PostgreSQL/Redis/server/web/worker stack is healthy.
- Post-review `TURBO_FORCE=true pnpm run ready` passes 1,259 tests, coverage, contract drift, formatting, lint, structure, all type checks, and eight builds with zero Turbo cache hits and the independent worker stopped for shared-database gates. All 256 integration tests remain green. M14 now awaits only explicit developer acceptance; no commit, release, production OAuth/configuration, deployment, acceptance, or M15 work has occurred.

### Milestone 15 — Governance automation parity

- Sequence memberships, invitations, role/policy administration, locales, and current-environment inspection after M14 contracts establish the portable boundary.

### Milestone 16 — Operational administration and recovery

- Sequence credentials, webhooks, audit/security visibility, and recovery-safe project operations without transferring unrestricted authority to browser clients.

### Milestone 17 — Hosted surface separation

- Separate marketing/docs/auth entry at `framerfordevs.com` from resilient administration/recovery at `dashboard.framerfordevs.com`, retaining editorial UI only until Studio parity exists.

### Milestone 18 — Studio mount and security runtime

- Establish the framework-neutral SPA, configured-path mount, Web Standards BFF/adapters, registration/session handoff, and exact browser-safe route boundary.

### Milestone 19 — Studio content and localization

- Move role-projected browsing, generated forms, shared/exact-locale drafts, validation, save/conflict handling, and large-collection UX into Studio.

### Milestone 20 — Studio editorial lifecycle

- Add revision restore, Presentation, Preview, publication, local-editor convergence, and parity-gated retirement of duplicate hosted editorial authority.

### Milestone 21 — Client handover and editorial safety

- Preserve the original handover scope through client-focused navigation, exact collection/field/locale restrictions, review submission, revision comparison, translation/publication indicators, accessible recovery-safe forms, activity, and authenticated handover links.

### Milestone 22 — Data durability and portability

- Preserve backup/restore, corruption detection, bounded stable-ID import/export, retention/cleanup authority, self-host compatibility/versioning, and recovery drills for immutable and idempotent state.

### Milestone 23 — Production security and operational readiness

- Preserve rate limits/SLOs, host/operator isolation, worker egress/cloud-metadata hardening, security and dependency scanning, load/soak/failover proof, alerts, dashboards, and rollback/recovery runbooks.

### Milestone 24 — Environment lifecycle and promotion

- Introduce user-visible environments beyond `main` and explicit environment-scoped promotion/configuration authority without identity ambiguity.

### Milestone 25 — Managed assets and media

- Add secure uploads/storage, media-library authority, metadata/transformation contracts, and compatibility with existing external-asset fields.

### Milestone 26 — Workflow automation and scheduling

- Extend M21 review safety with advanced approval transitions, review notes, and scheduled exact-locale publication while preserving immutable publication, audit, and outbox semantics.

### Milestone 27 — Visual-builder readiness contracts

- Preserve the original visual-readiness scope: stable-ID CMS bindings, provider/dependency/invalidation/renderer contracts, compatibility fixtures, binding-impact analysis, and proof that visual enablement requires no CMS migration.

### Milestone 28 — Visual Studio composition

- Add stable visual resources and permission-aware page composition, responsive styling, data binding, navigation, SEO, tokens, and custom developer-component workflows to Studio.

### Milestone 29 — Visual publication and dependencies

- Add immutable visual revisions/publications, preview, binding-impact analysis, dependency graphs, targeted route invalidation, and atomic events/audits.

### Milestone 30 — Renderer SDK and framework adapters

- Add a versioned canonical renderer contract plus initial supported CSR/SSR/static adapters while preserving developer-owned infrastructure; stop the numbered roadmap after this visual baseline.

## Current validation and release state

- Accepted M13 baseline: `pnpm run ready` passed 1,184 tests, 15 type-check tasks, public-contract drift, formatting, lint, structure, coverage, and eight builds with the independent worker stopped during shared-database gates and healthy afterward.
- Reported final suites include 723 API, 138 server, 115 dashboard, 105 CLI, 18 SDK, and 13 content-form tests. Focused retirement/authority suites passed 19 API, 22 dashboard/accessibility, and 78 server tests.
- SDK/CLI boundary correction at `d63f215`: full `pnpm run ready` passed 1,190 tests, 15 type-check tasks, public-contract drift, formatting, lint, structure, coverage, and eight builds; CLI rose to 110 tests and SDK to 19. Packaged credential-blind extraction/build, schema/Presentation/content, and loopback-editor workflows passed.
- Current pre-release dashboard route removal: full readiness passes 1,177 tests, including 721 API and 127 server tests, with the same 15 type-check, contract, formatting, lint, structure, coverage, and eight-build gates. The independent worker was stopped for shared-database gates and restored healthy.
- Canonical Authoring OpenAPI SHA-256 is `d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205`.
- The live schema records migrations through `0014`; post-cleanup source/hash/actor/head/FK/receipt/webhook invariants and supported outbox projection were clean at acceptance.
- Schema, SDK, and CLI release Changesets/package metadata remain at version `0.0.0`; no package has been published. The committed SDK boundary removes schema push and Presentation mutation from public Authoring SDK methods/DTOs while preserving those workflows in the CLI.
- Production OAuth rollout, production configuration, deployment, and Tier 2 production/default activation have not occurred.

## Database migration record

Agents did not generate or apply these migrations. Developer-generated/applied artifacts under `packages/db/src/migrations/` are immutable.

| Migration     | Owner         | Purpose                                                                             |
| ------------- | ------------- | ----------------------------------------------------------------------------------- |
| `0000`–`0001` | Foundation/M2 | Authentication and platform kernel                                                  |
| `0002`        | M3            | Memberships, policies, credentials                                                  |
| `0003`        | M4            | Project locales and locale access                                                   |
| `0004`        | M5            | Versioned collection schemas                                                        |
| `0005`        | M6            | Recursive fields, validation, editor layout                                         |
| `0006`–`0007` | M7            | Entries, multilingual revisions, entry names                                        |
| `0008`        | M8            | Locale publications and Delivery snapshots                                          |
| `0009`        | M9            | Delivery configuration and typed read model                                         |
| `0010`–`0011` | M11           | Webhook delivery system and outbox limit                                            |
| `0012`        | M12           | CLI OAuth device authorization                                                      |
| `0013`–`0014` | M13           | Code-first source/hash/receipt authority and actor FKs                              |
| `0015`        | M14           | Control-plane command receipts, Studio registration, and capability actor authority |

## Roadmap and next gate

- `knowledge_base/milestone.md` is authoritative for the approved M14–M30 sequence, detailed pending context, original M14–M16 preservation, boundaries, and selective reading pointers.
- M14 design is approved and implementation is active after applied, read-only-verified migration `0015_add_control_plane_bootstrap_authorities`.
- M15–M30 are contextualized pending milestones, not approved designs; work must continue one milestone at a time and later entries may be split during their own design.
- Managed hosting, external backend/data adapters, billing, analytics, and plugins remain unsequenced long-term product directions until M30 is accepted.
- Package publication/versioning, production OAuth, production domains/configuration, deployments, migrations, Tier 2 activation, and milestone acceptance remain developer-controlled.
