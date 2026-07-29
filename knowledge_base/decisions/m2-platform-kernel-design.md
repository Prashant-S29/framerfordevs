# Milestone 2 platform-kernel design

**Status:** Implemented and manually approved; awaiting developer commit  
**Date:** 2026-07-29

## Decision summary

Milestone 2 will establish a workspace-owned, tenant-scoped project kernel without making projects permanent CMS projects. It will use PostgreSQL 18 UUIDv7 identifiers, explicit relational capability state, one atomically-created internal `main` environment, owner membership, immutable audit events, optimistic concurrency for mutable resources, and bounded keyset pagination.

This design intentionally keeps full project membership, invitations, roles, policies, and credentials in Milestone 3, and locale defaults in Milestone 4.

## Scope boundaries

### Included

- Workspace creation and owner membership
- Workspace listing for the authenticated user
- Project creation, read, listing, editing, and archive
- Explicit CMS capability enablement
- Internal primary environment with immutable key `main`
- Stable branded platform IDs
- Audit-event persistence for every platform mutation
- Tenant isolation, cursor pagination, optimistic concurrency, and supporting indexes
- oRPC management contracts and the initial project-management UI

### Deferred

- Project invitations and project-scoped memberships
- Role/policy evaluation beyond the workspace-owner foundation
- Credentials
- Locale rows, including required `en`
- Capability disablement and dependency-aware transitions
- Project restore and permanent deletion
- User-visible additional environments

A workspace is not created implicitly during sign-up. An authenticated user explicitly creates one, and the creator becomes its owner in the same transaction.

## Stable identifiers

Platform resources use PostgreSQL 18's built-in `uuidv7()` as their database default:

- `WorkspaceId`
- `WorkspaceMembershipId`
- `ProjectId`
- `EnvironmentId`
- `ProjectCapabilityId`
- `AuditEventId`

The IDs are time-ordered for index locality, non-sequential from a client perspective, immutable, and represented by separate Effect Schema branded UUID types in application code. Better Auth user IDs remain Better Auth-owned text identifiers and receive a separate branded application type.

## Database model

All new timestamps use `timestamp with time zone`. Mutable rows use an integer `version` beginning at 1. Names and keys have both application validation and database checks.

### `workspace`

- `id` UUIDv7 primary key
- `name` varchar(100), trimmed, non-empty, no control characters
- `version` positive integer
- `created_by_user_id` Better Auth user foreign key
- `created_at`, `updated_at`

Workspace names are not globally unique. A user may own multiple workspaces.

### `workspace_membership`

- `id` UUIDv7 primary key
- `workspace_id`
- `user_id`
- `role` (`owner` is the only M2 value)
- `created_at`
- Unique `(workspace_id, user_id)`

The creator's workspace and owner membership are inserted atomically. Membership mutation is deferred to M3.

### `project`

- `id` UUIDv7 primary key
- `workspace_id`
- `name` varchar(100)
- `key` varchar(63), lowercase kebab-case
- `description` nullable varchar(500)
- `version` positive integer
- `created_by_user_id`
- `archived_at`, `archived_by_user_id` nullable
- `created_at`, `updated_at`
- Unique `(workspace_id, key)` across active and archived projects
- Composite tenant identity `(id, workspace_id)` for scoped foreign keys

A project key is immutable and remains reserved after archive. This prevents an archived project's developer-facing identity from being silently reused.

### `environment`

- `id` UUIDv7 primary key
- `workspace_id`, `project_id` with a composite tenant foreign key
- `key` varchar(63)
- `name` varchar(100)
- `is_primary` boolean
- `created_by_user_id`
- `created_at`
- Unique `(project_id, key)`
- At most one primary environment per project
- A primary environment must have key `main`

Project creation inserts one environment with key/name `main` and `is_primary = true` in the same transaction. Environment mutation is not exposed in M2.

### `project_capability`

- `id` UUIDv7 primary key
- `workspace_id`, `project_id` with a composite tenant foreign key
- `key` varchar(63)
- `status` (`enabled` or `disabled` storage vocabulary)
- `version` positive integer
- `changed_by_user_id`
- `created_at`, `updated_at`
- Unique `(project_id, key)`

Capability keys remain relational text rather than a PostgreSQL enum or JSON object. The application owns a schema-backed known-capability registry, initially containing only `cms`. This allows future capabilities without project conversion or a PostgreSQL enum alteration. Unknown API keys are rejected.

