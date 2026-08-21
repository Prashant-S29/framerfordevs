// Enforces deterministic test placement and prevents production modules from importing test-only code.

import { access, readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";

const workspaceParents = ["apps", "packages", "tools"];
const ignoredDirectories = new Set([
  ".output",
  ".turbo",
  "build",
  "coverage",
  "data",
  "dist",
  "node_modules",
  "secrets",
]);
const sourceExtensions = [".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"];
const allowedTestCategories = new Set(["accessibility", "contract", "integration", "support"]);
const allowedTestRootFiles = new Set([".gitkeep", "setup.ts", "setup.tsx"]);
const importSpecifierPattern = /(?:from\s*|import\s*\(|require\s*\()\s*["']([^"']+)["']/gu;

/** Reports a structural violation and leaves process termination to the final aggregate check. */
function report(violations, message) {
  violations.push(message);
}

/** Returns whether one hand-authored module extension participates in import-boundary checks. */
function isSourceFile(path) {
  for (const extension of sourceExtensions) {
    if (path.endsWith(extension)) return true;
  }
  return false;
}

/** Returns whether a path exists without exposing filesystem errors beyond absence. */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Discovers package roots directly below the repository's declared workspace parent directories. */
async function findWorkspaceRoots() {
  const roots = [];
  for (const parent of workspaceParents) {
    const entries = await readdir(parent, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const root = join(parent, entry.name);
      if (await exists(join(root, "package.json"))) roots.push(root);
    }
  }
  return roots;
}

/** Recursively collects source modules while excluding generated, secret, capture, and dependency trees. */
async function collectSourceFiles(directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      await collectSourceFiles(join(directory, entry.name), files);
      continue;
    }
    const path = join(directory, entry.name);
    if (isSourceFile(path)) files.push(path);
  }
}

/** Rejects integration tests under source and imports from test-only modules in production source files. */
async function checkSourceBoundary(workspaceRoot, violations) {
  const sourceRoot = join(workspaceRoot, "src");
  if (!(await exists(sourceRoot))) return;
  const files = [];
  await collectSourceFiles(sourceRoot, files);
  for (const path of files) {
    const normalizedPath = path.split(sep).join("/");
    if (
      normalizedPath.endsWith(".integration.test.ts") ||
      normalizedPath.endsWith(".integration.test.tsx")
    ) {
      report(violations, `${normalizedPath}: integration tests belong under test/integration/`);
    }
    if (normalizedPath.includes(".test.")) continue;
    const source = await readFile(path, "utf8");
    importSpecifierPattern.lastIndex = 0;
    let match = importSpecifierPattern.exec(source);
    while (match !== null) {
      const specifier = match[1] ?? "";
      if (
        specifier.includes(".test.") ||
        specifier === "test" ||
        specifier.startsWith("test/") ||
        specifier.includes("/test/") ||
        specifier.startsWith("../test") ||
        specifier.startsWith("./test")
      ) {
        report(
          violations,
          `${normalizedPath}: production source imports test-only module ${specifier}`,
        );
      }
      match = importSpecifierPattern.exec(source);
    }
  }
}

/** Enforces the singular categorized workspace test directory and rejects unowned flat test files. */
async function checkTestDirectory(workspaceRoot, violations) {
  const pluralRoot = join(workspaceRoot, "tests");
  if (await exists(pluralRoot)) {
    report(violations, `${pluralRoot}: use the repository-standard singular test/ directory`);
  }
  const testRoot = join(workspaceRoot, "test");
  if (!(await exists(testRoot))) return;
  const entries = await readdir(testRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !allowedTestCategories.has(entry.name)) {
      report(violations, `${join(testRoot, entry.name)}: unknown test scope category`);
    }
    if (entry.isFile() && !allowedTestRootFiles.has(entry.name)) {
      report(violations, `${join(testRoot, entry.name)}: place the file in a scoped test category`);
    }
  }
}

/** Runs all repository structure checks and exits nonzero with stable path-only diagnostics on failure. */
async function main() {
  const violations = [];
  if (await exists("test"))
    report(violations, "test/: cross-workspace tests must be an owned tools/* workspace");
  if (await exists("tests"))
    report(violations, "tests/: cross-workspace tests must be an owned tools/* workspace");
  const workspaceRoots = await findWorkspaceRoots();
  for (const root of workspaceRoots) {
    await checkSourceBoundary(root, violations);
    await checkTestDirectory(root, violations);
  }
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
    return;
  }
  console.log(`Repository structure valid across ${workspaceRoots.length} workspaces.`);
}

await main();
