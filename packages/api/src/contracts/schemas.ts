import { Schema } from "effect";

import { ApiSuccessSchema } from "./api-response";
import { ApiCredentialId, ProjectRole, projectRoleValues } from "./access";
import {
  type CollectionFieldKind as M6CollectionFieldKindType,
  type FieldConfigurationByKind,
  CollectionFieldKind as M6CollectionFieldKind,
  EditorLayout,
  FieldEditorMetadata,
  FieldLocalization,
  FieldNodeRole,
  fieldConfigurationSchemas,
  fieldSystemLimits,
  fieldSystemValidationProfile,
  iso4217RegistryProfile,
} from "./field-system";
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

export const CollectionFieldKind = M6CollectionFieldKind;
export type CollectionFieldKind = M6CollectionFieldKindType;

export const CollectionFieldLocalization = FieldLocalization;
export type CollectionFieldLocalization = typeof CollectionFieldLocalization.Type;

export const CollectionFieldPosition = Schema.Number.pipe(Schema.int(), Schema.between(0, 99));
export type CollectionFieldPosition = typeof CollectionFieldPosition.Type;

export const SchemaFormatVersion = Schema.Literal(1, 2);
export type SchemaFormatVersion = typeof SchemaFormatVersion.Type;

export const SchemaValidationProfile = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[a-z0-9][a-z0-9@._-]{0,63}$/u),
);
export type SchemaValidationProfile = typeof SchemaValidationProfile.Type;

export const CurrencyRegistryProfile = Schema.String.pipe(
  Schema.length(19),
  Schema.pattern(/^iso-4217@[0-9]{4}-[0-9]{2}-[0-9]{2}$/u),
);
export type CurrencyRegistryProfile = typeof CurrencyRegistryProfile.Type;
export const currentCurrencyRegistryProfile = CurrencyRegistryProfile.make(iso4217RegistryProfile);

export const SchemaHash = Schema.String.pipe(
  Schema.length(64),
  Schema.pattern(digestPattern),
  Schema.brand("SchemaHash"),
);
export type SchemaHash = typeof SchemaHash.Type;

export const ContractHash = Schema.String.pipe(
  Schema.length(64),
  Schema.pattern(digestPattern),
  Schema.brand("ContractHash"),
);
export type ContractHash = typeof ContractHash.Type;

export const defaultFieldEditorMetadata = FieldEditorMetadata.make({
  helpText: null,
  placeholder: null,
  visibleToRoles: [...projectRoleValues],
  editableByRoles: ["owner", "developer", "content_admin", "editor", "client_editor"],
});

export const CollectionFieldConfiguration = Schema.Union(
  fieldConfigurationSchemas.short_text,
  fieldConfigurationSchemas.long_text,
  fieldConfigurationSchemas.rich_text,
  fieldConfigurationSchemas.number,
  fieldConfigurationSchemas.decimal,
  fieldConfigurationSchemas.money,
  fieldConfigurationSchemas.boolean,
  fieldConfigurationSchemas.date,
  fieldConfigurationSchemas.date_time,
  fieldConfigurationSchemas.enum,
  fieldConfigurationSchemas.url,
  fieldConfigurationSchemas.email,
  fieldConfigurationSchemas.slug,
  fieldConfigurationSchemas.json,
  fieldConfigurationSchemas.object,
  fieldConfigurationSchemas.list,
  fieldConfigurationSchemas.reference,
  fieldConfigurationSchemas.external_asset,
);
export type CollectionFieldConfiguration = typeof CollectionFieldConfiguration.Type;

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
  "collection.api_key.updated",
  "schema.format.upgraded",
  "schema.currency_profile.updated",
  "editor_layout.updated",
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
  "field.structure.updated",
  "field.configuration.updated",
  "field.editor.updated",
  "field.removed",
] as const;
export const SchemaChangeCode = Schema.Literal(...schemaChangeCodeValues);
export type SchemaChangeCode = typeof SchemaChangeCode.Type;

export const SchemaValidationIssueCode = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[a-z][a-z0-9_]*$/u),
);
export type SchemaValidationIssueCode = typeof SchemaValidationIssueCode.Type;

interface CollectionFieldDefinitionBase {
  readonly id: CollectionFieldId;
  readonly parentFieldId: CollectionFieldId | null;
  readonly nodeRole: typeof FieldNodeRole.Type;
  readonly apiKey: CollectionFieldApiKey | null;
  readonly displayLabel: CollectionFieldDisplayLabel | null;
  readonly required: boolean | null;
  readonly localization: CollectionFieldLocalization | null;
  readonly deprecated: boolean;
  readonly position: CollectionFieldPosition;
  readonly editor: FieldEditorMetadata;
  readonly children: ReadonlyArray<CollectionFieldDefinition>;
}

