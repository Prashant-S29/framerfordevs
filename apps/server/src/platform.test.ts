import { randomUUID } from "node:crypto";

import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import { db } from "@framerfordevs/db";
import { eq, or } from "@framerfordevs/db/query";
import { user } from "@framerfordevs/db/schema/auth";
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
    projectVersion = response.body.json.data.version;

    expect(response.status).toBe(200);
    expect(response.body.json.data).toMatchObject({
      workspaceId: firstWorkspaceId,
      key: "api-project",
      environment: { key: "main", name: "main", isPrimary: true },
      capabilities: [{ key: "cms", status: "disabled", version: null }],
    });
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
