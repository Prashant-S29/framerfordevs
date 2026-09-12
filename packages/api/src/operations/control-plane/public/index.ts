// Defines Control Plane bearer grants and principal adaptation without introducing cookie authority.

import {
  CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE,
  CONTROL_PLANE_READ_SCOPE,
  CONTROL_PLANE_WRITE_SCOPE,
  type CliApiOAuthScope,
} from "@framerfordevs/auth";
import { Effect, Schema } from "effect";

import type { CredentialScope } from "../../../contracts/access";
import {
  type ControlPlaneActor,
  ControlPlaneCreateProjectInput,
  ControlPlaneCreateProjectRequest,
  ControlPlaneCreateWorkspaceRequest,
  ControlPlaneEnableCapabilityInput,
  ControlPlaneEnableCapabilityRequest,
  ControlPlaneListProjectsInput,
  ControlPlaneListProjectsQuery,
  ControlPlaneListWorkspacesQuery,
  ControlPlaneProjectLifecycleInput,
  ControlPlaneProjectLifecycleRequest,
  ControlPlaneProjectScope,
  ControlPlanePutStudioRegistrationInput,
  ControlPlaneStudioRegistrationScope,
  ControlPlanePutStudioRegistrationRequest,
  ControlPlaneUpdateProjectInput,
  ControlPlaneUpdateProjectRequest,
  ControlPlaneWorkspaceScope,
} from "../../../contracts/control-plane";
import { AuthUserId } from "../../../contracts/platform";
import { RateLimitCost } from "../../../contracts/rate-limit";
import { ApiErrorDetail } from "../../../contracts/response/api";
import { UnauthorizedFailure, ValidationFailure } from "../../../contracts/response/errors";
import { RateLimitManager } from "../../../services/rate-limit/manager";
import {
  ToolingPrincipalAuthenticator,
  type ToolingPrincipal,
} from "../../../services/tooling/principal-authenticator";

const bearerPattern = /^Bearer ([^\s,]+)$/u;
const positiveIntegerPattern = /^[1-9]\d*$/u;

function validationFailure(path: string) {
  return ValidationFailure.make({
    details: [
      ApiErrorDetail.make({
        path,
        code: "control_plane_input_invalid",
        message: "Use valid bounded Control Plane path, query, and body values.",
      }),
    ],
  });
}

function decodeInput<A, I>(schema: Schema.Schema<A, I, never>, value: unknown, path: string) {
  return Schema.decodeUnknown(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => validationFailure(path)),
    Effect.withSpan("control-plane.public.input.decode"),
  );
}

function parsePageQuery(raw: string, includeStatus: boolean) {
  const parameters = new URLSearchParams(raw);
  const allowed = new Set(includeStatus ? ["cursor", "limit", "status"] : ["cursor", "limit"]);
  for (const key of parameters.keys()) {
    if (!allowed.has(key) || parameters.getAll(key).length !== 1) {
      return Effect.fail(validationFailure("query"));
    }
  }
  const limitValue = parameters.get("limit");
  if (limitValue !== null && !positiveIntegerPattern.test(limitValue)) {
    return Effect.fail(validationFailure("query.limit"));
  }
  return Effect.succeed({
    cursor: parameters.get("cursor"),
    limit: limitValue === null ? 20 : Number(limitValue),
    ...(includeStatus ? { status: parameters.get("status") ?? "active" } : {}),
  });
}

export function decodeControlPlaneListWorkspacesQuery(raw: string) {
  return Effect.flatMap(parsePageQuery(raw, false), (value) =>
    decodeInput(ControlPlaneListWorkspacesQuery, value, "query"),
  );
}

export function decodeControlPlaneListProjectsInput(workspaceId: string, raw: string) {
  return Effect.flatMap(parsePageQuery(raw, true), (query) =>
    Effect.flatMap(decodeInput(ControlPlaneListProjectsQuery, query, "query"), (decoded) =>
      decodeInput(ControlPlaneListProjectsInput, { workspaceId, ...decoded }, "path"),
    ),
  );
}

export function decodeControlPlaneWorkspaceScope(workspaceId: string) {
  return decodeInput(ControlPlaneWorkspaceScope, { workspaceId }, "path");
}

export function decodeControlPlaneProjectScope(projectId: string) {
  return decodeInput(ControlPlaneProjectScope, { projectId }, "path");
}

export function decodeControlPlaneStudioRegistrationScope(
  projectId: string,
  environmentId: string,
) {
  return decodeInput(ControlPlaneStudioRegistrationScope, { projectId, environmentId }, "path");
}

export function decodeControlPlaneCreateWorkspaceRequest(body: unknown) {
  return decodeInput(ControlPlaneCreateWorkspaceRequest, body, "body");
}

export function decodeControlPlaneCreateProjectInput(workspaceId: string, body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneCreateProjectRequest, body, "body"), (decoded) =>
    decodeInput(ControlPlaneCreateProjectInput, { workspaceId, ...decoded }, "path"),
  );
}

export function decodeControlPlaneUpdateProjectInput(projectId: string, body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneUpdateProjectRequest, body, "body"), (decoded) =>
    decodeInput(ControlPlaneUpdateProjectInput, { projectId, ...decoded }, "path"),
  );
}

