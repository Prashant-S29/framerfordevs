import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  createEditorAuthoringHandler,
  makeEditorAuthoringGateway,
  type EditorAuthoringGateway,
} from "./editor-authoring";
import { decodeEditorOperationRequest } from "./editor-protocol";
import { acquireContentCommand } from "./retry-journal";
import type { ContentMutationOperation } from "./schema";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const entryId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const commandId = "019fae8b-1234-7000-8000-000000000005";
const digest = "a".repeat(64);

function gateway() {
  return {
    formGet: vi.fn(async () => ({ status: 200, body: { ok: true, data: { form: true } } })),
    entriesList: vi.fn(async () => ({ status: 200, body: { ok: true, data: { items: [] } } })),
    entryGet: vi.fn(async () => ({ status: 200, body: { ok: true, data: { draft: true } } })),
    entryCreate: vi.fn(async () => ({ status: 201, body: { ok: true, data: { created: true } } })),
    entryRename: vi.fn(async () => ({ status: 200, body: { ok: true, data: { renamed: true } } })),
    entrySave: vi.fn(
      async (): Promise<{ readonly status: number; readonly body: unknown }> => ({
        status: 200,
        body: { ok: true, data: { saved: true } },
      }),
    ),
    publicationStatus: vi.fn(async () => ({ status: 200, body: { ok: true, data: {} } })),
    publicationValidate: vi.fn(async () => ({ status: 200, body: { ok: true, data: {} } })),
    publicationPublish: vi.fn(async () => ({ status: 201, body: { ok: true, data: {} } })),
    publicationUnpublish: vi.fn(async () => ({ status: 200, body: { ok: true, data: {} } })),
  } satisfies EditorAuthoringGateway;
}

function createRequest(displayName = "Private content value") {
  return decodeEditorOperationRequest({
    operation: "entry.create",
    collectionKey: "posts",
    locale: "en-US",
    displayName,
    schemaRevisionId: revisionId,
    contractHash: digest,
    mutations: [{ operation: "set", scope: "localized", path: ["title"], value: displayName }],
  });
}

