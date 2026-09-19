// Owns the bearer-only, originless Control Plane v1 Express transport boundary.

import { listProjectAuditEvents } from "@framerfordevs/api/operations/audit/index";
import {
  type ApplicationEffectTransform,
  createContext,
  type Context,
} from "@framerfordevs/api/context";
import { controlPlaneLimits } from "@framerfordevs/api/contracts/control-plane/index";
import {
  apiFailure,
  type ApiData,
  type ApiResponse,
} from "@framerfordevs/api/contracts/response/api/index";
import type { RateLimitDecision } from "@framerfordevs/api/contracts/rate-limit/index";
import { selectCanonicalNetworkSource } from "@framerfordevs/api/lib/network-source/index";
import {
  acceptInvitation as acceptControlPlaneInvitation,
  createInvitation as createControlPlaneInvitation,
  createLocale as createControlPlaneLocale,
  getGovernance as getControlPlaneGovernance,
  inspectInvitation as inspectControlPlaneInvitation,
  listInvitations as listControlPlaneInvitations,
  listLocales as listControlPlaneLocales,
  listMembers as listControlPlaneMembers,
  removeMember as removeControlPlaneMember,
  reorderLocales as reorderControlPlaneLocales,
  revokeInvitation as revokeControlPlaneInvitation,
  updateLocale as updateControlPlaneLocale,
  updateLocaleStatus as updateControlPlaneLocaleStatus,
  updateMemberPolicy as updateControlPlaneMemberPolicy,
} from "@framerfordevs/api/operations/control-plane/governance/index";
import {
  archiveProject as archiveControlPlaneProject,
  createProject as createControlPlaneProject,
  createWorkspace as createControlPlaneWorkspace,
  enableCapability as enableControlPlaneCapability,
  getProject as getControlPlaneProject,
  getStudioRegistration as getControlPlaneStudioRegistration,
  getWorkspace as getControlPlaneWorkspace,
  listCapabilities as listControlPlaneCapabilities,
  listProjects as listControlPlaneProjects,
  listWorkspaces as listControlPlaneWorkspaces,
  putStudioRegistration as putControlPlaneStudioRegistration,
  restoreProject as restoreControlPlaneProject,
  updateProject as updateControlPlaneProject,
} from "@framerfordevs/api/operations/control-plane/index";
import {
  changeControlPlaneCredentialRotation,
  issueControlPlaneCredential,
  listControlPlaneCredentials,
  revokeControlPlaneCredential,
  startControlPlaneCredentialRotation,
} from "@framerfordevs/api/operations/control-plane/operational/index";
import {
  changeControlPlaneWebhookSecretRotation,
  createControlPlaneInvalidationMapping,
  createControlPlaneWebhookEndpoint,
  getControlPlaneWebhookDelivery,
  listControlPlaneInvalidationMappings,
  listControlPlaneWebhookAttempts,
  listControlPlaneWebhookDeliveries,
  listControlPlaneWebhookEndpoints,
  replayControlPlaneWebhook,
  replaceControlPlaneWebhookSubscriptions,
  setControlPlaneInvalidationMappingState,
  setControlPlaneWebhookEndpointState,
  startControlPlaneWebhookSecretRotation,
  updateControlPlaneInvalidationMapping,
  updateControlPlaneWebhookEndpoint,
} from "@framerfordevs/api/operations/control-plane/operational/webhook";
import {
  authenticateControlPlaneRequest,
  controlPlaneBearerRequirements,
  controlPlanePrincipalActor,
  controlPlanePrincipalKey,
  controlPlaneRequestCosts,
  decodeControlPlaneCreateInvitationInput,
  decodeControlPlaneCreateInvalidationMappingRequest,
  decodeControlPlaneCreateLocaleInput,
  decodeControlPlaneCreateWebhookEndpointRequest,
  decodeControlPlaneCreateProjectInput,
  decodeControlPlaneCreateWorkspaceRequest,
  decodeControlPlaneCredentialListQuery,
  decodeControlPlaneCredentialRotationTransitionRequest,
  decodeControlPlaneEnableCapabilityInput,
  decodeControlPlaneInvalidationMappingListQuery,
  decodeControlPlaneInvalidationMappingStateRequest,
  decodeControlPlaneInvitationListInput,
  decodeControlPlaneInvitationTokenInput,
  decodeControlPlaneIssueCredentialRequest,
  decodeControlPlaneLocaleListInput,
  decodeControlPlaneLocaleOrderInput,
  decodeControlPlaneLocaleStatusInput,
  decodeControlPlaneMemberListInput,
  decodeControlPlaneOperationalCredentialScope,
  decodeControlPlaneOperationalDeliveryScope,
  decodeControlPlaneOperationalEnvironmentScope,
  decodeControlPlaneOperationalMappingScope,
  decodeControlPlaneOperationalRotationScope,
  decodeControlPlaneOperationalWebhookScope,
  decodeControlPlaneMemberPolicyInput,
  decodeControlPlaneListProjectsInput,
  decodeControlPlaneListWorkspacesQuery,
  decodeControlPlaneProjectAuditInput,
  decodeControlPlaneProjectLifecycleInput,
  decodeControlPlaneProjectScope,
  decodeControlPlanePutStudioRegistrationInput,
  decodeControlPlaneReplaceWebhookSubscriptionsRequest,
  decodeControlPlaneReplayWebhookRequest,
  decodeControlPlaneRevokeCredentialRequest,
  decodeControlPlaneRemoveMemberInput,
  decodeControlPlaneRevokeInvitationInput,
  decodeControlPlaneStartCredentialRotationRequest,
  decodeControlPlaneStartWebhookSecretRotationRequest,
  decodeControlPlaneStudioRegistrationScope,
  decodeControlPlaneUpdateLocaleInput,
  decodeControlPlaneUpdateInvalidationMappingRequest,
  decodeControlPlaneUpdateProjectInput,
  decodeControlPlaneUpdateWebhookEndpointRequest,
  decodeControlPlaneWebhookDeliveryListQuery,
  decodeControlPlaneWebhookEndpointListQuery,
  decodeControlPlaneWebhookEndpointStateRequest,
  decodeControlPlaneWebhookSecretTransitionRequest,
  decodeControlPlaneWorkspaceScope,
  evaluateControlPlaneGlobalRateLimit,
  evaluateControlPlanePrincipalRateLimit,
  type ControlPlaneBearerRequirement,
} from "@framerfordevs/api/operations/control-plane/public/index";
import { makeRequestContext } from "@framerfordevs/api/observability/request-context/index";
import {
  type ControlPlaneCostBucket,
  type ControlPlaneOperation,
  type ControlPlaneSubject,
  toStatusFamily,
} from "@framerfordevs/api/observability/telemetry/index";
import { observeControlPlaneRequest, reportBoundaryDefect } from "@framerfordevs/api/runtime/index";
import type { ToolingPrincipal } from "@framerfordevs/api/services/tooling/principal-authenticator/index";
import { apiReference } from "@scalar/express-api-reference";
import express, { type NextFunction, type Request, type Response, type Router } from "express";

