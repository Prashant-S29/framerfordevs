# Milestone 14 control-plane bootstrap contracts design

**Status:** Developer-approved; implementation active under the documented gates

**Date:** 2026-08-29

## Developer-approved SDK boundary amendment — 2026-08-29

The developer approved the scoped SDK model while reviewing this proposal. Stable HTTP remains canonical and the CLI becomes the complete agent/developer automation surface, but the public application SDK is limited to content/runtime integration. Control Plane v1 therefore has no SDK client and declares `sdkSupported: false`. The previously identified unpublished M13 Authoring SDK/CLI correction is committed at `d63f215` and is now a compatibility prerequisite M14 must preserve. This amendment is approved and remains a compatibility prerequisite of the subsequently approved complete M14 design.

## Review clarifications — 2026-08-30

The developer directed the proposal to close validated review gaps under `knowledge_base/rules/decision-rules.md` before another review and explicitly approved management-credential CMS enablement in M14. This revision therefore:

- Permits an exact project/primary-environment management credential carrying `project.capability.manage` to enable CMS, with honest credential attribution added to `project_capability`; workspace/project creation, enumeration, archive, and restore remain user-only.
- Makes Studio-registration create/update conflicts explicit: receipt replay wins first; otherwise create-only against an existing row and stale positive versions return `VERSION_CONFLICT`, while update-only against an absent or foreign row returns non-enumerating `NOT_FOUND`.
- Persists a command receipt for every successful Studio-registration `PUT`, including no-ops, so command IDs cannot be reused with changed intent and ambiguous no-op responses replay deterministically without version or audit noise.
- Confirms `ffd link` is authenticated and online-only. The current unpublished offline-trusting behavior is not retained as a compatibility mode; config v2 may still be authored through its documented exact JSON contract when no network command is desired.
- Defines receipt growth as one compact row per distinct committed receipt-bearing command, with replays adding none, and requires row-count/age evidence plus approved rate budgets before M14 acceptance; retention/deletion remains M22 authority.

The committed baseline at `5f6480d` also removes pre-release dashboard schema-authoring compatibility tombstones. M14 preserves the resulting absent mutation procedures, retained read-only structure/Presentation/content/Delivery paths, and canonical Authoring v1 authority rather than recreating retired dashboard routes.

## Decision summary

Milestone 14 establishes a new portable Control Plane API v1 for the bounded workspace/project bootstrap lifecycle that currently exists only through hosted-dashboard oRPC and local CLI configuration. It keeps one domain authority while adding exact public HTTP, noninteractive CLI, and hosted-dashboard paths. Control-plane administration is intentionally excluded from the public content/runtime SDK.

The design uses:

- A new bearer-only, originless `/api/control-plane/v1` family rather than publishing dashboard oRPC or extending read-only Tooling v1
- The same platform repository/policy workflows for Better Auth session users, OAuth CLI users, and exact project-bound management credentials
- User-only workspace discovery/creation and project creation/listing/archive/restore
- Exact project read/update, CMS capability enablement, and environment-scoped Studio-registration reads/writes for eligible OAuth users or management credentials
- Persisted command receipts for create-like mutations and every Studio-registration `PUT`, plus optimistic resource versions for mutable lifecycle transitions
- Signed, short-lived, principal/scope/filter-bound public cursors rather than exposing the unsigned internal dashboard cursor format
- One optional, versioned Studio registration per project environment containing only an application origin and mount path; it grants no session, redirect, runtime, or browser credential authority
- A canonical OpenAPI 3.1 artifact, closed public-registry entry marked `sdkSupported: false`, bounded CLI command family, source-controlled docs, and compatibility baseline
- Existing dashboard project flows retained as a compatibility client of the shared authority; hosted-surface separation remains M17 and Studio runtime/session handoff remains M18

This is a bootstrap/control-plane boundary, not a general Management API. M15 owns governance automation, M16 owns credential/webhook/audit administration and broader recovery, and M18 owns the Studio SPA, BFF/adapters, session handoff, and browser runtime.

## Source hierarchy and discovery

