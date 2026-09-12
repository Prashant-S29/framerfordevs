// Adapts explicit noninteractive CLI flags to the closed Control Plane HTTP client.

import { Effect, Schema } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "../canonical";
import { booleanFlag, stringFlag, type ParsedArguments } from "../command-arguments";
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
    | "studio_registration.put";
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

export function executeControlPlaneCommand(options: {
  readonly arguments: ParsedArguments;
  readonly apiOrigin: string;
  readonly token: string;
  readonly root: string;
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
