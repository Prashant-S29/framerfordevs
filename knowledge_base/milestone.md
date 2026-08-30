# CMS and Platform Implementation Milestones

**Purpose:** Keep accepted work concise and give future agents enough approved context to design each pending milestone without reconstructing prior discussion. This file is not a substitute for a milestone design/decision record.

## Global definition of done

Every milestone must:

1. Implement one bounded authority slice and one coherent user/developer outcome without weakening product invariants.
2. Deliver stable HTTP for every meaningful operation and noninteractive CLI parity for developer/agent automation; expose SDK methods only for approved content/runtime integration under `decisions/public-http-cli-and-sdk-surface-boundary.md`.
3. Add deterministic success, failure, authorization, boundary, regression, accessibility, load, concurrency, and failure-injection coverage as applicable.
4. Preserve typed Effect errors/Layers/runtime boundaries, API envelopes, tenant isolation, bounded validation, redaction, observability, stable identities, immutable revisions/publications, and exact-locale authority.
5. Pass applicable formatting, lint, structure, contract drift, type-check, test, coverage, build, audit, database-invariant, package, and runtime gates.
6. Keep `progress.md`, `context.md`, relevant decisions, and durable learnings current.
7. Stop for developer review; only the developer accepts, commits, publishes, rolls out, deploys, or advances scope.

## Roadmap sizing and sequencing rules

- M13 is the upper bound that future milestones must avoid approaching. Do not combine a new authority model, multiple product surfaces, release rollout, and broad UX migration.
- Establish portable contracts and server authority before depending UI surfaces; add matching noninteractive CLI paths in the same milestone, while SDK inclusion requires a separate content/runtime justification.
- Build the secure Studio runtime before moving editorial workflows, then complete client-handover safety and production readiness before visual work.
- Freeze stable visual bindings before visual composition, add visual publication/dependency authority before renderers, and stop this roadmap after the renderer baseline.
- Design, approve, implement, validate, and review one milestone at a time. A pending entry supplies context but does not authorize design or implementation ahead of its gate.
- A pending milestone may be split further during design. Combining, deleting, or reordering approved scope requires explicit developer approval and an update here first.

## Database change gate

Agents may edit an approved Drizzle schema but must never generate, edit, apply, push, or execute a real migration or snapshot. The developer controls generation/application; the agent fully inspects generated SQL/snapshots/journal before application and verifies the live catalog read-only only after developer confirmation. Any agreed pre-application correction is prepared only as a non-authoritative ignored draft under `tmp/migrations/`.

## Completed milestones

| #   | Summary                                                                                                      | Acceptance             |
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

Post-M13 repository/context normalization is developer-approved and committed at `cd31102`. Its owner-directory structure, direct-import policy, generalized pair/prefix checks, stable exports, and production entrypoints are the baseline for all pending work.

## Pending milestones

### Milestone 14 — Control-plane bootstrap contracts

**Status:** Design proposed in `decisions/m14-control-plane-bootstrap-contracts-design.md`; scoped SDK/CLI correction implemented in the current review worktree, remainder awaiting developer approval, and M14 implementation unauthorized.

**Summary:** Establish the first portable Control Plane v1 slice so workspace/project bootstrap no longer depends on hosted-dashboard internals.

- Define bounded create, discover/list, get, link, archive/recovery boundary, capability inspection, and initial Studio-registration primitives without absorbing governance or Studio runtime work.
- Preserve one server authority across dashboard, HTTP, and CLI; every mutation needs tenant scope, honest actor attribution, idempotency or optimistic concurrency, audit behavior, and deterministic errors.
- Add versioned HTTP/OpenAPI/public-contract ownership and stable noninteractive CLI JSON/exit-code behavior; Control Plane v1 is intentionally excluded from the content/runtime SDK.
- Reconcile user sessions, OAuth CLI tokens, service credentials, exact grants, pagination, secret-safe output, and project/environment identity for each route.
- Decide package/app ownership and compatibility without breaking existing Management/oRPC behavior, M12 public tooling, M13 Authoring, package exports, or generated artifacts.
- Treat Studio registration as control-plane metadata only; do not implement the Studio SPA/BFF, governance breadth, credential/webhook administration, or hosted-surface migration.
- Require success/failure/tenant-isolation/authorization/replay/concurrency/contract/package/load evidence and identify any schema change requiring a developer-generated migration.

