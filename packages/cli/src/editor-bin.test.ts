import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";

import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalJsonBytes, sha256 } from "./canonical";
import { prepareEditorCommand, type EditorPreparationDependencies } from "./editor-bin";

const roots: Array<string> = [];
const projectId = "019fae8b-1234-7000-8000-000000000001";
const extractedProject = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: { minLength: 1 },
        },
      ],
    },
  ],
};
const successfulExtraction: EditorPreparationDependencies = {
  extract: () =>
    Effect.succeed({
      project: extractedProject,
      canonicalJson: canonicalJsonBytes(extractedProject),
      sha256: sha256(canonicalJsonBytes(extractedProject)),
      files: ["framerfordevs.schema.ts"],
    }),
};
const failedExtraction: EditorPreparationDependencies = {
  extract: () => Effect.fail(new Error("CLI_SCHEMA_INVALID")),
};

const validSchema = `
import type { ProjectSchema } from "@framerfordevs/schema";
export default {
  collections: [{
    sourceKey: "posts",
    apiKey: "posts",
    fields: [{
      sourceKey: "title",
      apiKey: "title",
      kind: "short_text",
      required: true,
      localization: "localized",
      configuration: { minLength: 1 },
    }],
  }],
} as const satisfies ProjectSchema;
`;

async function fixture(schema = validSchema) {
  const root = await mkdtemp(join(tmpdir(), "ffd-editor-bin-"));
  roots.push(root);
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 2,
      apiBaseUrl: "https://api.example.test",
      projectId,
      environment: "main",
      output: "src/framerfordevs",
      schema: "framerfordevs.schema.ts",
    }),
  );
  await writeFile(join(root, "framerfordevs.schema.ts"), schema);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("editor pre-auth command", () => {
  it("loads config and statically extracts before online authority", async () => {
    const root = await fixture();
    const result = await Effect.runPromise(
      prepareEditorCommand(["editor"], root, successfulExtraction),
    );
    expect(result.config.projectId).toBe(projectId);
    expect(result.environmentId).toBeNull();
    expect(result.files).toEqual(["framerfordevs.schema.ts"]);
    expect(result.projectSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects flags and executable schema syntax locally", async () => {
    const root = await fixture(`export default (() => ({ collections: [] }))();`);
    await expect(
      Effect.runPromise(
        prepareEditorCommand(["editor", "--api", "https://evil.test"], root, successfulExtraction),
      ),
    ).rejects.toBeTruthy();
    await expect(
      Effect.runPromise(prepareEditorCommand(["editor"], root, failedExtraction)),
    ).rejects.toBeTruthy();
  });

  it("keeps credential and network modules outside the static pre-auth graph", async () => {
    const sourceRoot = resolve(import.meta.dirname);
    const pending = [join(sourceRoot, "editor-bin.ts")];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const path = pending.pop();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const source = await readFile(path, "utf8");
      const imports = [...source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/gu)].map(
        (match) => match[1],
      );
      for (const specifier of imports) {
        if (!specifier) continue;
        const unresolved = resolve(dirname(path), specifier.replace(/\.js$/u, ".ts"));
        pending.push(extname(unresolved) === "" ? `${unresolved}.ts` : unresolved);
      }
    }
    const relative = [...seen].map((path) => path.slice(sourceRoot.length + 1)).sort();
    expect(relative).not.toContain("credential-store.ts");
    expect(relative).not.toContain("oauth-device.ts");
    expect(relative).not.toContain("tooling-http-client.ts");
    expect(relative).not.toContain("editor-online.ts");
    expect(relative).not.toContain("content-online.ts");
    expect(relative).not.toContain("schema-authoring-online.ts");
  });
});
