import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";
import { Effect, Exit } from "effect";

import { contentExitCode, prepareContentCommand } from "./index";

const entryId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const otherRevisionId = "019fae8b-1234-7000-8000-000000000005";
const entryFlags = ["--collection", "posts", "--entry", entryId, "--locale", "en-US"];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ffd-content-bin-"));
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 1,
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

  it("prepares bounded revision, diff, restore, and validate flags", async () => {
    const root = await fixture();
    try {
      const prepare = (arguments_: ReadonlyArray<string>) =>
        Effect.runPromise(prepareContentCommand(arguments_, root));
      const listed = await prepare([
        "entry",
        "revisions",
        ...entryFlags,
        "--scope",
        "shared",
        "--cursor",
        "cursor_1",
        "--limit",
        "25",
      ]);
      expect(listed.command).toBe("entry revisions");
      expect(listed.revision).toEqual({
        scope: "shared",
        revisionId: undefined,
        fromRevisionId: undefined,
        toRevisionId: undefined,
        cursor: "cursor_1",
        limit: 25,
      });
      const read = await prepare(["entry", "revision", ...entryFlags, "--revision", revisionId]);
      expect(read.revision.revisionId).toBe(revisionId);
      const diff = await prepare([
        "entry",
        "diff",
        ...entryFlags,
        "--from",
        revisionId,
        "--to",
        otherRevisionId,
        "--json",
      ]);
      expect(diff.revision).toMatchObject({
        fromRevisionId: revisionId,
        toRevisionId: otherRevisionId,
      });
      const restore = await prepare([
        "entry",
        "restore",
        ...entryFlags,
        "--revision",
        revisionId,
        "--scope",
        "localized",
      ]);
      expect(restore.revision).toMatchObject({ scope: "localized", revisionId });
      const validate = await prepare(["entry", "validate", ...entryFlags]);
      expect(validate.command).toBe("entry validate");
      const current = await prepare(["entry", "preview", ...entryFlags]);
      expect(current.command).toBe("entry preview");
      expect(current.revision.revisionId).toBeUndefined();
      const historical = await prepare([
        "entry",
        "preview",
        ...entryFlags,
        "--revision",
        revisionId,
      ]);
      expect(historical.revision.revisionId).toBe(revisionId);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects missing, malformed, and foreign revision flags before networking", async () => {
    const root = await fixture();
    try {
      const invalidCommands: ReadonlyArray<ReadonlyArray<string>> = [
        ["entry", "revisions", ...entryFlags],
        ["entry", "revisions", ...entryFlags, "--scope", "draft"],
        ["entry", "revisions", ...entryFlags, "--scope", "shared", "--limit", "51"],
        ["entry", "revisions", ...entryFlags, "--scope", "shared", "--limit", "01"],
        ["entry", "revisions", ...entryFlags, "--scope", "shared", "--cursor", "bad/cursor"],
        ["entry", "revisions", "--collection", "posts", "--locale", "en-US", "--scope", "shared"],
        ["entry", "revision", ...entryFlags],
        ["entry", "revision", ...entryFlags, "--revision", "../draft"],
        ["entry", "revision", ...entryFlags, "--revision", revisionId, "--scope", "shared"],
        ["entry", "diff", ...entryFlags, "--from", revisionId],
        ["entry", "diff", ...entryFlags, "--from", revisionId, "--to", "not-a-uuid"],
        ["entry", "restore", ...entryFlags, "--revision", revisionId],
        ["entry", "restore", ...entryFlags, "--scope", "shared"],
        ["entry", "restore", ...entryFlags, "--revision", revisionId, "--scope", "both"],
        ["entry", "validate", ...entryFlags, "--revision", revisionId],
        ["entry", "validate", "--collection", "posts", "--locale", "en-US"],
        ["entry", "publish", ...entryFlags, "--scope", "shared"],
        ["entry", "preview", "--collection", "posts", "--locale", "en-US"],
        ["entry", "preview", ...entryFlags, "--revision", "not-a-uuid"],
        ["entry", "preview", ...entryFlags, "--scope", "shared"],
      ];
      for (const arguments_ of invalidCommands) {
        const exit = await Effect.runPromiseExit(prepareContentCommand(arguments_, root));
        expect(Exit.isFailure(exit), arguments_.join(" ")).toBe(true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("maps diff differences to exit 1 and rejected plans to exit 2", () => {
    expect(contentExitCode({ accepted: true, different: true })).toBe(1);
    expect(contentExitCode({ accepted: true, different: false })).toBe(0);
    expect(contentExitCode({ accepted: false })).toBe(2);
    expect(contentExitCode({ accepted: true })).toBe(0);
  });
});
