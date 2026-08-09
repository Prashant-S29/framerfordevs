# Milestone 6 field system, structured rich text, external assets, editor layout, and generated forms

**Status:** Approved, implemented, manually reviewed, and committed as `fbb4767`

**Date:** 2026-08-05

## Decision summary

Milestone 6 will turn the M5 schema lifecycle into a complete, bounded field system and a framework-independent generated-form contract. It will add the complete initial field vocabulary, recursive object/list definitions, deterministic field-value validation, a versioned Portable Text profile, structured external-asset references, collection-reference configuration, independent editor layout, role-aware form projection, and an exhaustive React control registry.

The design uses:

- A discriminated, schema-backed field-definition vocabulary for every PRD field kind
- Stable UUIDv7 identities for root fields, nested object properties, and list-item definitions
- A normalized relational field tree with immutable relational revision snapshots
- A pure dependency-light validation kernel wrapped by focused Effect services
- A versioned central limits profile with depth 8 and a 1 MiB aggregate schema-document ceiling
- RE2-compatible user patterns evaluated by `re2js`, not native backtracking regular expressions
- A versioned, strict subset of the open Portable Text JSON model as canonical rich text
- `@portabletext/editor` only as a lazy-loaded React editing adapter, never as the canonical validator or renderer contract
- Structured HTTPS-only external assets that are validated but never fetched, embedded, probed, or transformed
- A bounded JSON editor-layout aggregate stored separately from the API/value contract
- Full management-schema and API-contract hashes so layout-only changes do not change generated content contracts
- Server-derived role-aware generated-form projections and an exhaustive client component registry
- Existing M5 optimistic versions, publication acknowledgement, transactions, audits, outbox events, and shared ManagedRuntime boundaries

The developer approved this complete design after review of recursion depth, aggregate schema size, nested-list semantics, mixed localization, and exact decimal/money support. M6 implementation is authorized. The agent must still stop after the approved Drizzle-schema change and must never generate or apply the developer-controlled migration.

## Source hierarchy and discovery completed

This proposal follows, in order:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. Every rule linked by `knowledge_base/rules/index.md`
4. `knowledge_base/milestone.md`, especially the M6 criteria
5. The implemented M1, M3, M4, and M5 decisions
6. Current repository contracts, schema engine, repository, policy, router, builder, UI package, and tests

The following installed guidance was reviewed and applied where material:

- Stable Effect v3 schemas, errors, Layers, observability, and `@effect/vitest`
- Drizzle schema, transaction, and relational patterns
- PostgreSQL data types, constraints, foreign-key indexes, JSONB, short transactions, and lock ordering
- Express boundary validation and centralized errors
- Security threat modeling, untrusted URL handling, XSS, SSRF, ReDoS, input bounds, and supply-chain review
- TanStack Query, Router, Start, and Form-adjacent repository patterns
- shadcn/ui Base UI form, composition, styling, icon, and trigger rules
- React 19 composition and Vercel React performance guidance
- Current Web Interface Guidelines and automated accessibility practices
- Turborepo package boundaries and package-owned dependency rules
- Better Auth's existing identity/session boundary, which remains unchanged

Current Git state was clean when design work started. M5 is committed at `28ca04d`; current `main` is at `da05158`.

## Research decisions

### Portable Text profile instead of HTML, Markdown, or editor-native state

The canonical rich-text value will use a strict application-owned profile of Portable Text because:

- Portable Text is an open JSON block-content specification, not tied to one CMS renderer or frontend framework.
- It separates content structure from HTML rendering.
- It has renderers across JavaScript frameworks and other languages.
- Its standalone React editor supports React 19 and schema-defined elements.
- Flat text blocks and list levels are easier to bound and validate than arbitrary DOM-like trees.

The upstream specification is still formally a working draft. Therefore, the platform will not accept arbitrary Portable Text. It will own a versioned `ffd-portable-text@1` profile, an exact allowlist, hard limits, and compatibility fixtures. Unknown upstream/custom nodes remain invalid until a later platform profile explicitly adds them.

The editor package is an adapter only. Server validation, code generation, delivery, and rendering must not import editor internals or trust editor output.

### Safe regular expressions

Developer-authored validation patterns are untrusted executable work. Native JavaScript `RegExp` can exhibit catastrophic backtracking. M6 therefore proposes `re2js`, a pure JavaScript RE2 implementation with browser and Node support and linear-time matching.

Rules:

- Pattern text is limited to 256 UTF-8 bytes.
- Only the supported RE2 syntax is accepted.
- Patterns compile when a field definition is validated, not for every keystroke.
- Excessive compiled program size is rejected with a bounded validation issue.
- No unbounded global compiled-pattern cache is introduced.
- Browser and server use the same pattern semantics.

### Exact decimal and money data

JavaScript `number` cannot preserve decimal currency exactly, and browser number controls may coerce or round before validation. Exact decimal and money therefore use canonical strings and bounded string-domain parsing/comparison.

`decimal.js` 10.6.0 was reviewed as a mature MIT arbitrary-precision option, but M6 performs validation and comparison rather than arithmetic, so adding its approximately 284 KiB unpacked package is unnecessary. The current `@dinero.js/currencies` release is an alpha package described as ISO 4217:2015 data, and `currency-codes` is older with legacy transitive dependencies. Neither becomes platform authority.

The authoritative currency source is the [current list from SIX](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html), the official ISO 4217 Maintenance Agency, using its [List One XML](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml). A deduplicated generated snapshot is checked into a browser-safe platform registry under profile `iso-4217@2026-01-01`, matching the source's `Pblshd` date, with source metadata and compatibility fixtures. Runtime validation performs no network or ICU-dependent currency discovery. No additional decimal or money runtime package is proposed.

### No rich-text or asset HTML trust boundary

Canonical values never contain trusted HTML nodes, raw style objects, event handlers, or executable embeds. Text such as `<script>` remains ordinary text and must be escaped by renderers. Rendering through `dangerouslySetInnerHTML` is prohibited for canonical rich text.

External-asset URLs are data only. M6 never performs DNS resolution, `fetch`, redirects, MIME detection, previews, metadata extraction, image loading, or availability checks. Consequently, no SSRF-capable server path is introduced.

## Scope

### Included

- All initial PRD field kinds
- Type-correlated field configuration schemas
- Defaults and field-value validation
- Stable recursive field identities
- Object/list definition and value limits
- Enum options with stable identities
- Entry-reference target configuration
- Structured rich-text profile and validator
- Structured external-asset profile and validator
- Editor help, placeholder, role visibility, and editability metadata
- Tabs, groups, sidebar, field placement, ordering, and help-text override layout
- Layout validation, optimistic mutation, publication snapshot, and change classification
- API-contract compilation independent from editor layout
- Role-aware generated-form definition endpoints
- Exhaustive generated-form React control registry and local form preview
- Security, observability, property, database, API, UI, and accessibility coverage

### Deferred

- Persisted entries and draft values: M7
- Entry revision history and restore: M7
- Actual reference-option browsing and entry existence validation: M7
- Reference publication requirements: M8
- Delivery filtering, sorting, uniqueness enforcement, and indexes: M9
- Draft preview credentials and public Preview API: M10
- Rich-text custom blocks, inline assets, mentions, tables, or embeds
- File upload, media library, asset proxying, remote metadata, or transformations
- Arbitrary HTML import or output
- User-defined roles or policy DSLs
- Real-time collaborative rich-text editing
- Arbitrary field plugins or third-party form components
- Field uniqueness, searchability, filterability, and sortability flags until their storage/query semantics are implemented in M7/M9

