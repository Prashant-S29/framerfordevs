// Owns exported Tier 1 source and the v2 non-authoritative source/stable-ID lock.

import type { ProjectSchema } from "@framerfordevs/schema";
import type {
  AuthoringAppliedRevision,
  AuthoringCollectionIdentity,
  AuthoringEnumOptionIdentity,
  AuthoringFieldIdentity,
} from "@framerfordevs/sdk/authoring";
import { open, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, relative, sep } from "node:path";

import { Effect, Schema } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "./canonical";
import {
  CliAuthoringSchemaLockError,
  CliAuthoringSchemaModifiedError,
  CliAuthoringSchemaUnownedError,
} from "./errors";
import { AuthoringSchemaLock } from "./schema";

export const authoringSchemaLockRelativePath = ".framerfordevs/schema.lock.json";

export interface AuthoringSchemaLockInput {
  readonly projectId: string;
  readonly environmentId: string;
  readonly environmentKey: string;
  readonly projectSha256: string;
  readonly projectManifestHash: string;
  readonly revisionIds: Readonly<Record<string, string>>;
  readonly revisions: ReadonlyArray<AuthoringAppliedRevision>;
  readonly collections: ReadonlyArray<AuthoringCollectionIdentity>;
  readonly fields: ReadonlyArray<AuthoringFieldIdentity>;
  readonly enumOptions: ReadonlyArray<AuthoringEnumOptionIdentity>;
}

