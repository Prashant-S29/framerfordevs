---
paths:
  - "packages/sdk/**"
  - "packages/cli/**"
  - "packages/schema/**"
  - ".changeset/**"
---

# Published packages

`@framerfordevs/sdk`, `@framerfordevs/cli`, and `@framerfordevs/schema` are public npm packages. Their exports, types, CLI commands, flags, and output formats are public contracts. Ask the developer before you add, remove, or change any of them.

- Each package is ESM only, targets Node 22 or later, and builds with tsdown into `dist/`. Each `exports` entry has `types` and `import`. Add a new entry to `tsdown.config.ts` and to `exports` in the same change.
- The SDK exposes only approved content and runtime integration. It never exposes control-plane or secret administration.
- `dependencies` holds only what consumers install. Private workspace packages are dev dependencies that tsdown bundles. `effect` is a peer dependency of the SDK and is never bundled.
- These packages carry the `published` turbo tag and cannot depend on a `server` package. The SDK root entry and `./client` stay free of Node built-ins. Node-only code, such as webhook signature checks, stays in its own subpath.
- Exported public API keeps its TSDoc comments, because consumers read them in their editor. Internal code follows the comments rule.
- Record a user-visible change as a changeset in `.changeset/`. Never run `changeset version` or `changeset publish`, and never publish. The developer releases.
- Before handoff, run `pnpm --filter <package> run prepack`. It builds, type checks, and tests the package. For the CLI, it also runs the packaged contract tests.