**Read before design:** `product.md` product surfaces; `prd/cms.md` §§6.1, 7, 14, 19, 21; M2, M3, M12, M13, and the public HTTP/CLI/SDK boundary decision; current platform operations, public-contract registry, CLI, and dashboard project flows.

### Milestone 15 — Governance automation parity

**Status:** Planned; design not started.

**Depends on:** M14.

**Summary:** Make project governance fully automatable through the same portable authority used by hosted administration.

- Expose memberships, invitations, role assignment, policy administration, project locale administration, and current-`main` environment inspection through portable contracts.
- Preserve last-owner protection, invitation lifecycle, collection/field/locale restrictions, exact action policy, project/environment scope, and permission-filtered responses.
- Make direct HTTP, CLI, and hosted UI operations share the same repository/services and actor/audit/concurrency authority; do not add governance methods to the content/runtime SDK.
- Keep browser and CLI grants least-privileged; distinguish user-session governance from noninteractive automation and never infer issuer authority for credential actors.
- Provide bounded list/search/pagination and stable machine-readable failures so agents can reconcile governance state without scraping UI.
- Do not introduce multi-environment lifecycle, content Studio UX, credential/webhook administration, billing, or recovery operations assigned elsewhere.

**Read before design:** M2–M4, M12, and the public HTTP/CLI/SDK boundary decision; platform/access/locale contracts, policy service, membership/invitation operations, dashboard access/locale UI, and CLI command conventions.

### Milestone 16 — Operational administration and recovery

**Status:** Planned; design not started.

**Depends on:** M14–M15.

**Summary:** Provide safe automation and hosted recovery for credentials, webhooks, audits, and sensitive project operations.

- Add portable credential issue/list/rotate/revoke administration with one-time secret handling, exact family/scope/environment grants, actor attribution, and secret-safe CLI output.
- Add webhook destination/subscription/mapping/attempt/replay administration without weakening encryption, SSRF, signing, retry, lease, or worker-only-delivery boundaries.
- Provide bounded audit/security visibility and recovery-safe project operations appropriate to owners/developers while filtering resources and sensitive fields by policy.
- Keep sensitive recovery and management routes server-side and hosted-control-plane-owned; Studio browser code must never receive management/refresh credentials.
- Add stable HTTP and complete CLI parity, dry-run/confirmation gates where destructive, optimistic/idempotent authority, deterministic pagination, and complete audits; secret and recovery administration never enters the application SDK.
- Exclude production topology hardening, Studio implementation, multi-environment lifecycle, and commercial administration.

**Read before design:** M3, M11–M13 decisions; credential services, webhook services/worker, audit schema/operations, CLI credential-store/OAuth patterns, security and API rules.

### Milestone 17 — Hosted surface separation

**Status:** Planned; design not started.

**Depends on:** M14–M16.

**Summary:** Separate public discovery/authentication from resilient hosted administration without duplicating backend authority.

- Make `framerfordevs.com` the marketing/documentation/authentication entry and `dashboard.framerfordevs.com` the resilient account/workspace/project administration and recovery surface.
- Move hosted UI workflows onto portable control-plane contracts without creating a second business-rule authority or coupling public packages to app source.
- Keep the dashboard available when a customer application/Studio is unavailable and preserve bootstrap, registration, credential, webhook, security, and recovery access.
- Define explicit host/route ownership, cookies/session boundaries, redirects, CORS/origin behavior, navigation, canonical links, and failure states for both surfaces.
- Retain current content/editorial UI temporarily until M19–M21 prove Studio and handover parity; do not remove usable authority early.
- Prepare production host allowlists and operator/reference isolation for M23, but leave deployment/configuration changes developer-controlled.

**Read before design:** product surfaces; PRD §§6.1, 11, 21; M3, M12, M13 decisions; `apps/web`, `apps/developers`, server route composition, auth configuration, Docker/ingress configuration.

### Milestone 18 — Studio mount and security runtime

**Status:** Planned; design not started.

**Depends on:** M14 and M17.

**Summary:** Establish the secure framework-neutral runtime and mounting contract on which every project Studio workflow depends.

