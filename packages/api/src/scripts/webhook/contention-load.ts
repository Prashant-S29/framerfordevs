// Coordinates isolated multi-process dispatcher/attempt contention fixtures through PostgreSQL.

import { createHash, randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { eq, inArray, sql } from "@framerfordevs/db/query";
import { outboxEvent } from "@framerfordevs/db/schema/cms";
import {
  publicationEvent,
  webhookDelivery,
  webhookDeliveryAttempt,
  webhookEndpoint,
  webhookEndpointDestination,
  webhookEndpointSecret,
  webhookEndpointSubscription,
} from "@framerfordevs/db/schema/webhooks";
import { Effect } from "effect";

import { makeWebhookWorkerRepository } from "../../services/webhook/worker-repository";

const eventsPerProject = 500;
const endpointsPerProject = 3;
const totalEvents = eventsPerProject * 2;
const totalDeliveries = totalEvents * endpointsPerProject;

interface Scope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
  readonly actorId: string;
  readonly maximumSequence: number;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Contention scope missing.");
  return value;
}

function marker(runId: string): string {
  if (!/^[0-9a-f-]{36}$/u.test(runId)) throw new Error("Contention run ID invalid.");
  return createHash("sha256").update(runId).digest("hex");
}

async function scopes(): Promise<ReadonlyArray<Scope>> {
  const result = await db.execute(sql`select distinct on (r.project_id)
    r.workspace_id as "workspaceId", r.project_id as "projectId",
    r.environment_id as "environmentId", r.collection_id as "collectionId",
    r.id as "schemaRevisionId", r.published_by_user_id as "actorId",
    coalesce((select max(oe.aggregate_sequence) from outbox_event oe where oe.event_type='cms.schema.published' and oe.subject_id=r.collection_id), 0)::int as "maximumSequence"
    from cms_schema_revision r order by r.project_id, r.id limit 2`);
  if (result.rows.length !== 2) throw new Error("Contention requires two published projects.");
  return result.rows.map((row) => {
    const maximumSequence = Number(row.maximumSequence);
    if (!Number.isSafeInteger(maximumSequence) || maximumSequence < 0) {
      throw new Error("Contention sequence invalid.");
    }
    return {
      workspaceId: text(row.workspaceId),
      projectId: text(row.projectId),
      environmentId: text(row.environmentId),
      collectionId: text(row.collectionId),
      schemaRevisionId: text(row.schemaRevisionId),
      actorId: text(row.actorId),
      maximumSequence,
    };
  });
}

async function setup(runId: string) {
  const runMarker = marker(runId).slice(0, 12);
  const selectedScopes = await scopes();
  const [preflight] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.state, "enabled"));
  if ((preflight?.count ?? 0) !== 0) throw new Error("Contention requires zero enabled endpoints.");
  const now = new Date();
  for (const [scopeIndex, scope] of selectedScopes.entries()) {
    for (let endpointIndex = 0; endpointIndex < endpointsPerProject; endpointIndex += 1) {
      const endpointId = randomUUID();
      const destinationId = randomUUID();
      const secretId = randomUUID();
      await db.transaction(async (transaction) => {
        await transaction.insert(webhookEndpoint).values({
          id: endpointId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          name: `M11 contention ${runMarker} ${scopeIndex}-${endpointIndex}${endpointIndex === 0 ? " slow" : " fast"}`,
          state: "disabled",
          disabledAt: now,
          createdByUserId: scope.actorId,
          changedByUserId: scope.actorId,
          createdAt: now,
          updatedAt: now,
        });
        await transaction.insert(webhookEndpointDestination).values({
          id: destinationId,
          endpointId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          sequence: 1,
          displayOrigin: "https://hooks.example.com",
          encryptionKeyId: "contention-key",
          nonce: "A".repeat(16),
          ciphertext: "A".repeat(22),
          keyedFingerprint: "a".repeat(64),
          createdByUserId: scope.actorId,
          createdAt: now,
        });
        await transaction.insert(webhookEndpointSecret).values({
          id: secretId,
          endpointId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          sequence: 1,
          state: "active",
          encryptionKeyId: "contention-key",
          nonce: "A".repeat(16),
          ciphertext: "A".repeat(22),
          fingerprint: "a".repeat(16),
          activatedAt: now,
          createdByUserId: scope.actorId,
          changedByUserId: scope.actorId,
          createdAt: now,
          updatedAt: now,
        });
        await transaction.insert(webhookEndpointSubscription).values({
          endpointId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          eventType: "cms.schema.published",
          activeFrom: now,
          createdByUserId: scope.actorId,
          createdAt: now,
        });
        await transaction
          .update(webhookEndpoint)
          .set({
            state: "enabled",
            currentDestinationId: destinationId,
            enabledAt: now,
            disabledAt: null,
          })
          .where(eq(webhookEndpoint.id, endpointId));
      });
    }
  }
}

