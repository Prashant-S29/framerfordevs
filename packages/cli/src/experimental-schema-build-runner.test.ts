import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { runExperimentalSchemaBuildInWorker } from "./experimental-schema-build-runner";
import { runStaticSchemaExtractorInWorker } from "./static-schema-extractor";

function withProject(
  files: Readonly<Record<string, string>>,
  run: (root: string) => Effect.Effect<void, unknown>,
) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const root = mkdtempSync(join(tmpdir(), "ffd-experimental-build-"));
      for (const [path, source] of Object.entries(files)) {
        const target = join(root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, source, "utf8");
      }
      return root;
    }),
    run,
    (root) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );
}

function build(root: string, experimental = true) {
  return runExperimentalSchemaBuildInWorker({
    projectRoot: root,
    entry: "schema/compose.ts",
    experimental,
  });
}

const commonSource = `
export function makeField(index: number) {
  return {
    sourceKey: "field_" + index,
    apiKey: "field_" + index,
    kind: "short_text" as const,
    required: index === 0,
    localization: "localized" as const,
    configuration: { maxLength: 160 + index },
  };
}
`;

const composedSource = `
import { defineCollection, defineSchema } from "@framerfordevs/schema/compose";
import { makeField } from "./common";

const fields = [];
for (let index = 0; index < 4; index += 1) fields.push(makeField(index));
const posts = defineCollection({
  sourceKey: "posts",
  apiKey: "posts",
  fields: [...fields],
});
export default defineSchema({ collections: [posts] });
`;

describe("experimental QuickJS schema build", () => {
  it.effect(
    "runs factories, loops, spread, helpers, and bounded local modules deterministically",
    () =>
      withProject(
        {
          "schema/compose.ts": composedSource,
          "schema/common.ts": commonSource,
        },
        (root) =>
          Effect.gen(function* () {
            const first = yield* build(root);
            const second = yield* build(root);
            assert.strictEqual(first.sha256, second.sha256);
            assert.deepStrictEqual(first.files, ["schema/common.ts", "schema/compose.ts"]);
            assert.deepStrictEqual(
              first.inputs.map((input) => input.path),
              first.files,
            );
            assert.deepStrictEqual(first.inputs, second.inputs);
            assert.strictEqual(first.runtime, "quickjs-emscripten-0.32.0-experimental");
            assert.isFalse(first.memoryLimitHard);
            writeFileSync(join(root, "framerfordevs.schema.ts"), first.tierOneSource, "utf8");
            const extracted = yield* runStaticSchemaExtractorInWorker({
              projectRoot: root,
              entry: "framerfordevs.schema.ts",
            });
            assert.strictEqual(extracted.sha256, first.sha256);
            assert.strictEqual(extracted.canonicalJson, first.canonicalJson);
            if (typeof first.project === "object" && first.project !== null) {
              const collections: unknown = Reflect.get(first.project, "collections");
              assert.isTrue(Array.isArray(collections));
            }
          }),
      ),
  );

  it.effect("requires explicit experimental opt-in", () =>
    withProject({ "schema/compose.ts": composedSource, "schema/common.ts": commonSource }, (root) =>
      Effect.gen(function* () {
        const result = yield* Effect.exit(build(root, false));
        assert.isTrue(Exit.isFailure(result));
        if (Exit.isFailure(result)) {
          assert.match(JSON.stringify(result.cause.toJSON()), /experimental_opt_in_required/u);
        }
      }),
    ),
  );

  it.effect(
    "rejects external, dynamic, CommonJS, and host-meta imports before guest execution",
    () => {
      const hostile = [
        `import fs from "node:fs"; export default fs;`,
        `import leftPad from "left-pad"; export default leftPad;`,
        `const value = import("node:fs"); export default value;`,
        `const value = require("node:fs"); export default value;`,
        `const value = import.meta.url; export default value;`,
        `const value = await Promise.resolve(1); export default value;`,
      ];
      return withProject({ "schema/compose.ts": "" }, (root) =>
        Effect.gen(function* () {
          for (const source of hostile) {
            writeFileSync(join(root, "schema/compose.ts"), source, "utf8");
            const result = yield* Effect.exit(build(root));
            assert.isTrue(Exit.isFailure(result));
          }
        }),
      );
    },
  );

  it.effect("interrupts non-terminating guest code", () =>
    withProject(
      { "schema/compose.ts": `while (true) {} export default { collections: [] };` },
      (root) =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(build(root));
          assert.isTrue(Exit.isFailure(result));
          if (Exit.isFailure(result)) {
            assert.match(JSON.stringify(result.cause.toJSON()), /guest_interrupted/u);
          }
        }),
    ),
  );

  it.effect("exposes no Node, network, clock, randomness, or WebAssembly capability", () =>
    withProject(
      {
        "schema/compose.ts": `
          const probe = [
            typeof process,
            typeof require,
            typeof fetch,
            typeof XMLHttpRequest,
            typeof WebSocket,
            typeof Worker,
            typeof Deno,
            typeof Bun,
            typeof WebAssembly,
            typeof Date,
            typeof Math.random,
            globalThis.constructor.constructor("return typeof process + ':' + typeof require + ':' + typeof fetch")(),
          ].join("|");
          export default {
            collections: [{
              sourceKey: "probes",
              apiKey: "probes",
              fields: [{
                sourceKey: "capabilities",
                apiKey: "capabilities",
                kind: "short_text",
                required: true,
                localization: "shared",
                configuration: { default: probe },
              }],
            }],
          };
        `,
      },
      (root) =>
        Effect.gen(function* () {
          const result = yield* build(root);
          assert.match(result.canonicalJson, /undefined\|undefined\|undefined/u);
          assert.notMatch(result.canonicalJson, /object\|function/u);
        }),
    ),
  );
});
