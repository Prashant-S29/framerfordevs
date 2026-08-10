# Milestone 5 versioned collection schema-engine design

**Status:** Approved for implementation by the developer

**Date:** 2026-08-01

## Decision summary

Milestone 5 will add environment-scoped CMS collections with stable collection and field identities, one mutable optimistic draft schema, immutable published schema revisions, deterministic change classification, and atomic schema-publication events.

The design uses:

- Immutable UUIDv7 collection, field, schema-revision, and outbox-event identities
- Immutable lowercase developer-facing collection keys
- Stable field IDs separated from mutable field API keys and display labels
- A bounded relational current draft plus immutable relational publication snapshots
- One schema-head row per collection for draft version and published pointers
- Deterministic schema validation, canonical hashing, and change classification
- Exact acknowledgement of every potentially breaking or breaking change before publication
- Project/environment tenant foreign keys and server-side default-deny authorization
- Short transactions with project share locks, collection write locks, optimistic versions, audits, and outbox writes
- A generic transactional outbox introduced now for `cms.schema.published` and reused by later entry publication/webhook milestones
- A basic accessible schema builder with authoritative server state and targeted TanStack Query invalidation

The engine remains independent of entries, generated forms, delivery, and visual sites. Future resources bind to stable collection and field IDs, not labels or mutable API keys.

## Source hierarchy and compatibility constraints

This design follows `product.md`, `prd/cms.md`, every rule linked by `knowledge_base/rules/index.md`, and the Milestone 5 acceptance criteria before skill defaults.

Materially relevant installed guidance was reviewed for Effect, Drizzle, PostgreSQL, Express, security hardening, TanStack Start/Router/Query, Turborepo, shadcn/ui, React performance/composition, Better Auth boundaries, and web-interface accessibility.

Two skill recommendations are intentionally overridden by approved repository decisions:

- The repository remains on stable `effect@3.22.0`; it will not follow generic skill guidance to install Effect beta APIs.
- Stable Drizzle remains Promise-native inside focused repository adapters; the project will not adopt unstable Effect SQL or change migration tooling in M5.

The installed stable package declarations and existing repository patterns remain the executable API contract. The agent will not generate, apply, push, or execute a migration.

## Scope

### Included

- Environment-scoped CMS collections under the existing `main` environment
- Collection display name, immutable API key, and description
- One mutable draft schema per collection with optimistic versioning
- Stable field identities and mutable draft field definitions
- Basic M5 field kinds sufficient to prove schema lifecycle and incompatible type changes
- Field API-key, display-label, required/optional, localized/shared, deprecation, and order metadata
- Draft validation and deterministic comparison with the current published revision
- Immutable published schema revisions and revision-addressable retrieval
- Change classification and exact acknowledgement
- Collection/schema management oRPC procedures and standard response unions
- Audit events and atomic `cms.schema.published` outbox events
- Policy, observability, UI, property, PostgreSQL, API, and accessibility coverage

### Deferred to Milestone 6

- The complete PRD field vocabulary
- Type-specific validation configuration and defaults
- Validation tightening/relaxing and enum-option change classification
- Recursive/cyclic object/list validation with item, depth, and serialized-size bounds
- Rich-text document schema
- External-asset schema
- Enum options
- Object/list nesting and child fields
- Entry-reference targets
- Editor groups, sections, tabs, help text, and role visibility
- Generated entry form controls

### Deferred to later milestones

- Entries, content drafts, revisions, and values
- Content migration execution for breaking schema changes
- Per-locale entry publication and delivery snapshots
- Public Delivery, Preview, and developer-facing Schema APIs
- Outbox workers, webhook subscriptions, retries, and delivery attempts
- Collection archive, restore, and permanent deletion
- User-defined roles or policy DSLs

M5 dashboard procedures remain Better Auth session-authenticated. Existing management credentials retain their schema scopes, but public credential-authenticated management endpoints remain a later API-boundary task.

## Domain terminology and identities

### Collection

A collection is an environment-scoped stable content model identity.

