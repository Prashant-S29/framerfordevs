import { Schema, SchemaTransformation, Effect } from "effect";

import { ApiCredentialId } from "../access";
import {
  ChangedEntryFieldIds,
  EntryCommandId,
  EntryDisplayName,
  EntryDraftVersion,
  EntryId,
  EntryNameVersion,
  EntryRevisionComparisonChange,
  EntryRevisionId,
  EntryRevisionScope,
  EntryRevisionSequence,
  EntryValidationIssue,
  EntryValueMutations,
  EntryValues,
  entryRevisionComparisonLimits,
} from "../entry";
import {
  EditorLayoutNodeId,
  EnumOptionId,
  type FieldConfigurationByKind,
  FieldNodeRole,
  fieldConfigurationSchemas,
} from "../field";
import { LocaleDisplayName, LocaleTag, ProjectLocaleId } from "../locale";
import { AuthUserId, Cursor, EnvironmentId, IsoDateTime, ProjectId } from "../platform";
import {
  EntryDeliveryReadBack,
  EntryPublicationHash,
  EntryPublicationId,
  EntryPublicationSequence,
  EntryPublicationStateVersion,
} from "../publication";
import { ApiErrorDetail, type ApiData, ApiSuccessSchema, RequestIdSchema } from "../response/api";
import {
  CollectionDescription,
  CollectionDisplayName,
  CollectionFieldDisplayLabel,
  CollectionFieldId,
  CollectionFieldKind,
  CollectionFieldLocalization,
  CollectionId,
  ContractHash,
  SchemaPublicationCommandId,
  SchemaRevisionId,
  SchemaRevisionSequence,
} from "../schema";

export const studioContentLimits = {
  requestBytes: 1_048_576,
  responseBytes: 4_194_304,
  searchRequestBytes: 2_048,
  commandRequestBytes: 4_096,
  presentationRequestBytes: 262_144,
  pageLimitDefault: 25,
  pageLimitMinimum: 10,
  pageLimitMaximum: 50,
  maximumCollections: 50,
  maximumLocales: 100,
  maximumConfigurationNotices: 50,
  maximumErrorDetails: 20,
  maximumSearchCharacters: 100,
  minimumSearchCharacters: 2,
  resolveRequestBytes: 8_192,
  maximumResolvedEntries: 100,
  maximumCount: 1_000,
  mutationValueDepth: 24,
  mutationValueNodes: 10_000,
} as const;

export class StudioContentScope extends Schema.Class<StudioContentScope>("StudioContentScope")(
  Schema.Struct({
    projectId: ProjectId,
    environmentId: EnvironmentId,
  }),
) {}

export class StudioCollectionScope extends Schema.Class<StudioCollectionScope>(
  "StudioCollectionScope",
)(
  Schema.Struct({
    projectId: ProjectId,
    environmentId: EnvironmentId,
    collectionId: CollectionId,
  }),
) {}

export class StudioCollectionLocaleScope extends Schema.Class<StudioCollectionLocaleScope>(
  "StudioCollectionLocaleScope",
)(
  Schema.Struct({
    projectId: ProjectId,
    environmentId: EnvironmentId,
    collectionId: CollectionId,
    locale: LocaleTag,
  }),
) {}

export const StudioContentPageLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({
    minimum: studioContentLimits.pageLimitMinimum,
    maximum: studioContentLimits.pageLimitMaximum,
  }),
).pipe(Schema.brand("StudioContentPageLimit"));
export type StudioContentPageLimit = typeof StudioContentPageLimit.Type;

export const StudioContentCursor = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1_024),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
).pipe(Schema.brand("StudioContentCursor"));
export type StudioContentCursor = typeof StudioContentCursor.Type;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

export const StudioContentSearchText = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => value.trim().normalize("NFC"),
      encode: (value) => value,
    }),
  ),
)
  .check(
    Schema.isMinLength(studioContentLimits.minimumSearchCharacters),
    Schema.isMaxLength(studioContentLimits.maximumSearchCharacters),
    Schema.makeFilter((value) => !hasControlCharacter(value), {
      message: "Studio entry search text cannot contain control characters.",
    }),
  )
  .pipe(Schema.brand("StudioContentSearchText"));
export type StudioContentSearchText = typeof StudioContentSearchText.Type;

export class StudioContentLocale extends Schema.Class<StudioContentLocale>("StudioContentLocale")(
  Schema.Struct({
    id: ProjectLocaleId,
    tag: LocaleTag,
    displayName: LocaleDisplayName,
    canRead: Schema.Literal(true),
    canWrite: Schema.Boolean,
    canPublish: Schema.Boolean,
  }),
) {}

export class StudioContentCollectionCapabilities extends Schema.Class<StudioContentCollectionCapabilities>(
  "StudioContentCollectionCapabilities",
)(
  Schema.Struct({
    canCreate: Schema.Boolean,
    canRename: Schema.Boolean,
    canSaveLocalized: Schema.Boolean,
    canSaveShared: Schema.Boolean,
    canPublish: Schema.Boolean,
    canPublishPresentation: Schema.Boolean,
  }),
) {}

