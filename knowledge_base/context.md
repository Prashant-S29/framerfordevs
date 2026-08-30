# Agent Session Context

**Last updated:** 2026-08-29
**Current phase:** M14 Control Plane v1 bootstrap design is proposed for developer review; implementation remains unauthorized
**Next gate:** Developer approval or requested revision of the M14 design

## Start here

1. Inspect `git status` and recent `git log`.
2. Read root `AGENTS.md` and this file; Pi auto-loads `AGENTS.md` across compaction.
3. Read the status/tracker/current-work sections of `knowledge_base/progress.md`, the roadmap summary, and only the next design target or active milestone section of `knowledge_base/milestone.md`.
4. Use `knowledge_base/rules/index.md` and `knowledge_base/decisions/index.md` to load only domains the task changes, consumes, or must preserve.
5. Search learning titles by domain; do not read `learnings.md` sequentially unless the task is genuinely cross-cutting.
6. Inspect owning source, tests, manifests, exports, configuration, and migration history before planning.

Read relevant sections of `product.md` and `prd/cms.md` for behavioral work. Do not preload all historical decisions or completed milestone criteria. Follow actual imports, contracts, stable identities, and database relations when dependencies cross domains.

## Truth and scope

- Explicit current developer instruction, product/PRD, relevant rules/active criteria/approved decisions, then status documents govern intent in that order.
- Committed source, tests, configuration, migrations, and generated artifacts describe executable truth; Git describes repository state.
- Report drift instead of silently choosing an authority.
- Work only on an approved active milestone or an explicitly authorized workstream. M14 design is proposed for review, but its implementation is not active until the developer approves it.

## Product direction

Framer for Devs is a backend-agnostic website operations platform whose CMS foundation supplies stable schemas, role-projected multilingual authoring, immutable exact-locale publication, Delivery/Preview APIs, generated tooling, and publication events. Future visual sites bind to the same stable project/schema/field/entry/locale/publication identities without migration.

The intended surfaces are:

- `framerfordevs.com`: marketing, documentation, authentication entry.
- `dashboard.framerfordevs.com`: hosted account/workspace/project control plane and recovery.
- Developer-configured project path such as `/studio`: framework-neutral, role-projected content/editorial/preview/future visual Studio.
- Stable HTTP plus the CLI: complete machine-readable agent/developer automation. The public SDK is intentionally limited to content/runtime integration and never mirrors control-plane or secret administration.

The approved execution sequence is: portable control-plane authority and automation parity; hosted surface separation; secure framework-neutral Studio; client handover/editorial safety; data durability and production hardening; advanced CMS operations; preserved visual-readiness contracts; visual composition/publication; and a renderer SDK baseline. `milestone.md` maps M14–M30 with detailed context and explicitly preserves every point from the original pre-normalization M14–M16. Managed hosting, external data, billing, analytics, and plugins remain unsequenced long-term directions in `product.md` until this baseline is accepted.

## Stack and workspace ownership

- **Monorepo:** pnpm workspaces, Turborepo, TypeScript
- **Applications:** React 19/TanStack/Vite web and docs; Express 5 server; independent webhook worker
- **Domain model:** stable Effect 3.22 with typed errors, services/Layers, and shared `ManagedRuntime`
- **Data:** PostgreSQL 18/Drizzle; Redis rate limiting; immutable migrations
- **Observability:** redacted structured logs and OpenTelemetry-compatible traces/metrics

```text
apps/web                 hosted dashboard browser/SSR
apps/server              Express, oRPC, and public HTTP boundary
apps/worker              publication-event/webhook delivery only
apps/developers          public documentation
packages/api             contracts, domain kernels, operations, services, runtimes
packages/auth            Better Auth/OAuth protocol boundary
packages/cli             CLI, safe extraction, experimental build, local editor BFF
packages/content-form    browser-safe role-projected form renderer
packages/db              Drizzle schema and immutable migration history
packages/public-contracts canonical public artifact registry
packages/schema          declarative code-schema contract/validator
packages/sdk             scoped content/runtime Promise/Effect clients and helpers
packages/ui              shared UI primitives
```

Packages never import application source. Cross-package imports use declared exports.

## Non-negotiable product invariants

- Projects are capability containers; `main` is the initial visible environment.
- `en` is required. Every content operation names an exact enabled locale; Delivery never falls back.
- Shared values are copied into each locale publication; draft changes never mutate prior publications or Delivery output.
- Stable IDs are distinct from labels, API keys, and code source keys.
- Schema/content/publication revisions are immutable; optimistic concurrency, idempotency, audits, and outbox atomicity remain authoritative.
- Authorization is server-side, default-deny, tenant/project/environment scoped, and performed before sensitive work.
- External input is bounded/decoded; SQL is parameterized; secrets and content bodies are excluded from errors/logs/traces/metrics/generated files.
- Application APIs use `{ ok, data, error, message }`; protocol-owned endpoints retain native contracts.
- Only `apps/worker` sends webhooks; stop it before shared-database integration/coverage.
- Agents never generate/apply/edit migrations, publish, deploy, commit, change production rollout, accept milestones, or advance scope for the developer.

## M13 boundaries that future work must preserve

