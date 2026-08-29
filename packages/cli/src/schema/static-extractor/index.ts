import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { Effect } from "effect";
import ts from "typescript";

import { canonicalJsonBytes, sha256 } from "../../canonical";
import { StaticSchemaExtractionError, type StaticSchemaExtractionErrorCode } from "../../errors";
import type { JsonValue } from "../../schema";
import { validateStaticProjectSchema } from "@framerfordevs/schema/validate";

export const staticSchemaExtractorLimits = {
  aggregateBytes: 1_048_576,
  declarations: 1_000,
  expressionDepth: 64,
  files: 32,
  fileBytes: 262_144,
  outputBytes: 1_048_576,
  stringLength: 100_000,
} as const;

export interface StaticSchemaExtractionInput {
  readonly projectRoot: string;
  readonly entry: string;
}

export interface ExtractedStaticProjectSchema {
  readonly project: JsonValue;
  readonly canonicalJson: string;
  readonly sha256: string;
  readonly files: ReadonlyArray<string>;
}

interface SourceLocation {
  readonly relativePath: string | null;
  readonly line: number | null;
  readonly column: number | null;
}

class ExtractorFailure extends Error {
  readonly code: StaticSchemaExtractionErrorCode;
  readonly location: SourceLocation;

  constructor(code: StaticSchemaExtractionErrorCode, location?: Partial<SourceLocation>) {
    super(code);
    this.name = "ExtractorFailure";
    this.code = code;
    this.location = {
      relativePath: location?.relativePath ?? null,
      line: location?.line ?? null,
      column: location?.column ?? null,
    };
  }
}

interface ImportBinding {
  readonly modulePath: string;
  readonly importedName: string;
}

interface ModuleRecord {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly sourceFile: ts.SourceFile;
  readonly declarations: ReadonlyMap<string, ts.Expression>;
  readonly exportedNames: ReadonlySet<string>;
  readonly imports: ReadonlyMap<string, ImportBinding>;
  readonly defaultExpression: ts.Expression | null;
}

interface GraphState {
  readonly projectRoot: string;
  readonly modules: Map<string, ModuleRecord>;
  readonly visiting: Set<string>;
  readonly loadedBytes: Map<string, number>;
  declarationCount: number;
  aggregateBytes: number;
}

function fail(code: StaticSchemaExtractionErrorCode, module?: ModuleRecord, node?: ts.Node): never {
  if (module === undefined || node === undefined) throw new ExtractorFailure(code);
  const position = module.sourceFile.getLineAndCharacterOfPosition(
    node.getStart(module.sourceFile),
  );
  throw new ExtractorFailure(code, {
    relativePath: module.relativePath,
    line: position.line + 1,
    column: position.character + 1,
  });
}

function isInsideRoot(projectRoot: string, candidate: string): boolean {
  const path = relative(projectRoot, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function relativeModulePath(projectRoot: string, absolutePath: string): string {
  return relative(projectRoot, absolutePath).split(sep).join("/");
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((item) => item.kind === kind) === true
  );
}

function propertyNameText(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function validateExpressionSyntax(
  module: ModuleRecord,
  expression: ts.Expression,
  depth: number,
): void {
  if (depth > staticSchemaExtractorLimits.expressionDepth)
    fail("depth_exceeded", module, expression);
  if (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword ||
    ts.isIdentifier(expression)
  ) {
    return;
  }
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) {
    validateExpressionSyntax(module, expression.expression, depth + 1);
    return;
  }
  if (ts.isAsExpression(expression)) {
    if (expression.type.getText(module.sourceFile) !== "const") {
      fail("expression_unsupported", module, expression);
    }
    validateExpressionSyntax(module, expression.expression, depth + 1);
    return;
  }
  if (ts.isPrefixUnaryExpression(expression)) {
    if (
      expression.operator !== ts.SyntaxKind.MinusToken ||
      !ts.isNumericLiteral(expression.operand)
    ) {
      fail("expression_unsupported", module, expression);
    }
    return;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    for (const element of expression.elements) {
      if (ts.isSpreadElement(element) || ts.isOmittedExpression(element)) {
        fail("expression_unsupported", module, element);
      }
      validateExpressionSyntax(module, element, depth + 1);
    }
    return;
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const keys = new Set<string>();
    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) fail("expression_unsupported", module, property);
      const key = propertyNameText(property.name);
      if (
        key === null ||
        keys.has(key) ||
        key === "__proto__" ||
        key === "prototype" ||
        key === "constructor"
      ) {
        fail("expression_unsupported", module, property.name);
      }
      keys.add(key);
      validateExpressionSyntax(module, property.initializer, depth + 1);
    }
    return;
  }
  fail("expression_unsupported", module, expression);
}

