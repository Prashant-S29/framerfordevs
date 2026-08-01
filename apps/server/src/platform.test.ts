import { randomUUID } from "node:crypto";

import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import { db } from "@framerfordevs/db";
import { eq, or } from "@framerfordevs/db/query";
import {
  apiCredential,
  apiCredentialScope,
  projectInvitation,
  projectMembership,
} from "@framerfordevs/db/schema/access";
import { user } from "@framerfordevs/db/schema/auth";
import { projectLocale, projectMembershipLocaleAccess } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "./app";

const app = createApp();
const suffix = randomUUID();
const firstEmail = `m2-api-a-${suffix}@example.test`;
const secondEmail = `m2-api-b-${suffix}@example.test`;
const password = "M2-API-Password-123!";
type TestAgent = ReturnType<typeof request.agent>;

let firstAgent: TestAgent;
let secondAgent: TestAgent;
let firstUserId = "";
let secondUserId = "";
let firstWorkspaceId = "";
let secondWorkspaceId = "";
let projectId = "";
let environmentId = "";
let hindiLocaleId = "";
let projectVersion = 1;

async function signUp(email: string, name: string) {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/auth/sign-up/email")
    .set("Origin", "http://localhost:3001")
    .send({ name, email, password });
  expect(response.status).toBe(200);
  return agent;
}

function rpc(agent: TestAgent, path: string, input: object) {
  return agent.post(`/rpc/${path}`).send({ json: input });
}

beforeAll(async () => {
  firstAgent = await signUp(firstEmail, "M2 API Owner A");
  secondAgent = await signUp(secondEmail, "M2 API Owner B");
  const users = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(or(eq(user.email, firstEmail), eq(user.email, secondEmail)));
  firstUserId = users.find((row) => row.email === firstEmail)?.id ?? "";
  secondUserId = users.find((row) => row.email === secondEmail)?.id ?? "";
});

afterAll(async () => {
  await db
    .delete(auditEvent)
    .where(or(eq(auditEvent.actorId, firstUserId), eq(auditEvent.actorId, secondUserId)));
  const credentialRows = await db
    .select({ id: apiCredential.id })
    .from(apiCredential)
    .where(eq(apiCredential.projectId, projectId));
  if (credentialRows.length > 0) {
    await db
      .delete(apiCredentialScope)
      .where(or(...credentialRows.map(({ id }) => eq(apiCredentialScope.credentialId, id))));
    await db
      .delete(apiCredential)
      .where(or(...credentialRows.map(({ id }) => eq(apiCredential.id, id))));
  }
  await db
    .delete(projectInvitation)
    .where(
      or(
        eq(projectInvitation.invitedByUserId, firstUserId),
        eq(projectInvitation.invitedByUserId, secondUserId),
      ),
    );
  await db
    .delete(projectCapability)
    .where(
      or(
        eq(projectCapability.changedByUserId, firstUserId),
        eq(projectCapability.changedByUserId, secondUserId),
      ),
    );
  await db
    .delete(environment)
    .where(
      or(
        eq(environment.createdByUserId, firstUserId),
        eq(environment.createdByUserId, secondUserId),
      ),
    );
  const membershipRows = await db
    .select({ id: projectMembership.id })
    .from(projectMembership)
    .where(
      or(eq(projectMembership.userId, firstUserId), eq(projectMembership.userId, secondUserId)),
    );
  if (membershipRows.length > 0) {
    await db
      .delete(projectMembershipLocaleAccess)
      .where(
        or(...membershipRows.map(({ id }) => eq(projectMembershipLocaleAccess.membershipId, id))),
      );
  }
  await db
    .delete(projectLocale)
    .where(
      or(
        eq(projectLocale.createdByUserId, firstUserId),
        eq(projectLocale.createdByUserId, secondUserId),
      ),
    );
  await db
    .delete(projectMembership)
    .where(
      or(eq(projectMembership.userId, firstUserId), eq(projectMembership.userId, secondUserId)),
    );
  await db
    .delete(project)
    .where(or(eq(project.createdByUserId, firstUserId), eq(project.createdByUserId, secondUserId)));
  await db
    .delete(workspaceMembership)
    .where(
      or(eq(workspaceMembership.userId, firstUserId), eq(workspaceMembership.userId, secondUserId)),
    );
  await db
    .delete(workspace)
    .where(
      or(eq(workspace.createdByUserId, firstUserId), eq(workspace.createdByUserId, secondUserId)),
    );
  await db.delete(user).where(or(eq(user.id, firstUserId), eq(user.id, secondUserId)));
  await disposeApplicationRuntime();
});

