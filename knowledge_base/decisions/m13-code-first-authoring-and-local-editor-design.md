# Milestone 13 code-first authoring and local editor design

**Status:** Developer approved on 2026-08-23; implementation is not authorized. Exact parser/transpiler/isolate selection and schema-build performance acceptance remain behind the approved evidence and second-approval gate.

**Date:** 2026-08-23

## Decision summary

Milestone 13 will make collection structure and content workflows usable by code, CLI, scripts, and a localhost editor without weakening the existing schema, draft, publication, security, or concurrency authorities.

The design uses:

- A publishable, dependency-light `@framerfordevs/schema` declarative TypeScript contract in the developer's repository, extracted statically without executing project code
- An optional, explicitly invoked `ffd schema build` tier that runs composable schema code in a capability-denied, credential-blind isolate and commits ordinary declarative output for the unchanged extractor
- Immutable authoring source keys that reconcile code definitions to server-generated collection, field, and enum-option IDs
- A separate allowlisted Authoring API v1 rather than changing the released read-only semantics of Tooling v1
- A project-level schema plan/apply protocol that reuses the M5/M6 validator and classifier, requires exact risky-change acknowledgements, and atomically publishes all changed collection revisions with outbox events
- A separate structural hash so code drift is distinguishable from GUI-owned presentation changes
- Existing management-credential scopes and new narrow OAuth grants for authoring read, draft write, content publication, and schema push
- Credential-aware actor attribution without impersonating the user who issued a management credential
- API-key-path content mutations translated server-side to stable field-ID mutations before the existing M7/M8 engines run
- An extracted browser-safe generated-form package shared by the dashboard and local editor
- `ffd editor`, distributed in the CLI npm package, as a loopback-only local server and browser UI; the hosted bearer token remains in the Node process and is never exposed to browser JavaScript
- A dedicated dashboard presentation editor for labels, help, placeholders, field order, tabs, groups, sidebar placement, and role visibility
- Removal of dashboard collection-structure mutation routes and controls after code export/adoption support is available

The developer approved this design and all 19 explicit decisions on 2026-08-23 without authorizing implementation. This approval is not exact dependency selection: the named parser/transpiler/isolate evidence slice, measured schema-build baseline, and second dependency/performance approval remain mandatory before implementation authorization. Feature code, dependencies, database schemas, migration generation/application, package publication, and dashboard-builder removal remain blocked.

## Source hierarchy and discovery

The design follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every mandatory rule linked from `knowledge_base/rules/index.md`
4. The active M13 goal and design gate in `knowledge_base/milestone.md`
5. The developer proposal in `knowledge_base/proposals/m13-code-first-schema-and-local-agent-editor.md`
6. Approved M1–M12 decisions and the repository test-structure decision where M13 consumes their contracts
7. Current committed source, tests, manifests, exports, configuration, and migration history

Discovery began from clean `main` at `3478101`. No feature source, package manifest, migration, or generated artifact was changed during discovery/design.

Materially relevant installed guidance was read and applied for stable Effect v3, Better Auth, Drizzle/PostgreSQL, Express, security hardening, TanStack Query/Router/Start, React, shadcn, Portable Text, Turborepo, and web accessibility. Stable Effect v3 behavior remains available in the vendored Effect source.

External comparison was deliberately narrow. Sanity's current documentation confirms the useful model: TypeScript/JavaScript schema definitions, local Studio development against hosted content, and schema extraction/deployment. It also confirms the behavior this product must not copy: local schema may differ from hosted schema and content can remain mismatched until a later migration. Framer for Devs retains server-side validation, immutable revisions, classification, and acknowledgement before publication.

## Current implementation truth and discovered drift

M13 extends these committed seams:

- M5/M6 already support mutable collection drafts, complete field-tree replacement, server-generated stable field IDs, deterministic validation/classification, exact risky-change acknowledgement, immutable revision publication, schema/contract hashes, audit, and transactional outbox events.
- `compileCollectionContract` already excludes labels, editor metadata, and layout and canonically removes presentation order.
- M7/M8 already provide exact-locale drafts, independent shared/localized optimistic versions, immutable revisions, validate-before-publish plans, exact publication authority hashes, publish/unpublish commands, audits, and outbox events.
- M3 management credentials already have environment-bound `schema.read`, `schema.write`, `schema.publish`, `content.read`, `content.write`, and `content.publish` scopes.
- M12 already provides OAuth device login, native keychain storage, project linking, a read-only Tooling v1 API, schema pull/check/generation, deterministic filesystem transactions, public SDK packaging, canonical public artifacts, and a developer portal.

The following gaps are executable truth and must be addressed rather than hidden:

1. Tooling OAuth currently carries only `tooling:read`; Tooling principal authentication hard-codes management `schema.read`.
2. Tooling v1 rejects every browser-origin request and exposes no authoring mutation.
3. Entry/schema/publication repositories accept a Better Auth user ID, while CMS attribution columns and result contracts are user-only. A credential write cannot be recorded honestly without an actor-model change.
4. Public content inputs do not exist. Internal draft mutations use stable field-ID paths and are unsuitable as the primary script DX.
5. The schema builder and granular structure routes remain active; there is no code definition, source identity, plan/apply protocol, or schema push.
6. New fields receive server-generated IDs, so a code model needs a durable reconciliation identity that is neither mutable API key nor client-invented database ID.
7. The current generated form is owned by `apps/web`, imports internal API contracts and app aliases, uses document-global focus lookup, and cannot be consumed by a package as-is.
8. The generated form renders tabs/groups but ignores `sidebarGroups`, despite sidebar being part of the approved editor-layout contract.
9. The dashboard layout card currently supports only root placement reordering and group column toggling. It does not expose the full tabs/groups/sidebar/help/role contract described by the proposal.
10. Layout and field presentation changes currently mutate the collection draft and require a later schema publication; they are not an independently usable GUI workflow.
11. The current safe CLI config is non-executable JSON and has no schema module path. Treating an arbitrary TypeScript module as trusted executable input would introduce a new workstation, keychain, filesystem, process, and network threat class; token scrubbing alone would not contain it.

The design resolves these gaps while preserving the existing authorities. It does not claim the proposal's desired state already exists.

## Scope

### Included

- Declarative TypeScript schema contract, restricted static extractor, and strict serializable schema document
- Existing-schema export/bootstrap to code
- Stable code reconciliation identities backed by server-generated domain IDs
- Schema structural hash and complete code-vs-hosted drift reporting
- Schema plan, validation, change classification, exact acknowledgement, and atomic apply/publication
- New collection creation through code
- Preservation of GUI-owned presentation across code pushes
- Dedicated GUI presentation editing and presentation-only immutable publication
- Removal/closure of dashboard structure-authoring controls and routes
- Authoring API v1 canonical contracts, OpenAPI, server boundary, SDK client, docs, and compatibility baseline
- OAuth and management-credential authorization for read, draft write, content publish, and schema push
- Honest user/credential actor attribution in CMS writes
- Entry list/get/create/update and exact-locale publish/unpublish through CLI and SDK
- API-key-path mutation translation into existing stable-ID content mutations
- Extracted generated form used by dashboard and localhost editor
- Loopback-only local editor against the hosted project and local schema code
- Conflict recovery, no-local-content-storage guarantees, audits, rate limits, observability, accessibility, and deterministic tests
- Release-ready package changes; actual npm publication remains developer-controlled

### Deferred/non-goals

- Schema-driven content migration execution
- Automatic rewriting of arbitrary developer TypeScript source
- Client-generated database IDs
- Collection deletion, key reuse, or silent removal when a collection is omitted from code
- Entry deletion
- A server-side bulk mutation transaction across unrelated entries
- Declarative content-as-code authority or local content database
- General third-party OAuth clients or dynamic client registration
- Browser-direct bearer access to Authoring v1
- A second visual schema builder in the local editor
- Arbitrary custom React field components or executable server-side schema callbacks
- User-defined validation code executed by the hosted server
- New permissions for content administrators/editors; M13 preserves the current role matrix
- M14 handover controls, M15 production topology/abuse hardening, and M16 visual-builder bindings

## Core invariants

