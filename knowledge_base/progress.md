# CMS Development Progress

**Overall status:** Milestones 0–13 are developer-approved and committed. Repository/context optimization is complete and awaiting developer review before the next milestone is defined.
**Active milestone:** None — this is an explicitly authorized pre-milestone maintenance workstream.
**Last updated:** 2026-08-29

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
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

The next milestone is intentionally undefined until this maintenance workstream is approved. Earlier M14–M16 placeholders are not active plans.

## Current maintenance workstream

- `[x]` Reconcile M13 approval with Git commit `9c68942` and remove stale pending status.
- `[x]` Rewrite this file as one ordered, concise milestone record rather than interleaved checklists and reverse-ordered evidence.
- `[x]` Reduce `learnings.md` to the requested two-field format without deleting durable lessons or prevention rules.
- `[x]` Move always-on agent rules into Pi’s auto-loaded root `AGENTS.md`; keep deeper rules and skills selectively loaded.
- `[x]` Add a decision index that tells agents exactly when prior decisions are relevant; do not require chronological decision loading.
- `[x]` Improve repository discovery and enforce ordered progress, concise learnings, complete decision routing, test placement, established domain ownership, universal implementation/test ownership, and repeated sibling-prefix ownership across all 16 workspaces plus root scripts.
- `[x]` Reorganize the repository-wide flat module families into dedicated owner directories, including every colocated implementation/test pair, the complete API contract surface, deeper API kernels/services/operations/scripts, CLI command/schema/editor/generator workflows, dashboard features, package modules, UI prefix families, developer-portal checks, and utility scripts. Preserve generated route conventions, package export paths, direct imports, and runtime behavior without introducing internal barrels.
- `[x]` Remove the obsolete ignored 92 MiB `tmp/` tree containing M13 evidence, fixtures, package archives, installs, and an applied-migration draft; all contents were reproducible or already recorded in authoritative sources.
- `[x]` Pass formatting, lint, generalized structure enforcement, contract drift, all 15 type-check tasks, 1,184 tests, coverage, and all eight production builds with the worker stopped for shared-database gates. Across server, worker, CLI, dashboard, and developer-portal outputs, all 1,089 JS/CSS artifact counts remain unchanged while aggregate output decreases by 822,525 raw bytes and 201,790 gzip bytes to 43,467,370 raw/8,706,685 gzip; legal and optimizer annotations remain preserved, and the server remains seven chunks, and rebuilt PostgreSQL/Redis/server/web/worker services are healthy.
- `[x]` After a worker-isolation mistake projected two test graphs, obtain explicit cleanup approval, delete only the reconciled scope in a guarded transaction, verify zero residue, rerun all 138 server integration tests with the worker stopped, and restore it healthy. The existing worker-isolation learning already covers the prevention rule.
- `[R]` Stop for developer review before defining or implementing the next milestone.

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
- Dashboard collection/field/layout/schema publication mutation is retired with stable authenticated `410 DASHBOARD_SCHEMA_AUTHORING_RETIRED`; content, editorial Presentation, Delivery, navigation, and read-only structure remain.
- Developer generated/applied `0013_add_code_first_authoring_authorities` and `0014_normalize_authoring_actor_foreign_keys`; final readiness passed 1,184 tests; commit `9c68942`.

## Current validation and release state

- Accepted M13 baseline: `pnpm run ready` passed 1,184 tests, 15 type-check tasks, public-contract drift, formatting, lint, structure, coverage, and eight builds with the independent worker stopped during shared-database gates and healthy afterward.
- Reported final suites include 723 API, 138 server, 115 dashboard, 105 CLI, 18 SDK, and 13 content-form tests. Focused retirement/authority suites passed 19 API, 22 dashboard/accessibility, and 78 server tests.
- Canonical Authoring OpenAPI SHA-256 is `d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205`.
- The live schema records migrations through `0014`; post-cleanup source/hash/actor/head/FK/receipt/webhook invariants and supported outbox projection were clean at acceptance.
- Schema, SDK, and CLI release Changesets/package metadata are staged but versions are still `0.0.0`; no package has been published.
- Production OAuth rollout, production configuration, deployment, and Tier 2 production/default activation have not occurred.

## Database migration record

Agents did not generate or apply these migrations. Developer-generated/applied artifacts under `packages/db/src/migrations/` are immutable.

| Migration     | Owner         | Purpose                                                |
| ------------- | ------------- | ------------------------------------------------------ |
| `0000`–`0001` | Foundation/M2 | Authentication and platform kernel                     |
| `0002`        | M3            | Memberships, policies, credentials                     |
| `0003`        | M4            | Project locales and locale access                      |
| `0004`        | M5            | Versioned collection schemas                           |
| `0005`        | M6            | Recursive fields, validation, editor layout            |
| `0006`–`0007` | M7            | Entries, multilingual revisions, entry names           |
| `0008`        | M8            | Locale publications and Delivery snapshots             |
| `0009`        | M9            | Delivery configuration and typed read model            |
| `0010`–`0011` | M11           | Webhook delivery system and outbox limit               |
| `0012`        | M12           | CLI OAuth device authorization                         |
| `0013`–`0014` | M13           | Code-first source/hash/receipt authority and actor FKs |

## Next direction — not yet a milestone

The developer’s approved product direction is a three-surface model over shared API authority:

1. `framerfordevs.com` for marketing, documentation, and authentication entry.
2. `dashboard.framerfordevs.com` for hosted account/workspace/project control-plane operations and recovery.
3. A framework-neutral, project-specific Studio mounted at a developer-configured path for content, editorial layout, preview, and the future visual editor.

Every meaningful operation must also be available through stable, noninteractive, machine-readable CLI/SDK contracts so agents do not require browser workflows. The next milestone’s exact scope and design will be created only after this maintenance workstream receives developer approval.
