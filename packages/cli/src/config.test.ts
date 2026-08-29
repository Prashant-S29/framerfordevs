import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  ancestorConfigCandidates,
  CliConfigFileSystem,
  generationLockFileName,
  loadCliConfig,
} from "./config";

function fileSystem(files: Readonly<Record<string, string>>) {
  return Layer.succeed(CliConfigFileSystem, {
    exists: (path: string) => Effect.succeed(Object.hasOwn(files, path)),
    readUtf8: (path: string) =>
      Object.hasOwn(files, path)
        ? Effect.succeed(files[path] ?? "")
        : Effect.die(new Error("missing fixture")),
  });
}

const valid = JSON.stringify({
  schemaVersion: 1,
  apiBaseUrl: "https://api.example.com",
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environment: "main",
  output: "src/framerfordevs",
});
const validV2 = JSON.stringify({
  schemaVersion: 2,
  apiBaseUrl: "https://api.example.com",
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environment: "main",
  output: "src/framerfordevs",
  schema: "framerfordevs.schema.ts",
  schemaBuild: { entry: "schema/compose.schema.ts" },
});

describe("CLI config", () => {
  it("searches every ancestor through exactly one filesystem root", () => {
    assert.deepEqual(ancestorConfigCandidates("/workspace/app/src"), [
      "/workspace/app/src/framerfordevs.config.json",
      "/workspace/app/framerfordevs.config.json",
      "/workspace/framerfordevs.config.json",
      "/framerfordevs.config.json",
    ]);
  });

  it.effect("loads one bounded non-secret exact config", () =>
    Effect.gen(function* () {
      const result = yield* loadCliConfig("/workspace/app/src");

      assert.strictEqual(result.path, "/workspace/app/framerfordevs.config.json");
      assert.strictEqual(result.outputDirectory, "/workspace/app/src/framerfordevs");
      assert.strictEqual(result.config.environment, "main");
    }).pipe(
      Effect.provide(
        fileSystem({
          "/workspace/app/framerfordevs.config.json": valid,
        }),
      ),
    ),
  );

  it.effect("loads v2 schema authority while retaining v1 compatibility", () =>
    Effect.gen(function* () {
      const v1 = yield* loadCliConfig("/workspace/v1").pipe(
        Effect.provide(
          fileSystem({
            "/workspace/v1/framerfordevs.config.json": valid,
          }),
        ),
      );
      const v2 = yield* loadCliConfig("/workspace/v2").pipe(
        Effect.provide(
          fileSystem({
            "/workspace/v2/framerfordevs.config.json": validV2,
          }),
        ),
      );

      assert.isNull(v1.schemaPath);
      assert.strictEqual(generationLockFileName(v1.config), "schema.lock.json");
      assert.strictEqual(generationLockFileName(v2.config), "generated.lock.json");
      assert.strictEqual(v2.schemaPath, "/workspace/v2/framerfordevs.schema.ts");
      assert.strictEqual(v2.schemaBuildEntryPath, "/workspace/v2/schema/compose.schema.ts");
    }),
  );

  it.effect("rejects missing and ambiguous ancestor authority", () =>
    Effect.gen(function* () {
      const missing = yield* Effect.exit(
        loadCliConfig("/workspace/app").pipe(Effect.provide(fileSystem({}))),
      );
      const ambiguous = yield* Effect.exit(
        loadCliConfig("/workspace/app").pipe(
          Effect.provide(
            fileSystem({
              "/workspace/app/framerfordevs.config.json": valid,
              "/workspace/framerfordevs.config.json": valid,
            }),
          ),
        ),
      );

      assert.strictEqual(missing._tag, "Failure");
      assert.strictEqual(ambiguous._tag, "Failure");
    }),
  );

  it.effect("rejects unknown keys, credentials, and output-escaping paths", () =>
    Effect.gen(function* () {
      const fixtures = [
        { ...JSON.parse(valid), token: "secret" },
        { ...JSON.parse(valid), output: "../outside" },
        { ...JSON.parse(valid), output: "/absolute" },
        { ...JSON.parse(validV2), schema: "../outside.schema.ts" },
        { ...JSON.parse(validV2), schema: "/absolute.schema.ts" },
        { ...JSON.parse(validV2), schemaBuild: { entry: "../compose.schema.ts" } },
        { ...JSON.parse(valid), apiBaseUrl: "http://api.example.com" },
        { ...JSON.parse(valid), apiBaseUrl: "https://user:pass@api.example.com" },
      ];
      for (const [index, fixture] of fixtures.entries()) {
        const result = yield* Effect.exit(
          loadCliConfig("/workspace").pipe(
            Effect.provide(
              fileSystem({
                "/workspace/framerfordevs.config.json": JSON.stringify(fixture),
              }),
            ),
          ),
        );
        assert.strictEqual(result._tag, "Failure", `fixture ${index} must fail`);
      }
    }),
  );
});
