// Loads one bounded, non-executable config while preventing ambiguous ancestor authority.

import { access, readFile } from "node:fs/promises";
import { dirname, join, parse, resolve, sep } from "node:path";

import { Context, Effect, Layer, Schema } from "effect";

import {
  CliConfigAmbiguousError,
  CliConfigInvalidError,
  CliConfigNotFoundError,
  CliFileSystemError,
} from "./errors";
import { CliConfig } from "./schema";

export const cliConfigFileName = "framerfordevs.config.json";
const maximumConfigBytes = 16 * 1_024;

/** Keeps generated-consumer ownership separate from code-authoring authority in config v2. */
export function generationLockFileName(config: CliConfig) {
  return config.schemaVersion === 2 ? "generated.lock.json" : "schema.lock.json";
}

export interface CliConfigFileSystemService {
  readonly exists: (path: string) => Effect.Effect<boolean, CliFileSystemError>;
  readonly readUtf8: (path: string) => Effect.Effect<string, CliFileSystemError>;
}

export class CliConfigFileSystem extends Context.Tag("CliConfigFileSystem")<
  CliConfigFileSystem,
  CliConfigFileSystemService
>() {}

export const CliConfigFileSystemLive = Layer.succeed(CliConfigFileSystem, {
  exists: (path) =>
    Effect.tryPromise({
      try: async () => {
        try {
          await access(path);
          return true;
        } catch (cause) {
          if (
            typeof cause === "object" &&
            cause !== null &&
            "code" in cause &&
            cause.code === "ENOENT"
          ) {
            return false;
          }
          throw cause;
        }
      },
      catch: (cause) => CliFileSystemError.make({ operation: "config.exists", cause }),
    }),
  readUtf8: (path) =>
    Effect.tryPromise({
      try: () => readFile(path, "utf8"),
      catch: (cause) => CliFileSystemError.make({ operation: "config.read", cause }),
    }),
});

export function ancestorConfigCandidates(startDirectory: string): ReadonlyArray<string> {
  const candidates: Array<string> = [];
  let current = resolve(startDirectory);
  const root = parse(current).root;
  while (true) {
    candidates.push(join(current, cliConfigFileName));
    if (current === root) return candidates;
    current = dirname(current);
  }
}

export const findCliConfig = Effect.fn("CliConfig.find")(function* (startDirectory: string) {
  const fileSystem = yield* CliConfigFileSystem;
  const matches: Array<string> = [];
  for (const candidate of ancestorConfigCandidates(startDirectory)) {
    if (yield* fileSystem.exists(candidate)) matches.push(candidate);
  }
  if (matches.length === 0) return yield* CliConfigNotFoundError.make();
  if (matches.length > 1) {
    return yield* CliConfigAmbiguousError.make({ count: matches.length });
  }
  const match = matches[0];
  if (match === undefined) return yield* CliConfigNotFoundError.make();
  return match;
});

export const loadCliConfig = Effect.fn("CliConfig.load")(function* (startDirectory: string) {
  const fileSystem = yield* CliConfigFileSystem;
  const path = yield* findCliConfig(startDirectory);
  const bytes = yield* fileSystem.readUtf8(path);
  if (Buffer.byteLength(bytes, "utf8") > maximumConfigBytes || bytes.startsWith("\uFEFF")) {
    return yield* CliConfigInvalidError.make();
  }
  const unknownConfig = yield* Effect.try({
    try: (): unknown => JSON.parse(bytes),
    catch: () => CliConfigInvalidError.make(),
  });
  const config = yield* Schema.decodeUnknown(CliConfig)(unknownConfig).pipe(
    Effect.mapError(() => CliConfigInvalidError.make()),
  );
  const directory = dirname(path);
  const resolveInsideProject = (relativePath: string) => {
    const absolutePath = resolve(directory, relativePath);
    return absolutePath === directory || absolutePath.startsWith(`${directory}${sep}`)
      ? absolutePath
      : null;
  };
  const outputDirectory = resolveInsideProject(config.output);
  const schemaPath = config.schemaVersion === 2 ? resolveInsideProject(config.schema) : null;
  const schemaBuildEntryPath =
    config.schemaVersion === 2 && config.schemaBuild !== undefined
      ? resolveInsideProject(config.schemaBuild.entry)
      : null;
  if (
    outputDirectory === null ||
    (config.schemaVersion === 2 && schemaPath === null) ||
    (config.schemaVersion === 2 &&
      config.schemaBuild !== undefined &&
      schemaBuildEntryPath === null)
  ) {
    return yield* CliConfigInvalidError.make();
  }
  return {
    path,
    directory,
    outputDirectory,
    schemaPath,
    schemaBuildEntryPath,
    config,
  };
});
