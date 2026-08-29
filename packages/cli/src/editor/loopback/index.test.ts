import { request as httpRequest } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { isCanonicalLoopbackPeer, startEditorLoopback, type EditorLoopbackServer } from "./index";

const challenge = "a".repeat(43);
const assets = {
  html: '<!doctype html><main id="editor-root">Starting local editor…</main>',
  files: new Map([
    [
      "/assets/editor.js",
      {
        contentType: "text/javascript; charset=utf-8",
        body: new TextEncoder().encode("export {}"),
      },
    ],
    [
      "/assets/editor.css",
      { contentType: "text/css; charset=utf-8", body: new TextEncoder().encode("body{}") },
    ],
  ]),
};
let active: EditorLoopbackServer | null = null;

async function start(
  operation?: Parameters<typeof startEditorLoopback>[0]["operation"],
  schemaMatchesHosted = false,
  observeOperation?: Parameters<typeof startEditorLoopback>[0]["observeOperation"],
) {
  active = await startEditorLoopback({
    challenge,
    assets,
    status: () => ({
      projectId: "project-id",
      environment: "main",
      schemaMatchesHosted,
      schemaValid: true,
      schemaGeneration: 0,
      schemaDiagnosticCode: null,
      localCollectionCount: 2,
      locales: ["en", "hi"],
      collections: [{ sourceKey: "posts", apiKey: "posts" }],
    }),
    ...(operation === undefined ? {} : { operation }),
    ...(observeOperation === undefined ? {} : { observeOperation }),
  });
  return active;
}

afterEach(async () => {
  await active?.close();
  active = null;
});

async function rawRequest(input: {
  readonly origin: string;
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}) {
  const url = new URL(input.origin);
  return new Promise<{ readonly status: number; readonly body: string }>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: input.path,
        method: input.method,
        headers: input.headers,
      },
      (response) => {
        const chunks: Array<Buffer> = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.once("error", reject);
    request.end(input.body);
  });
}

