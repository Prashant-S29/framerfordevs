# Product and Architecture Learnings

**Purpose:** Preserve only consequential mistakes and durable prevention rules. This is not a command log, status journal, or substitute for tests and decision records.

## Usage

- Search titles by the current task domain; do not read the file sequentially unless the task is cross-cutting.
- Add an entry only for a wrong assumption or decision that caused material rework, risk, or invariant drift.
- Keep exactly two fields: the incorrect assumption and the durable learning with its prevention rule. Add one concise `Status` line only for an unresolved limitation.

## Entry format

```text
## Date — Short title

**Incorrect assumption or decision:** What caused drift or risk.

**Learning:** The durable lesson and concrete prevention rule.
```

---

## 2026-07-28 — Repository stack must be verified before architecture decisions

**Incorrect assumption or decision:** Treating those names as canonical would have designed the CMS around a stack the repository does not use.

**Learning:** Product planning must distinguish intended product behavior from the concrete stack already checked into the repository. Architecture decisions require repository verification, not conversational assumption alone. Prevention: Before planning or changing architecture, inspect the root README, package manifests, workspace configuration, and runtime entrypoints. Record the confirmed stack in `context.md` and require an explicit developer decision before replacing it.

---

## 2026-07-28 — Research tooling must not become a runtime dependency

**Incorrect assumption or decision:** Running the research checkout unconditionally during every package installation would couple Docker/CI builds to GitHub availability, require Git in runtime build images, increase build time, and copy research-only files into build contexts.

**Learning:** Agent research infrastructure and product runtime dependencies are different concerns. Research tooling must remain reproducible for developers without entering production artifacts or critical build paths. Prevention: `.repos`, skills, and knowledge documents are excluded from Docker contexts. Container builds set `SKIP_EFFECT_SOURCE_SETUP=1`; local installs still prepare the research checkout.

---

## 2026-07-28 — CORS configuration must enforce origin denial explicitly

**Incorrect assumption or decision:** Treating a mismatched `Access-Control-Allow-Origin` response as sufficient rejection left untrusted requests executing against the server even though browsers would withhold the response.

**Learning:** CORS is not authorization, but configured browser-origin policy must still be explicit, deterministic, and tested on the server boundary. Prevention: Reject untrusted origins and preflights with HTTP 403 before route handling, omit CORS headers, and maintain tests for trusted, untrusted, preflight, and originless requests.

---

## 2026-07-29 — Stable package declarations are the executable Effect API contract

**Incorrect assumption or decision:** Treating guide/source names such as `Context.Service`, `Schema.TaggedErrorClass`, and `Schema.optionalKey` as guaranteed stable package exports caused the first implementation pass to target APIs absent from the installed stable declaration surface.

**Learning:** For a pinned stable Effect release, the installed package's public declarations and compile-time behavior are the executable contract. Guides and source remain research inputs, not permission to cross the approved stability boundary. Prevention: Keep exact aligned stable versions, inspect the installed public declarations when an API differs, compile incrementally, and use stable 3.22 equivalents (`Context.Tag`, `Schema.TaggedError`, and exact `Schema.optionalWith`) rather than changing versions speculatively.

---

## 2026-07-30 — Container health must exercise server-rendered dependencies

**Incorrect assumption or decision:** The web container used the browser-facing `http://localhost:3000` API URL during server-side rendering. Inside the web container, `localhost` referred to the web container itself. The root-only health check did not exercise authentication and therefore reported healthy.

**Learning:** Universal applications need separate public browser and internal service-discovery URLs. Container health checks must traverse a representative server-rendered dependency, not only a static or dependency-free root. Prevention: Docker supplies `INTERNAL_SERVER_URL=http://server:3000` for SSR while retaining the public Vite URL for browsers. URL resolution has dedicated tests, and the web health check now requests `/login`, which exercises the auth service dependency.

---

## 2026-07-30 — Authorization lifecycle must update discovery and serialize cleanup

**Incorrect assumption or decision:** Treating authorization as only a per-project operation guard would leave owner-only discovery queries in place, while independently removing the same collaborator from two projects could race and leave an active workspace collaborator row after the final project access disappeared.

**Learning:** Authorization includes discovery and lifecycle maintenance, not only endpoint checks. Invariants spanning multiple resources need a stable serialization point in addition to unique constraints and optimistic versions. Prevention: Workspace/project list queries resolve active effective access; project owner mutations lock the project; invitation acceptance serializes on the user; and collaborator cleanup locks the workspace membership before counting remaining project memberships. Integration tests cover collaborator visibility, immediate access loss, stable reactivation, and concurrency.

---

## 2026-08-01 — Shared browser utilities must remain runtime-light

**Incorrect assumption or decision:** Importing the helper from the Effect schema-heavy locale contract module treated a shared runtime function like a type-only contract import.

**Learning:** Shared browser/server algorithms should live in narrow dependency-free modules; schema modules may safely consume those utilities, but browser code should not import schema-heavy modules merely to reuse a pure function. Prevention: `contracts/locale-tag.ts` now owns dependency-free canonicalization. Effect locale schemas re-export it, browser validation imports the lightweight module directly, and the production client validation chunk is roughly 29 kB.

---

## 2026-08-01 — Structural BCP 47 parsing does not prove IANA registration

**Incorrect assumption or decision:** Runtime canonicalization was treated as authoritative registration validation. It validates BCP 47 structure and canonical casing/known aliases, but accepts many structurally valid unregistered language subtags.

**Learning:** Syntax, canonicalization, and registry membership are separate concerns. Stable persisted standards-based identifiers require an explicit authoritative dataset and an application-specific supported profile. Prevention: Browser and API validation now share a generated official IANA Language Subtag Registry snapshot pinned at `File-Date: 2026-06-14`. Tests reject unknown language/script/region/variant subtags, private-use/reserved ranges, extensions, and unsafe grandfathered tags; aliases come from snapshot `Preferred-Value` metadata. The API remains authoritative, and no runtime network, OS, ICU-registry, or opaque package-data lookup is used.

