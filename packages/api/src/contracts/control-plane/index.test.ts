import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  ControlPlaneApiErrorCode,
  ControlPlaneCreateProjectRequest,
  ControlPlaneCreateWorkspaceRequest,
  ControlPlaneInitialCapabilities,
  ControlPlanePutStudioRegistrationRequest,
  StudioApplicationOrigin,
  StudioMountPath,
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

  it.effect("keeps the public error-code union closed", () =>
    Effect.gen(function* () {
      const commandConflict = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("COMMAND_CONFLICT"),
      );
      const cursorInvalid = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("CONTROL_PLANE_CURSOR_INVALID"),
      );
      const internalCode = yield* Effect.exit(
        Schema.decodeUnknown(ControlPlaneApiErrorCode)("DATABASE_FAILURE"),
      );

      assert.isTrue(Exit.isSuccess(commandConflict));
      assert.isTrue(Exit.isSuccess(cursorInvalid));
      assert.isTrue(Exit.isFailure(internalCode));
    }),
  );
});