function normalizeImportSpecifier(specifier: string): string {
  if (specifier.includes("\\") || specifier.includes("\0") || specifier.includes("?")) {
    throw new ExtractorFailure("import_unsupported");
  }
  if (specifier.endsWith(".schema.ts")) return specifier;
  if (specifier.endsWith(".schema")) return `${specifier}.ts`;
  throw new ExtractorFailure("import_unsupported");
}

async function readModuleSource(state: GraphState, absolutePath: string): Promise<string> {
  if (!isInsideRoot(state.projectRoot, absolutePath)) throw new ExtractorFailure("path_escape");
  let canonicalPath: string;
  try {
    canonicalPath = await realpath(absolutePath);
  } catch {
    throw new ExtractorFailure("file_invalid");
  }
  if (canonicalPath !== absolutePath) throw new ExtractorFailure("file_symlink");
  if (!isInsideRoot(state.projectRoot, canonicalPath)) throw new ExtractorFailure("path_escape");
  let stats;
  try {
    stats = await lstat(canonicalPath);
  } catch {
    throw new ExtractorFailure("file_invalid");
  }
  if (!stats.isFile()) throw new ExtractorFailure("file_invalid");
  if (stats.size > staticSchemaExtractorLimits.fileBytes) {
    throw new ExtractorFailure("file_too_large");
  }
  let source: string;
  try {
    source = await readFile(canonicalPath, "utf8");
  } catch {
    throw new ExtractorFailure("file_invalid");
  }
  const bytes = Buffer.byteLength(source);
  state.aggregateBytes += bytes;
  state.loadedBytes.set(canonicalPath, bytes);
  if (state.aggregateBytes > staticSchemaExtractorLimits.aggregateBytes) {
    throw new ExtractorFailure("graph_too_large");
  }
  if (source.includes("\0")) throw new ExtractorFailure("syntax_unsupported");
  return source;
}

