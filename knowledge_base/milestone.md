# CMS Implementation Milestones

**Purpose:** Ordered delivery plan for `prd/cms.md`  
**Execution rule:** Complete one milestone at a time. Automated tests must pass, the developer must manually review, and only the developer decides when to commit and advance.

## Global definition of done

Every milestone must satisfy all applicable items:

1. Acceptance behavior and failure behavior are implemented.
2. Unit, integration, contract, authorization, and regression tests are added as applicable.
3. Tests are deterministic and test names describe expected behavior.
4. `pnpm run check`, `pnpm run check-types`, relevant builds, and relevant tests pass.
5. New Effect operations have typed errors, proper Layers, and meaningful spans.
6. API changes preserve the standard discriminated `{ ok, data, error, message }` response union unless a documented protocol exception applies.
7. Logs and traces contain correlation context but no secrets or full content payloads.
8. Security, performance, UX, DX, reliability, and observability have been reviewed.
9. Documentation, `progress.md`, `context.md`, and `learnings.md` are updated.
10. The developer performs manual review before any commit or next milestone.

## Database change gate

Agents must never generate, apply, push, or run database migrations. When a milestone requires a database change, the agent must:

1. Update the Drizzle schema only after the developer approves that milestone's design.
2. Stop and provide a descriptive migration name and the exact commands for the developer.
3. Wait for the developer to generate and apply it.
4. Inspect the developer-generated migration without rewriting it silently.
5. Run tests only after the developer confirms the database is ready.

---

## Milestone 0 — Validate the existing foundation

### Goal

Establish a trustworthy baseline before changing architecture.

### Deliverables

- Documented local setup and test commands
- Verified pnpm/Turborepo workspace graph
- Verified PostgreSQL connectivity without schema mutation
- Verified Better Auth sign-up, sign-in, session, sign-out, and protected-route behavior
- Verified Express, oRPC, OpenAPI, TanStack Start, and Docker health paths
- Initial testing framework and baseline coverage report
- Baseline security and configuration findings

### Automated success criteria

- Fresh dependency installation completes and the Effect research prepare script is idempotent.
- Type checking succeeds for all packages that define a type-check task; missing tasks are reported.
- Lint/format checks produce a known clean baseline or a documented list of pre-existing failures.
- Production builds complete for web and server.
- PostgreSQL health check succeeds.
- Database connection succeeds with valid configuration and fails safely with invalid configuration.
- No validation command generates or applies migrations.
- Server health endpoint returns the expected status and does not require authentication.
- OpenAPI document/reference route loads.
- Public oRPC health procedure succeeds.
- Protected procedure rejects anonymous callers.
- Valid sign-up creates a usable account.
- Duplicate sign-up returns a safe protocol error.
- Valid sign-in establishes a session cookie.
- Invalid password does not reveal whether more account details exist.
- Session retrieval succeeds for a valid session and returns no user for an invalid/expired session.
- Sign-out invalidates the expected session.
- CORS accepts the configured web origin and rejects an untrusted origin.
- Cookies have expected environment-appropriate security attributes.
- Environment validation fails early for missing/invalid required values without printing secrets.
- Docker web/server health checks pass when the stack is started by the developer.

### Manual review

- Developer signs up, signs in, opens the dashboard, refreshes, and signs out.
- Developer reviews current cookie behavior for local development and production.
- Developer confirms baseline findings before Milestone 1.

---

## Milestone 1 — Effect foundation, error contract, and observability

### Goal

Convert the current application skeleton into an Effect-friendly architecture before CMS business features begin.

### Technical direction

- Use stable Effect v3.
- Keep stable Express, oRPC, Drizzle, and Better Auth integrations at framework boundaries.
- Wrap Promise/throwing third-party calls in typed Effect adapters.
- Use a shared ManagedRuntime at external framework entrypoints.
- Use schema-backed tagged errors for serializable domain/transport failures.
- Introduce OpenTelemetry-compatible tracing, structured logging, and metrics.

### Deliverables

