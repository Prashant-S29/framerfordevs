# Milestone 9 production Delivery API design

**Status:** Developer-approved; implementation authorized

**Date:** 2026-08-09

## Decision summary

Milestone 9 will expose M8's exact-locale immutable publication snapshots through a versioned, portable HTTP/JSON Delivery API. The Delivery API will be implemented as a dedicated Express boundary, not as a dashboard oRPC procedure, while all business work continues through schema-backed Effect operations, typed services/Layers, and the one shared `ManagedRuntime`.

The design uses:

- Required canonical `locale` on every content request, with no fallback or language negotiation
- Current publication heads for latest reads and immutable M8 publication IDs for historical reads
- A protected-by-default collection delivery configuration, with explicit public opt-in
- Existing environment-bound `delivery` credentials and the fixed `delivery.read` scope
- Stable-ID, root-scalar current-value projections for bounded filtering, sorting, and unique lookup
- Explicit query capability allowlists configured independently from immutable content schemas
- Exact, type-aware comparisons and one-field keyset sorting with a stable entry-ID tie-breaker
- HMAC-signed, scope/query/generation-bound, expiring Delivery cursors
- A collection-locale generation that makes pagination fail stale rather than duplicate or skip records after publication changes
- Publication-time unique-value enforcement under deterministic advisory locks plus database unique indexes
- Bounded reference expansion through M8's pinned immutable publication manifest
- Strong response-byte ETags, conservative Last-Modified handling, and distinct mutable/immutable and public/protected cache policies
- Wildcard non-credentialed CORS for the Delivery route family only; management/auth CORS remains unchanged
- One reusable repository-wide `RateLimitManager` with a generic Redis-backed distributed store, deterministic in-memory test/degraded store, weighted token buckets, and centrally registered policies
- Read-only bounded database work, explicit query timeouts, response-size preflight, query-plan fixtures, and a developer-approved load baseline
- A dedicated OpenAPI 3.1 document generated/tested from the Delivery contracts
- Collection delivery settings UI for access and query capabilities, authorized only for owners/developers

No draft table, draft head, management entry name, actor identity, field editor metadata, audit row, or mutable authoring value is read to construct a Delivery response.

## Source hierarchy and discovery

This proposal follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every rule linked by `knowledge_base/rules/index.md`
4. The M9 goal, deliverables, and automated/manual criteria
5. Approved M1-M8 decisions
6. The committed M8 database, immutable snapshot compiler, credential authentication, Express boundary, contracts, errors, runtime, telemetry, and tests

The following installed guidance was reviewed and applied where material:

- Stable Effect v3 services, Layers, schemas, typed errors, observability, and testing
- Drizzle/PostgreSQL tenant scoping, transactions, typed queries, composite/partial/covering indexes, keyset pagination, query plans, connection limits, and N+1 avoidance
- Express routing, boundary validation, headers, CORS, and security behavior
- Existing Better Auth and API-credential boundaries
- Security threat modeling, untrusted query parsing, authorization, rate/resource limits, redaction, and non-enumeration
- TanStack Query/Router/Start, shadcn, React, and accessibility guidance for the management settings surface
- Turborepo package boundaries and package-owned tasks/dependencies

Relevant HTTP/PostgreSQL standards research included conditional requests and validator precedence, immutable cache directives, CORS wildcard behavior without credentials, rate-limit retry guidance, deterministic collation, keyset pagination, statement timeouts, advisory locking, and representative `EXPLAIN (ANALYZE, BUFFERS)` verification.

No new product skill is required. Any implementation dependency must be added through pnpm after approval; no package manifest will be edited manually.

## Current authority and seams

M9 extends, rather than replaces, these committed foundations:

- `cms_entry_locale_publication_head` is the only mutable latest-publication authority for an entry and exact locale.
- `cms_entry_locale_publication` and `cms_entry_locale_delivery_snapshot` are database-enforced append-only artifacts.
- A snapshot contains API-key-shaped `ffd-delivery-snapshot@1` JSON and never contains the CMS-only entry name or draft metadata.
- Every reference occurrence is pinned to an immutable target publication in the exact source locale.
- One locale-leading partial current-head index already supports `(locale_id, collection_id, entry_id)` traversal.
- M8 outbox events already identify publish/unpublish changes and stable invalidation tags.
- Delivery credentials are environment-bound, family-bound to `delivery`, and scope-bound to `delivery.read`; request input cannot widen their persisted tenant scope.
- Credential revocation is checked against the database on authentication.
- Existing management APIs use oRPC/OpenAPI and the standard response envelope.
- Express currently applies one credentialed management-origin CORS policy globally; M9 must split Delivery CORS before that policy without weakening management/auth routes.
- Existing management cursors are unsigned base64url payloads. M9 introduces a separate signed public cursor contract because its threat model explicitly includes tampering and expiration.

## Scope

### Included

- Versioned REST-style Delivery routes and OpenAPI 3.1 documentation
- Exact project/environment/collection resolution
- Mandatory exact enabled locale
- Latest list, latest ID lookup, unique-field lookup, and immutable publication lookup
- Protected-by-default and explicit public collection access
- Environment-bound Delivery credential authentication
- Root-scalar filtering, sorting, and configured unique lookup
- Current-value projection, unique claims, and collection-locale generation persistence
- Publication/unpublication/schema/config integration required to keep projections authoritative
- HMAC-signed keyset cursors
- Explicit bounded pinned-reference expansion
- ETag, Last-Modified, HEAD, and 304 handling
- Delivery-specific CORS, cache policy, resource limits, rate limiting, metrics, tracing, and safe logs
- A central rate-limit policy/manager/store foundation reused by existing invalid-credential protection and future API families
- A generic Redis-compatible production service/client and local integration infrastructure; no Upstash-specific runtime contract
- Management contracts/API/UI for collection delivery configuration
- Backfill tooling/design, migration handoff, query-plan tests, and load tests

### Deferred

- Draft or revision preview: M10
- Webhook workers, cache-provider purge adapters, retries, and external invalidation delivery: M11
- Generated typed clients and schema locks: M12
- Per-entry or per-field Delivery authorization
- Credential collection allowlists or locale allowlists beyond the existing environment scope
- Full-text search, substring search, relevance ranking, OR/NOT groups, arbitrary JSONPath, nested-field filtering, multi-field sorting, aggregations, facets, offsets, and GraphQL
- Server-side response-object caching
- Multi-region active-active rate-limit replication, edge/WAF denial, tenant-defined quotas, billing tiers, and runtime-administered dynamic limits: M15 production hardening
- Compression-provider/CDN configuration
- Locale fallback or `Accept-Language`
- Repointing an old publication as current
- Expanding references to current target heads; expansion always follows M8 pins

## Public route surface

Base path:

```text
/api/delivery/v1/projects/{projectId}/environments/{environmentKey}/collections/{collectionKey}
```

Routes:

```text
GET|HEAD /entries
GET|HEAD /entries/{entryId}
GET|HEAD /entries/by/{fieldKey}?value=...
GET|HEAD /entries/{entryId}/publications/{publicationId}
```

Every route also requires exactly one `locale` query parameter.

Documentation:

```text
GET /api/delivery/v1/openapi.json
GET /api/delivery/v1/docs
```

The documentation routes are deliberately tenant-neutral descriptions of the stable v1 protocol. They contain no project data, project-specific schema, collection configuration, generated client, or credential material. Authenticated project-specific endpoint examples live in collection settings; schema-derived project documentation/tooling is a separate M12 concern.

