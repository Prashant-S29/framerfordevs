// Classifies trusted effective hosts and enforces the closed server path inventory for each surface.

export type ServerHostProfile = "dashboard" | "operator" | "public-api";

export interface HostProfileOrigins {
  readonly dashboardOrigin: string;
  readonly operatorOrigin: string;
  readonly publicApiOrigin: string;
}

export interface HostPathDecision {
  readonly allowed: boolean;
  readonly profile?: ServerHostProfile;
  readonly reason?: "host_missing" | "host_unknown" | "path_not_owned";
}

const publicApiPrefixes = [
  "/api/authoring/v1",
  "/api/control-plane/v1",
  "/api/delivery/v1",
  "/api/preview/v1",
  "/api/tooling/v1",
] as const;
const oauthProtocolPrefixes = ["/api/auth/jwks", "/api/auth/oauth2"] as const;
const dashboardOAuthPaths = ["/api/auth/oauth2/consent", "/api/auth/oauth2/continue"] as const;
const oauthDeviceProtocolPaths = ["/api/auth/device/code", "/api/auth/device/token"] as const;
const publicDiscoveryPaths = [
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
  "/api/auth/.well-known/oauth-authorization-server",
  "/api/auth/.well-known/openid-configuration",
] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isDashboardPath(pathname: string): boolean {
  if (dashboardOAuthPaths.some((path) => pathname === path)) return true;
  if (matchesPrefix(pathname, "/rpc/platform/projects/collections")) return true;
  if (matchesPrefix(pathname, "/api/control-plane/v1")) {
    return !["/api/control-plane/v1/docs", "/api/control-plane/v1/openapi.json"].includes(pathname);
  }
  return (
    matchesPrefix(pathname, "/api/auth") &&
    !oauthProtocolPrefixes.some((prefix) => matchesPrefix(pathname, prefix)) &&
    !oauthDeviceProtocolPaths.some((path) => pathname === path) &&
    !pathname.includes("/.well-known/")
  );
}

function isPublicApiPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/ready" ||
    publicDiscoveryPaths.some((path) => path === pathname) ||
    publicApiPrefixes.some((prefix) => matchesPrefix(pathname, prefix)) ||
    (oauthProtocolPrefixes.some((prefix) => matchesPrefix(pathname, prefix)) &&
      !dashboardOAuthPaths.some((path) => pathname === path)) ||
    oauthDeviceProtocolPaths.some((path) => pathname === path)
  );
}

function isOperatorPath(pathname: string): boolean {
  return matchesPrefix(pathname, "/api/management/v1") || matchesPrefix(pathname, "/api-reference");
}

function configuredHosts(origins: HostProfileOrigins): ReadonlyMap<string, ServerHostProfile> {
  return new Map([
    [new URL(origins.dashboardOrigin).host.toLowerCase(), "dashboard"],
    [new URL(origins.operatorOrigin).host.toLowerCase(), "operator"],
    [new URL(origins.publicApiOrigin).host.toLowerCase(), "public-api"],
  ]);
}

/** Returns one conservative host value from trusted headers, or null for malformed input. */
export function normalizeEffectiveHost(value: string | undefined): string | null {
  if (value === undefined || value.length === 0 || value.length > 255 || value.includes(",")) {
    return null;
  }
  if (/\s|[/\\@]/u.test(value)) return null;

  try {
    return new URL(`http://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Enforces the exact path inventory owned by the matched configured host. */
export function classifyHostPath(
  effectiveHost: string | undefined,
  pathname: string,
  origins: HostProfileOrigins,
): HostPathDecision {
  const host = normalizeEffectiveHost(effectiveHost);
  if (host === null) return { allowed: false, reason: "host_missing" };

  const profile = configuredHosts(origins).get(host);
  if (profile === undefined) return { allowed: false, reason: "host_unknown" };

  const allowed =
    profile === "dashboard"
      ? isDashboardPath(pathname)
      : profile === "public-api"
        ? isPublicApiPath(pathname)
        : isOperatorPath(pathname);
  return allowed
    ? { allowed: true, profile }
    : { allowed: false, profile, reason: "path_not_owned" };
}
