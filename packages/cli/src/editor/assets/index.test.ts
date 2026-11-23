import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadPackagedStudioArtifact, loadStudioArtifactFrom } from "./index";

const roots: Array<string> = [];

async function fixture(manifest: unknown = defaultManifest) {
  const root = await mkdtemp(join(tmpdir(), "ffd-editor-assets-"));
  roots.push(root);
  await mkdir(join(root, "assets/chunk"), { recursive: true });
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(root, "assets/studio.js"), "export {};");
  await writeFile(join(root, "assets/studio.css"), "body {}");
  await writeFile(join(root, "assets/chunk/content.js"), "export {};");
  return root;
}

const defaultManifest = {
  "src/app/index.tsx": {
    file: "assets/studio.js",
    isEntry: true,
    css: ["assets/studio.css"],
  },
  "src/app/content/navigation.tsx": { file: "assets/chunk/content.js", isDynamicEntry: true },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("packaged Studio artifact allowlist", () => {
  it("loads only the manifest files into exact routes", async () => {
    const artifact = await loadStudioArtifactFrom(await fixture());
    expect(artifact.entryScript).toBe("/assets/studio.js");
    expect(artifact.stylesheets).toEqual(["/assets/studio.css"]);
    expect([...artifact.files.keys()].sort()).toEqual([
      "/assets/chunk/content.js",
      "/assets/studio.css",
      "/assets/studio.js",
    ]);
    expect(artifact.files.get("/assets/studio.js")?.contentType).toBe(
      "text/javascript; charset=utf-8",
    );
  });

  it("rejects traversal, symlinks, unknown types, and oversized files", async () => {
    await expect(
      loadStudioArtifactFrom(
        await fixture({ entry: { file: "assets/../manifest.json", isEntry: true } }),
      ),
    ).rejects.toThrow("EDITOR_ASSET_INVALID");

    const linked = await fixture();
    await rm(join(linked, "assets/chunk/content.js"));
    await symlink(join(linked, "assets/studio.js"), join(linked, "assets/chunk/content.js"));
    await expect(loadStudioArtifactFrom(linked)).rejects.toThrow("EDITOR_ASSET_INVALID");

    await expect(
      loadStudioArtifactFrom(await fixture({ entry: { file: "assets/data.json", isEntry: true } })),
    ).rejects.toThrow("EDITOR_ASSET_INVALID");

    const oversized = await fixture();
    await writeFile(join(oversized, "assets/studio.js"), Buffer.alloc(4_194_305));
    await expect(loadStudioArtifactFrom(oversized)).rejects.toThrow("EDITOR_ASSET_INVALID");
  });

  it("loads the committed Studio artifact", async () => {
    const artifact = await loadPackagedStudioArtifact();
    expect(artifact.files.has(artifact.entryScript)).toBe(true);
  });
});
