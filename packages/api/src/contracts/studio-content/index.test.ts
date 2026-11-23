import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  StudioBoundedMatchCount,
  StudioContentApiError,
  StudioContentApiFailure,
  StudioContentContext,
  StudioContentContextResponse,
  StudioContentSearchText,
  StudioCreateEntryRequest,
  StudioCreateEntryResponse,
  StudioEntryPage,
  StudioEntryPageResponse,
  StudioEntryValidation,
  StudioEntryWorkspaceResponse,
  StudioFormField,
  StudioListEntriesQuery,
  StudioNewEntryWorkspaceResponse,
  StudioRenameEntryResponse,
  StudioResolveEntriesRequest,
  StudioResolveEntriesResponse,
  StudioSaveEntryDraftResponse,
  StudioSearchEntriesRequest,
  StudioContentApiErrorCode,
  StudioListPublicationsQuery,
  StudioListRevisionsQuery,
  StudioPublicationPageResponse,
  StudioPublicationPlanResponse,
  StudioPublicationStatusResponse,
  StudioPublishEntryRequest,
  StudioPublishResponse,
  StudioRestoreRevisionRequest,
  StudioRestoreRevisionResponse,
  StudioRevisionComparisonResponse,
  StudioRevisionPageResponse,
  StudioRevisionResponse,
  StudioUnpublishEntryRequest,
  StudioUnpublishResponse,
  StudioValidatePublicationRequest,
  studioContentLimits,
} from "./index";

const ids = {
  locale: "019fae8b-1234-7000-8000-000000000001",
  collection: "019fae8b-1234-7000-8000-000000000002",
  entry: "019fae8b-1234-7000-8000-000000000003",
  field: "019fae8b-1234-7000-8000-000000000004",
  revision: "019fae8b-1234-7000-8000-000000000005",
  sharedRevision: "019fae8b-1234-7000-8000-000000000006",
  localizedRevision: "019fae8b-1234-7000-8000-000000000007",
  command: "019fae8b-1234-7000-8000-000000000008",
  tab: "019fae8b-1234-7000-8000-000000000009",
  group: "019fae8b-1234-7000-8000-000000000010",
  placement: "019fae8b-1234-7000-8000-000000000011",
};