- `CollectionId`: immutable UUIDv7
- `apiKey`: immutable developer-facing identity
- `displayName`: mutable authoring label
- `description`: mutable authoring metadata
- `version`: optimistic metadata version

The collection API key is immutable from creation. Field API-key changes are different: a field retains its stable ID, and changing a published field API key is allowed only through explicit breaking-change publication acknowledgement.

### Collection field

A collection field has three separate identities:

- `CollectionFieldId`: immutable UUIDv7 used by references, future visual bindings, and change tracking
- `apiKey`: mutable JSON/code-generation key
- `displayLabel`: mutable editor label

Field order and label changes never change field identity. Removing a field from the current draft soft-removes its identity; published revisions retain immutable snapshots.

### Draft schema

Each collection has exactly one current mutable draft. The draft is represented by current non-removed `cms_collection_field` rows plus collection metadata and a positive `draftVersion` in the schema head.

A meaningful draft mutation increments `draftVersion` exactly once and writes one audit event. A no-op does neither. The draft is never served as a published schema.

### Published schema revision

Publishing snapshots the collection metadata and active ordered fields into a new immutable `cms_schema_revision` and `cms_schema_revision_field` set.

Published revisions have:

- Immutable `SchemaRevisionId`
- Positive monotonically increasing collection-local sequence
- Canonical SHA-256 schema hash
- Previous/base revision identity when present
- Immutable publication actor/time and idempotency command identity
- Immutable field snapshots tied to stable field IDs

A later draft edit never changes a published revision.

## Collection and field API-key profile

M5 uses a deterministic lowercase snake-case profile for collection and field API keys:

- 1–63 ASCII characters
- Pattern: `^[a-z][a-z0-9_]{0,62}$`
- No consecutive underscores
- No trailing underscore
- No normalization beyond trimming; uppercase input is rejected rather than silently rewritten

Lowercase snake case is portable across JSON, TypeScript property access, OpenAPI, SQL-facing tooling, files, and future SDK languages. Case-variant ambiguity is impossible.

A centralized schema-backed reserved-key registry rejects keys that would collide with platform metadata or unsafe JavaScript object properties. The initial reserved values include:

- `id`, `entry_id`, `collection_id`, `locale`
- `schema_revision`, `publication_id`, `publication_sequence`
- `created_at`, `updated_at`, `published_at`, `_meta`
- `__proto__`, `prototype`, `constructor`

The same runtime contract is used by API validation, browser validation, OpenAPI, and property tests. Database checks enforce the structural lowercase profile; the application owns the evolvable reserved-key registry.

Collection keys are unique within an environment and remain reserved permanently because collection deletion/reuse is not exposed. Active draft field API keys are unique within a collection. Historical revisions may contain earlier keys for the same stable field ID.

## M5 field contract

M5 deliberately proves the schema engine with a small structural field set:

- `short_text`
- `number`
- `boolean`

Every active draft field contains:

- Stable field ID
- API key
- Display label
- Kind
- `required: boolean`
- Localization mode: `localized | shared`
- `deprecated: boolean`
- Dense non-negative position
- Bounded JSON configuration object, which must be empty in M5

At most 100 active fields are allowed per collection. A draft may be empty while being constructed, but publication requires at least one active field.

The database field-kind check reserves the complete PRD literal vocabulary so M6 can add validated type-specific contracts without replacing stable identity. M5 boundary schemas accept only the three implemented kinds. M6 expands the application contract and configuration validator before exposing additional kinds.

Object/list child identities and layout metadata are intentionally not approximated in M5; M6 will extend the field model explicitly rather than storing an unvalidated pseudo-tree.

## Draft mutation model

The API exposes focused commands rather than accepting an arbitrary client-authored schema document:

- Add field: server generates the stable field ID
- Update field: preserves stable ID and may change API key, label, kind, required, localization, or deprecation
- Remove field: soft-removes the current draft field identity
- Reorder fields: accepts the complete active `{ fieldId }` set in desired order

Every field command includes the expected draft version. Collection display-name/description updates include both the expected collection metadata version and draft version because published revisions snapshot that metadata. The repository locks the collection, re-reads the current state, rejects stale versions, validates the full resulting draft, applies the mutation, increments the draft version once, and writes an audit event atomically. A meaningful collection metadata edit also increments the collection metadata version once.

