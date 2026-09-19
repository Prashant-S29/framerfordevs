// Adapts shared webhook administration to signed, principal-bound Control Plane resources.

import { Clock, Effect, Schema } from "effect";

import type { ProjectActor } from "../../../contracts/access";
import {
  ControlPlaneCursor,
  ControlPlaneInvalidationMappingPage,
  ControlPlaneWebhookAttemptList,
  ControlPlaneWebhookDeliveryDetail,
  ControlPlaneWebhookDeliveryPage,
  ControlPlaneWebhookDeliverySummary,
  ControlPlaneWebhookEndpointPage,
  type ControlPlaneCreateInvalidationMappingRequest,
  type ControlPlaneCreateWebhookEndpointRequest,
  type ControlPlaneInvalidationMappingListQuery,
  type ControlPlaneInvalidationMappingStateRequest,
  type ControlPlaneReplayWebhookRequest,
  type ControlPlaneReplaceWebhookSubscriptionsRequest,
  type ControlPlaneStartWebhookSecretRotationRequest,
  type ControlPlaneUpdateInvalidationMappingRequest,
  type ControlPlaneUpdateWebhookEndpointRequest,
  type ControlPlaneWebhookDeliveryListQuery,
  type ControlPlaneWebhookEndpointListQuery,
  type ControlPlaneWebhookEndpointStateRequest,
  type ControlPlaneWebhookSecretTransitionRequest,
} from "../../../contracts/control-plane";
import {
  ChangeWebhookSecretRotationInput,
  CreateInvalidationRouteMappingInput,
  CreateWebhookEndpointInput,
  ListInvalidationRouteMappingsInput,
  ListWebhookAttemptsInput,
  ListWebhookDeliveriesInput,
  ListWebhookEndpointsInput,
  ReplayWebhookEventInput,
  ReplaceWebhookSubscriptionsInput,
  SetInvalidationRouteMappingStateInput,
  SetWebhookEndpointStateInput,
  StartWebhookSecretRotationInput,
  UpdateInvalidationRouteMappingInput,
  UpdateWebhookEndpointInput,
  WebhookDeliveryId,
} from "../../../contracts/webhook";
import {
  encodeInvalidationMappingCursor,
  encodeWebhookDeliveryCursor,
  encodeWebhookEndpointCursor,
} from "../../../contracts/webhook/cursor";
import { UnauthorizedFailure } from "../../../contracts/response/errors";
import {
  createWebhookEndpoint,
  changeWebhookSecretRotation,
  listInvalidationMappings,
  listWebhookAttempts,
  listWebhookEndpoints,
  replayWebhookEvent,
  replaceWebhookSubscriptions,
  setInvalidationMappingState,
  setWebhookEndpointState,
  startWebhookSecretRotation,
  updateInvalidationMapping,
  updateWebhookEndpoint,
} from "../../webhook/api";
import { controlPlaneCommandFingerprint } from "../../../lib/control-plane/command-fingerprint";
import {
  ControlPlaneCursorSigner,
  controlPlaneSearchDigest,
  type ControlPlaneCursorAuthority,
} from "../../../services/control-plane/cursor-signer";
import { WebhookRepository } from "../../../services/webhook/repository";

const decode = <A, I>(schema: Schema.Schema<A, I, never>, value: unknown) =>
  Schema.decodeUnknown(schema)(value).pipe(Effect.mapError(() => UnauthorizedFailure.make()));

function authority(options: {
  readonly route: "webhook_endpoints" | "invalidation_mappings" | "webhook_deliveries";
  readonly principalKey: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly filters: unknown;
  readonly limit: number;
}): ControlPlaneCursorAuthority {
  return {
    route: options.route,
    principalKey: options.principalKey,
    workspaceId: null,
    projectId: options.projectId,
    environmentId: options.environmentId,
    projectStatus: null,
    filterDigest: controlPlaneSearchDigest(JSON.stringify(options.filters)),
    limit: options.limit,
  };
}

