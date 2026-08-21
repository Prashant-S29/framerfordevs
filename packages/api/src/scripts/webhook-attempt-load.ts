// Runs isolated controlled-TLS webhook fan-out, throughput, slow-isolation, or retry-load gates.

import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { Clock, Effect, Either, Layer } from "effect";

import { runOneWebhookAttempt } from "../operations/webhook-attempt";
import { WebhookTelemetry } from "../observability/webhook-telemetry";
import { makeWebhookCrypto, WebhookCrypto } from "../services/webhook-crypto";
import { WebhookDestinationValidator } from "../services/webhook-destination-validator";
import {
  makeWebhookTransport,
  type WebhookHttpsAdapter,
  WebhookTransport,
} from "../services/webhook-transport";
import {
  makeWebhookWorkerRepository,
  WebhookWorkerRepository,
} from "../services/webhook-worker-repository";

type Profile = "healthy_fanout" | "single_endpoint" | "slow_isolation" | "retry_storm";
const insertChunkSize = 500;
let failureStage = "startup";
let failureCounts: Readonly<Record<string, number>> = {};

interface Scope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionId: string;
  readonly schemaRevisionId: string;
  readonly actorId: string;
  readonly maximumSequence: number;
}

interface ProfileSettings {
  readonly events: number;
  readonly endpoints: number;
  readonly slots: number;
  readonly targetDurationMs: number | null;
}

const settings: Readonly<Record<Profile, ProfileSettings>> = {
  healthy_fanout: { events: 2_000, endpoints: 5, slots: 5, targetDurationMs: 120_000 },
  single_endpoint: { events: 1_000, endpoints: 1, slots: 1, targetDurationMs: 40_000 },
  slow_isolation: { events: 1, endpoints: 10, slots: 10, targetDurationMs: 15_000 },
  retry_storm: { events: 5_000, endpoints: 1, slots: 1, targetDurationMs: null },
};

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Load authority missing.");
  return value;
}

async function loadScope(): Promise<Scope> {
  const result = await db.execute(sql`select
    r.workspace_id as "workspaceId", r.project_id as "projectId",
    r.environment_id as "environmentId", r.collection_id as "collectionId",
    r.id as "schemaRevisionId", r.published_by_user_id as "actorId",
    coalesce((select max(oe.aggregate_sequence) from outbox_event oe where oe.event_type = 'cms.schema.published' and oe.subject_id = r.collection_id), 0)::int as "maximumSequence"
    from cms_schema_revision r order by r.id limit 1`);
  const row = result.rows[0];
  const maximumSequence = Number(row?.maximumSequence);
  if (!Number.isSafeInteger(maximumSequence) || maximumSequence < 0) {
    throw new Error("Load sequence authority invalid.");
  }
  return {
    workspaceId: requiredText(row?.workspaceId),
    projectId: requiredText(row?.projectId),
    environmentId: requiredText(row?.environmentId),
    collectionId: requiredText(row?.collectionId),
    schemaRevisionId: requiredText(row?.schemaRevisionId),
    actorId: requiredText(row?.actorId),
    maximumSequence,
  };
}

