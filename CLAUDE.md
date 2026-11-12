# Framer for Developers

A developer-first headless CMS and website platform. pnpm workspaces, Turborepo, TypeScript, Effect 4.1, Express 5, React 19 with TanStack, PostgreSQL 18 with Drizzle, and Redis. The workspace map and the current milestone are in `knowledge_base/context.md`.

## Start a session

1. Read `git status` and `git log --oneline -5`. Git is the authority for branch and commit state.
2. Read `knowledge_base/context.md`. It names the active milestone and the next gate.
3. For milestone work, read only the active section of `knowledge_base/milestone.md`. Read `product.md` and `prd/cms.md` sections only when the task changes product behavior.
4. Read the owning source, tests, manifests, and exports before you edit. Code, tests, configuration, and applied migrations describe what the system does. Do not rebuild that knowledge from documents.

Path-scoped rules in `.claude/rules/` load when you touch matching files. Skills in `.claude/skills/` load when their description matches the task. For Effect internals, read the Effect 4.1 source under `.repos/effect/`.

## Authority

- The developer's current instruction wins. Then `product.md`, then `prd/cms.md`, then these rules, then the active milestone, then status documents.
- If code and a document disagree, report the drift. Do not silently pick one or rewrite history.
- Ask before you change product behavior, a public contract, a core dependency, the architecture, or an approved authority boundary.
- When you ask the developer to decide, state the decision in plain English, give only viable options with their costs, and name your recommendation.
- Work only on the active milestone unless the developer authorizes other work. A planned milestone does not authorize its design.

## Engineering invariants

- Use pnpm. Keep dependencies in the package that uses them. Cross-package imports use declared exports. Apps never supply source to packages. Do not add convenience barrels.
- No `any`, no unsafe type assertions, and no `orDie` to silence a type error.
- Treat every external value as untrusted. Bound and decode it, authorize server-side before sensitive work, scope every query by workspace, project, and environment, parameterize SQL, and redact telemetry.
- Application APIs use the `{ ok, data, error, message }` envelope with centralized error mapping. Protocol-owned endpoints, such as Better Auth and OAuth, keep their native format.
- Every meaningful operation has a stable HTTP contract and a noninteractive CLI path. The public SDK exposes only approved content and runtime integration, never control-plane or secret administration.
- Every content operation names an exact enabled locale. `en` is required. Delivery never falls back. Drafts never change published snapshots. Publication, audit, and outbox state change atomically.
- Stable IDs are distinct from labels, API keys, and source keys. Revisions and publications are immutable.
- Only `apps/worker` sends webhooks. Stop the worker container before integration tests or coverage that share the development database.
- Never read or print secrets from `.env` files, auth files, session history, or command output.

## Database migrations

- Never generate, apply, push, or edit a migration or snapshot under `packages/db/src/migrations/`. Never run `db:generate`, `db:migrate`, `db:push`, or any `drizzle-kit` command that writes or applies.
- After an approved schema change, give the developer the migration name and the exact generate command, then stop. `.claude/rules/database.md` has the full procedure.
- Inspect a live database read-only, and only after the developer confirms.

## Tests and handoff

- Add deterministic success, failure, authorization, boundary, and regression tests with every behavior change. `.claude/rules/testing.md` defines placement.
- Run browser specs only with `pnpm test:browser`. Never open an interactive, headed, or debug browser session unless the developer asks.
- Run the gates that apply: `pnpm run check`, `pnpm run contracts:check`, `pnpm run check-types`, tests, coverage, and builds. Never hide a failure or claim a check you did not run.
- A milestone is done when it delivers one bounded outcome with its HTTP and CLI surfaces, keeps every invariant above, passes `pnpm run ready`, and updates the knowledge base. Use the `milestone-handoff` skill for the review handoff.
- Never commit, push, publish, deploy, change production configuration, accept a milestone, or start the next milestone. The developer does these.
