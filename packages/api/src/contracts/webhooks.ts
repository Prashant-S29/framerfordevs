// Defines M11 publication-event, webhook-management, invalidation, delivery, and replay contracts.

import { Schema } from "effect";

import { ApiSuccessSchema } from "./api-response";
import { EntryCommandId, EntryId } from "./entries";
import { LocaleTag, ProjectLocaleId } from "./locales";
import {
  AuthUserId,
  Cursor,
  EnvironmentId,
  IsoDateTime,
  PageLimit,
  ProjectId,
  ResourceVersion,
} from "./platform";
import { EntryPublicationId, EntryPublicationSequence } from "./publications";
import {
  CollectionFieldId,
  CollectionId,
  ContractHash,
  SchemaHash,
  SchemaRevisionId,
} from "./schemas";

const semanticTagPattern = /^[a-z][a-z0-9_-]{0,31}:[a-z0-9][a-z0-9._/-]{0,31}$/u;
const reservedTagNamespaces = new Set([
  "project",
  "environment",
  "collection",
  "entry",
  "locale",
  "field",
]);

const NormalizedString = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value) => value.trim().normalize("NFC"),
    encode: (value) => value,
  }),
);

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

function isSafeWebhookDestination(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.hash === "" &&
      url.hostname.length > 0 &&
      !hasControlCharacter(value) &&
      new TextEncoder().encode(value).byteLength <= 2_048
    );
  } catch {
    return false;
  }
}

function isSafeRoutePath(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("*") ||
    value.includes("\\") ||
    /%(?:2e|2f|5c|3f|23)/iu.test(value) ||
    /%(?![0-9a-f]{2})/iu.test(value) ||
    hasControlCharacter(value) ||
    new TextEncoder().encode(value).byteLength > 512
  ) {
    return false;
  }
  return !value.split("/").some((segment) => segment === "." || segment === "..");
}

export const webhookPublicEventTypeValues = [
  "cms.schema.published",
  "cms.entry.published",
  "cms.entry.unpublished",
] as const;

export const WebhookPublicEventType = Schema.Literal(...webhookPublicEventTypeValues);
export type WebhookPublicEventType = typeof WebhookPublicEventType.Type;

export const WebhookEndpointId = Schema.UUID.pipe(Schema.brand("WebhookEndpointId"));
export type WebhookEndpointId = typeof WebhookEndpointId.Type;

export const WebhookDestinationId = Schema.UUID.pipe(Schema.brand("WebhookDestinationId"));
export type WebhookDestinationId = typeof WebhookDestinationId.Type;

export const WebhookSecretId = Schema.UUID.pipe(Schema.brand("WebhookSecretId"));
export type WebhookSecretId = typeof WebhookSecretId.Type;

export const WebhookEventId = Schema.UUID.pipe(Schema.brand("WebhookEventId"));
export type WebhookEventId = typeof WebhookEventId.Type;

export const WebhookDeliveryId = Schema.UUID.pipe(Schema.brand("WebhookDeliveryId"));
export type WebhookDeliveryId = typeof WebhookDeliveryId.Type;

export const WebhookAttemptId = Schema.UUID.pipe(Schema.brand("WebhookAttemptId"));
export type WebhookAttemptId = typeof WebhookAttemptId.Type;

export const InvalidationRouteMappingId = Schema.UUID.pipe(
  Schema.brand("InvalidationRouteMappingId"),
);
export type InvalidationRouteMappingId = typeof InvalidationRouteMappingId.Type;

export const WebhookEndpointName = NormalizedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(100),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Webhook endpoint names cannot contain control characters.",
  }),
  Schema.brand("WebhookEndpointName"),
);
export type WebhookEndpointName = typeof WebhookEndpointName.Type;

