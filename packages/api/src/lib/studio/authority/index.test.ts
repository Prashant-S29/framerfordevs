import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { ProjectRole } from "../../../contracts/access";
import {
  StudioApplicationOrigin,
  StudioMountPath,
  StudioRegistrationId,
} from "../../../contracts/control-plane";
import {
  AuthUserId,
  EnvironmentId,
  ProjectId,
  ProjectName,
  ResourceVersion,
} from "../../../contracts/platform";
import {
  STUDIO_OFFLINE_SCOPE,
  STUDIO_SESSION_SCOPE,
  StudioAccessTokenAuthority,
  StudioGrantId,
  StudioRuntimeStatus,
} from "../../../contracts/studio";
import {
  decideStudioTokenBinding,
  deriveStudioOAuthClient,
  isStudioClientId,
  projectStudioActions,
  studioAccessTokenClaims,
  studioCallbackUri,
  studioConsentProjection,
  studioResource,
} from "./index";

const registrationId = Schema.decodeUnknownSync(StudioRegistrationId)(
  "019fae8b-1234-7000-8000-000000000001",
);
const projectId = Schema.decodeUnknownSync(ProjectId)("019fae8b-1234-7000-8000-000000000002");
const environmentId = Schema.decodeUnknownSync(EnvironmentId)(
  "019fae8b-1234-7000-8000-000000000003",
);
const userId = Schema.decodeUnknownSync(AuthUserId)("studio-user");
const grantId = Schema.decodeUnknownSync(StudioGrantId)("019fae8b-1234-7000-8000-000000000004");
const version = Schema.decodeUnknownSync(ResourceVersion)(3);
const applicationOrigin = Schema.decodeUnknownSync(StudioApplicationOrigin)(
  "https://application.example.test",
);
const mountPath = Schema.decodeUnknownSync(StudioMountPath)("/admin/content/studio");

const registration = {
  id: registrationId,
  version,
  projectId,
  environmentId,
  applicationOrigin,
  mountPath,
};

function tokenAuthority() {
  return StudioAccessTokenAuthority.make({
    clientKind: "studio_v1",
    registrationId,
    registrationVersion: version,
    projectId,
    environmentId,
    userId,
    grantId,
    grantExpiresAtEpochSeconds: 28_800,
    clientId: `ffd-studio-v1-${registrationId}`,
    issuer: "https://api.example.test/api/auth",
    audience: "https://api.example.test/api/studio/v1",
    scopes: [STUDIO_SESSION_SCOPE, STUDIO_OFFLINE_SCOPE],
    expiresAtEpochSeconds: 2_000,
  });
}

function currentAuthority() {
  return {
    issuer: "https://api.example.test/api/auth",
    audience: "https://api.example.test/api/studio/v1",
    registrationId,
    registrationVersion: version,
    runtimeStatus: Schema.decodeUnknownSync(StudioRuntimeStatus)("active"),
    projectId,
    environmentId,
    userId,
    grantId,
    projectActive: true,
    cmsEnabled: true,
    userAllowed: true,
    auditMarkerPresent: true,
    nowEpochSeconds: 1_900,
  };
}

