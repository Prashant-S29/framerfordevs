// Defines the closed Studio v1 token authority, acknowledgement, bootstrap, and error contracts.

import { Schema } from "effect";

import { CanonicalEmail, ProjectRole } from "../access";
import { StudioApplicationOrigin, StudioMountPath, StudioRegistrationId } from "../control-plane";

export { StudioRuntimeStatus } from "../control-plane";
import {
  AuthUserId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ProjectName,
  ResourceVersion,
  WorkspaceId,
} from "../platform";
import { ApiErrorDetail, ApiSuccessSchema, RequestIdSchema } from "../response/api";

export const studioLimits = {
  requestBytes: 16_384,
  responseBytes: 65_536,
  maximumAuthorizationBytes: 16_384,
  maximumErrorDetails: 20,
  accessTokenLifetimeSeconds: 300,
  refreshTokenLifetimeSeconds: 28_800,
} as const;

export const STUDIO_CLIENT_KIND = "studio_v1" as const;
export const STUDIO_SESSION_SCOPE = "studio:session" as const;
export const STUDIO_OFFLINE_SCOPE = "offline_access" as const;
export const STUDIO_RESOURCE_PATH = "/api/studio/v1" as const;

export const StudioGrantId = Schema.UUID.pipe(Schema.brand("StudioGrantId"));
export type StudioGrantId = typeof StudioGrantId.Type;

export const StudioClientKind = Schema.Literal(STUDIO_CLIENT_KIND);
export type StudioClientKind = typeof StudioClientKind.Type;

export const StudioBootstrapAction = Schema.Literal("project.read", "project.update");
export type StudioBootstrapAction = typeof StudioBootstrapAction.Type;
export const studioBootstrapActionValues = StudioBootstrapAction.literals;

export class StudioRegistrationAuthority extends Schema.Class<StudioRegistrationAuthority>(
  "StudioRegistrationAuthority",
)({
  id: StudioRegistrationId,
  version: ResourceVersion,
  applicationOrigin: StudioApplicationOrigin,
  mountPath: StudioMountPath,
}) {}

export class StudioProjectIdentity extends Schema.Class<StudioProjectIdentity>(
  "StudioProjectIdentity",
)({
  id: ProjectId,
  name: ProjectName,
  workspaceId: WorkspaceId,
}) {}

export class StudioEnvironmentIdentity extends Schema.Class<StudioEnvironmentIdentity>(
  "StudioEnvironmentIdentity",
)({
  id: EnvironmentId,
  key: Schema.Literal("main"),
  name: Schema.Literal("main"),
}) {}

export class StudioUserIdentity extends Schema.Class<StudioUserIdentity>("StudioUserIdentity")({
  id: AuthUserId,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  email: CanonicalEmail,
}) {}

export class StudioSessionAuthority extends Schema.Class<StudioSessionAuthority>(
  "StudioSessionAuthority",
)({
  expiresAt: IsoDateTime,
}) {}

const StudioBootstrapActions = Schema.Array(StudioBootstrapAction).pipe(
  Schema.maxItems(studioBootstrapActionValues.length),
  Schema.filter((actions) => new Set(actions).size === actions.length, {
    message: () => "Studio bootstrap actions must be unique.",
  }),
);

export class StudioBootstrap extends Schema.Class<StudioBootstrap>("StudioBootstrap")({
  formatVersion: Schema.Literal(1),
  registration: StudioRegistrationAuthority,
  project: StudioProjectIdentity,
  environment: StudioEnvironmentIdentity,
  user: StudioUserIdentity,
  role: ProjectRole,
  effectiveActions: StudioBootstrapActions,
  session: StudioSessionAuthority,
}) {}

export class StudioConsentProjection extends Schema.Class<StudioConsentProjection>(
  "StudioConsentProjection",
)({
  registrationId: StudioRegistrationId,
  registrationVersion: ResourceVersion,
  projectId: ProjectId,
  projectName: ProjectName,
  applicationOrigin: StudioApplicationOrigin,
}) {}

export class StudioAccessTokenAuthority extends Schema.Class<StudioAccessTokenAuthority>(
  "StudioAccessTokenAuthority",
)({
  clientKind: StudioClientKind,
  registrationId: StudioRegistrationId,
  registrationVersion: ResourceVersion,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  userId: AuthUserId,
  grantId: StudioGrantId,
  clientId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  issuer: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
  audience: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
  scopes: Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128))).pipe(
    Schema.minItems(1),
    Schema.maxItems(8),
    Schema.filter((scopes) => new Set(scopes).size === scopes.length, {
      message: () => "Studio access-token scopes must be unique.",
    }),
  ),
  expiresAtEpochSeconds: Schema.Number.pipe(Schema.int(), Schema.greaterThan(0)),
}) {}

export class StudioBootstrapScope extends Schema.Class<StudioBootstrapScope>(
  "StudioBootstrapScope",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
}) {}

export const StudioApiErrorCode = Schema.Literal(
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CMS_CAPABILITY_REQUIRED",
  "STUDIO_REGISTRATION_INACTIVE",
  "STUDIO_AUTHORITY_CHANGED",
  "STUDIO_GRANT_INVALID",
  "STUDIO_RESPONSE_TOO_LARGE",
  "REQUEST_TOO_LARGE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
);
export type StudioApiErrorCode = typeof StudioApiErrorCode.Type;

export class StudioApiError extends Schema.Class<StudioApiError>("StudioApiError")({
  code: StudioApiErrorCode,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(
    Schema.Array(ApiErrorDetail).pipe(
      Schema.minItems(1),
      Schema.maxItems(studioLimits.maximumErrorDetails),
    ),
    { exact: true },
  ),
  retryable: Schema.Boolean,
  requestId: RequestIdSchema,
}) {}

export class StudioApiFailure extends Schema.Class<StudioApiFailure>("StudioApiFailure")({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: StudioApiError,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export const StudioBootstrapResponse = ApiSuccessSchema(StudioBootstrap);
