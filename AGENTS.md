# Repository Agent Instructions

Pi loads this file into every project session and keeps it in the system context across compaction. These are mandatory; `.agents/skills/` is progressive, task-specific guidance and must not carry always-on rules.

## Start and scope

1. Inspect `git status` and recent `git log`; Git is authoritative for branch, commit, and worktree state.
2. Read `knowledge_base/context.md`. Read only the product/PRD sections, rules, learnings, and decisions mapped there that the task changes, consumes, or must preserve.
3. Read the status/tracker/current-work section of `knowledge_base/progress.md`, the roadmap summary, and only the next design target or active milestone section of `knowledge_base/milestone.md`.
4. Inspect owning source, tests, manifests, exports, configuration, and migration history before editing.
5. Load every matching `.agents/skills/*/SKILL.md`; follow referenced material selectively. For Effect work, also use stable-v3 references under `.repos/effect/` when local guides are insufficient.
6. Work only on the active milestone unless the developer explicitly authorizes another workstream. When no implementation milestone is active, design only the named next design target. Ask before destructive work or a materially larger refactor not already authorized.

Do not preload all historical decisions, milestone journals, learnings, or rules. Start from current code and the selective maps; follow actual imports/contracts to additional context.

## Authority and decisions

- Current developer instruction outranks product vision, CMS PRD, mandatory rules, active criteria/relevant approved decisions, then status documents.
- Committed code, tests, config, migrations, and generated artifacts describe executable truth. Report drift from governing intent; never silently choose or rewrite history.
- Ask before changing product behavior, public contracts, core dependencies, architecture, or approved authority boundaries. Evaluate correctness, security, reliability, performance, UX, DX, observability, and maintainability.
- Never expose secrets from `.env`, auth files, session history, runtime configuration, or command output.

## Engineering invariants

- Use pnpm and package-owned dependencies; preserve Turborepo tasks and package boundaries. Apps never supply source to packages; cross-package imports use declared exports.
- Use stable Effect v3, typed expected errors, services/Layers, and the shared `ManagedRuntime`; keep `Effect.run*` at runtime/framework boundaries. No `any`, unsafe assertions, request-local runtimes, or business-layer Promise/raw-error leaks.
- Treat every external value as untrusted: bound and decode it, authorize server-side before sensitive work, include tenant/project/environment scope, parameterize SQL, and redact telemetry.
- Application APIs preserve `{ ok, data, error, message }` and centralized schema-backed error/status mapping; protocol-owned endpoints retain native formats.
- Every meaningful operation has a stable HTTP contract; developer/agent automation has noninteractive CLI parity. Public SDKs expose only approved content/runtime integration, never control-plane or secret administration.
- Every content operation names an exact enabled locale; `en` is required, Delivery never falls back, drafts never alter published snapshots, and publication/audit/outbox state is atomic.
- Stable IDs are distinct from labels, API keys, and source keys. Immutable revisions/publications and optimistic/idempotent authority must remain intact.
- Only `apps/worker` sends webhooks. Stop independent workers before shared-database integration or coverage and restore/verify them afterward.
- Organize cohesive internal domains in folders when it improves discovery. Keep public entrypoints stable, prefer direct imports internally, and add barrels only for intentional package APIs; never add convenience barrels that hide cycles or enlarge bundles.

## Database migrations

- Never generate, apply, push, execute, edit, replace, or delete a real migration or snapshot under `packages/db/src/migrations/`.
- After an approved Drizzle change, provide the exact migration name/commands and stop for developer generation. Fully inspect developer-generated SQL, snapshot, and journal before application.
- If an unapplied migration needs an agreed correction, prepare only an ignored draft under `tmp/migrations/`; the developer manually updates the real artifact. Applied migrations are immutable.
- Inspect live databases read-only only after developer confirmation; never expose credentials.

## Tests, documentation, and handoff

- Add deterministic success/failure/authorization/boundary/regression tests with behavior changes. Follow `knowledge_base/decisions/repository-test-structure.md` for placement.
- Run applicable format, lint, structure, contracts, types, tests, coverage, audit, and builds. Never hide failures or claim unrun evidence.
- `knowledge_base/context.md` stays a concise zero-context map. `progress.md` stays ordered and factual. `learnings.md` uses only `Incorrect assumption or decision`, `Learning`, and optional unresolved `Status`.
- Decision records are domain references, not chronological required reading. Update `knowledge_base/decisions/index.md` when adding or superseding one.
- Before milestone review, update KB status, run `pnpm run ready`, provide one concise Conventional Commit message, and stop. Never run `git commit`, publish packages, change production rollout/configuration, deploy, accept a milestone, or begin the next milestone for the developer.