The complete-set reorder contract rejects duplicate, missing, removed, or foreign IDs. Field rows are locked in stable ID order. The applied database keeps active positions constrained to `0..99` with an immediate partial unique index, so there is no out-of-range scratch position for a full 100-field permutation. Reorder therefore excludes the locked active rows from that partial index transaction-locally by setting the complete active set to the valid removed lifecycle state, then reactivates every identity at its unique final dense position before commit. No intermediate state is externally visible; any failure rolls back the lifecycle and positions together. This preserves the applied constraints and stable identities without a follow-up migration.

No-op updates and identical reorder requests return the current draft without version or audit noise.

## Validation and canonical hash

A pure `SchemaEngine` service owns draft validation, canonicalization, hashing input, and change classification. It has no database dependency and is replaceable in tests.

Validation includes:

- Collection and field key/profile rules
- Reserved-key rejection
- Collection-local API-key uniqueness
- Active field count from 1–100 for publication
- Dense unique ordering
- Supported M5 field kinds
- Empty M5 configuration objects
- Stable-ID uniqueness
- Required/localized/deprecated structural consistency
- Bounded labels, descriptions, arrays, issues, and serialized configuration size

Validation issues are schema-backed, path-aware, bounded to 50 returned issues, and use machine codes. Human messages are not used for application branching.

Canonical schema hashing uses a dependency-light deterministic serializer:

1. Schema format version
2. Immutable collection key
3. Current collection display name and description
4. Active fields ordered by position
5. Stable field IDs and normalized structural definitions
6. Recursively sorted configuration object keys

SHA-256 produces a lowercase 64-character hash. Hashes support deterministic retrieval, no-op detection, future ETags/schema locks, and code generation. They are not security secrets.

## Change classification

The server compares the current draft with the current published revision by stable field ID, never by API key or position.

Initial classifications:

| Change                                         | Classification          |
| ---------------------------------------------- | ----------------------- |
| Collection display name or description changed | Non-breaking            |
| Optional field added                           | Non-breaking            |
| Field display label changed                    | Non-breaking            |
| Field order changed                            | Non-breaking            |
| Field deprecated                               | Non-breaking transition |
| Required field changed to optional             | Non-breaking            |
| Required field added                           | Potentially breaking    |
| Optional field changed to required             | Potentially breaking    |
| Field API key changed                          | Breaking                |
| Field kind changed                             | Breaking                |
| Field localization mode changed                | Breaking                |
| Published field removed                        | Breaking                |

M6 extends this table for defaults, validation tightening/relaxing, enum options, nesting, references, and type-specific configuration.

Each change has a deterministic machine code, stable field ID when applicable, classification, bounded safe summary, and `changeId` derived from canonical machine data. Ordering is deterministic by severity, field position/ID, then change code.

The server recomputes changes inside the locked publication transaction. Client-provided classifications are never trusted.

## Publication acknowledgement and idempotency

`PublishCollectionSchemaInput` includes:

- Project, environment, and collection IDs
- Expected draft version
- Expected current published revision ID or `null`
- Client-generated UUID `commandId`
- Exact acknowledged change IDs

All potentially breaking and breaking changes require acknowledgement. Non-breaking changes do not.

If any required change ID is missing, stale, or unknown, publication fails with `SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED` and bounded current change details. This prevents a broad checkbox from silently acknowledging changes introduced after the user reviewed the draft.

The collection-local `commandId` is unique for state-changing publications. Each revision also stores a SHA-256 command fingerprint over the canonical publication authority input and schema hash. Retrying an already successful state-changing command returns the same published revision without another revision, audit row, or outbox event only when the fingerprint matches. Reusing a persisted command ID for incompatible input fails safely.

## Atomic publish workflow

Publishing runs in one short transaction:

