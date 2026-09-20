// Owns Better Auth session, dashboard cookie, and public OAuth issuer configuration.

import { db } from "@framerfordevs/db";
import * as schema from "@framerfordevs/db/schema/auth";
import { env } from "@framerfordevs/env/server";
import {
  DEVICE_CODE_GRANT_TYPE,
  oauthDeviceAuthorization,
  oauthProvider,
} from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { decodeProtectedHeader } from "jose";

export const OFFICIAL_CLI_OAUTH_CLIENT_ID = "framerfordevs-cli";
export const TOOLING_READ_SCOPE = "tooling:read";
export const AUTHORING_READ_SCOPE = "authoring:read";
export const AUTHORING_DRAFT_WRITE_SCOPE = "authoring:draft:write";
export const AUTHORING_CONTENT_PUBLISH_SCOPE = "authoring:content:publish";
export const AUTHORING_SCHEMA_PUSH_SCOPE = "authoring:schema:push";
export const CONTROL_PLANE_READ_SCOPE = "control-plane:read";
export const CONTROL_PLANE_WRITE_SCOPE = "control-plane:write";
export const CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE = "control-plane:project:lifecycle";
export const CONTROL_PLANE_GOVERNANCE_READ_SCOPE = "control-plane:governance:read";
export const CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE = "control-plane:governance:write";
export const CONTROL_PLANE_OPERATIONS_READ_SCOPE = "control-plane:operations:read";
export const CONTROL_PLANE_OPERATIONS_WRITE_SCOPE = "control-plane:operations:write";
export const CONTROL_PLANE_SECURITY_READ_SCOPE = "control-plane:security:read";
export const CLI_API_OAUTH_SCOPES = [
  TOOLING_READ_SCOPE,
  AUTHORING_READ_SCOPE,
  AUTHORING_DRAFT_WRITE_SCOPE,
  AUTHORING_CONTENT_PUBLISH_SCOPE,
  AUTHORING_SCHEMA_PUSH_SCOPE,
  CONTROL_PLANE_READ_SCOPE,
  CONTROL_PLANE_WRITE_SCOPE,
  CONTROL_PLANE_PROJECT_LIFECYCLE_SCOPE,
  CONTROL_PLANE_GOVERNANCE_READ_SCOPE,
  CONTROL_PLANE_GOVERNANCE_WRITE_SCOPE,
  CONTROL_PLANE_OPERATIONS_READ_SCOPE,
  CONTROL_PLANE_OPERATIONS_WRITE_SCOPE,
  CONTROL_PLANE_SECURITY_READ_SCOPE,
] as const;
export type CliApiOAuthScope = (typeof CLI_API_OAUTH_SCOPES)[number];
export const CLI_OAUTH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  ...CLI_API_OAUTH_SCOPES,
] as const;
export const CLI_OAUTH_GRANT_TYPES = [DEVICE_CODE_GRANT_TYPE, "refresh_token"] as const;

const OFFICIAL_CLI_OAUTH_CLIENT_ROW_ID = "oauth-client-framerfordevs-cli";
const TOOLING_OAUTH_RESOURCE_ROW_ID = "oauth-resource-tooling-v1";
const OFFICIAL_CLI_RESOURCE_LINK_ROW_ID = "oauth-client-resource-framerfordevs-cli-tooling-v1";
const TOOLING_ACCESS_TOKEN_LIFETIME_SECONDS = 10 * 60;
const CLI_REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export interface ToolingOAuthPrincipal {
  readonly kind: "oauth_user";
  readonly userId: string;
  readonly clientId: typeof OFFICIAL_CLI_OAUTH_CLIENT_ID;
  readonly scopes: ReadonlyArray<string>;
  readonly expiresAtEpochSeconds: number;
}

interface CreateAuthOptions {
  readonly apiOrigin?: string;
  readonly dashboardOrigin?: string;
  readonly hostRoutingEnabled?: boolean;
  readonly nodeEnv?: "development" | "production" | "test";
  readonly oauthDeviceAuthorizationEnabled?: boolean;
}

interface EnsureOfficialCliOAuthAuthorityOptions {
  readonly enabled?: boolean;
  readonly now?: Date;
}

interface ToolingOAuthAccessTokenVerifierOptions {
  readonly authInstance?: ReturnType<typeof createAuth>;
  readonly enabled?: boolean;
  readonly issuer?: string;
  readonly resource?: string;
}

interface CookieAttributes {
  readonly sameSite: "lax";
  readonly secure: boolean;
  readonly httpOnly: true;
  readonly path: "/";
}

