import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { AuthUserId, IsoDateTime, ResourceVersion } from "../../../contracts/platform";
import { StudioRuntimeStatus } from "../../../contracts/studio";
import { decideStudioRuntimeTransition, studioMetadataRuntimeEffect } from "./index";

const actorUserId = Schema.decodeUnknownSync(AuthUserId)("studio-operator");
const now = Schema.decodeUnknownSync(IsoDateTime)("2026-09-21T12:00:00.000Z");

function transitionInput() {
  return {
    currentStatus: Schema.decodeUnknownSync(StudioRuntimeStatus)("inactive"),
    currentVersion: ResourceVersion.make(3),
    currentChangedAt: null,
    currentChangedByUserId: null,
    expectedVersion: ResourceVersion.make(3),
    enabled: true,
    actorKind: "user" as const,
    actorUserId,
    projectActive: true,
    cmsEnabled: true,
    environmentMatches: true,
    projectUpdateAllowed: true,
    oauthUserGrant: true,
    mountPathPortable: true,
    now,
  };
}

describe("Studio registration runtime kernel", () => {
  it("activates only current user authority and increments registration version", () => {
    expect(decideStudioRuntimeTransition(transitionInput())).toEqual({
      allowed: true,
      status: "active",
      version: 4,
      changedAt: now,
      changedByUserId: actorUserId,
      noOp: false,
      disableOAuthAuthority: false,
    });
  });

  it("permits user recovery deactivation for an archived project", () => {
    expect(
      decideStudioRuntimeTransition({
        ...transitionInput(),
        currentStatus: "active",
        enabled: false,
        projectActive: false,
        cmsEnabled: false,
        oauthUserGrant: false,
      }),
    ).toEqual({
      allowed: true,
      status: "inactive",
      version: 4,
      changedAt: now,
      changedByUserId: actorUserId,
      noOp: false,
      disableOAuthAuthority: true,
    });
  });

  it("permits a credential kill switch without inventing user runtime attribution", () => {
    expect(
      decideStudioRuntimeTransition({
        ...transitionInput(),
        currentStatus: "active",
        enabled: false,
        actorKind: "credential",
        actorUserId: null,
        projectActive: false,
        cmsEnabled: false,
        oauthUserGrant: false,
      }),
    ).toEqual({
      allowed: true,
      status: "inactive",
      version: 4,
      changedAt: null,
      changedByUserId: null,
      noOp: false,
      disableOAuthAuthority: true,
    });
  });

  it("preserves authority metadata for a true no-op", () => {
    const changedAt = Schema.decodeUnknownSync(IsoDateTime)("2026-09-20T10:00:00.000Z");
    expect(
      decideStudioRuntimeTransition({
        ...transitionInput(),
        currentChangedAt: changedAt,
        currentChangedByUserId: actorUserId,
        currentStatus: "active",
      }),
    ).toEqual({
      allowed: true,
      status: "active",
      version: 3,
      changedAt,
      changedByUserId: actorUserId,
      noOp: true,
      disableOAuthAuthority: false,
    });
  });

  it("default-denies activation without every exact current prerequisite", () => {
    const failures = [
      ["user_actor_required", { actorKind: "credential", actorUserId: null }],
      ["version_conflict", { expectedVersion: ResourceVersion.make(2) }],
      ["environment_mismatch", { environmentMatches: false }],
      ["policy_denied", { projectUpdateAllowed: false }],
      ["project_inactive", { projectActive: false }],
      ["cms_disabled", { cmsEnabled: false }],
      ["oauth_user_grant_required", { oauthUserGrant: false }],
      ["mount_path_not_portable", { mountPathPortable: false }],
    ] as const;
    for (const [reason, change] of failures) {
      expect(decideStudioRuntimeTransition({ ...transitionInput(), ...change })).toEqual({
        allowed: false,
        reason,
      });
    }
  });

  it("allows a legacy nonportable active mount to deactivate for recovery", () => {
    expect(
      decideStudioRuntimeTransition({
        ...transitionInput(),
        currentStatus: "active",
        enabled: false,
        mountPathPortable: false,
      }),
    ).toEqual({
      allowed: true,
      status: "inactive",
      version: 4,
      changedAt: now,
      changedByUserId: actorUserId,
      noOp: false,
      disableOAuthAuthority: true,
    });
  });

  it("invalidates active OAuth authority on origin or mount metadata changes", () => {
    expect(studioMetadataRuntimeEffect({ currentStatus: "active", metadataChanged: true })).toEqual(
      {
        nextStatus: "inactive",
        disableOAuthAuthority: true,
        revokeTokensAndConsent: true,
      },
    );
    expect(
      studioMetadataRuntimeEffect({ currentStatus: "inactive", metadataChanged: true }),
    ).toEqual({
      nextStatus: "inactive",
      disableOAuthAuthority: false,
      revokeTokensAndConsent: false,
    });
  });
});
