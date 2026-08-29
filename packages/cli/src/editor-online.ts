// Acquires hosted authority only after local extraction, then owns one in-memory loopback session.

import { randomBytes } from "node:crypto";

import { authoringV1 } from "@framerfordevs/sdk/authoring";
import { Effect, Layer, ManagedRuntime } from "effect";

import { canonicalJsonBytes, sha256, toJsonValue } from "./canonical";
import { createEditorAuthoringHandler, makeEditorAuthoringGateway } from "./editor-authoring";
import { loadPackagedEditorAssets } from "./editor-assets";
import type { PreparedEditorCommand } from "./editor-bin";
import {
  startEditorLoopback,
  type EditorLoopbackOptions,
  type EditorLoopbackServer,
} from "./editor-loopback";
import {
  startEditorSchemaWatcher,
  type EditorSchemaWatcher,
  type EditorSchemaWatcherInput,
} from "./editor-schema-watcher";
import { CredentialStoreLive } from "./credential-store";
import { BrowserOpener, BrowserOpenerLive, getValidAccessToken } from "./oauth-device";
import { makeToolingHttpClient } from "./tooling-http-client";

export interface EditorOnlineDependencies {
  readonly acquireToken: (apiOrigin: string) => Promise<string>;
  readonly resolveEnvironmentId: (
    prepared: PreparedEditorCommand,
    token: string,
  ) => Promise<string>;
  readonly loadHostedProject: (
    prepared: PreparedEditorCommand,
    environmentId: string,
    token: string,
  ) => Promise<unknown>;
  readonly loadHostedLocales: (
    prepared: PreparedEditorCommand,
    environmentId: string,
    token: string,
  ) => Promise<ReadonlyArray<string>>;
  readonly startWatcher: (input: EditorSchemaWatcherInput) => EditorSchemaWatcher;
  readonly makeOperation: (
    prepared: PreparedEditorCommand,
    environmentId: string,
    token: () => string | null,
    localSchema: () => unknown,
  ) => NonNullable<EditorLoopbackOptions["operation"]>;
  readonly startLoopback: (
    options: Omit<EditorLoopbackOptions, "assets">,
  ) => Promise<EditorLoopbackServer>;
  readonly openBrowser: (url: string) => Promise<void>;
  readonly randomChallenge: () => string;
}

export interface EditorOnlineSession {
  readonly origin: string;
  readonly schemaMatchesHosted: boolean;
  readonly close: () => Promise<void>;
}

function projectCollections(project: unknown) {
  if (typeof project !== "object" || project === null) return [];
  const collections = Reflect.get(project, "collections");
  if (!Array.isArray(collections)) return [];
  return collections.flatMap((collection) => {
    if (typeof collection !== "object" || collection === null) return [];
    const sourceKey = Reflect.get(collection, "sourceKey");
    const apiKey = Reflect.get(collection, "apiKey");
    return typeof sourceKey === "string" && typeof apiKey === "string"
      ? [{ sourceKey, apiKey }]
      : [];
  });
}

function projectCollectionCount(project: unknown): number {
  return projectCollections(project).length;
}

export async function initializeEditorOnline(
  prepared: PreparedEditorCommand,
  dependencies: EditorOnlineDependencies,
): Promise<EditorOnlineSession> {
  let token: string | null = await dependencies.acquireToken(prepared.config.apiBaseUrl);
  let watcher: EditorSchemaWatcher | null = null;
  let loopback: EditorLoopbackServer | null = null;
  let authorityTimer: ReturnType<typeof setInterval> | null = null;
  let authorityRefresh: Promise<void> | null = null;
  try {
    const environmentId = await dependencies.resolveEnvironmentId(prepared, token);
    const hostedProject = await dependencies.loadHostedProject(prepared, environmentId, token);
    const hostedLocales = await dependencies.loadHostedLocales(prepared, environmentId, token);
    let hostedProjectAuthority = hostedProject;
    const hostedProjectSha256 = sha256(canonicalJsonBytes(toJsonValue(hostedProject)));
    const schemaMatchesHosted = hostedProjectSha256 === prepared.projectSha256;
    watcher = dependencies.startWatcher({
      projectRoot: prepared.projectRoot,
      entry: prepared.config.schema,
      hostedProjectSha256,
      initial: {
        project: toJsonValue(prepared.project),
        canonicalJson: canonicalJsonBytes(toJsonValue(prepared.project)),
        sha256: prepared.projectSha256,
        files: prepared.files,
      },
    });
    const refreshHostedAuthority = () => {
      if (authorityRefresh !== null || token === null || watcher === null) return;
      const activeToken = token;
      authorityRefresh = dependencies
        .loadHostedProject(prepared, environmentId, activeToken)
        .then((project) => {
          hostedProjectAuthority = project;
          watcher?.setHostedProjectSha256(sha256(canonicalJsonBytes(toJsonValue(project))));
        })
        .catch(() => undefined)
        .finally(() => {
          authorityRefresh = null;
        });
    };
    authorityTimer = setInterval(refreshHostedAuthority, 5_000);
    authorityTimer.unref();
    const challenge = dependencies.randomChallenge();
    loopback = await dependencies.startLoopback({
      challenge,
      status: () => {
        const schema = watcher?.snapshot();
        return {
          projectId: prepared.config.projectId,
          environment: prepared.config.environment,
          schemaMatchesHosted: schema?.schemaMatchesHosted ?? false,
          schemaValid: schema?.valid ?? false,
          schemaGeneration: schema?.generation ?? 0,
          schemaDiagnosticCode: schema?.diagnosticCode ?? null,
          localCollectionCount:
            schema?.localCollectionCount ?? projectCollectionCount(prepared.project),
          locales: hostedLocales,
          collections: projectCollections(schema?.project ?? prepared.project),
        };
      },
      operation: dependencies.makeOperation(
        prepared,
        environmentId,
        () => token,
        () => ({
          localProject: watcher?.snapshot().project ?? prepared.project,
          hostedProject: hostedProjectAuthority,
        }),
      ),
    });
    await dependencies.openBrowser(`${loopback.origin}/#session=${encodeURIComponent(challenge)}`);
    let closed = false;
    return {
      origin: loopback.origin,
      schemaMatchesHosted,
      close: async () => {
        if (closed) return;
        closed = true;
        if (authorityTimer !== null) clearInterval(authorityTimer);
        authorityTimer = null;
        const activeRefresh = authorityRefresh;
        token = null;
        const activeLoopback = loopback;
        const activeWatcher = watcher;
        loopback = null;
        watcher = null;
        await activeLoopback?.close();
        await activeWatcher?.close();
        await activeRefresh;
      },
    };
  } catch (cause) {
    if (authorityTimer !== null) clearInterval(authorityTimer);
    authorityTimer = null;
    const activeRefresh = authorityRefresh;
    token = null;
    await loopback?.close();
    await watcher?.close();
    await activeRefresh;
    throw cause;
  }
}

