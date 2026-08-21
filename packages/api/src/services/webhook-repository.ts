// Persists authorized endpoint creation and bounded environment-scoped endpoint reads.

import { db } from "@framerfordevs/db";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "@framerfordevs/db/query";
import { environment, auditEvent } from "@framerfordevs/db/schema/platform";
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
import { Context, Effect, Layer, Schema } from "effect";

import {
  ConflictFailure,
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
  VersionConflictFailure,
  WebhookEndpointLimitReachedFailure,
  WebhookReplayNotAllowedFailure,
  WebhookSecretRotationConflictFailure,
} from "../contracts/errors";
import type { AuthUserId } from "../contracts/platform";
import {
  decodeInvalidationMappingCursor,
  decodeWebhookAttemptCursor,
  decodeWebhookDeliveryCursor,
  decodeWebhookEndpointCursor,
  encodeInvalidationMappingCursor,
  encodeWebhookAttemptCursor,
  encodeWebhookDeliveryCursor,
  encodeWebhookEndpointCursor,
} from "../contracts/webhook-cursor";
import {
  InvalidationRouteMapping,
  InvalidationRouteMappingPage,
  WebhookAttemptPage,
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookDeliveryPage,
  WebhookEndpoint,
  WebhookEndpointPage,
  type CreateInvalidationRouteMappingInput,
  type CreateWebhookEndpointInput,
  type ListInvalidationRouteMappingsInput,
  type ListWebhookAttemptsInput,
  type ListWebhookDeliveriesInput,
  type ListWebhookEndpointsInput,
  type ChangeWebhookSecretRotationInput,
  type ReplayWebhookEventInput,
  type ReplaceWebhookSubscriptionsInput,
  type SetInvalidationRouteMappingStateInput,
  type SetWebhookEndpointStateInput,
  type UpdateInvalidationRouteMappingInput,
  type UpdateWebhookEndpointInput,
} from "../contracts/webhooks";
import type { WebhookCiphertext } from "./webhook-crypto";
import type { ApplicationDb } from "./project-access";
import { authorizeUserProject } from "./project-access";

export interface CreateWebhookEndpointPersistence {
  readonly endpointId: string;
  readonly destinationId: string;
  readonly secretId: string;
  readonly displayOrigin: string;
  readonly destination: WebhookCiphertext;
  readonly destinationFingerprint: string;
  readonly secret: WebhookCiphertext;
  readonly secretFingerprint: string;
}

export interface UpdateWebhookDestinationPersistence {
  readonly destinationId: string;
  readonly displayOrigin: string;
  readonly destination: WebhookCiphertext;
  readonly destinationFingerprint: string;
}

export interface PendingWebhookSecretPersistence {
  readonly secretId: string;
  readonly secret: WebhookCiphertext;
  readonly secretFingerprint: string;
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

interface EndpointSummary {
  readonly rotationState: string | null;
  readonly rotationEndsAt: Date | null;
  readonly lastOutcome: string | null;
  readonly deadLetterCount: number;
}

function endpointValue(
  row: typeof webhookEndpoint.$inferSelect,
  destinationOrigin: string,
  subscriptions: ReadonlyArray<string>,
  summary: EndpointSummary,
) {
  return Schema.decodeUnknownSync(WebhookEndpoint)({
    id: row.id,
    projectId: row.projectId,
    environmentId: row.environmentId,
    name: row.name,
    state: row.state,
    version: row.version,
    destinationOrigin,
    subscriptions,
    rotationState: summary.rotationState,
    rotationEndsAt: summary.rotationEndsAt?.toISOString() ?? null,
    lastOutcome: summary.lastOutcome,
    deadLetterCount: summary.deadLetterCount,
    enabledAt: row.enabledAt?.toISOString() ?? null,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function summarizeSecretRows(
  rows: ReadonlyArray<{ readonly state: string; readonly retireAt: Date | null }>,
) {
  const states = new Set(rows.map((secret) => secret.state));
  return {
    rotationState: states.has("pending")
      ? "pending"
      : states.has("retiring")
        ? "retiring"
        : states.has("active")
          ? "active"
          : null,
    rotationEndsAt: rows.find((secret) => secret.state === "retiring")?.retireAt ?? null,
  };
}

async function loadEndpointValue(
  database: ApplicationDb,
  row: typeof webhookEndpoint.$inferSelect,
  knownOrigin?: string,
  knownSubscriptions?: ReadonlyArray<string>,
) {
  const [destination, subscriptionRows, secretRows, deliverySummaryRows] = await Promise.all([
    knownOrigin === undefined
      ? row.currentDestinationId === null
        ? Promise.resolve([])
        : database
            .select({ origin: webhookEndpointDestination.displayOrigin })
            .from(webhookEndpointDestination)
            .where(eq(webhookEndpointDestination.id, row.currentDestinationId))
            .limit(1)
      : Promise.resolve([{ origin: knownOrigin }]),
    knownSubscriptions === undefined
      ? database
          .select({ eventType: webhookEndpointSubscription.eventType })
          .from(webhookEndpointSubscription)
          .where(
            and(
              eq(webhookEndpointSubscription.endpointId, row.id),
              isNull(webhookEndpointSubscription.activeUntil),
            ),
          )
          .orderBy(webhookEndpointSubscription.eventType)
      : Promise.resolve(knownSubscriptions.map((eventType) => ({ eventType }))),
    database
      .select({ state: webhookEndpointSecret.state, retireAt: webhookEndpointSecret.retireAt })
      .from(webhookEndpointSecret)
      .where(
        and(
          eq(webhookEndpointSecret.endpointId, row.id),
          inArray(webhookEndpointSecret.state, ["pending", "active", "retiring"]),
        ),
      ),
    database
      .select({
        deadLetterCount: sql<number>`count(*) filter (where ${webhookDelivery.status} = 'dead_letter')::int`,
        lastOutcome: sql<
          string | null
        >`(array_agg(${webhookDelivery.lastOutcome} order by ${webhookDelivery.updatedAt} desc, ${webhookDelivery.id} desc) filter (where ${webhookDelivery.lastOutcome} is not null))[1]`,
      })
      .from(webhookDelivery)
      .where(eq(webhookDelivery.endpointId, row.id)),
  ]);
  const secretSummary = summarizeSecretRows(secretRows);
  return endpointValue(
    row,
    destination[0]?.origin ?? "https://unavailable.invalid",
    subscriptionRows.map((subscription) => subscription.eventType),
    {
      ...secretSummary,
      lastOutcome: deliverySummaryRows[0]?.lastOutcome ?? null,
      deadLetterCount: deliverySummaryRows[0]?.deadLetterCount ?? 0,
    },
  );
}

async function authorizeEnvironment(
  database: ApplicationDb,
  actorId: AuthUserId,
  projectId: string,
  environmentId: string,
  action: "webhook.read" | "webhook.manage",
) {
  const authorization = await authorizeUserProject(database, actorId, projectId, action);
  if (authorization.kind !== "allowed") return authorization;
  const [environmentRow] = await database
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, environmentId),
        eq(environment.projectId, projectId),
        eq(environment.workspaceId, authorization.access.project.workspaceId),
      ),
    )
    .limit(1);
  return environmentRow ? authorization : { kind: "not_found" as const };
}

export function makeWebhookRepository(database: ApplicationDb = db) {
  return {
    resolveManagementScope: Effect.fn("WebhookRepository.resolveManagementScope")(function* (
      actorId: AuthUserId,
      input: { readonly projectId: string; readonly environmentId: string },
    ) {
      const authorization = yield* Effect.tryPromise({
        try: () =>
          authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "webhook.manage",
          ),
        catch: (cause) => databaseFailure("webhook.scope.manage", cause),
      });
      if (authorization.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "project" });
      if (authorization.kind === "forbidden") return yield* ForbiddenFailure.make();
      return { workspaceId: authorization.access.project.workspaceId };
    }),

