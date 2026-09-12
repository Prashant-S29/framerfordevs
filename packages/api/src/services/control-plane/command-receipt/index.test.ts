import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { ControlPlaneActor, ControlPlaneCommandId } from "../../../contracts/control-plane";
import { EnvironmentId, ProjectId, WorkspaceId } from "../../../contracts/platform";
import { controlPlaneReceiptMatches, type ControlPlaneReceiptExpectation } from "./index";

const actor = Schema.decodeUnknownSync(ControlPlaneActor)({ kind: "user", id: "user-1" });
const expectation: ControlPlaneReceiptExpectation = {
  commandId: ControlPlaneCommandId.make("019fae8b-1234-7000-8000-000000000001"),
  operation: "studio_registration.put",
  actor,
  fingerprint: "a".repeat(64),
  workspaceId: WorkspaceId.make("019fae8b-1234-7000-8000-000000000002"),
  projectId: ProjectId.make("019fae8b-1234-7000-8000-000000000003"),
  environmentId: EnvironmentId.make("019fae8b-1234-7000-8000-000000000004"),
};
const receipt = {
  operation: expectation.operation,
  actorType: expectation.actor.kind,
  actorId: expectation.actor.id,
  fingerprint: expectation.fingerprint,
  workspaceId: expectation.workspaceId,
  projectId: expectation.projectId,
  environmentId: expectation.environmentId,
};

describe("Control Plane command receipts", () => {
  it("matches only the exact operation, actor, fingerprint, and tenant scope", () => {
    assert.isTrue(controlPlaneReceiptMatches(receipt, expectation));
    const variants = [
      { ...receipt, operation: "project.create" },
      { ...receipt, actorType: "credential" },
      { ...receipt, actorId: "user-2" },
      { ...receipt, fingerprint: "b".repeat(64) },
      { ...receipt, workspaceId: "019fae8b-1234-7000-8000-000000000099" },
      { ...receipt, projectId: null },
      { ...receipt, environmentId: null },
    ];

    assert.isTrue(variants.every((variant) => !controlPlaneReceiptMatches(variant, expectation)));
  });
});
