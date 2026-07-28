import { env } from "@framerfordevs/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

export function createDb(databaseUrl = env.DATABASE_URL) {
  return drizzle(databaseUrl, { schema });
}

export const db = createDb();
