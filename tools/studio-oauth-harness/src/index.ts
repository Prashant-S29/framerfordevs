// Test-only public OAuth client for proving the Studio Code + S256 PKCE flow end to end.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const studioClientIdPattern =
  /^ffd-studio-v1-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const exactScopes = ["studio:session", "offline_access"] as const;

export interface StudioOAuthHarnessConfiguration {
  readonly issuer: string;
  readonly dashboardOrigin: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly resource: string;
  readonly bootstrapUrl: string;
}

export interface StudioOAuthAttempt {
  readonly authorizationUrl: string;
  readonly clientId: string;
  readonly codeChallenge: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly resource: string;
  readonly state: string;
}

export interface StudioOAuthCallback {
  readonly code: string;
  readonly issuer: string;
}

export interface StudioOAuthContinuation {
  readonly oauthQuery: string;
  readonly page: "login" | "consent";
}

export interface StudioOAuthTokenSet {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: "Bearer";
  readonly expiresIn: number;
  readonly scope: string;
}

export interface StudioOAuthHarness {
  readonly configuration: StudioOAuthHarnessConfiguration;
  readonly begin: () => StudioOAuthAttempt;
  readonly continuation: (
    location: string,
    page: StudioOAuthContinuation["page"],
  ) => StudioOAuthContinuation;
  readonly callback: (location: string, attempt: StudioOAuthAttempt) => StudioOAuthCallback;
  readonly continueBody: (
    continuation: StudioOAuthContinuation,
  ) => Readonly<{ postLogin: true; oauth_query: string }>;
  readonly consentBody: (
    continuation: StudioOAuthContinuation,
    accept: boolean,
  ) => Readonly<{ accept: boolean; oauth_query: string }>;
  readonly tokenBody: (
    callback: StudioOAuthCallback,
    attempt: StudioOAuthAttempt,
  ) => URLSearchParams;
  readonly decodeTokenResponse: (value: unknown) => StudioOAuthTokenSet;
  readonly bootstrapRequest: (accessToken: string) => Request;
}

export class StudioOAuthHarnessError extends Error {
  readonly code:
    | "configuration_invalid"
    | "continuation_invalid"
    | "callback_invalid"
    | "state_invalid"
    | "token_response_invalid";

  constructor(code: StudioOAuthHarnessError["code"]) {
    super(`Studio OAuth harness ${code.replaceAll("_", " ")}.`);
    this.name = "StudioOAuthHarnessError";
    this.code = code;
  }
}

function parseBoundedUrl(value: string, code: StudioOAuthHarnessError["code"]) {
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > 2_048) {
    throw new StudioOAuthHarnessError(code);
  }
  try {
    return new URL(value);
  } catch {
    throw new StudioOAuthHarnessError(code);
  }
}

function assertCleanUrl(url: URL) {
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new StudioOAuthHarnessError("configuration_invalid");
  }
}

function usesSecureOrLoopbackTransport(url: URL) {
  return url.protocol === "https:" || (url.protocol === "http:" && loopbackHosts.has(url.hostname));
}

