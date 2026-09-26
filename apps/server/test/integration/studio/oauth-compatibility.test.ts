// Proves pinned Better Auth public-client Code + S256 PKCE behavior before M18A authority work.

import { randomUUID } from "node:crypto";

import { createAuth } from "@framerfordevs/auth";
import { db } from "@framerfordevs/db";
import {
  oauthAccessToken,
  oauthClient,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  oauthResource,
  user,
  verification,
} from "@framerfordevs/db/schema/auth";
import { createStudioOAuthHarness } from "@framerfordevs/studio-oauth-harness";
import { eq, like } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const apiOrigin = "https://api.example.test";
const dashboardOrigin = "https://dashboard.example.test";
const issuer = `${apiOrigin}/api/auth`;
const registrationId = randomUUID();
const clientId = `ffd-studio-v1-${registrationId}`;
const resource = `${apiOrigin}/api/studio/v1`;
const redirectUri = "http://127.0.0.1:43127/studio/auth/callback";
const bootstrapUrl = `${resource}/projects/test-project/environments/test-environment/bootstrap`;
const email = `m18-studio-oauth-${registrationId}@example.test`;
const password = "M18-Studio-OAuth-Compatibility-123!";
const harness = createStudioOAuthHarness({
  issuer,
  dashboardOrigin,
  clientId,
  redirectUri,
  resource,
  bootstrapUrl,
});
const grantId = `studio-grant-${registrationId}`;
const claimInvocations: Array<{
  readonly clientId: string;
  readonly grantType: string | undefined;
  readonly resources: string[] | undefined;
  readonly userId: string | undefined;
}> = [];
let policyAllowsIssuance = true;
let preConsentPolicyAllows = true;
let auditPersistenceAvailable = true;
let oauthIngressAllowed = true;
const rateLimitInvocations: Array<{
  readonly key: string;
  readonly max: number;
  readonly window: number;
}> = [];
const exactRateLimitInvocations: Array<{
  readonly policy: "global" | "client" | "user";
  readonly clientId: string;
  readonly userId?: string;
}> = [];
const oauthAuth = createAuth({
  apiOrigin,
  dashboardOrigin,
  hostRoutingEnabled: true,
  nodeEnv: "production",
  oauthDeviceAuthorizationEnabled: true,
  oauthRateLimitStorage: {
    consume: (key, rule) => {
      rateLimitInvocations.push({ key, max: rule.max, window: rule.window });
      return Promise.resolve({
        allowed: oauthIngressAllowed,
        retryAfter: oauthIngressAllowed ? null : 17,
      });
    },
  },
  studioOAuthRateLimit: (input) => {
    exactRateLimitInvocations.push(input);
    return Promise.resolve({ allowed: true, retryAfter: null });
  },
  studioOAuthConsentPolicy: () => Promise.resolve(preConsentPolicyAllows),
  studioOAuthAccessTokenClaims: (input) => {
    if (!policyAllowsIssuance) {
      throw new APIError("FORBIDDEN", {
        error: "access_denied",
        error_description: "Studio authorization is no longer available.",
      });
    }
    if (!auditPersistenceAvailable) {
      throw new APIError("SERVICE_UNAVAILABLE", {
        error: "temporarily_unavailable",
        error_description: "Studio authorization could not be established.",
      });
    }
    claimInvocations.push({
      clientId: input.client.clientId,
      grantType: input.grantType,
      resources: input.resources,
      userId: input.user?.id,
    });
    return Promise.resolve({
      studio_grant_id: grantId,
      studio_registration_version: input.metadata?.registrationVersion,
    });
  },
});
const oauthApp = express();
oauthApp.all("/api/auth{/*path}", toNodeHandler(oauthAuth));
let sessionCookie = "";
let userId = "";

