import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  AuthoringCreateEntryRequest,
  AuthoringEntryDraft,
  AuthoringGeneratedForm,
  AuthoringListEntriesQuery,
  AuthoringRenameEntryRequest,
} from "./index";

describe("authoring content contracts", () => {
  it.effect("accepts bounded entry pages and rejects excess query authority", () =>
    Effect.gen(function* () {
      const query = yield* Schema.decodeUnknown(AuthoringListEntriesQuery)({
        cursor: null,
        limit: 20,
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringListEntriesQuery)({ cursor: null, limit: 20, force: true }),
      );
      assert.strictEqual(query.limit, 20);
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("accepts optional initial mutations but rejects create authority excess", () =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknown(AuthoringCreateEntryRequest)({
        displayName: "Post",
        schemaRevisionId: "019fae8b-1234-7000-8000-000000000001",
        contractHash: "a".repeat(64),
        commandId: "019fae8b-1234-7000-8000-000000000002",
        mutations: [],
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringCreateEntryRequest)({ ...request, force: true }),
      );
      assert.deepStrictEqual(request.mutations, []);
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("normalizes bounded optimistic renames and rejects injected authority", () =>
    Effect.gen(function* () {
      const request = yield* Schema.decodeUnknown(AuthoringRenameEntryRequest)({
        displayName: "  Renamed post  ",
        expectedNameVersion: 2,
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringRenameEntryRequest)({
          ...request,
          expectedNameVersion: 2,
          force: true,
        }),
      );
      assert.strictEqual(request.displayName, "Renamed post");
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("requires immutable published role-projected form authority", () =>
    Effect.gen(function* () {
      const form = {
        source: "published",
        collectionId: "019fae8b-1234-7000-8000-000000000001",
        revisionId: "019fae8b-1234-7000-8000-000000000002",
        formatVersion: 2,
        validationProfile: "ffd-fields@1",
        currencyRegistryProfile: null,
        contractHash: "a".repeat(64),
        role: "developer",
        canEdit: true,
        fields: [],
        editableFieldIds: [],
        editorLayout: {
          version: 1,
          tabs: [
            {
              id: "019fae8b-1234-7000-8000-000000000003",
              title: "Content",
              description: null,
              position: 0,
              visibleToRoles: ["developer"],
              groups: [
                {
                  id: "019fae8b-1234-7000-8000-000000000004",
                  title: "Main",
                  description: null,
                  position: 0,
                  columns: 1,
                  visibleToRoles: ["developer"],
                  fields: [],
                },
              ],
            },
          ],
          sidebarGroups: [],
        },
        currencyMinorUnits: {},
      };
      const decoded = yield* Schema.decodeUnknown(AuthoringGeneratedForm)(form);
      const draft = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringGeneratedForm)({ ...form, source: "draft" }),
      );
      assert.strictEqual(decoded.source, "published");
      assert.isTrue(Exit.isFailure(draft));
    }),
  );

  it.effect("keeps actor and tenant metadata out of projected drafts", () =>
    Effect.gen(function* () {
      const draft = yield* Schema.decodeUnknown(AuthoringEntryDraft)({
        entry: {
          id: "019fae8b-1234-7000-8000-000000000001",
          displayName: "Post",
          nameVersion: 1,
          createdAt: "2026-08-24T00:00:00.000Z",
          updatedAt: "2026-08-24T00:00:00.000Z",
        },
        locale: "en-US",
        schemaRevisionId: "019fae8b-1234-7000-8000-000000000002",
        contractHash: "a".repeat(64),
        sharedVersion: 0,
        sharedRevisionId: null,
        sharedValues: {},
        localizedVersion: 1,
        localizedRevisionId: "019fae8b-1234-7000-8000-000000000003",
        localizedValues: { title: "Hello" },
        canEditShared: true,
        validation: { valid: true, issues: [], capped: false },
      });
      assert.deepStrictEqual(draft.localizedValues, { title: "Hello" });
      assert.notInclude(JSON.stringify(draft), "workspaceId");
      assert.notInclude(JSON.stringify(draft), "credentialId");
    }),
  );
});
