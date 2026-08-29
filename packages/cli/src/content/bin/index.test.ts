import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";

import { prepareContentCommand } from "./index";

const entryId = "019fae8b-1234-7000-8000-000000000003";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ffd-content-bin-"));
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 2,
      apiBaseUrl: "https://api.example.test",
      projectId: "019fae8b-1234-7000-8000-000000000001",
      environment: "main",
      output: "generated",
      schema: "project.schema.ts",
    }),
    "utf8",
  );
  return root;
}

describe("content CLI pre-auth input", () => {
  it("strictly decodes a bounded project-contained mutation file", async () => {
    const root = await fixture();
    try {
      await writeFile(
        join(root, "mutations.json"),
        JSON.stringify([{ operation: "set", scope: "localized", path: ["title"], value: "Hello" }]),
        "utf8",
      );
      const prepared = await Effect.runPromise(
        prepareContentCommand(
          [
            "entry",
            "update",
            "--collection",
            "posts",
            "--entry",
            entryId,
            "--locale",
            "en-US",
            "--mutations",
            "mutations.json",
            "--json",
          ],
          root,
        ),
      );
      expect(prepared.mutations).toEqual([
        { operation: "set", scope: "localized", path: ["title"], value: "Hello" },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked and excess-property mutation authority before networking", async () => {
    const root = await fixture();
    try {
      await writeFile(
        join(root, "outside.json"),
        JSON.stringify([{ operation: "unset", scope: "localized", path: ["title"] }]),
        "utf8",
      );
      await symlink(join(root, "outside.json"), join(root, "linked.json"));
      const base = [
        "entry",
        "update",
        "--collection",
        "posts",
        "--entry",
        entryId,
        "--locale",
        "en-US",
        "--mutations",
      ];
      const linked = await Effect.runPromiseExit(
        prepareContentCommand([...base, "linked.json"], root),
      );
      expect(Exit.isFailure(linked)).toBe(true);

      await writeFile(
        join(root, "invalid.json"),
        JSON.stringify([
          {
            operation: "unset",
            scope: "localized",
            path: ["title"],
            unexpected: true,
          },
        ]),
        "utf8",
      );
      const invalid = await Effect.runPromiseExit(
        prepareContentCommand([...base, "invalid.json"], root),
      );
      expect(Exit.isFailure(invalid)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
