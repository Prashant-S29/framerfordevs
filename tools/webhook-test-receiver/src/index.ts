// Starts and gracefully stops the standalone real-network webhook receiver process.

import { loadRuntimeConfig } from "./config.js";
import { createReceiverServer } from "./server.js";

const config = loadRuntimeConfig();
const server = createReceiverServer(config);
let closing = false;

/** Stops accepting requests and exits after active responses complete. */
function shutdown(signal: NodeJS.Signals): void {
  if (closing) return;
  closing = true;
  process.stdout.write(
    `${JSON.stringify({ level: "info", event: "receiver.stopping", signal })}\n`,
  );
  server.close((cause) => {
    if (cause !== undefined) {
      process.stderr.write(
        `${JSON.stringify({ level: "error", event: "receiver.stop_failed" })}\n`,
      );
      process.exitCode = 1;
    }
  });
}

server.listen(config.port, "0.0.0.0", () => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", event: "receiver.started", port: config.port })}\n`,
  );
});
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
