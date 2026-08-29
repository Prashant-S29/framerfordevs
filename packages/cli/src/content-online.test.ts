import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PreparedContentCommand } from "./content-bin";
import { runContentOnline } from "./content-online";
import type { CliConfigV2 } from "./schema";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const entryId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const digest = "a".repeat(64);
const config: CliConfigV2 = {
  schemaVersion: 2,
  apiBaseUrl: "https://api.example.test",
  projectId,
  environment: "main",
  output: "generated",
  schema: "project.schema.ts",
};
const summary = {
  id: entryId,
  displayName: "Post",
  nameVersion: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};
const validation = { valid: true, issues: [], capped: false };

function success(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Completed" }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function command(
  projectRoot: string,
  name: PreparedContentCommand["command"],
): PreparedContentCommand {
  return {
    command: name,
    config,
    projectRoot,
    collection: "posts",
    locale: "en-US",
    entryId: name === "entry create" || name === "entry list" ? undefined : entryId,
    name: name === "entry create" ? "Post" : undefined,
    environmentId,
    mutations:
      name === "entry create" || name === "entry update"
        ? [{ operation: "unset", scope: "localized", path: ["title"] }]
        : [],
    createAuthority: name === "entry create" ? { revisionId, contractHash: digest } : null,
  };
}

function requestBody(request: RequestInit | undefined) {
  const value: unknown = JSON.parse(String(request?.body));
  if (typeof value !== "object" || value === null) throw new Error("Expected request body.");
  return value;
}

describe("content CLI online orchestration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FFD_MANAGEMENT_TOKEN;
  });

  it("rejects repeated list cursors within the fixed page bound", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const cursor = "cursor_1";
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        success({
          projectId,
          environmentId,
          environmentKey: "main",
          locales: [],
          localeContractHash: digest,
          collections: [],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(success({ items: [], nextCursor: cursor }))
      .mockResolvedValueOnce(success({ items: [], nextCursor: cursor }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      runContentOnline({ ...command("/tmp", "entry list"), environmentId: null }),
    ).rejects.toThrow("CLI_PAGINATION_INVALID");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("runs bounded list/get/create/update/publish/unpublish with exact authority", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const root = await mkdtemp(join(tmpdir(), "ffd-content-online-"));
    const requests: Array<{ url: string; request: RequestInit | undefined }> = [];
    const publication = {
      id: entryId,
      entryId,
      locale: "en-US",
      sequence: 1,
      schemaRevisionId: revisionId,
      contractHash: digest,
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: null,
      localizedVersion: 0,
      contentHash: "b".repeat(64),
      authorityHash: "c".repeat(64),
      documentHash: "d".repeat(64),
      size: {
        documentBytes: 10,
        referenceManifestBytes: 0,
        combinedBytes: 10,
        maximumBytes: 1_000,
        bucket: "small",
      },
      publishedAt: "2026-08-24T00:00:00.000Z",
      current: true,
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, request) => {
      const url = String(input);
      requests.push({ url, request });
      if (url.includes("/schema/manifest")) {
        return success({
          projectId,
          environmentId,
          environmentKey: "main",
          locales: [],
          localeContractHash: digest,
          collections: [],
          nextCursor: null,
        });
      }
      if (url.includes("?limit=50")) return success({ items: [summary], nextCursor: null });
      if (url.endsWith("/entries") && request?.method === "POST") {
        const body = requestBody(request);
        return success({
          entry: summary,
          commandId: Reflect.get(body, "commandId"),
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedVersion: 0,
          localizedRevisionId: null,
          validation,
        });
      }
      if (url.endsWith("/draft") && request?.method === "GET") {
        return success({
          entry: summary,
          locale: "en-US",
          schemaRevisionId: revisionId,
          contractHash: digest,
          sharedVersion: 0,
          sharedRevisionId: null,
          sharedValues: {},
          localizedVersion: 0,
          localizedRevisionId: null,
          localizedValues: {},
          canEditShared: true,
          validation,
        });
      }
      if (url.endsWith("/draft") && request?.method === "PATCH") {
        const body = requestBody(request);
        return success({
          entryId,
          commandId: Reflect.get(body, "commandId"),
          sharedChanged: false,
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedChanged: true,
          localizedVersion: 1,
          localizedRevisionId: revisionId,
          validation,
        });
      }
      if (url.endsWith("/publication/validate")) {
        return success({
          entryId,
          locale: "en-US",
          stateVersion: 0,
          currentPublicationId: null,
          schemaRevisionId: revisionId,
          contractHash: digest,
          sharedRevisionId: null,
          sharedVersion: 0,
          localizedRevisionId: null,
          localizedVersion: 0,
          valid: true,
          issues: [],
          capped: false,
          contentHash: "b".repeat(64),
          authorityHash: "c".repeat(64),
          size: null,
          referencesWouldRefresh: false,
          wouldCreatePublication: true,
        });
      }
      if (url.endsWith("/publication/publish")) {
        const body = requestBody(request);
        return success({
          entryId,
          locale: "en-US",
          commandId: Reflect.get(body, "commandId"),
          stateVersion: 1,
          resultKind: "changed",
          publication,
        });
      }
      if (url.endsWith("/publication") && request?.method === "GET") {
        return success({
          entryId,
          locale: "en-US",
          state: "published",
          stateVersion: 1,
          currentPublication: publication,
          currentSchemaRevisionId: revisionId,
          currentContractHash: digest,
          currentSharedRevisionId: null,
          currentSharedVersion: 0,
          currentLocalizedRevisionId: null,
          currentLocalizedVersion: 0,
          sharedChanged: false,
          localizedChanged: false,
          schemaChanged: false,
          changedSincePublication: false,
        });
      }
      if (url.endsWith("/publication/unpublish")) {
        const body = requestBody(request);
        return success({
          entryId,
          locale: "en-US",
          commandId: Reflect.get(body, "commandId"),
          stateVersion: 2,
          resultKind: "changed",
          unpublishedPublicationId: entryId,
          unpublishedPublicationSequence: 1,
          unpublishedAt: "2026-08-24T00:00:00.000Z",
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    vi.stubGlobal("fetch", fetch);

    try {
      const listed = await runContentOnline(command(root, "entry list"));
      const draft = await runContentOnline(command(root, "entry get"));
      const created = await runContentOnline(command(root, "entry create"));
      const updated = await runContentOnline(command(root, "entry update"));
      const published = await runContentOnline(command(root, "entry publish"));
      const unpublished = await runContentOnline(command(root, "entry unpublish"));

      expect(listed).toMatchObject({ accepted: true, items: [summary] });
      expect(draft).toMatchObject({ accepted: true, draft: { entry: summary } });
      expect(created).toMatchObject({ accepted: true, created: { entry: summary } });
      expect(updated).toMatchObject({ accepted: true, updated: { localizedVersion: 1 } });
      expect(published).toMatchObject({ accepted: true, published: { stateVersion: 1 } });
      expect(unpublished).toMatchObject({ accepted: true, unpublished: { stateVersion: 2 } });
      await expect(
        readFile(join(root, ".framerfordevs/retry/content-command.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      expect(requests.some((item) => item.url.includes("/schema/manifest"))).toBe(false);
      expect(requests.every((item) => !item.url.includes("management-token"))).toBe(true);
      expect(
        requests
          .filter((item) => item.request?.body !== undefined)
          .every((item) => !String(item.request?.body).includes("management-token")),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
