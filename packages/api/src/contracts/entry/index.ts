// Defines M7 named entry identities, bounded draft mutations, validation feedback, revisions, and API envelopes.

import { Schema, SchemaTransformation } from "effect";

import { ApiCredentialId } from "../access";
import { ApiSuccessSchema } from "../response/api";
import { LocaleTag, ProjectLocaleId } from "../locale";
import {
  AuthUserId,
  Cursor,
  EnvironmentId,
  IsoDateTime,
  PageLimit,
  ProjectId,
  WorkspaceId,
} from "../platform";
import { CollectionFieldId, CollectionId, ContractHash, SchemaRevisionId } from "../schema";

import * as SchemaStrict from "../../lib/schema-strict";
import { UuidValue } from "../uuid";
export const EntryId = UuidValue.pipe(Schema.brand("EntryId"));
export type EntryId = typeof EntryId.Type;

export const EntryRevisionId = UuidValue.pipe(Schema.brand("EntryRevisionId"));
export type EntryRevisionId = typeof EntryRevisionId.Type;

export const EntryCommandId = UuidValue.pipe(Schema.brand("EntryCommandId"));
export type EntryCommandId = typeof EntryCommandId.Type;

/** Detects database-forbidden C0/C1 control characters in management names. */
function hasEntryNameControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)))
      return true;
  }
  return false;
}

export const EntryDisplayName = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => value.trim().normalize("NFC"),
      encode: (value) => value,
    }),
  ),
)
  .check(
    Schema.isMinLength(1),
    Schema.isMaxLength(100),
    Schema.makeFilter((value) => !hasEntryNameControlCharacter(value), {
      message: "Entry names cannot contain control characters.",
    }),
  )
  .pipe(Schema.brand("EntryDisplayName"));
export type EntryDisplayName = typeof EntryDisplayName.Type;

export const EntryNameVersion = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
).pipe(Schema.brand("EntryNameVersion"));
export type EntryNameVersion = typeof EntryNameVersion.Type;

export const EntryDraftVersion = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
).pipe(Schema.brand("EntryDraftVersion"));
export type EntryDraftVersion = typeof EntryDraftVersion.Type;

export const EntryRevisionSequence = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
).pipe(Schema.brand("EntryRevisionSequence"));
export type EntryRevisionSequence = typeof EntryRevisionSequence.Type;

export const EntryRevisionScope = Schema.Literals(["shared", "localized"]);
export type EntryRevisionScope = typeof EntryRevisionScope.Type;

export const EntryValues = Schema.Record(CollectionFieldId, Schema.Unknown);
export type EntryValues = typeof EntryValues.Type;

const EntryListIndex = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 100 }),
);
export const EntryValuePathSegment = Schema.Union([CollectionFieldId, EntryListIndex]);
export type EntryValuePathSegment = typeof EntryValuePathSegment.Type;

export const EntryValuePath = Schema.Array(EntryValuePathSegment).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16),
);
export type EntryValuePath = typeof EntryValuePath.Type;

export class SetEntryValueMutation extends Schema.Class<SetEntryValueMutation>(
  "SetEntryValueMutation",
)({
  operation: Schema.Literal("set"),
  path: EntryValuePath,
  value: Schema.Unknown,
}) {}

export class UnsetEntryValueMutation extends Schema.Class<UnsetEntryValueMutation>(
  "UnsetEntryValueMutation",
)({
  operation: Schema.Literal("unset"),
  path: EntryValuePath,
}) {}

export class InsertEntryListItemMutation extends Schema.Class<InsertEntryListItemMutation>(
  "InsertEntryListItemMutation",
)({
  operation: Schema.Literal("list_insert"),
  path: EntryValuePath,
  index: EntryListIndex,
  value: Schema.Unknown,
}) {}

export class RemoveEntryListItemMutation extends Schema.Class<RemoveEntryListItemMutation>(
  "RemoveEntryListItemMutation",
)({
  operation: Schema.Literal("list_remove"),
  path: EntryValuePath,
  index: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
}) {}

export const EntryValueMutation = Schema.Union([
  SetEntryValueMutation,
  UnsetEntryValueMutation,
  InsertEntryListItemMutation,
  RemoveEntryListItemMutation,
]);
export type EntryValueMutation = typeof EntryValueMutation.Type;

export const EntryValueMutations = Schema.Array(EntryValueMutation).check(Schema.isMaxLength(500));
export type EntryValueMutations = typeof EntryValueMutations.Type;

export const EntryValidationIssueCode = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z][a-z0-9_]{0,63}$/u),
);

