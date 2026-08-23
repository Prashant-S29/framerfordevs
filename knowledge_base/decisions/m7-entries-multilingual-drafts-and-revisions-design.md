# Milestone 7 entries, multilingual drafts, and revision-history design

**Status:** Implemented, manually approved, and committed as `60bd96f`

**Date:** 2026-08-09

## Decision summary

Milestone 7 will add one stable environment-scoped entry identity, one independently versioned shared draft, independently versioned locale drafts, immutable meaningful revisions, durable save-command receipts, recoverable optimistic conflicts, revision restore, and an accessible collection entry workspace.

The design uses:

- UUIDv7 entry and revision identities scoped through workspace, project, environment, and collection
- Current published schema revisions as the only entry-authoring contract
- Schema-shaped sparse JSON fragments keyed internally by stable field IDs
- Separate shared and per-locale heads so unrelated locale edits do not conflict
- Bounded stable-path mutations rather than actor-visible whole-document replacement
- A documented permissive draft policy that distinguishes storable values from publishable values
- Immutable shared and locale revision snapshots with author, timestamp, schema revision, and hashes
- Persisted command fingerprints and receipts for replay-safe create, save, no-op, and restore behavior
- Server-authoritative field read/edit projection, with stricter authority for project-global shared writes
- Immutable `created_at, id` keyset ordering for large collection entry lists
- Short tenant-scoped transactions, audit events, content-free telemetry, and no draft outbox events

Draft state remains authoring-only. M7 adds no Delivery or Preview API read path, does not mutate schema-publication state, and does not emit production publication events.

## Source hierarchy and implementation constraints

This design follows `product.md`, `prd/cms.md`, every rule linked by `knowledge_base/rules/index.md`, the M7 acceptance criteria, and approved M1–M6 decisions before generic skill guidance.

Materially relevant installed guidance was reviewed for Effect, Drizzle, PostgreSQL, Express, security hardening, TanStack Start/Router/Query, Turborepo, shadcn/ui, React performance/composition, Portable Text, and web accessibility. Stable Effect 3.22 declarations and existing repository patterns remain the executable API contract.

The implementation will:

- Keep business workflows in named `Effect.fn` operations and typed services/Layers.
- Keep stable Drizzle Promise-native inside the repository adapter.
- Use the existing shared `ManagedRuntime`; no request-local runtime is allowed.
- Add packages only through pnpm if an approved implementation proves one necessary.
- Never generate, edit, execute, push, or apply a migration.
- Stop at the developer-controlled migration gate after the approved Drizzle schema change.
- Never run `git commit`.

## Scope

### Included

- Stable entry creation, retrieval, and user-controlled CMS-only entry names
- Current shared and exact-locale draft retrieval
- Shared and localized draft mutation in one atomic save command
- Separate shared and locale optimistic versions
- Durable create/save/restore idempotency
- Meaningful-revision creation and no-op suppression
- Bounded draft validation with stable field identity, API-key paths, and locale context
- Batched, tenant-scoped reference existence validation
- Shared and locale revision listing
- Restore-as-a-new-revision
- Field-level server read/edit enforcement and matching UI behavior
- Cursor-paginated collection entry list and dedicated entry editor routes
- Locale dependency counts backed by real locale-draft rows
- Transactional audit events and bounded observability
- Contract, pure-kernel, Effect, PostgreSQL, API, UI, accessibility, and query-plan coverage

### Deferred

- Locale publication, unpublication, immutable delivery snapshots, and changed-since-publication state: M8
- Delivery field filtering, sorting, uniqueness indexes, slug lookup, and public search: M9
- Preview credentials and draft/revision preview responses: M10
- Draft-save webhooks or outbox events: ordinary draft saves are intentionally not production events
- Archive, soft delete, permanent delete, reference-deletion policy, and bulk entry operations
- Cross-schema content migration or automatic coercion
- Real-time collaborative editing, presence, or CRDTs
- Background autosave scheduling in the UI; the M7 command contract is autosave-ready, while the initial UI uses an explicit Save draft action

M7 list inputs contain only hard tenant/collection/locale scope and pagination. Arbitrary field search/filter/sort is not exposed before M9 has approved field capability flags and index semantics. Repository tests still prove that no list or cursor can cross collection, environment, project, workspace, or locale authorization boundaries.