- Effect core package(s) installed using pnpm with aligned versions
- Shared error taxonomy and HTTP mapping
- Standard `ApiResponse<T>` schema and helpers
- Request ID and trace-context middleware
- Application Layers and ManagedRuntime
- Effect adapters for database and Better Auth session access
- Central oRPC/Express error boundary
- Structured logger with secret redaction
- Health and readiness distinction
- Initial OpenTelemetry exporter configuration with safe local defaults
- `@effect/vitest` test foundation
- Compatibility note explaining why Better Auth native responses are not enveloped

### Automated success criteria

- Success response contains `ok: true`, non-null typed `data`, null `error`, and a UI-safe `message`.
- Failure response contains `ok: false`, null `data`, typed `error`, and a UI-safe `message`.
- No-payload success operations still return an explicit typed result object.
- Consumers can narrow `ApiResponse<T>` by `ok` without assertions.
- Every error code is accepted by the centralized runtime schema and maps deterministically to an HTTP status.
- Unknown/ad hoc error codes cannot be encoded as valid application responses.
- Application logic never branches on human-readable message text.
- Validation failures preserve safe field-level details.
- Unknown thrown values become sanitized internal errors.
- Defects are logged with internal cause information but do not leak stack, SQL, secrets, or raw cause to clients.
- Interrupt/cancellation is not mislabeled as a business error.
- Every application response includes a request ID header.
- Error responses include the same request ID in the error object.
- A valid inbound request ID is propagated; malformed or oversized IDs are replaced.
- Trace context is continued when valid and safely ignored when invalid.
- Named Effect operations create expected spans.
- Logs include request ID, trace ID where available, operation, outcome, and duration.
- Authorization headers, cookies, passwords, tokens, database URLs, and content bodies are redacted.
- Metrics record request count, latency, status family, and unhandled defects without unbounded-cardinality labels.
- Database rejection is translated into a typed infrastructure error.
- Better Auth session lookup rejection is translated inside internal application context creation.
- Better Auth protocol responses retain native shape.
- Public and protected oRPC procedures still work through the ManagedRuntime boundary.
- Runtime Layer resources initialize once and shut down cleanly.
- Test Layers can replace database, auth, clock, logger, and telemetry services.
- Property tests verify `ok: true` always implies non-null `data`/null `error`, and `ok: false` always implies null `data`/non-null `error`.
- Property tests verify response decoding rejects contradictory states such as `ok: true` with an error.
- Contract snapshots cover every initial error code and response variant.

### Manual review

- Developer inspects a successful trace and a failed trace.
- Developer confirms logs are useful and contain no secrets.
- Developer reviews the Effect package versions and integration boundaries.

---

## Milestone 2 — Platform kernel: workspaces, projects, capabilities, and `main`

### Goal

Create the durable project boundary on which CMS and future capabilities depend.

### Deliverables

- Workspace domain
- Project domain
- Capability state with CMS enablement
- Internal `main` environment
- Stable branded IDs
- Ownership and membership foundation
- Audit-event foundation
- Project creation and listing UI/API

### Automated success criteria

- A new user can create a workspace.
- Workspace names reject empty, oversized, and invalid input.
- A workspace owner can create a project.
- Project creation atomically creates the `main` environment and required defaults.
- A project can enable CMS without becoming a permanent CMS project type.
- Duplicate project keys within a workspace are rejected; allowed duplicates across workspaces remain isolated.
- Users cannot list, read, update, or infer projects outside their workspace.
- Stable IDs are unique, immutable, non-sequential where required, and type-safe in application code.
- Project update cannot mutate stable identity.
- Archive behavior preserves related state.
- Capability updates reject unknown or invalid transitions.
- Concurrent project creation preserves uniqueness constraints.
- Audit events record actor, resource, action, request ID, and timestamp.
- Audit logs do not include secrets.
- List APIs use bounded cursor pagination.
- Database queries use expected indexes under representative data.
- All failures use the application envelope and typed Effect errors.

### Database gate

Likely migration name: `create_platform_kernel`.

### Manual review

- Developer creates, views, edits, and archives a project.
- Developer confirms future capabilities can fit without project conversion.

---

## Milestone 3 — Membership, roles, policies, and API credentials

### Goal

Provide secure project collaboration and authorization foundations before content exists.

### Deliverables

- Project invitations and memberships
- Initial roles
- Policy evaluation service
- Environment-aware management/delivery/preview credentials
- Credential issue, revoke, rotate, and audit flows
- Permission-denied UX

