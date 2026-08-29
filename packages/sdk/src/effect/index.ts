// Exports stable Effect v3 transport schemas and exact decode helpers for public v1 protocols.

import { Effect, Schema } from "effect";

export type PublicJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<PublicJsonValue>
  | PublicJsonObject;
export interface PublicJsonObject {
  readonly [key: string]: PublicJsonValue;
}

export const PublicJsonValue: Schema.Schema<PublicJsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.Boolean,
    Schema.Number.pipe(Schema.finite()),
    Schema.String,
    Schema.Array(PublicJsonValue),
    Schema.Record({ key: Schema.String, value: PublicJsonValue }),
  ),
);
export const PublicJsonObject = Schema.Record({ key: Schema.String, value: PublicJsonValue });

const Uuid = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const IsoDateTime = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);
const Digest = Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u));
const Cursor = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(1_024),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
);

export class PublicApiError extends Schema.Class<PublicApiError>("PublicApiError")({
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(Schema.Array(PublicJsonObject).pipe(Schema.maxItems(50)), {
    exact: true,
  }),
  retryable: Schema.Boolean,
  requestId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
}) {}

export const PublicApiFailure = Schema.Struct({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: PublicApiError,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
});

export function PublicApiSuccess<A, I, R>(data: Schema.Schema<A, I, R>) {
  return Schema.Struct({
    ok: Schema.Literal(true),
    data,
    error: Schema.Null,
    message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  });
}

export function PublicApiEnvelope<A, I, R>(data: Schema.Schema<A, I, R>) {
  return Schema.Union(PublicApiSuccess(data), PublicApiFailure);
}

export class DeliveryPublicationMetadata extends Schema.Class<DeliveryPublicationMetadata>(
  "DeliveryPublicationMetadata",
)({
  id: Uuid,
  sequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  schemaRevisionId: Uuid,
  publishedAt: IsoDateTime,
}) {}

export class DeliveryItem extends Schema.Class<DeliveryItem>("DeliveryItem")({
  id: Uuid,
  collectionId: Uuid,
  collection: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(63)),
  locale: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  publication: DeliveryPublicationMetadata,
  data: PublicJsonObject,
}) {}

export class DeliveryPageMetadata extends Schema.Class<DeliveryPageMetadata>(
  "DeliveryPageMetadata",
)({
  limit: Schema.Number.pipe(Schema.int(), Schema.between(1, 50)),
  nextCursor: Schema.NullOr(Cursor),
  hasMore: Schema.Boolean,
}) {}

export class DeliveryPage extends Schema.Class<DeliveryPage>("DeliveryPage")({
  items: Schema.Array(DeliveryItem).pipe(Schema.maxItems(50)),
  page: DeliveryPageMetadata,
}) {}

export class PreviewSource extends Schema.Class<PreviewSource>("PreviewSource")({
  version: Schema.Literal(1),
  schemaRevisionId: Uuid,
  contractHash: Digest,
  sharedRevisionId: Schema.NullOr(Uuid),
  sharedVersion: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  localizedRevisionId: Schema.NullOr(Uuid),
  localizedVersion: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  source: Schema.Literal("current", "revision"),
}) {}

export class PreviewValidationIssue extends Schema.Class<PreviewValidationIssue>(
  "PreviewValidationIssue",
)({
  fieldId: Schema.NullOr(Uuid),
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export class PreviewValidation extends Schema.Class<PreviewValidation>("PreviewValidation")({
  valid: Schema.Boolean,
  issues: Schema.Array(PreviewValidationIssue).pipe(Schema.maxItems(50)),
  capped: Schema.Boolean,
}) {}

export class PreviewItem extends Schema.Class<PreviewItem>("PreviewItem")({
  id: Uuid,
  collectionId: Uuid,
  collection: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(63)),
  locale: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  preview: PreviewSource,
  data: PublicJsonObject,
  validation: PreviewValidation,
}) {}

export type RecognizedContract<T> =
  | {
      readonly kind: "recognized_contract";
      readonly schemaRevisionId: string;
      readonly data: T;
    }
  | {
      readonly kind: "unrecognized_revision";
      readonly schemaRevisionId: string;
      readonly data: PublicJsonObject;
    };

export function recognizeDeliveryContract<A, I>(
  item: DeliveryItem,
  revisionId: string,
  schema: Schema.Schema<A, I, never>,
) {
  if (item.publication.schemaRevisionId !== revisionId) {
    return Effect.succeed({
      kind: "unrecognized_revision" as const,
      schemaRevisionId: item.publication.schemaRevisionId,
      data: item.data,
    });
  }
  return Effect.map(
    Schema.decodeUnknown(schema)(item.data, { onExcessProperty: "error" }),
    (data) => ({
      kind: "recognized_contract" as const,
      schemaRevisionId: item.publication.schemaRevisionId,
      data,
    }),
  );
}

export function recognizePreviewContract<A, I>(
  item: PreviewItem,
  revisionId: string,
  schema: Schema.Schema<A, I, never>,
) {
  if (item.preview.schemaRevisionId !== revisionId) {
    return Effect.succeed({
      kind: "unrecognized_revision" as const,
      schemaRevisionId: item.preview.schemaRevisionId,
      data: item.data,
    });
  }
  return Effect.map(
    Schema.decodeUnknown(schema)(item.data, { onExcessProperty: "error" }),
    (data) => ({
      kind: "recognized_contract" as const,
      schemaRevisionId: item.preview.schemaRevisionId,
      data,
    }),
  );
}

export function decodePublicEnvelope<A, I>(schema: Schema.Schema<A, I, never>, value: unknown) {
  return Schema.decodeUnknown(PublicApiEnvelope(schema))(value, {
    onExcessProperty: "error",
  });
}

export function decodePublicEnvelopeSync<A, I>(schema: Schema.Schema<A, I, never>, value: unknown) {
  return Schema.decodeUnknownSync(PublicApiEnvelope(schema))(value, {
    onExcessProperty: "error",
  });
}

export function decodePublicData<A, I>(schema: Schema.Schema<A, I, never>, value: unknown) {
  return Schema.decodeUnknown(schema)(value, { onExcessProperty: "error" });
}
