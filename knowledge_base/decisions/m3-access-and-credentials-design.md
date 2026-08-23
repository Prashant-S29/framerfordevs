# Milestone 3 access and credential design

**Status:** Implemented, manually approved, and committed as `a74aeb8`

**Date:** 2026-07-30

## Decision summary

Milestone 3 will add first-party project collaboration and machine credentials on top of the existing workspace/project kernel. Better Auth remains the identity and session provider; application-owned project invitations, memberships, authorization policies, and credentials remain inside the platform domain.

The design uses:

- Explicit project memberships with fixed initial role presets
- Project-scoped invitations backed by one-time high-entropy tokens
- A default-deny Effect policy service with explicit resource/action/context inputs
- Workspace-owner governance plus project-owner last-owner protection
- Separate management, delivery, and preview credential families
- Environment-bound credentials with schema-backed scope allowlists
- One-time credential secrets, SHA-256 digests at rest, immediate database-backed revocation, and atomic rotation
- Transactional state changes and immutable audit events
- Bounded keyset pagination and query-path-specific indexes
- A bounded credential-attempt limiter and low-cardinality security telemetry

This is an authorization foundation, not a general user-defined policy language. Initial roles are code-owned presets. The policy context is designed to add collection, entry, field, locale, and publication-state restrictions in later milestones without changing project or membership identity.

## Research and compatibility decisions

### Installed guidance used

The design applies the installed Better Auth, Effect, Drizzle, PostgreSQL, Express, TanStack, shadcn/ui, React performance, web-interface, and security-hardening guidance. Stable installed package declarations and existing repository patterns remain the executable contract.

### Better Auth organization plugin is not adopted

The organization plugin provides useful generic organizations, members, invitations, and role checks, but it is not the platform authorization model:

- The repository already owns durable workspace, project, environment, membership, and audit resources.
- Product authorization must eventually evaluate project, environment, collection, entry, field, locale, action, and publication state.
- Plugin-owned organization endpoints use Better Auth protocol contracts rather than the application envelope.
- Duplicating workspaces as Better Auth organizations would create two competing tenant and membership sources of truth.
- Plugin pagination, schema, and active-organization session behavior do not match the existing project-scoped keyset and explicit-scope contracts.

Better Auth therefore continues to establish user identity only. Application adapters consume its session and validated user identity.

### Better Auth API key plugin is not adopted

The API key plugin has strong generic capabilities, including hashing, rate limiting, multiple configurations, and organization-owned keys. It is not used because the product requires credentials that are:

- Bound by foreign keys to the platform's workspace, project, and environment
- Split into management, delivery, and preview families with strict non-overlap
- Governed by application role/policy decisions and application envelopes
- Audited atomically with application-owned credential workflows
- Revoked without creating user sessions or impersonating a human
- Future-compatible with CMS resource and locale restrictions

No credential will become a Better Auth session. The implementation will reuse the sound security principles from the plugin documentation—high entropy, one-time disclosure, hashing, prefixes, bounded verification, expiration, and immediate revocation—inside the application domain.

### Stable Effect and Drizzle boundary remains unchanged

No Effect, Drizzle, or Better Auth version change is proposed. Drizzle remains Promise-native inside focused repository adapters and is wrapped with typed `Effect.tryPromise` boundaries. Services and policies use stable Effect 3.22 patterns, named `Effect.fn` operations, test Layers, the shared ManagedRuntime, typed errors, spans, logs, and bounded metrics.

## Scope

### Included

- Project membership creation through invitation acceptance
- Initial fixed project roles
- Project invitation issue, list, revoke, inspect, and accept flows
- Membership list, role update, removal, and last-owner protection
- Default-deny policy evaluation for user and credential subjects
- Migration of existing project operations from owner-only SQL checks to policy decisions
- Management, delivery, and preview credential issue, list, revoke, and rotate flows
- Credential authentication/verification service and attempt limiting
- Member, invitation, and credential management UI
- Permission-denied and one-time-secret UX
- Atomic audit events and security telemetry
- Full role matrix, isolation, concurrency, contract, UI, and accessibility tests