export const WebhookDestinationUrl = NormalizedString.pipe(
  Schema.minLength(9),
  Schema.maxLength(2_048),
  Schema.filter(isSafeWebhookDestination, {
    message: () => "Webhook destinations must be canonical HTTPS URLs on port 443.",
  }),
  Schema.brand("WebhookDestinationUrl"),
);
export type WebhookDestinationUrl = typeof WebhookDestinationUrl.Type;

export const WebhookDisplayOrigin = Schema.String.pipe(
  Schema.minLength(9),
  Schema.maxLength(255),
  Schema.pattern(/^https:\/\/[^/?#\s]+$/u),
  Schema.brand("WebhookDisplayOrigin"),
);
export type WebhookDisplayOrigin = typeof WebhookDisplayOrigin.Type;

export const WebhookSecret = Schema.String.pipe(
  Schema.length(49),
  Schema.pattern(/^whsec_[A-Za-z0-9_-]{43}$/u),
  Schema.brand("WebhookSecret"),
);
export type WebhookSecret = typeof WebhookSecret.Type;

export const WebhookEndpointState = Schema.Literal("enabled", "disabled");
export type WebhookEndpointState = typeof WebhookEndpointState.Type;

export const WebhookSecretState = Schema.Literal(
  "pending",
  "active",
  "retiring",
  "retired",
  "canceled",
);
export type WebhookSecretState = typeof WebhookSecretState.Type;

export const WebhookDeliveryKind = Schema.Literal("initial", "replay");
export type WebhookDeliveryKind = typeof WebhookDeliveryKind.Type;

export const WebhookDeliveryStatus = Schema.Literal(
  "queued",
  "delivering",
  "retry_scheduled",
  "succeeded",
  "dead_letter",
  "canceled",
);
export type WebhookDeliveryStatus = typeof WebhookDeliveryStatus.Type;

export const WebhookAttemptState = Schema.Literal(
  "started",
  "succeeded",
  "retry_scheduled",
  "dead_letter",
  "abandoned",
  "canceled",
);
export type WebhookAttemptState = typeof WebhookAttemptState.Type;

export const WebhookEventTypes = Schema.Array(WebhookPublicEventType).pipe(
  Schema.minItems(1),
  Schema.maxItems(3),
  Schema.filter((values) => new Set(values).size === values.length, {
    message: () => "Webhook event subscriptions must be unique.",
  }),
);
export type WebhookEventTypes = typeof WebhookEventTypes.Type;

export const InvalidationRoutePath = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(512),
  Schema.filter(isSafeRoutePath, {
    message: () => "Invalidation routes must be exact safe origin-relative paths.",
  }),
  Schema.brand("InvalidationRoutePath"),
);
export type InvalidationRoutePath = typeof InvalidationRoutePath.Type;

export const SemanticInvalidationTag = NormalizedString.pipe(
  Schema.minLength(3),
  Schema.maxLength(64),
  Schema.pattern(semanticTagPattern),
  Schema.filter((value) => !reservedTagNamespaces.has(value.split(":", 1)[0] ?? ""), {
    message: () => "Semantic invalidation tags cannot use a system namespace.",
  }),
  Schema.brand("SemanticInvalidationTag"),
);
export type SemanticInvalidationTag = typeof SemanticInvalidationTag.Type;

export const SemanticInvalidationTags = Schema.Array(SemanticInvalidationTag).pipe(
  Schema.maxItems(10),
  Schema.filter((values) => new Set(values).size === values.length, {
    message: () => "Semantic invalidation tags must be unique.",
  }),
);
export type SemanticInvalidationTags = typeof SemanticInvalidationTags.Type;

export const SystemInvalidationTag = Schema.String.pipe(
  Schema.minLength(38),
  Schema.maxLength(64),
  Schema.pattern(/^(?:project|environment|collection|entry|locale|field):[0-9a-f-]{36}$/u),
  Schema.brand("SystemInvalidationTag"),
);
export type SystemInvalidationTag = typeof SystemInvalidationTag.Type;

const PositiveSequence = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));
const EventAggregateSequence = PositiveSequence.pipe(Schema.brand("EventAggregateSequence"));
const WebhookAttemptNumber = Schema.Number.pipe(
  Schema.int(),
  Schema.between(1, 12),
  Schema.brand("WebhookAttemptNumber"),
);
const WebhookOutcome = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[a-z][a-z0-9_]{0,63}$/u),
);

