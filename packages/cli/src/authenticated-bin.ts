import { open, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { Cause, Effect, Layer, ManagedRuntime, Option, Schema } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "./canonical";
import {
  booleanFlag,
  parseArguments,
  stringFlag,
  validateFlags,
  type ParsedArguments,
} from "./command-arguments";
import {
  CliConfigFileSystem,
  CliConfigFileSystemLive,
  generationLockFileName,
  loadCliConfig,
} from "./config";
import { CredentialStore, CredentialStoreLive } from "./credential-store";
import {
  decodeControlPlaneApiOrigin,
  executeControlPlaneCommand,
  isControlPlaneCommand,
  verifyControlPlaneLinkAuthority,
} from "./control-plane-command";
import { makeControlPlaneHttpClient } from "./control-plane-http-client";
import { classifySchemaDrift } from "./diff";
import {
  GeneratorFileSystem,
  GeneratorFileSystemLive,
  commitGenerationPlan,
} from "./filesystem-transaction";
import { planGeneration } from "./generator";
import {
  BrowserOpener,
  BrowserOpenerLive,
  DeviceAuthorizationPresenter,
  getValidAccessToken,
  loginWithDeviceAuthorization,
} from "./oauth-device";
import { pullReconciledAuthority } from "./pull";
import { CliConfig, PulledToolingAuthority, SchemaLock } from "./schema";
import { ToolingHttpClient, makeToolingHttpClient } from "./tooling-http-client";

async function syncFile(path: string) {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function atomicWrite(path: string, bytes: string) {
  return Effect.tryPromise({
    try: async () => {
      const parent = dirname(path);
      await mkdir(parent, { recursive: true });
      const parentStatus = await lstat(parent);
      if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
        throw new Error("Destination parent must be a real directory.");
      }
      const targetStatus = await lstat(path).catch((error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          Reflect.get(error, "code") === "ENOENT"
        ) {
          return null;
        }
        throw error;
      });
      if (targetStatus?.isSymbolicLink()) throw new Error("Destination cannot be a symlink.");
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
        await syncFile(temporary);
        await rename(temporary, path);
        await syncFile(parent);
      } finally {
        await rm(temporary, { force: true });
      }
    },
    catch: (cause) => new Error(`CLI_FILESYSTEM:${String(cause)}`),
  });
}

function readBoundedJson<A, I>(path: string, schema: Schema.Schema<A, I, never>, maximum: number) {
  return Effect.gen(function* () {
    const bytes = yield* Effect.tryPromise({
      try: () => readFile(path, "utf8"),
      catch: (cause) => new Error(`CLI_FILESYSTEM:${String(cause)}`),
    });
    if (Buffer.byteLength(bytes, "utf8") > maximum)
      return yield* Effect.fail(new Error("CLI_FILE_TOO_LARGE"));
    const value = yield* Effect.try({
      try: (): unknown => JSON.parse(bytes),
      catch: () => new Error("CLI_JSON_INVALID"),
    });
    return yield* Schema.decodeUnknown(schema)(value, { onExcessProperty: "error" }).pipe(
      Effect.mapError(() => new Error("CLI_JSON_INVALID")),
    );
  });
}

function tokenForOrigin(apiOrigin: string) {
  const management = process.env["FFD_MANAGEMENT_TOKEN"];
  if (management !== undefined && management.length > 0) return Effect.succeed(management);
  return getValidAccessToken({ apiOrigin });
}

function pullOnline(config: CliConfig) {
  return Effect.gen(function* () {
    const token = yield* tokenForOrigin(config.apiBaseUrl);
    const client = makeToolingHttpClient({ baseUrl: config.apiBaseUrl, token });
    return yield* pullReconciledAuthority(config.projectId, config.environment).pipe(
      Effect.provide(Layer.succeed(ToolingHttpClient, client)),
    );
  });
}

function cachePath(directory: string) {
  return join(directory, ".framerfordevs", "pull.json");
}

function pullAndCache(directory: string, config: CliConfig) {
  return Effect.gen(function* () {
    const authority = yield* pullOnline(config);
    const cache = PulledToolingAuthority.make({
      cacheVersion: 1,
      manifest: authority.manifest,
      revisions: authority.revisions,
    });
    yield* atomicWrite(cachePath(directory), canonicalJsonBytes(toJsonValue(cache)));
    return { authority: cache, retries: authority.retries };
  });
}

