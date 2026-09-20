import { randomUUID } from "node:crypto";
import { request as requestHttp } from "node:http";

import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import { controlPlaneLimits } from "@framerfordevs/api/contracts/control-plane/index";
import { RateLimitCost, RateLimitDecision } from "@framerfordevs/api/contracts/rate-limit/index";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager/index";
import { db } from "@framerfordevs/db";
import { user } from "@framerfordevs/db/schema/auth";
import { generatePublicArtifacts } from "@framerfordevs/public-contracts";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { classifyControlPlaneRequest, createApp } from "../../../src/app";

const unlimitedRateLimitManager: RateLimitManagerService = {
  evaluate: (input) =>
    Effect.succeed(
      RateLimitDecision.make({
        allowed: true,
        policy: input.policy,
        cost: RateLimitCost.make(input.cost),
        limit: input.policy === "control-plane.global" ? 3_000 : 120,
        remaining: input.policy === "control-plane.global" ? 3_000 : 120,
        resetAtEpochMs: Date.now() + 60_000,
        retryAfterSeconds: null,
        enforcementMode: "memory",
      }),
    ),
  reset: () => Effect.void,
  retainedFallbackEntryCount: Effect.succeed(0),
};
const controlPlaneEffectTransform: ApplicationEffectTransform = (effect) =>
  Effect.provideService(effect, RateLimitManager, unlimitedRateLimitManager);
const app = createApp({ controlPlaneEffectTransform });
const routedApp = createApp({ hostRoutingEnabled: true, controlPlaneEffectTransform });
const disposableUserEmails = new Set<string>();
const artifact = generatePublicArtifacts().find(
  (candidate) => candidate.key === "control-plane/v1",
);
if (artifact === undefined) throw new Error("Missing Control Plane public artifact.");

afterAll(async () => {
  for (const email of disposableUserEmails) {
    await db.delete(user).where(eq(user.email, email));
  }
  await disposeApplicationRuntime();
});

type ControlPlaneTestMethod = "GET" | "PATCH" | "POST" | "PUT";
type ControlPlaneTestRoute = readonly [ControlPlaneTestMethod, string];

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const resourceId = "019fae8b-1234-7000-8000-000000000003";
const projectPath = `/projects/${projectId}`;
const environmentPath = `${projectPath}/environments/${environmentId}`;

const canonicalControlPlaneRoutes = [
  ["POST", "/invitations/accept"],
  ["POST", "/invitations/inspect"],
  ["GET", "/workspaces"],
  ["POST", "/workspaces"],
  ["GET", `/workspaces/${resourceId}`],
  ["GET", `/workspaces/${resourceId}/projects`],
  ["POST", `/workspaces/${resourceId}/projects`],
  ["GET", projectPath],
  ["PATCH", projectPath],
  ["POST", `${projectPath}/archive`],
  ["POST", `${projectPath}/restore`],
  ["GET", `${projectPath}/capabilities`],
  ["PUT", `${projectPath}/capabilities/cms`],
  ["GET", `${environmentPath}/studio-registration`],
  ["PUT", `${environmentPath}/studio-registration`],
  ["GET", `${projectPath}/governance`],
  ["GET", `${projectPath}/members`],
  ["PUT", `${projectPath}/members/${resourceId}/policy`],
  ["POST", `${projectPath}/members/${resourceId}/remove`],
  ["GET", `${projectPath}/invitations`],
  ["POST", `${projectPath}/invitations`],
  ["POST", `${projectPath}/invitations/${resourceId}/revoke`],
  ["GET", `${projectPath}/locales`],
  ["POST", `${projectPath}/locales`],
  ["PATCH", `${projectPath}/locales/${resourceId}`],
  ["PUT", `${projectPath}/locales/order`],
  ["PUT", `${projectPath}/locales/${resourceId}/status`],
  ["GET", `${environmentPath}/credentials`],
  ["POST", `${environmentPath}/credentials`],
  ["POST", `${environmentPath}/credentials/${resourceId}/rotations`],
  ["POST", `${environmentPath}/credential-rotations/${resourceId}/activate`],
  ["POST", `${environmentPath}/credential-rotations/${resourceId}/cancel`],
  ["POST", `${environmentPath}/credential-rotations/${resourceId}/complete`],
  ["POST", `${environmentPath}/credentials/${resourceId}/revoke`],
  ["GET", `${environmentPath}/webhooks`],
  ["POST", `${environmentPath}/webhooks`],
  ["PATCH", `${environmentPath}/webhooks/${resourceId}`],
  ["PUT", `${environmentPath}/webhooks/${resourceId}/state`],
  ["PUT", `${environmentPath}/webhooks/${resourceId}/subscriptions`],
  ["POST", `${environmentPath}/webhooks/${resourceId}/secret-rotations`],
  ["POST", `${environmentPath}/webhooks/${resourceId}/secret-rotations/activate`],
  ["POST", `${environmentPath}/webhooks/${resourceId}/secret-rotations/cancel`],
  ["POST", `${environmentPath}/webhooks/${resourceId}/secret-rotations/complete`],
  ["GET", `${environmentPath}/invalidation-mappings`],
  ["POST", `${environmentPath}/invalidation-mappings`],
  ["PUT", `${environmentPath}/invalidation-mappings/${resourceId}`],
  ["PUT", `${environmentPath}/invalidation-mappings/${resourceId}/state`],
  ["GET", `${environmentPath}/webhook-deliveries`],
  ["GET", `${environmentPath}/webhook-deliveries/${resourceId}`],
  ["GET", `${environmentPath}/webhook-deliveries/${resourceId}/attempts`],
  ["POST", `${environmentPath}/webhook-replays`],
  ["GET", `${projectPath}/audit-events`],
] as const satisfies ReadonlyArray<ControlPlaneTestRoute>;

