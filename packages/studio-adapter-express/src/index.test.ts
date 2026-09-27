import { request as httpRequest } from "node:http";

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createExpressStudioMiddleware } from ".";
import type { StudioFetchHandler } from "@framerfordevs/studio-server";

function fixture(fetch: StudioFetchHandler["fetch"]): StudioFetchHandler {
  return {
    mountPath: "/admin/studio",
    applicationOrigin: "http://127.0.0.1",
    fetch,
    dispose: async () => undefined,
  };
}

describe("Express Studio adapter", () => {
  it("preserves the raw request target and multiple Set-Cookie fields", async () => {
    const seen = vi.fn();
    const handler = fixture(async (_request, context) => {
      seen(context.rawTarget);
      const headers = new Headers({ "Content-Type": "application/json", "X-Studio": "fixture" });
      expect(_request.signal.aborted).toBe(false);
      headers.append("Set-Cookie", "one=1; Path=/admin/studio; HttpOnly");
      headers.append("Set-Cookie", "two=2; Path=/admin/studio; HttpOnly");
      return new Response('{"ok":true}\n', { status: 200, headers });
    });
    const app = express();
    app.use(createExpressStudioMiddleware(handler));
    const response = await request(app)
      .get("/admin/studio/auth/callback?state=a%2Fb")
      .set("Host", "127.0.0.1");
    expect(response.status).toBe(200);
    expect(seen).toHaveBeenCalledWith("/admin/studio/auth/callback?state=a%2Fb");
    expect(response.headers["set-cookie"]).toHaveLength(2);
    expect(response.headers["x-studio"]).toBe("fixture");
  });

  it("rejects a request received for the wrong external origin", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const app = express();
    app.use(createExpressStudioMiddleware(fixture(fetch)));
    const response = await request(app).get("/admin/studio").set("Host", "attacker.example");
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies before invoking the core", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const app = express();
    app.use(createExpressStudioMiddleware(fixture(fetch)));
    const response = await request(app)
      .post("/admin/studio/auth/logout")
      .set("Host", "127.0.0.1")
      .set("Content-Type", "text/plain")
      .send("x".repeat(2_000));
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("delegates outside the exact nested mount and rejects ambiguous owned targets early", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const app = express();
    app.use(createExpressStudioMiddleware(fixture(fetch)));
    app.get("/outside", (_request, response) => response.status(202).send("outside"));
    app.get("/admin/studio-other", (_request, response) => response.status(203).send("sibling"));
    expect((await request(app).get("/outside").set("Host", "127.0.0.1")).status).toBe(202);
    expect((await request(app).get("/admin/studio-other").set("Host", "127.0.0.1")).status).toBe(
      203,
    );
    expect(
      (await request(app).get("/admin/studio%2fauth/login").set("Host", "127.0.0.1")).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates client cancellation into the canonical Request signal", async () => {
    let signalAborted: (() => void) | undefined;
    let handlerCalled: (() => void) | undefined;
    const aborted = new Promise<void>((resolve) => {
      signalAborted = resolve;
    });
    const called = new Promise<void>((resolve) => {
      handlerCalled = resolve;
    });
    let expectedOrigin = "";
    const handler: StudioFetchHandler = {
      ...fixture(
        async (incoming) =>
          new Promise<Response>((resolve) => {
            handlerCalled?.();
            incoming.signal.addEventListener(
              "abort",
              () => {
                signalAborted?.();
                resolve(new Response(null, { status: 499 }));
              },
              { once: true },
            );
          }),
      ),
      get applicationOrigin() {
        return expectedOrigin;
      },
    };
    const app = express();
    app.use(createExpressStudioMiddleware(handler));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected TCP address.");
    expectedOrigin = `http://127.0.0.1:${address.port}`;
    const outgoing = httpRequest({
      hostname: "127.0.0.1",
      port: address.port,
      path: "/admin/studio/api/bootstrap",
    });
    outgoing.on("error", () => undefined);
    outgoing.end();
    await called;
    outgoing.destroy();
    await expect(
      Promise.race([
        aborted.then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 1_000)),
      ]),
    ).resolves.toBe(true);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  });

  it("accepts exactly 1 KiB and rejects one byte more before the core", async () => {
    const fetch = vi.fn(
      async (incoming: Request) =>
        new Response(String((await incoming.arrayBuffer()).byteLength), { status: 200 }),
    );
    const app = express();
    app.use(createExpressStudioMiddleware(fixture(fetch)));
    const exact = await request(app)
      .post("/admin/studio/auth/logout")
      .set("Host", "127.0.0.1")
      .set("Content-Type", "application/json")
      .send("x".repeat(1_024));
    expect(exact.status).toBe(200);
    expect(exact.text).toBe("1024");
    const over = await request(app)
      .post("/admin/studio/auth/logout")
      .set("Host", "127.0.0.1")
      .set("Content-Type", "application/json")
      .send("x".repeat(1_025));
    expect(over.status).toBe(413);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
