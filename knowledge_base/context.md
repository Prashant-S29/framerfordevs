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

- **Current — M20B review:** editorial Presentation publication through `presentation.publish`, and Studio current and historical Preview through a server-side `ffd_pvh_` handoff to the environment Preview URL. Migration `0024_add_environment_preview_target` is applied.
- **Next — M20B acceptance:** the developer reviews M20B and commits. M20C design waits for acceptance. Commit, publication, rollout, and deployment remain developer actions.
