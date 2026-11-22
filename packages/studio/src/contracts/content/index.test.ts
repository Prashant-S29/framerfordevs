import { describe, expect, it, vi } from "vitest";

import { createStudioContentClient, StudioContentClientError } from "../../content-client";
import {
  decodeStudioContentContextResponse,
  decodeStudioEntryWorkspaceResponse,
  decodeStudioPublicationPlanResponse,
  decodeStudioPublicationStatusResponse,
  decodeStudioPublishResponse,
  decodeStudioResolveEntriesResponse,
  decodeStudioRevisionComparisonResponse,
  decodeStudioRevisionPageResponse,
  decodeStudioRevisionResponse,
  decodeStudioUnpublishResponse,
} from ".";

const ids = {
  collection: "11111111-1111-4111-8111-111111111111",
  entry: "22222222-2222-4222-8222-222222222222",
  field: "33333333-3333-4333-8333-333333333333",
  locale: "44444444-4444-4444-8444-444444444444",
  revision: "55555555-5555-4555-8555-555555555555",
  tab: "66666666-6666-4666-8666-666666666666",
  group: "77777777-7777-4777-8777-777777777777",
  placement: "88888888-8888-4888-8888-888888888888",
} as const;

const capabilities = {
  canCreate: true,
  canRename: true,
  canSaveLocalized: true,
  canSaveShared: false,
  canPublish: true,
};

