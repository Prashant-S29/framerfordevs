# Milestone 15 governance automation parity design

**Status:** Proposed; awaiting developer approval

**Date:** 2026-09-14

## Decision summary

Milestone 15 extends the additive bearer-only Control Plane v1 boundary with project governance automation while preserving the M3–M4 business authority.

The approved scope clarification is deliberately bounded:

- The seven existing project roles remain code-owned presets.
- A member policy is exactly the existing fixed role plus `all | selected | none` project-locale access.
- Invitation creation captures that complete policy, and acceptance applies it atomically when creating or reactivating membership.
- Member policy updates change role and locale access in one optimistic transaction, closing the current demotion-then-restriction widening window.
- The standalone role-only and locale-only member update procedures are retired; no residual transport or repository mutation can recreate the two-step window.
- The fixed role/action registry is inspectable but not editable.
- M15 adds no custom roles, persisted per-member action rules, collection/entry/field ACLs, or general policy DSL. M21 retains that future authority and its complete content-projection enforcement.

M15 provides stable HTTP and complete noninteractive CLI support for governance inspection, members, invitations, and locales. The hosted dashboard remains session-backed but invokes the same Effect operations and repositories. The public content/runtime SDK remains intentionally excluded.

The existing M14 project detail is the canonical portable inspection of the current primary `main` environment. M15 preserves and tests it rather than creating a duplicate environment resource or lifecycle authority.

## Authority and prior decisions

This design consumes and preserves:

- M2 stable workspace/project/environment identity, workspace-owner projection, project-row locking, and immutable audits.
- M3 fixed roles, owner-only member mutation, one-time invitation tokens, last-owner protection, non-enumeration, and the rule that management credentials cannot manage members or invitations.
- M4 project-scoped locale identity, required enabled `en`, reversible locale lifecycle, `all | selected | none` membership access, selected-locale rows surviving disable/removal, and strict no-fallback resolution.
- M12 official-CLI OAuth device authority, keychain storage, scope consent, and public artifact ownership.
- M14 bearer-only Control Plane v1, explicit actor adaptation, signed cursors, command receipts, request/response/rate bounds, canonical OpenAPI, and `sdkSupported: false`.
- The approved public HTTP/CLI/SDK boundary: governance is HTTP + CLI + hosted UI only and never enters the content/runtime SDK.

The developer approved the bounded reading after review of the broader alternative. The broader alternative would introduce speculative storage and enforcement across already accepted content paths before M18–M21 define the Studio and handover consumers. That would duplicate M21 authority and violate the roadmap rule against combining a new policy model with several product surfaces.

## Goals

M15 must deliver one coherent result:

1. An owner can reconcile project governance through deterministic HTTP or CLI without scraping the dashboard.
2. An invitation can grant a fixed role and exact locale access before acceptance; the accepted member never passes through implicit all-locale access.
3. An owner can atomically change a member's role and locale access with exact version and last-owner protection.
4. Authorized callers can list and search members and invitations with signed bounded pagination and stable failures.
5. OAuth users and exact management credentials can administer project locales only within their previously approved authority, with honest user-or-credential attribution.
6. Dashboard, HTTP, and CLI adapters share policy, transaction, concurrency, audit, and projection authority.
7. Current `main` environment inspection remains available through the M14 project projection without adding multi-environment lifecycle.

## Non-goals

M15 does not add:

- Project-defined roles, custom roles, action overrides, policy expressions, deny rules, or a general policy language
- Persisted collection, entry, field, publication-state, or environment-specific membership restrictions
- Per-locale credential allowlists
- Content or Studio editing UX
- Credential issue/list/rotate/revoke, webhook administration, audit browsing, recovery/operator controls, billing, or commercial administration
- Additional user-visible environments, environment create/archive/promotion, or locale identity copied per environment
- Invitation email delivery/provider integration
- Workspace membership administration or ownership transfer
- Control Plane browser CORS, bearer use from hosted React, or governance SDK exports
- Production OAuth activation, package publication, hosted-domain rollout, or deployment

M21 owns custom client restrictions and complete enforcement in content payloads, counts, search, direct routes, and direct APIs. M22–M23 own durability and production hardening. The old M4 note naming “Milestone 15 production hardening” predates roadmap normalization; M15 reruns the required-`en` invariant evidence but does not add a trigger or operational monitor. M23 must reconsider prevention/monitoring under its production threat model.

## Domain model

### Fixed role registry

The role identities remain:

- `owner`
- `developer`
- `content_admin`
- `editor`
- `reviewer`
- `client_editor`
- `read_only`

Their action sets remain the code-owned `projectRolePermissions` authority. M15 may reorganize that registry for reusable projections, but no database role table, project-specific role identity, editable action list, or compatibility alias is introduced.

A governance inspection returns the canonical role order and each role's schema-backed base actions. It also declares the owner invariant that locale access must be `all`. Descriptions and localized labels remain UI/docs presentation, not server authorization data.

### Member policy

The complete mutable member policy is:

```ts
type ProjectMemberPolicy = {
  role: ProjectRole;
  localeAccess: ProjectLocaleAccess;
};
```

This is a projection over existing membership columns and normalized locale-access rows, not a new custom-policy entity.

