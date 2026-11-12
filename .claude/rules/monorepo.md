---
paths:
  - "**/package.json"
  - "pnpm-workspace.yaml"
  - "**/turbo.json"
  - "**/tsconfig*.json"
  - "**/tsdown.config.ts"
---

# Packages and dependencies

- Add dependencies with pnpm in the package that uses them. Declare workspace dependencies explicitly.
- Security pins for transitive packages go in `overrides` in `pnpm-workspace.yaml`. The root `package.json` has no override block.
- Published package rules are in `published-packages.md`.
- Root scripts delegate to `turbo run`. Prefer package tasks over root scripts.
- Every `exports` key is an explicit named subpath without an `/index` suffix. Wildcard exports are allowed only for the hashed Studio artifact and the shadcn layout in `packages/ui`. `pnpm run check:structure` enforces this.
- Turbo tags in each package `turbo.json` mark `server`, `client-safe`, and `published` packages. A `client-safe` or `published` package never depends on a `server` package. `pnpm run check:boundaries` enforces this.
- Run the relevant check, type, test, and build tasks after a manifest change, and `pnpm audit` after a dependency upgrade.

## When to create a package

- Create a workspace package only for a different dependency set, runtime target (browser or Node), build or publish strategy, or owner.
- Otherwise add a module to the owning package and expose it as an explicit `exports` subpath. Do not create a package for one shared function.
- Shared code that the published SDK or CLI needs must stay dependency-light and browser-safe, and they bundle it as a dev dependency.
- Name packages by purpose. Avoid generic names such as `shared`, `utils`, or `common`.
