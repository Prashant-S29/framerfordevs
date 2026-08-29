# Product and Architecture Learnings

**Purpose:** Preserve consequential product and architecture lessons so future agents do not repeat decisions or assumptions that caused rework, violated agreed constraints, or drifted from the product goals.

This file is not a command-error log. Do not record ordinary shell failures, missing local tools, typos, or harmless execution mistakes.

## What belongs here

Record a learning when an implementation or decision:

- Was based on an incorrect product or architecture assumption
- Violated an agreed product invariant or engineering constraint
- Had to be discarded or substantially reworked
- Created avoidable security, reliability, performance, UX, DX, observability, or maintainability problems
- Coupled the CMS to a future product in a way that would block composition
- Broke or weakened a public contract, tenant boundary, localization rule, or publication guarantee

## Entry format

```text
## Date — Short title

**Context:** What was being built or decided.
**Incorrect assumption or decision:** What caused drift or rework.
**Cost or risk:** What had to be discarded, repaired, or could have broken.
**Learning:** The durable product or architecture lesson.
**Prevention:** The concrete rule or test that prevents recurrence.
**Status:** Current resolution.
```

---

## 2026-07-28 — Repository stack must be verified before architecture decisions

**Context:** The initial conversation described the frontend as Next.js and referred to “MetraAuth.”

**Incorrect assumption or decision:** Treating those names as canonical would have designed the CMS around a stack the repository does not use.

**Cost or risk:** It could have caused unnecessary frontend migration work, incompatible implementation plans, and incorrect authentication integration.

**Learning:** Product planning must distinguish intended product behavior from the concrete stack already checked into the repository. Architecture decisions require repository verification, not conversational assumption alone.

**Prevention:** Before planning or changing architecture, inspect the root README, package manifests, workspace configuration, and runtime entrypoints. Record the confirmed stack in `context.md` and require an explicit developer decision before replacing it.

**Status:** Resolved. TanStack Start and Better Auth are canonical.

---

## 2026-07-28 — Research tooling must not become a runtime dependency

**Context:** The official Effect skill requires a local Effect source checkout through the root `prepare` script.

**Incorrect assumption or decision:** Running the research checkout unconditionally during every package installation would couple Docker/CI builds to GitHub availability, require Git in runtime build images, increase build time, and copy research-only files into build contexts.

**Cost or risk:** Container builds would become slower and less reliable for functionality that production does not need.

**Learning:** Agent research infrastructure and product runtime dependencies are different concerns. Research tooling must remain reproducible for developers without entering production artifacts or critical build paths.

**Prevention:** `.repos`, skills, and knowledge documents are excluded from Docker contexts. Container builds set `SKIP_EFFECT_SOURCE_SETUP=1`; local installs still prepare the research checkout.

**Status:** Resolved and validated through complete Docker image builds.

---

## 2026-07-28 — CORS configuration must enforce origin denial explicitly

**Context:** The starter passed a fixed trusted origin string to CORS middleware.

**Incorrect assumption or decision:** Treating a mismatched `Access-Control-Allow-Origin` response as sufficient rejection left untrusted requests executing against the server even though browsers would withhold the response.

**Cost or risk:** Non-browser clients could still perform requests, preflights did not communicate an explicit denial, and security behavior depended on browser enforcement rather than server policy.

**Learning:** CORS is not authorization, but configured browser-origin policy must still be explicit, deterministic, and tested on the server boundary.

**Prevention:** Reject untrusted origins and preflights with HTTP 403 before route handling, omit CORS headers, and maintain tests for trusted, untrusted, preflight, and originless requests.

**Status:** Resolved with integration coverage.

---

## 2026-07-29 — Stable package declarations are the executable Effect API contract

**Context:** Milestone 1 introduced stable `effect@3.22.0` while the installed Effect skill and source-oriented examples use some newer source API names.

**Incorrect assumption or decision:** Treating guide/source names such as `Context.Service`, `Schema.TaggedErrorClass`, and `Schema.optionalKey` as guaranteed stable package exports caused the first implementation pass to target APIs absent from the installed stable declaration surface.

**Cost or risk:** The service, error, and schema foundation required avoidable rewrites and could have encouraged upgrading to beta packages merely to satisfy examples.

**Learning:** For a pinned stable Effect release, the installed package's public declarations and compile-time behavior are the executable contract. Guides and source remain research inputs, not permission to cross the approved stability boundary.

**Prevention:** Keep exact aligned stable versions, inspect the installed public declarations when an API differs, compile incrementally, and use stable 3.22 equivalents (`Context.Tag`, `Schema.TaggedError`, and exact `Schema.optionalWith`) rather than changing versions speculatively.

**Status:** Resolved with stable versions and compatibility tests.

---

## 2026-07-30 — Container health must exercise server-rendered dependencies

**Context:** The Docker web root was healthy, but the server-rendered login route failed while resolving the current Better Auth session.

**Incorrect assumption or decision:** The web container used the browser-facing `http://localhost:3000` API URL during server-side rendering. Inside the web container, `localhost` referred to the web container itself. The root-only health check did not exercise authentication and therefore reported healthy.

**Cost or risk:** Docker appeared production-ready while `/login` rendered a fetch failure, blocking authentication and all manual platform review.

**Learning:** Universal applications need separate public browser and internal service-discovery URLs. Container health checks must traverse a representative server-rendered dependency, not only a static or dependency-free root.

**Prevention:** Docker supplies `INTERNAL_SERVER_URL=http://server:3000` for SSR while retaining the public Vite URL for browsers. URL resolution has dedicated tests, and the web health check now requests `/login`, which exercises the auth service dependency.

**Status:** Resolved and validated with 163 tests, a production rebuild, healthy containers, and an HTTP 200 login response.

---

## 2026-07-30 — Authorization lifecycle must update discovery and serialize cleanup

**Context:** Milestone 3 replaced owner-only project access with explicit project memberships and collaborator workspace discovery.

**Incorrect assumption or decision:** Treating authorization as only a per-project operation guard would leave owner-only discovery queries in place, while independently removing the same collaborator from two projects could race and leave an active workspace collaborator row after the final project access disappeared.

**Cost or risk:** Valid collaborators could be hidden from the dashboard, or stale workspace discovery access could survive concurrent project removals even though project authorization correctly denied access.

**Learning:** Authorization includes discovery and lifecycle maintenance, not only endpoint checks. Invariants spanning multiple resources need a stable serialization point in addition to unique constraints and optimistic versions.

**Prevention:** Workspace/project list queries resolve active effective access; project owner mutations lock the project; invitation acceptance serializes on the user; and collaborator cleanup locks the workspace membership before counting remaining project memberships. Integration tests cover collaborator visibility, immediate access loss, stable reactivation, and concurrency.

**Status:** Resolved and approved in Milestone 3, committed as `a74aeb8`.

---

## 2026-08-01 — Shared browser utilities must remain runtime-light

**Context:** Milestone 4 reused locale-tag canonicalization in browser form validation.

**Incorrect assumption or decision:** Importing the helper from the Effect schema-heavy locale contract module treated a shared runtime function like a type-only contract import.

**Cost or risk:** The browser validation chunk grew to roughly 230 kB and pulled Effect contract machinery into a client path for one `Intl` helper.

**Learning:** Shared browser/server algorithms should live in narrow dependency-free modules; schema modules may safely consume those utilities, but browser code should not import schema-heavy modules merely to reuse a pure function.

**Prevention:** `contracts/locale-tag.ts` now owns dependency-free canonicalization. Effect locale schemas re-export it, browser validation imports the lightweight module directly, and the production client validation chunk is roughly 29 kB.

**Status:** Resolved before manual review; the registry-backed client validation chunk remains dependency-free at roughly 75 kB raw/34 kB gzip instead of the schema-heavy roughly 230 kB path, and type checks, tests, and production builds pass.

---

## 2026-08-01 — Structural BCP 47 parsing does not prove IANA registration

**Context:** Milestone 4 initially used `Intl.getCanonicalLocales()` for locale identity validation, and manual testing entered `doekdoek`, `xlw`, and `oedll`.

**Incorrect assumption or decision:** Runtime canonicalization was treated as authoritative registration validation. It validates BCP 47 structure and canonical casing/known aliases, but accepts many structurally valid unregistered language subtags.

**Cost or risk:** Invalid project locale identities passed the browser, API, and structural database check consistently. Relying on runtime ICU data would also make accepted aliases vary with host/runtime updates.

**Learning:** Syntax, canonicalization, and registry membership are separate concerns. Stable persisted standards-based identifiers require an explicit authoritative dataset and an application-specific supported profile.

**Prevention:** Browser and API validation now share a generated official IANA Language Subtag Registry snapshot pinned at `File-Date: 2026-06-14`. Tests reject unknown language/script/region/variant subtags, private-use/reserved ranges, extensions, and unsafe grandfathered tags; aliases come from snapshot `Preferred-Value` metadata. The API remains authoritative, and no runtime network, OS, ICU-registry, or opaque package-data lookup is used.

