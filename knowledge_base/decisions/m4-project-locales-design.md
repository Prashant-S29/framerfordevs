# Milestone 4 project locales and strict locale contracts

**Status:** Implemented, manually approved, and committed as `68b6f6e`

**Date:** 2026-08-01

## Decision summary

Milestone 4 will make locales stable project resources rather than strings added later to content tables. Every project will own an enabled English (`en`) locale from the same transaction that creates the project. Existing projects will receive one `en` locale through a developer-controlled migration backfill.

The design uses:

- Immutable UUIDv7 locale identity and immutable canonical BCP 47 tags
- Registry-backed validation from a generated snapshot of the official IANA Language Subtag Registry (`File-Date: 2026-06-14`)
- Canonical, case-insensitive duplicate detection with an explicit 64-character product limit
- Developer-controlled display names and deterministic locale ordering
- Reversible `enabled`, `disabled`, and soft-`removed` lifecycle states
- Dependency-aware transition rules that prevent unsafe locale withdrawal
- Optimistic versions and one project-row serialization point for locale configuration writes
- Optional per-membership locale allowlists with default-deny policy evaluation
- Mandatory locale fields for every content-oriented contract and exact enabled-locale resolution
- No default argument, `Accept-Language` inference, English substitution, parent-tag matching, or other fallback
- Transactional locale/access state changes and immutable audit events
- Accessible ordered locale tabs with an unsaved-change guard foundation

Locales are project-scoped, not environment-scoped. The current and future environments of one project use the same locale identities; drafts and publications remain environment-scoped and locale-specific in later milestones.

## Scope

### Included

- Required `en` locale for new and existing projects
- Additional locale creation with BCP 47 normalization
- Locale listing, display-name editing, ordering, enablement, disablement, removal, and restoration
- Immutable locale IDs and tags
- Strict duplicate, malformed, oversized, stale-write, and invalid-transition behavior
- Dependency-impact contracts and transition policy needed by future draft/publication tables
- Per-project-member locale access modes and selected-locale allowlists
- Locale-aware user policy context for future content operations
- Reusable strict locale input and resolver contracts
- Management oRPC procedures, standard response unions, typed errors, authorization, audit events, spans, and bounded metrics
- Project locale settings UI and reusable accessible locale tabs
- Contract, policy, service, PostgreSQL, API, UI, concurrency, isolation, and accessibility tests

### Deferred

- Collection, entry, field, draft, revision, and publication rows
- Translation completeness and real draft/published tab indicators
- Delivery and Preview API endpoints
- Per-locale credential allowlists
- Invitation-time locale restrictions; accepted memberships initially retain the existing `all` behavior and can be restricted by an owner
- Environment-specific locale configuration
- Automatic language negotiation or fallback of any kind
- A database constraint trigger or scheduled invariant monitor for required `en`; reconsidered in Milestone 14 hardening

Per-locale credential restrictions remain a later credential-contract extension. A locale-limited user cannot issue or rotate credentials, preventing the user's selected-locale restriction from being widened through a new or rotated machine credential.

## Standards and canonicalization

BCP 47 is the web language-tag contract. W3C guidance identifies BCP 47 as the applicable standard and recommends tags no more specific than necessary. RFC 5646 defines case-insensitive tags, canonicalization considerations, and permits protocols to impose a documented non-truncating length bound of at least 35 characters.

References:

- https://www.w3.org/TR/ltli/
- https://www.w3.org/International/questions/qa-choosing-language-tags
- https://datatracker.ietf.org/doc/html/rfc5646
- https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/getCanonicalLocales

### Canonicalization profile

`LocaleTag`:

1. Trims surrounding whitespace.
2. Rejects empty input and input longer than 64 ASCII characters before parser work.
3. Rejects non-ASCII/control input and underscore-separated or otherwise malformed tags.
4. Parses exactly one tag and validates its language, optional script, optional region, and variants against the generated official IANA registry snapshot.
5. Excludes reserved/private-use language, script, and region ranges.
6. Rejects private-use tags/suffixes and Unicode or other extensions because these are outside the initial product identity profile.
7. Applies registry `Preferred-Value` aliases for deprecated language, region, variant, extlang, redundant, and safely replaceable grandfathered forms.
8. Rejects grandfathered forms without a safe preferred replacement.
9. Canonicalizes language and variants to lowercase, scripts to title case, and regions to uppercase without consulting the host operating system, network, or ICU registry at runtime.
10. Rejects a canonical result over 64 characters rather than truncating it.

