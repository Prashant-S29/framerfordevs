# Milestones

Scope per milestone. Status is in `progress.md`. A pending entry is context, not authorization to design it. Product directions after M30 are in `product.md`.

## Sequencing rules

- One milestone delivers one bounded authority slice and one outcome, well under M13 in size.
- Server authority and HTTP and CLI contracts come before dependent UI. SDK inclusion needs its own justification.
- Order: secure Studio runtime, editorial workflows, client-handover safety, production readiness, then visual work. Freeze visual bindings before composition, and publication authority before renderers.
- Design, implement, validate, and review one milestone at a time. Splitting a milestone during design is allowed. Combining, deleting, or reordering scope needs developer approval and an update here first.
- Never move schema structure into hosted visual authoring, expose management credentials to Studio, add locale fallback, or replace stable IDs.

## Completed

- 0–1: Stack, auth, database, Docker, and test foundation. Effect runtime, typed errors, envelopes, observability.
- 2–4: Workspaces, projects, capabilities, audits. Memberships, roles, invitations, credentials. Required English and locale access.
- 5–8: Versioned schemas with stable IDs. 18 field kinds and generated forms. Entries with shared and localized drafts. Exact-locale publication with immutable snapshots and outbox atomicity.
- 9–11: Delivery v1 with caching and quotas. Preview v1. Publication events, signed webhooks, invalidation, worker delivery.
- 12–13: Tooling v1, OAuth CLI, SDK, public contracts, developer portal. Code-first authoring, Authoring v1, local editor.
- 14–17: Control Plane v1 bootstrap and CLI parity. Governance and operational administration with recovery. Separate marketing, docs, and dashboard hosts.
- 18A–18B: Studio registration authority, OAuth, mounted Studio runtime, encrypted sessions, framework adapters.
- 19A–19B: Studio Content protocol and the mounted browse, search, edit, and recovery experience.

## Pending

### Milestone 20 — Studio editorial lifecycle

Bring revision, publication, Preview, and Presentation authority into the Studio before client handover, in three parts. Exclude review approval, scheduling, visual editing, and schema mutation.

- 20A: Studio revision list, read, compare, and restore, value-based changed-since-publish, and exact-locale validate, publish, and unpublish with Delivery read-back. Add Authoring HTTP and CLI parity for revision read, compare, and restore.
- 20B: Studio current and historical Preview in a sandboxed iframe with a per-environment preview origin and a short-lived token handoff. A `presentation.publish` action lets content_admin edit labels, order, tabs, and groups. Role visibility stays with owner and developer.
- 20C: Host the Studio workspace in `ffd editor` over its loopback transport without exposing the token. Retire dashboard editorial and preview routes after parity browser specs pass, and keep hosted structure and administration.

### Milestone 21 — Client handover and editorial safety

Make the completed CMS safe, understandable, accessible, and recoverable for non-technical client handover.

- Deliver client-focused Studio navigation, authenticated direct handover links, permission-filtered ordered activity, and project/collection/locale context understandable without implementation knowledge.
- Enforce collection/field/locale restrictions in payloads, counts, search, direct routes, and direct APIs; clients never receive credentials, keys, internal IDs, schema controls, or protected fields.
- Let users without publish authority save drafts and submit review while preventing UI/API publication; approval/rejection must preserve exact locale and role permissions.
- Provide translation completeness after required-field changes, and textual draft/publication/pending status beyond color.
- Preserve work across unsaved navigation, network interruption, retries, and duplicate submissions with deterministic conflict/recovery UX.
- Require accessible summaries, field associations, focus/announcement, keyboard locale tabs, and developer-approved large-form/list responsiveness.
- Retain the original manual test: hand a project to a non-technical user and observe the complete edit/review/publish path without exposing implementation authority.

### Milestone 22 — Data durability and portability

Prove that complete CMS authority can be backed up, restored, transferred, retained, and self-hosted without losing identity or history.

