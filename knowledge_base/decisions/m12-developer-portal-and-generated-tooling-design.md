# Milestone 12 developer portal and generated tooling design

**Status:** Approved by the developer on 2026-08-22; implementation authorized subject to every documented gate

**Date:** 2026-08-22

## Decision summary

Milestone 12 will turn the committed Delivery v1, Preview v1, publication-webhook v1, and published collection-schema contracts into an explicitly allowlisted public developer surface. It will add a separate developer portal, a public Tooling API for project linking and immutable published-schema retrieval, a first-party CLI, deterministic project code generation, and release-ready SDK/CLI packages.

The design uses:

- A separate `apps/developers` TanStack Start application for `developers.<product-domain>` rather than adding public documentation to the authenticated dashboard
- One source-controlled public contract registry that explicitly names every public family, major, artifact, route, and compatibility baseline
- Canonical, byte-stable OpenAPI 3.1 and JSON Schema 2020-12 artifacts for Delivery v1, Preview v1, Tooling v1, and webhook events v1
- Existing Effect Schemas as contract authority, with explicit JSON Schema targets and deterministic canonical serialization
- A new bearer-only `/api/tooling/v1` Express boundary for CLI project discovery and published schema retrieval
- OAuth 2.1 Device Authorization for interactive CLI login, using Better Auth's official OAuth Provider integration and an audience/scope-bound public native CLI client
- Existing environment-bound `management` credentials with `schema.read` as the non-interactive CI alternative
- A public schema projection derived from the exact M6 `compileCollectionContract` authority, excluding editor layout, labels, actors, audit data, and management-only metadata
- Deterministic TypeScript types, Effect Schema validators, JSON Schema, project-specific OpenAPI, schema metadata, and a schema lock
- A framework-independent fetch SDK with explicit Delivery v1 and Preview v1 clients plus webhook verification and invalidation helpers
- SemVer package/version management through Changesets, with release-ready package tarballs and dry-run verification in M12; the first registry publication remains a separate developer-controlled gate
- Breaking-contract checks against immutable released-major baselines, plus generated-fixture compilation and protocol contract suites

The developer selected the scoped OAuth device flow over a broad Better Auth session token or management-key-only login. This requires a reviewed Better Auth 1.6.26 to aligned 1.7.x upgrade and the official `@better-auth/oauth-provider` package. The developer also selected release-ready package artifacts and publishing configuration without an automatic first npm release during M12.

The developer approved this complete design and authorized implementation on 2026-08-22. Any Better Auth or application database schema change remains behind the developer-controlled migration gate.

## Developer-documentation experience amendment — 2026-08-22

Developer manual review found that the first portal implementation satisfied public-boundary, artifact, prerender, accessibility, and bundle gates but stopped at short custom guide objects and artifact metadata pages. It did not deliver the task-oriented product learning experience required for developer adoption. The developer therefore reopened M12 and approved this amendment before milestone acceptance.

### Selected documentation architecture

- Keep `apps/developers` as the separate TanStack Start production artifact; do not introduce a Next.js, Astro, hosted-CMS, or managed-documentation application.
- Integrate the MIT-licensed Fumadocs core, UI, MDX, and OpenAPI packages into that existing application after a package/provenance and compatibility check.
- Store authored guides as source-controlled MDX with typed frontmatter and a generated navigation/page tree. The current `src/content/docs.ts` object registry is a prototype to retire after content parity.
- Make human-oriented setup, concepts, workflows, SDK, CLI, webhook, guide, troubleshooting, and product-reference content the primary portal experience.
- Keep exact HTTP operations and wire schemas in a clearly secondary `/api-reference/**` area. Fumadocs OpenAPI consumes only the canonical committed registry artifacts; it never recreates request or response schemas in MDX.
- Render webhook event variants from the canonical JSON Schema rather than manufacturing a fake REST endpoint or maintaining hand-copied payload tables.
- Keep raw immutable public artifacts under `/specs/**` and preserve byte equality with `packages/public-contracts`.
- Use only self-hosted static search/index assets. No hosted search, analytics, AI assistant, documentation CMS, remote content source, API proxy, or documentation SaaS is required.
- Prerender public content and keep the portal independent of the database, Better Auth, dashboard, and API runtime. Heavy API-reference rendering remains route-lazy.
- Disable browser request execution for Preview and Tooling. Delivery execution may be enabled only when its approved browser CORS contract and configured developer origin are proven; no documentation proxy may hold user credentials.
- Keep content portable: explanatory prose is authored, while structural facts are generated from canonical OpenAPI/JSON Schema, package exports, and command/config authorities or are covered by compiling/executable examples.

### Information architecture

The initial primary hierarchy is:

```text
Get Started
Core Concepts
Content Modeling
Delivery
Preview
SDK
CLI and Code Generation
Webhooks
Guides
Troubleshooting
Reference
API Contracts (secondary)
```

The first-success journey teaches a developer to create/configure a project, model and publish content, issue the appropriate credential, install the SDK, and retrieve one explicit-locale publication. Documentation covers only implemented public behavior; framework-specific integrations are added only with tested support.

### Amendment implementation sequence

1. Register this amendment in the M12 milestone, progress tracker, and current context; return M12 from review-ready to in progress.
2. Run a bounded Fumadocs compatibility slice in the existing TanStack Start app: one MDX route, providers/layout, Tailwind 4, static prerendering, and self-hosted static search.
3. Replace the custom shell/content registry with typed MDX collections, public-only navigation, table of contents, mobile behavior, accessible code components, and not-found handling.
4. Build the first-success journey and the complete current-product information architecture for concepts, modeling, Delivery, Preview, SDK, CLI/generation, webhooks, guides, troubleshooting, and reference.
5. Add secondary lazy API references from exact canonical artifacts and a canonical webhook JSON Schema renderer; retain `/specs/**` byte checks.
6. Generate or verify structural reference facts and compile/test documentation examples so prose does not become duplicate contract authority.
7. Re-run route/search forbidden-surface probes, links, MDX compilation, prerender, CSP, accessibility, responsive UX, bundle budgets, contract drift, complete readiness, and developer manual review.
8. Only after portal parity is proven, remove or redirect the API-server Scalar UI routes in a separately verified compatibility step; raw API-server OpenAPI routes remain machine-readable authority.

### Amendment decision-standard review

This approach aligns product onboarding with Better Auth/Next.js-style task documentation while retaining exact protocol references for advanced consumers. Canonical generated artifacts prevent schema drift; static self-hosting and closed inputs preserve security and reliability; MDX improves authoring DX and portability; Fumadocs avoids maintaining a custom documentation framework. The principal risk is fast-moving package APIs and increased CSS/client weight, controlled through exact package ownership, a compatibility slice, route-level lazy loading, package audits, build budgets, and complete portal regression tests.

## Source hierarchy and discovery

This proposal follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every rule linked by `knowledge_base/rules/index.md`
4. The M12 goal, deliverables, automated criteria, and manual review
5. Approved M1–M6 and M9–M11 decisions plus the approved test-structure decision
6. Current committed contracts, repositories, public HTTP routes, auth configuration, package exports, manifests, Turborepo configuration, generated route tree, and tests