export type CollectionFieldDefinition = {
  readonly [Kind in CollectionFieldKind]: CollectionFieldDefinitionBase & {
    readonly kind: Kind;
    readonly configuration: FieldConfigurationByKind[Kind];
  };
}[CollectionFieldKind];

type FieldConfigurationSchemaByKind = typeof fieldConfigurationSchemas;
export type FieldConfigurationEncodedByKind = {
  readonly [Kind in CollectionFieldKind]: Schema.Schema.Encoded<
    FieldConfigurationSchemaByKind[Kind]
  >;
};

export interface CollectionFieldDefinitionEncodedBase {
  readonly id: string;
  readonly parentFieldId: string | null;
  readonly nodeRole: typeof FieldNodeRole.Type;
  readonly apiKey: string | null;
  readonly displayLabel: string | null;
  readonly required: boolean | null;
  readonly localization: CollectionFieldLocalization | null;
  readonly deprecated: boolean;
  readonly position: number;
  readonly editor: Schema.Schema.Encoded<typeof FieldEditorMetadata>;
  readonly children: ReadonlyArray<CollectionFieldDefinitionEncoded>;
}

export type CollectionFieldDefinitionEncoded = {
  readonly [Kind in CollectionFieldKind]: CollectionFieldDefinitionEncodedBase & {
    readonly kind: Kind;
    readonly configuration: FieldConfigurationEncodedByKind[Kind];
  };
}[CollectionFieldKind];

const CollectionFieldChildren = Schema.Array(
  Schema.suspend(
    (): Schema.Schema<CollectionFieldDefinition, CollectionFieldDefinitionEncoded> =>
      CollectionFieldDefinition,
  ).annotations({ identifier: "CollectionFieldDefinition" }),
).pipe(Schema.maxItems(fieldSystemLimits.directObjectProperties));

/** Builds one strict kind-correlated recursive field-definition variant. */
function collectionFieldVariant<Kind extends CollectionFieldKind, Encoded, Requirements>(
  kind: Kind,
  configuration: Schema.Schema<FieldConfigurationByKind[Kind], Encoded, Requirements>,
) {
  return Schema.Struct({
    id: CollectionFieldId,
    parentFieldId: Schema.NullOr(CollectionFieldId),
    nodeRole: FieldNodeRole,
    apiKey: Schema.NullOr(CollectionFieldApiKey),
    displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
    kind: Schema.Literal(kind),
    required: Schema.NullOr(Schema.Boolean),
    localization: Schema.NullOr(CollectionFieldLocalization),
    deprecated: Schema.Boolean,
    position: CollectionFieldPosition,
    editor: FieldEditorMetadata,
    configuration,
    children: CollectionFieldChildren,
  }).annotations({ parseOptions: { onExcessProperty: "error" } });
}

export const CollectionFieldDefinition: Schema.Schema<
  CollectionFieldDefinition,
  CollectionFieldDefinitionEncoded
> = Schema.Union(
  collectionFieldVariant("short_text", fieldConfigurationSchemas.short_text),
  collectionFieldVariant("long_text", fieldConfigurationSchemas.long_text),
  collectionFieldVariant("rich_text", fieldConfigurationSchemas.rich_text),
  collectionFieldVariant("number", fieldConfigurationSchemas.number),
  collectionFieldVariant("decimal", fieldConfigurationSchemas.decimal),
  collectionFieldVariant("money", fieldConfigurationSchemas.money),
  collectionFieldVariant("boolean", fieldConfigurationSchemas.boolean),
  collectionFieldVariant("date", fieldConfigurationSchemas.date),
  collectionFieldVariant("date_time", fieldConfigurationSchemas.date_time),
  collectionFieldVariant("enum", fieldConfigurationSchemas.enum),
  collectionFieldVariant("url", fieldConfigurationSchemas.url),
  collectionFieldVariant("email", fieldConfigurationSchemas.email),
  collectionFieldVariant("slug", fieldConfigurationSchemas.slug),
  collectionFieldVariant("json", fieldConfigurationSchemas.json),
  collectionFieldVariant("object", fieldConfigurationSchemas.object),
  collectionFieldVariant("list", fieldConfigurationSchemas.list),
  collectionFieldVariant("reference", fieldConfigurationSchemas.reference),
  collectionFieldVariant("external_asset", fieldConfigurationSchemas.external_asset),
);

