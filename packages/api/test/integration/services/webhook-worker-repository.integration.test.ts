// Proves atomic outbox projection, zero-endpoint completion, and duplicate-safe dispatch claims.

import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
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

import { projectPublicationEvent } from "../../../src/lib/publication-event";
import { makeWebhookWorkerRepository } from "../../../src/services/webhook-worker-repository";

interface FixtureScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
}

let scope: FixtureScope | undefined;
const insertedEventIds: Array<string> = [];
const insertedEndpointIds: Array<string> = [];
let fixtureSequence = 900_000;

function requiredScope(): FixtureScope {
  if (!scope) throw new Error("M11 worker integration requires an existing published collection.");
  return scope;
}

describe("Webhook worker repository PostgreSQL integration", () => {
  beforeAll(async () => {
    const result = await db.execute(sql`select
      r.workspace_id as "workspaceId",
      r.project_id as "projectId",
      r.environment_id as "environmentId",
      r.collection_id as "collectionId",
      r.id as "schemaRevisionId"
      from cms_schema_revision r
      order by r.id
      limit 1`);
    const row = result.rows[0];
    if (
      row &&
      typeof row.workspaceId === "string" &&
      typeof row.projectId === "string" &&
      typeof row.environmentId === "string" &&
      typeof row.collectionId === "string" &&
      typeof row.schemaRevisionId === "string"
    ) {
      scope = {
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        environmentId: row.environmentId,
        collectionId: row.collectionId,
        schemaRevisionId: row.schemaRevisionId,
      };
    }
  });

  it("projects a supported event once and marks a zero-endpoint row processed", async () => {
    const current = requiredScope();
    const id = randomUUID();
    insertedEventIds.push(id);
    const now = new Date("2000-01-01T00:00:00.000Z");
    await db.insert(outboxEvent).values({
      id,
      ...current,
      eventType: "cms.schema.published",
      subjectType: "cms.collection",
      subjectId: current.collectionId,
      aggregateSequence: (fixtureSequence += 1),
      payload: {
        version: 1,
        projectId: current.projectId,
        environmentId: current.environmentId,
        collectionId: current.collectionId,
        schemaRevisionId: current.schemaRevisionId,
        sequence: fixtureSequence,
        schemaHash: "a".repeat(64),
        changedFieldIds: [],
        invalidationTags: [
          `project:${current.projectId}`,
          `environment:${current.environmentId}`,
          `collection:${current.collectionId}`,
        ],
      },
      occurredAt: now,
      availableAt: now,
      processedAt: now,
    });

    const [stored] = await db.select().from(outboxEvent).where(eq(outboxEvent.id, id));
    if (!stored) throw new Error("Inserted outbox event could not be loaded.");
    const projection = projectPublicationEvent(stored);
    assert.isFalse(projection.ok, "legacy rows require dispatcher contract reconstruction");

    await db.update(outboxEvent).set({ processedAt: null }).where(eq(outboxEvent.id, id));
    const worker = makeWebhookWorkerRepository();
    const result = await Effect.runPromise(worker.dispatchBatch(now, 0));
    const [outbox] = await db
      .select({ processedAt: outboxEvent.processedAt })
      .from(outboxEvent)
      .where(eq(outboxEvent.id, id));
    const events = await db
      .select({ id: publicationEvent.eventId })
      .from(publicationEvent)
      .where(eq(publicationEvent.eventId, id));

    assert.deepStrictEqual(result, {
      claimed: 1,
      projected: 1,
      deliveries: 0,
      internal: 0,
      invalid: 0,
    });
    assert.instanceOf(outbox?.processedAt, Date);
    assert.strictEqual(events.length, 1);
  });

  it("lets parallel dispatchers claim different rows without duplicate projection", async () => {
    const current = requiredScope();
    const now = new Date("2000-01-01T00:01:00.000Z");
    const ids = [randomUUID(), randomUUID()];
    const sequences = [(fixtureSequence += 1), (fixtureSequence += 1)];
    insertedEventIds.push(...ids);
    await db.insert(outboxEvent).values(
      ids.map((id, index) => {
        const sequence = sequences[index];
        if (sequence === undefined) throw new Error("Missing dispatcher fixture sequence.");
        return {
          id,
          ...current,
          eventType: "cms.schema.published",
          subjectType: "cms.collection",
          subjectId: current.collectionId,
          aggregateSequence: sequence,
          payload: {
            version: 1,
            projectId: current.projectId,
            environmentId: current.environmentId,
            collectionId: current.collectionId,
            schemaRevisionId: current.schemaRevisionId,
            sequence,
            schemaHash: "a".repeat(64),
            contractHash: "b".repeat(64),
            changedFieldIds: [],
            invalidationTags: [
              `project:${current.projectId}`,
              `environment:${current.environmentId}`,
              `collection:${current.collectionId}`,
            ],
          },
          occurredAt: now,
          availableAt: now,
          processedAt: now,
        };
      }),
    );
    await db.update(outboxEvent).set({ processedAt: null }).where(inArray(outboxEvent.id, ids));
    const first = makeWebhookWorkerRepository();
    const second = makeWebhookWorkerRepository();
    const results = await Promise.all([
      Effect.runPromise(first.dispatchBatch(now, 101)),
      Effect.runPromise(second.dispatchBatch(now, 101)),
    ]);
    assert.strictEqual(
      results.reduce((total, result) => total + result.claimed, 0),
      2,
    );
    const projected = await db
      .select({ id: publicationEvent.eventId })
      .from(publicationEvent)
      .where(inArray(publicationEvent.eventId, ids));
    assert.strictEqual(projected.length, 2);
  });

  it("backs supported poison events off without blocking later batches or losing authority", async () => {
    const current = requiredScope();
    const now = new Date("2010-01-01T00:01:30.000Z");
    const id = randomUUID();
    const sequence = (fixtureSequence += 1);
    insertedEventIds.push(id);
    await db.insert(outboxEvent).values({
      id,
      ...current,
      eventType: "cms.schema.published",
      subjectType: "cms.collection",
      subjectId: current.collectionId,
      aggregateSequence: sequence,
      payload: {
        version: 1,
        projectId: current.projectId,
        environmentId: current.environmentId,
        collectionId: current.collectionId,
        schemaRevisionId: current.schemaRevisionId,
        sequence,
        schemaHash: "a".repeat(64),
        contractHash: "b".repeat(64),
        changedFieldIds: ["not-a-stable-field-id"],
        invalidationTags: [],
      },
      occurredAt: now,
      availableAt: now,
      processedAt: null,
      attemptCount: 11,
    });
    const repository = makeWebhookWorkerRepository();
    assert.deepStrictEqual(await Effect.runPromise(repository.dispatchBatch(now, 1)), {
      claimed: 1,
      projected: 0,
      deliveries: 0,
      internal: 0,
      invalid: 1,
    });
    const [poison] = await db.select().from(outboxEvent).where(eq(outboxEvent.id, id));
    assert.strictEqual(poison?.attemptCount, 12);
    assert.isNull(poison?.processedAt);
    assert.isAbove(poison?.availableAt.getTime() ?? 0, now.getTime());
    assert.strictEqual(
      (
        await Effect.runPromise(
          repository.dispatchBatch(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1_000), 1),
        )
      ).claimed,
      0,
    );
  });

  it("uses bounded dispatcher, queue, lease, subscription, attempt, and mapping indexes", async () => {
    const current = requiredScope();
    const plans = await db.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      const outbox = await transaction.execute(
        sql`explain (format json) select id from outbox_event where processed_at is null and available_at <= now() order by available_at, id limit 100 for update skip locked`,
      );
      const queue = await transaction.execute(
        sql`explain (format json) select id from webhook_delivery where status in ('queued', 'retry_scheduled') and next_attempt_at <= now() order by next_attempt_at, id limit 1 for update skip locked`,
      );
      const lease = await transaction.execute(
        sql`explain (format json) select id from webhook_delivery where status = 'delivering' and lease_expires_at <= now() order by lease_expires_at, id limit 1 for update skip locked`,
      );
      const subscriptions = await transaction.execute(
        sql`explain (format json) select endpoint_id from webhook_endpoint_subscription where environment_id = ${current.environmentId} and event_type = 'cms.entry.published' and active_from <= now() and active_until is null`,
      );
      const attempts = await transaction.execute(
        sql`explain (format json) select id from webhook_delivery_attempt where delivery_id = ${randomUUID()} order by attempt_number desc`,
      );
      const mappings = await transaction.execute(
        sql`explain (format json) select id from cms_invalidation_route_mapping where environment_id = ${current.environmentId} and collection_id = ${current.collectionId} and state = 'enabled' order by id`,
      );
      return JSON.stringify([
        outbox.rows,
        queue.rows,
        lease.rows,
        subscriptions.rows,
        attempts.rows,
        mappings.rows,
      ]);
    });
    assert.include(plans, "outbox_event_pending_available_id_idx");
    assert.include(plans, "webhook_delivery_ready_idx");
    assert.include(plans, "webhook_delivery_expired_lease_idx");
    assert.match(
      plans,
      /webhook_subscription_(?:dispatch_idx|endpoint_type_active_unique)/u,
      "subscription eligibility must use a bounded active or dispatch index",
    );
    assert.match(plans, /webhook_attempt_delivery_(?:number_idx|number_unique)/u);
    assert.include(plans, "cms_invalidation_mapping_match_idx");
  });

  it("serializes endpoint claims, recovers expiry, and rejects stale finalization tokens", async () => {
    const current = requiredScope();
    const actorResult = await db.execute(sql`select id from "user" order by id limit 1`);
    const actorId = actorResult.rows[0]?.id;
    if (typeof actorId !== "string") throw new Error("M11 worker integration requires a user.");

    const now = new Date("2000-01-01T00:02:00.000Z");
    const eventId = randomUUID();
    const endpointId = randomUUID();
    const destinationId = randomUUID();
    const secretId = randomUUID();
    insertedEventIds.push(eventId);
    insertedEndpointIds.push(endpointId);
    const sequence = (fixtureSequence += 1);
    await db.insert(outboxEvent).values({
      id: eventId,
      ...current,
      eventType: "cms.schema.published",
      subjectType: "cms.collection",
      subjectId: current.collectionId,
      aggregateSequence: sequence,
      payload: {
        version: 1,
        projectId: current.projectId,
        environmentId: current.environmentId,
        collectionId: current.collectionId,
        schemaRevisionId: current.schemaRevisionId,
        sequence,
        schemaHash: "a".repeat(64),
        contractHash: "b".repeat(64),
        changedFieldIds: [],
        invalidationTags: [
          `project:${current.projectId}`,
          `environment:${current.environmentId}`,
          `collection:${current.collectionId}`,
        ],
      },
      occurredAt: now,
      availableAt: now,
      processedAt: null,
    });
    await db.insert(webhookEndpoint).values({
      id: endpointId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      environmentId: current.environmentId,
      name: `lease-${endpointId}`,
      state: "disabled",
      createdByUserId: actorId,
      changedByUserId: actorId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(webhookEndpointDestination).values({
      id: destinationId,
      endpointId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      environmentId: current.environmentId,
      sequence: 1,
      displayOrigin: "https://example.com",
      encryptionKeyId: "integration-key",
      nonce: "A".repeat(16),
      ciphertext: "A".repeat(22),
      keyedFingerprint: "a".repeat(64),
      createdByUserId: actorId,
      createdAt: now,
    });
    await db.insert(webhookEndpointSecret).values({
      id: secretId,
      endpointId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      environmentId: current.environmentId,
      sequence: 1,
      state: "active",
      encryptionKeyId: "integration-key",
      nonce: "A".repeat(16),
      ciphertext: "A".repeat(22),
      fingerprint: "a".repeat(16),
      activatedAt: now,
      createdByUserId: actorId,
      changedByUserId: actorId,
      createdAt: now,
      updatedAt: now,
    });
    await db
      .update(webhookEndpoint)
      .set({
        state: "enabled",
        currentDestinationId: destinationId,
        enabledAt: now,
        updatedAt: now,
      })
      .where(eq(webhookEndpoint.id, endpointId));
    await db.insert(webhookEndpointSubscription).values({
      endpointId,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      environmentId: current.environmentId,
      eventType: "cms.schema.published",
      activeFrom: new Date(now.getTime() - 1_000),
      activeUntil: new Date(now.getTime() + 1_000),
      createdByUserId: actorId,
      closedByUserId: actorId,
      createdAt: new Date(now.getTime() - 1_000),
    });
    const dispatch = await Effect.runPromise(
      makeWebhookWorkerRepository().dispatchBatch(new Date(now.getTime() + 2_000), 1),
    );
    assert.deepStrictEqual(dispatch, {
      claimed: 1,
      projected: 1,
      deliveries: 1,
      internal: 0,
      invalid: 0,
    });
    const [delivery] = await db
      .select()
      .from(webhookDelivery)
      .where(eq(webhookDelivery.eventId, eventId))
      .limit(1);
    if (!delivery) throw new Error("Delivery fixture was not created.");

    const claimAt = new Date(now.getTime() + 2_000);
    const claimResults = await Promise.all([
      Effect.runPromise(makeWebhookWorkerRepository().claimAttempt(claimAt)),
      Effect.runPromise(makeWebhookWorkerRepository().claimAttempt(claimAt)),
    ]);
    const claims = claimResults.flatMap((result) => (result.claim === null ? [] : [result.claim]));
    assert.strictEqual(claims.length, 1);
    const firstClaim = claims[0];
    if (!firstClaim) throw new Error("Parallel claim fixture produced no claim.");
    assert.strictEqual(firstClaim.attemptNumber, 1);
    assert.isFalse(
      await Effect.runPromise(
        makeWebhookWorkerRepository().finalizeAttempt({
          deliveryId: delivery.id,
          endpointId,
          attemptId: firstClaim.attemptId,
          leaseToken: randomUUID(),
          state: "succeeded",
          outcome: "succeeded",
          completedAt: new Date(claimAt.getTime() + 1),
          durationMs: 1,
          httpStatus: 204,
          statusFamily: "2xx",
          retryAfterSeconds: null,
          nextAttemptAt: null,
        }),
      ),
    );

    const recoveryTime = new Date(claimAt.getTime() + 31_000);
    const recovered = await Effect.runPromise(
      makeWebhookWorkerRepository().claimAttempt(recoveryTime),
    );
    assert.isTrue(recovered.recovered);
    assert.strictEqual(recovered.claim?.attemptNumber, 2);
    const secondClaim = recovered.claim;
    if (!secondClaim) throw new Error("Recovered delivery was not reclaimed.");
    assert.isFalse(
      await Effect.runPromise(
        makeWebhookWorkerRepository().finalizeAttempt({
          deliveryId: delivery.id,
          endpointId,
          attemptId: firstClaim.attemptId,
          leaseToken: firstClaim.leaseToken,
          state: "succeeded",
          outcome: "succeeded",
          completedAt: recoveryTime,
          durationMs: 1,
          httpStatus: 204,
          statusFamily: "2xx",
          retryAfterSeconds: null,
          nextAttemptAt: null,
        }),
      ),
    );
    assert.isTrue(
      await Effect.runPromise(
        makeWebhookWorkerRepository().finalizeAttempt({
          deliveryId: delivery.id,
          endpointId,
          attemptId: secondClaim.attemptId,
          leaseToken: secondClaim.leaseToken,
          state: "succeeded",
          outcome: "succeeded",
          completedAt: new Date(recoveryTime.getTime() + 20),
          durationMs: 20,
          httpStatus: 204,
          statusFamily: "2xx",
          retryAfterSeconds: null,
          nextAttemptAt: null,
        }),
      ),
    );
    const attempts = await db
      .select()
      .from(webhookDeliveryAttempt)
      .where(eq(webhookDeliveryAttempt.deliveryId, delivery.id))
      .orderBy(webhookDeliveryAttempt.attemptNumber);
    assert.deepInclude(attempts[0], { state: "abandoned", outcome: "retryable_network" });
    assert.deepInclude(attempts[1], { state: "succeeded", outcome: "succeeded" });

    const idleRepository = makeWebhookWorkerRepository();
    assert.isNull((await Effect.runPromise(idleRepository.claimAttempt(recoveryTime))).claim);
    assert.isNull((await Effect.runPromise(idleRepository.claimAttempt(recoveryTime))).claim);
    assert.isAtLeast(await Effect.runPromise(idleRepository.pendingCount()), 1);
    assert.include(
      await Effect.runPromise(idleRepository.referencedEncryptionKeyIds()),
      "integration-key",
    );
  });

  afterAll(async () => {
    if (insertedEndpointIds.length > 0) {
      await db
        .update(webhookEndpoint)
        .set({
          state: "disabled",
          currentDestinationId: null,
          enabledAt: null,
          disabledAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(inArray(webhookEndpoint.id, insertedEndpointIds));
      await db
        .delete(webhookDeliveryAttempt)
        .where(inArray(webhookDeliveryAttempt.endpointId, insertedEndpointIds));
      await db
        .delete(webhookDelivery)
        .where(inArray(webhookDelivery.endpointId, insertedEndpointIds));
      await db
        .delete(webhookEndpointSubscription)
        .where(inArray(webhookEndpointSubscription.endpointId, insertedEndpointIds));
      await db
        .delete(webhookEndpointSecret)
        .where(inArray(webhookEndpointSecret.endpointId, insertedEndpointIds));
      await db
        .delete(webhookEndpointDestination)
        .where(inArray(webhookEndpointDestination.endpointId, insertedEndpointIds));
      await db.delete(webhookEndpoint).where(inArray(webhookEndpoint.id, insertedEndpointIds));
    }
    if (insertedEventIds.length === 0) return;
    await db.delete(publicationEvent).where(inArray(publicationEvent.eventId, insertedEventIds));
    await db.delete(outboxEvent).where(inArray(outboxEvent.id, insertedEventIds));
  });
});
