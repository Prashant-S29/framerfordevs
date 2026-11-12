import {
  decodeStudioContentContextResponse,
  decodeStudioCreateEntryResponse,
  decodeStudioEntryPageResponse,
  decodeStudioEntryWorkspaceResponse,
  decodeStudioNewEntryWorkspaceResponse,
  decodeStudioRenameEntryResponse,
  decodeStudioResolveEntriesResponse,
  decodeStudioSaveEntryDraftResponse,
  studioContentBrowserLimits,
  type StudioContentBrowserFailure,
  type StudioContentContextDto,
  type StudioContentRouteExpectation,
  type StudioCreateEntryResultDto,
  type StudioEntryPageDto,
  type StudioEntrySummaryDto,
  type StudioEntryWorkspaceDto,
  type StudioJsonObject,
  type StudioMutationReceiptDto,
  type StudioNewEntryWorkspaceDto,
  type StudioResolvedEntryLabelsDto,
} from "../contracts/content";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const localeTag = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const mountPattern = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u;

export class StudioContentClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;
  readonly requestId: string | null;

  constructor(options: {
    readonly status: number;
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly retryAfterSeconds?: number | null;
    readonly requestId?: string | null;
  }) {
    super(options.message);
    this.name = "StudioContentClientError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.requestId = options.requestId ?? null;
  }
}

export interface StudioContentClientOptions {
  readonly mountPath: string;
  readonly fetch?: typeof globalThis.fetch;
}

export interface StudioContentCollectionScope {
  readonly collectionId: string;
  readonly locale: string;
}

export interface StudioContentEntryScope extends StudioContentCollectionScope {
  readonly entryId: string;
}

type Decoded<T> = T | StudioContentBrowserFailure;
type ResponseDecoder<T> = (value: unknown, status: number) => Decoded<T>;

function isDecodedFailure<T>(value: Decoded<T>): value is StudioContentBrowserFailure {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === false;
}

function validateMountPath(value: string): string {
  if (!mountPattern.test(value) || value.length > 240) {
    throw new Error("STUDIO_CONTENT_CLIENT_CONFIGURATION_INVALID");
  }
  return value;
}

function validateCollectionScope(
  scope: StudioContentCollectionScope,
): StudioContentCollectionScope {
  if (!uuid.test(scope.collectionId) || scope.locale.length > 35 || !localeTag.test(scope.locale)) {
    throw new StudioContentClientError({
      status: 0,
      code: "STUDIO_REQUEST_INVALID",
      message: "The Studio Content route is invalid.",
      retryable: false,
    });
  }
  return { collectionId: scope.collectionId, locale: scope.locale };
}

function validateEntryScope(scope: StudioContentEntryScope): StudioContentEntryScope {
  const collection = validateCollectionScope(scope);
  if (!uuid.test(scope.entryId)) {
    throw new StudioContentClientError({
      status: 0,
      code: "STUDIO_REQUEST_INVALID",
      message: "The Studio Content route is invalid.",
      retryable: false,
    });
  }
  return { ...collection, entryId: scope.entryId };
}

function validateResolutionEntryIds(entryIds: ReadonlyArray<string>): ReadonlyArray<string> {
  if (
    entryIds.length < 1 ||
    entryIds.length > studioContentBrowserLimits.maximumResolvedEntries ||
    entryIds.some((entryId) => !uuid.test(entryId)) ||
    new Set(entryIds).size !== entryIds.length
  ) {
    throw new StudioContentClientError({
      status: 0,
      code: "STUDIO_REQUEST_INVALID",
      message: "The Studio Content reference request is invalid.",
      retryable: false,
    });
  }
  return [...entryIds];
}

function encodedBody(value: StudioJsonObject, maximumBytes: number): string {
  const body = JSON.stringify(value);
  if (new TextEncoder().encode(body).byteLength > maximumBytes) {
    throw new StudioContentClientError({
      status: 0,
      code: "REQUEST_TOO_LARGE",
      message: "The Studio Content request is too large.",
      retryable: false,
    });
  }
  return body;
}

