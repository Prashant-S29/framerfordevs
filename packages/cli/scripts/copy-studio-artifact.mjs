import { cp, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const source = dirname(
  fileURLToPath(import.meta.resolve("@framerfordevs/studio/artifact/manifest.json")),
);
const target = fileURLToPath(new URL("../dist/studio-assets", import.meta.url));
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true, dereference: true });