### Milestone-boundary reconciliation

The M7 criterion “Search/filter behavior cannot cross collection/project boundaries” is treated as a mandatory scope-safety invariant for every M7 list, cursor, and future-compatible filter input, not as authorization to introduce arbitrary field querying early. M7 proves the boundary with cross-scope and cursor-reuse tests. M9 remains responsible for actual field search/filter/sort capability flags, indexes, query bounds, and Delivery semantics. This interpretation is explicit so later work must not infer that field filtering shipped in M7.

## Core invariants

1. One `cms_entry` row is the canonical identity for every locale.
2. Entry IDs, collection IDs, environment IDs, project IDs, workspace IDs, locale IDs, field IDs, and revision IDs are never inferred from display strings.
3. Every content operation requires an explicit enabled locale and successful locale-aware policy evaluation.
4. Shared and localized values occupy disjoint terminal schema paths.
5. A localized write can change only the requested locale head.
6. A shared write can change only the shared head and requires project-global locale authority.
7. A write checks only the versions of partitions it meaningfully attempts to change.
8. Every meaningful partition change appends one immutable revision and advances only that partition head.
9. A canonical no-op advances no head, creates no revision, changes no entry timestamp, and emits no audit event.
10. Every accepted command, including a no-op, records one replay receipt.
11. Restore copies a historical snapshot into a new revision; it never updates or deletes history.
12. Hidden or non-editable values are neither returned nor silently replaced by an actor-visible document.
13. Unknown, stale, wrong-partition, or unauthorized paths are never silently persisted.
14. Draft saves never update schema publication pointers, locale publication pointers, delivery snapshots, caches, or the outbox.
15. Every persistence query carries complete tenant scope even when a globally unique identifier is present.
16. A bounded CMS-only entry name is shared management metadata, not localized content and never part of a revision or Delivery value document.

## Schema authority for authoring

Entry authoring uses the collection's **current published schema revision**, not its mutable schema draft. A collection without a published schema cannot create or edit entries and returns a typed `PUBLISHED_SCHEMA_REQUIRED` conflict.

The entry editor loads a role-projected generated definition from the current published revision. Create and save inputs include that immutable `schemaRevisionId` and contract hash. Inside the locked transaction, the repository verifies that they still identify the collection's current published contract. A concurrent schema publication returns a recoverable schema conflict before any draft mutation.

Every meaningful entry revision records:

- The published schema revision ID
- The value-contract hash
- The validation profile and currency profile through the referenced schema revision
- The canonical value hash

Historical values remain keyed by stable field IDs. Mutable API-key or label changes therefore do not rewrite draft history. Values for fields no longer present in the current contract remain preserved in older/current internal snapshots but are excluded from current projection and publication. An unrelated save must not silently delete such preserved data.

## Internal value and localization model

### Stable field-ID representation

Management persistence uses JSON objects keyed by stable field IDs at every object boundary:

- Root fields use root field IDs.
- Object properties use their stable child field IDs.
- Lists remain ordered JSON arrays.
- Object values inside list items use stable child field IDs.
- List-item schema nodes remain unkeyed value definitions.

The generated editor also uses this stable-ID representation. Delivery serialization in M8 will map current field IDs to the API keys from the selected published schema revision.

This prevents an API-key rename from orphaning values and allows field authorization to resolve a mutation against one exact schema node. User-facing validation paths are still rendered as bounded API-key/list-index paths such as `product.title` or `items[2].name`, and each issue also carries the stable field ID.

### Sparse fragments

The shared head stores only terminal paths whose effective localization is `shared`. Each locale head stores only terminal paths whose effective localization is `localized` for that exact locale.

Mixed objects are sparse structural containers in both fragments. Atomic shared/localized objects and lists live wholly in one partition. Arrays are never merged across partitions. The pure field kernel owns deterministic partitioning, sparse-object pruning, path resolution, and deep merge for validation; M8 will reuse the same merge behavior when creating publication snapshots.

### Bounded mutations

A save sends bounded mutations grouped into `shared` and `localized` partitions. Mutation paths use stable field IDs plus bounded list indexes. Operations support field set/unset and explicit list insert/remove/update behavior; they do not send an actor-visible whole database document.

