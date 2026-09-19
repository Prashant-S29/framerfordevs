# Milestone 16 operational administration and recovery design

**Status:** Developer-approved on 2026-09-16; implemented, accepted, committed, and pushed as `c3f9430`; migrations `0017` and `0018` developer-applied/catalog-verified

**Date:** 2026-09-16

## Decision summary

Milestone 16 completes the portable operational control plane over the credential, webhook, invalidation, delivery, audit, and project-recovery authorities already established by M3, M11, M14, and M15.

The proposed design:

- Extends additive bearer-only Control Plane v1 with canonical operational HTTP contracts and complete noninteractive CLI parity.
- Keeps credential administration OAuth-user-only. A management credential can never issue, rotate, revoke, or inspect credentials.
- Replaces immediate credential rotation for new operations with a staged pending → overlap → complete/cancel lifecycle. The new key is disclosed once, remains unusable until explicit activation, and the old key stops authenticating no later than a fixed 24-hour overlap.
- Exposes the existing webhook, subscription, destination, signing-secret, invalidation-mapping, delivery, attempt, and replay authority without creating a second implementation. Exact environment-bound management credentials may use their existing `webhook.read` or `webhook.manage` grants and are always attributed as credentials.
- Adds project-scoped, time-windowed, cursor-paginated audit visibility for unrestricted owners/developers through a new user-only permission and OAuth security-read grant. Audit rows remain content-free and expose no secret, URL path/query, payload, email, or mutable metadata.
- Makes archive an operational freeze: preserved credentials and webhook configuration remain intact, but ready webhook deliveries are canceled atomically and no new attempt may begin for an archived project. In-flight delivery remains the documented at-least-once boundary. Restore never replays canceled work automatically.
- Keeps narrowly security-reducing recovery available on archived projects to eligible session/OAuth users: inspect operational state and audits, revoke credentials, disable webhook endpoints, cancel pending rotations, complete old-secret retirement, and restore through the existing owner-only lifecycle authority. Ordinary creation, activation, update, replay, and delivery-changing mutation remain denied.
- Keeps all secret/recovery administration out of Studio and the public content/runtime SDK. Hosted React uses Better Auth session procedures over the same operations; it never receives CLI OAuth refresh tokens or management credentials.

This milestone does not create permanent deletion, a general operator console, SIEM export, alerting/SLO policy, retention cleanup, encryption-key rewrapping, multi-environment lifecycle, production egress infrastructure, or commercial administration.

## Authority and prior decisions

This design consumes and preserves:

- M3 fixed roles, default-deny policy, environment-bound credential families/scopes, digest-only API keys, one-time disclosure, immediate revocation, optimistic versions, and generic verification failures.
- M11 encrypted immutable webhook destinations, two-phase signing-secret rotation, send-time SSRF validation and address pinning, interval subscriptions, bounded retries, endpoint leases, immutable attempts, idempotent replay, and the rule that only `apps/worker` sends webhooks.
- M12 official-CLI OAuth device authority, native keychain storage, generated public contracts, and secret-free tooling output rules.
- M13 browser credential isolation and the prohibition on transferring hosted management/refresh authority into editor/browser runtimes.
- M14 bearer-only Control Plane v1, signed cursors, command receipts, user-only project lifecycle, soft archive/restore, origin/preflight rejection, exact management-credential scope, and `sdkSupported: false`.
- M15 fixed role plus locale policy, honest user/credential actors, governance OAuth grants, current-primary `main` authority, and the shared effective-policy projection.
- The approved HTTP/CLI/SDK boundary: control-plane, credential, webhook administration, audit, and recovery belong to HTTP + CLI + hosted controls and never to the application SDK.

M3 immediate rotation was correct for the initial credential lifecycle but cannot provide a safe deployment handoff when the old credential is already installed in an unavailable or independently deployed consumer. M16 supersedes that mutation authority: after hosted callers migrate, the immediate-rotation operation, protected procedure, and repository path are retired rather than retained as a parallel bypass. Historical lineage and immediate-rotation audit rows remain valid history.

M11 intentionally reserved management credential `webhook.read` and `webhook.manage` scopes for a future portable API. M16 activates those exact scopes at the Control Plane boundary; it does not mint a broader credential family or infer the issuing user's authority.

## Goals

M16 must deliver one coherent operational outcome:

1. Owners/developers can reconcile credentials, webhooks, invalidation mappings, delivery failures, and security history through deterministic HTTP or CLI without scraping hosted UI behavior.
2. Credential and webhook secret changes have explicit one-time output, ambiguous-response recovery, staged cutover, early retirement, and emergency revocation paths.
3. OAuth users and exact management credentials share webhook business authority where M3 already permits it, while every stored actor and audit remains honest.
4. Archived projects preserve configuration and history without continuing new webhook side effects; narrowly authorized recovery remains available without reopening ordinary mutation.
5. Audit inspection is bounded, indexed, tenant-scoped, permission-filtered, self-auditing, and redacted.
6. Hosted controls, public HTTP, and CLI adapters reuse the same Effect operations, repositories, policy, concurrency, audit, and worker authority.
7. Control Plane v1 remains originless, bearer-only, redirect-free, cookie-independent, bounded, additive, and excluded from the SDK.

## Non-goals

M16 does not add:

- Permanent workspace, project, environment, content, event, delivery, attempt, or audit deletion
- Workspace ownership transfer, account recovery, support impersonation, break-glass superusers, or cross-tenant operator authority
- Credential scope editing in place; changed authority requires issue-new and revoke-old
- Credential secret recovery, webhook secret redisclosure, recoverable API-key encryption, or secret-bearing command receipts
- New credential families, per-locale credential grants, dynamic roles, or custom policy
- General event export, audit export/download, SIEM streaming, security scoring, anomaly detection, alerts, incident cases, or retention policy
- Webhook custom headers, arbitrary ports, redirects, proxy use, client certificates, destination test sends, exactly-once delivery, or API-server delivery
- Encryption-key rewrapping, deployment key-ring mutation, network-layer egress controls, noisy-neighbor policy, or production topology hardening; M23 owns those controls
- Additional user-visible environments, promotion, cloning, or environment lifecycle; M24 owns them
- Studio implementation, bearer CORS, an executable browser API console, or SDK administration methods
- Billing, usage metering, analytics, plugins, package publication, production OAuth activation, hosted-domain rollout, or deployment

## Surface classification

| Capability                                          | Canonical HTTP        | Noninteractive CLI                     | Hosted dashboard | Studio   | Public SDK                                   |
| --------------------------------------------------- | --------------------- | -------------------------------------- | ---------------- | -------- | -------------------------------------------- |
| Credential list/issue/rotation/revoke               | Required              | Complete parity                        | Session-backed   | Excluded | Excluded                                     |
| Webhook endpoint/subscription/secret administration | Required              | Complete parity                        | Session-backed   | Excluded | Excluded                                     |
| Invalidation mapping administration                 | Required              | Complete parity                        | Session-backed   | Excluded | Excluded                                     |
| Delivery/attempt inspection and replay              | Required              | Complete parity                        | Session-backed   | Excluded | Verification helpers only; no administration |
| Audit/security visibility                           | Required              | Complete parity                        | Session-backed   | Excluded | Excluded                                     |
| Project archive/restore recovery                    | Existing v1 authority | Existing parity, strengthened guidance | Session-backed   | Excluded | Excluded                                     |

