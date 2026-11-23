export * from "./operational";

import { Schema } from "effect";

import {
  CanonicalEmail,
  InspectedProjectInvitation,
  InvitationToken,
  IssuedProjectInvitation,
  ProjectActor,
  ProjectInvitation,
  ProjectInvitationListStatus,
  ProjectLocaleAccess,
  ProjectMember,
  ProjectPermissionActions,
  ProjectRole,
  projectRoleValues,
} from "../access";
import {
  LocaleDisplayName,
  LocaleTag,
  ProjectLocale,
  ProjectLocaleId,
  ProjectLocaleStatus,
} from "../locale";
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

import { Uuid } from "../uuid";
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

function isCanonicalPreviewUrl(value: string): boolean {
  if (utf8Length(value) > 2_048 || hasControlCharacter(value) || value.includes("\\")) {
    return false;
  }
  try {
    const url = new URL(value);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      value.includes("?") ||
      value.includes("#") ||
      url.hostname.includes("*") ||
      url.href !== value ||
      !isCanonicalStudioOrigin(url.origin)
    ) {
      return false;
    }
    return url.pathname.startsWith("/") && !/\s/u.test(url.pathname);
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

const PORTABLE_STUDIO_MOUNT_PATH_PATTERN = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u;

export function isPortableStudioMountPath(value: string): boolean {
  return (
    utf8Length(value) <= controlPlaneLimits.maximumStudioMountPathBytes &&
    PORTABLE_STUDIO_MOUNT_PATH_PATTERN.test(value)
  );
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

export const ControlPlaneCommandId = Uuid.pipe(Schema.brand("ControlPlaneCommandId"));
export type ControlPlaneCommandId = typeof ControlPlaneCommandId.Type;

export const ControlPlaneCommandOperation = Schema.Literals([
  "workspace.create",
  "project.create",
  "project.capability.enable",
  "studio_registration.put",
  "studio_registration.runtime.set",
  "project_locale.create",
  "invalidation_mapping.create",
  "preview_target.put",
  "preview_target.clear",
]);
export type ControlPlaneCommandOperation = typeof ControlPlaneCommandOperation.Type;

export const StudioRegistrationId = Uuid.pipe(Schema.brand("StudioRegistrationId"));
export type StudioRegistrationId = typeof StudioRegistrationId.Type;

export const StudioRuntimeStatus = Schema.Literals(["inactive", "active"]);
export type StudioRuntimeStatus = typeof StudioRuntimeStatus.Type;

export const ControlPlaneCursorInput = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(controlPlaneLimits.maximumCursorInputBytes),
  Schema.makeFilter((value) => utf8Length(value) <= controlPlaneLimits.maximumCursorInputBytes),
).pipe(Schema.brand("ControlPlaneCursorInput"));
export type ControlPlaneCursorInput = typeof ControlPlaneCursorInput.Type;

export const ControlPlaneCursor = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(controlPlaneLimits.maximumCursorOutputBytes),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
).pipe(Schema.brand("ControlPlaneCursor"));
export type ControlPlaneCursor = typeof ControlPlaneCursor.Type;

export const StudioApplicationOrigin = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(controlPlaneLimits.maximumStudioOriginBytes),
  Schema.makeFilter(isCanonicalStudioOrigin, {
    message: "Use a canonical HTTPS origin or an explicit loopback HTTP origin.",
  }),
).pipe(Schema.brand("StudioApplicationOrigin"));
export type StudioApplicationOrigin = typeof StudioApplicationOrigin.Type;

export const PreviewTargetUrl = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2_048),
  Schema.makeFilter(isCanonicalPreviewUrl, {
    message:
      "Use a canonical HTTPS URL, or an explicit loopback HTTP URL, with a path and no query.",
  }),
).pipe(Schema.brand("PreviewTargetUrl"));
export type PreviewTargetUrl = typeof PreviewTargetUrl.Type;

export const StudioMountPath = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(controlPlaneLimits.maximumStudioMountPathBytes),
  Schema.makeFilter(isCanonicalMountPath, {
    message: "Use a canonical non-root absolute mount path.",
  }),
).pipe(Schema.brand("StudioMountPath"));
export type StudioMountPath = typeof StudioMountPath.Type;

export const PortableStudioMountPath = StudioMountPath.check(
  Schema.makeFilter(isPortableStudioMountPath, {
    message: "Use portable ASCII Studio mount segments.",
  }),
).pipe(Schema.brand("PortableStudioMountPath"));
export type PortableStudioMountPath = typeof PortableStudioMountPath.Type;

