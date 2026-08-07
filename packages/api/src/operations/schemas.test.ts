import { assert, describe, layer } from "@effect/vitest";
import { Effect, Exit, Layer, Schema } from "effect";

import {
  CollectionDraftSchema,
  CollectionSchemaValidation,
  SchemaChangeSet,
  GetCollectionDraftInput,
  GetLatestPublishedSchemaInput,
  GetPublishedSchemaRevisionInput,
  PublishCollectionSchemaInput,
  PublishedSchemaRevision,
  ReplaceCollectionDraftFieldsInput,
  ValidateCollectionSchemaInput,
} from "../contracts/schemas";
import { TelemetryLive } from "../observability/telemetry";
import { SchemaRepository, makeSchemaRepository } from "../services/schema-repository";
import {
  getCollectionDraft,
  getLatestPublishedSchema,
  getPublishedSchemaRevision,
  publishCollectionSchema,
  replaceCollectionDraftFields,
  validateCollectionSchema,
} from "./schemas";

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

const draft = Schema.decodeUnknownSync(CollectionDraftSchema)({
  formatVersion: 2,
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

const revision = Schema.decodeUnknownSync(PublishedSchemaRevision)({
  id: revisionId,
  workspaceId,
  projectId,
  environmentId,
  collectionId,
  sequence: 1,
  previousRevisionId: null,
  formatVersion: 2,
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
  publishedAt: timestamp,
  fields: draft.fields,
  editorLayout,
});

const validation = CollectionSchemaValidation.make({
  valid: true,
  issues: [],
  schemaHash: revision.schemaHash,
  contractHash: revision.contractHash,
  changes: SchemaChangeSet.make({
    items: [],
    nonBreakingCount: 0,
    potentiallyBreakingCount: 0,
    breakingCount: 0,
    requiresAcknowledgement: false,
  }),
});

const calls: Array<string> = [];
const RepositoryTest = Layer.succeed(SchemaRepository, {
  ...makeSchemaRepository(),
  getDraft: () => Effect.sync(() => (calls.push("getDraft"), draft)),
  validateSchema: () => Effect.sync(() => (calls.push("validateSchema"), validation)),
  publishSchema: () => Effect.sync(() => (calls.push("publishSchema"), revision)),
  replaceFields: () => Effect.sync(() => (calls.push("replaceFields"), draft)),
  getLatestPublished: () => Effect.sync(() => (calls.push("getLatestPublished"), revision)),
  getPublishedRevision: () => Effect.sync(() => (calls.push("getPublishedRevision"), revision)),
});
const OperationTest = Layer.merge(RepositoryTest, TelemetryLive);

describe("schema operations", () => {
  layer(OperationTest)((it) => {
    it.effect("forwards schema lifecycle workflows through a replaceable repository", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const scope = { projectId, environmentId, collectionId };
        yield* getCollectionDraft(
          "user-1",
          yield* Schema.decodeUnknown(GetCollectionDraftInput)(scope),
        );
        yield* validateCollectionSchema(
          "user-1",
          yield* Schema.decodeUnknown(ValidateCollectionSchemaInput)(scope),
        );
        yield* replaceCollectionDraftFields(
          "user-1",
          yield* Schema.decodeUnknown(ReplaceCollectionDraftFieldsInput)({
            ...scope,
            draftVersion: 2,
            authoringVersion: 1,
            fields: [],
          }),
          "request-schema-replace",
        );
        yield* publishCollectionSchema(
          "user-1",
          yield* Schema.decodeUnknown(PublishCollectionSchemaInput)({
            ...scope,
            draftVersion: 2,
            expectedPublishedRevisionId: null,
            commandId,
            acknowledgedChangeIds: [],
          }),
          "request-schema-operation",
        );
        yield* getLatestPublishedSchema(
          "user-1",
          yield* Schema.decodeUnknown(GetLatestPublishedSchemaInput)(scope),
        );
        yield* getPublishedSchemaRevision(
          "user-1",
          yield* Schema.decodeUnknown(GetPublishedSchemaRevisionInput)({ ...scope, revisionId }),
        );

        assert.deepEqual(calls, [
          "getDraft",
          "validateSchema",
          "replaceFields",
          "publishSchema",
          "getLatestPublished",
          "getPublishedRevision",
        ]);
      }),
    );

    it.effect("rejects malformed actors before schema repository access", () =>
      Effect.gen(function* () {
        calls.length = 0;
        const exit = yield* Effect.exit(
          getCollectionDraft(
            "",
            yield* Schema.decodeUnknown(GetCollectionDraftInput)({
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
