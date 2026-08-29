# Milestone Rules

- Work on only the active milestone unless the developer explicitly changes scope. When no implementation milestone is active, design only the named next design target.
- A numbered roadmap entry records approved sequence and bounded intent; it does not authorize its design or implementation. Do not design later entries ahead of the current target.
- Do not one-shot the CMS or combine roadmap slices merely because they share a product surface.
- Add tests with the implementation, not afterward.
- Meet all applicable milestone success criteria.
- Update `knowledge_base/progress.md`, `knowledge_base/context.md`, and `knowledge_base/learnings.md` before requesting review.
- Run `pnpm run ready` successfully before every milestone review handoff.
- Immediately before manual-review instructions, provide one concise Conventional Commits message appropriate to the completed milestone.
- Stop for developer manual review at the end of every milestone.
- Do not begin the next milestone until the developer explicitly approves.
- After approval, verify the recent Git log and record the actual commit when it exists.
- Never run `git commit`; the developer reviews and commits manually.