### Why these URL authorities

- `projectId` is globally stable; a project key is only workspace-unique and cannot identify an anonymous public scope by itself.
- `environmentKey` is stable within the project and is more usable than exposing two UUIDs.
- `collectionKey` is the published developer contract and is already unique in the environment.
- Stable entry ID remains canonical.
- A unique lookup uses a field key in the path and one typed `value` parameter; it never returns an arbitrary first match.
- Immutable URLs include entry and publication IDs so every query retains complete collection/entry/locale scope predicates even though publication IDs are globally unique.

Unknown methods return a standard application error with `Allow` where applicable. `OPTIONS`, `HEAD`, and `304 Not Modified` are documented HTTP protocol exceptions to the JSON envelope and carry no response body.

## Delivery response contracts

All body-bearing application responses preserve the standard discriminated union.

A delivered item has this stable outer shape:

```json
{
  "id": "entry UUID",
  "collectionId": "collection UUID",
  "collection": "articles",
  "locale": "hi",
  "publication": {
    "id": "publication UUID",
    "sequence": 2,
    "schemaRevisionId": "schema revision UUID",
    "publishedAt": "2026-08-09T12:34:56.789Z"
  },
  "data": {}
}
```

The outer metadata is projected from the immutable publication/snapshot and resolved collection key. `data` is copied only from the immutable M8 document, subject only to requested expansion. It is never reconstructed from drafts.

List data:

```json
{
  "items": [],
  "page": {
    "limit": 20,
    "nextCursor": null,
    "hasMore": false
  }
}
```

Rules:

- The response excludes workspace ID, project display metadata, environment internals, entry management name, actors, source revisions, draft versions, reference manifests, hashes, query projections, and authorization/configuration internals.
- Delivery returns the complete published snapshot `data` for every schema field kind. Field-editor role visibility/editability is an authoring and management-disclosure rule, not a Delivery field ACL; the collection's public/protected policy is the Delivery authorization boundary.
- The root-scalar current-value projection exists only for query planning and uniqueness. It never limits, removes, or reconstructs fields in the delivered snapshot.
- Publication and schema IDs are public stable contract metadata.
- Decimal and money amounts remain canonical strings; date-times remain canonical instants; rich text remains structured `ffd-portable-text@1`; external assets remain inert URL data.
- List responses intentionally provide only `hasMore` and `nextCursor`. They expose no total count, page number, or `page X of Y`; exact counts/aggregations and offset pagination remain deferred to avoid an unbounded count path.
- A list item uses its own current immutable publication and may legitimately identify an older schema revision until that exact entry locale is republished.
- Immutable lookup returns the named historical publication even when a newer publication is current or the locale has been unpublished. Project/CMS/locale availability and the collection's current access policy still apply.

## Exact locale and availability semantics

1. `locale` is mandatory on list, ID, unique, and immutable requests.
2. Duplicate, empty, malformed, oversized, noncanonical, unsupported, disabled, or removed locale input is rejected; no fallback is attempted.
3. A valid alias accepted by the pinned locale registry canonicalizes once, then exact enabled project-locale identity is used.
4. Missing locale input is `VALIDATION_ERROR` with a safe `locale_required` detail.
5. Unsupported/disabled locale is the existing `LOCALE_UNAVAILABLE` 404 contract.
6. An enabled locale with no current publication returns an empty list; ID/unique latest lookup returns `NOT_FOUND`.
7. Immutable history is unavailable while the project locale is disabled/removed and becomes available unchanged if that same stable locale is restored.
8. Archived projects, disabled CMS capability, missing environments/collections/entries/publications, and foreign scope resolve without leaking another tenant.

`Accept-Language` is ignored and is never placed in `Vary`.

## Collection delivery configuration

### Configuration model

Delivery behavior is operational collection configuration, not immutable content-schema data. M9 therefore adds a separate configuration authority rather than retroactively changing M5-M8 schema-revision hashes.

Each collection has one mutable configuration:

- `access`: `protected | public`, default `protected`
- Positive optimistic `version`
- Updated actor/time
- Zero or more stable field capability rows:
  - `fieldId`
  - `filterable`
  - `sortable`
  - `uniqueLookup`

Only rows with at least one enabled capability are stored. `uniqueLookup` implies `filterable`.

The complete configuration is read and replaced atomically under the collection write lock. It references stable field IDs but exposes current published field API keys in management responses. Query requests resolve the current API key to the stable configured field ID.

### Authorization

M9 adds the user policy action `delivery.configure`.

- Allowed: owner and developer with all-locale access
- Denied: content administrator, editor, reviewer, client editor, read-only, and locale-restricted members
- No credential family may mutate this configuration in M9

This is intentionally stricter than ordinary schema/content editing because making a collection public exposes current and discoverable historical immutable publications.

### Configuration validation

A capability field must:

- Exist in the current published schema
- Be a root terminal field, not an object/list child
- Have a supported scalar kind for the requested capability
- Have no incompatible current projection kind for a current stale publication

A schema publication that removes or incompatibly changes a configured field is rejected until the field is removed from Delivery configuration. API-key rename remains an acknowledged breaking schema change; the stable field capability survives, but requests must use the new current key.

To enable a capability after an incompatible kind change, editors must remove the old capability, publish the schema, republish affected exact locales, and then enable the new capability. The management error gives this recovery without exposing content values.

### Public access warning

The UI requires explicit confirmation before changing `protected` to `public` and explains:

- Anonymous callers can read latest publications.
- Known immutable publication URLs for that collection become anonymous too.
- Returning to protected blocks new origin requests but cannot revoke data already downloaded or retained by external caches.
- Publishing remains a separate permission and action.

Configuration changes are audited without field values and emit a bounded `cms.collection.delivery_config.updated` outbox event for future M11 invalidation handling. A no-op update emits neither.

## Authentication and collection access

### Protected collections

A protected request requires exactly one header:

```text
Authorization: Bearer ffd_del_...
```

The route first resolves the persisted project/environment/collection scope, then authenticates with:

- Expected family `delivery`
- Required scope `delivery.read`
- Workspace/project/environment IDs derived from persistence, never trusted from the key or widened by query input
- Active, unexpired, non-revoked credential state

Missing credentials return `UNAUTHORIZED`; malformed, wrong-family, wrong-scope, wrong-environment, expired, revoked, or unknown credentials return the existing non-enumerating `CREDENTIAL_INVALID` response.

### Public collections

- A missing Authorization header takes a fast anonymous path and performs no Better Auth session lookup, membership query, user policy evaluation, or credential verification.
- If an Authorization header is supplied, it must be a valid matching Delivery credential; malformed supplied credentials are not silently ignored.
- Public and authenticated responses contain identical content for the same request.

M9 has collection-level access only. A public source expanded anonymously may expand only target collections whose current access is also public. A valid matching Delivery credential may expand protected target collections in the same persisted environment. An unavailable target fails the complete expansion generically; the API never returns partial protected content.

`delivery.read` is an environment-wide trust boundary, not collection-level delegation: one valid Delivery credential can read every protected collection in its persisted environment. Protected therefore means unavailable to anonymous callers and credentials from other environments, not isolation among different credential holders inside one environment. Integrations needing separate partner/application trust domains must use separate environments until a future credential-grant model adds collection allowlists.

## Strict query grammar

