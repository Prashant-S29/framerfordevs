import { isProjectSchema } from "@framerfordevs/schema/validate";
import { Cause, Effect, Option } from "effect";

import { readAuthoringEnvironmentAuthority } from "../../schema/authoring/files";
import { parseArguments, validateFlags } from "../../command-arguments";
import { CliConfigFileSystemLive, loadCliConfig } from "../../config";
import { checkSchemaBuildManifest } from "../../schema/build/command";
import {
  extractStaticProjectSchema,
  type ExtractedStaticProjectSchema,
  type StaticSchemaExtractionInput,
} from "../../schema/extractor";
import type { CliConfig, JsonValue } from "../../schema";

export interface PreparedEditorCommand {
  readonly config: CliConfig;
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

export async function runEditorCli(rawArguments: ReadonlyArray<string>) {
  const prepared = await Effect.runPromiseExit(prepareEditorCommand(rawArguments));
  if (prepared._tag === "Failure") {
    const code = failureCode(Option.getOrUndefined(Cause.findErrorOption(prepared.cause)));
    process.stderr.write(
      `The command failed (${code}). Fix local editor configuration or schema authority.\n`,
    );
    process.exitCode = 1;
    return;
  }
  try {
    if (process.env["FFD_MANAGEMENT_TOKEN"] !== undefined) {
      throw new Error("CLI_EDITOR_OAUTH_REQUIRED");
    }
    const online = await import("../online/index.js");
    await online.runEditorOnline(prepared.value);
  } catch (failure) {
    const code = failureCode(failure);
    process.stderr.write(
      code === "CLI_EDITOR_OAUTH_REQUIRED"
        ? "The command failed (CLI_EDITOR_OAUTH_REQUIRED). The local editor uses your ffd login. Unset FFD_MANAGEMENT_TOKEN and run ffd login.\n"
        : `The command failed (${code}). Check credentials or current hosted authority.\n`,
    );
    process.exitCode = 1;
  }
}
