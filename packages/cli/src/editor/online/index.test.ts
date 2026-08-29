import { describe, expect, it, vi } from "vitest";

import { canonicalJsonBytes, sha256, toJsonValue } from "../../canonical";
import type { PreparedEditorCommand } from "../bin";
import { initializeEditorOnline, type EditorOnlineDependencies } from "./index";

const project = { collections: [{ sourceKey: "posts", apiKey: "posts", fields: [] }] };
const prepared: PreparedEditorCommand = {
  config: {
    schemaVersion: 2,
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
  environmentId: "019fae8b-1234-7000-8000-000000000002",
};

function dependencies(
  options: { readonly hosted?: unknown; readonly browserFails?: boolean } = {},
) {
  const events: Array<string> = [];
  const close = vi.fn(async () => {
    events.push("close");
  });
  const closeWatcher = vi.fn(async () => {
    events.push("watcher-close");
  });
  let operationToken: (() => string | null) | null = null;
  const value: EditorOnlineDependencies = {
    acquireToken: async () => {
      events.push("credential");
      return "hosted-secret-token";
    },
    resolveEnvironmentId: async (_prepared, token) => {
      events.push("environment");
      expect(token).toBe("hosted-secret-token");
      return "019fae8b-1234-7000-8000-000000000002";
    },
    loadHostedProject: async (_prepared, _environmentId, token) => {
      events.push("hosted");
      expect(token).toBe("hosted-secret-token");
      return options.hosted ?? project;
    },
    loadHostedLocales: async (_prepared, _environmentId, token) => {
      events.push("locales");
      expect(token).toBe("hosted-secret-token");
      return ["en", "hi"];
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
    makeOperation: (_prepared, _environmentId, token) => {
      events.push("operation");
      operationToken = token;
      expect(token()).toBe("hosted-secret-token");
      return async () => ({ status: 200, body: { ok: true } });
    },
    startLoopback: async (input) => {
      events.push("loopback");
      expect(JSON.stringify(input.status())).not.toContain("hosted-secret-token");
      expect(input.status().locales).toEqual(["en", "hi"]);
      return { origin: "http://127.0.0.1:43210", close };
    },
    openBrowser: async (url) => {
      events.push("browser");
      expect(url).toBe(`http://127.0.0.1:43210/#session=${"c".repeat(43)}`);
      expect(url).not.toContain("hosted-secret-token");
      if (options.browserFails) throw new Error("open failed");
    },
    randomChallenge: () => "c".repeat(43),
  };
  return {
    value,
    events,
    close,
    closeWatcher,
    operationToken: () => operationToken?.() ?? null,
  };
}

describe("editor online initialization", () => {
  it("loads hosted authority before binding and exposes only hash-match state", async () => {
    const fixture = dependencies();
    const session = await initializeEditorOnline(prepared, fixture.value);

    expect(fixture.events).toEqual([
      "credential",
      "environment",
      "hosted",
      "locales",
      "watcher",
      "operation",
      "loopback",
      "browser",
    ]);
    expect(session.origin).toBe("http://127.0.0.1:43210");
    expect(session.schemaMatchesHosted).toBe(true);
    await session.close();
    await session.close();
    expect(fixture.close).toHaveBeenCalledOnce();
    expect(fixture.closeWatcher).toHaveBeenCalledOnce();
    expect(fixture.operationToken()).toBeNull();
  });

  it("marks structural drift read-only without weakening startup", async () => {
    const fixture = dependencies({ hosted: { collections: [] } });
    const session = await initializeEditorOnline(prepared, fixture.value);
    expect(session.schemaMatchesHosted).toBe(false);
    await session.close();
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