- Code owns published collection structure; hosted immutable editorial Presentation owns labels/layout; PostgreSQL owns content.
- Tier 1 statically reduces a closed TypeScript grammar before credentials and never executes project modules.
- Tier 2 is explicit, credential-blind, experimental/default-off, and reports `memoryLimitHard: false`; QuickJS issue #255 blocks production/default activation and hard-memory proof.
- Server-generated collection/field/enum IDs reconcile through stable source keys; plan never reserves IDs.
- Authoring v1 is bearer-only, originless, redirect-free, `no-store`, and separate from read-only Tooling v1.
- The unpublished public SDK is content/runtime-scoped: public Authoring retains exact-locale content plus read-only form/Presentation metadata, while schema push and Presentation mutation live in HTTP and the CLI-owned operator client.
- Browser editor code never receives hosted bearer/refresh/management authority or persists hosted content.
- Dashboard structure-authoring procedures are absent rather than retained as compatibility tombstones; content, editorial Presentation, Delivery, navigation, and read-only structure remain.

## Completed capability map

| Milestones | Capability                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------- |
| M0–M2      | Verified foundation; Effect/error/observability runtime; workspace/project/capability kernel |
| M3–M4      | Membership/policy/credentials and strict project locales/access                              |
| M5–M6      | Versioned schema engine, 18-kind field system, layout, validation, generated forms           |
| M7–M8      | Multilingual drafts/revisions and immutable exact-locale publication/snapshots               |
| M9–M10     | Production Delivery v1 and scoped Preview v1                                                 |
| M11        | Publication events, secure webhooks, invalidation, worker delivery                           |
| M12        | Tooling v1, OAuth-capable CLI, SDK/generation, public contracts, docs portal                 |
| M13        | Code-first schema/content Authoring v1, SDK/CLI, local editor, builder retirement            |

M0–M13 are developer-approved and committed; M13 commit is `9c68942`. Post-M13 repository/context normalization is committed at `cd31102`, roadmap sequencing at `2d0705a`, the public SDK/CLI boundary correction at `d63f215`, and retired dashboard schema-route removal at `5f6480d`. See `progress.md` for ordered outcomes, migrations, validation, roadmap status, and release state.

## Architecture landmarks

- **Runtime/errors:** `packages/api/src/contracts/response/api/index.ts`, `packages/api/src/contracts/response/errors/index.ts`, `packages/api/src/runtime/index.ts`
- **Access/locales:** `packages/api/src/services/policy/index.ts`, `packages/api/src/services/project-access.ts`, `packages/api/src/services/locale/repository.ts`
- **Code authoring kernels:** `packages/api/src/lib/authoring/`
- **Authoring repositories:** `packages/api/src/services/authoring/`
- **Authoring HTTP:** `packages/api/src/operations/authoring/public/index.ts`, `apps/server/src/app.ts`
- **Schema/fields/forms:** `packages/api/src/services/schema/repository.ts`, `packages/api/src/lib/field/validation/index.ts`, `packages/content-form/`
- **Entries/publication:** `packages/api/src/services/entry/repository.ts`, `packages/api/src/services/publication/repository.ts`
- **Delivery/Preview:** `packages/api/src/services/delivery/read-repository.ts`, `packages/api/src/services/preview/repository.ts`
- **Events/webhooks:** `packages/api/src/services/webhook/repository.ts`, `packages/api/src/services/webhook/worker-repository.ts`, `apps/worker/`
- **Schema extraction/editor:** `packages/schema/`, `packages/cli/src/schema/static-extractor/index.ts`, `packages/cli/src/experimental-schema-build.ts`, `packages/cli/editor-app/`
- **Database:** `packages/db/src/schema/`, `packages/db/src/migrations/`

## Validation baseline

Accepted M13 baseline: `pnpm run ready` passed 1,184 tests, 15 type-check tasks, contract drift, formatting, lint, structure, coverage, and eight builds. Reported suites include 723 API, 138 server, 115 dashboard, 105 CLI, 18 SDK, and 13 content-form tests. Shared-database gates ran without the independent worker; residue/invariants were clean and the worker was restored healthy.

The subsequent repository-normalization workstream also passed the complete readiness gate with the same 1,184 tests and 15 type-check tasks. All 1,089 production JS/CSS artifact counts remained stable; aggregate output was 43,467,370 raw/8,706,685 gzip bytes, down 822,525/201,790 bytes from the pre-refactor baseline. The SDK/CLI boundary correction passed full readiness with 1,190 tests, 15 type-check tasks, contract drift, coverage, and eight builds, plus packaged schema/Presentation/content/editor workflows. The current complete removal of pre-release dashboard schema-authoring procedures passes the same gate with 1,177 tests, including 721 API and 127 server tests. The worker was stopped for shared-database gates and restored healthy afterward.

## Current work and next gate

The detailed M14–M30 roadmap is sequenced, with the original M14 client-handover, M15 production-hardening, and M16 visual-readiness obligations explicitly mapped into M21–M23 and M27. The developer approved and committed `knowledge_base/decisions/public-http-cli-and-sdk-surface-boundary.md`: stable HTTP is canonical, the CLI is the complete agent/operator surface, and the public SDK is limited to content/runtime integration. The committed `5f6480d` baseline completely removes the retired pre-release dashboard schema-authoring procedures and their dedicated error/route-adapter/telemetry surface while preserving read-only structure, Presentation, content, Delivery, and canonical Authoring v1. The proposed M14 design treats the SDK/CLI boundary as a prerequisite and defines Control Plane HTTP/CLI/dashboard authority with `sdkSupported: false`. Review clarification permits exact primary-environment management credentials to enable CMS with honest attribution, freezes Studio registration conflict/no-op receipt semantics, makes `ffd link` online-only, and requires measured receipt growth plus approved rate budgets before acceptance. The rest of M14 still awaits developer approval or revision. Do not implement M14, design M15, publish packages, activate production OAuth, deploy, or create/apply migrations until the corresponding developer gate.
