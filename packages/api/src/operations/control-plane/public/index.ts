// Defines Control Plane bearer grants and principal adaptation without introducing cookie authority.

import {
  CONTROL_PLANE_GOVERNANCE_READ_SCOPE,
  CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE,
  CONTROL_PLANE_OPERATIONS_READ_SCOPE,
  CONTROL_PLANE_OPERATIONS_WRITE_SCOPE,
  CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE,
  CONTROL_PLANE_READ_SCOPE,
  CONTROL_PLANE_SECURITY_READ_SCOPE,
  CONTROL_PLANE_WRITE_SCOPE,
  type CliApiOAuthScope,
} from "@framerfordevs/auth";
import { Clock, Effect, Schema } from "effect";

import {
  AcceptProjectInvitationInput,
  ApiCredentialId,
  ApiCredentialRotationId,
  type CredentialScope,
  CreateProjectInvitationInput,
  ListProjectInvitationsInput,
  ListProjectMembersInput,
  RemoveProjectMemberInput,
  RevokeProjectInvitationInput,
  UpdateProjectMemberPolicyInput,
} from "../../../contracts/access";
import {
  type ControlPlaneActor,
  ControlPlaneCreateInvitationRequest,
  ControlPlaneCreateLocaleRequest,
  ControlPlaneCredentialListQuery,
  ControlPlaneCredentialRotationTransitionRequest,
  ControlPlaneCreateInvalidationMappingRequest,
  ControlPlaneCreateWebhookEndpointRequest,
  ControlPlaneInvalidationMappingListQuery,
  ControlPlaneInvalidationMappingStateRequest,
  ControlPlaneIssueCredentialRequest,
  ControlPlaneReplayWebhookRequest,
  ControlPlaneReplaceWebhookSubscriptionsRequest,
  ControlPlaneRevokeCredentialRequest,
  ControlPlaneStartCredentialRotationRequest,
  ControlPlaneStartWebhookSecretRotationRequest,
  ControlPlaneCreateProjectInput,
  ControlPlaneCreateProjectRequest,
  ControlPlaneCreateWorkspaceRequest,
  ControlPlaneProjectAuditQuery,
  ControlPlaneEnableCapabilityInput,
  ControlPlaneEnableCapabilityRequest,
  ControlPlaneInvitationListQuery,
  ControlPlaneInvitationTokenRequest,
  ControlPlaneLocaleListQuery,
  ControlPlaneLocaleOrderRequest,
  ControlPlaneLocaleStatusRequest,
  ControlPlaneMemberListQuery,
  ControlPlaneMemberPolicyRequest,
  ControlPlaneListProjectsInput,
  ControlPlaneListProjectsQuery,
  ControlPlaneListWorkspacesQuery,
  ControlPlaneProjectLifecycleInput,
  ControlPlaneProjectLifecycleRequest,
  ControlPlaneProjectScope,
  ControlPlanePutStudioRegistrationInput,
  ControlPlaneSetStudioRuntimeInput,
  ControlPlaneStudioRegistrationScope,
  ControlPlanePutStudioRegistrationRequest,
  ControlPlaneSetStudioRuntimeRequest,
  ControlPlaneUpdateInvalidationMappingRequest,
  ControlPlaneUpdateLocaleRequest,
  ControlPlaneUpdateWebhookEndpointRequest,
  ControlPlaneWebhookDeliveryListQuery,
  ControlPlaneWebhookEndpointListQuery,
  ControlPlaneWebhookEndpointStateRequest,
  ControlPlaneWebhookSecretTransitionRequest,
  ControlPlaneUpdateProjectInput,
  ControlPlaneUpdateProjectRequest,
  ControlPlaneVersionRequest,
  ControlPlaneWorkspaceScope,
} from "../../../contracts/control-plane";
import {
  CreateProjectLocaleInput,
  ListProjectLocalesInput,
  ReorderProjectLocalesInput,
  UpdateProjectLocaleDisplayNameInput,
  UpdateProjectLocaleStatusInput,
} from "../../../contracts/locale";
import { AuthUserId, EnvironmentId, ProjectId } from "../../../contracts/platform";
import {
  InvalidationRouteMappingId,
  WebhookDeliveryId,
  WebhookEndpointId,
} from "../../../contracts/webhook";
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

