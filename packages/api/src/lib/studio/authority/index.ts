// Pure Studio client derivation, acknowledgement projection, action projection, and token binding.

import type { ProjectRole } from "../../../contracts/access";
import type {
  StudioApplicationOrigin,
  StudioMountPath,
  StudioRegistrationId,
} from "../../../contracts/control-plane";
import type {
  AuthUserId,
  EnvironmentId,
  ProjectId,
  ProjectName,
  ResourceVersion,
} from "../../../contracts/platform";
import {
  STUDIO_CLIENT_KIND,
  STUDIO_OFFLINE_SCOPE,
  STUDIO_SESSION_SCOPE,
  type StudioAccessTokenAuthority,
  type StudioBootstrapAction,
  type StudioConsentProjection,
  type StudioGrantId,
  type StudioRuntimeStatus,
  studioBootstrapActionValues,
} from "../../../contracts/studio";
import { isRoleAllowed } from "../../../services/policy";

const studioClientIdPattern =
  /^ffd-studio-v1-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface StudioRegistrationBinding {
  readonly id: StudioRegistrationId;
  readonly version: ResourceVersion;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly applicationOrigin: StudioApplicationOrigin;
  readonly mountPath: StudioMountPath;
}

export interface StudioOAuthClientConfiguration {
  readonly clientId: string;
  readonly referenceId: StudioRegistrationId;
  readonly metadata: Readonly<{
    kind: typeof STUDIO_CLIENT_KIND;
    registrationId: StudioRegistrationId;
    registrationVersion: ResourceVersion;
    projectId: ProjectId;
    environmentId: EnvironmentId;
    applicationOrigin: StudioApplicationOrigin;
    mountPath: StudioMountPath;
  }>;
  readonly redirectUris: readonly [string];
  readonly postLogoutRedirectUris: readonly [];
  readonly tokenEndpointAuthMethod: "none";
  readonly applicationType: "web";
  readonly grantTypes: readonly ["authorization_code", "refresh_token"];
  readonly responseTypes: readonly ["code"];
  readonly requirePKCE: true;
  readonly skipConsent: false;
  readonly enableEndSession: false;
  readonly scopes: readonly [typeof STUDIO_SESSION_SCOPE, typeof STUDIO_OFFLINE_SCOPE];
  readonly resources: readonly [string];
}

export function studioClientId(registrationId: StudioRegistrationId) {
  return `ffd-studio-v1-${registrationId}`;
}

export function isStudioClientId(value: string) {
  return studioClientIdPattern.test(value);
}

export function studioCallbackUri(
  applicationOrigin: StudioApplicationOrigin,
  mountPath: StudioMountPath,
) {
  return `${applicationOrigin}${mountPath}/auth/callback`;
}

export function studioResource(apiOrigin: string) {
  return `${new URL(apiOrigin).origin}/api/studio/v1`;
}

export function deriveStudioOAuthClient(
  registration: StudioRegistrationBinding,
  apiOrigin: string,
): StudioOAuthClientConfiguration {
  return {
    clientId: studioClientId(registration.id),
    referenceId: registration.id,
    metadata: {
      kind: STUDIO_CLIENT_KIND,
      registrationId: registration.id,
      registrationVersion: registration.version,
      projectId: registration.projectId,
      environmentId: registration.environmentId,
      applicationOrigin: registration.applicationOrigin,
      mountPath: registration.mountPath,
    },
    redirectUris: [studioCallbackUri(registration.applicationOrigin, registration.mountPath)],
    postLogoutRedirectUris: [],
    tokenEndpointAuthMethod: "none",
    applicationType: "web",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    requirePKCE: true,
    skipConsent: false,
    enableEndSession: false,
    scopes: [STUDIO_SESSION_SCOPE, STUDIO_OFFLINE_SCOPE],
    resources: [studioResource(apiOrigin)],
  };
}

export function studioAccessTokenClaims(input: {
  readonly registration: StudioRegistrationBinding;
  readonly grantId: StudioGrantId;
}) {
  return {
    studio_client_kind: STUDIO_CLIENT_KIND,
    studio_registration_id: input.registration.id,
    studio_registration_version: input.registration.version,
    studio_project_id: input.registration.projectId,
    studio_environment_id: input.registration.environmentId,
    studio_grant_id: input.grantId,
  } as const;
}

export function projectStudioActions(role: ProjectRole): ReadonlyArray<StudioBootstrapAction> {
  return studioBootstrapActionValues.filter((action) => isRoleAllowed(role, action));
}

export function studioConsentProjection(input: {
  readonly registrationId: StudioRegistrationId;
  readonly registrationVersion: ResourceVersion;
  readonly projectId: ProjectId;
  readonly projectName: ProjectName;
  readonly applicationOrigin: StudioApplicationOrigin;
}): StudioConsentProjection {
  return { ...input };
}

export type StudioTokenBindingFailureReason =
  | "expired"
  | "issuer_mismatch"
  | "audience_mismatch"
  | "client_mismatch"
  | "scope_mismatch"
  | "registration_inactive"
  | "registration_mismatch"
  | "registration_version_mismatch"
  | "project_mismatch"
  | "environment_mismatch"
  | "user_invalid"
  | "grant_invalid";

export type StudioTokenBindingDecision =
  | Readonly<{ allowed: true; authority: StudioAccessTokenAuthority }>
  | Readonly<{ allowed: false; reason: StudioTokenBindingFailureReason }>;

export interface CurrentStudioAuthority {
  readonly issuer: string;
  readonly audience: string;
  readonly registrationId: StudioRegistrationId;
  readonly registrationVersion: ResourceVersion;
  readonly runtimeStatus: StudioRuntimeStatus;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly userId: AuthUserId;
  readonly grantId: StudioGrantId;
  readonly projectActive: boolean;
  readonly cmsEnabled: boolean;
  readonly userAllowed: boolean;
  readonly auditMarkerPresent: boolean;
  readonly nowEpochSeconds: number;
}

function denied(reason: StudioTokenBindingFailureReason): StudioTokenBindingDecision {
  return { allowed: false, reason };
}

export function decideStudioTokenBinding(
  token: StudioAccessTokenAuthority,
  current: CurrentStudioAuthority,
): StudioTokenBindingDecision {
  if (token.expiresAtEpochSeconds <= current.nowEpochSeconds) return denied("expired");
  if (token.issuer !== current.issuer) return denied("issuer_mismatch");
  if (token.audience !== current.audience) return denied("audience_mismatch");
  if (
    token.clientKind !== STUDIO_CLIENT_KIND ||
    token.clientId !== studioClientId(token.registrationId)
  ) {
    return denied("client_mismatch");
  }
  if (
    token.scopes.length !== 2 ||
    !token.scopes.includes(STUDIO_SESSION_SCOPE) ||
    !token.scopes.includes(STUDIO_OFFLINE_SCOPE)
  ) {
    return denied("scope_mismatch");
  }
  if (current.runtimeStatus !== "active") return denied("registration_inactive");
  if (token.registrationId !== current.registrationId) return denied("registration_mismatch");
  if (token.registrationVersion !== current.registrationVersion) {
    return denied("registration_version_mismatch");
  }
  if (!current.projectActive || !current.cmsEnabled || token.projectId !== current.projectId) {
    return denied("project_mismatch");
  }
  if (token.environmentId !== current.environmentId) return denied("environment_mismatch");
  if (!current.userAllowed || token.userId !== current.userId) return denied("user_invalid");
  if (!current.auditMarkerPresent || token.grantId !== current.grantId) {
    return denied("grant_invalid");
  }
  return { allowed: true, authority: token };
}
