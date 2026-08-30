import { assert, describe, layer } from "@effect/vitest";
import { Effect, Exit, Layer, Schema } from "effect";

import {
  AuthoringCollectionPresentation,
  AuthoringPresentationRevision,
  AuthoringPresentationSnapshot,
  AuthoringPublishPresentationResult,
} from "../../contracts/authoring/presentation";
import {
  GetCollectionPresentationInput,
  PublishCollectionPresentationInput,
} from "../../contracts/presentation/management";
import {
  CollectionDraftSchema,
  GetCollectionDraftInput,
  GetLatestPublishedSchemaInput,
  GetPublishedSchemaRevisionInput,
  PublishedSchemaRevision,
} from "../../contracts/schema";
import { TelemetryLive } from "../../observability/telemetry";
import {
  AuthoringPresentationRepository,
  makeAuthoringPresentationRepository,
} from "../../services/authoring/presentation-repository";
import { SchemaRepository, makeSchemaRepository } from "../../services/schema/repository";
import {
  getCollectionDraft,
  getCollectionPresentation,
  getLatestPublishedSchema,
  getPublishedSchemaRevision,
  publishCollectionPresentation,
} from "./index";

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
  publishedByCredentialId: null,
  publishedAt: timestamp,
  fields: draft.fields,
  editorLayout,
});

const presentation = Schema.decodeUnknownSync(AuthoringCollectionPresentation)({
  displayName: "Articles",
  description: null,
  fields: [
    {
      fieldId,
      displayLabel: "Title",
      position: 0,
      editor,
      enumOptions: [],
    },
  ],
  editorLayout,
});
const presentationRevision = Schema.decodeUnknownSync(AuthoringPresentationRevision)({
  collectionId,
  revisionId,
  previousRevisionId: null,
  sequence: 1,
  schemaHash: "a".repeat(64),
  structureHash: "c".repeat(64),
  contractHash: "b".repeat(64),
  publishedAt: timestamp,
});
const presentationSnapshot = AuthoringPresentationSnapshot.make({
  revision: presentationRevision,
  presentation,
});
const presentationResult = AuthoringPublishPresentationResult.make({
  commandId: revision.commandId,
  replayed: false,
  noOp: false,
  ...presentationSnapshot,
});

const calls: Array<string> = [];
const RepositoryTest = Layer.succeed(SchemaRepository, {
  ...makeSchemaRepository(),
  getCollection: () => Effect.sync(() => (calls.push("getCollection"), draft.collection)),
  getDraft: () => Effect.sync(() => (calls.push("getDraft"), draft)),
  getLatestPublished: () => Effect.sync(() => (calls.push("getLatestPublished"), revision)),
  getPublishedRevision: () => Effect.sync(() => (calls.push("getPublishedRevision"), revision)),
});
const PresentationRepositoryTest = Layer.succeed(AuthoringPresentationRepository, {
  ...makeAuthoringPresentationRepository(),
  get: () => Effect.sync(() => (calls.push("getPresentation"), presentationSnapshot)),
  publish: () => Effect.sync(() => (calls.push("publishPresentation"), presentationResult)),
});
const OperationTest = Layer.mergeAll(RepositoryTest, PresentationRepositoryTest, TelemetryLive);

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
        yield* getCollectionPresentation(
          "user-1",
          yield* Schema.decodeUnknown(GetCollectionPresentationInput)(scope),
        );
        yield* publishCollectionPresentation(
          "user-1",
          yield* Schema.decodeUnknown(PublishCollectionPresentationInput)({
            ...scope,
            commandId,
            expectedRevisionId: revisionId,
            expectedSequence: 1,
            presentation,
          }),
          "request-presentation-operation",
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
          "getCollection",
          "getPresentation",
          "getCollection",
          "publishPresentation",
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
