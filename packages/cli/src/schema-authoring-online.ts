// Loads credential and network authority only after local schema extraction has succeeded.

import type { ProjectSchema } from "@framerfordevs/schema";
import { authoringV1 } from "@framerfordevs/sdk/authoring";
import { Effect, ManagedRuntime } from "effect";

import { writeAuthoringSchemaLock } from "./authoring-schema-files";
import { canonicalJsonBytes, sha256, toJsonValue } from "./canonical";
import { CredentialStore, CredentialStoreLive } from "./credential-store";
import { getValidAccessToken } from "./oauth-device";
import { acquireSchemaApplyCommand, clearSchemaApplyCommand } from "./retry-journal";
import type { CliConfigV2 } from "./schema";
import { makeToolingHttpClient } from "./tooling-http-client";

function planCommand(): "schema plan" {
  return "schema plan";
}

function invalidPlanDecision(): {
  readonly command: "schema push";
  readonly accepted: false;
  readonly stage: "plan";
} {
  return { command: "schema push", accepted: false, stage: "plan" };
}

function acknowledgementDecision(): {
  readonly command: "schema push";
  readonly accepted: false;
  readonly stage: "acknowledgements";
} {
  return { command: "schema push", accepted: false, stage: "acknowledgements" };
}

function appliedDecision(): {
  readonly command: "schema push";
  readonly accepted: true;
  readonly stage: "applied";
} {
  return { command: "schema push", accepted: true, stage: "applied" };
}

function tokenForOrigin(apiOrigin: string) {
  const management = process.env["FFD_MANAGEMENT_TOKEN"];
  return management !== undefined && management.length > 0
    ? Effect.succeed(management)
    : getValidAccessToken({ apiOrigin });
}

function resolveEnvironmentId(
  client: ReturnType<typeof makeToolingHttpClient>,
  projectId: string,
  environmentKey: string,
) {
  return client
    .getManifestPage(projectId, environmentKey, null, 1)
    .pipe(Effect.map((manifest) => manifest.environmentId));
}

const clientAuthority = Effect.fn("cli.authoring.authority.resolve")(function* (
  config: CliConfigV2,
) {
  const token = yield* tokenForOrigin(config.apiBaseUrl);
  const tooling = makeToolingHttpClient({ baseUrl: config.apiBaseUrl, token });
  const environmentId = yield* resolveEnvironmentId(tooling, config.projectId, config.environment);
  return {
    environmentId,
    client: authoringV1({
      baseUrl: config.apiBaseUrl,
      token,
      projectId: config.projectId,
      environmentId,
    }),
  };
});

function request<A>(operation: () => Promise<A>) {
  return Effect.tryPromise({
    try: operation,
    catch: (cause) => new Error(`CLI_AUTHORING_TRANSPORT:${String(cause)}`),
  });
}

const exportOnline = Effect.fn("cli.authoring.schema.export")(function* (config: CliConfigV2) {
  const authority = yield* clientAuthority(config);
  const response = yield* request(() => authority.client.schema.export());
  if (response.body === null) return yield* Effect.fail(new Error("CLI_AUTHORING_RESPONSE_EMPTY"));
  if (!response.body.ok)
    return yield* Effect.fail(new Error(`CLI_AUTHORING_HTTP_${response.body.error.code}`));
  return { environmentId: authority.environmentId, exported: response.body.data };
});

const planOnline = Effect.fn("cli.authoring.schema.plan")(function* (input: {
  readonly config: CliConfigV2;
  readonly project: ProjectSchema;
  readonly projectSha256: string;
}) {
  const authority = yield* clientAuthority(input.config);
  const response = yield* request(() => authority.client.schema.plan({ project: input.project }));
  if (response.body === null) return yield* Effect.fail(new Error("CLI_AUTHORING_RESPONSE_EMPTY"));
  if (!response.body.ok)
    return yield* Effect.fail(new Error(`CLI_AUTHORING_HTTP_${response.body.error.code}`));
  const plan = response.body.data;
  const command = planCommand();
  return {
    command,
    accepted: plan.valid,
    projectSha256: input.projectSha256,
    environmentId: authority.environmentId,
    current: plan.current,
    planHash: plan.planHash,
    changes: plan.changes,
    candidates: plan.candidates,
    issues: plan.issues,
  };
});