function controlPlaneRequest(
  targetApp: Parameters<typeof request>[0],
  [method, path]: ControlPlaneTestRoute,
) {
  const target = request(targetApp);
  switch (method) {
    case "GET":
      return target.get(`/api/control-plane/v1${path}`);
    case "POST":
      return target.post(`/api/control-plane/v1${path}`).send({});
    case "PATCH":
      return target.patch(`/api/control-plane/v1${path}`).send({});
    case "PUT":
      return target.put(`/api/control-plane/v1${path}`).send({});
  }
}

function unauthenticatedOperationalRequest(method: ControlPlaneTestMethod, path: string) {
  return controlPlaneRequest(app, [method, path]);
}

function duplicateAuthorizationRequest(): Promise<{
  readonly status: number;
  readonly headers: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  readonly body: string;
}> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Control Plane test server did not bind."));
        return;
      }
      const outbound = requestHttp(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/api/control-plane/v1/workspaces",
          method: "GET",
          headers: { Authorization: ["Bearer first", "Bearer second"] },
        },
        (incoming) => {
          const chunks: Array<Buffer> = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("end", () => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve({
                status: incoming.statusCode ?? 0,
                headers: incoming.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          });
        },
      );
      outbound.on("error", (error) => {
        server.close(() => reject(error));
      });
      outbound.end();
    });
  });
}