### Automated success criteria

- Owners can invite users; unauthorized roles cannot.
- Invitations are project-scoped, expire, and cannot be reused after acceptance.
- Accepting an invitation creates exactly one membership under retries/concurrency.
- Removing a member revokes project access without deleting audit history.
- Last-owner protections prevent orphaned workspaces/projects.
- Every initial role has explicit allow/deny tests for every initial action.
- Default-deny applies to unknown actions and missing policy context.
- Cross-project and cross-environment access is denied.
- Credential secrets are shown only at creation and stored safely.
- Revoked credentials stop working immediately within the documented cache window.
- Credential scopes cannot be escalated by changing request parameters.
- Preview credentials cannot perform management operations.
- Delivery credentials cannot read drafts.
- Credential names and metadata are auditable without logging secret material.
- Repeated invalid credential attempts are rate-limited and observable.
- Policy property tests verify deny-overrides behavior and tenant isolation.

### Database gate

Likely migration name: `add_memberships_policies_credentials`.

### Manual review

- Developer invites a second account and verifies role boundaries.
- Developer creates and revokes each credential family.

---

## Milestone 4 — Project locales and strict locale contracts

### Goal

Make localization a foundation rather than a later retrofit.

### Deliverables

- Required English locale
- Additional BCP 47 locale management
- Locale ordering and display names
- Locale-aware permission hooks
- Locale tabs foundation
- Strict locale API validation

### Automated success criteria

- Every project starts with enabled `en`.
- `en` cannot be removed or disabled.
- Valid locales such as `hi`, `gu`, and regional tags are normalized consistently.
- Invalid, duplicate, case-variant duplicate, and oversized locale identifiers are rejected.
- Locale order changes do not change locale identity.
- Disabling/removing a locale with drafts or publications requires explicit guarded behavior.
- Unauthorized users cannot change locale configuration.
- Locale-limited users cannot mutate other locales.
- Every content-oriented contract rejects a missing locale.
- Unsupported locales return the documented typed error.
- No API silently substitutes English.
- Locale tabs are keyboard accessible and preserve unsaved-state warnings.
- Locale configuration changes emit audit events.

### Database gate

Likely migration name: `add_project_locales`.

### Manual review

- Developer enables Hindi and Gujarati and verifies English/Hindi/Gujarati tabs.

---

## Milestone 5 — Versioned collection schema engine

### Goal

Let developers define stable content contracts with draft and published schema revisions.

### Deliverables

- Collections and collection keys
- Immutable field IDs, API keys, and display labels
- Draft schema revisions
- Validation and schema publication
- Breaking-change classifier
- Basic schema builder UI
- Published schema retrieval

### Automated success criteria

- Collection IDs and keys are unique in the correct scope.
- Field stable IDs survive label and API-compatible layout changes.
- Field API keys are unique and reject reserved/invalid names.
- Label changes do not alter API output keys.
- Draft schema edits do not alter the current published schema.
- Publishing creates an immutable schema revision.
- Adding optional fields is classified non-breaking.
- Required-field additions are classified potentially breaking.
- API-key rename, incompatible type change, and deletion are classified breaking.
- Breaking publication requires explicit developer acknowledgement.
- Concurrent schema edits detect revision conflicts instead of silently overwriting.
- Published revisions cannot be mutated or deleted while referenced.
- Collection and field authorization is enforced server-side.
- Schema publication emits an audit event and transactional outbox record.
- Property tests exercise arbitrary valid/invalid field definitions and change classification.
- Schema retrieval is stable and deterministic for code generation.

### Database gate

Likely migration name: `create_versioned_collection_schemas`.

### Manual review

- Developer builds and publishes a representative collection.
- Developer reviews breaking-change warnings for rename, type change, and deletion.

---

## Milestone 6 — Field system, structured rich text, external assets, and editor layout

### Goal

Implement the initial field vocabulary and form metadata without coupling content to a frontend framework.

### Deliverables

- Initial field types from the PRD, including exact decimal and money
- Field-level validation engine
- Structured rich-text document schema
- External asset reference schema
- Object/list nesting limits
- Entry-reference configuration
- Editor groups, ordering, help text, and role visibility
- Visual field-tree inspector plus versioned schema JSON and sample-JSON inference authoring
- Atomic complete-tree authoring save with precise validation details
- Generated form component registry