1. Published code-defined structure is the only collection-structure authority.
2. The database remains the only content authority. Scripts are commands, not persistent declarative content sources.
3. Stable collection, field, enum-option, entry, locale, revision, and publication IDs remain server-generated and canonical.
4. Authoring source keys reconcile code to stable IDs but never replace IDs in storage, delivery, references, events, or audits.
5. Mutable API keys, labels, and source keys are distinct concepts. Source keys are immutable after first materialization; API keys retain the existing change rules; labels remain presentation.
6. Authenticated CLI commands, the local editor, and the hosted server never execute developer schema modules. The default Tier 1 path statically extracts only an allowlisted declarative TypeScript subset before loading credentials; optional Tier 2 execution occurs only through the explicit credential-blind build capability and must emit Tier 1 input.
7. Every schema apply is revalidated and reclassified under database locks against the exact current published manifest. A stale plan cannot publish.
8. Every risky change ID must be acknowledged exactly. `--yes`, a broad acknowledgement, or a local-only bypass cannot weaken this gate.
9. Presentation edits cannot mutate the structural projection or `contractHash`.
10. Every content write is authorized and validated server-side against the current published schema and exact locale at save/publish time.
11. Public content mutations are converted to stable field-ID paths before the existing mutation authorization and validation engine runs.
12. Optimistic versions, command IDs/fingerprints, publication authority hashes, and no-op/replay behavior remain mandatory.
13. Management credentials never become user sessions and are never attributed to their issuer.
14. Delivery, Preview, Tooling, Authoring, and webhook API majors evolve independently.
15. The local editor never writes content to disk and never gives the hosted bearer token to browser JavaScript.
16. Existing dashboard content editing remains valid and uses the same extracted renderer and M7/M8 authority.
17. Exact decimal/money strings, Portable Text profile, external-asset URL rules, strict locale behavior, reference publication rules, audit, and outbox behavior are unchanged.
18. No migration or package publication is generated/applied/performed by the agent.

## Schema-as-code model

### Package and file boundary

A new public `@framerfordevs/schema` package owns serializable schema types, TypeScript authoring contracts, and local validation helpers. Tier 1 has no runtime helper requirement; the separately exported Tier 2 compose helpers run only inside the credential-blind build capability. The package has no React, database, Express, Better Auth server, dashboard, or application-runtime dependency.

The existing non-executable `framerfordevs.config.json` remains the project-link authority and gains one bounded relative path, for example:

```json
{
  "schemaVersion": 2,
  "apiBaseUrl": "https://api.example.com",
  "projectId": "...",
  "environment": "main",
  "output": "src/framerfordevs",
  "schema": "framerfordevs.schema.ts"
}
```

A representative schema module is:

```ts
import type { CollectionSchema, ProjectSchema } from "@framerfordevs/schema";

const posts = {
  sourceKey: "posts",
  apiKey: "posts",
  fields: [
    {
      sourceKey: "title",
      apiKey: "title",
      kind: "short_text",
      required: true,
      localization: "localized",
      configuration: { maximumLength: 160 },
    },
  ],
} as const satisfies CollectionSchema;

export default {
  collections: [posts],
} as const satisfies ProjectSchema;
```

The exact field configuration types mirror the closed M6 kind-correlated vocabulary. References name a collection `sourceKey`; enum options have their own immutable source keys. The local document excludes tenant IDs, generated stable IDs, versions, hashes, actor data, layout IDs, and credentials.

### Structural versus presentation ownership

Code owns:

- Collection source key and immutable collection API key
- Field/enum-option source keys
- Field API keys and kinds
- Parent/list/object shape
- Required/localization/deprecation state
- Kind-specific validation/default/reference/rich-text/asset configuration
- Enum option API values

The hosted presentation model owns:

- Collection display name and description
- Field and enum-option labels
- Help text and placeholders
- Root and nested authoring order
- Tabs, groups, columns, sidebar groups, and placements
- Field/placement/group/tab visibility and field editability roles

For a new resource, the server creates deterministic human-readable presentation defaults from API keys and appends new roots to the default group. Once created, subsequent code pushes preserve the hosted presentation by stable identity. Array order in code is deterministic input order for first materialization only, not an ongoing presentation authority.

This split is required to satisfy both one structural code authority and GUI-owned editor presentation. The CLI prints this distinction in export/plan output so it is not surprising.

### Source identity

A source key is a bounded, normalized, immutable authoring identifier. It is unique within its collection for field/list-item nodes and enum options; collection source keys are unique in an environment.

The server resolves source keys before validation:

- A known active source key maps to its existing stable ID.
- A new source key receives a server-generated UUID in the apply transaction.
- A known source key cannot change parent or node role.
- A retired source key cannot be reused or reactivated.
- Duplicate, unknown-target, conflicting, or reparented identities fail closed.

Existing data receives deterministic source-key backfills. Collection keys derive from immutable collection API keys. Existing field/option source keys derive from their readable API path/value plus a short stable-ID suffix to avoid collisions and mutable-path ambiguity. `ffd schema export` writes those authoritative keys.

The existing M12 schema lock evolves to record source-key-to-stable-ID mappings and the structural manifest hash for diagnostics and generation. The server mapping, not the lock, remains authoritative; deleting a lock cannot cause duplicate domain identity.

### Static extraction security and determinism

The Tier 1 CLI path does **not** import, transpile, bundle, or execute the schema module. A restricted extractor parses TypeScript syntax and reduces only a closed declarative subset to plain data. This keeps schema-as-code type checking and version control without making arbitrary project code a trusted CLI input.

The initial allowlist is deliberately small:

- Type-only imports from `@framerfordevs/schema`
- Relative imports of named `const` declarations from other `.schema.ts` files inside the same real project root
- Object, array, string, finite number, boolean, and `null` literals, plus unary `-` applied only to a finite numeric literal
- Identifiers bound to allowlisted immutable declarations
- Parentheses, `as const`, and `satisfies` wrappers
- One default-exported project schema object

Everything else fails closed, including runtime/package imports, call/new expressions, functions, getters/setters, classes, computed properties, spreads, template substitutions, property access, environment/process/global access, dynamic import, `require`, top-level await, JSX, decorators, enums, loops, mutation, JavaScript modules, tsconfig plugins/path aliases, and arbitrary compiler transforms.

Additional controls are mandatory:

- Resolve one explicit entry and a bounded local module graph inside the linked project's canonical real path; reject symlinks, path escape, cycles, duplicate declarations, ambiguous exports, unsupported extensions, excessive files, and excessive aggregate bytes.
- Run only the CLI-owned parser/extractor in a short-lived pre-auth worker with a scrubbed environment, fixed memory/output limits, and a kill timeout. This contains parser crashes/resource exhaustion; it is not used as an excuse to execute project code.
- Use fixed internal parse/module-resolution options rather than executing the repository's tsconfig, loader hooks, package exports, plugins, or build scripts.
- Parse/extract before opening the native keychain, reading `FFD_MANAGEMENT_TOKEN`, refreshing OAuth, or starting the loopback proxy.
- Bound parser work, syntax depth, module count, declarations, final JSON bytes, schema depth, collections, nodes, options, patterns, and strings.
- Decode the extracted value again through the strict schema contract with excess-property rejection.
- Canonical extraction of unchanged files must be byte-stable; `check`, `plan`, `push`, and editor watch mode use the same extractor implementation.
- Never parse downloaded/server-returned source and never add an `--allow-execution` bypass.

This is a security boundary, not only a reliability adapter. The extractor and its adversarial bypass corpus are release-blocking and receive the same review standard as credential parsing, tenant authorization, and loopback isolation.

## Authoring ergonomics amendment — optional credential-blind schema build

### Why this amendment exists

The restricted extractor is the correct default security boundary, but its closed grammar intentionally removes ordinary TypeScript composition. A Tier 1 author cannot call shared field factories, map a definition list, spread a common field set, build fluent helpers, or compute repeated structures. Pretending this has Sanity-equivalent ergonomics would be inaccurate.

M13 therefore adds an optional Tier 2 **schema build** step upstream of the unchanged static extractor. Tier 1 remains the default and needs no build. Tier 2 restores functions, loops, spread, local factories, and fluent composition, but it produces the same Tier 1 declarative file that every plan/push/editor path already trusts.

This is progressive complexity: projects use direct declarative authoring until repetition justifies a build capability. Enabling Tier 2 does not change hosted project authority, token scopes, schema validation, or publication behavior.

### Sanity comparison and the boundary we will not copy

Sanity does not isolate schema/config execution:

- Sanity CLI schema commands, including `schema extract`, `schema deploy`, `schema validate`, and `typegen extract`, load `sanity.config.ts` through `esbuild-register`, then hand the transpiled module to Node's real `require()` inside the CLI process. Public issue traces show that ordinary schema commands resolve and execute arbitrary transitive npm packages imported by configs, including custom validators and UI libraries.
- Sanity advertises `sanity exec <script>` specifically to run arbitrary developer scripts in the Studio context. Its `--with-user-token` option primes the developer's authenticated token into that same unrestricted process through `getCliClient()`. Migrations and bulk imports intentionally use this path.
- Sanity documents no sandbox, resource bound, or credential-isolation boundary for these paths. It assigns schema/config code the same trust as `webpack.config.js` or `next.config.js`: full authority of the invoking user.

Sanity therefore faces the identical structural risk—arbitrary code executing in a process that may carry a live credential—and accepts it. That is a coherent choice for Sanity because it does not make M13's explicit least-privilege promise: whatever grants a token has are exactly what the agent holding it can do.