Rules:

- `owner` requires `{ mode: "all" }`.
- `selected` requires 1–100 unique stable locale IDs from the exact project that are enabled when the policy is assigned.
- `none` grants no locale-scoped content action.
- Role action grants and locale restrictions continue to intersect in the default-deny policy service; neither grants authority the other denies.
- Configured selected IDs survive later disablement or soft removal. Effective access is suspended until the same stable locale is enabled/restored.
- Promotion to owner requires explicit `all`; the server does not silently rewrite an incompatible request.
- Demotion from owner accepts the complete desired non-owner policy in the same transaction. There is no intermediate all-locale state when selected/none is requested.
- Same desired role and locale access is a no-op with no version increment or audit event.

The standalone `platform.projects.members.updateRole` and `platform.projects.members.updateLocaleAccess` procedures are retired in M15 rather than retained as compatibility adapters. Repository call-graph review found only the current hosted `ProjectAccessSettings` component as a production caller; all other references are the owning router/contracts/operations and their tests. The hosted caller is migrated to complete policy update in this milestone, while the CLI/SDK contain no caller and packages remain unpublished. Their input schemas, operation exports, router entries, repository methods, and mutation-specific tests are removed or converted to the atomic policy authority. Historical M3/M4 decisions remain accurate implementation history, but this M15 decision supersedes those two procedure shapes.

Changing only one dimension remains possible without functional loss: the caller submits the current unchanged role or locale access alongside the changed dimension under the same exact membership version. There is one mutation path and no server-side role-only demotion that implicitly retains broad locale access.

### Invitation policy

A pending invitation stores:

```ts
type ProjectInvitationPolicy = {
  role: ProjectRole;
  localeAccess: ProjectLocaleAccess;
};
```

Creation rules match member policy. Owner invitations must use `all`. Selected locale IDs must be exact, enabled project locales at creation time.

Acceptance:

1. Validates the digest-only token and canonical authenticated email.
2. Locks in project-before-invitation-before-membership order and rechecks pending/unexpired state.
3. Creates or reactivates workspace collaborator membership as today.
4. Creates or reactivates the stable project membership with the invitation's exact role, locale mode, and selected rows in the same transaction.
5. Marks the invitation accepted and writes the existing membership/invitation audits atomically.

Acceptance never mutates an already-active project membership. Invitation creation rejects an email already attached to an active project member with `INVITATION_CONFLICT`; if a race creates active membership before acceptance, acceptance returns the non-enumerating `INVITATION_INVALID` result and leaves policy mutation to the versioned member-policy operation.

A repeated acceptance by the same authenticated user after a successful acceptance returns the current membership without another version change or audit. A different user, email mismatch, revoked/expired invitation, or malformed/unknown token remains `INVITATION_INVALID`.

Selected invitation rows intentionally retain configured stable IDs if a locale is disabled or removed after invitation creation. Acceptance copies those configured grants; effective locale resolution still requires enabled state. Inspection and acceptance UX explain suspended grants rather than widening to `all`.

### One-time invitation token

The M3 secret contract remains unchanged:

- The server generates 32 cryptographically random bytes and returns 43-character unpadded base64url once.
- Only SHA-256 of the token is stored.
- The token appears only in the create response and the existing URL fragment form.
- List, search, get, audit, logs, traces, metrics, cursors, command receipts, generated artifacts, and database rows never contain the raw token.

Invitation creation is intentionally not command-receipt replayable. Replaying a server-generated secret would require storing recoverable secret material or returning a misleading response without the token. M15 does neither. The project/email pending uniqueness constraint prevents duplicate logical invitations. After an ambiguous response, the CLI does not retry or revoke automatically: the caller lists/searches the exact email, revokes the pending invitation if appropriate, and issues a new token explicitly. This recovery is documented and machine-readable.

Invitation inspect/accept CLI commands read the token only from bounded stdin, never from an argument, URL query, process environment, retry journal, or config file. Public HTTP necessarily accepts the token in a bounded JSON body; boundary logging never records bodies.

## Portable HTTP contract

### Family and profile

M15 evolves the additive canonical `control-plane/v1` OpenAPI document. The data transport remains:

- Bearer-only and cookie-independent
- Originless with browser `Origin` and preflight rejected
- Redirect-free and `Cache-Control: no-store`
- Strict JSON with excess properties rejected
- Standard `{ ok, data, error, message }` envelopes
- 64 KiB request, 512 KiB response, and 4 KiB query bounds
- No executable browser console for bearer operations
- `sdkSupported: false`

The document version advances additively while the family/major remains v1. Existing M14 paths and representations remain compatible. The canonical artifact and baseline digest intentionally change only after approval and implementation; other public family artifacts must remain byte-identical.

### Governance inspection

```text
GET /projects/{projectId}/governance
```

OAuth-user-only. It requires the new governance-read OAuth grant plus current `project.read` membership policy and returns:

- Project ID
- Existing primary `main` environment projection from M14
- Current user's role and configured locale access
- `baseRoleActions`: the fixed preset grants before locale narrowing
- `effectiveProjectActions`: actions currently allowed without exact-locale context
- `effectiveLocaleIds` plus `effectiveLocaleActions`: enabled locale identities and role-permitted content actions that are valid only when paired with one of those exact IDs
- Canonically ordered fixed role policies with base action lists and owner all-locale constraint
- Booleans derived from current policy for member/invitation/policy administration

