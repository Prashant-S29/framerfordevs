# Milestone 19 Studio content and localization design

**Status:** Developer-approved design; the authorized M19A platform/content-protocol implementation is complete and awaiting independent review, while M19B remains gated

**Date:** 2026-09-27

## Decision summary

Milestone 19 moves ordinary content browsing and exact-locale draft authoring into the accepted mounted Studio without moving business authority into the browser or developer-owned application.

The approved design uses:

- A new immutable **Studio Content v1** server-to-server HTTP family at `/api/studio-content/v1`, authenticated only by the existing registration-bound Studio access token
- The accepted Studio v1 bootstrap, OAuth client, resource, scope, grant, encrypted BFF session, and eight-hour absolute deadline unchanged
- A finite app-local BFF content contract under the configured mount; it strictly decodes and adapts only named Studio Content operations and never becomes an arbitrary platform proxy
- One server-derived content context containing only effective locales and role-visible published collections
- Bounded keyset entry browsing plus case-insensitive display-name prefix search, capped permission-correct result counts, and a purpose-built PostgreSQL search index
- One role-projected entry-workspace response that binds the immutable published Presentation/form projection and the exact-locale draft to the same schema revision
- Stable-field-ID draft mutations through the existing M7 engines, with current server policy, locale, field visibility/editability, schema authority, optimistic versions, actor attribution, and command receipts rechecked on every write
- The existing `@framerfordevs/content-form` renderer for all 18 field kinds, extended only with a first-party bounded reference picker contract
- Explicit save, conflict, retry, unsaved-navigation, and three-way schema-drift recovery; no force save, hidden automatic merge, autosave, or last-write-wins retry
- A sequential implementation split: **M19A platform/content protocol** followed by **M19B mounted Studio experience**

M19 does not add revision history/restore, review, Preview, Presentation mutation, publish/unpublish, dashboard route retirement, client activity/handover, schema structure authoring, custom policy, or production rollout. Those remain M20–M21 or later work.

## Approval boundary

The developer approved this design, including the owner/developer amendment below, and separately authorized M19A platform/content-protocol implementation. That approval confirmed:

1. the new Studio Content v1 family while leaving accepted Studio v1 and Authoring v1 bytes unchanged;
2. the bounded meaning of hidden/read-only collections under the current fixed-role, locale, and field-presentation authority rather than a new persisted per-member collection policy;
3. the migration-backed prefix-search index and capped count contract;
4. the M19A/M19B implementation sequence; and
5. the absence of revision, publication, Preview, review, Presentation mutation, and handover work.

M19B, package publication, production OAuth/configuration, runtime activation, rollout, deployment, migration generation/application, commit, milestone acceptance, and M20 remain separately developer-controlled.

## Developer review amendment — 2026-09-27

The developer approved the design subject to explicit treatment of a published collection whose effective field-placement projection is empty.

The accepted M6/M13 invariants make role/Presentation misconfiguration unable to hide a non-empty valid published collection from an owner or developer:

- every field must keep both `owner` and `developer` in `visibleToRoles` and `editableByRoles`;
- every effective root placement must remain visible to both roles;
- every active root is placed exactly once; and
- every Presentation-only publication reruns the same field/layout validation before creating its immutable revision.

The historical M6 storage path is explicit: migration `0005_add_field_system_and_editor_layout.sql` added `editor_metadata` to both current and immutable revision fields with an empty-object (`{}`) backfill/default, not literal role arrays. `decodePersistedFieldEditorMetadataSync` treats that sentinel as `defaultFieldEditorMetadata`, whose `visibleToRoles` and `editableByRoles` both contain `owner` and `developer`. The targeted regression `packages/api/src/services/schema/legacy-editor-metadata.test.ts` — `expands the M6 empty-object backfill for historical M5 fields` locks this compatibility behavior so Studio projection cannot interpret pre-M6 fields as role-empty.

A collection may intentionally project to zero fields for another role, and remains omitted/non-enumerating for that role. An owner or developer instead receives the ordinary collection projection and can use the retained dashboard Presentation/current-structure authority to diagnose that narrower role configuration. There is therefore no separate “hidden because of Presentation” signal for a state that valid authority cannot produce for those support roles.

Two residual zero-projection cases are handled explicitly rather than masquerading as a missing collection:

1. A valid published collection with zero active fields is omitted from ordinary editor navigation but appears to an owner/developer in a bounded `configurationNotices` projection as `empty_schema` with only collection ID, display name, and reason. Its direct owner/developer Studio route fails with `STUDIO_COLLECTION_CONFIGURATION_INVALID` carrying only that closed reason. The browser renders the canonical dashboard recovery action from accepted shell metadata rather than a caller-supplied URL.
2. A non-empty published revision that nevertheless produces zero owner/developer placements is an invariant violation. Context exposes the same bounded owner/developer-only notice as `projection_invalid`, emits safe defect telemetry, and durably records one `cms.schema.projection_invalid_detected` audit per affected immutable schema revision. The first currently authorized owner/developer who detects that revision is the audit actor. Idempotency does not use check-then-insert or an assumed collection lock: `projectionInvalidAuditId` derives a namespaced deterministic UUID from the action/version and immutable schema revision ID, the repository supplies it as `audit_event.id`, and `INSERT ... ON CONFLICT (id) DO NOTHING` races against the existing `audit_event` primary key. A conflict path must then read that primary key and verify exact workspace/project/environment, action, `cms_schema_revision` resource type and revision ID, deterministic request marker, and user actor kind before accepting the prior event; a mismatched row fails closed. Audit persistence is response-gating rather than best effort. The direct owner/developer Studio route fails with the same code and only that closed reason rather than `NOT_FOUND`. No content, field, role array, or schema body is returned.

For every other role, both residual cases remain omitted and forged direct routes return the same non-enumerating `NOT_FOUND` as nonexistent/foreign collections. Foreign projects and callers without current project authority never receive configuration notices. Notice arrays are capped by the existing 50-collection project bound. `empty_schema` is an intentional valid state and does not emit the invariant audit.

Collection projection validation runs before all nested work. For an affected collection, owner/developer browse, search, new-entry workspace, entry workspace, create, rename, and save all return HTTP `409` with `STUDIO_COLLECTION_CONFIGURATION_INVALID` and only `empty_schema | projection_invalid`; no route degrades to an empty form, a downstream error, or mutation-engine behavior.

This amendment is part of the approved design and the authorized M19A implementation evidence.

## Final-review amendment — 2026-09-29