---

## 2026-08-01 — Idempotency keys require persisted authority fingerprints

**Incorrect assumption or decision:** The first approved database outline stored only the command ID and schema hash. That was insufficient to distinguish a genuine retry from reuse with different expected versions, published baseline, acknowledgements, or schema authority after later edits.

**Learning:** Durable idempotency needs both a unique command identity and a canonical fingerprint of every input that grants authority for the state change. Prevention: `cms_schema_revision` stores a SHA-256 command fingerprint over the scoped publication input, sorted acknowledgement IDs, expected versions/baseline, and schema hash. Replay tests must cover matching retries and incompatible reuse.

---

## 2026-08-02 — URL matching does not guarantee child-route rendering

**Incorrect assumption or decision:** A correct generated URL and route match were treated as sufficient. TanStack Router nested the builder under the project-detail component, but that page intentionally had no `Outlet`, so only the project panel rendered.

**Learning:** Route-tree composition must be verified independently from URL generation. A page-shaped route below another page-shaped path should use TanStack's non-nested trailing-underscore convention unless the parent is deliberately a layout with an `Outlet`. Prevention: The builder now lives under `$projectId_`, preserving the public URL while parenting it directly to the authenticated layout. A route-tree regression test asserts both its full path and non-nested parent.

---

## 2026-08-02 — Status summaries must reconcile knowledge documents with Git

**Incorrect assumption or decision:** The status summary repeated the stale review state instead of fully reconciling it with the recent Git log and asking only about any genuinely unresolved approval ambiguity.

**Learning:** Progress documents describe intended execution state, while Git is authoritative for repository and commit state. A reliable handoff must inspect both and explicitly reconcile differences. Prevention: `knowledge_base/rules/session-rules.md` now requires `git status` and recent `git log` inspection before status reporting and milestone handoffs. Approved milestone records must use the actual commit hash when present.

---

## 2026-08-05 — Development CLIs do not belong in the production dependency graph

**Incorrect assumption or decision:** A tool used to add or inspect source components was classified as runtime application code merely because it is associated with the UI package.

**Learning:** Source-generation and component-management CLIs are development tooling even when they live beside runtime components. Production dependency classification must be based on runtime imports and deployment needs, not package ownership. Prevention: Keep `shadcn` in `devDependencies`, verify there are no runtime imports before moving a package, run both `pnpm audit --prod` and full `pnpm audit`, and use exact patched transitive overrides only when an upstream dependency range cannot resolve a fix itself.

---

## 2026-08-05 — Hydration transitions must preserve React hook order

**Incorrect assumption or decision:** A query-backed component returned its loading state before calling all of its hooks. Loader-prefetched tests usually began with query data available, but a real hydration/refetch transition rendered first without the later hook and then with it.

**Learning:** Route-loader prefetch is an optimization, not a guarantee that client query hooks are immediately resolved. Every render path in a component must execute hooks in identical order. Prevention: Keep all hooks above loading/error returns, enforce `react-hooks/rules-of-hooks` in the workspace linter, and include cold-loading transitions when reviewing query-backed routes.

---

## 2026-08-05 — Synchronized schema editors require one atomic authoring boundary

**Incorrect assumption or decision:** Treating granular field mutations as a sufficient editing architecture would require the JSON view to execute a sequence of optimistic mutations. A failure or version conflict in the middle could leave only part of the user's schema applied, while visual and JSON state could diverge.

**Learning:** Structural schema changes require one bounded project document and one server-authoritative atomic plan/apply operation. Prevention: Authoring v1 revalidates and reclassifies the complete project candidate under database locks, reconciles server-owned stable identities, requires exact risky-change acknowledgements, and commits revisions, heads, receipts, audits, and outbox state atomically. Do not expose granular dashboard structure-mutation procedures.

---

## 2026-08-05 — UI query limits must stay inside the shared pagination contract

**Incorrect assumption or decision:** The reference selector treated a larger first-page request as a harmless way to obtain more options instead of respecting the existing bounded paginated API.

**Learning:** Every client query must use the server contract's current page bounds. Wanting more records requires explicit pagination, not a larger undocumented limit. Prevention: The initial reference collection request and its matching invalidation key now use the maximum valid limit of 50. Web type checks, all 88 web tests, the production build, and rebuilt Docker health pass; the workspace no longer contains a web request with `limit: 100`.

---

## 2026-08-08 — Schema class instances must be normalized before canonical command fingerprinting

**Incorrect assumption or decision:** The first fingerprint implementation passed those class instances directly to a canonical JSON function that intentionally treats non-plain objects as invalid. Distinct mutation payloads therefore canonicalized to the same placeholder.

**Learning:** Command fingerprints must canonicalize the transport/document representation, not runtime wrapper identity. Decoded class instances require deterministic conversion to plain JSON before hashing. Prevention: Entry create/save/restore fingerprints now JSON-normalize their schema-decoded input before canonical hashing. PostgreSQL integration reuses command IDs with changed locale and mutation authority and requires `EntryCommandConflictFailure`.

---

## 2026-08-08 — Page-shaped editor routes must not be nested under pages without outlets

**Incorrect assumption or decision:** Matching URL hierarchy was treated as sufficient route composition even though the entry-list page does not render an `Outlet`.

**Learning:** TanStack route URL hierarchy and component nesting are separate decisions. Dedicated page workspaces need the trailing-underscore non-nested convention whenever their URL parent is another page rather than a layout. Prevention: The editor uses `entries_/$entryId.tsx`, preserving `/entries/$entryId` while parenting it directly under the authenticated layout. The route-tree regression test asserts schema, entry list, and editor parent/full-path behavior.

---

## 2026-08-09 — Internal stable identities need an explicit validation projection

**Incorrect assumption or decision:** Passing stable-ID-shaped nested values directly to the API-key-shaped validator worked for scalar roots but treated valid object children as unknown or missing.

