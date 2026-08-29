# `@framerfordevs/cli`

Official OAuth device CLI and deterministic public-schema generator for Framer for Developers.

> Release status: M13 release staging. No npm publication is performed automatically from this repository.

## Install

```sh
pnpm add --global @framerfordevs/cli
ffd help
```

Node.js 22 or newer is required.

## Interactive workflow

```sh
ffd login --api https://api.example.com --open
ffd link \
  --api https://api.example.com \
  --project PROJECT_ID \
  --environment main \
  --output src/framerfordevs \
  --schema framerfordevs.schema.ts
ffd schema pull
ffd schema check
ffd generate
```

`--open` is explicit browser-launch consent. Without it, the CLI prints the verification URI and user code.

OAuth access and rotating refresh authority are stored only in the native operating-system credential store. The CLI fails closed if secure native storage is unavailable; it has no plaintext credential-file fallback.

## Headless CI

Use an existing environment-bound management credential with the exact `schema.read` permission:

```sh
FFD_MANAGEMENT_TOKEN="$CI_SECRET" ffd schema check --json
```

Do not run interactive login in CI. The token is read only from the process environment and is never written to project configuration or schema locks.

## Configuration

`ffd link` writes exact, non-executable JSON to `framerfordevs.config.json`:

```json
{
  "apiBaseUrl": "https://api.example.com",
  "environment": "main",
  "output": "src/framerfordevs",
  "projectId": "PROJECT_ID",
  "schema": "framerfordevs.schema.ts",
  "schemaVersion": 2
}
```

The CLI searches ancestors, rejects ambiguous configurations, bounds all input, and rejects output/schema paths that escape the linked project. Existing schema-version 1 files remain valid for M12 pull/check/generate commands; M13 schema authoring commands require version 2 and return a stable configuration error otherwise.

## Pull, check, and generation

- `ffd schema pull` reconciles all manifest pages and immutable revisions, retries one concurrent authority change, and writes only a non-secret immutable cache.
- `ffd schema check` compares stable collection/field IDs, locale authority, lock state, and generated-file digests. Exact up-to-date output is required by default.
- `ffd generate` performs an online reconciled pull by default. `--offline` explicitly uses the prior immutable cache.
- `--allow-metadata-only` permits only metadata-only drift for check; it never hides type or breaking drift.
- `--force` is required before replacing an output directory not already owned by the generator.

Generation transactionally writes TypeScript models, strict Delivery schemas, permissive Preview schemas, JSON Schema, typed clients, and stable-revision helpers. Config v1 records generated-file ownership in `.framerfordevs/schema.lock.json`; config v2 uses `.framerfordevs/generated.lock.json` so generation cannot replace the separate code-authoring authority in `.framerfordevs/schema.lock.json` v2. Paths, files, fields, locales, and response sizes are bounded.

## Static Tier 1 schema extraction

The programmatic `@framerfordevs/cli/schema-extractor` export parses declarative `.schema.ts` files without importing, transpiling, or executing project code. It accepts only type imports from `@framerfordevs/schema`, bounded named imports from local `.schema.ts` files, immutable declarations, JSON literals, identifiers, `as const`, and `satisfies` wrappers.

Extraction runs in a short-lived worker with an empty environment, fixed V8 heap/stack limits, and a kill timeout. It rejects symlinks, path escape, graph cycles, runtime imports, calls, functions, loops, spread, computed properties, property access, dynamic imports, globals, loaders, tsconfig behavior, and excess schema properties. It has no execution bypass.

## Schema export, plan, and push

All schema-authoring commands require config v2:

```sh
ffd schema export [--json]
ffd schema plan [--json]
ffd schema push --acknowledge <change-id>... [--json]
```

`schema export` retrieves current server-owned source identities, atomically bootstraps deterministic Tier 1 source and `.framerfordevs/schema.lock.json` v2, and refuses an unowned, locally modified, cross-project, or Tier 2-generated target.

Plan and push verify any experimental build manifest without executing Tier 2, then statically extract and strictly validate the Tier 1 graph before dynamically loading credentials or HTTP clients. They resolve the configured environment UUID through the exact first Tooling manifest page, which supports both OAuth and environment-scoped management credentials without environment enumeration. Invalid or stale local input performs no authenticated or network work.

Plan returns exact server change IDs/classifications and exits `2` for validation issues. Push performs a fresh plan and requires the supplied acknowledgement set to equal every potentially-breaking/breaking change ID—duplicates, missing IDs, extra IDs, and broad confirmation are rejected without applying. It then journals only a command UUID and canonical fingerprint before the mutation request, applies exact current/plan authority, clears the journal after a confirmed response, and writes lock v2 from server-returned stable mappings. Transport uncertainty retains the content-free journal: an unchanged plan reuses the command UUID, while changed authority fails closed with a journal conflict pending reconciliation.

## Content commands

```sh
ffd entry list --collection <key> --locale <tag>
ffd entry get --collection <key> --entry <id> --locale <tag>
ffd entry create --collection <key> --locale <tag> --name <name> [--mutations <file>]
ffd entry update --collection <key> --entry <id> --locale <tag> --mutations <file>
ffd entry publish --collection <key> --entry <id> --locale <tag>
ffd entry unpublish --collection <key> --entry <id> --locale <tag>
```