async function produce(runId: string) {
  const hash = marker(runId);
  const selectedScopes = await scopes();
  for (const scope of selectedScopes) {
    for (let offset = 0; offset < eventsPerProject; offset += 50) {
      const now = new Date();
      await db.insert(outboxEvent).values(
        Array.from({ length: 50 }, (_, index) => {
          const sequence = scope.maximumSequence + offset + index + 1;
          return {
            id: randomUUID(),
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
              schemaHash: hash,
              contractHash: "b".repeat(64),
              changedFieldIds: [],
              invalidationTags: [
                `project:${scope.projectId}`,
                `environment:${scope.environmentId}`,
                `collection:${scope.collectionId}`,
              ],
            },
            occurredAt: now,
            availableAt: now,
          };
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

async function progress(hash: string) {
  const result = await db.execute(sql`select
    count(*)::int as events,
    count(*) filter (where oe.processed_at is null)::int as pending,
    (select count(*)::int from webhook_delivery d join outbox_event source on source.id=d.event_id where source.payload->>'schemaHash'=${hash} and d.status in ('queued','retry_scheduled','delivering')) as nonterminal
    from outbox_event oe where oe.payload->>'schemaHash'=${hash}`);
  return {
    events: Number(result.rows[0]?.events),
    pending: Number(result.rows[0]?.pending),
    nonterminal: Number(result.rows[0]?.nonterminal),
  };
}

async function dispatch(runId: string) {
  const hash = marker(runId);
  const repository = makeWebhookWorkerRepository();
  while (true) {
    const state = await progress(hash);
    if (state.events === totalEvents && state.pending === 0) return;
    const result = await Effect.runPromise(repository.dispatchBatch(new Date(), 100));
    if (result.claimed === 0) await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function attempt(runId: string) {
  const hash = marker(runId);
  const repository = makeWebhookWorkerRepository();
  while (true) {
    const state = await progress(hash);
    if (state.events === totalEvents && state.pending === 0 && state.nonterminal === 0) return;
    const result = await Effect.runPromise(repository.claimAttempt(new Date()));
    if (result.claim === null) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    const claim = result.claim;
    await new Promise((resolve) =>
      setTimeout(resolve, claim.endpoint.name.endsWith("slow") ? 50 : 2),
    );
    await Effect.runPromise(
      repository.finalizeAttempt({
        deliveryId: claim.delivery.id,
        endpointId: claim.endpoint.id,
        attemptId: claim.attemptId,
        leaseToken: claim.leaseToken,
        state: "succeeded",
        outcome: "succeeded",
        completedAt: new Date(),
        durationMs: claim.endpoint.name.endsWith("slow") ? 50 : 2,
        httpStatus: 204,
        statusFamily: "2xx",
        retryAfterSeconds: null,
        nextAttemptAt: null,
      }),
    );
  }
}

async function reconcile(runId: string) {
  const hash = marker(runId);
  const result = await db.execute(sql`select
    count(distinct oe.id)::int as events,
    count(distinct pe.event_id)::int as canonical,
    count(distinct d.id)::int as deliveries,
    count(distinct a.id)::int as attempts,
    count(distinct d.id) filter (where d.status='succeeded')::int as succeeded,
    count(distinct d.id) - count(distinct (d.event_id,d.endpoint_id))::int as duplicates,
    extract(epoch from max(a.started_at-d.created_at))*1000 as "maximumQueueMs"
    from outbox_event oe
    left join publication_event pe on pe.event_id=oe.id
    left join webhook_delivery d on d.event_id=oe.id
    left join webhook_delivery_attempt a on a.delivery_id=d.id
    where oe.payload->>'schemaHash'=${hash}`);
  const row = result.rows[0];
  if (
    Number(row?.events) !== totalEvents ||
    Number(row?.canonical) !== totalEvents ||
    Number(row?.deliveries) !== totalDeliveries ||
    Number(row?.attempts) !== totalDeliveries ||
    Number(row?.succeeded) !== totalDeliveries ||
    Number(row?.duplicates) !== 0
  ) {
    throw new Error("Contention reconciliation failed.");
  }
  const projects = await db.execute(sql`select d.project_id, count(*)::int as deliveries
    from webhook_delivery d join outbox_event oe on oe.id=d.event_id
    where oe.payload->>'schemaHash'=${hash} group by d.project_id`);
  if (
    projects.rows.length !== 2 ||
    projects.rows.some((project) => Number(project.deliveries) !== 1_500)
  ) {
    throw new Error("Contention project characterization failed.");
  }
  const operational = await db.execute(sql`select
    (select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock')::int as waiters,
    (select count(*) from webhook_endpoint where lease_expires_at<=now())::int +
    (select count(*) from webhook_delivery where lease_expires_at<=now())::int as expired`);
  if (Number(operational.rows[0]?.waiters) !== 0 || Number(operational.rows[0]?.expired) !== 0) {
    throw new Error("Contention left unsafe operational state.");
  }
  process.stdout.write(
    `${JSON.stringify({ profile: "combined_multi_process_contention", events: totalEvents, deliveries: totalDeliveries, attempts: totalDeliveries, projects: 2, projectDeliveryShare: [1_500, 1_500], maximumQueueMs: Math.round(Number(row?.maximumQueueMs)), duplicates: 0, waiters: 0, expiredLeases: 0, passed: true })}\n`,
  );
}

async function cleanup(runId: string) {
  const hash = marker(runId);
  const prefix = `M11 contention ${hash.slice(0, 12)}%`;
  const endpointRows = await db
    .select({ id: webhookEndpoint.id })
    .from(webhookEndpoint)
    .where(sql`${webhookEndpoint.name} like ${prefix}`);
  const endpointIds = endpointRows.map((row) => row.id);
  const eventRows = await db
    .select({ id: outboxEvent.id })
    .from(outboxEvent)
    .where(sql`${outboxEvent.payload}->>'schemaHash'=${hash}`);
  const eventIds = eventRows.map((row) => row.id);
  if (endpointIds.length > 0) {
    await db
      .update(webhookEndpoint)
      .set({
        state: "disabled",
        currentDestinationId: null,
        enabledAt: null,
        disabledAt: new Date(),
      })
      .where(inArray(webhookEndpoint.id, endpointIds));
    await db
      .delete(webhookDeliveryAttempt)
      .where(inArray(webhookDeliveryAttempt.endpointId, endpointIds));
    await db.delete(webhookDelivery).where(inArray(webhookDelivery.endpointId, endpointIds));
    await db
      .delete(webhookEndpointSubscription)
      .where(inArray(webhookEndpointSubscription.endpointId, endpointIds));
    await db
      .delete(webhookEndpointSecret)
      .where(inArray(webhookEndpointSecret.endpointId, endpointIds));
    await db
      .delete(webhookEndpointDestination)
      .where(inArray(webhookEndpointDestination.endpointId, endpointIds));
    await db.delete(webhookEndpoint).where(inArray(webhookEndpoint.id, endpointIds));
  }
  if (eventIds.length > 0) {
    await db.delete(publicationEvent).where(inArray(publicationEvent.eventId, eventIds));
    await db.delete(outboxEvent).where(inArray(outboxEvent.id, eventIds));
  }
}

async function main() {
  const command = process.argv[2];
  const runId = process.argv[3] ?? "";
  if (command === "setup") return setup(runId);
  if (command === "produce") return produce(runId);
  if (command === "dispatch") return dispatch(runId);
  if (command === "attempt") return attempt(runId);
  if (command === "reconcile") return reconcile(runId);
  if (command === "cleanup") return cleanup(runId);
  throw new Error("Contention command invalid.");
}

main().then(
  () => process.exit(0),
  () => {
    process.stderr.write("Webhook contention profile failed.\n");
    process.exit(1);
  },
);