beforeAll(async () => {
  const now = new Date("2026-09-21T12:00:00.000Z");
  await db
    .insert(oauthResource)
    .values({
      id: `oauth-resource-${registrationId}`,
      identifier: resource,
      name: "M18 Studio compatibility resource",
      accessTokenTtl: 300,
      refreshTokenTtl: 28_800,
      allowedScopes: ["studio:session", "offline_access"],
      dpopBoundAccessTokensRequired: false,
      disabled: false,
      createdAt: now,
      updatedAt: now,
      policyVersion: 1,
    })
    .onConflictDoUpdate({
      target: oauthResource.identifier,
      set: {
        name: "M18 Studio compatibility resource",
        accessTokenTtl: 300,
        refreshTokenTtl: 28_800,
        allowedScopes: ["studio:session", "offline_access"],
        disabled: false,
        updatedAt: now,
      },
    });
  await db.insert(oauthClient).values({
    id: `oauth-client-${registrationId}`,
    clientId,
    clientSecret: null,
    disabled: false,
    skipConsent: false,
    enableEndSession: false,
    subjectType: "public",
    scopes: ["studio:session", "offline_access"],
    clientCredentialsScopes: [],
    createdAt: now,
    updatedAt: now,
    name: "M18 Studio compatibility client",
    redirectUris: [redirectUri],
    postLogoutRedirectUris: [],
    tokenEndpointAuthMethod: "none",
    applicationType: "web",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    requirePKCE: true,
    dpopBoundAccessTokens: false,
    referenceId: registrationId,
    metadata: { kind: "studio", registrationVersion: 1 },
  });
  await db.insert(oauthClientResource).values({
    id: `oauth-client-resource-${registrationId}`,
    clientId,
    resourceId: resource,
    createdAt: now,
  });

  const signUp = await request(oauthApp)
    .post("/api/auth/sign-up/email")
    .set("Host", "dashboard.example.test")
    .set("Origin", dashboardOrigin)
    .send({ name: "M18 Studio Compatibility User", email, password });
  expect(signUp.status).toBe(200);
  userId = signUp.body.user.id;
  sessionCookie = String(signUp.headers["set-cookie"]?.[0] ?? "").split(";", 1)[0] ?? "";
  expect(sessionCookie).not.toBe("");
});

afterAll(async () => {
  await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId));
  await db.delete(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, clientId));
  await db.delete(oauthConsent).where(eq(oauthConsent.clientId, clientId));
  await db.delete(verification).where(like(verification.value, `%${clientId}%`));
  await db.delete(oauthClientResource).where(eq(oauthClientResource.clientId, clientId));
  await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
  if (userId !== "") await db.delete(user).where(eq(user.id, userId));
});

