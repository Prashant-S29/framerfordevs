import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environmentKeys = [
  "DATABASE_URL",
  "DATABASE_POOL_MAX",
  "DATABASE_ACQUIRE_TIMEOUT_MS",
  "DATABASE_IDLE_TIMEOUT_MS",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CORS_ORIGIN",
  "TOOLING_API_RESOURCE",
  "OAUTH_DEVICE_AUTHORIZATION_ENABLED",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_SERVICE_NAME",
  "OTEL_SERVICE_VERSION",
  "APPLICATION_LOG_LEVEL",
  "RATE_LIMIT_STORE",
  "RATE_LIMIT_REDIS_URL",
  "RATE_LIMIT_REDIS_TIMEOUT_MS",
  "RATE_LIMIT_FINGERPRINT_SECRET",
  "DELIVERY_CURSOR_SECRET",
  "DELIVERY_CURSOR_PREVIOUS_SECRET",
  "WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID",
  "WEBHOOK_ENCRYPTION_KEYS",
  "WEBHOOK_WORKER_ENABLED",
  "WEBHOOK_WORKER_PORT",
  "DELIVERY_API_ENABLED",
  "PREVIEW_API_ENABLED",
  "MANAGEMENT_API_REFERENCE_ENABLED",
  "TRUST_PROXY_HOPS",
  "NODE_ENV",
  "SKIP_ENV_VALIDATION",
];

