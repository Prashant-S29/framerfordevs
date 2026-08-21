// Encodes scope- and filter-bound keyset cursors for M11 management history lists.

import { Effect, Schema } from "effect";

import { ApiErrorDetail } from "./api-response";
import { ValidationFailure } from "./errors";
import { Cursor, EnvironmentId, IsoDateTime, ProjectId } from "./platform";
import {
  InvalidationRouteMappingId,
  WebhookAttemptId,
  WebhookDeliveryId,
  WebhookDeliveryStatus,
  WebhookEndpointId,
  WebhookPublicEventType,
} from "./webhooks";

const Scope = { projectId: ProjectId, environmentId: EnvironmentId };

class EndpointCursorPayload extends Schema.Class<EndpointCursorPayload>("EndpointCursorPayload")({
  version: Schema.Literal(1),
  kind: Schema.Literal("webhook-endpoint"),
  ...Scope,
  createdAt: IsoDateTime,
  endpointId: WebhookEndpointId,
}) {}

class MappingCursorPayload extends Schema.Class<MappingCursorPayload>("MappingCursorPayload")({
  version: Schema.Literal(1),
  kind: Schema.Literal("invalidation-mapping"),
  ...Scope,
  createdAt: IsoDateTime,
  mappingId: InvalidationRouteMappingId,
}) {}

class DeliveryCursorPayload extends Schema.Class<DeliveryCursorPayload>("DeliveryCursorPayload")({
  version: Schema.Literal(1),
  kind: Schema.Literal("webhook-delivery"),
  ...Scope,
  endpointFilter: Schema.NullOr(WebhookEndpointId),
  eventTypeFilter: Schema.NullOr(WebhookPublicEventType),
  statusFilter: Schema.NullOr(WebhookDeliveryStatus),
  createdAt: IsoDateTime,
  deliveryId: WebhookDeliveryId,
}) {}

class AttemptCursorPayload extends Schema.Class<AttemptCursorPayload>("AttemptCursorPayload")({
  version: Schema.Literal(1),
  kind: Schema.Literal("webhook-attempt"),
  ...Scope,
  deliveryId: WebhookDeliveryId,
  attemptNumber: Schema.Number.pipe(Schema.int(), Schema.between(1, 12)),
  attemptId: WebhookAttemptId,
}) {}

const invalidCursor = () =>
  ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path: "cursor",
        code: "invalid_cursor",
        message: "The pagination cursor is invalid or does not match this webhook list.",
      }),
    ],
  });

const encodePayload = Effect.fn("webhookCursor.encode")(function* (payload: object) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return yield* Schema.decodeUnknown(Cursor)(encoded).pipe(Effect.mapError(() => invalidCursor()));
});

const decodePayload = Effect.fn("webhookCursor.decode")(function* <A, I>(
  cursor: Cursor,
  schema: Schema.Schema<A, I, never>,
) {
  const payload = yield* Effect.try({
    try: (): unknown => JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    catch: () => invalidCursor(),
  });
  return yield* Schema.decodeUnknown(schema)(payload).pipe(Effect.mapError(() => invalidCursor()));
});

function scopeMatches(
  payload: { readonly projectId: string; readonly environmentId: string },
  scope: { readonly projectId: string; readonly environmentId: string },
) {
  return payload.projectId === scope.projectId && payload.environmentId === scope.environmentId;
}

export const encodeWebhookEndpointCursor = (payload: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly createdAt: string;
  readonly endpointId: string;
}) => encodePayload({ version: 1, kind: "webhook-endpoint", ...payload });

export const decodeWebhookEndpointCursor = Effect.fn("webhookCursor.decodeEndpoint")(function* (
  cursor: Cursor,
  scope: { readonly projectId: string; readonly environmentId: string },
) {
  const payload = yield* decodePayload(cursor, EndpointCursorPayload);
  if (!scopeMatches(payload, scope)) return yield* invalidCursor();
  return payload;
});

export const encodeInvalidationMappingCursor = (payload: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly createdAt: string;
  readonly mappingId: string;
}) => encodePayload({ version: 1, kind: "invalidation-mapping", ...payload });

export const decodeInvalidationMappingCursor = Effect.fn("webhookCursor.decodeMapping")(function* (
  cursor: Cursor,
  scope: { readonly projectId: string; readonly environmentId: string },
) {
  const payload = yield* decodePayload(cursor, MappingCursorPayload);
  if (!scopeMatches(payload, scope)) return yield* invalidCursor();
  return payload;
});

export interface WebhookDeliveryCursorFilters {
  readonly projectId: string;
  readonly environmentId: string;
  readonly endpointId: string | null;
  readonly eventType: string | null;
  readonly status: string | null;
}

export const encodeWebhookDeliveryCursor = (payload: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly endpointFilter: string | null;
  readonly eventTypeFilter: string | null;
  readonly statusFilter: string | null;
  readonly createdAt: string;
  readonly deliveryId: string;
}) => encodePayload({ version: 1, kind: "webhook-delivery", ...payload });

export const decodeWebhookDeliveryCursor = Effect.fn("webhookCursor.decodeDelivery")(function* (
  cursor: Cursor,
  filters: WebhookDeliveryCursorFilters,
) {
  const payload = yield* decodePayload(cursor, DeliveryCursorPayload);
  if (
    !scopeMatches(payload, filters) ||
    payload.endpointFilter !== filters.endpointId ||
    payload.eventTypeFilter !== filters.eventType ||
    payload.statusFilter !== filters.status
  ) {
    return yield* invalidCursor();
  }
  return payload;
});

export const encodeWebhookAttemptCursor = (payload: {
  readonly projectId: string;
  readonly environmentId: string;
  readonly deliveryId: string;
  readonly attemptNumber: number;
  readonly attemptId: string;
}) => encodePayload({ version: 1, kind: "webhook-attempt", ...payload });

export const decodeWebhookAttemptCursor = Effect.fn("webhookCursor.decodeAttempt")(function* (
  cursor: Cursor,
  scope: {
    readonly projectId: string;
    readonly environmentId: string;
    readonly deliveryId: string;
  },
) {
  const payload = yield* decodePayload(cursor, AttemptCursorPayload);
  if (!scopeMatches(payload, scope) || payload.deliveryId !== scope.deliveryId) {
    return yield* invalidCursor();
  }
  return payload;
});
