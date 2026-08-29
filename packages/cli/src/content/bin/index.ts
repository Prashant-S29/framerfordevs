// Validates all local flags and mutation files before loading credential or network modules.

import { AuthoringMutationSchema, type AuthoringMutation } from "@framerfordevs/sdk/authoring";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { Cause, Effect, Option, Schema } from "effect";

import {
  readAuthoringCollectionAuthority,
  readAuthoringEnvironmentAuthority,
} from "../../schema/authoring/files";
import { parseArguments, stringFlag, validateFlags } from "../../command-arguments";
import { CliConfigFileSystemLive, loadCliConfig } from "../../config";
import type { CliConfigV2 } from "../../schema";

const maximumMutationBytes = 1_048_576;
export type ContentCommand =
  | "entry list"
  | "entry get"
  | "entry create"
  | "entry update"
  | "entry publish"
  | "entry unpublish";

export interface PreparedContentCommand {
  readonly command: ContentCommand;
  readonly config: CliConfigV2;
  readonly projectRoot: string;
  readonly collection: string;
  readonly locale: string;
  readonly entryId: string | undefined;
  readonly name: string | undefined;
  readonly mutations: ReadonlyArray<AuthoringMutation>;
  readonly environmentId: string | null;
  readonly createAuthority: { readonly revisionId: string; readonly contractHash: string } | null;
}

function contentCommand(value: string): ContentCommand | null {
  switch (value) {
    case "entry list":
    case "entry get":
    case "entry create":
    case "entry update":
    case "entry publish":
    case "entry unpublish":
      return value;
    default:
      return null;
  }
}
const apiKeyPattern = /^[a-z][a-z0-9_]{0,62}$/u;
const localePattern = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

async function readMutations(
  projectRoot: string,
  pathValue: string,
  requireItems: boolean,
): Promise<ReadonlyArray<AuthoringMutation>> {
  if (
    isAbsolute(pathValue) ||
    pathValue.includes("\\") ||
    pathValue.includes("\0") ||
    pathValue.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error("CLI_MUTATION_PATH_INVALID");
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
    status.size > maximumMutationBytes
  ) {
    throw new Error("CLI_MUTATION_PATH_INVALID");
  }
  const bytes = await readFile(path, "utf8");
  if (Buffer.byteLength(bytes, "utf8") > maximumMutationBytes || bytes.startsWith("\uFEFF")) {
    throw new Error("CLI_MUTATION_FILE_INVALID");
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes);
  } catch {
    throw new Error("CLI_MUTATION_FILE_INVALID");
  }
  try {
    const mutationsSchema = requireItems
      ? Schema.Array(AuthoringMutationSchema).pipe(Schema.minItems(1), Schema.maxItems(500))
      : Schema.Array(AuthoringMutationSchema).pipe(Schema.maxItems(500));
    return Schema.decodeUnknownSync(mutationsSchema)(value, { onExcessProperty: "error" });
  } catch {
    throw new Error("CLI_MUTATION_FILE_INVALID");
  }
}

export function prepareContentCommand(
  rawArguments: ReadonlyArray<string>,
  startDirectory: string = process.cwd(),
) {
  return Effect.gen(function* () {
    const arguments_ = yield* Effect.try({
      try: () => {
        const parsed = parseArguments(rawArguments);
        validateFlags(parsed);
        const command = contentCommand(parsed.command.join(" "));
        if (command === null) throw new Error("CLI_COMMAND_UNKNOWN");
        return { parsed, command };
      },
      catch: () => new Error("CLI_FLAG_INVALID"),
    });
    const loaded = yield* loadCliConfig(startDirectory);
    if (loaded.config.schemaVersion !== 2) {
      return yield* Effect.fail(new Error("CLI_CONFIG_V2_REQUIRED"));
    }
    const collection = stringFlag(arguments_.parsed, "collection");
    const locale = stringFlag(arguments_.parsed, "locale");
    const entryId = stringFlag(arguments_.parsed, "entry");
    const name = stringFlag(arguments_.parsed, "name");
    if (
      collection === undefined ||
      locale === undefined ||
      !apiKeyPattern.test(collection) ||
      collection.includes("__") ||
      collection.endsWith("_") ||
      locale.length > 64 ||
      !localePattern.test(locale) ||
      ((arguments_.command === "entry get" ||
        arguments_.command === "entry update" ||
        arguments_.command === "entry publish" ||
        arguments_.command === "entry unpublish") &&
        (entryId === undefined || !uuidPattern.test(entryId))) ||
      (arguments_.command === "entry create" &&
        (name === undefined || name.length < 1 || name.length > 100))
    ) {
      return yield* Effect.fail(new Error("CLI_CONTENT_FLAGS_INVALID"));
    }
    const mutationPath = stringFlag(arguments_.parsed, "mutations");
    if (arguments_.command === "entry update" && mutationPath === undefined) {
      return yield* Effect.fail(new Error("CLI_MUTATION_FILE_REQUIRED"));
    }
    const mutations =
      mutationPath === undefined
        ? []
        : yield* Effect.tryPromise({
            try: () =>
              readMutations(loaded.directory, mutationPath, arguments_.command === "entry update"),
            catch: (cause) =>
              cause instanceof Error && cause.message.startsWith("CLI_")
                ? cause
                : new Error("CLI_MUTATION_FILE_INVALID"),
          });
    const environmentAuthority = yield* Effect.option(
      readAuthoringEnvironmentAuthority({
        projectRoot: loaded.directory,
        projectId: loaded.config.projectId,
        environmentKey: loaded.config.environment,
      }),
    );
    const createAuthority =
      arguments_.command === "entry create"
        ? yield* readAuthoringCollectionAuthority({
            projectRoot: loaded.directory,
            projectId: loaded.config.projectId,
            environmentKey: loaded.config.environment,
            collectionKey: collection,
          })
        : null;
    return {
      command: arguments_.command,
      config: loaded.config,
      projectRoot: loaded.directory,
      collection,
      locale,
      entryId,
      name,
      mutations,
      environmentId: Option.getOrNull(environmentAuthority)?.environmentId ?? null,
      createAuthority,
    };
  }).pipe(Effect.provide(CliConfigFileSystemLive));
}

export async function runContentCli(rawArguments: ReadonlyArray<string>) {
  const json = rawArguments.includes("--json");
  const prepared = await Effect.runPromiseExit(prepareContentCommand(rawArguments));
  if (prepared._tag === "Failure") {
    const code = failureCode(Option.getOrUndefined(Cause.failureOption(prepared.cause)));
    process.stderr.write(
      json
        ? `${JSON.stringify({ ok: false, code })}\n`
        : `The command failed (${code}). Fix local flags or mutation-file authority.\n`,
    );
    process.exitCode = 1;
    return;
  }
  try {
    const { runContentOnline } = await import("../online/index.js");
    const value = await runContentOnline(prepared.value);
    process.stdout.write(
      json ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`,
    );
    if (Reflect.get(value, "accepted") === false) process.exitCode = 2;
  } catch (failure) {
    const code = failureCode(failure);
    process.stderr.write(
      json
        ? `${JSON.stringify({ ok: false, code })}\n`
        : `The command failed (${code}). Check credentials or current hosted authority.\n`,
    );
    process.exitCode = 1;
  }
}