**Status:** Resolved. The developer-authorized guarded cleanup permanently deleted the three soft-removed invalid rows after confirming they had no membership grants.

---

## 2026-08-01 — Idempotency keys require persisted authority fingerprints

**Context:** Milestone 5 schema publication uses a collection-local client command ID and promises that retries return the original revision while incompatible command-ID reuse fails safely.

**Incorrect assumption or decision:** The first approved database outline stored only the command ID and schema hash. That was insufficient to distinguish a genuine retry from reuse with different expected versions, published baseline, acknowledgements, or schema authority after later edits.

**Cost or risk:** Incompatible input could have been mistaken for a valid replay, weakening publication acknowledgement and concurrency guarantees.

**Learning:** Durable idempotency needs both a unique command identity and a canonical fingerprint of every input that grants authority for the state change.

**Prevention:** `cms_schema_revision` stores a SHA-256 command fingerprint over the scoped publication input, sorted acknowledgement IDs, expected versions/baseline, and schema hash. Replay tests must cover matching retries and incompatible reuse.

**Status:** Resolved in the M5 foundational design and Drizzle schema before migration generation.

---

## 2026-08-02 — URL matching does not guarantee child-route rendering

**Context:** The Milestone 5 collection builder used a directory route below the existing project-detail page route.

**Incorrect assumption or decision:** A correct generated URL and route match were treated as sufficient. TanStack Router nested the builder under the project-detail component, but that page intentionally had no `Outlet`, so only the project panel rendered.

**Cost or risk:** The primary schema-builder workflow was unreachable even though navigation changed to the expected URL and production builds passed.

**Learning:** Route-tree composition must be verified independently from URL generation. A page-shaped route below another page-shaped path should use TanStack's non-nested trailing-underscore convention unless the parent is deliberately a layout with an `Outlet`.

**Prevention:** The builder now lives under `$projectId_`, preserving the public URL while parenting it directly to the authenticated layout. A route-tree regression test asserts both its full path and non-nested parent.

**Status:** Resolved during Milestone 5 manual review; web type checks, tests, and production build pass.

---

## 2026-08-02 — Status summaries must reconcile knowledge documents with Git

**Context:** Milestone 5 had been manually verified and committed, while `context.md` and `progress.md` still described it as awaiting review.

**Incorrect assumption or decision:** The status summary repeated the stale review state instead of fully reconciling it with the recent Git log and asking only about any genuinely unresolved approval ambiguity.

**Cost or risk:** The developer received an incorrect next-step recommendation and had to repeat completed review and commit information.

**Learning:** Progress documents describe intended execution state, while Git is authoritative for repository and commit state. A reliable handoff must inspect both and explicitly reconcile differences.

**Prevention:** `knowledge_base/rules/session-rules.md` now requires `git status` and recent `git log` inspection before status reporting and milestone handoffs. Approved milestone records must use the actual commit hash when present.

**Status:** Resolved. Milestone 5 is recorded as approved and committed at `28ca04d`.

---

## 2026-08-05 — Development CLIs do not belong in the production dependency graph

**Context:** The requested post-M6 production audit traced multiple advisories through the `shadcn` component-management CLI declared as a production dependency of the shared UI package.

**Incorrect assumption or decision:** A tool used to add or inspect source components was classified as runtime application code merely because it is associated with the UI package.

**Cost or risk:** Production audit scope included an unnecessary MCP server, environment/configuration tooling, AST tooling, and their transitive vulnerabilities, increasing supply-chain surface and obscuring the actual runtime dependency posture.

**Learning:** Source-generation and component-management CLIs are development tooling even when they live beside runtime components. Production dependency classification must be based on runtime imports and deployment needs, not package ownership.

**Prevention:** Keep `shadcn` in `devDependencies`, verify there are no runtime imports before moving a package, run both `pnpm audit --prod` and full `pnpm audit`, and use exact patched transitive overrides only when an upstream dependency range cannot resolve a fix itself.

**Status:** Resolved. shadcn is development-only; OpenTelemetry and Better Auth are patch-aligned; patched audit overrides are explicit; production-only and full audits report no known vulnerabilities.

---

## 2026-08-05 — Hydration transitions must preserve React hook order

**Context:** Manual review opened the production Docker schema-builder route after a fresh stack restart and React reported minified error 310.

**Incorrect assumption or decision:** `SchemaBuilder` returned its loading state before calling its reorder mutation hook. Loader-prefetched tests usually began with query data available, but a real hydration/refetch transition rendered first without the hook and then with it.

**Cost or risk:** The primary collection editor crashed during a normal production loading transition even though static builds, preloaded tests, and accessibility checks passed.

**Learning:** Route-loader prefetch is an optimization, not a guarantee that client query hooks are immediately resolved. Every render path in a component must execute hooks in identical order.

**Prevention:** Keep all hooks above loading/error returns, enforce `react-hooks/rules-of-hooks` in the workspace linter, and include cold-loading transitions when reviewing query-backed routes.

**Status:** Resolved. The mutation hook is unconditional, the React Hooks lint rule is enabled, web checks/tests/build pass, and the rebuilt Docker stack is healthy.

---

## 2026-08-05 — Synchronized schema editors require one atomic authoring boundary

**Context:** The initial M6 collection UI persisted each field immediately through separate create/update/remove/reorder dialogs. The requested visual and JSON schema views needed one shared unsaved draft and a reliable apply/save action.

**Incorrect assumption or decision:** Treating granular field mutations as a sufficient editing architecture would require the JSON view to execute a sequence of optimistic mutations. A failure or version conflict in the middle could leave only part of the user's schema applied, while visual and JSON state could diverge.

**Cost or risk:** Partial schema replacement could silently remove or update some fields before failing, make retry behavior ambiguous, break stable identity handling, and force the UI to emulate server transaction logic.

**Learning:** Granular resource APIs and an authoring-document boundary solve different problems. Multi-view editors should share a bounded versioned local document and submit it through one server-authoritative atomic operation; granular APIs can remain for focused compatibility use.

**Prevention:** `fields.replace` validates the complete prospective tree under the existing lock/version/authorization order, preserves only active supplied IDs, generates new IDs server-side, rejects reparenting, reconciles root layout placements, and commits fields/head/version/audit together. PostgreSQL integration verifies duplicate-key failure leaves the draft unchanged. Browser parsing and sample inference are bounded but remain advisory.

**Status:** Resolved without a database schema change. Visual, schema-JSON, and sample-inference flows now converge on one atomic save and expose precise validation details.

---

## 2026-08-05 — UI query limits must stay inside the shared pagination contract

**Context:** The schema workbench loaded reference-target collections with `limit: 100`, while the platform `PageLimit` contract accepts only 1 through 50.

**Incorrect assumption or decision:** The reference selector treated a larger first-page request as a harmless way to obtain more options instead of respecting the existing bounded paginated API.

**Cost or risk:** The collection route issued a deterministic `VALIDATION_ERROR` during manual review and could not load its reference options.

**Learning:** Every client query must use the server contract's current page bounds. Wanting more records requires explicit pagination, not a larger undocumented limit.

**Prevention:** The initial reference collection request and its matching invalidation key now use the maximum valid limit of 50. Web type checks, all 88 web tests, the production build, and rebuilt Docker health pass; the workspace no longer contains a web request with `limit: 100`.

**Status:** Resolved during M6 manual review.

---

## 2026-08-08 — Schema class instances must be normalized before canonical command fingerprinting

**Context:** M7 save inputs decode bounded mutations into Effect `Schema.Class` instances before durable command fingerprinting.

**Incorrect assumption or decision:** The first fingerprint implementation passed those class instances directly to a canonical JSON function that intentionally treats non-plain objects as invalid. Distinct mutation payloads therefore canonicalized to the same placeholder.

**Cost or risk:** Reusing a no-op command ID with different mutations could be accepted as a replay instead of returning `ENTRY_COMMAND_CONFLICT`, weakening durable idempotency authority.

**Learning:** Command fingerprints must canonicalize the transport/document representation, not runtime wrapper identity. Decoded class instances require deterministic conversion to plain JSON before hashing.

**Prevention:** Entry create/save/restore fingerprints now JSON-normalize their schema-decoded input before canonical hashing. PostgreSQL integration reuses command IDs with changed locale and mutation authority and requires `EntryCommandConflictFailure`.

**Status:** Resolved and covered.

---

## 2026-08-08 — Page-shaped editor routes must not be nested under pages without outlets

**Context:** The first M7 entry editor file was nested under the entry-list route directory.

**Incorrect assumption or decision:** Matching URL hierarchy was treated as sufficient route composition even though the entry-list page does not render an `Outlet`.

**Cost or risk:** The editor URL existed in the generated route tree but would render through a parent that could not display the child, repeating the M5 schema-builder routing failure.

**Learning:** TanStack route URL hierarchy and component nesting are separate decisions. Dedicated page workspaces need the trailing-underscore non-nested convention whenever their URL parent is another page rather than a layout.