The server resolves every path against the current published schema and actor projection before applying it. Omitted paths mean “unchanged,” never “delete.” This preserves hidden and read-only values and makes retries and autosave payloads small.

Structural authority follows the schema tree:

- Every named node on a mutation path must be visible and editable to the actor.
- List-item definitions inherit the parent list's editor access as approved in M6.
- List insertion/removal requires edit authority on the list boundary.
- Editing an object child additionally requires edit authority on that child.
- Unsetting an object/list boundary is an authorized subtree-presence change; the UI must not offer it when the boundary is read-only.

Mutation count, path length, list indexes, JSON depth, unique reference count, and serialized partition bytes are bounded before database work. The M7 profile permits at most 500 mutations per command, 16 path segments, 100 items per list, 1,000 unique reference IDs per selected-locale validation, 20 levels of canonical document traversal, and 1 MiB per persisted shared or locale partition. The traversal ceiling is derived from one partition root, up to eight schema-definition levels, up to ten nested levels inside the terminal JSON field, and one defensive traversal sentinel; it is not an independent authoring-depth allowance. Individual value limits continue to use `ffd-fields@1`, including its 262,144-byte value cap. The application RPC boundary rejects bodies over 2.5 MiB before domain decoding, so even a two-partition command and envelope overhead remain bounded.

## Draft validation policy

M7 introduces two explicit levels.

### Storable draft rules — hard gate

A value is storable only when it is safe to retain and render in the management editor:

- The request and every mutation decode through bounded Effect Schemas.
- Values are JSON-compatible and within aggregate depth/byte/item/reference limits.
- Mutation paths exist in the current schema and belong to the declared partition.
- The actor can edit every targeted node.
- Object/list/structured-value shapes are editor-decodable.
- Rich text satisfies the structural `ffd-portable-text@1` node/mark allowlist; raw HTML is never accepted.
- External-asset and link protocols satisfy the existing safe protocol profile.
- Reference values have the expected stable UUID shape.

Hard-gate failures reject the command atomically. Unknown and unauthorized paths use non-enumerating feedback and are never ignored or persisted.

### Publishable content rules — soft draft issues

A structurally storable draft may still have bounded content issues, including:

- Missing required values
- Invalid email, URL, slug, date, date-time, decimal, money, enum, pattern, or configured range/length
- Object/list cardinality or uniqueness violations within the safe global limits
- Missing configured defaults where required semantics still fail
- A well-formed reference ID that is unavailable in the configured target collection and tenant scope

These issues do **not** reject M7 draft persistence. Current-draft retrieval and save responses return at most 50 deterministic issues plus `capped`, with:

- Stable field ID
- API-key/list-index path
- Scope (`shared` or `localized`)
- Explicit locale ID and canonical tag for localized/combined issues
- Machine code and safe message

Absence represents an incomplete field. `null` or a wrong structural type is not used as an absence sentinel and fails the storable gate except where the field kind itself permits that JSON shape. M8 publication remains strict and will reject every unresolved publishable-content issue.

### Reference validation

Reference checks are grouped by configured target collection and executed in bounded `IN (...)` queries with complete workspace/project/environment/collection scope. There is no per-reference query. Missing, foreign-tenant, foreign-environment, and wrong-collection IDs all produce the same non-enumerating `reference_unavailable` issue and never expose target metadata.

Draft values may retain a well-formed unavailable reference as a soft issue. No relational edge or target data is fabricated. M8 will reject it at publication time.

## Database design

All tables use restrictive deletion behavior, complete tenant columns, composite tenant foreign keys, UUIDv7 resource IDs, timezone-aware timestamps, JSON object/size checks, positive sequence/version checks, value/fingerprint SHA-256 checks, actor foreign-key indexes, and indexes matching actual query paths.

### `cms_entry`

Stable logical identity:

- `id`
- `workspace_id`, `project_id`, `environment_id`, `collection_id`
- Nullable bounded `display_name` for compatibility with entries created before the manual-review amendment
- Positive `name_version` for optimistic renaming; every new entry must supply a display name
- `create_command_id`, `create_command_fingerprint`, including the requested display name
- `created_by_user_id`, `changed_by_user_id`
- `created_at`, `updated_at`

Constraints/indexes:

- Composite tenant FK to collection
- Composite unique identity for future child foreign keys
- Unique `(collection_id, create_command_id)` for replay-safe creation
- Immutable list index `(collection_id, created_at desc, id desc)`
- Actor indexes

A matching create-command retry returns the original entry. Reusing the command with a different display name or authority fingerprint fails with `ENTRY_COMMAND_CONFLICT`. A rename locks the scoped entry, compares `expectedNameVersion`, suppresses canonical no-ops, advances only `name_version`, updates entry change metadata, and emits a content-free `cms.entry.name.updated` audit. Legacy null names retain a collision-safe full-identity fallback until renamed.

### `cms_entry_shared_draft`

One current shared head per entry, created lazily on the first meaningful shared save:

- Entry and complete tenant scope
- `version`
- `current_revision_id`
- `changed_by_user_id`, `updated_at`

A missing shared head is represented externally as shared version `0`, which the first save uses as `expectedSharedVersion`. Persisted shared-head versions are positive; the first meaningful shared save creates version/revision sequence `1`.

### `cms_entry_locale_draft`

One current head per entry and exact project locale, created lazily:

- Entry, locale, and complete tenant scope
- `version`
- `current_revision_id`
- `changed_by_user_id`, `updated_at`

Primary identity is `(entry_id, locale_id)`. A reverse `(locale_id, entry_id)` index supports M4 dependency checks. Missing heads are represented as locale version `0`.

### `cms_entry_shared_revision`

Immutable shared snapshots:

- Revision ID and complete entry/tenant scope
- Positive per-entry `sequence`
- `previous_revision_id`
- Published `schema_revision_id` and contract hash
- Canonical sparse shared `values` and `values_hash`
- Canonically sorted, deduplicated `changed_field_ids`, bounded by the 100-node schema limit
- `command_id`, `command_fingerprint`
- Optional `restored_from_revision_id`
- `authored_by_user_id`, `authored_at`

Unique constraints cover entry sequence and entry command. Previous/current/restore links are tenant- and entry-correlated. Sequence `1` has no previous revision; later sequences require one.

### `cms_entry_locale_revision`

Immutable exact-locale snapshots with the same revision metadata, including bounded stable `changed_field_ids`, plus `locale_id`. Sequence and command uniqueness are per `(entry_id, locale_id)`. Composite foreign keys prevent a head or history link from pointing at another locale, entry, collection, environment, project, or workspace.

### `cms_entry_draft_command`

Durable save/restore receipt:

- `(entry_id, command_id)` identity and complete tenant scope
- Required editor `locale_id`
- Operation (`save` or `restore`)
- Actor ID and canonical authority/input fingerprint
- Result kind (`changed` or `no_op`)
- Result shared and localized versions
- Nullable result shared and localized revision IDs
- `completed_at`

The receipt is written in the same transaction after all resulting revisions/heads and before commit. Matching retries return the recorded result even when the original command was a no-op. Reuse with a different actor, scope, schema authority, expected versions, mutation set, or restore target fails explicitly.

### Command-receipt retention clarification

Recorded during M8 design: `cms_entry_draft_command` receipts are retained for the lifetime of the project. M7 has no expiry, cleanup job, or ordinary delete path. Receipts contain bounded operational provenance and no draft values. Deleting them without a replacement expiry/tombstone contract would weaken durable changed/no-op replay, so M15 owns the cross-system retention review before any cleanup is introduced.

No M7 table is read by a delivery credential or Delivery API procedure.

## Authorization and tenant isolation

Every entry operation first resolves the explicit enabled locale under the active project membership and then checks role permission.

### Reads

- Entry list/get/current-draft/revision metadata require `content.read` for the requested locale.
- Current values are recursively projected to fields visible to the server-derived role.
- Hidden values and hidden historical snapshots are never returned.
- Revision lists return author/time/schema/scope metadata and only role-visible stable changed-field IDs, not raw snapshots or hidden field identities.
- Missing, cross-tenant, unauthorized, and foreign-scope entry IDs use the existing non-enumerating not-found behavior where required.

### Localized writes

Localized save/restore requires `content.write` for the exact requested enabled locale plus node-level edit authority. It can advance only that locale head.

### Shared writes

Shared values affect every locale and are therefore project-global content state. A shared save/restore requires:

- Role-level `content.write`
- `locale_access_mode = all`
- Node-level edit authority

A selected-locale member may read role-visible shared values while editing an allowed locale but sees shared controls as read-only. A `none` member has no locale editor access. This prevents a Hindi-only editor from changing values that also affect English and Gujarati.

Field metadata narrows authority and never grants an action denied by role or locale policy. The server computes `canEditShared` and effective editable paths; the client only reflects that decision.

## Transactions, concurrency, and idempotency

### Lock order

Mutations use one stable lock order:

1. Project row `FOR SHARE` to hold membership/locale/capability state stable
2. Collection row `FOR SHARE` to hold the current published schema authority stable
3. Entry row `FOR UPDATE` to serialize commands for one logical entry
4. Shared head before locale head where both are touched

Schema publication already takes the collection write lock and locale lifecycle mutation takes the project write lock, so either operation completes before an entry save validates its authority. Transactions remain short; validation that does not require database state is prepared before locking and rechecked against locked authority.

### Version rules

Save inputs contain `expectedSharedVersion` and `expectedLocalizedVersion`, but a partition version is checked only when the command contains a mutation for that partition.

Consequences:

- A Hindi-only localized save does not inspect or advance English or Gujarati versions.
- Concurrent English and Hindi localized saves can both succeed after short serialization because their expected locale heads are independent.
- Any shared mutation checks the one shared version, so concurrent shared writers conflict deterministically.
- A command changing shared and localized values is atomic: if either touched partition is stale, neither changes.

`ENTRY_DRAFT_CONFLICT` returns bounded details identifying every stale scope, the actor's expected version, the current version, and current revision ID. M7 extends `ApiErrorDetail` with optional schema-backed conflict metadata (`scope`, `expectedVersion`, `currentVersion`, and nullable `currentRevisionId`); those properties are absent from unrelated errors. The client preserves local edits, refetches authoritative state, and never auto-overwrites.

### Meaningful saves and no-ops

After applying authorized mutations, the repository canonicalizes each resulting sparse fragment and compares its SHA-256 value hash with the current revision.

- A changed partition creates one immutable revision and advances that head.
- A save changing both partitions creates two revisions linked by the same command ID.
- An unchanged partition creates no revision and advances no version.
- If both partitions are unchanged, only the command receipt is added.
- Meaningful saves update entry `changed_by`/`updated_at`, create one content-free audit event per changed partition, and return validation for the selected locale.

### Restore

Revision listing is separately cursor-paginated for `shared` and `localized` scope, with a default page size of 25 and the shared `PageLimit` maximum of 50. Restore accepts one target revision, current expected version, current schema authority, and a fresh command ID.

The repository:

1. Authorizes the scope and every current field path that would change.
2. Loads the immutable target within complete tenant/entry/locale scope.
3. Requires the target contract hash to equal the current published contract hash in M7.
4. Applies the target snapshot as a new candidate state.
5. Appends a new revision with `restored_from_revision_id` and advances the head.

A differing target always creates a new revision. Restoring the current canonical state is a recorded no-op and does not create noise. Cross-contract restore returns `ENTRY_REVISION_INCOMPATIBLE`; M7 never silently drops, coerces, or rehomes historical values.

## API and Effect architecture

Add strict contracts under `packages/api/src/contracts/entries.ts`, a pure entry-value kernel under `packages/api/src/lib/`, an `EntryRepository` service/Layer, and named operations under `packages/api/src/operations/entries.ts`.

The repository owns authorization, tenant queries, lock order, command replay, transactional writes, batched references, audits, and database error translation. The pure kernel owns fragment partition/merge, stable-path mutation, storage validation, canonical hashing, role projection, and deterministic issue ordering. `FieldEngine` continues to own kind-specific value validation.

Proposed oRPC procedures:

- `platform.projects.collections.entries.list`
- `platform.projects.collections.entries.create`
- `platform.projects.collections.entries.getDraft`
- `platform.projects.collections.entries.rename`
- `platform.projects.collections.entries.saveDraft`
- `platform.projects.collections.entries.listRevisions`
- `platform.projects.collections.entries.restoreRevision`

Every input includes project, environment, collection, and explicit locale context; entry procedures also include entry ID. All outputs use the standard `{ ok, data, error, message }` union and centralized error mapping.