const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://postgres:password@localhost:5432/framerfordevs";
  delete process.env.DATABASE_POOL_MAX;
  delete process.env.DATABASE_ACQUIRE_TIMEOUT_MS;
  delete process.env.DATABASE_IDLE_TIMEOUT_MS;
  process.env.BETTER_AUTH_SECRET = "test-secret-that-is-at-least-32-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.CORS_ORIGIN = "http://localhost:3001";
  delete process.env.TOOLING_API_RESOURCE;
  delete process.env.OAUTH_DEVICE_AUTHORIZATION_ENABLED;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  delete process.env.OTEL_SERVICE_NAME;
  delete process.env.OTEL_SERVICE_VERSION;
  delete process.env.APPLICATION_LOG_LEVEL;
  process.env.RATE_LIMIT_STORE = "memory";
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.RATE_LIMIT_REDIS_TIMEOUT_MS;
  delete process.env.RATE_LIMIT_FINGERPRINT_SECRET;
  delete process.env.DELIVERY_CURSOR_SECRET;
  delete process.env.DELIVERY_CURSOR_PREVIOUS_SECRET;
  delete process.env.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID;
  delete process.env.WEBHOOK_ENCRYPTION_KEYS;
  delete process.env.WEBHOOK_WORKER_ENABLED;
  delete process.env.WEBHOOK_WORKER_PORT;
  delete process.env.DELIVERY_API_ENABLED;
  delete process.env.PREVIEW_API_ENABLED;
  delete process.env.MANAGEMENT_API_REFERENCE_ENABLED;
  delete process.env.TRUST_PROXY_HOPS;
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
    const { env } = await import("./index");

    expect(env.DATABASE_URL.length).toBeGreaterThan(0);
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.DATABASE_ACQUIRE_TIMEOUT_MS).toBe(2_000);
    expect(env.DATABASE_IDLE_TIMEOUT_MS).toBe(30_000);
    expect(env.BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(new URL(env.BETTER_AUTH_URL)).toBeInstanceOf(URL);
    expect(new URL(env.CORS_ORIGIN)).toBeInstanceOf(URL);
    expect(env.TOOLING_API_RESOURCE).toBe("http://localhost:3000/api/tooling/v1");
    expect(env.OAUTH_DEVICE_AUTHORIZATION_ENABLED).toBe(false);
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(env.OTEL_SERVICE_NAME).toBe("framerfordevs-server");
    expect(env.OTEL_SERVICE_VERSION).toBe("0.0.0");
    expect(env.APPLICATION_LOG_LEVEL).toBe("info");
    expect(env.RATE_LIMIT_STORE).toBe("memory");
    expect(env.RATE_LIMIT_REDIS_TIMEOUT_MS).toBe(100);
    expect(env.PREVIEW_API_ENABLED).toBe(false);
    expect(env.WEBHOOK_WORKER_ENABLED).toBe(false);
    expect(env.WEBHOOK_WORKER_PORT).toBe(3_002);
    expect(env.MANAGEMENT_API_REFERENCE_ENABLED).toBe(false);
    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it("accepts a complete persistent webhook encryption key ring", async () => {
    process.env.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID = "active-1";
    process.env.WEBHOOK_ENCRYPTION_KEYS = JSON.stringify({
      "active-1": Buffer.alloc(32, 7).toString("base64url"),
    });

    const { env } = await import("./index");

    expect(env.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID).toBe("active-1");
    expect(env.WEBHOOK_ENCRYPTION_KEYS).toBeDefined();
  });

  it("rejects an incomplete webhook encryption key ring", async () => {
    process.env.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID = "active-1";

    await expect(import("./index")).rejects.toThrow(
      "Webhook encryption requires both an active key ID and a persistent key ring.",
    );
  });

  it("rejects enabled webhook delivery without a persistent key ring", async () => {
    process.env.WEBHOOK_WORKER_ENABLED = "true";

    await expect(import("./index")).rejects.toThrow(
      "Enabled webhook delivery requires a persistent encryption key ring.",
    );
  });

  it("accepts optional OpenTelemetry exporter configuration", async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    process.env.OTEL_SERVICE_NAME = "framerfordevs-test";
    process.env.OTEL_SERVICE_VERSION = "1.2.3";

    const { env } = await import("./index");

    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("http://localhost:4318");
    expect(env.OTEL_SERVICE_NAME).toBe("framerfordevs-test");
    expect(env.OTEL_SERVICE_VERSION).toBe("1.2.3");
  });

  it("accepts a complete generic Redis limiter configuration", async () => {
    process.env.RATE_LIMIT_STORE = "redis";
    process.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379";
    process.env.RATE_LIMIT_REDIS_TIMEOUT_MS = "250";
    process.env.RATE_LIMIT_FINGERPRINT_SECRET = "rate-limit-test-secret-that-is-at-least-32-chars";
    process.env.TRUST_PROXY_HOPS = "2";

    const { env } = await import("./index");

    expect(env.RATE_LIMIT_STORE).toBe("redis");
    expect(env.RATE_LIMIT_REDIS_URL).toBe("redis://localhost:6379");
    expect(env.RATE_LIMIT_REDIS_TIMEOUT_MS).toBe(250);
    expect(env.TRUST_PROXY_HOPS).toBe(2);
  });

  it("rejects Redis mode without its shared identity authority", async () => {
    process.env.RATE_LIMIT_STORE = "redis";
    process.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379";
    delete process.env.RATE_LIMIT_FINGERPRINT_SECRET;

    const failure = await import("./index").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(String(failure)).toContain("Redis rate limiting requires");
    expect(String(failure)).not.toContain("redis://localhost:6379");
  });

  it("accepts the canonical HTTPS Tooling API OAuth resource and explicit rollout gate", async () => {
    process.env.TOOLING_API_RESOURCE = "https://api.example.com/api/tooling/v1";
    process.env.OAUTH_DEVICE_AUTHORIZATION_ENABLED = "true";

    const { env } = await import("./index");

    expect(env.TOOLING_API_RESOURCE).toBe("https://api.example.com/api/tooling/v1");
    expect(env.OAUTH_DEVICE_AUTHORIZATION_ENABLED).toBe(true);
  });

  it("rejects a non-canonical Tooling API OAuth resource", async () => {
    process.env.TOOLING_API_RESOURCE = "https://api.example.com/api/tooling/v1?tenant=unsafe";

    await expect(import("./index")).rejects.toThrow(
      "Tooling API OAuth resource must be the canonical Tooling v1 URL",
    );
  });

  it("rejects a remotely insecure Tooling API OAuth resource", async () => {
    process.env.TOOLING_API_RESOURCE = "http://api.example.com/api/tooling/v1";

    await expect(import("./index")).rejects.toThrow(
      "Tooling API OAuth resource requires HTTPS outside local development",
    );
  });

  it("rejects an HTTP Tooling API OAuth resource in production", async () => {
    process.env.NODE_ENV = "production";

    await expect(import("./index")).rejects.toThrow(
      "production Tooling API OAuth resource requires HTTPS",
    );
  });

  it("rejects a public management reference in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.TOOLING_API_RESOURCE = "https://api.example.com/api/tooling/v1";
    process.env.MANAGEMENT_API_REFERENCE_ENABLED = "true";

    const failure = await import("./index").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(String(failure)).toContain("management API reference cannot be enabled");
  });

  it("rejects identical Delivery cursor rotation secrets", async () => {
    const cursorSecret = "delivery-cursor-test-secret-at-least-32-characters";
    process.env.DELIVERY_CURSOR_SECRET = cursorSecret;
    process.env.DELIVERY_CURSOR_PREVIOUS_SECRET = cursorSecret;

    const failure = await import("./index").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(String(failure)).toContain("must be different");
    expect(String(failure)).not.toContain(cursorSecret);
  });

  it("fails early for invalid configuration without leaking secret values", async () => {
    const invalidSecret = "invalid-secret";
    process.env.DATABASE_URL = "";
    process.env.BETTER_AUTH_SECRET = invalidSecret;
    process.env.BETTER_AUTH_URL = "not-a-url";
    process.env.CORS_ORIGIN = "not-a-url";
    process.env.TOOLING_API_RESOURCE = "not-a-url";
    process.env.NODE_ENV = "invalid";
    process.env.SKIP_ENV_VALIDATION = "false";

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = await import("./index").then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeDefined();
    expect(String(failure)).not.toContain(invalidSecret);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls.join(" ")).not.toContain(invalidSecret);
  });
});
