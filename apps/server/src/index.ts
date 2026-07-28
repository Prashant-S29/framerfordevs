import { disposeApplicationRuntime } from "@framerfordevs/api/runtime";
import { env } from "@framerfordevs/env/server";

import { createApp } from "./app";

const app = createApp();
const port = new URL(env.BETTER_AUTH_URL).port || "3000";
const server = app.listen(Number(port), () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "server.started",
      port: Number(port),
    }),
  );
});

let shuttingDown = false;

function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  server.close(() => {
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
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
