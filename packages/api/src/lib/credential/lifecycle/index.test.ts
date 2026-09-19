import { assert, describe, it } from "@effect/vitest";

import {
  canChangeCredentialRotation,
  canCredentialAuthenticate,
  credentialRotationOverlapMs,
  credentialRotationRetireAt,
} from "./index";

const now = new Date("2026-09-16T00:00:00.000Z");

describe("credential lifecycle", () => {
  it("authenticates only active and unexpired overlap credentials", () => {
    assert.isTrue(
      canCredentialAuthenticate({ status: "active", expiresAt: null, retireAt: null }, now),
    );
    assert.isTrue(
      canCredentialAuthenticate(
        {
          status: "retiring",
          expiresAt: null,
          retireAt: new Date(now.getTime() + 1),
        },
        now,
      ),
    );

    for (const status of ["pending", "expired", "revoked", "canceled"] as const) {
      assert.isFalse(canCredentialAuthenticate({ status, expiresAt: null, retireAt: null }, now));
    }
    assert.isFalse(
      canCredentialAuthenticate({ status: "active", expiresAt: now, retireAt: null }, now),
    );
    assert.isFalse(
      canCredentialAuthenticate({ status: "retiring", expiresAt: null, retireAt: now }, now),
    );
  });

  it("keeps rotation transitions closed", () => {
    assert.isTrue(canChangeCredentialRotation("pending", "activate"));
    assert.isTrue(canChangeCredentialRotation("pending", "cancel"));
    assert.isTrue(canChangeCredentialRotation("overlap", "complete"));

    for (const status of ["canceled", "completed"] as const) {
      for (const action of ["activate", "cancel", "complete"] as const) {
        assert.isFalse(canChangeCredentialRotation(status, action));
      }
    }
    assert.isFalse(canChangeCredentialRotation("pending", "complete"));
    assert.isFalse(canChangeCredentialRotation("overlap", "activate"));
    assert.isFalse(canChangeCredentialRotation("overlap", "cancel"));
  });

  it("uses an exact 24-hour overlap", () => {
    const retireAt = credentialRotationRetireAt(now);
    assert.strictEqual(retireAt.getTime() - now.getTime(), credentialRotationOverlapMs);
    assert.strictEqual(retireAt.toISOString(), "2026-09-17T00:00:00.000Z");
  });
});