### Automated success criteria

- Each field type accepts valid values and rejects wrong primitive/structural values.
- Required, default, min/max, length, regex, enum, URL, email, and slug rules behave correctly at boundaries.
- Numeric boundaries cover safe integers, approximate floating-point values, exact canonical decimals, negatives, zero, overflow, non-finite input, precision, and scale.
- Money validates exact amounts, allowed ISO 4217 currencies, currency minor units, and negative-value policy without floating-point conversion or silent rounding.
- Date/time behavior is timezone-explicit and rejects invalid calendar values.
- URL validation rejects unsafe protocols and malformed URLs.
- External asset accepts supported kinds and optional metadata without fetching the URL.
- Rich-text decoder rejects unknown nodes, invalid marks, malformed trees, excessive depth, and excessive size.
- Rich text cannot inject executable HTML as canonical content.
- Objects and lists respect configured item, depth, and serialized-size limits.
- Invalid recursive or cyclic object/list definitions are rejected deterministically.
- Relaxing validation and adding enum options are classified non-breaking; tightening validation is classified potentially breaking; removing enum options is classified breaking.
- References enforce configured target collections.
- Localized/shared atomic fields and mixed object localization are represented correctly; list subtrees remain atomic and arrays are never merged across locale partitions.
- Editor layout cannot reference missing fields or expose protected fields to restricted roles.
- Layout changes do not alter schema API output.
- Generated fields have accessible labels, descriptions, and error associations.
- Visual and schema-JSON views synchronize through one bounded local authoring document; sample inference never persists or transmits sample values.
- Complete-tree save is atomic, optimistic-versioned, stable-ID preserving, reparent-safe, audited, and leaves no partial writes after validation failure.
- Duplicate sibling API keys and authoritative server issues produce actionable path-specific accessible feedback.
- Property tests cover rich-text trees, nested objects/lists, mixed localization, exact decimals, money, slugs, and external assets.

### Manual review

- Developer reviews visual/JSON synchronization, sample inference, every type setting, duplicate-key feedback, save/discard, and unsaved-navigation behavior.
- Developer and client accounts inspect the same generated form and verify role-aware differences.
- Developer tests keyboard and screen-reader basics for all form controls.

---

## Milestone 7 — Entries, multilingual drafts, and revision history

**Status:** Developer approved and committed as `60bd96f` on 2026-08-09.

### Goal

Allow editors to create one logical entry with shared values and independent locale drafts.

### Deliverables

- Stable entries with user-controlled CMS-only names
- Shared draft values
- Per-locale draft revisions
- Draft save and optimistic concurrency
- Validation feedback
- Revision listing and restore
- Autosave-ready save semantics
- Collection entry list UI

### Automated success criteria

- Creating an entry produces one stable identity and bounded management name across all locales.
- Renaming uses optimistic concurrency, is audited, and never changes content revisions or Delivery values.
- Localized values remain isolated by locale.
- Shared fields are authored once and appear consistently in each locale editor.
- Saving Hindi never overwrites English or Gujarati localized values.
- Draft saves never change Delivery API results.
- Draft validation returns field paths and locale context.
- Partial invalid drafts can be saved only according to the documented draft policy; publication remains strict.
- Optimistic concurrency rejects stale writes with recoverable conflict information.
- Retrying the same save does not create duplicate logical entries.
- Meaningful saves create immutable revision history.
- No-op saves do not create noisy revisions under the chosen revision policy.
- Restore creates a new revision and does not erase history.
- Unauthorized fields are ignored only if contractually safe or rejected explicitly; they are never silently persisted.
- Field-level read/edit permissions are enforced in API and UI.
- Large entry lists use cursor pagination and stable sorting.
- Search/filter behavior cannot cross collection/project boundaries.
- Revision authorship and timestamps are auditable.
- Concurrent edits to different locales do not conflict unnecessarily.
- Concurrent shared-field edits follow explicit conflict rules.

### Database gate

Likely migration name: `create_entries_and_locale_revisions`.

### Manual review

