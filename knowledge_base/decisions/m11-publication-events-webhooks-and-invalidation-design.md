# Milestone 11 publication events, webhooks, retries, and invalidation design

**Status:** Approved — implemented and committed as `fef7205` on 2026-08-21

**Date:** 2026-08-13

## Decision summary

Milestone 11 will turn the existing transactional outbox into a durable, provider-neutral publication-event and webhook-delivery system without moving network work into publication transactions or weakening locale, tenant, and immutable-publication guarantees.

The design uses:

- The existing UUIDv7 `outbox_event.id` as the permanent public event ID
- A CloudEvents 1.0-compatible structured JSON envelope over the existing schema-publish and exact-locale entry publish/unpublish authority
- A canonical external event record materialized once from each supported outbox row
- Environment-bound webhook endpoints, versioned encrypted destinations, event subscriptions, and endpoint-specific signing secrets
- Standard Webhooks-compatible `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers over the exact stored UTF-8 body
- A two-phase secret-rotation flow and a bounded dual-signature overlap
- Strict HTTPS SSRF controls with validation at configuration and send time, all-address DNS checks, redirect denial, and connection pinning to a validated address
- Atomic outbox expansion into one initial delivery per eligible endpoint
- Short PostgreSQL `FOR UPDATE SKIP LOCKED` claims, persisted leases, network I/O outside transactions, and stale-lease recovery
- At-least-once delivery with stable event identity, immutable attempt logs, bounded exponential backoff with jitter, dead letters, and authorized idempotent manual replay
- Existing stable system invalidation tags plus bounded developer-defined semantic tags and exact origin-relative route mappings
- A dedicated `apps/worker` process with one worker-owned `ManagedRuntime`; the API server never sends webhook requests
- Protected dashboard oRPC management and a dedicated accessible project Webhooks workspace
- Complete contract, crypto, SSRF, authorization, PostgreSQL concurrency, crash-recovery, HTTP, UI, accessibility, observability, load, and migration-gate coverage

No draft save creates an event. M11 supports external subscriptions for `cms.schema.published`, `cms.entry.published`, and `cms.entry.unpublished`. `cms.entry.deleted` remains reserved until a real delete lifecycle exists. The existing `cms.collection.delivery_config.updated` row remains an internal invalidation/outbox event and is not exposed as a publication webhook in M11.

## Source hierarchy and discovery

This proposal follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every rule linked by `knowledge_base/rules/index.md`
4. The M11 goal, deliverables, automated criteria, and manual review
5. Approved M1–M10 decisions
6. The committed schema, publication, Delivery, Preview, policy, audit, runtime, Express, UI, and test implementations

Discovery confirmed a clean `main` at `14881fe`, aligned with `origin/main`. M10 implementation is committed at `aa177b5`; its completion documentation is committed at `14881fe`.

Materially relevant installed guidance was read and applied for stable Effect v3, Drizzle/PostgreSQL, Express, security hardening, TanStack Start/Router/Query, shadcn Base UI, React, accessibility, and Turborepo.

Authoritative standards and security research applied to this design include:

- PostgreSQL short transactions, consistent lock ordering, `FOR UPDATE SKIP LOCKED`, leases, partial/composite indexes, and query-plan verification
- Standard Webhooks signing over `id.timestamp.raw-body`
- CloudEvents 1.0 structured event attributes
- OWASP SSRF prevention, including DNS rebinding and validation/use time-of-check concerns
- HTTP status and `Retry-After` semantics
- Effect services/Layers, named operations, schedules, injected Clock/Random, interruption, and deterministic testing

Generic recommendations remain subordinate to repository decisions. M11 does not upgrade Effect or Drizzle, adopt Effect SQL, replace Better Auth, expose dashboard APIs publicly, or introduce a provider-specific cache/CDN contract.

### Validated review amendment

A two-pass external review was checked against the committed implementation and durable learnings before changing this proposal. The review confirmed four under-specified risks: generated FK dependency order, reciprocal endpoint/destination creation authority, plain-JSON replay fingerprinting, and simultaneous dispatcher/attempt contention. It also showed that cross-process key-ring continuity and publication invalidation failure stages needed more explicit acceptance gates.

This amendment therefore:

- Splits developer generation from developer application so generated SQL/snapshots are inspected first, including every referenced unique/PK dependency
- Makes endpoint creation an atomic disabled/null-pointer → destination/subscription/secret → pointer → enabled workflow
- Requires Effect Schema encoding to inert transport JSON before replay fingerprints
- Names every new invalidation-mapping failure boundary in schema publish, entry publish, and entry unpublish
- Adds Docker server/worker decrypt-and-rotation continuity and combined dispatcher/attempt contention profiles
- Records workspace quotas and weighted tenant scheduling as evidence-gated M15 work rather than inventing billing/governance semantics or allowing a hard delivery cap to drop events
- Keeps one in-flight attempt per endpoint as an intentional initial isolation/throughput trade-off

The amendment does not change the event contract, SSRF model, worker architecture, authorization boundary, retry semantics, migration ownership, or milestone scope. M10's compiler extraction is correctly treated as behavior-neutral shared-code work, not another write stage inside the M8 publication transaction; M9 and M11 are the relevant transaction-path extensions.

## Existing authority and implementation seams

M11 extends these committed seams rather than replacing them:

- Schema publication writes one `cms.schema.published` outbox row atomically with its immutable revision, head, and audit.
- Entry publish/unpublish writes one logical `cms.entry.published` or `cms.entry.unpublished` outbox row atomically with publication state, Delivery state, audit, and durable command receipt.
- Entry events have one entry-global `aggregateSequence` across all locales; each publication also retains its exact locale-local publication sequence.
- Draft create/save/restore paths write no production outbox event.
- `outbox_event.id` is a UUIDv7 identity and existing uniqueness constraints prevent duplicate logical publication events.
- Existing payloads contain stable tenant/resource/schema/publication identities, exact locale authority, changed field IDs, and stable invalidation tags without content or secrets.
- `outbox_event.processed_at` and `attempt_count` were reserved for M11; no worker currently consumes them.
- `webhook.read` and `webhook.manage` already exist in the user-action and management-credential scope registries. Owner and unrestricted developer roles already have those actions.
- The standard response envelope, centralized typed errors, request correlation, redaction, telemetry, shared runtime, policy service, and audit table are established.
- The browser uses protected oRPC, TanStack Query/Router, complete query keys, targeted invalidation, shadcn Base components, and non-nested project workspaces.
- Delivery and Preview public protocol boundaries remain isolated and unchanged.

The existing outbox lifecycle is insufficient by itself for fan-out. One event may target zero, one, or many endpoints, and each endpoint has an independent retry/dead-letter history. M11 therefore preserves the outbox as event authority and adds canonical event, delivery, and attempt records rather than overloading `outbox_event.attempt_count` as a destination attempt counter.

## Scope

### Included

- External event schemas for schema publish, entry publish, and entry unpublish
- Canonical event materialization from existing outbox rows
- Outbox expansion worker and webhook attempt worker
- Endpoint create/list/read/update/enable/disable operations
- Complete-set per-environment event subscriptions
- Endpoint-specific one-time signing-secret disclosure
- Two-phase secret rotation, bounded overlap, and early retirement
- Encrypted-at-rest endpoint destinations and signing secrets
- Strict destination validation and SSRF-safe HTTP transport
- Bounded retry/dead-letter lifecycle and immutable attempt metadata
- Authorized manual replay preserving the original event ID/body
- System tags, semantic tags, and exact manual route mappings
- Event, delivery, attempt, dead-letter, and queue management views
- Worker health/readiness, graceful interruption, observability, and Docker/Turborepo integration
- Deterministic failure injection, concurrency, crash, security, load, and accessibility testing

### Deferred

- `cms.entry.deleted` emission until an approved delete lifecycle exists
- Draft-save, review, preview-read, or ordinary management webhooks
- User-authored arbitrary event types or arbitrary webhook request headers
- Provider-specific Vercel/Netlify/Cloudflare/CDN purge adapters
- A managed build/deployment system
- Dynamic path templates, slug extraction, content-value interpolation, or remote route discovery
- Field-level route selectors and dependency-manifest-derived route invalidation; M16 owns dependency manifests
- Webhook payload transformation, custom scripts, plugins, or arbitrary code execution
- Public webhook endpoint-management REST/OpenAPI; M11 uses protected dashboard oRPC
- Consolidated public webhook documentation and packaged verification/invalidation SDKs; M12 owns the developer portal and generated tooling
- Exactly-once delivery or strict network delivery ordering
- Kafka, RabbitMQ, Redis Streams, or another broker before PostgreSQL evidence requires one
- Cross-region active-active worker coordination
- Workspace-wide endpoint/billing quotas, hard delivery-row quotas, and weighted tenant scheduling across the global worker pool. M11 uses the approved per-environment fan-out cap and work-conserving endpoint isolation; M15 owns evidence-based noisy-neighbor SLOs and quota/fairness policy. No future quota may silently discard an accepted publication event.
- Finite deletion of event/delivery/attempt/audit history; M15 owns holistic retention
- Production network-layer webhook-worker egress filtering and cloud metadata hardening; M11 keeps complete application-layer send-time validation and pinning, while M15 must add and exercise the independent deployment control without replacing or relaxing it

## Core invariants

1. Draft saves, restores, Preview reads, and no-op publications emit no production publication event.
2. A state-changing schema publish, entry publish, or entry unpublish creates exactly one logical outbox row in the authoritative transaction.
3. The existing outbox UUID remains the external event ID for every attempt and manual replay.
4. An event envelope is projected once and its exact UTF-8 body never changes afterward.
5. Webhook delivery is at least once. A crash after a destination accepts a request but before local completion may cause a duplicate.
6. Consumers use event ID for idempotency; delivery and attempt IDs are diagnostic metadata, not event identity.
7. Publication transactions perform no DNS, HTTP, encryption-key lookup, webhook signing, or destination work.
8. Outbox expansion and delivery-attempt finalization are atomic database transitions; HTTP occurs outside database transactions.
9. One endpoint/environment/event subscription can create at most one initial delivery for one event.
10. Expansion requires an endpoint and subscription that are both currently active and whose current activation time is no later than the event; disabled endpoints and removed subscriptions create no new deliveries. Queued retryable deliveries are canceled on disable/removal or destination replacement.
11. A request already in flight may have reached the destination when a concurrent disable occurs; this unavoidable boundary is visible in attempt metadata and the stable event ID still makes it deduplicable.
12. Every external endpoint is bound to exactly one persisted workspace/project/environment.
13. Endpoint management is environment-wide and requires unrestricted `webhook.read`/`webhook.manage` authority.
14. Every delivered entry event names exactly one locale and never claims another locale changed.
15. Event payloads contain stable IDs and invalidation metadata, never draft/snapshot content, actor identity, credentials, or destination secrets.
16. System invalidation tags are platform-owned and cannot be replaced by user input.
17. Semantic tags and routes are bounded, validated, sorted, deduplicated, and snapshotted into the outbox payload in the publication transaction.
18. Existing version-1 outbox rows remain decodable; absent M11 route/semantic metadata means empty arrays, not current-configuration lookup.
19. A retry or replay signs the exact stored body; it never reconstructs the body from mutable schema, endpoint, locale, or route state.
20. Signature verification requires the raw request bytes, bounded timestamp freshness, a matching secret, and an atomic consumer replay reservation.
21. Destination URL validation is repeated for every attempt, and the connection uses only an address validated for that attempt.
22. Redirects, ambient proxy variables, cookies, custom credentials, and user-controlled request headers are not followed or forwarded.
23. Worker interruption stops new claims, lets bounded in-flight work finish within the shutdown budget, and leaves expired leases recoverable.
24. Metric labels are closed and low cardinality; event, tenant, endpoint, delivery, attempt, host, route, and tag identities never become metric labels.
25. The API and worker use stable Effect services/Layers and one long-lived ManagedRuntime at each true process boundary.

## Event contract

### Supported external event registry

M11 exposes exactly:

- `cms.schema.published`
- `cms.entry.published`
- `cms.entry.unpublished`

The registry is an Effect Schema literal union shared by outbox decoding, subscriptions, the event projector, the dashboard, tests, and future M12 webhook schemas. Unknown or internal outbox types are never delivered accidentally.

`cms.entry.deleted` is reserved in the product requirements but is not accepted as an M11 subscription because no approved delete operation currently emits it.

### CloudEvents-compatible envelope

The exact stored body is deterministic structured JSON:

```json
{
  "specversion": "1.0",
  "id": "outbox event UUID",
  "source": "urn:framerfordevs:project:<projectId>:environment:<environmentId>",
  "type": "cms.entry.published",
  "subject": "cms.entry/<entryId>",
  "time": "2026-08-13T12:34:56.789Z",
  "datacontenttype": "application/json",
  "data": {
    "version": 1,
    "projectId": "project UUID",
    "environmentId": "environment UUID",
    "collectionId": "collection UUID",
    "entryId": "entry UUID",
    "locale": { "id": "locale UUID", "tag": "gu" },
    "publication": { "id": "publication UUID", "sequence": 3 },
    "aggregate": { "type": "cms.entry", "id": "entry UUID", "sequence": 7 },
    "schema": { "revisionId": "schema revision UUID", "contractHash": "..." },
    "changes": { "fieldIds": [] },
    "invalidation": {
      "systemTags": [],
      "semanticTags": [],
      "routes": []
    }
  }
}
```

Rules:

- `id` is `outbox_event.id` and is globally stable.
- `time` is `outbox_event.occurred_at`, not worker or attempt time.
- `source` is a stable URI and excludes workspace identity.
- `subject` is `cms.collection/{collectionId}` or `cms.entry/{entryId}`.
- Entry publish/unpublish includes exact locale ID/tag, removed/current publication identity, locale publication sequence, entry-global aggregate sequence, schema revision/contract, and changed field IDs.
- Schema publish includes collection aggregate sequence, schema revision ID, schema/contract hashes, and changed field IDs. Entry/locale/publication properties are absent rather than fabricated.
- Unpublish identifies the publication removed from latest Delivery. Because unpublish removes availability of the complete document, its event field IDs and field system tags cover every stable published field in that publication's schema, not merely the prior publication's delta.
- Initial entry publish includes every field present in the candidate as changed; later publish retains the compiler's deterministic changed-field result.
- Arrays are sorted and deduplicated.
- The body excludes workspace ID, user/credential actor, request ID, display names, API keys, content values, snapshot/reference data, URLs/assets, command IDs/fingerprints, and endpoint/delivery/attempt identity.
- The canonical serializer has locked byte fixtures and a hard 128 KiB UTF-8 body limit. Publication configuration cannot be saved if its bounded route/tag projection could make a valid event exceed that limit.

The external envelope is not the application response envelope; it is a protocol payload. Dashboard management operations and list/read APIs continue using `{ ok, data, error, message }`.

### Post-implementation payload minimization review

The version-1 payload remains unchanged after field-by-field review:

- CloudEvents `specversion` and `datacontenttype` preserve standard tooling compatibility; `id`, `type`, `time`, `source`, and `subject` provide idempotency, dispatch, occurrence time, stable scope, and generic subject filtering.
- `data.version` versions the Framer for Devs data contract independently of CloudEvents. Direct project/environment/collection/entry IDs intentionally duplicate parsed URI or subject components so consumers never need brittle string parsing.
- Locale ID/tag provide stable identity and ergonomic API use. Publication ID/sequence and aggregate type/ID/sequence support pinned publication lookup, per-locale ordering, generic processing, and gap detection.
- Schema revision/hash/contract authority supports exact schema retrieval, cache identity, and compatibility decisions. Changed field IDs support targeted rebuilds and schema-aware consumers.
- System/semantic tags and routes are intentionally action-ready invalidation projections even where they repeat resource identity.

The bounded duplication is materially more useful than its byte cost and contains no content, actor, display-name, credential, destination, or request authority. Removing any existing field would be a breaking public-contract change and requires a future major event-data version with migration evidence; additive fields within version 1 still require compatibility review.

### Existing outbox compatibility

The projector decodes explicit versioned unions for the existing M5, M8, and M9 payloads.

- Existing supported publication rows project with their current system tags and empty semantic routes/tags.
- New publication rows remain payload version 1 with additive bounded `semanticTags` and `routes` fields, or move to an explicitly decoded version 2 if implementation evidence shows the union is clearer. The external event `data.version` remains 1 for additive-compatible M11 launch semantics.
- `cms.collection.delivery_config.updated` is marked processed as an internal outbox type but creates no external `publication_event` or webhook delivery.
- Unknown payload version/type fails closed, leaves the row pending, emits a bounded defect signal, and never sends an approximate event.

## Invalidation model

### System tags

M11 preserves these platform-owned tags:

- `project:{projectId}`
- `environment:{environmentId}`
- `collection:{collectionId}`
- `entry:{entryId}` for entry events
- `locale:{localeId}` for exact-locale entry events
- `field:{fieldId}` for fields affected by the event

System prefixes are reserved. User input cannot create or shadow `project`, `environment`, `collection`, `entry`, `locale`, or `field` tags.

### Semantic tags and manual routes

A developer may configure an exact origin-relative route mapping under one environment. A mapping contains:

- Stable mapping ID and bounded display name
- Exact collection selector
- Optional exact entry selector
- Optional exact locale selector
- One or more supported publication event types
- One exact route path
- Zero to ten semantic tags
- Optimistic version and enabled/disabled lifecycle

Matching behavior:

- A schema publication matches mappings for its collection and event type. Entry/locale-restricted mappings do not match schema publication because schema changes are collection-wide and those narrower claims would be misleading.
- Entry publish/unpublish matches the collection plus optional exact entry/locale and event type.
- A mapping contributes its exact route and semantic tags. Results are sorted and deduplicated.
- A route is data only; M11 does not fetch it or claim that any framework invalidated it.
- Route paths begin with `/`, are at most 512 UTF-8 bytes, contain no scheme, authority, fragment, control character, backslash, dot-segment traversal, or credential material, and are canonically percent-encoded once. Query strings are excluded in M11.
- Semantic tags are NFC-normalized, 1–64 characters, match a documented lowercase namespace grammar such as `site:homepage`, and cannot use a reserved system namespace.
- One environment has at most 100 enabled mappings, each with at most 10 tags; one projected event has at most 100 routes and 100 semantic tags.
- Publication changes and their matching system field tags allow at most 1,000 stable field IDs. This remains inside the 128 KiB canonical event bound and is required for compatibility with valid recursive schemas whose total stable node count exceeds 100; the pre-rollout backlog gate found valid historical schema publications with 146 and 180 changed nodes.

Publication/schema repositories load matching mappings inside the existing authoritative transaction immediately before the outbox insert. Mapping rows are bounded and indexed. The exact routes/tags are inserted into the outbox payload atomically with the publication state. A concurrent mapping transaction linearizes according to normal PostgreSQL visibility/row locks; the publication records precisely the mapping state it observed. Worker timing never changes an event's invalidation metadata.

M16 may derive richer route/dependency mappings from visual bindings. It must extend this provider-neutral event contract rather than replacing system tag identity.

## Endpoint, subscription, destination, and secret model

### Endpoint lifecycle

An endpoint has `enabled` or `disabled` configuration state, an optimistic version, an `enabledAt` boundary, and a current immutable destination revision. Limits:

- At most 10 enabled endpoints per environment
- At most the three supported event types per endpoint
- Name 1–100 normalized characters
- Fixed response timeout of 10 seconds in M11; callers cannot increase it

Create requires at least one subscription, destination validation, and explicit acknowledgement that the destination will receive stable project/content metadata. It creates the endpoint, first destination revision, subscriptions, first active signing secret, and audit atomically. Because endpoint and destination have reciprocal authority, creation uses one transaction with an initially disabled endpoint and null current-destination pointer, inserts the destination/subscriptions/secret, advances the pointer, and only then enables the endpoint. Database checks permit the null pointer only while disabled; no committed enabled endpoint can lack a current destination. The signing secret is returned once.

Disable cancels queued/retry-scheduled deliveries and prevents outbox expansion. It does not erase attempts/history. Re-enable affects only events occurring at or after the new `enabledAt`; old events require manual replay.

Subscription replacement is complete-set, optimistic, audited, and interval-preserving. Removed event types cancel queued/retry-scheduled matching deliveries. Added event types apply only to events at or after their activation time. This prevents delayed dispatcher work from sending events that predate a subscription.

### Versioned destination

Every destination update creates an immutable destination revision and advances the endpoint pointer. Delivery rows reference the exact destination revision selected when they were created.

The canonical full URL is encrypted at rest with AES-256-GCM. The row stores only bounded display origin, key ID, nonce, ciphertext/tag, and a keyed fingerprint used for no-op detection. Encryption additional-authenticated-data binds workspace, project, environment, endpoint, and destination IDs so ciphertext cannot be swapped across scope.

Updating a destination cancels queued/retry deliveries targeting the old revision. Manual replay targets the endpoint's current validated destination. In-flight old-destination attempts retain normal at-least-once semantics and cannot be unsent.

Management list/read responses return the authorized display origin plus a masked path marker, not the decrypted full URL. Updating requires supplying the complete URL again. Logs, traces, metrics, audits, delivery lists, and attempt rows never contain the URL path/query.

### Destination URL and SSRF policy

A destination must:

- Use `https`
- Have no username, password, or fragment
- Have a canonical ASCII/IDNA hostname
- Use the default HTTPS port 443 in M11
- Be at most 2,048 UTF-8 bytes
- Not target a literal IP, localhost/local suffix, platform/internal denylisted hostname, or non-global address

Path and query are permitted because provider build hooks may place opaque authority there, but they are treated as sensitive and encrypted/masked.

Validation occurs without making an HTTP request when an endpoint is created/updated. It resolves bounded A/AAAA answers and rejects the destination if any answer is loopback, private, link-local, carrier-grade NAT, multicast, unspecified, reserved, documentation/benchmarking, IPv4-mapped non-global, or otherwise non-public.

Every attempt repeats hostname and DNS validation. The HTTP transport then pins the connection lookup to one address from that validated set while preserving the original hostname for TLS SNI and certificate verification. It never performs a second ambient DNS lookup. Redirects are disabled; every 3xx is a terminal response. Environment proxy variables are ignored. No cookie jar, client certificate, arbitrary header, or destination credential is supported.

DNS resolution is bounded to two seconds, TCP/TLS establishment through `secureConnect` is independently bounded to three seconds, and the complete request remains bounded to ten seconds. Response bodies are canceled/drained without storage and never exceed a small transport safety cap. Raw network errors are mapped to fixed categories without host/path leakage. The Node transport uses one private non-keepalive agent with a bounded 100-session TLS cache: every attempt opens a new socket and invokes its attempt-specific pinned lookup, while safe TLS session resumption preserves the approved one-endpoint throughput target. It never uses the ambient/global agent or reuses a connection across DNS validations.

A DNS answer that becomes non-public is a terminal security failure for that delivery and no connection is attempted. The endpoint remains visible so a developer can replace/disable it; future events also fail closed until corrected. M15 alerting will make repeated security failures operationally actionable.

Implementation may add a small reviewed IP-address parsing dependency through pnpm if Node's standard library cannot correctly classify all IPv4/IPv6 forms. It must not implement ad hoc string-prefix IP security checks.

### Signing secrets and encryption keys

Webhook signing secrets are endpoint-specific outbound verification secrets, not bearer API credentials. They are therefore separate from `api_credential`: the worker must decrypt them to sign, while API credential digests are intentionally non-recoverable.

Secret format:

```text
whsec_<base64url-encoded 32 random bytes>
```

Only ciphertext, encryption key ID, lifecycle metadata, and a safe short fingerprint are stored. Secret values are shown once at creation or rotation start and never returned by list/read APIs.

The deployment supplies a validated encryption key ring with an explicit active key ID and one or more 32-byte keys. New ciphertext uses the active key; old key IDs remain decryptable during operator rotation. Missing/unknown keys fail management secret operations and worker readiness closed. No random process-local encryption fallback is allowed because it would make persisted endpoints undecryptable after restart. Server and worker parse the same versioned key-ring contract independently; Docker acceptance must prove that ciphertext created by the server remains decryptable by separately built/restarted workers and across active-key rotation without exposing key bytes.

Two-phase endpoint secret rotation:

1. **Begin rotation:** generate one pending secret and disclose it once; the old active secret continues signing.
2. The developer configures the consumer to accept old and pending secrets.
3. **Activate rotation:** pending becomes active; old becomes retiring for a fixed 24-hour overlap.
4. During overlap, each request carries valid `v1` signatures from both active and retiring secrets.
5. At overlap expiry, or on authorized early completion, the old ciphertext is destroyed and metadata becomes retired.

Only one pending and one retiring secret may exist per endpoint. A new rotation cannot begin until the prior rotation is canceled/completed. Canceling a pending rotation destroys its ciphertext. Rotation lifecycle operations are optimistic, acknowledged, audited, and secret-free.

Encryption-key rewrapping is an operator concern, not endpoint secret rotation. M11 will document a dry-run/explicit-apply rewrap utility or runbook if needed; the agent will not mutate production rows without developer control. M15 owns final key-rotation operations review.

## Signature and verification protocol

For each attempt the worker sends:

```text
Content-Type: application/cloudevents+json; charset=utf-8
User-Agent: FramerForDevs-Webhooks/1
webhook-id: <original event UUID>
webhook-timestamp: <current Unix seconds>
webhook-signature: v1,<base64 HMAC> [v1,<second overlap HMAC>]
webhook-delivery-id: <delivery UUID>
webhook-attempt-id: <attempt UUID>
webhook-attempt-number: <positive integer>
webhook-replay: false|true
```

The signed input is the exact byte sequence:

```text
<webhook-id>.<webhook-timestamp>.<raw UTF-8 body>
```

Each `v1` signature is HMAC-SHA-256 using the decoded 32-byte endpoint secret and is compared in constant time. Multiple overlap signatures are space-separated according to Standard Webhooks conventions.

The verification helper:

- Accepts raw request bytes, not parsed/reserialized JSON
- Strictly parses singleton ID/timestamp headers and one or more bounded `v1` signatures
- Accepts one or more currently trusted secrets
- Uses an injected Clock with a default ±5-minute tolerance
- Verifies a signature before parsing the event body
- Decodes the event ID and CloudEvents/event union after cryptographic verification
- Requires an injected atomic `reserveEventId(eventId)` replay/idempotency store for strict replay rejection
- Returns a typed verified event or typed malformed, stale, invalid-signature, duplicate, or invalid-payload failure
- Never logs the body, signature, timestamp input string, or secrets

A consumer should retain event IDs for its business idempotency horizon, not merely five minutes. Normal retries and manual replay intentionally preserve event ID; an already completed idempotent consumer should reject/no-op them. Manual replay is useful when the prior attempt never completed consumer processing or the consumer deliberately clears/reclassifies its reservation.

M11 keeps this helper framework-neutral in the shared package with fixtures. M12 owns its public package/docs presentation.

## Database design

Exact names may be adjusted for Drizzle/PostgreSQL naming limits, but authority and constraints may not change without design amendment.

### Extend `outbox_event`

- Preserve every existing column and event ID.
- Interpret `processed_at` as successful dispatcher expansion/projector completion, including supported events with zero eligible endpoints and explicitly internal event types.
- Keep `attempt_count` as legacy dispatcher metadata; it is never a webhook-attempt count.
- Raise the bounded payload limit only as required for approved snapshotted routes/tags, with an exact source-controlled maximum.
- Preserve the pending partial index `(available_at, id) where processed_at is null` and validate its plan.

### `publication_event`

One immutable canonical external event per supported outbox row:

- Event/outbox ID as primary key and restrictive FK
- Full tenant/environment scope and supported event type
- Envelope version
- Exact canonical UTF-8 body text and SHA-256 body hash
- Body byte count
- Occurred/projected timestamps
- Complete tenant/event FKs/checks and event-type/time/body bounds

The canonical body is append-only. No application update/delete path exists.

### `webhook_endpoint`

- UUIDv7 endpoint ID and full tenant/environment scope
- Bounded name, enabled/disabled state, version, nullable current destination revision used only for transactional creation staging
- Consistency check requiring every enabled endpoint to reference a current destination
- Enabled/disabled actor/time metadata
- Operational endpoint lease token/expiry used to cap one in-flight attempt per endpoint across worker processes
- Tenant-composite FKs/checks
- Environment/status/name and lease-recovery indexes

Configuration version changes do not increment for worker lease fields.

### `webhook_endpoint_destination`

- UUIDv7 immutable destination revision and endpoint-local positive sequence
- Full tenant/environment/endpoint scope
- Display origin, encryption key ID, nonce, ciphertext/tag, keyed fingerprint
- Creator/time metadata
- Unique endpoint sequence and tenant-composite FKs
- No update/delete application path while referenced

### `webhook_endpoint_subscription`

- Endpoint, supported event type, full scope
- `active_from` and nullable `active_until`
- Creator/closer metadata
- Indexed endpoint/type/interval lookup
- Repository locks prevent overlapping active intervals for the same endpoint/type

History is retained for auditability. Delayed expansion requires the current open subscription interval and `active_from <= event.occurred_at`; a closed historical interval does not authorize a new delivery. Current endpoint enabled state and `enabled_at <= event.occurred_at` are also required.

### `webhook_endpoint_secret`

- UUIDv7 secret ID, endpoint-local positive sequence, full scope
- State `pending|active|retiring|retired|canceled`
- Encryption key ID, nullable nonce/ciphertext/tag after destruction
- Safe fingerprint and lifecycle actor/timestamps
- Partial uniqueness for one pending, one active, and one retiring secret per endpoint
- Lifecycle consistency and ciphertext-presence checks

### `cms_invalidation_route_mapping`

- UUIDv7 mapping ID and full tenant/environment scope
- Collection ID plus optional exact entry/locale IDs
- Bounded supported event-type array or normalized child relation
- Bounded exact route path and semantic tags
- Enabled/disabled state, optimistic version, actor/time metadata
- Tenant-composite FKs and indexed environment/collection/event matching

If normalized child tables provide materially stronger checks, implementation may use them without changing behavior.

### `webhook_delivery`

One delivery run, initial or replay:

- UUIDv7 delivery ID, event ID, endpoint ID, destination revision ID, and full scope
- Kind `initial|replay`
- Optional source delivery and replay command ID/fingerprint/actor metadata
- Status `queued|delivering|retry_scheduled|succeeded|dead_letter|canceled`
- Positive/zero attempt count, next attempt, lease token/expiry, completion time
- Fixed last outcome/error category without raw cause
- Created/updated timestamps
- Unique initial `(event_id, endpoint_id)`
- Unique replay command identity with fingerprint-safe idempotency
- Queue partial index `(next_attempt_at, id)` for ready states
- Endpoint/status/history and event/history indexes
- Lifecycle/check constraints and complete tenant FKs

The event body is referenced from `publication_event`; it is not copied or reconstructed per attempt.

### `webhook_delivery_attempt`

One guarded lifecycle row for every claimed send; after its single terminal finalization it is immutable:

- UUIDv7 attempt ID, delivery ID, endpoint/event scope, positive attempt number
- State `started|succeeded|retry_scheduled|dead_letter|abandoned|canceled`
- IDs of signing secret versions used, never secret values/signatures
- Request timestamp, start/completion, duration
- Nullable HTTP status and bounded response status family
- Fixed outcome/error category, parsed bounded `Retry-After`, and scheduled next-attempt time
- Unique `(delivery_id, attempt_number)` and timeline indexes

No response body, response header map, request header map, signature, URL, DNS answer, content body, stack, or raw network error is stored.

### Audit events

Management/replay actions include:

- `cms.webhook.endpoint.created`
- `cms.webhook.endpoint.updated`
- `cms.webhook.endpoint.enabled`
- `cms.webhook.endpoint.disabled`
- `cms.webhook.subscription.updated`
- `cms.webhook.secret.rotation_started`
- `cms.webhook.secret.rotation_activated`
- `cms.webhook.secret.rotation_canceled`
- `cms.webhook.secret.rotation_completed`
- `cms.invalidation.route.created|updated|disabled`
- `cms.webhook.delivery.replayed`

Audits contain stable scope/actor/resource/request/time only. They exclude URL/origin, event body, routes/tags, subscriptions, secret fingerprints/ciphertext, signatures, status codes, network causes, and command fingerprints.

Worker attempts are operational records and telemetry, not user audit rows. The current audit actor-type constraint remains unchanged.

## Outbox expansion and delivery worker

### Dedicated process

M11 adds `apps/worker` as a package-owned Node process and Docker service. It owns no HTTP management API and does not import browser/server transport handlers.

Shared contracts, projector, repositories, crypto, SSRF validator, transport interfaces, and Effect services live in `@framerfordevs/api`. `apps/worker` owns process startup, signal handling, and internal liveness/readiness exposure. It creates one worker `ManagedRuntime` for the process and disposes it once.

The API server composes only webhook management/read services. It never starts background delivery fibers and never performs destination HTTP calls. This permits independent worker scaling and prevents slow or hostile destinations from consuming API request capacity.

### Dispatcher transaction

The dispatcher repeatedly claims a bounded batch of due unprocessed outbox rows:

```sql
... WHERE processed_at IS NULL AND available_at <= now()
ORDER BY available_at, id
FOR UPDATE SKIP LOCKED
LIMIT 100
```

For each row, in the same short transaction it:

1. Strictly decodes the event type/payload.
2. For a supported external type, inserts the immutable `publication_event` body if absent.
3. Selects exact-environment endpoints that are currently enabled, were enabled by event time, and have a current open event subscription activated no later than event time.
4. Inserts one `initial` queued delivery per eligible endpoint with conflict-safe uniqueness.
5. Marks the outbox row processed.

For an explicitly known internal type, it marks processed without creating a public event. For an unknown/corrupt supported event it rolls back and leaves the row pending.

Crash before commit leaves no event/delivery/processed marker. Crash after commit leaves all of them. No HTTP occurs in this transaction.

### Attempt claim

Workers claim enabled endpoint rows with due deliveries using `FOR UPDATE SKIP LOCKED`. A short transaction:

1. Recovers an expired endpoint/delivery lease and marks the prior `started` attempt `abandoned` if needed.
2. Selects the oldest due delivery for that endpoint.
3. Assigns a random lease token with 30-second expiry.
4. Moves the delivery to `delivering`.
5. Creates the `started` attempt with the next number; only its lease-guarded terminal finalization may update it.
6. Commits and releases row locks.

Only one attempt per endpoint is in flight across worker processes. A slow endpoint therefore consumes one worker slot but cannot block claims for unrelated endpoints. Failed old deliveries do not impose strict ordering on later ready events; every event retains aggregate/publication sequences so consumers can reason about order.

### Send and finalize

Outside the transaction the worker:

1. Decrypts the immutable destination and active/retiring secrets.
2. Revalidates URL/hostname/DNS and chooses a pinned public address.
3. Signs the exact canonical body using current attempt timestamp.
4. Sends one bounded HTTPS POST.
5. Classifies the outcome.
6. In a short transaction, inserts/finalizes attempt metadata and updates the delivery only when endpoint/delivery lease tokens still match.
7. Clears endpoint lease ownership.

A stale worker cannot overwrite a newer recovery outcome. If the destination accepted the event but the worker died before finalization, lease recovery records abandonment and sends a new attempt. This is the explicit at-least-once duplicate boundary.

### Polling, bounds, and shutdown

Proposed source-controlled initial bounds:

- Dispatcher batch: 100 outbox rows
- Attempt concurrency: 32 endpoints per worker process
- One in-flight attempt per endpoint
- Poll interval: 250 ms when work exists, bounded jittered idle backoff to 2 seconds
- Lease: 30 seconds
- DNS timeout: 2 seconds
- Connect/TLS timeout: 3 seconds
- Total attempt timeout: 10 seconds
- Maximum canonical event body: 128 KiB
- Maximum attempts per delivery run: 12

The worker has its own explicit small PostgreSQL pool budget, proposed maximum 5, so independently scaled workers cannot silently consume the API pool allocation. Deployment documentation calculates total API + worker connections against database capacity.

SIGTERM/SIGINT stops new claims, interrupts polling schedules, waits at most the shutdown budget for active attempts, and releases what it can. Any unfinalized persisted lease remains recoverable. Telemetry export failure never stops delivery or creates unbounded buffering.

## Retry, permanent failure, dead letter, and replay

### Outcome policy

- Any `2xx`: success
- `408`, `425`, `429`: retryable
- Any `5xx`: retryable
- DNS no-answer/transient resolver failure, connection reset/refused, timeout, and transient TLS/network failures: retryable
- Any other `4xx`: permanent dead letter after the first attempt
- Any `3xx`: permanent dead letter; redirects are never followed
- Unsafe URL/DNS resolution, encryption corruption/missing key, malformed canonical event, or internal signing invariant: fail closed. Security/configuration failures are terminal for that run and observable; defects do not send an approximate request.

A successful `2xx` is final even if the response body is malformed because M11 defines no response-body protocol.

### Backoff and `Retry-After`

After retryable attempt number `n`, the unjittered cap is:

```text
min(6 hours, 30 seconds × 2^(n - 1))
```

The scheduled delay uses equal jitter: half the cap plus an injected uniform value over the remaining half. This prevents zero-delay storms while preserving exponential spread. Clock and Random are injected for deterministic tests.

For `429` or `503`, a valid delta-seconds or HTTP-date `Retry-After` is parsed. The next delay is at least the jittered backoff and at least the valid server delay, capped at 24 hours. Malformed, negative, or excessive values are ignored/capped safely.

After 12 attempts, the run becomes `dead_letter` with reason `retries_exhausted`. Permanent outcomes become dead letter immediately with their fixed reason. Dead letters are never retried automatically.

### Manual replay

An authorized unrestricted user with `webhook.manage` may replay a supported event to an enabled endpoint in the same environment.

Replay:

- Requires a fresh command UUID and canonical fingerprint
- Encodes decoded Effect Schema inputs back to inert plain transport JSON before canonicalization; it never hashes `Schema.Class` instances or runtime wrapper identity directly
- Includes a fingerprint format version, operation, actor, complete tenant/environment scope, event ID, endpoint ID, and optional source delivery ID in the authority hash
- Is idempotent for matching command retries and rejects incompatible command reuse
- Creates a new `webhook_delivery` of kind `replay`
- References the original immutable `publication_event`
- Preserves original event ID, time, type, subject, data, body bytes, and body hash
- Targets the endpoint's current destination and current secret lifecycle
- Starts attempt numbering at one for the new delivery run
- Adds only delivery/attempt/replay headers outside the signed body
- Is rate-limited, confirmed in UI, and audited once

Replay is allowed from event history even if no initial delivery existed, which permits intentional recovery of pre-M11 publication events after the dispatcher has canonically projected them.

Approved closed central policy: `webhook.replay.user`, 30 replay commands per user per minute with burst 5. The developer selected the stricter burst during final readiness. Endpoint and environment limits additionally bound fan-out.

## Authorization and tenant isolation

- Every dashboard procedure requires the existing Better Auth session.
- Owner and developer roles retain `webhook.read`/`webhook.manage`; all other initial roles are denied.
- Both actions join the policy service's environment-wide unrestricted-locale set. A selected/none-locale developer cannot inspect or manage a webhook that may receive other locales.
- Reads require `webhook.read`; create/update/enable/disable/subscription/secret/mapping/replay operations require `webhook.manage`.
- Secrets are never returned by read permission. One-time creation/rotation disclosure requires manage permission and explicit acknowledgement.
- Every repository query derives workspace/environment scope from persisted relationships and uses complete tenant predicates/FKs.
- Foreign/nonexistent project/environment/endpoint/event/delivery/attempt/mapping IDs return non-enumerating `NOT_FOUND`; a known active member denied the action receives `FORBIDDEN`.
- Replay validates event and endpoint environment equality in the database; input cannot inject event body, destination, secret, actor, attempt number, or subscription authority.
- Management API credentials are not accepted by the dashboard oRPC boundary. Their existing webhook scopes remain reserved for a future explicit portable management API and are not silently activated in M11.

## Management contracts and errors

Effect Schema owns branded endpoint, destination, secret, event, delivery, attempt, and mapping IDs plus every input/output union.

Protected operations include:

- Endpoint create/list/get/update/enable/disable
- Subscription complete-set update
- Secret rotation start/activate/cancel/complete
- Route mapping create/list/update/disable
- Event/delivery/attempt cursor lists and exact detail reads
- Manual replay

Lists use bounded opaque scope-bound keyset cursors. Event/delivery views are newest-first with stable `(createdAt, id)` or event-time keys. Attempt lists are ordered by positive attempt number.

Proposed new centralized error codes:

- `WEBHOOK_DESTINATION_UNSAFE` → 422
- `WEBHOOK_ENDPOINT_LIMIT_REACHED` → 409
- `WEBHOOK_SECRET_ROTATION_CONFLICT` → 409
- `WEBHOOK_REPLAY_NOT_ALLOWED` → 409
- `WEBHOOK_EVENT_INVALID` → sanitized 500/503 internal path; not exposed with payload details

Existing `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `VERSION_CONFLICT`, `CONFLICT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, and `INTERNAL_ERROR` remain authoritative where applicable.

No error echoes a URL, host/path/query, DNS answer, event body, signature, secret/fingerprint, ciphertext, response body/header, raw network cause, SQL, or stack.

## Effect and package architecture

### Pure and boundary modules

- `contracts/webhooks.ts`: event/subscription/endpoint/delivery/attempt/mapping schemas and management envelopes
- `lib/publication/event.ts`: strict outbox-to-CloudEvents projection and canonical serialization
- `lib/webhook/signature.ts`: signing and framework-neutral verification
- `lib/webhook/destination.ts`: URL normalization and IP-policy decisions over injected DNS answers
- `services/webhook/crypto.ts`: random secret generation and AES-GCM key-ring adapter
- `services/webhook/transport.ts`: DNS/TLS/pinned HTTPS adapter
- `services/webhook/repository.ts`: management and read persistence
- `services/webhook/worker-repository.ts`: claim/lease/finalize persistence
- `services/webhook/event-projector.ts`: replaceable Effect service over the pure projector
- `operations/webhook/api.ts`: named management/read/replay operations
- `operations/webhook/worker.ts`: named dispatcher/attempt/recovery loops

Pure modules import no Drizzle, Express, Better Auth, environment config, React, or process-global runtime.

### Layers and runtimes

Clock, Random, DNS resolver, transport, crypto key ring, projector, database, logger, and telemetry are Context services with production and deterministic test Layers.

`apps/server` extends `ApplicationLive` with webhook management services only. `apps/worker` composes a worker-specific long-lived Layer and `ManagedRuntime` once. There is no request/job-local runtime, no business-layer `Effect.run*`, no raw Promise/error leak, and no local production `Effect.provide` inside operations.

Stable Drizzle remains Promise-native inside repository adapters and is wrapped with `Effect.tryPromise`. Expected destination/crypto/database outcomes are typed; defects and interruption remain distinct.

### Turborepo and deployment boundaries

- No new shared package is required.
- `apps/worker` owns build/check/test/start tasks and declares only package-owned dependencies.
- Root scripts continue delegating through Turborepo.
- Docker Compose gains an independently health-checked worker service after the developer-controlled migration/configuration gate.
- Production worker enablement is rollout-gated by validated configuration; disabling the API route does not start webhook delivery in the server.

## Dashboard UX

A protected non-nested route such as `/projects/{projectId}/webhooks` provides a dedicated Webhooks workspace rather than overloading the project settings page.

### Endpoint management

- Endpoint cards show name, enabled state, masked destination origin, subscriptions, rotation state, last outcome, and dead-letter count in text.
- Create/edit dialogs use semantic labelled fields, strict URL feedback, supported-event checkboxes, and authority acknowledgement.
- One-time secret display uses the existing acknowledgement/copy pattern and cannot be reopened.
- Disable, destination replacement, subscription removal, and early secret retirement explain queued/in-flight consequences before confirmation.
- Rotation UI explicitly separates “Generate next secret” from “Activate overlap” and displays the fixed overlap end time.

### Deliveries and dead letters

- Filters include endpoint, event type, and fixed status; URL state is validated and query-key complete.
- Rows show event time, event ID, exact locale when present, aggregate/publication sequences, attempts, next retry, and final outcome.
- Detail shows the canonical content-free event JSON and immutable attempt timeline.
- No signature/request headers, secret IDs/fingerprints, destination path/query, DNS answer, or response body is shown.
- Dead-letter replay requires explicit confirmation and explains that event ID is preserved for consumer idempotency.

### Invalidation mappings

- Mapping forms select event types, collection, optional entry/locale, exact route, and semantic tags.
- The UI describes collection versus exact entry/locale matching and never claims to validate a framework cache.
- System tags are previewed separately and cannot be edited.

### TanStack and accessibility behavior

- `_auth.beforeLoad` protects the route.
- Project, access, endpoints, mappings, and first delivery page begin in parallel after project authority resolves.
- Query keys contain project/environment/filter/cursor authority and never secrets, full URLs, event bodies, or signatures.
- Mutations invalidate only affected endpoint/mapping/delivery/access summaries.
- Semantic links are used for navigation and buttons for actions.
- Dialog focus, destructive confirmations, labels/descriptions/errors, live regions, headings, table/list semantics, keyboard operation, visible focus, and status text are covered.
- Status is never color-only; long IDs/JSON wrap or scroll within bounded regions; loading text uses `…`.
- Automated axe and keyboard/focus coverage includes one-time secret, rotation, disable, dead letter, replay, and invalidation forms.

## Observability and operations

Named spans cover:

- Outbox claim/decode/project/expand
- Endpoint/subscription/mapping management
- Secret encryption/decryption/rotation lifecycle
- Delivery claim and stale-lease recovery
- Destination validation and DNS classification
- Signing, HTTPS attempt, classification, and finalization
- Manual replay authorization/persistence

Safe logs/spans may include stable project/environment/event/endpoint/delivery/attempt IDs, supported event type, replay flag, attempt number, aggregate/publication sequence, fixed status/outcome, duration, queue-age bucket, and retry-delay bucket.

They exclude event body/data, URL/origin/host/path/query, DNS addresses, semantic tags/routes, signatures, secret/fingerprint/key/ciphertext, request/response headers/bodies, raw errors, user identity, and content/schema hashes.

Bounded metrics include:

- Undispatched outbox count/oldest-age bucket by supported/internal/invalid class
- Canonical event projection outcome
- Delivery queue age by event type and initial/replay
- Attempt count and duration by event type, initial/replay, outcome, and HTTP status family
- Retry scheduled and delay bucket
- Dead letters by event type and fixed reason
- Lease recovery/abandonment
- Destination-policy rejection category
- Secret rotation lifecycle result
- Replay request outcome
- Worker active slots, poll result, and graceful-shutdown outcome

No tenant/resource/host/route/tag identity appears as a metric label. Queue age, dead letters, repeated destination-policy failures, and worker/database readiness are designed for M15 alert thresholds.

Worker readiness requires database connectivity, schema availability, and all referenced encryption key IDs. Liveness does not perform external DNS/HTTP. Detailed diagnostics remain internal/operator-only.

## Security and threat model

| Threat/failure                          | Control                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Draft/content leak                      | Only allowlisted publication events; schema-backed content-free envelope; forbidden-key tests        |
| Cross-tenant endpoint/event replay      | Complete tenant FKs/predicates and event-endpoint environment equality                               |
| Unauthorized management                 | Better Auth session plus default-deny `webhook.read/manage`; unrestricted locale authority           |
| Secret/database disclosure              | 32-byte secrets, AES-256-GCM, AAD scope binding, one-time display, masked UI, redaction              |
| Destination URL contains hook token     | Full URL encrypted; only masked origin returned/logged; no headers/body storage                      |
| SSRF to private/internal service        | HTTPS/443 only, hostname policy, all-answer global-IP validation, send-time recheck, pinned lookup   |
| DNS rebinding/TOCTOU                    | Validated address is supplied directly to connection lookup; original host retained only for TLS/SNI |
| Redirect bypass                         | Redirects disabled; 3xx terminal                                                                     |
| Proxy/credential/header smuggling       | Ignore proxy env; fixed headers; no cookies/custom auth/userinfo                                     |
| Slow/large destination                  | 10-second total timeout, no response-body storage, one in-flight per endpoint, global bound          |
| Broken endpoint exhausts workers        | Independent endpoint leases, bounded retries, jitter, dead letter, endpoint/environment limits       |
| Crash loses event                       | Transactional outbox; atomic projection/fan-out; expired lease recovery                              |
| Crash after successful send duplicates  | Stable event ID and explicit at-least-once consumer idempotency                                      |
| Stale worker overwrites recovery        | Random lease tokens in guarded finalize updates                                                      |
| Signature tampering                     | HMAC-SHA-256 over exact raw body/id/timestamp, constant-time comparison                              |
| Captured request replay                 | Timestamp tolerance plus injected atomic event-ID reservation                                        |
| Rotation outage                         | Pending-install phase then bounded dual-signature overlap                                            |
| Compromised old secret accepted forever | Fixed 24-hour overlap and ciphertext destruction/retired state                                       |
| Replay floods destination               | Manage authorization, confirmation, closed rate limit, command idempotency, endpoint serialization   |
| Payload/log/metric leakage              | No content/header/signature storage; recursive redaction; fixed labels; explicit forbidden fields    |
| Subscription changed during backlog     | Event-time intervals plus current enabled state; queued cancellation on removal/disable              |
| Mapping changed before retry            | Routes/tags snapshotted atomically into outbox and canonical event body                              |

## Performance and reliability

- Publication adds one bounded indexed invalidation-mapping read before its existing outbox insert; no network/crypto is added.
- Dispatcher and claims select only bounded columns and use partial indexes.
- Worker transactions contain no DNS/HTTP and hold row locks only during claim/materialize/finalize.
- One endpoint cannot occupy more than one in-flight slot per worker cluster. This intentionally limits a 20 ms single destination to a theoretical ceiling near 50 attempts/s; the initial acceptance target of at least 25 attempts/s reserves operational headroom. Raising per-endpoint concurrency changes receiver pressure, lease recovery, fairness, and ordering behavior and requires measured evidence plus a design amendment.
- The 32-slot scheduler is work-conserving but offers no workspace-weighted QoS in M11. A workspace with many projects/endpoints may temporarily occupy a disproportionate share; M15 owns measured multi-tenant SLOs and any weighted scheduling/quota design.
- Event projection is done once; retries read exact stored bytes.
- Attempts store metadata only, preventing response/log amplification.
- Worker and API database pools are separately bounded and observed.
- PostgreSQL remains sufficient for initial volume and preserves atomic authority. Broker adoption requires measured queue/lock evidence and a new decision.

Proposed local production-build baselines with PostgreSQL on the Docker host, worker pool max 5, worker concurrency 32, and a controlled TLS destination:

| Scenario                |                                           Load | Target                                                    |
| ----------------------- | ---------------------------------------------: | --------------------------------------------------------- |
| Canonical expansion     |   10,000 supported outbox events, no endpoints | drain ≤ 30 s, zero loss/duplicates                        |
| Healthy fan-out         | 2,000 events × 5 endpoints = 10,000 deliveries | drain ≤ 120 s, ≥99.5% first-attempt success               |
| Single healthy endpoint |      1,000 events at 20 ms destination latency | sustained ≥ 25 attempts/s, bounded queue/memory           |
| Slow isolation          |    one 10 s endpoint plus nine 20 ms endpoints | healthy endpoints continue; no pool/slot starvation       |
| Retry storm             |                       5,000 retryable failures | all scheduled once with bounded jitter; no hot polling    |
| Crash recovery          |      repeated kills before/after send/finalize | no lost event; duplicates retain event ID; leases recover |

These numbers are approval items and will be recorded as separate gates rather than collapsed into one headline result. M15 later validates combined authoring/publication/Delivery/webhook soak behavior and production SLOs.

## Test and coverage plan

Tests map one-to-one to every approved requirement and use deterministic Clock, Random, DNS, transport, crypto, and repository Layers.

### Contracts, event mapping, and property tests

- Branded webhook/event/delivery/attempt/mapping IDs reject interchange
- Exact supported event registry; deleted/internal/unknown types not subscribable
- Existing M5/M8 outbox payload compatibility
- Schema publish, initial publish, republish, and unpublish event fixtures
- Exact English/Hindi/Gujarati locale isolation
- Correct event ID/time/source/type/subject/data and aggregate/publication sequences
- Unpublish uses all published field IDs; publish uses deterministic changed fields
- System tag correctness and reserved-prefix rejection
- Semantic tag/path normalization, deduplication, matching, and count/byte limits
- Collection/entry/locale/event mapping combinations
- Canonical key order and byte-stable body/hash fixtures
- 128 KiB below/at/above boundaries without truncation
- Forbidden payload keys/values property tests for content, actors, credentials, URLs, names, API keys, commands, and request data
- CloudEvents and management envelope schema conversion snapshots

### Crypto and verification

- 32-byte secret entropy/format and one-time disclosure
- AES-GCM encrypt/decrypt, AAD scope swap rejection, nonce/ciphertext corruption, missing key, key-ring rotation
- Standard signing vectors over exact raw bytes
- Valid active and overlap signatures
- Tampered body/ID/timestamp/signature and wrong secret rejection
- Malformed/multiple/oversized header rejection
- Exact ±5-minute timestamp boundaries with TestClock
- Constant-time comparison path coverage
- Atomic replay reservation success/duplicate/race behavior
- Parsed/reserialized-body mismatch rejection
- Secret rotation start/activate/cancel/complete and fixed overlap boundaries
- Old secret accepted only during overlap; ciphertext absent after retirement

### SSRF and HTTP transport

- HTTPS-only, port, userinfo, fragment, URL length, IDNA, control, and malformed URL cases
- IPv4 decimal/octal/hex ambiguity rejection by URL parser/profile
- IPv6, IPv4-mapped IPv6, loopback, private, link-local, CGNAT, multicast, unspecified, reserved, documentation, and mixed-answer DNS rejection
- All-global bounded A/AAAA acceptance
- Platform/internal hostname denylist
- DNS rebinding simulation proves pinned validated address use
- Redirects never followed, including public-to-private redirects
- TLS hostname/certificate validation and SNI preservation
- Proxy environment ignored
- DNS/connect/header/total timeout behavior
- Response body never stored/logged and large response remains bounded
- Fixed request headers only; no cookies/custom credentials
- Safe fixed network error categories and complete redaction

### Effect services and operations

- Replaceable Clock/Random/DNS/transport/crypto/repository/telemetry Layers
- Named management, projector, claim, send, finalize, recovery, and replay operations
- Expected errors remain typed; defects/interruption are distinct
- Foreign Promise/driver/network errors translate only at adapters
- Telemetry/export failure cannot fail publication/worker work
- Graceful interruption stops claims and leaves recoverable leases
- No local runtime or business-layer `Effect.run*`

### PostgreSQL integration and concurrency

- Endpoint/destination/subscription/secret/mapping tenant constraints
- Cross-workspace/project/environment IDs never compose
- Endpoint/environment limits and optimistic conflicts under concurrency
- Subscription interval non-overlap and event-time eligibility
- Disable/re-enable/update destination/subscription cancellation semantics
- Atomic route/tag snapshot with schema publish/publish/unpublish outbox writes
- Draft save/restore creates zero publication events
- Schema publish, entry publish, and entry unpublish each add named failure-injection boundaries for invalidation mapping load, deterministic projection/deduplication, event-size validation, and the pre-outbox boundary; every injected failure rolls back all preceding publication, Delivery, sequence, audit, outbox, and receipt state
- Maximum configured mappings retain bounded transaction/lock duration and use the intended matching index
- Dispatcher `SKIP LOCKED` across two processes produces one canonical event and one initial delivery per endpoint
- Crash before/after dispatcher commit
- Endpoint claim fairness, one in-flight invariant, and expired lease recovery
- Crash before send, after send, before finalize, and after finalize
- Guarded stale-token finalization cannot overwrite recovery
- Retry scheduling and exact attempt/dead-letter transitions
- Manual replay fingerprints are computed only after Effect Schema encoding to plain transport JSON
- Matching replay command retry succeeds; reuse with changed actor, tenant/environment, event, endpoint, or source delivery returns the command conflict and creates no second replay/audit
- Disable/removal/update races with claim/send
- Destination/secret ciphertext immutability and destruction lifecycle
- Append-only canonical event behavior and exactly-once terminal attempt finalization
- Representative `EXPLAIN (ANALYZE, BUFFERS)` for outbox, subscriptions, queue claim, lease recovery, delivery history, attempts, and route matching
- Complete fixture cleanup without mutating immutable publication history

### Authorization and API

- Owner/developer all-locale allow; every other role deny for read/manage
- Selected/none-locale developer denied environment-wide webhook actions
- Anonymous denial for every protected procedure
- Known denied versus foreign/nonexistent non-enumeration
- Read cannot obtain/decrypt secret/full URL
- Manage acknowledgement and one-time disclosure
- Cross-environment event replay denied
- Input cannot inject body/destination/secret/attempt/actor/scope
- Cursor tamper/cross-scope/expiry/limit behavior
- Every success/failure uses the application envelope and centralized status mapping
- Audit action/resource/request correctness and secret/body/URL absence
- Replay rate limit and stable 429 behavior

### Worker and HTTP destination behavior

- 2xx success for every status in range
- Retryable 408/425/429/5xx and permanent other 4xx/3xx matrix
- Valid/malformed/bounded `Retry-After`
- Equal-jitter deterministic lower/upper boundaries for all 12 attempts
- Slow destination cannot block unrelated endpoint
- Disabled endpoint receives no new send
- Event/environment subscription exactness
- Active+retiring dual signature and current destination selection
- Stable body/event ID across retries/replay; new delivery/attempt metadata
- No delivery ordering claim, but aggregate/publication sequence values remain exact under concurrency
- Worker rollout disabled/enabled, readiness, liveness, shutdown, and database/key failure behavior

### UI, Router, Query, and accessibility

- Non-nested route tree and auth protection
- Endpoint create/edit/disable/enable and subscription controls
- One-time secret cannot reappear after acknowledgement
- Complete two-phase rotation UX and overlap status
- URL masking and no secret/body in query keys or analytics
- Delivery filters, pagination, retry/dead-letter statuses, attempt timeline
- Event payload viewer contains only approved content-free fields
- Replay confirmation/idempotency guidance
- Mapping collection/entry/locale/event matching guidance and validation
- Loading/empty/error/forbidden/limit/conflict states
- Targeted cache invalidation, no broad project refetch
- Keyboard/focus/live-region/labels/headings/status text and automated axe
- Long IDs/JSON/paths do not overflow or hide actions
- Initial unrelated route bundle does not eagerly load Webhook workspace code

### Load and resilience gates

Each approved profile is a separate named script/report/checklist gate:

- 10,000-event no-endpoint dispatcher drain
- 10,000 healthy fan-out deliveries
- Single-endpoint throughput and bounded queue/memory
- Slow endpoint isolation
- Retry storm scheduling/no hot polling
- Two-worker claim uniqueness
- Simultaneous sustained outbox production, dispatcher expansion, and attempt claims across at least two worker processes with fast/slow endpoints; reconcile canonical events/deliveries while asserting no deadlocks, hot polling, unbounded lock waits/pool waiters, or indefinitely starved ready endpoint
- Multi-project noisy-neighbor characterization records slot share and queue latency without claiming a workspace fairness SLO in M11
- Repeated crash recovery before/after send/finalize
- Disable/subscription/destination-update race profile
- Database restart and worker recovery
- Encryption-key missing readiness failure without event loss
- Docker key-ring continuity: server-created ciphertext is consumed by a separately built worker, survives both process/image restarts, remains readable after adding a new active key, uses that key for new ciphertext, and makes worker readiness fail closed if a still-referenced old key is removed
- Key-ring acceptance inspects behavior and file/image/log absence without printing or reading secret values
- Queue/attempt count reconciliation, pool/lease/transaction/heap/log/metric post-run invariants

Expected duplicates after injected post-send crashes are reconciled by stable event ID and are not mislabeled as lost/corrupt events.

### Coverage gates

Behavior-led minimum M11 targets:

- Event contracts/projector/canonical serializer, signature helper, retry schedule, route/tag matcher, and destination pure policy: 100% statements, branches, and functions where deterministically measurable
- Webhook management repository: at least 90% statements plus explicit coverage of every supported lifecycle, authorization, conflict, pagination, replay, and cancellation outcome. During final readiness the developer approved recording measured branch coverage instead of manufacturing database-driver/corruption mocks solely to reach the original 80% branch target.
- Webhook worker repository: at least 90% statements and 80% branches, plus explicit coverage of every claim, recovery, stale-token, and terminal-finalization outcome
- Worker orchestration: every claim/send/finalize/interruption branch
- Browser-safe validation/query helpers: 100% statements/branches
- Webhook UI: interaction and axe coverage for every endpoint/rotation/delivery/dead-letter/replay/mapping state
- Existing workspace configured gates and all M1–M10 regression suites must not regress

Final readiness runs `pnpm run ready`, production/full audits, `git diff --check`, read-only PostgreSQL catalog/invariant/plan checks, worker/server/web production builds, Docker health/readiness, secret/image-context inspection, and every separate M11 load/resilience profile.

## Migration and rollout strategy

M11 requires a database migration. The agent must not generate, edit, apply, push, or execute it.

After design approval:

1. Update only the approved Drizzle schema and foundational contracts.
2. Stop at the developer-controlled migration gate.
3. Ask the developer to generate only:

```bash
pnpm --filter @framerfordevs/db db:generate --name=add_webhook_delivery_system
```

4. Inspect the complete developer-generated SQL/snapshot before any application. Build an explicit dependency-order checklist for all eight new tables and every altered outbox constraint: each referenced primary/unique authority must exist before its foreign key, reciprocal endpoint/destination authority must be executable, and no destructive, secret-bearing, migration-time network/encryption, or unexpected backfill statement may exist. The agent must not silently edit or rewrite the generated migration.
5. If inspection passes, ask the developer—not the agent—to apply it separately:

```bash
pnpm --filter @framerfordevs/db db:migrate
```

6. If application fails, stop and verify migration journal, table, constraint, and index rollback read-only before any developer retry. Never rewrite an applied migration.
7. Wait for developer confirmation that the database is ready before repository/worker tests.

Expected migration behavior:

- Add only the approved webhook/invalidation/event/delivery tables and indexes plus the bounded outbox payload-check adjustment.
- Backfill no endpoint, secret, route, delivery, or attempt rows.
- Preserve all existing outbox event IDs/payloads/lifecycle values.
- Add no migration-time network/encryption call.
- Require no secret value in SQL.
- Keep existing immutable publication triggers/artifacts untouched.
- Order every FK after the primary/unique constraint it references, including newly added uniqueness on an existing table.
- Support the endpoint-creation staging invariant: current destination may be null only for a disabled endpoint and every enabled endpoint must reference an in-scope immutable destination revision.

Rollout order:

1. Developer configures the persistent encryption key ring and worker pool/enable settings without exposing values.
2. Apply the developer-reviewed migration.
3. Deploy API/worker-compatible code with worker delivery disabled.
4. Verify schema, pool budget, and the complete Docker key-ring continuity path: server encrypts, the independently built worker decrypts/sends, both restart without losing decryptability, new active-key writes remain backward-readable, removal of a referenced key fails readiness closed, and no key bytes enter output or images.
5. Enable the worker. It canonically drains historical supported events but creates no automatic delivery to endpoints whose enable/subscription time is later than event time.
6. Developers may manually replay selected historical events after creating endpoints.
7. Verify queue age, canonical counts, zero duplicate initial deliveries, and no open/stale transactions before handoff.

No direct data backfill invents endpoint subscriptions or sends historical events automatically.

## Retention and privacy

Until M15 approves a cross-system policy:

- Outbox, canonical publication events, deliveries, attempts, replay commands, audits, destination revisions, and lifecycle metadata have project-lifetime retention.
- No cleanup job deletes event/delivery/attempt records in M11.
- Retired/canceled secret ciphertext is destroyed while non-secret lifecycle/fingerprint metadata remains.
- Destination ciphertext remains while referenced by immutable delivery history; access remains restricted.
- Response bodies, request/response headers, signatures, DNS answers, and raw errors are never retained.

M15 must reconcile outbox/event/delivery/attempt/audit retention with backups, privacy deletion, command idempotency, dead-letter operations, and incident forensics before finite cleanup is enabled.

## Decision-standard review

### Product-goal alignment

The design reliably tells developer-owned frontends which published schema/entry/locale state changed while preserving renderer, framework, cache, and hosting independence. Exact routes/tags are hints/data, not a proprietary invalidation claim.

### Correctness

Stable outbox identity, one-time canonical projection, atomic fan-out, immutable attempts, event-time subscription boundaries, snapshotted invalidation mappings, guarded leases, and exact sequence fields prevent event loss, cross-locale claims, and mutable replay drift.

### Security

Default-deny authorization, environment scope, encrypted destinations/secrets, two-phase rotation, fixed signatures, replay reservation, strict SSRF validation with pinned DNS, no redirects/proxies/custom headers, resource bounds, and comprehensive redaction address the highest-risk boundary introduced by outbound webhooks.

### Reliability

PostgreSQL outbox/fan-out transactions, `SKIP LOCKED`, endpoint leases, network-outside-transaction sends, deterministic retries, stale-worker guards, dead letters, manual replay, independent worker deployment, and crash tests provide at-least-once behavior without coupling API availability to destinations.

### Performance

Bounded indexed mapping/subscription/queue reads, one canonical serialization, metadata-only attempts, endpoint isolation, separate pool budgets, and explicit dispatcher/fan-out/retry load gates keep publication and worker costs measurable.

### UX

A dedicated accessible workspace provides safe endpoint setup, one-time secrets, understandable two-phase rotation, exact subscriptions, visible retries/dead letters, replay guidance, and honest framework-neutral route/tag configuration.

### DX

CloudEvents-shaped payloads, Standard Webhooks-compatible headers, stable IDs/sequences, a raw-body verifier, deterministic event schemas, and framework-neutral invalidation metadata make consumers portable. M12 can publish/package these contracts without redesign.

### Observability

Queue age, attempts, latency, retries, dead letters, lease recovery, SSRF rejection, replay, and worker readiness are measured with request/trace correlation and fixed labels while excluding payloads, destinations, and secrets.

### Maintainability and future compatibility

Focused projector/crypto/transport/repositories, a dedicated worker process, generic outbox authority, environment-bound endpoint model, and stable system/semantic tags allow future providers, deleted events, dependency manifests, visual routes, and public tooling to extend behavior without replacing publication/event identity.

## Approval requested

Developer approval authorizes these material decisions before implementation:

1. Existing outbox UUID as permanent external event ID
2. External M11 registry limited to schema publish and exact-locale entry publish/unpublish
3. CloudEvents 1.0-compatible deterministic 128 KiB content-free envelope
4. Canonical event materialization once, with exact body reused by retries/replay
5. System tags plus bounded semantic tags and exact manual route mappings snapshotted in publication transactions
6. Dedicated environment-bound endpoints and event-time subscription intervals
7. Encrypted immutable destination revisions and endpoint-specific encrypted signing secrets
8. Persistent deployment key ring with no process-local fallback
9. Two-phase rotation and 24-hour dual-signature overlap
10. Standard Webhooks-compatible signing and raw-body/replay-aware verification helper
11. Strict HTTPS/443 SSRF policy, all-address DNS validation, send-time revalidation, pinned connection, and no redirects/proxies
12. Dedicated `apps/worker`, not API-server background fibers
13. PostgreSQL atomic expansion, `SKIP LOCKED`, 30-second leases, and one in-flight attempt per endpoint
14. Twelve-attempt bounded exponential equal-jitter retry with documented HTTP classification and `Retry-After`
15. Immutable attempts, dead letters, and authorized command-idempotent manual replay
16. Owner/unrestricted-developer-only environment-wide webhook authority
17. Proposed endpoint, mapping, concurrency, timeout, pool, and load limits, including intentional one-in-flight single-endpoint throughput and no M11 workspace-weighted scheduler SLO
18. Project-lifetime provisional event/delivery/attempt retention, with workspace quotas, tenant fairness, and holistic cleanup deferred to M15 without permitting silent event loss
19. Developer-controlled migration `add_webhook_delivery_system`, generated and inspected for FK dependency order before separate developer application
20. Plain transport-JSON replay fingerprints, named publication invalidation failure stages, Docker key-ring continuity, and simultaneous dispatcher/attempt contention gates
21. Complete maximum-coverage/security/concurrency/accessibility/load gates described above
