// Owns Better Auth session, dashboard cookie, and public OAuth issuer configuration.

import { createHash, randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, desc, eq, isNull } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import * as schema from "@framerfordevs/db/schema/auth";
import { studioRegistration } from "@framerfordevs/db/schema/control-plane";
import {
  auditEvent,
  project,
  projectCapability,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { env } from "@framerfordevs/env/server";
import {
  DEVICE_CODE_GRANT_TYPE,
  oauthDeviceAuthorization,
  oauthProvider,
  type OAuthClaimExtensionInput,
} from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { decodeProtectedHeader } from "jose";

export const OFFICIAL_CLI_OAUTH_CLIENT_ID = "framerfordevs-cli";
export const STUDIO_SESSION_SCOPE = "studio:session";
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

const STUDIO_OAUTH_SCOPES = [STUDIO_SESSION_SCOPE, "offline_access"] as const;
const STUDIO_OAUTH_CLIENT_ID_PATTERN =
  /^ffd-studio-v1-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OFFICIAL_CLI_OAUTH_CLIENT_ROW_ID = "oauth-client-framerfordevs-cli";
const TOOLING_OAUTH_RESOURCE_ROW_ID = "oauth-resource-tooling-v1";
const OFFICIAL_CLI_RESOURCE_LINK_ROW_ID = "oauth-client-resource-framerfordevs-cli-tooling-v1";
const TOOLING_ACCESS_TOKEN_LIFETIME_SECONDS = 10 * 60;
const CLI_REFRESH_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const STUDIO_ACCESS_TOKEN_LIFETIME_SECONDS = 5 * 60;
const STUDIO_REFRESH_TOKEN_LIFETIME_SECONDS = 8 * 60 * 60;

export interface StudioOAuthPrincipal {
  readonly kind: "studio_oauth_user";
  readonly userId: string;
  readonly clientId: string;
  readonly registrationId: string;
  readonly registrationVersion: number;
  readonly projectId: string;
  readonly environmentId: string;
  readonly grantId: string;
  readonly auditMarkerId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly expiresAtEpochSeconds: number;
}

export interface ToolingOAuthPrincipal {
  readonly kind: "oauth_user";
  readonly userId: string;
  readonly clientId: typeof OFFICIAL_CLI_OAUTH_CLIENT_ID;
  readonly scopes: ReadonlyArray<string>;
  readonly expiresAtEpochSeconds: number;
}

interface OAuthRateLimitStorage {
  readonly consume: (
    key: string,
    rule: Readonly<{ window: number; max: number }>,
  ) => Promise<Readonly<{ allowed: boolean; retryAfter: number | null }>>;
}

interface StudioOAuthRateLimitInput {
  readonly policy: "global" | "client" | "user";
  readonly clientId: string;
  readonly userId?: string;
}

interface StudioOAuthRateLimitResult {
  readonly allowed: boolean;
  readonly retryAfter: number | null;
}

interface CreateAuthOptions {
  readonly apiOrigin?: string;
  readonly dashboardOrigin?: string;
  readonly hostRoutingEnabled?: boolean;
  readonly nodeEnv?: "development" | "production" | "test";
  readonly oauthDeviceAuthorizationEnabled?: boolean;
  /** Shared atomic storage for Better Auth's defense-in-depth request limiter. */
  readonly oauthRateLimitStorage?: OAuthRateLimitStorage;
  /** Must finish current-policy and grant/audit persistence before returning claims. */
  readonly studioOAuthAccessTokenClaims?: (
    input: OAuthClaimExtensionInput,
  ) => Promise<Record<string, unknown>>;
  /** Exact shared OAuth quota adapter supplied by the server runtime. */
  readonly studioOAuthRateLimit?: (
    input: StudioOAuthRateLimitInput,
  ) => Promise<StudioOAuthRateLimitResult>;
  /** Current user/project policy gate before acknowledgement and code issuance. */
  readonly studioOAuthConsentPolicy?: (input: {
    readonly clientId: string;
    readonly userId: string;
  }) => Promise<boolean>;
}

interface EnsureOfficialCliOAuthAuthorityOptions {
  readonly enabled?: boolean;
  readonly now?: Date;
}

interface StudioOAuthAccessTokenVerifierOptions {
  readonly authInstance?: ReturnType<typeof createAuth>;
  readonly issuer?: string;
  readonly resource?: string;
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

function studioOAuthProtocolError(
  status: "FORBIDDEN" | "SERVICE_UNAVAILABLE",
  error: "access_denied" | "temporarily_unavailable",
  description: string,
): APIError {
  return new APIError(status, { error, error_description: description });
}

/** Revalidates current registration, project, role, consent, and audit authority before token bytes exist. */
function hashOAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function studioOAuthGrantId(authorizationCodeId: string): string {
  const bytes = createHash("sha256")
    .update(`studio-grant:${authorizationCodeId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function studioSessionAuditRequestId(
  auditMarkerId: string,
  registrationId: string,
  registrationVersion: number,
): string {
  return `oauth:${auditMarkerId}:${registrationId}:v${registrationVersion}`;
}

async function authorizationCodeAuthority(input: OAuthClaimExtensionInput) {
  const body = input.ctx.body ?? {};
  if (input.grantType === "authorization_code") {
    const code = Reflect.get(body, "code");
    return typeof code === "string" && code.length > 0 && code.length <= 16_384
      ? { authorizationCodeId: hashOAuthToken(code), establish: true as const }
      : null;
  }
  if (input.grantType === "refresh_token") {
    const token = Reflect.get(body, "refresh_token");
    if (typeof token !== "string" || token.length === 0 || token.length > 16_384) return null;
    const [refresh] = await db
      .select({ authorizationCodeId: schema.oauthRefreshToken.authorizationCodeId })
      .from(schema.oauthRefreshToken)
      .where(
        and(
          eq(schema.oauthRefreshToken.token, hashOAuthToken(token)),
          eq(schema.oauthRefreshToken.clientId, input.client.clientId),
          isNull(schema.oauthRefreshToken.revoked),
        ),
      )
      .limit(1);
    return refresh?.authorizationCodeId
      ? { authorizationCodeId: refresh.authorizationCodeId, establish: false as const }
      : null;
  }
  return null;
}

async function persistStudioOAuthAccessTokenAuthority(
  input: OAuthClaimExtensionInput,
  studioResource: string,
): Promise<Record<string, unknown>> {
  const registrationId = input.client.referenceId;
  const userId = input.user?.id;
  if (
    !STUDIO_OAUTH_CLIENT_ID_PATTERN.test(input.client.clientId) ||
    typeof registrationId !== "string" ||
    typeof userId !== "string" ||
    input.scopes.length !== STUDIO_OAUTH_SCOPES.length ||
    !STUDIO_OAUTH_SCOPES.every((scope) => input.scopes.includes(scope)) ||
    input.resources?.length !== 1 ||
    input.resources[0] !== studioResource
  ) {
    throw studioOAuthProtocolError(
      "FORBIDDEN",
      "access_denied",
      "Studio authorization is no longer available.",
    );
  }

  try {
    const codeAuthority = await authorizationCodeAuthority(input);
    if (codeAuthority === null) {
      throw studioOAuthProtocolError(
        "FORBIDDEN",
        "access_denied",
        "Studio authorization is no longer available.",
      );
    }
    return await db.transaction(async (transaction) => {
      const [registration] = await transaction
        .select()
        .from(studioRegistration)
        .where(
          and(
            eq(studioRegistration.id, registrationId),
            eq(studioRegistration.runtimeStatus, "active"),
          ),
        )
        .limit(1);
      if (
        !registration ||
        input.metadata?.registrationId !== registration.id ||
        input.metadata.registrationVersion !== registration.version ||
        input.metadata.projectId !== registration.projectId ||
        input.metadata.environmentId !== registration.environmentId ||
        input.metadata.applicationOrigin !== registration.applicationOrigin
      ) {
        throw studioOAuthProtocolError(
          "FORBIDDEN",
          "access_denied",
          "Studio authorization is no longer available.",
        );
      }

      const [currentProject] = await transaction
        .select({ archivedAt: project.archivedAt })
        .from(project)
        .where(
          and(
            eq(project.id, registration.projectId),
            eq(project.workspaceId, registration.workspaceId),
          ),
        )
        .limit(1);
      const [cmsCapability] = await transaction
        .select({ status: projectCapability.status })
        .from(projectCapability)
        .where(
          and(
            eq(projectCapability.workspaceId, registration.workspaceId),
            eq(projectCapability.projectId, registration.projectId),
            eq(projectCapability.key, "cms"),
          ),
        )
        .limit(1);
      const [workspaceAccess] = await transaction
        .select({ role: workspaceMembership.role })
        .from(workspaceMembership)
        .where(
          and(
            eq(workspaceMembership.workspaceId, registration.workspaceId),
            eq(workspaceMembership.userId, userId),
            isNull(workspaceMembership.revokedAt),
          ),
        )
        .limit(1);
      const [projectAccess] = await transaction
        .select({ role: projectMembership.role })
        .from(projectMembership)
        .where(
          and(
            eq(projectMembership.workspaceId, registration.workspaceId),
            eq(projectMembership.projectId, registration.projectId),
            eq(projectMembership.userId, userId),
            isNull(projectMembership.removedAt),
          ),
        )
        .limit(1);
      const [consent] = await transaction
        .select({ id: schema.oauthConsent.id })
        .from(schema.oauthConsent)
        .where(
          and(
            eq(schema.oauthConsent.clientId, input.client.clientId),
            eq(schema.oauthConsent.userId, userId),
          ),
        )
        .orderBy(desc(schema.oauthConsent.updatedAt), desc(schema.oauthConsent.createdAt))
        .limit(1);
      const roleAllowed = workspaceAccess?.role === "owner" || projectAccess !== undefined;
      if (
        !currentProject ||
        currentProject.archivedAt !== null ||
        cmsCapability?.status !== "enabled" ||
        !roleAllowed ||
        !consent
      ) {
        throw studioOAuthProtocolError(
          "FORBIDDEN",
          "access_denied",
          "Studio authorization is no longer available.",
        );
      }

      const grantId = studioOAuthGrantId(codeAuthority.authorizationCodeId);
      let auditMarkerId: string;
      if (codeAuthority.establish) {
        auditMarkerId = randomUUID();
        await transaction.insert(auditEvent).values({
          id: auditMarkerId,
          workspaceId: registration.workspaceId,
          projectId: registration.projectId,
          environmentId: registration.environmentId,
          actorType: "user",
          actorId: userId,
          action: "studio.session.established",
          resourceType: "studio_grant",
          resourceId: grantId,
          requestId: studioSessionAuditRequestId(
            auditMarkerId,
            registration.id,
            registration.version,
          ),
          occurredAt: new Date(),
        });
      } else {
        const [auditMarker] = await transaction
          .select({ id: auditEvent.id })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.workspaceId, registration.workspaceId),
              eq(auditEvent.projectId, registration.projectId),
              eq(auditEvent.environmentId, registration.environmentId),
              eq(auditEvent.actorType, "user"),
              eq(auditEvent.actorId, userId),
              eq(auditEvent.action, "studio.session.established"),
              eq(auditEvent.resourceType, "studio_grant"),
              eq(auditEvent.resourceId, grantId),
            ),
          )
          .limit(1);
        if (!auditMarker) {
          throw studioOAuthProtocolError(
            "FORBIDDEN",
            "access_denied",
            "Studio authorization is no longer available.",
          );
        }
        auditMarkerId = auditMarker.id;
      }
      return {
        studio_client_kind: "studio_v1",
        studio_grant_id: grantId,
        studio_audit_marker_id: auditMarkerId,
        studio_registration_id: registration.id,
        studio_registration_version: registration.version,
        studio_project_id: registration.projectId,
        studio_environment_id: registration.environmentId,
      };
    });
  } catch (cause) {
    if (cause instanceof APIError) throw cause;
    throw studioOAuthProtocolError(
      "SERVICE_UNAVAILABLE",
      "temporarily_unavailable",
      "Studio authorization could not be established.",
    );
  }
}

function studioClientFromOAuthQuery(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 16_384) return null;
  const values = new URLSearchParams(value).getAll("client_id");
  const clientId = values.length === 1 ? values[0] : undefined;
  return typeof clientId === "string" && STUDIO_OAUTH_CLIENT_ID_PATTERN.test(clientId)
    ? clientId
    : null;
}

async function evaluateStudioOAuthProtocolRateLimit(
  callback: NonNullable<CreateAuthOptions["studioOAuthRateLimit"]>,
  input: StudioOAuthRateLimitInput,
) {
  try {
    return await callback(input);
  } catch {
    throw studioOAuthProtocolError(
      "SERVICE_UNAVAILABLE",
      "temporarily_unavailable",
      "Studio authorization is temporarily unavailable.",
    );
  }
}

async function enforceStudioOAuthProtocolPolicy(
  context: OAuthClaimExtensionInput["ctx"],
  options: CreateAuthOptions,
): Promise<void> {
  const body = context.body ?? {};
  const query = context.query ?? {};
  const continuationClientId = studioClientFromOAuthQuery(Reflect.get(body, "oauth_query"));
  const directClientId = Reflect.get(
    context.path === "/oauth2/authorize" ? query : body,
    "client_id",
  );
  const clientId =
    continuationClientId ??
    (typeof directClientId === "string" && STUDIO_OAUTH_CLIENT_ID_PATTERN.test(directClientId)
      ? directClientId
      : null);
  if (clientId === null) return;

  const ingressPaths = new Set(["/oauth2/authorize", "/oauth2/token", "/oauth2/revoke"]);
  if (ingressPaths.has(context.path) && options.studioOAuthRateLimit !== undefined) {
    if (options.oauthRateLimitStorage === undefined) {
      const global = await evaluateStudioOAuthProtocolRateLimit(options.studioOAuthRateLimit, {
        policy: "global",
        clientId,
      });
      if (!global.allowed) {
        throw new APIError("TOO_MANY_REQUESTS", {
          error: "slow_down",
          error_description: "Too many Studio authorization requests.",
        });
      }
    }
    if (context.path !== "/oauth2/authorize") {
      const client = await evaluateStudioOAuthProtocolRateLimit(options.studioOAuthRateLimit, {
        policy: "client",
        clientId,
      });
      if (!client.allowed) {
        throw new APIError("TOO_MANY_REQUESTS", {
          error: "slow_down",
          error_description: "Too many Studio authorization requests.",
        });
      }
    }
  }

  const userPolicyPaths = new Set([
    "/oauth2/continue",
    "/oauth2/consent",
    "/oauth2/public-client-prelogin",
  ]);
  if (!userPolicyPaths.has(context.path)) return;
  const currentSession = await getSessionFromCtx(context);
  const userId = currentSession?.user.id;
  if (typeof userId !== "string") return;
  if (options.studioOAuthRateLimit !== undefined) {
    const user = await evaluateStudioOAuthProtocolRateLimit(options.studioOAuthRateLimit, {
      policy: "user",
      clientId,
      userId,
    });
    if (!user.allowed) {
      throw new APIError("TOO_MANY_REQUESTS", {
        error: "slow_down",
        error_description: "Too many Studio authorization requests.",
      });
    }
  }
  if (options.studioOAuthConsentPolicy !== undefined) {
    let allowed: boolean;
    try {
      allowed = await options.studioOAuthConsentPolicy({ clientId, userId });
    } catch {
      throw studioOAuthProtocolError(
        "SERVICE_UNAVAILABLE",
        "temporarily_unavailable",
        "Studio authorization is temporarily unavailable.",
      );
    }
    if (!allowed) {
      throw studioOAuthProtocolError(
        "FORBIDDEN",
        "access_denied",
        "Studio authorization is no longer available.",
      );
    }
  }
}

/** Builds the shared auth runtime with per-request dashboard/API base URL resolution when enforced. */
export function createAuth(options: CreateAuthOptions = {}) {
  const apiOrigin = new URL(options.apiOrigin ?? env.BETTER_AUTH_URL).origin;
  const dashboardOrigin = new URL(options.dashboardOrigin ?? env.DASHBOARD_ORIGIN).origin;
  const hostRoutingEnabled = options.hostRoutingEnabled ?? env.HOST_ROUTING_ENABLED;
  const nodeEnv = options.nodeEnv ?? env.NODE_ENV;
  const toolingResource = env.TOOLING_API_RESOURCE;
  const studioResource = new URL("/api/studio/v1", apiOrigin).toString().replace(/\/$/u, "");
  const issuer = new URL("/api/auth", apiOrigin).toString();
  const oauthDeviceAuthorizationEnabled =
    options.oauthDeviceAuthorizationEnabled ?? env.OAUTH_DEVICE_AUTHORIZATION_ENABLED;
  const studioOAuthAccessTokenClaims =
    options.studioOAuthAccessTokenClaims ??
    ((input: OAuthClaimExtensionInput) =>
      persistStudioOAuthAccessTokenAuthority(input, studioResource));

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    disabledPaths: oauthDeviceAuthorizationEnabled ? ["/token"] : [],
    trustedOrigins: [dashboardOrigin],
    hooks: oauthDeviceAuthorizationEnabled
      ? {
          before: createAuthMiddleware(async (context) => {
            await enforceStudioOAuthProtocolPolicy(context, options);
            if (context.path !== "/oauth2/authorize") return;
            const clientId = Reflect.get(context.query ?? {}, "client_id");
            const containsStudioClientId =
              (typeof clientId === "string" && STUDIO_OAUTH_CLIENT_ID_PATTERN.test(clientId)) ||
              (Array.isArray(clientId) &&
                clientId.some(
                  (value) =>
                    typeof value === "string" && STUDIO_OAUTH_CLIENT_ID_PATTERN.test(value),
                ));
            if (!containsStudioClientId) return;
            const prompt = Reflect.get(context.query ?? {}, "prompt");
            const prompts =
              typeof prompt === "string"
                ? new Set(prompt.split(/\s+/u).filter((value) => value.length > 0))
                : new Set<string>();
            const continuation = Reflect.get(context.body ?? {}, "oauth_query");
            const continuationPrompts =
              typeof continuation === "string"
                ? new Set(
                    (new URLSearchParams(continuation).get("prompt") ?? "")
                      .split(/\s+/u)
                      .filter((value) => value.length > 0),
                  )
                : new Set<string>();
            const approvedForcedConsent =
              Reflect.get(context.body ?? {}, "accept") === true &&
              studioClientFromOAuthQuery(continuation) === clientId &&
              continuationPrompts.has("consent");
            if (!prompts.has("consent") && !approvedForcedConsent) {
              throw new APIError("BAD_REQUEST", {
                error: "invalid_request",
                error_description: "Studio authorization requires explicit user acknowledgement.",
              });
            }
            const redirectUri = Reflect.get(context.query ?? {}, "redirect_uri");
            if (typeof clientId !== "string") {
              throw new APIError("BAD_REQUEST", {
                error: "invalid_request",
                error_description: "Invalid Studio authorization request.",
              });
            }
            const client = await db.query.oauthClient.findFirst({
              columns: { disabled: true, redirectUris: true },
              where: (table, operators) => operators.eq(table.clientId, clientId),
            });
            if (
              typeof redirectUri !== "string" ||
              redirectUri.length === 0 ||
              Buffer.byteLength(redirectUri, "utf8") > 2_048 ||
              client === undefined ||
              client.disabled ||
              !client.redirectUris.includes(redirectUri)
            ) {
              throw new APIError("BAD_REQUEST", {
                error: "invalid_request",
                error_description: "Invalid Studio authorization request.",
              });
            }
          }),
        }
      : undefined,
    logger: {
      disabled: env.NODE_ENV === "test",
    },
    emailAndPassword: {
      enabled: true,
    },
    rateLimit:
      options.oauthRateLimitStorage === undefined
        ? undefined
        : {
            enabled: true,
            customStorage: options.oauthRateLimitStorage,
            customRules: {
              "/oauth2/authorize": { window: 60, max: 3_000 },
              "/oauth2/token": { window: 60, max: 3_000 },
              "/oauth2/revoke": { window: 60, max: 3_000 },
            },
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
              audience: [toolingResource, studioResource],
              issuer,
            },
          }),
          oauthProvider({
            loginPage: new URL("/login", dashboardOrigin).toString(),
            consentPage: new URL("/oauth/consent", dashboardOrigin).toString(),
            scopes: [...CLI_OAUTH_SCOPES, STUDIO_SESSION_SCOPE],
            resources: [
              {
                identifier: toolingResource,
                name: "Framer for Developers Tooling API",
                accessTokenTtl: TOOLING_ACCESS_TOKEN_LIFETIME_SECONDS,
                refreshTokenTtl: CLI_REFRESH_TOKEN_LIFETIME_SECONDS,
                allowedScopes: [...CLI_OAUTH_SCOPES],
              },
              {
                identifier: studioResource,
                name: "Framer for Developers Studio API",
                accessTokenTtl: STUDIO_ACCESS_TOKEN_LIFETIME_SECONDS,
                refreshTokenTtl: STUDIO_REFRESH_TOKEN_LIFETIME_SECONDS,
                allowedScopes: [STUDIO_SESSION_SCOPE, "offline_access"],
                metadata: { kind: "studio_v1" },
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
            allowPublicClientPrelogin: true,
            clientPrivileges: () => false,
            resourcePrivileges: () => false,
            extensions: [
              {
                claims: {
                  accessToken: (input) =>
                    STUDIO_OAUTH_CLIENT_ID_PATTERN.test(input.client.clientId)
                      ? studioOAuthAccessTokenClaims(input)
                      : Promise.resolve({}),
                },
              },
            ],
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Validates Studio access-token cryptography and narrows its versioned authority claims. */
export function makeStudioOAuthAccessTokenVerifier(
  options: StudioOAuthAccessTokenVerifierOptions = {},
) {
  const authInstance = options.authInstance ?? auth;
  const issuer = options.issuer ?? new URL("/api/auth", env.BETTER_AUTH_URL).toString();
  const resource =
    options.resource ??
    new URL("/api/studio/v1", env.BETTER_AUTH_URL).toString().replace(/\/$/u, "");

  return async (token: string): Promise<StudioOAuthPrincipal | null> => {
    if (token.length === 0 || token.length > 16_384) return null;
    try {
      const header = decodeProtectedHeader(token);
      if (header.typ !== "at+jwt") return null;
      const result = await authInstance.api.verifyJWT({
        body: { token, issuer },
        headers: new Headers({ host: new URL(issuer).host }),
      });
      const payload: Record<string, unknown> | null = result.payload;
      if (payload === null) return null;
      const audience = payload.aud;
      const audienceMatches =
        audience === resource ||
        (Array.isArray(audience) && audience.length === 1 && audience[0] === resource);
      const scopes =
        typeof payload.scope === "string"
          ? new Set(payload.scope.split(" ").filter((scope) => scope.length > 0))
          : null;
      const scopesMatch =
        scopes !== null &&
        scopes.size === STUDIO_OAUTH_SCOPES.length &&
        STUDIO_OAUTH_SCOPES.every((scope) => scopes.has(scope));
      const clientId = payload.client_id;
      const registrationId = payload.studio_registration_id;
      const registrationVersion = payload.studio_registration_version;
      if (
        !audienceMatches ||
        typeof clientId !== "string" ||
        !STUDIO_OAUTH_CLIENT_ID_PATTERN.test(clientId) ||
        payload.azp !== clientId ||
        payload.studio_client_kind !== "studio_v1" ||
        typeof registrationId !== "string" ||
        !UUID_PATTERN.test(registrationId) ||
        clientId !== `ffd-studio-v1-${registrationId}` ||
        typeof registrationVersion !== "number" ||
        !Number.isSafeInteger(registrationVersion) ||
        registrationVersion <= 0 ||
        typeof payload.studio_project_id !== "string" ||
        !UUID_PATTERN.test(payload.studio_project_id) ||
        typeof payload.studio_environment_id !== "string" ||
        !UUID_PATTERN.test(payload.studio_environment_id) ||
        typeof payload.studio_grant_id !== "string" ||
        !UUID_PATTERN.test(payload.studio_grant_id) ||
        typeof payload.studio_audit_marker_id !== "string" ||
        !UUID_PATTERN.test(payload.studio_audit_marker_id) ||
        typeof payload.sub !== "string" ||
        payload.sub.length === 0 ||
        payload.sub.length > 255 ||
        typeof payload.exp !== "number" ||
        !scopesMatch
      ) {
        return null;
      }
      return {
        kind: "studio_oauth_user",
        userId: payload.sub,
        clientId,
        registrationId,
        registrationVersion,
        projectId: payload.studio_project_id,
        environmentId: payload.studio_environment_id,
        grantId: payload.studio_grant_id,
        auditMarkerId: payload.studio_audit_marker_id,
        scopes: [...scopes].sort(),
        expiresAtEpochSeconds: payload.exp,
      };
    } catch {
      return null;
    }
  };
}

export const verifyStudioOAuthAccessToken = makeStudioOAuthAccessTokenVerifier();

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
