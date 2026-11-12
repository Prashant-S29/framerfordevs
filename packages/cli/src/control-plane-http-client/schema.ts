import { Schema } from "effect";

const Uuid = Schema.String.check(Schema.isUUID());
const IsoDateTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);
const Version = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1));
const Cursor = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512));

export const ControlPlaneCapability = Schema.Struct({
  id: Schema.NullOr(Uuid),
  key: Schema.Literal("cms"),
  status: Schema.Literals(["enabled", "disabled"]),
  version: Schema.NullOr(Version),
  changedAt: Schema.NullOr(IsoDateTime),
});

export const ControlPlaneWorkspace = Schema.Struct({
  id: Uuid,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  version: Version,
  role: Schema.Literals(["owner", "collaborator"]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ControlPlanePrimaryEnvironment = Schema.Struct({
  id: Uuid,
  key: Schema.Literal("main"),
  name: Schema.Literal("main"),
  isPrimary: Schema.Literal(true),
  createdAt: IsoDateTime,
});

const ProjectAction = Schema.Literals([
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.capability.manage",
  "studio_registration.read",
  "studio_registration.write",
]);

export const ControlPlaneProject = Schema.Struct({
  id: Uuid,
  workspaceId: Uuid,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2_000))),
  version: Version,
  status: Schema.Literals(["active", "archived"]),
  archivedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  primaryEnvironment: ControlPlanePrimaryEnvironment,
  capabilities: Schema.Array(ControlPlaneCapability).check(Schema.isMaxLength(8)),
  effectiveActions: Schema.Array(ProjectAction).check(Schema.isMaxLength(7)),
});

export const ControlPlaneProjectRole = Schema.Literals([
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
]);

export const ControlPlanePermissionAction = Schema.Literals([
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.capability.manage",
  "project.member.read",
  "project.member.invite",
  "project.member.role.update",
  "project.member.locale.update",
  "project.member.remove",
  "project.credential.read",
  "project.credential.issue",
  "project.credential.rotate",
  "project.credential.revoke",
  "project.audit.read",
  "locale.read",
  "locale.manage",
  "schema.read",
  "schema.write",
  "schema.publish",
  "delivery.configure",
  "content.read",
  "content.write",
  "content.review",
  "content.publish",
  "webhook.read",
  "webhook.manage",
]);

export const ControlPlaneLocaleAccess = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("all") }),
  Schema.Struct({
    mode: Schema.Literal("selected"),
    localeIds: Schema.Array(Uuid).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  }),
  Schema.Struct({ mode: Schema.Literal("none") }),
]);

export const ControlPlaneMember = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  userId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  email: Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(320)),
  role: ControlPlaneProjectRole,
  localeAccess: ControlPlaneLocaleAccess,
  version: Version,
  removedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ControlPlaneMemberPage = Schema.Struct({
  items: Schema.Array(ControlPlaneMember).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});

export const ControlPlaneInvitation = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  email: Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(320)),
  role: ControlPlaneProjectRole,
  localeAccess: ControlPlaneLocaleAccess,
  status: Schema.Literals(["pending", "accepted", "revoked", "expired"]),
  version: Version,
  expiresAt: IsoDateTime,
  acceptedAt: Schema.NullOr(IsoDateTime),
  revokedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ControlPlaneInvitationPage = Schema.Struct({
  items: Schema.Array(ControlPlaneInvitation).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});

export const ControlPlaneIssuedInvitation = Schema.Struct({
  invitation: ControlPlaneInvitation,
  token: Schema.String.check(Schema.isBetweenLength(43, 43), Schema.isPattern(/^[A-Za-z0-9_-]+$/u)),
});

export const ControlPlaneInspectedInvitation = Schema.Struct({
  projectId: Uuid,
  projectName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  role: ControlPlaneProjectRole,
  localeAccess: ControlPlaneLocaleAccess,
  inviterName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
  expiresAt: IsoDateTime,
});

export const ControlPlaneLocale = Schema.Struct({
  id: Uuid,
  workspaceId: Uuid,
  projectId: Uuid,
  tag: Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(35)),
  displayName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  status: Schema.Literals(["enabled", "disabled", "removed"]),
  position: Schema.NullOr(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  version: Version,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ControlPlaneLocaleList = Schema.Struct({
  items: Schema.Array(ControlPlaneLocale).check(Schema.isMaxLength(100)),
});

export const ControlPlaneGovernance = Schema.Struct({
  projectId: Uuid,
  primaryEnvironment: ControlPlanePrimaryEnvironment,
  role: ControlPlaneProjectRole,
  localeAccess: ControlPlaneLocaleAccess,
  baseRoleActions: Schema.Array(ControlPlanePermissionAction).check(Schema.isMaxLength(27)),
  effectiveProjectActions: Schema.Array(ControlPlanePermissionAction).check(Schema.isMaxLength(27)),
  effectiveLocaleIds: Schema.Array(Uuid).check(Schema.isMaxLength(100)),
  effectiveLocaleActions: Schema.Array(ControlPlanePermissionAction).check(Schema.isMaxLength(27)),
  fixedRolePolicies: Schema.Array(
    Schema.Struct({
      role: ControlPlaneProjectRole,
      baseRoleActions: Schema.Array(ControlPlanePermissionAction).check(Schema.isMaxLength(27)),
      requiresAllLocales: Schema.Boolean,
    }),
  ).check(Schema.isMinLength(7), Schema.isMaxLength(7)),
  canReadMembers: Schema.Boolean,
  canInviteMembers: Schema.Boolean,
  canUpdateMemberPolicy: Schema.Boolean,
  canRemoveMembers: Schema.Boolean,
});

export const ControlPlaneStudioRegistration = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  environmentId: Uuid,
  applicationOrigin: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  mountPath: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240)),
  version: Version,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ControlPlaneWorkspacePage = Schema.Struct({
  items: Schema.Array(ControlPlaneWorkspace).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});