export const ControlPlaneActor = ProjectActor.annotate({ identifier: "ControlPlaneActor" });
export type ControlPlaneActor = typeof ControlPlaneActor.Type;

export const ControlPlaneProjectStatus = Schema.Literals(["active", "archived"]);
export type ControlPlaneProjectStatus = typeof ControlPlaneProjectStatus.Type;

export const ControlPlaneProjectAction = Schema.Literals([
  "project.read",
  "project.update",
  "project.archive",
  "project.restore",
  "project.capability.manage",
  "studio_registration.read",
  "studio_registration.write",
]);
export type ControlPlaneProjectAction = typeof ControlPlaneProjectAction.Type;

const ControlPlaneProjectActions = Schema.Array(ControlPlaneProjectAction).check(
  Schema.isMaxLength(7),
  Schema.makeFilter((actions) => new Set(actions).size === actions.length, {
    message: "Effective project actions must be unique.",
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
  capabilities: Schema.Array(Capability).check(Schema.isMaxLength(8)),
  effectiveActions: ControlPlaneProjectActions,
}) {}

export class ControlPlaneWorkspacePage extends Schema.Class<ControlPlaneWorkspacePage>(
  "ControlPlaneWorkspacePage",
)({
  items: Schema.Array(ControlPlaneWorkspace).check(
    Schema.isMaxLength(controlPlaneLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneProjectPage extends Schema.Class<ControlPlaneProjectPage>(
  "ControlPlaneProjectPage",
)({
  items: Schema.Array(ControlPlaneProject).check(
    Schema.isMaxLength(controlPlaneLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneCapabilityList extends Schema.Class<ControlPlaneCapabilityList>(
  "ControlPlaneCapabilityList",
)({
  items: Schema.Array(Capability).check(Schema.isMaxLength(8)),
}) {}

export class StudioRegistration extends Schema.Class<StudioRegistration>("StudioRegistration")({
  id: StudioRegistrationId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  applicationOrigin: StudioApplicationOrigin,
  mountPath: StudioMountPath,
  runtimeStatus: StudioRuntimeStatus,
  runtimeChangedAt: Schema.NullOr(IsoDateTime),
  runtimeChangedByUserId: Schema.NullOr(AuthUserId),
  version: ResourceVersion,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

const ControlPlanePageLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: controlPlaneLimits.maximumPageSize }),
);

export const ControlPlaneListWorkspacesQuery = Schema.Struct({
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}).annotate({ identifier: "ControlPlaneListWorkspacesQuery" });
export type ControlPlaneListWorkspacesQuery = typeof ControlPlaneListWorkspacesQuery.Type;

export const ControlPlaneCreateWorkspaceRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  name: WorkspaceName,
}).annotate({ identifier: "ControlPlaneCreateWorkspaceRequest" });
export type ControlPlaneCreateWorkspaceRequest = typeof ControlPlaneCreateWorkspaceRequest.Type;

export const ControlPlaneListProjectsQuery = Schema.Struct({
  status: ControlPlaneProjectStatus,
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}).annotate({ identifier: "ControlPlaneListProjectsQuery" });
export type ControlPlaneListProjectsQuery = typeof ControlPlaneListProjectsQuery.Type;

export class ControlPlaneListProjectsInput extends Schema.Class<ControlPlaneListProjectsInput>(
  "ControlPlaneListProjectsInput",
)({
  workspaceId: WorkspaceId,
  status: ControlPlaneProjectStatus,
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}) {}

export const ControlPlaneInitialCapabilities = Schema.Array(Schema.Literal("cms")).check(
  Schema.isMaxLength(controlPlaneLimits.maximumInitialCapabilities),
  Schema.makeFilter((capabilities) => new Set(capabilities).size === capabilities.length, {
    message: "Initial capabilities must be unique.",
  }),
);
export type ControlPlaneInitialCapabilities = typeof ControlPlaneInitialCapabilities.Type;

export const ControlPlaneCreateProjectRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  name: ProjectName,
  key: ProjectKey,
  description: Schema.NullOr(ProjectDescription),
  initialCapabilities: ControlPlaneInitialCapabilities,
}).annotate({ identifier: "ControlPlaneCreateProjectRequest" });
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
}).annotate({ identifier: "ControlPlaneUpdateProjectRequest" });
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
}).annotate({ identifier: "ControlPlaneProjectLifecycleRequest" });
export type ControlPlaneProjectLifecycleRequest = typeof ControlPlaneProjectLifecycleRequest.Type;

export class ControlPlaneProjectLifecycleInput extends Schema.Class<ControlPlaneProjectLifecycleInput>(
  "ControlPlaneProjectLifecycleInput",
)({
  projectId: ProjectId,
  expectedVersion: ResourceVersion,
}) {}

export const ControlPlaneEnableCapabilityRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
}).annotate({ identifier: "ControlPlaneEnableCapabilityRequest" });
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
}).annotate({ identifier: "ControlPlanePutStudioRegistrationRequest" });
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

export const ControlPlaneSetStudioRuntimeRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  expectedVersion: ResourceVersion,
  enabled: Schema.Boolean,
}).annotate({ identifier: "ControlPlaneSetStudioRuntimeRequest" });
export type ControlPlaneSetStudioRuntimeRequest = typeof ControlPlaneSetStudioRuntimeRequest.Type;

export class ControlPlaneSetStudioRuntimeInput extends Schema.Class<ControlPlaneSetStudioRuntimeInput>(
  "ControlPlaneSetStudioRuntimeInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  commandId: ControlPlaneCommandId,
  expectedVersion: ResourceVersion,
  enabled: Schema.Boolean,
}) {}

export const ControlPlaneMemberListQuery = Schema.Struct({
  role: Schema.NullOr(ProjectRole),
  search: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)).pipe(
      Schema.brand("MemberSearch"),
    ),
  ),
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}).annotate({ identifier: "ControlPlaneMemberListQuery" });
export type ControlPlaneMemberListQuery = typeof ControlPlaneMemberListQuery.Type;

export const ControlPlaneInvitationListQuery = Schema.Struct({
  status: ProjectInvitationListStatus,
  search: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)).pipe(
      Schema.brand("InvitationSearch"),
    ),
  ),
  cursor: Schema.NullOr(ControlPlaneCursorInput),
  limit: ControlPlanePageLimit,
}).annotate({ identifier: "ControlPlaneInvitationListQuery" });
export type ControlPlaneInvitationListQuery = typeof ControlPlaneInvitationListQuery.Type;

export const ControlPlaneMemberPolicyRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
}).annotate({ identifier: "ControlPlaneMemberPolicyRequest" });
export type ControlPlaneMemberPolicyRequest = typeof ControlPlaneMemberPolicyRequest.Type;

export const ControlPlaneVersionRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
}).annotate({ identifier: "ControlPlaneVersionRequest" });
export type ControlPlaneVersionRequest = typeof ControlPlaneVersionRequest.Type;

export const ControlPlaneCreateInvitationRequest = Schema.Struct({
  email: CanonicalEmail,
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
}).annotate({ identifier: "ControlPlaneCreateInvitationRequest" });
export type ControlPlaneCreateInvitationRequest = typeof ControlPlaneCreateInvitationRequest.Type;

export const ControlPlaneInvitationTokenRequest = Schema.Struct({
  token: InvitationToken,
}).annotate({ identifier: "ControlPlaneInvitationTokenRequest" });
export type ControlPlaneInvitationTokenRequest = typeof ControlPlaneInvitationTokenRequest.Type;

export const ControlPlaneLocaleListQuery = Schema.Struct({
  view: Schema.Literals(["effective", "settings"]),
  includeRemoved: Schema.Boolean,
}).annotate({ identifier: "ControlPlaneLocaleListQuery" });
export type ControlPlaneLocaleListQuery = typeof ControlPlaneLocaleListQuery.Type;

export const ControlPlaneCreateLocaleRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  tag: LocaleTag,
  displayName: LocaleDisplayName,
}).annotate({ identifier: "ControlPlaneCreateLocaleRequest" });
export type ControlPlaneCreateLocaleRequest = typeof ControlPlaneCreateLocaleRequest.Type;

export const ControlPlaneUpdateLocaleRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  displayName: LocaleDisplayName,
}).annotate({ identifier: "ControlPlaneUpdateLocaleRequest" });
export type ControlPlaneUpdateLocaleRequest = typeof ControlPlaneUpdateLocaleRequest.Type;

export const ControlPlaneLocaleStatusRequest = Schema.Struct({
  expectedVersion: ResourceVersion,
  status: ProjectLocaleStatus,
  confirmDraftImpact: Schema.Boolean,
}).annotate({ identifier: "ControlPlaneLocaleStatusRequest" });
export type ControlPlaneLocaleStatusRequest = typeof ControlPlaneLocaleStatusRequest.Type;