Framer for Devs cannot copy that model. Loading a full-execution schema graph in the same process as OAuth or management authority would silently void the grant boundary: a compromised transitive dependency could exfiltrate a schema-push token. Sanity's `--with-user-token` workflow demonstrates that token reachability is intentional in its model. Its `require()`-everything behavior also executes every transitive dependency during extract/deploy, creating a live typosquat/malicious-package surface inconsistent with this repository's package provenance review, pnpm-only additions, and lockfile inspection.

The target is therefore closer to Sanity's composition ergonomics, not identical: full language composition occurs in a separate credential-blind build capability, while all authenticated commands continue to consume only statically extracted data.

### Command name and exact role

The command is:

```text
ffd schema build [--check] [--json]
```

`build` is selected over `compose` and `synth`:

- `build` clearly describes compiling author-owned source into a checked artifact and is familiar in CI.
- `compose` describes an implementation technique but not the artifact-producing/staleness contract.
- `synth` is less discoverable and suggests infrastructure generation.
- It does not collide with M12's top-level `ffd generate`, whose direction is the reverse: `generate` derives TypeScript/Effect Schema/OpenAPI from a **published hosted schema**, while `schema build` derives static schema input from local composition source.

Normal mode builds, strictly validates, and atomically writes the owned static schema artifact plus its build manifest. `--check` performs the same credential-blind build in a temporary directory, writes nothing, compares canonical bytes/digests with committed artifacts, and exits with the existing drift-style nonzero code when stale. `--json` emits one stable content-free object with `command`, `mode`, `accepted`, `changed`, relative `output`, bounded `inputCount`, and `outputSha256`; diagnostics go to stderr. Normal success and a current `--check` exit `0`, stale `--check` exits `2`, and invalid configuration/source/runtime failure exits `1`. The command is non-interactive and accepts no token, API origin, project, environment, publish, acknowledgement, or network flag.

The optional non-secret CLI configuration adds only a bounded local composition entry. Its output is always the existing `schema` path:

```json
{
  "schema": "framerfordevs.schema.ts",
  "schemaBuild": {
    "entry": "schema/compose.schema.ts"
  }
}
```

Without `schemaBuild`, the project is Tier 1 and `ffd schema build` returns `CLI_SCHEMA_BUILD_NOT_CONFIGURED`. Enabling Tier 2 cannot target an arbitrary output or overwrite a hand-owned Tier 1 file; the first build establishes normal generated-file ownership through the existing atomic ownership convention.

### Composition API and execution model

`@framerfordevs/schema` keeps the Tier 1 type contracts. A distinct `@framerfordevs/schema/compose` export provides real callable `defineField`, `defineCollection`, and `defineSchema` identity/validation helpers for Tier 2 source. Authors may also define local factories and use ordinary TypeScript/JavaScript functions, loops, conditionals, mapping, spread, and fluent wrappers.

The first release permits the compose export and a bounded local TypeScript/JavaScript module graph under the configured composition root. It does not reproduce Sanity's arbitrary Node `require()` graph: Node built-ins, native addons, package lifecycle hooks, loader hooks, tsconfig plugins, and unrestricted external package imports are not capabilities of the build runtime. Broader package imports would require a later security/DX decision.

The CLI owns this implementation rather than shelling out to a developer npm command. A shell delegation has attractive ecosystem familiarity, but an ordinary child process can independently inspect the host environment, read CLI config, invoke OS keychain tools/native addons, spawn subprocesses, and open network sockets. Scrubbing inherited variables would recreate the gap this amendment is meant to avoid and could not satisfy release-blocking credential-unreachability tests.

The first-party path uses a reviewed TypeScript transpilation/bundle stage with fixed internal options and no user plugins, followed by a capability-denied JavaScript isolate (a QuickJS-class WebAssembly runtime, subject to the compatibility/provenance slice). The isolate receives only the bundled composition program and pure compose helpers. Its only host callback returns one candidate schema value. It receives no filesystem, environment, process, subprocess/worker, native-addon, keychain, DNS, socket, HTTP/fetch, clock, randomness, CLI config, token, or API-client capability. CPU, memory, output, and wall time are bounded. The host process runs this build path before importing/constructing credential services and never reads `FFD_MANAGEMENT_TOKEN` for this command.

This is credential unreachability by process construction and capability omission, not a claim that arbitrary code is generically safe. Real developer code is executed inside the isolate. The controls close access to Framer for Devs credentials and hosted Tooling/Authoring transport; they do not prevent malicious schema output (which remains strictly decoded and code-reviewed), all possible resource abuse beyond the explicit bounds, ordinary local-machine/supply-chain risk from installing and invoking the CLI/transpiler/isolate runtime, or risk from a compromised package-install lifecycle outside this command. A developer-owned npm/shell wrapper around `ffd schema build` also runs with that wrapper's ordinary host authority and is explicitly outside the first-party guarantee. These risks remain at the trust level of other reviewed build tools.

### Named critical dependency candidates and evidence gate

The parser/transpiler and isolate are not implementation-detail dependencies. They sit on security-critical pre-auth paths and require named candidates in the approved design plus exact evidence before implementation authorization.

Preferred candidates for the pre-implementation compatibility slice are:

- **Tier 1 parser and Tier 2 transpiler: `typescript` Compiler API**, initially against the repository's already pinned `typescript@6.0.3`. Tier 1 uses `createSourceFile`-level syntax trees plus the project's own closed reducer and resolver; it does not construct a user-configured compiler host or load tsconfig plugins. Tier 2 uses fixed syntax transpilation for the already bounded local graph, with no custom transformer/plugin. Reusing one official TypeScript grammar implementation avoids parser/transpiler disagreement, but making TypeScript a shipped CLI runtime dependency still changes tarball size, runtime attack surface, and update policy and must be reviewed rather than grandfathered from its existing development use.
- **Tier 2 isolate: `quickjs-emscripten` with the production synchronous release WASM variant**, expected to resolve through the package family's `@jitl/quickjs-wasmfile-release-sync` artifact. Its documented model matches the capability design: QuickJS compiled to WebAssembly, no host functionality exposed by default, explicit host functions/module loader, and runtime memory/stack/interrupt controls. The exact root/variant versions must be pinned together only after tarball and lockfile review.

Named alternatives remain comparison candidates, not silent fallbacks:

- **`oxc-parser`** for Tier 1 if TypeScript Compiler API parsing cannot meet termination/performance/package budgets. It supports TypeScript and has strong conformance/performance claims, but its Rust native/platform binding packages and fast release cadence introduce a wider provenance and cross-platform artifact surface.
- **Bytecode Alliance `Javy`** for Tier 2 if `quickjs-emscripten` cannot enforce the measured capability/resource contract. Javy is a QuickJS-based JavaScript-to-WebAssembly toolchain with credible governance, but its CLI/toolchain distribution and ahead-of-time module model are less natural for an embedded Node CLI that evaluates a changing in-memory module graph.

Node `vm`, `vm2`, `isolated-vm`, `esbuild-register`, and a normal Node child are not candidates: they either are not security boundaries, add native/same-process authority, or reproduce Sanity's unrestricted execution model.

The exact dependency review is a distinct evidence gate, not “TBD during implementation.” It uses the same standard already applied to `re2js` and `@portabletext/editor`, extended for parser/WASM/runtime capability risk. The approved design requires a separately initiated dependency-evaluation slice before any feature implementation:

1. Selects exact candidate versions without editing feature code.
2. Reviews npm/repository ownership, maintainers, release cadence, license, advisories/CVEs, provenance, package scripts, native/WASM artifacts, tarball bytes/size, transitive graph, and Node 22/ESM support.
3. Adds candidates through pnpm only in an isolated compatibility branch/slice, records the complete lockfile/allow-build diff, runs production/full audits, and proves clean-fixture packaging.
4. Inspects the exact QuickJS WASM variant and all `@jitl/*` transitive artifacts; verifies default globals, every exposed host callback, module-loader closure, memory/stack/interrupt behavior, disposal/leak behavior, and malformed/hostile guest handling.
5. Compares the TypeScript candidate with `oxc-parser`, and `quickjs-emscripten` with Javy, against the actual Tier 1/Tier 2 threat and packaging requirements rather than popularity alone.
6. Appends the evidence, selected exact versions/digests, rejected candidates, and residual risks to this decision record, then returns for exact dependency/performance approval and implementation authorization.

No package is selected merely by this draft, and no feature implementation may begin while two critical dependencies remain unreviewed. Failure of both candidates returns Tier 2 or the extractor implementation to design; it does not permit a weaker Node execution fallback.

### Explicit v1 import boundary

Tier 2 v1 deliberately restores **language composition**, not the npm ecosystem. Compose code may use the first-party `@framerfordevs/schema/compose` module and local modules under the bounded composition root. Bare third-party package imports, Node built-ins, native addons, package lifecycle hooks, dynamic package resolution, and user loader/plugin hooks are rejected.

