import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import {
  runStaticSchemaExtractorInWorker,
  staticSchemaExtractorLimits,
} from "./static-schema-extractor";

function withProject(
  files: Readonly<Record<string, string>>,
  run: (root: string) => Effect.Effect<void, unknown>,
) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const root = mkdtempSync(join(tmpdir(), "ffd-static-schema-"));
      for (const [path, contents] of Object.entries(files)) {
        writeFileSync(join(root, path), contents, "utf8");
      }
      return root;
    }),
    run,
    (root) => Effect.sync(() => rmSync(root, { recursive: true, force: true })),
  );
}

const validCollection = `
export const posts = {
  sourceKey: "posts",
  apiKey: "posts",
  fields: [{
    sourceKey: "title",
    apiKey: "title",
    kind: "short_text",
    required: true,
    localization: "localized",
    configuration: { maxLength: 160, minLength: 1 },
  }],
} as const satisfies CollectionSchema;
`;

const validEntry = `
import type { ProjectSchema } from "@framerfordevs/schema";
import { posts } from "./posts.schema";

export default {
  collections: [posts],
} as const satisfies ProjectSchema;
`;

function extract(root: string) {
  return runStaticSchemaExtractorInWorker({
    projectRoot: root,
    entry: "framerfordevs.schema.ts",
  });
}