export class StudioContentCollection extends Schema.Class<StudioContentCollection>(
  "StudioContentCollection",
)(
  Schema.Struct({
    id: CollectionId,
    displayName: CollectionDisplayName,
    capabilities: StudioContentCollectionCapabilities,
  }),
) {}

export const StudioCollectionConfigurationReason = Schema.Literals([
  "empty_schema",
  "projection_invalid",
]);
export type StudioCollectionConfigurationReason = typeof StudioCollectionConfigurationReason.Type;

export class StudioCollectionConfigurationInvalidFailure extends Schema.TaggedError<StudioCollectionConfigurationInvalidFailure>(
  "StudioCollectionConfigurationInvalidFailure",
)("StudioCollectionConfigurationInvalidFailure", {
  reason: StudioCollectionConfigurationReason,
}) {}

export class StudioContentCursorInvalidFailure extends Schema.TaggedError<StudioContentCursorInvalidFailure>(
  "StudioContentCursorInvalidFailure",
)("StudioContentCursorInvalidFailure", {}) {}

export class StudioContentCursorStaleFailure extends Schema.TaggedError<StudioContentCursorStaleFailure>(
  "StudioContentCursorStaleFailure",
)("StudioContentCursorStaleFailure", {}) {}

export class StudioDraftVersionConflictFailure extends Schema.TaggedError<StudioDraftVersionConflictFailure>(
  "StudioDraftVersionConflictFailure",
)("StudioDraftVersionConflictFailure", {
  details: Schema.Array(ApiErrorDetail).check(Schema.isMinLength(1), Schema.isMaxLength(2)),
}) {}

export class StudioNameVersionConflictFailure extends Schema.TaggedError<StudioNameVersionConflictFailure>(
  "StudioNameVersionConflictFailure",
)("StudioNameVersionConflictFailure", {}) {}

export class StudioCommandConflictFailure extends Schema.TaggedError<StudioCommandConflictFailure>(
  "StudioCommandConflictFailure",
)("StudioCommandConflictFailure", {}) {}

export class StudioRevisionIncompatibleFailure extends Schema.TaggedError<StudioRevisionIncompatibleFailure>(
  "StudioRevisionIncompatibleFailure",
)("StudioRevisionIncompatibleFailure", {}) {}

export class StudioPublicationInvalidFailure extends Schema.TaggedError<StudioPublicationInvalidFailure>(
  "StudioPublicationInvalidFailure",
)("StudioPublicationInvalidFailure", {
  details: Schema.Array(ApiErrorDetail).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(studioContentLimits.maximumErrorDetails),
  ),
}) {}

export class StudioPublicationStateConflictFailure extends Schema.TaggedError<StudioPublicationStateConflictFailure>(
  "StudioPublicationStateConflictFailure",
)("StudioPublicationStateConflictFailure", {
  details: Schema.Array(ApiErrorDetail).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(studioContentLimits.maximumErrorDetails),
  ),
}) {}

export class StudioCollectionConfigurationNotice extends Schema.Class<StudioCollectionConfigurationNotice>(
  "StudioCollectionConfigurationNotice",
)(
  Schema.Struct({
    collectionId: CollectionId,
    displayName: CollectionDisplayName,
    reason: StudioCollectionConfigurationReason,
  }),
) {}

export class StudioContentContext extends Schema.Class<StudioContentContext>(
  "StudioContentContext",
)(
  Schema.Struct({
    locales: Schema.Array(StudioContentLocale).check(
      Schema.isMaxLength(studioContentLimits.maximumLocales),
    ),
    collections: Schema.Array(StudioContentCollection).check(
      Schema.isMaxLength(studioContentLimits.maximumCollections),
    ),
    configurationNotices: Schema.Array(StudioCollectionConfigurationNotice).check(
      Schema.isMaxLength(studioContentLimits.maximumConfigurationNotices),
    ),
  }),
) {}

export class StudioEntrySummary extends Schema.Class<StudioEntrySummary>("StudioEntrySummary")(
  Schema.Struct({
    id: EntryId,
    displayName: EntryDisplayName,
    nameVersion: EntryNameVersion,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  }),
) {}

export const StudioBoundedMatchCount = Schema.Union([
  Schema.Struct({
    value: Schema.Number.check(
      Schema.isInt(),
      Schema.isBetween({ minimum: 0, maximum: studioContentLimits.maximumCount }),
    ),
    relation: Schema.Literal("exact"),
  }),
  Schema.Struct({
    value: Schema.Literal(studioContentLimits.maximumCount),
    relation: Schema.Literal("at_least"),
  }),
]);
export type StudioBoundedMatchCount = typeof StudioBoundedMatchCount.Type;

