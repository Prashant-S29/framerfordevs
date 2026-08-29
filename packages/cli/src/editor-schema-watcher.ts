// Watches only the verified Tier 1 module graph and preserves the last valid structural view.

import { watch, type FSWatcher } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import { Effect } from "effect";

import type { ExtractedStaticProjectSchema, StaticSchemaExtractionInput } from "./schema-extractor";
import { extractStaticProjectSchema } from "./schema-extractor";

const reloadDelayMs = 120;

export interface EditorSchemaSnapshot {
  readonly generation: number;
  readonly valid: boolean;
  readonly schemaMatchesHosted: boolean;
  readonly project: unknown;
  readonly projectSha256: string;
  readonly files: ReadonlyArray<string>;
  readonly localCollectionCount: number;
  readonly diagnosticCode: string | null;
}

export interface EditorSchemaWatcher {
  readonly snapshot: () => EditorSchemaSnapshot;
  readonly setHostedProjectSha256: (sha256: string) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly close: () => Promise<void>;
}

export interface EditorSchemaWatcherInput {
  readonly projectRoot: string;
  readonly entry: string;
  readonly hostedProjectSha256: string;
  readonly initial: ExtractedStaticProjectSchema;
}

export interface EditorSchemaWatcherDependencies {
  readonly extract: (input: StaticSchemaExtractionInput) => Promise<ExtractedStaticProjectSchema>;
  readonly watchFile: (path: string, listener: () => void) => { readonly close: () => void };
  readonly delayMs: number;
}

function collectionCount(project: unknown): number {
  if (typeof project !== "object" || project === null) return 0;
  const collections = Reflect.get(project, "collections");
  return Array.isArray(collections) ? collections.length : 0;
}

function safeDiagnosticCode(cause: unknown): string {
  const raw =
    typeof cause === "object" && cause !== null && typeof Reflect.get(cause, "code") === "string"
      ? String(Reflect.get(cause, "code"))
      : typeof cause === "object" &&
          cause !== null &&
          typeof Reflect.get(cause, "_tag") === "string"
        ? String(Reflect.get(cause, "_tag"))
        : "CLI_SCHEMA_INVALID";
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(raw) ? raw : "CLI_SCHEMA_INVALID";
}

const liveDependencies: EditorSchemaWatcherDependencies = {
  extract: (input) => Effect.runPromise(extractStaticProjectSchema(input)),
  watchFile: (path, listener) => {
    const expected = basename(path);
    const watcher: FSWatcher = watch(dirname(path), { persistent: true }, (_event, changed) => {
      if (changed?.toString() === expected) listener();
    });
    return { close: () => watcher.close() };
  },
  delayMs: reloadDelayMs,
};

export function startEditorSchemaWatcher(
  input: EditorSchemaWatcherInput,
  dependencies: EditorSchemaWatcherDependencies = liveDependencies,
): EditorSchemaWatcher {
  let hostedProjectSha256 = input.hostedProjectSha256;
  let current: EditorSchemaSnapshot = {
    generation: 0,
    valid: true,
    schemaMatchesHosted: input.initial.sha256 === input.hostedProjectSha256,
    project: input.initial.project,
    projectSha256: input.initial.sha256,
    files: [...input.initial.files],
    localCollectionCount: collectionCount(input.initial.project),
    diagnosticCode: null,
  };
  let fileWatchers: Array<{ readonly close: () => void }> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let loading = false;
  let rerun = false;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };
  const closeFileWatchers = () => {
    for (const watcher of fileWatchers) watcher.close();
    fileWatchers = [];
  };
  const schedule = () => {
    if (closed) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void reload();
    }, dependencies.delayMs);
  };
  const replaceFileWatchers = (files: ReadonlyArray<string>) => {
    closeFileWatchers();
    fileWatchers = files.map((file) =>
      dependencies.watchFile(resolve(input.projectRoot, file), schedule),
    );
  };
  const reload = async (): Promise<void> => {
    if (closed) return;
    if (loading) {
      rerun = true;
      return;
    }
    loading = true;
    try {
      const extracted = await dependencies.extract({
        projectRoot: input.projectRoot,
        entry: input.entry,
      });
      if (closed) return;
      current = {
        generation: current.generation + 1,
        valid: true,
        schemaMatchesHosted: extracted.sha256 === hostedProjectSha256,
        project: extracted.project,
        projectSha256: extracted.sha256,
        files: [...extracted.files],
        localCollectionCount: collectionCount(extracted.project),
        diagnosticCode: null,
      };
      replaceFileWatchers(extracted.files);
      notify();
    } catch (cause) {
      if (closed) return;
      current = {
        ...current,
        generation: current.generation + 1,
        valid: false,
        schemaMatchesHosted: false,
        diagnosticCode: safeDiagnosticCode(cause),
      };
      notify();
    } finally {
      loading = false;
      if (rerun && !closed) {
        rerun = false;
        schedule();
      }
    }
  };

  replaceFileWatchers(input.initial.files);

  return {
    snapshot: () => current,
    setHostedProjectSha256: (sha256) => {
      if (closed || !/^[0-9a-f]{64}$/u.test(sha256) || sha256 === hostedProjectSha256) return;
      hostedProjectSha256 = sha256;
      const schemaMatchesHosted = current.valid && current.projectSha256 === sha256;
      if (schemaMatchesHosted === current.schemaMatchesHosted) return;
      current = { ...current, schemaMatchesHosted };
      notify();
    },
    subscribe: (listener) => {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: async () => {
      if (closed) return;
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      closeFileWatchers();
      listeners.clear();
    },
  };
}