The hosted dashboard does not call bearer HTTP from React. Session adapters and bearer adapters both invoke the shared domain operations. No package convenience export may pull Control Plane contracts into `@framerfordevs/sdk` or browser-safe SDK graphs.

## Authorization model

### User actions

M16 adds one project action:

```text
project.audit.read
```

It is granted only to the fixed `owner` and `developer` presets. It joins the project-global unrestricted-locale action set: a selected/none-locale developer is denied audit visibility rather than receiving an incomplete projection that could leak activity outside the configured locale set. Owners continue to require all-locale access.

Existing actions remain authoritative:

- Credential inspection: `project.credential.read`
- Credential issue: `project.credential.issue`
- Credential staged rotation: `project.credential.rotate`
- Credential emergency revocation: `project.credential.revoke`
- Webhook/mapping/delivery/attempt reads: `webhook.read`
- Webhook/mapping/secret/replay mutations: `webhook.manage`
- Archive/restore: existing owner-only `project.archive` / `project.restore`

No credential scope is added for credential administration, audit browsing, project archive, or project restore.

### OAuth grants

The official CLI resource adds three narrow grants:

```text
control-plane:operations:read
control-plane:operations:write
control-plane:security:read
```

- Operations read is required for credential metadata, webhook endpoints/mappings, deliveries, and attempts.
- Operations write is required for credential issue/rotation/revoke and webhook/mapping/secret/replay mutations.
- Security read is required for project audit visibility.
- The existing lifecycle grant remains required for archive/restore.
- Existing Control Plane read remains required by existing project inspection routes; none of the new grants implies tenant membership or role authority.

Existing refresh tokens cannot silently gain the new grants. The CLI emits the existing stable re-login diagnostic when a token lacks them.

### Principal matrix

| Capability                            | Session/OAuth user                                                       | Management credential                        | Delivery/Preview credential |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------- | --------------------------- |
| Credential list/issue/rotation/revoke | Current owner/developer policy; OAuth additionally needs operation grant | Denied                                       | Denied                      |
| Webhook/mapping read                  | Current unrestricted policy; OAuth additionally needs read grant         | Exact project/environment + `webhook.read`   | Denied generically          |
| Webhook/mapping mutation and replay   | Current unrestricted policy; OAuth additionally needs write grant        | Exact project/environment + `webhook.manage` | Denied generically          |
| Audit/security read                   | Unrestricted policy; OAuth additionally needs security grant             | Denied                                       | Denied                      |
| Archive/restore                       | Existing session/OAuth owner authority                                   | Denied                                       | Denied                      |
| Archived-project recovery mutation    | Eligible user only                                                       | Denied                                       | Denied                      |

OAuth scope and credential scope are necessary, never sufficient. Every request rechecks current project relationship, role/locale policy, archive state, exact project/environment scope, credential family/state/expiry, and target tenant predicates.

### Shared actor

Webhook repositories and operations are generalized from `AuthUserId` to the existing shared actor:

```ts
type ProjectActor = { kind: "user"; id: AuthUserId } | { kind: "credential"; id: ApiCredentialId };
```

Credential administration narrows to the user branch before loading credential metadata. Webhook administration accepts both branches according to the matrix. Rate-limit identity, replay fingerprints, row actor columns, and audits use the actual branch; a credential is never translated to its creator or issuer.

## Credential administration

### Public metadata projection

Credential reads return only:

- Stable credential, project, and environment IDs
- Family, bounded name, safe display prefix, exact scopes, version, and derived lifecycle status
- Created, activation, expiry, retirement-due, revocation, and update times where applicable
- Safe open-rotation metadata: rotation ID, state, version, predecessor/successor IDs, and overlap end

They never return a key digest, raw key, creator/revoker identity, command fingerprint, request body, verification counters, or source fingerprint.

Derived statuses are closed and evaluated against a first-page `asOf` instant:

```text
pending | active | retiring | expired | revoked | canceled
```

`expired` is a read projection over server time and never makes an otherwise pending or revoked key usable.

### Issue

Issue requires explicit project/environment, family, name, exact scopes, and expiry intent.

- Management scopes must be a nonempty subset of the family registry and the current user's effective role authority.
- Delivery must explicitly request exactly `delivery.read`.
- Preview must explicitly request exactly `preview.read`, acknowledge environment-wide unpublished/hidden-field authority, and expire within the existing 30-day maximum.
- A nullable expiry remains supported for management/delivery only when `nonExpiringAcknowledged: true`; omission never silently means non-expiring.
- The server generates 32 random bytes, stores only the digest, commits metadata/scopes/audit atomically, and returns the raw key once.

Issue is intentionally not command-receipt replayable. Replaying a server-generated one-time secret would require recoverable secret storage or a misleading success without the key. After an ambiguous response, the caller lists the bounded recent metadata, revokes the unknown credential if present, and issues a replacement explicitly. The CLI never performs that reconciliation or retry without caller intent.

### Staged rotation

Rotation preserves the credential's family, project, environment, name, and scopes. It may set an explicit successor expiry under the same family lifetime rules. Scope or environment changes require issuing a separate credential and revoking the old one.

Lifecycle:

1. **Start:** lock the active credential, validate exact version and no open rotation, create a pending successor plus a versioned rotation row, write `project.credential.rotation_started`, and disclose the successor key once. The successor cannot authenticate.
2. **Activate:** lock project/predecessor/successor/rotation in stable order, require exact rotation version, make the successor active, make the predecessor retiring, set a fixed 24-hour `retireAt`, and write `project.credential.rotation_activated` atomically.
3. During overlap, both keys authenticate only within their original exact family/scope/environment and expiry. The predecessor is rejected once `retireAt` is reached even if cleanup has not run.
4. **Complete:** retire/revoke the predecessor early or after the overlap, preserve metadata/digest as nonrecoverable history, and write `project.credential.rotation_completed`.
5. **Cancel:** only while pending, mark the successor canceled/revoked before it ever becomes usable and write `project.credential.rotation_canceled`.

Only one open `pending|overlap` rotation may exist for a credential. A pending successor that expires cannot activate and must be canceled. A completed successor may later become the predecessor of another rotation. No adapter may retain the M3 create-successor-and-immediately-revoke path; every new rotation uses this one lifecycle authority.

Rotation start is not receipt-replayable because it discloses a server-generated key once. If its response is ambiguous, list reveals a pending successor and rotation ID but no secret; the caller cancels it and starts another. Activate/cancel/complete are optimistic exact-version transitions. Clients never blind-retry a version conflict.

### Emergency revoke

Revocation requires the exact credential version and explicit acknowledgement.

