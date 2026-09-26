// Proves real registration-derived OAuth claims, audit gating, refresh continuity, and bootstrap authority.

import { randomUUID } from "node:crypto";

import {
  createAuth,
  makeStudioOAuthAccessTokenVerifier,
  type StudioOAuthPrincipal,
} from "@framerfordevs/auth";
import {
  ControlPlanePutStudioRegistrationRequest,
  ControlPlaneSetStudioRuntimeRequest,
} from "@framerfordevs/api/contracts/control-plane/index";
import {
  AuthUserId,
  CreateProjectInput,
  CreateWorkspaceInput,
  EnableCapabilityInput,
  EnvironmentId,
  ProjectId,
} from "@framerfordevs/api/contracts/platform/index";
import { makePlatformRepository } from "@framerfordevs/api/services/platform-repository";
import { makeStudioRepository } from "@framerfordevs/api/services/studio/repository";
import { db } from "@framerfordevs/db";
import { and, eq } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import {
  account,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  session,
  user,
  verification,
} from "@framerfordevs/db/schema/auth";
import {
  controlPlaneCommandReceipt,
  studioRegistration,
} from "@framerfordevs/db/schema/control-plane";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspace,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { createStudioOAuthHarness } from "@framerfordevs/studio-oauth-harness";
import { Effect, Exit, Schema } from "effect";
import { like } from "drizzle-orm";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toNodeHandler } from "better-auth/node";

const apiOrigin = "https://runtime-api.example.test";
const dashboardOrigin = "https://runtime-dashboard.example.test";
const applicationOrigin = "http://127.0.0.1:43218";
const issuer = `${apiOrigin}/api/auth`;
const resource = `${apiOrigin}/api/studio/v1`;
const suffix = randomUUID();
const email = `m18-studio-runtime-${suffix}@example.test`;
const password = "M18-Studio-Runtime-Authority-123!";
const platform = makePlatformRepository({ studioApiOrigin: apiOrigin });
const studio = makeStudioRepository({ apiOrigin });
const runtimeAuth = createAuth({
  apiOrigin,
  dashboardOrigin,
  hostRoutingEnabled: true,
  nodeEnv: "production",
  oauthDeviceAuthorizationEnabled: true,
  oauthRateLimitStorage: {
    consume: () => Promise.resolve({ allowed: true, retryAfter: null }),
  },
  studioOAuthRateLimit: () => Promise.resolve({ allowed: true, retryAfter: null }),
  studioOAuthConsentPolicy: async ({ clientId: currentClientId, userId: currentUserId }) => {
    const result = await Effect.runPromiseExit(
      studio.authorizeOAuth(currentClientId, currentUserId),
    );
    return Exit.isSuccess(result) && result.value.allowed;
  },
});
const verifyStudioToken = makeStudioOAuthAccessTokenVerifier({
  authInstance: runtimeAuth,
  issuer,
  resource,
});
const app = express();
app.all("/api/auth{/*path}", toNodeHandler(runtimeAuth));

let userId = "";
let sessionCookie = "";
let workspaceId = "";
let projectId = "";
let environmentId = "";
let registrationId = "";
let registrationVersion = 0;
let clientId = "";
let harness: ReturnType<typeof createStudioOAuthHarness>;