async function sync(path: string) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureParent(projectRoot: string, path: string) {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
  const [rootReal, parentReal, status] = await Promise.all([
    realpath(projectRoot),
    realpath(parent),
    lstat(parent),
  ]);
  const fromRoot = relative(rootReal, parentReal);
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`)
  ) {
    throw CliAuthoringSchemaUnownedError.make();
  }
  return parent;
}

async function optionalFile(path: string) {
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink()) throw CliAuthoringSchemaUnownedError.make();
    return await readFile(path, "utf8");
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && Reflect.get(cause, "code") === "ENOENT") {
      return null;
    }
    throw cause;
  }
}

function decodeLock(bytes: string) {
  try {
    const value: unknown = JSON.parse(bytes);
    return Schema.decodeUnknownSync(AuthoringSchemaLock)(value, { onExcessProperty: "error" });
  } catch {
    throw CliAuthoringSchemaUnownedError.make();
  }
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function makeLock(input: AuthoringSchemaLockInput, schemaFileSha256: string) {
  return Schema.decodeUnknownSync(AuthoringSchemaLock)({
    lockVersion: 2,
    authoringApi: "authoring/v1",
    projectId: input.projectId,
    environmentId: input.environmentId,
    environmentKey: input.environmentKey,
    projectSha256: input.projectSha256,
    schemaFileSha256,
    projectManifestHash: input.projectManifestHash,
    revisionIds: input.revisionIds,
    structureHashes: Object.fromEntries(
      input.revisions.map((revision) => [revision.collectionSourceKey, revision.structureHash]),
    ),
    contractHashes: Object.fromEntries(
      input.revisions.map((revision) => [revision.collectionSourceKey, revision.contractHash]),
    ),
    collections: [...input.collections].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
    fields: [...input.fields].sort((left, right) =>
      compareText(
        `${left.collectionSourceKey}\u0000${left.sourceKey}`,
        `${right.collectionSourceKey}\u0000${right.sourceKey}`,
      ),
    ),
    enumOptions: [...input.enumOptions].sort((left, right) =>
      compareText(
        `${left.collectionSourceKey}\u0000${left.fieldSourceKey}\u0000${left.sourceKey}`,
        `${right.collectionSourceKey}\u0000${right.fieldSourceKey}\u0000${right.sourceKey}`,
      ),
    ),
  });
}

async function atomicFiles(
  projectRoot: string,
  files: ReadonlyArray<{ readonly path: string; readonly bytes: string }>,
) {
  const transaction = randomUUID();
  const states: Array<{
    path: string;
    temporary: string;
    backup: string;
    existed: boolean;
    backedUp: boolean;
    installed: boolean;
    parent: string;
  }> = [];
  try {
    for (const file of files) {
      const parent = await ensureParent(projectRoot, file.path);
      const state = {
        path: file.path,
        temporary: join(parent, `.authoring-schema.${transaction}.${states.length}.tmp`),
        backup: join(parent, `.authoring-schema.${transaction}.${states.length}.backup`),
        existed: (await optionalFile(file.path)) !== null,
        backedUp: false,
        installed: false,
        parent,
      };
      states.push(state);
      await writeFile(state.temporary, file.bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
      await sync(state.temporary);
    }
    for (const state of states) {
      if (state.existed) {
        await rename(state.path, state.backup);
        state.backedUp = true;
      }
      await rename(state.temporary, state.path);
      state.installed = true;
    }
    for (const state of states) {
      await sync(state.path);
      await sync(state.parent);
    }
  } catch (cause) {
    const failures: Array<unknown> = [];
    for (const state of [...states].reverse()) {
      try {
        if (state.installed) await rm(state.path, { force: true });
        if (state.backedUp) await rename(state.backup, state.path);
      } catch (rollbackCause) {
        failures.push(rollbackCause);
      }
    }
    if (failures.length > 0) throw new AggregateError([cause, ...failures], "Rollback failed.");
    throw cause;
  } finally {
    for (const state of states) await rm(state.temporary, { force: true });
  }
  await Promise.allSettled(states.map((state) => rm(state.backup, { force: true })));
}

export function emitTierOneSchema(project: ProjectSchema) {
  const canonical = canonicalJsonBytes(toJsonValue(project));
  return `import type { ProjectSchema } from "@framerfordevs/schema";\n\nexport default ${canonical.trimEnd()} as const satisfies ProjectSchema;\n`;
}

export const writeExportedAuthoringSchema = Effect.fn("cli.schema.export.write")(function* (input: {
  readonly projectRoot: string;
  readonly schemaPath: string;
  readonly project: ProjectSchema;
  readonly authority: AuthoringSchemaLockInput;
}) {
  return yield* Effect.tryPromise({
    try: async () => {
      const lockPath = join(input.projectRoot, authoringSchemaLockRelativePath);
      const [existingSchema, existingLockBytes] = await Promise.all([
        optionalFile(input.schemaPath),
        optionalFile(lockPath),
      ]);
      if ((existingSchema === null) !== (existingLockBytes === null)) {
        throw CliAuthoringSchemaUnownedError.make();
      }
      if (existingSchema !== null && existingLockBytes !== null) {
        const existingLock = decodeLock(existingLockBytes);
        if (
          existingLock.projectId !== input.authority.projectId ||
          existingLock.environmentId !== input.authority.environmentId
        ) {
          throw CliAuthoringSchemaUnownedError.make();
        }
        if (existingLock.schemaFileSha256 !== sha256(existingSchema)) {
          throw CliAuthoringSchemaModifiedError.make();
        }
      }
      const schemaBytes = emitTierOneSchema(input.project);
      const lock = makeLock(input.authority, sha256(schemaBytes));
      await atomicFiles(input.projectRoot, [
        { path: input.schemaPath, bytes: schemaBytes },
        { path: lockPath, bytes: canonicalJsonBytes(toJsonValue(lock)) },
      ]);
      return { schemaBytes, lock };
    },
    catch: (cause) =>
      cause instanceof CliAuthoringSchemaUnownedError ||
      cause instanceof CliAuthoringSchemaModifiedError
        ? cause
        : CliAuthoringSchemaLockError.make({ operation: "export", cause }),
  });
});

export const readAuthoringEnvironmentAuthority = Effect.fn("cli.schema.lock.environment.read")(
  function* (input: {
    readonly projectRoot: string;
    readonly projectId: string;
    readonly environmentKey: string;
  }) {
    return yield* Effect.tryPromise({
      try: async () => {
        const bytes = await optionalFile(join(input.projectRoot, authoringSchemaLockRelativePath));
        if (bytes === null) throw CliAuthoringSchemaUnownedError.make();
        const lock = decodeLock(bytes);
        if (lock.projectId !== input.projectId || lock.environmentKey !== input.environmentKey) {
          throw CliAuthoringSchemaUnownedError.make();
        }
        return { environmentId: lock.environmentId };
      },
      catch: (cause) =>
        cause instanceof CliAuthoringSchemaUnownedError
          ? cause
          : CliAuthoringSchemaLockError.make({ operation: "environment.read", cause }),
    });
  },
);

export const readAuthoringCollectionAuthority = Effect.fn("cli.schema.lock.collection.read")(
  function* (input: {
    readonly projectRoot: string;
    readonly projectId: string;
    readonly environmentKey: string;
    readonly collectionKey: string;
  }) {
    return yield* Effect.tryPromise({
      try: async () => {
        const bytes = await optionalFile(join(input.projectRoot, authoringSchemaLockRelativePath));
        if (bytes === null) throw CliAuthoringSchemaUnownedError.make();
        const lock = decodeLock(bytes);
        if (lock.projectId !== input.projectId || lock.environmentKey !== input.environmentKey) {
          throw CliAuthoringSchemaUnownedError.make();
        }
        const collection = lock.collections.find((item) => item.apiKey === input.collectionKey);
        if (collection === undefined) throw CliAuthoringSchemaUnownedError.make();
        const revisionId = lock.revisionIds[collection.sourceKey];
        const contractHash = lock.contractHashes[collection.sourceKey];
        if (revisionId === undefined || contractHash === undefined) {
          throw CliAuthoringSchemaUnownedError.make();
        }
        return { revisionId, contractHash };
      },
      catch: (cause) =>
        cause instanceof CliAuthoringSchemaUnownedError
          ? cause
          : CliAuthoringSchemaLockError.make({ operation: "content.read", cause }),
    });
  },
);

export const writeAuthoringSchemaLock = Effect.fn("cli.schema.lock.write")(function* (input: {
  readonly projectRoot: string;
  readonly schemaPath: string;
  readonly authority: AuthoringSchemaLockInput;
}) {
  return yield* Effect.tryPromise({
    try: async () => {
      const schemaBytes = await optionalFile(input.schemaPath);
      if (schemaBytes === null) throw CliAuthoringSchemaUnownedError.make();
      const lockPath = join(input.projectRoot, authoringSchemaLockRelativePath);
      const existingLockBytes = await optionalFile(lockPath);
      if (existingLockBytes !== null) {
        const existing = decodeLock(existingLockBytes);
        if (
          existing.projectId !== input.authority.projectId ||
          existing.environmentId !== input.authority.environmentId
        ) {
          throw CliAuthoringSchemaUnownedError.make();
        }
      }
      const lock = makeLock(input.authority, sha256(schemaBytes));
      await atomicFiles(input.projectRoot, [
        { path: lockPath, bytes: canonicalJsonBytes(toJsonValue(lock)) },
      ]);
      return lock;
    },
    catch: (cause) =>
      cause instanceof CliAuthoringSchemaUnownedError
        ? cause
        : CliAuthoringSchemaLockError.make({ operation: "push", cause }),
  });
});
