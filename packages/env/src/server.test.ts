import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environmentKeys = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CORS_ORIGIN",
  "NODE_ENV",
  "SKIP_ENV_VALIDATION",
];

const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/framerfordevs";
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.CORS_ORIGIN = "http://localhost:3001";
  process.env.NODE_ENV = "test";
  delete process.env.SKIP_ENV_VALIDATION;
});

afterEach(() => {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("server environment", () => {
  it("loads the configured server environment", async () => {
    const { env } = await import("./server");

    expect(env.DATABASE_URL.length).toBeGreaterThan(0);
    expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(new URL(env.BETTER_AUTH_URL)).toBeInstanceOf(URL);
    expect(new URL(env.CORS_ORIGIN)).toBeInstanceOf(URL);
  });

  it("fails early for invalid configuration without leaking secret values", async () => {
    const invalidSecret = "invalid-secret";
    process.env.DATABASE_URL = "";
    process.env.BETTER_AUTH_SECRET = invalidSecret;
    process.env.BETTER_AUTH_URL = "not-a-url";
    process.env.CORS_ORIGIN = "not-a-url";
    process.env.NODE_ENV = "invalid";
    process.env.SKIP_ENV_VALIDATION = "false";

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = await import("./server").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeDefined();
    expect(String(failure)).not.toContain(invalidSecret);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls.join(" ")).not.toContain(invalidSecret);
  });
});