export const CollectionFieldDefinitions = Schema.Array(CollectionFieldDefinition).pipe(
  Schema.maxItems(fieldSystemLimits.fieldNodes),
);
export type CollectionFieldDefinitions = typeof CollectionFieldDefinitions.Type;

interface CollectionFieldMutationBase {
  readonly apiKey: CollectionFieldApiKey | null;
  readonly displayLabel: CollectionFieldDisplayLabel | null;
  readonly required: boolean | null;
  readonly localization: CollectionFieldLocalization | null;
  readonly deprecated: boolean;
  readonly editor: FieldEditorMetadata;
}

export type CollectionFieldMutation = {
  readonly [Kind in CollectionFieldKind]: CollectionFieldMutationBase & {
    readonly kind: Kind;
    readonly configuration: FieldConfigurationByKind[Kind];
  };
}[CollectionFieldKind];

export type CollectionFieldMutationEncoded = {
  readonly [Kind in CollectionFieldKind]: {
    readonly apiKey: string | null;
    readonly displayLabel: string | null;
    readonly required: boolean | null;
    readonly localization: CollectionFieldLocalization | null;
    readonly deprecated: boolean;
    readonly editor: Schema.Schema.Encoded<typeof FieldEditorMetadata>;
    readonly kind: Kind;
    readonly configuration: FieldConfigurationEncodedByKind[Kind];
  };
}[CollectionFieldKind];

/** Builds one strict kind-correlated field-mutation variant. */
function collectionFieldMutationVariant<Kind extends CollectionFieldKind, Encoded, Requirements>(
  kind: Kind,
  configuration: Schema.Schema<FieldConfigurationByKind[Kind], Encoded, Requirements>,
) {
  return Schema.Struct({
    apiKey: Schema.NullOr(CollectionFieldApiKey),
    displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
    kind: Schema.Literal(kind),
    required: Schema.NullOr(Schema.Boolean),
    localization: Schema.NullOr(CollectionFieldLocalization),
    deprecated: Schema.Boolean,
    editor: FieldEditorMetadata,
    configuration,
  }).annotations({ parseOptions: { onExcessProperty: "error" } });
}

export const CollectionFieldMutation: Schema.Schema<
  CollectionFieldMutation,
  CollectionFieldMutationEncoded
> = Schema.Union(
  collectionFieldMutationVariant("short_text", fieldConfigurationSchemas.short_text),
  collectionFieldMutationVariant("long_text", fieldConfigurationSchemas.long_text),
  collectionFieldMutationVariant("rich_text", fieldConfigurationSchemas.rich_text),
  collectionFieldMutationVariant("number", fieldConfigurationSchemas.number),
  collectionFieldMutationVariant("decimal", fieldConfigurationSchemas.decimal),
  collectionFieldMutationVariant("money", fieldConfigurationSchemas.money),
  collectionFieldMutationVariant("boolean", fieldConfigurationSchemas.boolean),
  collectionFieldMutationVariant("date", fieldConfigurationSchemas.date),
  collectionFieldMutationVariant("date_time", fieldConfigurationSchemas.date_time),
  collectionFieldMutationVariant("enum", fieldConfigurationSchemas.enum),
  collectionFieldMutationVariant("url", fieldConfigurationSchemas.url),
  collectionFieldMutationVariant("email", fieldConfigurationSchemas.email),
  collectionFieldMutationVariant("slug", fieldConfigurationSchemas.slug),
  collectionFieldMutationVariant("json", fieldConfigurationSchemas.json),
  collectionFieldMutationVariant("object", fieldConfigurationSchemas.object),
  collectionFieldMutationVariant("list", fieldConfigurationSchemas.list),
  collectionFieldMutationVariant("reference", fieldConfigurationSchemas.reference),
  collectionFieldMutationVariant("external_asset", fieldConfigurationSchemas.external_asset),
);

interface CollectionFieldAuthoringNodeBase extends CollectionFieldMutationBase {
  readonly id: CollectionFieldId | null;
  readonly children: ReadonlyArray<CollectionFieldAuthoringNode>;
}

export type CollectionFieldAuthoringNode = {
  readonly [Kind in CollectionFieldKind]: CollectionFieldAuthoringNodeBase & {
    readonly kind: Kind;
    readonly configuration: FieldConfigurationByKind[Kind];
  };
}[CollectionFieldKind];

interface CollectionFieldAuthoringNodeEncodedBase {
  readonly id: string | null;
  readonly apiKey: string | null;
  readonly displayLabel: string | null;
  readonly required: boolean | null;
  readonly localization: CollectionFieldLocalization | null;
  readonly deprecated: boolean;
  readonly editor: Schema.Schema.Encoded<typeof FieldEditorMetadata>;
  readonly children: ReadonlyArray<CollectionFieldAuthoringNodeEncoded>;
}