function parseBoundedQuery(
  raw: string,
  allowedKeys: ReadonlyArray<string>,
): Effect.Effect<URLSearchParams, ValidationFailure> {
  const parameters = new URLSearchParams(raw);
  const allowed = new Set(allowedKeys);
  for (const key of parameters.keys()) {
    if (!allowed.has(key) || parameters.getAll(key).length !== 1) {
      return Effect.fail(validationFailure("query"));
    }
  }
  return Effect.succeed(parameters);
}

const ControlPlaneOperationalEnvironmentScope = Schema.Struct({
  projectId: ProjectId,
  environmentId: EnvironmentId,
});
const ControlPlaneOperationalCredentialScope = Schema.Struct({
  ...ControlPlaneOperationalEnvironmentScope.fields,
  credentialId: ApiCredentialId,
});
const ControlPlaneOperationalRotationScope = Schema.Struct({
  ...ControlPlaneOperationalEnvironmentScope.fields,
  rotationId: ApiCredentialRotationId,
});
const ControlPlaneOperationalWebhookScope = Schema.Struct({
  ...ControlPlaneOperationalEnvironmentScope.fields,
  endpointId: WebhookEndpointId,
});
const ControlPlaneOperationalMappingScope = Schema.Struct({
  ...ControlPlaneOperationalEnvironmentScope.fields,
  mappingId: InvalidationRouteMappingId,
});
const ControlPlaneOperationalDeliveryScope = Schema.Struct({
  ...ControlPlaneOperationalEnvironmentScope.fields,
  deliveryId: WebhookDeliveryId,
});

export function decodeControlPlaneOperationalEnvironmentScope(
  projectId: string,
  environmentId: string,
) {
  return decodeInput(ControlPlaneOperationalEnvironmentScope, { projectId, environmentId }, "path");
}

export function decodeControlPlaneOperationalCredentialScope(
  projectId: string,
  environmentId: string,
  credentialId: string,
) {
  return decodeInput(
    ControlPlaneOperationalCredentialScope,
    { projectId, environmentId, credentialId },
    "path",
  );
}

export function decodeControlPlaneOperationalRotationScope(
  projectId: string,
  environmentId: string,
  rotationId: string,
) {
  return decodeInput(
    ControlPlaneOperationalRotationScope,
    { projectId, environmentId, rotationId },
    "path",
  );
}

export function decodeControlPlaneOperationalWebhookScope(
  projectId: string,
  environmentId: string,
  endpointId: string,
) {
  return decodeInput(
    ControlPlaneOperationalWebhookScope,
    { projectId, environmentId, endpointId },
    "path",
  );
}

export function decodeControlPlaneOperationalMappingScope(
  projectId: string,
  environmentId: string,
  mappingId: string,
) {
  return decodeInput(
    ControlPlaneOperationalMappingScope,
    { projectId, environmentId, mappingId },
    "path",
  );
}

export function decodeControlPlaneOperationalDeliveryScope(
  projectId: string,
  environmentId: string,
  deliveryId: string,
) {
  return decodeInput(
    ControlPlaneOperationalDeliveryScope,
    { projectId, environmentId, deliveryId },
    "path",
  );
}

export function decodeControlPlaneWebhookEndpointListQuery(raw: string) {
  return Effect.flatMap(parseBoundedQuery(raw, ["state", "cursor", "limit"]), (query) => {
    const limit = query.get("limit");
    if (limit !== null && !positiveIntegerPattern.test(limit)) {
      return Effect.fail(validationFailure("query.limit"));
    }
    return decodeInput(
      ControlPlaneWebhookEndpointListQuery,
      {
        state: query.get("state") ?? "all",
        cursor: query.get("cursor"),
        limit: limit === null ? 20 : Number(limit),
      },
      "query",
    );
  });
}

