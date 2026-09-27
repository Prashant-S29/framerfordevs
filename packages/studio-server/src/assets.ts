// Loads the finite, package-owned Studio browser artifact into an exact immutable allowlist.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const maximumAssets = 64;
const maximumAssetBytes = 2 * 1_024 * 1_024;
const maximumTotalBytes = 8 * 1_024 * 1_024;
const assetPath = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export interface StudioAsset {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly etag: string;
}

export interface StudioAssets {
  readonly entryScript: string;
  readonly stylesheets: ReadonlyArray<string>;
  readonly files: ReadonlyMap<string, StudioAsset>;
}

interface ManifestEntry {
  readonly file?: unknown;
  readonly css?: unknown;
  readonly isEntry?: unknown;
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
      throw new Error("STUDIO_ARTIFACT_INVALID");
  }
}

function digest(bytes: Uint8Array): string {
  return `"${createHash("sha256").update(bytes).digest("base64url")}"`;
}

export async function loadStudioAssetsFrom(root: string): Promise<StudioAssets> {
  const parsed: unknown = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("STUDIO_ARTIFACT_INVALID");
  }
  const entries: Array<ManifestEntry> = [];
  for (const candidate of Object.values(parsed)) {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
      throw new Error("STUDIO_ARTIFACT_INVALID");
    entries.push(candidate);
  }
  const entry = entries.find((candidate) => candidate.isEntry === true);
  if (entry === undefined || typeof entry.file !== "string" || !assetPath.test(entry.file)) {
    throw new Error("STUDIO_ARTIFACT_INVALID");
  }
  const css = entry.css ?? [];
  if (!Array.isArray(css)) throw new Error("STUDIO_ARTIFACT_INVALID");
  const stylesheets: Array<string> = [];
  for (const file of css) {
    if (typeof file !== "string" || !assetPath.test(file))
      throw new Error("STUDIO_ARTIFACT_INVALID");
    stylesheets.push(file);
  }
  const paths = new Set<string>([entry.file, ...stylesheets]);
  for (const candidate of entries) {
    if (typeof candidate.file === "string") paths.add(candidate.file);
  }
  if (
    paths.size < 1 ||
    paths.size > maximumAssets ||
    [...paths].some((path) => !assetPath.test(path))
  ) {
    throw new Error("STUDIO_ARTIFACT_INVALID");
  }
  const files = new Map<string, StudioAsset>();
  let total = 0;
  for (const path of [...paths].sort()) {
    const body = await readFile(join(root, path));
    total += body.byteLength;
    if (body.byteLength > maximumAssetBytes || total > maximumTotalBytes) {
      throw new Error("STUDIO_ARTIFACT_INVALID");
    }
    files.set(`/${path}`, { body, contentType: contentType(path), etag: digest(body) });
  }
  return {
    entryScript: `/${entry.file}`,
    stylesheets: stylesheets.map((path) => `/${path}`),
    files,
  };
}

export function loadPackagedStudioAssets(): Promise<StudioAssets> {
  const manifestUrl = import.meta.resolve("@framerfordevs/studio/artifact/manifest.json");
  return loadStudioAssetsFrom(dirname(fileURLToPath(manifestUrl)));
}

export function renderStudioHtml(
  mountPath: string,
  dashboardOrigin: string,
  assets: StudioAssets,
): string {
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="ffd-studio-mount" content="${mountPath}"><meta name="ffd-studio-dashboard-origin" content="${dashboardOrigin}"><title>Studio</title>${assets.stylesheets.map((path) => `<link rel="stylesheet" href="${mountPath}${path}">`).join("")}</head><body><a class="sr-only focus:not-sr-only" href="#main-content">Skip to content</a><div id="studio-root"></div><noscript>Studio requires JavaScript.</noscript><script type="module" src="${mountPath}${assets.entryScript}"></script></body></html>\n`;
}
