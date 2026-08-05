# API Response and Error Rules

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

Centralized boundary handlers must safely map typed errors and unexpected defects. Do not create one-off response or error shapes in feature handlers.
