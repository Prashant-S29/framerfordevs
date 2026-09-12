import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

import {
  ControlPlaneHttpError,
  ControlPlaneResponseTooLargeError,
  ControlPlaneTransportError,
} from "../errors";
import { makeControlPlaneHttpClient } from "./index";

const workspace = {
  id: "019fae8b-1234-7000-8000-000000000001",
  name: "Workspace",
  version: 1,
  role: "owner",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const capability = {
  id: "019fae8b-1234-7000-8000-000000000004",
  key: "cms",
  status: "enabled",
  version: 1,
  changedAt: "2026-08-14T00:00:00.000Z",
};
const project = {
  id: "019fae8b-1234-7000-8000-000000000002",
  workspaceId: workspace.id,
  name: "Project",
  key: "project",
  description: null,
  version: 1,
  status: "active",
  archivedAt: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  primaryEnvironment: {
    id: "019fae8b-1234-7000-8000-000000000003",
    key: "main",
    name: "main",
    isPrimary: true,
    createdAt: "2026-08-14T00:00:00.000Z",
  },
  capabilities: [capability],
  effectiveActions: ["project.read", "project.update"],
};
const registration = {
  id: "019fae8b-1234-7000-8000-000000000005",
  projectId: project.id,
  environmentId: project.primaryEnvironment.id,
  applicationOrigin: "https://studio.example.test",
  mountPath: "/studio",
  version: 1,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

function success(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Success." }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function failure() {
  return new Response(
    JSON.stringify({
      ok: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Forbidden.",
        retryable: false,
        requestId: "request-control-plane-test",
      },
      message: "Forbidden.",
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

describe("Control Plane HTTP client", () => {
  it.effect("performs one bounded redirect-free list request", () =>
    Effect.gen(function* () {
      const calls: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
      const client = makeControlPlaneHttpClient({
        baseUrl: "https://api.example.test",
        token: "oauth-token",
        fetch: (input, init) => {
          calls.push({ url: String(input), init });
          return Promise.resolve(success({ items: [workspace], nextCursor: "next_cursor" }));
        },
      });

      const page = yield* client.listWorkspaces(null, 20);
      assert.strictEqual(page.items[0]?.id, workspace.id);
      assert.strictEqual(page.nextCursor, "next_cursor");
      assert.strictEqual(
        calls[0]?.url,
        "https://api.example.test/api/control-plane/v1/workspaces?limit=20",
      );
      assert.strictEqual(calls[0]?.init?.method, "GET");
      assert.strictEqual(calls[0]?.init?.redirect, "error");
      assert.isUndefined(calls[0]?.init?.body);
    }),
  );

  it.effect("sends exact JSON mutation bodies without hidden retries", () =>
    Effect.gen(function* () {
      const calls: Array<RequestInit | undefined> = [];
      const client = makeControlPlaneHttpClient({
        baseUrl: "https://api.example.test",
        token: "oauth-token",
        fetch: (_input, init) => {
          calls.push(init);
          return Promise.resolve(success({ workspace, replayed: false }));
        },
      });
      const body = {
        commandId: "019fae8b-1234-7000-8000-000000000002",
        name: "Workspace",
      };

      const result = yield* client.createWorkspace(body);
      assert.isFalse(result.replayed);
      assert.lengthOf(calls, 1);
      assert.strictEqual(calls[0]?.method, "POST");
      assert.strictEqual(calls[0]?.body, JSON.stringify(body));
      assert.strictEqual(new Headers(calls[0]?.headers).get("content-type"), "application/json");
      assert.strictEqual(new Headers(calls[0]?.headers).get("authorization"), "Bearer oauth-token");
    }),
  );

  it.effect("owns exact methods and paths for all thirteen operations", () =>
    Effect.gen(function* () {
      const calls: Array<{ readonly url: string; readonly method: string | undefined }> = [];
      const responses = [
        { items: [workspace], nextCursor: null },
        { workspace, replayed: false },
        workspace,
        { items: [project], nextCursor: null },
        { project, replayed: false },
        project,
        project,
        project,
        project,
        { items: [capability] },
        { capability, replayed: false },
        registration,
        { registration, created: false, replayed: false, noOp: true },
      ];
      const client = makeControlPlaneHttpClient({
        baseUrl: "https://api.example.test",
        token: "oauth-token",
        fetch: (input, init) => {
          calls.push({ url: String(input), method: init?.method });
          return Promise.resolve(success(responses[calls.length - 1]));
        },
      });
      const commandId = "019fae8b-1234-7000-8000-000000000010";

      yield* client.listWorkspaces(null, 20);
      yield* client.createWorkspace({ commandId, name: "Workspace" });
      yield* client.getWorkspace(workspace.id);
      yield* client.listProjects(workspace.id, "active", null, 20);
      yield* client.createProject(workspace.id, {
        commandId,
        name: "Project",
        key: "project",
        description: null,
        initialCapabilities: ["cms"],
      });
      yield* client.getProject(project.id);
      yield* client.updateProject(project.id, {
        expectedVersion: 1,
        name: "Project",
        description: null,
      });
      yield* client.archiveProject(project.id, { expectedVersion: 1 });
      yield* client.restoreProject(project.id, { expectedVersion: 2 });
      yield* client.listCapabilities(project.id);
      yield* client.enableCmsCapability(project.id, { commandId });
      yield* client.getStudioRegistration(project.id, project.primaryEnvironment.id);
      yield* client.putStudioRegistration(project.id, project.primaryEnvironment.id, {
        commandId,
        expectedVersion: 1,
        applicationOrigin: registration.applicationOrigin,
        mountPath: registration.mountPath,
      });

      assert.deepEqual(
        calls.map((call) => call.method),
        [
          "GET",
          "POST",
          "GET",
          "GET",
          "POST",
          "GET",
          "PATCH",
          "POST",
          "POST",
          "GET",
          "PUT",
          "GET",
          "PUT",
        ],
      );
      assert.strictEqual(calls.length, 13);
      assert.include(calls[3]?.url ?? "", `/workspaces/${workspace.id}/projects?status=active`);
      assert.include(
        calls[12]?.url ?? "",
        `/projects/${project.id}/environments/${project.primaryEnvironment.id}/studio-registration`,
      );
    }),
  );

  it.effect("returns only closed HTTP failure metadata", () =>
    Effect.gen(function* () {
      const client = makeControlPlaneHttpClient({
        baseUrl: "https://api.example.test",
        token: "oauth-token",
        fetch: () => Promise.resolve(failure()),
      });
      const error = yield* Effect.flip(client.getWorkspace(workspace.id));
      assert.instanceOf(error, ControlPlaneHttpError);
      if (error instanceof ControlPlaneHttpError) {
        assert.strictEqual(error.status, 403);
        assert.strictEqual(error.code, "FORBIDDEN");
        assert.isFalse(error.retryable);
      }
    }),
  );

  it.effect("rejects oversized and malformed responses", () =>
    Effect.gen(function* () {
      const oversized = makeControlPlaneHttpClient({
        baseUrl: "https://api.example.test",
        token: "oauth-token",
        fetch: () =>
          Promise.resolve(
            new Response("{}", {
              headers: { "content-length": String(512 * 1_024 + 1) },
            }),
          ),
      });
      assert.instanceOf(
        yield* Effect.flip(oversized.getWorkspace(workspace.id)),
        ControlPlaneResponseTooLargeError,
      );

      const malformed = makeControlPlaneHttpClient({
        baseUrl: "https://api.example.test",
        token: "oauth-token",
        fetch: () => Promise.resolve(success({ ...workspace, secret: "must-not-pass" })),
      });
      assert.instanceOf(
        yield* Effect.flip(malformed.getWorkspace(workspace.id)),
        ControlPlaneTransportError,
      );
    }),
  );
});