export class StudioEntryPage extends Schema.Class<StudioEntryPage>("StudioEntryPage")(
  Schema.Struct({
    items: Schema.Array(StudioEntrySummary).check(
      Schema.isMaxLength(studioContentLimits.pageLimitMaximum),
    ),
    hasMore: Schema.Boolean,
    nextCursor: Schema.NullOr(StudioContentCursor),
    count: StudioBoundedMatchCount,
  }),
) {}

export const StudioListEntriesQuery = Schema.Struct({
  cursor: Schema.NullOr(StudioContentCursor).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => null)),
  ),
  limit: StudioContentPageLimit.pipe(
    Schema.withDecodingDefaultType(
      Effect.sync(() => StudioContentPageLimit.make(studioContentLimits.pageLimitDefault)),
    ),
  ),
}).annotate({ identifier: "StudioListEntriesQuery" });
export type StudioListEntriesQuery = typeof StudioListEntriesQuery.Type;

export const StudioSearchEntriesRequest = Schema.Struct({
  query: StudioContentSearchText,
  cursor: Schema.NullOr(StudioContentCursor).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => null)),
  ),
  limit: StudioContentPageLimit.pipe(
    Schema.withDecodingDefaultType(
      Effect.sync(() => StudioContentPageLimit.make(studioContentLimits.pageLimitDefault)),
    ),
  ),
}).annotate({ identifier: "StudioSearchEntriesRequest" });
export type StudioSearchEntriesRequest = typeof StudioSearchEntriesRequest.Type;

export const StudioResolveEntryIds = Schema.Array(EntryId).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(studioContentLimits.maximumResolvedEntries),
  Schema.makeFilter((entryIds) => new Set(entryIds).size === entryIds.length, {
    message: "Studio reference entry IDs must be unique.",
  }),
);
export type StudioResolveEntryIds = typeof StudioResolveEntryIds.Type;

export class StudioResolveEntriesRequest extends Schema.Class<StudioResolveEntriesRequest>(
  "StudioResolveEntriesRequest",
)(
  Schema.Struct({
    entryIds: StudioResolveEntryIds,
  }),
) {}

export class StudioResolvedEntryLabel extends Schema.Class<StudioResolvedEntryLabel>(
  "StudioResolvedEntryLabel",
)(
  Schema.Struct({
    id: EntryId,
    displayName: EntryDisplayName,
  }),
) {}

export class StudioResolvedEntryLabels extends Schema.Class<StudioResolvedEntryLabels>(
  "StudioResolvedEntryLabels",
)(
  Schema.Struct({
    items: Schema.Array(StudioResolvedEntryLabel).check(
      Schema.isMaxLength(studioContentLimits.maximumResolvedEntries),
    ),
  }),
) {}

interface StudioFormFieldBase {
  readonly id: CollectionFieldId;
  readonly parentFieldId: CollectionFieldId | null;
  readonly nodeRole: typeof FieldNodeRole.Type;
  readonly displayLabel: typeof CollectionFieldDisplayLabel.Type | null;
  readonly required: boolean | null;
  readonly localization: typeof CollectionFieldLocalization.Type | null;
  readonly position: number;
  readonly helpText: string | null;
  readonly placeholder: string | null;
  readonly children: ReadonlyArray<StudioFormField>;
}

export type StudioFormField = {
  readonly [Kind in typeof CollectionFieldKind.Type]: StudioFormFieldBase & {
    readonly kind: Kind;
    readonly configuration: FieldConfigurationByKind[Kind];
  };
}[typeof CollectionFieldKind.Type];

type StudioFieldConfigurationSchemaByKind = typeof fieldConfigurationSchemas;
type StudioFieldConfigurationEncodedByKind = {
  readonly [Kind in typeof CollectionFieldKind.Type]: Schema.Codec.Encoded<
    StudioFieldConfigurationSchemaByKind[Kind]
  >;
};

interface StudioFormFieldEncodedBase {
  readonly id: string;
  readonly parentFieldId: string | null;
  readonly nodeRole: typeof FieldNodeRole.Type;
  readonly displayLabel: string | null;
  readonly required: boolean | null;
  readonly localization: typeof CollectionFieldLocalization.Type | null;
  readonly position: number;
  readonly helpText: string | null;
  readonly placeholder: string | null;
  readonly children: ReadonlyArray<StudioFormFieldEncoded>;
}

type StudioFormFieldEncoded = {
  readonly [Kind in typeof CollectionFieldKind.Type]: StudioFormFieldEncodedBase & {
    readonly kind: Kind;
    readonly configuration: StudioFieldConfigurationEncodedByKind[Kind];
  };
}[typeof CollectionFieldKind.Type];

function studioFormFieldVariant<
  Kind extends typeof CollectionFieldKind.Type,
  Encoded,
  Requirements,
