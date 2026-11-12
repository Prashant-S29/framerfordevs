import { Schema } from "effect";

import { ApiErrorDetail, ApiSuccessSchema, RequestIdSchema } from "../response/api";
import { LocaleTag, ProjectLocaleId } from "../locale";
import { Cursor, EnvironmentId, IsoDateTime, ProjectId } from "../platform";
import {
  CollectionApiKey,
  CollectionId,
  ContractHash,
  SchemaRevisionId,
  SchemaRevisionSequence,
} from "../schema";

export const toolingLimits = {
  queryBytes: 4_096,
  defaultPageSize: 20,
  maximumPageSize: 50,
  responseBytes: 1_572_864,
  maximumContractDepth: 24,
} as const;

export const ToolingEnvironmentKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9-]{0,62}$/u),
  Schema.makeFilter((value) => !value.includes("--") && !value.endsWith("-")),
);

export const ToolingApiErrorCode = Schema.Literals([
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
]);

export class ToolingApiError extends Schema.Class<ToolingApiError>("ToolingApiError")({
  code: ToolingApiErrorCode,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  details: Schema.optionalKey(
    Schema.Array(ApiErrorDetail).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class ToolingApiFailure extends Schema.Class<ToolingApiFailure>("ToolingApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: ToolingApiError,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

const ToolingCursorInput = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2_048),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
);

export class ToolingPageQuery extends Schema.Class<ToolingPageQuery>("ToolingPageQuery")({
  limit: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: 1, maximum: toolingLimits.maximumPageSize }),
  ),
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
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(63)),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
}) {}

export class ToolingProjectPage extends Schema.Class<ToolingProjectPage>("ToolingProjectPage")({
  items: Schema.Array(ToolingProjectSummary).check(
    Schema.isMaxLength(toolingLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ToolingEnvironmentSummary extends Schema.Class<ToolingEnvironmentSummary>(
  "ToolingEnvironmentSummary",
)({
  id: EnvironmentId,
  key: ToolingEnvironmentKey,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  primary: Schema.Boolean,
}) {}

export class ToolingEnvironmentPage extends Schema.Class<ToolingEnvironmentPage>(
  "ToolingEnvironmentPage",
)({
  projectId: ProjectId,
  items: Schema.Array(ToolingEnvironmentSummary).check(
    Schema.isMaxLength(toolingLimits.maximumPageSize),
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
  locales: Schema.Array(ToolingLocaleSummary).check(Schema.isMaxLength(100)),
  localeContractHash: ContractHash,
  collections: Schema.Array(ToolingCollectionSummary).check(
    Schema.isMaxLength(toolingLimits.maximumPageSize),
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

export const ToolingJsonValue: Schema.Codec<ToolingJsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Number,
    Schema.String,
    Schema.Array(ToolingJsonValue),
    Schema.Record(Schema.String, ToolingJsonValue),
  ]),
).annotate({ identifier: "ToolingJsonValue" });

export const ToolingCollectionContract = Schema.Record(Schema.String, ToolingJsonValue);

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
