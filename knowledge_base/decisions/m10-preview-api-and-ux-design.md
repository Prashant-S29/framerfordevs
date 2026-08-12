# Milestone 10 Preview API and preview UX design

**Status:** Approved — implementation authorized

**Date:** 2026-08-12

## Decision summary

Milestone 10 will expose persisted current drafts and explicitly selected compatible prior revision sources through a dedicated, authenticated, versioned Preview HTTP API without weakening Delivery isolation or publication authority.

The design uses:

- A dedicated `/api/preview/v1` Express boundary and Preview-only OpenAPI 3.1 document
- Existing environment-bound `preview` credentials with the fixed `preview.read` scope, tightened to an expiring-only server-enforced 30-day maximum
- Bearer authentication through the existing `CredentialAuthenticator`; no cookie, Better Auth session, Delivery credential, or management credential fallback on the public Preview API
- Exact project, environment, collection, entry, locale, schema, shared-source, and localized-source authority
- Separate current-draft and explicit-revision-source routes so historical context is never inferred ambiguously
- A permissive, schema-guided preview compiler that projects safe persisted drafts to API-key-shaped JSON, materializes defaults, and returns bounded validation issues without requiring publishability
- Stable structured rich text, exact decimal/money strings, inert external assets, and stable reference IDs with no HTML generation, remote fetch, or reference expansion
- Complete Preview isolation headers: `private, no-store`, no validators/304s, no credentialed CORS, and `Referrer-Policy: no-referrer`
- The central Redis/memory `RateLimitManager` extended with closed Preview policies
- One successful-access audit event for every public credential or dashboard-session Preview read
- Short explicit `REPEATABLE READ` transactions so schema, shared, locale, and audit authority are coherent
- A protected internal dashboard preview route that reuses the authenticated Better Auth session without putting any Preview credential in a URL, query key, browser storage, referrer, log, or analytics event
- A focused pure `PreviewDocumentEngine`, `PreviewRepository`, named Effect operations, shared Layers, and the existing `ManagedRuntime`
- No database schema change or migration for the approved M10 scope
- Contract, property, Effect Layer, PostgreSQL, HTTP, CORS, credential, authorization, concurrency, load, UI, accessibility, OpenAPI, redaction, and bundle coverage

This proposal does **not** create public anonymous share links or place long-lived `ffd_prev_...` credentials in links. A future externally shareable preview session requires a separate short-lived, single-use grant design and must not be approximated with a credential-bearing URL.

## Source hierarchy and discovery

This proposal follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every rule linked by `knowledge_base/rules/index.md`
4. The M10 goal, deliverables, automated criteria, and manual review
5. Approved M1–M9 decisions
6. The committed M9 credential, draft, revision, publication, Delivery, rate-limit, Express, runtime, OpenAPI, UI, and test implementations

Git was clean at discovery time. `main` and `origin/main` were both at `70ce4fd`; M9 implementation is committed at `8559aa4`.

A read-only live-database inventory on 2026-08-12 found one active non-expiring Preview credential. Aggregate inspection confirmed it is not the known M3 integration-test credential/request fixture; no key, digest, prefix, name, ID, or actor value was exposed. The developer separately approved the environment-wide/full-field Preview trust model only with an expiring-only server-enforced 30-day maximum, explicit authority warning, and dedicated acknowledgement. The noncompliant existing credential must be replaced and revoked through normal credential controls before Preview routes are enabled.

Materially relevant installed guidance was read and applied:

- Stable Effect v3 operations, typed errors, Layers, Schema, observability, SQL-boundary compatibility, and `@effect/vitest`
- Existing stable `effect@3.22.0` and `@effect/vitest@0.30.0` declarations and codebase patterns
- Drizzle transactions, scoped queries, relations, and parameterized access
- PostgreSQL composite/FK indexes, short transactions, consistent ordering, pooling, and `EXPLAIN (ANALYZE, BUFFERS)` verification
- Express route/middleware ordering, validation, CORS, and centralized errors
- Better Auth's existing human-session boundary
- Security threat modeling, bearer-token handling, least privilege, rate/resource limits, secret redaction, and non-enumeration
- TanStack Start/Router/Query authentication, validated URL state, route prefetching, complete query keys, and targeted invalidation
- shadcn Base UI project context, installed components, form/composition rules, and current component docs
- React 19 composition/performance guidance
- Current Web Interface Guidelines and accessibility requirements
- Portable Text's structured-data boundary; M10 passes the existing strict JSON profile and does not render trusted HTML
- Turborepo package ownership, workspace dependency, and package-task constraints

Relevant standards research confirms:

- RFC 6750 recommends bearer credentials in the `Authorization` header, TLS, scoped credentials, and never putting bearer tokens in page URLs.
- RFC 9111/MDN define `no-store` as prohibiting storage by private and shared caches.
- `Referrer-Policy: no-referrer` prevents a preview document URL from becoming a referrer.
- Wildcard CORS is compatible only with non-credentialed browser requests; `Authorization` must be explicitly allowed and triggers preflight.

Generic skill recommendations remain subordinate to repository decisions. M10 does not upgrade Effect, adopt Effect SQL, replace Drizzle, add Better Auth plugins, or move business logic into Express/TanStack framework handlers.

## Existing authority and implementation seams

M10 extends these committed seams rather than replacing them:

- `api_credential` already supports family `preview`, prefix `ffd_prev_`, environment binding, one-time secret disclosure, digest-only storage, expiration, rotation, revocation, and fixed `preview.read` scope.
- `CredentialAuthenticator` strictly parses credentials, checks current database lifecycle, compares the digest in constant time, applies family/scope/environment policy, rate-limits invalid attempts, and returns a typed `CredentialPrincipal`.
- `cms_entry` is the stable locale-neutral entry identity.
- `cms_entry_shared_draft` and `cms_entry_locale_draft` point to independent immutable current revisions.
- Missing heads are represented as version `0` and null revision identity.
- Shared and locale revisions store immutable stable-field-ID sparse fragments, schema revision identity, contract hash, sequence, author/time, and changed fields.
- Current draft reads already enforce exact enabled locale, project membership, field visibility, and shared authority.
- Revision list reads intentionally return metadata only; they do not expose raw values.
- Current entry authoring uses the current published schema revision.
- Draft values are bounded and structurally safe but may contain soft publishability issues.
- M8's strict publication compiler maps stable IDs to API keys and applies defaults, but rejects invalid content and exact-locale unpublished references.
- Delivery reads only immutable publication/snapshot/current-projection artifacts and never touch draft/revision tables.
- The public Delivery boundary already proves isolated wildcard non-credentialed CORS, bearer authentication, bodyless HEAD/OPTIONS behavior, rate-limit headers, exact response bytes, and dedicated public OpenAPI separation.
- The central `RateLimitManager` already provides closed policies, opaque HMAC identities, Redis-wide enforcement, bounded memory fallback, and degraded/recovered telemetry.
- The shared `ManagedRuntime` already owns repositories, credential services, rate limiting, telemetry, and graceful disposal.
- The authenticated entry editor already has exact URL locale state, current draft authority, revision histories, publication status, save-before-publish behavior, and unsaved-change guards.