**Prevention:** The editor uses `entries_/$entryId.tsx`, preserving `/entries/$entryId` while parenting it directly under the authenticated layout. The route-tree regression test asserts schema, entry list, and editor parent/full-path behavior.

**Status:** Resolved before manual review; SSR/client production builds pass.

---

## 2026-08-09 — Internal stable identities need an explicit validation projection

**Context:** M7 persists nested entry objects by stable field ID, while the reusable M6 value validator traverses schema-shaped values by API key.

**Incorrect assumption or decision:** Passing stable-ID-shaped nested values directly to the API-key-shaped validator worked for scalar roots but treated valid object children as unknown or missing.

**Cost or risk:** Eligible mixed objects could be authored and published at the schema level but fail or misreport entry-draft validation, undermining the stable-identity design exactly where it mattered most.

**Learning:** Stable persistence identity and user-facing/schema validation shape are separate representations. Their boundary must be an explicit recursive projection, not an implicit shared object convention.

**Prevention:** Entry validation now recursively projects stable field-ID objects to current API-key-shaped values before applying the existing validator, while storage, mutations, authorization, and revision history remain stable-ID-based. PostgreSQL integration covers shared and localized children inside one mixed object.

**Status:** Resolved during M7 manual review.

---

## 2026-08-09 — Editor defaults and hydration must follow persisted partition state

**Context:** Manual entry review found configured defaults absent on new drafts, intentionally cleared values at risk of reappearing, and saved Portable Text not visibly hydrating into the official editor.

**Incorrect assumption or decision:** Generic form-default projection and React state updates were treated as sufficient without tying defaults to head version or seeding the rich-text editor's own history state.

**Cost or risk:** New-entry UX omitted schema defaults, reapplying defaults could erase a deliberate clear, and persisted rich text could appear empty after reload or locale changes.

**Learning:** Defaulting is a versioned persistence-boundary rule, not a generic missing-value rule. Controlled third-party editors may also require explicit initialization of their internal state rather than only an external value prop.

**Prevention:** Defaults project only when the relevant shared or exact-locale partition is version `0`; any persisted version suppresses reapplication. Portable Text initializes editor history from the saved document and remounts at the draft boundary. Focused tests cover recursive mixed-object defaults, clear-value preservation, and saved-document hydration.

**Status:** Resolved during M7 manual review.

---

## 2026-08-09 — Expected optional-resource absence should not be fetched as an error

**Context:** The entry workspace correctly rendered “Publish the schema first,” but its route and component still requested the missing published form and schema-dependent entry list.

**Incorrect assumption or decision:** A handled 404/409 response was treated as harmless because the final empty state was correct. The global query error handler nevertheless surfaced three alarming retry toasts for an expected collection lifecycle state.

**Cost or risk:** The UI contradicted itself, browser diagnostics showed avoidable failed requests, retries could never succeed until publication, and genuine query failures became harder to distinguish from expected absence.

**Learning:** When parent metadata already exposes optional child availability, route/query planning should use that state and avoid requesting a child known not to exist. Direct child endpoints may retain correct 404 semantics for genuine callers.

**Prevention:** The entry workspace reads the collection’s `currentPublishedRevisionId` first and enables/prefetches the published form and entry page only when present. The locale-neutral list no longer loads an unused value contract and returns an empty page before publication. Publication invalidates collection metadata so the gate cannot remain stale.

**Status:** Resolved during M7 manual review with PostgreSQL and complete readiness coverage.

---

## 2026-08-09 — Configuration defaults need the same semantic editor as field values

**Context:** The schema inspector exposed a raw JSON textarea for a rich-text default even though entry values already used the official Portable Text editor. After the control was corrected, the server still rejected its valid document because Effect decoding materialized the structured default as a `Schema.Class` instance.

**Incorrect assumption or decision:** Treating every structured default as generic JSON made implementation convenient but required users to know internal document syntax and surfaced JSON parser failures for ordinary prose. Separately, passing decoded class-backed defaults directly to a validator that intentionally accepts only inert plain JSON confused a trusted runtime wrapper with invalid content. The same audit found single-line long-text defaults, plain-text date-time defaults, and untyped object/list root JSON.

**Cost or risk:** Valid user intent failed before or during domain validation, schema authors could create mismatched or malformed defaults, configured rich-text allowlists were not reflected in the editor, and the generated-entry experience diverged from schema authoring. Money and external-asset defaults shared the latent class-wrapper rejection.

**Learning:** A field’s configuration default is still a value of that field. Its authoring control should reuse or match the semantic value editor; raw JSON is appropriate only where JSON itself or an arbitrary structured boundary is the product contract.

**Prevention:** Rich-text defaults now opt into the lazy official editor and store canonical Portable Text directly; its styles, decorators, and lists follow configured allowlists. Long text is multiline, date-time uses native local input with canonical instant conversion, exact decimals declare decimal input mode, and object/list JSON controls reject the wrong root shape immediately. Known class-backed rich-text, money, and external-asset defaults are copied into inert JSON before strict value validation without relaxing validation for arbitrary inputs. Interaction, pure-kernel, and PostgreSQL replacement tests cover the editor and decoded-default boundary, while the exhaustive control registry remains type-checked.

**Status:** Resolved during M7 manual review.

---

## 2026-08-09 — Mutation granularity must stop at localization authority boundaries

**Context:** The generated editor correctly projected a mixed Object into localized children, but its diff builder emitted one `set` mutation for the mixed root containing those child values.

**Incorrect assumption or decision:** Treating every displayed root as an atomic mutation target ignored that a mixed Object is only a structural container. It has no independent shared or localized authority; its children own that authority.

**Cost or risk:** The server correctly rejected valid editing intent with `entry_path_unavailable`. Allowing the root mutation instead would risk replacing sibling values from the other partition or fields hidden from the actor.

**Learning:** Form projection and mutation projection are related but distinct. Atomic fields may use root-level replacement, while mixed containers must be traversed until each mutation path ends at a field with exact shared or localized authority.

**Prevention:** The web diff kernel recursively traverses mixed Object containers and emits stable descendant paths, including nested mixed objects and scoped unsets; all other fields retain atomic root mutations. The server remains default-deny and continues to reject a mutation whose terminal field does not match its partition. Focused tests assert both behaviors.

**Status:** Resolved during M7 manual review.

---

## 2026-08-09 — Append-only integration fixtures need rollback-contained lifecycle tests

**Context:** M8 correctly rejects direct update/delete operations on publication artifacts and command receipts in PostgreSQL, including ordinary test cleanup deletes.

**Incorrect assumption or decision:** Reusing the older create-test-fixture/delete-test-fixture pattern for successful publication workflows would make cleanup itself violate the production immutability contract or require disabling the very triggers under test.

**Cost or risk:** Tests could leak durable publication history, weaken append-only enforcement during cleanup, or require unsafe privileged trigger bypasses.

**Learning:** When production artifacts are database-enforced append-only, successful integration lifecycles should execute inside a containing transaction that is deliberately rolled back after assertions. The repository needs a narrow test transaction seam without weakening the production transaction configuration.

**Prevention:** `PublicationRepository` keeps its production transaction runner explicitly configured as `READ COMMITTED`, while integration tests inject an already-open transaction/executor and roll the complete lifecycle back. Any fixture-state advancement needed after publication must use that same executor; starting an out-of-band repository transaction while the containing transaction holds source-head locks can wait indefinitely and strand setup fixtures when the test times out. Failure-injection tests use production transactions and assert every material stage rolls back naturally. No trigger is disabled and no immutable row is deleted.

**Status:** Resolved with rollback-contained publication lifecycle, shared-staleness/reference-linearization coverage, and eight-stage failure injection.

---

## 2026-08-09 — Generated foreign-key order must respect newly introduced referenced authority

**Context:** M9 added a composite current-head foreign key from typed Delivery values and a matching unique constraint on the existing publication-head table.

**Incorrect assumption or decision:** The generated migration placed the new foreign key before the new referenced unique constraint and therefore treated structurally correct final schema output as executable in arbitrary statement order.

**Cost or risk:** The first developer-controlled migration attempt failed with PostgreSQL reporting no matching unique constraint. PostgreSQL rolled the migration back transactionally, but application was delayed and required a reviewed statement-order correction.

**Learning:** A valid final Drizzle schema does not guarantee that generated cross-table constraint statements are ordered so PostgreSQL can execute them. New foreign keys that depend on new uniqueness over an existing table require explicit generated-SQL dependency review.

**Prevention:** Before developer application, inspect every generated foreign key's referenced uniqueness and ensure the primary/unique constraint is created first. After any failed application, verify table, constraint, index, and journal rollback read-only before retrying; never rewrite an applied migration.

**Status:** Resolved. The developer applied corrected migration 0009, and the live catalog verifies the authority and all four M9 tables.

---

## 2026-08-11 — Invalid reference identities must be rejected before typed database predicates

**Context:** Manual M9 fixture authoring entered a non-UUID string into a reference field and then saved the draft.

