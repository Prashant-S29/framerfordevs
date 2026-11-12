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

export const PublicJsonValue: Schema.Codec<PublicJsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Number.check(Schema.isFinite()),
    Schema.String,
    Schema.Array(PublicJsonValue),
    Schema.Record(Schema.String, PublicJsonValue),
  ]),
);
export const PublicJsonObject = Schema.Record(Schema.String, PublicJsonValue);

const Uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const IsoDateTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);
const Digest = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(/^[0-9a-f]{64}$/u),
);
const Cursor = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1_024),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
);

export class PublicApiError extends Schema.Class<PublicApiError>("PublicApiError")({
  code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  details: Schema.optionalKey(Schema.Array(PublicJsonObject).check(Schema.isMaxLength(50))),
  retryable: Schema.Boolean,
  requestId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
}) {}

export const PublicApiFailure = Schema.Struct({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: PublicApiError,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
});

export function PublicApiSuccess<A, I, R>(data: Schema.Codec<A, I, R>) {
  return Schema.Struct({
    ok: Schema.Literal(true),
    data,
    error: Schema.Null,
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  });
}

export function PublicApiEnvelope<A, I, R>(data: Schema.Codec<A, I, R>) {
  return Schema.Union([PublicApiSuccess(data), PublicApiFailure]);
}

export class DeliveryPublicationMetadata extends Schema.Class<DeliveryPublicationMetadata>(
  "DeliveryPublicationMetadata",
)({
  id: Uuid,
  sequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  schemaRevisionId: Uuid,
  publishedAt: IsoDateTime,
}) {}

export class DeliveryItem extends Schema.Class<DeliveryItem>("DeliveryItem")({
  id: Uuid,
  collectionId: Uuid,
  collection: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(63)),
  locale: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  publication: DeliveryPublicationMetadata,
  data: PublicJsonObject,
}) {}

export class DeliveryPageMetadata extends Schema.Class<DeliveryPageMetadata>(
  "DeliveryPageMetadata",
)({
  limit: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 })),
  nextCursor: Schema.NullOr(Cursor),
  hasMore: Schema.Boolean,
}) {}

export class DeliveryPage extends Schema.Class<DeliveryPage>("DeliveryPage")({
  items: Schema.Array(DeliveryItem).check(Schema.isMaxLength(50)),
  page: DeliveryPageMetadata,
}) {}

export class PreviewSource extends Schema.Class<PreviewSource>("PreviewSource")({
  version: Schema.Literal(1),
  schemaRevisionId: Uuid,
  contractHash: Digest,
  sharedRevisionId: Schema.NullOr(Uuid),
  sharedVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  localizedRevisionId: Schema.NullOr(Uuid),
  localizedVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  source: Schema.Literals(["current", "revision"]),
}) {}

export class PreviewValidationIssue extends Schema.Class<PreviewValidationIssue>(
  "PreviewValidationIssue",
)({
  fieldId: Schema.NullOr(Uuid),
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export class PreviewValidation extends Schema.Class<PreviewValidation>("PreviewValidation")({
  valid: Schema.Boolean,
  issues: Schema.Array(PreviewValidationIssue).check(Schema.isMaxLength(50)),
  capped: Schema.Boolean,
}) {}

export class PreviewItem extends Schema.Class<PreviewItem>("PreviewItem")({
  id: Uuid,
  collectionId: Uuid,
  collection: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(63)),
  locale: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
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
  schema: Schema.Codec<A, I, never>,
) {
  if (item.publication.schemaRevisionId !== revisionId) {
    return Effect.succeed({
      kind: "unrecognized_revision" as const,
      schemaRevisionId: item.publication.schemaRevisionId,
      data: item.data,
    });
  }
  return Effect.map(
    Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(item.data, {
      onExcessProperty: "error",
    }),
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
  schema: Schema.Codec<A, I, never>,
) {
  if (item.preview.schemaRevisionId !== revisionId) {
    return Effect.succeed({
      kind: "unrecognized_revision" as const,
      schemaRevisionId: item.preview.schemaRevisionId,
      data: item.data,
    });
  }
  return Effect.map(
    Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(item.data, {
      onExcessProperty: "error",
    }),
    (data) => ({
      kind: "recognized_contract" as const,
      schemaRevisionId: item.preview.schemaRevisionId,
      data,
    }),
  );
}

export function decodePublicEnvelope<A, I>(schema: Schema.Codec<A, I, never>, value: unknown) {
  return Schema.decodeUnknownEffect(PublicApiEnvelope(schema), { onExcessProperty: "error" })(
    value,
    {
      onExcessProperty: "error",
    },
  );
}

export function decodePublicEnvelopeSync<A, I>(schema: Schema.Codec<A, I, never>, value: unknown) {
  return Schema.decodeUnknownSync(PublicApiEnvelope(schema), { onExcessProperty: "error" })(value, {
    onExcessProperty: "error",
  });
}

export function decodePublicData<A, I>(schema: Schema.Codec<A, I, never>, value: unknown) {
  return Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(value, {
    onExcessProperty: "error",
  });
}