beforeAll(async () => {
  const signUp = await request(app)
    .post("/api/auth/sign-up/email")
    .set("Host", "runtime-dashboard.example.test")
    .set("Origin", dashboardOrigin)
    .send({ name: "Studio Runtime User", email, password });
  expect(signUp.status).toBe(200);
  userId = signUp.body.user.id;
  sessionCookie = String(signUp.headers["set-cookie"]?.[0] ?? "").split(";", 1)[0] ?? "";
  const actorId = AuthUserId.make(userId);
  const createdWorkspace = await Effect.runPromise(
    platform.createWorkspace(
      actorId,
      Schema.decodeUnknownSync(CreateWorkspaceInput)({ name: `Studio Runtime ${suffix}` }),
      `m18-runtime-workspace-${suffix}`,
    ),
  );
  workspaceId = createdWorkspace.id;
  const createdProject = await Effect.runPromise(
    platform.createProject(
      actorId,
      Schema.decodeUnknownSync(CreateProjectInput)({
        workspaceId: createdWorkspace.id,
        name: "Runtime Project",
        key: `runtime-${suffix}`,
        description: null,
      }),
      `m18-runtime-project-${suffix}`,
    ),
  );
  projectId = createdProject.id;
  environmentId = createdProject.environment.id;
  await Effect.runPromise(
    platform.enableCapability(
      actorId,
      Schema.decodeUnknownSync(EnableCapabilityInput)({
        projectId: createdProject.id,
        capability: "cms",
      }),
      `m18-runtime-cms-${suffix}`,
    ),
  );
  const registered = await Effect.runPromise(
    platform.putStudioRegistration(
      { kind: "user", id: actorId },
      createdProject.id,
      createdProject.environment.id,
      Schema.decodeUnknownSync(ControlPlanePutStudioRegistrationRequest)({
        commandId: randomUUID(),
        expectedVersion: null,
        applicationOrigin,
        mountPath: "/studio",
      }),
      `m18-runtime-register-${suffix}`,
    ),
  );
  const activated = await Effect.runPromise(
    platform.setStudioRuntime(
      { kind: "user", id: actorId },
      createdProject.id,
      createdProject.environment.id,
      Schema.decodeUnknownSync(ControlPlaneSetStudioRuntimeRequest)({
        commandId: randomUUID(),
        expectedVersion: registered.registration.version,
        enabled: true,
      }),
      `m18-runtime-activate-${suffix}`,
    ),
  );
  registrationId = activated.registration.id;
  registrationVersion = activated.registration.version;
  clientId = `ffd-studio-v1-${registrationId}`;
  harness = createStudioOAuthHarness({
    issuer,
    dashboardOrigin,
    clientId,
    redirectUri: `${applicationOrigin}/studio/auth/callback`,
    resource,
    bootstrapUrl: `${resource}/projects/${projectId}/environments/${environmentId}/bootstrap`,
  });
});

afterAll(async () => {
  if (clientId !== "") {
    await db.delete(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId));
    await db.delete(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, clientId));
    await db.delete(oauthConsent).where(eq(oauthConsent.clientId, clientId));
    await db.delete(verification).where(like(verification.value, `%${clientId}%`));
    await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
  }
  if (projectId !== "") {
    await db
      .delete(controlPlaneCommandReceipt)
      .where(eq(controlPlaneCommandReceipt.projectId, projectId));
    await db.delete(auditEvent).where(eq(auditEvent.projectId, projectId));
    await db.delete(studioRegistration).where(eq(studioRegistration.projectId, projectId));
    await db.delete(projectCapability).where(eq(projectCapability.projectId, projectId));
    await db.delete(projectLocale).where(eq(projectLocale.projectId, projectId));
    await db.delete(projectMembership).where(eq(projectMembership.projectId, projectId));
    await db.delete(environment).where(eq(environment.projectId, projectId));
    await db.delete(project).where(eq(project.id, projectId));
  }
  if (workspaceId !== "") {
    await db.delete(auditEvent).where(eq(auditEvent.workspaceId, workspaceId));
    await db.delete(workspaceMembership).where(eq(workspaceMembership.workspaceId, workspaceId));
    await db.delete(workspace).where(eq(workspace.id, workspaceId));
  }
  if (userId !== "") {
    await db.delete(session).where(eq(session.userId, userId));
    await db.delete(account).where(eq(account.userId, userId));
    await db.delete(user).where(eq(user.id, userId));
  }
});

