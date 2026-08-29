// Defines M9 Delivery response metadata, query capabilities, and management configuration contracts.

import { Schema } from "effect";

import { ApiErrorDetail, ApiSuccessSchema, RequestIdSchema } from "./api-response";
import { EntryId } from "./entries";
import { LocaleTag, ProjectLocaleId } from "./locales";
import { ApiCredentialId } from "./access";
import { AuthUserId, EnvironmentId, IsoDateTime, ProjectId, ResourceVersion } from "./platform";
import { EntryPublicationId, EntryPublicationSequence } from "./publications";
import { CollectionApiKey, CollectionFieldId, CollectionId, SchemaRevisionId } from "./schemas";

export const DeliveryAccess = Schema.Literal("protected", "public");
export type DeliveryAccess = typeof DeliveryAccess.Type;

export const DeliveryApiErrorCode = Schema.Literal(
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
);

export class DeliveryApiError extends Schema.Class<DeliveryApiError>("DeliveryApiError")({
  code: DeliveryApiErrorCode,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(
    Schema.Array(ApiErrorDetail).pipe(Schema.minItems(1), Schema.maxItems(50)),
    {
      exact: true,
    },
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class DeliveryApiFailure extends Schema.Class<DeliveryApiFailure>("DeliveryApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: DeliveryApiError,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export const DeliveryQueryScalarKind = Schema.Literal(
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
);
export type DeliveryQueryScalarKind = typeof DeliveryQueryScalarKind.Type;

export const DeliveryFilterOperator = Schema.Literal("eq", "ne", "gt", "gte", "lt", "lte");
export type DeliveryFilterOperator = typeof DeliveryFilterOperator.Type;

export const DeliverySortDirection = Schema.Literal("asc", "desc");
export type DeliverySortDirection = typeof DeliverySortDirection.Type;

export class DeliveryFieldCapability extends Schema.Class<DeliveryFieldCapability>(
  "DeliveryFieldCapability",
)({
  fieldId: CollectionFieldId,
  fieldKey: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(63),
    Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
  ),
  kind: DeliveryQueryScalarKind,
  filterable: Schema.Boolean,
  sortable: Schema.Boolean,
  uniqueLookup: Schema.Boolean,
}) {}

export const DeliveryFieldCapabilities = Schema.Array(DeliveryFieldCapability).pipe(
  Schema.maxItems(100),
  Schema.filter(
    (fields) =>
      new Set(fields.map((field) => field.fieldId)).size === fields.length &&
      new Set(fields.map((field) => field.fieldKey)).size === fields.length &&
      fields.every(
        (field) =>
          (field.filterable || field.sortable || field.uniqueLookup) &&
          (!field.uniqueLookup || field.filterable),
      ),
    { message: () => "Delivery capabilities must be unique, enabled, and internally valid." },
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

const DeliveryData = Schema.Record({ key: Schema.String, value: Schema.Unknown });

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
  limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 50)),
  nextCursor: Schema.NullOr(
    Schema.String.pipe(
      Schema.minLength(1),
      Schema.maxLength(1_024),
      Schema.pattern(/^[A-Za-z0-9_-]+$/u),
    ),
  ),
  hasMore: Schema.Boolean,
}) {}

export class DeliveryPage extends Schema.Class<DeliveryPage>("DeliveryPage")({
  items: Schema.Array(DeliveryItem).pipe(Schema.maxItems(50)),
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

export const DeliveryAccessPrincipal = Schema.Union(
  AnonymousDeliveryPrincipal,
  CredentialDeliveryPrincipal,
);
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

export const GetDeliveryConfigurationInputSchema = Schema.standardSchemaV1(
  GetDeliveryConfigurationInput,
);
export const UpdateDeliveryConfigurationInputSchema = Schema.standardSchemaV1(
  UpdateDeliveryConfigurationInput,
);
export const DeliveryConfigurationOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(DeliveryCollectionConfiguration),
);
