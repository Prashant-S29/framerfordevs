import { Schema } from "effect";

import { ApiSuccessSchema } from "./api-response";
import {
  AuthUserId,
  Cursor,
  EnvironmentId,
  IsoDateTime,
  PageLimit,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "./platform";

const apiKeyPattern = /^[a-z][a-z0-9_]{0,62}$/u;
const digestPattern = /^[0-9a-f]{64}$/u;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

const NormalizedString = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value) => value.trim().normalize("NFC"),
    encode: (value) => value,
  }),
);

const SafeName = NormalizedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(100),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Names cannot contain control characters.",
  }),
);

export const reservedCmsApiKeyValues = [
  "id",
  "entry_id",
  "collection_id",
  "locale",
  "schema_revision",
  "publication_id",
  "publication_sequence",
  "created_at",
  "updated_at",
  "published_at",
  "_meta",
  "__proto__",
  "prototype",
  "constructor",
] as const;

const reservedCmsApiKeys = new Set<string>(reservedCmsApiKeyValues);

const CmsApiKey = NormalizedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.filter(
    (value) =>
      apiKeyPattern.test(value) &&
      !value.includes("__") &&
      !value.endsWith("_") &&
      !reservedCmsApiKeys.has(value),
    {
      message: () => "Use a non-reserved lowercase snake-case key beginning with a letter.",
    },
  ),
);

export const CollectionId = Schema.UUID.pipe(Schema.brand("CollectionId"));
export type CollectionId = typeof CollectionId.Type;

export const CollectionFieldId = Schema.UUID.pipe(Schema.brand("CollectionFieldId"));
export type CollectionFieldId = typeof CollectionFieldId.Type;

export const SchemaRevisionId = Schema.UUID.pipe(Schema.brand("SchemaRevisionId"));
export type SchemaRevisionId = typeof SchemaRevisionId.Type;

export const OutboxEventId = Schema.UUID.pipe(Schema.brand("OutboxEventId"));
export type OutboxEventId = typeof OutboxEventId.Type;

export const SchemaPublicationCommandId = Schema.UUID.pipe(
  Schema.brand("SchemaPublicationCommandId"),
);
export type SchemaPublicationCommandId = typeof SchemaPublicationCommandId.Type;

export const CollectionApiKey = CmsApiKey.pipe(Schema.brand("CollectionApiKey"));
export type CollectionApiKey = typeof CollectionApiKey.Type;

export const CollectionFieldApiKey = CmsApiKey.pipe(Schema.brand("CollectionFieldApiKey"));
export type CollectionFieldApiKey = typeof CollectionFieldApiKey.Type;

export const CollectionDisplayName = SafeName.pipe(Schema.brand("CollectionDisplayName"));
export type CollectionDisplayName = typeof CollectionDisplayName.Type;

export const CollectionDescription = NormalizedString.pipe(
  Schema.maxLength(500),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Collection descriptions cannot contain control characters.",
  }),
  Schema.brand("CollectionDescription"),
);
export type CollectionDescription = typeof CollectionDescription.Type;

export const CollectionFieldDisplayLabel = SafeName.pipe(
  Schema.brand("CollectionFieldDisplayLabel"),
);
export type CollectionFieldDisplayLabel = typeof CollectionFieldDisplayLabel.Type;

export const collectionFieldKindValues = ["short_text", "number", "boolean"] as const;
export const CollectionFieldKind = Schema.Literal(...collectionFieldKindValues);
export type CollectionFieldKind = typeof CollectionFieldKind.Type;

export const CollectionFieldLocalization = Schema.Literal("localized", "shared");
export type CollectionFieldLocalization = typeof CollectionFieldLocalization.Type;

export const CollectionFieldPosition = Schema.Number.pipe(Schema.int(), Schema.between(0, 99));
export type CollectionFieldPosition = typeof CollectionFieldPosition.Type;

export const CollectionFieldConfiguration = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
}).pipe(
  Schema.filter((configuration) => Object.keys(configuration).length === 0, {
    message: () => "Field configuration is not available until Milestone 6.",
  }),
);
export type CollectionFieldConfiguration = typeof CollectionFieldConfiguration.Type;

