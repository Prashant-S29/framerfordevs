// Creates, verifies, rotates, and removes one secret-safe Docker key-continuity fixture.

import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { eq, sql } from "@framerfordevs/db/query";
import {
  webhookEndpoint,
  webhookEndpointDestination,
  webhookEndpointSecret,
} from "@framerfordevs/db/schema/webhooks";
import { Effect } from "effect";

import { makeWebhookCrypto } from "../services/webhook-crypto";
import { parseWebhookKeyRing } from "../services/webhook-key-ring";

const destinations = [
  "https://hooks.example.com/m11-key-continuity/first",
  "https://hooks.example.com/m11-key-continuity/second",
] as const;

interface FixtureScope {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly actorId: string;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("The key-continuity fixture authority is unavailable.");
  }
  return value;
}

async function fixtureScope(): Promise<FixtureScope> {
  const result = await db.execute(sql`select
    r.workspace_id as "workspaceId",
    r.project_id as "projectId",
    r.environment_id as "environmentId",
    r.published_by_user_id as "actorId"
    from cms_schema_revision r
    order by r.id
    limit 1`);
  const row = result.rows[0];
  return {
    workspaceId: text(row?.workspaceId),
    projectId: text(row?.projectId),
    environmentId: text(row?.environmentId),
    actorId: text(row?.actorId),
  };
}

function fixtureCrypto() {
  const ring = parseWebhookKeyRing(
    process.env.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID,
    process.env.WEBHOOK_ENCRYPTION_KEYS,
  );
  if (ring === null) throw new Error("A key ring is required for the continuity fixture.");
  return makeWebhookCrypto(ring);
}

async function createFixture() {
  const scope = await fixtureScope();
  const crypto = fixtureCrypto();
  const endpointId = randomUUID();
  const destinationId = randomUUID();
  const secretId = randomUUID();
  const now = new Date();
  const signingSecret = await Effect.runPromise(crypto.generateSigningSecret());
  const destinationCiphertext = await Effect.runPromise(
    crypto.encrypt(destinations[0], {
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
    Effect.runPromise(crypto.keyedFingerprint(destinations[0])),
    Effect.runPromise(crypto.shortFingerprint(signingSecret)),
  ]);

  await db.transaction(async (transaction) => {
    await transaction.insert(webhookEndpoint).values({
      id: endpointId,
      ...scope,
      name: `M11 key continuity ${endpointId.slice(0, 8)}`,
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
      ...scope,
      sequence: 1,
      displayOrigin: "https://hooks.example.com",
      ...destinationCiphertext,
      keyedFingerprint: destinationFingerprint,
      createdByUserId: scope.actorId,
      createdAt: now,
    });
    await transaction.insert(webhookEndpointSecret).values({
      id: secretId,
      endpointId,
      ...scope,
      sequence: 1,
      state: "active",
      ...secretCiphertext,
      fingerprint: secretFingerprint,
      activatedAt: now,
      createdByUserId: scope.actorId,
      changedByUserId: scope.actorId,
      createdAt: now,
      updatedAt: now,
    });
    await transaction
      .update(webhookEndpoint)
      .set({ currentDestinationId: destinationId })
      .where(eq(webhookEndpoint.id, endpointId));
  });
  process.stdout.write(`${endpointId}\n`);
}

async function rotateFixture(endpointId: string) {
  const crypto = fixtureCrypto();
  const [endpoint] = await db
    .select()
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, endpointId))
    .limit(1);
  if (!endpoint) throw new Error("The key-continuity fixture is unavailable.");
  const destinationId = randomUUID();
  const encrypted = await Effect.runPromise(
    crypto.encrypt(destinations[1], {
      workspaceId: endpoint.workspaceId,
      projectId: endpoint.projectId,
      environmentId: endpoint.environmentId,
      endpointId,
      resourceId: destinationId,
      purpose: "destination",
    }),
  );
  const fingerprint = await Effect.runPromise(crypto.keyedFingerprint(destinations[1]));
  const [sequenceRow] = await db
    .select({ maximum: sql<number>`coalesce(max(${webhookEndpointDestination.sequence}), 0)::int` })
    .from(webhookEndpointDestination)
    .where(eq(webhookEndpointDestination.endpointId, endpointId));
  const sequence = (sequenceRow?.maximum ?? 0) + 1;
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction.insert(webhookEndpointDestination).values({
      id: destinationId,
      endpointId,
      workspaceId: endpoint.workspaceId,
      projectId: endpoint.projectId,
      environmentId: endpoint.environmentId,
      sequence,
      displayOrigin: "https://hooks.example.com",
      ...encrypted,
      keyedFingerprint: fingerprint,
      createdByUserId: endpoint.changedByUserId,
      createdAt: now,
    });
    await transaction
      .update(webhookEndpoint)
      .set({ currentDestinationId: destinationId, updatedAt: now })
      .where(eq(webhookEndpoint.id, endpointId));
  });
}