- Client creates English, Hindi, and Gujarati drafts and restores a prior revision.

---

## Milestone 8 — Independent locale publication and immutable snapshots

**Status:** Developer approved and committed as `ad3cd5e` on 2026-08-09.

### Goal

Implement the central CMS guarantee: each locale publishes independently and snapshots current shared values.

### Deliverables

- Per-locale publish and unpublish
- Immutable publication records
- Delivery snapshot compiler
- Per-locale published pointers
- Publication sequence
- Shared-value stale indicators
- Exact-locale reference-target validation and actionable publication guidance
- Explicit publication transaction isolation and concurrency semantics
- Fixture-validated snapshot bounds and query-plan-validated current-publication indexing
- Atomic audit and outbox writes

### Automated success criteria

- Publishing English does not publish Hindi or Gujarati.
- Publishing an unpublished locale creates only that locale's published pointer.
- A locale publication captures current localized values and current shared values.
- Editing a shared field does not mutate any existing publication.
- After a shared edit, publishing Hindi updates Hindi's snapshot while English retains its previous shared value.
- UI/API clearly report which locale drafts differ from their publication.
- Publication rejects missing required localized values.
- Publication rejects invalid shared values.
- Every present reference requires a current target publication in the exact source locale, including optional references and shared-only targets; no locale fallback or automatic target publication occurs.
- Authorized editors receive actionable exact-locale target-publication guidance without exposing hidden/inaccessible targets.
- Publication uses the selected published schema revision.
- Publication, snapshot, pointer, audit event, and outbox event commit atomically.
- Injected failure at every transaction step leaves no partial publication state.
- Concurrent publishes serialize or conflict safely and produce monotonic sequences.
- Publish/unpublish explicitly use PostgreSQL `READ COMMITTED`; one grouped target-resolution statement passes before/after-unpublish concurrency tests.
- Retried idempotent publish requests do not create unintended duplicate current state.
- Unpublish affects only the requested locale.
- Unpublish preserves drafts and publication history.
- Archived/deleted entries cannot publish without explicit valid recovery.
- Immutable publication records and snapshots reject mutation attempts.
- Publication duration, validation failure, and snapshot size metrics are emitted.
- Realistic large-content fixtures keep at least 25% headroom under the provisional 1 MiB document-plus-manifest profile before Drizzle schema work.
- Representative query plans justify one locale-leading partial current-publication index; a second is added only with evidence.

### Database gate

Likely migration name: `add_locale_publications_and_delivery_snapshots`.

### Manual review

- Developer verifies shared-field snapshots differ intentionally across independently published locales.
- Developer confirms a shared-only reference target still requires an exact-locale publication and reviews the actionable UI guidance.
- Developer reviews realistic snapshot-size measurements and confirms the 25% headroom gate before schema work.
- Developer publishes and unpublishes all three locales in different orders.

---

## Milestone 9 — Production Delivery API

### Goal

Serve published locale snapshots through a fast, predictable, public developer API.

### Deliverables

- Versioned Delivery API
- Mandatory locale parameter
- ID/slug/unique-key lookup
- Cursor list endpoints
- Filtering and sorting allowlists
- Public and token-protected collections
- ETag, Last-Modified, and immutable publication endpoints
- Bounded reference expansion
- Delivery rate limits and metrics
- Dedicated Delivery-only OpenAPI JSON and interactive reference
- Production-safe separation from internal management API documentation

### Automated success criteria