function normalizeConfiguration(
  configuration: StudioOAuthHarnessConfiguration,
): StudioOAuthHarnessConfiguration {
  const issuer = parseBoundedUrl(configuration.issuer, "configuration_invalid");
  const dashboardOrigin = parseBoundedUrl(configuration.dashboardOrigin, "configuration_invalid");
  const redirectUri = parseBoundedUrl(configuration.redirectUri, "configuration_invalid");
  const resource = parseBoundedUrl(configuration.resource, "configuration_invalid");
  const bootstrapUrl = parseBoundedUrl(configuration.bootstrapUrl, "configuration_invalid");

  for (const url of [issuer, dashboardOrigin, redirectUri, resource, bootstrapUrl]) {
    assertCleanUrl(url);
  }
  if (
    issuer.pathname !== "/api/auth" ||
    issuer.search !== "" ||
    dashboardOrigin.pathname !== "/" ||
    dashboardOrigin.search !== "" ||
    resource.search !== "" ||
    bootstrapUrl.search !== "" ||
    !studioClientIdPattern.test(configuration.clientId)
  ) {
    throw new StudioOAuthHarnessError("configuration_invalid");
  }
  if (
    redirectUri.protocol !== "http:" ||
    !loopbackHosts.has(redirectUri.hostname) ||
    !redirectUri.pathname.endsWith("/auth/callback") ||
    redirectUri.search !== ""
  ) {
    throw new StudioOAuthHarnessError("configuration_invalid");
  }
  if (
    !usesSecureOrLoopbackTransport(issuer) ||
    !usesSecureOrLoopbackTransport(dashboardOrigin) ||
    !usesSecureOrLoopbackTransport(resource) ||
    !usesSecureOrLoopbackTransport(bootstrapUrl) ||
    resource.origin !== bootstrapUrl.origin ||
    !bootstrapUrl.pathname.startsWith("/api/studio/v1/")
  ) {
    throw new StudioOAuthHarnessError("configuration_invalid");
  }

  return {
    issuer: issuer.toString().replace(/\/$/u, ""),
    dashboardOrigin: dashboardOrigin.origin,
    clientId: configuration.clientId,
    redirectUri: redirectUri.toString(),
    resource: resource.toString(),
    bootstrapUrl: bootstrapUrl.toString(),
  };
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function decodeTokenResponse(value: unknown): StudioOAuthTokenSet {
  if (typeof value !== "object" || value === null) {
    throw new StudioOAuthHarnessError("token_response_invalid");
  }
  const accessToken = Reflect.get(value, "access_token");
  const refreshToken = Reflect.get(value, "refresh_token");
  const tokenType = Reflect.get(value, "token_type");
  const expiresIn = Reflect.get(value, "expires_in");
  const scope = Reflect.get(value, "scope");
  if (
    typeof accessToken !== "string" ||
    accessToken.length === 0 ||
    accessToken.length > 16_384 ||
    typeof refreshToken !== "string" ||
    refreshToken.length === 0 ||
    refreshToken.length > 16_384 ||
    tokenType !== "Bearer" ||
    typeof expiresIn !== "number" ||
    !Number.isInteger(expiresIn) ||
    expiresIn < 1 ||
    expiresIn > 300 ||
    typeof scope !== "string" ||
    !exactScopes.every((requiredScope) => scope.split(" ").includes(requiredScope))
  ) {
    throw new StudioOAuthHarnessError("token_response_invalid");
  }
  return { accessToken, refreshToken, tokenType, expiresIn, scope };
}

/** Creates an in-memory, loopback-only public client for M18A compatibility evidence. */
export function createStudioOAuthHarness(
  input: StudioOAuthHarnessConfiguration,
): StudioOAuthHarness {
  const configuration = normalizeConfiguration(input);

  return {
    configuration,
    begin: () => {
      const codeVerifier = randomBytes(64).toString("base64url");
      const state = randomBytes(32).toString("base64url");
      const codeChallenge = createHash("sha256").update(codeVerifier, "ascii").digest("base64url");
      const authorizationUrl = new URL(`${configuration.issuer}/oauth2/authorize`);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("client_id", configuration.clientId);
      authorizationUrl.searchParams.set("redirect_uri", configuration.redirectUri);
      authorizationUrl.searchParams.set("scope", exactScopes.join(" "));
      authorizationUrl.searchParams.set("resource", configuration.resource);
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("code_challenge", codeChallenge);
      authorizationUrl.searchParams.set("code_challenge_method", "S256");
      authorizationUrl.searchParams.set("prompt", "consent");
      return {
        authorizationUrl: authorizationUrl.toString(),
        clientId: configuration.clientId,
        codeChallenge,
        codeVerifier,
        redirectUri: configuration.redirectUri,
        resource: configuration.resource,
        state,
      };
    },
    continuation: (location, page) => {
      const url = parseBoundedUrl(location, "continuation_invalid");
      const expectedPath = page === "login" ? "/login" : "/oauth/consent";
      if (
        url.origin !== configuration.dashboardOrigin ||
        url.pathname !== expectedPath ||
        url.hash !== "" ||
        url.searchParams.get("sig") === null ||
        url.searchParams.getAll("ba_param").length === 0
      ) {
        throw new StudioOAuthHarnessError("continuation_invalid");
      }
      return { oauthQuery: url.searchParams.toString(), page };
    },
    callback: (location, attempt) => {
      const url = parseBoundedUrl(location, "callback_invalid");
      const expected = new URL(configuration.redirectUri);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const issuer = url.searchParams.get("iss");
      if (
        url.origin !== expected.origin ||
        url.pathname !== expected.pathname ||
        url.hash !== "" ||
        url.searchParams.get("error") !== null ||
        state === null ||
        code === null ||
        code.length === 0 ||
        code.length > 512 ||
        issuer !== configuration.issuer
      ) {
        throw new StudioOAuthHarnessError("callback_invalid");
      }
      if (!constantTimeEqual(state, attempt.state)) {
        throw new StudioOAuthHarnessError("state_invalid");
      }
      return { code, issuer };
    },
    continueBody: (continuation) => ({
      postLogin: true,
      oauth_query: continuation.oauthQuery,
    }),
    consentBody: (continuation, accept) => ({
      accept,
      oauth_query: continuation.oauthQuery,
    }),
    tokenBody: (callback, attempt) =>
      new URLSearchParams({
        grant_type: "authorization_code",
        code: callback.code,
        client_id: configuration.clientId,
        redirect_uri: configuration.redirectUri,
        code_verifier: attempt.codeVerifier,
        resource: configuration.resource,
      }),
    decodeTokenResponse,
    bootstrapRequest: (accessToken) => {
      if (accessToken.length === 0 || accessToken.length > 16_384) {
        throw new StudioOAuthHarnessError("token_response_invalid");
      }
      return new Request(configuration.bootstrapUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "error",
      });
    },
  };
}
