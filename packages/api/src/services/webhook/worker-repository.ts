// Atomically expands outbox rows and guards webhook delivery claims/finalization with leases.

import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, eq, gt, inArray, isNull, lt, lte, or, sql } from "@framerfordevs/db/query";
import {
  cmsSchemaRevision,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import {
  publicationEvent,
  webhookDelivery,
  webhookDeliveryAttempt,
  webhookEndpoint,
  webhookEndpointDestination,
  webhookEndpointSecret,
  webhookEndpointSubscription,
} from "@framerfordevs/db/schema/webhooks";
import { Context, Effect, Layer, Schema } from "effect";

import { DatabaseFailure, WebhookEventInvalidFailure } from "../../contracts/response/errors";
import type { WebhookAttemptOutcome } from "../../lib/webhook/retry";
import {
  projectPublicationEvent,
  type ProjectedPublicationEvent,
} from "../../lib/publication/event";
import { reconstructFieldTree } from "../../lib/field/tree";
import { CollectionFieldDefinition, defaultFieldEditorMetadata } from "../../contracts/schema";
import { hashSchemaContract } from "../schema/engine";
import type { ApplicationDb } from "../project-access";

const externalTypes = [
  "cms.schema.published",
  "cms.entry.published",
  "cms.entry.unpublished",
] as const;
const internalTypes = ["cms.collection.delivery_config.updated"] as const;
const knownTypes = [...externalTypes, ...internalTypes];
const knownTypeSet = new Set<string>(knownTypes);
const externalTypeSet = new Set<string>(externalTypes);
const internalTypeSet = new Set<string>(internalTypes);

function revisionFieldValue(row: typeof cmsSchemaRevisionField.$inferSelect) {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id: row.fieldId,
    parentFieldId: row.parentFieldId,
    nodeRole: row.nodeRole,
    apiKey: row.apiKey,
    displayLabel: row.displayLabel,
    kind: row.kind,
    required: row.required,
    localization: row.localization,
    deprecated: row.deprecated,
    position: row.position,
    editor:
      Object.keys(row.editorMetadata).length === 0
        ? defaultFieldEditorMetadata
        : row.editorMetadata,
    configuration: row.configuration,
    children: [],
  });
}

