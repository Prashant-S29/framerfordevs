# Session Preparation Rules

Pi auto-loads root `AGENTS.md`; treat it as the mandatory compact baseline even after conversation compaction.

## First pass

Before substantive changes:

1. Inspect `git status` and recent `git log`.
2. Read `knowledge_base/context.md` completely.
3. Read the status header, milestone tracker, and current-work section of `knowledge_base/progress.md`.
4. Read only the active milestone section of `knowledge_base/milestone.md`; if none is active, require explicit developer direction for a new workstream.
5. Read relevant sections—not automatically entire files—of `product.md` and `prd/cms.md` when the task changes or consumes product behavior.
6. Use `rules/index.md`, `decisions/index.md`, and the maps in `context.md` to load only rules/decisions needed by the task’s actual domains.
7. Search learning titles by domain and read matching entries; do not read `learnings.md` sequentially unless the task is genuinely cross-cutting.
8. Inspect owning source, tests, package manifest, exports, configuration, and migration history.
9. Load every installed skill that materially matches the work.

Expand discovery when imports, public contracts, database relations, stable identities, authorization, runtime boundaries, or generated artifacts cross another domain. Do not preload historical milestone checklists or unrelated decisions “just in case.”

## Truth reconciliation

- Git is authoritative for branch, commit, and worktree state; reconcile stale status documents immediately.
- Committed source, tests, configuration, migrations, and generated artifacts describe current executable behavior.
- Product requirements, relevant rules, active criteria, and relevant approved decisions govern intended behavior and constraints.
- Report conflicts rather than silently selecting one authority or rewriting history.
- Never implement from a stale chat summary when repository sources are available.
- Recheck Git immediately before handoffs or status reports when state may have changed.