## Field vocabulary

The application literal registry expands to the complete PRD set:

- `short_text`
- `long_text`
- `rich_text`
- `number`
- `decimal`
- `money`
- `boolean`
- `date`
- `date_time`
- `enum`
- `url`
- `email`
- `slug`
- `json`
- `object`
- `list`
- `reference`
- `external_asset`

The database already reserves the original PRD literals. The developer-approved exact `decimal` and `money` additions require expanding the database kind check in the M6 Drizzle-schema change. M6 validates every kind-specific configuration and treats both additions as initial field-system contract types.

## Field identity and recursive structure

### Stable identities

Every schema node receives an immutable UUIDv7 `CollectionFieldId`, including:

- Root collection fields
- Nested object properties
- The single item definition owned by a list field

Future entries, generated tooling, dependency analysis, and visual bindings can therefore identify nested definitions without relying on labels, API keys, or array positions.

### Node roles

Persisted field nodes use one of three structural roles:

- `root`: top-level collection field
- `object_property`: keyed child of an object field
- `list_item`: the one unkeyed item definition of a list field

Root and object-property nodes have API keys, labels, and required state where their kind permits it. List-item nodes are unkeyed value definitions; their UI label is derived from the parent list field.

### Mixed-object and atomic-list localization

Localization uses `localized | shared | mixed` with these exact semantics:

- Every scalar, rich-text, reference, external-asset, money, decimal, JSON, and list value boundary is either `localized` or `shared`.
- An object may be `localized`, `shared`, or `mixed`.
- A localized/shared object is atomic for localization: all descendants inherit that mode and do not independently override it.
- A mixed object is structural. Its direct properties select `localized`, `shared`, or another mixed object recursively.
- A list is always atomic for localization. Its item definition and complete item subtree inherit the list's mode; mixed objects are forbidden below a list boundary.
- List-item definitions and other inherited descendants store no independent localization mode.
- A mixed object has no direct default and no independent required-presence rule. Its presence in final JSON is synthesized when any projected child is present; child required/default rules remain authoritative.
- A mixed object must contain at least one active property for publication, under the existing object rule.

This supports a single object such as `product` with shared `sku` and localized `title`, while avoiding ambiguous index-based merging for lists. M7 stores schema-shaped sparse shared and locale object fragments. M8 deep-merges object fragments by stable schema paths into a final publication; arrays are never deep-merged. Validation guarantees that the two partitions cannot own the same terminal path. No locale fallback is introduced.

A logical mixed root placement remains unique in editor layout. Generated forms project its shared descendants into the shared section and its localized descendants into locale tabs, then recombine validation paths under the one API object shape. Future fully mixed list items require stable content-item identities plus explicit shared order/insert/delete semantics and are outside the initial contract.

Parent identity and node role are immutable after creation. M6 exposes no reparent operation. Moving a field between parents requires an explicit remove and new server-generated identity, preventing hidden contract changes.

### Structural limits

- At most 100 active field nodes per collection, including descendants
- At most 50 direct object properties
- Exactly one active item definition for a publishable list
- Maximum field-definition depth: 8, with a root at depth 1 and every list-item definition counting as one level
- A list item definition cannot itself have kind `list`; nested lists require a semantically named object boundary such as `list(object({ items: list(short_text) }))`
- Root and object-property sibling positions are dense and zero-based
- A list item always occupies position 0
- A publishable object has at least one property
- A working draft may temporarily contain an object with no property or a list with no item; publication rejects it

The validator walks iteratively, tracks visited identities and object references, and rejects duplicate IDs, parent cycles, in-memory cyclic structures, excessive depth, excessive nodes, invalid parent kinds, direct list-of-list definitions, multiple list items, sparse sibling positions, and duplicate sibling API keys deterministically.

Depth and aggregate byte limits come from one immutable, browser-safe `FieldSystemLimits` profile rather than duplicated literals. Profile 1 defaults to depth 8 and 1,048,576 aggregate bytes. It is platform configuration in source, not a tenant setting, request input, or independently mutable environment variable; every process must validate a revision identically. Published schema documents record the validation-profile version. Raising a limit is compatible. Lowering one requires a new reviewed profile and must not silently invalidate an existing draft or published revision.

## Field contract shape

Effect Schema will express the field model as a discriminated union keyed by `kind`. A broad `Record<string, unknown>` is not allowed beyond database decoding before validation.

Shared root/object metadata includes:

- Stable field ID
- API key where structurally applicable
- Display label where structurally applicable
- Required state where structurally applicable
- Deprecation state
- Sibling position
- Editor metadata
- Kind-specific configuration
- Structural children for object/list definitions

### Editor metadata

Every user-facing root or object-property field defines:

- `helpText: string | null`, maximum 500 characters
- `placeholder: string | null`, maximum 200 characters
- `visibleToRoles: ProjectRole[]`
- `editableByRoles: ProjectRole[]`

The arrays are unique and canonically ordered. Edit roles must be a subset of visible roles and of roles that possess `content.write` in the fixed policy. Owner and developer remain visible and editable so schema managers cannot create an uninspectable field. These settings narrow authority; they never grant an action denied by project role or locale policy.

List-item definitions inherit editor access from their list parent.

## Type-specific configuration and value rules

All values are JSON-compatible. `undefined` means absent. `null` is not a valid field value in the initial contract; optionality is represented by absence. A configured default may supply an absent value. Required-without-default absence is invalid.

Defaults are validated by the exact field definition during schema validation. Invalid defaults prevent publication.

### Short text

- String value
- Absolute maximum: 500 Unicode code points
- Configurable `minLength` and `maxLength`
- Optional safe RE2 pattern
- Optional default
- NFC normalization; control characters are rejected except ordinary tab is not accepted in short text

### Long text

- String value
- Absolute maximum: 50,000 Unicode code points
- Configurable `minLength` and `maxLength`
- Optional safe RE2 pattern
- Optional default
- NFC normalization; line feeds are allowed, other control characters are rejected

### Number

- JSON number only; numeric strings are rejected
- `mode: integer | floating_point`
- Integers must be safe JavaScript integers
- Floating-point values must be finite; `NaN`, positive/negative infinity, and overflow to infinity are rejected
- Configurable inclusive `minimum` and `maximum`
- Minimum must not exceed maximum
- Optional default

`floating_point` is an interoperable IEEE-754 JSON number for measurements and approximate values. It must not be presented as exact decimal arithmetic or used for currency.

### Exact decimal

- Canonical JSON string, never a JSON number
- Base-10 syntax only; scientific notation, leading plus, leading zeroes, trailing fractional zeroes, and negative zero are non-canonical
- Canonical examples: `"0"`, `"-12.5"`, `"0.001"`, and `"1200.01"`
- Configurable precision from 1–38 total digits and maximum scale from 0–18 fractional digits
- Configurable exact inclusive minimum and maximum using the same canonical representation
- Optional exact default
- Values outside precision/scale/bounds are rejected; the validator never rounds or converts through JavaScript `number`

