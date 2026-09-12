// Verifies all M8 workflows forward through replaceable repository and telemetry services.

import { assert, describe, layer } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import {
  EntryPublicationPage,
  EntryPublicationPlan,
  EntryPublicationStatus,
  EntryPublicationSummary,
  GetEntryPublicationStatusInput,
  ListEntryPublicationsInput,
  PublishEntryInput,
  PublishEntryResult,
  UnpublishEntryInput,
  UnpublishEntryResult,
  ValidateEntryPublicationInput,
} from "../../contracts/publication";
import { Telemetry } from "../../observability/telemetry";
import {
  PublicationRepository,
  makePublicationRepository,
} from "../../services/publication/repository";
import {
  getEntryPublicationStatus,
  listEntryPublications,
  publishEntryLocale,
  unpublishEntryLocale,
  validateEntryPublication,
} from "./index";

const ids = {
  project: "019fae8b-1234-7000-8000-000000000001",
  environment: "019fae8b-1234-7000-8000-000000000002",
  collection: "019fae8b-1234-7000-8000-000000000003",
  entry: "019fae8b-1234-7000-8000-000000000004",
  locale: "019fae8b-1234-7000-8000-000000000005",
  schema: "019fae8b-1234-7000-8000-000000000006",
  publication: "019fae8b-1234-7000-8000-000000000007",
  command: "019fae8b-1234-7000-8000-000000000008",
} as const;
const timestamp = "2026-08-09T12:00:00.000Z";
const hash = "a".repeat(64);
const scope = {
  projectId: ids.project,
  environmentId: ids.environment,
  collectionId: ids.collection,
  entryId: ids.entry,
  locale: "en",
};
const size = {
  documentBytes: 200,
  referenceManifestBytes: 2,
  combinedBytes: 202,
  maximumBytes: 1_048_576,
  bucket: "small",
};
const summary = Schema.decodeUnknownSync(EntryPublicationSummary)({
  id: ids.publication,
  snapshotId: ids.publication,
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "en",
  sequence: 1,
  schemaRevisionId: ids.schema,
  contractHash: hash,
  sharedRevisionId: null,
  sharedVersion: 0,
  localizedRevisionId: null,
  localizedVersion: 0,
  contentHash: hash,
  authorityHash: hash,
  documentHash: hash,
  changedFieldIds: [],
  size,
  publishedByUserId: "user-1",
  publishedByCredentialId: null,
  publishedAt: timestamp,
  current: true,
});
const status = Schema.decodeUnknownSync(EntryPublicationStatus)({
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "en",
  state: "published",
  stateVersion: 1,
  currentPublication: summary,
  currentSchemaRevisionId: ids.schema,
  currentContractHash: hash,
  currentSharedRevisionId: null,
  currentSharedVersion: 0,
  currentLocalizedRevisionId: null,
  currentLocalizedVersion: 0,
  sharedChanged: false,
  localizedChanged: false,
  schemaChanged: false,
  changedSincePublication: false,
});
const plan = Schema.decodeUnknownSync(EntryPublicationPlan)({
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "en",
  stateVersion: 1,
  currentPublicationId: ids.publication,
  schemaRevisionId: ids.schema,
  contractHash: hash,
  sharedRevisionId: null,
  sharedVersion: 0,
  localizedRevisionId: null,
  localizedVersion: 0,
  valid: true,
  issues: [],
  capped: false,
  contentHash: hash,
  authorityHash: hash,
  changedFieldIds: [],
  size,
  referencesWouldRefresh: false,
  wouldCreatePublication: false,
});
const publishResult = Schema.decodeUnknownSync(PublishEntryResult)({
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "en",
  commandId: ids.command,
  stateVersion: 1,
  resultKind: "no_op",
  publication: summary,
});
const unpublishResult = Schema.decodeUnknownSync(UnpublishEntryResult)({
  entryId: ids.entry,
  localeId: ids.locale,
  locale: "en",
  commandId: ids.command,
  stateVersion: 2,
  resultKind: "changed",
  unpublishedPublicationId: ids.publication,
  unpublishedPublicationSequence: 1,
  unpublishedAt: timestamp,
});
const calls: Array<string> = [];
const metrics: Array<string> = [];

