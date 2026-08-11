// Creates the operator-approved deterministic M9 load fixture and writes one-time secrets only to ignored local environment files.

import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { Effect, Schema } from "effect";

const serverEnvironmentPath = "../../apps/server/.env";
const loadEnvironmentPath = "../../delivery-load.env";
process.loadEnvFile(serverEnvironmentPath);
process.loadEnvFile(loadEnvironmentPath);

const projectId = process.env.DELIVERY_PROJECT_ID ?? "";
const collectionKey = process.env.DELIVERY_COLLECTION_KEY ?? "";
const environmentKey = process.env.DELIVERY_ENVIRONMENT_KEY ?? "main";
const locale = process.env.DELIVERY_LOCALE ?? "en";
const requestedEntryCount = Number(
  process.argv.find((argument) => argument.startsWith("--entries="))?.slice("--entries=".length) ??
    "10000",
);
const requestedCredentialCount = Number(
  process.argv
    .find((argument) => argument.startsWith("--credentials="))
    ?.slice("--credentials=".length) ?? "20",
);
const concurrency = Number(
  process.argv
    .find((argument) => argument.startsWith("--concurrency="))
    ?.slice("--concurrency=".length) ?? "6",
);
const credentialsOnly = process.argv.includes("--credentials-only");

if (!Schema.is(Schema.UUID)(projectId)) throw new Error("DELIVERY_PROJECT_ID must be a UUID.");
if (!/^[a-z][a-z0-9_]{0,62}$/u.test(collectionKey)) {
  throw new Error("DELIVERY_COLLECTION_KEY must be a canonical collection key.");
}
if (
  !Number.isInteger(requestedEntryCount) ||
  requestedEntryCount < 2 ||
  requestedEntryCount > 10_000
) {
  throw new Error("--entries must be from 2 through 10000.");
}
if (
  !Number.isInteger(requestedCredentialCount) ||
  requestedCredentialCount < 1 ||
  requestedCredentialCount > 40
) {
  throw new Error("--credentials must be from 1 through 40.");
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
  throw new Error("--concurrency must be from 1 through 8.");
}

function deterministicUuid(label: string): string {
  const bytes = createHash("sha256")
    .update(`framerfordevs:m9-load:${projectId}:${collectionKey}:${label}`, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] ?? 0) & 0x0f;
  bytes[6] |= 0x50;
  bytes[8] = (bytes[8] ?? 0) & 0x3f;
  bytes[8] |= 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function encodeEnvironmentValue(value: string): string {
  return JSON.stringify(value);
}

async function setEnvironmentValue(path: string, key: string, value: string): Promise<void> {
  const source = await readFile(path, "utf8").catch(() => "");
  const line = `${key}=${encodeEnvironmentValue(value)}`;
  const expression = new RegExp(`^${key}=.*$`, "mu");
  const next = expression.test(source)
    ? source.replace(expression, line)
    : `${source}${source.endsWith("\n") || source.length === 0 ? "" : "\n"}${line}\n`;
  await writeFile(path, next, { encoding: "utf8", mode: 0o600 });
}

async function ensureRuntimeEnvironment(): Promise<void> {
  const source = await readFile(serverEnvironmentPath, "utf8").catch(() => "");
  const hasValue = (key: string) => new RegExp(`^${key}=.+$`, "mu").test(source);
  await setEnvironmentValue(serverEnvironmentPath, "NODE_ENV", "production");
  await setEnvironmentValue(serverEnvironmentPath, "APPLICATION_LOG_LEVEL", "error");
  await setEnvironmentValue(serverEnvironmentPath, "DELIVERY_API_ENABLED", "true");
  await setEnvironmentValue(serverEnvironmentPath, "RATE_LIMIT_STORE", "redis");
  await setEnvironmentValue(serverEnvironmentPath, "RATE_LIMIT_REDIS_URL", "redis://redis:6379");
  await setEnvironmentValue(serverEnvironmentPath, "RATE_LIMIT_REDIS_TIMEOUT_MS", "100");
  if (!hasValue("RATE_LIMIT_FINGERPRINT_SECRET")) {
    await setEnvironmentValue(
      serverEnvironmentPath,
      "RATE_LIMIT_FINGERPRINT_SECRET",
      randomBytes(48).toString("base64url"),
    );
  }
  if (!hasValue("DELIVERY_CURSOR_SECRET")) {
    await setEnvironmentValue(
      serverEnvironmentPath,
      "DELIVERY_CURSOR_SECRET",
      randomBytes(48).toString("base64url"),
    );
  }
}

