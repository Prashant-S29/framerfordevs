# CMS Product Requirements

**Status:** Source of truth  
**Product:** Framer for Devs  
**Scope:** CMS capability  
**Last updated:** 2026-07-28

## 1. Purpose

This document defines what the CMS layer is, how it behaves, and the contracts future development must preserve.

The CMS is the content foundation of Framer for Devs. It lets developers define structured content once, gives clients a safe generated editing experience, and delivers validated published content to developer-owned frontends. Future visual sites, renderers, hosting, and integrations must build on the same projects, schemas, stable IDs, permissions, locales, entries, and publications without content migration.

Implementation planning lives in `../milestone.md`. Current execution state lives in `../progress.md`. Mandatory engineering rules are indexed in `../rules/index.md`.

## 2. Product statement

```text
Developer-defined schema
→ Generated client editing experience
→ Localized drafts and validation
→ Independent per-locale publication
→ Read-optimized published snapshots
→ Stable APIs, tooling, and publication events
```

The CMS is not only a database UI. It is the project's schema, authoring, localization, permissions, revision, publication, delivery, developer-tooling, and update-coordination system.

## 3. Goals

The CMS must:

- Make structured CMS setup fast and predictable for developers.
- Generate polished client forms from developer-defined schemas.
- Keep draft authoring completely separate from production delivery.
- Support localization from the beginning, with English (`en`) required by default.
- Publish and unpublish each locale independently.
- Serve low-latency, cacheable, predictable JSON.
- Give developers stable IDs, stable API keys, typed contracts, preview access, and reliable update events.
- Make permissions safe for client handover without exposing implementation controls.
- Be highly observable, secure, testable, and reliable.
- Preserve a common project model so future capabilities compose without migration.
- Preserve developer ownership of rendering, caching, deployment, and infrastructure.

## 4. Non-goals for the initial CMS

- Visual page building
- Managed website hosting
- File uploads, asset storage, transformation, or a media library
- Arbitrary external data-source integrations
- Scheduled publishing
- Plugin marketplace
- Advanced analytics
- Framework-owned rendering
- A separate physical database table for every customer collection
- Multiple user-visible environments in the first release

External asset links are supported from the start; managed assets can be added later without changing the conceptual field contract.

## 5. Product principles

1. A project is a common container, never a permanent project type.
2. Capabilities are enabled progressively.
3. CMS content exists independently of visual sites.
4. Content and presentation remain separate.
5. Stable internal IDs are immutable and distinct from API keys and labels.
6. Schemas and content have separate draft and publication lifecycles.
7. Drafts never leak through the public Delivery API.
8. Every locale has an independent draft and publication state.
9. Every Delivery API content query requires an explicit locale and never silently falls back.
10. Published content is compiled into read-optimized snapshots.
11. Publication records and publication events are committed atomically.
12. Expensive validation and dependency work happens at publication time where possible.
13. Developer UX and client UX are equally important.
14. The platform remains backend-, renderer-, and hosting-agnostic.
15. Architecture and implementation decisions prioritize, in order of relevance: product-goal alignment, correctness, security, reliability, performance, UX, DX, observability, and maintainability.

## 6. Users

### Workspace owner

Owns workspace governance, projects, membership, and future billing.

### Developer

Creates schemas, field contracts, locales, permissions, credentials, webhooks, and frontend integrations.

### Content administrator

Manages entries, translations, revisions, publication, and content operations.

### Editor or client editor

Edits permitted collections, fields, and locales through generated forms without seeing implementation controls.

### Reviewer

Reviews drafts and can publish when granted permission. Review notes and advanced approval workflows may arrive after the core publication model.

### Read-only user

Can inspect permitted resources without mutation rights.

## 7. Common project model

```text
Workspace
└── Project
    ├── Capabilities
    ├── Members and policies
    ├── Environments
    ├── Locales
    ├── API credentials
    ├── Content
    │   ├── Collections
    │   ├── Schema revisions
    │   ├── Entries
    │   ├── Locale drafts
    │   ├── Revisions
    │   ├── Publications
    │   └── Delivery snapshots
    ├── Publication events
    ├── Webhooks
    ├── Audit events
    ├── Future sites
    └── Future deployments
```

The initial UI exposes one environment named `main`. Every environment-scoped resource and API contract includes an environment ID from the start so additional environments can be introduced without migration or contract drift.

## 8. Schema system

### 8.1 Collections

