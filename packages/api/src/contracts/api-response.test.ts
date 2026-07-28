import { assert, describe, expect, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  ApiErrorCodeSchema,
  ApiErrorDetail,
  ApiFailure,
  ApiResponseSchema,
  type ApiResponse,
  apiFailure,
  apiSuccess,
} from "./api-response";
import {
  AuthSessionFailure,
  ConflictFailure,
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
  RateLimitedFailure,
  UnauthorizedFailure,
  ValidationFailure,
  apiErrorHttpStatus,
  applicationFailure,
} from "./errors";

const requestId = "request.contract-1";
const TestData = Schema.Struct({ value: Schema.Number });
const TestResponse = ApiResponseSchema(TestData);

function consumeResponse(response: ApiResponse<{ readonly value: number }>) {
  if (response.ok) {
    return response.data.value;
  }
  return response.error.code;
}

describe("API response contract", () => {
  it.effect("decodes a valid success response", () =>
    Effect.gen(function* () {
      const response = apiSuccess({ value: 42 }, "Loaded.");
      const decoded = yield* Schema.decodeUnknown(TestResponse)(response);

      assert.isTrue(decoded.ok);
      if (decoded.ok) {
        assert.strictEqual(decoded.data.value, 42);
        assert.isNull(decoded.error);
      }
      assert.strictEqual(consumeResponse(response), 42);
    }),
  );

  it.effect("decodes a valid failure response", () =>
    Effect.gen(function* () {
      const response = apiFailure({
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId,
        retryable: false,
      });
      const decoded = yield* Schema.decodeUnknown(TestResponse)(response);

      assert.isFalse(decoded.ok);
      if (!decoded.ok) {
        assert.isNull(decoded.data);
        assert.strictEqual(decoded.error.code, "NOT_FOUND");
      }
      assert.strictEqual(consumeResponse(response), "NOT_FOUND");
    }),
  );

  it.effect("rejects a success response that contains an error", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        Schema.decodeUnknown(TestResponse)({
          ok: true,
          data: { value: 1 },
          error: { code: "INTERNAL_ERROR" },
          message: "Contradictory.",
        }),
      );

      assert.isTrue(Exit.isFailure(result));
    }),
  );

  it.effect("rejects a failure response that contains data", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        Schema.decodeUnknown(TestResponse)({
          ok: false,
          data: { value: 1 },
          error: {
            code: "CONFLICT",
            message: "Conflict.",
            retryable: false,
            requestId,
          },
          message: "Conflict.",
        }),
      );

      assert.isTrue(Exit.isFailure(result));
    }),
  );

  it.effect("rejects ad hoc error codes", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(Schema.decodeUnknown(ApiErrorCodeSchema)("AD_HOC"));

      assert.isTrue(Exit.isFailure(result));
    }),
  );

  it.effect.prop(
    "always preserves success discriminant invariants",
    [Schema.Union(Schema.String, Schema.Number, Schema.Boolean, TestData)],
    ([data]) =>
      Effect.sync(() => {
        const response = apiSuccess(data, "Success.");
        assert.isTrue(response.ok);
        assert.isNotNull(response.data);
        assert.isNull(response.error);
      }),
  );

  it.effect.prop(
    "always preserves failure discriminant invariants",
    [ApiErrorCodeSchema],
    ([code]) =>
      Effect.sync(() => {
        const response = apiFailure({
          code,
          message: "Safe failure.",
          requestId,
          retryable: false,
        });
        assert.isFalse(response.ok);
        assert.isNull(response.data);
        assert.isNotNull(response.error);
      }),
  );

  it("represents no-payload success with an explicit result object", () => {
    expect(apiSuccess({ completed: true }, "Completed.")).toEqual({
      ok: true,
      data: { completed: true },
      error: null,
      message: "Completed.",
    });
  });
});

