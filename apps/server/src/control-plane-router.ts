// Owns the bearer-only, originless Control Plane v1 Express transport boundary.

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
  authenticateControlPlaneRequest,
  controlPlaneBearerRequirements,
  controlPlanePrincipalActor,
  controlPlanePrincipalKey,
  controlPlaneRequestCosts,
  decodeControlPlaneCreateProjectInput,
  decodeControlPlaneCreateWorkspaceRequest,
  decodeControlPlaneEnableCapabilityInput,
  decodeControlPlaneListProjectsInput,
  decodeControlPlaneListWorkspacesQuery,
  decodeControlPlaneProjectLifecycleInput,
  decodeControlPlaneProjectScope,
  decodeControlPlanePutStudioRegistrationInput,
  decodeControlPlaneStudioRegistrationScope,
  decodeControlPlaneUpdateProjectInput,
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
      (req.path === "/workspaces" || /^\/workspaces\/[^/]+\/projects$/u.test(req.path));
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
