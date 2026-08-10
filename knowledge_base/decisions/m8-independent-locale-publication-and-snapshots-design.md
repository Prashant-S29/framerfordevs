# Milestone 8 independent locale publication and immutable delivery-snapshot design

**Status:** Developer-approved and committed as `ad3cd5e`

**Date:** 2026-08-09

## Decision summary

Milestone 8 will add strict, independent publication state for every entry locale. Publishing one locale will compile the current shared draft and that exact locale draft against the collection's current published schema, resolve and pin exact-locale reference publications, create an immutable publication and read-optimized snapshot, advance only that locale's current pointer, and write the audit and outbox event in one transaction.

The design uses:

- One mutable publication-state head per entry and locale
- Immutable locale publication records with locale-local publication sequences
- One entry-global publication-event sequence for deterministic outbox ordering across locale publish and unpublish operations
- Immutable delivery snapshots containing API-key-shaped JSON and an internal pinned reference manifest
- Exact source shared/locale revision identities and schema identity on every publication
- Derived shared, localized, and schema staleness rather than fan-out stale-flag writes
- Strict publication validation with defaults materialized into the snapshot
- Exact-locale, currently published reference requirements and immutable target-publication pinning, including for shared-only targets
- A required validation plan hash so publish cannot silently use draft, schema, or reference state different from the reviewed candidate
- Durable command receipts for changed and no-op publish/unpublish retries
- Explicit PostgreSQL `READ COMMITTED` publish/unpublish transactions with one grouped target-resolution statement
- Project → collection → entry → shared head → locale head lock order
- A provisional 1 MiB snapshot/manifest profile guarded by a realistic-content fixture gate before Drizzle schema work
- One locale-leading partial current-publication index unless representative plans prove another is necessary
- Atomic publication, snapshot, pointer, audit, outbox, and receipt persistence
- A focused pure `PublicationEngine`, `PublicationRepository`, named Effect operations, and shared `ManagedRuntime` integration
- Permission-aware publication status, validation, publish, unpublish, and history management APIs
- Accessible exact-locale publication controls integrated into the existing entry editor

The developer explicitly approved this decision record and authorized M8 implementation. The pure compiler's realistic-content fixture passed the approved headroom gate, the developer confirmed it, and the developer generated and applied the reviewed migration. Repository, API, UI, observability, concurrency/linearization, policy, accessibility, rollback, and database-invariant automation are complete. The developer approved and committed the completed implementation as `ad3cd5e` (`feat(m8): add independent locale publication and immutable snapshots`).

## Source hierarchy and discovery

This proposal follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every rule linked by `knowledge_base/rules/index.md`
4. The M8 milestone goal, deliverables, and success criteria
5. Approved M1–M7 decisions
6. The committed M7 database, contracts, validation kernels, repositories, policy, API, UI, and tests

The following installed guidance was reviewed and applied where material:

- Stable Effect v3 services, Layers, schema-backed errors, observability, and `@effect/vitest`
- Drizzle PostgreSQL schemas, restrictive relations, transactions, and query composition
- PostgreSQL composite/partial/covering indexes, foreign-key indexes, short transactions, consistent lock ordering, JSONB, and batched access
- Express/oRPC boundary validation and centralized error handling
- Better Auth's existing identity/session boundary
- Security threat modeling, authorization, non-enumeration, input bounds, content leakage prevention, and supply-chain constraints
- TanStack Query query-key completeness, route prefetching, parallel loading, and targeted invalidation
- TanStack Router validated URL locale state and non-nested page-route conventions
- TanStack Start SSR/hydration boundaries
- shadcn Base UI composition, field, alert, dialog, badge, spinner, and tab conventions
- React 19 composition and Vercel performance guidance
- Portable Text's structured-data boundary; M8 validates the existing strict profile and does not render or serialize raw HTML
- Current Web Interface Guidelines for forms, focus, async status, navigation state, long content, and accessibility
- Turborepo package boundaries, package-owned tasks/dependencies, and workspace validation

No additional dependency or skill is proposed. The installed guidance covers the M8 database, Effect, security, API, and UI domains.

## Current implementation seams

M8 extends these committed M7/M5 seams rather than replacing them:

- `cms_entry` is one stable identity for all locales.
- `cms_entry_shared_draft` points to the current immutable shared revision.
- `cms_entry_locale_draft` points to the current immutable exact-locale revision.
- Missing shared or locale heads are represented as version `0` and revision `null`.
- Shared and locale values are sparse JSON fragments keyed internally by stable field IDs.
- Mixed object fragments merge by stable schema path; lists remain atomic and are never deep-merged.
- Entry authoring and restore use the collection's current published schema contract.
- Draft saves are permissive but bounded; unresolved publishability issues are retained as soft draft issues.
- References are already collected and checked in grouped tenant-scoped queries without N+1 access.
- Schema publication already establishes project/collection locking, immutable snapshots, audit/outbox atomicity, command fingerprints, failure injection, and monotonic sequence patterns.
- `outbox_event` already exists and is intentionally reusable for entry publication events.
- `content.publish` already exists in the default-deny policy and is locale-scoped.
- Locale transitions already block while `currentPublicationCount > 0`; M8 must replace the remaining zero-publication placeholder.
- The entry editor already has exact URL-driven locale tabs, shared/locale draft versions, dirty-state protection, and role-aware generated controls.

## Scope

### Included

- Exact-locale publication validation plans
- Exact-locale publish and unpublish
- Independent locale publication heads and optimistic publication-state versions
- Immutable publication records and publication history
- Immutable delivery snapshots compiled at publication time
- API-key serialization from stable-ID draft storage
- Default materialization under the selected schema revision
- Exact-locale reference publication validation and target-publication pinning, with actionable shared-only-target workflow guidance
- Explicit `READ COMMITTED` transaction configuration and reference-resolution concurrency semantics
- Realistic large-content snapshot measurement and developer review before the database gate
- Locale-leading current-publication indexing with representative query-plan verification
- Shared/localized/schema changed-since-publication indicators
- Locale-local publication sequence and entry-global event sequence
- Durable publish/unpublish idempotency receipts
- Transactional audit and `cms.entry.published` / `cms.entry.unpublished` outbox events
- Real current-publication counts in locale lifecycle dependency checks
- Management publication status, validation, mutation, and history APIs
- Entry-editor publication status, validation feedback, publish, unpublish, and recent history UI
- Contract, pure-kernel, Effect, PostgreSQL, API, concurrency, failure-injection, UI, accessibility, and query-plan tests

### Deferred

- Public Delivery API endpoints, credential authentication, HTTP caching, ETag, Last-Modified, filtering, sorting, lookup, pagination, and expansion: M9
- Preview API and preview credentials: M10
- Outbox workers, webhook subscriptions, attempts, retries, replay, and dead-letter handling: M11
- Generated clients and schema locks: M12
- Editorial review/approval workflows and all-locale status dashboards: M13
- Entry archive/delete workflows and dependency-aware permanent deletion
- Bulk or scheduled publication
- Cross-entry transactional batch publication
- Locale-neutral reference publications, locale fallback, and automatic publication of referenced targets
- Automatic republishing when shared values, schemas, or referenced entries change
- Cache-provider integration; M8 emits deterministic invalidation data but does not introduce a cache backend

### Milestone-boundary reconciliation

M8 creates the storage and contracts that M9 will read, but it does not expose a public delivery route. M8 management APIs never become a substitute Delivery API.

