import { Schema } from "effect";

import { ProjectActor } from "../access";
import { ApiErrorDetail, RequestIdSchema } from "../response/api";
import { EnvironmentId, ProjectId } from "../platform";
import {
  CollectionApiKey,
  CollectionFieldApiKey,
  CollectionFieldId,
  CollectionId,
  ContractHash,
  SchemaChangeId,
  SchemaRevisionId,
} from "../schema";

import { Uuid } from "../uuid";
const digestPattern = /^[0-9a-f]{64}$/u;
const sourceKeyPattern = /^[a-z][a-z0-9_-]{0,62}$/u;
const reservedSourceKeys = new Set([
  "id",
  "entry_id",
  "collection_id",
  "locale",
  "schema_revision",
  "publication_id",
  "publication_sequence",
  "created_at",
  "updated_at",
  "published_at",
  "_meta",
  "__proto__",
  "prototype",
  "constructor",
]);

const SourceKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(sourceKeyPattern),
  Schema.makeFilter(
    (value) =>
      !value.includes("--") &&
      !value.includes("__") &&
      !value.endsWith("-") &&
      !value.endsWith("_") &&
      !reservedSourceKeys.has(value),
    { message: "Use a canonical, non-reserved source key." },
  ),
);

export const CollectionSourceKey = SourceKey.pipe(Schema.brand("CollectionSourceKey"));
export type CollectionSourceKey = typeof CollectionSourceKey.Type;

export const FieldSourceKey = SourceKey.pipe(Schema.brand("FieldSourceKey"));
export type FieldSourceKey = typeof FieldSourceKey.Type;

export const EnumOptionSourceKey = SourceKey.pipe(Schema.brand("EnumOptionSourceKey"));
export type EnumOptionSourceKey = typeof EnumOptionSourceKey.Type;

export const StructureHash = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(digestPattern),
).pipe(Schema.brand("StructureHash"));
export type StructureHash = typeof StructureHash.Type;

export const ProjectStructureManifestHash = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(digestPattern),
).pipe(Schema.brand("ProjectStructureManifestHash"));
export type ProjectStructureManifestHash = typeof ProjectStructureManifestHash.Type;

export const SchemaPlanHash = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(digestPattern),
).pipe(Schema.brand("SchemaPlanHash"));
export type SchemaPlanHash = typeof SchemaPlanHash.Type;

export const SchemaApplyCommandId = Uuid.pipe(Schema.brand("SchemaApplyCommandId"));
export type SchemaApplyCommandId = typeof SchemaApplyCommandId.Type;

export const SchemaApplyFingerprint = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(digestPattern),
).pipe(Schema.brand("SchemaApplyFingerprint"));
export type SchemaApplyFingerprint = typeof SchemaApplyFingerprint.Type;

export const CmsActor = ProjectActor.annotate({ identifier: "CmsActor" });
export type CmsActor = typeof CmsActor.Type;

export class CollectionSourceIdentity extends Schema.Class<CollectionSourceIdentity>(
  "CollectionSourceIdentity",
)({
  sourceKey: CollectionSourceKey,
  collectionId: CollectionId,
  apiKey: CollectionApiKey,
  revisionId: SchemaRevisionId,
  structureHash: StructureHash,
  contractHash: ContractHash,
}) {}

export class FieldSourceIdentity extends Schema.Class<FieldSourceIdentity>("FieldSourceIdentity")({
  collectionSourceKey: CollectionSourceKey,
  sourceKey: FieldSourceKey,
  fieldId: CollectionFieldId,
  parentFieldId: Schema.NullOr(CollectionFieldId),
  apiKey: Schema.NullOr(CollectionFieldApiKey),
}) {}

export class AuthoringProjectScope extends Schema.Class<AuthoringProjectScope>(
  "AuthoringProjectScope",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
}) {}

