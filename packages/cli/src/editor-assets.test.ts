import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadEditorAssetsFrom } from "./editor-assets";

const roots: Array<string> = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ffd-editor-assets-"));
  roots.push(root);
  await mkdir(join(root, "assets"));
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><script type="module" src="/assets/editor.js"></script>',
  );
  await writeFile(join(root, "assets/editor.js"), "export {};");
  await writeFile(join(root, "assets/editor.css"), "body {}");
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("packaged editor asset allowlist", () => {
  it("loads only bounded known browser asset types into exact routes", async () => {
    const assets = await loadEditorAssetsFrom(await fixture());
    expect(assets.html).toContain("/assets/editor.js");
    expect([...assets.files.keys()].sort()).toEqual(["/assets/editor.css", "/assets/editor.js"]);
    expect(assets.files.get("/assets/editor.js")?.contentType).toBe(
      "text/javascript; charset=utf-8",
    );
  });

  it("rejects symlinks, unknown executable types, and oversized files", async () => {
    const linked = await fixture();
    await symlink(join(linked, "assets/editor.js"), join(linked, "assets/linked.js"));
    await expect(loadEditorAssetsFrom(linked)).rejects.toThrow("EDITOR_ASSET_INVALID");

    const unknown = await fixture();
    await writeFile(join(unknown, "assets/data.json"), "{}");
    await expect(loadEditorAssetsFrom(unknown)).rejects.toThrow("EDITOR_ASSET_INVALID");

    const oversized = await fixture();
    await writeFile(join(oversized, "assets/editor.js"), Buffer.alloc(4_194_305));
    await expect(loadEditorAssetsFrom(oversized)).rejects.toThrow("EDITOR_ASSET_INVALID");
  });
});