- Define a framework-neutral Studio SPA mounted at a developer-configured path such as `/studio`, with deterministic asset/base-path behavior and no framework-specific business authority.
- Define a Web Standards `Request → Response` BFF contract plus thin supported framework adapters; adapters translate hosting/runtime concerns but do not reimplement policy.
- Specify Studio registration/discovery, project/environment binding, session handoff, sign-in/recovery redirects, and behavior when the hosted platform or customer app is unavailable.
- Use short-lived user/session authority, exact operation allowlists, CSRF/origin/CSP protections, bounded bodies/responses, `no-store` where sensitive, and no hosted bearer/refresh/management credentials in browser code.
- Reuse shared form/editor packages and converge with the secure M13 local-editor BFF without weakening its loopback-only and secret-isolation properties.
- Establish role/project/environment projection and safe bootstrap payloads before content routes; browser state must not become hosted content authority.
- Cover configurable paths, adapter parity, auth expiry/revocation, hostile origins, traversal, redirects, bundle boundaries, secret scanning, accessibility shell, and framework-neutral packaging.

**Read before design:** product Studio surface; PRD §§6.1, 20–22; M3, M6, M10, M13 decisions; local editor loopback/protocol/app, content-form package, hosted dashboard router/auth middleware.

### Milestone 19 — Studio content and localization

**Status:** Planned; design not started.

**Depends on:** M18.

**Summary:** Move everyday role-projected content and exact-locale draft authoring into the mounted project Studio.

- Move role-projected collection and entry browsing into Studio with bounded pagination/search, permission-correct counts, direct-route enforcement, and large-collection behavior.
- Render the complete 18-kind generated form system with immutable Presentation metadata, shared-field separation, exact enabled-locale tabs, and no schema-structure authoring.
- Support entry create/rename, shared and localized draft save, validation/status, optimistic conflicts, retries, unsaved navigation, and source/schema drift recovery.
- Ensure hidden or read-only collections/fields/locales are removed or immutable in server payload/authority—not merely hidden in React—and reject forged direct requests.
- Preserve exact locale, role, project/environment, stable ID, revision, and actor authority across Studio BFF and Authoring services.
- Provide accessible errors, focus, keyboard locale navigation, non-color status, loading/empty/failure states, and approved large-form/list responsiveness.
- Keep revision comparison/restore, review, publication, Preview, and complete client handover in M20–M21.

**Read before design:** M3–M7 and M13 decisions; content-form package, entry repository/operations, Authoring content API/SDK, current dashboard entry editor, M13 editor application.

### Milestone 20 — Studio editorial lifecycle

**Status:** Planned; design not started.

**Depends on:** M19.

**Summary:** Complete Studio revision, Presentation, Preview, and publication authority before client handover.

- Add shared/localized revision history, comparison, restore, and changed-since-publish state while preserving immutable history and optimistic authority.
- Add editorial Presentation viewing/editing/publication for form labels/layout only; code remains the sole schema-structure authority.
- Integrate current/historical Preview with exact role/locale/source selection, no draft leakage, safe renderer boundaries, and clear stale/conflict states.
- Add permission-aware exact-locale validate/publish/unpublish workflows with immutable publications, audits, outbox events, replay/no-op semantics, and Delivery verification.
- Converge hosted Studio and `ffd editor` on shared contracts/components while preserving local loopback deployment and credential isolation.
- Prove parity before retiring duplicate hosted dashboard editorial routes; retain hosted control-plane read-only structure and administration.
- Exclude review submission/approval, client handover polish, scheduled publishing, visual page editing, and schema mutation.

**Read before design:** M6–M10, M11, and M13 decisions; publication/preview/presentation services and contracts, Studio/content-form work from M18–M19, current dashboard Preview/Presentation, local editor.

### Milestone 21 — Client handover and editorial safety

**Status:** Planned; preserves the original pre-normalization M14 scope.

**Depends on:** M15 and M19–M20.

**Summary:** Make the completed CMS safe, understandable, accessible, and recoverable for non-technical client handover.

- Deliver client-focused Studio navigation, authenticated direct handover links, permission-filtered ordered activity, and project/collection/locale context understandable without implementation knowledge.
- Enforce collection/field/locale restrictions in payloads, counts, search, direct routes, and direct APIs; clients never receive credentials, API keys, internal IDs, schema controls, protected fields, or forbidden mutations.
- Let users without publish authority save drafts and submit review while preventing UI/API publication; approval/rejection must preserve exact locale and role permissions.
- Provide accurate shared/localized revision comparison and restore, translation completeness after required-field changes, and textual draft/publication/pending status beyond color.
- Preserve work across unsaved navigation, network interruption, retries, and duplicate submissions with deterministic conflict/recovery UX.
- Require accessible summaries, field associations, focus/announcement, keyboard locale tabs, and developer-approved large-form/list responsiveness.
- Retain the original manual test: hand a project to a non-technical user and observe the complete edit/review/publish path without exposing implementation authority.

