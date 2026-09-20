// Verifies marketing login entry accepts only bounded dashboard-relative destinations.

import { describe, expect, it } from "vitest";

import { buildDashboardLoginUrl, getSafeDashboardReturnTo, parseLoginEntrySearch } from "./index";

describe("marketing login entry", () => {
  it("defaults to the dashboard and preserves one safe project destination", () => {
    expect(parseLoginEntrySearch({})).toEqual({ valid: true });
    expect(parseLoginEntrySearch({ next: "/projects/project-1?tab=operations" })).toEqual({
      next: "/projects/project-1?tab=operations",
      valid: true,
    });
    expect(
      buildDashboardLoginUrl("https://dashboard.example.test", { valid: true })?.toString(),
    ).toBe("https://dashboard.example.test/login?returnTo=%2Fdashboard");
  });

  it.each([
    "https://attacker.example/path",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "/login",
    "/login?returnTo=/dashboard",
    "/api/auth/get-session",
    "/rpc/privateData",
    "/projects%2fproject-1",
    "/projects%5cproject-1",
    "/projects%00project-1",
    "/projects%",
    "/projects#secret",
    `/${"x".repeat(2_049)}`,
  ])("rejects unsafe return destination %s", (value) => {
    expect(getSafeDashboardReturnTo(value)).toBeNull();
    expect(parseLoginEntrySearch({ next: value })).toEqual({ valid: false });
  });

  it("rejects unknown or duplicate search values", () => {
    expect(parseLoginEntrySearch({ next: "/dashboard", campaign: "unsafe" })).toEqual({
      valid: false,
    });
    expect(parseLoginEntrySearch({ next: ["/dashboard", "/projects/project-1"] })).toEqual({
      valid: false,
    });
  });
});
