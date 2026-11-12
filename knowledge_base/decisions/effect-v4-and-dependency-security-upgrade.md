# Effect v4 and dependency security upgrade

**Status:** Approved by the developer on 2026-11-12

**Date:** 2026-11-12

## Decision summary

The repository moves from Effect 3.22 to Effect 4.1.4. All Effect packages share that version: `effect`, `@effect/vitest`, and `@effect/opentelemetry`. The separate `@effect/platform` package is removed because v4 includes it in `effect`.

The same change upgrades dependencies for security patches. The developer asked for both changes together, with the M19B work set aside and then migrated on top.

Effect v4 has no Drizzle adapter. Drizzle stays the direct database layer.

## Compatibility rules

These rules keep v3 behavior where v4 changed it silently. Each rule has an owning module.

1. Closed objects. v4 ignores the v3 `parseOptions` annotation. A schema marks a closed object with `closedObject: true`. Decoders in `packages/api/src/lib/schema-strict` reject unknown keys inside a closed subtree and its children. Lenient parents still strip unknown keys, as in v3. The SDK and CLI keep internal copies of this module, because the public SDK cannot depend on the api package. The copies must stay identical.
2. Public JSON Schema. `packages/api/src/contracts/response/json-schema` ports v3 `JSONSchema.make` to the v4 AST. All released public artifacts stay byte-identical, including Studio Content v1 and v2.
3. UUID. v4 `isUUID` is stricter than v3 `Schema.UUID`. `packages/api/src/contracts/uuid` keeps the v3 pattern. `Uuid` publishes the shared `UUID` definition. Branded identifiers use `UuidValue`, because v3 dropped an inherited identifier when a schema was branded.
4. Type parameters. A v3 `Schema.Schema<A, I, R>` becomes `Schema.Codec<A, I, R>`. A one-argument v3 `Schema.Schema<A>` becomes `Schema.Codec<A>`, because the v4 `Schema<A>` has unknown decoding services.
5. Error formatting. `ParseResult.TreeFormatter` output is replaced by `SchemaError.message`. Bounded feedback messages keep their 512-character limit.
6. Generated code. The CLI generator emits v4 Schema source. Its test type-checks the generated files against Effect v4.

## Dependency policy

- Upgrade every dependency to its newest release within the current major.
- Pin vulnerable transitive packages through `overrides` in `pnpm-workspace.yaml`. The root `package.json` has no override block.
- Pin `@opentelemetry/api` to 1.9.1 and `@types/node` to 22.20.5 workspace-wide. Each pin keeps one copy of a package that would otherwise split by peer resolution.
- Take a new major version only when it fixes an advisory or a required peer needs it. This applied to Vitest 5 and jsdom 31.
- Hold these majors: TypeScript 7, `@types/node` 26, dotenv 18, Changesets 3, fumadocs-openapi 12, `@napi-rs/keyring` 2, `@portabletext/editor` 8, and web-vitals 6. `@effect/opentelemetry` 4.1 requires OpenTelemetry SDK 2.x.
- Hold oxlint at 1.76.0. Version 1.93 adds React Compiler rules that flag existing components, and that work is separate.
- The remaining advisory is a low `deepmerge` path through the shadcn CLI. It has no patched release.

## Better Auth schema change

Better Auth 1.7.3 and later no longer write `account.issuer`. Migration `0012` made that column required. The developer chose this schema change: drop `account.issuer` and `account_issuer_accountId_uidx`, and add the unique index `account_providerId_accountId_uidx` on `(provider_id, account_id)`.

The developer generates and applies migration `0022_remove_account_issuer`. Until then, sign-up fails, and the server Better Auth tests fail.

## OAuth provider behavior after the upgrade

- `@better-auth/oauth-provider` 1.7.21 rejects HTTP loopback redirect URIs for `web` clients. Studio registers every client as `web`, and the accepted M18 design allows exact loopback HTTP for local development. `packages/auth` sets `allowInsecureRedirectUri` to accept HTTP only for the hosts `localhost`, `127.0.0.1`, and `[::1]`. Redirect matching for web clients stays exact, including the port. Every other HTTP redirect stays rejected.
- A failed PKCE verifier now returns `400 invalid_grant`, as RFC 6749 section 5.2 requires. The Studio BFF treats every non-200 token response as a failure, so product behavior does not change. The compatibility test expects the new response.

## Studio artifact budget

Vite 8.3 uses rolldown 1.3, which always emits its runtime helpers as a separate chunk. The developer approved raising the Studio finite-asset ceiling from 12 to 13. The Studio Vite configuration groups React, React DOM, the scheduler, and `use-sync-external-store` into one `react-dom` vendor chunk. All gzip budgets are unchanged.

## Public surface effects

- The SDK peer dependency on `effect` changes from `^3.22.0` to `^4.1.4`. That is a breaking change for SDK consumers.
- Generated CLI bindings use v4 Schema syntax.
- Released HTTP contracts and artifacts do not change.
