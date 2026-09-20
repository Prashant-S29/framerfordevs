// Validates dashboard-only post-authentication navigation without leaking credentials across hosts.

import { redirect } from "@tanstack/react-router";

const encodedUnsafeCharacterPattern = /%(?:0[0-9a-f]|1[0-9a-f]|2f|5c|7f)/iu;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return true;
  }
  return false;
}

/** Accepts only bounded same-origin application paths as post-authentication destinations. */
export function getSafeAuthenticatedReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    new TextEncoder().encode(value).byteLength > 2_048 ||
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
    url.pathname === "/login" ||
    url.pathname.startsWith("/login/") ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/rpc" ||
    url.pathname.startsWith("/rpc/")
  ) {
    return null;
  }

  return `${url.pathname}${url.search}`;
}

export function getAuthenticatedRedirect<T>(session: T | null, returnTo?: unknown) {
  if (session === null) return null;

  const safeReturnTo = getSafeAuthenticatedReturnTo(returnTo);
  return safeReturnTo === null ? redirect({ to: "/dashboard" }) : redirect({ href: safeReturnTo });
}
