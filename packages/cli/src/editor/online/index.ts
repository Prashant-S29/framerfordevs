import { randomBytes } from "node:crypto";

import { Effect, Layer, ManagedRuntime } from "effect";

import { makeAuthoringOperatorClient } from "../../authoring/client";
import { canonicalJsonBytes, sha256, toJsonValue } from "../../canonical";
import { CredentialStoreLive } from "../../credential-store";
import { BrowserOpener, BrowserOpenerLive, getValidAccessToken } from "../../oauth-device";
import { makeToolingHttpClient } from "../../tooling-http-client";
import { loadPackagedStudioArtifact, type EditorStudioArtifact } from "../assets";
import type { PreparedEditorCommand } from "../bin";
import { editorBootstrapFailure, readEditorPreviewUrl } from "../bootstrap";
import {
  editorMountPath,
  startEditorLoopback,
  type EditorLoopbackOptions,
  type EditorLoopbackServer,
  type EditorLoopbackStatus,
  type EditorUpstreamRequest,
  type EditorUpstreamResponse,
} from "../loopback";
import {
  startEditorSchemaWatcher,
  type EditorSchemaWatcher,
  type EditorSchemaWatcherInput,
} from "../schema-watcher";

const upstreamTimeoutMs = 10_000;

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
  readonly fetchUpstream: (
    apiBaseUrl: string,
    token: string,
    request: EditorUpstreamRequest,
  ) => Promise<EditorUpstreamResponse>;
  readonly loadArtifact: () => Promise<EditorStudioArtifact>;
  readonly startWatcher: (input: EditorSchemaWatcherInput) => EditorSchemaWatcher;
  readonly startLoopback: (options: EditorLoopbackOptions) => Promise<EditorLoopbackServer>;
  readonly openBrowser: (url: string) => Promise<void>;
  readonly randomChallenge: () => string;
}

export interface EditorOnlineSession {
  readonly origin: string;
  readonly schemaMatchesHosted: boolean;
  readonly close: () => Promise<void>;
}

const tokenReuseMs = 60_000;

export function serializedTokenProvider(
  acquire: () => Promise<string>,
  now: () => number = Date.now,
) {
  let active: Promise<string> | null = null;
  let cached: { readonly token: string; readonly acquiredAt: number } | null = null;
  let cleared = false;
  return {
    token: (): Promise<string> => {
      if (cleared) return Promise.reject(new Error("EDITOR_CREDENTIAL_CLEARED"));
      if (cached !== null && now() - cached.acquiredAt < tokenReuseMs) {
        return Promise.resolve(cached.token);
      }
      active ??= acquire()
        .then((token) => {
          if (!cleared) cached = { token, acquiredAt: now() };
          return token;
        })
        .finally(() => {
          active = null;
        });
      return active;
    },
    clear: () => {
      cleared = true;
      cached = null;
    },
  };
}

function schemaStatus(watcher: EditorSchemaWatcher | null): EditorLoopbackStatus {
  const snapshot = watcher?.snapshot();
  if (snapshot === undefined || !snapshot.valid) {
    return { schema: "invalid", diagnosticCode: snapshot?.diagnosticCode ?? "CLI_SCHEMA_INVALID" };
  }
  return { schema: snapshot.schemaMatchesHosted ? "matches" : "differs", diagnosticCode: null };
}