function managementOrOAuthToken(apiOrigin: string) {
  const management = process.env["FFD_MANAGEMENT_TOKEN"];
  return management !== undefined && management.length > 0
    ? Effect.sync(() => {
        delete process.env["FFD_MANAGEMENT_TOKEN"];
        return management;
      })
    : getValidAccessToken({ apiOrigin });
}

const liveRuntime = ManagedRuntime.make(Layer.merge(CredentialStoreLive, BrowserOpenerLive));

const liveDependencies: EditorOnlineDependencies = {
  acquireToken: (apiOrigin) => liveRuntime.runPromise(managementOrOAuthToken(apiOrigin)),
  resolveEnvironmentId: async (prepared, token) => {
    if (prepared.environmentId !== null) return prepared.environmentId;
    const tooling = makeToolingHttpClient({ baseUrl: prepared.config.apiBaseUrl, token });
    return (
      await Effect.runPromise(
        tooling.getManifestPage(prepared.config.projectId, prepared.config.environment, null, 1),
      )
    ).environmentId;
  },
  loadHostedProject: async (prepared, environmentId, token) => {
    const client = authoringV1({
      baseUrl: prepared.config.apiBaseUrl,
      token,
      projectId: prepared.config.projectId,
      environmentId,
    });
    const response = await client.schema.export();
    if (response.body === null || !response.body.ok) {
      throw new Error("CLI_EDITOR_HOSTED_AUTHORITY_INVALID");
    }
    return response.body.data.project;
  },
  loadHostedLocales: async (prepared, environmentId, token) => {
    const tooling = makeToolingHttpClient({ baseUrl: prepared.config.apiBaseUrl, token });
    const manifest = await Effect.runPromise(
      tooling.getManifestPage(prepared.config.projectId, prepared.config.environment, null, 1),
    );
    if (manifest.environmentId !== environmentId) {
      throw new Error("CLI_EDITOR_ENVIRONMENT_AUTHORITY_INVALID");
    }
    return manifest.locales.map((locale) => locale.tag);
  },
  startWatcher: startEditorSchemaWatcher,
  makeOperation: (prepared, environmentId, token, localSchema) =>
    createEditorAuthoringHandler({
      localSchema,
      projectRoot: prepared.projectRoot,
      projectId: prepared.config.projectId,
      environmentId,
      gateway: makeEditorAuthoringGateway({
        baseUrl: prepared.config.apiBaseUrl,
        token,
        projectId: prepared.config.projectId,
        environmentId,
      }),
    }),
  startLoopback: async (options) =>
    startEditorLoopback({ ...options, assets: await loadPackagedEditorAssets() }),
  openBrowser: (url) =>
    liveRuntime.runPromise(Effect.flatMap(BrowserOpener, ({ open }) => open(url))),
  randomChallenge: () => randomBytes(32).toString("base64url"),
};

function waitForShutdown(): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      process.off("SIGINT", finish);
      process.off("SIGTERM", finish);
      resolve();
    };
    process.once("SIGINT", finish);
    process.once("SIGTERM", finish);
  });
}

export async function runEditorOnline(
  prepared: PreparedEditorCommand,
  options: { readonly managementToken?: string } = {},
) {
  let session: EditorOnlineSession | null = null;
  const managementToken = options.managementToken;
  const dependencies =
    managementToken === undefined
      ? liveDependencies
      : { ...liveDependencies, acquireToken: async () => managementToken };
  try {
    session = await initializeEditorOnline(prepared, dependencies);
    process.stdout.write(`Local editor running at ${session.origin}/. Press Ctrl+C to stop.\n`);
    await waitForShutdown();
  } finally {
    await session?.close();
    await liveRuntime.dispose();
  }
}
