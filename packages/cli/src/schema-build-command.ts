// Runs explicit credential-blind experimental schema builds and atomically owns output plus manifest.

import { open, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

import { Effect, Schema } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "./canonical";
import {
  CliSchemaBuildCommitError,
  CliSchemaBuildOutputModifiedError,
  CliSchemaBuildOutputUnownedError,
  CliSchemaBuildStaleError,
} from "./errors";
import { runExperimentalSchemaBuild } from "./experimental-schema-build";
import { SchemaBuildInputDigest, SchemaBuildManifest } from "./schema";

const manifestRelativePath = ".framerfordevs/schema-build.lock.json";

export interface SchemaBuildCommandInput {
  readonly projectRoot: string;
  readonly entry: string;
  readonly schemaPath: string;
  readonly schemaRelativePath: string;
  readonly check: boolean;
}

async function syncPath(path: string) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isInside(root: string, candidate: string) {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`));
}

async function prepareParent(projectRoot: string, target: string) {
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const [rootReal, parentReal, status] = await Promise.all([
    realpath(projectRoot),
    realpath(parent),
    lstat(parent),
  ]);
  if (!status.isDirectory() || status.isSymbolicLink() || !isInside(rootReal, parentReal)) {
    throw new Error("Schema build target parent is outside the real project root.");
  }
  return parent;
}

async function readOptional(path: string) {
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink()) throw CliSchemaBuildOutputUnownedError.make();
    return await readFile(path, "utf8");
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && Reflect.get(cause, "code") === "ENOENT") {
      return null;
    }
    throw cause;
  }
}

async function decodeManifest(bytes: string) {
  let value: unknown;
  try {
    value = JSON.parse(bytes);
  } catch {
    throw CliSchemaBuildOutputUnownedError.make();
  }
  try {
    return Schema.decodeUnknownSync(SchemaBuildManifest)(value, {
      onExcessProperty: "error",
    });
  } catch {
    throw CliSchemaBuildOutputUnownedError.make();
  }
}

async function inspectOwnership(
  schemaPath: string,
  manifestPath: string,
  schemaRelativePath: string,
) {
  const [outputBytes, manifestBytes] = await Promise.all([
    readOptional(schemaPath),
    readOptional(manifestPath),
  ]);
  if (outputBytes === null && manifestBytes === null) return { outputBytes, manifestBytes };
  if (outputBytes === null || manifestBytes === null) throw CliSchemaBuildOutputUnownedError.make();
  const manifest = await decodeManifest(manifestBytes);
  if (manifest.output.path !== schemaRelativePath) throw CliSchemaBuildOutputUnownedError.make();
  if (manifest.output.sha256 !== sha256(outputBytes))
    throw CliSchemaBuildOutputModifiedError.make();
  return { outputBytes, manifestBytes };
}

async function writeTemporary(path: string, bytes: string) {
  await writeFile(path, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await syncPath(path);
}

async function commitPair(input: {
  readonly projectRoot: string;
  readonly schemaPath: string;
  readonly manifestPath: string;
  readonly schemaBytes: string;
  readonly manifestBytes: string;
  readonly hadSchema: boolean;
  readonly hadManifest: boolean;
}) {
  const transactionId = randomUUID();
  const schemaParent = await prepareParent(input.projectRoot, input.schemaPath);
  const manifestParent = await prepareParent(input.projectRoot, input.manifestPath);
  const schemaTemporary = join(schemaParent, `.schema-build.${transactionId}.tmp`);
  const manifestTemporary = join(manifestParent, `.schema-build-manifest.${transactionId}.tmp`);
  const schemaBackup = join(schemaParent, `.schema-build.${transactionId}.backup`);
  const manifestBackup = join(manifestParent, `.schema-build-manifest.${transactionId}.backup`);
  let schemaBackedUp = false;
  let manifestBackedUp = false;
  let schemaInstalled = false;
  let manifestInstalled = false;
  try {
    await writeTemporary(schemaTemporary, input.schemaBytes);
    await writeTemporary(manifestTemporary, input.manifestBytes);
    if (input.hadSchema) {
      await rename(input.schemaPath, schemaBackup);
      schemaBackedUp = true;
    }
    if (input.hadManifest) {
      await rename(input.manifestPath, manifestBackup);
      manifestBackedUp = true;
    }
    await rename(schemaTemporary, input.schemaPath);
    schemaInstalled = true;
    await rename(manifestTemporary, input.manifestPath);
    manifestInstalled = true;
    await syncPath(input.schemaPath);
    await syncPath(input.manifestPath);
    await syncPath(schemaParent);
    if (manifestParent !== schemaParent) await syncPath(manifestParent);
  } catch (cause) {
    const rollbackFailures: Array<unknown> = [];
    const rollback = async (operation: () => Promise<unknown>) => {
      try {
        await operation();
      } catch (rollbackCause) {
        rollbackFailures.push(rollbackCause);
      }
    };
    if (manifestInstalled) await rollback(() => rm(input.manifestPath, { force: true }));
    if (schemaInstalled) await rollback(() => rm(input.schemaPath, { force: true }));
    if (manifestBackedUp) await rollback(() => rename(manifestBackup, input.manifestPath));
    if (schemaBackedUp) await rollback(() => rename(schemaBackup, input.schemaPath));
    if (rollbackFailures.length > 0) {
      throw new AggregateError([cause, ...rollbackFailures], "Schema build rollback failed.");
    }
    throw cause;
  } finally {
    await rm(schemaTemporary, { force: true });
    await rm(manifestTemporary, { force: true });
  }
  await Promise.allSettled([
    rm(schemaBackup, { force: true }),
    rm(manifestBackup, { force: true }),
  ]);
}

export interface SchemaBuildManifestCheckInput {
  readonly projectRoot: string;
  readonly schemaPath: string;
  readonly schemaRelativePath: string;
  readonly entryRelativePath: string;
}

export const checkSchemaBuildManifest = Effect.fn("cli.schema.build.manifest.check")(function* (
  input: SchemaBuildManifestCheckInput,
) {
  return yield* Effect.tryPromise({
    try: async () => {
      const manifestPath = join(input.projectRoot, manifestRelativePath);
      const existing = await inspectOwnership(
        input.schemaPath,
        manifestPath,
        input.schemaRelativePath,
      );
      if (existing.outputBytes === null || existing.manifestBytes === null) {
        throw CliSchemaBuildStaleError.make();
      }
      const manifest = await decodeManifest(existing.manifestBytes);
      const paths = manifest.inputs.map((item) => item.path);
      if (
        !paths.includes(input.entryRelativePath) ||
        new Set(paths).size !== paths.length ||
        paths.some((path, index) => index > 0 && path <= (paths[index - 1] ?? ""))
      ) {
        throw CliSchemaBuildStaleError.make();
      }
      const rootReal = await realpath(input.projectRoot);
      for (const item of manifest.inputs) {
        const path = resolve(input.projectRoot, item.path);
        const [pathReal, status] = await Promise.all([realpath(path), lstat(path)]);
        if (
          pathReal !== path ||
          !status.isFile() ||
          status.isSymbolicLink() ||
          !isInside(rootReal, pathReal) ||
          status.size > 262_144
        ) {
          throw CliSchemaBuildStaleError.make();
        }
        const bytes = await readFile(path, "utf8");
        if (sha256(bytes) !== item.sha256) throw CliSchemaBuildStaleError.make();
      }
      return {
        current: true as const,
        inputCount: manifest.inputs.length,
        outputSha256: manifest.output.sha256,
      };
    },
    catch: (cause) =>
      cause instanceof CliSchemaBuildStaleError ? cause : CliSchemaBuildStaleError.make(),
  });
});

type SchemaBuildRunner = typeof runExperimentalSchemaBuild;

export const runSchemaBuildCommandWith = Effect.fn("cli.schema.build.command")(function* (
  input: SchemaBuildCommandInput,
  build: SchemaBuildRunner,
) {
  const manifestPath = join(input.projectRoot, manifestRelativePath);
  const existing = yield* Effect.tryPromise({
    try: () => inspectOwnership(input.schemaPath, manifestPath, input.schemaRelativePath),
    catch: (cause) =>
      cause instanceof CliSchemaBuildOutputUnownedError ||
      cause instanceof CliSchemaBuildOutputModifiedError
        ? cause
        : CliSchemaBuildCommitError.make({ stage: "inspect", cause }),
  });
  const result = yield* build({
    projectRoot: input.projectRoot,
    entry: input.entry,
    experimental: true,
  });
  const outputSha256 = sha256(result.tierOneSource);
  const manifest = SchemaBuildManifest.make({
    formatVersion: 1,
    runtime: result.runtime,
    memoryLimitHard: result.memoryLimitHard,
    typescriptVersion: "6.0.3",
    composePackage: "@framerfordevs/schema/compose",
    inputs: result.inputs.map((item) => SchemaBuildInputDigest.make(item)),
    output: { path: input.schemaRelativePath, sha256: outputSha256 },
  });
  const manifestBytes = canonicalJsonBytes(toJsonValue(manifest));
  const changed =
    existing.outputBytes !== result.tierOneSource || existing.manifestBytes !== manifestBytes;
  if (!input.check && changed) {
    yield* Effect.tryPromise({
      try: () =>
        commitPair({
          projectRoot: input.projectRoot,
          schemaPath: input.schemaPath,
          manifestPath,
          schemaBytes: result.tierOneSource,
          manifestBytes,
          hadSchema: existing.outputBytes !== null,
          hadManifest: existing.manifestBytes !== null,
        }),
      catch: (cause) => CliSchemaBuildCommitError.make({ stage: "commit", cause }),
    });
  }
  return {
    command: "schema build" as const,
    mode: input.check ? ("check" as const) : ("write" as const),
    accepted: !input.check || !changed,
    changed,
    output: input.schemaRelativePath,
    inputCount: result.inputs.length,
    outputSha256,
    runtime: result.runtime,
    memoryLimitHard: result.memoryLimitHard,
  };
});

export const runSchemaBuildCommand = (input: SchemaBuildCommandInput) =>
  runSchemaBuildCommandWith(input, runExperimentalSchemaBuild);