### Deferred

- Custom user-defined roles or a general persisted policy DSL
- Collection, entry, field, or locale-specific membership restrictions
- Email-provider integration and automatic invitation mail delivery
- Multiple user-visible environments
- Public Delivery and Preview API content endpoints
- Distributed credential-verification cache
- Production-wide distributed abuse controls, which are revisited in Milestone 15

The initial invitation UI returns a copyable one-time invitation link. A future mail service can deliver the same link without changing invitation identity or acceptance semantics.

## Role and governance model

### Workspace membership

`workspace_membership` remains the workspace governance/discovery boundary.

- `owner`: workspace governance and implicit full access to every project in the workspace
- `collaborator`: workspace discovery only; actual project access comes from active project membership

Project invitation acceptance creates or reactivates a collaborator workspace membership when the user is not already a workspace member. Removing a user's last active project membership revokes their collaborator workspace membership. Workspace owners are never downgraded by project workflows.

The current product has no workspace-owner removal or transfer endpoint. The existing creator-owner therefore remains protected. Any future ownership transfer must atomically preserve at least one active workspace owner.

### Project roles

The initial project role registry is:

- `owner`
- `developer`
- `content_admin`
- `editor`
- `reviewer`
- `client_editor`
- `read_only`

Project creation atomically creates an explicit owner project membership for the creator. Existing projects are backfilled with an owner membership for `project.created_by_user_id` during the developer-controlled migration.

Workspace owners have an implicit effective project role of `owner`, even if an inconsistent project-membership row is missing. The explicit project-owner row remains required for project governance, handover, listing, and last-owner checks.

### Initial action registry and presets

The policy service uses schema-backed action literals, not message strings or TypeScript enums. The initial registry includes current M3 actions and future CMS actions needed to make role behavior testable before content tables exist:

- `project.read`
- `project.update`
- `project.archive`
- `project.capability.manage`
- `project.member.read`
- `project.member.invite`
- `project.member.role.update`
- `project.member.remove`
- `project.credential.read`
- `project.credential.issue`
- `project.credential.rotate`
- `project.credential.revoke`
- `locale.read`
- `locale.manage`
- `schema.read`
- `schema.write`
- `schema.publish`
- `content.read`
- `content.write`
- `content.review`
- `content.publish`
- `webhook.read`
- `webhook.manage`

Preset intent:

| Role                  | Initial policy intent                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner                 | All registered user actions                                                                                                                                  |
| Developer             | Project read/update/capability, member read, credential management, locale/schema/content/webhook development actions; no project archive or member mutation |
| Content administrator | Project read, locale/schema read, content read/write/review/publish                                                                                          |
| Editor                | Project read, locale/schema read, content read/write                                                                                                         |
| Reviewer              | Project read, locale/schema read, content read/review/publish                                                                                                |
| Client editor         | Project read, locale/schema read, content read/write; later milestones add explicit collection/field/locale restrictions                                     |
| Read only             | Project, locale, schema, and content read only                                                                                                               |

Only owners can invite, change roles, remove members, or archive a project. Owners and developers can manage credentials. This follows least privilege while preserving the developer's integration responsibilities.

### Default-deny policy context

A policy request contains:

- Subject kind (`user` or `credential`) and stable subject identifier
- Workspace, project, and optional environment identity
- Resource kind and stable resource identity when available
- Schema-backed action
- Optional collection, entry, field, locale, and publication-state context

A decision is denied when:

- The action is unknown
- Required scope context is missing
- Workspace/project/environment identities do not match
- Membership is absent or removed
- The role does not grant the action
- A future resource restriction is present and does not match
- A credential family or scope does not allow the action

Deny overrides allow. Missing and unknown policy data never becomes an implicit allow.

### Non-enumeration behavior

- A caller with no active relationship to a project receives the same `NOT_FOUND` response as a nonexistent project.
- A known active project member who lacks an action receives `FORBIDDEN`, enabling a useful permission-denied UI without exposing foreign tenants.
- Invitation lookup requires the one-time token and matching authenticated email; token failure does not reveal project or email existence.
- Credential verification returns one generic invalid-credential result for malformed, unknown, expired, revoked, wrong-family, wrong-scope, and wrong-secret cases, except that rate limiting returns the standard typed rate-limit failure.

