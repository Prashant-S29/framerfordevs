# Effect Rules

- Use stable Effect v3 until an explicit approved decision changes the version.
- Business workflows return `Effect<A, E, R>`.
- Prefer named `Effect.fn` for meaningful reusable operations and observability.
- Use typed expected errors; prefer schema-backed tagged errors for serialized/domain contracts.
- Preserve the distinction between expected failures, defects, and interruption.
- Wrap Promise APIs with `Effect.tryPromise` and throwing synchronous APIs with `Effect.try`.
- Translate foreign errors at adapter boundaries; never leak raw third-party errors into domain or API contracts.
- Model dependencies with Effect services and Layers.
- Compose Layers once near the application boundary.
- Use a shared ManagedRuntime for Express, oRPC, and framework integration.
- Restrict `Effect.run*` to runtime boundaries.
- Prefer scoped resource management for resources requiring cleanup.
- Never use `any`, unsafe assertions, or `orDie` merely to silence type errors.
- Use `@effect/vitest` patterns for Effect tests.
- Before Effect work, inspect `.pi/skills/effect-ts/` and relevant stable-v3 source under `.repos/effect/`.

Third-party protocols may remain Promise-native at their boundary when required for compatibility, but internal application adapters must expose typed Effects.
