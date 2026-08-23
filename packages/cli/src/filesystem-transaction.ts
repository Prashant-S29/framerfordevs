// Commits the owned generated directory and schema lock with same-filesystem rollback semantics.

import { open, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

import { Context, Effect, Layer, Schema } from "effect";

import { sha256 } from "./canonical";
import {
  CliFileSystemError,
  GeneratorCommitError,
  GeneratorFileModifiedError,
  GeneratorOutputUnownedError,
} from "./errors";
import type { GenerationPlan } from "./generator";
import { SchemaLock } from "./schema";

export type FileSystemEntryKind = "missing" | "file" | "directory" | "symbolic_link" | "other";

export interface GeneratorFileSystemService {
  readonly kind: (path: string) => Effect.Effect<FileSystemEntryKind, CliFileSystemError>;
  readonly readUtf8: (path: string) => Effect.Effect<string, CliFileSystemError>;
  readonly list: (path: string) => Effect.Effect<ReadonlyArray<string>, CliFileSystemError>;
  readonly makeDirectory: (path: string) => Effect.Effect<void, CliFileSystemError>;
  readonly writeUtf8: (path: string, bytes: string) => Effect.Effect<void, CliFileSystemError>;
  readonly rename: (from: string, to: string) => Effect.Effect<void, CliFileSystemError>;
  readonly remove: (path: string) => Effect.Effect<void, CliFileSystemError>;
  readonly syncFile: (path: string) => Effect.Effect<void, CliFileSystemError>;
  readonly syncDirectory: (path: string) => Effect.Effect<void, CliFileSystemError>;
}

export class GeneratorFileSystem extends Context.Tag("GeneratorFileSystem")<
  GeneratorFileSystem,
  GeneratorFileSystemService
>() {}

function fileSystemFailure(operation: string, cause: unknown) {
  return CliFileSystemError.make({ operation, cause });
}

async function syncPath(path: string) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export const GeneratorFileSystemLive = Layer.succeed(GeneratorFileSystem, {
  kind: (path) =>
    Effect.tryPromise({
      try: async (): Promise<FileSystemEntryKind> => {
        try {
          const stat = await lstat(path);
          if (stat.isSymbolicLink()) return "symbolic_link";
          if (stat.isDirectory()) return "directory";
          if (stat.isFile()) return "file";
          return "other";
        } catch (cause) {
          if (
            typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            cause.code === "ENOENT"
          ) {
            return "missing";
          }
          throw cause;
        }
      },
      catch: (cause) => fileSystemFailure("generator.kind", cause),
    }),
  readUtf8: (path) =>
    Effect.tryPromise({
      try: () => readFile(path, "utf8"),
      catch: (cause) => fileSystemFailure("generator.read", cause),
    }),
  list: (path) =>
    Effect.tryPromise({
      try: () => readdir(path),
      catch: (cause) => fileSystemFailure("generator.list", cause),
    }),
  makeDirectory: (path) =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(path, { recursive: true });
      },
      catch: (cause) => fileSystemFailure("generator.mkdir", cause),
    }),
  writeUtf8: (path, bytes) =>
    Effect.tryPromise({
      try: () => writeFile(path, bytes, { encoding: "utf8", flag: "wx" }),
      catch: (cause) => fileSystemFailure("generator.write", cause),
    }),
  rename: (from, to) =>
    Effect.tryPromise({
      try: () => rename(from, to),
      catch: (cause) => fileSystemFailure("generator.rename", cause),
    }),
  remove: (path) =>
    Effect.tryPromise({
      try: () => rm(path, { recursive: true, force: true }),
      catch: (cause) => fileSystemFailure("generator.remove", cause),
    }),
  syncFile: (path) =>
    Effect.tryPromise({
      try: () => syncPath(path),
      catch: (cause) => fileSystemFailure("generator.fsync_file", cause),
    }),
  syncDirectory: (path) =>
    Effect.tryPromise({
      try: () => syncPath(path),
      catch: (cause) => fileSystemFailure("generator.fsync_directory", cause),
    }),
});

export type GeneratorCommitStage =
  | "stage_directory"
  | "stage_files"
  | "backup_output"
  | "install_output"
  | "write_lock"
  | "install_lock"
  | "sync_commit";