The developer authorized one M19A contract correction after final review found that the accepted M6 layout model permits a role to have effective sidebar placements while all tab placements are hidden. The shared generated-form projection had replaced that state with an empty synthetic tab and discarded the visible sidebar, while Studio Content also required at least one projected tab. Together those constraints incorrectly hid a valid sidebar-only role projection.

M19A now preserves role-visible sidebar groups when no tab is visible. The Studio form DTO permits zero tabs when at least one bounded sidebar group remains, while the BFF rejects a form with both tab and sidebar arrays empty. Empty tabs/groups remain omitted; no synthetic or duplicate field placement is exposed. The unaccepted Studio Content v1 candidate was regenerated before review at SHA-256 `c9226fdcc767d704a41e100a5440560afbb7f64977209f82d42dad20bc48a9fc`; accepted Authoring, Control Plane, and Studio v1 bytes remain unchanged.

The same final review also closed two protocol-boundary defects without changing the public DTO: real platform configuration failures now include the closed `configurationReason` required by the BFF, and the BFF enforces the search-specific 2 KiB body cap rather than only the general 1 MiB content cap. Unicode search now lowers the escaped SQL prefix inside PostgreSQL so query folding uses the same authority as the indexed display-name expression.

## Source hierarchy and discovery

This design follows, in order:

1. the product Studio surface and CMS PRD content/localization/editorial requirements;
2. repository session, source-of-truth, decision, milestone, API, Effect, security, localization/publication, performance, testing, monorepo, documentation, and reporting rules;
3. the accepted M3–M7, M13, and M18 decisions plus the public HTTP/CLI/SDK surface decision;
4. the accepted Studio bootstrap/runtime, Authoring content, entry, policy, locale, form, dashboard editor, and local-editor source and tests; and
5. current migration and public-contract history through `0020`.

Discovery started from clean `main` at `49e841d`, aligned with `origin/main`. No feature source, package manifest, migration, generated artifact, or runtime configuration was changed during design.

## Current implementation truth

M19 extends these accepted seams:

- Studio currently serves an authenticated empty client shell. Its BFF owns exact mount routing, OAuth, encrypted local sessions, refresh fencing, assets, logout, bootstrap adaptation, security headers, and strict local quotas.
- The browser receives only an opaque `HttpOnly` local-session cookie and a bounded bootstrap projection. OAuth access/refresh tokens remain encrypted in the BFF store.
- Studio v1 is an immutable 30,112-byte bootstrap-only baseline at SHA-256 `f3a70dee4d72057a3df982a6b4a4ff5192daea850b57810cfeb7caa498ef5b03`.
- Authoring v1 already supports generated-form reads and exact-locale entry list/create/get/rename/save through shared M6/M7 authority. Its immutable baseline is SHA-256 `d9500549cd95067857b87f494b77375e3d575c4832589478858e125ab3f31205`.
- Entry writes already preserve independent shared/localized versions, immutable revisions, stable-ID mutation authorization, idempotent command receipts, current schema checks, user-or-credential attribution, validation, and exact locale policy.
- Generated forms already project field and layout visibility/editability for the authenticated role and `@framerfordevs/content-form` renders all 18 kinds, mixed objects, atomic lists, tabs, groups, sidebar groups, defaults, server issues, and lazy Portable Text.
- Dashboard and local-editor UX already demonstrate explicit locale selection, separate shared/localized forms, optimistic conflicts, unsaved-change guards, entry creation/rename, and content-safe query behavior.

The following gaps are executable truth:

1. Studio has no content routes, nested shell routes, content browser contract, or content UI.
2. Studio bootstrap exposes only shell-level `project.read | project.update`, not current locale/content authority.
3. Authoring list has keyset pagination but no server-side search or result count.
4. The current entry index supports creation-order pages, not indexed case-insensitive display-name search.
5. Authoring uses API-key-facing DTOs intended for developer tools; Studio needs a smaller stable-ID, role-projected DTO without source keys, API keys, role arrays, or structure-authoring metadata.
6. Current form and draft reads are separate operations and can observe a schema publication between requests unless a Studio workspace operation binds them.
7. Current UI conflict handling preserves edits but does not provide a reusable stable-ID three-way schema-rebase kernel.
8. The reference control asks for a raw entry ID; that is acceptable for a developer editor but not the intended Studio workflow.
9. No persisted per-member collection allowlist or collection-level read/write override exists. M15 explicitly deferred persisted collection-specific policy.

M19 must resolve these gaps without claiming that a collection-policy model already exists.

## Scope

### Included

- Role-visible collection context and exact effective locale context
- Bounded entry browsing, prefix search, pagination, and capped result counts
- Direct collection/locale/entry route enforcement
- A role-projected Studio form DTO and all 18 generated controls
- Immutable current Presentation labels/help/layout as read-only authoring metadata
- Shared versus localized partitioning and exact-locale tabs
- Entry creation and locale-neutral rename
- Shared/localized draft saving and validation status
- Optimistic draft/name conflicts and explicit recovery
- Safe retry of receipt-backed ambiguous writes
- Unsaved locale/entry/collection/route/window navigation protection
- Current-schema drift detection and stable-ID three-way recovery
- Accessible loading, empty, unavailable, read-only, validation, conflict, and failure states
- Responsive large-list and large-form behavior
- Canonical Studio Content HTTP, app-local BFF contracts, public artifact registration, tests, and docs
- One entry display-name search index, subject to the developer migration gate

### Deferred and excluded

- Revision history, comparison, or restore
- Review submission, approval, or rejection
- Preview or Presentation-mode rendering
- Presentation mutation/publication
- Content publish/unpublish or publication status/history
- Translation-completion or changed-since-publication status
- Activity feeds and complete client-handover polish
- Retirement of dashboard editorial routes
- Schema structure, collection, field, locale, membership, role, or policy administration
- Persisted collection/entry-specific membership allowlists or custom policy
- Entry deletion, bulk mutation, full-text content search, arbitrary filters/sorts, or total unbounded counts
- Browser-direct platform bearer calls
- New OAuth scopes/resources/clients or changes to accepted grant/session lifetime
- Public SDK or CLI expansion solely for the Studio session projection
- Package publication, production activation/configuration, rollout, or deployment

## Load-bearing decisions

### 1. Add Studio Content v1; do not mutate accepted v1 baselines

M19 adds a separate canonical family:

```text
/api/studio-content/v1
```

It is registered as a new immutable public artifact with `sdkSupported: false`. Accepted Studio v1 remains bootstrap-only and byte-identical. Accepted Authoring v1 remains byte-identical.