The list endpoint accepts only:

- `locale` — required singleton
- `limit` — optional singleton, default `20`, range `1..50`
- `cursor` — optional singleton Delivery cursor
- `sort` — optional singleton
- `expand` — optional singleton
- Up to five dynamic filter parameters

Filter syntax:

```text
filter.{fieldKey}.{operator}={typedValue}
```

Example:

```text
?locale=en&filter.status.eq=published&filter.publish_date.gte=2026-01-01&sort=-publish_date
```

The raw `URLSearchParams` sequence is parsed directly so duplicate singleton/filter keys cannot be hidden by Express query coercion. Unknown query parameters, malformed dotted paths, duplicate predicates, empty values, oversized values, nested field paths, and unsupported operators are rejected. All predicates are combined with `AND`; M9 has no `OR`, grouping, or implicit search.

ID, unique, and immutable endpoints allow only their documented `locale`, `value`, and `expand` parameters. Query strings over 8 KiB are rejected before database work.

### Supported current-value projection

M9 materializes every present supported root scalar from a newly current publication, regardless of whether that field is currently query-enabled. This allows later capability changes without parsing or mutating immutable snapshots.

| Kind                                  | Stored comparison type             | Filters                              | Sort | Unique lookup |
| ------------------------------------- | ---------------------------------- | ------------------------------------ | ---- | ------------- |
| `short_text`, `slug`, `email`, `enum` | NFC text, PostgreSQL `C` collation | `eq`, `ne`                           | yes  | yes           |
| `number`                              | finite double precision            | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | yes  | yes           |
| `decimal`                             | exact PostgreSQL numeric           | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | yes  | yes           |
| `boolean`                             | boolean                            | `eq`, `ne`                           | yes  | no            |
| `date`                                | date                               | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | yes  | yes           |
| `date_time`                           | timestamp with time zone           | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | yes  | yes           |
| `reference`                           | target entry UUID                  | `eq`, `ne`                           | yes  | yes           |

Long text, URL, money, rich text, JSON, objects, lists, and external assets are not filter/sort/unique-capable in M9. Money requires explicit amount/currency semantics and is deferred rather than given an ambiguous ordering.

Comparisons are exact and case-sensitive. There is no implicit lowercasing, accent folding, locale collation, substring matching, or floating-point conversion for decimals. Query values decode through the same canonical kind rules before SQL parameters are created. All SQL remains parameterized; field names and operators select closed server-side branches and are never interpolated from untrusted input.

A missing value has no projection row:

- Positive filters do not match it.
- `ne` does not turn absence into a value.
- Sorting places missing values last for both ascending and descending order.
- Unique constraints apply only to present values, so multiple missing optional values are valid.

## Sorting and pagination stability

### Sort contract

M9 permits one explicit configured field sort:

```text
sort=publish_date
sort=-publish_date
```

No `sort` means stable `entryId` ascending. An explicit field sort uses the typed value, missing-last semantics, and `entryId ASC` as the mandatory unique tie-breaker. Multi-field sort is rejected.

### Collection-locale generation

Keyset order alone cannot prevent duplicate/skip behavior if current publications change sort/filter membership between pages. M9 therefore maintains one mutable collection-locale delivery generation:

- Missing state is generation `0`.
- Every state-changing publish or unpublish increments it once in the same transaction as the publication head and current-value projection.
- No-op publish/unpublish does not increment it.
- Backfill initializes current scopes deterministically before routes are enabled.

A list reads generation, query configuration, current schema identity, and page data inside an explicit read-only `REPEATABLE READ` transaction. A continuation cursor is accepted only while all these authorities still match. If content changed, the API returns `DELIVERY_CURSOR_STALE` and instructs the caller to restart from page one. It never continues against a changed result set and therefore does not promise snapshot retention beyond the cursor window.

This invalidation is intentionally collection-locale-wide rather than query-scoped. Any state-changing publish or unpublish in that collection and locale invalidates every in-flight list cursor there, including cursors whose current filter would not have matched the changed entry. Frequently published collections may therefore force long crawls to restart. This conservative behavior avoids attempting to prove which arbitrary filter/sort result sets were unaffected and preserves the no-duplicate/no-skip guarantee. The OpenAPI error documentation presents `DELIVERY_CURSOR_STALE` as an expected recoverable operational outcome, not a server defect.

### Signed Delivery cursor

A Delivery cursor is a compact versioned payload plus HMAC-SHA-256 signature. It includes:

- Cursor version/kind
- Project, environment, collection, and exact locale identities
- Collection delivery-config version
- Current published-schema revision ID
- Collection-locale generation
- SHA-256 of the normalized filters/sort/expansion/page limit
- Sort kind/direction and final typed sort tuple
- Final entry ID
- Issued-at and expiry

Each emitted continuation cursor expires 15 minutes after that page response. Expiry is rolling: accepting a valid cursor and returning another page emits a new cursor with a fresh 15-minute lifetime, current authority bindings, and the active signing key. There is no separate whole-traversal deadline while the collection-locale generation/config/schema remain unchanged and the client requests each next page before its cursor expires. This permits slow unchanged crawls without weakening mutation correctness because generation remains the traversal authority; collection access and credentials are rechecked on every request, and cursors contain no content or secret.

A cursor is bounded to 1,024 base64url characters. Decoding verifies size and syntax before HMAC, compares signatures in constant time, validates every schema field, then checks scope/query/generation/expiry. Invalid, expired, malformed, tampered, cross-project, cross-environment, cross-collection, cross-locale, and cross-query cursors return the same safe `DELIVERY_CURSOR_INVALID` response; only a valid cursor whose persisted generation changed returns `DELIVERY_CURSOR_STALE`.

Configuration adds `DELIVERY_CURSOR_SECRET` and optional `DELIVERY_CURSOR_PREVIOUS_SECRET`, each at least 32 bytes. New cursors use only the active secret. The previous secret accepts cursors issued before rotation for at most their remaining 15-minute lifetime; a successful continuation is immediately reissued under the active key. The previous secret can be removed after one full cursor lifetime. The cursor payload is opaque but not encrypted; it contains no credential, content value, filter value, or secret.

## Unique lookup and publication concurrency

A slug is lookup-capable only when its stable field is explicitly configured `uniqueLookup`; M9 never returns an arbitrary first slug match. The same mechanism supports the other approved unique kinds.

Uniqueness scope is exactly:

```text
(project, environment, collection, locale, stable field, present typed value)
```

It is independent per locale and applies only to current publications.

### Enforcement

- Management config preflight rejects enabling uniqueness when current projected values already conflict.
- Publication validation reports a bounded `delivery_unique_value_conflict` issue for visible configured fields.
- Publish repeats the check inside the M8 transaction.
- It acquires transaction-scoped advisory locks for all new unique claims in deterministic digest order after the established project → collection → entry/head locks.
- Type-specific partial unique indexes remain the final race-safe database authority.
- Unpublish removes only that entry-locale's current projection/claims atomically.
- Publishing a replacement removes old projection rows, advances the head, inserts the new projection, and increments generation in the same transaction.

Advisory-hash collision can only over-serialize unrelated claims; it cannot permit duplicate values. A unique constraint failure rolls back every publication artifact and maps to the same typed publication/configuration conflict without exposing the value.

## Bounded pinned-reference expansion

### Request model

`expand` is a comma-separated set of API-key paths from the stored publication document, for example:

```text
expand=author,related.author
```

Limits:

- At most 10 requested paths
- At most depth 2
- At most 100 matching reference occurrences
- At most 50 unique target publications across the whole response
- At most 4 MiB canonical response bytes

Array indexes are not supplied by callers. M8 occurrence paths are normalized by removing concrete indexes when matching requested paths.

### Expansion authority

- Base reference values remain stable target entry IDs when not expanded.
- Requested reference values become a bounded object containing target entry/publication metadata and the pinned target publication's immutable `data`.
- Nested expansion uses that target snapshot's own pinned manifest.
- Latest source responses still follow the source publication's immutable pins, never current target heads.
- Unpublishing or republishing a target does not change an existing source publication's expanded representation.
- Every target is rechecked for same tenant/environment/exact locale and current collection access policy.

A publication ID already present in the current ancestry terminates a cycle by leaving that nested reference as its stable entry ID. Repeated non-cyclic targets reuse one loaded immutable artifact but may appear at each requested occurrence.

Expansion is loaded breadth-first in one bounded query per depth, never one query per reference. Unknown/non-reference paths, protected targets unavailable to the caller, exceeded occurrence/publication/depth limits, and over-limit responses fail the whole request. M9 never silently truncates expansion or returns partially authorized content.

## Response-size and database-work bounds

Hard source-controlled limits:

- Query string: 8 KiB
- Page size: 50
- Filters: 5
- Sort fields: 1 plus entry-ID tie-breaker
- Expansion paths/depth/occurrences/publications: 10 / 2 / 100 / 50
- Canonical JSON response body: 4 MiB
- Database statement timeout: 750 ms
- Delivery read transaction idle timeout: 2 seconds

List/expansion workflows first select bounded metadata and persisted snapshot byte counts. If the minimum requested documents cannot fit, they return `DELIVERY_RESPONSE_TOO_LARGE` before loading all JSON documents. Final canonical serialization is measured again because envelope and repeated expanded occurrences add bytes. No content is truncated.

All Delivery reads select only required columns. Latest ID and immutable lookup are direct relational joins. Lists overfetch at most one metadata row to determine `hasMore`. Expansion batches publication IDs. No query scans draft JSON or uses a GIN index over snapshots.

## HTTP validators and caching

### Exact representation ETags

The server constructs the exact UTF-8 JSON response bytes once and returns a strong ETag:

```text
ETag: "sha256-base64url"
```

The digest covers the complete versioned response representation, including expansion and list metadata. The same bytes are sent; no separately serialized body can drift from the validator.

`If-None-Match` has precedence over `If-Modified-Since`. Matching safe GET/HEAD requests return 304 with no envelope/body and retain ETag, Last-Modified, Cache-Control, Vary, request ID, and rate-limit headers.

### Last-Modified

- Latest item: maximum publication time among the source and expanded pinned publications
- Immutable item: maximum publication time among the immutable source and expanded pins
- List: maximum of collection-locale state change, delivery-config update, current schema publication, and expanded pinned publication times

HTTP dates have one-second precision. The implementation compares the precise database timestamp conservatively and never returns a false 304 merely because two changes occurred in the same second. ETag is the preferred validator.

### Cache-Control

Public latest ID/unique/list:

```text
public, max-age=0, s-maxage=60, stale-while-revalidate=300
```

Public immutable publication:

```text
public, max-age=31536000, immutable
```

Protected latest and immutable responses:

```text
private, no-cache
```

Protected responses may be stored only in a private cache and must revalidate, preserving immediate credential revocation on new requests. Errors use `no-store`. Public responses do not vary on Authorization because content is identical; protected/error responses are never shared-cacheable. Responses vary only on actual representation dimensions such as content encoding if compression is later introduced.

M9 defines provider-neutral stable cache tags in the Delivery service from project/environment/collection/entry/locale/publication IDs. M8 events already carry the matching publication invalidation authority. M11 will connect these to replaceable external cache purge adapters; M9 introduces no proprietary cache backend or header contract.

## Delivery CORS and HTTP boundary

Delivery middleware is mounted after request correlation/HTTP observation but before the existing management-origin rejection and credentialed CORS middleware.

For `/api/delivery/v1` only:

- `Access-Control-Allow-Origin: *`
- No `Access-Control-Allow-Credentials`
- Methods: `GET`, `HEAD`, `OPTIONS`
- Allowed request headers: `Authorization`, `If-None-Match`, `If-Modified-Since`, `Traceparent`, `X-Request-Id`
- Exposed response headers: `ETag`, `Last-Modified`, `Cache-Control`, `X-Request-Id`, rate-limit headers, and `Retry-After`
- `OPTIONS` validates the requested method/header allowlist and performs no content authentication/query
- Cookie/session state is ignored
- `X-Content-Type-Options: nosniff` is set

The existing management, Better Auth, RPC, and management OpenAPI routes retain the exact configured-origin, credentialed CORS behavior. Delivery wildcard CORS is not authorization; protected collections still require a Delivery credential.

## Central rate limiting and abuse controls

### Repository-wide manager and policies

M9 introduces one reusable `RateLimitManager` rather than another route-local limiter. Callers select a closed, source-controlled policy and provide only a validated identifier plus bounded request cost; they cannot supply arbitrary capacities, refill rates, key prefixes, or algorithms.

The manager returns one transport-neutral decision:

- `allowed`
- Applied policy
- Limit/capacity and remaining units
- Reset/retry time
- Enforcement mode: `redis | memory | degraded_memory`

Initial policies:

- `credential.verification.invalid`: existing repeated malformed/invalid credential protection by canonical network source
- `delivery.anonymous`: anonymous public Delivery traffic by canonical network source
- `delivery.credential`: authenticated Delivery traffic by persisted credential identity
- `delivery.global`: high-ceiling installation safety budget for attempted Delivery work

Future Preview, webhook, auth, management, and worker policies must join the same registry/service instead of creating unrelated limiter implementations. M9 adapts the existing `CredentialAttemptLimiter` facade to this manager so its public behavior and tests remain compatible while its state/control become central.

Initial Delivery identity limits remain:

- Anonymous public: 120 cost units/minute per source identity, burst 30
- Authenticated: 600 cost units/minute per credential identity, burst 100
- The installation-level safety budget is set above the approved aggregate load baseline and exists to shed overload, not to provide tenant fairness
- ID/immutable/unique lookup costs 1
- List costs `1 + ceil(limit / 10)`
- Each requested expansion depth adds 2 and each 10 expanded occurrences adds 1 after resolution

Successfully authenticated traffic has **no source/IP bucket**. A credential shared by a legitimate serverless fleet or corporate NAT consumes only its one global credential bucket, so unrelated credentials behind the same egress do not collide. A leaked credential is still capped across every application process because all instances use the same Redis-backed credential key. Anonymous traffic and invalid credential attempts remain source-bound because no trusted principal exists yet.

### Canonical source identity

The Express boundary derives source authority from `req.ip` after the application applies one validated numeric `TRUST_PROXY_HOPS` policy. Default `0` trusts only the direct socket and never accepts caller-controlled forwarding headers. A dependency-light parser validates an IPv4/IPv6 address, removes an IPv6 zone identifier, canonicalizes equivalent IPv6 and IPv4-mapped forms to the same network bytes, and falls back to the direct socket. If no valid address exists, requests share one bounded `unknown` source bucket rather than bypassing limits.

