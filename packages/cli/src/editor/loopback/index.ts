// Owns the closed loopback-only HTTP/session boundary without hosted credential authority.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

import { Effect } from "effect";

import type { EditorStaticAssets } from "../assets";
import {
  decodeEditorOperationRequest,
  editorMutationOperations,
  type EditorOperationRequest,
} from "../protocol";
import {
  editorProxySizeBucket,
  editorProxyStatusFamily,
  type EditorProxyMetric,
  recordEditorProxyMetric,
} from "../telemetry";

const maximumBodyBytes = 1_048_576;
const maximumUrlLength = 2_048;
const sessionHeader = "x-ffd-editor-session";

export interface EditorLoopbackCollection {
  readonly sourceKey: string;
  readonly apiKey: string;
}

export interface EditorLoopbackStatus {
  readonly projectId: string;
  readonly environment: string;
  readonly schemaMatchesHosted: boolean;
  readonly schemaValid: boolean;
  readonly schemaGeneration: number;
  readonly schemaDiagnosticCode: string | null;
  readonly localCollectionCount: number;
  readonly locales: ReadonlyArray<string>;
  readonly collections: ReadonlyArray<EditorLoopbackCollection>;
}

export interface EditorLoopbackOperationResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface EditorLoopbackOptions {
  readonly challenge: string;
  readonly assets: EditorStaticAssets;
  readonly status: () => EditorLoopbackStatus;
  readonly operation?: (
    request: EditorOperationRequest,
  ) => Promise<EditorLoopbackOperationResponse>;
  readonly observeOperation?: (event: EditorProxyMetric) => void;
}

export interface EditorLoopbackServer {
  readonly origin: string;
  readonly close: () => Promise<void>;
}

function secureHeaders(response: ServerResponse, contentType: string): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'",
  );
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Uint8Array,
): void {
  secureHeaders(response, contentType);
  response.statusCode = status;
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  send(response, status, "application/json; charset=utf-8", `${JSON.stringify(value)}\n`);
}

function reject(response: ServerResponse, status: number, code: string): void {
  sendJson(response, status, { ok: false, code });
}

export function isCanonicalLoopbackPeer(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::ffff:127.0.0.1";
}

function secretsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const length = request.headers["content-length"];
  if (length !== undefined) {
    const parsed = Number(length);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximumBodyBytes)
      throw new Error("EDITOR_BODY_TOO_LARGE");
  }
  const chunks: Array<Buffer> = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += bytes.byteLength;
    if (size > maximumBodyBytes) throw new Error("EDITOR_BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function exactJsonContentType(request: IncomingMessage): boolean {
  return request.headers["content-type"]?.toLowerCase() === "application/json";
}

export async function startEditorLoopback(
  options: EditorLoopbackOptions,
): Promise<EditorLoopbackServer> {
  if (options.challenge.length < 43 || options.challenge.length > 128)
    throw new Error("EDITOR_SESSION_INVALID");
  let expectedHost = "";
  let origin = "";
  let closed = false;
  const observeOperation =
    options.observeOperation ??
    ((event: EditorProxyMetric) => Effect.runSync(recordEditorProxyMetric(event)));
  const server = createServer(async (request, response) => {
    let activeOperation: EditorOperationRequest | null = null;
    let operationStartedAt = 0;
    let operationRequestBytes = 0;
    let operationObserved = false;
    const observeActiveOperation = (status: number, outcome: EditorProxyMetric["outcome"]) => {
      if (activeOperation === null || operationObserved) return;
      operationObserved = true;
      try {
        observeOperation({
          operation: activeOperation.operation,
          mutation: editorMutationOperations.has(activeOperation.operation),
          outcome,
          statusFamily: editorProxyStatusFamily(status),
          requestSizeBucket: editorProxySizeBucket(operationRequestBytes),
          durationMs: Math.max(0, performance.now() - operationStartedAt),
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
        urlValue.length > maximumUrlLength
      ) {
        reject(response, 400, "EDITOR_REQUEST_INVALID");
        return;
      }
      const url = new URL(urlValue, origin);
      if (
        url.origin !== origin ||
        url.search !== "" ||
        url.username ||
        url.password ||
        urlValue.includes("%") ||
        urlValue.includes("\\") ||
        url.pathname !== urlValue
      ) {
        reject(response, 400, "EDITOR_REQUEST_INVALID");
        return;
      }
      const method = request.method ?? "";
      if (method === "GET" && url.pathname === "/") {
        send(response, 200, "text/html; charset=utf-8", options.assets.html);
        return;
      }
      if (method === "GET") {
        const asset = options.assets.files.get(url.pathname);
        if (asset !== undefined) {
          send(response, 200, asset.contentType, asset.body);
          return;
        }
      }
      const providedSession = request.headers[sessionHeader];
      const session = typeof providedSession === "string" ? providedSession : "";
      if (!secretsEqual(session, options.challenge)) {
        reject(response, 401, "EDITOR_SESSION_INVALID");
        return;
      }
      if (method === "POST" && url.pathname === "/api/session") {
        if (request.headers.origin !== origin || !exactJsonContentType(request)) {
          reject(response, 403, "EDITOR_ORIGIN_INVALID");
          return;
        }
        const body = await readBody(request);
        if (body !== "{}") {
          reject(response, 400, "EDITOR_REQUEST_INVALID");
          return;
        }
        sendJson(response, 200, { ok: true });
        return;
      }
      if (method === "GET" && url.pathname === "/api/status") {
        sendJson(response, 200, options.status());
        return;
      }
      if (method === "POST" && url.pathname === "/api/operation") {
        const operationHandler = options.operation;
        if (
          operationHandler === undefined ||
          request.headers.origin !== origin ||
          !exactJsonContentType(request)
        ) {
          reject(response, 403, "EDITOR_ORIGIN_INVALID");
          return;
        }
        const operationBody = await readBody(request);
        operationRequestBytes = Buffer.byteLength(operationBody, "utf8");
        const operation = decodeEditorOperationRequest(JSON.parse(operationBody));
        activeOperation = operation;
        operationStartedAt = performance.now();
        const status = options.status();
        if (
          editorMutationOperations.has(operation.operation) &&
          (!status.schemaValid || !status.schemaMatchesHosted)
        ) {
          observeActiveOperation(409, "rejected");
          reject(response, 409, "EDITOR_SCHEMA_DRIFT");
          return;
        }
        const result = await Effect.runPromise(
          Effect.promise(() => operationHandler(operation)).pipe(
            Effect.withSpan("cli.editor.proxy.operation", {
              attributes: {
                "editor.operation": operation.operation,
                "editor.mutation": editorMutationOperations.has(operation.operation),
              },
            }),
          ),
        );
        if (!Number.isInteger(result.status) || result.status < 200 || result.status > 599) {
          observeActiveOperation(502, "upstream_failure");
          reject(response, 502, "EDITOR_UPSTREAM_INVALID");
          return;
        }
        observeActiveOperation(result.status, result.status < 400 ? "success" : "upstream_failure");
        sendJson(response, result.status, result.body);
        return;
      }
      reject(response, 404, "EDITOR_ROUTE_NOT_FOUND");
    } catch (cause) {
      const status =
        cause instanceof Error && cause.message === "EDITOR_BODY_TOO_LARGE" ? 413 : 400;
      observeActiveOperation(status, "failure");
      reject(response, status, "EDITOR_REQUEST_INVALID");
    }
  });
  server.requestTimeout = 10_000;
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
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
        server.closeAllConnections();
      });
    },
  };
}