async function withLegacySchemaContract(
  transaction: Parameters<Parameters<ApplicationDb["transaction"]>[0]>[0],
  row: typeof outboxEvent.$inferSelect,
) {
  if (
    row.eventType !== "cms.schema.published" ||
    typeof row.payload.contractHash === "string" ||
    row.schemaRevisionId === null
  ) {
    return row;
  }
  const [revision] = await transaction
    .select()
    .from(cmsSchemaRevision)
    .where(
      and(
        eq(cmsSchemaRevision.id, row.schemaRevisionId),
        eq(cmsSchemaRevision.workspaceId, row.workspaceId),
        eq(cmsSchemaRevision.projectId, row.projectId),
        eq(cmsSchemaRevision.environmentId, row.environmentId),
        eq(cmsSchemaRevision.collectionId, row.subjectId),
      ),
    )
    .limit(1);
  if (!revision) return row;
  const fieldRows = await transaction
    .select()
    .from(cmsSchemaRevisionField)
    .where(
      and(
        eq(cmsSchemaRevisionField.revisionId, revision.id),
        eq(cmsSchemaRevisionField.workspaceId, row.workspaceId),
        eq(cmsSchemaRevisionField.projectId, row.projectId),
        eq(cmsSchemaRevisionField.environmentId, row.environmentId),
        eq(cmsSchemaRevisionField.collectionId, row.subjectId),
      ),
    )
    .orderBy(
      cmsSchemaRevisionField.parentFieldId,
      cmsSchemaRevisionField.position,
      cmsSchemaRevisionField.fieldId,
    );
  const tree = reconstructFieldTree(fieldRows.map(revisionFieldValue));
  if (!tree.valid) return row;
  return {
    ...row,
    payload: {
      ...row.payload,
      schemaHash: revision.schemaHash,
      contractHash: hashSchemaContract({
        formatVersion: revision.formatVersion,
        validationProfile: revision.validationProfile,
        currencyRegistryProfile: revision.currencyRegistryProfile,
        collectionApiKey: revision.collectionApiKey,
        fields: tree.roots,
      }),
    },
  };
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

export interface WebhookDispatchBatchResult {
  readonly claimed: number;
  readonly projected: number;
  readonly deliveries: number;
  readonly internal: number;
  readonly invalid: number;
}

export interface ClaimedWebhookAttempt {
  readonly leaseToken: string;
  readonly leaseExpiresAt: Date;
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly requestTimestamp: number;
  readonly delivery: typeof webhookDelivery.$inferSelect;
  readonly endpoint: typeof webhookEndpoint.$inferSelect;
  readonly event: typeof publicationEvent.$inferSelect;
  readonly destination: typeof webhookEndpointDestination.$inferSelect;
  readonly secrets: ReadonlyArray<typeof webhookEndpointSecret.$inferSelect>;
}

export interface FinalizeWebhookAttemptInput {
  readonly deliveryId: string;
  readonly endpointId: string;
  readonly attemptId: string;
  readonly leaseToken: string;
  readonly state: "succeeded" | "retry_scheduled" | "dead_letter";
  readonly outcome: WebhookAttemptOutcome;
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly httpStatus: number | null;
  readonly statusFamily: "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | null;
  readonly retryAfterSeconds: number | null;
  readonly nextAttemptAt: Date | null;
}

export function makeWebhookWorkerRepository(database: ApplicationDb = db) {
  let nextLeaseRecoveryAtMs = 0;
  return {
    dispatchBatch: Effect.fn("WebhookWorkerRepository.dispatchBatch")(function* (
      now: Date,
      batchSize = 100,
    ) {
      return yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction): Promise<WebhookDispatchBatchResult> => {
            const rows = await transaction
              .select()
              .from(outboxEvent)
              .where(
                and(
                  isNull(outboxEvent.processedAt),
                  lte(outboxEvent.availableAt, now),
                  lt(outboxEvent.attemptCount, 12),
                  inArray(outboxEvent.eventType, [...knownTypes]),
                ),
              )
              .orderBy(outboxEvent.availableAt, outboxEvent.id)
              .limit(Math.min(Math.max(batchSize, 1), 100))
              .for("update", { skipLocked: true });

            const projectedRows: Array<{
              readonly row: typeof outboxEvent.$inferSelect;
              readonly event: ProjectedPublicationEvent;
            }> = [];
            let internal = 0;
            let invalid = 0;
            const invalidIds = new Set<string>();
            for (const row of rows) {
              if (!knownTypeSet.has(row.eventType)) throw WebhookEventInvalidFailure.make();
              if (internalTypeSet.has(row.eventType)) {
                internal += 1;
                continue;
              }
              if (!externalTypeSet.has(row.eventType)) throw WebhookEventInvalidFailure.make();
              const result = projectPublicationEvent(
                await withLegacySchemaContract(transaction, row),
              );
              if (!result.ok) {
                invalid += 1;
                invalidIds.add(row.id);
                const delayMs = Math.min(24 * 60 * 60 * 1_000, 30_000 * 2 ** row.attemptCount);
                await transaction
                  .update(outboxEvent)
                  .set({
                    attemptCount: row.attemptCount + 1,
                    availableAt: new Date(now.getTime() + delayMs),
                  })
                  .where(and(eq(outboxEvent.id, row.id), isNull(outboxEvent.processedAt)));
                continue;
              }
              projectedRows.push({ row, event: result.value });
            }

            if (projectedRows.length > 0) {
              await transaction
                .insert(publicationEvent)
                .values(
                  projectedRows.map(({ row, event }) => ({
                    eventId: row.id,
                    workspaceId: row.workspaceId,
                    projectId: row.projectId,
                    environmentId: row.environmentId,
                    eventType: row.eventType,
                    envelopeVersion: 1,
                    canonicalBody: event.canonicalBody,
                    bodyHash: event.bodyHash,
                    bodyBytes: event.bodyBytes,
                    occurredAt: row.occurredAt,
                    projectedAt: now,
                  })),
                )
                .onConflictDoNothing({ target: publicationEvent.eventId });
            }

            const deliveryValues: Array<typeof webhookDelivery.$inferInsert> = [];
            if (projectedRows.length > 0) {
              const environmentIds = [
                ...new Set(projectedRows.map(({ row }) => row.environmentId)),
              ];
              const occurredTimes = projectedRows.map(({ row }) => row.occurredAt.getTime());
              const earliestOccurredAt = new Date(Math.min(...occurredTimes));
              const latestOccurredAt = new Date(Math.max(...occurredTimes));
              const subscriptions = await transaction
                .select({
                  endpointId: webhookEndpoint.id,
                  destinationId: webhookEndpoint.currentDestinationId,
                  workspaceId: webhookEndpoint.workspaceId,
                  projectId: webhookEndpoint.projectId,
                  environmentId: webhookEndpoint.environmentId,
                  enabledAt: webhookEndpoint.enabledAt,
                  eventType: webhookEndpointSubscription.eventType,
                  activeFrom: webhookEndpointSubscription.activeFrom,
                  activeUntil: webhookEndpointSubscription.activeUntil,
                })
                .from(webhookEndpoint)
                .innerJoin(
                  webhookEndpointSubscription,
                  and(
                    eq(webhookEndpointSubscription.endpointId, webhookEndpoint.id),
                    eq(webhookEndpointSubscription.environmentId, webhookEndpoint.environmentId),
                    eq(webhookEndpointSubscription.projectId, webhookEndpoint.projectId),
                    eq(webhookEndpointSubscription.workspaceId, webhookEndpoint.workspaceId),
                  ),
                )
                .where(
                  and(
                    inArray(webhookEndpoint.environmentId, environmentIds),
                    eq(webhookEndpoint.state, "enabled"),
                    lte(webhookEndpoint.enabledAt, latestOccurredAt),
                    lte(webhookEndpointSubscription.activeFrom, latestOccurredAt),
                    or(
                      isNull(webhookEndpointSubscription.activeUntil),
                      gt(webhookEndpointSubscription.activeUntil, earliestOccurredAt),
                    ),
                  ),
                )
                .orderBy(webhookEndpoint.id, webhookEndpointSubscription.activeFrom);
              const deliveryKeys = new Set<string>();
              for (const { row } of projectedRows) {
                for (const subscription of subscriptions) {
                  const eligible =
                    subscription.destinationId !== null &&
                    subscription.enabledAt !== null &&
                    subscription.workspaceId === row.workspaceId &&
                    subscription.projectId === row.projectId &&
                    subscription.environmentId === row.environmentId &&
                    subscription.eventType === row.eventType &&
                    subscription.enabledAt <= row.occurredAt &&
                    subscription.activeFrom <= row.occurredAt &&
                    (subscription.activeUntil === null ||
                      subscription.activeUntil > row.occurredAt);
                  const key = `${row.id}:${subscription.endpointId}`;
                  if (!eligible || deliveryKeys.has(key) || subscription.destinationId === null)
                    continue;
                  deliveryKeys.add(key);
                  deliveryValues.push({
                    eventId: row.id,
                    endpointId: subscription.endpointId,
                    destinationId: subscription.destinationId,
                    workspaceId: row.workspaceId,
                    projectId: row.projectId,
                    environmentId: row.environmentId,
                    kind: "initial",
                    status: "queued",
                    nextAttemptAt: now,
                    createdAt: now,
                    updatedAt: now,
                  });
                }
              }
            }
            let deliveries = 0;
            if (deliveryValues.length > 0) {
              const inserted = await transaction
                .insert(webhookDelivery)
                .values(deliveryValues)
                .onConflictDoNothing()
                .returning({ id: webhookDelivery.id });
              deliveries = inserted.length;
            }
            const processedIds = rows.filter((row) => !invalidIds.has(row.id)).map((row) => row.id);
            if (processedIds.length > 0) {
              await transaction
                .update(outboxEvent)
                .set({ processedAt: now })
                .where(and(inArray(outboxEvent.id, processedIds), isNull(outboxEvent.processedAt)));
            }
            return {
              claimed: rows.length,
              projected: projectedRows.length,
              deliveries,
              internal,
              invalid,
            };
          }),
        catch: (cause) => {
          if (cause instanceof WebhookEventInvalidFailure) return cause;
          return databaseFailure("webhook.worker.dispatch", cause);
        },
      });
    }),

    claimAttempt: Effect.fn("WebhookWorkerRepository.claimAttempt")(function* (now: Date) {
      const shouldRecover = now.getTime() >= nextLeaseRecoveryAtMs;
      if (shouldRecover) nextLeaseRecoveryAtMs = now.getTime() + 1_000;
      const recovered = shouldRecover
        ? yield* Effect.tryPromise({
            try: () =>
              database.transaction(async (transaction): Promise<boolean> => {
                const expired = await transaction
                  .select({ delivery: webhookDelivery })
                  .from(webhookDelivery)
                  .where(
                    and(
                      eq(webhookDelivery.status, "delivering"),
                      lte(webhookDelivery.leaseExpiresAt, now),
                    ),
                  )
                  .orderBy(webhookDelivery.leaseExpiresAt, webhookDelivery.id)
                  .limit(1)
                  .for("update", { skipLocked: true });
                const stale = expired[0]?.delivery;
                if (stale) {
                  if (stale.leaseToken === null) {
                    throw new Error("Expired webhook delivery is missing its lease token.");
                  }
                  await transaction
                    .update(webhookDeliveryAttempt)
                    .set({
                      state: "abandoned",
                      completedAt: now,
                      durationMs: 0,
                      outcome: "retryable_network",
                      nextAttemptAt: null,
                    })
                    .where(
                      and(
                        eq(webhookDeliveryAttempt.deliveryId, stale.id),
                        eq(webhookDeliveryAttempt.state, "started"),
                      ),
                    );
                  await transaction
                    .update(webhookDelivery)
                    .set({
                      status: "retry_scheduled",
                      nextAttemptAt: now,
                      leaseToken: null,
                      leaseExpiresAt: null,
                      lastOutcome: "retryable_network",
                      updatedAt: now,
                    })
                    .where(eq(webhookDelivery.id, stale.id));
                  await transaction
                    .update(webhookEndpoint)
                    .set({ leaseToken: null, leaseExpiresAt: null })
                    .where(
                      and(
                        eq(webhookEndpoint.id, stale.endpointId),
                        eq(webhookEndpoint.leaseToken, stale.leaseToken),
                      ),
                    );
                }
                return stale !== undefined;
              }),
            catch: (cause) => databaseFailure("webhook.worker.recover", cause),
          })
        : false;
      const claim = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction): Promise<ClaimedWebhookAttempt | null> => {
            const [candidate] = await transaction
              .select({
                endpoint: webhookEndpoint,
                delivery: webhookDelivery,
                event: publicationEvent,
                destination: webhookEndpointDestination,
              })
              .from(webhookEndpoint)
              .innerJoin(
                webhookDelivery,
                and(
                  eq(webhookDelivery.endpointId, webhookEndpoint.id),
                  eq(webhookDelivery.environmentId, webhookEndpoint.environmentId),
                  eq(webhookDelivery.projectId, webhookEndpoint.projectId),
                  eq(webhookDelivery.workspaceId, webhookEndpoint.workspaceId),
                ),
              )
              .innerJoin(
                publicationEvent,
                and(
                  eq(publicationEvent.eventId, webhookDelivery.eventId),
                  eq(publicationEvent.environmentId, webhookDelivery.environmentId),
                  eq(publicationEvent.projectId, webhookDelivery.projectId),
                  eq(publicationEvent.workspaceId, webhookDelivery.workspaceId),
                ),
              )
              .innerJoin(
                webhookEndpointDestination,
                and(
                  eq(webhookEndpointDestination.id, webhookDelivery.destinationId),
                  eq(webhookEndpointDestination.endpointId, webhookDelivery.endpointId),
                  eq(webhookEndpointDestination.environmentId, webhookDelivery.environmentId),
                  eq(webhookEndpointDestination.projectId, webhookDelivery.projectId),
                  eq(webhookEndpointDestination.workspaceId, webhookDelivery.workspaceId),
                ),
              )
              .where(
                and(
                  eq(webhookEndpoint.state, "enabled"),
                  or(
                    isNull(webhookEndpoint.leaseExpiresAt),
                    lte(webhookEndpoint.leaseExpiresAt, now),
                  ),
                  inArray(webhookDelivery.status, ["queued", "retry_scheduled"]),
                  lte(webhookDelivery.nextAttemptAt, now),
                ),
              )
              .orderBy(webhookDelivery.nextAttemptAt, webhookDelivery.id)
              .limit(1)
              .for("update", { skipLocked: true });
            if (!candidate || candidate.endpoint.currentDestinationId === null) return null;

            const secrets = await transaction
              .select()
              .from(webhookEndpointSecret)
              .where(
                and(
                  eq(webhookEndpointSecret.endpointId, candidate.endpoint.id),
                  or(
                    eq(webhookEndpointSecret.state, "active"),
                    and(
                      eq(webhookEndpointSecret.state, "retiring"),
                      sql`${webhookEndpointSecret.retireAt} > ${now}`,
                    ),
                  ),
                ),
              )
              .orderBy(webhookEndpointSecret.sequence);
            if (secrets.length < 1 || secrets.length > 2) {
              throw new Error("Claimed webhook authority is incomplete.");
            }

            const leaseToken = randomUUID();
            const leaseExpiresAt = new Date(now.getTime() + 30_000);
            const attemptId = randomUUID();
            const attemptNumber = candidate.delivery.attemptCount + 1;
            const requestTimestamp = Math.floor(now.getTime() / 1_000);
            await transaction
              .update(webhookEndpoint)
              .set({ leaseToken, leaseExpiresAt })
              .where(eq(webhookEndpoint.id, candidate.endpoint.id));
            const [claimedDelivery] = await transaction
              .update(webhookDelivery)
              .set({
                status: "delivering",
                attemptCount: attemptNumber,
                nextAttemptAt: null,
                lastOutcome: "attempt_started",
                leaseToken,
                leaseExpiresAt,
                updatedAt: now,
              })
              .where(
                and(
                  eq(webhookDelivery.id, candidate.delivery.id),
                  inArray(webhookDelivery.status, ["queued", "retry_scheduled"]),
                ),
              )
              .returning();
            if (!claimedDelivery) throw new Error("Webhook delivery claim was lost.");
            await transaction.insert(webhookDeliveryAttempt).values({
              id: attemptId,
              deliveryId: claimedDelivery.id,
              eventId: claimedDelivery.eventId,
              endpointId: claimedDelivery.endpointId,
              workspaceId: claimedDelivery.workspaceId,
              projectId: claimedDelivery.projectId,
              environmentId: claimedDelivery.environmentId,
              attemptNumber,
              state: "started",
              signingSecretIds: secrets.map((secret) => secret.id),
              requestTimestamp,
              startedAt: now,
            });
            return {
              leaseToken,
              leaseExpiresAt,
              attemptId,
              attemptNumber,
              requestTimestamp,
              delivery: claimedDelivery,
              endpoint: candidate.endpoint,
              event: candidate.event,
              destination: candidate.destination,
              secrets,
            };
          }),
        catch: (cause) => databaseFailure("webhook.worker.claim", cause),
      });
      return { claim, recovered };
    }),

    finalizeAttempt: Effect.fn("WebhookWorkerRepository.finalizeAttempt")(function* (
      input: FinalizeWebhookAttemptInput,
    ) {
      return yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [delivery] = await transaction
              .select()
              .from(webhookDelivery)
              .where(eq(webhookDelivery.id, input.deliveryId))
              .limit(1)
              .for("update");
            if (
              !delivery ||
              delivery.endpointId !== input.endpointId ||
              delivery.status !== "delivering" ||
              delivery.leaseToken !== input.leaseToken
            ) {
              return false;
            }
            const finalizedAttempts = await transaction
              .update(webhookDeliveryAttempt)
              .set({
                state: input.state,
                completedAt: input.completedAt,
                durationMs: Math.max(0, Math.floor(input.durationMs)),
                httpStatus: input.httpStatus,
                statusFamily: input.statusFamily,
                outcome: input.outcome,
                retryAfterSeconds: input.retryAfterSeconds,
                nextAttemptAt: input.nextAttemptAt,
              })
              .where(
                and(
                  eq(webhookDeliveryAttempt.id, input.attemptId),
                  eq(webhookDeliveryAttempt.deliveryId, input.deliveryId),
                  eq(webhookDeliveryAttempt.state, "started"),
                ),
              )
              .returning({ id: webhookDeliveryAttempt.id });
            if (finalizedAttempts.length !== 1) return false;
            await transaction
              .update(webhookDelivery)
              .set({
                status: input.state,
                nextAttemptAt: input.nextAttemptAt,
                leaseToken: null,
                leaseExpiresAt: null,
                completedAt: input.state === "retry_scheduled" ? null : input.completedAt,
                lastOutcome: input.outcome,
                updatedAt: input.completedAt,
              })
              .where(
                and(
                  eq(webhookDelivery.id, input.deliveryId),
                  eq(webhookDelivery.leaseToken, input.leaseToken),
                ),
              );
            await transaction
              .update(webhookEndpoint)
              .set({ leaseToken: null, leaseExpiresAt: null })
              .where(
                and(
                  eq(webhookEndpoint.id, input.endpointId),
                  eq(webhookEndpoint.leaseToken, input.leaseToken),
                ),
              );
            return true;
          }),
        catch: (cause) => databaseFailure("webhook.worker.finalize", cause),
      });
    }),

    pendingCount: Effect.fn("WebhookWorkerRepository.pendingCount")(() =>
      Effect.tryPromise({
        try: async () => {
          const [row] = await database
            .select({ count: sql<number>`count(*)::int` })
            .from(outboxEvent)
            .where(
              and(isNull(outboxEvent.processedAt), inArray(outboxEvent.eventType, [...knownTypes])),
            );
          return row?.count ?? 0;
        },
        catch: (cause) => databaseFailure("webhook.worker.pending_count", cause),
      }),
    ),

    referencedEncryptionKeyIds: Effect.fn("WebhookWorkerRepository.referencedEncryptionKeyIds")(
      () =>
        Effect.tryPromise({
          try: async () => {
            const [destinations, secrets] = await Promise.all([
              database
                .select({ keyId: webhookEndpointDestination.encryptionKeyId })
                .from(webhookEndpointDestination),
              database
                .select({ keyId: webhookEndpointSecret.encryptionKeyId })
                .from(webhookEndpointSecret)
                .where(sql`${webhookEndpointSecret.ciphertext} is not null`),
            ]);
            return [...new Set([...destinations, ...secrets].map((row) => row.keyId))].sort();
          },
          catch: (cause) => databaseFailure("webhook.worker.readiness", cause),
        }),
    ),
  };
}

export class WebhookWorkerRepository extends Context.Tag("WebhookWorkerRepository")<
  WebhookWorkerRepository,
  ReturnType<typeof makeWebhookWorkerRepository>
>() {}

export const WebhookWorkerRepositoryLive = Layer.succeed(
  WebhookWorkerRepository,
  makeWebhookWorkerRepository(),
);