>(kind: Kind, configuration: Schema.Codec<FieldConfigurationByKind[Kind], Encoded, Requirements>) {
  return Schema.Struct({
    id: CollectionFieldId,
    parentFieldId: Schema.NullOr(CollectionFieldId),
    nodeRole: FieldNodeRole,
    displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
    kind: Schema.Literal(kind),
    required: Schema.NullOr(Schema.Boolean),
    localization: Schema.NullOr(CollectionFieldLocalization),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
    helpText: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    placeholder: Schema.NullOr(Schema.String.check(Schema.isMaxLength(200))),
    configuration,
    children: Schema.Array(
      Schema.suspend((): Schema.Codec<StudioFormField, StudioFormFieldEncoded> => StudioFormField),
    ).check(Schema.isMaxLength(100)),
  });
}

export const StudioFormField: Schema.Codec<StudioFormField, StudioFormFieldEncoded> = Schema.Union([
  studioFormFieldVariant("short_text", fieldConfigurationSchemas.short_text),
  studioFormFieldVariant("long_text", fieldConfigurationSchemas.long_text),
  studioFormFieldVariant("rich_text", fieldConfigurationSchemas.rich_text),
  studioFormFieldVariant("number", fieldConfigurationSchemas.number),
  studioFormFieldVariant("decimal", fieldConfigurationSchemas.decimal),
  studioFormFieldVariant("money", fieldConfigurationSchemas.money),
  studioFormFieldVariant("boolean", fieldConfigurationSchemas.boolean),
  studioFormFieldVariant("date", fieldConfigurationSchemas.date),
  studioFormFieldVariant("date_time", fieldConfigurationSchemas.date_time),
  studioFormFieldVariant("enum", fieldConfigurationSchemas.enum),
  studioFormFieldVariant("url", fieldConfigurationSchemas.url),
  studioFormFieldVariant("email", fieldConfigurationSchemas.email),
  studioFormFieldVariant("slug", fieldConfigurationSchemas.slug),
  studioFormFieldVariant("json", fieldConfigurationSchemas.json),
  studioFormFieldVariant("object", fieldConfigurationSchemas.object),
  studioFormFieldVariant("list", fieldConfigurationSchemas.list),
  studioFormFieldVariant("reference", fieldConfigurationSchemas.reference),
  studioFormFieldVariant("external_asset", fieldConfigurationSchemas.external_asset),
]).annotate({ identifier: "StudioFormField" });

export class StudioFormPlacement extends Schema.Class<StudioFormPlacement>("StudioFormPlacement")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    fieldId: CollectionFieldId,
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
    helpTextOverride: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  }),
) {}

export class StudioFormGroup extends Schema.Class<StudioFormGroup>("StudioFormGroup")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 19 })),
    columns: Schema.Literals([1, 2]),
    fields: Schema.Array(StudioFormPlacement).check(Schema.isMaxLength(100)),
  }),
) {}

export class StudioFormTab extends Schema.Class<StudioFormTab>("StudioFormTab")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 9 })),
    groups: Schema.Array(StudioFormGroup).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
  }),
) {}

export class StudioFormProjection extends Schema.Class<StudioFormProjection>(
  "StudioFormProjection",
)(
  Schema.Struct({
    collectionId: CollectionId,
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    canEdit: Schema.Boolean,
    fields: Schema.Array(StudioFormField).check(Schema.isMaxLength(100)),
    editableFieldIds: Schema.Array(CollectionFieldId).check(Schema.isMaxLength(100)),
    tabs: Schema.Array(StudioFormTab).check(Schema.isMaxLength(10)),
    sidebarGroups: Schema.Array(StudioFormGroup).check(Schema.isMaxLength(10)),
    currencyMinorUnits: Schema.Record(
      Schema.String.check(Schema.isBetweenLength(3, 3)),
      Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 3 })),
    ),
  }),
) {}

export const StudioValidationStatus = Schema.Literals(["valid", "invalid", "restricted_issues"]);
export type StudioValidationStatus = typeof StudioValidationStatus.Type;

const StudioEntryValidationIssue = EntryValidationIssue;

export class StudioEntryValidation extends Schema.Class<StudioEntryValidation>(
  "StudioEntryValidation",
)(
  Schema.Struct({
    status: StudioValidationStatus,
    issues: Schema.Array(StudioEntryValidationIssue).check(Schema.isMaxLength(50)),
    capped: Schema.Boolean,
  }),
) {}

export class StudioNewEntryWorkspace extends Schema.Class<StudioNewEntryWorkspace>(
  "StudioNewEntryWorkspace",
)(
  Schema.Struct({
    localeId: ProjectLocaleId,
    locale: LocaleTag,
    form: StudioFormProjection,
    capabilities: StudioContentCollectionCapabilities,
  }),
) {}

export class StudioEntryDraftProjection extends Schema.Class<StudioEntryDraftProjection>(
  "StudioEntryDraftProjection",
)(
  Schema.Struct({
    entry: StudioEntrySummary,
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    sharedVersion: EntryDraftVersion,
    sharedRevisionId: Schema.NullOr(EntryRevisionId),
    sharedValues: EntryValues,
    localizedVersion: EntryDraftVersion,
    localizedRevisionId: Schema.NullOr(EntryRevisionId),
    localizedValues: EntryValues,
    validation: StudioEntryValidation,
  }),
) {}

