import { request as requestHttp } from "node:http";

import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import { StudioBootstrap, studioLimits } from "@framerfordevs/api/contracts/studio/index";
import {
  RateLimitDecision,
  rateLimitPolicies,
} from "@framerfordevs/api/contracts/rate-limit/index";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager/index";
import {
  makeStudioOAuthTokenVerifier,
  StudioOAuthTokenVerifier,
} from "@framerfordevs/api/services/studio/principal-authenticator";
import {
  makeStudioRepository,
  StudioRepository,
} from "@framerfordevs/api/services/studio/repository";
import type { StudioOAuthPrincipal } from "@framerfordevs/auth";
import { Effect, Schema } from "effect";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../../src/app";

const projectId = "019fae8b-1234-7000-8000-000000000002";
const environmentId = "019fae8b-1234-7000-8000-000000000003";
const registrationId = "019fae8b-1234-7000-8000-000000000009";
const principal: StudioOAuthPrincipal = {
  kind: "studio_oauth_user",
  userId: "studio-http-user",
  clientId: `ffd-studio-v1-${registrationId}`,
  registrationId,
  registrationVersion: 3,
  projectId,
  environmentId,
  grantId: "019fae8b-1234-7000-8000-000000000010",
  auditMarkerId: "019fae8b-1234-7000-8000-000000000011",
  grantExpiresAtEpochSeconds: 1_800_000_000,
  scopes: ["studio:session", "offline_access"],
  expiresAtEpochSeconds: 1_800_000_000,
};
const bootstrap = Schema.decodeUnknownSync(StudioBootstrap)({
  formatVersion: 1,
  registration: {
    id: registrationId,
    version: 3,
    applicationOrigin: "https://application.example.test",
    mountPath: "/studio",
  },
  project: {
    id: projectId,
    name: "Studio Project",
    workspaceId: "019fae8b-1234-7000-8000-000000000001",
  },
  environment: { id: environmentId, key: "main", name: "main" },
  user: { id: principal.userId, name: "Studio User", email: "studio@example.test" },
  role: "developer",
  effectiveActions: ["project.read", "project.update"],
  session: { expiresAt: "2027-01-15T08:00:00.000Z" },
});

const verifier = makeStudioOAuthTokenVerifier((token) =>
  Promise.resolve(token === "studio-http-token" ? principal : null),
);
const repository: ReturnType<typeof makeStudioRepository> = {
  authorizeOAuth: () => Effect.succeed({ allowed: true as const }),
  getBootstrap: () => Effect.succeed(bootstrap),
};
const evaluatedPolicies: string[] = [];
const rateLimitManager: RateLimitManagerService = {
  evaluate: (input) =>
    Effect.sync(() => {
      evaluatedPolicies.push(input.policy);
      return Schema.decodeUnknownSync(RateLimitDecision)({
        allowed: true,
        policy: input.policy,
        cost: input.cost,
        limit: rateLimitPolicies[input.policy].limitPerInterval,
        remaining: rateLimitPolicies[input.policy].capacity,
        resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
        retryAfterSeconds: null,
        enforcementMode: "memory",
      });
    }),
  reset: () => Effect.void,
  retainedFallbackEntryCount: Effect.succeed(0),
};
const studioEffectTransform: ApplicationEffectTransform = (effect) =>
  Effect.provideService(effect, StudioOAuthTokenVerifier, verifier).pipe(
    Effect.provideService(StudioRepository, repository),
    Effect.provideService(RateLimitManager, rateLimitManager),
  );
const app = createApp({ hostRoutingEnabled: false, studioEffectTransform });
const api = request(app);

function duplicateStudioAuthorizationRequest(): Promise<{
  readonly status: number;
  readonly wwwAuthenticate: string | undefined;
}> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Studio test server did not bind."));
        return;
      }
      const outbound = requestHttp(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: `/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`,
          method: "GET",
          headers: {
            Authorization: ["Bearer studio-http-token", "Bearer studio-http-token"],
          },
        },
        (incoming) => {
          incoming.resume();
          incoming.on("end", () => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve({
                status: incoming.statusCode ?? 0,
                wwwAuthenticate: incoming.headers["www-authenticate"],
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

// The shared runtime may be initialized by unrelated app imports during this suite.
afterAll(async () => {
  await disposeApplicationRuntime();
});

describe("Studio bootstrap HTTP boundary", () => {
  it("serves only the bounded bearer-authorized bootstrap with both quotas", async () => {
    evaluatedPolicies.length = 0;
    const response = await api
      .get(`/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`)
      .set("Authorization", "Bearer studio-http-token");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
    expect(response.headers.vary).toBe("Authorization");
    expect(response.body).toEqual({
      ok: true,
      data: bootstrap,
      error: null,
      message: "Studio bootstrap loaded.",
    });
    expect(evaluatedPolicies).toEqual(["studio.global", "studio.user"]);
  });

  it("rejects bodies and oversized input before authentication", async () => {
    const body = await api
      .get(`/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`)
      .set("Authorization", "Bearer studio-http-token")
      .set("Content-Type", "application/json")
      .send({ unexpected: true });
    expect(body.status).toBe(400);
    expect(body.body.error.code).toBe("VALIDATION_ERROR");

    const oversized = await api
      .get(`/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`)
      .set("Authorization", "Bearer studio-http-token")
      .set("Content-Length", String(studioLimits.requestBytes + 1));
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe("REQUEST_TOO_LARGE");
  });

  it("rejects browser origins and invalid bearer authority without scope lookup", async () => {
    const browser = await api
      .get(`/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`)
      .set("Origin", "https://application.example.test")
      .set("Authorization", "Bearer studio-http-token");
    expect(browser.status).toBe(403);
    expect(browser.body.error.code).toBe("FORBIDDEN");

    const unauthorized = await api
      .get(`/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`)
      .set("Authorization", "Bearer invalid");
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers["www-authenticate"]).toBe(
      'Bearer realm="studio", error="invalid_token"',
    );
    expect(unauthorized.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects cookie-bearing and duplicate-authorization requests", async () => {
    const cookie = await api
      .get(`/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`)
      .set("Authorization", "Bearer studio-http-token")
      .set("Cookie", "better-auth.session_token=must-not-be-used");
    expect(cookie.status).toBe(401);
    expect(cookie.body.error.code).toBe("UNAUTHORIZED");

    const duplicate = await duplicateStudioAuthorizationRequest();
    expect(duplicate.status).toBe(401);
    expect(duplicate.wwwAuthenticate).toBe('Bearer realm="studio", error="invalid_token"');
  });

  it("publishes the deterministic specification without accepting query, method, or route expansion", async () => {
    const specification = await api.get("/api/studio/v1/openapi.json");
    expect(specification.status).toBe(200);
    expect(specification.body.info.title).toBe("Framer for Devs Studio API");

    const query = await api
      .get(
        `/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap?access_token=forbidden`,
      )
      .set("Authorization", "Bearer studio-http-token");
    expect(query.status).toBe(400);
    expect(query.body.error.code).toBe("VALIDATION_ERROR");

    const wrongMethod = await api
      .post(`/api/studio/v1/projects/${projectId}/environments/${environmentId}/bootstrap`)
      .set("Authorization", "Bearer studio-http-token");
    expect(wrongMethod.status).toBe(404);
    expect(wrongMethod.headers.location).toBeUndefined();

    const missing = await api.get("/api/studio/v1/content");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect(Buffer.byteLength(JSON.stringify(missing.body), "utf8")).toBeLessThanOrEqual(
      studioLimits.responseBytes,
    );
  });
});