async function approveAuthorization() {
  const attempt = harness.begin();
  const authorizationUrl = new URL(attempt.authorizationUrl);
  const authorize = await request(app)
    .get(`${authorizationUrl.pathname}${authorizationUrl.search}`)
    .set("Host", "runtime-api.example.test");
  expect(authorize.status).toBe(302);
  const login = harness.continuation(String(authorize.headers.location), "login");
  const resume = await request(app)
    .post("/api/auth/oauth2/continue")
    .set("Host", "runtime-dashboard.example.test")
    .set("Origin", dashboardOrigin)
    .set("Cookie", sessionCookie)
    .send(harness.continueBody(login));
  expect(resume.status).toBe(200);
  const consent = harness.continuation(String(resume.body.url), "consent");
  const projection = await request(app)
    .post("/api/auth/oauth2/public-client-prelogin")
    .set("Host", "runtime-dashboard.example.test")
    .set("Origin", dashboardOrigin)
    .send({ client_id: clientId, oauth_query: consent.oauthQuery });
  expect(projection.status).toBe(200);
  expect(projection.body).toEqual(
    expect.objectContaining({
      client_id: clientId,
      client_name: "Runtime Project Studio",
      client_uri: applicationOrigin,
    }),
  );
  const approval = await request(app)
    .post("/api/auth/oauth2/consent")
    .set("Host", "runtime-dashboard.example.test")
    .set("Origin", dashboardOrigin)
    .set("Cookie", sessionCookie)
    .send(harness.consentBody(consent, true));
  expect(approval.status).toBe(200);
  return { attempt, callback: harness.callback(String(approval.body.url), attempt) };
}

