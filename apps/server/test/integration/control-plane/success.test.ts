import type { ApplicationEffectTransform } from "@framerfordevs/api/context";
import { CredentialPrincipal } from "@framerfordevs/api/contracts/access/index";
import {
  ControlPlaneCreateProjectResult,
  ControlPlaneCreateWorkspaceResult,
  ControlPlaneEnableCapabilityResult,
  ControlPlaneProject,
  ControlPlanePutStudioRegistrationResult,
  ControlPlaneWorkspace,
  StudioRegistration,
} from "@framerfordevs/api/contracts/control-plane/index";
import { AuthUserId, Capability, Project } from "@framerfordevs/api/contracts/platform/index";
import {
  RateLimitDecision,
  rateLimitPolicies,
} from "@framerfordevs/api/contracts/rate-limit/index";
import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import {
  ControlPlaneCursorSigner,
  makeControlPlaneCursorSigner,
} from "@framerfordevs/api/services/control-plane/cursor-signer/index";
import {
  makePlatformRepository,
  PlatformRepository,
} from "@framerfordevs/api/services/platform-repository";
import {
  RateLimitManager,
  type RateLimitManagerService,
} from "@framerfordevs/api/services/rate-limit/manager/index";
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
  scopes: ["project.read", "project.update", "project.capability.manage"],
});
const observedActorKinds: Array<string> = [];
const registration = Schema.decodeUnknownSync(StudioRegistration)({
  id: "019fae8b-1234-7000-8000-000000000005",
  projectId: currentProject.id,
  environmentId: currentProject.primaryEnvironment.id,
  applicationOrigin: "https://studio.example.test",
  mountPath: "/studio",
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
  it("serves all thirteen operations through shared domain authority", async () => {
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
    ];

    for (const pending of requests) expectSuccess(await pending);
    expect(evaluatedRates).toHaveLength(26);
    expect(evaluatedRates.filter((rate) => rate.policy === "control-plane.global")).toHaveLength(
      13,
    );
    expect(evaluatedRates.filter((rate) => rate.policy === "control-plane.user")).toHaveLength(13);
    expect(evaluatedRates.map((rate) => rate.cost)).toEqual(expect.arrayContaining([1, 3, 5]));
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
    expect(observedActorKinds).toEqual(["credential", "credential"]);
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
