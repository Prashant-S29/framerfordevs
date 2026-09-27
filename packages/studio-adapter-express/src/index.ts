// Thin Express 5 bridge preserving the untouched request target for the Studio core guard.

import type {
  Request as ExpressRequest,
  RequestHandler,
  Response as ExpressResponse,
} from "express";

import type { StudioFetchHandler } from "@framerfordevs/studio-server";
import { parseStudioRawTarget } from "@framerfordevs/studio-server/raw-target";

const maximumAdapterBodyBytes = 1_024;

async function readBody(request: ExpressRequest): Promise<Uint8Array> {
  const declared = request.headers["content-length"];
  if (declared !== undefined) {
    const length = Array.isArray(declared) ? Number.NaN : Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximumAdapterBodyBytes) {
      throw new Error("STUDIO_ADAPTER_BODY_TOO_LARGE");
    }
  }
  const chunks: Array<Buffer> = [];
  let total = 0;
  for await (const chunk of request) {
    if (typeof chunk !== "string" && !(chunk instanceof Uint8Array)) {
      throw new Error("STUDIO_ADAPTER_BODY_INVALID");
    }
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    if (total > maximumAdapterBodyBytes) throw new Error("STUDIO_ADAPTER_BODY_TOO_LARGE");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function copyHeaders(request: ExpressRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (
      value === undefined ||
      ["connection", "content-length", "host", "transfer-encoding"].includes(name.toLowerCase())
    )
      continue;
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else headers.set(name, value);
  }
  return headers;
}

async function send(response: ExpressResponse, fetchResponse: Response): Promise<void> {
  response.status(fetchResponse.status);
  const setCookies = fetchResponse.headers.getSetCookie();
  for (const [name, value] of fetchResponse.headers) {
    if (name.toLowerCase() !== "set-cookie") response.setHeader(name, value);
  }
  if (setCookies.length > 0) response.setHeader("Set-Cookie", setCookies);
  const body = await fetchResponse.arrayBuffer();
  response.end(Buffer.from(body));
}

function adapterFailure(response: ExpressResponse, status: number): void {
  response
    .status(status)
    .set({
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    })
    .end(
      `${JSON.stringify({ ok: false, data: null, error: { code: "STUDIO_REQUEST_INVALID", message: "The request is invalid." }, message: "The request is invalid." })}\n`,
    );
}

/** Mount before body parsers so the adapter can bound and preserve the request body itself. */
export function createExpressStudioMiddleware(handler: StudioFetchHandler): RequestHandler {
  return async (request, response, next) => {
    const rawTarget = request.originalUrl;
    const ownsTarget =
      typeof rawTarget === "string" &&
      (rawTarget === handler.mountPath ||
        rawTarget.startsWith(`${handler.mountPath}/`) ||
        rawTarget.startsWith(`${handler.mountPath}?`) ||
        rawTarget.startsWith(`${handler.mountPath}%`) ||
        rawTarget.startsWith(`${handler.mountPath}\\`));
    if (!ownsTarget) {
      next();
      return;
    }
    if (parseStudioRawTarget(rawTarget, handler.mountPath) === null) {
      adapterFailure(response, 400);
      return;
    }
    const abort = new AbortController();
    const onAborted = () => abort.abort();
    const onClosed = () => {
      if (!response.writableEnded) abort.abort();
    };
    request.once("aborted", onAborted);
    response.once("close", onClosed);
    try {
      const host = request.get("host");
      const externalOrigin = host === undefined ? "" : `${request.protocol}://${host}`;
      if (externalOrigin !== handler.applicationOrigin) {
        adapterFailure(response, 400);
        return;
      }
      const method = request.method.toUpperCase();
      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request);
      const fetchRequest = new Request(`${handler.applicationOrigin}${rawTarget}`, {
        method,
        headers: copyHeaders(request),
        signal: abort.signal,
        ...(body === undefined || body.byteLength === 0
          ? {}
          : { body: Uint8Array.from(body).buffer }),
      });
      const fetchResponse = await handler.fetch(fetchRequest, { rawTarget });
      if (!abort.signal.aborted) await send(response, fetchResponse);
    } catch (cause) {
      if (!abort.signal.aborted)
        adapterFailure(
          response,
          cause instanceof Error && cause.message === "STUDIO_ADAPTER_BODY_TOO_LARGE" ? 413 : 400,
        );
    } finally {
      request.removeListener("aborted", onAborted);
      response.removeListener("close", onClosed);
    }
  };
}
