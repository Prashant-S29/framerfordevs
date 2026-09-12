import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { assert, it } from "@effect/vitest";
import { Effect } from "effect";

import { parseArguments } from "../command-arguments";
import {
  decodeControlPlaneApiOrigin,
  executeControlPlaneCommand,
  verifyControlPlaneLinkAuthority,
} from "./index";

const workspace = {
  id: "019fae8b-1234-7000-8000-000000000001",
  name: "Workspace",
  version: 1,
  role: "owner",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

function success(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Success." }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function commandConflict() {
  return new Response(
    JSON.stringify({
      ok: false,
      data: null,
      error: {
        code: "COMMAND_CONFLICT",
        message: "The command identifier has already been used with different input.",
        retryable: false,
        requestId: "request-conflict",
      },
      message: "The command identifier has already been used with different input.",
    }),
    { status: 409, headers: { "content-type": "application/json" } },
  );
}

it.effect("verifies exact active project, environment, and CMS link authority", () =>
  Effect.gen(function* () {
    const project = {
      id: "019fae8b-1234-7000-8000-000000000010",
      workspaceId: workspace.id,
      status: "active" as const,
      primaryEnvironment: {
        id: "019fae8b-1234-7000-8000-000000000011",
        key: "main" as const,
      },
      capabilities: [{ key: "cms" as const, status: "enabled" }],
    };
    const verified = yield* verifyControlPlaneLinkAuthority(project, project.id, "main");
    assert.strictEqual(verified.project.id, project.id);
    assert.strictEqual(verified.cmsStatus, "enabled");
    assert.strictEqual(
      (yield* Effect.flip(verifyControlPlaneLinkAuthority(project, workspace.id, "main"))).message,
      "CLI_LINK_AUTHORITY_INVALID",
    );
  }),
);

it.effect("accepts only an explicit canonical API origin", () =>
  Effect.gen(function* () {
    assert.strictEqual(
      yield* decodeControlPlaneApiOrigin("https://api.example.test"),
      "https://api.example.test",
    );
    assert.strictEqual(
      (yield* Effect.flip(decodeControlPlaneApiOrigin("https://api.example.test/path"))).message,
      "CLI_API_INVALID",
    );
    assert.strictEqual(
      (yield* Effect.flip(decodeControlPlaneApiOrigin("http://api.example.test"))).message,
      "CLI_API_INVALID",
    );
  }),
);

it.live("clears a receipt journal after a deterministic HTTP failure", () =>
  Effect.acquireUseRelease(
    Effect.map(
      Effect.promise(() => mkdtemp(join(tmpdir(), "ffd-control-plane-command-failure-"))),
      (root) => ({ root, originalFetch: globalThis.fetch }),
    ),
    ({ root }) =>
      Effect.gen(function* () {
        let attempt = 0;
        globalThis.fetch = () =>
          Promise.resolve(
            attempt++ === 0 ? commandConflict() : success({ workspace, replayed: false }),
          );
        const options = {
          arguments: parseArguments([
            "workspace",
            "create",
            "--api",
            "https://api.example.test",
            "--name",
            "Conflicting workspace",
          ]),
          apiOrigin: "https://api.example.test",
          token: "oauth-token",
          root,
        };

        const conflict = yield* Effect.exit(executeControlPlaneCommand(options));
        assert.strictEqual(conflict._tag, "Failure");
        const cleared = yield* Effect.promise(() =>
          readFile(join(root, ".framerfordevs/retry/control-plane-command.json"), "utf8").then(
            () => false,
            () => true,
          ),
        );
        assert.isTrue(cleared);

        const unrelated = yield* executeControlPlaneCommand({
          ...options,
          arguments: parseArguments([
            "workspace",
            "create",
            "--api",
            "https://api.example.test",
            "--name",
            "Unrelated workspace",
          ]),
        });
        assert.strictEqual(Reflect.get(unrelated, "replayed"), false);
      }),
    ({ root, originalFetch }) =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      }).pipe(Effect.zipRight(Effect.promise(() => rm(root, { recursive: true, force: true })))),
  ),
);

it.live("reuses a journaled Control Plane command after an ambiguous response", () =>
  Effect.acquireUseRelease(
    Effect.map(
      Effect.promise(() => mkdtemp(join(tmpdir(), "ffd-control-plane-command-"))),
      (root) => ({ root, originalFetch: globalThis.fetch }),
    ),
    ({ root }) =>
      Effect.gen(function* () {
        const commandIds: Array<string> = [];
        let attempt = 0;
        const fetchImplementation: typeof fetch = (_input, init) => {
          attempt += 1;
          const parsed: unknown = JSON.parse(String(init?.body));
          if (typeof parsed === "object" && parsed !== null) {
            const commandId = Reflect.get(parsed, "commandId");
            if (typeof commandId === "string") commandIds.push(commandId);
          }
          return attempt === 1
            ? Promise.reject(new Error("response lost"))
            : Promise.resolve(success({ workspace, replayed: true }));
        };
        globalThis.fetch = fetchImplementation;
        const arguments_ = parseArguments([
          "workspace",
          "create",
          "--api",
          "https://api.example.test",
          "--name",
          "Workspace",
        ]);
        const options = {
          arguments: arguments_,
          apiOrigin: "https://api.example.test",
          token: "oauth-token",
          root,
        };
        const first = yield* Effect.exit(executeControlPlaneCommand(options));
        assert.strictEqual(first._tag, "Failure");
        const journalBytes = yield* Effect.promise(() =>
          readFile(join(root, ".framerfordevs/retry/control-plane-command.json"), "utf8"),
        );
        assert.notInclude(journalBytes, "Workspace");
        assert.notInclude(journalBytes, "oauth-token");

        const replay = yield* executeControlPlaneCommand(options);
        assert.strictEqual(Reflect.get(replay, "replayed"), true);
        assert.lengthOf(commandIds, 2);
        assert.strictEqual(commandIds[1], commandIds[0]);
        const cleared = yield* Effect.promise(() =>
          readFile(join(root, ".framerfordevs/retry/control-plane-command.json"), "utf8").then(
            () => false,
            () => true,
          ),
        );
        assert.isTrue(cleared);
      }),
    ({ root, originalFetch }) =>
      Effect.sync(() => {
        globalThis.fetch = originalFetch;
      }).pipe(Effect.zipRight(Effect.promise(() => rm(root, { recursive: true, force: true })))),
  ),
);
