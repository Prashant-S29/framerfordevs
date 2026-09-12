import { assert, describe, it } from "@effect/vitest";

import type { ControlPlaneProjectAction } from "../../../contracts/control-plane";
import { controlPlaneProjectPolicyAction } from "./index";

describe("Control Plane project authorization", () => {
  it("maps every public action onto the existing shared policy authority", () => {
    assert.deepEqual(
      (
        [
          "project.read",
          "project.update",
          "project.archive",
          "project.restore",
          "project.capability.manage",
          "studio_registration.read",
          "studio_registration.write",
        ] satisfies ReadonlyArray<ControlPlaneProjectAction>
      ).map(controlPlaneProjectPolicyAction),
      [
        "project.read",
        "project.update",
        "project.archive",
        "project.restore",
        "project.capability.manage",
        "project.read",
        "project.update",
      ],
    );
  });
});