describe("Studio authority kernel", () => {
  it("derives one exact public client and callback from registration authority", () => {
    const client = deriveStudioOAuthClient(registration, "https://api.example.test");

    expect(client).toEqual({
      clientId: `ffd-studio-v1-${registrationId}`,
      referenceId: registrationId,
      metadata: {
        kind: "studio_v1",
        registrationId,
        registrationVersion: 3,
        projectId,
        environmentId,
        applicationOrigin: "https://application.example.test",
        mountPath: "/admin/content/studio",
      },
      redirectUris: ["https://application.example.test/admin/content/studio/auth/callback"],
      postLogoutRedirectUris: [],
      tokenEndpointAuthMethod: "none",
      applicationType: "web",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      requirePKCE: true,
      skipConsent: false,
      enableEndSession: false,
      scopes: ["studio:session", "offline_access"],
      resources: ["https://api.example.test/api/studio/v1"],
    });
    expect(isStudioClientId(client.clientId)).toBe(true);
    expect(isStudioClientId(`ffd-studio-v2-${registrationId}`)).toBe(false);
  });

  it("composes canonical HTTPS and loopback callbacks without prefix matching", () => {
    const loopbackOrigin =
      Schema.decodeUnknownSync(StudioApplicationOrigin)("http://127.0.0.1:43210");
    const loopbackMount = Schema.decodeUnknownSync(StudioMountPath)("/studio");

    expect(studioCallbackUri(applicationOrigin, mountPath)).toBe(
      "https://application.example.test/admin/content/studio/auth/callback",
    );
    expect(studioCallbackUri(loopbackOrigin, loopbackMount)).toBe(
      "http://127.0.0.1:43210/studio/auth/callback",
    );
    expect(studioResource("https://api.example.test")).toBe(
      "https://api.example.test/api/studio/v1",
    );
  });

  it("projects only bounded acknowledgement labels and shell actions", () => {
    const projectName = Schema.decodeUnknownSync(ProjectName)("Customer Site");
    const projection = studioConsentProjection({
      registrationId,
      registrationVersion: version,
      projectId,
      projectName,
      applicationOrigin,
    });

    expect(projection).toEqual({
      registrationId,
      registrationVersion: 3,
      projectId,
      projectName: "Customer Site",
      applicationOrigin: "https://application.example.test",
    });
    expect(projectStudioActions(Schema.decodeUnknownSync(ProjectRole)("owner"))).toEqual([
      "project.read",
      "project.update",
    ]);
    expect(projectStudioActions(Schema.decodeUnknownSync(ProjectRole)("editor"))).toEqual([
      "project.read",
    ]);
  });

  it("creates only additive non-secret Studio claims", () => {
    expect(studioAccessTokenClaims({ registration, grantId })).toEqual({
      studio_client_kind: "studio_v1",
      studio_registration_id: registrationId,
      studio_registration_version: 3,
      studio_project_id: projectId,
      studio_environment_id: environmentId,
      studio_grant_id: grantId,
    });
  });

  it("allows only exact current token, registration, user, and audited grant authority", () => {
    const token = tokenAuthority();
    expect(decideStudioTokenBinding(token, currentAuthority())).toEqual({
      allowed: true,
      authority: token,
    });

    const failures = [
      ["expired", { nowEpochSeconds: 2_000 }],
      ["issuer_mismatch", { issuer: "https://other.example.test/api/auth" }],
      ["audience_mismatch", { audience: "https://api.example.test/api/tooling/v1" }],
      [
        "registration_inactive",
        { runtimeStatus: Schema.decodeUnknownSync(StudioRuntimeStatus)("inactive") },
      ],
      ["registration_version_mismatch", { registrationVersion: ResourceVersion.make(4) }],
      ["project_mismatch", { projectActive: false }],
      [
        "environment_mismatch",
        {
          environmentId: Schema.decodeUnknownSync(EnvironmentId)(
            "019fae8b-1234-7000-8000-000000000099",
          ),
        },
      ],
      ["user_invalid", { userAllowed: false }],
      ["grant_invalid", { auditMarkerPresent: false }],
    ] as const;
    for (const [reason, change] of failures) {
      expect(decideStudioTokenBinding(token, { ...currentAuthority(), ...change })).toEqual({
        allowed: false,
        reason,
      });
    }
  });

  it("rejects wrong client families and any excess or missing scope", () => {
    expect(
      decideStudioTokenBinding(
        StudioAccessTokenAuthority.make({ ...tokenAuthority(), clientId: "caller-client" }),
        currentAuthority(),
      ),
    ).toEqual({ allowed: false, reason: "client_mismatch" });
    expect(
      decideStudioTokenBinding(
        StudioAccessTokenAuthority.make({
          ...tokenAuthority(),
          scopes: [STUDIO_SESSION_SCOPE, STUDIO_OFFLINE_SCOPE, "project.update"],
        }),
        currentAuthority(),
      ),
    ).toEqual({ allowed: false, reason: "scope_mismatch" });
  });
});
