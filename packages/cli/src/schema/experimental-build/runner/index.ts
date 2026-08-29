import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import quickJsVariant from "@jitl/quickjs-wasmfile-release-sync";
import { Effect } from "effect";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import ts from "typescript";

import { canonicalJsonBytes, sha256, toJsonValue } from "../../../canonical";
import {
  ExperimentalSchemaBuildError,
  type ExperimentalSchemaBuildErrorCode,
} from "../../../errors";
import type { JsonValue } from "../../../schema";
import { validateStaticProjectSchema } from "@framerfordevs/schema/validate";

export const experimentalSchemaBuildLimits = {
  aggregateBytes: 1_048_576,
  executionMillis: 2_000,
  files: 32,
  fileBytes: 262_144,
  guestMemoryBytes: 67_108_864,
  guestStackBytes: 1_048_576,
  outputBytes: 1_048_576,
  programBytes: 4_194_304,
} as const;

export interface ExperimentalSchemaBuildInput {
  readonly projectRoot: string;
  readonly entry: string;
  readonly experimental: boolean;
}

export interface ExperimentalSchemaBuildInputDigest {
  readonly path: string;
  readonly sha256: string;
}

export interface ExperimentalSchemaBuildOutput {
  readonly project: JsonValue;
  readonly canonicalJson: string;
  readonly tierOneSource: string;
  readonly sha256: string;
  readonly files: ReadonlyArray<string>;
  readonly inputs: ReadonlyArray<ExperimentalSchemaBuildInputDigest>;
  readonly runtime: "quickjs-emscripten-0.32.0-experimental";
  readonly memoryLimitHard: false;
}

class BuildFailure extends Error {
  readonly code: ExperimentalSchemaBuildErrorCode;
  readonly relativePath: string | null;

  constructor(code: ExperimentalSchemaBuildErrorCode, relativePath: string | null = null) {
    super(code);
    this.name = "BuildFailure";
    this.code = code;
    this.relativePath = relativePath;
  }
}

interface BuildModule {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly source: string;
  readonly resolutions: ReadonlyMap<string, string>;
  readonly transpiled: string;
}

interface GraphState {
  readonly projectRoot: string;
  readonly modules: Map<string, BuildModule>;
  readonly visiting: Set<string>;
  aggregateBytes: number;
}

const COMPOSE_MODULE_ID = "@framerfordevs/schema/compose";