Discovery started from clean, synchronized `main` at `f06ae1c`.

Materially relevant installed guidance was read and applied for:

- Stable Effect v3 schemas, services, Layers, typed errors, observability, testing, and shared runtime boundaries
- Better Auth configuration, protocol ownership, sessions, plugins, and environment safety
- Express route isolation, boundary validation, CORS, security headers, and centralized errors
- Security threat modeling, OAuth/device authorization, bearer handling, least privilege, supply-chain review, bounded inputs, and secret redaction
- TanStack Start/Router/Query route separation, prerendering, code splitting, type-safe navigation, and query authority
- shadcn Base UI composition and accessibility conventions
- React 19 composition and bundle/performance constraints
- Turborepo package ownership, package tasks, declared dependencies, outputs, and workspace boundaries
- Drizzle/PostgreSQL scoped reads, transactions, indexes, and migration ownership where OAuth tables are required
- Portable Text's structured JSON boundary; M12 generates contracts but does not render or convert rich text

Authoritative external research included Better Auth's Device Authorization and OAuth Provider documentation, RFC 8628, Effect v3 JSON Schema targets, JSON Schema 2020-12, OpenAPI 3.1 dialect behavior, pnpm/Changesets release guidance, npm trusted publishing/provenance, and maintained OpenAPI compatibility tooling.

Generic skills remain subordinate to repository decisions. In particular, this repository remains on stable Effect v3, keeps Drizzle Promise-native inside adapters, and never lets an agent generate or apply a migration.

## Current implementation truth and gaps

M12 extends these committed seams:

- Delivery already has a dedicated `/api/delivery/v1` Express boundary and tenant-neutral OpenAPI object.
- Preview already has a dedicated `/api/preview/v1` Express boundary and tenant-neutral OpenAPI object.
- Both public APIs are separate from dashboard oRPC, Better Auth, and the disabled-by-default management reference.
- Publication webhook events are schema-backed CloudEvents-compatible unions with Standard Webhooks-compatible raw-byte verification.
- `PublishedSchemaRevision` contains immutable recursive field definitions and a `contractHash`.
- `compileCollectionContract` already produces the renderer-independent contract excluded from layout/editor changes.
- Management credentials already support environment-bound `schema.read` and immediate revocation.
- Better Auth currently provides email/password sessions only; no device, bearer, OAuth Provider, or JWT plugin is configured.
- Published schema retrieval currently exists only as Better Auth session-protected dashboard oRPC and returns management-oriented revisions.
- No public Schema/Tooling API, CLI, public SDK, package-release workflow, schema lock, or developer portal exists.
- No release tooling such as Changesets exists.
- Existing public OpenAPI builders duplicate Effect-schema reference rewriting and currently call `JSONSchema.make` without explicitly selecting the OpenAPI 3.1 target.
- Existing OpenAPI tests lock important paths and exclusions but do not lock canonical complete artifact bytes.
- No webhook JSON Schema artifact or consolidated public contract registry exists.
- `apps/web` is the authenticated application and must not become the public developer host.

These are implementation gaps, not permission to publish internal contracts. Dashboard oRPC, Better Auth endpoints, workspace/member/credential management, draft mutation, publication mutation, metrics, readiness details, and operator surfaces remain non-public.

## Scope

### Included

- Separate public developer portal application
- Explicit public contract allowlist and immutable versioned artifact baselines
- Canonical Delivery v1 and Preview v1 OpenAPI artifacts
- Tooling v1 OpenAPI and public HTTP boundary
- Webhook event v1 JSON Schema and protocol guide
- OAuth device login for the official CLI
- User project/environment discovery for linking
- Management-credential CI authentication for direct schema retrieval
- Published project schema manifest and immutable collection-contract retrieval
- CLI `login`, `logout`, `whoami`, `link`, `schema pull`, `schema check`, and `generate`
- Deterministic TypeScript types and Effect Schema runtime validators
- Deterministic JSON Schema and project-specific OpenAPI output
- Schema lock and actionable contract drift diagnostics
- Typed Delivery/Preview client
- Webhook verification and invalidation helpers
- Framework-independent quickstarts/examples
- Changelog, compatibility, deprecation, migration, and sunset policy
- Changesets configuration, package tarball dry-runs, clean-fixture compilation, and trusted-publishing-ready workflow
- Complete security, contract, property, filesystem, HTTP, OAuth, UI, accessibility, package, and compatibility coverage

### Deferred

- Actual first npm publication; M12 stops at reviewed release-ready tarballs and configuration
- Date-based HTTP/account behavior versioning
- Delivery v2, Preview v2, webhook data v2, or Tooling v2
- Public dashboard management API or credential-management API
- Dynamic OAuth client registration
- Third-party OAuth clients beyond the single source-controlled official CLI client
- Anonymous or browser-shippable Preview credentials
- Framework-specific rendering packages or Portable Text HTML rendering
- Next.js/Vercel/Netlify/Cloudflare invalidation adapters
- Code-first schema push, scripted content writes/publication, the localhost agent-first editor, and dashboard schema-builder retirement; proposed M13 owns discovery/design only after M12 completion and explicit direction
- Visual-builder bindings and dependency manifests, owned by M16
- Production marketing/application/API/developer/operator host routing proof, owned by M15
- Production npm publication, package ownership transfer, billing, hosted package registry, and commercial licensing automation
- General arbitrary-language generators; M12 generates TypeScript, Effect Schema, JSON Schema, and OpenAPI only
- Schema-driven content migration execution

## Core invariants

1. Only source-controlled allowlisted families and majors can appear in public artifacts, portal navigation, portal search, SDK exports, or generated clients.
2. Dashboard oRPC, Better Auth protocol schemas, workspace, membership, credential-management, draft mutation, publication mutation, and operator contracts never enter the public registry.
3. Delivery, Preview, Tooling, and webhook event versions evolve independently.
4. HTTP family majors are independent of npm package SemVer.
5. A released API major cannot receive a wire- or generated-SDK-breaking change.
6. Every generated content operation requires an explicit locale in TypeScript and validates it at runtime; no fallback is generated.
7. Generated transport validators accept every valid public response, including immutable/current Delivery items and historical Preview items tied to an older schema revision. Contract-specific validators narrow to generated types only when the response revision matches a locked contract; they never label a valid older-revision response malformed.
8. Generated files and public artifacts are byte-stable for unchanged authority and contain no wall-clock timestamp by default.
9. Credentials, access tokens, refresh tokens, management keys, and webhook secrets never enter generated source, config, locks, output paths, logs, telemetry, command history, examples, or portal assets.
10. Interactive CLI tokens are audience- and scope-bound OAuth tokens. CI may use only an existing environment-bound management credential with `schema.read`.
11. The CLI never treats browser-local validation or a cached lock as authorization; the server reauthorizes every request.
12. Schema output derives only from immutable published schema revisions and enabled locale authority. Draft schema and content publications do not affect generated types.
13. Content-only publish/unpublish never reports schema/type drift.
14. A layout/help/role-only schema publication may update revision metadata while leaving generated type bytes and `contractHash` unchanged.
15. File generation plans every byte before touching the destination and leaves the prior complete output intact after any failure.
16. Public package runtime code has no React, dashboard, database, Better Auth server, Express, or application-runtime dependency.
17. Business workflows use stable Effect v3 and shared long-lived runtimes at process boundaries; no request/command-local runtime is introduced.
18. The developer controls migrations, first package publication, milestone approval, and commits.