Examples:

- `EN` becomes `en`
- `en-us` becomes `en-US`
- `zh-hant-tw` becomes `zh-Hant-TW`
- `iw` becomes `he` from pinned registry metadata
- `i-klingon` becomes `tlh`
- `en_US`, `en--US`, `doekdoek`, `oedll`, `xlw`, extensions, private-use tags, empty input, multiple tags, and values over 64 characters fail validation

`packages/api/src/contracts/locale-registry.generated.ts` pins the official registry at `File-Date: 2026-06-14`. `pnpm locale-registry:update` regenerates and formats it from IANA; the generator can also accept a downloaded registry file path for deterministic offline reproduction. The generated snapshot is shared by browser and API validation, but the API remains authoritative. There is no runtime network, operating-system registry, `Intl.getCanonicalLocales()`, or third-party registry-data dependency.

Locale matching remains exact after canonicalization: `en`, `en-GB`, and `en-US` are three different project locale resources.

## Domain invariants

- Every project has exactly one locale whose canonical tag is `en`.
- `en` is created enabled with display name `English` and initial position `0`.
- `en` cannot be disabled or removed through any application transition.
- Locale ID and canonical tag never change.
- Display name, position, status, and version are mutable.
- Canonically equivalent and case-variant tags cannot coexist in one project.
- The same canonical tag may exist in different projects.
- At most 100 non-removed locales are allowed per project, bounding list, reorder, policy, and UI payloads.
- Every non-removed locale has one unique non-negative position; removed locales have no position.
- Reordering changes only positions and versions, never locale identity or tag.
- Disabled and removed locales are unavailable to content contracts even when historical data remains.
- A malformed locale is a boundary validation error. A well-formed locale that is absent, disabled, removed, foreign, or outside the subject's allowlist resolves to the same typed unavailable result where non-enumeration is required.

## Locale lifecycle

The stored states are:

- `enabled`: available to authorized content operations and shown in locale tabs
- `disabled`: retained in settings and restorable, but unavailable to content operations
- `removed`: soft removed, omitted from normal settings/tabs, and restorable with the same ID/tag

Allowed transitions:

| Current    | Requested   | Result                                                        |
| ---------- | ----------- | ------------------------------------------------------------- |
| enabled    | disabled    | Allowed for non-`en` when dependency guards pass              |
| enabled    | removed     | Allowed for non-`en` when dependency guards pass              |
| disabled   | enabled     | Re-enabled with the same identity                             |
| disabled   | removed     | Allowed when dependency guards pass                           |
| removed    | enabled     | Restored with the same identity and appended to current order |
| same state | same state  | No-op success; no version increment or audit noise            |
| removed    | disabled    | Rejected as an invalid transition                             |
| any `en`   | non-enabled | Rejected as an invalid transition                             |

Tags cannot be edited. A mistaken tag is corrected by creating the correct locale and removing the mistaken one after dependency checks.

### Dependency guard

A locale dependency summary is a bounded value with:

- draft count
- current publication count
- whether either count was capped for display

The pure transition policy is implemented and tested in M4 even though draft/publication tables arrive in Milestones 7 and 8. The live M4 repository reports zero dependencies; later repositories must calculate the summary inside the same locked transaction before changing locale state.

Rules:

- A current publication blocks disablement or removal. It must be unpublished first; no confirmation overrides this rule.
- Drafts block the first attempt and return `LOCALE_DEPENDENCIES_EXIST` with a safe bounded summary.
- Repeating the mutation with explicit `confirmDraftImpact: true` allows disablement/removal while preserving drafts.
- Historical publications do not block because removal is soft and locale identity/history remain intact.
- Disable/remove never cascade-delete drafts, revisions, publications, snapshots, or history.

This avoids silent data loss and avoids a locale becoming unavailable or later reappearing with a still-current publication merely because a confirmation checkbox was accepted.

## Database model

### Add `project_locale`

