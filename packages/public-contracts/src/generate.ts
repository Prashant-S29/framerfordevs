// Writes or verifies only the source-controlled public registry's canonical artifact paths.

import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generatePublicArtifacts } from "./artifacts";
import { publicContractRegistry } from "./registry";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

if (mode !== "--write" && mode !== "--check") {
  throw new Error("Use --write or --check.");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeCanonical(path: string, bytes: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, "utf8");
}

for (const artifact of generatePublicArtifacts()) {
  const entry = publicContractRegistry[artifact.key];
  const outputPath = resolve(packageRoot, artifact.outputPath);
  const baselinePath = resolve(packageRoot, artifact.baselinePath);

  if (mode === "--write") {
    await writeCanonical(outputPath, artifact.bytes);
    if (!(await exists(baselinePath))) await writeCanonical(baselinePath, artifact.bytes);
    console.log(`${artifact.key} ${artifact.digest}`);
    continue;
  }

  const [output, baseline] = await Promise.all([
    readFile(outputPath, "utf8"),
    readFile(baselinePath, "utf8"),
  ]);
  if (output !== artifact.bytes) throw new Error(`${artifact.key}: generated artifact drift`);
  if (baseline !== artifact.bytes) throw new Error(`${artifact.key}: released v1 baseline drift`);
  if (entry.baselineDigest !== artifact.digest) {
    throw new Error(`${artifact.key}: registry baseline digest drift`);
  }
}