M8 also does not introduce entry archive/delete workflows that M7 explicitly deferred. The current entry model has no archived/deleted state to transition into. M8 rejects publication when the project is archived, the CMS capability is unavailable, or the scoped entry/collection/environment does not exist. Any later entry lifecycle state must be added to the publication repository's active-entry predicate before that lifecycle is exposed. This satisfies the applicable M8 safety boundary without inventing an unused lifecycle column or an out-of-scope archive API.

## Core publication invariants

1. Publication scope is exactly one workspace, project, environment, collection, entry, and enabled project locale.
2. Every management publication operation carries an explicit canonical locale; there is no fallback or language negotiation.
3. Publishing one locale never creates, updates, publishes, unpublishes, or repoints another locale.
4. A publication captures the current shared revision and the current exact-locale revision; either source may be version `0`/`null`.
5. A publication uses only the collection's current published schema revision and exact contract hash.
6. Shared and localized source fragments remain immutable and are never rewritten during publication.
7. Delivery snapshots are compiled once at publication and are never reconstructed from mutable draft heads during delivery.
8. Existing publications and snapshots never change after shared, localized, schema, or reference state changes.
9. Unpublish clears only the selected locale's current pointer and preserves its drafts, publication records, snapshots, references, and command history.
10. A locale is publicly current only when its publication head points to one immutable publication.
11. Publication state, audit, outbox, and command receipt commit together or not at all.
12. Draft saves continue to write no production outbox events.
13. Entry display names, draft validation metadata, actor identities, command fingerprints, and authoring-only field metadata never enter delivery JSON.
14. Reference expansion state is pinned to immutable target publication IDs, never resolved silently to another locale.
15. No operation mutates an immutable publication, snapshot, or publication-reference edge.
16. All queries retain complete tenant/environment/collection/entry/locale predicates even when IDs are globally unique.
17. A referenced target requires a current publication in the exact source locale even when every target field is currently shared; M8 has no locale-neutral publication state.
18. Publish and unpublish run under explicitly configured PostgreSQL `READ COMMITTED`; reference targets are resolved once in one grouped statement and then pinned.
19. Snapshot compilation never truncates or silently drops content; an over-limit candidate fails before any publication artifact is written.

## Publication state model

### Publication head

Each entry and locale may have one mutable publication head.

- Missing head means publication state version `0`, no publication history, and no current publication.
- First state-changing publish creates version `1` and locale publication sequence `1`.
- Every state-changing publish or unpublish increments the head version once.
- Publish advances the locale-local publication sequence once.
- Unpublish retains the latest publication sequence and sets only the current pointer to `null`.
- A no-op publish or unpublish does not advance the head version or any sequence.

Example:

```text
English publish      -> head version 1, publication sequence 1, current publication A
English unpublish    -> head version 2, publication sequence 1, current publication null
English republish    -> head version 3, publication sequence 2, current publication B
Hindi publish        -> Hindi head version 1, Hindi publication sequence 1
```

The locale heads are independent. A shared entry lock serializes short state-changing commands only to provide one deterministic entry event order; it does not make locale publication state shared.

### Locale publication sequence

`publicationSequence` is positive, contiguous, and local to `(entryId, localeId)`. It identifies immutable published versions for Delivery responses and history.

Unpublish does not create a fake publication and therefore does not consume a locale publication sequence.

### Entry-global publication event sequence

`cms_entry` gains a non-negative `publication_event_sequence`, initially `0`. Every state-changing publish or unpublish increments it once while the entry row is locked.

This sequence is used as `outbox_event.aggregate_sequence` for entry publication events. It provides a total order across English, Hindi, Gujarati, and future locale state changes for one entry while allowing every locale to retain its own publication sequence.

No-op commands do not consume an event sequence.

## Selected schema authority

M8 selects exactly the collection's **current published schema revision** inside the locked transaction.

Publication validation and publish responses identify:

- `schemaRevisionId`
- `contractHash`
- schema revision sequence and profiles

A client cannot select an older schema revision for a new publication. Historical publications remain tied to their historical schema revisions, but new publications always use current schema authority. This preserves M7's published-schema-only authoring rule and prevents new production snapshots under stale or retired contracts.

A schema publication never rewrites existing entry publications. It makes affected locale status report `schemaChanged: true` until each locale is republished successfully.

## Source revision authority

A publication record captures:

- Shared draft version and nullable shared revision ID
- Exact-locale draft version and nullable locale revision ID
- Current published schema revision ID and contract hash

Version `0` requires a null source revision. Positive versions require a tenant-, entry-, and sequence-correlated immutable source revision.

Publish input includes the exact source versions/revision IDs returned by validation. The repository rechecks them under lock. A stale source returns a recoverable publication conflict and creates no artifact.

## Strict publication validation

M7's soft draft issues become hard M8 publication failures.

Publication rejects:

- Missing required shared or localized values without valid defaults
- Invalid configured string, number, decimal, money, date, date-time, enum, URL, email, slug, object, list, JSON, rich-text, reference, or external-asset values
- Unsafe or malformed structured values
- Values outside field, aggregate, depth, node, list, precision, scale, currency, or byte limits
- Unknown active-schema paths or partition collisions
- A missing current published schema
- Stale schema, contract, shared revision, locale revision, or publication-state authority
- References that are absent, in the wrong configured collection/scope, or not currently published in the same exact locale
- A compiled snapshot over the M8 aggregate limit

The strict validator returns at most 50 deterministic issues and a capped flag.

### Hidden-field issue redaction

Publication validates the complete contract, including fields hidden from the publisher's editor role. Management responses must not reveal hidden field IDs, API paths, values, reference IDs, or validation messages.

- Issues for role-visible fields retain bounded field/path/code/message detail.
- Any hidden-field failures are coalesced into one safe issue telling the publisher that a field unavailable to their role blocks publication and that an authorized schema/content manager must resolve it.

This keeps full publication correctness without weakening field-level read boundaries.

## Default materialization

Configured defaults are part of the selected schema contract and are materialized by the publication compiler when a value is absent.

- Defaults are applied recursively using the selected immutable field definitions.
- Mixed objects are synthesized when a shared or localized child produces a value/default.
- Defaults never write back to draft heads or create draft revisions.
- Defaults do not reappear in the management editor after a meaningful partition revision; the existing M7 editor rule remains unchanged.
- The compiled snapshot, not the draft fragment, is the authority for delivered defaulted values.

This permits a valid version-0 partition to publish when all missing required values have valid schema defaults while preserving authoring history semantics.

## Delivery snapshot compilation

### Input representation

The compiler receives:

- Current published schema revision and recursive field tree
- Current sparse shared stable-ID fragment
- Current sparse exact-locale stable-ID fragment
- Exact locale identity/tag
- Resolved target publication identities for every reference occurrence
- Source revision and publication authority

### Merge behavior

- Shared and localized sparse objects merge only through schema-approved mixed object containers.
- Terminal ownership is disjoint and validated.
- Atomic localized/shared objects and complete lists come from exactly one partition.
- Arrays are copied as atomic values and never deep-merged by index.
- Unknown/removed historical stable field IDs are preserved in draft history but omitted from the current snapshot.

### API-key projection

After strict validation/default application, the compiler recursively maps stable field IDs to API keys from the selected schema revision.

- Root and object-property API keys become JSON property names.
- List order remains authored order.
- Reference values remain stable entry IDs in delivery data.
- Structured rich text remains validated `ffd-portable-text@1` JSON; no HTML is generated.
- Exact decimals and money amounts remain canonical strings.
- Date-times remain canonical instants.
- External assets remain inert structured URL data and are never fetched.

### Snapshot document format

`ffd-delivery-snapshot@1` stores a complete read-ready document:

```json
{
  "version": 1,
  "entryId": "...",
  "collectionId": "...",
  "locale": "hi",
  "schemaRevisionId": "...",
  "contractHash": "...",
  "publicationId": "...",
  "publicationSequence": 2,
  "publishedAt": "...",
  "data": {}
}
```

The document excludes workspace ID, actor IDs, the CMS-only entry name, draft/source revision IDs, validation issues, audit metadata, command IDs/fingerprints, and editor-only metadata.

M9 may wrap or project this stored document into versioned public endpoint envelopes, but it must not rebuild `data` from drafts.

### Snapshot hashes

M8 records three deterministic hashes:

- `contentHash`: selected schema identity + canonical API-key data + pinned reference manifest
- `authorityHash`: content hash + exact shared/locale source revision identities and versions
- `documentHash`: final immutable snapshot document including publication identity/sequence/time

The validation endpoint returns the candidate `authorityHash`. Publish requires it and recomputes it under lock.

### Aggregate bounds and realistic-content gate

The preferred `ffd-delivery-snapshot@1` bound is **1,048,576 UTF-8 bytes** for the canonical delivery document plus canonical internal reference manifest. It remains a hard, source-controlled, versioned platform bound rather than tenant input or an environment variable.

The limit is provisional until an M8 pre-migration fixture gate measures the exact compiler output for:

- A realistic long-form Portable Text article
- Several external assets and nested object/list values
- Singular and list references with a meaningful occurrence manifest
- Long valid API keys and multilingual Unicode content
- A deliberately large but legitimate combined shared/localized entry
- Synthetic below/at/above-boundary candidates

The realistic large fixture must leave at least 25% headroom: combined canonical bytes must be at most **786,432 bytes**. The validation plan reports document bytes, reference-manifest bytes, combined bytes, configured maximum, and a fixed size bucket without returning content. If the realistic fixture exceeds that threshold, schema work stops for a developer-reviewed design amendment; M8 must examine content modeling, manifest duplication, separate component bounds, or a revised versioned aggregate limit rather than silently raising the constant.

### Pre-Drizzle realistic fixture report

**Status:** Developer-confirmed; Drizzle schema and developer-generated migration applied

The deterministic fixture at `packages/api/src/lib/publication-snapshot.fixture.test.ts` exercises 20 schema nodes across 15 root fields: a realistic multilingual long-form Portable Text article, eleven large shared/localized long-text values, nested mixed-localization objects, 12 inert external assets with long URLs and Unicode metadata, bounded structured JSON, long valid API keys, one singular reference, and 50 list-reference occurrences across 10 unique targets. The report locks these exact canonical measurements:

| Measurement                 | Bytes     | Share of 1 MiB maximum |
| --------------------------- | --------- | ---------------------- |
| Delivery document           | `675,221` | `64.39%`               |
| Internal reference manifest | `16,825`  | `1.60%`                |
| Combined                    | `692,046` | `66.00%`               |
| Remaining maximum headroom  | `356,530` | `34.00%`               |
| Margin below fixture gate   | `94,386`  | `9.00%` of maximum     |

The combined result is `94,386` bytes below the `786,432`-byte fixture gate and is classified in the fixed `large` bucket. `packages/api/src/lib/publication-snapshot.test.ts` separately locks synthetic candidates at `1,048,575`, `1,048,576`, and `1,048,577` bytes: below-boundary and exact-boundary candidates pass, the one-byte-over candidate fails without truncation, and exact document/manifest bytes remain available for safe validation feedback.

The report was reproduced with focused compiler, contract, and field-validation tests plus API type-checking. The developer explicitly confirmed these measurements and the provisional 1 MiB profile. The approved Drizzle schema is implemented; migration generation/application and append-only trigger insertion remain developer-controlled.

An over-limit candidate is a publication validation failure. M8 never truncates rich text, drops fields/references, partially publishes, or writes a snapshot, pointer, audit, outbox event, or receipt for that command.

No GIN index is added to snapshot JSON because M8/M9 retrieve snapshots by relational publication pointers. M9 must design explicit relational/filter indexes before exposing arbitrary field predicates.

## Reference publication semantics

### Same-locale strictness

Every present reference must resolve to:

- The configured target collection
- The same workspace/project/environment
- An existing target entry
- A current target publication for the exact source locale

No English, parent-language, regional, or project-order fallback is attempted.

A missing optional reference value remains valid. Once a reference value is present, it must resolve to a current exact-locale target publication even if the source field itself is optional. This intentionally prevents publishing a known broken public reference.

Publication context is locale-scoped, not inferred from the target's current field-localization mix. A Category, Author, Tag, or Settings entry containing only shared fields must still be published once in English, Hindi, and Gujarati before exact-locale source publications may reference it in those locales. M8 does not create a locale-neutral target publication, fall back to another locale, or auto-publish the target as a side effect.

“Current target publication” means the exact-locale head has a non-null pointer; it does not mean the target publication captures the latest target draft or schema. Once a target has a current publication in a locale, it does not need republishing for every source publication. Editors republish it only when they intentionally want newer shared/schema content reflected in that locale snapshot.

This editorial cost is an explicit trade-off for deterministic locale graphs, authorization, immutable expansion, and future localization without a publication-mode transition. Visible validation issues use a stable `reference_target_locale_unpublished` category and actionable exact-locale guidance. When the actor may read the target, management UI may show its bounded display name and an exact-locale editor link; otherwise the issue remains non-enumerating and generic.

### Immutable target pinning

The snapshot's internal reference manifest records each occurrence with bounded stable source field/path information and:

- Target collection ID
- Target entry ID
- Target publication ID
- Target publication sequence

The public base value remains the stable target entry ID. M9 bounded expansion will use the pinned immutable target publication, not whatever happens to be latest later.

### Relational reference edges

A normalized immutable publication-reference edge deduplicates `(sourcePublicationId, sourceFieldId, targetPublicationId)` and foreign-key-enforces both source and target publication existence.

The occurrence-level manifest remains in the snapshot because lists may reference the same target at multiple paths. The relational edge provides:

- Restrictive target-publication lifetime
- Future dependency/deletion checks
- Reverse dependency and invalidation support
- An indexed, bounded alternative to parsing JSON for graph relationships

### Concurrent target changes

Publication does not lock every referenced target entry, which would create cross-entry deadlock cycles and excessive contention.

Publish and unpublish explicitly request PostgreSQL `READ COMMITTED`; they never inherit the connection/session default. Publish resolves every deduplicated target entry in one grouped bounded SQL statement, so all target-head decisions use that statement's snapshot. The observed immutable target publication IDs are materialized and pinned for the rest of the transaction.

If an unpublish commits before that target-resolution statement begins, source publication fails. If target publication P is observed first, the source may pin immutable P even when unpublish commits before the source transaction finishes; the source linearizes before that unpublish and remains reproducible through P.

Republishing the source after the target is unpublished fails. Republishing after the target has a newer current publication captures the newer target publication and creates a new source publication even when source draft values are unchanged. A future move to `REPEATABLE READ` or `SERIALIZABLE` requires an explicit amendment and renewed concurrency proof/tests rather than a global configuration change.

First-publication self/cyclic references that have no current target publication cannot publish through single-entry M8 workflows. Supporting atomic cyclic batch publication requires a separately designed bulk workflow and is deferred.

## Staleness and pending-change semantics

Staleness is derived from immutable identities; M8 does not fan out writes to every locale when shared values or schemas change.

For an exact locale, status reports:

- `state`: `published | unpublished`
- Publication state version
- Current publication summary or null
- Current shared version/revision ID
- Current exact-locale version/revision ID
- Current schema revision ID/contract hash
- `sharedChanged`
- `localizedChanged`
- `schemaChanged`
- `changedSincePublication`