- Every content request without locale fails with the documented error.
- Unsupported or unpublished locales return strict unavailable/not-found behavior.
- Draft values never appear in latest or immutable delivery responses.
- Latest returns the current publication for exactly the requested locale.
- Immutable publication URLs never change after later publication.
- ID, slug, and configured unique-key lookup obey uniqueness and locale boundaries.
- Cursor pagination has no duplicate or skipped records under stable ordering.
- Invalid, expired, tampered, cross-collection, and oversized cursors fail safely.
- Filtering and sorting reject unsupported fields/operators.
- Query limits reject excessive page size, expansion depth, nested filters, and response size.
- Reference expansion terminates cycles and respects depth/item limits.
- ETag returns 304 for unchanged content and changes after relevant publication.
- Last-Modified and cache headers match endpoint mutability.
- Public collections work anonymously; protected collections reject missing/invalid scope.
- Anonymous delivery does not perform unnecessary per-user authorization checks.
- Rate limiting returns stable errors and retry guidance.
- SQL query plans for representative list/lookups use intended indexes.
- Load tests meet the developer-approved baseline for latency, throughput, error rate, and connection use.
- Cache and database metrics avoid project-name/entry-ID cardinality explosions.
- Delivery OpenAPI covers all four GET/HEAD paths, OPTIONS, strict locale/query bounds, success/failure envelopes, protocol headers, authentication, examples, and stale-cursor recovery.
- Public Delivery documentation contains no dashboard oRPC, Better Auth, workspace, draft, membership, credential-management, or operator contracts.
- The complete management API reference is disabled by default and cannot be enabled in production.

### Manual review

- Developer integrates a small external script using latest and immutable endpoints.
- Developer verifies cache revalidation behavior.

---

## Milestone 10 — Preview API and preview UX

### Goal

Expose drafts securely without weakening production isolation.

### Deliverables

- Scoped Preview API
- Explicit locale and revision selection
- Preview credentials
- Preview links/session handoff
- Isolated/no-store cache policy
- Draft preview UI entrypoint

### Automated success criteria

- Anonymous preview is denied.
- Delivery credentials cannot access preview.
- Preview credentials cannot perform management mutations.
- Preview requires explicit project, environment, locale, entry, and allowed revision context.
- Cross-project, cross-environment, cross-collection, and cross-locale access is denied.
- Revoked/expired credentials stop preview access.
- Preview can retrieve current draft and explicitly permitted prior revisions.
- Preview never changes publication state.
- Preview responses use isolated/no-store cache behavior.
- Preview links do not leak secrets in logs, referrers, or analytics.
- Rate limits and audit events cover preview access.
- Future visual-preview context can be added without changing entry identity.

### Manual review

- Developer previews an unpublished Gujarati draft while production remains unavailable.

---

## Milestone 11 — Publication events, webhooks, retries, and invalidation

### Goal

Reliably notify external frontends exactly what publication state changed.

### Deliverables

- Event envelope
- Outbox worker
- Webhook endpoint management
- Signed delivery and verification helper
- Retry schedule and dead-letter state
- Delivery logs and manual replay
- System and semantic invalidation tags
- Initial manual route mappings

### Automated success criteria

- Draft saves produce no production invalidation event.
- Publish/unpublish/schema publication creates exactly one logical outbox event in the transaction.
- Worker crashes before/after send do not lose events.
- At-least-once delivery may duplicate; event IDs remain stable for idempotency.
- Signatures verify valid payloads and reject tampered bodies, stale timestamps, wrong secrets, and replay attempts.
- Secret rotation supports documented overlap without indefinite acceptance.
- Retry uses bounded exponential backoff with jitter.
- 2xx succeeds; retryable 5xx/network/timeouts retry; documented permanent 4xx behavior is applied.
- Slow destinations time out without blocking unrelated endpoints.
- Disabled endpoints receive no deliveries.
- Event-type and environment subscriptions are respected.
- Manual replay is authorized, audited, and preserves the original event identity with new attempt metadata.
- Dead-letter state is visible after retries exhaust.
- Payload/log views mask secrets and sensitive headers.
- Locale, changed fields, publication sequence, schema revision, and stable invalidation tags are correct.
- Updating one locale never claims other locales changed.
- Worker concurrency preserves per-project publication sequence information.
- Metrics cover queue age, attempt latency, success, retries, dead letters, and replay.

### Database gate

Likely migration name: `add_webhook_delivery_system`.

### Manual review

- Developer verifies a signature, forces retries, inspects logs, and manually replays an event.

---

## Milestone 12 — Developer portal and generated tooling

### Goal

Make public integrations discoverable and strongly typed while detecting contract drift without exposing internal application APIs.

### Deliverables

