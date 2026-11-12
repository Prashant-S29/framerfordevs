// Defines M10 Preview source authority, renderer-neutral documents, validation feedback, and public errors.

import { Schema } from "effect";

import { ApiErrorDetail, ApiSuccessSchema, RequestIdSchema } from "../response/api";
import { EntryId, EntryRevisionId } from "../entry";
import { LocaleTag } from "../locale";
import { EnvironmentId, ProjectId } from "../platform";
import {
  CollectionApiKey,
  CollectionFieldId,
  CollectionId,
  ContractHash,
  SchemaRevisionId,
} from "../schema";

import * as SchemaStrict from "../../lib/schema-strict";
export const previewLimits = {
  queryBytes: 4_096,
  responseBytes: 2_621_440,
  issues: 50,
} as const;

export const PreviewRevisionSelector = Schema.Union([Schema.Literal("none"), EntryRevisionId]);
export type PreviewRevisionSelector = typeof PreviewRevisionSelector.Type;

const PreviewSourceFields = {
  version: Schema.Literal(1),
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  sharedVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
};

export class CurrentPreviewSource extends Schema.Class<CurrentPreviewSource>(
  "CurrentPreviewSource",
)({
  ...PreviewSourceFields,
  source: Schema.Literal("current"),
}) {}

export class RevisionPreviewSource extends Schema.Class<RevisionPreviewSource>(
  "RevisionPreviewSource",
)({
  ...PreviewSourceFields,
  source: Schema.Literal("revision"),
}) {}

export const PreviewSource = Schema.Union([CurrentPreviewSource, RevisionPreviewSource]);
export type PreviewSource = typeof PreviewSource.Type;

export class PreviewValidationIssue extends Schema.Class<PreviewValidationIssue>(
  "PreviewValidationIssue",
)({
  fieldId: Schema.NullOr(CollectionFieldId),
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  code: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
    Schema.isPattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export class PreviewValidation extends Schema.Class<PreviewValidation>("PreviewValidation")({
  valid: Schema.Boolean,
  issues: Schema.Array(PreviewValidationIssue).check(Schema.isMaxLength(previewLimits.issues)),
  capped: Schema.Boolean,
}) {}

const PreviewData = Schema.Record(Schema.String, Schema.Unknown);

export class PreviewItem extends Schema.Class<PreviewItem>("PreviewItem")({
  id: EntryId,
  collectionId: CollectionId,
  collection: CollectionApiKey,
  locale: LocaleTag,
  preview: PreviewSource,
  data: PreviewData,
  validation: PreviewValidation,
}) {}

const PreviewRouteScopeFields = {
  projectId: ProjectId,
  environmentKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(63),
    Schema.isPattern(/^[a-z][a-z0-9-]{0,62}$/u),
    Schema.makeFilter((value) => !value.includes("--") && !value.endsWith("-")),
  ),
  collectionKey: CollectionApiKey,
  entryId: EntryId,
  locale: LocaleTag,
};

export class PreviewRouteScope extends Schema.Class<PreviewRouteScope>("PreviewRouteScope")({
  ...PreviewRouteScopeFields,
}) {}

export class GetRevisionCredentialPreviewInput extends Schema.Class<GetRevisionCredentialPreviewInput>(
  "GetRevisionCredentialPreviewInput",
)({
  ...PreviewRouteScopeFields,
  schemaRevisionId: SchemaRevisionId,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
}) {}

const UserPreviewScopeFields = {
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  entryId: EntryId,
  locale: LocaleTag,
};

export class GetCurrentUserPreviewInput extends Schema.Class<GetCurrentUserPreviewInput>(
  "GetCurrentUserPreviewInput",
)({
  ...UserPreviewScopeFields,
}) {}

export class GetRevisionUserPreviewInput extends Schema.Class<GetRevisionUserPreviewInput>(
  "GetRevisionUserPreviewInput",
)({
  ...UserPreviewScopeFields,
  schemaRevisionId: SchemaRevisionId,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
}) {}

export const PreviewApiErrorCode = Schema.Literals([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "LOCALE_UNAVAILABLE",
  "PUBLISHED_SCHEMA_REQUIRED",
  "PREVIEW_QUERY_INVALID",
  "PREVIEW_REVISION_INCOMPATIBLE",
  "PREVIEW_RESPONSE_TOO_LARGE",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export class PreviewApiError extends Schema.Class<PreviewApiError>("PreviewApiError")({
  code: PreviewApiErrorCode,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  details: Schema.optionalKey(
    Schema.Array(ApiErrorDetail).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class PreviewApiFailure extends Schema.Class<PreviewApiFailure>("PreviewApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: PreviewApiError,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export const PreviewRouteScopeInputSchema = SchemaStrict.toStandardSchemaV1(PreviewRouteScope);
export const GetRevisionCredentialPreviewInputSchema = SchemaStrict.toStandardSchemaV1(
  GetRevisionCredentialPreviewInput,
);
export const GetCurrentUserPreviewInputSchema = SchemaStrict.toStandardSchemaV1(
  GetCurrentUserPreviewInput,
);
export const GetRevisionUserPreviewInputSchema = SchemaStrict.toStandardSchemaV1(
  GetRevisionUserPreviewInput,
);
export const PreviewItemOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(PreviewItem),
);