const [
  { db },
  query,
  cms,
  platformSchema,
  { AuthUserId },
  entryContracts,
  publicationContracts,
  accessContracts,
  { makeEntryRepository },
  { makePublicationRepository },
  { makeCredentialRepository },
  { makeSecretGenerator },
] = await Promise.all([
  import("@framerfordevs/db"),
  import("@framerfordevs/db/query"),
  import("@framerfordevs/db/schema/cms"),
  import("@framerfordevs/db/schema/platform"),
  import("../contracts/platform"),
  import("../contracts/entries"),
  import("../contracts/publications"),
  import("../contracts/access"),
  import("../services/entry-repository"),
  import("../services/publication-repository"),
  import("../services/credential-repository"),
  import("../services/secret-generator"),
]);

const entries = makeEntryRepository();
const publications = makePublicationRepository();
const credentials = makeCredentialRepository();
const secrets = makeSecretGenerator();
const run = Effect.runPromise;

try {
  const [authority] = await db
    .select({
      workspaceId: platformSchema.project.workspaceId,
      actorId: platformSchema.project.createdByUserId,
      environmentId: platformSchema.environment.id,
      collectionId: cms.cmsCollection.id,
      revisionId: cms.cmsCollectionSchemaHead.currentPublishedRevisionId,
    })
    .from(platformSchema.project)
    .innerJoin(
      platformSchema.environment,
      query.and(
        query.eq(platformSchema.environment.projectId, platformSchema.project.id),
        query.eq(platformSchema.environment.key, environmentKey),
      ),
    )
    .innerJoin(
      cms.cmsCollection,
      query.and(
        query.eq(cms.cmsCollection.projectId, platformSchema.project.id),
        query.eq(cms.cmsCollection.environmentId, platformSchema.environment.id),
        query.eq(cms.cmsCollection.apiKey, collectionKey),
      ),
    )
    .innerJoin(
      cms.cmsCollectionSchemaHead,
      query.eq(cms.cmsCollectionSchemaHead.collectionId, cms.cmsCollection.id),
    )
    .where(query.eq(platformSchema.project.id, projectId))
    .limit(1);
  if (authority?.revisionId === null || authority === undefined) {
    throw new Error("The configured collection must have a published schema.");
  }
  const actorId = Schema.decodeUnknownSync(AuthUserId)(authority.actorId);
  const scope = {
    projectId,
    environmentId: authority.environmentId,
    collectionId: authority.collectionId,
    locale,
  };
  const fieldRows = await db
    .select({
      fieldId: cms.cmsSchemaRevisionField.fieldId,
      apiKey: cms.cmsSchemaRevisionField.apiKey,
      kind: cms.cmsSchemaRevisionField.kind,
    })
    .from(cms.cmsSchemaRevisionField)
    .where(
      query.and(
        query.eq(cms.cmsSchemaRevisionField.revisionId, authority.revisionId),
        query.eq(cms.cmsSchemaRevisionField.nodeRole, "root"),
      ),
    );
  const fields = new Map(fieldRows.map((row) => [row.apiKey, row]));
  const expectedKinds = new Map([
    ["title", "short_text"],
    ["slug", "slug"],
    ["category", "short_text"],
    ["region", "short_text"],
    ["segment", "short_text"],
    ["author_code", "short_text"],
    ["related_entry", "reference"],
    ["body", "long_text"],
  ]);
  for (const [apiKey, kind] of expectedKinds) {
    if (fields.get(apiKey)?.kind !== kind) {
      throw new Error(`The published fixture field ${apiKey} must use kind ${kind}.`);
    }
  }

  const targetRows = await db
    .select({ entryId: cms.cmsEntry.id })
    .from(cms.cmsEntry)
    .innerJoin(
      cms.cmsEntryLocalePublicationHead,
      query.and(
        query.eq(cms.cmsEntryLocalePublicationHead.entryId, cms.cmsEntry.id),
        query.sql`${cms.cmsEntryLocalePublicationHead.currentPublicationId} is not null`,
      ),
    )
    .where(query.eq(cms.cmsEntry.collectionId, authority.collectionId))
    .orderBy(cms.cmsEntry.createdAt, cms.cmsEntry.id)
    .limit(1);
  const targetEntryId = targetRows[0]?.entryId;
  if (targetEntryId === undefined) {
    throw new Error("Publish one manual target entry before preparing the load fixture.");
  }
  const targetDraft = await run(
    entries.getDraft(
      actorId,
      Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)({
        ...scope,
        entryId: targetEntryId,
      }),
    ),
  );

  await ensureRuntimeEnvironment();
  const generatedCredentials: Array<string> = [];
  const credentialRun = deterministicUuid("credential-run").slice(0, 8);
  for (let index = 1; index <= requestedCredentialCount; index += 1) {
    const credentialId = await run(credentials.allocateCredentialId());
    const material = await run(secrets.generateCredentialMaterial("delivery", credentialId));
    await run(
      credentials.issueCredential(
        actorId,
        Schema.decodeUnknownSync(accessContracts.IssueApiCredentialInput)({
          projectId,
          environmentId: authority.environmentId,
          family: "delivery",
          name: `M9 load ${credentialRun}-${String(index).padStart(2, "0")}`,
          scopes: ["delivery.read"],
          expiresAt: null,
        }),
        credentialId,
        material,
        new Date(),
        `m9-load-credential-${credentialRun}-${index}`,
      ),
    );
    generatedCredentials.push(material.key);
    await setEnvironmentValue(
      loadEnvironmentPath,
      "DELIVERY_CREDENTIALS",
      generatedCredentials.join(","),
    );
  }
  process.stdout.write(`Issued ${generatedCredentials.length} Delivery load credentials.\n`);

  if (!credentialsOnly) {
    const valueByApiKey = (index: number): Readonly<Record<string, unknown>> => ({
      title: `Load Group ${String(index % 100).padStart(2, "0")}`,
      slug: `load-entry-${String(index).padStart(5, "0")}`,
      category: `category-${index % 10}`,
      region: `region-${index % 8}`,
      segment: `segment-${index % 6}`,
      author_code: `author-${String(index % 250).padStart(3, "0")}`,
      related_entry: targetEntryId,
      body: `Load fixture ${String(index).padStart(5, "0")} `.repeat(210).slice(0, 3_900),
    });
    const generated: Array<{ readonly entryId: string; readonly slug: string }> = [];
    let nextIndex = 1;
    let completed = 0;
    const generatedCount = requestedEntryCount - 1;

    const prepareEntry = async (index: number) => {
      const createCommandId = deterministicUuid(`entry:${index}:create`);
      const created = await run(
        entries.createEntry(
          actorId,
          Schema.decodeUnknownSync(entryContracts.CreateEntryInput)({
            ...scope,
            displayName: `M9 Load ${String(index).padStart(5, "0")}`,
            schemaRevisionId: targetDraft.schemaRevisionId,
            contractHash: targetDraft.contractHash,
            commandId: createCommandId,
          }),
          new Date(),
          `m9-load-entry-create-${index}`,
        ),
      );
      let draft = await run(
        entries.getDraft(
          actorId,
          Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)({
            ...scope,
            entryId: created.id,
          }),
        ),
      );
      const values = valueByApiKey(index);
      if (draft.localizedVersion === 0) {
        const localizedMutations = [...expectedKinds.keys()].map((apiKey) => ({
          operation: "set" as const,
          path: [fields.get(apiKey)?.fieldId],
          value: Reflect.get(values, apiKey),
        }));
        if (localizedMutations.some((mutation) => mutation.path[0] === undefined)) {
          throw new Error("A fixture field identity is unavailable.");
        }
        await run(
          entries.saveDraft(
            actorId,
            Schema.decodeUnknownSync(entryContracts.SaveEntryDraftInput)({
              ...scope,
              entryId: created.id,
              schemaRevisionId: draft.schemaRevisionId,
              contractHash: draft.contractHash,
              commandId: deterministicUuid(`entry:${index}:save`),
              expectedSharedVersion: draft.sharedVersion,
              expectedLocalizedVersion: draft.localizedVersion,
              sharedMutations: [],
              localizedMutations,
            }),
            new Date(),
            `m9-load-entry-save-${index}`,
          ),
        );
        draft = await run(
          entries.getDraft(
            actorId,
            Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)({
              ...scope,
              entryId: created.id,
            }),
          ),
        );
      }
      const publicationScope = Schema.decodeUnknownSync(
        publicationContracts.ValidateEntryPublicationInput,
      )({ ...scope, entryId: created.id });
      const plan = await run(publications.validate(actorId, publicationScope, new Date()));
      if (!plan.valid || plan.authorityHash === null) {
        const issueCodes = plan.issues.map((issue) => issue.code).join(",");
        throw new Error(`Fixture publication validation failed (${issueCodes || "unknown"}).`);
      }
      if (plan.wouldCreatePublication) {
        await run(
          publications.publish(
            actorId,
            Schema.decodeUnknownSync(publicationContracts.PublishEntryInput)({
              ...scope,
              entryId: created.id,
              commandId: deterministicUuid(`entry:${index}:publish`),
              authorityHash: plan.authorityHash,
              expectedStateVersion: plan.stateVersion,
              expectedPublicationId: plan.currentPublicationId,
              expectedSchemaRevisionId: plan.schemaRevisionId,
              expectedContractHash: plan.contractHash,
              expectedSharedVersion: plan.sharedVersion,
              expectedSharedRevisionId: plan.sharedRevisionId,
              expectedLocalizedVersion: plan.localizedVersion,
              expectedLocalizedRevisionId: plan.localizedRevisionId,
            }),
            new Date(),
            `m9-load-entry-publish-${index}`,
          ),
        );
      }
      if (generated.length < 50) {
        generated.push({ entryId: created.id, slug: String(Reflect.get(values, "slug")) });
      }
      completed += 1;
      if (completed % 100 === 0 || completed === generatedCount) {
        process.stdout.write(`Prepared ${completed}/${generatedCount} generated publications.\n`);
      }
    };

    const worker = async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index > generatedCount) return;
        await prepareEntry(index);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    generated.sort((left, right) => left.slug.localeCompare(right.slug));
    await setEnvironmentValue(
      loadEnvironmentPath,
      "DELIVERY_ENTRY_IDS",
      generated.map((item) => item.entryId).join(","),
    );
    await setEnvironmentValue(
      loadEnvironmentPath,
      "DELIVERY_UNIQUE_VALUES",
      generated.map((item) => item.slug).join(","),
    );
    await setEnvironmentValue(loadEnvironmentPath, "DELIVERY_FILTER_VALUE", "Load Group 00");
    process.stdout.write(
      `Delivery load fixture is ready with ${requestedEntryCount} current publications. Secrets were written only to ignored local environment files.\n`,
    );
  }
} finally {
  await db.$client.end();
}
