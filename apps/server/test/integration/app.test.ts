import { randomUUID } from "node:crypto";

import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import {
  CLI_OAUTH_GRANT_TYPES,
  CLI_OAUTH_SCOPES,
  createAuth,
  ensureOfficialCliOAuthAuthority,
  getDefaultCookieAttributes,
  makeToolingOAuthAccessTokenVerifier,
  OFFICIAL_CLI_OAUTH_CLIENT_ID,
} from "@framerfordevs/auth";
import { createDb, db } from "@framerfordevs/db";
import {
  deviceCode,
  oauthAccessToken,
  oauthClient,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  session,
  user,
} from "@framerfordevs/db/schema/auth";
import { env } from "@framerfordevs/env/server";
import { generatePublicArtifacts } from "@framerfordevs/public-contracts";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../src/app";

const app = createApp();
const testEmailPattern = "m0-%@example.test";
const password = "M0-Test-Password-123!";
const oauthTestUserIds = new Set<string>();
const publicArtifacts = generatePublicArtifacts();

function expectedPublicArtifact(key: "delivery/v1" | "preview/v1" | "tooling/v1"): string {
  const artifact = publicArtifacts.find((candidate) => candidate.key === key);
  if (artifact === undefined) throw new Error(`Missing test artifact: ${key}`);
  return artifact.bytes;
}

function makeEmail() {
  return `m0-${randomUUID()}@example.test`;
}

async function createTestUser(email: string) {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/auth/sign-up/email")
    .set("Origin", "http://localhost:3001")
    .send({
      name: "M0 Test User",
      email,
      password,
    });

  expect(response.status).toBe(200);
  return agent;
}

afterAll(async () => {
  const oauthUserIds = [...oauthTestUserIds];
  if (oauthUserIds.length > 0) {
    await db.delete(oauthAccessToken).where(inArray(oauthAccessToken.userId, oauthUserIds));
    await db.delete(oauthRefreshToken).where(inArray(oauthRefreshToken.userId, oauthUserIds));
    await db.delete(oauthConsent).where(inArray(oauthConsent.userId, oauthUserIds));
  }
  await db.delete(deviceCode).where(eq(deviceCode.oauthClientId, OFFICIAL_CLI_OAUTH_CLIENT_ID));
  await db.delete(user).where(like(user.email, testEmailPattern));
  await disposeApplicationRuntime();
});

describe("server foundation", () => {
  it("returns the root health response", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(response.body).toEqual({
      ok: true,
      data: { status: "ok" },
      error: null,
      message: "Service is healthy.",
    });
  });

  it("returns readiness separately from liveness", async () => {
    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      data: { status: "ready" },
      error: null,
      message: "Service is ready.",
    });
  });

  it("propagates a valid inbound request ID", async () => {
    const response = await request(app).get("/").set("X-Request-Id", "request.valid-123");

    expect(response.headers["x-request-id"]).toBe("request.valid-123");
  });

  it("replaces malformed and oversized request IDs", async () => {
    const malformed = await request(app).get("/").set("X-Request-Id", "invalid request id");
    const oversized = await request(app).get("/").set("X-Request-Id", "x".repeat(129));

    expect(malformed.headers["x-request-id"]).not.toBe("invalid request id");
    expect(oversized.headers["x-request-id"]).not.toBe("x".repeat(129));
    expect(String(malformed.headers["x-request-id"])).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    expect(String(oversized.headers["x-request-id"])).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  it("keeps the complete management API reference disabled by default", async () => {
    const response = await request(app).get("/api-reference");

    expect(response.status).toBe(404);
  });

  it("serves the management API reference only when explicitly enabled locally", async () => {
    const internalApp = createApp({ managementApiReferenceEnabled: true });
    const response = await request(internalApp).get("/api-reference");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("serves the public oRPC health procedure", async () => {
    const response = await request(app).post("/rpc/healthCheck").send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      json: {
        ok: true,
        data: { status: "ok" },
        error: null,
        message: "Service is healthy.",
      },
    });
  });

  it("rejects an unsupported method for an oRPC procedure", async () => {
    const response = await request(app).get("/rpc/healthCheck");

    expect(response.status).toBe(405);
  });

  it("rejects anonymous access to a protected oRPC procedure", async () => {
    const response = await request(app).post("/rpc/privateData").send({});

    expect(response.status).toBe(401);
    expect(response.body.json.code).toBe("UNAUTHORIZED");
    expect(response.body.json.data).toEqual({
      ok: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication is required.",
        retryable: false,
        requestId: response.headers["x-request-id"],
      },
      message: "Authentication is required.",
    });
  });
});