- Revoking a normal active credential makes it unusable immediately.
- Revoking the active side of an open rotation atomically revokes/cancels every still-usable or pending key in that open rotation so an operator cannot believe authority was removed while an overlap key remains valid.
- Revoking only the old retiring predecessor is represented by rotation completion, not by revoking the new active credential.
- Revoke, rotate activation, and verification serialize so exactly one state transition wins.
- A revoked/canceled/expired credential cannot be activated or rotated.

Verification remains an indexed credential-ID lookup plus bounded scope/rotation state. Malformed, unknown, pending, canceled, expired, overlap-expired, revoked, wrong-family, wrong-scope, and wrong-secret inputs keep the same generic invalid-credential result.

## Portable credential HTTP contract

Additive Control Plane v1 paths:

```text
GET  /projects/{projectId}/environments/{environmentId}/credentials
POST /projects/{projectId}/environments/{environmentId}/credentials
POST /projects/{projectId}/environments/{environmentId}/credentials/{credentialId}/rotations
POST /projects/{projectId}/environments/{environmentId}/credential-rotations/{rotationId}/activate
POST /projects/{projectId}/environments/{environmentId}/credential-rotations/{rotationId}/cancel
POST /projects/{projectId}/environments/{environmentId}/credential-rotations/{rotationId}/complete
POST /projects/{projectId}/environments/{environmentId}/credentials/{credentialId}/revoke
```

Credential list query:

```ts
type CredentialListQuery = {
  family: "all" | "management" | "delivery" | "preview";
  status: "all" | "pending" | "active" | "retiring" | "expired" | "revoked" | "canceled";
  limit: 1..50;
  cursor: SignedCursor | null;
};
```

Rows sort by `(created_at desc, credential_id desc)`. The signed cursor binds principal, project, environment, family/status filters, limit, `asOf`, final timestamp/ID, issuance/expiry, and key ID. No total count is returned.

Issue/start responses contain the raw key once. Every other response is secret-free. Public inputs are strict and reject omitted expiry acknowledgements, incompatible scopes, duplicate scopes, excess fields, and mismatched path/body scope.

## Webhook, invalidation, delivery, and replay administration

### Shared existing authority

M16 exposes and actor-generalizes the M11 repositories; it does not duplicate their lifecycle rules. The following remain unchanged and load-bearing:

- At most 10 enabled endpoints and 100 enabled mappings per environment
- Immutable encrypted destination revisions with masked read projections
- Strict HTTPS/443 URL policy, bounded all-address DNS validation, send-time revalidation, pinned lookup, no redirect/proxy/cookie/custom header
- Complete-set interval subscriptions and event-time activation boundaries
- Endpoint signing secrets encrypted under tenant-bound AAD
- One pending/active/retiring secret lifecycle and 24-hour dual-signature overlap
- Queue cancellation on disable, destination replacement, or subscription removal
- Immutable event bodies and attempt history, stable event identity, at-least-once delivery, fixed retry/dead-letter policy, and worker leases
- Idempotent replay to the endpoint's current destination with the original exact event body/ID
- API-server prohibition on outbound webhook sends

### Honest management-credential actors

Exact environment-bound management credentials may use their existing webhook scopes through the bearer boundary. Every endpoint, destination, subscription, signing-secret, mapping, replay-delivery actor field and audit stores exactly one user or complete credential actor. Composite foreign keys enforce credential workspace/project/environment scope.

The hosted session API remains user-only at transport level; it adapts the session to the same user actor. It never accepts a management token from browser code.

### One-time webhook secrets

Endpoint creation returns the first signing secret once. Rotation start returns a pending signing secret once. Neither operation is receipt-replayable.

Ambiguous endpoint-create recovery is list → inspect safe endpoint metadata → start signing-secret rotation → configure consumer → activate → complete. Ambiguous rotation-start recovery is list → cancel the unknown pending secret → start another. No read route decrypts or redisplays a signing secret.

### Delivery projections

The existing internal delivery list embeds the canonical event body, whose individual bound is 128 KiB. A portable 50-row page cannot safely fit Control Plane's 512 KiB response limit. M16 therefore separates:

- **Delivery list summary:** IDs, event type/time/subject authority, kind, state, attempt count, next/completion times, fixed outcome, and timestamps; no canonical body.
- **Exact delivery detail:** one delivery plus its exact canonical content-free event, bounded to the existing event maximum.
- **Attempt list:** at most the existing 12 attempts for one exact delivery, so no pagination or total is needed.

The hosted dashboard converges on the same summary/detail split, removing request waterfalls and oversized list payloads without changing webhook event bytes or public verification helpers.

### Public HTTP contract

Additive Control Plane v1 paths:

```text
GET   /projects/{projectId}/environments/{environmentId}/webhooks
POST  /projects/{projectId}/environments/{environmentId}/webhooks
PATCH /projects/{projectId}/environments/{environmentId}/webhooks/{endpointId}
PUT   /projects/{projectId}/environments/{environmentId}/webhooks/{endpointId}/state
PUT   /projects/{projectId}/environments/{environmentId}/webhooks/{endpointId}/subscriptions
POST  /projects/{projectId}/environments/{environmentId}/webhooks/{endpointId}/secret-rotations
POST  /projects/{projectId}/environments/{environmentId}/webhooks/{endpointId}/secret-rotations/activate
POST  /projects/{projectId}/environments/{environmentId}/webhooks/{endpointId}/secret-rotations/cancel
POST  /projects/{projectId}/environments/{environmentId}/webhooks/{endpointId}/secret-rotations/complete
GET   /projects/{projectId}/environments/{environmentId}/invalidation-mappings
POST  /projects/{projectId}/environments/{environmentId}/invalidation-mappings
PUT   /projects/{projectId}/environments/{environmentId}/invalidation-mappings/{mappingId}
PUT   /projects/{projectId}/environments/{environmentId}/invalidation-mappings/{mappingId}/state
GET   /projects/{projectId}/environments/{environmentId}/webhook-deliveries
GET   /projects/{projectId}/environments/{environmentId}/webhook-deliveries/{deliveryId}
GET   /projects/{projectId}/environments/{environmentId}/webhook-deliveries/{deliveryId}/attempts
POST  /projects/{projectId}/environments/{environmentId}/webhook-replays
```

Endpoint and mapping pages accept closed state filters, `limit <= 50`, and signed cursors. Delivery pages retain exact endpoint/event-type/status filters and use signed principal/project/environment/filter/limit cursors. All cursor routes reuse the M14 signer; legacy unsigned internal cursors are not accepted at the public boundary.

Endpoint update is complete desired metadata: exact version, name, and optional replacement destination. A replacement destination requires the complete URL again and explicit authority acknowledgement. Subscription replacement remains complete-set and optimistic. State and secret transitions require exact endpoint version; no force or wildcard version exists.

Invalidation mapping create adds `commandId` and extends the existing command-receipt registry because it returns no secret. Same actor/scope/fingerprint replays the exact mapping; command reuse with changed intent returns `COMMAND_CONFLICT`. Mapping update/state remain versioned.