The current `isActionVisibleForLocaleAccess` helper is not retained as a parallel authority: it incompletely mirrors `PolicyService` for restricted members. Source review confirms this is user-visible, not merely internal. For a selected/none developer, the helper currently reports `schema.write`, `schema.publish`, `delivery.configure`, `webhook.read`, and `webhook.manage` even though `PolicyService` denies those project-global actions; some screens consume those values to render write/configuration controls, while one project-page webhook link adds an ad hoc locale-mode check.

M15 replaces the helper and compensating UI checks with one reusable pure policy projector used by governance, current-access, and hosted permission responses. The before/after behavior is explicit: restricted developers retain those values only in explanatory `baseRoleActions`; they disappear from `effectiveProjectActions`, while content actions appear only as exact-locale authority paired with currently enabled permitted locale IDs. Locale-scoped content actions never appear as globally effective, and configured disabled/removed locale IDs remain distinguishable from currently effective enabled IDs. `project.credential.revoke` and other actions that the canonical policy intentionally permits despite locale restriction remain effective.

It returns no member rows, invitation email, credential data, actor pointers, collection/field metadata, custom rules, or raw policy context. A management credential cannot use this route because credentials are not user memberships and must not be projected as their issuer or as a synthetic assignable role.

The existing `GET /projects/{projectId}` remains the canonical exact project/current-`main` environment inspection for OAuth users and approved management credentials. No duplicate environment get/list resource is added in M15.

### Members

```text
GET  /projects/{projectId}/members
PUT  /projects/{projectId}/members/{membershipId}/policy
POST /projects/{projectId}/members/{membershipId}/remove
```

Member list query:

```ts
type MemberListQuery = {
  role: ProjectRole | null;
  search: string | null;
  limit: 1..50;
  cursor: SignedCursor | null;
};
```

`search` is optional trimmed/NFC-normalized, case-insensitive literal prefix matching over member name and canonical email, bounded to 100 characters. SQL wildcard characters are escaped and have no pattern meaning. The repository continues returning active memberships only; removed history remains audit/recovery scope elsewhere. Results sort by `(created_at desc, membership_id desc)` and expose no total count.

The complete policy update body is exact:

```json
{
  "expectedVersion": 3,
  "role": "client_editor",
  "localeAccess": {
    "mode": "selected",
    "localeIds": ["locale-uuid"]
  }
}
```

It requires both `project.member.role.update` and `project.member.locale.update`, locks the project, scopes the target by project and membership ID, verifies exact version and selected locales, applies role/mode/rows, and writes one `project.membership.policy.updated` audit. Last-owner protection is evaluated under the same project lock. Remove similarly scopes by both IDs, requires `project.member.remove`, and preserves M3 collaborator cleanup and last-owner behavior.

All member routes are OAuth-user-only. Management, Delivery, and Preview credentials are denied generically before member data is loaded.

### Invitations

```text
GET  /projects/{projectId}/invitations
POST /projects/{projectId}/invitations
POST /projects/{projectId}/invitations/{invitationId}/revoke
POST /invitations/inspect
POST /invitations/accept
```

Invitation list query:

```ts
type InvitationListQuery = {
  status: "all" | "pending" | "accepted" | "revoked" | "expired";
  search: string | null;
  limit: 1..50;
  cursor: SignedCursor | null;
};
```

Search is a canonical-email literal prefix with the same 100-character bound. Effective expiry is evaluated against a first-page `asOf` instant carried in the signed cursor so rows do not shift between pending and expired while traversing a page sequence. Results sort by `(created_at desc, invitation_id desc)` and expose no total.

Create requires an exact email, fixed role, and locale access. Public HTTP requires `localeAccess`; omission never defaults silently at this boundary. The response returns the invitation and raw token once. The protected legacy adapter may supply explicit `all` for an old internal caller, but the updated hosted UI always asks for complete policy.

Revoke requires exact project/invitation scope and expected version. Inspect requires OAuth governance-read scope plus token/email proof. Accept requires OAuth governance-write scope plus token/email proof. Inspect returns only safe project/inviter display metadata and the configured role/locale policy; selected locale display projections are bounded and reveal no content.

All invitation routes are OAuth-user-only. The M3 rule forbidding management credentials from member/invitation administration remains load-bearing.

### Locales

```text
GET   /projects/{projectId}/locales
POST  /projects/{projectId}/locales
PATCH /projects/{projectId}/locales/{localeId}
PUT   /projects/{projectId}/locales/order
PUT   /projects/{projectId}/locales/{localeId}/status
```

List query preserves the two existing projections:

- `view=effective` requires `locale.read` and returns only enabled locales permitted by current user locale policy.
- `view=settings` requires `locale.manage` and can include disabled/removed rows through explicit `includeRemoved`.

The project maximum of 100 non-removed locales bounds list/order payloads, so locale list does not add pagination or totals.

