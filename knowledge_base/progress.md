# CMS Development Progress

**Overall status:** Milestones 0–15 and post-M13 repository/context normalization are developer-approved and committed. M16 operational administration and recovery is implemented and awaiting developer review; it is not accepted or committed.
**Next gate:** Developer review and explicit M16 acceptance; do not begin M17.
**Last updated:** 2026-09-19

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
| 14  | Control-plane bootstrap contracts       | `[A]`  |          1,259 | `6ba124a` |
| 15  | Governance automation parity            | `[A]`  |          1,270 | `5460c2b` |
| 16  | Operational administration and recovery | `[R]`  |          1,311 | —         |
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

M15 is accepted at `5460c2b`. Corrected M16 migration `0017` and follow-up invariant migration `0018` are developer-applied and catalog-verified; implementation and automated readiness are complete, the independent worker remains stopped, and M16 awaits developer review. M17–M30 preserve the developer-approved sequence and detailed context.

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

## Milestone 14 implementation and acceptance record

### Milestone 14 — Control-plane bootstrap contracts

- Implemented the approved 13-operation Control Plane v1 on shared `PlatformRepository` authority: strict bearer HTTP, OAuth/management separation, owner-only restore, signed authority-bound cursors, serialized receipts/replay, inert versioned Studio registration, stable failures, honest actors, and protected dashboard parity; retired dashboard authoring stayed absent and `sdkSupported` stayed `false`.
- Added the canonical artifact/docs plus complete explicit-origin CLI, content-free retry journal, archive confirmation, and verified `ffd link`. Approved 60-second quotas are global 3,000/capacity 250 and OAuth/management 120/capacity 20, with costs read/list 1, create/lifecycle 5, update 3, and Studio write 5.
- Developer-generated/applied migration `0015_add_control_plane_bootstrap_authorities` passed artifact/catalog inspection, actor/receipt/registration invariants, 24 PostgreSQL scenarios, and cleanup verification. Two worker-isolation mistakes were reconciled and guardedly cleaned; the durable direct-Vitest/worker-stop rule is recorded in `learnings.md`.
- All eight delegated manual scenarios passed OAuth/CLI/linking, dashboard projection, receipt replay/conflict, cursor isolation, role/credential authority, Studio metadata, archive/restore, artifact/package, and redaction checks. Review fixed deterministic journal clearing and component-owned missing-Studio toast handling; disposable state and temporary OAuth configuration were removed.
- Final forced readiness passed 1,259 tests, coverage, contracts, format/lint/structure, 15 type tasks, and eight builds with zero cache hits; artifact SHA-256 is `747cc0c897ed2738adb5bbc476aee6a284d0f10e89ca8208c3a813a59890a935`, high/critical audits are clear, and four moderate Vitest findings remain pending separate upgrade review. Developer accepted/pushed `6ba124a`; no package release, production OAuth/configuration, or deployment occurred.

## Recent and planned milestone record

These entries stay concise because `milestone.md` owns detailed pending context. M15 is accepted, M16 awaits explicit developer acceptance, and M17–M30 remain sequenced context. Earlier scope remains represented in M21–M23 and M27.

### Milestone 15 — Governance automation parity

- Approved design `07bcad6` fixes seven roles and `all | selected | none`, applies complete member/invitation policy atomically, retires standalone role/locale mutations, keeps invitation issue non-replayable with list/search → revoke → reissue recovery, leaves custom policy to M21, and excludes governance from the SDK.
- Shared `ProjectActor` authority preserves optimistic/idempotent/last-owner/race semantics, tenant-qualified locale grants, exact actors/audits, receipt-backed locale creation, and one canonical permission projection. Control Plane v1 grew from 13 to 27 operations with separate OAuth authority, signed bound cursors, bounded telemetry/errors, and explicit-origin CLI parity including strict flags, current-`main` projection, content-free journals, and stdin-only invitation proof.
- Developer-generated/applied `0016_add_governance_automation_authorities` passed dependency, artifact/catalog, 17-journal-row/60-table, policy/actor/tenant/English, and fixture checks. Authorized cleanup removed 37 stale M2/M3/M6 rows with zero residue. Final readiness passed 1,270 tests, coverage, contracts, format/lint/structure, 16 type tasks, and eight uncached builds; artifact/baseline SHA-256 is `2950b28d937ef48b9ce7db98cb4dd477396b4ee0b16ea9fb7dfdef672f670145`, with no high/critical audit findings and four existing moderate test-tool findings.
- Two-session headed review passed invitation/member policy, owner/stale/conflict/ambiguous recovery, filters, exact-locale denial, keyboard/focus, 375 px, and 200% reflow; fixes covered login/direct-link hydration, rendered links, favicon, fixture text, and locale overflow. It also established the project-owned pinned `tools/browser-tests` Chromium suite, loopback-only four-test regression, opt-in interactive skill, and no-interactive/no-visual-artifact default. The handled missing-Studio lookup remains the expected console 404; guarded cleanup left no browser/token/fixture residue and the stopped worker was restored healthy. Developer accepted/pushed `5460c2b`.

### Milestone 16 — Operational administration and recovery