A bounded pure parser normalizes authoring input and compares sign, coefficient, and scale exactly. Authoritative API values must already be canonical. No arbitrary-precision arithmetic dependency is required because M6 validates and compares values but performs no arithmetic.

### Money

Canonical value:

```json
{
  "amount": "19.99",
  "currency": "USD"
}
```

Rules:

- `amount` uses the exact decimal canonical representation with at most 38 digits
- `currency` is one active uppercase ISO 4217 alphabetic code from the revision's pinned currency-registry profile
- Field configuration allows 1–50 currencies and an optional default value
- Amount fractional digits cannot exceed that currency's ISO 4217 minor-unit value
- Negative amounts are rejected by default and may be enabled explicitly
- Unknown keys, unsupported/retired codes, non-canonical amounts, excessive precision/scale, and non-finite concepts are rejected
- The platform never rounds an authored value, performs arithmetic, converts currencies, calculates tax, or claims payment-grade settlement behavior
- Generated display may pad to the currency minor unit, but canonical storage does not retain insignificant trailing zeroes

The platform checks in a generated, reviewable registry snapshot sourced from the official SIX ISO 4217 Maintenance Agency list. The registry profile and source date are versioned with schema revisions; there is no runtime network fetch and runtime ICU data is not validation authority. Codes without a numeric minor unit, testing code `XTS`, and no-currency code `XXX` are excluded from profile 1. A future registry update must preserve historical decoding under the prior revision profile.

For unit prices that intentionally need more precision than a currency's minor unit, developers use an exact `decimal` plus an enum currency inside an object rather than weakening money semantics.

### Boolean

- Boolean only
- Optional default
- No truthy/falsy coercion

### Date

- Canonical `YYYY-MM-DD`
- Four-digit Gregorian year, month, and day
- Calendar validity is checked explicitly, including leap years
- Optional inclusive minimum/maximum and default
- No JavaScript date rollover acceptance

### Date and time

- RFC 3339 instant with mandatory `Z` or numeric UTC offset
- Unqualified local timestamps are rejected
- Uppercase `T` and `Z` are emitted canonically
- Accepted instants normalize to UTC with millisecond precision
- Invalid dates, times, offsets, non-finite timestamps, and unsupported leap-second representations are rejected
- Optional inclusive minimum/maximum and default

The generated control may collect browser-local date/time, but it must display the active time-zone context and convert to the canonical UTC value before validation.

### Enum/select

Each option has:

- Immutable server-generated `EnumOptionId`
- Stable developer-facing lowercase snake-case value
- Mutable display label
- Dense position

Rules:

- 1–100 options for publication
- Unique IDs and values
- Value must equal one configured option value
- Optional default must reference an active option

Option labels and order are authoring metadata. Option values are API content.

### URL

- Absolute WHATWG URL
- `http:` and `https:` only
- Host required
- Embedded username/password rejected
- Maximum 2,048 characters
- Optional default
- `javascript:`, `data:`, `file:`, `blob:`, protocol-relative, malformed, and relative values are rejected

URL validation never establishes remote trust or availability.

### Email

- String maximum 254 characters
- Practical HTML/WHATWG-compatible single-address profile
- No display-name wrappers or multiple-address lists
- Control/whitespace rejection
- Domain is canonicalized to lowercase; local-part casing is preserved
- Optional default

No mail server or account existence check occurs.

### Slug

Slugs support localized scripts rather than forcing English transliteration:

- NFC-normalized Unicode
- 1–200 code points, configurable narrower min/max
- Hyphen-separated segments
- Segments begin with a Unicode lowercase/uncased letter or number and may continue with combining marks
- No whitespace, slash, percent escape, leading/trailing hyphen, repeated hyphen, controls, or compatibility-only punctuation
- Uppercase cased letters are rejected rather than silently changed
- Optional safe RE2 pattern and default

Uniqueness is deferred until entries exist.

### JSON

- Any JSON-compatible scalar, array, or object
- Hard maximum serialized UTF-8 size: 64 KiB
- Hard maximum depth: 10
- Hard maximum visited nodes: 10,000
- Non-finite numbers, `undefined`, functions, symbols, bigint, sparse arrays, cyclic values, and dangerous object keys (`__proto__`, `prototype`, `constructor`) are rejected
- Configurable lower byte/depth limits
- Optional default

### Object

- Exact plain object value
- Properties come from stable child definitions
- Unknown keys are rejected
- Required/default behavior is evaluated recursively
- At most 50 configured properties
- Maximum field/value depth: 8
- Hard serialized UTF-8 size: 256 KiB per root value
- Optional default, validated recursively

### List

- Array value
- Exactly one item definition in a publishable schema
- Configurable `minItems` and `maxItems`, with hard maximum 100
- Optional `uniqueItems`; uniqueness uses canonical JSON equality and is bounded by 100 items
- Items validate recursively against the item definition
- A direct list item of kind `list` is rejected; an object boundary is required before another list
- Maximum structural/value depth: 8
- Hard serialized UTF-8 size: 256 KiB per root value
- Optional default, validated recursively

### Entry reference

- Canonical value is a stable entry UUID; entry identity is formally introduced in M7
- Definition stores a stable target `CollectionId`
- Target collection must exist in the same workspace/project/environment
- Cross-tenant, cross-project, and cross-environment targets are rejected uniformly
- A singular reference is one field; multiple references use `list(reference)`
- Entry existence and publication requirements are deferred to M7/M8
- Reference defaults are deferred until `EntryId` exists in M7

### External asset

Canonical value:

```json
{
  "source": "external",
  "url": "https://cdn.example.com/asset.pdf",
  "kind": "document",
  "title": "Company brochure",
  "alt": "Company brochure",
  "width": null,
  "height": null
}
```

Rules:

- `source` is exactly `external`
- Kinds: `image | video | audio | document | archive | other`
- URL is absolute HTTPS only, host-bearing, credential-free, and at most 2,048 characters
- Title and alt are nullable, control-free, and at most 500 characters
- Width and height are independently nullable positive safe integers capped at 100,000
- Unknown keys are rejected
- Optional default must satisfy the same contract
- No server or automatic browser fetch occurs
- The preview UI displays metadata and a safe explicit link; it does not embed the remote resource

An empty image alt string is permitted to represent a deliberately decorative image. Generated forms explain that semantic choice.

## Structured rich text

### Canonical wrapper

```json
{
  "version": 1,
  "profile": "ffd-portable-text",
  "blocks": []
}
```

The wrapper makes platform compatibility explicit while the block payload follows the approved Portable Text subset.

### Allowed text blocks

- `_type: "block"`
- Unique bounded `_key`
- Styles: `normal`, `h2`, `h3`, `h4`, `h5`, `h6`, `blockquote`
- Optional list kind: `bullet | number`
- List level: 1–3 only when list kind is present
- Child spans with `_type: "span"`, unique bounded `_key`, text, and unique marks
- Mark definitions referenced by span mark keys

### Allowed decorators and annotations

Decorators:

- `strong`
- `em`
- `underline`
- `strike-through`
- `code`

Annotation:

- `link` only
- Link targets may be an in-project relative path beginning with `/`, an in-document fragment beginning with `#`, or an absolute `http:`, `https:`, `mailto:`, or `tel:` URL
- Protocol-relative URLs, credentials, controls, malformed values, and executable/data/file/blob schemes are rejected

