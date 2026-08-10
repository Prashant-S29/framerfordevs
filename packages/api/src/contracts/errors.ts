// Defines typed application failures and their centralized public HTTP/error-envelope mapping.

import { Schema } from "effect";

import { ApiErrorDetail, type ApiErrorCode, type ApiFailure, apiFailure } from "./api-response";
import { LocaleDependencySummary } from "./locales";
import { EntryPublicationValidationIssue } from "./publications";
import { SchemaChanges, SchemaValidationIssues } from "./schemas";

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

export class LocaleConflictFailure extends Schema.TaggedError<LocaleConflictFailure>(
  "LocaleConflictFailure",
)("LocaleConflictFailure", {}) {}

export class LocaleUnavailableFailure extends Schema.TaggedError<LocaleUnavailableFailure>(
  "LocaleUnavailableFailure",
)("LocaleUnavailableFailure", {}) {}

export class LocaleDependenciesExistFailure extends Schema.TaggedError<LocaleDependenciesExistFailure>(
  "LocaleDependenciesExistFailure",
)("LocaleDependenciesExistFailure", {
  requestedStatus: Schema.Literal("disabled", "removed"),
  dependencies: LocaleDependencySummary,
}) {}

export class CmsCapabilityRequiredFailure extends Schema.TaggedError<CmsCapabilityRequiredFailure>(
  "CmsCapabilityRequiredFailure",
)("CmsCapabilityRequiredFailure", {}) {}

export class CollectionKeyConflictFailure extends Schema.TaggedError<CollectionKeyConflictFailure>(
  "CollectionKeyConflictFailure",
)("CollectionKeyConflictFailure", {}) {}

export class SchemaInvalidFailure extends Schema.TaggedError<SchemaInvalidFailure>(
  "SchemaInvalidFailure",
)("SchemaInvalidFailure", {
  issues: SchemaValidationIssues,
}) {}

export class SchemaChangeAcknowledgementRequiredFailure extends Schema.TaggedError<SchemaChangeAcknowledgementRequiredFailure>(
  "SchemaChangeAcknowledgementRequiredFailure",
)("SchemaChangeAcknowledgementRequiredFailure", {
  requiredChanges: SchemaChanges,
}) {}

export class PublishedSchemaRequiredFailure extends Schema.TaggedError<PublishedSchemaRequiredFailure>(
  "PublishedSchemaRequiredFailure",
)("PublishedSchemaRequiredFailure", {}) {}

export class EntryDraftConflictFailure extends Schema.TaggedError<EntryDraftConflictFailure>(
  "EntryDraftConflictFailure",
)("EntryDraftConflictFailure", {
  details: Schema.Array(ApiErrorDetail).pipe(Schema.minItems(1), Schema.maxItems(2)),
}) {}

export class EntryCommandConflictFailure extends Schema.TaggedError<EntryCommandConflictFailure>(
  "EntryCommandConflictFailure",
)("EntryCommandConflictFailure", {}) {}

export class EntryRevisionIncompatibleFailure extends Schema.TaggedError<EntryRevisionIncompatibleFailure>(
  "EntryRevisionIncompatibleFailure",
)("EntryRevisionIncompatibleFailure", {}) {}

export class EntryPublicationInvalidFailure extends Schema.TaggedError<EntryPublicationInvalidFailure>(
  "EntryPublicationInvalidFailure",
)("EntryPublicationInvalidFailure", {
  issues: Schema.Array(EntryPublicationValidationIssue).pipe(
    Schema.minItems(1),
    Schema.maxItems(50),
  ),
}) {}

export class EntryPublicationConflictFailure extends Schema.TaggedError<EntryPublicationConflictFailure>(
  "EntryPublicationConflictFailure",
)("EntryPublicationConflictFailure", {
  details: Schema.Array(ApiErrorDetail).pipe(Schema.minItems(1), Schema.maxItems(50)),
}) {}

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
  | LocaleConflictFailure
  | LocaleUnavailableFailure
  | LocaleDependenciesExistFailure
  | CmsCapabilityRequiredFailure
  | CollectionKeyConflictFailure
  | SchemaInvalidFailure
  | SchemaChangeAcknowledgementRequiredFailure
  | PublishedSchemaRequiredFailure
  | EntryDraftConflictFailure
  | EntryCommandConflictFailure
  | EntryRevisionIncompatibleFailure
  | EntryPublicationInvalidFailure
  | EntryPublicationConflictFailure
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
  LOCALE_CONFLICT: 409,
  LOCALE_UNAVAILABLE: 404,
  LOCALE_DEPENDENCIES_EXIST: 409,
  CMS_CAPABILITY_REQUIRED: 409,
  COLLECTION_KEY_CONFLICT: 409,
  SCHEMA_INVALID: 422,
  SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED: 409,
  PUBLISHED_SCHEMA_REQUIRED: 409,
  ENTRY_DRAFT_CONFLICT: 409,
  ENTRY_COMMAND_CONFLICT: 409,
  ENTRY_REVISION_INCOMPATIBLE: 409,
  ENTRY_PUBLICATION_INVALID: 422,
  ENTRY_PUBLICATION_CONFLICT: 409,
  INVITATION_CONFLICT: 409,
  INVITATION_INVALID: 404,
  LAST_OWNER_REQUIRED: 409,
  CREDENTIAL_INVALID: 401,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
} satisfies Readonly<Record<ApiErrorCode, number>>;