- Public developer documentation portal (target: `developers.<product-domain>`)
- Explicit allowlisted public contract registry for Delivery, Preview, and webhook specifications
- Versioned public OpenAPI/JSON Schema publication, guides, quickstarts, examples, changelog, and deprecation policy
- CLI login and project linking
- Schema pull/check/generate
- TypeScript types
- Effect Schema runtime validators
- Typed Delivery/Preview client
- Independent family-first API majors (`delivery/v1`, `preview/v1`) with a documented compatibility, deprecation, and parallel-major migration policy
- SemVer SDK releases with explicit supported API-family majors; date-based behavioral versioning remains deferred until demonstrated need
- JSON Schema and OpenAPI output
- Schema lock
- Webhook verification and invalidation helpers
- Framework-independent examples

### Automated success criteria

- The developer portal publishes only explicitly allowlisted public API families and versions.
- Dashboard oRPC, Better Auth, workspace, authoring, membership, credential-management, and operator contracts never appear in public specifications, navigation, search, or generated clients.
- Published OpenAPI/JSON Schema artifacts match their source contract snapshots and remain byte-stable for unchanged versions.
- Delivery, Preview, and webhook guides use their canonical public API host and contain no tenant data or credential material.
- Generated names are deterministic and valid TypeScript for allowed API keys.
- Optional, nullable, localized, object, list, reference, asset, and rich-text fields generate correctly.
- Generated Effect Schemas decode valid API responses and reject malformed responses.
- Client requires locale for every content operation at compile time and runtime.
- Schema lock records project, environment, published schema revision, and generation metadata.
- Schema check detects stale generated artifacts.
- Content-only publication does not report type drift.
- Breaking schema changes produce actionable diagnostics.
- Generation is atomic and does not leave partial files on failure.
- Repeated generation with unchanged schema is byte-stable except explicitly variable metadata.
- Credentials are never written into generated source or logs.
- Client preserves response envelope and typed error information.
- Delivery and Preview evolve independently; generated clients target explicit family majors without implying one global API version.
- Contract-diff checks reject breaking changes within a released API major while allowing documented additive changes.
- SDK package versions follow SemVer independently of HTTP API majors and publish their supported family/version matrix.
- A future API major can run in parallel with its predecessor and includes migration guidance, deprecation notice, and a sunset date; first-launch tooling does not implement date-based request/account behavior versions.
- Pagination helpers handle empty, final, invalid, and repeated cursors.
- Webhook verifier rejects replay and tampering cases.
- Generated package examples compile in a clean fixture project.

### Manual review

- Developer navigates the public portal and integrates a clean example app using only public documentation and generated tooling.

---

## Milestone 13 — Client handover and editorial safety

### Goal

Make the CMS safe and comfortable for non-technical clients.

### Deliverables

- Client-focused navigation
- Collection/field/locale restrictions
- Review-before-publish option
- Improved revision comparison and restore
- Translation completeness and publication indicators
- Accessible validation summary
- Activity view and direct handover links

### Automated success criteria

- Client roles never see API keys, credentials, internal IDs, schema migration controls, or protected fields.
- Hidden fields are absent from payloads, not merely visually hidden.
- Read-only fields cannot be changed through direct API requests.
- Collection and locale restrictions apply to list counts, search results, and direct URLs.
- Users without publish permission can save drafts and submit review but cannot publish via UI or API.
- Review rejection/approval cannot bypass locale-specific permissions.
- Revision comparison accurately reports shared and localized changes.
- Translation completion updates after required-field changes.
- Unsaved navigation, network interruption, duplicate submission, and retry behavior preserve user work.
- Form errors focus/announce accessibly and remain associated with fields.
- Locale tabs are keyboard navigable and expose status text beyond color.
- Large forms and collection lists meet developer-approved responsiveness targets.
- Handover links enforce authentication and project membership.
- Activity entries are complete, ordered, permission-filtered, and safe.

### Manual review

- Developer hands a project to a non-technical test user and observes the complete edit/review/publish flow.

---

## Milestone 14 — Production hardening and operational readiness

### Goal

Prove the CMS can operate production websites safely and predictably.

### Deliverables

