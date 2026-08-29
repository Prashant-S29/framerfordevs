// Verifies named M7 Effect operations remain replaceable and forward every repository workflow.

import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import {
  CmsEntry,
  CmsEntryDraft,
  CmsEntryPage,
  CreateEntryInput,
  EntryRevisionPage,
  EntryValidation,
  GetEntryDraftInput,
  ListEntriesInput,
  ListEntryRevisionsInput,
  RenameEntryInput,
  RestoreEntryRevisionInput,
  SaveEntryDraftInput,
  SaveEntryDraftResult,
} from "../contracts/entries";
import { EntryRepository, makeEntryRepository } from "../services/entry-repository";
import {
  createEntry,
  getEntryDraft,
  listEntries,
  listEntryRevisions,
  renameEntry,
  restoreEntryRevision,
  saveEntryDraft,
} from "./entries";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const entryId = "019fae8b-1234-7000-8000-000000000004";
const revisionId = "019fae8b-1234-7000-8000-000000000005";
const schemaRevisionId = "019fae8b-1234-7000-8000-000000000006";
const commandId = "019fae8b-1234-7000-8000-000000000007";
const localeId = "019fae8b-1234-7000-8000-000000000008";
const workspaceId = "019fae8b-1234-7000-8000-000000000009";
const timestamp = "2026-08-08T12:00:00.000Z";
const contractHash = "a".repeat(64);
const validation = EntryValidation.make({ valid: true, issues: [], capped: false });
const entry = Schema.decodeUnknownSync(CmsEntry)({
  id: entryId,
  workspaceId,
  projectId,
  environmentId,
  collectionId,
  displayName: "Test entry",
  nameVersion: 1,
  createdByUserId: "user-1",
  createdByCredentialId: null,
  changedByUserId: "user-1",
  changedByCredentialId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const page = CmsEntryPage.make({ items: [], nextCursor: null });
const draft = Schema.decodeUnknownSync(CmsEntryDraft)({
  entry,
  localeId,
  locale: "en",
  schemaRevisionId,
  contractHash,
  sharedVersion: 0,
  sharedRevisionId: null,
  sharedValues: {},
  localizedVersion: 0,
  localizedRevisionId: null,
  localizedValues: {},
  canEditShared: true,
  validation,
});
const saveResult = Schema.decodeUnknownSync(SaveEntryDraftResult)({
  entryId,
  commandId,
  sharedChanged: false,
  sharedVersion: 0,
  sharedRevisionId: null,
  localizedChanged: false,
  localizedVersion: 0,
  localizedRevisionId: null,
  validation,
});
const revisionPage = EntryRevisionPage.make({ items: [], nextCursor: null });
const calls: Array<string> = [];
const RepositoryTest = Layer.succeed(EntryRepository, {
  ...makeEntryRepository(),
  listEntries: () => Effect.sync(() => (calls.push("list"), page)),
  createEntry: () => Effect.sync(() => (calls.push("create"), entry)),
  renameEntry: () => Effect.sync(() => (calls.push("rename"), entry)),
  getDraft: () => Effect.sync(() => (calls.push("get"), draft)),
  saveDraft: () => Effect.sync(() => (calls.push("save"), saveResult)),
  listRevisions: () => Effect.sync(() => (calls.push("revisions"), revisionPage)),
  restoreRevision: () => Effect.sync(() => (calls.push("restore"), saveResult)),
});

describe("entry operations", () => {
  layer(RepositoryTest)((it) => {
    it.effect("forwards the complete entry lifecycle through one replaceable service", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const scope = { projectId, environmentId, collectionId, locale: "en" };
        yield* listEntries(
          "user-1",
          yield* Schema.decodeUnknown(ListEntriesInput)({ ...scope, cursor: null, limit: 25 }),
        );
        yield* createEntry(
          "user-1",
          yield* Schema.decodeUnknown(CreateEntryInput)({
            ...scope,
            displayName: "Test entry",
            schemaRevisionId,
            contractHash,
            commandId,
          }),
          "request-create",
        );
        yield* renameEntry(
          "user-1",
          yield* Schema.decodeUnknown(RenameEntryInput)({
            ...scope,
            entryId,
            displayName: "Renamed entry",
            expectedNameVersion: 1,
          }),
          "request-rename",
        );
        yield* getEntryDraft(
          "user-1",
          yield* Schema.decodeUnknown(GetEntryDraftInput)({ ...scope, entryId }),
        );
        yield* saveEntryDraft(
          "user-1",
          yield* Schema.decodeUnknown(SaveEntryDraftInput)({
            ...scope,
            entryId,
            schemaRevisionId,
            contractHash,
            commandId,
            expectedSharedVersion: 0,
            expectedLocalizedVersion: 0,
            sharedMutations: [],
            localizedMutations: [],
          }),
          "request-save",
        );
        yield* listEntryRevisions(
          "user-1",
          yield* Schema.decodeUnknown(ListEntryRevisionsInput)({
            ...scope,
            entryId,
            scope: "localized",
            cursor: null,
            limit: 25,
          }),
        );
        yield* restoreEntryRevision(
          "user-1",
          yield* Schema.decodeUnknown(RestoreEntryRevisionInput)({
            ...scope,
            entryId,
            scope: "localized",
            revisionId,
            schemaRevisionId,
            contractHash,
            expectedVersion: 0,
            commandId,
          }),
          "request-restore",
        );
        assert.deepEqual(calls, [
          "list",
          "create",
          "rename",
          "get",
          "save",
          "revisions",
          "restore",
        ]);
      }),
    );
  });
});