A collection defines a reusable content entity such as posts, authors, projects, testimonials, navigation, FAQs, or contact information.

A collection includes:

- Immutable collection ID
- Display name
- Stable developer-facing API key
- Description
- Field definitions
- Editor layout
- Localization settings
- Publication settings
- Permissions and tags
- Current draft schema revision
- Current published schema revision

### 8.2 Field identities

Every field has three distinct identities:

- **Stable ID:** immutable; used by references, dependencies, and future visual bindings.
- **API key:** used in JSON, generated types, and SDKs; unique within the collection.
- **Display label:** used in forms; editable without changing API contracts.

A display-label change is non-breaking. A published API-key change is breaking and requires an explicit migration strategy and acknowledgement.

### 8.3 Schema lifecycle

Schema changes use an explicit lifecycle from the beginning:

```text
Edit draft schema
→ Validate
→ Classify changes
→ Acknowledge breaking changes when present
→ Publish immutable schema revision
```

Published content remains tied to the schema revision against which it was validated. Schema changes never silently rewrite published snapshots.

Change classification includes:

| Change                         | Classification          |
| ------------------------------ | ----------------------- |
| Add optional field             | Non-breaking            |
| Rename display label           | Non-breaking            |
| Deprecate field                | Non-breaking transition |
| Add required field             | Potentially breaking    |
| Tighten validation             | Potentially breaking    |
| Rename API key                 | Breaking                |
| Change incompatible field type | Breaking                |
| Remove field or enum option    | Breaking                |

### 8.4 Initial field types

- Short text
- Long text
- Structured rich text
- Number
- Boolean
- Date
- Date and time
- Enum/select
- URL
- Email
- Slug
- JSON
- Object
- List
- Reference to another entry
- External asset reference

Fields may define required state, defaults, uniqueness, localization, bounds, patterns, allowed values, help text, placeholder, role visibility, role editability, search/filter/sort capability, deprecation, reference target, and list-item rules.

### 8.5 Rich text

Rich text uses validated structured document JSON as its canonical value. It must be renderer-independent, safe to process, extensible, and versioned. Generated HTML is never the source of truth.

### 8.6 External assets

The initial CMS stores links only and does not upload or process files.

An external asset is structured rather than a raw untyped string:

```json
{
  "source": "external",
  "url": "https://cdn.example.com/asset.pdf",
  "kind": "document",
  "title": "Company brochure",
  "alt": "Company brochure",
  "width": null,
  "height": null
}
```

Supported kinds may include image, video, audio, document, archive, and other. URL protocols are validated. The CMS does not promise remote availability and must not fetch arbitrary URLs without SSRF protections.

### 8.7 Editor layout

Editor layout is independent of the API schema. It controls field order, groups, tabs, sections, help text, sidebars, and role visibility. Layout changes do not alter Delivery API output.

## 9. Localization

### 9.1 Project locales

- English (`en`) is required and enabled by default.
- Developers can enable additional BCP 47 locale codes, such as `hi` and `gu`.
- Locale removal requires dependency and publication warnings.
- The first release has no implicit Delivery API fallback.

### 9.2 Localized and shared fields

Fields are either:

- **Localized:** one value per locale.
- **Shared:** authored once but captured into each locale publication snapshot.

A single entry owns all locale variants; translations are not unrelated entries.

### 9.3 Per-locale editing UX

Generated forms show one tab per enabled locale. Localized fields appear in locale tabs. Shared fields appear once in a clearly separated shared section.

Each locale tab exposes:

- Translation completeness
- Field validation issues
- Draft state
- Published state
- Pending changes
- Last published information

### 9.4 Per-locale publication

Each locale has independent draft, publish, unpublish, and revision state.

Publishing a locale snapshots:

- That locale's current localized values
- Current shared values
- Published schema revision
- Reference state
- Publication metadata

A later shared-field edit does not mutate any existing locale publication. It marks relevant locale drafts as changed. The new shared value reaches a locale only when that locale is published again.

### 9.5 Strict delivery

Every content request to the Delivery API must specify a locale. The API returns only that locale's published snapshot. An unpublished locale returns a documented unavailable/not-found response. Missing values are never silently mixed with English or another locale.

## 10. Entries, drafts, revisions, and publication

### 10.1 Entry identity

An entry is a stable identity containing:

- Entry ID
- Project, environment, and collection IDs
- Shared draft state
- Per-locale draft pointers
- Per-locale published pointers
- Creation/update metadata
- Archive/deletion state

