import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import {
  CredentialPrincipal,
  CurrentProjectAccess,
  InspectedProjectInvitation,
  InvitationToken,
  ProjectInvitation,
  ProjectInvitationPage,
  ProjectMember,
  ProjectMemberPage,
} from "@framerfordevs/api/contracts/access/index";
import {
  ControlPlaneCreateProjectResult,
  ControlPlaneCreateWorkspaceResult,
  ControlPlaneEnableCapabilityResult,
  ControlPlaneProject,
  ControlPlanePutStudioRegistrationResult,
  ControlPlaneSetStudioRuntimeResult,
  ControlPlaneWorkspace,
  StudioRegistration,
} from "@framerfordevs/api/contracts/control-plane/index";
import { ProjectLocale, ProjectLocaleList } from "@framerfordevs/api/contracts/locale/index";
import { AuthUserId, Capability, Project } from "@framerfordevs/api/contracts/platform/index";
import {
  RateLimitDecision,
  rateLimitPolicies,
} from "@framerfordevs/api/contracts/rate-limit/index";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import {
  AccessRepository,
  makeAccessRepository,
} from "@framerfordevs/api/services/access-repository";
import {
  ControlPlaneCursorSigner,
  makeControlPlaneCursorSigner,
} from "@framerfordevs/api/services/control-plane/cursor-signer/index";
import {
  LocaleRepository,
  makeLocaleRepository,
} from "@framerfordevs/api/services/locale/repository";
import {
  makePlatformRepository,
  PlatformRepository,
} from "@framerfordevs/api/services/platform-repository";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager/index";
import { SecretGenerator } from "@framerfordevs/api/services/secret-generator";
import {
  makeToolingPrincipalAuthenticator,
  ToolingPrincipalAuthenticator,
} from "@framerfordevs/api/services/tooling/principal-authenticator/index";
import { Effect, Schema } from "effect";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../../src/app";

const userId = AuthUserId.make("control-plane-http-user");
const workspace = Schema.decodeUnknownSync(ControlPlaneWorkspace)({
  id: "019fae8b-1234-7000-8000-000000000001",
  name: "Workspace",
  version: 1,
  role: "owner",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});
const capability = Schema.decodeUnknownSync(Capability)({
  id: "019fae8b-1234-7000-8000-000000000004",
  key: "cms",
  status: "enabled",
  version: 1,
  changedAt: "2026-08-14T00:00:00.000Z",
});
const projectValue = {
  id: "019fae8b-1234-7000-8000-000000000002",
  workspaceId: workspace.id,
  name: "Project",
  key: "project",
  description: null,
  version: 1,
  status: "active",
  archivedAt: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  primaryEnvironment: {
    id: "019fae8b-1234-7000-8000-000000000003",
    key: "main",
    name: "main",
    isPrimary: true,
    createdAt: "2026-08-14T00:00:00.000Z",
  },
  capabilities: [capability],
  effectiveActions: [
    "project.read",
    "project.update",
    "project.archive",
    "project.capability.manage",
    "studio_registration.read",
    "studio_registration.write",
  ],
};
let currentProject = Schema.decodeUnknownSync(ControlPlaneProject)(projectValue);
const managementCredential = Schema.decodeUnknownSync(CredentialPrincipal)({
  credentialId: "019fae8b-1234-7000-8000-000000000006",
  workspaceId: workspace.id,
  projectId: currentProject.id,
  environmentId: currentProject.primaryEnvironment.id,
  family: "management",
  scopes: [
    "project.read",
    "project.update",
    "project.capability.manage",
    "locale.read",
    "locale.manage",
  ],
});
const observedActorKinds: Array<string> = [];
const member = Schema.decodeUnknownSync(ProjectMember)({
  id: "019fae8b-1234-7000-8000-000000000020",
  projectId: currentProject.id,
  userId,
  name: "Control Plane User",
  email: "control-plane@example.test",
  role: "owner",
  localeAccess: { mode: "all", localeIds: [] },
  version: 1,
  removedAt: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});
const invitation = Schema.decodeUnknownSync(ProjectInvitation)({
  id: "019fae8b-1234-7000-8000-000000000021",
  projectId: currentProject.id,
  email: "invited@example.test",
  role: "editor",
  localeAccess: { mode: "all", localeIds: [] },
  status: "pending",
  version: 1,
  expiresAt: "2026-08-21T00:00:00.000Z",
  acceptedAt: null,
  revokedAt: null,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});
