# `@framerfordevs/cli`

Official OAuth device CLI and deterministic public-schema generator for Framer for Developers.

> Release status: M12 release candidate. No npm publication is performed automatically from this repository.

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
  --output src/framerfordevs
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
  "schemaVersion": 1
}
```

The CLI searches ancestors, rejects ambiguous configurations, bounds all input, and rejects output paths that escape the linked project.

## Pull, check, and generation

- `ffd schema pull` reconciles all manifest pages and immutable revisions, retries one concurrent authority change, and writes only a non-secret immutable cache.
- `ffd schema check` compares stable collection/field IDs, locale authority, lock state, and generated-file digests. Exact up-to-date output is required by default.
- `ffd generate` performs an online reconciled pull by default. `--offline` explicitly uses the prior immutable cache.
- `--allow-metadata-only` permits only metadata-only drift for check; it never hides type or breaking drift.
- `--force` is required before replacing an output directory not already owned by the generator.

Generation transactionally writes TypeScript models, strict Delivery schemas, permissive Preview schemas, JSON Schema, typed clients, stable-revision helpers, and `.framerfordevs/schema.lock.json`. Paths, files, fields, locales, and response sizes are bounded.

## Exit behavior

- `0`: command succeeded; check is exactly up to date or explicitly accepted metadata-only drift.
- `1`: invalid command/configuration, authentication, transport, keychain, or filesystem failure.
- `2`: schema check completed and found unaccepted drift.

Use `--json` for stable machine-readable output. Errors contain stable codes and never include tokens, refresh authority, schema bodies, or raw cursors.

## Programmatic exports

- `@framerfordevs/cli`
- `@framerfordevs/cli/generator`

## License

MIT
