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
| `packages/public-contracts`   | Registry of public contract artifacts, checked against their source      |
| `packages/ui`                 | Shared UI primitives                                                     |
| `tools/browser-tests`         | Noninteractive Playwright specs against the Docker app stack             |

Local stack: `docker compose up -d postgres redis` for tests, and the app services for browser specs. The worker stays stopped during integration tests.

## Current work and next gate

- **Current — M20C review:** `ffd editor` serves the Studio over a loopback backend with the CLI `studio:content` login, Studio Content accepts that editor principal, and the dashboard editorial, Presentation, and Preview routes are removed. The Studio route table lives in `@framerfordevs/studio/bff-routes`. No migration.
- **Next — M20C acceptance:** the developer reviews M20C and commits. M20 then closes, and M21 design waits for acceptance. Commit, publication, rollout, and deployment remain developer actions.