This means factories, loops, spread, mapping, functions, and fluent local builders are supported, while `import slugify from "slugify"` is not. Sanity permits the latter because it executes the ordinary Node dependency graph; this design intentionally does not. The narrower boundary closes Sanity's require-everything supply-chain surface, keeps the in-isolate module map reviewable, and makes credential-unreachability tests tractable. It is a product-level v1 scope requiring independent developer approval, not an accidental limitation. A future external-package allowlist requires a new threat, provenance, determinism, and artifact-authority design.

### Schema-build performance budget and baseline gate

QuickJS/WASM is expected to be slower than V8. One-shot schema composition does not need server-request latency, but it still needs a measured budget before implementation authorization.

The dependency-evaluation slice records cold-process results on identified developer and CI-class hardware using deterministic fixtures and no hidden warm singleton:

- At least 20 cold `schema build --check` runs for a representative composition fixture of 20 collections and 1,000 aggregate field/option nodes, including factories, loops, mapping, spread, and nested local modules
- At least 20 cold runs at the final bounded maximum project document selected by M13 contracts
- Separate parse/transpile, isolate startup/execution, strict extraction/decode, serialization/digest, and total durations
- Median and p95 total duration, peak host RSS, configured guest memory/stack limits, output bytes, and timeout/interruption behavior

Provisional acceptance budgets are representative-fixture p95 at or below 2 seconds, bounded-maximum p95 at or below 5 seconds, guest memory at or below 64 MiB, and peak host RSS at or below 256 MiB. `--check` and write mode must produce identical schema bytes. These are hypotheses to validate, not numbers declared passed by design approval. If candidate evidence misses a budget, the record must show the result and the developer must explicitly approve a revised budget or architecture before implementation authorization.

### Committed artifact and drift authority

The generated static schema file and `.framerfordevs/schema-build.lock.json` are committed. Regenerating only immediately before push without a persisted artifact is rejected because it would:

- make authenticated commands depend implicitly on arbitrary execution,
- hide generated structure from code review,
- make local editor/CI behavior depend on tool availability and execution timing, and
- allow a stale checkout to produce an unreviewed schema immediately before publication.

Committing follows the existing schema lock and canonical artifact conventions. The build manifest contains only build format/tool versions, canonical relative input paths and SHA-256 digests, compose-package identity, output path/digest, and no schema values, credentials, API origin, project/environment identity, timestamps, or machine paths.

`schema plan`, `schema push`, `schema check`, and `ffd editor` never invoke Tier 2. They continue to read the produced file through the exact unchanged restricted extractor and strict schema decoder. For Tier 2 projects they additionally perform a non-executing manifest digest check and fail/mark read-only when the committed output is stale. The local editor never watches or executes composition source; a developer explicitly runs `ffd schema build`, after which the ordinary static-output watcher reloads it.

Build output is canonical Tier 1 TypeScript using only type-only imports, literals, named constants where generated, `as const`, and `satisfies`. It receives no relaxed grammar or special extractor path. Output and manifest are planned and committed atomically only after strict decode succeeds; failure leaves the previous pair intact.

## Schema plan and apply lifecycle

### Structural hash

Every immutable schema revision gains a canonical `structureHash` over the code-owned projection. It includes stable IDs and structural/configuration state but excludes labels, editor metadata, order, and layout. Existing `schemaHash` remains the complete management snapshot integrity hash; existing `contractHash` remains the renderer-independent content API contract hash.

Consequences:

- Presentation-only publication changes `schemaHash` and revision identity, but not `structureHash` or `contractHash`.
- Code structure changes `structureHash`; content-contract changes also change `contractHash` where currently defined.
- M12 generated type drift continues to use `contractHash`, so presentation-only work does not regenerate types.
- Local editor drift uses `structureHash`, so it can distinguish unpublished code from presentation-only hosted changes.

### Complete project document

The schema module declares every active collection in the linked environment. Omission is an actionable validation failure, not deletion. Collection retirement/deletion is deferred. This avoids accidental data loss and key reuse.

A schema operation is bounded to one project/environment document. Initial limits will be explicit in contracts and load tests (request bytes, collection count, aggregate nodes, and per-collection M6 limits). Oversized installations receive a safe error and must not partially apply; raising or chunking the bound requires a later design decision.

### Plan

`POST /api/authoring/v1/.../schema/plan`:

1. Authenticates a principal with schema-push authority.
2. Strictly decodes the complete serializable document.
3. Resolves source identities and current published presentation.
4. Builds prospective collection candidates without persistence.
5. Runs the existing recursive field, reference, layout, aggregate, and value-contract validation kernels.
6. Classifies changes by stable ID using the existing M5/M6 classifier.
7. Returns validation issues, exact deterministic change IDs/classifications, candidate structure/contract hashes, current revision IDs, and a canonical plan hash.
8. Returns no secret, content values, actor metadata, or hidden cross-tenant detail.

Plan is read-only and cannot reserve or publish IDs. New resource IDs are represented by source keys in the plan; final server IDs are returned after apply.

### Apply

`POST /api/authoring/v1/.../schema/apply` resubmits the exact document with:

- `commandId`
- expected current project structural manifest hash and per-collection revision IDs
- expected plan hash
- exact acknowledged risky change IDs

The repository:

1. Locks the project and affected collections in stable order.
2. Reauthorizes tenant/environment/schema-push authority.
3. Re-resolves source identities, allocating server IDs for new nodes.
4. Rebuilds, validates, classifies, and hashes the complete candidate.
5. Rejects stale authority, plan mismatch, missing/extraneous acknowledgements, source reuse, or any invalid candidate.
6. Persists new collection/field/source mappings and reconciles removed roots with current presentation.
7. Publishes one immutable revision for each changed collection, preserving the current GUI presentation.
8. Advances all current pointers, writes audits and one outbox event per changed collection, and stores one project-level idempotency receipt in the same transaction.
9. Returns source-key/stable-ID mappings, published revisions/hashes, and no-op/replay status.

The apply is atomic across the bounded project document so new collections may reference each other and an agent never receives a half-published code snapshot. Validation is performed before the short persistence phase and repeated under locks. Bulk inserts/updates replace row-by-row network/repository loops.

The existing M5 publication classifier/acknowledgement/hash functions are extracted for candidate reuse rather than duplicated. No `Effect.run*` is introduced below the Authoring HTTP/CLI process boundaries.

## GUI-owned presentation publication

The structure builder, JSON authoring view, field add/update/remove/reorder procedures, and collection-create structure flow are removed from dashboard routing after export/adoption tests pass. Direct calls receive a stable gone/code-authority response rather than silently mutating drafts.

A dedicated presentation screen remains in the dashboard. It supports the complete approved layout contract, including nested field order, tabs, groups, sidebar groups, columns, labels, enum labels, descriptions, help/placeholder text, visibility, and editability roles.

Presentation save:

- Requires the current schema write/publish policy; M13 does not grant new roles.
- Uses optimistic current revision/presentation versions.
- Accepts only a presentation projection. Extra structural properties are rejected.
- Merges the projection with the current published structure.
- Proves `structureHash` and `contractHash` are unchanged.
- Validates role hierarchy, complete placement, bounds, and generated-form projection.
- Publishes a presentation-only immutable schema revision with audit and outbox atomically.
- Requires no breaking acknowledgement because structural and delivery contracts are unchanged.

This removes today's hidden dependency on a future code push to activate layout changes while retaining immutable revision integrity. Code apply conflicts with a concurrent presentation revision and must re-plan; it never overwrites newer presentation.

## Authoring API v1

### Separate family

Authoring is a new explicit registry family at `/api/authoring/v1`. Tooling v1 remains originless, read-only project/schema discovery with its existing compatibility baseline. Delivery and Preview remain unchanged.

Authoring v1 is bearer-only, `no-store`, redirect-free, and rejects browser `Origin` and preflight requests. Local editor traffic reaches it through the loopback Node process, so hosted Authoring CORS is not widened.

The canonical OpenAPI document and SDK include only allowlisted authoring resources. Dashboard oRPC, Better Auth, memberships, credentials, audits, operators, raw persistence contracts, and internal stable-ID mutation shapes remain excluded.

### Initial operations

Schema:

- Export current structural schema/source mappings for bootstrap
- Read role-projected current generated-form/presentation authority
- Plan complete code schema
- Apply complete code schema

Content:

- List entries with bounded keyset pagination and exact locale
- Create an entry, optionally with initial draft mutations, atomically
- Get one exact-locale draft and optimistic versions
- Save exact-locale shared/localized draft mutations
- Get publication status and validation plan
- Publish exact locale from the exact returned authority
- Unpublish exact locale from the exact current publication state

No entry delete, collection delete, force overwrite, fallback locale, unrestricted query, or generic arbitrary operation endpoint is added.

### Public value mutations

Script-facing mutations use bounded API-key paths:

```json
{
  "operation": "set",
  "scope": "localized",
  "path": ["seo", "title"],
  "value": "Hello"
}
```

`unset` omits `value`. The server resolves every path through the current published collection contract and converts it to a stable-ID path. It rejects unknown keys, list-item traversal, scope mismatch, hidden/non-editable fields, duplicate/conflicting paths, excessive operations/depth/bytes, invalid JSON, and stale schema authority before calling the M7 save kernel.

