import { Schema } from "effect";

import { ApiErrorDetail, ApiSuccessSchema, RequestIdSchema } from "../response/api";
import { EntryId } from "../entry";
import { LocaleTag, ProjectLocaleId } from "../locale";
import { ApiCredentialId } from "../access";
import { AuthUserId, EnvironmentId, IsoDateTime, ProjectId, ResourceVersion } from "../platform";
import { EntryPublicationId, EntryPublicationSequence } from "../publication";
import { CollectionApiKey, CollectionFieldId, CollectionId, SchemaRevisionId } from "../schema";

export const DeliveryAccess = Schema.Literals(["protected", "public"]);
export type DeliveryAccess = typeof DeliveryAccess.Type;

export const DeliveryApiErrorCode = Schema.Literals([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "LOCALE_UNAVAILABLE",
  "DELIVERY_QUERY_INVALID",
  "DELIVERY_CURSOR_INVALID",
  "DELIVERY_CURSOR_STALE",
  "DELIVERY_RESPONSE_TOO_LARGE",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export class DeliveryApiError extends Schema.Class<DeliveryApiError>("DeliveryApiError")({
  code: DeliveryApiErrorCode,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  details: Schema.optionalKey(
    Schema.Array(ApiErrorDetail).check(Schema.isMinLength(1), Schema.isMaxLength(50)),
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class DeliveryApiFailure extends Schema.Class<DeliveryApiFailure>("DeliveryApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: DeliveryApiError,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export const DeliveryQueryScalarKind = Schema.Literals([
  "short_text",
  "slug",
  "email",
  "enum",
  "number",
  "decimal",
  "boolean",
  "date",
  "date_time",
  "reference",
]);
export type DeliveryQueryScalarKind = typeof DeliveryQueryScalarKind.Type;

export const DeliveryFilterOperator = Schema.Literals(["eq", "ne", "gt", "gte", "lt", "lte"]);
export type DeliveryFilterOperator = typeof DeliveryFilterOperator.Type;

export const DeliverySortDirection = Schema.Literals(["asc", "desc"]);
export type DeliverySortDirection = typeof DeliverySortDirection.Type;

export class DeliveryFieldCapability extends Schema.Class<DeliveryFieldCapability>(
  "DeliveryFieldCapability",
)({
  fieldId: CollectionFieldId,
  fieldKey: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(63),
    Schema.isPattern(/^[a-z][a-z0-9_]{0,62}$/u),
  ),
  kind: DeliveryQueryScalarKind,
  filterable: Schema.Boolean,
  sortable: Schema.Boolean,
  uniqueLookup: Schema.Boolean,
}) {}

export const DeliveryFieldCapabilities = Schema.Array(DeliveryFieldCapability).check(
  Schema.isMaxLength(100),
  Schema.makeFilter(
    (fields) =>
      new Set(fields.map((field) => field.fieldId)).size === fields.length &&
      new Set(fields.map((field) => field.fieldKey)).size === fields.length &&
      fields.every(
        (field) =>
          (field.filterable || field.sortable || field.uniqueLookup) &&
          (!field.uniqueLookup || field.filterable),
      ),
    { message: "Delivery capabilities must be unique, enabled, and internally valid." },
  ),
);

export class DeliveryCollectionConfiguration extends Schema.Class<DeliveryCollectionConfiguration>(
  "DeliveryCollectionConfiguration",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  collectionKey: CollectionApiKey,
  access: DeliveryAccess,
  version: ResourceVersion,
  fields: DeliveryFieldCapabilities,
  updatedByUserId: Schema.NullOr(AuthUserId),
  updatedByCredentialId: Schema.NullOr(ApiCredentialId),
  updatedAt: IsoDateTime,
}) {}

export class GetDeliveryConfigurationInput extends Schema.Class<GetDeliveryConfigurationInput>(
  "GetDeliveryConfigurationInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
}) {}

export class UpdateDeliveryConfigurationInput extends Schema.Class<UpdateDeliveryConfigurationInput>(
  "UpdateDeliveryConfigurationInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  expectedVersion: ResourceVersion,
  access: DeliveryAccess,
  publicAccessAcknowledged: Schema.Boolean,
  fields: DeliveryFieldCapabilities,
}) {}

export class DeliveryPublicationMetadata extends Schema.Class<DeliveryPublicationMetadata>(
  "DeliveryPublicationMetadata",
)({
  id: EntryPublicationId,
  sequence: EntryPublicationSequence,
  schemaRevisionId: SchemaRevisionId,
  publishedAt: IsoDateTime,
}) {}

const DeliveryData = Schema.Record(Schema.String, Schema.Unknown);

export class DeliveryItem extends Schema.Class<DeliveryItem>("DeliveryItem")({
  id: EntryId,
  collectionId: CollectionId,
  collection: CollectionApiKey,
  locale: LocaleTag,
  publication: DeliveryPublicationMetadata,
  data: DeliveryData,
}) {}

export class DeliveryPageMetadata extends Schema.Class<DeliveryPageMetadata>(
  "DeliveryPageMetadata",
)({
  limit: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 })),
  nextCursor: Schema.NullOr(
    Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(1_024),
      Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
    ),
  ),
  hasMore: Schema.Boolean,
}) {}

export class DeliveryPage extends Schema.Class<DeliveryPage>("DeliveryPage")({
  items: Schema.Array(DeliveryItem).check(Schema.isMaxLength(50)),
  page: DeliveryPageMetadata,
}) {}

export class AnonymousDeliveryPrincipal extends Schema.Class<AnonymousDeliveryPrincipal>(
  "AnonymousDeliveryPrincipal",
)({
  kind: Schema.Literal("anonymous"),
  credentialId: Schema.Null,
}) {}

export class CredentialDeliveryPrincipal extends Schema.Class<CredentialDeliveryPrincipal>(
  "CredentialDeliveryPrincipal",
)({
  kind: Schema.Literal("credential"),
  credentialId: ApiCredentialId,
}) {}

export const DeliveryAccessPrincipal = Schema.Union([
  AnonymousDeliveryPrincipal,
  CredentialDeliveryPrincipal,
]);
export type DeliveryAccessPrincipal = typeof DeliveryAccessPrincipal.Type;

export class DeliveryResolvedScope extends Schema.Class<DeliveryResolvedScope>(
  "DeliveryResolvedScope",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  collectionKey: CollectionApiKey,
  localeId: ProjectLocaleId,
  locale: LocaleTag,
}) {}

export const GetDeliveryConfigurationInputSchema = Schema.toStandardSchemaV1(
  GetDeliveryConfigurationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const UpdateDeliveryConfigurationInputSchema = Schema.toStandardSchemaV1(
  UpdateDeliveryConfigurationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const DeliveryConfigurationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(DeliveryCollectionConfiguration),
);