Comparison rules:

- `sharedChanged` compares current shared revision identity/version with the current publication source.
- `localizedChanged` compares the exact-locale revision identity/version.
- `schemaChanged` compares current published schema revision/contract identity.
- `changedSincePublication` is the union of those booleans.
- An unpublished locale is reported as unpublished rather than pretending to have a stale publication.

Reference-target freshness is resolved during publication validation rather than fan-out status mutation. The validation plan reports whether publishing would refresh pinned references and whether it would create a new publication.

Example:

```text
English publication captured shared revision 3
Hindi publication captured shared revision 3
Shared save creates revision 4
-> English sharedChanged = true
-> Hindi sharedChanged = true
Publish Hindi
-> Hindi captures shared revision 4 and sharedChanged = false
-> English remains on shared revision 3 and sharedChanged = true
```

No existing English snapshot is modified.

## Validation plan and time-of-check protection

`validatePublication` is a read-only, exact-locale operation. It performs the same bounded strict compilation and reference resolution needed by publish and returns:

- Strict visible/redacted issues and capped flag
- Current schema/contract authority
- Current shared/locale source authority
- Current publication state authority
- Candidate content and authority hashes
- Candidate snapshot size bucket/bytes when valid
- Deterministic changed field IDs
- Whether references would refresh
- Whether publish would be a no-op or create a publication

The plan is not a reservation. `publish` recomputes it under lock and requires the exact `authorityHash` plus expected source/publication state. Any drift returns a recoverable publication conflict rather than silently publishing a candidate the user did not review.

## Idempotency and no-op policy

### Command identity

Publish and unpublish use a fresh client UUID `commandId`. One immutable command receipt is unique per `(entryId, commandId)`.

The canonical SHA-256 command fingerprint includes:

- Operation kind
- Actor identity
- Complete persisted tenant, entry, and locale scope
- Expected publication head version/current publication ID
- For publish: schema/contract, shared/locale source authority, and candidate authority hash

Matching retries return the original command result without another publication, snapshot, edge, pointer update, audit, outbox event, or sequence.

Reusing a command ID with different authority returns `ENTRY_COMMAND_CONFLICT`.

### Command-receipt retention

M8 publication-command receipts are retained for the lifetime of the project. M8 adds no expiry, cleanup job, or ordinary delete path. Receipts contain only bounded operational provenance—scope, operation, fingerprint, result identities/versions, actor, and completion time—and never draft or snapshot values.

This preserves the stated durable retry contract. Removing a receipt without changing that contract would make an old retry indistinguishable from a new command. It could return a conflict instead of the original success, lose incompatible-command-ID detection, or repeat a side effect. No-op and unpublish receipts are especially important because no newly created immutable publication necessarily exists as alternate evidence of the completed command.

This also makes the pre-existing command lifecycle explicit:

- M5 state-changing schema-publication command identity is embedded in the immutable schema revision and therefore follows schema-history retention. M5 no-op publication commands are not persisted and were only defined as naturally idempotent while the schema hash remains unchanged.
- M7 stores every accepted save/restore command, including no-ops, in `cms_entry_draft_command`. Those receipts remain project-lifetime records under the existing durable-replay contract; M8 does not introduce retroactive cleanup.

M14 must review command receipts together with audit, outbox, backup, privacy, and historical-artifact retention. A future finite policy must define an explicit idempotency window, deterministic behavior for expired command IDs, a tombstone or equivalent that prevents expired IDs from being executed as fresh commands, safe bounded cleanup/indexing, and consistent M5/M7/M8 semantics before deleting any receipt.

### Publish no-op

Publish is a no-op only when the current publication already captures the exact:

- Schema revision and contract
- Shared source revision/version
- Locale source revision/version
- Compiled content
- Pinned reference manifest

A content-equivalent draft reached through a newer source revision is **not** a no-op; it creates a publication so source staleness clears and provenance is exact.

A currently unpublished locale always creates a new publication when publish succeeds, even if its latest historical snapshot had identical content.

### Unpublish no-op

Unpublish is a no-op when the selected locale already has no current publication and the input expects that state. It records a durable no-op receipt but creates no audit/outbox event and consumes no sequence.

A stale expected current publication or head version returns a publication conflict.

## Concurrency and lock order

### Global order

M8 entry publication mutations use:

1. Project row `FOR SHARE`
2. Collection row `FOR SHARE`
3. Entry row `FOR UPDATE`
4. Shared draft head `FOR SHARE`/locked authoritative read
5. Exact-locale draft head
6. Exact-locale publication head `FOR UPDATE`
7. Immutable publication/snapshot/reference/audit/outbox/receipt inserts

Rows within a bounded set are always visited in stable ID order.

Schema publication takes the collection write lock; locale lifecycle mutation takes the project write lock. Therefore schema and locale authority cannot change across the source publication transaction.

### Transaction isolation

The repository passes `READ COMMITTED` explicitly when opening every publish/unpublish transaction. It does not issue a mutable session-wide setting or rely on the database default. Integration tests inspect `SHOW transaction_isolation` inside the transaction and stage target unpublish immediately before and after the one grouped reference-resolution statement.

Read-only preflight validation is not a reservation. Publish repeats resolution under the explicit transaction and requires the reviewed authority hash, so any source/schema/reference drift either produces the documented linearized target pin or a recoverable conflict/validation failure.

### Concurrent outcomes

- Different locales may wait briefly on the entry event-sequence lock, then both succeed and update only their own locale heads.
- Same-locale concurrent publish commands with the same expected state produce one winner and one recoverable conflict unless they are the same matching command retry.
- Publish versus unpublish on the same locale produces one winner and one conflict.
- A draft save and publish serialize on the entry/head order; publish either captures the reviewed source or rejects drift.
- Event sequences remain positive and monotonic across all locale state changes for the entry.
- Locale publication sequences remain positive and monotonic only for that locale.

Transactions contain no network calls, URL fetches, telemetry export, cache calls, or user interaction.

## Atomic publish workflow

One publish transaction performs:

1. Lock project and authorize `content.publish` for the exact enabled locale.
2. Require active project, enabled CMS capability, and exact environment/collection/entry scope.
3. Lock collection and entry in global order.
4. Check matching/incompatible command receipt reuse.
5. Lock/read shared, exact-locale, and publication heads.
6. Verify expected publication state, source revisions, current schema, and contract.
7. Load bounded immutable source values and current/previous publication metadata.
8. Strictly merge, validate, apply defaults, resolve references, compile the API-key snapshot, and recompute hashes.
9. Require the exact reviewed candidate authority hash.
10. Return a durable no-op receipt when the current publication already captures the exact authority.
11. Increment entry-global event sequence and locale publication sequence.
12. Insert the immutable publication record.
13. Insert the immutable delivery snapshot.
14. Insert deduplicated immutable publication-reference edges.
15. Insert/update only the exact-locale publication head.
16. Insert the immutable audit event.
17. Insert `cms.entry.published` into the existing outbox.
18. Insert the durable command receipt.
19. Commit all state or none.

Failure injection follows the material stages: event sequence, publication, snapshot, references, pointer, audit, outbox, and receipt.

## Atomic unpublish workflow

One unpublish transaction performs:

1. Lock/authorize the same exact scope and active project/CMS state.
2. Lock collection, entry, and exact-locale publication head.
3. Check command replay and expected publication state.
4. Write a durable no-op receipt when already unpublished.
5. Increment entry-global event sequence and head state version.
6. Set only the selected locale's current publication pointer to null.
7. Insert an audit event referencing the publication removed from current state.
8. Insert `cms.entry.unpublished` with that publication/schema identity.
9. Insert the durable command receipt.
10. Commit all state or none.