Create body includes `commandId`, canonical tag, and display name. It extends M14 command receipts with `project_locale.create`, enabling exact replay without duplicate locale/audit state. A same command/actor/scope/fingerprint replays; command reuse with changed intent returns `COMMAND_CONFLICT`; a new command for an existing canonical tag returns `LOCALE_CONFLICT`.

Display-name update, status update, and complete-set reorder retain M4 optimistic versions, no-op suppression, dependency guards, English protection, dense ordering, and project-row lock. Every path and body carries project ID plus target locale ID, and repositories authorize the project before loading sensitive target state.

OAuth callers require governance read/write grants in addition to current role/action policy. Exact management credentials use existing `locale.read`/`locale.manage` scopes, must match the project and current primary `main` environment, and are attributed as credentials. No management scope is added.

### Current `main` environment

M14 already returns the stable primary environment ID, key `main`, name, primary flag, and creation time from `GET /projects/{projectId}`. M15:

- Keeps that response authoritative
- Adds a focused CLI projection command implemented over the existing project GET
- Uses the returned stable environment ID for exact management-credential and locale audit scope
- Adds no environment mutation, list, alias, fallback, or caller-selected “current” state

M24 remains the only owner of additional user-visible environment lifecycle and promotion.

## Principal and authorization matrix

### OAuth grants

The official CLI resource adds:

- `control-plane:governance:read`
- `control-plane:governance:write`

Governance read is required for governance/member/invitation/locale inspection. Governance write is required for member policy/removal, invitation create/revoke/accept, and locale mutations. Existing M14 project read remains required by its existing routes; new governance grants do not imply tenant authority.

The CLI login consent surface documents the grants. Existing refresh tokens cannot gain them; a stable scope-denial diagnostic requests re-login. Every request still resolves the current user membership, fixed role, project archive state, and locale policy. Scope is necessary and never sufficient.

### Session users

Hosted dashboard oRPC remains Better Auth session-only. Session identity is adapted to the same branded user actor and invokes the same operations/repositories without OAuth-scope checks. It does not call bearer HTTP or receive CLI tokens.

### Management credentials

M3 remains authoritative: credentials cannot manage or inspect members/invitations, issue credentials, archive projects, or impersonate users.

| Operation                                  | Management credential authority                            |
| ------------------------------------------ | ---------------------------------------------------------- |
| Governance/current-user policy inspection  | Denied                                                     |
| Member/invitation list/search/get/mutation | Denied                                                     |
| Invitation inspect/accept                  | Denied                                                     |
| Effective locale list                      | `locale.read`, exact project/current primary environment   |
| Locale settings list and mutations         | `locale.manage`, exact project/current primary environment |
| Current `main` inspection                  | Existing `project.read` M14 project-get authority          |

Revoked, expired, rotated, wrong-family, wrong-scope, foreign-project, and foreign-environment credentials fail with generic credential behavior. There is no fallback from management credential to OAuth identity and no lookup of the issuing user's current role.

### Shared actor

Repository-facing project actor authority remains structurally:

```ts
type ProjectActor = { kind: "user"; id: AuthUserId } | { kind: "credential"; id: ApiCredentialId };
```

Implementation may centralize the internal structural type now duplicated by Authoring and Control Plane, while preserving their public schema identifiers and exports. Membership/invitation methods narrow to user before persistence. Locale methods accept both branches. Actor-specific columns and audit values are derived from the actual branch; credentials are never translated to `createdByUserId`/`changedByUserId` or their issuer.

## Pagination and search authority

The M14 signer is extended, not duplicated. New cursor routes are `members` and `invitations`.

Cursor authority binds:

- Family/major and exact route
- Opaque principal key
- Project ID
- Limit
- Canonical role/status filter
- SHA-256 of canonical search text, never raw PII
- Final sort timestamp and stable ID
- Invitation `asOf` instant where applicable
- Issued/expiry times and key rotation authority

Tampered, expired, wrong-principal, wrong-project, wrong-route, wrong-limit, wrong-filter, wrong-search, and repeated cursors return `CONTROL_PLANE_CURSOR_INVALID`. Pages fetch `limit + 1`, return at most 50, expose no totals, and CLI iteration retains maximum-page and repeated-cursor guards.

Search authorization occurs before query execution. Responses contain only fields already approved for the caller. Search text, matched email/name, and raw cursor bytes never enter logs, traces, metrics, or error details.

Implementation must provide representative PostgreSQL `EXPLAIN` evidence for unfiltered and filtered pages. Prefix search remains literal and bounded; supporting expression indexes may be added only through the migration gate if measured plans require them. No trigram extension or new dependency is assumed.

## Concurrency, idempotency, and lock order

### Member policy and removal

- Lock project before target membership and owner count.
- Reauthorize under the lock.
- Scope target by `(project_id, membership_id)`.
- Require exact positive version.
- Apply role, locale mode, selected rows, version, and one audit atomically.
- Last-owner demotion/removal has no race window.
- No-op complete policy writes do not increment or audit.

### Invitations