## Public contract registry and artifacts

### Registry model

A source-controlled registry explicitly declares:

- Family: `delivery | preview | tooling | webhooks`
- Major: `v1`
- Artifact kind: `openapi | json-schema`
- Canonical source function/schema
- Canonical output path
- Public portal route
- SDK support status
- Released compatibility baseline path and digest
- Deprecation/sunset metadata, initially null

The registry is a closed typed literal map. Directory scanning, router introspection, management OpenAPI filtering, or “publish every generated schema” is prohibited.

Initial public entries:

```text
delivery/v1  -> OpenAPI 3.1
preview/v1   -> OpenAPI 3.1
tooling/v1   -> OpenAPI 3.1
webhooks/v1  -> JSON Schema 2020-12 + protocol metadata
```

Webhook endpoint-management oRPC remains excluded. The webhook artifact describes only the event envelope/data union and signature/invalidation protocol.

### Canonical generation

A private package-owned generator will:

1. Load only registry-declared canonical sources.
2. Generate Effect-backed schemas with explicit target `openApi3.1` or `jsonSchema2020-12`.
3. Normalize `$defs`/component references through one shared tested converter.
4. Reject unresolved references, duplicate operation IDs, unsupported schema nodes, non-finite values, and unknown artifact kinds.
5. Canonically sort object keys where order has no protocol meaning while preserving semantically ordered arrays.
6. Serialize UTF-8 JSON with one fixed indentation/newline profile.
7. Compute SHA-256 for each artifact.
8. Compare generated bytes with committed generated artifacts and immutable released-major baselines.

Generated artifacts live in one generated-only workspace output owned by the public-contract package. Hand edits are rejected by the drift check. The server's `/openapi.json` responses and portal static files must decode to the exact same canonical documents.

### Compatibility checks

Compatibility is evaluated in two layers:

- A repository-owned closed compatibility checker protects project-specific rules: required locale, response envelope, bodyless protocol exceptions, security scheme, no-store/cache behavior, error allowlists, webhook event IDs/types/data versions, and public-surface exclusions.
- A pinned maintained OpenAPI diff tool is used as defense in depth for standard path/parameter/request/response/schema compatibility after package/security review. Tool output never overrides stricter repository rules.

Breaking within an existing major fails CI/checks. Additive changes require changelog entries and artifact regeneration. A future major is added as a parallel registry entry; it never rewrites the predecessor baseline.

## OAuth device login and credential authority

### Selected OAuth model

The official CLI is a public native OAuth client using RFC 8628 Device Authorization:

- `token_endpoint_auth_method = none`
- One fixed source-controlled client ID
- Device-code grant plus refresh-token grant
- Requested scopes: `openid profile offline_access tooling:read`
- One RFC 8707 resource/audience for the Tooling API
- Dynamic client registration disabled
- TLS required outside tests

The CLI starts authorization only after explicit `ffd login`, displays the verification URI and user code, may open the browser only after user intent, and polls no faster than the server-provided interval. It handles `authorization_pending`, `slow_down`, denial, and expiry exactly. The approval page requires an authenticated Better Auth session, displays client/resource/scopes and matching code, warns against approving unexpected requests, and requires explicit approve/deny.

Access tokens are short-lived (proposed 10 minutes). Refresh authority has a proposed 30-day absolute lifetime, rotates on use where supported, and is revocable. Exact plugin-supported options are verified against the aligned installed Better Auth 1.7 declarations before implementation; unsupported assumptions require a design amendment rather than custom token behavior.

### Better Auth change gate

The selected design requires:

- An aligned Better Auth 1.7.x upgrade across all workspaces
- Official `@better-auth/oauth-provider` at the compatible exact range
- Required official JWT/OAuth/device plugins
- A developer-controlled auth schema migration
- Complete M0/M3/M10 auth, session, cookie, credential, CORS, and Docker regression coverage

The upgrade and package additions occur only through pnpm after approval. The agent updates schema/configuration, stops at the migration gate, and provides the exact descriptive migration name and developer commands. It never runs Better Auth or Drizzle migration generation/application commands.

### CLI token storage

- Access tokens remain in memory when possible.
- Refresh tokens are stored only in the operating system credential store through one reviewed cross-platform adapter.
- The provisional implementation candidate is `@napi-rs/keyring`; it requires dependency/provenance/install-script/binary review before addition and is not approved merely by this proposal.
- If secure storage is unavailable, persistent interactive login fails with actionable guidance. The CLI does not silently write a refresh token to plaintext JSON.
- Headless CI uses `FFD_MANAGEMENT_TOKEN` or an explicitly named equivalent environment variable and does not run interactive login.
- `logout` revokes OAuth authority when supported, removes the keychain entry, and clears only non-secret local link/cache metadata.

### Server authorization

Tooling endpoints accept exactly one of:

- OAuth access token with valid signature, issuer, audience, expiry, client, and `tooling:read` scope
- Existing `ffd_mgmt_...` credential with `management` family, exact environment scope, and `schema.read`

OAuth users are authorized through current project membership and `schema.read`. Management credentials are checked through `CredentialAuthenticator` and exact persisted project/environment scope. Delivery and Preview credentials are invalid. Supplying multiple/conflicting authorization forms is invalid.

Project discovery accepts OAuth user tokens only. A project-bound management credential may pull/check/generate directly but cannot enumerate the user's other projects.

## Tooling API v1

### Boundary

Base path:

```text
/api/tooling/v1
```

The router is mounted separately from Delivery/Preview and before management-origin CORS. Tooling v1 data routes are server/CLI-oriented: they accept originless bearer requests, ignore cookies, reject requests carrying a browser `Origin`, and emit no `Access-Control-Allow-Origin` or credentials header. Public specification/reference routes remain anonymously readable. The boundary uses fixed headers/methods, `nosniff`, request correlation, central rate limits, and the shared runtime.

### Routes

Proposed routes:

```text
GET|HEAD /projects
GET|HEAD /projects/{projectId}/environments
GET|HEAD /projects/{projectId}/environments/{environmentKey}/schema/manifest
GET|HEAD /projects/{projectId}/environments/{environmentKey}/schema/collections/{collectionKey}/revisions/{revisionId}
GET /openapi.json
GET /docs
OPTIONS on data routes returns the documented closed browser-origin denial
```

- Project/environment discovery is OAuth-user-only and bounded keyset pagination.
- Manifest and immutable revision routes accept OAuth user or exact management credential authority.
- Every list is bounded and uses signed/scope-bound public cursors where pagination exists.
- `HEAD` performs the same authentication, authorization, current-authority resolution, and rate-limit work as `GET` but returns no body.
- Tooling v1 has no browser CORS contract; data-route preflights fail without content or authorization work.

