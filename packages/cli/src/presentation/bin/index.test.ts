import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { preparePresentationCommand } from "./index";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const revisionId = "019fae8b-1234-7000-8000-000000000003";
const fieldId = "019fae8b-1234-7000-8000-000000000004";
const groupId = "019fae8b-1234-7000-8000-000000000005";
const tabId = "019fae8b-1234-7000-8000-000000000006";

const document = {
  documentVersion: 1,
  projectId,
  environmentId,
  environmentKey: "main",
  collection: "posts",
  expectedRevisionId: revisionId,
  expectedSequence: 1,
  presentation: {
    displayName: "Posts",
    description: null,
    fields: [
      {
        fieldId,
        displayLabel: "Title",
        position: 0,
        editor: {
          helpText: null,
          placeholder: null,
          visibleToRoles: ["developer"],
          editableByRoles: ["developer"],
        },
        enumOptions: [],
      },
    ],
    editorLayout: {
      version: 1,
      tabs: [
        {
          id: tabId,
          title: "Content",
          description: null,
          position: 0,
          visibleToRoles: ["developer"],
          groups: [
            {
              id: groupId,
              title: "Main",
              description: null,
              position: 0,
              columns: 1,
              visibleToRoles: ["developer"],
              fields: [
                {
                  id: fieldId,
                  fieldId,
                  position: 0,
                  helpTextOverride: null,
                  visibleToRoles: ["developer"],
                },
              ],
            },
          ],
        },
      ],
      sidebarGroups: [],
    },
  },
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ffd-presentation-bin-"));
  await writeFile(
    join(root, "framerfordevs.config.json"),
    JSON.stringify({
      schemaVersion: 2,
      apiBaseUrl: "https://api.example.test",
      projectId,
      environment: "main",
      output: "generated",
      schema: "project.schema.ts",
    }),
    "utf8",
  );
  return root;
}

describe("Presentation CLI pre-auth input", () => {
  it("prepares get and strictly decodes a matching project-contained publish document", async () => {
    const root = await fixture();
    try {
      const get = await Effect.runPromise(
        preparePresentationCommand(["presentation", "get", "--collection", "posts"], root),
      );
      expect(get).toMatchObject({
        command: "presentation get",
        collection: "posts",
        environmentId: null,
        document: null,
      });

      await writeFile(join(root, "presentation.json"), JSON.stringify(document), "utf8");
      const publish = await Effect.runPromise(
        preparePresentationCommand(
          ["presentation", "publish", "--collection", "posts", "--file", "presentation.json"],
          root,
        ),
      );
      expect(publish).toMatchObject({
        command: "presentation publish",
        collection: "posts",
        environmentId,
        document: { expectedRevisionId: revisionId, expectedSequence: 1 },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked, drifted, and cross-authority documents before networking", async () => {
    const root = await fixture();
    try {
      const outside = join(root, "outside.json");
      await writeFile(outside, JSON.stringify(document), "utf8");
      await symlink(outside, join(root, "linked.json"));
      const base = ["presentation", "publish", "--collection", "posts", "--file"];
      const linked = await Effect.runPromiseExit(
        preparePresentationCommand([...base, "linked.json"], root),
      );
      expect(Exit.isFailure(linked)).toBe(true);

      await writeFile(
        join(root, "drifted.json"),
        JSON.stringify({ ...document, unexpected: true }),
        "utf8",
      );
      const drifted = await Effect.runPromiseExit(
        preparePresentationCommand([...base, "drifted.json"], root),
      );
      expect(Exit.isFailure(drifted)).toBe(true);

      await writeFile(
        join(root, "foreign.json"),
        JSON.stringify({
          ...document,
          projectId: "019fae8b-1234-7000-8000-000000000099",
        }),
        "utf8",
      );
      const foreign = await Effect.runPromiseExit(
        preparePresentationCommand([...base, "foreign.json"], root),
      );
      expect(Exit.isFailure(foreign)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