function deliverySummary(delivery: {
  readonly id: string;
  readonly eventId: string;
  readonly endpointId: string;
  readonly event: { readonly type: string; readonly time: string; readonly subject: string };
  readonly kind: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly nextAttemptAt: string | null;
  readonly completedAt: string | null;
  readonly lastOutcome: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}) {
  return Schema.decodeUnknownSync(ControlPlaneWebhookDeliverySummary)({
    id: delivery.id,
    eventId: delivery.eventId,
    endpointId: delivery.endpointId,
    eventType: delivery.event.type,
    eventTime: delivery.event.time,
    subject: delivery.event.subject,
    kind: delivery.kind,
    status: delivery.status,
    attemptCount: delivery.attemptCount,
    nextAttemptAt: delivery.nextAttemptAt,
    completedAt: delivery.completedAt,
    lastOutcome: delivery.lastOutcome,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  });
}

export const listControlPlaneWebhookEndpoints = Effect.fn("control-plane.webhook.list")(function* (
  actor: ProjectActor,
  principalKey: string,
  projectId: string,
  environmentId: string,
  query: ControlPlaneWebhookEndpointListQuery,
) {
  const signer = yield* ControlPlaneCursorSigner;
  const cursorAuthority = authority({
    route: "webhook_endpoints",
    principalKey,
    projectId,
    environmentId,
    filters: { state: query.state },
    limit: query.limit,
  });
  const position = query.cursor ? yield* signer.verify(query.cursor, cursorAuthority) : null;
  const cursor = position
    ? yield* encodeWebhookEndpointCursor({
        projectId,
        environmentId,
        createdAt: new Date(position.finalSortAtEpochMs).toISOString(),
        endpointId: position.finalId,
      })
    : null;
  const page = yield* listWebhookEndpoints(
    actor,
    yield* decode(ListWebhookEndpointsInput, {
      projectId,
      environmentId,
      state: query.state,
      cursor,
      limit: query.limit,
    }),
  );
  const last = page.items.at(-1);
  const nextCursor =
    page.nextCursor !== null && last
      ? yield* decode(
          ControlPlaneCursor,
          yield* signer.sign(cursorAuthority, {
            finalSortAtEpochMs: Date.parse(last.createdAt),
            finalId: last.id,
          }),
        )
      : null;
  return ControlPlaneWebhookEndpointPage.make({ items: page.items, nextCursor });
});

export const listControlPlaneInvalidationMappings = Effect.fn("control-plane.mapping.list")(
  function* (
    actor: ProjectActor,
    principalKey: string,
    projectId: string,
    environmentId: string,
    query: ControlPlaneInvalidationMappingListQuery,
  ) {
    const signer = yield* ControlPlaneCursorSigner;
    const cursorAuthority = authority({
      route: "invalidation_mappings",
      principalKey,
      projectId,
      environmentId,
      filters: { state: query.state },
      limit: query.limit,
    });
    const position = query.cursor ? yield* signer.verify(query.cursor, cursorAuthority) : null;
    const cursor = position
      ? yield* encodeInvalidationMappingCursor({
          projectId,
          environmentId,
          createdAt: new Date(position.finalSortAtEpochMs).toISOString(),
          mappingId: position.finalId,
        })
      : null;
    const page = yield* listInvalidationMappings(
      actor,
      yield* decode(ListInvalidationRouteMappingsInput, {
        projectId,
        environmentId,
        state: query.state,
        cursor,
        limit: query.limit,
      }),
    );
    const last = page.items.at(-1);
    const nextCursor =
      page.nextCursor !== null && last
        ? yield* decode(
            ControlPlaneCursor,
            yield* signer.sign(cursorAuthority, {
              finalSortAtEpochMs: Date.parse(last.createdAt),
              finalId: last.id,
            }),
          )
        : null;
    return ControlPlaneInvalidationMappingPage.make({ items: page.items, nextCursor });
  },
);

