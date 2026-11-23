import { describe, expect, it, vi } from "vitest";

import { canonicalJsonBytes, sha256, toJsonValue } from "../../canonical";
import type { PreparedEditorCommand } from "../bin";
import type { EditorLoopbackOptions } from "../loopback";
import {
  fetchEditorUpstream,
  initializeEditorOnline,
  serializedTokenProvider,
  type EditorOnlineDependencies,
} from "./index";

const project = { collections: [{ sourceKey: "posts", apiKey: "posts", fields: [] }] };
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const prepared: PreparedEditorCommand = {
  config: {
    schemaVersion: 1,
    apiBaseUrl: "https://api.example.test",
    projectId: "019fae8b-1234-7000-8000-000000000001",
    environment: "main",
    output: "src/framerfordevs",
    schema: "framerfordevs.schema.ts",
  },
  projectRoot: "/workspace",
  schemaPath: "/workspace/framerfordevs.schema.ts",
  project,
  projectSha256: sha256(canonicalJsonBytes(toJsonValue(project))),
  files: ["framerfordevs.schema.ts"],
  environmentId,
};

function bootstrapResponse(status = 200, previewUrl: string | null = null) {
  return {
    status,
    contentType: "application/json",
    retryAfter: null,
    text: JSON.stringify(
      status === 200
        ? { ok: true, data: { host: { kind: "local_editor", previewUrl } } }
        : { ok: false, data: null, error: { code: "UNAUTHORIZED" } },
    ),
  };
}

function dependencies(
  options: {
    readonly hosted?: unknown;
    readonly browserFails?: boolean;
    readonly bootstrapStatus?: number;
  } = {},
) {
  const events: Array<string> = [];
  const close = vi.fn(async () => {
    events.push("close");
  });
  const closeWatcher = vi.fn(async () => {
    events.push("watcher-close");
  });
  let loopbackOptions: EditorLoopbackOptions | null = null;
  const value: EditorOnlineDependencies = {
    acquireToken: async () => {
      events.push("credential");
      return "hosted-secret-token";
    },
    resolveEnvironmentId: async (_prepared, token) => {
      events.push("environment");
      expect(token).toBe("hosted-secret-token");
      return environmentId;
    },
    fetchUpstream: async (apiBaseUrl, token, request) => {
      events.push(`upstream:${request.path.split("/").at(-1)}`);
      expect(apiBaseUrl).toBe("https://api.example.test");
      expect(token).toBe("hosted-secret-token");
      return bootstrapResponse(options.bootstrapStatus ?? 200, "https://www.example.test/preview");
    },
    loadHostedProject: async (_prepared, _environmentId, token) => {
      events.push("hosted");
      expect(token).toBe("hosted-secret-token");
      return options.hosted ?? project;
    },
    loadArtifact: async () => {
      events.push("artifact");
      return { entryScript: "/assets/studio.js", stylesheets: [], files: new Map() };
    },
    startWatcher: (input) => {
      events.push("watcher");
      const schemaMatchesHosted = input.initial.sha256 === input.hostedProjectSha256;
      return {
        snapshot: () => ({
          generation: 0,
          valid: true,
          schemaMatchesHosted,
          project: input.initial.project,
          projectSha256: input.initial.sha256,
          files: input.initial.files,
          localCollectionCount: 1,
          diagnosticCode: null,
        }),
        setHostedProjectSha256: () => {
          events.push("hosted-update");
        },
        subscribe: () => () => undefined,
        close: closeWatcher,
      };
    },
    startLoopback: async (input) => {
      events.push("loopback");
      loopbackOptions = input;
      expect(input.previewUrl).toBe("https://www.example.test/preview");
      expect(input.environmentId).toBe(environmentId);
      return { origin: "http://127.0.0.1:43210", close };
    },
    openBrowser: async (url) => {
      events.push("browser");
      expect(url).toBe(`http://127.0.0.1:43210/studio/session#session=${"c".repeat(43)}`);
      expect(url).not.toContain("hosted-secret-token");
      if (options.browserFails) throw new Error("open failed");
    },
    randomChallenge: () => "c".repeat(43),
  };
  return { value, events, close, closeWatcher, loopback: () => loopbackOptions };
}

