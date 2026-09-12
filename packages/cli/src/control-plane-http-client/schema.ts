// Mirrors the closed Control Plane v1 wire projections without widening the public application SDK.

import { Schema } from "effect";

const Uuid = Schema.UUID;
const IsoDateTime = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);
const Version = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));
const Cursor = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512));

export const ControlPlaneCapability = Schema.Struct({
  id: Schema.NullOr(Uuid),
  key: Schema.Literal("cms"),
  status: Schema.Literal("enabled", "disabled"),
  version: Schema.NullOr(Version),
  changedAt: Schema.NullOr(IsoDateTime),
});

export const ControlPlaneWorkspace = Schema.Struct({
  id: Uuid,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(120)),
  version: Version,
  role: Schema.Literal("owner", "collaborator"),
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

const ProjectAction = Schema.Literal(
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.capability.manage",
  "studio_registration.read",
  "studio_registration.write",
);

export const ControlPlaneProject = Schema.Struct({
  id: Uuid,
  workspaceId: Uuid,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(120)),
  key: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(2_000))),
  version: Version,
  status: Schema.Literal("active", "archived"),
  archivedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  primaryEnvironment: ControlPlanePrimaryEnvironment,
  capabilities: Schema.Array(ControlPlaneCapability).pipe(Schema.maxItems(8)),
  effectiveActions: Schema.Array(ProjectAction).pipe(Schema.maxItems(7)),
});

export const ControlPlaneStudioRegistration = Schema.Struct({
  id: Uuid,
  projectId: Uuid,
  environmentId: Uuid,
  applicationOrigin: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
  mountPath: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(240)),
  version: Version,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});

export const ControlPlaneWorkspacePage = Schema.Struct({
  items: Schema.Array(ControlPlaneWorkspace).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
});

export const ControlPlaneProjectPage = Schema.Struct({
  items: Schema.Array(ControlPlaneProject).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
});

export const ControlPlaneCapabilityList = Schema.Struct({
  items: Schema.Array(ControlPlaneCapability).pipe(Schema.maxItems(8)),
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

const ErrorDetail = Schema.Struct({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
});

export const ControlPlaneFailureResponse = Schema.Struct({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: Schema.Struct({
    code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
    message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
    details: Schema.optionalWith(Schema.Array(ErrorDetail).pipe(Schema.maxItems(50)), {
      exact: true,
    }),
    retryable: Schema.Boolean,
    requestId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  }),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
});

export const controlPlaneSuccessResponse = <A, I>(data: Schema.Schema<A, I, never>) =>
  Schema.Struct({
    ok: Schema.Literal(true),
    data,
    error: Schema.Null,
    message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  });