1. Acquire the project share lock and collection write lock in the global lock order.
2. Resolve and authorize the exact project/environment/collection without tenant enumeration.
3. Require an active project and enabled CMS capability.
4. Check idempotency replay.
5. Verify expected draft and published revision identities.
6. Load the bounded current draft and current publication.
7. Validate the complete draft.
8. Recompute canonical hash and change set.
9. Verify exact required acknowledgements.
10. Insert the immutable schema revision.
11. Insert immutable revision-field snapshots.
12. Update schema-head published/base pointers without changing the draft version.
13. Insert the immutable audit event.
14. Insert the `cms.schema.published` outbox event.
15. Commit all state or none.

The sequence is the previous collection-local sequence plus one while holding the collection lock. Concurrent different publish commands from the same draft produce one success and one version conflict through `expectedPublishedRevisionId`. The same state-changing command is idempotent.

Publication does not increment `draftVersion` because it does not mutate draft content or collection draft metadata. A draft edit serialized after publication may therefore succeed with its existing expected draft version and correctly become a new change relative to the just-published baseline. Clients still refetch publication/head state after publish, while concurrent publications are protected independently by the expected published revision identity. This avoids a spurious edit conflict after every publication without weakening lost-update protection.

A publication whose canonical hash equals the current published revision is a no-op success returning the current revision; it creates no sequence, audit event, or outbox event. A no-op does not persist or consume its command ID; it is naturally idempotent while the hash remains unchanged.

### Command-provenance retention clarification

Recorded during M8 design: state-changing schema-publication command identity/fingerprint is embedded in the immutable schema revision and follows schema-history retention; there is no separate M5 command-receipt table or cleanup path. M5 no-op command IDs are not durable and retain only the narrower hash-unchanged idempotency described above. M14 owns any holistic change to schema-history, command, audit, outbox, backup, or privacy retention.

## Database model

All IDs use PostgreSQL 18 `uuidv7()`. All timestamps are `timestamp with time zone`. Foreign keys use `on delete restrict`. Every environment-scoped child carries workspace, project, and environment scope through composite foreign keys.

### `cms_collection`

- UUIDv7 primary key
- Workspace, project, and environment IDs
- Immutable API key
- Mutable display name and nullable description
- Positive metadata version
- Creator/changer user IDs
- Created/updated timestamps
- Composite tenant FK to environment
- Unique `(environment_id, api_key)`
- Composite unique identity for scoped children
- Environment keyset-list index `(environment_id, created_at desc, id desc)`
- Actor and foreign-key supporting indexes
- Key/name/description/version checks

### `cms_collection_field`

- UUIDv7 primary key
- Full tenant/environment/collection scope
- Mutable API key, display label, kind, required flag, localization mode, deprecated flag
- Bounded JSONB configuration
- Nullable position and removal actor/time
- Creator/changer and timestamps
- Composite tenant FK to collection
- Composite unique identity for revision snapshots/future bindings
- Partial unique active `(collection_id, api_key)`
- Partial unique active `(collection_id, position)`
- Ordered active-list index `(collection_id, position, id)`
- Lifecycle, key, kind, localization, configuration-object/size, and position checks

Removed fields retain stable identity, have null position, and are absent from the current active draft. No application delete path exists.

### `cms_schema_revision`

- UUIDv7 primary key
- Full tenant/environment/collection scope
- Positive collection-local sequence
- Previous revision ID when present
- Immutable collection key/display-name/description snapshot
- Canonical schema hash
- Unique publication command ID and canonical SHA-256 command fingerprint
- Change-count summaries by classification
- Publisher and publication timestamp
- Composite tenant FK to collection
- Self/tenant FK to previous revision
- Unique `(collection_id, sequence)` and `(collection_id, command_id)`
- Composite unique revision identity for children/head pointers
- Collection timeline index `(collection_id, sequence desc)`
- Hash, command-fingerprint, sequence, count, and previous-pointer presence checks

There is no application update/delete method for revisions.

### `cms_schema_revision_field`

- Full revision, field, collection, environment, project, and workspace scope
- Immutable API key, display label, kind, required, localization, deprecation, position, and bounded configuration snapshot
- Primary key `(revision_id, field_id)`
- Composite tenant FK to schema revision
- Composite tenant FK to stable collection field identity
- Unique `(revision_id, api_key)` and `(revision_id, position)`
- Revision ordered-list index
- Same structural checks as the draft representation

