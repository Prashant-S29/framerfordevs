import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("web environment", () => {
  it("loads a valid public server URL", async () => {
    vi.stubEnv("VITE_SERVER_URL", "http://localhost:3000");

    const { env } = await import("./web");

    expect(env.VITE_SERVER_URL).toBe("http://localhost:3000");
  });

  it("rejects an invalid public server URL", async () => {
    vi.stubEnv("VITE_SERVER_URL", "not-a-url");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const failure = await import("./web").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeDefined();
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
