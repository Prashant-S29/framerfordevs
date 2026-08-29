// Defines authenticated webhook management and one-time secret issuance.

import { createHash, randomUUID } from "node:crypto";

import { Clock, Effect, Schema } from "effect";

import { RateLimitedFailure, UnauthorizedFailure } from "../../../contracts/response/errors";
import { AuthUserId, PageLimit } from "../../../contracts/platform";
import {
  IssuedWebhookEndpoint,
  ChangeWebhookSecretRotationInput,
  ReplayWebhookEventInput,
  ReplayWebhookEventResult,
  RotatedWebhookSecret,
  WebhookSecretId,
  type CreateInvalidationRouteMappingInput,
  type CreateWebhookEndpointInput,
  type ListInvalidationRouteMappingsInput,
  type ListWebhookAttemptsInput,
  type ListWebhookDeliveriesInput,
  type ListWebhookEndpointsInput,
  type ReplaceWebhookSubscriptionsInput,
  type SetInvalidationRouteMappingStateInput,
  type SetWebhookEndpointStateInput,
  type UpdateInvalidationRouteMappingInput,
  type UpdateWebhookEndpointInput,
  type StartWebhookSecretRotationInput,
} from "../../../contracts/webhook";
import { WebhookCrypto } from "../../../services/webhook/crypto";
import { WebhookDestinationValidator } from "../../../services/webhook/destination-validator";
import { RateLimitManager } from "../../../services/rate-limit/manager";
import { WebhookRepository } from "../../../services/webhook/repository";
import { canonicalizeEntryValue } from "../../../lib/entry/values";

const decodeActorId = (value: string) =>
  Schema.decodeUnknown(AuthUserId)(value).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

export const createWebhookEndpoint = Effect.fn("webhook.endpoint.create")(function* (
  actorUserId: string,
  input: CreateWebhookEndpointInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const destinationValidator = yield* WebhookDestinationValidator;
  const crypto = yield* WebhookCrypto;
  const repository = yield* WebhookRepository;
  const managementScope = yield* repository.resolveManagementScope(actorId, input);
  const validated = yield* destinationValidator.validate(input.destination);
  const endpointId = randomUUID();
  const destinationId = randomUUID();
  const secretId = randomUUID();
  const secret = yield* crypto.generateSigningSecret();
  const destinationScope = {
    workspaceId: managementScope.workspaceId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    endpointId,
    resourceId: destinationId,
    purpose: "destination" as const,
  };
  const secretScope = {
    ...destinationScope,
    resourceId: secretId,
    purpose: "signing_secret" as const,
  };
  const encryptedDestination = yield* crypto.encrypt(validated.url, destinationScope);
  const encryptedSecret = yield* crypto.encrypt(secret, secretScope);
  const now = new Date(yield* Clock.currentTimeMillis);
  const endpoint = yield* repository.createEndpoint(
    actorId,
    input,
    {
      endpointId,
      destinationId,
      secretId,
      displayOrigin: validated.displayOrigin,
      destination: encryptedDestination,
      destinationFingerprint: yield* crypto.keyedFingerprint(validated.url),
      secret: encryptedSecret,
      secretFingerprint: yield* crypto.shortFingerprint(secret),
    },
    now,
    requestId,
  );
  return IssuedWebhookEndpoint.make({ endpoint, secret });
});

export const listWebhookEndpoints = Effect.fn("webhook.endpoint.list")(function* (
  actorUserId: string,
  input: ListWebhookEndpointsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).listEndpoints(actorId, input);
});

