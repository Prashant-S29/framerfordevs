# CMS Implementation Milestones

**Purpose:** Define the ordered delivery plan and the acceptance gate for only the active milestone. Historical execution evidence belongs in `progress.md`; durable rationale belongs in decision records.

## Global definition of done

Every milestone must:

1. Implement its approved success and failure behavior without weakening product invariants.
2. Add deterministic unit, integration, contract, authorization, accessibility, load, concurrency, and failure-injection coverage as applicable.
3. Preserve typed Effect errors/Layers/runtime boundaries, standard API envelopes, authorization, tenant isolation, bounded validation, redaction, and observability.
4. Pass applicable formatting, lint, structure, contract drift, type-check, test, coverage, build, audit, database-invariant, and runtime gates.
5. Keep `progress.md`, `context.md`, relevant decisions, and durable learnings current.
6. Stop for developer manual review; only the developer accepts, commits, publishes, rolls out, or advances a milestone.

## Database change gate

Agents may edit an approved Drizzle schema but must never generate, edit, apply, push, or execute a real migration or snapshot. The developer controls generation/application; the agent fully inspects generated SQL/snapshots/journal before application and verifies the live catalog read-only only after developer confirmation. Any agreed pre-application correction is prepared only as a non-authoritative ignored draft under `tmp/migrations/`.

## Completed milestones

| #   | Goal                                                                                                         | Acceptance             |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 0   | Validate the existing stack, auth, database, API, Docker, and test foundation.                               | 26 tests; `7d5a312`    |
| 1   | Establish stable Effect v3, typed errors, response envelopes, runtime Layers, and observability.             | 90 tests; `c28f6fa`    |
| 2   | Add workspaces, projects, capabilities, `main`, ownership, audits, and tenant-safe project management.       | 163 tests; `60adb39`   |
| 3   | Add memberships, roles, policies, invitations, and scoped credential lifecycles.                             | 381 tests; `a74aeb8`   |
| 4   | Add required English, strict registered locale contracts, ordering, lifecycle, and locale access.            | 453 tests; `68b6f6e`   |
| 5   | Add stable collection/field identity and versioned draft/classify/acknowledge/publish schema authority.      | 509 tests; `28ca04d`   |
| 6   | Add all 18 field kinds, recursive validation/localization, editor layout, and generated forms.               | 551 tests; `fbb4767`   |
| 7   | Add stable entries, shared/localized drafts, revisions, restore, names, and optimistic editing.              | 603 tests; `60bd96f`   |
| 8   | Add independent exact-locale publication, immutable snapshots, references, history, and outbox atomicity.    | 627 tests; `ad3cd5e`   |
| 9   | Add bounded production Delivery v1, typed projections, caching, cursors, quotas, and load proof.             | 712 tests; `8559aa4`   |
| 10  | Add scoped Preview v1, current/historical sources, role projection, dashboard UX, and load proof.            | 780 tests; `aa177b5`   |
| 11  | Add publication events, secure webhooks, invalidation, retries, replay, worker delivery, and operations UX.  | 868 tests; `fef7205`   |
| 12  | Add Tooling v1, OAuth-capable CLI, SDK/generation, canonical public contracts, and developer portal.         | 962 tests; `4e87908`   |
| 13  | Add secure code-first schema/content authoring, Authoring v1, SDK/CLI, local editor, and builder retirement. | 1,184 tests; `9c68942` |

Detailed outcomes, migration ownership, validation baselines, and consequential manual-review corrections are recorded once in `knowledge_base/progress.md`. Load-bearing design rationale remains in the selectively indexed records under `knowledge_base/decisions/`.

## Active milestone

None. The developer explicitly authorized a repository/context optimization workstream before the next milestone is designed. Its live checklist is in `knowledge_base/progress.md`.

Do not create or start a numbered milestone until the developer approves this maintenance work and then approves the new milestone’s design.

## Candidate next direction — not yet a milestone

The next design should evaluate and sequence:

- A hosted account/workspace/project control plane at `dashboard.framerfordevs.com`.
- A framework-neutral project Studio mounted at a developer-configured application path for content, editorial layout, preview, and future visual editing.
- Complete agent-first HTTP/CLI/SDK parity for every meaningful control-plane and authoring operation.
- Shared stable project/schema/field/entry/locale/publication identities across the hosted control plane, Studio, code-first schema, Delivery, and future visual bindings.
- Production-safe Studio authentication/BFF boundaries that do not expose management authority to browser JavaScript.

The design must first reconcile bootstrap/recovery responsibilities, Studio deployment modes, framework-neutral routing/server contracts, role projection, control-plane versus Studio capability ownership, CLI scope/authentication, compatibility/versioning, and migration/release impact. No implementation is authorized yet.