export const ControlPlaneProjectPage = Schema.Struct({
  items: Schema.Array(ControlPlaneProject).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});

export const ControlPlaneCapabilityList = Schema.Struct({
  items: Schema.Array(ControlPlaneCapability).check(Schema.isMaxLength(8)),
});

export const ControlPlaneCreateWorkspaceResult = Schema.Struct({
  workspace: ControlPlaneWorkspace,
  replayed: Schema.Boolean,
});

export const ControlPlaneCreateProjectResult = Schema.Struct({
  project: ControlPlaneProject,
  replayed: Schema.Boolean,
});

export const ControlPlaneEnableCapabilityResult = Schema.Struct({
  capability: ControlPlaneCapability,
  replayed: Schema.Boolean,
});

export const ControlPlanePutStudioRegistrationResult = Schema.Struct({
  registration: ControlPlaneStudioRegistration,
  created: Schema.Boolean,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
});

export const ControlPlaneSetStudioRuntimeResult = Schema.Struct({
  registration: ControlPlaneStudioRegistration,
  runtimeStatus: Schema.Literals(["inactive", "active"]),
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
});

const CredentialFamily = Schema.Literals(["management", "delivery", "preview"]);
const CredentialStatus = Schema.Literals([
  "pending",
  "active",
  "retiring",
  "expired",
  "revoked",
  "canceled",
]);
const CredentialRotation = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  environmentId: Uuid,
  predecessorCredentialId: Uuid,
  successorCredentialId: Uuid,
  status: Schema.Literals(["pending", "overlap", "canceled", "completed"]),
  version: Version,
  activatedAt: Schema.NullOr(IsoDateTime),
  retireAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  canceledAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export const ControlPlaneCredential = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  environmentId: Uuid,
  family: CredentialFamily,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  keyPrefix: Schema.String.check(Schema.isMinLength(44), Schema.isMaxLength(45)),
  scopes: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(16),
  ),
  status: CredentialStatus,
  version: Version,
  activatedAt: Schema.NullOr(IsoDateTime),
  expiresAt: Schema.NullOr(IsoDateTime),
  retireAt: Schema.NullOr(IsoDateTime),
  revokedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  openRotation: Schema.NullOr(CredentialRotation),
});
export const ControlPlaneCredentialPage = Schema.Struct({
  items: Schema.Array(ControlPlaneCredential).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});
export const ControlPlaneIssuedCredential = Schema.Struct({
  credential: ControlPlaneCredential,
  key: Schema.String.check(Schema.isMinLength(88), Schema.isMaxLength(89)),
});
export const ControlPlaneStartedCredentialRotation = Schema.Struct({
  rotation: CredentialRotation,
  successor: ControlPlaneCredential,
  key: Schema.String.check(Schema.isMinLength(88), Schema.isMaxLength(89)),
});
export { CredentialRotation as ControlPlaneCredentialRotation };

const WebhookState = Schema.Literals(["enabled", "disabled"]);
const WebhookEventType = Schema.Literals([
  "cms.schema.published",
  "cms.entry.published",
  "cms.entry.unpublished",
]);
const WebhookEndpoint = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  environmentId: Uuid,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  state: WebhookState,
  version: Version,
  destinationOrigin: Schema.String.check(Schema.isMinLength(9), Schema.isMaxLength(255)),
  subscriptions: Schema.Array(WebhookEventType).check(Schema.isMinLength(1), Schema.isMaxLength(3)),
  rotationState: Schema.NullOr(
    Schema.Literals(["pending", "active", "retiring", "retired", "canceled"]),
  ),
  rotationEndsAt: Schema.NullOr(IsoDateTime),
  lastOutcome: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
  deadLetterCount: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  enabledAt: Schema.NullOr(IsoDateTime),
  disabledAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export { WebhookEndpoint as ControlPlaneWebhookEndpoint };
export const ControlPlaneWebhookEndpointPage = Schema.Struct({
  items: Schema.Array(WebhookEndpoint).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});