New public errors:

- `PUBLISHED_SCHEMA_REQUIRED` — collection has no authoring contract
- `ENTRY_DRAFT_CONFLICT` — one or both touched heads are stale, with recoverable bounded details
- `ENTRY_COMMAND_CONFLICT` — command ID was reused with a different authority fingerprint
- `ENTRY_REVISION_INCOMPATIBLE` — target history cannot be restored under the current contract

Boundary shape/resource errors use `VALIDATION_ERROR`; authorization failures remain `FORBIDDEN`; unavailable scoped resources remain non-enumerating `NOT_FOUND`/`LOCALE_UNAVAILABLE`; infrastructure failures remain redacted.

## Entry-list contract and performance

The list is always scoped by project, environment, collection, and an explicit authorized locale. It uses immutable descending `(created_at, id)` ordering rather than mutable update time, preventing ordinary saves from moving rows between cursor pages.

- Default page size: 25
- Maximum page size: 50 through the existing shared `PageLimit` contract
- Cursor contains created timestamp, entry ID, and a scope/filter fingerprint
- Cursor reuse under another collection/locale/scope fails validation
- Response returns only locale-neutral management metadata: stable ID, display name, name version, creation time, and updated time

Entry rows use the bounded user-controlled CMS-only display name. Legacy null names fall back to a collision-safe label containing the complete stable entry ID; locale content is never used as a locale-dependent management label. The list retains explicit locale context internally for authorization and cursor scope but presents every stable entry exactly once without a locale selector, locale badges, or locale-version labels.

The locale-neutral management list itself does not require loading a published value contract because it returns no schema-derived content values. An unpublished collection therefore returns a successful empty management page after normal collection/locale authorization. Create and edit operations still require the current published schema.

Arbitrary field search/filter/sort is deliberately absent in M7. M9 must add approved capability metadata, indexes, query bounds, and delivery semantics before exposing those inputs.

## UI design

The collection workspace gains clear Schema and Entries navigation while preserving the dedicated schema-builder route.

### Entry list

- Server-prefetched first page with targeted TanStack Query keys
- Stable cursor “Load more” behavior rather than numbered offset pagination
- Bounded user-controlled entry name, updated timestamp, and open action
- Empty state explaining that entries require a published schema
- Permission-aware Create entry action
- Skeleton/loading, error, empty, and unavailable-schema states without layout jumps

The initial implementation will compose installed shadcn/Base UI primitives and existing shared components. A new shadcn component is added through its CLI only if implementation review proves it necessary; no hand-rolled replacement is introduced speculatively.

### Entry editor

- Shared section rendered once outside locale tabs
- Editable CMS-only entry name with independent optimistic rename feedback
- Enabled, authorized locales in stable-ID `LocaleTabs`; selecting a tab updates the validated `?locale=` URL, and direct navigation/back/forward drives the selected tab
- Localized fields isolated to the selected tab
- Shared fields consistently visible and explicitly read-only for locale-restricted actors
- Controlled generated field state keyed by stable field IDs
- Inline and summary validation with `aria-invalid`, linked descriptions, field focus, and locale context
- Explicit Save draft status: unsaved, saving, saved, invalid-but-saved, conflict, and failed
- Existing locale-switch unsaved-change guard; no silent tab switch or value loss
- Revision panel with separate Shared and selected-locale history, author/time, and confirmation before restore
- Conflict alert that preserves local state and offers authoritative refetch; no last-write-wins retry

The heavy rich-text editor remains lazy-loaded and hydrates the canonical saved `ffd-portable-text@1` blocks into editor state. Generated controls project configured defaults only when the corresponding shared or exact-locale partition has never had a meaningful revision (`version 0`); they never overwrite saved values or reappear after an intentional clear. Route loaders prefetch independent collection, locale, published-form, entry-draft, and revision metadata queries in parallel where dependencies permit. The entry-list loader first reads `currentPublishedRevisionId` from collection metadata and does not request a published form or entry page when that pointer is null, so expected absence renders the intentional empty state without failed queries or global error notifications. Mutations invalidate only the affected entry row, selected draft, touched revision list, collection metadata, and collection entry pages.

## M4 locale dependency integration

