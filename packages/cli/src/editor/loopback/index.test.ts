import { request as requestHttp } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import type { EditorStudioArtifact } from "../assets";
import type { EditorProxyMetric } from "../telemetry";
import {
  startEditorLoopback,
  type EditorLoopbackServer,
  type EditorLoopbackStatus,
  type EditorUpstreamRequest,
  type EditorUpstreamResponse,
} from "./index";

const challenge = "c".repeat(43);
const sessionToken = "s".repeat(43);
const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const entryId = "019fae8b-1234-7000-8000-000000000004";
const upstreamToken = "hosted-secret-token";
const artifact: EditorStudioArtifact = {
  entryScript: "/assets/studio.js",
  stylesheets: ["/assets/studio.css"],
  files: new Map([
    [
      "/assets/studio.js",
      { contentType: "text/javascript; charset=utf-8", body: Buffer.from("1") },
    ],
    ["/assets/studio.css", { contentType: "text/css; charset=utf-8", body: Buffer.from("a{}") }],
  ]),
};
const bootstrapData = {
  formatVersion: 1,
  host: { kind: "local_editor", previewUrl: null },
  project: { id: projectId, name: "Website", workspaceId: "019fae8b-1234-7000-8000-000000000009" },
  environment: { id: environmentId, key: "main", name: "main" },
  user: { id: "editor-user", name: "Editor User", email: "editor@example.test" },
  role: "editor",
  effectiveActions: ["project.read"],
  session: { expiresAt: "2026-11-24T12:00:00.000Z" },
};
const contextData = {
  locales: [
    {
      id: "019fae8b-1234-7000-8000-000000000005",
      tag: "en",
      displayName: "English",
      canRead: true,
      canWrite: true,
      canPublish: false,
    },
  ],
  collections: [],
  configurationNotices: [],
};
const servers: Array<EditorLoopbackServer> = [];

function json(status: number, body: unknown): EditorUpstreamResponse {
  return {
    status,
    contentType: "application/json; charset=utf-8",
    retryAfter: null,
    text: JSON.stringify(body),
  };
}

function success(data: unknown) {
  return json(200, { ok: true, data, error: null, message: "Loaded." });
}

async function start(
  options: {
    readonly status?: EditorLoopbackStatus;
    readonly previewUrl?: string | null;
    readonly upstream?: (request: EditorUpstreamRequest) => EditorUpstreamResponse;
  } = {},
) {
  const requests: Array<EditorUpstreamRequest> = [];
  const metrics: Array<EditorProxyMetric> = [];
  const server = await startEditorLoopback({
    challenge,
    projectId,
    environmentId,
    previewUrl: options.previewUrl ?? null,
    artifact,
    status: () => options.status ?? { schema: "matches", diagnosticCode: null },
    upstream: async (request) => {
      requests.push(request);
      if (options.upstream !== undefined) return options.upstream(request);
      if (request.path.endsWith("/bootstrap")) return success(bootstrapData);
      if (request.path.endsWith("/context")) return success(contextData);
      return json(404, { ok: false });
    },
    randomToken: () => sessionToken,
    observeOperation: (event) => metrics.push(event),
  });
  servers.push(server);
  return { server, requests, metrics };
}

async function signIn(origin: string) {
  const response = await fetch(`${origin}/studio/api/session`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Ffd-Editor-Challenge": challenge,
    },
    body: "{}",
  });
  return response;
}