**Learning:** Stable persistence identity and user-facing/schema validation shape are separate representations. Their boundary must be an explicit recursive projection, not an implicit shared object convention. Prevention: Entry validation now recursively projects stable field-ID objects to current API-key-shaped values before applying the existing validator, while storage, mutations, authorization, and revision history remain stable-ID-based. PostgreSQL integration covers shared and localized children inside one mixed object.

---

## 2026-08-09 — Editor defaults and hydration must follow persisted partition state

**Incorrect assumption or decision:** Generic form-default projection and React state updates were treated as sufficient without tying defaults to head version or seeding the rich-text editor's own history state.

**Learning:** Defaulting is a versioned persistence-boundary rule, not a generic missing-value rule. Controlled third-party editors may also require explicit initialization of their internal state rather than only an external value prop. Prevention: Defaults project only when the relevant shared or exact-locale partition is version `0`; any persisted version suppresses reapplication. Portable Text initializes editor history from the saved document and remounts at the draft boundary. Focused tests cover recursive mixed-object defaults, clear-value preservation, and saved-document hydration.

---

## 2026-08-09 — Expected optional-resource absence should not be fetched as an error

**Incorrect assumption or decision:** A handled 404/409 response was treated as harmless because the final empty state was correct. The global query error handler nevertheless surfaced three alarming retry toasts for an expected collection lifecycle state.

**Learning:** When parent metadata already exposes optional child availability, route/query planning should use that state and avoid requesting a child known not to exist. Direct child endpoints may retain correct 404 semantics for genuine callers. Prevention: The entry workspace reads the collection’s `currentPublishedRevisionId` first and enables/prefetches the published form and entry page only when present. The locale-neutral list no longer loads an unused value contract and returns an empty page before publication. Publication invalidates collection metadata so the gate cannot remain stale.

---

## 2026-08-09 — Configuration defaults need the same semantic editor as field values

**Incorrect assumption or decision:** Treating every structured default as generic JSON made implementation convenient but required users to know internal document syntax and surfaced JSON parser failures for ordinary prose. Separately, passing decoded class-backed defaults directly to a validator that intentionally accepts only inert plain JSON confused a trusted runtime wrapper with invalid content. The same audit found single-line long-text defaults, plain-text date-time defaults, and untyped object/list root JSON.

**Learning:** A field’s configuration default is still a value of that field. Its authoring control should reuse or match the semantic value editor; raw JSON is appropriate only where JSON itself or an arbitrary structured boundary is the product contract. Prevention: Rich-text defaults now opt into the lazy official editor and store canonical Portable Text directly; its styles, decorators, and lists follow configured allowlists. Long text is multiline, date-time uses native local input with canonical instant conversion, exact decimals declare decimal input mode, and object/list JSON controls reject the wrong root shape immediately. Known class-backed rich-text, money, and external-asset defaults are copied into inert JSON before strict value validation without relaxing validation for arbitrary inputs. Interaction, pure-kernel, and PostgreSQL replacement tests cover the editor and decoded-default boundary, while the exhaustive control registry remains type-checked.

---

## 2026-08-09 — Mutation granularity must stop at localization authority boundaries

**Incorrect assumption or decision:** Treating every displayed root as an atomic mutation target ignored that a mixed Object is only a structural container. It has no independent shared or localized authority; its children own that authority.

**Learning:** Form projection and mutation projection are related but distinct. Atomic fields may use root-level replacement, while mixed containers must be traversed until each mutation path ends at a field with exact shared or localized authority. Prevention: The web diff kernel recursively traverses mixed Object containers and emits stable descendant paths, including nested mixed objects and scoped unsets; all other fields retain atomic root mutations. The server remains default-deny and continues to reject a mutation whose terminal field does not match its partition. Focused tests assert both behaviors.

---

## 2026-08-09 — Append-only integration fixtures need rollback-contained lifecycle tests

**Incorrect assumption or decision:** Reusing the older create-test-fixture/delete-test-fixture pattern for successful publication workflows would make cleanup itself violate the production immutability contract or require disabling the very triggers under test.

**Learning:** When production artifacts are database-enforced append-only, successful integration lifecycles should execute inside a containing transaction that is deliberately rolled back after assertions. The repository needs a narrow test transaction seam without weakening the production transaction configuration. Prevention: `PublicationRepository` keeps its production transaction runner explicitly configured as `READ COMMITTED`, while integration tests inject an already-open transaction/executor and roll the complete lifecycle back. Any fixture-state advancement needed after publication must use that same executor; starting an out-of-band repository transaction while the containing transaction holds source-head locks can wait indefinitely and strand setup fixtures when the test times out. Failure-injection tests use production transactions and assert every material stage rolls back naturally. No trigger is disabled and no immutable row is deleted.

---

## 2026-08-09 — Generated foreign-key order must respect newly introduced referenced authority

**Incorrect assumption or decision:** The generated migration placed the new foreign key before the new referenced unique constraint and therefore treated structurally correct final schema output as executable in arbitrary statement order.

**Learning:** A valid final Drizzle schema does not guarantee that generated cross-table constraint statements are ordered so PostgreSQL can execute them. New foreign keys that depend on new uniqueness over an existing table require explicit generated-SQL dependency review. Prevention: Before developer application, inspect every generated foreign key's referenced uniqueness and ensure the primary/unique constraint is created first. After any failed application, verify table, constraint, index, and journal rollback read-only before retrying; never rewrite an applied migration.

---

## 2026-08-11 — Invalid reference identities must be rejected before typed database predicates

**Incorrect assumption or decision:** Draft validation correctly produced `reference_invalid`, but reference-availability collection still treated every string as queryable and passed the malformed value to a PostgreSQL UUID predicate.

**Learning:** Validation findings do not themselves make later database use safe. Every collector that feeds typed SQL must independently narrow untrusted values to the exact branded identity before query construction. Prevention: Reference availability now collects only values accepted by the branded `EntryId` schema; malformed strings remain in deterministic validation issues and never reach SQL. PostgreSQL integration coverage asserts the typed failure. The generated form also suppresses stale server issues immediately after the corresponding field is edited.

