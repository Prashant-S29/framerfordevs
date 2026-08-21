# Session Preparation Rules

## Required first-pass context

Before changing code:

1. Inspect `git status` and recent `git log`.
2. Read `knowledge_base/product.md` and `knowledge_base/prd/cms.md` completely.
3. Read `knowledge_base/rules/index.md` and every linked rule completely, in order.
4. Read `knowledge_base/context.md` completely.
5. Read the status header, milestone tracker, and current-work section of `knowledge_base/progress.md`.
6. Read the active milestone section of `knowledge_base/milestone.md`. If no milestone is active, do not start one without explicit developer direction.
7. Inspect the owning source, tests, package manifest, package exports, and configuration.
8. Search `knowledge_base/learnings.md` for the task's domain and read matching entries plus its current implementation summary.
9. Read only approved decision records that the current task changes, consumes, or must preserve. Use the selective decision map in `knowledge_base/context.md` and follow actual code dependencies when the task is cross-cutting.
10. Load every installed skill that materially matches the work.

Do not preload every historical checklist, learning, or decision record. Expand discovery when current imports, contracts, database relations, public behavior, or invariants cross a domain boundary.

## Repository truth and reconciliation

- Treat committed code, tests, package configuration, migration history, and generated artifacts as the executable truth for current implementation behavior.
- Treat product requirements, rules, active milestone criteria, and relevant approved decisions as governing intent and constraints.
- Report conflicts between implementation and governing documents instead of silently choosing one or rewriting history.
- Treat Git as authoritative for branch, commit, and working-tree state; reconcile stale status documents immediately.
- Do not implement from a stale chat summary when repository sources are available.
- Recheck Git immediately before milestone handoffs and status summaries when repository state may have changed.
