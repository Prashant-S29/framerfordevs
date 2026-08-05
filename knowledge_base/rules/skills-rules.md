# Skill Rules

- Load and apply every installed skill that materially matches the work; follow its relevant references instead of relying on the skill summary alone.
- Use skills as specialized input beneath the source-of-truth hierarchy and repository conventions. A skill must not override approved product behavior, stability choices, or execution constraints.
- If no installed skill adequately covers a domain where specialized guidance would genuinely improve correctness, security, reliability, performance, UX, DX, observability, or maintainability, recommend a specific additional skill and explain the concrete quality gap it would address.
- Before recommending an additional skill, use the `find-skills` workflow and `npx skills find` to compare relevant candidates. If `find-skills` itself is unavailable, ask the developer before installing it with `npx skills add https://github.com/vercel-labs/skills --skill find-skills`.
- Verify candidate quality rather than trusting search rank alone: compare task fit, source reputation, install count, repository maintenance/stars, skill contents, and available security-audit results.
- Present the best-fit skill, rationale, source link, and exact install command for developer review. Never install a recommended skill without explicit developer approval.
- Do not recommend skills speculatively, duplicate guidance already available, or block safe progress while awaiting a nonessential skill.