describe("editor hosted Authoring gateway", () => {
  it("returns only the current local/hosted schema snapshot without gateway authority", async () => {
    const hosted = gateway();
    const handler = createEditorAuthoringHandler({
      projectRoot: "/workspace",
      projectId,
      environmentId,
      localSchema: () => ({
        localProject: { collections: [] },
        hostedProject: { collections: [] },
      }),
      gateway: hosted,
      acquireCommand: async () => ({ commandId }),
      clearCommand: async () => undefined,
    });
    expect(await handler(decodeEditorOperationRequest({ operation: "schema.local" }))).toEqual({
      status: 200,
      body: {
        ok: true,
        data: { localProject: { collections: [] }, hostedProject: { collections: [] } },
      },
    });
    expect(hosted.formGet).not.toHaveBeenCalled();
  });

  it("dispatches exact reads without command authority", async () => {
    const hosted = gateway();
    const acquire = vi.fn(async (_operation: ContentMutationOperation, _fingerprint: string) => ({
      commandId,
    }));
    const handler = createEditorAuthoringHandler({
      projectRoot: "/workspace",
      projectId,
      environmentId,
      gateway: hosted,
      acquireCommand: acquire,
      clearCommand: vi.fn(async () => undefined),
    });
    const request = decodeEditorOperationRequest({
      operation: "entries.list",
      collectionKey: "posts",
      locale: "en-US",
      limit: 25,
    });

    expect(await handler(request)).toEqual({
      status: 200,
      body: { ok: true, data: { items: [] } },
    });
    expect(hosted.entriesList).toHaveBeenCalledWith(request);
    expect(acquire).not.toHaveBeenCalled();
  });

  it("journals only operation and a content-free fingerprint before command mutations", async () => {
    const hosted = gateway();
    const acquire = vi.fn(async (_operation: ContentMutationOperation, _fingerprint: string) => ({
      commandId,
    }));
    const clear = vi.fn(async () => undefined);
    const handler = createEditorAuthoringHandler({
      projectRoot: "/workspace",
      projectId,
      environmentId,
      gateway: hosted,
      acquireCommand: acquire,
      clearCommand: clear,
    });
    const request = createRequest();

    expect(await handler(request)).toEqual({
      status: 201,
      body: { ok: true, data: { created: true } },
    });
    expect(acquire).toHaveBeenCalledOnce();
    expect(acquire.mock.calls[0]?.[0]).toBe("entry.create");
    expect(acquire.mock.calls[0]?.[1]).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify(acquire.mock.calls)).not.toContain("Private content value");
    expect(hosted.entryCreate).toHaveBeenCalledWith(request, commandId);
    expect(clear).toHaveBeenCalledWith(commandId);
  });

  it("clears a command after a confirmed hosted conflict while preserving the response", async () => {
    const hosted = gateway();
    hosted.entrySave.mockResolvedValueOnce({
      status: 409,
      body: { ok: false, error: { code: "DRAFT_CONFLICT" } },
    });
    const clear = vi.fn(async () => undefined);
    const handler = createEditorAuthoringHandler({
      projectRoot: "/workspace",
      projectId,
      environmentId,
      gateway: hosted,
      acquireCommand: async () => ({ commandId }),
      clearCommand: clear,
    });
    const request = decodeEditorOperationRequest({
      operation: "entry.save",
      collectionKey: "posts",
      locale: "en-US",
      entryId,
      schemaRevisionId: revisionId,
      contractHash: digest,
      expectedSharedVersion: 1,
      expectedLocalizedVersion: 2,
      mutations: [{ operation: "set", scope: "localized", path: ["title"], value: "local" }],
    });

    expect(await handler(request)).toEqual({
      status: 409,
      body: { ok: false, error: { code: "DRAFT_CONFLICT" } },
    });
    expect(clear).toHaveBeenCalledWith(commandId);
  });

  it("retains uncertain command authority and returns a content-free local failure", async () => {
    const hosted = gateway();
    hosted.entryCreate.mockRejectedValueOnce(new Error("transport leaked content value"));
    const clear = vi.fn(async () => undefined);
    const handler = createEditorAuthoringHandler({
      projectRoot: "/workspace",
      projectId,
      environmentId,
      gateway: hosted,
      acquireCommand: async () => ({ commandId }),
      clearCommand: clear,
    });

    const response = await handler(createRequest());
    expect(response).toEqual({
      status: 502,
      body: { ok: false, code: "EDITOR_UPSTREAM_UNAVAILABLE" },
    });
    expect(clear).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toContain("transport leaked");
    expect(JSON.stringify(response)).not.toContain("Private content value");
  });

  it("maps a real Effect journal conflict to the closed pending-command response", async () => {
    const root = await mkdtemp(join(tmpdir(), "ffd-editor-journal-"));
    try {
      await Effect.runPromise(acquireContentCommand(root, "entry.create", "a".repeat(64)));
      const hosted = gateway();
      const handler = createEditorAuthoringHandler({
        projectRoot: root,
        projectId,
        environmentId,
        gateway: hosted,
      });
      const request = decodeEditorOperationRequest({
        operation: "entry.save",
        collectionKey: "posts",
        locale: "en-US",
        entryId,
        schemaRevisionId: revisionId,
        contractHash: digest,
        expectedSharedVersion: 0,
        expectedLocalizedVersion: 0,
        mutations: [{ operation: "set", scope: "localized", path: ["title"], value: "local" }],
      });

      expect(await handler(request)).toEqual({
        status: 409,
        body: { ok: false, code: "EDITOR_COMMAND_PENDING" },
      });
      expect(hosted.entrySave).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails content-free after mutable credential authority is cleared", async () => {
    let token: string | null = "hosted-secret-token";
    const hosted = makeEditorAuthoringGateway({
      baseUrl: "https://api.example.test",
      token: () => token,
      projectId,
      environmentId,
    });
    const handler = createEditorAuthoringHandler({
      projectRoot: "/workspace",
      projectId,
      environmentId,
      gateway: hosted,
      acquireCommand: async () => ({ commandId }),
      clearCommand: async () => undefined,
    });
    token = null;
    const response = await handler(
      decodeEditorOperationRequest({ operation: "form.get", collectionKey: "posts" }),
    );
    expect(response).toEqual({
      status: 502,
      body: { ok: false, code: "EDITOR_UPSTREAM_UNAVAILABLE" },
    });
    expect(JSON.stringify(response)).not.toContain("hosted-secret-token");
  });

  it("routes optimistic rename without inventing command authority", async () => {
    const hosted = gateway();
    const acquire = vi.fn(async (_operation: ContentMutationOperation, _fingerprint: string) => ({
      commandId,
    }));
    const handler = createEditorAuthoringHandler({
      projectRoot: "/workspace",
      projectId,
      environmentId,
      gateway: hosted,
      acquireCommand: acquire,
      clearCommand: vi.fn(async () => undefined),
    });
    const request = decodeEditorOperationRequest({
      operation: "entry.rename",
      collectionKey: "posts",
      locale: "en-US",
      entryId,
      displayName: "Renamed",
      expectedNameVersion: 3,
    });

    expect((await handler(request)).status).toBe(200);
    expect(hosted.entryRename).toHaveBeenCalledWith(request);
    expect(acquire).not.toHaveBeenCalled();
  });
});