export function decodeControlPlaneInvalidationMappingListQuery(raw: string) {
  return Effect.flatMap(parseBoundedQuery(raw, ["state", "cursor", "limit"]), (query) => {
    const limit = query.get("limit");
    if (limit !== null && !positiveIntegerPattern.test(limit)) {
      return Effect.fail(validationFailure("query.limit"));
    }
    return decodeInput(
      ControlPlaneInvalidationMappingListQuery,
      {
        state: query.get("state") ?? "all",
        cursor: query.get("cursor"),
        limit: limit === null ? 20 : Number(limit),
      },
      "query",
    );
  });
}

export function decodeControlPlaneWebhookDeliveryListQuery(raw: string) {
  return Effect.flatMap(
    parseBoundedQuery(raw, ["endpointId", "eventType", "status", "cursor", "limit"]),
    (query) => {
      const limit = query.get("limit");
      if (limit !== null && !positiveIntegerPattern.test(limit)) {
        return Effect.fail(validationFailure("query.limit"));
      }
      return decodeInput(
        ControlPlaneWebhookDeliveryListQuery,
        {
          endpointId: query.get("endpointId"),
          eventType: query.get("eventType"),
          status: query.get("status"),
          cursor: query.get("cursor"),
          limit: limit === null ? 20 : Number(limit),
        },
        "query",
      );
    },
  );
}

export const decodeControlPlaneCreateWebhookEndpointRequest = (body: unknown) =>
  decodeInput(ControlPlaneCreateWebhookEndpointRequest, body, "body");
export const decodeControlPlaneUpdateWebhookEndpointRequest = (body: unknown) =>
  decodeInput(ControlPlaneUpdateWebhookEndpointRequest, body, "body");
export const decodeControlPlaneWebhookEndpointStateRequest = (body: unknown) =>
  decodeInput(ControlPlaneWebhookEndpointStateRequest, body, "body");
export const decodeControlPlaneReplaceWebhookSubscriptionsRequest = (body: unknown) =>
  decodeInput(ControlPlaneReplaceWebhookSubscriptionsRequest, body, "body");
export const decodeControlPlaneStartWebhookSecretRotationRequest = (body: unknown) =>
  decodeInput(ControlPlaneStartWebhookSecretRotationRequest, body, "body");
export const decodeControlPlaneWebhookSecretTransitionRequest = (body: unknown) =>
  decodeInput(ControlPlaneWebhookSecretTransitionRequest, body, "body");
export const decodeControlPlaneCreateInvalidationMappingRequest = (body: unknown) =>
  decodeInput(ControlPlaneCreateInvalidationMappingRequest, body, "body");
export const decodeControlPlaneUpdateInvalidationMappingRequest = (body: unknown) =>
  decodeInput(ControlPlaneUpdateInvalidationMappingRequest, body, "body");
export const decodeControlPlaneInvalidationMappingStateRequest = (body: unknown) =>
  decodeInput(ControlPlaneInvalidationMappingStateRequest, body, "body");
export const decodeControlPlaneReplayWebhookRequest = (body: unknown) =>
  decodeInput(ControlPlaneReplayWebhookRequest, body, "body");

export function decodeControlPlaneCredentialListQuery(raw: string) {
  return Effect.flatMap(
    parseBoundedQuery(raw, ["family", "status", "cursor", "limit"]),
    (query) => {
      const limit = query.get("limit");
      if (limit !== null && !positiveIntegerPattern.test(limit)) {
        return Effect.fail(validationFailure("query.limit"));
      }
      return decodeInput(
        ControlPlaneCredentialListQuery,
        {
          family: query.get("family") ?? "all",
          status: query.get("status") ?? "all",
          cursor: query.get("cursor"),
          limit: limit === null ? 20 : Number(limit),
        },
        "query",
      );
    },
  );
}

