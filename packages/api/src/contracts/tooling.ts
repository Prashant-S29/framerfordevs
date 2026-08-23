// Defines the closed Tooling v1 discovery, manifest, immutable-contract, and public-error surface.

import { Schema } from "effect";

import { ApiErrorDetail, ApiSuccessSchema, RequestIdSchema } from "./api-response";
import { LocaleTag, ProjectLocaleId } from "./locales";
import { Cursor, EnvironmentId, IsoDateTime, ProjectId } from "./platform";
import {
  CollectionApiKey,
  CollectionId,
  ContractHash,
  SchemaRevisionId,
  SchemaRevisionSequence,
} from "./schemas";

export const toolingLimits = {
  queryBytes: 4_096,
  defaultPageSize: 20,
  maximumPageSize: 50,
  responseBytes: 1_572_864,
  maximumContractDepth: 24,
} as const;

export const ToolingEnvironmentKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9-]{0,62}$/u),
  Schema.filter((value) => !value.includes("--") && !value.endsWith("-")),
);

export const ToolingApiErrorCode = Schema.Literal(
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CMS_CAPABILITY_REQUIRED",
  "PUBLISHED_SCHEMA_REQUIRED",
  "TOOLING_CURSOR_INVALID",
  "TOOLING_CONCURRENT_SCHEMA_CHANGE",
  "TOOLING_RESPONSE_TOO_LARGE",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
);

export class ToolingApiError extends Schema.Class<ToolingApiError>("ToolingApiError")({
  code: ToolingApiErrorCode,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(
    Schema.Array(ApiErrorDetail).pipe(Schema.minItems(1), Schema.maxItems(50)),
    { exact: true },
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class ToolingApiFailure extends Schema.Class<ToolingApiFailure>("ToolingApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: ToolingApiError,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

const ToolingCursorInput = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(2_048),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
);

export class ToolingPageQuery extends Schema.Class<ToolingPageQuery>("ToolingPageQuery")({
  limit: Schema.Number.pipe(Schema.int(), Schema.between(1, toolingLimits.maximumPageSize)),
  cursor: Schema.NullOr(ToolingCursorInput),
}) {}

export class ToolingProjectScope extends Schema.Class<ToolingProjectScope>("ToolingProjectScope")({
  projectId: ProjectId,
}) {}

export class ToolingEnvironmentScope extends Schema.Class<ToolingEnvironmentScope>(
  "ToolingEnvironmentScope",
)({
  projectId: ProjectId,
  environmentKey: ToolingEnvironmentKey,
}) {}

export class ToolingCollectionRevisionScope extends Schema.Class<ToolingCollectionRevisionScope>(
  "ToolingCollectionRevisionScope",
)({
  projectId: ProjectId,
  environmentKey: ToolingEnvironmentKey,
  collectionKey: CollectionApiKey,
  revisionId: SchemaRevisionId,
}) {}

export class ToolingProjectSummary extends Schema.Class<ToolingProjectSummary>(
  "ToolingProjectSummary",
)({
  id: ProjectId,
  key: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(63)),
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
}) {}

export class ToolingProjectPage extends Schema.Class<ToolingProjectPage>("ToolingProjectPage")({
  items: Schema.Array(ToolingProjectSummary).pipe(Schema.maxItems(toolingLimits.maximumPageSize)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ToolingEnvironmentSummary extends Schema.Class<ToolingEnvironmentSummary>(
  "ToolingEnvironmentSummary",
)({
  id: EnvironmentId,
  key: ToolingEnvironmentKey,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  primary: Schema.Boolean,
}) {}

export class ToolingEnvironmentPage extends Schema.Class<ToolingEnvironmentPage>(
  "ToolingEnvironmentPage",
)({
  projectId: ProjectId,
  items: Schema.Array(ToolingEnvironmentSummary).pipe(
    Schema.maxItems(toolingLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ToolingLocaleSummary extends Schema.Class<ToolingLocaleSummary>(
  "ToolingLocaleSummary",
)({
  id: ProjectLocaleId,
  tag: LocaleTag,
}) {}

export class ToolingCollectionSummary extends Schema.Class<ToolingCollectionSummary>(
  "ToolingCollectionSummary",
)({
  id: CollectionId,
  key: CollectionApiKey,
  revisionId: SchemaRevisionId,
  revisionSequence: SchemaRevisionSequence,
  contractHash: ContractHash,
}) {}

export class ToolingSchemaManifestPage extends Schema.Class<ToolingSchemaManifestPage>(
  "ToolingSchemaManifestPage",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  environmentKey: ToolingEnvironmentKey,
  locales: Schema.Array(ToolingLocaleSummary).pipe(Schema.maxItems(100)),
  localeContractHash: ContractHash,
  collections: Schema.Array(ToolingCollectionSummary).pipe(
    Schema.maxItems(toolingLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export interface ToolingJsonObject {
  readonly [key: string]: ToolingJsonValue;
}

export type ToolingJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<ToolingJsonValue>
  | ToolingJsonObject;

export const ToolingJsonValue: Schema.Schema<ToolingJsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.Boolean,
    Schema.Number,
    Schema.String,
    Schema.Array(ToolingJsonValue),
    Schema.Record({ key: Schema.String, value: ToolingJsonValue }),
  ),
).annotations({ identifier: "ToolingJsonValue" });

export const ToolingCollectionContract = Schema.Record({
  key: Schema.String,
  value: ToolingJsonValue,
});

export class ToolingCollectionContractRevision extends Schema.Class<ToolingCollectionContractRevision>(
  "ToolingCollectionContractRevision",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  environmentKey: ToolingEnvironmentKey,
  collectionId: CollectionId,
  collectionKey: CollectionApiKey,
  revisionId: SchemaRevisionId,
  revisionSequence: SchemaRevisionSequence,
  contractHash: ContractHash,
  publishedAt: IsoDateTime,
  contract: ToolingCollectionContract,
}) {}

export const ToolingProjectPageResponse = ApiSuccessSchema(ToolingProjectPage);
export const ToolingEnvironmentPageResponse = ApiSuccessSchema(ToolingEnvironmentPage);
export const ToolingSchemaManifestPageResponse = ApiSuccessSchema(ToolingSchemaManifestPage);
export const ToolingCollectionContractRevisionResponse = ApiSuccessSchema(
  ToolingCollectionContractRevision,
);