const pushOnline = Effect.fn("cli.authoring.schema.push")(function* (input: {
  readonly config: CliConfigV2;
  readonly projectRoot: string;
  readonly schemaPath: string;
  readonly project: ProjectSchema;
  readonly projectSha256: string;
  readonly acknowledgedChangeIds: ReadonlyArray<string>;
}) {
  const authority = yield* clientAuthority(input.config);
  const planResponse = yield* request(() =>
    authority.client.schema.plan({ project: input.project }),
  );
  if (planResponse.body === null)
    return yield* Effect.fail(new Error("CLI_AUTHORING_RESPONSE_EMPTY"));
  if (!planResponse.body.ok)
    return yield* Effect.fail(new Error(`CLI_AUTHORING_HTTP_${planResponse.body.error.code}`));
  const plan = planResponse.body.data;
  if (!plan.valid) {
    const requiredAcknowledgements: ReadonlyArray<string> = [];
    return {
      ...invalidPlanDecision(),
      projectSha256: input.projectSha256,
      planHash: null,
      issues: plan.issues,
      requiredAcknowledgements,
      providedAcknowledgements: input.acknowledgedChangeIds,
    };
  }
  const required = plan.changes
    .filter((change) => change.classification !== "non_breaking")
    .map((change) => change.changeId)
    .sort();
  const provided = [...input.acknowledgedChangeIds].sort();
  const acknowledgementsMatch =
    new Set(provided).size === provided.length &&
    required.length === provided.length &&
    required.every((value, index) => value === provided[index]);
  if (!acknowledgementsMatch) {
    return {
      ...acknowledgementDecision(),
      projectSha256: input.projectSha256,
      planHash: plan.planHash,
      issues: plan.issues.slice(0, 0),
      requiredAcknowledgements: required,
      providedAcknowledgements: provided,
    };
  }
  const fingerprint = sha256(
    canonicalJsonBytes(
      toJsonValue({
        operation: "schema.apply",
        projectId: input.config.projectId,
        environmentId: authority.environmentId,
        projectSha256: input.projectSha256,
        planHash: plan.planHash,
        acknowledgedChangeIds: provided,
      }),
    ),
  );
  const journal = yield* acquireSchemaApplyCommand(input.projectRoot, fingerprint);
  const applyResponse = yield* request(() =>
    authority.client.schema.apply({
      project: input.project,
      commandId: journal.commandId,
      expectedCurrent: plan.current,
      expectedPlanHash: plan.planHash,
      acknowledgedChangeIds: provided,
    }),
  );
  yield* clearSchemaApplyCommand(input.projectRoot, journal.commandId);
  if (applyResponse.body === null)
    return yield* Effect.fail(new Error("CLI_AUTHORING_RESPONSE_EMPTY"));
  if (!applyResponse.body.ok)
    return yield* Effect.fail(new Error(`CLI_AUTHORING_HTTP_${applyResponse.body.error.code}`));
  const applied = applyResponse.body.data;
  const revisionIds = Object.fromEntries(
    applied.revisions.map((revision) => [revision.collectionSourceKey, revision.revisionId]),
  );
  yield* writeAuthoringSchemaLock({
    projectRoot: input.projectRoot,
    schemaPath: input.schemaPath,
    authority: {
      projectId: input.config.projectId,
      environmentId: authority.environmentId,
      environmentKey: input.config.environment,
      projectSha256: input.projectSha256,
      projectManifestHash: applied.projectManifestHash,
      revisionIds,
      revisions: applied.revisions,
      collections: applied.collections,
      fields: applied.fields,
      enumOptions: applied.enumOptions,
    },
  });
  return {
    ...appliedDecision(),
    commandId: applied.commandId,
    replayed: applied.replayed,
    noOp: applied.noOp,
    projectSha256: input.projectSha256,
    projectManifestHash: applied.projectManifestHash,
    revisions: applied.revisions,
    requiredAcknowledgements: required,
  };
});

async function run<A, E>(effect: Effect.Effect<A, E, CredentialStore>) {
  const runtime = ManagedRuntime.make(CredentialStoreLive);
  try {
    return await runtime.runPromise(effect);
  } finally {
    await runtime.dispose();
  }
}

export function runSchemaExportOnline(config: CliConfigV2) {
  return run(exportOnline(config));
}

export function runSchemaPlanOnline(input: {
  readonly config: CliConfigV2;
  readonly project: ProjectSchema;
  readonly projectSha256: string;
}) {
  return run(planOnline(input));
}

export function runSchemaPushOnline(input: {
  readonly config: CliConfigV2;
  readonly projectRoot: string;
  readonly schemaPath: string;
  readonly project: ProjectSchema;
  readonly projectSha256: string;
  readonly acknowledgedChangeIds: ReadonlyArray<string>;
}) {
  return run(pushOnline(input));
}