export interface CommitGenerationOptions {
  readonly rootDirectory: string;
  readonly outputDirectory: string;
  readonly plan: GenerationPlan;
  readonly force?: boolean;
  readonly transactionId?: string;
  readonly beforeStage?: (stage: GeneratorCommitStage) => Effect.Effect<void, GeneratorCommitError>;
}

function ensureOwnedPath(rootDirectory: string, outputDirectory: string): boolean {
  const root = resolve(rootDirectory);
  const output = resolve(outputDirectory);
  return output !== root && output.startsWith(`${root}${sep}`);
}

const runStage = (hook: CommitGenerationOptions["beforeStage"], stage: GeneratorCommitStage) =>
  hook === undefined ? Effect.void : hook(stage);

function validateDirectoryChain(
  fileSystem: GeneratorFileSystemService,
  rootDirectory: string,
  targetDirectory: string,
) {
  return Effect.gen(function* () {
    const rootKind = yield* fileSystem.kind(rootDirectory);
    if (rootKind !== "directory") return false;
    let current = rootDirectory;
    const segments = relative(rootDirectory, targetDirectory).split(sep).filter(Boolean);
    for (const segment of segments) {
      current = join(current, segment);
      const kind = yield* fileSystem.kind(current);
      if (kind === "missing") return true;
      if (kind !== "directory") return false;
    }
    return true;
  });
}

