// Defines the bounded, stable-ID Studio Content v1 navigation and entry-list contracts.

import { Schema } from "effect";

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
  maximumCount: 1_000,
  mutationValueDepth: 24,
  mutationValueNodes: 10_000,
} as const;

export class StudioContentScope extends Schema.Class<StudioContentScope>("StudioContentScope")(
  Schema.Struct({
    projectId: ProjectId,
    environmentId: EnvironmentId,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioCollectionLocaleScope extends Schema.Class<StudioCollectionLocaleScope>(
  "StudioCollectionLocaleScope",
)(
  Schema.Struct({
    projectId: ProjectId,
    environmentId: EnvironmentId,
    collectionId: CollectionId,
    locale: LocaleTag,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const StudioContentPageLimit = Schema.Number.pipe(
  Schema.int(),
  Schema.between(studioContentLimits.pageLimitMinimum, studioContentLimits.pageLimitMaximum),
  Schema.brand("StudioContentPageLimit"),
);
export type StudioContentPageLimit = typeof StudioContentPageLimit.Type;

export const StudioContentCursor = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(1_024),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
  Schema.brand("StudioContentCursor"),
);
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
  Schema.transform(Schema.String, {
    decode: (value) => value.trim().normalize("NFC"),
    encode: (value) => value,
  }),
  Schema.minLength(studioContentLimits.minimumSearchCharacters),
  Schema.maxLength(studioContentLimits.maximumSearchCharacters),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Studio entry search text cannot contain control characters.",
  }),
  Schema.brand("StudioContentSearchText"),
);
export type StudioContentSearchText = typeof StudioContentSearchText.Type;

export class StudioContentLocale extends Schema.Class<StudioContentLocale>("StudioContentLocale")(
  Schema.Struct({
    id: ProjectLocaleId,
    tag: LocaleTag,
    displayName: LocaleDisplayName,
    canRead: Schema.Literal(true),
    canWrite: Schema.Boolean,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioContentCollectionCapabilities extends Schema.Class<StudioContentCollectionCapabilities>(
  "StudioContentCollectionCapabilities",
)(
  Schema.Struct({
    canCreate: Schema.Boolean,
    canRename: Schema.Boolean,
    canSaveLocalized: Schema.Boolean,
    canSaveShared: Schema.Boolean,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioContentCollection extends Schema.Class<StudioContentCollection>(
  "StudioContentCollection",
)(
  Schema.Struct({
    id: CollectionId,
    displayName: CollectionDisplayName,
    capabilities: StudioContentCollectionCapabilities,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const StudioCollectionConfigurationReason = Schema.Literal(
  "empty_schema",
  "projection_invalid",
);
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
  details: Schema.Array(ApiErrorDetail).pipe(Schema.minItems(1), Schema.maxItems(2)),
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioContentContext extends Schema.Class<StudioContentContext>(
  "StudioContentContext",
)(
  Schema.Struct({
    locales: Schema.Array(StudioContentLocale).pipe(
      Schema.maxItems(studioContentLimits.maximumLocales),
    ),
    collections: Schema.Array(StudioContentCollection).pipe(
      Schema.maxItems(studioContentLimits.maximumCollections),
    ),
    configurationNotices: Schema.Array(StudioCollectionConfigurationNotice).pipe(
      Schema.maxItems(studioContentLimits.maximumConfigurationNotices),
    ),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioEntrySummary extends Schema.Class<StudioEntrySummary>("StudioEntrySummary")(
  Schema.Struct({
    id: EntryId,
    displayName: EntryDisplayName,
    nameVersion: EntryNameVersion,
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const StudioBoundedMatchCount = Schema.Union(
  Schema.Struct({
    value: Schema.Number.pipe(Schema.int(), Schema.between(0, studioContentLimits.maximumCount)),
    relation: Schema.Literal("exact"),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
  Schema.Struct({
    value: Schema.Literal(studioContentLimits.maximumCount),
    relation: Schema.Literal("at_least"),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
);
export type StudioBoundedMatchCount = typeof StudioBoundedMatchCount.Type;

export class StudioEntryPage extends Schema.Class<StudioEntryPage>("StudioEntryPage")(
  Schema.Struct({
    items: Schema.Array(StudioEntrySummary).pipe(
      Schema.maxItems(studioContentLimits.pageLimitMaximum),
    ),
    hasMore: Schema.Boolean,
    nextCursor: Schema.NullOr(StudioContentCursor),
    count: StudioBoundedMatchCount,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const StudioListEntriesQuery = Schema.Struct({
  cursor: Schema.optionalWith(Schema.NullOr(StudioContentCursor), {
    default: () => null,
  }),
  limit: Schema.optionalWith(StudioContentPageLimit, {
    default: () => StudioContentPageLimit.make(studioContentLimits.pageLimitDefault),
  }),
}).annotations({
  identifier: "StudioListEntriesQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type StudioListEntriesQuery = typeof StudioListEntriesQuery.Type;

export const StudioSearchEntriesRequest = Schema.Struct({
  query: StudioContentSearchText,
  cursor: Schema.optionalWith(Schema.NullOr(StudioContentCursor), {
    default: () => null,
  }),
  limit: Schema.optionalWith(StudioContentPageLimit, {
    default: () => StudioContentPageLimit.make(studioContentLimits.pageLimitDefault),
  }),
}).annotations({
  identifier: "StudioSearchEntriesRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type StudioSearchEntriesRequest = typeof StudioSearchEntriesRequest.Type;

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
  readonly [Kind in typeof CollectionFieldKind.Type]: Schema.Schema.Encoded<
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
>(kind: Kind, configuration: Schema.Schema<FieldConfigurationByKind[Kind], Encoded, Requirements>) {
  return Schema.Struct({
    id: CollectionFieldId,
    parentFieldId: Schema.NullOr(CollectionFieldId),
    nodeRole: FieldNodeRole,
    displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
    kind: Schema.Literal(kind),
    required: Schema.NullOr(Schema.Boolean),
    localization: Schema.NullOr(CollectionFieldLocalization),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
    helpText: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    placeholder: Schema.NullOr(Schema.String.pipe(Schema.maxLength(200))),
    configuration,
    children: Schema.Array(
      Schema.suspend((): Schema.Schema<StudioFormField, StudioFormFieldEncoded> => StudioFormField),
    ).pipe(Schema.maxItems(100)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } });
}

export const StudioFormField: Schema.Schema<StudioFormField, StudioFormFieldEncoded> = Schema.Union(
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
).annotations({ identifier: "StudioFormField" });

export class StudioFormPlacement extends Schema.Class<StudioFormPlacement>("StudioFormPlacement")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    fieldId: CollectionFieldId,
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
    helpTextOverride: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioFormGroup extends Schema.Class<StudioFormGroup>("StudioFormGroup")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
    description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 19)),
    columns: Schema.Literal(1, 2),
    fields: Schema.Array(StudioFormPlacement).pipe(Schema.maxItems(100)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioFormTab extends Schema.Class<StudioFormTab>("StudioFormTab")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
    description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 9)),
    groups: Schema.Array(StudioFormGroup).pipe(Schema.minItems(1), Schema.maxItems(20)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioFormProjection extends Schema.Class<StudioFormProjection>(
  "StudioFormProjection",
)(
  Schema.Struct({
    collectionId: CollectionId,
    schemaRevisionId: SchemaRevisionId,
    contractHash: ContractHash,
    canEdit: Schema.Boolean,
    fields: Schema.Array(StudioFormField).pipe(Schema.maxItems(100)),
    editableFieldIds: Schema.Array(CollectionFieldId).pipe(Schema.maxItems(100)),
    tabs: Schema.Array(StudioFormTab).pipe(Schema.maxItems(10)),
    sidebarGroups: Schema.Array(StudioFormGroup).pipe(Schema.maxItems(10)),
    currencyMinorUnits: Schema.Record({
      key: Schema.String.pipe(Schema.length(3)),
      value: Schema.Number.pipe(Schema.int(), Schema.between(0, 3)),
    }),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const StudioValidationStatus = Schema.Literal("valid", "invalid", "restricted_issues");
export type StudioValidationStatus = typeof StudioValidationStatus.Type;

const StudioEntryValidationIssue = EntryValidationIssue.annotations({
  parseOptions: { onExcessProperty: "error" },
});

export class StudioEntryValidation extends Schema.Class<StudioEntryValidation>(
  "StudioEntryValidation",
)(
  Schema.Struct({
    status: StudioValidationStatus,
    issues: Schema.Array(StudioEntryValidationIssue).pipe(Schema.maxItems(50)),
    capped: Schema.Boolean,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioNewEntryWorkspace extends Schema.Class<StudioNewEntryWorkspace>(
  "StudioNewEntryWorkspace",
)(
  Schema.Struct({
    localeId: ProjectLocaleId,
    locale: LocaleTag,
    form: StudioFormProjection,
    capabilities: StudioContentCollectionCapabilities,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioRenameEntryRequest extends Schema.Class<StudioRenameEntryRequest>(
  "StudioRenameEntryRequest",
)(
  Schema.Struct({
    displayName: EntryDisplayName,
    expectedNameVersion: EntryNameVersion,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const StudioContentApiErrorCode = Schema.Literal(
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
);
export type StudioContentApiErrorCode = typeof StudioContentApiErrorCode.Type;

const StudioContentApiErrorDetail = ApiErrorDetail.annotations({
  parseOptions: { onExcessProperty: "error" },
});

export class StudioContentApiError extends Schema.Class<StudioContentApiError>(
  "StudioContentApiError",
)(
  Schema.Struct({
    code: StudioContentApiErrorCode,
    message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
    details: Schema.optionalWith(
      Schema.Array(StudioContentApiErrorDetail).pipe(
        Schema.minItems(1),
        Schema.maxItems(studioContentLimits.maximumErrorDetails),
      ),
      { exact: true },
    ),
    configurationReason: Schema.optionalWith(StudioCollectionConfigurationReason, { exact: true }),
    retryable: Schema.Boolean,
    requestId: RequestIdSchema,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class StudioContentApiFailure extends Schema.Class<StudioContentApiFailure>(
  "StudioContentApiFailure",
)(
  Schema.Struct({
    ok: Schema.Literal(false),
    data: Schema.Null,
    error: StudioContentApiError,
    message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

function studioContentSuccessSchema<A extends ApiData, I>(data: Schema.Schema<A, I, never>) {
  return ApiSuccessSchema(data).annotations({ parseOptions: { onExcessProperty: "error" } });
}

export const StudioContentContextResponse = studioContentSuccessSchema(StudioContentContext);
export const StudioEntryPageResponse = studioContentSuccessSchema(StudioEntryPage);
export const StudioNewEntryWorkspaceResponse = studioContentSuccessSchema(StudioNewEntryWorkspace);
export const StudioEntryWorkspaceResponse = studioContentSuccessSchema(StudioEntryWorkspace);
export const StudioCreateEntryResponse = studioContentSuccessSchema(StudioCreateEntryResult);
export const StudioRenameEntryResponse = studioContentSuccessSchema(StudioEntrySummary);
export const StudioSaveEntryDraftResponse = studioContentSuccessSchema(StudioMutationReceipt);

// Retained only for adapters that accept the shared cursor contract at an internal boundary.
export const StudioSharedCursor = Cursor;