### Cache behavior

Authenticated current discovery/manifest responses use:

```text
private, no-cache
```

They support strong ETags, but authentication and current lifecycle checks occur before 304. Errors are `no-store`.

Immutable published collection-contract revisions may use private long-lived caching only after authorization; the CLI may cache by revision ID and contract hash. Public shared caching is not used because project schema metadata is protected.

### Manifest consistency

A project may contain an unbounded historical number of collections, so M12 does not return every full schema in one response.

The manifest returns bounded pages of current published collection summaries sorted by stable collection ID, plus:

- Project ID
- Environment ID/key
- Enabled locale IDs/tags in stored order
- `localeContractHash`
- Collection ID/key
- Current published revision ID/sequence
- `contractHash`
- Cursor metadata

The CLI performs a reconciled two-pass pull:

1. Read every manifest summary page.
2. Fetch each exact immutable revision contract by the listed revision ID.
3. Read the manifest summaries again.
4. Accept only when project/environment, locale hash, collection set, revision IDs, and contract hashes are identical; otherwise restart once and then return a typed concurrent-change failure.

This avoids a cross-request database snapshot claim while guaranteeing that a completed lock never silently combines an observed-before and observed-after manifest. Immutable revision fetches cannot drift.

### Public collection-contract projection

The immutable response wraps the exact canonical `compileCollectionContract` output with stable scope/revision metadata. It includes only data needed for type/runtime generation:

- Format, validation, and currency profile versions
- Collection ID and API key
- Revision ID, sequence, contract hash, and publication time
- Stable field IDs
- API keys where structurally applicable
- Kind, required state, effective localization, normalized value configuration, and recursive children

It excludes:

- Workspace ID
- Collection/field display labels and descriptions
- Editor metadata/layout and role arrays
- Schema hash and management document
- Actor/user IDs
- Change summaries/acknowledgements
- Command IDs/fingerprints
- Draft versions/heads
- Audit/outbox/publication content
- Credentials or tenant names

Integrity authority uses the existing persisted full-revision `schemaHash`; the executable schema does not persist a separate `contractHash`. For every Tooling contract read, the server reconstructs the published revision and fails closed unless its canonical full-schema hash matches the stored `schemaHash`. Only after that check may it derive the public projection and `contractHash` through the exact `compileCollectionContract` authority. This verifies a superset of the public projection while avoiding duplicate persisted authority and another migration. Any hash mismatch is a sanitized internal defect; approximate schema output is never returned.

### Limits and errors

Proposed bounds:

- Manifest page size: default 20, maximum 50 summaries
- Full collection contract: existing 1 MiB source authority plus bounded envelope
- Tooling response maximum: 1.5 MiB for one contract response
- Query string: 4 KiB
- Statement timeout: 750 ms
- Transaction idle timeout: 2 seconds
- Closed central policies:
  - `tooling.global`: 12,000 units/minute, burst 1,000
  - `tooling.user`: 600 units/minute per OAuth subject, burst 100
  - `tooling.credential`: 600 units/minute per management credential, burst 100
  - Project/environment discovery costs 1; manifest GET/HEAD costs `1 + ceil(limit / 10)`; immutable contract GET/HEAD costs `1 + ceil(canonicalBytes / 262,144)` after bounded metadata resolution

Valid OAuth users and credentials have no source bucket; malformed/invalid bearer attempts reuse the source-bound credential verification protection. Redis failure uses the existing bounded degraded-memory behavior. These proposed budgets are measured with the representative M12 fixture before handoff and require amendment if they block a valid maximum-bounded pull.

New public errors are schema-backed and allowlisted for Tooling only, including invalid/stale cursor, concurrent schema change, and oversized tooling response. Errors never echo tokens, raw cursors, user details, collection contents, schema documents, or SQL.

One content-free audit is written for each successfully authorized first manifest page. Signed continuation pages and immutable revision cache reads use diagnostic telemetry rather than multiplying immutable audit rows. The audit preserves actor kind, project/environment, action, request, and time authority without schema or locale payloads.

## Project configuration and schema lock

### User-authored config

`ffd link` creates or updates a bounded, non-secret configuration:

```json
{
  "schemaVersion": 1,
  "apiBaseUrl": "https://api.example.com",
  "projectId": "...",
  "environment": "main",
  "output": "src/framerfordevs"
}
```

The exact filename is `framerfordevs.config.json`. The CLI searches upward from the working directory to one filesystem root and rejects multiple ambiguous configs. It decodes exact JSON through Effect Schema, rejects unknown keys and unsafe/output-escaping paths, and never executes project configuration code.

Config contains no token, refresh authority, management key, webhook secret, user identity, or content.

### Lock

The canonical lock is `.framerfordevs/schema.lock.json` and contains:

- Lock format version
- Generator and SDK compatibility versions
- Tooling API family/major
- Project ID
- Environment ID/key
- Enabled locale identities/tags and locale contract hash
- For each collection: stable ID/key, revision ID/sequence, contract hash, and normalized public contract snapshot needed for offline diagnostics
- Deterministic generated-file paths and SHA-256 digests

It contains no timestamps, credentials, actors, content, labels, editor metadata, or machine-specific absolute paths.

Including the normalized public contract snapshot permits actionable offline field diagnostics by stable ID. It is bounded by the same published contracts and intentionally larger than metadata-only locks; it avoids parsing generated TypeScript to recover prior authority.

### Drift semantics

`ffd schema check` reports closed categories:

- `up_to_date`
- `metadata_only`: revision changed but contract hash/type bytes are unchanged
- `locale_additive`
- `locale_breaking`
- `schema_additive`
- `schema_potentially_breaking`
- `schema_breaking`
- `collection_added`
- `collection_removed`
- `generated_file_modified`
- `authority_changed_during_pull`

Diagnostics compare stable collection/field IDs, not display names or positions. Content-only publication changes produce no schema manifest change. Layout/help/role-only schema publication is metadata-only when `contractHash` remains unchanged.

Check exits successfully only for exact up-to-date output by default. A separate documented flag may permit metadata-only drift in CI, but it never hides breaking/type drift.

## Deterministic generator

### Outputs

`ffd generate` writes one owned output directory containing:

```text
client.ts
schema.ts
schema.json
openapi.json
metadata.json
index.ts
```

The lock remains under `.framerfordevs/`. Exact filenames are stable and source-controlled by generator format version.

- `schema.ts`: TypeScript content types and Effect Schema validators
- `client.ts`: project-bound typed client factory over `@framerfordevs/sdk`
- `schema.json`: JSON Schema 2020-12 compound document
- `openapi.json`: project-specific OpenAPI 3.1 document referencing generated collection schemas
- `metadata.json`: non-secret stable project/environment/locale/revision support matrix
- `index.ts`: explicit exports

Generated files contain a machine-owned marker where the format supports comments. JSON remains comment-free.

### Naming