- `id`: UUIDv7 primary key
- `workspace_id`, `project_id`: composite tenant scope
- `tag`: canonical BCP 47 string, varchar(64), immutable
- `display_name`: NFC-normalized, trimmed, 1–100 characters, no control characters
- `status`: `enabled | disabled | removed`
- `position`: nullable integer; non-negative for enabled/disabled and null for removed
- `version`: positive integer beginning at 1
- `created_by_user_id`, `changed_by_user_id`
- `created_at`, `updated_at`
- composite tenant foreign key to project
- unique composite identity `(id, project_id, workspace_id)` for future locale-scoped foreign keys
- case-insensitive unique project/tag index `(project_id, lower(tag))`
- partial unique project/position index for non-null positions
- ordered active-list index `(project_id, position, id)` where status is not removed
- actor foreign-key indexes
- checks for bounded tag/display name, status, position/status consistency, positive version, and the invariant that a stored `en` row is enabled

No application delete path exists. Soft removal keeps stable IDs available to future revisions, publications, bindings, audit records, and restoration.

The database check can require an existing `en` row to remain enabled but cannot prove that every project has an `en` child without a cyclic foreign key or trigger. For M4, this is an explicitly accepted risk because production database writes are owned by the application repository and developer-controlled migrations. Project creation, the backfill, restricted write APIs, post-migration verification, and invariant integration tests enforce existence. Locale rows use restrictive foreign keys and no direct deletion workflow.

A deferred database constraint trigger or periodic invariant monitor is intentionally deferred to Milestone 14 production hardening. The hardening review must reconsider direct database access, operational repair paths, alerting, and whether prevention through a custom PostgreSQL trigger is preferable to scheduled detection. M4 will keep a reusable read-only invariant query so deployment and hardening checks can detect a project without exactly one enabled `en`.

### Extend `project_membership`

Add `locale_access_mode` with values:

- `all`: all enabled project locales
- `selected`: only rows in the membership allowlist
- `none`: no locale-scoped content access

Existing and newly accepted memberships default to `all`. Owners must remain `all`. Promoting a member to owner atomically resets locale access to `all` and clears selected rows.

Demoting an owner retains `locale_access_mode = all`. Role and locale scope are independent controls: demotion removes owner-only actions but does not silently remove locale access. The role-change UI must state that the demoted member will retain all-locale access and provide a direct follow-up locale-access control when narrower access is intended. Last-owner protection continues to run before either change.

### Add `project_membership_locale_access`

- `membership_id`, `workspace_id`, `project_id`, `locale_id`
- composite primary key `(membership_id, locale_id)`
- composite tenant foreign key to project membership
- composite tenant foreign key to project locale
- reverse `locale_id` index for foreign-key and dependency paths
- `created_at`

Rows are valid only for `selected` memberships. The repository transaction maintains that cross-table invariant; tests inspect it after every access mutation.

Allowlist rows intentionally survive locale disablement and soft removal. They represent configured entitlement to a stable locale identity, while effective authorization additionally requires the locale to be enabled. Consequently, disabling/removing a locale suspends those grants and restoring it makes the prior grants effective again. Management responses and UI must distinguish configured access from currently effective enabled-locale access; disable/remove and restore confirmations must disclose this behavior. These rows are not treated as orphaned housekeeping data because both foreign-key targets remain valid.

### Project creation and migration backfill

New project creation atomically inserts:

1. project
2. explicit owner project membership with `locale_access_mode = all`
3. primary `main` environment
4. enabled `en` project locale
5. project, membership, environment, and locale audit events

The developer-controlled migration must insert one enabled `en` locale for every existing project using the project's workspace, creator, and timestamps. It must not fabricate request-correlated audit events for historical backfill work. Existing memberships receive `locale_access_mode = all`.

The agent will not generate or apply the migration. Custom backfill SQL will be reviewed and edited only after explicit developer instruction.

## Mutation concurrency and ordering

Every locale configuration mutation locks the project row first. This is the stable lock-order root already used by project-owner mutations and serializes add/reorder/state changes without long transactions.