export const listControlPlaneWebhookDeliveries = Effect.fn("control-plane.webhook.delivery.list")(
  function* (
    actor: ProjectActor,
    principalKey: string,
    projectId: string,
    environmentId: string,
    query: ControlPlaneWebhookDeliveryListQuery,
  ) {
    const signer = yield* ControlPlaneCursorSigner;
    const cursorAuthority = authority({
      route: "webhook_deliveries",
      principalKey,
      projectId,
      environmentId,
      filters: {
        endpointId: query.endpointId,
        eventType: query.eventType,
        status: query.status,
      },
      limit: query.limit,
    });
    const position = query.cursor ? yield* signer.verify(query.cursor, cursorAuthority) : null;
    const cursor = position
      ? yield* encodeWebhookDeliveryCursor({
          projectId,
          environmentId,
          endpointFilter: query.endpointId,
          eventTypeFilter: query.eventType,
          statusFilter: query.status,
          createdAt: new Date(position.finalSortAtEpochMs).toISOString(),
          deliveryId: position.finalId,
        })
      : null;
    const page = yield* (yield* WebhookRepository).listDeliverySummaries(
      actor,
      yield* decode(ListWebhookDeliveriesInput, {
        projectId,
        environmentId,
        endpointId: query.endpointId,
        eventType: query.eventType,
        status: query.status,
        cursor,
        limit: query.limit,
      }),
    );
    const items = page.items.map(deliverySummary);
    const last = page.items.at(-1);
    const nextCursor =
      page.nextCursor !== null && last
        ? yield* decode(
            ControlPlaneCursor,
            yield* signer.sign(cursorAuthority, {
              finalSortAtEpochMs: Date.parse(last.createdAt),
              finalId: last.id,
            }),
          )
        : null;
    return ControlPlaneWebhookDeliveryPage.make({ items, nextCursor });
  },
);

export const getControlPlaneWebhookDelivery = Effect.fn("control-plane.webhook.delivery.get")(
  function* (actor: ProjectActor, projectId: string, environmentId: string, deliveryId: string) {
    const delivery = yield* (yield* WebhookRepository).getDelivery(actor, {
      projectId,
      environmentId,
      deliveryId: yield* decode(WebhookDeliveryId, deliveryId),
    });
    return ControlPlaneWebhookDeliveryDetail.make({
      delivery: deliverySummary(delivery),
      event: delivery.event,
    });
  },
);

export const listControlPlaneWebhookAttempts = Effect.fn("control-plane.webhook.attempt.list")(
  function* (actor: ProjectActor, projectId: string, environmentId: string, deliveryId: string) {
    const page = yield* listWebhookAttempts(
      actor,
      yield* decode(ListWebhookAttemptsInput, {
        projectId,
        environmentId,
        deliveryId,
        cursor: null,
        limit: 12,
      }),
    );
    return ControlPlaneWebhookAttemptList.make({ items: page.items });
  },
);

export const createControlPlaneWebhookEndpoint = Effect.fn("control-plane.webhook.create")(
  function* (
    actor: ProjectActor,
    projectId: string,
    environmentId: string,
    request: ControlPlaneCreateWebhookEndpointRequest,
    requestId: string,
  ) {
    return yield* createWebhookEndpoint(
      actor,
      yield* decode(CreateWebhookEndpointInput, { projectId, environmentId, ...request }),
      requestId,
    );
  },
);

export const updateControlPlaneWebhookEndpoint = Effect.fn("control-plane.webhook.update")(
  function* (
    actor: ProjectActor,
    projectId: string,
    environmentId: string,
    endpointId: string,
    request: ControlPlaneUpdateWebhookEndpointRequest,
    requestId: string,
  ) {
    return yield* updateWebhookEndpoint(
      actor,
      yield* decode(UpdateWebhookEndpointInput, {
        projectId,
        environmentId,
        endpointId,
        expectedVersion: request.expectedVersion,
        name: request.name,
        ...(request.destination === null ? {} : { destination: request.destination }),
      }),
      requestId,
    );
  },
);

export const setControlPlaneWebhookEndpointState = Effect.fn("control-plane.webhook.state")(
  function* (
    actor: ProjectActor,
    projectId: string,
    environmentId: string,
    endpointId: string,
    request: ControlPlaneWebhookEndpointStateRequest,
    requestId: string,
  ) {
    return yield* setWebhookEndpointState(
      actor,
      yield* decode(SetWebhookEndpointStateInput, {
        projectId,
        environmentId,
        endpointId,
        expectedVersion: request.expectedVersion,
        state: request.state,
      }),
      requestId,
    );
  },
);