const inspectedInvitation = Schema.decodeUnknownSync(InspectedProjectInvitation)({
  projectId: currentProject.id,
  projectName: currentProject.name,
  role: invitation.role,
  localeAccess: invitation.localeAccess,
  inviterName: "Control Plane User",
  expiresAt: invitation.expiresAt,
});
const englishLocale = Schema.decodeUnknownSync(ProjectLocale)({
  id: "019fae8b-1234-7000-8000-000000000022",
  workspaceId: workspace.id,
  projectId: currentProject.id,
  tag: "en",
  displayName: "English",
  status: "enabled",
  position: 0,
  version: 1,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});
const currentAccess = Schema.decodeUnknownSync(CurrentProjectAccess)({
  projectId: currentProject.id,
  role: "owner",
  localeAccess: { mode: "all", localeIds: [] },
  baseRoleActions: [
    "project.read",
    "project.member.read",
    "project.member.invite",
    "project.member.role.update",
    "project.member.locale.update",
    "project.member.remove",
  ],
  effectiveProjectActions: [
    "project.read",
    "project.member.read",
    "project.member.invite",
    "project.member.role.update",
    "project.member.locale.update",
    "project.member.remove",
  ],
  effectiveLocaleIds: [englishLocale.id],
  effectiveLocaleActions: ["content.read", "content.write", "content.review", "content.publish"],
});
const invitationToken = Schema.decodeUnknownSync(InvitationToken)("a".repeat(43));
const registration = Schema.decodeUnknownSync(StudioRegistration)({
  id: "019fae8b-1234-7000-8000-000000000005",
  projectId: currentProject.id,
  environmentId: currentProject.primaryEnvironment.id,
  applicationOrigin: "https://studio.example.test",
  mountPath: "/studio",
  runtimeStatus: "inactive",
  runtimeChangedAt: null,
  runtimeChangedByUserId: null,
  version: 1,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
});

function legacyProject(project: ControlPlaneProject) {
  return Schema.decodeUnknownSync(Project)({
    id: project.id,
    workspaceId: project.workspaceId,
    name: project.name,
    key: project.key,
    description: project.description,
    version: project.version,
    archivedAt: project.archivedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    environment: project.primaryEnvironment,
    capabilities: project.capabilities,
  });
}

const repository = {
  ...makePlatformRepository(),
  listControlPlaneWorkspaces: () => Effect.succeed({ items: [workspace], nextPosition: null }),
  createControlPlaneWorkspace: () =>
    Effect.succeed(ControlPlaneCreateWorkspaceResult.make({ workspace, replayed: false })),
  getControlPlaneWorkspace: () => Effect.succeed(workspace),
  listControlPlaneProjects: () => Effect.succeed({ items: [currentProject], nextPosition: null }),
  createControlPlaneProject: () =>
    Effect.succeed(
      ControlPlaneCreateProjectResult.make({ project: currentProject, replayed: false }),
    ),
  getControlPlaneProject: (actor: { readonly kind: string }) =>
    Effect.sync(() => {
      observedActorKinds.push(actor.kind);
      return currentProject;
    }),
  updateControlPlaneProject: (
    actor: { readonly kind: string },
    _projectId: unknown,
    input: { name: string },
  ) =>
    Effect.sync(() => {
      observedActorKinds.push(actor.kind);
      currentProject = Schema.decodeUnknownSync(ControlPlaneProject)({
        ...currentProject,
        name: input.name,
        version: currentProject.version + 1,
      });
      return currentProject;
    }),
  archiveProject: () =>
    Effect.sync(() => {
      currentProject = Schema.decodeUnknownSync(ControlPlaneProject)({
        ...currentProject,
        status: "archived",
        archivedAt: "2026-08-15T00:00:00.000Z",
        version: currentProject.version + 1,
      });
      return legacyProject(currentProject);
    }),
  restoreProject: () =>
    Effect.sync(() => {
      currentProject = Schema.decodeUnknownSync(ControlPlaneProject)({
        ...currentProject,
        status: "active",
        archivedAt: null,
        version: currentProject.version + 1,
      });
      return legacyProject(currentProject);
    }),
  enableControlPlaneCapability: () =>
    Effect.succeed(ControlPlaneEnableCapabilityResult.make({ capability, replayed: false })),
  getStudioRegistration: () => Effect.succeed(registration),
  putStudioRegistration: () =>
    Effect.succeed(
      ControlPlanePutStudioRegistrationResult.make({
        registration,
        created: false,
        replayed: false,
        noOp: true,
      }),
    ),
  setStudioRuntime: () =>
    Effect.succeed(
      ControlPlaneSetStudioRuntimeResult.make({
        registration,
        runtimeStatus: registration.runtimeStatus,
        replayed: false,
        noOp: true,
      }),
    ),
};