---

## 2026-08-11 — Publicly routable application backends are not public integration contracts

**Incorrect assumption or decision:** Treating every generated OpenAPI document as equally publishable conflated three surfaces: supported developer APIs, authenticated browser application backends, and operator-only artifacts.

**Learning:** Public contract status must be explicit and allowlisted. Delivery/Preview/webhook APIs are portable supported integrations; dashboard RPC remains session-authenticated application infrastructure; management references and operator endpoints remain internal even when their schemas are generated and tested. Prevention: M9 now exposes only a schema-reconciled Delivery specification, disables the aggregate management reference by default, and forbids it in production. M12 owns an allowlisted public contract registry and developer portal; M15 must prove host/ingress separation and route non-exposure. Management RPC still relies on authentication, authorization, tenant isolation, and browser security rather than obscurity.

---

## 2026-08-11 — Milestone checklists must preserve every approved test-plan category

**Incorrect assumption or decision:** The completion checklist collapsed the approved performance section into its three latency rows and did not separately track the same decision's mandatory conditional-revalidation, intentional hot-identity 429, Redis outage/recovery, and oversized-response/memory gates.

**Learning:** A headline baseline table is not the whole approved test plan. Completion evidence must map one-to-one to every explicit bullet and separately expected-failure profiles must never disappear into a successful-traffic summary. Prevention: The M9 checklist, k6 scenario registry, wrapper, README, and baseline report now enumerate capacity, resilience, revalidation, and response-boundary profiles independently. Future milestone closure must reconcile every approved decision test bullet before `[R]` or `[A]` handoff.

---

## 2026-08-11 — Load gates must verify dependency paths and environment bytes, not container names

**Incorrect assumption or decision:** The existing Redis container had no active Compose network attachment, so every primary limiter call waited for its timeout before degrading. Separately, Docker `--env-file` preserved shell-safe quote characters around credentials, IDs, slugs, and filter values; those quotes became real request data. Repeated unnamed hot-path planning also consumed avoidable PostgreSQL CPU.

**Learning:** A production-style load gate must verify end-to-end dependency connectivity, exact environment bytes as seen by the load process, limiter enforcement mode, and hot query planning—not merely container health or source-file appearance. Prevention: Compose Redis now uses a non-conflicting configurable host port and verified internal DNS/network connectivity; the server restarts only after Redis is healthy. The k6 wrapper sources the ignored environment and passes values by variable name rather than Docker `--env-file`. Warm-up is excluded from measured custom metrics, credentials use scenario-global round-robin selection, hot credential/Delivery reads use named prepared statements, and production load runs use error-level application logging. Final baseline and post-run resource invariants are recorded.

---

## 2026-08-12 — Git-ignored load secrets must also be excluded from Docker contexts

**Incorrect assumption or decision:** The existing Delivery load file was ignored by Git but not by `.dockerignore`; `COPY . .` therefore placed it in locally built server/web image layers even though application code never read it.

**Learning:** Git exclusion and Docker build-context exclusion are independent security controls. Every secret-bearing local harness file must be denied by both before any image build. Prevention: `.gitignore` and `.dockerignore` now explicitly exclude both Delivery and Preview load environment files. Fresh production images were rebuilt, inspected by file existence only, and verified to contain neither file; no secret value was read or printed. With developer approval, all dangling local images containing obsolete layers were pruned while current healthy images, containers, and volumes remained.

---

## 2026-08-12 — k6 runtime support and audit reruns need explicit harness design

**Incorrect assumption or decision:** The harness used browser `URLSearchParams`, which is unavailable in the selected k6 runtime, and fixed audit request IDs did not distinguish repeated profile runs. The generic boundary latency threshold also accidentally applied to the fixed-count audit cardinality profile.

**Learning:** Load harness code must be validated in the actual runtime, every database-reconciled run needs a unique non-secret ID, and each profile must enforce only its approved independent gate. Prevention: Preview path validation now uses k6-compatible decoding, the wrapper injects and prints a unique `PREVIEW_RUN_ID`, measured request IDs include it, ramping iterations that finish after the measured window are excluded from measured IDs/metrics, and the parallel-audit profile gates exact success/audit cardinality without inheriting capacity latency thresholds.

---

## 2026-08-13 — Stateful delivery transitions must be tested against all interacting constraints and partial indexes

**Incorrect assumption or decision:** Updating the obvious lifecycle columns was treated as sufficient. A claim incremented `attempt_count` without the check-required non-null outcome; rotation promoted the pending secret before moving the old active row out of the partial unique index; cancellation assigned an outcome even to zero-attempt deliveries, whose check requires null.

**Learning:** A valid row before and after a state change does not imply that an arbitrary SQL update order is valid. Database checks and partial unique indexes define intermediate-state requirements, and complete transition tests must exercise zero, active, overlap, recovery, and terminal variants against the applied schema. Prevention: PostgreSQL integration now covers initial claim, concurrent claim exclusion, stale recovery, stale-token finalization, active-to-retiring-before-pending-to-active rotation, ciphertext destruction, and complete endpoint/mapping lifecycle. Claims persist the fixed `attempt_started` outcome, and cancellation uses a database expression that preserves null for zero-attempt deliveries.

---

## 2026-08-13 — Historical outbox compatibility must be proven with real recursive-schema cardinality

**Incorrect assumption or decision:** The first event contract capped changed field IDs and matching system tags at 100 even though M6 bounds recursive schemas by aggregate bytes/depth, not by 100 total stable nodes. Valid historical publications contained 146 and 180 changed nodes. The dispatcher also persisted projection/fan-out row by row despite an approved 10,000-event drain target.

