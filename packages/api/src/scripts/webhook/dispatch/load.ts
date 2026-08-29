// Runs and cleans the approved 10,000-event no-endpoint canonical expansion baseline.

import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { inArray, sql } from "@framerfordevs/db/query";
import { outboxEvent } from "@framerfordevs/db/schema/cms";
import { publicationEvent } from "@framerfordevs/db/schema/webhooks";
import { Effect } from "effect";

import { makeWebhookWorkerRepository } from "../../../services/webhook/worker-repository";

const eventCount = 10_000;
const insertChunkSize = 500;

interface ScopeRow {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
  readonly maximumSequence: number;
}

function scopeRow(value: Record<string, unknown> | undefined): ScopeRow {
  if (
    !value ||
    typeof value.workspaceId !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.environmentId !== "string" ||
    typeof value.collectionId !== "string" ||
    typeof value.schemaRevisionId !== "string"
  ) {
    throw new Error("Webhook load scope is unavailable.");
  }
  const maximumSequence = Number(value.maximumSequence);
  if (!Number.isSafeInteger(maximumSequence) || maximumSequence < 0) {
    throw new Error("Webhook load sequence authority is invalid.");
  }
  return {
    workspaceId: value.workspaceId,
    projectId: value.projectId,
    environmentId: value.environmentId,
    collectionId: value.collectionId,
    schemaRevisionId: value.schemaRevisionId,
    maximumSequence,
  };
}

async function main() {
  const preflight = await db.execute(sql`select
    (select count(*)::int from webhook_endpoint where state = 'enabled') as endpoints,
    (select count(*)::int from outbox_event where processed_at is null and event_type in ('cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished', 'cms.collection.delivery_config.updated')) as pending`);
  if (Number(preflight.rows[0]?.endpoints) !== 0 || Number(preflight.rows[0]?.pending) !== 0) {
    throw new Error(
      "Webhook load preflight requires no enabled endpoints and no supported backlog.",
    );
  }
  const result = await db.execute(sql`select
    r.workspace_id as "workspaceId",
    r.project_id as "projectId",
    r.environment_id as "environmentId",
    r.collection_id as "collectionId",
    r.id as "schemaRevisionId",
    coalesce((select max(oe.aggregate_sequence) from outbox_event oe where oe.event_type = 'cms.schema.published' and oe.subject_id = r.collection_id), 0)::int as "maximumSequence"
    from cms_schema_revision r
    order by r.id
    limit 1`);
  const scope = scopeRow(result.rows[0]);
  const eventIds = Array.from({ length: eventCount }, () => randomUUID());
  const occurredAt = new Date();
  try {
    for (let offset = 0; offset < eventIds.length; offset += insertChunkSize) {
      const chunk = eventIds.slice(offset, offset + insertChunkSize);
      await db.insert(outboxEvent).values(
        chunk.map((id, index) => {
          const sequence = scope.maximumSequence + offset + index + 1;
          return {
            id,
            workspaceId: scope.workspaceId,
            projectId: scope.projectId,
            environmentId: scope.environmentId,
            eventType: "cms.schema.published",
            subjectType: "cms.collection",
            subjectId: scope.collectionId,
            schemaRevisionId: scope.schemaRevisionId,
            aggregateSequence: sequence,
            payload: {
              version: 1,
              projectId: scope.projectId,
              environmentId: scope.environmentId,
              collectionId: scope.collectionId,
              schemaRevisionId: scope.schemaRevisionId,
              sequence,
              schemaHash: "a".repeat(64),
              contractHash: "b".repeat(64),
              changedFieldIds: [],
              invalidationTags: [
                `project:${scope.projectId}`,
                `environment:${scope.environmentId}`,
                `collection:${scope.collectionId}`,
              ],
            },
            occurredAt,
            availableAt: occurredAt,
          };
        }),
      );
    }

    const repository = makeWebhookWorkerRepository();
    const startedAt = performance.now();
    let claimed = 0;
    let projected = 0;
    while (true) {
      const batch = await Effect.runPromise(repository.dispatchBatch(new Date(), 100));
      claimed += batch.claimed;
      projected += batch.projected;
      if (batch.deliveries !== 0 || batch.internal !== 0 || batch.invalid !== 0) {
        throw new Error("No-endpoint load unexpectedly produced fan-out or internal work.");
      }
      if (batch.claimed === 0) break;
    }
    const durationMs = performance.now() - startedAt;
    const [canonical] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(publicationEvent)
      .where(inArray(publicationEvent.eventId, eventIds));
    if (claimed !== eventCount || projected !== eventCount || canonical?.count !== eventCount) {
      throw new Error("Webhook canonical expansion load did not reconcile.");
    }
    process.stdout.write(
      `${JSON.stringify({
        profile: "canonical_expansion_no_endpoints",
        events: eventCount,
        durationMs: Math.round(durationMs),
        eventsPerSecond: Math.round((eventCount / durationMs) * 1_000 * 100) / 100,
        canonicalEvents: canonical.count,
        deliveries: 0,
        targetDurationMs: 30_000,
        passed: durationMs <= 30_000,
      })}\n`,
    );
    if (durationMs > 30_000) throw new Error("Webhook canonical expansion exceeded its target.");
  } finally {
    for (let offset = 0; offset < eventIds.length; offset += insertChunkSize) {
      const chunk = eventIds.slice(offset, offset + insertChunkSize);
      await db.delete(publicationEvent).where(inArray(publicationEvent.eventId, chunk));
      await db.delete(outboxEvent).where(inArray(outboxEvent.id, chunk));
    }
  }
}

main().then(
  () => process.exit(0),
  () => {
    process.stderr.write("Webhook canonical expansion load failed.\n");
    process.exit(1);
  },
);