- JSON property names remain exact collection/field API keys.
- Exported TypeScript symbols use deterministic PascalCase names prefixed/suffixed to avoid helper/reserved-word collisions.
- Nested symbol identity is derived from collection path plus stable field ID when humanized paths collide.
- Identical authority always produces identical names and ordering.
- No random value, wall-clock time, absolute path, host username, or local platform separator enters output.

### Field mapping

The generator covers all 18 field kinds:

- Text/email/slug/url/date/date-time/decimal -> string schemas with exact applicable constraints
- Number -> finite number, with integer/safe-integer rules where configured
- Money -> `{ amount: canonical string; currency: allowed literal union }`
- Boolean -> boolean
- Enum -> literal union of active option values
- JSON -> bounded unknown JSON value schema
- Object -> exact recursive object
- List -> bounded array of its item schema
- Reference -> branded stable entry ID; Delivery expansion is represented as ID or a nested Delivery item, with target data narrowed only when that nested item’s collection/revision matches a generated contract and otherwise retained as bounded unknown JSON
- External asset -> exact structured object with nullable metadata members
- Rich text -> strict `ffd-portable-text@1` structured document schema, never HTML

Optional fields without a configured default become optional object properties. Required fields and fields whose defaults are deterministically materialized by the selected compiler become required in generated response shapes; mixed-object parent presence follows its projected child/default rules. The generator does not invent field-level `null`; the current CMS contract represents optionality by absence. Protocol-owned nullable members—such as envelope errors, pagination cursors, and external-asset metadata—remain nullable.

Localization is represented as contract metadata and exact-locale operation authority, not as a locale map inside delivered `data`. Generated clients require a locale argument and may narrow it to the generated enabled-locale literal union.

### Delivery versus Preview validators

A current Delivery list may legitimately contain immutable publications created under older schema revisions, and historical Delivery/Preview routes may explicitly return older contracts. The generator therefore produces two layers:

- Generic transport validators accept the complete bounded public protocol and retain `data` as safe JSON when the named schema revision is not present in the lock.
- Contract-specific Delivery validators enforce the locked published field contract only when `publication.schemaRevisionId` matches that contract, because matching Delivery snapshots are strictly published values.
- Contract-specific Preview validators enforce safe structural/wire compatibility for a matching `preview.schemaRevisionId` but do not reject a protocol-valid soft-invalid draft solely for failing publishability constraints such as minimum length. The Preview response's bounded `validation` issues remain authority for that state.
- Generated client results are an explicit union of `recognized_contract` with typed data and `unrecognized_revision` with bounded unknown JSON plus the stable revision ID. They never cast an older revision to the latest type.
- Project-specific JSON Schema/OpenAPI uses a matching-revision typed branch plus an honest fallback branch for other revision IDs.
- Shared envelope/protocol metadata validators remain exact and reject contradictory `{ ok, data, error }` states.

### Atomicity and ownership

Generation has two phases:

1. Pure planning creates every output byte, validates schemas/types, formats in memory, and compiles a temporary fixture.
2. Filesystem commit writes to a same-filesystem staging directory, fsyncs where supported, swaps the owned generated directory, writes the lock through an atomic temp-file rename, and rolls back from a backup on any injected failure.

The CLI refuses to overwrite an unowned directory or a file whose prior digest differs unless the user passes an explicit reviewed force/recovery command. Ordinary regeneration never deletes unrelated files.

Repeated generation from unchanged authority must be byte-identical. Fault-injection tests cover every write/rename/rollback stage on supported platforms.

## SDK design

### Packages

Provisional release-ready package names:

- `@framerfordevs/sdk`
- `@framerfordevs/cli`

Registry ownership and final names are confirmed before the first publish, not assumed by code.

`@framerfordevs/sdk` is framework-independent and uses explicit subpath exports:

```text
@framerfordevs/sdk/client
@framerfordevs/sdk/effect
@framerfordevs/sdk/webhooks
@framerfordevs/sdk/invalidation
```

It contains no React, TanStack, Express, Better Auth server, Drizzle, database, or dashboard code.

### Client

The SDK uses standard `fetch` and accepts an injected fetch implementation/base URL for tests and non-browser runtimes. It provides explicit family-major clients:

- `deliveryV1`
- `previewV1`

Every content method requires locale. Delivery supports ID, unique, immutable, list, cursor iteration, conditional validators, and bounded expansion. Preview supports current and explicit revision selectors. The project-bound generated wrapper narrows data only for recognized locked schema revisions and returns an explicit unrecognized-revision branch otherwise. The client preserves:

- Standard success/failure envelope
- Typed public error code, details, request ID, and retryability
- HTTP status and documented protocol headers
- Bodyless HEAD/OPTIONS/304 behavior
- AbortSignal and request timeout composition without hidden unbounded retries

Pagination helpers stop on null/final cursors, reject repeated cursors to prevent loops, and surface invalid/stale cursor failures rather than silently restarting unless the caller explicitly requests restart behavior.

Preview credentials are never accepted in URL helpers and documentation warns against browser bundles. The SDK does not persist credentials.

### Effect validators

The Effect subpath exports stable Effect v3 schemas and decode helpers. `effect` is an explicit compatible peer/runtime dependency decision documented in the support matrix; versions remain aligned with repository-supported stable Effect v3. Generated validators import direct subpaths/exports and never depend on `@framerfordevs/api`.

### Webhook helpers

The webhook subpath publishes the reviewed raw-byte verifier behavior:

- Exact Standard Webhooks headers
- Active/retiring secret overlap
- Timestamp tolerance
- Constant-time HMAC comparison
- Event/body ID match
- Schema decode after signature verification
- Required injected atomic replay reservation

Node webhook helpers declare Node >=22 and operate on raw bytes. They never accept parsed/reserialized JSON as equivalent.

The invalidation subpath returns normalized system tags, semantic tags, and exact routes from a verified event. It makes no framework/cache purge claim and performs no network call.

## CLI architecture

`@framerfordevs/cli` exposes `ffd` and uses one process-owned Effect runtime. Commands are named Effect operations with typed failures and injected services for HTTP, OAuth polling, browser opening, keychain, filesystem, console, clock, and process exit mapping.

Commands:

```text
ffd login
ffd logout
ffd whoami
ffd link
ffd schema pull
ffd schema check
ffd generate
```

Rules:

- Non-interactive mode never prompts and fails with actionable machine-readable output.
- `--json` emits bounded structured results with secrets excluded.
- Errors use stable CLI codes and documented exit statuses; application logic never branches on messages.
- Tokens and credentials are redacted before any logger/console boundary.
- Debug mode still excludes headers, bodies, schema contents where unnecessary, and all secret material.
- The CLI accepts explicit API/developer origins only through validated config/flags; it never follows arbitrary schema-provided URLs.
- Network operations use HTTPS outside explicit localhost development, bounded timeouts, AbortSignal, and no unbounded retry.
- `pull` caches only immutable non-secret contracts keyed by revision/hash.
- `generate` can run after a successful reconciled pull and never silently uses stale cache when online authority was requested.

## Developer portal

### Separate application boundary

