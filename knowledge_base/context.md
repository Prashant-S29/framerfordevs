# Agent Session Context

**Last updated:** 2026-09-29
**Current phase:** M19B mounted-experience implementation is complete as a review candidate; M19A remains accepted at `788b782` and the worker remains stopped
**Next gate:** Complete full readiness, browser, security, artifact, and invariant evidence, then stop for developer M19 review; every release action remains gated

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
- Work only on an approved active milestone or explicitly authorized workstream. M18A/M18B and M19A are accepted, M19B implementation is authorized and awaiting complete acceptance evidence/review, and M20+ remain gated.

## Stack and workspace ownership

- **Monorepo:** pnpm workspaces, Turborepo, TypeScript
- **Applications:** React 19/TanStack/Vite web and docs; Express 5 server; independent webhook worker
- **Domain model:** Effect 4.1 with typed errors, services/Layers, and shared `ManagedRuntime`
- **Data:** PostgreSQL 18/Drizzle; Redis rate limiting; immutable migrations
- **Observability:** redacted structured logs and OpenTelemetry-compatible traces/metrics

```text
apps/dashboard           hosted dashboard browser/SSR and approved same-origin backend ingress
apps/marketing           minimal public landing and validated login entry
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
packages/studio          browser-only mounted shell, safe BFF contracts, and immutable browser artifact
packages/studio-server   framework-neutral Fetch BFF, encrypted OAuth sessions, assets, and store port
packages/studio-store-redis production shared restart-stable Studio session/refresh authority
packages/studio-adapter-express thin Express 5 request/response and raw-target bridge
packages/studio-adapter-tanstack-start thin TanStack Start native Request/Response bridge
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

## Current work and next gate

- **Current — M19B review candidate on Effect 4.1:** the Effect 4.1.4 migration, the dependency security upgrade, and migration `0022` are applied, and the full M19B readiness, contract, bundle, and browser evidence passes. The rules live in `knowledge_base/decisions/effect-v4-and-dependency-security-upgrade.md`.
- **Next — Developer M19 review:** inspect and accept or return the candidate. Commit, publication, rollout, deployment, M20, and every release action remain gated.