## Scope

### Included

- Versioned public Preview HTTP API and dedicated tenant-neutral OpenAPI/reference
- Exact current persisted draft preview
- Explicit compatible prior shared/locale revision-source preview
- Existing Preview credential authentication and immediate lifecycle checks
- Full developer-facing draft field projection for valid Preview credentials
- Role-projected dashboard-session preview for authenticated project members
- Permissive bounded draft projection, default materialization, and validation feedback
- Strict explicit locale with no fallback or language negotiation
- Isolated no-store headers and Preview-specific CORS
- Preview global, credential, and dashboard-user rate limits
- Successful Preview access audits for credential and user subjects
- Preview operations, repository, compiler, Layers, runtime composition, telemetry, and centralized errors
- Dashboard preview route, current/revision source controls, production-separation status, and credential-free endpoint examples
- Complete automated coverage and a developer-approved local load baseline

### Deferred

- Anonymous Preview access
- Credential-bearing links or query parameters
- Public share links and externally redeemable browser preview sessions
- New short-lived grant, exchange, cookie, OTP, or magic-link tables
- Per-credential collection, entry, field, or locale allowlists
- Preview reference expansion or recursive draft graph traversal
- Preview list/search/filter/sort endpoints
- Draft mutation through Preview
- Publication, unpublication, restore, review, or schema mutation through Preview
- Rendering Portable Text to HTML or owning a frontend renderer
- Visual site/page/binding preview contexts beyond the versioned extension boundary
- Live collaboration, presence, streaming preview updates, or websocket subscriptions
- Scheduled preview expiration separate from the existing credential expiry
- Generated Preview clients and consolidated public portal navigation, owned by M12
- Production public-API host/ingress separation, owned by M14

## Core invariants

1. Preview is always authenticated; anonymous content Preview is impossible.
2. Every Preview content request carries explicit project, environment, collection, entry, and canonical locale context.
3. A current Preview uses persisted current shared and exact-locale draft heads plus the current published schema contract.
4. A historical Preview explicitly selects one immutable schema revision and both shared/localized source revisions or explicit version-0 absence.
5. Historical source authority is never inferred from timestamps, publication state, “nearest” revisions, another locale, or current heads.
6. A historical non-null source revision must belong to the exact entry/tenant/locale and the explicitly selected schema revision/contract.
7. Shared and localized fragments merge only through schema-approved mixed objects; lists remain atomic.
8. Preview defaults follow the selected schema contract and are materialized only in the response; no draft or revision is changed.
9. Soft-invalid persisted values may appear in Preview together with bounded validation issues; unsafe/non-storable values can never have reached persistence and remain hard failures if corruption is detected.
10. Preview never creates or changes drafts, heads, revisions, publications, snapshots, projections, generation state, caches, or outbox events.
11. Preview never reads Delivery current-value projections to construct draft content.
12. Delivery never reads Preview/draft state, and draft changes never affect Delivery responses.
13. Preview credentials authorize only `preview.read` within their persisted workspace/project/environment.
14. Delivery and management credentials are always invalid at the Preview boundary.
15. Public Preview credentials receive the complete selected content contract; editor field metadata is not a machine-integration ACL.
16. Dashboard user Preview remains role- and locale-projected and never reveals hidden fields to a member.
17. Every successful content Preview creates one immutable, content-free audit event.
18. Every Preview body and error is `no-store`; no ETag, Last-Modified, 304, shared cache, or service-worker persistence contract is offered.
19. Credential values never appear in URLs, query keys, logs, traces, metrics, audits, referrers, analytics, response bodies, examples, or persistent browser storage.
20. Preview response work is bounded by query length, source count, field/value limits, issue count, transaction timeout, and exact final response bytes.
21. Preview operations use the shared ManagedRuntime and typed Effect error channel; Express and TanStack remain adapters.
22. Stable entry, schema, field, locale, and revision identities remain reusable by a future visual-preview context without migration or identity replacement.

## Public Preview HTTP surface

Base path:

```text
/api/preview/v1/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}/entries/{entryId}
```

Content routes:

```text
GET|HEAD /draft?locale={locale}
GET|HEAD /revisions/{schemaRevisionId}?locale={locale}&sharedRevision={none|uuid}&localizedRevision={none|uuid}
```

Documentation:

```text
GET /api/preview/v1/openapi.json
GET /api/preview/v1/docs
```

All content routes require `Authorization: Bearer ffd_prev_...`.

### URL authority

- `projectId` is globally stable.
- `environmentKey` is stable within the project and resolves to the credential's persisted environment ID.
- `collectionKey` is the developer-facing collection identity in that environment.
- `entryId` is the stable logical identity shared by all locales.
- `locale` is mandatory, canonicalized once, and resolved exactly to one enabled stable locale.
- `schemaRevisionId` is explicit for historical source projection.
- `sharedRevision` and `localizedRevision` are required singleton selectors on the historical route. The literal `none` explicitly selects version-0 absence; omission is invalid.

The route accepts no credential, token, workspace ID, actor, role, field allowlist, publication ID, or response-shape authority in query parameters.

### Why current and historical routes are separate

Shared and localized histories are independent. A localized revision does not identify which shared revision a caller intends to preview, and a shared revision does not identify an exact locale counterpart. Inferring the other partition from current heads, timestamps, command IDs, or nearest sequence would create a hybrid while presenting it as historical truth.

The historical route therefore names all immutable source authority explicitly. It produces a deterministic **selected revision-source combination** and does not claim the pair was once a persisted aggregate head state. The response exposes the selected source IDs/versions so this distinction remains visible.

### Query grammar

- Raw `URLSearchParams` order is inspected directly.
- Query strings are capped at 4 KiB before domain/database work.
- Duplicate singleton parameters fail.
- Unknown parameters fail.
- Empty selectors fail.
- Current route accepts only `locale`.
- Historical route accepts exactly `locale`, `sharedRevision`, and `localizedRevision`.
- Authorization in query/body is never supported.
- `Accept-Language` is ignored and never appears in `Vary`.

## Preview response contract

Every body-bearing response uses the standard application envelope.

A Preview item has this renderer-neutral outer contract:

```json
{
  "id": "entry UUID",
  "collectionId": "collection UUID",
  "collection": "articles",
  "locale": "gu",
  "preview": {
    "version": 1,
    "source": "current",
    "schemaRevisionId": "schema revision UUID",
    "contractHash": "64-character hash",
    "sharedRevisionId": null,
    "sharedVersion": 0,
    "localizedRevisionId": "locale revision UUID",
    "localizedVersion": 3
  },
  "data": {},
  "validation": {
    "valid": false,
    "issues": [],
    "capped": false
  }
}
```

Rules:

