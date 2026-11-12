import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("../artifact/", import.meta.url);
interface ManifestEntry {
  readonly file: string;
  readonly css?: ReadonlyArray<string>;
  readonly imports?: ReadonlyArray<string>;
  readonly dynamicImports?: ReadonlyArray<string>;
}
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8")) as Record<
  string,
  ManifestEntry
>;
const entry = manifest["src/app/index.tsx"];
if (entry === undefined) throw new Error("Studio artifact entry is missing.");
const scripts = new Set<string>();
const styles = new Set<string>();
function collect(candidate: ManifestEntry): void {
  scripts.add(candidate.file);
  for (const stylesheet of candidate.css ?? []) styles.add(stylesheet);
  for (const imported of candidate.imports ?? []) {
    const dependency = manifest[imported];
    if (dependency === undefined) throw new Error("Studio artifact import is missing.");
    if (!scripts.has(dependency.file)) collect(dependency);
  }
}
collect(entry);
for (const source of ["src/app/content/navigation.tsx", "src/app/content/workspace.tsx"] as const) {
  const lazyEntry = manifest[source];
  if (lazyEntry === undefined || scripts.has(lazyEntry.file)) {
    throw new Error(`${source} must remain outside the initial Studio executable graph.`);
  }
}
const sizes = async (files: ReadonlySet<string>) => {
  const values = await Promise.all(
    [...files].map(async (file) => {
      const body = await readFile(join(root.pathname, file));
      return { raw: body.byteLength, gzip: gzipSync(body).byteLength };
    }),
  );
  return values.reduce(
    (total, value) => ({ raw: total.raw + value.raw, gzip: total.gzip + value.gzip }),
    { raw: 0, gzip: 0 },
  );
};
const workspace = manifest["src/app/content/workspace.tsx"];
const portableText = manifest["../content-form/src/portable-text-field/index.tsx"];
if (workspace === undefined || portableText === undefined) {
  throw new Error("Studio form and Portable Text lazy entries must be emitted independently.");
}
if (
  !(workspace.dynamicImports ?? []).includes("../content-form/src/portable-text-field/index.tsx")
) {
  throw new Error("Portable Text must remain outside the initial content-form workspace graph.");
}
const workspaceScripts = new Set<string>();
function collectWorkspace(candidate: ManifestEntry): void {
  if (!scripts.has(candidate.file)) workspaceScripts.add(candidate.file);
  for (const imported of candidate.imports ?? []) {
    const dependency = manifest[imported];
    if (dependency === undefined) throw new Error("Studio workspace import is missing.");
    if (!scripts.has(dependency.file) && !workspaceScripts.has(dependency.file)) {
      collectWorkspace(dependency);
    }
  }
}
collectWorkspace(workspace);
const scriptSize = await sizes(scripts);
const styleSize = await sizes(styles);
const workspaceSize = await sizes(workspaceScripts);
const portableTextSize = await sizes(new Set([portableText.file]));
if (scriptSize.raw > 600 * 1_024 || scriptSize.gzip > 200 * 1_024)
  throw new Error("Studio initial executable JavaScript exceeds its fixed transfer budget.");
if (styleSize.raw > 128 * 1_024 || styleSize.gzip > 40 * 1_024)
  throw new Error("Studio initial CSS exceeds its fixed transfer budget.");
if (workspaceSize.raw > 200 * 1_024 || workspaceSize.gzip > 55 * 1_024)
  throw new Error("Studio content-form workspace exceeds its fixed lazy-chunk budget.");
if (portableTextSize.raw > 900 * 1_024 || portableTextSize.gzip > 270 * 1_024)
  throw new Error("Studio Portable Text editor exceeds its fixed lazy-chunk budget.");
const files = [...scripts, ...styles];
const total = scriptSize.gzip + styleSize.gzip;
if (total > 200_000)
  throw new Error(`Studio initial transfer ${total} gzip bytes exceeds 200000 bytes.`);
const allAssets = new Set(
  Object.values(manifest).flatMap((candidate) => [candidate.file, ...(candidate.css ?? [])]),
);
// Twelve reviewed M19B assets plus the bundler-owned rolldown runtime-helper chunk (Vite 8.3 / rolldown 1.3).
if (allAssets.size > 13) throw new Error("Studio artifact contains too many finite assets.");
process.stdout.write(
  `Studio initial transfer: ${total} gzip bytes across ${files.length} files (${scriptSize.raw}/${scriptSize.gzip} JS raw/gzip, ${styleSize.raw}/${styleSize.gzip} CSS raw/gzip). Content-form workspace: ${workspaceSize.raw}/${workspaceSize.gzip} raw/gzip. Portable Text: ${portableTextSize.raw}/${portableTextSize.gzip} raw/gzip.\n`,
);