/** Returns the dashboard-hosted, host-only session cookie attributes. */
export function getDefaultCookieAttributes(
  nodeEnv: "development" | "production" | "test",
): CookieAttributes {
  return {
    sameSite: "lax",
    secure: nodeEnv === "production",
    httpOnly: true,
    path: "/",
  };
}

/** Builds the shared auth runtime with per-request dashboard/API base URL resolution when enforced. */
export function createAuth(options: CreateAuthOptions = {}) {
  const apiOrigin = new URL(options.apiOrigin ?? env.BETTER_AUTH_URL).origin;
  const dashboardOrigin = new URL(options.dashboardOrigin ?? env.DASHBOARD_ORIGIN).origin;
  const hostRoutingEnabled = options.hostRoutingEnabled ?? env.HOST_ROUTING_ENABLED;
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV;
  const toolingResource = env.TOOLING_API_RESOURCE;
  const issuer = new URL("/api/auth", apiOrigin).toString();
  const oauthDeviceAuthorizationEnabled =
    options.oauthDeviceAuthorizationEnabled ?? env.OAUTH_DEVICE_AUTHORIZATION_ENABLED;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    disabledPaths: oauthDeviceAuthorizationEnabled ? ["/token"] : [],
    trustedOrigins: [dashboardOrigin],
    logger: {
      disabled: env.NODE_ENV === "test",
    },
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: hostRoutingEnabled
      ? {
          allowedHosts: [new URL(apiOrigin).host, new URL(dashboardOrigin).host],
          protocol: new URL(apiOrigin).protocol === "https:" ? "https" : "http",
        }
      : dashboardOrigin,
    advanced: {
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: getDefaultCookieAttributes(nodeEnv),
      trustedProxyHeaders: env.TRUST_PROXY_HOPS > 0,
    },
    plugins: oauthDeviceAuthorizationEnabled
      ? [
          jwt({
            disableSettingJwtHeader: true,
            jwt: {
              audience: toolingResource,
              issuer,
            },
          }),
          oauthProvider({
            loginPage: new URL("/login", dashboardOrigin).toString(),
            consentPage: new URL("/oauth/consent", dashboardOrigin).toString(),
            scopes: [...CLI_OAUTH_SCOPES],
            resources: [
              {
                identifier: toolingResource,
                name: "Framer for Developers Tooling API",
                accessTokenTtl: TOOLING_ACCESS_TOKEN_LIFETIME_SECONDS,
                refreshTokenTtl: CLI_REFRESH_TOKEN_LIFETIME_SECONDS,
                allowedScopes: [...CLI_OAUTH_SCOPES],
              },
            ],
            resourceSeedMode: "overwrite",
            cachedResources: new Set([toolingResource]),
            cachedTrustedClients: new Set([OFFICIAL_CLI_OAUTH_CLIENT_ID]),
            enforcePerClientResources: true,
            accessTokenExpiresIn: TOOLING_ACCESS_TOKEN_LIFETIME_SECONDS,
            refreshTokenExpiresIn: CLI_REFRESH_TOKEN_LIFETIME_SECONDS,
            refreshTokenReuseInterval: 0,
            allowDynamicClientRegistration: false,
            allowUnauthenticatedClientRegistration: false,
            clientPrivileges: () => false,
            resourcePrivileges: () => false,
          }),
          oauthDeviceAuthorization({
            verificationUri: new URL("/device", dashboardOrigin).toString(),
            expiresIn: "10m",
            interval: "5s",
            deviceCodeLength: 32,
            userCodeLength: 8,
          }),
        ]
      : [],
  });
}

