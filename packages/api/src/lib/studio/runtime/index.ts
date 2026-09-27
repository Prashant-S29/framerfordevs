// Pure registration-runtime transitions before transactional persistence and OAuth side effects.

import { ResourceVersion, type AuthUserId, type IsoDateTime } from "../../../contracts/platform";
import type { StudioRuntimeStatus } from "../../../contracts/studio";

export type StudioRuntimeTransitionFailureReason =
  | "user_actor_required"
  | "version_conflict"
  | "project_inactive"
  | "cms_disabled"
  | "environment_mismatch"
  | "policy_denied"
  | "oauth_user_grant_required"
  | "mount_path_not_portable";

export interface StudioRuntimeTransitionInput {
  readonly currentStatus: StudioRuntimeStatus;
  readonly currentVersion: ResourceVersion;
  readonly currentChangedAt: IsoDateTime | null;
  readonly currentChangedByUserId: AuthUserId | null;
  readonly expectedVersion: ResourceVersion;
  readonly enabled: boolean;
  readonly actorKind: "user" | "credential";
  readonly actorUserId: AuthUserId | null;
  readonly projectActive: boolean;
  readonly cmsEnabled: boolean;
  readonly environmentMatches: boolean;
  readonly projectUpdateAllowed: boolean;
  readonly oauthUserGrant: boolean;
  readonly mountPathPortable: boolean;
  readonly now: IsoDateTime;
}

export type StudioRuntimeTransitionDecision =
  | Readonly<{
      allowed: true;
      status: StudioRuntimeStatus;
      version: ResourceVersion;
      changedAt: IsoDateTime | null;
      changedByUserId: AuthUserId | null;
      noOp: boolean;
      disableOAuthAuthority: boolean;
    }>
  | Readonly<{ allowed: false; reason: StudioRuntimeTransitionFailureReason }>;

function denied(reason: StudioRuntimeTransitionFailureReason): StudioRuntimeTransitionDecision {
  return { allowed: false, reason };
}

export function decideStudioRuntimeTransition(
  input: StudioRuntimeTransitionInput,
): StudioRuntimeTransitionDecision {
  if (
    (input.actorKind === "user" && input.actorUserId === null) ||
    (input.enabled && input.actorKind !== "user")
  ) {
    return denied("user_actor_required");
  }
  if (input.currentVersion !== input.expectedVersion) return denied("version_conflict");
  if (!input.environmentMatches) return denied("environment_mismatch");
  if (!input.projectUpdateAllowed) return denied("policy_denied");
  if (input.enabled && !input.mountPathPortable) return denied("mount_path_not_portable");

  const status: StudioRuntimeStatus = input.enabled ? "active" : "inactive";
  if (status === input.currentStatus) {
    return {
      allowed: true,
      status,
      version: input.currentVersion,
      changedAt: input.currentChangedAt,
      changedByUserId: input.currentChangedByUserId,
      noOp: true,
      disableOAuthAuthority: false,
    };
  }

  if (input.enabled) {
    if (!input.projectActive) return denied("project_inactive");
    if (!input.cmsEnabled) return denied("cms_disabled");
    if (!input.oauthUserGrant) return denied("oauth_user_grant_required");
  }

  return {
    allowed: true,
    status,
    version: ResourceVersion.make(input.currentVersion + 1),
    changedAt: input.actorKind === "user" ? input.now : null,
    changedByUserId: input.actorKind === "user" ? input.actorUserId : null,
    noOp: false,
    disableOAuthAuthority: !input.enabled,
  };
}

export interface StudioMetadataRuntimeEffect {
  readonly nextStatus: StudioRuntimeStatus;
  readonly disableOAuthAuthority: boolean;
  readonly revokeTokensAndConsent: boolean;
}

export function studioMetadataRuntimeEffect(input: {
  readonly currentStatus: StudioRuntimeStatus;
  readonly metadataChanged: boolean;
}): StudioMetadataRuntimeEffect {
  const invalidatesActiveAuthority = input.currentStatus === "active" && input.metadataChanged;
  return {
    nextStatus: invalidatesActiveAuthority ? "inactive" : input.currentStatus,
    disableOAuthAuthority: invalidatesActiveAuthority,
    revokeTokensAndConsent: invalidatesActiveAuthority,
  };
}
