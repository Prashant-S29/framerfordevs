# Database Migration Rules

Database migration generation and application are always developer-controlled. Agents must never run any command that generates, applies, pushes, or executes a database migration, and must never modify a real migration file or migration snapshot under `packages/db/src/migrations/`.

Forbidden agent actions include:

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:push`
- `drizzle-kit generate`
- `drizzle-kit migrate`
- `drizzle-kit push`
- Migration SQL through `psql`
- Application startup paths that automatically apply migrations
- Direct creation, editing, replacement, or deletion of files under `packages/db/src/migrations/`

When a schema change is required:

1. Explain the change and obtain approval when needed.
2. Edit the Drizzle schema only after approval.
3. Provide a descriptive migration name and the exact generation command.
4. Ask the developer to generate the migration, then stop and wait.
5. After developer confirmation, inspect the complete generated SQL, snapshot, and journal before application.
6. If the generated migration needs a pre-application correction, explain the issue and agree on the required correction with the developer.
7. When the developer requests an assisted correction, create or update only a non-authoritative, gitignored draft at `tmp/migrations/<generated-migration-filename>`. Base it on the exact unapplied generated SQL and include the agreed changes. Never place the draft in the real migrations directory or invoke migration tooling against it.
8. The developer manually copies/replaces the real unapplied migration from the draft. The agent never performs that copy or modifies the real migration artifact.
9. Reinspect the complete real SQL, snapshot, and journal after replacement. Do not approve application based only on the temporary draft.
10. If inspection passes, provide the exact application command and ask the developer to apply it, then stop and wait.
11. After the developer confirms application, inspect the migration state and database read-only before continuing.

Applied migration files and snapshots are immutable. Never propose or prepare a replacement for an applied migration; use a new developer-generated migration for any later correction. Remove obsolete temporary drafts after the gate is complete. Read-only database inspection and starting or stopping local infrastructure are allowed when necessary and safe, provided startup cannot apply migrations automatically. Never expose database credentials.