Studio Content v1 accepts only a valid existing Studio token whose audience is the accepted logical Studio resource `${platformOrigin}/api/studio/v1` and whose exact scope set remains `studio:session offline_access`. The audience identifies the whole Studio resource boundary; it is not a promise that every operation shares the audience URI's route prefix.

This avoids:

- silently changing an accepted baseline;
- adding a second OAuth client per registration;
- changing active registration rows or OAuth resource associations;
- forcing existing M18 sessions through a new grant model; and
- accepting Authoring/management credentials at the Studio runtime boundary.

The new API reuses current Studio-token verification and then calls shared content/policy repositories as the exact user actor. It is not a second content engine.

### 2. Studio Content is a runtime projection, not a second automation surface

Canonical content business capability remains available through Authoring v1, the CLI, and the approved content-focused SDK. Studio Content v1 supplies a registration/session-bound human projection: effective navigation context, combined workspace reads, safe reference lookup, and the same underlying entry mutations.

The Studio-specific context/search/count/workspace shapes are runtime-only and do not add CLI or SDK methods. There is no new mutation available only to Studio. If implementation discovers a genuinely new content business operation rather than a projection/composition of accepted operations, work stops for a surface amendment and matching CLI decision.

### 3. Current policy defines collection visibility; M19 adds no hidden policy store

M19 does not invent persisted collection policy.

A collection is present in Studio only when all of the following hold:

1. the Studio principal currently has `content.read` in at least one enabled effective locale;
2. the collection belongs to the exact token-bound project/environment;
3. the collection has a current published schema revision; and
4. that revision's server-generated form projection contains at least one effective visible field placement for the principal's current role.

A collection failing those conditions is omitted from ordinary context and returns non-enumerating `NOT_FOUND` through a forged direct collection/entry route. An unpublished or entirely role-hidden collection is therefore hidden in M19. The developer-review amendment above is the only exception: a currently authorized owner/developer receives a bounded configuration notice for an empty schema or impossible invalid owner/developer projection, and the latter has a typed direct-route diagnostic.

A returned collection is read-only when no returned locale permits `content.write` or the projected form has no editable fields. Capabilities are returned as narrow booleans (`canCreate`, `canRename`, `canSaveLocalized`, `canSaveShared`) for rendering only; each operation reauthorizes independently.

`canSaveShared` additionally requires the accepted M7 all-locale authority. Selected-locale membership never gains shared-write authority merely because every currently rendered tab is selected.

This bounded interpretation preserves M15's explicit deferral of persisted collection-specific grants. Adding per-member collection policy later requires its own governance/Control Plane design and migration; it is not hidden inside M19.

### 4. Only effective enabled locales enter Studio payloads

The content context contains enabled project locales intersected with the current member's effective locale access and `content.read` policy. It preserves configured order and returns stable locale ID, canonical tag, display name, and current read/write capability.

Disabled, removed, ungranted, malformed, or foreign locales are absent. A forged direct locale request is rejected before draft/form data is loaded. No request or UI selects a fallback locale. If no locale is effective, Studio renders an authorized empty state and no collection/entry request is enabled.

English remains required for the project but is not automatically exposed to a member whose current locale grant excludes it.

### 5. Browser contracts use stable IDs but omit implementation metadata

Studio content routes use stable collection, entry, field, locale, schema-revision, and draft-revision identities. Labels and route positions never become authority.

The role-projected Studio form omits:

- collection/field/source API keys;
- source keys;
- role visibility/editability arrays;
- hidden tabs, groups, placements, fields, enum options, values, and issues;
- schema authoring/classification data; and
- actor, credential, publication, Preview, and control-plane metadata.

It contains only the stable identities needed for controlled values/mutations, effective labels/help/placeholders/layout, kind-correlated validation/configuration, effective editable field IDs, current schema revision and contract authority, and safe reference-target identity for the first-party picker.

Stable IDs may appear in routes and browser memory but are never displayed as editing instructions. M21 may further replace visible route forms with opaque handles if its complete handover threat review requires it; server authorization never relies on obscurity.

### 6. One workspace read binds form and draft authority

The principal entry read is a Studio workspace operation, not two unrelated browser fetches. Under one bounded repository workflow it returns:

- exact collection and locale identity;
- one role-projected immutable current form/Presentation;
- the named entry summary;
- projected shared and exact-locale values;
- shared/localized versions and revision IDs;
- exact schema revision and contract hash;
- current mutation capabilities; and
- role-safe validation status/issues.

Form and draft must name the same current published schema revision. A concurrent schema publication causes the operation to retry once before response or return a typed stale/unavailable result; it never combines revisions.

A separate new-entry workspace returns the same projected form/current authority without an entry draft. Defaults remain browser-local until an explicit create/save intent and never become server truth merely by rendering.

### 7. Hidden and read-only field behavior is server authority

Field projection follows the accepted M6 intersection of tab, group, placement, field visibility, field editability, project action, and locale policy.

- Hidden fields and descendants are absent from form, values, editable IDs, reference labels, and issue details.
- Visible read-only fields and their values may be returned but never enter `editableFieldIds`.
- A hidden parent hides its complete subtree.
- A list item inherits the accepted list-parent editor access.
- Mixed objects retain disjoint shared/localized descendant ownership.
- Guessed hidden/read-only field paths are rejected generically by the stable-ID mutation-authority kernel before write.
- The server computes complete validation but projects only visible issue details. If inaccessible fields prevent complete validity, the response reports a closed `restricted_issues` status without field count, ID, path, label, or value.

Client disabling and filtering are UX only. Mutation authorization remains in the M7 transaction under current schema and policy.

### 8. Search is prefix-only, indexed, query-bound, and count-capped

Entry browse remains ordered by immutable `(createdAt DESC, entryId DESC)` authority and uses the accepted collection index.

Search operates only on the locale-neutral CMS display name:

- empty query means browse;
- non-empty query is trimmed, NFC-normalized, 2–100 characters, control-free, and compared case-insensitively;
- semantics are **name starts with query**, not substring/full-text/content search;
- `%`, `_`, and escape characters are treated literally;
- results are ordered by normalized display name then entry ID; and
- the cursor binds version, mode, project, environment, collection, exact locale, normalized query digest, ordering values, and expiry.

The PostgreSQL query uses the matching text-pattern comparison operators for continuation and ordering (`~>~` and `USING ~<~`). This preserves the same `C`-collated lexical semantics while allowing the expression index to satisfy prefix filtering, stable ordering, and continuation without a separate sort.

Page limit is 10–50; Studio uses 25 by default. Responses return `hasMore`, `nextCursor`, and:

```ts
type BoundedMatchCount =
  | { value: number; relation: "exact" }
  | { value: 1000; relation: "at_least" };
```

