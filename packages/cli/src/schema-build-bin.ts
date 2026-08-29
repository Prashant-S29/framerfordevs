// Executes the explicit credential-blind schema-build command without importing auth or API graphs.

import { Cause, Effect, Option } from "effect";

import { booleanFlag, parseArguments, validateFlags } from "./command-arguments";
import { CliConfigFileSystemLive, loadCliConfig } from "./config";
import { CliSchemaBuildNotConfiguredError } from "./errors";
import { runSchemaBuildCommand } from "./schema-build-command";

const stableTaggedCode: Readonly<Record<string, string>> = {
  CliSchemaBuildNotConfiguredError: "CLI_SCHEMA_BUILD_NOT_CONFIGURED",
  CliSchemaBuildOutputUnownedError: "CLI_SCHEMA_BUILD_OUTPUT_UNOWNED",
  CliSchemaBuildOutputModifiedError: "CLI_SCHEMA_BUILD_OUTPUT_MODIFIED",
  CliSchemaBuildStaleError: "CLI_SCHEMA_BUILD_STALE",
  CliSchemaBuildCommitError: "CLI_SCHEMA_BUILD_COMMIT_FAILED",
};

function schemaBuildEffect(rawArguments: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const arguments_ = yield* Effect.try({
      try: () => {
        const parsed = parseArguments(rawArguments);
        validateFlags(parsed);
        if (parsed.command.join(" ") !== "schema build") throw new Error("CLI_COMMAND_UNKNOWN");
        return parsed;
      },
      catch: () => new Error("CLI_FLAG_INVALID"),
    });
    const loaded = yield* loadCliConfig(process.cwd());
    if (
      loaded.config.schemaVersion !== 2 ||
      loaded.config.schemaBuild === undefined ||
      loaded.schemaPath === null
    ) {
      return yield* CliSchemaBuildNotConfiguredError.make();
    }
    return yield* runSchemaBuildCommand({
      projectRoot: loaded.directory,
      entry: loaded.config.schemaBuild.entry,
      schemaPath: loaded.schemaPath,
      schemaRelativePath: loaded.config.schema,
      check: booleanFlag(arguments_, "check"),
    });
  }).pipe(Effect.provide(CliConfigFileSystemLive));
}

export async function runSchemaBuildCli(rawArguments: ReadonlyArray<string>) {
  const json = rawArguments.includes("--json");
  const result = await Effect.runPromiseExit(schemaBuildEffect(rawArguments));
  if (result._tag === "Success") {
    process.stdout.write(
      json ? `${JSON.stringify(result.value)}\n` : `${JSON.stringify(result.value, null, 2)}\n`,
    );
    if (!result.value.accepted) process.exitCode = 2;
    return;
  }
  const failure = Option.getOrUndefined(Cause.failureOption(result.cause));
  const taggedCode =
    typeof failure === "object" &&
    failure !== null &&
    typeof Reflect.get(failure, "_tag") === "string"
      ? String(Reflect.get(failure, "_tag"))
      : undefined;
  const messageCode =
    failure instanceof Error ? /^([A-Z0-9_]+)/.exec(failure.message)?.[1] : undefined;
  const code =
    (taggedCode === undefined ? undefined : stableTaggedCode[taggedCode]) ??
    taggedCode ??
    messageCode ??
    "CLI_ERROR";
  process.stderr.write(
    json
      ? `${JSON.stringify({ ok: false, code })}\n`
      : `The command failed (${code}). Re-run with valid schema-build configuration.\n`,
  );
  process.exitCode = 1;
}
