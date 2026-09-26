// Verifies exact host/path ownership and fail-closed host normalization.

import { describe, expect, it } from "vitest";

import { classifyHostPath, normalizeEffectiveHost } from "./index";

const origins = {
  dashboardOrigin: "https://dashboard.example.test",
  operatorOrigin: "https://operator.internal.example.test",
  publicApiOrigin: "https://api.example.test",
} as const;

describe("host profile classifier", () => {
  it.each([
    ["dashboard.example.test", "/api/auth/sign-in/email", "dashboard"],
    ["dashboard.example.test", "/api/auth/device/approve", "dashboard"],
    ["dashboard.example.test", "/api/auth/oauth2/consent", "dashboard"],
    ["dashboard.example.test", "/api/auth/oauth2/public-client-prelogin", "dashboard"],
    ["dashboard.example.test", "/api/control-plane/v1/projects", "dashboard"],
    ["dashboard.example.test", "/rpc/platform/projects/collections/list", "dashboard"],
    ["api.example.test", "/api/control-plane/v1/projects", "public-api"],
    ["api.example.test", "/api/auth/oauth2/token", "public-api"],
    [
      "api.example.test",
      "/api/studio/v1/projects/project/environments/main/bootstrap",
      "public-api",
    ],
    ["api.example.test", "/api/auth/device/code", "public-api"],
    ["api.example.test", "/api/auth/.well-known/openid-configuration", "public-api"],
    ["operator.internal.example.test", "/api-reference", "operator"],
  ])("allows %s to own %s", (host, path, profile) => {
    expect(classifyHostPath(host, path, origins)).toEqual({ allowed: true, profile });
  });

  it.each([
    ["dashboard.example.test", "/api/auth/oauth2/token"],
    ["api.example.test", "/api/auth/oauth2/consent"],
    ["api.example.test", "/api/auth/oauth2/public-client-prelogin"],
    ["dashboard.example.test", "/api/delivery/v1/openapi.json"],
    ["dashboard.example.test", "/api/studio/v1/openapi.json"],
    ["dashboard.example.test", "/rpc/platform/workspaces/list"],
    ["dashboard.example.test", "/api/control-plane/v1/openapi.json"],
    ["api.example.test", "/api/auth/get-session"],
    ["api.example.test", "/rpc/privateData"],
    ["operator.internal.example.test", "/ready"],
    ["operator.internal.example.test", "/rpc/privateData"],
  ])("rejects valid host %s on foreign path %s", (host, path) => {
    expect(classifyHostPath(host, path, origins)).toMatchObject({
      allowed: false,
      reason: "path_not_owned",
    });
  });

  it.each([
    undefined,
    "",
    "unknown.example.test",
    "dashboard.example.test,evil.example",
    "bad/path",
  ])("rejects missing, unknown, or malformed host %s", (host) => {
    expect(classifyHostPath(host, "/api/auth/get-session", origins).allowed).toBe(false);
  });

  it("normalizes case and a valid explicit port without accepting userinfo", () => {
    expect(normalizeEffectiveHost("DASHBOARD.EXAMPLE.TEST:443")).toBe("dashboard.example.test:443");
    expect(normalizeEffectiveHost("user@dashboard.example.test")).toBeNull();
  });
});