function routeParameter(req: Request, key: string): string {
  const value = req.params[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function requestContext(req: Request) {
  return makeRequestContext({
    requestId: req.headers["x-request-id"],
    traceParent: req.headers.traceparent,
    method: req.method,
    path: req.path,
  });
}

function setRateLimitHeaders(res: Response, decision: RateLimitDecision): void {
  res.setHeader("RateLimit-Limit", String(decision.limit));
  res.setHeader("RateLimit-Remaining", String(decision.remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(decision.resetAtEpochMs / 1_000)));
  if (decision.retryAfterSeconds !== null) {
    res.setHeader("Retry-After", String(decision.retryAfterSeconds));
  }
}

interface ControlPlaneHttpObservation {
  readonly operation: ControlPlaneOperation;
  readonly costBucket: ControlPlaneCostBucket;
  readonly startedAt: number;
  subject: ControlPlaneSubject;
}

const controlPlaneHttpObservations = new WeakMap<Response, ControlPlaneHttpObservation>();

export function classifyControlPlaneRequest(
  method: string,
  path: string,
): {
  readonly operation: ControlPlaneOperation;
  readonly costBucket: ControlPlaneCostBucket;
} | null {
  if (path === "/workspaces" && method === "GET") {
    return { operation: "workspace_list", costBucket: "1" };
  }
  if (path === "/workspaces" && method === "POST") {
    return { operation: "workspace_create", costBucket: "5" };
  }
  if (/^\/workspaces\/[^/]+$/u.test(path) && method === "GET") {
    return { operation: "workspace_get", costBucket: "1" };
  }
  if (/^\/workspaces\/[^/]+\/projects$/u.test(path) && method === "GET") {
    return { operation: "project_list", costBucket: "1" };
  }
  if (/^\/workspaces\/[^/]+\/projects$/u.test(path) && method === "POST") {
    return { operation: "project_create", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+$/u.test(path) && method === "GET") {
    return { operation: "project_get", costBucket: "1" };
  }
  if (/^\/projects\/[^/]+$/u.test(path) && method === "PATCH") {
    return { operation: "project_update", costBucket: "3" };
  }
  if (/^\/projects\/[^/]+\/archive$/u.test(path) && method === "POST") {
    return { operation: "project_archive", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/restore$/u.test(path) && method === "POST") {
    return { operation: "project_restore", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/capabilities$/u.test(path) && method === "GET") {
    return { operation: "capability_list", costBucket: "1" };
  }
  if (/^\/projects\/[^/]+\/capabilities\/cms$/u.test(path) && method === "PUT") {
    return { operation: "capability_enable", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/governance$/u.test(path) && method === "GET") {
    return { operation: "governance_get", costBucket: "1" };
  }
  if (/^\/projects\/[^/]+\/members$/u.test(path) && method === "GET") {
    return { operation: "member_list", costBucket: "2" };
  }
  if (/^\/projects\/[^/]+\/members\/[^/]+\/policy$/u.test(path) && method === "PUT") {
    return { operation: "member_policy_update", costBucket: "3" };
  }
  if (/^\/projects\/[^/]+\/members\/[^/]+\/remove$/u.test(path) && method === "POST") {
    return { operation: "member_remove", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/invitations$/u.test(path) && method === "GET") {
    return { operation: "invitation_list", costBucket: "2" };
  }
  if (/^\/projects\/[^/]+\/invitations$/u.test(path) && method === "POST") {
    return { operation: "invitation_create", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/invitations\/[^/]+\/revoke$/u.test(path) && method === "POST") {
    return { operation: "invitation_revoke", costBucket: "5" };
  }
  if (path === "/invitations/inspect" && method === "POST") {
    return { operation: "invitation_inspect", costBucket: "1" };
  }
  if (path === "/invitations/accept" && method === "POST") {
    return { operation: "invitation_accept", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/locales$/u.test(path) && method === "GET") {
    return { operation: "locale_list", costBucket: "1" };
  }
  if (/^\/projects\/[^/]+\/locales$/u.test(path) && method === "POST") {
    return { operation: "locale_create", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/locales\/order$/u.test(path) && method === "PUT") {
    return { operation: "locale_reorder", costBucket: "3" };
  }
  if (/^\/projects\/[^/]+\/locales\/[^/]+$/u.test(path) && method === "PATCH") {
    return { operation: "locale_update", costBucket: "3" };
  }
  if (/^\/projects\/[^/]+\/locales\/[^/]+\/status$/u.test(path) && method === "PUT") {
    return { operation: "locale_status_update", costBucket: "3" };
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/webhooks$/u.test(path)) {
    if (method === "GET") return { operation: "webhook_endpoint_list", costBucket: "2" };
    if (method === "POST") return { operation: "webhook_endpoint_create", costBucket: "5" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+$/u.test(path) &&
    method === "PATCH"
  ) {
    return { operation: "webhook_endpoint_update", costBucket: "3" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+\/state$/u.test(path) &&
    method === "PUT"
  ) {
    return { operation: "webhook_endpoint_state", costBucket: "3" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+\/subscriptions$/u.test(path) &&
    method === "PUT"
  ) {
    return { operation: "webhook_subscription_replace", costBucket: "3" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+\/secret-rotations$/u.test(path) &&
    method === "POST"
  ) {
    return { operation: "webhook_secret_rotation_start", costBucket: "5" };
  }
  const secretTransition =
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+\/secret-rotations\/(activate|cancel|complete)$/u.exec(
      path,
    );
  if (secretTransition !== null && method === "POST") {
    const action = secretTransition[1];
    return {
      operation:
        action === "activate"
          ? "webhook_secret_rotation_activate"
          : action === "cancel"
            ? "webhook_secret_rotation_cancel"
            : "webhook_secret_rotation_complete",
      costBucket: "5",
    };
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/invalidation-mappings$/u.test(path)) {
    if (method === "GET") return { operation: "invalidation_mapping_list", costBucket: "2" };
    if (method === "POST") return { operation: "invalidation_mapping_create", costBucket: "5" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/invalidation-mappings\/[^/]+$/u.test(path) &&
    method === "PUT"
  ) {
    return { operation: "invalidation_mapping_update", costBucket: "3" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/invalidation-mappings\/[^/]+\/state$/u.test(path) &&
    method === "PUT"
  ) {
    return { operation: "invalidation_mapping_state", costBucket: "3" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhook-deliveries$/u.test(path) &&
    method === "GET"
  ) {
    return { operation: "webhook_delivery_list", costBucket: "2" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhook-deliveries\/[^/]+$/u.test(path) &&
    method === "GET"
  ) {
    return { operation: "webhook_delivery_get", costBucket: "1" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhook-deliveries\/[^/]+\/attempts$/u.test(path) &&
    method === "GET"
  ) {
    return { operation: "webhook_attempt_list", costBucket: "1" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhook-replays$/u.test(path) &&
    method === "POST"
  ) {
    return { operation: "webhook_replay", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/credentials$/u.test(path)) {
    if (method === "GET") return { operation: "credential_list", costBucket: "2" };
    if (method === "POST") return { operation: "credential_issue", costBucket: "5" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/credentials\/[^/]+\/rotations$/u.test(path) &&
    method === "POST"
  ) {
    return { operation: "credential_rotation_start", costBucket: "5" };
  }
  const rotationTransition =
    /^\/projects\/[^/]+\/environments\/[^/]+\/credential-rotations\/[^/]+\/(activate|cancel|complete)$/u.exec(
      path,
    );
  if (rotationTransition !== null && method === "POST") {
    const action = rotationTransition[1];
    return {
      operation:
        action === "activate"
          ? "credential_rotation_activate"
          : action === "cancel"
            ? "credential_rotation_cancel"
            : "credential_rotation_complete",
      costBucket: "5",
    };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/credentials\/[^/]+\/revoke$/u.test(path) &&
    method === "POST"
  ) {
    return { operation: "credential_revoke", costBucket: "5" };
  }
  if (/^\/projects\/[^/]+\/audit-events$/u.test(path) && method === "GET") {
    return { operation: "audit_list", costBucket: "2" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/studio-registration$/u.test(path) &&
    method === "GET"
  ) {
    return { operation: "studio_registration_get", costBucket: "1" };
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/studio-registration$/u.test(path) &&
    method === "PUT"
  ) {
    return { operation: "studio_registration_put", costBucket: "5" };
  }
  return null;
}

function setControlPlaneHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Authorization");
}

function sendControlPlaneResponse(
  req: Request,
  res: Response,
  status: number,
  response: ApiResponse<ApiData>,
): void {
  setControlPlaneHeaders(res);
  if (status === 401) res.setHeader("WWW-Authenticate", 'Bearer realm="control-plane"');
  let finalStatus = status;
  let finalResponse = response;
  let body = Buffer.from(JSON.stringify(finalResponse), "utf8");
  if (body.byteLength > controlPlaneLimits.responseBytes) {
    finalStatus = 413;
    finalResponse = apiFailure({
      code: "CONTROL_PLANE_RESPONSE_TOO_LARGE",
      message: "The Control Plane response exceeds the maximum size.",
      requestId: requestContext(req).requestId,
      retryable: false,
    });
    body = Buffer.from(JSON.stringify(finalResponse), "utf8");
  }
  res.status(finalStatus).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", String(body.byteLength));
  res.end(body);
}

function controlPlaneStepData<A extends ApiData>(
  req: Request,
  res: Response,
  result: { readonly status: number; readonly response: ApiResponse<A> },
): A | null {
  if (!result.response.ok) {
    sendControlPlaneResponse(req, res, result.status, result.response);
    return null;
  }
  return result.response.data;
}

async function enforceControlPlaneQuota(
  req: Request,
  res: Response,
  context: Context,
  principal: ToolingPrincipal | null,
  cost: number,
): Promise<boolean> {
  const result = await context.execute(
    principal === null
      ? "api.control-plane.rate-limit.global"
      : "api.control-plane.rate-limit.principal",
    principal === null
      ? evaluateControlPlaneGlobalRateLimit(cost)
      : evaluateControlPlanePrincipalRateLimit(principal, cost),
    "Control Plane quota evaluated.",
  );
  const decision = controlPlaneStepData(req, res, result);
  if (decision === null) return false;
  setRateLimitHeaders(res, decision);
  if (decision.allowed) return true;
  sendControlPlaneResponse(
    req,
    res,
    429,
    apiFailure({
      code: "RATE_LIMITED",
      message: "Too many requests. Try again later.",
      requestId: context.request.requestId,
      retryable: true,
    }),
  );
  return false;
}

async function prepareControlPlaneRequest(
  req: Request,
  res: Response,
  context: Context,
  requirement: ControlPlaneBearerRequirement,
  cost: number,
): Promise<ToolingPrincipal | undefined> {
  const principalResult = await context.execute(
    "api.control-plane.authenticate",
    authenticateControlPlaneRequest(
      req.headers.authorization ?? null,
      selectCanonicalNetworkSource(req.ip, req.socket.remoteAddress),
      requirement,
    ),
    "Control Plane principal authenticated.",
  );
  if (!principalResult.response.ok) {
    sendControlPlaneResponse(req, res, principalResult.status, principalResult.response);
    return undefined;
  }
  const principal = principalResult.response.data;
  const observation = controlPlaneHttpObservations.get(res);
  if (observation !== undefined) observation.subject = principal.kind;
  if (!(await enforceControlPlaneQuota(req, res, context, principal, cost))) return undefined;
  return principal;
}

function authorizationHeaderCount(req: Request): number {
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === "authorization") count += 1;
  }
  return count;
}

function controlPlaneAllowedMethods(path: string): ReadonlyArray<string> | null {
  if (path === "/workspaces") return ["GET", "POST"];
  if (/^\/workspaces\/[^/]+$/u.test(path)) return ["GET"];
  if (/^\/workspaces\/[^/]+\/projects$/u.test(path)) return ["GET", "POST"];
  if (/^\/projects\/[^/]+$/u.test(path)) return ["GET", "PATCH"];
  if (/^\/projects\/[^/]+\/(?:archive|restore)$/u.test(path)) return ["POST"];
  if (/^\/projects\/[^/]+\/capabilities$/u.test(path)) return ["GET"];
  if (/^\/projects\/[^/]+\/capabilities\/cms$/u.test(path)) return ["PUT"];
  if (/^\/projects\/[^/]+\/governance$/u.test(path)) return ["GET"];
  if (/^\/projects\/[^/]+\/members$/u.test(path)) return ["GET"];
  if (/^\/projects\/[^/]+\/members\/[^/]+\/policy$/u.test(path)) return ["PUT"];
  if (/^\/projects\/[^/]+\/members\/[^/]+\/remove$/u.test(path)) return ["POST"];
  if (/^\/projects\/[^/]+\/invitations$/u.test(path)) return ["GET", "POST"];
  if (/^\/projects\/[^/]+\/invitations\/[^/]+\/revoke$/u.test(path)) return ["POST"];
  if (/^\/invitations\/(?:inspect|accept)$/u.test(path)) return ["POST"];
  if (/^\/projects\/[^/]+\/locales$/u.test(path)) return ["GET", "POST"];
  if (/^\/projects\/[^/]+\/locales\/order$/u.test(path)) return ["PUT"];
  if (/^\/projects\/[^/]+\/locales\/[^/]+$/u.test(path)) return ["PATCH"];
  if (/^\/projects\/[^/]+\/locales\/[^/]+\/status$/u.test(path)) return ["PUT"];
  if (/^\/projects\/[^/]+\/audit-events$/u.test(path)) return ["GET"];
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/webhooks$/u.test(path)) {
    return ["GET", "POST"];
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+$/u.test(path)) {
    return ["PATCH"];
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+\/(?:state|subscriptions)$/u.test(path)
  ) {
    return ["PUT"];
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhooks\/[^/]+\/secret-rotations(?:\/(?:activate|cancel|complete))?$/u.test(
      path,
    )
  ) {
    return ["POST"];
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/invalidation-mappings$/u.test(path)) {
    return ["GET", "POST"];
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/invalidation-mappings\/[^/]+(?:\/state)?$/u.test(path)
  ) {
    return ["PUT"];
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/webhook-deliveries(?:\/[^/]+(?:\/attempts)?)?$/u.test(
      path,
    )
  ) {
    return ["GET"];
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/webhook-replays$/u.test(path)) {
    return ["POST"];
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/credentials$/u.test(path)) {
    return ["GET", "POST"];
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/credentials\/[^/]+\/(?:rotations|revoke)$/u.test(path)
  ) {
    return ["POST"];
  }
  if (
    /^\/projects\/[^/]+\/environments\/[^/]+\/credential-rotations\/[^/]+\/(?:activate|cancel|complete)$/u.test(
      path,
    )
  ) {
    return ["POST"];
  }
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/studio-registration$/u.test(path)) {
    return ["GET", "PUT"];
  }
  return null;
}

export function createControlPlaneRouter(
  openApiBytes: string,
  transformEffect?: ApplicationEffectTransform,
): Router {
  const router = express.Router();
  const controlPlaneContext = (req: Request) =>
    createContext(transformEffect === undefined ? { req } : { req, transformEffect });

  router.use(async (req, res, next) => {
    const classified = classifyControlPlaneRequest(req.method, req.path);
    if (classified !== null) {
      const observation: ControlPlaneHttpObservation = {
        ...classified,
        startedAt: performance.now(),
        subject: "unknown",
      };
      controlPlaneHttpObservations.set(res, observation);
      res.once("finish", () => {
        void observeControlPlaneRequest({
          operation: observation.operation,
          subject: observation.subject,
          outcome: res.statusCode < 400 ? "success" : "failure",
          statusFamily: toStatusFamily(res.statusCode),
          costBucket: observation.costBucket,
          durationMs: Math.max(0, performance.now() - observation.startedAt),
        }).catch(() => undefined);
      });
    }
    setControlPlaneHeaders(res);
    const specificationRoute = req.path === "/openapi.json" || req.path === "/docs";
    if (specificationRoute) {
      next();
      return;
    }
    if (req.headers.origin !== undefined || req.method === "OPTIONS") {
      sendControlPlaneResponse(
        req,
        res,
        403,
        apiFailure({
          code: "FORBIDDEN",
          message: "Browser-origin Control Plane requests are not allowed.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    const globalCost =
      classified === null ? controlPlaneRequestCosts.read : Number(classified.costBucket);
    if (!(await enforceControlPlaneQuota(req, res, controlPlaneContext(req), null, globalCost))) {
      return;
    }
    const allowedMethods = controlPlaneAllowedMethods(req.path);
    if (allowedMethods === null) {
      sendControlPlaneResponse(
        req,
        res,
        404,
        apiFailure({
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    if (!allowedMethods.includes(req.method)) {
      res.setHeader("Allow", allowedMethods.join(", "));
      sendControlPlaneResponse(
        req,
        res,
        405,
        apiFailure({
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    if (authorizationHeaderCount(req) > 1) {
      sendControlPlaneResponse(
        req,
        res,
        400,
        apiFailure({
          code: "VALIDATION_ERROR",
          message: "Use exactly one Authorization header.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    const rawQuery = req.originalUrl.split("?", 2)[1] ?? "";
    if (Buffer.byteLength(rawQuery, "utf8") > controlPlaneLimits.queryBytes) {
      sendControlPlaneResponse(
        req,
        res,
        413,
        apiFailure({
          code: "CONTROL_PLANE_REQUEST_TOO_LARGE",
          message: "The Control Plane query exceeds the maximum size.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    const listQuery =
      req.method === "GET" &&
      (req.path === "/workspaces" ||
        /^\/workspaces\/[^/]+\/projects$/u.test(req.path) ||
        /^\/projects\/[^/]+\/(?:members|invitations|locales|audit-events)$/u.test(req.path) ||
        /^\/projects\/[^/]+\/environments\/[^/]+\/(?:credentials|webhooks|invalidation-mappings|webhook-deliveries)$/u.test(
          req.path,
        ));
    if (rawQuery !== "" && !listQuery) {
      sendControlPlaneResponse(
        req,
        res,
        400,
        apiFailure({
          code: "VALIDATION_ERROR",
          message: "This Control Plane route does not accept query parameters.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    const contentLength = req.headers["content-length"];
    if (
      typeof contentLength === "string" &&
      (!/^[0-9]+$/u.test(contentLength) || Number(contentLength) > controlPlaneLimits.requestBytes)
    ) {
      sendControlPlaneResponse(
        req,
        res,
        413,
        apiFailure({
          code: "CONTROL_PLANE_REQUEST_TOO_LARGE",
          message: "The Control Plane request exceeds the maximum size.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    if (
      req.method === "GET" &&
      ((typeof contentLength === "string" && contentLength !== "0") ||
        req.headers["transfer-encoding"] !== undefined)
    ) {
      sendControlPlaneResponse(
        req,
        res,
        400,
        apiFailure({
          code: "VALIDATION_ERROR",
          message: "Control Plane GET requests do not accept a body.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    if (["POST", "PUT", "PATCH"].includes(req.method) && !req.is("application/json")) {
      sendControlPlaneResponse(
        req,
        res,
        400,
        apiFailure({
          code: "VALIDATION_ERROR",
          message: "Control Plane mutations require application/json.",
          requestId: requestContext(req).requestId,
          retryable: false,
        }),
      );
      return;
    }
    next();
  });

  router.get("/openapi.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type("application/json").send(openApiBytes);
  });
  router.get(
    "/docs",
    (_req, res, next) => {
      res.setHeader("Cache-Control", "public, max-age=300");
      next();
    },
    apiReference({
      pageTitle: "Framer for Devs Control Plane API",
      url: "/api/control-plane/v1/openapi.json",
    }),
  );

  router.use(express.json({ limit: controlPlaneLimits.requestBytes, strict: true }));

  router.get("/workspaces", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listWorkspaces,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const queryResult = await context.execute(
      "api.control-plane.workspace.list.query",
      decodeControlPlaneListWorkspacesQuery(req.originalUrl.split("?", 2)[1] ?? ""),
      "Control Plane workspace query decoded.",
    );
    const query = controlPlaneStepData(req, res, queryResult);
    if (query === null) return;
    const result = await context.execute(
      "api.control-plane.workspace.list",
      listControlPlaneWorkspaces(
        controlPlanePrincipalActor(principal),
        controlPlanePrincipalKey(principal),
        query,
      ),
      "Control Plane workspaces loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/workspaces", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.createWorkspace,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const inputResult = await context.execute(
      "api.control-plane.workspace.create.body",
      decodeControlPlaneCreateWorkspaceRequest(req.body),
      "Control Plane workspace body decoded.",
    );
    const input = controlPlaneStepData(req, res, inputResult);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.workspace.create",
      createControlPlaneWorkspace(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane workspace created.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get("/workspaces/:workspaceId", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.getWorkspace,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.workspace.get.path",
      decodeControlPlaneWorkspaceScope(routeParameter(req, "workspaceId")),
      "Control Plane workspace path decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.control-plane.workspace.get",
      getControlPlaneWorkspace(controlPlanePrincipalActor(principal), scope),
      "Control Plane workspace loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get("/workspaces/:workspaceId/projects", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listProjects,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const inputResult = await context.execute(
      "api.control-plane.project.list.input",
      decodeControlPlaneListProjectsInput(
        routeParameter(req, "workspaceId"),
        req.originalUrl.split("?", 2)[1] ?? "",
      ),
      "Control Plane project list input decoded.",
    );
    const input = controlPlaneStepData(req, res, inputResult);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.project.list",
      listControlPlaneProjects(
        controlPlanePrincipalActor(principal),
        controlPlanePrincipalKey(principal),
        input,
      ),
      "Control Plane projects loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/workspaces/:workspaceId/projects", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.createProject,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const inputResult = await context.execute(
      "api.control-plane.project.create.input",
      decodeControlPlaneCreateProjectInput(routeParameter(req, "workspaceId"), req.body),
      "Control Plane project create input decoded.",
    );
    const input = controlPlaneStepData(req, res, inputResult);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.project.create",
      createControlPlaneProject(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane project created.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get("/projects/:projectId", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.getProject,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.project.get.path",
      decodeControlPlaneProjectScope(routeParameter(req, "projectId")),
      "Control Plane project path decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.control-plane.project.get",
      getControlPlaneProject(controlPlanePrincipalActor(principal), scope),
      "Control Plane project loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.patch("/projects/:projectId", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.updateProject,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const inputResult = await context.execute(
      "api.control-plane.project.update.input",
      decodeControlPlaneUpdateProjectInput(routeParameter(req, "projectId"), req.body),
      "Control Plane project update input decoded.",
    );
    const input = controlPlaneStepData(req, res, inputResult);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.project.update",
      updateControlPlaneProject(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane project updated.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const lifecycleHandler =
    (operation: "archive" | "restore") => async (req: Request, res: Response) => {
      const context = controlPlaneContext(req);
      const principal = await prepareControlPlaneRequest(
        req,
        res,
        context,
        operation === "archive"
          ? controlPlaneBearerRequirements.archiveProject
          : controlPlaneBearerRequirements.restoreProject,
        controlPlaneRequestCosts.lifecycle,
      );
      if (principal === undefined) return;
      const inputResult = await context.execute(
        `api.control-plane.project.${operation}.input`,
        decodeControlPlaneProjectLifecycleInput(routeParameter(req, "projectId"), req.body),
        "Control Plane project lifecycle input decoded.",
      );
      const input = controlPlaneStepData(req, res, inputResult);
      if (input === null) return;
      const result = await context.execute(
        `api.control-plane.project.${operation}`,
        operation === "archive"
          ? archiveControlPlaneProject(
              controlPlanePrincipalActor(principal),
              input,
              context.request.requestId,
            )
          : restoreControlPlaneProject(
              controlPlanePrincipalActor(principal),
              input,
              context.request.requestId,
            ),
        `Control Plane project ${operation}d.`,
      );
      sendControlPlaneResponse(req, res, result.status, result.response);
    };
  router.post("/projects/:projectId/archive", lifecycleHandler("archive"));
  router.post("/projects/:projectId/restore", lifecycleHandler("restore"));

  router.get("/projects/:projectId/capabilities", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listCapabilities,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.capability.list.path",
      decodeControlPlaneProjectScope(routeParameter(req, "projectId")),
      "Control Plane capability path decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.control-plane.capability.list",
      listControlPlaneCapabilities(controlPlanePrincipalActor(principal), scope),
      "Control Plane capabilities loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put("/projects/:projectId/capabilities/cms", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.enableCapability,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const inputResult = await context.execute(
      "api.control-plane.capability.enable.input",
      decodeControlPlaneEnableCapabilityInput(routeParameter(req, "projectId"), req.body),
      "Control Plane capability input decoded.",
    );
    const input = controlPlaneStepData(req, res, inputResult);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.capability.enable",
      enableControlPlaneCapability(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane capability enabled.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get("/projects/:projectId/governance", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.getGovernance,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.governance.get.path",
      decodeControlPlaneProjectScope(routeParameter(req, "projectId")),
      "Control Plane governance path decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.governance.get",
      getControlPlaneGovernance(controlPlanePrincipalActor(principal), input),
      "Control Plane governance loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get("/projects/:projectId/members", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listMembers,
      controlPlaneRequestCosts.list,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.member.list.input",
      decodeControlPlaneMemberListInput(
        routeParameter(req, "projectId"),
        req.originalUrl.split("?", 2)[1] ?? "",
      ),
      "Control Plane member list input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.member.list",
      listControlPlaneMembers(
        controlPlanePrincipalActor(principal),
        controlPlanePrincipalKey(principal),
        input,
      ),
      "Control Plane members loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put("/projects/:projectId/members/:membershipId/policy", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.updateMemberPolicy,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.member.policy.input",
      decodeControlPlaneMemberPolicyInput(
        routeParameter(req, "projectId"),
        routeParameter(req, "membershipId"),
        req.body,
      ),
      "Control Plane member policy input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.member.policy.update",
      updateControlPlaneMemberPolicy(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane member policy updated.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/projects/:projectId/members/:membershipId/remove", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.removeMember,
      controlPlaneRequestCosts.lifecycle,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.member.remove.input",
      decodeControlPlaneRemoveMemberInput(
        routeParameter(req, "projectId"),
        routeParameter(req, "membershipId"),
        req.body,
      ),
      "Control Plane member removal input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.member.remove",
      removeControlPlaneMember(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane member removed.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get("/projects/:projectId/invitations", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listInvitations,
      controlPlaneRequestCosts.list,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.invitation.list.input",
      decodeControlPlaneInvitationListInput(
        routeParameter(req, "projectId"),
        req.originalUrl.split("?", 2)[1] ?? "",
      ),
      "Control Plane invitation list input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.invitation.list",
      listControlPlaneInvitations(
        controlPlanePrincipalActor(principal),
        controlPlanePrincipalKey(principal),
        input,
      ),
      "Control Plane invitations loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/projects/:projectId/invitations", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.createInvitation,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.invitation.create.input",
      decodeControlPlaneCreateInvitationInput(routeParameter(req, "projectId"), req.body),
      "Control Plane invitation create input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.invitation.create",
      createControlPlaneInvitation(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane invitation created.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/projects/:projectId/invitations/:invitationId/revoke", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.revokeInvitation,
      controlPlaneRequestCosts.lifecycle,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.invitation.revoke.input",
      decodeControlPlaneRevokeInvitationInput(
        routeParameter(req, "projectId"),
        routeParameter(req, "invitationId"),
        req.body,
      ),
      "Control Plane invitation revoke input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.invitation.revoke",
      revokeControlPlaneInvitation(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane invitation revoked.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/invitations/inspect", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.inspectInvitation,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.invitation.inspect.input",
      decodeControlPlaneInvitationTokenInput(req.body),
      "Control Plane invitation inspect input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.invitation.inspect",
      inspectControlPlaneInvitation(controlPlanePrincipalActor(principal), input),
      "Control Plane invitation inspected.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/invitations/accept", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.acceptInvitation,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.invitation.accept.input",
      decodeControlPlaneInvitationTokenInput(req.body),
      "Control Plane invitation accept input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.invitation.accept",
      acceptControlPlaneInvitation(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane invitation accepted.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get("/projects/:projectId/locales", async (req, res) => {
    const context = controlPlaneContext(req);
    const rawQuery = req.originalUrl.split("?", 2)[1] ?? "";
    const settingsView = new URLSearchParams(rawQuery).get("view") === "settings";
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      settingsView
        ? controlPlaneBearerRequirements.listLocaleSettings
        : controlPlaneBearerRequirements.listLocales,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.locale.list.input",
      decodeControlPlaneLocaleListInput(routeParameter(req, "projectId"), rawQuery),
      "Control Plane locale list input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.locale.list",
      listControlPlaneLocales(controlPlanePrincipalActor(principal), input),
      "Control Plane locales loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post("/projects/:projectId/locales", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageLocales,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.locale.create.input",
      decodeControlPlaneCreateLocaleInput(routeParameter(req, "projectId"), req.body),
      "Control Plane locale create input decoded.",
    );
    const data = controlPlaneStepData(req, res, decoded);
    if (data === null) return;
    const result = await context.execute(
      "api.control-plane.locale.create",
      createControlPlaneLocale(
        controlPlanePrincipalActor(principal),
        data.input,
        data.commandId,
        context.request.requestId,
      ),
      "Control Plane locale created.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.patch("/projects/:projectId/locales/:localeId", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageLocales,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.locale.update.input",
      decodeControlPlaneUpdateLocaleInput(
        routeParameter(req, "projectId"),
        routeParameter(req, "localeId"),
        req.body,
      ),
      "Control Plane locale update input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.locale.update",
      updateControlPlaneLocale(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane locale updated.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put("/projects/:projectId/locales/order", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageLocales,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.locale.reorder.input",
      decodeControlPlaneLocaleOrderInput(routeParameter(req, "projectId"), req.body),
      "Control Plane locale order input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.locale.reorder",
      reorderControlPlaneLocales(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane locales reordered.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put("/projects/:projectId/locales/:localeId/status", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageLocales,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const decoded = await context.execute(
      "api.control-plane.locale.status.input",
      decodeControlPlaneLocaleStatusInput(
        routeParameter(req, "projectId"),
        routeParameter(req, "localeId"),
        req.body,
      ),
      "Control Plane locale status input decoded.",
    );
    const input = controlPlaneStepData(req, res, decoded);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.locale.status.update",
      updateControlPlaneLocaleStatus(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane locale status updated.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const studioPath = "/projects/:projectId/environments/:environmentId/studio-registration";
  router.get(studioPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.getStudioRegistration,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.studio-registration.get.path",
      decodeControlPlaneStudioRegistrationScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane Studio registration path decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.control-plane.studio-registration.get",
      getControlPlaneStudioRegistration(controlPlanePrincipalActor(principal), scope),
      "Control Plane Studio registration loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put(studioPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.putStudioRegistration,
      controlPlaneRequestCosts.studioWrite,
    );
    if (principal === undefined) return;
    const inputResult = await context.execute(
      "api.control-plane.studio-registration.put.input",
      decodeControlPlanePutStudioRegistrationInput(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        req.body,
      ),
      "Control Plane Studio registration input decoded.",
    );
    const input = controlPlaneStepData(req, res, inputResult);
    if (input === null) return;
    const result = await context.execute(
      "api.control-plane.studio-registration.put",
      putControlPlaneStudioRegistration(
        controlPlanePrincipalActor(principal),
        input,
        context.request.requestId,
      ),
      "Control Plane Studio registration stored.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const webhookCollectionPath = "/projects/:projectId/environments/:environmentId/webhooks";
  router.get(webhookCollectionPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listWebhooks,
      controlPlaneRequestCosts.list,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.list.path",
      decodeControlPlaneOperationalEnvironmentScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane webhook scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const queryResult = await context.execute(
      "api.control-plane.webhook.list.query",
      decodeControlPlaneWebhookEndpointListQuery(req.originalUrl.split("?", 2)[1] ?? ""),
      "Control Plane webhook query decoded.",
    );
    const query = controlPlaneStepData(req, res, queryResult);
    if (query === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.list",
      listControlPlaneWebhookEndpoints(
        controlPlanePrincipalActor(principal),
        controlPlanePrincipalKey(principal),
        scope.projectId,
        scope.environmentId,
        query,
      ),
      "Control Plane webhooks loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post(webhookCollectionPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.create.path",
      decodeControlPlaneOperationalEnvironmentScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane webhook scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.webhook.create.body",
      decodeControlPlaneCreateWebhookEndpointRequest(req.body),
      "Control Plane webhook body decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.create",
      createControlPlaneWebhookEndpoint(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        body,
        context.request.requestId,
      ),
      "Control Plane webhook created.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const webhookPath = `${webhookCollectionPath}/:endpointId`;
  router.patch(webhookPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.update.path",
      decodeControlPlaneOperationalWebhookScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "endpointId"),
      ),
      "Control Plane webhook scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.webhook.update.body",
      decodeControlPlaneUpdateWebhookEndpointRequest(req.body),
      "Control Plane webhook body decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.update",
      updateControlPlaneWebhookEndpoint(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.endpointId,
        body,
        context.request.requestId,
      ),
      "Control Plane webhook updated.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put(`${webhookPath}/state`, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.state.path",
      decodeControlPlaneOperationalWebhookScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "endpointId"),
      ),
      "Control Plane webhook scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.webhook.state.body",
      decodeControlPlaneWebhookEndpointStateRequest(req.body),
      "Control Plane webhook state decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.state",
      setControlPlaneWebhookEndpointState(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.endpointId,
        body,
        context.request.requestId,
      ),
      "Control Plane webhook state changed.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put(`${webhookPath}/subscriptions`, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.subscription.path",
      decodeControlPlaneOperationalWebhookScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "endpointId"),
      ),
      "Control Plane webhook scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.webhook.subscription.body",
      decodeControlPlaneReplaceWebhookSubscriptionsRequest(req.body),
      "Control Plane webhook subscriptions decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.subscription.replace",
      replaceControlPlaneWebhookSubscriptions(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.endpointId,
        body,
        context.request.requestId,
      ),
      "Control Plane webhook subscriptions replaced.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const secretRotationPath = `${webhookPath}/secret-rotations`;
  router.post(secretRotationPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.lifecycle,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.secret.start.path",
      decodeControlPlaneOperationalWebhookScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "endpointId"),
      ),
      "Control Plane webhook scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.webhook.secret.start.body",
      decodeControlPlaneStartWebhookSecretRotationRequest(req.body),
      "Control Plane webhook secret rotation decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.secret.start",
      startControlPlaneWebhookSecretRotation(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.endpointId,
        body,
        context.request.requestId,
      ),
      "Control Plane webhook secret rotation started.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const secretTransitionHandler =
    (action: "activate" | "cancel" | "complete") => async (req: Request, res: Response) => {
      const context = controlPlaneContext(req);
      const principal = await prepareControlPlaneRequest(
        req,
        res,
        context,
        controlPlaneBearerRequirements.manageWebhooks,
        controlPlaneRequestCosts.lifecycle,
      );
      if (principal === undefined) return;
      const scopeResult = await context.execute(
        `api.control-plane.webhook.secret.${action}.path`,
        decodeControlPlaneOperationalWebhookScope(
          routeParameter(req, "projectId"),
          routeParameter(req, "environmentId"),
          routeParameter(req, "endpointId"),
        ),
        "Control Plane webhook scope decoded.",
      );
      const scope = controlPlaneStepData(req, res, scopeResult);
      if (scope === null) return;
      const bodyResult = await context.execute(
        `api.control-plane.webhook.secret.${action}.body`,
        decodeControlPlaneWebhookSecretTransitionRequest(req.body),
        "Control Plane webhook secret transition decoded.",
      );
      const body = controlPlaneStepData(req, res, bodyResult);
      if (body === null) return;
      const result = await context.execute(
        `api.control-plane.webhook.secret.${action}`,
        changeControlPlaneWebhookSecretRotation(
          controlPlanePrincipalActor(principal),
          scope.projectId,
          scope.environmentId,
          scope.endpointId,
          action,
          body,
          context.request.requestId,
        ),
        "Control Plane webhook secret rotation changed.",
      );
      sendControlPlaneResponse(req, res, result.status, result.response);
    };
  router.post(`${secretRotationPath}/activate`, secretTransitionHandler("activate"));
  router.post(`${secretRotationPath}/cancel`, secretTransitionHandler("cancel"));
  router.post(`${secretRotationPath}/complete`, secretTransitionHandler("complete"));

  const mappingCollectionPath =
    "/projects/:projectId/environments/:environmentId/invalidation-mappings";
  router.get(mappingCollectionPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listWebhooks,
      controlPlaneRequestCosts.list,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.mapping.list.path",
      decodeControlPlaneOperationalEnvironmentScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane invalidation scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const queryResult = await context.execute(
      "api.control-plane.mapping.list.query",
      decodeControlPlaneInvalidationMappingListQuery(req.originalUrl.split("?", 2)[1] ?? ""),
      "Control Plane invalidation query decoded.",
    );
    const query = controlPlaneStepData(req, res, queryResult);
    if (query === null) return;
    const result = await context.execute(
      "api.control-plane.mapping.list",
      listControlPlaneInvalidationMappings(
        controlPlanePrincipalActor(principal),
        controlPlanePrincipalKey(principal),
        scope.projectId,
        scope.environmentId,
        query,
      ),
      "Control Plane invalidation mappings loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post(mappingCollectionPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.mapping.create.path",
      decodeControlPlaneOperationalEnvironmentScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane invalidation scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.mapping.create.body",
      decodeControlPlaneCreateInvalidationMappingRequest(req.body),
      "Control Plane invalidation mapping decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.mapping.create",
      createControlPlaneInvalidationMapping(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        body,
        context.request.requestId,
      ),
      "Control Plane invalidation mapping created.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const mappingPath = `${mappingCollectionPath}/:mappingId`;
  router.put(mappingPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.mapping.update.path",
      decodeControlPlaneOperationalMappingScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "mappingId"),
      ),
      "Control Plane invalidation scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.mapping.update.body",
      decodeControlPlaneUpdateInvalidationMappingRequest(req.body),
      "Control Plane invalidation mapping decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.mapping.update",
      updateControlPlaneInvalidationMapping(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.mappingId,
        body,
        context.request.requestId,
      ),
      "Control Plane invalidation mapping updated.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.put(`${mappingPath}/state`, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageWebhooks,
      controlPlaneRequestCosts.update,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.mapping.state.path",
      decodeControlPlaneOperationalMappingScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "mappingId"),
      ),
      "Control Plane invalidation scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const bodyResult = await context.execute(
      "api.control-plane.mapping.state.body",
      decodeControlPlaneInvalidationMappingStateRequest(req.body),
      "Control Plane invalidation mapping state decoded.",
    );
    const body = controlPlaneStepData(req, res, bodyResult);
    if (body === null) return;
    const result = await context.execute(
      "api.control-plane.mapping.state",
      setControlPlaneInvalidationMappingState(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.mappingId,
        body,
        context.request.requestId,
      ),
      "Control Plane invalidation mapping state changed.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const deliveryCollectionPath =
    "/projects/:projectId/environments/:environmentId/webhook-deliveries";
  router.get(deliveryCollectionPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listWebhooks,
      controlPlaneRequestCosts.list,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.delivery.list.path",
      decodeControlPlaneOperationalEnvironmentScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane delivery scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const queryResult = await context.execute(
      "api.control-plane.webhook.delivery.list.query",
      decodeControlPlaneWebhookDeliveryListQuery(req.originalUrl.split("?", 2)[1] ?? ""),
      "Control Plane delivery query decoded.",
    );
    const query = controlPlaneStepData(req, res, queryResult);
    if (query === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.delivery.list",
      listControlPlaneWebhookDeliveries(
        controlPlanePrincipalActor(principal),
        controlPlanePrincipalKey(principal),
        scope.projectId,
        scope.environmentId,
        query,
      ),
      "Control Plane webhook deliveries loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  const deliveryPath = `${deliveryCollectionPath}/:deliveryId`;
  router.get(deliveryPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listWebhooks,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.delivery.get.path",
      decodeControlPlaneOperationalDeliveryScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "deliveryId"),
      ),
      "Control Plane delivery scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.delivery.get",
      getControlPlaneWebhookDelivery(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.deliveryId,
      ),
      "Control Plane webhook delivery loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.get(`${deliveryPath}/attempts`, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listWebhooks,
      controlPlaneRequestCosts.read,
    );
    if (principal === undefined) return;
    const scopeResult = await context.execute(
      "api.control-plane.webhook.attempt.list.path",
      decodeControlPlaneOperationalDeliveryScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
        routeParameter(req, "deliveryId"),
      ),
      "Control Plane attempt scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const result = await context.execute(
      "api.control-plane.webhook.attempt.list",
      listControlPlaneWebhookAttempts(
        controlPlanePrincipalActor(principal),
        scope.projectId,
        scope.environmentId,
        scope.deliveryId,
      ),
      "Control Plane webhook attempts loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post(
    "/projects/:projectId/environments/:environmentId/webhook-replays",
    async (req, res) => {
      const context = controlPlaneContext(req);
      const principal = await prepareControlPlaneRequest(
        req,
        res,
        context,
        controlPlaneBearerRequirements.manageWebhooks,
        controlPlaneRequestCosts.lifecycle,
      );
      if (principal === undefined) return;
      const scopeResult = await context.execute(
        "api.control-plane.webhook.replay.path",
        decodeControlPlaneOperationalEnvironmentScope(
          routeParameter(req, "projectId"),
          routeParameter(req, "environmentId"),
        ),
        "Control Plane webhook replay scope decoded.",
      );
      const scope = controlPlaneStepData(req, res, scopeResult);
      if (scope === null) return;
      const bodyResult = await context.execute(
        "api.control-plane.webhook.replay.body",
        decodeControlPlaneReplayWebhookRequest(req.body),
        "Control Plane webhook replay decoded.",
      );
      const body = controlPlaneStepData(req, res, bodyResult);
      if (body === null) return;
      const result = await context.execute(
        "api.control-plane.webhook.replay",
        replayControlPlaneWebhook(
          controlPlanePrincipalActor(principal),
          scope.projectId,
          scope.environmentId,
          body,
          context.request.requestId,
        ),
        "Control Plane webhook replay created.",
      );
      sendControlPlaneResponse(req, res, result.status, result.response);
    },
  );

  const credentialCollectionPath = "/projects/:projectId/environments/:environmentId/credentials";
  router.get(credentialCollectionPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listCredentials,
      controlPlaneRequestCosts.list,
    );
    if (principal === undefined || principal.kind !== "oauth_user") return;
    const scopeResult = await context.execute(
      "api.control-plane.credential.list.path",
      decodeControlPlaneOperationalEnvironmentScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane credential scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const queryResult = await context.execute(
      "api.control-plane.credential.list.query",
      decodeControlPlaneCredentialListQuery(req.originalUrl.split("?", 2)[1] ?? ""),
      "Control Plane credential query decoded.",
    );
    const query = controlPlaneStepData(req, res, queryResult);
    if (query === null) return;
    const result = await context.execute(
      "api.control-plane.credential.list",
      listControlPlaneCredentials(
        principal.userId,
        controlPlanePrincipalKey(principal),
        scope.projectId,
        scope.environmentId,
        query,
      ),
      "Control Plane credentials loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post(credentialCollectionPath, async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.manageCredentials,
      controlPlaneRequestCosts.create,
    );
    if (principal === undefined || principal.kind !== "oauth_user") return;
    const scopeResult = await context.execute(
      "api.control-plane.credential.issue.path",
      decodeControlPlaneOperationalEnvironmentScope(
        routeParameter(req, "projectId"),
        routeParameter(req, "environmentId"),
      ),
      "Control Plane credential scope decoded.",
    );
    const scope = controlPlaneStepData(req, res, scopeResult);
    if (scope === null) return;
    const requestResult = await context.execute(
      "api.control-plane.credential.issue.body",
      decodeControlPlaneIssueCredentialRequest(req.body),
      "Control Plane credential issue body decoded.",
    );
    const request = controlPlaneStepData(req, res, requestResult);
    if (request === null) return;
    const result = await context.execute(
      "api.control-plane.credential.issue",
      issueControlPlaneCredential(
        principal.userId,
        scope.projectId,
        scope.environmentId,
        request,
        context.request.requestId,
      ),
      "Control Plane credential issued.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.post(
    "/projects/:projectId/environments/:environmentId/credentials/:credentialId/rotations",
    async (req, res) => {
      const context = controlPlaneContext(req);
      const principal = await prepareControlPlaneRequest(
        req,
        res,
        context,
        controlPlaneBearerRequirements.manageCredentials,
        controlPlaneRequestCosts.lifecycle,
      );
      if (principal === undefined || principal.kind !== "oauth_user") return;
      const scopeResult = await context.execute(
        "api.control-plane.credential.rotation.start.path",
        decodeControlPlaneOperationalCredentialScope(
          routeParameter(req, "projectId"),
          routeParameter(req, "environmentId"),
          routeParameter(req, "credentialId"),
        ),
        "Control Plane credential rotation scope decoded.",
      );
      const scope = controlPlaneStepData(req, res, scopeResult);
      if (scope === null) return;
      const requestResult = await context.execute(
        "api.control-plane.credential.rotation.start.body",
        decodeControlPlaneStartCredentialRotationRequest(req.body),
        "Control Plane credential rotation body decoded.",
      );
      const request = controlPlaneStepData(req, res, requestResult);
      if (request === null) return;
      const result = await context.execute(
        "api.control-plane.credential.rotation.start",
        startControlPlaneCredentialRotation(
          principal.userId,
          scope.projectId,
          scope.environmentId,
          scope.credentialId,
          request,
          context.request.requestId,
        ),
        "Control Plane credential rotation started.",
      );
      sendControlPlaneResponse(req, res, result.status, result.response);
    },
  );

  const credentialRotationTransitionHandler =
    (action: "activate" | "cancel" | "complete") => async (req: Request, res: Response) => {
      const context = controlPlaneContext(req);
      const principal = await prepareControlPlaneRequest(
        req,
        res,
        context,
        controlPlaneBearerRequirements.manageCredentials,
        controlPlaneRequestCosts.lifecycle,
      );
      if (principal === undefined || principal.kind !== "oauth_user") return;
      const scopeResult = await context.execute(
        `api.control-plane.credential.rotation.${action}.path`,
        decodeControlPlaneOperationalRotationScope(
          routeParameter(req, "projectId"),
          routeParameter(req, "environmentId"),
          routeParameter(req, "rotationId"),
        ),
        "Control Plane credential rotation scope decoded.",
      );
      const scope = controlPlaneStepData(req, res, scopeResult);
      if (scope === null) return;
      const requestResult = await context.execute(
        `api.control-plane.credential.rotation.${action}.body`,
        decodeControlPlaneCredentialRotationTransitionRequest(req.body),
        "Control Plane credential rotation transition decoded.",
      );
      const request = controlPlaneStepData(req, res, requestResult);
      if (request === null) return;
      const result = await context.execute(
        `api.control-plane.credential.rotation.${action}`,
        changeControlPlaneCredentialRotation(
          principal.userId,
          scope.projectId,
          scope.environmentId,
          scope.rotationId,
          action,
          request,
          context.request.requestId,
        ),
        "Control Plane credential rotation changed.",
      );
      sendControlPlaneResponse(req, res, result.status, result.response);
    };
  const rotationPath =
    "/projects/:projectId/environments/:environmentId/credential-rotations/:rotationId";
  router.post(`${rotationPath}/activate`, credentialRotationTransitionHandler("activate"));
  router.post(`${rotationPath}/cancel`, credentialRotationTransitionHandler("cancel"));
  router.post(`${rotationPath}/complete`, credentialRotationTransitionHandler("complete"));

  router.post(
    "/projects/:projectId/environments/:environmentId/credentials/:credentialId/revoke",
    async (req, res) => {
      const context = controlPlaneContext(req);
      const principal = await prepareControlPlaneRequest(
        req,
        res,
        context,
        controlPlaneBearerRequirements.manageCredentials,
        controlPlaneRequestCosts.lifecycle,
      );
      if (principal === undefined || principal.kind !== "oauth_user") return;
      const scopeResult = await context.execute(
        "api.control-plane.credential.revoke.path",
        decodeControlPlaneOperationalCredentialScope(
          routeParameter(req, "projectId"),
          routeParameter(req, "environmentId"),
          routeParameter(req, "credentialId"),
        ),
        "Control Plane credential revoke scope decoded.",
      );
      const scope = controlPlaneStepData(req, res, scopeResult);
      if (scope === null) return;
      const requestResult = await context.execute(
        "api.control-plane.credential.revoke.body",
        decodeControlPlaneRevokeCredentialRequest(req.body),
        "Control Plane credential revoke body decoded.",
      );
      const request = controlPlaneStepData(req, res, requestResult);
      if (request === null) return;
      const result = await context.execute(
        "api.control-plane.credential.revoke",
        revokeControlPlaneCredential(
          principal.userId,
          scope.projectId,
          scope.environmentId,
          scope.credentialId,
          request,
          context.request.requestId,
        ),
        "Control Plane credential revoked.",
      );
      sendControlPlaneResponse(req, res, result.status, result.response);
    },
  );

  router.get("/projects/:projectId/audit-events", async (req, res) => {
    const context = controlPlaneContext(req);
    const principal = await prepareControlPlaneRequest(
      req,
      res,
      context,
      controlPlaneBearerRequirements.listAuditEvents,
      controlPlaneRequestCosts.list,
    );
    if (principal === undefined || principal.kind !== "oauth_user") return;
    const queryResult = await context.execute(
      "api.control-plane.audit.list.query",
      decodeControlPlaneProjectAuditInput(req.originalUrl.split("?", 2)[1] ?? ""),
      "Control Plane audit query decoded.",
    );
    const query = controlPlaneStepData(req, res, queryResult);
    if (query === null) return;
    const result = await context.execute(
      "api.control-plane.audit.list",
      listProjectAuditEvents(
        principal.userId,
        controlPlanePrincipalKey(principal),
        routeParameter(req, "projectId"),
        query,
        context.request.requestId,
      ),
      "Control Plane audit events loaded.",
    );
    sendControlPlaneResponse(req, res, result.status, result.response);
  });

  router.use((req, res) => {
    const allowed = controlPlaneAllowedMethods(req.path);
    if (allowed !== null) res.setHeader("Allow", allowed.join(", "));
    sendControlPlaneResponse(
      req,
      res,
      allowed === null ? 404 : 405,
      apiFailure({
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: requestContext(req).requestId,
        retryable: false,
      }),
    );
  });
  router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const context = requestContext(req);
    const errorType =
      typeof error === "object" && error !== null ? Reflect.get(error, "type") : undefined;
    if (errorType === "entity.too.large" || errorType === "entity.parse.failed") {
      sendControlPlaneResponse(
        req,
        res,
        errorType === "entity.too.large" ? 413 : 400,
        apiFailure({
          code:
            errorType === "entity.too.large"
              ? "CONTROL_PLANE_REQUEST_TOO_LARGE"
              : "VALIDATION_ERROR",
          message:
            errorType === "entity.too.large"
              ? "The Control Plane request exceeds the maximum size."
              : "Use a valid JSON request body.",
          requestId: context.requestId,
          retryable: false,
        }),
      );
      return;
    }
    void reportBoundaryDefect(context, error).catch(() => undefined);
    sendControlPlaneResponse(
      req,
      res,
      500,
      apiFailure({
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: context.requestId,
        retryable: false,
      }),
    );
  });
  return router;
}
