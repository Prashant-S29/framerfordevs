// Alternates one Preview fixture draft through normal audited save controls for coherence load.

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { Effect, Schema } from "effect";

const serverEnvironmentPath = "../../apps/server/.env";
const loadEnvironmentPath = "../../preview-load.env";
process.loadEnvFile(serverEnvironmentPath);
process.loadEnvFile(loadEnvironmentPath);

const durationSeconds = Number(
  process.argv.find((argument) => argument.startsWith("--seconds="))?.slice("--seconds=".length) ??
    "80",
);
if (!Number.isInteger(durationSeconds) || durationSeconds < 10 || durationSeconds > 300) {
  throw new Error("--seconds must be from 10 through 300.");
}
const currentPath = process.env.PREVIEW_CONCURRENCY_PATH;
if (currentPath === undefined) throw new Error("PREVIEW_CONCURRENCY_PATH is required.");
const match =
  /^\/api\/preview\/v1\/projects\/([0-9a-f-]+)\/environments\/([a-z0-9_]+)\/collections\/([a-z0-9_]+)\/entries\/([0-9a-f-]+)\/draft\?locale=([^&]+)$/u.exec(
    currentPath,
  );
if (match === null) throw new Error("The first current path is not canonical.");
const projectId = match[1];
const environmentKey = match[2];
const collectionKey = match[3];
const entryId = match[4];
const locale = match[5];
if (
  projectId === undefined ||
  environmentKey === undefined ||
  collectionKey === undefined ||
  entryId === undefined ||
  locale === undefined
) {
  throw new Error("The current path is incomplete.");
}

async function setEnvironmentValue(key: string, value: string): Promise<void> {
  const source = await readFile(loadEnvironmentPath, "utf8");
  const line = `${key}=${JSON.stringify(value)}`;
  const expression = new RegExp(`^${key}=.*$`, "mu");
  const next = expression.test(source)
    ? source.replace(expression, line)
    : `${source}${source.endsWith("\n") ? "" : "\n"}${line}\n`;
  await writeFile(loadEnvironmentPath, next, { encoding: "utf8", mode: 0o600 });
}

const [
  { db },
  query,
  cms,
  platformSchema,
  { AuthUserId },
  entryContracts,
  { makeEntryRepository },
] = await Promise.all([
  import("@framerfordevs/db"),
  import("@framerfordevs/db/query"),
  import("@framerfordevs/db/schema/cms"),
  import("@framerfordevs/db/schema/platform"),
  import("../../../contracts/platform"),
  import("../../../contracts/entry"),
  import("../../../services/entry/repository"),
]);

const [authority] = await db
  .select({
    actorId: platformSchema.project.createdByUserId,
    environmentId: platformSchema.environment.id,
    collectionId: cms.cmsCollection.id,
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
  .where(query.eq(platformSchema.project.id, projectId))
  .limit(1);
if (authority === undefined) throw new Error("The current Preview fixture scope was not found.");

const actorId = Schema.decodeUnknownSync(AuthUserId)(authority.actorId);
const entries = makeEntryRepository();
const run = Effect.runPromise;
const scope = {
  projectId,
  environmentId: authority.environmentId,
  collectionId: authority.collectionId,
  entryId,
  locale: decodeURIComponent(locale),
};
const original = await run(
  entries.getDraft(actorId, Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)(scope)),
);
const mutableFieldId = Object.keys(original.localizedValues)[0];
if (mutableFieldId === undefined)
  throw new Error("The coherence fixture needs one localized value.");
const originalValue = Reflect.get(original.localizedValues, mutableFieldId);
if (typeof originalValue !== "string")
  throw new Error("The coherence field must contain a string.");
const tuples = new Set<string>();
const addTuple = (draft: typeof original) => {
  tuples.add(
    `${draft.schemaRevisionId}|${draft.sharedRevisionId ?? "none"}|${draft.localizedRevisionId ?? "none"}`,
  );
};
addTuple(original);
const deadline = Date.now() + durationSeconds * 1_000;
let iteration = 0;
try {
  while (Date.now() < deadline) {
    const draft = await run(
      entries.getDraft(actorId, Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)(scope)),
    );
    const value = iteration % 2 === 0 ? `${originalValue} [coherence]` : originalValue;
    const result = await run(
      entries.saveDraft(
        actorId,
        Schema.decodeUnknownSync(entryContracts.SaveEntryDraftInput)({
          ...scope,
          schemaRevisionId: draft.schemaRevisionId,
          contractHash: draft.contractHash,
          commandId: randomUUID(),
          expectedSharedVersion: draft.sharedVersion,
          expectedLocalizedVersion: draft.localizedVersion,
          sharedMutations: [],
          localizedMutations: [{ operation: "set", path: [mutableFieldId], value }],
        }),
        new Date(),
        `m10-preview-coherence-save-${iteration}`,
      ),
    );
    tuples.add(
      `${draft.schemaRevisionId}|${result.sharedRevisionId ?? "none"}|${result.localizedRevisionId ?? "none"}`,
    );
    iteration += 1;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
} finally {
  const draft = await run(
    entries.getDraft(actorId, Schema.decodeUnknownSync(entryContracts.GetEntryDraftInput)(scope)),
  );
  if (Reflect.get(draft.localizedValues, mutableFieldId) !== originalValue) {
    const result = await run(
      entries.saveDraft(
        actorId,
        Schema.decodeUnknownSync(entryContracts.SaveEntryDraftInput)({
          ...scope,
          schemaRevisionId: draft.schemaRevisionId,
          contractHash: draft.contractHash,
          commandId: randomUUID(),
          expectedSharedVersion: draft.sharedVersion,
          expectedLocalizedVersion: draft.localizedVersion,
          sharedMutations: [],
          localizedMutations: [{ operation: "set", path: [mutableFieldId], value: originalValue }],
        }),
        new Date(),
        "m10-preview-coherence-restore",
      ),
    );
    tuples.add(
      `${draft.schemaRevisionId}|${result.sharedRevisionId ?? "none"}|${result.localizedRevisionId ?? "none"}`,
    );
  }
  await setEnvironmentValue("PREVIEW_COHERENT_TUPLES", [...tuples].join(","));
}
process.stdout.write(`Completed ${iteration} audited saves and restored the original value.\n`);