describe("Studio Content contracts", () => {
  it.effect("strictly decodes bounded browse and normalized search requests", () =>
    Effect.gen(function* () {
      const browse = yield* Schema.decodeUnknownEffect(StudioListEntriesQuery, {
        onExcessProperty: "error",
      })({
        cursor: null,
        limit: 25,
      });
      const search = yield* Schema.decodeUnknownEffect(StudioSearchEntriesRequest, {
        onExcessProperty: "error",
      })({
        query: "  Café  ",
        cursor: null,
        limit: 50,
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknownEffect(StudioSearchEntriesRequest, { onExcessProperty: "error" })({
          query: "posts",
          cursor: null,
          limit: 25,
          unexpected: true,
        }),
      );

      const defaults = yield* Schema.decodeUnknownEffect(StudioListEntriesQuery, {
        onExcessProperty: "error",
      })({});

      assert.strictEqual(browse.limit, 25);
      assert.strictEqual(defaults.limit, 25);
      assert.strictEqual(defaults.cursor, null);
      assert.strictEqual(search.query, "Café");
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it("decodes every success DTO and rejects unknown envelope and nested keys", () => {
    const entry = {
      id: ids.entry,
      displayName: "Entry",
      nameVersion: 1,
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
    };
    const capabilities = {
      canCreate: true,
      canRename: true,
      canSaveLocalized: true,
      canSaveShared: true,
      canPublish: true,
      canPublishPresentation: false,
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
          configuration: {},
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
    const validation = { status: "valid", issues: [], capped: false };
    const page = {
      items: [entry],
      hasMore: false,
      nextCursor: null,
      count: { value: 1, relation: "exact" },
    };
    const draft = {
      entry,
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      sharedVersion: 1,
      sharedRevisionId: ids.sharedRevision,
      sharedValues: {},
      localizedVersion: 1,
      localizedRevisionId: ids.localizedRevision,
      localizedValues: { [ids.field]: "Visible" },
      validation,
    };
    const success = (data: unknown) => ({
      ok: true,
      data,
      error: null,
      message: "Studio Content operation completed.",
    });
    const decoders = [
      () =>
        Schema.decodeUnknownSync(StudioContentContextResponse, { onExcessProperty: "error" })(
          success({
            locales: [
              {
                id: ids.locale,
                tag: "en",
                displayName: "English",
                canRead: true,
                canWrite: true,
                canPublish: true,
              },
            ],
            collections: [{ id: ids.collection, displayName: "Entries", capabilities }],
            configurationNotices: [],
          }),
        ),
      () =>
        Schema.decodeUnknownSync(StudioEntryPageResponse, { onExcessProperty: "error" })(
          success(page),
        ),
      () =>
        Schema.decodeUnknownSync(StudioResolveEntriesResponse, { onExcessProperty: "error" })(
          success({ items: [{ id: ids.entry, displayName: "Entry" }] }),
        ),
      () =>
        Schema.decodeUnknownSync(StudioNewEntryWorkspaceResponse, { onExcessProperty: "error" })(
          success({ localeId: ids.locale, locale: "en", form, capabilities }),
        ),
      () =>
        Schema.decodeUnknownSync(StudioEntryWorkspaceResponse, { onExcessProperty: "error" })(
          success({
            localeId: ids.locale,
            locale: "en",
            form,
            capabilities,
            draft,
            publication: {
              state: "never_published",
              stateVersion: 0,
              currentPublication: null,
              sharedChanged: false,
              localizedChanged: false,
              schemaChanged: false,
              changedSincePublication: false,
            },
          }),
        ),
      () =>
        Schema.decodeUnknownSync(StudioCreateEntryResponse, { onExcessProperty: "error" })(
          success({
            entry,
            commandId: ids.command,
            sharedVersion: 1,
            sharedRevisionId: ids.sharedRevision,
            localizedVersion: 1,
            localizedRevisionId: ids.localizedRevision,
            validation,
          }),
        ),
      () =>
        Schema.decodeUnknownSync(StudioRenameEntryResponse, { onExcessProperty: "error" })(
          success(entry),
        ),
      () =>
        Schema.decodeUnknownSync(StudioSaveEntryDraftResponse, { onExcessProperty: "error" })(
          success({
            entryId: ids.entry,
            commandId: ids.command,
            sharedChanged: false,
            sharedVersion: 1,
            sharedRevisionId: ids.sharedRevision,
            localizedChanged: true,
            localizedVersion: 2,
            localizedRevisionId: ids.localizedRevision,
            validation,
          }),
        ),
    ];

    for (const decode of decoders) decode();
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioEntryPageResponse, { onExcessProperty: "error" })({
        ...success(page),
        unexpected: true,
      }),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioEntryPageResponse, { onExcessProperty: "error" })(
        success({ ...page, items: [{ ...entry, unexpected: true }] }),
      ),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioNewEntryWorkspaceResponse, { onExcessProperty: "error" })(
        success({
          localeId: ids.locale,
          locale: "en",
          form: { ...form, unexpected: true },
          capabilities,
        }),
      ),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioContentApiFailure, { onExcessProperty: "error" })({
        ok: false,
        data: null,
        error: {
          code: "DRAFT_VERSION_CONFLICT",
          message: "Conflict.",
          retryable: false,
          requestId: "request-1",
          details: [{ code: "conflict", message: "Conflict.", unexpected: true }],
        },
        message: "Conflict.",
      }),
    );
  });

  it("bounds reference-label resolution to unique requested entry IDs", () => {
    assert.deepStrictEqual(
      Schema.decodeUnknownSync(StudioResolveEntriesRequest, { onExcessProperty: "error" })({
        entryIds: [ids.entry],
      }).entryIds.map(String),
      [ids.entry],
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioResolveEntriesRequest, { onExcessProperty: "error" })({
        entryIds: [ids.entry, ids.entry],
      }),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioResolveEntriesRequest, { onExcessProperty: "error" })({
        entryIds: Array.from(
          { length: studioContentLimits.maximumResolvedEntries + 1 },
          (_, index) => `019fae8b-1234-7000-8000-${String(index).padStart(12, "0")}`,
        ),
      }),
    );
  });

  it("locks closed configuration reasons without exposing schema details", () => {
    const error = Schema.decodeUnknownSync(StudioContentApiError, { onExcessProperty: "error" })({
      code: "STUDIO_COLLECTION_CONFIGURATION_INVALID",
      message: "The collection configuration is invalid.",
      configurationReason: "projection_invalid",
      retryable: false,
      requestId: "request-studio-content-test",
    });

    assert.strictEqual(error.configurationReason, "projection_invalid");
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioContentApiError, { onExcessProperty: "error" })({
        ...error,
        configurationReason: "field_hidden",
      }),
    );
  });

  it("rejects a field configuration that does not match its discriminated kind", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioFormField, { onExcessProperty: "error" })({
        id: "019fae8b-1234-7000-8000-000000000003",
        parentFieldId: null,
        nodeRole: "root",
        displayLabel: "Amount",
        kind: "number",
        required: false,
        localization: "localized",
        position: 0,
        helpText: null,
        placeholder: null,
        configuration: { maxLength: 10 },
        children: [],
      }),
    );
  });

  it("enforces collection, locale, notice, page, issue, mutation, and count bounds", () => {
    const locale = {
      id: ids.locale,
      tag: "en",
      displayName: "English",
      canRead: true,
      canWrite: true,
      canPublish: true,
    };
    const capabilities = {
      canCreate: true,
      canRename: true,
      canSaveLocalized: true,
      canSaveShared: true,
      canPublish: true,
      canPublishPresentation: false,
    };
    const collection = { id: ids.collection, displayName: "Entries", capabilities };
    const notice = {
      collectionId: ids.collection,
      displayName: "Entries",
      reason: "empty_schema",
    };
    const maximumContext = Schema.decodeUnknownSync(StudioContentContext, {
      onExcessProperty: "error",
    })({
      locales: Array.from({ length: 100 }, () => locale),
      collections: Array.from({ length: 50 }, () => collection),
      configurationNotices: Array.from({ length: 50 }, () => notice),
    });
    assert.isBelow(
      Buffer.byteLength(JSON.stringify(maximumContext), "utf8"),
      studioContentLimits.responseBytes,
    );
    for (const invalid of [
      {
        locales: Array.from({ length: 101 }, () => locale),
        collections: [],
        configurationNotices: [],
      },
      {
        locales: [],
        collections: Array.from({ length: 51 }, () => collection),
        configurationNotices: [],
      },
      {
        locales: [],
        collections: [],
        configurationNotices: Array.from({ length: 51 }, () => notice),
      },
    ]) {
      assert.throws(() =>
        Schema.decodeUnknownSync(StudioContentContext, { onExcessProperty: "error" })(invalid),
      );
    }
    const entry = {
      id: ids.entry,
      displayName: "Entry",
      nameVersion: 1,
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
    };
    Schema.decodeUnknownSync(StudioEntryPage, { onExcessProperty: "error" })({
      items: Array.from({ length: 50 }, () => entry),
      hasMore: false,
      nextCursor: null,
      count: { value: 50, relation: "exact" },
    });
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioEntryPage, { onExcessProperty: "error" })({
        items: Array.from({ length: 51 }, () => entry),
        hasMore: true,
        nextCursor: null,
        count: { value: 51, relation: "exact" },
      }),
    );
    const issue = {
      fieldId: ids.field,
      path: ids.field,
      scope: "localized",
      localeId: ids.locale,
      locale: "en",
      code: "required",
      message: "Required.",
    };
    Schema.decodeUnknownSync(StudioEntryValidation, { onExcessProperty: "error" })({
      status: "invalid",
      issues: Array.from({ length: 50 }, () => issue),
      capped: true,
    });
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioEntryValidation, { onExcessProperty: "error" })({
        status: "invalid",
        issues: Array.from({ length: 51 }, () => issue),
        capped: true,
      }),
    );
    const mutation = { operation: "unset", path: [ids.field] };
    Schema.decodeUnknownSync(StudioCreateEntryRequest, { onExcessProperty: "error" })({
      displayName: "Entry",
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      commandId: ids.command,
      sharedMutations: Array.from({ length: 500 }, () => mutation),
      localizedMutations: [],
    });
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioCreateEntryRequest, { onExcessProperty: "error" })({
        displayName: "Entry",
        schemaRevisionId: ids.revision,
        contractHash: "a".repeat(64),
        commandId: ids.command,
        sharedMutations: Array.from({ length: 501 }, () => mutation),
        localizedMutations: [],
      }),
    );

    for (const value of [0, 1, 999, 1_000]) {
      assert.strictEqual(
        Schema.decodeUnknownSync(StudioBoundedMatchCount, { onExcessProperty: "error" })({
          value,
          relation: "exact",
        }).value,
        value,
      );
    }
    Schema.decodeUnknownSync(StudioBoundedMatchCount, { onExcessProperty: "error" })({
      value: 1_000,
      relation: "at_least",
    });
    for (const invalid of [
      { value: 1_001, relation: "exact" },
      { value: 999, relation: "at_least" },
      { value: 1_000, relation: "more" },
    ]) {
      assert.throws(() =>
        Schema.decodeUnknownSync(StudioBoundedMatchCount, { onExcessProperty: "error" })(invalid),
      );
    }
  });

  it("bounds context projections and exact versus capped counts", () => {
    const context = Schema.decodeUnknownSync(StudioContentContext, { onExcessProperty: "error" })({
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
      collections: [],
      configurationNotices: [
        {
          collectionId: ids.collection,
          displayName: "Posts",
          reason: "empty_schema",
        },
      ],
    });
    const exact = Schema.decodeUnknownSync(StudioBoundedMatchCount, { onExcessProperty: "error" })({
      value: 1_000,
      relation: "exact",
    });
    const capped = Schema.decodeUnknownSync(StudioBoundedMatchCount, { onExcessProperty: "error" })(
      {
        value: 1_000,
        relation: "at_least",
      },
    );

    assert.strictEqual(context.configurationNotices[0]?.reason, "empty_schema");
    assert.strictEqual(exact.relation, "exact");
    assert.strictEqual(capped.relation, "at_least");
    assert.strictEqual(
      Schema.decodeUnknownSync(StudioContentSearchText, { onExcessProperty: "error" })("  posts  "),
      "posts",
    );
  });
});