- Create relies on the canonical case-insensitive unique index for duplicate races.
- Display-name and state writes condition on locale version.
- Reorder accepts the complete ordered set of non-removed `{ localeId, version }` values.
- The transaction verifies exact set equality, rejects duplicate/foreign/missing IDs and stale versions, then updates only rows whose position changes.
- To avoid transient unique-position collisions, changed rows move to a disjoint temporary non-negative range before final dense positions are assigned.
- Locale rows are locked in stable ID order after the project lock.
- Add and restore append to the current order.
- No-op edits, same-state transitions, and identical reorder requests produce no audit event or version increment.

The maximum of 100 active rows bounds transaction work and request size.

## Membership locale access and policy behavior

Add action `project.member.locale.update`; only owners receive it. The update input uses the target membership's optimistic version and a discriminated access value:

- `{ mode: "all" }`
- `{ mode: "none" }`
- `{ mode: "selected", localeIds: [...] }`

Selected IDs must be unique, belong to the same project, and currently be enabled. `selected` requires at least one locale. Owners cannot be restricted. Membership updates, allowlist replacement, version increment, and audit write commit atomically.

The user policy request gains locale context:

- subject locale-access mode
- subject allowed locale IDs
- requested locale ID when an operation is locale-scoped

Policy rules:

- `content.read`, `content.write`, `content.review`, and `content.publish` require a requested locale ID.
- `all` allows role-permitted actions for any enabled locale.
- `selected` allows role-permitted content actions only for selected enabled locale IDs.
- `none` denies every locale-scoped content action.
- Missing locale context for a content action is `missing_context`, never an allow.
- Locale configuration is project-global. `locale.manage` is available only with `all` access; selected/none users cannot add, reorder, disable, remove, restore, or rename locales.
- `locale.read` permits a list, but repository projection returns only enabled allowed locales to selected/none readers. Unrestricted locale managers can request the settings view including disabled/removed rows.
- Selected/none users cannot issue or rotate credentials. Revocation remains allowed because it only reduces authority.
- Workspace owners remain implicit unrestricted project owners.

`CurrentProjectAccess` and project-member responses expose the safe locale-access mode and selected locale IDs so the UI does not interpret a role-level content permission as authority over every locale.

## Strict locale contracts

### Reusable contracts

M4 introduces:

- branded `ProjectLocaleId`
- transformed branded `LocaleTag`
- `ExplicitLocaleContext` containing a required `locale` field
- enabled-locale resolver output containing project/workspace/locale stable IDs and canonical tag
- a helper/schema composition pattern that every later content input must use

A content input with the locale property omitted fails Effect/oRPC boundary validation. Empty, malformed, array-valued, or oversized locales fail validation. No content operation accepts `locale?:`, assigns `en`, reads browser preferences, or consults another locale.

### Exact resolver

The shared resolver:

1. Canonicalizes the explicit input tag.
2. Resolves the exact canonical tag inside the requested project and tenant scope.
3. Requires `status = enabled`.
4. Applies subject locale access.
5. Returns that one locale identity or `LocaleUnavailableFailure`.

It never tries `en`, a parent language, a sibling region, project order, or any other candidate. Future Delivery API publication resolution begins only after this exact locale resolution succeeds.

### API procedures

Planned protected management procedures:

- `platform.projects.locales.list`
- `platform.projects.locales.create`
- `platform.projects.locales.updateDisplayName`
- `platform.projects.locales.reorder`
- `platform.projects.locales.updateStatus`
- `platform.projects.members.updateLocaleAccess`

The list input distinguishes the permission-filtered enabled view from the manager settings view. Removed rows are excluded by default and included only in an explicit manager view.

All procedures retain the standard application success/failure union and request-ID behavior.

### Typed errors

Add centralized schema-backed errors:

- `LOCALE_CONFLICT` → 409 for canonical/case-variant duplicates or the active-locale limit
- `LOCALE_UNAVAILABLE` → 404 for a well-formed but unavailable exact locale in strict resolution
- `LOCALE_DEPENDENCIES_EXIST` → 409 with bounded safe dependency details

Malformed/missing/oversized tags use `VALIDATION_ERROR`; stale writes use `VERSION_CONFLICT`; forbidden state transitions use `INVALID_STATE_TRANSITION`; unauthorized known members use `FORBIDDEN`; foreign/nonexistent projects retain non-enumerating `NOT_FOUND`.