List is repeated-cursor-safe and capped at 1,000 summaries. Get returns one exact-locale role-projected draft. Content commands use the environment UUID from same-project lock v2 when available, so content-only management credentials do not need schema-read scope; OAuth can fall back to the Tooling manifest for read/update/publish commands. Create additionally requires current revision/contract authority from lock v2, so run schema export or push first. Update reads current optimistic draft versions before saving. Publish validates and then uses the exact returned publication authority; unpublish first reads exact current state.

Mutation files are relative to the linked project, regular non-symlinked UTF-8 JSON files no larger than 1 MiB, and strictly decode at most 500 API-key-path mutations. Update requires at least one mutation. Files and values are never copied to output, errors, locks, or retry journals.

Each content mutation atomically acquires a content-free command UUID/fingerprint journal before its mutation request. Confirmed responses clear it; uncertain transport retains it and blocks unrelated mutation authority.

## Local editor

```sh
ffd editor

# Management-token launch without placing the token in the editor's initial OS environment:
read -rsp "Editor token: " FFD_EDITOR_TOKEN && echo
printf '%s\n' "$FFD_EDITOR_TOKEN" | ffd editor --token-stdin
unset FFD_EDITOR_TOKEN
```

Prefer OAuth native credential storage when rollout is enabled or `--token-stdin` for a management credential. The stdin mode rejects an exported `FFD_MANAGEMENT_TOKEN` as ambiguous, reads one bounded whitespace-free token only after credential-blind schema preparation, and keeps the long-lived editor's initial OS environment credential-free.

The editor loads exact config v2, verifies any experimental-output manifest without executing Tier 2, and statically extracts the closed Tier 1 graph before constructing credential or network authority. It compares hosted code-owned structure, binds a random IPv4 loopback port, opens a fragment-challenged browser session, and serves bundled CSP-locked no-store React assets. The loopback boundary rejects non-loopback peers, Host confusion, invalid mutation Origin/session/content type/body bounds, queries, traversal, unknown routes, and redirects. Hosted bearer authority remains only in mutable Node memory, never enters browser assets/URLs/storage, and is cleared before shutdown completes.

The TanStack Query application supports collection/entry/locale navigation, defaults to the first hosted project locale while offering the bounded hosted locale list, create and optimistic rename, role-projected shared/localized forms, exact optimistic save, server validation summaries, exact-locale publish/unpublish, persisted credential-free Preview URL templates, conflict-preserving explicit reload, unsaved navigation warnings, responsive keyboard operation, and automated axe coverage. Node exposes only a strictly decoded operation allowlist and retains content-free command journals on uncertain transport. The verified Tier 1 graph is watched through the restricted extractor; invalid or structurally drifted code preserves the last valid view read-only, while hosted structure authority and presentation are refreshed. Portable Text remains a separate lazy browser chunk.

Automated exact-locale publication interactions, conflict handling, packaging, token isolation, and accessibility checks pass. Final controlled real-browser and manual acceptance remain release gates; this command is not itself acceptance authority.

## Experimental Tier 2 schema build

The explicit credential-blind command is:

```sh
ffd schema build
ffd schema build --check --json
```

It is available only when version 2 configuration opts in with a local composition entry:

```json
{
  "schema": "framerfordevs.schema.ts",
  "schemaBuild": { "entry": "schema/compose.schema.ts" }
}
```

Write mode atomically owns the generated Tier 1 file and `.framerfordevs/schema-build.lock.json`; it refuses unowned or locally modified output. Check mode executes the same isolated build, writes nothing, and exits `2` when output or its content-safe input-digest manifest is stale.

The programmatic `@framerfordevs/cli/experimental-schema-build` export restores local factories, functions, loops, mapping, and spread through fixed TypeScript transpilation and QuickJS 0.32.0. It requires `experimental: true`, runs in a separate empty-environment worker, and allows only `@framerfordevs/schema/compose` plus bounded local TypeScript modules. Node/npm/native/dynamic imports and host filesystem, process, clock, randomness, WebAssembly, and network capabilities are unavailable.

This export is default-off and **experimental**. Upstream issue `justjake/quickjs-emscripten#255` proves the prebuilt growing-memory WASM can exceed its configured memory limit through some guest allocations, so Tier 2 cannot be described as production-ready or enabled by default. The result therefore reports `memoryLimitHard: false`; timeout and nominal memory controls do not claim a hard host-OOM boundary. This limitation does not block other M13 functionality.

No authenticated command, schema plan/push path, or editor path invokes this experimental runner. `schema build` constructs no credential store, OAuth, management-token, Tooling, or Authoring service.

## Exit behavior

- `0`: command succeeded; check is exactly up to date or explicitly accepted metadata-only drift.
- `1`: invalid command/configuration, authentication, transport, keychain, or filesystem failure.
- `2`: schema check found unaccepted drift, schema plan returned validation issues, schema push requires a different exact acknowledgement set, or experimental `schema build --check` found stale output.

Use `--json` for stable machine-readable output. Errors contain stable codes and never include tokens, refresh authority, schema bodies, or raw cursors.

## Programmatic exports

- `@framerfordevs/cli`
- `@framerfordevs/cli/generator`
- `@framerfordevs/cli/schema-extractor`
- `@framerfordevs/cli/experimental-schema-build`

## License

MIT
