// Verifies canonical Control Plane decoding, authority requirements, and transport principal adaptation.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { CredentialPrincipal } from "../../../contracts/access";
import {
  controlPlaneBearerRequirements,
  controlPlanePrincipalActor,
  controlPlanePrincipalKey,
  controlPlaneRequestCosts,
  decodeControlPlaneCreateWorkspaceRequest,
  decodeControlPlaneInvitationListInput,
  decodeControlPlaneLocaleListInput,
  decodeControlPlaneMemberListInput,
  decodeControlPlaneListProjectsInput,
  decodeControlPlaneListWorkspacesQuery,
} from "./index";

const oauthPrincipal = {
  kind: "oauth_user" as const,
  userId: "user-1",
  clientId: "framerfordevs-cli" as const,
  scopes: ["control-plane:read"],
  expiresAtEpochSeconds: 1_800_000_000,
};
const credential = Schema.decodeUnknownSync(CredentialPrincipal)({
  credentialId: "019fae8b-1234-7000-8000-000000000001",
  workspaceId: "019fae8b-1234-7000-8000-000000000002",
  projectId: "019fae8b-1234-7000-8000-000000000003",
  environmentId: "019fae8b-1234-7000-8000-000000000004",
  family: "management",
  scopes: ["project.read", "project.update", "project.capability.manage"],
});
const credentialPrincipal = { kind: "management_credential" as const, credential };
const sessionPrincipal = { kind: "session_user" as const, userId: "user-1" };

