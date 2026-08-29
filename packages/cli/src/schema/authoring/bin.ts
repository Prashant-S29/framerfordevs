// Validates local authority before dynamically loading credentials or HTTP clients.

import { isProjectSchema } from "@framerfordevs/schema/validate";
import { Cause, Effect, Option } from "effect";

import { writeExportedAuthoringSchema } from "./files";
import { canonicalJsonBytes, sha256, toJsonValue } from "../../canonical";
import { parseArguments, stringFlags, validateFlags } from "../../command-arguments";
import { CliConfigFileSystemLive, loadCliConfig } from "../../config";
import { checkSchemaBuildManifest } from "../build/command";
import { extractStaticProjectSchema } from "../extractor";

const stableTaggedCode: Readonly<Record<string, string>> = {
  CliConfigNotFoundError: "CLI_CONFIG_NOT_FOUND",
  CliConfigAmbiguousError: "CLI_CONFIG_AMBIGUOUS",
  CliConfigInvalidError: "CLI_CONFIG_INVALID",
  CliSchemaBuildStaleError: "CLI_SCHEMA_BUILD_STALE",
  StaticSchemaExtractionError: "CLI_SCHEMA_INVALID",
  CliAuthoringSchemaUnownedError: "CLI_SCHEMA_OUTPUT_UNOWNED",
  CliAuthoringSchemaModifiedError: "CLI_SCHEMA_OUTPUT_MODIFIED",
  CliAuthoringSchemaLockError: "CLI_SCHEMA_LOCK_FAILED",
  CliRetryJournalConflictError: "CLI_RETRY_JOURNAL_CONFLICT",
  CliRetryJournalError: "CLI_RETRY_JOURNAL_FAILED",
};

function parseSchemaArguments(rawArguments: ReadonlyArray<string>) {
  return Effect.try({
    try: () => {
      const parsed = parseArguments(rawArguments);
      validateFlags(parsed);
      const command = parsed.command.join(" ");
      if (command === "schema export") return { parsed, command };
      if (command === "schema plan") return { parsed, command };
      if (command === "schema push") return { parsed, command };
      throw new Error("CLI_COMMAND_UNKNOWN");
    },
    catch: () => new Error("CLI_FLAG_INVALID"),
  });
}

function prepareConfig(rawArguments: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const arguments_ = yield* parseSchemaArguments(rawArguments);
    const loaded = yield* loadCliConfig(process.cwd());
    if (loaded.config.schemaVersion !== 2 || loaded.schemaPath === null) {
      return yield* Effect.fail(new Error("CLI_CONFIG_V2_REQUIRED"));
    }
    return {
      arguments_,
      loaded: { ...loaded, config: loaded.config, schemaPath: loaded.schemaPath },
    };
  }).pipe(Effect.provide(CliConfigFileSystemLive));
}

function prepareLocalSchema(rawArguments: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    const prepared = yield* prepareConfig(rawArguments);
    if (prepared.arguments_.command === "schema export") {
      return yield* Effect.fail(new Error("CLI_COMMAND_INVALID"));
    }
    const { loaded } = prepared;
    if (loaded.config.schemaBuild !== undefined) {
      yield* checkSchemaBuildManifest({
        projectRoot: loaded.directory,
        schemaPath: loaded.schemaPath,
        schemaRelativePath: loaded.config.schema,
        entryRelativePath: loaded.config.schemaBuild.entry,
      });
    }
    const acknowledgedChangeIds =
      prepared.arguments_.command === "schema push"
        ? stringFlags(prepared.arguments_.parsed, "acknowledge")
        : [];
    if (
      acknowledgedChangeIds.length > 10_000 ||
      acknowledgedChangeIds.some((value) => !/^[0-9a-f]{64}$/u.test(value))
    ) {
      return yield* Effect.fail(new Error("CLI_ACKNOWLEDGEMENT_INVALID"));
    }
    const extracted = yield* extractStaticProjectSchema({
      projectRoot: loaded.directory,
      entry: loaded.config.schema,
    });
    const project = extracted.project;
    if (!isProjectSchema(project)) {
      return yield* Effect.fail(new Error("CLI_SCHEMA_INVALID"));
    }
    return {
      ...prepared,
      project,
      projectSha256: extracted.sha256,
      acknowledgedChangeIds,
    };
  });
}