`apps/developers` is a separate TanStack Start workspace and production artifact. It does not import `apps/web`, `apps/server`, database modules, Better Auth server configuration, management router internals, or operator endpoints.

It may depend on:

- `@framerfordevs/ui`
- Generated public-contract artifacts
- Public SDK package source through declared package exports
- Build-time documentation content owned by the developer app

### Content and routes

Initial portal sections:

- Overview and public-surface/versioning policy
- Delivery v1 quickstart, guides, caching, pagination, expansion, errors, OpenAPI, and examples
- Preview v1 server-side quickstart, no-store/security guidance, selectors, errors, and OpenAPI
- Tooling/CLI login, linking, CI credentials, pull/check/generate, config, lock, and troubleshooting
- Schema/type/Effect/JSON Schema/OpenAPI generation guide
- Webhook signature verification, replay/idempotency, retries, invalidation, JSON Schema, and examples
- SDK support matrix and API reference
- Changelog, deprecation policy, major migration policy, and security guidance

Portal navigation/search are generated from an explicit documentation registry. Search indexes only public guide content and public artifact metadata. A forbidden-term/route/schema probe rejects internal contracts.

### Rendering and performance

- Public guide pages and artifact routes are prerendered/static where possible.
- No request-time database/auth dependency is required for public docs.
- Large interactive API references are route-lazy and do not enter the landing-page bundle.
- Links use semantic router links/anchors, headings are hierarchical, code blocks are keyboard usable, focus is visible, and status is not color-only.
- Content uses existing shadcn primitives before custom UI and semantic design tokens rather than raw colors.
- The portal sets an explicit CSP/referrer/security-header profile and does not embed tenant credentials or analytics payloads containing code/schema content.

M15 later proves host/ingress separation; M12 still includes application-level route inventory tests ensuring the developer app itself defines only public docs/spec/static routes.

## Versioning, changelog, deprecation, and release

### Independent version axes

- HTTP API families: explicit path major, such as `delivery/v1` and `preview/v1`
- Webhook data: explicit `data.version`, initially 1
- SDK and CLI packages: independent SemVer
- Generator/lock format: explicit format version
- Project schema revisions: immutable per-collection IDs/sequences and contract hashes

An SDK release publishes a support matrix such as:

```text
SDK 0.x/1.x -> Delivery v1, Preview v1, Tooling v1, Webhook data v1
```

An additive HTTP change may produce an SDK minor release. Fixes without public API expansion produce patch releases. Breaking SDK API changes require a SemVer major even when HTTP majors do not change.

### Deprecation

A future HTTP major runs in parallel with its predecessor. Deprecation requires:

- Public changelog entry
- Migration guide
- Notice date
- Concrete sunset date
- Support matrix update
- Portal banner and response-header policy where later approved
- Continued immutable predecessor artifact availability until sunset

No date-based per-request behavior version is introduced.

### Release-ready gate

The developer selected MIT for the first public SDK and CLI releases. Each package carries an exact MIT license file and matching package metadata; any later license change is an explicit legal/release decision rather than an incidental build change.

M12 adds Changesets as root development tooling through pnpm and package-owned build/pack checks. It produces reviewed `pnpm pack` tarballs and verifies:

- Only intended dist/types/license/readme/package metadata are present
- No source maps with secrets/internal paths, tests, fixtures, `.env`, knowledge base, migrations, or internal app code
- Package exports resolve under ESM and supported Node versions
- Clean fixture installation and compilation pass
- Production/full audits pass
- Package versions and support matrix align

Trusted publishing configuration uses short-lived OIDC and provenance where registry/repository conditions permit. Long-lived publish tokens are not committed. Actual first registry publication and trusted-publisher registration remain developer-controlled after M12.

## Effect and package architecture

Proposed workspaces:

```text
apps/developers                 public static/prerendered docs portal
packages/public-contracts      private generated public artifacts and registry-facing exports
packages/sdk                   release-ready public runtime SDK
packages/cli                   release-ready public CLI, generator kernel, and process boundary
tools/public-contracts         private artifact generation and compatibility tooling
tools/developer-tooling-tests  cross-workspace clean-fixture/package/system tests
```

`tools/public-contracts` may import the explicit `@framerfordevs/api` contract exports at build/check time and writes only generated outputs owned by `packages/public-contracts`. The generated artifact package has no runtime dependency on the application package. The CLI owns its pure schema/codegen/diff/config/lock kernel so its published tarball has no dependency on an unpublished private workspace. Dependency direction must remain acyclic and explicit.

Focused Effect services include:

- OAuth token verifier/Tooling principal
- Tooling repository
- Schema manifest/projector
- Public artifact generator
- CLI HTTP client
- Secure credential store
- Filesystem transaction
- Code generator and drift classifier

Pure generator/diff/naming/canonicalization modules import no database, Express, Better Auth, React, environment secrets, or process-global runtime.

The API server extends the shared `ApplicationLive` once with Tooling services. The CLI owns one long-lived ManagedRuntime for the command process. The developer portal is a frontend/static app and does not run business/domain Effects in browser components merely to reuse schemas.

## Database and migration gate

The Tooling schema projection itself requires no new CMS table. OAuth Provider/device authorization is expected to require Better Auth-owned tables and therefore a developer-controlled migration.

After design approval and exact Better Auth package/API inspection:

1. Add/upgrade packages with pnpm.
2. Update Better Auth configuration and its Drizzle schema authority only.
3. Stop before any generation/application command.
4. Provide a descriptive migration name, proposed:

```text
add_cli_oauth_device_authorization
```

5. Provide exact developer commands appropriate to the approved Better Auth/Drizzle workflow.
6. Inspect the complete developer-generated migration, snapshot, and journal before application.
7. If the unapplied SQL needs an agreed safety correction, follow `knowledge_base/rules/migration-rules.md`: prepare only a gitignored `tmp/migrations/` draft, require the developer to replace the real SQL manually, and reinspect the complete real artifacts.
8. Ask the developer to apply only after reinspection passes, then continue database tests only after developer confirmation.

The migration must add only reviewed OAuth/JWT/device/client/consent/token authorities required by the official plugin. It must contain no client secret for the public CLI, no tenant/content backfill, no network call, no destructive auth/session rewrite, and no migration-time package command run by the agent.

If plugin inspection shows materially broader tables/behavior or requires a Better Auth upgrade incompatible with current auth contracts, implementation stops for a design amendment.

## Security and threat model