The existing `VERSION_CONFLICT` public message will deliberately become resource-neutral rather than saying only that a project changed. This is a shared contract correction, not a locale-private wording change: the code is already used for invitations, memberships, and credentials. Repository review found no application logic matching the message text; consumers are required by the PRD to branch on the schema-backed code. Implementation must update the centralized contract snapshot and rerun every existing stale-write API test so the wording change is explicit and cannot silently regress HTTP status, code, retryability, or envelope shape.

## Repository and Effect architecture

Add a focused `LocaleRepository` service and Layer rather than growing `PlatformRepository` further. It owns locale persistence, project-row locking, ordering, dependency inspection, strict exact resolution, locale access projections, and transactional audit writes.

Named operations live under `operations/locales.ts`. Effect Schema remains the canonical transport/domain contract. Promise-native stable Drizzle calls remain inside repository adapters and are translated with `Effect.tryPromise`. Known constraint failures become typed locale failures; unknown database failures remain redacted `DatabaseFailure` values.

`PolicyService` remains pure/default-deny and gains locale-aware request fields and exhaustive tests. `AccessRepository` owns membership locale-access updates because membership versioning and owner invariants already live there.

The live Layers are composed once into the existing ManagedRuntime. No request-local runtime or speculative dependency upgrade is introduced.

## Audit and observability

Audit actions:

- `project.locale.created`
- `project.locale.display_name.updated`
- `project.locale.reordered`
- `project.locale.enabled`
- `project.locale.disabled`
- `project.locale.removed`
- `project.locale.restored`
- `project.membership.locale_access.updated`

A reorder emits one project-scoped audit event rather than one event per moved row. Audit rows contain no display name, tag payload, dependency counts, or allowlist. Locale actions use locale ID as resource identity except reorder, which uses the project ID.

Named spans include request, project, locale, membership, and bounded transition identifiers where applicable. Logs use stable IDs and bounded status/outcome values, not locale display names, raw request payloads, or allowlists. Metrics use bounded action/outcome labels and never locale tags, project IDs, or display names.

## UI and UX

The project detail page gains a Locales card when `locale.read` is allowed.

### Locale settings

Unrestricted managers can:

- See enabled, disabled, and optionally removed locales with canonical tags and textual status
- Add a locale through a dialog with tag and display name
- Receive a client-side English display-name suggestion from `Intl.DisplayNames` while the submitted display name remains explicit
- Edit display names without changing tags
- Reorder non-removed locales with keyboard-operable move up/down controls
- Disable or remove non-English locales through confirmations
- See dependency blockers/warnings when later draft/publication data exists
- Re-enable disabled locales and restore removed locales with stable identity

A draft-bearing transition must explain the lockout consequence, not merely report a count. Disable confirmation uses equivalent copy to: **“This locale has N drafts. Disabling it will make those drafts unavailable to editors. Nothing will be deleted; re-enable the locale to restore access.”** Removal uses the corresponding “restore the locale” wording. The confirmation also states that configured member grants are suspended rather than deleted and become effective again if the locale is restored. Cancel leaves the locale and drafts unchanged.

The UI never offers disable/remove controls for `en`; the server and database-facing transition logic remain authoritative.

### Locale tabs foundation

A reusable controlled `LocaleTabs` component renders enabled locales in stored order with both display name and canonical tag. It uses the shared shadcn tabs primitives and provides:

- Arrow-key/Home/End keyboard navigation through the underlying tab primitive
- Visible focus and status text not conveyed by color alone
- Controlled selected locale ID
- A pending-switch confirmation when the current locale has unsaved changes
- An announcement when selection changes
- Stable selection by locale ID, so reorder does not switch the active locale
- A safe response when the selected locale is disabled/removed by another actor

The M4 project page demonstrates English/Hindi/Gujarati tabs after those locales are enabled. Real draft, publication, validation, and completeness indicators are attached in later milestones without replacing the component contract.

Membership management gains an owner-only locale-access control for non-owner members. It supports all, selected enabled locales, and none, explains that restrictions apply server-side, and requires confirmation before reducing access. Demoting an owner explicitly warns that all-locale access is retained until this separate control changes it.

TanStack Query uses hierarchical locale/member keys and targeted invalidation after mutations. Query results, not duplicated client state, remain authoritative after version conflicts. No locale fallback is implemented in UI selection; an unavailable selected locale requires an explicit new selection.