describe("editor online initialization", () => {
  it("checks Studio access before binding and reports the schema state", async () => {
    const fixture = dependencies();
    const session = await initializeEditorOnline(prepared, fixture.value);

    expect(fixture.events).toEqual([
      "credential",
      "environment",
      "upstream:bootstrap",
      "hosted",
      "artifact",
      "watcher",
      "loopback",
      "browser",
    ]);
    expect(session.schemaMatchesHosted).toBe(true);
    expect(fixture.loopback()?.status()).toEqual({ schema: "matches", diagnosticCode: null });
    await session.close();
    await session.close();
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.closeWatcher).toHaveBeenCalledOnce();
    await expect(
      fixture.loopback()?.upstream({
        path: "/api/studio/v1/x",
        method: "GET",
        requestId: "r",
        maximumResponseBytes: 1,
      }),
    ).rejects.toThrow("EDITOR_CREDENTIAL_CLEARED");
  });

  it("reports structural drift without weakening startup", async () => {
    const fixture = dependencies({ hosted: { collections: [] } });
    const session = await initializeEditorOnline(prepared, fixture.value);
    expect(session.schemaMatchesHosted).toBe(false);
    expect(fixture.loopback()?.status().schema).toBe("differs");
    await session.close();
  });

  it("stops before binding when the CLI login lacks Studio access", async () => {
    const fixture = dependencies({ bootstrapStatus: 401 });
    await expect(initializeEditorOnline(prepared, fixture.value)).rejects.toThrow(
      "CLI_EDITOR_LOGIN_REQUIRED",
    );
    expect(fixture.events).not.toContain("loopback");
  });

  it("polls hosted structure authority and stops the poll on shutdown", async () => {
    vi.useFakeTimers();
    try {
      const fixture = dependencies();
      const session = await initializeEditorOnline(prepared, fixture.value);
      await vi.advanceTimersByTimeAsync(5_000);
      expect(fixture.events.filter((event) => event === "hosted")).toHaveLength(2);
      expect(fixture.events).toContain("hosted-update");
      await session.close();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fixture.events.filter((event) => event === "hosted")).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the bound server when browser launch fails", async () => {
    const fixture = dependencies({ browserFails: true });
    await expect(initializeEditorOnline(prepared, fixture.value)).rejects.toThrow("open failed");
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.closeWatcher).toHaveBeenCalledOnce();
    expect(fixture.events.slice(-2)).toEqual(["close", "watcher-close"]);
  });
});

describe("editor credential provider", () => {
  it("runs one token refresh at a time and reuses the token briefly", async () => {
    let now = 0;
    let calls = 0;
    let release: (value: string) => void = () => undefined;
    const provider = serializedTokenProvider(
      () =>
        new Promise<string>((resolve) => {
          calls += 1;
          release = resolve;
        }),
      () => now,
    );
    const first = provider.token();
    const second = provider.token();
    release("token-1");
    expect(await first).toBe("token-1");
    expect(await second).toBe("token-1");
    expect(calls).toBe(1);
    now = 59_999;
    expect(await provider.token()).toBe("token-1");
    now = 60_000;
    const refreshed = provider.token();
    release("token-2");
    expect(await refreshed).toBe("token-2");
    expect(calls).toBe(2);
    provider.clear();
    await expect(provider.token()).rejects.toThrow("EDITOR_CREDENTIAL_CLEARED");
  });
});

describe("editor upstream transport", () => {
  it("sends one bearer header without redirects and bounds the response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("x".repeat(20), { headers: { "content-type": "application/json" } }),
    );
    await expect(
      fetchEditorUpstream(
        "https://api.example.test",
        "token",
        { path: "/api/studio/v1/x", method: "GET", requestId: "r", maximumResponseBytes: 10 },
        fetch,
      ),
    ).rejects.toThrow("EDITOR_UPSTREAM_INVALID");
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.example.test/api/studio/v1/x");
    expect(init?.redirect).toBe("error");
    expect(init?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer token", "X-Request-Id": "r" }),
    );
  });
});
