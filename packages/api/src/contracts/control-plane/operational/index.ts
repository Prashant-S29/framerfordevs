// Defines the closed M16 operational-administration transport contracts.

import { Schema } from "effect";

import {
  ApiCredentialId,
  ApiCredentialRotation,
  ApiCredentialRotationId,
  CredentialFamily,
  CredentialLifecycleStatus,
  CredentialName,
  CredentialScopes,
  CredentialSecret,
  ProjectActor,
} from "../../access";
import { EnvironmentId, IsoDateTime, ProjectId, ResourceVersion } from "../../platform";
import { ApiSuccessSchema } from "../../response/api";
import {
  InvalidationRouteMapping,
  InvalidationRouteMappingId,
  IssuedWebhookEndpoint,
  InvalidationRoutePath,
  PublicationWebhookEvent,
  ReplayWebhookEventResult,
  RotatedWebhookSecret,
  SemanticInvalidationTags,
  WebhookDeliveryAttempt,
  WebhookDeliveryId,
  WebhookDeliveryKind,
  WebhookDeliveryStatus,
  WebhookDestinationUrl,
  WebhookEndpoint,
  WebhookEndpointId,
  WebhookEndpointName,
  WebhookEndpointState,
  WebhookEventId,
  WebhookEventTypes,
  WebhookOutcome,
  WebhookPublicEventType,
} from "../../webhook";
const maximumPageSize = 50;
const ControlPlaneCommandId = Schema.UUID.pipe(Schema.brand("ControlPlaneCommandId"));
const ControlPlaneCursorInput = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(2_048),
  Schema.brand("ControlPlaneCursorInput"),
);
const ControlPlaneCursor = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(512),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
  Schema.brand("ControlPlaneCursor"),
);
const PageLimit = Schema.Number.pipe(Schema.int(), Schema.between(1, maximumPageSize));
const nullableExpiryAcknowledged = Schema.Struct({
  expiresAt: Schema.NullOr(IsoDateTime),
  nonExpiringAcknowledged: Schema.Boolean,
});

