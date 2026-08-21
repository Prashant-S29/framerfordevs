import type { Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createWorkerHealthServer } from "./health";

let server: Server | undefined;

afterEach(async () => {
  if (server === undefined) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

async function origin() {
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server?.address();
  if (!address || typeof address === "string")
    throw new Error("Worker health server did not bind.");
  return `http://127.0.0.1:${address.port}`;
}

describe("worker health server", () => {
  it("separates liveness, readiness, methods, and unknown paths", async () => {
    server = createWorkerHealthServer({
      liveness: async () => ({ status: "ok" }),
      readiness: async () => ({ status: "ready" }),
    });
    const url = await origin();
    const [health, ready, missing, method] = await Promise.all([
      fetch(`${url}/health`),
      fetch(`${url}/ready`),
      fetch(`${url}/missing`),
      fetch(`${url}/health`, { method: "POST" }),
    ]);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
    expect(missing.status).toBe(404);
    expect(method.status).toBe(405);
    expect(ready.headers.get("cache-control")).toBe("no-store");
  });

  it("fails readiness closed without changing liveness", async () => {
    server = createWorkerHealthServer({
      liveness: async () => ({ status: "ok" }),
      readiness: async () => Promise.reject(new Error("database unavailable")),
    });
    const url = await origin();
    const ready = await fetch(`${url}/ready`);
    const health = await fetch(`${url}/health`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: "unavailable" });
    expect(health.status).toBe(200);
  });
});