### Excluded in profile 1

- Raw HTML
- Inline style/CSS
- Event attributes
- Images or external assets inside rich text
- Arbitrary custom blocks or inline objects
- Iframes, scripts, embeds, tables, mentions, and executable nodes
- Unknown styles, decorators, annotations, keys, attributes, or node types

### Hard limits

- Serialized UTF-8 size: 256 KiB
- Blocks: 500
- Spans: 5,000 total
- Mark definitions: 1,000 total
- Text: 100,000 Unicode code points total
- List depth: 3
- Generic decoded JSON depth: 8
- Generic visited JSON nodes: 20,000
- Returned issues: 50

An iterative preflight enforces size, depth, node count, cycles, JSON compatibility, and dangerous-key rejection before schema decoding. This prevents malformed deep input from reaching recursive decoders.

### Aggregate schema-document limit

The complete canonical management draft and every immutable management revision are limited to 1 MiB (1,048,576 UTF-8 bytes), including collection contract metadata, every active field node, type configuration, defaults, editor metadata, reference configuration, and editor layout. Per-field and per-value limits remain in force as narrower controls.

Every successful field or layout mutation reconstructs and measures the prospective complete draft inside the existing transaction before writing. Publication measures the exact canonical document again before hashing or inserting revision artifacts. An oversized draft is rejected with one bounded path-aware validation issue; hashing, revision insertion, audit creation, and outbox creation do not begin. Historical revisions retain the validation-profile version under which they were accepted.

PostgreSQL cannot express a useful immutable cross-row aggregate check for this normalized tree. The transactional application invariant is therefore authoritative, while bounded JSONB column checks remain defense in depth. Size-boundary, cumulative-default, no-partial-write, and size-bucket telemetry tests are required.

### Configuration

A rich-text field may narrow the platform profile with:

- Allowed styles
- Allowed decorators
- Links enabled/disabled
- Allowed list kinds
- Minimum and maximum text length within platform hard caps
- Optional default document

The field cannot add a node type outside the platform profile.

### Editor adapter

`@portabletext/editor` is proposed for the React editing surface because it edits the chosen canonical family directly and supports schema-defined content. It will be:

- Added only after explicit approval with pnpm
- Owned by `apps/web`, the package that imports it
- Lazy-loaded only when a rich-text control is rendered
- Wrapped behind the generated-form control interface
- Configured from the strict platform profile
- Followed by authoritative platform validation on every change/save boundary
- Tested for keyboard operation, labels, toolbar state, focus return, paste handling, and axe-detectable violations

Pasted HTML is parsed only through the editor allowlist and emitted as structured JSON. Raw pasted HTML is never stored.

## Validation architecture

### Dependency-light pure kernel

A narrow browser-safe module will own deterministic algorithms for:

- Field-definition validation
- Field-tree reconstruction and cycle/depth checks
- Field-value validation and default application
- Safe URL, email, slug, date, and date-time handling
- RE2 pattern compilation/matching
- JSON preflight and canonical serialization
- Rich-text and external-asset decoding
- Editor-layout validation and role projection
- API-contract compilation and contract hashing input

It must not import Effect, Drizzle, Better Auth, server configuration, or telemetry. This follows the M4 browser-bundle learning.

### Effect services

A focused `FieldEngine` service wraps the pure kernel with named `Effect.fn` methods and typed schema-backed failures. `SchemaEngine` remains responsible for aggregate validation, canonical full-schema hashing, change classification, acknowledgement calculation, and publication fingerprinting.

Production Layers are composed once into the existing shared `ManagedRuntime`. Stable Drizzle remains Promise-native inside `SchemaRepository`. No local runtime or request-local Layer is introduced.

The repository may call the same synchronous pure kernel inside its locked Drizzle transaction. It must not call `Effect.run*` inside a Promise transaction callback.

### Validation outputs

Value and definition failures use bounded path-aware issues with machine codes. Human messages remain safe feedback and are never branch keys.

Paths use stable field IDs for definition issues and API-key/list-index paths for values. At most 50 issues are returned; validation still reports a capped flag when more exist.

## Editor layout

### Independence from the content contract

Editor layout controls authoring presentation only. It never changes:

- Field stable IDs
- API keys
- Field value types
- Required/localized/shared semantics
- Validation rules or defaults
- Delivery JSON shape
- The compiled API contract or `contractHash`

Layout is part of the immutable management revision so generated forms are reproducible, but it is excluded from the future public Schema API contract projection.

### Layout model

Version 1 is a bounded aggregate:

- 1–10 tabs
- 1–20 groups per tab
- 0–10 sidebar groups
- Stable layout-node UUIDs
- Tab/group titles and optional descriptions
- Group column count of 1 or 2
- Ordered root-field placements
- Optional placement help-text override
- Role visibility at tab, group, and placement levels

Nested object/list children render inside their root placement and are not independently placed in the top-level layout.

### Layout invariants

- Every active root field appears exactly once
- Missing, duplicate, removed, foreign, or nested field references are rejected
- Layout node IDs are unique
- Positions are dense within every container
- Role arrays are unique and known
- Effective placement visibility is the intersection of tab, group, placement, and field visibility
- A placement cannot claim a role hidden by its field
- Effective editability is additionally intersected with field editability and project policy
- Empty effective visibility is rejected
- At most 100 placements and 32 KiB serialized layout
- Unknown keys and dangerous object keys are rejected

Existing collections/revisions with no stored layout receive a deterministic synthetic layout: one `Content` tab, one main group in schema field order, and no sidebar. The first explicit edit persists it.

### Mutation behavior

A complete-layout update includes expected draft version. Under the existing project/collection lock order, the server re-reads the field tree, validates the complete result, compares canonical equality, and either:

- Returns a no-op without version/audit noise, or
- Stores the layout, increments draft version once, and writes one audit event

Adding a root field appends a placement to the default/final main group atomically. Removing a root field removes its placement atomically. Reordering schema fields does not reorder editor layout; the two orders are intentionally independent.

## Hashing, classification, and publication

### Format versions and hashes

M6 introduces schema document format version 2 and records validation profile `ffd-fields@1`.

- `schemaHash`: hash of the full immutable management schema, including validation/currency-profile identity, field identities, definitions, editor metadata, and editor layout
- `contractHash`: derived hash of the API/value contract, including effective localization, exact numeric contracts, and pinned money semantics while excluding display-only metadata, role presentation, help text, placeholders, and editor layout

`contractHash` is computed from bounded revision fields and does not need a persisted column in M6. It is returned by management schema responses and included in schema-publication outbox payloads.

A layout-only publication changes `schemaHash` and revision sequence but leaves `contractHash` and compiled API contract byte-identical.

Existing M5 revisions are format version 1 with synthetic layout. Publishing their unchanged draft through the M6 engine creates one non-breaking format-upgrade revision rather than silently changing historical hashes.

### Change classification additions

