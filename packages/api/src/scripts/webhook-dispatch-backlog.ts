// Drains the operator-approved supported outbox backlog without enabling outbound webhook delivery.

import { db } from "@framerfordevs/db";
import { isNull, sql } from "@framerfordevs/db/query";
import { outboxEvent } from "@framerfordevs/db/schema/cms";
import { Effect } from "effect";

import { projectPublicationEvent } from "../lib/publication-event";
import { makeWebhookWorkerRepository } from "../services/webhook-worker-repository";

interface CountRow {
  readonly pending: number;
  readonly enabledEndpoints: number;
  readonly deliveries: number;
}

function countValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid backlog count.");
  return parsed;
}

async function readCounts(): Promise<CountRow> {
  const result = await db.execute(sql`select
    (select count(*)::int from outbox_event where processed_at is null and event_type in ('cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished', 'cms.collection.delivery_config.updated')) as pending,
    (select count(*)::int from webhook_endpoint where state = 'enabled') as "enabledEndpoints",
    (select count(*)::int from webhook_delivery) as deliveries`);
  const row = result.rows[0];
  if (!row) throw new Error("Backlog count query returned no row.");
  return {
    pending: countValue(row.pending),
    enabledEndpoints: countValue(row.enabledEndpoints),
    deliveries: countValue(row.deliveries),
  };
}

async function main() {
  const before = await readCounts();
  if (before.enabledEndpoints !== 0) {
    throw new Error(
      "Backlog baseline requires zero enabled endpoints to prevent outbound fan-out.",
    );
  }
  const repository = makeWebhookWorkerRepository();
  const startedAt = performance.now();
  let claimed = 0;
  let projected = 0;
  let internal = 0;
  let deliveries = 0;
  let invalid = 0;
  while (true) {
    const result = await Effect.runPromise(repository.dispatchBatch(new Date(), 100));
    claimed += result.claimed;
    projected += result.projected;
    internal += result.internal;
    deliveries += result.deliveries;
    invalid += result.invalid;
    if (result.claimed === 0) break;
  }
  const durationMs = performance.now() - startedAt;
  const after = await readCounts();
  const reconciliation = await db.execute(sql`select
    count(*) filter (where pe.event_id is null)::int as missing,
    count(*)::int as external
    from outbox_event oe
    left join publication_event pe on pe.event_id = oe.id
    where oe.event_type in ('cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished')`);
  const row = reconciliation.rows[0];
  const missing = countValue(row?.missing);
  if (
    claimed !== before.pending ||
    after.pending !== 0 ||
    projected + internal + invalid !== claimed ||
    invalid !== 0 ||
    deliveries !== 0 ||
    after.deliveries !== before.deliveries ||
    missing !== 0
  ) {
    throw new Error("Webhook backlog reconciliation failed.");
  }
  process.stdout.write(
    `${JSON.stringify({
      claimed,
      projected,
      internal,
      deliveries,
      invalid,
      durationMs: Math.round(durationMs),
      attemptsPerSecond:
        durationMs === 0 ? claimed : Math.round((claimed / durationMs) * 1_000 * 100) / 100,
      missingCanonicalEvents: missing,
    })}\n`,
  );
}

async function diagnosePendingProjection() {
  const rows = await db
    .select()
    .from(outboxEvent)
    .where(isNull(outboxEvent.processedAt))
    .limit(100);
  const categories = new Map<string, number>();
  for (const row of rows) {
    const result = projectPublicationEvent(row);
    const category = `${row.eventType}:${result.ok ? "valid" : result.category}`;
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  return Object.fromEntries([...categories].sort(([left], [right]) => left.localeCompare(right)));
}

main().then(
  () => process.exit(0),
  () => {
    void diagnosePendingProjection()
      .then((categories) => {
        process.stderr.write(
          `${JSON.stringify({ event: "webhook.backlog.failed", categories })}\n`,
        );
      })
      .catch(() => {
        process.stderr.write("Webhook backlog dispatch failed.\n");
      })
      .finally(() => process.exit(1));
  },
);