describe("application error mapping", () => {
  const details = [
    ApiErrorDetail.make({
      path: "email",
      code: "invalid_format",
      message: "Enter a valid email address.",
    }),
  ];

  const cases = [
    ValidationFailure.make({ details }),
    UnauthorizedFailure.make(),
    ForbiddenFailure.make(),
    NotFoundFailure.make({ resource: "entry" }),
    ConflictFailure.make(),
    RateLimitedFailure.make(),
    DatabaseFailure.make({ operation: "database.query", cause: new Error("connection failed") }),
    AuthSessionFailure.make({ operation: "auth.session.get", cause: new Error("auth failed") }),
  ];

  it("maps every initial error deterministically to a documented HTTP status", () => {
    const mapped = cases.map((error) => {
      const failure = applicationFailure(error, requestId);
      return {
        tag: error._tag,
        code: failure.error.code,
        status: apiErrorHttpStatus[failure.error.code],
        retryable: failure.error.retryable,
      };
    });

    expect(mapped).toMatchInlineSnapshot(`
      [
        {
          "code": "VALIDATION_ERROR",
          "retryable": false,
          "status": 400,
          "tag": "ValidationFailure",
        },
        {
          "code": "UNAUTHORIZED",
          "retryable": false,
          "status": 401,
          "tag": "UnauthorizedFailure",
        },
        {
          "code": "FORBIDDEN",
          "retryable": false,
          "status": 403,
          "tag": "ForbiddenFailure",
        },
        {
          "code": "NOT_FOUND",
          "retryable": false,
          "status": 404,
          "tag": "NotFoundFailure",
        },
        {
          "code": "CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "ConflictFailure",
        },
        {
          "code": "RATE_LIMITED",
          "retryable": true,
          "status": 429,
          "tag": "RateLimitedFailure",
        },
        {
          "code": "SERVICE_UNAVAILABLE",
          "retryable": true,
          "status": 503,
          "tag": "DatabaseFailure",
        },
        {
          "code": "SERVICE_UNAVAILABLE",
          "retryable": true,
          "status": 503,
          "tag": "AuthSessionFailure",
        },
      ]
    `);
  });

  it("preserves bounded field-level validation details", () => {
    const failure = applicationFailure(ValidationFailure.make({ details }), requestId);

    expect(failure.error.details).toEqual(details);
  });

  it("does not expose infrastructure causes", () => {
    const secretCause = new Error("postgresql://admin:secret@database/internal");
    const failure = applicationFailure(
      DatabaseFailure.make({ operation: "database.query", cause: secretCause }),
      requestId,
    );

    expect(JSON.stringify(failure)).not.toContain("postgresql");
    expect(JSON.stringify(failure)).not.toContain("secret");
  });

  it("snapshots every initial error code and both response variants", () => {
    const failures = Object.keys(apiErrorHttpStatus)
      .sort()
      .map((rawCode) => {
        const code = Schema.decodeUnknownSync(ApiErrorCodeSchema)(rawCode);
        const failure = apiFailure({
          code,
          message: `${code} message`,
          requestId,
          retryable: false,
        });
        return `${failure.ok}:${failure.data}:${failure.error.code}:${apiErrorHttpStatus[code]}`;
      });

    expect({
      success: apiSuccess({ completed: true }, "Completed."),
      failures,
    }).toMatchInlineSnapshot(`
      {
        "failures": [
          "false:null:CONFLICT:409",
          "false:null:FORBIDDEN:403",
          "false:null:INTERNAL_ERROR:500",
          "false:null:NOT_FOUND:404",
          "false:null:RATE_LIMITED:429",
          "false:null:SERVICE_UNAVAILABLE:503",
          "false:null:UNAUTHORIZED:401",
          "false:null:VALIDATION_ERROR:400",
        ],
        "success": {
          "data": {
            "completed": true,
          },
          "error": null,
          "message": "Completed.",
          "ok": true,
        },
      }
    `);
  });

  it("covers every registered error code with an HTTP status", () => {
    expect(Object.keys(apiErrorHttpStatus).sort()).toEqual([
      "CONFLICT",
      "FORBIDDEN",
      "INTERNAL_ERROR",
      "NOT_FOUND",
      "RATE_LIMITED",
      "SERVICE_UNAVAILABLE",
      "UNAUTHORIZED",
      "VALIDATION_ERROR",
    ]);
  });

  it("keeps failure construction schema-backed", () => {
    const failure = applicationFailure(UnauthorizedFailure.make(), requestId);

    expect(failure).toBeInstanceOf(ApiFailure);
  });
});
