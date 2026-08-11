import { randomUUID } from "node:crypto";

import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import { getDefaultCookieAttributes } from "@framerfordevs/auth";
import { createDb, db } from "@framerfordevs/db";
import { session, user } from "@framerfordevs/db/schema/auth";
import { and, eq, like, sql } from "drizzle-orm";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "./app";

const app = createApp();
const testEmailPattern = "m0-%@example.test";
const password = "M0-Test-Password-123!";

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