describe("Studio Content revision and publication contracts", () => {
  const id = (suffix: string) => `019fae8b-1234-7000-8000-0000000001${suffix}`;
  const hash = "a".repeat(64);
  const success = (data: unknown) => ({
    ok: true,
    data,
    error: null,
    message: "Studio Content operation completed.",
  });
  const revision = {
    id: id("01"),
    scope: "localized",
    sequence: 2,
    previousRevisionId: id("02"),
    schemaRevisionId: id("03"),
    contractHash: hash,
    changedFieldIds: [id("04")],
    restoredFromRevisionId: null,
    authoredByUserId: "user-1",
    authoredByCredentialId: null,
    authoredAt: "2026-11-01T00:00:00.000Z",
    compatible: true,
  };
  const publication = {
    id: id("05"),
    sequence: 1,
    schemaRevisionId: id("03"),
    contractHash: hash,
    changedFieldIds: [],
    publishedAt: "2026-11-01T00:00:00.000Z",
    current: true,
  };
  const validation = { status: "valid", issues: [], capped: false };

  it("decodes every revision and publication DTO strictly", () => {
    const decoders: ReadonlyArray<readonly [Schema.Codec<unknown, unknown>, unknown]> = [
      [StudioRevisionPageResponse, { items: [revision], nextCursor: "abc_DEF-1" }],
      [StudioRevisionResponse, { revision, values: { [id("04")]: "Title" } }],
      [
        StudioRevisionComparisonResponse,
        {
          from: revision,
          to: { ...revision, compatible: false },
          items: [
            {
              fieldId: id("04"),
              change: "changed",
              before: "a",
              after: "b",
              inCurrentSchema: true,
            },
          ],
          restrictedChanges: true,
          schemaDiffers: true,
        },
      ],
      [
        StudioRestoreRevisionResponse,
        {
          entryId: id("06"),
          commandId: id("07"),
          sharedChanged: false,
          sharedVersion: 1,
          sharedRevisionId: null,
          localizedChanged: true,
          localizedVersion: 3,
          localizedRevisionId: id("08"),
          validation,
        },
      ],
      [
        StudioPublicationStatusResponse,
        {
          state: "published",
          stateVersion: 1,
          currentPublication: publication,
          sharedChanged: false,
          localizedChanged: true,
          schemaChanged: false,
          changedSincePublication: true,
        },
      ],
      [StudioPublicationPageResponse, { items: [publication], nextCursor: null }],
      [
        StudioPublicationPlanResponse,
        {
          authorityHash: hash,
          stateVersion: 0,
          currentPublicationId: null,
          schemaRevisionId: id("03"),
          contractHash: hash,
          sharedVersion: 0,
          sharedRevisionId: null,
          localizedVersion: 1,
          localizedRevisionId: id("08"),
          wouldCreatePublication: true,
          validation,
          entryIssues: [{ code: "publication_snapshot_too_large", message: "Too large." }],
        },
      ],
      [
        StudioPublishResponse,
        {
          commandId: id("07"),
          resultKind: "changed",
          stateVersion: 1,
          publication,
          delivery: { status: "verified", currentPublicationId: id("05") },
        },
      ],
      [
        StudioUnpublishResponse,
        {
          commandId: id("07"),
          resultKind: "no_op",
          stateVersion: 0,
          unpublishedPublicationId: null,
          unpublishedAt: "2026-11-01T00:00:00.000Z",
          delivery: { status: "superseded", currentPublicationId: id("05") },
        },
      ],
    ];
    for (const [schema, data] of decoders) {
      const decode = Schema.decodeUnknownExit(schema, { onExcessProperty: "error" });
      assert.isTrue(Exit.isSuccess(decode(success(data))));
      assert.isTrue(
        Exit.isFailure(decode(success({ ...(typeof data === "object" ? data : {}), extra: 1 }))),
      );
    }
  });

  it("rejects unknown publication states and unbounded revision pages", () => {
    const status = Schema.decodeUnknownExit(StudioPublicationStatusResponse, {
      onExcessProperty: "error",
    });
    assert.isTrue(
      Exit.isFailure(
        status(
          success({
            state: "draft",
            stateVersion: 0,
            currentPublication: null,
            sharedChanged: false,
            localizedChanged: false,
            schemaChanged: false,
            changedSincePublication: false,
          }),
        ),
      ),
    );
    const page = Schema.decodeUnknownExit(StudioRevisionPageResponse, {
      onExcessProperty: "error",
    });
    assert.isTrue(
      Exit.isFailure(
        page(success({ items: Array.from({ length: 51 }, () => revision), nextCursor: null })),
      ),
    );
  });

  it("decodes request bodies and queries strictly with bounded defaults", () => {
    const listRevisions = Schema.decodeUnknownSync(StudioListRevisionsQuery, {
      onExcessProperty: "error",
    })({ scope: "shared" });
    assert.strictEqual(Number(listRevisions.limit), studioContentLimits.pageLimitDefault);
    assert.strictEqual(listRevisions.cursor, null);
    assert.isTrue(
      Exit.isFailure(
        Schema.decodeUnknownExit(StudioListRevisionsQuery, { onExcessProperty: "error" })({
          scope: "both",
        }),
      ),
    );
    assert.isTrue(
      Exit.isFailure(
        Schema.decodeUnknownExit(StudioListPublicationsQuery, { onExcessProperty: "error" })({
          limit: 51,
        }),
      ),
    );
    const validate = Schema.decodeUnknownExit(StudioValidatePublicationRequest, {
      onExcessProperty: "error",
    });
    assert.isTrue(Exit.isSuccess(validate({})));
    assert.isTrue(Exit.isFailure(validate({ force: true })));
    assert.isTrue(Exit.isFailure(validate([])));
    assert.isTrue(Exit.isFailure(validate(null)));
    const restore = {
      scope: "localized",
      schemaRevisionId: id("03"),
      contractHash: hash,
      expectedVersion: 2,
      commandId: id("07"),
    };
    assert.isTrue(
      Exit.isSuccess(
        Schema.decodeUnknownExit(StudioRestoreRevisionRequest, { onExcessProperty: "error" })(
          restore,
        ),
      ),
    );
    assert.isTrue(
      Exit.isFailure(
        Schema.decodeUnknownExit(StudioRestoreRevisionRequest, { onExcessProperty: "error" })({
          ...restore,
          revisionId: id("01"),
        }),
      ),
    );
    const publish = {
      commandId: id("07"),
      authorityHash: hash,
      expectedStateVersion: 0,
      expectedPublicationId: null,
      expectedSchemaRevisionId: id("03"),
      expectedContractHash: hash,
      expectedSharedVersion: 0,
      expectedSharedRevisionId: null,
      expectedLocalizedVersion: 1,
      expectedLocalizedRevisionId: id("08"),
    };
    const decodePublish = Schema.decodeUnknownExit(StudioPublishEntryRequest, {
      onExcessProperty: "error",
    });
    assert.isTrue(Exit.isSuccess(decodePublish(publish)));
    assert.isTrue(Exit.isFailure(decodePublish({ ...publish, authorityHash: "short" })));
    const decodeUnpublish = Schema.decodeUnknownExit(StudioUnpublishEntryRequest, {
      onExcessProperty: "error",
    });
    assert.isTrue(
      Exit.isSuccess(
        decodeUnpublish({
          commandId: id("07"),
          expectedStateVersion: 1,
          expectedPublicationId: null,
        }),
      ),
    );
    assert.isTrue(Exit.isFailure(decodeUnpublish({ commandId: id("07") })));
  });

  it("registers the revision and publication error codes", () => {
    for (const code of [
      "REVISION_INCOMPATIBLE",
      "PUBLICATION_INVALID",
      "PUBLICATION_STATE_CONFLICT",
    ]) {
      assert.isTrue(Exit.isSuccess(Schema.decodeUnknownExit(StudioContentApiErrorCode)(code)));
    }
  });
});