export const ControlPlaneCredentialListQuery = Schema.Struct({
  family: Schema.Literal("all", "management", "delivery", "preview"),
  status: Schema.Literal("all", "pending", "active", "retiring", "expired", "revoked", "canceled"),
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: PageLimit,
}).annotations({
  identifier: "ControlPlaneCredentialListQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneCredentialListQuery = typeof ControlPlaneCredentialListQuery.Type;

export const ControlPlaneIssueCredentialRequest = Schema.Struct({
  family: CredentialFamily,
  name: CredentialName,
  scopes: CredentialScopes,
  ...nullableExpiryAcknowledged.fields,
  previewAuthorityAcknowledged: Schema.Boolean,
}).annotations({
  identifier: "ControlPlaneIssueCredentialRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneIssueCredentialRequest = typeof ControlPlaneIssueCredentialRequest.Type;

export const ControlPlaneStartCredentialRotationRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  ...nullableExpiryAcknowledged.fields,
}).annotations({
  identifier: "ControlPlaneStartCredentialRotationRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneStartCredentialRotationRequest =
  typeof ControlPlaneStartCredentialRotationRequest.Type;

export const ControlPlaneCredentialRotationTransitionRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  authorityAcknowledged: Schema.Literal(true),
}).annotations({
  identifier: "ControlPlaneCredentialRotationTransitionRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneCredentialRotationTransitionRequest =
  typeof ControlPlaneCredentialRotationTransitionRequest.Type;

export const ControlPlaneRevokeCredentialRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  authorityAcknowledged: Schema.Literal(true),
}).annotations({
  identifier: "ControlPlaneRevokeCredentialRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneRevokeCredentialRequest = typeof ControlPlaneRevokeCredentialRequest.Type;

export class ControlPlaneCredential extends Schema.Class<ControlPlaneCredential>(
  "ControlPlaneCredential",
)({
  id: ApiCredentialId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  family: CredentialFamily,
  name: CredentialName,
  keyPrefix: Schema.String.pipe(Schema.minLength(44), Schema.maxLength(45)),
  scopes: CredentialScopes,
  status: CredentialLifecycleStatus,
  version: ResourceVersion,
  activatedAt: Schema.NullOr(IsoDateTime),
  expiresAt: Schema.NullOr(IsoDateTime),
  retireAt: Schema.NullOr(IsoDateTime),
  revokedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  openRotation: Schema.NullOr(ApiCredentialRotation),
}) {}

export class ControlPlaneCredentialPage extends Schema.Class<ControlPlaneCredentialPage>(
  "ControlPlaneCredentialPage",
)({
  items: Schema.Array(ControlPlaneCredential).pipe(Schema.maxItems(maximumPageSize)),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneIssuedCredential extends Schema.Class<ControlPlaneIssuedCredential>(
  "ControlPlaneIssuedCredential",
)({
  credential: ControlPlaneCredential,
  key: CredentialSecret,
}) {}

export class ControlPlaneStartedCredentialRotation extends Schema.Class<ControlPlaneStartedCredentialRotation>(
  "ControlPlaneStartedCredentialRotation",
)({
  rotation: ApiCredentialRotation,
  successor: ControlPlaneCredential,
  key: CredentialSecret,
}) {}

export const ControlPlaneWebhookEndpointListQuery = Schema.Struct({
  state: Schema.Literal("all", "enabled", "disabled"),
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: PageLimit,
}).annotations({
  identifier: "ControlPlaneWebhookEndpointListQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneWebhookEndpointListQuery = typeof ControlPlaneWebhookEndpointListQuery.Type;

export const ControlPlaneCreateWebhookEndpointRequest = Schema.Struct({
  name: WebhookEndpointName,
  destination: WebhookDestinationUrl,
  subscriptions: WebhookEventTypes,
  authorityAcknowledged: Schema.Literal(true),
}).annotations({
  identifier: "ControlPlaneCreateWebhookEndpointRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneCreateWebhookEndpointRequest =
  typeof ControlPlaneCreateWebhookEndpointRequest.Type;

export const ControlPlaneUpdateWebhookEndpointRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  name: WebhookEndpointName,
  destination: Schema.NullOr(WebhookDestinationUrl),
  destinationReplacementAcknowledged: Schema.Boolean,
}).pipe(
  Schema.filter(
    (request) =>
      request.destination === null || request.destinationReplacementAcknowledged === true,
    { message: () => "Destination replacement requires explicit acknowledgement." },
  ),
  Schema.annotations({
    identifier: "ControlPlaneUpdateWebhookEndpointRequest",
    parseOptions: { onExcessProperty: "error" },
  }),
);
export type ControlPlaneUpdateWebhookEndpointRequest =
  typeof ControlPlaneUpdateWebhookEndpointRequest.Type;

export const ControlPlaneWebhookEndpointStateRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  state: WebhookEndpointState,
  authorityAcknowledged: Schema.Boolean,
}).pipe(
  Schema.filter(
    (request) => request.state === "enabled" || request.authorityAcknowledged === true,
    { message: () => "Disabling a webhook endpoint requires explicit acknowledgement." },
  ),
  Schema.annotations({
    identifier: "ControlPlaneWebhookEndpointStateRequest",
    parseOptions: { onExcessProperty: "error" },
  }),
);
export type ControlPlaneWebhookEndpointStateRequest =
  typeof ControlPlaneWebhookEndpointStateRequest.Type;

export const ControlPlaneReplaceWebhookSubscriptionsRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  subscriptions: WebhookEventTypes,
}).annotations({
  identifier: "ControlPlaneReplaceWebhookSubscriptionsRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneReplaceWebhookSubscriptionsRequest =
  typeof ControlPlaneReplaceWebhookSubscriptionsRequest.Type;

export const ControlPlaneStartWebhookSecretRotationRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  authorityAcknowledged: Schema.Literal(true),
}).annotations({
  identifier: "ControlPlaneStartWebhookSecretRotationRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneStartWebhookSecretRotationRequest =
  typeof ControlPlaneStartWebhookSecretRotationRequest.Type;

export const ControlPlaneWebhookSecretTransitionRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  authorityAcknowledged: Schema.Literal(true),
}).annotations({
  identifier: "ControlPlaneWebhookSecretTransitionRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneWebhookSecretTransitionRequest =
  typeof ControlPlaneWebhookSecretTransitionRequest.Type;

export class ControlPlaneWebhookEndpointPage extends Schema.Class<ControlPlaneWebhookEndpointPage>(
  "ControlPlaneWebhookEndpointPage",
)({
  items: Schema.Array(WebhookEndpoint).pipe(Schema.maxItems(maximumPageSize)),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export const ControlPlaneInvalidationMappingListQuery = Schema.Struct({
  state: Schema.Literal("all", "enabled", "disabled"),
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: PageLimit,
}).annotations({
  identifier: "ControlPlaneInvalidationMappingListQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneInvalidationMappingListQuery =
  typeof ControlPlaneInvalidationMappingListQuery.Type;

const InvalidationMappingFields = {
  collectionId: Schema.UUID,
  entryId: Schema.NullOr(Schema.UUID),
  localeId: Schema.NullOr(Schema.UUID),
  name: WebhookEndpointName,
  eventTypes: WebhookEventTypes,
  route: InvalidationRoutePath,
  semanticTags: SemanticInvalidationTags,
};

export const ControlPlaneCreateInvalidationMappingRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  ...InvalidationMappingFields,
}).annotations({
  identifier: "ControlPlaneCreateInvalidationMappingRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneCreateInvalidationMappingRequest =
  typeof ControlPlaneCreateInvalidationMappingRequest.Type;

export const ControlPlaneUpdateInvalidationMappingRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  ...InvalidationMappingFields,
}).annotations({
  identifier: "ControlPlaneUpdateInvalidationMappingRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneUpdateInvalidationMappingRequest =
  typeof ControlPlaneUpdateInvalidationMappingRequest.Type;

export const ControlPlaneInvalidationMappingStateRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  state: WebhookEndpointState,
}).annotations({
  identifier: "ControlPlaneInvalidationMappingStateRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneInvalidationMappingStateRequest =
  typeof ControlPlaneInvalidationMappingStateRequest.Type;

export class ControlPlaneInvalidationMappingPage extends Schema.Class<ControlPlaneInvalidationMappingPage>(
  "ControlPlaneInvalidationMappingPage",
)({
  items: Schema.Array(InvalidationRouteMapping).pipe(Schema.maxItems(maximumPageSize)),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export const ControlPlaneWebhookDeliveryListQuery = Schema.Struct({
  endpointId: Schema.NullOr(WebhookEndpointId),
  eventType: Schema.NullOr(WebhookPublicEventType),
  status: Schema.NullOr(WebhookDeliveryStatus),
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: PageLimit,
}).annotations({
  identifier: "ControlPlaneWebhookDeliveryListQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneWebhookDeliveryListQuery = typeof ControlPlaneWebhookDeliveryListQuery.Type;

export class ControlPlaneWebhookDeliverySummary extends Schema.Class<ControlPlaneWebhookDeliverySummary>(
  "ControlPlaneWebhookDeliverySummary",
)({
  id: WebhookDeliveryId,
  eventId: WebhookEventId,
  endpointId: WebhookEndpointId,
  eventType: WebhookPublicEventType,
  eventTime: IsoDateTime,
  subject: Schema.String.pipe(
    Schema.minLength(46),
    Schema.maxLength(64),
    Schema.pattern(/^cms\.(?:collection|entry)\/[0-9a-f-]{36}$/u),
  ),
  kind: WebhookDeliveryKind,
  status: WebhookDeliveryStatus,
  attemptCount: Schema.Number.pipe(Schema.int(), Schema.between(0, 12)),
  nextAttemptAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  lastOutcome: Schema.NullOr(WebhookOutcome),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class ControlPlaneWebhookDeliveryPage extends Schema.Class<ControlPlaneWebhookDeliveryPage>(
  "ControlPlaneWebhookDeliveryPage",
)({
  items: Schema.Array(ControlPlaneWebhookDeliverySummary).pipe(Schema.maxItems(maximumPageSize)),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneWebhookDeliveryDetail extends Schema.Class<ControlPlaneWebhookDeliveryDetail>(
  "ControlPlaneWebhookDeliveryDetail",
)({
  delivery: ControlPlaneWebhookDeliverySummary,
  event: PublicationWebhookEvent,
}) {}

export class ControlPlaneWebhookAttemptList extends Schema.Class<ControlPlaneWebhookAttemptList>(
  "ControlPlaneWebhookAttemptList",
)({
  items: Schema.Array(WebhookDeliveryAttempt).pipe(Schema.maxItems(12)),
}) {}

export const ControlPlaneReplayWebhookRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  endpointId: WebhookEndpointId,
  eventId: WebhookEventId,
  sourceDeliveryId: Schema.NullOr(WebhookDeliveryId),
  authorityAcknowledged: Schema.Literal(true),
}).annotations({
  identifier: "ControlPlaneReplayWebhookRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneReplayWebhookRequest = typeof ControlPlaneReplayWebhookRequest.Type;

export const ProjectAuditEventId = Schema.UUID.pipe(Schema.brand("ProjectAuditEventId"));
export type ProjectAuditEventId = typeof ProjectAuditEventId.Type;

export const ProjectAuditCategory = Schema.Literal(
  "security",
  "project",
  "governance",
  "schema",
  "content",
  "publication",
  "webhook",
  "tooling",
  "other",
);
export type ProjectAuditCategory = typeof ProjectAuditCategory.Type;

const ProjectAuditAction = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(128),
  Schema.pattern(/^[a-z][a-z0-9_.-]{0,127}$/u),
);
const ProjectAuditActorId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255));

export const ControlPlaneProjectAuditQuery = Schema.Struct({
  environmentId: Schema.NullOr(EnvironmentId),
  category: Schema.Union(Schema.Literal("all"), ProjectAuditCategory),
  actorKind: Schema.Literal("all", "user", "credential"),
  actorId: Schema.NullOr(ProjectAuditActorId),
  action: Schema.NullOr(ProjectAuditAction),
  from: IsoDateTime,
  to: IsoDateTime,
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: PageLimit,
}).pipe(
  Schema.filter(
    (query) =>
      (query.actorKind === "all" && query.actorId === null) ||
      (query.actorKind !== "all" && query.actorId !== null),
    { message: () => "Exact actor filters require both actor kind and actor ID." },
  ),
  Schema.filter(
    (query) => {
      const from = Date.parse(query.from);
      const to = Date.parse(query.to);
      return to >= from && to - from <= 31 * 24 * 60 * 60 * 1_000;
    },
    { message: () => "Audit windows must be ordered and no longer than 31 days." },
  ),
  Schema.annotations({
    identifier: "ControlPlaneProjectAuditQuery",
    parseOptions: { onExcessProperty: "error" },
  }),
);
export type ControlPlaneProjectAuditQuery = typeof ControlPlaneProjectAuditQuery.Type;

export class HostedOperationalCredentialListInput extends Schema.Class<HostedOperationalCredentialListInput>(
  "HostedOperationalCredentialListInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  query: ControlPlaneCredentialListQuery,
}) {}

export class HostedProjectAuditListInput extends Schema.Class<HostedProjectAuditListInput>(
  "HostedProjectAuditListInput",
)({
  projectId: ProjectId,
  query: ControlPlaneProjectAuditQuery,
}) {}

export class HostedWebhookDeliveryListInput extends Schema.Class<HostedWebhookDeliveryListInput>(
  "HostedWebhookDeliveryListInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  query: ControlPlaneWebhookDeliveryListQuery,
}) {}

export class HostedWebhookDeliveryInput extends Schema.Class<HostedWebhookDeliveryInput>(
  "HostedWebhookDeliveryInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  deliveryId: WebhookDeliveryId,
}) {}

export class ControlPlaneProjectAuditEvent extends Schema.Class<ControlPlaneProjectAuditEvent>(
  "ControlPlaneProjectAuditEvent",
)({
  id: ProjectAuditEventId,
  projectId: ProjectId,
  environmentId: Schema.NullOr(EnvironmentId),
  actor: ProjectActor,
  action: ProjectAuditAction,
  resourceType: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[a-z][a-z0-9_.-]{0,63}$/u),
  ),
  resourceId: Schema.UUID,
  requestId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  occurredAt: IsoDateTime,
}) {}

export class ControlPlaneProjectAuditPage extends Schema.Class<ControlPlaneProjectAuditPage>(
  "ControlPlaneProjectAuditPage",
)({
  items: Schema.Array(ControlPlaneProjectAuditEvent).pipe(Schema.maxItems(maximumPageSize)),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export const ControlPlaneCredentialResponse = ApiSuccessSchema(ControlPlaneCredential);
export const ControlPlaneCredentialPageResponse = ApiSuccessSchema(ControlPlaneCredentialPage);
export const ControlPlaneIssuedCredentialResponse = ApiSuccessSchema(ControlPlaneIssuedCredential);
export const ControlPlaneStartedCredentialRotationResponse = ApiSuccessSchema(
  ControlPlaneStartedCredentialRotation,
);
export const ControlPlaneCredentialRotationResponse = ApiSuccessSchema(ApiCredentialRotation);
export const ControlPlaneWebhookEndpointResponse = ApiSuccessSchema(WebhookEndpoint);
export const ControlPlaneIssuedWebhookEndpointResponse = ApiSuccessSchema(IssuedWebhookEndpoint);
export const ControlPlaneRotatedWebhookSecretResponse = ApiSuccessSchema(RotatedWebhookSecret);
export const ControlPlaneWebhookReplayResponse = ApiSuccessSchema(ReplayWebhookEventResult);
export const ControlPlaneWebhookEndpointPageResponse = ApiSuccessSchema(
  ControlPlaneWebhookEndpointPage,
);
export const ControlPlaneInvalidationMappingResponse = ApiSuccessSchema(InvalidationRouteMapping);
export const ControlPlaneInvalidationMappingPageResponse = ApiSuccessSchema(
  ControlPlaneInvalidationMappingPage,
);
export const ControlPlaneWebhookDeliveryPageResponse = ApiSuccessSchema(
  ControlPlaneWebhookDeliveryPage,
);
export const ControlPlaneWebhookDeliveryDetailResponse = ApiSuccessSchema(
  ControlPlaneWebhookDeliveryDetail,
);
export const ControlPlaneWebhookAttemptListResponse = ApiSuccessSchema(
  ControlPlaneWebhookAttemptList,
);
export const ControlPlaneProjectAuditPageResponse = ApiSuccessSchema(ControlPlaneProjectAuditPage);

export const HostedOperationalCredentialListInputSchema = Schema.standardSchemaV1(
  HostedOperationalCredentialListInput,
);
export const HostedProjectAuditListInputSchema = Schema.standardSchemaV1(
  HostedProjectAuditListInput,
);
export const HostedWebhookDeliveryListInputSchema = Schema.standardSchemaV1(
  HostedWebhookDeliveryListInput,
);
export const HostedWebhookDeliveryInputSchema = Schema.standardSchemaV1(HostedWebhookDeliveryInput);
export const ControlPlaneCredentialPageOutputSchema = Schema.standardSchemaV1(
  ControlPlaneCredentialPageResponse,
);
export const ControlPlaneProjectAuditPageOutputSchema = Schema.standardSchemaV1(
  ControlPlaneProjectAuditPageResponse,
);
export const ControlPlaneWebhookDeliveryPageOutputSchema = Schema.standardSchemaV1(
  ControlPlaneWebhookDeliveryPageResponse,
);
export const ControlPlaneWebhookDeliveryDetailOutputSchema = Schema.standardSchemaV1(
  ControlPlaneWebhookDeliveryDetailResponse,
);
export const ControlPlaneWebhookAttemptListOutputSchema = Schema.standardSchemaV1(
  ControlPlaneWebhookAttemptListResponse,
);

export interface ControlPlaneOperationalCredentialScope {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly credentialId: ApiCredentialId;
}

export interface ControlPlaneOperationalRotationScope {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly rotationId: ApiCredentialRotationId;
}

export interface ControlPlaneOperationalWebhookScope {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly endpointId: WebhookEndpointId;
}

export interface ControlPlaneOperationalMappingScope {
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly mappingId: InvalidationRouteMappingId;
}