Slugs and configured unique fields support human-friendly lookups, but stable IDs remain canonical internally.

### 10.2 Revisions

Meaningful saves create immutable revisions according to the revision policy. A revision records author, timestamp, schema revision, shared/localized values, and locale. Revisions are restorable without rewriting history.

### 10.3 Publish locale

Publishing one locale must atomically:

1. Authorize the action.
2. Validate localized and shared values against the selected published schema revision.
3. Validate required references and publication requirements.
4. Create an immutable locale publication.
5. Create the delivery-optimized snapshot.
6. Update that locale's current published pointer.
7. Record an audit event.
8. Store a publication event in the transactional outbox.
9. Mark relevant delivery caches for invalidation.
10. Commit all state together or commit nothing.

### 10.4 Unpublish locale

Unpublishing removes only the selected locale from latest delivery, preserves history and drafts, emits an unpublish event, and invalidates affected caches.

### 10.5 Archive and delete

Archive and soft delete are preferred. Permanent deletion requires authorization, explicit confirmation, dependency checks, and safe behavior for published or referenced entries.

## 11. API families

The platform keeps these concerns separate:

- **Management API:** schemas, entries, drafts, publication, members, credentials, and webhooks.
- **Preview API:** authenticated access to selected drafts/revisions.
- **Delivery API:** published snapshots only.
- **Schema API:** published schema metadata and developer tooling.
- **Webhook management API:** destinations, subscriptions, attempts, and replay.

Internal dashboard APIs may use oRPC. Public developer-facing contracts must remain portable, versioned HTTP/JSON APIs and must not require the dashboard runtime.

### 11.1 Application response envelope

All application-owned APIs use a discriminated response union:

```ts
type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

interface ApiErrorDetail {
  path?: string;
  code: string;
  message: string;
}

interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: ReadonlyArray<ApiErrorDetail>;
  retryable: boolean;
  requestId: string;
}

interface ApiSuccess<T> {
  ok: true;
  data: T;
  error: null;
  message: string;
}

interface ApiFailure {
  ok: false;
  data: null;
  error: ApiError;
  message: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
```

The listed codes are foundational examples, not the complete registry. Every new code must be added to one centralized, schema-backed literal registry and mapped to a documented HTTP status. Prefer string-literal codes derived from Effect Schema over TypeScript `enum`, because the same runtime schema must validate, document, and generate client types.

Rules:

- `ok` is the discriminant: consumers can narrow the full response without unsafe assertions.
- Success always has `ok: true`, populated `data`, and `error: null`.
- Failure always has `ok: false`, `data: null`, and a populated `error`.
- A successful operation that has no natural payload returns a small explicit result object instead of `null`.
- Top-level `message` is safe user-facing feedback suitable for direct UI display.
- `error.message` is a safe developer-readable explanation; consumers use `error.code` for program logic and localized UI copy.
- `error.details` carries bounded, structured field or domain issues when useful.
- `retryable` tells automated consumers whether retrying may succeed; it does not replace idempotency rules or retry limits.
- `requestId` correlates a failure with internal logs/traces and is also returned through response headers.
- No error field exposes secrets, SQL, stack traces, raw causes, or internal infrastructure.
- Standard HTTP status semantics remain authoritative; the envelope does not turn failures into HTTP 200 responses.
- Lists place pagination metadata inside their typed `data` payload.

Protocol-owned endpoints such as Better Auth retain their required native response format. They still receive centralized tracing, logging, request correlation, rate limiting, and safe boundary error handling.

## 12. Delivery API

Delivery responses include stable IDs, locale, publication revision/sequence, and predictable list metadata while excluding drafts and authoring-only metadata.

The API progressively supports:

- Lookup by stable ID
- Lookup by slug or configured unique field
- Cursor pagination
- Supported filtering and sorting
- Explicit bounded reference expansion
- Immutable publication lookup
- Conditional requests with ETag and Last-Modified
- Public and scoped-token delivery

Query limits bound page size, filters, sorting, expansion depth, response size, and execution time.

Latest endpoints are cacheable and invalidatable. Immutable publication endpoints are long-term cacheable and reproducible.

## 13. Preview API

Preview requires scoped credentials and explicit project, environment, locale, entry, and revision context. It never permits anonymous access, uses isolated cache behavior, and remains compatible with future visual preview.

## 14. Permissions and credentials