export function decodeControlPlaneIssueCredentialRequest(body: unknown) {
  return decodeInput(ControlPlaneIssueCredentialRequest, body, "body");
}

export function decodeControlPlaneStartCredentialRotationRequest(body: unknown) {
  return decodeInput(ControlPlaneStartCredentialRotationRequest, body, "body");
}

export function decodeControlPlaneCredentialRotationTransitionRequest(body: unknown) {
  return decodeInput(ControlPlaneCredentialRotationTransitionRequest, body, "body");
}

export function decodeControlPlaneRevokeCredentialRequest(body: unknown) {
  return decodeInput(ControlPlaneRevokeCredentialRequest, body, "body");
}

export function decodeControlPlaneProjectAuditInput(raw: string) {
  return Effect.gen(function* () {
    const query = yield* parseBoundedQuery(raw, [
      "environmentId",
      "category",
      "actorKind",
      "actorId",
      "action",
      "from",
      "to",
      "cursor",
      "limit",
    ]);
    const limit = query.get("limit");
    if (limit !== null && !positiveIntegerPattern.test(limit)) {
      return yield* validationFailure("query.limit");
    }
    const now = yield* Clock.currentTimeMillis;
    return yield* decodeInput(
      ControlPlaneProjectAuditQuery,
      {
        environmentId: query.get("environmentId"),
        category: query.get("category") ?? "all",
        actorKind: query.get("actorKind") ?? "all",
        actorId: query.get("actorId"),
        action: query.get("action"),
        from: query.get("from") ?? new Date(now - 30 * 24 * 60 * 60 * 1_000).toISOString(),
        to: query.get("to") ?? new Date(now).toISOString(),
        cursor: query.get("cursor"),
        limit: limit === null ? 20 : Number(limit),
      },
      "query",
    );
  });
}

export function decodeControlPlaneMemberListInput(projectId: string, raw: string) {
  return Effect.flatMap(parseBoundedQuery(raw, ["role", "search", "cursor", "limit"]), (query) => {
    const limit = query.get("limit");
    if (limit !== null && !positiveIntegerPattern.test(limit)) {
      return Effect.fail(validationFailure("query.limit"));
    }
    return Effect.flatMap(
      decodeInput(
        ControlPlaneMemberListQuery,
        {
          role: query.get("role"),
          search: query.get("search")?.trim().normalize("NFC") ?? null,
          cursor: query.get("cursor"),
          limit: limit === null ? 20 : Number(limit),
        },
        "query",
      ),
      (decoded) => decodeInput(ListProjectMembersInput, { projectId, ...decoded }, "path"),
    );
  });
}

export function decodeControlPlaneInvitationListInput(projectId: string, raw: string) {
  return Effect.flatMap(
    parseBoundedQuery(raw, ["status", "search", "cursor", "limit"]),
    (query) => {
      const limit = query.get("limit");
      if (limit !== null && !positiveIntegerPattern.test(limit)) {
        return Effect.fail(validationFailure("query.limit"));
      }
      return Effect.flatMap(
        decodeInput(
          ControlPlaneInvitationListQuery,
          {
            status: query.get("status") ?? "all",
            search: query.get("search")?.trim().normalize("NFC") ?? null,
            cursor: query.get("cursor"),
            limit: limit === null ? 20 : Number(limit),
          },
          "query",
        ),
        (decoded) => decodeInput(ListProjectInvitationsInput, { projectId, ...decoded }, "path"),
      );
    },
  );
}

export function decodeControlPlaneMemberPolicyInput(
  projectId: string,
  membershipId: string,
  body: unknown,
) {
  return Effect.flatMap(decodeInput(ControlPlaneMemberPolicyRequest, body, "body"), (decoded) =>
    decodeInput(
      UpdateProjectMemberPolicyInput,
      {
        projectId,
        membershipId,
        version: decoded.expectedVersion,
        role: decoded.role,
        localeAccess: decoded.localeAccess,
      },
      "path",
    ),
  );
}