async function loadModule(
  state: GraphState,
  absolutePath: string,
  entry: boolean,
): Promise<ModuleRecord> {
  const existing = state.modules.get(absolutePath);
  if (existing !== undefined) return existing;
  if (state.visiting.has(absolutePath)) throw new ExtractorFailure("graph_cycle");
  if (state.modules.size + state.visiting.size >= staticSchemaExtractorLimits.files) {
    throw new ExtractorFailure("file_count_exceeded");
  }
  state.visiting.add(absolutePath);
  try {
    const source = await readModuleSource(state, absolutePath);
    const sourceFile = ts.createSourceFile(
      absolutePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const relativePath = relativeModulePath(state.projectRoot, absolutePath);
    if ((sourceFile.flags & ts.NodeFlags.ThisNodeOrAnySubNodesHasError) !== 0) {
      throw new ExtractorFailure("syntax_unsupported", { relativePath });
    }
    const declarations = new Map<string, ts.Expression>();
    const exportedNames = new Set<string>();
    const imports = new Map<string, ImportBinding>();
    let defaultExpression: ts.Expression | null = null;
    const module: ModuleRecord = {
      absolutePath,
      relativePath,
      sourceFile,
      declarations,
      exportedNames,
      imports,
      defaultExpression,
    };

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        if (!ts.isStringLiteral(statement.moduleSpecifier)) {
          fail("import_unsupported", module, statement);
        }
        const specifier = statement.moduleSpecifier.text;
        if (specifier === "@framerfordevs/schema") {
          if (
            statement.importClause?.isTypeOnly !== true ||
            statement.importClause.name !== undefined ||
            statement.importClause.namedBindings === undefined ||
            !ts.isNamedImports(statement.importClause.namedBindings)
          ) {
            fail("import_unsupported", module, statement);
          }
          continue;
        }
        if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
          fail("import_unsupported", module, statement);
        }
        const clause = statement.importClause;
        if (
          clause === undefined ||
          clause.isTypeOnly ||
          clause.name !== undefined ||
          clause.namedBindings === undefined ||
          !ts.isNamedImports(clause.namedBindings)
        ) {
          fail("import_unsupported", module, statement);
        }
        let normalizedSpecifier: string;
        try {
          normalizedSpecifier = normalizeImportSpecifier(specifier);
        } catch {
          fail("import_unsupported", module, statement.moduleSpecifier);
        }
        const targetPath = resolve(dirname(absolutePath), normalizedSpecifier);
        if (!isInsideRoot(state.projectRoot, targetPath)) fail("path_escape", module, statement);
        const target = await loadModule(state, targetPath, false);
        for (const element of clause.namedBindings.elements) {
          if (element.isTypeOnly) fail("import_unsupported", module, element);
          const localName = element.name.text;
          const importedName = element.propertyName?.text ?? localName;
          if (declarations.has(localName) || imports.has(localName)) {
            fail("declaration_invalid", module, element);
          }
          imports.set(localName, { modulePath: target.absolutePath, importedName });
        }
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
          fail("declaration_invalid", module, statement);
        }
        const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
        if (hasModifier(statement, ts.SyntaxKind.DeclareKeyword)) {
          fail("declaration_invalid", module, statement);
        }
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) {
            fail("declaration_invalid", module, declaration);
          }
          const name = declaration.name.text;
          if (declarations.has(name) || imports.has(name)) {
            fail("declaration_invalid", module, declaration.name);
          }
          state.declarationCount += 1;
          if (state.declarationCount > staticSchemaExtractorLimits.declarations) {
            fail("declaration_invalid", module, declaration);
          }
          validateExpressionSyntax(module, declaration.initializer, 1);
          declarations.set(name, declaration.initializer);
          if (exported) exportedNames.add(name);
        }
        continue;
      }
      if (ts.isExportAssignment(statement)) {
        if (statement.isExportEquals || !entry || defaultExpression !== null) {
          fail("export_invalid", module, statement);
        }
        validateExpressionSyntax(module, statement.expression, 1);
        defaultExpression = statement.expression;
        continue;
      }
      fail("syntax_unsupported", module, statement);
    }

    if (entry && defaultExpression === null) fail("export_invalid", module, sourceFile);
    if (!entry && defaultExpression !== null) fail("export_invalid", module, sourceFile);
    const complete: ModuleRecord = { ...module, defaultExpression };
    state.modules.set(absolutePath, complete);
    return complete;
  } finally {
    state.visiting.delete(absolutePath);
  }
}

function evaluateIdentifier(
  state: GraphState,
  module: ModuleRecord,
  name: string,
  evaluating: Set<string>,
  depth: number,
): JsonValue {
  const declaration = module.declarations.get(name);
  if (declaration !== undefined) {
    const identity = `${module.absolutePath}\0${name}`;
    if (evaluating.has(identity)) fail("evaluation_cycle", module, declaration);
    evaluating.add(identity);
    try {
      return evaluateExpression(state, module, declaration, evaluating, depth + 1);
    } finally {
      evaluating.delete(identity);
    }
  }
  const binding = module.imports.get(name);
  if (binding === undefined) fail("identifier_unknown", module, module.sourceFile);
  const target = state.modules.get(binding.modulePath);
  if (target === undefined || !target.exportedNames.has(binding.importedName)) {
    fail("identifier_unknown", module, module.sourceFile);
  }
  return evaluateIdentifier(state, target, binding.importedName, evaluating, depth + 1);
}