export class StudioPublicationSummary extends Schema.Class<StudioPublicationSummary>(
  "StudioPublicationSummary",
)(
  Schema.Struct({
    id: EntryPublicationId,
    sequence: EntryPublicationSequence,
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    changedFieldIds: ChangedEntryFieldIds,
    publishedAt: IsoDateTime,
    current: Schema.Boolean,
  }),
) {}

export const StudioPublicationState = Schema.Literals([
  "published",
  "unpublished",
  "never_published",
]);
export type StudioPublicationState = typeof StudioPublicationState.Type;

export class StudioPublicationStatus extends Schema.Class<StudioPublicationStatus>(
  "StudioPublicationStatus",
)(
  Schema.Struct({
    state: StudioPublicationState,
    stateVersion: EntryPublicationStateVersion,
    currentPublication: Schema.NullOr(StudioPublicationSummary),
    sharedChanged: Schema.Boolean,
    localizedChanged: Schema.Boolean,
    schemaChanged: Schema.Boolean,
    changedSincePublication: Schema.Boolean,
  }),
) {}

export class StudioEntryWorkspace extends Schema.Class<StudioEntryWorkspace>(
  "StudioEntryWorkspace",
)(
  Schema.Struct({
    localeId: ProjectLocaleId,
    locale: LocaleTag,
    form: StudioFormProjection,
    capabilities: StudioContentCollectionCapabilities,
    draft: StudioEntryDraftProjection,
    publication: StudioPublicationStatus,
  }),
) {}

export class StudioRevisionSummary extends Schema.Class<StudioRevisionSummary>(
  "StudioRevisionSummary",
)(
  Schema.Struct({
    id: EntryRevisionId,
    scope: EntryRevisionScope,
    sequence: EntryRevisionSequence,
    previousRevisionId: Schema.NullOr(EntryRevisionId),
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    changedFieldIds: ChangedEntryFieldIds,
    restoredFromRevisionId: Schema.NullOr(EntryRevisionId),
    authoredByUserId: Schema.NullOr(AuthUserId),
    authoredByCredentialId: Schema.NullOr(ApiCredentialId),
    authoredAt: IsoDateTime,
    compatible: Schema.Boolean,
  }),
) {}

export class StudioRevisionPage extends Schema.Class<StudioRevisionPage>("StudioRevisionPage")(
  Schema.Struct({
    items: Schema.Array(StudioRevisionSummary).check(
      Schema.isMaxLength(studioContentLimits.pageLimitMaximum),
    ),
    nextCursor: Schema.NullOr(StudioContentCursor),
  }),
) {}

export class StudioRevision extends Schema.Class<StudioRevision>("StudioRevision")(
  Schema.Struct({
    revision: StudioRevisionSummary,
    values: EntryValues,
  }),
) {}

export class StudioRevisionComparisonItem extends Schema.Class<StudioRevisionComparisonItem>(
  "StudioRevisionComparisonItem",
)(
  Schema.Struct({
    fieldId: CollectionFieldId,
    change: EntryRevisionComparisonChange,
    before: Schema.optionalKey(Schema.Unknown),
    after: Schema.optionalKey(Schema.Unknown),
    inCurrentSchema: Schema.Boolean,
  }),
) {}

export class StudioRevisionComparison extends Schema.Class<StudioRevisionComparison>(
  "StudioRevisionComparison",
)(
  Schema.Struct({
    from: StudioRevisionSummary,
    to: StudioRevisionSummary,
    items: Schema.Array(StudioRevisionComparisonItem).check(
      Schema.isMaxLength(entryRevisionComparisonLimits.maximumItems),
    ),
    restrictedChanges: Schema.Boolean,
    schemaDiffers: Schema.Boolean,
  }),
) {}

export class StudioPublicationPage extends Schema.Class<StudioPublicationPage>(
  "StudioPublicationPage",
)(
  Schema.Struct({
    items: Schema.Array(StudioPublicationSummary).check(
      Schema.isMaxLength(studioContentLimits.pageLimitMaximum),
    ),
    nextCursor: Schema.NullOr(StudioContentCursor),
  }),
) {}

export class StudioPublicationEntryIssue extends Schema.Class<StudioPublicationEntryIssue>(
  "StudioPublicationEntryIssue",
)(
  Schema.Struct({
    code: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(64),
      Schema.isPattern(/^[a-z][a-z0-9_]{0,63}$/u),
    ),
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  }),
) {}

