import { createHash } from "node:crypto";

import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { createStudioFetchHandler, type StudioAsset, type StudioServerConfig } from "../../src";
import { decryptStudioRecord, validateStudioKeyRing } from "../../src/crypto";
import { parseStudioRawTarget } from "../../src/raw-target";
import { makeMemoryStudioStore } from "../../src/testing";
import {
  StudioStoreFailure,
  type StudioAttemptRecord,
  type StudioCiphertext,
  type StudioPermitInput,
  type StudioRateLimitInput,
  type StudioSessionRecord,
  type StudioSessionStore,
} from "../../src/store";

const registrationId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const environmentId = "33333333-3333-4333-8333-333333333333";
const workspaceId = "44444444-4444-4444-8444-444444444444";
const contentCollectionId = "55555555-5555-4555-8555-555555555555";
const contentEntryId = "66666666-6666-4666-8666-666666666666";
const contentLocaleId = "77777777-7777-4777-8777-777777777777";
const contentRevisionId = "88888888-8888-4888-8888-888888888888";
const contentFieldId = "99999999-9999-4999-8999-999999999999";
const contentCommandId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const contentSharedRevisionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const contentLocalizedRevisionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const browserBootstrap = (now: number) => ({
  formatVersion: 1,
  registration: {
    id: registrationId,
    version: 3,
    applicationOrigin: "http://localhost:4100",
    mountPath: "/studio",
  },
  project: { id: projectId, name: "Website", workspaceId },
  environment: { id: environmentId, key: "main", name: "main" },
  user: { id: "studio-user", name: "Studio User", email: "studio@example.test" },
  role: "editor",
  effectiveActions: ["project.read"],
  session: { expiresAt: new Date(now + 300_000).toISOString() },
});
const platformBootstrap = (now: number) => ({
  formatVersion: 1,
  registration: {
    id: registrationId,
    version: 3,
    applicationOrigin: "http://localhost:4100",
    mountPath: "/studio",
  },
  project: { id: projectId, name: "Website", workspaceId },
  environment: { id: environmentId, key: "main", name: "main" },
  user: { id: "studio-user", name: "Studio User", email: "studio@example.test" },
  role: "editor",
  effectiveActions: ["project.read"],
  session: { expiresAt: new Date(now + 300_000).toISOString() },
});
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const contentCapabilities = {
  canCreate: true,
  canRename: true,
  canSaveLocalized: true,
  canSaveShared: true,
};
const contentEntry = {
  id: contentEntryId,
  displayName: "Article",
  nameVersion: 1,
  createdAt: "2026-09-28T00:00:00.000Z",
  updatedAt: "2026-09-28T00:00:00.000Z",
};
const contentValidation = { status: "valid", issues: [], capped: false };
const contentForm = {
  collectionId: contentCollectionId,
  schemaRevisionId: contentRevisionId,
  contractHash: "a".repeat(64),
  canEdit: true,
  fields: [
    {
      id: contentFieldId,
      parentFieldId: null,
      nodeRole: "root",
      displayLabel: "Title",
      kind: "short_text",
      required: false,
      localization: "localized",
      position: 0,
      helpText: null,
      placeholder: null,
      configuration: {},
      children: [],
    },
  ],
  editableFieldIds: [contentFieldId],
  tabs: [
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      title: "Content",
      description: null,
      position: 0,
      groups: [
        {
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          fields: [
            {
              id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
              fieldId: contentFieldId,
              position: 0,
              helpTextOverride: null,
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [],
  currencyMinorUnits: {},
};

const allFieldKindConfigurations: ReadonlyArray<
  readonly [string, Readonly<Record<string, unknown>>]
> = [
  ["short_text", { minLength: 0, maxLength: 500, pattern: "^[A-Z]", default: "Title" }],
  ["long_text", { minLength: 0, maxLength: 50_000, default: "Body" }],
  [
    "rich_text",
    {
      styles: ["normal", "h2"],
      decorators: ["strong", "em"],
      links: true,
      lists: ["bullet", "number"],
      minLength: 0,
      maxLength: 100_000,
      default: {
        version: 1,
        profile: "ffd-portable-text",
        blocks: [
          {
            _key: "block-1",
            _type: "block",
            style: "normal",
            children: [{ _key: "span-1", _type: "span", text: "Text", marks: [] }],
            markDefs: [{ _key: "link-1", _type: "link", href: "https://example.test" }],
          },
        ],
      },
    },
  ],
  ["number", { mode: "floating_point", minimum: -1, maximum: 1, default: 0 }],
  ["decimal", { precision: 38, scale: 18, minimum: "-1.5", maximum: "1.5", default: "0" }],
  [
    "money",
    { currencies: ["USD"], allowNegative: false, default: { amount: "1", currency: "USD" } },
  ],
  ["boolean", { default: true }],
  ["date", { minimum: "2026-01-01", maximum: "2026-12-31", default: "2026-06-01" }],
  ["date_time", { default: "2026-09-28T00:00:00.000Z" }],
  [
    "enum",
    {
      options: [
        {
          id: "30000000-0000-4000-8000-000000000001",
          value: "first_option",
          label: "First option",
          position: 0,
        },
      ],
      default: "first_option",
    },
  ],
  ["url", { default: "https://example.test" }],
  ["email", { default: "editor@example.test" }],
  ["slug", { minLength: 1, maxLength: 200, pattern: "^[a-z]+$", default: "article" }],
  ["json", { maxBytes: 1_024, maxDepth: 4, default: { arbitrary: [true] } }],
  ["object", { default: { arbitrary: "value" } }],
  ["list", { minItems: 0, maxItems: 10, uniqueItems: true, default: ["value"] }],
  ["reference", { targetCollectionId: contentCollectionId }],
  [
    "external_asset",
    {
      default: {
        source: "external",
        url: "https://example.test/asset.png",
        kind: "image",
        title: "Asset",
        alt: "Alternative text",
        width: 800,
        height: 600,
      },
    },
  ],
];

function allFieldKindContentForm() {
  const fields = allFieldKindConfigurations.map(([kind, configuration], index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    parentFieldId: null,
    nodeRole: "root",
    displayLabel: `Field ${index + 1}`,
    kind,
    required: false,
    localization: "localized",
    position: index,
    helpText: null,
    placeholder: null,
    configuration,
    children: [],
  }));
  return {
    ...contentForm,
    fields,
    editableFieldIds: fields.map(({ id }) => id),
    tabs: [
      {
        ...contentForm.tabs[0],
        groups: [
          {
            ...contentForm.tabs[0]!.groups[0],
            fields: fields.map(({ id }, index) => ({
              id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              fieldId: id,
              position: index,
              helpTextOverride: null,
            })),
          },
        ],
      },
    ],
    currencyMinorUnits: { USD: 2 },
  };
}

function studioContentSuccessData(url: string, method: string): Readonly<Record<string, unknown>> {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith("/context")) {
    return {
      locales: [
        {
          id: contentLocaleId,
          tag: "en",
          displayName: "English",
          canRead: true,
          canWrite: true,
        },
      ],
      collections: [
        {
          id: contentCollectionId,
          displayName: "Articles",
          capabilities: contentCapabilities,
        },
      ],
      configurationNotices: [],
    };
  }
  if (pathname.endsWith("/search") || (pathname.endsWith("/entries") && method === "GET")) {
    return {
      items: [contentEntry],
      hasMore: false,
      nextCursor: null,
      count: { value: 1, relation: "exact" },
    };
  }
  if (pathname.endsWith("/new")) {
    return {
      localeId: contentLocaleId,
      locale: "en",
      form: contentForm,
      capabilities: contentCapabilities,
    };
  }
  if (pathname.endsWith(`/${contentEntryId}`) && method === "GET") {
    return {
      localeId: contentLocaleId,
      locale: "en",
      form: contentForm,
      capabilities: contentCapabilities,
      draft: {
        entry: contentEntry,
        schemaRevisionId: contentRevisionId,
        contractHash: "a".repeat(64),
        sharedVersion: 1,
        sharedRevisionId: contentSharedRevisionId,
        sharedValues: {},
        localizedVersion: 1,
        localizedRevisionId: contentLocalizedRevisionId,
        localizedValues: { [contentFieldId]: "Title" },
        validation: contentValidation,
      },
    };
  }
  if (pathname.endsWith("/name") && method === "PATCH") return contentEntry;
  if (pathname.endsWith("/draft") && method === "PATCH") {
    return {
      entryId: contentEntryId,
      commandId: contentCommandId,
      sharedChanged: false,
      sharedVersion: 1,
      sharedRevisionId: contentSharedRevisionId,
      localizedChanged: true,
      localizedVersion: 2,
      localizedRevisionId: contentLocalizedRevisionId,
      validation: contentValidation,
    };
  }
  if (pathname.endsWith("/entries") && method === "POST") {
    return {
      entry: contentEntry,
      commandId: contentCommandId,
      sharedVersion: 1,
      sharedRevisionId: contentSharedRevisionId,
      localizedVersion: 1,
      localizedRevisionId: contentLocalizedRevisionId,
      validation: contentValidation,
    };
  }
  throw new Error(`Missing Studio Content success fixture for ${method} ${url}.`);
}

const assets = {
  entryScript: "/assets/studio-test.js",
  stylesheets: ["/assets/studio-test.css"],
  files: new Map([
    [
      "/assets/studio-test.js",
      { body: new TextEncoder().encode("export{}"), contentType: "text/javascript", etag: '"js"' },
    ],
    [
      "/assets/studio-test.css",
      { body: new TextEncoder().encode("body{}"), contentType: "text/css", etag: '"css"' },
    ],
  ]),
};

function paddedJson(value: unknown, bytes: number): string {
  const json = JSON.stringify(value);
  if (json.length > bytes) throw new Error("Fixture exceeds requested byte size.");
  return json + " ".repeat(bytes - json.length);
}

function tokenResponse(_now: number, suffix: string) {
  return {
    access_token: `access-${suffix}`,
    refresh_token: `refresh-${suffix}`,
    token_type: "Bearer",
    expires_in: 300,
    scope: "studio:session offline_access",
  };
}

function platformFetch(now: () => number) {
  let tokenCalls = 0;
  let accessTokenIssuedAt = now();
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/oauth2/token")) {
      tokenCalls += 1;
      accessTokenIssuedAt = now();
      return Response.json(tokenResponse(accessTokenIssuedAt, String(tokenCalls)));
    }
    if (url.endsWith("/bootstrap")) {
      return Response.json({
        ok: true,
        data: platformBootstrap(accessTokenIssuedAt),
        error: null,
        message: "Studio bootstrap loaded.",
      });
    }
    if (url.endsWith("/revoke")) return new Response(null, { status: 200 });
    throw new Error(`unexpected ${url} ${init?.method ?? "GET"}`);
  });
  return { fetch, tokenCalls: () => tokenCalls };
}

