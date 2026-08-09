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
import { LocaleDependencySummary } from "./locales";
import {
  AuthSessionFailure,
  CmsCapabilityRequiredFailure,
  CollectionKeyConflictFailure,
  ConflictFailure,
  CredentialInvalidFailure,
  DatabaseFailure,
  EntryCommandConflictFailure,
  EntryDraftConflictFailure,
  EntryRevisionIncompatibleFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  InvitationConflictFailure,
  InvitationInvalidFailure,
  LastOwnerRequiredFailure,
  LocaleConflictFailure,
  LocaleDependenciesExistFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  ProjectKeyConflictFailure,
  PublishedSchemaRequiredFailure,
  RateLimitedFailure,
  SchemaChangeAcknowledgementRequiredFailure,
  SchemaInvalidFailure,
  SecurityServiceFailure,
  UnauthorizedFailure,
  ValidationFailure,
  VersionConflictFailure,
  apiErrorHttpStatus,
  applicationFailure,
} from "./errors";
import { SchemaValidationIssue } from "./schemas";

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
    ProjectKeyConflictFailure.make(),
    VersionConflictFailure.make(),
    InvalidStateTransitionFailure.make(),
    LocaleConflictFailure.make(),
    LocaleUnavailableFailure.make(),
    LocaleDependenciesExistFailure.make({
      requestedStatus: "disabled",
      dependencies: LocaleDependencySummary.make({
        draftCount: 2,
        currentPublicationCount: 0,
        draftCountCapped: false,
        currentPublicationCountCapped: false,
      }),
    }),
    CmsCapabilityRequiredFailure.make(),
    CollectionKeyConflictFailure.make(),
    SchemaInvalidFailure.make({
      issues: [
        SchemaValidationIssue.make({
          path: "fields",
          code: "field_count_required",
          message: "A published schema must contain at least one field.",
        }),
      ],
    }),
    SchemaChangeAcknowledgementRequiredFailure.make({ requiredChanges: [] }),
    PublishedSchemaRequiredFailure.make(),
    EntryDraftConflictFailure.make({
      details: [
        ApiErrorDetail.make({
          path: "sharedVersion",
          code: "stale_shared_version",
          message: "The shared draft changed.",
          scope: "shared",
          expectedVersion: 1,
          currentVersion: 2,
          currentRevisionId: null,
        }),
      ],
    }),
    EntryCommandConflictFailure.make(),
    EntryRevisionIncompatibleFailure.make(),
    InvitationConflictFailure.make(),
    InvitationInvalidFailure.make(),
    LastOwnerRequiredFailure.make(),
    CredentialInvalidFailure.make(),
    RateLimitedFailure.make(),
    DatabaseFailure.make({ operation: "database.query", cause: new Error("connection failed") }),
    AuthSessionFailure.make({ operation: "auth.session.get", cause: new Error("auth failed") }),
    SecurityServiceFailure.make({
      operation: "security.credential.random",
      cause: new Error("entropy unavailable"),
    }),
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
          "code": "PROJECT_KEY_CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "ProjectKeyConflictFailure",
        },
        {
          "code": "VERSION_CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "VersionConflictFailure",
        },
        {
          "code": "INVALID_STATE_TRANSITION",
          "retryable": false,
          "status": 409,
          "tag": "InvalidStateTransitionFailure",
        },
        {
          "code": "LOCALE_CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "LocaleConflictFailure",
        },
        {
          "code": "LOCALE_UNAVAILABLE",
          "retryable": false,
          "status": 404,
          "tag": "LocaleUnavailableFailure",
        },
        {
          "code": "LOCALE_DEPENDENCIES_EXIST",
          "retryable": false,
          "status": 409,
          "tag": "LocaleDependenciesExistFailure",
        },
        {
          "code": "CMS_CAPABILITY_REQUIRED",
          "retryable": false,
          "status": 409,
          "tag": "CmsCapabilityRequiredFailure",
        },
        {
          "code": "COLLECTION_KEY_CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "CollectionKeyConflictFailure",
        },
        {
          "code": "SCHEMA_INVALID",
          "retryable": false,
          "status": 422,
          "tag": "SchemaInvalidFailure",
        },
        {
          "code": "SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED",
          "retryable": false,
          "status": 409,
          "tag": "SchemaChangeAcknowledgementRequiredFailure",
        },
        {
          "code": "PUBLISHED_SCHEMA_REQUIRED",
          "retryable": false,
          "status": 409,
          "tag": "PublishedSchemaRequiredFailure",
        },
        {
          "code": "ENTRY_DRAFT_CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "EntryDraftConflictFailure",
        },
        {
          "code": "ENTRY_COMMAND_CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "EntryCommandConflictFailure",
        },
        {
          "code": "ENTRY_REVISION_INCOMPATIBLE",
          "retryable": false,
          "status": 409,
          "tag": "EntryRevisionIncompatibleFailure",
        },
        {
          "code": "INVITATION_CONFLICT",
          "retryable": false,
          "status": 409,
          "tag": "InvitationConflictFailure",
        },
        {
          "code": "INVITATION_INVALID",
          "retryable": false,
          "status": 404,
          "tag": "InvitationInvalidFailure",
        },
        {
          "code": "LAST_OWNER_REQUIRED",
          "retryable": false,
          "status": 409,
          "tag": "LastOwnerRequiredFailure",
        },
        {
          "code": "CREDENTIAL_INVALID",
          "retryable": false,
          "status": 401,
          "tag": "CredentialInvalidFailure",
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
        {
          "code": "SERVICE_UNAVAILABLE",
          "retryable": true,
          "status": 503,
          "tag": "SecurityServiceFailure",
        },
      ]
    `);
  });

  it("preserves bounded field-level validation details", () => {
    const failure = applicationFailure(ValidationFailure.make({ details }), requestId);

    expect(failure.error.details).toEqual(details);
  });

  it("uses resource-neutral version conflict feedback", () => {
    const failure = applicationFailure(VersionConflictFailure.make(), requestId);

    expect(failure.message).toBe(
      "The resource changed since it was loaded. Refresh and try again.",
    );
  });

  it("returns safe locale dependency counts and draft lockout guidance", () => {
    const failure = applicationFailure(
      LocaleDependenciesExistFailure.make({
        requestedStatus: "removed",
        dependencies: LocaleDependencySummary.make({
          draftCount: 100,
          currentPublicationCount: 0,
          draftCountCapped: true,
          currentPublicationCountCapped: false,
        }),
      }),
      requestId,
    );

    expect(failure.message).toBe(
      "This locale has 100+ drafts. Removing it will make those drafts unavailable to editors. Nothing will be deleted; restore the locale to restore access.",
    );
    expect(failure.error.details).toEqual([
      expect.objectContaining({ code: "locale_drafts_exist", message: "100+ drafts" }),
    ]);
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
          "false:null:CMS_CAPABILITY_REQUIRED:409",
          "false:null:COLLECTION_KEY_CONFLICT:409",
          "false:null:CONFLICT:409",
          "false:null:CREDENTIAL_INVALID:401",
          "false:null:ENTRY_COMMAND_CONFLICT:409",
          "false:null:ENTRY_DRAFT_CONFLICT:409",
          "false:null:ENTRY_REVISION_INCOMPATIBLE:409",
          "false:null:FORBIDDEN:403",
          "false:null:INTERNAL_ERROR:500",
          "false:null:INVALID_STATE_TRANSITION:409",
          "false:null:INVITATION_CONFLICT:409",
          "false:null:INVITATION_INVALID:404",
          "false:null:LAST_OWNER_REQUIRED:409",
          "false:null:LOCALE_CONFLICT:409",
          "false:null:LOCALE_DEPENDENCIES_EXIST:409",
          "false:null:LOCALE_UNAVAILABLE:404",
          "false:null:NOT_FOUND:404",
          "false:null:PROJECT_KEY_CONFLICT:409",
          "false:null:PUBLISHED_SCHEMA_REQUIRED:409",
          "false:null:RATE_LIMITED:429",
          "false:null:SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED:409",
          "false:null:SCHEMA_INVALID:422",
          "false:null:SERVICE_UNAVAILABLE:503",
          "false:null:UNAUTHORIZED:401",
          "false:null:VALIDATION_ERROR:400",
          "false:null:VERSION_CONFLICT:409",
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
      "CMS_CAPABILITY_REQUIRED",
      "COLLECTION_KEY_CONFLICT",
      "CONFLICT",
      "CREDENTIAL_INVALID",
      "ENTRY_COMMAND_CONFLICT",
      "ENTRY_DRAFT_CONFLICT",
      "ENTRY_REVISION_INCOMPATIBLE",
      "FORBIDDEN",
      "INTERNAL_ERROR",
      "INVALID_STATE_TRANSITION",
      "INVITATION_CONFLICT",
      "INVITATION_INVALID",
      "LAST_OWNER_REQUIRED",
      "LOCALE_CONFLICT",
      "LOCALE_DEPENDENCIES_EXIST",
      "LOCALE_UNAVAILABLE",
      "NOT_FOUND",
      "PROJECT_KEY_CONFLICT",
      "PUBLISHED_SCHEMA_REQUIRED",
      "RATE_LIMITED",
      "SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED",
      "SCHEMA_INVALID",
      "SERVICE_UNAVAILABLE",
      "UNAUTHORIZED",
      "VALIDATION_ERROR",
      "VERSION_CONFLICT",
    ]);
  });

  it("keeps failure construction schema-backed", () => {
    const failure = applicationFailure(UnauthorizedFailure.make(), requestId);

    expect(failure).toBeInstanceOf(ApiFailure);
  });
});