export const ControlPlaneLocaleOrderRequest = Schema.Struct({
  locales: Schema.Array(
    Schema.Struct({ localeId: ProjectLocaleId, expectedVersion: ResourceVersion }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
}).annotate({ identifier: "ControlPlaneLocaleOrderRequest" });
export type ControlPlaneLocaleOrderRequest = typeof ControlPlaneLocaleOrderRequest.Type;

export class ControlPlaneProjectRolePolicy extends Schema.Class<ControlPlaneProjectRolePolicy>(
  "ControlPlaneProjectRolePolicy",
)({
  role: ProjectRole,
  baseRoleActions: ProjectPermissionActions,
  requiresAllLocales: Schema.Boolean,
}) {}

export class ControlPlaneGovernance extends Schema.Class<ControlPlaneGovernance>(
  "ControlPlaneGovernance",
)({
  projectId: ProjectId,
  primaryEnvironment: ControlPlanePrimaryEnvironment,
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
  baseRoleActions: ProjectPermissionActions,
  effectiveProjectActions: ProjectPermissionActions,
  effectiveLocaleIds: Schema.Array(ProjectLocaleId).check(Schema.isMaxLength(100)),
  effectiveLocaleActions: ProjectPermissionActions,
  fixedRolePolicies: Schema.Array(ControlPlaneProjectRolePolicy).check(
    Schema.isMinLength(projectRoleValues.length),
    Schema.isMaxLength(projectRoleValues.length),
  ),
  canReadMembers: Schema.Boolean,
  canInviteMembers: Schema.Boolean,
  canUpdateMemberPolicy: Schema.Boolean,
  canRemoveMembers: Schema.Boolean,
}) {}

export class ControlPlaneMemberPage extends Schema.Class<ControlPlaneMemberPage>(
  "ControlPlaneMemberPage",
)({
  items: Schema.Array(ProjectMember).check(Schema.isMaxLength(controlPlaneLimits.maximumPageSize)),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneInvitationPage extends Schema.Class<ControlPlaneInvitationPage>(
  "ControlPlaneInvitationPage",
)({
  items: Schema.Array(ProjectInvitation).check(
    Schema.isMaxLength(controlPlaneLimits.maximumPageSize),
  ),
  nextCursor: Schema.NullOr(ControlPlaneCursor),
}) {}

export class ControlPlaneLocaleList extends Schema.Class<ControlPlaneLocaleList>(
  "ControlPlaneLocaleList",
)({
  items: Schema.Array(ProjectLocale).check(Schema.isMaxLength(100)),
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

export class EnvironmentPreviewTarget extends Schema.Class<EnvironmentPreviewTarget>(
  "EnvironmentPreviewTarget",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  previewUrl: Schema.NullOr(PreviewTargetUrl),
  version: ResourceVersion,
  updatedAt: IsoDateTime,
}) {}

export const ControlPlanePutPreviewTargetRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  expectedVersion: Schema.NullOr(ResourceVersion),
  previewUrl: PreviewTargetUrl,
}).annotate({ identifier: "ControlPlanePutPreviewTargetRequest" });
export type ControlPlanePutPreviewTargetRequest = typeof ControlPlanePutPreviewTargetRequest.Type;

export const ControlPlaneClearPreviewTargetRequest = Schema.Struct({
  commandId: ControlPlaneCommandId,
  expectedVersion: ResourceVersion,
}).annotate({ identifier: "ControlPlaneClearPreviewTargetRequest" });
export type ControlPlaneClearPreviewTargetRequest =
  typeof ControlPlaneClearPreviewTargetRequest.Type;

export class ControlPlanePreviewTargetResult extends Schema.Class<ControlPlanePreviewTargetResult>(
  "ControlPlanePreviewTargetResult",
)({
  target: EnvironmentPreviewTarget,
  created: Schema.Boolean,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
}) {}

export class ControlPlanePutStudioRegistrationResult extends Schema.Class<ControlPlanePutStudioRegistrationResult>(
  "ControlPlanePutStudioRegistrationResult",
)({
  registration: StudioRegistration,
  created: Schema.Boolean,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
}) {}

export class ControlPlaneSetStudioRuntimeResult extends Schema.Class<ControlPlaneSetStudioRuntimeResult>(
  "ControlPlaneSetStudioRuntimeResult",
)({
  registration: StudioRegistration,
  runtimeStatus: StudioRuntimeStatus,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
}) {}

export const ControlPlaneApiErrorCode = Schema.Literals([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PROJECT_KEY_CONFLICT",
  "VERSION_CONFLICT",
  "INVALID_STATE_TRANSITION",
  "COMMAND_CONFLICT",
  "CMS_CAPABILITY_REQUIRED",
  "INVITATION_CONFLICT",
  "INVITATION_INVALID",
  "LAST_OWNER_REQUIRED",
  "LOCALE_CONFLICT",
  "LOCALE_DEPENDENCIES_EXIST",
  "LOCALE_UNAVAILABLE",
  "CONTROL_PLANE_CURSOR_INVALID",
  "CONTROL_PLANE_REQUEST_TOO_LARGE",
  "CONTROL_PLANE_RESPONSE_TOO_LARGE",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type ControlPlaneApiErrorCode = typeof ControlPlaneApiErrorCode.Type;

export class ControlPlaneApiError extends Schema.Class<ControlPlaneApiError>(
  "ControlPlaneApiError",
)({
  code: ControlPlaneApiErrorCode,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  details: Schema.optionalKey(
    Schema.Array(ApiErrorDetail).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(controlPlaneLimits.maximumErrorDetails),
    ),
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
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
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
export const EnvironmentPreviewTargetResponse = ApiSuccessSchema(EnvironmentPreviewTarget);
export const ControlPlanePreviewTargetResponse = ApiSuccessSchema(ControlPlanePreviewTargetResult);
export const ControlPlanePutStudioRegistrationResponse = ApiSuccessSchema(
  ControlPlanePutStudioRegistrationResult,
);
export const ControlPlaneSetStudioRuntimeResponse = ApiSuccessSchema(
  ControlPlaneSetStudioRuntimeResult,
);
export const ControlPlaneGovernanceResponse = ApiSuccessSchema(ControlPlaneGovernance);
export const ControlPlaneMemberResponse = ApiSuccessSchema(ProjectMember);
export const ControlPlaneMemberPageResponse = ApiSuccessSchema(ControlPlaneMemberPage);
export const ControlPlaneInvitationResponse = ApiSuccessSchema(ProjectInvitation);
export const ControlPlaneIssuedInvitationResponse = ApiSuccessSchema(IssuedProjectInvitation);
export const ControlPlaneInspectedInvitationResponse = ApiSuccessSchema(InspectedProjectInvitation);
export const ControlPlaneInvitationPageResponse = ApiSuccessSchema(ControlPlaneInvitationPage);
export const ControlPlaneLocaleResponse = ApiSuccessSchema(ProjectLocale);
export const ControlPlaneCreateLocaleResponse = ApiSuccessSchema(ProjectLocale);
export const ControlPlaneLocaleListResponse = ApiSuccessSchema(ControlPlaneLocaleList);

export const ControlPlaneWorkspaceScopeSchema = Schema.toStandardSchemaV1(
  ControlPlaneWorkspaceScope,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ControlPlaneProjectScopeSchema = Schema.toStandardSchemaV1(ControlPlaneProjectScope, {
  parseOptions: { onExcessProperty: "error" },
});
export const ControlPlaneProjectLifecycleInputSchema = Schema.toStandardSchemaV1(
  ControlPlaneProjectLifecycleInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ControlPlaneUpdateProjectInputSchema = Schema.toStandardSchemaV1(
  ControlPlaneUpdateProjectInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ControlPlaneWorkspaceOutputSchema = Schema.toStandardSchemaV1(
  ControlPlaneWorkspaceResponse,
);
export const ControlPlaneProjectOutputSchema = Schema.toStandardSchemaV1(
  ControlPlaneProjectResponse,
);
export const ControlPlaneCapabilityListOutputSchema = Schema.toStandardSchemaV1(
  ControlPlaneCapabilityListResponse,
);
export const ControlPlaneCreateProjectInputSchema = Schema.toStandardSchemaV1(
  ControlPlaneCreateProjectInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ControlPlaneEnableCapabilityInputSchema = Schema.toStandardSchemaV1(
  ControlPlaneEnableCapabilityInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ControlPlaneEnableCapabilityOutputSchema = Schema.toStandardSchemaV1(
  ControlPlaneEnableCapabilityResponse,
);
export const ControlPlaneStudioRegistrationScopeSchema = Schema.toStandardSchemaV1(
  ControlPlaneStudioRegistrationScope,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ControlPlanePutStudioRegistrationInputSchema = Schema.toStandardSchemaV1(
  ControlPlanePutStudioRegistrationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ControlPlaneSetStudioRuntimeInputSchema = Schema.toStandardSchemaV1(
  ControlPlaneSetStudioRuntimeInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const StudioRegistrationOutputSchema = Schema.toStandardSchemaV1(StudioRegistrationResponse);
export const ControlPlanePutStudioRegistrationOutputSchema = Schema.toStandardSchemaV1(
  ControlPlanePutStudioRegistrationResponse,
);
export const ControlPlaneSetStudioRuntimeOutputSchema = Schema.toStandardSchemaV1(
  ControlPlaneSetStudioRuntimeResponse,
);
