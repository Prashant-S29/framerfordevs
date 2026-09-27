import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const root = new URL("../artifact/", import.meta.url);
interface ManifestEntry {
  readonly file: string;
  readonly css?: ReadonlyArray<string>;
  readonly imports?: ReadonlyArray<string>;
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
const scriptSize = await sizes(scripts);
const styleSize = await sizes(styles);
if (scriptSize.raw > 600 * 1_024 || scriptSize.gzip > 200 * 1_024)
  throw new Error("Studio initial executable JavaScript exceeds its fixed transfer budget.");
if (styleSize.raw > 128 * 1_024 || styleSize.gzip > 40 * 1_024)
  throw new Error("Studio initial CSS exceeds its fixed transfer budget.");
const files = [...scripts, ...styles];
const total = scriptSize.gzip + styleSize.gzip;
if (total > 200_000)
  throw new Error(`Studio initial transfer ${total} gzip bytes exceeds 200000 bytes.`);
const allAssets = await readdir(new URL("assets/", root));
if (allAssets.length > 12) throw new Error("Studio artifact contains too many initial assets.");
process.stdout.write(
  `Studio initial transfer: ${total} gzip bytes across ${files.length} files (${scriptSize.raw}/${scriptSize.gzip} JS raw/gzip, ${styleSize.raw}/${styleSize.gzip} CSS raw/gzip).\n`,
);