No source draft, immutable publication, snapshot, reference edge, or other locale head changes.

## Database design

All new IDs use PostgreSQL 18 `uuidv7()`. Timestamps use `timestamp with time zone`. Foreign keys are restrictive. Every environment-scoped table carries workspace, project, environment, collection, entry, and locale scope where applicable.

### Database-enforced append-only artifacts

M8's immutable publication, delivery-snapshot, publication-reference, and publication-command tables reject `UPDATE` and `DELETE` in PostgreSQL, not only through application convention.

The developer-controlled migration must add one narrowly scoped trigger function that raises on update/delete plus `BEFORE UPDATE OR DELETE` triggers on those four tables. Drizzle remains the declarative table/constraint source, while the trigger DDL is an explicitly reviewed migration addition because Drizzle does not model this append-only policy.

- Normal publication workflows insert only.
- Mutable current state remains isolated in `cms_entry_locale_publication_head` and the entry event-sequence column.
- Future permanent deletion/export/repair requires a separately authorized administrative design; it cannot silently mutate history through ordinary application credentials.
- Integration tests execute direct update/delete attempts and require PostgreSQL rejection while proving head updates still work.

The agent will not edit, generate, or execute this trigger migration SQL. After design approval and developer-generated migration handoff, the agent will provide the exact reviewed trigger DDL for the developer to add manually and will inspect the result read-only.

### Extend `cms_entry`

Add:

- `publication_event_sequence`: non-negative integer, default `0`, not null

The field advances only for state-changing publish/unpublish operations. It does not change `name_version`, draft versions, or entry `updated_at` authoring semantics.

### Add `cms_entry_locale_publication`

Immutable publication metadata:

- Publication UUIDv7 ID
- Complete tenant/environment/collection/entry/locale scope
- Positive locale-local `publication_sequence`
- Positive entry-global `event_sequence`
- Nullable previous publication ID for the same entry/locale
- Published schema revision ID and contract hash
- Shared source version and nullable shared revision ID
- Locale source version and nullable locale revision ID
- Content hash and authority hash
- Bounded unique changed field IDs, allowing an empty set for metadata-only publication
- Command ID and command fingerprint
- Publisher and publication time

Constraints/indexes:

- Complete tenant FKs to entry, locale, schema, and source revisions
- Source version/null consistency
- Same-entry/locale previous-publication FK
- Unique `(entry_id, locale_id, publication_sequence)`
- Unique `(entry_id, event_sequence)`
- Unique `(entry_id, command_id)` for state-changing publish provenance
- Composite publication identity for heads, snapshots, edges, outbox, and receipts
- History index `(entry_id, locale_id, publication_sequence desc, id desc)`
- Schema/source/previous/publisher supporting indexes
- Hash, sequence, changed-field, and timestamp checks

There is no application update/delete method.

### Add `cms_entry_locale_delivery_snapshot`

One immutable read-optimized snapshot per publication:

- `publication_id` primary key
- Complete source publication scope
- `format_version = 1`
- Bounded JSONB `document`
- Document hash
- Bounded JSONB internal `reference_manifest`
- Reference-manifest hash
- Canonical document, reference-manifest, and combined byte counts

The three persisted counters let a database check enforce the approved aggregate 1 MiB bound without substituting PostgreSQL's whitespace-bearing `jsonb::text` representation for the compiler's canonical encoding. The combined count must equal the two component counts and remain at or below the profile maximum.

It has one restrictive composite FK to the publication and no update/delete application path. JSONB is not GIN-indexed.

### Add `cms_entry_locale_publication_reference`

Immutable deduplicated reference edges:

- Source publication ID
- Source stable field ID
- Target publication ID
- Complete source tenant scope
- Target collection and entry identity needed for tenant-correlated FKs

Primary identity is `(source_publication_id, source_field_id, target_publication_id)`. Restrictive composite FKs enforce source field/publication and target publication scope. A reverse target-publication index supports dependency queries; source lookup is covered by the primary key.

### Add `cms_entry_locale_publication_head`

Mutable exact-locale state:

- Entry and locale composite primary identity plus complete tenant scope
- Positive optimistic `version`
- Positive `latest_publication_sequence`
- Nullable `current_publication_id`
- Last changer and update time

Constraints/indexes:

- Tenant FKs to entry and locale
- Current publication FK correlated by entry/locale/sequence/scope
- Current delivery lookup index on `(entry_id, locale_id)` through the primary key
- One partial current-publication index `(locale_id, collection_id, entry_id)` where current publication is not null
- Current publication and actor supporting indexes

The locale-leading partial index serves the M8 locale dependency query and the explicit-locale collection traversal foundation for M9. M8 does not add a second conceptually named partial index unless representative `EXPLAIN` plans demonstrate that it earns its write/storage cost. A head remains after unpublish so optimistic version and publication sequence history are preserved.

### Add `cms_entry_publication_command`

Immutable publish/unpublish receipt:

- `(entry_id, command_id)` primary identity
- Complete tenant/locale scope
- `publish | unpublish` operation
- Command fingerprint
- `changed | no_op` result kind
- Result publication-head version
- Nullable result current publication ID
- Result latest publication sequence
- Nullable result event sequence for no-op/state-changing correlation
- Completer and completion time

Foreign keys correlate any publication result to the same entry/locale/tenant. Checks enforce zero/null and positive-result consistency. The primary key is the idempotent lookup path; locale and actor indexes support FK/operational paths. Rows are retained for the project lifetime and contain no content values; M8 has no receipt-expiry or cleanup query path.

### Extend `outbox_event`

Add nullable:

- `locale_id`
- `entry_publication_id`

For schema events both remain null. For `cms.entry.published` and `cms.entry.unpublished`:

- Subject type is `cms.entry`
- Subject ID is the stable entry ID
- Locale ID, entry publication ID, and schema revision ID are required
- Aggregate sequence is the entry-global publication event sequence

Composite restrictive FKs enforce locale and publication scope. Partial indexes support entry-publication and locale event inspection. The existing pending-worker index and generic outbox lifecycle remain unchanged.

### Locale dependency integration

`LocaleRepository.selectLocaleDependencies` will count publication heads whose current pointer is non-null for the exact tenant/project/locale, capped at 100 with the existing `LocaleDependencySummary` contract.

A current publication continues to block locale disable/remove with no override. Historical publications do not block because locale identity/history are preserved.

## Effect and repository architecture

### Pure `PublicationEngine`

A focused dependency-light kernel/service owns:

- Stable fragment merge and ownership validation
- Strict value/default compilation
- Stable-ID to API-key projection
- Snapshot document and reference-manifest canonicalization
- Content, authority, document, and manifest hashing
- Snapshot aggregate-size enforcement
- Deterministic changed-field calculation
- Validation plan construction

The pure implementation may reuse existing dependency-light entry/field helpers. It must not import Drizzle, Better Auth, Express, telemetry, server configuration, or call `Effect.run*`.

The service exposes named `Effect.fn` methods through a replaceable `PublicationEngine` Layer for operation and property tests.

### `PublicationRepository`

A focused repository owns:

- Exact tenant/locale authorization
- Lock ordering and transactions
- Current schema/source/publication loading
- Grouped current target-publication resolution
- Idempotency receipts
- Publication/snapshot/reference/head persistence
- Audit/outbox writes
- Publication history/status reads
- Database failure translation

M8 does not grow `EntryRepository` or `SchemaRepository` into another responsibility.

Stable Drizzle remains Promise-native in repository adapters and is wrapped with `Effect.tryPromise`. Known state/constraint failures become typed domain failures; unknown driver errors become redacted `DatabaseFailure` values.