**Incorrect assumption or decision:** Draft validation correctly produced `reference_invalid`, but reference-availability collection still treated every string as queryable and passed the malformed value to a PostgreSQL UUID predicate.

**Cost or risk:** PostgreSQL rejected the cast, the typed validation result was replaced by a generic infrastructure failure, and the UI reported that a required service was unavailable. This allowed untrusted malformed input to reach a database type boundary unnecessarily.

**Learning:** Validation findings do not themselves make later database use safe. Every collector that feeds typed SQL must independently narrow untrusted values to the exact branded identity before query construction.

**Prevention:** Reference availability now collects only values accepted by the branded `EntryId` schema; malformed strings remain in deterministic validation issues and never reach SQL. PostgreSQL integration coverage asserts the typed failure. The generated form also suppresses stale server issues immediately after the corresponding field is edited.

**Status:** Resolved and deployed to the rebuilt healthy local Docker web/server services.

---

## 2026-08-11 — Publicly routable application backends are not public integration contracts

**Context:** M9 had a dedicated Delivery specification, but the server also exposed the complete dashboard oRPC reference at a public path, making internal management contracts discoverable alongside the intended public API.

**Incorrect assumption or decision:** Treating every generated OpenAPI document as equally publishable conflated three surfaces: supported developer APIs, authenticated browser application backends, and operator-only artifacts.

**Cost or risk:** A future developer portal could accidentally publish workspace, authoring, membership, credential-management, Better Auth, or operator contracts; hiding URLs alone would not secure the browser-facing management backend.

**Learning:** Public contract status must be explicit and allowlisted. Delivery/Preview/webhook APIs are portable supported integrations; dashboard RPC remains session-authenticated application infrastructure; management references and operator endpoints remain internal even when their schemas are generated and tested.

**Prevention:** M9 now exposes only a schema-reconciled Delivery specification, disables the aggregate management reference by default, and forbids it in production. M12 owns an allowlisted public contract registry and developer portal; M15 must prove host/ingress separation and route non-exposure. Management RPC still relies on authentication, authorization, tenant isolation, and browser security rather than obscurity.

**Status:** Resolved for M9; consolidated portal and production host verification are assigned to M12 and M15.

---

## 2026-08-11 — Milestone checklists must preserve every approved test-plan category

**Context:** M9's three capacity scenarios passed and were summarized as the complete production-topology load gate.

**Incorrect assumption or decision:** The completion checklist collapsed the approved performance section into its three latency rows and did not separately track the same decision's mandatory conditional-revalidation, intentional hot-identity 429, Redis outage/recovery, and oversized-response/memory gates.

**Cost or risk:** M9 was nearly presented for approval without real-topology evidence for its most important limiter degradation and resource-boundary behavior, despite the load README still stating that two profiles remained.

**Learning:** A headline baseline table is not the whole approved test plan. Completion evidence must map one-to-one to every explicit bullet and separately expected-failure profiles must never disappear into a successful-traffic summary.

**Prevention:** The M9 checklist, k6 scenario registry, wrapper, README, and baseline report now enumerate capacity, resilience, revalidation, and response-boundary profiles independently. Future milestone closure must reconcile every approved decision test bullet before `[R]` or `[A]` handoff.

**Status:** Resolved. All seven M9 profiles and final restoration/resource invariants pass.

---

## 2026-08-11 — Load gates must verify dependency paths and environment bytes, not container names

**Context:** The first M9 production-topology runs saw multi-second latency and stable authorization/rate failures despite healthy-looking server/PostgreSQL processes and a nominal Redis container.

**Incorrect assumption or decision:** The existing Redis container had no active Compose network attachment, so every primary limiter call waited for its timeout before degrading. Separately, Docker `--env-file` preserved shell-safe quote characters around credentials, IDs, slugs, and filter values; those quotes became real request data. Repeated unnamed hot-path planning also consumed avoidable PostgreSQL CPU.

**Cost or risk:** Initial load results incorrectly suggested the Delivery repository could not meet its targets, generated false invalid-credential/global-limit/404 outcomes, and saturated PostgreSQL well below the approved rates.

**Learning:** A production-style load gate must verify end-to-end dependency connectivity, exact environment bytes as seen by the load process, limiter enforcement mode, and hot query planning—not merely container health or source-file appearance.

**Prevention:** Compose Redis now uses a non-conflicting configurable host port and verified internal DNS/network connectivity; the server restarts only after Redis is healthy. The k6 wrapper sources the ignored environment and passes values by variable name rather than Docker `--env-file`. Warm-up is excluded from measured custom metrics, credentials use scenario-global round-robin selection, hot credential/Delivery reads use named prepared statements, and production load runs use error-level application logging. Final baseline and post-run resource invariants are recorded.

**Status:** Resolved. All three approved scenarios pass with zero measured errors or dropped iterations.

---

## 2026-08-12 — Git-ignored load secrets must also be excluded from Docker contexts

**Context:** M10 added a separate secret-bearing load environment file and production Docker rebuild verification.

**Incorrect assumption or decision:** The existing Delivery load file was ignored by Git but not by `.dockerignore`; `COPY . .` therefore placed it in locally built server/web image layers even though application code never read it.

**Cost or risk:** One-time load credentials and fixture authority could survive in image layers, caches, or registries and gain a wider distribution boundary than the ignored workspace file.

**Learning:** Git exclusion and Docker build-context exclusion are independent security controls. Every secret-bearing local harness file must be denied by both before any image build.

**Prevention:** `.gitignore` and `.dockerignore` now explicitly exclude both Delivery and Preview load environment files. Fresh production images were rebuilt, inspected by file existence only, and verified to contain neither file; no secret value was read or printed. With developer approval, all dangling local images containing obsolete layers were pruned while current healthy images, containers, and volumes remained.

**Status:** Resolved during M10 readiness.

---

## 2026-08-12 — k6 runtime support and audit reruns need explicit harness design

**Context:** Executing the separate M10 Preview load profiles against compliant short-lived credentials.

**Incorrect assumption or decision:** The harness used browser `URLSearchParams`, which is unavailable in the selected k6 runtime, and fixed audit request IDs did not distinguish repeated profile runs. The generic boundary latency threshold also accidentally applied to the fixed-count audit cardinality profile.

**Cost or risk:** A parser exception could produce misleading zero-sample threshold output, repeated audit runs could not be reconciled exactly, and a non-capacity audit gate could fail for an unapproved latency criterion despite perfect success/audit counts.

**Learning:** Load harness code must be validated in the actual runtime, every database-reconciled run needs a unique non-secret ID, and each profile must enforce only its approved independent gate.

**Prevention:** Preview path validation now uses k6-compatible decoding, the wrapper injects and prints a unique `PREVIEW_RUN_ID`, measured request IDs include it, ramping iterations that finish after the measured window are excluded from measured IDs/metrics, and the parallel-audit profile gates exact success/audit cardinality without inheriting capacity latency thresholds.

**Status:** Resolved during M10 load execution.

---

## 2026-08-13 — Stateful delivery transitions must be tested against all interacting constraints and partial indexes

**Context:** M11 first exercised real webhook claim, secret activation, and cancellation transitions after the schema had been applied.

**Incorrect assumption or decision:** Updating the obvious lifecycle columns was treated as sufficient. A claim incremented `attempt_count` without the check-required non-null outcome; rotation promoted the pending secret before moving the old active row out of the partial unique index; cancellation assigned an outcome even to zero-attempt deliveries, whose check requires null.

**Cost or risk:** The worker could not claim its first delivery, secret overlap activation failed transactionally, and disabling an endpoint with untouched queued work could fail instead of canceling it. Unit tests over isolated retry/crypto logic did not expose these relational transition defects.

**Learning:** A valid row before and after a state change does not imply that an arbitrary SQL update order is valid. Database checks and partial unique indexes define intermediate-state requirements, and complete transition tests must exercise zero, active, overlap, recovery, and terminal variants against the applied schema.

**Prevention:** PostgreSQL integration now covers initial claim, concurrent claim exclusion, stale recovery, stale-token finalization, active-to-retiring-before-pending-to-active rotation, ciphertext destruction, and complete endpoint/mapping lifecycle. Claims persist the fixed `attempt_started` outcome, and cancellation uses a database expression that preserves null for zero-attempt deliveries.

**Status:** Resolved in the M11 implementation committed as `fef7205`.

---

## 2026-08-13 — Historical outbox compatibility must be proven with real recursive-schema cardinality

**Context:** The authorized M11 rollout drained 10,155 pre-existing supported outbox rows after pure projector fixtures had passed.

**Incorrect assumption or decision:** The first event contract capped changed field IDs and matching system tags at 100 even though M6 bounds recursive schemas by aggregate bytes/depth, not by 100 total stable nodes. Valid historical publications contained 146 and 180 changed nodes. The dispatcher also persisted projection/fan-out row by row despite an approved 10,000-event drain target.