Replay preserves M11 command identity and fingerprinting, generalized to user-or-credential actor identity. OAuth users use the existing user replay rate policy; credentials use a separate closed credential policy with the same conservative initial rate. Replay output returns `replayedBy: ProjectActor`, not a misleading user ID.

## Audit and security visibility

### Audit projection

M16 adds no mutable audit metadata and no new audit-event payload column. A project audit item contains only:

```ts
type ProjectAuditItem = {
  id: AuditEventId;
  projectId: ProjectId;
  environmentId: EnvironmentId | null;
  actor: ProjectActor;
  action: string; // existing bounded action grammar
  resourceType: string; // existing bounded resource grammar
  resourceId: string;
  requestId: string;
  occurredAt: IsoDateTime;
};
```

Workspace-only events are not projected through a project route. User email/name, credential name/prefix/scopes, destination origin/path/query, webhook body/status/network cause, content values, schema labels, invitation email/token, OAuth grants, command fingerprints, and arbitrary metadata are absent.

### Route and filters

```text
GET /projects/{projectId}/audit-events
```

Query:

```ts
type ProjectAuditQuery = {
  environmentId: EnvironmentId | null;
  category: "all" | "security" | "project" | "governance" | "schema" | "content" | "publication" | "webhook" | "tooling" | "other";
  actorKind: "all" | "user" | "credential";
  actorId: string | null; // exact only; requires matching actorKind
  action: string | null;  // exact existing action grammar
  from: IsoDateTime;
  to: IsoDateTime;
  limit: 1..50;
  cursor: SignedCursor | null;
};
```

The default window is the previous 30 days. Any one request sequence is limited to a 31-day inclusive window; older history remains accessible through explicit adjacent windows. Rows sort `(occurred_at desc, audit_id desc)` and expose no total.

Category is a code-owned stable classification over action prefixes/exact sensitive actions. Unknown future/historical actions appear as `other`, never disappear. Exact actor/action filters are parameterized and bounded; no substring/full-text search exists.

The cursor binds opaque principal, project, optional environment, category, actor/action filter digests, exact time window, first-page `asOf`, limit, final timestamp/ID, issuance, expiry, and signing key. Filter text and cursor bytes never enter telemetry.

Each successful page read writes one content-free `project.audit.read` audit row for the project actor after selecting against the fixed `asOf`. This records access to security history without moving rows inside the current page sequence. Authorization or tenant failures do not create cross-tenant evidence.

### Security visibility boundary

The hosted “Operations & security” view composes credential state, webhook state, delivery failures, and project audits from their canonical bounded resources. M16 deliberately adds no synthetic risk score, unbounded aggregate, actor directory, alert policy, export job, or hidden operator-only data source. M23 may add operational alerts and retention under a production threat model.

## Archived-project recovery behavior

Archive remains a soft, owner-only, optimistic project transition and preserves every child identity/configuration row. M16 makes its external-side-effect boundary explicit:

1. Lock the project first.
2. Reauthorize owner lifecycle authority and verify exact project version.
3. Mark the project archived and write `project.archived`.
4. In the same transaction, cancel queued/retry-scheduled webhook deliveries with fixed outcome `project_archived`; endpoint, destination, subscription, secret, event, delivery, and attempt history remain.
5. Dispatcher projection may persist an immutable publication event for already-accepted outbox work but creates no delivery while the project is archived.
6. Attempt claim rechecks active project state before leasing. A request already in flight at archive commit may still reach the destination and remains visible in attempt metadata.
7. Finalization records an in-flight success normally because the receiver may have accepted it. A retryable/permanent failure finalized after archive becomes terminal/canceled and schedules no further attempt.

Restore clears archive state and writes the existing audit. It does not reactivate canceled deliveries, replay events, rotate credentials/secrets, republish content, alter endpoint/mapping state, or manufacture attempts. Authorized users explicitly replay selected events after inspecting history.

Allowed while archived for eligible session/OAuth users:

- Project detail/recovery inspection and owner restore
- Credential list and emergency revoke
- Credential pending-rotation cancel and overlap completion
- Webhook endpoint/mapping/delivery/attempt read
- Webhook endpoint disable
- Webhook pending-secret cancel and retiring-secret completion
- Project audit read

Denied while archived:

- Credential issue, rotation start, or rotation activation
- Webhook endpoint create/update/enable, destination replacement, subscription replacement, or secret start/activation
- Invalidation mapping create/update/enable/disable
- Webhook replay
- Existing content/schema/publication/delivery/preview/tooling writes and other ordinary mutation
- Every management-credential operational route, including otherwise read-only webhook routes

This narrow recovery matrix is code-owned and tested. It is not inferred from HTTP method or UI visibility. Permanent deletion remains absent.

## Concurrency, idempotency, and lock order

### Credential lifecycle

- Lock project before credential, then rotation, then successor.
- Reauthorize under lock and scope every target by workspace/project/environment IDs.
- Issue commits credential/scopes/audit once but is intentionally non-replayable because of one-time output.
- Rotation start has one open-rotation uniqueness, exact predecessor version, pending unusability, and atomic audit.
- Activate/cancel/complete require exact rotation version and conditionally update all affected rows in one transaction.
- Emergency revoke closes every open usable/pending branch atomically.
- Verification treats pending/canceled/revoked/overlap-expired rows as invalid without waiting for cleanup.

### Webhook administration

- Preserve M11 environment-before-endpoint and endpoint-before-child order where it does not conflict with the repository-wide project-before-child order; public mutation transactions lock project, environment, endpoint, then child rows.
- Endpoint state/destination/subscription/secret changes remain exact-version transitions and cancel affected queued work atomically.
- Mapping create uses a receipt; replay keeps its existing command uniqueness/fingerprint; secret-producing creates never use receipts.
- User/credential replay fingerprints include actor kind and ID plus complete tenant/environment/event/endpoint/source scope.
- Worker claim/finalize lease tokens remain independent of configuration versions and cannot be overwritten by stale workers.

### Audit reads

- Capture `asOf` once, authorize, select `limit + 1`, and insert the audit-read event in one short transaction.
- New writes cannot move the fixed page sequence.
- No count, offset, arbitrary ordering, or user-supplied SQL pattern exists.

## Cursor authority

M16 extends the M14/M15 signed cursor service with routes for:

```text
credentials
webhook_endpoints
invalidation_mappings
webhook_deliveries
audit_events
```

Every cursor binds family/major, exact route, opaque principal key, project/environment scope, all canonical filters, limit, sort position, `asOf` where status/time depends on server time, and issued/expiry/key-rotation authority. Tamper, expiry, principal/scope/route/filter/limit mismatch, or repeated cursor returns `CONTROL_PLANE_CURSOR_INVALID`.

Pages fetch `limit + 1`; at most 50 rows are encoded. CLI defaults to one page. Any explicit all-page helper retains a maximum-page bound and repeated-cursor detection.

## CLI contract

Proposed exact commands:

```text
ffd credential list --api <origin> --project <id> --environment <id> [--family all|management|delivery|preview] [--status <status>] [--limit <n>] [--cursor <cursor>]
ffd credential issue --api <origin> --project <id> --environment <id> --name <name> --family <family> --scope <scope> [--scope ...] [--expires-at <iso>|--no-expiry] [--acknowledge-preview-authority] [--acknowledge-non-expiring] --secret-stdout
ffd credential rotation start --api <origin> --project <id> --environment <id> --credential <id> --expected-version <n> [--expires-at <iso>|--no-expiry] [--acknowledge-non-expiring] --secret-stdout
ffd credential rotation activate|cancel|complete --api <origin> --project <id> --environment <id> --rotation <id> --expected-version <n> [--confirm-overlap|--confirm-retirement]
ffd credential revoke --api <origin> --project <id> --environment <id> --credential <id> --expected-version <n> --confirm-prefix <safe-prefix>

ffd webhook endpoint list --api <origin> --project <id> --environment <id> [--state enabled|disabled] [--limit <n>] [--cursor <cursor>]
ffd webhook endpoint create --api <origin> --project <id> --environment <id> --name <name> --event <type> [--event ...] --destination-stdin --acknowledge-metadata-authority --secret-stdout
ffd webhook endpoint update --api <origin> --project <id> --environment <id> --endpoint <id> --expected-version <n> --name <name> [--destination-stdin --acknowledge-destination-replacement]
ffd webhook endpoint state set --api <origin> --project <id> --environment <id> --endpoint <id> --expected-version <n> --state enabled|disabled [--confirm-disable <endpoint-id>]
ffd webhook subscription replace --api <origin> --project <id> --environment <id> --endpoint <id> --expected-version <n> --event <type> [--event ...]
ffd webhook secret rotation start --api <origin> --project <id> --environment <id> --endpoint <id> --expected-version <n> --secret-stdout
ffd webhook secret rotation activate|cancel|complete --api <origin> --project <id> --environment <id> --endpoint <id> --expected-version <n> [--confirm-overlap|--confirm-retirement]

ffd invalidation mapping list --api <origin> --project <id> --environment <id> [--state enabled|disabled] [--limit <n>] [--cursor <cursor>]
ffd invalidation mapping create --api <origin> --project <id> --environment <id> --collection <id> [--entry <id>] [--locale <id>] --name <name> --event <type> [--event ...] --route <path> [--tag <tag> ...] [--command-id <uuid>]
ffd invalidation mapping update --api <origin> --project <id> --environment <id> --mapping <id> --expected-version <n> <complete desired mapping flags>
ffd invalidation mapping state set --api <origin> --project <id> --environment <id> --mapping <id> --expected-version <n> --state enabled|disabled

ffd webhook delivery list --api <origin> --project <id> --environment <id> [--endpoint <id>] [--event <type>] [--status <status>] [--limit <n>] [--cursor <cursor>]
ffd webhook delivery get --api <origin> --project <id> --environment <id> --delivery <id>
ffd webhook attempt list --api <origin> --project <id> --environment <id> --delivery <id>
ffd webhook replay --api <origin> --project <id> --environment <id> --endpoint <id> --event-id <id> [--source-delivery <id>] [--command-id <uuid>] --confirm-event <event-id>

ffd audit list --api <origin> --project <id> [--environment <id>] [--category <category>] [--actor-kind user|credential --actor-id <id>] [--action <action>] [--from <iso>] [--to <iso>] [--limit <n>] [--cursor <cursor>]
```

CLI rules:

- Every command requires explicit `--api`; no remembered tenant/project/environment authority.
- `--json` remains deterministic stdout-only output; diagnostics and recovery instructions go to stderr.
- One-time issue/create/rotation commands refuse to send unless `--secret-stdout` is present. Their JSON necessarily contains the key/secret once. They never write it to config, keychain, retry journal, temp files, diagnostics, or telemetry.
- Webhook destinations are read only from bounded stdin, never an argument, process environment, config, or journal, because path/query may contain provider authority. The CLI cannot combine two stdin-owned inputs in one command.
- Secret-producing operations do not retry after ambiguous transport failure. Error diagnostics provide exact list/revoke-or-cancel/reissue recovery steps.
- Invalidation mapping create and webhook replay use content-free retry journals containing only operation, command ID, and canonical hash over non-secret stable intent. Successful/nonretryable outcomes clear the journal.
- Version conflicts never trigger hidden read-modify-write retries. Callers list/get, compare state, and issue a new explicit versioned command.
- Destructive or externally visible operations require exact confirmations: safe credential prefix, endpoint ID, event ID, or explicit overlap/retirement acknowledgement.
- OAuth denial never falls back to `FFD_MANAGEMENT_TOKEN`. That process environment value is accepted only for the exact webhook matrix and is never stored or printed.
- Exit 0 means accepted success/replay/no-op; typed failures use exit 1; existing schema-check drift exit 2 remains unchanged.

## Hosted dashboard UX

The dashboard adds one resilient “Operations & security” project area while preserving existing project access and webhook routes during M16. M17 owns domain separation, not this milestone.

### Credentials

- Bounded family/status filters and pagination include active, pending, overlap, expired, canceled, and revoked text states.
- Issue requires exact scopes/expiry acknowledgements before request dispatch.
- One-time key modal requires copy acknowledgement and clears mutation/query/component state on close.
- Rotation is a guided start → deploy pending key → activate overlap → complete flow with exact versions and explicit expiry time.
- Unknown/ambiguous issue or start responses show list/revoke-or-cancel/reissue recovery, never hidden retries.
- Emergency revoke explains that an open rotation is closed atomically and requires safe-prefix confirmation.

### Webhooks and delivery recovery

- Existing endpoint/mapping/delivery UX converges on portable summaries/detail and shared actor-aware operations.
- Destination entry remains masked after submission; replacement requires full re-entry and consequence acknowledgement.
- Signing-secret creation/rotation retains one-time copy acknowledgement and clears secret state on close.
- Disabled/subscription/destination/retirement confirmations explain queued and unavoidable in-flight effects.
- Delivery list loads summaries; detail lazily loads the one canonical content-free event and bounded attempt timeline.
- Replay requires event/endpoint confirmation and clearly states stable event ID/idempotency behavior.

### Audit and archived recovery

- Audit filters use bounded date pickers (maximum 31 days), category, exact actor, action, and environment.
- Actor IDs remain copyable stable identifiers; the audit view does not invent display names for removed users or credentials.
- Archived project pages keep credential/webhook/audit history visible to eligible users and render only the approved security-reducing actions plus owner restore.
- Controls are permission-filtered, but forged calls remain server-denied.

All dialogs/forms require labels, descriptions, textual status, error summaries, keyboard operation, focus restoration, 200% reflow, and automated axe coverage. No secret enters a URL, query key, persisted browser storage, ordinary cache, analytics event, or error boundary.

## Errors

Control Plane v1 adds the existing bounded application errors required by the operational surface, including:

- `CREDENTIAL_ROTATION_CONFLICT`
- `CREDENTIAL_ROTATION_INVALID`
- `WEBHOOK_ENDPOINT_LIMIT_REACHED`
- `WEBHOOK_SECRET_ROTATION_CONFLICT`
- `WEBHOOK_REPLAY_NOT_ALLOWED`
- Existing `COMMAND_CONFLICT`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `CONTROL_PLANE_CURSOR_INVALID`, validation, authorization, not-found, credential, quota, service, and internal codes

Semantics:

- Foreign/nonexistent project/environment/credential/rotation/endpoint/mapping/event/delivery scope returns non-enumerating `NOT_FOUND` where generic credential behavior does not apply.
- Known users denied by role/locale/archive state receive the existing stable forbidden/invalid-transition behavior.
- Management credential authentication failures remain generic; policy denial never reveals whether a foreign target exists.
- Pending/canceled/retired key verification is indistinguishable from any other invalid credential.
- Errors never echo names, scopes, expiry intent, prefix, actor ID, action filter, URL/origin, route/tag, event body, secret/digest/fingerprint, OAuth scope list, cursor, request body, database cause, or network cause.

## Audit actions and observability

M16 adds credential audit actions:

```text
project.credential.rotation_started
project.credential.rotation_activated
project.credential.rotation_canceled
project.credential.rotation_completed
project.audit.read
```

Existing credential issue/revoke, webhook, mapping, replay, project archive/restore, and worker-attempt records remain. Management-credential webhook mutations reuse existing action identities but record `actor_type=credential` and the exact credential ID.

Named spans cover credential issue/list/rotation/revoke, webhook/mapping configuration, delivery/detail/attempt reads, replay, audit reads, archive cancellation, cursor verification, receipt replay, and worker archived-state checks.

Safe span attributes may include closed operation, actor kind, stable project/environment/resource IDs where existing rules allow, family/status/state/action-category values, replay/no-op flags, page/size/age buckets, result, and duration. They exclude raw keys/secrets/digests/fingerprints, names, scope arrays, expiry strings, actor filter/ID, audit action/resource/request IDs as free labels, destinations/origins, routes/tags, event bodies, HTTP/network details beyond existing closed outcome/status-family values, OAuth grants, request/response bodies, cursor bytes, and command fingerprints.

Metrics use only closed operation/principal/family/state/outcome/status/cost/page/size buckets. Tenant, resource, actor, credential, endpoint, host, route, tag, and action identities never become labels.

M16 extends the existing 60-second Control Plane buckets only with measured operation costs: read/detail 1, filtered list 2, optimistic mutation 3, secret/destructive/replay 5. Any refill/capacity change requires implementation evidence and explicit approval.

## Database impact and migration gate

M16 requires one developer-controlled migration. Proposed name:

```text
add_operational_administration_authorities
```

### Credential lifecycle

Extend `api_credential` with closed lifecycle and activation/retirement metadata sufficient to make pending keys unusable and retiring keys expire without cleanup. Existing rows backfill to active or revoked from current revocation state; historical created/updated/expiry/lineage values remain unchanged. No synthetic rotation row is created for a completed historical immediate rotation.

Add `api_credential_rotation` with:

- Rotation ID, workspace/project/environment scope
- Predecessor and successor credential IDs with complete tenant FKs and distinctness check
- State `pending | overlap | canceled | completed`
- Positive optimistic version
- Nullable activation/retirement/completion/cancellation times with lifecycle checks
- User creator/changer identity; credential actors are prohibited from credential administration
- Partial uniqueness preventing more than one open rotation for a predecessor/successor
- Tenant/state/timeline indexes for exact recovery lookup

The current unconditional unique successor-per-predecessor lineage constraint must be replaced only as needed to permit a canceled pending attempt followed by a new rotation, while open-rotation uniqueness remains database-enforced.

### Honest webhook actors

Normalize user-only actor columns on:

- `webhook_endpoint`
- `webhook_endpoint_destination`
- `webhook_endpoint_subscription`
- `webhook_endpoint_secret`
- `cms_invalidation_route_mapping`
- Replay actor columns on `webhook_delivery`

For each creator/changer/closer/replayer role, preserve existing user values, make the user column nullable where required, add nullable credential ID plus credential environment ID, require exactly one user or complete credential actor when the lifecycle field is present, and add composite `(credential, workspace, project, environment)` FKs plus supporting partial indexes. Initial deliveries retain no replay actor.

No destination/secret ciphertext, event body, delivery, attempt, or audit row is rewritten except actor-structure backfill needed to preserve existing user attribution.

### Receipt and audit indexes

- Extend the closed command-receipt operation/result/scope registry for invalidation mapping create; add no request JSON or metadata column.
- Add only measured audit indexes needed for project/environment/time and exact actor/action filters. The default project timeline index remains the primary unfiltered path.
- Add no total-count, trigram, full-text, extension, partition, or retention schema speculatively.

### Gate procedure

After explicit design and implementation approval:

1. Edit only approved Drizzle schema and focused schema tests.
2. Stop and provide the exact migration name and generation commands.
3. The developer generates the real SQL/snapshot/journal and owns any required data backfill statement.
4. Inspect the generated SQL, snapshot, and journal completely; never edit/apply them.
5. Prepare an agreed correction only under ignored `tmp/migrations/` for developer transfer.
6. Continue integration work only after developer application confirmation and read-only catalog inspection, with the independent worker stopped for shared-database gates.

No existing migration or snapshot is edited, replaced, or deleted.

## Effect and repository ownership

Planned ownership:

```text
packages/api/src/contracts/control-plane/            additive operational schemas/OpenAPI
packages/api/src/contracts/access/                   credential lifecycle/rotation contracts
packages/api/src/contracts/webhook/                  summary/detail and shared actor projections
packages/api/src/operations/control-plane/public/    bearer decode/auth/rate adaptation
packages/api/src/operations/credentials/             user-only lifecycle workflows
packages/api/src/operations/webhook/api/             user/credential operational workflows
packages/api/src/operations/audit/                   bounded project audit read
packages/api/src/services/credential/                lifecycle transaction and verification authority
packages/api/src/services/webhook/                   configuration/history/replay transaction authority
packages/api/src/services/audit/                     audit query/category authority
packages/api/src/services/platform-repository.ts     archive cancellation/restore preservation
packages/api/src/services/control-plane/             signed cursors and mapping-create receipts
packages/db/src/schema/access.ts                      credential rotation authority
packages/db/src/schema/webhooks.ts                    honest webhook actors
packages/db/src/schema/platform.ts                    measured audit indexes only
packages/cli/src/control-plane-command/               complete command/secret adaptation
packages/cli/src/control-plane-http-client/           strict operational transport/decoding
apps/server/src/control-plane-router.ts               isolated Express routes only
apps/web/src/components/project/                      session-backed operations/security UX
apps/developers/                                      operational task/reference docs
packages/public-contracts/                            canonical additive v1 artifact/baseline
```

Business operations remain named `Effect.fn` values with typed expected errors and replaceable services/Layers. Drizzle promises stay inside repositories. Server, CLI, and worker retain one long-lived shared `ManagedRuntime` per process boundary. Express owns HTTP mechanics only. `apps/worker` remains the sole outbound webhook sender.

