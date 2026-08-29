// Temporarily republishes a bounded subset of the deterministic fixture to exercise the 4 MiB Delivery response gate.

import { randomUUID } from "node:crypto";

import { Effect, Schema } from "effect";

const serverEnvironmentPath = "../../apps/server/.env";
const loadEnvironmentPath = "../../delivery-load.env";
process.loadEnvFile(serverEnvironmentPath);
process.loadEnvFile(loadEnvironmentPath);

const mode = process.argv.includes("--prepare")
  ? "prepare"
  : process.argv.includes("--restore")
    ? "restore"
    : null;
if (mode === null) throw new Error("Choose exactly one of --prepare or --restore.");

const projectId = process.env.DELIVERY_PROJECT_ID ?? "";
const collectionKey = process.env.DELIVERY_COLLECTION_KEY ?? "";
const environmentKey = process.env.DELIVERY_ENVIRONMENT_KEY ?? "main";
const locale = process.env.DELIVERY_LOCALE ?? "en";
const entryIds = (process.env.DELIVERY_ENTRY_IDS ?? "").split(",").filter(Boolean);
const slugs = (process.env.DELIVERY_UNIQUE_VALUES ?? "").split(",").filter(Boolean);
const fixtureCount = 32;

if (!Schema.is(Schema.UUID)(projectId)) throw new Error("DELIVERY_PROJECT_ID must be a UUID.");
if (!/^[a-z][a-z0-9_]{0,62}$/u.test(collectionKey)) {
  throw new Error("DELIVERY_COLLECTION_KEY must be canonical.");
}
if (entryIds.length < fixtureCount || slugs.length < fixtureCount) {
  throw new Error(`The boundary gate requires at least ${fixtureCount} paired fixture samples.`);
}

const fixture = entryIds.slice(0, fixtureCount).map((entryId, index) => {
  const slug = slugs[index] ?? "";
  const match = /^load-entry-(\d{5})$/u.exec(slug);
  if (!Schema.is(Schema.UUID)(entryId) || match?.[1] === undefined) {
    throw new Error("Boundary fixture identifiers do not match the deterministic fixture.");
  }
  return { entryId, index: Number(match[1]) };
});

const [
  { db },
  query,
  cms,
  platformSchema,
  { AuthUserId },
  entryContracts,
  publicationContracts,
  { makeEntryRepository },
  { makePublicationRepository },
] = await Promise.all([
  import("@framerfordevs/db"),
  import("@framerfordevs/db/query"),
  import("@framerfordevs/db/schema/cms"),
  import("@framerfordevs/db/schema/platform"),
  import("../../../contracts/platform"),
  import("../../../contracts/entry"),
  import("../../../contracts/publication"),
  import("../../../services/entry/repository"),
  import("../../../services/publication/repository"),
]);

const entries = makeEntryRepository();
const publications = makePublicationRepository();
const run = Effect.runPromise;

function originalBody(index: number): string {
  return `Load fixture ${String(index).padStart(5, "0")} `.repeat(210).slice(0, 3_900);
}

function desiredValues(index: number) {
  return mode === "prepare"
    ? { title: "M9 Oversized Boundary", body: "界".repeat(49_000) }
    : {
        title: `Load Group ${String(index % 100).padStart(2, "0")}`,
        body: originalBody(index),
      };
}