**Read before design:** original M14 section from `9c68942`; M3–M8 and M13 decisions; M15 and M19–M20 output; current accessibility suites and client-facing dashboard/editor flows.

### Milestone 22 — Data durability and portability

**Status:** Planned; preserves the data/retention half of the original pre-normalization M15.

**Depends on:** M21.

**Summary:** Prove that complete CMS authority can be backed up, restored, transferred, retained, and self-hosted without losing identity or history.

- Define and prove backup/restore coverage for schemas, drafts, publications, credential metadata, events, audits, source identities, receipts, Presentation, and later Studio registration state.
- Detect corrupted/incomplete backups and exercise timed restore verification without mutating accepted migration history or weakening encryption/secret policy.
- Define bounded export/import contracts that preserve stable identities and references or report explicit intentional remapping/conflicts before writes.
- Define retention for schema/draft/publication command receipts, audits, outbox/event records, attempts, and immutable history without silently weakening replay/idempotency guarantees.
- Any finite receipt lifetime must specify retry windows, expired-command behavior, replay-preventing tombstones/equivalent authority, cleanup bounds, backup consequences, and privacy effects.
- Define self-host compatibility/version contracts, portable configuration/secrets, replaceable infrastructure boundaries, and documented database operations.
- Add operator-facing recovery drills and evidence ownership, while leaving broad production SLO/security/topology proof to M23.

**Read before design:** original M15 section from `9c68942`; PRD §§17 and 22; M5, M7–M8, M11–M13 decisions; all receipt/audit/outbox schemas, backup-sensitive encrypted fields, package/version metadata.

### Milestone 23 — Production security and operational readiness

**Status:** Planned; preserves the hardening half of the original pre-normalization M15.

**Depends on:** M17 and M22.

**Summary:** Prove the completed CMS and its production topology can operate securely and predictably under realistic load and failure.

- Define Delivery/publication/webhook/authoring/control-plane SLOs, independent rate-limit policies, cache/failure modes, actionable dashboards/alerts, incident runbooks, rollback, and timed recovery approval.
- Prove full tenant/query/service isolation and authorization matrices, plus fuzz/property coverage for schemas, content, rich text, cursors, webhooks, and response encoding.
- Run simultaneous authoring/publication/delivery/webhook load, soak, concurrency, DB restart/failover, cache outage, telemetry outage, and webhook-capacity isolation with bounded resources/logging.
- Cover injection, XSS/rich text, CSRF, CORS, SSRF, credential leakage, replay, enumeration, privilege escalation, dependency/container vulnerabilities, and PII/secret scanning.
- Enforce network-level webhook-worker denial of loopback/private/link-local/CGNAT/internal/cloud-metadata targets while allowing required DNS/public HTTPS, plus provider-appropriate metadata hardening such as IMDSv2-only or disablement.
- Prove production host/ingress separation for marketing, dashboard/auth, public APIs, docs, management references, metrics/diagnostics, and operator endpoints across hosts, routes, methods, redirects, and CORS/preflight.
- Retain the original manual gate: exercise rollback/recovery and perform an explicit developer production-readiness review before any release rollout.

**Read before design:** original M15 section from `9c68942`; M1, M3, M9–M13 decisions; security/performance/observability rules; Docker/ingress/worker/load tooling and current operational evidence.

### Milestone 24 — Environment lifecycle and promotion

**Status:** Planned; design not started.

**Depends on:** M14–M23.

**Summary:** Expand the single-`main` foundation into explicit user-visible environments and safe promotion workflows.

- Introduce user-visible environments beyond internal `main` without converting projects or changing stable project/resource identities.
- Define create/list/update/archive and primary/default semantics, environment ordering/naming, dependency guards, and recovery behavior.
- Scope memberships/policies, locales, credentials, webhooks, schemas, entries, publications, Delivery/Preview/Authoring, Studio registration, audits, and quotas exactly by environment.
- Define explicit schema/content/config promotion or copy workflows with dry-run, conflict classification, acknowledgements, stable/remapped identity rules, and no implicit production writes.
- Keep Delivery exact-locale behavior and immutable publications independent per environment; no cross-environment fallback or credential acceptance.
- Add HTTP/CLI/control-plane/Studio environment lifecycle and selection parity, prevent ambiguous defaults in automation, and keep SDK environment support to explicit runtime/content selection rather than lifecycle administration.

