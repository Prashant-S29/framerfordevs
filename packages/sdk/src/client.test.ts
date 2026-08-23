import { assert, describe, it } from "@effect/vitest";

import { createProjectClient, deliveryV1, previewV1 } from "./client";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const entry = {
  id: "019fae8b-1234-7000-8000-000000000002",
  collectionId: "019fae8b-1234-7000-8000-000000000003",
  collection: "blog_posts",
  locale: "en",
  data: { title: "Hello" },
  publication: {
    id: "019fae8b-1234-7000-8000-000000000005",
    sequence: 1,
    schemaRevisionId: "019fae8b-1234-7000-8000-000000000006",
    publishedAt: "2026-08-01T12:00:00.000Z",
  },
};

function response(data: unknown, headers?: ConstructorParameters<typeof Headers>[0]) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Success." }), {
    status: 200,
    headers,
  });
}

describe("SDK public clients", () => {
  it("builds bounded Delivery requests with locale, filters, auth, and validators", async () => {
    const requests: Array<{ readonly url: URL; readonly init: RequestInit | undefined }> = [];
    const client = deliveryV1({
      baseUrl: "https://api.example.com",
      projectId,
      environment: "main",
      token: "delivery-token",
      fetch: (input, init) => {
        requests.push({ url: new URL(String(input)), init });
        return Promise.resolve(
          response(
            { items: [entry], page: { limit: 20, nextCursor: null, hasMore: false } },
            {
              ETag: '"etag-1"',
              "X-Request-Id": "request-1",
              "RateLimit-Remaining": "99",
            },
          ),
        );
      },
    });
    const result = await client.list("blog_posts", {
      locale: "en",
      limit: 20,
      sort: "title:asc",
      filters: { "filter.title.eq": "Hello" },
      expand: ["author"],
      ifNoneMatch: '"etag-0"',
    });

    assert.strictEqual(result.body?.ok, true);
    if (result.body?.ok) assert.strictEqual(result.body.data.items[0]?.data["title"], "Hello");
    assert.strictEqual(result.etag, '"etag-1"');
    assert.strictEqual(result.requestId, "request-1");
    assert.strictEqual(result.rateLimit.remaining, 99);
    assert.strictEqual(requests[0]?.url.searchParams.get("locale"), "en");
    assert.strictEqual(requests[0]?.url.searchParams.get("filter.title.eq"), "Hello");
    const headers = new Headers(requests[0]?.init?.headers);
    assert.strictEqual(headers.get("authorization"), "Bearer delivery-token");
    assert.strictEqual(headers.get("if-none-match"), '"etag-0"');
    assert.strictEqual(requests[0]?.init?.redirect, "error");
  });

  it("preserves bodyless 304 responses and typed public errors", async () => {
    let call = 0;
    const client = deliveryV1({
      baseUrl: "https://api.example.com",
      projectId,
      environment: "main",
      fetch: () => {
        call += 1;
        return Promise.resolve(
          call === 1
            ? new Response(null, { status: 304, headers: { ETag: '"same"' } })
            : new Response(
                JSON.stringify({
                  ok: false,
                  data: null,
                  error: {
                    code: "NOT_FOUND",
                    message: "Not found.",
                    details: [{ path: "entry" }],
                    retryable: false,
                    requestId: "request-2",
                  },
                  message: "Not found.",
                }),
                { status: 404 },
              ),
        );
      },
    });
    const unchanged = await client.get("posts", entry.id, { locale: "en" });
    const missing = await client.get("posts", entry.id, { locale: "en" });

    assert.strictEqual(unchanged.status, 304);
    assert.isNull(unchanged.body);
    assert.strictEqual(missing.body?.ok, false);
    if (missing.body && !missing.body.ok) {
      assert.strictEqual(missing.body.error.code, "NOT_FOUND");
      assert.deepEqual(missing.body.error.details, [{ path: "entry" }]);
    }
  });

  it("stops pagination and rejects repeated cursors", async () => {
    let calls = 0;
    const client = deliveryV1({
      baseUrl: "https://api.example.com",
      projectId,
      environment: "main",
      fetch: () => {
        calls += 1;
        return Promise.resolve(
          response({ items: [entry], page: { limit: 20, nextCursor: "repeat", hasMore: true } }),
        );
      },
    });
    const pages: Array<number> = [];
    let repeated = false;
    try {
      for await (const page of client.pages("posts", { locale: "en" })) pages.push(page.status);
    } catch (cause) {
      repeated = cause instanceof Error && /repeated a cursor/u.test(cause.message);
    }

    assert.isTrue(repeated);
    assert.deepEqual(pages, [200, 200]);
    assert.strictEqual(calls, 2);
  });

  it("keeps Preview credentials explicit and selectors out of URLs beyond documented query", async () => {
    assert.throws(() =>
      previewV1({ baseUrl: "https://api.example.com", projectId, environment: "main" }),
    );
    let requested: URL | undefined;
    const client = createProjectClient({
      baseUrl: "https://api.example.com",
      projectId,
      environment: "main",
      previewToken: "preview-token",
      fetch: (input) => {
        requested = new URL(String(input));
        return Promise.resolve(
          response({
            id: entry.id,
            collectionId: entry.collectionId,
            collection: entry.collection,
            locale: entry.locale,
            data: entry.data,
            preview: {
              version: 1,
              schemaRevisionId: entry.publication.schemaRevisionId,
              contractHash: "a".repeat(64),
              sharedRevisionId: null,
              sharedVersion: 0,
              localizedRevisionId: null,
              localizedVersion: 0,
              source: "revision",
            },
            validation: { valid: true, issues: [], capped: false },
          }),
        );
      },
    });
    const preview = await client.preview?.revision(
      "posts",
      entry.id,
      entry.publication.schemaRevisionId,
      { locale: "en", sharedRevision: "none", localizedRevision: "none" },
    );

    assert.strictEqual(preview?.body?.ok, true);
    assert.strictEqual(requested?.searchParams.get("locale"), "en");
    assert.strictEqual(requested?.searchParams.get("sharedRevision"), "none");
    assert.isFalse(String(requested).includes("preview-token"));
  });
});