**Cost or risk:** Two valid rows became poison events that rolled back and indefinitely blocked the final dispatcher batch. The serial implementation needed about 34 seconds for 10,099 projections, narrowly missing the 30-second acceptance target.

**Learning:** Compatibility fixtures must include real historical maximum shapes, especially when later contracts add cardinality limits absent from the source domain. Queue workers must isolate bounded poison handling and avoid per-item database round trips when batch atomicity already exists.

**Prevention:** M11 now permits up to 1,000 stable field IDs/system field tags inside the unchanged exact 128 KiB event cap, has a 1,000-node projector boundary test, and runs batch canonical insertion, one interval-aware subscription read, bulk fan-out, and one processed-marker update. A dedicated cleaned 10,000-event profile completes in 3.625 seconds with exact reconciliation.

**Status:** Resolved before outbound worker enablement; the existing backlog is fully projected with zero missing events or deliveries.

---

## 2026-08-13 — Pinned HTTPS must follow the runtime lookup contract and measure handshake cost

**Context:** M11 moved from structural transport adapters to a controlled-TLS receiver on Node 24 and the real PostgreSQL claim/finalize path.

**Incorrect assumption or decision:** The pinned lookup always returned the legacy single-address callback shape and every request disabled agents entirely. Node 24 requested `all: true`, causing every live request to fail before TLS with a fixed invalid-address category. After correcting that shape, repeated full TLS handshakes left the approved 20 ms single-endpoint profile below 25 attempts/s even though unit adapters passed.

**Cost or risk:** Structural tests could have allowed a production worker that never reached any destination. Treating cryptography/network setup as free would also hide a real throughput miss and encourage raising endpoint concurrency without evidence.

**Learning:** SSRF-safe pinning must honor every supported runtime lookup callback shape, and transport acceptance must include real certificate/SNI/handshake behavior. A private non-keepalive agent can retain a bounded TLS session cache without reusing sockets or bypassing the per-attempt pinned lookup.

**Prevention:** Transport tests now cover Node's `all: true` array callback. The controlled-TLS gates exercise SNI/certificate verification and exact receiver counts. The transport uses `keepAlive: false` with at most 100 cached TLS sessions; every request still creates a connection and invokes its validated pinned lookup. The accepted single-endpoint profile now sustains 25.61 attempts/s at 20 ms receiver latency.

**Status:** Resolved in the M11 implementation committed as `fef7205`.

---

## 2026-08-13 — Automated readiness does not replace requirement-by-requirement UI reconciliation

**Context:** M11 reached a clean automated/load/readiness gate and was handed off for manual Webhooks review.

**Incorrect assumption or decision:** The first handoff treated management APIs plus partial endpoint/mapping/delivery controls and broad axe coverage as equivalent to the approved Dashboard UX checklist. It did not explicitly reconcile every visible field, complete-set subscription/edit flow, exact mapping scope, URL filter, pagination, consequence confirmation, and event-detail requirement.

**Cost or risk:** The developer would have started manual review without subscription replacement, mapping edit and exact entry/locale scope, delivery filters/load-more, complete delivery/endpoint summaries, canonical event detail, or required replay/lifecycle guidance. Passing backend tests could have obscured a materially incomplete operator workflow.

**Learning:** A feature with an approved UI decision needs a final requirement-to-control matrix in addition to route existence, mutation coverage, and accessibility checks. Automated readiness proves the implemented surface is healthy; it does not prove every approved surface was implemented.

**Prevention:** Before requesting manual review, enumerate each Dashboard UX bullet against a concrete rendered control and interaction test. M11 now covers endpoint/subscription/rotation summaries and consequences, editable exact-scope mappings and system tags, URL-bound filters, keyset pagination, complete delivery/event/attempt detail, and confirmed replay semantics.

**Status:** Resolved in the M11 implementation committed as `fef7205`; refreshed readiness and Docker health pass.

---

## 2026-08-13 — A delivery-enabled local worker must not share an integration-test database

**Context:** M11 live testing enabled the Compose webhook worker against the same local PostgreSQL database used by repository integration suites.

**Incorrect assumption or decision:** The full readiness suite was started while that independent worker remained active. It claimed newly committed test outbox rows before each suite's teardown could remove them.

**Cost or risk:** The worker created five immutable canonical events and consumed delivery fixtures, causing unrelated cleanup foreign-key failures and claim assertions. The leaked rows were test-only, but required developer-authorized, precisely scoped transactional cleanup.

**Learning:** In-process test isolation cannot control an independently running consumer of the same database. Queue integration suites need a separate database or an explicit operational exclusion around all external workers.

**Prevention:** Stop the local worker before PostgreSQL integration/coverage gates and verify its actual process/container state immediately before the gate; do not rely on a stop command placed after earlier `&&` steps that may short-circuit. Remove only explicitly identified test fixtures if an accidental claim occurs, and restart it only after validation. Production workers and tests should use isolated databases in deployment/CI topology.

**Status:** Resolved again during M13: after developer authorization, the Compose worker was directly stopped and verified immediately before all shared-database normal/coverage gates. All 713 API and 124 server tests passed, scoped residue/invariants reconciled cleanly, and the worker was restarted healthy. Focused runs now use `pnpm --dir <package> exec vitest run <exact-file>`.

---

## 2026-08-22 — Register integration-fixture cleanup before the first persistent write

**Context:** The final M12 OAuth Tooling HTTP readiness suite created a realistic user/project/published-schema fixture in PostgreSQL.

**Incorrect assumption or decision:** Its first implementation assigned the teardown function only after the complete fixture and OAuth token had been created. An early device-approval assertion failure therefore occurred before teardown existed. Later, Turbo canceled a concurrently running readiness process when an unrelated workspace coverage test failed, interrupting `afterAll` even after teardown registration.

**Cost or risk:** Two uniquely prefixed test graphs containing projects, schema revisions, and audits survived failed/canceled runs and required developer-approved, transactionally scoped cleanup after proving they contained no content publications. A green rerun alone would not reveal or remove prior residue.

**Learning:** Persistent integration fixtures need cleanup authority registered before their first write, but process-level cancellation can still bypass framework teardown. Final database-backed readiness must include an explicit read-only residue reconciliation after all parallel gates, not rely only on `afterAll`.

**Prevention:** Register idempotent fixture cleanup before sign-up/insertion, use unique test namespaces, stop external consumers, keep destructive cleanup scoped and developer-approved, and perform a final read-only namespace/outbox/work verification after the complete gate. Avoid treating a canceled parallel suite as clean merely because its next isolated rerun passes.

**Status:** Resolved for M12; teardown is registered before setup, both exact stale graphs were transactionally removed with developer approval, and final reconciliation reports zero matching users, pending outbox rows, active deliveries, or started attempts.

---

## 2026-08-23 — Public-boundary proof is not developer-documentation acceptance

**Context:** The first M12 portal implementation passed closed-route, artifact-byte, prerender, security-header, accessibility, and bundle gates, but represented documentation as 10 short TypeScript objects and reference pages as artifact metadata.

**Incorrect assumption or decision:** Automated proof that a portal published only safe contracts was treated as evidence that it delivered the complete developer learning experience. The implementation optimized the boundary and contract download before validating the developer's expected Better Auth/Next.js-style onboarding, concepts, SDK, CLI, webhook, guide, troubleshooting, and secondary-reference journey.

**Cost or risk:** Manual review reopened M12 after complete automated readiness. The custom content shell and registry had to be replaced, dependencies and bundle budgets changed, and the final gate had to be rerun.

**Learning:** Documentation has two independent acceptance dimensions: public-surface correctness and developer task success. Both must be designed and manually reviewed. Wire-contract references are secondary support; they do not substitute for product-oriented onboarding and workflows.

**Prevention:** Define the first-success journey and complete information architecture before implementing the portal shell. Use source-controlled MDX for authored teaching, canonical generated artifacts for structural reference, compiling examples for code, self-hosted public-only search, and a bounded compatibility slice before broad content migration.

**Status:** Resolved and developer-approved in M12 with self-hosted Fumadocs on the existing TanStack Start app, 27 MDX pages, static search, canonical secondary references, and renewed readiness.

---

## 2026-08-23 — Stable source identity does not classify collection API-key renames

**Context:** M13 resolved code collections through the existing M5/M6 classifier so source-key API-key renames would preserve stable IDs while retaining breaking-change acknowledgement.

**Incorrect assumption or decision:** The existing classifier covered field API-key changes but did not compare the published collection API key with the candidate collection API key.

**Cost or risk:** A code-owned collection API-key rename could change the public contract without producing the required breaking change or exact acknowledgement, despite stable collection identity being preserved.

**Learning:** Identity reconciliation and compatibility classification are separate authorities. Stable source/collection IDs prevent replacement; they do not make API-key changes non-breaking. Candidate parity tests must enumerate collection-level contract fields as well as field-level changes.

**Prevention:** The shared classifier now emits breaking `collection.api_key.updated`, with a deterministic test proving the collection ID remains unchanged. M13 project qualification reuses that change rather than maintaining a second classifier.