describe("editor loopback boundary", () => {
  it("binds canonical IPv4 loopback and serves secret-free CSP-locked assets", async () => {
    const server = await start();
    const page = await fetch(server.origin, { redirect: "error" });
    const script = await fetch(`${server.origin}/assets/editor.js`, { redirect: "error" });
    const css = await fetch(`${server.origin}/assets/editor.css`, { redirect: "error" });

    expect(new URL(server.origin).hostname).toBe("127.0.0.1");
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(page.headers.get("x-content-type-options")).toBe("nosniff");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await page.text()).not.toContain(challenge);
    expect(await script.text()).not.toContain(challenge);
    expect(await css.text()).not.toContain(challenge);
  });

  it("exchanges only the exact same-origin in-memory challenge and returns safe status", async () => {
    const server = await start();
    const session = await fetch(`${server.origin}/api/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: server.origin,
        "X-FFD-Editor-Session": challenge,
      },
      body: "{}",
      redirect: "error",
    });
    const status = await fetch(`${server.origin}/api/status`, {
      headers: { "X-FFD-Editor-Session": challenge },
      redirect: "error",
    });

    expect(session.status).toBe(200);
    expect(await session.json()).toEqual({ ok: true });
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({
      projectId: "project-id",
      environment: "main",
      schemaMatchesHosted: false,
      schemaValid: true,
      schemaGeneration: 0,
      schemaDiagnosticCode: null,
      localCollectionCount: 2,
      locales: ["en", "hi"],
      collections: [{ sourceKey: "posts", apiKey: "posts" }],
    });
  });

  it.each([
    ["missing session", "/api/status", {}, 401],
    ["wrong session", "/api/status", { "X-FFD-Editor-Session": "b".repeat(43) }, 401],
    ["query", "/api/status?token=value", { "X-FFD-Editor-Session": challenge }, 400],
    ["unknown route", "/api/proxy", { "X-FFD-Editor-Session": challenge }, 404],
  ])("rejects %s authority", async (_name, path, headers, expected) => {
    const server = await start();
    const response = await fetch(`${server.origin}${path}`, { headers, redirect: "error" });
    expect(response.status).toBe(expected);
    expect(await response.text()).not.toContain(challenge);
  });

  it("rejects wrong Origin, method, content type, malformed body, and early body overflow", async () => {
    const server = await start();
    const baseHeaders = { "X-FFD-Editor-Session": challenge };
    const responses = await Promise.all([
      fetch(`${server.origin}/api/session`, {
        method: "POST",
        headers: {
          ...baseHeaders,
          Origin: "http://localhost:1",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      fetch(`${server.origin}/api/session`, {
        method: "POST",
        headers: { ...baseHeaders, Origin: server.origin, "Content-Type": "text/plain" },
        body: "{}",
      }),
      fetch(`${server.origin}/api/session`, {
        method: "POST",
        headers: {
          ...baseHeaders,
          Origin: server.origin,
          "Content-Type": "application/json",
        },
        body: '{"extra":true}',
      }),
      fetch(`${server.origin}/api/status`, { method: "POST", headers: baseHeaders }),
    ]);
    const overflow = await rawRequest({
      origin: server.origin,
      path: "/api/session",
      method: "POST",
      headers: {
        ...baseHeaders,
        Origin: server.origin,
        "Content-Type": "application/json",
        "Content-Length": String(1_048_577),
      },
      body: "{}",
    });
    expect(responses.map(({ status }) => status)).toEqual([403, 403, 400, 404]);
    expect(overflow.status).toBe(413);
  });

  it("decodes only closed operations and blocks mutations while structure drifts", async () => {
    const received: Array<unknown> = [];
    const server = await start(async (operation) => {
      received.push(operation);
      return { status: 200, body: { ok: true, operation: operation.operation } };
    });
    const headers = {
      Origin: server.origin,
      "Content-Type": "application/json",
      "X-FFD-Editor-Session": challenge,
    };
    const read = await fetch(`${server.origin}/api/operation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ operation: "form.get", collectionKey: "posts" }),
    });
    const mutation = await fetch(`${server.origin}/api/operation`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        operation: "entry.rename",
        collectionKey: "posts",
        locale: "en-US",
        entryId: "019fae8b-1234-7000-8000-000000000003",
        displayName: "Renamed",
        expectedNameVersion: 1,
      }),
    });
    const arbitrary = await fetch(`${server.origin}/api/operation`, {
      method: "POST",
      headers,
      body: JSON.stringify({ operation: "proxy", url: "https://evil.test", token: "secret" }),
    });

    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({ ok: true, operation: "form.get" });
    expect(mutation.status).toBe(409);
    expect(await mutation.json()).toEqual({ ok: false, code: "EDITOR_SCHEMA_DRIFT" });
    expect(arbitrary.status).toBe(400);
    expect(await arbitrary.text()).not.toContain("secret");
    expect(received).toEqual([{ operation: "form.get", collectionKey: "posts" }]);
  });

  it("allows a decoded mutation only while local and hosted structure match", async () => {
    const operation = vi.fn(async () => ({ status: 202, body: { ok: true } }));
    const observations: Array<unknown> = [];
    const server = await start(operation, true, (event) => observations.push(event));
    const response = await fetch(`${server.origin}/api/operation`, {
      method: "POST",
      headers: {
        Origin: server.origin,
        "Content-Type": "application/json",
        "X-FFD-Editor-Session": challenge,
      },
      body: JSON.stringify({
        operation: "entry.rename",
        collectionKey: "posts",
        locale: "en-US",
        entryId: "019fae8b-1234-7000-8000-000000000003",
        displayName: "Renamed",
        expectedNameVersion: 1,
      }),
    });
    expect(response.status).toBe(202);
    expect(operation).toHaveBeenCalledOnce();
    expect(observations).toEqual([
      {
        operation: "entry.rename",
        mutation: true,
        outcome: "success",
        statusFamily: "2xx",
        requestSizeBucket: "small",
        durationMs: expect.any(Number),
      },
    ]);
    expect(JSON.stringify(observations)).not.toContain("Renamed");
    expect(JSON.stringify(observations)).not.toContain("posts");
  });

  it("keeps representative loopback status and operation interactions inside measured budgets", async () => {
    const server = await start(async () => ({ status: 200, body: { ok: true } }), true);
    const statusDurations: Array<number> = [];
    const operationDurations: Array<number> = [];
    for (let index = 0; index < 20; index += 1) {
      const statusStartedAt = performance.now();
      const status = await fetch(`${server.origin}/api/status`, {
        headers: { "X-FFD-Editor-Session": challenge },
        redirect: "error",
      });
      statusDurations.push(performance.now() - statusStartedAt);
      expect(status.status).toBe(200);
      expect(Buffer.byteLength(await status.text(), "utf8")).toBeLessThanOrEqual(1_048_576);

      const operationStartedAt = performance.now();
      const operation = await fetch(`${server.origin}/api/operation`, {
        method: "POST",
        headers: {
          Origin: server.origin,
          "Content-Type": "application/json",
          "X-FFD-Editor-Session": challenge,
        },
        body: JSON.stringify({ operation: "form.get", collectionKey: "posts" }),
        redirect: "error",
      });
      operationDurations.push(performance.now() - operationStartedAt);
      expect(operation.status).toBe(200);
      expect(Buffer.byteLength(await operation.text(), "utf8")).toBeLessThanOrEqual(1_048_576);
    }
    const percentile95 = (durations: ReadonlyArray<number>) =>
      [...durations].sort((left, right) => left - right)[Math.ceil(durations.length * 0.95) - 1];
    const statusP95 = percentile95(statusDurations);
    const operationP95 = percentile95(operationDurations);
    expect(statusP95).toBeDefined();
    expect(operationP95).toBeDefined();
    expect(statusP95).toBeLessThan(100);
    expect(operationP95).toBeLessThan(100);
    console.info(
      `Editor loopback baseline: ${statusDurations.length} status reads p95 ${statusP95?.toFixed(2)} ms; ${operationDurations.length} operations p95 ${operationP95?.toFixed(2)} ms`,
    );
  });

  it("keeps telemetry failures from changing proxy behavior", async () => {
    const server = await start(
      async () => ({ status: 200, body: { ok: true } }),
      true,
      () => {
        throw new Error("telemetry unavailable");
      },
    );
    const response = await fetch(`${server.origin}/api/operation`, {
      method: "POST",
      headers: {
        Origin: server.origin,
        "Content-Type": "application/json",
        "X-FFD-Editor-Session": challenge,
      },
      body: JSON.stringify({ operation: "form.get", collectionKey: "posts" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("rejects encoded traversal before static asset resolution", async () => {
    const server = await start();
    const result = await rawRequest({
      origin: server.origin,
      path: "/assets/%2e%2e/",
      method: "GET",
      headers: { Host: new URL(server.origin).host },
    });
    expect(result.status).toBe(400);
  });

  it("rejects Host confusion before session processing", async () => {
    const server = await start();
    const result = await rawRequest({
      origin: server.origin,
      path: "/api/status",
      method: "GET",
      headers: { Host: "localhost:3000", "X-FFD-Editor-Session": challenge },
    });
    expect(result.status).toBe(400);
    expect(result.body).not.toContain(challenge);
  });

  it("recognizes only canonical loopback socket peers and closes idempotently", async () => {
    expect(isCanonicalLoopbackPeer("127.0.0.1")).toBe(true);
    expect(isCanonicalLoopbackPeer("::ffff:127.0.0.1")).toBe(true);
    expect(isCanonicalLoopbackPeer("::1")).toBe(false);
    expect(isCanonicalLoopbackPeer("192.168.1.2")).toBe(false);
    expect(isCanonicalLoopbackPeer(undefined)).toBe(false);
    const server = await start();
    await server.close();
    await server.close();
    active = null;
  });
});