    createEndpoint: Effect.fn("WebhookRepository.createEndpoint")(function* (
      actorId: AuthUserId,
      input: CreateWebhookEndpointInput,
      persistence: CreateWebhookEndpointPersistence,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const workspaceId = authorization.access.project.workspaceId;
            const [environmentRow] = await transaction
              .select({ id: environment.id })
              .from(environment)
              .where(
                and(
                  eq(environment.id, input.environmentId),
                  eq(environment.projectId, input.projectId),
                  eq(environment.workspaceId, workspaceId),
                ),
              )
              .limit(1);
            if (!environmentRow) return { kind: "not_found" as const };
            await transaction.execute(
              sql`select id from environment where id = ${input.environmentId} for update`,
            );
            const [count] = await transaction
              .select({ value: sql<number>`count(*)::int` })
              .from(webhookEndpoint)
              .where(
                and(
                  eq(webhookEndpoint.workspaceId, workspaceId),
                  eq(webhookEndpoint.projectId, input.projectId),
                  eq(webhookEndpoint.environmentId, input.environmentId),
                  eq(webhookEndpoint.state, "enabled"),
                ),
              );
            if ((count?.value ?? 0) >= 10) return { kind: "limit" as const };

            await transaction.insert(webhookEndpoint).values({
              id: persistence.endpointId,
              workspaceId,
              projectId: input.projectId,
              environmentId: input.environmentId,
              name: input.name,
              state: "disabled",
              version: 1,
              currentDestinationId: null,
              createdByUserId: actorId,
              changedByUserId: actorId,
              createdAt: now,
              updatedAt: now,
            });
            await transaction.insert(webhookEndpointDestination).values({
              id: persistence.destinationId,
              endpointId: persistence.endpointId,
              workspaceId,
              projectId: input.projectId,
              environmentId: input.environmentId,
              sequence: 1,
              displayOrigin: persistence.displayOrigin,
              encryptionKeyId: persistence.destination.encryptionKeyId,
              nonce: persistence.destination.nonce,
              ciphertext: persistence.destination.ciphertext,
              keyedFingerprint: persistence.destinationFingerprint,
              createdByUserId: actorId,
              createdAt: now,
            });
            await transaction.insert(webhookEndpointSubscription).values(
              input.subscriptions.map((eventType) => ({
                endpointId: persistence.endpointId,
                workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                eventType,
                activeFrom: now,
                createdByUserId: actorId,
                createdAt: now,
              })),
            );
            await transaction.insert(webhookEndpointSecret).values({
              id: persistence.secretId,
              endpointId: persistence.endpointId,
              workspaceId,
              projectId: input.projectId,
              environmentId: input.environmentId,
              sequence: 1,
              state: "active",
              encryptionKeyId: persistence.secret.encryptionKeyId,
              nonce: persistence.secret.nonce,
              ciphertext: persistence.secret.ciphertext,
              fingerprint: persistence.secretFingerprint,
              activatedAt: now,
              createdByUserId: actorId,
              changedByUserId: actorId,
              createdAt: now,
              updatedAt: now,
            });
            const [enabled] = await transaction
              .update(webhookEndpoint)
              .set({
                state: "enabled",
                currentDestinationId: persistence.destinationId,
                enabledAt: now,
                disabledAt: null,
                updatedAt: now,
              })
              .where(eq(webhookEndpoint.id, persistence.endpointId))
              .returning();
            if (!enabled) throw new Error("Created webhook endpoint could not be enabled.");
            await transaction.insert(auditEvent).values({
              workspaceId,
              projectId: input.projectId,
              environmentId: input.environmentId,
              actorType: "user",
              actorId,
              action: "cms.webhook.endpoint.created",
              resourceType: "webhook_endpoint",
              resourceId: persistence.endpointId,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, endpoint: enabled };
          }),
        catch: (cause) => databaseFailure("webhook.endpoint.create", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "limit") return yield* WebhookEndpointLimitReachedFailure.make();
      return endpointValue(result.endpoint, persistence.displayOrigin, input.subscriptions, {
        rotationState: "active",
        rotationEndsAt: null,
        lastOutcome: null,
        deadLetterCount: 0,
      });
    }),

    listEndpoints: Effect.fn("WebhookRepository.listEndpoints")(function* (
      actorId: AuthUserId,
      input: ListWebhookEndpointsInput,
    ) {
      const cursor =
        input.cursor === null ? null : yield* decodeWebhookEndpointCursor(input.cursor, input);
      const authorization = yield* Effect.tryPromise({
        try: () =>
          authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "webhook.read",
          ),
        catch: (cause) => databaseFailure("webhook.endpoint.list.authorize", cause),
      });
      if (authorization.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "project" });
      if (authorization.kind === "forbidden") return yield* ForbiddenFailure.make();
      const rows = yield* Effect.tryPromise({
        try: () =>
          database
            .select({ endpoint: webhookEndpoint, origin: webhookEndpointDestination.displayOrigin })
            .from(webhookEndpoint)
            .innerJoin(
              webhookEndpointDestination,
              eq(webhookEndpointDestination.id, webhookEndpoint.currentDestinationId),
            )
            .where(
              and(
                eq(webhookEndpoint.workspaceId, authorization.access.project.workspaceId),
                eq(webhookEndpoint.projectId, input.projectId),
                eq(webhookEndpoint.environmentId, input.environmentId),
                cursor === null
                  ? undefined
                  : or(
                      lt(webhookEndpoint.createdAt, new Date(cursor.createdAt)),
                      and(
                        eq(webhookEndpoint.createdAt, new Date(cursor.createdAt)),
                        lt(webhookEndpoint.id, cursor.endpointId),
                      ),
                    ),
              ),
            )
            .orderBy(desc(webhookEndpoint.createdAt), desc(webhookEndpoint.id))
            .limit(input.limit + 1),
        catch: (cause) => databaseFailure("webhook.endpoint.list", cause),
      });
      const visibleRows = rows.slice(0, input.limit);
      const items = [];
      for (const row of visibleRows) {
        items.push(
          yield* Effect.tryPromise({
            try: () => loadEndpointValue(database, row.endpoint, row.origin),
            catch: (cause) => databaseFailure("webhook.endpoint.list.details", cause),
          }),
        );
      }
      const last = visibleRows.at(-1)?.endpoint;
      const nextCursor =
        rows.length > input.limit && last
          ? yield* encodeWebhookEndpointCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              createdAt: last.createdAt.toISOString(),
              endpointId: last.id,
            })
          : null;
      return Schema.decodeUnknownSync(WebhookEndpointPage)({ items, nextCursor });
    }),

    updateEndpoint: Effect.fn("WebhookRepository.updateEndpoint")(function* (
      actorId: AuthUserId,
      input: UpdateWebhookEndpointInput,
      persistence: UpdateWebhookDestinationPersistence | null,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [endpoint] = await transaction
              .select()
              .from(webhookEndpoint)
              .where(
                and(
                  eq(webhookEndpoint.id, input.endpointId),
                  eq(webhookEndpoint.workspaceId, authorization.access.project.workspaceId),
                  eq(webhookEndpoint.projectId, input.projectId),
                  eq(webhookEndpoint.environmentId, input.environmentId),
                ),
              )
              .limit(1)
              .for("update");
            if (!endpoint) return { kind: "not_found" as const };
            if (endpoint.version !== input.expectedVersion) return { kind: "version" as const };

            let currentDestinationId = endpoint.currentDestinationId;
            if (persistence !== null) {
              const [sequence] = await transaction
                .select({
                  value: sql<number>`coalesce(max(${webhookEndpointDestination.sequence}), 0)::int`,
                })
                .from(webhookEndpointDestination)
                .where(eq(webhookEndpointDestination.endpointId, endpoint.id));
              await transaction.insert(webhookEndpointDestination).values({
                id: persistence.destinationId,
                endpointId: endpoint.id,
                workspaceId: endpoint.workspaceId,
                projectId: endpoint.projectId,
                environmentId: endpoint.environmentId,
                sequence: (sequence?.value ?? 0) + 1,
                displayOrigin: persistence.displayOrigin,
                encryptionKeyId: persistence.destination.encryptionKeyId,
                nonce: persistence.destination.nonce,
                ciphertext: persistence.destination.ciphertext,
                keyedFingerprint: persistence.destinationFingerprint,
                createdByUserId: actorId,
                createdAt: now,
              });
              currentDestinationId = persistence.destinationId;
            }
            const [updated] = await transaction
              .update(webhookEndpoint)
              .set({
                name: input.name,
                currentDestinationId,
                version: endpoint.version + 1,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(eq(webhookEndpoint.id, endpoint.id))
              .returning();
            if (!updated) throw new Error("Webhook endpoint update returned no row.");
            await transaction.insert(auditEvent).values({
              workspaceId: endpoint.workspaceId,
              projectId: endpoint.projectId,
              environmentId: endpoint.environmentId,
              actorType: "user",
              actorId,
              action: "cms.webhook.endpoint.updated",
              resourceType: "webhook_endpoint",
              resourceId: endpoint.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, endpoint: updated };
          }),
        catch: (cause) => databaseFailure("webhook.endpoint.update", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "webhook endpoint" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "version") return yield* VersionConflictFailure.make();
      return yield* Effect.tryPromise({
        try: () => loadEndpointValue(database, result.endpoint),
        catch: (cause) => databaseFailure("webhook.endpoint.update.details", cause),
      });
    }),

    setEndpointState: Effect.fn("WebhookRepository.setEndpointState")(function* (
      actorId: AuthUserId,
      input: SetWebhookEndpointStateInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [endpoint] = await transaction
              .select()
              .from(webhookEndpoint)
              .where(
                and(
                  eq(webhookEndpoint.id, input.endpointId),
                  eq(webhookEndpoint.workspaceId, authorization.access.project.workspaceId),
                  eq(webhookEndpoint.projectId, input.projectId),
                  eq(webhookEndpoint.environmentId, input.environmentId),
                ),
              )
              .limit(1)
              .for("update");
            if (!endpoint) return { kind: "not_found" as const };
            if (endpoint.version !== input.expectedVersion) return { kind: "version" as const };
            if (endpoint.state === input.state) return { kind: "success" as const, endpoint };
            if (input.state === "enabled") {
              await transaction.execute(
                sql`select id from environment where id = ${input.environmentId} for update`,
              );
              const [count] = await transaction
                .select({ value: sql<number>`count(*)::int` })
                .from(webhookEndpoint)
                .where(
                  and(
                    eq(webhookEndpoint.environmentId, input.environmentId),
                    eq(webhookEndpoint.state, "enabled"),
                  ),
                );
              if ((count?.value ?? 0) >= 10) return { kind: "limit" as const };
            }
            const [updated] = await transaction
              .update(webhookEndpoint)
              .set({
                state: input.state,
                version: endpoint.version + 1,
                enabledAt: input.state === "enabled" ? now : endpoint.enabledAt,
                disabledAt: input.state === "disabled" ? now : null,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(eq(webhookEndpoint.id, endpoint.id))
              .returning();
            if (!updated) throw new Error("Webhook endpoint state update returned no row.");
            if (input.state === "disabled") {
              await transaction
                .update(webhookDelivery)
                .set({
                  status: "canceled",
                  nextAttemptAt: null,
                  completedAt: now,
                  lastOutcome: sql`case when ${webhookDelivery.attemptCount} = 0 then null else 'configuration_error' end`,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(webhookDelivery.endpointId, endpoint.id),
                    inArray(webhookDelivery.status, ["queued", "retry_scheduled"]),
                  ),
                );
            }
            await transaction.insert(auditEvent).values({
              workspaceId: endpoint.workspaceId,
              projectId: endpoint.projectId,
              environmentId: endpoint.environmentId,
              actorType: "user",
              actorId,
              action:
                input.state === "enabled"
                  ? "cms.webhook.endpoint.enabled"
                  : "cms.webhook.endpoint.disabled",
              resourceType: "webhook_endpoint",
              resourceId: endpoint.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, endpoint: updated };
          }),
        catch: (cause) => databaseFailure("webhook.endpoint.state", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "webhook endpoint" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "version") return yield* VersionConflictFailure.make();
      if (result.kind === "limit") return yield* WebhookEndpointLimitReachedFailure.make();
      return yield* Effect.tryPromise({
        try: () => loadEndpointValue(database, result.endpoint),
        catch: (cause) => databaseFailure("webhook.endpoint.state.details", cause),
      });
    }),

    replaceSubscriptions: Effect.fn("WebhookRepository.replaceSubscriptions")(function* (
      actorId: AuthUserId,
      input: ReplaceWebhookSubscriptionsInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [endpoint] = await transaction
              .select()
              .from(webhookEndpoint)
              .where(
                and(
                  eq(webhookEndpoint.id, input.endpointId),
                  eq(webhookEndpoint.workspaceId, authorization.access.project.workspaceId),
                  eq(webhookEndpoint.environmentId, input.environmentId),
                ),
              )
              .limit(1)
              .for("update");
            if (!endpoint) return { kind: "not_found" as const };
            if (endpoint.version !== input.expectedVersion) return { kind: "version" as const };
            const current = await transaction
              .select()
              .from(webhookEndpointSubscription)
              .where(
                and(
                  eq(webhookEndpointSubscription.endpointId, endpoint.id),
                  isNull(webhookEndpointSubscription.activeUntil),
                ),
              );
            const removed = current.filter(
              (subscription) =>
                !input.subscriptions.some((eventType) => eventType === subscription.eventType),
            );
            if (removed.length > 0) {
              await transaction
                .update(webhookEndpointSubscription)
                .set({ activeUntil: now, closedByUserId: actorId })
                .where(
                  inArray(
                    webhookEndpointSubscription.id,
                    removed.map((row) => row.id),
                  ),
                );
              await transaction
                .update(webhookDelivery)
                .set({
                  status: "canceled",
                  nextAttemptAt: null,
                  completedAt: now,
                  lastOutcome: sql`case when ${webhookDelivery.attemptCount} = 0 then null else 'configuration_error' end`,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(webhookDelivery.endpointId, endpoint.id),
                    inArray(webhookDelivery.status, ["queued", "retry_scheduled"]),
                    inArray(
                      webhookDelivery.eventId,
                      transaction
                        .select({ eventId: publicationEvent.eventId })
                        .from(publicationEvent)
                        .where(
                          inArray(
                            publicationEvent.eventType,
                            removed.map((row) => row.eventType),
                          ),
                        ),
                    ),
                  ),
                );
            }
            const added = input.subscriptions.filter(
              (eventType) => !current.some((subscription) => subscription.eventType === eventType),
            );
            if (added.length > 0)
              await transaction.insert(webhookEndpointSubscription).values(
                added.map((eventType) => ({
                  endpointId: endpoint.id,
                  workspaceId: endpoint.workspaceId,
                  projectId: endpoint.projectId,
                  environmentId: endpoint.environmentId,
                  eventType,
                  activeFrom: now,
                  createdByUserId: actorId,
                  createdAt: now,
                })),
              );
            const [updated] = await transaction
              .update(webhookEndpoint)
              .set({ version: endpoint.version + 1, changedByUserId: actorId, updatedAt: now })
              .where(eq(webhookEndpoint.id, endpoint.id))
              .returning();
            if (!updated) throw new Error("Webhook subscription update returned no endpoint.");
            await transaction.insert(auditEvent).values({
              workspaceId: endpoint.workspaceId,
              projectId: endpoint.projectId,
              environmentId: endpoint.environmentId,
              actorType: "user",
              actorId,
              action: "cms.webhook.subscription.updated",
              resourceType: "webhook_endpoint",
              resourceId: endpoint.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, endpoint: updated };
          }),
        catch: (cause) => databaseFailure("webhook.subscription.replace", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "webhook endpoint" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "version") return yield* VersionConflictFailure.make();
      return yield* Effect.tryPromise({
        try: () => loadEndpointValue(database, result.endpoint, undefined, input.subscriptions),
        catch: (cause) => databaseFailure("webhook.subscription.details", cause),
      });
    }),

    startSecretRotation: Effect.fn("WebhookRepository.startSecretRotation")(function* (
      actorId: AuthUserId,
      input: {
        readonly projectId: string;
        readonly environmentId: string;
        readonly endpointId: string;
        readonly expectedVersion: number;
      },
      persistence: PendingWebhookSecretPersistence,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [endpoint] = await transaction
              .select()
              .from(webhookEndpoint)
              .where(
                and(
                  eq(webhookEndpoint.id, input.endpointId),
                  eq(webhookEndpoint.workspaceId, authorization.access.project.workspaceId),
                  eq(webhookEndpoint.environmentId, input.environmentId),
                ),
              )
              .limit(1)
              .for("update");
            if (!endpoint) return { kind: "not_found" as const };
            if (endpoint.version !== input.expectedVersion) return { kind: "version" as const };
            const lifecycle = await transaction
              .select()
              .from(webhookEndpointSecret)
              .where(
                and(
                  eq(webhookEndpointSecret.endpointId, endpoint.id),
                  inArray(webhookEndpointSecret.state, ["pending", "retiring"]),
                ),
              );
            if (lifecycle.length > 0) return { kind: "rotation" as const };
            const [sequence] = await transaction
              .select({
                value: sql<number>`coalesce(max(${webhookEndpointSecret.sequence}), 0)::int`,
              })
              .from(webhookEndpointSecret)
              .where(eq(webhookEndpointSecret.endpointId, endpoint.id));
            await transaction.insert(webhookEndpointSecret).values({
              id: persistence.secretId,
              endpointId: endpoint.id,
              workspaceId: endpoint.workspaceId,
              projectId: endpoint.projectId,
              environmentId: endpoint.environmentId,
              sequence: (sequence?.value ?? 0) + 1,
              state: "pending",
              encryptionKeyId: persistence.secret.encryptionKeyId,
              nonce: persistence.secret.nonce,
              ciphertext: persistence.secret.ciphertext,
              fingerprint: persistence.secretFingerprint,
              createdByUserId: actorId,
              changedByUserId: actorId,
              createdAt: now,
              updatedAt: now,
            });
            await transaction
              .update(webhookEndpoint)
              .set({ version: endpoint.version + 1, changedByUserId: actorId, updatedAt: now })
              .where(eq(webhookEndpoint.id, endpoint.id));
            await transaction.insert(auditEvent).values({
              workspaceId: endpoint.workspaceId,
              projectId: endpoint.projectId,
              environmentId: endpoint.environmentId,
              actorType: "user",
              actorId,
              action: "cms.webhook.secret.rotation_started",
              resourceType: "webhook_endpoint",
              resourceId: endpoint.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const };
          }),
        catch: (cause) => databaseFailure("webhook.secret.start", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "webhook endpoint" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "version") return yield* VersionConflictFailure.make();
      if (result.kind === "rotation") return yield* WebhookSecretRotationConflictFailure.make();
      return true;
    }),

    changeSecretRotation: Effect.fn("WebhookRepository.changeSecretRotation")(function* (
      actorId: AuthUserId,
      input: ChangeWebhookSecretRotationInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [endpoint] = await transaction
              .select()
              .from(webhookEndpoint)
              .where(
                and(
                  eq(webhookEndpoint.id, input.endpointId),
                  eq(webhookEndpoint.workspaceId, authorization.access.project.workspaceId),
                  eq(webhookEndpoint.environmentId, input.environmentId),
                ),
              )
              .limit(1)
              .for("update");
            if (!endpoint) return { kind: "not_found" as const };
            if (endpoint.version !== input.expectedVersion) return { kind: "version" as const };
            const secrets = await transaction
              .select()
              .from(webhookEndpointSecret)
              .where(eq(webhookEndpointSecret.endpointId, endpoint.id))
              .for("update");
            const pending = secrets.find((secret) => secret.state === "pending");
            const active = secrets.find((secret) => secret.state === "active");
            const retiring = secrets.find((secret) => secret.state === "retiring");
            if (input.action === "activate" && pending && active) {
              const retireAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
              await transaction
                .update(webhookEndpointSecret)
                .set({ state: "retiring", retireAt, changedByUserId: actorId, updatedAt: now })
                .where(eq(webhookEndpointSecret.id, active.id));
              await transaction
                .update(webhookEndpointSecret)
                .set({
                  state: "active",
                  activatedAt: now,
                  changedByUserId: actorId,
                  updatedAt: now,
                })
                .where(eq(webhookEndpointSecret.id, pending.id));
            } else if (input.action === "cancel" && pending) {
              await transaction
                .update(webhookEndpointSecret)
                .set({
                  state: "canceled",
                  nonce: null,
                  ciphertext: null,
                  retiredAt: now,
                  changedByUserId: actorId,
                  updatedAt: now,
                })
                .where(eq(webhookEndpointSecret.id, pending.id));
            } else if (input.action === "complete" && retiring) {
              await transaction
                .update(webhookEndpointSecret)
                .set({
                  state: "retired",
                  nonce: null,
                  ciphertext: null,
                  retiredAt: now,
                  changedByUserId: actorId,
                  updatedAt: now,
                })
                .where(eq(webhookEndpointSecret.id, retiring.id));
            } else return { kind: "rotation" as const };
            const [updated] = await transaction
              .update(webhookEndpoint)
              .set({ version: endpoint.version + 1, changedByUserId: actorId, updatedAt: now })
              .where(eq(webhookEndpoint.id, endpoint.id))
              .returning();
            if (!updated) throw new Error("Webhook rotation update returned no endpoint.");
            await transaction.insert(auditEvent).values({
              workspaceId: endpoint.workspaceId,
              projectId: endpoint.projectId,
              environmentId: endpoint.environmentId,
              actorType: "user",
              actorId,
              action: `cms.webhook.secret.rotation_${input.action === "activate" ? "activated" : input.action === "cancel" ? "canceled" : "completed"}`,
              resourceType: "webhook_endpoint",
              resourceId: endpoint.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, endpoint: updated };
          }),
        catch: (cause) => databaseFailure("webhook.secret.change", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "webhook endpoint" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "version") return yield* VersionConflictFailure.make();
      if (result.kind === "rotation") return yield* WebhookSecretRotationConflictFailure.make();
      return result.endpoint;
    }),

    createMapping: Effect.fn("WebhookRepository.createMapping")(function* (
      actorId: AuthUserId,
      input: CreateInvalidationRouteMappingInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const workspaceId = authorization.access.project.workspaceId;
            const [environmentRow] = await transaction
              .select({ id: environment.id })
              .from(environment)
              .where(
                and(
                  eq(environment.id, input.environmentId),
                  eq(environment.projectId, input.projectId),
                  eq(environment.workspaceId, workspaceId),
                ),
              )
              .limit(1);
            if (!environmentRow) return { kind: "not_found" as const };
            await transaction.execute(
              sql`select id from environment where id = ${input.environmentId} for update`,
            );
            const [count] = await transaction
              .select({ value: sql<number>`count(*)::int` })
              .from(cmsInvalidationRouteMapping)
              .where(
                and(
                  eq(cmsInvalidationRouteMapping.workspaceId, workspaceId),
                  eq(cmsInvalidationRouteMapping.projectId, input.projectId),
                  eq(cmsInvalidationRouteMapping.environmentId, input.environmentId),
                  eq(cmsInvalidationRouteMapping.state, "enabled"),
                ),
              );
            if ((count?.value ?? 0) >= 100) return { kind: "limit" as const };
            const [mapping] = await transaction
              .insert(cmsInvalidationRouteMapping)
              .values({
                workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                collectionId: input.collectionId,
                entryId: input.entryId,
                localeId: input.localeId,
                name: input.name,
                eventTypes: [...input.eventTypes],
                routePath: input.route,
                semanticTags: [...input.semanticTags],
                state: "enabled",
                version: 1,
                createdByUserId: actorId,
                changedByUserId: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!mapping) throw new Error("Invalidation mapping insert returned no row.");
            await transaction.insert(auditEvent).values({
              workspaceId,
              projectId: input.projectId,
              environmentId: input.environmentId,
              actorType: "user",
              actorId,
              action: "cms.invalidation.route.created",
              resourceType: "cms_invalidation_route_mapping",
              resourceId: mapping.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, mapping };
          }),
        catch: (cause) => databaseFailure("webhook.mapping.create", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "limit") return yield* ConflictFailure.make();
      return Schema.decodeUnknownSync(InvalidationRouteMapping)({
        id: result.mapping.id,
        projectId: result.mapping.projectId,
        environmentId: result.mapping.environmentId,
        collectionId: result.mapping.collectionId,
        entryId: result.mapping.entryId,
        localeId: result.mapping.localeId,
        name: result.mapping.name,
        eventTypes: result.mapping.eventTypes,
        route: result.mapping.routePath,
        semanticTags: result.mapping.semanticTags,
        state: result.mapping.state,
        version: result.mapping.version,
        createdAt: result.mapping.createdAt.toISOString(),
        updatedAt: result.mapping.updatedAt.toISOString(),
      });
    }),

    updateMapping: Effect.fn("WebhookRepository.updateMapping")(function* (
      actorId: AuthUserId,
      input: UpdateInvalidationRouteMappingInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [mapping] = await transaction
              .select()
              .from(cmsInvalidationRouteMapping)
              .where(
                and(
                  eq(cmsInvalidationRouteMapping.id, input.mappingId),
                  eq(
                    cmsInvalidationRouteMapping.workspaceId,
                    authorization.access.project.workspaceId,
                  ),
                  eq(cmsInvalidationRouteMapping.projectId, input.projectId),
                  eq(cmsInvalidationRouteMapping.environmentId, input.environmentId),
                ),
              )
              .limit(1)
              .for("update");
            if (!mapping) return { kind: "not_found" as const };
            if (mapping.version !== input.expectedVersion) return { kind: "version" as const };
            const [updated] = await transaction
              .update(cmsInvalidationRouteMapping)
              .set({
                collectionId: input.collectionId,
                entryId: input.entryId,
                localeId: input.localeId,
                name: input.name,
                eventTypes: [...input.eventTypes],
                routePath: input.route,
                semanticTags: [...input.semanticTags],
                version: mapping.version + 1,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(eq(cmsInvalidationRouteMapping.id, mapping.id))
              .returning();
            if (!updated) throw new Error("Invalidation mapping update returned no row.");
            await transaction.insert(auditEvent).values({
              workspaceId: mapping.workspaceId,
              projectId: mapping.projectId,
              environmentId: mapping.environmentId,
              actorType: "user",
              actorId,
              action: "cms.invalidation.route.updated",
              resourceType: "cms_invalidation_route_mapping",
              resourceId: mapping.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, mapping: updated };
          }),
        catch: (cause) => databaseFailure("webhook.mapping.update", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "invalidation mapping" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "version") return yield* VersionConflictFailure.make();
      return Schema.decodeUnknownSync(InvalidationRouteMapping)({
        id: result.mapping.id,
        projectId: result.mapping.projectId,
        environmentId: result.mapping.environmentId,
        collectionId: result.mapping.collectionId,
        entryId: result.mapping.entryId,
        localeId: result.mapping.localeId,
        name: result.mapping.name,
        eventTypes: result.mapping.eventTypes,
        route: result.mapping.routePath,
        semanticTags: result.mapping.semanticTags,
        state: result.mapping.state,
        version: result.mapping.version,
        createdAt: result.mapping.createdAt.toISOString(),
        updatedAt: result.mapping.updatedAt.toISOString(),
      });
    }),

    setMappingState: Effect.fn("WebhookRepository.setMappingState")(function* (
      actorId: AuthUserId,
      input: SetInvalidationRouteMappingStateInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [mapping] = await transaction
              .select()
              .from(cmsInvalidationRouteMapping)
              .where(
                and(
                  eq(cmsInvalidationRouteMapping.id, input.mappingId),
                  eq(
                    cmsInvalidationRouteMapping.workspaceId,
                    authorization.access.project.workspaceId,
                  ),
                  eq(cmsInvalidationRouteMapping.projectId, input.projectId),
                  eq(cmsInvalidationRouteMapping.environmentId, input.environmentId),
                ),
              )
              .limit(1)
              .for("update");
            if (!mapping) return { kind: "not_found" as const };
            if (mapping.version !== input.expectedVersion) return { kind: "version" as const };
            if (mapping.state === input.state) return { kind: "success" as const, mapping };
            if (input.state === "enabled") {
              await transaction.execute(
                sql`select id from environment where id = ${input.environmentId} for update`,
              );
              const [count] = await transaction
                .select({ value: sql<number>`count(*)::int` })
                .from(cmsInvalidationRouteMapping)
                .where(
                  and(
                    eq(cmsInvalidationRouteMapping.environmentId, input.environmentId),
                    eq(cmsInvalidationRouteMapping.state, "enabled"),
                  ),
                );
              if ((count?.value ?? 0) >= 100) return { kind: "limit" as const };
            }
            const [updated] = await transaction
              .update(cmsInvalidationRouteMapping)
              .set({
                state: input.state,
                disabledAt: input.state === "disabled" ? now : null,
                version: mapping.version + 1,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(eq(cmsInvalidationRouteMapping.id, mapping.id))
              .returning();
            if (!updated) throw new Error("Invalidation mapping state returned no row.");
            await transaction.insert(auditEvent).values({
              workspaceId: mapping.workspaceId,
              projectId: mapping.projectId,
              environmentId: mapping.environmentId,
              actorType: "user",
              actorId,
              action:
                input.state === "enabled"
                  ? "cms.invalidation.route.enabled"
                  : "cms.invalidation.route.disabled",
              resourceType: "cms_invalidation_route_mapping",
              resourceId: mapping.id,
              requestId,
              occurredAt: now,
            });
            return { kind: "success" as const, mapping: updated };
          }),
        catch: (cause) => databaseFailure("webhook.mapping.state", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "invalidation mapping" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "version") return yield* VersionConflictFailure.make();
      if (result.kind === "limit") return yield* ConflictFailure.make();
      return Schema.decodeUnknownSync(InvalidationRouteMapping)({
        id: result.mapping.id,
        projectId: result.mapping.projectId,
        environmentId: result.mapping.environmentId,
        collectionId: result.mapping.collectionId,
        entryId: result.mapping.entryId,
        localeId: result.mapping.localeId,
        name: result.mapping.name,
        eventTypes: result.mapping.eventTypes,
        route: result.mapping.routePath,
        semanticTags: result.mapping.semanticTags,
        state: result.mapping.state,
        version: result.mapping.version,
        createdAt: result.mapping.createdAt.toISOString(),
        updatedAt: result.mapping.updatedAt.toISOString(),
      });
    }),

    listMappings: Effect.fn("WebhookRepository.listMappings")(function* (
      actorId: AuthUserId,
      input: ListInvalidationRouteMappingsInput,
    ) {
      const cursor =
        input.cursor === null ? null : yield* decodeInvalidationMappingCursor(input.cursor, input);
      const authorization = yield* Effect.tryPromise({
        try: () =>
          authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "webhook.read",
          ),
        catch: (cause) => databaseFailure("webhook.mapping.list.authorize", cause),
      });
      if (authorization.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "project" });
      if (authorization.kind === "forbidden") return yield* ForbiddenFailure.make();
      const rows = yield* Effect.tryPromise({
        try: () =>
          database
            .select()
            .from(cmsInvalidationRouteMapping)
            .where(
              and(
                eq(
                  cmsInvalidationRouteMapping.workspaceId,
                  authorization.access.project.workspaceId,
                ),
                eq(cmsInvalidationRouteMapping.projectId, input.projectId),
                eq(cmsInvalidationRouteMapping.environmentId, input.environmentId),
                cursor === null
                  ? undefined
                  : or(
                      lt(cmsInvalidationRouteMapping.createdAt, new Date(cursor.createdAt)),
                      and(
                        eq(cmsInvalidationRouteMapping.createdAt, new Date(cursor.createdAt)),
                        lt(cmsInvalidationRouteMapping.id, cursor.mappingId),
                      ),
                    ),
              ),
            )
            .orderBy(
              desc(cmsInvalidationRouteMapping.createdAt),
              desc(cmsInvalidationRouteMapping.id),
            )
            .limit(input.limit + 1),
        catch: (cause) => databaseFailure("webhook.mapping.list", cause),
      });
      const visibleRows = rows.slice(0, input.limit);
      const items = visibleRows.map((row) =>
        Schema.decodeUnknownSync(InvalidationRouteMapping)({
          id: row.id,
          projectId: row.projectId,
          environmentId: row.environmentId,
          collectionId: row.collectionId,
          entryId: row.entryId,
          localeId: row.localeId,
          name: row.name,
          eventTypes: row.eventTypes,
          route: row.routePath,
          semanticTags: row.semanticTags,
          state: row.state,
          version: row.version,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      );
      const last = visibleRows.at(-1);
      const nextCursor =
        rows.length > input.limit && last
          ? yield* encodeInvalidationMappingCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              createdAt: last.createdAt.toISOString(),
              mappingId: last.id,
            })
          : null;
      return InvalidationRouteMappingPage.make({ items, nextCursor });
    }),

    listDeliveries: Effect.fn("WebhookRepository.listDeliveries")(function* (
      actorId: AuthUserId,
      input: ListWebhookDeliveriesInput,
    ) {
      const cursor =
        input.cursor === null ? null : yield* decodeWebhookDeliveryCursor(input.cursor, input);
      const authorization = yield* Effect.tryPromise({
        try: () =>
          authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "webhook.read",
          ),
        catch: (cause) => databaseFailure("webhook.delivery.list.authorize", cause),
      });
      if (authorization.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "project" });
      if (authorization.kind === "forbidden") return yield* ForbiddenFailure.make();
      const conditions = [
        eq(webhookDelivery.workspaceId, authorization.access.project.workspaceId),
        eq(webhookDelivery.projectId, input.projectId),
        eq(webhookDelivery.environmentId, input.environmentId),
      ];
      if (input.endpointId !== null)
        conditions.push(eq(webhookDelivery.endpointId, input.endpointId));
      if (input.status !== null) conditions.push(eq(webhookDelivery.status, input.status));
      const rows = yield* Effect.tryPromise({
        try: () =>
          database
            .select({
              delivery: webhookDelivery,
              eventType: publicationEvent.eventType,
              canonicalBody: publicationEvent.canonicalBody,
            })
            .from(webhookDelivery)
            .innerJoin(publicationEvent, eq(publicationEvent.eventId, webhookDelivery.eventId))
            .where(
              and(
                ...conditions,
                input.eventType === null
                  ? undefined
                  : eq(publicationEvent.eventType, input.eventType),
                cursor === null
                  ? undefined
                  : or(
                      lt(webhookDelivery.createdAt, new Date(cursor.createdAt)),
                      and(
                        eq(webhookDelivery.createdAt, new Date(cursor.createdAt)),
                        lt(webhookDelivery.id, cursor.deliveryId),
                      ),
                    ),
              ),
            )
            .orderBy(desc(webhookDelivery.createdAt), desc(webhookDelivery.id))
            .limit(input.limit + 1),
        catch: (cause) => databaseFailure("webhook.delivery.list", cause),
      });
      const visibleRows = rows.slice(0, input.limit);
      const items = visibleRows.map(({ delivery, canonicalBody }) =>
        Schema.decodeUnknownSync(WebhookDelivery)({
          id: delivery.id,
          eventId: delivery.eventId,
          endpointId: delivery.endpointId,
          event: JSON.parse(canonicalBody),
          kind: delivery.kind,
          status: delivery.status,
          attemptCount: delivery.attemptCount,
          nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
          completedAt: delivery.completedAt?.toISOString() ?? null,
          lastOutcome: delivery.lastOutcome,
          createdAt: delivery.createdAt.toISOString(),
          updatedAt: delivery.updatedAt.toISOString(),
        }),
      );
      const last = visibleRows.at(-1)?.delivery;
      const nextCursor =
        rows.length > input.limit && last
          ? yield* encodeWebhookDeliveryCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              endpointFilter: input.endpointId,
              eventTypeFilter: input.eventType,
              statusFilter: input.status,
              createdAt: last.createdAt.toISOString(),
              deliveryId: last.id,
            })
          : null;
      return WebhookDeliveryPage.make({ items, nextCursor });
    }),

    listAttempts: Effect.fn("WebhookRepository.listAttempts")(function* (
      actorId: AuthUserId,
      input: ListWebhookAttemptsInput,
    ) {
      const cursor =
        input.cursor === null ? null : yield* decodeWebhookAttemptCursor(input.cursor, input);
      const authorization = yield* Effect.tryPromise({
        try: () =>
          authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "webhook.read",
          ),
        catch: (cause) => databaseFailure("webhook.attempt.list.authorize", cause),
      });
      if (authorization.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "project" });
      if (authorization.kind === "forbidden") return yield* ForbiddenFailure.make();
      const rows = yield* Effect.tryPromise({
        try: () =>
          database
            .select()
            .from(webhookDeliveryAttempt)
            .where(
              and(
                eq(webhookDeliveryAttempt.workspaceId, authorization.access.project.workspaceId),
                eq(webhookDeliveryAttempt.projectId, input.projectId),
                eq(webhookDeliveryAttempt.environmentId, input.environmentId),
                eq(webhookDeliveryAttempt.deliveryId, input.deliveryId),
                cursor === null
                  ? undefined
                  : lt(webhookDeliveryAttempt.attemptNumber, cursor.attemptNumber),
              ),
            )
            .orderBy(desc(webhookDeliveryAttempt.attemptNumber))
            .limit(input.limit + 1),
        catch: (cause) => databaseFailure("webhook.attempt.list", cause),
      });
      const visibleRows = rows.slice(0, input.limit);
      const items = visibleRows.map((attempt) =>
        Schema.decodeUnknownSync(WebhookDeliveryAttempt)({
          id: attempt.id,
          deliveryId: attempt.deliveryId,
          eventId: attempt.eventId,
          endpointId: attempt.endpointId,
          attemptNumber: attempt.attemptNumber,
          state: attempt.state,
          startedAt: attempt.startedAt.toISOString(),
          completedAt: attempt.completedAt?.toISOString() ?? null,
          durationMs: attempt.durationMs,
          httpStatus: attempt.httpStatus,
          statusFamily: attempt.statusFamily,
          outcome: attempt.outcome,
          nextAttemptAt: attempt.nextAttemptAt?.toISOString() ?? null,
        }),
      );
      const last = visibleRows.at(-1);
      const nextCursor =
        rows.length > input.limit && last
          ? yield* encodeWebhookAttemptCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              deliveryId: input.deliveryId,
              attemptNumber: last.attemptNumber,
              attemptId: last.id,
            })
          : null;
      return WebhookAttemptPage.make({ items, nextCursor });
    }),

    replayEvent: Effect.fn("WebhookRepository.replayEvent")(function* (
      actorId: AuthUserId,
      input: ReplayWebhookEventInput,
      commandFingerprint: string,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const authorization = await authorizeUserProject(
              transaction,
              actorId,
              input.projectId,
              "webhook.manage",
            );
            if (authorization.kind !== "allowed") return authorization;
            const [endpoint] = await transaction
              .select()
              .from(webhookEndpoint)
              .where(
                and(
                  eq(webhookEndpoint.id, input.endpointId),
                  eq(webhookEndpoint.workspaceId, authorization.access.project.workspaceId),
                  eq(webhookEndpoint.projectId, input.projectId),
                  eq(webhookEndpoint.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            const [event] = await transaction
              .select()
              .from(publicationEvent)
              .where(
                and(
                  eq(publicationEvent.eventId, input.eventId),
                  eq(publicationEvent.workspaceId, authorization.access.project.workspaceId),
                  eq(publicationEvent.projectId, input.projectId),
                  eq(publicationEvent.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            if (!endpoint || !event) return { kind: "not_found" as const };
            if (endpoint.state !== "enabled" || endpoint.currentDestinationId === null)
              return { kind: "not_allowed" as const };
            const [existing] = await transaction
              .select()
              .from(webhookDelivery)
              .where(
                and(
                  eq(webhookDelivery.endpointId, endpoint.id),
                  eq(webhookDelivery.replayCommandId, input.commandId),
                ),
              )
              .limit(1);
            if (existing)
              return existing.replayCommandFingerprint === commandFingerprint
                ? {
                    kind: "success" as const,
                    delivery: existing,
                    canonicalBody: event.canonicalBody,
                  }
                : { kind: "conflict" as const };
            const [delivery] = await transaction
              .insert(webhookDelivery)
              .values({
                eventId: event.eventId,
                endpointId: endpoint.id,
                destinationId: endpoint.currentDestinationId,
                workspaceId: endpoint.workspaceId,
                projectId: endpoint.projectId,
                environmentId: endpoint.environmentId,
                kind: "replay",
                sourceDeliveryId: input.sourceDeliveryId,
                replayCommandId: input.commandId,
                replayCommandFingerprint: commandFingerprint,
                replayedByUserId: actorId,
                status: "queued",
                nextAttemptAt: now,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!delivery) throw new Error("Replay delivery insert returned no row.");
            await transaction.insert(auditEvent).values({
              workspaceId: endpoint.workspaceId,
              projectId: endpoint.projectId,
              environmentId: endpoint.environmentId,
              actorType: "user",
              actorId,
              action: "cms.webhook.delivery.replayed",
              resourceType: "webhook_delivery",
              resourceId: delivery.id,
              requestId,
              occurredAt: now,
            });
            return {
              kind: "success" as const,
              delivery,
              canonicalBody: event.canonicalBody,
            };
          }),
        catch: (cause) => databaseFailure("webhook.delivery.replay", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "webhook event" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "not_allowed") return yield* WebhookReplayNotAllowedFailure.make();
      if (result.kind === "conflict") return yield* VersionConflictFailure.make();
      return Schema.decodeUnknownSync(WebhookDelivery)({
        id: result.delivery.id,
        eventId: result.delivery.eventId,
        endpointId: result.delivery.endpointId,
        event: JSON.parse(result.canonicalBody),
        kind: result.delivery.kind,
        status: result.delivery.status,
        attemptCount: result.delivery.attemptCount,
        nextAttemptAt: result.delivery.nextAttemptAt?.toISOString() ?? null,
        completedAt: result.delivery.completedAt?.toISOString() ?? null,
        lastOutcome: result.delivery.lastOutcome,
        createdAt: result.delivery.createdAt.toISOString(),
        updatedAt: result.delivery.updatedAt.toISOString(),
      });
    }),
  };
}

export class WebhookRepository extends Context.Tag("WebhookRepository")<
  WebhookRepository,
  ReturnType<typeof makeWebhookRepository>
>() {}

export const WebhookRepositoryLive = Layer.succeed(WebhookRepository, makeWebhookRepository());
