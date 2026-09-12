// Defines the closed, tenant-safe Control Plane v1 request and response contracts.

import { Schema } from "effect";

import { ApiCredentialId } from "../access";
import {
  AuthUserId,
  Capability,
  EnvironmentId,
  IsoDateTime,
  ProjectDescription,
  ProjectId,
  ProjectKey,
  ProjectName,
  ResourceVersion,
  WorkspaceId,
  WorkspaceName,
  WorkspaceRole,
} from "../platform";
import { ApiErrorDetail, ApiSuccessSchema, RequestIdSchema } from "../response/api";

const textEncoder = new TextEncoder();

function utf8Length(value: string): number {
  return textEncoder.encode(value).byteLength;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

function isCanonicalStudioOrigin(value: string): boolean {
  if (utf8Length(value) > 2_048 || hasControlCharacter(value) || value.includes("\\")) {
    return false;
  }
  try {
    const url = new URL(value);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.hostname.includes("*") ||
      url.origin !== value
    ) {
      return false;
    }
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}

function isCanonicalMountPath(value: string): boolean {
  if (
    utf8Length(value) > 240 ||
    value === "/" ||
    !value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("%") ||
    /\s/u.test(value) ||
    hasControlCharacter(value)
  ) {
    return false;
  }
  const segments = value.slice(1).split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export const controlPlaneLimits = {
  requestBytes: 65_536,
  responseBytes: 524_288,
  queryBytes: 4_096,
  defaultPageSize: 20,
  maximumPageSize: 50,
  maximumCursorInputBytes: 2_048,
  maximumCursorOutputBytes: 512,
  maximumErrorDetails: 50,
  maximumInitialCapabilities: 8,
  maximumStudioOriginBytes: 2_048,
  maximumStudioMountPathBytes: 240,
} as const;

export const ControlPlaneCommandId = Schema.UUID.pipe(Schema.brand("ControlPlaneCommandId"));
export type ControlPlaneCommandId = typeof ControlPlaneCommandId.Type;

export const ControlPlaneCommandOperation = Schema.Literal(
  "workspace.create",
  "project.create",
  "project.capability.enable",
  "studio_registration.put",
);
export type ControlPlaneCommandOperation = typeof ControlPlaneCommandOperation.Type;

export const StudioRegistrationId = Schema.UUID.pipe(Schema.brand("StudioRegistrationId"));
export type StudioRegistrationId = typeof StudioRegistrationId.Type;

export const ControlPlaneCursorInput = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(controlPlaneLimits.maximumCursorInputBytes),
  Schema.filter((value) => utf8Length(value) <= controlPlaneLimits.maximumCursorInputBytes),
  Schema.brand("ControlPlaneCursorInput"),
);
export type ControlPlaneCursorInput = typeof ControlPlaneCursorInput.Type;

export const ControlPlaneCursor = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(controlPlaneLimits.maximumCursorOutputBytes),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
  Schema.brand("ControlPlaneCursor"),
);
export type ControlPlaneCursor = typeof ControlPlaneCursor.Type;

export const StudioApplicationOrigin = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(controlPlaneLimits.maximumStudioOriginBytes),
  Schema.filter(isCanonicalStudioOrigin, {
    message: () => "Use a canonical HTTPS origin or an explicit loopback HTTP origin.",
  }),
  Schema.brand("StudioApplicationOrigin"),
);
export type StudioApplicationOrigin = typeof StudioApplicationOrigin.Type;

export const StudioMountPath = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(controlPlaneLimits.maximumStudioMountPathBytes),
  Schema.filter(isCanonicalMountPath, {
    message: () => "Use a canonical non-root absolute mount path.",
  }),
  Schema.brand("StudioMountPath"),
);
export type StudioMountPath = typeof StudioMountPath.Type;

export const ControlPlaneActor = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("user"), id: AuthUserId }),
  Schema.Struct({ kind: Schema.Literal("credential"), id: ApiCredentialId }),
).annotations({ identifier: "ControlPlaneActor", parseOptions: { onExcessProperty: "error" } });
export type ControlPlaneActor = typeof ControlPlaneActor.Type;

export const ControlPlaneProjectStatus = Schema.Literal("active", "archived");
export type ControlPlaneProjectStatus = typeof ControlPlaneProjectStatus.Type;

export const ControlPlaneProjectAction = Schema.Literal(
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.capability.manage",
  "studio_registration.read",
  "studio_registration.write",
);
export type ControlPlaneProjectAction = typeof ControlPlaneProjectAction.Type;