describe("CORS policy", () => {
  it("allows requests without a browser Origin header", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows the configured web origin with credentials", async () => {
    const response = await request(app).get("/").set("Origin", "http://localhost:3001");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("allows preflight from the configured web origin", async () => {
    const response = await request(app)
      .options("/rpc/healthCheck")
      .set("Origin", "http://localhost:3001")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3001");
  });

  it("explicitly rejects an untrusted origin", async () => {
    const response = await request(app).get("/").set("Origin", "https://untrusted.example");

    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(response.body.error.requestId).toBe(response.headers["x-request-id"]);
  });

  it("explicitly rejects preflight from an untrusted origin", async () => {
    const response = await request(app)
      .options("/rpc/healthCheck")
      .set("Origin", "https://untrusted.example")
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("isolates wildcard non-credentialed Delivery CORS from management CORS", async () => {
    const response = await request(app)
      .get("/api/delivery/v1/openapi.json")
      .set("Origin", "https://consumer.example");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.text).toBe(expectedPublicArtifact("delivery/v1"));
    expect(response.body.info).toEqual(
      expect.objectContaining({
        title: "Framer for Devs Delivery API",
        version: "1.0.0",
      }),
    );
    expect(Object.keys(response.body.paths)).toHaveLength(4);
  });

  it("serves an interactive Delivery-only API reference", async () => {
    const response = await request(app).get("/api/delivery/v1/docs");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain("Framer for Devs Delivery API");
    expect(response.text).toContain("/api/delivery/v1/openapi.json");
    expect(response.text).not.toContain("platform.workspaces");
  });

  it("validates Delivery preflight methods and headers without content authentication", async () => {
    const path =
      "/api/delivery/v1/projects/019fae8b-1234-7000-8000-000000000001/environments/main/collections/posts/entries";
    const allowed = await request(app)
      .options(path)
      .set("Origin", "https://consumer.example")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Authorization, If-None-Match");
    const denied = await request(app)
      .options(path)
      .set("Origin", "https://consumer.example")
      .set("Access-Control-Request-Method", "POST");

    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("*");
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
  });

  it("requires explicit locale before Delivery scope database resolution", async () => {
    const enabledApp = createApp({ deliveryApiEnabled: true });
    const response = await request(enabledApp).get(
      "/api/delivery/v1/projects/019fae8b-1234-7000-8000-000000000001/environments/main/collections/posts/entries",
    );

    expect(response.status).toBe(400);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.details).toEqual([
      expect.objectContaining({ code: "locale_required", path: "locale" }),
    ]);
  });

  it("keeps Delivery data routes disabled until backfill verification", async () => {
    const disabledApp = createApp({ deliveryApiEnabled: false });
    const response = await request(disabledApp).get(
      "/api/delivery/v1/projects/019fae8b-1234-7000-8000-000000000001/environments/main/collections/posts/entries?locale=en",
    );

    expect(response.status).toBe(503);
    expect(response.headers["access-control-allow-origin"]).toBe("*");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("Tooling HTTP isolation", () => {
  const projectsPath = "/api/tooling/v1/projects";
  const manifestPath =
    "/api/tooling/v1/projects/019fae8b-1234-7000-8000-000000000001/environments/main/schema/manifest";

  it("serves exact Tooling-only OpenAPI bytes without management CORS", async () => {
    const specification = await request(app)
      .get("/api/tooling/v1/openapi.json")
      .set("Origin", "https://consumer.example");
    const reference = await request(app).get("/api/tooling/v1/docs");

    expect(specification.status).toBe(200);
    expect(specification.text).toBe(expectedPublicArtifact("tooling/v1"));
    expect(specification.headers["access-control-allow-origin"]).toBeUndefined();
    expect(specification.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(specification.headers["x-content-type-options"]).toBe("nosniff");
    expect(specification.body.info.title).toBe("Framer for Developers Tooling API");
    expect(Object.keys(specification.body.paths)).toHaveLength(4);
    expect(JSON.stringify(specification.body)).not.toContain("workspaceId");
    expect(JSON.stringify(specification.body)).not.toContain("register-client");
    expect(reference.status).toBe(200);
    expect(reference.text).toContain("Framer for Devs Tooling API");
    expect(reference.text).toContain("/api/tooling/v1/openapi.json");
  });

  it("rejects browser origins and all data-route preflights without CORS headers", async () => {
    const origin = await request(app).get(projectsPath).set("Origin", "http://localhost:3001");
    const preflight = await request(app)
      .options(manifestPath)
      .set("Origin", "http://localhost:3001")
      .set("Access-Control-Request-Method", "GET");

    for (const response of [origin, preflight]) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(response.headers["access-control-allow-origin"]).toBeUndefined();
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
      expect(response.headers["cache-control"]).toBe("no-store");
    }
  });

  it("ignores cookies and requires one bearer authority on data routes", async () => {
    const response = await request(app)
      .get(projectsPath)
      .set("Cookie", "better-auth.session_token=ignored");
    const head = await request(app).head(projectsPath);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
    expect(response.headers["www-authenticate"]).toBe('Bearer realm="tooling"');
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(head.status).toBe(401);
    expect(head.text).toBeUndefined();
  });

  it("rejects malformed queries and unsupported methods on the closed route set", async () => {
    const malformed = await request(app).get(`${projectsPath}?limit=20&limit=21`);
    const unsupported = await request(app).post(projectsPath);

    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
    expect(malformed.headers["www-authenticate"]).toBeUndefined();
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.allow).toBe("GET, HEAD, OPTIONS");
    expect(unsupported.body.error.code).toBe("NOT_FOUND");
  });
});

describe("Preview HTTP isolation", () => {
  const path =
    "/api/preview/v1/projects/019fae8b-1234-7000-8000-000000000001/environments/main/collections/posts/entries/019fae8b-1234-7000-8000-000000000002/draft?locale=gu";

  it("serves dedicated Preview-only OpenAPI and interactive reference", async () => {
    const specification = await request(app)
      .get("/api/preview/v1/openapi.json")
      .set("Origin", "https://consumer.example");
    const reference = await request(app).get("/api/preview/v1/docs");

    expect(specification.status).toBe(200);
    expect(specification.headers["access-control-allow-origin"]).toBe("*");
    expect(specification.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(specification.headers["referrer-policy"]).toBe("no-referrer");
    expect(specification.text).toBe(expectedPublicArtifact("preview/v1"));
    expect(specification.body.info.title).toBe("Framer for Devs Preview API");
    expect(Object.keys(specification.body.paths)).toHaveLength(2);
    expect(JSON.stringify(specification.body)).not.toContain("DELIVERY_CURSOR_STALE");
    expect(reference.status).toBe(200);
    expect(reference.text).toContain("Framer for Devs Preview API");
    expect(reference.text).toContain("/api/preview/v1/openapi.json");
  });

  it("validates wildcard non-credentialed Preview preflight without authentication", async () => {
    const allowed = await request(app)
      .options(path)
      .set("Origin", "https://consumer.example")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Authorization, Traceparent, X-Request-Id");
    const deniedHeader = await request(app)
      .options(path)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Cookie");
    const deniedMethod = await request(app)
      .options(path)
      .set("Access-Control-Request-Method", "POST");

    expect(allowed.status).toBe(204);
    expect(allowed.headers["access-control-allow-origin"]).toBe("*");
    expect(allowed.headers["access-control-allow-headers"]).toBe(
      "Authorization, Traceparent, X-Request-Id",
    );
    expect(deniedHeader.status).toBe(403);
    expect(deniedHeader.body.error.code).toBe("FORBIDDEN");
    expect(deniedMethod.status).toBe(403);
  });

  it("keeps Preview content disabled behind its independent rollout gate", async () => {
    const response = await request(createApp({ previewApiEnabled: false })).get(path);

    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers.expires).toBe("0");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers.etag).toBeUndefined();
    expect(response.headers["last-modified"]).toBeUndefined();
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("requires bearer authentication before resource lookup and ignores cookies", async () => {
    const enabledApp = createApp({ previewApiEnabled: true });
    const missing = await request(enabledApp).get(path);
    const foreign = await request(enabledApp).get(
      path.replace("019fae8b-1234-7000-8000-000000000001", randomUUID()),
    );
    const cookieOnly = await request(enabledApp).get(path).set("Cookie", "session=ignored");
    const malformed = await request(enabledApp).get(path).set("Authorization", "Basic secret");

    for (const response of [missing, foreign, cookieOnly, malformed]) {
      expect(response.status).toBe(401);
      expect(response.headers["www-authenticate"]).toBe('Bearer realm="preview"');
      expect(response.headers["cache-control"]).toBe("private, no-store, max-age=0");
      expect(response.headers["access-control-allow-origin"]).toBe("*");
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
      expect(response.headers.etag).toBeUndefined();
    }
    expect(missing.body.error.code).toBe("UNAUTHORIZED");
    expect(foreign.body.error.code).toBe("UNAUTHORIZED");
    expect(cookieOnly.body.error.code).toBe("UNAUTHORIZED");
    expect(malformed.body.error.code).toBe("CREDENTIAL_INVALID");
  });

  it("keeps HEAD bodyless with full security headers and rejects unknown methods", async () => {
    const enabledApp = createApp({ previewApiEnabled: true });
    const head = await request(enabledApp).head(path);
    const method = await request(enabledApp).post(path);

    expect(head.status).toBe(401);
    expect(head.text).toBeUndefined();
    expect(head.headers["www-authenticate"]).toBe('Bearer realm="preview"');
    expect(head.headers["cache-control"]).toBe("private, no-store, max-age=0");
    expect(method.status).toBe(405);
    expect(method.headers.allow).toBe("GET, HEAD, OPTIONS");
    expect(method.body.error.code).toBe("NOT_FOUND");
  });
});

describe.sequential("Better Auth foundation", () => {
  it("uses environment-appropriate cookie defaults", () => {
    expect(getDefaultCookieAttributes("development")).toEqual({
      sameSite: "lax",
      secure: false,
      httpOnly: true,
    });
    expect(getDefaultCookieAttributes("test")).toEqual({
      sameSite: "lax",
      secure: false,
      httpOnly: true,
    });
    expect(getDefaultCookieAttributes("production")).toEqual({
      sameSite: "none",
      secure: true,
      httpOnly: true,
    });
  });

  it("signs up a user and creates an authenticated session", async () => {
    const email = makeEmail();
    const agent = request.agent(app);
    const signUp = await agent
      .post("/api/auth/sign-up/email")
      .set("Origin", "http://localhost:3001")
      .send({ name: "M0 Test User", email, password });

    expect(signUp.status).toBe(200);
    expect(signUp.headers["x-request-id"]).toBeTypeOf("string");
    expect(signUp.body.ok).toBeUndefined();
    expect(signUp.body.user.email).toBe(email);
    const setCookie = String(signUp.headers["set-cookie"] ?? "");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).not.toContain("Secure");

    const currentSession = await agent
      .get("/api/auth/get-session")
      .set("Origin", "http://localhost:3001");

    expect(currentSession.status).toBe(200);
    expect(currentSession.body.user.email).toBe(email);
  });

  it("rejects duplicate sign-up without creating another user", async () => {
    const email = makeEmail();
    await createTestUser(email);

    const duplicate = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Origin", "http://localhost:3001")
      .send({ name: "Duplicate", email, password });

    expect(duplicate.status).toBe(422);
    expect(duplicate.body.code).toBeTypeOf("string");

    const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    expect(rows).toHaveLength(1);
  });

  it("returns the same public failure for an unknown account and a wrong password", async () => {
    const email = makeEmail();
    await createTestUser(email);

    const wrongPassword = await request(app)
      .post("/api/auth/sign-in/email")
      .set("Origin", "http://localhost:3001")
      .send({ email, password: "wrong-password" });
    const unknownAccount = await request(app)
      .post("/api/auth/sign-in/email")
      .set("Origin", "http://localhost:3001")
      .send({ email: makeEmail(), password: "wrong-password" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body.code).toBe(unknownAccount.body.code);
    expect(wrongPassword.body.message).toBe(unknownAccount.body.message);
  });

  it("signs in with valid credentials and authorizes the protected procedure", async () => {
    const email = makeEmail();
    const agent = await createTestUser(email);
    await agent.post("/api/auth/sign-out").set("Origin", "http://localhost:3001");

    const signIn = await agent
      .post("/api/auth/sign-in/email")
      .set("Origin", "http://localhost:3001")
      .send({ email, password });
    const privateData = await agent.post("/rpc/privateData").send({});

    expect(signIn.status).toBe(200);
    expect(signIn.body.user.email).toBe(email);
    expect(privateData.status).toBe(200);
    expect(privateData.body.json.data.user.email).toBe(email);
  });

  it("invalidates the session after sign-out", async () => {
    const email = makeEmail();
    const agent = await createTestUser(email);

    const signOut = await agent.post("/api/auth/sign-out").set("Origin", "http://localhost:3001");
    const currentSession = await agent
      .get("/api/auth/get-session")
      .set("Origin", "http://localhost:3001");

    expect(signOut.status).toBe(200);
    expect(currentSession.status).toBe(200);
    expect(currentSession.body).toBeNull();
  });

  it("rejects a database-expired session", async () => {
    const email = makeEmail();
    const agent = await createTestUser(email);
    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    expect(createdUser).toBeDefined();
    if (!createdUser) return;

    await db
      .update(session)
      .set({ expiresAt: new Date(0) })
      .where(eq(session.userId, createdUser.id));

    const currentSession = await agent
      .get("/api/auth/get-session")
      .set("Origin", "http://localhost:3001");

    expect(currentSession.status).toBe(200);
    expect(currentSession.body).toBeNull();
  });

  it("refreshes a session whose update age has elapsed", async () => {
    const email = makeEmail();
    const agent = await createTestUser(email);
    const [createdUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    expect(createdUser).toBeDefined();
    if (!createdUser) return;

    const staleTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const refreshThreshold = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000 - 1000);
    await db
      .update(session)
      .set({ expiresAt: refreshThreshold, updatedAt: staleTime })
      .where(eq(session.userId, createdUser.id));

    const currentSession = await agent
      .get("/api/auth/get-session")
      .set("Origin", "http://localhost:3001");
    const [refreshedSession] = await db
      .select({ expiresAt: session.expiresAt, updatedAt: session.updatedAt })
      .from(session)
      .where(and(eq(session.userId, createdUser.id), sql`${session.expiresAt} > now()`))
      .limit(1);

    expect(currentSession.status).toBe(200);
    expect(currentSession.body.user.email).toBe(email);
    expect(refreshedSession).toBeDefined();
    expect(refreshedSession?.updatedAt.getTime()).toBeGreaterThan(staleTime.getTime());
    expect(refreshedSession?.expiresAt.getTime()).toBeGreaterThan(refreshThreshold.getTime());
  });
});

describe.sequential("official CLI OAuth device authorization", () => {
  it("keeps every device endpoint absent while the rollout flag is disabled", async () => {
    const response = await request(app)
      .post("/api/auth/device/code")
      .send({
        client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        scope: CLI_OAUTH_SCOPES.join(" "),
        resource: env.TOOLING_API_RESOURCE,
      });

    expect(response.status).toBe(404);
  });

  it("idempotently provisions one immutable public client and Tooling resource link", async () => {
    const seededAt = new Date("2026-08-22T00:00:00.000Z");
    await ensureOfficialCliOAuthAuthority({ enabled: true, now: seededAt });
    await ensureOfficialCliOAuthAuthority({ enabled: true, now: seededAt });

    const clients = await db
      .select()
      .from(oauthClient)
      .where(eq(oauthClient.clientId, OFFICIAL_CLI_OAUTH_CLIENT_ID));
    const resources = await db
      .select()
      .from(oauthResource)
      .where(eq(oauthResource.identifier, env.TOOLING_API_RESOURCE));
    const links = await db
      .select()
      .from(oauthClientResource)
      .where(
        and(
          eq(oauthClientResource.clientId, OFFICIAL_CLI_OAUTH_CLIENT_ID),
          eq(oauthClientResource.resourceId, env.TOOLING_API_RESOURCE),
        ),
      );

    expect(clients).toHaveLength(1);
    expect(clients[0]).toEqual(
      expect.objectContaining({
        clientId: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        clientSecret: null,
        disabled: false,
        skipConsent: false,
        tokenEndpointAuthMethod: "none",
        applicationType: "native",
        redirectUris: [],
        scopes: [...CLI_OAUTH_SCOPES],
        grantTypes: [...CLI_OAUTH_GRANT_TYPES],
      }),
    );
    expect(resources).toHaveLength(1);
    expect(resources[0]).toEqual(
      expect.objectContaining({
        identifier: env.TOOLING_API_RESOURCE,
        accessTokenTtl: 600,
        refreshTokenTtl: 2_592_000,
        allowedScopes: [...CLI_OAUTH_SCOPES],
        disabled: false,
      }),
    );
    expect(links).toHaveLength(1);
  });

  it("denies dynamic OAuth client registration", async () => {
    await ensureOfficialCliOAuthAuthority({ enabled: true });
    const oauthAuth = createAuth({ oauthDeviceAuthorizationEnabled: true });
    const oauthApp = express();
    oauthApp.all("/api/auth{/*path}", toNodeHandler(oauthAuth));

    const response = await request(oauthApp)
      .post("/api/auth/oauth2/register")
      .send({
        client_name: "Untrusted client",
        redirect_uris: ["http://127.0.0.1/callback"],
        token_endpoint_auth_method: "none",
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("access_denied");
  });

  it("issues only an explicitly approved scoped device token and verifies its Tooling claims", async () => {
    await ensureOfficialCliOAuthAuthority({ enabled: true });
    const oauthAuth = createAuth({ oauthDeviceAuthorizationEnabled: true });
    const oauthApp = express();
    oauthApp.all("/api/auth{/*path}", toNodeHandler(oauthAuth));

    const code = await request(oauthApp)
      .post("/api/auth/device/code")
      .send({
        client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        scope: CLI_OAUTH_SCOPES.join(" "),
        resource: env.TOOLING_API_RESOURCE,
      });

    expect(code.status).toBe(200);
    expect(code.body).toEqual(
      expect.objectContaining({
        device_code: expect.any(String),
        user_code: expect.any(String),
        verification_uri: "http://localhost:3001/device",
        expires_in: 600,
        interval: 5,
      }),
    );

    const pending = await request(oauthApp).post("/api/auth/oauth2/token").type("form").send({
      grant_type: CLI_OAUTH_GRANT_TYPES[0],
      device_code: code.body.device_code,
      client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
    });
    expect(pending.status).toBe(400);
    expect(pending.body.error).toBe("authorization_pending");

    const approvedCode = await request(oauthApp)
      .post("/api/auth/device/code")
      .send({
        client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        scope: CLI_OAUTH_SCOPES.join(" "),
        resource: env.TOOLING_API_RESOURCE,
      });
    expect(approvedCode.status).toBe(200);

    const email = makeEmail();
    const browser = request.agent(oauthApp);
    const signUp = await browser
      .post("/api/auth/sign-up/email")
      .set("Origin", "http://localhost:3001")
      .send({ name: "M12 OAuth Test User", email, password });
    expect(signUp.status).toBe(200);
    oauthTestUserIds.add(signUp.body.user.id);

    const verify = await browser
      .get("/api/auth/device")
      .query({ user_code: approvedCode.body.user_code });
    expect(verify.status).toBe(200);
    expect(verify.body).toEqual(
      expect.objectContaining({
        user_code: approvedCode.body.user_code,
        status: "pending",
        client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        scope: CLI_OAUTH_SCOPES.join(" "),
      }),
    );

    const approval = await browser
      .post("/api/auth/device/approve")
      .set("Origin", "http://localhost:3001")
      .send({ userCode: approvedCode.body.user_code });
    expect(approval.status).toBe(200);
    expect(approval.body).toEqual({ success: true });

    const token = await request(oauthApp).post("/api/auth/oauth2/token").type("form").send({
      grant_type: CLI_OAUTH_GRANT_TYPES[0],
      device_code: approvedCode.body.device_code,
      client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
    });
    expect(token.status).toBe(200);
    expect(token.body).toEqual(
      expect.objectContaining({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        id_token: expect.any(String),
        token_type: "Bearer",
        expires_in: 600,
      }),
    );
    expect(String(token.body.scope).split(" ")).toEqual(
      expect.arrayContaining([...CLI_OAUTH_SCOPES]),
    );

    const verifyAccessToken = makeToolingOAuthAccessTokenVerifier({
      authInstance: oauthAuth,
      enabled: true,
      issuer: "http://localhost:3000/api/auth",
      resource: env.TOOLING_API_RESOURCE,
    });
    const principal = await verifyAccessToken(token.body.access_token);
    expect(principal).toEqual(
      expect.objectContaining({
        kind: "oauth_user",
        userId: signUp.body.user.id,
        clientId: OFFICIAL_CLI_OAUTH_CLIENT_ID,
      }),
    );
    expect(principal?.scopes.includes("tooling:read")).toBe(true);

    const [header, payload, signature] = String(token.body.access_token).split(".");
    expect(header).toBeDefined();
    expect(payload).toBeDefined();
    expect(signature).toBeDefined();
    if (header === undefined || payload === undefined || signature === undefined) return;
    const tamperedSignature = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    await expect(
      verifyAccessToken(`${header}.${payload}.${tamperedSignature}`),
    ).resolves.toBeNull();

    const refreshed = await request(oauthApp).post("/api/auth/oauth2/token").type("form").send({
      grant_type: "refresh_token",
      refresh_token: token.body.refresh_token,
      client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
      resource: env.TOOLING_API_RESOURCE,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refresh_token).toEqual(expect.any(String));
    expect(refreshed.body.refresh_token).not.toBe(token.body.refresh_token);
    await expect(verifyAccessToken(refreshed.body.access_token)).resolves.toEqual(
      expect.objectContaining({ userId: signUp.body.user.id }),
    );

    const replay = await request(oauthApp).post("/api/auth/oauth2/token").type("form").send({
      grant_type: "refresh_token",
      refresh_token: token.body.refresh_token,
      client_id: OFFICIAL_CLI_OAUTH_CLIENT_ID,
      resource: env.TOOLING_API_RESOURCE,
    });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
  });
});

describe("database connectivity", () => {
  it("executes a read-only query against PostgreSQL", async () => {
    const result = await db.execute(sql`select 1 as value`);

    expect(result.rows).toEqual([{ value: 1 }]);
  });

  it("fails safely when a database is unreachable", async () => {
    const unreachable = createDb(
      "postgresql://postgres:invalid@127.0.0.1:65432/framerfordevs?connect_timeout=1",
    );

    await expect(unreachable.execute(sql`select 1`)).rejects.toBeDefined();
    await unreachable.$client.end();
  });
});