function isInsideRoot(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function moduleId(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function validateSyntax(sourceFile: ts.SourceFile, relativePath: string): void {
  if ((sourceFile.flags & ts.NodeFlags.ThisNodeOrAnySubNodesHasError) !== 0) {
    throw new BuildFailure("syntax_unsupported", relativePath);
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportEqualsDeclaration(node) ||
      ts.isAwaitExpression(node) ||
      ts.isMetaProperty(node) ||
      (ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require")))
    ) {
      throw new BuildFailure("syntax_unsupported", relativePath);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

function normalizedLocalSpecifier(specifier: string): string {
  if (
    (!specifier.startsWith("./") && !specifier.startsWith("../")) ||
    specifier.includes("\\") ||
    specifier.includes("\0") ||
    specifier.includes("?") ||
    specifier.includes("#")
  ) {
    throw new BuildFailure("import_unsupported");
  }
  if (specifier.endsWith(".ts")) return specifier;
  return `${specifier}.ts`;
}

async function readSource(state: GraphState, absolutePath: string): Promise<string> {
  if (!isInsideRoot(state.projectRoot, absolutePath)) throw new BuildFailure("path_escape");
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(absolutePath);
  } catch {
    throw new BuildFailure("file_invalid");
  }
  if (canonicalPath !== absolutePath) throw new BuildFailure("file_symlink");
  if (!isInsideRoot(state.projectRoot, canonicalPath)) throw new BuildFailure("path_escape");
  let stats;
  try {
    stats = await lstat(canonicalPath);
  } catch {
    throw new BuildFailure("file_invalid");
  }
  if (!stats.isFile()) throw new BuildFailure("file_invalid");
  if (stats.size > experimentalSchemaBuildLimits.fileBytes) {
    throw new BuildFailure("file_too_large");
  }
  let source: string;
  try {
    source = await readFile(canonicalPath, "utf8");
  } catch {
    throw new BuildFailure("file_invalid");
  }
  state.aggregateBytes += Buffer.byteLength(source);
  if (state.aggregateBytes > experimentalSchemaBuildLimits.aggregateBytes) {
    throw new BuildFailure("graph_too_large");
  }
  if (source.includes("\0")) throw new BuildFailure("syntax_unsupported");
  return source;
}

async function loadModule(state: GraphState, absolutePath: string): Promise<BuildModule> {
  const existing = state.modules.get(absolutePath);
  if (existing !== undefined) return existing;
  if (state.visiting.has(absolutePath)) throw new BuildFailure("graph_cycle");
  if (state.modules.size + state.visiting.size >= experimentalSchemaBuildLimits.files) {
    throw new BuildFailure("file_count_exceeded");
  }
  state.visiting.add(absolutePath);
  try {
    const source = await readSource(state, absolutePath);
    const relativePath = moduleId(state.projectRoot, absolutePath);
    const sourceFile = ts.createSourceFile(
      absolutePath,
      source,
      ts.ScriptTarget.ES2023,
      true,
      ts.ScriptKind.TS,
    );
    validateSyntax(sourceFile, relativePath);
    const resolutions = new Map<string, string>();
    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
        throw new BuildFailure("import_unsupported", relativePath);
      }
      if (!ts.isImportDeclaration(statement)) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        throw new BuildFailure("import_unsupported", relativePath);
      }
      const specifier = statement.moduleSpecifier.text;
      if (specifier === COMPOSE_MODULE_ID) {
        if (statement.importClause?.isTypeOnly === true) {
          throw new BuildFailure("import_unsupported", relativePath);
        }
        resolutions.set(specifier, COMPOSE_MODULE_ID);
        continue;
      }
      if (statement.importClause?.isTypeOnly === true) {
        if (specifier === "@framerfordevs/schema") continue;
        throw new BuildFailure("import_unsupported", relativePath);
      }
      let localSpecifier: string;
      try {
        localSpecifier = normalizedLocalSpecifier(specifier);
      } catch {
        throw new BuildFailure("import_unsupported", relativePath);
      }
      const targetPath = resolve(dirname(absolutePath), localSpecifier);
      if (!isInsideRoot(state.projectRoot, targetPath)) {
        throw new BuildFailure("path_escape", relativePath);
      }
      const target = await loadModule(state, targetPath);
      resolutions.set(specifier, target.relativePath);
    }
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.CommonJS,
        isolatedModules: true,
        removeComments: true,
        sourceMap: false,
        inlineSourceMap: false,
        inlineSources: false,
      },
      fileName: relativePath,
      reportDiagnostics: true,
    });
    if (transpiled.diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error)) {
      throw new BuildFailure("transpile_failed", relativePath);
    }
    const module: BuildModule = {
      absolutePath,
      relativePath,
      source,
      resolutions,
      transpiled: transpiled.outputText,
    };
    state.modules.set(absolutePath, module);
    return module;
  } finally {
    state.visiting.delete(absolutePath);
  }
}

function buildGuestProgram(modules: ReadonlyArray<BuildModule>, entryId: string): string {
  const factories = modules
    .map(
      (item) =>
        `__factories[${JSON.stringify(item.relativePath)}] = function(module, exports, require) {\n${item.transpiled}\n};`,
    )
    .join("\n");
  const resolutions = modules
    .map(
      (item) =>
        `__resolutions[${JSON.stringify(item.relativePath)}] = ${JSON.stringify(Object.fromEntries(item.resolutions))};`,
    )
    .join("\n");
  return `
(() => {
  "use strict";
  const __factories = Object.create(null);
  const __resolutions = Object.create(null);
  const __cache = Object.create(null);
  ${factories}
  __factories[${JSON.stringify(COMPOSE_MODULE_ID)}] = function(module, exports) {
    const identity = (value) => value;
    Object.defineProperties(exports, {
      defineField: { value: identity, enumerable: true },
      defineCollection: { value: identity, enumerable: true },
      defineSchema: { value: identity, enumerable: true },
    });
    Object.freeze(exports);
  };
  ${resolutions}
  function __load(id) {
    if (Object.prototype.hasOwnProperty.call(__cache, id)) return __cache[id].exports;
    const factory = __factories[id];
    if (typeof factory !== "function") throw new Error("MODULE_NOT_ALLOWED");
    const module = { exports: {} };
    __cache[id] = module;
    const require = (specifier) => {
      if (id === ${JSON.stringify(COMPOSE_MODULE_ID)}) throw new Error("MODULE_NOT_ALLOWED");
      const target = __resolutions[id] && __resolutions[id][specifier];
      if (typeof target !== "string") throw new Error("MODULE_NOT_ALLOWED");
      return __load(target);
    };
    factory(module, module.exports, require);
    return module.exports;
  }
  const entry = __load(${JSON.stringify(entryId)});
  if (!Object.prototype.hasOwnProperty.call(entry, "default")) throw new Error("DEFAULT_EXPORT_REQUIRED");
  return JSON.stringify(entry.default);
})()
`;
}

