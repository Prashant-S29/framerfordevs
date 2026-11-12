// Defines the bounded, stable-ID Studio Content v1 navigation and entry-list contracts.

import { Schema, SchemaTransformation, Effect } from "effect";

import {
  EntryCommandId,
  EntryDisplayName,
  EntryDraftVersion,
  EntryId,
  EntryNameVersion,
  EntryRevisionId,
  EntryValidationIssue,
  EntryValueMutations,
  EntryValues,
} from "../entry";
import {
  EditorLayoutNodeId,
  type FieldConfigurationByKind,
  FieldNodeRole,
  fieldConfigurationSchemas,
} from "../field";
import { LocaleDisplayName, LocaleTag, ProjectLocaleId } from "../locale";
import { Cursor, EnvironmentId, IsoDateTime, ProjectId } from "../platform";
import { ApiErrorDetail, type ApiData, ApiSuccessSchema, RequestIdSchema } from "../response/api";
import {
  CollectionDisplayName,
  CollectionFieldDisplayLabel,
  CollectionFieldId,
  CollectionFieldKind,
  CollectionFieldLocalization,
  CollectionId,
  ContractHash,
  SchemaRevisionId,
} from "../schema";

export const studioContentLimits = {
  requestBytes: 1_048_576,
  responseBytes: 4_194_304,
  searchRequestBytes: 2_048,
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
  }).annotate({ closedObject: true }),
) {}

export class StudioCollectionLocaleScope extends Schema.Class<StudioCollectionLocaleScope>(
  "StudioCollectionLocaleScope",
)(
  Schema.Struct({
    projectId: ProjectId,
    environmentId: EnvironmentId,
    collectionId: CollectionId,
    locale: LocaleTag,
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
) {}

export class StudioContentCollectionCapabilities extends Schema.Class<StudioContentCollectionCapabilities>(
  "StudioContentCollectionCapabilities",
)(
  Schema.Struct({
    canCreate: Schema.Boolean,
    canRename: Schema.Boolean,
    canSaveLocalized: Schema.Boolean,
    canSaveShared: Schema.Boolean,
  }).annotate({ closedObject: true }),
) {}

export class StudioContentCollection extends Schema.Class<StudioContentCollection>(
  "StudioContentCollection",
)(
  Schema.Struct({
    id: CollectionId,
    displayName: CollectionDisplayName,
    capabilities: StudioContentCollectionCapabilities,
  }).annotate({ closedObject: true }),
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

export class StudioCollectionConfigurationNotice extends Schema.Class<StudioCollectionConfigurationNotice>(
  "StudioCollectionConfigurationNotice",
)(
  Schema.Struct({
    collectionId: CollectionId,
    displayName: CollectionDisplayName,
    reason: StudioCollectionConfigurationReason,
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
) {}

export class StudioEntrySummary extends Schema.Class<StudioEntrySummary>("StudioEntrySummary")(
  Schema.Struct({
    id: EntryId,
    displayName: EntryDisplayName,
    nameVersion: EntryNameVersion,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  }).annotate({ closedObject: true }),
) {}

export const StudioBoundedMatchCount = Schema.Union([
  Schema.Struct({
    value: Schema.Number.check(
      Schema.isInt(),
      Schema.isBetween({ minimum: 0, maximum: studioContentLimits.maximumCount }),
    ),
    relation: Schema.Literal("exact"),
  }).annotate({ closedObject: true }),
  Schema.Struct({
    value: Schema.Literal(studioContentLimits.maximumCount),
    relation: Schema.Literal("at_least"),
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
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
}).annotate({
  identifier: "StudioListEntriesQuery",
  closedObject: true,
});
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
}).annotate({
  identifier: "StudioSearchEntriesRequest",
  closedObject: true,
});
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
  }).annotate({ closedObject: true }),
) {}

export class StudioResolvedEntryLabel extends Schema.Class<StudioResolvedEntryLabel>(
  "StudioResolvedEntryLabel",
)(
  Schema.Struct({
    id: EntryId,
    displayName: EntryDisplayName,
  }).annotate({ closedObject: true }),
) {}

export class StudioResolvedEntryLabels extends Schema.Class<StudioResolvedEntryLabels>(
  "StudioResolvedEntryLabels",
)(
  Schema.Struct({
    items: Schema.Array(StudioResolvedEntryLabel).check(
      Schema.isMaxLength(studioContentLimits.maximumResolvedEntries),
    ),
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true });
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
  }).annotate({ closedObject: true }),
) {}

