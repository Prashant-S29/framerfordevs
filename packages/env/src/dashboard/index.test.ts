// Verifies dashboard public origins are exact, normalized, and complete.

import { afterEach, describe, expect, it, vi } from "vitest";

const validEnvironment = {
  VITE_DASHBOARD_ORIGIN: "https://dashboard.example.test",
  VITE_DEVELOPER_ORIGIN: "https://developer.example.test",
  VITE_MARKETING_ORIGIN: "https://example.test",
} as const;

function stubValidEnvironment() {
  for (const [key, value] of Object.entries(validEnvironment)) vi.stubEnv(key, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("dashboard environment", () => {
  it("loads exact public origins", async () => {
    stubValidEnvironment();

    const { env } = await import("./index");

    expect(env).toMatchObject(validEnvironment);
  });

  it.each([
    "not-a-url",
    "https://dashboard.example.test/path",
    "https://dashboard.example.test?query=yes",
    "https://user:secret@dashboard.example.test",
  ])("rejects a non-origin dashboard URL %s", async (value) => {
    stubValidEnvironment();
    vi.stubEnv("VITE_DASHBOARD_ORIGIN", value);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const failure = await import("./index").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeDefined();
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
