# CMS Development Progress

**Overall status:** Milestones 0–18B and post-M13 repository/context normalization are developer-approved, committed, and pushed. The approved M19A Studio platform/content-protocol implementation has completed its validation candidate and awaits independent review.
**Next gate:** Independent M19A review. M19B and every release action remain gated.
**Last updated:** 2026-09-29

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[D]` Design pending
- `[P]` Planned and sequenced; design not started
- `[R]` Awaiting developer review or a separately required implementation authorization
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
| 16  | Operational administration and recovery | `[A]`  |          1,311 | `c3f9430` |
| 17  | Hosted surface separation               | `[A]`  |          1,422 | `d6b506d` |
| 18  | Studio authority/runtime parent         | `[A]`  |          1,559 | `c38b7db` |
| 18A | Studio platform authority               | `[A]`  |          1,498 | `317a295` |
| 18B | Studio mount and security runtime       | `[A]`  |          1,559 | `c38b7db` |
| 19  | Studio content and localization         | `[R]`  |              — | —         |
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

M17 is accepted at `d6b506d`; M18A is accepted and pushed at `317a295`; M18B is accepted and pushed at `c38b7db`; migrations `0017`–`0021` are developer-applied/catalog-verified and the independent worker remains stopped. M19A awaits independent review; M19B and M20–M30 remain gated.

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

These entries stay concise because `milestone.md` owns detailed pending context. M15–M18B are accepted. Earlier scope remains represented in M21–M23 and M27.

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
- **M16 `[A]`:** developer accepted, committed, and pushed `c3f9430`. The isolated sustained two-worker profile and production rollout/baseline checks remain environment gates; no publication, deployment, production OAuth/configuration change, worker restart, or M17 implementation occurred.

### Milestone 17 — Hosted surface separation

- Renamed the hosted application to `apps/dashboard`, added independent minimal `apps/marketing`, and kept docs-only `apps/developers`; exact validated origins, build inputs, Docker/Compose ownership, navigation, and canonical recovery links now reflect the three hosts. Marketing owns only a brief landing page and a bounded `/login` redirect; invalid or duplicate input returns 404 with `no-store`.
- Added trusted-ingress-aware closed host/path profiles. Dashboard proxies only auth, canonical Control Plane v1, and narrowly retained editorial oRPC; unknown hosts and cross-profile paths fail closed. `CORS_ORIGIN`, `VITE_SERVER_URL`, and active `apps/web` references are removed.
- Dashboard authentication uses a host-only `HttpOnly`, `SameSite=Lax`, `Path=/` cookie and dashboard-owned consent/continuation UI while API-host OAuth metadata retains the API issuer. Split-host signup/session, device authorization/approval/token/refresh/verification, and host/path compatibility gates pass.
- Canonical Control Plane operations now accept either API bearer principals or dashboard session principals at the host boundary without duplicating business authority; dashboard governance and operations use bounded canonical request/response adaptation while API-host Control Plane remains bearer-only.
- Final automated validation passes formatting/lint/structure, contract drift, 17 type tasks, 1,422 tests, coverage, nine production builds, and ten retry-free headless Chromium specifications. Exhaustive matrices cover all 57 dashboard transport mappings and all 52 canonical Control Plane routes across API-cookie denial, dashboard-bearer denial, dashboard-session reachability, CSRF/Fetch Metadata/content-type handling, request correlation, rate limits, `Vary`, and `no-store` behavior. Review follow-up removed stale OAuth-only guards from user-only credential and audit handlers, added a bounded credential-list failure state, and removed quota masking from the 52-route matrix so every session request must complete without a 429.
- Fresh Compose images are healthy with the worker stopped; all three public apps pass independent-outage probes, browser assets contain no internal service URL or secret value, images contain no environment, coverage, or browser-result artifact, and the docs image prerenders all 45 routes after pinning its build-time preview listener to IPv4. A built-dashboard session credential probe now completes through same-origin ingress rather than remaining pending. The ten browser specifications cover cross-host navigation/redirect denial, host-only cookie and storage isolation, direct recovery routes, canonical/robots policy, runtime diagnostics, and automated WCAG A/AA scans.
- **M17 `[A]`:** developer accepted, committed, and pushed `d6b506d`. Production ingress source restriction/DNS/TLS remains an M23 deployment gate; direct access to a server configured to trust forwarded authority must therefore stay unavailable. No migration, package publication, production configuration/rollout, deployment, or M18 implementation occurred; the worker remains stopped.

### Milestone 18 — Studio authority/runtime split

#### M18A — Studio platform authority

- External review concerns were checked against current policy, rate-limit, OAuth, Redis, registration, audit, and roadmap authority; the approved design splits platform delegation from the developer runtime because the combined scope crossed the M13 sizing boundary.
- M18A fixes explicit registration activation, deterministic registration-derived OAuth Code + S256 PKCE, current-user pre-authorization, forced project/origin-specific acknowledgement, shared Studio quotas, fail-closed session-establishment audit with a synchronous response-gating fallback, and a safe bootstrap-only Studio API.
- The private test-only public OAuth harness now proves the pinned provider compatibility gate: signed split-host continuation; forced consent and denial despite prior consent; public Code + S256 PKCE; exact early redirect plus resource/scope/issuer/audience binding; current-policy denial; grant/version claim continuity through refresh; code/refresh replay denial and revocation; five-minute stateless JWT access tokens; eight-hour persisted refresh tokens; shared atomic rate-storage hooks; synchronous audit-failure response gating; and construction of the bootstrap request.
- Compatibility evidence corrected Better Auth continuation to send `postLogin: true`, allowlisted the exact Studio audience in JWT verification without weakening Tooling, and added an early database-backed Studio redirect guard because the pinned provider otherwise returned a late error through the unregistered URI. The harness remains a private development-only dependency behind repository import/manifest checks.
- Studio v1 now has closed bootstrap/token/consent/error schemas, deterministic exact-byte OpenAPI generation, registration-derived client/callback/claim kernels, current token/grant/version binding, role-projected shell actions, runtime-transition and metadata-invalidation kernels, and the five approved `studio.oauth.*`/`studio.*` quota policies. Drizzle now models default-inactive runtime status, coherent exact user/time authority, active lookup indexes, and runtime command receipts.
- The completed runtime path atomically activates/deactivates registration-derived authority, invalidates active metadata changes, revokes tokens/consent, emits transactionally aligned audit/receipt state, and is available through canonical Control Plane HTTP, CLI, and dashboard controls. Management credentials cannot activate runtime trust.
- The developer generated `0019_add_studio_runtime_authority`. Full artifact review confirms the SQL adds only the approved default-inactive runtime columns, exact user FK, active lookup/runtime-actor indexes, coherent status/actor/time checks, and expanded receipt constraints. Snapshot `0019` chains to `0018`, retains all 61 tables, changes only `control_plane_command_receipt` and `studio_registration`, and journal entry 19 is contiguous.
- The developer applied migration `0019`. Read-only catalog verification confirms migration row 20 with the exact journal timestamp, all three runtime columns, all six intended receipt/runtime constraints, both partial indexes, and zero incoherent registration rows; existing registration authority remains inactive by default.
- The production OAuth and bootstrap path now enforces current active registration/version/client/resource/project/CMS/membership/consent/grant/audit authority, stable grant continuity tied to current unrevoked refresh authority, five-minute access/eight-hour refresh bounds, exact bearer-only bootstrap contracts, shared global/user quotas, production Redis fail-closed behavior, browser-origin/preflight denial, and bounded no-store responses. Independent review additionally made JWT audience/scope sets exact and explicitly rejects cookies and duplicate Authorization at the Studio boundary. Dashboard acknowledgement names the exact project and canonical application origin and requires explicit keyboard-operable Allow or Deny for each new session.
- The pre-remediation readiness checkpoint passed format, lint, structure, contract drift, 18 type tasks, 1,495 tests including 13 retry-free noninteractive Chromium specifications, coverage, nine builds, and `git diff --check`. Accessibility covered runtime controls, exact project/origin acknowledgement, focus/recovery, 375 px, 200% zoom, and WCAG A/AA automation. All five production images contained no test/browser/coverage/environment/harness fixture residue; the high/critical audit gate was clear with four moderate findings. Read-only catalog/index-plan and residue checks confirmed migration row 20/timestamp, three columns/six constraints/two intended indexes, index eligibility, and zero scoped residue. That checkpoint's Control Plane digest was `9cfe2052930a7059f0e48ddaae4dae4a712b72544039279bf25a68d83a2ce7ac`; standalone 30,112-byte Studio OpenAPI remains `e8daa1e9e8b2d16b966cb5f30a019eda73ead1846f8ab151265123a5ee540745` without premature baseline registration.
- Review remediation subsequently removed the unordered eight-row active-grant lookup, added a nine-concurrent-session regression, and approved an explicit authority split: active metadata edits and activation are user-only, while an exact management credential may only force `active -> inactive`. The existing registration actor-union columns and audit identify credential deactivation; user-only runtime confirmation fields clear rather than implying human confirmation. Developer-generated `0020_allow_studio_credential_kill_switch` is an exact constraint-only successor: SQL only drops/re-adds `control_plane_command_receipt_scope_result_valid`, snapshot 0020 changes only that constraint and chains from 0019, and journal index 20/timestamp is `1790399741342`. The developer applied it; read-only evidence confirms migration row 21, the expected constraint, three runtime columns, six intended constraints, two eligible indexes, and zero incoherent rows.
- Fresh post-remediation readiness passes format, lint, structure, contract drift, 18 type tasks, 1,498 tests including 13 retry-free noninteractive Chromium specifications, coverage, and nine builds. Five fresh production images build and contain no environment, test, coverage, browser-result, OAuth-harness, or M18 fixture residue. The audit gate has no high/critical findings and four reviewed moderate test-tool findings. Final read-only evidence is clean for scoped users, workspaces, projects, registrations, audits, receipts, OAuth authority, webhook fixtures, claimable outbox, incoherent runtime rows, and non-idle peer clients; Control Plane and Studio digests are `3dd7c890b7a0448bfb497db663fadfee7f3eeaf614a026e405da3638a595d59b` and `e8daa1e9e8b2d16b966cb5f30a019eda73ead1846f8ab151265123a5ee540745` (30,112 bytes).
- **M18A `[A]`:** independent review found no unresolved acceptance issue; the developer accepted, committed, and pushed `317a295`. No rollout, deployment, package publication, production configuration, or M18B implementation occurred; the independent worker remains stopped.

#### M18B — Studio mount and security runtime

- Revalidated against accepted M18A as a separate developer-runtime gate: the BFF keeps opaque tokens in exact A256GCM attempts/sessions, validates callback/refresh through real bootstrap, registers the accepted Studio artifact baseline, and mounts one client-rendered empty shell through raw-target plus canonical Fetch handling and thin Express/TanStack adapters.
- The confirmed design fixes an absolute-eight-hour compatibility correction, a portable ASCII active-mount profile, exact `__Secure-`/loopback cookies, pre-dispatch refresh fencing, fail-closed Redis/restore semantics, source-controlled local limits, response/CSP/cache matrices, and five package boundaries. M18B requires no migration.
- One exact `main` origin is supported; preview-origin lifecycle, trusted-source quotas, broad/edge portability, content operations, publication, and deployment remain excluded. Local logout keeps the dashboard identity session and every new Studio session still requires acknowledgement.
- The developer approved the confirmed design, intentional portable-mount narrowing, implementation sequence, and unchanged pre-M23 no-trusted-source-bucket risk.
- The migration-free compatibility checkpoint preserves broad M14 registration metadata while enforcing the portable active-mount profile and one audit-anchored absolute eight-hour grant deadline across refresh, cookies, re-encryption, verification, and bootstrap.
- Added five private `0.0.0` packages: browser-only `@framerfordevs/studio`, framework-neutral Effect/Fetch `studio-server`, restart-stable shared `studio-store-redis`, and thin Express 5/TanStack Start adapters. The core validates exact raw request targets and origins, uses the platform-compatible `/auth/login`, `/auth/callback`, and `/auth/logout` routes, keeps only opaque exact-path cookies in browsers, encrypts attempts/sessions with expiry/generation-bound A256GCM key IDs, re-encrypts on read, strictly validates the accepted bootstrap DTO and five-minute access expiry without decoding tokens, and fences refresh ownership before provider dispatch with terminal post-dispatch recovery.
- Added atomic Redis attempt/session quotas and reauthentication replacement, one-shot callback consumption, registration-slot-safe keys, distributed callback/waiter permits, exact source-controlled registration/session limits, refresh leases/generations, fail-closed logout/outage behavior without production memory fallback, restart/multi-client evidence, redacted bounded telemetry, immutable hashed assets, strict CSP/cache/security headers, and exact adapter header/cookie parity.
- Added an accessible responsive TanStack Router/Query empty shell composed from shared UI primitives, explicit sign-in/session/error/logout and canonical dashboard recovery, a 127,924-byte gzip initial-transfer budget gate, browser-forbidden-import checks, tarball allowlist inspection, and a retry-free mounted sign-in/bootstrap/sign-out flow. Registered Studio v1 in the canonical immutable public-contract registry and developer portal at SHA-256 `f3a70dee4d72057a3df982a6b4a4ff5192daea850b57810cfeb7caa498ef5b03` (30,112 bytes).
- **M18B `[A]`:** independent review found no unresolved acceptance issue; the developer accepted, committed, and pushed `c38b7db`. Formatting/lint/24-workspace structure, contract drift, 23 type tasks, 1,559 tests plus coverage, all 14 committed browser specifications, 14 production builds, bundle/package inspection, and fresh server/dashboard/developer-image inspection pass. The production audit has no high/critical findings; its four moderate findings are the same transitive Vitest dev-server arbitrary-read advisory through Better Auth in server/dashboard production dependency metadata, reviewed as non-executable in these production runtimes. No migration, publication, production OAuth/configuration, rollout, deployment, or M19 implementation occurred.

### Milestone 19 — Studio content and localization

- `[A]` Developer approved `decisions/m19-studio-content-and-localization-design.md` and authorized M19A: valid M6/M13 Presentation cannot hide a non-empty collection from owners/developers; bounded owner/developer-only `empty_schema | projection_invalid` notices and a typed closed-reason route error cover residual states, while every other role/foreign scope retains identical `NOT_FOUND`.
- Implemented the separate Studio Content v1 companion protocol without changing accepted Studio/Authoring/Control Plane v1 bytes: exact-locale context, bounded browse/literal-prefix search, purpose-bound signed cursors, role-projected workspaces, stable-ID create/rename/save, explicit stale schema/draft/name/command conflicts, and finite token-hiding BFF routes. M6’s historical `{}` editor metadata expands to owner/developer-visible/editable defaults and is regression-locked.
- All seven nested operation families share the same projection/configuration gate and deterministic `STUDIO_COLLECTION_CONFIGURATION_INVALID` behavior. `projection_invalid` emits safe telemetry plus one response-gating `cms.schema.projection_invalid_detected` audit per immutable revision through deterministic primary-key conflict handling and exact prior-row verification; `empty_schema`, other roles, and foreign scopes remain unaudited/non-enumerating.
- The developer generated and applied `0021_add_studio_entry_name_search_index`; SQL/snapshot/journal inspection and read-only catalog verification passed. A rollback-isolated 100,000-entry fixture proves browse, prefix search, continuation, and capped-count index plans without sort; concurrent create/rename continuation and wildcard escaping pass.
- Registered immutable `studio-content/v1` at SHA-256 `c9226fdcc767d704a41e100a5440560afbb7f64977209f82d42dad20bc48a9fc` with `sdkSupported: false`, public host ownership, and developer-reference routing after the developer-authorized final-review correction for valid sidebar-only role projections. Accepted Authoring, Control Plane, and Studio v1 digests remain unchanged.
- M19A final readiness passes format/lint/structure, contract drift, 23 type tasks, 1,642 tests plus coverage, all 14 retry-free browser specifications, and 14 builds. The 100,000-entry fixture also enforces database p95 below 150 ms for browse/search and below 300 ms for search plus capped count; separate 20-sample platform and BFF checks enforce browse/search below 500 ms and workspace assembly below one second. Final hardening adds strict operation-specific BFF success decoding, browser-abort/platform-deadline interruption, exhaustive create/save transaction failpoints, explicit zero-publication/snapshot/outbox draft invariants, safe closed-field anomaly logging, sidebar-only projection preservation, the real closed configuration reason, the BFF 2 KiB search cap, and database-authoritative Unicode query folding.
- The production audit remains clear of high/critical findings. Five moderate findings are reviewed as unchanged, non-runtime-referenced test-tool dependency paths: four Vitest/mocker findings and one Undici finding through Better Auth → Vitest → jsdom; `pnpm-lock.yaml` is unchanged. Fresh changed server/developer images build with production-only environment metadata, start healthy without the worker, and contain no project test, environment, coverage, source-map, OAuth-harness, or browser-result residue; the Studio-server tarball contains only its declared dist/license/manifest allowlist. Final catalog/residue checks find the search index valid/ready, zero M19 rows/anomaly audits/orphans/incoherent registrations, zero non-idle clients or lock waiters, and the worker stopped. M19A now awaits independent review. M19B, package publication, production configuration, rollout, deployment, acceptance, commit, and M20 remain developer-controlled.

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

- M17 is accepted at `d6b506d`; M18A is accepted at `317a295`; M18B is accepted at `c38b7db`. The accepted baseline remains M18B; the unaccepted M19A review candidate passes 1,642 tests, 23 type tasks, 14 browser specifications, coverage, and 14 builds.
- Current source OpenAPI SHA-256 values are Authoring `d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205`, remediation Control Plane `3dd7c890b7a0448bfb497db663fadfee7f3eeaf614a026e405da3638a595d59b`, immutable 30,112-byte Studio `f3a70dee4d72057a3df982a6b4a4ff5192daea850b57810cfeb7caa498ef5b03`, and Studio Content `c9226fdcc767d704a41e100a5440560afbb7f64977209f82d42dad20bc48a9fc`.
- The live schema records 22 developer-applied migrations through reviewed migration `0021`, exact journal timestamp `1790569128095`; its intended partial prefix index is ready and valid, and final query-plan/activity evidence is clean.
- Schema/SDK/CLI and all five Studio runtime packages remain unpublished at `0.0.0`; production OAuth/configuration/deployment and Tier 2 production/default activation remain gated.

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
| `0019`        | M18A          | Studio runtime authority, actors, receipts, and active lookup indexes               |
| `0020`        | M18A          | Management-credential Studio deactivation receipt authority                         |
| `0021`        | M19A          | Tenant-qualified Studio entry-name prefix-search index                              |

## Roadmap and next gate

- `milestone.md` owns the approved sequence and preserved boundaries; M17 is accepted at `d6b506d`, M18A migrations `0019`–`0020` are developer-applied, M18B is accepted at `c38b7db`, M19A migration `0021` is developer-applied, and the worker remains stopped.
- M19A Studio platform/content-protocol implementation awaits independent review; M19B and M20–M30 remain gated. Managed hosting, external data/backends, billing, analytics, and plugins remain unsequenced until the visual baseline is accepted.
- Publication/versioning, production OAuth/domains/configuration, deployment, migrations, Tier 2 activation, milestone acceptance, and advancement remain developer-controlled.
