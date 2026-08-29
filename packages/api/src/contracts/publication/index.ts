// Defines M8 exact-locale publication authority, validation plans, status, and command results.

import { Schema } from "effect";

import { ApiCredentialId } from "../access";
import { ApiSuccessSchema } from "../response/api";
import {
  ChangedEntryFieldIds,
  EntryCommandId,
  EntryDraftVersion,
  EntryId,
  EntryRevisionId,
} from "../entry";
import { LocaleTag, ProjectLocaleId } from "../locale";
import { AuthUserId, Cursor, EnvironmentId, IsoDateTime, PageLimit, ProjectId } from "../platform";
import { CollectionFieldId, CollectionId, ContractHash, SchemaRevisionId } from "../schema";

const digestPattern = /^[0-9a-f]{64}$/u;

export const EntryPublicationId = Schema.UUID.pipe(Schema.brand("EntryPublicationId"));
export type EntryPublicationId = typeof EntryPublicationId.Type;

export const EntryDeliverySnapshotId = Schema.UUID.pipe(Schema.brand("EntryDeliverySnapshotId"));
export type EntryDeliverySnapshotId = typeof EntryDeliverySnapshotId.Type;

export const EntryPublicationSequence = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
  Schema.brand("EntryPublicationSequence"),
);
export type EntryPublicationSequence = typeof EntryPublicationSequence.Type;

export const EntryPublicationStateVersion = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
  Schema.brand("EntryPublicationStateVersion"),
);
export type EntryPublicationStateVersion = typeof EntryPublicationStateVersion.Type;

export const EntryPublicationHash = Schema.String.pipe(
  Schema.length(64),
  Schema.pattern(digestPattern),
  Schema.brand("EntryPublicationHash"),
);
export type EntryPublicationHash = typeof EntryPublicationHash.Type;

export const EntryPublicationSizeBucket = Schema.Literal(
  "small",
  "medium",
  "large",
  "near_limit",
  "over_limit",
);
export type EntryPublicationSizeBucket = typeof EntryPublicationSizeBucket.Type;

const SnapshotBytes = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));

export class EntryPublicationSize extends Schema.Class<EntryPublicationSize>(
  "EntryPublicationSize",
)({
  documentBytes: SnapshotBytes,
  referenceManifestBytes: SnapshotBytes,
  combinedBytes: SnapshotBytes,
  maximumBytes: SnapshotBytes,
  bucket: EntryPublicationSizeBucket,
}) {}

export class EntryPublicationIssueTarget extends Schema.Class<EntryPublicationIssueTarget>(
  "EntryPublicationIssueTarget",
)({
  collectionId: CollectionId,
  entryId: EntryId,
  displayName: Schema.NullOr(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))),
}) {}

export class EntryPublicationValidationIssue extends Schema.Class<EntryPublicationValidationIssue>(
  "EntryPublicationValidationIssue",
)({
  fieldId: Schema.NullOr(CollectionFieldId),
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  target: Schema.optionalWith(EntryPublicationIssueTarget, { exact: true }),
}) {}

export class EntryPublicationSummary extends Schema.Class<EntryPublicationSummary>(
  "EntryPublicationSummary",
)({
  id: EntryPublicationId,
  snapshotId: EntryDeliverySnapshotId,
  entryId: EntryId,
  localeId: ProjectLocaleId,
  locale: LocaleTag,
  sequence: EntryPublicationSequence,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  sharedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedVersion: EntryDraftVersion,
  contentHash: EntryPublicationHash,
  authorityHash: EntryPublicationHash,
  documentHash: EntryPublicationHash,
  changedFieldIds: ChangedEntryFieldIds,
  size: EntryPublicationSize,
  publishedByUserId: Schema.NullOr(AuthUserId),
  publishedByCredentialId: Schema.NullOr(ApiCredentialId),
  publishedAt: IsoDateTime,
  current: Schema.Boolean,
}) {}