function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (value === null || !/^\d{1,6}$/u.test(value)) return null;
  return Number(value);
}

function throwFailure(response: Response, failure: StudioContentBrowserFailure): never {
  throw new StudioContentClientError({
    status: response.status,
    code: failure.error.code,
    message: failure.message,
    retryable: failure.error.retryable ?? response.status === 503,
    retryAfterSeconds: retryAfterSeconds(response),
    requestId: failure.error.requestId ?? null,
  });
}

async function boundedJson(response: Response): Promise<unknown> {
  if (response.redirected) {
    throw new StudioContentClientError({
      status: 0,
      code: "STUDIO_UPSTREAM_UNAVAILABLE",
      message: "Studio rejected an unexpected redirect.",
      retryable: false,
    });
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:;\s*charset=utf-8)?$/iu.test(contentType)) {
    throw new StudioContentClientError({
      status: response.status,
      code: "STUDIO_UPSTREAM_UNAVAILABLE",
      message: "Studio returned an invalid response.",
      retryable: false,
    });
  }
  const declared = response.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/u.test(declared) || Number(declared) > studioContentBrowserLimits.responseBytes)
  ) {
    throw new StudioContentClientError({
      status: response.status,
      code: "STUDIO_UPSTREAM_UNAVAILABLE",
      message: "Studio returned an oversized response.",
      retryable: false,
    });
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > studioContentBrowserLimits.responseBytes) {
    throw new StudioContentClientError({
      status: response.status,
      code: "STUDIO_UPSTREAM_UNAVAILABLE",
      message: "Studio returned an oversized response.",
      retryable: false,
    });
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw new StudioContentClientError({
      status: response.status,
      code: "STUDIO_UPSTREAM_UNAVAILABLE",
      message: "Studio returned an invalid response.",
      retryable: false,
    });
  }
}