export class StudioFormGroup extends Schema.Class<StudioFormGroup>("StudioFormGroup")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 19 })),
    columns: Schema.Literals([1, 2]),
    fields: Schema.Array(StudioFormPlacement).check(Schema.isMaxLength(100)),
  }).annotate({ closedObject: true }),
) {}

export class StudioFormTab extends Schema.Class<StudioFormTab>("StudioFormTab")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 9 })),
    groups: Schema.Array(StudioFormGroup).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
) {}

export const StudioValidationStatus = Schema.Literals(["valid", "invalid", "restricted_issues"]);
export type StudioValidationStatus = typeof StudioValidationStatus.Type;

const StudioEntryValidationIssue = EntryValidationIssue.annotate({
  closedObject: true,
});

export class StudioEntryValidation extends Schema.Class<StudioEntryValidation>(
  "StudioEntryValidation",
)(
  Schema.Struct({
    status: StudioValidationStatus,
    issues: Schema.Array(StudioEntryValidationIssue).check(Schema.isMaxLength(50)),
    capped: Schema.Boolean,
  }).annotate({ closedObject: true }),
) {}

export class StudioNewEntryWorkspace extends Schema.Class<StudioNewEntryWorkspace>(
  "StudioNewEntryWorkspace",
)(
  Schema.Struct({
    localeId: ProjectLocaleId,
    locale: LocaleTag,
    form: StudioFormProjection,
    capabilities: StudioContentCollectionCapabilities,
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
) {}

export class StudioRenameEntryRequest extends Schema.Class<StudioRenameEntryRequest>(
  "StudioRenameEntryRequest",
)(
  Schema.Struct({
    displayName: EntryDisplayName,
    expectedNameVersion: EntryNameVersion,
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
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
  }).annotate({ closedObject: true }),
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
  "INVALID_CURSOR",
  "STALE_CURSOR",
  "REQUEST_TOO_LARGE",
  "STUDIO_RESPONSE_TOO_LARGE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type StudioContentApiErrorCode = typeof StudioContentApiErrorCode.Type;

const StudioContentApiErrorDetail = ApiErrorDetail.annotate({
  closedObject: true,
});

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
  }).annotate({ closedObject: true }),
) {}

export class StudioContentApiFailure extends Schema.Class<StudioContentApiFailure>(
  "StudioContentApiFailure",
)(
  Schema.Struct({
    ok: Schema.Literal(false),
    data: Schema.Null,
    error: StudioContentApiError,
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  }).annotate({ closedObject: true }),
) {}

function studioContentSuccessSchema<A extends ApiData, I>(data: Schema.Codec<A, I, never>) {
  return ApiSuccessSchema(data).annotate({ closedObject: true });
}

export const StudioContentContextResponse = studioContentSuccessSchema(StudioContentContext);
export const StudioEntryPageResponse = studioContentSuccessSchema(StudioEntryPage);
export const StudioResolveEntriesResponse = studioContentSuccessSchema(StudioResolvedEntryLabels);
export const StudioNewEntryWorkspaceResponse = studioContentSuccessSchema(StudioNewEntryWorkspace);
export const StudioEntryWorkspaceResponse = studioContentSuccessSchema(StudioEntryWorkspace);
export const StudioCreateEntryResponse = studioContentSuccessSchema(StudioCreateEntryResult);
export const StudioRenameEntryResponse = studioContentSuccessSchema(StudioEntrySummary);
export const StudioSaveEntryDraftResponse = studioContentSuccessSchema(StudioMutationReceipt);

// Retained only for adapters that accept the shared cursor contract at an internal boundary.
export const StudioSharedCursor = Cursor;
