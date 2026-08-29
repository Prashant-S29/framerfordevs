import { disposeApplicationRuntime } from "@framerfordevs/api/runtime/index";
import { ensureOfficialCliOAuthAuthority } from "@framerfordevs/auth";
import { env } from "@framerfordevs/env/server";
import type { Server } from "node:http";

import { createApp } from "./app";

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
  await ensureOfficialCliOAuthAuthority();

  const app = createApp();
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
