# Agent Session Context

**Last updated:** 2026-08-23
**Current phase:** Milestone 13 design developer-approved; implementation is not authorized
**Active milestone:** None — M13 dependency evidence and implementation require separate developer direction

## Product in one paragraph

Framer for Devs is a backend-agnostic visual frontend and website-operations platform. Its first capability is a headless CMS where developers publish versioned schemas, clients author permissioned multilingual content, each locale publishes independently, and external frontends consume immutable published JSON plus reliable change events. Future visual sites must bind to the same stable project, schema, field, entry, locale, and publication identities without migrating content.

## Start here

For a new task:

1. Inspect `git status` and recent `git log` first.
2. Read `knowledge_base/product.md`, `knowledge_base/prd/cms.md`, and every rule linked from `knowledge_base/rules/index.md`.
3. Read this file completely.
4. Read the status header, milestone tracker, and current-work section of `knowledge_base/progress.md`.
5. Read only the active milestone section of `knowledge_base/milestone.md`.
6. Inspect the owning source, tests, package configuration, and package exports before planning changes.
7. Search `knowledge_base/learnings.md` by the task's domain and read matching entries.
8. Read only decision records whose contracts or trade-offs the task depends on. Use the decision map below; do not preload every historical decision.

When there is no active milestone, stop after discovery and obtain explicit developer direction before starting the next milestone or changing product scope.

## How to establish truth

- Committed source, tests, package configuration, migration history, and generated route/schema artifacts are the executable truth for what the repository currently does.
- Product, PRD, rules, milestone criteria, and relevant approved decisions define what the repository is intended and permitted to do.
- If implementation and governing requirements disagree, report the drift; do not silently treat either side as disposable.
- Git is authoritative for commit, branch, and working-tree state.
- Decision records preserve rationale and load-bearing constraints. They are not a substitute for reading current code and tests.
- Prefer targeted discovery with `rg`, package manifests, exports, entrypoints, and neighboring tests. Expand only when an import, contract, database relation, or invariant crosses into another domain.

## Stack and workspace boundaries

- **Monorepo:** pnpm workspaces and Turborepo
- **Web:** React 19, TanStack Start/Router/Query/Form, Vite, Tailwind, shadcn/ui
- **Server:** Node.js, Express 5, oRPC/OpenAPI, Better Auth
- **Application model:** stable Effect v3 with typed errors, services, Layers, and shared `ManagedRuntime` boundaries
- **Data:** PostgreSQL 18, Drizzle ORM; Better Auth keeps its supported Drizzle adapter
- **Observability:** structured redacted logs and OpenTelemetry-compatible traces/metrics
- **Testing:** Vitest and `@effect/vitest`; scoped tests follow `knowledge_base/decisions/repository-test-structure.md`

Workspace ownership:

```text
apps/web       browser application and SSR UI
apps/server    Express/oRPC/public HTTP process boundary
apps/worker    publication-event dispatch and webhook delivery process
packages/api   contracts, domain kernels, Effect operations/services, repositories
packages/auth  Better Auth configuration and protocol boundary
packages/db    Drizzle schema, immutable migration history, query exports
packages/env   validated server/browser environment contracts
packages/ui    shared UI primitives and styles
tools/*        private developer, system-test, and operational tooling
```

Apps may depend on package exports. Packages must not depend on apps, and code must not reach into another workspace's internals.

## Non-negotiable product and engineering invariants

- A project is a capability container, never a permanent CMS-only type.
- `main` is the initial visible environment, but environment identity exists in scoped contracts.
- English (`en`) is required. Every content request names an explicit locale; there is no silent fallback.
- Shared values are copied into each immutable locale publication. Editing shared draft state never mutates prior publications.
- Draft changes never leak into Delivery or emit production publication events.
- Stable IDs are distinct from mutable labels and developer-facing API keys.
- Application-owned APIs use the discriminated `{ ok, data, error, message }` contract; protocol-owned Better Auth and webhook payloads keep their native contracts.
- Authorization is server-side, default-deny, tenant/environment scoped, and applied before sensitive work such as DNS resolution.
- External input is untrusted. Validation is bounded, SQL is parameterized, and logs/metrics/errors exclude secrets and content bodies.
- Business workflows use stable Effect v3. Promise/throwing libraries are translated at adapters; `Effect.run*` stays at process/framework boundaries.
- The API server never sends webhooks. Only `apps/worker` performs outbound delivery.
- Database migration generation/application and every real artifact are developer-controlled. Agents never run migration tooling or modify `packages/db/src/migrations/`; for an agreed correction to an unapplied generated migration, they may prepare only a gitignored `tmp/migrations/` draft for developer replacement, then must reinspect the real artifact before application.
- Stop independently running workers before integration or coverage tests that share the development database.
- Agents never commit. Developer review and commits are manual.

## Implemented capability map

All milestones below are developer-approved and committed.

