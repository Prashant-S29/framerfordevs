import { env } from "@framerfordevs/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export interface DatabasePoolOptions {
  readonly maximum: number;
  readonly acquireTimeoutMs: number;
  readonly idleTimeoutMs: number;
}

export function createDb(
  databaseUrl = env.DATABASE_URL,
  options: DatabasePoolOptions = {
    maximum: env.DATABASE_POOL_MAX,
    acquireTimeoutMs: env.DATABASE_ACQUIRE_TIMEOUT_MS,
    idleTimeoutMs: env.DATABASE_IDLE_TIMEOUT_MS,
  },
) {
  return drizzle({
    connection: {
      connectionString: databaseUrl,
      max: options.maximum,
      connectionTimeoutMillis: options.acquireTimeoutMs,
      idleTimeoutMillis: options.idleTimeoutMs,
    },
    schema,
  });
}

export const db = createDb();
