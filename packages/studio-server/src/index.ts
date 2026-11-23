import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  decodeStudioBrowserBootstrap,
  type StudioBrowserBootstrap,
} from "@framerfordevs/studio/contracts";
import { Cause, Data, Effect, Layer, ManagedRuntime } from "effect";

import { renderStudioHtml, type StudioAsset, type StudioAssets } from "./assets";
import {
  decryptStudioRecord,
  encryptStudioRecord,
  validateStudioKeyRing,
  type StudioEncryptionKeyRing,
  type ValidatedStudioKeyRing,
} from "./crypto/index";
import { isPortableStudioMountPath, parseStudioRawTarget } from "./raw-target";
import type { StudioSessionRecord, StudioSessionStore } from "./store";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const exactScopes = "studio:session offline_access";
const attemptLifetimeMs = 10 * 60 * 1_000;
const absoluteGrantLifetimeMs = 8 * 60 * 60 * 1_000;
const refreshWindowMs = 60 * 1_000;
const maximumOAuthResponseBytes = 32 * 1_024;
const maximumBootstrapResponseBytes = 64 * 1_024;
const maximumContentRequestBytes = 1 * 1_024 * 1_024;
const maximumContentSearchRequestBytes = 2 * 1_024;
const maximumContentResolveRequestBytes = 8 * 1_024;
const maximumContentCommandRequestBytes = 4 * 1_024;
const maximumContentPresentationRequestBytes = 256 * 1_024;
const maximumContentResponseBytes = 4 * 1_024 * 1_024;
const maximumCookieHeaderBytes = 4 * 1_024;
function shellCsp(previewOrigin: string | null): string {
  const frames = previewOrigin === null ? "'none'" : `'self' ${previewOrigin}`;
  return `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'none'; worker-src 'none'; child-src ${frames}; frame-src ${frames}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;
}
const csp = shellCsp(null);
const previewLaunchScript = 'document.getElementById("ffd-preview-launch")?.submit();\n';

export interface StudioServerTelemetryEvent {
  readonly operation:
    | "login"
    | "callback"
    | "bootstrap"
    | "content"
    | "refresh"
    | "logout"
    | "asset";
  readonly outcome: "success" | "rejected" | "upstream_failure" | "store_failure";
  readonly status: number;
  readonly durationMs: number;
  readonly storageMode: "shared" | "memory";
  readonly refreshGeneration?: number;
  readonly keyRotation?: boolean;
}

export interface StudioServerConfig {
  readonly mode: "development" | "test" | "production";
  readonly applicationOrigin: string;
  readonly platformOrigin: string;
  readonly dashboardOrigin: string;
  readonly mountPath: string;
  readonly registrationId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly store: StudioSessionStore;
  readonly encryption: StudioEncryptionKeyRing;
  readonly assets: StudioAssets;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly observe?: (event: StudioServerTelemetryEvent) => void;
  readonly upstreamTimeoutMs?: number;
  readonly previewUrl?: string;
}

export interface StudioRequestContext {
  readonly rawTarget: string;
}

export interface StudioFetchHandler {
  readonly fetch: (request: Request, context: StudioRequestContext) => Promise<Response>;
  readonly dispose: () => Promise<void>;
  readonly mountPath: string;
  readonly applicationOrigin: string;
}

class StudioHttpFailure extends Data.TaggedError("StudioHttpFailure")<{
  readonly status: number;
  readonly code:
    | "STUDIO_AUTH_REQUIRED"
    | "STUDIO_REQUEST_INVALID"
    | "STUDIO_ORIGIN_INVALID"
    | "STUDIO_SESSION_INVALID"
    | "STUDIO_UPSTREAM_UNAVAILABLE"
    | "STUDIO_CONFIGURATION_INVALID"
    | "STUDIO_ROUTE_NOT_FOUND"
    | "STUDIO_RATE_LIMITED"
    | "STUDIO_FORBIDDEN"
    | "STUDIO_PROJECT_UNAVAILABLE"
    | "STUDIO_CMS_DISABLED"
    | "STUDIO_REGISTRATION_INACTIVE";
  readonly message: string;
  readonly retryAfterSeconds?: number;
  readonly allow?: string;
  readonly clearAttempt?: boolean;
  readonly outcome?: StudioServerTelemetryEvent["outcome"];
}> {}

interface ValidatedConfig extends Omit<
  StudioServerConfig,
  "fetch" | "now" | "observe" | "upstreamTimeoutMs" | "encryption" | "previewUrl"
> {
  readonly issuer: string;
  readonly authorizationUrl: string;
  readonly tokenUrl: string;
  readonly revocationUrl: string;
  readonly resource: string;
  readonly bootstrapUrl: string;
  readonly studioContentBaseUrl: string;
  readonly redirectUri: string;
  readonly clientId: string;
  readonly registrationDigest: string;
  readonly secureCookies: boolean;
  readonly attemptCookie: string;
  readonly sessionCookie: string;
  readonly keyRing: ValidatedStudioKeyRing;
  readonly fetch: typeof globalThis.fetch;
  readonly now: () => number;
  readonly observe: (event: StudioServerTelemetryEvent) => void;
  readonly upstreamTimeoutMs: number;
  readonly previewUrl: string | null;
  readonly previewOrigin: string | null;
  readonly shellCsp: string;
}

interface OAuthAttempt {
  readonly state: string;
  readonly verifier: string;
  readonly createdAtEpochMs: number;
  readonly issuer: string;
  readonly resource: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: typeof exactScopes;
  readonly registrationId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly applicationOrigin: string;
  readonly mountPath: string;
  readonly returnTo: string;
}

interface OAuthTokenSet {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAtEpochMs: number;
  readonly grantExpiresAtEpochMs: number;
}

interface OAuthSession extends OAuthTokenSet {
  readonly registrationId: string;
  readonly registrationVersion: number;
  readonly projectId: string;
  readonly environmentId: string;
  readonly userId: string;
}

interface PlatformBootstrapResult {
  readonly browser: StudioBrowserBootstrap;
  readonly registrationVersion: number;
  readonly userId: string;
}

function exactOrigin(value: string, secureRequired: boolean): string {
  if (value.length > 2_048) throw new Error("STUDIO_CONFIGURATION_INVALID");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  }
  const loopback =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (secureRequired && url.protocol !== "https:") ||
    (!secureRequired && url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  )
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  return url.origin;
}

function exactPreviewUrl(value: string, secureRequired: boolean): string {
  if (value.length > 2_048 || value.includes("?") || value.includes("#") || /\s/u.test(value)) {
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  }
  exactOrigin(url.origin, secureRequired);
  if (url.href !== value || url.username || url.password) {
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  }
  return value;
}

function validateAssets(assets: StudioAssets): StudioAssets {
  const assetPath = /^\/assets\/(?:chunk\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
  if (
    typeof assets.entryScript !== "string" ||
    !assetPath.test(assets.entryScript) ||
    !Array.isArray(assets.stylesheets) ||
    !(assets.files instanceof Map) ||
    assets.files.size < 1 ||
    assets.files.size > 64
  )
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  const stylesheets = [...assets.stylesheets];
  if (
    stylesheets.length > 64 ||
    stylesheets.some((path) => typeof path !== "string" || !assetPath.test(path)) ||
    !assets.files.has(assets.entryScript) ||
    stylesheets.some((path) => !assets.files.has(path))
  )
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  const files = new Map<string, StudioAsset>();
  let totalBytes = 0;
  for (const [path, asset] of assets.files) {
    if (
      !assetPath.test(path) ||
      !(asset.body instanceof Uint8Array) ||
      asset.body.byteLength > 2 * 1_024 * 1_024 ||
      typeof asset.contentType !== "string" ||
      asset.contentType.length < 1 ||
      asset.contentType.length > 128 ||
      /[\r\n]/u.test(asset.contentType) ||
      typeof asset.etag !== "string" ||
      !/^"[A-Za-z0-9_-]{1,86}"$/u.test(asset.etag)
    )
      throw new Error("STUDIO_CONFIGURATION_INVALID");
    totalBytes += asset.body.byteLength;
    if (totalBytes > 8 * 1_024 * 1_024) throw new Error("STUDIO_CONFIGURATION_INVALID");
    files.set(path, { ...asset, body: Uint8Array.from(asset.body) });
  }
  return { entryScript: assets.entryScript, stylesheets, files };
}

function validateConfig(input: StudioServerConfig): ValidatedConfig {
  const allowedKeys = new Set([
    "mode",
    "applicationOrigin",
    "platformOrigin",
    "dashboardOrigin",
    "mountPath",
    "registrationId",
    "projectId",
    "environmentId",
    "store",
    "encryption",
    "assets",
    "fetch",
    "now",
    "observe",
    "upstreamTimeoutMs",
    "previewUrl",
  ]);
  if (
    Object.keys(input).some((key) => !allowedKeys.has(key)) ||
    !["development", "test", "production"].includes(input.mode) ||
    (input.fetch !== undefined && typeof input.fetch !== "function") ||
    (input.now !== undefined && typeof input.now !== "function") ||
    (input.observe !== undefined && typeof input.observe !== "function") ||
    (input.upstreamTimeoutMs !== undefined &&
      (!Number.isSafeInteger(input.upstreamTimeoutMs) ||
        input.upstreamTimeoutMs < 100 ||
        input.upstreamTimeoutMs > 10_000))
  )
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  const assets = validateAssets(input.assets);
  const secureRequired = input.mode === "production";
  const applicationOrigin = exactOrigin(input.applicationOrigin, secureRequired);
  const platformOrigin = exactOrigin(input.platformOrigin, secureRequired);
  const dashboardOrigin = exactOrigin(input.dashboardOrigin, secureRequired);
  if (
    !isPortableStudioMountPath(input.mountPath) ||
    !uuid.test(input.registrationId) ||
    !uuid.test(input.projectId) ||
    !uuid.test(input.environmentId)
  ) {
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  }
  const applicationHost = new URL(applicationOrigin).hostname;
  const applicationIsLoopback =
    applicationHost === "localhost" ||
    applicationHost === "127.0.0.1" ||
    applicationHost === "[::1]";
  if (
    input.mode !== "test" &&
    (input.mode === "production" || !applicationIsLoopback) &&
    (!input.store.capabilities.shared ||
      !input.store.capabilities.durable ||
      !input.store.capabilities.atomicRefreshFence)
  )
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  const previewUrl =
    input.previewUrl === undefined ? null : exactPreviewUrl(input.previewUrl, secureRequired);
  const previewOrigin = previewUrl === null ? null : new URL(previewUrl).origin;
  if (previewOrigin !== null && previewOrigin === applicationOrigin) {
    throw new Error("STUDIO_CONFIGURATION_INVALID");
  }
  const registrationDigest = createHash("sha256")
    .update(input.registrationId, "utf8")
    .digest("hex");
  const secureCookies = applicationOrigin.startsWith("https://");
  const cookieSuffix = Buffer.from(registrationDigest, "hex").subarray(0, 16).toString("base64url");
  return {
    ...input,
    assets,
    applicationOrigin,
    platformOrigin,
    dashboardOrigin,
    issuer: `${platformOrigin}/api/auth`,
    authorizationUrl: `${platformOrigin}/api/auth/oauth2/authorize`,
    tokenUrl: `${platformOrigin}/api/auth/oauth2/token`,
    revocationUrl: `${platformOrigin}/api/auth/oauth2/revoke`,
    resource: `${platformOrigin}/api/studio/v1`,
    bootstrapUrl: `${platformOrigin}/api/studio/v1/projects/${input.projectId}/environments/${input.environmentId}/bootstrap`,
    studioContentBaseUrl: `${platformOrigin}/api/studio-content/v1/projects/${input.projectId}/environments/${input.environmentId}`,
    redirectUri: `${applicationOrigin}${input.mountPath}/auth/callback`,
    clientId: `ffd-studio-v1-${input.registrationId}`,
    registrationDigest,
    secureCookies,
    attemptCookie: `${secureCookies ? "__Secure-ffd-studio-a-" : "ffd-studio-loopback-a-"}${cookieSuffix}`,
    sessionCookie: `${secureCookies ? "__Secure-ffd-studio-s-" : "ffd-studio-loopback-s-"}${cookieSuffix}`,
    keyRing: validateStudioKeyRing(input.encryption),
    fetch: input.fetch ?? globalThis.fetch,
    now: input.now ?? Date.now,
    observe: input.observe ?? (() => undefined),
    upstreamTimeoutMs: input.upstreamTimeoutMs ?? 10_000,
    previewUrl,
    previewOrigin,
    shellCsp: shellCsp(previewOrigin),
  };
}

function randomOpaque(): string {
  return randomBytes(32).toString("base64url");
}
function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function secretEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function securityHeaders(
  contentType: string,
  cacheControl = "no-store",
  contentSecurityPolicy = csp,
): Headers {
  return new Headers({
    "Cache-Control": cacheControl,
    "Content-Security-Policy": contentSecurityPolicy,
    "Content-Type": contentType,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
}

function failureResponse(error: StudioHttpFailure, requestId: string): Response {
  const headers = securityHeaders("application/json; charset=utf-8");
  if (error.retryAfterSeconds !== undefined)
    headers.set("Retry-After", String(error.retryAfterSeconds));
  if (error.allow !== undefined) headers.set("Allow", error.allow);
  return new Response(
    `${JSON.stringify({
      ok: false,
      data: null,
      error: { code: error.code, message: error.message, requestId },
      message: error.message,
    })}\n`,
    { status: error.status, headers },
  );
}

function clearAttemptOnFailure(error: StudioHttpFailure): StudioHttpFailure {
  return new StudioHttpFailure({
    status: error.status,
    code: error.code,
    message: error.message,
    ...(error.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: error.retryAfterSeconds }),
    ...(error.allow === undefined ? {} : { allow: error.allow }),
    clearAttempt: true,
    ...(error.outcome === undefined ? {} : { outcome: error.outcome }),
  });
}

function successResponse(data: unknown): Response {
  return new Response(
    `${JSON.stringify({ ok: true, data, error: null, message: "Studio bootstrap loaded." })}\n`,
    {
      status: 200,
      headers: securityHeaders("application/json; charset=utf-8"),
    },
  );
}

function redirect(location: string, headers?: Headers): Response {
  const responseHeaders = headers ?? securityHeaders("text/plain; charset=utf-8");
  responseHeaders.set("Location", location);
  return new Response(null, { status: 303, headers: responseHeaders });
}

function parseCookies(header: string | null): ReadonlyMap<string, string> | null {
  const result = new Map<string, string>();
  if (header === null || header === "") return result;
  if (Buffer.byteLength(header, "utf8") > maximumCookieHeaderBytes) return null;
  for (const component of header.split(";")) {
    const index = component.indexOf("=");
    if (index < 1) return null;
    const name = component.slice(0, index).trim();
    const value = component.slice(index + 1).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || result.has(name)) return null;
    result.set(name, value);
  }
  return result;
}

function cookie(
  config: ValidatedConfig,
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const boundedAge = Math.max(0, Math.floor(maxAgeSeconds));
  const expires = new Date(config.now() + boundedAge * 1_000).toUTCString();
  return `${name}=${value}; Path=${config.mountPath}; Max-Age=${boundedAge}; Expires=${expires}; HttpOnly; SameSite=Lax${config.secureCookies ? "; Secure" : ""}`;
}
function clearCookie(config: ValidatedConfig, name: string): string {
  return `${name}=; Path=${config.mountPath}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${config.secureCookies ? "; Secure" : ""}`;
}

function requireSameOrigin(
  request: Request,
  config: ValidatedConfig,
): Effect.Effect<void, StudioHttpFailure> {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (
    (origin !== null && origin !== config.applicationOrigin) ||
    (site !== null && site !== "same-origin") ||
    (origin === null && site === null)
  ) {
    return Effect.fail(
      new StudioHttpFailure({
        status: 403,
        code: "STUDIO_ORIGIN_INVALID",
        message: "The request origin is not allowed.",
        outcome: "rejected",
      }),
    );
  }
  return Effect.void;
}

function enforceRateLimit(
  config: ValidatedConfig,
  key: string,
  capacity: number,
  intervalMs: number,
  message: string,
): Effect.Effect<void, StudioHttpFailure> {
  return config.store
    .evaluateRateLimit({ key, nowEpochMs: config.now(), capacity, intervalMs })
    .pipe(
      Effect.mapError(
        () =>
          new StudioHttpFailure({
            status: 503,
            code: "STUDIO_UPSTREAM_UNAVAILABLE",
            message: "Studio session storage is unavailable.",
            outcome: "store_failure",
          }),
      ),
      Effect.flatMap((result) =>
        result.allowed
          ? Effect.void
          : Effect.fail(
              new StudioHttpFailure({
                status: 429,
                code: "STUDIO_RATE_LIMITED",
                message,
                retryAfterSeconds: result.retryAfterSeconds,
                outcome: "rejected",
              }),
            ),
      ),
    );
}

function withPermit<A>(
  config: ValidatedConfig,
  key: string,
  maximum: number,
  lifetimeMs: number,
  effect: Effect.Effect<A, StudioHttpFailure>,
): Effect.Effect<A, StudioHttpFailure> {
  const owner = randomOpaque();
  const acquire = config.store
    .acquirePermit({
      key,
      owner,
      nowEpochMs: config.now(),
      expiresAtEpochMs: config.now() + lifetimeMs,
      maximum,
    })
    .pipe(
      Effect.mapError(
        () =>
          new StudioHttpFailure({
            status: 503,
            code: "STUDIO_UPSTREAM_UNAVAILABLE",
            message: "Studio session storage is unavailable.",
            outcome: "store_failure",
          }),
      ),
      Effect.flatMap((acquired) =>
        acquired
          ? Effect.succeed(owner)
          : Effect.fail(
              new StudioHttpFailure({
                status: 429,
                code: "STUDIO_RATE_LIMITED",
                message: "Too many Studio operations are in progress.",
                retryAfterSeconds: 1,
                outcome: "rejected",
              }),
            ),
      ),
    );
  return Effect.acquireUseRelease(
    acquire,
    () => effect,
    (permitOwner) =>
      config.store.releasePermit(key, permitOwner).pipe(Effect.catch(() => Effect.void)),
  );
}

function requireLoginNavigation(request: Request): Effect.Effect<void, StudioHttpFailure> {
  const destination = request.headers.get("sec-fetch-dest");
  const mode = request.headers.get("sec-fetch-mode");
  const user = request.headers.get("sec-fetch-user");
  const site = request.headers.get("sec-fetch-site");
  if (
    destination !== "document" ||
    mode !== "navigate" ||
    user !== "?1" ||
    site !== "same-origin"
  ) {
    return Effect.fail(
      new StudioHttpFailure({
        status: 403,
        code: "STUDIO_REQUEST_INVALID",
        message: "Interactive navigation is required.",
        outcome: "rejected",
      }),
    );
  }
  return Effect.void;
}

async function boundedRequestText(request: Request, maximum: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum)
      throw new Error("STUDIO_REQUEST_INVALID");
  }
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("STUDIO_REQUEST_INVALID");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function boundedText(response: Response, maximum: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum)
      throw new Error("STUDIO_UPSTREAM_RESPONSE_INVALID");
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("STUDIO_UPSTREAM_RESPONSE_INVALID");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function upstreamFetch(
  config: ValidatedConfig,
  url: string,
  init: RequestInit,
): Effect.Effect<Response, StudioHttpFailure> {
  return Effect.tryPromise({
    try: () => {
      const timeoutSignal = AbortSignal.timeout(config.upstreamTimeoutMs);
      return config.fetch(url, {
        ...init,
        redirect: "error",
        signal:
          init.signal === undefined || init.signal === null
            ? timeoutSignal
            : AbortSignal.any([init.signal, timeoutSignal]),
      });
    },
    catch: () =>
      new StudioHttpFailure({
        status: 503,
        code: "STUDIO_UPSTREAM_UNAVAILABLE",
        message: "The Studio service is temporarily unavailable.",
        outcome: "upstream_failure",
      }),
  });
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type");
  return (
    contentType !== null &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(contentType.trim())
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("STUDIO_UPSTREAM_RESPONSE_INVALID");
  }
}

function decodeTokenSet(
  value: unknown,
  nowEpochMs: number,
  grantExpiresAtEpochMs: number,
): OAuthTokenSet {
  if (!isRecord(value)) throw new Error("STUDIO_TOKEN_RESPONSE_INVALID");
  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        !["access_token", "refresh_token", "token_type", "expires_in", "scope"].includes(key),
    )
  ) {
    throw new Error("STUDIO_TOKEN_RESPONSE_INVALID");
  }
  const accessToken = value.access_token;
  const refreshToken = value.refresh_token;
  const expiresIn = value.expires_in;
  const scope = value.scope;
  const scopes = typeof scope === "string" ? scope.split(" ").filter(Boolean) : [];
  if (
    typeof accessToken !== "string" ||
    accessToken.length < 1 ||
    accessToken.length > 16_384 ||
    typeof refreshToken !== "string" ||
    refreshToken.length < 1 ||
    refreshToken.length > 16_384 ||
    value.token_type !== "Bearer" ||
    typeof expiresIn !== "number" ||
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > 300 ||
    scopes.length !== 2 ||
    scopes.join(" ") !== scope ||
    new Set(scopes).size !== 2 ||
    !exactScopes.split(" ").every((required) => scopes.includes(required)) ||
    !Number.isSafeInteger(grantExpiresAtEpochMs) ||
    grantExpiresAtEpochMs <= nowEpochMs ||
    grantExpiresAtEpochMs > nowEpochMs + absoluteGrantLifetimeMs
  ) {
    throw new Error("STUDIO_TOKEN_RESPONSE_INVALID");
  }
  return {
    accessToken,
    refreshToken,
    accessExpiresAtEpochMs: nowEpochMs + expiresIn * 1_000,
    grantExpiresAtEpochMs,
  };
}

function decodeAttempt(value: unknown): OAuthAttempt {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "state",
          "verifier",
          "createdAtEpochMs",
          "issuer",
          "resource",
          "clientId",
          "redirectUri",
          "scope",
          "registrationId",
          "projectId",
          "environmentId",
          "applicationOrigin",
          "mountPath",
          "returnTo",
        ].includes(key),
    )
  )
    throw new Error("STUDIO_ATTEMPT_INVALID");
  if (
    typeof value.state !== "string" ||
    value.state.length !== 43 ||
    typeof value.verifier !== "string" ||
    value.verifier.length < 43 ||
    value.verifier.length > 128 ||
    typeof value.createdAtEpochMs !== "number" ||
    !Number.isSafeInteger(value.createdAtEpochMs) ||
    typeof value.issuer !== "string" ||
    value.issuer.length > 2_048 ||
    typeof value.resource !== "string" ||
    value.resource.length > 2_048 ||
    typeof value.clientId !== "string" ||
    value.clientId.length > 255 ||
    typeof value.redirectUri !== "string" ||
    value.redirectUri.length > 2_048 ||
    value.scope !== exactScopes ||
    typeof value.registrationId !== "string" ||
    !uuid.test(value.registrationId) ||
    typeof value.projectId !== "string" ||
    !uuid.test(value.projectId) ||
    typeof value.environmentId !== "string" ||
    !uuid.test(value.environmentId) ||
    typeof value.applicationOrigin !== "string" ||
    value.applicationOrigin.length > 2_048 ||
    typeof value.mountPath !== "string" ||
    value.mountPath.length > 240 ||
    typeof value.returnTo !== "string" ||
    value.returnTo.length > 2_288
  )
    throw new Error("STUDIO_ATTEMPT_INVALID");
  return {
    state: value.state,
    verifier: value.verifier,
    createdAtEpochMs: value.createdAtEpochMs,
    issuer: value.issuer,
    resource: value.resource,
    clientId: value.clientId,
    redirectUri: value.redirectUri,
    scope: value.scope,
    registrationId: value.registrationId,
    projectId: value.projectId,
    environmentId: value.environmentId,
    applicationOrigin: value.applicationOrigin,
    mountPath: value.mountPath,
    returnTo: value.returnTo,
  };
}

function decodeSession(value: unknown): OAuthSession {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "accessToken",
          "refreshToken",
          "accessExpiresAtEpochMs",
          "grantExpiresAtEpochMs",
          "registrationId",
          "registrationVersion",
          "projectId",
          "environmentId",
          "userId",
        ].includes(key),
    )
  )
    throw new Error("STUDIO_SESSION_INVALID");
  if (
    typeof value.accessToken !== "string" ||
    value.accessToken.length < 1 ||
    value.accessToken.length > 16_384 ||
    typeof value.refreshToken !== "string" ||
    value.refreshToken.length < 1 ||
    value.refreshToken.length > 16_384 ||
    typeof value.accessExpiresAtEpochMs !== "number" ||
    !Number.isSafeInteger(value.accessExpiresAtEpochMs) ||
    typeof value.grantExpiresAtEpochMs !== "number" ||
    !Number.isSafeInteger(value.grantExpiresAtEpochMs) ||
    typeof value.registrationId !== "string" ||
    !uuid.test(value.registrationId) ||
    typeof value.registrationVersion !== "number" ||
    !Number.isSafeInteger(value.registrationVersion) ||
    value.registrationVersion < 1 ||
    typeof value.projectId !== "string" ||
    !uuid.test(value.projectId) ||
    typeof value.environmentId !== "string" ||
    !uuid.test(value.environmentId) ||
    typeof value.userId !== "string" ||
    value.userId.length < 1 ||
    value.userId.length > 255
  )
    throw new Error("STUDIO_SESSION_INVALID");
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    accessExpiresAtEpochMs: value.accessExpiresAtEpochMs,
    grantExpiresAtEpochMs: value.grantExpiresAtEpochMs,
    registrationId: value.registrationId,
    registrationVersion: value.registrationVersion,
    projectId: value.projectId,
    environmentId: value.environmentId,
    userId: value.userId,
  };
}

function callbackParameters(query: string): Readonly<Record<string, string>> | null {
  if (query.length < 1 || query.length > 2_048) return null;
  const search = new URLSearchParams(query);
  const result: Record<string, string> = {};
  for (const [key, value] of search) {
    if (Reflect.has(result, key) || value.length > 1_024) return null;
    result[key] = value;
  }
  const keys = Object.keys(result).sort();
  const stateValid = /^[A-Za-z0-9_-]{43}$/u.test(result.state ?? "");
  const issuerValid =
    typeof result.iss === "string" && result.iss.length >= 1 && result.iss.length <= 2_048;
  const success =
    stateValid &&
    issuerValid &&
    keys.join(",") === "code,iss,state" &&
    /^[A-Za-z0-9._~-]{1,1024}$/u.test(result.code ?? "");
  const errorKeys = keys.join(",");
  const error =
    stateValid &&
    (result.iss === undefined || issuerValid) &&
    [
      "error,state",
      "error,error_description,state",
      "error,iss,state",
      "error,error_description,iss,state",
    ].includes(errorKeys) &&
    ["access_denied", "server_error", "temporarily_unavailable"].includes(result.error ?? "");
  return success || error ? result : null;
}

function sessionFromRecord(config: ValidatedConfig, record: StudioSessionRecord): OAuthSession {
  const session = decodeSession(
    decryptStudioRecord(
      config.keyRing,
      {
        kind: "session",
        registrationDigest: config.registrationDigest,
        recordDigest: record.sessionDigest,
        expiresAtEpochMs: record.expiresAtEpochMs,
        generation: record.generation,
      },
      record.envelope,
    ),
  );
  if (
    session.registrationId !== config.registrationId ||
    session.projectId !== config.projectId ||
    session.environmentId !== config.environmentId
  )
    throw new Error("STUDIO_SESSION_INVALID");
  return session;
}

function sessionRecord(
  config: ValidatedConfig,
  sessionKey: string,
  session: OAuthSession,
  generation: number,
): StudioSessionRecord {
  const sessionDigest = digest(sessionKey);
  return {
    sessionDigest,
    registrationDigest: config.registrationDigest,
    expiresAtEpochMs: session.grantExpiresAtEpochMs,
    generation,
    refreshOwner: null,
    refreshDispatched: false,
    refreshLeaseExpiresAtEpochMs: null,
    envelope: encryptStudioRecord(
      config.keyRing,
      {
        kind: "session",
        registrationDigest: config.registrationDigest,
        recordDigest: sessionDigest,
        expiresAtEpochMs: session.grantExpiresAtEpochMs,
        generation,
      },
      session,
    ),
  };
}

function exactRecord(
  value: unknown,
  keys: ReadonlyArray<string>,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    throw new Error("STUDIO_UPSTREAM_RESPONSE_INVALID");
  }
  return value;
}

function decodePlatformBootstrap(config: ValidatedConfig, value: unknown): PlatformBootstrapResult {
  const data = exactRecord(value, [
    "formatVersion",
    "registration",
    "project",
    "environment",
    "user",
    "role",
    "effectiveActions",
    "session",
  ]);
  const registration = exactRecord(data.registration, [
    "id",
    "version",
    "applicationOrigin",
    "mountPath",
  ]);
  const project = exactRecord(data.project, ["id", "name", "workspaceId"]);
  const environment = exactRecord(data.environment, ["id", "key", "name"]);
  const user = exactRecord(data.user, ["id", "name", "email"]);
  const session = exactRecord(data.session, ["expiresAt"]);
  const actions = data.effectiveActions;
  if (
    data.formatVersion !== 1 ||
    registration.id !== config.registrationId ||
    typeof registration.version !== "number" ||
    !Number.isSafeInteger(registration.version) ||
    registration.version < 1 ||
    registration.applicationOrigin !== config.applicationOrigin ||
    registration.mountPath !== config.mountPath ||
    project.id !== config.projectId ||
    typeof project.name !== "string" ||
    project.name.length < 1 ||
    project.name.length > 100 ||
    typeof project.workspaceId !== "string" ||
    !uuid.test(project.workspaceId) ||
    environment.id !== config.environmentId ||
    environment.key !== "main" ||
    environment.name !== "main" ||
    typeof user.id !== "string" ||
    user.id.length < 1 ||
    user.id.length > 255 ||
    typeof user.name !== "string" ||
    user.name.length < 1 ||
    user.name.length > 100 ||
    typeof user.email !== "string" ||
    user.email.length < 3 ||
    user.email.length > 320 ||
    typeof data.role !== "string" ||
    ![
      "owner",
      "developer",
      "content_admin",
      "editor",
      "reviewer",
      "client_editor",
      "read_only",
    ].includes(data.role) ||
    !Array.isArray(actions) ||
    actions.length > 2 ||
    actions.some((action) => action !== "project.read" && action !== "project.update") ||
    new Set(actions).size !== actions.length ||
    typeof session.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(session.expiresAt))
  ) {
    throw new Error("STUDIO_UPSTREAM_RESPONSE_INVALID");
  }
  const browser = decodeStudioBrowserBootstrap({
    formatVersion: 1,
    registration: {
      id: registration.id,
      version: registration.version,
      applicationOrigin: registration.applicationOrigin,
      mountPath: registration.mountPath,
    },
    project: { id: project.id, name: project.name, workspaceId: project.workspaceId },
    environment: { id: environment.id, key: "main", name: "main" },
    user: { id: user.id, name: user.name, email: user.email },
    role: data.role,
    effectiveActions: actions,
    session: { expiresAt: session.expiresAt },
  });
  return { browser, registrationVersion: registration.version, userId: user.id };
}

function upstreamFailure(value: unknown, status: number): StudioHttpFailure {
  const body = isRecord(value) ? value : null;
  const error = body !== null && isRecord(body.error) ? body.error : null;
  const code = error?.code;
  if (status === 429 || code === "RATE_LIMITED") {
    return new StudioHttpFailure({
      status: 429,
      code: "STUDIO_RATE_LIMITED",
      message: "Too many Studio requests.",
      retryAfterSeconds: 1,
      outcome: "upstream_failure",
    });
  }
  if (
    status === 401 ||
    code === "UNAUTHORIZED" ||
    code === "STUDIO_GRANT_INVALID" ||
    code === "STUDIO_AUTHORITY_CHANGED"
  ) {
    return new StudioHttpFailure({
      status: 401,
      code: "STUDIO_SESSION_INVALID",
      message: "The Studio session is no longer valid.",
      outcome: "rejected",
    });
  }
  if (code === "CMS_CAPABILITY_REQUIRED") {
    return new StudioHttpFailure({
      status: 409,
      code: "STUDIO_CMS_DISABLED",
      message: "The CMS capability is not active for this project.",
      outcome: "rejected",
    });
  }
  if (code === "STUDIO_REGISTRATION_INACTIVE") {
    return new StudioHttpFailure({
      status: 409,
      code: "STUDIO_REGISTRATION_INACTIVE",
      message: "The Studio registration is not active.",
      outcome: "rejected",
    });
  }
  if (status === 403 || code === "FORBIDDEN") {
    return new StudioHttpFailure({
      status: 403,
      code: "STUDIO_FORBIDDEN",
      message: "The current project role does not allow Studio access.",
      outcome: "rejected",
    });
  }
  if (status === 404 || code === "NOT_FOUND") {
    return new StudioHttpFailure({
      status: 404,
      code: "STUDIO_PROJECT_UNAVAILABLE",
      message: "The Studio project is not available.",
      outcome: "rejected",
    });
  }
  return new StudioHttpFailure({
    status: 503,
    code: "STUDIO_UPSTREAM_UNAVAILABLE",
    message: "The Studio service is temporarily unavailable.",
    outcome: "upstream_failure",
  });
}

function bootstrapUpstream(
  config: ValidatedConfig,
  accessToken: string,
  expected?: Readonly<{
    readonly registrationVersion: number;
    readonly userId: string;
  }>,
): Effect.Effect<PlatformBootstrapResult, StudioHttpFailure> {
  return Effect.gen(function* () {
    const response = yield* upstreamFetch(config, config.bootstrapUrl, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    });
    const text = yield* Effect.tryPromise({
      try: () => boundedText(response, maximumBootstrapResponseBytes),
      catch: () =>
        new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The Studio service returned an invalid response.",
          outcome: "upstream_failure",
        }),
    });
    const body = yield* Effect.try({
      try: () => parseJson(text),
      catch: () =>
        new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The Studio service returned an invalid response.",
          outcome: "upstream_failure",
        }),
    });
    if (response.status !== 200) return yield* upstreamFailure(body, response.status);
    if (
      !isJsonResponse(response) ||
      !isRecord(body) ||
      Object.keys(body).sort().join(",") !== "data,error,message,ok" ||
      body.ok !== true ||
      body.error !== null ||
      typeof body.message !== "string" ||
      body.message.length < 1 ||
      body.message.length > 512
    ) {
      return yield* new StudioHttpFailure({
        status: 502,
        code: "STUDIO_UPSTREAM_UNAVAILABLE",
        message: "The Studio service returned an invalid response.",
        outcome: "upstream_failure",
      });
    }
    const decoded = yield* Effect.try({
      try: () => decodePlatformBootstrap(config, body.data),
      catch: () =>
        new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The Studio service returned an invalid response.",
          outcome: "upstream_failure",
        }),
    });
    if (
      expected !== undefined &&
      (decoded.registrationVersion !== expected.registrationVersion ||
        decoded.userId !== expected.userId)
    ) {
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio authority has changed.",
        outcome: "rejected",
      });
    }
    return decoded;
  });
}

function accessExpiry(
  bootstrap: PlatformBootstrapResult,
  tokenSet: OAuthTokenSet,
  nowEpochMs: number,
): number {
  const authorityExpiry = Date.parse(bootstrap.browser.session.expiresAt);
  if (
    !Number.isSafeInteger(authorityExpiry) ||
    authorityExpiry <= nowEpochMs ||
    authorityExpiry > nowEpochMs + 301_000 ||
    Math.abs(authorityExpiry - tokenSet.accessExpiresAtEpochMs) > 2_000
  )
    throw new Error("STUDIO_ACCESS_EXPIRY_INVALID");
  return Math.min(authorityExpiry, tokenSet.accessExpiresAtEpochMs);
}

function revoke(config: ValidatedConfig, token: string): Effect.Effect<void> {
  return upstreamFetch(config, config.revocationUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      token,
      token_type_hint: "refresh_token",
      client_id: config.clientId,
    }),
  }).pipe(
    Effect.asVoid,
    Effect.catch(() => Effect.void),
  );
}

function refreshSession(
  config: ValidatedConfig,
  record: StudioSessionRecord,
  sessionKey: string,
  now: number,
): Effect.Effect<
  Readonly<{ key: string; record: StudioSessionRecord; session: OAuthSession; rotated: boolean }>,
  StudioHttpFailure
> {
  const startedAt = performance.now();
  const observe = (outcome: StudioServerTelemetryEvent["outcome"], status: number) =>
    Effect.sync(() => {
      try {
        config.observe({
          operation: "refresh",
          outcome,
          status,
          durationMs: Math.max(0, performance.now() - startedAt),
          storageMode: config.store.capabilities.shared ? "shared" : "memory",
          refreshGeneration: record.generation,
          keyRotation: record.envelope.keyId !== config.keyRing.activeKeyId,
        });
      } catch {
        /* best effort */
      }
    });
  return Effect.gen(function* () {
    const owner = randomOpaque();
    const claim = yield* config.store
      .claimRefresh(
        record.sessionDigest,
        config.registrationDigest,
        record.generation,
        owner,
        now,
        now + config.upstreamTimeoutMs + 5_000,
      )
      .pipe(
        Effect.mapError(
          () =>
            new StudioHttpFailure({
              status: 503,
              code: "STUDIO_UPSTREAM_UNAVAILABLE",
              message: "Studio session storage is unavailable.",
              outcome: "store_failure",
            }),
        ),
      );
    if (claim.status === "busy") {
      return yield* withPermit(
        config,
        `refresh-waiter:${config.registrationDigest}:${record.sessionDigest}`,
        16,
        1_500,
        Effect.gen(function* () {
          for (let attempt = 0; attempt < 20; attempt += 1) {
            yield* Effect.sleep("50 millis");
            const current = yield* config.store
              .readSession(record.sessionDigest, config.registrationDigest, config.now())
              .pipe(
                Effect.mapError(
                  () =>
                    new StudioHttpFailure({
                      status: 503,
                      code: "STUDIO_UPSTREAM_UNAVAILABLE",
                      message: "Studio session storage is unavailable.",
                      outcome: "store_failure",
                    }),
                ),
              );
            if (current === null) {
              return yield* new StudioHttpFailure({
                status: 401,
                code: "STUDIO_SESSION_INVALID",
                message: "The Studio session is no longer valid.",
                outcome: "rejected",
              });
            }
            if (current.generation > record.generation) {
              return {
                key: sessionKey,
                record: current,
                session: sessionFromRecord(config, current),
                rotated: false,
              };
            }
          }
          return yield* new StudioHttpFailure({
            status: 503,
            code: "STUDIO_UPSTREAM_UNAVAILABLE",
            message: "Studio session refresh is already in progress.",
            retryAfterSeconds: 1,
            outcome: "store_failure",
          });
        }),
      );
    }
    if (claim.status === "terminal") {
      yield* config.store
        .deleteSession(record.sessionDigest, config.registrationDigest)
        .pipe(Effect.catch(() => Effect.void));
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session is no longer valid.",
        outcome: "rejected",
      });
    }
    if (claim.status === "missing")
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session is no longer valid.",
        outcome: "rejected",
      });
    const session = sessionFromRecord(config, claim.record);
    if (session.grantExpiresAtEpochMs <= now) {
      yield* config.store
        .deleteSession(record.sessionDigest, config.registrationDigest)
        .pipe(Effect.catch(() => Effect.void));
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session has expired.",
        outcome: "rejected",
      });
    }
    const marked = yield* config.store
      .markRefreshDispatched(
        record.sessionDigest,
        config.registrationDigest,
        record.generation,
        owner,
      )
      .pipe(
        Effect.mapError(
          () =>
            new StudioHttpFailure({
              status: 503,
              code: "STUDIO_UPSTREAM_UNAVAILABLE",
              message: "Studio session storage is unavailable.",
              outcome: "store_failure",
            }),
        ),
      );
    if (!marked)
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session is no longer valid.",
        outcome: "rejected",
      });
    const response = yield* upstreamFetch(config, config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
        client_id: config.clientId,
        resource: config.resource,
      }),
    }).pipe(
      Effect.catch((error) =>
        config.store.deleteSession(record.sessionDigest, config.registrationDigest).pipe(
          Effect.andThen(Effect.fail(error)),
          Effect.catch(() => Effect.fail(error)),
        ),
      ),
    );
    if (response.status !== 200) {
      yield* config.store
        .deleteSession(record.sessionDigest, config.registrationDigest)
        .pipe(Effect.catch(() => Effect.void));
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session could not be refreshed.",
        outcome: response.status >= 500 ? "upstream_failure" : "rejected",
      });
    }
    if (!isJsonResponse(response)) {
      yield* config.store
        .deleteSession(record.sessionDigest, config.registrationDigest)
        .pipe(Effect.catch(() => Effect.void));
      return yield* new StudioHttpFailure({
        status: 502,
        code: "STUDIO_UPSTREAM_UNAVAILABLE",
        message: "The token response was invalid.",
        outcome: "upstream_failure",
      });
    }
    const tokenSet = yield* Effect.tryPromise({
      try: () => boundedText(response, maximumOAuthResponseBytes),
      catch: () =>
        new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The token response was invalid.",
          outcome: "upstream_failure",
        }),
    }).pipe(
      Effect.flatMap((text) =>
        Effect.try({
          try: () => decodeTokenSet(parseJson(text), config.now(), session.grantExpiresAtEpochMs),
          catch: () =>
            new StudioHttpFailure({
              status: 502,
              code: "STUDIO_UPSTREAM_UNAVAILABLE",
              message: "The token response was invalid.",
              outcome: "upstream_failure",
            }),
        }),
      ),
      Effect.tapError(() =>
        config.store
          .deleteSession(record.sessionDigest, config.registrationDigest)
          .pipe(Effect.catch(() => Effect.void)),
      ),
    );
    const verified = yield* bootstrapUpstream(config, tokenSet.accessToken, {
      registrationVersion: session.registrationVersion,
      userId: session.userId,
    }).pipe(
      Effect.tapError(() =>
        config.store
          .deleteSession(record.sessionDigest, config.registrationDigest)
          .pipe(Effect.catch(() => Effect.void)),
      ),
    );
    const accessExpiresAtEpochMs = yield* Effect.try({
      try: () => accessExpiry(verified, tokenSet, config.now()),
      catch: () =>
        new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The Studio access expiry was invalid.",
          outcome: "upstream_failure",
        }),
    }).pipe(
      Effect.tapError(() =>
        config.store.deleteSession(record.sessionDigest, config.registrationDigest).pipe(
          Effect.catch(() => Effect.void),
          Effect.andThen(revoke(config, tokenSet.refreshToken)),
        ),
      ),
    );
    const nextSession: OAuthSession = {
      ...tokenSet,
      accessExpiresAtEpochMs,
      registrationId: config.registrationId,
      registrationVersion: verified.registrationVersion,
      projectId: config.projectId,
      environmentId: config.environmentId,
      userId: verified.userId,
    };
    // Keep the opaque browser handle stable while atomically rotating only server-side credentials.
    // This lets refresh losers observe the winner's generation without exposing a stale handle.
    const nextKey = sessionKey;
    const nextRecord = sessionRecord(config, nextKey, nextSession, record.generation + 1);
    const committed = yield* config.store
      .commitRefresh(record.sessionDigest, record.generation, owner, nextRecord)
      .pipe(
        Effect.mapError(
          () =>
            new StudioHttpFailure({
              status: 503,
              code: "STUDIO_UPSTREAM_UNAVAILABLE",
              message: "Studio session storage is unavailable.",
              outcome: "store_failure",
            }),
        ),
      );
    if (!committed) {
      yield* revoke(config, tokenSet.refreshToken);
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session is no longer valid.",
        outcome: "rejected",
      });
    }
    return { key: nextKey, record: nextRecord, session: nextSession, rotated: true };
  }).pipe(
    Effect.tap(() => observe("success", 200)),
    Effect.tapError((error) => observe(error.outcome ?? "rejected", error.status)),
  );
}

function loadContentSession(config: ValidatedConfig, request: Request) {
  return Effect.gen(function* () {
    const cookies = parseCookies(request.headers.get("cookie"));
    const sessionKey = cookies?.get(config.sessionCookie);
    if (sessionKey === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(sessionKey)) {
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_AUTH_REQUIRED",
        message: "Studio authentication is required.",
        outcome: "rejected",
      });
    }
    const now = config.now();
    const sessionDigest = digest(sessionKey);
    yield* enforceRateLimit(
      config,
      `authenticated:${config.registrationDigest}`,
      100,
      10_000,
      "Too many Studio requests.",
    );
    yield* enforceRateLimit(
      config,
      `session:${config.registrationDigest}:${sessionDigest}`,
      20,
      10_000,
      "Too many Studio requests.",
    );
    const record = yield* config.store
      .readSession(sessionDigest, config.registrationDigest, now)
      .pipe(
        Effect.mapError(
          () =>
            new StudioHttpFailure({
              status: 503,
              code: "STUDIO_UPSTREAM_UNAVAILABLE",
              message: "Studio session storage is unavailable.",
              outcome: "store_failure",
            }),
        ),
      );
    if (record === null) {
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session is no longer valid.",
        outcome: "rejected",
      });
    }
    let active = {
      key: sessionKey,
      record,
      session: yield* Effect.try({
        try: () => sessionFromRecord(config, record),
        catch: () =>
          new StudioHttpFailure({
            status: 401,
            code: "STUDIO_SESSION_INVALID",
            message: "The Studio session is invalid.",
            outcome: "rejected",
          }),
      }).pipe(
        Effect.tapError(() =>
          config.store
            .deleteSession(record.sessionDigest, config.registrationDigest)
            .pipe(Effect.catch(() => Effect.void)),
        ),
      ),
      rotated: false,
    };
    if (active.session.grantExpiresAtEpochMs <= now) {
      yield* config.store
        .deleteSession(sessionDigest, config.registrationDigest)
        .pipe(Effect.catch(() => Effect.void));
      return yield* new StudioHttpFailure({
        status: 401,
        code: "STUDIO_SESSION_INVALID",
        message: "The Studio session has expired.",
        outcome: "rejected",
      });
    }
    if (active.record.envelope.keyId !== config.keyRing.activeKeyId) {
      const rotatedEnvelope = encryptStudioRecord(
        config.keyRing,
        {
          kind: "session",
          registrationDigest: config.registrationDigest,
          recordDigest: active.record.sessionDigest,
          expiresAtEpochMs: active.record.expiresAtEpochMs,
          generation: active.record.generation,
        },
        active.session,
      );
      const reencrypted = yield* config.store
        .reencryptSession(
          active.record.sessionDigest,
          config.registrationDigest,
          active.record.generation,
          rotatedEnvelope,
        )
        .pipe(
          Effect.mapError(
            () =>
              new StudioHttpFailure({
                status: 503,
                code: "STUDIO_UPSTREAM_UNAVAILABLE",
                message: "Studio session storage is unavailable.",
                outcome: "store_failure",
              }),
          ),
        );
      if (reencrypted)
        active = { ...active, record: { ...active.record, envelope: rotatedEnvelope } };
    }
    if (active.session.accessExpiresAtEpochMs <= now + refreshWindowMs) {
      active = yield* refreshSession(config, active.record, sessionKey, now);
    }
    return active;
  });
}

function studioContentErrorStatus(code: unknown): number | null {
  switch (code) {
    case "VALIDATION_ERROR":
    case "INVALID_CURSOR":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
    case "PRESENTATION_ROLE_VISIBILITY_FORBIDDEN":
    case "PRESENTATION_SCOPE_RESTRICTED":
    case "STUDIO_REGISTRATION_INACTIVE":
    case "STUDIO_AUTHORITY_CHANGED":
    case "STUDIO_GRANT_INVALID":
      return 403;
    case "NOT_FOUND":
    case "LOCALE_UNAVAILABLE":
      return 404;
    case "STUDIO_COLLECTION_CONFIGURATION_INVALID":
    case "CMS_CAPABILITY_REQUIRED":
    case "STALE_SCHEMA":
    case "DRAFT_VERSION_CONFLICT":
    case "NAME_VERSION_CONFLICT":
    case "COMMAND_CONFLICT":
    case "STALE_CURSOR":
    case "REVISION_INCOMPATIBLE":
    case "PUBLICATION_STATE_CONFLICT":
    case "PUBLISHED_SCHEMA_REQUIRED":
      return 409;
    case "PUBLICATION_INVALID":
      return 422;
    case "REQUEST_TOO_LARGE":
    case "STUDIO_RESPONSE_TOO_LARGE":
      return 413;
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL_ERROR":
      return 500;
    case "SERVICE_UNAVAILABLE":
      return 503;
    default:
      return null;
  }
}
const forbiddenStudioContentResponseKeys = new Set([
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "secret",
  "sourcekey",
  "apikey",
  "visibletoroles",
  "editablebyroles",
  "roles",
  "roleauthority",
  "effectiveactions",
  "membershipmetadata",
  "rawactions",
]);

function safeStudioContentResponseValue(value: unknown): boolean {
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > 100_000 || current.depth > 32) return false;
    if (typeof current.value === "string" && current.value.length > 1_000_000) return false;
    if (typeof current.value !== "object" || current.value === null) continue;
    if (Array.isArray(current.value)) {
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    for (const [key, item] of Object.entries(current.value)) {
      const normalizedKey = key.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/gu, "");
      if (forbiddenStudioContentResponseKeys.has(normalizedKey)) return false;
      stack.push({ value: item, depth: current.depth + 1 });
    }
  }
  return true;
}

function boundedStudioContentString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function exactStudioContentKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): boolean {
  return Object.keys(value).toSorted().join(",") === [...keys].toSorted().join(",");
}

function validStudioContentCapabilities(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "canCreate",
      "canRename",
      "canSaveLocalized",
      "canSaveShared",
      "canPublish",
      "canPublishPresentation",
    ]) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

function validStudioContentIsoDateTime(value: unknown): boolean {
  return (
    boundedStudioContentString(value, 20, 35) &&
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  );
}

function validStudioContentEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["id", "displayName", "nameVersion", "createdAt", "updatedAt"]) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    boundedStudioContentString(value.displayName, 1, 100) &&
    Number.isSafeInteger(value.nameVersion) &&
    Number(value.nameVersion) >= 1 &&
    validStudioContentIsoDateTime(value.createdAt) &&
    validStudioContentIsoDateTime(value.updatedAt)
  );
}

function validStudioContentValidation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactStudioContentKeys(value, ["status", "issues", "capped"]) ||
    (value.status !== "valid" &&
      value.status !== "invalid" &&
      value.status !== "restricted_issues") ||
    !Array.isArray(value.issues) ||
    value.issues.length > 50 ||
    typeof value.capped !== "boolean"
  ) {
    return false;
  }
  return value.issues.every(
    (issue) =>
      isRecord(issue) &&
      exactStudioContentKeys(issue, [
        "fieldId",
        "path",
        "scope",
        "localeId",
        "locale",
        "code",
        "message",
      ]) &&
      typeof issue.fieldId === "string" &&
      uuid.test(issue.fieldId) &&
      boundedStudioContentString(issue.path, 1, 256) &&
      (issue.scope === "shared" || issue.scope === "localized") &&
      (issue.localeId === null ||
        (typeof issue.localeId === "string" && uuid.test(issue.localeId))) &&
      (issue.locale === null || boundedStudioContentString(issue.locale, 2, 35)) &&
      boundedStudioContentString(issue.code, 1, 64) &&
      typeof issue.code === "string" &&
      /^[a-z][a-z0-9_]{0,63}$/u.test(issue.code) &&
      boundedStudioContentString(issue.message, 1, 512),
  );
}

const studioFieldConfigurationKeys: Readonly<Record<string, ReadonlyArray<string>>> = {
  short_text: ["minLength", "maxLength", "pattern", "default"],
  long_text: ["minLength", "maxLength", "pattern", "default"],
  rich_text: ["styles", "decorators", "links", "lists", "minLength", "maxLength", "default"],
  number: ["mode", "minimum", "maximum", "default"],
  decimal: ["precision", "scale", "minimum", "maximum", "default"],
  money: ["currencies", "allowNegative", "default"],
  boolean: ["default"],
  date: ["minimum", "maximum", "default"],
  date_time: ["minimum", "maximum", "default"],
  enum: ["options", "default"],
  url: ["default"],
  email: ["default"],
  slug: ["minLength", "maxLength", "pattern", "default"],
  json: ["maxBytes", "maxDepth", "default"],
  object: ["default"],
  list: ["minItems", "maxItems", "uniqueItems", "default"],
  reference: ["targetCollectionId"],
  external_asset: ["default"],
};

function optionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function optionalInteger(value: unknown): boolean {
  return value === undefined || Number.isSafeInteger(value);
}

function optionalBoundedString(value: unknown, maximum: number): boolean {
  return value === undefined || boundedStudioContentString(value, 0, maximum);
}

const exactDecimal = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;
const exactDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const enumOptionValue = /^[a-z][a-z0-9_]{0,62}$/u;
const portableTextKey = /^[A-Za-z0-9_-]+$/u;

function optionalPatternString(value: unknown, pattern: RegExp, maximum: number): boolean {
  return (
    value === undefined ||
    (boundedStudioContentString(value, 1, maximum) &&
      typeof value === "string" &&
      pattern.test(value))
  );
}

function onlyStudioContentKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validPortableTextSpan(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["_key", "_type", "text", "marks"]) &&
    boundedStudioContentString(value._key, 1, 64) &&
    portableTextKey.test(value._key) &&
    value._type === "span" &&
    boundedStudioContentString(value.text, 0, 100_000) &&
    Array.isArray(value.marks) &&
    value.marks.length <= 32 &&
    value.marks.every((mark) => boundedStudioContentString(mark, 1, 64))
  );
}

function validPortableTextLink(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["_key", "_type", "href"]) &&
    boundedStudioContentString(value._key, 1, 64) &&
    portableTextKey.test(value._key) &&
    value._type === "link" &&
    boundedStudioContentString(value.href, 1, 2_048)
  );
}

function validPortableTextDocument(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactStudioContentKeys(value, ["version", "profile", "blocks"]) ||
    value.version !== 1 ||
    value.profile !== "ffd-portable-text" ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > 500
  ) {
    return false;
  }
  return value.blocks.every(
    (block) =>
      isRecord(block) &&
      onlyStudioContentKeys(block, [
        "_key",
        "_type",
        "style",
        "listItem",
        "level",
        "children",
        "markDefs",
      ]) &&
      ["_key", "_type", "style", "children", "markDefs"].every((key) => key in block) &&
      boundedStudioContentString(block._key, 1, 64) &&
      portableTextKey.test(block._key) &&
      block._type === "block" &&
      (block.style === "normal" ||
        block.style === "h2" ||
        block.style === "h3" ||
        block.style === "h4" ||
        block.style === "h5" ||
        block.style === "h6" ||
        block.style === "blockquote") &&
      (block.listItem === undefined ||
        block.listItem === "bullet" ||
        block.listItem === "number") &&
      (block.level === undefined || block.level === 1 || block.level === 2 || block.level === 3) &&
      Array.isArray(block.children) &&
      block.children.length <= 5_000 &&
      block.children.every(validPortableTextSpan) &&
      Array.isArray(block.markDefs) &&
      block.markDefs.length <= 1_000 &&
      block.markDefs.every(validPortableTextLink),
  );
}

function validExternalAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["source", "url", "kind", "title", "alt", "width", "height"]) &&
    value.source === "external" &&
    boundedStudioContentString(value.url, 1, 2_048) &&
    (value.kind === "image" ||
      value.kind === "video" ||
      value.kind === "audio" ||
      value.kind === "document" ||
      value.kind === "archive" ||
      value.kind === "other") &&
    (value.title === null || boundedStudioContentString(value.title, 0, 500)) &&
    (value.alt === null || boundedStudioContentString(value.alt, 0, 500)) &&
    (value.width === null ||
      (Number.isInteger(value.width) &&
        Number(value.width) >= 1 &&
        Number(value.width) <= 100_000)) &&
    (value.height === null ||
      (Number.isInteger(value.height) &&
        Number(value.height) >= 1 &&
        Number(value.height) <= 100_000))
  );
}

function validStudioContentFieldConfiguration(kind: unknown, value: unknown): boolean {
  if (typeof kind !== "string" || !isRecord(value)) return false;
  const allowed = studioFieldConfigurationKeys[kind];
  if (allowed === undefined || Object.keys(value).some((key) => !allowed.includes(key)))
    return false;
  switch (kind) {
    case "short_text":
    case "long_text":
    case "slug":
      return (
        optionalInteger(value.minLength) &&
        optionalInteger(value.maxLength) &&
        optionalBoundedString(value.pattern, 256) &&
        optionalBoundedString(
          value.default,
          kind === "long_text" ? 50_000 : kind === "slug" ? 200 : 500,
        )
      );
    case "rich_text":
      return (
        (value.styles === undefined ||
          (Array.isArray(value.styles) &&
            value.styles.every(
              (item) =>
                item === "normal" ||
                item === "h2" ||
                item === "h3" ||
                item === "h4" ||
                item === "h5" ||
                item === "h6" ||
                item === "blockquote",
            ))) &&
        (value.decorators === undefined ||
          (Array.isArray(value.decorators) &&
            value.decorators.every(
              (item) =>
                item === "strong" ||
                item === "em" ||
                item === "underline" ||
                item === "strike-through" ||
                item === "code",
            ))) &&
        (value.links === undefined || typeof value.links === "boolean") &&
        (value.lists === undefined ||
          (Array.isArray(value.lists) &&
            value.lists.every((item) => item === "bullet" || item === "number"))) &&
        optionalInteger(value.minLength) &&
        optionalInteger(value.maxLength) &&
        (value.default === undefined || validPortableTextDocument(value.default))
      );
    case "number":
      return (
        (value.mode === undefined || value.mode === "integer" || value.mode === "floating_point") &&
        optionalFiniteNumber(value.minimum) &&
        optionalFiniteNumber(value.maximum) &&
        optionalFiniteNumber(value.default)
      );
    case "decimal":
      return (
        (value.precision === undefined ||
          (Number.isInteger(value.precision) &&
            Number(value.precision) >= 1 &&
            Number(value.precision) <= 38)) &&
        (value.scale === undefined ||
          (Number.isInteger(value.scale) &&
            Number(value.scale) >= 0 &&
            Number(value.scale) <= 18)) &&
        optionalPatternString(value.minimum, exactDecimal, 58) &&
        optionalPatternString(value.maximum, exactDecimal, 58) &&
        optionalPatternString(value.default, exactDecimal, 58)
      );
    case "money":
      return (
        Array.isArray(value.currencies) &&
        value.currencies.length >= 1 &&
        value.currencies.length <= 50 &&
        value.currencies.every(
          (currency) => typeof currency === "string" && /^[A-Z]{3}$/u.test(currency),
        ) &&
        new Set(value.currencies).size === value.currencies.length &&
        (value.allowNegative === undefined || typeof value.allowNegative === "boolean") &&
        (value.default === undefined ||
          (isRecord(value.default) &&
            exactStudioContentKeys(value.default, ["amount", "currency"]) &&
            boundedStudioContentString(value.default.amount, 1, 58) &&
            typeof value.default.amount === "string" &&
            exactDecimal.test(value.default.amount) &&
            typeof value.default.currency === "string" &&
            /^[A-Z]{3}$/u.test(value.default.currency)))
      );
    case "boolean":
      return value.default === undefined || typeof value.default === "boolean";
    case "date":
      return (
        optionalPatternString(value.minimum, exactDate, 10) &&
        optionalPatternString(value.maximum, exactDate, 10) &&
        optionalPatternString(value.default, exactDate, 10)
      );
    case "date_time":
      return (
        optionalBoundedString(value.minimum, 35) &&
        optionalBoundedString(value.maximum, 35) &&
        optionalBoundedString(value.default, 35)
      );
    case "enum":
      return (
        Array.isArray(value.options) &&
        value.options.length >= 1 &&
        value.options.length <= 100 &&
        value.options.every(
          (option) =>
            isRecord(option) &&
            exactStudioContentKeys(option, ["id", "value", "label", "position"]) &&
            typeof option.id === "string" &&
            uuid.test(option.id) &&
            boundedStudioContentString(option.value, 1, 63) &&
            typeof option.value === "string" &&
            enumOptionValue.test(option.value) &&
            boundedStudioContentString(option.label, 1, 100) &&
            Number.isInteger(option.position) &&
            Number(option.position) >= 0 &&
            Number(option.position) <= 99,
        ) &&
        optionalPatternString(value.default, enumOptionValue, 63)
      );
    case "url":
      return optionalBoundedString(value.default, 2_048);
    case "email":
      return optionalBoundedString(value.default, 254);
    case "json":
      return optionalInteger(value.maxBytes) && optionalInteger(value.maxDepth);
    case "object":
      return true;
    case "list":
      return (
        optionalInteger(value.minItems) &&
        optionalInteger(value.maxItems) &&
        (value.uniqueItems === undefined || typeof value.uniqueItems === "boolean")
      );
    case "reference":
      return typeof value.targetCollectionId === "string" && uuid.test(value.targetCollectionId);
    case "external_asset":
      return value.default === undefined || validExternalAsset(value.default);
    default:
      return false;
  }
}

function validStudioContentFormField(value: unknown, depth = 0): boolean {
  if (
    depth > 24 ||
    !isRecord(value) ||
    !exactStudioContentKeys(value, [
      "id",
      "parentFieldId",
      "nodeRole",
      "displayLabel",
      "kind",
      "required",
      "localization",
      "position",
      "helpText",
      "placeholder",
      "configuration",
      "children",
    ]) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    !(
      value.parentFieldId === null ||
      (typeof value.parentFieldId === "string" && uuid.test(value.parentFieldId))
    ) ||
    (value.nodeRole !== "root" &&
      value.nodeRole !== "object_property" &&
      value.nodeRole !== "list_item") ||
    !(value.displayLabel === null || boundedStudioContentString(value.displayLabel, 1, 100)) ||
    typeof value.kind !== "string" ||
    !(value.kind in studioFieldConfigurationKeys) ||
    !(value.required === null || typeof value.required === "boolean") ||
    !(
      value.localization === null ||
      value.localization === "shared" ||
      value.localization === "localized" ||
      value.localization === "mixed"
    ) ||
    !Number.isInteger(value.position) ||
    Number(value.position) < 0 ||
    Number(value.position) > 99 ||
    !(value.helpText === null || boundedStudioContentString(value.helpText, 0, 500)) ||
    !(value.placeholder === null || boundedStudioContentString(value.placeholder, 0, 200)) ||
    !validStudioContentFieldConfiguration(value.kind, value.configuration) ||
    !Array.isArray(value.children) ||
    value.children.length > 100
  ) {
    return false;
  }
  return value.children.every((child) => validStudioContentFormField(child, depth + 1));
}

function validStudioContentPlacement(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["id", "fieldId", "position", "helpTextOverride"]) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    typeof value.fieldId === "string" &&
    uuid.test(value.fieldId) &&
    Number.isInteger(value.position) &&
    Number(value.position) >= 0 &&
    Number(value.position) <= 99 &&
    (value.helpTextOverride === null || boundedStudioContentString(value.helpTextOverride, 0, 500))
  );
}

function validStudioContentGroup(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "id",
      "title",
      "description",
      "position",
      "columns",
      "fields",
    ]) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    boundedStudioContentString(value.title, 1, 100) &&
    (value.description === null || boundedStudioContentString(value.description, 0, 500)) &&
    Number.isInteger(value.position) &&
    Number(value.position) >= 0 &&
    Number(value.position) <= 19 &&
    (value.columns === 1 || value.columns === 2) &&
    Array.isArray(value.fields) &&
    value.fields.length <= 100 &&
    value.fields.every(validStudioContentPlacement)
  );
}

function validStudioContentForm(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactStudioContentKeys(value, [
      "collectionId",
      "schemaRevisionId",
      "contractHash",
      "canEdit",
      "fields",
      "editableFieldIds",
      "tabs",
      "sidebarGroups",
      "currencyMinorUnits",
    ]) ||
    typeof value.collectionId !== "string" ||
    !uuid.test(value.collectionId) ||
    typeof value.schemaRevisionId !== "string" ||
    !uuid.test(value.schemaRevisionId) ||
    typeof value.contractHash !== "string" ||
    !/^[0-9a-f]{64}$/u.test(value.contractHash) ||
    typeof value.canEdit !== "boolean" ||
    !Array.isArray(value.fields) ||
    value.fields.length > 100 ||
    !value.fields.every((field) => validStudioContentFormField(field)) ||
    !Array.isArray(value.editableFieldIds) ||
    value.editableFieldIds.length > 100 ||
    value.editableFieldIds.some((id) => typeof id !== "string" || !uuid.test(id)) ||
    !Array.isArray(value.tabs) ||
    value.tabs.length > 10 ||
    !Array.isArray(value.sidebarGroups) ||
    value.sidebarGroups.length > 10 ||
    (value.tabs.length === 0 && value.sidebarGroups.length === 0) ||
    !value.sidebarGroups.every(validStudioContentGroup) ||
    !isRecord(value.currencyMinorUnits) ||
    Object.entries(value.currencyMinorUnits).some(
      ([currency, units]) =>
        !/^[A-Z]{3}$/u.test(currency) ||
        !Number.isInteger(units) ||
        Number(units) < 0 ||
        Number(units) > 3,
    )
  ) {
    return false;
  }
  return value.tabs.every(
    (tab) =>
      isRecord(tab) &&
      exactStudioContentKeys(tab, ["id", "title", "description", "position", "groups"]) &&
      typeof tab.id === "string" &&
      uuid.test(tab.id) &&
      boundedStudioContentString(tab.title, 1, 100) &&
      (tab.description === null || boundedStudioContentString(tab.description, 0, 500)) &&
      Number.isInteger(tab.position) &&
      Number(tab.position) >= 0 &&
      Number(tab.position) <= 9 &&
      Array.isArray(tab.groups) &&
      tab.groups.length >= 1 &&
      tab.groups.length <= 20 &&
      tab.groups.every(validStudioContentGroup),
  );
}

function validStudioContentPage(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["items", "hasMore", "nextCursor", "count"]) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.items.every(validStudioContentEntry) &&
    typeof value.hasMore === "boolean" &&
    (value.nextCursor === null || boundedStudioContentString(value.nextCursor, 1, 1_024)) &&
    isRecord(value.count) &&
    exactStudioContentKeys(value.count, ["value", "relation"]) &&
    Number.isInteger(value.count.value) &&
    Number(value.count.value) >= 0 &&
    Number(value.count.value) <= 1_000 &&
    (value.count.relation === "exact" ||
      (value.count.relation === "at_least" && value.count.value === 1_000))
  );
}

type StudioContentSuccessKind =
  | "context"
  | "page"
  | "resolve"
  | "new_workspace"
  | "entry_workspace"
  | "create"
  | "rename"
  | "save"
  | "revision_page"
  | "revision"
  | "revision_comparison"
  | "restore"
  | "publication_status"
  | "publication_page"
  | "publication_plan"
  | "publish"
  | "unpublish"
  | "presentation"
  | "presentation_publish";

function studioUuidOrNull(value: unknown): boolean {
  return value === null || (typeof value === "string" && uuid.test(value));
}

function studioUuid(value: unknown): boolean {
  return typeof value === "string" && uuid.test(value);
}

function studioHash(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function studioCount(value: unknown, minimum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function studioFieldIds(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(studioUuid) &&
    new Set(value).size === value.length
  );
}

function validStudioRevisionSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "id",
      "scope",
      "sequence",
      "previousRevisionId",
      "schemaRevisionId",
      "contractHash",
      "changedFieldIds",
      "restoredFromRevisionId",
      "authoredByUserId",
      "authoredByCredentialId",
      "authoredAt",
      "compatible",
    ]) &&
    studioUuid(value.id) &&
    (value.scope === "shared" || value.scope === "localized") &&
    studioCount(value.sequence, 1) &&
    studioUuidOrNull(value.previousRevisionId) &&
    studioUuid(value.schemaRevisionId) &&
    studioHash(value.contractHash) &&
    studioFieldIds(value.changedFieldIds) &&
    studioUuidOrNull(value.restoredFromRevisionId) &&
    (value.authoredByUserId === null ||
      boundedStudioContentString(value.authoredByUserId, 1, 255)) &&
    studioUuidOrNull(value.authoredByCredentialId) &&
    validStudioContentIsoDateTime(value.authoredAt) &&
    typeof value.compatible === "boolean"
  );
}

function validStudioPublicationSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "id",
      "sequence",
      "schemaRevisionId",
      "contractHash",
      "changedFieldIds",
      "publishedAt",
      "current",
    ]) &&
    studioUuid(value.id) &&
    studioCount(value.sequence, 1) &&
    studioUuid(value.schemaRevisionId) &&
    studioHash(value.contractHash) &&
    studioFieldIds(value.changedFieldIds) &&
    validStudioContentIsoDateTime(value.publishedAt) &&
    typeof value.current === "boolean"
  );
}

function validStudioPublicationStatus(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "state",
      "stateVersion",
      "currentPublication",
      "sharedChanged",
      "localizedChanged",
      "schemaChanged",
      "changedSincePublication",
    ]) &&
    (value.state === "published" ||
      value.state === "unpublished" ||
      value.state === "never_published") &&
    studioCount(value.stateVersion, 0) &&
    (value.currentPublication === null ||
      validStudioPublicationSummary(value.currentPublication)) &&
    (value.state === "published") === (value.currentPublication !== null) &&
    typeof value.sharedChanged === "boolean" &&
    typeof value.localizedChanged === "boolean" &&
    typeof value.schemaChanged === "boolean" &&
    typeof value.changedSincePublication === "boolean"
  );
}

function validStudioDeliveryReadBack(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["status", "currentPublicationId"]) &&
    (value.status === "verified" || value.status === "superseded") &&
    studioUuidOrNull(value.currentPublicationId)
  );
}

function validStudioCursorPage(
  value: Readonly<Record<string, unknown>>,
  item: (value: unknown) => boolean,
): boolean {
  return (
    exactStudioContentKeys(value, ["items", "nextCursor"]) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.items.every(item) &&
    (value.nextCursor === null ||
      (typeof value.nextCursor === "string" && /^[A-Za-z0-9_-]{1,1024}$/u.test(value.nextCursor)))
  );
}

function studioPosition(value: unknown, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}

function studioNullableText(value: unknown, maximum: number): boolean {
  return value === null || boundedStudioContentString(value, 0, maximum);
}

function validStudioPresentationGroup(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "id",
      "title",
      "description",
      "position",
      "columns",
      "fields",
    ]) &&
    studioUuid(value.id) &&
    boundedStudioContentString(value.title, 1, 100) &&
    studioNullableText(value.description, 500) &&
    studioPosition(value.position, 19) &&
    (value.columns === 1 || value.columns === 2) &&
    Array.isArray(value.fields) &&
    value.fields.length <= 100 &&
    value.fields.every(
      (placement) =>
        isRecord(placement) &&
        exactStudioContentKeys(placement, ["fieldId", "position", "helpTextOverride"]) &&
        studioUuid(placement.fieldId) &&
        studioPosition(placement.position, 99) &&
        studioNullableText(placement.helpTextOverride, 500),
    )
  );
}

function validStudioPresentationLayout(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["tabs", "sidebarGroups"]) &&
    Array.isArray(value.tabs) &&
    value.tabs.length >= 1 &&
    value.tabs.length <= 10 &&
    value.tabs.every(
      (tab) =>
        isRecord(tab) &&
        exactStudioContentKeys(tab, ["id", "title", "description", "position", "groups"]) &&
        studioUuid(tab.id) &&
        boundedStudioContentString(tab.title, 1, 100) &&
        studioNullableText(tab.description, 500) &&
        studioPosition(tab.position, 9) &&
        Array.isArray(tab.groups) &&
        tab.groups.length >= 1 &&
        tab.groups.length <= 20 &&
        tab.groups.every(validStudioPresentationGroup),
    ) &&
    Array.isArray(value.sidebarGroups) &&
    value.sidebarGroups.length <= 10 &&
    value.sidebarGroups.every(validStudioPresentationGroup)
  );
}

function validStudioPresentationField(value: unknown, document: boolean): boolean {
  const keys = ["fieldId", "displayLabel", "position", "helpText", "placeholder", "enumOptions"];
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, document ? [...keys, "parentFieldId", "kind"] : keys) &&
    studioUuid(value.fieldId) &&
    (value.displayLabel === null || boundedStudioContentString(value.displayLabel, 1, 100)) &&
    studioPosition(value.position, 99) &&
    studioNullableText(value.helpText, 500) &&
    studioNullableText(value.placeholder, 200) &&
    Array.isArray(value.enumOptions) &&
    value.enumOptions.length <= 100 &&
    value.enumOptions.every(
      (option) =>
        isRecord(option) &&
        exactStudioContentKeys(option, ["optionId", "label", "position"]) &&
        studioUuid(option.optionId) &&
        boundedStudioContentString(option.label, 1, 100) &&
        studioPosition(option.position, 99),
    ) &&
    (!document ||
      (studioUuidOrNull(value.parentFieldId) && boundedStudioContentString(value.kind, 1, 32)))
  );
}

function validStudioPresentationDocument(value: unknown, document: boolean): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["displayName", "description", "fields", "layout"]) &&
    boundedStudioContentString(value.displayName, 1, 100) &&
    studioNullableText(value.description, 500) &&
    Array.isArray(value.fields) &&
    value.fields.length >= 1 &&
    value.fields.length <= 100 &&
    value.fields.every((field) => validStudioPresentationField(field, document)) &&
    validStudioPresentationLayout(value.layout)
  );
}

function validStudioPresentation(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["collectionId", "revisionId", "sequence", "presentation"]) &&
    studioUuid(value.collectionId) &&
    studioUuid(value.revisionId) &&
    studioCount(value.sequence, 1) &&
    validStudioPresentationDocument(value.presentation, true)
  );
}

function validStudioPresentationBody(value: Readonly<Record<string, unknown>>): boolean {
  return (
    exactStudioContentKeys(value, [
      "commandId",
      "expectedRevisionId",
      "expectedSequence",
      "presentation",
    ]) &&
    studioUuid(value.commandId) &&
    studioUuid(value.expectedRevisionId) &&
    studioCount(value.expectedSequence, 1) &&
    validStudioPresentationDocument(value.presentation, false)
  );
}

function studioPresentationTarget(
  route: string,
  query: string,
  method: string,
): StudioContentTarget | null | undefined {
  const match = /^\/api\/content\/collections\/([^/]+)\/presentation(\/publish)?$/u.exec(route);
  if (match === null) return undefined;
  const collectionId = match[1] ?? "";
  if (!uuid.test(collectionId) || query !== "") return null;
  const upstreamPath = `/collections/${collectionId}/presentation`;
  if (match[2] === undefined) {
    return method === "GET"
      ? { upstreamPath, bodyAllowed: false, successKind: "presentation" }
      : null;
  }
  return method === "POST"
    ? {
        upstreamPath: `${upstreamPath}/publish`,
        bodyAllowed: true,
        successKind: "presentation_publish",
      }
    : null;
}

function validStudioHistorySuccessData(
  kind: StudioContentSuccessKind,
  value: Readonly<Record<string, unknown>>,
): boolean | null {
  switch (kind) {
    case "revision_page":
      return validStudioCursorPage(value, validStudioRevisionSummary);
    case "publication_page":
      return validStudioCursorPage(value, validStudioPublicationSummary);
    case "revision":
      return (
        exactStudioContentKeys(value, ["revision", "values"]) &&
        validStudioRevisionSummary(value.revision) &&
        validStudioContentEntryValues(value.values)
      );
    case "revision_comparison":
      return (
        exactStudioContentKeys(value, [
          "from",
          "to",
          "items",
          "restrictedChanges",
          "schemaDiffers",
        ]) &&
        validStudioRevisionSummary(value.from) &&
        validStudioRevisionSummary(value.to) &&
        Array.isArray(value.items) &&
        value.items.length <= 200 &&
        value.items.every(
          (item) =>
            isRecord(item) &&
            onlyStudioContentKeys(item, [
              "fieldId",
              "change",
              "before",
              "after",
              "inCurrentSchema",
            ]) &&
            studioUuid(item.fieldId) &&
            (item.change === "added" || item.change === "removed" || item.change === "changed") &&
            typeof item.inCurrentSchema === "boolean",
        ) &&
        typeof value.restrictedChanges === "boolean" &&
        typeof value.schemaDiffers === "boolean"
      );
    case "publication_status":
      return validStudioPublicationStatus(value);
    case "publication_plan":
      return (
        exactStudioContentKeys(value, [
          "authorityHash",
          "stateVersion",
          "currentPublicationId",
          "schemaRevisionId",
          "contractHash",
          "sharedVersion",
          "sharedRevisionId",
          "localizedVersion",
          "localizedRevisionId",
          "wouldCreatePublication",
          "validation",
          "entryIssues",
        ]) &&
        (value.authorityHash === null || studioHash(value.authorityHash)) &&
        studioCount(value.stateVersion, 0) &&
        studioUuidOrNull(value.currentPublicationId) &&
        studioUuid(value.schemaRevisionId) &&
        studioHash(value.contractHash) &&
        studioCount(value.sharedVersion, 0) &&
        studioUuidOrNull(value.sharedRevisionId) &&
        studioCount(value.localizedVersion, 0) &&
        studioUuidOrNull(value.localizedRevisionId) &&
        typeof value.wouldCreatePublication === "boolean" &&
        validStudioContentValidation(value.validation) &&
        Array.isArray(value.entryIssues) &&
        value.entryIssues.length <= 50 &&
        value.entryIssues.every(
          (issue) =>
            isRecord(issue) &&
            exactStudioContentKeys(issue, ["code", "message"]) &&
            typeof issue.code === "string" &&
            /^[a-z][a-z0-9_]{0,63}$/u.test(issue.code) &&
            boundedStudioContentString(issue.message, 1, 512),
        )
      );
    case "publish":
      return (
        exactStudioContentKeys(value, [
          "commandId",
          "resultKind",
          "stateVersion",
          "publication",
          "delivery",
        ]) &&
        studioUuid(value.commandId) &&
        (value.resultKind === "changed" || value.resultKind === "no_op") &&
        studioCount(value.stateVersion, 0) &&
        validStudioPublicationSummary(value.publication) &&
        validStudioDeliveryReadBack(value.delivery)
      );
    case "unpublish":
      return (
        exactStudioContentKeys(value, [
          "commandId",
          "resultKind",
          "stateVersion",
          "unpublishedPublicationId",
          "unpublishedAt",
          "delivery",
        ]) &&
        studioUuid(value.commandId) &&
        (value.resultKind === "changed" || value.resultKind === "no_op") &&
        studioCount(value.stateVersion, 0) &&
        studioUuidOrNull(value.unpublishedPublicationId) &&
        validStudioContentIsoDateTime(value.unpublishedAt) &&
        validStudioDeliveryReadBack(value.delivery)
      );
    default:
      return null;
  }
}

function validStudioContentEntryValues(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).every((key) => uuid.test(key));
}

function validStudioContentSuccessData(
  kind: StudioContentSuccessKind,
  value: unknown,
  requestedResolutionIds?: ReadonlyArray<string>,
): boolean {
  if (!isRecord(value)) return false;
  const history = validStudioHistorySuccessData(kind, value);
  if (history !== null) return history;
  if (kind === "presentation") return validStudioPresentation(value);
  if (kind === "presentation_publish") {
    return (
      exactStudioContentKeys(value, ["replayed", "noOp", "presentation"]) &&
      typeof value.replayed === "boolean" &&
      typeof value.noOp === "boolean" &&
      validStudioPresentation(value.presentation)
    );
  }
  if (kind === "page") return validStudioContentPage(value);
  if (kind === "resolve") {
    if (
      requestedResolutionIds === undefined ||
      !exactStudioContentKeys(value, ["items"]) ||
      !Array.isArray(value.items) ||
      value.items.length > requestedResolutionIds.length ||
      !value.items.every(
        (item) =>
          isRecord(item) &&
          exactStudioContentKeys(item, ["id", "displayName"]) &&
          typeof item.id === "string" &&
          uuid.test(item.id) &&
          boundedStudioContentString(item.displayName, 1, 100),
      ) ||
      new Set(value.items.map((item) => (isRecord(item) ? item.id : null))).size !==
        value.items.length
    ) {
      return false;
    }
    let previousIndex = -1;
    return value.items.every((item) => {
      if (!isRecord(item) || typeof item.id !== "string") return false;
      const index = requestedResolutionIds.indexOf(item.id);
      if (index <= previousIndex) return false;
      previousIndex = index;
      return true;
    });
  }
  if (kind === "rename") return validStudioContentEntry(value);
  if (kind === "context") {
    return (
      exactStudioContentKeys(value, ["locales", "collections", "configurationNotices"]) &&
      Array.isArray(value.locales) &&
      value.locales.length <= 100 &&
      value.locales.every(
        (locale) =>
          isRecord(locale) &&
          exactStudioContentKeys(locale, [
            "id",
            "tag",
            "displayName",
            "canRead",
            "canWrite",
            "canPublish",
          ]) &&
          typeof locale.id === "string" &&
          uuid.test(locale.id) &&
          boundedStudioContentString(locale.tag, 2, 35) &&
          boundedStudioContentString(locale.displayName, 1, 100) &&
          locale.canRead === true &&
          typeof locale.canWrite === "boolean" &&
          typeof locale.canPublish === "boolean",
      ) &&
      Array.isArray(value.collections) &&
      value.collections.length <= 50 &&
      value.collections.every(
        (collection) =>
          isRecord(collection) &&
          exactStudioContentKeys(collection, ["id", "displayName", "capabilities"]) &&
          typeof collection.id === "string" &&
          uuid.test(collection.id) &&
          boundedStudioContentString(collection.displayName, 1, 100) &&
          validStudioContentCapabilities(collection.capabilities),
      ) &&
      Array.isArray(value.configurationNotices) &&
      value.configurationNotices.length <= 50 &&
      value.configurationNotices.every(
        (notice) =>
          isRecord(notice) &&
          exactStudioContentKeys(notice, ["collectionId", "displayName", "reason"]) &&
          typeof notice.collectionId === "string" &&
          uuid.test(notice.collectionId) &&
          boundedStudioContentString(notice.displayName, 1, 100) &&
          (notice.reason === "empty_schema" || notice.reason === "projection_invalid"),
      )
    );
  }
  if (kind === "new_workspace" || kind === "entry_workspace") {
    const expected =
      kind === "new_workspace"
        ? ["localeId", "locale", "form", "capabilities"]
        : ["localeId", "locale", "form", "capabilities", "draft", "publication"];
    if (
      !exactStudioContentKeys(value, expected) ||
      typeof value.localeId !== "string" ||
      !uuid.test(value.localeId) ||
      !boundedStudioContentString(value.locale, 2, 35) ||
      !validStudioContentForm(value.form) ||
      !validStudioContentCapabilities(value.capabilities)
    ) {
      return false;
    }
    if (kind === "new_workspace") return true;
    const draft = value.draft;
    return (
      validStudioPublicationStatus(value.publication) &&
      isRecord(draft) &&
      exactStudioContentKeys(draft, [
        "entry",
        "schemaRevisionId",
        "contractHash",
        "sharedVersion",
        "sharedRevisionId",
        "sharedValues",
        "localizedVersion",
        "localizedRevisionId",
        "localizedValues",
        "validation",
      ]) &&
      validStudioContentEntry(draft.entry) &&
      typeof draft.schemaRevisionId === "string" &&
      uuid.test(draft.schemaRevisionId) &&
      typeof draft.contractHash === "string" &&
      /^[0-9a-f]{64}$/u.test(draft.contractHash) &&
      Number.isSafeInteger(draft.sharedVersion) &&
      Number(draft.sharedVersion) >= 0 &&
      (draft.sharedRevisionId === null ||
        (typeof draft.sharedRevisionId === "string" && uuid.test(draft.sharedRevisionId))) &&
      validStudioContentEntryValues(draft.sharedValues) &&
      Number.isSafeInteger(draft.localizedVersion) &&
      Number(draft.localizedVersion) >= 0 &&
      (draft.localizedRevisionId === null ||
        (typeof draft.localizedRevisionId === "string" && uuid.test(draft.localizedRevisionId))) &&
      validStudioContentEntryValues(draft.localizedValues) &&
      validStudioContentValidation(draft.validation)
    );
  }
  if (kind === "create") {
    return (
      exactStudioContentKeys(value, [
        "entry",
        "commandId",
        "sharedVersion",
        "sharedRevisionId",
        "localizedVersion",
        "localizedRevisionId",
        "validation",
      ]) &&
      validStudioContentEntry(value.entry) &&
      typeof value.commandId === "string" &&
      uuid.test(value.commandId) &&
      Number.isSafeInteger(value.sharedVersion) &&
      Number(value.sharedVersion) >= 0 &&
      (value.sharedRevisionId === null ||
        (typeof value.sharedRevisionId === "string" && uuid.test(value.sharedRevisionId))) &&
      Number.isSafeInteger(value.localizedVersion) &&
      Number(value.localizedVersion) >= 0 &&
      (value.localizedRevisionId === null ||
        (typeof value.localizedRevisionId === "string" && uuid.test(value.localizedRevisionId))) &&
      validStudioContentValidation(value.validation)
    );
  }
  return (
    exactStudioContentKeys(value, [
      "entryId",
      "commandId",
      "sharedChanged",
      "sharedVersion",
      "sharedRevisionId",
      "localizedChanged",
      "localizedVersion",
      "localizedRevisionId",
      "validation",
    ]) &&
    typeof value.entryId === "string" &&
    uuid.test(value.entryId) &&
    typeof value.commandId === "string" &&
    uuid.test(value.commandId) &&
    typeof value.sharedChanged === "boolean" &&
    Number.isSafeInteger(value.sharedVersion) &&
    Number(value.sharedVersion) >= 0 &&
    (value.sharedRevisionId === null ||
      (typeof value.sharedRevisionId === "string" && uuid.test(value.sharedRevisionId))) &&
    typeof value.localizedChanged === "boolean" &&
    Number.isSafeInteger(value.localizedVersion) &&
    Number(value.localizedVersion) >= 0 &&
    (value.localizedRevisionId === null ||
      (typeof value.localizedRevisionId === "string" && uuid.test(value.localizedRevisionId))) &&
    validStudioContentValidation(value.validation)
  );
}

function validStudioContentErrorDetail(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "path",
    "code",
    "message",
    "scope",
    "expectedVersion",
    "currentVersion",
    "currentRevisionId",
  ]);
  return (
    Object.keys(value).every((key) => allowed.has(key)) &&
    boundedStudioContentString(value.code, 1, 64) &&
    boundedStudioContentString(value.message, 1, 512) &&
    (value.path === undefined || boundedStudioContentString(value.path, 0, 256)) &&
    (value.scope === undefined || value.scope === "shared" || value.scope === "localized") &&
    (value.expectedVersion === undefined ||
      (Number.isSafeInteger(value.expectedVersion) && Number(value.expectedVersion) >= 0)) &&
    (value.currentVersion === undefined ||
      (Number.isSafeInteger(value.currentVersion) && Number(value.currentVersion) >= 0)) &&
    (value.currentRevisionId === undefined ||
      value.currentRevisionId === null ||
      (typeof value.currentRevisionId === "string" && uuid.test(value.currentRevisionId)))
  );
}

function validStudioContentEnvelope(
  value: unknown,
  status: number,
  successKind: StudioContentSuccessKind,
  requestedResolutionIds?: ReadonlyArray<string>,
): value is Readonly<Record<string, unknown>> {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== "data,error,message,ok" ||
    !boundedStudioContentString(value.message, 1, 512) ||
    !safeStudioContentResponseValue(value)
  ) {
    return false;
  }
  if (value.ok === true) {
    return (
      status === 200 &&
      value.error === null &&
      validStudioContentSuccessData(successKind, value.data, requestedResolutionIds)
    );
  }
  if (value.ok !== false || status < 400 || status > 599 || value.data !== null) return false;
  const error = value.error;
  if (!isRecord(error)) return false;
  const allowed = new Set([
    "code",
    "message",
    "details",
    "configurationReason",
    "retryable",
    "requestId",
  ]);
  const expectedStatus = studioContentErrorStatus(error.code);
  const configurationReasonIsCoherent =
    error.code === "STUDIO_COLLECTION_CONFIGURATION_INVALID"
      ? error.configurationReason === "empty_schema" ||
        error.configurationReason === "projection_invalid"
      : error.configurationReason === undefined;
  return (
    Object.keys(error).every((key) => allowed.has(key)) &&
    expectedStatus !== null &&
    status === expectedStatus &&
    boundedStudioContentString(error.message, 1, 512) &&
    typeof error.retryable === "boolean" &&
    boundedStudioContentString(error.requestId, 1, 128) &&
    configurationReasonIsCoherent &&
    (error.details === undefined ||
      (Array.isArray(error.details) &&
        error.details.length >= 1 &&
        error.details.length <= 20 &&
        error.details.every(validStudioContentErrorDetail)))
  );
}

interface StudioContentTarget {
  readonly upstreamPath: string;
  readonly bodyAllowed: boolean;
  readonly successKind: StudioContentSuccessKind;
}

function isStudioContentShellRoute(route: string): boolean {
  if (route === "/content") return true;
  const layout = /^\/content\/([^/]+)\/layout$/u.exec(route);
  if (layout !== null) return uuid.test(layout[1] ?? "");
  const match = /^\/content\/([^/]+)\/locales\/([^/]+)(?:\/entries\/(new|[^/]+))?$/u.exec(route);
  if (match === null || !uuid.test(match[1] ?? "")) return false;
  const locale = match[2] ?? "";
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(locale) || locale.length > 35) {
    return false;
  }
  const entry = match[3];
  return entry === undefined || entry === "new" || uuid.test(entry);
}

function studioContentTarget(
  route: string,
  query: string,
  method: string,
): StudioContentTarget | null {
  if (route === "/api/content/context" && method === "GET" && query === "") {
    return { upstreamPath: "/context", bodyAllowed: false, successKind: "context" };
  }
  const presentation = studioPresentationTarget(route, query, method);
  if (presentation !== undefined) return presentation;
  const match =
    /^\/api\/content\/collections\/([^/]+)\/locales\/([^/]+)\/entries(?:\/(.*))?$/u.exec(route);
  if (match === null || !uuid.test(match[1] ?? "")) return null;
  const collectionId = match[1] as string;
  const locale = match[2] ?? "";
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(locale) || locale.length > 35) return null;
  const suffix = match[3];
  const base = `/collections/${collectionId}/locales/${locale}/entries`;
  if (suffix === undefined && method === "GET") {
    const parameters = new URLSearchParams(query);
    const keys = [...parameters.keys()];
    if (
      keys.some((key) => key !== "cursor" && key !== "limit") ||
      new Set(keys).size !== keys.length
    ) {
      return null;
    }
    const cursor = parameters.get("cursor");
    const limit = parameters.get("limit");
    if (
      (cursor !== null && !/^[A-Za-z0-9_-]{1,1024}$/u.test(cursor)) ||
      (limit !== null && !/^(?:[1-4][0-9]|50)$/u.test(limit))
    ) {
      return null;
    }
    return {
      upstreamPath: `${base}${query === "" ? "" : `?${query}`}`,
      bodyAllowed: false,
      successKind: "page",
    };
  }
  const history = studioHistoryTarget(base, suffix ?? "", query, method);
  if (history !== undefined) return history;
  if (query !== "") return null;
  if (suffix === "search" && method === "POST") {
    return { upstreamPath: `${base}/search`, bodyAllowed: true, successKind: "page" };
  }
  if (suffix === "resolve" && method === "POST") {
    return { upstreamPath: `${base}/resolve`, bodyAllowed: true, successKind: "resolve" };
  }
  if (suffix === "new" && method === "GET") {
    return {
      upstreamPath: `${base}/new`,
      bodyAllowed: false,
      successKind: "new_workspace",
    };
  }
  if (suffix === undefined && method === "POST") {
    return { upstreamPath: base, bodyAllowed: true, successKind: "create" };
  }
  const nested = /^([0-9a-f-]+)\/(name|draft)$/iu.exec(suffix ?? "");
  if (nested !== null && uuid.test(nested[1] ?? "") && method === "PATCH") {
    return {
      upstreamPath: `${base}/${nested[1]}/${nested[2]}`,
      bodyAllowed: true,
      successKind: nested[2] === "name" ? "rename" : "save",
    };
  }
  if (suffix !== undefined && uuid.test(suffix) && method === "GET") {
    return {
      upstreamPath: `${base}/${suffix}`,
      bodyAllowed: false,
      successKind: "entry_workspace",
    };
  }
  return null;
}

function studioPageQuery(query: string, scopeRequired: boolean): boolean {
  const parameters = new URLSearchParams(query);
  const keys = [...parameters.keys()];
  const allowed = scopeRequired ? ["scope", "cursor", "limit"] : ["cursor", "limit"];
  if (keys.some((key) => !allowed.includes(key)) || new Set(keys).size !== keys.length) {
    return false;
  }
  const scope = parameters.get("scope");
  const cursor = parameters.get("cursor");
  const limit = parameters.get("limit");
  return (
    (!scopeRequired || scope === "shared" || scope === "localized") &&
    (cursor === null || /^[A-Za-z0-9_-]{1,1024}$/u.test(cursor)) &&
    (limit === null || /^(?:[1-4][0-9]|50)$/u.test(limit))
  );
}

function studioHistoryTarget(
  base: string,
  suffix: string,
  query: string,
  method: string,
): StudioContentTarget | null | undefined {
  const match =
    /^([0-9a-f-]{36})\/(revisions|publications|publication)(?:\/(validate|publish|unpublish)|\/([0-9a-f-]{36})(?:\/(restore)|\/compare\/([0-9a-f-]{36}))?)?$/iu.exec(
      suffix,
    );
  if (match === null) return undefined;
  const [, entryId = "", family, action, revisionId, restore, toRevisionId] = match;
  if (
    !uuid.test(entryId) ||
    (revisionId !== undefined && !uuid.test(revisionId)) ||
    (toRevisionId !== undefined && !uuid.test(toRevisionId))
  ) {
    return null;
  }
  const entry = `${base}/${entryId}`;
  const canonicalQuery = new URLSearchParams(query).toString();
  const read = (upstreamPath: string, successKind: StudioContentSuccessKind) =>
    method === "GET" ? { upstreamPath, bodyAllowed: false, successKind } : null;
  const command = (upstreamPath: string, successKind: StudioContentSuccessKind) =>
    method === "POST" && query === "" ? { upstreamPath, bodyAllowed: true, successKind } : null;
  if (family === "revisions" && revisionId === undefined) {
    if (action !== undefined || !studioPageQuery(query, true)) return null;
    return read(`${entry}/revisions?${canonicalQuery}`, "revision_page");
  }
  if (family === "publications") {
    if (action !== undefined || revisionId !== undefined || !studioPageQuery(query, false)) {
      return null;
    }
    return read(
      `${entry}/publications${canonicalQuery === "" ? "" : `?${canonicalQuery}`}`,
      "publication_page",
    );
  }
  if (query !== "") return null;
  if (family === "revisions" && revisionId !== undefined) {
    if (action !== undefined) return null;
    if (toRevisionId !== undefined) {
      return read(
        `${entry}/revisions/${revisionId}/compare/${toRevisionId}`,
        "revision_comparison",
      );
    }
    if (restore !== undefined)
      return command(`${entry}/revisions/${revisionId}/restore`, "restore");
    return read(`${entry}/revisions/${revisionId}`, "revision");
  }
  if (family !== "publication" || revisionId !== undefined) return null;
  if (action === undefined) return read(`${entry}/publication`, "publication_status");
  if (action === "validate") return command(`${entry}/publication/validate`, "publication_plan");
  return command(`${entry}/publication/${action}`, action === "publish" ? "publish" : "unpublish");
}

function boundedStudioMutationValue(value: unknown): boolean {
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > 10_000 || current.depth > 24) return false;
    if (typeof current.value !== "object" || current.value === null) continue;
    const nested = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (const item of nested) stack.push({ value: item, depth: current.depth + 1 });
  }
  return true;
}

function validStudioMutation(value: unknown): boolean {
  if (!isRecord(value) || typeof value.operation !== "string" || !Array.isArray(value.path)) {
    return false;
  }
  if (
    value.path.length < 1 ||
    value.path.length > 16 ||
    value.path.some(
      (segment) =>
        !(
          (typeof segment === "string" && uuid.test(segment)) ||
          (typeof segment === "number" &&
            Number.isSafeInteger(segment) &&
            segment >= 0 &&
            segment <= 100)
        ),
    )
  ) {
    return false;
  }
  if (value.operation === "set") {
    return (
      Object.keys(value).sort().join(",") === "operation,path,value" &&
      boundedStudioMutationValue(value.value)
    );
  }
  if (value.operation === "unset") {
    return Object.keys(value).sort().join(",") === "operation,path";
  }
  if (value.operation === "list_insert") {
    return (
      Object.keys(value).sort().join(",") === "index,operation,path,value" &&
      typeof value.index === "number" &&
      Number.isSafeInteger(value.index) &&
      value.index >= 0 &&
      value.index <= 100 &&
      boundedStudioMutationValue(value.value)
    );
  }
  if (value.operation === "list_remove") {
    return (
      Object.keys(value).sort().join(",") === "index,operation,path" &&
      typeof value.index === "number" &&
      Number.isSafeInteger(value.index) &&
      value.index >= 0 &&
      value.index <= 99
    );
  }
  return false;
}

function validStudioMutations(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 500 && value.every(validStudioMutation);
}

function studioContentCommandRoute(route: string): boolean {
  return /\/entries\/[^/]+\/(?:revisions\/[^/]+\/restore|publication\/(?:validate|publish|unpublish))$/u.test(
    route,
  );
}

function studioVersion(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validStudioHistoryBody(route: string, value: Readonly<Record<string, unknown>>): boolean {
  if (route.endsWith("/restore")) {
    return (
      exactStudioContentKeys(value, [
        "scope",
        "schemaRevisionId",
        "contractHash",
        "expectedVersion",
        "commandId",
      ]) &&
      (value.scope === "shared" || value.scope === "localized") &&
      studioUuid(value.schemaRevisionId) &&
      studioHash(value.contractHash) &&
      studioVersion(value.expectedVersion) &&
      studioUuid(value.commandId)
    );
  }
  if (route.endsWith("/validate")) return Object.keys(value).length === 0;
  if (route.endsWith("/unpublish")) {
    return (
      exactStudioContentKeys(value, [
        "commandId",
        "expectedStateVersion",
        "expectedPublicationId",
      ]) &&
      studioUuid(value.commandId) &&
      studioVersion(value.expectedStateVersion) &&
      studioUuidOrNull(value.expectedPublicationId)
    );
  }
  return (
    exactStudioContentKeys(value, [
      "commandId",
      "authorityHash",
      "expectedStateVersion",
      "expectedPublicationId",
      "expectedSchemaRevisionId",
      "expectedContractHash",
      "expectedSharedVersion",
      "expectedSharedRevisionId",
      "expectedLocalizedVersion",
      "expectedLocalizedRevisionId",
    ]) &&
    studioUuid(value.commandId) &&
    studioHash(value.authorityHash) &&
    studioVersion(value.expectedStateVersion) &&
    studioUuidOrNull(value.expectedPublicationId) &&
    studioUuid(value.expectedSchemaRevisionId) &&
    studioHash(value.expectedContractHash) &&
    studioVersion(value.expectedSharedVersion) &&
    studioUuidOrNull(value.expectedSharedRevisionId) &&
    studioVersion(value.expectedLocalizedVersion) &&
    studioUuidOrNull(value.expectedLocalizedRevisionId)
  );
}

function validStudioContentBody(route: string, value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (route.endsWith("/presentation/publish")) return validStudioPresentationBody(value);
  if (studioContentCommandRoute(route)) return validStudioHistoryBody(route, value);
  if (route.endsWith("/search")) {
    return (
      Object.keys(value).sort().join(",") === "cursor,limit,query" &&
      typeof value.query === "string" &&
      value.query.trim().length >= 2 &&
      value.query.trim().length <= 100 &&
      (value.cursor === null ||
        (typeof value.cursor === "string" && /^[A-Za-z0-9_-]{1,1024}$/u.test(value.cursor))) &&
      typeof value.limit === "number" &&
      Number.isSafeInteger(value.limit) &&
      value.limit >= 10 &&
      value.limit <= 50
    );
  }
  if (route.endsWith("/resolve")) {
    return (
      exactStudioContentKeys(value, ["entryIds"]) &&
      Array.isArray(value.entryIds) &&
      value.entryIds.length >= 1 &&
      value.entryIds.length <= 100 &&
      value.entryIds.every((entryId) => typeof entryId === "string" && uuid.test(entryId)) &&
      new Set(value.entryIds).size === value.entryIds.length
    );
  }
  if (route.endsWith("/name")) {
    return (
      Object.keys(value).sort().join(",") === "displayName,expectedNameVersion" &&
      typeof value.displayName === "string" &&
      value.displayName.trim().length >= 1 &&
      value.displayName.trim().length <= 100 &&
      typeof value.expectedNameVersion === "number" &&
      Number.isSafeInteger(value.expectedNameVersion) &&
      value.expectedNameVersion >= 1
    );
  }
  const isDraft = route.endsWith("/draft");
  const expectedKeys = isDraft
    ? "commandId,contractHash,expectedLocalizedVersion,expectedSharedVersion,localizedMutations,schemaRevisionId,sharedMutations"
    : "commandId,contractHash,displayName,localizedMutations,schemaRevisionId,sharedMutations";
  if (Object.keys(value).sort().join(",") !== expectedKeys) return false;
  return (
    typeof value.commandId === "string" &&
    uuid.test(value.commandId) &&
    typeof value.schemaRevisionId === "string" &&
    uuid.test(value.schemaRevisionId) &&
    typeof value.contractHash === "string" &&
    /^[0-9a-f]{64}$/u.test(value.contractHash) &&
    validStudioMutations(value.sharedMutations) &&
    validStudioMutations(value.localizedMutations) &&
    (isDraft
      ? typeof value.expectedSharedVersion === "number" &&
        Number.isSafeInteger(value.expectedSharedVersion) &&
        value.expectedSharedVersion >= 0 &&
        typeof value.expectedLocalizedVersion === "number" &&
        Number.isSafeInteger(value.expectedLocalizedVersion) &&
        value.expectedLocalizedVersion >= 0
      : typeof value.displayName === "string" &&
        value.displayName.trim().length >= 1 &&
        value.displayName.trim().length <= 100)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function previewLaunchPage(
  previewUrl: string,
  status: number,
  content: string,
  setCookie: string | null,
): Response {
  const headers = securityHeaders(
    "text/html; charset=utf-8",
    "no-store",
    `default-src 'none'; script-src 'self'; style-src 'none'; img-src 'none'; connect-src 'none'; form-action ${new URL(previewUrl).origin}; base-uri 'none'; object-src 'none'; frame-ancestors 'self'`,
  );
  headers.set("X-Frame-Options", "SAMEORIGIN");
  if (setCookie !== null) headers.append("Set-Cookie", setCookie);
  return new Response(
    `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Preview</title>${content}</html>\n`,
    { status, headers },
  );
}

const previewLaunchMessages: Readonly<Record<string, string>> = {
  PREVIEW_TARGET_REQUIRED:
    "Preview is off for this environment. Ask a developer to set a Preview URL.",
  PREVIEW_REVISION_INCOMPATIBLE:
    "This point in history uses another content model and cannot be previewed.",
  NOT_FOUND: "This entry is unavailable or you no longer have access.",
  FORBIDDEN: "You do not have access to preview this entry.",
  RATE_LIMITED: "Preview is busy. Wait a moment and reload the preview.",
};

function validPreviewHandoff(
  value: unknown,
  status: number,
  previewUrl: string,
): value is { readonly data: { readonly token: string } } {
  return (
    status === 200 &&
    isRecord(value) &&
    value.ok === true &&
    isRecord(value.data) &&
    typeof value.data.token === "string" &&
    value.data.token.length <= 2_048 &&
    /^ffd_pvh_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value.data.token) &&
    value.data.previewUrl === previewUrl
  );
}

// The launch page runs inside the Studio Preview iframe. The Studio server mints the handoff
// token and posts it straight to the developer's Preview URL, so the token never reaches Studio
// JavaScript, a URL, a Referer header, or browser history.
function previewLaunch(
  config: ValidatedConfig,
  request: Request,
  method: string,
  query: string,
  requestId: string,
): Effect.Effect<Response, StudioHttpFailure> {
  return Effect.gen(function* () {
    const previewUrl = config.previewUrl;
    if (previewUrl === null || method !== "GET") {
      return yield* new StudioHttpFailure({
        status: 404,
        code: "STUDIO_ROUTE_NOT_FOUND",
        message: "The Studio route was not found.",
        outcome: "rejected",
      });
    }
    if (
      request.headers.get("sec-fetch-site") !== "same-origin" ||
      request.headers.get("sec-fetch-dest") !== "iframe"
    ) {
      return yield* new StudioHttpFailure({
        status: 403,
        code: "STUDIO_ORIGIN_INVALID",
        message: "The request origin is not allowed.",
        outcome: "rejected",
      });
    }
    const parameters = new URLSearchParams(query);
    const keys = [...parameters.keys()];
    const collection = parameters.get("collection") ?? "";
    const locale = parameters.get("locale") ?? "";
    const entry = parameters.get("entry") ?? "";
    const revision = parameters.get("revision");
    if (
      keys.length !== new Set(keys).size ||
      keys.some((key) => !["collection", "locale", "entry", "revision"].includes(key)) ||
      !uuid.test(collection) ||
      !uuid.test(entry) ||
      locale.length > 35 ||
      !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(locale) ||
      (revision !== null && !uuid.test(revision))
    ) {
      return yield* new StudioHttpFailure({
        status: 400,
        code: "STUDIO_REQUEST_INVALID",
        message: "The Preview request is invalid.",
        outcome: "rejected",
      });
    }
    const active = yield* loadContentSession(config, request);
    const setCookie = active.rotated
      ? cookie(
          config,
          config.sessionCookie,
          active.key,
          (active.session.grantExpiresAtEpochMs - config.now()) / 1_000,
        )
      : null;
    const upstream = yield* upstreamFetch(
      config,
      `${config.studioContentBaseUrl}/collections/${collection}/locales/${locale}/entries/${entry}/preview-handoffs`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${active.session.accessToken}`,
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
        body: JSON.stringify(
          revision === null
            ? { source: "current", revisionId: null }
            : { source: "revision", revisionId: revision },
        ),
        signal: request.signal,
      },
    );
    const text = yield* Effect.tryPromise({
      try: () => boundedText(upstream, 16 * 1_024),
      catch: () =>
        new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The Studio Content service returned an invalid response.",
          outcome: "upstream_failure",
        }),
    });
    const body = yield* Effect.try({
      try: () => parseJson(text),
      catch: () =>
        new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The Studio Content service returned an invalid response.",
          outcome: "upstream_failure",
        }),
    });
    if (isJsonResponse(upstream) && validPreviewHandoff(body, upstream.status, previewUrl)) {
      return previewLaunchPage(
        previewUrl,
        200,
        `<script src="${config.mountPath}/preview/launch.js" defer></script></head><body><form id="ffd-preview-launch" method="post" action="${escapeHtml(previewUrl)}"><input type="hidden" name="token" value="${body.data.token}"><noscript><button type="submit">Open preview</button></noscript></form></body>`,
        setCookie,
      );
    }
    const code =
      isRecord(body) && isRecord(body.error) && typeof body.error.code === "string"
        ? body.error.code
        : "";
    const message =
      previewLaunchMessages[code] ??
      (body !== null && isRecord(body) && body.ok === true
        ? "The Preview URL changed. Reload Studio before previewing."
        : "Preview could not open. Try again.");
    return previewLaunchPage(
      previewUrl,
      upstream.status >= 400 ? upstream.status : 502,
      `</head><body><p role="alert">${escapeHtml(message)}</p></body>`,
      setCookie,
    );
  });
}