export class WebhookLocaleAuthority extends Schema.Class<WebhookLocaleAuthority>(
  "WebhookLocaleAuthority",
)({
  id: ProjectLocaleId,
  tag: LocaleTag,
}) {}

export class WebhookPublicationAuthority extends Schema.Class<WebhookPublicationAuthority>(
  "WebhookPublicationAuthority",
)({
  id: EntryPublicationId,
  sequence: EntryPublicationSequence,
}) {}

export class CollectionWebhookAggregateAuthority extends Schema.Class<CollectionWebhookAggregateAuthority>(
  "CollectionWebhookAggregateAuthority",
)({
  type: Schema.Literal("cms.collection"),
  id: CollectionId,
  sequence: EventAggregateSequence,
}) {}

export class EntryWebhookAggregateAuthority extends Schema.Class<EntryWebhookAggregateAuthority>(
  "EntryWebhookAggregateAuthority",
)({
  type: Schema.Literal("cms.entry"),
  id: EntryId,
  sequence: EventAggregateSequence,
}) {}

export class PublishedWebhookSchemaAuthority extends Schema.Class<PublishedWebhookSchemaAuthority>(
  "PublishedWebhookSchemaAuthority",
)({
  revisionId: SchemaRevisionId,
  schemaHash: SchemaHash,
  contractHash: ContractHash,
}) {}

export class EntryWebhookSchemaAuthority extends Schema.Class<EntryWebhookSchemaAuthority>(
  "EntryWebhookSchemaAuthority",
)({
  revisionId: SchemaRevisionId,
  contractHash: ContractHash,
}) {}

export class WebhookChangeAuthority extends Schema.Class<WebhookChangeAuthority>(
  "WebhookChangeAuthority",
)({
  fieldIds: Schema.Array(CollectionFieldId).pipe(
    Schema.maxItems(1_000),
    Schema.filter(
      (values) =>
        new Set(values).size === values.length &&
        values.every((value, index) => {
          const previous = values[index - 1];
          return previous === undefined || previous < value;
        }),
      { message: () => "Changed field IDs must be sorted and unique." },
    ),
  ),
}) {}

export class WebhookInvalidationAuthority extends Schema.Class<WebhookInvalidationAuthority>(
  "WebhookInvalidationAuthority",
)({
  systemTags: Schema.Array(SystemInvalidationTag).pipe(
    Schema.maxItems(1_005),
    Schema.filter((values) => new Set(values).size === values.length, {
      message: () => "System invalidation tags must be unique.",
    }),
  ),
  semanticTags: Schema.Array(SemanticInvalidationTag).pipe(
    Schema.maxItems(100),
    Schema.filter((values) => new Set(values).size === values.length, {
      message: () => "Semantic invalidation tags must be unique.",
    }),
  ),
  routes: Schema.Array(InvalidationRoutePath).pipe(
    Schema.maxItems(100),
    Schema.filter((values) => new Set(values).size === values.length, {
      message: () => "Invalidation routes must be unique.",
    }),
  ),
}) {}

export class SchemaPublishedWebhookData extends Schema.Class<SchemaPublishedWebhookData>(
  "SchemaPublishedWebhookData",
)({
  version: Schema.Literal(1),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  aggregate: CollectionWebhookAggregateAuthority,
  schema: PublishedWebhookSchemaAuthority,
  changes: WebhookChangeAuthority,
  invalidation: WebhookInvalidationAuthority,
}) {}