function config(overrides: Partial<StudioServerConfig> = {}) {
  let now = 1_800_000_000_000;
  const platform = platformFetch(() => now);
  return {
    value: {
      mode: "test",
      applicationOrigin: "http://localhost:4100",
      platformOrigin: "http://localhost:3000",
      dashboardOrigin: "http://localhost:4200",
      mountPath: "/studio",
      registrationId,
      projectId,
      environmentId,
      store: makeMemoryStudioStore(),
      encryption: {
        activeKeyId: "active",
        keys: [{ id: "active", key: new Uint8Array(32).fill(7) }],
      },
      assets,
      fetch: platform.fetch,
      now: () => now,
      ...overrides,
    } satisfies StudioServerConfig,
    platform,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

function cookieValue(response: Response, prefix: string): string {
  const component = response.headers.getSetCookie().find((value) => value.startsWith(prefix));
  if (component === undefined) throw new Error(`missing ${prefix}`);
  const pair = component.split(";", 1)[0];
  if (pair === undefined) throw new Error("invalid cookie");
  return pair;
}

async function authenticate(
  handler: ReturnType<typeof createStudioFetchHandler>,
  existingSessionCookie?: string,
) {
  const login = await handler.fetch(
    new Request("http://localhost:4100/studio/auth/login", {
      headers: {
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-User": "?1",
        "Sec-Fetch-Site": "same-origin",
      },
    }),
    { rawTarget: "/studio/auth/login" },
  );
  expect(login.status).toBe(303);
  const attemptCookie = cookieValue(login, "ffd-studio-loopback-a-");
  const authorize = new URL(login.headers.get("location") ?? "");
  const callback = new URL("http://localhost:4100/studio/auth/callback");
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", authorize.searchParams.get("state") ?? "");
  callback.searchParams.set("iss", "http://localhost:3000/api/auth");
  const rawTarget = `${callback.pathname}${callback.search}`;
  const result = await handler.fetch(
    new Request(callback, {
      headers: {
        Cookie:
          existingSessionCookie === undefined
            ? attemptCookie
            : `${attemptCookie}; ${existingSessionCookie}`,
      },
    }),
    { rawTarget },
  );
  expect(result.status).toBe(303);
  return cookieValue(result, "ffd-studio-loopback-s-");
}

function bootstrapRequest(cookie: string) {
  return new Request("http://localhost:4100/studio/api/bootstrap", {
    headers: { Cookie: cookie, Origin: "http://localhost:4100", "Sec-Fetch-Site": "same-origin" },
  });
}

function percentile95(values: ReadonlyArray<number>) {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

describe("Studio Fetch runtime", () => {
  it("adapts only the seven finite Studio Content operation families without exposing bearer authority", async () => {
    const setup = config();
    const baseFetch = setup.value.fetch;
    const contentCalls: Array<{
      readonly url: string;
      readonly method: string;
      readonly authorization: string | null;
      readonly requestId: string | null;
      readonly headerNames: ReadonlyArray<string>;
      readonly redirect: RequestRedirect | undefined;
      readonly signal: AbortSignal | null | undefined;
    }> = [];
    const contentFetch: typeof globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/studio-content/v1/")) {
        const headers = new Headers(init?.headers);
        contentCalls.push({
          url,
          method: init?.method ?? "GET",
          authorization: headers.get("authorization"),
          requestId: headers.get("x-request-id"),
          headerNames: [...headers.keys()].toSorted(),
          redirect: init?.redirect,
          signal: init?.signal,
        });
        return Response.json({
          ok: true,
          data: studioContentSuccessData(url, init?.method ?? "GET"),
          error: null,
          message: "Content operation completed.",
        });
      }
      return baseFetch(input, init);
    };
    const handler = createStudioFetchHandler({ ...setup.value, fetch: contentFetch });
    const session = await authenticate(handler);
    const browserHeaders = {
      Cookie: session,
      Host: "attacker.example.test",
      Origin: "http://localhost:4100",
      "Sec-Fetch-Site": "same-origin",
      "X-Forwarded-For": "203.0.113.1",
      "X-Upstream-Url": "https://attacker.example.test",
    };
    const collectionId = contentCollectionId;
    const entryId = contentEntryId;
    const routeBase = `/studio/api/content/collections/${collectionId}/locales/en/entries`;
    const hash = "a".repeat(64);
    const requests = [
      new Request("http://localhost:4100/studio/api/content/context", { headers: browserHeaders }),
      new Request(`http://localhost:4100${routeBase}?limit=25`, { headers: browserHeaders }),
      new Request(`http://localhost:4100${routeBase}/search`, {
        method: "POST",
        headers: { ...browserHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "ar", cursor: null, limit: 25 }),
      }),
      new Request(`http://localhost:4100${routeBase}/new`, { headers: browserHeaders }),
      new Request(`http://localhost:4100${routeBase}/${entryId}`, { headers: browserHeaders }),
      new Request(`http://localhost:4100${routeBase}`, {
        method: "POST",
        headers: { ...browserHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Article",
          schemaRevisionId: entryId,
          contractHash: hash,
          commandId: collectionId,
          sharedMutations: [],
          localizedMutations: [],
        }),
      }),
      new Request(`http://localhost:4100${routeBase}/${entryId}/name`, {
        method: "PATCH",
        headers: { ...browserHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Renamed", expectedNameVersion: 1 }),
      }),
      new Request(`http://localhost:4100${routeBase}/${entryId}/draft`, {
        method: "PATCH",
        headers: { ...browserHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaRevisionId: entryId,
          contractHash: hash,
          commandId: collectionId,
          expectedSharedVersion: 0,
          expectedLocalizedVersion: 0,
          sharedMutations: [],
          localizedMutations: [],
        }),
      }),
    ];
    const approvedSuccessData: Array<unknown> = [];
    for (const request of requests) {
      const url = new URL(request.url);
      const response = await handler.fetch(request, { rawTarget: `${url.pathname}${url.search}` });
      expect(response.status, `${url.toString()} ${await response.clone().text()}`).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = await response.json();
      approvedSuccessData.push(body.data);
    }
    expect(
      approvedSuccessData.map((data) => (isRecord(data) ? Object.keys(data).toSorted() : [])),
    ).toEqual([
      ["collections", "configurationNotices", "locales"],
      ["count", "hasMore", "items", "nextCursor"],
      ["count", "hasMore", "items", "nextCursor"],
      ["capabilities", "form", "locale", "localeId"],
      ["capabilities", "draft", "form", "locale", "localeId"],
      [
        "commandId",
        "entry",
        "localizedRevisionId",
        "localizedVersion",
        "sharedRevisionId",
        "sharedVersion",
        "validation",
      ],
      ["createdAt", "displayName", "id", "nameVersion", "updatedAt"],
      [
        "commandId",
        "entryId",
        "localizedChanged",
        "localizedRevisionId",
        "localizedVersion",
        "sharedChanged",
        "sharedRevisionId",
        "sharedVersion",
        "validation",
      ],
    ]);
    expect(contentCalls).toHaveLength(8);
    expect(contentCalls.every((call) => call.authorization === "Bearer access-1")).toBe(true);
    expect(
      contentCalls.every((call) =>
        call.headerNames.every((name) =>
          ["accept", "authorization", "content-type", "x-request-id"].includes(name),
        ),
      ),
    ).toBe(true);
    expect(
      contentCalls.every(
        (call) =>
          call.requestId !== null &&
          /^[A-Za-z0-9_-]{43}$/u.test(call.requestId) &&
          call.redirect === "error" &&
          call.signal instanceof AbortSignal,
      ),
    ).toBe(true);
    expect(contentCalls.map(({ method }) => method)).toEqual([
      "GET",
      "GET",
      "POST",
      "GET",
      "GET",
      "POST",
      "PATCH",
      "PATCH",
    ]);
    const rejectedRequests = [
      new Request("http://localhost:4100/studio/api/content/context?expand=all", {
        headers: browserHeaders,
      }),
      new Request("http://localhost:4100/studio/api/content/context", {
        headers: { ...browserHeaders, Authorization: "Bearer browser-controlled" },
      }),
      new Request(`http://localhost:4100${routeBase}`, {
        method: "DELETE",
        headers: browserHeaders,
      }),
      new Request("http://localhost:4100/studio/api/content/context", {
        method: "GET",
        headers: { ...browserHeaders, "Content-Length": "1" },
      }),
      new Request("http://localhost:4100/studio/api/content/context", {
        headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
      }),
      new Request("http://localhost:4100/studio/api/content/context", {
        headers: { Origin: "http://localhost:4100", "Sec-Fetch-Site": "same-origin" },
      }),
    ];
    for (const rejected of rejectedRequests) {
      const url = new URL(rejected.url);
      const response = await handler.fetch(rejected, {
        rawTarget: `${url.pathname}${url.search}`,
      });
      expect([400, 401, 403, 404]).toContain(response.status);
    }
    expect(contentCalls).toHaveLength(8);
    const excessMutation = new Request(`http://localhost:4100${routeBase}`, {
      method: "POST",
      headers: { ...browserHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Article",
        schemaRevisionId: entryId,
        contractHash: hash,
        commandId: collectionId,
        sharedMutations: [
          {
            operation: "set",
            path: [entryId],
            value: "blocked",
            unexpected: true,
          },
        ],
        localizedMutations: [],
      }),
    });
    const excessResponse = await handler.fetch(excessMutation, {
      rawTarget: new URL(excessMutation.url).pathname,
    });
    expect(excessResponse.status).toBe(400);
    expect(contentCalls).toHaveLength(8);
    let deepValue: unknown = "blocked";
    for (let depth = 0; depth < 25; depth += 1) deepValue = { child: deepValue };
    const deepMutation = new Request(`http://localhost:4100${routeBase}`, {
      method: "POST",
      headers: { ...browserHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Article",
        schemaRevisionId: entryId,
        contractHash: hash,
        commandId: collectionId,
        sharedMutations: [{ operation: "set", path: [entryId], value: deepValue }],
        localizedMutations: [],
      }),
    });
    const deepResponse = await handler.fetch(deepMutation, {
      rawTarget: new URL(deepMutation.url).pathname,
    });
    expect(deepResponse.status).toBe(400);
    expect(contentCalls).toHaveLength(8);

    const boundedMutationRequest = (value: unknown) =>
      new Request(`http://localhost:4100${routeBase}`, {
        method: "POST",
        headers: { ...browserHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Article",
          schemaRevisionId: entryId,
          contractHash: hash,
          commandId: collectionId,
          sharedMutations: [{ operation: "set", path: [entryId], value }],
          localizedMutations: [],
        }),
      });
    let exactDepthValue: unknown = "accepted";
    for (let depth = 0; depth < 24; depth += 1) exactDepthValue = { child: exactDepthValue };
    const exactDepth = boundedMutationRequest(exactDepthValue);
    expect(
      (
        await handler.fetch(exactDepth, {
          rawTarget: new URL(exactDepth.url).pathname,
        })
      ).status,
    ).toBe(200);
    const exactNodes = boundedMutationRequest(Array.from({ length: 9_999 }, () => null));
    expect(
      (
        await handler.fetch(exactNodes, {
          rawTarget: new URL(exactNodes.url).pathname,
        })
      ).status,
    ).toBe(200);
    const excessNodes = boundedMutationRequest(Array.from({ length: 10_000 }, () => null));
    expect(
      (
        await handler.fetch(excessNodes, {
          rawTarget: new URL(excessNodes.url).pathname,
        })
      ).status,
    ).toBe(400);
    const mutations = (length: number) =>
      new Request(`http://localhost:4100${routeBase}`, {
        method: "POST",
        headers: { ...browserHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Article",
          schemaRevisionId: entryId,
          contractHash: hash,
          commandId: collectionId,
          sharedMutations: Array.from({ length }, () => ({ operation: "unset", path: [entryId] })),
          localizedMutations: [],
        }),
      });
    const exactMutationCount = mutations(500);
    expect(
      (
        await handler.fetch(exactMutationCount, {
          rawTarget: new URL(exactMutationCount.url).pathname,
        })
      ).status,
    ).toBe(200);
    const excessMutationCount = mutations(501);
    expect(
      (
        await handler.fetch(excessMutationCount, {
          rawTarget: new URL(excessMutationCount.url).pathname,
        })
      ).status,
    ).toBe(400);
    expect(contentCalls).toHaveLength(11);

    const browserBodies = await Promise.all(
      requests.map(async (request) =>
        request.body === null ? "" : "browser-body-contained-no-token",
      ),
    );
    expect(browserBodies.join(" ")).not.toContain("access-1");
    for (let accepted = contentCalls.length; accepted < 20; accepted += 1) {
      const response = await handler.fetch(
        new Request("http://localhost:4100/studio/api/content/context", {
          headers: browserHeaders,
        }),
        { rawTarget: "/studio/api/content/context" },
      );
      expect(response.status).toBe(200);
    }
    const limited = await handler.fetch(
      new Request("http://localhost:4100/studio/api/content/context", {
        headers: browserHeaders,
      }),
      { rawTarget: "/studio/api/content/context" },
    );
    expect(limited.status).toBe(429);
    expect(contentCalls).toHaveLength(20);
    await handler.dispose();
  });

  it("strictly accepts all 18 projected field configurations and rejects nested configuration drift", async () => {
    const setup = config();
    const baseFetch = setup.value.fetch;
    let responseForm: unknown = allFieldKindContentForm();
    const handler = createStudioFetchHandler({
      ...setup.value,
      fetch: async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (!url.includes("/api/studio-content/v1/")) return baseFetch(input, init);
        return Response.json({
          ok: true,
          data: {
            localeId: contentLocaleId,
            locale: "en",
            form: responseForm,
            capabilities: contentCapabilities,
          },
          error: null,
          message: "Content operation completed.",
        });
      },
    });
    const session = await authenticate(handler);
    const route = `/studio/api/content/collections/${contentCollectionId}/locales/en/entries/new`;
    const headers = {
      Cookie: session,
      Origin: "http://localhost:4100",
      "Sec-Fetch-Site": "same-origin",
    };
    const request = () =>
      handler.fetch(new Request(`http://localhost:4100${route}`, { headers }), {
        rawTarget: route,
      });

    expect((await request()).status).toBe(200);
    const form = allFieldKindContentForm();
    responseForm = {
      ...form,
      tabs: [],
      sidebarGroups: [
        {
          ...form.tabs[0]!.groups[0],
          fields: [form.tabs[0]!.groups[0]!.fields[0]],
        },
      ],
    };
    expect((await request()).status).toBe(200);
    responseForm = { ...form, tabs: [], sidebarGroups: [] };
    expect((await request()).status).toBe(502);
    responseForm = {
      ...form,
      fields: form.fields.map((field, index) =>
        index === 2
          ? {
              ...field,
              configuration: {
                ...field.configuration,
                default: {
                  version: 1,
                  profile: "ffd-portable-text",
                  blocks: [{ unexpected: true }],
                },
              },
            }
          : field,
      ),
    };
    expect((await request()).status).toBe(502);
    responseForm = {
      ...form,
      fields: form.fields.map((field, index) =>
        index === 17
          ? {
              ...field,
              configuration: {
                default: {
                  source: "external",
                  url: "https://example.test/asset.png",
                  kind: "image",
                  title: null,
                  alt: null,
                  width: null,
                  height: null,
                  credential: "must-not-pass",
                },
              },
            }
          : field,
      ),
    };
    expect((await request()).status).toBe(502);
    await handler.dispose();
  });

  it("preserves both closed configuration reasons across all seven nested operations", async () => {
    let reason: "empty_schema" | "projection_invalid" = "empty_schema";
    const setup = config();
    const baseFetch = setup.value.fetch;
    const contentFetch: typeof globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("/api/studio-content/v1/")) return baseFetch(input, init);
      return Response.json(
        {
          ok: false,
          data: null,
          error: {
            code: "STUDIO_COLLECTION_CONFIGURATION_INVALID",
            message: "The collection configuration is invalid.",
            retryable: false,
            requestId: `configuration-${reason}`,
            configurationReason: reason,
            details: [
              {
                code: reason,
                message: "Repair this collection schema in the dashboard before continuing.",
              },
            ],
          },
          message: "The collection configuration is invalid.",
        },
        { status: 409 },
      );
    };
    const handler = createStudioFetchHandler({ ...setup.value, fetch: contentFetch });
    const session = await authenticate(handler);
    const headers = {
      Cookie: session,
      Origin: "http://localhost:4100",
      "Sec-Fetch-Site": "same-origin",
    };
    const collectionId = "55555555-5555-4555-8555-555555555555";
    const entryId = "66666666-6666-4666-8666-666666666666";
    const routeBase = `/studio/api/content/collections/${collectionId}/locales/en/entries`;
    const hash = "a".repeat(64);
    const makeRequests = () => [
      new Request(`http://localhost:4100${routeBase}?limit=25`, { headers }),
      new Request(`http://localhost:4100${routeBase}/search`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "ar", cursor: null, limit: 25 }),
      }),
      new Request(`http://localhost:4100${routeBase}/new`, { headers }),
      new Request(`http://localhost:4100${routeBase}/${entryId}`, { headers }),
      new Request(`http://localhost:4100${routeBase}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Article",
          schemaRevisionId: entryId,
          contractHash: hash,
          commandId: collectionId,
          sharedMutations: [],
          localizedMutations: [],
        }),
      }),
      new Request(`http://localhost:4100${routeBase}/${entryId}/name`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Renamed", expectedNameVersion: 1 }),
      }),
      new Request(`http://localhost:4100${routeBase}/${entryId}/draft`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          schemaRevisionId: entryId,
          contractHash: hash,
          commandId: collectionId,
          expectedSharedVersion: 0,
          expectedLocalizedVersion: 0,
          sharedMutations: [],
          localizedMutations: [],
        }),
      }),
    ];

    for (const currentReason of ["empty_schema", "projection_invalid"] as const) {
      reason = currentReason;
      for (const request of makeRequests()) {
        const url = new URL(request.url);
        const response = await handler.fetch(request, {
          rawTarget: `${url.pathname}${url.search}`,
        });
        const body = await response.json();
        expect(response.status).toBe(409);
        expect(body.error.code).toBe("STUDIO_COLLECTION_CONFIGURATION_INVALID");
        expect(body.error.configurationReason).toBe(currentReason);
        expect(body.error.details).toEqual([
          {
            code: currentReason,
            message: "Repair this collection schema in the dashboard before continuing.",
          },
        ]);
      }
    }
    await handler.dispose();
  });

  it("keeps BFF browse, search, and workspace adaptation within local p95 targets", async () => {
    const collectionId = "55555555-5555-4555-8555-555555555555";
    const entryId = "66666666-6666-4666-8666-666666666666";
    const routeBase = `/studio/api/content/collections/${collectionId}/locales/en/entries`;
    const measure = async (
      makeRequest: (headers: Record<string, string>) => Request,
    ): Promise<number> => {
      const setup = config();
      const baseFetch = setup.value.fetch;
      const contentFetch: typeof globalThis.fetch = async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/api/studio-content/v1/")) {
          return Response.json({
            ok: true,
            data: studioContentSuccessData(url, init?.method ?? "GET"),
            error: null,
            message: "Content operation completed.",
          });
        }
        return baseFetch(input, init);
      };
      const handler = createStudioFetchHandler({ ...setup.value, fetch: contentFetch });
      const session = await authenticate(handler);
      const browserHeaders = {
        Cookie: session,
        Origin: "http://localhost:4100",
        "Sec-Fetch-Site": "same-origin",
      };
      const samples: Array<number> = [];
      try {
        for (let sample = 0; sample < 20; sample += 1) {
          const request = makeRequest(browserHeaders);
          const url = new URL(request.url);
          const startedAt = performance.now();
          const response = await handler.fetch(request, {
            rawTarget: `${url.pathname}${url.search}`,
          });
          samples.push(performance.now() - startedAt);
          expect(response.status).toBe(200);
        }
      } finally {
        await handler.dispose();
      }
      return percentile95(samples);
    };

    const browseP95 = await measure(
      (headers) =>
        new Request(`http://localhost:4100${routeBase}?limit=25`, {
          headers,
        }),
    );
    const searchP95 = await measure(
      (headers) =>
        new Request(`http://localhost:4100${routeBase}/search`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "ar", cursor: null, limit: 25 }),
        }),
    );
    const workspaceP95 = await measure(
      (headers) =>
        new Request(`http://localhost:4100${routeBase}/${entryId}`, {
          headers,
        }),
    );

    expect(browseP95).toBeLessThan(500);
    expect(searchP95).toBeLessThan(500);
    expect(workspaceP95).toBeLessThan(1_000);
  });

  it("enforces the exact Studio Content request and response byte boundaries", async () => {
    const maximumRequestBytes = 1 * 1_024 * 1_024;
    const maximumResponseBytes = 4 * 1_024 * 1_024;
    const collectionId = "55555555-5555-4555-8555-555555555555";
    const fieldId = "66666666-6666-4666-8666-666666666666";
    const route = `/studio/api/content/collections/${collectionId}/locales/en/entries`;
    let upstreamBodyBytes = 0;
    let responseBody = JSON.stringify({
      ok: true,
      data: studioContentSuccessData(
        `http://localhost:3000/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/collections/${collectionId}/locales/en/entries`,
        "POST",
      ),
      error: null,
      message: "Content operation completed.",
    });
    const setup = config({
      fetch: async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/api/studio-content/v1/")) {
          upstreamBodyBytes = Buffer.byteLength(String(init?.body ?? ""), "utf8");
          return new Response(responseBody, {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return config().value.fetch(input, init);
      },
    });
    const handler = createStudioFetchHandler(setup.value);
    const session = await authenticate(handler);
    const headers = {
      Cookie: session,
      Origin: "http://localhost:4100",
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/json",
    };
    const requestBody = (size: number) => {
      const value = {
        displayName: "Article",
        schemaRevisionId: fieldId,
        contractHash: "a".repeat(64),
        commandId: collectionId,
        sharedMutations: [{ operation: "set", path: [fieldId], value: "" }],
        localizedMutations: [],
      };
      const baseline = JSON.stringify(value);
      value.sharedMutations[0]!.value = "x".repeat(size - Buffer.byteLength(baseline, "utf8"));
      const encoded = JSON.stringify(value);
      expect(Buffer.byteLength(encoded, "utf8")).toBe(size);
      return encoded;
    };
    const exactRequest = new Request(`http://localhost:4100${route}`, {
      method: "POST",
      headers,
      body: requestBody(maximumRequestBytes),
    });
    expect(
      (
        await handler.fetch(exactRequest, {
          rawTarget: route,
        })
      ).status,
    ).toBe(200);
    expect(upstreamBodyBytes).toBe(maximumRequestBytes);
    const excessRequest = new Request(`http://localhost:4100${route}`, {
      method: "POST",
      headers,
      body: requestBody(maximumRequestBytes + 1),
    });
    expect(
      (
        await handler.fetch(excessRequest, {
          rawTarget: route,
        })
      ).status,
    ).toBe(413);
    expect(upstreamBodyBytes).toBe(maximumRequestBytes);

    responseBody = JSON.stringify({
      ok: true,
      data: { items: [], hasMore: false, nextCursor: null, count: { value: 0, relation: "exact" } },
      error: null,
      message: "Content operation completed.",
    });
    const searchRoute = `${route}/search`;
    const searchBody = { query: "article", cursor: null, limit: 25 };
    const exactSearchRequest = new Request(`http://localhost:4100${searchRoute}`, {
      method: "POST",
      headers,
      body: paddedJson(searchBody, 2 * 1_024),
    });
    expect(
      (
        await handler.fetch(exactSearchRequest, {
          rawTarget: searchRoute,
        })
      ).status,
    ).toBe(200);
    expect(upstreamBodyBytes).toBe(2 * 1_024);
    const excessSearchRequest = new Request(`http://localhost:4100${searchRoute}`, {
      method: "POST",
      headers,
      body: paddedJson(searchBody, 2 * 1_024 + 1),
    });
    expect(
      (
        await handler.fetch(excessSearchRequest, {
          rawTarget: searchRoute,
        })
      ).status,
    ).toBe(413);
    expect(upstreamBodyBytes).toBe(2 * 1_024);

    const envelope = {
      ok: true,
      data: {
        localeId: contentLocaleId,
        locale: "en",
        form: contentForm,
        capabilities: contentCapabilities,
        draft: {
          entry: contentEntry,
          schemaRevisionId: contentRevisionId,
          contractHash: "a".repeat(64),
          sharedVersion: 1,
          sharedRevisionId: contentSharedRevisionId,
          sharedValues: {},
          localizedVersion: 1,
          localizedRevisionId: contentLocalizedRevisionId,
          localizedValues: {
            "10000000-0000-4000-8000-000000000001": "",
            "10000000-0000-4000-8000-000000000002": "",
            "10000000-0000-4000-8000-000000000003": "",
            "10000000-0000-4000-8000-000000000004": "",
            "10000000-0000-4000-8000-000000000005": "",
          },
          validation: contentValidation,
        },
      },
      error: null,
      message: "Content operation completed.",
    };
    const responseBaseline = JSON.stringify(envelope);
    let responsePadding = maximumResponseBytes - Buffer.byteLength(responseBaseline, "utf8");
    for (const key of Object.keys(envelope.data.draft.localizedValues)) {
      const length = Math.min(999_999, responsePadding);
      Reflect.set(envelope.data.draft.localizedValues, key, "x".repeat(length));
      responsePadding -= length;
    }
    expect(responsePadding).toBe(0);
    responseBody = JSON.stringify(envelope);
    expect(Buffer.byteLength(responseBody, "utf8")).toBe(maximumResponseBytes);
    const workspaceRoute = `${route}/${contentEntryId}`;
    const exactResponseRequest = new Request(`http://localhost:4100${workspaceRoute}`, {
      headers,
    });
    expect(
      (
        await handler.fetch(exactResponseRequest, {
          rawTarget: workspaceRoute,
        })
      ).status,
    ).toBe(200);
    responseBody = "x".repeat(maximumResponseBytes + 1);
    const excessResponseRequest = new Request(`http://localhost:4100${workspaceRoute}`, {
      headers,
    });
    expect(
      (
        await handler.fetch(excessResponseRequest, {
          rawTarget: workspaceRoute,
        })
      ).status,
    ).toBe(502);
    await handler.dispose();
  });

  it("preserves allowlisted Studio Content failure envelopes and statuses", async () => {
    const fixtures = [
      [400, "VALIDATION_ERROR"],
      [400, "INVALID_CURSOR"],
      [403, "FORBIDDEN"],
      [404, "NOT_FOUND"],
      [404, "LOCALE_UNAVAILABLE"],
      [409, "CMS_CAPABILITY_REQUIRED"],
      [409, "STUDIO_COLLECTION_CONFIGURATION_INVALID"],
      [409, "STALE_SCHEMA"],
      [409, "DRAFT_VERSION_CONFLICT"],
      [409, "NAME_VERSION_CONFLICT"],
      [409, "COMMAND_CONFLICT"],
      [409, "STALE_CURSOR"],
      [413, "REQUEST_TOO_LARGE"],
      [413, "STUDIO_RESPONSE_TOO_LARGE"],
      [429, "RATE_LIMITED"],
      [500, "INTERNAL_ERROR"],
      [503, "SERVICE_UNAVAILABLE"],
      [403, "STUDIO_REGISTRATION_INACTIVE"],
      [403, "STUDIO_AUTHORITY_CHANGED"],
      [403, "STUDIO_GRANT_INVALID"],
      [401, "UNAUTHORIZED"],
    ] as const;
    let index = 0;
    const setup = config();
    const baseFetch = setup.value.fetch;
    const handler = createStudioFetchHandler({
      ...setup.value,
      fetch: async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (!url.includes("/api/studio-content/v1/")) return baseFetch(input, init);
        const fixture = fixtures[index++];
        if (fixture === undefined) throw new Error("Missing failure fixture.");
        const [status, code] = fixture;
        return Response.json(
          {
            ok: false,
            data: null,
            error: {
              code,
              message: "Bounded failure.",
              retryable: status >= 500,
              requestId: `request-${index}`,
              ...(code === "STUDIO_COLLECTION_CONFIGURATION_INVALID"
                ? { configurationReason: "projection_invalid" }
                : {}),
              ...(code.endsWith("VERSION_CONFLICT")
                ? {
                    details: [
                      {
                        code: "version_conflict",
                        message: "The expected version is stale.",
                        scope: "localized",
                        expectedVersion: 1,
                        currentVersion: 2,
                      },
                    ],
                  }
                : {}),
            },
            message: "Bounded failure.",
          },
          { status, headers: status === 429 ? { "Retry-After": "7" } : {} },
        );
      },
    });
    let session = await authenticate(handler);
    for (const [fixtureIndex, [status, code]] of fixtures.entries()) {
      const response = await handler.fetch(
        new Request("http://localhost:4100/studio/api/content/context", {
          headers: {
            Cookie: session,
            Origin: "http://localhost:4100",
            "Sec-Fetch-Site": "same-origin",
          },
        }),
        { rawTarget: "/studio/api/content/context" },
      );
      const body = await response.json();
      expect(response.status).toBe(status);
      expect(body.error.code).toBe(code);
      expect(Object.keys(body).sort()).toEqual(["data", "error", "message", "ok"]);
      expect(response.headers.get("cache-control")).toBe("no-store");
      if (code === "DRAFT_VERSION_CONFLICT" || code === "NAME_VERSION_CONFLICT") {
        expect(body.error.details[0].currentVersion).toBe(2);
      }
      if (status === 429) expect(response.headers.get("retry-after")).toBe("7");
      if (
        fixtureIndex < fixtures.length - 1 &&
        (code === "STUDIO_REGISTRATION_INACTIVE" ||
          code === "STUDIO_AUTHORITY_CHANGED" ||
          code === "STUDIO_GRANT_INVALID")
      ) {
        session = await authenticate(handler);
      }
    }
    await handler.dispose();
  });

  it("rejects unsafe or status-incoherent Studio Content upstream envelopes", async () => {
    const setup = config();
    const baseFetch = setup.value.fetch;
    const invalid = [
      ...[
        "accessToken",
        "access_token",
        "Refresh-Token",
        "AUTHORIZATION",
        "Cookie",
        "secret",
        "api_key",
        "sourceKey",
        "roles",
        "role-authority",
        "visible_to_roles",
        "editableByRoles",
        "effectiveActions",
        "membership_metadata",
        "rawActions",
      ].map((key) => ({
        status: 200,
        body: {
          ok: true,
          data: { nested: { [key]: "must-not-pass" } },
          error: null,
          message: "Bad",
        },
      })),
      {
        status: 200,
        body: {
          ok: true,
          data: {
            ...studioContentSuccessData(
              `http://localhost:3000/api/studio-content/v1/projects/${projectId}/environments/${environmentId}/context`,
              "GET",
            ),
            unexpected: true,
          },
          error: null,
          message: "Unexpected success data key.",
        },
      },
      {
        status: 201,
        body: { ok: true, data: {}, error: null, message: "Wrong success status." },
      },
      {
        status: 200,
        body: {
          ok: false,
          data: null,
          error: {
            code: "FORBIDDEN",
            message: "Forbidden.",
            retryable: false,
            requestId: "request-invalid-status",
          },
          message: "Forbidden.",
        },
      },
      {
        status: 400,
        body: {
          ok: false,
          data: null,
          error: {
            code: "UNKNOWN_ERROR",
            message: "Unknown.",
            retryable: false,
            requestId: "request-invalid-code",
          },
          message: "Unknown.",
        },
      },
      {
        status: 403,
        body: {
          ok: false,
          data: null,
          error: {
            code: "FORBIDDEN",
            message: "Unexpected nested key.",
            retryable: false,
            requestId: "request-invalid-nested-key",
            unexpected: true,
          },
          message: "Unexpected nested key.",
        },
      },
      {
        status: 400,
        body: {
          ok: false,
          data: null,
          error: {
            code: "NOT_FOUND",
            message: "Wrong status.",
            retryable: false,
            requestId: "request-invalid-code-status",
          },
          message: "Wrong status.",
        },
      },
      {
        status: 409,
        body: {
          ok: false,
          data: null,
          error: {
            code: "STUDIO_COLLECTION_CONFIGURATION_INVALID",
            message: "Missing closed reason.",
            retryable: false,
            requestId: "request-missing-configuration-reason",
          },
          message: "Missing closed reason.",
        },
      },
      {
        status: 200,
        body: {
          ok: true,
          data: { value: "x".repeat(1_000_001) },
          error: null,
          message: "Oversized nested string.",
        },
      },
      {
        status: 200,
        body: {
          ok: true,
          data: { values: Array.from({ length: 100_001 }, () => null) },
          error: null,
          message: "Too many nested nodes.",
        },
      },
      {
        status: 200,
        body: {
          ok: true,
          data: Array.from({ length: 34 }, () => 0).reduce<Record<string, unknown>>(
            (nested) => ({ nested }),
            {},
          ),
          error: null,
          message: "Too deep.",
        },
      },
      {
        status: 200,
        body: {
          ok: true,
          data: {},
          error: null,
          message: "Unexpected envelope key.",
          unexpected: true,
        },
      },
      { status: 200, body: "{" },
      { status: 200, body: "" },
      { status: 200, body: "{}", contentType: "text/plain" },
      {
        status: 302,
        body: {
          ok: true,
          data: {},
          error: null,
          message: "Redirect must not be reflected.",
        },
      },
    ];
    let index = 0;
    const contentFetch: typeof globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("/api/studio-content/v1/")) return baseFetch(input, init);
      const response = invalid[index];
      index += 1;
      if (response === undefined) throw new Error("Missing invalid response fixture.");
      return typeof response.body === "string"
        ? new Response(response.body, {
            status: response.status,
            headers: {
              "Content-Type":
                "contentType" in response && typeof response.contentType === "string"
                  ? response.contentType
                  : "application/json",
            },
          })
        : Response.json(response.body, { status: response.status });
    };
    const handler = createStudioFetchHandler({ ...setup.value, fetch: contentFetch });
    let session = await authenticate(handler);
    for (const [fixtureIndex, fixture] of invalid.entries()) {
      if (fixtureIndex > 0 && fixtureIndex % 20 === 0) session = await authenticate(handler);
      const request = new Request("http://localhost:4100/studio/api/content/context", {
        headers: {
          Cookie: session,
          Origin: "http://localhost:4100",
          "Sec-Fetch-Site": "same-origin",
        },
      });
      const response = await handler.fetch(request, {
        rawTarget: "/studio/api/content/context",
      });
      const text = await response.text();
      expect(response.status).toBe(502);
      expect(text).toContain("STUDIO_UPSTREAM_UNAVAILABLE");
      expect(text).not.toContain("leaked-token");
      if (typeof fixture.body !== "string") expect(text).not.toContain(String(fixture.body));
    }
    await handler.dispose();
  });

  it("rejects route-specific invalid nested Studio Content DTO values", async () => {
    const setup = config();
    const baseFetch = setup.value.fetch;
    const invalidData = [
      {
        localeId: contentLocaleId,
        locale: "en",
        form: {
          ...contentForm,
          fields: [
            {
              ...contentForm.fields[0],
              configuration: { maxLength: "not-an-integer" },
            },
          ],
        },
        capabilities: contentCapabilities,
      },
      {
        items: [{ ...contentEntry, unexpected: true }],
        hasMore: false,
        nextCursor: null,
        count: { value: 1, relation: "exact" },
      },
    ];
    let index = 0;
    const handler = createStudioFetchHandler({
      ...setup.value,
      fetch: async (input, init) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (!url.includes("/api/studio-content/v1/")) return baseFetch(input, init);
        const data = invalidData[index++];
        if (data === undefined) throw new Error("Missing invalid nested DTO fixture.");
        return Response.json({
          ok: true,
          data,
          error: null,
          message: "Invalid nested DTO.",
        });
      },
    });
    const session = await authenticate(handler);
    const headers = {
      Cookie: session,
      Origin: "http://localhost:4100",
      "Sec-Fetch-Site": "same-origin",
    };
    const base = `/studio/api/content/collections/${contentCollectionId}/locales/en/entries`;
    for (const route of [`${base}/new`, base]) {
      const response = await handler.fetch(
        new Request(`http://localhost:4100${route}`, { headers }),
        {
          rawTarget: route,
        },
      );
      expect(response.status).toBe(502);
      expect(await response.text()).toContain("STUDIO_UPSTREAM_UNAVAILABLE");
    }
    await handler.dispose();
  });

  it("serves only exact shell/assets with strict security and raw-target rejection", async () => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const shell = await handler.fetch(new Request("http://localhost:4100/studio"), {
      rawTarget: "/studio",
    });
    expect(shell.status).toBe(200);
    expect(shell.headers.get("cache-control")).toBe("no-store");
    expect(shell.headers.get("content-security-policy")).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    expect(shell.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(shell.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(shell.headers.get("referrer-policy")).toBe("no-referrer");
    expect(shell.headers.get("x-content-type-options")).toBe("nosniff");
    expect(shell.headers.get("x-frame-options")).toBe("DENY");
    expect(shell.headers.has("access-control-allow-credentials")).toBe(false);
    const shellBody = await shell.text();
    expect(shellBody).toContain('meta name="ffd-studio-mount" content="/studio"');
    expect(shellBody).toContain(
      'meta name="ffd-studio-dashboard-origin" content="http://localhost:4200"',
    );
    const head = await handler.fetch(
      new Request("http://localhost:4100/studio", { method: "HEAD" }),
      { rawTarget: "/studio" },
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const asset = await handler.fetch(
      new Request("http://localhost:4100/studio/assets/studio-test.js"),
      { rawTarget: "/studio/assets/studio-test.js" },
    );
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asset.headers.get("etag")).toBe('"js"');
    expect(
      (
        await handler.fetch(
          new Request("http://localhost:4100/studio/assets/studio-test.js", {
            headers: { Range: "bytes=0-1" },
          }),
          { rawTarget: "/studio/assets/studio-test.js" },
        )
      ).status,
    ).toBe(400);
    const method = await handler.fetch(
      new Request("http://localhost:4100/studio/api/bootstrap", { method: "POST" }),
      { rawTarget: "/studio/api/bootstrap" },
    );
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET");
    expect(
      (
        await handler.fetch(new Request("http://localhost:4100/studio/missing"), {
          rawTarget: "/studio/missing",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await handler.fetch(
          new Request("http://evil.example.test/studio", {
            headers: { Host: "localhost:4100" },
          }),
          { rawTarget: "/studio" },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handler.fetch(
          new Request("http://localhost:4100/studio", {
            headers: { Authorization: "Bearer browser-token" },
          }),
          { rawTarget: "/studio" },
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handler.fetch(
          new Request("http://localhost:4100/studio", {
            headers: { "X-Oversized": "x".repeat(32 * 1_024) },
          }),
          { rawTarget: "/studio" },
        )
      ).status,
    ).toBe(431);
    for (const target of [
      "/studio%2fapi/bootstrap",
      "/studio//api/bootstrap",
      "//studio/api/bootstrap",
      "/studio\\api/bootstrap",
      "/studio/../api/bootstrap",
    ]) {
      const response = await handler.fetch(new Request("http://localhost:4100/studio"), {
        rawTarget: target,
      });
      expect(response.status, target).toBe(400);
    }
    await handler.dispose();
  });

  it("derives the exact secure cookie and registered callback representation", async () => {
    const setup = config({ applicationOrigin: "https://app.example.test" });
    const handler = createStudioFetchHandler(setup.value);
    const login = await handler.fetch(
      new Request("https://app.example.test/studio/auth/login", {
        headers: {
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-User": "?1",
          "Sec-Fetch-Site": "same-origin",
        },
      }),
      { rawTarget: "/studio/auth/login" },
    );
    expect(login.status).toBe(303);
    expect(login.headers.getSetCookie()[0]).toMatch(
      /^__Secure-ffd-studio-a-[A-Za-z0-9_-]{22}=.+; Path=\/studio; Max-Age=600; Expires=.+; HttpOnly; SameSite=Lax; Secure$/u,
    );
    const authorize = new URL(login.headers.get("location") ?? "");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/studio/auth/callback",
    );
    await handler.dispose();
  });

  it("binds the encrypted one-use attempt and authorization request to exact configured authority", async () => {
    let encryptedAttempt: StudioAttemptRecord | undefined;
    const base = makeMemoryStudioStore();
    const store: StudioSessionStore = {
      ...base,
      createAttempt: (input) => {
        encryptedAttempt = input.record;
        return base.createAttempt(input);
      },
    };
    const setup = config({ store });
    const handler = createStudioFetchHandler(setup.value);
    const login = await handler.fetch(
      new Request("http://localhost:4100/studio/auth/login", {
        headers: {
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-User": "?1",
          "Sec-Fetch-Site": "same-origin",
        },
      }),
      { rawTarget: "/studio/auth/login" },
    );
    expect(login.status).toBe(303);
    if (encryptedAttempt === undefined) throw new Error("Expected an encrypted OAuth attempt.");
    const registrationDigest = createHash("sha256").update(registrationId).digest("hex");
    const decoded = decryptStudioRecord(
      validateStudioKeyRing(setup.value.encryption),
      {
        kind: "attempt",
        registrationDigest,
        recordDigest: encryptedAttempt.attemptDigest,
        expiresAtEpochMs: encryptedAttempt.expiresAtEpochMs,
        generation: 0,
      },
      encryptedAttempt.envelope,
    );
    expect(isRecord(decoded)).toBe(true);
    if (!isRecord(decoded) || typeof decoded.verifier !== "string")
      throw new Error("Expected a decoded OAuth attempt.");
    expect(Object.keys(decoded).sort()).toEqual(
      [
        "applicationOrigin",
        "clientId",
        "createdAtEpochMs",
        "environmentId",
        "issuer",
        "mountPath",
        "projectId",
        "redirectUri",
        "registrationId",
        "resource",
        "returnTo",
        "scope",
        "state",
        "verifier",
      ].sort(),
    );
    expect(decoded).toEqual(
      expect.objectContaining({
        createdAtEpochMs: 1_800_000_000_000,
        issuer: "http://localhost:3000/api/auth",
        resource: "http://localhost:3000/api/studio/v1",
        clientId: `ffd-studio-v1-${registrationId}`,
        redirectUri: "http://localhost:4100/studio/auth/callback",
        scope: "studio:session offline_access",
        registrationId,
        projectId,
        environmentId,
        applicationOrigin: "http://localhost:4100",
        mountPath: "/studio",
        returnTo: "http://localhost:4100/studio",
      }),
    );
    expect(encryptedAttempt.expiresAtEpochMs).toBe(1_800_000_600_000);
    const authorize = new URL(login.headers.get("location") ?? "");
    expect(Object.fromEntries(authorize.searchParams)).toEqual({
      response_type: "code",
      client_id: `ffd-studio-v1-${registrationId}`,
      redirect_uri: "http://localhost:4100/studio/auth/callback",
      scope: "studio:session offline_access",
      resource: "http://localhost:3000/api/studio/v1",
      state: decoded.state,
      code_challenge: createHash("sha256").update(decoded.verifier, "ascii").digest("base64url"),
      code_challenge_method: "S256",
      prompt: "consent",
    });
    expect(authorize.toString()).not.toContain(decoded.verifier);
    expect(login.headers.getSetCookie().join(";")).not.toContain(decoded.verifier);
    expect(login.headers.getSetCookie().join(";")).not.toContain(String(decoded.state));
    await handler.dispose();
  });

  it("uses the exact registration/session rate and callback concurrency policies", async () => {
    const rates: Array<StudioRateLimitInput> = [];
    const permits: Array<StudioPermitInput> = [];
    const base = makeMemoryStudioStore();
    const store: StudioSessionStore = {
      ...base,
      evaluateRateLimit: (input) => {
        rates.push(input);
        return base.evaluateRateLimit(input);
      },
      acquirePermit: (input) => {
        permits.push(input);
        return base.acquirePermit(input);
      },
    };
    const setup = config({ store });
    const handler = createStudioFetchHandler(setup.value);
    const sessionCookie = await authenticate(handler);
    expect(
      (
        await handler.fetch(bootstrapRequest(sessionCookie), {
          rawTarget: "/studio/api/bootstrap",
        })
      ).status,
    ).toBe(200);
    expect(
      rates.map(({ key, capacity, intervalMs }) => ({
        key: key.split(":", 1)[0],
        capacity,
        intervalMs,
      })),
    ).toEqual([
      { key: "login", capacity: 10, intervalMs: 20_000 },
      { key: "callback", capacity: 10, intervalMs: 10_000 },
      { key: "authenticated", capacity: 100, intervalMs: 10_000 },
      { key: "session", capacity: 20, intervalMs: 10_000 },
    ]);
    expect(permits).toHaveLength(1);
    expect(permits[0]).toEqual(
      expect.objectContaining({
        key: expect.stringMatching(/^callback:/u),
        nowEpochMs: 1_800_000_000_000,
        expiresAtEpochMs: 1_800_000_025_000,
        maximum: 10,
      }),
    );
    await handler.dispose();
  });

  it("accepts exact upstream response byte limits and rejects one byte more", async () => {
    for (const [boundary, excess] of [
      ["token", false],
      ["token", true],
      ["bootstrap", false],
      ["bootstrap", true],
    ] as const) {
      const setup = config({
        fetch: async (input) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.endsWith("/oauth2/token")) {
            const body = paddedJson(
              tokenResponse(1_800_000_000_000, boundary),
              32 * 1_024 + (boundary === "token" && excess ? 1 : 0),
            );
            return new Response(body, { headers: { "Content-Type": "application/json" } });
          }
          if (url.endsWith("/bootstrap")) {
            const body = paddedJson(
              {
                ok: true,
                data: platformBootstrap(1_800_000_000_000),
                error: null,
                message: "Studio bootstrap loaded.",
              },
              64 * 1_024 + (boundary === "bootstrap" && excess ? 1 : 0),
            );
            return new Response(body, { headers: { "Content-Type": "application/json" } });
          }
          return new Response(null, { status: 200 });
        },
      });
      const handler = createStudioFetchHandler(setup.value);
      const login = await handler.fetch(
        new Request("http://localhost:4100/studio/auth/login", {
          headers: {
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-User": "?1",
            "Sec-Fetch-Site": "same-origin",
          },
        }),
        { rawTarget: "/studio/auth/login" },
      );
      const attemptCookie = cookieValue(login, "ffd-studio-loopback-a-");
      const authorize = new URL(login.headers.get("location") ?? "");
      const callback = new URL("http://localhost:4100/studio/auth/callback");
      callback.searchParams.set("code", "authorization-code");
      callback.searchParams.set("state", authorize.searchParams.get("state") ?? "");
      callback.searchParams.set("iss", "http://localhost:3000/api/auth");
      const rawTarget = `${callback.pathname}${callback.search}`;
      const response = await handler.fetch(
        new Request(callback, { headers: { Cookie: attemptCookie } }),
        { rawTarget },
      );
      expect(response.status, `${boundary}:${excess}`).toBe(excess ? 502 : 303);
      await handler.dispose();
    }
  });

  it("propagates browser abort and the bounded timeout to Studio Content upstream work", async () => {
    for (const mode of ["browser_abort", "timeout"] as const) {
      let upstreamAborted = false;
      let markUpstreamStarted: (() => void) | undefined;
      const upstreamStarted = new Promise<void>((resolve) => {
        markUpstreamStarted = resolve;
      });
      const setup = config({
        upstreamTimeoutMs: mode === "timeout" ? 100 : 10_000,
      });
      const baseFetch = setup.value.fetch;
      const handler = createStudioFetchHandler({
        ...setup.value,
        fetch: async (input, init) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (!url.includes("/api/studio-content/v1/")) return baseFetch(input, init);
          markUpstreamStarted?.();
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                upstreamAborted = true;
                reject(new Error("aborted"));
              },
              { once: true },
            );
          });
        },
      });
      const session = await authenticate(handler);
      const controller = new AbortController();
      const pending = handler.fetch(
        new Request("http://localhost:4100/studio/api/content/context", {
          headers: {
            Cookie: session,
            Origin: "http://localhost:4100",
            "Sec-Fetch-Site": "same-origin",
          },
          signal: controller.signal,
        }),
        { rawTarget: "/studio/api/content/context" },
      );
      await upstreamStarted;
      if (mode === "browser_abort") controller.abort();
      const response = await pending;
      expect(response.status).toBe(503);
      expect(upstreamAborted).toBe(true);
      await handler.dispose();
    }
  });

  it("enforces the bounded platform timeout configuration", async () => {
    expect(() => createStudioFetchHandler(config({ upstreamTimeoutMs: 99 }).value)).toThrow(
      "STUDIO_CONFIGURATION_INVALID",
    );
    expect(() => createStudioFetchHandler(config({ upstreamTimeoutMs: 10_001 }).value)).toThrow(
      "STUDIO_CONFIGURATION_INVALID",
    );
    const setup = config({
      upstreamTimeoutMs: 100,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    });
    const handler = createStudioFetchHandler(setup.value);
    const started = performance.now();
    const login = await handler.fetch(
      new Request("http://localhost:4100/studio/auth/login", {
        headers: {
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-User": "?1",
          "Sec-Fetch-Site": "same-origin",
        },
      }),
      { rawTarget: "/studio/auth/login" },
    );
    const attemptCookie = cookieValue(login, "ffd-studio-loopback-a-");
    const authorize = new URL(login.headers.get("location") ?? "");
    const callback = new URL("http://localhost:4100/studio/auth/callback");
    callback.searchParams.set("code", "authorization-code");
    callback.searchParams.set("state", authorize.searchParams.get("state") ?? "");
    callback.searchParams.set("iss", "http://localhost:3000/api/auth");
    const rawTarget = `${callback.pathname}${callback.search}`;
    const response = await handler.fetch(
      new Request(callback, { headers: { Cookie: attemptCookie } }),
      { rawTarget },
    );
    expect(response.status).toBe(503);
    expect(performance.now() - started).toBeLessThan(2_000);
    await handler.dispose();
  });

  it("completes Code + S256, stores no plaintext, and returns only the safe bootstrap", async () => {
    let serializedRecord = "";
    const base = makeMemoryStudioStore();
    const spy: StudioSessionStore = {
      ...base,
      createSession: (input) => {
        serializedRecord = JSON.stringify(input.record);
        return base.createSession(input);
      },
    };
    const setup = config({ store: spy });
    const handler = createStudioFetchHandler(setup.value);
    const sessionCookie = await authenticate(handler);
    const tokenCall = setup.platform.fetch.mock.calls.find(([input]) =>
      String(input instanceof Request ? input.url : input).endsWith("/oauth2/token"),
    );
    expect(tokenCall).toBeDefined();
    const tokenInit = tokenCall?.[1];
    expect(tokenInit?.method).toBe("POST");
    expect(new Headers(tokenInit?.headers).get("content-type")).toBe(
      "application/x-www-form-urlencoded",
    );
    const tokenBody = new URLSearchParams(String(tokenInit?.body));
    expect([...tokenBody.keys()].sort()).toEqual(
      ["client_id", "code", "code_verifier", "grant_type", "redirect_uri", "resource"].sort(),
    );
    expect(tokenBody.get("grant_type")).toBe("authorization_code");
    expect(tokenBody.get("code")).toBe("authorization-code");
    expect(tokenBody.get("client_id")).toBe(`ffd-studio-v1-${registrationId}`);
    expect(tokenBody.get("redirect_uri")).toBe("http://localhost:4100/studio/auth/callback");
    expect(tokenBody.get("resource")).toBe("http://localhost:3000/api/studio/v1");
    expect(tokenBody.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{86}$/u);
    expect(serializedRecord).not.toContain("refresh-1");
    expect(serializedRecord).not.toContain("studio_grant_expires_at");
    const response = await handler.fetch(bootstrapRequest(sessionCookie), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: browserBootstrap(1_800_000_000_000),
      error: null,
      message: "Studio bootstrap loaded.",
    });
    expect(JSON.stringify(body)).not.toContain("access_token");
    await handler.dispose();
  });

  it("atomically replaces the old browser session during re-authentication", async () => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const previous = await authenticate(handler);
    const replacement = await authenticate(handler, previous);
    expect(replacement).not.toBe(previous);
    const oldResponse = await handler.fetch(bootstrapRequest(previous), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(oldResponse.status).toBe(401);
    expect(oldResponse.headers.getSetCookie().join(";")).toContain("Max-Age=0");
    expect(
      (
        await handler.fetch(bootstrapRequest(replacement), {
          rawTarget: "/studio/api/bootstrap",
        })
      ).status,
    ).toBe(200);
    await handler.dispose();
  });

  it("accepts only the exact bounded logout body and invalidates the session", async () => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const sessionCookie = await authenticate(handler);
    const headers = {
      Cookie: sessionCookie,
      Origin: "http://localhost:4100",
      "Sec-Fetch-Site": "same-origin",
    };
    const invalid = await handler.fetch(
      new Request("http://localhost:4100/studio/auth/logout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      }),
      { rawTarget: "/studio/auth/logout" },
    );
    expect(invalid.status).toBe(415);
    const oversized = await handler.fetch(
      new Request("http://localhost:4100/studio/auth/logout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: `${" ".repeat(1_023)}{}`,
      }),
      { rawTarget: "/studio/auth/logout" },
    );
    expect(oversized.status).toBe(413);
    const valid = await handler.fetch(
      new Request("http://localhost:4100/studio/auth/logout", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: `${" ".repeat(1_022)}{}`,
      }),
      { rawTarget: "/studio/auth/logout" },
    );
    expect(valid.status).toBe(303);
    expect(
      (
        await handler.fetch(bootstrapRequest(sessionCookie), {
          rawTarget: "/studio/api/bootstrap",
        })
      ).status,
    ).toBe(401);
    await handler.dispose();
  });

  it("accepts an exact 4 KiB Cookie header and rejects one byte more", async () => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const request = (cookieHeader: string) =>
      handler.fetch(
        new Request("http://localhost:4100/studio/auth/logout", {
          method: "POST",
          headers: {
            Cookie: cookieHeader,
            Origin: "http://localhost:4100",
            "Sec-Fetch-Site": "same-origin",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
        { rawTarget: "/studio/auth/logout" },
      );
    expect((await request(`x=${"a".repeat(4_094)}`)).status).toBe(303);
    expect((await request(`x=${"a".repeat(4_095)}`)).status).toBe(400);
    expect((await request("x=a; x=b")).status).toBe(400);
    await handler.dispose();
  });

  it("does not consume a legitimate attempt when a callback presents the wrong state", async () => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const login = await handler.fetch(
      new Request("http://localhost:4100/studio/auth/login", {
        headers: {
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-User": "?1",
          "Sec-Fetch-Site": "same-origin",
        },
      }),
      { rawTarget: "/studio/auth/login" },
    );
    const attemptCookie = cookieValue(login, "ffd-studio-loopback-a-");
    const authorize = new URL(login.headers.get("location") ?? "");
    const validState = authorize.searchParams.get("state") ?? "";
    const makeTarget = (state: string) =>
      `/studio/auth/callback?code=code&state=${state}&iss=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth`;
    const wrong = await handler.fetch(
      new Request(`http://localhost:4100${makeTarget("x".repeat(43))}`, {
        headers: { Cookie: attemptCookie },
      }),
      { rawTarget: makeTarget("x".repeat(43)) },
    );
    expect(wrong.status).toBe(400);
    const validTarget = makeTarget(validState);
    const valid = await handler.fetch(
      new Request(`http://localhost:4100${validTarget}`, { headers: { Cookie: attemptCookie } }),
      { rawTarget: validTarget },
    );
    expect(valid.status).toBe(303);
    await handler.dispose();
  });

  it.each([
    [239_999, 1],
    [240_000, 2],
    [240_001, 2],
  ])("enforces the 60-second refresh threshold at %i milliseconds", async (advance, calls) => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const cookie = await authenticate(handler);
    setup.advance(advance);
    const response = await handler.fetch(bootstrapRequest(cookie), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(response.status).toBe(200);
    expect(setup.platform.tokenCalls()).toBe(calls);
    await handler.dispose();
  });

  it("fences concurrent refresh before provider use and shares the winning generation", async () => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const cookie = await authenticate(handler);
    setup.advance(241_000);
    const [left, right] = await Promise.all([
      handler.fetch(bootstrapRequest(cookie), { rawTarget: "/studio/api/bootstrap" }),
      handler.fetch(bootstrapRequest(cookie), { rawTarget: "/studio/api/bootstrap" }),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 200]);
    expect(setup.platform.tokenCalls()).toBe(2);
    await handler.dispose();
  });

  it("invalidates the session after any post-dispatch refresh failure", async () => {
    let tokenCalls = 0;
    const setup = config({
      fetch: async (input) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.endsWith("/oauth2/token")) {
          tokenCalls += 1;
          return tokenCalls === 1
            ? Response.json(tokenResponse(1_800_000_000_000, "initial"))
            : new Response("not-json", {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
        }
        if (url.endsWith("/bootstrap"))
          return Response.json({
            ok: true,
            data: platformBootstrap(1_800_000_000_000),
            error: null,
            message: "Studio bootstrap loaded.",
          });
        return new Response(null, { status: 200 });
      },
    });
    const handler = createStudioFetchHandler(setup.value);
    const cookie = await authenticate(handler);
    setup.advance(241_000);
    const failed = await handler.fetch(bootstrapRequest(cookie), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(failed.status).toBe(502);
    const terminal = await handler.fetch(bootstrapRequest(cookie), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(terminal.status).toBe(401);
    expect(tokenCalls).toBe(2);
    await handler.dispose();
  });

  it("re-encrypts retained keys on read and fails early key retirement closed", async () => {
    const rotatingStore = makeMemoryStudioStore();
    const oldSetup = config({
      store: rotatingStore,
      encryption: {
        activeKeyId: "old",
        keys: [{ id: "old", key: new Uint8Array(32).fill(1) }],
      },
    });
    const oldHandler = createStudioFetchHandler(oldSetup.value);
    const retainedCookie = await authenticate(oldHandler);
    const rotatingHandler = createStudioFetchHandler({
      ...oldSetup.value,
      encryption: {
        activeKeyId: "new",
        keys: [
          { id: "new", key: new Uint8Array(32).fill(2) },
          { id: "old", key: new Uint8Array(32).fill(1) },
        ],
      },
    });
    expect(
      (
        await rotatingHandler.fetch(bootstrapRequest(retainedCookie), {
          rawTarget: "/studio/api/bootstrap",
        })
      ).status,
    ).toBe(200);
    const newOnlyHandler = createStudioFetchHandler({
      ...oldSetup.value,
      encryption: {
        activeKeyId: "new",
        keys: [{ id: "new", key: new Uint8Array(32).fill(2) }],
      },
    });
    expect(
      (
        await newOnlyHandler.fetch(bootstrapRequest(retainedCookie), {
          rawTarget: "/studio/api/bootstrap",
        })
      ).status,
    ).toBe(200);

    const retiredStore = makeMemoryStudioStore();
    const retiredOldHandler = createStudioFetchHandler({ ...oldSetup.value, store: retiredStore });
    const retiredCookie = await authenticate(retiredOldHandler);
    const retiredHandler = createStudioFetchHandler({
      ...oldSetup.value,
      store: retiredStore,
      encryption: {
        activeKeyId: "new",
        keys: [{ id: "new", key: new Uint8Array(32).fill(2) }],
      },
    });
    const retired = await retiredHandler.fetch(bootstrapRequest(retiredCookie), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(retired.status).toBe(401);
    expect(retired.headers.getSetCookie().join(";")).toContain("Max-Age=0");

    await oldHandler.dispose();
    await rotatingHandler.dispose();
    await newOnlyHandler.dispose();
    await retiredOldHandler.dispose();
    await retiredHandler.dispose();
  });

  it("bounds the cookie and server session to the immutable grant deadline", async () => {
    const setup = config();
    const handler = createStudioFetchHandler(setup.value);
    const cookie = await authenticate(handler);
    expect(cookie).toMatch(/^ffd-studio-loopback-s-[A-Za-z0-9_-]{22}=/u);
    setup.advance(28_800_000);
    const expired = await handler.fetch(bootstrapRequest(cookie), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(expired.status).toBe(401);
    await handler.dispose();
  });

  it("fails closed during a store outage and recovers without a memory fallback", async () => {
    const base = makeMemoryStudioStore();
    let unavailable = true;
    const store: StudioSessionStore = {
      ...base,
      readSession: (...arguments_) =>
        unavailable
          ? Effect.fail(new StudioStoreFailure({ operation: "test", reason: "connection" }))
          : base.readSession(...arguments_),
    };
    const setup = config({ store });
    const handler = createStudioFetchHandler(setup.value);
    const suffix = createHash("sha256")
      .update(registrationId)
      .digest()
      .subarray(0, 16)
      .toString("base64url");
    const missing = `ffd-studio-loopback-s-${suffix}=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const failed = await handler.fetch(bootstrapRequest(missing), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(failed.status).toBe(503);
    unavailable = false;
    const recovered = await handler.fetch(bootstrapRequest(missing), {
      rawTarget: "/studio/api/bootstrap",
    });
    expect(recovered.status).toBe(401);
    await handler.dispose();
  });

  it("maps terminal platform authority failures exactly and preserves rate-limited sessions", async () => {
    const cases = [
      [401, "STUDIO_GRANT_INVALID", 401, "STUDIO_SESSION_INVALID", true],
      [403, "FORBIDDEN", 403, "STUDIO_FORBIDDEN", true],
      [404, "NOT_FOUND", 404, "STUDIO_PROJECT_UNAVAILABLE", true],
      [409, "CMS_CAPABILITY_REQUIRED", 409, "STUDIO_CMS_DISABLED", true],
      [409, "STUDIO_REGISTRATION_INACTIVE", 409, "STUDIO_REGISTRATION_INACTIVE", true],
      [429, "RATE_LIMITED", 429, "STUDIO_RATE_LIMITED", false],
    ] as const;
    for (const [platformStatus, platformCode, status, code, terminal] of cases) {
      const base = makeMemoryStudioStore();
      let bootstrapCalls = 0;
      let deleteCalls = 0;
      const store: StudioSessionStore = {
        ...base,
        deleteSession: (...arguments_) => {
          deleteCalls += 1;
          return base.deleteSession(...arguments_);
        },
      };
      const setup = config({
        store,
        fetch: async (input) => {
          const url =
            typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
          if (url.endsWith("/oauth2/token"))
            return Response.json(tokenResponse(1_800_000_000_000, platformCode));
          if (url.endsWith("/bootstrap")) {
            bootstrapCalls += 1;
            if (bootstrapCalls === 1)
              return Response.json({
                ok: true,
                data: platformBootstrap(1_800_000_000_000),
                error: null,
                message: "Studio bootstrap loaded.",
              });
            return Response.json(
              {
                ok: false,
                data: null,
                error: { code: platformCode, message: "bounded", requestId: "request-id" },
                message: "bounded",
              },
              { status: platformStatus },
            );
          }
          return new Response(null, { status: 200 });
        },
      });
      const handler = createStudioFetchHandler(setup.value);
      const sessionCookie = await authenticate(handler);
      const response = await handler.fetch(bootstrapRequest(sessionCookie), {
        rawTarget: "/studio/api/bootstrap",
      });
      expect(response.status, platformCode).toBe(status);
      const body = await response.json();
      expect(body.error.code, platformCode).toBe(code);
      expect(response.headers.getSetCookie().join(";").includes("Max-Age=0"), platformCode).toBe(
        terminal,
      );
      expect(deleteCalls > 0, platformCode).toBe(terminal);
      await handler.dispose();
    }
  });

  it("emits only bounded redacted telemetry fields", async () => {
    const events: Array<Record<string, unknown>> = [];
    const setup = config({ observe: (event) => events.push({ ...event }) });
    const handler = createStudioFetchHandler(setup.value);
    const cookie = await authenticate(handler);
    await handler.fetch(bootstrapRequest(cookie), { rawTarget: "/studio/api/bootstrap" });
    await handler.fetch(
      new Request("http://localhost:4100/studio/auth/logout", {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "http://localhost:4100",
          "Sec-Fetch-Site": "same-origin",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      { rawTarget: "/studio/auth/logout" },
    );
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const event of events) {
      expect(
        Object.keys(event).every((key) =>
          [
            "operation",
            "outcome",
            "status",
            "durationMs",
            "storageMode",
            "refreshGeneration",
            "keyRotation",
          ].includes(key),
        ),
      ).toBe(true);
    }
    const serialized = JSON.stringify(events);
    for (const forbidden of [
      registrationId,
      projectId,
      environmentId,
      "authorization-code",
      "access-1",
      "refresh-1",
      "Cookie",
      "Authorization",
      "/auth/callback?",
    ])
      expect(serialized).not.toContain(forbidden);
    await handler.dispose();
  });

  it("refuses a process-local store outside exact loopback development and test", async () => {
    const setup = config({
      mode: "production",
      applicationOrigin: "https://app.example.test",
      platformOrigin: "https://api.example.test",
      dashboardOrigin: "https://dashboard.example.test",
    });
    expect(() => createStudioFetchHandler(setup.value)).toThrow("STUDIO_CONFIGURATION_INVALID");
    expect(() =>
      createStudioFetchHandler(
        config({ mode: "development", applicationOrigin: "https://app.example.test" }).value,
      ),
    ).toThrow("STUDIO_CONFIGURATION_INVALID");
    const loopback = createStudioFetchHandler(config({ mode: "development" }).value);
    await loopback.dispose();
  });
});

describe("Studio source-controlled bounds", () => {
  it("accepts exact asset count and byte limits and rejects one over", async () => {
    const makeAsset = (bytes: number) => ({
      body: new Uint8Array(bytes),
      contentType: "text/javascript",
      etag: '"asset"',
    });
    const counted = new Map<string, StudioAsset>(
      Array.from({ length: 64 }, (_, index) => [`/assets/file-${index}.js`, makeAsset(1)] as const),
    );
    const exactCount = createStudioFetchHandler(
      config({
        assets: { entryScript: "/assets/file-0.js", stylesheets: [], files: counted },
      }).value,
    );
    await exactCount.dispose();
    const overCount = new Map(counted);
    overCount.set("/assets/file-64.js", makeAsset(1));
    expect(() =>
      createStudioFetchHandler(
        config({
          assets: { entryScript: "/assets/file-0.js", stylesheets: [], files: overCount },
        }).value,
      ),
    ).toThrow("STUDIO_CONFIGURATION_INVALID");

    const exactSingle = new Map([["/assets/exact.js", makeAsset(2 * 1_024 * 1_024)]]);
    const exactSingleHandler = createStudioFetchHandler(
      config({
        assets: { entryScript: "/assets/exact.js", stylesheets: [], files: exactSingle },
      }).value,
    );
    await exactSingleHandler.dispose();
    const overSingle = new Map([["/assets/over.js", makeAsset(2 * 1_024 * 1_024 + 1)]]);
    expect(() =>
      createStudioFetchHandler(
        config({
          assets: { entryScript: "/assets/over.js", stylesheets: [], files: overSingle },
        }).value,
      ),
    ).toThrow("STUDIO_CONFIGURATION_INVALID");

    const exactTotal = new Map<string, StudioAsset>(
      Array.from(
        { length: 4 },
        (_, index) => [`/assets/total-${index}.js`, makeAsset(2 * 1_024 * 1_024)] as const,
      ),
    );
    const exactTotalHandler = createStudioFetchHandler(
      config({
        assets: { entryScript: "/assets/total-0.js", stylesheets: [], files: exactTotal },
      }).value,
    );
    await exactTotalHandler.dispose();
    exactTotal.set("/assets/total-over.js", makeAsset(1));
    expect(() =>
      createStudioFetchHandler(
        config({
          assets: { entryScript: "/assets/total-0.js", stylesheets: [], files: exactTotal },
        }).value,
      ),
    ).toThrow("STUDIO_CONFIGURATION_INVALID");
  });

  it("enforces exact rate, quota, permit, expiry, and refresh fence boundaries", async () => {
    const store = makeMemoryStudioStore();
    const encrypted: StudioCiphertext = {
      version: 1,
      keyId: "active",
      nonce: "nonce",
      ciphertext: "ciphertext",
      tag: "tag",
    };
    const digestAt = (prefix: string, index: number) =>
      createHash("sha256").update(`${prefix}-${index}`).digest("hex");
    const now = 1_800_000_000_000;

    for (const [key, capacity, intervalMs] of [
      ["login:registration", 10, 20_000],
      ["callback:registration", 10, 10_000],
      ["authenticated:registration", 100, 10_000],
      ["session:registration:session", 20, 10_000],
    ] as const) {
      const rateInput: StudioRateLimitInput = { key, nowEpochMs: now, capacity, intervalMs };
      for (let index = 0; index < capacity; index += 1)
        expect((await Effect.runPromise(store.evaluateRateLimit(rateInput))).allowed).toBe(true);
      const limited = await Effect.runPromise(store.evaluateRateLimit(rateInput));
      expect(limited.allowed).toBe(false);
      expect(limited.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(
        (
          await Effect.runPromise(
            store.evaluateRateLimit({
              ...rateInput,
              nowEpochMs: now + intervalMs / capacity,
            }),
          )
        ).allowed,
      ).toBe(true);
    }

    for (let index = 0; index < 20; index += 1) {
      const attemptDigest = digestAt("attempt", index);
      expect(
        await Effect.runPromise(
          store.createAttempt({
            record: {
              attemptDigest,
              registrationDigest: "a".repeat(64),
              expiresAtEpochMs: now + 600_000,
              envelope: encrypted,
            },
            nowEpochMs: now,
            maximumAttemptsPerRegistration: 20,
          }),
        ),
      ).toBe("created");
    }
    expect(
      await Effect.runPromise(
        store.createAttempt({
          record: {
            attemptDigest: digestAt("attempt", 20),
            registrationDigest: "a".repeat(64),
            expiresAtEpochMs: now + 1_200_000,
            envelope: encrypted,
          },
          nowEpochMs: now,
          maximumAttemptsPerRegistration: 20,
        }),
      ),
    ).toBe("quota_exceeded");
    expect(
      await Effect.runPromise(
        store.createAttempt({
          record: {
            attemptDigest: digestAt("attempt", 21),
            registrationDigest: "a".repeat(64),
            expiresAtEpochMs: now + 1_200_000,
            envelope: encrypted,
          },
          nowEpochMs: now + 600_000,
          maximumAttemptsPerRegistration: 20,
        }),
      ),
    ).toBe("created");

    const session = (index: number): StudioSessionRecord => ({
      sessionDigest: digestAt("session", index),
      registrationDigest: "b".repeat(64),
      expiresAtEpochMs: now + 28_800_000,
      generation: 1,
      refreshOwner: null,
      refreshDispatched: false,
      refreshLeaseExpiresAtEpochMs: null,
      envelope: encrypted,
    });
    for (let index = 0; index < 1_024; index += 1)
      expect(
        await Effect.runPromise(
          store.createSession({
            record: session(index),
            nowEpochMs: now,
            maximumSessionsPerRegistration: 1_024,
          }),
        ),
      ).toBe("created");
    expect(
      await Effect.runPromise(
        store.createSession({
          record: session(1_024),
          nowEpochMs: now,
          maximumSessionsPerRegistration: 1_024,
        }),
      ),
    ).toBe("quota_exceeded");

    const acquire = (key: string, maximum: number, index: number): StudioPermitInput => ({
      key,
      owner: `owner-${index}`,
      nowEpochMs: now,
      expiresAtEpochMs: now + 10_000,
      maximum,
    });
    for (const [key, maximum] of [
      ["callback", 10],
      ["refresh-waiter", 16],
    ] as const) {
      for (let index = 0; index < maximum; index += 1)
        expect(await Effect.runPromise(store.acquirePermit(acquire(key, maximum, index)))).toBe(
          true,
        );
      expect(await Effect.runPromise(store.acquirePermit(acquire(key, maximum, maximum)))).toBe(
        false,
      );
      expect(
        await Effect.runPromise(
          store.acquirePermit({
            ...acquire(key, maximum, maximum),
            nowEpochMs: now + 10_000,
            expiresAtEpochMs: now + 20_000,
          }),
        ),
      ).toBe(true);
    }

    const fenced = session(2_000);
    const fenceStore = makeMemoryStudioStore();
    expect(
      await Effect.runPromise(
        fenceStore.createSession({
          record: fenced,
          nowEpochMs: now,
          maximumSessionsPerRegistration: 1,
        }),
      ),
    ).toBe("created");
    expect(
      (
        await Effect.runPromise(
          fenceStore.claimRefresh(
            fenced.sessionDigest,
            fenced.registrationDigest,
            1,
            "owner",
            now,
            now + 1,
          ),
        )
      ).status,
    ).toBe("claimed");
    expect(
      await Effect.runPromise(
        fenceStore.markRefreshDispatched(
          fenced.sessionDigest,
          fenced.registrationDigest,
          1,
          "owner",
        ),
      ),
    ).toBe(true);
    expect(
      (
        await Effect.runPromise(
          fenceStore.claimRefresh(
            fenced.sessionDigest,
            fenced.registrationDigest,
            1,
            "replacement",
            now + 1,
            now + 10_000,
          ),
        )
      ).status,
    ).toBe("terminal");
    await Effect.runPromise(store.close);
    await Effect.runPromise(fenceStore.close);
  });
});

describe("raw target guard", () => {
  it("accepts the exact mount and finite asset spelling", () => {
    expect(parseStudioRawTarget("/studio", "/studio")).toEqual({
      path: "/studio",
      query: "",
      route: "/",
    });
    expect(parseStudioRawTarget("/studio/assets/app-123.js", "/studio")?.route).toBe(
      "/assets/app-123.js",
    );
    const exact = `/studio/missing?${"x".repeat(8 * 1_024 - "/studio/missing?".length)}`;
    expect(exact).toHaveLength(8 * 1_024);
    expect(parseStudioRawTarget(exact, "/studio")).not.toBeNull();
    expect(parseStudioRawTarget(`${exact}x`, "/studio")).toBeNull();
  });
});