function routeRequest(
  config: ValidatedConfig,
  request: Request,
  rawTarget: string,
  requestId: string,
): Effect.Effect<Response, StudioHttpFailure> {
  return Effect.gen(function* () {
    let requestOrigin: string;
    try {
      requestOrigin = new URL(request.url).origin;
    } catch {
      requestOrigin = "";
    }
    if (requestOrigin !== config.applicationOrigin) {
      return yield* new StudioHttpFailure({
        status: 400,
        code: "STUDIO_REQUEST_INVALID",
        message: "The request origin is invalid.",
        outcome: "rejected",
      });
    }
    let headerBytes = 0;
    for (const [name, value] of request.headers) {
      headerBytes += Buffer.byteLength(name, "utf8") + Buffer.byteLength(value, "utf8") + 4;
      if (headerBytes > 32 * 1_024)
        return yield* new StudioHttpFailure({
          status: 431,
          code: "STUDIO_REQUEST_INVALID",
          message: "The request headers are too large.",
          outcome: "rejected",
        });
    }
    if (request.headers.has("authorization"))
      return yield* new StudioHttpFailure({
        status: 400,
        code: "STUDIO_REQUEST_INVALID",
        message: "Browser Studio routes do not accept authorization credentials.",
        outcome: "rejected",
      });
    const parsed = parseStudioRawTarget(rawTarget, config.mountPath);
    if (parsed === null)
      return yield* new StudioHttpFailure({
        status: 400,
        code: "STUDIO_REQUEST_INVALID",
        message: "The request target is invalid.",
        outcome: "rejected",
      });
    const method = request.method.toUpperCase();
    if ((method === "GET" || method === "HEAD") && parsed.route === "/" && parsed.query === "") {
      const body = renderStudioHtml(
        config.mountPath,
        config.dashboardOrigin,
        config.assets,
        config.previewUrl !== null,
      );
      const headers = securityHeaders("text/html; charset=utf-8", "no-store", config.shellCsp);
      return new Response(method === "HEAD" ? null : body, { status: 200, headers });
    }
    if (isStudioContentShellRoute(parsed.route) && parsed.query === "") {
      if (method !== "GET" && method !== "HEAD") {
        return yield* new StudioHttpFailure({
          status: 405,
          code: "STUDIO_REQUEST_INVALID",
          message: "The Studio route does not allow this method.",
          allow: "GET, HEAD",
          outcome: "rejected",
        });
      }
      const body = renderStudioHtml(
        config.mountPath,
        config.dashboardOrigin,
        config.assets,
        config.previewUrl !== null,
      );
      const headers = securityHeaders("text/html; charset=utf-8", "no-store", config.shellCsp);
      return new Response(method === "HEAD" ? null : body, { status: 200, headers });
    }
    if (
      (method === "GET" || method === "HEAD") &&
      parsed.route.startsWith("/assets/") &&
      parsed.query === ""
    ) {
      const asset = config.assets.files.get(parsed.route);
      if (request.headers.has("range"))
        return yield* new StudioHttpFailure({
          status: 400,
          code: "STUDIO_REQUEST_INVALID",
          message: "Studio assets do not accept range requests.",
          outcome: "rejected",
        });
      if (asset === undefined)
        return yield* new StudioHttpFailure({
          status: 404,
          code: "STUDIO_ROUTE_NOT_FOUND",
          message: "The Studio route was not found.",
          outcome: "rejected",
        });
      const headers = securityHeaders(asset.contentType, "public, max-age=31536000, immutable");
      headers.set("ETag", asset.etag);
      if (request.headers.get("if-none-match") === asset.etag)
        return new Response(null, { status: 304, headers });
      const body = new Uint8Array(asset.body.byteLength);
      body.set(asset.body);
      return new Response(method === "HEAD" ? null : body.buffer, { status: 200, headers });
    }
    if (parsed.route === "/preview/launch.js" && parsed.query === "") {
      if ((method !== "GET" && method !== "HEAD") || config.previewUrl === null) {
        return yield* new StudioHttpFailure({
          status: 404,
          code: "STUDIO_ROUTE_NOT_FOUND",
          message: "The Studio route was not found.",
          outcome: "rejected",
        });
      }
      const headers = securityHeaders("text/javascript; charset=utf-8");
      return new Response(method === "HEAD" ? null : previewLaunchScript, { status: 200, headers });
    }
    if (parsed.route === "/preview/launch") {
      return yield* previewLaunch(config, request, method, parsed.query, requestId);
    }
    if (parsed.route.startsWith("/api/content/")) {
      yield* requireSameOrigin(request, config);
      const target = studioContentTarget(parsed.route, parsed.query, method);
      if (target === null) {
        return yield* new StudioHttpFailure({
          status: 404,
          code: "STUDIO_ROUTE_NOT_FOUND",
          message: "The Studio route was not found.",
          outcome: "rejected",
        });
      }
      let requestBody: string | undefined;
      let requestedResolutionIds: ReadonlyArray<string> | undefined;
      if (target.bodyAllowed) {
        if (request.headers.get("content-type") !== "application/json") {
          return yield* new StudioHttpFailure({
            status: 415,
            code: "STUDIO_REQUEST_INVALID",
            message: "The Studio Content request must contain JSON.",
            outcome: "rejected",
          });
        }
        const maximumRequestBytes = parsed.route.endsWith("/search")
          ? maximumContentSearchRequestBytes
          : parsed.route.endsWith("/resolve")
            ? maximumContentResolveRequestBytes
            : studioContentCommandRoute(parsed.route)
              ? maximumContentCommandRequestBytes
              : parsed.route.endsWith("/presentation/publish")
                ? maximumContentPresentationRequestBytes
                : maximumContentRequestBytes;
        requestBody = yield* Effect.tryPromise({
          try: () => boundedRequestText(request, maximumRequestBytes),
          catch: () =>
            new StudioHttpFailure({
              status: 413,
              code: "STUDIO_REQUEST_INVALID",
              message: "The Studio Content request is too large or malformed.",
              outcome: "rejected",
            }),
        });
        const encodedBody = requestBody;
        const body = yield* Effect.try({
          try: () => parseJson(encodedBody),
          catch: () =>
            new StudioHttpFailure({
              status: 400,
              code: "STUDIO_REQUEST_INVALID",
              message: "The Studio Content request is invalid.",
              outcome: "rejected",
            }),
        });
        if (!validStudioContentBody(parsed.route, body)) {
          return yield* new StudioHttpFailure({
            status: 400,
            code: "STUDIO_REQUEST_INVALID",
            message: "The Studio Content request is invalid.",
            outcome: "rejected",
          });
        }
        if (
          parsed.route.endsWith("/resolve") &&
          isRecord(body) &&
          Array.isArray(body.entryIds) &&
          body.entryIds.every((entryId) => typeof entryId === "string")
        ) {
          requestedResolutionIds = body.entryIds.flatMap((entryId) =>
            typeof entryId === "string" ? [entryId] : [],
          );
        }
      } else if (
        request.headers.has("content-length") &&
        request.headers.get("content-length") !== "0"
      ) {
        return yield* new StudioHttpFailure({
          status: 400,
          code: "STUDIO_REQUEST_INVALID",
          message: "The Studio Content request must not contain a body.",
          outcome: "rejected",
        });
      }
      const active = yield* loadContentSession(config, request);
      const upstream = yield* upstreamFetch(
        config,
        `${config.studioContentBaseUrl}${target.upstreamPath}`,
        {
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${active.session.accessToken}`,
            "X-Request-Id": requestId,
            ...(requestBody === undefined ? {} : { "Content-Type": "application/json" }),
          },
          signal: request.signal,
          ...(requestBody === undefined ? {} : { body: requestBody }),
        },
      );
      const text = yield* Effect.tryPromise({
        try: () => boundedText(upstream, maximumContentResponseBytes),
        catch: () =>
          new StudioHttpFailure({
            status: 502,
            code: "STUDIO_UPSTREAM_UNAVAILABLE",
            message: "The Studio Content service returned an invalid response.",
            outcome: "upstream_failure",
          }),
      });
      const body = yield* Effect.try({
        try: () => parseJson(text),
        catch: () =>
          new StudioHttpFailure({
            status: 502,
            code: "STUDIO_UPSTREAM_UNAVAILABLE",
            message: "The Studio Content service returned an invalid response.",
            outcome: "upstream_failure",
          }),
      });
      if (
        !isJsonResponse(upstream) ||
        !validStudioContentEnvelope(
          body,
          upstream.status,
          target.successKind,
          requestedResolutionIds,
        )
      ) {
        return yield* new StudioHttpFailure({
          status: 502,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "The Studio Content service returned an invalid response.",
          outcome: "upstream_failure",
        });
      }
      const upstreamCode = !body.ok && isRecord(body.error) ? body.error.code : undefined;
      if (
        upstream.status === 401 ||
        upstreamCode === "STUDIO_GRANT_INVALID" ||
        upstreamCode === "STUDIO_AUTHORITY_CHANGED" ||
        upstreamCode === "STUDIO_REGISTRATION_INACTIVE"
      ) {
        yield* config.store
          .deleteSession(active.record.sessionDigest, config.registrationDigest)
          .pipe(Effect.catch(() => Effect.void));
        yield* revoke(config, active.session.refreshToken);
      }
      const headers = securityHeaders("application/json; charset=utf-8");
      const retryAfter = upstream.headers.get("retry-after");
      if (retryAfter !== null && /^\d{1,6}$/u.test(retryAfter))
        headers.set("Retry-After", retryAfter);
      if (active.rotated) {
        headers.append(
          "Set-Cookie",
          cookie(
            config,
            config.sessionCookie,
            active.key,
            (active.session.grantExpiresAtEpochMs - config.now()) / 1_000,
          ),
        );
      }
      return new Response(text, { status: upstream.status, headers });
    }
    if (method === "GET" && parsed.route === "/auth/login" && parsed.query === "") {
      yield* requireLoginNavigation(request);
      yield* enforceRateLimit(
        config,
        `login:${config.registrationDigest}`,
        10,
        20_000,
        "Too many sign-in attempts.",
      );
      const attemptKey = randomOpaque();
      const attemptDigest = digest(attemptKey);
      const state = randomOpaque();
      const verifier = randomBytes(64).toString("base64url");
      const now = config.now();
      const attempt: OAuthAttempt = {
        state,
        verifier,
        createdAtEpochMs: now,
        issuer: config.issuer,
        resource: config.resource,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
        scope: exactScopes,
        registrationId: config.registrationId,
        projectId: config.projectId,
        environmentId: config.environmentId,
        applicationOrigin: config.applicationOrigin,
        mountPath: config.mountPath,
        returnTo: `${config.applicationOrigin}${config.mountPath}`,
      };
      const admission = yield* config.store
        .createAttempt({
          record: {
            attemptDigest,
            registrationDigest: config.registrationDigest,
            expiresAtEpochMs: now + attemptLifetimeMs,
            envelope: encryptStudioRecord(
              config.keyRing,
              {
                kind: "attempt",
                registrationDigest: config.registrationDigest,
                recordDigest: attemptDigest,
                expiresAtEpochMs: now + attemptLifetimeMs,
                generation: 0,
              },
              attempt,
            ),
          },
          nowEpochMs: now,
          maximumAttemptsPerRegistration: 20,
        })
        .pipe(
          Effect.mapError(
            () =>
              new StudioHttpFailure({
                status: 503,
                code: "STUDIO_UPSTREAM_UNAVAILABLE",
                message: "Studio session storage is unavailable.",
                outcome: "store_failure",
              }),
          ),
        );
      if (admission !== "created")
        return yield* new StudioHttpFailure({
          status: 503,
          code: "STUDIO_UPSTREAM_UNAVAILABLE",
          message: "Studio sign-in capacity is unavailable.",
          outcome: "store_failure",
        });
      const authorize = new URL(config.authorizationUrl);
      authorize.searchParams.set("response_type", "code");
      authorize.searchParams.set("client_id", config.clientId);
      authorize.searchParams.set("redirect_uri", config.redirectUri);
      authorize.searchParams.set("scope", exactScopes);
      authorize.searchParams.set("resource", config.resource);
      authorize.searchParams.set("state", state);
      authorize.searchParams.set(
        "code_challenge",
        createHash("sha256").update(verifier, "ascii").digest("base64url"),
      );
      authorize.searchParams.set("code_challenge_method", "S256");
      authorize.searchParams.set("prompt", "consent");
      const headers = securityHeaders("text/plain; charset=utf-8");
      headers.append(
        "Set-Cookie",
        cookie(config, config.attemptCookie, attemptKey, attemptLifetimeMs / 1_000),
      );
      return redirect(authorize.toString(), headers);
    }
    if (method === "GET" && parsed.route === "/auth/callback") {
      yield* enforceRateLimit(
        config,
        `callback:${config.registrationDigest}`,
        10,
        10_000,
        "Too many authorization callbacks.",
      );
      return yield* withPermit(
        config,
        `callback:${config.registrationDigest}`,
        10,
        config.upstreamTimeoutMs * 2 + 5_000,
        Effect.gen(function* () {
          const parameters = callbackParameters(parsed.query);
          const cookies = parseCookies(request.headers.get("cookie"));
          const attemptKey = cookies?.get(config.attemptCookie);
          if (
            parameters === null ||
            attemptKey === undefined ||
            !/^[A-Za-z0-9_-]{43}$/u.test(attemptKey) ||
            (parameters.iss !== undefined && parameters.iss !== config.issuer)
          )
            return yield* new StudioHttpFailure({
              status: 400,
              code: "STUDIO_REQUEST_INVALID",
              message: "The OAuth callback is invalid.",
              outcome: "rejected",
            });
          const attemptDigest = digest(attemptKey);
          // Read first so an attacker presenting the wrong state cannot consume the legitimate attempt.
          const inspected = yield* config.store
            .readAttempt(attemptDigest, config.registrationDigest, config.now())
            .pipe(
              Effect.mapError(
                () =>
                  new StudioHttpFailure({
                    status: 503,
                    code: "STUDIO_UPSTREAM_UNAVAILABLE",
                    message: "Studio session storage is unavailable.",
                    outcome: "store_failure",
                  }),
              ),
            );
          if (inspected === null)
            return yield* new StudioHttpFailure({
              status: 400,
              code: "STUDIO_REQUEST_INVALID",
              message: "The OAuth attempt is no longer valid.",
              clearAttempt: true,
              outcome: "rejected",
            });
          const inspectedAttempt = yield* Effect.try({
            try: () =>
              decodeAttempt(
                decryptStudioRecord(
                  config.keyRing,
                  {
                    kind: "attempt",
                    registrationDigest: config.registrationDigest,
                    recordDigest: attemptDigest,
                    expiresAtEpochMs: inspected.expiresAtEpochMs,
                    generation: 0,
                  },
                  inspected.envelope,
                ),
              ),
            catch: () =>
              new StudioHttpFailure({
                status: 400,
                code: "STUDIO_REQUEST_INVALID",
                message: "The OAuth attempt is invalid.",
                clearAttempt: true,
                outcome: "rejected",
              }),
          });
          if (
            inspectedAttempt.issuer !== config.issuer ||
            inspectedAttempt.resource !== config.resource ||
            inspectedAttempt.clientId !== config.clientId ||
            inspectedAttempt.redirectUri !== config.redirectUri ||
            inspectedAttempt.scope !== exactScopes ||
            inspectedAttempt.registrationId !== config.registrationId ||
            inspectedAttempt.projectId !== config.projectId ||
            inspectedAttempt.environmentId !== config.environmentId ||
            inspectedAttempt.applicationOrigin !== config.applicationOrigin ||
            inspectedAttempt.mountPath !== config.mountPath ||
            inspectedAttempt.returnTo !== `${config.applicationOrigin}${config.mountPath}` ||
            !secretEqual(parameters.state ?? "", inspectedAttempt.state)
          )
            return yield* new StudioHttpFailure({
              status: 400,
              code: "STUDIO_REQUEST_INVALID",
              message: "The OAuth state is invalid.",
              outcome: "rejected",
            });
          const stored = yield* config.store
            .consumeAttempt(attemptDigest, config.registrationDigest, config.now())
            .pipe(
              Effect.mapError(
                () =>
                  new StudioHttpFailure({
                    status: 503,
                    code: "STUDIO_UPSTREAM_UNAVAILABLE",
                    message: "Studio session storage is unavailable.",
                    outcome: "store_failure",
                  }),
              ),
            );
          if (stored === null)
            return yield* new StudioHttpFailure({
              status: 400,
              code: "STUDIO_REQUEST_INVALID",
              message: "The OAuth attempt is no longer valid.",
              clearAttempt: true,
              outcome: "rejected",
            });
          const attempt = inspectedAttempt;
          if (parameters.error !== undefined)
            return yield* new StudioHttpFailure({
              status: 401,
              code: "STUDIO_AUTH_REQUIRED",
              message: "Studio authorization was not completed.",
              clearAttempt: true,
              outcome: "rejected",
            });
          const tokenResponse = yield* upstreamFetch(config, config.tokenUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code: parameters.code ?? "",
              redirect_uri: config.redirectUri,
              client_id: config.clientId,
              code_verifier: attempt.verifier,
              resource: config.resource,
            }),
          }).pipe(Effect.mapError(clearAttemptOnFailure));
          if (tokenResponse.status !== 200 || !isJsonResponse(tokenResponse))
            return yield* new StudioHttpFailure({
              status: 502,
              code: "STUDIO_UPSTREAM_UNAVAILABLE",
              message: "Studio authorization could not be established.",
              clearAttempt: true,
              outcome: "upstream_failure",
            });
          const tokenSet = yield* Effect.tryPromise({
            try: () => boundedText(tokenResponse, maximumOAuthResponseBytes),
            catch: () =>
              new StudioHttpFailure({
                status: 502,
                code: "STUDIO_UPSTREAM_UNAVAILABLE",
                message: "The token response was invalid.",
                outcome: "upstream_failure",
              }),
          }).pipe(
            Effect.flatMap((text) =>
              Effect.try({
                try: () =>
                  decodeTokenSet(
                    parseJson(text),
                    config.now(),
                    attempt.createdAtEpochMs + absoluteGrantLifetimeMs,
                  ),
                catch: () =>
                  new StudioHttpFailure({
                    status: 502,
                    code: "STUDIO_UPSTREAM_UNAVAILABLE",
                    message: "The token response was invalid.",
                    outcome: "upstream_failure",
                  }),
              }),
            ),
            Effect.mapError(clearAttemptOnFailure),
          );
          const verified = yield* bootstrapUpstream(config, tokenSet.accessToken).pipe(
            Effect.tapError(() => revoke(config, tokenSet.refreshToken)),
            Effect.mapError(clearAttemptOnFailure),
          );
          const accessExpiresAtEpochMs = yield* Effect.try({
            try: () => accessExpiry(verified, tokenSet, config.now()),
            catch: () =>
              new StudioHttpFailure({
                status: 502,
                code: "STUDIO_UPSTREAM_UNAVAILABLE",
                message: "The Studio access expiry was invalid.",
                outcome: "upstream_failure",
              }),
          }).pipe(
            Effect.tapError(() => revoke(config, tokenSet.refreshToken)),
            Effect.mapError(clearAttemptOnFailure),
          );
          const session: OAuthSession = {
            ...tokenSet,
            accessExpiresAtEpochMs,
            grantExpiresAtEpochMs: attempt.createdAtEpochMs + absoluteGrantLifetimeMs,
            registrationId: config.registrationId,
            registrationVersion: verified.registrationVersion,
            projectId: config.projectId,
            environmentId: config.environmentId,
            userId: verified.userId,
          };
          const sessionKey = randomOpaque();
          const record = sessionRecord(config, sessionKey, session, 1);
          const existingSessionKey = cookies?.get(config.sessionCookie);
          const previousSessionDigest =
            existingSessionKey !== undefined && /^[A-Za-z0-9_-]{43}$/u.test(existingSessionKey)
              ? digest(existingSessionKey)
              : undefined;
          const previousRecord =
            previousSessionDigest === undefined
              ? null
              : yield* config.store
                  .readSession(previousSessionDigest, config.registrationDigest, config.now())
                  .pipe(
                    Effect.mapError(
                      () =>
                        new StudioHttpFailure({
                          status: 503,
                          code: "STUDIO_UPSTREAM_UNAVAILABLE",
                          message: "Studio session storage is unavailable.",
                          outcome: "store_failure",
                        }),
                    ),
                    Effect.tapError(() => revoke(config, tokenSet.refreshToken)),
                    Effect.mapError(clearAttemptOnFailure),
                  );
          const previousSession = yield* Effect.sync(() => {
            if (previousRecord === null) return null;
            try {
              return sessionFromRecord(config, previousRecord);
            } catch {
              return null;
            }
          });
          const admission = yield* config.store
            .createSession({
              record,
              nowEpochMs: config.now(),
              maximumSessionsPerRegistration: 1_024,
              ...(previousSessionDigest === undefined ? {} : { previousSessionDigest }),
            })
            .pipe(
              Effect.mapError(
                () =>
                  new StudioHttpFailure({
                    status: 503,
                    code: "STUDIO_UPSTREAM_UNAVAILABLE",
                    message: "Studio session storage is unavailable.",
                    outcome: "store_failure",
                  }),
              ),
              Effect.tapError(() => revoke(config, tokenSet.refreshToken)),
              Effect.mapError(clearAttemptOnFailure),
            );
          if (admission !== "created") {
            yield* revoke(config, tokenSet.refreshToken);
            return yield* new StudioHttpFailure({
              status: 503,
              code: "STUDIO_UPSTREAM_UNAVAILABLE",
              message: "Studio session capacity is unavailable.",
              clearAttempt: true,
              outcome: "store_failure",
            });
          }
          if (previousSession !== null) yield* revoke(config, previousSession.refreshToken);
          const headers = securityHeaders("text/plain; charset=utf-8");
          headers.append("Set-Cookie", clearCookie(config, config.attemptCookie));
          headers.append(
            "Set-Cookie",
            cookie(
              config,
              config.sessionCookie,
              sessionKey,
              (session.grantExpiresAtEpochMs - config.now()) / 1_000,
            ),
          );
          return redirect(`${config.applicationOrigin}${config.mountPath}`, headers);
        }),
      );
    }
    if (method === "GET" && parsed.route === "/api/bootstrap" && parsed.query === "") {
      yield* requireSameOrigin(request, config);
      const cookies = parseCookies(request.headers.get("cookie"));
      const sessionKey = cookies?.get(config.sessionCookie);
      if (sessionKey === undefined || !/^[A-Za-z0-9_-]{43}$/u.test(sessionKey))
        return yield* new StudioHttpFailure({
          status: 401,
          code: "STUDIO_AUTH_REQUIRED",
          message: "Studio authentication is required.",
          outcome: "rejected",
        });
      const now = config.now();
      const sessionDigest = digest(sessionKey);
      yield* enforceRateLimit(
        config,
        `authenticated:${config.registrationDigest}`,
        100,
        10_000,
        "Too many Studio requests.",
      );
      yield* enforceRateLimit(
        config,
        `session:${config.registrationDigest}:${sessionDigest}`,
        20,
        10_000,
        "Too many Studio requests.",
      );
      const record = yield* config.store
        .readSession(sessionDigest, config.registrationDigest, now)
        .pipe(
          Effect.mapError(
            () =>
              new StudioHttpFailure({
                status: 503,
                code: "STUDIO_UPSTREAM_UNAVAILABLE",
                message: "Studio session storage is unavailable.",
                outcome: "store_failure",
              }),
          ),
        );
      if (record === null)
        return yield* new StudioHttpFailure({
          status: 401,
          code: "STUDIO_SESSION_INVALID",
          message: "The Studio session is no longer valid.",
          outcome: "rejected",
        });
      let active = {
        key: sessionKey,
        record,
        session: yield* Effect.try({
          try: () => sessionFromRecord(config, record),
          catch: () =>
            new StudioHttpFailure({
              status: 401,
              code: "STUDIO_SESSION_INVALID",
              message: "The Studio session is invalid.",
              outcome: "rejected",
            }),
        }).pipe(
          Effect.tapError(() =>
            config.store
              .deleteSession(record.sessionDigest, config.registrationDigest)
              .pipe(Effect.catch(() => Effect.void)),
          ),
        ),
        rotated: false,
      };
      if (active.session.grantExpiresAtEpochMs <= now) {
        yield* config.store
          .deleteSession(sessionDigest, config.registrationDigest)
          .pipe(Effect.catch(() => Effect.void));
        return yield* new StudioHttpFailure({
          status: 401,
          code: "STUDIO_SESSION_INVALID",
          message: "The Studio session has expired.",
          outcome: "rejected",
        });
      }
      if (active.record.envelope.keyId !== config.keyRing.activeKeyId) {
        const rotatedEnvelope = encryptStudioRecord(
          config.keyRing,
          {
            kind: "session",
            registrationDigest: config.registrationDigest,
            recordDigest: active.record.sessionDigest,
            expiresAtEpochMs: active.record.expiresAtEpochMs,
            generation: active.record.generation,
          },
          active.session,
        );
        const reencrypted = yield* config.store
          .reencryptSession(
            active.record.sessionDigest,
            config.registrationDigest,
            active.record.generation,
            rotatedEnvelope,
          )
          .pipe(
            Effect.mapError(
              () =>
                new StudioHttpFailure({
                  status: 503,
                  code: "STUDIO_UPSTREAM_UNAVAILABLE",
                  message: "Studio session storage is unavailable.",
                  outcome: "store_failure",
                }),
            ),
          );
        if (reencrypted)
          active = { ...active, record: { ...active.record, envelope: rotatedEnvelope } };
      }
      if (active.session.accessExpiresAtEpochMs <= now + refreshWindowMs)
        active = yield* refreshSession(config, active.record, sessionKey, now);
      const data = yield* bootstrapUpstream(config, active.session.accessToken, {
        registrationVersion: active.session.registrationVersion,
        userId: active.session.userId,
      }).pipe(
        Effect.tapError((error) =>
          [401, 403, 404, 409].includes(error.status)
            ? config.store
                .deleteSession(active.record.sessionDigest, config.registrationDigest)
                .pipe(
                  Effect.catch(() => Effect.void),
                  Effect.andThen(revoke(config, active.session.refreshToken)),
                )
            : Effect.void,
        ),
      );
      const response = successResponse(data.browser);
      if (active.rotated)
        response.headers.append(
          "Set-Cookie",
          cookie(
            config,
            config.sessionCookie,
            active.key,
            (active.session.grantExpiresAtEpochMs - config.now()) / 1_000,
          ),
        );
      return response;
    }
    if (method === "POST" && parsed.route === "/auth/logout" && parsed.query === "") {
      yield* requireSameOrigin(request, config);
      if (request.headers.get("content-type") !== "application/json")
        return yield* new StudioHttpFailure({
          status: 415,
          code: "STUDIO_REQUEST_INVALID",
          message: "The logout request must contain JSON.",
          outcome: "rejected",
        });
      const logoutBody = yield* Effect.tryPromise({
        try: () => boundedRequestText(request, 1_024),
        catch: () =>
          new StudioHttpFailure({
            status: 413,
            code: "STUDIO_REQUEST_INVALID",
            message: "The logout request is too large or malformed.",
            outcome: "rejected",
          }),
      });
      const validLogoutBody = yield* Effect.sync(() => {
        try {
          const value: unknown = JSON.parse(logoutBody);
          return isRecord(value) && Object.keys(value).length === 0;
        } catch {
          return false;
        }
      });
      if (!validLogoutBody)
        return yield* new StudioHttpFailure({
          status: 400,
          code: "STUDIO_REQUEST_INVALID",
          message: "The logout request body must be an empty object.",
          outcome: "rejected",
        });
      const cookies = parseCookies(request.headers.get("cookie"));
      if (cookies === null)
        return yield* new StudioHttpFailure({
          status: 400,
          code: "STUDIO_REQUEST_INVALID",
          message: "The Studio cookies are invalid.",
          outcome: "rejected",
        });
      const sessionKey = cookies.get(config.sessionCookie);
      if (sessionKey !== undefined && /^[A-Za-z0-9_-]{43}$/u.test(sessionKey)) {
        const sessionDigest = digest(sessionKey);
        yield* enforceRateLimit(
          config,
          `authenticated:${config.registrationDigest}`,
          100,
          10_000,
          "Too many Studio requests.",
        );
        yield* enforceRateLimit(
          config,
          `session:${config.registrationDigest}:${sessionDigest}`,
          20,
          10_000,
          "Too many Studio requests.",
        );
        const record = yield* config.store
          .readSession(sessionDigest, config.registrationDigest, config.now())
          .pipe(
            Effect.mapError(
              () =>
                new StudioHttpFailure({
                  status: 503,
                  code: "STUDIO_UPSTREAM_UNAVAILABLE",
                  message: "Studio session storage is unavailable.",
                  outcome: "store_failure",
                }),
            ),
          );
        if (record !== null) {
          const session = yield* Effect.sync(() => {
            try {
              return sessionFromRecord(config, record);
            } catch {
              return null;
            }
          });
          yield* config.store.deleteSession(record.sessionDigest, config.registrationDigest).pipe(
            Effect.mapError(
              () =>
                new StudioHttpFailure({
                  status: 503,
                  code: "STUDIO_UPSTREAM_UNAVAILABLE",
                  message: "Studio session storage is unavailable.",
                  outcome: "store_failure",
                }),
            ),
          );
          if (session !== null) yield* revoke(config, session.refreshToken);
        }
      }
      const headers = securityHeaders("text/plain; charset=utf-8");
      headers.append("Set-Cookie", clearCookie(config, config.sessionCookie));
      headers.append("Set-Cookie", clearCookie(config, config.attemptCookie));
      return redirect(`${config.applicationOrigin}${config.mountPath}`, headers);
    }
    const allowedMethod =
      parsed.route === "/" && parsed.query === ""
        ? "GET, HEAD"
        : parsed.route === "/auth/login" && parsed.query === ""
          ? "GET"
          : parsed.route === "/auth/callback"
            ? "GET"
            : parsed.route === "/auth/logout" && parsed.query === ""
              ? "POST"
              : parsed.route === "/api/bootstrap" && parsed.query === ""
                ? "GET"
                : parsed.query === "" && config.assets.files.has(parsed.route)
                  ? "GET, HEAD"
                  : null;
    if (allowedMethod !== null)
      return yield* new StudioHttpFailure({
        status: 405,
        code: "STUDIO_REQUEST_INVALID",
        message: "The request method is not allowed.",
        allow: allowedMethod,
        outcome: "rejected",
      });
    return yield* new StudioHttpFailure({
      status: 404,
      code: "STUDIO_ROUTE_NOT_FOUND",
      message: "The Studio route was not found.",
      outcome: "rejected",
    });
  });
}

export function createStudioFetchHandler(input: StudioServerConfig): StudioFetchHandler {
  const config = validateConfig(input);
  const runtime = ManagedRuntime.make(Layer.empty);
  let disposed = false;
  return {
    mountPath: config.mountPath,
    applicationOrigin: config.applicationOrigin,
    fetch: async (request, context) => {
      if (disposed)
        return failureResponse(
          new StudioHttpFailure({
            status: 503,
            code: "STUDIO_CONFIGURATION_INVALID",
            message: "Studio is shutting down.",
            outcome: "store_failure",
          }),
          randomOpaque(),
        );
      const requestId = randomOpaque();
      const started = performance.now();
      const parsed = parseStudioRawTarget(context.rawTarget, config.mountPath);
      const operation: StudioServerTelemetryEvent["operation"] = parsed?.route.startsWith(
        "/assets/",
      )
        ? "asset"
        : parsed?.route === "/auth/login"
          ? "login"
          : parsed?.route === "/auth/callback"
            ? "callback"
            : parsed?.route === "/auth/logout"
              ? "logout"
              : parsed?.route.startsWith("/api/content/")
                ? "content"
                : "bootstrap";
      const exit = await runtime.runPromiseExit(
        routeRequest(config, request, context.rawTarget, requestId),
      );
      let response: Response;
      let outcome: StudioServerTelemetryEvent["outcome"] = "success";
      if (exit._tag === "Success") response = exit.value;
      else {
        const [reason] = exit.cause.reasons;
        const failure =
          exit.cause.reasons.length === 1 &&
          reason !== undefined &&
          Cause.isFailReason(reason) &&
          reason.error._tag === "StudioHttpFailure"
            ? reason.error
            : new StudioHttpFailure({
                status: 500,
                code: "STUDIO_UPSTREAM_UNAVAILABLE",
                message: "Studio could not complete the request.",
                outcome: "store_failure",
              });
        response = failureResponse(failure, requestId);
        if (parsed?.route === "/auth/callback" && failure.clearAttempt === true)
          response.headers.append("Set-Cookie", clearCookie(config, config.attemptCookie));
        if (
          (parsed?.route === "/api/bootstrap" || parsed?.route.startsWith("/api/content/")) &&
          (failure.code === "STUDIO_AUTH_REQUIRED" ||
            failure.code === "STUDIO_SESSION_INVALID" ||
            failure.code === "STUDIO_FORBIDDEN" ||
            failure.code === "STUDIO_PROJECT_UNAVAILABLE" ||
            failure.code === "STUDIO_CMS_DISABLED" ||
            failure.code === "STUDIO_REGISTRATION_INACTIVE")
        )
          response.headers.append("Set-Cookie", clearCookie(config, config.sessionCookie));
        outcome = failure.outcome ?? "rejected";
      }
      try {
        config.observe({
          operation,
          outcome,
          status: response.status,
          durationMs: Math.max(0, performance.now() - started),
          storageMode: config.store.capabilities.shared ? "shared" : "memory",
        });
      } catch {
        /* best effort */
      }
      return response;
    },
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await runtime.runPromise(config.store.close);
      await runtime.dispose();
    },
  };
}

export type { StudioAssets, StudioAsset } from "./assets";
export type { StudioEncryptionKey, StudioEncryptionKeyRing } from "./crypto/index";
export type { StudioSessionStore, StudioStoreCapabilities } from "./store";
export { loadPackagedStudioAssets, loadStudioAssetsFrom } from "./assets";
export { parseStudioRawTarget } from "./raw-target";