**Learning:** Compatibility fixtures must include real historical maximum shapes, especially when later contracts add cardinality limits absent from the source domain. Queue workers must isolate bounded poison handling and avoid per-item database round trips when batch atomicity already exists. Prevention: M11 now permits up to 1,000 stable field IDs/system field tags inside the unchanged exact 128 KiB event cap, has a 1,000-node projector boundary test, and runs batch canonical insertion, one interval-aware subscription read, bulk fan-out, and one processed-marker update. A dedicated cleaned 10,000-event profile completes in 3.625 seconds with exact reconciliation.

---

## 2026-08-13 — Pinned HTTPS must follow the runtime lookup contract and measure handshake cost

**Incorrect assumption or decision:** The pinned lookup always returned the legacy single-address callback shape and every request disabled agents entirely. Node 24 requested `all: true`, causing every live request to fail before TLS with a fixed invalid-address category. After correcting that shape, repeated full TLS handshakes left the approved 20 ms single-endpoint profile below 25 attempts/s even though unit adapters passed.

**Learning:** SSRF-safe pinning must honor every supported runtime lookup callback shape, and transport acceptance must include real certificate/SNI/handshake behavior. A private non-keepalive agent can retain a bounded TLS session cache without reusing sockets or bypassing the per-attempt pinned lookup. Prevention: Transport tests now cover Node's `all: true` array callback. The controlled-TLS gates exercise SNI/certificate verification and exact receiver counts. The transport uses `keepAlive: false` with at most 100 cached TLS sessions; every request still creates a connection and invokes its validated pinned lookup. The accepted single-endpoint profile now sustains 25.61 attempts/s at 20 ms receiver latency.

---

## 2026-08-13 — Automated readiness does not replace requirement-by-requirement UI reconciliation

**Incorrect assumption or decision:** The first handoff treated management APIs plus partial endpoint/mapping/delivery controls and broad axe coverage as equivalent to the approved Dashboard UX checklist. It did not explicitly reconcile every visible field, complete-set subscription/edit flow, exact mapping scope, URL filter, pagination, consequence confirmation, and event-detail requirement.

**Learning:** A feature with an approved UI decision needs a final requirement-to-control matrix in addition to route existence, mutation coverage, and accessibility checks. Automated readiness proves the implemented surface is healthy; it does not prove every approved surface was implemented. Prevention: Before requesting manual review, enumerate each Dashboard UX bullet against a concrete rendered control and interaction test. M11 now covers endpoint/subscription/rotation summaries and consequences, editable exact-scope mappings and system tags, URL-bound filters, keyset pagination, complete delivery/event/attempt detail, and confirmed replay semantics.

---

## 2026-08-13 — A delivery-enabled local worker must not share an integration-test database

**Incorrect assumption or decision:** The full readiness suite was started while that independent worker remained active. It claimed newly committed test outbox rows before each suite's teardown could remove them. A later supposedly focused `pnpm --filter <package> test -- <file>` command was also assumed to preserve the file filter, but the package script already supplied `vitest run`; the extra separator widened execution to the package suite while the worker was healthy.

**Learning:** In-process test isolation cannot control an independently running consumer of the same database. Queue integration suites need a separate database or an explicit operational exclusion around all external workers. Prevention: Stop the local worker before PostgreSQL integration/coverage gates and verify its actual process/container state immediately before the gate; do not rely on a stop command placed after earlier `&&` steps that may short-circuit. For focused Vitest execution, use `pnpm --filter <package> exec vitest run <file...>` and confirm the reported file count rather than passing paths through a package test script. Remove only explicitly identified test fixtures if an accidental claim occurs, and restart it only after validation. Production workers and tests should use isolated databases in deployment/CI topology.

---

## 2026-08-22 — Register integration-fixture cleanup before the first persistent write

**Incorrect assumption or decision:** Its first implementation assigned the teardown function only after the complete fixture and OAuth token had been created. An early device-approval assertion failure therefore occurred before teardown existed. Later, Turbo canceled a concurrently running readiness process when an unrelated workspace coverage test failed, interrupting `afterAll` even after teardown registration.

**Learning:** Persistent integration fixtures need cleanup authority registered before their first write, but process-level cancellation can still bypass framework teardown. Final database-backed readiness must include an explicit read-only residue reconciliation after all parallel gates, not rely only on `afterAll`. Prevention: Register idempotent fixture cleanup before sign-up/insertion, use unique test namespaces, stop external consumers, keep destructive cleanup scoped and developer-approved, and perform a final read-only namespace/outbox/work verification after the complete gate. Avoid treating a canceled parallel suite as clean merely because its next isolated rerun passes.

---

## 2026-08-23 — Public-boundary proof is not developer-documentation acceptance

**Incorrect assumption or decision:** Automated proof that a portal published only safe contracts was treated as evidence that it delivered the complete developer learning experience. The implementation optimized the boundary and contract download before validating the developer's expected Better Auth/Next.js-style onboarding, concepts, SDK, CLI, webhook, guide, troubleshooting, and secondary-reference journey.

**Learning:** Documentation has two independent acceptance dimensions: public-surface correctness and developer task success. Both must be designed and manually reviewed. Wire-contract references are secondary support; they do not substitute for product-oriented onboarding and workflows. Prevention: Define the first-success journey and complete information architecture before implementing the portal shell. Use source-controlled MDX for authored teaching, canonical generated artifacts for structural reference, compiling examples for code, self-hosted public-only search, and a bounded compatibility slice before broad content migration.

---

## 2026-08-23 — Stable source identity does not classify collection API-key renames

**Incorrect assumption or decision:** The existing classifier covered field API-key changes but did not compare the published collection API key with the candidate collection API key.

**Learning:** Identity reconciliation and compatibility classification are separate authorities. Stable source/collection IDs prevent replacement; they do not make API-key changes non-breaking. Candidate parity tests must enumerate collection-level contract fields as well as field-level changes. Prevention: The shared classifier now emits breaking `collection.api_key.updated`, with a deterministic test proving the collection ID remains unchanged. M13 project qualification reuses that change rather than maintaining a second classifier.

---

## 2026-08-24 — Authority hashes must not depend on locale collation

