import { randomUUID } from "node:crypto";

import { createStudioOAuthHarness } from "@framerfordevs/studio-oauth-harness";
import { config as loadEnv } from "dotenv";
import { Effect, Schema } from "effect";

import { browserTestOrigins } from "../preflight";

const apiOrigin = "http://localhost:3000";
const applicationOrigin = "http://127.0.0.1:43219";
const password = "M18-Studio-Browser-Authority-123!";

export interface StudioBrowserFixture {
  readonly applicationOrigin: string;
  readonly clientId: string;
  readonly email: string;
  readonly environmentId: string;
  readonly harness: ReturnType<typeof createStudioOAuthHarness>;
  readonly password: string;
  readonly projectId: string;
  readonly registrationId: string;
  readonly registrationVersion: number;
  readonly userId: string;
  readonly updateRegistrationOrigin: () => Promise<void>;
  readonly cleanup: () => Promise<void>;
}

export async function createStudioBrowserFixture(): Promise<StudioBrowserFixture> {
  loadEnv({ path: "../../apps/server/.env", quiet: true });
  process.env.NODE_ENV = "test";
  process.env.TOOLING_API_RESOURCE = "http://localhost:3000/api/tooling/v1";
  const [
    { makePlatformRepository },
    contracts,
    database,
    query,
    access,
    auth,
    controlPlane,
    locale,
    platform,
  ] = await Promise.all([
    import("@framerfordevs/api/services/platform-repository"),
    import("@framerfordevs/api/contracts/platform/index"),
    import("@framerfordevs/db"),
    import("@framerfordevs/db/query"),
    import("@framerfordevs/db/schema/access"),
    import("@framerfordevs/db/schema/auth"),
    import("@framerfordevs/db/schema/control-plane"),
    import("@framerfordevs/db/schema/locale"),
    import("@framerfordevs/db/schema/platform"),
  ]);
  const controlPlaneContracts = await import("@framerfordevs/api/contracts/control-plane/index");
  const suffix = randomUUID();
  const email = `m18-studio-browser-${suffix}@example.test`;
  const dashboardOrigin = browserTestOrigins().dashboard.origin;
  const signUp = await fetch(`${dashboardOrigin}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: dashboardOrigin },
    body: JSON.stringify({ name: "Studio Browser User", email, password }),
    redirect: "manual",
  });
  if (!signUp.ok) throw new Error(`Studio browser fixture sign-up failed with ${signUp.status}.`);
  const signUpBody: unknown = await signUp.json();
  const userValue =
    typeof signUpBody === "object" && signUpBody !== null
      ? Reflect.get(signUpBody, "user")
      : undefined;
  const userId =
    typeof userValue === "object" && userValue !== null ? Reflect.get(userValue, "id") : undefined;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("Studio browser fixture sign-up returned no user.");
  }

  const repository = makePlatformRepository({ studioApiOrigin: apiOrigin });
  const actorId = contracts.AuthUserId.make(userId);
  const createdWorkspace = await Effect.runPromise(
    repository.createWorkspace(
      actorId,
      Schema.decodeUnknownSync(contracts.CreateWorkspaceInput)({
        name: `Studio Browser ${suffix}`,
      }),
      `m18-browser-workspace-${suffix}`,
    ),
  );
  const createdProject = await Effect.runPromise(
    repository.createProject(
      actorId,
      Schema.decodeUnknownSync(contracts.CreateProjectInput)({
        workspaceId: createdWorkspace.id,
        name: "Browser Customer Site",
        key: `studio-browser-${suffix}`,
        description: null,
      }),
      `m18-browser-project-${suffix}`,
    ),
  );
  await Effect.runPromise(
    repository.enableCapability(
      actorId,
      Schema.decodeUnknownSync(contracts.EnableCapabilityInput)({
        projectId: createdProject.id,
        capability: "cms",
      }),
      `m18-browser-cms-${suffix}`,
    ),
  );
  const registered = await Effect.runPromise(
    repository.putStudioRegistration(
      { kind: "user", id: actorId },
      createdProject.id,
      createdProject.environment.id,
      Schema.decodeUnknownSync(controlPlaneContracts.ControlPlanePutStudioRegistrationRequest)({
        commandId: randomUUID(),
        expectedVersion: null,
        applicationOrigin,
        mountPath: "/studio",
      }),
      `m18-browser-register-${suffix}`,
    ),
  );
  const activated = await Effect.runPromise(
    repository.setStudioRuntime(
      { kind: "user", id: actorId },
      createdProject.id,
      createdProject.environment.id,
      Schema.decodeUnknownSync(controlPlaneContracts.ControlPlaneSetStudioRuntimeRequest)({
        commandId: randomUUID(),
        expectedVersion: registered.registration.version,
        enabled: true,
      }),
      `m18-browser-activate-${suffix}`,
    ),
  );
  const registrationId = activated.registration.id;
  const clientId = `ffd-studio-v1-${registrationId}`;
  let registrationVersion = activated.registration.version;
  const harness = createStudioOAuthHarness({
    issuer: `${apiOrigin}/api/auth`,
    dashboardOrigin,
    clientId,
    redirectUri: `${applicationOrigin}/studio/auth/callback`,
    resource: `${apiOrigin}/api/studio/v1`,
    bootstrapUrl: `${apiOrigin}/api/studio/v1/projects/${createdProject.id}/environments/${createdProject.environment.id}/bootstrap`,
  });

  const cleanup = async () => {
    await database.db
      .delete(auth.oauthAccessToken)
      .where(query.eq(auth.oauthAccessToken.clientId, clientId));
    await database.db
      .delete(auth.oauthRefreshToken)
      .where(query.eq(auth.oauthRefreshToken.clientId, clientId));
    await database.db
      .delete(auth.oauthConsent)
      .where(query.eq(auth.oauthConsent.clientId, clientId));
    await database.db
      .delete(auth.verification)
      .where(query.sql`${auth.verification.value} like ${`%${clientId}%`}`);
    await database.db.delete(auth.oauthClient).where(query.eq(auth.oauthClient.clientId, clientId));
    await database.db
      .delete(controlPlane.controlPlaneCommandReceipt)
      .where(query.eq(controlPlane.controlPlaneCommandReceipt.projectId, createdProject.id));
    await database.db
      .delete(platform.auditEvent)
      .where(query.eq(platform.auditEvent.projectId, createdProject.id));
    await database.db
      .delete(controlPlane.studioRegistration)
      .where(query.eq(controlPlane.studioRegistration.projectId, createdProject.id));
    await database.db
      .delete(platform.projectCapability)
      .where(query.eq(platform.projectCapability.projectId, createdProject.id));
    await database.db
      .delete(locale.projectLocale)
      .where(query.eq(locale.projectLocale.projectId, createdProject.id));
    await database.db
      .delete(access.projectMembership)
      .where(query.eq(access.projectMembership.projectId, createdProject.id));
    await database.db
      .delete(platform.environment)
      .where(query.eq(platform.environment.projectId, createdProject.id));
    await database.db
      .delete(platform.project)
      .where(query.eq(platform.project.id, createdProject.id));
    await database.db
      .delete(platform.auditEvent)
      .where(query.eq(platform.auditEvent.workspaceId, createdWorkspace.id));
    await database.db
      .delete(platform.workspaceMembership)
      .where(query.eq(platform.workspaceMembership.workspaceId, createdWorkspace.id));
    await database.db
      .delete(platform.workspace)
      .where(query.eq(platform.workspace.id, createdWorkspace.id));
    await database.db.delete(auth.session).where(query.eq(auth.session.userId, userId));
    await database.db.delete(auth.account).where(query.eq(auth.account.userId, userId));
    await database.db.delete(auth.user).where(query.eq(auth.user.id, userId));
  };

  return {
    applicationOrigin,
    clientId,
    email,
    environmentId: createdProject.environment.id,
    harness,
    password,
    projectId: createdProject.id,
    registrationId,
    registrationVersion,
    userId,
    updateRegistrationOrigin: async () => {
      const updated = await Effect.runPromise(
        repository.putStudioRegistration(
          { kind: "user", id: actorId },
          createdProject.id,
          createdProject.environment.id,
          Schema.decodeUnknownSync(controlPlaneContracts.ControlPlanePutStudioRegistrationRequest)({
            commandId: randomUUID(),
            expectedVersion: registrationVersion,
            applicationOrigin: "http://127.0.0.1:43220",
            mountPath: "/studio",
          }),
          `m18-browser-drift-${suffix}`,
        ),
      );
      registrationVersion = updated.registration.version;
    },
    cleanup,
  };
}