| Milestone | Implemented capability                                                                                                                                                 | Commit    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| M0        | Validated stack, auth/session baseline, CORS, environment checks, Docker health, and test foundation                                                                   | `7d5a312` |
| M1        | Effect runtime boundaries, typed error/API envelopes, request correlation, redaction, tracing, metrics, readiness, and graceful shutdown                               | `c28f6fa` |
| M2        | Workspaces, projects, optional capabilities, internal `main`, owner membership, audits, tenant isolation, and project UI                                               | `60adb39` |
| M3        | Invitations, memberships, fixed role policy, management/Delivery/Preview credentials, rotation/revocation, and access UI                                               | `a74aeb8` |
| M4        | Required English, strict registry-backed BCP 47 locales, locale lifecycle/order, member locale access, and no-fallback contracts                                       | `68b6f6e` |
| M5        | Versioned collection schemas, stable field identity, optimistic drafts, change classification, immutable schema publication, and transactional outbox                  | `28ca04d` |
| M6        | Initial field system, recursive validation, exact decimal/money, Portable Text, external assets, editor layout, visual/JSON schema authoring, and generated forms      | `fbb4767` |
| M7        | Stable entries, CMS-only names, independent shared/locale draft heads, immutable revisions, restore, field policy, pagination, and multilingual editor UX              | `60bd96f` |
| M8        | Exact-locale publish/unpublish, immutable snapshots, publication history/sequences, exact-locale reference authority, atomic audits/outbox, and staleness UX           | `ad3cd5e` |
| M9        | Public/protected Delivery API v1, typed query read model, strict locale, keyset cursors, bounded expansion, HTTP caching, rate limits, and isolated public docs        | `8559aa4` |
| M10       | Bearer-only Preview API v1, current/historical draft projection, expiring Preview credentials, no-store isolation, audits, and dashboard preview                       | `aa177b5` |
| M11       | Canonical publication events, signed webhook endpoints/subscriptions, SSRF-safe worker delivery, retries/dead letters/replay, invalidation mappings, and management UI | `fef7205` |
| M12       | Self-hosted developer documentation, canonical public contracts, Tooling API, OAuth-capable CLI, deterministic generation, typed SDK, and release staging              | `4e87908` |

Post-M11 test normalization is committed at `fe69a76`: focused tests remain colocated; integration, contract, and broad accessibility suites live in categorized workspace-owned `test/` directories; `pnpm run check:structure` enforces the boundary. The concise agent-context and selective-exploration rules are committed at `18618d4`.

## Architecture landmarks

Use these as discovery entrypoints, not as an exhaustive file list:

- **API/error/runtime composition:** `packages/api/src/contracts/api-response.ts`, `packages/api/src/contracts/errors.ts`, `packages/api/src/runtime.ts`
- **Authorization and credentials:** `packages/api/src/services/policy.ts`, `packages/api/src/services/access-repository.ts`, `packages/api/src/services/credential-repository.ts`
- **Locales:** `packages/api/src/contracts/locales.ts`, `packages/api/src/services/locale-repository.ts`
- **Schemas and fields:** `packages/api/src/services/schema-engine.ts`, `packages/api/src/services/schema-repository.ts`, `packages/api/src/lib/field-validation.ts`
- **Entries:** `packages/api/src/services/entry-repository.ts`, `packages/api/src/lib/entry-values.ts`
- **Publication:** `packages/api/src/services/publication-engine.ts`, `packages/api/src/services/publication-repository.ts`, `packages/api/src/lib/publication-snapshot.ts`
- **Delivery:** `packages/api/src/services/delivery-read-repository.ts`, `packages/api/src/operations/delivery-public.ts`, `apps/server/src/app.ts`
- **Preview:** `packages/api/src/services/preview-repository.ts`, `packages/api/src/operations/preview-public.ts`
- **Webhooks:** `packages/api/src/services/webhook-repository.ts`, `packages/api/src/services/webhook-worker-repository.ts`, `packages/api/src/operations/webhook-attempt.ts`, `apps/worker/src/index.ts`
- **Database:** `packages/db/src/schema/`, `packages/db/src/migrations/`
- **Dashboard:** `apps/web/src/routes/`, `apps/web/src/components/`
- **Public webhook consumer harness:** `tools/webhook-test-receiver/`

## Selective decision map

Read a decision only when the task changes, consumes, or must preserve that domain:

| Domain                                 | Decision record                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| Effect runtime, errors, observability  | `knowledge_base/decisions/m1-effect-boundaries.md`                                    |
| Workspaces/projects/capabilities       | `knowledge_base/decisions/m2-platform-kernel-design.md`                               |
| Membership, policy, credentials        | `knowledge_base/decisions/m3-access-and-credentials-design.md`                        |
| Locales and locale access              | `knowledge_base/decisions/m4-project-locales-design.md`                               |
| Collection schema lifecycle            | `knowledge_base/decisions/m5-versioned-schema-engine-design.md`                       |
| Fields, rich text, assets, forms       | `knowledge_base/decisions/m6-field-system-and-generated-forms-design.md`              |
| Entries, drafts, revisions             | `knowledge_base/decisions/m7-entries-multilingual-drafts-and-revisions-design.md`     |
| Publication and immutable snapshots    | `knowledge_base/decisions/m8-independent-locale-publication-and-snapshots-design.md`  |
| Delivery API and caching               | `knowledge_base/decisions/m9-production-delivery-api-design.md`                       |
| Preview API and UX                     | `knowledge_base/decisions/m10-preview-api-and-ux-design.md`                           |
| Publication events and webhooks        | `knowledge_base/decisions/m11-publication-events-webhooks-and-invalidation-design.md` |
| Developer portal and generated tooling | `knowledge_base/decisions/m12-developer-portal-and-generated-tooling-design.md`       |
| Code-first authoring and local editor  | `knowledge_base/decisions/m13-code-first-authoring-and-local-editor-design.md`        |
| Test placement and ownership           | `knowledge_base/decisions/repository-test-structure.md`                               |

