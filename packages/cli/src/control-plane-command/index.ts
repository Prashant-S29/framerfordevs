// Adapts explicit noninteractive CLI flags to the closed Control Plane HTTP client.

import { Effect, Schema } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "../canonical";
import { booleanFlag, stringFlag, stringFlags, type ParsedArguments } from "../command-arguments";
import { makeControlPlaneHttpClient } from "../control-plane-http-client";
import { ControlPlaneHttpError } from "../errors";
import { acquireControlPlaneCommand, clearControlPlaneCommand } from "../retry-journal";

const positiveIntegerPattern = /^[1-9]\d*$/u;
const controlPlaneCommands = new Set([
  "workspace list",
  "workspace get",
  "workspace create",
  "project list",
  "project get",
  "project create",
  "project update",
  "project archive",
  "project restore",
  "project capabilities",
  "project capability enable",
  "studio registration get",
  "studio registration set",
  "governance inspect",
  "member list",
  "member policy set",
  "member remove",
  "invitation list",
  "invitation create",
  "invitation inspect",
  "invitation accept",
  "invitation revoke",
  "locale list",
  "locale create",
  "locale update",
  "locale reorder",
  "locale status set",
  "project environment get",
]);

export function isControlPlaneCommand(command: string): boolean {
  return controlPlaneCommands.has(command);
}

export interface ControlPlaneLinkProject {
  readonly id: string;
  readonly workspaceId: string;
  readonly status: "active" | "archived";
  readonly primaryEnvironment: { readonly id: string; readonly key: "main" };
  readonly capabilities: ReadonlyArray<{ readonly key: "cms"; readonly status: string }>;
}

export function verifyControlPlaneLinkAuthority(
  project: ControlPlaneLinkProject,
  expectedProjectId: string,
  expectedEnvironment: string,
) {
  const cms = project.capabilities.find((capability) => capability.key === "cms");
  return project.id === expectedProjectId &&
    project.status === "active" &&
    project.primaryEnvironment.key === expectedEnvironment &&
    cms?.status === "enabled"
    ? Effect.succeed({ project, cmsStatus: "enabled" })
    : Effect.fail(new Error("CLI_LINK_AUTHORITY_INVALID"));
}

export function decodeControlPlaneApiOrigin(value: string) {
  return Effect.try({
    try: () => {
      const url = new URL(value);
      const loopbackHttp =
        url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        (url.protocol !== "https:" && !loopbackHttp) ||
        url.username !== "" ||
        url.password !== "" ||
        (url.pathname !== "/" && url.pathname !== "") ||
        url.search !== "" ||
        url.hash !== "" ||
        url.origin !== value
      ) {
        throw new Error("Invalid Control Plane API origin.");
      }
      return url.origin;
    },
    catch: () => new Error("CLI_API_INVALID"),
  });
}

function requiredFlag(arguments_: ParsedArguments, name: string): Effect.Effect<string, Error> {
  const value = stringFlag(arguments_, name);
  return value === undefined || value.length === 0
    ? Effect.fail(new Error(`CLI_${name.toUpperCase().replaceAll("-", "_")}_REQUIRED`))
    : Effect.succeed(value);
}

