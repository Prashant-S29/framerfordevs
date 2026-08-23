import { redirect } from "@tanstack/react-router";

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
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter(value)
  ) {
    return null;
  }

  const url = new URL(value, "https://management.invalid");
  if (
    url.origin !== "https://management.invalid" ||
    url.pathname === "/login" ||
    url.pathname.startsWith("/api/")
  ) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function getAuthenticatedRedirect<T>(session: T | null, returnTo?: unknown) {
  if (session === null) return null;

  const safeReturnTo = getSafeAuthenticatedReturnTo(returnTo);
  return safeReturnTo === null ? redirect({ to: "/dashboard" }) : redirect({ href: safeReturnTo });
}