Whole list/object values remain bounded and are recursively validated. Decimal and money values remain canonical strings. References remain stable entry IDs. Rich text remains the approved versioned Portable Text profile. Assets remain external URL metadata only.

Create-with-initial-values shares the existing command fingerprint and runs entry creation plus initial shared/localized revision/head/audit writes in one transaction. A failed initial save cannot leave an accidental empty entry. Scripts that need retries supply stable command IDs; CLI-generated IDs remain stable for the duration/retry journal of one invocation.

### Errors and HTTP behavior

Authoring v1 has a closed public error union covering validation, unauthorized/forbidden/not-found non-enumeration, stale schema, draft conflict, publication conflict/invalidity, command conflict, risky acknowledgement required, source identity conflict, response/request too large, rate limiting, unavailable dependency, and sanitized internal failure.

Responses retain `{ ok, data, error, message }`. Request IDs and rate-limit headers are always available. Mutations never redirect or cache. Bodies and values never appear in errors.

## Authorization and actor model

### OAuth grants

The fixed official CLI client adds narrow consented grants:

- `authoring:read`
- `authoring:draft:write`
- `authoring:content:publish`
- `authoring:schema:push`

`tooling:read` remains for M12 compatibility. Device login may request a least-privilege subset; the default end-to-end developer flow requests all documented CLI grants and displays them at consent. Refresh tokens cannot gain scopes not originally approved.

OAuth scope is necessary but never sufficient. Each request also resolves current project membership, role, locale access, capability state, and action policy. Removed membership, restricted locale access, archived project, disabled CMS capability, or denied role fails immediately.

### Management credentials

No parallel credential family is introduced. Authoring v1 accepts only the existing `management` family and requires the exact existing action scope per operation:

- Reads: `schema.read` or `content.read`
- Draft create/update: `content.write`
- Publish/unpublish/validate-publication: `content.publish`
- Schema plan/apply/export: `schema.read` plus both `schema.write` and `schema.publish` where mutation authority is involved

Delivery and Preview credentials fail generically. Project/environment authority comes only from the verified credential row. A management credential has the fixed developer field-visibility/editability projection guaranteed by M6, but remains a credential actor and never impersonates a developer user.

The Tooling principal authenticator is generalized to verify requested OAuth/credential grants per route instead of hard-coding `schema.read`. Credential policy is rechecked with exact tenant/environment context at the repository boundary.

### Attribution

Current user-only CMS attribution cannot honestly represent credential writes. M13 adds credential alternatives to every CMS author/change/complete/publish pointer touched by schema, draft, and publication workflows. Database checks require exactly one user or credential reference. Existing rows backfill as user-attributed without changing identity or timestamps.

Application contracts expose a bounded actor reference:

```ts
type CmsActor = { kind: "user"; id: AuthUserId } | { kind: "credential"; id: ApiCredentialId };
```

Audits retain their existing `actorType`/`actorId` model. Fingerprints bind the actual actor kind/ID. Credential rotation creates a new actor identity, as expected; replay belongs to the original command/credential identity.

No credential secret, safe prefix, name, scope array, user email, content, schema document, or API key enters audit/telemetry.

## SDK and CLI

### SDK

`@framerfordevs/sdk` gains an explicit `./authoring` export with Promise and Effect clients for Authoring v1. It remains framework-independent and receives bearer authority from the caller. It does not read environment variables, keychains, project files, React state, or CLI config.

The SDK exposes low-level exact optimistic operations and higher-level helpers that:

- paginate safely with repeated-cursor protection
- get current draft authority before save
- validate then publish using the exact returned authority
- process imports with explicit bounded concurrency and per-entry results

Helpers never force overwrite or hide conflicts. A bulk import is a bounded sequence of idempotent entry commands, not one unbounded server transaction.

### CLI commands

M12 commands remain compatible. M13 adds at least:

```text
ffd schema export
ffd schema build [--check] [--json]
ffd schema plan [--json]
ffd schema push --acknowledge <change-id>... [--json]
ffd editor
ffd entry list --collection <key> --locale <tag>
ffd entry get --collection <key> --entry <id> --locale <tag>
ffd entry create --collection <key> --locale <tag> --name <name> [--mutations <file>]
ffd entry update --collection <key> --entry <id> --locale <tag> --mutations <file>
ffd entry publish --collection <key> --entry <id> --locale <tag>
ffd entry unpublish --collection <key> --entry <id> --locale <tag>
```

Final names are locked by command-contract tests before implementation completion.

Rules:

- Machine-readable `--json` output is stable, content-safe, and written only to stdout; diagnostics go to stderr.
- `schema build` is optional, explicit, non-interactive, credential-blind, and never invoked by another CLI/editor command. Normal mode atomically updates only its owned static output/build manifest; `--check` writes nothing and uses the standard drift exit behavior.
- Risky schema changes exit with exact IDs until each is supplied. There is no broad `--yes` bypass.
- Non-interactive operation is the default; optional TTY confirmation cannot be required by automation.
- Mutation files are bounded, resolved within the project unless explicitly absolute by a documented option, rejected if symlinks violate policy, and never copied into logs/cache.
- Schema export and generated writes use existing owned-file/atomic transaction patterns and never overwrite an unowned file without an explicit safe workflow.
- A pre-network retry journal stores command IDs/fingerprints but no bearer or content body; it is cleared after a confirmed response.
- `FFD_MANAGEMENT_TOKEN` remains the CI authority and is never written to config, locks, cache, generated code, or command output.

The M12 schema lock format receives a new major lock version. Contract generation remains derived from immutable published revisions, not local unpushed code.

## Extracted generated form

A new workspace package, tentatively `@framerfordevs/content-form`, owns the controlled React renderer and browser-safe form DTO. It is internal/private initially and is bundled into the dashboard and local editor; publishing it independently is deferred.

It owns no data fetching, tokens, routing, project policy, or persistence. Callers supply:

- role-projected definition/layout
- stable-ID-keyed controlled values
- editable IDs and server issues
- controlled change/submit/conflict callbacks

The extraction includes required correctness work:

- Render tabs/groups and sidebar groups.
- Preserve recursive object/list controls and exact values.
- Lazy-load Portable Text only for rich-text fields.
- Use component-local `useId`/refs rather than document-global hard-coded IDs/selectors.
- Associate labels/help/errors with unique accessible controls.
- Focus the first invalid control without crossing another form instance.
- Keep client validation advisory; server issues remain authoritative.
- Avoid app aliases and imports from server-heavy internal packages.
- Keep control registry exhaustive for the closed field-kind union.
- Add adapters between dashboard internal contracts, Authoring v1 DTOs, and renderer DTOs with parity tests.

Shared/localized partition, defaults, stable-ID mutation generation, and API-key/stable-ID projection helpers move into browser-safe pure modules alongside the renderer where appropriate.

## Local editor

### Distribution and process model

The initial editor ships through the existing `@framerfordevs/cli` npm package as `ffd editor`. This satisfies one-install onboarding and reuses the reviewed OAuth/keychain/config authority. A separate editor npm package is deferred until demonstrated independent versioning need.

`ffd editor` starts one Node process that:

1. Loads the linked non-secret config.
2. Statically extracts and strictly validates the schema without executing project code.
3. Obtains OAuth/keychain or management authority only after successful extraction.
4. Binds an ephemeral server to loopback only on a random available port.
5. Serves a bundled, CSP-locked static React application.
6. Proxies a closed set of Authoring v1 calls from loopback to the hosted API.
7. Watches only the resolved local schema module graph and hot-re-extracts the structural document through the same restricted parser.

The browser never receives the hosted bearer/refresh/management token. The local server never binds `0.0.0.0`, never enables LAN access, and never stores content on disk.

### Loopback security

- Accept only canonical loopback hosts and the chosen port; reject Host confusion.
- Require exact same-origin `Origin` for state-changing local requests.
- Use a high-entropy per-process browser session challenge delivered in the launch URL fragment and then a custom header; do not put it in server logs or process arguments.
- Set strict CSP, `frame-ancestors 'none'`, `nosniff`, no-referrer, no-store, and no external script/style/font/image dependencies beyond user-entered asset previews governed by the existing asset policy.
- Reject DNS-rebound/non-loopback socket peers, redirects, unknown routes/methods/content types, oversized bodies, and credential query parameters.
- Proxy only decoded allowlisted operations; do not expose an arbitrary URL/header proxy.
- Clear in-memory query/content/token references and close watchers on shutdown.

### Schema drift behavior

The editor merges local code structure with hosted GUI presentation by source identity.

- Matching `structureHash`: normal editing is enabled.
- Local code differs from hosted structure: the editor reflects the local form immediately but becomes read-only, identifies the structural drift, and directs the developer to `ffd schema plan/push`.
- Invalid, unsupported, or non-declarative local schema: show bounded diagnostics and preserve the last valid view read-only.
- Hosted presentation changes with matching structure: refetch/merge without requiring code changes.