/** Reconciles the fixed public CLI client and its sole Tooling resource before OAuth rollout. */
export async function ensureOfficialCliOAuthAuthority(
  options: EnsureOfficialCliOAuthAuthorityOptions = {},
) {
  if (!(options.enabled ?? env.OAUTH_DEVICE_AUTHORIZATION_ENABLED)) return;

  const now = options.now ?? new Date();
  const toolingResource = env.TOOLING_API_RESOURCE;

  await db.transaction(async (transaction) => {
    await transaction
      .insert(schema.oauthResource)
      .values({
        id: TOOLING_OAUTH_RESOURCE_ROW_ID,
        identifier: toolingResource,
        name: "Framer for Developers Tooling API",
        accessTokenTtl: TOOLING_ACCESS_TOKEN_LIFETIME_SECONDS,
        refreshTokenTtl: CLI_REFRESH_TOKEN_LIFETIME_SECONDS,
        allowedScopes: [...CLI_OAUTH_SCOPES],
        dpopBoundAccessTokensRequired: false,
        disabled: false,
        createdAt: now,
        updatedAt: now,
        policyVersion: 1,
      })
      .onConflictDoUpdate({
        target: schema.oauthResource.identifier,
        set: {
          name: "Framer for Developers Tooling API",
          accessTokenTtl: TOOLING_ACCESS_TOKEN_LIFETIME_SECONDS,
          refreshTokenTtl: CLI_REFRESH_TOKEN_LIFETIME_SECONDS,
          allowedScopes: [...CLI_OAUTH_SCOPES],
          dpopBoundAccessTokensRequired: false,
          disabled: false,
          updatedAt: now,
          policyVersion: 1,
        },
      });

    await transaction
      .insert(schema.oauthClient)
      .values({
        id: OFFICIAL_CLI_OAUTH_CLIENT_ROW_ID,
        clientId: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        clientSecret: null,
        disabled: false,
        skipConsent: false,
        enableEndSession: false,
        subjectType: "public",
        scopes: [...CLI_OAUTH_SCOPES],
        clientCredentialsScopes: [],
        createdAt: now,
        updatedAt: now,
        name: "Framer for Developers CLI",
        redirectUris: [],
        tokenEndpointAuthMethod: "none",
        applicationType: "native",
        grantTypes: [...CLI_OAUTH_GRANT_TYPES],
        responseTypes: [],
        requirePKCE: false,
        dpopBoundAccessTokens: false,
      })
      .onConflictDoUpdate({
        target: schema.oauthClient.clientId,
        set: {
          clientSecret: null,
          disabled: false,
          skipConsent: false,
          enableEndSession: false,
          subjectType: "public",
          scopes: [...CLI_OAUTH_SCOPES],
          clientCredentialsScopes: [],
          updatedAt: now,
          name: "Framer for Developers CLI",
          redirectUris: [],
          tokenEndpointAuthMethod: "none",
          applicationType: "native",
          grantTypes: [...CLI_OAUTH_GRANT_TYPES],
          responseTypes: [],
          requirePKCE: false,
          dpopBoundAccessTokens: false,
        },
      });

    await transaction
      .insert(schema.oauthClientResource)
      .values({
        id: OFFICIAL_CLI_RESOURCE_LINK_ROW_ID,
        clientId: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        resourceId: toolingResource,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [schema.oauthClientResource.clientId, schema.oauthClientResource.resourceId],
      });
  });
}

export const auth = createAuth();

/** Builds a verifier that validates protocol cryptography before narrowing official CLI claims. */
export function makeToolingOAuthAccessTokenVerifier(
  options: ToolingOAuthAccessTokenVerifierOptions = {},
) {
  const authInstance = options.authInstance ?? auth;
  const enabled = options.enabled ?? env.OAUTH_DEVICE_AUTHORIZATION_ENABLED;
  const issuer = options.issuer ?? new URL("/api/auth", env.BETTER_AUTH_URL).toString();
  const resource = options.resource ?? env.TOOLING_API_RESOURCE;

  return async (
    token: string,
    requiredScope: CliApiOAuthScope = TOOLING_READ_SCOPE,
  ): Promise<ToolingOAuthPrincipal | null> => {
    if (!enabled || token.length === 0 || token.length > 16_384) return null;

    try {
      const header = decodeProtectedHeader(token);
      if (header.typ !== "at+jwt") return null;

      const result = await authInstance.api.verifyJWT({
        body: {
          token,
          issuer,
        },
        headers: new Headers({ host: new URL(issuer).host }),
      });
      const payload: Record<string, unknown> | null = result.payload;
      if (payload === null) return null;

      const audience = payload.aud;
      const audienceMatches =
        audience === resource || (Array.isArray(audience) && audience.includes(resource));
      const scopes =
        typeof payload.scope === "string"
          ? new Set(payload.scope.split(" ").filter((scope) => scope.length > 0))
          : null;

      if (
        !audienceMatches ||
        payload.client_id !== OFFICIAL_CLI_OAUTH_CLIENT_ID ||
        payload.azp !== OFFICIAL_CLI_OAUTH_CLIENT_ID ||
        typeof payload.sub !== "string" ||
        payload.sub.length === 0 ||
        payload.sub.length > 255 ||
        typeof payload.exp !== "number" ||
        scopes === null ||
        !scopes.has(requiredScope)
      ) {
        return null;
      }

      return {
        kind: "oauth_user",
        userId: payload.sub,
        clientId: OFFICIAL_CLI_OAUTH_CLIENT_ID,
        scopes: [...scopes].sort(),
        expiresAtEpochSeconds: payload.exp,
      };
    } catch {
      return null;
    }
  };
}

export const verifyToolingOAuthAccessToken = makeToolingOAuthAccessTokenVerifier();