export async function initializeEditorOnline(
  prepared: PreparedEditorCommand,
  dependencies: EditorOnlineDependencies,
): Promise<EditorOnlineSession> {
  const credentials = serializedTokenProvider(() =>
    dependencies.acquireToken(prepared.config.apiBaseUrl),
  );
  let watcher: EditorSchemaWatcher | null = null;
  let loopback: EditorLoopbackServer | null = null;
  let authorityTimer: ReturnType<typeof setInterval> | null = null;
  let authorityRefresh: Promise<void> | null = null;
  const upstream = async (request: EditorUpstreamRequest) =>
    dependencies.fetchUpstream(prepared.config.apiBaseUrl, await credentials.token(), request);
  try {
    const initialToken = await credentials.token();
    const environmentId = await dependencies.resolveEnvironmentId(prepared, initialToken);
    const bootstrapPath = `/api/studio/v1/projects/${prepared.config.projectId}/environments/${environmentId}/bootstrap`;
    const bootstrap = await upstream({
      path: bootstrapPath,
      method: "GET",
      requestId: randomBytes(16).toString("hex"),
      maximumResponseBytes: 64 * 1_024,
    });
    let bootstrapBody: unknown = null;
    try {
      bootstrapBody = JSON.parse(bootstrap.text);
    } catch {
      throw new Error("CLI_EDITOR_HOSTED_AUTHORITY_INVALID");
    }
    const previewUrl = bootstrap.status === 200 ? readEditorPreviewUrl(bootstrapBody) : undefined;
    if (previewUrl === undefined) {
      const failure = editorBootstrapFailure(bootstrapBody, bootstrap.status);
      throw new Error(
        failure.status === 401
          ? "CLI_EDITOR_LOGIN_REQUIRED"
          : failure.status === 403 || failure.status === 404
            ? "CLI_EDITOR_ACCESS_DENIED"
            : "CLI_EDITOR_HOSTED_AUTHORITY_INVALID",
      );
    }
    const hostedProject = await dependencies.loadHostedProject(
      prepared,
      environmentId,
      initialToken,
    );
    const hostedProjectSha256 = sha256(canonicalJsonBytes(toJsonValue(hostedProject)));
    const schemaMatchesHosted = hostedProjectSha256 === prepared.projectSha256;
    const artifact = await dependencies.loadArtifact();
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
      if (authorityRefresh !== null || watcher === null) return;
      authorityRefresh = credentials
        .token()
        .then((token) => dependencies.loadHostedProject(prepared, environmentId, token))
        .then((project) => {
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
      projectId: prepared.config.projectId,
      environmentId,
      previewUrl,
      artifact,
      status: () => schemaStatus(watcher),
      upstream,
    });
    await dependencies.openBrowser(
      `${loopback.origin}${editorMountPath}/session#session=${encodeURIComponent(challenge)}`,
    );
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
        credentials.clear();
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
    credentials.clear();
    await loopback?.close();
    await watcher?.close();
    await activeRefresh;
    throw cause;
  }
}

async function boundedText(response: Response, maximumBytes: number): Promise<string> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBytes)
    throw new Error("EDITOR_UPSTREAM_INVALID");
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Array<Uint8Array> = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error("EDITOR_UPSTREAM_INVALID");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function fetchEditorUpstream(
  apiBaseUrl: string,
  token: string,
  request: EditorUpstreamRequest,
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch,
): Promise<EditorUpstreamResponse> {
  const response = await fetchImplementation(new URL(request.path, apiBaseUrl), {
    method: request.method,
    redirect: "error",
    signal: AbortSignal.timeout(upstreamTimeoutMs),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "X-Request-Id": request.requestId,
      ...(request.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(request.body === undefined ? {} : { body: request.body }),
  });
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    retryAfter: response.headers.get("retry-after"),
    text: await boundedText(response, request.maximumResponseBytes),
  };
}

const liveRuntime = ManagedRuntime.make(Layer.merge(CredentialStoreLive, BrowserOpenerLive));

const liveDependencies: EditorOnlineDependencies = {
  acquireToken: (apiOrigin) => liveRuntime.runPromise(getValidAccessToken({ apiOrigin })),
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
    const client = makeAuthoringOperatorClient({
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
  fetchUpstream: (apiBaseUrl, token, request) => fetchEditorUpstream(apiBaseUrl, token, request),
  loadArtifact: loadPackagedStudioArtifact,
  startWatcher: startEditorSchemaWatcher,
  startLoopback: startEditorLoopback,
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

export async function runEditorOnline(prepared: PreparedEditorCommand) {
  let session: EditorOnlineSession | null = null;
  try {
    session = await initializeEditorOnline(prepared, liveDependencies);
    process.stdout.write(
      `Local editor running at ${session.origin}${editorMountPath}. Press Ctrl+C to stop.\n`,
    );
    await waitForShutdown();
  } finally {
    await session?.close();
    await liveRuntime.dispose();
  }
}