- `preview.source` is `current` or `revision`.
- `data` is API-key-shaped JSON produced from selected immutable schema fields and stable-ID draft fragments.
- `validation` describes publishability of the selected data without changing HTTP success merely because a safe draft is incomplete.
- Issues are deterministic, path-aware, machine-coded, and capped at 50.
- Public credential Preview issues may identify selected schema field IDs and API paths because the credential is developer integration authority.
- Dashboard user Preview removes hidden values and coalesces hidden blocking issues without exposing hidden IDs/paths/messages.
- The response excludes workspace ID, project display metadata, environment ID, CMS-only entry name, actor IDs, author names/emails, command IDs/fingerprints, hashes of values, audit metadata, publication state, reference availability metadata beyond validation issues, editor layout, and credentials.
- Rich text remains validated `ffd-portable-text@1` JSON. M10 does not generate or trust HTML.
- Decimal and money amounts remain canonical strings.
- Date-times remain canonical instants.
- External assets remain inert structured HTTPS URL data; the server never fetches them.
- References remain stable target entry IDs. M10 performs no expansion and does not require a target publication.

### Current source behavior

The current route:

1. Resolves the current published schema revision.
2. Loads current shared head/revision or explicit version 0.
3. Loads current exact-locale head/revision or explicit version 0.
4. Applies the current schema to stable-ID values, preserving removed historical values internally but omitting them from output.
5. Merges mixed objects and atomic list boundaries using existing localization rules.
6. Applies configured defaults in the response without writing drafts.
7. Projects stable IDs to current API keys.
8. Returns all safe soft validation issues.

A collection without a current published schema returns `PUBLISHED_SCHEMA_REQUIRED`. Preview never uses the mutable schema draft.

### Historical source behavior

The historical route:

1. Loads the explicitly named immutable schema revision in exact tenant/collection scope.
2. Resolves each selector:
   - `none` becomes version 0 and empty sparse fragment.
   - UUID loads the exact immutable entry revision.
3. Requires a shared revision to belong to the exact entry and selected schema/contract.
4. Requires a localized revision to belong to the exact entry, selected locale, and selected schema/contract.
5. Rejects mixed-schema or mixed-contract source combinations as incompatible.
6. Compiles the explicit pair deterministically using the selected historical API keys/defaults/profile.

This supports reproducible old contracts without mutating or restoring history. It does not silently coerce values across schema contracts.

### Permissive preview compilation

The M8 publication compiler is strict and requires exact-locale current reference publications. Reusing it unchanged would make unpublished or incomplete drafts impossible to preview, contradicting M10.

M10 therefore introduces a separate pure preview compiler over shared low-level projection primitives:

- It performs the same structural document preflight, stable partition merge, localization ownership, API-key mapping, recursive defaulting, canonical value handling, and issue ordering.
- It treats database corruption, unsafe structure, partition collision, unknown dangerous keys, excessive depth/nodes/bytes, and impossible schema trees as typed failures.
- It preserves safe soft-invalid values in `data` and reports their issues.
- It does not resolve or pin publication references.
- It does not truncate, coerce, round, sanitize into a different value, or drop a known selected field merely to make the result valid.
- It omits only values absent from the selected schema contract or hidden by the dashboard user's role projection.

Shared projection primitives should be extracted narrowly from `publication-snapshot.ts` rather than copied into diverging implementations. This is an explicitly load-bearing M8/M9 modification, not incidental Preview work. Implementation first records the existing compiler/publication/Delivery baseline, then performs a behavior-neutral extraction as an isolated gate, proves every existing M8 fixture byte/hash and M9 Delivery result unchanged, and only then builds Preview behavior on the extracted primitives. Preview logic and publication refactoring must not land in the same unverified step.

## Authentication and authorization

### Public Preview credentials

A content request requires exactly one bearer credential:

```text
Authorization: Bearer ffd_prev_<credential-id>_<secret>
```

The boundary rejects a missing or malformed Authorization header before any resource lookup. It then extends the existing `CredentialAuthenticator` with a narrowly separated base-verification operation that validates key digest, current lifecycle, family, and required scope and returns the persisted `CredentialPrincipal` before route resources are resolved. The existing scope-bound `authenticate` method remains for Delivery compatibility and can compose the same base verification with its current target-scope policy.

Base verification receives:

- `expectedFamily: "preview"`
- `requiredScope: "preview.read"`
- Canonical network source only for invalid-attempt protection

After a valid principal exists, the Preview repository resolves the route's project/environment/collection and requires exact equality with the principal's persisted workspace/project/environment. This ordering prevents missing, malformed, or unknown credentials from probing whether a Preview resource exists.

Outcomes:

- Missing Authorization: `UNAUTHORIZED`
- Malformed/supplied wrong key: `CREDENTIAL_INVALID`
- Management/Delivery family: `CREDENTIAL_INVALID`
- Wrong scope/environment/project/workspace: `CREDENTIAL_INVALID`
- Expired/revoked/rotated key: `CREDENTIAL_INVALID`
- Valid Preview key: `CredentialPrincipal`

A `WWW-Authenticate: Bearer realm="preview"` header accompanies public 401 responses without exposing failure reason.

Preview credentials retain the M3 environment-wide trust model. One valid Preview credential may read any selected draft/revision in its persisted environment, subject to exact project/collection/entry/locale/revision predicates. This is an explicit developer integration trust boundary, not per-client delegation. Per-collection/entry credential grants remain deferred rather than being partially introduced only for M10.

The developer gave standalone approval to this trust model with these mandatory mitigations:

- Preview credentials are expiring-only; `expiresAt: null` is invalid for family `preview`.
- Preview expiry cannot exceed 30 days from issuance. The server enforces the boundary using its Clock; browser time is never authority.
- Preview base authentication also fails closed for a missing expiry or an originally issued lifetime over 30 days, so previously issued noncompliant credentials cannot bypass issuance policy.
- The issuance UI defaults Preview to 30 days or less and states that the credential can read every current/historical unpublished draft and every editor-hidden field in the selected environment.
- Preview issuance requires a dedicated schema-backed acknowledgement of that authority. This is separate from M3's existing acknowledgement for creating a generally non-expiring credential; the old acknowledgement is never reused as consent for draft access.
- Rotation preserves expiry only for a compliant credential. A noncompliant predecessor is replaced by issuing a compliant credential and revoking the predecessor through normal audited controls; rotation must not mint another non-expiring successor.

This tightens approved M3 issuance/authentication code and is treated as a load-bearing cross-milestone change with complete management/Delivery/Preview credential regression coverage. It requires no database schema change.

### Public machine field visibility

A Preview credential is issued only through owner/developer credential management and represents developer integration authority. It receives the complete selected schema contract, including fields hidden from editor roles. Field editor metadata remains an authoring UI restriction and cannot safely represent a machine-integration ACL.

No credential can use Preview to mutate, restore, publish, unpublish, configure Delivery, issue credentials, manage members, or create a Better Auth session.

### Dashboard user Preview

The internal dashboard Preview procedures require the existing Better Auth session and:

- Exact enabled locale resolution
- `content.read` for that exact locale
- Complete tenant scope
- Current role visibility projection
- Archived/CMS/collection/entry lifecycle checks

