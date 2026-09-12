// Validates server-only infrastructure, authentication, telemetry, and rate-limit configuration.

import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const validatedEnv = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DATABASE_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    TOOLING_API_RESOURCE: z.url().default("http://localhost:3000/api/tooling/v1"),
    OAUTH_DEVICE_AUTHORIZATION_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
    OTEL_SERVICE_NAME: z.string().min(1).default("framerfordevs-server"),
    OTEL_SERVICE_VERSION: z.string().min(1).default("0.0.0"),
    APPLICATION_LOG_LEVEL: z.enum(["info", "error"]).default("info"),
    RATE_LIMIT_STORE: z.enum(["memory", "redis"]).default("memory"),
    RATE_LIMIT_REDIS_URL: z.string().url().optional(),
    RATE_LIMIT_REDIS_TIMEOUT_MS: z.coerce.number().int().min(10).max(1_000).default(100),
    RATE_LIMIT_FINGERPRINT_SECRET: z.string().min(32).optional(),
    DELIVERY_CURSOR_SECRET: z.string().min(32).optional(),
    DELIVERY_CURSOR_PREVIOUS_SECRET: z.string().min(32).optional(),
    CONTROL_PLANE_CURSOR_SECRET: z.string().min(32).optional(),
    CONTROL_PLANE_CURSOR_PREVIOUS_SECRET: z.string().min(32).optional(),
    WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u)
      .optional(),
    WEBHOOK_ENCRYPTION_KEYS: z.string().min(1).optional(),
    WEBHOOK_WORKER_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    WEBHOOK_WORKER_PORT: z.coerce.number().int().min(1_024).max(65_535).default(3_002),
    DELIVERY_API_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    PREVIEW_API_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    MANAGEMENT_API_REFERENCE_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(8).default(0),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  emptyStringAsUndefined: true,
});

const toolingApiResource = new URL(validatedEnv.TOOLING_API_RESOURCE);
const toolingResourceUsesLocalHttp =
  toolingApiResource.protocol === "http:" &&
  ["localhost", "127.0.0.1", "[::1]"].includes(toolingApiResource.hostname);

if (
  toolingApiResource.pathname !== "/api/tooling/v1" ||
  toolingApiResource.search !== "" ||
  toolingApiResource.hash !== "" ||
  toolingApiResource.username !== "" ||
  toolingApiResource.password !== ""
) {
  throw new Error("The Tooling API OAuth resource must be the canonical Tooling v1 URL.");
}

if (toolingApiResource.protocol !== "https:" && !toolingResourceUsesLocalHttp) {
  throw new Error("The Tooling API OAuth resource requires HTTPS outside local development.");
}

if (validatedEnv.NODE_ENV === "production" && toolingApiResource.protocol !== "https:") {
  throw new Error("The production Tooling API OAuth resource requires HTTPS.");
}

if (
  validatedEnv.RATE_LIMIT_STORE === "redis" &&
  (validatedEnv.RATE_LIMIT_REDIS_URL === undefined ||
    validatedEnv.RATE_LIMIT_FINGERPRINT_SECRET === undefined)
) {
  throw new Error("Redis rate limiting requires a Redis URL and a dedicated fingerprint secret.");
}

if (
  validatedEnv.DELIVERY_CURSOR_SECRET !== undefined &&
  validatedEnv.DELIVERY_CURSOR_SECRET === validatedEnv.DELIVERY_CURSOR_PREVIOUS_SECRET
) {
  throw new Error("Delivery cursor active and previous secrets must be different.");
}

if (
  validatedEnv.CONTROL_PLANE_CURSOR_SECRET !== undefined &&
  validatedEnv.CONTROL_PLANE_CURSOR_SECRET === validatedEnv.CONTROL_PLANE_CURSOR_PREVIOUS_SECRET
) {
  throw new Error("Control Plane cursor active and previous secrets must be different.");
}

if (
  (validatedEnv.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID === undefined) !==
  (validatedEnv.WEBHOOK_ENCRYPTION_KEYS === undefined)
) {
  throw new Error("Webhook encryption requires both an active key ID and a persistent key ring.");
}

if (
  validatedEnv.WEBHOOK_WORKER_ENABLED &&
  validatedEnv.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID === undefined
) {
  throw new Error("Enabled webhook delivery requires a persistent encryption key ring.");
}

if (validatedEnv.NODE_ENV === "production" && validatedEnv.MANAGEMENT_API_REFERENCE_ENABLED) {
  throw new Error("The management API reference cannot be enabled in production.");
}

export const env = validatedEnv;