**Read before design:** PRD §7; M2–M5, M8–M13 decisions; current environment columns/services/contracts, CLI config/locks, control-plane and Studio outputs.

### Milestone 25 — Managed assets and media

**Status:** Planned; design not started.

**Depends on:** M18 and M22–M24.

**Summary:** Add portable, permissioned managed media while preserving existing external-asset and immutable publication contracts.

- Add managed upload/storage authority and media-library browsing without breaking the existing structured external-asset field contract.
- Define stable asset identity, project/environment ownership, metadata, variants/transforms, lifecycle, references, publication pinning, and deletion/dependency behavior.
- Bound file size/type/count, streaming/memory, image/document processing, URLs, malware/content checks, and transformation resource use.
- Keep storage credentials/signing server-side; protect upload/download routes against tenant leakage, path traversal, SSRF, malicious formats, and unbounded remote fetches.
- Project assets through role/field/locale permissions into generated forms, Studio, Delivery/Preview, content SDK methods where justified, CLI import/export, audits, and events; storage administration stays outside the SDK.
- Preserve portability through replaceable storage/delivery providers and explicit immutable publication behavior.

**Read before design:** PRD §§8.6, 21–22; M3, M6, M8–M11 decisions; external-asset contracts/forms, Studio work, webhook/invalidation and backup boundaries.

### Milestone 26 — Workflow automation and scheduling

**Status:** Planned; design not started.

**Depends on:** M21 and M24–M25.

**Summary:** Extend safe editorial handover with durable review automation and exact-locale scheduling.

- Extend M21 review submission with explicit review notes, assigned reviewers, approval/rejection transitions, and permission-aware workflow state without replacing draft/publication truth.
- Define workflow identity/versioning, optimistic/idempotent commands, exact locale/environment/resource scope, actor attribution, audits, notifications/events, and safe history.
- Add scheduled exact-locale publish/unpublish with immutable requested authority, cancellation/rescheduling, stale-draft/schema/reference detection, and no silent revalidation bypass.
- Ensure only the worker executes due schedules, with durable claiming, retries, crash recovery, bounded backlog, observability, and atomic publication/audit/outbox semantics.
- Expose complete HTTP/CLI/Studio parity, machine-safe dry-runs/status, timezone/clock rules, accessible review queues, and clear failure/recovery states; add SDK methods only if a separate trusted content-integration need is proven.
- Preserve immediate publication paths and do not couple workflow/scheduling to future visual-site publication before M29 designs that authority.

**Read before design:** M3–M4, M7–M8, M11, M13 decisions; M21 handover behavior, publication repositories, worker lease patterns, event/webhook systems.

### Milestone 27 — Visual-builder readiness contracts

**Status:** Planned; preserves the original pre-normalization M16 and must complete before visual editing.

**Depends on:** M20–M26.

**Summary:** Freeze the stable CMS binding and compatibility baseline required before any visual-editor authority is introduced.

- Freeze stable-ID CMS binding contracts that survive label changes and non-breaking schema revisions and report affected bindings before breaking schema publication.
- Define internal CMS and future provider boundaries without implementing external REST/GraphQL/database integrations in this roadmap.
- Define dependency manifests and route/semantic invalidation registration with project/environment/locale/schema/publication scope, cross-project rejection, and documented shared dependencies.
- Define renderer-facing locale/publication contracts and compatibility/versioning fixtures across supported schema revisions.
- Ensure binding resolution enforces permissions and exact project/environment/locale/published revision authority; unknown, stale, forbidden, or unpublished resources fail closed.
- Guarantee visual enablement leaves Delivery integrations unchanged and requires no copy/migration of entries, publications, members, policies, locales, or assets.
- Retain the original manual review: resolve a simulated visual-site binding against an existing CMS project and prove no migration.

**Read before design:** original M16 section from `9c68942`; product canonical representation; PRD §§18 and 23; M5–M6, M8–M11, M13 decisions; public contracts, invalidation mappings, Delivery/Preview projections.

### Milestone 28 — Visual Studio composition

**Status:** Planned; design not started.

**Depends on:** M27.

**Summary:** Add framework-neutral visual-site resources and permission-aware composition workflows to Studio.

