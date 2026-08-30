// Defines typed application failures and their centralized public HTTP/error-envelope mapping.

import { Schema } from "effect";

import { ApiErrorDetail, type ApiErrorCode, type ApiFailure, apiFailure } from "../api";
import { LocaleDependencySummary } from "../../locale";
import { EntryPublicationValidationIssue } from "../../publication";
import { SchemaChanges, SchemaValidationIssues } from "../../schema";

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

export class DeliveryQueryInvalidFailure extends Schema.TaggedError<DeliveryQueryInvalidFailure>(
  "DeliveryQueryInvalidFailure",
)("DeliveryQueryInvalidFailure", {
  details: ValidationDetailsSchema,
}) {}

export class DeliveryCursorInvalidFailure extends Schema.TaggedError<DeliveryCursorInvalidFailure>(
  "DeliveryCursorInvalidFailure",
)("DeliveryCursorInvalidFailure", {}) {}

export class DeliveryCursorStaleFailure extends Schema.TaggedError<DeliveryCursorStaleFailure>(
  "DeliveryCursorStaleFailure",
)("DeliveryCursorStaleFailure", {}) {}

export class DeliveryResponseTooLargeFailure extends Schema.TaggedError<DeliveryResponseTooLargeFailure>(
  "DeliveryResponseTooLargeFailure",
)("DeliveryResponseTooLargeFailure", {}) {}

export class PreviewQueryInvalidFailure extends Schema.TaggedError<PreviewQueryInvalidFailure>(
  "PreviewQueryInvalidFailure",
)("PreviewQueryInvalidFailure", {
  details: ValidationDetailsSchema,
}) {}

export class PreviewRevisionIncompatibleFailure extends Schema.TaggedError<PreviewRevisionIncompatibleFailure>(
  "PreviewRevisionIncompatibleFailure",
)("PreviewRevisionIncompatibleFailure", {}) {}

export class PreviewResponseTooLargeFailure extends Schema.TaggedError<PreviewResponseTooLargeFailure>(
  "PreviewResponseTooLargeFailure",
)("PreviewResponseTooLargeFailure", {}) {}

export class PreviewDocumentCorruptFailure extends Schema.TaggedError<PreviewDocumentCorruptFailure>(
  "PreviewDocumentCorruptFailure",
)("PreviewDocumentCorruptFailure", {}) {}

export class ToolingCursorInvalidFailure extends Schema.TaggedError<ToolingCursorInvalidFailure>(
  "ToolingCursorInvalidFailure",
)("ToolingCursorInvalidFailure", {}) {}

export class ToolingConcurrentSchemaChangeFailure extends Schema.TaggedError<ToolingConcurrentSchemaChangeFailure>(
  "ToolingConcurrentSchemaChangeFailure",
)("ToolingConcurrentSchemaChangeFailure", {}) {}

export class ToolingResponseTooLargeFailure extends Schema.TaggedError<ToolingResponseTooLargeFailure>(
  "ToolingResponseTooLargeFailure",
)("ToolingResponseTooLargeFailure", {}) {}

export class AuthoringStaleSchemaFailure extends Schema.TaggedError<AuthoringStaleSchemaFailure>(
  "AuthoringStaleSchemaFailure",
)("AuthoringStaleSchemaFailure", {}) {}

export class AuthoringDraftConflictFailure extends Schema.TaggedError<AuthoringDraftConflictFailure>(
  "AuthoringDraftConflictFailure",
)("AuthoringDraftConflictFailure", {
  details: Schema.Array(ApiErrorDetail).pipe(Schema.minItems(1), Schema.maxItems(2)),
}) {}

export class AuthoringPublicationConflictFailure extends Schema.TaggedError<AuthoringPublicationConflictFailure>(
  "AuthoringPublicationConflictFailure",
)("AuthoringPublicationConflictFailure", {
  details: ValidationDetailsSchema,
}) {}

export class AuthoringPublicationInvalidFailure extends Schema.TaggedError<AuthoringPublicationInvalidFailure>(
  "AuthoringPublicationInvalidFailure",
)("AuthoringPublicationInvalidFailure", {
  details: ValidationDetailsSchema,
}) {}

export class AuthoringCommandConflictFailure extends Schema.TaggedError<AuthoringCommandConflictFailure>(
  "AuthoringCommandConflictFailure",
)("AuthoringCommandConflictFailure", {}) {}

export class AuthoringRiskyAcknowledgementRequiredFailure extends Schema.TaggedError<AuthoringRiskyAcknowledgementRequiredFailure>(
  "AuthoringRiskyAcknowledgementRequiredFailure",
)("AuthoringRiskyAcknowledgementRequiredFailure", {}) {}

export class AuthoringSourceIdentityConflictFailure extends Schema.TaggedError<AuthoringSourceIdentityConflictFailure>(
  "AuthoringSourceIdentityConflictFailure",
)("AuthoringSourceIdentityConflictFailure", {
  details: ValidationDetailsSchema,
}) {}