M2 exposes only the transition `absent -> enabled`. Re-enabling an enabled capability and all unsupported transitions return a typed conflict. Disablement is deferred until dependency behavior is designed.

### `audit_event`

- `id` UUIDv7 primary key
- `workspace_id`
- Nullable `project_id` and `environment_id` tenant scope
- `actor_type` (`user` in M2)
- `actor_id` Better Auth user identifier stored as an immutable snapshot, intentionally not a foreign key
- `action`
- `resource_type`
- `resource_id` UUID
- `request_id` bounded to the request-ID contract
- `occurred_at`

M2 stores no arbitrary metadata or request payload in audit rows. This prevents names, descriptions, content, credentials, and secrets from being copied accidentally. Initial actions are:

- `workspace.created`
- `workspace.membership.created`
- `project.created`
- `environment.created`
- `project.updated`
- `project.archived`
- `project.capability.enabled`

Audit events have no application update/delete path. They are inserted in the same transaction as the state change.

## Mutation semantics

### Create workspace

One transaction inserts the workspace, owner membership, and both audit events. A failure commits nothing.

### Create project

One short transaction:

1. Confirms the actor owns the target workspace.
2. Inserts the project.
3. Inserts the primary `main` environment.
4. Inserts project/environment audit events.
5. Commits all state together.

CMS is not automatically enabled.

### Update project

Only `name` and `description` are mutable. The request includes the expected project version. A conditional update increments the version; stale concurrent updates return `VERSION_CONFLICT`. IDs, workspace, key, and environment identity are absent from the update contract. A no-op update does not increment the version or create audit noise.

### Archive project

Archive sets actor/time and increments the expected version. It does not cascade state changes or delete environments, capabilities, or audit history. Archived projects reject edits and capability mutations. Repeated archive is an invalid-state conflict. Restore is deferred.

### Enable capability

The API accepts only the schema-backed literal `cms`. Enabling creates the capability row and audit event atomically. Concurrent/repeated enablement yields one success and typed invalid-transition conflicts.

## Authorization and non-enumeration

- Every operation starts from the authenticated Better Auth user.
- Workspace lists join through that user's workspace memberships.
- Project lists require membership in the requested workspace.
- Direct project mutations/read use the project ID plus an actor-membership join; they do not trust a client-supplied workspace scope.
- Foreign-workspace and nonexistent direct resources return the same `NOT_FOUND` response.
- Every environment/capability query includes workspace and project scope.
- Database composite foreign keys prevent mismatched workspace/project child rows.
- M2 has only workspace owners, so all authorized M2 project mutations require `owner`.

## Validation and contracts

Effect Schema is the canonical domain/transport schema. oRPC receives `Schema.standardSchemaV1(...)` validators, preserving transformed and branded output types. A small Effect-Schema OpenAPI converter will use Effect's JSON Schema support alongside the existing Zod converter.

Boundary validation failures are converted by shared oRPC middleware into the standard application failure envelope with bounded path-aware details and the current request ID.

Input rules:

- Names: Unicode NFC, trimmed, 1–100 characters, no control characters
- Project keys: 1–63 characters, lowercase kebab-case
- Description: trimmed, at most 500 characters; empty becomes null
- Page size: default 20, minimum 1, maximum 50
- Cursor: opaque, versioned, bounded base64url keyset cursor

New centralized error codes:

- `PROJECT_KEY_CONFLICT` → 409
- `VERSION_CONFLICT` → 409
- `INVALID_STATE_TRANSITION` → 409

Unknown/malformed inputs and cursors use `VALIDATION_ERROR`; unauthorized resources continue to use non-enumerating `NOT_FOUND` where appropriate.

## Pagination and indexes

Lists fetch `limit + 1` rows and use descending keyset pagination with a stable UUID tie-breaker.

Planned indexes:

- Membership unique `(workspace_id, user_id)`
- Membership list `(user_id, created_at desc, id desc)`
- Project unique `(workspace_id, key)`
- Active-project partial index `(workspace_id, created_at desc, id desc) where archived_at is null`
- Archived-project partial index `(workspace_id, archived_at desc, id desc) where archived_at is not null`
- Environment unique `(project_id, key)` and partial unique primary-environment index
- Capability unique `(project_id, key)`
- Audit workspace timeline `(workspace_id, occurred_at desc, id desc)`
- Audit project timeline `(project_id, occurred_at desc, id desc) where project_id is not null`
- Required supporting indexes for every non-leftmost foreign-key access path

