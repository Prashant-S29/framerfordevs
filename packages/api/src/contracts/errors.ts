import { Schema } from "effect";

import { ApiErrorDetail, type ApiErrorCode, type ApiFailure, apiFailure } from "./api-response";

const ValidationDetailsSchema = Schema.Array(ApiErrorDetail).pipe(
  Schema.minItems(1),
  Schema.maxItems(50),
);

export class ValidationFailure extends Schema.TaggedError<ValidationFailure>("ValidationFailure")(
  "ValidationFailure",
  {
    details: ValidationDetailsSchema,
  },
) {}

export class UnauthorizedFailure extends Schema.TaggedError<UnauthorizedFailure>(
  "UnauthorizedFailure",
)("UnauthorizedFailure", {}) {}

export class ForbiddenFailure extends Schema.TaggedError<ForbiddenFailure>("ForbiddenFailure")(
  "ForbiddenFailure",
  {},
) {}

export class NotFoundFailure extends Schema.TaggedError<NotFoundFailure>("NotFoundFailure")(
  "NotFoundFailure",
  {
    resource: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  },
) {}

export class ConflictFailure extends Schema.TaggedError<ConflictFailure>("ConflictFailure")(
  "ConflictFailure",
  {},
) {}

export class RateLimitedFailure extends Schema.TaggedError<RateLimitedFailure>(
  "RateLimitedFailure",
)("RateLimitedFailure", {}) {}

export class DatabaseFailure extends Schema.TaggedError<DatabaseFailure>("DatabaseFailure")(
  "DatabaseFailure",
  {
    operation: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
    cause: Schema.Defect,
  },
) {}

export class AuthSessionFailure extends Schema.TaggedError<AuthSessionFailure>(
  "AuthSessionFailure",
)("AuthSessionFailure", {
  operation: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  cause: Schema.Defect,
}) {}

export type ApplicationError =
  | ValidationFailure
  | UnauthorizedFailure
  | ForbiddenFailure
  | NotFoundFailure
  | ConflictFailure
  | RateLimitedFailure
  | DatabaseFailure
  | AuthSessionFailure;

export const apiErrorHttpStatus = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} satisfies Readonly<Record<ApiErrorCode, number>>;

interface PublicErrorDefinition {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: ReadonlyArray<ApiErrorDetail>;
}

export function toPublicError(error: ApplicationError): PublicErrorDefinition {
  switch (error._tag) {
    case "ValidationFailure":
      return {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        retryable: false,
        details: error.details,
      };
    case "UnauthorizedFailure":
      return {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
        retryable: false,
      };
    case "ForbiddenFailure":
      return {
        code: "FORBIDDEN",
        message: "You do not have permission to perform this action.",
        retryable: false,
      };
    case "NotFoundFailure":
      return {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        retryable: false,
      };
    case "ConflictFailure":
      return {
        code: "CONFLICT",
        message: "The request conflicts with the current resource state.",
        retryable: false,
      };
    case "RateLimitedFailure":
      return {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
        retryable: true,
      };
    case "DatabaseFailure":
    case "AuthSessionFailure":
      return {
        code: "SERVICE_UNAVAILABLE",
        message: "A required service is temporarily unavailable.",
        retryable: true,
      };
  }
}

export function applicationFailure(error: ApplicationError, requestId: string): ApiFailure {
  const definition = toPublicError(error);

  return apiFailure({
    ...definition,
    requestId,
  });
}

export function internalFailure(requestId: string): ApiFailure {
  return apiFailure({
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    requestId,
    retryable: false,
  });
}