export function createStudioContentClient(options: StudioContentClientOptions) {
  const mountPath = validateMountPath(options.mountPath);
  const requestFetch = options.fetch ?? globalThis.fetch;

  const request = async <T>(input: {
    readonly path: string;
    readonly method: "GET" | "POST" | "PATCH";
    readonly signal: AbortSignal;
    readonly decoder: ResponseDecoder<T>;
    readonly body?: StudioJsonObject;
    readonly maximumRequestBytes?: number;
  }): Promise<T> => {
    const body =
      input.body === undefined
        ? undefined
        : encodedBody(
            input.body,
            input.maximumRequestBytes ?? studioContentBrowserLimits.mutationRequestBytes,
          );
    let response: Response;
    try {
      response = await requestFetch(`${mountPath}${input.path}`, {
        method: input.method,
        credentials: "same-origin",
        redirect: "error",
        signal: input.signal,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body }),
      });
    } catch (cause) {
      if (input.signal.aborted) throw cause;
      throw new StudioContentClientError({
        status: 0,
        code: "STUDIO_UPSTREAM_UNAVAILABLE",
        message: "Studio could not reach the content service.",
        retryable: true,
      });
    }
    let decoded: Decoded<T>;
    try {
      decoded = input.decoder(await boundedJson(response), response.status);
    } catch (cause) {
      if (cause instanceof StudioContentClientError) throw cause;
      throw new StudioContentClientError({
        status: response.status,
        code: "STUDIO_UPSTREAM_UNAVAILABLE",
        message: "Studio returned an invalid response.",
        retryable: false,
      });
    }
    if (isDecodedFailure(decoded)) return throwFailure(response, decoded);
    return decoded;
  };

  const collectionPath = (scope: StudioContentCollectionScope): string => {
    const valid = validateCollectionScope(scope);
    return `/api/content/collections/${valid.collectionId}/locales/${valid.locale}/entries`;
  };

  return {
    context(signal: AbortSignal): Promise<StudioContentContextDto> {
      return request({
        path: "/api/content/context",
        method: "GET",
        signal,
        decoder: decodeStudioContentContextResponse,
      });
    },
    browse(
      scope: StudioContentCollectionScope,
      input: { readonly cursor: string | null; readonly limit: number },
      signal: AbortSignal,
    ): Promise<StudioEntryPageDto> {
      const parameters = new URLSearchParams({ limit: String(input.limit) });
      if (input.cursor !== null) parameters.set("cursor", input.cursor);
      return request({
        path: `${collectionPath(scope)}?${parameters.toString()}`,
        method: "GET",
        signal,
        decoder: decodeStudioEntryPageResponse,
      });
    },
    search(
      scope: StudioContentCollectionScope,
      input: { readonly query: string; readonly cursor: string | null; readonly limit: number },
      signal: AbortSignal,
    ): Promise<StudioEntryPageDto> {
      return request({
        path: `${collectionPath(scope)}/search`,
        method: "POST",
        signal,
        body: { query: input.query, cursor: input.cursor, limit: input.limit },
        maximumRequestBytes: studioContentBrowserLimits.searchRequestBytes,
        decoder: decodeStudioEntryPageResponse,
      });
    },
    resolve(
      scope: StudioContentCollectionScope,
      entryIds: ReadonlyArray<string>,
      signal: AbortSignal,
    ): Promise<StudioResolvedEntryLabelsDto> {
      const validEntryIds = validateResolutionEntryIds(entryIds);
      return request({
        path: `${collectionPath(scope)}/resolve`,
        method: "POST",
        signal,
        body: { entryIds: validEntryIds },
        maximumRequestBytes: studioContentBrowserLimits.resolveRequestBytes,
        decoder: (value, status) =>
          decodeStudioResolveEntriesResponse(value, status, validEntryIds),
      });
    },
    newWorkspace(
      scope: StudioContentCollectionScope,
      signal: AbortSignal,
    ): Promise<StudioNewEntryWorkspaceDto> {
      const valid = validateCollectionScope(scope);
      return request({
        path: `${collectionPath(valid)}/new`,
        method: "GET",
        signal,
        decoder: (value, status) => decodeStudioNewEntryWorkspaceResponse(value, status, valid),
      });
    },
    workspace(
      scope: StudioContentEntryScope,
      signal: AbortSignal,
    ): Promise<StudioEntryWorkspaceDto> {
      const valid = validateEntryScope(scope);
      return request({
        path: `${collectionPath(valid)}/${valid.entryId}`,
        method: "GET",
        signal,
        decoder: (value, status) => decodeStudioEntryWorkspaceResponse(value, status, valid),
      });
    },
    create(
      scope: StudioContentCollectionScope,
      body: StudioJsonObject,
      visibleFieldIds: ReadonlySet<string>,
      signal: AbortSignal,
    ): Promise<StudioCreateEntryResultDto> {
      const valid = validateCollectionScope(scope);
      return request({
        path: collectionPath(valid),
        method: "POST",
        signal,
        body,
        decoder: (value, status) =>
          decodeStudioCreateEntryResponse(value, status, valid, visibleFieldIds),
      });
    },
    rename(
      scope: StudioContentEntryScope,
      body: StudioJsonObject,
      signal: AbortSignal,
    ): Promise<StudioEntrySummaryDto> {
      const valid = validateEntryScope(scope);
      return request({
        path: `${collectionPath(valid)}/${valid.entryId}/name`,
        method: "PATCH",
        signal,
        body,
        decoder: (value, status) => decodeStudioRenameEntryResponse(value, status, valid),
      });
    },
    save(
      scope: StudioContentEntryScope,
      body: StudioJsonObject,
      visibleFieldIds: ReadonlySet<string>,
      signal: AbortSignal,
    ): Promise<StudioMutationReceiptDto> {
      const valid = validateEntryScope(scope);
      return request({
        path: `${collectionPath(valid)}/${valid.entryId}/draft`,
        method: "PATCH",
        signal,
        body,
        decoder: (value, status) =>
          decodeStudioSaveEntryDraftResponse(value, status, valid, visibleFieldIds),
      });
    },
  };
}

export type StudioContentClient = ReturnType<typeof createStudioContentClient>;
export type { StudioContentRouteExpectation };
