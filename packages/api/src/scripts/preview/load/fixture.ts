// Prepares or restores bounded Preview-only load fixtures through normal audited repositories.

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { Effect, Schema } from "effect";

const serverEnvironmentPath = "../../apps/server/.env";
const loadEnvironmentPath = "../../preview-load.env";
process.loadEnvFile(serverEnvironmentPath);
process.loadEnvFile(loadEnvironmentPath);

const mode = process.argv.includes("--prepare")
  ? "prepare"
  : process.argv.includes("--restore")
    ? "restore"
    : null;
if (mode === null) throw new Error("Choose exactly one of --prepare or --restore.");

const projectId = process.env.PREVIEW_PROJECT_ID ?? "";
const environmentKey = process.env.PREVIEW_ENVIRONMENT_KEY ?? "main";
const collectionKey = "m10_preview_boundary_v2";
const locale = "en";
if (!Schema.is(Schema.UUID)(projectId)) throw new Error("PREVIEW_PROJECT_ID must be a UUID.");

function encodeEnvironmentValue(value: string): string {
  return JSON.stringify(value);
}

async function setEnvironmentValue(key: string, value: string): Promise<void> {
  const source = await readFile(loadEnvironmentPath, "utf8").catch(() => "");
  const line = `${key}=${encodeEnvironmentValue(value)}`;
  const expression = new RegExp(`^${key}=.*$`, "mu");
  const next = expression.test(source)
    ? source.replace(expression, line)
    : `${source}${source.endsWith("\n") || source.length === 0 ? "" : "\n"}${line}\n`;
  await writeFile(loadEnvironmentPath, next, { encoding: "utf8", mode: 0o600 });
}

const [
  { db },
  query,
  cms,
  platformSchema,
  localeSchema,
  { AuthUserId },
  schemaContracts,
  entryContracts,
  { makeSchemaRepository },
  { makeEntryRepository },
] = await Promise.all([
  import("@framerfordevs/db"),
  import("@framerfordevs/db/query"),
  import("@framerfordevs/db/schema/cms"),
  import("@framerfordevs/db/schema/platform"),
  import("@framerfordevs/db/schema/locale"),
  import("../../../contracts/platform"),
  import("../../../contracts/schema"),
  import("../../../contracts/entry"),
  import("../../../services/schema/repository"),
  import("../../../services/entry/repository"),
]);

const [authority] = await db
  .select({
    actorId: platformSchema.project.createdByUserId,
    environmentId: platformSchema.environment.id,
  })
  .from(platformSchema.project)
  .innerJoin(
    platformSchema.environment,
    query.and(
      query.eq(platformSchema.environment.projectId, platformSchema.project.id),
      query.eq(platformSchema.environment.key, environmentKey),
    ),
  )
  .where(query.eq(platformSchema.project.id, projectId))
  .limit(1);
if (authority === undefined) throw new Error("The configured project environment was not found.");
const [localeRow] = await db
  .select({ id: localeSchema.projectLocale.id })
  .from(localeSchema.projectLocale)
  .where(
    query.and(
      query.eq(localeSchema.projectLocale.projectId, projectId),
      query.eq(localeSchema.projectLocale.tag, locale),
      query.eq(localeSchema.projectLocale.status, "enabled"),
    ),
  )
  .limit(1);
if (localeRow === undefined) throw new Error("The fixture requires enabled English.");

const actorId = Schema.decodeUnknownSync(AuthUserId)(authority.actorId);
const schemas = makeSchemaRepository();
const entries = makeEntryRepository();
const run = Effect.runPromise;
let [collection] = await db
  .select({ id: cms.cmsCollection.id })
  .from(cms.cmsCollection)
  .where(
    query.and(
      query.eq(cms.cmsCollection.projectId, projectId),
      query.eq(cms.cmsCollection.environmentId, authority.environmentId),
      query.eq(cms.cmsCollection.apiKey, collectionKey),
    ),
  )
  .limit(1);

if (mode === "prepare" && collection === undefined) {
  const created = await run(
    schemas.createCollection(
      actorId,
      Schema.decodeUnknownSync(schemaContracts.CreateCollectionInput)({
        projectId,
        environmentId: authority.environmentId,
        apiKey: collectionKey,
        displayName: "M10 Preview boundary",
        description: "Preview-only oversized response fixture",
      }),
      new Date(),
      "m10-preview-boundary-collection-create",
    ),
  );
  collection = { id: created.id };
}