- Creation locks project, authorizes owner policy, validates selected locales and active-member conflict, then inserts token digest, policy, selected rows, and audit atomically.
- Unique pending `(project, canonical email)` prevents duplicate logical invitations.
- Acceptance serializes project/invitation/user/membership state, applies exact initial policy, and is replay-safe only for the same already-accepted user.
- Revocation is optimistic and serialized with acceptance so exactly one terminal transition wins.
- Raw token never participates in a receipt or lock key.

### Locales

- Existing project-before-locale order remains.
- Locale create additionally serializes command receipt and state/audit in one transaction.
- Versioned display/status/order mutations preserve M4 behavior.
- Credential actor scope and current-primary check occur inside the same transaction before state change.

### Command receipt extension

M15 adds only:

- Operation `project_locale.create`
- Result resource type `project_locale`
- Existing `created` disposition

User locale receipts are project-scoped. Credential locale receipts additionally bind the credential's exact environment. The receipt stores no tag, display name, request JSON, actor email, or other metadata—only the canonical fingerprint and existing stable scope/result fields.

## Database impact and migration gate

M15 requires a developer-controlled migration. Proposed name:

```text
add_governance_automation_authorities
```

### Invitation policy

Extend `project_invitation` with:

- `locale_access_mode`, non-null, default `all`, checked to `all | selected | none`
- Owner-role/all-locale consistency check
- Unique `(id, project_id, workspace_id)` needed by tenant-composite child authority

Add `project_invitation_locale_access`:

- Invitation, workspace, project, and locale IDs
- Primary key `(invitation_id, locale_id)`
- Composite tenant FK to invitation
- Composite tenant FK to project locale
- Reverse locale index and created timestamp

Existing invitations backfill safely to `all`; no selected rows are fabricated. The repository maintains the rule that child rows exist only for selected mode.

### Honest locale actor attribution

Normalize `project_locale` creator/changer authority:

- Make existing user actor columns nullable while preserving all existing values
- Add nullable creator/changer credential IDs
- Add creator/changer credential environment IDs where needed for exact composite FKs
- Require exactly one user or complete credential actor for creator and changer
- Add composite FKs to `(credential, workspace, project, environment)` and supporting partial indexes

Credential-authored locale audit rows use `actor_type=credential`, actual credential ID, and exact credential environment. User-authored rows remain unchanged.

### Receipt registry

Extend closed command-receipt operation/result/scope checks for project-locale create and add no new receipt table or payload column.

### Search indexes

Add only indexes justified by deterministic plan evidence for the approved literal-prefix member/invitation queries. The Drizzle schema names the intended expressions/partial scope; no extension is installed speculatively.

### Required-English invariant

No trigger is introduced in M15. Project creation, restricted repositories, PostgreSQL checks, no locale delete path, and the reusable invariant query continue to protect `en`. Migration and acceptance evidence must show exactly one enabled `en` per project. M23 revisits prevention/monitoring for direct database and operator paths.

### Gate procedure

After design and implementation approval:

1. Edit only approved Drizzle schema and focused schema tests.
2. Stop and provide the exact migration name/commands.
3. The developer generates the real migration.
4. Inspect generated SQL, snapshot, and journal completely; never edit/apply them.
5. Any correction is prepared only under ignored `tmp/migrations/` for developer transfer.
6. After developer application/confirmation, inspect the live catalog read-only and continue integration tests with the independent worker stopped.

No existing migration or snapshot is edited or replaced.

## Effect and repository ownership

Planned ownership:

```text
packages/api/src/contracts/control-plane/          additive governance schemas/OpenAPI
packages/api/src/operations/control-plane/public/  bearer decode/auth/rate adaptation
packages/api/src/operations/access/                user governance workflows
packages/api/src/operations/locales/               shared user/credential locale workflows
packages/api/src/services/access-repository.ts     invitation/member transaction authority
packages/api/src/services/locale/repository.ts     locale transaction/actor authority
packages/api/src/services/control-plane/           signed cursors and locale-create receipts
packages/db/src/schema/access.ts                    invitation policy columns
packages/db/src/schema/locale.ts                    invitation allowlist and locale actors
packages/db/src/schema/control-plane/               closed receipt extension
packages/cli/src/control-plane-command/             governance command adaptation
packages/cli/src/control-plane-http-client/         strict transport and decoding
apps/server/src/control-plane-router.ts             isolated Express routes only
apps/web/src/components/project/                    session-backed governance UX
apps/developers/                                    governance task/reference docs
packages/public-contracts/                          canonical v1 artifact/baseline
```

Business operations remain named `Effect.fn` values with typed expected errors and replaceable services/Layers. Drizzle promises stay inside repositories. Server/CLI runtime boundaries use existing shared `ManagedRuntime` composition. Express owns method/path/body/response mechanics only and no policy or SQL.

The access and locale repositories remain sole business authorities. Public adapters do not call dashboard procedures; hosted adapters do not call bearer HTTP. Both adapt their principals to shared operations.

## CLI contract

Exact proposed commands:

