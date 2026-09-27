import { describe, expect, it } from "vitest";

import { decodeStudioBrowserResponse } from ".";

const bootstrap = {
  formatVersion: 1 as const,
  registration: {
    id: "11111111-1111-4111-8111-111111111111",
    version: 3,
    applicationOrigin: "https://app.example.test",
    mountPath: "/studio",
  },
  project: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Website",
    workspaceId: "44444444-4444-4444-8444-444444444444",
  },
  environment: {
    id: "33333333-3333-4333-8333-333333333333",
    key: "main" as const,
    name: "main" as const,
  },
  user: { id: "studio-user", name: "Studio User", email: "studio@example.test" },
  role: "editor",
  effectiveActions: ["project.read" as const],
  session: { expiresAt: "2026-09-27T12:05:00.000Z" },
};

describe("Studio browser contract", () => {
  it("accepts the exact token-free platform bootstrap envelope", () => {
    expect(
      decodeStudioBrowserResponse({
        ok: true,
        data: bootstrap,
        error: null,
        message: "Studio bootstrap loaded.",
      }),
    ).toMatchObject({ ok: true, data: bootstrap });
  });

  it.each([
    { ...bootstrap, accessToken: "secret" },
    { ...bootstrap, session: { ...bootstrap.session, refreshToken: "secret" } },
    { ...bootstrap, registration: { ...bootstrap.registration, clientSecret: "secret" } },
  ])("rejects secret-shaped excess fields", (data) => {
    expect(() =>
      decodeStudioBrowserResponse({
        ok: true,
        data,
        error: null,
        message: "Studio bootstrap loaded.",
      }),
    ).toThrow("STUDIO_BROWSER_RESPONSE_INVALID");
  });

  it("rejects excess failure-envelope authority", () => {
    expect(() =>
      decodeStudioBrowserResponse({
        ok: false,
        data: null,
        error: {
          code: "STUDIO_AUTH_REQUIRED",
          message: "Authentication required.",
          accessToken: "secret",
        },
        message: "Authentication required.",
      }),
    ).toThrow("STUDIO_BROWSER_RESPONSE_INVALID");
  });
});
