# Documentation and Learning Rules

- Keep `product.md` durable and directional; keep `prd/cms.md` behavioral and contract-focused.
- Keep `milestone.md` ordered and context-rich: completed milestones stay in a concise table, while every approved pending milestone carries its summary, 5–7 bounded scope/guardrail points, dependencies, and selective reading pointers. Pending context is not an implementation design or approval; do not add speculative numbered milestones outside the confirmed roadmap.
- Keep `progress.md` ordered by milestone, current, factual, and concise. Preserve consequential outcomes, accepted evidence, migration ownership, manual corrections, commit IDs, blockers, and release state—not command-by-command journals.
- Keep `context.md` a concise zero-context entrypoint: current phase, selective discovery, invariants, workspace/architecture map, completed capability summary, decision routing, validation baseline, and next scope. Replace obsolete context instead of appending history.
- Keep `decisions/index.md` as the selective routing table. Decision records retain load-bearing rationale but are read only when current work changes, consumes, or must preserve their domain.
- Record only consequential product/architecture mistakes, discarded assumptions, constraint violations, and prevention rules in `learnings.md`. Each entry contains `Incorrect assumption or decision`, `Learning`, and only when unresolved one concise `Status` line.
- Do not record ordinary command failures, missing tools, typos, harmless execution mistakes, or duplicate milestone status in learnings.
- Never erase a still-relevant lesson merely because the defect was fixed; compress it without removing the durable prevention rule.
- Keep detailed load reports in owned runbooks, schema authority in migrations/contracts, and behavior proof in tests rather than duplicating them into session context.
