import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { projectPermissionActionValues, projectRoleValues } from "../access";
import {
  ControlPlaneApiErrorCode,
  ControlPlaneCreateProjectRequest,
  ControlPlaneCreateWorkspaceRequest,
  ControlPlaneGovernanceResponse,
  ControlPlaneInitialCapabilities,
  ControlPlaneInvitationPageResponse,
  ControlPlaneLocaleListResponse,
  ControlPlaneMemberPageResponse,
  ControlPlanePutStudioRegistrationRequest,
  StudioApplicationOrigin,
  StudioMountPath,
  controlPlaneLimits,
} from "./index";

const commandId = "019fae8b-1234-7000-8000-000000000001";

const decodeExits = <A, I>(schema: Schema.Schema<A, I, never>, values: ReadonlyArray<unknown>) =>
  Effect.forEach(values, (value) => Effect.exit(Schema.decodeUnknown(schema)(value)));

describe("Control Plane contracts", () => {
  it.effect("accepts canonical HTTPS and explicit loopback Studio origins", () =>
    Effect.gen(function* () {
      const exits = yield* decodeExits(StudioApplicationOrigin, [
        "https://studio.example.com",
        "https://studio.example.com:8443",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
      ]);

      assert.isTrue(exits.every(Exit.isSuccess));
    }),
  );

  it.effect("rejects noncanonical or authority-bearing Studio origins", () =>
    Effect.gen(function* () {
      const exits = yield* decodeExits(StudioApplicationOrigin, [
        "http://example.com",
        "https://user:secret@example.com",
        "https://studio.example.com/",
        "https://studio.example.com/path",
        "https://studio.example.com?token=secret",
        "https://studio.example.com#fragment",
        "https://STUDIO.example.com",
        "https://studio.example.com:443",
        "https://*.example.com",
        `https://${"a".repeat(2_049)}.example.com`,
      ]);

      assert.isTrue(exits.every(Exit.isFailure));
    }),
  );

  it.effect("accepts bounded canonical mount paths", () =>
    Effect.gen(function* () {
      const valid = yield* decodeExits(StudioMountPath, ["/studio", "/admin/studio-v2", "/编辑器"]);
      const invalid = yield* decodeExits(StudioMountPath, [
        "/",
        "studio",
        "/studio/",
        "/admin//studio",
        "/admin/./studio",
        "/admin/../studio",
        "/studio?mode=edit",
        "/studio#fragment",
        "/studio%2Fadmin",
        "/studio\\admin",
        "/studio path",
        `/${"é".repeat(120)}`,
      ]);

      assert.isTrue(valid.every(Exit.isSuccess));
      assert.isTrue(invalid.every(Exit.isFailure));
    }),
  );

  it.effect("normalizes names while rejecting excess create fields", () =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknown(ControlPlaneCreateWorkspaceRequest)({
        commandId,
        name: "  Product Workspace  ",
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneCreateWorkspaceRequest)({
          commandId,
          name: "Product Workspace",
          ownerId: commandId,
        }),
      );

      assert.strictEqual(request.name, "Product Workspace");
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("accepts empty or unique initial capabilities and rejects duplicates", () =>
    Effect.gen(function* () {
      const empty = yield* Effect.exit(Schema.decodeUnknown(ControlPlaneInitialCapabilities)([]));
      const cms = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneInitialCapabilities)(["cms"]),
      );
      const duplicate = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneInitialCapabilities)(["cms", "cms"]),
      );
      const unknown = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneInitialCapabilities)(["billing"]),
      );

      assert.isTrue(Exit.isSuccess(empty));
      assert.isTrue(Exit.isSuccess(cms));
      assert.isTrue(Exit.isFailure(duplicate));
      assert.isTrue(Exit.isFailure(unknown));
    }),
  );

  it.effect("keeps project creation closed and command-idempotent", () =>
    Effect.gen(function* () {
      const valid = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneCreateProjectRequest)({
          commandId,
          name: "Product Site",
          key: "product-site",
          description: null,
          initialCapabilities: ["cms"],
        }),
      );
      const missingCommand = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneCreateProjectRequest)({
          name: "Product Site",
          key: "product-site",
          description: null,
          initialCapabilities: ["cms"],
        }),
      );

      assert.isTrue(Exit.isSuccess(valid));
      assert.isTrue(Exit.isFailure(missingCommand));
    }),
  );

  it.effect("distinguishes Studio create-only and positive-version update requests", () =>
    Effect.gen(function* () {
      const createOnly = yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
        commandId,
        expectedVersion: null,
        applicationOrigin: "https://studio.example.com",
        mountPath: "/studio",
      });
      const update = yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
        commandId,
        expectedVersion: 2,
        applicationOrigin: "https://studio.example.com",
        mountPath: "/studio-v2",
      });
      const zeroVersion = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlanePutStudioRegistrationRequest)({
          commandId,
          expectedVersion: 0,
          applicationOrigin: "https://studio.example.com",
          mountPath: "/studio",
        }),
      );

      assert.strictEqual(createOnly.expectedVersion, null);
      assert.strictEqual(update.expectedVersion, 2);
      assert.isTrue(Exit.isFailure(zeroVersion));
    }),
  );

  it("keeps maximum governance collection responses inside the public byte limit", () => {
    const workspaceId = "10000000-0000-4000-8000-000000000001";
    const projectId = "10000000-0000-4000-8000-000000000002";
    const environmentId = "10000000-0000-4000-8000-000000000003";
    const timestamp = "2026-09-16T00:00:00.000Z";
    const localeIds = Array.from(
      { length: 100 },
      (_, index) => `20000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    );
    const message = "m".repeat(512);
    const success = (data: unknown) => ({ ok: true, data, error: null, message });
    const assertWithinLimit = <A, I>(schema: Schema.Schema<A, I, never>, input: unknown) => {
      const decoded = Schema.decodeUnknownSync(schema)(input);
      assert.isAtMost(
        Buffer.byteLength(JSON.stringify(decoded), "utf8"),
        controlPlaneLimits.responseBytes,
      );
    };

    const member = {
      id: "30000000-0000-4000-8000-000000000001",
      projectId,
      userId: "u".repeat(255),
      name: "n".repeat(255),
      email: `${"a".repeat(316)}@x.y`,
      role: "developer",
      localeAccess: { mode: "selected", localeIds },
      version: 1,
      removedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    assertWithinLimit(
      ControlPlaneMemberPageResponse,
      success({ items: Array.from({ length: 50 }, () => member), nextCursor: null }),
    );

    const invitation = {
      id: "30000000-0000-4000-8000-000000000002",
      projectId,
      email: `${"a".repeat(316)}@x.y`,
      role: "developer",
      localeAccess: { mode: "selected", localeIds },
      status: "pending",
      version: 1,
      expiresAt: timestamp,
      acceptedAt: null,
      revokedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    assertWithinLimit(
      ControlPlaneInvitationPageResponse,
      success({ items: Array.from({ length: 50 }, () => invitation), nextCursor: null }),
    );

    assertWithinLimit(
      ControlPlaneLocaleListResponse,
      success({
        items: localeIds.map((id, position) => ({
          id,
          workspaceId,
          projectId,
          tag: "zh-Hant-CN",
          displayName: "l".repeat(100),
          status: "enabled",
          position,
          version: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      }),
    );

    assertWithinLimit(
      ControlPlaneGovernanceResponse,
      success({
        projectId,
        primaryEnvironment: {
          id: environmentId,
          key: "main",
          name: "main",
          isPrimary: true,
          createdAt: timestamp,
        },
        role: "developer",
        localeAccess: { mode: "selected", localeIds },
        baseRoleActions: projectPermissionActionValues,
        effectiveProjectActions: projectPermissionActionValues,
        effectiveLocaleIds: localeIds,
        effectiveLocaleActions: projectPermissionActionValues,
        fixedRolePolicies: projectRoleValues.map((role) => ({
          role,
          baseRoleActions: projectPermissionActionValues,
          requiresAllLocales: role === "owner",
        })),
        canReadMembers: true,
        canInviteMembers: true,
        canUpdateMemberPolicy: true,
        canRemoveMembers: true,
      }),
    );
  });

  it.effect("keeps the public error-code union closed", () =>
    Effect.gen(function* () {
      const commandConflict = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("COMMAND_CONFLICT"),
      );
      const cursorInvalid = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("CONTROL_PLANE_CURSOR_INVALID"),
      );
      const invitationConflict = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("INVITATION_CONFLICT"),
      );
      const localeConflict = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("LOCALE_CONFLICT"),
      );
      const internalCode = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("DATABASE_FAILURE"),
      );

      assert.isTrue(Exit.isSuccess(commandConflict));
      assert.isTrue(Exit.isSuccess(cursorInvalid));
      assert.isTrue(Exit.isSuccess(invitationConflict));
      assert.isTrue(Exit.isSuccess(localeConflict));
      assert.isTrue(Exit.isFailure(internalCode));
    }),
  );
});