## Invitation model

### Secret and link format

Invitation creation generates 32 cryptographically random bytes and encodes them with unpadded base64url. Only a SHA-256 digest is stored. The raw token is returned once in the creation result and never appears in list/get responses, logs, traces, metrics, audit rows, or database fields.

The copyable link places the token in the URL fragment, for example:

```text
/invitations/accept#token=<one-time-token>
```

Fragments are not sent in HTTP requests or Referer headers. The client reads the fragment and submits the token in an application request body, which existing logging rules prohibit from being recorded.

### Email identity

Invitation emails are trimmed, NFC-normalized, lowercased, length-bounded, and validated at the application boundary. Acceptance requires a signed-in Better Auth user whose canonical email equals the invitation email. The flow does not query whether a user exists at invitation time, avoiding account enumeration.

### Lifecycle

Invitation states are `pending`, `accepted`, `revoked`, and `expired`. Expiration is determined by `expires_at`; repository workflows transition elapsed pending invitations to `expired` before re-invitation or other state changes. The initial expiry is seven days.

- One pending invitation per project and canonical email
- Accepted/revoked/expired tokens cannot be reused
- Revocation is owner-only
- Acceptance atomically creates/reactivates the workspace collaborator membership, creates/reactivates exactly one project membership, marks the invitation accepted, and writes audit events
- Concurrent acceptance has exactly one state-changing winner and never creates duplicate logical memberships
- Re-invitation after revocation/expiry creates a new token and invitation identity

Invitation inspection reveals only safe project/inviter display metadata after the token and current user email are validated.

## Membership model

A project membership is a stable `(project, user)` identity with:

- UUIDv7 membership ID
- Workspace and project scope
- Better Auth user ID
- Role
- Positive optimistic version
- Creator and timestamps
- Optional removal actor/time

The unique `(project_id, user_id)` constraint prevents duplicate logical memberships. Re-invitation reactivates the existing row in a transaction rather than creating another identity.

Role updates and removals:

1. Resolve the actor's effective role without revealing foreign projects.
2. Require the owner action.
3. Lock the project row so concurrent owner mutations serialize consistently.
4. Re-read the target membership and active-owner count.
5. Reject stale versions and any transition that would remove/demote the last explicit active project owner.
6. Persist the mutation and audit event atomically.

Removal revokes access immediately but preserves the membership row and immutable audit history. Self-removal follows the same last-owner rule.

## Credential model

### Families

Credential family is immutable:

- `management`: authenticated programmatic authoring/integration operations
- `delivery`: published delivery reads only
- `preview`: authenticated draft/revision preview reads only

A delivery key can never authorize draft or management work. A preview key can never authorize management mutations or production delivery. No credential can issue credentials, manage members, archive projects, or impersonate a user.

### Environment binding

Every credential row stores and foreign-key-enforces workspace, project, and environment IDs. Verification derives scope from the credential row; request parameters never choose or widen the credential's tenant/environment.

### Scope registry

Scopes use schema-backed string literals and normalized relational rows. Family allowlists reject incompatible scopes at issue time and verification time.

Initial management allowlist:

- `project.read`
- `project.update`
- `project.capability.manage`
- `locale.read`
- `locale.manage`
- `schema.read`
- `schema.write`
- `schema.publish`
- `content.read`
- `content.write`
- `content.review`
- `content.publish`
- `webhook.read`
- `webhook.manage`

Delivery has only `delivery.read`; preview has only `preview.read`.

Issuing any credential requires `project.credential.issue`. Management scopes are additionally limited to the intersection of the requested scopes, the management-family allowlist, and the issuer's own role permissions. Delivery and preview credentials receive only their fixed family scope after the issuer is authorized to create that family. Unknown scopes, incompatible scopes, and empty scope sets are rejected.

### Secret format and storage

The displayed key contains a recognizable family prefix, the credential UUID, and a 32-byte random secret:

```text
ffd_mgmt_<credential-id>_<base64url-secret>
ffd_del_<credential-id>_<base64url-secret>
ffd_prev_<credential-id>_<base64url-secret>
```

The parser has strict length and character bounds before any database access. The database stores:

- Credential metadata and stable UUID
- Family and environment scope
- A safe display prefix/start fragment
- SHA-256 digest of the complete key
- Expiration and revocation state
- Creator/rotator/revoker metadata
- Relational scope rows

The raw key is returned exactly once after issue/rotation. SHA-256 is appropriate because the secret has 256 bits of cryptographic entropy and is not user-chosen. Equality is checked with a constant-time byte comparison after an O(1) primary-key lookup.

### Issue, revoke, and rotate

- Issue creates metadata, scopes, and audit event atomically, then returns the raw key once.
- Revoke conditionally marks an active key revoked and writes the audit event in one transaction.
- Rotate conditionally creates a successor with the same family/environment/scopes, revokes the predecessor immediately, links the successor to its predecessor, and writes one rotation audit event in one transaction.
- Optimistic versions make concurrent revoke/rotate deterministic; one mutation wins.
- Verification always reads current database state in M3, so revocation is immediate without a cache window.
- List/get responses never contain the digest or raw key.

The UI defaults to a 90-day expiry and requires an explicit acknowledgement for a non-expiring key. The database supports nullable expiry because deployment needs differ; policy can tighten this later without changing key identity.

### Invalid-attempt limiting

A focused Effect `CredentialAttemptLimiter` uses a bounded in-memory fixed-window map keyed by a non-reversible source fingerprint. It limits repeated malformed or invalid keys before unbounded database work, caps retained entries, expires old entries, and can be replaced by a distributed Layer in production hardening.

The initial behavior is intentionally process-local and documented; it is sufficient for deterministic M3 behavior but not presented as the final multi-instance production control. Metrics use only bounded result/family labels and never source, credential, project, or key values.

## Database changes

### Extend `workspace_membership`

- Expand role check to `owner | collaborator`
- Add positive `version`
- Add nullable `revoked_at` and `revoked_by_user_id`
- Add consistency checks for revocation fields
- Replace the user-list index with an active-membership partial keyset index
- Preserve unique `(workspace_id, user_id)`

Existing owner memberships remain valid.

### Add `project_membership`

- UUIDv7 primary key
- Composite workspace/project foreign key
- Better Auth user foreign key
- Role and positive version
- Created-by user
- Nullable removal actor/time
- Created/updated timestamps
- Unique `(project_id, user_id)`
- Composite unique identity for future scoped references
- Active user/workspace/project list indexes
- Active owner lookup index
- Role and lifecycle consistency checks

### Add `project_invitation`

- UUIDv7 primary key
- Composite workspace/project foreign key
- Canonical email
- Role and positive version
- Unique SHA-256 token digest
- `pending | accepted | revoked | expired` status
- Inviter, optional accepter/revoker, expiry, and lifecycle timestamps
- Partial unique pending `(project_id, email)` index
- Project status/timeline keyset index
- Lifecycle consistency checks

### Add `api_credential`

- UUIDv7 primary key
- Composite workspace/project/environment foreign key
- `management | delivery | preview` family
- Name and safe display prefix
- Unique SHA-256 key digest
- Positive version
- Optional expiry
- Optional predecessor credential ID for rotation lineage
- Creator and optional revoker/time
- Created/updated timestamps
- Active project/environment/family keyset index
- Lifecycle and expiry checks
- Composite unique tenant identity for scope rows

### Add `api_credential_scope`

- Credential/workspace/project/environment composite foreign key
- Schema-backed scope string
- Composite primary key `(credential_id, scope)`
- Database check for the centralized initial scope registry

### Extend `audit_event`

Allow `actor_type` values `user` and `credential`. M3 mutations are user-initiated, but this permits later credential-authenticated CMS operations to remain auditable without another actor-model migration.

### Backfill requirement