Before any source or credential identity reaches a store, `RateLimitIdentity` applies HMAC-SHA-256 with a dedicated installation-stable `RATE_LIMIT_FINGERPRINT_SECRET` and a domain-separated policy prefix. Redis keys, logs, spans, metrics, and responses therefore contain no raw IP, credential ID, credential key, user ID, or caller-controlled identifier.

### Store architecture

`RateLimitStore` is a replaceable Effect service with two implementations:

- `RedisRateLimitStore`: production/shared enforcement across every process connected to the same Redis-compatible deployment
- `MemoryRateLimitStore`: deterministic unit/test/development implementation and bounded degraded fallback

The Redis implementation uses a generic Redis client and a project-owned versioned Lua script; it does not depend on `@upstash/ratelimit` or make Upstash part of the product contract. Redis `TIME` is the distributed clock authority. One atomic script refills, checks weighted cost, consumes, sets bounded TTL, and returns remaining/reset metadata, preventing double spending and lost updates under concurrent processes. The script is loaded/cached by digest with safe `EVAL` recovery after Redis script-cache loss.

All processes pointing to the same Redis deployment enforce one global bucket per opaque policy identity. Operators may use the repository's local Redis-compatible service, self-hosted Redis/Valkey, managed Redis, or an Upstash database through its standard TLS Redis endpoint without changing application contracts. M9 adds Redis-compatible local integration infrastructure and validated configuration; no provider-specific dashboard or dynamic policy becomes a source of truth.

Global and identity policies may conservatively consume independently when another applicable policy rejects; limits are abuse budgets rather than billable quotas. This avoids cluster-slot coupling and multi-key transaction assumptions while never allowing more work than configured.

### Failure behavior

Redis checks have a short bounded timeout. On timeout, connection failure, invalid response, or script reload failure:

1. The request is evaluated by the bounded in-memory store under the same policy and cost.
2. Enforcement mode becomes `degraded_memory`.
3. One fixed-cardinality degraded metric/log signal is emitted without identifiers.
4. The request is never allowed without any limiter.
5. Shared Redis enforcement resumes automatically after recovery.

During an outage, each process has an independent fallback budget, so distributed strictness is temporarily weakened but every process remains protected and Delivery does not fail solely because the limiter store is unavailable. M15 must alert/test sustained degraded mode and multi-region behavior; it does not need to replace M9's central manager.