**Status:** Resolved in the active uncommitted M13 implementation; the full 1,007-test normal/coverage readiness gate passes.

---

## 2026-08-24 — Authority hashes must not depend on locale collation

**Context:** M13 backfilled immutable revision structure hashes in PostgreSQL and then compared every migrated hash with the application projection.

**Incorrect assumption or decision:** Canonical arrays were sorted with JavaScript `localeCompare`, while the migration correctly used PostgreSQL `COLLATE "C"`. Locale collation treats punctuation such as hyphens and underscores differently from byte/code-unit order.

**Cost or risk:** Three existing revision hashes differed between persistence and application authority even though both projected the same fields. Future plan/apply comparisons could have reported false drift across runtimes or locales.

**Learning:** Hash canonicalization must use an explicit locale-independent lexical comparator at every ordering boundary. Human-language collation is never suitable for authority bytes.

**Prevention:** Shared canonical sorting now compares code units directly, punctuation-order regression coverage is required, and post-migration verification recomputes every persisted revision hash through the application algorithm.

**Status:** Resolved in the active M13 worktree; all 31 migrated revision hashes match after the comparator correction.

---

## 2026-08-24 — PostgreSQL identifier limits apply to generated constraint names

**Context:** M13 added credential alternatives and Drizzle-generated inline foreign keys alongside explicit composite tenant foreign keys.

**Incorrect assumption or decision:** Generated inline foreign-key names were accepted without checking PostgreSQL's 63-byte identifier limit.

**Cost or risk:** Eighteen credential/user foreign-key names were silently truncated in the live catalog, diverging from snapshot names and making future schema reconciliation brittle. Credential direct foreign keys were also redundant with stronger composite tenant foreign keys.

**Learning:** Generated DDL must be checked against database identifier limits, not only TypeScript schema names. Redundant single-column credential foreign keys should not accompany tenant-qualified composite authority.

**Prevention:** Credential columns rely only on explicitly named composite tenant foreign keys; the project apply user foreign key has a short explicit name; schema-contract tests reject redundant credential foreign keys; post-application catalog verification checks exact validated constraint names.

**Status:** Resolved through developer-generated/applied migration `0014_normalize_authoring_actor_foreign_keys`; read-only verification confirms the intended short user constraint, 22 tenant-qualified credential constraints, and no redundant truncated direct credential constraints.

---

## 2026-08-24 — New actor foreign keys invalidate legacy credential-first fixture teardown

**Context:** An exploratory Authoring HTTP success test reused the broad platform integration fixture and created an immutable schema-apply receipt attributed to a management credential.

**Incorrect assumption or decision:** The test treated the platform fixture's existing cleanup as sufficient even though that cleanup deletes credentials before the M13 apply receipt and immutable schema graph that now reference them.

**Cost or risk:** Every assertion passed, but `afterAll` failed on the tenant-qualified credential foreign key and left one test graph plus its empty peer workspace for explicitly approved scoped cleanup. A successful behavior test was therefore not a clean test.

**Learning:** Adding a successful mutation to an older integration fixture changes that fixture's ownership graph. Assertion success is insufficient; teardown order must include every new dependent table before any referenced actor or tenant row.

**Prevention:** Keep Authoring apply success/replay proof in its transaction-contained repository fixture until a dedicated HTTP fixture owns the complete M13 graph. Before adding cross-layer mutation tests, inventory all new actor/receipt/revision/outbox foreign keys, register idempotent cleanup before the first write, run the teardown path explicitly, and reconcile the unique namespace read-only afterward.

**Status:** Resolved; the mutating platform test was removed, its exact failed graph and empty peer were deleted after developer approval, and the retained HTTP test covers read-only planning plus pre-persistence scope denial.

---

## 2026-08-24 — Server image builds must include runtime-externalized workspace distributions

**Context:** The Authoring transport made the server bundle reach the runtime validator exported by the new `@framerfordevs/schema` workspace.

**Incorrect assumption or decision:** A successful host `tsdown` build was treated as sufficient even though the bundle left the workspace import external and the server Dockerfile built only `apps/server`.

**Cost or risk:** The first rebuilt image restarted with `ERR_MODULE_NOT_FOUND`: first the package was not linked directly, then its declared `dist/validate.mjs` did not exist in the image. Host tests and builds had masked the production package-resolution boundary.

**Learning:** A workspace import externalized from an application bundle is a runtime dependency, even when reached transitively through another workspace. Its package link and built export must both exist in the production image.

**Prevention:** Declare runtime-externalized workspaces directly in the consuming application through pnpm, build their distributions before the application bundle in the Dockerfile, and verify the rebuilt container plus one exact artifact/route request rather than relying only on host builds.

**Status:** Resolved; the server declares `@framerfordevs/schema`, the image builds it first, the rebuilt container is healthy, and its Authoring artifact bytes match canonical source.

---

## 2026-08-24 — Named SDK envelopes do not prove exact DTO parity

**Context:** The M13 Authoring SDK added named response classes and safe helpers for every current HTTP path.

**Incorrect assumption or decision:** Top-level operation-specific class names were treated as complete strict DTO decoding even though schema export/plan/apply nested records and all write request bodies still used generic JSON-object contracts.

**Cost or risk:** Progress and context briefly overstated SDK completion. Malformed or excess nested schema authority could pass SDK decoding, and consumers lacked operation-specific write input types despite the canonical HTTP contract being stricter.

**Learning:** SDK contract parity is recursive and bidirectional. A named outer envelope is not an exact client contract when nested response authority or request bodies remain generic.

**Prevention:** Reconcile every SDK operation against the canonical request and response schema field by field; reject nested excess properties and bounds; test malformed inputs at each level; and do not mark the SDK complete until generated declarations expose operation-specific request and response types.

**Status:** Resolved. Every current operation now exposes runtime-validated request types and recursively exact response/error decoding; the SDK directly uses the shared dependency-free project validator, and representative malformed/excess/boundary tests pass.

---

## 2026-08-24 — Pre-auth execution requires a separate module graph, not only command ordering

**Context:** The explicit experimental `ffd schema build` command was first added as a branch inside the existing CLI entry module.

**Incorrect assumption or decision:** Running the build branch before token acquisition was treated as credential isolation even though static imports and the module-level `ManagedRuntime` still loaded or constructed credential-store, OAuth, Tooling, and authenticated command dependencies before command dispatch.

**Cost or risk:** The command behavior did not read a token, but its process construction violated the approved credential-unreachability boundary and made a future import-side effect capable of reopening credential authority.

**Learning:** A pre-auth security boundary is defined by the loaded and constructed dependency graph, not by which branch executes first. Credential-bearing services must be unreachable by module construction as well as unused at runtime.

**Prevention:** Keep the package binary as a minimal dynamic dispatcher. Load `schema build` through a dedicated credential-blind module and load authenticated commands through a separate module only for other commands. Packaged tests recursively inspect the schema-build static import graph for keyring, management-token, OAuth, Tooling, and Authoring dependencies and execute hostile token/file/network probes against the built artifact.

**Status:** Resolved before release staging. The packaged CLI preserves dynamic pre-auth dispatch, schema build constructs no credential/API service graph, and the credential-blind artifact and hostile execution gates pass.

---

## 2026-08-25 — Parallel database fixtures must publish valid aggregates atomically

**Context:** With the external worker correctly stopped, the full API suite ran the webhook management and webhook-worker repository fixtures in parallel against the same baseline project.

**Incorrect assumption or decision:** The worker fixture inserted an endpoint, destination, secret, subscription, and enabled pointer through separate committed statements. During the short interval before the subscription insert, the management fixture could list that endpoint and correctly reject its impossible zero-subscription aggregate.

**Cost or risk:** One full API run failed despite the production repositories behaving correctly. A focused rerun passed, which could have hidden a deterministic cross-file race and left normal parallel readiness flaky.

**Learning:** Stopping external consumers is necessary but not sufficient for shared-database isolation. A test fixture that represents one valid aggregate must become visible atomically, especially when parallel suites intentionally query broad tenant collections.

**Prevention:** The worker fixture now inserts the endpoint, destination, secret, subscription, and enabled pointer in one database transaction. The two webhook integration files pass together in parallel, and complete 713-test normal/coverage API gates pass with zero scoped residue.

**Status:** Resolved in the active M13 worktree; no production persistence behavior or migration changed.

---

## 2026-08-25 — Successful HTTP publication fixtures must roll back, not delete, immutable artifacts

**Context:** M13 needed a real public-HTTP fixture covering schema apply plus exact-locale create/save/publish/unpublish, replay, conflicts, and credential attribution.

**Incorrect assumption or decision:** The first fixture committed publication artifacts and planned to delete its graph in `afterAll`, overlooking the database triggers that correctly prohibit deletion of publication rows and command receipts. One run also used a single weighted-rate-limit identity for every schema and content request. A later dynamic Vitest runtime-module mock was assumed to provide deterministic repository substitution, but one rerun bypassed it and committed the publication.

