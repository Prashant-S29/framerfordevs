// Validates local editor authority before dynamically loading credentials, network, or loopback modules.

import { isProjectSchema } from "@framerfordevs/schema/validate";
import { Cause, Effect, Option } from "effect";

import { readAuthoringEnvironmentAuthority } from "./authoring-schema-files";
import { booleanFlag, parseArguments, validateFlags } from "./command-arguments";
import { CliConfigFileSystemLive, loadCliConfig } from "./config";
import { checkSchemaBuildManifest } from "./schema-build-command";
import {
  extractStaticProjectSchema,
  type ExtractedStaticProjectSchema,
  type StaticSchemaExtractionInput,
} from "./schema-extractor";
import type { CliConfigV2, JsonValue } from "./schema";

export interface PreparedEditorCommand {
  readonly config: CliConfigV2;
  readonly projectRoot: string;
  readonly schemaPath: string;
  readonly project: JsonValue;
  readonly projectSha256: string;
  readonly files: ReadonlyArray<string>;
  readonly environmentId: string | null;
}

const stableTaggedCode: Readonly<Record<string, string>> = {
  CliConfigNotFoundError: "CLI_CONFIG_NOT_FOUND",
  CliConfigAmbiguousError: "CLI_CONFIG_AMBIGUOUS",
  CliConfigInvalidError: "CLI_CONFIG_INVALID",
  CliSchemaBuildStaleError: "CLI_SCHEMA_BUILD_STALE",
  StaticSchemaExtractionError: "CLI_SCHEMA_INVALID",
  CliAuthoringSchemaUnownedError: "CLI_SCHEMA_LOCK_REQUIRED",
  CliAuthoringSchemaLockError: "CLI_SCHEMA_LOCK_INVALID",
};

function failureCode(failure: unknown): string {
  const tagged =
    typeof failure === "object" &&
    failure !== null &&
    typeof Reflect.get(failure, "_tag") === "string"
      ? String(Reflect.get(failure, "_tag"))
      : undefined;
  const message =
    failure instanceof Error ? /^([A-Z0-9_]+)/u.exec(failure.message)?.[1] : undefined;
  return (tagged === undefined ? undefined : stableTaggedCode[tagged]) ?? message ?? "CLI_ERROR";
}

export interface EditorPreparationDependencies {
  readonly extract: (
    input: StaticSchemaExtractionInput,
  ) => Effect.Effect<ExtractedStaticProjectSchema, unknown>;
}

const livePreparationDependencies: EditorPreparationDependencies = {
  extract: extractStaticProjectSchema,
};

export function prepareEditorCommand(
  rawArguments: ReadonlyArray<string>,
  startDirectory: string = process.cwd(),
  dependencies: EditorPreparationDependencies = livePreparationDependencies,
) {
  return Effect.gen(function* () {
    yield* Effect.try({
      try: () => {
        const parsed = parseArguments(rawArguments);
        validateFlags(parsed);
        if (parsed.command.join(" ") !== "editor") throw new Error("CLI_COMMAND_UNKNOWN");
      },
      catch: () => new Error("CLI_FLAG_INVALID"),
    });
    const loaded = yield* loadCliConfig(startDirectory);
    if (loaded.config.schemaVersion !== 2 || loaded.schemaPath === null) {
      return yield* Effect.fail(new Error("CLI_CONFIG_V2_REQUIRED"));
    }
    if (loaded.config.schemaBuild !== undefined) {
      yield* checkSchemaBuildManifest({
        projectRoot: loaded.directory,
        schemaPath: loaded.schemaPath,
        schemaRelativePath: loaded.config.schema,
        entryRelativePath: loaded.config.schemaBuild.entry,
      });
    }
    const extracted = yield* dependencies.extract({
      projectRoot: loaded.directory,
      entry: loaded.config.schema,
    });
    if (!isProjectSchema(extracted.project)) {
      return yield* Effect.fail(new Error("CLI_SCHEMA_INVALID"));
    }
    const environment = yield* Effect.option(
      readAuthoringEnvironmentAuthority({
        projectRoot: loaded.directory,
        projectId: loaded.config.projectId,
        environmentKey: loaded.config.environment,
      }),
    );
    return {
      config: loaded.config,
      projectRoot: loaded.directory,
      schemaPath: loaded.schemaPath,
      project: extracted.project,
      projectSha256: extracted.sha256,
      files: extracted.files,
      environmentId: Option.getOrNull(environment)?.environmentId ?? null,
    } satisfies PreparedEditorCommand;
  }).pipe(Effect.provide(CliConfigFileSystemLive));
}

async function readManagementTokenFromStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("CLI_EDITOR_TOKEN_STDIN_REQUIRED");
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 16_385) throw new Error("CLI_EDITOR_TOKEN_INVALID");
  }
  const token = value.trim();
  value = "";
  if (token.length < 1 || token.length > 16_384 || /\s/u.test(token)) {
    throw new Error("CLI_EDITOR_TOKEN_INVALID");
  }
  return token;
}

export async function runEditorCli(rawArguments: ReadonlyArray<string>) {
  const prepared = await Effect.runPromiseExit(prepareEditorCommand(rawArguments));
  if (prepared._tag === "Failure") {
    const code = failureCode(Option.getOrUndefined(Cause.failureOption(prepared.cause)));
    process.stderr.write(
      `The command failed (${code}). Fix local editor configuration or schema authority.\n`,
    );
    process.exitCode = 1;
    return;
  }
  try {
    const tokenFromStdin = booleanFlag(parseArguments(rawArguments), "token-stdin");
    if (tokenFromStdin && process.env["FFD_MANAGEMENT_TOKEN"] !== undefined) {
      throw new Error("CLI_EDITOR_TOKEN_AMBIGUOUS");
    }
    const managementToken = tokenFromStdin ? await readManagementTokenFromStdin() : undefined;
    const online = await import("./editor-online.js");
    await online.runEditorOnline(prepared.value, { managementToken });
  } catch (failure) {
    const code = failureCode(failure);
    process.stderr.write(
      `The command failed (${code}). Check credentials or current hosted authority.\n`,
    );
    process.exitCode = 1;
  }
}
