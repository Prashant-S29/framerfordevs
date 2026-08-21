# Repository Agent Instructions

## Required context

- Before changing code, inspect Git, then read `knowledge_base/product.md`, `knowledge_base/prd/cms.md`, `knowledge_base/rules/index.md` and every linked rule, and `knowledge_base/context.md`.
- Read the status/tracker/current-work portions of `knowledge_base/progress.md` and the active section of `knowledge_base/milestone.md`.
- Inspect the owning code, tests, package manifest, exports, and configuration before planning changes.
- Search `knowledge_base/learnings.md` by the task domain. Read only decisions that the current task changes, consumes, or must preserve; use the selective map in `knowledge_base/context.md` and expand when actual dependencies cross domains.
- Work only on the active milestone unless the developer explicitly changes scope.
- Treat committed code/tests/configuration/migration history as executable implementation truth and product requirements/rules/relevant approved decisions as governing intent. Report drift instead of silently choosing one.

## Skills and local references

- Project-owned agent skills live under `.agents/skills/`; use the relevant `SKILL.md` files and their referenced material.
- For Effect work, follow `.agents/skills/effect-ts/` and inspect stable Effect v3 behavior under `.repos/effect/` when the local guides do not answer the question.
- Keep agent configuration vendor-neutral; do not introduce tool-specific project directories when `.agents/` is sufficient.

## Engineering constraints

- Use pnpm and package-owned dependencies; add packages through pnpm rather than editing dependency versions manually.
- Preserve package boundaries and the existing Turborepo task model.
- Use stable Effect v3 conventions, typed errors, Layers, and the shared `ManagedRuntime`; keep `Effect.run*` at runtime boundaries.
- Do not use `any`, unsafe assertions, request-local runtimes, or business-layer Promise/error leaks.
- Treat all external input as untrusted and enforce authorization, tenant isolation, bounded validation, redaction, and parameterized database access.
- Never expose or commit secrets from `.env`, authentication files, session history, or runtime configuration.

## Database migrations

- Never generate, apply, push, execute, edit, or rewrite a database migration.
- After an approved Drizzle schema change, stop at the developer-controlled migration gate and provide the exact migration name and commands.
- Applied migration files and snapshots are immutable. Inspect them and the live database read-only after developer confirmation.

## Validation and handoff

- Read relevant files before editing and ask before destructive changes or large refactors.
- Add deterministic tests for meaningful behavior and run the applicable format, lint, type-check, test, coverage, and build commands.
- Keep `knowledge_base/context.md` and `knowledge_base/progress.md` current; add durable learnings only when consequential drift or rework occurred.
- Do not run `git commit`. Stop for developer manual review at milestone completion.
