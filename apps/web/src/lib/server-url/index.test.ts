import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getServerUrl } from "./index";

const environmentKeys = [
  "INTERNAL_SERVER_URL",
  "VERCEL_ENV",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
  for (const key of environmentKeys) delete process.env[key];
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("server URL resolution", () => {
  it("uses the public absolute URL outside Docker", () => {
    expect(getServerUrl("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("uses the internal service URL during Docker SSR", () => {
    process.env.INTERNAL_SERVER_URL = "http://server:3000/";

    expect(getServerUrl("http://localhost:3000")).toBe("http://server:3000");
  });

  it("resolves relative browser URLs against the current origin", () => {
    vi.stubGlobal("window", { location: { origin: "https://app.example.test" } });

    expect(getServerUrl("/api")).toBe("https://app.example.test/api");
  });

  it("uses the local API fallback for relative local SSR URLs", () => {
    expect(getServerUrl("/api")).toBe("http://localhost:3000/api");
  });

  it("uses the production Vercel origin for relative SSR URLs", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "app.example.test";
    process.env.VERCEL_URL = "preview.example.test";

    expect(getServerUrl("/api")).toBe("https://app.example.test/api");
  });
});