Representative `EXPLAIN` integration tests will verify the list queries use the intended indexes.

## Effect and persistence architecture

- Domain contracts and branded IDs live under `packages/api/src/contracts/platform`.
- Meaningful workflows use named `Effect.fn` operations.
- A focused `PlatformRepository` service owns Drizzle access and transactions.
- Stable Drizzle remains Promise-native inside the repository adapter and is wrapped with `Effect.tryPromise`.
- Known PostgreSQL constraint failures are translated to typed domain errors; unknown driver failures become `DatabaseFailure` without leaking SQL.
- A replaceable repository Layer supports deterministic Effect tests.
- The repository Layer joins the existing shared `ManagedRuntime`; no per-request Layer/runtime is created.
- Spans/logs carry stable workspace/project/environment IDs and request IDs, never names, descriptions, bodies, or credentials.
- Platform operation metrics use only bounded action/outcome labels.

This deliberately preserves the approved M1 stable-Drizzle boundary instead of adopting unstable Effect SQL or changing dependency versions.

## UI plan

The authenticated dashboard becomes the platform entry point:

- First-workspace empty state and accessible workspace-creation dialog
- Workspace selection
- Active/archived project views with bounded load-more pagination
- Accessible project create/edit forms
- Project detail route showing immutable key, primary `main` environment, version, archive state, and capabilities
- CMS enable action
- Destructive archive confirmation

TanStack Router loaders and TanStack Query `queryOptions` will avoid request waterfalls. Mutations use targeted invalidation/optimistic updates only where rollback is deterministic. Forms use TanStack Form and shared shadcn `Field` composition with accessible error summaries and pending states.

Before UI implementation, the shadcn CLI will be used to inspect project context, component docs, and diffs for required shared components.

## Test plan

### Pure/property/contract

- Branded ID separation and UUID rejection
- Name/key/description normalization and all length/control boundaries
- Cursor round-trip properties and malformed, oversized, wrong-version, wrong-kind, and filter-mismatch rejection
- Capability registry and transition table
- Success/failure envelope decoding and all new error/status mappings
- OpenAPI generation for Effect-backed inputs/outputs

### Effect service tests

- Test Layers for every workflow success and expected failure
- Expected failures versus defects/interruption
- No-op update behavior
- Archive and capability state-machine behavior
- Safe observability fields and bounded metrics

### PostgreSQL integration

- Atomic workspace/membership/audit creation
- Atomic project/`main`/audit creation
- Scoped constraints and foreign keys
- Same-workspace key rejection and cross-workspace key allowance
- Concurrent same-key project creation: exactly one success
- Concurrent same-version updates: exactly one success
- Concurrent CMS enable: exactly one success
- Archive preserves environment, capability, membership, and audit state
- Archived key remains reserved
- Cursor pagination has no duplicates/skips under stable test data
- Tenant isolation matrix across two users/workspaces/projects
- Audit actor/action/resource/request/time correctness and payload/secret absence
- Representative index-plan assertions

### API and UI

- Anonymous denial for every protected procedure
- Success/status/envelope/request-ID contract for every procedure
- Validation and conflict contracts
- Cross-tenant read/update/archive/capability non-enumeration
- Accessible empty, form-error, pending, success, archived, and capability states
- Targeted query invalidation and mutation failure rollback

The final handoff will run the full `pnpm run ready`, live runtime checks, and Docker validation.

## Implementation validation

The developer generated and applied `0001_create_platform_kernel.sql`; the agent inspected it and the live PostgreSQL catalog without generating or applying a migration. The approved model, constraints, partial/composite indexes, transactional workflows, Effect/oRPC contracts, and management UI are implemented.

The final automated gate passes with 163 tests across 21 files. Coverage includes property contracts, operation Layers, PostgreSQL rollback/concurrency/isolation/index plans, authenticated API contracts, non-enumeration, Docker SSR URL resolution, form validation, and axe accessibility checks. Production server/web builds and Docker health/HTTP smoke checks also pass. The developer manually verified the corrected Docker login flow and approved Milestone 2; it is now awaiting the developer commit.