export const updateWebhookEndpoint = Effect.fn("webhook.endpoint.update")(function* (
  actorUserId: string,
  input: UpdateWebhookEndpointInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const repository = yield* WebhookRepository;
  const managementScope = yield* repository.resolveManagementScope(actorId, input);
  let persistence = null;
  if (input.destination !== undefined) {
    const validated = yield* (yield* WebhookDestinationValidator).validate(input.destination);
    const crypto = yield* WebhookCrypto;
    const destinationId = randomUUID();
    persistence = {
      destinationId,
      displayOrigin: validated.displayOrigin,
      destination: yield* crypto.encrypt(validated.url, {
        workspaceId: managementScope.workspaceId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        endpointId: input.endpointId,
        resourceId: destinationId,
        purpose: "destination",
      }),
      destinationFingerprint: yield* crypto.keyedFingerprint(validated.url),
    };
  }
  return yield* repository.updateEndpoint(
    actorId,
    input,
    persistence,
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
});

export const setWebhookEndpointState = Effect.fn("webhook.endpoint.state")(function* (
  actorUserId: string,
  input: SetWebhookEndpointStateInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).setEndpointState(
    actorId,
    input,
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
});

export const replaceWebhookSubscriptions = Effect.fn("webhook.subscription.replace")(function* (
  actorUserId: string,
  input: ReplaceWebhookSubscriptionsInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).replaceSubscriptions(
    actorId,
    input,
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
});

export const startWebhookSecretRotation = Effect.fn("webhook.secret.start")(function* (
  actorUserId: string,
  input: StartWebhookSecretRotationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const repository = yield* WebhookRepository;
  const crypto = yield* WebhookCrypto;
  const managementScope = yield* repository.resolveManagementScope(actorId, input);
  const secretId = WebhookSecretId.make(randomUUID());
  const secret = yield* crypto.generateSigningSecret();
  const encrypted = yield* crypto.encrypt(secret, {
    workspaceId: managementScope.workspaceId,
    projectId: input.projectId,
    environmentId: input.environmentId,
    endpointId: input.endpointId,
    resourceId: secretId,
    purpose: "signing_secret",
  });
  yield* repository.startSecretRotation(
    actorId,
    input,
    {
      secretId,
      secret: encrypted,
      secretFingerprint: yield* crypto.shortFingerprint(secret),
    },
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
  return RotatedWebhookSecret.make({
    endpointId: input.endpointId,
    secretId,
    secret,
    state: "pending",
  });
});

export const changeWebhookSecretRotation = Effect.fn("webhook.secret.change")(function* (
  actorUserId: string,
  input: ChangeWebhookSecretRotationInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const endpoint = yield* (yield* WebhookRepository).changeSecretRotation(
    actorId,
    input,
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
  const listed = yield* (yield* WebhookRepository).listEndpoints(actorId, {
    projectId: input.projectId,
    environmentId: input.environmentId,
    cursor: null,
    limit: PageLimit.make(50),
  });
  const updated = listed.items.find((item) => item.id === endpoint.id);
  if (updated === undefined) return yield* UnauthorizedFailure.make();
  return updated;
});

export const createInvalidationMapping = Effect.fn("webhook.mapping.create")(function* (
  actorUserId: string,
  input: CreateInvalidationRouteMappingInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const now = new Date(yield* Clock.currentTimeMillis);
  return yield* (yield* WebhookRepository).createMapping(actorId, input, now, requestId);
});

export const updateInvalidationMapping = Effect.fn("webhook.mapping.update")(function* (
  actorUserId: string,
  input: UpdateInvalidationRouteMappingInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).updateMapping(
    actorId,
    input,
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
});

export const setInvalidationMappingState = Effect.fn("webhook.mapping.state")(function* (
  actorUserId: string,
  input: SetInvalidationRouteMappingStateInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).setMappingState(
    actorId,
    input,
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
});

export const listInvalidationMappings = Effect.fn("webhook.mapping.list")(function* (
  actorUserId: string,
  input: ListInvalidationRouteMappingsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).listMappings(actorId, input);
});

export const listWebhookDeliveries = Effect.fn("webhook.delivery.list")(function* (
  actorUserId: string,
  input: ListWebhookDeliveriesInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).listDeliveries(actorId, input);
});

export const listWebhookAttempts = Effect.fn("webhook.attempt.list")(function* (
  actorUserId: string,
  input: ListWebhookAttemptsInput,
) {
  const actorId = yield* decodeActorId(actorUserId);
  return yield* (yield* WebhookRepository).listAttempts(actorId, input);
});

export const replayWebhookEvent = Effect.fn("webhook.delivery.replay")(function* (
  actorUserId: string,
  input: ReplayWebhookEventInput,
  requestId: string,
) {
  const actorId = yield* decodeActorId(actorUserId);
  const decision = yield* (yield* RateLimitManager).evaluate({
    policy: "webhook.replay.user",
    identity: actorId,
    cost: 1,
  });
  if (!decision.allowed) return yield* RateLimitedFailure.make();
  const encodedInput = yield* Schema.encode(ReplayWebhookEventInput)(input).pipe(
    Effect.mapError(() => UnauthorizedFailure.make()),
  );
  const fingerprint = createHash("sha256")
    .update(
      canonicalizeEntryValue({
        version: 1,
        operation: "webhook.delivery.replay",
        actorId,
        ...encodedInput,
      }),
      "utf8",
    )
    .digest("hex");
  const delivery = yield* (yield* WebhookRepository).replayEvent(
    actorId,
    input,
    fingerprint,
    new Date(yield* Clock.currentTimeMillis),
    requestId,
  );
  return ReplayWebhookEventResult.make({ delivery, replayedByUserId: actorId });
});