type CommandEnvironment =
  | CliConfigFileSystem
  | CredentialStore
  | GeneratorFileSystem
  | DeviceAuthorizationPresenter
  | BrowserOpener;

function commandEffect(
  arguments_: ParsedArguments,
): Effect.Effect<Record<string, unknown>, unknown, CommandEnvironment> {
  const command = arguments_.command.join(" ");
  if (command === "login") {
    const apiOrigin = stringFlag(arguments_, "api");
    if (apiOrigin === undefined) return Effect.fail(new Error("CLI_API_REQUIRED"));
    return loginWithDeviceAuthorization({
      apiOrigin,
      openBrowser: booleanFlag(arguments_, "open"),
    }).pipe(Effect.map((result) => ({ command, authenticated: true, ...result })));
  }
  if (command === "logout") {
    const apiOrigin = stringFlag(arguments_, "api");
    if (apiOrigin === undefined) return Effect.fail(new Error("CLI_API_REQUIRED"));
    return Effect.gen(function* () {
      yield* (yield* CredentialStore).remove(apiOrigin);
      return { command, authenticated: false };
    });
  }
  if (command === "whoami") {
    const apiOrigin = stringFlag(arguments_, "api");
    if (apiOrigin === undefined) return Effect.fail(new Error("CLI_API_REQUIRED"));
    return Effect.gen(function* () {
      const token = yield* tokenForOrigin(apiOrigin);
      const client = makeToolingHttpClient({ baseUrl: apiOrigin, token });
      yield* client.listProjects(null, 1);
      return { command, authenticated: true, apiOrigin: new URL(apiOrigin).origin };
    });
  }
  if (isControlPlaneCommand(command)) {
    const apiOrigin = stringFlag(arguments_, "api");
    if (apiOrigin === undefined) return Effect.fail(new Error("CLI_API_REQUIRED"));
    return Effect.gen(function* () {
      const canonicalApiOrigin = yield* decodeControlPlaneApiOrigin(apiOrigin);
      const token = yield* tokenForOrigin(canonicalApiOrigin);
      return yield* executeControlPlaneCommand({
        arguments: arguments_,
        apiOrigin: canonicalApiOrigin,
        token,
        root: process.cwd(),
      });
    });
  }
  if (command === "link") {
    const apiBaseUrl = stringFlag(arguments_, "api");
    const projectId = stringFlag(arguments_, "project");
    const environment = stringFlag(arguments_, "environment");
    const output = stringFlag(arguments_, "output") ?? "src/framerfordevs";
    const schemaPath = stringFlag(arguments_, "schema") ?? "framerfordevs.schema.ts";
    if (apiBaseUrl === undefined || projectId === undefined || environment === undefined) {
      return Effect.fail(new Error("CLI_LINK_FLAGS_REQUIRED"));
    }
    return Effect.gen(function* () {
      const config = yield* Schema.decodeUnknown(CliConfig)(
        {
          schemaVersion: 2,
          apiBaseUrl,
          projectId,
          environment,
          output,
          schema: schemaPath,
        },
        { onExcessProperty: "error" },
      ).pipe(Effect.mapError(() => new Error("CLI_CONFIG_INVALID")));
      const token = yield* tokenForOrigin(config.apiBaseUrl);
      const controlPlane = makeControlPlaneHttpClient({ baseUrl: config.apiBaseUrl, token });
      const verified = yield* verifyControlPlaneLinkAuthority(
        yield* controlPlane.getProject(config.projectId),
        config.projectId,
        config.environment,
      );
      const project = verified.project;
      const path = resolve(process.cwd(), "framerfordevs.config.json");
      yield* atomicWrite(path, canonicalJsonBytes(toJsonValue(config)));
      return {
        command,
        path,
        workspaceId: project.workspaceId,
        projectId: project.id,
        environment: project.primaryEnvironment.key,
        environmentId: project.primaryEnvironment.id,
        cmsStatus: verified.cmsStatus,
      };
    });
  }
  if (command === "schema pull") {
    return Effect.gen(function* () {
      const loaded = yield* loadCliConfig(process.cwd());
      const result = yield* pullAndCache(loaded.directory, loaded.config);
      return {
        command,
        collections: result.authority.manifest.collections.length,
        retries: result.retries,
      };
    });
  }
  if (command === "generate") {
    return Effect.gen(function* () {
      const loaded = yield* loadCliConfig(process.cwd());
      const cached = booleanFlag(arguments_, "offline")
        ? yield* readBoundedJson(
            cachePath(loaded.directory),
            PulledToolingAuthority,
            16 * 1_024 * 1_024,
          )
        : (yield* pullAndCache(loaded.directory, loaded.config)).authority;
      const plan = planGeneration({
        manifest: cached.manifest,
        revisions: cached.revisions,
      });
      const committed = yield* commitGenerationPlan({
        rootDirectory: loaded.directory,
        outputDirectory: loaded.outputDirectory,
        plan,
        lockFileName: generationLockFileName(loaded.config),
        force: booleanFlag(arguments_, "force"),
      });
      return { command, files: committed.files, output: loaded.config.output };
    });
  }
  if (command === "schema check") {
    return Effect.gen(function* () {
      const loaded = yield* loadCliConfig(process.cwd());
      const currentAuthority = (yield* pullAndCache(loaded.directory, loaded.config)).authority;
      const currentPlan = planGeneration({
        manifest: currentAuthority.manifest,
        revisions: currentAuthority.revisions,
      });
      const locked = yield* readBoundedJson(
        join(loaded.directory, ".framerfordevs", generationLockFileName(loaded.config)),
        SchemaLock,
        16 * 1_024 * 1_024,
      );
      const actual: Record<string, string | undefined> = {};
      for (const file of locked.files) {
        const bytes = yield* Effect.option(
          Effect.tryPromise({
            try: () => readFile(join(loaded.outputDirectory, file.path), "utf8"),
            catch: () => new Error("CLI_FILE_MISSING"),
          }),
        );
        actual[file.path] = bytes._tag === "Some" ? sha256(bytes.value) : undefined;
      }
      const report = classifySchemaDrift({
        locked,
        current: currentPlan.lock,
        actualFileDigests: actual,
      });
      if (report.category === "metadata_only" && booleanFlag(arguments_, "allow-metadata-only")) {
        return { command, ...report, accepted: true };
      }
      return { command, ...report, accepted: report.category === "up_to_date" };
    });
  }
  if (command === "" || command === "help") {
    return Effect.succeed({
      command: "help",
      usage: [
        "ffd login --api <origin> [--open]",
        "ffd logout --api <origin>",
        "ffd whoami --api <origin>",
        "ffd workspace list --api <origin> [--limit <n>] [--cursor <cursor>]",
        "ffd workspace get --api <origin> --workspace <id>",
        "ffd workspace create --api <origin> --name <name> [--command-id <uuid>]",
        "ffd project list --api <origin> --workspace <id> [--status active|archived] [--limit <n>] [--cursor <cursor>]",
        "ffd project get --api <origin> --project <id>",
        "ffd project create --api <origin> --workspace <id> --name <name> --key <key> [--description <text>] [--enable-cms] [--command-id <uuid>]",
        "ffd project update --api <origin> --project <id> --expected-version <n> --name <name> [--description <text>|--clear-description]",
        "ffd project archive --api <origin> --project <id> --expected-version <n> --confirm-key <key>",
        "ffd project restore --api <origin> --project <id> --expected-version <n>",
        "ffd project capabilities --api <origin> --project <id>",
        "ffd project capability enable --api <origin> --project <id> --capability cms [--command-id <uuid>]",
        "ffd studio registration get --api <origin> --project <id> --environment-id <id>",
        "ffd studio registration set --api <origin> --project <id> --environment-id <id> --origin <origin> --path <path> [--expected-version <n>] [--command-id <uuid>]",
        "ffd link --api <origin> --project <id> --environment <key> [--output <path>] [--schema <path>]",
        "ffd schema pull",
        "ffd schema build [--check]",
        "ffd schema export",
        "ffd schema plan",
        "ffd schema push --acknowledge <change-id>...",
        "ffd schema check [--allow-metadata-only]",
        "ffd presentation get --collection <key>",
        "ffd presentation publish --collection <key> --file <presentation.json>",
        "ffd entry list --collection <key> --locale <tag>",
        "ffd entry get --collection <key> --entry <id> --locale <tag>",
        "ffd entry create --collection <key> --locale <tag> --name <name> [--mutations <file>]",
        "ffd entry update --collection <key> --entry <id> --locale <tag> --mutations <file>",
        "ffd entry publish --collection <key> --entry <id> --locale <tag>",
        "ffd entry unpublish --collection <key> --entry <id> --locale <tag>",
        "ffd editor",
        "ffd generate [--offline] [--force]",
      ],
    });
  }
  return Effect.fail(new Error("CLI_COMMAND_UNKNOWN"));
}