export const SchemaHash = Schema.String.pipe(
  Schema.length(64),
  Schema.pattern(digestPattern),
  Schema.brand("SchemaHash"),
);
export type SchemaHash = typeof SchemaHash.Type;

export const SchemaChangeId = Schema.String.pipe(
  Schema.length(64),
  Schema.pattern(digestPattern),
  Schema.brand("SchemaChangeId"),
);
export type SchemaChangeId = typeof SchemaChangeId.Type;

export const SchemaPublicationFingerprint = Schema.String.pipe(
  Schema.length(64),
  Schema.pattern(digestPattern),
  Schema.brand("SchemaPublicationFingerprint"),
);
export type SchemaPublicationFingerprint = typeof SchemaPublicationFingerprint.Type;

export const SchemaRevisionSequence = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
);
export type SchemaRevisionSequence = typeof SchemaRevisionSequence.Type;

export const SchemaChangeClassification = Schema.Literal(
  "non_breaking",
  "potentially_breaking",
  "breaking",
);
export type SchemaChangeClassification = typeof SchemaChangeClassification.Type;

export const schemaChangeCodeValues = [
  "collection.metadata.updated",
  "field.added.optional",
  "field.added.required",
  "field.api_key.updated",
  "field.label.updated",
  "field.kind.updated",
  "field.required.enabled",
  "field.required.disabled",
  "field.localization.updated",
  "field.deprecated",
  "field.undeprecated",
  "field.position.updated",
  "field.removed",
] as const;
export const SchemaChangeCode = Schema.Literal(...schemaChangeCodeValues);
export type SchemaChangeCode = typeof SchemaChangeCode.Type;

export const schemaValidationIssueCodeValues = [
  "field_count_required",
  "field_count_exceeded",
  "field_id_duplicate",
  "field_api_key_duplicate",
  "field_position_duplicate",
  "field_position_not_dense",
  "field_configuration_unsupported",
] as const;
export const SchemaValidationIssueCode = Schema.Literal(...schemaValidationIssueCodeValues);
export type SchemaValidationIssueCode = typeof SchemaValidationIssueCode.Type;

export class CollectionFieldDefinition extends Schema.Class<CollectionFieldDefinition>(
  "CollectionFieldDefinition",
)({
  id: CollectionFieldId,
  apiKey: CollectionFieldApiKey,
  displayLabel: CollectionFieldDisplayLabel,
  kind: CollectionFieldKind,
  required: Schema.Boolean,
  localization: CollectionFieldLocalization,
  deprecated: Schema.Boolean,
  position: CollectionFieldPosition,
  configuration: CollectionFieldConfiguration,
}) {}

export const CollectionFieldDefinitions = Schema.Array(CollectionFieldDefinition).pipe(
  Schema.maxItems(100),
);
export type CollectionFieldDefinitions = typeof CollectionFieldDefinitions.Type;