function positiveIntegerFlag(
  arguments_: ParsedArguments,
  name: string,
  fallback?: number,
): Effect.Effect<number, Error> {
  const value = stringFlag(arguments_, name);
  if (value === undefined && fallback !== undefined) return Effect.succeed(fallback);
  if (value === undefined || !positiveIntegerPattern.test(value)) {
    return Effect.fail(new Error(`CLI_${name.toUpperCase().replaceAll("-", "_")}_INVALID`));
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Effect.succeed(parsed)
    : Effect.fail(new Error(`CLI_${name.toUpperCase().replaceAll("-", "_")}_INVALID`));
}

function optionalCommandId(arguments_: ParsedArguments) {
  const value = stringFlag(arguments_, "command-id");
  if (value === undefined) return Effect.succeed(undefined);
  return Schema.decodeUnknown(Schema.UUID)(value).pipe(
    Effect.mapError(() => new Error("CLI_COMMAND_ID_INVALID")),
  );
}

function mutationFingerprint(operation: string, input: unknown): string {
  return sha256(canonicalJsonBytes(toJsonValue({ operation, input })));
}

function receiptMutation<A, E, R>(options: {
  readonly root: string;
  readonly operation:
    | "workspace.create"
    | "project.create"
    | "project.capability.enable"
    | "studio_registration.put"
    | "project_locale.create";
  readonly suppliedCommandId: string | undefined;
  readonly input: unknown;
  readonly execute: (commandId: string) => Effect.Effect<A, E, R>;
}) {
  return Effect.gen(function* () {
    const journal = yield* acquireControlPlaneCommand(
      options.root,
      options.operation,
      mutationFingerprint(options.operation, options.input),
      options.suppliedCommandId,
    );
    const result = yield* options
      .execute(journal.commandId)
      .pipe(
        Effect.tapError((error) =>
          error instanceof ControlPlaneHttpError && !error.retryable
            ? clearControlPlaneCommand(options.root, journal.commandId)
            : Effect.void,
        ),
      );
    yield* clearControlPlaneCommand(options.root, journal.commandId);
    return result;
  });
}

const projectRoles = new Set([
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
]);

function projectRoleFlag(arguments_: ParsedArguments) {
  return Effect.flatMap(requiredFlag(arguments_, "role"), (role) =>
    projectRoles.has(role) ? Effect.succeed(role) : Effect.fail(new Error("CLI_ROLE_INVALID")),
  );
}

function localeAccessFlag(arguments_: ParsedArguments) {
  return Effect.gen(function* () {
    const mode = yield* requiredFlag(arguments_, "locale-access");
    const localeIds = stringFlags(arguments_, "locale");
    if (new Set(localeIds).size !== localeIds.length) {
      return yield* Effect.fail(new Error("CLI_LOCALE_DUPLICATE"));
    }
    if (mode === "selected" && localeIds.length > 0) {
      return { mode, localeIds } as const;
    }
    if ((mode === "all" || mode === "none") && localeIds.length === 0) {
      return { mode } as const;
    }
    return yield* Effect.fail(new Error("CLI_LOCALE_ACCESS_INVALID"));
  });
}

function reorderItems(arguments_: ParsedArguments) {
  const values = stringFlags(arguments_, "item");
  if (values.length === 0) return Effect.fail(new Error("CLI_ITEM_REQUIRED"));
  const items: Array<{ readonly localeId: string; readonly expectedVersion: number }> = [];
  const seen = new Set<string>();
  for (const value of values) {
    const separator = value.lastIndexOf(":");
    const localeId = separator < 0 ? "" : value.slice(0, separator);
    const version = separator < 0 ? "" : value.slice(separator + 1);
    if (
      localeId.length === 0 ||
      !positiveIntegerPattern.test(version) ||
      seen.has(localeId) ||
      !Number.isSafeInteger(Number(version))
    ) {
      return Effect.fail(new Error("CLI_ITEM_INVALID"));
    }
    seen.add(localeId);
    items.push({ localeId, expectedVersion: Number(version) });
  }
  return Effect.succeed(items);
}

function readBoundedInvitationToken() {
  return Effect.tryPromise({
    try: async () => {
      if (process.stdin.isTTY) throw new Error("CLI_TOKEN_STDIN_REQUIRED");
      process.stdin.setEncoding("utf8");
      let value = "";
      for await (const chunk of process.stdin) {
        value += chunk;
        if (Buffer.byteLength(value, "utf8") > 128) throw new Error("CLI_TOKEN_STDIN_INVALID");
      }
      const token = value.replace(/\r?\n$/u, "");
      if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw new Error("CLI_TOKEN_STDIN_INVALID");
      return token;
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error("CLI_TOKEN_STDIN_INVALID")),
  });
}

export function executeControlPlaneCommand(options: {
  readonly arguments: ParsedArguments;
  readonly apiOrigin: string;
  readonly token: string;
  readonly root: string;
  readonly readInvitationToken?: () => Effect.Effect<string, Error>;
}) {
  const arguments_ = options.arguments;
  const command = arguments_.command.join(" ");
  const client = makeControlPlaneHttpClient({ baseUrl: options.apiOrigin, token: options.token });

  return Effect.gen(function* () {
    if (command === "workspace list") {
      const limit = yield* positiveIntegerFlag(arguments_, "limit", 20);
      return {
        command,
        ...(yield* client.listWorkspaces(stringFlag(arguments_, "cursor") ?? null, limit)),
      };
    }
    if (command === "workspace get") {
      const workspaceId = yield* requiredFlag(arguments_, "workspace");
      return { command, workspace: yield* client.getWorkspace(workspaceId) };
    }
    if (command === "workspace create") {
      const name = yield* requiredFlag(arguments_, "name");
      const suppliedCommandId = yield* optionalCommandId(arguments_);
      const result = yield* receiptMutation({
        root: options.root,
        operation: "workspace.create",
        suppliedCommandId,
        input: { name },
        execute: (commandId) => client.createWorkspace({ commandId, name }),
      });
      return { command, ...result };
    }
    if (command === "project list") {
      const workspaceId = yield* requiredFlag(arguments_, "workspace");
      const status = stringFlag(arguments_, "status") ?? "active";
      if (status !== "active" && status !== "archived") {
        return yield* Effect.fail(new Error("CLI_STATUS_INVALID"));
      }
      const limit = yield* positiveIntegerFlag(arguments_, "limit", 20);
      return {
        command,
        ...(yield* client.listProjects(
          workspaceId,
          status,
          stringFlag(arguments_, "cursor") ?? null,
          limit,
        )),
      };
    }
    if (command === "project get") {
      const projectId = yield* requiredFlag(arguments_, "project");
      return { command, project: yield* client.getProject(projectId) };
    }
    if (command === "project create") {
      const workspaceId = yield* requiredFlag(arguments_, "workspace");
      const name = yield* requiredFlag(arguments_, "name");
      const key = yield* requiredFlag(arguments_, "key");
      const description = stringFlag(arguments_, "description") ?? null;
      const initialCapabilities: ReadonlyArray<"cms"> = booleanFlag(arguments_, "enable-cms")
        ? ["cms"]
        : [];
      const suppliedCommandId = yield* optionalCommandId(arguments_);
      const input = { workspaceId, name, key, description, initialCapabilities };
      const result = yield* receiptMutation({
        root: options.root,
        operation: "project.create",
        suppliedCommandId,
        input,
        execute: (commandId) =>
          client.createProject(workspaceId, {
            commandId,
            name,
            key,
            description,
            initialCapabilities,
          }),
      });
      return { command, ...result };
    }
    if (command === "project update") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      const name = yield* requiredFlag(arguments_, "name");
      const descriptionValue = stringFlag(arguments_, "description");
      const clearDescription = booleanFlag(arguments_, "clear-description");
      if (descriptionValue !== undefined && clearDescription) {
        return yield* Effect.fail(new Error("CLI_DESCRIPTION_FLAGS_INVALID"));
      }
      const description = clearDescription
        ? null
        : (descriptionValue ?? (yield* client.getProject(projectId)).description);
      const project = yield* client.updateProject(projectId, {
        expectedVersion,
        name,
        description,
      });
      return { command, project };
    }
    if (command === "project archive") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      const confirmKey = yield* requiredFlag(arguments_, "confirm-key");
      const current = yield* client.getProject(projectId);
      if (current.key !== confirmKey)
        return yield* Effect.fail(new Error("CLI_CONFIRM_KEY_INVALID"));
      return {
        command,
        project: yield* client.archiveProject(projectId, { expectedVersion }),
      };
    }
    if (command === "project restore") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      return {
        command,
        project: yield* client.restoreProject(projectId, { expectedVersion }),
      };
    }
    if (command === "project capabilities") {
      const projectId = yield* requiredFlag(arguments_, "project");
      return { command, ...(yield* client.listCapabilities(projectId)) };
    }
    if (command === "project capability enable") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const capability = yield* requiredFlag(arguments_, "capability");
      if (capability !== "cms") return yield* Effect.fail(new Error("CLI_CAPABILITY_INVALID"));
      const suppliedCommandId = yield* optionalCommandId(arguments_);
      const result = yield* receiptMutation({
        root: options.root,
        operation: "project.capability.enable",
        suppliedCommandId,
        input: { projectId, capability },
        execute: (commandId) => client.enableCmsCapability(projectId, { commandId }),
      });
      return { command, ...result };
    }
    if (command === "governance inspect") {
      const projectId = yield* requiredFlag(arguments_, "project");
      return { command, governance: yield* client.getGovernance(projectId) };
    }
    if (command === "member list") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const role = stringFlag(arguments_, "role") ?? null;
      if (role !== null && !projectRoles.has(role)) {
        return yield* Effect.fail(new Error("CLI_ROLE_INVALID"));
      }
      const limit = yield* positiveIntegerFlag(arguments_, "limit", 20);
      return {
        command,
        ...(yield* client.listMembers(
          projectId,
          role,
          stringFlag(arguments_, "search") ?? null,
          stringFlag(arguments_, "cursor") ?? null,
          limit,
        )),
      };
    }
    if (command === "member policy set") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const memberId = yield* requiredFlag(arguments_, "member");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      const role = yield* projectRoleFlag(arguments_);
      const localeAccess = yield* localeAccessFlag(arguments_);
      return {
        command,
        member: yield* client.updateMemberPolicy(projectId, memberId, {
          expectedVersion,
          role,
          localeAccess,
        }),
      };
    }
    if (command === "member remove") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const memberId = yield* requiredFlag(arguments_, "member");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      return {
        command,
        member: yield* client.removeMember(projectId, memberId, { expectedVersion }),
      };
    }
    if (command === "invitation list") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const status = stringFlag(arguments_, "status") ?? "all";
      if (!["all", "pending", "accepted", "revoked", "expired"].includes(status)) {
        return yield* Effect.fail(new Error("CLI_STATUS_INVALID"));
      }
      const limit = yield* positiveIntegerFlag(arguments_, "limit", 20);
      return {
        command,
        ...(yield* client.listInvitations(
          projectId,
          status,
          stringFlag(arguments_, "search") ?? null,
          stringFlag(arguments_, "cursor") ?? null,
          limit,
        )),
      };
    }
    if (command === "invitation create") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const email = yield* requiredFlag(arguments_, "email");
      const role = yield* projectRoleFlag(arguments_);
      const localeAccess = yield* localeAccessFlag(arguments_);
      return {
        command,
        ...(yield* client.createInvitation(projectId, { email, role, localeAccess })),
      };
    }
    if (command === "invitation inspect" || command === "invitation accept") {
      if (!booleanFlag(arguments_, "token-stdin")) {
        return yield* Effect.fail(new Error("CLI_TOKEN_STDIN_REQUIRED"));
      }
      const token = yield* options.readInvitationToken?.() ?? readBoundedInvitationToken();
      return command === "invitation inspect"
        ? { command, invitation: yield* client.inspectInvitation(token) }
        : { command, member: yield* client.acceptInvitation(token) };
    }
    if (command === "invitation revoke") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const invitationId = yield* requiredFlag(arguments_, "invitation");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      return {
        command,
        invitation: yield* client.revokeInvitation(projectId, invitationId, {
          expectedVersion,
        }),
      };
    }
    if (command === "locale list") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const view = stringFlag(arguments_, "view") ?? "effective";
      if (view !== "effective" && view !== "settings") {
        return yield* Effect.fail(new Error("CLI_VIEW_INVALID"));
      }
      return {
        command,
        ...(yield* client.listLocales(projectId, view, booleanFlag(arguments_, "include-removed"))),
      };
    }
    if (command === "locale create") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const tag = yield* requiredFlag(arguments_, "tag");
      const displayName = yield* requiredFlag(arguments_, "display-name");
      const suppliedCommandId = yield* optionalCommandId(arguments_);
      const result = yield* receiptMutation({
        root: options.root,
        operation: "project_locale.create",
        suppliedCommandId,
        input: { projectId, tag, displayName },
        execute: (commandId) => client.createLocale(projectId, { commandId, tag, displayName }),
      });
      return { command, locale: result };
    }
    if (command === "locale update") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const localeId = yield* requiredFlag(arguments_, "locale");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      const displayName = yield* requiredFlag(arguments_, "display-name");
      return {
        command,
        locale: yield* client.updateLocale(projectId, localeId, {
          expectedVersion,
          displayName,
        }),
      };
    }
    if (command === "locale reorder") {
      const projectId = yield* requiredFlag(arguments_, "project");
      return {
        command,
        ...(yield* client.reorderLocales(projectId, {
          locales: yield* reorderItems(arguments_),
        })),
      };
    }
    if (command === "locale status set") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const localeId = yield* requiredFlag(arguments_, "locale");
      const expectedVersion = yield* positiveIntegerFlag(arguments_, "expected-version");
      const status = yield* requiredFlag(arguments_, "status");
      if (status !== "enabled" && status !== "disabled" && status !== "removed") {
        return yield* Effect.fail(new Error("CLI_STATUS_INVALID"));
      }
      return {
        command,
        locale: yield* client.updateLocaleStatus(projectId, localeId, {
          expectedVersion,
          status,
          confirmDraftImpact: booleanFlag(arguments_, "confirm-draft-impact"),
        }),
      };
    }
    if (command === "project environment get") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const project = yield* client.getProject(projectId);
      return { command, environment: project.primaryEnvironment };
    }
    if (command === "studio registration get") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const environmentId = yield* requiredFlag(arguments_, "environment-id");
      return {
        command,
        registration: yield* client.getStudioRegistration(projectId, environmentId),
      };
    }
    if (command === "studio registration set") {
      const projectId = yield* requiredFlag(arguments_, "project");
      const environmentId = yield* requiredFlag(arguments_, "environment-id");
      const applicationOrigin = yield* requiredFlag(arguments_, "origin");
      const mountPath = yield* requiredFlag(arguments_, "path");
      const expectedVersionValue = stringFlag(arguments_, "expected-version");
      const expectedVersion =
        expectedVersionValue === undefined
          ? null
          : yield* positiveIntegerFlag(arguments_, "expected-version");
      const suppliedCommandId = yield* optionalCommandId(arguments_);
      const input = { projectId, environmentId, expectedVersion, applicationOrigin, mountPath };
      const result = yield* receiptMutation({
        root: options.root,
        operation: "studio_registration.put",
        suppliedCommandId,
        input,
        execute: (commandId) =>
          client.putStudioRegistration(projectId, environmentId, {
            commandId,
            expectedVersion,
            applicationOrigin,
            mountPath,
          }),
      });
      return { command, ...result };
    }
    return yield* Effect.fail(new Error("CLI_COMMAND_INVALID"));
  });
}
