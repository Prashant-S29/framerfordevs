import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { ControlPlaneActor } from "../../../contracts/control-plane";
import { EnvironmentId, ProjectId, WorkspaceId } from "../../../contracts/platform";
import {
  controlPlaneActorReferences,
  controlPlaneCommandFingerprint,
  type ControlPlaneCommandFingerprintInput,
} from "./index";

const userActor = Schema.decodeUnknownSync(ControlPlaneActor)({ kind: "user", id: "user-1" });
const credentialActor = Schema.decodeUnknownSync(ControlPlaneActor)({
  kind: "credential",
  id: "019fae8b-1234-7000-8000-000000000001",
});
const workspaceId = WorkspaceId.make("019fae8b-1234-7000-8000-000000000002");
const projectId = ProjectId.make("019fae8b-1234-7000-8000-000000000003");
const environmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000004");

function command(
  overrides: Partial<ControlPlaneCommandFingerprintInput> = {},
): ControlPlaneCommandFingerprintInput {
  return {
    operation: "studio_registration.put",
    actor: userActor,
    scope: { workspaceId, projectId, environmentId },
    input: {
      expectedVersion: 1,
      applicationOrigin: "https://studio.example.com",
      mountPath: "/studio",
    },
    ...overrides,
  };
}

describe("Control Plane command fingerprints", () => {
  it("is stable under object-key order changes", () => {
    const first = controlPlaneCommandFingerprint(command());
    const second = controlPlaneCommandFingerprint(
      command({
        input: {
          mountPath: "/studio",
          applicationOrigin: "https://studio.example.com",
          expectedVersion: 1,
        },
      }),
    );

    assert.match(first, /^[0-9a-f]{64}$/u);
    assert.strictEqual(second, first);
  });

  it("changes across operation, actor, scope, or exact normalized input", () => {
    const baseline = controlPlaneCommandFingerprint(command());
    const variants = [
      command({ operation: "project.capability.enable" }),
      command({ actor: credentialActor }),
      command({ scope: { workspaceId, projectId, environmentId: null } }),
      command({ input: { expectedVersion: 2 } }),
    ];

    assert.isTrue(
      variants.every((variant) => controlPlaneCommandFingerprint(variant) !== baseline),
    );
  });

  it("projects exactly one persisted actor reference", () => {
    assert.deepEqual(controlPlaneActorReferences(userActor), {
      actorType: "user",
      actorId: "user-1",
      userId: "user-1",
      credentialId: null,
    });
    assert.deepEqual(controlPlaneActorReferences(credentialActor), {
      actorType: "credential",
      actorId: "019fae8b-1234-7000-8000-000000000001",
      userId: null,
      credentialId: "019fae8b-1234-7000-8000-000000000001",
    });
  });
});
