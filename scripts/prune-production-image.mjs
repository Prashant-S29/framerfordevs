import { lstat, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "/app");
const removedDirectoryNames = new Set([
  "__tests__",
  "coverage",
  "playwright-report",
  "test",
  "test-results",
  "tests",
]);
const removedFilePattern = /(?:^|\.)((?:test|spec))\.[cm]?[jt]sx?(?:\.map)?$/u;
const environmentFilePattern = /^\.env(?:\..+)?$/u;

async function prune(path) {
  const name = basename(path);
  if (
    removedDirectoryNames.has(name) ||
    name === "studio-oauth-harness" ||
    name.includes("studio-oauth-harness@")
  ) {
    await rm(path, { force: true, recursive: true });
    return;
  }

  const stat = await lstat(path);
  if (stat.isSymbolicLink()) {
    const target = await readlink(path);
    if (path.includes("studio-oauth-harness") || target.includes("studio-oauth-harness")) {
      await rm(path, { force: true });
    }
    return;
  }
  if (stat.isDirectory()) {
    for (const entry of await readdir(path)) await prune(join(path, entry));
    return;
  }
  if (name.endsWith(".map") || removedFilePattern.test(name) || environmentFilePattern.test(name)) {
    await rm(path, { force: true });
  }
}

const manifestPath = join(root, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
delete manifest.devDependencies;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

await prune(root);
for (const path of [
  join(root, "pnpm-lock.yaml"),
  join(root, "pnpm-workspace.yaml"),
  join(root, "node_modules/.pnpm/lock.yaml"),
  join(root, "node_modules/.pnpm-workspace-state-v1.json"),
]) {
  await rm(path, { force: true, recursive: true });
}
for (const directory of ["load", "scripts", "src", "tools"]) {
  await rm(join(root, directory), { force: true, recursive: true });
}