export class AuthoringResponseTooLargeFailure extends Schema.TaggedError<AuthoringResponseTooLargeFailure>(
  "AuthoringResponseTooLargeFailure",
)("AuthoringResponseTooLargeFailure", {}) {}

export class WebhookDestinationUnsafeFailure extends Schema.TaggedError<WebhookDestinationUnsafeFailure>(
  "WebhookDestinationUnsafeFailure",
)("WebhookDestinationUnsafeFailure", {}) {}

export class WebhookDestinationResolutionFailure extends Schema.TaggedError<WebhookDestinationResolutionFailure>(
  "WebhookDestinationResolutionFailure",
)("WebhookDestinationResolutionFailure", {}) {}

export class WebhookEndpointLimitReachedFailure extends Schema.TaggedError<WebhookEndpointLimitReachedFailure>(
  "WebhookEndpointLimitReachedFailure",
)("WebhookEndpointLimitReachedFailure", {}) {}

export class WebhookSecretRotationConflictFailure extends Schema.TaggedError<WebhookSecretRotationConflictFailure>(
  "WebhookSecretRotationConflictFailure",
)("WebhookSecretRotationConflictFailure", {}) {}

export class WebhookReplayNotAllowedFailure extends Schema.TaggedError<WebhookReplayNotAllowedFailure>(
  "WebhookReplayNotAllowedFailure",
)("WebhookReplayNotAllowedFailure", {}) {}

