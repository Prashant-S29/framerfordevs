import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  StudioAccessTokenAuthority,
  StudioApiFailure,
  StudioBootstrap,
  StudioConsentProjection,
  studioBootstrapActionValues,
  studioLimits,
} from "./index";

const ids = {
  registration: "019fae8b-1234-7000-8000-000000000001",
  project: "019fae8b-1234-7000-8000-000000000002",
  environment: "019fae8b-1234-7000-8000-000000000003",
  workspace: "019fae8b-1234-7000-8000-000000000004",
  grant: "019fae8b-1234-7000-8000-000000000005",
};

const bootstrap = {
  formatVersion: 1,
  registration: {
    id: ids.registration,
    version: 3,
    applicationOrigin: "https://application.example.test",
    mountPath: "/admin/studio",
  },
  project: {
    id: ids.project,
    name: "Customer Site",
    workspaceId: ids.workspace,
  },
  environment: {
    id: ids.environment,
    key: "main",
    name: "main",
  },
  user: {
    id: "studio-user",
    name: "Studio User",
    email: "studio@example.test",
  },
  role: "developer",
  effectiveActions: ["project.read", "project.update"],
  session: { expiresAt: "2026-09-21T20:00:00.000Z" },
};

describe("Studio contracts", () => {
  it("decodes the bounded bootstrap projection without content or credential authority", () => {
    const decoded = Schema.decodeUnknownSync(StudioBootstrap)(bootstrap, {
      onExcessProperty: "error",
    });

    expect(decoded.formatVersion).toBe(1);
    expect(decoded.environment.key).toBe("main");
    expect(decoded.effectiveActions).toEqual(["project.read", "project.update"]);
    expect(studioBootstrapActionValues).toEqual(["project.read", "project.update"]);
    const serialized = JSON.stringify(decoded);
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain("credential");
    expect(serialized).not.toContain("content");
  });

  it("rejects excess, duplicate, and unknown bootstrap authority", () => {
    expect(() =>
      Schema.decodeUnknownSync(StudioBootstrap)(
        { ...bootstrap, hidden: true },
        {
          onExcessProperty: "error",
        },
      ),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(StudioBootstrap)({
        ...bootstrap,
        effectiveActions: ["project.read", "project.read"],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(StudioBootstrap)({
        ...bootstrap,
        effectiveActions: ["schema.write"],
      }),
    ).toThrow();
  });

  it("decodes the exact additive access-token authority", () => {
    const authority = Schema.decodeUnknownSync(StudioAccessTokenAuthority)(
      {
        clientKind: "studio_v1",
        registrationId: ids.registration,
        registrationVersion: 3,
        projectId: ids.project,
        environmentId: ids.environment,
        userId: "studio-user",
        grantId: ids.grant,
        clientId: `ffd-studio-v1-${ids.registration}`,
        issuer: "https://api.example.test/api/auth",
        audience: "https://api.example.test/api/studio/v1",
        scopes: ["studio:session", "offline_access"],
        expiresAtEpochSeconds: 1_795_000_000,
      },
      { onExcessProperty: "error" },
    );

    expect(authority.clientKind).toBe("studio_v1");
    expect(authority.scopes).toEqual(["studio:session", "offline_access"]);
    expect(() =>
      Schema.decodeUnknownSync(StudioAccessTokenAuthority)(
        { ...authority, token: "secret" },
        { onExcessProperty: "error" },
      ),
    ).toThrow();
  });

  it("keeps acknowledgement projection bounded to resolved labels", () => {
    const projection = Schema.decodeUnknownSync(StudioConsentProjection)(
      {
        registrationId: ids.registration,
        registrationVersion: 3,
        projectId: ids.project,
        projectName: "Customer Site",
        applicationOrigin: "https://application.example.test",
      },
      { onExcessProperty: "error" },
    );

    expect(Object.keys(projection).sort()).toEqual([
      "applicationOrigin",
      "projectId",
      "projectName",
      "registrationId",
      "registrationVersion",
    ]);
  });

  it("locks response and token lifetime bounds", () => {
    expect(studioLimits).toEqual({
      requestBytes: 16_384,
      responseBytes: 65_536,
      maximumAuthorizationBytes: 16_384,
      maximumErrorDetails: 20,
      accessTokenLifetimeSeconds: 300,
      refreshTokenLifetimeSeconds: 28_800,
    });
  });

  it("decodes standard envelope failures with closed Studio errors", () => {
    const failure = Schema.decodeUnknownSync(StudioApiFailure)({
      ok: false,
      data: null,
      error: {
        code: "STUDIO_AUTHORITY_CHANGED",
        message: "Studio authority changed.",
        retryable: false,
        requestId: "request.m18-studio",
      },
      message: "Studio authority changed.",
    });

    expect(failure.error.code).toBe("STUDIO_AUTHORITY_CHANGED");
    expect(() =>
      Schema.decodeUnknownSync(StudioApiFailure)({
        ...failure,
        error: { ...failure.error, code: "CONTENT_WRITE_FAILED" },
      }),
    ).toThrow();
  });
});