function formatDependencyCount(count: number, capped: boolean, noun: string): string {
  const amount = capped ? `${count}+` : String(count);
  return `${amount} ${noun}${count === 1 && !capped ? "" : "s"}`;
}

function localeDependencyDetails(
  error: LocaleDependenciesExistFailure,
): ReadonlyArray<ApiErrorDetail> {
  const details: Array<ApiErrorDetail> = [];
  if (error.dependencies.draftCount > 0) {
    details.push(
      ApiErrorDetail.make({
        code: "locale_drafts_exist",
        message: formatDependencyCount(
          error.dependencies.draftCount,
          error.dependencies.draftCountCapped,
          "draft",
        ),
      }),
    );
  }
  if (error.dependencies.currentPublicationCount > 0) {
    details.push(
      ApiErrorDetail.make({
        code: "locale_current_publications_exist",
        message: formatDependencyCount(
          error.dependencies.currentPublicationCount,
          error.dependencies.currentPublicationCountCapped,
          "current publication",
        ),
      }),
    );
  }
  return details.length > 0
    ? details
    : [
        ApiErrorDetail.make({
          code: "locale_dependencies_exist",
          message: "The locale has dependencies.",
        }),
      ];
}

function localeDependencyMessage(error: LocaleDependenciesExistFailure): string {
  const action = error.requestedStatus === "disabled" ? "Disabling" : "Removing";
  const recovery = error.requestedStatus === "disabled" ? "re-enable" : "restore";
  if (error.dependencies.currentPublicationCount > 0) {
    return `${action} this locale is blocked while it has current publications. Unpublish them first.`;
  }
  const drafts = formatDependencyCount(
    error.dependencies.draftCount,
    error.dependencies.draftCountCapped,
    "draft",
  );
  return `This locale has ${drafts}. ${action} it will make those drafts unavailable to editors. Nothing will be deleted; ${recovery} the locale to restore access.`;
}

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
        message: "The resource changed since it was loaded. Refresh and try again.",
        retryable: false,
      };
    case "InvalidStateTransitionFailure":
      return {
        code: "INVALID_STATE_TRANSITION",
        message: "The requested state transition is not allowed.",
        retryable: false,
      };
    case "LocaleConflictFailure":
      return {
        code: "LOCALE_CONFLICT",
        message: "The locale conflicts with the current project locale configuration.",
        retryable: false,
      };
    case "LocaleUnavailableFailure":
      return {
        code: "LOCALE_UNAVAILABLE",
        message: "The requested locale is not available.",
        retryable: false,
      };
    case "LocaleDependenciesExistFailure":
      return {
        code: "LOCALE_DEPENDENCIES_EXIST",
        message: localeDependencyMessage(error),
        retryable: false,
        details: localeDependencyDetails(error),
      };
    case "CmsCapabilityRequiredFailure":
      return {
        code: "CMS_CAPABILITY_REQUIRED",
        message: "Enable the CMS capability before managing collections.",
        retryable: false,
      };
    case "CollectionKeyConflictFailure":
      return {
        code: "COLLECTION_KEY_CONFLICT",
        message: "A collection with this key already exists in the environment.",
        retryable: false,
      };
    case "SchemaInvalidFailure":
      return {
        code: "SCHEMA_INVALID",
        message: "The draft schema is invalid.",
        retryable: false,
        details: error.issues.map((issue) =>
          ApiErrorDetail.make({
            path: issue.path,
            code: issue.code,
            message: issue.message,
          }),
        ),
      };
    case "SchemaChangeAcknowledgementRequiredFailure": {
      const details = error.requiredChanges.slice(0, 50).map((change) =>
        ApiErrorDetail.make({
          path: `acknowledgedChangeIds.${change.changeId}`,
          code: change.code,
          message: change.summary,
        }),
      );
      return {
        code: "SCHEMA_CHANGE_ACKNOWLEDGEMENT_REQUIRED",
        message: "Review and acknowledge the current risky schema changes before publishing.",
        retryable: false,
        ...(details.length === 0 ? {} : { details }),
      };
    }
    case "PublishedSchemaRequiredFailure":
      return {
        code: "PUBLISHED_SCHEMA_REQUIRED",
        message: "Publish the collection schema before creating or editing entries.",
        retryable: false,
      };
    case "EntryDraftConflictFailure":
      return {
        code: "ENTRY_DRAFT_CONFLICT",
        message: "The draft changed since it was loaded. Review the latest values and try again.",
        retryable: false,
        details: error.details,
      };
    case "EntryCommandConflictFailure":
      return {
        code: "ENTRY_COMMAND_CONFLICT",
        message: "The command identifier was already used for a different entry operation.",
        retryable: false,
      };
    case "EntryRevisionIncompatibleFailure":
      return {
        code: "ENTRY_REVISION_INCOMPATIBLE",
        message: "This revision cannot be restored under the current published schema.",
        retryable: false,
      };
    case "EntryPublicationInvalidFailure":
      return {
        code: "ENTRY_PUBLICATION_INVALID",
        message:
          "The selected locale cannot be published until its publication issues are resolved.",
        retryable: false,
        details: error.issues.map((issue) =>
          ApiErrorDetail.make({
            path: issue.path,
            code: issue.code,
            message: issue.message,
          }),
        ),
      };
    case "EntryPublicationConflictFailure":
      return {
        code: "ENTRY_PUBLICATION_CONFLICT",
        message: "Publication authority changed. Validate the selected locale again.",
        retryable: false,
        details: error.details,
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
