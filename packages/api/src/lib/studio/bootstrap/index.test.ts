import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { CanonicalEmail, ProjectRole } from "../../../contracts/access";
import {
  StudioApplicationOrigin,
  StudioMountPath,
  StudioRegistrationId,
} from "../../../contracts/control-plane";
import {
  AuthUserId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ProjectName,
  ResourceVersion,
  WorkspaceId,
} from "../../../contracts/platform";
import { buildStudioBootstrap } from "./index";

const decode = Schema.decodeUnknownSync;

describe("Studio bootstrap projection", () => {
  it("builds only the current shell identity and canonical role actions", () => {
    const bootstrap = buildStudioBootstrap({
      registration: {
        id: decode(StudioRegistrationId)("019fae8b-1234-7000-8000-000000000001"),
        version: ResourceVersion.make(3),
        applicationOrigin: decode(StudioApplicationOrigin)("https://application.example.test"),
        mountPath: decode(StudioMountPath)("/studio"),
      },
      project: {
        id: decode(ProjectId)("019fae8b-1234-7000-8000-000000000002"),
        name: decode(ProjectName)("Customer Site"),
        workspaceId: decode(WorkspaceId)("019fae8b-1234-7000-8000-000000000003"),
      },
      environment: {
        id: decode(EnvironmentId)("019fae8b-1234-7000-8000-000000000004"),
        key: "main",
        name: "main",
      },
      user: {
        id: decode(AuthUserId)("studio-user"),
        name: "Studio User",
        email: decode(CanonicalEmail)("studio@example.test"),
      },
      role: decode(ProjectRole)("editor"),
      expiresAt: decode(IsoDateTime)("2026-09-21T20:00:00.000Z"),
    });

    expect(bootstrap.formatVersion).toBe(1);
    expect(bootstrap.effectiveActions).toEqual(["project.read"]);
    expect(bootstrap.environment).toEqual(expect.objectContaining({ key: "main", name: "main" }));
    expect(JSON.stringify(bootstrap)).not.toContain("token");
    expect(JSON.stringify(bootstrap)).not.toContain("content");
  });
});
