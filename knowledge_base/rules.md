# Mandatory Project and Agent Rules

These rules apply to every agent session and every implementation milestone. They are not optional guidance.

## 1. Required reading order

Before changing code, read completely:

1. `knowledge_base/product.md`
2. `knowledge_base/prd/cms.md`
3. `knowledge_base/rules.md`
4. `knowledge_base/context.md`
5. `knowledge_base/progress.md`
6. The active milestone in `knowledge_base/milestone.md`
7. `knowledge_base/learnings.md`
8. Relevant source files and installed skill files

Do not implement from a stale chat summary when these files are available.

## 2. Source-of-truth hierarchy

When documents conflict:

1. Explicit current user instruction
2. `product.md` for product vision
3. `prd/cms.md` for CMS behavior and contracts
4. `rules.md` for execution constraints
5. `milestone.md` for implementation order and acceptance tests
6. `progress.md` and `context.md` for current state
7. Existing code

Stop and ask the developer when a conflict cannot be resolved safely.

## 3. Decision standard

Every architecture, product, and implementation decision must be evaluated against:

- Product-goal alignment
- Correctness
- Security
- Reliability
- Performance
- UX
- DX
- Observability
- Maintainability and future compatibility

Do not choose convenience alone. Record consequential decisions and their trade-offs in `context.md` or a dedicated decision record. Ask the developer before decisions that materially change product behavior, public contracts, core dependencies, or architecture.

## 4. Milestone discipline

- Work on only the active milestone unless the developer explicitly changes scope.
- Do not one-shot the CMS.
- Add tests with the implementation, not afterward.
- Meet all applicable milestone success criteria.
- Update `progress.md`, `context.md`, and `learnings.md` before requesting review.
- Run `pnpm run ready` successfully before every milestone review handoff.
- Immediately before the manual-review instructions, provide one concise Conventional Commits message appropriate to the completed milestone.
- Stop for developer manual review at the end of every milestone.
- Do not begin the next milestone until the developer explicitly approves.
- Never run `git commit`; the developer reviews and commits manually.

## 5. Absolute database migration prohibition

Agents must never run any command that generates, applies, pushes, or executes a database migration.

Forbidden examples include:

- `pnpm db:generate`
- `pnpm db:migrate`
- `pnpm db:push`
- `drizzle-kit generate`
- `drizzle-kit migrate`
- `drizzle-kit push`
- Migration SQL through `psql`
- Application startup paths that automatically apply migrations

When a schema change is required:

1. Explain the change and obtain approval when needed.
2. Edit the Drizzle schema.
3. Provide a descriptive migration name.
4. Provide exact generation/application commands to the developer.
5. Stop and wait.
6. After the developer applies it, inspect the generated migration and continue only after confirmation.

Never modify an already-applied migration without explicit developer instruction.

Read-only database inspection and starting/stopping the local database are allowed when necessary and safe. Never expose database credentials.

## 6. Effect rules

- Use stable Effect v3 until an explicit approved decision changes the version.
- Business workflows return `Effect<A, E, R>`.
- Prefer named `Effect.fn` for meaningful reusable operations and observability.
- Use typed expected errors; prefer schema-backed tagged errors for serialized/domain contracts.
- Preserve the distinction between expected failures, defects, and interruption.
- Wrap Promise APIs with `Effect.tryPromise` and throwing synchronous APIs with `Effect.try`.
- Translate foreign errors at adapter boundaries; never leak raw third-party errors into domain or API contracts.
- Model dependencies with Effect services and Layers.
- Compose Layers once near the application boundary.
- Use a shared ManagedRuntime for Express/oRPC/framework integration.
- Restrict `Effect.run*` to runtime boundaries.
- Prefer scoped resource management for resources requiring cleanup.
- Never use `any`, unsafe assertions, or `orDie` merely to silence type errors.
- Use `@effect/vitest` patterns for Effect tests.
- Before Effect work, inspect `.pi/skills/effect-ts/` and relevant stable-v3 source under `.repos/effect/`.

Third-party protocols may remain Promise-native at their boundary when required for compatibility, but internal application adapters must expose typed Effects.

## 7. API response and error rules

All application-owned APIs use this discriminated contract:

```ts
interface ApiSuccess<T> {
  ok: true;
  data: T;
  error: null;
  message: string;
}

interface ApiFailure {
  ok: false;
  data: null;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ReadonlyArray<{
      path?: string;
      code: string;
      message: string;
    }>;
    retryable: boolean;
    requestId: string;
  };
  message: string;
}

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
```