export class StudioPublicationPlan extends Schema.Class<StudioPublicationPlan>(
  "StudioPublicationPlan",
)(
  Schema.Struct({
    authorityHash: Schema.NullOr(EntryPublicationHash),
    stateVersion: EntryPublicationStateVersion,
    currentPublicationId: Schema.NullOr(EntryPublicationId),
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    sharedVersion: EntryDraftVersion,
    sharedRevisionId: Schema.NullOr(EntryRevisionId),
    localizedVersion: EntryDraftVersion,
    localizedRevisionId: Schema.NullOr(EntryRevisionId),
    wouldCreatePublication: Schema.Boolean,
    validation: StudioEntryValidation,
    entryIssues: Schema.Array(StudioPublicationEntryIssue).check(Schema.isMaxLength(50)),
  }),
) {}

export class StudioPublishResult extends Schema.Class<StudioPublishResult>("StudioPublishResult")(
  Schema.Struct({
    commandId: EntryCommandId,
    resultKind: Schema.Literals(["changed", "no_op"]),
    stateVersion: EntryPublicationStateVersion,
    publication: StudioPublicationSummary,
    delivery: EntryDeliveryReadBack,
  }),
) {}

export class StudioUnpublishResult extends Schema.Class<StudioUnpublishResult>(
  "StudioUnpublishResult",
)(
  Schema.Struct({
    commandId: EntryCommandId,
    resultKind: Schema.Literals(["changed", "no_op"]),
    stateVersion: EntryPublicationStateVersion,
    unpublishedPublicationId: Schema.NullOr(EntryPublicationId),
    unpublishedAt: IsoDateTime,
    delivery: EntryDeliveryReadBack,
  }),
) {}

export const StudioListRevisionsQuery = Schema.Struct({
  scope: EntryRevisionScope,
  cursor: Schema.NullOr(StudioContentCursor).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => null)),
  ),
  limit: StudioContentPageLimit.pipe(
    Schema.withDecodingDefaultType(
      Effect.sync(() => StudioContentPageLimit.make(studioContentLimits.pageLimitDefault)),
    ),
  ),
}).annotate({ identifier: "StudioListRevisionsQuery" });
export type StudioListRevisionsQuery = typeof StudioListRevisionsQuery.Type;

export const StudioListPublicationsQuery = Schema.Struct({
  cursor: Schema.NullOr(StudioContentCursor).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => null)),
  ),
  limit: StudioContentPageLimit.pipe(
    Schema.withDecodingDefaultType(
      Effect.sync(() => StudioContentPageLimit.make(studioContentLimits.pageLimitDefault)),
    ),
  ),
}).annotate({ identifier: "StudioListPublicationsQuery" });
export type StudioListPublicationsQuery = typeof StudioListPublicationsQuery.Type;

export class StudioRestoreRevisionRequest extends Schema.Class<StudioRestoreRevisionRequest>(
  "StudioRestoreRevisionRequest",
)(
  Schema.Struct({
    scope: EntryRevisionScope,
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    expectedVersion: EntryDraftVersion,
    commandId: EntryCommandId,
  }),
) {}

export type StudioValidatePublicationRequest = Readonly<Record<string, never>>;

function isEmptyStudioRequest(input: unknown): input is StudioValidatePublicationRequest {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length === 0
  );
}

export const StudioValidatePublicationRequest = Schema.declare<StudioValidatePublicationRequest>(
  isEmptyStudioRequest,
  {
    identifier: "StudioValidatePublicationRequest",
    jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  },
);

export class StudioPublishEntryRequest extends Schema.Class<StudioPublishEntryRequest>(
  "StudioPublishEntryRequest",
)(
  Schema.Struct({
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
  }),
) {}

export class StudioUnpublishEntryRequest extends Schema.Class<StudioUnpublishEntryRequest>(
  "StudioUnpublishEntryRequest",
)(
  Schema.Struct({
    commandId: EntryCommandId,
    expectedStateVersion: EntryPublicationStateVersion,
    expectedPublicationId: Schema.NullOr(EntryPublicationId),
  }),
) {}

const PresentationPosition = (maximum: number) =>
  Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum }));
const PresentationTitle = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100));
const PresentationDescription = Schema.NullOr(Schema.String.check(Schema.isMaxLength(500)));

export class StudioPresentationEnumOption extends Schema.Class<StudioPresentationEnumOption>(
  "StudioPresentationEnumOption",
)(
  Schema.Struct({
    optionId: EnumOptionId,
    label: PresentationTitle,
    position: PresentationPosition(99),
  }),
) {}

const studioPresentationFieldFields = {
  fieldId: CollectionFieldId,
  displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
  position: PresentationPosition(99),
  helpText: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  placeholder: Schema.NullOr(Schema.String.check(Schema.isMaxLength(200))),
  enumOptions: Schema.Array(StudioPresentationEnumOption).check(Schema.isMaxLength(100)),
};

export class StudioPresentationFieldEdit extends Schema.Class<StudioPresentationFieldEdit>(
  "StudioPresentationFieldEdit",
)(Schema.Struct(studioPresentationFieldFields)) {}