- Approved 2026-09-16 design establishes digest-only pending → fixed 24-hour overlap → complete/cancel credential rotation; honest user/management-credential webhook, invalidation, delivery, and replay administration; user-only `project.audit.read` with three exact OAuth grants and a 31-day bound; summary/detail delivery projection; and archive-time operational freeze. Stable HTTP, noninteractive CLI, and hosted sessions share authority; one-time secrets are non-replayable, while Studio and the public SDK remain excluded.
- Developer-generated/corrected/applied `0017_add_operational_administration_authorities` added explicit credential/rotation authority, tenant-qualified actors, and audit indexes. Catalog checks found 18 journal rows/61 tables, exact active-or-revoked backfill for all 130 credentials with `activated_at = created_at`, no synthetic rotations, and zero authority violations; SQL SHA-256 is `6afe41d9cb4cb8de9f58d32c41e6f573d9cc76e0e1ca12f3b3ba6939de02e3f3`. Archive testing then found the zero-attempt `project_archived` outcome mismatch; developer-generated/applied `0018_allow_unattempted_archived_delivery_outcome` permits only that canceled-row exception. Full artifact inspection found no unrelated drift; the live journal has 19 rows, the constraint is validated, residue/invariants are clean, and SQL SHA-256 is `d97ff13f7ca55d43334b7905589ff64c3b54e4b8f7187fcdfed41b5b5a7449d7`.
- Shared Effect repositories provide staged credential recovery and generic verification failure, signed operational pagination, set-based webhook summaries, exact actor attribution, receipt-backed mapping/replay, bounded self-auditing audit reads, and archive-safe dispatch/claim/finalization. Archive integration proves queued cancellation, terminal in-flight failure, preserved in-flight success, and no restore resurrection; a monotonic-time fixture fixed test-only lease-throttle interference and passes worker/platform/archive suites concurrently.
- Control Plane v1 now has 52 strict bearer operations with separate OAuth grants, exact management-credential webhook authority, canonical HTTP policy/costs/OpenAPI, and additive artifact/baseline SHA-256 `0be7c1bc603cdf17e2c775509c58dc9f716eeced59d0ebab9a8e13cfad39d90c`. CLI parity includes `--secret-stdout`, stdin-only destinations, exact confirmations, no credential/audit management fallback, and content-free conflict-safe journals. Hosted controls/docs cover credential recovery, webhook/delivery/mapping administration, archived recovery-only rendering, bounded audit, and secret-safe operations.
- Authorized headed Chromium review passed credential/webhook disclosure containment and staged lifecycle, consequence gates, exact filters, unique fixed-snapshot pagination, archive allowlists/restore-no-replay, keyboard/focus, 375 px, and 200% reflow. It corrected millisecond-truncated audit bounds, falsely local-only “URL-backed” filters, missing SSR oRPC cookie forwarding, and focus loss from programmatic/replaced dialogs. The expected missing-Studio 404 is unchanged; exact guarded cleanup removed both disposable fixtures, sessions, secrets, and browser artifacts with zero residue.
- Final `pnpm run ready` passes 1,311 tests, coverage, contract drift, format/lint/structure, 16 type tasks, four noninteractive Chromium specifications, and eight builds. High/critical audit is clear with four existing moderate test-tool findings; complete credential redaction and read-only reconciliation report zero scoped residue, orphans, invalid outcomes, archived claimable work, or non-idle test clients. The worker remains stopped.
- **M16 `[R]`:** implementation and automated/interactive evidence are ready for explicit developer acceptance. The isolated sustained two-worker profile and production rollout/baseline checks remain environment gates; no commit, acceptance, publication, deployment, production OAuth/configuration change, worker restart, or M17 work has occurred.

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

- The accepted M15 baseline passes forced readiness with 1,270 tests, coverage, contracts, format/lint/structure, 16 type tasks, and eight builds; shared-database residue/invariants are clean and the worker is healthy after restoration.
- Canonical OpenAPI SHA-256 values are Authoring `d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205` and Control Plane `2950b28d937ef48b9ce7db98cb4dd477396b4ee0b16ea9fb7dfdef672f670145`.
- The live schema records developer-applied migrations through `0016`; actor, tenant, locale, receipt, publication, outbox, and webhook invariants are clean.
- Schema/SDK/CLI packages remain unpublished at `0.0.0`; schema push and Presentation mutation remain CLI-only, and production OAuth/configuration/deployment plus Tier 2 production/default activation have not occurred.

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
| `0016`        | M15           | Invitation locale policy, locale credential actors, and locale-create receipts      |
| `0017`        | M16           | Operational credential, webhook actor, replay, and audit authority                  |
| `0018`        | M16           | Archive-safe zero-attempt delivery outcome invariant                                |

## Roadmap and next gate

- `milestone.md` owns the approved sequence and preserved boundaries; M15 is accepted at `5460c2b`, and M16 is awaiting developer review with both migrations applied and the worker stopped.
- M17–M30 design/implementation remain unauthorized until their developer gates; managed hosting, external data/backends, billing, analytics, and plugins remain unsequenced until the visual baseline is accepted.
- Publication/versioning, production OAuth/domains/configuration, deployment, migrations, Tier 2 activation, milestone acceptance, and advancement remain developer-controlled.