async function controlledTls(profile: Profile) {
  const suppliedKeyPath = process.env.WEBHOOK_LOAD_TLS_KEY_PATH;
  const suppliedCertificatePath = process.env.WEBHOOK_LOAD_TLS_CERTIFICATE_PATH;
  let directory: string | null = null;
  let keyPath: string;
  let certificatePath: string;
  if (suppliedKeyPath !== undefined && suppliedCertificatePath !== undefined) {
    keyPath = suppliedKeyPath;
    certificatePath = suppliedCertificatePath;
  } else {
    directory = await mkdtemp(join(tmpdir(), "m11-webhook-tls-"));
    keyPath = join(directory, "key.pem");
    certificatePath = join(directory, "certificate.pem");
    const configPath = join(directory, "openssl.cnf");
    await writeFile(
      configPath,
      "[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=hooks.example.com\n[ext]\nsubjectAltName=DNS:hooks.example.com,DNS:*.example.com\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n",
    );
    const generated = spawnSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-keyout",
        keyPath,
        "-out",
        certificatePath,
        "-config",
        configPath,
      ],
      { stdio: "ignore" },
    );
    if (generated.status !== 0) throw new Error("Controlled TLS certificate generation failed.");
  }
  const [key, certificate] = await Promise.all([readFile(keyPath), readFile(certificatePath)]);
  let requests = 0;
  let invalidSni = 0;
  const transportErrors = new Map<string, number>();
  const server = https.createServer({ key, cert: certificate }, (request, response) => {
    request.resume();
    request.once("end", () => {
      requests += 1;
      const path = request.url ?? "";
      const isSlow = profile === "slow_isolation" && path.endsWith("/0");
      const latencyMs = isSlow
        ? 10_000
        : profile === "healthy_fanout" || profile === "retry_storm"
          ? 0
          : 20;
      setTimeout(() => {
        response.statusCode = profile === "retry_storm" ? 503 : 204;
        response.end();
      }, latencyMs);
    });
  });
  server.on("secureConnection", (socket) => {
    if (
      socket.servername !== "hooks.example.com" &&
      (typeof socket.servername !== "string" ||
        !/^hooks-[0-9]+\.example\.com$/u.test(socket.servername))
    ) {
      invalidSni += 1;
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(443, "127.0.0.1", () => resolve());
  });
  const adapter: WebhookHttpsAdapter = {
    request: (options, onResponse, onError, onTimeout) => {
      const outbound = https.request({ ...options, ca: certificate }, onResponse);
      outbound.once("timeout", onTimeout);
      outbound.once("error", (cause) => {
        const category =
          typeof cause === "object" && cause !== null && "code" in cause
            ? String(cause.code).slice(0, 64)
            : "unknown";
        transportErrors.set(category, (transportErrors.get(category) ?? 0) + 1);
        onError(cause);
      });
      return outbound;
    },
  };
  return {
    adapter,
    requests: () => requests,
    invalidSni: () => invalidSni,
    transportErrors: () => Object.fromEntries(transportErrors),
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (directory !== null) await rm(directory, { recursive: true, force: true });
    },
  };
}