export function decodeControlPlaneProjectLifecycleInput(projectId: string, body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneProjectLifecycleRequest, body, "body"), (decoded) =>
    decodeInput(ControlPlaneProjectLifecycleInput, { projectId, ...decoded }, "path"),
  );
}

export function decodeControlPlaneEnableCapabilityInput(projectId: string, body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneEnableCapabilityRequest, body, "body"), (decoded) =>
    decodeInput(ControlPlaneEnableCapabilityInput, { projectId, ...decoded }, "path"),
  );
}

export function decodeControlPlanePutStudioRegistrationInput(
  projectId: string,
  environmentId: string,
  body: unknown,
) {
  return Effect.flatMap(
    decodeInput(ControlPlanePutStudioRegistrationRequest, body, "body"),
    (decoded) =>
      decodeInput(
        ControlPlanePutStudioRegistrationInput,
        { projectId, environmentId, ...decoded },
        "path",
      ),
  );
}

export interface ControlPlaneBearerRequirement {
  readonly oauthScope: CliApiOAuthScope;
  readonly authority: "oauth_only" | "oauth_or_management";
  readonly managementScopes: ReadonlyArray<CredentialScope>;
}

const oauthOnly = (oauthScope: CliApiOAuthScope): ControlPlaneBearerRequirement => ({
  oauthScope,
  authority: "oauth_only",
  managementScopes: [],
});
const projectAuthority = (
  oauthScope: CliApiOAuthScope,
  managementScopes: ReadonlyArray<CredentialScope>,
): ControlPlaneBearerRequirement => ({
  oauthScope,
  authority: "oauth_or_management",
  managementScopes,
});

export const controlPlaneBearerRequirements = {
  listWorkspaces: oauthOnly(CONTROL_PLANE_READ_SCOPE),
  createWorkspace: oauthOnly(CONTROL_PLANE_WRITE_SCOPE),
  getWorkspace: oauthOnly(CONTROL_PLANE_READ_SCOPE),
  listProjects: oauthOnly(CONTROL_PLANE_READ_SCOPE),
  createProject: oauthOnly(CONTROL_PLANE_WRITE_SCOPE),
  getProject: projectAuthority(CONTROL_PLANE_READ_SCOPE, ["project.read"]),
  updateProject: projectAuthority(CONTROL_PLANE_WRITE_SCOPE, ["project.update"]),
  archiveProject: oauthOnly(CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE),
  restoreProject: oauthOnly(CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE),
  listCapabilities: projectAuthority(CONTROL_PLANE_READ_SCOPE, ["project.read"]),
  enableCapability: projectAuthority(CONTROL_PLANE_WRITE_SCOPE, ["project.capability.manage"]),
  getStudioRegistration: projectAuthority(CONTROL_PLANE_READ_SCOPE, ["project.read"]),
  putStudioRegistration: projectAuthority(CONTROL_PLANE_WRITE_SCOPE, ["project.update"]),
} as const satisfies Readonly<Record<string, ControlPlaneBearerRequirement>>;

export const authenticateControlPlaneRequest = Effect.fn("control-plane.public.authenticate")(
  function* (
    authorization: string | null,
    source: string,
    requirement: ControlPlaneBearerRequirement,
  ) {
    if (authorization === null) return yield* UnauthorizedFailure.make();
    const token = bearerPattern.exec(authorization)?.[1];
    if (token === undefined) return yield* UnauthorizedFailure.make();
    const authenticator = yield* ToolingPrincipalAuthenticator;
    return requirement.authority === "oauth_only"
      ? yield* authenticator.authenticateOAuth({
          token,
          source,
          oauthScope: requirement.oauthScope,
        })
      : yield* authenticator.authenticate({
          token,
          source,
          oauthScope: requirement.oauthScope,
          managementScopes: requirement.managementScopes,
        });
  },
);

export const controlPlaneRequestCosts = {
  read: 1,
  create: 5,
  update: 3,
  lifecycle: 5,
  studioWrite: 5,
} as const;

export const evaluateControlPlaneGlobalRateLimit = Effect.fn(
  "control-plane.public.rate-limit.global",
)(function* (cost: number) {
  return yield* (yield* RateLimitManager).evaluate({
    policy: "control-plane.global",
    identity: "installation",
    cost: RateLimitCost.make(cost),
  });
});

export const evaluateControlPlanePrincipalRateLimit = Effect.fn(
  "control-plane.public.rate-limit.principal",
)(function* (principal: ToolingPrincipal, cost: number) {
  return yield* (yield* RateLimitManager).evaluate({
    policy: principal.kind === "oauth_user" ? "control-plane.user" : "control-plane.credential",
    identity: controlPlanePrincipalKey(principal),
    cost: RateLimitCost.make(cost),
  });
});

export function controlPlanePrincipalActor(principal: ToolingPrincipal): ControlPlaneActor {
  return principal.kind === "oauth_user"
    ? { kind: "user", id: AuthUserId.make(principal.userId) }
    : { kind: "credential", id: principal.credential.credentialId };
}

export function controlPlanePrincipalKey(principal: ToolingPrincipal): string {
  return principal.kind === "oauth_user"
    ? `oauth:${principal.clientId}:${principal.userId}`
    : `credential:${principal.credential.credentialId}`;
}