export const replaceControlPlaneWebhookSubscriptions = Effect.fn(
  "control-plane.webhook.subscription.replace",
)(function* (
  actor: ProjectActor,
  projectId: string,
  environmentId: string,
  endpointId: string,
  request: ControlPlaneReplaceWebhookSubscriptionsRequest,
  requestId: string,
) {
  return yield* replaceWebhookSubscriptions(
    actor,
    yield* decode(ReplaceWebhookSubscriptionsInput, {
      projectId,
      environmentId,
      endpointId,
      ...request,
    }),
    requestId,
  );
});

export const startControlPlaneWebhookSecretRotation = Effect.fn(
  "control-plane.webhook.secret.start",
)(function* (
  actor: ProjectActor,
  projectId: string,
  environmentId: string,
  endpointId: string,
  request: ControlPlaneStartWebhookSecretRotationRequest,
  requestId: string,
) {
  return yield* startWebhookSecretRotation(
    actor,
    yield* decode(StartWebhookSecretRotationInput, {
      projectId,
      environmentId,
      endpointId,
      ...request,
    }),
    requestId,
  );
});

export const changeControlPlaneWebhookSecretRotation = Effect.fn(
  "control-plane.webhook.secret.change",
)(function* (
  actor: ProjectActor,
  projectId: string,
  environmentId: string,
  endpointId: string,
  action: "activate" | "cancel" | "complete",
  request: ControlPlaneWebhookSecretTransitionRequest,
  requestId: string,
) {
  return yield* changeWebhookSecretRotation(
    actor,
    yield* decode(ChangeWebhookSecretRotationInput, {
      projectId,
      environmentId,
      endpointId,
      expectedVersion: request.expectedVersion,
      action,
    }),
    requestId,
  );
});

export const createControlPlaneInvalidationMapping = Effect.fn("control-plane.mapping.create")(
  function* (
    actor: ProjectActor,
    projectId: string,
    environmentId: string,
    request: ControlPlaneCreateInvalidationMappingRequest,
    requestId: string,
  ) {
    const { commandId, ...mapping } = request;
    const input = yield* decode(CreateInvalidationRouteMappingInput, {
      projectId,
      environmentId,
      ...mapping,
    });
    const repository = yield* WebhookRepository;
    const scope = yield* repository.resolveManagementScope(actor, input);
    const fingerprint = controlPlaneCommandFingerprint({
      operation: "invalidation_mapping.create",
      actor,
      scope: {
        workspaceId: scope.workspaceId,
        projectId,
        environmentId,
      },
      input: {
        collectionId: request.collectionId,
        entryId: request.entryId,
        localeId: request.localeId,
        name: request.name,
        eventTypes: request.eventTypes,
        route: request.route,
        semanticTags: request.semanticTags,
      },
    });
    return yield* repository.createMapping(
      actor,
      input,
      new Date(yield* Clock.currentTimeMillis),
      requestId,
      { commandId, fingerprint },
    );
  },
);

export const updateControlPlaneInvalidationMapping = Effect.fn("control-plane.mapping.update")(
  function* (
    actor: ProjectActor,
    projectId: string,
    environmentId: string,
    mappingId: string,
    request: ControlPlaneUpdateInvalidationMappingRequest,
    requestId: string,
  ) {
    return yield* updateInvalidationMapping(
      actor,
      yield* decode(UpdateInvalidationRouteMappingInput, {
        projectId,
        environmentId,
        mappingId,
        ...request,
      }),
      requestId,
    );
  },
);

export const setControlPlaneInvalidationMappingState = Effect.fn("control-plane.mapping.state")(
  function* (
    actor: ProjectActor,
    projectId: string,
    environmentId: string,
    mappingId: string,
    request: ControlPlaneInvalidationMappingStateRequest,
    requestId: string,
  ) {
    return yield* setInvalidationMappingState(
      actor,
      yield* decode(SetInvalidationRouteMappingStateInput, {
        projectId,
        environmentId,
        mappingId,
        ...request,
      }),
      requestId,
    );
  },
);

export const replayControlPlaneWebhook = Effect.fn("control-plane.webhook.replay")(function* (
  actor: ProjectActor,
  projectId: string,
  environmentId: string,
  request: ControlPlaneReplayWebhookRequest,
  requestId: string,
) {
  return yield* replayWebhookEvent(
    actor,
    yield* decode(ReplayWebhookEventInput, { projectId, environmentId, ...request }),
    requestId,
  );
});
