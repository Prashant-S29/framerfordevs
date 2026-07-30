import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  CanonicalEmail,
  CredentialKeyPrefix,
  CredentialScopes,
  CredentialSecret,
  InvitationToken,
  ProjectInvitationStatus,
  ProjectPermissionAction,
  ProjectRole,
} from "./access";

const credentialId = "019fae8b-1234-7000-8000-000000000001";
const secret = "A".repeat(43);

describe("access contracts", () => {
  it.effect("canonicalizes invitation email addresses", () =>
    Effect.gen(function* () {
      const email = yield* Schema.decodeUnknown(CanonicalEmail)("  Client@Example.COM  ");

      assert.strictEqual(email, "client@example.com");
    }),
  );

  it.effect("accepts every credential family prefix and secret format", () =>
    Effect.gen(function* () {
      for (const family of ["mgmt", "del", "prev"]) {
        const prefix = `ffd_${family}_${credentialId}`;
        const key = `${prefix}_${secret}`;

        assert.strictEqual(yield* Schema.decodeUnknown(CredentialKeyPrefix)(prefix), prefix);
        assert.strictEqual(yield* Schema.decodeUnknown(CredentialSecret)(key), key);
      }
    }),
  );

  it.effect("rejects malformed or incorrectly sized invitation and credential secrets", () =>
    Effect.gen(function* () {
      const exits = yield* Effect.all([
        Effect.exit(Schema.decodeUnknown(InvitationToken)("short")),
        Effect.exit(Schema.decodeUnknown(InvitationToken)("!".repeat(43))),
        Effect.exit(
          Schema.decodeUnknown(CredentialSecret)(`ffd_mgmt_${credentialId}_${"A".repeat(42)}`),
        ),
        Effect.exit(
          Schema.decodeUnknown(CredentialSecret)(`ffd_unknown_${credentialId}_${secret}`),
        ),
      ]);

      assert.isTrue(exits.every((exit) => exit._tag === "Failure"));
    }),
  );

  it.effect("requires a bounded unique credential scope set", () =>
    Effect.gen(function* () {
      const valid = yield* Schema.decodeUnknown(CredentialScopes)(["project.read", "content.read"]);
      const empty = yield* Effect.exit(Schema.decodeUnknown(CredentialScopes)([]));
      const duplicate = yield* Effect.exit(
        Schema.decodeUnknown(CredentialScopes)(["project.read", "project.read"]),
      );

      assert.deepEqual(valid, ["project.read", "content.read"]);
      assert.isTrue(Exit.isFailure(empty));
      assert.isTrue(Exit.isFailure(duplicate));
    }),
  );

  it.effect("rejects unknown roles, actions, scopes, and invitation states", () =>
    Effect.gen(function* () {
      const exits = yield* Effect.all([
        Effect.exit(Schema.decodeUnknown(ProjectRole)("admin")),
        Effect.exit(Schema.decodeUnknown(ProjectPermissionAction)("project.delete")),
        Effect.exit(Schema.decodeUnknown(CredentialScopes)(["credential.manage"])),
        Effect.exit(Schema.decodeUnknown(ProjectInvitationStatus)("used")),
      ]);

      assert.isTrue(exits.every((exit) => exit._tag === "Failure"));
    }),
  );
});