```text
ffd governance inspect --api <origin> --project <id>
ffd member list --api <origin> --project <id> [--role <role>] [--search <prefix>] [--limit <n>] [--cursor <cursor>]
ffd member policy set --api <origin> --project <id> --member <id> --expected-version <n> --role <role> --locale-access all|selected|none [--locale <id> ...]
ffd member remove --api <origin> --project <id> --member <id> --expected-version <n>
ffd invitation list --api <origin> --project <id> [--status <status>] [--search <email-prefix>] [--limit <n>] [--cursor <cursor>]
ffd invitation create --api <origin> --project <id> --email <email> --role <role> --locale-access all|selected|none [--locale <id> ...]
ffd invitation inspect --api <origin> --token-stdin
ffd invitation accept --api <origin> --token-stdin
ffd invitation revoke --api <origin> --project <id> --invitation <id> --expected-version <n>
ffd locale list --api <origin> --project <id> [--view effective|settings] [--include-removed]
ffd locale create --api <origin> --project <id> --tag <tag> --display-name <name> [--command-id <uuid>]
ffd locale update --api <origin> --project <id> --locale <id> --expected-version <n> --display-name <name>
ffd locale reorder --api <origin> --project <id> --item <locale-id>:<version> [--item ...]
ffd locale status set --api <origin> --project <id> --locale <id> --expected-version <n> --status enabled|disabled|removed [--confirm-draft-impact]
ffd project environment get --api <origin> --project <id>
```

Rules:

- Every command requires explicit `--api`; no remembered tenant/host/environment authority.
- `--json` remains deterministic stdout-only output; diagnostics go to stderr.
- Repeatable locale/item flags are parsed as closed declared repeatable flags, not a general duplicate-flag allowance.
- Selected mode requires at least one unique `--locale`; all/none reject locale flags.
- Invitation token input is stdin-only and strictly bounded. Token output is shown once after create; JSON necessarily contains it for automation and documentation warns callers to capture it securely.
- Locale create uses the existing content-free retry journal. Invitation create does not journal token/email/body or perform hidden retry after ambiguous transport failure.
- Version conflicts do not trigger blind read-modify-write retries. Agents refetch, compare desired/current state, and issue a new explicit versioned command.
- List commands return one bounded page by default. Explicit all-page helpers, if retained, enforce maximum pages and repeated-cursor detection and never become default CLI behavior.
- `FFD_MANAGEMENT_TOKEN` is accepted only for the operation matrix above and is never persisted/printed. OAuth scope denial never falls back to a management credential.
- Exit 0 means accepted success/replay/no-op; typed failures remain exit 1; existing schema-check drift exit 2 is unchanged.

The focused environment command is a projection over existing M14 `GET /projects/{projectId}` and creates no second HTTP authority.

## Hosted dashboard UX

The dashboard remains a resilient session-based control-plane client.

### Members and invitations

- The invite dialog requires role and locale access before submission and explains configured versus currently effective locales.
- Owner implies all locales and disables incompatible controls.
- The one-time link modal retains copy/acknowledgement behavior and clears secret state when closed.
- Member role and locale controls become one policy editor with one save and one impact confirmation.
- Owner demotion can choose all/selected/none before confirmation; the prior “demote then restrict later” widening guidance is removed.
- Last-owner, stale version, unavailable locale, pending invitation conflict, and ambiguous invitation issuance have specific recoverable states.
- Bounded role/search/status filters reset pagination and use hierarchical TanStack Query keys.
- Non-owner mutation controls remain absent, while server authorization remains authoritative.

### Locales

Existing accessible locale settings remain, but their operations use shared actor-aware services. UI behavior continues to disclose suspended/restored configured grants, draft/publication dependency impact, immutable tag/ID, required English, and no fallback.

No Studio content route, hosted domain change, or bearer token enters browser code in M15.

## Errors

The Control Plane v1 closed public error union adds existing application codes needed by governance:

- `INVITATION_CONFLICT`
- `INVITATION_INVALID`
- `LAST_OWNER_REQUIRED`
- `LOCALE_CONFLICT`
- `LOCALE_UNAVAILABLE`
- `LOCALE_DEPENDENCIES_EXIST`

Existing validation, unauthorized, forbidden, not-found, version, invalid-transition, command-conflict, cursor, credential, quota, service, and internal failures remain.

Semantics:

- Known active members lacking an action may receive `FORBIDDEN`.
- Foreign/nonexistent project/member/invitation/locale scope is non-enumerating `NOT_FOUND` where token-specific rules do not require `INVITATION_INVALID`.
- Credential failures remain generic.
- Stale optimistic writes return `VERSION_CONFLICT` and never server-merge.
- Locale dependency details contain only capped counts/booleans already approved by M4.
- Errors never echo search strings, email, names, locale access lists, tokens, bodies, database causes, or actor IDs.

## Audit and observability

Existing invitation, membership, and locale audit actions remain. M15 adds:

- `project.membership.policy.updated`

Atomic policy updates emit one action, not separate role/locale events. Invitation policy is not copied into audit payload. Existing invitation create/accept/reactivate actions describe lifecycle, while current state remains in normalized tables.

Named spans cover governance inspection, member/invitation list/search, policy update, token lifecycle, locale operations, cursor verification, and receipt replay. Safe span attributes may include closed operation, actor kind, stable project/environment/resource IDs, role/mode/status values, result/page/size buckets, replay/no-op, and duration.

