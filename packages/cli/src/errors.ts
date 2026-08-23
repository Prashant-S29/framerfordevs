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