function locationPath(location: string) {
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

async function withPolicyDenied<T>(effect: () => Promise<T>) {
  policyAllowsIssuance = false;
  try {
    return await effect();
  } finally {
    policyAllowsIssuance = true;
  }
}

async function withAuditUnavailable<T>(effect: () => Promise<T>) {
  auditPersistenceAvailable = false;
  try {
    return await effect();
  } finally {
    auditPersistenceAvailable = true;
  }
}

async function withOAuthIngressDenied<T>(effect: () => Promise<T>) {
  oauthIngressAllowed = false;
  try {
    return await effect();
  } finally {
    oauthIngressAllowed = true;
  }
}

async function approveAuthorization() {
  const attempt = harness.begin();
  const authorizationUrl = new URL(attempt.authorizationUrl);
  const authorize = await request(oauthApp)
    .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
    .set("Host", "api.example.test");
  const login = harness.continuation(String(authorize.headers.location), "login");
  const resume = await request(oauthApp)
    .post("/api/auth/oauth2/continue")
    .set("Host", "dashboard.example.test")
    .set("Origin", dashboardOrigin)
    .set("Cookie", sessionCookie)
    .send(harness.continueBody(login));
  const consent = harness.continuation(String(resume.body.url), "consent");
  const approval = await request(oauthApp)
    .post("/api/auth/oauth2/consent")
    .set("Host", "dashboard.example.test")
    .set("Origin", dashboardOrigin)
    .set("Cookie", sessionCookie)
    .send(harness.consentBody(consent, true));
  return { attempt, callback: harness.callback(String(approval.body.url), attempt) };
}

describe.sequential("M18A Studio OAuth provider compatibility", () => {
  it("drives a public Code + S256 PKCE grant through forced acknowledgement", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    const authorize = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test");

    expect(authorize.status).toBe(302);
    const login = harness.continuation(String(authorize.headers.location), "login");

    const resume = await request(oauthApp)
      .post("/api/auth/oauth2/continue")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.continueBody(login));

    expect(resume.status).toBe(200);
    const consent = harness.continuation(String(resume.body.url), "consent");
    const approval = await request(oauthApp)
      .post("/api/auth/oauth2/consent")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.consentBody(consent, true));

    expect(approval.status).toBe(200);
    const callback = harness.callback(String(approval.body.url), attempt);
    const token = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send(Object.fromEntries(harness.tokenBody(callback, attempt)));

    expect(token.status).toBe(200);
    const tokenSet = harness.decodeTokenResponse(token.body);
    expect(tokenSet.scope.split(" ").sort()).toEqual(["offline_access", "studio:session"]);

    const verificationResult = await oauthAuth.api.verifyJWT({
      body: { token: tokenSet.accessToken, issuer },
      headers: new Headers({ host: "api.example.test" }),
    });
    expect(verificationResult.payload).toEqual(
      expect.objectContaining({
        aud: resource,
        azp: clientId,
        client_id: clientId,
        studio_grant_id: grantId,
        studio_registration_version: 1,
        sub: userId,
      }),
    );
    expect(String(verificationResult.payload?.scope).split(" ").sort()).toEqual([
      "offline_access",
      "studio:session",
    ]);
    const issuedAt = verificationResult.payload?.iat;
    const expiresAt = verificationResult.payload?.exp;
    expect(typeof issuedAt).toBe("number");
    expect(typeof expiresAt).toBe("number");
    if (typeof issuedAt !== "number" || typeof expiresAt !== "number") {
      throw new Error("Expected bounded Studio token timestamps.");
    }
    expect(expiresAt - issuedAt).toBe(300);

    const [storedRefresh] = await db
      .select({
        resources: oauthRefreshToken.resources,
        scopes: oauthRefreshToken.scopes,
        userId: oauthRefreshToken.userId,
        expiresAt: oauthRefreshToken.expiresAt,
        createdAt: oauthRefreshToken.createdAt,
      })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.clientId, clientId))
      .limit(1);
    expect(storedRefresh).toBeDefined();
    if (storedRefresh === undefined) throw new Error("Expected the Studio refresh-token row.");
    expect(storedRefresh.userId).toBe(userId);
    expect(storedRefresh.resources).toEqual([resource]);
    expect([...storedRefresh.scopes].sort()).toEqual(["offline_access", "studio:session"]);
    expect(storedRefresh.expiresAt.getTime()).toBe(storedRefresh.createdAt.getTime() + 28_800_000);

    const bootstrapRequest = harness.bootstrapRequest(tokenSet.accessToken);
    expect(bootstrapRequest.url).toBe(bootstrapUrl);
    expect(bootstrapRequest.headers.get("authorization")).toBe(`Bearer ${tokenSet.accessToken}`);

    const refresh = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send({
        grant_type: "refresh_token",
        refresh_token: tokenSet.refreshToken,
        client_id: clientId,
        resource,
      });
    expect(refresh.status).toBe(200);
    const refreshedTokenSet = harness.decodeTokenResponse(refresh.body);
    expect(refreshedTokenSet.refreshToken).not.toBe(tokenSet.refreshToken);
    const refreshedVerification = await oauthAuth.api.verifyJWT({
      body: { token: refreshedTokenSet.accessToken, issuer },
      headers: new Headers({ host: "api.example.test" }),
    });
    expect(refreshedVerification.payload).toEqual(
      expect.objectContaining({
        studio_grant_id: grantId,
        studio_registration_version: 1,
      }),
    );
    expect(claimInvocations).toEqual(
      expect.arrayContaining([
        {
          clientId,
          grantType: "authorization_code",
          resources: [resource],
          userId,
        },
        { clientId, grantType: "refresh_token", resources: [resource], userId },
      ]),
    );
    expect(exactRateLimitInvocations).toEqual(
      expect.arrayContaining([
        { policy: "client", clientId },
        { policy: "user", clientId, userId },
      ]),
    );

    const reuse = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send({
        grant_type: "refresh_token",
        refresh_token: tokenSet.refreshToken,
        client_id: clientId,
        resource,
      });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toBe("invalid_grant");

    const compromisedFamily = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send({
        grant_type: "refresh_token",
        refresh_token: refreshedTokenSet.refreshToken,
        client_id: clientId,
        resource,
      });
    expect(compromisedFamily.status).toBe(400);
    expect(compromisedFamily.body.error).toBe("invalid_grant");
  });

  it("denies current user policy before acknowledgement and code issuance", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    const authorize = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test");
    const login = harness.continuation(String(authorize.headers.location), "login");
    preConsentPolicyAllows = false;
    try {
      const denied = await request(oauthApp)
        .post("/api/auth/oauth2/continue")
        .set("Host", "dashboard.example.test")
        .set("Origin", dashboardOrigin)
        .set("Cookie", sessionCookie)
        .send(harness.continueBody(login));
      expect(denied.status).toBe(403);
      expect(denied.body.error).toBe("access_denied");
      expect(String(denied.body)).not.toContain("code");
    } finally {
      preConsentPolicyAllows = true;
    }
  });

  it("rejects authorization without S256 PKCE before establishing a session", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    authorizationUrl.searchParams.delete("code_challenge");
    authorizationUrl.searchParams.delete("code_challenge_method");

    const denied = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test");

    expect(denied.status).toBe(302);
    const callback = new URL(String(denied.headers.location));
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get("error")).toBe("invalid_request");
    expect(callback.searchParams.get("state")).toBe(attempt.state);
  });

  it("rejects an incorrect PKCE verifier", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    const authorize = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test");
    const login = harness.continuation(String(authorize.headers.location), "login");
    const resume = await request(oauthApp)
      .post("/api/auth/oauth2/continue")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.continueBody(login));
    const consent = harness.continuation(String(resume.body.url), "consent");
    const approval = await request(oauthApp)
      .post("/api/auth/oauth2/consent")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.consentBody(consent, true));
    const callback = harness.callback(String(approval.body.url), attempt);
    const wrongVerifier = harness.tokenBody(callback, attempt);
    wrongVerifier.set("code_verifier", "wrong-verifier-value-that-is-long-enough-for-pkce");

    const denied = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send(Object.fromEntries(wrongVerifier));

    expect(denied.status).toBe(401);
    expect(denied.body.error).toBe("invalid_request");
  });

  it("blocks token bytes and refresh persistence when current policy denies issuance", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    const authorize = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test");
    const login = harness.continuation(String(authorize.headers.location), "login");
    const resume = await request(oauthApp)
      .post("/api/auth/oauth2/continue")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.continueBody(login));
    const consent = harness.continuation(String(resume.body.url), "consent");
    const approval = await request(oauthApp)
      .post("/api/auth/oauth2/consent")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.consentBody(consent, true));
    const callback = harness.callback(String(approval.body.url), attempt);
    const before = await db
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.clientId, clientId));

    const denied = await withPolicyDenied(() =>
      request(oauthApp)
        .post("/api/auth/oauth2/token")
        .set("Host", "api.example.test")
        .type("form")
        .send(Object.fromEntries(harness.tokenBody(callback, attempt))),
    );

    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({
      error: "access_denied",
      error_description: "Studio authorization is no longer available.",
    });
    expect(denied.body).not.toHaveProperty("access_token");
    expect(denied.body).not.toHaveProperty("refresh_token");
    const after = await db
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.clientId, clientId));
    expect(after).toEqual(before);
  });

  it("gates token bytes and refresh persistence on synchronous audit success", async () => {
    const { attempt, callback } = await approveAuthorization();
    const before = await db
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.clientId, clientId));

    const denied = await withAuditUnavailable(() =>
      request(oauthApp)
        .post("/api/auth/oauth2/token")
        .set("Host", "api.example.test")
        .type("form")
        .send(Object.fromEntries(harness.tokenBody(callback, attempt))),
    );

    expect(denied.status).toBe(503);
    expect(denied.body).toEqual({
      error: "temporarily_unavailable",
      error_description: "Studio authorization could not be established.",
    });
    expect(denied.body).not.toHaveProperty("access_token");
    expect(denied.body).not.toHaveProperty("refresh_token");
    const after = await db
      .select({ id: oauthRefreshToken.id })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.clientId, clientId));
    expect(after).toEqual(before);
  });

  it("revokes a public client's refresh authority through the native endpoint", async () => {
    const { attempt, callback } = await approveAuthorization();
    const token = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send(Object.fromEntries(harness.tokenBody(callback, attempt)));
    const tokenSet = harness.decodeTokenResponse(token.body);

    const revoke = await request(oauthApp)
      .post("/api/auth/oauth2/revoke")
      .set("Host", "api.example.test")
      .type("form")
      .send({
        token: tokenSet.refreshToken,
        token_type_hint: "refresh_token",
        client_id: clientId,
      });
    expect(revoke.status).toBe(200);
    expect(revoke.body).toBe("");

    const denied = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send({
        grant_type: "refresh_token",
        refresh_token: tokenSet.refreshToken,
        client_id: clientId,
        resource,
      });
    expect(denied.status).toBe(400);
    expect(denied.body.error).toBe("invalid_grant");
  });

  it("rejects authorization-code replay", async () => {
    const { attempt, callback } = await approveAuthorization();
    const body = Object.fromEntries(harness.tokenBody(callback, attempt));
    const token = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send(body);
    expect(token.status).toBe(200);

    const replay = await request(oauthApp)
      .post("/api/auth/oauth2/token")
      .set("Host", "api.example.test")
      .type("form")
      .send(body);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_grant");
  });

  it("rejects unregistered redirect, resource, and scope authority", async () => {
    const baseAttempt = harness.begin();
    const invalidRedirect = new URL(baseAttempt.authorizationUrl);
    invalidRedirect.searchParams.set("redirect_uri", "http://127.0.0.1:43128/studio/auth/callback");
    const redirectDenied = await request(oauthApp)
      .get(`${invalidRedirect.pathname}${invalidRedirect.search}`)
      .set("Host", "api.example.test");
    expect(redirectDenied.status).toBe(400);
    expect(redirectDenied.headers.location).toBeUndefined();
    expect(redirectDenied.body).toEqual({
      error: "invalid_request",
      error_description: "Invalid Studio authorization request.",
    });

    const duplicateClient = new URL(baseAttempt.authorizationUrl);
    duplicateClient.searchParams.append("client_id", "attacker-selected-client");
    const duplicateDenied = await request(oauthApp)
      .get(`${duplicateClient.pathname}${duplicateClient.search}`)
      .set("Host", "api.example.test");
    expect(duplicateDenied.status).toBe(400);
    expect(duplicateDenied.headers.location).toBeUndefined();
    expect(duplicateDenied.body.error).toBe("invalid_request");

    const invalidAuthorities: ReadonlyArray<{
      readonly expectedError: string;
      readonly parameter: string;
      readonly value: string;
    }> = [
      {
        parameter: "resource",
        value: "https://other.example.test/api/studio/v1",
        expectedError: "invalid_target",
      },
      {
        parameter: "scope",
        value: "studio:session offline_access project.update",
        expectedError: "invalid_scope",
      },
    ];
    for (const { parameter, value, expectedError } of invalidAuthorities) {
      const attempt = harness.begin();
      const authorizationUrl = new URL(attempt.authorizationUrl);
      authorizationUrl.searchParams.set(parameter, value);
      const denied = await request(oauthApp)
        .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
        .set("Host", "api.example.test");
      expect(denied.status).toBe(302);
      const callback = new URL(String(denied.headers.location));
      expect(callback.origin + callback.pathname).toBe(redirectUri);
      expect(callback.searchParams.get("error")).toBe(expectedError);
      expect(callback.searchParams.get("state")).toBe(attempt.state);
    }
  });

  it("returns a bound callback denial without creating authorization code authority", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    const authorize = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test");
    const login = harness.continuation(String(authorize.headers.location), "login");
    const resume = await request(oauthApp)
      .post("/api/auth/oauth2/continue")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.continueBody(login));
    const consent = harness.continuation(String(resume.body.url), "consent");
    const denial = await request(oauthApp)
      .post("/api/auth/oauth2/consent")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.consentBody(consent, false));

    expect(denial.status).toBe(200);
    const callback = new URL(String(denial.body.url));
    expect(callback.origin + callback.pathname).toBe(redirectUri);
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBe(attempt.state);
    expect(callback.searchParams.has("code")).toBe(false);
  });

  it("uses the atomic shared-storage hook for the installation-wide OAuth guard", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    const denied = await withOAuthIngressDenied(() =>
      request(oauthApp)
        .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
        .set("Host", "api.example.test"),
    );

    expect(denied.status).toBe(429);
    expect(denied.headers["x-retry-after"]).toBe("17");
    expect(
      rateLimitInvocations.some(
        ({ key, max, window }) =>
          key.endsWith("|/oauth2/authorize") && max === 3_000 && window === 60,
      ),
    ).toBe(true);
  });

  it("does not let a prior consent bypass prompt=consent", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    const authorize = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test");
    const login = harness.continuation(String(authorize.headers.location), "login");
    const resume = await request(oauthApp)
      .post("/api/auth/oauth2/continue")
      .set("Host", "dashboard.example.test")
      .set("Origin", dashboardOrigin)
      .set("Cookie", sessionCookie)
      .send(harness.continueBody(login));

    expect(resume.status).toBe(200);
    expect(() => harness.continuation(String(resume.body.url), "consent")).not.toThrow();
    expect(locationPath(String(resume.body.url))).toContain("/oauth/consent?");
  });

  it("rejects a Studio authorization attempt that omits forced acknowledgement", async () => {
    const attempt = harness.begin();
    const authorizationUrl = new URL(attempt.authorizationUrl);
    authorizationUrl.searchParams.delete("prompt");

    const response = await request(oauthApp)
      .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
      .set("Host", "api.example.test")
      .set("Cookie", sessionCookie);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: "invalid_request",
      error_description: "Studio authorization requires explicit user acknowledgement.",
    });
    expect(response.headers.location).toBeUndefined();
  });
});
