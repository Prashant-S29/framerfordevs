// Loads bounded receiver configuration and scenario-specific signing secrets without exposing values.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { RuntimeConfig, ScenarioKey } from "./types.js";

const secretPattern = /^whsec_[A-Za-z0-9_-]{43}$/u;

/** Parses one bounded integer environment setting or fails startup. */
function boundedInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

/** Loads the complete non-secret runtime configuration from environment variables. */
export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    port: boundedInteger("PORT", environment.PORT, 8_787, 1_024, 65_535),
    dataDir: environment.DATA_DIR ?? "./data",
    secretsDir: environment.SECRETS_DIR ?? "./secrets",
    maximumBodyBytes: boundedInteger(
      "MAX_BODY_BYTES",
      environment.MAX_BODY_BYTES,
      131_072,
      1_024,
      131_072,
    ),
    timestampToleranceSeconds: boundedInteger(
      "TIMESTAMP_TOLERANCE_SECONDS",
      environment.TIMESTAMP_TOLERANCE_SECONDS,
      300,
      0,
      900,
    ),
  };
}

/** Reads up to two active/overlap secrets for one scenario from its ignored secret file. */
export async function loadScenarioSecrets(
  secretsDirectory: string,
  scenario: ScenarioKey,
): Promise<ReadonlyArray<string>> {
  let value: string;
  try {
    value = await readFile(join(secretsDirectory, `${scenario}.txt`), "utf8");
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") {
      return [];
    }
    throw new Error("Webhook signing-secret storage is unavailable.", { cause });
  }
  const secrets = value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (
    secrets.length < 1 ||
    secrets.length > 2 ||
    secrets.some((secret) => !secretPattern.test(secret))
  ) {
    throw new Error(`The ${scenario} signing-secret file must contain one or two valid secrets.`);
  }
  return secrets;
}