## Threat and failure model

| Threat/failure                                 | Control                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Cross-project locale ID or allowlist injection | Composite tenant FKs, project-scoped queries, exact set validation, non-enumerating errors               |
| Case/alias duplicate (`EN` vs `en`)            | Pinned-registry canonicalization plus project/lower(tag) unique index                                    |
| Structurally valid but unregistered tag        | Generated IANA language/script/region/variant sets on browser and authoritative API boundaries           |
| Registry/host drift                            | Pinned generated snapshot; no runtime network, OS, ICU, or opaque package registry lookup                |
| Oversized/parser-abuse tag                     | 64-character pre-check, ASCII bounds, and one-tag deterministic parser                                   |
| Silent English fallback                        | Required locale schema and one exact enabled-locale resolver with no fallback branch                     |
| Restricted user edits another locale           | Default-deny locale context and normalized membership allowlist                                          |
| Restricted user mints broad credential         | Deny issue/rotate for selected/none membership modes                                                     |
| Concurrent reorder/add/state mutation          | Project-row lock, stable row lock order, optimistic versions, unique constraints                         |
| Position swap violates uniqueness              | Temporary disjoint range followed by final dense positions in one transaction                            |
| Removal destroys drafts/history                | Soft removal, restrictive FKs, no delete/cascade path                                                    |
| Published locale disappears silently           | Current publication blocks disable/remove; explicit unpublish required                                   |
| Draft-bearing locale withdrawn accidentally    | Typed dependency conflict followed by explicit draft-impact confirmation                                 |
| Required English disappears                    | Backfill/create invariant, no delete path, transition rejection, stored-en status check, invariant tests |
| UI permission bypass                           | Every operation authorizes server-side; hidden controls are convenience only                             |
| Audit/log data leak or cardinality explosion   | Stable IDs, bounded labels, no tag/display/allowlist payloads                                            |
| Stale tab or settings mutation                 | Locale versions, complete-set reorder validation, invalidation/refetch                                   |

## Test plan

### Pure/property/contract

- Canonicalization fixtures for registered language, script, region, variant, preferred aliases, and mixed case
- Rejection of unknown language/script/region/variant subtags, reserved/private-use ranges, extensions, and grandfathered tags without preferred values
- Rejection of empty, malformed, underscore, control, non-ASCII, multiple, and 65+ character inputs
- Browser/API parity fixtures and a pinned registry `File-Date` assertion
- Canonical and case-variant duplicate equivalence
- Display-name normalization and boundaries
- Locale lifecycle transition table, including permanent `en` protection
- Synthetic dependency summaries for publication block and draft confirmation behavior
- Complete-set reorder validation and identity preservation
- Explicit-locale schema rejects missing locale and never supplies `en`
- Exact resolver never attempts parent, English, ordered, or regional fallback
- New error/status/envelope/OpenAPI contracts

### Policy and Effect service

- Exhaustive role/action tests with all/selected/none locale access
- Own-locale content mutation allow and other-locale denial
- Missing locale context default denial for every content action
- Restricted locale-manager and credential issue/rotate denial
- Foreign/disabled/removed locale unavailability
- Replaceable LocaleRepository and AccessRepository Layers for success, typed failures, defects, and interruption
- Safe span/log/metric fields and bounded labels

### PostgreSQL integration

- New project atomically contains owner, `main`, enabled `en`, and all audit events
- Developer migration backfill gives every existing project exactly one enabled `en`
- Reusable read-only invariant query detects zero, missing, duplicate, or non-enabled project `en` rows after migration and test cleanup
- Project/tag case-insensitive uniqueness and cross-project allowance
- Composite tenant foreign-key rejection for locales and allowlists
- `en` state protection and absence of delete paths
- Active position uniqueness and removed-position consistency
- Concurrent same-tag create has one winner
- Concurrent same-version edit/state mutation has one winner
- Concurrent reorder/add serializes without duplicate/lost positions
- Reorder preserves IDs/tags and produces dense deterministic order
- Membership all/selected/none updates are atomic and versioned
- Owner restriction rejection, promotion-to-owner reset, and demotion retaining `all`
- Disabled/removed locale allowlists remain configured but ineffective, then become effective on restore
- Transaction rollback injection leaves no partial locale/access/audit state
- Representative `EXPLAIN` assertions for ordered locale listing, exact tag resolution, and membership allowlist lookup
- Two-workspace/two-project tenant-isolation matrix