const presenter = Layer.succeed(DeviceAuthorizationPresenter, {
  present: (value: {
    readonly userCode: string;
    readonly verificationUri: string;
    readonly expiresInSeconds: number;
  }) =>
    Effect.sync(() => {
      process.stdout.write(
        `Open ${value.verificationUri} and enter code ${value.userCode}. Expires in ${value.expiresInSeconds} seconds.\n`,
      );
    }),
});

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    CredentialStoreLive,
    BrowserOpenerLive,
    presenter,
    CliConfigFileSystemLive,
    GeneratorFileSystemLive,
  ),
);

export async function runAuthenticatedCli(rawArguments: ReadonlyArray<string>) {
  let arguments_: ParsedArguments;
  try {
    arguments_ = parseArguments(rawArguments);
    validateFlags(arguments_);
  } catch {
    const json = rawArguments.includes("--json");
    const response = { ok: false, code: "CLI_FLAG_INVALID" };
    process.stderr.write(
      json
        ? `${JSON.stringify(response)}\n`
        : "The command failed (CLI_FLAG_INVALID). Re-run with valid options.\n",
    );
    process.exitCode = 1;
    await runtime.dispose();
    return;
  }
  const result = await runtime.runPromiseExit(commandEffect(arguments_));
  const json = booleanFlag(arguments_, "json");
  if (result._tag === "Success") {
    const value = result.value;
    process.stdout.write(
      json ? `${JSON.stringify(value)}\n` : `${JSON.stringify(value, null, 2)}\n`,
    );
    if ("accepted" in value && value.accepted === false) process.exitCode = 2;
  } else {
    const failure = Cause.failureOption(result.cause);
    const value = Option.getOrUndefined(failure);
    const taggedCode =
      typeof value === "object" && value !== null && typeof Reflect.get(value, "_tag") === "string"
        ? String(Reflect.get(value, "_tag"))
        : undefined;
    const messageCode =
      value instanceof Error ? /^([A-Z0-9_]+)/.exec(value.message)?.[1] : undefined;
    const rawControlPlaneHttpCode =
      taggedCode === "ControlPlaneHttpError" &&
      typeof value === "object" &&
      value !== null &&
      typeof Reflect.get(value, "code") === "string"
        ? String(Reflect.get(value, "code"))
        : undefined;
    const requiresControlPlaneRelogin =
      rawControlPlaneHttpCode === "CREDENTIAL_INVALID" &&
      !process.env["FFD_MANAGEMENT_TOKEN"]?.length &&
      (isControlPlaneCommand(arguments_.command.join(" ")) ||
        arguments_.command.join(" ") === "link");
    const controlPlaneHttpCode = requiresControlPlaneRelogin
      ? "CLI_RELOGIN_REQUIRED"
      : rawControlPlaneHttpCode;
    const stableTaggedCode: Readonly<Record<string, string>> = {
      ControlPlaneResponseTooLargeError: "CONTROL_PLANE_RESPONSE_TOO_LARGE",
      ControlPlaneTransportError: "CLI_CONTROL_PLANE_TRANSPORT",
      CliRetryJournalConflictError: "CLI_RETRY_JOURNAL_CONFLICT",
      CliRetryJournalError: "CLI_RETRY_JOURNAL_ERROR",
      CliSchemaBuildNotConfiguredError: "CLI_SCHEMA_BUILD_NOT_CONFIGURED",
      CliSchemaBuildOutputUnownedError: "CLI_SCHEMA_BUILD_OUTPUT_UNOWNED",
      CliSchemaBuildOutputModifiedError: "CLI_SCHEMA_BUILD_OUTPUT_MODIFIED",
      CliSchemaBuildStaleError: "CLI_SCHEMA_BUILD_STALE",
      CliSchemaBuildCommitError: "CLI_SCHEMA_BUILD_COMMIT_FAILED",
    };
    const response = {
      ok: false,
      code:
        controlPlaneHttpCode ??
        (taggedCode === undefined ? undefined : stableTaggedCode[taggedCode]) ??
        taggedCode ??
        messageCode ??
        "CLI_ERROR",
    };
    process.stderr.write(
      json
        ? `${JSON.stringify(response)}\n`
        : `The command failed (${response.code}). Re-run with valid options or credentials.\n`,
    );
    process.exitCode = 1;
  }
  await runtime.dispose();
}
