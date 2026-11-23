import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";

import {
  isStudioContentShellRoute,
  renderStudioDocument,
  studioContentRequestLimitBytes,
  studioContentResponseLimitBytes,
  studioContentTarget,
  studioResolutionIds,
  validStudioContentBody,
  validStudioContentEnvelope,
  type StudioContentSuccessKind,
} from "@framerfordevs/studio/bff-routes";
import { Effect } from "effect";

import type { EditorStudioArtifact } from "../assets";
import { renderEditorBootstrap } from "../bootstrap";
import { previewLaunchResponse } from "../preview-launch";
import {
  editorProxySizeBucket,
  editorProxyStatusFamily,
  type EditorProxyMetric,
  type EditorProxyOperation,
  recordEditorProxyMetric,
} from "../telemetry";

export const editorMountPath = "/studio";
const maximumUrlLength = 2_048;
const sessionCookie = "ffd_editor_session";
const challengeHeader = "x-ffd-editor-challenge";
const editorMutationKinds = new Set<StudioContentSuccessKind>([
  "create",
  "rename",
  "save",
  "restore",
  "publish",
  "unpublish",
]);
const sessionScript = `(async () => {
  const match = /^#session=([A-Za-z0-9_-]{43,128})$/u.exec(window.location.hash);
  window.history.replaceState(null, "", "${editorMountPath}/session");
  const message = document.getElementById("ffd-editor-session");
  if (match === null) {
    message.textContent = "This editor link is invalid. Stop ffd editor and start it again.";
    return;
  }
  const response = await fetch("${editorMountPath}/api/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Ffd-Editor-Challenge": match[1] },
    body: "{}",
  });
  if (response.ok) window.location.replace("${editorMountPath}");
  else message.textContent = "This editor link was already used. Stop ffd editor and start it again.";
})();
`;
const previewLaunchScript = 'document.getElementById("ffd-preview-launch")?.submit();\n';

export type EditorSchemaState = "matches" | "differs" | "invalid";

export interface EditorLoopbackStatus {
  readonly schema: EditorSchemaState;
  readonly diagnosticCode: string | null;
}

export interface EditorUpstreamRequest {
  readonly path: string;
  readonly method: string;
  readonly body?: string;
  readonly requestId: string;
  readonly maximumResponseBytes: number;
}

export interface EditorUpstreamResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly retryAfter: string | null;
  readonly text: string;
}

export interface EditorLoopbackOptions {
  readonly challenge: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly previewUrl: string | null;
  readonly artifact: EditorStudioArtifact;
  readonly status: () => EditorLoopbackStatus;
  readonly upstream: (request: EditorUpstreamRequest) => Promise<EditorUpstreamResponse>;
  readonly randomToken?: () => string;
  readonly observeOperation?: (event: EditorProxyMetric) => void;
}

export interface EditorLoopbackServer {
  readonly origin: string;
  readonly close: () => Promise<void>;
}

class EditorHttpFailure extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function frameSources(previewUrl: string | null): string {
  return previewUrl === null ? "'none'" : `'self' ${new URL(previewUrl).origin}`;
}

function shellCsp(previewUrl: string | null): string {
  const frames = frameSources(previewUrl);
  return `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'none'; worker-src 'none'; child-src ${frames}; frame-src ${frames}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
}

function setSecurityHeaders(response: ServerResponse, contentType: string, csp: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", csp);
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (!response.hasHeader("X-Frame-Options")) response.setHeader("X-Frame-Options", "DENY");
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Uint8Array,
  csp: string,
): void {
  setSecurityHeaders(response, contentType, csp);
  response.statusCode = status;
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown, csp: string): void {
  send(response, status, "application/json; charset=utf-8", `${JSON.stringify(value)}\n`, csp);
}

function failureBody(code: string, message: string) {
  return { ok: false, data: null, error: { code, message }, message };
}

export function isCanonicalLoopbackPeer(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function secretsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<string> {
  const length = request.headers["content-length"];
  if (request.headers["transfer-encoding"] !== undefined && length === undefined) {
    throw new EditorHttpFailure(400, "STUDIO_REQUEST_INVALID", "The request is invalid.");
  }
  if (length !== undefined && (!/^[0-9]+$/u.test(length) || Number(length) > maximumBytes)) {
    throw new EditorHttpFailure(413, "STUDIO_REQUEST_INVALID", "The request is too large.");
  }
  const chunks: Array<Buffer> = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += bytes.byteLength;
    if (size > maximumBytes) {
      throw new EditorHttpFailure(413, "STUDIO_REQUEST_INVALID", "The request is too large.");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new EditorHttpFailure(400, "STUDIO_REQUEST_INVALID", "The request is invalid.");
  }
}

function cookieValue(header: string | undefined): string | null {
  if (header === undefined || header.length > 4_096) return null;
  const values = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${sessionCookie}=`))
    .map((part) => part.slice(sessionCookie.length + 1));
  return values.length === 1 ? (values[0] ?? null) : null;
}