function evaluateExpression(
  state: GraphState,
  module: ModuleRecord,
  expression: ts.Expression,
  evaluating: Set<string>,
  depth: number,
): JsonValue {
  if (depth > staticSchemaExtractorLimits.expressionDepth)
    fail("depth_exceeded", module, expression);
  if (ts.isStringLiteral(expression)) {
    if (expression.text.length > staticSchemaExtractorLimits.stringLength) {
      fail("output_too_large", module, expression);
    }
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) {
    const value = Number(expression.text);
    if (!Number.isFinite(value)) fail("expression_unsupported", module, expression);
    return value;
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(expression)) {
    return evaluateIdentifier(state, module, expression.text, evaluating, depth + 1);
  }
  if (ts.isParenthesizedExpression(expression) || ts.isSatisfiesExpression(expression)) {
    return evaluateExpression(state, module, expression.expression, evaluating, depth + 1);
  }
  if (ts.isAsExpression(expression)) {
    return evaluateExpression(state, module, expression.expression, evaluating, depth + 1);
  }
  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    const value = -Number(expression.operand.text);
    if (!Number.isFinite(value)) fail("expression_unsupported", module, expression);
    return value;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) =>
      evaluateExpression(state, module, element, evaluating, depth + 1),
    );
  }
  if (ts.isObjectLiteralExpression(expression)) {
    const entries: Array<readonly [string, JsonValue]> = [];
    for (const item of expression.properties) {
      if (!ts.isPropertyAssignment(item)) fail("expression_unsupported", module, item);
      const key = propertyNameText(item.name);
      if (key === null) fail("expression_unsupported", module, item.name);
      entries.push([
        key,
        evaluateExpression(state, module, item.initializer, evaluating, depth + 1),
      ]);
    }
    return Object.fromEntries(entries);
  }
  fail("expression_unsupported", module, expression);
}

async function extract(input: StaticSchemaExtractionInput): Promise<ExtractedStaticProjectSchema> {
  if (
    input.projectRoot.length === 0 ||
    input.projectRoot.includes("\0") ||
    input.entry.length === 0 ||
    input.entry.length > 240 ||
    input.entry.includes("\0") ||
    input.entry.includes("\\") ||
    isAbsolute(input.entry) ||
    !input.entry.endsWith(".schema.ts")
  ) {
    throw new ExtractorFailure("entry_invalid");
  }
  let projectRoot: string;
  try {
    projectRoot = await realpath(input.projectRoot);
  } catch {
    throw new ExtractorFailure("root_invalid");
  }
  let rootStats;
  try {
    rootStats = await lstat(projectRoot);
  } catch {
    throw new ExtractorFailure("root_invalid");
  }
  if (!rootStats.isDirectory()) throw new ExtractorFailure("root_invalid");
  const entryPath = resolve(projectRoot, input.entry);
  if (!isInsideRoot(projectRoot, entryPath)) throw new ExtractorFailure("path_escape");
  const state: GraphState = {
    projectRoot,
    modules: new Map(),
    visiting: new Set(),
    loadedBytes: new Map(),
    declarationCount: 0,
    aggregateBytes: 0,
  };
  const entryModule = await loadModule(state, entryPath, true);
  if (entryModule.defaultExpression === null) throw new ExtractorFailure("export_invalid");
  const project = evaluateExpression(
    state,
    entryModule,
    entryModule.defaultExpression,
    new Set(),
    1,
  );
  const validation = validateStaticProjectSchema(project);
  if (!validation.valid) {
    throw new ExtractorFailure("schema_invalid", { relativePath: entryModule.relativePath });
  }
  const canonicalJson = canonicalJsonBytes(project);
  if (Buffer.byteLength(canonicalJson) > staticSchemaExtractorLimits.outputBytes) {
    throw new ExtractorFailure("output_too_large", { relativePath: entryModule.relativePath });
  }
  return {
    project,
    canonicalJson,
    sha256: sha256(canonicalJson),
    files: [...state.modules.values()].map((item) => item.relativePath).sort(),
  };
}

function toPublicError(error: unknown): StaticSchemaExtractionError {
  if (error instanceof ExtractorFailure) {
    return StaticSchemaExtractionError.make({
      code: error.code,
      relativePath: error.location.relativePath,
      line: error.location.line,
      column: error.location.column,
    });
  }
  return StaticSchemaExtractionError.make({
    code: "file_invalid",
    relativePath: null,
    line: null,
    column: null,
  });
}

export const runStaticSchemaExtractorInWorker = Effect.fn("cli.schema.extract.static.worker")(
  (input: StaticSchemaExtractionInput) =>
    Effect.tryPromise({
      try: () => extract(input),
      catch: toPublicError,
    }),
);