Revision rows cannot be deleted while snapshot children or schema-head pointers reference them. No application mutation path exists.

### `cms_collection_schema_head`

- Collection ID as primary identity plus full tenant scope
- Positive draft version
- Nullable draft-base revision ID
- Nullable current published revision ID
- Non-negative current published sequence
- Changer and updated timestamp
- Composite tenant FK to collection
- Composite tenant FKs to base/current revisions
- Consistency check: no publication means both pointers null and sequence zero; publication means both pointers non-null and sequence positive

This table avoids circular collection/revision declarations while making current pointers foreign-key enforced.

### `outbox_event`

- UUIDv7 event ID
- Workspace, project, and environment scope
- Event type, subject type, and subject ID
- Nullable schema revision ID and positive aggregate sequence
- Bounded schema-validated JSONB payload
- Occurred/available timestamps
- Nullable processed timestamp and non-negative attempt count reserved for M11
- Composite tenant FK to environment
- Composite tenant FK to schema revision for schema events
- Unique logical schema event `(event_type, subject_id, aggregate_sequence)`
- Pending worker index `(available_at, id) where processed_at is null`
- Type, payload-object/size, sequence, attempt, and lifecycle checks

For `cms.schema.published`, the payload contains only versioned stable IDs, sequence/hash, changed field IDs, and stable invalidation tags. It excludes labels, API keys, schema configuration, content, credentials, emails, and request bodies.

M8 will reuse this table for entry publication events. M11 will add worker/delivery behavior rather than replacing event identity.

## Locking and concurrency

Global order for M5 writes:

1. Project row
2. Collection row/schema head
3. Field rows in ascending stable ID order
4. Revision/head/audit/outbox inserts

Collection/schema transactions take a shared project row lock, allowing unrelated collections to mutate concurrently while blocking project archive/update races. They take an exclusive collection lock only for the affected collection.

Collection creation takes only the shared project lock. Collection-key uniqueness handles concurrent same-key creation.

Transactions contain no network calls, telemetry export, or user interaction. All expensive pure validation is bounded by 100 fields and occurs within the lock only when current state must be authoritative.

## Authorization and non-enumeration

- Every dashboard procedure requires a Better Auth session.
- Every query derives workspace scope from the persisted project/environment/collection relationship.
- Client project and environment IDs are exact scope assertions, never authority sources.
- Foreign/nonexistent project, environment, collection, field, and revision identities return matching `NOT_FOUND` behavior.
- Known active members lacking an action receive `FORBIDDEN`.
- `schema.read` permits published collection/revision retrieval.
- Draft retrieval, validation, and mutation require `schema.write`.
- Publication requires `schema.publish`.
- An enabled CMS capability is required for every collection/schema operation.
- Archived projects permit authorized immutable published-schema reads but reject mutations.

Schema mutation is project-global and can affect every locale. M5 therefore extends the M4 unrestricted-locale rule: members with `selected` or `none` locale access may read published schemas when their role allows, but cannot perform `schema.write` or `schema.publish`. This prevents a locale-restricted developer from changing contracts outside their effective locale scope.

Workspace owners remain implicit unrestricted project owners.

## API contracts

All contracts use Effect Schema and the standard application response union. Every environment-scoped input includes explicit project and environment IDs. Schema operations do not take locale because schemas are locale-independent resources rather than content requests.

Planned protected oRPC procedures:

- `platform.projects.collections.list`
- `platform.projects.collections.create`
- `platform.projects.collections.get`
- `platform.projects.collections.update`
- `platform.projects.collections.schema.draft.get`
- `platform.projects.collections.schema.fields.create`
- `platform.projects.collections.schema.fields.update`
- `platform.projects.collections.schema.fields.remove`
- `platform.projects.collections.schema.fields.reorder`
- `platform.projects.collections.schema.validate`
- `platform.projects.collections.schema.publish`
- `platform.projects.collections.schema.published.getLatest`
- `platform.projects.collections.schema.published.getRevision`

