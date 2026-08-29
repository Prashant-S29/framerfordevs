# Agent Session Context

**Last updated:** 2026-08-27
**Current phase:** Milestone 13 accepted; no implementation milestone is active
**Active work:** M13 release rollout and the next Studio/control-plane milestone require separate execution and planning

## Product in one paragraph

Framer for Devs is a backend-agnostic visual frontend and website-operations platform. Its first capability is a headless CMS where developers publish versioned schemas, clients author permissioned multilingual content, each locale publishes independently, and external frontends consume immutable published JSON plus reliable change events. Future visual sites must bind to the same stable project, schema, field, entry, locale, and publication identities without migrating content.

## Start here

1. Inspect `git status` and recent `git log`.
2. Read `knowledge_base/product.md`, `knowledge_base/prd/cms.md`, and every rule linked from `knowledge_base/rules/index.md`.
3. Read this file completely.
4. Read the status, tracker, active checklist, and current validation sections of `knowledge_base/progress.md`.
5. Read only the active M13 section of `knowledge_base/milestone.md`.
6. Inspect owning source, tests, manifests, exports, configuration, and migration history before planning changes.
7. Search `knowledge_base/learnings.md` by the task domain and read matching entries.
8. Read only decisions required by the task, using the map below.

When no milestone is active, stop after discovery and obtain developer direction before changing scope.

## How to establish truth

- Committed source, tests, configuration, migrations, and generated artifacts are executable implementation truth.
- Product requirements, rules, active milestone criteria, and relevant approved decisions define governing intent.
- Report drift between implementation and intent; do not silently select one.
- Git is authoritative for branch, commit, and working-tree state.
- Follow imports and stable identities when a dependency crosses package or domain boundaries.

## Stack and workspace boundaries

- **Monorepo:** pnpm workspaces and Turborepo
- **Web:** React 19, TanStack Start/Router/Query/Form, Vite, Tailwind, shadcn/ui
- **Server:** Node.js, Express 5, oRPC/OpenAPI, Better Auth
- **Application model:** stable Effect v3 with typed errors, services, Layers, and shared `ManagedRuntime` boundaries
- **Data:** PostgreSQL 18 and Drizzle ORM
- **Observability:** structured redacted logs and OpenTelemetry-compatible traces/metrics
- **Testing:** Vitest and `@effect/vitest`; placement follows `knowledge_base/decisions/repository-test-structure.md`

Workspace ownership:

```text
apps/web                dashboard browser/SSR application
apps/server             Express, oRPC, and public HTTP process boundary
apps/worker             publication-event and webhook delivery process
apps/developers         public developer documentation
packages/api            contracts, kernels, operations, services, repositories
packages/auth           Better Auth and OAuth protocol boundary
packages/cli            CLI, static extractor, experimental build boundary
packages/db             Drizzle authority and immutable migration history
packages/env            environment contracts
packages/public-contracts canonical public artifact registry
packages/schema         declarative code-schema contract and validator
packages/sdk            public API clients and helpers
packages/ui             shared UI primitives
```

Packages must not import app source. Production applications must declare and build runtime-externalized workspace dependencies directly.

## Non-negotiable invariants

- Projects are capability containers; `main` is the initial visible environment.
- Every content operation names an exact locale. English is required and there is no fallback.
- Shared draft values are copied into immutable locale publications; draft edits never mutate prior publications or Delivery output.
- Stable IDs are distinct from mutable labels, API keys, and M13 source keys.
- Application APIs use `{ ok, data, error, message }`; Better Auth and webhook protocols retain native contracts.
- Authorization is server-side, default-deny, tenant/environment scoped, and performed before sensitive work.
- External input is bounded and decoded; SQL is parameterized; logs, metrics, errors, audits, and generated files exclude secrets and content bodies.
- Business workflows use stable Effect v3. `Effect.run*` remains at process/framework boundaries.
- Only `apps/worker` sends webhooks.
- Agents never generate/apply migrations, publish packages, change production rollout, retire the builder, commit, or accept a milestone.
- Stop and verify independent workers are stopped before shared-database integration or coverage.

M13 additionally requires:

- Code owns published collection structure; hosted immutable presentation owns labels/layout; PostgreSQL owns content.
- Tier 1 statically reduces a closed TypeScript grammar before credentials exist and never executes developer modules.
- Tier 2 is explicit, experimental, default-off, credential-blind, and reports `memoryLimitHard: false`; no Node `vm`, child/shell/npm execution, unrestricted loader, or weaker fallback is allowed.
- Stable collection/field/enum IDs remain server-generated. Ephemeral planning IDs are never returned, persisted, reserved, or accepted.
- Schema apply revalidates under lock, requires exact acknowledgements, and atomically couples revisions, pointers, audits, outbox events, and receipts.
- Credential writes are attributed to the credential, never its issuer.
- Authoring v1 stays separate from read-only Tooling v1 and remains bearer-only, originless, redirect-free, and `no-store`.
- Local editor browser code must never receive hosted bearer/refresh/management credentials or persist hosted content locally.

