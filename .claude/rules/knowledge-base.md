---
paths:
  - "knowledge_base/**"
---

# Knowledge base standard

The knowledge base steers a new agent toward the right work. It is not a record of what happened. Code, tests, configuration, migrations, and git history hold everything else, and agents read those directly.

## Allowed documents and budgets

| Document       | Holds                                                                      | Budget   |
| -------------- | -------------------------------------------------------------------------- | -------- |
| `context.md`   | Stack, workspace map, and the `Current` and `Next` blocks                  | 4,000 B  |
| `progress.md`  | One table row per milestone with status and commit, plus open gates        | 6,000 B  |
| `milestone.md` | Roadmap rules, completed table, and short scope for each pending milestone | 16,000 B |
| `product.md`   | Durable product vision                                                     | 11,000 B |
| `prd/cms.md`   | CMS behavior and public contracts                                          | 31,000 B |

`scripts/check/knowledge-base.mjs` enforces the file list, the budgets, a 600-character line limit, and the content bans below. `pnpm run check` runs it, and a Claude Code hook runs it after every knowledge-base edit. Raising a budget needs explicit developer approval.

## Write only current, durable facts

- Replace stale content. Never append history. When a milestone finishes, its pending section shrinks to one completed-table row with its commit.
- Do not record test counts, coverage numbers, artifact hashes, bundle sizes, command output, run dates, or step-by-step evidence. Tests and CI prove those.
- Do not record design rationale, decisions, or mistakes as prose. Encode a durable rule in `.claude/rules/`, a constraint in a test, and a non-obvious reason in a code comment.
- `context.md` keeps exactly one `Current` bullet and one `Next` bullet under `## Current work and next gate`.
- Prefer one sentence over a paragraph and a pointer to code over a description of it.
