// Runs the operator-controlled M9 read-model dry-run/apply boundary without logging content values.

import { Effect } from "effect";

process.loadEnvFile("../../apps/server/.env");

const [{ db }, { runDeliveryBackfill }] = await Promise.all([
  import("@framerfordevs/db"),
  import("../../services/delivery/backfill"),
]);
const apply = process.argv.includes("--apply");
const batchArgument = process.argv.find((argument) => argument.startsWith("--batch-size="));
const batchSize = Number(batchArgument?.slice("--batch-size=".length) ?? "100");

try {
  const report = await Effect.runPromise(
    runDeliveryBackfill({ mode: apply ? "apply" : "dry_run", batchSize }),
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
} finally {
  await db.$client.end();
}