The repository counts at most 1,001 matching index entries, so the UI says `1,000+` rather than issuing an unbounded exact count. Counts are computed only after the exact collection/locale/role projection succeeds and therefore never include a hidden scope.

Search requires a developer-generated migration for a tenant-qualified expression index equivalent to collection plus `lower(display_name) COLLATE "C" text-pattern ordering and entry ID. The exact Drizzle expression and `EXPLAIN` evidence must be reviewed before migration generation. If PostgreSQL/Drizzle cannot prove the intended prefix plan portably, implementation stops for an amended search design rather than shipping a sequential scan or adding an unapproved extension.

### 9. Lists stay bounded in the browser

Studio does not accumulate an unbounded infinite list. It keeps at most the current page plus a bounded cursor history of 20 pages per collection/locale/search state. Search aborts superseded requests and is debounced by 300 ms. The list renders no more than 50 rows at once, preserves focus on paging, and exposes textual result/count state.

Search text stays in component memory and a bounded JSON search-request body rather than route URLs, logs, telemetry, query keys, or persistent browser storage. Routes contain only bounded stable IDs and canonical locale tags.

### 10. References use the same authorized list operation

`@framerfordevs/content-form` gains a first-party reference-picker port supplied by its caller. The renderer still owns no fetching, token, routing, or tenant authority.

For a visible reference field, Studio invokes the same bounded authorized entry search against the configured target collection and exact selected locale. The target collection must itself be role-visible. Existing selected references are projected to safe display names where authorized; unavailable targets render a non-identifying `Unavailable reference` state rather than instructing the user to type an ID.

A selected value remains the canonical stable entry ID. Save-time reference validation and exact-locale publication requirements remain unchanged. M19 does not publish or guarantee that a referenced target is published.

### 11. Writes reuse M7 authority exactly

Studio Content supports only:

- create entry, optionally with bounded initial visible/editable mutations;
- rename locale-neutral CMS display name through an exact-locale authorization path; and
- save shared and/or localized draft mutations.

Create and save use caller-generated UUID command IDs and accepted command fingerprints/receipts. Requests bind current schema revision, contract hash, expected shared/localized versions, exact locale, stable field paths, and the token-bound scope. Rename binds exact `expectedNameVersion` and has no force flag.

The platform always records the Studio user as the existing user actor. The BFF is never an actor and does not impersonate a management credential. Existing immutable revisions, audits, no-op behavior, and transactional rollback remain unchanged. Draft saves do not emit publication/outbox behavior and never alter Delivery.

### 12. Retry policy distinguishes reads, ambiguous writes, and conflicts

- Browser queries may retry at most twice only for bounded transport/`503` failures with abort propagation and jitter. They never retry authentication, authorization, validation, not-found, stale cursor, or schema/conflict failures.
- Mutations are never automatically retried by TanStack Query.
- Create/save explicit retry reuses the exact command ID, body, versions, and fingerprint after an ambiguous network/`503` outcome. A changed intent receives a new command ID.
- After an ambiguous rename, Studio refetches. If the exact desired normalized name and advanced version are authoritative it reports success; otherwise it presents the current conflict. It does not blindly repeat a non-receipted rename.
- `429` disables retry until bounded `Retry-After` guidance passes.
- Terminal Studio registration/token/grant denial deletes the local session through the accepted M18 behavior. A transient store/platform outage never pretends the user is signed out.

Form inputs are disabled for the brief submitted snapshot. If later implementation permits editing during flight, it must preserve post-submit deltas separately and cannot overwrite them with the response.

### 13. Conflict and schema-drift recovery preserve work without force

A draft/name version conflict or stale schema never discards browser-local values.

Studio stores, in memory only:

- the old authoritative baseline;
- the user's local values;
- the old projected field signatures and schema authority; and
- the submitted command snapshot where applicable.

After fetching the latest workspace, a pure three-way rebase may carry a changed field only when:

1. its stable ID/path still exists and remains visible/editable;
2. kind and effective localization are unchanged;
3. the new authoritative value equals the old baseline at that path;
4. the local value validates under the new field contract; and
5. parent/list atomicity remains valid.

Concurrent value changes, removed/hidden/read-only fields, kind/localization changes, list structural ambiguity, and newly invalid values remain unresolved. Studio identifies unresolved items using only presentation data the user was already authorized to see and offers explicit keep-current/discard/manual-reapply choices. It never submits an unresolved value automatically.

The recovered save uses latest schema/versions and a new command ID because it is a reviewed new intent. The user may always discard local edits and reload. There is no force overwrite.

This covers code-published structure changes and Presentation-only revision changes. Studio never reads or executes developer source code and does not expose source keys.

### 14. Unsaved navigation is explicit and comprehensive

Dirty state includes shared values, localized values, and an open changed rename/create form. It protects:

- locale tab changes;
- collection/entry selection;
- Studio route navigation;
- sign-out; and
- window/tab unload.

TanStack Router blockers and `beforeunload` provide the baseline. An accessible dialog names the current entry/locale and offers Stay or Discard; Save remains a separate deliberate action so a navigation confirmation cannot accidentally write.

No draft or recovery snapshot is written to localStorage, sessionStorage, IndexedDB, Cache Storage, a service worker, URL/search/hash state, query keys, logs, or telemetry. A full page/browser loss can therefore lose unsaved work; M19 does not weaken the accepted no-persistent-content boundary to simulate offline editing.

## Canonical Studio Content v1 operations

Base:

```text
/api/studio-content/v1/projects/{projectId}/environments/{environmentId}
```

| Method  | Path                                                                   | Purpose                                                                        |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET`   | `/context`                                                             | Effective locales, role-visible collections, exact bounded counts/capabilities |
| `GET`   | `/collections/{collectionId}/locales/{locale}/entries`                 | Browse one authorized exact-locale collection                                  |
| `POST`  | `/collections/{collectionId}/locales/{locale}/entries/search`          | Read-only bounded display-name search without putting names in URLs            |
| `GET`   | `/collections/{collectionId}/locales/{locale}/entries/new`             | Current role-projected form and create authority                               |
| `GET`   | `/collections/{collectionId}/locales/{locale}/entries/{entryId}`       | Bound form + exact-locale draft workspace                                      |
| `POST`  | `/collections/{collectionId}/locales/{locale}/entries`                 | Receipt-backed entry creation                                                  |
| `PATCH` | `/collections/{collectionId}/locales/{locale}/entries/{entryId}/name`  | Optimistic locale-neutral rename                                               |
| `PATCH` | `/collections/{collectionId}/locales/{locale}/entries/{entryId}/draft` | Receipt-backed shared/localized save                                           |