### Operations and runtime

Named operations live in `packages/api/src/operations/publications.ts`:

- `getEntryPublicationStatus`
- `validateEntryPublication`
- `publishEntryLocale`
- `unpublishEntryLocale`
- `listEntryPublications`

`PublicationEngine` and `PublicationRepository` Layers join the existing application Layer and shared `ManagedRuntime`. No request-local runtime, local production `Effect.provide`, dependency upgrade, or business-layer Promise leak is introduced.

## Authorization and non-enumeration

- Better Auth establishes the human session only.
- Status/history require `content.read` for the exact locale.
- Validation, publish, and unpublish require `content.publish` for the exact locale.
- Owner, developer, content administrator, and reviewer behavior follows the existing fixed role policy.
- Editor/client-editor can save drafts but cannot publish.
- Selected-locale members can publish only selected enabled locales when their role grants `content.publish`.
- Publishing a locale captures all shared values but does not mutate shared state, so all-locale edit authority is not required for publication.
- Field editor metadata narrows management reads/issues but does not remove contract fields from the delivery snapshot.
- Client-supplied workspace, actor, sequence, publication ID, target publication, snapshot, event, audit, or hash output fields are never accepted as authority.
- Foreign/nonexistent project/environment/collection/entry/locale/publication identities remain non-enumerating.
- Known active members denied publication receive `FORBIDDEN`.
- No management response returns raw unprojected snapshot content.

## API contracts

All contracts use Effect Schema and the standard application response union.

### Publication status

`GetEntryPublicationStatusInput` includes project, environment, collection, entry, and explicit locale.

`EntryLocalePublicationStatus` includes:

- Exact locale identity/tag
- Publication head version
- Current publication summary or null
- Current shared/locale/schema authority
- Derived shared/localized/schema changed flags
- Combined changed-since-publication state

### Publication validation

`ValidateEntryPublicationInput` uses the same exact scope.

`EntryPublicationPlan` contains no content values. It returns bounded visible/redacted issues, authority identities/hashes, changed field IDs, document/reference-manifest/combined/max bytes and a fixed size bucket, reference refresh state, and `wouldCreatePublication`. Size measurements remain available for an oversized candidate so the rejection is actionable.

### Publish

`PublishEntryLocaleInput` includes:

- Exact scope and entry
- Command ID
- Expected publication head version/current publication ID
- Expected schema revision ID/contract hash
- Expected shared version/revision ID
- Expected localized version/revision ID
- Expected candidate authority hash

### Unpublish

`UnpublishEntryLocaleInput` includes exact scope/entry, command ID, expected publication head version, and expected current publication ID.

### History

`ListEntryPublicationsInput` includes exact scope/entry, bounded page limit, and an opaque scope-bound cursor. Results use descending immutable locale publication sequence with UUID tie-breaker.

Publication summaries expose stable IDs, sequences, source versions/revision IDs, schema identity, changed field IDs, snapshot hash/size, publisher/time, and whether the record is current. They expose no content document or reference manifest.

### Procedures

Protected management oRPC procedures:

- `platform.projects.collections.entries.publications.status`
- `platform.projects.collections.entries.publications.validate`
- `platform.projects.collections.entries.publications.publish`
- `platform.projects.collections.entries.publications.unpublish`
- `platform.projects.collections.entries.publications.list`

M8 adds no public Express Delivery route.

### Typed failures

Add centralized schema-backed errors:

- `ENTRY_PUBLICATION_INVALID` → 422 with bounded visible/redacted issues
- `ENTRY_PUBLICATION_CONFLICT` → 409 with recoverable publication/shared/localized/schema authority details

Reuse:

- `ENTRY_COMMAND_CONFLICT` for incompatible command reuse
- `PUBLISHED_SCHEMA_REQUIRED`
- `LOCALE_UNAVAILABLE`
- `CMS_CAPABILITY_REQUIRED`
- `FORBIDDEN`
- `NOT_FOUND`
- `INVALID_STATE_TRANSITION`
- `VALIDATION_ERROR`
- Redacted infrastructure failures

`ApiErrorDetail` gains publication/schema conflict scope only if required by the final contract; unrelated errors must not acquire meaningless optional fields.

## Audit and outbox contracts

### Audit actions

- `cms.entry.locale.published`
- `cms.entry.locale.unpublished`

Publish audit resource is the new immutable publication ID. Unpublish also references the publication removed from current state. Audit rows include stable scope/actor/resource/request/time only.

They exclude locale tags, entry names, source values, snapshot data, reference IDs, validation issues, hashes, command IDs/fingerprints, and changed-field arrays.

No-op commands create no audit event.

### Outbox events

Event types:

- `cms.entry.published`
- `cms.entry.unpublished`

Version-1 payload includes only:

- Event/project/environment/collection/entry identities
- Locale ID and canonical locale tag
- Publication ID and locale publication sequence
- Entry-global event sequence
- Schema revision ID and contract hash
- Bounded changed field IDs
- Stable invalidation tags
- Occurred time from the outbox row/event envelope

Invalidation tags use stable IDs:

- `project:{projectId}`
- `environment:{environmentId}`
- `collection:{collectionId}`
- `entry:{entryId}`
- `locale:{localeId}`
- `field:{fieldId}` for changed fields

Payloads contain no draft/snapshot values, display names, actor IDs, asset URLs, rich text, reference manifests, credentials, request bodies, or secrets.

M11 owns worker delivery and webhook envelopes. M8 guarantees durable event identity and atomic creation only.

## Observability

Named spans cover status, validation, reference resolution, compilation, publish, unpublish, and history.

Safe span annotations may include stable project/environment/collection/entry/locale/publication IDs, operation, bounded issue/field/reference counts, publication sequence, event sequence, result, and size bucket. They exclude content, locale display name, entry name, field paths/messages, hashes, URLs, rich text, and reference target IDs.

Add bounded metrics:

- Entry publication operation count by `validate | publish | unpublish` and bounded outcome
- Publication validation failure count by bounded category, including `reference_target_locale_unpublished` and `snapshot_size_exceeded`
- Publish/unpublish duration histogram by operation/outcome
- Snapshot size histogram and fixed size bucket
- Reference count bucket

No tenant/resource/user/locale IDs or tags become metric labels.

Telemetry export remains outside database transactions and cannot roll back or crash publication state.

## UI and UX

### Exact-locale publication card

The selected locale editor gains a publication card composed from existing shadcn primitives:

- Text status: Published or Unpublished
- Current publication sequence and `Intl.DateTimeFormat` time when published
- Explicit Shared changed / Locale changed / Schema changed text badges
- Current captured shared and locale draft versions
- Recent immutable publication history summaries
- Publish action only when exact-locale `content.publish` is allowed
- Unpublish action only when a current publication exists and permission is allowed

No state is conveyed by color alone.

### Publish flow

1. Local unsaved form changes disable publication and instruct the user to save the draft first.
2. Opening publish starts the exact-locale validation query; expensive validation is not prefetched for every locale/tab.
3. The dialog names the exact locale and explains that it captures current shared values only for this locale.
4. Strict issues appear in an accessible summary; visible field issues link/focus their controls where practical.
5. An authorized visible `reference_target_locale_unpublished` issue explains that even a shared-only target needs its own publication in the selected locale and links to that exact-locale target editor. Hidden/inaccessible targets use the generic safe explanation.
6. Snapshot-size rejection shows document, manifest, combined, and maximum bytes without exposing content and never offers truncation or partial publication.
7. A valid plan states whether a publication will be created or the exact candidate is already current.
8. Confirm submits the exact plan authority and a fresh command ID.
9. Success invalidates/refetches authoritative status/history/draft-related queries and announces the result.

