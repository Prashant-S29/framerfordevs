import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generatePublicArtifacts } from "./artifacts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

if (mode !== "--write" && mode !== "--check") {
  throw new Error("Use --write or --check.");
}

for (const artifact of generatePublicArtifacts()) {
  const outputPath = resolve(packageRoot, artifact.outputPath);

  if (mode === "--write") {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, artifact.bytes, "utf8");
    console.log(`${artifact.key} ${artifact.digest}`);
    continue;
  }

  const output = await readFile(outputPath, "utf8");
  if (output !== artifact.bytes) throw new Error(`${artifact.key}: generated artifact drift`);
}