export const ControlPlaneIssuedWebhookEndpoint = Schema.Struct({
  endpoint: WebhookEndpoint,
  secret: Schema.String.check(Schema.isBetweenLength(49, 49)),
});
export const ControlPlaneRotatedWebhookSecret = Schema.Struct({
  endpointId: Uuid,
  secretId: Uuid,
  secret: Schema.String.check(Schema.isBetweenLength(49, 49)),
  state: Schema.Literal("pending"),
});

const InvalidationMapping = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  environmentId: Uuid,
  collectionId: Uuid,
  entryId: Schema.NullOr(Uuid),
  localeId: Schema.NullOr(Uuid),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  eventTypes: Schema.Array(WebhookEventType).check(Schema.isMinLength(1), Schema.isMaxLength(3)),
  route: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  semanticTags: Schema.Array(
    Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(64)),
  ).check(Schema.isMaxLength(10)),
  state: WebhookState,
  version: Version,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export { InvalidationMapping as ControlPlaneInvalidationMapping };
export const ControlPlaneInvalidationMappingPage = Schema.Struct({
  items: Schema.Array(InvalidationMapping).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});

const WebhookDeliverySummary = Schema.Struct({
  id: Uuid,
  eventId: Uuid,
  endpointId: Uuid,
  eventType: WebhookEventType,
  eventTime: IsoDateTime,
  kind: Schema.Literals(["initial", "replay"]),
  status: Schema.Literals([
    "queued",
    "delivering",
    "retry_scheduled",
    "succeeded",
    "dead_letter",
    "canceled",
  ]),
  attemptCount: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 12 })),
  nextAttemptAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  lastOutcome: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export const ControlPlaneWebhookDeliveryPage = Schema.Struct({
  items: Schema.Array(WebhookDeliverySummary).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});
const WebhookEvent = Schema.Struct({
  specversion: Schema.Literal("1.0"),
  id: Uuid,
  source: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160)),
  subject: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  time: IsoDateTime,
  datacontenttype: Schema.Literal("application/json"),
  type: WebhookEventType,
  data: Schema.Unknown,
});
export const ControlPlaneWebhookDeliveryDetail = Schema.Struct({
  delivery: WebhookDeliverySummary,
  event: WebhookEvent,
});
const WebhookDelivery = Schema.Struct({
  id: Uuid,
  eventId: Uuid,
  endpointId: Uuid,
  event: WebhookEvent,
  kind: Schema.Literals(["initial", "replay"]),
  status: Schema.Literals([
    "queued",
    "delivering",
    "retry_scheduled",
    "succeeded",
    "dead_letter",
    "canceled",
  ]),
  attemptCount: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 12 })),
  nextAttemptAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  lastOutcome: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export const ControlPlaneWebhookReplay = Schema.Struct({
  delivery: WebhookDelivery,
  replayedBy: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("user"),
      id: Schema.String.check(Schema.isMinLength(1)),
    }),
    Schema.Struct({ kind: Schema.Literal("credential"), id: Uuid }),
  ]),
});
const WebhookAttempt = Schema.Struct({
  id: Uuid,
  deliveryId: Uuid,
  eventId: Uuid,
  endpointId: Uuid,
  attemptNumber: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 12 })),
  state: Schema.Literals([
    "started",
    "succeeded",
    "retry_scheduled",
    "dead_letter",
    "abandoned",
    "canceled",
  ]),
  startedAt: IsoDateTime,
  completedAt: Schema.NullOr(IsoDateTime),
  durationMs: Schema.NullOr(Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  httpStatus: Schema.NullOr(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 100, maximum: 599 })),
  ),
  statusFamily: Schema.NullOr(Schema.Literals(["1xx", "2xx", "3xx", "4xx", "5xx"])),
  outcome: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))),
  nextAttemptAt: Schema.NullOr(IsoDateTime),
});
export const ControlPlaneWebhookAttemptList = Schema.Struct({
  items: Schema.Array(WebhookAttempt).check(Schema.isMaxLength(12)),
});

const ProjectActor = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("user"),
    id: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({ kind: Schema.Literal("credential"), id: Uuid }),
]);
export const ControlPlaneAuditPage = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      id: Uuid,
      projectId: Uuid,
      environmentId: Schema.NullOr(Uuid),
      actor: ProjectActor,
      action: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
      resourceType: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
      resourceId: Uuid,
      requestId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
      occurredAt: IsoDateTime,
    }),
  ).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
});

const ErrorDetail = Schema.Struct({
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
});

export const ControlPlaneFailureResponse = Schema.Struct({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: Schema.Struct({
    code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
    details: Schema.optionalKey(Schema.Array(ErrorDetail).check(Schema.isMaxLength(50))),
    retryable: Schema.Boolean,
    requestId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  }),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
});

export const controlPlaneSuccessResponse = <A, I>(data: Schema.Codec<A, I, never>) =>
  Schema.Struct({
    ok: Schema.Literal(true),
    data,
    error: Schema.Null,
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  });
