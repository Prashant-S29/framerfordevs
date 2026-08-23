// Reconciles two complete Tooling manifest passes around exact immutable revision fetches.

import { Effect, Schema } from "effect";

import { canonicalizeJson } from "./canonical";
import { ToolingAuthorityChangedError, ToolingPaginationError } from "./errors";
import { type JsonValue, ToolingCollectionRevision, ToolingManifestPage } from "./schema";
import { ToolingHttpClient, type ToolingRequestOptions } from "./tooling-http-client";

const pageSize = 50;
const maximumPages = 200;

export interface ReconciledToolingAuthority {
  readonly manifest: ToolingManifestPage;
  readonly revisions: ReadonlyArray<ToolingCollectionRevision>;
  readonly retries: 0 | 1;
}

function plainJson(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(plainJson);
  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const key of Object.keys(value)) output[key] = plainJson(Reflect.get(value, key));
    return output;
  }
  throw new Error("Tooling authority is not JSON.");
}

function manifestAuthority(manifest: ToolingManifestPage): JsonValue {
  return plainJson({
    projectId: manifest.projectId,
    environmentId: manifest.environmentId,
    environmentKey: manifest.environmentKey,
    locales: manifest.locales,
    localeContractHash: manifest.localeContractHash,
    collections: manifest.collections,
  });
}

export const readCompleteManifest = Effect.fn("ToolingPull.readCompleteManifest")(function* (
  projectId: string,
  environmentKey: string,
  requestOptions: ToolingRequestOptions = {},
) {
  const client = yield* ToolingHttpClient;
  const seenCursors = new Set<string>();
  const seenCollections = new Set<string>();
  const collections: Array<ToolingManifestPage["collections"][number]> = [];
  let first: ToolingManifestPage | null = null;
  let cursor: string | null = null;
  for (let page = 0; page < maximumPages; page += 1) {
    const current: ToolingManifestPage = yield* client.getManifestPage(
      projectId,
      environmentKey,
      cursor,
      pageSize,
      requestOptions,
    );
    if (first === null) {
      first = current;
    } else if (
      current.projectId !== first.projectId ||
      current.environmentId !== first.environmentId ||
      current.environmentKey !== first.environmentKey ||
      current.localeContractHash !== first.localeContractHash ||
      canonicalizeJson(plainJson(current.locales)) !== canonicalizeJson(plainJson(first.locales))
    ) {
      return yield* ToolingAuthorityChangedError.make();
    }
    for (const collection of current.collections) {
      if (seenCollections.has(collection.id)) return yield* ToolingPaginationError.make();
      seenCollections.add(collection.id);
      collections.push(collection);
    }
    if (current.nextCursor === null) {
      return yield* Schema.decodeUnknown(ToolingManifestPage)({
        projectId: current.projectId,
        environmentId: current.environmentId,
        environmentKey: current.environmentKey,
        locales: current.locales,
        localeContractHash: current.localeContractHash,
        collections,
        nextCursor: null,
      });
    }
    if (seenCursors.has(current.nextCursor)) return yield* ToolingPaginationError.make();
    seenCursors.add(current.nextCursor);
    cursor = current.nextCursor;
  }
  return yield* ToolingPaginationError.make();
});

const pullOnce = Effect.fn("ToolingPull.once")(function* (
  projectId: string,
  environmentKey: string,
  requestOptions: ToolingRequestOptions,
) {
  const client = yield* ToolingHttpClient;
  const before = yield* readCompleteManifest(projectId, environmentKey, requestOptions);
  const revisions = yield* Effect.forEach(
    before.collections,
    (collection) =>
      client.getCollectionRevision(
        projectId,
        environmentKey,
        collection.key,
        collection.revisionId,
        requestOptions,
      ),
    { concurrency: 4 },
  );
  const after = yield* readCompleteManifest(projectId, environmentKey, requestOptions);
  return {
    before,
    revisions,
    stable:
      canonicalizeJson(manifestAuthority(before)) === canonicalizeJson(manifestAuthority(after)),
  };
});

export const pullReconciledAuthority = Effect.fn("ToolingPull.reconcile")(function* (
  projectId: string,
  environmentKey: string,
  requestOptions: ToolingRequestOptions = {},
) {
  const first = yield* pullOnce(projectId, environmentKey, requestOptions);
  if (first.stable) {
    return {
      manifest: first.before,
      revisions: first.revisions,
      retries: 0 as const,
    };
  }
  const second = yield* pullOnce(projectId, environmentKey, requestOptions);
  if (!second.stable) return yield* ToolingAuthorityChangedError.make();
  return {
    manifest: second.before,
    revisions: second.revisions,
    retries: 1 as const,
  };
});