- Define and prove backup/restore coverage for schemas, drafts, publications, credential metadata, events, audits, source identities, receipts, Presentation, and later Studio registration state.
- Detect corrupted/incomplete backups and exercise timed restore verification without mutating accepted migration history or weakening encryption/secret policy.
- Define bounded export/import contracts that preserve stable identities and references or report explicit intentional remapping/conflicts before writes.
- Define retention for schema/draft/publication command receipts, audits, outbox/event records, attempts, and immutable history without silently weakening replay/idempotency guarantees.
- Any finite receipt lifetime must specify retry windows, expired-command behavior, replay-preventing tombstones/equivalent authority, cleanup bounds, backup consequences, and privacy effects.
- Define self-host compatibility/version contracts, portable configuration/secrets, replaceable infrastructure boundaries, and documented database operations.
- Add operator-facing recovery drills and evidence ownership, while leaving broad production SLO/security/topology proof to M23.

### Milestone 23 — Production security and operational readiness

Prove the completed CMS and its production topology can operate securely and predictably under realistic load and failure.

- Define Delivery/publication/webhook/authoring/control-plane SLOs, independent rate-limit policies, cache/failure modes, actionable dashboards/alerts, incident runbooks, rollback, and timed recovery approval.
- Prove full tenant/query/service isolation and authorization matrices, plus fuzz/property coverage for schemas, content, rich text, cursors, webhooks, and response encoding.
- Run simultaneous authoring/publication/delivery/webhook load, soak, concurrency, DB restart/failover, cache outage, telemetry outage, and webhook-capacity isolation with bounded resources/logging.
- Cover injection, XSS/rich text, CSRF, CORS, SSRF, credential leakage, replay, enumeration, privilege escalation, dependency/container vulnerabilities, and PII/secret scanning.
- Enforce network-level webhook-worker denial of loopback, private, link-local, CGNAT, internal, and cloud-metadata targets while allowing DNS and public HTTPS, plus IMDSv2-only or disabled metadata.
- Prove production host/ingress separation for marketing, dashboard/auth, public APIs, docs, management references, metrics/diagnostics, and operator endpoints across hosts, routes, methods, redirects, and CORS/preflight.
- Retain the original manual gate: exercise rollback/recovery and perform an explicit developer production-readiness review before any release rollout.

### Milestone 24 — Environment lifecycle and promotion

Expand the single-`main` foundation into explicit user-visible environments and safe promotion workflows.

- Introduce user-visible environments beyond internal `main` without converting projects or changing stable project/resource identities.
- Define create/list/update/archive and primary/default semantics, environment ordering/naming, dependency guards, and recovery behavior.
- Scope memberships/policies, locales, credentials, webhooks, schemas, entries, publications, Delivery/Preview/Authoring, Studio registration, audits, and quotas exactly by environment.
- Define explicit schema/content/config promotion or copy workflows with dry-run, conflict classification, acknowledgements, stable/remapped identity rules, and no implicit production writes.
- Keep Delivery exact-locale behavior and immutable publications independent per environment; no cross-environment fallback or credential acceptance.
- Add HTTP/CLI/control-plane/Studio environment lifecycle and selection parity, no ambiguous defaults in automation, and SDK environment support limited to explicit runtime/content selection.

### Milestone 25 — Managed assets and media

Add portable, permissioned managed media while preserving existing external-asset and immutable publication contracts.

- Add managed upload/storage authority and media-library browsing without breaking the existing structured external-asset field contract.
- Define stable asset identity, project/environment ownership, metadata, variants/transforms, lifecycle, references, publication pinning, and deletion/dependency behavior.
- Bound file size/type/count, streaming/memory, image/document processing, URLs, malware/content checks, and transformation resource use.
- Keep storage credentials/signing server-side; protect upload/download routes against tenant leakage, path traversal, SSRF, malicious formats, and unbounded remote fetches.
- Project assets through role/field/locale permissions into generated forms, Studio, Delivery/Preview, justified SDK methods, CLI import/export, audits, and events; storage administration stays out of the SDK.
- Preserve portability through replaceable storage/delivery providers and explicit immutable publication behavior.

### Milestone 26 — Workflow automation and scheduling

Extend safe editorial handover with durable review automation and exact-locale scheduling.

- Extend M21 review submission with explicit review notes, assigned reviewers, approval/rejection transitions, and permission-aware workflow state without replacing draft/publication truth.
- Define workflow identity/versioning, optimistic/idempotent commands, exact locale/environment/resource scope, actor attribution, audits, notifications/events, and safe history.
- Add scheduled exact-locale publish/unpublish with immutable requested authority, cancellation/rescheduling, stale-draft/schema/reference detection, and no silent revalidation bypass.
- Ensure only the worker executes due schedules, with durable claiming, retries, crash recovery, bounded backlog, observability, and atomic publication/audit/outbox semantics.
- Expose complete HTTP/CLI/Studio parity, machine-safe dry-runs/status, timezone/clock rules, accessible review queues, and clear failure/recovery states; SDK methods only for a proven content-integration need.
- Preserve immediate publication paths and do not couple workflow/scheduling to future visual-site publication before M29 designs that authority.

