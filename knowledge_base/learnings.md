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

## Current implementation learnings

The platform authorization, locale foundations, versioned schema engine, field system, and schema-authoring workbench are approved and committed through Milestone 6 at `fbb4767`. Milestone 7 implementation and refreshed automated readiness are complete with CMS-only entry names, locale-neutral lists, URL-driven locale editing, stable multilingual drafts, revision history, corrected type-appropriate defaults and Portable Text hydration, error-free unpublished-schema empty states, 603 passing tests, clean audits, and clean read-only database invariants. M7 remains active until the developer completes resumed English/Hindi/Gujarati review and explicitly approves it. Additional entries should be added only when consequential drift or rework occurs.
