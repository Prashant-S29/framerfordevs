import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assert, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import {
  acquireContentCommand,
  acquireControlPlaneCommand,
  acquireSchemaApplyCommand,
  clearContentCommand,
  clearControlPlaneCommand,
  clearSchemaApplyCommand,
} from "./index";

it.live(
  "reuses only the exact content-free schema apply authority and clears confirmed commands",
  () =>
    Effect.acquireUseRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "ffd-retry-journal-"))),
      (root) =>
        Effect.gen(function* () {
          const fingerprint = "a".repeat(64);
          const first = yield* acquireSchemaApplyCommand(root, fingerprint);
          const replay = yield* acquireSchemaApplyCommand(root, fingerprint);
          assert.strictEqual(replay.commandId, first.commandId);
          const bytes = yield* Effect.promise(() =>
            readFile(join(root, ".framerfordevs/retry/schema-apply.json"), "utf8"),
          );
          assert.notInclude(bytes, "token");
          assert.notInclude(bytes, "collections");
          const conflict = yield* Effect.exit(acquireSchemaApplyCommand(root, "b".repeat(64)));
          assert.isTrue(Exit.isFailure(conflict));
          yield* clearSchemaApplyCommand(root, first.commandId);
          const concurrent = yield* Effect.all(
            Array.from({ length: 16 }, () => acquireSchemaApplyCommand(root, fingerprint)),
            { concurrency: "unbounded" },
          );
          assert.strictEqual(new Set(concurrent.map((item) => item.commandId)).size, 1);
          assert.notStrictEqual(concurrent[0]?.commandId, first.commandId);

          const content = yield* acquireContentCommand(root, "entry.update", "c".repeat(64));
          const contentReplay = yield* acquireContentCommand(root, "entry.update", "c".repeat(64));
          assert.strictEqual(contentReplay.commandId, content.commandId);
          const contentConflict = yield* Effect.exit(
            acquireContentCommand(root, "entry.publish", "d".repeat(64)),
          );
          assert.isTrue(Exit.isFailure(contentConflict));
          const contentBytes = yield* Effect.promise(() =>
            readFile(join(root, ".framerfordevs/retry/content-command.json"), "utf8"),
          );
          assert.notInclude(contentBytes, "title");
          assert.notInclude(contentBytes, "token");
          yield* clearContentCommand(root, content.commandId);

          const suppliedCommandId = "019fae8b-1234-7000-8000-000000000001";
          const controlPlane = yield* acquireControlPlaneCommand(
            root,
            "workspace.create",
            "e".repeat(64),
            suppliedCommandId,
          );
          const controlPlaneReplay = yield* acquireControlPlaneCommand(
            root,
            "workspace.create",
            "e".repeat(64),
            suppliedCommandId,
          );
          assert.strictEqual(controlPlaneReplay.commandId, suppliedCommandId);
          assert.strictEqual(controlPlane.commandId, suppliedCommandId);
          const controlPlaneBytes = yield* Effect.promise(() =>
            readFile(join(root, ".framerfordevs/retry/control-plane-command.json"), "utf8"),
          );
          assert.notInclude(controlPlaneBytes, "Workspace name");
          assert.notInclude(controlPlaneBytes, "token");
          const controlPlaneConflict = yield* Effect.exit(
            acquireControlPlaneCommand(root, "project.create", "f".repeat(64)),
          );
          assert.isTrue(Exit.isFailure(controlPlaneConflict));
          yield* clearControlPlaneCommand(root, controlPlane.commandId);
        }),
      (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
    ),
);