export class EntryPublishedWebhookData extends Schema.Class<EntryPublishedWebhookData>(
  "EntryPublishedWebhookData",
)({
  version: Schema.Literal(1),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  entryId: EntryId,
  locale: WebhookLocaleAuthority,
  publication: WebhookPublicationAuthority,
  aggregate: EntryWebhookAggregateAuthority,
  schema: EntryWebhookSchemaAuthority,
  changes: WebhookChangeAuthority,
  invalidation: WebhookInvalidationAuthority,
}) {}

export class EntryUnpublishedWebhookData extends Schema.Class<EntryUnpublishedWebhookData>(
  "EntryUnpublishedWebhookData",
)({
  version: Schema.Literal(1),
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  entryId: EntryId,
  locale: WebhookLocaleAuthority,
  publication: WebhookPublicationAuthority,
  aggregate: EntryWebhookAggregateAuthority,
  schema: EntryWebhookSchemaAuthority,
  changes: WebhookChangeAuthority,
  invalidation: WebhookInvalidationAuthority,
}) {}

export const PublicationWebhookData = Schema.Union(
  SchemaPublishedWebhookData,
  EntryPublishedWebhookData,
  EntryUnpublishedWebhookData,
);
export type PublicationWebhookData = typeof PublicationWebhookData.Type;

const PublicationWebhookEventFields = {
  specversion: Schema.Literal("1.0"),
  id: WebhookEventId,
  source: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(160),
    Schema.pattern(/^urn:framerfordevs:project:[0-9a-f-]{36}:environment:[0-9a-f-]{36}$/u),
  ),
  subject: Schema.String.pipe(
    Schema.minLength(46),
    Schema.maxLength(64),
    Schema.pattern(/^cms\.(?:collection|entry)\/[0-9a-f-]{36}$/u),
  ),
  time: IsoDateTime,
  datacontenttype: Schema.Literal("application/json"),
};

export class SchemaPublishedWebhookEvent extends Schema.Class<SchemaPublishedWebhookEvent>(
  "SchemaPublishedWebhookEvent",
)({
  ...PublicationWebhookEventFields,
  type: Schema.Literal("cms.schema.published"),
  data: SchemaPublishedWebhookData,
}) {}

export class EntryPublishedWebhookEvent extends Schema.Class<EntryPublishedWebhookEvent>(
  "EntryPublishedWebhookEvent",
)({
  ...PublicationWebhookEventFields,
  type: Schema.Literal("cms.entry.published"),
  data: EntryPublishedWebhookData,
}) {}

export class EntryUnpublishedWebhookEvent extends Schema.Class<EntryUnpublishedWebhookEvent>(
  "EntryUnpublishedWebhookEvent",
)({
  ...PublicationWebhookEventFields,
  type: Schema.Literal("cms.entry.unpublished"),
  data: EntryUnpublishedWebhookData,
}) {}

export const PublicationWebhookEvent = Schema.Union(
  SchemaPublishedWebhookEvent,
  EntryPublishedWebhookEvent,
  EntryUnpublishedWebhookEvent,
).pipe(
  Schema.filter(
    (event) =>
      event.source ===
        `urn:framerfordevs:project:${event.data.projectId}:environment:${event.data.environmentId}` &&
      event.subject ===
        (event.type === "cms.schema.published"
          ? `cms.collection/${event.data.collectionId}`
          : `cms.entry/${event.data.entryId}`) &&
      event.data.aggregate.id ===
        (event.type === "cms.schema.published" ? event.data.collectionId : event.data.entryId),
    { message: () => "Webhook envelope authority must match its event data." },
  ),
);
export type PublicationWebhookEvent = typeof PublicationWebhookEvent.Type;

