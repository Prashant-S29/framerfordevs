import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import {
  ControlPlaneEnableCapabilityInput,
  ControlPlaneEnableCapabilityResult,
  ControlPlaneCursorInput,
  ControlPlaneWorkspace,
  ControlPlanePutStudioRegistrationInput,
  ControlPlanePutStudioRegistrationResult,
  ControlPlaneStudioRegistrationScope,
  StudioRegistration,
} from "../../contracts/control-plane";
import { AuthUserId, Capability } from "../../contracts/platform";
import {
  ControlPlaneCursorSigner,
  makeControlPlaneCursorSigner,
} from "../../services/control-plane/cursor-signer";
import { PlatformRepository, makePlatformRepository } from "../../services/platform-repository";
import {
  enableCapabilityForSession,
  getStudioRegistrationForSession,
  listWorkspaces,
  putStudioRegistrationForSession,
} from "./index";

const registration = Schema.decodeUnknownSync(StudioRegistration)({
  id: "019fae8b-1234-7000-8000-000000000001",
  projectId: "019fae8b-1234-7000-8000-000000000002",
  environmentId: "019fae8b-1234-7000-8000-000000000003",
  applicationOrigin: "https://studio.example.test",
  mountPath: "/studio",
  version: 1,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});
const capability = Schema.decodeUnknownSync(Capability)({
  id: "019fae8b-1234-7000-8000-000000000005",
  key: "cms",
  status: "enabled",
  version: 1,
  changedAt: "2026-08-14T00:00:00.000Z",
});
const workspace = Schema.decodeUnknownSync(ControlPlaneWorkspace)({
  id: "019fae8b-1234-7000-8000-000000000007",
  name: "Workspace",
  version: 1,
  role: "owner",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});
const calls: Array<string> = [];
let workspaceListPosition: {
  readonly finalSortAtEpochMs: number;
  readonly finalId: string;
} | null = null;

const PlatformRepositoryTest = Layer.succeed(PlatformRepository, {
  ...makePlatformRepository(),
  listControlPlaneWorkspaces: (_actor, _limit, position) =>
    Effect.sync(() => {
      workspaceListPosition = position;
      return {
        items: [workspace],
        nextPosition:
          position === null ? { finalSortAtEpochMs: Date.now(), finalId: workspace.id } : null,
      };
    }),
  enableControlPlaneCapability: (actor: { readonly kind: string; readonly id: string }) =>
    Effect.sync(() => {
      calls.push(`enable:${actor.kind}:${actor.id}`);
      return ControlPlaneEnableCapabilityResult.make({ capability, replayed: false });
    }),
  getStudioRegistration: (actor: { readonly kind: string; readonly id: string }) =>
    Effect.sync(() => {
      calls.push(`get:${actor.kind}:${actor.id}`);
      return registration;
    }),
  putStudioRegistration: (actor: { readonly kind: string; readonly id: string }) =>
    Effect.sync(() => {
      calls.push(`put:${actor.kind}:${actor.id}`);
      return ControlPlanePutStudioRegistrationResult.make({
        registration,
        created: false,
        replayed: false,
        noOp: true,
      });
    }),
});

const ControlPlaneCursorSignerTest = Layer.succeed(
  ControlPlaneCursorSigner,
  makeControlPlaneCursorSigner({
    activeSecret: "control-plane-test-secret-at-least-32-characters",
  }),
);

describe("Control Plane operations", () => {
  layer(Layer.merge(PlatformRepositoryTest, ControlPlaneCursorSignerTest))((it) => {
    it.effect("signs and verifies workspace positions without exposing unsigned cursors", () =>
      Effect.gen(function* () {
        workspaceListPosition = null;
        const actor = { kind: "user" as const, id: AuthUserId.make("user-1") };
        const first = yield* listWorkspaces(actor, "oauth:cli:user-1", {
          cursor: null,
          limit: 1,
        });
        assert.strictEqual(first.items[0]?.id, workspace.id);
        assert.isNotNull(first.nextCursor);
        assert.isNull(workspaceListPosition);

        const cursor = yield* Schema.decodeUnknown(ControlPlaneCursorInput)(first.nextCursor);
        const second = yield* listWorkspaces(actor, "oauth:cli:user-1", {
          cursor,
          limit: 1,
        });
        assert.isNull(second.nextCursor);
        assert.isNotNull(workspaceListPosition);

        const failure = yield* Effect.flip(
          listWorkspaces(actor, "oauth:cli:another-user", {
            cursor,
            limit: 1,
          }),
        );
        assert.strictEqual(failure._tag, "ControlPlaneCursorInvalidFailure");
      }),
    );

    it.effect("adapts dashboard sessions to the same branded actor operations", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const scope = yield* Schema.decodeUnknown(ControlPlaneStudioRegistrationScope)({
          projectId: registration.projectId,
          environmentId: registration.environmentId,
        });
        const capabilityInput = yield* Schema.decodeUnknown(ControlPlaneEnableCapabilityInput)({
          projectId: registration.projectId,
          commandId: "019fae8b-1234-7000-8000-000000000006",
        });
        const input = yield* Schema.decodeUnknown(ControlPlanePutStudioRegistrationInput)({
          ...scope,
          commandId: "019fae8b-1234-7000-8000-000000000004",
          expectedVersion: registration.version,
          applicationOrigin: registration.applicationOrigin,
          mountPath: registration.mountPath,
        });

        assert.isFalse(
          (yield* enableCapabilityForSession(
            "user-1",
            capabilityInput,
            "request-m14-capability-operation",
          )).replayed,
        );
        assert.strictEqual(
          (yield* getStudioRegistrationForSession("user-1", scope)).id,
          registration.id,
        );
        assert.isTrue(
          (yield* putStudioRegistrationForSession("user-1", input, "request-m14-operation")).noOp,
        );
        assert.deepEqual(calls, ["enable:user:user-1", "get:user:user-1", "put:user:user-1"]);
      }),
    );
  });
});
