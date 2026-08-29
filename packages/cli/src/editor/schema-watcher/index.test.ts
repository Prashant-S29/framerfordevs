import { describe, expect, it, vi } from "vitest";

import { startEditorSchemaWatcher, type EditorSchemaWatcherDependencies } from "./index";
import type { ExtractedStaticProjectSchema } from "../../schema/extractor";

function extracted(
  sha256: string,
  files: ReadonlyArray<string> = ["framerfordevs.schema.ts"],
  count = 1,
): ExtractedStaticProjectSchema {
  return {
    project: {
      collections: Array.from({ length: count }, (_, index) => ({
        sourceKey: `collection_${index}`,
        apiKey: `collection_${index}`,
        fields: [],
      })),
    },
    canonicalJson: "{}\n",
    sha256,
    files,
  };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 10));
}

function fixture(results: Array<ExtractedStaticProjectSchema | Error>) {
  const listeners = new Map<string, () => void>();
  const closed: Array<string> = [];
  const extract = vi.fn(async () => {
    const result = results.shift();
    if (result === undefined) throw new Error("missing extraction result");
    if (result instanceof Error) throw result;
    return result;
  });
  const dependencies: EditorSchemaWatcherDependencies = {
    extract,
    watchFile: (path, listener) => {
      listeners.set(path, listener);
      return {
        close: () => {
          closed.push(path);
          listeners.delete(path);
        },
      };
    },
    delayMs: 0,
  };
  return { dependencies, listeners, closed, extract };
}

describe("editor Tier 1 schema watcher", () => {
  it("reloads only the verified graph and rebinds after a valid graph change", async () => {
    const hosted = "a".repeat(64);
    const next = extracted(hosted, ["framerfordevs.schema.ts", "post.schema.ts"], 2);
    const test = fixture([next]);
    const watcher = startEditorSchemaWatcher(
      {
        projectRoot: "/workspace",
        entry: "framerfordevs.schema.ts",
        hostedProjectSha256: hosted,
        initial: extracted("b".repeat(64)),
      },
      test.dependencies,
    );
    const changed = vi.fn();
    watcher.subscribe(changed);

    expect([...test.listeners.keys()]).toEqual(["/workspace/framerfordevs.schema.ts"]);
    test.listeners.get("/workspace/framerfordevs.schema.ts")?.();
    await settle();

    expect(test.extract).toHaveBeenCalledWith({
      projectRoot: "/workspace",
      entry: "framerfordevs.schema.ts",
    });
    expect(watcher.snapshot()).toMatchObject({
      generation: 1,
      valid: true,
      schemaMatchesHosted: true,
      localCollectionCount: 2,
      diagnosticCode: null,
    });
    expect([...test.listeners.keys()].sort()).toEqual([
      "/workspace/framerfordevs.schema.ts",
      "/workspace/post.schema.ts",
    ]);
    expect(test.closed).toContain("/workspace/framerfordevs.schema.ts");
    expect(changed).toHaveBeenCalledOnce();
    watcher.setHostedProjectSha256("b".repeat(64));
    expect(watcher.snapshot().schemaMatchesHosted).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    watcher.setHostedProjectSha256("not-a-digest");
    expect(changed).toHaveBeenCalledTimes(2);
    await watcher.close();
  });

  it("preserves the last valid view read-only with only a bounded diagnostic code", async () => {
    const failure = Object.assign(new Error("schema body must not surface"), {
      code: "call_expression_forbidden",
    });
    const test = fixture([failure]);
    const initial = extracted("a".repeat(64), ["framerfordevs.schema.ts"], 3);
    const watcher = startEditorSchemaWatcher(
      {
        projectRoot: "/workspace",
        entry: "framerfordevs.schema.ts",
        hostedProjectSha256: initial.sha256,
        initial,
      },
      test.dependencies,
    );

    test.listeners.get("/workspace/framerfordevs.schema.ts")?.();
    await settle();

    expect(watcher.snapshot()).toMatchObject({
      generation: 1,
      valid: false,
      schemaMatchesHosted: false,
      project: initial.project,
      projectSha256: initial.sha256,
      localCollectionCount: 3,
      diagnosticCode: "call_expression_forbidden",
    });
    expect(JSON.stringify(watcher.snapshot())).not.toContain("schema body must not surface");
    expect([...test.listeners.keys()]).toEqual(["/workspace/framerfordevs.schema.ts"]);
    await watcher.close();
  });

  it("closes graph watchers, pending reloads, and subscriptions idempotently", async () => {
    const test = fixture([extracted("b".repeat(64))]);
    const watcher = startEditorSchemaWatcher(
      {
        projectRoot: "/workspace",
        entry: "framerfordevs.schema.ts",
        hostedProjectSha256: "a".repeat(64),
        initial: extracted("a".repeat(64)),
      },
      test.dependencies,
    );
    const changed = vi.fn();
    watcher.subscribe(changed);
    test.listeners.get("/workspace/framerfordevs.schema.ts")?.();
    await watcher.close();
    await watcher.close();
    await settle();

    expect(test.extract).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    expect(test.listeners.size).toBe(0);
    expect(test.closed).toEqual(["/workspace/framerfordevs.schema.ts"]);
  });
});