const form = {
  collectionId: ids.collection,
  schemaRevisionId: ids.revision,
  contractHash: "a".repeat(64),
  canEdit: true,
  fields: [
    {
      id: ids.field,
      parentFieldId: null,
      nodeRole: "root",
      displayLabel: "Title",
      kind: "short_text",
      required: false,
      localization: "localized",
      position: 0,
      helpText: null,
      placeholder: null,
      configuration: { maxLength: 100 },
      children: [],
    },
  ],
  editableFieldIds: [ids.field],
  tabs: [
    {
      id: ids.tab,
      title: "Content",
      description: null,
      position: 0,
      groups: [
        {
          id: ids.group,
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          fields: [
            {
              id: ids.placement,
              fieldId: ids.field,
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

const entry = {
  id: ids.entry,
  displayName: "Article",
  nameVersion: 1,
  createdAt: "2026-09-29T00:00:00.000Z",
  updatedAt: "2026-09-29T00:00:00.000Z",
};

function success(data: unknown) {
  return { ok: true, data, error: null, message: "Studio Content loaded." };
}

function workspace() {
  return {
    localeId: ids.locale,
    locale: "en",
    form,
    capabilities,
    draft: {
      entry,
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      sharedVersion: 0,
      sharedRevisionId: null,
      sharedValues: {},
      localizedVersion: 1,
      localizedRevisionId: ids.revision,
      localizedValues: { [ids.field]: "Title" },
      validation: {
        status: "invalid",
        issues: [
          {
            fieldId: ids.field,
            path: `field/${ids.field}`,
            scope: "localized",
            localeId: ids.locale,
            locale: "en",
            code: "required",
            message: "This field value is invalid.",
          },
        ],
        capped: false,
      },
    },
    publication: {
      state: "never_published",
      stateVersion: 0,
      currentPublication: null,
      sharedChanged: false,
      localizedChanged: false,
      schemaChanged: false,
      changedSincePublication: false,
    },
  };
}

describe("Studio Content browser contracts", () => {
  it("copies exact context and rejects excess authority", () => {
    const data = {
      locales: [
        {
          id: ids.locale,
          tag: "en",
          displayName: "English",
          canRead: true,
          canWrite: true,
          canPublish: false,
        },
      ],
      collections: [{ id: ids.collection, displayName: "Articles", capabilities }],
      configurationNotices: [],
    };
    const decoded = decodeStudioContentContextResponse(success(data), 200);
    expect(decoded).toEqual(data);
    expect(decoded).not.toBe(data);
    expect(() =>
      decodeStudioContentContextResponse(
        success({ ...data, accessToken: "must-not-enter-browser-contract" }),
        200,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
  });

  it("enforces route, revision, stable validation locator, and visible value coherence", () => {
    const expected = { collectionId: ids.collection, locale: "en", entryId: ids.entry };
    expect(decodeStudioEntryWorkspaceResponse(success(workspace()), 200, expected)).toMatchObject({
      draft: { entry: { id: ids.entry }, schemaRevisionId: ids.revision },
    });
    expect(() =>
      decodeStudioEntryWorkspaceResponse(success({ ...workspace(), locale: "fr" }), 200, expected),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    expect(() =>
      decodeStudioEntryWorkspaceResponse(
        success({
          ...workspace(),
          draft: {
            ...workspace().draft,
            validation: {
              ...workspace().draft.validation,
              issues: [
                {
                  ...workspace().draft.validation.issues[0],
                  path: "private_source_key",
                },
              ],
            },
          },
        }),
        200,
        expected,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    expect(() =>
      decodeStudioEntryWorkspaceResponse(
        success({
          ...workspace(),
          form: {
            ...form,
            fields: [{ ...form.fields[0], configuration: { maxLength: "100" } }],
          },
        }),
        200,
        expected,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
  });

  it("rejects status-incoherent failures and hidden detail paths", () => {
    const failure = {
      ok: false,
      data: null,
      error: {
        code: "NOT_FOUND",
        message: "The entry is unavailable.",
        retryable: false,
        requestId: "request-1",
      },
      message: "The entry is unavailable.",
    };
    expect(() => decodeStudioContentContextResponse(failure, 409)).toThrow(
      "STUDIO_CONTENT_RESPONSE_INVALID",
    );
    expect(() =>
      decodeStudioContentContextResponse(
        {
          ...failure,
          error: {
            ...failure.error,
            code: "VALIDATION_ERROR",
            details: [
              {
                path: "fields.private_source_key",
                code: "invalid_value",
                message: "The submitted value is invalid.",
              },
            ],
          },
        },
        400,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
  });

  it("rejects duplicate or secret-bearing reference labels", () => {
    expect(
      decodeStudioResolveEntriesResponse(
        success({ items: [{ id: ids.entry, displayName: "Article" }] }),
        200,
        [ids.entry],
      ),
    ).toEqual({ items: [{ id: ids.entry, displayName: "Article" }] });
    expect(() =>
      decodeStudioResolveEntriesResponse(
        success({
          items: [
            { id: ids.entry, displayName: "Article" },
            { id: ids.entry, displayName: "Duplicate" },
          ],
        }),
        200,
        [ids.entry],
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    expect(() =>
      decodeStudioResolveEntriesResponse(
        success({
          items: [
            { id: ids.locale, displayName: "Second" },
            { id: ids.entry, displayName: "First" },
          ],
        }),
        200,
        [ids.entry, ids.locale],
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
  });

  it("uses a bounded same-origin redirect-denying Fetch request with caller cancellation", async () => {
    const signal = new AbortController().signal;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, _init) =>
      Response.json(success({ items: [{ id: ids.entry, displayName: "Article" }] }), {
        status: 200,
        headers: { "Content-Length": "154" },
      }),
    );
    const client = createStudioContentClient({ mountPath: "/studio", fetch });
    await expect(
      client.resolve({ collectionId: ids.collection, locale: "en" }, [ids.entry], signal),
    ).resolves.toEqual({ items: [{ id: ids.entry, displayName: "Article" }] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const call = fetch.mock.calls[0];
    expect(call?.[0]).toBe(
      `/studio/api/content/collections/${ids.collection}/locales/en/entries/resolve`,
    );
    expect(call?.[1]).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      redirect: "error",
      signal,
    });
    expect(call?.[1]?.body).toBe(JSON.stringify({ entryIds: [ids.entry] }));
  });

  it("rejects malformed, declared-oversized, and encoded-oversized transport values", async () => {
    const signal = new AbortController().signal;
    const malformedFetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response("not-json", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    const malformedClient = createStudioContentClient({
      mountPath: "/studio",
      fetch: malformedFetch,
    });
    await expect(malformedClient.context(signal)).rejects.toMatchObject({
      code: "STUDIO_UPSTREAM_UNAVAILABLE",
      retryable: false,
    });

    const oversizedFetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(success({ items: [] }), {
        headers: { "Content-Length": String(4 * 1_024 * 1_024 + 1) },
      }),
    );
    const oversizedClient = createStudioContentClient({
      mountPath: "/studio",
      fetch: oversizedFetch,
    });
    await expect(
      oversizedClient.resolve({ collectionId: ids.collection, locale: "en" }, [ids.entry], signal),
    ).rejects.toMatchObject({ code: "STUDIO_UPSTREAM_UNAVAILABLE" });

    const untouchedFetch = vi.fn<typeof globalThis.fetch>();
    const boundedClient = createStudioContentClient({
      mountPath: "/studio",
      fetch: untouchedFetch,
    });
    await expect(
      boundedClient.search(
        { collectionId: ids.collection, locale: "en" },
        { query: "x".repeat(2 * 1_024), cursor: null, limit: 25 },
        signal,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(untouchedFetch).not.toHaveBeenCalled();
  });

  it("preserves caller cancellation and rejects invalid resolution IDs before fetch", async () => {
    const cancellation = new DOMException("The operation was aborted.", "AbortError");
    const controller = new AbortController();
    controller.abort();
    const cancelledFetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw cancellation;
    });
    const client = createStudioContentClient({ mountPath: "/studio", fetch: cancelledFetch });
    await expect(client.context(controller.signal)).rejects.toBe(cancellation);

    const activeSignal = new AbortController().signal;
    expect(() =>
      client.resolve(
        { collectionId: ids.collection, locale: "en" },
        [ids.entry, ids.entry],
        activeSignal,
      ),
    ).toThrow(StudioContentClientError);
    expect(cancelledFetch).toHaveBeenCalledTimes(1);
  });

  it("decodes role-projected revision history and rejects hidden or incoherent fields", () => {
    const visible = new Set([ids.field]);
    const hidden = "99999999-9999-4999-8999-999999999999";
    const summary = {
      id: ids.revision,
      scope: "localized",
      sequence: 2,
      previousRevisionId: null,
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      changedFieldIds: [ids.field],
      restoredFromRevisionId: null,
      authoredByUserId: "studio-user",
      authoredByCredentialId: null,
      authoredAt: "2026-09-29T00:00:00.000Z",
      compatible: false,
    };
    expect(
      decodeStudioRevisionPageResponse(
        success({ items: [summary], nextCursor: null }),
        200,
        "localized",
        visible,
      ),
    ).toEqual({ items: [summary], nextCursor: null });
    for (const page of [
      { items: [summary], nextCursor: null, total: 1 },
      { items: [{ ...summary, changedFieldIds: [hidden] }], nextCursor: null },
      { items: [summary, summary], nextCursor: null },
      { items: [{ ...summary, authoredAt: "yesterday" }], nextCursor: null },
    ]) {
      expect(() =>
        decodeStudioRevisionPageResponse(success(page), 200, "localized", visible),
      ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    expect(() =>
      decodeStudioRevisionPageResponse(
        success({ items: [summary], nextCursor: null }),
        200,
        "shared",
        visible,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    expect(
      decodeStudioRevisionResponse(
        success({ revision: summary, values: { [ids.field]: "Old" } }),
        200,
        ids.revision,
        visible,
      ),
    ).toEqual({ revision: summary, values: { [ids.field]: "Old" } });
    expect(() =>
      decodeStudioRevisionResponse(
        success({ revision: summary, values: { [hidden]: "secret" } }),
        200,
        ids.revision,
        visible,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    const comparison = {
      from: summary,
      to: { ...summary, id: ids.entry, sequence: 3 },
      items: [
        {
          fieldId: ids.field,
          change: "changed",
          before: "Old",
          after: "New",
          inCurrentSchema: true,
        },
        { fieldId: hidden, change: "removed", before: "Gone", inCurrentSchema: false },
      ],
      restrictedChanges: true,
      schemaDiffers: false,
    };
    const expected = { fromRevisionId: ids.revision, toRevisionId: ids.entry };
    expect(
      decodeStudioRevisionComparisonResponse(success(comparison), 200, expected, visible),
    ).toEqual(comparison);
    for (const items of [
      [{ fieldId: hidden, change: "changed", before: 1, after: 2, inCurrentSchema: true }],
      [{ fieldId: ids.field, change: "added", before: 1, after: 2, inCurrentSchema: true }],
      [{ fieldId: ids.field, change: "removed", after: 2, inCurrentSchema: true }],
    ]) {
      expect(() =>
        decodeStudioRevisionComparisonResponse(
          success({ ...comparison, items }),
          200,
          expected,
          visible,
        ),
      ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    }
  });

  it("decodes publication status, plans, results, and publication failure codes", () => {
    const visible = new Set([ids.field]);
    const publication = {
      id: ids.entry,
      sequence: 1,
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      changedFieldIds: [ids.field],
      publishedAt: "2026-09-29T00:00:00.000Z",
      current: true,
    };
    const status = {
      state: "published",
      stateVersion: 1,
      currentPublication: publication,
      sharedChanged: false,
      localizedChanged: true,
      schemaChanged: false,
      changedSincePublication: true,
    };
    expect(decodeStudioPublicationStatusResponse(success(status), 200, visible)).toEqual(status);
    expect(() =>
      decodeStudioPublicationStatusResponse(
        success({ ...status, currentPublication: null }),
        200,
        visible,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    expect(() =>
      decodeStudioPublicationStatusResponse(
        success({ ...status, state: "never_published", currentPublication: null }),
        200,
        visible,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    const plan = {
      authorityHash: null,
      stateVersion: 1,
      currentPublicationId: ids.entry,
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      sharedVersion: 0,
      sharedRevisionId: null,
      localizedVersion: 1,
      localizedRevisionId: ids.revision,
      wouldCreatePublication: false,
      validation: { status: "restricted_issues", issues: [], capped: false },
      entryIssues: [{ code: "reference_unpublished", message: "A reference is unpublished." }],
    };
    expect(decodeStudioPublicationPlanResponse(success(plan), 200, visible)).toEqual(plan);
    expect(() =>
      decodeStudioPublicationPlanResponse(success({ ...plan, valid: true }), 200, visible),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    const delivery = { status: "superseded", currentPublicationId: null };
    expect(
      decodeStudioPublishResponse(
        success({
          commandId: ids.locale,
          resultKind: "changed",
          stateVersion: 2,
          publication,
          delivery,
        }),
        200,
        visible,
      ),
    ).toMatchObject({ delivery });
    expect(() =>
      decodeStudioUnpublishResponse(
        success({
          commandId: ids.locale,
          resultKind: "changed",
          stateVersion: 3,
          unpublishedPublicationId: ids.entry,
          unpublishedAt: "2026-09-29T00:00:00.000Z",
          delivery: { status: "cached", currentPublicationId: null },
        }),
        200,
      ),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
    const failure = (code: string, path: string) => ({
      ok: false,
      data: null,
      error: {
        code,
        message: "Rejected.",
        retryable: false,
        requestId: "request-1",
        details: [{ path, code: "publication_authority_changed", message: "Changed." }],
      },
      message: "Rejected.",
    });
    expect(
      decodeStudioPublicationStatusResponse(
        failure("PUBLICATION_STATE_CONFLICT", "expectedStateVersion"),
        409,
        visible,
      ),
    ).toMatchObject({ error: { code: "PUBLICATION_STATE_CONFLICT" } });
    expect(
      decodeStudioPublicationStatusResponse(
        failure("PUBLICATION_INVALID", `field/${ids.field}`),
        422,
        visible,
      ),
    ).toMatchObject({ error: { code: "PUBLICATION_INVALID" } });
    expect(
      decodeStudioPublicationStatusResponse(failure("REVISION_INCOMPATIBLE", "path"), 409, visible),
    ).toMatchObject({ error: { code: "REVISION_INCOMPATIBLE" } });
    expect(() =>
      decodeStudioPublicationStatusResponse(failure("PUBLICATION_INVALID", "entry"), 409, visible),
    ).toThrow("STUDIO_CONTENT_RESPONSE_INVALID");
  });

  it("sends bounded history and publication requests to exact same-origin routes", async () => {
    const signal = new AbortController().signal;
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        success({
          state: "never_published",
          stateVersion: 0,
          currentPublication: null,
          sharedChanged: false,
          localizedChanged: false,
          schemaChanged: false,
          changedSincePublication: false,
        }),
      ),
    );
    const client = createStudioContentClient({ mountPath: "/studio", fetch });
    const scope = { collectionId: ids.collection, locale: "en", entryId: ids.entry };
    await client.publication(scope, new Set([ids.field]), signal);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `/studio/api/content/collections/${ids.collection}/locales/en/entries/${ids.entry}/publication`,
    );
    expect(() =>
      client.revisions(
        scope,
        { scope: "shared", cursor: null, limit: 9 },
        new Set([ids.field]),
        signal,
      ),
    ).toThrow(StudioContentClientError);
    expect(() => client.revision(scope, "not-a-uuid", new Set(), signal)).toThrow(
      StudioContentClientError,
    );
    await expect(
      client.publish(scope, { padding: "x".repeat(4_096) }, new Set(), signal),
    ).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