The editor never writes values for an unpublished local field. Every save still carries exact hosted schema revision/contract authority and optimistic draft versions.

### Content UX

The local editor supports collection/entry/locale navigation, entry creation/rename, shared/localized forms, save state, validation summaries, exact-locale publish/unpublish, revision/conflict recovery where exposed, and persisted Preview links. It mirrors dashboard semantics rather than inventing a second content engine.

TanStack Query owns hosted server state; local form state remains controlled and is never optimistically declared authoritative. Conflict responses preserve local edits and require explicit reload/reapply. Unsaved locale/navigation warnings and keyboard/accessibility behavior match the dashboard.

## Database impact and migration gate

M13 requires a developer-controlled migration. Proposed migration name:

```text
add_code_first_authoring_authorities
```

Expected structural changes:

- Immutable unique schema source key on collections
- Immutable unique schema source key on collection field/list-item identities, retained after removal
- Enum-option source identity mapping with server-generated option IDs and retired-key protection
- `structure_hash` on immutable schema revisions and current authority where needed
- Project-level schema apply command receipt and changed-revision result rows for atomic idempotent replay
- Nullable credential actor foreign keys beside existing user actor foreign keys on every CMS row touched by schema, entry draft/revision, publication head/revision, and command workflows
- Exactly-one user/credential attribution checks and supporting credential lookup indexes
- Deterministic backfill of source keys, structural hashes, and user attribution for all existing rows
- Composite tenant foreign keys and uniqueness matching current workspace/project/environment/collection boundaries

Implementation must first update the approved Drizzle schema and targeted tests, then stop. The developer generates the migration. The agent inspects the complete generated SQL/snapshot/journal without applying it. Any backfill correction follows the repository's draft-only migration rule and requires explicit developer direction. The developer applies the reviewed migration; only then may integration work continue after read-only verification.

No current migration/snapshot is modified. Applied migrations remain immutable.

## Security, reliability, performance, and observability gates

### Security

- Default deny at OAuth grant, credential family/scope, tenant/environment, role, locale, field, and action layers
- Authorization before schema/content loading where non-enumeration requires it
- Strict request schemas with excess-property rejection and fixed byte/count/depth/path bounds
- Parameterized Drizzle access and composite tenant predicates/FKs
- No authenticated CLI path or server executes schema modules; the optional explicit `schema build` executes composition code only in a capability-denied, credential-blind isolate upstream of the unchanged static extractor
- `schema build` constructs no credential/keychain/API services, receives no credential/config/transport capability, runs with no network/host APIs, and is never auto-triggered by authenticated or editor commands
- Arbitrary composition code is still real code: credential exfiltration through the build runtime is closed by capability omission, while ordinary host-toolchain/install supply-chain risk remains explicit and accepted rather than mislabeled as sandbox safety
- No force-save, implicit fallback, broad write scope, credential impersonation, or client-selected tenant widening
- Generic invalid-credential behavior and immediate database-backed revocation checks
- Secret/content/schema-body redaction from logs, traces, metrics, audits, errors, caches, generated files, and docs
- Loopback Host/Origin/peer/session protections and no arbitrary proxy
- Dependency provenance/license/audit review before adding the TypeScript parser and editor watcher/build dependencies; executable TypeScript loaders are prohibited

### Reliability and concurrency

- Project/collection stable-order locking for schema apply
- Exact manifest/revision/plan hashes and acknowledgements rechecked under lock
- One project-level command receipt; same fingerprint replays, different fingerprint conflicts
- Short atomic schema pointer/revision/audit/outbox transaction
- Entry create-with-values atomicity
- Existing separate shared/localized optimistic versions and exact publication authority preserved
- Local edits preserved on conflicts; no automatic last-write-wins retry
- Atomic owned-file writes for export/locks/generated output and no partial local generation
- Failure-injection tests at identity, revision, pointer, audit, outbox, and receipt stages

### Performance

- Fixed Authoring request/response limits and early `Content-Length`/stream enforcement
- Weighted global/principal rate limits; schema costs include bytes/nodes/collections, content costs include mutations/value bytes
- Keyset pagination and no total counts
- Bulk schema persistence and bounded SDK import concurrency
- No request-local Effect runtime
- Query/index plans for source resolution, credential attribution, entry pages, command replay, and current authority
- Local editor route/code splits Portable Text and non-current screens; no duplicate React/UI package copies
- Measured schema plan/apply and local-editor interaction budgets are recorded before approval review

### Observability

Named spans cover Authoring authenticate, schema parse/extract/decode/plan/apply, source resolution, content path translation, draft create/save, publication wrappers, and local-editor proxy operations.

Safe span attributes may include stable IDs, actor kind, operation, field/node/mutation count buckets, change severity counts, response/status family, and hash-match booleans. They exclude source/API keys, labels, patterns, defaults, URLs, values, schema documents, content, tokens, emails, credential metadata, and command files.

Metrics use closed endpoint/operation/principal/outcome/status/size/count buckets only. Existing domain audits and outbox events remain the durable action record. Read-only operations follow the existing bounded audit policy; mutation audits remain transactional.

## Package and workspace boundaries

Planned ownership:

```text
packages/schema          public declarative schema contracts and local types
packages/content-form    private browser-safe controlled React form renderer
packages/sdk             Authoring v1 client export
packages/cli             restricted static extractor, schema/content commands, loopback editor launcher/assets
packages/public-contracts Authoring v1 artifact and compatibility baseline
packages/api             contracts, engines, repositories, policies, operations
packages/auth            OAuth grant/resource/client configuration and verification
packages/db              Drizzle authority only; migrations remain developer-controlled
apps/server              isolated Authoring v1 Express transport
apps/web                 presentation editor and shared content-form adapter
apps/developers          source-controlled M13 guides and secondary Authoring reference
```

If editor UI source needs application-scale routing/build ownership, it may live in a private `apps/editor` build workspace whose compiled assets are packaged by `packages/cli`; packages must never import app source. That split requires a package/build compatibility slice before broad implementation.

Every new workspace owns `check-types`, tests, coverage, and build tasks as applicable. Turborepo dependencies/outputs and root structure checks are updated without bypassing package boundaries.

## Test plan

### Pure/property/contract

- Exhaustive declarative schema kind/config correlation, restricted AST extraction, and strict serialization
- Source-key normalization, uniqueness, retirement, reparent denial, and deterministic backfill fixtures
- Structural/schema/contract hash separation and canonical byte stability
- Existing change classifications/change IDs unchanged for equivalent candidates
- Exact risky acknowledgement set behavior
- API-key path to stable-ID path translation, mixed-object partition safety, duplicate/conflict detection, and exact numeric values
- User/credential actor exactly-one decoding and fingerprint separation
- Authoring OpenAPI/public-registry snapshots and forbidden internal surface probes
- CLI argument/output/exit-code contracts and deterministic canonical static extraction

### Credential-blind schema build security — release blocking

- Exact selected parser/transpiler/isolate versions, package/WASM digests, provenance findings, lockfile diff, audit results, allowed build scripts, and clean packaged-fixture evidence match the developer-approved dependency record; undeclared fallback engines fail the gate.
- The measured representative/boundary benchmark records median/p95 phase timings, host RSS, guest limits, and artifact bytes and satisfies the developer-approved schema-build budget.
- Adversarial composition fixtures attempt `process.env`, `FFD_MANAGEMENT_TOKEN`, OAuth/keychain imports, CLI credential-store imports, direct OS keychain/native-addon access, filesystem reads of `framerfordevs.config.json`/`.framerfordevs`/home files, subprocesses/workers, DNS/sockets, `fetch`, and direct Tooling/Authoring requests; forbidden imports fail during bundling and runtime capabilities are absent/inert.
- CredentialStore, OAuth refresh, management-token reader, Tooling client, and Authoring client test services record zero construction/calls for both successful and failing `schema build` executions.
- A controlled fake Tooling/Authoring server records zero connections while hostile build code attempts known endpoints; the isolate receives neither endpoint/config data nor a network callback.
- Sentinel host/config/keychain files remain unread and unchanged; no child process, native addon, worker, socket, or host environment value becomes observable to build code.
- CPU loop, allocation bomb, oversized output, throw/rejection, malformed export, invalid schema, and runner crash/kill leave the prior static artifact/build manifest byte-identical.
- Build output must pass the identical restricted extractor and strict decoder; attempts to emit calls, runtime imports, spreads, computed syntax, or excess contract data are rejected before atomic commit.
- Build and `--check` are deterministic for unchanged source/tool versions. Build-manifest input/output drift is detected without executing composition code by plan/push/check/editor paths.
- Security tests run against packaged CLI artifacts, not only source mocks. The compatibility slice must prove the selected transpiler/isolate package provenance, capability surface, resource limits, and absence of credential-bearing dependencies in the runner graph.

### Effect services