export type CollectionFieldAuthoringNodeEncoded = {
  readonly [Kind in CollectionFieldKind]: CollectionFieldAuthoringNodeEncodedBase & {
    readonly kind: Kind;
    readonly configuration: FieldConfigurationEncodedByKind[Kind];
  };
}[CollectionFieldKind];

const CollectionFieldAuthoringChildren = Schema.Array(
  Schema.suspend(
    (): Schema.Schema<CollectionFieldAuthoringNode, CollectionFieldAuthoringNodeEncoded> =>
      CollectionFieldAuthoringNode,
  ).annotations({ identifier: "CollectionFieldAuthoringNode" }),
).pipe(Schema.maxItems(fieldSystemLimits.directObjectProperties));

/** Builds one strict kind-correlated recursive field-authoring variant. */
function collectionFieldAuthoringVariant<Kind extends CollectionFieldKind, Encoded, Requirements>(
  kind: Kind,
  configuration: Schema.Schema<FieldConfigurationByKind[Kind], Encoded, Requirements>,
) {
  return Schema.Struct({
    id: Schema.NullOr(CollectionFieldId),
    apiKey: Schema.NullOr(CollectionFieldApiKey),
    displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
    kind: Schema.Literal(kind),
    required: Schema.NullOr(Schema.Boolean),
    localization: Schema.NullOr(CollectionFieldLocalization),
    deprecated: Schema.Boolean,
    editor: FieldEditorMetadata,
    configuration,
    children: CollectionFieldAuthoringChildren,
  }).annotations({ parseOptions: { onExcessProperty: "error" } });
}

export const CollectionFieldAuthoringNode: Schema.Schema<
  CollectionFieldAuthoringNode,
  CollectionFieldAuthoringNodeEncoded
> = Schema.Union(
  collectionFieldAuthoringVariant("short_text", fieldConfigurationSchemas.short_text),
  collectionFieldAuthoringVariant("long_text", fieldConfigurationSchemas.long_text),
  collectionFieldAuthoringVariant("rich_text", fieldConfigurationSchemas.rich_text),
  collectionFieldAuthoringVariant("number", fieldConfigurationSchemas.number),
  collectionFieldAuthoringVariant("decimal", fieldConfigurationSchemas.decimal),
  collectionFieldAuthoringVariant("money", fieldConfigurationSchemas.money),
  collectionFieldAuthoringVariant("boolean", fieldConfigurationSchemas.boolean),
  collectionFieldAuthoringVariant("date", fieldConfigurationSchemas.date),
  collectionFieldAuthoringVariant("date_time", fieldConfigurationSchemas.date_time),
  collectionFieldAuthoringVariant("enum", fieldConfigurationSchemas.enum),
  collectionFieldAuthoringVariant("url", fieldConfigurationSchemas.url),
  collectionFieldAuthoringVariant("email", fieldConfigurationSchemas.email),
  collectionFieldAuthoringVariant("slug", fieldConfigurationSchemas.slug),
  collectionFieldAuthoringVariant("json", fieldConfigurationSchemas.json),
  collectionFieldAuthoringVariant("object", fieldConfigurationSchemas.object),
  collectionFieldAuthoringVariant("list", fieldConfigurationSchemas.list),
  collectionFieldAuthoringVariant("reference", fieldConfigurationSchemas.reference),
  collectionFieldAuthoringVariant("external_asset", fieldConfigurationSchemas.external_asset),
);

export const CollectionFieldAuthoringNodes = Schema.Array(CollectionFieldAuthoringNode).pipe(
  Schema.maxItems(fieldSystemLimits.fieldNodes),
);
export type CollectionFieldAuthoringNodes = typeof CollectionFieldAuthoringNodes.Type;

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
  formatVersion: Schema.Literal(2),
  validationProfile: Schema.Literal(fieldSystemValidationProfile),
  currencyRegistryProfile: Schema.NullOr(CurrencyRegistryProfile),
  collection: CmsCollection,
  fields: CollectionFieldDefinitions,
  editorLayout: EditorLayout,
  contractHash: ContractHash,
}) {}

export const PublishedSchemaField = CollectionFieldDefinition;
export type PublishedSchemaField = CollectionFieldDefinition;