`LocaleRepository` will replace its M4 placeholder draft count with a bounded count of `cms_entry_locale_draft` heads for the exact project locale, capped according to the existing dependency summary contract and performed inside the same project-locked locale transition transaction.

Disabling/removing a locale with drafts continues to require the approved explicit confirmation and lockout wording. Draft rows and history are preserved; re-enable/restore makes them available again. Current publications remain an M8 dependency.

## Auditing and observability

Meaningful state changes emit immutable audit events:

- `cms.entry.created`
- `cms.entry.name.updated`
- `cms.entry.shared_draft.saved`
- `cms.entry.locale_draft.saved`
- `cms.entry.shared_draft.restored`
- `cms.entry.locale_draft.restored`

Creation uses the entry as its audit resource. Each changed or restored partition writes its own audit event using the newly inserted immutable shared/locale revision ID and corresponding revision resource type. The revision row supplies stable entry and, for localized changes, exact locale identity, while the action supplies the bounded partition kind. A save that changes both partitions therefore emits two audit events; a one-partition save emits one.

This deliberately follows the M6 stable-resource-ID precedent without creating one audit row per changed field path. Content administrators obtain author/time/locale and role-projected changed stable field IDs from revision metadata; immutable snapshots preserve complete before/after state for restore and future diff views. The audit stream remains useful without duplicating content structure or producing unbounded events. Audits contain no field paths, values, validation messages, locale tags, titles, command fingerprints, or content hashes. No-op retries create no audit event.

Named spans include bounded operation, outcome, partition-changed flags, issue count, conflict scope, and stable resource IDs where existing telemetry policy permits. Logs never contain draft values, mutation payloads, titles, rich text, asset URLs, reference IDs, validation messages, or user-entered API values. Metrics use bounded operation/outcome labels only; project, collection, entry, locale, field, and user IDs are never metric labels.

Ordinary draft saves do not write `outbox_event`. Production events begin with M8 publication state changes.

## Security and reliability review

| Risk                                          | Control                                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Cross-tenant entry/reference access           | Complete tenant predicates, composite FKs, non-enumerating outcomes, batched scoped lookups        |
| Hidden-field disclosure                       | Recursive server read projection; list/revision metadata never carries raw hidden snapshots        |
| Over-posting read-only fields                 | Stable-path server authorization; omitted paths preserve values; unknown/unauthorized paths reject |
| Locale-restricted user changes global content | Shared writes/restores require `locale_access_mode = all`                                          |
| Hindi save overwrites another locale          | Independent locale heads, exact locale FK, touched-partition version checks                        |
| Lost shared update                            | One shared version and deterministic shared conflict details                                       |
| Duplicate retry artifacts                     | Persisted canonical command fingerprints and durable changed/no-op receipts                        |
| Noisy history                                 | Canonical value hashes and per-partition no-op suppression                                         |
| History rewrite                               | Insert-only revisions, restrictive FKs, restore-as-new-revision                                    |
| Schema changes during save                    | Project/collection lock order and current published revision/hash check                            |
| Resource exhaustion                           | Boundary/body, path, operation, depth, list, reference, issue, page, and JSON-byte caps            |
| Stored XSS/unsafe links                       | Structured storable gate, Portable Text allowlist, safe protocols, no raw HTML                     |
| Reference N+1                                 | Deduplicated grouped lookups with bounded `IN` sets                                                |
| Cursor scope confusion                        | Scope-bound opaque cursor plus mandatory tenant/collection/locale predicates                       |
| Draft leakage                                 | No delivery/preview credential route, publication pointer, snapshot, cache, or outbox mutation     |
| Deadlock/long transaction                     | Stable project → collection → entry → head lock order and precomputed pure validation              |

## Test plan

### Contracts and pure kernels

- Branded IDs, cursors, bounded mutations, error snapshots, and OpenAPI-compatible schemas
- Stable-ID fragment partition/merge for shared, localized, mixed objects, atomic lists, and depth-8 structures
- API-key rename continuity and removed-field preservation
- Path set/unset/list operations, sparse pruning, canonical hashes, and deterministic no-ops
- Storable-versus-publishable policy for every field kind
- Validation issue field/path/scope/locale context and 50-issue cap
- Recursive role projection and field write authority
- Command and create fingerprints, including sorted/canonical equivalent input

