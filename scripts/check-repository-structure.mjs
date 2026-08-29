// Enforces deterministic test placement, domain ownership, and production/test import boundaries.

import { access, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, sep } from "node:path";

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

/** Requires implementation/test families to live as index modules in a dedicated owner directory. */
async function checkModulePairStructure(workspaceRoot, violations) {
  const files = [];
  await collectSourceFiles(workspaceRoot, files);
  const implementations = new Set(
    files
      .filter((path) => !path.includes(".test."))
      .map((path) => path.replace(/\.(?:cjs|js|jsx|mjs|ts|tsx)$/u, "")),
  );
  for (const path of files) {
    if (!path.includes(".test.")) continue;
    const implementation = path.replace(/\.test\.(?:cjs|js|jsx|mjs|ts|tsx)$/u, "");
    if (!implementations.has(implementation)) continue;
    const moduleName = implementation.slice(implementation.lastIndexOf(sep) + 1);
    if (moduleName !== "index") {
      report(
        violations,
        `${path}: colocated implementation/test families belong in module/index.*`,
      );
    }
  }
}

/** Requires repeated sibling filename prefixes to be expressed as an owner directory. */
async function checkRepeatedModuleFamilies(root, violations) {
  if (!(await exists(root))) return;
  const files = [];
  await collectSourceFiles(root, files);
  const filesByDirectory = Map.groupBy(files, dirname);
  for (const [directory, siblingFiles] of filesByDirectory) {
    const stemsByPrefix = new Map();
    for (const path of siblingFiles) {
      const stem = basename(path)
        .replace(/\.(?:cjs|js|jsx|mjs|ts|tsx)$/u, "")
        .replace(/\.(?:spec|test)$/u, "");
      if (stem === "index" || stem === "setup" || stem.startsWith("$") || stem.startsWith("_")) {
        continue;
      }
      const prefix = stem.split(/[.-]/u, 1)[0] ?? "";
      if (prefix.length < 3) continue;
      const stems = stemsByPrefix.get(prefix) ?? new Set();
      stems.add(stem);
      stemsByPrefix.set(prefix, stems);
    }
    for (const [prefix, stems] of stemsByPrefix) {
      if (stems.size < 2) continue;
      report(
        violations,
        `${directory}: repeated ${prefix}-prefixed modules belong in a ${prefix}/ owner directory`,
      );
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

/** Enforces compact learning entries, ordered progress milestones, and complete selective decision routing. */
async function checkKnowledgeBase(violations) {
  const learnings = await readFile("knowledge_base/learnings.md", "utf8");
  const learningEntries = learnings.split("\n---\n").slice(1);
  for (const entry of learningEntries) {
    const title = /^## .+$/mu.exec(entry)?.[0] ?? "untitled learning";
    const incorrectCount = (entry.match(/^\*\*Incorrect assumption or decision:\*\*/gmu) ?? [])
      .length;
    const learningCount = (entry.match(/^\*\*Learning:\*\*/gmu) ?? []).length;
    const statusCount = (entry.match(/^\*\*Status:\*\*/gmu) ?? []).length;
    const retiredFields = /^\*\*(?:Context|Cost or risk|Prevention):\*\*/mu.test(entry);
    if (incorrectCount !== 1 || learningCount !== 1 || statusCount > 1 || retiredFields) {
      report(violations, `knowledge_base/learnings.md: invalid concise fields in ${title}`);
    }
  }

  const progress = await readFile("knowledge_base/progress.md", "utf8");
  const trackerSection = progress.split("## Milestone tracker", 2)[1]?.split("\n## ", 1)[0] ?? "";
  const trackerNumbers = [...trackerSection.matchAll(/^\|\s+(\d+)\s+\|/gmu)].map((match) =>
    Number(match[1]),
  );
  if (!trackerNumbers.every((number, index) => number === index)) {
    report(
      violations,
      "knowledge_base/progress.md: milestone tracker must be contiguous and ordered",
    );
  }
  const milestoneNumbers = [...progress.matchAll(/^### Milestone (\d+)\b/gmu)].map((match) =>
    Number(match[1]),
  );
  if (
    milestoneNumbers.length !== trackerNumbers.length ||
    !milestoneNumbers.every((number, index) => number === trackerNumbers[index])
  ) {
    report(violations, "knowledge_base/progress.md: milestone summaries must match tracker order");
  }

  const decisionEntries = await readdir("knowledge_base/decisions", { withFileTypes: true });
  const decisionIndex = await readFile("knowledge_base/decisions/index.md", "utf8");
  for (const entry of decisionEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "index.md") continue;
    if (!decisionIndex.includes(`(${entry.name})`)) {
      report(violations, `knowledge_base/decisions/index.md: missing ${entry.name}`);
    }
  }
}

/** Keeps established domain clusters out of flat source directories as those areas grow. */
async function checkDomainStructure(violations) {
  const rules = [
    {
      root: "packages/api/src/lib",
      domains: ["authoring", "delivery", "entry", "field", "preview", "publication", "webhook"],
    },
    {
      root: "packages/api/src/services",
      domains: [
        "authoring",
        "credential",
        "delivery",
        "entry",
        "field",
        "locale",
        "preview",
        "publication",
        "rate-limit",
        "schema",
        "tooling",
        "webhook",
      ],
    },
    {
      root: "packages/api/src/operations",
      domains: ["authoring", "delivery", "preview", "webhook"],
    },
    {
      root: "packages/api/src/scripts",
      domains: ["delivery", "preview", "webhook"],
    },
    {
      root: "packages/cli/src",
      domains: [
        "authoring-schema",
        "content",
        "editor",
        "experimental-schema",
        "schema-authoring",
        "schema-build",
        "static-schema",
      ],
      allowed: new Set(["experimental-schema-build.ts"]),
    },
    {
      root: "apps/web/src/components",
      domains: [
        "archive-project",
        "collection-entries",
        "create-project",
        "edit-project",
        "entry",
        "generated-form",
        "locale-tabs",
        "portable-text-field",
        "project",
      ],
    },
    {
      root: "apps/web/src/lib",
      domains: [
        "auth-client",
        "auth-navigation",
        "cms-validation",
        "entry",
        "invitation-link",
        "platform-validation",
      ],
    },
  ];
  for (const rule of rules) {
    const entries = await readdir(rule.root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || rule.allowed?.has(entry.name)) continue;
      const domain = rule.domains.find(
        (candidate) =>
          entry.name === `${candidate}.ts` ||
          entry.name.startsWith(`${candidate}.`) ||
          entry.name.startsWith(`${candidate}-`),
      );
      if (domain !== undefined) {
        report(violations, `${join(rule.root, entry.name)}: place ${domain} modules in a domain/`);
      }
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
    await checkModulePairStructure(root, violations);
    await checkRepeatedModuleFamilies(root, violations);
    await checkTestDirectory(root, violations);
  }
  await checkRepeatedModuleFamilies("scripts", violations);
  await checkKnowledgeBase(violations);
  await checkDomainStructure(violations);
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
    return;
  }
  console.log(`Repository structure valid across ${workspaceRoots.length} workspaces.`);
}

await main();