Publish is never optimistic in the query cache because source versions, references, hashes, sequences, and pointers are server-owned.

### Unpublish flow

An `AlertDialog` states:

- Only the selected locale is removed from latest delivery.
- Drafts and immutable publication history remain.
- Other locales are unchanged.
- Republishing later creates a new publication sequence.

The action uses a specific label such as `Unpublish Hindi`, remains enabled until submission starts, then shows `Unpublishing…` with a spinner.

### Query and route behavior

- Existing validated `?locale=` remains the URL authority.
- Route loaders prefetch cheap selected-locale status/history in parallel with draft/form/revision queries after project/locale dependencies resolve.
- Publication validation is loaded on intent/dialog open, not for every route render.
- Query keys include project, environment, collection, entry, exact locale, and pagination inputs.
- Publish/unpublish invalidation targets selected status/history, selected draft validation/status, collection entry surfaces that later display publication state, and locale settings dependency state.
- Draft save invalidates selected publication status because staleness is derived from source identities.
- Heavy rich-text code remains lazy and M8 publication metadata adds no new initial-route dependency.
- Existing non-nested entry-editor route structure remains unchanged.

### Accessibility and composition

- Existing `Card`, `Badge`, `Alert`, `Dialog`, `AlertDialog`, `Field`, `Spinner`, and button variants are composed rather than replaced with custom widgets.
- Dialogs have titles/descriptions and deterministic focus return.
- Async validation/publication status uses polite live regions.
- Errors are inline and summarized; first actionable issue can receive focus.
- Icon-only controls have accessible names; decorative icons are hidden.
- Buttons, not clickable `div`/`span` elements, own actions.
- Long locale/entry/status text wraps or truncates safely with `min-w-0`.
- Dates use `Intl.DateTimeFormat`; identifiers use `translate="no"`.
- Existing unsaved navigation and locale-switch guards remain authoritative.

## Security and threat model

| Threat/failure                                                | Control                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Cross-tenant publication or pointer injection                 | Complete tenant predicates/FKs, persisted scope derivation, non-enumerating outcomes            |
| Locale fallback or cross-locale reference                     | Required exact locale, exact enabled-locale policy, same-locale target publication lookup       |
| Editor publishes without authority                            | Server-side `content.publish`; UI hiding is convenience only                                    |
| Selected-locale user publishes another locale                 | Exact locale policy context and allowlist enforcement                                           |
| Hidden field disclosed in validation                          | Full internal validation plus role-visible details and one coalesced hidden blocker             |
| Draft leaks through management/public paths                   | Snapshot has no public M8 route; M9 reads only current immutable snapshots                      |
| Stale review publishes changed values                         | Exact source/schema/publication authority and recomputed candidate authority hash               |
| Retry duplicates publication/event                            | Durable receipt, command fingerprint, unique sequences, transaction                             |
| Shared edit mutates English snapshot while publishing Hindi   | Insert-only snapshots and exact-locale pointer update                                           |
| Reference target disappears or changes                        | Immutable target-publication pin, relational restrictive edge, grouped current lookup           |
| Reference graph causes N+1 or unbounded work                  | 1,000 unique reference cap, grouped queries, deduplicated edges                                 |
| Cross-entry reference locking deadlock                        | No target entry locks; immutable observed target publication is pinned                          |
| Snapshot/resource exhaustion                                  | Existing value bounds plus 1 MiB aggregate snapshot/manifest profile                            |
| Rich-text XSS                                                 | Existing strict Portable Text profile, no HTML generation or `dangerouslySetInnerHTML`          |
| External asset SSRF                                           | Publication validates inert URL data and performs no fetch/DNS/redirect/probe                   |
| Partial publication after failure                             | One transaction and failure injection after every artifact stage                                |
| Outbox/log leaks content                                      | Stable-ID/count-only payloads and existing recursive redaction                                  |
| Metric cardinality explosion                                  | Fixed operation/outcome/category/size/reference buckets only                                    |
| Deadlock under concurrent publish/save/schema/locale mutation | Global project → collection → entry → heads order                                               |
| Historical snapshot mutation/deletion                         | PostgreSQL append-only triggers, no update/delete API, and restrictive historical relationships |

## Performance and reliability

- Publication performs expensive validation/compilation once; delivery never rebuilds drafts.
- Snapshot and reference work is bounded by the existing 100-field tree, 1,000 unique references, and 1 MiB aggregate output.
- Reference availability uses grouped `IN`/join queries, never one query per reference.
- Current Delivery lookup is a head primary-key lookup plus immutable publication/snapshot lookup.
- One locale-leading partial `(locale, collection, entry)` current index supports locale dependencies and explicit-locale collection traversal without duplicate write amplification.
- Publication history uses descending keyset pagination.
- JSONB snapshots are not over-indexed.
- Publication-command receipts are bounded per row but grow with accepted commands; project-lifetime retention is explicit and M14 owns the cross-system retention review.
- Transactions make no network/telemetry/cache calls and use stable short lock ordering.
- No automatic fan-out update occurs after shared saves or schema publication.
- Failure injection and concurrency tests verify no sequence gaps from rolled-back transactions and no partial artifacts.

## Test plan

### Contract and pure-kernel tests

- Publication/head/command/snapshot IDs and branded type separation
- Exact-locale input required; malformed/oversized tags rejected; no fallback
- Publication status union and source/schema staleness truth table
- Shared/localized mixed-object merge and atomic-list behavior
- Stable-ID to API-key projection across nested objects/lists
- API-key rename under a new schema does not orphan stable values
- Default materialization for every supported default-bearing kind
- Exact decimal/money/date-time/rich-text/external-asset canonical preservation
- Unknown/removed stable fields omitted from current snapshots
- Snapshot document, manifest, content/authority/document hash byte stability
- Source-equivalent versus newer-source no-op behavior
- Snapshot document/manifest/combined/max measurement below/at/above 1 MiB with no truncation
- Exact realistic long-form/assets/nested/reference/Unicode fixture measurements and the 786,432-byte headroom gate
- Reference manifest occurrence ordering/deduplication and same-locale pinning
- Deterministic changed-field IDs for value, schema, and reference changes
- Hidden issue redaction and 50-issue cap
- Publication cursor round trip, tamper, scope mismatch, and bounds
- New error/status/envelope/OpenAPI snapshots

### Effect service and operation tests

- Replaceable `PublicationEngine`/repository/clock/telemetry Layers
- Named validate/publish/unpublish/status/history operations
- Expected failures remain typed and distinct from defects/interruption
- Matching command replay and incompatible reuse
- Safe span/log fields and bounded metrics
- No content, URL, rich-text, reference, hash, or validation message in observability

### PostgreSQL integration