**Incorrect assumption or decision:** Canonical arrays were sorted with JavaScript `localeCompare`, while the migration correctly used PostgreSQL `COLLATE "C"`. Locale collation treats punctuation such as hyphens and underscores differently from byte/code-unit order.

**Learning:** Hash canonicalization must use an explicit locale-independent lexical comparator at every ordering boundary. Human-language collation is never suitable for authority bytes. Prevention: Shared canonical sorting now compares code units directly, punctuation-order regression coverage is required, and post-migration verification recomputes every persisted revision hash through the application algorithm.

---

## 2026-08-24 — PostgreSQL identifier limits apply to generated constraint names

**Incorrect assumption or decision:** Generated inline foreign-key names were accepted without checking PostgreSQL's 63-byte identifier limit.

**Learning:** Generated DDL must be checked against database identifier limits, not only TypeScript schema names. Redundant single-column credential foreign keys should not accompany tenant-qualified composite authority. Prevention: Credential columns rely only on explicitly named composite tenant foreign keys; the project apply user foreign key has a short explicit name; schema-contract tests reject redundant credential foreign keys; post-application catalog verification checks exact validated constraint names.

---

## 2026-08-24 — New actor foreign keys invalidate legacy credential-first fixture teardown

**Incorrect assumption or decision:** The test treated the platform fixture's existing cleanup as sufficient even though that cleanup deletes credentials before the M13 apply receipt and immutable schema graph that now reference them.

**Learning:** Adding a successful mutation to an older integration fixture changes that fixture's ownership graph. Assertion success is insufficient; teardown order must include every new dependent table before any referenced actor or tenant row. Prevention: Keep Authoring apply success/replay proof in its transaction-contained repository fixture until a dedicated HTTP fixture owns the complete M13 graph. Before adding cross-layer mutation tests, inventory all new actor/receipt/revision/outbox foreign keys, register idempotent cleanup before the first write, run the teardown path explicitly, and reconcile the unique namespace read-only afterward.

---

## 2026-08-24 — Server image builds must include runtime-externalized workspace distributions

**Incorrect assumption or decision:** A successful host `tsdown` build was treated as sufficient even though the bundle left the workspace import external and the server Dockerfile built only `apps/server`.

**Learning:** A workspace import externalized from an application bundle is a runtime dependency, even when reached transitively through another workspace. Its package link and built export must both exist in the production image. Prevention: Declare runtime-externalized workspaces directly in the consuming application through pnpm, build their distributions before the application bundle in the Dockerfile, and verify the rebuilt container plus one exact artifact/route request rather than relying only on host builds.

---

## 2026-08-24 — Named SDK envelopes do not prove exact DTO parity

**Incorrect assumption or decision:** Top-level operation-specific class names were treated as complete strict DTO decoding even though schema export/plan/apply nested records and all write request bodies still used generic JSON-object contracts.

**Learning:** SDK contract parity is recursive and bidirectional. A named outer envelope is not an exact client contract when nested response authority or request bodies remain generic. Prevention: Reconcile every SDK operation against the canonical request and response schema field by field; reject nested excess properties and bounds; test malformed inputs at each level; and do not mark the SDK complete until generated declarations expose operation-specific request and response types.

---

## 2026-08-24 — Pre-auth execution requires a separate module graph, not only command ordering

**Incorrect assumption or decision:** Running the build branch before token acquisition was treated as credential isolation even though static imports and the module-level `ManagedRuntime` still loaded or constructed credential-store, OAuth, Tooling, and authenticated command dependencies before command dispatch.

**Learning:** A pre-auth security boundary is defined by the loaded and constructed dependency graph, not by which branch executes first. Credential-bearing services must be unreachable by module construction as well as unused at runtime. Prevention: Keep the package binary as a minimal dynamic dispatcher. Load `schema build` through a dedicated credential-blind module and load authenticated commands through a separate module only for other commands. Packaged tests recursively inspect the schema-build static import graph for keyring, management-token, OAuth, Tooling, and Authoring dependencies and execute hostile token/file/network probes against the built artifact.

---

## 2026-08-25 — Parallel database fixtures must publish valid aggregates atomically

**Incorrect assumption or decision:** The worker fixture inserted an endpoint, destination, secret, subscription, and enabled pointer through separate committed statements. During the short interval before the subscription insert, the management fixture could list that endpoint and correctly reject its impossible zero-subscription aggregate.

**Learning:** Stopping external consumers is necessary but not sufficient for shared-database isolation. A test fixture that represents one valid aggregate must become visible atomically, especially when parallel suites intentionally query broad tenant collections. Prevention: The worker fixture now inserts the endpoint, destination, secret, subscription, and enabled pointer in one database transaction. The two webhook integration files pass together in parallel, and complete 713-test normal/coverage API gates pass with zero scoped residue.

---

## 2026-08-25 — Successful HTTP publication fixtures must roll back, not delete, immutable artifacts

**Incorrect assumption or decision:** The first fixture committed publication artifacts and planned to delete its graph in `afterAll`, overlooking the database triggers that correctly prohibit deletion of publication rows and command receipts. One run also used a single weighted-rate-limit identity for every schema and content request. A later dynamic Vitest runtime-module mock was assumed to provide deterministic repository substitution, but one rerun bypassed it and committed the publication.

**Learning:** Append-only integration artifacts cannot be made teardown-safe by adding more delete statements. End-to-end HTTP tests need the real repository bound to a test-owned rollback transaction at the Effect service boundary. Distinct least-privilege principals should represent independently quota-controlled workflows. Prevention: `createApp` now accepts a closed process-owned Authoring Effect transform, and every Authoring `Context` applies that transform before the shared runtime boundary. The fixture deterministically provides only a transaction-bound real `PublicationRepository`; publish, replay, conflict, status, and unpublish still execute through Express and production operations while immutable writes roll back. Setup registers exact cleanup before its first write, separate least-privilege credentials respect quotas, and post-suite namespace/outbox/receipt reconciliation is zero. The default live wiring and immutable triggers remain unchanged; runtime module mocking is no longer used.