export class WebhookEndpoint extends Schema.Class<WebhookEndpoint>("WebhookEndpoint")({
  id: WebhookEndpointId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  name: WebhookEndpointName,
  state: WebhookEndpointState,
  version: ResourceVersion,
  destinationOrigin: WebhookDisplayOrigin,
  subscriptions: WebhookEventTypes,
  rotationState: Schema.NullOr(WebhookSecretState),
  rotationEndsAt: Schema.NullOr(IsoDateTime),
  lastOutcome: Schema.NullOr(WebhookOutcome),
  deadLetterCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  enabledAt: Schema.NullOr(IsoDateTime),
  disabledAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class IssuedWebhookEndpoint extends Schema.Class<IssuedWebhookEndpoint>(
  "IssuedWebhookEndpoint",
)({
  endpoint: WebhookEndpoint,
  secret: WebhookSecret,
}) {}

export class RotatedWebhookSecret extends Schema.Class<RotatedWebhookSecret>(
  "RotatedWebhookSecret",
)({
  endpointId: WebhookEndpointId,
  secretId: WebhookSecretId,
  secret: WebhookSecret,
  state: Schema.Literal("pending"),
}) {}

export class WebhookEndpointPage extends Schema.Class<WebhookEndpointPage>("WebhookEndpointPage")({
  items: Schema.Array(WebhookEndpoint).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

const WebhookScope = {
  projectId: ProjectId,
  environmentId: EnvironmentId,
};

export class CreateWebhookEndpointInput extends Schema.Class<CreateWebhookEndpointInput>(
  "CreateWebhookEndpointInput",
)({
  ...WebhookScope,
  name: WebhookEndpointName,
  destination: WebhookDestinationUrl,
  subscriptions: WebhookEventTypes,
  authorityAcknowledged: Schema.Literal(true),
}) {}

export class ListWebhookEndpointsInput extends Schema.Class<ListWebhookEndpointsInput>(
  "ListWebhookEndpointsInput",
)({
  ...WebhookScope,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class GetWebhookEndpointInput extends Schema.Class<GetWebhookEndpointInput>(
  "GetWebhookEndpointInput",
)({
  ...WebhookScope,
  endpointId: WebhookEndpointId,
}) {}

export class UpdateWebhookEndpointInput extends Schema.Class<UpdateWebhookEndpointInput>(
  "UpdateWebhookEndpointInput",
)({
  ...WebhookScope,
  endpointId: WebhookEndpointId,
  expectedVersion: ResourceVersion,
  name: WebhookEndpointName,
  destination: Schema.optionalWith(WebhookDestinationUrl, { exact: true }),
}) {}

export class SetWebhookEndpointStateInput extends Schema.Class<SetWebhookEndpointStateInput>(
  "SetWebhookEndpointStateInput",
)({
  ...WebhookScope,
  endpointId: WebhookEndpointId,
  expectedVersion: ResourceVersion,
  state: WebhookEndpointState,
}) {}

export class ReplaceWebhookSubscriptionsInput extends Schema.Class<ReplaceWebhookSubscriptionsInput>(
  "ReplaceWebhookSubscriptionsInput",
)({
  ...WebhookScope,
  endpointId: WebhookEndpointId,
  expectedVersion: ResourceVersion,
  subscriptions: WebhookEventTypes,
}) {}

export class StartWebhookSecretRotationInput extends Schema.Class<StartWebhookSecretRotationInput>(
  "StartWebhookSecretRotationInput",
)({
  ...WebhookScope,
  endpointId: WebhookEndpointId,
  expectedVersion: ResourceVersion,
  authorityAcknowledged: Schema.Literal(true),
}) {}

export class ChangeWebhookSecretRotationInput extends Schema.Class<ChangeWebhookSecretRotationInput>(
  "ChangeWebhookSecretRotationInput",
)({
  ...WebhookScope,
  endpointId: WebhookEndpointId,
  expectedVersion: ResourceVersion,
  action: Schema.Literal("activate", "cancel", "complete"),
}) {}

export class InvalidationRouteMapping extends Schema.Class<InvalidationRouteMapping>(
  "InvalidationRouteMapping",
)({
  id: InvalidationRouteMappingId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  entryId: Schema.NullOr(EntryId),
  localeId: Schema.NullOr(ProjectLocaleId),
  name: WebhookEndpointName,
  eventTypes: WebhookEventTypes,
  route: InvalidationRoutePath,
  semanticTags: SemanticInvalidationTags,
  state: WebhookEndpointState,
  version: ResourceVersion,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class CreateInvalidationRouteMappingInput extends Schema.Class<CreateInvalidationRouteMappingInput>(
  "CreateInvalidationRouteMappingInput",
)({
  ...WebhookScope,
  collectionId: CollectionId,
  entryId: Schema.NullOr(EntryId),
  localeId: Schema.NullOr(ProjectLocaleId),
  name: WebhookEndpointName,
  eventTypes: WebhookEventTypes,
  route: InvalidationRoutePath,
  semanticTags: SemanticInvalidationTags,
}) {}

export class UpdateInvalidationRouteMappingInput extends Schema.Class<UpdateInvalidationRouteMappingInput>(
  "UpdateInvalidationRouteMappingInput",
)({
  ...WebhookScope,
  mappingId: InvalidationRouteMappingId,
  expectedVersion: ResourceVersion,
  collectionId: CollectionId,
  entryId: Schema.NullOr(EntryId),
  localeId: Schema.NullOr(ProjectLocaleId),
  name: WebhookEndpointName,
  eventTypes: WebhookEventTypes,
  route: InvalidationRoutePath,
  semanticTags: SemanticInvalidationTags,
}) {}

export class SetInvalidationRouteMappingStateInput extends Schema.Class<SetInvalidationRouteMappingStateInput>(
  "SetInvalidationRouteMappingStateInput",
)({
  ...WebhookScope,
  mappingId: InvalidationRouteMappingId,
  expectedVersion: ResourceVersion,
  state: WebhookEndpointState,
}) {}

export class ListInvalidationRouteMappingsInput extends Schema.Class<ListInvalidationRouteMappingsInput>(
  "ListInvalidationRouteMappingsInput",
)({
  ...WebhookScope,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class InvalidationRouteMappingPage extends Schema.Class<InvalidationRouteMappingPage>(
  "InvalidationRouteMappingPage",
)({
  items: Schema.Array(InvalidationRouteMapping).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class WebhookDelivery extends Schema.Class<WebhookDelivery>("WebhookDelivery")({
  id: WebhookDeliveryId,
  eventId: WebhookEventId,
  endpointId: WebhookEndpointId,
  event: PublicationWebhookEvent,
  kind: WebhookDeliveryKind,
  status: WebhookDeliveryStatus,
  attemptCount: Schema.Number.pipe(Schema.int(), Schema.between(0, 12)),
  nextAttemptAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  lastOutcome: Schema.NullOr(WebhookOutcome),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class WebhookDeliveryAttempt extends Schema.Class<WebhookDeliveryAttempt>(
  "WebhookDeliveryAttempt",
)({
  id: WebhookAttemptId,
  deliveryId: WebhookDeliveryId,
  eventId: WebhookEventId,
  endpointId: WebhookEndpointId,
  attemptNumber: WebhookAttemptNumber,
  state: WebhookAttemptState,
  startedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
  durationMs: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0))),
  httpStatus: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.between(100, 599))),
  statusFamily: Schema.NullOr(Schema.Literal("1xx", "2xx", "3xx", "4xx", "5xx")),
  outcome: Schema.NullOr(WebhookOutcome),
  nextAttemptAt: Schema.NullOr(IsoDateTime),
}) {}

export class ListWebhookDeliveriesInput extends Schema.Class<ListWebhookDeliveriesInput>(
  "ListWebhookDeliveriesInput",
)({
  ...WebhookScope,
  endpointId: Schema.NullOr(WebhookEndpointId),
  eventType: Schema.NullOr(WebhookPublicEventType),
  status: Schema.NullOr(WebhookDeliveryStatus),
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class WebhookDeliveryPage extends Schema.Class<WebhookDeliveryPage>("WebhookDeliveryPage")({
  items: Schema.Array(WebhookDelivery).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ListWebhookAttemptsInput extends Schema.Class<ListWebhookAttemptsInput>(
  "ListWebhookAttemptsInput",
)({
  ...WebhookScope,
  deliveryId: WebhookDeliveryId,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class WebhookAttemptPage extends Schema.Class<WebhookAttemptPage>("WebhookAttemptPage")({
  items: Schema.Array(WebhookDeliveryAttempt).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ReplayWebhookEventInput extends Schema.Class<ReplayWebhookEventInput>(
  "ReplayWebhookEventInput",
)({
  ...WebhookScope,
  endpointId: WebhookEndpointId,
  eventId: WebhookEventId,
  sourceDeliveryId: Schema.NullOr(WebhookDeliveryId),
  commandId: EntryCommandId,
}) {}

export class ReplayWebhookEventResult extends Schema.Class<ReplayWebhookEventResult>(
  "ReplayWebhookEventResult",
)({
  delivery: WebhookDelivery,
  replayedByUserId: AuthUserId,
}) {}

export const CreateWebhookEndpointInputSchema = Schema.standardSchemaV1(CreateWebhookEndpointInput);
export const ListWebhookEndpointsInputSchema = Schema.standardSchemaV1(ListWebhookEndpointsInput);
export const GetWebhookEndpointInputSchema = Schema.standardSchemaV1(GetWebhookEndpointInput);
export const UpdateWebhookEndpointInputSchema = Schema.standardSchemaV1(UpdateWebhookEndpointInput);
export const SetWebhookEndpointStateInputSchema = Schema.standardSchemaV1(
  SetWebhookEndpointStateInput,
);
export const ReplaceWebhookSubscriptionsInputSchema = Schema.standardSchemaV1(
  ReplaceWebhookSubscriptionsInput,
);
export const StartWebhookSecretRotationInputSchema = Schema.standardSchemaV1(
  StartWebhookSecretRotationInput,
);
export const ChangeWebhookSecretRotationInputSchema = Schema.standardSchemaV1(
  ChangeWebhookSecretRotationInput,
);
export const CreateInvalidationRouteMappingInputSchema = Schema.standardSchemaV1(
  CreateInvalidationRouteMappingInput,
);
export const UpdateInvalidationRouteMappingInputSchema = Schema.standardSchemaV1(
  UpdateInvalidationRouteMappingInput,
);
export const SetInvalidationRouteMappingStateInputSchema = Schema.standardSchemaV1(
  SetInvalidationRouteMappingStateInput,
);
export const ListInvalidationRouteMappingsInputSchema = Schema.standardSchemaV1(
  ListInvalidationRouteMappingsInput,
);
export const ListWebhookDeliveriesInputSchema = Schema.standardSchemaV1(ListWebhookDeliveriesInput);
export const ListWebhookAttemptsInputSchema = Schema.standardSchemaV1(ListWebhookAttemptsInput);
export const ReplayWebhookEventInputSchema = Schema.standardSchemaV1(ReplayWebhookEventInput);

export const WebhookEndpointOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(WebhookEndpoint),
);
export const IssuedWebhookEndpointOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(IssuedWebhookEndpoint),
);
export const RotatedWebhookSecretOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(RotatedWebhookSecret),
);
export const WebhookEndpointPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(WebhookEndpointPage),
);
export const InvalidationRouteMappingOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(InvalidationRouteMapping),
);
export const InvalidationRouteMappingPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(InvalidationRouteMappingPage),
);
export const WebhookDeliveryPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(WebhookDeliveryPage),
);
export const WebhookAttemptPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(WebhookAttemptPage),
);
export const ReplayWebhookEventResultOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(ReplayWebhookEventResult),
);