All routes are bearer-only, `no-store`, redirect-free, reject cookies/browser Origin/preflight/query credentials/duplicate Authorization, and retain `{ ok, data, error, message }`. The exact path/method/query/content-type matrix is closed. Unknown routes and methods do not fall through to Authoring or another API.

Browse query keys are only `cursor` and `limit`. Search uses exact JSON `{ query, cursor, limit }` at the read-only `/search` operation so entry names never enter request URLs; mutation and search bodies reject excess properties. Requests are at most 1 MiB; responses are at most 4 MiB; the search body is additionally capped at 2 KiB; issue arrays remain capped at 50; mutations remain capped at 500; existing value/schema depth and document limits remain authoritative.

The public error union includes validation, unauthorized, forbidden, not found, owner/developer-only collection configuration invalidity, locale unavailable, CMS/project/registration unavailable, stale schema, draft/name/command conflict, invalid/stale cursor, request/response too large, rate limited, dependency unavailable, and sanitized internal failure. Errors contain no values, hidden IDs/paths, labels, search text, tokens, cookies, or raw upstream details.

## App-local BFF contract

For mount `/studio`, the BFF adds only:

```text
GET   /studio/content
GET   /studio/content/{collectionId}/locales/{locale}
GET   /studio/content/{collectionId}/locales/{locale}/entries/new
GET   /studio/content/{collectionId}/locales/{locale}/entries/{entryId}

GET   /studio/api/content/context
GET   /studio/api/content/collections/{collectionId}/locales/{locale}/entries
POST  /studio/api/content/collections/{collectionId}/locales/{locale}/entries/search
GET   /studio/api/content/collections/{collectionId}/locales/{locale}/entries/new
GET   /studio/api/content/collections/{collectionId}/locales/{locale}/entries/{entryId}
POST  /studio/api/content/collections/{collectionId}/locales/{locale}/entries
PATCH /studio/api/content/collections/{collectionId}/locales/{locale}/entries/{entryId}/name
PATCH /studio/api/content/collections/{collectionId}/locales/{locale}/entries/{entryId}/draft
```

The first four are finite shell patterns for direct navigation/refresh, not a wildcard SPA fallback. IDs and locale segments are strictly decoded before shell service. Browse cursors exist only on the list GET; search text/cursor exist only in the exact JSON body of the read-only search POST.

The BFF:

- applies accepted raw-target, external-origin, cookie, store, refresh, and registration/session quotas first;
- requires same-origin Fetch Metadata for reads and exact Origin + same-origin + JSON for mutations and the read-only search POST;
- constructs every upstream path from decoded configuration and route values;
- forwards only the OAuth bearer plus request correlation;
- strips browser cookies and caller-selected authorization/upstream headers;
- enforces the same 1 MiB/4 MiB body limits, 10-second platform deadline, redirect denial, and abort propagation;
- strictly decodes the named platform envelope before returning a dependency-free browser DTO; and
- maps terminal registration/grant denial through accepted M18 local-session invalidation.

It never accepts an arbitrary operation name, upstream URL, method, header, or platform response. OAuth/content never enters the encrypted local session record, Redis store, telemetry, HTML, asset cache, or framework SSR state.

## Browser application behavior

### Routes and navigation

The mounted SPA adds lazy content routes under the accepted router base. Bootstrap remains the root authority. Content context is fetched only after successful bootstrap.

The primary desktop layout contains collection navigation, exact locale navigation, a bounded entry list/search panel, and the current workspace. At narrow widths these become sequential views with an explicit Back action; no horizontal page overflow is required. Implementation/API keys and raw stable IDs are not rendered as labels.

Direct links resolve the exact current collection/locale/entry authority. Removed or newly denied resources show a bounded unavailable state and a link back to the nearest authorized content context.

### Query ownership

TanStack Query owns only server state. Query keys contain stable route identity, locale, an in-memory opaque search-generation key, and cursor—not search text, content values, display names, tokens, cookies, attempts, session IDs, or command bodies. Persistence is disabled. Local controlled form state is separate and never overwritten by background refetch while dirty.

Queries are enabled only when bootstrap/context authority and exact route inputs exist. Related context/list/workspace invalidations run after confirmed mutations; unrelated collection/locale caches are not broadly invalidated.

### Forms and localization

The workspace renders:

- a clearly separated Shared section when shared projected fields exist;
- one exact selected locale section and keyboard-operable locale tabs;
- immutable current Presentation tabs/groups/sidebar/help/placeholder metadata;
- visible read-only controls with explicit read-only text;
- all 18 field kinds, including lazy Portable Text and first-party reference selection; and
- one textual save/validation state: saved, unsaved, saving, saved-with-issues, restricted-issues, conflict, stale schema, or failed.

Shared controls are enabled only when both field and all-locale authority permit. Localized controls affect only the selected locale. There is no fallback read/write or implicit propagation to another locale.

Client validation is advisory. Server validation issues remain authoritative and map by stable visible field path. The summary links/focuses the first invalid visible control; restricted issues never fabricate a hidden target.

### Accessibility and responsive acceptance

M19B acceptance requires:

- semantic app/navigation/main/list/form landmarks and one clear page heading;
- visible labels, required/read-only text, help/error associations, and non-color statuses;
- keyboard locale tabs with roving focus and an announced selected locale;
- keyboard-operable list/object movement and reference selection;
- focus restoration after dialogs and focus placement on route, create, conflict, and validation outcomes;
- polite save/loading status and assertive bounded conflict/session alerts;
- no drag-only operation;
- 375 CSS-pixel width and 200% zoom/reflow without loss of operation or two-dimensional page scrolling;
- two-column Presentation groups collapsing to one column before controls become unusable; and
- automated WCAG A/AA checks on authenticated browse, edit, read-only, validation, conflict, and failure states.

## Authorization and security model

### Request sequence

For every platform operation:

1. Reject malformed method/path/query/headers/body and oversized input before expensive work.
2. Verify the exact Studio token cryptography, issuer, audience, client kind/ID, exact scope set, expiry, immutable grant deadline, registration/version, project/environment/user claims, active registration, and establishment audit.
3. Resolve current project/CMS/membership/role/locale policy.
4. Resolve only the exact tenant-qualified collection/entry/schema requested.
5. Recompute role-visible form and field mutation authority from current published Presentation/schema.
6. Execute the bounded read or existing transactional mutation as the exact user actor.
7. Project/redact the response before size checking and serialization.

Bootstrap/context/capability flags never replace steps 2–6.

### Threat controls