describe("Control Plane HTTP boundary", () => {
  it("classifies only closed operation and cost labels", () => {
    expect(classifyControlPlaneRequest("GET", "/workspaces")).toEqual({
      operation: "workspace_list",
      costBucket: "1",
    });
    expect(
      classifyControlPlaneRequest(
        "PUT",
        "/projects/project-id/environments/environment-id/studio-registration",
      ),
    ).toEqual({ operation: "studio_registration_put", costBucket: "5" });
    expect(classifyControlPlaneRequest("GET", "/projects/project-id/members")).toEqual({
      operation: "member_list",
      costBucket: "2",
    });
    expect(classifyControlPlaneRequest("POST", "/invitations/accept")).toEqual({
      operation: "invitation_accept",
      costBucket: "5",
    });
    expect(classifyControlPlaneRequest("DELETE", "/projects/project-id")).toBeNull();
  });

  it("registers every operational route behind bearer authority with a closed cost", async () => {
    const project = "019fae8b-1234-7000-8000-000000000001";
    const environment = "019fae8b-1234-7000-8000-000000000002";
    const resource = "019fae8b-1234-7000-8000-000000000003";
    const base = `/projects/${project}/environments/${environment}`;
    const routes = [
      ["GET", `${base}/credentials`],
      ["POST", `${base}/credentials`],
      ["POST", `${base}/credentials/${resource}/rotations`],
      ["POST", `${base}/credential-rotations/${resource}/activate`],
      ["POST", `${base}/credential-rotations/${resource}/cancel`],
      ["POST", `${base}/credential-rotations/${resource}/complete`],
      ["POST", `${base}/credentials/${resource}/revoke`],
      ["GET", `${base}/webhooks`],
      ["POST", `${base}/webhooks`],
      ["PATCH", `${base}/webhooks/${resource}`],
      ["PUT", `${base}/webhooks/${resource}/state`],
      ["PUT", `${base}/webhooks/${resource}/subscriptions`],
      ["POST", `${base}/webhooks/${resource}/secret-rotations`],
      ["POST", `${base}/webhooks/${resource}/secret-rotations/activate`],
      ["POST", `${base}/webhooks/${resource}/secret-rotations/cancel`],
      ["POST", `${base}/webhooks/${resource}/secret-rotations/complete`],
      ["GET", `${base}/invalidation-mappings`],
      ["POST", `${base}/invalidation-mappings`],
      ["PUT", `${base}/invalidation-mappings/${resource}`],
      ["PUT", `${base}/invalidation-mappings/${resource}/state`],
      ["GET", `${base}/webhook-deliveries`],
      ["GET", `${base}/webhook-deliveries/${resource}`],
      ["GET", `${base}/webhook-deliveries/${resource}/attempts`],
      ["POST", `${base}/webhook-replays`],
      ["GET", `/projects/${project}/audit-events`],
    ] as const;

    for (const [method, path] of routes) {
      expect(classifyControlPlaneRequest(method, path), `${method} ${path}`).not.toBeNull();
      const response = await unauthenticatedOperationalRequest(method, path);
      expect(response.status, `${method} ${path}`).toBe(401);
      expect(response.body.error.code, `${method} ${path}`).toBe("UNAUTHORIZED");
      expect(response.headers["cache-control"], `${method} ${path}`).toBe("no-store");
      expect(response.headers.location, `${method} ${path}`).toBeUndefined();
    }
  });

  it("isolates bearer and session authority across all 52 canonical operations", async () => {
    expect(canonicalControlPlaneRoutes).toHaveLength(52);
    const email = `m17-control-plane-${randomUUID()}@example.test`;
    disposableUserEmails.add(email);
    const signUp = await request(routedApp)
      .post("/api/auth/sign-up/email")
      .set("Host", "localhost:3001")
      .set("Origin", "http://localhost:3001")
      .send({ name: "M17 Control Plane Matrix", email, password: "M17-Test-Password-123!" });
    expect(signUp.status).toBe(200);
    const sessionCookie = String(signUp.headers["set-cookie"]?.[0] ?? "").split(";", 1)[0];
    if (sessionCookie === undefined || sessionCookie === "") {
      throw new Error("Expected a dashboard session cookie for the Control Plane matrix.");
    }

    for (const route of canonicalControlPlaneRoutes) {
      const label = route.join(" ");
      expect(classifyControlPlaneRequest(route[0], route[1]), label).not.toBeNull();

      const cookieOnlyApi = await controlPlaneRequest(app, route).set(
        "Cookie",
        "session=must-not-authenticate",
      );
      expect(cookieOnlyApi.status, `${label} API cookie`).toBe(401);
      expect(cookieOnlyApi.body.error.code, `${label} API cookie`).toBe("UNAUTHORIZED");
      expect(cookieOnlyApi.headers["www-authenticate"], `${label} API cookie`).toBe(
        'Bearer realm="control-plane"',
      );

      const anonymousDashboard = controlPlaneRequest(routedApp, route).set(
        "Host",
        "localhost:3001",
      );
      if (route[0] !== "GET") anonymousDashboard.set("Origin", "http://localhost:3001");
      const anonymousDashboardResponse = await anonymousDashboard;
      expect(anonymousDashboardResponse.status, `${label} dashboard anonymous`).toBe(401);
      expect(
        anonymousDashboardResponse.headers["www-authenticate"],
        `${label} dashboard anonymous`,
      ).toBeUndefined();

      const bearerDashboard = controlPlaneRequest(routedApp, route)
        .set("Host", "localhost:3001")
        .set("Authorization", "Bearer must-not-authenticate");
      if (route[0] !== "GET") bearerDashboard.set("Origin", "http://localhost:3001");
      const bearerDashboardResponse = await bearerDashboard;
      expect(bearerDashboardResponse.status, `${label} dashboard bearer`).toBe(400);
      expect(bearerDashboardResponse.body.error.code, `${label} dashboard bearer`).toBe(
        "VALIDATION_ERROR",
      );
    }

    for (let offset = 0; offset < canonicalControlPlaneRoutes.length; offset += 4) {
      await Promise.all(
        canonicalControlPlaneRoutes.slice(offset, offset + 4).map(async (route) => {
          const label = route.join(" ");
          const sessionDashboard = controlPlaneRequest(routedApp, route)
            .set("Host", "localhost:3001")
            .set("Cookie", sessionCookie);
          if (route[0] !== "GET") sessionDashboard.set("Origin", "http://localhost:3001");
          const response = await sessionDashboard.timeout({ response: 5_000, deadline: 10_000 });
          expect(response.status, `${label} dashboard session`).not.toBe(401);
          expect(response.status, `${label} dashboard session quota`).not.toBe(429);
          expect(
            response.headers["www-authenticate"],
            `${label} dashboard session`,
          ).toBeUndefined();
          expect(response.headers["cache-control"], `${label} dashboard session`).toBe("no-store");
          expect(response.headers.vary, `${label} dashboard session`).toBe("Cookie, Origin");
          expect(response.headers["ratelimit-limit"], `${label} dashboard session`).toEqual(
            expect.any(String),
          );
          expect(response.headers["x-request-id"], `${label} dashboard session`).toEqual(
            expect.any(String),
          );
        }),
      );
    }
  }, 60_000);

  it("closes dashboard CSRF, Fetch Metadata, preflight, and content-type boundaries", async () => {
    const mutation = "/api/control-plane/v1/workspaces";
    for (const origin of ["https://hostile.example", "null"]) {
      const response = await request(routedApp)
        .post(mutation)
        .set("Host", "localhost:3001")
        .set("Origin", origin)
        .send({});
      expect(response.status, origin).toBe(403);
      expect(response.headers["access-control-allow-origin"], origin).toBeUndefined();
    }

    const crossSiteRead = await request(routedApp)
      .get(mutation)
      .set("Host", "localhost:3001")
      .set("Sec-Fetch-Site", "cross-site");
    expect(crossSiteRead.status).toBe(403);

    const preflight = await request(routedApp)
      .options(mutation)
      .set("Host", "localhost:3001")
      .set("Origin", "https://hostile.example")
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.status).toBe(403);
    expect(preflight.headers["access-control-allow-credentials"]).toBeUndefined();

    for (const contentType of [
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=test",
      "text/plain",
      "application/json; charset=iso-8859-1",
    ]) {
      const response = await request(routedApp)
        .post(mutation)
        .set("Host", "localhost:3001")
        .set("Origin", "http://localhost:3001")
        .set("Content-Type", contentType)
        .send("{}");
      expect(response.status, contentType).toBe(400);
      expect(response.body.error.code, contentType).toBe("VALIDATION_ERROR");
    }

    const missingContentType = await request(routedApp)
      .post(mutation)
      .set("Host", "localhost:3001")
      .set("Origin", "http://localhost:3001")
      .send();
    expect(missingContentType.status).toBe(400);
  });

  it("serves the canonical artifact separately from bearer data routes", async () => {
    const response = await request(app).get("/api/control-plane/v1/openapi.json");

    expect(response.status).toBe(200);
    expect(response.text).toBe(artifact.bytes);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("requires bearer authority and ignores dashboard cookies", async () => {
    const response = await request(app)
      .get("/api/control-plane/v1/workspaces")
      .set("Cookie", "session=must-not-authenticate");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(response.headers["www-authenticate"]).toBe('Bearer realm="control-plane"');
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["ratelimit-limit"]).toBe("3000");
    expect(response.headers.location).toBeUndefined();
  });

  it("rejects browser origins, preflight, and duplicate authorization", async () => {
    const origin = await request(app)
      .get("/api/control-plane/v1/workspaces")
      .set("Origin", "https://hostile.example");
    expect(origin.status).toBe(403);
    expect(origin.body.error.code).toBe("FORBIDDEN");
    expect(origin.headers["access-control-allow-origin"]).toBeUndefined();

    const preflight = await request(app)
      .options("/api/control-plane/v1/workspaces")
      .set("Origin", "https://hostile.example")
      .set("Access-Control-Request-Method", "GET");
    expect(preflight.status).toBe(403);
    expect(preflight.headers["access-control-allow-origin"]).toBeUndefined();

    const duplicate = await duplicateAuthorizationRequest();
    expect(duplicate.status).toBe(400);
    expect(JSON.parse(duplicate.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("closes methods, mutation queries, content types, and GET bodies", async () => {
    const method = await request(app).delete("/api/control-plane/v1/workspaces");
    expect(method.status).toBe(405);
    expect(method.headers.allow).toBe("GET, POST");

    const wrongMethod = await request(app).post(
      "/api/control-plane/v1/workspaces/019fae8b-1234-7000-8000-000000000001",
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.allow).toBe("GET");

    const unknown = await request(app).post("/api/control-plane/v1/unknown");
    expect(unknown.status).toBe(404);

    const query = await request(app)
      .post("/api/control-plane/v1/workspaces?token=forbidden")
      .set("Content-Type", "application/json")
      .send({ commandId: "019fae8b-1234-7000-8000-000000000001", name: "Workspace" });
    expect(query.status).toBe(400);
    expect(query.body.error.code).toBe("VALIDATION_ERROR");

    const contentType = await request(app)
      .post("/api/control-plane/v1/workspaces")
      .set("Content-Type", "text/plain")
      .send("{}");
    expect(contentType.status).toBe(400);
    expect(contentType.body.error.code).toBe("VALIDATION_ERROR");

    const getBody = await request(app)
      .get("/api/control-plane/v1/workspaces")
      .set("Content-Type", "application/json")
      .send({ unexpected: true });
    expect(getBody.status).toBe(400);
    expect(getBody.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects oversized requests before JSON decoding", async () => {
    const response = await request(app)
      .post("/api/control-plane/v1/workspaces")
      .set("Content-Type", "application/json")
      .set("Content-Length", String(controlPlaneLimits.requestBytes + 1))
      .send("{}");

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("CONTROL_PLANE_REQUEST_TOO_LARGE");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
