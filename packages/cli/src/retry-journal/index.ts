// Persists only idempotency authority; credentials and mutation/schema bodies are forbidden.

import { link, open, lstat, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

import { Effect, Schema } from "effect";

import { canonicalJsonBytes, toJsonValue } from "../canonical";
import { CliRetryJournalConflictError, CliRetryJournalError } from "../errors";
import {
  ContentMutationRetryJournal,
  ControlPlaneMutationRetryJournal,
  PresentationMutationRetryJournal,
  SchemaMutationRetryJournal,
  type ContentMutationOperation,
  type ControlPlaneMutationOperation,
} from "../schema";

const relativePath = ".framerfordevs/retry/schema-apply.json";
const contentRelativePath = ".framerfordevs/retry/content-command.json";
const presentationRelativePath = ".framerfordevs/retry/presentation-publish.json";
const controlPlaneRelativePath = ".framerfordevs/retry/control-plane-command.json";
const maximumBytes = 2_048;

async function sync(path: string) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readExisting(path: string) {
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > maximumBytes) {
      throw CliRetryJournalConflictError.make();
    }
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return Schema.decodeUnknownSync(SchemaMutationRetryJournal)(value, {
      onExcessProperty: "error",
    });
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && Reflect.get(cause, "code") === "ENOENT") {
      return null;
    }
    if (cause instanceof CliRetryJournalConflictError) throw cause;
    throw CliRetryJournalConflictError.make();
  }
}

export const acquireSchemaApplyCommand = Effect.fn("cli.retry.schema.apply.acquire")(function* (
  projectRoot: string,
  fingerprint: string,
) {
  const path = join(projectRoot, relativePath);
  return yield* Effect.tryPromise({
    try: async () => {
      const existing = await readExisting(path);
      if (existing !== null) {
        if (existing.fingerprint !== fingerprint) throw CliRetryJournalConflictError.make();
        return existing;
      }
      const parent = dirname(path);
      await mkdir(parent, { recursive: true });
      const [parentStatus, projectReal, parentReal] = await Promise.all([
        lstat(parent),
        realpath(projectRoot),
        realpath(parent),
      ]);
      const parentRelative = relative(projectReal, parentReal);
      if (
        !parentStatus.isDirectory() ||
        parentStatus.isSymbolicLink() ||
        parentRelative === ".." ||
        parentRelative.startsWith(`..${sep}`)
      ) {
        throw CliRetryJournalConflictError.make();
      }
      const journal = SchemaMutationRetryJournal.make({
        formatVersion: 1,
        operation: "schema.apply",
        commandId: randomUUID(),
        fingerprint,
      });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, canonicalJsonBytes(toJsonValue(journal)), {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        await sync(temporary);
        try {
          await link(temporary, path);
        } catch (cause) {
          if (
            typeof cause === "object" &&
            cause !== null &&
            Reflect.get(cause, "code") === "EEXIST"
          ) {
            const raced = await readExisting(path);
            if (raced?.fingerprint === fingerprint) return raced;
            throw CliRetryJournalConflictError.make();
          }
          throw cause;
        }
        await sync(path);
        await sync(parent);
      } finally {
        await rm(temporary, { force: true });
      }
      return journal;
    },
    catch: (cause) =>
      cause instanceof CliRetryJournalConflictError
        ? cause
        : CliRetryJournalError.make({ operation: "acquire", cause }),
  });
});

async function readExistingControlPlane(path: string) {
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > maximumBytes) {
      throw CliRetryJournalConflictError.make();
    }
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return Schema.decodeUnknownSync(ControlPlaneMutationRetryJournal)(value, {
      onExcessProperty: "error",
    });
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && Reflect.get(cause, "code") === "ENOENT") {
      return null;
    }
    if (cause instanceof CliRetryJournalConflictError) throw cause;
    throw CliRetryJournalConflictError.make();
  }
}