| Threat                                  | Required control                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| Browser steals platform bearer          | Token remains only in encrypted BFF session and server-to-server calls                  |
| BFF becomes arbitrary proxy             | Finite typed routes, derived upstream paths, strict request/response schemas            |
| Forged hidden collection/locale route   | Current server context/projection rechecked; hidden scope returns no data               |
| Guessed hidden/read-only field mutation | Stable-ID mutation authorization under current published schema and role                |
| Stale browser permission                | Current policy on every platform call; no cached projection grants work                 |
| Locale fallback/mixing                  | Exact enabled locale in every list/read/write/cursor/reference lookup                   |
| Search enumeration                      | Authorization before query/count; body-bound cursors; capped count; no content search   |
| XSS through Presentation/content        | React escaping, no HTML nodes/dangerous rendering, existing Portable Text allowlist/CSP |
| SSRF through asset/reference values     | No server fetch/probe; external assets remain inert structured metadata                 |
| CSRF                                    | Accepted same-origin evidence; exact Origin + JSON for mutations; no CORS               |
| Duplicate/ambiguous write               | Command receipts and exact retry intent; rename refetch reconciliation                  |
| Conflict overwrites                     | Expected versions, no automatic mutation retry, no force, reviewed rebase only          |
| Hidden validation leak                  | Visible issue projection plus closed restricted status without hidden details           |
| Content persistence/leak                | Memory-only forms; no browser persistence/logs/telemetry/session-store content          |
| Registration/policy drift               | Existing Studio verifier plus current domain authorization on every operation           |

## Rate limits, bounds, and performance

Studio Content reuses the accepted shared platform `studio.global` and `studio.user` identities rather than adding caller-selected or forwarded-source authority. Costs are proposed as:

| Operation           | Cost |
| ------------------- | ---: |
| context             |    2 |
| entry page/search   |    1 |
| new-entry workspace |    2 |
| entry workspace     |    3 |
| create/rename/save  |    5 |

The existing BFF registration/session rates remain unchanged: 600/minute burst 100 per registration and 120/minute burst 20 per session. Search debounce, cancellation, and bounded pages prevent ordinary typing from consuming those bounds excessively. Raising accepted M18 limits requires amendment; deployment may lower them.

Implementation acceptance records measured budgets rather than relying only on unit limits:

- 50 collections × 100 fields and 100 effective locales remain within the 4 MiB context/workspace cap through projected bounded queries;
- 100,000 entries in one collection use index-backed browse/search and capped count plans with no sequential table scan;
- database p95 target under the accepted local load harness is 150 ms for a 25-row browse/search page and 300 ms for capped count plus page;
- platform/BFF p95 target is 500 ms for browse/search and 1 second for a representative workspace, excluding injected network latency;
- typing/control updates produce no repeated main-thread task over 100 ms in the representative 100-field form;
- only 50 list rows render at once and cursor history remains bounded;
- initial shell transfer remains within the accepted M18 600 KiB raw/200 KiB gzip JS and 128 KiB raw/40 KiB gzip CSS limits;
- content routes and `@content-form` load lazily; Portable Text remains a separate lazy chunk; exact route/chunk raw+gzip budgets are measured and fixed at the M19B compatibility checkpoint before broad UI implementation.

A failed search plan, response cap, initial-shell budget, or 100-field interaction gate stops implementation for design review rather than silently increasing a source-controlled bound.

## Observability and audit

Named spans cover Studio Content authentication, context projection, collection projection, entry page/search/count, workspace assembly, reference lookup, create, rename, save, BFF adaptation, and schema rebase.

Safe attributes may include closed operation/outcome/status/error categories, adapter, role bucket, stable project/environment/collection/entry IDs where current telemetry rules permit, page-size/count buckets, search-present boolean, mutation/field/issue count buckets, schema-match boolean, and duration/size buckets.

They exclude locale labels/tags where unnecessary, search text/digest, display names, field labels/API/source keys, values, mutations, validation messages, URLs, content, schema documents, emails, tokens, cookies, session/store IDs, command bodies, ciphertext, and raw request URLs.

Metrics use only low-cardinality closed buckets. Ordinary reads add no domain audit. The sole M19 read-path exception is owner/developer detection of `projection_invalid`: the platform response is gated on one idempotent durable `cms.schema.projection_invalid_detected` event per affected immutable schema revision, using `resourceType: cms_schema_revision` and that revision ID. `empty_schema` does not emit it. Existing entry create/rename/save audits and immutable revision attribution remain the durable mutation record; the BFF emits no duplicate business audit.

## Effect and package architecture

### Platform

- `packages/api/src/contracts/studio-content/`: strict Studio Content DTOs, errors, limits, and OpenAPI source
- `packages/api/src/lib/studio-content/`: pure role projection, capped-count/search cursor, issue filtering, and workspace/rebase-support kernels where server-owned
- `packages/api/src/operations/studio-content-public/`: named Effect workflows, Studio principal adaptation, quotas, and typed errors
- `packages/api/src/services/studio-content/`: set-based context/search/workspace repository composition over current policy/schema/entry services
- `apps/server`: isolated bearer-only Studio Content router and host-profile allowlist
- `packages/public-contracts`: new artifact/baseline/portal metadata with `sdkSupported: false`

Existing entry/schema repositories remain domain authority. Shared logic is extracted rather than copied when Authoring and Studio need the same stable-ID checks.

### Developer runtime

- `packages/studio-server`: finite local routes, typed platform client/decoder, content response/error adaptation, and accepted session/refresh/runtime reuse
- `packages/studio`: dependency-free browser content contracts, lazy routes, TanStack Query ownership, controlled forms, recovery UX, and artifact manifest
- `packages/content-form`: optional first-party reference-picker port and any minimal DTO generalization required to omit API keys; still no fetching/routing/token/persistence
- Redis/adapters remain transport/store implementations only and gain no content or policy logic

No new workspace is proposed. Packages do not import application source. Browser forbidden-import tests continue to reject server/auth/env/Node/database/token/store modules and platform API internals.

Business workflows use named `Effect.fn`, typed expected failures, services/Layers, and the existing process `ManagedRuntime`. No request-local runtime, raw Promise error, or `any` is introduced below runtime/framework boundaries.

## Database impact and migration gate

M19 proposes no new policy/content table, mutable authority column, or audit constraint. It requires one query-support index on `cms_entry` for exact tenant/collection-qualified case-insensitive display-name prefix search and stable ordering.