**Cost or risk:** Teardown failed closed after one publication, requiring developer-approved exact cleanup with a temporary trigger bypass. The single principal also reached its legitimate weighted quota before unpublish. A second draft-only run exposed a missing workspace-level audit cleanup predicate, and the nondeterministic module mock later leaked one more exact publication graph; both were separately reconciled and removed with developer approval.

**Learning:** Append-only integration artifacts cannot be made teardown-safe by adding more delete statements. End-to-end HTTP tests need the real repository bound to a test-owned rollback transaction at the Effect service boundary. Distinct least-privilege principals should represent independently quota-controlled workflows.

**Prevention:** `createApp` now accepts a closed process-owned Authoring Effect transform, and every Authoring `Context` applies that transform before the shared runtime boundary. The fixture deterministically provides only a transaction-bound real `PublicationRepository`; publish, replay, conflict, status, and unpublish still execute through Express and production operations while immutable writes roll back. Setup registers exact cleanup before its first write, separate least-privilege credentials respect quotas, and post-suite namespace/outbox/receipt reconciliation is zero. The default live wiring and immutable triggers remain unchanged; runtime module mocking is no longer used.

**Status:** Resolved in the active M13 worktree. All 135 server tests and 718 API tests pass in normal and coverage runs with zero matching residue.

---

## 2026-08-25 — Query-plan tests must accept equivalent bounded indexes

**Context:** Presentation publication added bounded lookup plan assertions and the full API coverage run repeated the existing schema-list plan gate against a small shared fixture database.

**Incorrect assumption or decision:** The assertions required one exact index name even though PostgreSQL could legitimately select another environment-leading or collection-leading index with equivalent bounded access under the fixture's tiny statistics. `enable_seqscan = off` prevents sequential scans; it does not force the most semantically obvious index.

**Cost or risk:** Production queries remained parameterized and bounded, and focused reruns passed, but one complete coverage run failed nondeterministically on an exact planner-choice assertion.

**Learning:** Query-plan evidence should prove the required access shape and approved index family, not one optimizer tie-break. Exact index assertions are appropriate only when no equivalent leading-prefix plan exists.

**Prevention:** Presentation and schema plan tests now accept the reviewed environment- and collection-leading index alternatives while continuing to reject sequential access, assert the relevant lookup predicates, and verify the intended indexes exist in PostgreSQL.

**Status:** Resolved in the active M13 worktree; the subsequent 718-test API coverage run passes.

---

## 2026-08-25 — Runtime-exact unions also need discriminated public TypeScript types

**Context:** The shared content-form package added an adapter from the strictly decoded Authoring SDK generated-form DTO into its exhaustive 18-kind renderer DTO.

**Incorrect assumption or decision:** The SDK runtime schema was an exact union of 18 field variants, but its exported recursive TypeScript interface represented `kind` as one broad union and `configuration` as generic JSON. Runtime safety was preserved, yet TypeScript could not correlate money, enum, reference, or nested child configuration with the selected kind.

**Cost or risk:** A browser adapter could not prove exhaustive, assertion-free projection from the SDK type even though the value had already passed strict runtime decoding. Leaving the mismatch would encourage unsafe casts or duplicate ad hoc validation in the local editor.

**Learning:** Runtime discriminants and compile-time discriminants are separate authorities. A recursively exact schema must export a correspondingly discriminated TypeScript union when downstream exhaustive adapters depend on kind-specific properties.

**Prevention:** The SDK field type is now a mapped discriminated union, and its schema variant helper preserves the literal kind generically. Cross-package compile tests prove both management and Authoring DTOs enter the renderer adapters without assertions; the browser package still projects only its minimal inert fields.

**Status:** Resolved in the active M13 worktree; SDK, content-form, dashboard, and workspace type gates pass.

---

## 2026-08-26 — Local editor authority and form hydration must have explicit lifetimes

**Context:** The first hardened local-editor pass captured the hosted bearer in a long-lived SDK client, allowed the OS browser opener to inherit the management-token environment, and rehydrated controlled form state whenever the periodically refreshed generated-form object changed.

**Incorrect assumption or decision:** Nulling the outer token variable was treated as clearing credential authority even though the gateway's SDK closure retained the original string. Separately, a data-fetch object identity was treated as draft identity, so an equal presentation refresh could become an implicit form reset.

**Cost or risk:** A closed loopback server could retain credential material beyond intended shutdown ownership, the detached browser-opener process could receive unrelated write authority, and a hosted presentation refresh could silently discard unsaved local edits despite the editor's conflict-preservation promise.

**Learning:** Secret lifetime and controlled-edit lifetime need explicit mutable authorities. Clearing one reference does not clear copies captured by long-lived clients, and query-object identity is not persisted draft authority.

**Prevention:** The editor gateway now receives a mutable token getter and creates the strict SDK client only for each request; management authority is removed from `process.env` after acquisition, every browser-opener child receives a sanitized environment, and shutdown nulls the getter before awaiting in-flight refresh and closing the watcher/server. Form hydration is keyed by entry, schema revision, and both partition versions/revisions, while equal form/presentation refreshes preserve controlled values. Tests prove post-close token unreachability, opener-environment isolation, live presentation polling without local reset, conflict preservation, and explicit versioned reload.

**Status:** Resolved in the active M13 worktree.

---

## 2026-08-27 — Full parallel readiness needs explicit interaction budgets and cancellation-aware residue gates

**Context:** The final M13 `pnpm run ready` runs database suites, lazy React interactions, coverage instrumentation, and all workspaces concurrently.

**Incorrect assumption or decision:** Focused interaction timings and framework default five-second test timeouts were treated as sufficient under full coverage contention. Several failed readiness attempts then canceled still-running database workspaces; framework teardown could not complete every already-persisted fixture graph.

**Cost or risk:** Correct editor and schema-workbench interactions flaked only in the aggregate gate, while canceled Authoring/Tooling/schema fixtures left precisely identifiable test-only users, drafts, audits, and outbox rows in the shared database. Re-running successfully did not remove prior canceled-run graphs.

**Learning:** A focused pass is not a full-readiness latency bound, and process cancellation is outside `afterAll` authority. Meaningful lazy or multi-step interaction tests need explicit bounded waits/test budgets derived from the aggregate coverage run. Every complete shared-database gate still needs post-run read-only namespace reconciliation even when the final run passes.

**Prevention:** The editor and lazy schema-workbench tests now use explicit 15–30 second aggregate test budgets and a five-second lazy-query wait while retaining measured production interaction ceilings separately. The current full gate passes 1,192 tests. Read-only reconciliation isolated the canceled-run graph before developer-approved cleanup. The first guarded cleanup transaction rolled back unchanged when its project-only audit predicate missed 16 workspace-level rows; renewed approval and a workspace-scoped predicate then removed exactly 10 users/projects, eight workspaces, six draft entries, 16 outbox rows, 14 derived publication events, and 178 audits, with zero immutable content-publication artifacts.

**Status:** Resolved. Post-cleanup residue and invariant checks pass, supported outbox projection is current, and the worker was restarted healthy.

---

## 2026-08-27 — A verified release image is not the active manual-review runtime

**Context:** M13 manual scenario 1 used the healthy local Compose stack after final package/image evidence had passed.

**Incorrect assumption or decision:** Building and inspecting the final server image was treated as sufficient runtime provenance, but Compose still ran a three-day-old `latest` image. That server returned an older schema-export DTO without required `revisions`; the current strict SDK correctly rejected it as `CLI_AUTHORING_TRANSPORT`.

**Cost or risk:** Manual review could misclassify deployment drift as a CLI/SDK defect or evaluate stale dashboard/server behavior despite green release artifacts.

**Learning:** Artifact provenance and active-runtime provenance are separate gates. Health checks prove process liveness, not that a container runs the reviewed image or DTO version.

**Prevention:** Before manual review, compare active container image IDs with reviewed artifacts, rebuild UI images from the current worktree, recreate services, and then probe one strict cross-package operation. The review stack now runs refreshed server image `fb668f98…` and current dashboard image `632acd10…`; strict schema export, immutable Tooling reads, and generation pass.

**Status:** Resolved during manual scenario 1.

---

## 2026-08-28 — Individually valid workflows can collide at shared serialization and ownership boundaries

**Context:** Fresh M13 manual scenarios chained dashboard-authored export, immutable Tooling reads, config-v2 generation, and presentation-only publication for the first time outside synthetic fixtures.

**Incorrect assumption or decision:** Tooling fixtures always supplied optional enum defaults, so internal contract objects containing `undefined` were never exercised at the recursively exact JSON boundary. Separately, code-first authoring lock v2 and the legacy generated-consumer transaction both claimed `.framerfordevs/schema.lock.json`, although each workflow passed independently.

**Cost or risk:** Immutable revision reads returned sanitized 503 responses for enums without defaults, and generation could not coexist with an exported authoring lock. An initial boundary fix that omitted `undefined` also broke contract-hash parity because established canonical hashing maps it to `null`.