| Change                                                  | Classification                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Schema format 1 → 2                                     | Non-breaking                                                                                 |
| Help text, placeholder, editor access, or layout change | Non-breaking                                                                                 |
| Add enum option                                         | Non-breaking                                                                                 |
| Enum label/order change                                 | Non-breaking                                                                                 |
| Remove enum option                                      | Breaking                                                                                     |
| Change enum option value                                | Breaking                                                                                     |
| Lower/remove minimum or raise/remove maximum            | Non-breaking                                                                                 |
| Raise/add minimum or lower/add maximum                  | Potentially breaking                                                                         |
| Remove pattern                                          | Non-breaking                                                                                 |
| Add/change pattern                                      | Potentially breaking                                                                         |
| Add/change/remove default                               | Non-breaking, except removing the only default from a required field is potentially breaking |
| Increase list maximum or decrease list minimum          | Non-breaking                                                                                 |
| Decrease list maximum or increase list minimum          | Potentially breaking                                                                         |
| Enable `uniqueItems`                                    | Potentially breaking                                                                         |
| Disable `uniqueItems`                                   | Non-breaking                                                                                 |
| Add optional object property                            | Non-breaking                                                                                 |
| Add required object property                            | Potentially breaking                                                                         |
| Remove object property                                  | Breaking                                                                                     |
| Change nested kind or API key                           | Breaking                                                                                     |
| Change reference target collection                      | Breaking                                                                                     |
| Change any effective localization mode                  | Breaking                                                                                     |
| Atomic object ↔ mixed object localization               | Breaking                                                                                     |
| Increase decimal precision/scale or widen bounds        | Non-breaking                                                                                 |
| Decrease decimal precision/scale or narrow bounds       | Potentially breaking                                                                         |
| Add an allowed money currency                           | Non-breaking                                                                                 |
| Remove an allowed money currency                        | Breaking                                                                                     |
| Permit negative money                                   | Non-breaking                                                                                 |
| Forbid previously permitted negative money              | Potentially breaking                                                                         |
| Upgrade money currency-registry profile                 | Potentially breaking unless accepted values provably only expand                             |

When set-inclusion cannot be proved safely, the classifier chooses the stricter applicable category. Configuration changes are coalesced into deterministic bounded per-field changes rather than emitting one acknowledgement for every scalar property.

M5 exact acknowledgement, stable change IDs, command fingerprints, no-op behavior, optimistic versions, and current-published-revision checks remain authoritative.

### Publication transaction

The M5 transaction expands to:

1. Lock project, collection, and active field nodes in the existing global order.
2. Resolve authorization, environment, CMS capability, and idempotent command replay.
3. Validate expected draft/publication versions.
4. Load the complete bounded field tree, referenced target collections, validation/currency profiles, and editor layout.
5. Validate definitions, defaults, money semantics, references, localization partitions, and layout.
6. Compute full schema and contract documents/hashes.
7. Recompute changes and exact acknowledgements.
8. Insert immutable revision metadata.
9. Insert immutable relational field-tree snapshots.
10. Snapshot editor layout.
11. Update schema head without incrementing draft version.
12. Insert audit and outbox rows.
13. Commit all state or none.

No network call, remote asset lookup, editor operation, or telemetry export occurs inside the transaction.

## Database design

M6 requires a developer-controlled migration.

### Extend `cms_collection_field`

Add:

- `parent_field_id` nullable UUID
- `node_role` with `root | object_property | list_item`, defaulting existing rows to `root`
- `reference_collection_id` nullable UUID
- Bounded JSONB `editor_metadata` for help, placeholder, visibility, and editability

Expand the allowed field-kind check with `decimal` and `money`; existing kinds and rows remain unchanged.

Adjust structural columns so list-item rows may omit API key, display label, required state, and localization. Extend localization to `localized | shared | mixed`, permit `mixed` only for object nodes outside list boundaries, and permit null localization only for list items or descendants that inherit an atomic ancestor. Mixed objects cannot own defaults or independent required presence. Replace broad lifecycle checks with role-, kind-, and effective-localization-correlated checks.

Add restrictive composite tenant foreign keys for:

- Parent field within the same collection/environment/project/workspace
- Reference target collection within the same environment/project/workspace

Replace active collection-global key/position uniqueness with partial indexes for:

- Root keys and positions
- Object-property sibling keys and positions
- One list item per parent

Add parent/reference supporting indexes and a self-parent rejection check. The application owns deeper cycle detection because SQL foreign keys alone cannot express arbitrary acyclic trees.

### Extend `cms_schema_revision_field`

Add immutable snapshot columns:

- `parent_field_id`
- `node_role`
- `reference_collection_id`
- Immutable bounded JSONB `editor_metadata`

Add a restrictive same-revision parent foreign key, target collection foreign key, role-, kind-, and effective-localization-correlated checks, sibling uniqueness, and parent/reference indexes.

### Extend `cms_collection_schema_head`

Add:

- Nullable bounded JSONB `editor_layout`; null represents the deterministic synthetic layout for an existing M5 collection until first explicit edit
- Non-null bounded `validation_profile`, initialized to `ffd-fields@1` for active drafts
- Nullable bounded `currency_registry_profile`; creating the first money field pins the current supported profile and future profile changes require an explicit schema operation

Pinning profiles on the draft head prevents a deployment-time configuration update from silently changing validation of an existing draft.

### Extend `cms_schema_revision`

Add:

- `format_version`, with existing revisions defaulted to 1
- Bounded `validation_profile`, with historical M5 revisions marked as the legacy profile and new revisions using `ffd-fields@1`
- Nullable bounded `currency_registry_profile`
- Nullable bounded JSONB `editor_layout` for historical M5 compatibility

New M6 publications write format 2, validation profile `ffd-fields@1`, the draft-pinned ISO 4217 currency-registry profile when money fields are present, and an explicit validated layout snapshot. Supported historical registry/profile data remains in application code so immutable revisions never change meaning.

### Configuration storage

Type-specific configuration remains bounded JSONB on each field node and revision-field snapshot. The application owns evolvable discriminated validation; database checks enforce object shape and individual byte bounds. The existing 8 KiB checks are insufficient for approved bounded defaults and must be replaced with a 320 KiB (327,680-byte) per-configuration ceiling; the authoritative complete canonical schema remains capped at 1 MiB transactionally. No GIN index is added because configuration is aggregate data loaded by collection/revision and is not queried by arbitrary JSON predicates.

### Migration compatibility

Existing root fields remain roots without custom data backfill. Existing empty M5 configurations decode as type-specific defaults. Existing revisions remain immutable format-1 history.

The agent will edit only the Drizzle schema after approval, then stop. It will provide the migration name and exact commands to the developer and will not generate, apply, push, execute, or silently rewrite a migration.

## Authorization and non-enumeration

- Better Auth continues to establish human identity only.
- Every management/form procedure requires a session.
- Schema mutation requires `schema.write`; publication requires `schema.publish`; published form definition requires `schema.read`.
- Existing all-locale requirement for project-global schema writes remains.
- Known active members without an action receive `FORBIDDEN`; foreign/nonexistent scope remains non-enumerating `NOT_FOUND`.
- Reference targets are resolved from persisted tenant scope, not client authority.
- Server-derived effective role controls generated-form projection. A client cannot request a broader role.
- Editor field access can only narrow role policy.
- Archived projects allow authorized immutable published-form reads but reject draft/layout mutations.

M7 content operations must enforce field visibility/editability server-side. M6 UI filtering is not treated as the future content authorization boundary.

## API contracts