Logs/traces exclude emails, names, search text, tokens/digests, selected locale arrays, request/response bodies, OAuth grants as free text, and cursor bytes. Metrics use closed operation/principal/outcome/status/cost/page/size buckets only; no tenant/resource/user/email/locale/search identifiers become labels.

M15 initially retains M14 global/principal 60-second buckets unless measured implementation evidence requires explicit developer-approved adjustment. Proposed operation costs are read 1, list/search 2, optimistic update 3, and secret/destructive/create 5. Cost and operation label unions remain closed.

## Security and failure model

| Threat/failure                                                  | Control                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Custom policy engine accidentally enters M15                    | Closed fixed-role + locale policy schema; no policy tables/DSL; forbidden-surface tests             |
| Invitation grants all locales briefly                           | Policy stored on invitation and copied atomically during create/reactivation                        |
| Owner demotion temporarily leaves broad locale access           | One complete role+locale policy transaction                                                         |
| Concurrent owners remove/demote last owner                      | Project lock, re-read, exact version, active-owner count                                            |
| Invitation changes an active member without version             | Creation conflict plus acceptance refusal for active membership                                     |
| Raw invitation token leaks or becomes replay storage            | Server CSPRNG, digest-only DB, one-time output, fragment link, stdin input, no receipt/log/artifact |
| Ambiguous invitation response causes duplicate or silent revoke | Unique pending email, no hidden retry, explicit list/revoke/reissue recovery                        |
| OAuth scope alone grants tenant governance                      | Current membership/role/locale policy rechecked in repository                                       |
| Credential impersonates issuer or manages members               | Closed route matrix, user-only narrowing, actual credential actor/tenant FK                         |
| Foreign membership/invitation/locale ID substitution            | Project-first authorization and composite project/target predicates/FKs                             |
| Cursor replays under another filter/principal                   | Signed route/principal/project/filter/search-digest/limit binding and expiry                        |
| Search wildcard or unbounded scan abuse                         | Literal escaping, strict length/page/rate bounds, query-plan evidence                               |
| Locale credential mutates global project from wrong environment | Exact project/current-primary environment check in transaction                                      |
| `en` disappears                                                 | Existing checks/no-delete/repository authority plus invariant gate; M23 operational follow-up       |
| Browser steals CLI bearer                                       | Origin/preflight rejection, no CORS, hosted session adapter, no SDK export                          |
| Partial state/audit/receipt                                     | One transaction and failure injection at every persistence stage                                    |

## Performance and reliability evidence

Implementation approval should require:

- Indexed member and invitation unfiltered pages
- Representative role/status/search-prefix plans and bounded result memory
- Signed cursor page stability under inserts and invitation expiry
- Concurrent invitation create/accept/revoke and active-member races
- Concurrent member policy/demotion/removal with last-owner invariant
- Selected-locale invitation acceptance with locale disable/remove races
- Locale create receipt replay/contention and status/reorder contention
- Credential current-primary enforcement and actor FK integrity
- Response-size evidence for maximum 50 members/invitations, 100 locales, and role matrix
- Existing Control Plane, Authoring, Delivery, Preview, and worker budgets unchanged

No new runtime dependency is expected. If evidence requires one, provenance/license/audit and explicit approval occur before adoption.

## Test plan

### Pure and contract tests

- Complete fixed role/action matrix and canonical role ordering
- Shared policy projection distinguishes base, effective project, configured locale, and effective exact-locale authority without duplicating `PolicyService`
- Member/invitation policy all/selected/none boundaries and owner constraint
- Public create requiring explicit locale access while protected compatibility defaults remain explicit
- Search normalization, literal wildcard escaping, length, and filter closure
- Governance request excess-property rejection and response bounds
- Cursor round trip/tamper/expiry/key rotation/principal/project/route/filter/search/limit mismatch
- Locale-create command fingerprint/receipt operation extension
- New errors/status/retryability/envelope mapping
- Additive OpenAPI operations/security and forbidden custom-policy/SDK surfaces
- Existing non-Control-Plane public artifacts byte-identical

### Effect service tests

- User/credential actor adaptation without issuer fallback
- Repository/clock/secret/cursor/receipt/rate/telemetry Layers replaceable
- Expected failure versus defect/interruption behavior
- Span annotations contain only stable bounded metadata
- Standalone role-only/locale-only contracts, operations, router entries, and repository methods are absent; single-dimension intent submits a complete atomic policy

### PostgreSQL integration

- Existing pending invitations backfill to all locale access
- Invitation selected rows reject cross-project locale IDs at FK/repository boundaries
- Invitation create/accept/reactivation copies exact policy atomically
- No observable accepted membership ever has intermediate all access
- Active-member invitation conflict and acceptance race do not mutate policy
- Same-user accept replay emits no duplicate audit/version; foreign replay fails
- Member policy no-op, version conflict, selected validation, owner promotion/demotion, and last-owner contention
- Locale user/credential exactly-one creator/changer checks and composite tenant FKs
- Credential locale writes use actual credential audit actor and exact environment
- Locale create state/audit/receipt rollback and concurrent replay
- Member/invitation page/search query plans and index use
- Required-enabled-English invariant and zero partial selected-mode rows after failure injection
- Two-workspace/two-project/principal isolation matrix

### HTTP and security integration

