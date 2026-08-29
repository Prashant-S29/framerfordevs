// Verifies successful current/revision Preview GET and HEAD transport semantics without persisting secrets.

import { afterAll, assert, describe, it, vi } from "vitest";
import request from "supertest";

vi.mock("@framerfordevs/api/operations/preview/public", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@framerfordevs/api/operations/preview/public")>();
  const { Effect } = await import("effect");
  const { PreviewResponseTooLargeFailure } =
    await import("@framerfordevs/api/contracts/response/errors/index");
  const ids = {
    workspace: "019fae8b-1234-7000-8000-000000000001",
    project: "019fae8b-1234-7000-8000-000000000002",
    environment: "019fae8b-1234-7000-8000-000000000003",
    collection: "019fae8b-1234-7000-8000-000000000004",
    entry: "019fae8b-1234-7000-8000-000000000005",
    credential: "019fae8b-1234-7000-8000-000000000006",
    schema: "019fae8b-1234-7000-8000-000000000007",
  };
  const principal = {
    credentialId: ids.credential,
    workspaceId: ids.workspace,
    projectId: ids.project,
    environmentId: ids.environment,
    family: "preview" as const,
    scopes: ["preview.read"] as const,
  };
  const decision = (policy: "preview.global" | "preview.credential") => ({
    allowed: true,
    policy,
    cost: 1,
    limit: policy === "preview.global" ? 12_000 : 300,
    remaining: 299,
    resetAtEpochMs: 1_786_563_660_000,
    retryAfterSeconds: null,
    enforcementMode: "redis" as const,
  });
  const item = (source: "current" | "revision") => ({
    id: ids.entry,
    collectionId: ids.collection,
    collection: "articles",
    locale: "gu",
    preview: {
      version: 1 as const,
      source,
      schemaRevisionId: ids.schema,
      contractHash: "a".repeat(64),
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: null,
      localizedVersion: 0,
    },
    data: { title: "નમસ્તે" },
    validation: { valid: true, issues: [], capped: false },
  });

  return {
    ...actual,
    authenticatePreviewRequest: () => Effect.succeed(principal),
    evaluatePreviewGlobalRateLimit: () => Effect.succeed(decision("preview.global")),
    evaluatePreviewCredentialRateLimit: () => Effect.succeed(decision("preview.credential")),
    getCredentialCurrentPreview: (_principal: unknown, scope: { readonly locale: string }) =>
      scope.locale === "zu"
        ? Effect.fail(PreviewResponseTooLargeFailure.make())
        : Effect.succeed(item("current")),
    getCredentialRevisionPreview: () => Effect.succeed(item("revision")),
  };
});

const { applicationRuntime } = await import("@framerfordevs/api/runtime/index");
const { createApp } = await import("../../src/app");

const app = createApp({ previewApiEnabled: true });
const ids = {
  project: "019fae8b-1234-7000-8000-000000000002",
  entry: "019fae8b-1234-7000-8000-000000000005",
  schema: "019fae8b-1234-7000-8000-000000000007",
};
const root = `/api/preview/v1/projects/${ids.project}/environments/main/collections/articles/entries/${ids.entry}`;
const bearer = "Bearer test-preview-transport-key";

function assertIsolation(response: request.Response) {
  assert.strictEqual(response.headers["cache-control"], "private, no-store, max-age=0");
  assert.strictEqual(response.headers.pragma, "no-cache");
  assert.strictEqual(response.headers.expires, "0");
  assert.strictEqual(response.headers["referrer-policy"], "no-referrer");
  assert.strictEqual(response.headers["access-control-allow-origin"], "*");
  assert.isUndefined(response.headers["access-control-allow-credentials"]);
  assert.isUndefined(response.headers.etag);
  assert.isUndefined(response.headers["last-modified"]);
}

describe("successful Preview transport", () => {
  afterAll(async () => {
    await applicationRuntime.dispose();
  });

  it("serves current GET with exact no-store representation metadata", async () => {
    const response = await request(app)
      .get(`${root}/draft?locale=gu`)
      .set("Authorization", bearer)
      .set("If-None-Match", '"stale-preview-validator"')
      .expect(200);
    assert.strictEqual(response.body.data.preview.source, "current");
    assert.strictEqual(response.body.data.data.title, "નમસ્તે");
    assert.strictEqual(
      Number(response.headers["content-length"]),
      Buffer.byteLength(response.text, "utf8"),
    );
    assertIsolation(response);
  });

  it("serves bodyless current HEAD with the GET representation length", async () => {
    const get = await request(app)
      .get(`${root}/draft?locale=gu`)
      .set("Authorization", bearer)
      .expect(200);
    const head = await request(app)
      .head(`${root}/draft?locale=gu`)
      .set("Authorization", bearer)
      .expect(200);
    assert.strictEqual(head.headers["content-length"], get.headers["content-length"]);
    assert.isUndefined(head.text);
    assertIsolation(head);
  });

  it("rejects every closed query category after authentication without fallback", async () => {
    const rejectedQueries = [
      "locale=gu&locale=en",
      "locale=gu&unknown=value",
      "locale=gu&token=credential",
      "locale=not_a_locale",
      `locale=gu&${"x".repeat(4_097)}`,
      "",
    ];
    for (const query of rejectedQueries) {
      const response = await request(app)
        .get(`${root}/draft${query ? `?${query}` : ""}`)
        .set("Authorization", bearer)
        .expect(400);
      assert.strictEqual(response.body.error.code, "PREVIEW_QUERY_INVALID");
      assertIsolation(response);
    }
    const invalidRevision = await request(app)
      .get(`${root}/revisions/not-a-revision?locale=gu&sharedRevision=none&localizedRevision=none`)
      .set("Authorization", bearer)
      .expect(400);
    assert.strictEqual(invalidRevision.body.error.code, "VALIDATION_ERROR");
    assertIsolation(invalidRevision);
  });

  it("returns a stable body-complete 413 for an oversized compiled Preview", async () => {
    const response = await request(app)
      .get(`${root}/draft?locale=zu`)
      .set("Authorization", bearer)
      .expect(413);
    assert.strictEqual(response.body.error.code, "PREVIEW_RESPONSE_TOO_LARGE");
    assert.strictEqual(
      Number(response.headers["content-length"]),
      Buffer.byteLength(response.text),
    );
    assertIsolation(response);
  });

  it("serves OPTIONS without invoking content authentication or read", async () => {
    const response = await request(app)
      .options(`${root}/draft?locale=gu`)
      .set("Origin", "https://consumer.example")
      .set("Access-Control-Request-Method", "HEAD")
      .set("Access-Control-Request-Headers", "Authorization")
      .expect(204);
    assert.isUndefined(response.headers["www-authenticate"]);
    assert.strictEqual(response.headers["access-control-allow-origin"], "*");
  });

  it("serves explicit revision GET and HEAD without validators", async () => {
    const path = `${root}/revisions/${ids.schema}?locale=gu&sharedRevision=none&localizedRevision=none`;
    const get = await request(app).get(path).set("Authorization", bearer).expect(200);
    const head = await request(app).head(path).set("Authorization", bearer).expect(200);
    assert.strictEqual(get.body.data.preview.source, "revision");
    assert.strictEqual(head.headers["content-length"], get.headers["content-length"]);
    assertIsolation(get);
    assertIsolation(head);
  });
});