describe("Control Plane public principal boundary", () => {
  it("uses the developer-approved weighted operation costs", () => {
    assert.deepEqual(controlPlaneRequestCosts, {
      read: 1,
      list: 2,
      create: 5,
      update: 3,
      lifecycle: 5,
      studioWrite: 5,
    });
  });

  it("keeps enumeration, creation, and lifecycle OAuth-only", () => {
    const oauthOnly = [
      "listWorkspaces",
      "createWorkspace",
      "getWorkspace",
      "listProjects",
      "createProject",
      "archiveProject",
      "restoreProject",
    ] as const;

    assert.isTrue(
      oauthOnly.every(
        (operation) =>
          controlPlaneBearerRequirements[operation].authority === "oauth_only" &&
          controlPlaneBearerRequirements[operation].managementScopes.length === 0,
      ),
    );
    assert.strictEqual(
      controlPlaneBearerRequirements.archiveProject.oauthScope,
      "control-plane:project:lifecycle",
    );
    assert.strictEqual(
      controlPlaneBearerRequirements.restoreProject.oauthScope,
      "control-plane:project:lifecycle",
    );
  });

  it("declares only the exact management scopes for project-bound operations", () => {
    assert.deepEqual(controlPlaneBearerRequirements.getProject.managementScopes, ["project.read"]);
    assert.deepEqual(controlPlaneBearerRequirements.updateProject.managementScopes, [
      "project.update",
    ]);
    assert.deepEqual(controlPlaneBearerRequirements.enableCapability.managementScopes, [
      "project.capability.manage",
    ]);
    assert.deepEqual(controlPlaneBearerRequirements.getStudioRegistration.managementScopes, [
      "project.read",
    ]);
    assert.deepEqual(controlPlaneBearerRequirements.putStudioRegistration.managementScopes, [
      "project.update",
    ]);
    assert.deepEqual(controlPlaneBearerRequirements.listLocales.managementScopes, ["locale.read"]);
    assert.deepEqual(controlPlaneBearerRequirements.listLocaleSettings.managementScopes, [
      "locale.manage",
    ]);
    assert.deepEqual(controlPlaneBearerRequirements.manageLocales.managementScopes, [
      "locale.manage",
    ]);
    assert.strictEqual(
      controlPlaneBearerRequirements.listLocaleSettings.oauthScope,
      "control-plane:governance:read",
    );
    assert.strictEqual(
      controlPlaneBearerRequirements.manageLocales.oauthScope,
      "control-plane:governance:write",
    );
    assert.deepEqual(controlPlaneBearerRequirements.listCredentials.managementScopes, []);
    assert.deepEqual(controlPlaneBearerRequirements.manageCredentials.managementScopes, []);
    assert.deepEqual(controlPlaneBearerRequirements.listWebhooks.managementScopes, [
      "webhook.read",
    ]);
    assert.deepEqual(controlPlaneBearerRequirements.manageWebhooks.managementScopes, [
      "webhook.manage",
    ]);
    assert.deepEqual(controlPlaneBearerRequirements.listAuditEvents.managementScopes, []);
    assert.strictEqual(
      controlPlaneBearerRequirements.listAuditEvents.oauthScope,
      "control-plane:security:read",
    );
  });

  it.effect("decodes bounded page defaults and rejects ambiguous query authority", () =>
    Effect.gen(function* () {
      const workspaces = yield* decodeControlPlaneListWorkspacesQuery("");
      assert.deepEqual(workspaces, { cursor: null, limit: 20 });

      const projects = yield* decodeControlPlaneListProjectsInput(
        "019fae8b-1234-7000-8000-000000000002",
        "status=archived&limit=50",
      );
      assert.strictEqual(projects.status, "archived");
      assert.strictEqual(projects.limit, 50);
      assert.isNull(projects.cursor);

      const duplicate = yield* Effect.flip(
        decodeControlPlaneListWorkspacesQuery("limit=10&limit=20"),
      );
      assert.strictEqual(duplicate._tag, "ValidationFailure");
      const unknown = yield* Effect.flip(decodeControlPlaneListWorkspacesQuery("token=secret"));
      assert.strictEqual(unknown._tag, "ValidationFailure");
    }),
  );

  it.effect("normalizes closed governance list and locale projections", () =>
    Effect.gen(function* () {
      const projectId = "019fae8b-1234-7000-8000-000000000003";
      const members = yield* decodeControlPlaneMemberListInput(
        projectId,
        "role=editor&search=%20CLIENT%20&limit=10",
      );
      const invitations = yield* decodeControlPlaneInvitationListInput(
        projectId,
        "status=pending&search=Invitee%40Example.test",
      );
      const locales = yield* decodeControlPlaneLocaleListInput(
        projectId,
        "view=settings&includeRemoved=true",
      );
      const invalidEffectiveRemoved = yield* Effect.exit(
        decodeControlPlaneLocaleListInput(projectId, "includeRemoved=true"),
      );

      assert.strictEqual(members.search, "client");
      assert.strictEqual(members.role, "editor");
      assert.strictEqual(invitations.search, "invitee@example.test");
      assert.strictEqual(invitations.status, "pending");
      assert.strictEqual(locales.view, "settings");
      assert.isTrue(locales.includeRemoved);
      assert.strictEqual(invalidEffectiveRemoved._tag, "Failure");
    }),
  );

  it.effect("rejects excess mutation fields", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        decodeControlPlaneCreateWorkspaceRequest({
          commandId: "019fae8b-1234-7000-8000-000000000005",
          name: "Workspace",
          unexpected: true,
        }),
      );
      assert.strictEqual(failure._tag, "ValidationFailure");
    }),
  );

  it("adapts principals without issuer impersonation", () => {
    assert.deepEqual(controlPlanePrincipalActor(oauthPrincipal), { kind: "user", id: "user-1" });
    assert.deepEqual(controlPlanePrincipalActor(credentialPrincipal), {
      kind: "credential",
      id: credential.credentialId,
    });
    assert.deepEqual(controlPlanePrincipalActor(sessionPrincipal), { kind: "user", id: "user-1" });
    assert.strictEqual(controlPlanePrincipalKey(oauthPrincipal), "oauth:framerfordevs-cli:user-1");
    assert.strictEqual(controlPlanePrincipalKey(sessionPrincipal), "session:user-1");
    assert.strictEqual(
      controlPlanePrincipalKey(credentialPrincipal),
      `credential:${credential.credentialId}`,
    );
  });
});