export class StudioPresentationField extends Schema.Class<StudioPresentationField>(
  "StudioPresentationField",
)(
  Schema.Struct({
    ...studioPresentationFieldFields,
    parentFieldId: Schema.NullOr(CollectionFieldId),
    kind: CollectionFieldKind,
  }),
) {}

export class StudioPresentationPlacement extends Schema.Class<StudioPresentationPlacement>(
  "StudioPresentationPlacement",
)(
  Schema.Struct({
    fieldId: CollectionFieldId,
    position: PresentationPosition(99),
    helpTextOverride: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  }),
) {}

export class StudioPresentationGroup extends Schema.Class<StudioPresentationGroup>(
  "StudioPresentationGroup",
)(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: PresentationTitle,
    description: PresentationDescription,
    position: PresentationPosition(19),
    columns: Schema.Literals([1, 2]),
    fields: Schema.Array(StudioPresentationPlacement).check(Schema.isMaxLength(100)),
  }),
) {}

export class StudioPresentationTab extends Schema.Class<StudioPresentationTab>(
  "StudioPresentationTab",
)(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: PresentationTitle,
    description: PresentationDescription,
    position: PresentationPosition(9),
    groups: Schema.Array(StudioPresentationGroup).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(20),
    ),
  }),
) {}

export class StudioPresentationLayout extends Schema.Class<StudioPresentationLayout>(
  "StudioPresentationLayout",
)(
  Schema.Struct({
    tabs: Schema.Array(StudioPresentationTab).check(Schema.isMinLength(1), Schema.isMaxLength(10)),
    sidebarGroups: Schema.Array(StudioPresentationGroup).check(Schema.isMaxLength(10)),
  }),
) {}

export class StudioPresentationEdit extends Schema.Class<StudioPresentationEdit>(
  "StudioPresentationEdit",
)(
  Schema.Struct({
    displayName: CollectionDisplayName,
    description: Schema.NullOr(CollectionDescription),
    fields: Schema.Array(StudioPresentationFieldEdit).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(100),
    ),
    layout: StudioPresentationLayout,
  }),
) {}

export class StudioPresentationDocument extends Schema.Class<StudioPresentationDocument>(
  "StudioPresentationDocument",
)(
  Schema.Struct({
    displayName: CollectionDisplayName,
    description: Schema.NullOr(CollectionDescription),
    fields: Schema.Array(StudioPresentationField).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(100),
    ),
    layout: StudioPresentationLayout,
  }),
) {}

export class StudioPresentation extends Schema.Class<StudioPresentation>("StudioPresentation")(
  Schema.Struct({
    collectionId: CollectionId,
    revisionId: SchemaRevisionId,
    sequence: SchemaRevisionSequence,
    presentation: StudioPresentationDocument,
  }),
) {}

export class StudioPublishPresentationRequest extends Schema.Class<StudioPublishPresentationRequest>(
  "StudioPublishPresentationRequest",
)(
  Schema.Struct({
    commandId: SchemaPublicationCommandId,
    expectedRevisionId: SchemaRevisionId,
    expectedSequence: SchemaRevisionSequence,
    presentation: StudioPresentationEdit,
  }),
) {}

export class StudioPublishPresentationResult extends Schema.Class<StudioPublishPresentationResult>(
  "StudioPublishPresentationResult",
)(
  Schema.Struct({
    replayed: Schema.Boolean,
    noOp: Schema.Boolean,
    presentation: StudioPresentation,
  }),
) {}

export class StudioCreateEntryRequest extends Schema.Class<StudioCreateEntryRequest>(
  "StudioCreateEntryRequest",
)(
  Schema.Struct({
    displayName: EntryDisplayName,
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    commandId: EntryCommandId,
    sharedMutations: EntryValueMutations,
    localizedMutations: EntryValueMutations,
  }),
) {}

export class StudioRenameEntryRequest extends Schema.Class<StudioRenameEntryRequest>(
  "StudioRenameEntryRequest",
)(
  Schema.Struct({
    displayName: EntryDisplayName,
    expectedNameVersion: EntryNameVersion,
  }),
) {}

export class StudioSaveEntryDraftRequest extends Schema.Class<StudioSaveEntryDraftRequest>(
  "StudioSaveEntryDraftRequest",
)(
  Schema.Struct({
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    commandId: EntryCommandId,
    expectedSharedVersion: EntryDraftVersion,
    expectedLocalizedVersion: EntryDraftVersion,
    sharedMutations: EntryValueMutations,
    localizedMutations: EntryValueMutations,
  }),
) {}

export class StudioCreateEntryResult extends Schema.Class<StudioCreateEntryResult>(
  "StudioCreateEntryResult",
)(
  Schema.Struct({
    entry: StudioEntrySummary,
    commandId: EntryCommandId,
    sharedVersion: EntryDraftVersion,
    sharedRevisionId: Schema.NullOr(EntryRevisionId),
    localizedVersion: EntryDraftVersion,
    localizedRevisionId: Schema.NullOr(EntryRevisionId),
    validation: StudioEntryValidation,
  }),
) {}

