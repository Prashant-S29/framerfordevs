// Covers authorized M11 management lifecycles and optimistic tenant-scoped persistence.

import { randomUUID } from "node:crypto";

import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { db } from "@framerfordevs/db";
import { eq, inArray, sql } from "@framerfordevs/db/query";
import { auditEvent } from "@framerfordevs/db/schema/platform";
import {
  cmsInvalidationRouteMapping,
  publicationEvent,
  webhookDelivery,
  webhookDeliveryAttempt,
  webhookEndpoint,
  webhookEndpointDestination,
  webhookEndpointSecret,
  webhookEndpointSubscription,
} from "@framerfordevs/db/schema/webhooks";
import { Effect, Schema } from "effect";

import { AuthUserId } from "../../../../src/contracts/platform";
import {
  ChangeWebhookSecretRotationInput,
  CreateInvalidationRouteMappingInput,
  CreateWebhookEndpointInput,
  ListInvalidationRouteMappingsInput,
  ListWebhookAttemptsInput,
  ListWebhookDeliveriesInput,
  ListWebhookEndpointsInput,
  ReplayWebhookEventInput,
  ReplaceWebhookSubscriptionsInput,
  SetInvalidationRouteMappingStateInput,
  SetWebhookEndpointStateInput,
  UpdateInvalidationRouteMappingInput,
  UpdateWebhookEndpointInput,
} from "../../../../src/contracts/webhook";
import { makeWebhookRepository } from "../../../../src/services/webhook/repository";

interface FixtureScope {
  readonly actorId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
}

let scope: FixtureScope | undefined;
const resourceIds: Array<string> = [];
const endpointIds: Array<string> = [];
const mappingIds: Array<string> = [];
const deliveryIds: Array<string> = [];

function fixture(): FixtureScope {
  if (!scope) throw new Error("Webhook management integration requires an owner project fixture.");
  return scope;
}

const ciphertext = {
  encryptionKeyId: "integration-key",
  nonce: "A".repeat(16),
  ciphertext: "A".repeat(22),
};

