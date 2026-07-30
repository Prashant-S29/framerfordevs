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

export class ProjectKeyConflictFailure extends Schema.TaggedError<ProjectKeyConflictFailure>(
  "ProjectKeyConflictFailure",
)("ProjectKeyConflictFailure", {}) {}

export class VersionConflictFailure extends Schema.TaggedError<VersionConflictFailure>(
  "VersionConflictFailure",
)("VersionConflictFailure", {}) {}

export class InvalidStateTransitionFailure extends Schema.TaggedError<InvalidStateTransitionFailure>(
  "InvalidStateTransitionFailure",
)("InvalidStateTransitionFailure", {}) {}

export class InvitationConflictFailure extends Schema.TaggedError<InvitationConflictFailure>(
  "InvitationConflictFailure",
)("InvitationConflictFailure", {}) {}

export class InvitationInvalidFailure extends Schema.TaggedError<InvitationInvalidFailure>(
  "InvitationInvalidFailure",
)("InvitationInvalidFailure", {}) {}

export class LastOwnerRequiredFailure extends Schema.TaggedError<LastOwnerRequiredFailure>(
  "LastOwnerRequiredFailure",
)("LastOwnerRequiredFailure", {}) {}

export class CredentialInvalidFailure extends Schema.TaggedError<CredentialInvalidFailure>(
  "CredentialInvalidFailure",
)("CredentialInvalidFailure", {}) {}

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

export class SecurityServiceFailure extends Schema.TaggedError<SecurityServiceFailure>(
  "SecurityServiceFailure",
)("SecurityServiceFailure", {
  operation: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  cause: Schema.Defect,
}) {}

export type ApplicationError =
  | ValidationFailure
  | UnauthorizedFailure
  | ForbiddenFailure
  | NotFoundFailure
  | ConflictFailure
  | ProjectKeyConflictFailure
  | VersionConflictFailure
  | InvalidStateTransitionFailure
  | InvitationConflictFailure
  | InvitationInvalidFailure
  | LastOwnerRequiredFailure
  | CredentialInvalidFailure
  | RateLimitedFailure
  | DatabaseFailure
  | AuthSessionFailure
  | SecurityServiceFailure;

export const apiErrorHttpStatus = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PROJECT_KEY_CONFLICT: 409,
  VERSION_CONFLICT: 409,
  INVALID_STATE_TRANSITION: 409,
  INVITATION_CONFLICT: 409,
  INVITATION_INVALID: 404,
  LAST_OWNER_REQUIRED: 409,
  CREDENTIAL_INVALID: 401,
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
    case "ProjectKeyConflictFailure":
      return {
        code: "PROJECT_KEY_CONFLICT",
        message: "A project with this key already exists in the workspace.",
        retryable: false,
      };
    case "VersionConflictFailure":
      return {
        code: "VERSION_CONFLICT",
        message: "The project changed since it was loaded. Refresh and try again.",
        retryable: false,
      };
    case "InvalidStateTransitionFailure":
      return {
        code: "INVALID_STATE_TRANSITION",
        message: "The requested state transition is not allowed.",
        retryable: false,
      };
    case "InvitationConflictFailure":
      return {
        code: "INVITATION_CONFLICT",
        message: "A pending invitation already exists for this project and email address.",
        retryable: false,
      };
    case "InvitationInvalidFailure":
      return {
        code: "INVITATION_INVALID",
        message: "The invitation is invalid or no longer available.",
        retryable: false,
      };
    case "LastOwnerRequiredFailure":
      return {
        code: "LAST_OWNER_REQUIRED",
        message: "The project must retain at least one owner.",
        retryable: false,
      };
    case "CredentialInvalidFailure":
      return {
        code: "CREDENTIAL_INVALID",
        message: "The credential is invalid or no longer available.",
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
    case "SecurityServiceFailure":
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
