// Validates Presentation authority files before loading credentials or network clients.

import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { Cause, Effect, Option, Schema } from "effect";

import { parseArguments, stringFlag, validateFlags } from "../../command-arguments";
import { CliConfigFileSystemLive, loadCliConfig } from "../../config";
import { readAuthoringEnvironmentAuthority } from "../../schema/authoring/files";
import { PresentationEditDocument } from "../document";

const maximumDocumentBytes = 1_048_576;
const apiKeyPattern = /^[a-z][a-z0-9_]{0,62}$/u;

function failureCode(failure: unknown) {
  const tagged =
    typeof failure === "object" &&
    failure !== null &&
    typeof Reflect.get(failure, "_tag") === "string"
      ? String(Reflect.get(failure, "_tag"))
      : undefined;
  const stable: Readonly<Record<string, string>> = {
    CliConfigNotFoundError: "CLI_CONFIG_NOT_FOUND",
    CliConfigAmbiguousError: "CLI_CONFIG_AMBIGUOUS",
    CliConfigInvalidError: "CLI_CONFIG_INVALID",
    CliAuthoringSchemaUnownedError: "CLI_SCHEMA_LOCK_REQUIRED",
    CliAuthoringSchemaLockError: "CLI_SCHEMA_LOCK_INVALID",
    CliRetryJournalConflictError: "CLI_RETRY_JOURNAL_CONFLICT",
    CliRetryJournalError: "CLI_RETRY_JOURNAL_FAILED",
  };
  const message =
    failure instanceof Error ? /^([A-Z0-9_]+)/u.exec(failure.message)?.[1] : undefined;
  return (tagged === undefined ? undefined : stable[tagged]) ?? message ?? "CLI_ERROR";
}

async function readPresentationDocument(projectRoot: string, pathValue: string) {
  if (
    isAbsolute(pathValue) ||
    pathValue.includes("\\") ||
    pathValue.includes("\0") ||
    pathValue.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("CLI_PRESENTATION_PATH_INVALID");
  }
  const rootReal = await realpath(projectRoot);
  const path = resolve(projectRoot, pathValue);
  const pathReal = await realpath(path);
  const fromRoot = relative(rootReal, pathReal);
  const status = await lstat(path);
  if (
    path !== pathReal ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    !status.isFile() ||
    status.isSymbolicLink() ||
    status.size > maximumDocumentBytes
  ) {
    throw new Error("CLI_PRESENTATION_PATH_INVALID");
  }
  const bytes = await readFile(path, "utf8");
  if (Buffer.byteLength(bytes, "utf8") > maximumDocumentBytes || bytes.startsWith("\uFEFF")) {
    throw new Error("CLI_PRESENTATION_FILE_INVALID");
  }
  try {
    const value: unknown = JSON.parse(bytes);
    return Schema.decodeUnknownSync(PresentationEditDocument)(value, {
      onExcessProperty: "error",
    });
  } catch {
    throw new Error("CLI_PRESENTATION_FILE_INVALID");
  }
}

export function preparePresentationCommand(
  rawArguments: ReadonlyArray<string>,
  startDirectory: string = process.cwd(),
) {
  return Effect.gen(function* () {
    const arguments_ = yield* Effect.try({
      try: () => {
        const parsed = parseArguments(rawArguments);
        validateFlags(parsed);
        const command = parsed.command.join(" ");
        if (command !== "presentation get" && command !== "presentation publish") {
          throw new Error("CLI_COMMAND_UNKNOWN");
        }
        return { parsed, command };
      },
      catch: () => new Error("CLI_FLAG_INVALID"),
    });
    const loaded = yield* loadCliConfig(startDirectory);
    if (loaded.config.schemaVersion !== 2) {
      return yield* Effect.fail(new Error("CLI_CONFIG_V2_REQUIRED"));
    }
    const collection = stringFlag(arguments_.parsed, "collection");
    if (
      collection === undefined ||
      !apiKeyPattern.test(collection) ||
      collection.includes("__") ||
      collection.endsWith("_")
    ) {
      return yield* Effect.fail(new Error("CLI_PRESENTATION_FLAGS_INVALID"));
    }
    if (arguments_.command === "presentation get") {
      const environmentAuthority = yield* Effect.option(
        readAuthoringEnvironmentAuthority({
          projectRoot: loaded.directory,
          projectId: loaded.config.projectId,
          environmentKey: loaded.config.environment,
        }),
      );
      return {
        command: arguments_.command,
        config: loaded.config,
        projectRoot: loaded.directory,
        collection,
        environmentId: Option.getOrNull(environmentAuthority)?.environmentId ?? null,
        document: null,
      };
    }
    const file = stringFlag(arguments_.parsed, "file");
    if (file === undefined) {
      return yield* Effect.fail(new Error("CLI_PRESENTATION_FILE_REQUIRED"));
    }
    const document = yield* Effect.tryPromise({
      try: () => readPresentationDocument(loaded.directory, file),
      catch: (cause) =>
        cause instanceof Error && cause.message.startsWith("CLI_")
          ? cause
          : new Error("CLI_PRESENTATION_FILE_INVALID"),
    });
    if (
      document.projectId !== loaded.config.projectId ||
      document.environmentKey !== loaded.config.environment ||
      document.collection !== collection
    ) {
      return yield* Effect.fail(new Error("CLI_PRESENTATION_AUTHORITY_INVALID"));
    }
    return {
      command: arguments_.command,
      config: loaded.config,
      projectRoot: loaded.directory,
      collection,
      environmentId: document.environmentId,
      document,
    };
  }).pipe(Effect.provide(CliConfigFileSystemLive));
}

function writeFailure(json: boolean, code: string, local: boolean) {
  process.stderr.write(
    json
      ? `${JSON.stringify({ ok: false, code })}\n`
      : `The command failed (${code}). ${local ? "Fix local configuration, flags, or Presentation file authority." : "Check credentials, concurrency authority, or server diagnostics."}\n`,
  );
  process.exitCode = 1;
}

export async function runPresentationCli(rawArguments: ReadonlyArray<string>) {
  const json = rawArguments.includes("--json");
  const prepared = await Effect.runPromiseExit(preparePresentationCommand(rawArguments));
  if (prepared._tag === "Failure") {
    writeFailure(
      json,
      failureCode(Option.getOrUndefined(Cause.failureOption(prepared.cause))),
      true,
    );
    return;
  }
  try {
    const online = await import("../online/index.js");
    const value =
      prepared.value.command === "presentation get"
        ? await online.runPresentationGetOnline({
            config: prepared.value.config,
            collection: prepared.value.collection,
            environmentId: prepared.value.environmentId,
          })
        : prepared.value.document === null
          ? await Promise.reject(new Error("CLI_PRESENTATION_FILE_REQUIRED"))
          : await online.runPresentationPublishOnline({
              config: prepared.value.config,
              projectRoot: prepared.value.projectRoot,
              document: prepared.value.document,
            });
    process.stdout.write(
      json ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`,
    );
  } catch (failure) {
    writeFailure(json, failureCode(failure), false);
  }
}