Collection lists use the existing bounded opaque keyset cursor pattern with `limit + 1`, descending creation time, and UUID tie-breaker. Draft/revision field sets are bounded to 100 and do not paginate.

New centralized error codes:

- `CMS_CAPABILITY_REQUIRED` → 409
- `COLLECTION_KEY_CONFLICT` → 409
- `SCHEMA_INVALID` → 422 with bounded field/domain details
- `SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED` → 409 with bounded required change details

Existing `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `SERVICE_UNAVAILABLE`, and `INTERNAL_ERROR` remain in use.

No public error exposes SQL, hashes as secrets, raw JSON configuration, stack traces, or foreign tenant existence.

## Effect and repository architecture

### `SchemaEngine`

A pure focused service owns:

- Draft structural validation
- Canonical document creation
- Deterministic hash input
- Published-vs-draft classification
- Required acknowledgement calculation

Meaningful methods use named `Effect.fn`. Expected schema failures use schema-backed tagged errors. Property tests use test Layers and `@effect/vitest`.

### `SchemaRepository`

A focused repository owns collection/schema persistence, locks, transactions, database row decoding, audits, and outbox writes. It does not grow `PlatformRepository` or `LocaleRepository`.

Promise-native Drizzle calls remain inside the adapter and are wrapped with `Effect.tryPromise`. Known constraint failures become typed M5 errors; unknown driver failures become redacted `DatabaseFailure` values.

### Operations and runtime

Operations under `operations/schemas.ts` decode actor identity, annotate stable project/environment/collection/revision IDs, call the repository/engine workflow, and record bounded metrics.

`SchemaEngine` and `SchemaRepository` Layers join the existing shared `ManagedRuntime`. No request-local runtime or local production `Effect.provide` is introduced.

## Audit, event, and observability contracts

Audit actions:

- `cms.collection.created`
- `cms.collection.updated`
- `cms.schema.field.created`
- `cms.schema.field.updated`
- `cms.schema.field.removed`
- `cms.schema.fields.reordered`
- `cms.schema.published`

Audit rows contain only stable tenant/actor/resource/request/time fields. They exclude names, descriptions, API keys, labels, field definitions, configuration, acknowledgement arrays, and outbox payloads.

Outbox event type:

- `cms.schema.published`

Named spans cover collection list/create/update, draft load/validate/mutate, change classification, and publication. Safe span annotations use stable IDs, bounded field/change counts, sequence, and outcome—not labels, keys, configuration, or complete schema documents.

Metrics use bounded labels only:

- Schema mutation action and outcome
- Schema validation outcome
- Publication outcome and highest change severity
- Publication duration and bounded field-count buckets

Tenant/resource IDs, user-provided names, API keys, and hashes are not metric labels.

## UI and UX

### Project collections surface

When CMS is enabled and `schema.read` is allowed, the project page shows a Collections card with:

- Published collection summaries
- Draft/published status text
- Bounded first-page/load-more behavior
- Empty state
- Create action only for `schema.write`

When CMS is disabled, collection controls remain unavailable and the existing enable-CMS action is the only path.

### Dedicated schema builder route

A dedicated project/collection route keeps the builder out of the already dense project settings page. Critical project, access, collection, draft, and latest-publication queries load through TanStack Router and `queryClient.ensureQueryData`, with independent requests started in parallel.

The route component is code-split using the repository's TanStack Start routing convention if automatic route splitting does not already cover it.

### Builder composition

The builder uses explicit composed sections rather than one boolean-heavy component:

- Collection header and immutable key
- Draft/published revision status
- Ordered field list
- Add/edit field dialog
- Remove confirmation
- Keyboard-operable move up/down actions
- Validation issue summary
- Classified change review
- Publish confirmation and acknowledgement list
- Immutable published revision summary

M5 uses existing shared shadcn primitives first. Before implementation, component docs/diffs will be inspected for any new primitive. Forms use TanStack Form plus `FieldGroup`/`Field`; dialogs have titles/descriptions; destructive actions use `AlertDialog`; statuses use `Badge`; loading uses `Spinner`/`Skeleton`; empty states use `Empty`.

Field keys use `spellCheck={false}`, `autoComplete="off"`, explicit labels, and `translate="no"`. Async status and validation summaries are announced accessibly. Long keys/labels truncate or wrap safely. No state is conveyed by color alone.

### Server-state behavior

TanStack Query keys remain hierarchical through oRPC utilities and include every project/environment/collection/revision dependency. Mutations invalidate only affected collection list/detail/draft/published queries.

Schema mutations do not use optimistic cache writes because version conflicts, server-generated field IDs, classification, and publication pointers make authoritative refetch safer. Pending controls disable only after submission begins and show explicit progress text.

Local dialog edits warn before close/navigation when dirty. Published schema and server draft remain separate visual states.

## Threat and failure model

| Threat/failure                                    | Control                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Cross-tenant collection/field/revision injection  | Composite tenant FKs, exact persisted scope checks, non-enumerating queries    |
| Client invents or replaces stable field identity  | Server-generated IDs; IDs absent from create-field authority                   |
| Case/key ambiguity                                | Lowercase profile and environment/collection unique indexes                    |
| Prototype/code-generation key abuse               | Central reserved-key registry and strict ASCII bounds                          |
| Oversized schema/configuration DoS                | 100-field cap, input/config/issue/payload size limits                          |
| Draft leaks as published schema                   | Separate draft/current tables and published-only read procedure                |
| Stale editor overwrites another change            | Expected draft version and collection lock                                     |
| Publication acknowledges stale review             | Exact deterministic change IDs recomputed under lock                           |
| Retry creates duplicate revision/event            | Collection-local unique command ID and logical event uniqueness                |
| Concurrent publication creates duplicate sequence | Collection lock and unique `(collection, sequence)`                            |
| Published revision mutates                        | Insert-only repository, no mutation API, restrictive FKs and snapshot children |
| Project archives during schema write              | Shared project lock blocks archive/update race during transaction              |
| Locale-restricted developer changes global schema | `schema.write/publish` require all-locale access                               |
| Audit/log/event leaks schema data                 | Stable-ID-only audit/telemetry; bounded ID-only event payload                  |
| Outbox write fails after revision insert          | Same transaction rolls back revision, pointer, audit, and event                |
| N+1 collection/revision loading                   | Bounded projections, joins/aggregates, batch field loading                     |
| Deadlocks                                         | Project → collection → sorted fields lock order                                |

## Test plan

### Pure/property/contract

- Branded collection, field, revision, and event IDs reject interchange/malformed UUIDs
- Collection/field key normalization, pattern, reserved values, boundaries, and property cases
- Name/label/description/configuration boundaries and control-character rejection
- M5 field-kind, localization, required, deprecation, and active-position schemas
- Draft validation issue paths/codes/count bounds
- Canonical serialization and hash byte stability under object-key order changes
- Classifier fixtures for every table row above
- Classifier property tests: label/order-only changes never break; field-ID-preserving key/type changes do
- Change IDs and ordering are deterministic
- Missing/extra/stale acknowledgement behavior
- Response unions, new error/status mappings, and OpenAPI generation
- Cursor round trips, kind/filter mismatch, tampering, and oversized rejection

### Policy and Effect service

- Owner/developer/content-role schema read/write/publish matrix
- `all/selected/none` locale-access behavior for schema actions
- Missing/unknown context default denial
- Replaceable engine/repository/clock/telemetry Layers
- Expected failures remain distinct from defects/interruption
- Malformed actors fail before repository access
- Spans/logs/metrics contain bounded safe fields only

### PostgreSQL integration

- Collection creation atomically creates schema head and audit row
- Same key conflict in one environment; same key allowed in another project/environment
- Composite tenant FK rejection across workspaces/projects/environments/collections
- Stable field ID survives label, key, kind, and order changes
- Active key/position uniqueness and removed-field lifecycle
- No-op draft changes avoid version/audit noise
- Concurrent same-version mutations produce one winner
- Complete-set reorder preserves identities and dense positions
- Draft changes do not alter published revision rows
- Publication creates revision, snapshots, head pointers, audit, and outbox atomically
- Failure injection at revision/snapshot/head/audit/outbox steps rolls back all state
- Same state-changing command retry returns one revision/event; incompatible persisted-command reuse fails
- Concurrent publish uses the expected published revision identity to produce monotonic unique sequences
- Publication leaves draft version unchanged; a serialized post-publication draft edit succeeds and becomes dirty against the new baseline
- Published revision retrieval remains byte-stable after later draft/publication changes
- Restrictive foreign keys prevent deleting referenced revisions/field identities
- Archived/CMS-disabled/cross-tenant mutation denial
- Representative `EXPLAIN` assertions for collection list, active draft fields, latest revision, revision fields, and pending outbox scans

### API/server

- Every procedure denies anonymous callers
- Role and locale-access boundaries for every procedure
- Missing/foreign project/environment/collection/field/revision non-enumeration
- CMS-disabled and archived mutation behavior
- Validation, key conflict, version conflict, schema invalid, and acknowledgement contracts
- Extra fields cannot set workspace, actor, stable IDs, sequence, hashes, audit data, or event payload
- Lists remain bounded and cursor-stable
- Standard request ID and response envelope behavior
- OpenAPI includes transformed input/output contracts

### UI/accessibility

- Collection empty/create/list/load-more states
- Immutable key explanation and client validation parity
- Add/edit/remove/reorder field flows
- Stable field selection across reorder/refetch
- Draft versus published status and revision sequence
- Grouped non-breaking/potential/breaking review
- Exact acknowledgement required before publish
- Version-conflict recovery refetches authoritative draft
- Pending, validation, forbidden, CMS-disabled, archived, and retry states
- Keyboard operation, focus management, labels, dialog titles, error summary, status text, and axe checks
- Dirty dialog/navigation warnings preserve edits on cancel
- No request waterfalls on builder navigation and no broad query-cache invalidation

## Decision-standard review

### Product-goal alignment

Stable collection and field identities create the content-contract foundation required by entries, generated forms, delivery, tooling, events, and future visual bindings without coupling content to presentation or one runtime.

### Correctness

Relational tenant scope, one draft head, stable field identities, optimistic versions, immutable snapshots, deterministic classification/hash, exact acknowledgements, idempotent publication, and atomic outbox/audit writes prevent lost updates and contract drift.

### Security

Default deny, exact environment scope, server-generated IDs, strict keys, size bounds, locale-restricted global-mutation denial, non-enumeration, parameterized Drizzle queries, and payload-free observability reduce injection, privilege escalation, and disclosure risk.

### Reliability

Short transactions, consistent locks, no network work under locks, unique publication commands/sequences, rollback injection, immutable snapshots, and typed failures avoid partial or duplicate schema publication.

### Performance

Collection lists use keyset pagination; field sets are capped; common tenant/current/timeline/outbox paths are indexed; queries select bounded projections; publication compiles a snapshot once rather than reconstructing history per read.

### UX

Immutable identities are explained, draft and publication states are distinct, risks are classified before publish, acknowledgement is exact, stale conflicts recover through refetch, and the builder uses accessible predictable controls.

### DX

Schema-backed branded contracts, stable IDs, deterministic revisions/hashes, machine change codes, OpenAPI, and revision-addressable retrieval prepare reliable generated tooling without forcing type regeneration for content-only changes.

### Observability

Named Effect operations, stable-ID spans, bounded metrics, request correlation, immutable audits, and a transactional outbox diagnose schema work without recording complete schema documents or high-cardinality labels.

### Maintainability and future compatibility

A focused engine/repository, normalized identity/snapshot tables, generic outbox, and explicit M5/M6 boundary let field types, entries, publications, delivery, and visual bindings extend the model without replacing collection or field identity.

## Database gate

Proposed migration name:

```text
create_versioned_collection_schemas
```

The developer approved the design, generated `0004_create_versioned_collection_schemas.sql` with `pnpm --filter @framerfordevs/db db:generate --name=create_versioned_collection_schemas`, and applied it successfully. The agent inspected the complete generated DDL and verified the live schema read-only; the agent did not generate or apply the migration.