- Replaceable extractor, credential-blind compose runner, filesystem, clock, ID generator, auth verifier, repository, rate limiter, logger, and telemetry Layers
- Expected failures versus defects/interruption
- No repository work after malformed input or denied grant
- Credential store/token acquisition is never called before extraction and strict decode succeed
- No content/schema/token enters logs, traces, or metrics
- One shared ManagedRuntime per process boundary

### PostgreSQL integration

- Source-key/stable-ID materialization and retired-key protection
- Existing source-key/structure-hash/actor backfill completeness
- Atomic multi-collection apply including mutual new references
- Stale manifest, concurrent presentation edit, concurrent apply, acknowledgement mismatch, replay, and command conflict
- Rollback injection leaves no partial revision/pointer/audit/outbox/receipt/source mapping
- Presentation-only revision preserves structure/contract hashes
- Credential-authored create/save/publish/unpublish has exact actor FKs and audits without issuer impersonation
- Atomic create-with-values and existing save/publication conflict behavior
- Cross-workspace/project/environment/source/credential isolation
- Representative `EXPLAIN` assertions for every new indexed query path

### HTTP/security

- Every route/method/content-type/query/body bound and response envelope
- OAuth scope and current role/locale matrix
- Management scope matrix and Delivery/Preview credential rejection
- Foreign/nonexistent non-enumeration
- Revoked/expired/rotated credentials and OAuth scope downgrade behavior
- Rate limits, no-store, no redirect, no browser Origin/CORS, request IDs, sanitized failures
- Raw/encoded traversal, duplicate parameters, oversized/chunked bodies, malformed JSON, extra fields, and credential-in-query rejection
- Canonical Authoring artifact bytes served by the production server image

### CLI/SDK/filesystem

- Existing M12 command compatibility
- Config v1-to-v2 diagnostics and export bootstrap
- Parser timeout/resource bounds, malformed AST, oversized graph, symlink/path escape, cycles, unsupported syntax, and ambiguous import/export behavior
- Tier 1 adversarial fixtures for runtime imports, calls, getters, computed/spread properties, dynamic import, `require`, process/environment/global access, top-level await, JSX, decorators, package resolution, tsconfig plugins/paths, and JavaScript modules all fail before side effects or credential-store access
- Sentinel tests prove extraction cannot create/read a protected file, open a network connection, spawn a process/worker, load a native addon/keyring, or mutate global state; this bypass corpus is security-critical and release-blocking
- Property/fuzz tests cover parser/extractor termination and fail-closed behavior for malformed/unknown syntax
- Export never overwrites unowned files and recovers atomically from injected failure
- Plan/push acknowledgement and stale-plan exit behavior
- Entry command idempotency, exact locale, conflicts, and bounded imports
- Management token/keychain authority never appears in files/stdout/stderr/process args
- Clean fixture installs packaged SDK/CLI/schema packages, type-checks schema code, runs plan against a test server, and launches editor

### React/local editor/accessibility

- Shared renderer parity in dashboard and editor for every field kind
- Tabs, groups, sidebar, nested object/list, role projection, help overrides, defaults, and server issues
- Unique IDs/focus with simultaneous shared/localized forms
- Portable Text lazy boundary and round-trip profile
- Local schema matching/drift/invalid/unsupported-syntax states and save lockout
- Entry create/save/publish/unpublish, unsaved navigation, conflict preservation/reload, empty/error/loading states
- Loopback Host/Origin/socket/session/unknown-proxy-route tests
- Proof browser bundle/runtime never receives hosted token
- Keyboard, focus, labels, descriptions, error summary, status text, dialogs, responsive layout, and automated axe coverage

### Full validation

Task-appropriate format, lint, structure, type, unit, integration, contract, accessibility, coverage, audit, package, build, Docker, and `git diff --check` gates run throughout. Final `pnpm run ready` must pass with a recorded test count and coverage. No independent worker runs during shared-database integration/coverage.

## Implementation sequence and gates

1. **Evidence-slice authorization gate:** developer approves or amends the non-package architecture and may authorize only the isolated dependency/performance evaluation; feature implementation and final package selection remain blocked.
2. **Critical dependency/performance evidence gate:** when the developer separately starts evaluation, compare the named parser/transpiler/isolate candidates, review exact provenance/tarballs/lockfile/audits, run the adversarial capability slice and measured schema-build baseline, append results to this record, and stop. This gate is not feature implementation and was not started by design approval.
3. **Dependency/performance and implementation-authorization gate:** developer approves exact selected dependencies/digests, measured budgets, and residual risks, then separately authorizes implementation. The Tier 2 v1 no-third-party-import boundary and complete architecture are already design-approved.
4. **Security/compatibility slices:** prove restricted static schema extraction with the complete adversarial no-execution corpus, the selected compose runner's capability denial and credential unreachability, candidate hash parity, form-package extraction, and loopback token isolation before broad changes.
5. **Contract/kernel stage:** add source/actor/Authoring contracts and pure schema/content translation kernels with targeted tests.
6. **Database schema gate:** update Drizzle only; stop for developer migration generation, full inspection, developer application, and read-only verification.
7. **Principal/actor refactor:** make existing schema/entry/publication kernels actor-aware while preserving dashboard user behavior.
8. **Authoring read/content API:** implement isolated transport, scope-aware auth, content read/write/publication wrappers, SDK, and integration tests.
9. **Schema plan/apply:** implement source reconciliation, structural hashes, atomic project apply, receipts, audits/outbox, and CLI export/plan/push.
10. **Presentation authority:** add presentation-only publication and the dedicated dashboard editor; prove hash separation.
11. **Form extraction/local editor:** migrate dashboard to the package, add loopback editor, live schema drift behavior, and complete UX/security tests.
12. **Builder retirement:** remove dashboard structure controls/routes only after export/push and presentation workflows pass end to end.
13. **Docs/public artifacts/release staging:** add guides, Authoring reference, changelog/Changesets, tarball review, and clean fixture proof. No package publication.
14. **Final automated and manual review:** update progress/context, report all gates and blocked rollout choices, and stop for developer review. Do not commit.

A failed compatibility slice or migration review stops implementation and returns to design rather than forcing the selected architecture.

## Automated success criteria

- A clean TypeScript fixture defines every supported field kind with `@framerfordevs/schema` and produces deterministic canonical structure.
- A Tier 1-only project needs no build command or build artifact.
- Exact parser/transpiler/isolate packages and versions are developer-approved from recorded provenance, tarball, lockfile, audit, hostile-fixture, packaging, and performance evidence before feature implementation starts.
- Tier 2 v1 rejects third-party/bare package imports and Node/native/plugin capabilities while accepting only the compose export and bounded local modules.
- Representative and boundary schema-build baselines satisfy the approved cold p95, host RSS, guest memory/stack, output, and interruption budgets.
- An optional Tier 2 fixture uses callable helpers, factories, loops, mapping, spread, and fluent composition; `ffd schema build` emits byte-stable Tier 1 output that passes the identical restricted extractor and strict decoder.
- Tier 2 output/build manifest are committed and drift-checked; plan/push/check/editor never auto-build and reject or become read-only on stale output without executing composition source.
- Hostile Tier 2 code cannot observe credentials, keychain/config files, host APIs, or Tooling/Authoring network transport, and failure cannot change the prior generated pair.
- Existing hosted schemas export to code without changing stable IDs, contract hashes, content, presentation, or publication pointers.
- Source-key API-key renames preserve stable IDs and receive the existing breaking classification/acknowledgement behavior.
- Unknown/reused/reparented source identities fail before persistence.
- Complete multi-collection apply is atomic, idempotent, tenant-scoped, and supports references among newly created collections.
- Stale plan, current revision, presentation revision, or manifest authority cannot publish.
- Missing or extra risky acknowledgements cannot publish.
- No-op push creates no revision, audit mutation, or outbox event beyond the documented read/plan audit policy.
- Presentation-only edits create an immutable revision while preserving structure/contract hashes and generated type bytes.
- Dashboard structure routes can no longer mutate collection structure after retirement.
- OAuth and management grants are independently enforced for read, draft write, content publish, and schema push.
- Credential writes are attributed to the credential, never its issuer, in rows, receipts, audits, and responses.
- Every public content mutation is path-resolved and server-validated against the current published schema and exact locale.
- Atomic create-with-values leaves no empty entry on failure.
- Existing optimistic draft/publication conflict and replay behavior remains unchanged for dashboard users.
- Authoring v1 publishes only its allowlisted public contract and contains no dashboard/auth/member/credential-management/operator schema.
- Tooling v1, Delivery v1, Preview v1, and webhook v1 compatibility baselines remain unchanged.
- CLI schema/content workflows are non-interactive, machine-readable, idempotent, and never persist credentials/content.
- The extracted renderer supports every field kind, complete layout including sidebar, simultaneous form instances, and accessible error focus.
- Local editor reflects local code live, blocks saves on structure drift, and writes only to the hosted database through Authoring v1.
- Hosted bearer/refresh/management authority is absent from browser runtime, URLs, storage, logs, generated files, and every pre-auth extraction path.
- Loopback server rejects non-loopback peers, invalid Host/Origin/session, unknown proxy routes, and oversized requests.
- Deterministic package tarballs and clean-fixture TypeScript/runtime checks pass; no package is published.
- Applicable performance/load/query-plan, coverage, production build, Docker artifact, audit, and full readiness gates pass.