const RepositoryTest = Layer.succeed(PublicationRepository, {
  ...makePublicationRepository(),
  getStatus: () => Effect.sync(() => (calls.push("status"), status)),
  validate: () => Effect.sync(() => (calls.push("validate"), plan)),
  publish: () => Effect.sync(() => (calls.push("publish"), publishResult)),
  unpublish: () => Effect.sync(() => (calls.push("unpublish"), unpublishResult)),
  list: () =>
    Effect.sync(
      () => (calls.push("list"), EntryPublicationPage.make({ items: [summary], nextCursor: null })),
    ),
});
const TelemetryTest = Layer.succeed(Telemetry, {
  recordHttpRequest: () => Effect.void,
  recordDefect: () => Effect.void,
  recordCredentialVerification: () => Effect.void,
  recordLocaleMutation: () => Effect.void,
  recordSchemaPublication: () => Effect.void,
  recordEntryPublication: (event) =>
    Effect.sync(() => {
      metrics.push(`${event.operation}:${event.outcome}`);
    }),
  recordEntryPublicationValidationFailure: () => Effect.void,
  recordPreviewRead: () => Effect.void,
  recordPreviewQueryRejection: () => Effect.void,
  recordPreviewAuditFailure: () => Effect.void,
  recordControlPlaneRequest: () => Effect.void,
  recordToolingRequest: () => Effect.void,
  recordToolingOAuthVerification: () => Effect.void,
  recordAuthoringAuthentication: () => Effect.void,
  recordAuthoringRequest: () => Effect.void,
  recordRateLimitDecision: () => Effect.void,
  recordRateLimitStore: () => Effect.void,
});

const TestLayer = Layer.merge(RepositoryTest, TelemetryTest);

describe("publication operations", () => {
  layer(TestLayer)((it) => {
    it.effect("forwards status, validation, mutation, and history workflows", () =>
      Effect.gen(function* () {
        calls.length = 0;
        metrics.length = 0;
        yield* getEntryPublicationStatus(
          "user-1",
          yield* Schema.decodeUnknown(GetEntryPublicationStatusInput)(scope),
        );
        yield* validateEntryPublication(
          "user-1",
          yield* Schema.decodeUnknown(ValidateEntryPublicationInput)(scope),
        );
        yield* publishEntryLocale(
          "user-1",
          yield* Schema.decodeUnknown(PublishEntryInput)({
            ...scope,
            commandId: ids.command,
            authorityHash: hash,
            expectedStateVersion: 1,
            expectedPublicationId: ids.publication,
            expectedSchemaRevisionId: ids.schema,
            expectedContractHash: hash,
            expectedSharedVersion: 0,
            expectedSharedRevisionId: null,
            expectedLocalizedVersion: 0,
            expectedLocalizedRevisionId: null,
          }),
          "request-publish",
        );
        yield* unpublishEntryLocale(
          "user-1",
          yield* Schema.decodeUnknown(UnpublishEntryInput)({
            ...scope,
            commandId: ids.command,
            expectedStateVersion: 1,
            expectedPublicationId: ids.publication,
          }),
          "request-unpublish",
        );
        yield* listEntryPublications(
          "user-1",
          yield* Schema.decodeUnknown(ListEntryPublicationsInput)({
            ...scope,
            cursor: null,
            limit: 25,
          }),
        );

        assert.deepEqual(calls, ["status", "validate", "publish", "unpublish", "list"]);
        assert.deepEqual(metrics, ["validate:success", "publish:success", "unpublish:success"]);
      }),
    );
  });
});