export class CmsCollection extends Schema.Class<CmsCollection>("CmsCollection")({
  id: CollectionId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  apiKey: CollectionApiKey,
  displayName: CollectionDisplayName,
  description: Schema.NullOr(CollectionDescription),
  version: ResourceVersion,
  draftVersion: ResourceVersion,
  draftBaseRevisionId: Schema.NullOr(SchemaRevisionId),
  currentPublishedRevisionId: Schema.NullOr(SchemaRevisionId),
  currentPublishedSequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class CollectionDraftSchema extends Schema.Class<CollectionDraftSchema>(
  "CollectionDraftSchema",
)({
  collection: CmsCollection,
  fields: CollectionFieldDefinitions,
}) {}

export class PublishedSchemaField extends Schema.Class<PublishedSchemaField>(
  "PublishedSchemaField",
)({
  id: CollectionFieldId,
  apiKey: CollectionFieldApiKey,
  displayLabel: CollectionFieldDisplayLabel,
  kind: CollectionFieldKind,
  required: Schema.Boolean,
  localization: CollectionFieldLocalization,
  deprecated: Schema.Boolean,
  position: CollectionFieldPosition,
  configuration: CollectionFieldConfiguration,
}) {}

export const PublishedSchemaFields = Schema.Array(PublishedSchemaField).pipe(
  Schema.minItems(1),
  Schema.maxItems(100),
);

export class PublishedSchemaRevision extends Schema.Class<PublishedSchemaRevision>(
  "PublishedSchemaRevision",
)({
  id: SchemaRevisionId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  sequence: SchemaRevisionSequence,
  previousRevisionId: Schema.NullOr(SchemaRevisionId),
  collectionApiKey: CollectionApiKey,
  collectionDisplayName: CollectionDisplayName,
  collectionDescription: Schema.NullOr(CollectionDescription),
  schemaHash: SchemaHash,
  commandId: SchemaPublicationCommandId,
  nonBreakingChangeCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  potentiallyBreakingChangeCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  breakingChangeCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  publishedByUserId: AuthUserId,
  publishedAt: IsoDateTime,
  fields: PublishedSchemaFields,
}) {}

export class SchemaValidationIssue extends Schema.Class<SchemaValidationIssue>(
  "SchemaValidationIssue",
)({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: SchemaValidationIssueCode,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export const SchemaValidationIssues = Schema.Array(SchemaValidationIssue).pipe(
  Schema.minItems(1),
  Schema.maxItems(50),
);
export type SchemaValidationIssues = typeof SchemaValidationIssues.Type;

export class SchemaChange extends Schema.Class<SchemaChange>("SchemaChange")({
  changeId: SchemaChangeId,
  code: SchemaChangeCode,
  classification: SchemaChangeClassification,
  fieldId: Schema.NullOr(CollectionFieldId),
  summary: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
}) {}

export const SchemaChanges = Schema.Array(SchemaChange).pipe(Schema.maxItems(701));
export type SchemaChanges = typeof SchemaChanges.Type;

export class SchemaChangeSet extends Schema.Class<SchemaChangeSet>("SchemaChangeSet")({
  items: SchemaChanges,
  nonBreakingCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  potentiallyBreakingCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  breakingCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  requiresAcknowledgement: Schema.Boolean,
}) {}

export class CollectionSchemaValidation extends Schema.Class<CollectionSchemaValidation>(
  "CollectionSchemaValidation",
)({
  valid: Schema.Boolean,
  issues: Schema.Array(SchemaValidationIssue).pipe(Schema.maxItems(50)),
  schemaHash: Schema.NullOr(SchemaHash),
  changes: SchemaChangeSet,
}) {}

export class ListCollectionsInput extends Schema.Class<ListCollectionsInput>(
  "ListCollectionsInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class CreateCollectionInput extends Schema.Class<CreateCollectionInput>(
  "CreateCollectionInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  apiKey: CollectionApiKey,
  displayName: CollectionDisplayName,
  description: Schema.NullOr(CollectionDescription),
}) {}

export class GetCollectionInput extends Schema.Class<GetCollectionInput>("GetCollectionInput")({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
}) {}

export class UpdateCollectionInput extends Schema.Class<UpdateCollectionInput>(
  "UpdateCollectionInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  version: ResourceVersion,
  draftVersion: ResourceVersion,
  displayName: CollectionDisplayName,
  description: Schema.NullOr(CollectionDescription),
}) {}

export class GetCollectionDraftInput extends Schema.Class<GetCollectionDraftInput>(
  "GetCollectionDraftInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
}) {}

const MutableFieldDefinitionFields = {
  apiKey: CollectionFieldApiKey,
  displayLabel: CollectionFieldDisplayLabel,
  kind: CollectionFieldKind,
  required: Schema.Boolean,
  localization: CollectionFieldLocalization,
  deprecated: Schema.Boolean,
  configuration: CollectionFieldConfiguration,
};

export class CreateCollectionFieldInput extends Schema.Class<CreateCollectionFieldInput>(
  "CreateCollectionFieldInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  draftVersion: ResourceVersion,
  ...MutableFieldDefinitionFields,
}) {}

export class UpdateCollectionFieldInput extends Schema.Class<UpdateCollectionFieldInput>(
  "UpdateCollectionFieldInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  fieldId: CollectionFieldId,
  draftVersion: ResourceVersion,
  ...MutableFieldDefinitionFields,
}) {}