Existing field create/update/remove/reorder inputs expand to structural/type-specific definitions while preserving server-generated IDs and optimistic draft versions.

Planned additions:

- `platform.projects.collections.schema.layout.update`
- `platform.projects.collections.schema.form.getDraft` for schema writers
- `platform.projects.collections.schema.form.getPublished` for role-aware published preview

Draft and published schema responses add:

- Format and validation-profile versions
- Pinned currency-registry profile when money fields are present
- Full recursive/structural field definitions
- Editor layout for management callers
- Derived `contractHash`

Generated-form responses contain only effective fields/layout for the authenticated role and omit API-key/developer metadata not needed by client editors where practical.

These are schema/form-definition operations, not content operations, so they do not take locale in M6. M7 generated entry forms will compose this definition with mandatory explicit locale context.

All application procedures preserve the standard response envelope, centralized errors, request IDs, OpenAPI conversion, and safe typed failures.

No new public error code is required unless implementation proves that existing `SCHEMA_INVALID`, `VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, and `VERSION_CONFLICT` cannot express a safe outcome. Any new code requires centralized schema and status mapping.

## Generated form architecture

### Framework-independent definition

The API contract exposes a renderer-neutral `GeneratedFormDefinition` containing:

- Collection/revision/contract identity
- Effective role and read/edit capability flags
- Ordered projected layout
- Projected typed field definitions
- Defaults and validation metadata
- Effective shared/localized/mixed object projection metadata
- Pinned money currency code/minor-unit metadata
- Reference target identity without entry options

It contains no React component, HTML, CSS, editor instance, secret, or content payload.

### React control registry

`apps/web` owns an exhaustive registry keyed by every field kind. TypeScript `satisfies` must fail compilation when a field kind lacks a control.

Controls:

- Short text, URL, email, slug: `Input` with correct type/input mode
- Long text and JSON: `Textarea`
- Number: number-aware input without coercing invalid strings prematurely
- Exact decimal: text input with decimal input mode and exact string parsing, never `type="number"` coercion
- Money: composed exact amount input and allowed-currency select with minor-unit guidance
- Boolean: accessible checkbox/switch semantics
- Date/date-time: explicit native controls and time-zone context
- Enum: grouped Select/NativeSelect options
- Rich text: lazy Portable Text editor adapter
- Object: nested `FieldSet`/`FieldGroup`
- List: bounded field-array controls with add/remove/reorder buttons
- Reference: typed disabled/empty state until M7 supplies entry options
- External asset: composed URL/kind/metadata fieldset with no remote preview

The registry consumes a generic `state / actions / meta` provider contract. Explicit control components are preferred over boolean-heavy conditionals. Recursive object/list rendering is bounded by the already-validated schema depth.

### Preview UX

- Schema writers can inspect the current draft form.
- Any authorized schema reader can inspect the latest published form projected for their actual role.
- There is no content save in M6; preview values remain local and are clearly labeled as non-persistent.
- A developer-only role simulator may render an additional local projection for design review, but it never changes server authorization or exposes content.
- Client-facing preview omits schema mutation controls and implementation-heavy identifiers.

### Accessibility and UI rules

- Existing shadcn Base UI components are used before custom markup.
- Forms use `FieldGroup`, `Field`, `FieldSet`, and `FieldLegend`.
- Invalid fields use both `data-invalid` and `aria-invalid`.
- Help and errors have stable IDs and `aria-describedby`/`aria-errormessage` associations.
- Error summary links/focuses the first invalid field.
- Every field has a visible label, required text, and non-color status.
- List/object controls are keyboard operable; move actions are not drag-only.
- Rich-text toolbar uses semantic toggle/button controls, announces state, returns focus appropriately, and has an accessible editable label.
- Async validation/save status uses polite live regions.
- Unsaved preview/builder changes use router and `beforeunload` guards, not only dialog confirmation.
- Large conditional controls are lazy-loaded; no content-rendering component uses `dangerouslySetInnerHTML`.

### TanStack data behavior

- Route loaders use `ensureQueryData`.
- Independent access/project/draft/validation/form queries begin in parallel after the environment dependency resolves.
- Query keys include project, environment, collection, revision/source, and every server dependency.
- Mutations invalidate only affected list, draft, validation, layout, published-revision, and form-definition queries.
- Authoritative refetch remains preferred over optimistic schema-tree cache writes because IDs, versions, references, and classification are server-owned.
- The existing non-nested trailing-underscore route convention remains covered by the route-tree regression test.

## Implementation and code-practice constraints

- Work remains limited to M6; entries and publication behavior are not pulled forward.
- Stable Effect 3.22 and the existing Promise-native Drizzle boundary remain unchanged.
- Effect Schema is the source for named boundary/domain contracts; reusable variants use named classes/tagged unions where the installed stable API supports them, and derived shapes are not duplicated manually.
- Expected failures remain typed; defects and interruption remain distinct; no raw third-party error reaches a public contract.
- No `any`, unsafe assertion, `orDie` convenience, TypeScript namespace, local production `Effect.provide`, request-local runtime, or business-layer `Effect.run*` is allowed.
- Dependencies are added with pnpm to the package that imports them. Package manifests are never edited manually for versions, and package internals are never imported across workspace boundaries.
- Browser-safe validation stays in a narrow export and must not pull Effect, Drizzle, server configuration, Better Auth, or telemetry into the client bundle.
- React controls use explicit variants/compound composition rather than boolean-prop proliferation, derive state during render, avoid inline component declarations, and use direct package/component exports.
- Every new or materially modified hand-authored source file follows `comment-rules.md`: concise responsibility header; non-UI function/callback documentation; UI files receive only the file header.
- Tests are implemented with behavior, not deferred to the end. Effect tests use `@effect/vitest` Layers rather than ad hoc runtimes.
- The agent never commits, generates/applies a migration, modifies an applied migration, or starts M7 without explicit developer approval.

## Observability and audit

### Audit actions

Continue existing field actions and add:

- `cms.editor_layout.updated`

Nested field actions use stable field IDs and existing field audit action families. Audits contain no labels, API keys, defaults, patterns, role arrays, layout JSON, target names, rich text, asset URLs, or form values.

### Spans

Named spans cover:

- Field-definition validation
- Field-value validation where invoked
- Rich-text decode
- Layout validate/update
- Contract compilation
- Generated-form projection
- Schema publication

Safe annotations include stable IDs, field kind, bounded counts/buckets, format version, validation outcome, and change severity. They exclude patterns, defaults, URLs, rich-text text, JSON values, help text, labels, and complete schemas.

### Metrics

Bounded metrics cover:

- Definition validation outcome by field kind
- Value validation outcome by field kind and validation purpose
- Layout validation/update outcome
- Rich-text rejection category and size bucket
- Form compilation outcome and bounded field-count bucket
- Existing schema publication outcome/duration

No tenant ID, field ID, role array, URL, pattern, hash, user content, or label becomes a metric label.

## Threat and failure model

| Threat/failure                        | Control                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Cross-tenant nested/reference IDs     | Composite tenant FKs, persisted-scope queries, non-enumeration                                  |
| Client invents stable nested/enum IDs | Server-generated identity; update reconciliation rejects unknown IDs                            |
| Recursive/cyclic definition DoS       | Immutable parent relation, iterative visited-set validation, 100-node/depth-8 caps              |
| Aggregate schema/default memory DoS   | Transactional 1 MiB canonical-document cap before hashing or persistence                        |
| Deep/cyclic JSON value DoS            | Iterative preflight, node/depth/byte caps, cycle detection                                      |
| ReDoS from custom patterns            | `re2js`, syntax/program/byte limits, bounded value lengths                                      |
| Rich-text stored XSS                  | Exact node/mark allowlist, no HTML nodes, safe link protocols, escaped rendering                |
| Asset URL becomes SSRF                | No server fetch/DNS/redirect/metadata behavior in M6                                            |
| Browser silently loads remote asset   | Preview renders metadata/link only, no automatic media element                                  |
| Unsafe URL protocols                  | Central protocol allowlists and credential rejection                                            |
| Layout exposes hidden field           | Field-first role projection and subset validation at every layout level                         |
| UI role tampering                     | Role derived from persisted access; client role is never authority                              |
| Mixed object partition collision      | Schema-path ownership validation and deterministic object-only deep merge                       |
| Mixed localization below a list       | Lists are atomic; their complete item subtree inherits one mode                                 |
| Currency registry drift               | Revision-pinned app-owned ISO 4217 profile sourced from official SIX data                       |
| Floating-point currency loss          | Dedicated canonical-string decimal/money fields; JSON number is explicitly approximate          |
| Layout mutates API contract           | Separate contract compiler/hash and byte-stability tests                                        |
| Stale schema/layout overwrite         | Expected draft version, collection lock, authoritative refetch                                  |
| Reference target archives/disappears  | Stable restrictive FK; mutation revalidates target scope                                        |
| Published revision mutates            | Insert-only snapshots and restrictive FKs                                                       |
| Direct list-of-list authoring         | Reject direct list items of kind `list`; require a named object boundary                        |
| Package/bundle regression             | pnpm package ownership, lockfile review, audit, route/editor code splitting, build chunk review |
| Log/trace leaks patterns or values    | Stable-ID/count-only observability and existing redaction boundary                              |

## Test plan

### Pure contracts and property tests

- Every field kind accepts its exact configuration and rejects mismatched/unknown configuration
- Old M5 empty configurations decode to canonical defaults
- Required/optional/default truth table
- String min/max/code-point/control boundaries
- RE2 valid/invalid syntax, program bounds, browser/server parity, and poison-pattern safety
- Integer safe-range and floating-point finite/overflow, negatives, zero, and inclusive bounds
- Exact decimal canonical syntax, normalization, precision, scale, sign, exact comparison, bounds, and defaults without conversion through `number`
- Money amount/currency shape, allowed currencies, ISO minor units, negative policy, defaults, registry-profile history, and no rounding/arithmetic/network behavior
- Gregorian date/leap-year boundaries and impossible dates
- RFC 3339 offsets, normalization, invalid local time, invalid calendar/time/offset, and overflow
- Enum stable ID/value/label/order and default behavior
- URL protocol, credentials, host, relative, malformed, and length cases
- Email practical-profile boundaries
- Unicode slug NFC, Hindi/Gujarati, combining marks, uppercase, hyphen, slash, percent, and length cases
- JSON scalar/container/depth/size/node/cycle/sparse/non-finite/dangerous-key cases
- Object exact keys, recursive required/default behavior, and unknown-key rejection
- List min/max/unique/default/item/depth/size behavior
- Reference target type and identity contracts
- External asset kinds, metadata, dimensions, unknown keys, unsafe protocol, and no-fetch behavior
- Rich-text valid fixtures, unknown nodes/marks, duplicate/missing keys, dangling marks, malformed lists, bad links, depth, node count, text count, and byte limits
- Rich-text property generation and encode/decode stability
- Field-tree duplicate/cycle/depth/sibling/list-item cases, including depth-8 acceptance, depth-9 rejection, and direct list-of-list rejection
- Mixed object localization, atomic localized/shared objects, inherited descendants, forbidden mixed list subtrees, disjoint shared/locale path ownership, and deterministic object-fragment merge
- Indirect `list(object({ items: list(...) }))` acceptance and generated-control behavior
- Aggregate schema size at, below, and above 1 MiB, including cumulative large defaults and no partial mutation/publication writes
- Layout missing/duplicate/foreign/nested fields, IDs, ordering, visibility, and size
- Contract output/hash unchanged under layout/help/role-only changes
- Full schema hash changed under a meaningful layout edit
- Exact classification fixtures for every M6 classification row
- Deterministic canonicalization, change IDs, and acknowledgement order
- OpenAPI conversion for every recursive/discriminated input and output

### Effect service tests

- Replaceable `FieldEngine`, `SchemaEngine`, repository, clock, and telemetry Layers
- Expected validation failures remain typed and distinct from defects/interruption
- Named operations and bounded safe annotations
- No content/configuration values enter logs, spans, or metrics
- `@effect/vitest` layered and property-test patterns

### PostgreSQL integration

- Existing rows/revisions remain valid roots/format 1 after the developer migration
- Root/object/list structural checks and sibling uniqueness
- Parent and reference tenant FKs reject cross-scope injection
- Self-parent and invalid role/column combinations reject
- Stable child identities survive label/key/config/order changes
- Recursive remove preserves historical snapshots and removes the complete active subtree
- Concurrent same-version nested/layout mutations produce one winner
- Root creation/removal updates layout atomically
- Layout no-op avoids version/audit noise
- Reference target resolution uses the intended index
- Publication snapshots field tree, format, layout, audit, and outbox atomically
- Failure injection after every new publication artifact rolls back all state
- Format-1 to format-2 upgrade is immutable and non-breaking
- Layout-only publication changes full hash/revision but not contract hash/output
- Existing command retry and incompatible command reuse remain correct
- Restrictive parent/revision/reference foreign-key behavior
- Representative `EXPLAIN` assertions for root fields, child fields, subtree load, revision tree, reference target, and current head
- Final fixture and invariant cleanup

### API/server

- Anonymous denial for all additions
- Role and all/selected/none locale-access matrix for draft/schema/form procedures
- Actual-role form projection cannot be widened by request input
- Foreign project/environment/collection/field/parent/reference/revision non-enumeration
- Archived and CMS-disabled behavior
- Recursive boundary payload limits before repository access
- Server-owned IDs, parents, actor, versions, hashes, layout authority, and role cannot be injected
- Standard envelope, request ID, status mapping, bounded details, and OpenAPI
- Published form response excludes fields hidden from the actual role

### UI and accessibility

- Exhaustive registry compile/runtime coverage for all 18 field kinds
- Developer/content-admin/editor/reviewer/client-editor/read-only visibility and editability
- Draft and published form previews share the same registry
- Every control has label, description, required state, error association, and focus behavior
- Error summary announces and focuses fields
- Object/list add/remove/reorder, min/max, nested errors, and depth behavior
- Rich-text keyboard toolbar, selection/focus return, paste allowlist, links, announcements, and axe checks
- External asset never causes `fetch`, image, video, audio, or iframe loading
- Date-time displays time-zone context and emits canonical UTC
- Exact decimal never loses precision through browser number coercion
- Money amount/currency controls enforce the pinned currency profile and never silently round
- Long labels/help/errors/enum options wrap without overflow
- Pending controls disable only after submission begins and show `…` status
- Dirty dialog and route navigation guards preserve edits on cancel
- Layout tab/group/sidebar keyboard ordering and missing-selection behavior
- No state conveyed only by color
- Automated axe checks for representative form containing every control
- SSR/hydration test and production chunk review prove the rich editor is lazy
- Query invalidation remains targeted and route loading avoids avoidable waterfalls

### Supply-chain and final gates

If approved dependencies are added:

- Add with pnpm in the consuming package; never hand-edit dependency versions
- Review package ownership, maintenance, release history, transitive graph, scripts, and lockfile diff
- Run the pnpm native audit and triage reachable findings
- Run `pnpm run ready`
- Run `git diff --check`
- Perform read-only PostgreSQL invariant/fixture checks
- Review production bundle chunks
- Perform developer manual review with developer and client accounts

## Skill review and developer installation

No previously installed skill specifically covered Portable Text. The best matching additional skill found through `npx skills find` was:

- `sanity-io/agent-toolkit@portable-text-serialization`
- Source: https://github.com/sanity-io/agent-toolkit
- Skill page: https://skills.sh/sanity-io/agent-toolkit/portable-text-serialization
- Evidence: maintained by the Portable Text/Sanity ecosystem, approximately 1.5K installs, 171 repository stars at review time, and passing Gen Agent Trust Hub, Socket, and Snyk audits
- Install command: `npx skills add https://github.com/sanity-io/agent-toolkit --skill portable-text-serialization`