### Milestone 27 — Visual-builder readiness contracts

Freeze the stable CMS binding and compatibility baseline required before any visual-editor authority is introduced.

- Freeze stable-ID CMS binding contracts that survive label changes and non-breaking schema revisions and report affected bindings before breaking schema publication.
- Define internal CMS and future provider boundaries without implementing external REST/GraphQL/database integrations in this roadmap.
- Define dependency manifests and route/semantic invalidation registration with project/environment/locale/schema/publication scope, cross-project rejection, and documented shared dependencies.
- Define renderer-facing locale/publication contracts and compatibility/versioning fixtures across supported schema revisions.
- Ensure binding resolution enforces permissions and exact project/environment/locale/published revision authority; unknown, stale, forbidden, or unpublished resources fail closed.
- Guarantee visual enablement leaves Delivery integrations unchanged and requires no copy/migration of entries, publications, members, policies, locales, or assets.
- Retain the original manual review: resolve a simulated visual-site binding against an existing CMS project and prove no migration.

### Milestone 28 — Visual Studio composition

Add framework-neutral visual-site resources and permission-aware composition workflows to Studio.

- Introduce stable site, page, route, component-node, reusable-component, style, breakpoint, design-token, navigation, SEO, and binding identities separate from CMS content and Presentation.
- Store framework-neutral structured presentation resources rather than generated HTML or framework component instances.
- Define developer component manifests/props/slots/events and safe registration/version compatibility before exposing components to designers/clients.
- Add permission-aware Studio canvas, tree, inspector, route/page navigation, responsive styling, token selection, and CMS binding workflows.
- Preserve code ownership and prevent visual edits from mutating code-owned CMS schema, custom-component implementation, or unrestricted application behavior.
- Add immutable draft revisions, optimistic commands, undo/redo boundaries, conflict/recovery UX, accessibility, performance budgets, and large-tree virtualization.
- Keep publication/rendering authority in M29–M30; previews may use bounded design-time projection but cannot become production output.

### Milestone 29 — Visual publication and dependencies

Give visual resources immutable publication, Preview, dependency, and targeted invalidation authority over stable CMS bindings.

- Define validate/classify/acknowledge/publish lifecycle for immutable visual revisions, routes, component trees, styles, tokens, SEO, navigation, and bindings.
- Resolve and pin exact CMS publication/schema/locale dependencies without copying CMS content or weakening independent content publication.
- Analyze schema/binding/component changes and report affected pages/routes before visual publication; stale/forbidden/missing dependencies fail closed.
- Compile page dependency manifests and targeted route/semantic invalidation, including explicit shared dependencies, without global invalidation by default.
- Add visual Preview source/version authority separated from published rendering, with role-safe projection and no draft leakage.
- Commit visual publication pointers, audits, outbox/events, dependency state, and idempotent receipts atomically with rollback/concurrency proof.
- Expose HTTP/CLI/Studio administration parity while leaving SDK exposure to M30 renderer consumption and managed deployment to later product work.

### Milestone 30 — Renderer SDK and framework adapters

Complete the current roadmap with a portable renderer baseline for developer-owned CSR, SSR, and static delivery.

- Define a versioned canonical renderer input contract for immutable visual publications, routes, locales, component manifests, design tokens, assets, and pinned CMS bindings.
- Support developer-owned CSR, SSR, incremental/static, and fully static rendering with documented freshness, caching, failure, and hydration behavior.
- Deliver a framework-neutral renderer core plus only explicitly supported thin adapters; do not claim universal framework support or embed platform business authority in adapters.
- Define custom-component resolution, safe prop/data projection, missing/incompatible component behavior, rich-text/asset rendering boundaries, and code-splitting/tree-shaking budgets.
- Translate dependency manifests/events into supported tag/path/regeneration/build-hook behavior while preserving exact targeted invalidation.
- Add fixture compatibility, deterministic output, accessibility/security, performance/bundle, version-skew, and existing-CMS-without-migration proof.
