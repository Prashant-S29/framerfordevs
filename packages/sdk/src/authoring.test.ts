import { strict as nodeAssert } from "node:assert";

import { assert, describe, it } from "@effect/vitest";
import { Effect, Stream } from "effect";

import { authoringV1, authoringV1Effect } from "./authoring";

const id = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const summary = {
  id,
  displayName: "Post",
  nameVersion: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};
const validation = { valid: true, issues: [], capped: false };
const authority = { projectManifestHash: "a".repeat(64), revisionIds: {} };
const publicationSize = {
  documentBytes: 1,
  referenceManifestBytes: 1,
  combinedBytes: 2,
  maximumBytes: 1_048_576,
  bucket: "small" as const,
};
const project = {
  collections: [
    {
      sourceKey: "articles",
      apiKey: "articles",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text" as const,
          required: true,
          localization: "localized" as const,
          configuration: {},
        },
      ],
    },
  ],
};
const schemaExport = {
  project,
  current: authority,
  collections: [],
  fields: [],
  enumOptions: [],
  revisions: [],
};
const schemaPlan = {
  current: authority,
  changes: [],
  candidates: [],
  valid: true,
  planHash: "a".repeat(64),
  issues: [],
};
const generatedForm = {
  source: "published" as const,
  collectionId: id,
  revisionId: id,
  formatVersion: 2 as const,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  contractHash: "a".repeat(64),
  role: "developer" as const,
  canEdit: true,
  fields: [
    {
      id,
      parentFieldId: null,
      nodeRole: "root" as const,
      apiKey: "title",
      displayLabel: "Title",
      kind: "short_text" as const,
      required: true,
      localization: "localized" as const,
      deprecated: false,
      position: 0,
      editor: {
        helpText: null,
        placeholder: null,
        visibleToRoles: ["developer" as const],
        editableByRoles: ["developer" as const],
      },
      configuration: {},
      children: [],
    },
  ],
  editableFieldIds: [id],
  editorLayout: {
    version: 1 as const,
    tabs: [
      {
        id,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: ["developer" as const],
        groups: [
          {
            id,
            title: "Main",
            description: null,
            position: 0,
            columns: 1 as const,
            visibleToRoles: ["developer" as const],
            fields: [
              {
                id,
                fieldId: id,
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
  currencyMinorUnits: {},
};
const presentation = {
  displayName: "Articles",
  description: null,
  fields: generatedForm.fields.map((field) => ({
    fieldId: field.id,
    displayLabel: field.displayLabel,
    position: field.position,
    editor: field.editor,
    enumOptions: [],
  })),
  editorLayout: generatedForm.editorLayout,
};
const presentationRevision = {
  collectionId: id,
  revisionId: id,
  previousRevisionId: null,
  sequence: 1,
  schemaHash: "b".repeat(64),
  structureHash: "c".repeat(64),
  contractHash: "a".repeat(64),
  publishedAt: "2026-08-24T00:00:00.000Z",
};
const presentationSnapshot = { revision: presentationRevision, presentation };
const presentationResult = {
  commandId: id,
  replayed: false,
  noOp: false,
  ...presentationSnapshot,
};
const allFieldConfigurations = [
  ["short_text", {}],
  ["long_text", {}],
  ["rich_text", {}],
  ["number", {}],
  ["decimal", {}],
  ["money", { currencies: ["USD"] }],
  ["boolean", {}],
  ["date", {}],
  ["date_time", {}],
  [
    "enum",
    {
      options: [
        {
          id: "019fae8b-1234-7000-8000-000000000099",
          value: "draft",
          label: "Draft",
          position: 0,
        },
      ],
    },
  ],
  ["url", {}],
  ["email", {}],
  ["slug", {}],
  ["json", {}],
  ["object", {}],
  ["list", {}],
  ["reference", { targetCollectionId: id }],
  ["external_asset", {}],
] as const;
const allKindsForm = {
  ...generatedForm,
  fields: allFieldConfigurations.map(([kind, configuration], index) => ({
    ...generatedForm.fields[0],
    id: `019fae8b-1234-7000-8000-${String(index + 100).padStart(12, "0")}`,
    apiKey: `field_${String(index)}`,
    displayLabel: `Field ${String(index)}`,
    kind,
    configuration,
  })),
  editableFieldIds: [],
  currencyMinorUnits: { USD: 2 },
};
const schemaApply = {
  commandId: id,
  replayed: false,
  noOp: false,
  projectManifestHash: "a".repeat(64),
  collections: [],
  fields: [],
  enumOptions: [],
  revisions: [],
};

function success(data: object = {}) {
  return new Response(JSON.stringify({ ok: true, data, error: null, message: "Completed." }), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

describe("Authoring v1 client", () => {
  it("sends every operation to the closed redirect-free bearer route family", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const client = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "secret-token",
      fetch: (input, init) => {
        const url = String(input);
        requests.push({ url, init });
        if (url.endsWith("/presentation") && init?.method === "GET")
          return Promise.resolve(success(presentationSnapshot));
        if (url.endsWith("/presentation") && init?.method === "POST")
          return Promise.resolve(success(presentationResult));
        if (url.endsWith("/form")) return Promise.resolve(success(generatedForm));
        if (url.endsWith("/schema/export")) return Promise.resolve(success(schemaExport));
        if (url.endsWith("/schema/plan")) return Promise.resolve(success(schemaPlan));
        if (url.endsWith("/schema/apply")) return Promise.resolve(success(schemaApply));
        if (url.includes("?limit="))
          return Promise.resolve(success({ items: [], nextCursor: null }));
        if (url.endsWith("/entries") && init?.method === "POST")
          return Promise.resolve(
            success({
              entry: summary,
              commandId: id,
              sharedVersion: 0,
              sharedRevisionId: null,
              localizedVersion: 0,
              localizedRevisionId: null,
              validation,
            }),
          );
        if (url.endsWith(`/entries/${id}`) && init?.method === "PATCH")
          return Promise.resolve(success({ ...summary, displayName: "Renamed", nameVersion: 2 }));
        if (url.endsWith("/draft") && init?.method === "GET")
          return Promise.resolve(
            success({
              entry: summary,
              locale: "en-US",
              schemaRevisionId: id,
              contractHash: "a".repeat(64),
              sharedVersion: 0,
              sharedRevisionId: null,
              sharedValues: {},
              localizedVersion: 0,
              localizedRevisionId: null,
              localizedValues: {},
              canEditShared: true,
              validation,
            }),
          );
        if (url.endsWith("/draft") && init?.method === "PATCH")
          return Promise.resolve(
            success({
              entryId: id,
              commandId: id,
              sharedChanged: false,
              sharedVersion: 0,
              sharedRevisionId: null,
              localizedChanged: false,
              localizedVersion: 0,
              localizedRevisionId: null,
              validation,
            }),
          );
        if (url.endsWith("/publication/validate"))
          return Promise.resolve(
            success({
              entryId: id,
              locale: "en-US",
              stateVersion: 0,
              currentPublicationId: null,
              schemaRevisionId: id,
              contractHash: "a".repeat(64),
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
            }),
          );
        if (url.endsWith("/publication") && init?.method === "GET")
          return Promise.resolve(
            success({
              entryId: id,
              locale: "en-US",
              state: "unpublished",
              stateVersion: 0,
              currentPublication: null,
              currentSchemaRevisionId: id,
              currentContractHash: "a".repeat(64),
              currentSharedRevisionId: null,
              currentSharedVersion: 0,
              currentLocalizedRevisionId: null,
              currentLocalizedVersion: 0,
              sharedChanged: false,
              localizedChanged: false,
              schemaChanged: false,
              changedSincePublication: false,
            }),
          );
        const publication = {
          id,
          entryId: id,
          locale: "en-US",
          sequence: 1,
          schemaRevisionId: id,
          contractHash: "a".repeat(64),
          sharedRevisionId: null,
          sharedVersion: 0,
          localizedRevisionId: null,
          localizedVersion: 0,
          contentHash: "b".repeat(64),
          authorityHash: "c".repeat(64),
          documentHash: "d".repeat(64),
          size: publicationSize,
          publishedAt: "2026-08-24T00:00:00.000Z",
          current: true,
        };
        if (url.endsWith("/publication/publish"))
          return Promise.resolve(
            success({
              entryId: id,
              locale: "en-US",
              commandId: id,
              stateVersion: 1,
              resultKind: "changed",
              publication,
            }),
          );
        if (url.endsWith("/publication/unpublish"))
          return Promise.resolve(
            success({
              entryId: id,
              locale: "en-US",
              commandId: id,
              stateVersion: 2,
              resultKind: "changed",
              unpublishedPublicationId: id,
              unpublishedPublicationSequence: 1,
              unpublishedAt: "2026-08-24T00:00:00.000Z",
            }),
          );
        return Promise.resolve(success());
      },
    });

    await client.presentation.get("articles");
    await client.presentation.publish("articles", {
      commandId: id,
      expectedRevisionId: id,
      expectedSequence: 1,
      presentation,
    });
    await client.form.get("articles");
    await client.schema.export();
    await client.schema.plan({ project });
    await client.schema.apply({
      project,
      commandId: id,
      expectedCurrent: authority,
      expectedPlanHash: "a".repeat(64),
      acknowledgedChangeIds: [],
    });
    await client.entries.list("articles", "en-US", { limit: 20 });
    await client.entries.create("articles", "en-US", {
      displayName: "Post",
      schemaRevisionId: id,
      contractHash: "a".repeat(64),
      commandId: id,
      mutations: [],
    });
    await client.entries.rename("articles", "en-US", id, {
      displayName: "Renamed",
      expectedNameVersion: 1,
    });
    await client.entries.getDraft("articles", "en-US", id);
    await client.entries.saveDraft("articles", "en-US", id, {
      schemaRevisionId: id,
      contractHash: "a".repeat(64),
      commandId: id,
      expectedSharedVersion: 0,
      expectedLocalizedVersion: 0,
      mutations: [{ operation: "unset", scope: "localized", path: ["title"] }],
    });
    await client.entries.publicationStatus("articles", "en-US", id);
    await client.entries.validatePublication("articles", "en-US", id);
    await client.entries.publish("articles", "en-US", id, {
      commandId: id,
      authorityHash: "a".repeat(64),
      expectedStateVersion: 0,
      expectedPublicationId: null,
      expectedSchemaRevisionId: id,
      expectedContractHash: "a".repeat(64),
      expectedSharedVersion: 0,
      expectedSharedRevisionId: null,
      expectedLocalizedVersion: 0,
      expectedLocalizedRevisionId: null,
    });
    await client.entries.unpublish("articles", "en-US", id, {
      commandId: id,
      expectedStateVersion: 1,
      expectedPublicationId: id,
    });

    assert.strictEqual(requests.length, 15);
    assert.deepStrictEqual(
      requests.map((request) => request.init?.method),
      [
        "GET",
        "POST",
        "GET",
        "GET",
        "POST",
        "POST",
        "GET",
        "POST",
        "PATCH",
        "GET",
        "PATCH",
        "GET",
        "POST",
        "POST",
        "POST",
      ],
    );
    for (const request of requests) {
      assert.strictEqual(request.init?.redirect, "error");
      assert.strictEqual(
        new Headers(request.init?.headers).get("authorization"),
        "Bearer secret-token",
      );
      assert.notInclude(request.url, "secret-token");
    }
    assert.include(requests[6]?.url ?? "", "limit=20");
    assert.strictEqual(requests[12]?.init?.body, "{}");
  });

  it("recursively decodes every current generated-form kind", async () => {
    const client = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () => Promise.resolve(success(allKindsForm)),
    });
    const response = await client.form.get("articles");
    nodeAssert(response.body?.ok);
    assert.strictEqual(response.body.data.fields.length, 18);
    assert.strictEqual(response.body.data.fields[5]?.kind, "money");
    assert.strictEqual(response.body.data.currencyMinorUnits.USD, 2);
  });

  it("uses exact current draft and publication authority in safe helpers", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const client = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: (input, init) => {
        const url = String(input);
        if (init?.body !== undefined)
          bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (url.endsWith("/draft") && init?.method === "GET")
          return Promise.resolve(
            success({
              entry: summary,
              locale: "en-US",
              schemaRevisionId: id,
              contractHash: "a".repeat(64),
              sharedVersion: 2,
              sharedRevisionId: id,
              sharedValues: {},
              localizedVersion: 3,
              localizedRevisionId: id,
              localizedValues: {},
              canEditShared: true,
              validation,
            }),
          );
        if (url.endsWith("/draft"))
          return Promise.resolve(
            success({
              entryId: id,
              commandId: id,
              sharedChanged: false,
              sharedVersion: 2,
              sharedRevisionId: id,
              localizedChanged: true,
              localizedVersion: 4,
              localizedRevisionId: id,
              validation,
            }),
          );
        if (url.endsWith("/publication/validate"))
          return Promise.resolve(
            success({
              entryId: id,
              locale: "en-US",
              stateVersion: 5,
              currentPublicationId: id,
              schemaRevisionId: id,
              contractHash: "a".repeat(64),
              sharedRevisionId: id,
              sharedVersion: 2,
              localizedRevisionId: id,
              localizedVersion: 4,
              valid: true,
              issues: [],
              capped: false,
              contentHash: "b".repeat(64),
              authorityHash: "c".repeat(64),
              size: null,
              referencesWouldRefresh: false,
              wouldCreatePublication: true,
            }),
          );
        return Promise.resolve(
          success({
            entryId: id,
            locale: "en-US",
            commandId: id,
            stateVersion: 6,
            resultKind: "changed",
            publication: {
              id,
              entryId: id,
              locale: "en-US",
              sequence: 1,
              schemaRevisionId: id,
              contractHash: "a".repeat(64),
              sharedRevisionId: id,
              sharedVersion: 2,
              localizedRevisionId: id,
              localizedVersion: 4,
              contentHash: "b".repeat(64),
              authorityHash: "c".repeat(64),
              documentHash: "d".repeat(64),
              size: publicationSize,
              publishedAt: "2026-08-24T00:00:00.000Z",
              current: true,
            },
          }),
        );
      },
    });

    const save = await client.helpers.saveCurrentDraft("articles", "en-US", id, id, [
      { operation: "set", scope: "localized", path: ["title"], value: "Hello" },
    ]);
    const publish = await client.helpers.validateThenPublish("articles", "en-US", id, id);

    assert.strictEqual(save.kind, "save_attempted");
    assert.strictEqual(publish.kind, "publish_attempted");
    assert.deepStrictEqual(bodies[0], {
      schemaRevisionId: id,
      contractHash: "a".repeat(64),
      commandId: id,
      expectedSharedVersion: 2,
      expectedLocalizedVersion: 3,
      mutations: [{ operation: "set", scope: "localized", path: ["title"], value: "Hello" }],
    });
    assert.deepStrictEqual(bodies.at(-1), {
      commandId: id,
      authorityHash: "c".repeat(64),
      expectedStateVersion: 5,
      expectedPublicationId: id,
      expectedSchemaRevisionId: id,
      expectedContractHash: "a".repeat(64),
      expectedSharedVersion: 2,
      expectedSharedRevisionId: id,
      expectedLocalizedVersion: 4,
      expectedLocalizedRevisionId: id,
    });
  });

  it("processes bounded imports with explicit concurrency and per-entry results", async () => {
    let active = 0;
    let maximumActive = 0;
    const client = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: async (_input, init) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        const body = JSON.parse(String(init?.body)) as { displayName?: string };
        if (body.displayName === "Fail") throw new Error("controlled failure");
        return success({
          entry: { ...summary, displayName: body.displayName ?? "Post" },
          commandId: id,
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedVersion: 0,
          localizedRevisionId: null,
          validation,
        });
      },
    });
    const results = await client.helpers.importEntries(
      "articles",
      "en-US",
      ["One", "Fail", "Three"].map((displayName) => ({
        displayName,
        schemaRevisionId: id,
        contractHash: "a".repeat(64),
        commandId: id,
        mutations: [],
      })),
      { concurrency: 2 },
    );
    assert.strictEqual(maximumActive, 2);
    assert.deepStrictEqual(
      results.map((result) => result.ok),
      [true, false, true],
    );
    await nodeAssert.rejects(
      () => client.helpers.importEntries("articles", "en-US", [], { concurrency: 17 }),
      /concurrency is out of bounds/u,
    );
  });

  it("bounds requests and rejects malformed envelopes", async () => {
    const oversized = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () => Promise.resolve(success()),
    });
    await nodeAssert.rejects(
      () =>
        oversized.entries.create("articles", "en-US", {
          displayName: "Post",
          schemaRevisionId: id,
          contractHash: "a".repeat(64),
          commandId: id,
          mutations: [
            {
              operation: "set",
              scope: "localized",
              path: ["title"],
              value: "x".repeat(1_048_577),
            },
          ],
        }),
      /request is too large/u,
    );

    const malformed = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () => Promise.resolve(new Response(JSON.stringify({ ok: true, data: [] }))),
    });
    await nodeAssert.rejects(() => malformed.schema.export(), /envelope is invalid/u);
  });

  it("rejects nested response drift and runtime-invalid request bodies", async () => {
    const invalidExport = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () =>
        Promise.resolve(
          success({
            ...schemaExport,
            current: { ...authority, unexpected: true },
          }),
        ),
    });
    await nodeAssert.rejects(() => invalidExport.schema.export(), /unexpected/u);

    const invalidForm = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () =>
        Promise.resolve(
          success({
            ...generatedForm,
            fields: [
              {
                ...generatedForm.fields[0],
                editor: { ...generatedForm.fields[0]?.editor, unexpected: true },
              },
            ],
          }),
        ),
    });
    await nodeAssert.rejects(() => invalidForm.form.get("articles"), /unexpected/u);
    const invalidFormConfiguration = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () =>
        Promise.resolve(
          success({
            ...generatedForm,
            fields: [
              {
                ...generatedForm.fields[0],
                configuration: { targetCollectionId: id },
              },
            ],
          }),
        ),
    });
    await nodeAssert.rejects(
      () => invalidFormConfiguration.form.get("articles"),
      /targetCollectionId/u,
    );

    const invalidPresentation = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () =>
        Promise.resolve(
          success({
            ...presentationSnapshot,
            presentation: {
              ...presentation,
              fields: [
                {
                  ...presentation.fields[0],
                  editor: { ...presentation.fields[0]?.editor, unexpected: true },
                },
              ],
            },
          }),
        ),
    });
    await nodeAssert.rejects(() => invalidPresentation.presentation.get("articles"), /unexpected/u);

    const invalidPlan = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () => Promise.resolve(success({ ...schemaPlan, planHash: null })),
    });
    await nodeAssert.rejects(() => invalidPlan.schema.plan({ project }), /planHash/u);

    const invalidRequest = authoringV1({
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () => Promise.resolve(success()),
    });
    nodeAssert.throws(
      () =>
        Reflect.apply(invalidRequest.presentation.publish, invalidRequest.presentation, [
          "articles",
          {
            commandId: id,
            expectedRevisionId: id,
            expectedSequence: 1,
            presentation: { ...presentation, apiKey: "forbidden" },
          },
        ]),
      /apiKey/u,
    );
    nodeAssert.throws(
      () =>
        Reflect.apply(invalidRequest.entries.rename, invalidRequest.entries, [
          "articles",
          "en-US",
          id,
          { displayName: "Renamed", expectedNameVersion: 1, force: true },
        ]),
      /force/u,
    );
    nodeAssert.throws(
      () =>
        Reflect.apply(invalidRequest.entries.create, invalidRequest.entries, [
          "articles",
          "en-US",
          {
            displayName: "Post",
            schemaRevisionId: id,
            contractHash: "a".repeat(64),
            commandId: id,
            mutations: [],
            unexpected: true,
          },
        ]),
      /unexpected/u,
    );
  });

  it("fails repeated pagination cursors and exposes an Effect client", async () => {
    let calls = 0;
    const options = {
      baseUrl: "https://api.example.test",
      projectId: id,
      environmentId,
      token: "token",
      fetch: () => {
        calls += 1;
        return Promise.resolve(success({ items: [], nextCursor: "repeat" }));
      },
    };
    const promiseClient = authoringV1(options);
    await nodeAssert.rejects(async () => {
      for await (const _page of promiseClient.entries.pages("articles", "en-US")) {
        // Consume until the repeated-cursor guard fails.
      }
    }, /repeated a cursor/u);
    assert.strictEqual(calls, 2);

    const effectClient = authoringV1Effect({
      ...options,
      fetch: (input) =>
        Promise.resolve(
          String(input).includes("/entries")
            ? success({ items: [], nextCursor: null })
            : success(schemaExport),
        ),
    });
    const response = await Effect.runPromise(effectClient.schema.export());
    const effectPresentationClient = authoringV1Effect({
      ...options,
      fetch: () => Promise.resolve(success(presentationSnapshot)),
    });
    const effectPresentation = await Effect.runPromise(
      effectPresentationClient.presentation.get("articles"),
    );
    const pages = await Effect.runPromise(
      Stream.runCollect(effectClient.entries.pages("articles", "en-US")),
    );
    assert.strictEqual(response.status, 200);
    assert.strictEqual(effectPresentation.status, 200);
    assert.strictEqual(pages.length, 1);
  });
});
