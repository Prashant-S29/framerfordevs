import type { ProjectSchema } from "@framerfordevs/schema";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runSchemaExportOnline, runSchemaPlanOnline, runSchemaPushOnline } from "./index";
import type { CliConfigV2 } from "../../../schema";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const digest = "a".repeat(64);
const config: CliConfigV2 = {
  schemaVersion: 2,
  apiBaseUrl: "https://api.example.test",
  projectId,
  environment: "main",
  output: "generated",
  schema: "framerfordevs.schema.ts",
};
const project: ProjectSchema = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: { maxLength: 160 },
        },
      ],
    },
  ],
};

function envelope(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Success" }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function environmentPage() {
  return envelope({
    projectId,
    environmentId,
    environmentKey: "main",
    locales: [],
    localeContractHash: digest,
    collections: [],
    nextCursor: null,
  });
}

function validPlan(changes: ReadonlyArray<unknown> = []) {
  return envelope({
    current: { projectManifestHash: digest, revisionIds: {} },
    changes,
    candidates: [],
    valid: true,
    planHash: "c".repeat(64),
    issues: [],
  });
}

describe("schema Authoring online boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FFD_MANAGEMENT_TOKEN;
  });

  it("decodes complete export authority without exposing bearer state", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(environmentPage())
      .mockResolvedValueOnce(
        envelope({
          project,
          current: { projectManifestHash: digest, revisionIds: {} },
          collections: [],
          fields: [],
          enumOptions: [],
          revisions: [],
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const result = await runSchemaExportOnline(config);
    expect(result).toMatchObject({ environmentId, exported: { project } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain("management-token");
  });

  it("resolves environment authority and returns an exact content-safe plan", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(environmentPage())
      .mockResolvedValueOnce(
        envelope({
          current: { projectManifestHash: digest, revisionIds: {} },
          changes: [],
          candidates: [],
          valid: true,
          planHash: digest,
          issues: [],
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const result = await runSchemaPlanOnline({
      config,
      project,
      projectSha256: "b".repeat(64),
    });

    expect(result).toMatchObject({
      command: "schema plan",
      accepted: true,
      environmentId,
      planHash: digest,
      changes: [],
      issues: [],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    const environmentRequest = fetch.mock.calls[0];
    const planRequest = fetch.mock.calls[1];
    expect(String(environmentRequest?.[0])).toContain(
      `/projects/${projectId}/environments/main/schema/manifest`,
    );
    expect(environmentRequest?.[1]?.headers).toMatchObject({
      Authorization: "Bearer management-token",
    });
    expect(String(planRequest?.[0])).toContain(`/environments/${environmentId}/schema/plan`);
    expect(planRequest?.[1]?.method).toBe("POST");
    expect(planRequest?.[1]?.body).toBe(JSON.stringify({ project }));
  });

  it("requires the exact risky acknowledgement set before one journaled atomic apply", async () => {
    process.env.FFD_MANAGEMENT_TOKEN = "management-token";
    const root = await mkdtemp(join(tmpdir(), "ffd-schema-push-"));
    const schemaPath = join(root, "framerfordevs.schema.ts");
    await writeFile(schemaPath, "schema", "utf8");
    const changeId = "b".repeat(64);
    const change = {
      changeId,
      code: "field.kind.updated",
      classification: "breaking",
      collectionSourceKey: "posts",
      fieldSourceKey: "title",
      summary: "Field kind changed",
    };
    try {
      const rejectedFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(environmentPage())
        .mockResolvedValueOnce(validPlan([change]));
      vi.stubGlobal("fetch", rejectedFetch);
      const rejected = await runSchemaPushOnline({
        config,
        projectRoot: root,
        schemaPath,
        project,
        projectSha256: "d".repeat(64),
        acknowledgedChangeIds: [],
      });
      expect(rejected).toMatchObject({
        accepted: false,
        stage: "acknowledgements",
        requiredAcknowledgements: [changeId],
      });
      expect(rejectedFetch).toHaveBeenCalledTimes(2);

      const appliedFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(environmentPage())
        .mockResolvedValueOnce(validPlan([change]))
        .mockImplementationOnce(async (_url, request) => {
          const body: unknown = JSON.parse(String(request?.body));
          const commandId =
            typeof body === "object" && body !== null ? Reflect.get(body, "commandId") : undefined;
          return envelope({
            commandId,
            replayed: false,
            noOp: false,
            projectManifestHash: "e".repeat(64),
            collections: [],
            fields: [],
            enumOptions: [],
            revisions: [],
          });
        });
      vi.stubGlobal("fetch", appliedFetch);
      const applied = await runSchemaPushOnline({
        config,
        projectRoot: root,
        schemaPath,
        project,
        projectSha256: "d".repeat(64),
        acknowledgedChangeIds: [changeId],
      });
      expect(applied).toMatchObject({ accepted: true, stage: "applied", replayed: false });
      expect(appliedFetch).toHaveBeenCalledTimes(3);
      await expect(
        readFile(join(root, ".framerfordevs/retry/schema-apply.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
      const lock = JSON.parse(
        await readFile(join(root, ".framerfordevs/schema.lock.json"), "utf8"),
      );
      expect(lock).toMatchObject({
        lockVersion: 2,
        projectId,
        environmentId,
        projectManifestHash: "e".repeat(64),
      });
      const applyBody = JSON.parse(String(appliedFetch.mock.calls[2]?.[1]?.body));
      expect(applyBody.acknowledgedChangeIds).toEqual([changeId]);
      expect(applyBody.commandId).toMatch(/^[0-9a-f-]{36}$/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
