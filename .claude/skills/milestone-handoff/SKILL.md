---
name: milestone-handoff
description: Use when a milestone or a large requested change is finished and ready for developer review, or when the developer asks for a status or readiness report. Covers the final gates, knowledge-base update, report contents, and commit message.
---

# Milestone handoff

## Before you report

1. Re-read `git status` and `git log --oneline -5`. Status may have changed.
2. Stop the worker container if integration tests or coverage will run (`docker compose stop worker`).
3. Run `pnpm run ready`. If browser behavior changed, also run `pnpm test:browser` with the Docker app stack up.
4. Update `knowledge_base/progress.md` and the `Current` and `Next` blocks of `knowledge_base/context.md`. Follow `.claude/rules/knowledge-base.md`. The `pnpm run check:kb` script must pass.

## Report contents

Keep it proportional to the work. Cover, in order:

1. Status: complete, partially complete, or blocked, and whether developer review can start.
2. What was implemented, separating finished work from staged, disabled, or partial work.
3. Validation actually run in this session, with results and totals. Never present an old or unrun check as passing. Report every failure with its impact and fix state.
4. Flows the developer can try now, with prerequisites, the exact command or URL, steps, the expected result, and cleanup. Use placeholders for IDs and credentials.
5. Blockers, naming who controls each one and the first action to unblock it. Write "None" if there are none.
6. Remaining work.
7. Actions intentionally left to the developer: commit, migrations, publication, rollout, deployment, destructive cleanup.

End a milestone handoff with one Conventional Commits message, then stop. Never commit, accept the milestone, or start the next one.