describe("Tier 1 static schema extractor", () => {
  it.effect("extracts a bounded local graph into deterministic canonical bytes", () =>
    withProject(
      {
        "framerfordevs.schema.ts": validEntry,
        "posts.schema.ts": validCollection,
      },
      (root) =>
        Effect.gen(function* () {
          const first = yield* extract(root);
          const second = yield* extract(root);
          assert.deepStrictEqual(first.files, ["framerfordevs.schema.ts", "posts.schema.ts"]);
          assert.strictEqual(first.canonicalJson, second.canonicalJson);
          assert.strictEqual(first.sha256, second.sha256);
          assert.match(first.sha256, /^[0-9a-f]{64}$/u);
          assert.strictEqual(
            first.canonicalJson,
            `${JSON.stringify(
              {
                collections: [
                  {
                    apiKey: "posts",
                    fields: [
                      {
                        apiKey: "title",
                        configuration: { maxLength: 160, minLength: 1 },
                        kind: "short_text",
                        localization: "localized",
                        required: true,
                        sourceKey: "title",
                      },
                    ],
                    sourceKey: "posts",
                  },
                ],
              },
              null,
              2,
            )}\n`,
          );
        }),
    ),
  );

  it.effect("rejects executable syntax without touching a sentinel", () => {
    const hostileSources = [
      `export default (() => ({ collections: [] }))();`,
      `const secret = process.env.FFD_MANAGEMENT_TOKEN; export default { collections: secret };`,
      `const loaded = require("node:fs"); export default { collections: loaded };`,
      `const value = await import("node:fs"); export default { collections: value };`,
      `const field = { ...globalThis.payload }; export default { collections: [field] };`,
      `const field = { get sourceKey() { return "posts"; } }; export default { collections: [field] };`,
      `for (;;) {} export default { collections: [] };`,
      `function build() { return { collections: [] }; } export default build();`,
      `class Builder {} export default { collections: [] };`,
      `enum Kind { Text } export default { collections: [] };`,
      `const ignored = fetch("http://127.0.0.1:9"); export default { collections: [] };`,
      `import { writeFileSync } from "node:fs"; writeFileSync("sentinel", "changed"); export default { collections: [] };`,
      `import keyring from "@napi-rs/keyring"; export default { collections: [keyring] };`,
      `export default { collections: [] unexpected: true };`,
      `const ignored = new Proxy({}, {}); export default { collections: [] };`,
      `const ignored = Math.random(); export default { collections: [] };`,
      `const ignored = Date.now(); export default { collections: [] };`,
      `const ignored = globalThis.constructor; export default { collections: [] };`,
    ];
    return withProject({ "framerfordevs.schema.ts": "" }, (root) =>
      Effect.gen(function* () {
        const sentinel = join(root, "sentinel.txt");
        writeFileSync(sentinel, "unchanged", "utf8");
        for (const source of hostileSources) {
          writeFileSync(join(root, "framerfordevs.schema.ts"), source, "utf8");
          const result = yield* Effect.exit(extract(root));
          assert.isTrue(Exit.isFailure(result));
          assert.strictEqual(readFileSync(sentinel, "utf8"), "unchanged");
        }
      }),
    );
  });

  it.effect("rejects excess schema properties after static reduction", () =>
    withProject(
      {
        "framerfordevs.schema.ts": `export default { collections: [], token: "secret" };`,
      },
      (root) =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(extract(root));
          assert.isTrue(Exit.isFailure(result));
          if (Exit.isFailure(result)) {
            const error = result.cause.toJSON();
            assert.match(JSON.stringify(error), /schema_invalid/u);
          }
        }),
    ),
  );

  it.effect("rejects bounded resource violations", () => {
    const nested = `${"[".repeat(70)}null${"]".repeat(70)}`;
    return withProject(
      {
        "framerfordevs.schema.ts": `const value = ${nested}; export default value;`,
      },
      (root) =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(extract(root));
          assert.isTrue(Exit.isFailure(result));
          if (Exit.isFailure(result)) {
            assert.match(JSON.stringify(result.cause.toJSON()), /depth_exceeded/u);
          }
        }),
    );
  });

  it.effect("terminates a deterministic malformed parser and evaluator corpus", () => {
    const declarationOverflow = Array.from(
      { length: staticSchemaExtractorLimits.declarations + 1 },
      (_, index) => `const value${index} = ${index};`,
    ).join("\n");
    const pathologicalSources = [
      `${"(".repeat(20_000)}0${")".repeat(20_000)}`,
      `${"[".repeat(staticSchemaExtractorLimits.expressionDepth + 2)}null${"]".repeat(staticSchemaExtractorLimits.expressionDepth + 2)}`,
      `/* ${"*".repeat(100_000)}`,
      `export default \`${"${".repeat(2_000)}`,
      `const value = value; export default value;`,
      `${declarationOverflow}\nexport default { collections: [] };`,
      `export default { collections: [${"{".repeat(2_000)}] };`,
      `export default { collections: [], value: "\uD800" };`,
    ];
    return withProject({ "framerfordevs.schema.ts": "" }, (root) =>
      Effect.gen(function* () {
        const startedAt = Date.now();
        for (const source of pathologicalSources) {
          writeFileSync(join(root, "framerfordevs.schema.ts"), source, "utf8");
          const result = yield* Effect.exit(extract(root));
          assert.isTrue(Exit.isFailure(result));
        }
        assert.isBelow(Date.now() - startedAt, 30_000);
      }),
    );
  });

  it.effect("rejects a deterministic 256-case token fuzz corpus without side effects", () => {
    let state = 0x13c0defd;
    const next = () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };
    const tokens = [
      "{",
      "}",
      "[",
      "]",
      "(",
      ")",
      ":",
      ",",
      ".",
      "?",
      "=>",
      "export",
      "default",
      "const",
      "import",
      "from",
      "as",
      "satisfies",
      "null",
      "true",
      "false",
      "identifier",
      '"text"',
      "0",
      "/*comment*/",
      "//comment\n",
      "\u{1f642}",
    ];
    return withProject({ "framerfordevs.schema.ts": "" }, (root) =>
      Effect.gen(function* () {
        const sentinel = join(root, "sentinel.txt");
        writeFileSync(sentinel, "unchanged", "utf8");
        const startedAt = Date.now();
        for (let caseIndex = 0; caseIndex < 256; caseIndex += 1) {
          const tokenCount = 1 + (next() % 192);
          const source = Array.from(
            { length: tokenCount },
            () => tokens[next() % tokens.length],
          ).join(" ");
          writeFileSync(join(root, "framerfordevs.schema.ts"), source, "utf8");
          const result = yield* Effect.exit(extract(root));
          assert.isTrue(Exit.isFailure(result));
          assert.strictEqual(readFileSync(sentinel, "utf8"), "unchanged");
        }
        assert.isBelow(Date.now() - startedAt, 30_000);
      }),
    );
  });

  it.effect("rejects graph cycles before evaluation", () =>
    withProject(
      {
        "framerfordevs.schema.ts": `import { a } from "./a.schema"; export default a;`,
        "a.schema.ts": `import { b } from "./b.schema"; export const a = b;`,
        "b.schema.ts": `import { a } from "./a.schema"; export const b = a;`,
      },
      (root) =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(extract(root));
          assert.isTrue(Exit.isFailure(result));
          if (Exit.isFailure(result))
            assert.match(JSON.stringify(result.cause.toJSON()), /graph_cycle/u);
        }),
    ),
  );

  it.effect("rejects symlinked schema modules", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const root = mkdtempSync(join(tmpdir(), "ffd-static-schema-link-"));
        const outside = mkdtempSync(join(tmpdir(), "ffd-static-schema-outside-"));
        writeFileSync(join(outside, "posts.schema.ts"), validCollection, "utf8");
        writeFileSync(join(root, "framerfordevs.schema.ts"), validEntry, "utf8");
        symlinkSync(join(outside, "posts.schema.ts"), join(root, "posts.schema.ts"));
        return { root, outside };
      }),
      ({ root }) =>
        Effect.gen(function* () {
          const result = yield* Effect.exit(extract(root));
          assert.isTrue(Exit.isFailure(result));
          if (Exit.isFailure(result))
            assert.match(JSON.stringify(result.cause.toJSON()), /file_symlink/u);
        }),
      ({ root, outside }) =>
        Effect.sync(() => {
          rmSync(root, { recursive: true, force: true });
          rmSync(outside, { recursive: true, force: true });
        }),
    ),
  );
});