export const PublishedSchemaFields = Schema.Array(PublishedSchemaField).pipe(
  Schema.minItems(1),
  Schema.maxItems(fieldSystemLimits.fieldNodes),
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
  formatVersion: SchemaFormatVersion,
  validationProfile: SchemaValidationProfile,
  currencyRegistryProfile: Schema.NullOr(CurrencyRegistryProfile),
  collectionApiKey: CollectionApiKey,
  collectionDisplayName: CollectionDisplayName,
  collectionDescription: Schema.NullOr(CollectionDescription),
  schemaHash: SchemaHash,
  contractHash: ContractHash,
  commandId: SchemaPublicationCommandId,
  nonBreakingChangeCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  potentiallyBreakingChangeCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  breakingChangeCount: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
  publishedByUserId: Schema.NullOr(AuthUserId),
  publishedByCredentialId: Schema.NullOr(ApiCredentialId),
  publishedAt: IsoDateTime,
  fields: PublishedSchemaFields,
  editorLayout: EditorLayout,
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
  contractHash: Schema.NullOr(ContractHash),
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

export class CreateCollectionFieldInput extends Schema.Class<CreateCollectionFieldInput>(
  "CreateCollectionFieldInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  parentFieldId: Schema.NullOr(CollectionFieldId),
  draftVersion: ResourceVersion,
  field: CollectionFieldMutation,
}) {}

export class UpdateCollectionFieldInput extends Schema.Class<UpdateCollectionFieldInput>(
  "UpdateCollectionFieldInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  fieldId: CollectionFieldId,
  draftVersion: ResourceVersion,
  field: CollectionFieldMutation,
}) {}

export class ReplaceCollectionDraftFieldsInput extends Schema.Class<ReplaceCollectionDraftFieldsInput>(
  "ReplaceCollectionDraftFieldsInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  draftVersion: ResourceVersion,
  authoringVersion: Schema.Literal(1),
  fields: CollectionFieldAuthoringNodes,
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
  parentFieldId: Schema.NullOr(CollectionFieldId),
  draftVersion: ResourceVersion,
  fieldIds: CollectionFieldOrder,
}) {}

export class UpdateEditorLayoutInput extends Schema.Class<UpdateEditorLayoutInput>(
  "UpdateEditorLayoutInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  draftVersion: ResourceVersion,
  editorLayout: EditorLayout,
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

export class GetDraftGeneratedFormInput extends Schema.Class<GetDraftGeneratedFormInput>(
  "GetDraftGeneratedFormInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
}) {}

export class GetPublishedGeneratedFormInput extends Schema.Class<GetPublishedGeneratedFormInput>(
  "GetPublishedGeneratedFormInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  revisionId: Schema.NullOr(SchemaRevisionId),
}) {}

export const GeneratedFormEditableFieldIds = Schema.Array(CollectionFieldId).pipe(
  Schema.maxItems(fieldSystemLimits.fieldNodes),
  Schema.filter((fieldIds) => new Set(fieldIds).size === fieldIds.length, {
    message: () => "Editable generated-form field IDs must be unique.",
  }),
);

export class GeneratedFormDefinition extends Schema.Class<GeneratedFormDefinition>(
  "GeneratedFormDefinition",
)({
  source: Schema.Literal("draft", "published"),
  collectionId: CollectionId,
  revisionId: Schema.NullOr(SchemaRevisionId),
  formatVersion: SchemaFormatVersion,
  validationProfile: SchemaValidationProfile,
  currencyRegistryProfile: Schema.NullOr(CurrencyRegistryProfile),
  contractHash: ContractHash,
  role: ProjectRole,
  canEdit: Schema.Boolean,
  fields: CollectionFieldDefinitions,
  editableFieldIds: GeneratedFormEditableFieldIds,
  editorLayout: EditorLayout,
  currencyMinorUnits: Schema.Record({
    key: Schema.String.pipe(Schema.length(3)),
    value: Schema.Number.pipe(Schema.int(), Schema.between(0, 4)),
  }),
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
export const ReplaceCollectionDraftFieldsInputSchema = Schema.standardSchemaV1(
  ReplaceCollectionDraftFieldsInput,
);
export const RemoveCollectionFieldInputSchema = Schema.standardSchemaV1(RemoveCollectionFieldInput);
export const ReorderCollectionFieldsInputSchema = Schema.standardSchemaV1(
  ReorderCollectionFieldsInput,
);
export const UpdateEditorLayoutInputSchema = Schema.standardSchemaV1(UpdateEditorLayoutInput);
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
export const GetDraftGeneratedFormInputSchema = Schema.standardSchemaV1(GetDraftGeneratedFormInput);
export const GetPublishedGeneratedFormInputSchema = Schema.standardSchemaV1(
  GetPublishedGeneratedFormInput,
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
export const GeneratedFormDefinitionOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(GeneratedFormDefinition),
);