---

## 2026-08-25 — Query-plan tests must accept equivalent bounded indexes

**Incorrect assumption or decision:** The assertions required one exact index name even though PostgreSQL could legitimately select another environment-leading or collection-leading index with equivalent bounded access under the fixture's tiny statistics. `enable_seqscan = off` prevents sequential scans; it does not force the most semantically obvious index.

**Learning:** Query-plan evidence should prove the required access shape and approved index family, not one optimizer tie-break. Exact index assertions are appropriate only when no equivalent leading-prefix plan exists. Prevention: Presentation and schema plan tests now accept the reviewed environment- and collection-leading index alternatives while continuing to reject sequential access, assert the relevant lookup predicates, and verify the intended indexes exist in PostgreSQL.

---

## 2026-08-25 — Runtime-exact unions also need discriminated public TypeScript types

**Incorrect assumption or decision:** The SDK runtime schema was an exact union of 18 field variants, but its exported recursive TypeScript interface represented `kind` as one broad union and `configuration` as generic JSON. Runtime safety was preserved, yet TypeScript could not correlate money, enum, reference, or nested child configuration with the selected kind.

**Learning:** Runtime discriminants and compile-time discriminants are separate authorities. A recursively exact schema must export a correspondingly discriminated TypeScript union when downstream exhaustive adapters depend on kind-specific properties. Prevention: The SDK field type is now a mapped discriminated union, and its schema variant helper preserves the literal kind generically. Cross-package compile tests prove both management and Authoring DTOs enter the renderer adapters without assertions; the browser package still projects only its minimal inert fields.

---

## 2026-08-26 — Local editor authority and form hydration must have explicit lifetimes

**Incorrect assumption or decision:** Nulling the outer token variable was treated as clearing credential authority even though the gateway's SDK closure retained the original string. Separately, a data-fetch object identity was treated as draft identity, so an equal presentation refresh could become an implicit form reset.

**Learning:** Secret lifetime and controlled-edit lifetime need explicit mutable authorities. Clearing one reference does not clear copies captured by long-lived clients, and query-object identity is not persisted draft authority. Prevention: The editor gateway now receives a mutable token getter and creates the strict SDK client only for each request; management authority is removed from `process.env` after acquisition, every browser-opener child receives a sanitized environment, and shutdown nulls the getter before awaiting in-flight refresh and closing the watcher/server. Form hydration is keyed by entry, schema revision, and both partition versions/revisions, while equal form/presentation refreshes preserve controlled values. Tests prove post-close token unreachability, opener-environment isolation, live presentation polling without local reset, conflict preservation, and explicit versioned reload.

---

## 2026-08-27 — Full parallel readiness needs explicit interaction budgets and cancellation-aware residue gates

**Incorrect assumption or decision:** Focused interaction timings and framework default five-second test timeouts were treated as sufficient under full coverage contention. Several failed readiness attempts then canceled still-running database workspaces; framework teardown could not complete every already-persisted fixture graph.

**Learning:** A focused pass is not a full-readiness latency bound, and process cancellation is outside `afterAll` authority. Meaningful lazy or multi-step interaction tests need explicit bounded waits/test budgets derived from the aggregate coverage run. Every complete shared-database gate still needs post-run read-only namespace reconciliation even when the final run passes. Prevention: The editor and lazy schema-workbench tests now use explicit 15–30 second aggregate test budgets and a five-second lazy-query wait while retaining measured production interaction ceilings separately. The current full gate passes 1,192 tests. Read-only reconciliation isolated the canceled-run graph before developer-approved cleanup. The first guarded cleanup transaction rolled back unchanged when its project-only audit predicate missed 16 workspace-level rows; renewed approval and a workspace-scoped predicate then removed exactly 10 users/projects, eight workspaces, six draft entries, 16 outbox rows, 14 derived publication events, and 178 audits, with zero immutable content-publication artifacts.

---

## 2026-08-27 — A verified release image is not the active manual-review runtime

**Incorrect assumption or decision:** Building and inspecting the final server image was treated as sufficient runtime provenance, but Compose still ran a three-day-old `latest` image. That server returned an older schema-export DTO without required `revisions`; the current strict SDK correctly rejected it as `CLI_AUTHORING_TRANSPORT`.

**Learning:** Artifact provenance and active-runtime provenance are separate gates. Health checks prove process liveness, not that a container runs the reviewed image or DTO version. Prevention: Before manual review, compare active container image IDs with reviewed artifacts, rebuild UI images from the current worktree, recreate services, and then probe one strict cross-package operation. The review stack now runs refreshed server image `fb668f98…` and current dashboard image `632acd10…`; strict schema export, immutable Tooling reads, and generation pass.

---

## 2026-08-28 — Individually valid workflows can collide at shared serialization and ownership boundaries

**Incorrect assumption or decision:** Tooling fixtures always supplied optional enum defaults, so internal contract objects containing `undefined` were never exercised at the recursively exact JSON boundary. Separately, code-first authoring lock v2 and the legacy generated-consumer transaction both claimed `.framerfordevs/schema.lock.json`, although each workflow passed independently.

**Learning:** Cross-workflow acceptance must compose real outputs, not only test each command in isolation. Public JSON normalization must preserve canonical hash semantics exactly, and separate owners must never overwrite one path merely because both artifacts are called a lock. Prevention: Tooling now maps JavaScript-only `undefined` recursively to canonical JSON `null`, with enum/money/rich-text regression coverage, preserving the established contract hash. Config v2 keeps authoring authority at `.framerfordevs/schema.lock.json` and generated ownership at `.framerfordevs/generated.lock.json`; config v1 remains compatible. Filesystem tests prove the generated transaction preserves the authoring lock, and clean manual export/generate/presentation/export/generate now succeeds without `--force`.

---

## 2026-08-28 — Local editor defaults and retry recovery must derive from hosted and persisted authority