- Introduce stable site, page, route, component-node, reusable-component, style, breakpoint, design-token, navigation, SEO, and binding identities separate from CMS content and Presentation.
- Store framework-neutral structured presentation resources rather than generated HTML or framework component instances.
- Define developer component manifests/props/slots/events and safe registration/version compatibility before exposing components to designers/clients.
- Add permission-aware Studio canvas, tree, inspector, route/page navigation, responsive styling, token selection, and CMS binding workflows.
- Preserve code ownership and prevent visual edits from mutating code-owned CMS schema, custom-component implementation, or unrestricted application behavior.
- Add immutable draft revisions, optimistic commands, undo/redo boundaries, conflict/recovery UX, accessibility, performance budgets, and large-tree virtualization.
- Keep publication/rendering authority in M29–M30; previews may use bounded design-time projection but cannot become production output.

**Read before design:** product visual-builder/canonical model/principles; M3, M5–M6, M13, and M27 decisions/contracts; Studio architecture from M18–M21.

### Milestone 29 — Visual publication and dependencies

**Status:** Planned; design not started.

**Depends on:** M27–M28.

**Summary:** Give visual resources immutable publication, Preview, dependency, and targeted invalidation authority over stable CMS bindings.

- Define validate/classify/acknowledge/publish lifecycle for immutable visual revisions, routes, component trees, styles, tokens, SEO, navigation, and bindings.
- Resolve and pin exact CMS publication/schema/locale dependencies without copying CMS content or weakening independent content publication.
- Analyze schema/binding/component changes and report affected pages/routes before visual publication; stale/forbidden/missing dependencies fail closed.
- Compile page dependency manifests and targeted route/semantic invalidation, including explicit shared dependencies, without global invalidation by default.
- Add visual Preview source/version authority separated from published rendering, with role-safe projection and no draft leakage.
- Commit visual publication pointers, audits, outbox/events, dependency state, and idempotent receipts atomically with rollback/concurrency proof.
- Expose HTTP/CLI/Studio administration parity while leaving SDK exposure to M30 renderer consumption and managed deployment to later product work.

**Read before design:** M5, M8, M10–M11, M13, M27 decisions/contracts; schema classification, publication snapshots/events, invalidation mappings, Preview authority.

### Milestone 30 — Renderer SDK and framework adapters

**Status:** Planned; final numbered milestone in the current roadmap.

**Depends on:** M27–M29.

**Summary:** Complete the current roadmap with a portable renderer baseline for developer-owned CSR, SSR, and static delivery.

- Define a versioned canonical renderer input contract for immutable visual publications, routes, locales, component manifests, design tokens, assets, and pinned CMS bindings.
- Support developer-owned CSR, SSR, incremental/static, and fully static rendering with documented freshness, caching, failure, and hydration behavior.
- Deliver a framework-neutral renderer core plus only explicitly supported thin adapters; do not claim universal framework support or embed platform business authority in adapters.
- Define custom-component resolution, safe prop/data projection, missing/incompatible component behavior, rich-text/asset rendering boundaries, and code-splitting/tree-shaking budgets.
- Translate dependency manifests/events into supported tag/path/regeneration/build-hook behavior while preserving exact targeted invalidation.
- Add fixture compatibility, deterministic output, accessibility/security, performance/bundle, version-skew, and existing-CMS-without-migration proof.

**Read before design:** product delivery modes/canonical representation; PRD §§18, 22–23; M9–M11, M27–M29 contracts; SDK/package/release conventions.

## Long-term directions outside this roadmap

Managed hosting, external backend/data adapters, billing, analytics, and a plugin marketplace remain durable product directions in `product.md`. They are intentionally not assigned milestone numbers here. Reassess and sequence them only after the developer accepts M30 and confirms the next product horizon.

## Cross-cutting blocked and developer-controlled gates

- QuickJS issue #255 continues to block Tier 2 production/default activation and hard-memory proof; it does not block M14–M30.
- Schema/SDK/CLI package versioning/publication, OAuth production rollout, production domains/configuration, deployments, and milestone acceptance remain separate developer-controlled gates; the staged SDK exports must remain within the implemented content/runtime boundary through first publication.
- No pending milestone may silently move schema structure back into hosted visual authoring, expose management credentials to Studio browser code, add locale fallback, replace stable IDs with labels/API/source keys, or weaken immutable/idempotent authority.