- Every new method/path/query/body/content-type success and closure case
- Cookies ignored; Origin/preflight, duplicate authorization, redirects, GET bodies, mutation queries, oversized input/output denied
- OAuth governance grants required separately from current tenant role
- Management credential exact locale success and member/invitation/governance denial
- Delivery/Preview credential generic rejection
- Search and cursors cannot cross principal/project/filter
- One-time token absent from headers/errors/telemetry and inspect/accept require matching OAuth email
- Stable machine error codes and request IDs
- Existing 13 M14 operations remain compatible

### CLI

- Exact command/flag ownership including declared repeatable flags
- JSON/stdout and diagnostic/stderr separation
- Stdin-only invitation token handling and strict bounds
- One-time create output and ambiguous-response recovery without hidden retry
- Locale receipt journal replay/clear behavior
- Version conflict/refetch workflow and no blind mutation retry
- Signed one-page lists and repeated-cursor/max-page protection
- OAuth re-login diagnostic and no management fallback
- Environment projection uses existing project GET

### Hosted UI and accessibility

- Invite role+locale form, selected locale validation, owner constraint, and secret acknowledgement
- Atomic member policy editor including demotion/restriction confirmation
- Last-owner/stale/unavailable/ambiguous recovery states
- Search/filter pagination reset and targeted query invalidation
- Permission-filtered controls and server rejection of forged calls
- Locale lifecycle/configured-grant disclosure retained
- Dialog titles/descriptions, labels, error summaries, focus restoration, keyboard operation, status text, and axe checks
- No token retained in ordinary mutation/query cache after modal close

### Package, docs, and manual review

- Canonical Control Plane artifact/reference/guide parity and intentional baseline update
- No governance symbol/method in SDK exports, bundles, docs examples, or package fixtures
- CLI package contains all commands and no secret-bearing journal/config fixture
- Dashboard and CLI changes do not add duplicate React/UI package copies
- Manual selected-locale invitation → acceptance → exact content denial/allow proof
- Manual atomic owner demotion/restriction and concurrent last-owner proof, including absence of the retired standalone procedures
- Manual before/after restricted-developer projection: the old UI incorrectly offered schema publication, Delivery configuration, and direct-route webhook management while repositories denied them; the new effective projection removes those controls but preserves canonical base-role explanation
- Manual OAuth versus management credential route/actor matrix
- Manual dashboard/CLI bidirectional locale and member policy projection
- Manual token/redaction/artifact inspection and ambiguous issuance recovery
- Manual current `main` environment inspection through existing project authority

## Decision-standard review

### Product-goal alignment

The design makes existing governance genuinely automatable and closes a real invitation-time privilege window without inventing the M21 policy product before its Studio consumer exists.

### Correctness

Complete desired policy inputs, stable IDs, normalized selected rows, exact versions, project-first scope, lock order, last-owner checks, signed filter-bound cursors, and atomic audits prevent partial or stale governance state.

### Security

OAuth grants remain necessary but insufficient; member/invitation authority stays user-owner-only; locale credentials remain exact and honestly attributed; one-time tokens stay digest-only; search/list output is permission-filtered and bounded; the SDK/browser bearer boundaries remain closed.

### Reliability

Atomic invitation acceptance and member policy updates remove intermediate authority, terminal invitation transitions serialize, locale creates replay through receipts, versioned mutations fail deterministically, and failure injection proves rollback.

### Performance

Pages and locale sets are bounded, no totals are computed, cursor order is stable, search is literal/rate-limited, and implementation must provide query-plan and response-size evidence before acceptance.

### UX and DX

Owners choose the intended role and locale access once, agents receive stable JSON/errors/cursors, secret handling is explicit, and stale/ambiguous outcomes have documented reconciliation rather than hidden retries.

### Observability

Actual actors, stable scope, closed operation/outcome labels, and transactional audits diagnose governance while excluding token, email, search, selected-locale, and body data.

### Maintainability

The design extends existing access/locale repositories, Control Plane transport, CLI, and dashboard adapters. It creates no second policy engine, environment model, SDK namespace, or app-owned business authority, leaving M21 a clean place to add requirements-driven custom restrictions.

## Approval gate

This record is a proposal only. Developer approval is required before implementation. Approval must explicitly acknowledge the intentional invitation-create exception: it is unique/conflict-safe but not receipt-replayable because replay would require recoverable storage of a one-time server-generated token. After an ambiguous response, automation must list/search, explicitly revoke if appropriate, and issue a replacement; it never self-heals by hidden retry.

After approval, implementation should proceed in bounded gates:

1. Contracts, role/policy kernel, actor shape, and focused pure tests
2. Approved Drizzle schema edits and stop for developer migration generation/application
3. Invitation/member repository authority and PostgreSQL evidence
4. Locale credential actor/receipt authority
5. Bearer HTTP, signed cursors, quotas, and OpenAPI artifact
6. CLI parity and secret-safe recovery behavior
7. Hosted dashboard convergence and accessibility
8. Docs/package boundaries, complete readiness, manual review, and developer acceptance

The agent must not generate/apply/edit migrations, activate OAuth, publish, deploy, commit, accept M15, or begin M16.