**Learning:** Cross-workflow acceptance must compose real outputs, not only test each command in isolation. Public JSON normalization must preserve canonical hash semantics exactly, and separate owners must never overwrite one path merely because both artifacts are called a lock.

**Prevention:** Tooling now maps JavaScript-only `undefined` recursively to canonical JSON `null`, with enum/money/rich-text regression coverage, preserving the established contract hash. Config v2 keeps authoring authority at `.framerfordevs/schema.lock.json` and generated ownership at `.framerfordevs/generated.lock.json`; config v1 remains compatible. Filesystem tests prove the generated transaction preserves the authoring lock, and clean manual export/generate/presentation/export/generate now succeeds without `--force`.

**Status:** Resolved during manual scenario 2. Refreshed 1,192-test readiness, package/image inspection, zero-residue reconciliation, database invariants, and healthy worker evidence pass.

---

## 2026-08-28 — Local editor defaults and retry recovery must derive from hosted and persisted authority

**Context:** M13 manual scenario 3 opened a real project whose supported locales are `en` and `hi`, then exercised create/save recovery through the loopback editor.

**Incorrect assumption or decision:** The browser defaulted to hardcoded `en-US` instead of hosted locale authority. Separately, the Promise boundary assumed `Effect.runPromise` would reject with the typed retry-journal error directly, so a real pending-command conflict was mislabeled as upstream 502. During diagnosis, a retained command ID was replayed manually without first proving that the stored local fingerprint represented the same request; the server result was valid, but the local journal could not reconcile a different fingerprint.

**Cost or risk:** Valid forms appeared to have no entries, actionable local command conflicts looked like hosted outages, and manual recovery required exact server/row reconciliation plus developer-approved local-journal cleanup before further mutation.

**Learning:** Locale defaults are hosted project authority, not UI conventions. Effect failures crossing into Promise code must be explicitly unwrapped before tag-based classification. A content-free command ID alone is insufficient proof of retry equivalence; the persisted operation and fingerprint remain part of idempotency authority.

**Prevention:** Editor status now loads a bounded locale list from the Tooling manifest, verifies its resolved environment, defaults to the first hosted locale, and suppresses locale-partition reads/writes until a locale is selected. The journal boundary uses `runPromiseExit` to recover typed failures and maps real conflicts to `409 EDITOR_COMMAND_PENDING`, with a filesystem-backed regression test. Future direct retry diagnostics must recompute and compare the exact local fingerprint before sending; otherwise stop and reconcile server state before seeking approval to clear only the proven journal.

**Status:** Resolved during manual scenario 3. Twenty-seven focused editor tests, CLI/editor type checks, and the production build pass; the developer confirmed five-field local/dashboard parity, exact-locale draft save, and publication.

---

## 2026-08-28 — New aggregate creation must preserve companion-feature invariants and actor unions

**Context:** M13 manual scenario 5 created two mutually referencing collections through code-first apply and then opened them in the retained dashboard builder.

**Incorrect assumption or decision:** Authoring apply reproduced the core collection/schema graph but omitted the M9 protected Delivery configuration that dashboard collection creation always seeds. After exact repair, the legacy Delivery management DTO still required a human updater even though the database and M13 authority model correctly attributed creation to a management credential.

**Cost or risk:** Entries and reciprocal references worked, but the retained builder first failed with Delivery 404 and then 503 at response decoding. A future user update would also have set a user actor without clearing the prior credential actor, violating exactly-one actor authority.

**Learning:** A second creation path must inventory every required companion row introduced by later milestones, not only the owning aggregate's original tables. Once persistence permits user-or-credential attribution, every reader, DTO, updater, and UI fixture crossing that row must represent the same union honestly.

**Prevention:** Code-first allocation now creates a version-1 protected Delivery configuration in the same transaction as every new collection and schema head. PostgreSQL mutual-reference coverage counts both companion rows and existing failure injection covers rollback. Delivery management output now carries nullable user and credential actor IDs, maps both from persistence, and clears credential attribution on a later human update. The two pre-fix review rows were repaired only after exact developer approval and guarded reconciliation.

**Status:** Resolved during manual scenario 5. Focused PostgreSQL, API contract/operation, dashboard interaction, type-check, build, zero-residue, healthy-worker, and refreshed healthy-server evidence pass; the developer confirmed both collection builders load.

---

## 2026-08-28 — OAuth user policy needs exact locale context before content pre-resolution

**Context:** M13 manual scenario 6 used the real device flow and native credential store, then ran the same exact-locale content commands previously exercised through management credentials.

**Incorrect assumption or decision:** Authoring content helpers authorized `content.read` or `content.write` while resolving collection/mutation authority but did not yet supply the requested locale ID. Credential policy does not model member locale restrictions, so management tests passed; user policy correctly rejects every locale-scoped action with missing locale context. Separately, the production-mode local image correctly rejected an HTTP OAuth resource, requiring an explicit temporary development-mode review topology rather than weakening HTTPS validation.

**Cost or risk:** OAuth schema plan succeeded while OAuth content list returned a misleading-looking forbidden result for an owner with all-locale access. Without correction, every OAuth content operation would fail before reaching repositories that already enforced the exact locale.

**Learning:** Authentication scope success is not authorization-context completeness. Every user content preflight must resolve and pass the exact enabled locale before policy evaluation; management success cannot substitute for OAuth/user coverage. Local HTTP OAuth review must use an explicitly temporary non-production runtime, never a production HTTPS exception.

**Prevention:** Collection and mutation authority helpers now resolve the enabled locale ID first and pass it through all list/get/create/rename/save/status/validate/publish/unpublish paths. Generated form reads use role-projected project visibility because the form route has no locale, while exact mutations remain locale-authorized. A real user-actor PostgreSQL regression proves exact-locale resolution. OAuth was enabled only in a temporary development-mode container, then native authority, temporary refresh/device rows, the container, and the setting were removed; normal production-mode Compose is healthy with OAuth disabled.

**Status:** Resolved during manual scenario 6. OAuth schema/read/update/publication passed with exact user attribution; a schema-read-only management credential was allowed only for export and denied elsewhere. Focused API, PostgreSQL, dashboard, type-check, build, cleanup, and runtime-health evidence pass.

---

## 2026-08-28 — A healthy test port does not prove the intended receiver owns it

**Context:** M13 manual scenario 7 started an approved local webhook receiver and ngrok tunnel while an older hardened receiver container already bound loopback port 8787.

**Incorrect assumption or decision:** The startup script launched a host receiver in the background and then treated a successful `/health/ready` probe as proof that the new process owned the port. The host process had actually exited with `EADDRINUSE`; the probe reached the pre-existing receiver, whose different secret mount correctly returned signed webhook attempts as 503.

**Cost or risk:** The publication webhook accumulated bounded retries before the correct receiver secret was installed. Liveness alone could have attributed evidence to the wrong process or storage root.

**Learning:** Test-runtime provenance requires listener/process/container identity in addition to port health, just as application runtime provenance requires image identity in addition to container health.

**Prevention:** Before starting a receiver, inspect the bound listener and container ownership, verify the launched PID remains alive, and verify its configured evidence/secret roots before exposing a tunnel. Scenario 7 reused the already-hardened receiver intentionally after identification, installed the exact ignored mode-600 secret, reconciled attempts, and then removed only the scenario event captures and secret after disabling the endpoint.

**Status:** Resolved during manual scenario 7. Published delivery ultimately verified and succeeded; unpublish succeeded on its first attempt. Tunnel, local secret, and exact captures are removed while durable platform delivery history remains intact.

---

## 2026-08-29 — Deleting `process.env` does not erase Linux initial-environment bytes

**Context:** M13 manual scenario 10 inspected browser, filesystem, process arguments, and Linux `/proc/<pid>/environ` while the long-lived local editor was running from an exported management token.

**Incorrect assumption or decision:** Removing `FFD_MANAGEMENT_TOKEN` from Node's `process.env` was treated as removal from the process environment. Node and sanitized opener children no longer observed the key, but Linux retained the original initial-environment bytes in `/proc` for the lifetime of the process.

**Cost or risk:** The browser and child processes remained isolated, but another same-user process with permitted `/proc` access could still recover initial environment authority. Documentation overstated long-lived process-environment removal.

**Learning:** A secret-bearing process cannot reliably scrub its initial OS environment in portable JavaScript. The long-lived process must start without the secret; clearing a language/runtime map afterward is insufficient.

**Prevention:** `ffd editor --token-stdin` accepts one bounded whitespace-free management token only after credential-blind local schema preparation, rejects simultaneous exported management authority, and keeps the token out of initial OS environment and process arguments. Documentation now prefers OAuth native storage when enabled or a non-exported shell variable piped to this mode. Legacy environment support remains for compatibility but is no longer the recommended secure editor launch.

**Status:** Resolved during manual scenario 10. `/proc` and command-line inspection of the stdin-launched editor proved no credential environment keys or arguments; DevTools/browser/local persistence checks passed, 36 focused tests and CLI/editor type-check/build pass, and clean shutdown left no journal.