It is recommended for renderer/profile review, not as authority over this product contract. The conversion companion is not recommended because M6 explicitly excludes arbitrary HTML/Markdown import and its Snyk result was weaker.

A TanStack Form candidate was also reviewed, but the current repository already has established TanStack Form patterns and the installed shadcn/accessibility/React guidance covers the immediate design. It is not recommended as a required blocker.

After exact decimal and money entered scope, `npx skills find` was also run for exact decimal, ISO 4217, and money modeling. The returned skills focused on brokerage precision, foreign exchange, or currency conversion rather than deterministic CMS field contracts. None improved on the official SIX registry source plus the existing schema, security, PostgreSQL, and property-testing guidance, so no additional money skill is recommended.

The developer approved and manually installed the Portable Text serialization skill. The agent read its complete `SKILL.md` and React rule before implementation; the skill remains subordinate to the approved strict profile and does not authorize raw HTML storage or rendering.

## Schema-authoring UX addendum

The developer subsequently requested a non-dialog schema-building workflow and approved both JSON experiences: direct schema-definition editing and sample-content inference. This addendum extends M6 without changing persistence tables, publication semantics, field identity rules, or the canonical field/value contracts.

- The collection route provides a visual field tree and a persistent selected-field inspector rather than requiring a dialog for every field edit.
- Visual and schema-JSON views share one bounded local authoring draft with explicit save/discard behavior and unsaved-navigation protection.
- The schema JSON uses a versioned authoring document, not the relational persistence shape. It omits derived parent IDs, node roles, positions, hashes, collection metadata, and layout. Existing field IDs are retained; new fields use `null` and receive server-generated stable IDs.
- A separate sample-JSON import parses bounded untrusted content locally, reports inference warnings, previews the inferred tree, and replaces only the unsaved local field draft after explicit confirmation. It never stores sample values or sends them to the server.
- One authorized, optimistic-versioned repository operation atomically replaces the complete active field tree in the existing transaction and reconciles root layout placements. It preserves active IDs, rejects unknown or duplicate supplied IDs, rejects reparenting or node-role changes for existing IDs, generates IDs for new nodes, validates the complete prospective draft, and writes one audit event. Existing granular field operations remain valid API compatibility surfaces.
- Every kind-specific configuration is editable. Exact decimal and money values stay textual; arbitrary JSON plus object/list defaults use bounded root-shape-aware JSON controls; rich-text defaults use the same lazy official Portable Text editor as entry values; reference targets come from authorized environment collections; enum and currency option lists remain bounded and duplicate-free.
- Default-entry controls match their contracts: long text is multiline, dates and date-times use native temporal inputs with canonical instant conversion, exact decimals advertise decimal input mode, booleans/enums use selects, money/assets use structured controls, references intentionally have no default, and rich-text toolbar options follow the configured allowlists. Known structured defaults decoded into Effect Schema classes are converted to inert JSON data before strict value validation; arbitrary input does not receive this normalization.
- Client validation is advisory and browser-safe. Effect Schema, field-tree, authorization, aggregate-size, currency, reference-target, and publication validation remain authoritative on the server.
- Server validation details are rendered as an accessible summary and mapped to the relevant selected field/control where possible. Sibling API-key collisions are also detected before submission, while duplicate display labels remain allowed.

