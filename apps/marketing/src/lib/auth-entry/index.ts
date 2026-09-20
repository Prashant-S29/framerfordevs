// Validates bounded marketing login-entry search and builds the exact dashboard redirect URL.

const maximumReturnToBytes = 2_048;
const blockedPathPrefixes = ["/api", "/login", "/rpc"] as const;
const encodedUnsafeCharacterPattern = /%(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/iu;

export interface LoginEntrySearch {
  readonly next?: string;
  readonly valid: boolean;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true;
  }
  return false;
}

export function getSafeDashboardReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > maximumReturnToBytes ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("#") ||
    encodedUnsafeCharacterPattern.test(value) ||
    hasControlCharacter(value)
  ) {
    return null;
  }

  try {
    decodeURIComponent(value);
  } catch {
    return null;
  }

  const url = new URL(value, "https://dashboard.invalid");
  if (
    url.origin !== "https://dashboard.invalid" ||
    url.username !== "" ||
    url.password !== "" ||
    blockedPathPrefixes.some(
      (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }

  return `${url.pathname}${url.search}`;
}

export function parseLoginEntrySearch(search: Record<string, unknown>): LoginEntrySearch {
  const keys = Object.keys(search);
  if (keys.some((key) => key !== "next")) return { valid: false };
  if (!("next" in search)) return { valid: true };

  const next = getSafeDashboardReturnTo(search.next);
  return next === null ? { valid: false } : { next, valid: true };
}

export function buildDashboardLoginUrl(
  dashboardOrigin: string,
  search: LoginEntrySearch,
): URL | null {
  if (!search.valid) return null;
  const destination = new URL("/login", dashboardOrigin);
  destination.searchParams.set("returnTo", search.next ?? "/dashboard");
  return destination;
}
