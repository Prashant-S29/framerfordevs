// Performs bounded, redirect-free Tooling reads with exact public-envelope decoding.

import { Context, Effect, Schema } from "effect";

import { ToolingHttpError, ToolingResponseTooLargeError, ToolingTransportError } from "../errors";
import {
  ToolingCollectionRevision,
  ToolingEnvironmentPage,
  ToolingFailureResponse,
  ToolingManifestPage,
  ToolingProjectPage,
  ToolingSuccessResponse,
} from "../schema";

const maximumResponseBytes = 1_572_864;
const maximumTokenBytes = 16_384;
const defaultTimeoutMs = 15_000;

export interface ToolingHttpClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

export interface ToolingRequestOptions {
  readonly signal?: AbortSignal;
}

function transportError(operation: string, cause: unknown) {
  return ToolingTransportError.make({ operation, cause });
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

async function boundedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) > maximumResponseBytes) {
    throw ToolingResponseTooLargeError.make();
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
        throw ToolingResponseTooLargeError.make();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function pagePath(path: string, cursor: string | null, limit: number): string {
  const parameters = new URLSearchParams({ limit: String(limit) });
  if (cursor !== null) parameters.set("cursor", cursor);
  return `${path}?${parameters.toString()}`;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

export function makeToolingHttpClient(options: ToolingHttpClientOptions) {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const baseUrl = new URL(options.baseUrl);
  if (Buffer.byteLength(options.token, "utf8") > maximumTokenBytes) {
    throw new Error("Tooling bearer token exceeds the fixed bound.");
  }

  const request = <A, I>(
    path: string,
    dataSchema: Schema.Schema<A, I, never>,
    requestOptions: ToolingRequestOptions = {},
  ) =>
    Effect.gen(function* () {
      const url = new URL(path, baseUrl);
      if (url.origin !== baseUrl.origin) {
        return yield* ToolingTransportError.make({
          operation: "tooling.url.authority",
          cause: new Error("Tooling URL escaped configured origin."),
        });
      }
      const response = yield* Effect.tryPromise({
        try: () =>
          fetchImplementation(url, {
            method: "GET",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${options.token}`,
            },
            redirect: "error",
            signal: requestSignal(requestOptions.signal, timeoutMs),
          }),
        catch: (cause) => transportError("tooling.fetch", cause),
      });
      const body = yield* Effect.tryPromise({
        try: () => boundedBody(response),
        catch: (cause) =>
          cause instanceof ToolingResponseTooLargeError
            ? cause
            : transportError("tooling.response.read", cause),
      });
      const unknownBody = yield* Effect.try({
        try: (): unknown => JSON.parse(body),
        catch: (cause) => transportError("tooling.response.json", cause),
      });
      if (response.ok) {
        const success = yield* Schema.decodeUnknown(ToolingSuccessResponse(dataSchema))(
          unknownBody,
          { onExcessProperty: "error" },
        ).pipe(
          Effect.mapError((cause) => transportError("tooling.response.decode_success", cause)),
        );
        return success.data;
      }
      const failure = yield* Schema.decodeUnknown(ToolingFailureResponse)(unknownBody, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError((cause) => transportError("tooling.response.decode_failure", cause)));
      return yield* ToolingHttpError.make({
        status: response.status,
        code: failure.error.code,
        retryable: failure.error.retryable,
      });
    });

  return {
    listProjects: (cursor: string | null, limit: number, requestOptions?: ToolingRequestOptions) =>
      request(
        pagePath("/api/tooling/v1/projects", cursor, limit),
        ToolingProjectPage,
        requestOptions,
      ),
    listEnvironments: (
      projectId: string,
      cursor: string | null,
      limit: number,
      requestOptions?: ToolingRequestOptions,
    ) =>
      request(
        pagePath(`/api/tooling/v1/projects/${segment(projectId)}/environments`, cursor, limit),
        ToolingEnvironmentPage,
        requestOptions,
      ),
    getManifestPage: (
      projectId: string,
      environmentKey: string,
      cursor: string | null,
      limit: number,
      requestOptions?: ToolingRequestOptions,
    ) =>
      request(
        pagePath(
          `/api/tooling/v1/projects/${segment(projectId)}/environments/${segment(environmentKey)}/schema/manifest`,
          cursor,
          limit,
        ),
        ToolingManifestPage,
        requestOptions,
      ),
    getCollectionRevision: (
      projectId: string,
      environmentKey: string,
      collectionKey: string,
      revisionId: string,
      requestOptions?: ToolingRequestOptions,
    ) =>
      request(
        `/api/tooling/v1/projects/${segment(projectId)}/environments/${segment(environmentKey)}/schema/collections/${segment(collectionKey)}/revisions/${segment(revisionId)}`,
        ToolingCollectionRevision,
        requestOptions,
      ),
  };
}

export class ToolingHttpClient extends Context.Tag("ToolingHttpClient")<
  ToolingHttpClient,
  ReturnType<typeof makeToolingHttpClient>
>() {}
