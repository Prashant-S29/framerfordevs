import type { ProjectSchema } from "@framerfordevs/schema";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assert, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import {
  readAuthoringCollectionAuthority,
  readAuthoringEnvironmentAuthority,
  writeExportedAuthoringSchema,
} from "./authoring-schema-files";

const project: ProjectSchema = {
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
          configuration: { maxLength: 160 },
        },
      ],
    },
  ],
};

it.live("atomically bootstraps owned Tier 1 source and refuses modified export output", () =>
  Effect.acquireUseRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "ffd-schema-export-"))),
    (root) =>
      Effect.gen(function* () {
        const schemaPath = join(root, "schema", "project.schema.ts");
        yield* Effect.promise(() => mkdir(join(root, "schema"), { recursive: true }));
        const input = {
          projectRoot: root,
          schemaPath,
          project,
          authority: {
            projectId: "019fae8b-1234-7000-8000-000000000001",
            environmentId: "019fae8b-1234-7000-8000-000000000002",
            environmentKey: "main",
            projectSha256: "a".repeat(64),
            projectManifestHash: "b".repeat(64),
            revisionIds: { posts: "019fae8b-1234-7000-8000-000000000003" },
            revisions: [
              {
                collectionSourceKey: "posts",
                collectionId: "019fae8b-1234-7000-8000-000000000004",
                revisionId: "019fae8b-1234-7000-8000-000000000003",
                structureHash: "c".repeat(64),
                contractHash: "d".repeat(64),
                changed: false,
              },
            ],
            collections: [
              {
                sourceKey: "posts",
                collectionId: "019fae8b-1234-7000-8000-000000000004",
                apiKey: "posts",
              },
            ],
            fields: [],
            enumOptions: [],
          },
        };
        const first = yield* writeExportedAuthoringSchema(input);
        const second = yield* writeExportedAuthoringSchema(input);
        assert.strictEqual(second.schemaBytes, first.schemaBytes);
        assert.include(first.schemaBytes, "satisfies ProjectSchema");
        const lockBytes = yield* Effect.promise(() =>
          readFile(join(root, ".framerfordevs/schema.lock.json"), "utf8"),
        );
        assert.deepStrictEqual(JSON.parse(lockBytes), second.lock);
        const environmentAuthority = yield* readAuthoringEnvironmentAuthority({
          projectRoot: root,
          projectId: input.authority.projectId,
          environmentKey: "main",
        });
        assert.deepStrictEqual(environmentAuthority, {
          environmentId: input.authority.environmentId,
        });
        const contentAuthority = yield* readAuthoringCollectionAuthority({
          projectRoot: root,
          projectId: input.authority.projectId,
          environmentKey: "main",
          collectionKey: "posts",
        });
        assert.deepStrictEqual(contentAuthority, {
          revisionId: "019fae8b-1234-7000-8000-000000000003",
          contractHash: "d".repeat(64),
        });

        yield* Effect.promise(() =>
          writeFile(schemaPath, `${first.schemaBytes}// local\n`, "utf8"),
        );
        const modified = yield* Effect.exit(writeExportedAuthoringSchema(input));
        assert.isTrue(Exit.isFailure(modified));
        if (Exit.isFailure(modified)) {
          assert.include(modified.cause.toString(), "CliAuthoringSchemaModifiedError");
        }
      }),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  ),
);