async function verifyFixture(endpointId: string) {
  const crypto = fixtureCrypto();
  const [endpoint] = await db
    .select()
    .from(webhookEndpoint)
    .where(eq(webhookEndpoint.id, endpointId))
    .limit(1);
  if (!endpoint) throw new Error("The key-continuity fixture is unavailable.");
  const [storedDestinations, storedSecrets] = await Promise.all([
    db
      .select()
      .from(webhookEndpointDestination)
      .where(eq(webhookEndpointDestination.endpointId, endpointId))
      .orderBy(webhookEndpointDestination.sequence),
    db
      .select()
      .from(webhookEndpointSecret)
      .where(eq(webhookEndpointSecret.endpointId, endpointId))
      .orderBy(webhookEndpointSecret.sequence),
  ]);
  for (const destination of storedDestinations) {
    const plaintext = await Effect.runPromise(
      crypto.decrypt(destination, {
        workspaceId: endpoint.workspaceId,
        projectId: endpoint.projectId,
        environmentId: endpoint.environmentId,
        endpointId,
        resourceId: destination.id,
        purpose: "destination",
      }),
    );
    if (plaintext !== destinations[destination.sequence - 1]) {
      throw new Error("A destination failed continuity verification.");
    }
  }
  for (const secret of storedSecrets) {
    if (secret.nonce === null || secret.ciphertext === null) {
      throw new Error("A signing secret is missing encrypted material.");
    }
    const plaintext = await Effect.runPromise(
      crypto.decrypt(
        {
          encryptionKeyId: secret.encryptionKeyId,
          nonce: secret.nonce,
          ciphertext: secret.ciphertext,
        },
        {
          workspaceId: endpoint.workspaceId,
          projectId: endpoint.projectId,
          environmentId: endpoint.environmentId,
          endpointId,
          resourceId: secret.id,
          purpose: "signing_secret",
        },
      ),
    );
    if (!plaintext.startsWith("whsec_")) {
      throw new Error("A signing secret failed continuity verification.");
    }
  }
  const current = storedDestinations.find(
    (destination) => destination.id === endpoint.currentDestinationId,
  );
  if (!current || current.encryptionKeyId !== process.env.WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID) {
    throw new Error("New ciphertext did not use the active encryption key.");
  }
}

async function cleanupFixture(endpointId: string) {
  const now = new Date();
  await db.transaction(async (transaction) => {
    await transaction
      .update(webhookEndpoint)
      .set({ currentDestinationId: null, state: "disabled", enabledAt: null, disabledAt: now })
      .where(eq(webhookEndpoint.id, endpointId));
    await transaction
      .delete(webhookEndpointSecret)
      .where(eq(webhookEndpointSecret.endpointId, endpointId));
    await transaction
      .delete(webhookEndpointDestination)
      .where(eq(webhookEndpointDestination.endpointId, endpointId));
    await transaction.delete(webhookEndpoint).where(eq(webhookEndpoint.id, endpointId));
  });
}

async function main() {
  const command = process.argv[2];
  const endpointId = process.argv[3];
  if (command === "create") return createFixture();
  if (endpointId === undefined || !/^[0-9a-f-]{36}$/u.test(endpointId)) {
    throw new Error("A fixture endpoint ID is required.");
  }
  if (command === "rotate") return rotateFixture(endpointId);
  if (command === "verify") return verifyFixture(endpointId);
  if (command === "cleanup") return cleanupFixture(endpointId);
  throw new Error("The key-continuity fixture command is unsupported.");
}

main().then(
  () => process.exit(0),
  () => {
    process.stderr.write("Webhook key-continuity fixture failed.\n");
    process.exit(1);
  },
);