const cookie = { Cookie: `ffd_editor_session=${sessionToken}` };

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("local editor Studio loopback", () => {
  it("serves the local Studio shell without any credential or dashboard origin", async () => {
    const { server } = await start();
    for (const path of [
      "/studio",
      "/studio/content",
      `/studio/content/${collectionId}/locales/en`,
    ]) {
      const response = await fetch(`${server.origin}${path}`);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain('<meta name="ffd-studio-host" content="local_editor">');
      expect(html).not.toContain("ffd-studio-dashboard-origin");
      expect(html).not.toContain(challenge);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-security-policy")).toContain("frame-src 'none'");
    }
    const asset = await fetch(`${server.origin}/studio/assets/studio.js`);
    expect(await asset.text()).toBe("1");
    const session = await fetch(`${server.origin}/studio/session`);
    expect(await session.text()).not.toContain(challenge);
  });

  it("exchanges the one-time challenge for an HttpOnly same-site session", async () => {
    const { server } = await start();
    const missingOrigin = await fetch(`${server.origin}/studio/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ffd-Editor-Challenge": challenge },
      body: "{}",
    });
    expect(missingOrigin.status).toBe(403);
    const response = await signIn(server.origin);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe(
      `ffd_editor_session=${sessionToken}; Path=/studio; HttpOnly; SameSite=Strict`,
    );
    const replay = await signIn(server.origin);
    expect(replay.status).toBe(401);
  });

  it("requires the session cookie and same-origin fetch metadata on every API route", async () => {
    const { server, requests } = await start();
    const anonymous = await fetch(`${server.origin}/studio/api/bootstrap`);
    expect(anonymous.status).toBe(401);
    expect((await anonymous.json()).error.code).toBe("STUDIO_SESSION_INVALID");
    await signIn(server.origin);
    const crossSite = await fetch(`${server.origin}/studio/api/bootstrap`, {
      headers: { ...cookie, "Sec-Fetch-Site": "same-site" },
    });
    expect(crossSite.status).toBe(403);
    const forged = await fetch(`${server.origin}/studio/api/bootstrap`, {
      headers: { Cookie: `ffd_editor_session=${"x".repeat(43)}` },
    });
    expect(forged.status).toBe(401);
    expect(requests).toEqual([]);
  });

  it("maps the platform bootstrap to the local browser host and keeps the token in Node", async () => {
    const { server, requests, metrics } = await start();
    await signIn(server.origin);
    const response = await fetch(`${server.origin}/studio/api/bootstrap`, { headers: cookie });
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text).data.host).toEqual({ kind: "local_editor" });
    expect(text).not.toContain(upstreamToken);
    expect(requests[0]?.path).toBe(
      `/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`,
    );
    expect(metrics.map((metric) => metric.operation)).toEqual(["bootstrap"]);
  });

  it("maps an expired CLI login to a local sign-in instruction", async () => {
    const { server } = await start({ upstream: () => json(401, { ok: false }) });
    await signIn(server.origin);
    const response = await fetch(`${server.origin}/studio/api/bootstrap`, { headers: cookie });
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("STUDIO_AUTH_REQUIRED");
  });

  it("forwards allowlisted Studio Content routes and validates the upstream envelope", async () => {
    const { server, requests } = await start();
    await signIn(server.origin);
    const context = await fetch(`${server.origin}/studio/api/content/context`, { headers: cookie });
    expect(context.status).toBe(200);
    expect((await context.json()).data).toEqual(contextData);
    expect(requests.at(-1)).toEqual(
      expect.objectContaining({
        path: `/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/context`,
        method: "GET",
      }),
    );
    const unknown = await fetch(`${server.origin}/studio/api/content/settings`, {
      headers: cookie,
    });
    expect(unknown.status).toBe(404);
  });

  it("rejects an invalid upstream envelope", async () => {
    const { server } = await start({ upstream: () => success({ accessToken: upstreamToken }) });
    await signIn(server.origin);
    const response = await fetch(`${server.origin}/studio/api/content/context`, {
      headers: cookie,
    });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(upstreamToken);
  });

  it("pauses content writes while the local schema differs and reports the drift state", async () => {
    const { server, requests } = await start({
      status: { schema: "differs", diagnosticCode: null },
    });
    await signIn(server.origin);
    const status = await fetch(`${server.origin}/studio/api/editor/status`, { headers: cookie });
    expect((await status.json()).data).toEqual({ schema: "differs", diagnosticCode: null });
    const body = JSON.stringify({
      commandId: "019fae8b-1234-7000-8000-000000000006",
      schemaRevisionId: "019fae8b-1234-7000-8000-000000000007",
      contractHash: "a".repeat(64),
      expectedSharedVersion: 1,
      expectedLocalizedVersion: 1,
      sharedMutations: [],
      localizedMutations: [],
    });
    const path = `/studio/api/content/collections/${collectionId}/locales/en/entries/${entryId}/draft`;
    const withoutOrigin = await fetch(`${server.origin}${path}`, {
      method: "PATCH",
      headers: { ...cookie, "Content-Type": "application/json" },
      body,
    });
    expect(withoutOrigin.status).toBe(403);
    const drift = await fetch(`${server.origin}${path}`, {
      method: "PATCH",
      headers: { ...cookie, Origin: server.origin, "Content-Type": "application/json" },
      body,
    });
    expect(drift.status).toBe(409);
    expect((await drift.json()).error.code).toBe("STUDIO_SCHEMA_DRIFT");
    expect(requests).toEqual([]);
  });

  it("rejects host confusion, encoded paths, and unknown routes", async () => {
    const { server } = await start();
    const port = new URL(server.origin).port;
    const raw = (path: string, host: string) =>
      new Promise<number>((resolve, reject) => {
        const outbound = requestHttp(
          { hostname: "127.0.0.1", port, path, headers: { Host: host } },
          (incoming) => {
            incoming.resume();
            resolve(incoming.statusCode ?? 0);
          },
        );
        outbound.on("error", reject);
        outbound.end();
      });
    expect(await raw("/studio", `localhost:${port}`)).toBe(400);
    expect(await raw("/studio/%2e%2e/secret", `127.0.0.1:${port}`)).toBe(400);
    expect(await raw("/studio/../secret", `127.0.0.1:${port}`)).toBe(400);
    expect((await fetch(`${server.origin}/other`)).status).toBe(404);
  });

  it("launches Preview only inside a same-origin iframe with a configured Preview URL", async () => {
    const off = await start();
    await signIn(off.server.origin);
    const query = `collection=${collectionId}&locale=en&entry=${entryId}`;
    const disabled = await fetch(`${off.server.origin}/studio/preview/launch?${query}`, {
      headers: { ...cookie, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "iframe" },
    });
    expect(disabled.status).toBe(404);

    const previewUrl = "https://www.example.test/api/ffd-preview";
    const token = `ffd_pvh_${"a".repeat(20)}.${"b".repeat(43)}`;
    const on = await start({
      previewUrl,
      upstream: (request) =>
        request.path.endsWith("/preview-handoffs")
          ? success({ token, previewUrl })
          : json(404, { ok: false }),
    });
    await signIn(on.server.origin);
    const shell = await fetch(`${on.server.origin}/studio`);
    expect(shell.headers.get("content-security-policy")).toContain(
      "frame-src 'self' https://www.example.test",
    );
    const topLevel = await fetch(`${on.server.origin}/studio/preview/launch?${query}`, {
      headers: { ...cookie, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "document" },
    });
    expect(topLevel.status).toBe(403);
    const launch = await fetch(`${on.server.origin}/studio/preview/launch?${query}`, {
      headers: { ...cookie, "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Dest": "iframe" },
    });
    const html = await launch.text();
    expect(launch.status).toBe(200);
    expect(html).toContain(`action="${previewUrl}"`);
    expect(launch.headers.get("content-security-policy")).toContain(
      "form-action https://www.example.test",
    );
    expect(launch.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(on.requests.at(-1)).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ source: "current", revisionId: null }),
      }),
    );
  });
});
