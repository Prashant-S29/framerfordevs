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

**Prevention:** M9 now exposes only a schema-reconciled Delivery specification, disables the aggregate management reference by default, and forbids it in production. M12 owns an allowlisted public contract registry and developer portal; M14 must prove host/ingress separation and route non-exposure. Management RPC still relies on authentication, authorization, tenant isolation, and browser security rather than obscurity.

**Status:** Resolved for M9; consolidated portal and production host verification are assigned to M12 and M14.

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

**Prevention:** Stop the local worker before PostgreSQL integration/coverage gates, verify it is stopped, remove only explicitly identified test fixtures if an accidental claim occurs, and restart it only after validation. Production workers and tests should use isolated databases in deployment/CI topology.

**Status:** Resolved for the current M11 validation run; durable database isolation remains an environment concern.

---

## Current implementation learnings

The platform authorization, locale foundations, versioned schema engine, field system, schema-authoring workbench, stable entries, multilingual drafts, revision history, independent locale publication, immutable Delivery snapshots, Production Delivery API, Preview API, publication events, webhooks, retries, and invalidation are developer-approved and committed through Milestone 11 at `fef7205`. M11 migrations `0010` and `0011` are developer-applied and read-only verified. The approved repository test-structure normalization is committed at `fe69a76`. Additional entries should be added only when consequential drift or rework occurs.
