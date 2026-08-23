import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Layer, Schema } from "effect";

import { canonicalizeJson, sha256 } from "./canonical";
import { pullReconciledAuthority, readCompleteManifest } from "./pull";
import { ToolingCollectionRevision, ToolingManifestPage, ToolingProjectPage } from "./schema";
import { makeToolingHttpClient, ToolingHttpClient } from "./tooling-http-client";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const contract = {
  formatVersion: 2,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  collectionApiKey: "blog_posts",
  fields: [],
};
const contractHash = sha256(canonicalizeJson(contract));
const locale = { id: "019fae8b-1234-7000-8000-000000000005", tag: "en" };

function manifest(revision: string = revisionId) {
  return Schema.decodeUnknownSync(ToolingManifestPage)({
    projectId,
    environmentId,
    environmentKey: "main",
    locales: [locale],
    localeContractHash: sha256(canonicalizeJson([locale])),
    collections: [
      {
        id: collectionId,
        key: "blog_posts",
        revisionId: revision,
        revisionSequence: revision === revisionId ? 1 : 2,
        contractHash,
      },
    ],
    nextCursor: null,
  });
}

function revision(revision: string = revisionId) {
  return Schema.decodeUnknownSync(ToolingCollectionRevision)({
    projectId,
    environmentId,
    environmentKey: "main",
    collectionId,
    collectionKey: "blog_posts",
    revisionId: revision,
    revisionSequence: revision === revisionId ? 1 : 2,
    contractHash,
    publishedAt: "2026-08-01T12:00:00.000Z",
    contract,
  });
}

function success(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Success." }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Tooling HTTP client", () => {
  it.effect("sends one origin-bound bearer request and exactly decodes success", () =>
    Effect.gen(function* () {
      const requests: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
      const client = makeToolingHttpClient({
        baseUrl: "https://api.example.com",
        token: "secret-token",
        fetch: (input, init) => {
          requests.push({ url: String(input), init });
          return Promise.resolve(
            success({
              items: [{ id: projectId, key: "project", name: "Project" }],
              nextCursor: null,
            }),
          );
        },
      });
      const page = yield* client.listProjects(null, 20);

      assert.isTrue(page instanceof ToolingProjectPage);
      assert.strictEqual(page.items[0]?.id, projectId);
      assert.strictEqual(
        requests[0]?.url,
        "https://api.example.com/api/tooling/v1/projects?limit=20",
      );
      assert.strictEqual(
        new Headers(requests[0]?.init?.headers).get("authorization"),
        "Bearer secret-token",
      );
      assert.strictEqual(requests[0]?.init?.redirect, "error");
    }),
  );

  it.effect("preserves typed public failures and rejects oversized or inexact bodies", () =>
    Effect.gen(function* () {
      const failureClient = makeToolingHttpClient({
        baseUrl: "https://api.example.com",
        token: "token",
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                ok: false,
                data: null,
                error: {
                  code: "FORBIDDEN",
                  message: "Forbidden.",
                  retryable: false,
                  requestId: "request-1",
                },
                message: "Forbidden.",
              }),
              { status: 403 },
            ),
          ),
      });
      const failure = yield* Effect.exit(failureClient.listProjects(null, 20));
      assert.isTrue(Exit.isFailure(failure));

      const oversizedClient = makeToolingHttpClient({
        baseUrl: "https://api.example.com",
        token: "token",
        fetch: () =>
          Promise.resolve(
            new Response("x", {
              status: 200,
              headers: { "content-length": String(1_572_865) },
            }),
          ),
      });
      const oversized = yield* Effect.exit(oversizedClient.listProjects(null, 20));
      assert.isTrue(Exit.isFailure(oversized));

      const inexactClient = makeToolingHttpClient({
        baseUrl: "https://api.example.com",
        token: "token",
        fetch: () =>
          Promise.resolve(success({ items: [], nextCursor: null, workspaceId: "private" })),
      });
      const inexact = yield* Effect.exit(inexactClient.listProjects(null, 20));
      assert.isTrue(Exit.isFailure(inexact));
    }),
  );
});

describe("reconciled Tooling pull", () => {
  it.effect("fetches exact revisions between two identical complete manifest passes", () => {
    const client = makeToolingHttpClient({
      baseUrl: "https://api.example.com",
      token: "token",
      fetch: (input) => {
        const url = new URL(String(input));
        return Promise.resolve(
          url.pathname.endsWith(`/revisions/${revisionId}`)
            ? success(revision())
            : success(manifest()),
        );
      },
    });
    return Effect.gen(function* () {
      const authority = yield* pullReconciledAuthority(projectId, "main");

      assert.strictEqual(authority.retries, 0);
      assert.strictEqual(authority.revisions[0]?.revisionId, revisionId);
      assert.isNull(authority.manifest.nextCursor);
    }).pipe(Effect.provide(Layer.succeed(ToolingHttpClient, client)));
  });

  it.effect("restarts once after drift and then fails persistent authority changes", () =>
    Effect.gen(function* () {
      const secondRevisionId = "019fae8b-1234-7000-8000-000000000006";
      let manifestCalls = 0;
      const recoveringClient = makeToolingHttpClient({
        baseUrl: "https://api.example.com",
        token: "token",
        fetch: (input) => {
          const url = new URL(String(input));
          if (url.pathname.includes("/revisions/")) {
            return Promise.resolve(
              success(
                url.pathname.endsWith(secondRevisionId) ? revision(secondRevisionId) : revision(),
              ),
            );
          }
          manifestCalls += 1;
          return Promise.resolve(
            success(manifest(manifestCalls === 1 ? revisionId : secondRevisionId)),
          );
        },
      });
      const recovered = yield* pullReconciledAuthority(projectId, "main").pipe(
        Effect.provide(Layer.succeed(ToolingHttpClient, recoveringClient)),
      );
      assert.strictEqual(recovered.retries, 1);
      assert.strictEqual(recovered.revisions[0]?.revisionId, secondRevisionId);

      let changingCalls = 0;
      const changingClient = makeToolingHttpClient({
        baseUrl: "https://api.example.com",
        token: "token",
        fetch: (input) => {
          const url = new URL(String(input));
          if (url.pathname.includes("/revisions/")) {
            const id = url.pathname.split("/").at(-1) ?? revisionId;
            return Promise.resolve(success(revision(id)));
          }
          changingCalls += 1;
          const id = `019fae8b-1234-7000-8000-${String(changingCalls + 10).padStart(12, "0")}`;
          return Promise.resolve(success(manifest(id)));
        },
      });
      const changed = yield* Effect.exit(
        pullReconciledAuthority(projectId, "main").pipe(
          Effect.provide(Layer.succeed(ToolingHttpClient, changingClient)),
        ),
      );
      assert.isTrue(Exit.isFailure(changed));
    }),
  );

  it.effect("rejects repeated pagination cursors", () => {
    const repeating = Schema.decodeUnknownSync(ToolingManifestPage)({
      ...manifest(),
      nextCursor: "repeat",
    });
    const client = makeToolingHttpClient({
      baseUrl: "https://api.example.com",
      token: "token",
      fetch: () => Promise.resolve(success(repeating)),
    });
    return Effect.gen(function* () {
      const result = yield* Effect.exit(readCompleteManifest(projectId, "main"));
      assert.isTrue(Exit.isFailure(result));
    }).pipe(Effect.provide(Layer.succeed(ToolingHttpClient, client)));
  });
});