const ControlPlaneProjectActions = Schema.Array(ControlPlaneProjectAction).pipe(
  Schema.maxItems(7),
  Schema.filter((actions) => new Set(actions).size === actions.length, {
    message: () => "Effective project actions must be unique.",
  }),
);

export class ControlPlaneWorkspace extends Schema.Class<ControlPlaneWorkspace>(
  "ControlPlaneWorkspace",
)({
  id: WorkspaceId,
  name: WorkspaceName,
  version: ResourceVersion,
  role: WorkspaceRole,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class ControlPlanePrimaryEnvironment extends Schema.Class<ControlPlanePrimaryEnvironment>(
  "ControlPlanePrimaryEnvironment",
)({
  id: EnvironmentId,
  key: Schema.Literal("main"),
  name: Schema.Literal("main"),
  isPrimary: Schema.Literal(true),
  createdAt: IsoDateTime,
}) {}

export class ControlPlaneProject extends Schema.Class<ControlPlaneProject>("ControlPlaneProject")({
  id: ProjectId,
  workspaceId: WorkspaceId,
  name: ProjectName,
  key: ProjectKey,
  description: Schema.NullOr(ProjectDescription),
  version: ResourceVersion,
  status: ControlPlaneProjectStatus,
  archivedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  primaryEnvironment: ControlPlanePrimaryEnvironment,
  capabilities: Schema.Array(Capability).pipe(Schema.maxItems(8)),
  effectiveActions: ControlPlaneProjectActions,
}) {}

export class ControlPlaneWorkspacePage extends Schema.Class<ControlPlaneWorkspacePage>(
  "ControlPlaneWorkspacePage",
)({
  items: Schema.Array(ControlPlaneWorkspace).pipe(
    Schema.maxItems(controlPlaneLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneProjectPage extends Schema.Class<ControlPlaneProjectPage>(
  "ControlPlaneProjectPage",
)({
  items: Schema.Array(ControlPlaneProject).pipe(
    Schema.maxItems(controlPlaneLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneCapabilityList extends Schema.Class<ControlPlaneCapabilityList>(
  "ControlPlaneCapabilityList",
)({
  items: Schema.Array(Capability).pipe(Schema.maxItems(8)),
}) {}

export class StudioRegistration extends Schema.Class<StudioRegistration>("StudioRegistration")({
  id: StudioRegistrationId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  applicationOrigin: StudioApplicationOrigin,
  mountPath: StudioMountPath,
  version: ResourceVersion,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

const ControlPlanePageLimit = Schema.Number.pipe(
  Schema.int(),
  Schema.between(1, controlPlaneLimits.maximumPageSize),
);

export const ControlPlaneListWorkspacesQuery = Schema.Struct({
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}).annotations({
  identifier: "ControlPlaneListWorkspacesQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneListWorkspacesQuery = typeof ControlPlaneListWorkspacesQuery.Type;

export const ControlPlaneCreateWorkspaceRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  name: WorkspaceName,
}).annotations({
  identifier: "ControlPlaneCreateWorkspaceRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneCreateWorkspaceRequest = typeof ControlPlaneCreateWorkspaceRequest.Type;

export const ControlPlaneListProjectsQuery = Schema.Struct({
  status: ControlPlaneProjectStatus,
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}).annotations({
  identifier: "ControlPlaneListProjectsQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneListProjectsQuery = typeof ControlPlaneListProjectsQuery.Type;

export class ControlPlaneListProjectsInput extends Schema.Class<ControlPlaneListProjectsInput>(
  "ControlPlaneListProjectsInput",
)({
  workspaceId: WorkspaceId,
  status: ControlPlaneProjectStatus,
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}) {}

export const ControlPlaneInitialCapabilities = Schema.Array(Schema.Literal("cms")).pipe(
  Schema.maxItems(controlPlaneLimits.maximumInitialCapabilities),
  Schema.filter((capabilities) => new Set(capabilities).size === capabilities.length, {
    message: () => "Initial capabilities must be unique.",
  }),
);
export type ControlPlaneInitialCapabilities = typeof ControlPlaneInitialCapabilities.Type;

export const ControlPlaneCreateProjectRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  name: ProjectName,
  key: ProjectKey,
  description: Schema.NullOr(ProjectDescription),
  initialCapabilities: ControlPlaneInitialCapabilities,
}).annotations({
  identifier: "ControlPlaneCreateProjectRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneCreateProjectRequest = typeof ControlPlaneCreateProjectRequest.Type;

export class ControlPlaneCreateProjectInput extends Schema.Class<ControlPlaneCreateProjectInput>(
  "ControlPlaneCreateProjectInput",
)({
  workspaceId: WorkspaceId,
  commandId: ControlPlaneCommandId,
  name: ProjectName,
  key: ProjectKey,
  description: Schema.NullOr(ProjectDescription),
  initialCapabilities: ControlPlaneInitialCapabilities,
}) {}

export class ControlPlaneWorkspaceScope extends Schema.Class<ControlPlaneWorkspaceScope>(
  "ControlPlaneWorkspaceScope",
)({
  workspaceId: WorkspaceId,
}) {}

export class ControlPlaneProjectScope extends Schema.Class<ControlPlaneProjectScope>(
  "ControlPlaneProjectScope",
)({
  projectId: ProjectId,
}) {}

export const ControlPlaneUpdateProjectRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  name: ProjectName,
  description: Schema.NullOr(ProjectDescription),
}).annotations({
  identifier: "ControlPlaneUpdateProjectRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneUpdateProjectRequest = typeof ControlPlaneUpdateProjectRequest.Type;

export class ControlPlaneUpdateProjectInput extends Schema.Class<ControlPlaneUpdateProjectInput>(
  "ControlPlaneUpdateProjectInput",
)({
  projectId: ProjectId,
  expectedVersion: ResourceVersion,
  name: ProjectName,
  description: Schema.NullOr(ProjectDescription),
}) {}

export const ControlPlaneProjectLifecycleRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
}).annotations({
  identifier: "ControlPlaneProjectLifecycleRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneProjectLifecycleRequest = typeof ControlPlaneProjectLifecycleRequest.Type;

export class ControlPlaneProjectLifecycleInput extends Schema.Class<ControlPlaneProjectLifecycleInput>(
  "ControlPlaneProjectLifecycleInput",
)({
  projectId: ProjectId,
  expectedVersion: ResourceVersion,
}) {}

export const ControlPlaneEnableCapabilityRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
}).annotations({
  identifier: "ControlPlaneEnableCapabilityRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlaneEnableCapabilityRequest = typeof ControlPlaneEnableCapabilityRequest.Type;

export class ControlPlaneEnableCapabilityInput extends Schema.Class<ControlPlaneEnableCapabilityInput>(
  "ControlPlaneEnableCapabilityInput",
)({
  projectId: ProjectId,
  commandId: ControlPlaneCommandId,
}) {}

export class ControlPlaneStudioRegistrationScope extends Schema.Class<ControlPlaneStudioRegistrationScope>(
  "ControlPlaneStudioRegistrationScope",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
}) {}

export const ControlPlanePutStudioRegistrationRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  expectedVersion: Schema.NullOr(ResourceVersion),
  applicationOrigin: StudioApplicationOrigin,
  mountPath: StudioMountPath,
}).annotations({
  identifier: "ControlPlanePutStudioRegistrationRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type ControlPlanePutStudioRegistrationRequest =
  typeof ControlPlanePutStudioRegistrationRequest.Type;

export class ControlPlanePutStudioRegistrationInput extends Schema.Class<ControlPlanePutStudioRegistrationInput>(
  "ControlPlanePutStudioRegistrationInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  commandId: ControlPlaneCommandId,
  expectedVersion: Schema.NullOr(ResourceVersion),
  applicationOrigin: StudioApplicationOrigin,
  mountPath: StudioMountPath,
}) {}

export class ControlPlaneCreateWorkspaceResult extends Schema.Class<ControlPlaneCreateWorkspaceResult>(
  "ControlPlaneCreateWorkspaceResult",
)({
  workspace: ControlPlaneWorkspace,
  replayed: Schema.Boolean,
}) {}

export class ControlPlaneCreateProjectResult extends Schema.Class<ControlPlaneCreateProjectResult>(
  "ControlPlaneCreateProjectResult",
)({
  project: ControlPlaneProject,
  replayed: Schema.Boolean,
}) {}

export class ControlPlaneEnableCapabilityResult extends Schema.Class<ControlPlaneEnableCapabilityResult>(
  "ControlPlaneEnableCapabilityResult",
)({
  capability: Capability,
  replayed: Schema.Boolean,
}) {}

export class ControlPlanePutStudioRegistrationResult extends Schema.Class<ControlPlanePutStudioRegistrationResult>(
  "ControlPlanePutStudioRegistrationResult",
)({
  registration: StudioRegistration,
  created: Schema.Boolean,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
}) {}

export const ControlPlaneApiErrorCode = Schema.Literal(
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PROJECT_KEY_CONFLICT",
  "VERSION_CONFLICT",
  "INVALID_STATE_TRANSITION",
  "COMMAND_CONFLICT",
  "CMS_CAPABILITY_REQUIRED",
  "CONTROL_PLANE_CURSOR_INVALID",
  "CONTROL_PLANE_REQUEST_TOO_LARGE",
  "CONTROL_PLANE_RESPONSE_TOO_LARGE",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
);
export type ControlPlaneApiErrorCode = typeof ControlPlaneApiErrorCode.Type;

export class ControlPlaneApiError extends Schema.Class<ControlPlaneApiError>(
  "ControlPlaneApiError",
)({
  code: ControlPlaneApiErrorCode,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(
    Schema.Array(ApiErrorDetail).pipe(
      Schema.minItems(1),
      Schema.maxItems(controlPlaneLimits.maximumErrorDetails),
    ),
    { exact: true },
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class ControlPlaneApiFailure extends Schema.Class<ControlPlaneApiFailure>(
  "ControlPlaneApiFailure",
)({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: ControlPlaneApiError,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export const ControlPlaneWorkspaceResponse = ApiSuccessSchema(ControlPlaneWorkspace);
export const ControlPlaneWorkspacePageResponse = ApiSuccessSchema(ControlPlaneWorkspacePage);
export const ControlPlaneCreateWorkspaceResponse = ApiSuccessSchema(
  ControlPlaneCreateWorkspaceResult,
);
export const ControlPlaneProjectResponse = ApiSuccessSchema(ControlPlaneProject);
export const ControlPlaneProjectPageResponse = ApiSuccessSchema(ControlPlaneProjectPage);
export const ControlPlaneCreateProjectResponse = ApiSuccessSchema(ControlPlaneCreateProjectResult);
export const ControlPlaneCapabilityListResponse = ApiSuccessSchema(ControlPlaneCapabilityList);
export const ControlPlaneEnableCapabilityResponse = ApiSuccessSchema(
  ControlPlaneEnableCapabilityResult,
);
export const StudioRegistrationResponse = ApiSuccessSchema(StudioRegistration);
export const ControlPlanePutStudioRegistrationResponse = ApiSuccessSchema(
  ControlPlanePutStudioRegistrationResult,
);

export const ControlPlaneWorkspaceScopeSchema = Schema.standardSchemaV1(ControlPlaneWorkspaceScope);
export const ControlPlaneProjectScopeSchema = Schema.standardSchemaV1(ControlPlaneProjectScope);
export const ControlPlaneProjectLifecycleInputSchema = Schema.standardSchemaV1(
  ControlPlaneProjectLifecycleInput,
);
export const ControlPlaneUpdateProjectInputSchema = Schema.standardSchemaV1(
  ControlPlaneUpdateProjectInput,
);
export const ControlPlaneWorkspaceOutputSchema = Schema.standardSchemaV1(
  ControlPlaneWorkspaceResponse,
);
export const ControlPlaneProjectOutputSchema = Schema.standardSchemaV1(ControlPlaneProjectResponse);
export const ControlPlaneCapabilityListOutputSchema = Schema.standardSchemaV1(
  ControlPlaneCapabilityListResponse,
);
export const ControlPlaneCreateProjectInputSchema = Schema.standardSchemaV1(
  ControlPlaneCreateProjectInput,
);
export const ControlPlaneEnableCapabilityInputSchema = Schema.standardSchemaV1(
  ControlPlaneEnableCapabilityInput,
);
export const ControlPlaneEnableCapabilityOutputSchema = Schema.standardSchemaV1(
  ControlPlaneEnableCapabilityResponse,
);
export const ControlPlaneStudioRegistrationScopeSchema = Schema.standardSchemaV1(
  ControlPlaneStudioRegistrationScope,
);
export const ControlPlanePutStudioRegistrationInputSchema = Schema.standardSchemaV1(
  ControlPlanePutStudioRegistrationInput,
);
export const StudioRegistrationOutputSchema = Schema.standardSchemaV1(StudioRegistrationResponse);
export const ControlPlanePutStudioRegistrationOutputSchema = Schema.standardSchemaV1(
  ControlPlanePutStudioRegistrationResponse,
);
