// Adapts authenticated hosted sessions to the shared operational webhook read authority.

import { Effect, Schema } from "effect";

import type {
  ControlPlaneWebhookDeliveryListQuery,
  HostedWebhookDeliveryInput,
} from "../../contracts/control-plane";
import { AuthUserId } from "../../contracts/platform";
import { UnauthorizedFailure } from "../../contracts/response/errors";
import {
  getControlPlaneWebhookDelivery,
  listControlPlaneWebhookAttempts,
  listControlPlaneWebhookDeliveries,
} from "../control-plane/operational/webhook";

const userActor = (userId: string) =>
  Schema.decodeUnknown(AuthUserId)(userId).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
    Effect.map((id) => ({ kind: "user" as const, id })),
  );

export const listHostedWebhookDeliveries = Effect.fn("hosted.webhook.delivery.list")(function* (
  userId: string,
  principalKey: string,
  input: {
    readonly projectId: string;
    readonly environmentId: string;
    readonly query: ControlPlaneWebhookDeliveryListQuery;
  },
) {
  return yield* listControlPlaneWebhookDeliveries(
    yield* userActor(userId),
    principalKey,
    input.projectId,
    input.environmentId,
    input.query,
  );
});

export const getHostedWebhookDelivery = Effect.fn("hosted.webhook.delivery.get")(function* (
  userId: string,
  input: HostedWebhookDeliveryInput,
) {
  return yield* getControlPlaneWebhookDelivery(
    yield* userActor(userId),
    input.projectId,
    input.environmentId,
    input.deliveryId,
  );
});

export const listHostedWebhookAttempts = Effect.fn("hosted.webhook.attempt.list")(function* (
  userId: string,
  input: HostedWebhookDeliveryInput,
) {
  return yield* listControlPlaneWebhookAttempts(
    yield* userActor(userId),
    input.projectId,
    input.environmentId,
    input.deliveryId,
  );
});