| Threat/failure                                | Control                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Internal API accidentally published           | Closed registry, no scanning, forbidden-contract probes, separate app                                |
| OpenAPI/implementation drift                  | Canonical source generation, exact HTTP/artifact equality, released baselines                        |
| Breaking change within v1                     | Repository policy checker plus reviewed standard OpenAPI diff defense                                |
| CLI phishing/device-code interception         | RFC 8628 code match, explicit client/resource/scope approval, TLS, short expiry                      |
| Public CLI client secret extraction           | Native client uses no client secret                                                                  |
| Stolen access token                           | Short lifetime, audience/scope/issuer verification, central rate limits                              |
| Stolen refresh token                          | OS keychain only, bounded lifetime/rotation/revocation, no plaintext fallback                        |
| CI token widens project scope                 | Existing management credential persisted project/environment equality and `schema.read`              |
| Delivery/Preview key used for tooling         | Exact family/scope rejection                                                                         |
| OAuth token probes foreign tenants            | Server-side membership/policy and non-enumerating scope resolution                                   |
| Draft or editor metadata leak                 | Published contract projector from `compileCollectionContract`, explicit omission tests               |
| Generated code injection through API keys     | Strict existing key profile, AST/escaped generation, deterministic collision handling, compile tests |
| Generated file path traversal                 | Fixed allowlisted relative filenames under validated output root                                     |
| Partial/corrupt generation                    | Plan-first staging, atomic swap, rollback, fault injection                                           |
| User file deletion                            | Owned output manifest/digests and refusal on unowned/modified files                                  |
| Preview validator rejects valid invalid draft | Separate structural Preview schema from strict Delivery schema                                       |
| Locale fallback generated                     | Required locale type/runtime schema and no default branch                                            |
| Malicious remote spec/reference               | No arbitrary remote OpenAPI input; registry-local artifacts; external `$ref` rejected                |
| Webhook replay/tampering                      | Raw-byte HMAC, timestamp, event decode, injected atomic reservation                                  |
| Supply-chain compromise                       | pnpm-only additions, lock/script/provenance review, frozen install, audits, pack inspection          |
| Portal XSS                                    | React escaping, no tenant HTML, CSP, no arbitrary HTML/Markdown execution                            |
| Token/schema leakage in telemetry             | Closed redaction, no bodies/headers/tokens/paths in logs/metrics                                     |
| Package tarball leaks internals               | Explicit `files`/exports, pack-content assertions, clean fixture install                             |

## Observability and performance

Named operations/spans cover:

- OAuth device start/poll/result at the CLI boundary without codes/tokens
- Tooling token verification and policy decision
- Project/environment discovery
- Manifest listing and immutable contract retrieval
- Contract projection/hash verification
- Artifact generation/compatibility checks
- Schema pull/reconciliation/check/generate
- Filesystem plan/commit/rollback

Logs/spans may contain safe operation, family/version, subject kind, project/environment/collection stable IDs where current rules permit, bounded counts, size buckets, outcome, and duration. They exclude user/device codes, access/refresh/management tokens, Authorization, keychain values, schema bodies, API keys where unnecessary, generated source, filesystem absolute paths, webhook secrets, and content.

Bounded metrics include Tooling requests by endpoint/subject/outcome/status, OAuth verification outcome, schema response size bucket, manifest page count bucket, pull reconciliation outcome, generator duration/collection/field bucket, compatibility result, and portal route/build size budgets. No tenant, user, token, collection, locale, path, or schema hash is a metric label.

Performance gates:

- Public artifact generation is deterministic and completes within a developer-approved bounded build budget.
- Tooling manifest reads use indexed current-head/collection paths and bounded keyset pages.
- Immutable revision reads use direct scoped IDs and bounded field sets.
- Generator work is linear in bounded schema nodes/output bytes and avoids quadratic repeated serialization.
- Portal landing/guide routes exclude interactive-reference and generator bundles until requested.
- CLI has bounded HTTP concurrency, retry, polling, memory, and filesystem staging size.

No production load target is invented before implementation measurement. The design requires a deterministic representative project fixture and records baseline latency/memory/output size before approval handoff.

## Test and coverage plan

### Public registry and artifact contracts

- Registry rejects unknown family/major/kind and duplicate paths/operation IDs
- Exact initial allowlist contains only Delivery, Preview, Tooling, and webhook event contracts
- Full canonical artifact byte snapshots and SHA-256 stability
- Explicit OpenAPI 3.1/JSON Schema 2020-12 targets and resolvable references
- Server OpenAPI bytes equal committed registry artifacts
- Public docs/search/SDK contain no RPC, Better Auth, workspace, membership, credential-management, mutation, metrics, readiness, or operator contracts
- Delivery/Preview required locale, headers, errors, bodyless methods, and security remain locked
- Webhook schema/event fixtures remain byte-compatible with M11
- Breaking/additive compatibility fixtures and future-major parallel baseline behavior

### OAuth/auth/security

- Better Auth 1.7 compatibility for sign-up/sign-in/session/sign-out/cookies/CORS and all existing auth tests
- Device code/client/scope/resource/expiry/poll interval behavior
- Approval requires current session, same code/session, explicit approve/deny, and safe return flow
- Invalid client, duplicate params, expiry, denial, `slow_down`, brute-force/rate bounds, and remote-phishing copy
- JWT signature/issuer/audience/expiry/client/scope verification
- Refresh rotation/revocation/logout and old-token denial
- Dynamic clients and confidential-client assumptions disabled for the official CLI
- Keychain success/unavailable/locked/delete behavior with no plaintext fallback
- No secret in console, JSON output, process arguments, config, lock, cache, logs, traces, tests, or package files
- Management credential exact scope and Delivery/Preview/wrong-environment denial

### Tooling API and PostgreSQL

- OAuth project discovery and keyset pagination
- Management credential cannot enumerate projects
- User role and locale-access matrix for `schema.read`
- Cross-workspace/project/environment/collection/revision non-enumeration
- Archived/CMS-disabled/no-published-schema behavior
- Manifest ordering, locale hash, collection summaries, cursor scope/tamper/expiry
- Immutable revision returns exact public contract and matching hash
- Layout/label/editor-only changes absent; value-contract changes present
- Content-only publication causes no manifest/type drift
- Concurrent change during two-pass pull is detected and never accepted as coherent
- Auth before 304, exact private/no-store policies, originless CLI success, and browser-origin/preflight denial
- First-page manifest audit correctness/content absence and no continuation/cache-read audit multiplication
- Representative plans use intended collection/head/revision/field/locale indexes
- No schema migration beyond approved Better Auth OAuth authorities unless evidence forces an amendment

### Generator pure/property tests

- Deterministic naming for every allowed key/reserved word/collision/path shape
- Every field kind/configuration/default/optional/nested/list/reference/asset/rich-text mapping
- Exact decimal/money/date/date-time semantics without floating conversion
- Mixed localization and atomic list behavior
- Matching-revision Delivery strict versus Preview structural behavior, plus valid older-revision transport fallback without unsafe casting
- Locale union and required operation input
- JSON Schema/OpenAPI/Effect Schema equivalence fixtures
- Stable ordering/bytes under input object/manifest page order changes
- Field-ID-based diagnostics for add/remove/key/kind/required/localization/config changes
- Metadata-only and content-only drift behavior
- File ownership, path bounds, modified-file refusal, and every fault-injected atomic commit stage

### SDK/CLI contracts

- Delivery ID/unique/list/immutable, query encoding, expansion, HEAD/304, and cache headers
- Preview current/revision selectors, no credential URL, no-store headers, and soft-invalid decode
- Public error envelopes preserve status/code/details/request ID/retryability
- Pagination empty/final/repeated/invalid/stale cursors
- Abort/timeout and no hidden retry loops
- Webhook valid/tampered/stale/wrong-secret/duplicate/raw-body cases
- Invalidation helper exact tags/routes and no network behavior
- CLI interactive/non-interactive/JSON modes and stable exit codes
- Login/link/pull/check/generate/logout end-to-end with test OAuth/keychain/filesystem/HTTP Layers

