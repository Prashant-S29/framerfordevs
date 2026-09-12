// Executes bounded, redirect-free Control Plane v1 requests with exact response decoding.

import { Context, Effect, Schema } from "effect";

import {
  ControlPlaneHttpError,
  ControlPlaneResponseTooLargeError,
  ControlPlaneTransportError,
} from "../errors";
import {
  ControlPlaneCapabilityList,
  ControlPlaneCreateProjectResult,
  ControlPlaneCreateWorkspaceResult,
  ControlPlaneEnableCapabilityResult,
  ControlPlaneFailureResponse,
  ControlPlaneProject,
  ControlPlaneProjectPage,
  ControlPlanePutStudioRegistrationResult,
  ControlPlaneStudioRegistration,
  ControlPlaneWorkspace,
  ControlPlaneWorkspacePage,
  controlPlaneSuccessResponse,
} from "./schema";

const maximumRequestBytes = 64 * 1_024;
const maximumResponseBytes = 512 * 1_024;
const maximumTokenBytes = 16_384;
const defaultTimeoutMs = 15_000;

export interface ControlPlaneHttpClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

export interface ControlPlaneRequestOptions {
  readonly signal?: AbortSignal;
}

export interface CreateWorkspaceRequest {
  readonly commandId: string;
  readonly name: string;
}

export interface CreateProjectRequest {
  readonly commandId: string;
  readonly name: string;
  readonly key: string;
  readonly description: string | null;
  readonly initialCapabilities: ReadonlyArray<"cms">;
}

export interface UpdateProjectRequest {
  readonly expectedVersion: number;
  readonly name: string;
  readonly description: string | null;
}

export interface ProjectLifecycleRequest {
  readonly expectedVersion: number;
}

export interface EnableCapabilityRequest {
  readonly commandId: string;
}

export interface PutStudioRegistrationRequest {
  readonly commandId: string;
  readonly expectedVersion: number | null;
  readonly applicationOrigin: string;
  readonly mountPath: string;
}

function transportError(operation: string, cause: unknown) {
  return ControlPlaneTransportError.make({ operation, cause });
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

async function boundedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maximumResponseBytes) {
    throw ControlPlaneResponseTooLargeError.make();
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumResponseBytes) {
        await reader.cancel();
        throw ControlPlaneResponseTooLargeError.make();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function pagePath(path: string, values: Readonly<Record<string, string | number | null>>): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) parameters.set(key, String(value));
  }
  return `${path}?${parameters.toString()}`;
}