try {
  const [authority] = await db
    .select({
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
    throw new Error("The boundary fixture collection must have a published schema.");
  }

  const fieldRows = await db
    .select({
      fieldId: cms.cmsSchemaRevisionField.fieldId,
      apiKey: cms.cmsSchemaRevisionField.apiKey,
    })
    .from(cms.cmsSchemaRevisionField)
    .where(
      query.and(
        query.eq(cms.cmsSchemaRevisionField.revisionId, authority.revisionId),
        query.inArray(cms.cmsSchemaRevisionField.apiKey, ["title", "body"]),
      ),
    );
  const fieldIds = new Map(fieldRows.map((row) => [row.apiKey, row.fieldId]));
  const titleFieldId = fieldIds.get("title");
  const bodyFieldId = fieldIds.get("body");
  if (titleFieldId === undefined || bodyFieldId === undefined) {
    throw new Error("The boundary fixture requires title and body fields.");
  }

  const actorId = Schema.decodeUnknownSync(AuthUserId)(authority.actorId);
  const scope = {
    projectId,
    environmentId: authority.environmentId,
    collectionId: authority.collectionId,
    locale,
  };
  let next = 0;
  let completed = 0;

  const updateEntry = async (item: (typeof fixture)[number]) => {
    let draft = await run(
      entries.getDraft(
        actorId,
        Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)({
          ...scope,
          entryId: item.entryId,
        }),
      ),
    );
    const desired = desiredValues(item.index);
    const localizedMutations = [
      ...(Reflect.get(draft.localizedValues, titleFieldId) === desired.title
        ? []
        : [{ operation: "set" as const, path: [titleFieldId], value: desired.title }]),
      ...(Reflect.get(draft.localizedValues, bodyFieldId) === desired.body
        ? []
        : [{ operation: "set" as const, path: [bodyFieldId], value: desired.body }]),
    ];
    if (localizedMutations.length > 0) {
      await run(
        entries.saveDraft(
          actorId,
          Schema.decodeUnknownSync(entryContracts.SaveEntryDraftInput)({
            ...scope,
            entryId: item.entryId,
            schemaRevisionId: draft.schemaRevisionId,
            contractHash: draft.contractHash,
            commandId: randomUUID(),
            expectedSharedVersion: draft.sharedVersion,
            expectedLocalizedVersion: draft.localizedVersion,
            sharedMutations: [],
            localizedMutations,
          }),
          new Date(),
          `m9-load-boundary-${mode}-save`,
        ),
      );
      draft = await run(
        entries.getDraft(
          actorId,
          Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)({
            ...scope,
            entryId: item.entryId,
          }),
        ),
      );
    }

    const publicationScope = Schema.decodeUnknownSync(
      publicationContracts.ValidateEntryPublicationInput,
    )({ ...scope, entryId: item.entryId });
    const plan = await run(publications.validate(actorId, publicationScope, new Date()));
    if (!plan.valid || plan.authorityHash === null) {
      throw new Error("Boundary publication validation failed.");
    }
    if (plan.wouldCreatePublication) {
      await run(
        publications.publish(
          actorId,
          Schema.decodeUnknownSync(publicationContracts.PublishEntryInput)({
            ...scope,
            entryId: item.entryId,
            commandId: randomUUID(),
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
          `m9-load-boundary-${mode}-publish`,
        ),
      );
    }
    completed += 1;
    if (completed % 8 === 0 || completed === fixture.length) {
      process.stdout.write(
        `${mode === "prepare" ? "Prepared" : "Restored"} ${completed}/${fixture.length} boundary publications.\n`,
      );
    }
  };

  const worker = async () => {
    while (true) {
      const item = fixture[next];
      next += 1;
      if (item === undefined) return;
      await updateEntry(item);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  const [snapshotSummary] = await db
    .select({
      currentCount: query.sql<number>`count(*)::int`,
      maximumBytes: query.sql<number>`max(${cms.cmsEntryLocaleDeliverySnapshot.canonicalCombinedBytes})::int`,
    })
    .from(cms.cmsEntryLocalePublicationHead)
    .innerJoin(
      cms.cmsEntryLocaleDeliverySnapshot,
      query.eq(
        cms.cmsEntryLocaleDeliverySnapshot.publicationId,
        cms.cmsEntryLocalePublicationHead.currentPublicationId,
      ),
    )
    .where(query.eq(cms.cmsEntryLocalePublicationHead.collectionId, authority.collectionId));
  process.stdout.write(
    `Boundary fixture ${mode} complete: ${snapshotSummary?.currentCount ?? 0} current publications, maximum ${snapshotSummary?.maximumBytes ?? 0} canonical bytes.\n`,
  );
} finally {
  await db.$client.end();
}