- `ok` is the required discriminant.
- Success has populated, non-null `data` and null `error`.
- Failure has null `data` and populated `error`.
- No-payload successes return an explicit result object rather than null.
- Top-level `message` is safe UI feedback.
- `error.message` is safe developer context; application logic branches on `error.code`, never message text.
- Error codes come from one schema-backed string-literal registry; do not use ad hoc strings or TypeScript `enum`.
- HTTP status codes retain standard meaning; do not return HTTP 200 for failures.
- Validation details are bounded, structured, and path-aware.
- Error responses include request correlation and retryability.
- Never expose stack traces, SQL, internal paths, secrets, tokens, cookies, or raw causes.
- Better Auth and other protocol-owned endpoints keep their required native format.

Centralized boundary handlers must safely map typed errors and unexpected defects. Do not create one-off response/error shapes in feature handlers.

## 8. Observability rules

Every meaningful operation must be diagnosable without exposing sensitive data.

- Assign/propagate request IDs.
- Propagate valid trace context.
- Use named spans at business and infrastructure boundaries.
- Use structured logs, not concatenated debug strings.
- Add metrics at meaningful boundaries with bounded-cardinality labels.
- Record duration, result, and safe stable resource context where useful.
- Keep audit events separate from diagnostic logs.
- Redact authorization headers, cookies, passwords, tokens, secrets, database URLs, webhook secrets, and sensitive content.
- Do not log complete request/response bodies or content entries by default.
- Telemetry failures must not crash the product or create unbounded buffering.

## 9. Security and isolation rules

- Authenticate and authorize every protected operation server-side.
- Default deny when policy information is absent or unknown.
- Include project and environment scope in every relevant query.
- Test cross-workspace, cross-project, cross-environment, cross-collection, cross-entry, cross-field, and cross-locale denial.
- Never rely on UI hiding for authorization.
- Validate unknown input at every external boundary.
- Treat all remote URLs and webhook destinations as untrusted.
- Keep drafts inaccessible to public delivery.
- Use safe secret storage, masking, rotation, and revocation.
- Do not read or reveal `.env`, auth secrets, session history, or credential material in responses or logs.

## 10. Localization and publication invariants

- English (`en`) is required.
- Every content API operation requires explicit locale context.
- Delivery never silently falls back to another locale.
- Each locale publishes and unpublishes independently.
- Shared fields are captured into each locale publication snapshot.
- Editing shared values never mutates existing publications.
- Draft changes never affect public delivery.
- Publication records and snapshots are immutable.
- Publication state and outbox event creation are atomic.

Any implementation violating these invariants must be rejected even if it appears simpler.

## 11. Performance rules

- Optimize delivery for reads and compile snapshots at publication.
- Use cursor pagination for scalable lists.
- Bound page size, filters, sorting, expansion depth, nested values, and response size.
- Prevent N+1 query patterns.
- Select only required data.
- Add and verify indexes based on real query paths.
- Use connection pooling and observe pool behavior.
- Avoid unbounded concurrency, retries, queues, logs, metrics labels, or in-memory caches.
- Measure before introducing clever optimizations.

## 12. Testing rules

Every behavior needs success, failure, authorization, boundary, and regression coverage as applicable.

Use a balanced test pyramid:

- Pure unit tests for domain rules
- Effect tests with test Layers
- Property/fuzz tests for schemas, invariants, and parsers
- Database integration tests for constraints and transactions
- API contract tests for envelopes and status mapping
- Authorization matrix and tenant-isolation tests
- Browser tests for critical UX and accessibility
- Load/concurrency tests for delivery and publication paths
- Failure-injection tests for atomic workflows and workers

Tests must be deterministic. Do not hide failures with retries unless the behavior being tested is explicitly retry-related.

## 13. Package and monorepo rules

- Use pnpm for dependencies; never manually add dependency versions to `package.json`.
- Keep dependencies in the package that uses them.
- Root scripts delegate orchestration through `turbo run` when appropriate.
- Declare workspace dependencies explicitly.
- Do not import across package internals; use package exports.
- Prefer package tasks over root implementation scripts.
- Run relevant check, type-check, test, and build tasks after meaningful changes.

## 14. Documentation and lessons

- Keep `prd/cms.md` behavioral, not a dumping ground for temporary implementation notes.
- Keep `milestone.md` ordered and acceptance-focused.
- Keep `progress.md` current and factual.
- Keep `context.md` concise enough for session handoff.
- Record only consequential product or architecture mistakes, discarded decisions, constraint violations, and their prevention rules in `learnings.md`.
- Do not record ordinary command failures, missing tools, typos, or harmless execution mistakes in `learnings.md`.
- Never erase a relevant lesson merely because the bug was fixed.
