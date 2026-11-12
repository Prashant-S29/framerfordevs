---
paths:
  - "apps/**/*.{ts,tsx}"
  - "packages/**/*.{ts,tsx}"
  - "tools/**/*.{ts,tsx}"
---

# Effect 4.1

- Business workflows return `Effect<A, E, R>`. Use named `Effect.fn` for reusable operations.
- Use typed expected errors. Use schema-backed tagged errors for serialized or domain contracts. Keep failures, defects, and interruption distinct.
- Wrap Promise APIs with `Effect.tryPromise` and throwing code with `Effect.try`. Translate third-party errors at the adapter boundary.
- Model dependencies as services (`Context.Service`) and Layers. Compose Layers once near the application boundary. Use the shared `ManagedRuntime`, and call `Effect.run*` only at runtime boundaries.
- Use scoped resources for anything that needs cleanup. Use `@effect/vitest` for Effect tests.

## Schema rules

- Decode untrusted input strictly: pass `{ onExcessProperty: "error" }` to `Schema.decode*`, and `{ parseOptions: { onExcessProperty: "error" } }` to `Schema.toStandardSchemaV1`.
- Use `Uuid` from `packages/api/src/contracts/uuid` for UUID strings, and brand it for typed IDs.
- Public JSON Schema comes from `packages/api/src/contracts/response/json-schema`, which wraps `Schema.toJsonSchemaDocument` with closed objects. Regenerate artifacts with `pnpm --filter @framerfordevs/public-contracts contracts:generate` after a contract change.
- Type schema parameters as `Schema.Codec<A, I>`. A bare `Schema.Schema<A>` has unknown decoding services.
- Format decode failures with `SchemaError.message`, bounded to 512 characters for user feedback.
