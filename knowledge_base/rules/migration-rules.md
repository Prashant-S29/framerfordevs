# Database Migration Rules

Agents must never run any command that generates, applies, pushes, or executes a database migration.

Forbidden examples include:

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:push`
- `drizzle-kit generate`
- `drizzle-kit migrate`
- `drizzle-kit push`
- Migration SQL through `psql`
- Application startup paths that automatically apply migrations

When a schema change is required:

1. Explain the change and obtain approval when needed.
2. Edit the Drizzle schema.
3. Provide a descriptive migration name.
4. Provide exact generation and application commands to the developer.
5. Stop and wait.
6. After the developer applies it, inspect the generated migration and continue only after confirmation.

Never modify an already-applied migration without explicit developer instruction. Read-only database inspection and starting or stopping the local database are allowed when necessary and safe. Never expose database credentials.
