import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadStudioAssetsFrom } from "../../src/assets";

const roots: Array<string> = [];

async function fixture(files: ReadonlyArray<readonly [string, number]>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ffd-studio-assets-"));
  roots.push(root);
  const manifest = Object.fromEntries(
    files.map(([file], index) => [file, { file, ...(index === 0 ? { isEntry: true } : {}) }]),
  );
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  await mkdir(join(root, "assets"));
  await Promise.all(files.map(([file, size]) => writeFile(join(root, file), Buffer.alloc(size))));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Studio packaged asset loader bounds", () => {
  it("accepts exactly 64 finite manifest assets", async () => {
    const files = Array.from(
      { length: 64 },
      (_, index) => [`assets/asset-${index}.js`, 1] as const,
    );
    expect((await loadStudioAssetsFrom(await fixture(files))).files.size).toBe(64);
    await expect(
      loadStudioAssetsFrom(await fixture([...files, ["assets/asset-64.js", 1]])),
    ).rejects.toThrow("STUDIO_ARTIFACT_INVALID");
  });

  it("accepts exact per-file and aggregate byte limits and rejects one byte more", async () => {
    expect(
      (
        await loadStudioAssetsFrom(
          await fixture([
            ["assets/entry.js", 2 * 1_024 * 1_024],
            ["assets/two.js", 2 * 1_024 * 1_024],
            ["assets/three.js", 2 * 1_024 * 1_024],
            ["assets/four.js", 2 * 1_024 * 1_024],
          ]),
        )
      ).files.size,
    ).toBe(4);
    await expect(
      loadStudioAssetsFrom(await fixture([["assets/entry.js", 2 * 1_024 * 1_024 + 1]])),
    ).rejects.toThrow("STUDIO_ARTIFACT_INVALID");
    await expect(
      loadStudioAssetsFrom(
        await fixture([
          ["assets/entry.js", 2 * 1_024 * 1_024],
          ["assets/two.js", 2 * 1_024 * 1_024],
          ["assets/three.js", 2 * 1_024 * 1_024],
          ["assets/four.js", 2 * 1_024 * 1_024],
          ["assets/five.js", 1],
        ]),
      ),
    ).rejects.toThrow("STUDIO_ARTIFACT_INVALID");
  });
});
