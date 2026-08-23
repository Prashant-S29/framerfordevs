# Implementation Status and Handoff Reporting Rules

Use this structure for implementation progress reports, completion summaries, readiness updates, and milestone handoffs. A short answer to a narrow question does not need the full template.

## Required report structure

Report sections in this order:

1. **Status**
   - State `Complete`, `Partially complete`, or `Blocked` for the requested scope.
   - Say whether the active milestone is complete and whether developer review can begin.
   - Do not describe a passing subsystem as a completed milestone while required gates remain.

2. **Implemented**
   - List concrete behavior, contracts, packages, routes, UI, documentation, or operational changes completed.
   - Separate completed work from staged, disabled, partial, or proposal-only work.
   - Mention consequential fixes or reconciled drift without narrating harmless command mistakes.

3. **Validation**
   - List the commands or gate categories actually run and their latest outcomes.
   - Include test totals and workspace breakdowns when known.
   - Include measurable scores such as statement/branch coverage, accessibility findings, bundle size, latency, audit results, artifact hashes, or package inspection results when applicable.
   - Label targeted checks separately from complete workspace gates.
   - Distinguish current-turn evidence from an older accepted baseline. Never imply an unrun or stale check passed.

4. **Developer-testable flows**
   - Give the developer practical flows they can run now, including website navigation, CLI commands, API calls, package installation, or operational checks as applicable.
   - For each flow, state its availability as `Ready now`, `Ready with prerequisites`, or `Blocked`.
   - Include prerequisites, exact command or starting URL, concise steps, expected result, and cleanup/reset instructions when the flow mutates data or local state.
   - Prefer safe local or staging instructions. Use placeholders for origins, IDs, and credentials; never print or request secrets in chat.
   - If no meaningful manual flow exists, say so explicitly and explain why.

5. **Blocked or not yet testable**
   - For every built but unavailable, disabled, partial, or untestable flow, name the exact blocker or incomplete gate.
   - State what is already built, what remains, who controls the dependency or decision, and the first action required to unblock it.
   - Distinguish a true blocker from ordinary pending work, rollout-disabled behavior, and developer-controlled release actions.
   - Write `None` when there are no blockers; do not omit the section.

6. **Remaining**
   - List all known pending implementation, validation, documentation, release, and manual-review work.
   - If nothing remains, state that implementation and automated gates are complete and identify only developer-controlled review, commit, migration, or publication actions.

7. **Developer-controlled actions**
   - State whether commits, migrations, versioning, publication, rollout flags, production changes, or destructive cleanup were intentionally not performed.
   - At a milestone review handoff, follow `milestone-rules.md`: run `pnpm run ready`, provide one concise Conventional Commits message immediately before the manual-review instructions, and stop for developer review.

## Reporting quality rules

- Keep the report proportional to the work while preserving every required section.
- Use factual statuses and reproducible instructions rather than optimistic language.
- Do not hide failed gates. Report the failure, impact, current fix state, and rerun result.
- Do not present automated coverage as proof of manual UX quality, or manual testing as proof of contract/security coverage.
- Do not call a flow ready when a rollout flag, missing fixture, unavailable dependency, unpublished package, or incomplete boundary prevents the developer from completing it.
- Keep long-lived execution evidence in `knowledge_base/progress.md`; keep the chat report concise and actionable.