## Implemented milestone map

M0–M12 are developer-approved and committed. M13 is developer-approved with its commit still pending.

| Milestone | Capability                                                        | Commit    |
| --------- | ----------------------------------------------------------------- | --------- |
| M0        | Stack/auth/session/CORS/environment/Docker baseline               | `7d5a312` |
| M1        | Effect runtime, typed failures, response envelopes, observability | `c28f6fa` |
| M2        | Workspaces, projects, capabilities, `main`, ownership, audits     | `60adb39` |
| M3        | Memberships, roles, policy, credentials, rotation/revocation      | `a74aeb8` |
| M4        | Required English, strict locales, locale access                   | `68b6f6e` |
| M5        | Versioned schema drafts/publication and stable field identity     | `28ca04d` |
| M6        | Field system, validation, rich text, assets, editor layout/forms  | `fbb4767` |
| M7        | Entries, multilingual drafts, revisions, restore                  | `60bd96f` |
| M8        | Exact-locale publication and immutable snapshots                  | `ad3cd5e` |
| M9        | Production Delivery API v1                                        | `8559aa4` |
| M10       | Preview API v1 and dashboard Preview UX                           | `aa177b5` |
| M11       | Publication events, webhooks, retries, invalidation               | `fef7205` |
| M12       | Developer portal, Tooling API, OAuth-capable CLI, SDK/generation  | `4e87908` |
| M13       | Code-first authoring, Authoring API, SDK/CLI, and local editor    | Pending   |

## M13 implementation map

| Area                                 | Current truth                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design/dependency gates              | Complete and approved; TypeScript 6.0.3 fixed; QuickJS 0.32.0 experimental only                                                                                |
| Schema package and Tier 1 extraction | Complete programmatic contracts/validator/extractor with packaged hostile proof                                                                                |
| Experimental Tier 2 runtime          | Explicit credential-blind build/check/manifest and non-executing plan/push/editor stale checks complete; production/default remains blocked                    |
| Source/hash/actor database authority | Complete through developer-applied migration `0014`; live invariants verified                                                                                  |
| Schema planning/apply/export kernels | Complete, including atomic apply, receipts, replay, stable IDs, references, audits/outbox                                                                      |
| Authoring HTTP API                   | Twelve schema/content/presentation paths implemented with exact grants, strict transport, and optimistic authority                                             |
| Content writes/publication           | Atomic create plus list/get/save/status/validate/publish/unpublish implemented                                                                                 |
| Authoring SDK                        | Exact Promise/Effect clients cover schema, presentation, generated forms, content, safe helpers, and strict route/query bounds                                 |
| Authoring HTTP proof                 | Successful/adversarial schema, presentation, content/publication, load, query, rollback, attribution, redaction, and observability proof passes                |
| CLI                                  | Config v2, schema/content workflows, secure editor, packaged pre-auth/launch proof, parser fuzz, and controlled real-browser evidence are complete             |
| Presentation authority               | Immutable presentation publication and the complete dashboard presentation editor are implemented with hash-separation proof                                   |
| Shared form package                  | Private browser-safe package owns the 18-kind controlled renderer and pure value helpers; dashboard migration passes parity                                    |
| Local editor                         | Bundled React UX, exact loopback BFF, source-identity drift projection, split renderer, conflict reload, publication, axe, package, and Firefox proof complete |
| Builder retirement                   | Complete after explicit parity-based approval; dashboard structure controls are removed and legacy authenticated mutations return stable 410                   |
| Docs/release/final review            | Guides, examples, READMEs, Changeset, package/Docker provenance, cleanup, all 13 manual scenarios, full readiness, and developer acceptance are complete       |

All 13 manual scenarios are accepted. Their composed workflow exposed and resolved Tooling optional-value JSON/hash parity, config-v2 lock ownership, locale-policy and availability precedence, companion-row, retry-journal, receiver-provenance, and long-lived process-environment issues. Final 1,184-test readiness, package/image, residue, and invariant evidence passes; dashboard retirement retains content, Presentation, Delivery, navigation, and read-only current-structure authority.

## Architecture landmarks

