// Verifies post-authentication redirects remain bounded to safe dashboard UI paths.

import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { getAuthenticatedRedirect, getSafeAuthenticatedReturnTo } from "./index";

describe("authenticated navigation", () => {
  it("allows anonymous visitors to open the login page", () => {
    expect(getAuthenticatedRedirect(null)).toBeNull();
  });

  it("redirects authenticated visitors to the dashboard by default", () => {
    const result = getAuthenticatedRedirect({ userId: "user-1" });

    expect(isRedirect(result)).toBe(true);
    if (!result) throw new Error("Expected an authenticated redirect");
    expect(result.options).toMatchObject({ to: "/dashboard" });
  });

  it("preserves a bounded same-origin device approval return path", () => {
    const returnTo = "/device?user_code=ABCD-1234";
    const result = getAuthenticatedRedirect({ userId: "user-1" }, returnTo);

    expect(getSafeAuthenticatedReturnTo(returnTo)).toBe(returnTo);
    expect(isRedirect(result)).toBe(true);
    if (!result) throw new Error("Expected an authenticated redirect");
    expect(result.options).toMatchObject({ href: returnTo });
  });

  it.each([
    "https://attacker.example/device",
    "//attacker.example/device",
    "/\\attacker.example/device",
    "/api/auth/device",
    "/rpc/privateData",
    "/login",
    "/projects%2fproject-1",
    "/projects%5cproject-1",
    "/projects%00project-1",
    "/projects%",
    "/projects#secret",
    `/${"x".repeat(2_049)}`,
  ])("rejects unsafe return destination %s", (returnTo) => {
    expect(getSafeAuthenticatedReturnTo(returnTo)).toBeNull();
  });
});
