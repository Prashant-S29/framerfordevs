# Project Rule Index

Root `AGENTS.md` contains the always-on rules Pi loads for every session. This directory provides the detailed, task-specific rules beneath that mandatory baseline.

Read a rule completely when the task changes, consumes, validates, or must preserve its domain. Do not load every rule speculatively; follow actual code/contracts when work crosses domains.

| Rule                                                                             | Read when                                                                           |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [`session-rules.md`](session-rules.md)                                           | Starting or resuming substantive repository work; discovery and context selection   |
| [`skills-rules.md`](skills-rules.md)                                             | Selecting, evaluating, installing, or recommending skills/research guidance         |
| [`source-of-truth-rules.md`](source-of-truth-rules.md)                           | Reconciling requirements, status, decisions, code, tests, migrations, or Git        |
| [`decision-rules.md`](decision-rules.md)                                         | Making or requesting a product, architecture, dependency, or authority decision     |
| [`milestone-rules.md`](milestone-rules.md)                                       | Defining, executing, reviewing, accepting, or advancing a milestone                 |
| [`migration-rules.md`](migration-rules.md)                                       | Any Drizzle schema, migration, live-catalog, or migration-draft work                |
| [`effect-rules.md`](effect-rules.md)                                             | Any business workflow, Effect service/error/Layer/runtime, or Effect test work      |
| [`api-rules.md`](api-rules.md)                                                   | Application API contracts, handlers, responses, errors, or status mapping           |
| [`observability-rules.md`](observability-rules.md)                               | Logs, traces, metrics, audits, request IDs, telemetry, or redaction                 |
| [`security-rules.md`](security-rules.md)                                         | Auth, authorization, external input, credentials, tenants, URLs, or sensitive data  |
| [`localization-and-publication-rules.md`](localization-and-publication-rules.md) | Locales, drafts, publication, snapshots, Delivery, or references                    |
| [`performance-rules.md`](performance-rules.md)                                   | Queries, lists, caches, concurrency, queues, load, memory, or optimization          |
| [`testing-rules.md`](testing-rules.md)                                           | Adding/moving tests, changing test infrastructure, or validating behavior           |
| [`monorepo-rules.md`](monorepo-rules.md)                                         | Packages, dependencies, exports, Turborepo tasks, or workspace boundaries           |
| [`comment-rules.md`](comment-rules.md)                                           | Adding or materially changing hand-authored source files                            |
| [`documentation-rules.md`](documentation-rules.md)                               | Changing product/PRD/context/progress/milestone/learning/decision documentation     |
| [`reporting-rules.md`](reporting-rules.md)                                       | Progress reports, readiness summaries, review handoffs, blockers, or release status |

No rule may override a current explicit developer instruction or higher product authority. When a task spans several domains, read the union of relevant rules rather than all historical material.