### API

- Anonymous denial for every locale/access mutation procedure
- Owner/developer/content-role matrix for list and management operations
- Known member forbidden versus foreign/nonexistent project non-enumeration
- Missing/malformed/duplicate/oversized locale contracts
- Unsupported/disabled/removed exact locale typed error
- Version conflicts, invalid transitions, dependency conflicts, and request IDs
- Extra fields cannot alter tenant, identity, tag, status, order, or permission scope
- OpenAPI includes transformed input/output contracts and all success unions

### UI/accessibility

- English initial state and no disable/remove controls
- Add Hindi/Gujarati, canonical tag display, edit, reorder, disable, remove, restore
- Locale tabs preserve locale ID selection across reorder
- Keyboard navigation, focus visibility, labels, dialog titles, status text, and axe checks
- Unsaved tab-switch confirmation preserves work on cancel and switches only on confirmation
- Permission-filtered locale visibility and owner-only member restriction controls
- Pending, empty, forbidden, dependency warning, stale conflict, and retry states
- Draft-impact confirmations explicitly announce temporary inaccessibility, preservation, and restoration behavior
- Owner demotion warns that all-locale access remains until separately restricted
- Targeted TanStack Query invalidation without request waterfalls

### Final validation

After implementation and developer-applied migration, run `pnpm run ready`, read-only invariant/fixture checks, live runtime checks, production builds, Docker health, and the manual English/Hindi/Gujarati tab review.

## Decision-standard review

### Product-goal alignment

Stable project locale identities make localization foundational for schemas, entries, publications, delivery, generated tooling, and future visual bindings. Project scope avoids copying locale identity when environments or capabilities expand.

### Correctness

Canonical tags, stable IDs, exact matching, unique constraints, required English creation/backfill, explicit lifecycle rules, dependency guards, optimistic versions, and serialized reorder operations preserve identity and prevent fallback or lost updates.

### Security

Server-side default deny, tenant-composite constraints, permission-filtered lists, locale allowlists, credential-escalation prevention, bounded parser input, non-enumeration, and payload-free audit/observability protect authorization and data boundaries.

### Reliability

Short transactions, one lock-order root, no cascading deletion, reversible states, dependency blocks, rollback tests, and typed failures avoid partial configuration and destructive locale transitions.

### Performance

Locale sets are bounded, list and exact lookup paths are indexed, all rows are loaded in one query, reorder work is capped, and no N+1 query is required for membership allowlists.

### UX

Explicit names/tags/statuses, reversible state, clear impact confirmations, up/down ordering, keyboard tabs, stable selection, unsaved-change protection, and actionable typed failures make localization understandable without hiding strict behavior.

### DX

A branded canonical tag, stable locale ID, mandatory locale contract composition, exact resolver, generated oRPC/OpenAPI types, and centralized unavailable error make accidental fallback difficult in application and client code.

### Observability

Transactional audit events, named spans, request correlation, bounded operation metrics, and stable IDs diagnose mutations and denial without leaking content, display labels, tags as metric labels, or allowlists.

### Maintainability and future compatibility

A focused locale repository, normalized allowlists, restrictive FKs, soft lifecycle, and pure transition/policy functions let Milestones 5–15 attach schemas, drafts, publications, delivery, permissions, and visual bindings without changing locale identity or copying data.

## Database gate

Proposed migration name:

```text
add_project_locales
```

The developer approved this design, generated, reviewed, and applied `0003_add_project_locales.sql`. The agent updated the Drizzle schema and foundational contracts, inspected the generated structural DDL, and added the existing-project enabled-English backfill only after explicit developer authorization. The agent did not generate or apply the migration.

After manual testing exposed the limits of structural-only `Intl.getCanonicalLocales()` validation, the developer authorized the pinned-registry remediation and permanent cleanup of the three soft-removed invalid test rows. The API/browser validator now uses the generated IANA snapshot, and `doekdoek`, `oedll`, and `xlw` were deleted in one guarded transaction after verifying that all three were removed and had no membership grants.