export const acquireControlPlaneCommand = Effect.fn("cli.retry.control-plane.acquire")(function* (
  projectRoot: string,
  operation: ControlPlaneMutationOperation,
  fingerprint: string,
  suppliedCommandId?: string,
) {
  const path = join(projectRoot, controlPlaneRelativePath);
  return yield* Effect.tryPromise({
    try: async () => {
      const existing = await readExistingControlPlane(path);
      if (existing !== null) {
        if (
          existing.operation !== operation ||
          existing.fingerprint !== fingerprint ||
          (suppliedCommandId !== undefined && existing.commandId !== suppliedCommandId)
        ) {
          throw CliRetryJournalConflictError.make();
        }
        return existing;
      }
      const parent = dirname(path);
      await mkdir(parent, { recursive: true });
      const [parentStatus, projectReal, parentReal] = await Promise.all([
        lstat(parent),
        realpath(projectRoot),
        realpath(parent),
      ]);
      const parentRelative = relative(projectReal, parentReal);
      if (
        !parentStatus.isDirectory() ||
        parentStatus.isSymbolicLink() ||
        parentRelative === ".." ||
        parentRelative.startsWith(`..${sep}`)
      ) {
        throw CliRetryJournalConflictError.make();
      }
      const journal = ControlPlaneMutationRetryJournal.make({
        formatVersion: 1,
        operation,
        commandId: suppliedCommandId ?? randomUUID(),
        fingerprint,
      });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, canonicalJsonBytes(toJsonValue(journal)), {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        await sync(temporary);
        try {
          await link(temporary, path);
        } catch (cause) {
          if (
            typeof cause === "object" &&
            cause !== null &&
            Reflect.get(cause, "code") === "EEXIST"
          ) {
            const raced = await readExistingControlPlane(path);
            if (
              raced?.operation === operation &&
              raced.fingerprint === fingerprint &&
              (suppliedCommandId === undefined || raced.commandId === suppliedCommandId)
            ) {
              return raced;
            }
            throw CliRetryJournalConflictError.make();
          }
          throw cause;
        }
        await sync(path);
        await sync(parent);
      } finally {
        await rm(temporary, { force: true });
      }
      return journal;
    },
    catch: (cause) =>
      cause instanceof CliRetryJournalConflictError
        ? cause
        : CliRetryJournalError.make({ operation: "control-plane.acquire", cause }),
  });
});

export const clearControlPlaneCommand = Effect.fn("cli.retry.control-plane.clear")(function* (
  projectRoot: string,
  commandId: string,
) {
  const path = join(projectRoot, controlPlaneRelativePath);
  yield* Effect.tryPromise({
    try: async () => {
      const existing = await readExistingControlPlane(path);
      if (existing === null) return;
      if (existing.commandId !== commandId) throw CliRetryJournalConflictError.make();
      await rm(path);
      await sync(dirname(path));
    },
    catch: (cause) =>
      cause instanceof CliRetryJournalConflictError
        ? cause
        : CliRetryJournalError.make({ operation: "control-plane.clear", cause }),
  });
});

async function readExistingContent(path: string) {
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > maximumBytes) {
      throw CliRetryJournalConflictError.make();
    }
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return Schema.decodeUnknownSync(ContentMutationRetryJournal)(value, {
      onExcessProperty: "error",
    });
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && Reflect.get(cause, "code") === "ENOENT") {
      return null;
    }
    if (cause instanceof CliRetryJournalConflictError) throw cause;
    throw CliRetryJournalConflictError.make();
  }
}

export const acquireContentCommand = Effect.fn("cli.retry.content.acquire")(function* (
  projectRoot: string,
  operation: ContentMutationOperation,
  fingerprint: string,
) {
  const path = join(projectRoot, contentRelativePath);
  return yield* Effect.tryPromise({
    try: async () => {
      const existing = await readExistingContent(path);
      if (existing !== null) {
        if (existing.operation !== operation || existing.fingerprint !== fingerprint) {
          throw CliRetryJournalConflictError.make();
        }
        return existing;
      }
      const parent = dirname(path);
      await mkdir(parent, { recursive: true });
      const [parentStatus, projectReal, parentReal] = await Promise.all([
        lstat(parent),
        realpath(projectRoot),
        realpath(parent),
      ]);
      const parentRelative = relative(projectReal, parentReal);
      if (
        !parentStatus.isDirectory() ||
        parentStatus.isSymbolicLink() ||
        parentRelative === ".." ||
        parentRelative.startsWith(`..${sep}`)
      ) {
        throw CliRetryJournalConflictError.make();
      }
      const journal = ContentMutationRetryJournal.make({
        formatVersion: 1,
        operation,
        commandId: randomUUID(),
        fingerprint,
      });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, canonicalJsonBytes(toJsonValue(journal)), {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        await sync(temporary);
        try {
          await link(temporary, path);
        } catch (cause) {
          if (
            typeof cause === "object" &&
            cause !== null &&
            Reflect.get(cause, "code") === "EEXIST"
          ) {
            const raced = await readExistingContent(path);
            if (raced?.operation === operation && raced.fingerprint === fingerprint) return raced;
            throw CliRetryJournalConflictError.make();
          }
          throw cause;
        }
        await sync(path);
        await sync(parent);
      } finally {
        await rm(temporary, { force: true });
      }
      return journal;
    },
    catch: (cause) =>
      cause instanceof CliRetryJournalConflictError
        ? cause
        : CliRetryJournalError.make({ operation: "content.acquire", cause }),
  });
});

