import { db } from "@framerfordevs/db";
import * as schema from "@framerfordevs/db/schema/auth";
import { env } from "@framerfordevs/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

interface CookieAttributes {
  readonly sameSite: "lax" | "none";
  readonly secure: boolean;
  readonly httpOnly: true;
}

export function getDefaultCookieAttributes(
  nodeEnv: "development" | "production" | "test",
): CookieAttributes {
  return {
    sameSite: nodeEnv === "production" ? "none" : "lax",
    secure: nodeEnv === "production",
    httpOnly: true,
  };
}

export function createAuth() {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    logger: {
      disabled: env.NODE_ENV === "test",
    },
    emailAndPassword: {
      enabled: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: getDefaultCookieAttributes(env.NODE_ENV),
    },
    plugins: [],
  });
}

export const auth = createAuth();