A limited response is the stable `RATE_LIMITED` envelope with HTTP 429, `Retry-After`, and bounded `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers. Redis credentials/URLs are validated environment secrets and use the existing recursive redaction rules.

## Error contracts

M9 adds schema-backed centralized codes:

- `DELIVERY_QUERY_INVALID` → 400, unsupported syntax/capability/operator/bounds
- `DELIVERY_CURSOR_INVALID` → 400, malformed/tampered/expired/scope-query mismatch
- `DELIVERY_CURSOR_STALE` → 409, valid cursor invalidated by current publication changes; retryable from page one
- `DELIVERY_RESPONSE_TOO_LARGE` → 413, reduce page size/expansion

It reuses:

- `VALIDATION_ERROR` for missing/malformed route-level input such as locale
- `UNAUTHORIZED`
- `CREDENTIAL_INVALID`
- `LOCALE_UNAVAILABLE`
- `NOT_FOUND`
- `RATE_LIMITED`
- `FORBIDDEN` for management configuration denial
- `VERSION_CONFLICT` for optimistic configuration updates
- `SCHEMA_INVALID`/publication validation issues where configuration blocks schema/publication
- Redacted `SERVICE_UNAVAILABLE` and `INTERNAL_ERROR`

No error echoes filter values, unique values, credentials, raw cursors, content paths from hidden management fields, SQL, plans, stack traces, or causes. Query details may identify the caller-supplied public field key/operator and safe limit.

## Database design

### Add `cms_collection_delivery_config`

One mutable row per collection:

- Complete workspace/project/environment/collection scope
- `access` (`protected | public`), default protected
- Positive optimistic `version`
- Changed-by user and timestamps

New collections create this row atomically. Existing collections are backfilled protected.

### Add `cms_collection_delivery_field`

Mutable complete-set capability rows:

- Complete collection scope
- Stable field ID
- `filterable`, `sortable`, `unique_lookup`
- Composite primary key `(collection_id, field_id)`
- Restrictive tenant-correlated field/collection foreign keys
- Checks for at least one capability and unique-implies-filterable

Configuration replacement occurs under the parent collection lock/version.

### Add `cms_collection_locale_delivery_state`

Mutable pagination/list authority:

- Complete collection and exact locale scope
- Positive bigint generation
- Last changed timestamp
- Composite primary key `(collection_id, locale_id)`
- Restrictive tenant-correlated collection/locale foreign keys

State changes only for current publication membership/content changes. Config version and schema revision are separate cursor/ETag authorities.

### Add `cms_entry_locale_delivery_current_value`

Mutable projection of supported present root scalars for current publications:

- Complete tenant/environment/collection/entry/locale scope
- Stable field ID and current publication ID
- Closed value kind
- One canonical bounded representation
- Exactly one typed value column: text, number, decimal, boolean, date, date-time, or reference UUID
- `unique_lookup` flag copied from current configuration
- Primary key `(entry_id, locale_id, field_id)`
- Tenant-correlated foreign keys to field, immutable publication, and the exact current publication head
- Checks enforcing one typed column and kind/column consistency

Type-specific partial indexes use:

```text
(locale_id, collection_id, field_id, typed_value, entry_id)
```

Text indexes use deterministic `C` collation. Matching type-specific partial unique indexes omit `entry_id` and apply only where `unique_lookup` is true. A publication-ID support index assists invariant checks/cleanup during head replacement.

The current-head composite FK requires publication workflows to delete old projections before pointer replacement, update the pointer, then insert new projections, all in the same transaction. Unpublish deletes projections before clearing the pointer. Failed transactions expose neither a head without its expected committed projections nor stale committed projections.

### Existing workflow extensions

M8 publish gains material stages after snapshot compilation:

1. Derive bounded root-scalar projections from the same strict candidate and stable field tree.
2. Lock/check unique claims.
3. Persist publication/snapshot/references.
4. Delete prior current projection rows for the exact entry locale.
5. Advance the exact current head.
6. Insert new current projections.
7. Increment collection-locale generation.
8. Persist audit/outbox/receipt.

Unpublish deletes exact current projections, clears the exact head, increments generation, and persists audit/outbox/receipt atomically.

Failure injection expands to projection and generation stages. Existing immutable append-only triggers remain unchanged; the new projection/config/state tables are intentionally mutable and are not covered by those triggers.

## Migration and backfill gate

Proposed migration name after design approval and Drizzle schema implementation:

```text
add_production_delivery_api_read_model
```

The agent must not generate, apply, push, execute, edit, or rewrite the migration.

After the approved schema is implemented, the agent stops and gives the developer the exact generation/application commands. The developer-generated migration must be reviewed before application.

An idempotent developer-run backfill utility will:

1. Scan current publication heads in bounded keyset batches.
2. Load only their immutable snapshots and exact historical schema fields.
3. Resolve root API keys back to stable field IDs under that publication's schema revision.
4. Decode supported scalar values through the same projection engine used by new publishes.
5. Dry-run counts, invalid kinds, byte/value bounds, and duplicate claims without logging values.
6. Insert current projections and initialize collection-locale generations only after a clean dry run.
7. Verify every current head has the expected projection set and no non-current publication has a current projection.

Initial configuration has no unique fields, so historical duplicate values cannot block the structural migration. All collections remain protected until explicitly changed.

For a live production rollout, Delivery routes stay disabled until schema application, dual-write deployment/backfill coordination, and verification are complete. The final handoff will define exact commands and a high-water/reconciliation procedure; M9 will not rely on an uncoordinated one-shot scan while publications continue.

## Effect and package architecture

### Contracts

`packages/api/src/contracts/delivery.ts` owns:

- Route/query primitives
- Delivery item/page/reference models
- Query/filter/sort/expand models
- Collection configuration management models
- Delivery-specific errors and OpenAPI schemas

A dependency-light query parser/canonicalizer and projection compiler live under `packages/api/src/lib/` and import no Drizzle, Express, Better Auth, telemetry, or environment configuration.

### Services

Focused services:

- `DeliveryQueryEngine`: parse/type/canonicalize queries, projection values, keyset tuples, response expansion, and canonical body bytes
- `DeliveryCursorSigner`: HMAC encode/verify with active/previous keys and clock
- `RateLimitManager`: closed policy selection, identity hashing, weighted decisions, standard metadata, and degraded-store orchestration
- `RateLimitStore`: generic shared-state boundary with Redis and deterministic memory implementations
- `DeliveryRepository`: scope resolution, config reads/mutations, latest/immutable/list/unique queries, generation checks, projection persistence/backfill reads, and database failure translation
- `DeliveryService`: access orchestration, credential authentication, expansion authorization, cache metadata, and response assembly

All production implementations join the existing application Layer and shared `ManagedRuntime`. There is no request-local runtime, business-layer Promise leak, local production `Effect.provide`, or `Effect.run*` below the Express boundary.

Stable Drizzle remains Promise-native inside repository adapters and is wrapped with typed `Effect.tryPromise`. Delivery list transactions are explicit read-only `REPEATABLE READ`; write workflow extensions preserve M8's explicit `READ COMMITTED` publication semantics and established lock order.

### Express boundary

`apps/server` owns transport-only concerns:

- Route/path/header extraction
- Raw query sequence capture
- Delivery CORS/preflight
- Calling one shared-runtime Delivery operation
- Mapping status/envelope plus cache/rate headers
- Empty HEAD/304 behavior
- Sending the exact pre-serialized body bytes

It does not contain SQL, authorization decisions, credential parsing policy, expansion traversal, or query semantics.

## OpenAPI

M9 serves a versioned OpenAPI 3.1 document with:

- All four GET/HEAD paths
- Required locale and strict query bounds
- Optional bearer security at the document level with per-operation public/protected runtime explanation
- Standard success/failure envelopes
- 304/HEAD/OPTIONS protocol exceptions
- ETag, Last-Modified, Cache-Control, rate-limit, Retry-After, and request-ID headers
- Dynamic content `data` as bounded JSON while preserving stable outer metadata
- Examples for ID, slug/unique, list filters/sort/cursor, immutable lookup, and expansion
- Explicit guidance that any collection-locale publication change may return `DELIVERY_CURSOR_STALE`, requiring a restart from page one
- Explicit guidance that list responses intentionally omit total counts/page numbers and that Delivery credentials authorize the whole persisted environment

The document is built from/reconciled against Effect Schema contracts. Snapshot tests reject drift in paths, methods, required locale, response codes, security scheme, and headers. Public clients do not depend on the dashboard router/runtime.

## Observability

Named spans cover:

- Scope/config resolution
- Credential/public access decision
- Query parse/canonicalization
- Cursor verification
- Latest/list/unique/immutable repository reads
- Expansion batch depth
- Conditional response evaluation
- Rate-limit decision
- Configuration update
- Projection/backfill work

Bounded metrics include:

- Delivery requests by endpoint kind, anonymous/authenticated, outcome, and status family
- Latency by endpoint kind/outcome
- Query rejection by fixed category
- Conditional request outcome (`absent | match_304 | miss`)
- Response size bucket
- Page-size, filter-count, expansion-depth, and expanded-count buckets
- Rate-limit decisions by policy, enforcement mode (`redis | memory | degraded_memory`), and outcome
- Redis limiter latency, timeout/error, script reload, and degraded/recovered counts
- Memory fallback retained-entry bucket and eviction count
- Database query count and duration buckets by endpoint/query kind
- Cursor invalid/stale counts
- Configuration mutation outcome
- Backfill processed/invalid count and duration

Metrics never label project, environment, collection, entry, locale, field, credential, IP/source, cursor, query value, publication, or URL.

Spans/logs may carry safe stable resource IDs where the existing observability rules permit, plus operation, bounded counts, outcome, duration, and fixed buckets. They exclude credentials, Authorization, raw cursors, filter/lookup values, response/content bodies, expansion documents, URLs in content, rich text, hashes usable as content fingerprints, and SQL causes.

A conditional 304 is counted as a successful 3xx Delivery result. Telemetry export remains outside database transactions and cannot fail a request.

## Connection and load baseline

M9 will make database and Redis resource bounds explicit through validated server configuration rather than relying on driver defaults:

- PostgreSQL pool maximum default 10, allowed 1..50
- PostgreSQL connection acquisition timeout default 2 seconds
- PostgreSQL idle timeout default 30 seconds
- `RATE_LIMIT_STORE` explicitly selects `memory | redis`; production/shared deployment selects `redis`
- `RATE_LIMIT_REDIS_URL`, the Redis check timeout, and `RATE_LIMIT_FINGERPRINT_SECRET` are validated/redacted server configuration
- One shared PostgreSQL pool and one shared Redis client are acquired/released by the scoped runtime lifecycle
- Redis reconnect/backoff, command timeout, fallback entry cap, and key TTLs are bounded; request handling never waits through an unbounded reconnect loop
- Local Docker/integration infrastructure includes one Redis-compatible service so the production store and Lua script are tested without requiring a proprietary hosted provider

Proposed developer-approval baseline, using a production server build, one server process, PostgreSQL and Redis on the same Docker host, PostgreSQL pool max 10, 10,000 current English publications, six projected fields, and representative 4 KiB snapshots:

| Scenario                                 | Sustained rate | Target                     |
| ---------------------------------------- | -------------: | -------------------------- |
| Mixed latest ID + unique lookup          | 200 requests/s | p95 ≤ 75 ms, p99 ≤ 150 ms  |
| List 20 with one indexed filter and sort | 100 requests/s | p95 ≤ 150 ms, p99 ≤ 300 ms |
| Latest with one-depth pinned expansion   |  25 requests/s | p95 ≤ 250 ms, p99 ≤ 500 ms |

Each scenario runs 15 seconds warm-up plus 60 seconds measured. Redis enforcement remains enabled; capacity traffic is distributed across enough credential identities to remain within the configured per-credential budget, while a separate hot-identity run proves global cross-process 429 behavior. Criteria:

- HTTP error rate below 0.5%, excluding intentional 429 tests
- No statement, connection-acquisition, or pool timeout
- PostgreSQL pool active connections never exceed 10 and waiting requests return to zero after load
- Redis command latency remains inside the configured limiter timeout with no unexpected degraded decisions
- No unbounded heap, memory-fallback entries, Redis keys/TTLs, logs, metrics labels, reconnect tasks, or open transactions
- Intended indexes appear in representative plans; no draft/snapshot sequential scan on hot lookup/list paths

The exact numbers become authoritative only through developer approval of this decision. CI may run a smaller smoke profile; the full baseline is an explicit local/manual gate because shared CI hardware timing is not deterministic.

## Management UI and UX

The collection workspace gains a Delivery settings card/page that:

- Shows Protected/Public text status and optimistic config version
- Requires confirmation for Public
- Lists only eligible current published root fields
- Provides Filter, Sort, and Unique lookup toggles with kind-specific explanations
- Shows that unique values are exact and locale-specific
- Prevents unique without filter and disables unsupported combinations
- Explains republish requirements for stale incompatible field kinds
- Displays copyable endpoint examples with an explicit locale
- Never displays or embeds a Delivery credential
- Links developers to existing credential management and Delivery OpenAPI docs

The settings surface is hidden/disabled according to `delivery.configure`, but server authorization remains authoritative. It uses existing cards, fields, checkboxes/switches, alerts, dialogs, tables, buttons, and live regions. Public confirmation, uniqueness conflicts, optimistic conflicts, save progress, success, and errors are keyboard/screen-reader accessible and never conveyed by color alone.

Configuration saves are not optimistic. Success invalidates collection/config/schema surfaces and announces the exact result. Conflicts preserve the local form and offer authoritative reload.

## Security and failure review

| Threat/failure                            | Control                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Draft or authoring metadata leak          | Delivery repository reads only current/immutable publication artifacts and current scalar projections                      |
| Cross-tenant/environment token widening   | Persisted route resolution plus credential subject comparison and complete tenant predicates/FKs                           |
| Anonymous access to protected collection  | Protected default, server-side access decision, no cookie/session fallback                                                 |
| Invalid token ignored on public route     | Supplied Authorization must validate                                                                                       |
| Public source expands protected target    | Per-target current access check; credential required; whole request fails safely                                           |
| Locale fallback/mixing                    | Mandatory canonical exact enabled locale everywhere                                                                        |
| Arbitrary SQL/operator injection          | Closed parser branches, stable field lookup, parameterized values, no raw identifiers                                      |
| Nonunique slug returns arbitrary item     | Lookup requires configured database-enforced unique capability                                                             |
| Concurrent duplicate publication          | Deterministic advisory claim locks plus partial unique indexes and rollback                                                |
| Cursor tampering/reuse                    | HMAC, constant-time verification, scope/query/config/schema/generation binding, expiry                                     |
| Pagination duplicate/skip after publish   | Generation mismatch returns stale instead of continuing                                                                    |
| Expansion cycle/N+1/explosion             | Pinned IDs, ancestry termination, BFS batching, fixed depth/count/byte limits                                              |
| Oversized list loads many 1 MiB snapshots | Persisted byte preflight before JSON fetch plus 4 MiB final limit                                                          |
| Query monopolizes DB                      | Indexed allowlists, fixed predicates, read-only transactions, 750 ms statement timeout                                     |
| Credential/source abuse                   | Central weighted policies; source-bound anonymous/invalid traffic; globally credential-bound authenticated traffic         |
| Shared-egress false positives             | Successfully authenticated traffic has no source bucket; each credential is limited independently                          |
| Redis limiter outage                      | Short timeout, bounded local policy fallback, degraded telemetry, and automatic recovery                                   |
| Cross-process quota races                 | One Redis clock plus atomic project-owned Lua refill/check/consume script                                                  |
| Provider lock-in                          | Generic Redis store contract; self-hosted, Valkey, managed Redis, and standard-protocol Upstash remain operational choices |
| CORS weakens management/auth              | Delivery mounted under separate wildcard non-credentialed policy only                                                      |
| Cache exposes protected content           | Protected `private, no-cache`; errors `no-store`; auth checked before 304                                                  |
| Public→protected transition recalls data  | UI explicitly states prior public downloads/caches cannot be revoked; origin denies new reads                              |
| Secret/query/content telemetry leak       | Header/body/value/cursor redaction and bounded no-ID metrics                                                               |
| Degraded fallback mistaken as global      | Decisions expose enforcement mode; alerts/tests distinguish Redis from per-process degraded memory                         |

## Test plan

### Contract and pure-kernel tests

- Mandatory/duplicate/malformed locale and no fallback
- Delivery item/page/envelope and dynamic content bounds
- Strict raw query parser, unknown keys, duplicate keys, five-filter and 8 KiB limits
- Kind/operator allowlists and exact typed decoding
- Root-only capability validation
- NFC text and deterministic `C` ordering semantics
- Missing-value filter/sort behavior
- Stable typed keyset tuple generation
- Cursor round trip, rolling 15-minute continuation, unchanged slow traversal, active/previous key reissue/rotation, expiry, oversize, tamper, malformed payload, constant safe failure, and every scope/query/config/schema/generation mismatch
- Projection extraction from all supported root kinds and omission of unsupported/missing/nested values
- Exact decimal/no floating conversion
- Expansion path normalization, list occurrences, depth/count bounds, cycle termination, deterministic reuse, and no truncation
- Canonical exact response bytes and strong ETag stability/change behavior
- Cache policy and Last-Modified derivation
- New error registry/status/envelope and OpenAPI snapshots

### Effect/service tests

- Replaceable query/cursor/rate/repository/clock/telemetry Layers
- Named operations and shared-runtime requirements
- Public path performs no credential/session/user-policy operation
- Protected and supplied-public credentials use exact persisted scope
- Central policy registry rejects unknown/ad hoc policies and caller-supplied limit configuration
- Redis and memory weighted refill/burst/cost parity, TTL/eviction, retry headers, and identity redaction
- Canonical IPv4/IPv6, mapped-address, trusted-proxy, direct-socket, and unknown-source behavior
- Valid credentials behind one shared source remain independent; one credential is globally bounded across separate store clients/process simulations
- Redis timeout/error/script-cache-loss degraded-memory fallback and automatic recovery
- Conditional authentication occurs before 304
- Typed failure vs defect/interruption behavior
- No content/query/credential/cursor fields in logs, spans, or metric labels

### PostgreSQL integration

- Default protected config for existing/new collections
- Authorized config replace/no-op/version conflict/audit/outbox behavior
- Role and all-locale authorization matrix for `delivery.configure`
- Capability eligibility and schema-removal/kind-change guards
- Backfill exact projection counts from historical schema API keys/stable field IDs
- Current projection changes only for the published/unpublished exact locale
- Shared edit alone changes no Delivery row/result
- Publish atomically updates head/projection/generation/audit/outbox/receipt
- Failure injection after projection and generation rolls everything back
- No-op publish/unpublish does not change generation
- Exact-locale unique conflicts, optional missing values, independent locale uniqueness, old-claim release, concurrent two-entry race, and sorted advisory acquisition
- Partial unique indexes remain final authority
- Latest ID/list/unique read no drafts
- Immutable historical read survives later publish/unpublish unchanged
- Current stale publications remain filterable by stable field after API-key rename
- Incompatible stale kind blocks capability enabling
- Generation-stable keyset pages contain no duplicates/skips; changed generation returns stale
- Read-only list transaction reports `repeatable read` and enforces statement timeout
- Expansion follows pinned publications after target republish/unpublish
- Anonymous protected-target expansion denial and credentialed success
- Representative `EXPLAIN (ANALYZE, BUFFERS)` for default list, every typed equality/range/sort class, unique lookup, latest ID, immutable ID, and expansion batch
- No unexpected sequential scan at representative cardinality
- Complete rollback-contained fixture cleanup without mutating M8 append-only artifacts

### HTTP/API tests

- All routes require locale and reject unknown/duplicate query parameters
- GET/HEAD parity and empty HEAD body
- 304 has no envelope/body and includes required headers
- `If-None-Match` precedence and changed ETag after relevant publication
- Conservative `If-Modified-Since`
- Exact cache headers for public/protected latest/immutable/errors
- Public anonymous success; protected missing/invalid/wrong-family/wrong-scope/wrong-environment/revoked/expired denial
- Supplied invalid token rejected on public collection
- Anonymous path performs no per-user authorization work
- Management CORS remains trusted-origin/credentials; Delivery CORS is wildcard/no-credentials and validates preflight headers
- Authorization never accepted in URL/query
- Rate limit stable envelope and retry/rate headers
- Request IDs/traces on success, failure, HEAD, and 304
- Response-size failure occurs without partial body
- OpenAPI JSON/reference loads and matches actual paths/contracts/headers

### UI/accessibility tests

- Protected default and public warning copy
- Owner/developer versus denied role behavior
- Eligible field capability matrix by kind
- Unique-implies-filter and stale-kind republish guidance
- Optimistic config conflict preserves edits
- Endpoint example always includes locale and never includes credentials
- Keyboard/focus/dialog/live-region/error-summary behavior
- No state conveyed only by color; axe coverage
- Route prefetch/query invalidation does not pull Delivery runtime code into initial unrelated routes

### Performance/load tests

- Deterministic 10k-current-publication fixture profile
- Proposed three-scenario baseline and connection-use assertions
- Conditional 304 run to measure validator behavior
- Separate intentional rate-limit run against Redis, including weighted costs, many credentials behind one source, and two process clients sharing one quota
- Redis latency/command/connection/TTL measurements plus bounded degraded-memory outage run
- Large snapshot/response-size rejection without memory growth
- Expansion batching query-count assertions
- Post-run open transaction, pool wait, limiter entry, heap, and fixture checks

## Decision-standard review

### Product alignment

The API serves only exact-locale published snapshots, preserves independent locale publication, exposes stable developer contracts, and remains portable for external SSR/static/client frontends without coupling to the dashboard or future visual builder.

### Correctness

Current heads and immutable publication IDs remain authoritative. Typed projections derive from the same publication candidate, unique claims commit with the head, signed cursors bind every ordering authority, and generation invalidation avoids claiming impossible mutation-stable pagination.

### Security

Protected defaults, explicit public confirmation, environment-bound Delivery credentials, per-target expansion access, parameterized closed queries, HMAC cursors/limiter identities, globally shared Redis-backed resource limits, source-free valid-credential limiting, separate CORS, private protected caching, and content-free telemetry address disclosure, injection, enumeration, shared-egress false positives, and abuse.

### Reliability

No external calls occur in publication transactions. Projection/generation updates are atomic and failure-injected. Immutable artifacts remain untouched. Stale pages fail recoverably, query timeouts are bounded, Redis limiter failures degrade to bounded local enforcement, and rate/cache providers remain replaceable.

### Performance

Delivery never rebuilds drafts. Current typed projections and partial indexes avoid arbitrary JSON scans. Metadata/byte preflight avoids loading oversized pages, expansion batches by depth, and query plans/load/connection behavior have explicit gates.

### UX and DX

Developers receive stable REST/OpenAPI contracts, strict query errors, exact cache semantics, safe cursor recovery, reproducible immutable URLs, and copyable explicit-locale examples. Owners/developers get a focused protected-by-default configuration UI with clear public/unique consequences.

### Observability

Endpoint/query/cache/rate/size/DB behavior is measurable with bounded labels and request correlation, while credentials, queries, content, and high-cardinality resource identities stay out of metrics.

### Maintainability and future compatibility

A separate Delivery config avoids rewriting historical schema hashes. Stable field IDs let API-key renames retain projection identity. One central policy manager prevents future API families from inventing incompatible limiter semantics, while generic Redis/memory stores preserve managed and self-hosted portability. Focused engines/services and provider-neutral cache/rate boundaries prepare M10-M16 without changing entry, locale, publication, or snapshot identity.

## Approval requested

Developer approval authorizes implementation of these material decisions:

1. The four versioned Express Delivery routes and dedicated OpenAPI document
2. Exact required locale and current-head/immutable-publication authority
3. Protected-by-default collection access with explicit public opt-in and owner/developer-only `delivery.configure`
4. Existing environment-wide `delivery.read` credential scope, with no collection-specific credential grants in M9
5. Separate mutable Delivery configuration keyed by stable field IDs rather than changing historical schema hashes
6. Root-scalar typed current-value projection and the supported kind/operator matrix
7. Explicitly configured slug/unique lookup with exact per-locale uniqueness
8. Deterministic advisory claim locks plus type-specific database unique indexes
9. One explicit field sort, missing-last semantics, and entry-ID tie-breaker
10. HMAC-signed rolling 15-minute scope/query/config/schema/generation-bound cursors with active/previous secret rotation
11. Collection-locale generation and stale-cursor failure instead of pagination across mutations
12. Pinned immutable reference expansion with depth 2, bounded BFS, cycle termination, per-target access checks, and 4 MiB response maximum
13. Public latest/immutable versus protected cache policies, strong response-byte ETags, conservative Last-Modified, and bodyless HEAD/304 exceptions
14. Wildcard non-credentialed Delivery CORS mounted separately from unchanged management/auth CORS
15. One repository-wide rate-limit manager with closed reusable policies, generic Redis-backed cross-process enforcement, deterministic memory test/degraded enforcement, HMAC identities, and no source bucket for successfully authenticated credentials
16. Redis as provider-neutral infrastructure rather than an Upstash-specific product dependency, with atomic weighted Lua token buckets and bounded local fallback during Redis failure
17. Explicit read-only transaction/query/pool bounds and the proposed load-test baseline
18. The four new Delivery error codes
19. The four-table read-model/configuration database design and atomic M8 publish/unpublish extensions
20. Developer-run dry-run/apply backfill and route-enable verification gate
21. Proposed migration name `add_production_delivery_api_read_model`

The developer explicitly approved this complete record and authorized implementation. Database migration generation and application remain developer-controlled.

## Post-approval amendment — public documentation boundary

On 2026-08-11, the developer clarified the intended production surface and authorized completion of the remaining M9 documentation work:

- The tenant-neutral Delivery OpenAPI JSON and interactive reference are public product contracts and remain separate from dashboard oRPC.
- The Delivery document must satisfy this record's complete path/method/query/response/header/security/example requirements and be generated from/reconciled against Delivery Effect Schemas.
- The complete management oRPC OpenAPI reference is an internal development/operator artifact. It is disabled by default and cannot be enabled in production; it must never be used as the public developer specification.
- Dashboard `/rpc` and Better Auth remain authenticated application backends on the future application origin, not public integration contracts.
- M12 owns the consolidated public developer portal, versioned allowlisted public specifications, guides, generated clients, and schema-derived project tooling after Delivery, Preview, and webhook contracts exist.
- M15 owns production host/ingress verification separating marketing, application, public API, developer documentation, and operator-only surfaces.

This amendment changes no database authority, public content route, credential scope, or Delivery response semantics.