export function makeControlPlaneHttpClient(options: ControlPlaneHttpClientOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const baseUrl = new URL(options.baseUrl);
  if (Buffer.byteLength(options.token, "utf8") > maximumTokenBytes) {
    throw new Error("Control Plane bearer token exceeds the fixed bound.");
  }

  const request = <A, I>(
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    dataSchema: Schema.Schema<A, I, never>,
    body: unknown | null,
    requestOptions: ControlPlaneRequestOptions = {},
  ) =>
    Effect.gen(function* () {
      const url = new URL(path, baseUrl);
      if (url.origin !== baseUrl.origin) {
        return yield* transportError(
          "control-plane.url.authority",
          new Error("Control Plane URL escaped configured origin."),
        );
      }
      const bodyBytes = body === null ? undefined : JSON.stringify(body);
      if (bodyBytes !== undefined && Buffer.byteLength(bodyBytes, "utf8") > maximumRequestBytes) {
        return yield* transportError(
          "control-plane.request.size",
          new Error("Control Plane request exceeded the fixed bound."),
        );
      }
      const response = yield* Effect.tryPromise({
        try: () =>
          fetchImplementation(url, {
            method,
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${options.token}`,
              ...(bodyBytes === undefined ? {} : { "Content-Type": "application/json" }),
            },
            ...(bodyBytes === undefined ? {} : { body: bodyBytes }),
            redirect: "error",
            signal: requestSignal(requestOptions.signal, timeoutMs),
          }),
        catch: (cause) => transportError("control-plane.fetch", cause),
      });
      const responseBody = yield* Effect.tryPromise({
        try: () => boundedBody(response),
        catch: (cause) =>
          cause instanceof ControlPlaneResponseTooLargeError
            ? cause
            : transportError("control-plane.response.read", cause),
      });
      const unknownBody = yield* Effect.try({
        try: (): unknown => JSON.parse(responseBody),
        catch: (cause) => transportError("control-plane.response.json", cause),
      });
      if (response.ok) {
        const success = yield* Schema.decodeUnknown(controlPlaneSuccessResponse(dataSchema))(
          unknownBody,
          { onExcessProperty: "error" },
        ).pipe(
          Effect.mapError((cause) =>
            transportError("control-plane.response.decode_success", cause),
          ),
        );
        return success.data;
      }
      const failure = yield* Schema.decodeUnknown(ControlPlaneFailureResponse)(unknownBody, {
        onExcessProperty: "error",
      }).pipe(
        Effect.mapError((cause) => transportError("control-plane.response.decode_failure", cause)),
      );
      return yield* ControlPlaneHttpError.make({
        status: response.status,
        code: failure.error.code,
        retryable: failure.error.retryable,
      });
    });

  return {
    listWorkspaces: (
      cursor: string | null,
      limit: number,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "GET",
        pagePath("/api/control-plane/v1/workspaces", { limit, cursor }),
        ControlPlaneWorkspacePage,
        null,
        requestOptions,
      ),
    createWorkspace: (body: CreateWorkspaceRequest, requestOptions?: ControlPlaneRequestOptions) =>
      request(
        "POST",
        "/api/control-plane/v1/workspaces",
        ControlPlaneCreateWorkspaceResult,
        body,
        requestOptions,
      ),
    getWorkspace: (workspaceId: string, requestOptions?: ControlPlaneRequestOptions) =>
      request(
        "GET",
        `/api/control-plane/v1/workspaces/${segment(workspaceId)}`,
        ControlPlaneWorkspace,
        null,
        requestOptions,
      ),
    listProjects: (
      workspaceId: string,
      status: "active" | "archived",
      cursor: string | null,
      limit: number,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "GET",
        pagePath(`/api/control-plane/v1/workspaces/${segment(workspaceId)}/projects`, {
          status,
          limit,
          cursor,
        }),
        ControlPlaneProjectPage,
        null,
        requestOptions,
      ),
    createProject: (
      workspaceId: string,
      body: CreateProjectRequest,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "POST",
        `/api/control-plane/v1/workspaces/${segment(workspaceId)}/projects`,
        ControlPlaneCreateProjectResult,
        body,
        requestOptions,
      ),
    getProject: (projectId: string, requestOptions?: ControlPlaneRequestOptions) =>
      request(
        "GET",
        `/api/control-plane/v1/projects/${segment(projectId)}`,
        ControlPlaneProject,
        null,
        requestOptions,
      ),
    updateProject: (
      projectId: string,
      body: UpdateProjectRequest,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "PATCH",
        `/api/control-plane/v1/projects/${segment(projectId)}`,
        ControlPlaneProject,
        body,
        requestOptions,
      ),
    archiveProject: (
      projectId: string,
      body: ProjectLifecycleRequest,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "POST",
        `/api/control-plane/v1/projects/${segment(projectId)}/archive`,
        ControlPlaneProject,
        body,
        requestOptions,
      ),
    restoreProject: (
      projectId: string,
      body: ProjectLifecycleRequest,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "POST",
        `/api/control-plane/v1/projects/${segment(projectId)}/restore`,
        ControlPlaneProject,
        body,
        requestOptions,
      ),
    listCapabilities: (projectId: string, requestOptions?: ControlPlaneRequestOptions) =>
      request(
        "GET",
        `/api/control-plane/v1/projects/${segment(projectId)}/capabilities`,
        ControlPlaneCapabilityList,
        null,
        requestOptions,
      ),
    enableCmsCapability: (
      projectId: string,
      body: EnableCapabilityRequest,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "PUT",
        `/api/control-plane/v1/projects/${segment(projectId)}/capabilities/cms`,
        ControlPlaneEnableCapabilityResult,
        body,
        requestOptions,
      ),
    getStudioRegistration: (
      projectId: string,
      environmentId: string,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "GET",
        `/api/control-plane/v1/projects/${segment(projectId)}/environments/${segment(environmentId)}/studio-registration`,
        ControlPlaneStudioRegistration,
        null,
        requestOptions,
      ),
    putStudioRegistration: (
      projectId: string,
      environmentId: string,
      body: PutStudioRegistrationRequest,
      requestOptions?: ControlPlaneRequestOptions,
    ) =>
      request(
        "PUT",
        `/api/control-plane/v1/projects/${segment(projectId)}/environments/${segment(environmentId)}/studio-registration`,
        ControlPlanePutStudioRegistrationResult,
        body,
        requestOptions,
      ),
  };
}

export class ControlPlaneHttpClient extends Context.Tag("ControlPlaneHttpClient")<
  ControlPlaneHttpClient,
  ReturnType<typeof makeControlPlaneHttpClient>
>() {}