export class EntryPublicationPage extends Schema.Class<EntryPublicationPage>(
  "EntryPublicationPage",
)({
  items: Schema.Array(EntryPublicationSummary).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class EntryPublicationStatus extends Schema.Class<EntryPublicationStatus>(
  "EntryPublicationStatus",
)({
  entryId: EntryId,
  localeId: ProjectLocaleId,
  locale: LocaleTag,
  state: Schema.Literal("published", "unpublished"),
  stateVersion: EntryPublicationStateVersion,
  currentPublication: Schema.NullOr(EntryPublicationSummary),
  currentSchemaRevisionId: SchemaRevisionId,
  currentContractHash: ContractHash,
  currentSharedRevisionId: Schema.NullOr(EntryRevisionId),
  currentSharedVersion: EntryDraftVersion,
  currentLocalizedRevisionId: Schema.NullOr(EntryRevisionId),
  currentLocalizedVersion: EntryDraftVersion,
  sharedChanged: Schema.Boolean,
  localizedChanged: Schema.Boolean,
  schemaChanged: Schema.Boolean,
  changedSincePublication: Schema.Boolean,
}) {}

export class EntryPublicationPlan extends Schema.Class<EntryPublicationPlan>(
  "EntryPublicationPlan",
)({
  entryId: EntryId,
  localeId: ProjectLocaleId,
  locale: LocaleTag,
  stateVersion: EntryPublicationStateVersion,
  currentPublicationId: Schema.NullOr(EntryPublicationId),
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  sharedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedVersion: EntryDraftVersion,
  valid: Schema.Boolean,
  issues: Schema.Array(EntryPublicationValidationIssue).pipe(Schema.maxItems(50)),
  capped: Schema.Boolean,
  contentHash: Schema.NullOr(EntryPublicationHash),
  authorityHash: Schema.NullOr(EntryPublicationHash),
  changedFieldIds: ChangedEntryFieldIds,
  size: Schema.NullOr(EntryPublicationSize),
  referencesWouldRefresh: Schema.Boolean,
  wouldCreatePublication: Schema.Boolean,
}) {}

const EntryPublicationScopeFields = {
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  entryId: EntryId,
  locale: LocaleTag,
};

export class GetEntryPublicationStatusInput extends Schema.Class<GetEntryPublicationStatusInput>(
  "GetEntryPublicationStatusInput",
)(EntryPublicationScopeFields) {}

export class ValidateEntryPublicationInput extends Schema.Class<ValidateEntryPublicationInput>(
  "ValidateEntryPublicationInput",
)(EntryPublicationScopeFields) {}

export class PublishEntryInput extends Schema.Class<PublishEntryInput>("PublishEntryInput")({
  ...EntryPublicationScopeFields,
  commandId: EntryCommandId,
  authorityHash: EntryPublicationHash,
  expectedStateVersion: EntryPublicationStateVersion,
  expectedPublicationId: Schema.NullOr(EntryPublicationId),
  expectedSchemaRevisionId: SchemaRevisionId,
  expectedContractHash: ContractHash,
  expectedSharedVersion: EntryDraftVersion,
  expectedSharedRevisionId: Schema.NullOr(EntryRevisionId),
  expectedLocalizedVersion: EntryDraftVersion,
  expectedLocalizedRevisionId: Schema.NullOr(EntryRevisionId),
}) {}

export class UnpublishEntryInput extends Schema.Class<UnpublishEntryInput>("UnpublishEntryInput")({
  ...EntryPublicationScopeFields,
  commandId: EntryCommandId,
  expectedStateVersion: EntryPublicationStateVersion,
  expectedPublicationId: Schema.NullOr(EntryPublicationId),
}) {}

export class ListEntryPublicationsInput extends Schema.Class<ListEntryPublicationsInput>(
  "ListEntryPublicationsInput",
)({
  ...EntryPublicationScopeFields,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class PublishEntryResult extends Schema.Class<PublishEntryResult>("PublishEntryResult")({
  entryId: EntryId,
  localeId: ProjectLocaleId,
  locale: LocaleTag,
  commandId: EntryCommandId,
  stateVersion: EntryPublicationStateVersion,
  resultKind: Schema.Literal("changed", "no_op"),
  publication: EntryPublicationSummary,
}) {}

export class UnpublishEntryResult extends Schema.Class<UnpublishEntryResult>(
  "UnpublishEntryResult",
)({
  entryId: EntryId,
  localeId: ProjectLocaleId,
  locale: LocaleTag,
  commandId: EntryCommandId,
  stateVersion: EntryPublicationStateVersion,
  resultKind: Schema.Literal("changed", "no_op"),
  unpublishedPublicationId: Schema.NullOr(EntryPublicationId),
  unpublishedPublicationSequence: Schema.NullOr(EntryPublicationSequence),
  unpublishedAt: IsoDateTime,
}) {}

export const GetEntryPublicationStatusInputSchema = Schema.standardSchemaV1(
  GetEntryPublicationStatusInput,
);
export const ValidateEntryPublicationInputSchema = Schema.standardSchemaV1(
  ValidateEntryPublicationInput,
);
export const PublishEntryInputSchema = Schema.standardSchemaV1(PublishEntryInput);
export const UnpublishEntryInputSchema = Schema.standardSchemaV1(UnpublishEntryInput);
export const ListEntryPublicationsInputSchema = Schema.standardSchemaV1(ListEntryPublicationsInput);

export const EntryPublicationStatusOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(EntryPublicationStatus),
);
export const EntryPublicationPlanOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(EntryPublicationPlan),
);
export const PublishEntryResultOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(PublishEntryResult),
);
export const UnpublishEntryResultOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(UnpublishEntryResult),
);
export const EntryPublicationPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(EntryPublicationPage),
);
