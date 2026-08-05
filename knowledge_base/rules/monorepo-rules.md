# Package and Monorepo Rules

- Use pnpm for dependencies; never manually add dependency versions to `package.json`.
- Keep dependencies in the package that uses them.
- Root scripts delegate orchestration through `turbo run` when appropriate.
- Declare workspace dependencies explicitly.
- Do not import across package internals; use package exports.
- Prefer package tasks over root implementation scripts.
- Run relevant check, type-check, test, and build tasks after meaningful changes.
