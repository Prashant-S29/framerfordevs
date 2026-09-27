import { createServer } from "node:http";

import express, { type RequestHandler } from "express";

import { createExpressStudioMiddleware } from "@framerfordevs/studio-adapter-express";
import {
  createStudioFetchHandler,
  loadPackagedStudioAssets,
  type StudioFetchHandler,
} from "@framerfordevs/studio-server";
import { makeMemoryStudioStore } from "@framerfordevs/studio-server/testing";

export interface StudioBrowserFixture {
  readonly origin: string;
  readonly close: () => Promise<void>;
}

function token() {
  return {
    access_token: "browser-fixture-access-token",
    refresh_token: "browser-fixture-refresh-token",
    token_type: "Bearer",
    expires_in: 300,
    scope: "studio:session offline_access",
  };
}

export async function startStudioBrowserFixture(): Promise<StudioBrowserFixture> {
  const app = express();
  let middleware: RequestHandler | null = null;
  let origin = "";
  let accessExpiresAt = Date.now() + 300_000;
  app.use("/studio", (request, response, next) => {
    if (middleware === null) {
      response.status(503).end();
      return;
    }
    middleware(request, response, next);
  });
  app.get("/api/auth/oauth2/authorize", (request, response) => {
    const redirectUri =
      typeof request.query.redirect_uri === "string" ? request.query.redirect_uri : "";
    const state = typeof request.query.state === "string" ? request.query.state : "";
    const callback = new URL(redirectUri);
    callback.searchParams.set("code", "browser-fixture-code");
    callback.searchParams.set("state", state);
    callback.searchParams.set("iss", `${origin}/api/auth`);
    response.redirect(302, callback.toString());
  });
  app.post(
    "/api/auth/oauth2/token",
    express.urlencoded({ extended: false, limit: "8kb" }),
    (_request, response) => {
      accessExpiresAt = Date.now() + 300_000;
      response.json(token());
    },
  );
  app.get(
    "/api/studio/v1/projects/:projectId/environments/:environmentId/bootstrap",
    (_request, response) =>
      response.json({
        ok: true,
        data: {
          formatVersion: 1,
          registration: {
            id: "11111111-1111-4111-8111-111111111111",
            version: 3,
            applicationOrigin: origin,
            mountPath: "/studio",
          },
          project: {
            id: "22222222-2222-4222-8222-222222222222",
            name: "Browser Studio",
            workspaceId: "44444444-4444-4444-8444-444444444444",
          },
          environment: {
            id: "33333333-3333-4333-8333-333333333333",
            key: "main",
            name: "main",
          },
          user: {
            id: "browser-user",
            name: "Browser User",
            email: "browser@example.test",
          },
          role: "editor",
          effectiveActions: ["project.read"],
          session: { expiresAt: new Date(accessExpiresAt).toISOString() },
        },
        error: null,
        message: "Studio bootstrap loaded.",
      }),
  );
  app.post("/api/auth/oauth2/revoke", (_request, response) => response.status(200).end());

  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Studio fixture bind failed.");
  origin = `http://127.0.0.1:${address.port}`;
  const handler: StudioFetchHandler = createStudioFetchHandler({
    mode: "test",
    applicationOrigin: origin,
    platformOrigin: origin,
    dashboardOrigin: origin,
    mountPath: "/studio",
    registrationId: "11111111-1111-4111-8111-111111111111",
    projectId: "22222222-2222-4222-8222-222222222222",
    environmentId: "33333333-3333-4333-8333-333333333333",
    store: makeMemoryStudioStore(),
    encryption: {
      activeKeyId: "browser",
      keys: [{ id: "browser", key: new Uint8Array(32).fill(9) }],
    },
    assets: await loadPackagedStudioAssets(),
  });
  middleware = createExpressStudioMiddleware(handler);

  return {
    origin,
    close: async () => {
      await handler.dispose();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