export const clearContentCommand = Effect.fn("cli.retry.content.clear")(function* (
  projectRoot: string,
  commandId: string,
) {
  const path = join(projectRoot, contentRelativePath);
  yield* Effect.tryPromise({
    try: async () => {
      const existing = await readExistingContent(path);
      if (existing === null) return;
      if (existing.commandId !== commandId) throw CliRetryJournalConflictError.make();
      await rm(path);
      await sync(dirname(path));
    },
    catch: (cause) =>
      cause instanceof CliRetryJournalConflictError
        ? cause
        : CliRetryJournalError.make({ operation: "content.clear", cause }),
  });
});

export const clearSchemaApplyCommand = Effect.fn("cli.retry.schema.apply.clear")(function* (
  projectRoot: string,
  commandId: string,
) {
  const path = join(projectRoot, relativePath);
  yield* Effect.tryPromise({
    try: async () => {
      const existing = await readExisting(path);
      if (existing === null) return;
      if (existing.commandId !== commandId) throw CliRetryJournalConflictError.make();
      await rm(path);
      await sync(dirname(path));
    },
    catch: (cause) =>
      cause instanceof CliRetryJournalConflictError
        ? cause
        : CliRetryJournalError.make({ operation: "clear", cause }),
  });
});

async function readExistingPresentation(path: string) {
  try {
    const status = await lstat(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > maximumBytes) {
      throw CliRetryJournalConflictError.make();
    }
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return Schema.decodeUnknownSync(PresentationMutationRetryJournal)(value, {
      onExcessProperty: "error",
    });
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && Reflect.get(cause, "code") === "ENOENT") {
      return null;
    }
    if (cause instanceof CliRetryJournalConflictError) throw cause;
    throw CliRetryJournalConflictError.make();
  }
}

export const acquirePresentationPublishCommand = Effect.fn(
  "cli.retry.presentation.publish.acquire",
)(function* (projectRoot: string, fingerprint: string) {
  const path = join(projectRoot, presentationRelativePath);
  return yield* Effect.tryPromise({
    try: async () => {
      const existing = await readExistingPresentation(path);
      if (existing !== null) {
        if (existing.fingerprint !== fingerprint) throw CliRetryJournalConflictError.make();
        return existing;
      }
      const parent = dirname(path);
      await mkdir(parent, { recursive: true });
      const [parentStatus, projectReal, parentReal] = await Promise.all([
        lstat(parent),
        realpath(projectRoot),
        realpath(parent),
      ]);
      const parentRelative = relative(projectReal, parentReal);
      if (
        !parentStatus.isDirectory() ||
        parentStatus.isSymbolicLink() ||
        parentRelative === ".." ||
        parentRelative.startsWith(`..${sep}`)
      ) {
        throw CliRetryJournalConflictError.make();
      }
      const journal = PresentationMutationRetryJournal.make({
        formatVersion: 1,
        operation: "presentation.publish",
        commandId: randomUUID(),
        fingerprint,
      });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, canonicalJsonBytes(toJsonValue(journal)), {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
        await sync(temporary);
        try {
          await link(temporary, path);
        } catch (cause) {
          if (
            typeof cause === "object" &&
            cause !== null &&
            Reflect.get(cause, "code") === "EEXIST"
          ) {
            const raced = await readExistingPresentation(path);
            if (raced?.fingerprint === fingerprint) return raced;
            throw CliRetryJournalConflictError.make();
          }
          throw cause;
        }
        await sync(path);
        await sync(parent);
      } finally {
        await rm(temporary, { force: true });
      }
      return journal;
    },
    catch: (cause) =>
      cause instanceof CliRetryJournalConflictError
        ? cause
        : CliRetryJournalError.make({ operation: "presentation.acquire", cause }),
  });
});

export const clearPresentationPublishCommand = Effect.fn("cli.retry.presentation.publish.clear")(
  function* (projectRoot: string, commandId: string) {
    const path = join(projectRoot, presentationRelativePath);
    yield* Effect.tryPromise({
      try: async () => {
        const existing = await readExistingPresentation(path);
        if (existing === null) return;
        if (existing.commandId !== commandId) throw CliRetryJournalConflictError.make();
        await rm(path);
        await sync(dirname(path));
      },
      catch: (cause) =>
        cause instanceof CliRetryJournalConflictError
          ? cause
          : CliRetryJournalError.make({ operation: "presentation.clear", cause }),
    });
  },
);