if (mode === "prepare" && collection !== undefined) {
  let draft = await run(
    schemas.getDraft(
      actorId,
      Schema.decodeUnknownSync(schemaContracts.GetCollectionDraftInput)({
        projectId,
        environmentId: authority.environmentId,
        collectionId: collection.id,
      }),
    ),
  );
  for (let index = 1; index <= 100; index += 1) {
    if (
      draft.fields.some((field) => field.apiKey === `payload_${String(index).padStart(2, "0")}`)
    ) {
      continue;
    }
    draft = await run(
      schemas.createField(
        actorId,
        Schema.decodeUnknownSync(schemaContracts.CreateCollectionFieldInput)({
          projectId,
          environmentId: authority.environmentId,
          collectionId: collection.id,
          parentFieldId: null,
          draftVersion: draft.collection.draftVersion,
          field: {
            apiKey: `payload_${String(index).padStart(2, "0")}`,
            displayLabel: `Payload ${index}`,
            kind: "long_text",
            required: false,
            localization: index <= 34 ? "shared" : "localized",
            deprecated: false,
            editor: schemaContracts.defaultFieldEditorMetadata,
            configuration: index >= 68 ? { default: "界".repeat(7_000) } : {},
          },
        }),
        new Date(),
        `m10-preview-boundary-field-${index}`,
      ),
    );
  }
  const scope = {
    projectId,
    environmentId: authority.environmentId,
    collectionId: collection.id,
  };
  draft = await run(
    schemas.getDraft(
      actorId,
      Schema.decodeUnknownSync(schemaContracts.GetCollectionDraftInput)(scope),
    ),
  );
  const validation = await run(
    schemas.validateSchema(
      actorId,
      Schema.decodeUnknownSync(schemaContracts.ValidateCollectionSchemaInput)(scope),
    ),
  );
  if (!validation.valid) throw new Error("The Preview boundary schema did not validate.");
  await run(
    schemas.publishSchema(
      actorId,
      Schema.decodeUnknownSync(schemaContracts.PublishCollectionSchemaInput)({
        ...scope,
        draftVersion: draft.collection.draftVersion,
        expectedPublishedRevisionId: draft.collection.currentPublishedRevisionId,
        commandId: randomUUID(),
        acknowledgedChangeIds: validation.changes.items
          .filter((change) => change.classification !== "non_breaking")
          .map((change) => change.changeId),
      }),
      new Date(),
      "m10-preview-boundary-schema-publish",
    ),
  );
}

if (collection === undefined) {
  await setEnvironmentValue("PREVIEW_OVERSIZED_PATH", "");
  process.stdout.write("No Preview boundary fixture exists.\n");
  process.exit(0);
}

const draft = await run(
  schemas.getDraft(
    actorId,
    Schema.decodeUnknownSync(schemaContracts.GetCollectionDraftInput)({
      projectId,
      environmentId: authority.environmentId,
      collectionId: collection.id,
    }),
  ),
);
let [entry] = await db
  .select({ id: cms.cmsEntry.id })
  .from(cms.cmsEntry)
  .where(
    query.and(
      query.eq(cms.cmsEntry.collectionId, collection.id),
      query.eq(cms.cmsEntry.displayName, "M10 Preview oversized entry"),
    ),
  )
  .limit(1);
if (mode === "prepare" && entry === undefined) {
  const created = await run(
    entries.createEntry(
      actorId,
      Schema.decodeUnknownSync(entryContracts.CreateEntryInput)({
        projectId,
        environmentId: authority.environmentId,
        collectionId: collection.id,
        locale,
        displayName: "M10 Preview oversized entry",
        schemaRevisionId: draft.collection.currentPublishedRevisionId,
        contractHash: draft.contractHash,
        commandId: randomUUID(),
      }),
      new Date(),
      "m10-preview-boundary-entry-create",
    ),
  );
  entry = { id: created.id };
}

if (mode === "prepare") {
  if (entry === undefined) throw new Error("The Preview boundary entry could not be created.");
  const entryDraft = await run(
    entries.getDraft(
      actorId,
      Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)({
        projectId,
        environmentId: authority.environmentId,
        collectionId: collection.id,
        entryId: entry.id,
        locale,
      }),
    ),
  );
  const sharedMutations = draft.fields
    .filter((field) => field.localization === "shared")
    .map((field) => ({ operation: "set" as const, path: [field.id], value: "S".repeat(30_000) }));
  const localizedMutations = draft.fields
    .filter(
      (field) =>
        field.localization === "localized" &&
        Reflect.get(field.configuration, "default") === undefined,
    )
    .map((field) => ({ operation: "set" as const, path: [field.id], value: "L".repeat(30_000) }));
  if (entryDraft.sharedVersion === 0 && entryDraft.localizedVersion === 0) {
    await run(
      entries.saveDraft(
        actorId,
        Schema.decodeUnknownSync(entryContracts.SaveEntryDraftInput)({
          projectId,
          environmentId: authority.environmentId,
          collectionId: collection.id,
          entryId: entry.id,
          locale,
          schemaRevisionId: entryDraft.schemaRevisionId,
          contractHash: entryDraft.contractHash,
          commandId: randomUUID(),
          expectedSharedVersion: 0,
          expectedLocalizedVersion: 0,
          sharedMutations,
          localizedMutations,
        }),
        new Date(),
        "m10-preview-boundary-entry-save",
      ),
    );
  }
  const path = `/api/preview/v1/projects/${projectId}/environments/${environmentKey}/collections/${collectionKey}/entries/${entry.id}/draft?locale=${locale}`;
  await setEnvironmentValue("PREVIEW_OVERSIZED_PATH", path);
  process.stdout.write("Prepared the Preview-only oversized fixture through audited controls.\n");
} else {
  await setEnvironmentValue("PREVIEW_OVERSIZED_PATH", "");
  process.stdout.write(
    "Disabled the oversized fixture path. The isolated fixture remains private and has no publications.\n",
  );
}
