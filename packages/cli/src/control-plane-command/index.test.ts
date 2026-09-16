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

it.live(
  "executes the complete governance and locale command matrix without secret-bearing arguments",
  () =>
    Effect.acquireUseRelease(
      Effect.map(
        Effect.promise(() => mkdtemp(join(tmpdir(), "ffd-governance-command-"))),
        (root) => ({ root, originalFetch: globalThis.fetch }),
      ),
      ({ root }) =>
        Effect.gen(function* () {
          const project = {
            id: "019fae8b-1234-7000-8000-000000000010",
            workspaceId: workspace.id,
            name: "Project",
            key: "project",
            description: null,
            version: 1,
            status: "active",
            archivedAt: null,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
            primaryEnvironment: {
              id: "019fae8b-1234-7000-8000-000000000011",
              key: "main",
              name: "main",
              isPrimary: true,
              createdAt: workspace.createdAt,
            },
            capabilities: [],
            effectiveActions: ["project.read"],
          };
          const locale = {
            id: "019fae8b-1234-7000-8000-000000000012",
            workspaceId: workspace.id,
            projectId: project.id,
            tag: "en",
            displayName: "English",
            status: "enabled",
            position: 0,
            version: 1,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
          };
          const member = {
            id: "019fae8b-1234-7000-8000-000000000013",
            projectId: project.id,
            userId: "user-1",
            name: "Owner",
            email: "owner@example.test",
            role: "owner",
            localeAccess: { mode: "all" },
            version: 1,
            removedAt: null,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
          };
          const invitation = {
            id: "019fae8b-1234-7000-8000-000000000014",
            projectId: project.id,
            email: "invitee@example.test",
            role: "editor",
            localeAccess: { mode: "selected", localeIds: [locale.id] },
            status: "pending",
            version: 1,
            expiresAt: "2026-08-21T00:00:00.000Z",
            acceptedAt: null,
            revokedAt: null,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
          };
          const roleNames = [
            "owner",
            "developer",
            "content_admin",
            "editor",
            "reviewer",
            "client_editor",
            "read_only",
          ];
          const governance = {
            projectId: project.id,
            primaryEnvironment: project.primaryEnvironment,
            role: "owner",
            localeAccess: { mode: "all" },
            baseRoleActions: ["project.read"],
            effectiveProjectActions: ["project.read"],
            effectiveLocaleIds: [locale.id],
            effectiveLocaleActions: ["content.read"],
            fixedRolePolicies: roleNames.map((role) => ({
              role,
              baseRoleActions: ["project.read"],
              requiresAllLocales: role === "owner",
            })),
            canReadMembers: true,
            canInviteMembers: true,
            canUpdateMemberPolicy: true,
            canRemoveMembers: true,
          };
          const observed: Array<{
            readonly method: string;
            readonly path: string;
            readonly body: string;
          }> = [];
          globalThis.fetch = (input, init) => {
            const url = new URL(String(input));
            observed.push({
              method: init?.method ?? "GET",
              path: url.pathname,
              body: String(init?.body ?? ""),
            });
            if (url.pathname.endsWith("/governance")) return Promise.resolve(success(governance));
            if (url.pathname.endsWith("/members"))
              return Promise.resolve(success({ items: [member], nextCursor: null }));
            if (url.pathname.includes("/members/")) return Promise.resolve(success(member));
            if (url.pathname.endsWith("/invitations")) {
              return Promise.resolve(
                success(
                  init?.method === "POST"
                    ? { invitation, token: "a".repeat(43) }
                    : { items: [invitation], nextCursor: null },
                ),
              );
            }
            if (url.pathname.endsWith("/invitations/inspect")) {
              return Promise.resolve(
                success({
                  projectId: project.id,
                  projectName: project.name,
                  role: invitation.role,
                  localeAccess: invitation.localeAccess,
                  inviterName: member.name,
                  expiresAt: invitation.expiresAt,
                }),
              );
            }
            if (url.pathname.endsWith("/invitations/accept"))
              return Promise.resolve(success(member));
            if (url.pathname.includes("/invitations/")) return Promise.resolve(success(invitation));
            if (url.pathname.endsWith("/locales")) {
              return Promise.resolve(
                success(init?.method === "POST" ? locale : { items: [locale] }),
              );
            }
            if (url.pathname.includes("/locales/order"))
              return Promise.resolve(success({ items: [locale] }));
            if (url.pathname.includes("/locales/")) return Promise.resolve(success(locale));
            if (url.pathname.endsWith(`/projects/${project.id}`))
              return Promise.resolve(success(project));
            return Promise.reject(new Error(`Unexpected path: ${url.pathname}`));
          };

          const common = { apiOrigin: "https://api.example.test", token: "oauth-token", root };
          const commands: ReadonlyArray<ReadonlyArray<string>> = [
            ["governance", "inspect", "--project", project.id],
            ["member", "list", "--project", project.id, "--role", "owner", "--search", "own"],
            [
              "member",
              "policy",
              "set",
              "--project",
              project.id,
              "--member",
              member.id,
              "--expected-version",
              "1",
              "--role",
              "editor",
              "--locale-access",
              "selected",
              "--locale",
              locale.id,
            ],
            [
              "member",
              "remove",
              "--project",
              project.id,
              "--member",
              member.id,
              "--expected-version",
              "1",
            ],
            ["invitation", "list", "--project", project.id, "--status", "pending"],
            [
              "invitation",
              "create",
              "--project",
              project.id,
              "--email",
              invitation.email,
              "--role",
              "editor",
              "--locale-access",
              "selected",
              "--locale",
              locale.id,
            ],
            ["invitation", "inspect", "--token-stdin"],
            ["invitation", "accept", "--token-stdin"],
            [
              "invitation",
              "revoke",
              "--project",
              project.id,
              "--invitation",
              invitation.id,
              "--expected-version",
              "1",
            ],
            ["locale", "list", "--project", project.id, "--view", "settings", "--include-removed"],
            [
              "locale",
              "create",
              "--project",
              project.id,
              "--tag",
              "en",
              "--display-name",
              "English",
            ],
            [
              "locale",
              "update",
              "--project",
              project.id,
              "--locale",
              locale.id,
              "--expected-version",
              "1",
              "--display-name",
              "English",
            ],
            ["locale", "reorder", "--project", project.id, "--item", `${locale.id}:1`],
            [
              "locale",
              "status",
              "set",
              "--project",
              project.id,
              "--locale",
              locale.id,
              "--expected-version",
              "1",
              "--status",
              "enabled",
            ],
            ["project", "environment", "get", "--project", project.id],
          ];
          for (const command of commands) {
            yield* executeControlPlaneCommand({
              ...common,
              arguments: parseArguments([...command, "--api", common.apiOrigin]),
              readInvitationToken: () => Effect.succeed("a".repeat(43)),
            });
          }

          assert.lengthOf(observed, commands.length);
          assert.isTrue(observed.every((request) => !request.path.includes("a".repeat(43))));
          assert.isTrue(
            observed
              .filter(
                (request) =>
                  request.path.endsWith("/invitations/inspect") ||
                  request.path.endsWith("/invitations/accept"),
              )
              .every((request) => request.body === JSON.stringify({ token: "a".repeat(43) })),
          );
        }),
      ({ root, originalFetch }) =>
        Effect.sync(() => {
          globalThis.fetch = originalFetch;
        }).pipe(Effect.zipRight(Effect.promise(() => rm(root, { recursive: true, force: true })))),
    ),
);