function failureCode(failure: unknown) {
  const taggedCode =
    typeof failure === "object" &&
    failure !== null &&
    typeof Reflect.get(failure, "_tag") === "string"
      ? String(Reflect.get(failure, "_tag"))
      : undefined;
  const messageCode =
    failure instanceof Error ? /^([A-Z0-9_]+)/u.exec(failure.message)?.[1] : undefined;
  return (
    (taggedCode === undefined ? undefined : stableTaggedCode[taggedCode]) ??
    messageCode ??
    "CLI_ERROR"
  );
}

function writeFailure(json: boolean, code: string, local: boolean) {
  process.stderr.write(
    json
      ? `${JSON.stringify({ ok: false, code })}\n`
      : `The command failed (${code}). ${local ? "Fix local schema/configuration authority." : "Check credentials, concurrency authority, or server diagnostics."}\n`,
  );
  process.exitCode = 1;
}

export async function runSchemaAuthoringCli(rawArguments: ReadonlyArray<string>) {
  const json = rawArguments.includes("--json");
  const command = rawArguments.slice(0, 2).join(" ");
  if (command === "schema export") {
    const prepared = await Effect.runPromiseExit(prepareConfig(rawArguments));
    if (prepared._tag === "Failure") {
      writeFailure(
        json,
        failureCode(Option.getOrUndefined(Cause.failureOption(prepared.cause))),
        true,
      );
      return;
    }
    if (prepared.value.loaded.config.schemaBuild !== undefined) {
      writeFailure(json, "CLI_SCHEMA_EXPORT_BUILD_CONFIGURED", true);
      return;
    }
    try {
      const online = await import("./online/index.js");
      const result = await online.runSchemaExportOnline(prepared.value.loaded.config);
      const projectSha256 = sha256(canonicalJsonBytes(toJsonValue(result.exported.project)));
      await Effect.runPromise(
        writeExportedAuthoringSchema({
          projectRoot: prepared.value.loaded.directory,
          schemaPath: prepared.value.loaded.schemaPath,
          project: result.exported.project,
          authority: {
            projectId: prepared.value.loaded.config.projectId,
            environmentId: result.environmentId,
            environmentKey: prepared.value.loaded.config.environment,
            projectSha256,
            projectManifestHash: result.exported.current.projectManifestHash,
            revisionIds: result.exported.current.revisionIds,
            revisions: result.exported.revisions,
            collections: result.exported.collections,
            fields: result.exported.fields,
            enumOptions: result.exported.enumOptions,
          },
        }),
      );
      const value = {
        command,
        accepted: true,
        output: prepared.value.loaded.config.schema,
        projectSha256,
        projectManifestHash: result.exported.current.projectManifestHash,
        collections: result.exported.collections.length,
        fields: result.exported.fields.length,
        enumOptions: result.exported.enumOptions.length,
      };
      process.stdout.write(
        json ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`,
      );
    } catch (failure) {
      writeFailure(json, failureCode(failure), false);
    }
    return;
  }

  const prepared = await Effect.runPromiseExit(prepareLocalSchema(rawArguments));
  if (prepared._tag === "Failure") {
    writeFailure(
      json,
      failureCode(Option.getOrUndefined(Cause.failureOption(prepared.cause))),
      true,
    );
    return;
  }
  try {
    const online = await import("./online/index.js");
    const value =
      command === "schema push"
        ? await online.runSchemaPushOnline({
            config: prepared.value.loaded.config,
            projectRoot: prepared.value.loaded.directory,
            schemaPath: prepared.value.loaded.schemaPath,
            project: prepared.value.project,
            projectSha256: prepared.value.projectSha256,
            acknowledgedChangeIds: prepared.value.acknowledgedChangeIds,
          })
        : await online.runSchemaPlanOnline({
            config: prepared.value.loaded.config,
            project: prepared.value.project,
            projectSha256: prepared.value.projectSha256,
          });
    process.stdout.write(
      json ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`,
    );
    if (!value.accepted) process.exitCode = 2;
  } catch (failure) {
    writeFailure(json, failureCode(failure), false);
  }
}