The atomic replacement endpoint is required because sequential client mutations could leave a partially applied schema after a mid-sequence failure. Keeping editor layout outside the field authoring JSON avoids exposing derived placement identities and allows existing layout editing to remain an independent contract-hash-neutral concern.

## Decision-standard review

### Product-goal alignment

The complete portable field contract creates the generated editing experience required before entries while keeping content independent from React, a specific renderer, managed assets, or future visual sites.

### Correctness

Discriminated definitions, stable nested IDs, relational structure, exact value validation, canonical dates/URLs/slugs, immutable snapshots, independent layout, dual hashes, and deterministic classification prevent ambiguous content contracts and accidental API drift.

### Security

Default-deny authorization, tenant FKs, RE2 patterns, iterative resource bounds, strict rich-text allowlists, safe URL profiles, no remote asset fetch, server-derived roles, and content-free observability address injection, XSS, SSRF, ReDoS, privilege escalation, and denial of service.

### Reliability

Short bounded transactions, immutable parent identity, existing lock order, optimistic versions, no network work under lock, idempotent publication, rollback injection, and format-version compatibility avoid partial or unreproducible schema state.

### Performance

Schemas remain capped at 100 nodes; field/layout loads are bounded; relational query paths are indexed; JSONB is not over-indexed; patterns are linear time; heavy rich-text UI is lazy; and server validation does no remote I/O.

### UX

Type-specific controls, localized slug support, clear defaults/help, independent layout, role-aware projection, keyboard ordering, accessible errors, safe rich text, and explicit time-zone/asset behavior produce a client-appropriate form system rather than a raw JSON schema editor.

### DX

Stable IDs, discriminated Effect contracts, contract hashes, deterministic classifiers, revision-addressable forms, OpenAPI, and an exhaustive component registry make future code generation and renderer adapters predictable.

### Observability

Named Effect operations, bounded outcome metrics, stable-ID/count annotations, immutable audits, and existing request correlation diagnose schema/form failures without recording schemas, patterns, URLs, or content.

### Maintainability and future compatibility

The pure kernel, focused services, normalized field tree, aggregate layout, editor adapter boundary, stable profile version, and explicit M7–M12 seams allow entries, delivery, preview, generated tooling, and visual bindings to extend the system without replacing field identities or migrating content.

## Database gate

Proposed migration name:

```text
add_field_system_and_editor_layout
```

After design approval and Drizzle-schema implementation, the agent must stop and provide the exact generation/application commands. The developer alone generates and applies the migration. The agent then inspects the generated SQL and live schema read-only before tests continue.
