import { Schema } from "effect";

export class CliConfigNotFoundError extends Schema.TaggedError<CliConfigNotFoundError>(
  "CliConfigNotFoundError",
)("CliConfigNotFoundError", {}) {}

export class CliConfigAmbiguousError extends Schema.TaggedError<CliConfigAmbiguousError>(
  "CliConfigAmbiguousError",
)("CliConfigAmbiguousError", {
  count: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(2)),
}) {}

export class CliConfigInvalidError extends Schema.TaggedError<CliConfigInvalidError>(
  "CliConfigInvalidError",
)("CliConfigInvalidError", {}) {}

export class CliFileSystemError extends Schema.TaggedError<CliFileSystemError>(
  "CliFileSystemError",
)("CliFileSystemError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export class OAuthDeviceError extends Schema.TaggedError<OAuthDeviceError>("OAuthDeviceError")(
  "OAuthDeviceError",
  {
    code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
    retryable: Schema.Boolean,
  },
) {}

export class OAuthBrowserOpenError extends Schema.TaggedError<OAuthBrowserOpenError>(
  "OAuthBrowserOpenError",
)("OAuthBrowserOpenError", {}) {}

export class CredentialStoreUnavailableError extends Schema.TaggedError<CredentialStoreUnavailableError>(
  "CredentialStoreUnavailableError",
)("CredentialStoreUnavailableError", {}) {}

export class StoredCredentialInvalidError extends Schema.TaggedError<StoredCredentialInvalidError>(
  "StoredCredentialInvalidError",
)("StoredCredentialInvalidError", {}) {}

export class ControlPlaneHttpError extends Schema.TaggedError<ControlPlaneHttpError>(
  "ControlPlaneHttpError",
)("ControlPlaneHttpError", {
  status: Schema.Number.pipe(Schema.int(), Schema.between(0, 599)),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  retryable: Schema.Boolean,
}) {}

export class ControlPlaneResponseTooLargeError extends Schema.TaggedError<ControlPlaneResponseTooLargeError>(
  "ControlPlaneResponseTooLargeError",
)("ControlPlaneResponseTooLargeError", {}) {}

export class ControlPlaneTransportError extends Schema.TaggedError<ControlPlaneTransportError>(
  "ControlPlaneTransportError",
)("ControlPlaneTransportError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export class ToolingHttpError extends Schema.TaggedError<ToolingHttpError>("ToolingHttpError")(
  "ToolingHttpError",
  {
    status: Schema.Number.pipe(Schema.int(), Schema.between(0, 599)),
    code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
    retryable: Schema.Boolean,
  },
) {}

export class ToolingResponseTooLargeError extends Schema.TaggedError<ToolingResponseTooLargeError>(
  "ToolingResponseTooLargeError",
)("ToolingResponseTooLargeError", {}) {}

export class ToolingPaginationError extends Schema.TaggedError<ToolingPaginationError>(
  "ToolingPaginationError",
)("ToolingPaginationError", {}) {}

export class ToolingAuthorityChangedError extends Schema.TaggedError<ToolingAuthorityChangedError>(
  "ToolingAuthorityChangedError",
)("ToolingAuthorityChangedError", {}) {}

export class ToolingTransportError extends Schema.TaggedError<ToolingTransportError>(
  "ToolingTransportError",
)("ToolingTransportError", {
  operation: Schema.String,
  cause: Schema.Defect,
}) {}

export class GeneratorContractInvalidError extends Schema.TaggedError<GeneratorContractInvalidError>(
  "GeneratorContractInvalidError",
)("GeneratorContractInvalidError", {
  collectionId: Schema.String,
}) {}

export class GeneratorOutputUnownedError extends Schema.TaggedError<GeneratorOutputUnownedError>(
  "GeneratorOutputUnownedError",
)("GeneratorOutputUnownedError", {}) {}

export class GeneratorFileModifiedError extends Schema.TaggedError<GeneratorFileModifiedError>(
  "GeneratorFileModifiedError",
)("GeneratorFileModifiedError", {
  path: Schema.String,
}) {}

export class GeneratorCommitError extends Schema.TaggedError<GeneratorCommitError>(
  "GeneratorCommitError",
)("GeneratorCommitError", {
  stage: Schema.String,
  cause: Schema.Defect,
}) {}