async function main() {
  const profile = process.argv[2];
  let selected: Profile;
  switch (profile) {
    case "healthy_fanout":
    case "single_endpoint":
    case "slow_isolation":
    case "retry_storm":
      selected = profile;
      break;
    default:
      throw new Error("Unknown load profile.");
  }
  const selectedSettings = settings[selected];
  failureStage = "authority";
  const scope = await loadScope();
  failureStage = "tls";
  const tls = await controlledTls(selected);
  const eventIds = Array.from({ length: selectedSettings.events }, () => randomUUID());
  const endpointIds: Array<string> = [];
  const destinationIds: Array<string> = [];
  const secretIds: Array<string> = [];
  const crypto = makeWebhookCrypto({
    activeKeyId: "load-key",
    keys: { "load-key": randomBytes(32).toString("base64url") },
  });
  const now = new Date();
  const activeFrom = new Date(now.getTime() - 1_000);

  try {
    failureStage = "preflight";
    const preflight = await db.execute(sql`select
      (select count(*)::int from webhook_endpoint where state = 'enabled') as endpoints,
      (select count(*)::int from outbox_event where processed_at is null and event_type in ('cms.schema.published', 'cms.entry.published', 'cms.entry.unpublished', 'cms.collection.delivery_config.updated')) as pending`);
    if (Number(preflight.rows[0]?.endpoints) !== 0 || Number(preflight.rows[0]?.pending) !== 0) {
      throw new Error("Attempt-load preflight requires zero enabled endpoints and backlog.");
    }

    failureStage = "endpoint_fixtures";
    for (let index = 0; index < selectedSettings.endpoints; index += 1) {
      const endpointId = randomUUID();
      const destinationId = randomUUID();
      const secretId = randomUUID();
      const hostname = `hooks-${index}.example.com`;
      const url = `https://${hostname}/${selected}/${index}`;
      const signingSecret = await Effect.runPromise(crypto.generateSigningSecret());
      const destinationCiphertext = await Effect.runPromise(
        crypto.encrypt(url, {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          endpointId,
          resourceId: destinationId,
          purpose: "destination",
        }),
      );
      const secretCiphertext = await Effect.runPromise(
        crypto.encrypt(signingSecret, {
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          endpointId,
          resourceId: secretId,
          purpose: "signing_secret",
        }),
      );
      const [destinationFingerprint, secretFingerprint] = await Promise.all([
        Effect.runPromise(crypto.keyedFingerprint(url)),
        Effect.runPromise(crypto.shortFingerprint(signingSecret)),
      ]);
      await db.transaction(async (transaction) => {
        await transaction.insert(webhookEndpoint).values({
          id: endpointId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          name: `M11 load ${selected} ${index}`,
          state: "disabled",
          currentDestinationId: null,
          enabledAt: null,
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
          displayOrigin: `https://${hostname}`,
          ...destinationCiphertext,
          keyedFingerprint: destinationFingerprint,
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
          ...secretCiphertext,
          fingerprint: secretFingerprint,
          activatedAt: activeFrom,
          createdByUserId: scope.actorId,
          changedByUserId: scope.actorId,
          createdAt: activeFrom,
          updatedAt: activeFrom,
        });
        await transaction.insert(webhookEndpointSubscription).values({
          endpointId,
          workspaceId: scope.workspaceId,
          projectId: scope.projectId,
          environmentId: scope.environmentId,
          eventType: "cms.schema.published",
          activeFrom,
          createdByUserId: scope.actorId,
          createdAt: activeFrom,
        });
        await transaction
          .update(webhookEndpoint)
          .set({
            state: "enabled",
            currentDestinationId: destinationId,
            enabledAt: activeFrom,
            disabledAt: null,
          })
          .where(eq(webhookEndpoint.id, endpointId));
      });
      endpointIds.push(endpointId);
      destinationIds.push(destinationId);
      secretIds.push(secretId);
    }

    failureStage = "event_fixtures";
    for (let offset = 0; offset < eventIds.length; offset += insertChunkSize) {
      await db.insert(outboxEvent).values(
        eventIds.slice(offset, offset + insertChunkSize).map((id, index) => {
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
            occurredAt: now,
            availableAt: now,
          };
        }),
      );
    }

    failureStage = "dispatch";
    const repository = makeWebhookWorkerRepository();
    let dispatched = 0;
    while (true) {
      const batch = await Effect.runPromise(repository.dispatchBatch(new Date(), 100));
      dispatched += batch.deliveries;
      if (batch.claimed === 0) break;
    }
    const expectedDeliveries = selectedSettings.events * selectedSettings.endpoints;
    if (dispatched !== expectedDeliveries) throw new Error("Attempt-load fan-out mismatch.");

    failureStage = "attempts";
    const liveClock = Clock.make();
    const fixedEpochMs = Date.now();
    const attemptClock: Clock.Clock =
      selected === "retry_storm"
        ? {
            ...liveClock,
            unsafeCurrentTimeMillis: () => fixedEpochMs,
            unsafeCurrentTimeNanos: () => BigInt(fixedEpochMs) * 1_000_000n,
            currentTimeMillis: Effect.succeed(fixedEpochMs),
            currentTimeNanos: Effect.succeed(BigInt(fixedEpochMs) * 1_000_000n),
            sleep: liveClock.sleep,
          }
        : liveClock;
    const layer = Layer.mergeAll(
      Layer.succeed(WebhookWorkerRepository, repository),
      Layer.succeed(WebhookCrypto, crypto),
      Layer.succeed(WebhookDestinationValidator, {
        validate: (url) => {
          const destination = new URL(url);
          return Effect.succeed({
            url,
            hostname: destination.hostname,
            displayOrigin: destination.origin,
            addresses: ["127.0.0.1"],
          });
        },
      }),
      Layer.succeed(WebhookTransport, makeWebhookTransport(tls.adapter)),
      Layer.succeed(WebhookTelemetry, {
        recordDispatchPoll: () => Effect.void,
        recordProjection: () => Effect.void,
        recordAttempt: () => Effect.void,
        recordLeaseRecovery: () => Effect.void,
        recordGracefulShutdown: () => Effect.void,
      }),
    );
    const startedAt = performance.now();
    const initialHeap = process.memoryUsage().heapUsed;
    let maximumHeap = initialHeap;
    let attempted = 0;
    let firstHealthyCompletionMs: number | null = null;
    while (true) {
      const executions = Array.from({ length: selectedSettings.slots }, async () => {
        const result = await Effect.runPromise(
          runOneWebhookAttempt().pipe(
            Effect.withClock(attemptClock),
            Effect.provide(layer),
            Effect.either,
          ),
        );
        if (Either.isRight(result)) return { ok: true as const, value: result.right };
        return {
          ok: false as const,
          category:
            "operation" in result.left && typeof result.left.operation === "string"
              ? result.left.operation
              : result.left._tag,
        };
      });
      const healthyMonitor =
        selected === "slow_isolation" && firstHealthyCompletionMs === null
          ? (async () => {
              while (performance.now() - startedAt < 5_000) {
                const [healthy] = await db
                  .select({ count: sql<number>`count(*)::int` })
                  .from(webhookDelivery)
                  .where(
                    sql`${webhookDelivery.endpointId} <> ${endpointIds[0]} and ${webhookDelivery.status} = 'succeeded'`,
                  );
                if ((healthy?.count ?? 0) === 9) {
                  firstHealthyCompletionMs = performance.now() - startedAt;
                  return;
                }
                await new Promise((resolve) => setTimeout(resolve, 25));
              }
            })()
          : Promise.resolve();
      const outcomes = await Promise.all(executions);
      await healthyMonitor;
      const failures = outcomes.filter((outcome) => !outcome.ok);
      if (failures.length > 0) {
        failureCounts = Object.fromEntries(
          [...new Set(failures.map((failure) => failure.category))].map((category) => [
            category,
            failures.filter((failure) => failure.category === category).length,
          ]),
        );
        throw new Error("Attempt-load worker operation failed.");
      }
      const claimed = outcomes.filter((outcome) => outcome.ok && outcome.value);
      attempted += claimed.length;
      maximumHeap = Math.max(maximumHeap, process.memoryUsage().heapUsed);
      if (claimed.length === 0) break;
    }
    const durationMs = performance.now() - startedAt;
    failureStage = "reconciliation";
    const status = selected === "retry_storm" ? "retry_scheduled" : "succeeded";
    const [[deliveryCounts], [attemptCounts]] = await Promise.all([
      db
        .select({
          deliveries: sql<number>`count(*)::int`,
          terminal: sql<number>`count(*) filter (where ${webhookDelivery.status} = ${status} or (${selected === "slow_isolation"} and ${webhookDelivery.status} = 'retry_scheduled'))::int`,
        })
        .from(webhookDelivery)
        .where(inArray(webhookDelivery.endpointId, endpointIds)),
      db
        .select({ attempts: sql<number>`count(*)::int` })
        .from(webhookDeliveryAttempt)
        .where(inArray(webhookDeliveryAttempt.endpointId, endpointIds)),
    ]);
    if (attempted !== expectedDeliveries) {
      failureStage = "reconcile_processed";
      failureCounts = { expected: expectedDeliveries, actual: attempted };
    } else if (deliveryCounts?.deliveries !== expectedDeliveries)
      failureStage = "reconcile_deliveries";
    else if (deliveryCounts?.terminal !== expectedDeliveries) failureStage = "reconcile_status";
    else if (attemptCounts?.attempts !== expectedDeliveries) failureStage = "reconcile_attempts";
    else if (tls.requests() !== expectedDeliveries) {
      failureStage = "reconcile_requests";
      failureCounts = { expected: expectedDeliveries, actual: tls.requests() };
      process.stderr.write(
        `${JSON.stringify({ event: "webhook.attempt_load.transport_categories", categories: tls.transportErrors() })}\n`,
      );
    } else if (tls.invalidSni() !== 0) failureStage = "reconcile_sni";
    if (failureStage.startsWith("reconcile_")) {
      throw new Error("Attempt-load reconciliation failed.");
    }
    if (selected === "retry_storm") {
      const invalidSchedule = await db.execute(sql`select count(*)::int as count
        from webhook_delivery where endpoint_id = ${endpointIds[0]}
        and (next_attempt_at < updated_at + interval '15 seconds' or next_attempt_at >= updated_at + interval '30 seconds')`);
      if (Number(invalidSchedule.rows[0]?.count) !== 0) {
        throw new Error("Retry jitter bounds failed.");
      }
      const idle = await Effect.runPromise(
        runOneWebhookAttempt().pipe(Effect.withClock(attemptClock), Effect.provide(layer)),
      );
      if (idle) throw new Error("Retry storm hot-polled future work.");
    }
    const passed =
      (selectedSettings.targetDurationMs === null ||
        durationMs <= selectedSettings.targetDurationMs) &&
      maximumHeap - initialHeap < 256 * 1_024 * 1_024 &&
      (selected !== "single_endpoint" || expectedDeliveries / (durationMs / 1_000) >= 25) &&
      (selected !== "slow_isolation" ||
        (firstHealthyCompletionMs !== null && firstHealthyCompletionMs < 2_000));
    process.stdout.write(
      `${JSON.stringify({
        profile: selected,
        events: selectedSettings.events,
        endpoints: selectedSettings.endpoints,
        deliveries: expectedDeliveries,
        durationMs: Math.round(durationMs),
        attemptsPerSecond: Math.round((expectedDeliveries / durationMs) * 100_000) / 100,
        firstHealthyCompletionMs:
          firstHealthyCompletionMs === null ? null : Math.round(firstHealthyCompletionMs),
        heapGrowthBytes: Math.max(0, maximumHeap - initialHeap),
        targetDurationMs: selectedSettings.targetDurationMs,
        passed,
      })}\n`,
    );
    if (!passed) throw new Error("Attempt-load target failed.");
  } finally {
    if (endpointIds.length > 0) {
      await db
        .delete(webhookDeliveryAttempt)
        .where(inArray(webhookDeliveryAttempt.endpointId, endpointIds));
      await db.delete(webhookDelivery).where(inArray(webhookDelivery.endpointId, endpointIds));
      await db
        .delete(webhookEndpointSubscription)
        .where(inArray(webhookEndpointSubscription.endpointId, endpointIds));
      await db
        .update(webhookEndpoint)
        .set({
          state: "disabled",
          currentDestinationId: null,
          enabledAt: null,
          disabledAt: new Date(),
        })
        .where(inArray(webhookEndpoint.id, endpointIds));
      await db.delete(webhookEndpointSecret).where(inArray(webhookEndpointSecret.id, secretIds));
      await db
        .delete(webhookEndpointDestination)
        .where(inArray(webhookEndpointDestination.id, destinationIds));
      await db.delete(webhookEndpoint).where(inArray(webhookEndpoint.id, endpointIds));
    }
    for (let offset = 0; offset < eventIds.length; offset += insertChunkSize) {
      const ids = eventIds.slice(offset, offset + insertChunkSize);
      await db.delete(publicationEvent).where(inArray(publicationEvent.eventId, ids));
      await db.delete(outboxEvent).where(inArray(outboxEvent.id, ids));
    }
    await tls.close();
  }
}

main().then(
  () => process.exit(0),
  () => {
    process.stderr.write(
      `${JSON.stringify({ event: "webhook.attempt_load.failed", stage: failureStage, counts: failureCounts })}\n`,
    );
    process.exit(1);
  },
);
