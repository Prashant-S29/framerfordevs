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
  StudioSaveEntryDraftResponse,
  StudioSearchEntriesRequest,
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
      const browse = yield* Schema.decodeUnknown(StudioListEntriesQuery)({
        cursor: null,
        limit: 25,
      });
      const search = yield* Schema.decodeUnknown(StudioSearchEntriesRequest)({
        query: "  Café  ",
        cursor: null,
        limit: 50,
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(StudioSearchEntriesRequest)({
          query: "posts",
          cursor: null,
          limit: 25,
          unexpected: true,
        }),
      );

      const defaults = yield* Schema.decodeUnknown(StudioListEntriesQuery)({});

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
        Schema.decodeUnknownSync(StudioContentContextResponse)(
          success({
            locales: [
              { id: ids.locale, tag: "en", displayName: "English", canRead: true, canWrite: true },
            ],
            collections: [{ id: ids.collection, displayName: "Entries", capabilities }],
            configurationNotices: [],
          }),
        ),
      () => Schema.decodeUnknownSync(StudioEntryPageResponse)(success(page)),
      () =>
        Schema.decodeUnknownSync(StudioNewEntryWorkspaceResponse)(
          success({ localeId: ids.locale, locale: "en", form, capabilities }),
        ),
      () =>
        Schema.decodeUnknownSync(StudioEntryWorkspaceResponse)(
          success({ localeId: ids.locale, locale: "en", form, capabilities, draft }),
        ),
      () =>
        Schema.decodeUnknownSync(StudioCreateEntryResponse)(
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
      () => Schema.decodeUnknownSync(StudioRenameEntryResponse)(success(entry)),
      () =>
        Schema.decodeUnknownSync(StudioSaveEntryDraftResponse)(
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
      Schema.decodeUnknownSync(StudioEntryPageResponse)({ ...success(page), unexpected: true }),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioEntryPageResponse)(
        success({ ...page, items: [{ ...entry, unexpected: true }] }),
      ),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioNewEntryWorkspaceResponse)(
        success({
          localeId: ids.locale,
          locale: "en",
          form: { ...form, unexpected: true },
          capabilities,
        }),
      ),
    );
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioContentApiFailure)({
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

  it("locks closed configuration reasons without exposing schema details", () => {
    const error = Schema.decodeUnknownSync(StudioContentApiError)({
      code: "STUDIO_COLLECTION_CONFIGURATION_INVALID",
      message: "The collection configuration is invalid.",
      configurationReason: "projection_invalid",
      retryable: false,
      requestId: "request-studio-content-test",
    });

    assert.strictEqual(error.configurationReason, "projection_invalid");
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioContentApiError)({
        ...error,
        configurationReason: "field_hidden",
      }),
    );
  });

  it("rejects a field configuration that does not match its discriminated kind", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioFormField)({
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
    };
    const capabilities = {
      canCreate: true,
      canRename: true,
      canSaveLocalized: true,
      canSaveShared: true,
    };
    const collection = { id: ids.collection, displayName: "Entries", capabilities };
    const notice = {
      collectionId: ids.collection,
      displayName: "Entries",
      reason: "empty_schema",
    };
    const maximumContext = Schema.decodeUnknownSync(StudioContentContext)({
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
      assert.throws(() => Schema.decodeUnknownSync(StudioContentContext)(invalid));
    }
    const entry = {
      id: ids.entry,
      displayName: "Entry",
      nameVersion: 1,
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
    };
    Schema.decodeUnknownSync(StudioEntryPage)({
      items: Array.from({ length: 50 }, () => entry),
      hasMore: false,
      nextCursor: null,
      count: { value: 50, relation: "exact" },
    });
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioEntryPage)({
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
    Schema.decodeUnknownSync(StudioEntryValidation)({
      status: "invalid",
      issues: Array.from({ length: 50 }, () => issue),
      capped: true,
    });
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioEntryValidation)({
        status: "invalid",
        issues: Array.from({ length: 51 }, () => issue),
        capped: true,
      }),
    );
    const mutation = { operation: "unset", path: [ids.field] };
    Schema.decodeUnknownSync(StudioCreateEntryRequest)({
      displayName: "Entry",
      schemaRevisionId: ids.revision,
      contractHash: "a".repeat(64),
      commandId: ids.command,
      sharedMutations: Array.from({ length: 500 }, () => mutation),
      localizedMutations: [],
    });
    assert.throws(() =>
      Schema.decodeUnknownSync(StudioCreateEntryRequest)({
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
        Schema.decodeUnknownSync(StudioBoundedMatchCount)({ value, relation: "exact" }).value,
        value,
      );
    }
    Schema.decodeUnknownSync(StudioBoundedMatchCount)({ value: 1_000, relation: "at_least" });
    for (const invalid of [
      { value: 1_001, relation: "exact" },
      { value: 999, relation: "at_least" },
      { value: 1_000, relation: "more" },
    ]) {
      assert.throws(() => Schema.decodeUnknownSync(StudioBoundedMatchCount)(invalid));
    }
  });

  it("bounds context projections and exact versus capped counts", () => {
    const context = Schema.decodeUnknownSync(StudioContentContext)({
      locales: [
        {
          id: ids.locale,
          tag: "en",
          displayName: "English",
          canRead: true,
          canWrite: true,
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
    const exact = Schema.decodeUnknownSync(StudioBoundedMatchCount)({
      value: 1_000,
      relation: "exact",
    });
    const capped = Schema.decodeUnknownSync(StudioBoundedMatchCount)({
      value: 1_000,
      relation: "at_least",
    });

    assert.strictEqual(context.configurationNotices[0]?.reason, "empty_schema");
    assert.strictEqual(exact.relation, "exact");
    assert.strictEqual(capped.relation, "at_least");
    assert.strictEqual(Schema.decodeUnknownSync(StudioContentSearchText)("  posts  "), "posts");
  });
});