- **Runtime/errors:** `packages/api/src/contracts/api-response.ts`, `packages/api/src/contracts/errors.ts`, `packages/api/src/runtime.ts`
- **Authorization:** `packages/api/src/services/policy.ts`, `packages/api/src/services/tooling-principal-authenticator.ts`
- **Schema authoring:** `packages/api/src/services/authoring-schema-repository.ts`, `packages/api/src/services/authoring-schema-apply.ts`
- **Presentation:** `packages/api/src/services/authoring-presentation-repository.ts`, `packages/api/src/lib/authoring-presentation.ts`, `apps/web/src/components/presentation-editor.tsx`
- **Content authoring:** `packages/api/src/services/authoring-content-repository.ts`, `packages/api/src/lib/authoring-mutations.ts`
- **Authoring transport:** `packages/api/src/operations/authoring-public.ts`, `apps/server/src/app.ts`
- **Public contracts:** `packages/api/src/contracts/authoring-openapi.ts`, `packages/public-contracts/`
- **Schema/extraction:** `packages/schema/`, `packages/cli/src/static-schema-extractor.ts`, `packages/cli/src/experimental-schema-build.ts`
- **SDK:** `packages/sdk/src/authoring.ts`
- **Shared forms:** `packages/content-form/`, with dashboard validation adapter at `apps/web/src/components/generated-form.tsx`
- **Dashboard read-only collection authority:** `apps/web/src/components/schema-builder.tsx`, `apps/web/src/components/project-collections.tsx`
- **Database:** `packages/db/src/schema/`, `packages/db/src/migrations/`

## Selective decision map

| Domain                          | Decision                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| Effect/runtime/observability    | `knowledge_base/decisions/m1-effect-boundaries.md`                                   |
| Access/credentials              | `knowledge_base/decisions/m3-access-and-credentials-design.md`                       |
| Locales                         | `knowledge_base/decisions/m4-project-locales-design.md`                              |
| Schema lifecycle                | `knowledge_base/decisions/m5-versioned-schema-engine-design.md`                      |
| Fields/layout/forms             | `knowledge_base/decisions/m6-field-system-and-generated-forms-design.md`             |
| Drafts/revisions                | `knowledge_base/decisions/m7-entries-multilingual-drafts-and-revisions-design.md`    |
| Publication                     | `knowledge_base/decisions/m8-independent-locale-publication-and-snapshots-design.md` |
| Public delivery/preview/events  | M9, M10, and M11 decision records                                                    |
| Tooling/portal/SDK/CLI          | `knowledge_base/decisions/m12-developer-portal-and-generated-tooling-design.md`      |
| M13 code-first authoring/editor | `knowledge_base/decisions/m13-code-first-authoring-and-local-editor-design.md`       |
| Test ownership                  | `knowledge_base/decisions/repository-test-structure.md`                              |

## Validation baseline

- Final repository-wide M13 baseline: `pnpm run ready` passes with 1,184 tests, 15 type-check tasks, public-contract checks, formatting, lint, structure, coverage, and eight builds after retirement and locale-authority fixes.
- Reported final suites include 13 content-form, 18 SDK, 105 CLI, 723 API, 138 server, and 115 dashboard tests. Focused retirement/authority evidence passes 19 API, 22 dashboard/router/accessibility, and 78 combined platform/Authoring server tests. The prior detailed coverage baseline was CLI 75.34% statements/76.15% branches, editor-app 82.11%/72.20%, and API 88.39%/74.33%; the final full run passed configured thresholds.
- Shared-database tests ran with the independent worker stopped and zero test connections. Developer-approved transactional cleanup removed the exact canceled-run fixture graph: 10 users/projects, eight workspaces, six draft entries, 16 outbox rows, 14 derived publication events, 178 audits, and zero immutable content-publication artifacts. Post-cleanup residue and source/hash/actor/webhook checks are zero; supported outbox projection is current and the worker is healthy.
- Treat these as recorded baselines, not proof for subsequent code changes.

## Next scope

1. M13 is developer-accepted; prepare its pending commit without performing it automatically.
2. Execute package/CLI versioning, publication, OAuth rollout, production configuration, and deployment only through their separate developer-controlled release gates.
3. Before implementation, create and approve a new milestone for the discussed split: hosted account/project control plane, framework-neutral project Studio at a configurable path, and complete agent-first CLI/SDK authority.

## Documentation ownership

- `product.md`: durable product vision
- `prd/cms.md`: behavioral requirements and public invariants
- `milestone.md`: ordered goals and acceptance criteria
- `progress.md`: factual implementation/checklist and execution evidence
- `context.md`: concise zero-context discovery and current implementation map
- `learnings.md`: consequential mistakes and prevention rules only
- `decisions/*.md`: approved rationale and load-bearing constraints
- `proposals/*.md`: unapproved future direction only