function upstreamUnavailable(): EditorHttpFailure {
  return new EditorHttpFailure(
    502,
    "STUDIO_UPSTREAM_UNAVAILABLE",
    "The Studio Content service returned an invalid response.",
  );
}

function decodeUpstreamJson(response: EditorUpstreamResponse): unknown {
  if (response.contentType?.toLowerCase().startsWith("application/json") !== true) {
    throw upstreamUnavailable();
  }
  try {
    return JSON.parse(response.text);
  } catch {
    throw upstreamUnavailable();
  }
}

export async function startEditorLoopback(
  options: EditorLoopbackOptions,
): Promise<EditorLoopbackServer> {
  if (options.challenge.length < 43 || options.challenge.length > 128)
    throw new Error("EDITOR_SESSION_INVALID");
  const randomToken = options.randomToken ?? (() => randomBytes(32).toString("base64url"));
  const observeOperation =
    options.observeOperation ??
    ((event: EditorProxyMetric) => Effect.runSync(recordEditorProxyMetric(event)));
  const csp = shellCsp(options.previewUrl);
  const html = renderStudioDocument({
    host: "local_editor",
    mountPath: editorMountPath,
    dashboardOrigin: null,
    entryScript: options.artifact.entryScript,
    stylesheets: options.artifact.stylesheets,
    previewEnabled: options.previewUrl !== null,
  });
  const sessionPage = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Starting local editor</title><script src="${editorMountPath}/session.js" defer></script></head><body><p id="ffd-editor-session" role="status">Starting local editor…</p></body></html>\n`;
  const contentBase = `/api/studio-content/v1/projects/${options.projectId}/environments/${options.environmentId}`;
  const bootstrapPath = `/api/studio/v1/projects/${options.projectId}/environments/${options.environmentId}/bootstrap`;
  let challengeAvailable = true;
  let session: string | null = null;
  let expectedHost = "";
  let origin = "";
  let closed = false;

  const requireSession = (request: IncomingMessage) => {
    const fetchSite = request.headers["sec-fetch-site"];
    if (fetchSite !== undefined && fetchSite !== "same-origin") {
      throw new EditorHttpFailure(403, "STUDIO_ORIGIN_INVALID", "The request origin is invalid.");
    }
    const provided = cookieValue(request.headers.cookie);
    if (session === null || provided === null || !secretsEqual(provided, session)) {
      throw new EditorHttpFailure(401, "STUDIO_SESSION_INVALID", "The editor session is invalid.");
    }
  };
  const requireSameOriginMutation = (request: IncomingMessage) => {
    if (request.headers.origin !== origin) {
      throw new EditorHttpFailure(403, "STUDIO_ORIGIN_INVALID", "The request origin is invalid.");
    }
  };

  const exchangeSession = async (request: IncomingMessage, response: ServerResponse) => {
    requireSameOriginMutation(request);
    if (request.headers["content-type"] !== "application/json") {
      throw new EditorHttpFailure(415, "STUDIO_REQUEST_INVALID", "The request is invalid.");
    }
    if ((await readBody(request, 2)) !== "{}") {
      throw new EditorHttpFailure(400, "STUDIO_REQUEST_INVALID", "The request is invalid.");
    }
    const provided = request.headers[challengeHeader];
    if (
      !challengeAvailable ||
      typeof provided !== "string" ||
      !secretsEqual(provided, options.challenge)
    ) {
      throw new EditorHttpFailure(401, "STUDIO_SESSION_INVALID", "The editor link is invalid.");
    }
    challengeAvailable = false;
    session = randomToken();
    response.setHeader(
      "Set-Cookie",
      `${sessionCookie}=${session}; Path=${editorMountPath}; HttpOnly; SameSite=Strict`,
    );
    sendJson(response, 200, { ok: true }, csp);
  };

  const bootstrap = async (response: ServerResponse, requestId: string) => {
    const upstream = await options.upstream({
      path: bootstrapPath,
      method: "GET",
      requestId,
      maximumResponseBytes: 64 * 1_024,
    });
    const rendered = renderEditorBootstrap(decodeUpstreamJson(upstream), upstream.status, {
      projectId: options.projectId,
      environmentId: options.environmentId,
      previewUrl: options.previewUrl,
    });
    sendJson(response, rendered.status, rendered.body, csp);
  };

  const content = async (
    request: IncomingMessage,
    response: ServerResponse,
    route: string,
    query: string,
    method: string,
    requestId: string,
  ): Promise<{ readonly kind: StudioContentSuccessKind; readonly requestBytes: number }> => {
    const target = studioContentTarget(route, query, method);
    if (target === null) {
      throw new EditorHttpFailure(404, "STUDIO_ROUTE_NOT_FOUND", "The Studio route was not found.");
    }
    let body: string | undefined;
    let resolutionIds: ReadonlyArray<string> | undefined;
    if (target.bodyAllowed) {
      requireSameOriginMutation(request);
      if (request.headers["content-type"] !== "application/json") {
        throw new EditorHttpFailure(415, "STUDIO_REQUEST_INVALID", "The request must be JSON.");
      }
      body = await readBody(request, studioContentRequestLimitBytes(route));
      const parsed = parseJson(body);
      if (!validStudioContentBody(route, parsed)) {
        throw new EditorHttpFailure(400, "STUDIO_REQUEST_INVALID", "The request is invalid.");
      }
      resolutionIds = studioResolutionIds(route, parsed);
    } else if ((await readBody(request, 0)) !== "") {
      throw new EditorHttpFailure(400, "STUDIO_REQUEST_INVALID", "The request has a body.");
    }
    if (editorMutationKinds.has(target.successKind) && options.status().schema !== "matches") {
      throw new EditorHttpFailure(
        409,
        "STUDIO_SCHEMA_DRIFT",
        "The local schema differs from the hosted schema. Run ffd schema plan, then ffd schema push.",
      );
    }
    const upstream = await options.upstream({
      path: `${contentBase}${target.upstreamPath}`,
      method,
      requestId,
      maximumResponseBytes: studioContentResponseLimitBytes,
      ...(body === undefined ? {} : { body }),
    });
    const decoded = decodeUpstreamJson(upstream);
    if (!validStudioContentEnvelope(decoded, upstream.status, target.successKind, resolutionIds)) {
      throw upstreamUnavailable();
    }
    if (upstream.retryAfter !== null && /^\d{1,6}$/u.test(upstream.retryAfter)) {
      response.setHeader("Retry-After", upstream.retryAfter);
    }
    sendJson(response, upstream.status, decoded, csp);
    return { kind: target.successKind, requestBytes: body === undefined ? 0 : body.length };
  };

  const server = createServer(async (request, response) => {
    const started = performance.now();
    let operation: EditorProxyOperation | null = null;
    let requestBytes = 0;
    const observe = (status: number, outcome: EditorProxyMetric["outcome"]) => {
      if (operation === null) return;
      try {
        observeOperation({
          operation,
          mutation: editorMutationKinds.has(operation as StudioContentSuccessKind),
          outcome,
          statusFamily: editorProxyStatusFamily(status),
          requestSizeBucket: editorProxySizeBucket(requestBytes),
          durationMs: Math.max(0, performance.now() - started),
        });
      } catch {
        // Telemetry is best-effort and cannot change editor proxy behavior.
      }
    };
    try {
      const urlValue = request.url ?? "";
      if (
        !isCanonicalLoopbackPeer(request.socket.remoteAddress) ||
        request.headers.host !== expectedHost ||
        urlValue.length < 1 ||
        urlValue.length > maximumUrlLength ||
        urlValue.includes("%") ||
        urlValue.includes("\\") ||
        urlValue.includes("#")
      ) {
        throw new EditorHttpFailure(400, "STUDIO_REQUEST_INVALID", "The request is invalid.");
      }
      const url = new URL(urlValue, origin);
      if (url.origin !== origin || `${url.pathname}${url.search}` !== urlValue) {
        throw new EditorHttpFailure(400, "STUDIO_REQUEST_INVALID", "The request is invalid.");
      }
      const method = request.method ?? "";
      const query = url.search.startsWith("?") ? url.search.slice(1) : "";
      if (method === "GET" && url.pathname === "/") {
        response.statusCode = 303;
        response.setHeader("Location", `${editorMountPath}`);
        send(response, 303, "text/plain; charset=utf-8", "", csp);
        return;
      }
      if (url.pathname !== editorMountPath && !url.pathname.startsWith(`${editorMountPath}/`)) {
        throw new EditorHttpFailure(404, "STUDIO_ROUTE_NOT_FOUND", "The route was not found.");
      }
      const route = url.pathname.slice(editorMountPath.length);
      const requestId = randomBytes(16).toString("hex");
      if (method === "GET" && query === "" && route === "/session") {
        send(response, 200, "text/html; charset=utf-8", sessionPage, csp);
        return;
      }
      if (method === "GET" && query === "" && route === "/session.js") {
        send(response, 200, "text/javascript; charset=utf-8", sessionScript, csp);
        return;
      }
      if (method === "GET" && query === "" && route === "/preview/launch.js") {
        send(response, 200, "text/javascript; charset=utf-8", previewLaunchScript, csp);
        return;
      }
      if (method === "GET" && query === "") {
        const asset = options.artifact.files.get(route);
        if (asset !== undefined) {
          send(response, 200, asset.contentType, asset.body, csp);
          return;
        }
        if (route === "" || route === "/" || isStudioContentShellRoute(route)) {
          send(response, 200, "text/html; charset=utf-8", html, csp);
          return;
        }
      }
      if (method === "POST" && query === "" && route === "/api/session") {
        await exchangeSession(request, response);
        return;
      }
      if (route === "/preview/launch") {
        operation = "preview";
        requireSession(request);
        const launch = await previewLaunchResponse({
          request,
          method,
          query,
          previewUrl: options.previewUrl,
          mountPath: editorMountPath,
          handoffPath: (collection, locale, entry) =>
            `${contentBase}/collections/${collection}/locales/${locale}/entries/${entry}/preview-handoffs`,
          upstream: options.upstream,
          requestId,
        });
        response.setHeader("X-Frame-Options", "SAMEORIGIN");
        send(response, launch.status, "text/html; charset=utf-8", launch.html, launch.csp);
        observe(launch.status, launch.status < 400 ? "success" : "upstream_failure");
        return;
      }
      if (method === "GET" && query === "" && route === "/api/bootstrap") {
        operation = "bootstrap";
        requireSession(request);
        await bootstrap(response, requestId);
        observe(response.statusCode, response.statusCode < 400 ? "success" : "upstream_failure");
        return;
      }
      if (method === "GET" && query === "" && route === "/api/editor/status") {
        requireSession(request);
        sendJson(
          response,
          200,
          { ok: true, data: options.status(), error: null, message: "Local editor status loaded." },
          csp,
        );
        return;
      }
      if (route.startsWith("/api/content/")) {
        operation = "content";
        requireSession(request);
        const result = await content(request, response, route, query, method, requestId);
        operation = result.kind;
        requestBytes = result.requestBytes;
        observe(response.statusCode, response.statusCode < 400 ? "success" : "upstream_failure");
        return;
      }
      throw new EditorHttpFailure(404, "STUDIO_ROUTE_NOT_FOUND", "The Studio route was not found.");
    } catch (cause) {
      const failure =
        cause instanceof EditorHttpFailure
          ? cause
          : new EditorHttpFailure(
              502,
              "STUDIO_UPSTREAM_UNAVAILABLE",
              "The Studio service is temporarily unavailable.",
            );
      observe(failure.status, failure.status >= 500 ? "upstream_failure" : "rejected");
      if (!response.headersSent) {
        sendJson(response, failure.status, failureBody(failure.code, failure.message), csp);
      } else {
        response.destroy();
      }
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise<void>((resolve, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    throw new Error("EDITOR_BIND_FAILED");
  }
  expectedHost = `127.0.0.1:${address.port}`;
  origin = `http://${expectedHost}`;
  return {
    origin,
    close: async () => {
      if (closed) return;
      closed = true;
      session = null;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
        server.closeAllConnections();
      });
    },
  };
}
