import { lstat, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const maximumAssetCount = 64;
const maximumAssetBytes = 4_194_304;
const maximumTotalBytes = 8_388_608;
const assetPath = /^assets\/(?:chunk\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export interface EditorStaticAsset {
  readonly contentType: string;
  readonly body: Uint8Array;
}

export interface EditorStudioArtifact {
  readonly entryScript: string;
  readonly stylesheets: ReadonlyArray<string>;
  readonly files: ReadonlyMap<string, EditorStaticAsset>;
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      throw new Error("EDITOR_ASSET_INVALID");
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validAssetPath(value: unknown): value is string {
  return typeof value === "string" && assetPath.test(value) && !value.includes("..");
}

export async function loadStudioArtifactFrom(root: string): Promise<EditorStudioArtifact> {
  const manifest: unknown = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (!isRecord(manifest)) throw new Error("EDITOR_ASSET_INVALID");
  const entries = Object.values(manifest);
  if (!entries.every(isRecord)) throw new Error("EDITOR_ASSET_INVALID");
  const entry = entries.find((candidate) => isRecord(candidate) && candidate.isEntry === true);
  if (!isRecord(entry) || !validAssetPath(entry.file)) throw new Error("EDITOR_ASSET_INVALID");
  const css = entry.css ?? [];
  if (!Array.isArray(css) || !css.every(validAssetPath)) throw new Error("EDITOR_ASSET_INVALID");
  const paths = new Set<string>([entry.file, ...css]);
  for (const candidate of entries) {
    if (!isRecord(candidate) || candidate.file === undefined) continue;
    if (!validAssetPath(candidate.file)) throw new Error("EDITOR_ASSET_INVALID");
    paths.add(candidate.file);
  }
  if (paths.size > maximumAssetCount) throw new Error("EDITOR_ASSET_INVALID");
  const files = new Map<string, EditorStaticAsset>();
  let total = 0;
  for (const path of [...paths].sort()) {
    const type = contentType(path);
    const file = join(root, path);
    if (!(await lstat(file)).isFile()) throw new Error("EDITOR_ASSET_INVALID");
    const body = await readFile(file);
    total += body.byteLength;
    if (body.byteLength > maximumAssetBytes || total > maximumTotalBytes) {
      throw new Error("EDITOR_ASSET_INVALID");
    }
    files.set(`/${path}`, { contentType: type, body });
  }
  return { entryScript: `/${entry.file}`, stylesheets: css.map((path) => `/${path}`), files };
}

export function loadPackagedStudioArtifact(): Promise<EditorStudioArtifact> {
  const root = import.meta.url.endsWith(".mjs")
    ? fileURLToPath(new URL("./studio-assets", import.meta.url))
    : dirname(fileURLToPath(import.meta.resolve("@framerfordevs/studio/artifact/manifest.json")));
  return loadStudioArtifactFrom(root);
}
