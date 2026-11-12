# Context

Session rules and invariants are in `CLAUDE.md`. This file maps the workspace and states where work stands.

## Workspace

| Path                          | Owns                                                                     |
| ----------------------------- | ------------------------------------------------------------------------ |
| `apps/dashboard`              | Hosted dashboard (TanStack Start) and its same-origin backend ingress    |
| `apps/marketing`              | Public landing page and login entry                                      |
| `apps/developers`             | Public developer documentation and API reference                         |
| `apps/server`                 | Express 5 HTTP boundary: oRPC, public APIs, Better Auth, Studio BFF host |
| `apps/worker`                 | Publication-event projection and webhook delivery, nothing else          |
| `packages/api`                | Contracts, domain kernels, operations, services, and the runtime         |
| `packages/auth`               | Better Auth and OAuth provider configuration                             |
| `packages/db`                 | Drizzle schema and immutable migrations                                  |
| `packages/cli`                | `ffd` CLI, code-first schema build, local editor                         |
| `packages/sdk`                | Published content and runtime SDK (Promise and Effect clients)           |
| `packages/schema`             | Published code-first schema contract and validator                       |
| `packages/content-form`       | Browser-safe role-projected content form                                 |
| `packages/studio`             | Mounted Studio browser shell and its immutable artifact                  |
| `packages/studio-server`      | Framework-neutral Studio BFF, encrypted sessions, assets                 |
| `packages/studio-store-redis` | Shared Studio session store                                              |
| `packages/studio-adapter-*`   | Thin Express and TanStack Start bridges                                  |
| `packages/public-contracts`   | Registry of released public artifacts, checked byte for byte             |
| `packages/ui`                 | Shared UI primitives                                                     |
| `tools/browser-tests`         | Noninteractive Playwright specs against the Docker app stack             |

Local stack: `docker compose up -d postgres redis` for tests, and the app services for browser specs. The worker stays stopped during integration tests.

## Current work and next gate

- **Current — Repository setup for Claude Code:** rules live in `.claude/rules/`, skills in `.claude/skills/`, and the knowledge base is reduced to budgeted state documents. Schema decoding and JSON Schema use native Effect 4.1 APIs, and untrusted input rejects unknown keys. Packages use named exports and turbo boundary tags. M19 is committed at `ec37524`.
- **Next — M20 design:** wait for the developer to open the M20 Studio editorial lifecycle design. Commit, publication, rollout, and deployment remain developer actions.