Better Auth establishes identity. CMS authorization decides whether that identity may perform an action on a resource.

Initial roles:

- Owner
- Developer
- Content administrator
- Editor
- Reviewer
- Client editor
- Read only

The authorization model must support project, environment, collection, entry, field, locale, action, and publication-state conditions even when the first UI exposes opinionated role presets.

Credential families are separate for management, delivery, preview, and webhook verification. Credentials are scoped, named, revocable, auditable, environment-aware, and secret material is displayed only when appropriate.

## 15. Publication events and update protocol

Production events are emitted for publication state changes, not ordinary draft saves.

Core events:

- `cms.entry.published`
- `cms.entry.unpublished`
- `cms.entry.deleted`
- `cms.schema.published`

Events contain a globally unique event ID, project/environment, locale, subject, timestamp, publication ID and sequence, schema revision, changed resource/field IDs, and invalidation tags. Routes are included where known.

System invalidation tags use stable IDs, including project, environment, collection, entry, field, and locale. Semantic tags and dependency manifests may add route-level precision.

Webhook delivery guarantees at-least-once delivery, not exactly-once. It requires signed payloads, timestamp verification, replay protection, exponential retry, idempotent consumers, delivery logs, manual replay, dead-letter status, secret rotation, and per-environment subscriptions.

## 16. Effect, error management, and observability

### 16.1 Effect policy

Application business logic uses stable Effect v3 as the default computational model:

```text
Effect<Success, TypedError, Requirements>
```

- Reusable operations use named `Effect.fn` where appropriate.
- Expected failures use typed tagged errors, preferably schema-backed when crossing boundaries.
- Services and infrastructure dependencies use Context/Layer patterns.
- Layers are composed once near runtime boundaries.
- Express, oRPC, Better Auth, and other Promise-based libraries are adapters at the edges.
- Foreign Promise/throwing APIs are wrapped with `Effect.tryPromise` or `Effect.try` and translated into typed errors.
- `Effect.run*` is restricted to true runtime/framework boundaries, preferably through a shared managed runtime.
- Defects and interrupts are distinct from expected domain failures.
- No raw third-party error becomes a public error contract.

Effect v4 and Drizzle's beta/RC native Effect driver are not adopted while their production stability or Better Auth compatibility is uncertain. A future upgrade requires an explicit decision record and compatibility tests.

### 16.2 Centralized error management

One error taxonomy maps domain and infrastructure failures to safe transport errors and HTTP status codes. Central boundary handlers cover expected errors, defects, and interrupted work. Unexpected defects are fully logged internally with correlation and returned externally as sanitized internal errors.

### 16.3 Observability

The platform uses vendor-neutral OpenTelemetry-compatible observability from the foundation:

- Request IDs and trace-context propagation
- Named spans for meaningful business operations
- Structured logs with project/environment/resource identifiers
- Metrics for request, database, publication, delivery, webhook, auth, cache, and worker behavior
- Error reporting correlated to request and trace IDs
- Health, readiness, and dependency checks
- Audit events for security- and content-sensitive actions

Logs, spans, and errors must not expose secrets, credentials, full content payloads, authorization headers, or sensitive personal information.

## 17. Performance and reliability requirements

- Read-heavy delivery is isolated conceptually from write-heavy authoring.
- Delivery serves precompiled snapshots rather than rebuilding authoring state per request.
- Common filters, foreign keys, publication pointers, locale, slug, and cursor paths are indexed.
- Database connections are pooled and observable.
- Queries avoid N+1 patterns and select only required fields.
- Publication uses atomic transactions and a transactional outbox.
- Cursor pagination is the scalable default.
- Reference expansion is explicitly bounded.
- ETags, Last-Modified, immutable URLs, and targeted invalidation minimize unnecessary work.
- Webhook retries are bounded, observable, and idempotent.
- Backups, restore verification, import/export, rate limits, and operational dashboards are required before production readiness.

## 18. Rendering and freshness contract

The CMS controls publication state, snapshots, and change signals; it does not claim control over an external frontend's rendering runtime.

- CSR frontends can refetch current published content and use conditional requests.
- SSR frontends can fetch per request or invalidate tagged caches.
- Incremental/static frontends can regenerate affected routes from invalidation tags or dependency manifests.
- Fully static frontends can trigger a configured build hook.
- Future framework adapters may translate the same framework-independent event into tag invalidation, path invalidation, regeneration, build hooks, or CDN purges.