export class EntryValidationIssue extends Schema.Class<EntryValidationIssue>(
  "EntryValidationIssue",
)({
  fieldId: CollectionFieldId,
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  scope: EntryRevisionScope,
  localeId: Schema.NullOr(ProjectLocaleId),
  locale: Schema.NullOr(LocaleTag),
  code: EntryValidationIssueCode,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export class EntryValidation extends Schema.Class<EntryValidation>("EntryValidation")({
  valid: Schema.Boolean,
  issues: Schema.Array(EntryValidationIssue).check(Schema.isMaxLength(50)),
  capped: Schema.Boolean,
}) {}

export class CmsEntry extends Schema.Class<CmsEntry>("CmsEntry")({
  id: EntryId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  displayName: Schema.NullOr(EntryDisplayName),
  nameVersion: EntryNameVersion,
  createdByUserId: Schema.NullOr(AuthUserId),
  createdByCredentialId: Schema.NullOr(ApiCredentialId),
  changedByUserId: Schema.NullOr(AuthUserId),
  changedByCredentialId: Schema.NullOr(ApiCredentialId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class CmsEntryListItem extends Schema.Class<CmsEntryListItem>("CmsEntryListItem")({
  entry: CmsEntry,
  displayName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
}) {}

export class CmsEntryPage extends Schema.Class<CmsEntryPage>("CmsEntryPage")({
  items: Schema.Array(CmsEntryListItem).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class CmsEntryDraft extends Schema.Class<CmsEntryDraft>("CmsEntryDraft")({
  entry: CmsEntry,
  localeId: ProjectLocaleId,
  locale: LocaleTag,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  sharedVersion: EntryDraftVersion,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  sharedValues: EntryValues,
  localizedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedValues: EntryValues,
  canEditShared: Schema.Boolean,
  validation: EntryValidation,
}) {}

export class SaveEntryDraftResult extends Schema.Class<SaveEntryDraftResult>(
  "SaveEntryDraftResult",
)({
  entryId: EntryId,
  commandId: EntryCommandId,
  sharedChanged: Schema.Boolean,
  sharedVersion: EntryDraftVersion,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedChanged: Schema.Boolean,
  localizedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  validation: EntryValidation,
}) {}

export const ChangedEntryFieldIds = Schema.Array(CollectionFieldId).check(
  Schema.isMaxLength(100),
  Schema.makeFilter((fieldIds) => new Set(fieldIds).size === fieldIds.length, {
    message: "Changed entry field IDs must be unique.",
  }),
);

export class EntryRevisionSummary extends Schema.Class<EntryRevisionSummary>(
  "EntryRevisionSummary",
)({
  id: EntryRevisionId,
  entryId: EntryId,
  localeId: Schema.NullOr(ProjectLocaleId),
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
}) {}

export class EntryRevisionPage extends Schema.Class<EntryRevisionPage>("EntryRevisionPage")({
  items: Schema.Array(EntryRevisionSummary).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

const EntryScopeInputFields = {
  projectId: ProjectId,
  environmentId: EnvironmentId,
  collectionId: CollectionId,
  locale: LocaleTag,
};

export class ListEntriesInput extends Schema.Class<ListEntriesInput>("ListEntriesInput")({
  ...EntryScopeInputFields,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class CreateEntryInput extends Schema.Class<CreateEntryInput>("CreateEntryInput")({
  ...EntryScopeInputFields,
  displayName: EntryDisplayName,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  commandId: EntryCommandId,
}) {}

export class CreateEntryWithDraftInput extends Schema.Class<CreateEntryWithDraftInput>(
  "CreateEntryWithDraftInput",
)({
  ...EntryScopeInputFields,
  displayName: EntryDisplayName,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  commandId: EntryCommandId,
  sharedMutations: EntryValueMutations,
  localizedMutations: EntryValueMutations,
}) {}

export class CreateEntryWithDraftResult extends Schema.Class<CreateEntryWithDraftResult>(
  "CreateEntryWithDraftResult",
)({
  entry: CmsEntry,
  commandId: EntryCommandId,
  sharedVersion: EntryDraftVersion,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  validation: EntryValidation,
}) {}

export class RenameEntryInput extends Schema.Class<RenameEntryInput>("RenameEntryInput")({
  ...EntryScopeInputFields,
  entryId: EntryId,
  displayName: EntryDisplayName,
  expectedNameVersion: EntryNameVersion,
}) {}

export class GetEntryDraftInput extends Schema.Class<GetEntryDraftInput>("GetEntryDraftInput")({
  ...EntryScopeInputFields,
  entryId: EntryId,
}) {}

export class SaveEntryDraftInput extends Schema.Class<SaveEntryDraftInput>("SaveEntryDraftInput")({
  ...EntryScopeInputFields,
  entryId: EntryId,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  commandId: EntryCommandId,
  expectedSharedVersion: EntryDraftVersion,
  expectedLocalizedVersion: EntryDraftVersion,
  sharedMutations: EntryValueMutations,
  localizedMutations: EntryValueMutations,
}) {}

export class ListEntryRevisionsInput extends Schema.Class<ListEntryRevisionsInput>(
  "ListEntryRevisionsInput",
)({
  ...EntryScopeInputFields,
  entryId: EntryId,
  scope: EntryRevisionScope,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class RestoreEntryRevisionInput extends Schema.Class<RestoreEntryRevisionInput>(
  "RestoreEntryRevisionInput",
)({
  ...EntryScopeInputFields,
  entryId: EntryId,
  scope: EntryRevisionScope,
  revisionId: EntryRevisionId,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  expectedVersion: EntryDraftVersion,
  commandId: EntryCommandId,
}) {}

export const ListEntriesInputSchema = SchemaStrict.toStandardSchemaV1(ListEntriesInput);
export const CreateEntryInputSchema = SchemaStrict.toStandardSchemaV1(CreateEntryInput);
export const RenameEntryInputSchema = SchemaStrict.toStandardSchemaV1(RenameEntryInput);
export const GetEntryDraftInputSchema = SchemaStrict.toStandardSchemaV1(GetEntryDraftInput);
export const SaveEntryDraftInputSchema = SchemaStrict.toStandardSchemaV1(SaveEntryDraftInput);
export const ListEntryRevisionsInputSchema =
  SchemaStrict.toStandardSchemaV1(ListEntryRevisionsInput);
export const RestoreEntryRevisionInputSchema =
  SchemaStrict.toStandardSchemaV1(RestoreEntryRevisionInput);

export const CmsEntryOutputSchema = SchemaStrict.toStandardSchemaV1(ApiSuccessSchema(CmsEntry));
export const CmsEntryPageOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(CmsEntryPage),
);
export const CmsEntryDraftOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(CmsEntryDraft),
);
export const SaveEntryDraftResultOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(SaveEntryDraftResult),
);
export const EntryRevisionPageOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(EntryRevisionPage),
);