export function decodeControlPlaneRemoveMemberInput(
  projectId: string,
  membershipId: string,
  body: unknown,
) {
  return Effect.flatMap(decodeInput(ControlPlaneVersionRequest, body, "body"), (decoded) =>
    decodeInput(
      RemoveProjectMemberInput,
      { projectId, membershipId, version: decoded.expectedVersion },
      "path",
    ),
  );
}

export function decodeControlPlaneCreateInvitationInput(projectId: string, body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneCreateInvitationRequest, body, "body"), (decoded) =>
    decodeInput(CreateProjectInvitationInput, { projectId, ...decoded }, "path"),
  );
}

export function decodeControlPlaneRevokeInvitationInput(
  projectId: string,
  invitationId: string,
  body: unknown,
) {
  return Effect.flatMap(decodeInput(ControlPlaneVersionRequest, body, "body"), (decoded) =>
    decodeInput(
      RevokeProjectInvitationInput,
      { projectId, invitationId, version: decoded.expectedVersion },
      "path",
    ),
  );
}

export function decodeControlPlaneInvitationTokenInput(body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneInvitationTokenRequest, body, "body"), (decoded) =>
    decodeInput(AcceptProjectInvitationInput, decoded, "body"),
  );
}

export function decodeControlPlaneLocaleListInput(projectId: string, raw: string) {
  return Effect.flatMap(parseBoundedQuery(raw, ["view", "includeRemoved"]), (query) => {
    const includeRemoved = query.get("includeRemoved");
    if (includeRemoved !== null && includeRemoved !== "true" && includeRemoved !== "false") {
      return Effect.fail(validationFailure("query.includeRemoved"));
    }
    return Effect.flatMap(
      decodeInput(
        ControlPlaneLocaleListQuery,
        {
          view: query.get("view") ?? "effective",
          includeRemoved: includeRemoved === "true",
        },
        "query",
      ),
      (decoded) =>
        decoded.view === "effective" && decoded.includeRemoved
          ? Effect.fail(validationFailure("query.includeRemoved"))
          : decodeInput(
              ListProjectLocalesInput,
              {
                projectId,
                view: decoded.view === "effective" ? "enabled" : "settings",
                includeRemoved: decoded.includeRemoved,
              },
              "path",
            ),
    );
  });
}

export function decodeControlPlaneCreateLocaleInput(projectId: string, body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneCreateLocaleRequest, body, "body"), (decoded) =>
    Effect.all({
      input: decodeInput(
        CreateProjectLocaleInput,
        { projectId, tag: decoded.tag, displayName: decoded.displayName },
        "path",
      ),
      commandId: Effect.succeed(decoded.commandId),
    }),
  );
}

export function decodeControlPlaneUpdateLocaleInput(
  projectId: string,
  localeId: string,
  body: unknown,
) {
  return Effect.flatMap(decodeInput(ControlPlaneUpdateLocaleRequest, body, "body"), (decoded) =>
    decodeInput(
      UpdateProjectLocaleDisplayNameInput,
      {
        projectId,
        localeId,
        version: decoded.expectedVersion,
        displayName: decoded.displayName,
      },
      "path",
    ),
  );
}

export function decodeControlPlaneLocaleStatusInput(
  projectId: string,
  localeId: string,
  body: unknown,
) {
  return Effect.flatMap(decodeInput(ControlPlaneLocaleStatusRequest, body, "body"), (decoded) =>
    decodeInput(
      UpdateProjectLocaleStatusInput,
      {
        projectId,
        localeId,
        version: decoded.expectedVersion,
        status: decoded.status,
        confirmDraftImpact: decoded.confirmDraftImpact,
      },
      "path",
    ),
  );
}