export class RemoveCollectionFieldInput extends Schema.Class<RemoveCollectionFieldInput>(
  "RemoveCollectionFieldInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  fieldId: CollectionFieldId,
  draftVersion: ResourceVersion,
}) {}

export const CollectionFieldOrder = Schema.Array(CollectionFieldId).pipe(
  Schema.maxItems(100),
  Schema.filter((fieldIds) => new Set(fieldIds).size === fieldIds.length, {
    message: () => "Field order must contain unique field IDs.",
  }),
);
export type CollectionFieldOrder = typeof CollectionFieldOrder.Type;

export class ReorderCollectionFieldsInput extends Schema.Class<ReorderCollectionFieldsInput>(
  "ReorderCollectionFieldsInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  draftVersion: ResourceVersion,
  fieldIds: CollectionFieldOrder,
}) {}

export class ValidateCollectionSchemaInput extends Schema.Class<ValidateCollectionSchemaInput>(
  "ValidateCollectionSchemaInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
}) {}

export const AcknowledgedSchemaChangeIds = Schema.Array(SchemaChangeId).pipe(
  Schema.maxItems(400),
  Schema.filter((changeIds) => new Set(changeIds).size === changeIds.length, {
    message: () => "Acknowledged schema change IDs must be unique.",
  }),
);
export type AcknowledgedSchemaChangeIds = typeof AcknowledgedSchemaChangeIds.Type;

export class PublishCollectionSchemaInput extends Schema.Class<PublishCollectionSchemaInput>(
  "PublishCollectionSchemaInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  draftVersion: ResourceVersion,
  expectedPublishedRevisionId: Schema.NullOr(SchemaRevisionId),
  commandId: SchemaPublicationCommandId,
  acknowledgedChangeIds: AcknowledgedSchemaChangeIds,
}) {}

export class GetLatestPublishedSchemaInput extends Schema.Class<GetLatestPublishedSchemaInput>(
  "GetLatestPublishedSchemaInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
}) {}

export class GetPublishedSchemaRevisionInput extends Schema.Class<GetPublishedSchemaRevisionInput>(
  "GetPublishedSchemaRevisionInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  revisionId: SchemaRevisionId,
}) {}

export class CmsCollectionPage extends Schema.Class<CmsCollectionPage>("CmsCollectionPage")({
  items: Schema.Array(CmsCollection),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export const ListCollectionsInputSchema = Schema.standardSchemaV1(ListCollectionsInput);
export const CreateCollectionInputSchema = Schema.standardSchemaV1(CreateCollectionInput);
export const GetCollectionInputSchema = Schema.standardSchemaV1(GetCollectionInput);
export const UpdateCollectionInputSchema = Schema.standardSchemaV1(UpdateCollectionInput);
export const GetCollectionDraftInputSchema = Schema.standardSchemaV1(GetCollectionDraftInput);
export const CreateCollectionFieldInputSchema = Schema.standardSchemaV1(CreateCollectionFieldInput);
export const UpdateCollectionFieldInputSchema = Schema.standardSchemaV1(UpdateCollectionFieldInput);
export const RemoveCollectionFieldInputSchema = Schema.standardSchemaV1(RemoveCollectionFieldInput);
export const ReorderCollectionFieldsInputSchema = Schema.standardSchemaV1(
  ReorderCollectionFieldsInput,
);
export const ValidateCollectionSchemaInputSchema = Schema.standardSchemaV1(
  ValidateCollectionSchemaInput,
);
export const PublishCollectionSchemaInputSchema = Schema.standardSchemaV1(
  PublishCollectionSchemaInput,
);
export const GetLatestPublishedSchemaInputSchema = Schema.standardSchemaV1(
  GetLatestPublishedSchemaInput,
);
export const GetPublishedSchemaRevisionInputSchema = Schema.standardSchemaV1(
  GetPublishedSchemaRevisionInput,
);

export const CmsCollectionOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(CmsCollection));
export const CmsCollectionPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(CmsCollectionPage),
);
export const CollectionDraftSchemaOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(CollectionDraftSchema),
);
export const CollectionSchemaValidationOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(CollectionSchemaValidation),
);
export const PublishedSchemaRevisionOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(PublishedSchemaRevision),
);
