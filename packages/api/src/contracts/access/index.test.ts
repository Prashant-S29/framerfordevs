// Verifies access identity normalization, credential formats, permissions, and issuance boundary contracts.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import {
  CanonicalEmail,
  CredentialKeyPrefix,
  CredentialScopes,
  CredentialSecret,
  InvitationToken,
  IssueApiCredentialInput,
  ListProjectInvitationsInput,
  ListProjectMembersInput,
  LocaleAccessMode,
  ProjectAccessSearch,
  ProjectActor,
  ProjectInvitationPolicy,
  ProjectInvitationStatus,
  ProjectLocaleAccess,
  ProjectMemberPolicy,
  ProjectPermissionAction,
  ProjectRole,
  UpdateProjectMemberPolicyInput,
} from "./index";

import * as SchemaStrict from "../../lib/schema-strict";
const credentialId = "019fae8b-1234-7000-8000-000000000001";
const secret = "A".repeat(43);
const membershipId = "019fae8b-1234-7000-8000-000000000002";
const projectId = "019fae8b-1234-7000-8000-000000000004";
const localeId = "019fae8b-1234-7000-8000-000000000003";

describe("access contracts", () => {
  it.effect("canonicalizes invitation email addresses", () =>
    Effect.gen(function* () {
      const email =
        yield* SchemaStrict.decodeUnknownEffect(CanonicalEmail)("  Client@Example.COM  ");

      assert.strictEqual(email, "client@example.com");
    }),
  );

  it.effect("canonicalizes bounded governance search and list defaults", () =>
    Effect.gen(function* () {
      const search = yield* SchemaStrict.decodeUnknownEffect(ProjectAccessSearch)("  ClIeNt  ");
      const members = yield* SchemaStrict.decodeUnknownEffect(ListProjectMembersInput)({
        projectId,
        cursor: null,
        limit: 20,
      });
      const invitations = yield* SchemaStrict.decodeUnknownEffect(ListProjectInvitationsInput)({
        projectId,
        cursor: null,
        limit: 20,
      });

      assert.strictEqual(search, "client");
      assert.isNull(members.role);
      assert.isNull(members.search);
      assert.strictEqual(invitations.status, "all");
      assert.isNull(invitations.search);
    }),
  );

  it.effect("accepts every credential family prefix and secret format", () =>
    Effect.gen(function* () {
      for (const family of ["mgmt", "del", "prev"]) {
        const prefix = `ffd_${family}_${credentialId}`;
        const key = `${prefix}_${secret}`;

        assert.strictEqual(
          yield* SchemaStrict.decodeUnknownEffect(CredentialKeyPrefix)(prefix),
          prefix,
        );
        assert.strictEqual(yield* SchemaStrict.decodeUnknownEffect(CredentialSecret)(key), key);
      }
    }),
  );

  it.effect("rejects malformed or incorrectly sized invitation and credential secrets", () =>
    Effect.gen(function* () {
      const exits = yield* Effect.all([
        Effect.exit(SchemaStrict.decodeUnknownEffect(InvitationToken)("short")),
        Effect.exit(SchemaStrict.decodeUnknownEffect(InvitationToken)("!".repeat(43))),
        Effect.exit(
          SchemaStrict.decodeUnknownEffect(CredentialSecret)(
            `ffd_mgmt_${credentialId}_${"A".repeat(42)}`,
          ),
        ),
        Effect.exit(
          SchemaStrict.decodeUnknownEffect(CredentialSecret)(
            `ffd_unknown_${credentialId}_${secret}`,
          ),
        ),
      ]);

      assert.isTrue(exits.every((exit) => exit._tag === "Failure"));
    }),
  );

  it.effect("defaults Preview authority acknowledgement to false at the decoded boundary", () =>
    Effect.gen(function* () {
      const input = yield* SchemaStrict.decodeUnknownEffect(IssueApiCredentialInput)({
        projectId: "019fae8b-1234-7000-8000-000000000010",
        environmentId: "019fae8b-1234-7000-8000-000000000011",
        family: "preview",
        name: "Preview integration",
        scopes: ["preview.read"],
        expiresAt: "2026-09-01T00:00:00.000Z",
      });

      assert.isFalse(input.previewAuthorityAcknowledged);
      assert.isFalse(input.nonExpiringAcknowledged);
    }),
  );

  it.effect("requires a bounded unique credential scope set", () =>
    Effect.gen(function* () {
      const valid = yield* SchemaStrict.decodeUnknownEffect(CredentialScopes)([
        "project.read",
        "content.read",
      ]);
      const empty = yield* Effect.exit(SchemaStrict.decodeUnknownEffect(CredentialScopes)([]));
      const duplicate = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(CredentialScopes)(["project.read", "project.read"]),
      );

      assert.deepEqual(valid, ["project.read", "content.read"]);
      assert.isTrue(Exit.isFailure(empty));
      assert.isTrue(Exit.isFailure(duplicate));
    }),
  );

  it.effect("accepts all, none, and bounded unique selected locale access", () =>
    Effect.gen(function* () {
      const values = yield* Effect.all([
        SchemaStrict.decodeUnknownEffect(ProjectLocaleAccess)({ mode: "all" }),
        SchemaStrict.decodeUnknownEffect(ProjectLocaleAccess)({ mode: "none" }),
        SchemaStrict.decodeUnknownEffect(ProjectLocaleAccess)({
          mode: "selected",
          localeIds: [localeId],
        }),
      ]);

      assert.deepEqual(
        values.map((value) => value.mode),
        ["all", "none", "selected"],
      );
    }),
  );

  it.effect("enforces complete member and invitation policy including owner locale authority", () =>
    Effect.gen(function* () {
      const valid = yield* Effect.all([
        SchemaStrict.decodeUnknownEffect(ProjectMemberPolicy)({
          role: "owner",
          localeAccess: { mode: "all" },
        }),
        SchemaStrict.decodeUnknownEffect(ProjectInvitationPolicy)({
          role: "client_editor",
          localeAccess: { mode: "selected", localeIds: [localeId] },
        }),
        SchemaStrict.decodeUnknownEffect(UpdateProjectMemberPolicyInput)({
          projectId,
          membershipId,
          version: 2,
          role: "read_only",
          localeAccess: { mode: "none" },
        }),
      ]);
      const invalid = yield* Effect.all([
        Effect.exit(
          SchemaStrict.decodeUnknownEffect(ProjectMemberPolicy)({
            role: "owner",
            localeAccess: { mode: "selected", localeIds: [localeId] },
          }),
        ),
        Effect.exit(
          SchemaStrict.decodeUnknownEffect(ProjectInvitationPolicy)({
            role: "owner",
            localeAccess: { mode: "none" },
          }),
        ),
        Effect.exit(
          SchemaStrict.decodeUnknownEffect(UpdateProjectMemberPolicyInput)({
            projectId,
            membershipId,
            version: 2,
            role: "owner",
            localeAccess: { mode: "none" },
          }),
        ),
      ]);

      assert.deepEqual(
        valid.map((policy) => policy.localeAccess.mode),
        ["all", "selected", "none"],
      );
      assert.isTrue(invalid.every(Exit.isFailure));
    }),
  );

  it.effect("uses one strict user-or-credential project actor shape", () =>
    Effect.gen(function* () {
      const actors = yield* Effect.all([
        SchemaStrict.decodeUnknownEffect(ProjectActor)({ kind: "user", id: "user-1" }),
        SchemaStrict.decodeUnknownEffect(ProjectActor)({ kind: "credential", id: credentialId }),
      ]);
      const excess = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(ProjectActor)({
          kind: "user",
          id: "user-1",
          issuerId: "user-2",
        }),
      );

      assert.deepEqual(
        actors.map((actor) => actor.kind),
        ["user", "credential"],
      );
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("rejects empty, duplicate, and unknown locale access", () =>
    Effect.gen(function* () {
      const exits = yield* Effect.all([
        Effect.exit(
          SchemaStrict.decodeUnknownEffect(ProjectLocaleAccess)({
            mode: "selected",
            localeIds: [],
          }),
        ),
        Effect.exit(
          SchemaStrict.decodeUnknownEffect(ProjectLocaleAccess)({
            mode: "selected",
            localeIds: [localeId, localeId],
          }),
        ),
        Effect.exit(SchemaStrict.decodeUnknownEffect(LocaleAccessMode)("inherited")),
      ]);

      assert.isTrue(exits.every((exit) => exit._tag === "Failure"));
    }),
  );

  it.effect("rejects unknown roles, actions, scopes, and invitation states", () =>
    Effect.gen(function* () {
      assert.strictEqual(
        yield* SchemaStrict.decodeUnknownEffect(ProjectPermissionAction)(
          "project.member.locale.update",
        ),
        "project.member.locale.update",
      );
      assert.strictEqual(
        yield* SchemaStrict.decodeUnknownEffect(ProjectPermissionAction)("project.restore"),
        "project.restore",
      );
      assert.strictEqual(
        yield* SchemaStrict.decodeUnknownEffect(ProjectPermissionAction)("project.audit.read"),
        "project.audit.read",
      );
      const exits = yield* Effect.all([
        Effect.exit(SchemaStrict.decodeUnknownEffect(ProjectRole)("admin")),
        Effect.exit(SchemaStrict.decodeUnknownEffect(ProjectPermissionAction)("project.delete")),
        Effect.exit(SchemaStrict.decodeUnknownEffect(CredentialScopes)(["credential.manage"])),
        Effect.exit(SchemaStrict.decodeUnknownEffect(ProjectInvitationStatus)("used")),
      ]);

      assert.isTrue(exits.every((exit) => exit._tag === "Failure"));
    }),
  );
});