The current flat `operations/credentials.ts` may move into the established credential owner directory during implementation with stable exports preserved. This is a bounded ownership correction, not a broad repository refactor.

## Security and failure model

| Threat/failure                                              | Control                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| One-time credential key is lost after response              | Pending rotation is unusable; list → cancel/restart. Issue uses list → revoke/reissue; no hidden replay  |
| New key activates before consumer deployment                | Explicit separate activation with exact version and acknowledgement                                      |
| Old key remains valid indefinitely                          | Fixed `retireAt` enforced in verification even before completion                                         |
| Emergency revoke leaves overlap key alive                   | Atomically closes every open usable/pending branch                                                       |
| Credential administers credentials/audits/project lifecycle | OAuth-user-only routes and no corresponding management scopes                                            |
| Credential impersonates webhook issuer                      | Shared actor branch, composite actor FKs, actor-bound replay fingerprint/audit                           |
| Secret or destination enters process list/journal           | CLI stdout acknowledgement; destination stdin-only; content-free journals                                |
| Browser receives bearer/refresh/management authority        | Session-only hosted adapter, origin rejection, no CORS, no SDK/Studio export                             |
| Archived project continues webhook sends                    | Archive cancels ready deliveries; dispatcher/claim active-project checks; in-flight boundary visible     |
| Restore silently redelivers stale events                    | No automatic replay; explicit idempotent confirmed replay only                                           |
| Cross-tenant target substitution                            | Project-first authorization, exact environment, composite predicates/FKs, non-enumeration                |
| Audit leaks content/PII/secret metadata                     | Fixed content-free projection, no joins to payload/name/email/URL/secret tables                          |
| Audit pagination shifts because reads audit themselves      | Fixed `asOf` plus signed keyset cursor; read audit inserted after selected snapshot                      |
| Audit scan/export exhausts database                         | 31-day window, limit 50, no totals/search/export, indexed plans, rate/cost bounds                        |
| Delivery page exceeds response bound                        | Summary list plus one exact detail; attempt maximum 12                                                   |
| Replay floods destination                                   | Exact manage authority, confirmation, actor-specific limiter, idempotent command, endpoint serialization |
| Stale worker overwrites archive/recovery outcome            | Active-project claim check plus existing lease-token guarded finalization                                |
| Partial credential/webhook/audit state                      | One transaction and failure injection at every persistence stage                                         |

## Performance and reliability evidence

Implementation approval should require:

- Indexed credential pages across family/status/as-of filters and O(1) verification for every lifecycle state
- Credential start/activate/cancel/complete/revoke contention, response-loss recovery, and overlap-expiry behavior under parallel verification
- Set-based endpoint detail loading with no per-row query waterfall
- Indexed endpoint/mapping/delivery pages for representative filters and signed cursor stability under inserts/state changes
- Delivery summary maximum-page and exact maximum-body detail response-size evidence under 512 KiB
- Audit unfiltered, environment, actor, action, and category plan evidence across maximum 31-day windows; no offset/count scans
- Archive versus dispatcher/claim/finalize contention proving no new post-archive claim and documenting only the in-flight send boundary
- Existing two-worker lease, retry, dead-letter, SSRF, key-ring continuity, and webhook throughput budgets unchanged
- Existing Control Plane, Authoring, Delivery, Preview, Tooling, and publication latency/contract baselines unchanged

No new runtime dependency is expected. Any proposed dependency requires provenance, license, production/full audit, bundle impact, and explicit approval before adoption.

## Test plan

### Pure and contract tests

- Credential state/rotation transition table, 24-hour boundaries, family expiry rules, and emergency branch closure
- Pending/canceled/overlap-expired credentials always fail generic verification
- Exact scope/family/expiry/acknowledgement closure and excess-property rejection
- Webhook summary/detail projections never expose encrypted/plain destinations, secrets, actor-only columns, or oversized list bodies
- Audit category classification covers every registered current action and maps unknown values to `other`
- Audit time-window/filter validation and content-free projection
- Signed cursor round trip/tamper/expiry/key rotation/principal/scope/route/filter/limit/as-of mismatch for every new route
- Mapping-create receipt and replay command fingerprints use Effect Schema encoded inert transport values
- New errors/status/retryability/envelope mapping
- Additive OpenAPI security schemes/operations and unchanged non-Control-Plane public artifact bytes
- Forbidden SDK/Studio/control-plane convenience exports

### Effect service tests

- Session/OAuth/management actor adaptation follows the exact route matrix without issuer fallback
- Credential operations reject credential actors before metadata lookup
- Webhook operations persist actual user/credential actor in every lifecycle branch
- Repository/clock/secret/crypto/DNS/cursor/receipt/rate/telemetry Layers remain replaceable
- Expected failures remain typed; defects and interruption remain distinct
- Secret-bearing values never appear in span annotations or error details
- Archived recovery matrix is centralized and exhaustive, not adapter-specific

### PostgreSQL integration

- Existing credentials backfill to valid active/revoked lifecycle state without changing digest/scope/lineage, and no immediate-rotation mutation path remains
- Pending successor is unusable; activation changes both sides atomically; overlap expiry rejects predecessor; cancel/complete are terminal
- Open-rotation uniqueness and canceled-restart behavior under contention
- Issue/start/activate/cancel/complete/revoke audit rollback at every injected stage
- Emergency revoke closes active/pending/retiring branches with one concurrency winner
- Webhook exactly-one user/credential actor checks and composite tenant FKs on every altered table
- Credential-authored endpoint/destination/subscription/secret/mapping/replay rows and audits use exact credential environment
- Mapping create state/audit/receipt rollback and concurrent replay
- Archive cancels ready deliveries atomically while preserving endpoint/event/attempt/config rows; restore creates no delivery
- Dispatcher/attempt claim cannot start work for archived projects; stale finalization remains lease-guarded
- Audit read authorization/select/self-audit atomicity and fixed-as-of pagination
- Required indexes are chosen by representative PostgreSQL plans
- Two-workspace/two-project/two-environment/user/credential isolation matrix

### HTTP and security integration

- Every new method/path/query/body/content type success and closed failure case
- Cookies ignored; Origin/preflight, duplicate authorization, redirects, GET bodies, mutation queries, unknown query keys, excess body fields, and oversized input/output rejected
- New OAuth grants required separately from project policy; existing refresh authority cannot gain them
- Management credential exact webhook success and credential/audit/lifecycle denial
- Delivery/Preview credentials and foreign/revoked/expired/pending/overlap-expired credentials fail generically
- Signed cursor cannot cross principal/project/environment/filter/as-of
- One-time keys/secrets absent from headers/errors/telemetry/artifacts and never redisplayed
- Destination path/query absent from all read responses; destination validation/SSRF policy unchanged
- Archived matrix permits only user recovery operations and denies management credentials
- Existing 27 Control Plane operations remain compatible

### CLI