### Effect services and operations

- Replaceable Layers and named operations
- Typed error channels with no Promise/error leakage
- Matching command replay and incompatible command reuse
- Current-schema checks and redacted infrastructure failures
- Content-free spans/logs and bounded metrics

### PostgreSQL integration

- Stable identity across English, Hindi, and Gujarati
- Complete tenant/collection/environment/locale non-enumeration
- Create retry returns one entry under concurrency
- Independent concurrent English/Hindi/Gujarati locale saves
- Shared/shared conflict and shared-plus-locale atomic conflict
- Meaningful revisions, bounded/deterministic changed-field IDs, no-op receipts, immutable history, and restore append
- Rollback injection after command, revision, head, entry timestamp, and audit artifacts
- Restrictive tenant/history foreign keys and deletion behavior
- Batched reference availability and no N+1 execution
- Locale dependency counts and preservation through disable/restore
- Entry/revision list cursor stability and intended `EXPLAIN` index plans

### API and policy

- Anonymous denial and standard envelope mapping
- Role matrix for content read/write
- Selected/none/all locale access behavior
- Shared write denial for selected-locale actors
- Nested hidden/read-only field over-posting
- Wrong locale, collection, environment, project, workspace, field, revision, and cursor injection
- Recoverable conflict details and schema-change behavior
- No Delivery/Preview credential access to drafts

### UI and accessibility

- Entry list loading/error/empty/cursor/create states, locale-neutral rows, and user-controlled names
- Entry-name validation, optimistic rename/no-op/conflict behavior, and legacy collision-safe fallback
- Shared section plus exact locale tabs, URL synchronization, direct-navigation/back-forward behavior, and no cross-locale content fallback
- English/Hindi/Gujarati value isolation
- Read-only shared/nested field states from server authority
- Draft invalid-but-saved feedback, focus, labels, descriptions, and announcements
- Dirty locale-switch guard, save status, preserved conflict edits, and refetch
- Revision list and restore confirmation/history behavior
- Version-0 shared/localized default projection without saved-value overwrite or clear-value resurrection
- Saved Portable Text hydration across reload and locale switches
- Mixed-object editor diffs terminate mutations at exact shared/localized descendant fields rather than the authority-neutral container
- Schema defaults use type-appropriate controls, including the configured lazy Portable Text editor rather than raw document JSON, and decoded class-backed defaults pass strict server validation
- Mixed localization hidden for every non-object field while remaining selectable for eligible objects
- Keyboard operation, focus restoration, axe checks, hydration, route-tree, and lazy rich-text bundle regression

### Final gate

- Applicable format, lint, type-check, test, coverage, build, audit, and `git diff --check`
- Read-only PostgreSQL invariant, fixture, constraint, index, and query-plan verification
- Docker health and developer manual English/Hindi/Gujarati create/save/restore review

## Database migration gate

The developer generated and applied both approved milestone migrations:

- `0006_create_entries_and_locale_revisions.sql`
- `0007_add_entry_display_names.sql`

The agent generated, modified, and applied neither migration. After developer confirmation, the agent inspected both SQL files, snapshots, and the live catalog read-only. The entry-name amendment contains only nullable `display_name`, positive defaulted `name_version`, and bounded validated checks. Existing entries required no content backfill: nullable names use a collision-safe full-ID fallback until renamed, while all new application creates require a valid name.

## Approval

The developer reviewed the proposal, supplied corrections for shared pagination bounds, audit granularity, missing-head version semantics, traversal-limit derivation, and the M7/M9 search boundary, then explicitly approved the revised design and authorized implementation. During manual review, the developer additionally approved user-controlled CMS-only entry names, locale-neutral list presentation, locale-tab URL synchronization, version-0 default projection, saved rich-text hydration, and hiding the mixed-object option from ineligible field kinds. Review focused especially on:

1. Published-schema-only entry authoring
2. Stable field-ID draft storage and path mutations
3. Permissive storable-versus-publishable draft policy
4. Shared-write restriction to all-locale members
5. Separate shared/locale heads and revision tables
6. Durable no-op command receipts
7. Same-contract-only M7 restore behavior
8. Deferral of arbitrary field search/filter/sort to M9