const accessRepository = {
  ...makeAccessRepository(),
  getActorEmail: () => Effect.succeed(member.email),
  getCurrentAccess: () => Effect.succeed(currentAccess),
  listMembers: () => Effect.succeed(ProjectMemberPage.make({ items: [member], nextCursor: null })),
  updateMemberPolicy: () => Effect.succeed(member),
  removeMember: () => Effect.succeed(member),
  listInvitations: () =>
    Effect.succeed(ProjectInvitationPage.make({ items: [invitation], nextCursor: null })),
  createInvitation: () => Effect.succeed(invitation),
  revokeInvitation: () => Effect.succeed(invitation),
  inspectInvitation: () => Effect.succeed(inspectedInvitation),
  acceptInvitation: () => Effect.succeed(member),
};
const localeRepository = {
  ...makeLocaleRepository(),
  listLocales: (actor: string | { readonly kind: string }) =>
    Effect.sync(() => {
      observedActorKinds.push(typeof actor === "string" ? "user" : actor.kind);
      return ProjectLocaleList.make({ items: [englishLocale] });
    }),
  createLocale: (actor: string | { readonly kind: string }) =>
    Effect.sync(() => {
      observedActorKinds.push(typeof actor === "string" ? "user" : actor.kind);
      return englishLocale;
    }),
  updateDisplayName: () => Effect.succeed(englishLocale),
  reorderLocales: () => Effect.succeed(ProjectLocaleList.make({ items: [englishLocale] })),
  updateStatus: () => Effect.succeed(englishLocale),
};
const secretGenerator = {
  generateInvitationToken: () => Effect.succeed(invitationToken),
  digest: () => Effect.succeed("a".repeat(64)),
  verifyDigest: () => Effect.succeed(true),
  generateCredentialMaterial: () => Effect.die("unused"),
};

const authenticator = makeToolingPrincipalAuthenticator(
  () => Effect.succeed(managementCredential),
  () =>
    Effect.succeed({
      kind: "oauth_user" as const,
      userId,
      clientId: "framerfordevs-cli" as const,
      scopes: [
        "control-plane:read" as const,
        "control-plane:write" as const,
        "control-plane:project:lifecycle" as const,
        "control-plane:governance:read" as const,
        "control-plane:governance:write" as const,
      ],
      expiresAtEpochSeconds: 1_800_000_000,
    }),
  () => Effect.void,
);

let rateLimitsAllow = true;
const evaluatedRates: Array<{ readonly policy: string; readonly cost: number }> = [];
const rateLimitManager: RateLimitManagerService = {
  evaluate: (input) =>
    Effect.sync(() => {
      evaluatedRates.push({ policy: input.policy, cost: input.cost });
      return Schema.decodeUnknownSync(RateLimitDecision)({
        allowed: rateLimitsAllow,
        policy: input.policy,
        cost: input.cost,
        limit: rateLimitPolicies[input.policy].limitPerInterval,
        remaining: rateLimitPolicies[input.policy].capacity,
        resetAtEpochMs: Date.now() + rateLimitPolicies[input.policy].intervalMs,
        retryAfterSeconds: rateLimitsAllow ? null : 1,
        enforcementMode: "memory",
      });
    }),
  reset: () => Effect.void,
  retainedFallbackEntryCount: Effect.succeed(0),
};

const controlPlaneEffectTransform: ApplicationEffectTransform = (effect) =>
  Effect.provideService(effect, PlatformRepository, repository).pipe(
    Effect.provideService(AccessRepository, accessRepository),
    Effect.provideService(LocaleRepository, localeRepository),
    Effect.provideService(SecretGenerator, secretGenerator),
    Effect.provideService(ToolingPrincipalAuthenticator, authenticator),
    Effect.provideService(RateLimitManager, rateLimitManager),
    Effect.provideService(
      ControlPlaneCursorSigner,
      makeControlPlaneCursorSigner({
        activeSecret: "control-plane-http-test-secret-at-least-32-characters",
      }),
    ),
  );

const app = createApp({ controlPlaneEffectTransform });
const api = request(app);
const authorization = { Authorization: "Bearer oauth-control-plane-token" };

