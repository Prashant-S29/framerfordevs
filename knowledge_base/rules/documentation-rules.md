# Documentation and Learning Rules

- Keep `knowledge_base/prd/cms.md` behavioral, not a dumping ground for temporary implementation notes.
- Keep `knowledge_base/milestone.md` ordered and acceptance-focused.
- Keep `knowledge_base/progress.md` current and factual.
- Keep `knowledge_base/context.md` a concise zero-context entrypoint: current phase, discovery order, invariants, workspace/architecture map, one precise summary per completed milestone, selective decision map, validation baseline, and next scope.
- Do not append milestone journals, migration inventories, exhaustive test evidence, or manual-review narratives to `context.md`; keep those in `progress.md`, decision records, migrations, tests, or focused runbooks.
- Replace obsolete context instead of accumulating duplicate history. Every path or baseline in `context.md` must help a new agent discover current implementation safely.
- Record only consequential product or architecture mistakes, discarded decisions, constraint violations, and their prevention rules in `knowledge_base/learnings.md`.
- Do not record ordinary command failures, missing tools, typos, or harmless execution mistakes in `knowledge_base/learnings.md`.
- Never erase a relevant lesson merely because the bug was fixed.
