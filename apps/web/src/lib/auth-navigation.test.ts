import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { getAuthenticatedRedirect } from "./auth-navigation";

describe("authenticated navigation", () => {
  it("allows anonymous visitors to open the login page", () => {
    expect(getAuthenticatedRedirect(null)).toBeNull();
  });

  it("redirects authenticated visitors to the dashboard", () => {
    const result = getAuthenticatedRedirect({ userId: "user-1" });

    expect(isRedirect(result)).toBe(true);
    if (!result) {
      throw new Error("Expected an authenticated redirect");
    }
    expect(result.options).toMatchObject({ to: "/dashboard" });
  });
});