### Portal/UI/accessibility

- Route registry contains only public docs/spec routes
- Navigation/search excludes forbidden terms/contracts
- Prerendered route and artifact reachability
- Quickstarts/examples match generated fixture and public host paths
- Mobile/desktop navigation, skip link, focus, headings, landmarks, links, code blocks, copy feedback, loading/error/not-found states
- No state conveyed only by color and automated axe coverage
- Large API reference is lazy and landing-page bundle stays within recorded budget
- CSP/referrer/security headers and no tenant/credential data in built assets

### Packaging/system tests

- Package-owned check/type/test/build/pack tasks through Turborepo
- Structure checker recognizes new workspace test ownership
- Tarballs contain only approved files and exports
- Clean temporary project installs packed SDK/CLI, runs generation, type-checks, and decodes fixtures
- ESM and Node >=22 behavior
- Changesets support matrix/version/changelog checks
- Frozen install, production/full audits, package provenance configuration review
- `pnpm run ready`, Docker/server/web/worker/developer builds, `git diff --check`, and read-only database invariants

Coverage remains behavior-led. Pure generator, lock/diff, naming, public registry, and protocol parser modules target complete deterministic branch coverage. Tooling repositories and HTTP/OAuth boundaries require explicit outcome coverage even where defensive branch percentages are not artificially inflated.

## Implementation sequence and approval gates

1. Approve this design and its M12 scope.
2. Add M12 checklist/status documentation only.
3. Inspect exact Better Auth 1.7 and OAuth Provider declarations/package provenance; confirm plugin schema and token options.
4. Add approved dependencies through pnpm and run the pre-migration auth/type/contract gate.
5. Update Better Auth/Drizzle auth schema only, then stop at the developer migration gate.
6. After developer migration confirmation, implement OAuth device flow and Tooling principal verification with complete auth regressions.
7. Implement the public contract registry and canonical artifact baselines before the portal or SDK consumes them.
8. Implement Tooling API projection/manifest/revision reads and HTTP contract tests.
9. Implement pure generator/lock/diff/filesystem transaction and deterministic fixtures.
10. Implement SDK and CLI over the approved public contracts.
11. Implement the separate developer portal from registry artifacts and compiling examples.
12. Add Changesets, release-ready pack/dry-run/trusted-publishing configuration, and clean-project tests.
13. Run complete readiness, security, package, Docker, database, performance, and manual integration gates.
14. Stop for developer manual review; do not publish, commit, or start M13 automatically.

Each tranche must preserve current Delivery, Preview, webhook, dashboard, auth, and worker behavior. A failed Better Auth upgrade, schema mismatch, public-contract leak, or need for additional CMS tables stops implementation for review.

## Decision-standard review

### Product-goal alignment

The design makes the CMS usable from developer-owned code through discoverable, versioned, strongly typed public tooling while preserving backend, renderer, and hosting independence. It uses the same stable projects, environments, locales, collection/field IDs, revisions, publications, and events required by future visual sites.

### Correctness

Immutable revision retrieval, exact contract hashes, two-pass manifest reconciliation, deterministic generation, separate strict Delivery/permissive Preview validators, stable-ID diagnostics, and immutable released baselines prevent mixed authority and silent contract drift.

### Security

Scoped OAuth device tokens, management-credential CI authority, server-side policy, exact audience/environment checks, OS keychain storage, no plaintext fallback, closed public registry, generated path/byte bounds, raw-body webhook verification, and release supply-chain gates protect credentials, tenants, consumers, and package users.

### Reliability

No draft/content state is used for code generation. Immutable contracts are cacheable, current manifests are reconciled, writes are plan-first/rollback-safe, package outputs are fixture-tested, and every external operation has bounded timeouts/retries/polling.

### Performance

Manifest pagination, direct immutable revision lookups, bounded field contracts, linear generation, static/prerendered docs, lazy references, and package-owned caches avoid unbounded API, browser, filesystem, and build work.

### UX

Developers receive an explicit login/link/pull/check/generate flow, actionable stable-ID drift diagnostics, safe CI authentication, copyable quickstarts, searchable docs, and predictable error/exit behavior.

### DX

Types, Effect validators, JSON Schema, OpenAPI, typed clients, schema locks, webhook helpers, examples, SemVer packages, and support matrices provide one coherent integration workflow without exposing dashboard internals.

### Observability

Named Effect operations, bounded metrics, stable request correlation, content-free audits, and strict redaction diagnose OAuth, Tooling API, pull, generation, and package failures without recording secrets or schema/content bodies.

### Maintainability and future compatibility

Independent family majors, a closed registry, stable schema projection, explicit package boundaries, generator formats, Changesets, parallel-major policy, and M15/M16 deferrals let APIs, SDKs, visual bindings, and deployment topology evolve without rewriting existing integrations.

## Approval requested

Developer approval authorizes these material M12 decisions:

1. A separate `apps/developers` public portal and production artifact
2. A closed public registry containing Delivery v1, Preview v1, Tooling v1, and webhook event v1 only
3. Canonical OpenAPI 3.1/JSON Schema 2020-12 artifacts and immutable released-major baselines
4. A new bearer-only `/api/tooling/v1` public family rather than using dashboard oRPC for CLI/schema generation
5. OAuth 2.1 Device Authorization for the official CLI, including an aligned Better Auth 1.7.x upgrade and official OAuth Provider integration
6. Audience/scope-bound short access tokens, bounded refresh authority, OS-keychain persistence, and management-credential CI fallback
7. User-only project discovery and user-or-management-credential schema retrieval
8. Public schema projection from exact `compileCollectionContract` authority, excluding management/editor metadata
9. Paginated manifest plus immutable revision routes and two-pass CLI reconciliation
10. The proposed config/lock formats and stable-ID drift categories
11. Deterministic TypeScript, Effect Schema, JSON Schema, project OpenAPI, metadata, and client generation
12. Separate strict Delivery and structural Preview runtime validators
13. Plan-first atomic generated-directory ownership/rollback behavior
14. Release-ready `@framerfordevs/sdk` and `@framerfordevs/cli` package shapes with final names confirmed before publication
15. Framework-independent Delivery/Preview clients and webhook verification/invalidation helpers
16. Independent API-family majors, package SemVer, support matrix, changelog, deprecation, migration, and sunset policy
17. Changesets and trusted-publishing-ready configuration with package tarball dry-runs, but no automatic first npm publication in M12
18. The proposed app/public-package/private-tool workspace ownership model and cross-workspace system-test package
19. The Better Auth OAuth migration gate with proposed migration name `add_cli_oauth_device_authorization`
20. Complete security, compatibility, generation, accessibility, packaging, and readiness gates described above

Approval does not authorize the agent to generate/apply a migration, publish npm packages, commit, or begin M13.
