---
paths:
  - "packages/db/**"
  - "**/*.sql"
---

# Database migration procedure

The developer owns migration generation and application. You must never run `db:generate`, `db:migrate`, `db:push`, `drizzle-kit generate|migrate|push`, migration SQL through `psql`, or any startup path that applies migrations. Never create, edit, replace, or delete files under `packages/db/src/migrations/`.

1. Explain the schema change and get approval when needed.
2. Edit the Drizzle schema only after approval.
3. Give a descriptive migration name and the exact command, for example `pnpm --filter @framerfordevs/db exec drizzle-kit generate --name <name>`. Stop and wait.
4. After the developer generates it, read the complete SQL, the snapshot difference against the previous snapshot, and the journal entry.
5. If it needs a correction before it is applied, agree on the fix. Write only a gitignored draft at `tmp/migrations/<file>`. The developer copies it into the real file. Then inspect the real file again.
6. Give the apply command and stop. After the developer applies it, confirm the catalog read-only.

Applied migrations are immutable. A later correction is a new developer-generated migration. You may start or stop local database containers.