Known active members denied the locale/action receive `FORBIDDEN`; foreign/nonexistent scope remains non-enumerating. Hidden values are absent from the response, not merely hidden in React.

### Project and locale lifecycle

Both public and dashboard Preview require:

- Active project
- Enabled CMS capability
- Exact environment and collection
- Existing stable entry
- Enabled exact project locale

Disabled/removed locales and archived projects expose no current or historical Preview. Restoring the same stable locale/project state makes preserved history available again under normal authorization.

## Preview links and session handoff

### Approved M10 handoff

The dashboard adds a protected route such as:

```text
/projects/{projectId}/collections/{collectionId}/entries/{entryId}/preview
```

Its validated search state contains only non-secret preview authority:

- `locale`
- `source=current|revision`
- For revision source: schema/shared/localized revision selectors

The route is under the existing `_auth` layout. Better Auth's HttpOnly session cookie authenticates the dashboard RPC call. No Preview credential is created, copied, embedded, exchanged, or stored by this route.

The link is safe to copy between already authorized project members:

- An unauthenticated visitor is redirected to sign in.
- An authenticated unauthorized visitor receives normal non-enumerating/forbidden behavior.
- The URL contains stable resource/revision IDs but no bearer secret.
- The response sends `Referrer-Policy: no-referrer`.
- Preview values and URLs are excluded from analytics payloads by product code.

### Explicitly rejected M10 alternatives

- `?token=ffd_prev_...`
- `#token=ffd_prev_...`
- Embedding Preview credentials in iframe/page URLs
- Writing Preview credentials to localStorage, sessionStorage, query cache, route state, HTML, generated source, or clipboard endpoint examples
- Treating a Better Auth user session as public Preview API authentication
- Minting an unsigned/long-lived browser token without persisted revocation

URL fragments reduce HTTP/referrer leakage but remain browser-visible bearer material and can leak through scripts, extensions, screenshots, crash reports, and copied URLs. They are acceptable for the existing one-time invitation token flow, not for a long-lived environment-wide Preview credential.

### Future externally shareable preview sessions

If future visual sites require unauthenticated or external-recipient links, a separate approved design must use a short-lived, high-entropy, single-use, digest-only grant bound to explicit audience/project/environment/entry/locale/revision authority, with atomic redemption, revocation, expiry, rate limits, CSRF/origin behavior, and no credential in query parameters. M10 leaves a versioned `preview.version`/resource context extension point but does not create this security-sensitive capability prematurely.

## HTTP, CORS, and cache behavior

Preview middleware is mounted after request correlation/HTTP observation and before management-origin rejection, parallel to but separate from Delivery.

For `/api/preview/v1` content routes:

- Methods: `GET`, `HEAD`, `OPTIONS`
- `Access-Control-Allow-Origin: *`
- No `Access-Control-Allow-Credentials`
- Allowed request headers: `Authorization`, `Traceparent`, `X-Request-Id`
- Exposed response headers: `Cache-Control`, `X-Request-Id`, rate-limit headers, and `Retry-After`
- `OPTIONS` validates method/header allowlists and performs no content authentication/database query
- Cookies and Better Auth sessions are ignored
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`

Every content success/failure/HEAD response uses:

```text
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Expires: 0
```

Preview intentionally provides:

- No ETag
- No Last-Modified
- No conditional 304
- No public/private revalidation contract
- No cache tags or CDN purge dependency
- No service-worker persistence contract

`HEAD` performs the same scope, credential, rate-limit, source selection, projection, byte measurement, and audit behavior as `GET`, then sends no body. This prevents HEAD from becoming a cheaper authorization or existence oracle.

Documentation routes are tenant-neutral, contain no Preview values/credentials, and may use a short public cache policy like the Delivery specification.

The existing management/auth CORS remains exact-origin and credentialed. Delivery CORS, routes, cache behavior, credentials, and OpenAPI remain unchanged.

Production use requires TLS. The OpenAPI guide states that Preview credentials belong in server-side environment configuration where possible and must never be shipped in a public browser bundle.

## Resource, response, and database bounds

Hard source-controlled M10 bounds:

- Query string: 4 KiB
- Exactly one shared source and one localized source
- Field tree: existing maximum 100 nodes/depth 8
- Persisted partition: existing maximum 1 MiB each
- Validation issues: 50
- Canonical Preview response body: 2.5 MiB (`2,621,440` bytes)
- Database statement timeout: 750 ms
- Transaction idle timeout: 2 seconds
- No reference expansion
- No list endpoint or pagination

The compiler measures the exact canonical JSON body before transport. Oversized responses return `PREVIEW_RESPONSE_TOO_LARGE`; content is never truncated or partially returned.

The repository selects only required rows/columns. Current Preview uses bounded head/revision/schema-field lookups. Historical Preview uses primary-key revision lookups with complete tenant predicates. Field rows use the existing revision ordering indexes. No query scans all entries, parses publication snapshots, or introduces JSON GIN access.

## Transaction and audit semantics

### Coherent read transaction

Every successful Preview content read executes in one explicit short `REPEATABLE READ` transaction. The transaction is read-write only because it also inserts the required audit event.

The transaction:

1. Resolves/validates persisted tenant, project, CMS, environment, collection, entry, and exact locale authority.
2. Resolves user authorization when the subject is a dashboard user.
3. Selects current or explicit historical schema/source authority.
4. Loads bounded source fragments and schema fields.
5. Compiles the Preview candidate synchronously through the pure kernel.
6. Measures the exact bounded result.
7. Inserts one immutable audit event.
8. Commits before the response is sent.

`REPEATABLE READ` ensures shared and locale heads cannot be observed from different committed moments. Preview takes no content row locks and performs no network, Redis, telemetry export, URL fetch, or user interaction inside the transaction.

If the audit insert or any read/compile invariant fails, no content is returned. A concurrent save either appears wholly in the transaction snapshot or wholly after it; Preview never combines before/after partition reads accidentally.

Two simultaneous Preview reads insert independent audit rows and do not update content authority, so serialization failure is not an expected steady-state result. The adapter nevertheless recognizes PostgreSQL SQLSTATE `40001` explicitly and may retry the entire transaction once with bounded deterministic scheduling. A `40001` transaction is aborted, so its audit cannot have committed. Deadlocks, connection loss, unknown commit outcome, and generic driver/database failures are not blindly retried; they use the redacted retryable service failure path to avoid duplicate successful-access audits.

### Audit actions

- `cms.entry.preview.current.read`
- `cms.entry.preview.revision.read`

Audit resource is the stable entry ID. Actor type is `credential` for public API access and `user` for dashboard Preview. Existing audit scope includes workspace/project/environment/request/time.

Audits exclude:

- Content values
- Validation issues/messages
- Locale tags
- Collection/field API keys
- Revision/schema selectors
- Entry display name
- Credential key/prefix/digest
- Authorization/referrer/origin
- Query string
- Response size/hash/body

Unauthenticated/invalid/rate-limited/not-found attempts remain diagnostic security telemetry rather than immutable successful-access audits because no trusted completed access exists.

## Rate limiting

M10 extends the closed `RateLimitPolicy` registry; callers still cannot supply capacities or algorithms.

Proposed policies:

- `preview.global`: installation safety budget, 12,000 units/minute, burst 1,000
- `preview.credential`: valid Preview credential, 300 units/minute, burst 50
- `preview.user`: authenticated dashboard user Preview, 300 units/minute, burst 50

Every content Preview costs 1 unit. HEAD costs the same as GET. OPTIONS/docs do not consume content identity quotas; documentation remains covered by ordinary HTTP/infrastructure controls.

Public ordering:

1. Global Preview budget before tenant/content work
2. Authorization presence/shape check and base credential verification; invalid attempts use existing source-bound `credential.verification.invalid`
3. Preview credential identity budget
4. Repository route-scope resolution, principal-scope equality, content read, and audit transaction

Dashboard ordering:

1. Existing session authentication
2. Global Preview budget
3. User identity budget
4. Repository/audit transaction

Valid Preview credentials/users have no source bucket, preserving legitimate serverless/NAT behavior. Redis failure uses the existing bounded degraded-memory fallback and telemetry; no request bypasses limiting.

Public 429 responses use the stable envelope plus `Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset`.

These numeric budgets are proposed approval items and will be validated against the M10 load profile before handoff.

## Errors

M10 adds centralized schema-backed codes:

- `PREVIEW_QUERY_INVALID` → 400 for unknown/duplicate/malformed source selectors and unsupported query shape
- `PREVIEW_REVISION_INCOMPATIBLE` → 409 when selected revisions do not share the explicitly selected immutable schema/contract
- `PREVIEW_RESPONSE_TOO_LARGE` → 413 when exact Preview bytes exceed the M10 bound

M10 reuses:

- `VALIDATION_ERROR` for malformed route IDs and missing/invalid locale
- `UNAUTHORIZED`
- `CREDENTIAL_INVALID`
- `LOCALE_UNAVAILABLE`
- `NOT_FOUND`
- `FORBIDDEN` for dashboard user denial
- `PUBLISHED_SCHEMA_REQUIRED` for current Preview without a current contract
- `CMS_CAPABILITY_REQUIRED` where safe for known dashboard members; public foreign scope remains non-enumerating
- `RATE_LIMITED`
- Redacted `SERVICE_UNAVAILABLE` and `INTERNAL_ERROR`

Public Preview exposes a dedicated allowlisted Preview error schema/document, not every management error. No error echoes credentials, query strings, raw revision selectors beyond safe field names, content, values, SQL, stack traces, internal paths, or causes.

Soft content invalidity remains HTTP 200 with `validation.valid: false`; it is the selected safe draft, not a malformed request.

## Effect and package architecture

### Contracts

`packages/api/src/contracts/preview.ts` owns:

- Preview source selectors and metadata
- Preview item/data/validation contracts
- Public Preview error allowlist
- Management current/revision inputs
- Public OpenAPI component schemas

Effect Schema is canonical. Reusable named contracts use `Schema.Class`/tagged unions and branded existing IDs. External unknown input is decoded before business logic; no assertions or duplicated manual shapes are introduced.

### Pure kernel

`packages/api/src/lib/preview-document.ts` owns dependency-light deterministic work:

- Stable-ID fragment preflight
- Shared/localized merge
- Safe default materialization
- API-key projection
- Soft issue collection/order/capping
- Role projection for dashboard output
- Canonical byte measurement

It imports no Drizzle, Express, Better Auth, environment config, telemetry, runtime, or React. It reuses/extracts narrow field/entry/publication helpers without changing M8 hash behavior.

### Effect service

`PreviewDocumentEngine` wraps the pure kernel with named `Effect.fn` methods and schema-backed typed failures. It is replaceable through test Layers.

### Repository

`PreviewRepository` owns:

- Persisted tenant/scope/lifecycle resolution
- Exact locale resolution
- User policy checks
- Current/historical schema and source loading
- Explicit `REPEATABLE READ` transaction/timeouts
- Row decoding and corruption translation
- Successful access audit insertion
- No content mutation methods

Stable Drizzle remains Promise-native inside the adapter and is wrapped with `Effect.tryPromise`. Raw driver errors become redacted `DatabaseFailure` values.

### Operations

Named operations under `packages/api/src/operations/preview.ts` include:

- `getCredentialCurrentPreview`
- `getCredentialRevisionPreview`
- `getUserCurrentPreview`
- `getUserRevisionPreview`

The public boundary helpers under `operations/preview-public.ts` own only validated route input, base bearer authentication orchestration, and rate-limit orchestration. Persisted route scope is resolved and compared with the authenticated principal inside `PreviewRepository`; these helpers do not own SQL or compilation.

### Runtime

`PreviewDocumentEngine` and `PreviewRepository` Layers join `ApplicationLive` once. No request-local runtime, local production `Effect.provide`, business-layer `Effect.run*`, Promise/error leak, or dependency upgrade is introduced.

### Express

`apps/server` owns only:

- Preview route/path/header/raw-query extraction
- Preview CORS/preflight and headers
- Calling shared-runtime operations
- Standard status/envelope/rate headers
- HEAD/body behavior
- Exact serialized response byte sending
- Preview OpenAPI/Scalar mounting

It owns no SQL, role policy, credential family logic, revision compatibility, field projection, or validation semantics.

### Dashboard web

`apps/web` owns the authenticated Preview route, TanStack queries, source URL state, read-only presentation, status callouts, and accessibility. It never imports server/database internals or stores a Preview key.

### Monorepo boundaries

- Shared contracts/kernel/services remain in `@framerfordevs/api`.
- Express transport stays in `apps/server`.
- Browser UI stays in `apps/web` and shared primitives in `@framerfordevs/ui`.
- No new package is required.
- Any future task remains package-owned and root scripts continue delegating through Turborepo.

## Public OpenAPI and documentation boundary

M10 serves a dedicated tenant-neutral Preview OpenAPI 3.1 document that includes:

- Both GET/HEAD content paths and OPTIONS behavior
- Mandatory locale
- Exact current versus revision selector grammar
- Bearer-only `preview.read` authentication
- Full stable success/failure envelopes
- HEAD/OPTIONS bodyless protocol exceptions
- No-store, referrer, request-ID, rate-limit, retry, and `WWW-Authenticate` headers
- Current and compatible-revision examples with placeholder IDs only
- Invalid/incomplete draft example returning 200 plus validation issues
- Explicit statement that Preview may contain unpublished/invalid content and never changes publication
- Explicit statement that credentials must not appear in URLs/browser bundles
- Exact response/query/resource limits
- No list/filter/sort/expansion claims

The document is generated from/reconciled against Preview Effect Schemas. Snapshot tests reject path/method/query/header/security/error drift.

The public Preview document contains no dashboard oRPC, Better Auth, workspace, member, credential-management, draft mutation, publication mutation, operator, or Delivery-only contracts. The complete management reference remains disabled by default and forbidden in production. M12 later publishes the allowlisted Preview document in the consolidated developer portal.

## Dashboard preview UX

### Route structure

The Preview workspace uses TanStack Router's non-nested trailing-underscore convention so `/entries/{entryId}/preview` is a dedicated page under `_auth`, not a child of the entry editor page that has no `Outlet`. A route-tree regression test locks its public path and parent.

Search parameters are strictly validated and URL-authoritative:

- `locale`
- `source`
- `schemaRevisionId`
- `sharedRevision`
- `localizedRevision`

Malformed historical selection renders an explicit invalid-selection state and issues no Preview query. It never falls back to current content automatically. The user must deliberately choose “Preview current draft,” which navigates to valid current-source state before a request is made.

### Entry editor entrypoint

The entry editor adds a real `Link` to Preview for the exact selected locale. If local form state is dirty, Preview is disabled or guarded with explicit “Save the draft first” guidance because M10 previews persisted state, never unsaved React state.

Revision history offers explicit Preview actions only when a compatible schema/source pair can be formed. Incompatible old-contract revisions remain visible but explain why they cannot be combined with the selected counterpart; no silent current-source substitution occurs.

### Preview page

The page composes installed shadcn Base UI primitives:

- Header/back link and exact locale
- `Alert` stating “Unpublished draft preview” and that production is unchanged
- `Card` for source/schema/shared/localized authority
- Textual validation status and issue summary
- Read-only renderer-neutral JSON data with bounded overflow/long-content behavior
- Publication status loaded separately so the developer can verify Gujarati remains unavailable in Delivery
- Copyable public Preview endpoint without Authorization/key material
- Current/revision source controls using semantic labelled fields/selects
- Skeleton/loading, error, forbidden, incompatible, empty, and oversized states

M10 does not pretend the CMS owns the developer's frontend renderer. The dashboard preview shows the exact API document an external renderer receives. Rich text stays structured JSON; no `dangerouslySetInnerHTML` or unreviewed serializer is introduced.

### TanStack Query/Router behavior

- `_auth.beforeLoad` protects the route before data loading.
- Loader dependencies include every validated source selector.
- Project, locales, selected Preview, and publication status start in parallel after required scope authority is known.
- Loaders use `queryClient.ensureQueryData` and reusable query options.
- Query keys include project, environment, collection, entry, exact locale, source, schema, shared revision, and localized revision.
- No credential or content body appears in a query key.
- Entry draft save/restore targeted invalidation includes affected current/revision Preview queries.
- Preview itself is read-only and has no optimistic mutation cache.
- Source changes use URL navigation, enabling back/forward/deep links.

### Accessibility and current UI guidance

- Semantic links for navigation and buttons for actions
- Full Card composition and Alert callouts
- Visible headings and labels
- Source/validation status conveyed in text, not color alone
- Polite live regions for async source changes
- Error summary with actionable recovery
- Visible focus and keyboard operation
- `Intl.DateTimeFormat`/`Intl.NumberFormat` for metadata
- `translate="no"` for IDs/keys/locales
- Long JSON/IDs use `min-w-0`, wrapping, and bounded scrolling
- Loading text uses the ellipsis character (`…`)
- Existing shadcn Base APIs are followed; links are not rendered with button semantics
- Automated axe coverage and keyboard/focus tests

## Observability

Named spans cover:

- Preview scope decode/resolve
- Preview credential authentication
- Preview rate-limit decision
- Current/historical source resolution
- Schema/revision loading
- Preview compilation
- Preview audit persistence
- Public transport serialization

Safe span/log annotations may include stable project/environment/collection/entry/locale/schema/revision IDs, source kind, subject kind, bounded issue count, validation outcome, size bucket, and result.

They exclude:

- Credential/key/prefix/digest/Authorization
- Raw query string
- Content or response body
- Validation messages/paths
- Entry name
- Rich text, URLs, reference target IDs, JSON values
- User email/name
- Hashes usable as content fingerprints

Bounded metrics include:

- Preview requests by `current|revision`, `credential|user`, outcome, and status family
- Preview duration by source/outcome
- Preview validation outcome and fixed issue-count bucket
- Preview response size bucket
- Preview query rejection category
- Preview audit failure count
- Existing credential verification and rate-limit metrics

No tenant/resource/credential/user/locale/revision ID or tag becomes a metric label.

## Security and threat model

| Threat/failure                                   | Control                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Anonymous draft read                             | Mandatory Preview bearer or authenticated dashboard session; no fallback                              |
| Delivery/management key reads drafts             | Exact `preview` family and `preview.read` policy                                                      |
| Credential widens tenant through path            | Base credential verification precedes lookup; repository compares persisted principal and route scope |
| Cross-collection/entry/locale revision injection | Complete predicates, immutable source tenant checks, exact locale FK, non-enumeration                 |
| Historical pair inferred incorrectly             | Explicit schema + both source selectors; no timestamp/current-head inference                          |
| Mixed-contract historical projection             | `PREVIEW_REVISION_INCOMPATIBLE` before content return                                                 |
| Hidden dashboard field disclosure                | Server-side historical/current role projection and hidden-issue redaction                             |
| Preview changes publication                      | Read-only domain surface; only audit insert; no publication repository dependency                     |
| Draft leaks through Delivery                     | Separate repositories/routes; Delivery tests assert no draft-table reads/results                      |
| Credential leaks via link/referrer/log           | Authorization header only, no secret links/storage, no-referrer, recursive redaction                  |
| Browser third-party reads with cookies           | Public Preview ignores cookies and has wildcard no-credential CORS                                    |
| Cached draft survives revocation                 | `private, no-store`, no ETag/304, auth on every request                                               |
| Unbounded invalid draft response                 | Existing partition bounds, 50 issues, 2.5 MiB exact response cap                                      |
| Deep/cyclic/dangerous JSON                       | Existing iterative storable preflight and corruption hard failure                                     |
| Rich-text XSS                                    | Structured Portable Text only; no HTML generation/rendering                                           |
| External asset SSRF                              | No fetch/DNS/redirect/probe                                                                           |
| Reference N+1/graph explosion                    | References remain IDs; no expansion in M10                                                            |
| Concurrent save creates torn Preview             | Explicit `REPEATABLE READ` source/audit transaction                                                   |
| Audit/log stores content                         | Stable scope/resource/action only; content-free tests                                                 |
| Redis outage disables protection                 | Existing bounded degraded-memory fallback and recovery                                                |
| Rate/metric cardinality explosion                | Closed policies and fixed labels; opaque identities                                                   |
| Public docs expose management                    | Dedicated allowlisted Preview schema; snapshot/probe tests                                            |

## Performance and reliability

- Direct entry/source IDs avoid list scans.
- Current heads and revision IDs use existing primary/composite indexes.
- Historical schema fields remain bounded to 100 and use revision ordering indexes.
- No draft reference availability query is needed because Preview returns references as IDs and existing stored issues can be recomputed in grouped form only if required.
- No publication snapshot, typed Delivery projection, or JSON GIN scan is used.
- Exact final serialization prevents response-limit drift.
- Transactions contain no external calls and hold no content locks.
- The rate limiter protects process/Redis/DB/audit capacity.
- Audit growth is intentional, bounded to successful Preview reads, and remains part of the M14 retention review.
- Telemetry failure cannot fail Preview or create unbounded buffering.

Proposed local production-build baseline with PostgreSQL/Redis on the same Docker host, pool max 10, representative 4–64 KiB drafts, and Preview auditing enabled:

| Scenario                  | Sustained rate | Target                     |
| ------------------------- | -------------: | -------------------------- |
| Current draft Preview     |  75 requests/s | p95 ≤ 100 ms, p99 ≤ 200 ms |
| Explicit revision Preview |  50 requests/s | p95 ≤ 125 ms, p99 ≤ 250 ms |

Each runs 15 seconds warm-up plus 60 seconds measured. Criteria:

- Under 0.5% unexpected errors
- No statement, acquisition, pool, or idle timeout
- Pool active never exceeds 10 and waiters return to zero
- Redis remains active with no unexpected degraded decisions
- Audit count equals successful measured Preview reads
- No publication/delivery state changes
- No unbounded heap, Redis keys, fallback entries, logs, metrics labels, or open transactions
- Representative plans use intended head/revision/schema/audit indexes

Separate intentional tests cover credential 429 behavior shared across two server processes, hard Redis outage/degraded recovery, and oversized Preview response rejection without memory growth. Expected 429/413 outcomes are tracked separately from capacity success.

## Test and coverage plan

The M10 test plan maps one-to-one to every approved requirement. Tests are added with implementation and remain deterministic.

### Contract, parser, and property tests

- Branded source/schema/revision identities reject interchange and malformed UUIDs
- Current/historical selector unions and required singleton query grammar
- Missing/duplicate/malformed/oversized locale and no fallback
- Explicit `none` version-0 semantics
- Unknown parameters, credential-in-query, and 4 KiB boundary
- Full Preview success/failure envelope and public error allowlist
- Current and revision source metadata encoding/decoding
- API-key projection for every field kind and nested structure
- Mixed object shared/localized merge and atomic list behavior
- Current API-key rename behavior through stable IDs
- Historical old-schema API-key behavior
- Default materialization for every default-bearing kind without writes
- Soft-invalid values preserved with deterministic issues
- Hard corruption/partition collision failure
- Structured rich text, decimal, money, date-time, asset, and reference preservation
- Hidden user field/value/issue projection
- Validation issue ordering/cap
- Canonical response exact below/at/above 2.5 MiB without truncation
- Public OpenAPI schema conversion/snapshots

Property tests use `it.effect.prop`/Effect Schema arbitraries where appropriate and cover arbitrary valid field trees/fragments within the existing bounds.

### Effect service and operation tests

- Shared `layer(...)`/`it.layer(...)` test setup with replaceable compiler/repository/rate/telemetry/clock services
- Named current/revision user/credential operations
- Expected failures remain typed and distinct from defects/interruption
- Foreign Promise/driver failures translate at repository boundaries
- No local `Effect.provide`/ad hoc runtime in ordinary tests
- Credential and user rate-limit ordering
- Safe span/log/metric fields and fixed labels
- Telemetry failure does not fail the operation

### PostgreSQL integration

- Current version-0/current-head combinations
- Exact English/Hindi/Gujarati isolation
- Explicit historical shared/localized source combinations
- `none` plus revision combinations
- Same-schema compatibility and mixed-schema incompatibility
- Cross-workspace/project/environment/collection/entry/locale/source non-enumeration
- Archived/CMS-disabled/locale-disabled denial and restoration behavior
- Valid Preview credential gets full contract
- Dashboard owner/developer/content-role/read-only visibility matrix
- Hidden fields absent from dashboard results
- Concurrent save before/after transaction snapshot yields one coherent pair
- Parallel Preview reads of the same entry/locale all succeed with one independent audit each and no unexpected `40001`
- Injected SQLSTATE `40001` aborts and retries the complete transaction at most once; a repeated `40001` fails safely
- Deadlock, connection loss, unknown commit outcome, and generic database failures are not retried as serialization failures and never create a duplicate audit
- Direct revision/history immutability remains unchanged
- One audit per successful current/revision GET/HEAD and none for failures/OPTIONS/docs
- Audit actor type/user-or-credential/action/resource/request correctness and content absence
- Audit failure returns no content
- Explicit `repeatable read` inspection inside Preview transaction
- Statement/idle timeout behavior
- No draft/publication/snapshot/projection/generation/outbox mutation
- Representative `EXPLAIN (ANALYZE, BUFFERS)` for current and historical paths
- Complete fixture cleanup without touching append-only publication artifacts

### Credential, authorization, and policy matrix

- Approved M3 management/Delivery issuance, rotation, revocation, policy, one-time display, and authentication behavior remains unchanged
- Preview issuance rejects missing acknowledgement, null expiry, exactly-over-30-day expiry, and browser-clock manipulation; exact 30-day boundary succeeds under the server Clock
- Preview base authentication rejects legacy null-expiry and originally over-30-day credentials even if otherwise active
- Compliant Preview rotation retains its bounded expiry; noncompliant rotation cannot mint a non-expiring successor
- Preview issuance warning and authority acknowledgement are distinct from M3's non-expiring acknowledgement
- Anonymous denied
- Missing/malformed/unknown Preview credential behavior
- Delivery and management keys denied
- Missing/malformed/unknown credentials cannot distinguish existing from nonexistent route resources
- Wrong environment/project credential denied
- Expired/revoked/rotated predecessor denied; successor allowed
- Preview key cannot invoke management mutation RPC
- Preview key cannot invoke Delivery as Preview authority
- Dashboard all/selected/none locale access matrix for every role
- Public Preview path never calls Better Auth session/user policy
- Dashboard path never accepts Preview key as session authority
- Extra request fields cannot inject actor/role/workspace/schema/source/content/audit authority

### HTTP/CORS/cache/security headers

- GET/HEAD response parity and empty HEAD body
- HEAD performs auth/rate/read/audit and cannot enumerate cheaply
- OPTIONS validates methods/headers without content auth
- Unknown methods return 405 with `Allow`
- Wildcard/no-credentials Preview CORS isolated from management and Delivery
- Authorization explicitly allowed; cookies ignored
- Every success/error has exact no-store/no-cache/expires/referrer/nosniff headers
- No ETag, Last-Modified, or 304 behavior
- 401 includes safe `WWW-Authenticate`
- Credentials rejected in URL/query
- Request IDs/traces on success, failure, HEAD, and rate limit
- Response cap returns stable 413 before partial body
- Preview data routes rollout-gated by `PREVIEW_API_ENABLED`
- OpenAPI JSON/reference loads and contains only Preview public contracts
- Common management/auth/operator paths absent under Preview host/path probes

### UI, route, and accessibility

- Non-nested route tree and validated search state
- Current Gujarati draft Preview while Delivery remains unavailable
- Dirty editor requires save before Preview
- Exact locale/source displayed textually
- Current/revision selector and back/forward/deep-link behavior
- Incompatible revision guidance without silent fallback
- Validation valid/invalid/capped states
- Production publication status displayed separately
- Endpoint example contains explicit locale and no key
- Long IDs/JSON/issues remain usable without overflow
- Loading/error/forbidden/oversized/empty states
- Keyboard/focus/live-region/heading/link/button behavior
- No state conveyed only by color
- Automated axe checks
- No raw HTML/rich-text rendering or external asset loading
- Query keys contain all non-secret dependencies and no content/credentials
- Targeted invalidation after save/restore
- SSR/auth/hydration and route chunk regressions

### Load and resilience

Each profile is a separate named implementation/checklist/report gate and cannot be summarized away by the headline latency rows:

- Current Preview capacity at the approved rate/latency budget
- Revision Preview capacity at the approved rate/latency budget
- Two-process shared credential quota and stable 429 envelope/headers at the approved 300-unit policy
- Redis hard outage, bounded degraded memory, and automatic recovery
- Oversized response repeated rejection and memory stability
- Concurrent save/read coherence
- Parallel same-entry Preview reads, exact successful-audit count, and no serialization failures
- Audit count and no content/publication mutation invariants
- Pool/transaction/Redis/heap/fallback/log/metric post-run invariants

### Coverage gates

Coverage is behavior-led rather than line-padding, with these minimum M10 targets:

- Preview contracts, parser, pure compiler, OpenAPI generator, and named operations: 100% statements, branches, and functions where tooling can measure them deterministically
- Preview repository: at least 90% statements and 80% branches, plus explicit coverage for every authorization, selector, lifecycle, transaction, and audit outcome regardless of percentage
- Express Preview boundary: every route/method/header/auth/cache/rate/error branch
- Browser-safe Preview helpers: 100% statements/branches
- Preview UI: interaction and axe coverage for every source/status/error state
- Workspace-wide existing configured coverage gates must not regress

The final gate runs `pnpm run ready`, production/full audits, `git diff --check`, read-only PostgreSQL invariants/plans, production bundle review, Docker health/HTTP checks, and the full manual Gujarati unpublished-preview review.

## Database and migration decision

M10 requires no database schema change:

- Preview credentials/scopes and nullable expiry storage already exist; the 30-day expiring-only rule is application policy.
- The 2026-08-12 read-only inventory found one active non-expiring Preview credential. Inventory must be repeated immediately before rollout; the developer must issue a compliant replacement and revoke every noncompliant predecessor through normal audited controls before `PREVIEW_API_ENABLED` becomes true. The agent will not mutate/backfill credential rows directly.
- Current and historical draft/revision authority already exists.
- Audit events already support `user` and `credential` actors plus environment/resource scope.
- Required direct lookup and revision indexes already exist.
- Rate-limit state is external/in-memory infrastructure, not a PostgreSQL schema concern.

If implementation query-plan evidence proves an index is necessary, or developer review changes scope to public share grants, implementation must stop for a new approved design amendment and developer-controlled migration gate. The agent will not generate, apply, push, execute, edit, or rewrite a migration.

## Decision-standard review

### Product-goal alignment

The design gives developer-owned frontends safe access to unpublished exact-locale content while preserving backend/renderer independence. Stable entry/schema/revision identities remain usable by future visual sites without copying content or changing Delivery.

### Correctness

Explicit current versus schema/shared/localized revision authority avoids ambiguous historical reconstruction. `REPEATABLE READ`, immutable revisions, stable-ID merge, selected schema projection, deterministic defaults/issues, and exact tenant predicates prevent torn or cross-scope previews.

### Security

Bearer-only Preview family separation, persisted environment scope, no secret URLs/storage, no session fallback, strict no-store/referrer/CORS behavior, server-side role projection, non-enumeration, resource limits, successful-access audits, and central rate limiting reduce disclosure, escalation, replay impact, cache leakage, and abuse.

### Reliability

Short bounded transactions, no content locks, no external calls in transactions, typed failures, existing Redis degradation, exact byte limits, and complete concurrency/failure tests prevent partial responses and hidden dependency failures.

### Performance

Preview uses direct indexed bounded lookups, a 100-node schema ceiling, no lists/expansion/N+1, one compilation, exact response sizing, shared pool/runtime resources, and an explicit load/connection/audit baseline.

### UX

Exact locale/source metadata, save-before-preview, explicit invalid-draft feedback, production-separation status, deep-linkable non-secret state, and accessible renderer-neutral JSON make Preview honest and useful without pretending to render the developer's website.

### DX

Versioned REST/OpenAPI contracts, existing `ffd_prev_` credentials, stable application envelopes/errors, explicit historical selectors, and no content mutation make integrations predictable. M12 can generate typed clients directly from this public contract.

### Observability

Named Effect operations, bounded Preview/rate/audit metrics, request/trace correlation, and stable-ID logs diagnose access without recording content, credentials, query strings, or high-cardinality metric labels.

### Maintainability and future compatibility

Focused compiler/repository/operations, existing credential/rate/runtime reuse, no schema change, isolated public docs/CORS, and a versioned Preview context leave clear extension points for visual site/page/binding context and separately designed share grants.

## Approval requested

Developer approval authorizes implementation of these material decisions:

1. Dedicated versioned Preview Express routes and Preview-only OpenAPI/reference
2. Bearer-only existing `preview.read` credentials on the public API, with base credential verification before resource lookup and no session/cookie fallback
3. **Standalone developer-approved trust decision:** one Preview credential may read the complete contract—including editor-hidden fields—for all current/historical drafts in its environment; per-resource grants remain deferred
4. **Standalone developer-approved mitigation:** Preview credentials are expiring-only with a server-enforced 30-day maximum at issuance and authentication, a dedicated full-authority warning/acknowledgement, and pre-rollout replacement/revocation of noncompliant existing credentials
5. Separate current and explicit schema/shared/localized revision-source routes
6. Explicit `none` version-0 selectors and no historical counterpart inference
7. Compatible selected schema/contract requirement for historical sources
8. Permissive safe draft projection with defaults and validation issues
9. No reference expansion/publication requirement in M10 Preview
10. Complete machine field projection versus role-projected dashboard Preview
11. `private, no-store`, no ETag/Last-Modified/304, no-referrer, and wildcard non-credentialed Preview CORS
12. Credential-free authenticated dashboard preview links; no public share grant/token flow in M10
13. Central `preview.global`, `preview.credential`, and `preview.user` policies with proposed budgets
14. One content-free audit for every successful Preview GET/HEAD
15. Explicit short `REPEATABLE READ` source-plus-audit transactions with at-most-once whole-transaction retry only for SQLSTATE `40001`
16. 4 KiB query and 2.5 MiB response bounds
17. Three new Preview error codes
18. Focused Preview compiler/repository/Effect Layer architecture in the shared ManagedRuntime
19. No database migration for approved M10 scope
20. Complete coverage/load/security/accessibility gates described above
21. Deferral of externally shareable short-lived Preview grants to a separately approved design