The migration must backfill one active owner `project_membership` for every existing project using `project.created_by_user_id`. This data backfill must be present in the developer-controlled migration and inspected carefully before application. The agent will not generate or apply the migration and will edit developer-generated migration SQL only after explicit developer instruction.

## Repository and Effect architecture

Focused services:

- `PolicyService`: pure default-deny role/family/context decisions
- `AccessRepository`: membership/invitation persistence and scoped access resolution
- `CredentialRepository`: credential metadata, scopes, transactions, and verification lookup
- `SecretGenerator`: cryptographic token/key generation and digest/constant-time verification, replaceable in tests
- `CredentialAttemptLimiter`: bounded attempt control, replaceable in tests

Business workflows use named `Effect.fn` operations and depend on services rather than constructing implementations. Live Layers are composed once into the existing shared ManagedRuntime. Promise and crypto boundaries translate foreign failures into typed application/infrastructure errors. Expected invalid tokens/keys remain typed failures; defects and interruption remain distinct.

Existing `PlatformRepository` methods will no longer hardcode `workspace_membership.role = owner` for every project operation. They will resolve effective access and apply the policy service while preserving one scoped transaction/query path and non-enumeration behavior.

## API contracts

Application-owned procedures retain the standard response union and HTTP semantics. Implemented procedure groups:

- `platform.projects.access.current`
- `platform.projects.members.list`
- `platform.projects.members.updateRole`
- `platform.projects.members.remove`
- `platform.projects.invitations.create`
- `platform.projects.invitations.list`
- `platform.projects.invitations.inspect`
- `platform.projects.invitations.accept`
- `platform.projects.invitations.revoke`
- `platform.projects.credentials.issue`
- `platform.projects.credentials.list`
- `platform.projects.credentials.rotate`
- `platform.projects.credentials.revoke`

Lists use bounded opaque keyset cursors. Mutations use expected versions where stale concurrent state matters.

New centralized public error codes are expected for safe UX and program logic:

- `INVITATION_CONFLICT`
- `INVITATION_INVALID`
- `LAST_OWNER_REQUIRED`
- `CREDENTIAL_INVALID`