export function decodeControlPlaneLocaleOrderInput(projectId: string, body: unknown) {
  return Effect.flatMap(decodeInput(ControlPlaneLocaleOrderRequest, body, "body"), (decoded) =>
    decodeInput(
      ReorderProjectLocalesInput,
      {
        projectId,
        locales: decoded.locales.map((locale) => ({
          localeId: locale.localeId,
          version: locale.expectedVersion,
        })),
      },
      "path",
    ),
  );
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

export function decodeControlPlaneSetStudioRuntimeInput(
  projectId: string,
  environmentId: string,
  body: unknown,
) {
  return Effect.flatMap(decodeInput(ControlPlaneSetStudioRuntimeRequest, body, "body"), (decoded) =>
    decodeInput(
      ControlPlaneSetStudioRuntimeInput,
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
  setStudioRuntime: oauthOnly(CONTROL_PLANE_WRITE_SCOPE),
  getGovernance: oauthOnly(CONTROL_PLANE_GOVERNANCE_READ_SCOPE),
  listMembers: oauthOnly(CONTROL_PLANE_GOVERNANCE_READ_SCOPE),
  updateMemberPolicy: oauthOnly(CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE),
  removeMember: oauthOnly(CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE),
  listInvitations: oauthOnly(CONTROL_PLANE_GOVERNANCE_READ_SCOPE),
  createInvitation: oauthOnly(CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE),
  revokeInvitation: oauthOnly(CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE),
  inspectInvitation: oauthOnly(CONTROL_PLANE_GOVERNANCE_READ_SCOPE),
  acceptInvitation: oauthOnly(CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE),
  listLocales: projectAuthority(CONTROL_PLANE_GOVERNANCE_READ_SCOPE, ["locale.read"]),
  listLocaleSettings: projectAuthority(CONTROL_PLANE_GOVERNANCE_READ_SCOPE, ["locale.manage"]),
  manageLocales: projectAuthority(CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE, ["locale.manage"]),
  listCredentials: oauthOnly(CONTROL_PLANE_OPERATIONS_READ_SCOPE),
  manageCredentials: oauthOnly(CONTROL_PLANE_OPERATIONS_WRITE_SCOPE),
  listWebhooks: projectAuthority(CONTROL_PLANE_OPERATIONS_READ_SCOPE, ["webhook.read"]),
  manageWebhooks: projectAuthority(CONTROL_PLANE_OPERATIONS_WRITE_SCOPE, ["webhook.manage"]),
  listAuditEvents: oauthOnly(CONTROL_PLANE_SECURITY_READ_SCOPE),
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
  list: 2,
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

export interface ControlPlaneSessionPrincipal {
  readonly kind: "session_user";
  readonly userId: string;
}

export type ControlPlanePrincipal = ToolingPrincipal | ControlPlaneSessionPrincipal;

export const evaluateControlPlanePrincipalRateLimit = Effect.fn(
  "control-plane.public.rate-limit.principal",
)(function* (principal: ControlPlanePrincipal, cost: number) {
  return yield* (yield* RateLimitManager).evaluate({
    policy:
      principal.kind === "management_credential"
        ? "control-plane.credential"
        : "control-plane.user",
    identity: controlPlanePrincipalKey(principal),
    cost: RateLimitCost.make(cost),
  });
});

/** Maps every Control Plane transport principal to the shared domain actor authority. */
export function controlPlanePrincipalActor(principal: ControlPlanePrincipal): ControlPlaneActor {
  return principal.kind === "management_credential"
    ? { kind: "credential", id: principal.credential.credentialId }
    : { kind: "user", id: AuthUserId.make(principal.userId) };
}

/** Returns a transport-distinct, content-free rate-limit and idempotency identity. */
export function controlPlanePrincipalKey(principal: ControlPlanePrincipal): string {
  if (principal.kind === "management_credential") {
    return `credential:${principal.credential.credentialId}`;
  }
  return principal.kind === "oauth_user"
    ? `oauth:${principal.clientId}:${principal.userId}`
    : `session:${principal.userId}`;
}
