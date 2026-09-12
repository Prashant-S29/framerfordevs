import { assert, describe, it } from "@effect/vitest";
import {
  CLI_API_OAUTH_SCOPES,
  CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE,
  CONTROL_PLANE_READ_SCOPE,
  CONTROL_PLANE_WRITE_SCOPE,
} from "@framerfordevs/auth";
import { Effect, Exit, Schema } from "effect";

import { CredentialScope } from "../access";

describe("Control Plane OAuth grants", () => {
  it("registers the three narrow grants on the fixed CLI OAuth authority", () => {
    assert.includeMembers(
      [...CLI_API_OAUTH_SCOPES],
      [CONTROL_PLANE_READ_SCOPE, CONTROL_PLANE_WRITE_SCOPE, CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE],
    );
    assert.strictEqual(new Set(CLI_API_OAUTH_SCOPES).size, CLI_API_OAUTH_SCOPES.length);
  });

  it.effect("keeps lifecycle authority out of management credential scopes", () =>
    Effect.gen(function* () {
      const archive = yield* Effect.exit(Schema.decodeUnknown(CredentialScope)("project.archive"));
      const restore = yield* Effect.exit(Schema.decodeUnknown(CredentialScope)("project.restore"));

      assert.isTrue(Exit.isFailure(archive));
      assert.isTrue(Exit.isFailure(restore));
    }),
  );
});
