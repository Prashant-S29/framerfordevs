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
const studioOAuthHarnessPackage = "@framerfordevs/studio-oauth-harness";

function report(violations, message) {
  violations.push(message);
}

function isSourceFile(path) {
  for (const extension of sourceExtensions) {
    if (path.endsWith(extension)) return true;
  }
  return false;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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
        specifier === studioOAuthHarnessPackage ||
        specifier.startsWith(`${studioOAuthHarnessPackage}/`)
      ) {
        report(
          violations,
          `${normalizedPath}: production source imports private Studio OAuth harness`,
        );
      } else if (
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
      root: "apps/dashboard/src/components",
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
      root: "apps/dashboard/src/lib",
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

async function checkStudioOAuthHarnessBoundary(workspaceRoots, violations) {
  for (const root of workspaceRoots) {
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.name === studioOAuthHarnessPackage && manifest.private !== true) {
      report(violations, `${manifestPath}: Studio OAuth harness must remain private`);
    }
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      if (manifest[field]?.[studioOAuthHarnessPackage] !== undefined) {
        report(
          violations,
          `${manifestPath}: Studio OAuth harness is allowed only as a development dependency`,
        );
      }
    }
  }
}

const wildcardExportOwners = new Map([
  ["@framerfordevs/studio", new Set(["./artifact/*"])],
  ["@framerfordevs/ui", new Set(["./lib/*", "./components/*", "./hooks/*"])],
]);

async function checkExplicitExports(workspaceRoots, violations) {
  for (const root of workspaceRoots) {
    const manifestPath = join(root, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.exports === undefined || typeof manifest.exports === "string") continue;
    const allowed = wildcardExportOwners.get(manifest.name) ?? new Set();
    for (const key of Object.keys(manifest.exports)) {
      if (key.includes("*") && !allowed.has(key)) {
        report(violations, `${manifestPath}: replace wildcard export ${key} with named subpaths`);
      }
    }
  }
}

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
  await checkStudioOAuthHarnessBoundary(workspaceRoots, violations);
  await checkExplicitExports(workspaceRoots, violations);
  await checkDomainStructure(violations);
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation);
    process.exitCode = 1;
    return;
  }
  console.log(`Repository structure valid across ${workspaceRoots.length} workspaces.`);
}

await main();