- Backup and restore process
- Import/export contracts
- Operational dashboards and alerts
- Rate-limit policy
- Delivery/publication/webhook SLOs
- Cache strategy and failure modes
- Cross-system data-retention and cleanup policy for command receipts, audits, outbox records, and immutable history
- Security review and dependency audit
- Load, soak, concurrency, and recovery testing
- Runbooks for incidents and rollback
- Production host/ingress separation for marketing, dashboard, public APIs, developer documentation, and operator-only surfaces
- Explicit internal management-reference and operator-endpoint access policy
- Worker-specific network egress policy that permits only required DNS and public HTTPS flows while denying internal, private, link-local, loopback, and cloud-metadata destinations
- Cloud metadata hardening appropriate to the selected provider, including IMDSv2-only or metadata-service disablement where applicable

### Automated success criteria

- Backup restore reproduces schemas, drafts, publications, credentials metadata, events, and audit history according to policy.
- Restore verification detects corrupted/incomplete backups.
- Retention policy explicitly covers M5 schema-publication provenance, M7 draft-command receipts, M8 publication-command receipts, audits, outbox records, and immutable history without silently weakening idempotency guarantees.
- Any finite command-receipt lifetime defines the supported retry window, deterministic expired-command behavior, replay-preventing tombstones or equivalent authority, bounded cleanup, and backup/privacy consequences before deletion is enabled.
- Export/import round trips preserve stable contracts or report intentional remapping.
- Tenant-isolation tests cover every table/query/service path.
- Authorization matrix tests cover every protected endpoint and role.
- Fuzz/property tests cover schemas, content values, rich text, cursors, webhook payloads, and response encoding.
- Load tests cover authoring, publication bursts, delivery reads, and webhook backlog simultaneously.
- Soak tests show bounded memory, connections, fibers, queues, and log volume.
- Database failover/restart produces safe retries or clear non-retryable errors without partial publication.
- Cache outage falls back according to documented behavior.
- Telemetry exporter outage does not take down request processing or create unbounded buffering.
- Webhook destination failure cannot exhaust global worker capacity.
- Rate limits protect auth, management, preview, and delivery independently.
- Security tests cover injection, XSS/rich text, CSRF, CORS, SSRF boundaries, credential leakage, replay, enumeration, and privilege escalation.
- Production-topology egress tests prove the webhook worker cannot reach loopback, private, link-local, carrier-grade NAT, internal-service, or cloud-metadata targets even when a controlled test bypasses the application validator; required DNS and public TCP/443 delivery remain available.
- Cloud metadata configuration rejects legacy unauthenticated access and is verified against the selected provider's supported hardening mode.
- Dependency and container vulnerability checks meet the approved threshold.
- PII/secret scanning finds no prohibited data in logs, traces, metrics, or error payloads.
- Alert simulations prove actionable signals for elevated errors, latency, queue age, dead letters, DB exhaustion, and publication failures.
- Rollback and recovery procedures are exercised, timed, and documented.
- The marketing host exposes no application or API routes; the application host exposes only the dashboard plus authenticated auth/RPC boundaries; the public API host exposes only versioned allowlisted developer APIs; and the developer host serves only allowlisted public documentation/specifications.
- The management OpenAPI reference, metrics, detailed dependency diagnostics, and operator endpoints are unreachable from public production hosts.
- Automated host-header and route-probing tests fail on any cross-surface exposure, including redirects, CORS/preflight, alternate methods, and common documentation paths.

### Manual review

- Developer performs a production-readiness review and explicitly approves release.

---

## Milestone 15 — Visual-builder readiness contracts

### Goal

Freeze the CMS contracts required for the next product capability without implementing the visual builder.

### Deliverables

- CMS binding contract using stable IDs
- Data-source provider boundary
- Dependency-manifest contract
- Route/semantic invalidation registration
- Renderer-facing locale/publication contract
- Compatibility and versioning policy

### Automated success criteria

- Bindings survive display-label changes.
- Non-breaking schema changes preserve existing bindings.
- Breaking schema changes report affected bindings before publication.
- Binding resolution respects project, environment, locale, permissions, and published schema revision.
- Dependency manifests reject unknown/cross-project resources.
- Route invalidation derives only affected routes plus documented shared dependencies.
- Existing Delivery API integrations continue unchanged after visual capability enablement.
- Existing entries, publications, members, policies, and locales require no migration or copy.
- Contract fixtures validate compatibility across supported schema revisions.

### Manual review

- Developer reviews a simulated visual-site binding to existing CMS content and confirms no migration is required.
