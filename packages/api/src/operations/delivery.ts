// Exposes authenticated Delivery configuration operations while keeping transport concerns outside Effect services.

import { Clock, Effect, Schema } from "effect";

import type {
  GetDeliveryConfigurationInput,
  UpdateDeliveryConfigurationInput,
} from "../contracts/delivery";
import { UnauthorizedFailure } from "../contracts/errors";
import { AuthUserId } from "../contracts/platform";
import { DeliveryRepository } from "../services/delivery-repository";

const decodeActorId = (actorId: string) =>
  Schema.decodeUnknown(AuthUserId)(actorId).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

export const getDeliveryConfiguration = Effect.fn("delivery.configuration.get")(function* (
  actorUserId: string,
  input: GetDeliveryConfigurationInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  return yield* (yield* DeliveryRepository).getConfiguration(actorId, input);
});

export const updateDeliveryConfiguration = Effect.fn("delivery.configuration.update")(function* (
  actorUserId: string,
  input: UpdateDeliveryConfigurationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  yield* Effect.annotateCurrentSpan({
    projectId: input.projectId,
    environmentId: input.environmentId,
    collectionId: input.collectionId,
  });
  const now = new Date(yield* Clock.currentTimeMillis);
  return yield* (yield* DeliveryRepository).updateConfiguration(actorId, input, now, requestId);
});
