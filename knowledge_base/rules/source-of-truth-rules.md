# Source-of-Truth Rules

Use two related forms of authority rather than confusing intended behavior with current implementation.

## Governing intent

When requirements or constraints conflict, use this order:

1. Explicit current developer instruction
2. `knowledge_base/product.md` for product vision
3. `knowledge_base/prd/cms.md` for CMS behavior and public contracts
4. `knowledge_base/rules/index.md` and every linked rule for execution constraints
5. The active section of `knowledge_base/milestone.md` and relevant approved decision records
6. `knowledge_base/progress.md` and `knowledge_base/context.md` for current execution state

An approved decision is authoritative only for work that changes, consumes, or must preserve its domain. Do not load or apply unrelated historical decisions speculatively.

## Executable implementation

Committed source, tests, package configuration, applied migration history, and generated route/schema artifacts are authoritative for what the repository currently implements. Read them before planning or modifying behavior; do not infer implementation solely from milestone summaries or decision proposals.

Git is authoritative for branch, commit, and working-tree state.

If executable implementation differs from governing intent, report the discrepancy and follow the higher authority for resolution. Do not silently rewrite requirements to match code, and do not assume stale documentation overrides verified implementation details. Stop and ask the developer when the conflict cannot be resolved safely.