Existing `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `RATE_LIMITED`, and infrastructure errors remain in use. Public errors never distinguish the sensitive reason a token/key failed.

## Audit and observability

Initial audit actions:

- `project.invitation.created`
- `project.invitation.revoked`
- `project.invitation.accepted`
- `project.membership.created`
- `project.membership.reactivated`
- `project.membership.role.updated`
- `project.membership.removed`
- `project.credential.issued`
- `project.credential.rotated`
- `project.credential.revoked`

Audit rows contain stable scope/actor/resource/request/time data only. They never contain invitation email, role-change payloads, token/key material, digests, names, scopes, request bodies, or content.

Named spans cover invitation, membership, policy, credential lifecycle, and credential verification operations. Safe span attributes may include stable workspace/project/environment/resource IDs and bounded role/family/action values. Logs do not include email addresses or secrets. Metrics use bounded labels for action, role/family, decision/outcome, and status family; they never use tenant/resource IDs or user-provided names.

## UI and UX

Project detail gains permission-aware settings surfaces for members and API credentials.

### Members

- Role descriptions explain capabilities before invitation or role change
- Owner-only invite dialog validates email and role
- One-time invitation link dialog supports copy and explicit close acknowledgement
- Pending/expired/revoked invitation states are textual, not color-only
- Member list shows role and status with bounded pagination
- Role update/removal confirmations explain immediate access impact
- Last-owner failures provide a direct, safe explanation
- Non-owner controls are absent in UI but remain enforced server-side

### Invitation acceptance

- A dedicated authenticated route reads the fragment token client-side
- Logged-out users are directed to sign in without placing the token in server logs or query parameters
- Email mismatch, expiry, revocation, and invalid tokens share safe failure feedback
- Successful acceptance navigates directly to the project

### Credentials

- Family descriptions make management/delivery/preview boundaries explicit
- Scope choices are constrained by family and actor permission
- Raw key appears once in a modal with copy action and acknowledgement
- Closing resets mutation state so the secret is not retained in ordinary UI state
- Lists show name, family, safe prefix, scopes, created/expiry/revocation state, and never hashes
- Rotation warns that the old key stops immediately
- Revocation is destructive and confirmed

Before implementing UI components, the shadcn CLI must inspect current project context and fetch documentation for every new shared component. TanStack Query uses hierarchical keys, bounded infinite queries, and targeted invalidation. Router search/hash handling is validated and secrets are never put in query-cache keys. Accessibility tests cover keyboard operation, labels, dialog titles, error summaries, focus, and non-color status.

## Decision-standard review

### Product-goal alignment

The design gives developers controlled collaboration and integration credentials while keeping one backend-agnostic project/environment model. It prepares the same stable resources for future CMS and visual-site capabilities without migration or competing auth-owned organizations.

### Correctness

Database constraints, canonical schemas, composite tenant foreign keys, optimistic versions, project-row locking, unique logical memberships, one-time token digests, and atomic audit writes protect invariants under retries and concurrency.

### Security

Default deny, least-privilege presets, non-enumeration, strict family separation, environment binding, no user impersonation, high-entropy secrets, digest-only storage, one-time display, immediate revocation, bounded attempts, safe URL fragments, server-side enforcement, and secret-free observability reduce privilege escalation and leakage risk.

### Reliability

Short transactions, deterministic concurrency winners, no credential cache in M3, stable Layer composition, typed failures, explicit lifecycle states, and rollback/failure-injection tests prevent partial membership, invitation, credential, or audit state.

### Performance

Authorization and credential verification use indexed O(1) lookups; lists use keyset pagination; partial/composite indexes match active membership, invitation, and credential query paths; queries select bounded projections and avoid N+1 access.

### UX

Role descriptions, safe non-enumerating errors, direct permission feedback for known members, copyable invitation links, one-time secret acknowledgement, status text, confirmations, and direct post-accept navigation make sensitive workflows understandable without exposing implementation controls.

### DX

Schema-backed literals, branded IDs, generated oRPC/OpenAPI contracts, stable credential prefixes, family-specific scopes, typed Effect errors, and replaceable test Layers make integrations discoverable and hard to misuse.

### Observability

Meaningful spans, immutable audit events, bounded metrics, request correlation, and structured redacted logs diagnose access decisions and abuse without recording emails, keys, tokens, scopes payloads, or content.

### Maintainability and future compatibility

First-party boundaries avoid duplicate tenant models. Code-owned presets and an explicit policy context are simpler than a premature policy DSL, while stable project/environment/resource IDs and normalized scopes leave clear extension points for locale, collection, field, publication, and visual-binding policies.

## Test plan

### Pure/property/contract

- Every role/action pair has explicit allow/deny expectations
- Unknown actions and missing context always deny
- Deny overrides allow
- Credential family/scope intersections cannot escalate
- Delivery and preview permissions are disjoint from management
- Email normalization and invitation token parsing boundaries
- Key generation entropy/format, strict parser, digest determinism, and constant-time comparison behavior
- New IDs, roles, actions, scopes, lifecycle states, cursor round trips, and error/status mappings
- OpenAPI representation and response-envelope invariants

### Effect service tests

- Replaceable policy, repository, secret generator, limiter, clock, logger, and telemetry Layers
- Expected failures versus defects/interruption
- No repository call after malformed subject/token/key input
- Permission denial and non-enumeration decisions
- Limiter expiry, cap, and rate-limit behavior with TestClock
- Secret-bearing results never reach logs/metrics

### PostgreSQL integration

- Project creation atomically adds owner membership
- Developer-controlled migration backfill covers every existing project exactly once
- Invitation create/revoke/accept atomicity and rollback injection
- Concurrent invitation acceptance creates one membership and one accepted state
- Reuse, expiry, email mismatch, cross-project, and cross-workspace denial
- Membership reactivation without duplicate identity
- Concurrent owner demotion/removal never leaves zero active project owners
- Immediate access loss after removal
- Credential metadata/scope/audit atomicity
- Credential digest only at rest and raw key absent from every persisted/logged field
- Concurrent rotate/revoke produces one winner
- Revoked/expired/wrong-family/wrong-environment/wrong-scope keys fail
- Cross-tenant composite constraints
- Representative `EXPLAIN` assertions for active lists and verification lookups

### API

- Anonymous denial for every management procedure except authenticated invitation inspection/acceptance, which still require a session
- Owner/developer/other-role matrix for every endpoint
- Foreign and nonexistent resources have matching non-enumerating responses
- Known members receive `FORBIDDEN` for denied actions
- Validation, conflict, last-owner, rate-limit, request-ID, and retryability contracts
- Extra request fields cannot widen role, project, environment, family, or scopes
- List cursors reject tampering/filter mismatch and avoid duplicates/skips

### UI/accessibility

- Invite, inspect, accept, role change, removal, issue, one-time reveal, rotate, revoke, denied, empty, pending, and failure states
- Secrets do not enter URL query parameters, query keys, toasts, or persistent storage
- Keyboard/focus behavior and automated axe checks for every dialog and acceptance state
- Permission-aware controls and direct API bypass denial
- Responsive member/credential lists without request waterfalls

## Implementation validation

- Existing and new project operations resolve active workspace/project access and apply the default-deny policy; collaborator workspace discovery no longer depends on owner-only SQL checks.
- Project creation inserts the explicit owner membership and audit event in the same transaction.
- Invitation acceptance serializes on the authenticated user, preserves stable workspace/project membership identities, and performs all lifecycle and audit writes atomically.
- Owner mutations lock the project; cross-project collaborator removals additionally lock the workspace membership so concurrent removals cannot leave stale workspace discovery access.
- Credential verification performs strict parsing before an indexed lookup, checks a SHA-256 digest in constant time, enforces current database lifecycle/environment/family/scope state, and records only bounded outcomes.
- Keyset list queries explicitly match the indexes' `DESC NULLS LAST` ordering; representative PostgreSQL `EXPLAIN` assertions cover active members, invitation timelines, credential verification, and active credential families.
- The web application hides unavailable controls based on `platform.projects.access.current`, but every permission remains enforced by the API and repository.
- Invitation tokens remain in URL fragments through sign-in and are cleared from history after client recovery; tests prove generated links have no query parameter.
- One-time invitation links and credential keys require acknowledgement before their dialogs close and are cleared from mutation state afterward.
- `pnpm run ready` passes with 381 tests across 28 files. API/domain coverage is 93.62% statements and 81.85% branches; server and web production builds pass.
- Read-only database verification after the complete test run reports two expected active owner memberships, zero projects without an owner, zero invitations, zero credentials, and zero leaked test audit rows.

The process-local credential attempt limiter remains an explicit M3 limitation; distributed abuse control and production telemetry backend deployment remain deferred to Milestone 15 as designed.

## Database gate

Proposed migration name:

```text
add_memberships_policies_credentials
```

The developer approved this design and generated `0002_add_memberships_policies_credentials.sql`. The agent inspected the migration without applying it. The generated structural DDL matches the approved schema, and, after explicit developer authorization, the agent added the required existing-project owner-membership data backfill after the `project_membership` foreign keys and before its indexes:

```sql
INSERT INTO "project_membership" (
  "workspace_id",
  "project_id",
  "user_id",
  "role",
  "created_by_user_id",
  "created_at",
  "updated_at"
)
SELECT
  "existing_project"."workspace_id",
  "existing_project"."id",
  "existing_project"."created_by_user_id",
  'owner',
  "existing_project"."created_by_user_id",
  "existing_project"."created_at",
  "existing_project"."updated_at"
FROM "project" AS "existing_project";
--> statement-breakpoint
```

The agent re-inspected the edited SQL: the insert creates exactly one active owner membership per existing project, carries the project's workspace and creator identities through the tenant/user foreign keys, preserves project timestamps, relies on database-generated membership IDs/default versions, and builds the query indexes after the backfill. The developer applied the migration successfully. A read-only verification confirmed all four access tables exist and every existing project has exactly one active owner membership. The agent did not generate, apply, push, or execute the migration.