describe.sequential("M18A Studio runtime authority", () => {
  it("gates real token claims on current authority and serves the bounded bootstrap", async () => {
    const { attempt, callback } = await approveAuthorization();
    const token = await request(app)
      .post("/api/auth/oauth2/token")
      .set("Host", "runtime-api.example.test")
      .type("form")
      .send(Object.fromEntries(harness.tokenBody(callback, attempt)));
    expect(token.status, JSON.stringify(token.body)).toBe(200);
    const tokenSet = harness.decodeTokenResponse(token.body);
    const verifiedToken = await runtimeAuth.api.verifyJWT({
      body: { token: tokenSet.accessToken, issuer },
      headers: new Headers({ host: "runtime-api.example.test" }),
    });
    expect(verifiedToken.payload).toEqual(
      expect.objectContaining({ aud: resource, scope: "studio:session offline_access" }),
    );
    const principal = await verifyStudioToken(tokenSet.accessToken);
    expect(principal).toEqual(
      expect.objectContaining({
        kind: "studio_oauth_user",
        userId,
        clientId,
        registrationId,
        registrationVersion,
        projectId,
        environmentId,
        scopes: ["offline_access", "studio:session"],
      }),
    );
    if (principal === null) throw new Error("Expected current Studio principal.");

    const bootstrap = await Effect.runPromise(
      studio.getBootstrap({
        principal,
        projectId: ProjectId.make(projectId),
        environmentId: EnvironmentId.make(environmentId),
      }),
    );
    expect(bootstrap).toEqual(
      expect.objectContaining({
        formatVersion: 1,
        role: "owner",
        effectiveActions: expect.arrayContaining(["project.read", "project.update"]),
        registration: expect.objectContaining({ id: registrationId, version: registrationVersion }),
        project: expect.objectContaining({ id: projectId, name: "Runtime Project" }),
        environment: { id: environmentId, key: "main", name: "main" },
        user: expect.objectContaining({ id: userId, email }),
      }),
    );

    const refresh = await request(app)
      .post("/api/auth/oauth2/token")
      .set("Host", "runtime-api.example.test")
      .type("form")
      .send({
        grant_type: "refresh_token",
        refresh_token: tokenSet.refreshToken,
        client_id: clientId,
        resource,
      });
    expect(refresh.status).toBe(200);
    const refreshed = harness.decodeTokenResponse(refresh.body);
    const refreshedPrincipal = await verifyStudioToken(refreshed.accessToken);
    expect(refreshedPrincipal?.grantId).toBe(principal.grantId);
    expect(refreshedPrincipal?.auditMarkerId).toBe(principal.auditMarkerId);
    const markers = await db
      .select({ id: auditEvent.id })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.projectId, projectId),
          eq(auditEvent.action, "studio.session.established"),
          eq(auditEvent.resourceId, principal.grantId),
        ),
      );
    expect(markers).toEqual([{ id: principal.auditMarkerId }]);

    const revoke = await request(app)
      .post("/api/auth/oauth2/revoke")
      .set("Host", "runtime-api.example.test")
      .type("form")
      .send({
        token: refreshed.refreshToken,
        token_type_hint: "refresh_token",
        client_id: clientId,
      });
    expect(revoke.status).toBe(200);
    const deniedAfterRevocation = await Effect.runPromiseExit(
      studio.getBootstrap({
        principal: refreshedPrincipal ?? principal,
        projectId: ProjectId.make(projectId),
        environmentId: EnvironmentId.make(environmentId),
      }),
    );
    expect(Exit.isFailure(deniedAfterRevocation)).toBe(true);
    if (Exit.isFailure(deniedAfterRevocation)) {
      expect(String(deniedAfterRevocation.cause)).toContain("StudioGrantInvalidFailure");
    }
  });

  it("revalidates the exact active grant beyond eight concurrent sessions", async () => {
    const principals: Array<StudioOAuthPrincipal> = [];
    for (let index = 0; index < 9; index += 1) {
      const { attempt, callback } = await approveAuthorization();
      const token = await request(app)
        .post("/api/auth/oauth2/token")
        .set("Host", "runtime-api.example.test")
        .type("form")
        .send(Object.fromEntries(harness.tokenBody(callback, attempt)));
      expect(token.status, JSON.stringify(token.body)).toBe(200);
      const tokenSet = harness.decodeTokenResponse(token.body);
      const principal = await verifyStudioToken(tokenSet.accessToken);
      if (principal === null) throw new Error(`Expected Studio principal ${index + 1}.`);
      principals.push(principal);
    }

    expect(new Set(principals.map(({ grantId }) => grantId)).size).toBe(9);
    const latestPrincipal = principals.at(-1);
    if (latestPrincipal === undefined) throw new Error("Expected the ninth Studio principal.");
    await expect(
      Effect.runPromise(
        studio.getBootstrap({
          principal: latestPrincipal,
          projectId: ProjectId.make(projectId),
          environmentId: EnvironmentId.make(environmentId),
        }),
      ),
    ).resolves.toEqual(expect.objectContaining({ formatVersion: 1 }));
  });

  it("revokes refresh and denies bootstrap immediately after user deactivation", async () => {
    const actorId = AuthUserId.make(userId);
    const deactivated = await Effect.runPromise(
      platform.setStudioRuntime(
        { kind: "user", id: actorId },
        ProjectId.make(projectId),
        EnvironmentId.make(environmentId),
        Schema.decodeUnknownSync(ControlPlaneSetStudioRuntimeRequest)({
          commandId: randomUUID(),
          expectedVersion: registrationVersion,
          enabled: false,
        }),
        `m18-runtime-deactivate-${suffix}`,
      ),
    );
    expect(deactivated.runtimeStatus).toBe("inactive");
    const [client] = await db
      .select({ disabled: oauthClient.disabled })
      .from(oauthClient)
      .where(eq(oauthClient.clientId, clientId))
      .limit(1);
    expect(client?.disabled).toBe(true);
    const consents = await db
      .select()
      .from(oauthConsent)
      .where(eq(oauthConsent.clientId, clientId));
    expect(consents).toEqual([]);

    const lastRefresh = await db
      .select({ revoked: oauthRefreshToken.revoked })
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.clientId, clientId));
    expect(lastRefresh.length).toBeGreaterThan(0);
    expect(lastRefresh.every(({ revoked }) => revoked !== null)).toBe(true);

    const principal = {
      kind: "studio_oauth_user" as const,
      userId,
      clientId,
      registrationId,
      registrationVersion,
      projectId,
      environmentId,
      grantId: "00000000-0000-5000-8000-000000000001",
      auditMarkerId: "00000000-0000-5000-8000-000000000002",
      scopes: ["offline_access", "studio:session"],
      expiresAtEpochSeconds: Math.floor(Date.now() / 1_000) + 60,
    };
    const denied = await Effect.runPromiseExit(
      studio.getBootstrap({
        principal,
        projectId: ProjectId.make(projectId),
        environmentId: EnvironmentId.make(environmentId),
      }),
    );
    expect(Exit.isFailure(denied)).toBe(true);
    if (Exit.isFailure(denied)) {
      expect(String(denied.cause)).toContain("StudioRegistrationInactiveFailure");
    }
  });
});