export const staticSchemaExtractionErrorCodeValues = [
  "root_invalid",
  "entry_invalid",
  "path_escape",
  "file_symlink",
  "file_invalid",
  "file_too_large",
  "graph_too_large",
  "file_count_exceeded",
  "graph_cycle",
  "syntax_unsupported",
  "import_unsupported",
  "declaration_invalid",
  "export_invalid",
  "identifier_unknown",
  "expression_unsupported",
  "evaluation_cycle",
  "depth_exceeded",
  "output_too_large",
  "schema_invalid",
  "worker_failed",
  "worker_timeout",
  "worker_protocol_invalid",
] as const;

export const StaticSchemaExtractionErrorCode = Schema.Literal(
  ...staticSchemaExtractionErrorCodeValues,
);
export type StaticSchemaExtractionErrorCode = typeof StaticSchemaExtractionErrorCode.Type;

export class StaticSchemaExtractionError extends Schema.TaggedError<StaticSchemaExtractionError>(
  "StaticSchemaExtractionError",
)("StaticSchemaExtractionError", {
  code: StaticSchemaExtractionErrorCode,
  relativePath: Schema.NullOr(Schema.String.pipe(Schema.maxLength(240))),
  line: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1))),
  column: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1))),
}) {}

export const experimentalSchemaBuildErrorCodeValues = [
  "experimental_opt_in_required",
  "entry_invalid",
  "path_escape",
  "file_symlink",
  "file_invalid",
  "file_too_large",
  "graph_too_large",
  "file_count_exceeded",
  "graph_cycle",
  "syntax_unsupported",
  "import_unsupported",
  "transpile_failed",
  "guest_initialization_failed",
  "guest_execution_failed",
  "guest_interrupted",
  "guest_output_invalid",
  "output_too_large",
  "schema_invalid",
  "worker_failed",
  "worker_timeout",
  "worker_protocol_invalid",
] as const;

export const ExperimentalSchemaBuildErrorCode = Schema.Literal(
  ...experimentalSchemaBuildErrorCodeValues,
);
export type ExperimentalSchemaBuildErrorCode = typeof ExperimentalSchemaBuildErrorCode.Type;

export class ExperimentalSchemaBuildError extends Schema.TaggedError<ExperimentalSchemaBuildError>(
  "ExperimentalSchemaBuildError",
)("ExperimentalSchemaBuildError", {
  code: ExperimentalSchemaBuildErrorCode,
  relativePath: Schema.NullOr(Schema.String.pipe(Schema.maxLength(240))),
}) {}

export class CliSchemaBuildNotConfiguredError extends Schema.TaggedError<CliSchemaBuildNotConfiguredError>(
  "CliSchemaBuildNotConfiguredError",
)("CliSchemaBuildNotConfiguredError", {}) {}

export class CliSchemaBuildOutputUnownedError extends Schema.TaggedError<CliSchemaBuildOutputUnownedError>(
  "CliSchemaBuildOutputUnownedError",
)("CliSchemaBuildOutputUnownedError", {}) {}

export class CliSchemaBuildOutputModifiedError extends Schema.TaggedError<CliSchemaBuildOutputModifiedError>(
  "CliSchemaBuildOutputModifiedError",
)("CliSchemaBuildOutputModifiedError", {}) {}

export class CliSchemaBuildStaleError extends Schema.TaggedError<CliSchemaBuildStaleError>(
  "CliSchemaBuildStaleError",
)("CliSchemaBuildStaleError", {}) {}

export class CliSchemaBuildCommitError extends Schema.TaggedError<CliSchemaBuildCommitError>(
  "CliSchemaBuildCommitError",
)("CliSchemaBuildCommitError", {
  stage: Schema.String,
  cause: Schema.Defect,
}) {}

export class CliAuthoringSchemaUnownedError extends Schema.TaggedError<CliAuthoringSchemaUnownedError>(
  "CliAuthoringSchemaUnownedError",
)("CliAuthoringSchemaUnownedError", {}) {}

export class CliAuthoringSchemaModifiedError extends Schema.TaggedError<CliAuthoringSchemaModifiedError>(
  "CliAuthoringSchemaModifiedError",
)("CliAuthoringSchemaModifiedError", {}) {}

export class CliAuthoringSchemaLockError extends Schema.TaggedError<CliAuthoringSchemaLockError>(
  "CliAuthoringSchemaLockError",
)("CliAuthoringSchemaLockError", { operation: Schema.String, cause: Schema.Defect }) {}

export class CliRetryJournalConflictError extends Schema.TaggedError<CliRetryJournalConflictError>(
  "CliRetryJournalConflictError",
)("CliRetryJournalConflictError", {}) {}

export class CliRetryJournalError extends Schema.TaggedError<CliRetryJournalError>(
  "CliRetryJournalError",
)("CliRetryJournalError", { operation: Schema.String, cause: Schema.Defect }) {}
