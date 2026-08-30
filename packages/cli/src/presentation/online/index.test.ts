import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Schema } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PresentationEditDocument } from "../document";
import { runPresentationGetOnline, runPresentationPublishOnline } from "./index";
import type { CliConfigV2 } from "../../schema";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const revisionId = "019fae8b-1234-7000-8000-000000000003";
const fieldId = "019fae8b-1234-7000-8000-000000000004";
const groupId = "019fae8b-1234-7000-8000-000000000005";
const tabId = "019fae8b-1234-7000-8000-000000000006";
const digest = "a".repeat(64);
const config: CliConfigV2 = {
  schemaVersion: 2,
  apiBaseUrl: "https://api.example.test",
  projectId,
  environment: "main",
  output: "generated",
  schema: "project.schema.ts",
};
const presentation = {
  displayName: "Posts",
  description: null,
  fields: [
    {
      fieldId,
      displayLabel: "Title",
      position: 0,
      editor: {
        helpText: null,
        placeholder: null,
        visibleToRoles: ["developer" as const],
        editableByRoles: ["developer" as const],
      },
      enumOptions: [],
    },
  ],
  editorLayout: {
    version: 1 as const,
    tabs: [
      {
        id: tabId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: ["developer" as const],
        groups: [
          {
            id: groupId,
            title: "Main",
            description: null,
            position: 0,
            columns: 1 as const,
            visibleToRoles: ["developer" as const],
            fields: [
              {
                id: fieldId,
                fieldId,
                position: 0,
                helpTextOverride: null,
                visibleToRoles: ["developer" as const],
              },
            ],
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
};
const revision = {
  collectionId: "019fae8b-1234-7000-8000-000000000007",
  revisionId,
  previousRevisionId: null,
  sequence: 1,
  schemaHash: digest,
  structureHash: "b".repeat(64),
  contractHash: "c".repeat(64),
  publishedAt: "2026-08-29T00:00:00.000Z",
};
const editableDocument = Schema.decodeUnknownSync(PresentationEditDocument)({
  documentVersion: 1,
  projectId,
  environmentId,
  environmentKey: "main",
  collection: "posts",
  expectedRevisionId: revisionId,
  expectedSequence: 1,
  presentation: { ...presentation, displayName: "Editorial posts" },
});

function success(data: object) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Completed" }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

describe("Presentation online boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FFD_MANAGEMENT_TOKEN;
  });

  it("gets one exact credential-free edit document", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(success({ revision, presentation }));
    vi.stubGlobal("fetch", fetch);

    const document = await runPresentationGetOnline({
      config,
      collection: "posts",
      environmentId,
    });
    expect(document).toMatchObject({
      documentVersion: 1,
      projectId,
      environmentId,
      environmentKey: "main",
      collection: "posts",
      expectedRevisionId: revisionId,
      expectedSequence: 1,
      presentation,
    });
    expect(JSON.stringify(document)).not.toContain("management-token");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it("publishes exact file authority with one content-free retry journal", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const root = await mkdtemp(join(tmpdir(), "ffd-presentation-online-"));
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementationOnce(async (_url, request) => {
      const body: unknown = JSON.parse(String(request?.body));
      const commandId =
        typeof body === "object" && body !== null ? Reflect.get(body, "commandId") : undefined;
      return success({
        commandId,
        replayed: false,
        noOp: false,
        revision: { ...revision, sequence: 2, previousRevisionId: revisionId },
        presentation: { ...presentation, displayName: "Editorial posts" },
      });
    });
    vi.stubGlobal("fetch", fetch);
    try {
      const result = await runPresentationPublishOnline({
        config,
        projectRoot: root,
        document: editableDocument,
      });
      expect(result).toMatchObject({
        command: "presentation publish",
        accepted: true,
        replayed: false,
        noOp: false,
        collection: "posts",
        revision: { sequence: 2 },
      });
      await expect(
        readFile(join(root, ".framerfordevs/retry/presentation-publish.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
      expect(body).toMatchObject({
        expectedRevisionId: revisionId,
        expectedSequence: 1,
        presentation: { displayName: "Editorial posts" },
      });
      expect(body.commandId).toMatch(/^[0-9a-f-]{36}$/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("retains and reuses the exact command after uncertain transport", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const root = await mkdtemp(join(tmpdir(), "ffd-presentation-retry-"));
    const commandIds: Array<unknown> = [];
    const uncertainFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce((_url, request) => {
        const body: unknown = JSON.parse(String(request?.body));
        commandIds.push(
          typeof body === "object" && body !== null ? Reflect.get(body, "commandId") : undefined,
        );
        return Promise.reject(new Error("connection reset"));
      });
    vi.stubGlobal("fetch", uncertainFetch);
    try {
      await expect(
        runPresentationPublishOnline({ config, projectRoot: root, document: editableDocument }),
      ).rejects.toThrow("CLI_AUTHORING_TRANSPORT");
      const retained = JSON.parse(
        await readFile(join(root, ".framerfordevs/retry/presentation-publish.json"), "utf8"),
      );

      const confirmedFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementationOnce((_url, request) => {
          const body: unknown = JSON.parse(String(request?.body));
          commandIds.push(
            typeof body === "object" && body !== null ? Reflect.get(body, "commandId") : undefined,
          );
          return Promise.resolve(
            success({
              commandId: retained.commandId,
              replayed: true,
              noOp: false,
              revision: { ...revision, sequence: 2, previousRevisionId: revisionId },
              presentation: editableDocument.presentation,
            }),
          );
        });
      vi.stubGlobal("fetch", confirmedFetch);
      const replay = await runPresentationPublishOnline({
        config,
        projectRoot: root,
        document: editableDocument,
      });
      expect(commandIds).toEqual([retained.commandId, retained.commandId]);
      expect(replay.replayed).toBe(true);
      await expect(
        readFile(join(root, ".framerfordevs/retry/presentation-publish.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