export const AuthoringMutationScope = Schema.Literals(["shared", "localized"]);
export type AuthoringMutationScope = typeof AuthoringMutationScope.Type;

export const AuthoringValuePath = Schema.Array(CollectionFieldApiKey).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16),
);
export type AuthoringValuePath = typeof AuthoringValuePath.Type;

export interface AuthoringJsonObject {
  readonly [key: string]: AuthoringJsonValue;
}
export type AuthoringJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<AuthoringJsonValue>
  | AuthoringJsonObject;

export const AuthoringJsonValue: Schema.Codec<AuthoringJsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Number.check(Schema.isFinite()),
    Schema.String,
    Schema.Array(AuthoringJsonValue),
    Schema.Record(Schema.String, AuthoringJsonValue),
  ]),
).annotate({ identifier: "AuthoringJsonValue" });

export class SetAuthoringValueMutation extends Schema.Class<SetAuthoringValueMutation>(
  "SetAuthoringValueMutation",
)({
  operation: Schema.Literal("set"),
  scope: AuthoringMutationScope,
  path: AuthoringValuePath,
  value: AuthoringJsonValue,
}) {}

export class UnsetAuthoringValueMutation extends Schema.Class<UnsetAuthoringValueMutation>(
  "UnsetAuthoringValueMutation",
)({
  operation: Schema.Literal("unset"),
  scope: AuthoringMutationScope,
  path: AuthoringValuePath,
}) {}

export const AuthoringValueMutation = Schema.Union([
  SetAuthoringValueMutation,
  UnsetAuthoringValueMutation,
]).annotate({ identifier: "AuthoringValueMutation" });
export type AuthoringValueMutation = typeof AuthoringValueMutation.Type;

export const authoringLimits = {
  requestBytes: 1_048_576,
  responseBytes: 4_194_304,
  mutationCount: 500,
  mutationValueDepth: 24,
  errorDetails: 50,
} as const;

export const AuthoringValueMutations = Schema.Array(AuthoringValueMutation).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(authoringLimits.mutationCount),
);
export type AuthoringValueMutations = typeof AuthoringValueMutations.Type;

export const AuthoringApiErrorCode = Schema.Literals([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CMS_CAPABILITY_REQUIRED",
  "PUBLISHED_SCHEMA_REQUIRED",
  "STALE_SCHEMA",
  "DRAFT_CONFLICT",
  "PUBLICATION_CONFLICT",
  "PUBLICATION_INVALID",
  "COMMAND_CONFLICT",
  "REVISION_INCOMPATIBLE",
  "RISKY_ACKNOWLEDGEMENT_REQUIRED",
  "SOURCE_IDENTITY_CONFLICT",
  "REQUEST_TOO_LARGE",
  "RESPONSE_TOO_LARGE",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type AuthoringApiErrorCode = typeof AuthoringApiErrorCode.Type;

export class AuthoringApiError extends Schema.Class<AuthoringApiError>("AuthoringApiError")({
  code: AuthoringApiErrorCode,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  details: Schema.optionalKey(
    Schema.Array(ApiErrorDetail).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(authoringLimits.errorDetails),
    ),
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class AuthoringApiFailure extends Schema.Class<AuthoringApiFailure>("AuthoringApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: AuthoringApiError,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export class AuthoringSchemaAuthority extends Schema.Class<AuthoringSchemaAuthority>(
  "AuthoringSchemaAuthority",
)({
  projectManifestHash: ProjectStructureManifestHash,
  revisionIds: Schema.Record(CollectionSourceKey, SchemaRevisionId),
}) {}

export class AuthoringSchemaPlanAuthority extends Schema.Class<AuthoringSchemaPlanAuthority>(
  "AuthoringSchemaPlanAuthority",
)({
  current: AuthoringSchemaAuthority,
  planHash: SchemaPlanHash,
  acknowledgedChangeIds: Schema.Array(SchemaChangeId).check(Schema.isMaxLength(701)),
}) {}
