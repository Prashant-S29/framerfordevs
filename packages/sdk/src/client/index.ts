// Provides framework-independent, bounded Delivery v1 and Preview v1 fetch clients.

export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface PublicApiError {
  readonly code: string;
  readonly message: string;
  readonly details?: ReadonlyArray<JsonObject>;
  readonly retryable: boolean;
  readonly requestId: string;
}

export interface ApiSuccess<T> {
  readonly ok: true;
  readonly data: T;
  readonly error: null;
  readonly message: string;
}

export interface ApiFailure {
  readonly ok: false;
  readonly data: null;
  readonly error: PublicApiError;
  readonly message: string;
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export interface SdkResponse<T> {
  readonly status: number;
  readonly body: ApiEnvelope<T> | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly cacheControl: string | null;
  readonly requestId: string | null;
  readonly rateLimit: {
    readonly limit: number | null;
    readonly remaining: number | null;
    readonly reset: number | null;
    readonly retryAfter: number | null;
  };
}

export interface PublicEntry<TData extends JsonObject = JsonObject> {
  readonly id: string;
  readonly collectionId: string;
  readonly collection: string;
  readonly locale: string;
  readonly data: TData;
  readonly publication: {
    readonly id: string;
    readonly sequence: number;
    readonly schemaRevisionId: string;
    readonly publishedAt: string;
  };
}

export interface PublicEntryPage<TData extends JsonObject = JsonObject> {
  readonly items: ReadonlyArray<PublicEntry<TData>>;
  readonly page: {
    readonly limit: number;
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}

export interface PreviewEntry<TData extends JsonObject = JsonObject> {
  readonly id: string;
  readonly collectionId: string;
  readonly collection: string;
  readonly locale: string;
  readonly data: TData;
  readonly preview: {
    readonly version: 1;
    readonly schemaRevisionId: string;
    readonly contractHash: string;
    readonly sharedRevisionId: string | null;
    readonly sharedVersion: number;
    readonly localizedRevisionId: string | null;
    readonly localizedVersion: number;
    readonly source: "current" | "revision";
  };
  readonly validation: {
    readonly valid: boolean;
    readonly issues: ReadonlyArray<JsonObject>;
    readonly capped: boolean;
  };
}

export interface ClientRequestOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly ifNoneMatch?: string;
  readonly ifModifiedSince?: string;
}

export interface ClientFactoryOptions {
  readonly baseUrl: string;
  readonly token?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

export interface ProjectClientOptions extends ClientFactoryOptions {
  readonly projectId: string;
  readonly environment: string;
  readonly previewToken?: string;
}

export interface DeliveryListOptions extends ClientRequestOptions {
  readonly locale: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly sort?: string;
  readonly expand?: ReadonlyArray<string>;
  readonly filters?: Readonly<Record<string, string | number | boolean>>;
}

export interface DeliveryItemOptions extends ClientRequestOptions {
  readonly locale: string;
  readonly expand?: ReadonlyArray<string>;
}

export interface PreviewRevisionOptions extends ClientRequestOptions {
  readonly locale: string;
  readonly sharedRevision: string | "none";
  readonly localizedRevision: string | "none";
}

const maximumBodyBytes = 4 * 1_024 * 1_024;
const defaultTimeoutMs = 15_000;
const maximumPages = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function baseOrigin(value: string): URL {
  const url = new URL(value);
  const local =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    throw new Error("Use an HTTPS API origin or explicit localhost development origin.");
  }
  return url;
}

function segment(value: string): string {
  if (value.length < 1 || value.length > 128) throw new Error("A route segment is out of bounds.");
  return encodeURIComponent(value);
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

async function boundedText(response: Response): Promise<string> {
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maximumBodyBytes)
    throw new Error("Response is too large.");
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBodyBytes) {
        await reader.cancel();
        throw new Error("Response is too large.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function optionalNumber(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function jsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(jsonValue);
  if (isRecord(value)) {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) output[key] = jsonValue(item);
    return output;
  }
  throw new Error("Public API returned a non-JSON value.");
}

function isJsonArray(value: JsonValue): value is ReadonlyArray<JsonValue> {
  return Array.isArray(value);
}

function jsonObject(value: unknown): JsonObject {
  const decoded = jsonValue(value);
  if (typeof decoded !== "object" || decoded === null || isJsonArray(decoded)) {
    throw new Error("Public API returned a non-object value.");
  }
  return decoded;
}

function decodeEntry(value: unknown): PublicEntry {
  const object = jsonObject(value);
  const publication = jsonObject(object["publication"]);
  const data = jsonObject(object["data"]);
  if (
    typeof object["id"] !== "string" ||
    typeof object["collectionId"] !== "string" ||
    typeof object["collection"] !== "string" ||
    typeof object["locale"] !== "string" ||
    typeof publication["id"] !== "string" ||
    !Number.isInteger(publication["sequence"]) ||
    typeof publication["schemaRevisionId"] !== "string" ||
    typeof publication["publishedAt"] !== "string"
  ) {
    throw new Error("Delivery entry is invalid.");
  }
  return {
    id: object["id"],
    collectionId: object["collectionId"],
    collection: object["collection"],
    locale: object["locale"],
    data,
    publication: {
      id: publication["id"],
      sequence: Number(publication["sequence"]),
      schemaRevisionId: publication["schemaRevisionId"],
      publishedAt: publication["publishedAt"],
    },
  };
}

function decodeEntryPage(value: unknown): PublicEntryPage {
  const object = jsonObject(value);
  const items = object["items"];
  const page = jsonObject(object["page"]);
  if (
    !Array.isArray(items) ||
    !Number.isInteger(page["limit"]) ||
    (page["nextCursor"] !== null && typeof page["nextCursor"] !== "string") ||
    typeof page["hasMore"] !== "boolean"
  ) {
    throw new Error("Delivery page is invalid.");
  }
  return {
    items: items.map(decodeEntry),
    page: {
      limit: Number(page["limit"]),
      nextCursor: page["nextCursor"],
      hasMore: page["hasMore"],
    },
  };
}

function decodePreview(value: unknown): PreviewEntry {
  const object = jsonObject(value);
  const data = jsonObject(object["data"]);
  const preview = jsonObject(object["preview"]);
  const validation = jsonObject(object["validation"]);
  const issues = validation["issues"];
  const source = preview["source"];
  if (
    typeof object["id"] !== "string" ||
    typeof object["collectionId"] !== "string" ||
    typeof object["collection"] !== "string" ||
    typeof object["locale"] !== "string" ||
    preview["version"] !== 1 ||
    typeof preview["schemaRevisionId"] !== "string" ||
    typeof preview["contractHash"] !== "string" ||
    (preview["sharedRevisionId"] !== null && typeof preview["sharedRevisionId"] !== "string") ||
    !Number.isInteger(preview["sharedVersion"]) ||
    (preview["localizedRevisionId"] !== null &&
      typeof preview["localizedRevisionId"] !== "string") ||
    !Number.isInteger(preview["localizedVersion"]) ||
    (source !== "current" && source !== "revision") ||
    typeof validation["valid"] !== "boolean" ||
    !Array.isArray(issues) ||
    typeof validation["capped"] !== "boolean"
  ) {
    throw new Error("Preview entry is invalid.");
  }
  return {
    id: object["id"],
    collectionId: object["collectionId"],
    collection: object["collection"],
    locale: object["locale"],
    data,
    preview: {
      version: 1,
      schemaRevisionId: preview["schemaRevisionId"],
      contractHash: preview["contractHash"],
      sharedRevisionId: preview["sharedRevisionId"],
      sharedVersion: Number(preview["sharedVersion"]),
      localizedRevisionId: preview["localizedRevisionId"],
      localizedVersion: Number(preview["localizedVersion"]),
      source,
    },
    validation: {
      valid: validation["valid"],
      issues: issues.map(jsonObject),
      capped: validation["capped"],
    },
  };
}

function envelope<T>(value: unknown, decodeData: (value: unknown) => T): ApiEnvelope<T> {
  if (!isRecord(value) || typeof value.ok !== "boolean" || typeof value.message !== "string") {
    throw new Error("Public API response envelope is invalid.");
  }
  if (value.ok) {
    if (value.error !== null || !("data" in value)) throw new Error("Success envelope is invalid.");
    return { ok: true, data: decodeData(value.data), error: null, message: value.message };
  }
  if (value.data !== null || !isRecord(value.error))
    throw new Error("Failure envelope is invalid.");
  const error = value.error;
  if (
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    typeof error.retryable !== "boolean" ||
    typeof error.requestId !== "string"
  ) {
    throw new Error("Public API error is invalid.");
  }
  const details = error.details;
  if (details !== undefined && !Array.isArray(details)) {
    throw new Error("Public API error details are invalid.");
  }
  return {
    ok: false,
    data: null,
    error: {
      code: error.code,
      message: error.message,
      ...(details === undefined ? {} : { details: details.map(jsonObject) }),
      retryable: error.retryable,
      requestId: error.requestId,
    },
    message: value.message,
  };
}

function makeClient(options: ClientFactoryOptions) {
  const origin = baseOrigin(options.baseUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const defaultTimeout = options.timeoutMs ?? defaultTimeoutMs;
  return async <T>(
    path: string,
    decodeData: (value: unknown) => T,
    requestOptions: ClientRequestOptions = {},
    token = options.token,
  ): Promise<SdkResponse<T>> => {
    const url = new URL(path, origin);
    if (url.origin !== origin.origin) throw new Error("Request escaped the configured origin.");
    const headers = new Headers({ Accept: "application/json" });
    if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);
    if (requestOptions.ifNoneMatch !== undefined) {
      headers.set("If-None-Match", requestOptions.ifNoneMatch);
    }
    if (requestOptions.ifModifiedSince !== undefined) {
      headers.set("If-Modified-Since", requestOptions.ifModifiedSince);
    }
    const response = await fetchImplementation(url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: requestSignal(requestOptions.signal, requestOptions.timeoutMs ?? defaultTimeout),
    });
    const text = await boundedText(response);
    const body = text.length === 0 ? null : envelope(JSON.parse(text), decodeData);
    return {
      status: response.status,
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      cacheControl: response.headers.get("cache-control"),
      requestId: response.headers.get("x-request-id"),
      rateLimit: {
        limit: optionalNumber(response.headers.get("ratelimit-limit")),
        remaining: optionalNumber(response.headers.get("ratelimit-remaining")),
        reset: optionalNumber(response.headers.get("ratelimit-reset")),
        retryAfter: optionalNumber(response.headers.get("retry-after")),
      },
    };
  };
}

