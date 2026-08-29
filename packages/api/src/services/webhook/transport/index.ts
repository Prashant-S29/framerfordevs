// Sends one bounded HTTPS webhook using a prevalidated pinned address and fixed request headers.

import https from "node:https";
import type { Socket } from "node:net";
import { TLSSocket } from "node:tls";

import { Context, Effect, Layer } from "effect";

import { SecurityServiceFailure } from "../../../contracts/response/errors";

export interface WebhookTransportRequest {
  readonly url: string;
  readonly hostname: string;
  readonly address: string;
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly connectTimeoutMs: number;
  readonly timeoutMs: number;
}

export interface WebhookTransportResponse {
  readonly status: number;
  readonly retryAfter: string | undefined;
}

export interface WebhookHttpsOptions {
  readonly protocol: "https:";
  readonly hostname: string;
  readonly servername: string;
  readonly port: 443;
  readonly path: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly timeout: number;
  readonly agent: https.Agent;
  readonly lookup: (
    hostname: string,
    options: unknown,
    callback: (
      error: null,
      address: string | Array<{ address: string; family: 4 | 6 }>,
      family?: 4 | 6,
    ) => void,
  ) => void;
}

export interface WebhookHttpsResponse {
  readonly statusCode?: number;
  readonly headers: Readonly<Record<string, string | ReadonlyArray<string> | undefined>>;
  readonly destroy: () => void;
}

export interface WebhookHttpsRequest {
  readonly end: (body: Uint8Array) => void;
  readonly destroy: (cause: Error) => void;
}

export interface WebhookHttpsAdapter {
  readonly request: (
    options: WebhookHttpsOptions,
    onResponse: (response: WebhookHttpsResponse) => void,
    onError: (cause: unknown) => void,
    onTimeout: () => void,
    onSecureConnect: () => void,
  ) => WebhookHttpsRequest;
}

export interface WebhookTimeoutHandle {
  readonly clear: () => void;
  readonly unref: () => void;
}

export type WebhookTimeoutScheduler = (
  callback: () => void,
  milliseconds: number,
) => WebhookTimeoutHandle;

const NodeHttpsAdapter: WebhookHttpsAdapter = {
  /** Starts one HTTPS request and reports when its TLS connection becomes usable. */
  request: (options, onResponse, onError, onTimeout, onSecureConnect) => {
    const outbound = https.request(options, onResponse);
    /** Observes the actual socket so the connect deadline includes the TLS handshake. */
    const handleSocket = (socket: Socket) => {
      if (socket instanceof TLSSocket) socket.once("secureConnect", onSecureConnect);
      else socket.once("connect", onSecureConnect);
    };
    outbound.once("socket", handleSocket);
    outbound.once("timeout", onTimeout);
    outbound.once("error", onError);
    return outbound;
  },
};

/** Schedules one unreferenced Node timer behind the transport's testable timer contract. */
function scheduleNodeTimeout(callback: () => void, milliseconds: number): WebhookTimeoutHandle {
  const handle = setTimeout(callback, milliseconds);
  return {
    clear: () => clearTimeout(handle),
    unref: () => handle.unref(),
  };
}

/** Wraps a transport failure without exposing its raw network details to callers. */
function failure(operation: string, cause: unknown) {
  return SecurityServiceFailure.make({ operation, cause });
}

/** Builds the private non-reusing HTTPS transport with separate connect and total deadlines. */
export function makeWebhookTransport(
  adapter: WebhookHttpsAdapter = NodeHttpsAdapter,
  scheduleTimeout: WebhookTimeoutScheduler = scheduleNodeTimeout,
) {
  const agent = new https.Agent({ keepAlive: false, maxCachedSessions: 100 });
  return {
    send: Effect.fn("WebhookTransport.send")((request: WebhookTransportRequest) =>
      Effect.tryPromise({
        try: () =>
          new Promise<WebhookTransportResponse>((resolve, reject) => {
            const url = new URL(request.url);
            let connectTimeout: WebhookTimeoutHandle | undefined;
            let totalTimeout: WebhookTimeoutHandle | undefined;
            let secureConnected = false;
            /** Clears both independent deadlines after any terminal request outcome. */
            const clearTimeouts = () => {
              connectTimeout?.clear();
              totalTimeout?.clear();
            };
            const outbound = adapter.request(
              {
                protocol: "https:",
                hostname: request.hostname,
                servername: request.hostname,
                port: 443,
                path: `${url.pathname}${url.search}`,
                method: "POST",
                headers: request.headers,
                timeout: request.timeoutMs,
                agent,
                lookup: (_hostname, options, callback) => {
                  const family = request.address.includes(":") ? 6 : 4;
                  const all =
                    typeof options === "object" &&
                    options !== null &&
                    "all" in options &&
                    options.all === true;
                  if (all) callback(null, [{ address: request.address, family }]);
                  else callback(null, request.address, family);
                },
              },
              (response) => {
                clearTimeouts();
                const retryAfter = Array.isArray(response.headers["retry-after"])
                  ? response.headers["retry-after"][0]
                  : response.headers["retry-after"];
                response.destroy();
                resolve({ status: response.statusCode ?? 599, retryAfter });
              },
              (cause) => {
                clearTimeouts();
                reject(cause);
              },
              () => outbound.destroy(new Error("Webhook timed out.")),
              () => {
                secureConnected = true;
                connectTimeout?.clear();
              },
            );
            connectTimeout = scheduleTimeout(
              () => outbound.destroy(new Error("Webhook connection timed out.")),
              request.connectTimeoutMs,
            );
            if (secureConnected) connectTimeout.clear();
            totalTimeout = scheduleTimeout(
              () => outbound.destroy(new Error("Webhook timed out.")),
              request.timeoutMs,
            );
            connectTimeout.unref();
            totalTimeout.unref();
            outbound.end(request.body);
          }),
        catch: (cause) => failure("webhook.transport.send", cause),
      }),
    ),
  };
}

export class WebhookTransport extends Context.Tag("WebhookTransport")<
  WebhookTransport,
  ReturnType<typeof makeWebhookTransport>
>() {}

export const WebhookTransportLive = Layer.succeed(WebhookTransport, makeWebhookTransport());
