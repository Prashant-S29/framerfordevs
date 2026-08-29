import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { sha256 } from "./canonical";
import { GeneratorCommitError } from "./errors";
import {
  commitGenerationPlan,
  GeneratorFileSystemLive,
  type GeneratorCommitStage,
} from "./filesystem-transaction";
import type { GenerationPlan, GeneratedFile } from "./generator";
import { SchemaLock } from "./schema";

const paths = [
  "client.ts",
  "index.ts",
  "metadata.json",
  "openapi.json",
  "schema.json",
  "schema.ts",
] as const;

function plan(version: string): GenerationPlan {
  const files: ReadonlyArray<GeneratedFile> = paths.map((path) => {
    const bytes = path.endsWith(".ts") ? `// generated ${version}\n` : `{"version":"${version}"}\n`;
    return { path, bytes, sha256: sha256(bytes) };
  });
  const lock = Schema.decodeUnknownSync(SchemaLock)({
    lockVersion: 1,
    generatorVersion: "1.0.0",
    sdkCompatibility: "^0.1.0",
    toolingApi: "tooling/v1",
    projectId: "019fae8b-1234-7000-8000-000000000001",
    environmentId: "019fae8b-1234-7000-8000-000000000002",
    environmentKey: "main",
    locales: [],
    localeContractHash: "a".repeat(64),
    collections: [],
    files: files.map((file) => ({ path: file.path, sha256: file.sha256 })),
  });
  return { files, lock, lockBytes: `${JSON.stringify(lock, null, 2)}\n` };
}

async function temporaryDirectory() {
  return mkdtemp(join(tmpdir(), "ffd-generator-"));
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function commit(
  root: string,
  generation: GenerationPlan,
  options?: {
    force?: boolean;
    stage?: GeneratorCommitStage;
    lockFileName?: "schema.lock.json" | "generated.lock.json";
  },
) {
  return commitGenerationPlan({
    rootDirectory: root,
    outputDirectory: join(root, "src", "framerfordevs"),
    plan: generation,
    transactionId: options?.stage ?? "success",
    ...(options?.lockFileName === undefined ? {} : { lockFileName: options.lockFileName }),
    ...(options?.force === undefined ? {} : { force: options.force }),
    ...(options?.stage === undefined
      ? {}
      : {
          beforeStage: (stage: GeneratorCommitStage) =>
            stage === options.stage
              ? Effect.fail(
                  GeneratorCommitError.make({
                    stage,
                    cause: new Error("injected failure"),
                  }),
                )
              : Effect.void,
        }),
  }).pipe(Effect.provide(GeneratorFileSystemLive));
}

async function assertPlanInstalled(root: string, generation: GenerationPlan) {
  for (const file of generation.files) {
    assert.strictEqual(
      await readFile(join(root, "src", "framerfordevs", file.path), "utf8"),
      file.bytes,
    );
  }
  assert.strictEqual(
    await readFile(join(root, ".framerfordevs", "schema.lock.json"), "utf8"),
    generation.lockBytes,
  );
}

describe("generator filesystem transaction", () => {
  it("atomically installs and repeats one owned deterministic plan", async () => {
    const root = await temporaryDirectory();
    try {
      const generation = plan("one");
      await Effect.runPromise(commit(root, generation));
      await Effect.runPromise(commit(root, generation));

      await assertPlanInstalled(root, generation);
      assert.deepEqual(await readdir(join(root, "src")), ["framerfordevs"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps config-v2 generated ownership separate from authoring lock authority", async () => {
    const root = await temporaryDirectory();
    try {
      const authoringLock = '{"lockVersion":2,"authority":"preserve"}\n';
      await mkdir(join(root, ".framerfordevs"), { recursive: true });
      await writeFile(join(root, ".framerfordevs", "schema.lock.json"), authoringLock, "utf8");
      const generation = plan("v2");

      await Effect.runPromise(commit(root, generation, { lockFileName: "generated.lock.json" }));

      assert.strictEqual(
        await readFile(join(root, ".framerfordevs", "schema.lock.json"), "utf8"),
        authoringLock,
      );
      assert.strictEqual(
        await readFile(join(root, ".framerfordevs", "generated.lock.json"), "utf8"),
        generation.lockBytes,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects modified and unowned output unless explicit force is reviewed", async () => {
    const root = await temporaryDirectory();
    try {
      const first = plan("one");
      const second = plan("two");
      await Effect.runPromise(commit(root, first));
      const schemaPath = join(root, "src", "framerfordevs", "schema.ts");
      await writeFile(schemaPath, "// developer edit\n", "utf8");
      const modified = await Effect.runPromiseExit(commit(root, second));
      assert.strictEqual(modified._tag, "Failure");
      assert.strictEqual(await readFile(schemaPath, "utf8"), "// developer edit\n");

      await Effect.runPromise(commit(root, second, { force: true }));
      await assertPlanInstalled(root, second);

      const unownedRoot = await temporaryDirectory();
      try {
        const unownedOutput = join(unownedRoot, "src", "framerfordevs");
        await writeFile(join(unownedRoot, "placeholder"), "", "utf8");
        await mkdir(unownedOutput, { recursive: true });
        await writeFile(join(unownedOutput, "notes.txt"), "keep", "utf8");
        const unowned = await Effect.runPromiseExit(commit(unownedRoot, first));
        assert.strictEqual(unowned._tag, "Failure");
        assert.strictEqual(await readFile(join(unownedOutput, "notes.txt"), "utf8"), "keep");
      } finally {
        await rm(unownedRoot, { recursive: true, force: true });
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symbolic-link output and lock directory chains", async () => {
    const outside = await temporaryDirectory();
    const outputRoot = await temporaryDirectory();
    const lockRoot = await temporaryDirectory();
    try {
      await symlink(outside, join(outputRoot, "src"));
      await symlink(outside, join(lockRoot, ".framerfordevs"));
      const outputResult = await Effect.runPromiseExit(commit(outputRoot, plan("one")));
      const lockResult = await Effect.runPromiseExit(commit(lockRoot, plan("one")));

      assert.strictEqual(outputResult._tag, "Failure");
      assert.strictEqual(lockResult._tag, "Failure");
      assert.isFalse(await exists(join(outside, "framerfordevs")));
      assert.isFalse(await exists(join(outside, "schema.lock.json")));
    } finally {
      await rm(outside, { recursive: true, force: true });
      await rm(outputRoot, { recursive: true, force: true });
      await rm(lockRoot, { recursive: true, force: true });
    }
  });

  it("rolls back every injected commit stage to the prior directory and lock", async () => {
    const stages: ReadonlyArray<GeneratorCommitStage> = [
      "stage_directory",
      "stage_files",
      "backup_output",
      "install_output",
      "write_lock",
      "install_lock",
      "sync_commit",
    ];
    for (const stage of stages) {
      const root = await temporaryDirectory();
      try {
        const before = plan("before");
        await Effect.runPromise(commit(root, before));
        const failed = await Effect.runPromiseExit(commit(root, plan("after"), { stage }));

        assert.strictEqual(failed._tag, "Failure", stage);
        await assertPlanInstalled(root, before);
        const srcEntries = await readdir(join(root, "src"));
        assert.deepEqual(srcEntries, ["framerfordevs"], stage);
        assert.isFalse(await exists(join(root, "src", `.framerfordevs.ffd-${stage}-stage`)));
        assert.isFalse(await exists(join(root, "src", `.framerfordevs.ffd-${stage}-backup`)));
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});
