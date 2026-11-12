---
paths:
  - "packages/api/src/**"
  - "apps/server/src/**"
  - "packages/studio-server/src/**"
---

# API contracts

Application-owned APIs return `ApiSuccess<T> | ApiFailure`, discriminated by `ok`.

- Success: non-null `data`, `error: null`, and a safe UI `message`. A no-payload success returns an explicit result object, not `null`.
- Failure: `data: null` and `error: { code, message, details?, retryable, requestId }`. `details` entries are bounded and path-aware.
- Branch on `error.code`, never on message text. Codes come from the one schema-backed literal registry. Do not use ad hoc strings or TypeScript `enum`.
- Keep standard HTTP status meanings. Never return 200 for a failure.
- Never expose stack traces, SQL, internal paths, secrets, tokens, cookies, or raw causes.
- Map typed errors and defects in the centralized boundary handlers. Do not create one-off response shapes in feature handlers.
- Protocol-owned endpoints, such as Better Auth and OAuth, keep their native format.