async function executeGuest(program: string): Promise<string> {
  let interrupted = false;
  let runtime;
  let context;
  try {
    const quickJs = await newQuickJSWASMModuleFromVariant(quickJsVariant);
    runtime = quickJs.newRuntime();
    runtime.setMemoryLimit(experimentalSchemaBuildLimits.guestMemoryBytes);
    runtime.setMaxStackSize(experimentalSchemaBuildLimits.guestStackBytes);
    const deadline = performance.now() + experimentalSchemaBuildLimits.executionMillis;
    runtime.setInterruptHandler(() => {
      interrupted = performance.now() > deadline;
      return interrupted;
    });
    context = runtime.newContext();
    const hardening = context.evalCode(`
      delete globalThis.Date;
      delete Math.random;
      delete globalThis.eval;
      delete globalThis.Function;
      Object.freeze(Math);
    `);
    if (hardening.error) {
      hardening.error.dispose();
      throw new BuildFailure("guest_initialization_failed");
    }
    hardening.value.dispose();
    const result = context.evalCode(program, "ffd-experimental-schema-build.js");
    if (result.error) {
      result.error.dispose();
      throw new BuildFailure(interrupted ? "guest_interrupted" : "guest_execution_failed");
    }
    const dumped = context.dump(result.value);
    result.value.dispose();
    if (typeof dumped !== "string") throw new BuildFailure("guest_output_invalid");
    return dumped;
  } catch (error) {
    if (error instanceof BuildFailure) throw error;
    throw new BuildFailure("guest_initialization_failed");
  } finally {
    context?.dispose();
    runtime?.dispose();
  }
}

async function build(input: ExperimentalSchemaBuildInput): Promise<ExperimentalSchemaBuildOutput> {
  if (!input.experimental) throw new BuildFailure("experimental_opt_in_required");
  if (
    input.projectRoot.length === 0 ||
    input.projectRoot.includes("\0") ||
    input.entry.length === 0 ||
    input.entry.length > 240 ||
    input.entry.includes("\0") ||
    input.entry.includes("\\") ||
    isAbsolute(input.entry) ||
    !input.entry.endsWith(".ts")
  ) {
    throw new BuildFailure("entry_invalid");
  }
  let projectRoot: string;
  try {
    projectRoot = await realpath(input.projectRoot);
  } catch {
    throw new BuildFailure("entry_invalid");
  }
  const entryPath = resolve(projectRoot, input.entry);
  if (!isInsideRoot(projectRoot, entryPath)) throw new BuildFailure("path_escape");
  const state: GraphState = {
    projectRoot,
    modules: new Map(),
    visiting: new Set(),
    aggregateBytes: 0,
  };
  const entry = await loadModule(state, entryPath);
  const program = buildGuestProgram([...state.modules.values()], entry.relativePath);
  if (Buffer.byteLength(program) > experimentalSchemaBuildLimits.programBytes) {
    throw new BuildFailure("graph_too_large", entry.relativePath);
  }
  const json = await executeGuest(program);
  if (Buffer.byteLength(json) > experimentalSchemaBuildLimits.outputBytes) {
    throw new BuildFailure("output_too_large", entry.relativePath);
  }
  let project: unknown;
  try {
    project = JSON.parse(json);
  } catch {
    throw new BuildFailure("guest_output_invalid", entry.relativePath);
  }
  const validation = validateStaticProjectSchema(project);
  if (!validation.valid) throw new BuildFailure("schema_invalid", entry.relativePath);
  const jsonProject = toJsonValue(project);
  const canonicalJson = canonicalJsonBytes(jsonProject);
  const tierOneSource = `import type { ProjectSchema } from "@framerfordevs/schema";\n\nexport default ${canonicalJson.trimEnd()} as const satisfies ProjectSchema;\n`;
  return {
    project: jsonProject,
    canonicalJson,
    tierOneSource,
    sha256: sha256(canonicalJson),
    files: [...state.modules.values()].map((item) => item.relativePath).sort(),
    inputs: [...state.modules.values()]
      .map((item) => ({ path: item.relativePath, sha256: sha256(item.source) }))
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)),
    runtime: "quickjs-emscripten-0.32.0-experimental",
    memoryLimitHard: false,
  };
}

function toPublicError(error: unknown): ExperimentalSchemaBuildError {
  if (error instanceof BuildFailure) {
    return ExperimentalSchemaBuildError.make({
      code: error.code,
      relativePath: error.relativePath,
    });
  }
  return ExperimentalSchemaBuildError.make({
    code: "worker_failed",
    relativePath: null,
  });
}

export const runExperimentalSchemaBuildInWorker = Effect.fn("cli.schema.build.experimental.worker")(
  (input: ExperimentalSchemaBuildInput) =>
    Effect.tryPromise({
      try: () => build(input),
      catch: toPublicError,
    }),
);