afterAll(async () => {
  await disposeApplicationRuntime();
});

function expectSuccess(response: request.Response) {
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["ratelimit-limit"]).toBe("120");
  expect(response.headers["x-request-id"]).toBeTypeOf("string");
}

describe("Control Plane HTTP success contracts", () => {
  it("serves all fourteen operations through shared domain authority", async () => {
    const commandId = "019fae8b-1234-7000-8000-000000000010";
    const projectId = currentProject.id;
    const environmentId = currentProject.primaryEnvironment.id;
    const requests = [
      api.get("/api/control-plane/v1/workspaces").set(authorization),
      api
        .post("/api/control-plane/v1/workspaces")
        .set(authorization)
        .send({ commandId, name: "Workspace" }),
      api.get(`/api/control-plane/v1/workspaces/${workspace.id}`).set(authorization),
      api
        .get(`/api/control-plane/v1/workspaces/${workspace.id}/projects?status=active&limit=20`)
        .set(authorization),
      api
        .post(`/api/control-plane/v1/workspaces/${workspace.id}/projects`)
        .set(authorization)
        .send({
          commandId,
          name: "Project",
          key: "project",
          description: null,
          initialCapabilities: ["cms"],
        }),
      api.get(`/api/control-plane/v1/projects/${projectId}`).set(authorization),
      api
        .patch(`/api/control-plane/v1/projects/${projectId}`)
        .set(authorization)
        .send({ expectedVersion: 1, name: "Updated Project", description: null }),
      api
        .post(`/api/control-plane/v1/projects/${projectId}/archive`)
        .set(authorization)
        .send({ expectedVersion: 2 }),
      api
        .post(`/api/control-plane/v1/projects/${projectId}/restore`)
        .set(authorization)
        .send({ expectedVersion: 3 }),
      api.get(`/api/control-plane/v1/projects/${projectId}/capabilities`).set(authorization),
      api
        .put(`/api/control-plane/v1/projects/${projectId}/capabilities/cms`)
        .set(authorization)
        .send({ commandId }),
      api
        .get(
          `/api/control-plane/v1/projects/${projectId}/environments/${environmentId}/studio-registration`,
        )
        .set(authorization),
      api
        .put(
          `/api/control-plane/v1/projects/${projectId}/environments/${environmentId}/studio-registration`,
        )
        .set(authorization)
        .send({
          commandId,
          expectedVersion: 1,
          applicationOrigin: registration.applicationOrigin,
          mountPath: registration.mountPath,
        }),
      api
        .put(
          `/api/control-plane/v1/projects/${projectId}/environments/${environmentId}/studio-registration/runtime`,
        )
        .set(authorization)
        .send({ commandId, expectedVersion: 1, enabled: false }),
    ];

    for (const pending of requests) expectSuccess(await pending);
    expect(evaluatedRates).toHaveLength(28);
    expect(evaluatedRates.filter((rate) => rate.policy === "control-plane.global")).toHaveLength(
      14,
    );
    expect(evaluatedRates.filter((rate) => rate.policy === "control-plane.user")).toHaveLength(14);
    expect(evaluatedRates.map((rate) => rate.cost)).toEqual(expect.arrayContaining([1, 3, 5]));
  });

  it("serves governance, invitation, member, and locale automation routes", async () => {
    const projectId = currentProject.id;
    const commandId = "019fae8b-1234-7000-8000-000000000030";
    const requests = [
      api.get(`/api/control-plane/v1/projects/${projectId}/governance`).set(authorization),
      api
        .get(
          `/api/control-plane/v1/projects/${projectId}/members?role=owner&search=Control&limit=20`,
        )
        .set(authorization),
      api
        .put(`/api/control-plane/v1/projects/${projectId}/members/${member.id}/policy`)
        .set(authorization)
        .send({
          expectedVersion: 1,
          role: "owner",
          localeAccess: { mode: "all" },
        }),
      api
        .post(`/api/control-plane/v1/projects/${projectId}/members/${member.id}/remove`)
        .set(authorization)
        .send({ expectedVersion: 1 }),
      api
        .get(`/api/control-plane/v1/projects/${projectId}/invitations?status=pending&limit=20`)
        .set(authorization),
      api
        .post(`/api/control-plane/v1/projects/${projectId}/invitations`)
        .set(authorization)
        .send({
          email: invitation.email,
          role: invitation.role,
          localeAccess: { mode: "all" },
        }),
      api
        .post(`/api/control-plane/v1/projects/${projectId}/invitations/${invitation.id}/revoke`)
        .set(authorization)
        .send({ expectedVersion: 1 }),
      api
        .post("/api/control-plane/v1/invitations/inspect")
        .set(authorization)
        .send({ token: invitationToken }),
      api
        .post("/api/control-plane/v1/invitations/accept")
        .set(authorization)
        .send({ token: invitationToken }),
      api
        .get(`/api/control-plane/v1/projects/${projectId}/locales?view=settings`)
        .set(authorization),
      api
        .post(`/api/control-plane/v1/projects/${projectId}/locales`)
        .set(authorization)
        .send({ commandId, tag: "en", displayName: "English" }),
      api
        .patch(`/api/control-plane/v1/projects/${projectId}/locales/${englishLocale.id}`)
        .set(authorization)
        .send({ expectedVersion: 1, displayName: "English" }),
      api
        .put(`/api/control-plane/v1/projects/${projectId}/locales/order`)
        .set(authorization)
        .send({ locales: [{ localeId: englishLocale.id, expectedVersion: 1 }] }),
      api
        .put(`/api/control-plane/v1/projects/${projectId}/locales/${englishLocale.id}/status`)
        .set(authorization)
        .send({ expectedVersion: 1, status: "enabled", confirmDraftImpact: false }),
    ];

    for (const [index, pending] of requests.entries()) {
      const response = await pending;
      expect(response.status, `M15 request ${index}: ${JSON.stringify(response.body)}`).toBe(200);
      expectSuccess(response);
    }
  });

  it("rejects authenticated ambiguous queries and excess bodies", async () => {
    const duplicate = await api
      .get("/api/control-plane/v1/workspaces?limit=10&limit=20")
      .set(authorization);
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.code).toBe("VALIDATION_ERROR");

    const credentialQuery = await api
      .get("/api/control-plane/v1/workspaces?credential=secret")
      .set(authorization);
    expect(credentialQuery.status).toBe(400);
    expect(credentialQuery.body.error.code).toBe("VALIDATION_ERROR");

    const excess = await api.post("/api/control-plane/v1/workspaces").set(authorization).send({
      commandId: "019fae8b-1234-7000-8000-000000000010",
      name: "Workspace",
      unexpected: true,
    });
    expect(excess.status).toBe(400);
    expect(excess.body.error.code).toBe("VALIDATION_ERROR");

    const malformed = await api
      .post("/api/control-plane/v1/workspaces")
      .set(authorization)
      .set("Content-Type", "application/json")
      .send('{"name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("adapts management credentials only on permitted project-bound routes", async () => {
    observedActorKinds.length = 0;
    const managementAuthorization = {
      Authorization: "Bearer ffd_mgmt_exact-project-credential",
    };
    const get = await api
      .get(`/api/control-plane/v1/projects/${currentProject.id}`)
      .set(managementAuthorization);
    expectSuccess(get);
    const update = await api
      .patch(`/api/control-plane/v1/projects/${currentProject.id}`)
      .set(managementAuthorization)
      .send({
        expectedVersion: currentProject.version,
        name: "Credential Updated",
        description: null,
      });
    expectSuccess(update);
    const locales = await api
      .get(`/api/control-plane/v1/projects/${currentProject.id}/locales?view=settings`)
      .set(managementAuthorization);
    expectSuccess(locales);
    const governance = await api
      .get(`/api/control-plane/v1/projects/${currentProject.id}/governance`)
      .set(managementAuthorization);
    expect(governance.status).toBe(401);
    expect(governance.body.error.code).toBe("CREDENTIAL_INVALID");
    expect(observedActorKinds).toEqual(["credential", "credential", "credential"]);
  });

  it("rejects management credentials on OAuth-only enumeration", async () => {
    const response = await api
      .get("/api/control-plane/v1/workspaces")
      .set("Authorization", "Bearer ffd_mgmt_not-valid-for-enumeration");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("CREDENTIAL_INVALID");
    expect(response.headers["www-authenticate"]).toBe('Bearer realm="control-plane"');
  });

  it("returns approved quota headers and fails closed when globally limited", async () => {
    rateLimitsAllow = false;
    const response = await api.get("/api/control-plane/v1/workspaces").set(authorization);
    rateLimitsAllow = true;

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
    expect(response.body.error.retryable).toBe(true);
    expect(response.headers["ratelimit-limit"]).toBe("3000");
    expect(response.headers["retry-after"]).toBe("1");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
