import { assert, describe, layer } from "@effect/vitest";
import { Effect, Exit, Layer, Schema } from "effect";

import {
  CollectionDraftSchema,
  GetCollectionDraftInput,
  GetLatestPublishedSchemaInput,
  GetPublishedSchemaRevisionInput,
  PublishedSchemaRevision,
} from "../../contracts/schema";
import { TelemetryLive } from "../../observability/telemetry";
import { SchemaRepository, makeSchemaRepository } from "../../services/schema/repository";
import { getCollectionDraft, getLatestPublishedSchema, getPublishedSchemaRevision } from "./index";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const revisionId = "019fae8b-1234-7000-8000-000000000004";
const commandId = "019fae8b-1234-7000-8000-000000000005";
const fieldId = "019fae8b-1234-7000-8000-000000000006";
const workspaceId = "019fae8b-1234-7000-8000-000000000007";
const timestamp = "2026-08-01T12:00:00.000Z";
const editor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: [
    "owner",
    "developer",
    "content_admin",
    "editor",
    "reviewer",
    "client_editor",
    "read_only",
  ],
  editableByRoles: ["owner", "developer", "content_admin", "editor", "client_editor"],
};
const editorLayout = {
  version: 1,
  tabs: [
    {
      id: "00000000-0000-4000-8000-000000000021",
      title: "Content",
      description: null,
      position: 0,
      visibleToRoles: editor.visibleToRoles,
      groups: [
        {
          id: "00000000-0000-4000-8000-000000000022",
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: editor.visibleToRoles,
          fields: [
            {
              id: fieldId,
              fieldId,
              position: 0,
              helpTextOverride: null,
              visibleToRoles: editor.visibleToRoles,
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [],
};

const draft = Schema.decodeUnknownSync(CollectionDraftSchema, { onExcessProperty: "error" })({
  formatVersion: 1,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  contractHash: "b".repeat(64),
  editorLayout,
  collection: {
    id: collectionId,
    workspaceId,
    projectId,
    environmentId,
    apiKey: "articles",
    displayName: "Articles",
    description: null,
    version: 1,
    draftVersion: 2,
    draftBaseRevisionId: null,
    currentPublishedRevisionId: null,
    currentPublishedSequence: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  fields: [
    {
      id: fieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "title",
      displayLabel: "Title",
      kind: "short_text",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor,
      configuration: {},
      children: [],
    },
  ],
});

const revision = Schema.decodeUnknownSync(PublishedSchemaRevision, { onExcessProperty: "error" })({
  id: revisionId,
  workspaceId,
  projectId,
  environmentId,
  collectionId,
  sequence: 1,
  previousRevisionId: null,
  formatVersion: 1,
  validationProfile: "ffd-fields@1",
  currencyRegistryProfile: null,
  collectionApiKey: "articles",
  collectionDisplayName: "Articles",
  collectionDescription: null,
  schemaHash: "a".repeat(64),
  contractHash: "b".repeat(64),
  commandId,
  nonBreakingChangeCount: 0,
  potentiallyBreakingChangeCount: 1,
  breakingChangeCount: 0,
  publishedByUserId: "user-1",
  publishedByCredentialId: null,
  publishedAt: timestamp,
  fields: draft.fields,
  editorLayout,
});

const calls: Array<string> = [];
const RepositoryTest = Layer.succeed(SchemaRepository, {
  ...makeSchemaRepository(),
  getCollection: () => Effect.sync(() => (calls.push("getCollection"), draft.collection)),
  getDraft: () => Effect.sync(() => (calls.push("getDraft"), draft)),
  getLatestPublished: () => Effect.sync(() => (calls.push("getLatestPublished"), revision)),
  getPublishedRevision: () => Effect.sync(() => (calls.push("getPublishedRevision"), revision)),
});
const OperationTest = Layer.mergeAll(RepositoryTest, TelemetryLive);

describe("schema operations", () => {
  layer(OperationTest)((it) => {
    it.effect("forwards schema lifecycle workflows through a replaceable repository", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const scope = { projectId, environmentId, collectionId };
        yield* getCollectionDraft(
          "user-1",
          yield* Schema.decodeUnknownEffect(GetCollectionDraftInput, { onExcessProperty: "error" })(
            scope,
          ),
        );
        yield* getLatestPublishedSchema(
          "user-1",
          yield* Schema.decodeUnknownEffect(GetLatestPublishedSchemaInput, {
            onExcessProperty: "error",
          })(scope),
        );
        yield* getPublishedSchemaRevision(
          "user-1",
          yield* Schema.decodeUnknownEffect(GetPublishedSchemaRevisionInput, {
            onExcessProperty: "error",
          })({
            ...scope,
            revisionId,
          }),
        );

        assert.deepEqual(calls, ["getDraft", "getLatestPublished", "getPublishedRevision"]);
      }),
    );

    it.effect("rejects malformed actors before schema repository access", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const exit = yield* Effect.exit(
          getCollectionDraft(
            "",
            yield* Schema.decodeUnknownEffect(GetCollectionDraftInput, {
              onExcessProperty: "error",
            })({
              projectId,
              environmentId,
              collectionId,
            }),
          ),
        );
        assert.isTrue(Exit.isFailure(exit));
        assert.deepEqual(calls, []);
      }),
    );
  });
});