export class WebhookEventInvalidFailure extends Schema.TaggedError<WebhookEventInvalidFailure>(
  "WebhookEventInvalidFailure",
)("WebhookEventInvalidFailure", {}) {}

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
  | DeliveryQueryInvalidFailure
  | DeliveryCursorInvalidFailure
  | DeliveryCursorStaleFailure
  | DeliveryResponseTooLargeFailure
  | PreviewQueryInvalidFailure
  | PreviewRevisionIncompatibleFailure
  | PreviewResponseTooLargeFailure
  | PreviewDocumentCorruptFailure
  | ToolingCursorInvalidFailure
  | ToolingConcurrentSchemaChangeFailure
  | ToolingResponseTooLargeFailure
  | AuthoringStaleSchemaFailure
  | AuthoringDraftConflictFailure
  | AuthoringPublicationConflictFailure
  | AuthoringPublicationInvalidFailure
  | AuthoringCommandConflictFailure
  | AuthoringRiskyAcknowledgementRequiredFailure
  | AuthoringSourceIdentityConflictFailure
  | AuthoringResponseTooLargeFailure
  | WebhookDestinationUnsafeFailure
  | WebhookDestinationResolutionFailure
  | WebhookEndpointLimitReachedFailure
  | WebhookSecretRotationConflictFailure
  | WebhookReplayNotAllowedFailure
  | WebhookEventInvalidFailure
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
  DELIVERY_QUERY_INVALID: 400,
  DELIVERY_CURSOR_INVALID: 400,
  DELIVERY_CURSOR_STALE: 409,
  DELIVERY_RESPONSE_TOO_LARGE: 413,
  PREVIEW_QUERY_INVALID: 400,
  PREVIEW_REVISION_INCOMPATIBLE: 409,
  PREVIEW_RESPONSE_TOO_LARGE: 413,
  TOOLING_CURSOR_INVALID: 400,
  TOOLING_CONCURRENT_SCHEMA_CHANGE: 409,
  TOOLING_RESPONSE_TOO_LARGE: 413,
  STALE_SCHEMA: 409,
  DRAFT_CONFLICT: 409,
  PUBLICATION_CONFLICT: 409,
  PUBLICATION_INVALID: 422,
  COMMAND_CONFLICT: 409,
  RISKY_ACKNOWLEDGEMENT_REQUIRED: 409,
  SOURCE_IDENTITY_CONFLICT: 409,
  REQUEST_TOO_LARGE: 413,
  RESPONSE_TOO_LARGE: 413,
  WEBHOOK_DESTINATION_UNSAFE: 422,
  WEBHOOK_ENDPOINT_LIMIT_REACHED: 409,
  WEBHOOK_SECRET_ROTATION_CONFLICT: 409,
  WEBHOOK_REPLAY_NOT_ALLOWED: 409,
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
    case "DeliveryQueryInvalidFailure":
      return {
        code: "DELIVERY_QUERY_INVALID",
        message: "The Delivery query is invalid or unsupported.",
        retryable: false,
        details: error.details,
      };
    case "DeliveryCursorInvalidFailure":
      return {
        code: "DELIVERY_CURSOR_INVALID",
        message: "The Delivery cursor is invalid, expired, or does not match this query.",
        retryable: false,
      };
    case "DeliveryCursorStaleFailure":
      return {
        code: "DELIVERY_CURSOR_STALE",
        message: "Published content changed during pagination. Restart from the first page.",
        retryable: true,
      };
    case "DeliveryResponseTooLargeFailure":
      return {
        code: "DELIVERY_RESPONSE_TOO_LARGE",
        message: "The Delivery response is too large. Reduce the page size or expansion.",
        retryable: false,
      };
    case "PreviewQueryInvalidFailure":
      return {
        code: "PREVIEW_QUERY_INVALID",
        message: "The Preview query is invalid or unsupported.",
        retryable: false,
        details: error.details,
      };
    case "PreviewRevisionIncompatibleFailure":
      return {
        code: "PREVIEW_REVISION_INCOMPATIBLE",
        message: "The selected Preview revisions do not share the selected schema contract.",
        retryable: false,
      };
    case "PreviewResponseTooLargeFailure":
      return {
        code: "PREVIEW_RESPONSE_TOO_LARGE",
        message: "The Preview response exceeds the maximum size.",
        retryable: false,
      };
    case "PreviewDocumentCorruptFailure":
      return {
        code: "SERVICE_UNAVAILABLE",
        message: "The selected Preview source is temporarily unavailable.",
        retryable: false,
      };
    case "ToolingCursorInvalidFailure":
      return {
        code: "TOOLING_CURSOR_INVALID",
        message: "The Tooling cursor is invalid, expired, or does not match this request.",
        retryable: false,
      };
    case "ToolingConcurrentSchemaChangeFailure":
      return {
        code: "TOOLING_CONCURRENT_SCHEMA_CHANGE",
        message: "Published schema authority changed during reconciliation. Retry the pull.",
        retryable: true,
      };
    case "ToolingResponseTooLargeFailure":
      return {
        code: "TOOLING_RESPONSE_TOO_LARGE",
        message: "The Tooling response exceeds the maximum size.",
        retryable: false,
      };
    case "AuthoringStaleSchemaFailure":
      return {
        code: "STALE_SCHEMA",
        message: "Published schema authority changed. Plan the complete project schema again.",
        retryable: false,
      };
    case "AuthoringDraftConflictFailure":
      return {
        code: "DRAFT_CONFLICT",
        message:
          "The draft changed since it was loaded. Review the latest authority and try again.",
        retryable: false,
        details: error.details,
      };
    case "AuthoringPublicationConflictFailure":
      return {
        code: "PUBLICATION_CONFLICT",
        message: "Publication authority changed. Validate the exact locale again.",
        retryable: false,
        details: error.details,
      };
    case "AuthoringPublicationInvalidFailure":
      return {
        code: "PUBLICATION_INVALID",
        message: "The exact locale cannot be published until its publication issues are resolved.",
        retryable: false,
        details: error.details,
      };
    case "AuthoringCommandConflictFailure":
      return {
        code: "COMMAND_CONFLICT",
        message: "The command identifier was already used for a different schema apply.",
        retryable: false,
      };
    case "AuthoringRiskyAcknowledgementRequiredFailure":
      return {
        code: "RISKY_ACKNOWLEDGEMENT_REQUIRED",
        message: "Acknowledge exactly the risky changes returned by the current plan.",
        retryable: false,
      };
    case "AuthoringSourceIdentityConflictFailure":
      return {
        code: "SOURCE_IDENTITY_CONFLICT",
        message: "One or more authoring source identities conflict with persisted authority.",
        retryable: false,
        details: error.details,
      };
    case "AuthoringResponseTooLargeFailure":
      return {
        code: "RESPONSE_TOO_LARGE",
        message: "The Authoring response exceeds the maximum size.",
        retryable: false,
      };
    case "WebhookDestinationUnsafeFailure":
      return {
        code: "WEBHOOK_DESTINATION_UNSAFE",
        message: "The webhook destination does not meet the outbound security policy.",
        retryable: false,
      };
    case "WebhookDestinationResolutionFailure":
      return {
        code: "SERVICE_UNAVAILABLE",
        message: "The webhook destination could not be resolved temporarily.",
        retryable: true,
      };
    case "WebhookEndpointLimitReachedFailure":
      return {
        code: "WEBHOOK_ENDPOINT_LIMIT_REACHED",
        message: "This environment has reached its enabled webhook endpoint limit.",
        retryable: false,
      };
    case "WebhookSecretRotationConflictFailure":
      return {
        code: "WEBHOOK_SECRET_ROTATION_CONFLICT",
        message: "Complete or cancel the current webhook secret rotation first.",
        retryable: false,
      };
    case "WebhookReplayNotAllowedFailure":
      return {
        code: "WEBHOOK_REPLAY_NOT_ALLOWED",
        message: "This event cannot be replayed to the selected endpoint.",
        retryable: false,
      };
    case "WebhookEventInvalidFailure":
      return {
        code: "SERVICE_UNAVAILABLE",
        message: "The publication event is temporarily unavailable.",
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
