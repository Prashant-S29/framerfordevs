import { Schema } from "effect";

export const ApiErrorCodeSchema = Schema.Literal(
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PROJECT_KEY_CONFLICT",
  "VERSION_CONFLICT",
  "INVALID_STATE_TRANSITION",
  "LOCALE_CONFLICT",
  "LOCALE_UNAVAILABLE",
  "LOCALE_DEPENDENCIES_EXIST",
  "CMS_CAPABILITY_REQUIRED",
  "COLLECTION_KEY_CONFLICT",
  "SCHEMA_INVALID",
  "SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED",
  "INVITATION_CONFLICT",
  "INVITATION_INVALID",
  "LAST_OWNER_REQUIRED",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
);

export type ApiErrorCode = typeof ApiErrorCodeSchema.Type;

export const RequestIdSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(128),
  Schema.pattern(/^[A-Za-z0-9._:-]+$/),
);

export class ApiErrorDetail extends Schema.Class<ApiErrorDetail>("ApiErrorDetail")({
  path: Schema.optionalWith(Schema.String.pipe(Schema.maxLength(256)), { exact: true }),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

const ApiErrorDetailsSchema = Schema.Array(ApiErrorDetail).pipe(
  Schema.minItems(1),
  Schema.maxItems(50),
);

export class ApiError extends Schema.Class<ApiError>("ApiError")({
  code: ApiErrorCodeSchema,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(ApiErrorDetailsSchema, { exact: true }),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class ApiFailure extends Schema.Class<ApiFailure>("ApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: ApiError,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export interface ApiSuccess<A> {
  readonly ok: true;
  readonly data: A;
  readonly error: null;
  readonly message: string;
}

export type ApiResponse<A> = ApiSuccess<A> | ApiFailure;

export type ApiData = object | string | number | boolean;

export function apiSuccess<A extends ApiData>(data: A, message: string): ApiSuccess<A> {
  return {
    ok: true,
    data,
    error: null,
    message,
  };
}

export function apiFailure(options: {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly requestId: string;
  readonly retryable: boolean;
  readonly details?: ReadonlyArray<ApiErrorDetail>;
}): ApiFailure {
  const error = ApiError.make({
    code: options.code,
    message: options.message,
    requestId: options.requestId,
    retryable: options.retryable,
    ...(options.details === undefined ? {} : { details: options.details }),
  });

  return ApiFailure.make({
    ok: false,
    data: null,
    error,
    message: options.message,
  });
}

export function ApiSuccessSchema<A extends ApiData, I>(data: Schema.Schema<A, I, never>) {
  return Schema.Struct({
    ok: Schema.Literal(true),
    data,
    error: Schema.Null,
    message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  });
}

export function ApiResponseSchema<A extends ApiData, I>(data: Schema.Schema<A, I, never>) {
  return Schema.Union(ApiSuccessSchema(data), ApiFailure);
}