Projection-invalid audit idempotency reuses the existing database-enforced `audit_event.id` primary key declared in `packages/db/src/schema/platform.ts` and created by migration `0001_create_platform_kernel.sql`. The deterministic, action-namespaced audit ID is the inserted primary key; concurrent detectors use `ON CONFLICT (id) DO NOTHING` plus exact persisted-row verification. No collection/project lock is assumed, and no new `(resource_id, action)` constraint or migration artifact is required. Therefore the M19 migration request remains limited to the search index below.

The developer generated and applied `0021_add_studio_entry_name_search_index`. Inspection proved that its SQL contains only the approved tenant-qualified partial expression index, its snapshot differs from `0020` only by the snapshot chain and index, and its journal appends only `0021`. Read-only catalog verification proved the index is present, ready, valid, and recorded exactly once in the Drizzle migration journal. No existing migration or snapshot was edited.

If implementation evidence shows a table/column, extension, backfill, persisted collection policy, or broader index is required, work stops for a design amendment before schema changes.

## Test and evidence plan

### Pure/contract

- Strict exact DTO decoding, unknown-key rejection, all bounds, and deterministic OpenAPI bytes
- Complete 18-kind Studio projection with no API/source keys or role arrays
- Hidden parent/child/layout intersection and read-only editable-ID projection
- Owner/developer non-empty visibility invariants plus bounded `empty_schema`/`projection_invalid` notices
- Historical M5 field compatibility locked by `packages/api/src/services/schema/legacy-editor-metadata.test.ts` (`expands the M6 empty-object backfill for historical M5 fields`), proving the M6 `{}` sentinel grants owner/developer visibility and editability
- Visible versus restricted validation issue projection
- Exact-locale context ordering and all/selected/none policy matrices
- Browse/search cursor scope/query/mode/order/expiry/tamper cases
- Prefix normalization and literal wildcard/escape behavior
- Capped count at 0, 1, 999, 1,000, and 1,001+
- Stable-ID three-way rebase success and every unresolved condition
- Existing Studio v1 and Authoring v1 artifact bytes/digests unchanged

### PostgreSQL integration

- Set-based context for maximum collections/fields/locales
- Omitted unpublished and entirely role-hidden collections
- Empty-schema and injected invalid-projection owner/developer diagnostics while every other role remains non-enumerating
- One response-gating, idempotent `cms.schema.projection_invalid_detected` audit per affected schema revision across repeated and concurrent context/nested-route detection, proving existing-primary-key conflict handling and exact prior-row verification; no audit for `empty_schema`, other roles, or foreign scopes
- Cross-workspace/project/environment/collection/entry/locale isolation
- Read-only role and selected/none locale denial for every direct mutation
- Hidden/read-only guessed stable field paths rejected without mutation
- Workspace form/draft revision coherence during concurrent schema publication
- Create/save receipt replay and command conflict; rename reconciliation
- Shared/all-locale authority and mixed-object partition correctness
- Rollback injection preserves entry, heads, revisions, receipts, and audits
- 100,000-entry browse/search/capped-count `EXPLAIN` fixtures use intended indexes
- Search/index behavior under concurrent create/rename and cursor continuation

### HTTP/BFF/security

| Required matrix row                                                                                                                               | Platform HTTP expectation                                                                                                              | BFF expectation                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner/developer `empty_schema` and `projection_invalid` across **browse, search, new-entry workspace, entry workspace, create, rename, and save** | Every named endpoint returns `409 STUDIO_COLLECTION_CONFIGURATION_INVALID` with only the closed reason before entry/form/mutation work | Every matching local API route preserves the status, code, and closed reason; direct shell navigation renders the same bounded recovery state |

- Every platform and local path/method/query/content-type/body/header matrix
- Studio token only; management, Delivery, Preview, Tooling/Authoring OAuth, cookie, duplicate bearer, browser Origin, preflight, and query credential rejection
- Active registration/version/grant/session/project/CMS/membership changes deny immediately
- Owner/developer configuration notice/direct-error behavior versus identical `NOT_FOUND` for other roles and foreign scopes
- Exact raw-target behavior for dynamic shell/API routes, encoding, separators, dots, slashes, controls, and oversized input
- CSRF, same-origin, CSP/cache/referrer/nosniff/frame policies remain exact
- Upstream redirect, timeout, abort, oversized/malformed envelope, outage, `429`, and terminal-auth mapping
- No arbitrary proxy/header/upstream URL capability
- Express/TanStack/direct Fetch parity
- Tokens/content/search/display names absent from logs, spans, metrics, Redis records, errors, HTML, and browser storage

### React/content-form/accessibility

- Every field kind, nested object/list, mixed partition, tabs/groups/sidebar, defaults, read-only controls, server issues, and simultaneous form instances
- Reference search/select/current-unavailable states without raw-ID editing UX
- Collection/locale/entry browse, create, rename, save, no-op, validation, and empty states
- Conflict and schema drift preserve local values; explicit discard/rebase/retry behavior
- Same command ID on ambiguous create/save retry and no automatic mutation retry
- Locale/collection/entry/router/sign-out/unload dirty guards
- Query cancellation, no dirty-state overwrite, and bounded page retention
- Keyboard/focus/live-region/non-color behavior, 375 px, 200% zoom, and automated axe
- Initial shell unchanged/lazy content chunks/Portable Text split and package tarball inspection

### Full validation

Applicable format, lint, structure, contract drift, all type tasks, unit/integration/security/accessibility tests, coverage, audit, production builds/images, package inspection, bundle budgets, database invariants/query plans, and `git diff --check` must pass. Committed browser specifications run noninteractively through `pnpm test:browser`. The worker stays stopped during shared-database integration/coverage and is only restored if the developer directs it.

The completed M19A review candidate passes format/lint/structure, contract drift, 23 type tasks, 1,642 tests plus coverage, all 14 retry-free browser specifications, and 14 builds. Rollback-isolated 100,000-entry evidence enforces the approved database p95 and index-plan targets, while separate 20-sample platform and BFF checks enforce the approved browse/search/workspace p95 targets. Exhaustive create/save failpoints leave no entry/revision/head/audit/receipt residue; draft operations create no publication, snapshot, publication-head, or outbox state. The finite BFF strictly decodes each operation-specific success DTO and rejects nested drift, status-incoherent failures, unsafe keys, redirects, cancellation leaks, and excessive payloads. The production audit has no high/critical finding; five moderate findings are unchanged test-tool dependency paths with no built-runtime references. Fresh changed server/developer images and the Studio-server tarball pass their applicable startup, residue, and allowlist checks. Final database invariants are clean and the worker remains stopped.

## Expected risks and pre-use confirmation

These are expected gates, not design blockers:

1. The search-index migration may fail its PostgreSQL/Drizzle portability or `EXPLAIN` proof on the first implementation attempt. That outcome triggers the documented design-amendment stop; it is not permission to ship a sequential scan, unapproved extension, or weaker count/search contract.
2. M19 creates immutable M7 revisions but intentionally has no Studio-native history/restore UI until M20. During the M19 window, recovery is through the canonical Authoring API/CLI outside Studio. Because all five Studio runtime packages remain unpublished and inactive, this gap does not block implementation evidence. Before any developer-authorized runtime activation or user handoff, the developer must explicitly confirm that the intended users have an acceptable Authoring API/CLI recovery path and support owner; otherwise activation remains blocked until M20.

## Implementation sequence and stop gates

### M19A — platform/content protocol

1. Developer authorization for M19A implementation under this approved design is recorded.
2. Add pure Studio Content contracts/projection/search/cursor kernels and lock route/DTO/error limits.
3. Add repository/operation/HTTP layers using current Studio principal and shared entry/schema authority.
4. Add the new deterministic OpenAPI source without registering a baseline yet; prove accepted Studio/Authoring bytes unchanged.
5. Edit the single approved Drizzle search-index definition and stop for developer migration generation/application.
6. Inspect generated artifacts and verify the applied catalog read-only after developer confirmation.
7. Complete platform integration, authorization, concurrency, load/query-plan, redaction, artifact, and BFF protocol/adapter evidence.
8. Register Studio Content v1 baseline only after its real BFF consumer passes; stop for M19A review.

### M19B — mounted Studio experience

1. Developer accepts M19A and authorizes M19B.
2. Add lazy finite content routes and strict dependency-free browser decoders.
3. Generalize `@content-form` minimally and add the first-party reference picker plus rebase kernel/UI composition.
4. Implement context/list/search/new/workspace/create/rename/save, dirty guards, conflict/retry/drift recovery, and responsive accessibility states.
5. Lock measured content-route/chunk and interaction budgets at the compatibility checkpoint; stop if they fail.
6. Run package, browser, accessibility, security, full readiness, and fresh artifact/image evidence.
7. Update status documentation, provide one Conventional Commit message, and stop for developer M19 review.

M20 does not begin until both units are accepted.

## Alternatives rejected

### Change accepted Studio v1 in place

Rejected because M18B registered exact immutable bytes and required amendment for later byte changes. A companion family makes the new scope explicit without rewriting history.

### Send the Studio browser directly to Authoring v1

Rejected because it would expose the platform bearer or require browser CORS/token storage, violating M13/M18 isolation. Authoring's API-key-facing projection is also broader than the client Studio needs.

### Let the BFF query the database or import platform repositories

Rejected because the developer-owned runtime is not platform business authority and must remain deployable outside the platform process.

### Add Authoring v2 for the whole M19 UI

Rejected as unnecessary duplication and migration pressure. M19 adds a Studio session projection over accepted content operations, while Authoring v1 remains canonical for automation/integration.

### Add persisted per-member collection policy now

Rejected because it adds governance contracts, CLI/dashboard administration, policy storage, migrations, and handover semantics to an already substantial content/UI milestone. Current fixed-role/locale/field authority can define a complete honest M19 projection. A broader policy model requires separate approval.

### Browser-side search over loaded pages

Rejected because it misses unloaded entries and fails large-collection/direct-count requirements.

### Substring/full-text search without an index

Rejected because it invites unbounded scans and unclear locale/collation behavior. Prefix search has explicit semantics and a provable bounded index path.

### Exact total counts

Rejected because PostgreSQL exact counts can become unbounded as collections grow. A capped `exact | at_least` contract is honest and permission-correct.

### Autosave or automatic conflict retry

Rejected because it obscures optimistic authority, increases cross-locale/shared races, and can overwrite concurrent work. Explicit save plus receipt-safe retry is predictable.

### Persist unsaved drafts in browser storage

Rejected because it expands content lifetime and leakage into shared devices, host scripts, backups, and browser persistence. M19 keeps content in memory and makes the limitation explicit.

## Decision-standard review

### Product and UX

The design gives editors the intended mounted everyday workflow—find a collection/entry, choose one exact locale, edit the complete generated form, and save safely—without exposing schema controls or prematurely importing M20/M21.

### Correctness and reliability

One workspace authority, stable-ID mutations, exact locale, optimistic versions, receipts, explicit retries, and conservative three-way rebase preserve immutable revision semantics and local work.

### Security and privacy

Platform tokens stay in the BFF; current policy is enforced server-side; hidden values/issues are absent; direct requests fail closed; search/counts cannot enumerate unauthorized scopes; content is not persisted or observed.

### Performance

Set-based bounded context, existing keyset browse, indexed prefix search, capped counts, finite DOM pages, lazy forms/rich text, and explicit load/bundle gates address maximum accepted schemas and large collections.

### Accessibility

The accepted generated-form semantics are retained and expanded with exact keyboard locale/list/reference/navigation behavior, focus recovery, associated errors, non-color status, and responsive/zoom evidence.

### DX and maintainability

The separate API family preserves immutable baselines and keeps browser/BFF/platform contracts intentional. Shared repositories and pure kernels prevent a second content engine. The M19A/M19B split creates a migration/authority checkpoint before broad UI work.

## Approved design decisions

The developer approved these decisions, including the owner/developer zero-projection amendment above; implementation remains separately gated:

1. New Studio Content v1 companion API; Studio v1 and Authoring v1 remain byte-identical.
2. Existing Studio OAuth audience/scope/client/grant/session authority remains unchanged.
3. Current fixed role + effective locale + published role-visible form defines M19 collection visibility/read-only behavior; no persisted collection policy is added.
4. Stable IDs are used in browser contracts/routes but not rendered as editing metadata; API/source keys and role arrays are omitted.
5. Prefix-only case-insensitive name search, 25 default/50 maximum pages, and capped 1,000+ counts.
6. One developer-generated query-index migration under the repository stop gate.
7. Explicit save, no autosave/force, receipt-safe manual retry, and conservative three-way drift recovery.
8. Runtime-only Studio projection has no new CLI/SDK namespace; accepted content automation remains Authoring v1.
9. M19A platform/protocol acceptance precedes M19B mounted UI.
10. M20–M21 capabilities and every release/rollout action remain gated.
11. Valid Presentation authority cannot hide a non-empty collection from owners/developers; bounded owner/developer-only configuration notices and a typed closed-reason route error cover empty/corrupt residual states without weakening `NOT_FOUND` for other roles.
12. Search-plan amendment risk and the temporary Authoring API/CLI-only recovery path are explicit pre-use gates, not permission to weaken search or ship Studio-native restore early.
