import { assert, describe, it } from "@effect/vitest";

import { decideStudioCollectionProjection } from "./index";

describe("Studio collection projection decision", () => {
  it("returns owner/developer diagnostics for both residual invalid states", () => {
    for (const role of ["owner", "developer"] as const) {
      assert.deepEqual(
        decideStudioCollectionProjection({
          role,
          activeFieldCount: 0,
          projectedRootFieldCount: 0,
          projectedPlacementCount: 0,
        }),
        { kind: "configuration_invalid", reason: "empty_schema" },
      );
      assert.deepEqual(
        decideStudioCollectionProjection({
          role,
          activeFieldCount: 1,
          projectedRootFieldCount: 0,
          projectedPlacementCount: 0,
        }),
        { kind: "configuration_invalid", reason: "projection_invalid" },
      );
    }
  });

  it("keeps every zero projection non-enumerating for other roles", () => {
    for (const role of [
      "content_admin",
      "editor",
      "reviewer",
      "client_editor",
      "read_only",
    ] as const) {
      for (const activeFieldCount of [0, 2]) {
        assert.deepEqual(
          decideStudioCollectionProjection({
            role,
            activeFieldCount,
            projectedRootFieldCount: 0,
            projectedPlacementCount: 0,
          }),
          { kind: "hidden" },
        );
      }
    }
  });

  it("returns visible only when fields and effective placements remain", () => {
    assert.deepEqual(
      decideStudioCollectionProjection({
        role: "editor",
        activeFieldCount: 2,
        projectedRootFieldCount: 1,
        projectedPlacementCount: 1,
      }),
      { kind: "visible" },
    );
    assert.throws(() =>
      decideStudioCollectionProjection({
        role: "owner",
        activeFieldCount: -1,
        projectedRootFieldCount: 0,
        projectedPlacementCount: 0,
      }),
    );
  });
});