export const commitGenerationPlan = Effect.fn("GeneratorFileSystem.commit")(function* (
  options: CommitGenerationOptions,
) {
  const fileSystem = yield* GeneratorFileSystem;
  if (!ensureOwnedPath(options.rootDirectory, options.outputDirectory)) {
    return yield* GeneratorOutputUnownedError.make();
  }
  const rootDirectory = resolve(options.rootDirectory);
  const outputDirectory = resolve(options.outputDirectory);
  const outputParent = dirname(outputDirectory);
  const lockDirectory = join(rootDirectory, ".framerfordevs");
  const lockPath = join(lockDirectory, "schema.lock.json");
  const safeOutputChain = yield* validateDirectoryChain(fileSystem, rootDirectory, outputParent);
  const safeLockChain = yield* validateDirectoryChain(fileSystem, rootDirectory, lockDirectory);
  if (!safeOutputChain || !safeLockChain) return yield* GeneratorOutputUnownedError.make();
  const outputKind = yield* fileSystem.kind(outputDirectory);
  const lockKind = yield* fileSystem.kind(lockPath);
  if (
    (outputKind !== "missing" && outputKind !== "directory") ||
    (lockKind !== "missing" && lockKind !== "file")
  ) {
    return yield* GeneratorOutputUnownedError.make();
  }

  let previousLockBytes: string | null = null;
  if (lockKind === "file") previousLockBytes = yield* fileSystem.readUtf8(lockPath);
  if (outputKind === "directory") {
    if (previousLockBytes === null && options.force !== true) {
      return yield* GeneratorOutputUnownedError.make();
    }
    if (previousLockBytes !== null) {
      const previousLock = yield* Schema.decodeUnknown(SchemaLock)(
        yield* Effect.try({
          try: (): unknown => JSON.parse(previousLockBytes),
          catch: () => GeneratorOutputUnownedError.make(),
        }),
      ).pipe(Effect.mapError(() => GeneratorOutputUnownedError.make()));
      const expectedNames = previousLock.files.map((file) => file.path).sort();
      const actualNames = [...(yield* fileSystem.list(outputDirectory))].sort();
      if (
        options.force !== true &&
        (expectedNames.length !== actualNames.length ||
          expectedNames.some((name, index) => name !== actualNames[index]))
      ) {
        return yield* GeneratorOutputUnownedError.make();
      }
      if (options.force !== true) {
        for (const file of previousLock.files) {
          const bytes = yield* fileSystem.readUtf8(join(outputDirectory, file.path));
          if (sha256(bytes) !== file.sha256) {
            return yield* GeneratorFileModifiedError.make({ path: file.path });
          }
        }
      }
    }
  } else if (previousLockBytes !== null && options.force !== true) {
    return yield* GeneratorOutputUnownedError.make();
  }

  const transactionId = options.transactionId ?? randomUUID();
  const stem = `.${basename(outputDirectory)}.ffd-${transactionId}`;
  const stagingDirectory = join(outputParent, `${stem}-stage`);
  const backupDirectory = join(outputParent, `${stem}-backup`);
  const lockTemporaryPath = join(lockDirectory, `.schema.lock.${transactionId}.tmp`);
  const lockBackupPath = join(lockDirectory, `.schema.lock.${transactionId}.backup`);
  let outputBackedUp = false;
  let outputInstalled = false;
  let lockBackedUp = false;
  let lockInstalled = false;

  const rollback = Effect.gen(function* () {
    if (lockInstalled) yield* fileSystem.remove(lockPath).pipe(Effect.ignore);
    if (lockBackedUp) {
      yield* fileSystem.rename(lockBackupPath, lockPath).pipe(Effect.ignore);
    } else if (lockInstalled && previousLockBytes !== null) {
      const restorePath = join(lockDirectory, `.schema.lock.${transactionId}.restore`);
      yield* fileSystem.remove(restorePath).pipe(Effect.ignore);
      yield* fileSystem.writeUtf8(restorePath, previousLockBytes).pipe(Effect.ignore);
      yield* fileSystem.rename(restorePath, lockPath).pipe(Effect.ignore);
    }
    if (outputInstalled) yield* fileSystem.remove(outputDirectory).pipe(Effect.ignore);
    if (outputBackedUp) {
      yield* fileSystem.rename(backupDirectory, outputDirectory).pipe(Effect.ignore);
    }
    yield* fileSystem.remove(stagingDirectory).pipe(Effect.ignore);
    yield* fileSystem.remove(lockTemporaryPath).pipe(Effect.ignore);
    yield* fileSystem.remove(lockBackupPath).pipe(Effect.ignore);
  });

  const commit = Effect.gen(function* () {
    yield* runStage(options.beforeStage, "stage_directory");
    yield* fileSystem.makeDirectory(outputParent);
    yield* fileSystem.remove(stagingDirectory);
    yield* fileSystem.makeDirectory(stagingDirectory);

    yield* runStage(options.beforeStage, "stage_files");
    for (const file of options.plan.files) {
      const path = join(stagingDirectory, file.path);
      yield* fileSystem.writeUtf8(path, file.bytes);
      yield* fileSystem.syncFile(path);
    }
    yield* fileSystem.syncDirectory(stagingDirectory);

    if (outputKind === "directory") {
      yield* runStage(options.beforeStage, "backup_output");
      yield* fileSystem.remove(backupDirectory);
      yield* fileSystem.rename(outputDirectory, backupDirectory);
      outputBackedUp = true;
    }

    yield* runStage(options.beforeStage, "install_output");
    yield* fileSystem.rename(stagingDirectory, outputDirectory);
    outputInstalled = true;
    yield* fileSystem.syncDirectory(outputParent);

    yield* runStage(options.beforeStage, "write_lock");
    yield* fileSystem.makeDirectory(lockDirectory);
    yield* fileSystem.remove(lockTemporaryPath);
    yield* fileSystem.writeUtf8(lockTemporaryPath, options.plan.lockBytes);
    yield* fileSystem.syncFile(lockTemporaryPath);

    yield* runStage(options.beforeStage, "install_lock");
    if (lockKind === "file") {
      yield* fileSystem.remove(lockBackupPath);
      yield* fileSystem.rename(lockPath, lockBackupPath);
      lockBackedUp = true;
    }
    yield* fileSystem.rename(lockTemporaryPath, lockPath);
    lockInstalled = true;

    yield* runStage(options.beforeStage, "sync_commit");
    yield* fileSystem.syncDirectory(lockDirectory);
    yield* fileSystem.syncDirectory(rootDirectory);
  });

  const result = yield* Effect.exit(commit);
  if (result._tag === "Failure") {
    yield* rollback;
    return yield* GeneratorCommitError.make({
      stage: "filesystem_commit",
      cause: result.cause,
    });
  }
  if (outputBackedUp) yield* fileSystem.remove(backupDirectory).pipe(Effect.ignore);
  if (lockBackedUp) yield* fileSystem.remove(lockBackupPath).pipe(Effect.ignore);
  return {
    outputDirectory,
    lockPath,
    files: options.plan.files.length,
  };
});