describe("Webhook repository PostgreSQL integration", () => {
  beforeAll(async () => {
    const result = await db.execute(sql`select
      pm.user_id as "actorId",
      p.workspace_id as "workspaceId",
      p.id as "projectId",
      e.id as "environmentId",
      c.id as "collectionId"
      from project_membership pm
      join project p on p.id = pm.project_id
      join environment e on e.project_id = p.id and e.workspace_id = p.workspace_id
      join cms_collection c on c.environment_id = e.id and c.project_id = p.id and c.workspace_id = p.workspace_id
      where pm.role = 'owner' and pm.removed_at is null and p.archived_at is null
      order by p.id, c.id
      limit 1`);
    const row = result.rows[0];
    if (
      row &&
      typeof row.actorId === "string" &&
      typeof row.workspaceId === "string" &&
      typeof row.projectId === "string" &&
      typeof row.environmentId === "string" &&
      typeof row.collectionId === "string"
    ) {
      scope = {
        actorId: row.actorId,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        environmentId: row.environmentId,
        collectionId: row.collectionId,
      };
    }
  });

  it("creates, updates, rotates, disables, and lists only masked endpoint authority", async () => {
    const current = fixture();
    const actorId = Schema.decodeUnknownSync(AuthUserId)(current.actorId);
    const endpointId = randomUUID();
    const destinationId = randomUUID();
    const replacementDestinationId = randomUUID();
    const secretId = randomUUID();
    const pendingSecretId = randomUUID();
    endpointIds.push(endpointId);
    resourceIds.push(endpointId);
    const repository = makeWebhookRepository();
    const createdAt = new Date("2026-08-13T00:00:00.000Z");
    const input = Schema.decodeUnknownSync(CreateWebhookEndpointInput)({
      projectId: current.projectId,
      environmentId: current.environmentId,
      name: `Integration receiver ${endpointId.slice(0, 8)}`,
      destination: "https://hooks.example.test/secret-path",
      subscriptions: ["cms.schema.published", "cms.entry.published"],
      authorityAcknowledged: true,
    });
    const created = await Effect.runPromise(
      repository.createEndpoint(
        actorId,
        input,
        {
          endpointId,
          destinationId,
          secretId,
          displayOrigin: "https://hooks.example.test",
          destination: ciphertext,
          destinationFingerprint: "a".repeat(64),
          secret: ciphertext,
          secretFingerprint: "a".repeat(16),
        },
        createdAt,
        `webhook.create.${endpointId}`,
      ),
    );
    assert.strictEqual(created.destinationOrigin, "https://hooks.example.test");
    assert.notInclude(JSON.stringify(created), "secret-path");

    const updated = await Effect.runPromise(
      repository.updateEndpoint(
        actorId,
        Schema.decodeUnknownSync(UpdateWebhookEndpointInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          endpointId,
          expectedVersion: 1,
          name: `Updated receiver ${endpointId.slice(0, 8)}`,
          destination: "https://next.example.test/new-secret-path",
        }),
        {
          destinationId: replacementDestinationId,
          displayOrigin: "https://next.example.test",
          destination: ciphertext,
          destinationFingerprint: "b".repeat(64),
        },
        new Date("2026-08-13T00:01:00.000Z"),
        `webhook.update.${endpointId}`,
      ),
    );
    assert.strictEqual(updated.version, 2);
    assert.strictEqual(updated.destinationOrigin, "https://next.example.test");

    const subscribed = await Effect.runPromise(
      repository.replaceSubscriptions(
        actorId,
        Schema.decodeUnknownSync(ReplaceWebhookSubscriptionsInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          endpointId,
          expectedVersion: 2,
          subscriptions: ["cms.entry.unpublished"],
        }),
        new Date("2026-08-13T00:02:00.000Z"),
        `webhook.subscriptions.${endpointId}`,
      ),
    );
    assert.deepStrictEqual(subscribed.subscriptions, ["cms.entry.unpublished"]);

    assert.isTrue(
      await Effect.runPromise(
        repository.startSecretRotation(
          actorId,
          {
            projectId: current.projectId,
            environmentId: current.environmentId,
            endpointId,
            expectedVersion: 3,
          },
          {
            secretId: pendingSecretId,
            secret: ciphertext,
            secretFingerprint: "b".repeat(16),
          },
          new Date("2026-08-13T00:03:00.000Z"),
          `webhook.rotation.start.${endpointId}`,
        ),
      ),
    );
    const pendingPage = await Effect.runPromise(
      repository.listEndpoints(
        actorId,
        Schema.decodeUnknownSync(ListWebhookEndpointsInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          cursor: null,
          limit: 50,
        }),
      ),
    );
    assert.strictEqual(
      pendingPage.items.find((endpoint) => endpoint.id === endpointId)?.rotationState,
      "pending",
    );
    const activated = await Effect.runPromise(
      repository.changeSecretRotation(
        actorId,
        Schema.decodeUnknownSync(ChangeWebhookSecretRotationInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          endpointId,
          expectedVersion: 4,
          action: "activate",
        }),
        new Date("2026-08-13T00:04:00.000Z"),
        `webhook.rotation.activate.${endpointId}`,
      ),
    );
    assert.strictEqual(activated.version, 5);
    const activatedPage = await Effect.runPromise(
      repository.listEndpoints(
        actorId,
        Schema.decodeUnknownSync(ListWebhookEndpointsInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          cursor: null,
          limit: 50,
        }),
      ),
    );
    const activatedSummary = activatedPage.items.find((endpoint) => endpoint.id === endpointId);
    assert.strictEqual(activatedSummary?.rotationState, "retiring");
    assert.strictEqual(activatedSummary?.rotationEndsAt, "2026-08-14T00:04:00.000Z");
    assert.strictEqual(activatedSummary?.lastOutcome, null);
    assert.strictEqual(activatedSummary?.deadLetterCount, 0);
    await Effect.runPromise(
      repository.changeSecretRotation(
        actorId,
        Schema.decodeUnknownSync(ChangeWebhookSecretRotationInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          endpointId,
          expectedVersion: 5,
          action: "complete",
        }),
        new Date("2026-08-14T00:05:00.000Z"),
        `webhook.rotation.complete.${endpointId}`,
      ),
    );

    const [storedEvent] = await db
      .select({ id: publicationEvent.eventId })
      .from(publicationEvent)
      .where(eq(publicationEvent.environmentId, current.environmentId))
      .limit(1);
    if (!storedEvent) throw new Error("Webhook replay integration requires a canonical event.");
    const firstCommandId = randomUUID();
    const replayInput = Schema.decodeUnknownSync(ReplayWebhookEventInput)({
      projectId: current.projectId,
      environmentId: current.environmentId,
      endpointId,
      eventId: storedEvent.id,
      sourceDeliveryId: null,
      commandId: firstCommandId,
    });
    const replay = await Effect.runPromise(
      repository.replayEvent(
        actorId,
        replayInput,
        "c".repeat(64),
        new Date("2026-08-14T00:05:10.000Z"),
        `webhook.replay.${endpointId}`,
      ),
    );
    deliveryIds.push(replay.id);
    resourceIds.push(replay.id);
    const repeated = await Effect.runPromise(
      repository.replayEvent(
        actorId,
        replayInput,
        "c".repeat(64),
        new Date("2026-08-14T00:05:11.000Z"),
        `webhook.replay.repeat.${endpointId}`,
      ),
    );
    assert.strictEqual(repeated.id, replay.id);
    const conflict = await Effect.exit(
      repository.replayEvent(
        actorId,
        replayInput,
        "d".repeat(64),
        new Date("2026-08-14T00:05:12.000Z"),
        `webhook.replay.conflict.${endpointId}`,
      ),
    ).pipe(Effect.runPromise);
    assert.isTrue(conflict._tag === "Failure");
    const secondReplay = await Effect.runPromise(
      repository.replayEvent(
        actorId,
        Schema.decodeUnknownSync(ReplayWebhookEventInput)({
          ...replayInput,
          commandId: randomUUID(),
        }),
        "e".repeat(64),
        new Date("2026-08-14T00:05:20.000Z"),
        `webhook.replay.second.${endpointId}`,
      ),
    );
    deliveryIds.push(secondReplay.id);
    resourceIds.push(secondReplay.id);
    const firstDeliveryPage = await Effect.runPromise(
      repository.listDeliveries(
        actorId,
        Schema.decodeUnknownSync(ListWebhookDeliveriesInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          endpointId,
          eventType: null,
          status: null,
          cursor: null,
          limit: 1,
        }),
      ),
    );
    const firstListedDelivery = firstDeliveryPage.items[0];
    if (!firstListedDelivery) throw new Error("First replay delivery was not listed.");
    assert.strictEqual(firstListedDelivery.id, secondReplay.id);
    assert.strictEqual(firstListedDelivery.event.id, storedEvent.id);
    assert.isTrue(firstListedDelivery.event.time.length > 0);
    if (firstDeliveryPage.nextCursor === null) throw new Error("Delivery cursor was not returned.");
    const secondDeliveryPage = await Effect.runPromise(
      repository.listDeliveries(
        actorId,
        Schema.decodeUnknownSync(ListWebhookDeliveriesInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          endpointId,
          eventType: null,
          status: null,
          cursor: firstDeliveryPage.nextCursor,
          limit: 1,
        }),
      ),
    );
    assert.strictEqual(secondDeliveryPage.items[0]?.id, replay.id);
    const attempts = await Effect.runPromise(
      repository.listAttempts(
        actorId,
        Schema.decodeUnknownSync(ListWebhookAttemptsInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          deliveryId: replay.id,
          cursor: null,
          limit: 25,
        }),
      ),
    );
    assert.deepStrictEqual(attempts.items, []);

    const disabled = await Effect.runPromise(
      repository.setEndpointState(
        actorId,
        Schema.decodeUnknownSync(SetWebhookEndpointStateInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          endpointId,
          expectedVersion: 6,
          state: "disabled",
        }),
        new Date("2026-08-14T00:06:00.000Z"),
        `webhook.disable.${endpointId}`,
      ),
    );
    assert.strictEqual(disabled.state, "disabled");
    assert.deepStrictEqual(disabled.subscriptions, ["cms.entry.unpublished"]);
    const canceled = await db
      .select({ status: webhookDelivery.status, outcome: webhookDelivery.lastOutcome })
      .from(webhookDelivery)
      .where(inArray(webhookDelivery.id, deliveryIds));
    assert.deepStrictEqual(canceled, [
      { status: "canceled", outcome: null },
      { status: "canceled", outcome: null },
    ]);
    const blockedReplay = await Effect.runPromise(
      Effect.exit(
        repository.replayEvent(
          actorId,
          Schema.decodeUnknownSync(ReplayWebhookEventInput)({
            ...replayInput,
            commandId: randomUUID(),
          }),
          "f".repeat(64),
          new Date("2026-08-14T00:06:10.000Z"),
          `webhook.replay.disabled.${endpointId}`,
        ),
      ),
    );
    assert.isTrue(blockedReplay._tag === "Failure");

    const retired = await db
      .select({ state: webhookEndpointSecret.state, ciphertext: webhookEndpointSecret.ciphertext })
      .from(webhookEndpointSecret)
      .where(eq(webhookEndpointSecret.endpointId, endpointId));
    assert.includeDeepMembers(retired, [{ state: "retired", ciphertext: null }]);
  });

  it("updates and disables bounded collection-level invalidation mappings optimistically", async () => {
    const current = fixture();
    const actorId = Schema.decodeUnknownSync(AuthUserId)(current.actorId);
    const repository = makeWebhookRepository();
    const created = await Effect.runPromise(
      repository.createMapping(
        actorId,
        Schema.decodeUnknownSync(CreateInvalidationRouteMappingInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          collectionId: current.collectionId,
          entryId: null,
          localeId: null,
          name: "Article route",
          eventTypes: ["cms.schema.published", "cms.entry.published"],
          route: "/articles",
          semanticTags: ["content:article"],
        }),
        new Date("2026-08-13T01:00:00.000Z"),
        `mapping.create.${current.collectionId}`,
      ),
    );
    mappingIds.push(created.id);
    resourceIds.push(created.id);
    const second = await Effect.runPromise(
      repository.createMapping(
        actorId,
        Schema.decodeUnknownSync(CreateInvalidationRouteMappingInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          collectionId: current.collectionId,
          entryId: null,
          localeId: null,
          name: "Archive route",
          eventTypes: ["cms.entry.unpublished"],
          route: "/articles/archive",
          semanticTags: [],
        }),
        new Date("2026-08-13T01:00:01.000Z"),
        `mapping.create.second.${current.collectionId}`,
      ),
    );
    mappingIds.push(second.id);
    resourceIds.push(second.id);
    const firstPage = await Effect.runPromise(
      repository.listMappings(
        actorId,
        Schema.decodeUnknownSync(ListInvalidationRouteMappingsInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          cursor: null,
          limit: 1,
        }),
      ),
    );
    assert.strictEqual(firstPage.items[0]?.id, second.id);
    assert.isNotNull(firstPage.nextCursor);
    if (firstPage.nextCursor === null) throw new Error("Mapping cursor was not returned.");
    const secondPage = await Effect.runPromise(
      repository.listMappings(
        actorId,
        Schema.decodeUnknownSync(ListInvalidationRouteMappingsInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          cursor: firstPage.nextCursor,
          limit: 1,
        }),
      ),
    );
    assert.strictEqual(secondPage.items[0]?.id, created.id);
    const updated = await Effect.runPromise(
      repository.updateMapping(
        actorId,
        Schema.decodeUnknownSync(UpdateInvalidationRouteMappingInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          mappingId: created.id,
          expectedVersion: 1,
          collectionId: current.collectionId,
          entryId: null,
          localeId: null,
          name: "Updated article route",
          eventTypes: ["cms.entry.published", "cms.entry.unpublished"],
          route: "/articles/latest",
          semanticTags: ["content:latest"],
        }),
        new Date("2026-08-13T01:01:00.000Z"),
        `mapping.update.${created.id}`,
      ),
    );
    assert.strictEqual(updated.version, 2);
    const disabled = await Effect.runPromise(
      repository.setMappingState(
        actorId,
        Schema.decodeUnknownSync(SetInvalidationRouteMappingStateInput)({
          projectId: current.projectId,
          environmentId: current.environmentId,
          mappingId: created.id,
          expectedVersion: 2,
          state: "disabled",
        }),
        new Date("2026-08-13T01:02:00.000Z"),
        `mapping.disable.${created.id}`,
      ),
    );
    assert.strictEqual(disabled.state, "disabled");
    assert.strictEqual(disabled.version, 3);
  });

  afterAll(async () => {
    if (resourceIds.length > 0)
      await db.delete(auditEvent).where(inArray(auditEvent.resourceId, resourceIds));
    if (mappingIds.length > 0)
      await db
        .delete(cmsInvalidationRouteMapping)
        .where(inArray(cmsInvalidationRouteMapping.id, mappingIds));
    if (deliveryIds.length > 0) {
      await db
        .delete(webhookDeliveryAttempt)
        .where(inArray(webhookDeliveryAttempt.deliveryId, deliveryIds));
      await db.delete(webhookDelivery).where(inArray(webhookDelivery.id, deliveryIds));
    }
    if (endpointIds.length > 0) {
      await db
        .update(webhookEndpoint)
        .set({
          state: "disabled",
          currentDestinationId: null,
          disabledAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(inArray(webhookEndpoint.id, endpointIds));
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
  });
});