describe.sequential("platform API contracts", () => {
  it.each([
    ["platform/workspaces/create", { name: "Anonymous" }],
    ["platform/workspaces/list", { cursor: null, limit: 20 }],
    [
      "platform/projects/create",
      {
        workspaceId: "019fae8b-1234-7000-8000-000000000001",
        name: "Anonymous",
        key: "anonymous",
        description: null,
      },
    ],
    [
      "platform/projects/list",
      {
        workspaceId: "019fae8b-1234-7000-8000-000000000001",
        status: "active",
        cursor: null,
        limit: 20,
      },
    ],
    ["platform/projects/get", { projectId: "019fae8b-1234-7000-8000-000000000001" }],
    [
      "platform/projects/update",
      {
        projectId: "019fae8b-1234-7000-8000-000000000001",
        version: 1,
        name: "Anonymous",
        description: null,
      },
    ],
    [
      "platform/projects/archive",
      { projectId: "019fae8b-1234-7000-8000-000000000001", version: 1 },
    ],
    [
      "platform/projects/enableCapability",
      { projectId: "019fae8b-1234-7000-8000-000000000001", capability: "cms" },
    ],
    ["platform/projects/access", { projectId: "019fae8b-1234-7000-8000-000000000001" }],
    [
      "platform/projects/members/list",
      { projectId: "019fae8b-1234-7000-8000-000000000001", cursor: null, limit: 20 },
    ],
    [
      "platform/projects/members/updateRole",
      {
        membershipId: "019fae8b-1234-7000-8000-000000000001",
        version: 1,
        role: "editor",
      },
    ],
    [
      "platform/projects/members/updateLocaleAccess",
      {
        membershipId: "019fae8b-1234-7000-8000-000000000001",
        version: 1,
        access: { mode: "none" },
      },
    ],
    [
      "platform/projects/members/remove",
      { membershipId: "019fae8b-1234-7000-8000-000000000001", version: 1 },
    ],
    [
      "platform/projects/locales/list",
      {
        projectId: "019fae8b-1234-7000-8000-000000000001",
        view: "enabled",
        includeRemoved: false,
      },
    ],
    [
      "platform/projects/locales/create",
      {
        projectId: "019fae8b-1234-7000-8000-000000000001",
        tag: "hi",
        displayName: "Hindi",
      },
    ],
    [
      "platform/projects/locales/updateDisplayName",
      {
        localeId: "019fae8b-1234-7000-8000-000000000001",
        version: 1,
        displayName: "Hindi",
      },
    ],
    [
      "platform/projects/locales/reorder",
      {
        projectId: "019fae8b-1234-7000-8000-000000000001",
        locales: [{ localeId: "019fae8b-1234-7000-8000-000000000002", version: 1 }],
      },
    ],
    [
      "platform/projects/locales/updateStatus",
      {
        localeId: "019fae8b-1234-7000-8000-000000000001",
        version: 1,
        status: "disabled",
        confirmDraftImpact: false,
      },
    ],
    [
      "platform/projects/invitations/create",
      {
        projectId: "019fae8b-1234-7000-8000-000000000001",
        email: "anonymous@example.test",
        role: "editor",
      },
    ],
    [
      "platform/projects/invitations/list",
      { projectId: "019fae8b-1234-7000-8000-000000000001", cursor: null, limit: 20 },
    ],
    ["platform/projects/invitations/inspect", { token: "A".repeat(43) }],
    ["platform/projects/invitations/accept", { token: "A".repeat(43) }],
    [
      "platform/projects/invitations/revoke",
      { invitationId: "019fae8b-1234-7000-8000-000000000001", version: 1 },
    ],
    [
      "platform/projects/credentials/issue",
      {
        projectId: "019fae8b-1234-7000-8000-000000000001",
        environmentId: "019fae8b-1234-7000-8000-000000000002",
        family: "delivery",
        name: "Anonymous",
        scopes: ["delivery.read"],
        expiresAt: null,
      },
    ],
    [
      "platform/projects/credentials/list",
      {
        projectId: "019fae8b-1234-7000-8000-000000000001",
        environmentId: "019fae8b-1234-7000-8000-000000000002",
        cursor: null,
        limit: 20,
      },
    ],
    [
      "platform/projects/credentials/rotate",
      { credentialId: "019fae8b-1234-7000-8000-000000000001", version: 1 },
    ],
    [
      "platform/projects/credentials/revoke",
      { credentialId: "019fae8b-1234-7000-8000-000000000001", version: 1 },
    ],
  ])("rejects anonymous access to %s", async (path, input) => {
    const response = await rpc(request.agent(app), path, input);

    expect(response.status).toBe(401);
    expect(response.body.json.data).toMatchObject({
      ok: false,
      data: null,
      error: { code: "UNAUTHORIZED", requestId: response.headers["x-request-id"] },
    });
  });

  it("maps Effect Schema validation failures to the application envelope", async () => {
    const empty = await rpc(firstAgent, "platform/workspaces/create", { name: "   " });
    const oversized = await rpc(firstAgent, "platform/workspaces/create", {
      name: "x".repeat(101),
    });
    const unknownCapability = await rpc(firstAgent, "platform/projects/enableCapability", {
      projectId: "019fae8b-1234-7000-8000-000000000001",
      capability: "unknown",
    });
    const invalidCursor = await rpc(firstAgent, "platform/workspaces/list", {
      cursor: "bm90LWpzb24",
      limit: 20,
    });

    for (const response of [empty, oversized, unknownCapability, invalidCursor]) {
      expect(response.status).toBe(400);
      expect(response.body.json.data).toMatchObject({
        ok: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          requestId: response.headers["x-request-id"],
        },
      });
      expect(response.body.json.data.error.details.length).toBeGreaterThan(0);
    }
  });

  it("creates and lists isolated workspaces", async () => {
    const first = await rpc(firstAgent, "platform/workspaces/create", { name: "API Workspace A" });
    const second = await rpc(secondAgent, "platform/workspaces/create", {
      name: "API Workspace B",
    });
    firstWorkspaceId = first.body.json.data.id;
    secondWorkspaceId = second.body.json.data.id;

    const firstList = await rpc(firstAgent, "platform/workspaces/list", {
      cursor: null,
      limit: 20,
    });
    const secondList = await rpc(secondAgent, "platform/workspaces/list", {
      cursor: null,
      limit: 20,
    });

    expect(first.status).toBe(200);
    expect(first.body.json).toMatchObject({
      ok: true,
      error: null,
      message: "Workspace created.",
    });
    expect(firstList.body.json.data.items.map((item: { id: string }) => item.id)).toEqual([
      firstWorkspaceId,
    ]);
    expect(secondList.body.json.data.items.map((item: { id: string }) => item.id)).toEqual([
      secondWorkspaceId,
    ]);
  });

  it("creates a project and returns main plus disabled CMS state", async () => {
    const response = await rpc(firstAgent, "platform/projects/create", {
      workspaceId: firstWorkspaceId,
      name: "API Project",
      key: "api-project",
      description: "Managed through the API",
    });
    projectId = response.body.json.data.id;
    environmentId = response.body.json.data.environment.id;
    projectVersion = response.body.json.data.version;

    expect(response.status).toBe(200);
    expect(response.body.json.data).toMatchObject({
      workspaceId: firstWorkspaceId,
      key: "api-project",
      environment: { key: "main", name: "main", isPrimary: true },
      capabilities: [{ key: "cms", status: "disabled", version: null }],
    });
    const access = await rpc(firstAgent, "platform/projects/access", { projectId });
    expect(access.body.json.data.role).toBe("owner");
    expect(access.body.json.data.localeAccess).toEqual({ mode: "all" });
    expect(access.body.json.data.allowedActions).toContain("project.member.invite");
  });

  it("returns a typed same-workspace key conflict", async () => {
    const response = await rpc(firstAgent, "platform/projects/create", {
      workspaceId: firstWorkspaceId,
      name: "Duplicate API Project",
      key: "api-project",
      description: null,
    });

    expect(response.status).toBe(409);
    expect(response.body.json.data.error.code).toBe("PROJECT_KEY_CONFLICT");
  });

  it("does not reveal foreign workspaces or projects", async () => {
    const foreignList = await rpc(secondAgent, "platform/projects/list", {
      workspaceId: firstWorkspaceId,
      status: "active",
      cursor: null,
      limit: 20,
    });
    const foreignGet = await rpc(secondAgent, "platform/projects/get", { projectId });
    const nonexistent = await rpc(secondAgent, "platform/projects/get", {
      projectId: "019fae8b-1234-7000-8000-000000000099",
    });

    expect(foreignList.status).toBe(404);
    expect(foreignGet.status).toBe(404);
    expect(nonexistent.status).toBe(404);
    expect(foreignGet.body.json.data.message).toBe(nonexistent.body.json.data.message);
  });

  it("updates with optimistic concurrency and rejects a stale version", async () => {
    const updated = await rpc(firstAgent, "platform/projects/update", {
      projectId,
      version: projectVersion,
      name: "Updated API Project",
      description: null,
      key: "attempted-key-change",
      workspaceId: secondWorkspaceId,
    });
    projectVersion = updated.body.json.data.version;
    const stale = await rpc(firstAgent, "platform/projects/update", {
      projectId,
      version: 1,
      name: "Stale API Project",
      description: null,
    });

    expect(updated.status).toBe(200);
    expect(updated.body.json.data.name).toBe("Updated API Project");
    expect(updated.body.json.data.key).toBe("api-project");
    expect(updated.body.json.data.workspaceId).toBe(firstWorkspaceId);
    expect(stale.status).toBe(409);
    expect(stale.body.json.data.error.code).toBe("VERSION_CONFLICT");
  });

  it("enables CMS once and rejects repeated transition", async () => {
    const enabled = await rpc(firstAgent, "platform/projects/enableCapability", {
      projectId,
      capability: "cms",
    });
    const repeated = await rpc(firstAgent, "platform/projects/enableCapability", {
      projectId,
      capability: "cms",
    });

    expect(enabled.status).toBe(200);
    expect(enabled.body.json.data).toMatchObject({ key: "cms", status: "enabled" });
    expect(repeated.status).toBe(409);
    expect(repeated.body.json.data.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("manages canonical project locales with strict lifecycle and validation contracts", async () => {
    const initial = await rpc(firstAgent, "platform/projects/locales/list", {
      projectId,
      view: "settings",
      includeRemoved: true,
    });
    const english = initial.body.json.data.items[0];
    const hindi = await rpc(firstAgent, "platform/projects/locales/create", {
      projectId,
      tag: "HI",
      displayName: "Hindi",
    });
    const gujarati = await rpc(firstAgent, "platform/projects/locales/create", {
      projectId,
      tag: "gu",
      displayName: "Gujarati",
    });
    hindiLocaleId = hindi.body.json.data.id;
    const duplicate = await rpc(firstAgent, "platform/projects/locales/create", {
      projectId,
      tag: "hi",
      displayName: "Duplicate Hindi",
    });
    const missingLocale = await rpc(firstAgent, "platform/projects/locales/create", {
      projectId,
      displayName: "Missing tag",
    });
    const reordered = await rpc(firstAgent, "platform/projects/locales/reorder", {
      projectId,
      locales: [gujarati.body.json.data, hindi.body.json.data, english].map(
        (locale: { id: string; version: number }) => ({
          localeId: locale.id,
          version: locale.version,
        }),
      ),
    });
    const englishAfterReorder = reordered.body.json.data.items.find(
      (locale: { tag: string }) => locale.tag === "en",
    );
    const englishDenied = await rpc(firstAgent, "platform/projects/locales/updateStatus", {
      localeId: englishAfterReorder.id,
      version: englishAfterReorder.version,
      status: "disabled",
      confirmDraftImpact: true,
    });
    const hindiAfterReorder = reordered.body.json.data.items.find(
      (locale: { tag: string }) => locale.tag === "hi",
    );
    const disabled = await rpc(firstAgent, "platform/projects/locales/updateStatus", {
      localeId: hindiAfterReorder.id,
      version: hindiAfterReorder.version,
      status: "disabled",
      confirmDraftImpact: false,
    });
    const enabled = await rpc(firstAgent, "platform/projects/locales/updateStatus", {
      localeId: disabled.body.json.data.id,
      version: disabled.body.json.data.version,
      status: "enabled",
      confirmDraftImpact: false,
    });

    expect(initial.status).toBe(200);
    expect(initial.body.json.data.items).toHaveLength(1);
    expect(english).toMatchObject({ tag: "en", status: "enabled", position: 0 });
    expect(hindi.body.json.data).toMatchObject({ tag: "hi", displayName: "Hindi" });
    expect(gujarati.body.json.data).toMatchObject({ tag: "gu" });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.json.data.error.code).toBe("LOCALE_CONFLICT");
    expect(missingLocale.status).toBe(400);
    expect(missingLocale.body.json.data.error.code).toBe("VALIDATION_ERROR");
    expect(reordered.body.json.data.items.map((locale: { tag: string }) => locale.tag)).toEqual([
      "gu",
      "hi",
      "en",
    ]);
    expect(englishDenied.status).toBe(409);
    expect(englishDenied.body.json.data.error.code).toBe("INVALID_STATE_TRANSITION");
    expect(enabled.body.json.data.status).toBe("enabled");
  });

  it("invites and accepts a project member with role-aware API denial", async () => {
    const issued = await rpc(firstAgent, "platform/projects/invitations/create", {
      projectId,
      email: secondEmail,
      role: "editor",
    });
    const token = issued.body.json.data.token;
    const invitationId = issued.body.json.data.invitation.id;
    const invitationVersion = issued.body.json.data.invitation.version;
    const listed = await rpc(firstAgent, "platform/projects/invitations/list", {
      projectId,
      cursor: null,
      limit: 20,
    });
    const inspected = await rpc(secondAgent, "platform/projects/invitations/inspect", { token });
    const accepted = await rpc(secondAgent, "platform/projects/invitations/accept", { token });
    const reused = await rpc(secondAgent, "platform/projects/invitations/accept", { token });
    const memberId = accepted.body.json.data.id;

    expect(issued.status).toBe(200);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(listed.body.json.data.items[0]).not.toHaveProperty("token");
    expect(inspected.body.json.data).toMatchObject({ projectId, role: "editor" });
    expect(accepted.body.json.data).toMatchObject({
      projectId,
      role: "editor",
      localeAccess: { mode: "all" },
    });
    expect(reused.status).toBe(404);
    expect(reused.body.json.data.error.code).toBe("INVITATION_INVALID");

    const memberRead = await rpc(secondAgent, "platform/projects/get", { projectId });
    const memberUpdate = await rpc(secondAgent, "platform/projects/update", {
      projectId,
      version: projectVersion,
      name: "Unauthorized member update",
      description: null,
    });
    const memberListDenied = await rpc(secondAgent, "platform/projects/members/list", {
      projectId,
      cursor: null,
      limit: 20,
    });
    const ownerList = await rpc(firstAgent, "platform/projects/members/list", {
      projectId,
      cursor: null,
      limit: 20,
    });

    expect(memberRead.status).toBe(200);
    expect(memberUpdate.status).toBe(403);
    expect(memberUpdate.body.json.data.error.code).toBe("FORBIDDEN");
    expect(memberListDenied.status).toBe(403);
    expect(ownerList.body.json.data.items.map((item: { id: string }) => item.id)).toContain(
      memberId,
    );

    const scopedMember = await rpc(firstAgent, "platform/projects/members/updateLocaleAccess", {
      membershipId: memberId,
      version: accepted.body.json.data.version,
      access: { mode: "selected", localeIds: [hindiLocaleId] },
    });
    const selectedLocales = await rpc(secondAgent, "platform/projects/locales/list", {
      projectId,
      view: "enabled",
      includeRemoved: false,
    });
    expect(scopedMember.status).toBe(200);
    expect(scopedMember.body.json.data.localeAccess).toEqual({
      mode: "selected",
      localeIds: [hindiLocaleId],
    });
    expect(selectedLocales.body.json.data.items.map((locale: { id: string }) => locale.id)).toEqual(
      [hindiLocaleId],
    );

    const removed = await rpc(firstAgent, "platform/projects/members/remove", {
      membershipId: memberId,
      version: scopedMember.body.json.data.version,
    });
    const accessAfterRemoval = await rpc(secondAgent, "platform/projects/get", { projectId });
    expect(removed.status).toBe(200);
    expect(removed.body.json.data.removedAt).toBeTypeOf("string");
    expect(accessAfterRemoval.status).toBe(404);

    const staleRevoke = await rpc(firstAgent, "platform/projects/invitations/revoke", {
      invitationId,
      version: invitationVersion,
    });
    expect(staleRevoke.status).toBe(409);
    expect(staleRevoke.body.json.data.error.code).toBe("VERSION_CONFLICT");
  });

  it("issues, lists, rotates, and revokes environment-bound credentials", async () => {
    const issued = await rpc(firstAgent, "platform/projects/credentials/issue", {
      projectId,
      environmentId,
      family: "delivery",
      name: "API delivery key",
      scopes: ["delivery.read"],
      expiresAt: null,
    });
    const key = issued.body.json.data.key;
    const credential = issued.body.json.data.credential;
    const listed = await rpc(firstAgent, "platform/projects/credentials/list", {
      projectId,
      environmentId,
      cursor: null,
      limit: 20,
    });
    const rotated = await rpc(firstAgent, "platform/projects/credentials/rotate", {
      credentialId: credential.id,
      version: credential.version,
    });
    const revoked = await rpc(firstAgent, "platform/projects/credentials/revoke", {
      credentialId: rotated.body.json.data.credential.id,
      version: rotated.body.json.data.credential.version,
    });

    expect(issued.status).toBe(200);
    expect(key).toMatch(/^ffd_del_[0-9a-f-]{36}_[A-Za-z0-9_-]{43}$/u);
    expect(listed.body.json.data.items[0]).not.toHaveProperty("key");
    expect(listed.body.json.data.items[0]).not.toHaveProperty("keyDigest");
    expect(rotated.status).toBe(200);
    expect(rotated.body.json.data.key).not.toBe(key);
    expect(revoked.status).toBe(200);
    expect(revoked.body.json.data.revokedAt).toBeTypeOf("string");
    expect(JSON.stringify(revoked.body)).not.toContain(key);
  });

  it("archives into the archived cursor list and blocks future mutations", async () => {
    const archived = await rpc(firstAgent, "platform/projects/archive", {
      projectId,
      version: projectVersion,
    });
    projectVersion = archived.body.json.data.version;
    const archivedList = await rpc(firstAgent, "platform/projects/list", {
      workspaceId: firstWorkspaceId,
      status: "archived",
      cursor: null,
      limit: 1,
    });
    const editArchived = await rpc(firstAgent, "platform/projects/update", {
      projectId,
      version: projectVersion,
      name: "Cannot Edit",
      description: null,
    });

    expect(archived.status).toBe(200);
    expect(archived.body.json.data.archivedAt).toBeTypeOf("string");
    expect(archivedList.body.json.data.items[0].id).toBe(projectId);
    expect(editArchived.status).toBe(409);
    expect(editArchived.body.json.data.error.code).toBe("INVALID_STATE_TRANSITION");
  });
});
