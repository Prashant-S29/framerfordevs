// Loads the finite packaged browser build into an exact in-memory route allowlist.

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const maximumAssetCount = 32;
const maximumAssetBytes = 4_194_304;
const maximumTotalBytes = 8_388_608;
const allowedAssetName = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u;

export interface EditorStaticAsset {
  readonly contentType: string;
  readonly body: Uint8Array;
}

export interface EditorStaticAssets {
  readonly html: string;
  readonly files: ReadonlyMap<string, EditorStaticAsset>;
}

function contentType(path: string): string | null {
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
      return null;
  }
}

async function filesBelow(root: string, directory: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: Array<string> = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await filesBelow(root, path)));
    else if (entry.isFile()) paths.push(relative(root, path));
    else throw new Error("EDITOR_ASSET_INVALID");
  }
  return paths;
}

export async function loadEditorAssetsFrom(root: string): Promise<EditorStaticAssets> {
  const paths = [...(await filesBelow(root, root))].sort();
  if (paths.length < 2 || paths.length > maximumAssetCount || !paths.includes("index.html")) {
    throw new Error("EDITOR_ASSET_INVALID");
  }
  let total = 0;
  const files = new Map<string, EditorStaticAsset>();
  let html: string | null = null;
  for (const path of paths) {
    if (
      path.includes(`..${sep}`) ||
      path.startsWith(sep) ||
      !allowedAssetName.test(path.replaceAll(sep, "/"))
    ) {
      throw new Error("EDITOR_ASSET_INVALID");
    }
    const bytes = await readFile(join(root, path));
    total += bytes.byteLength;
    if (bytes.byteLength > maximumAssetBytes || total > maximumTotalBytes) {
      throw new Error("EDITOR_ASSET_INVALID");
    }
    if (path === "index.html") {
      html = bytes.toString("utf8");
      continue;
    }
    const type = contentType(path);
    if (type === null) throw new Error("EDITOR_ASSET_INVALID");
    files.set(`/${path.replaceAll(sep, "/")}`, { contentType: type, body: bytes });
  }
  if (html === null || !html.startsWith("<!doctype html>")) {
    throw new Error("EDITOR_ASSET_INVALID");
  }
  return { html, files };
}

export function loadPackagedEditorAssets(): Promise<EditorStaticAssets> {
  return loadEditorAssetsFrom(fileURLToPath(new URL("./index", import.meta.url)));
}