## Manual review

The developer will verify:

1. Export an existing dashboard-authored project to code and review readable source identities/configuration.
2. Change a label/layout in the dashboard and confirm code/types do not drift.
3. Add a field in code, inspect plan output, push it, and confirm stable identity plus local/dashboard form parity.
4. Attempt a breaking API-key/type/removal change, observe blocked push, then acknowledge exact change IDs and publish.
5. Create mutually referencing collections in one code push.
6. Use OAuth and a narrowly scoped management credential to demonstrate allowed and denied read/write/publish/schema operations.
7. Create/update/publish/unpublish exact-locale content from CLI and a script, then verify Delivery and webhook behavior.
8. Open `ffd editor`, edit real hosted content, trigger a concurrent conflict, preserve local edits, and recover explicitly.
9. Modify local schema without pushing and confirm live visual reflection with all saves disabled.
10. Inspect browser storage/network/devtools and local files to confirm no hosted bearer or content persistence.
11. Confirm the dashboard no longer offers collection structure building but retains the complete presentation editor and existing content editor.
12. Follow the updated developer portal journey from schema code through push, local editing, scripted publication, and verification.
13. Enable optional Tier 2, compose repeated fields with callable helpers/factories/loops/spread, run `ffd schema build` and `--check`, review the committed static diff/build manifest, prove stale output blocks authenticated/editor use without auto-building, and inspect adversarial evidence that the build runtime cannot reach credentials or hosted APIs.

## Alternatives rejected

### Extend Tooling v1 with writes

Rejected because M12 defines Tooling v1 as read-only, originless discovery and immutable schema retrieval. A separate Authoring major keeps compatibility, security, quotas, docs, and SDK intent explicit.

### Let the browser call hosted Authoring directly

Rejected because it widens CORS and exposes a powerful bearer to browser JavaScript. A closed loopback BFF preserves the existing originless bearer boundary.

### Use API keys as schema identity

Rejected because field API keys are intentionally mutable and may repeat across nested scopes. Rename would become remove/add and break stable identity.

### Put server UUIDs in hand-authored code or generate them client-side

Rejected because it harms DX and weakens the existing server-generated identity rule. Source keys provide readable reconciliation while stable IDs remain canonical/server-generated.

### Rewrite TypeScript files after push

Rejected because arbitrary source rewriting is fragile, formatting-destructive, and unsafe under composition. Server-persisted source mappings remove the need.

### Store identity only in the local lock

Rejected because lock loss/crash could cause duplicate identity or ambiguous recovery. The lock is diagnostic; the server mapping is authoritative.

### Import or execute the local TypeScript schema module

Rejected even in a scrubbed child process. Environment/token scrubbing protects only known secret channels; arbitrary project code could still read or modify repository/workstation files, access native keychains, spawn processes, or exfiltrate over the network. Cross-platform process isolation available to a Node CLI is not a sufficient security boundary, and fault injection cannot prove malicious code safe. The restricted static extractor preserves typed schema-as-code while removing execution authority.

### Execute schema callbacks on the hosted server

Rejected because it creates remote-code execution, determinism, dependency, and supply-chain authority. The server receives only strict data.

### Let local schema write content before push

Rejected because M7/M8 correctly validate against the current published schema. Drift is rendered read-only until schema publication.

### Attribute credential writes to the credential issuer

Rejected as human impersonation and contrary to M3. Credential actors require honest durable attribution.

### Keep presentation changes as unpublished draft state

Rejected because it makes GUI presentation depend on a later code push and allows code to overwrite it. Presentation-only immutable publication preserves both authorities.

### Remove omitted collections automatically

Rejected because collection deletion/key reuse and content/reference consequences are not designed. Omission fails safely.

## Decision-standard review

### Product alignment

The developer/agent can define structure, plan/push safely, script content, and edit through localhost without dashboard automation. Nontechnical content workflows and the database content authority remain intact.

### Correctness

Source reconciliation, stable IDs, strict structural/presentation projections, three distinct hashes, exact acknowledgement, immutable revisions, optimistic content versions, command receipts, and transactionally coupled audits/outbox preserve existing semantics.

### Security

Least-privilege grants, no credential impersonation, server-side validation, originless hosted authoring, loopback token isolation, no schema-module execution in authenticated/local-editor/server paths, a capability-denied credential-blind optional compose runner, release-blocking adversarial extractor/runner corpora, bounded inputs, tenant FKs, and secret/content-free observability address the expanded write surface.

### Reliability

Atomic project schema apply, idempotency, stable lock ordering, no local content authority, explicit conflicts, and failure injection prevent partial schema/content state and hidden last-write-wins behavior.

### Performance

Bounded complete schema documents, bulk persistence, weighted quotas, keyset content pages, lazy rich text, route splitting, and indexed source/receipt/actor lookups keep rare schema work and frequent content work separate.

### UX and DX

The authoring model is explicitly two-tiered. Tier 1 is the safest and simplest path: readable source keys, typed declarative code, no build, and no code execution, but no factories, loops, spread, mapping, or fluent composition. Optional Tier 2 restores those language ergonomics through `defineField`/`defineCollection`/`defineSchema` and local factories, then emits a committed Tier 1 artifact through a separate credential-blind command. This is closer to Sanity's authoring ergonomics but deliberately not identical: Sanity trusts unrestricted config/transitive code in its authenticated CLI process, while this design separates composition from every authenticated operation. Exact plan diagnostics, machine output, the one-install local editor, live drift display, complete generated forms, and unchanged database-backed content semantics support both humans and agents.

### Maintainability

Separate Authoring v1, declarative schema contracts with one restricted extractor and one optional reviewed compose runner, a controlled form package, shared Effect kernels, and explicit package ownership avoid coupling the browser/editor to server internals or reopening M9–M12.

## Developer-approved decisions

The developer approved all decisions below on 2026-08-23 without authorizing implementation. Items 12 and 14 still require recorded evidence and a second exact dependency/performance approval before implementation may begin:

1. Add separate Authoring API v1 and keep Tooling v1 read-only.
2. Add immutable server-persisted source keys for collections, fields/list items, and enum options while keeping domain IDs server-generated.
3. Add `structureHash` beside existing `schemaHash` and `contractHash`.
4. Use one bounded complete-project plan/apply transaction; omitted collections fail and deletion remains deferred.
5. Split code-owned structure from GUI-owned presentation and auto-publish presentation-only immutable revisions.
6. Preserve the current role matrix; M13 adds clients/grants but no new content-admin/editor permissions.
7. Add the four OAuth authoring grants and reuse exact existing management scopes.
8. Add credential-aware CMS actor attribution rather than attributing writes to credential issuers.
9. Add Authoring SDK/CLI entry operations using API-key paths translated to stable-ID mutations.
10. Statically extract a closed declarative TypeScript subset without importing or executing project code; prohibit an execution bypass and treat the adversarial extractor corpus as a release-blocking security gate.
11. Add optional `ffd schema build [--check] [--json]` as a separately invoked, first-party, capability-denied and credential-blind composition step; commit/drift-check its static Tier 1 output and build manifest, expose callable helpers only through `@framerfordevs/schema/compose`, and never auto-trigger it from authenticated/editor commands.
12. Require a separately authorized pre-implementation evidence slice for preferred `typescript@6.0.3` and `quickjs-emscripten`/`@jitl/quickjs-wasmfile-release-sync`, with `oxc-parser` and Bytecode Alliance Javy as named comparisons; require exact-version provenance/tarball/lockfile/audit/hostile-fixture evidence and a second approval before selection or feature implementation.
13. Accept the explicit Tier 2 v1 import boundary: first-party compose helpers plus bounded local modules, with no arbitrary npm packages, Node built-ins, native addons, or user loaders/plugins.
14. Require measured cold schema-build baselines before implementation authorization, initially targeting representative p95 ≤2 seconds, bounded-maximum p95 ≤5 seconds, guest memory ≤64 MiB, and peak host RSS ≤256 MiB; any revision requires explicit approval.
15. Ship the initial local editor as `ffd editor` with a loopback BFF; do not expose hosted bearer authority to the browser or widen Authoring CORS.
16. Extract the generated form into a shared private package and complete sidebar/multi-form/accessibility behavior.
17. Retire dashboard structure-authoring routes/UI only after export/push/presentation parity passes.
18. Authorize the proposed Drizzle changes and later developer-controlled migration workflow under migration name `add_code_first_authoring_authorities`.
19. Keep npm publication, OAuth production rollout, migration generation/application, commits, and milestone acceptance developer-controlled.