- English publish creates only English publication/head/snapshot/reference/audit/outbox/receipt
- Hindi/Gujarati remain unpublished until explicitly published
- Version-0 shared/locale sources publish when the strict/defaulted contract permits
- Shared revision 1 captured by English remains unchanged after shared revision 2 and Hindi publication
- Derived staleness clears only for the republished locale
- Schema publication leaves existing snapshots immutable and marks schema stale
- Required/invalid shared/localized values reject atomically
- Missing, wrong-collection, wrong-environment, foreign-tenant, and same-locale-unpublished references reject uniformly
- A shared-only target must be independently current in English/Hindi/Gujarati; one locale never satisfies another
- A current but draft/schema-stale target remains referenceable without redundant republish
- Reference target publication IDs are pinned and restrictive edges survive target unpublish/republish
- Present optional references also require a current exact-locale target publication
- Current publication count blocks locale disable/remove; unpublish clears only the current dependency
- Same command retry returns one logical result; incompatible reuse fails
- Content-equivalent newer source revision creates a new publication and clears staleness
- Exact current authority is a durable no-op with no sequence/audit/outbox noise
- Concurrent same-locale publish has one winner/conflict
- Concurrent English/Hindi publishes both succeed with locale-local sequences and monotonic entry event sequences
- Publish/unpublish transactions report explicit `read committed` isolation inside the transaction
- One grouped target-resolution statement sees an unpublish committed before it and rejects; resolution before unpublish pins the observed immutable target safely
- Publish/save and publish/schema/locale lifecycle races serialize or conflict safely
- Unpublish affects one locale, preserves drafts/history/snapshots, and is idempotent
- Republish after unpublish creates a new locale publication sequence
- Failure injection after event sequence, publication, snapshot, references, pointer, audit, outbox, and receipt leaves no partial state or committed sequence gap
- Restrictive publication/source/schema/target/snapshot/head/receipt foreign keys
- Direct PostgreSQL update/delete attempts on publication, snapshot, reference-edge, and command-receipt tables are rejected by append-only triggers
- No repository update/delete path for immutable artifacts
- Representative-cardinality `EXPLAIN (ANALYZE, BUFFERS)` plans for current exact lookup, locale-leading collection traversal, locale dependency count, history, command lookup, and reverse reference edges
- Query-plan evidence before adding any second current-head partial index
- Complete fixture and invariant cleanup

### API and policy tests

- Anonymous denial for every M8 procedure
- Role matrix for status/history/validate/publish/unpublish
- Editor/client-editor denied publish while reviewer/content-admin can publish allowed locales
- All/selected/none locale access matrix
- Foreign/nonexistent scope non-enumeration and known-member forbidden behavior
- Extra fields cannot inject actor/workspace/sequence/pointer/snapshot/reference/event authority
- Validation plan drift returns recoverable `ENTRY_PUBLICATION_CONFLICT`
- Hidden issues are not exposed
- Standard response envelope, request ID, HTTP mapping, bounded details, and OpenAPI
- Delivery/preview credentials still have no M8 management/draft route

### UI and accessibility tests

- Published/unpublished and shared/localized/schema changed text for English/Hindi/Gujarati
- Saving a shared draft marks existing locale publications changed without mutating snapshots
- Publish disabled while local editor state is dirty
- Validation loads on publish intent and reports strict issues accessibly
- Exact-locale shared-only target guidance, authorized target link, and hidden-target non-enumeration
- Oversized snapshot component/max-byte guidance with no truncation action
- Publish confirmation names exact locale and shared-snapshot semantics
- Permission-aware buttons for editor/reviewer/content-admin roles
- Unpublish confirmation states exact-locale impact and history preservation
- Conflict preserves local state and refetches authoritative status/plan
- Recent publication history shows immutable sequence/source versions
- Targeted query invalidation after save/publish/unpublish
- URL locale/back/forward behavior remains authoritative
- Keyboard/focus/live-region/dialog/alert/badge semantics and axe checks
- No state conveyed by color alone
- SSR/hydration and lazy rich-text bundle regressions

### Final gate after implementation

- `pnpm run ready`
- Production and full dependency audits
- `git diff --check`
- Read-only PostgreSQL migration/invariant/fixture/index verification
- The recorded pre-schema fixture report confirms developer acceptance at or below 786,432 combined canonical bytes
- Production build and bundle review
- Docker health and representative HTTP checks
- Developer manual English/Hindi/Gujarati publish/unpublish ordering review
- Developer verifies shared revision snapshots intentionally differ across locale publication history

## Decision-standard review

### Product-goal alignment

Independent locale heads, immutable snapshots, strict exact-locale references even for shared-only targets, and atomic events implement the CMS's central guarantee while preserving one stable entry identity for future Delivery, Preview, generated tooling, and visual bindings.

### Correctness

Exact source/schema authority, explicit `READ COMMITTED` statement-snapshot semantics, strict validation/default materialization, stable-ID merge, API-key compilation, pinned reference publications, dual sequence semantics, durable receipts, and transactional pointers prevent fallback, stale publication, duplicate state, and mutable history.

### Security

Default-deny exact-locale authorization, tenant-composite FKs, non-enumeration, hidden-issue redaction, no raw management snapshot response, no draft delivery route, bounded untrusted input, no URL fetching, and content-free observability prevent privilege escalation, disclosure, XSS, SSRF, and resource abuse.

### Reliability

Short ordered transactions, immutable target pins, command replay, optimistic head authority, no fan-out stale writes, rollback injection, and no external calls under lock prevent partial state, deadlocks, and retry duplication.

### Performance

Publication compiles once, all reference heads resolve in one grouped statement, histories paginate by keyset, one locale-leading partial index serves current scoped traversals, JSONB is not over-indexed, and realistic fixtures verify the bounded aggregate.

### UX

Exact locale naming, actionable shared-only target guidance, measured size failures, textual state, source-specific change indicators, save-before-publish protection, preflight validation, clear unpublish impact, conflict preservation, and accessible history make independent publication understandable to clients and reviewers.

### DX

Schema-backed models, stable publication IDs/sequences/hashes, deterministic snapshot format, explicit plan authority, typed errors, standard envelopes, and M9-ready current/immutable paths make integration predictable without exposing storage internals.

### Observability

Named Effect operations, publication duration/validation/size metrics, request correlation, immutable audits, and atomic outbox events diagnose production changes without logging content or creating high-cardinality labels.

### Maintainability and future compatibility

A focused engine/repository, generic outbox extension, fixture-gated snapshot profile, normalized immutable references, explicit isolation, locale-leading indexing, and separation from public Delivery/Preview routes let M9–M15 extend behavior without replacing entry, locale, schema, publication, or event identity.

## Database gate

Proposed migration name after design approval and Drizzle-schema implementation:

```text
add_locale_publications_and_delivery_snapshots
```

The agent must not generate, apply, push, execute, edit, or rewrite a migration. After explicit design approval, implementation begins with contracts and the pure compiler. Before any Drizzle snapshot table/check/index change, the exact realistic-content fixture report must satisfy the 786,432-byte headroom gate and receive developer confirmation. The agent then implements the confirmed Drizzle schema, stops at the developer-controlled migration gate, and provides the exact pnpm generation/application commands.

## Approval requested

Developer approval authorizes implementation of these material decisions:

1. Current-published-schema-only publication
2. Exact-locale independent heads and locale-local publication sequences
3. Entry-global event sequence for outbox ordering
4. Strict same-locale current-publication requirement for every present reference, including shared-only targets, with no locale-neutral fallback or automatic target publication
5. Actionable authorized target-locale UI guidance plus hidden-target non-enumeration
6. Immutable target-publication pinning plus normalized reference edges
7. Explicit `READ COMMITTED` publish/unpublish transactions and one grouped target-resolution statement
8. Default materialization only in compiled snapshots, without draft writes
9. Provisional 1 MiB aggregate snapshot profile with a 786,432-byte realistic-fixture gate before Drizzle schema work
10. One locale-leading partial current-publication index unless representative plans justify another
11. Derived shared/localized/schema staleness with no fan-out updates
12. Required preflight authority hash and durable changed/no-op command receipts
13. Separate immutable publication and delivery-snapshot artifacts
14. One-transaction publication/snapshot/pointer/audit/outbox/receipt behavior
15. M8 management UI/API scope with public Delivery deferred to M9
16. Project-lifetime M8 command-receipt retention, with any finite cross-system retention/idempotency policy deferred explicitly to M14
17. Proposed developer-controlled migration name
