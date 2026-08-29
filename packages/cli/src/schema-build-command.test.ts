import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { runExperimentalSchemaBuildInWorker } from "./experimental-schema-build-runner";
import { SchemaBuildManifest } from "./schema";
import { checkSchemaBuildManifest, runSchemaBuildCommandWith } from "./schema-build-command";

const source = `
import { defineCollection, defineSchema } from "@framerfordevs/schema/compose";

const fields = [];
for (let index = 0; index < 2; index += 1) {
  fields.push({
    sourceKey: "title_" + index,
    apiKey: "title_" + index,
    kind: "short_text",
    required: false,
    localization: "localized",
    configuration: { maxLength: 160 },
  });
}
export default defineSchema({
  collections: [defineCollection({ sourceKey: "posts", apiKey: "posts", fields })],
});
`;

function withProject<A, E>(
  use: (root: string) => Effect.Effect<A, E>,
): Effect.Effect<A, E | Error> {
  return Effect.acquireUseRelease(
    Effect.tryPromise({
      try: () => mkdtemp(join(tmpdir(), "ffd-schema-build-command-")),
      catch: (cause) => new Error(String(cause)),
    }),
    use,
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );
}

function build(root: string, check: boolean) {
  return runSchemaBuildCommandWith(
    {
      projectRoot: root,
      entry: "schema/compose.ts",
      schemaPath: join(root, "framerfordevs.schema.ts"),
      schemaRelativePath: "framerfordevs.schema.ts",
      check,
    },
    runExperimentalSchemaBuildInWorker,
  );
}

describe("schema build command", () => {
  it.live("atomically owns deterministic Tier 1 output and a content-safe manifest", () =>
    withProject((root) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: async () => {
            await mkdir(join(root, "schema"), { recursive: true });
            await writeFile(join(root, "schema/compose.ts"), source, "utf8");
          },
          catch: (cause) => new Error(String(cause)),
        });

        const written = yield* build(root, false);
        const checked = yield* build(root, true);
        const output = yield* Effect.promise(() =>
          readFile(join(root, "framerfordevs.schema.ts"), "utf8"),
        );
        const manifestBytes = yield* Effect.promise(() =>
          readFile(join(root, ".framerfordevs/schema-build.lock.json"), "utf8"),
        );
        const unknownManifest: unknown = JSON.parse(manifestBytes);
        const manifest = yield* Schema.decodeUnknown(SchemaBuildManifest)(unknownManifest, {
          onExcessProperty: "error",
        });

        assert.isTrue(written.changed);
        assert.isTrue(written.accepted);
        assert.isFalse(written.memoryLimitHard);
        assert.isFalse(checked.changed);
        assert.isTrue(checked.accepted);
        assert.include(output, "satisfies ProjectSchema");
        assert.deepStrictEqual(
          manifest.inputs.map((input) => input.path),
          ["schema/compose.ts"],
        );
        assert.strictEqual(manifest.output.sha256, written.outputSha256);
        assert.notInclude(manifestBytes, "api.example");
        assert.notInclude(manifestBytes, "token");

        const currentManifest = yield* checkSchemaBuildManifest({
          projectRoot: root,
          schemaPath: join(root, "framerfordevs.schema.ts"),
          schemaRelativePath: "framerfordevs.schema.ts",
          entryRelativePath: "schema/compose.ts",
        });
        assert.deepStrictEqual(currentManifest, {
          current: true,
          inputCount: 1,
          outputSha256: written.outputSha256,
        });

        yield* Effect.promise(() =>
          writeFile(join(root, "schema/compose.ts"), `${source}\n// changed\n`, "utf8"),
        );
        const staleManifest = yield* Effect.exit(
          checkSchemaBuildManifest({
            projectRoot: root,
            schemaPath: join(root, "framerfordevs.schema.ts"),
            schemaRelativePath: "framerfordevs.schema.ts",
            entryRelativePath: "schema/compose.ts",
          }),
        );
        assert.isTrue(Exit.isFailure(staleManifest));
        if (Exit.isFailure(staleManifest)) {
          assert.isTrue(staleManifest.cause.toString().includes("CliSchemaBuildStaleError"));
        }
        const stale = yield* build(root, true);
        const outputAfterCheck = yield* Effect.promise(() =>
          readFile(join(root, "framerfordevs.schema.ts"), "utf8"),
        );
        assert.isTrue(stale.changed);
        assert.isFalse(stale.accepted);
        assert.strictEqual(outputAfterCheck, output);
      }),
    ),
  );

  it.live("refuses unowned and locally modified outputs", () =>
    withProject((root) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: async () => {
            await mkdir(join(root, "schema"), { recursive: true });
            await writeFile(join(root, "schema/compose.ts"), source, "utf8");
            await writeFile(join(root, "framerfordevs.schema.ts"), "unowned", "utf8");
          },
          catch: (cause) => new Error(String(cause)),
        });
        const unowned = yield* Effect.exit(build(root, false));
        assert.isTrue(Exit.isFailure(unowned));
        if (Exit.isFailure(unowned)) {
          assert.isTrue(unowned.cause.toString().includes("CliSchemaBuildOutputUnownedError"));
        }

        yield* Effect.promise(() => rm(join(root, "framerfordevs.schema.ts"), { force: true }));
        yield* build(root, false);
        yield* Effect.promise(() =>
          writeFile(join(root, "framerfordevs.schema.ts"), "locally modified", "utf8"),
        );
        const modified = yield* Effect.exit(build(root, true));
        assert.isTrue(Exit.isFailure(modified));
        if (Exit.isFailure(modified)) {
          assert.isTrue(modified.cause.toString().includes("CliSchemaBuildOutputModifiedError"));
        }
      }),
    ),
  );
});