- Exact command/flag ownership and declared repeatable scope/event/tag flags
- JSON/stdout and diagnostic/stderr separation
- Required `--secret-stdout` before request dispatch; no secret in stderr, journal, config, keychain, fixture, or temp path
- Bounded destination stdin and rejection of argument/environment alternatives
- Ambiguous issue/create/rotation diagnostics with no hidden retry
- Mapping/replay journal replay/clear behavior and no secret-bearing bytes
- Version conflict/refetch behavior and exact destructive confirmations
- One-page default, maximum-page, and repeated-cursor guards
- OAuth re-login diagnostics and no management fallback
- Packed package forbidden-string/fixture inspection

### Worker and resilience

- Project archived between dispatcher selection and commit
- Project archived before/after attempt claim and during HTTP send
- In-flight success/failure finalization remains visible and does not schedule a new retry after archive
- Restore never un-cancels or auto-replays
- Existing endpoint disable/subscription/destination/secret races remain correct under user and credential actors
- Two-worker sustained producer/dispatcher/attempt profile retains no deadlocks, hot polling, pool growth, or starvation
- Server/worker key-ring continuity and readiness remain unchanged

### Hosted UI and accessibility

- Credential issue, one-time acknowledgement, staged rotation, overlap countdown, ambiguous recovery, and emergency revoke
- Webhook destination stdin-equivalent form handling, one-time signing secret, rotation, disable, mapping, delivery detail, and replay recovery
- Audit window/category/actor/action filters and fixed pagination reset/query keys
- Archived read-only recovery rendering and owner-only restore
- Permission-filtered controls plus forged-call server denial
- Secret state cleared from mutation/query/component state on close/unmount/error
- Labels, descriptions, status text, focus restoration, keyboard operation, 200% reflow, responsive layout, and axe checks

### Docs, package, and manual review

- Canonical Control Plane artifact/reference/guide/CLI parity and intentional baseline digest update
- No credential/webhook/audit/recovery administration in SDK symbols, bundles, docs examples, or package fixtures
- Secret-safe shell examples use stdin/stdout redirection placeholders without putting values in command history
- Manual credential pending → activate → dual-valid → complete/expiry proof
- Manual ambiguous secret recovery without redisclosure
- Manual OAuth user versus management credential webhook actor matrix
- Manual audit isolation/redaction/window/cursor proof
- Manual archive during queued and in-flight webhook work, then restore plus explicit replay
- Browser/storage/network/telemetry/artifact inspection for forbidden credentials/secrets/destinations

## Decision-standard review

### Product-goal alignment

The design makes the hosted control plane and CLI genuine recovery surfaces when a project application or Studio is unavailable, while keeping application packages focused on content/runtime integration.

### Correctness

Explicit lifecycle states, exact versions, stable IDs, project-first tenant scope, signed filter-bound cursors, fixed audit snapshots, command fingerprints, and transactional audits prevent stale or partial operational state.

### Security

Credential administration stays user-only; management credentials gain only the webhook authority already encoded in their exact scopes; one-time material is never recoverable or silently replayed; archive stops new external sends; audit output is content-free and permission-gated.

### Reliability

Staged rotation permits deploy-before-cutover, overlap has a hard end, emergency revoke closes every live branch, webhook replay stays idempotent, archived queues do not restart implicitly, and failure injection covers every multi-row transition.

### Performance

All unbounded histories use indexed keyset pages and no totals. Audit windows are capped. Delivery lists no longer multiply maximum event bodies. Existing worker concurrency and publication paths gain only indexed active-project checks.

### UX and DX

CLI commands are explicit, machine-readable, conflict-aware, and secret-safe. Hosted users see lifecycle/recovery state instead of relying on undocumented retries. Ambiguous one-time operations have concrete reconciliation paths.

### Observability

Actual actor kind, stable scope, closed states/outcomes, request correlation, and immutable audits diagnose operations while high-cardinality filters, secrets, URLs, bodies, and identities stay out of telemetry labels/details.

### Maintainability and future compatibility

M16 extends existing Control Plane, credential, webhook, policy, worker, and dashboard authorities. It adds no duplicate delivery process, policy engine, audit payload store, SDK namespace, environment model, or operator superuser. M22–M24 retain clean ownership of durability, production operations, and environment lifecycle.

## Alternatives rejected by this proposal

### Keep immediate credential rotation

Rejected because it makes response loss and independently deployed consumers recover only through outage-prone revoke/reissue behavior. Staged activation adds bounded schema/UX work but materially improves correctness and recovery.

### Encrypt API credential keys so rotation responses can be replayed

Rejected because recoverable bearer keys enlarge breach impact and contradict M3 digest-only storage. One-time output plus explicit reconciliation remains the safer model.

### Let management credentials administer credentials or audits

Rejected because a project bearer could mint replacement authority, erase its own access boundary, or inspect security history. Credential lifecycle, security history, and project recovery remain user governance powers.

### Keep webhook management user-only

Rejected because M3/M11 deliberately defined exact `webhook.read/manage` management scopes for portable automation. Leaving them inert would make CLI agent parity incomplete; honest actor normalization closes the attribution gap.

### Return full event bodies in delivery pages

Rejected because a valid maximum page can exceed the fixed Control Plane response budget by more than an order of magnitude. Summary list plus exact detail preserves information without weakening bounds.

### Automatically replay canceled deliveries after restore

Rejected because restore cannot know whether the receiver processed an in-flight request or whether stale side effects are still desired. Explicit idempotent replay keeps the operator in control.

### Add audit export, retention, alerts, or operator impersonation now

Rejected as a materially broader production-operations authority. M16 provides bounded project recovery visibility; M22–M23 own durability, retention, deployment controls, and incident operations.

## Approval and implementation gate

The developer approved this design and explicitly authorized implementation on 2026-09-16, including:

1. Staged API credential rotation with pending non-usability and a fixed 24-hour overlap
2. Activation of existing management-credential webhook scopes with full honest actor normalization
3. User-only `project.audit.read` plus separate OAuth security-read authority and 31-day query windows
4. Archive-time cancellation of ready webhook deliveries and active-project checks in dispatcher/claim
5. Secret-producing operations remaining intentionally non-receipt-replayable
6. Delivery summary/detail separation and continued complete SDK exclusion

Implementation proceeds in bounded gates:

1. Contracts, action/grant registry, lifecycle/category kernels, and focused pure tests
2. Approved Drizzle schema edits, then stop for developer migration generation/application
3. Credential lifecycle repository, verification, concurrency, and PostgreSQL evidence
4. Webhook actor generalization, summary/detail, archive worker boundary, and resilience evidence
5. Audit repository, signed cursors, bearer HTTP, quotas, errors, and OpenAPI artifact
6. Complete CLI parity, secret-safe stdin/stdout behavior, and recovery journals
7. Hosted dashboard convergence and accessibility
8. Docs/package/SDK boundary audit, complete readiness, manual review, and developer acceptance

The agent must stop after approved Drizzle edits for developer migration generation/application. It must not generate/apply/edit migrations, activate production OAuth, publish, deploy, commit, accept M16, or begin M17.