**Incorrect assumption or decision:** The browser defaulted to hardcoded `en-US` instead of hosted locale authority. Separately, the Promise boundary assumed `Effect.runPromise` would reject with the typed retry-journal error directly, so a real pending-command conflict was mislabeled as upstream 502. During diagnosis, a retained command ID was replayed manually without first proving that the stored local fingerprint represented the same request; the server result was valid, but the local journal could not reconcile a different fingerprint.

**Learning:** Locale defaults are hosted project authority, not UI conventions. Effect failures crossing into Promise code must be explicitly unwrapped before tag-based classification. A content-free command ID alone is insufficient proof of retry equivalence; the persisted operation and fingerprint remain part of idempotency authority. Prevention: Editor status now loads a bounded locale list from the Tooling manifest, verifies its resolved environment, defaults to the first hosted locale, and suppresses locale-partition reads/writes until a locale is selected. The journal boundary uses `runPromiseExit` to recover typed failures and maps real conflicts to `409 EDITOR_COMMAND_PENDING`, with a filesystem-backed regression test. Future direct retry diagnostics must recompute and compare the exact local fingerprint before sending; otherwise stop and reconcile server state before seeking approval to clear only the proven journal.

---

## 2026-08-28 — New aggregate creation must preserve companion-feature invariants and actor unions

**Incorrect assumption or decision:** Authoring apply reproduced the core collection/schema graph but omitted the M9 protected Delivery configuration that dashboard collection creation always seeds. After exact repair, the legacy Delivery management DTO still required a human updater even though the database and M13 authority model correctly attributed creation to a management credential.

**Learning:** A second creation path must inventory every required companion row introduced by later milestones, not only the owning aggregate's original tables. Once persistence permits user-or-credential attribution, every reader, DTO, updater, and UI fixture crossing that row must represent the same union honestly. Prevention: Code-first allocation now creates a version-1 protected Delivery configuration in the same transaction as every new collection and schema head. PostgreSQL mutual-reference coverage counts both companion rows and existing failure injection covers rollback. Delivery management output now carries nullable user and credential actor IDs, maps both from persistence, and clears credential attribution on a later human update. The two pre-fix review rows were repaired only after exact developer approval and guarded reconciliation.

---

## 2026-08-28 — OAuth user policy needs exact locale context before content pre-resolution

**Incorrect assumption or decision:** Authoring content helpers authorized `content.read` or `content.write` while resolving collection/mutation authority but did not yet supply the requested locale ID. Credential policy does not model member locale restrictions, so management tests passed; user policy correctly rejects every locale-scoped action with missing locale context. Separately, the production-mode local image correctly rejected an HTTP OAuth resource, requiring an explicit temporary development-mode review topology rather than weakening HTTPS validation.

**Learning:** Authentication scope success is not authorization-context completeness. Every user content preflight must resolve and pass the exact enabled locale before policy evaluation; management success cannot substitute for OAuth/user coverage. Local HTTP OAuth review must use an explicitly temporary non-production runtime, never a production HTTPS exception. Prevention: Collection and mutation authority helpers now resolve the enabled locale ID first and pass it through all list/get/create/rename/save/status/validate/publish/unpublish paths. Generated form reads use role-projected project visibility because the form route has no locale, while exact mutations remain locale-authorized. A real user-actor PostgreSQL regression proves exact-locale resolution. OAuth was enabled only in a temporary development-mode container, then native authority, temporary refresh/device rows, the container, and the setting were removed; normal production-mode Compose is healthy with OAuth disabled.

---

## 2026-08-28 — A healthy test port does not prove the intended receiver owns it

**Incorrect assumption or decision:** The startup script launched a host receiver in the background and then treated a successful `/health/ready` probe as proof that the new process owned the port. The host process had actually exited with `EADDRINUSE`; the probe reached the pre-existing receiver, whose different secret mount correctly returned signed webhook attempts as 503.

**Learning:** Test-runtime provenance requires listener/process/container identity in addition to port health, just as application runtime provenance requires image identity in addition to container health. Prevention: Before starting a receiver, inspect the bound listener and container ownership, verify the launched PID remains alive, and verify its configured evidence/secret roots before exposing a tunnel. Scenario 7 reused the already-hardened receiver intentionally after identification, installed the exact ignored mode-600 secret, reconciled attempts, and then removed only the scenario event captures and secret after disabling the endpoint.

---

## 2026-08-29 — Deleting `process.env` does not erase Linux initial-environment bytes

**Incorrect assumption or decision:** Removing `FFD_MANAGEMENT_TOKEN` from Node's `process.env` was treated as removal from the process environment. Node and sanitized opener children no longer observed the key, but Linux retained the original initial-environment bytes in `/proc` for the lifetime of the process.

**Learning:** A secret-bearing process cannot reliably scrub its initial OS environment in portable JavaScript. The long-lived process must start without the secret; clearing a language/runtime map afterward is insufficient. Prevention: `ffd editor --token-stdin` accepts one bounded whitespace-free management token only after credential-blind local schema preparation, rejects simultaneous exported management authority, and keeps the token out of initial OS environment and process arguments. Documentation now prefers OAuth native storage when enabled or a non-exported shell variable piped to this mode. Legacy environment support remains for compatibility but is no longer the recommended secure editor launch.

---

## 2026-08-30 — One database transaction is one sequential connection authority

**Incorrect assumption or decision:** Credential authorization loaded project, environment, and scope rows with `Promise.all` against one Drizzle transaction. PostgreSQL completed the focused scenario, but `pg` warned that a query was started while the same transaction client was already executing another query; pg 9 will reject that pattern.

**Learning:** Independent reads are not safely concurrent when they share one transaction-bound client. Parallel query composition is appropriate only across independently acquired executors; work on one transaction must remain sequential unless the database adapter explicitly provides multiplexing. Prevention: Control Plane credential authorization now performs its three scoped reads sequentially, the management-credential integration scenario passes without the warning, and future transaction helpers must not use `Promise.all` over the same executor.