This design follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`, especially §§6.1, 7, 11, 14, 19, and 21
3. Repository API, security, migration, Effect, observability, performance, testing, and documentation rules
4. The M14 bounded intent in `knowledge_base/milestone.md`
5. Approved M2 platform, M3 access/credential, M12 public tooling, and M13 authoring decisions
6. Current contracts, operations, repositories, policy, database schema, public registry, OAuth authority, approved SDK boundary, CLI configuration/link flow, server transport, and dashboard project UI

Discovery began from clean synchronized `main` at `2d0705a`. No feature source, manifest, generated artifact, or migration was changed during design.

The materially relevant repository guidance for stable Effect v3, Better Auth, Express, Drizzle/PostgreSQL, security hardening, TanStack, React, shadcn, Turborepo, and public package ownership was read. Stable-v3 Effect references remain available locally. Generic guidance remains subordinate to repository decisions.

## Current implementation truth and gaps

M14 extends these committed seams:

- M2 already owns workspace creation/listing, project create/list/get/update/archive, one atomic primary `main` environment, capability enablement, versions, audits, and bounded internal pagination.
- M3 already owns default-deny project policy and environment-bound management credentials. Credentials may hold `project.read`, `project.update`, and `project.capability.manage`, but no credential may create/list workspaces or projects, manage membership, or archive a project.
- M4 project creation already inserts required enabled `en` atomically.
- M12 already provides the fixed official CLI OAuth client, audience-bound access/refresh authority, secure keychain persistence, read-only Tooling v1 discovery, a closed public registry, SDK/CLI packaging, and atomic local writes.
- M13 already generalizes the OAuth verifier to route-specific grants, distinguishes OAuth users from management credentials, preserves honest credential attribution in CMS workflows, and establishes bearer-only originless Authoring v1.
- The post-M13 boundary correction committed at `d63f215` narrows public Authoring SDK methods to content/runtime use, gives excluded schema/editor calls a strict CLI-owned client, and adds exact-authority Presentation get/publish CLI workflows without changing Authoring HTTP.
- The dashboard already provides session-backed workspace/project create/list/get/update/archive and CMS enablement through oRPC. Retired pre-release dashboard schema-structure mutation procedures and their compatibility tombstones are absent from the committed `5f6480d` baseline.
- `ffd link` writes safe non-secret config v2 atomically, but currently trusts caller-supplied project/environment values and performs no online authorization, identity, archive-state, or capability check.

The gaps are:

1. Workspace/project bootstrap has no versioned portable HTTP contract, canonical OpenAPI artifact, or complete CLI command surface.
2. Tooling v1 is intentionally read-only, lists only active schema-readable projects, and cannot own control-plane mutation compatibility.
3. Existing public bearer verification has no control-plane OAuth grants.
4. Existing internal workspace/project cursors are bounded but unsigned and not bound to a public principal, route, filter, or page size.
5. Workspace and project creation have no persisted command receipt, so a response loss cannot be distinguished safely from a second create attempt; workspace names are intentionally non-unique.
6. Project restore was explicitly deferred by M2, leaving archive without a portable recovery path.
7. There is no durable project/environment Studio-registration identity or metadata for M18 to consume.
8. Current platform mutation functions assume a user actor. Exact management-credential project update, capability enablement, or Studio-registration mutation needs an honest credential actor in audits and any actor-bearing row.
9. The public-registry forbidden-surface check correctly blocks accidental raw `platform.workspaces` publication, but it has no explicit allowlisted Control Plane family.
10. The dashboard and public clients would diverge if a second repository or policy implementation were added instead of adapting principals into the existing platform authority.

## Scope

### Included

- Control Plane v1 contracts and isolated Express transport
- Workspace create/list/get
- Project create/list/get/update/archive/restore
- Initial CMS capability selection during user-authored project creation, capability inspection, and policy/scope-authorized CMS enablement
- Online project/environment verification for `ffd link`
- One versioned Studio-registration resource per project/environment with read and create/update behavior
- Better Auth session-to-user, OAuth-user-to-user, and exact management-credential principal adapters
- New narrow OAuth grants for control-plane read, write, and project lifecycle operations
- Persisted create-like and Studio-registration command receipts, canonical fingerprints, replay/conflict semantics, optimistic versions, audits, and failure injection
- Signed keyset pagination for public workspace/project lists
- Canonical OpenAPI/public-registry artifact, CLI commands, docs, and package/contract evidence
- Preservation of the implemented content/runtime-only SDK boundary, without adding a Control Plane SDK
- Dashboard restore, initial capability, and Studio-registration controls over the same domain operations
- Complete security, tenant-isolation, concurrency, contract, package, accessibility, load, and migration-gate evidence

### Deferred and excluded

- Workspace rename, ownership transfer, removal, archive, or deletion
- Memberships, invitations, role/policy administration, locale administration, or custom governance; M15 owns these
- Credential issue/list/rotate/revoke, webhook administration, audit browsing, permanent deletion, or broad operator recovery; M16 owns these
- Hosted-domain separation, cookie-domain changes, cross-host routing, or migration of the dashboard from oRPC; M17 owns these
- Studio SPA assets, BFF/adapters, browser session handoff, sign-in redirects, runtime discovery document, or content routes; M18 owns these
- Additional user-visible environments or promotion; M24 owns these
- Capability disablement, collection/content/schema behavior changes, billing, assets, workflows, visual resources, hosting, deployment, or external providers
- Dynamic OAuth clients, third-party OAuth applications, client credentials, or broad account tokens
- Public package publication/version changes, production OAuth rollout, production configuration, deployment, or migration generation/application

## Core invariants

1. Workspace, project, environment, capability, and Studio-registration IDs are server-generated stable identities; names, keys, origins, and paths are mutable metadata, not identity.
2. The existing platform/policy repository remains the sole business authority. Public HTTP, CLI, and dashboard adapters cannot reimplement authorization, transitions, audit behavior, or persistence.
3. Tooling v1 stays originless and read-only; Authoring v1, Delivery v1, Preview v1, webhook v1, and existing dashboard oRPC remain compatibility-stable.
4. Public Control Plane v1 is bearer-only, originless, redirect-free, cookie-independent, `no-store`, and rejects browser `Origin` and preflight requests.
5. OAuth scope is necessary but never sufficient. Current workspace membership, project role, archive state, capability state, and exact tenant/environment policy are rechecked on every request.
6. Management credentials remain exact project/environment actors. They cannot enumerate workspaces/projects, create workspace/project resources, archive/restore projects, or become user sessions. An exact primary-environment credential may enable CMS only with `project.capability.manage` and honest credential attribution.
7. Every mutation is either receipt-idempotent or guarded by an exact optimistic resource version. Replays never duplicate state/audits, and stale writers never silently win.
8. Project keys remain immutable and reserved across archive/restore. Archive deletes or disables no child resource; restore reactivates access to preserved state.
9. Studio registration is metadata only. It creates no browser authority, redirect, cookie, token, secret, adapter, BFF route, or proof that a Studio deployment exists.
10. Browser Studio code never receives OAuth refresh, management, or hosted bearer authority. M14 does not weaken M13 local-editor token isolation.
11. Public inputs reject excess properties and are bounded by bytes, counts, depth, canonical URL/path rules, and explicit query/method/content-type allowlists.
12. Responses retain `{ ok, data, error, message }`; protocol-owned Better Auth endpoints remain native.
13. Audits identify the real user or credential actor and contain no names, descriptions, origins, mount paths, bearer values, credential metadata, or request bodies.
14. No application package imports app source; new public exports are additive and internal code uses direct owner-directory imports rather than convenience barrels.
15. The developer controls schema migration generation/application, public package publication, production OAuth/configuration, deployment, commit, and milestone acceptance.

## Control Plane API v1

### Family and transport boundary

The new family is:

```text
/api/control-plane/v1
```

It is not named `management` because M14 does not publish the complete hosted management surface, and it does not extend Tooling because Tooling v1's released meaning is read-only schema discovery.

The transport rules are:

- Require one `Authorization: Bearer <token>` value on every data request.
- Accept only the fixed official CLI OAuth access token or an exact `ffd_mgmt_…` management credential where the operation matrix permits it.
- Reject Delivery/Preview credentials generically and apply the existing invalid-attempt limiter.
- Reject any browser `Origin`, CORS preflight, duplicate authorization, credential query parameter, redirect behavior, unsupported method/content type, duplicate/unknown query key, or excess body field.
- Use JSON request bodies only for mutations; GET has no body.
- Set `Cache-Control: no-store` on every data success and failure. The canonical OpenAPI/docs routes remain public, read-only, and separately cacheable.
- Return request ID and weighted rate-limit headers through the existing centralized boundary.
- Enforce early `Content-Length` and streamed-body bounds before JSON decode.

The public HTTP boundary does not authenticate Better Auth cookies. The current hosted dashboard continues to authenticate its Better Auth session through protected oRPC, then calls the same domain operations with the same user actor. M17 may move hosted clients onto another transport adapter after its host/session/CORS design; M14 does not pre-authorize that browser boundary.

### Resource routes

The exact initial routes are:

```text
GET    /workspaces
POST   /workspaces
GET    /workspaces/{workspaceId}
GET    /workspaces/{workspaceId}/projects
POST   /workspaces/{workspaceId}/projects
GET    /projects/{projectId}
PATCH  /projects/{projectId}
POST   /projects/{projectId}/archive
POST   /projects/{projectId}/restore
GET    /projects/{projectId}/capabilities
PUT    /projects/{projectId}/capabilities/cms
GET    /projects/{projectId}/environments/{environmentId}/studio-registration
PUT    /projects/{projectId}/environments/{environmentId}/studio-registration
```

No generic arbitrary-resource endpoint, bulk command endpoint, permanent delete, workspace mutation, environment mutation, or capability disable route is added.

### Workspace contracts

Workspace summaries contain only:

- Stable workspace ID
- Name
- Version
- Effective workspace role (`owner | collaborator`)
- Created/updated timestamps

`GET /workspaces` uses bounded keyset pagination. `GET /workspaces/{workspaceId}` requires an active workspace membership and does not return members, invitations, projects, counts, billing, audit, or creator identity.

`POST /workspaces` accepts exactly:

```json
{
  "commandId": "uuid",
  "name": "Workspace name"
}
```

The authenticated OAuth user becomes owner. A command receipt, workspace, owner membership, and existing audits commit atomically. The response returns `{ workspace, replayed }`. Workspace creation is unavailable to management credentials.

### Project contracts

Project summary/detail includes:

- Stable project/workspace IDs
- Immutable project key
- Name and nullable description
- Positive project version
- `active | archived` status and nullable archive timestamp
- Stable primary `main` environment identity
- Complete known capability summaries, initially `cms`
- A bounded effective access projection for the M14 operations, without member lists, user email, credential identity, or policy internals

`GET /workspaces/{workspaceId}/projects` accepts `status`, `limit`, and `cursor`. Workspace owners see every project in that workspace; collaborators see only active relationships already permitted by M3. Active and archived pages stay separate.

`POST /workspaces/{workspaceId}/projects` accepts:

```json
{
  "commandId": "uuid",
  "name": "Project name",
  "key": "project-key",
  "description": null,
  "initialCapabilities": ["cms"]
}
```

`initialCapabilities` is a unique bounded list over the closed capability registry and may be empty. Creation atomically confirms workspace-owner authority, inserts the project, explicit owner membership, primary `main` environment, required enabled `en`, optional CMS capability, command receipt, and all existing audits. It returns `{ project, replayed }`. It does not create schemas, entries, credentials, webhooks, or Studio registration.

`PATCH /projects/{projectId}` accepts exact `expectedVersion`, `name`, and nullable `description`. It preserves M2 no-op suppression. OAuth/session users require `project.update`. An exact management credential may update project metadata only when it is bound to that project's primary environment and has `project.update`; the audit actor is the credential, never the issuer. The stable key, workspace, environment, and capability state are absent from this request.

### Archive and restore

Archive and restore remain user-only owner operations. Management credentials are denied even if they carry other project scopes.

Both bodies contain only `expectedVersion`. Archive preserves all environments, locales, memberships, credentials, schemas, drafts, publications, events, webhooks, receipts, and Studio registration. Existing downstream APIs continue to deny archived projects according to their approved contracts.

Restore:

1. Reauthorizes the current user as a project owner.
2. Locks/rechecks the project and exact expected version.
3. Requires the project to be archived.
4. Clears the archive actor/time, increments version, updates time, and writes `project.restored` atomically.
5. Returns the current project detail.

Restore does not rotate credentials, republish content, redeliver events, change capabilities, or manufacture missed webhook attempts. Preserved active configuration becomes reachable again under each subsystem's existing checks. Repeated archive/restore and stale versions return deterministic conflicts.

M14 adds `project.restore` to the user action registry and grants it only to the owner preset. It is not added to management credential scopes.

### Capability inspection and enablement

`GET /projects/{projectId}/capabilities` returns every known capability with stable ID when materialized, key, status, version, and change timestamp. Absence projects as disabled, preserving the current M2 representation.

`PUT /projects/{projectId}/capabilities/cms` accepts only `commandId`. It supports only the existing `absent -> enabled` transition, requires an active project and `project.capability.manage`, and returns `{ capability, replayed }`. Receipt replay is evaluated first; the exact committed enable command replays, while a new command against an already-enabled capability returns `INVALID_STATE_TRANSITION` and persists no receipt. Session/OAuth users use current project policy. An exact management credential may enable CMS only when it is bound to that project’s primary environment and carries `project.capability.manage`; the capability row and audit identify the credential, never its issuer.

M14 normalizes `project_capability` change attribution to exactly one user or credential actor rather than leaving the already-issued management scope without a canonical operation or recording misleading user attribution. This does not let credentials create/list projects, enable arbitrary capability keys, disable capabilities, or mutate a foreign/non-primary environment. Capability disablement remains deferred.

### Studio registration

M14 creates at most one registration per exact project/environment. The resource contains:

```ts
type StudioRegistration = {
  id: StudioRegistrationId;
  projectId: ProjectId;
  environmentId: EnvironmentId;
  applicationOrigin: string;
  mountPath: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
```

It deliberately excludes tokens, secrets, callback/session endpoints, framework type, adapter configuration, auth mode, content routes, deployment status, health, custom headers, and arbitrary metadata.

Origin rules match the repository's portable endpoint profile:

- HTTPS origin with no username/password, path beyond `/`, query, or fragment
- Explicit loopback HTTP only for `localhost`, `127.0.0.1`, or `[::1]`
- Canonical origin serialization, maximum 2,048 bytes
- No wildcard host or caller-supplied redirect target

Mount paths are canonical absolute application paths, 1–240 UTF-8 bytes, begin with `/`, contain no query/fragment/backslash/control character, empty or dot segments, duplicate separators, or percent-encoded ambiguity, and have no trailing slash except the root form. M14 requires a non-root configured path, such as `/studio`.

`GET` requires `project.read`, validates exact project/environment membership, and returns generic `NOT_FOUND` for absent/foreign registrations.

`PUT` accepts:

```json
{
  "commandId": "uuid",
  "expectedVersion": null,
  "applicationOrigin": "https://app.example.com",
  "mountPath": "/studio"
}
```

- `expectedVersion: null` means create only.
- A positive expected version means update only.
- Same desired values under the exact current version are a no-op with no version increment or audit, but the successful command still persists its immutable receipt.
- Receipt lookup/replay occurs before evaluating current create/update state. An exact committed command replays even when its original `expectedVersion: null` now observes the created row.
- For a new command, create-only against an existing registration returns `VERSION_CONFLICT`; update-only against an absent or foreign registration returns `NOT_FOUND`; a mismatched positive current version returns `VERSION_CONFLICT`.
- Create/update is receipt-idempotent and optimistic, with `{ registration, created, replayed, noOp }` output.
- User actors require `project.update`.
- Management credentials require `project.update` and exact matching project/environment authority.
- Archived projects allow registration reads for recovery inspection but reject writes.

The server does not fetch the origin, redirect to it, probe it, set CORS from it, or treat it as trusted browser authority in M14. M18 must re-evaluate registered metadata before using it for any session or navigation behavior.

## Principal and authorization model

### OAuth grants

The fixed official CLI client/resource adds:

- `control-plane:read`
- `control-plane:write`
- `control-plane:project:lifecycle`

Read is required by all GET routes and online link verification. Write is required for workspace/project create, project update, capability enable, and Studio-registration create/update. Lifecycle is required for archive and restore.

The existing CLI login requests these grants in addition to the approved Tooling/Authoring grants and shows them at consent. Existing refresh tokens cannot gain the new scopes; commands receiving a scope denial return a stable re-login diagnostic. Refresh rotation, fixed client/resource, disabled dynamic registration, and production rollout gates remain unchanged.

OAuth scope never grants tenant authority by itself. The user ID in the verified official-client token is converted to the same branded application user actor used by the dashboard, and current membership/policy is evaluated at the repository boundary.

### Session users

Protected dashboard oRPC remains Better Auth session-only. Session identity is adapted to the same user actor and invokes the same operations/repository. It does not call the public bearer transport or receive OAuth tokens.

Existing oRPC names and response contracts remain stable. Dashboard project creation supplies its explicit initial-capability selection, and old callers that omit it retain the current no-capability behavior through an internal compatibility adapter rather than a public contract ambiguity.

### Management credentials

The exact operation matrix is:

| Operation                            | Management credential authority                                       |
| ------------------------------------ | --------------------------------------------------------------------- |
| Workspace create/list/get            | Denied                                                                |
| Project create/list                  | Denied; no enumeration                                                |
| Exact project get/capability inspect | `project.read`, matching project; no scope widening                   |
| Project update                       | `project.update`, matching project and primary environment            |
| Project archive/restore              | Denied                                                                |
| Capability enable                    | `project.capability.manage`, matching project and primary environment |
| Studio registration get              | `project.read`, matching project/environment                          |
| Studio registration put              | `project.update`, matching project/environment                        |

Delivery and Preview credentials fail generically. Revoked, expired, rotated, wrong-family, wrong-scope, foreign-project, and foreign-environment credentials cannot fall back to OAuth/session behavior.

### Actor attribution

The shared control-plane actor is:

```ts
type ControlPlaneActor =
  | { kind: "user"; id: AuthUserId }
  | { kind: "credential"; id: ApiCredentialId };
```

Workspace/project creation and lifecycle operations narrow to the user branch before persistence. Project update audits, capability-change actor columns, and Studio-registration actor columns support either branch. Credential actors are never attributed to `createdByUserId`, `archivedByUserId`, or the credential issuer.

Responses do not expose actor identity. Audit rows retain existing bounded actor type/ID and resource scope.

## Idempotency, concurrency, and receipts

### Command receipt

M14 adds one bounded control-plane command receipt authority for create-like mutations:

- Command ID UUID primary key
- Operation literal
- Actor type/ID snapshot
- Canonical request fingerprint SHA-256
- Workspace ID and optional project/environment scope
- Result resource type and stable result ID
- Closed result disposition (`created | updated | no_op`) needed to reproduce Studio-registration replay flags without storing response JSON
- Created timestamp

No request body, name, description, URL, path, secret, token, response JSON, or arbitrary metadata is stored. Receipts are immutable and have no M14 deletion path; retention is explicitly deferred to M22. Growth is exactly one compact row per distinct committed workspace create, project create, capability enable, or Studio-registration `PUT` command, including successful registration no-ops; exact replays add no row. M14 records row count, age distribution, write rate, and bytes-per-row evidence so M22 receives measured authority rather than a fabricated forecast.

The fingerprint includes operation, actual actor kind/ID, canonical tenant scope, and exact normalized input. A command ID with the same operation/actor/fingerprint replays; any mismatch returns `COMMAND_CONFLICT`. A replay reauthorizes current access before loading the current result and creates no second audit. The stored result disposition reproduces the original `created`/`noOp` flags while `replayed` becomes true; it does not preserve mutable response JSON. Loss of current authority returns the same non-enumerating denial as an ordinary read.

Workspace/project/capability/Studio-registration state changes write state, audit, and receipt in one transaction. A successful Studio-registration no-op writes only its receipt in the same locked transaction, reserving the command ID without version or audit noise. Failure injection proves no state-changing receipt survives without its state/audit, no state survives without its receipt/audit, and no no-op receipt is reported before it commits.

### Optimistic operations

Project update/archive/restore require the exact project version. Studio registration update requires the exact registration version. Conditional updates increment once; stale requests return `VERSION_CONFLICT`. No force flag, wildcard version, last-write-wins retry, or server-selected merge is provided.

No-op project updates return success without a version increment or audit and have no command receipt because project update is version-only. Every successful Studio-registration `PUT`, including a no-op, commits or replays a receipt; no-op registration commands still avoid version increments and audits.

### Locking

- Project create relies on workspace-owner reauthorization, command lock/receipt serialization, and the existing `(workspace_id, key)` uniqueness.
- Project update/archive/restore lock or conditionally update the exact project under workspace scope.
- Capability enable serializes on the project and existing unique capability key.
- Studio registration serializes on the project/environment and singleton unique key.
- Locks are acquired in stable project-before-child order.

## Public pagination

Control Plane v1 does not expose the internal unsigned dashboard cursor bytes. It adds a signer with a 15-minute lifetime and active/previous key rotation support.

Cursor authority binds:

- Family/major and route
- Principal kind and opaque stable principal key
- Workspace ID where relevant
- Active/archived filter
- Page limit
- Final sort timestamp and stable tie-breaker ID
- Issued/expiry times

Tampered, expired, repeated, wrong-principal, wrong-workspace, wrong-filter, wrong-limit, and wrong-route cursors return `CONTROL_PLANE_CURSOR_INVALID`. Pages fetch `limit + 1`, return at most 50 items, and never return total counts. CLI page iterators enforce a fixed maximum page count and repeated-cursor detection.

The existing dashboard cursor contract and oRPC behavior remain unchanged.

## Errors and HTTP semantics

The closed public error union includes:

- `VALIDATION_ERROR`
- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `PROJECT_KEY_CONFLICT`
- `VERSION_CONFLICT`
- `INVALID_STATE_TRANSITION`
- `COMMAND_CONFLICT`
- `CMS_CAPABILITY_REQUIRED`
- `CONTROL_PLANE_CURSOR_INVALID`
- `CONTROL_PLANE_REQUEST_TOO_LARGE`
- `CONTROL_PLANE_RESPONSE_TOO_LARGE`
- `CREDENTIAL_INVALID`
- `RATE_LIMITED`
- `SERVICE_UNAVAILABLE`
- `INTERNAL_ERROR`

Foreign and nonexistent tenants are non-enumerating. A known member who lacks an action may receive `FORBIDDEN` under the existing M3 rule. Credential failures remain generic. Validation details are bounded and contain paths/codes/safe messages only; names, descriptions, origins, mount paths, tokens, credential metadata, and database causes never appear in errors.

Successful create/put responses use 200 with the application envelope to keep replay/no-op responses representation-identical. HTTP failures retain standard non-200 statuses. There are no redirects or empty/null success bodies.

## Request, response, and rate bounds

Initial public bounds are:

- Query string: 4 KiB
- JSON request body: 64 KiB
- Response: 512 KiB
- Page size: default 20, maximum 50
- Cursor: 2,048 input bytes and 512 canonical output bytes
- Error details: maximum 50
- Initial capability list: maximum 8, unique, closed known keys
- Studio application origin: 2,048 bytes
- Studio mount path: 240 UTF-8 bytes
- CLI HTTP timeout default: 15 seconds
- CLI page iteration: maximum 10,000 pages with repeated-cursor rejection

Global and principal rate policies are separate from Tooling/Authoring. Costs are bounded by operation class: reads/list pages, create/update, lifecycle, and Studio writes. Identities are opaque digests and metrics use only closed operation/principal/outcome/status/cost buckets.

The developer approved the initial implementation budgets after reviewing deterministic PostgreSQL evidence: 23 repository scenarios completed in 701 ms, while eight committed receipt rows occupied 2,184 bytes total, had a maximum row size of 288 bytes, and spanned 390 ms under replay/contention coverage. Control Plane uses independent 60-second token buckets: global refill 3,000 with capacity 250, OAuth-user refill 120 with capacity 20, and management-credential refill 120 with capacity 20. Weighted costs are read/list 1, create 5, project update 3, lifecycle 5, and Studio write 5. These are protective initial limits rather than a production throughput SLA; future changes require measured evidence and explicit authority.

## SDK exclusion and pre-publication correction

Control Plane v1 has no `@framerfordevs/sdk/control-plane` export. Its public-registry entry is canonical and documented but explicitly sets `sdkSupported: false`. Developers and agents use the CLI; hosted clients use their approved transport adapter over the same server authority.

The approved pre-publication SDK boundary from `public-http-cli-and-sdk-surface-boundary.md` is committed at `d63f215`. M14 must preserve it:

- Delivery, Preview, exact-locale content operations, read-only generated-form/Presentation metadata, webhook verification, invalidation, and generated contract helpers remain public.
- Schema export/plan/apply and Presentation publish methods/DTOs remain absent from public `./authoring`.
- Complete schema and Presentation workflows remain in Authoring HTTP, CLI, dashboard/Studio, and CLI-owned internal clients.
- Package exports, browser/server graphs, docs, and clean fixtures must continue to contain no control-plane, governance, secret-administration, recovery, schema-push, or Presentation-mutation SDK methods.

Existing root, `./client`, `./effect`, `./authoring`, `./webhooks`, and `./invalidation` export paths remain compatibility boundaries; M14 adds no SDK export.

## CLI and link behavior

The initial exact commands are:

```text
ffd workspace list --api <origin> [--limit <n>] [--cursor <cursor>]
ffd workspace get --api <origin> --workspace <id>
ffd workspace create --api <origin> --name <name> [--command-id <uuid>]
ffd project list --api <origin> --workspace <id> [--status active|archived] [--limit <n>] [--cursor <cursor>]
ffd project get --api <origin> --project <id>
ffd project create --api <origin> --workspace <id> --name <name> --key <key> [--description <text>] [--enable-cms] [--command-id <uuid>]
ffd project update --api <origin> --project <id> --expected-version <n> --name <name> [--description <text>|--clear-description]
ffd project archive --api <origin> --project <id> --expected-version <n> --confirm-key <key>
ffd project restore --api <origin> --project <id> --expected-version <n>
ffd project capabilities --api <origin> --project <id>
ffd project capability enable --api <origin> --project <id> --capability cms [--command-id <uuid>]
ffd studio registration get --api <origin> --project <id> --environment-id <id>
ffd studio registration set --api <origin> --project <id> --environment-id <id> --origin <origin> --path <path> [--expected-version <n>] [--command-id <uuid>]
ffd link --api <origin> --project <id> --environment <key> [--output <path>] [--schema <path>]
```

Rules:

- Every Control Plane command requires an explicit `--api <origin>`; no remembered host or environment fallback supplies tenant authority.
- `--json` remains stable stdout-only machine output; diagnostics and failures go only to stderr.
- Create-like commands accept a caller command ID or create one before network access and persist only ID/fingerprint in the existing bounded retry journal. No token or body is journaled.
- Mutation helpers perform no hidden retry after an ambiguous response; replay uses the same journaled command ID.
- Archive requires exact project-key confirmation and expected version. There is no broad `--yes` or force lifecycle option.
- List commands return one bounded page and its cursor. They do not silently enumerate an unbounded account.
- Management credentials may be supplied only through the existing `FFD_MANAGEMENT_TOKEN` process environment and are never stored or printed.
- OAuth tokens remain in the OS keychain. Scope denial returns a stable re-login diagnostic rather than attempting a management fallback.
- Exit code 0 means accepted success/replay/no-op; ordinary typed failure remains 1; existing schema-check drift exit 2 remains unchanged.

`ffd link` keeps config v2 and its existing required flags/output keys for compatibility. It is an authenticated online verification command with no offline, pre-authentication, or trust-caller mode. Before writing, it authenticates, gets the exact project, resolves the named environment from the returned stable environment authority, requires an active project and enabled CMS capability, and then writes atomically. It returns additive workspace/project/environment IDs and capability status but no bearer data. It never creates, enables, restores, or registers anything implicitly.

Keeping config v2 avoids forcing all M13 schema/editor commands through a config migration before M24 designs multiple user-visible environments. The stable project ID plus immutable current `main` key remain authoritative; the online link response supplies the environment ID for callers that need it. Because the CLI remains unpublished at `0.0.0`, replacing offline trust is a pre-publication correctness/security correction rather than a released compatibility break. A caller that deliberately needs no network command may author the documented exact non-secret JSON contract directly, but `ffd link` never writes unverified authority.

## Hosted dashboard behavior

M14 does not move the dashboard to the public bearer transport. It keeps protected oRPC as the browser transport and adapts these screens to the shared domain operations:

- Existing workspace/project create/list/get/update/archive behavior remains available.
- Project create can explicitly choose whether CMS is enabled atomically; existing default remains disabled unless selected.
- Archived project detail gains owner-only restore with version confirmation and clear consequences.
- Project detail shows complete capability inspection and existing CMS enable behavior.
- Project/environment settings gain Studio-registration get/create/update fields with explicit text that registration is metadata only until Studio runtime support exists.
- Permission-denied, archived, absent-registration, conflict, pending, replay/no-op, and dependency-failure states remain accessible and recoverable.

No content/editorial route is removed or moved. No host/domain, cookie, navigation hierarchy, generated route convention, or public marketing/docs surface is changed beyond additive Control Plane docs/reference links.

## Public contracts and compatibility

`packages/public-contracts` adds only:

```text
control-plane/v1 -> OpenAPI 3.1
```

The registry gains the `control-plane` family, canonical artifact path, portal route, `sdkSupported: false`, baseline path/digest, and null deprecation/sunset metadata. Artifact generation remains explicit and does not scan routers or publish internal contracts.

The existing blanket probe for raw `platform.workspaces` remains effective against accidental oRPC publication while tests explicitly allow only the new `/api/control-plane/v1` resource vocabulary. The public document must exclude:

- oRPC paths/procedure names
- Better Auth protocol schemas and cookies
- Membership/invitation/policy mutation
- Credential/webhook/audit/operator/billing resources
- Raw database rows, actor pointers, command fingerprints, and internal cursor payloads
- Studio sessions/BFF/adapters/content routes
- Tooling/Authoring bodies or management-only schema/content contracts

Delivery, Preview, Tooling, Authoring, and webhook baseline bytes/digests must remain unchanged. Existing server routes and package exports remain compatible. Any necessary change to shared API error registries is additive and covered by prior-family regression snapshots.

The developer portal adds one task guide for login → workspace/project create or existing-project link → CMS capability → schema workflow, plus a secondary Control Plane reference generated from the canonical artifact. Documentation contains no executable browser console for bearer operations and no management credential.

## Database impact and migration gate

M14 requires a developer-controlled migration. Proposed name:

```text
add_control_plane_bootstrap_authorities
```

Expected additions:

### Control-plane command receipts

- UUID command ID primary key
- Closed operation, actor type/ID, SHA-256 fingerprint
- Workspace ID, nullable project/environment IDs with composite tenant foreign keys
- Result resource type/ID, closed `created | updated | no_op` disposition, and created timestamp
- Checks and indexes for actor/operation lookup and tenant result recovery

### Studio registration

- Stable UUID ID
- Workspace/project/environment composite tenant scope
- One row per environment
- Canonical application origin and mount path
- Positive optimistic version and timestamps
- Exactly-one user-or-credential creator and changer references
- Composite management-credential foreign keys and supporting indexes
- URL/path/check constraints matching application validation where PostgreSQL can enforce them safely

### Project capability actor authority

- Make `changed_by_user_id` nullable and add nullable `changed_by_credential_id` plus `changed_by_credential_environment_id`
- Require either one user changer or the complete credential-ID/environment pair, never both or a partial credential actor
- Add the exact `(credential, workspace, project, environment)` management-credential foreign key and supporting indexes; application policy additionally proves that the recorded credential environment is the project’s current primary environment
- Preserve existing user-authored capability rows and the singleton `(project_id, key)` capability authority

### Project restore authority

No new project column is required. Existing nullable archive actor/time and version support restore. The schema/checks remain unchanged; implementation adds operation/policy/audit behavior only.

### Project update audit actor

No new project actor pointer is required because updates currently record actor only in immutable audit events. Shared audit construction is generalized to user or credential without changing the audit table.

Implementation first edits the approved Drizzle schema and targeted schema tests, then stops. The developer generates the migration. The agent fully inspects generated SQL, snapshot, and journal without applying or editing them. Any correction follows the ignored-draft rule. Only after developer application and read-only verification may database integration continue.

No existing migration or snapshot is modified.

## Effect, package, and workspace ownership

Planned ownership is:

```text
packages/api/src/contracts/control-plane/          public schemas and OpenAPI source
packages/api/src/operations/control-plane/public/  principal-aware public workflows
packages/api/src/services/control-plane/           bearer auth, cursors, receipts/registration adapters
packages/api/src/services/platform/                shared platform repository authority
packages/db/src/schema/                             Drizzle authority only
packages/public-contracts/                         registry, artifact, baseline
packages/sdk/src/authoring/                         content/runtime-only public client
packages/cli/src/authoring/                         CLI-owned excluded Authoring operator transport
packages/cli/src/presentation/                      exact-authority Presentation CLI workflow
packages/cli/src/control-plane/                     commands/client adapters
apps/server                                         isolated Express Control Plane router
apps/web                                            session-backed dashboard client
apps/developers                                     source-controlled guide/reference
```

The existing `PlatformRepository` may move physically into its owner directory, but supported package exports and every consumer import must remain stable or be updated directly without adding a broad barrel. No package imports application source.

Business workflows remain named `Effect.fn` values with typed expected errors and replaceable services/Layers. Drizzle remains Promise-native inside repositories. One shared `ManagedRuntime` remains at each server/CLI boundary. Public SDK code remains a separate content/runtime package boundary and does not import control-plane services.

## Security and threat model

| Threat                                         | Control                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Publish dashboard internals accidentally       | Closed `control-plane/v1` registry source and forbidden-surface tests                             |
| OAuth token grants tenant authority by itself  | Current membership/role/policy recheck at repository boundary                                     |
| Management credential enumerates account       | No workspace/project list/create routes for credentials; exact project/environment match          |
| Credential impersonates issuer                 | Explicit credential actor, transactional audit, exactly-one capability/registration actor columns |
| Browser steals/uses CLI bearer                 | Origin/preflight rejection, no CORS, cookie independence, no Control Plane SDK export             |
| Cross-tenant ID substitution                   | Authorization before sensitive loads, composite scope predicates/FKs, non-enumeration             |
| Duplicate create after timeout                 | Persisted command receipt and canonical fingerprint in same transaction                           |
| Command ID reused with changed intent          | Actor/operation/scope/input-bound fingerprint and `COMMAND_CONFLICT`                              |
| Cursor tampering/reuse                         | HMAC, expiry, rotation, principal/route/scope/filter/limit binding                                |
| Archive causes data loss                       | Soft archive only, no cascade, explicit restore/version authority                                 |
| Lifecycle credential abuse                     | Archive/restore remain user-owner only and have a separate OAuth grant                            |
| Malicious Studio origin/path                   | Closed canonical schemas, no fetch/redirect/trust/runtime consumption in M14                      |
| Studio registration becomes browser credential | Metadata contains no secret/session/token and creates no browser route                            |
| Secret/PII leak through outputs                | Closed projections; no token/email/credential metadata/actor/body in responses or telemetry       |
| Unbounded account/list abuse                   | Keyset pages, no totals, byte bounds, weighted global/principal quotas                            |
| Partial mutation/audit/receipt                 | One transaction and failure injection at every persistence stage                                  |

Dependency additions are not expected. If implementation evidence requires one, package provenance/license/audit and developer approval occur before adoption.

## Observability and performance

Named operations/spans cover:

- Control-plane bearer parse/authenticate
- OAuth scope and management-scope verification
- Workspace create/list/get
- Project create/list/get/update/archive/restore
- Capability inspect/enable
- Studio registration get/put
- Command receipt lookup/replay/conflict
- Cursor sign/verify
- CLI online link verification and atomic config commit

Safe attributes include operation, actor kind, stable workspace/project/environment/resource IDs where current rules allow them, archive/capability/status booleans, page/count/size buckets, replay/no-op booleans, outcome, and duration. They exclude names, keys where unnecessary, descriptions, origins, paths, OAuth scopes as free text, emails, tokens, credential IDs/prefixes/names, request bodies, fingerprints, cursor bytes, and local filesystem paths.

Metrics use closed operation/principal/outcome/status/cost/size/page buckets only. Tenant, user, project, workspace, environment, command, origin, path, and request IDs are not metric labels.

Performance evidence includes:

- Representative indexed workspace and active/archived project pages
- Receipt lookup/replay and project-key contention
- Concurrent archive/restore/update behavior
- Concurrent singleton Studio registration creation/update
- Bounded HTTP memory/response behavior
- CLI page and timeout behavior
- Dashboard route/bundle delta and no duplicate React/UI copies

No current Delivery/Preview/Authoring/worker load budget is weakened.

## Test and evidence plan

### Pure/property/contract

- Every workspace/project/registration input normalization and byte boundary
- Origin canonicalization, loopback exception, credential/query/fragment/path rejection
- Mount-path root/dot/double/trailing/encoded/control/backslash and length cases
- Actor union and exact operation authorization matrix
- Canonical command fingerprints under key-order changes and actor/scope/operation differences
- Registration create-only/update-only/current-version transition matrix and closed receipt result dispositions
- Signed cursor round-trip, tamper, expiry, previous-key rotation, principal/route/workspace/status/limit mismatch
- Control Plane OpenAPI complete canonical bytes, operation IDs, security per route, and public exclusions
- Existing five public artifact bytes/digests unchanged

### Effect services

- Replaceable principal authenticator, policy, repository, cursor signer, clock, ID generator, rate limiter, logger, telemetry, and CLI filesystem/keychain Layers
- Expected errors versus defects/interruption
- No repository work after malformed input, missing grant, foreign credential scope, or denied role
- No secret/body/origin/path enters logs, traces, metrics, or audits
- Shared long-lived runtime boundaries only

### PostgreSQL integration

- Atomic workspace/project/capability/registration state + receipt + audit
- Registration no-op receipt commit/replay with no version/audit mutation, preserved result disposition, and changed-fingerprint conflict
- Registration create-only existing, update-only absent, stale-version, and concurrent-create outcomes
- Same-command exact replay, changed-fingerprint conflict, and new-command capability re-enable `INVALID_STATE_TRANSITION` without an orphan receipt
- Response-loss simulation and replay recovery
- Concurrent same workspace/project key/command ID and singleton registration races
- Project update/archive/restore exact version and no-op behavior
- Archive preserves all child rows and restore recovers reachability without rewriting them
- Credential-authored project update/capability enable/registration has exact actor audit/FKs and no issuer attribution
- Cross-workspace/project/environment/credential isolation and composite FK rejection
- Failure injection after every state/audit/receipt stage leaves no partial authority
- Representative `EXPLAIN` assertions for lists, receipts, registration, and credential scope

### HTTP/security

- Every path, method, content type, query, body, response envelope, status, request ID, no-store, and rate header
- Studio receipt replay before state conflict, create-only existing `VERSION_CONFLICT`, update-only absent `NOT_FOUND`, and stale positive `VERSION_CONFLICT`
- OAuth read/write/lifecycle grant matrix plus current role matrix
- Management credential matrix, primary-environment project update/capability rule, exact Studio environment, and family denial
- Foreign/nonexistent non-enumeration and known-member forbidden behavior
- Revoked/expired/rotated credential and OAuth membership/scope changes
- Browser Origin/preflight, cookies-without-bearer, duplicate auth/query, token-in-query, redirects, traversal, malformed/oversized/chunked JSON, and extra-field rejection
- Canonical Control Plane OpenAPI bytes served by the production server image

### CLI/package

- Exact CLI HTTP decode behavior for every route method/body/path
- Timeout/abort, oversized/malformed response, no hidden retry, and rate/request header projection
- Pagination empty/final/repeated/max-page/cursor pass-through behavior
- Stable CLI arguments, JSON/stdout/stderr, error codes, and existing exit-code compatibility
- Command journal replay without body/token persistence
- Archive exact-key confirmation and no broad force bypass
- OAuth and `FFD_MANAGEMENT_TOKEN` allowed/denied command matrix
- Online link rejects foreign/archived/CMS-disabled/wrong-environment authority before local write
- Link atomic failure preserves prior config; output contains no credential
- Packed CLI clean Node >=22 fixture plus SDK export/tarball/browser-graph tests proving the scoped content/runtime boundary

### Dashboard/accessibility

- Existing workspace/project create/list/get/update/archive regressions
- Initial CMS selection, restore, capability inspection, and registration create/update
- Permission filtering/direct-route denial, archived/read-only states, conflicts, no-op/replay, loading/error recovery
- Labels/descriptions/errors, focus, announcements, keyboard dialogs/forms, non-color state, responsive behavior, and automated axe coverage
- Generated route conventions and production bundle budgets remain intact

### Full validation

Run task-appropriate formatting, lint, structure, contracts, types, unit, integration, HTTP, accessibility, coverage, audits, package, build, Docker, database-invariant, performance, and `git diff --check` gates. Stop the independent worker before shared-database integration/coverage and restore/verify it afterward. Final `pnpm run ready` and recorded counts are required before manual milestone review.

## Manual review

The developer should verify at least:

1. Log in through the official CLI, create a workspace and CMS-enabled project, inspect stable IDs/capabilities, link a clean repository, and continue into the existing schema export/plan workflow.
2. Confirm CLI-created resources appear correctly in the current dashboard and dashboard mutations appear through Control Plane HTTP/CLI without duplicate authority.
3. Simulate a lost create response and replay the same command ID; confirm one resource, one mutation audit set, and `replayed: true`. Reuse the ID with changed input and observe `COMMAND_CONFLICT`.
4. Use two tenants and restricted roles to confirm workspace/project lists, direct IDs, lifecycle, capability, and Studio registration cannot enumerate or cross scope.
5. Archive a real test project, confirm Tooling/Authoring/Delivery/Preview reject it under existing contracts, restore it, and confirm preserved configuration/content becomes reachable without republishing or identity change.
6. Register and update one Studio origin/path from dashboard and CLI, inspect exact metadata, and confirm no network probe, redirect, browser route, token, cookie, or secret is created.
7. Use a narrowly scoped management credential to prove exact project/registration reads, permitted project/registration updates, and CMS enablement with `project.capability.manage`, while workspace/project enumeration, creation, lifecycle, foreign/non-primary capability mutation, and capability disablement remain denied.
8. Inspect canonical public docs/artifacts, packed CLI, narrowed SDK, browser assets/storage/network, logs/traces/metrics/audits, and local config for forbidden administration contracts or credentials.

## Alternatives rejected

### Publish or document dashboard oRPC

Rejected because it couples public clients to application routing, Better Auth session/cookie behavior, and internal procedure names. It would violate the M12 closed public registry and prevent portable HTTP/CLI/self-host contracts.

### Add writes to Tooling v1

Rejected because Tooling v1 is a released read-only project/schema discovery family with originless cache/read semantics. Control-plane lifecycle has different authority, quotas, errors, auditing, and compatibility needs.

### Use Authoring v1 for bootstrap

Rejected because Authoring is project/environment scoped and cannot create its own workspace/project authority. Mixing account bootstrap with schema/content writes would broaden grants and compatibility unnecessarily.

### Give every Control Plane route to management credentials

Rejected because project credentials cannot create/list account resources, archive projects, or impersonate workspace owners. Environment-bound credentials must not become broad account tokens.

### Use Better Auth session cookies on the public v1 transport now

Rejected for M14 because M17 has not designed production host/cookie/origin separation. The dashboard already has a secure session oRPC adapter; adding cookie auth to the public family now would create premature CSRF/CORS/host authority.

### Reuse unsigned internal cursors

Rejected because public cursors need tamper resistance, expiry, and principal/scope/filter binding. Internal dashboard compatibility can remain unchanged.

### Treat unique names/keys as idempotency

Rejected because workspace names are non-unique and project key conflicts cannot prove whether the same actor/input command previously committed. A persisted receipt gives deterministic replay without weakening uniqueness.

### Store full command request/response JSON

Rejected because it duplicates mutable contract data and risks persisting names, descriptions, origins, paths, or future secrets. The receipt stores only fingerprint, scope, operation, and stable result identity.

### Make archive idempotent without versions

Rejected because repeated archive/restore could hide stale lifecycle intent. Exact optimistic versions expose concurrent state and preserve explicit recovery semantics.

### Store Studio registration in CLI config only

Rejected because hosted recovery, multiple clients, exact environment scope, policy, audit, and future M18 runtime need server-authoritative metadata. Local config is not tenant authority.

### Implement Studio session/runtime discovery in M14

Rejected because browser credential isolation, adapters, BFF routes, session handoff, configured-base assets, and hostile-origin behavior require M18's dedicated design. M14 metadata is deliberately inert.

### Upgrade CLI config to v3 immediately

Rejected because the current project ID plus immutable `main` key is sufficient for M14, and all M13 workflows already consume config v2. Environment lifecycle/selection belongs to M24; forcing a config migration now adds compatibility work without authority benefit.

## Decision-standard review

### Product-goal alignment

Developers and agents gain the exact bootstrap path required by the PRD—login, workspace/project create or link, capability inspection, then code-first authoring—while the hosted dashboard remains a recovery client and future Studio metadata is established without prematurely building Studio.

### Correctness

Stable IDs, atomic default resources, command receipts with closed result dispositions, exact registration conflict semantics, exact fingerprints, signed cursors, optimistic versions, preserved archive state, and one shared repository prevent duplicate or divergent authority.

### Security

Narrow OAuth grants, originless bearer transport, no cookie ambiguity, exact primary-environment management credential scope, owner-only lifecycle, exactly-one capability/registration actor attribution, server policy, non-enumeration, bounded URL/path metadata, and honest audits preserve least privilege and browser credential isolation.

### Reliability

Transactional receipts/audits, deterministic no-op replay, replay-before-conflict ordering, soft archive/restore, failure injection, bounded clients, and no hidden mutation retry prevent partial bootstrap state and ambiguous automation.

### Performance

Keyset pages, no totals, direct scoped IDs, indexed receipt/registration lookups, measured receipt growth, bounded representations, and evidence-approved separate quotas avoid account scans and keep control-plane work isolated from delivery and worker capacity.

### UX

The dashboard retains familiar workflows and adds explicit restore/registration states. CLI operations are noninteractive, machine-readable, conflict-aware, and require exact destructive confirmation.

### DX

One canonical OpenAPI family, stable CLI commands, explicitly online verified linking, precise create/update conflict semantics, preserved config v2, and an intentionally smaller application SDK let humans and agents bootstrap without scraping or expanding website packages into administration clients.

### Observability

Named spans, request correlation, bounded metrics, transactional audits, actor-kind visibility, and strict redaction diagnose bootstrap/replay/lifecycle failures without recording account metadata or credentials.

### Maintainability and future compatibility

Separate family versioning, shared domain operations, explicit package ownership, inert Studio metadata, unchanged prior-family baselines, and deferral of governance/host/session/environment breadth keep M15–M18 and M24 design space open.

## Approved implementation authority

The developer explicitly approved M14 implementation under these design decisions and gates:

1. Add separate bearer-only, originless Control Plane API v1 at `/api/control-plane/v1`.
2. Keep dashboard Better Auth sessions on protected oRPC for M14 while sharing the exact domain authority; defer public cookie/session transport to M17.
3. Expose the exact workspace/project/capability/Studio-registration route set listed above.
4. Add `control-plane:read`, `control-plane:write`, and `control-plane:project:lifecycle` to the fixed official CLI OAuth authority.
5. Restrict workspace/project discovery, creation, and archive/restore to user actors; permit management credentials only for exact approved project update, capability inspection/CMS enablement, and Studio-registration operations, with primary-environment binding where project-wide mutation requires it.
6. Add project restore as a soft lifecycle reversal using a new owner-only `project.restore` action and existing version/archive columns.
7. Add persisted bounded command receipts for create-like operations and every Studio-registration `PUT`, including no-ops, while retaining optimistic versions for update/lifecycle operations.
8. Add signed, expiring, principal/scope/filter-bound public workspace/project cursors while preserving internal dashboard cursors.
9. Allow project creation to enable initial CMS capability atomically without creating schema/content/integration resources.
10. Add one inert, versioned Studio registration per exact environment containing only canonical application origin and mount path.
11. Keep CLI config v2; make `ffd link` authenticate and verify exact project/environment/archive/capability authority before atomic write.
12. Add additive Control Plane OpenAPI/public-registry, CLI, dashboard, and developer-doc ownership with `sdkSupported: false`, while preserving the already-narrowed Authoring SDK/CLI boundary and unchanged prior HTTP-family baselines.
13. Authorize the proposed Drizzle changes only behind the developer-controlled migration workflow using `add_control_plane_bootstrap_authorities`.
14. Require the complete security, concurrency, contract, package, accessibility, load, database, and manual evidence described above.
15. Keep package publication/versioning, production OAuth/configuration, migration generation/application, deployment, commit, milestone acceptance, and all M15+ work developer-controlled.

Approval does not authorize the agent to generate/apply a migration, publish, deploy, commit, accept M14, or begin M15.