function collectionPath(projectId: string, environment: string, collectionKey: string) {
  return `/api/delivery/v1/projects/${segment(projectId)}/environments/${segment(environment)}/collections/${segment(collectionKey)}/entries`;
}

function itemQuery(options: DeliveryItemOptions): URLSearchParams {
  const query = new URLSearchParams({ locale: options.locale });
  if (options.expand !== undefined && options.expand.length > 0) {
    query.set("expand", options.expand.join(","));
  }
  return query;
}

export function deliveryV1(
  options: ClientFactoryOptions & { readonly projectId: string; readonly environment: string },
) {
  const request = makeClient(options);
  return {
    list: (collectionKey: string, input: DeliveryListOptions) => {
      const query = itemQuery(input);
      if (input.limit !== undefined) query.set("limit", String(input.limit));
      if (input.cursor !== undefined) query.set("cursor", input.cursor);
      if (input.sort !== undefined) query.set("sort", input.sort);
      for (const [key, value] of Object.entries(input.filters ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        query.set(key, String(value));
      }
      return request(
        `${collectionPath(options.projectId, options.environment, collectionKey)}?${query}`,
        decodeEntryPage,
        input,
      );
    },
    get: (collectionKey: string, entryId: string, input: DeliveryItemOptions) =>
      request(
        `${collectionPath(options.projectId, options.environment, collectionKey)}/${segment(entryId)}?${itemQuery(input)}`,
        decodeEntry,
        input,
      ),
    getPublication: (
      collectionKey: string,
      entryId: string,
      publicationId: string,
      input: DeliveryItemOptions,
    ) =>
      request(
        `${collectionPath(options.projectId, options.environment, collectionKey)}/${segment(entryId)}/publications/${segment(publicationId)}?${itemQuery(input)}`,
        decodeEntry,
        input,
      ),
    getUnique: (
      collectionKey: string,
      fieldKey: string,
      value: string | number | boolean,
      input: DeliveryItemOptions,
    ) => {
      const query = itemQuery(input);
      query.set("value", String(value));
      return request(
        `${collectionPath(options.projectId, options.environment, collectionKey)}/by/${segment(fieldKey)}?${query}`,
        decodeEntry,
        input,
      );
    },
    pages: async function* (collectionKey: string, input: Omit<DeliveryListOptions, "cursor">) {
      const seen = new Set<string>();
      let cursor: string | undefined;
      for (let page = 0; page < maximumPages; page += 1) {
        const response = await this.list(collectionKey, { ...input, cursor });
        yield response;
        if (response.body === null || !response.body.ok) return;
        const next = response.body.data.page.nextCursor;
        if (next === null) return;
        if (seen.has(next)) throw new Error("Delivery pagination repeated a cursor.");
        seen.add(next);
        cursor = next;
      }
      throw new Error("Delivery pagination exceeded the fixed page bound.");
    },
  };
}

function previewPath(
  projectId: string,
  environment: string,
  collectionKey: string,
  entryId: string,
) {
  return `/api/preview/v1/projects/${segment(projectId)}/environments/${segment(environment)}/collections/${segment(collectionKey)}/entries/${segment(entryId)}`;
}

export function previewV1(
  options: ClientFactoryOptions & { readonly projectId: string; readonly environment: string },
) {
  if (options.token === undefined)
    throw new Error("Preview requires an explicit bearer credential.");
  const request = makeClient(options);
  return {
    current: (
      collectionKey: string,
      entryId: string,
      input: ClientRequestOptions & { readonly locale: string },
    ) =>
      request(
        `${previewPath(options.projectId, options.environment, collectionKey, entryId)}/draft?${new URLSearchParams({ locale: input.locale })}`,
        decodePreview,
        input,
      ),
    revision: (
      collectionKey: string,
      entryId: string,
      schemaRevisionId: string,
      input: PreviewRevisionOptions,
    ) =>
      request(
        `${previewPath(options.projectId, options.environment, collectionKey, entryId)}/revisions/${segment(schemaRevisionId)}?${new URLSearchParams({ locale: input.locale, sharedRevision: input.sharedRevision, localizedRevision: input.localizedRevision })}`,
        decodePreview,
        input,
      ),
  };
}

export function createProjectClient(options: ProjectClientOptions) {
  return {
    delivery: deliveryV1(options),
    preview:
      options.previewToken === undefined
        ? null
        : previewV1({ ...options, token: options.previewToken }),
  };
}
