import {
  authorizeStudioOAuth,
  evaluateStudioOAuthClientRateLimit,
  evaluateStudioOAuthGlobalRateLimit,
  evaluateStudioOAuthUserRateLimit,
} from "@framerfordevs/api/operations/studio-public/index";
import { applicationRuntime, disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import { createAuth, ensureOfficialCliOAuthAuthority } from "@framerfordevs/auth";
import { env } from "@framerfordevs/env/server";
import { Effect } from "effect";
import type { Server } from "node:http";

import { createApp } from "./app";
import { makeAuthRateLimitStorage } from "./http/auth-rate-limit-storage/index";

const serverAuth = createAuth({
  oauthRateLimitStorage: makeAuthRateLimitStorage({
    consumeOAuthGlobal: async () => {
      const decision = await applicationRuntime.runPromise(evaluateStudioOAuthGlobalRateLimit());
      return { allowed: decision.allowed, retryAfter: decision.retryAfterSeconds };
    },
  }),
  studioOAuthRateLimit: async (input) => {
    const decision = await applicationRuntime.runPromise(
      input.policy === "client"
        ? evaluateStudioOAuthClientRateLimit(input.clientId)
        : input.policy === "user" && input.userId !== undefined
          ? evaluateStudioOAuthUserRateLimit(input.clientId, input.userId)
          : evaluateStudioOAuthGlobalRateLimit(),
    );
    return { allowed: decision.allowed, retryAfter: decision.retryAfterSeconds };
  },
  studioOAuthConsentPolicy: (input) =>
    applicationRuntime.runPromise(
      authorizeStudioOAuth(input.clientId, input.userId).pipe(
        Effect.match({
          onFailure: (error) => {
            if (error._tag === "ForbiddenFailure") return false;
            throw error;
          },
          onSuccess: ({ allowed }) => allowed,
        }),
      ),
    ),
});

let server: Server | undefined;
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  const finish = () => {
    void disposeApplicationRuntime()
      .catch(() => undefined)
      .finally(() => {
        console.log(
          JSON.stringify({
            level: "info",
            event: "server.stopped",
            signal,
          }),
        );
      });
  };

  if (server === undefined) {
    finish();
    return;
  }

  server.close(finish);
}

async function start() {
  if (
    env.NODE_ENV === "production" &&
    env.OAUTH_DEVICE_AUTHORIZATION_ENABLED &&
    (env.RATE_LIMIT_STORE !== "redis" || env.RATE_LIMIT_REDIS_URL === undefined)
  ) {
    throw new Error("Studio OAuth requires shared Redis rate-limit storage in production.");
  }
  await ensureOfficialCliOAuthAuthority();

  const app = createApp({ authInstance: serverAuth });
  const port = new URL(env.BETTER_AUTH_URL).port || "3000";
  server = app.listen(Number(port), () => {
    console.log(
      JSON.stringify({
        level: "info",
        event: "server.started",
        port: Number(port),
      }),
    );
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

void start().catch((cause: unknown) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "server.start_failed",
      error: cause instanceof Error ? cause.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
});