export class StudioMutationReceipt extends Schema.Class<StudioMutationReceipt>(
  "StudioMutationReceipt",
)(
  Schema.Struct({
    entryId: EntryId,
    commandId: EntryCommandId,
    sharedChanged: Schema.Boolean,
    sharedVersion: EntryDraftVersion,
    sharedRevisionId: Schema.NullOr(EntryRevisionId),
    localizedChanged: Schema.Boolean,
    localizedVersion: EntryDraftVersion,
    localizedRevisionId: Schema.NullOr(EntryRevisionId),
    validation: StudioEntryValidation,
  }),
) {}

export const StudioContentApiErrorCode = Schema.Literals([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "STUDIO_COLLECTION_CONFIGURATION_INVALID",
  "LOCALE_UNAVAILABLE",
  "CMS_CAPABILITY_REQUIRED",
  "STUDIO_REGISTRATION_INACTIVE",
  "STUDIO_AUTHORITY_CHANGED",
  "STUDIO_GRANT_INVALID",
  "STALE_SCHEMA",
  "DRAFT_VERSION_CONFLICT",
  "NAME_VERSION_CONFLICT",
  "COMMAND_CONFLICT",
  "REVISION_INCOMPATIBLE",
  "PUBLICATION_INVALID",
  "PUBLICATION_STATE_CONFLICT",
  "PRESENTATION_ROLE_VISIBILITY_FORBIDDEN",
  "PRESENTATION_SCOPE_RESTRICTED",
  "PUBLISHED_SCHEMA_REQUIRED",
  "PREVIEW_TARGET_REQUIRED",
  "PREVIEW_REVISION_INCOMPATIBLE",
  "INVALID_CURSOR",
  "STALE_CURSOR",
  "REQUEST_TOO_LARGE",
  "STUDIO_RESPONSE_TOO_LARGE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type StudioContentApiErrorCode = typeof StudioContentApiErrorCode.Type;

const StudioContentApiErrorDetail = ApiErrorDetail;

export class StudioContentApiError extends Schema.Class<StudioContentApiError>(
  "StudioContentApiError",
)(
  Schema.Struct({
    code: StudioContentApiErrorCode,
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
    details: Schema.optionalKey(
      Schema.Array(StudioContentApiErrorDetail).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(studioContentLimits.maximumErrorDetails),
      ),
    ),
    configurationReason: Schema.optionalKey(StudioCollectionConfigurationReason),
    retryable: Schema.Boolean,
    requestId: RequestIdSchema,
  }),
) {}

export class StudioContentApiFailure extends Schema.Class<StudioContentApiFailure>(
  "StudioContentApiFailure",
)(
  Schema.Struct({
    ok: Schema.Literal(false),
    data: Schema.Null,
    error: StudioContentApiError,
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  }),
) {}

function studioContentSuccessSchema<A extends ApiData, I>(data: Schema.Codec<A, I, never>) {
  return ApiSuccessSchema(data);
}

export const StudioContentContextResponse = studioContentSuccessSchema(StudioContentContext);
export const StudioEntryPageResponse = studioContentSuccessSchema(StudioEntryPage);
export const StudioResolveEntriesResponse = studioContentSuccessSchema(StudioResolvedEntryLabels);
export const StudioNewEntryWorkspaceResponse = studioContentSuccessSchema(StudioNewEntryWorkspace);
export const StudioEntryWorkspaceResponse = studioContentSuccessSchema(StudioEntryWorkspace);
export const StudioCreateEntryResponse = studioContentSuccessSchema(StudioCreateEntryResult);
export const StudioRenameEntryResponse = studioContentSuccessSchema(StudioEntrySummary);
export const StudioSaveEntryDraftResponse = studioContentSuccessSchema(StudioMutationReceipt);
export const StudioRevisionPageResponse = studioContentSuccessSchema(StudioRevisionPage);
export const StudioRevisionResponse = studioContentSuccessSchema(StudioRevision);
export const StudioRevisionComparisonResponse =
  studioContentSuccessSchema(StudioRevisionComparison);
export const StudioRestoreRevisionResponse = studioContentSuccessSchema(StudioMutationReceipt);
export const StudioPublicationStatusResponse = studioContentSuccessSchema(StudioPublicationStatus);
export const StudioPublicationPageResponse = studioContentSuccessSchema(StudioPublicationPage);
export const StudioPublicationPlanResponse = studioContentSuccessSchema(StudioPublicationPlan);
export const StudioPublishResponse = studioContentSuccessSchema(StudioPublishResult);
export const StudioUnpublishResponse = studioContentSuccessSchema(StudioUnpublishResult);
export const StudioPresentationResponse = studioContentSuccessSchema(StudioPresentation);
export const StudioPublishPresentationResponse = studioContentSuccessSchema(
  StudioPublishPresentationResult,
);

// Retained only for adapters that accept the shared cursor contract at an internal boundary.
export const StudioSharedCursor = Cursor;