Freshness guarantees must be documented by rendering mode. Updating one entry or locale must not invalidate unrelated routes unless a registered shared dependency requires it.

## 19. Developer experience

The platform ultimately generates:

- TypeScript types
- Effect Schema runtime validators
- Typed API clients
- JSON Schema
- OpenAPI documentation
- Project configuration
- Schema lock metadata

Expected CLI flow:

```text
login → link → schema pull → schema check → generate
```

Generated artifacts identify project, environment, locale contract, and schema revision. Tooling warns when generated contracts are stale. Content-only changes never require type regeneration; published schema changes may.

## 20. Client experience

Generated forms must provide:

- Clear labels, descriptions, placeholders, grouping, and required state
- Locale tabs and translation completion
- Shared-field separation
- Inline validation and accessible error summaries
- Save status and unsaved-change protection
- Clear draft, published, unpublished, and changed-since-publish states
- Revision history and restore
- Preview and permission-aware publish actions
- Large-collection browsing without exposing implementation details

## 21. Security requirements

- Strict workspace, project, and environment isolation
- Server-side authorization on every protected operation
- Scoped and revocable credentials
- CSRF and origin protection where relevant
- Rate limiting and abuse controls
- No draft leakage through public delivery
- Signed webhooks and replay protection
- Safe structured-rich-text handling
- URL validation and SSRF protection for any future remote fetch
- Secret rotation and masking
- Audit logs for sensitive actions
- No storage internals exposed through public APIs
- Secure defaults for public versus protected collections

## 22. Self-hosting and portability

Self-hosting is a deployment model, not a project type. Core design must avoid hard dependency on one proprietary hosting provider and support portable configuration, environment-based secrets, documented database operations, backup/export, replaceable cache and delivery infrastructure, replaceable email/webhook infrastructure, and explicit version compatibility.

Managed and self-hosted installations must preserve the same logical project, schema, content, publication, API, and event contracts even when operational components differ.

## 23. Future visual-layer compatibility

Enabling visual sites must not migrate or copy existing CMS content. Visual bindings reference stable IDs:

```json
{
  "source": "cms",
  "collectionId": "collection_projects",
  "fieldId": "field_project_title",
  "context": "currentItem"
}
```

The same stable resources, locales, permissions, publications, and events support future page dependency graphs and targeted route invalidation.

## 24. Product success measures

Track outcomes rather than vanity activity:

- Time from project creation to first published schema and first Delivery API request
- Time from client invitation to first successful locale draft/publication
- Validation and publication failure rates
- Delivery median and tail latency, cache hit rate, and error rate
- Publication-to-delivery and publication-to-webhook latency
- Webhook first-attempt/retry/dead-letter rates
- Percentage of publications carrying targeted invalidation data
- Generated-tooling adoption and stale-schema detection
- Active projects, client editors, locales, collections, and published entries
- CMS projects later enabling visual sites without migration

## 25. End-to-end product flow

```text
Developer creates project
→ `main` environment and `en` locale exist
→ Developer enables additional locales
→ Developer creates and publishes a versioned collection schema
→ Platform generates role-aware localized forms
→ Developer invites client
→ Client edits shared and localized fields
→ Client saves locale drafts
→ Authorized user previews and publishes a selected locale
→ CMS atomically creates publication, snapshot, audit record, and outbox event
→ Delivery API serves that locale's snapshot
→ Signed event invalidates affected frontend content
→ Future visual site binds to the same stable resources
```

## 26. Acceptance criteria

The CMS foundation is complete when:

- Projects can gain CMS and future capabilities without project conversion.
- `main` is environment-scoped internally and `en` is always available.
- Developers can version and publish schemas with stable IDs, API keys, and labels.
- Generated forms support localized and shared fields.
- Each locale drafts, publishes, and unpublishes independently.
- Shared fields are snapshotted independently into each locale publication.
- Every Delivery query requires locale and never silently falls back.
- Drafts never affect production delivery.
- Published snapshots are immutable, cacheable, and revision-addressable.
- Application APIs use the standard response envelope and typed centralized errors.
- Effect-based business logic, tracing, metrics, logs, and request correlation are consistently applied.
- Permissions restrict project, collection, field, action, environment, and locale access.
- Publication and event creation are atomic.
- Webhooks are signed, retryable, replayable, and observable.
- Generated types and runtime validators identify their schema revision.
- Existing CMS resources can later power a visual site without migration.