For cross-cutting work, follow imports and invariants to identify every genuinely affected row. Do not read unrelated milestone records merely because they are older prerequisites.

## Current validation baseline

The renewed complete M12 automated readiness gate passes:

- `pnpm run ready`
- 962 tests: API 630, server 120, web 124, environment 16, worker 2, webhook receiver 15, public contracts 4, SDK 10, CLI 32, developer portal 9
- API coverage: 89.97% statements and 74.68% branches; SDK 82.69%/71.35%; CLI 78.02%/83.85%; dashboard web 74.50%/79.58%; developer portal behavior tests cover public boundaries, links, canonical API source paths, and representative MDX accessibility
- Production/full dependency audits with no known vulnerabilities; Changesets status and package dry-run evidence pass
- Production builds and rebuilt healthy server/web/worker containers; exact Docker-served Tooling artifact bytes pass
- Deterministic OAuth Tooling readiness passes signed discovery/manifest continuation, immutable revision cache semantics, first-page auditing, a 357.01 ms measured p95 below the 750 ms bound, and zero final fixture residue
- Zero pending publication outbox rows, active webhook delivery work, or started attempts after final reconciliation

Treat this as the renewed M12 review baseline, not proof that later working-tree changes still pass. Run task-appropriate checks after changes.

## Current state and next scope

- Migrations `0010`, `0011`, and developer-applied `0012` are immutable; the live schema has 13 migration records.
- Local ignored `apps/server/.env` contains the persistent webhook key ring and enables the worker. Never read or print its values.
- The optional stable named Cloudflare Tunnel is not configured; temporary public Quick Tunnel delivery has already been validated and is not an M11 blocker.
- M12's approved design is `knowledge_base/decisions/m12-developer-portal-and-generated-tooling-design.md`. Better Auth 1.7.1, OAuth Provider dependencies/configuration, Tooling resource validation, and the complete Drizzle auth/OAuth/device/JWT schema authority are implemented.
- M12 migration `0012_add_cli_oauth_device_authorization.sql` is developer-applied and read-only verified. OAuth/device/Tooling-principal integration and the closed four-family public contract registry with canonical artifacts/baselines are implemented. The developer selected the no-migration Tooling integrity authority: verify the reconstructed immutable revision against stored full `schema_hash`, then derive the public contract and `contractHash` only through `compileCollectionContract`. OAuth remains intentionally rollout-disabled; that deployment decision does not block later development.
- The Tooling repository/HTTP boundary, signed cursors, full-revision hash verification, deterministic generator/lock/diff/filesystem transaction, public SDK, OAuth/keychain CLI, Changesets release staging, and separate prerendered developer portal are implemented with focused passing checks. The developer selected MIT for the first SDK/CLI releases. Reviewed tarballs and a clean isolated NodeNext fixture pass; no package has been published.
- OAuth, public registry/artifacts, Tooling API, generator, SDK/CLI, release staging, Tooling readiness, audits, Docker proof, and the Fumadocs correction are developer-approved and committed at `4e87908`. The portal contains 27 source-controlled MDX pages, local static search, and 3 canonical OpenAPI plus 1 canonical webhook reference under one origin. OAuth remains rollout-disabled by the approved deployment choice.
- The developer approved all 19 decisions in `knowledge_base/decisions/m13-code-first-authoring-and-local-editor-design.md` on 2026-08-23 without authorizing implementation; the original `knowledge_base/proposals/m13-code-first-schema-and-local-agent-editor.md` remains proposal input. Before implementation, a separately initiated evidence slice must review/select exact TypeScript/parser/QuickJS candidates, prove credential isolation, measure schema-build budgets, update the record, and receive second dependency/performance approval. No evidence slice, feature implementation, dependency, Drizzle, migration, package-publication, schema-builder removal, or commit action starts without separate developer direction.
- Client handover is now M14, production hardening is M15, and visual-builder readiness is M16.
- M15 owns production host/ingress separation, worker egress firewalling, cloud metadata hardening, and production-topology validator-bypass tests.

## Documentation ownership

- `product.md`: durable product vision
- `prd/cms.md`: behavioral CMS requirements and public invariants
- `milestone.md`: ordered goals and acceptance criteria
- `progress.md`: factual execution/checklist history and current status
- `context.md`: concise zero-context entrypoint and implementation map
- `learnings.md`: consequential mistakes, risks, and prevention rules only
- `decisions/*.md`: approved rationale and load-bearing domain constraints, read selectively
- `proposals/*.md`: developer-supplied future direction only; not approved design or implementation authority
