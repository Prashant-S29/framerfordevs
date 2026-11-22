import { Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import { AuthoringJsonValue, AuthoringValueMutation, AuthoringValueMutations } from "..";
import { ApiCredentialId } from "../../access";
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
  entryRevisionComparisonLimits,
} from "../../entry";
import { LocaleTag } from "../../locale";
import { AuthUserId, Cursor, IsoDateTime, PageLimit } from "../../platform";
import {
  CollectionApiKey,
  CollectionFieldId,
  ContractHash,
  GeneratedFormDefinition,
  SchemaRevisionId,
} from "../../schema";

export class AuthoringEntryScope extends Schema.Class<AuthoringEntryScope>("AuthoringEntryScope")({
  collectionKey: CollectionApiKey,
  locale: LocaleTag,
}) {}

export class AuthoringEntrySummary extends Schema.Class<AuthoringEntrySummary>(
  "AuthoringEntrySummary",
)({
  id: EntryId,
  displayName: EntryDisplayName,
  nameVersion: EntryNameVersion,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class AuthoringEntryPage extends Schema.Class<AuthoringEntryPage>("AuthoringEntryPage")({
  items: Schema.Array(AuthoringEntrySummary).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

const AuthoringValueKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9_]{0,62}$/u),
);

export const AuthoringEntryValues = Schema.Record(AuthoringValueKey, AuthoringJsonValue);
export type AuthoringEntryValues = typeof AuthoringEntryValues.Type;

export class AuthoringEntryValidationIssue extends Schema.Class<AuthoringEntryValidationIssue>(
  "AuthoringEntryValidationIssue",
)({
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  scope: Schema.Literals(["shared", "localized"]),
  locale: Schema.NullOr(LocaleTag),
  code: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
    Schema.isPattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export class AuthoringEntryValidation extends Schema.Class<AuthoringEntryValidation>(
  "AuthoringEntryValidation",
)({
  valid: Schema.Boolean,
  issues: Schema.Array(AuthoringEntryValidationIssue).check(Schema.isMaxLength(50)),
  capped: Schema.Boolean,
}) {}

export class AuthoringGeneratedForm extends Schema.Class<AuthoringGeneratedForm>(
  "AuthoringGeneratedForm",
)({
  ...GeneratedFormDefinition.fields,
  source: Schema.Literal("published"),
  revisionId: SchemaRevisionId,
}) {}

export class AuthoringEntryDraft extends Schema.Class<AuthoringEntryDraft>("AuthoringEntryDraft")({
  entry: AuthoringEntrySummary,
  locale: LocaleTag,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  sharedVersion: EntryDraftVersion,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  sharedValues: AuthoringEntryValues,
  localizedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedValues: AuthoringEntryValues,
  canEditShared: Schema.Boolean,
  validation: AuthoringEntryValidation,
}) {}

export const AuthoringListEntriesQuery = Schema.Struct({
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}).annotate({ identifier: "AuthoringListEntriesQuery" });
export type AuthoringListEntriesQuery = typeof AuthoringListEntriesQuery.Type;

export const AuthoringCreateEntryRequest = Schema.Struct({
  displayName: EntryDisplayName,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  commandId: EntryCommandId,
  mutations: Schema.Array(AuthoringValueMutation).check(Schema.isMaxLength(500)),
}).annotate({ identifier: "AuthoringCreateEntryRequest" });
export type AuthoringCreateEntryRequest = typeof AuthoringCreateEntryRequest.Type;

export const AuthoringRenameEntryRequest = Schema.Struct({
  displayName: EntryDisplayName,
  expectedNameVersion: EntryNameVersion,
}).annotate({ identifier: "AuthoringRenameEntryRequest" });
export type AuthoringRenameEntryRequest = typeof AuthoringRenameEntryRequest.Type;

export const AuthoringSaveEntryDraftRequest = Schema.Struct({
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  commandId: EntryCommandId,
  expectedSharedVersion: EntryDraftVersion,
  expectedLocalizedVersion: EntryDraftVersion,
  mutations: AuthoringValueMutations,
}).annotate({ identifier: "AuthoringSaveEntryDraftRequest" });
export type AuthoringSaveEntryDraftRequest = typeof AuthoringSaveEntryDraftRequest.Type;

export class AuthoringCreateEntryResult extends Schema.Class<AuthoringCreateEntryResult>(
  "AuthoringCreateEntryResult",
)({
  entry: AuthoringEntrySummary,
  commandId: EntryCommandId,
  sharedVersion: EntryDraftVersion,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  validation: AuthoringEntryValidation,
}) {}

export class AuthoringSaveEntryDraftResult extends Schema.Class<AuthoringSaveEntryDraftResult>(
  "AuthoringSaveEntryDraftResult",
)({
  entryId: EntryId,
  commandId: EntryCommandId,
  sharedChanged: Schema.Boolean,
  sharedVersion: EntryDraftVersion,
  sharedRevisionId: Schema.NullOr(EntryRevisionId),
  localizedChanged: Schema.Boolean,
  localizedVersion: EntryDraftVersion,
  localizedRevisionId: Schema.NullOr(EntryRevisionId),
  validation: AuthoringEntryValidation,
}) {}

export class AuthoringRevisionSummary extends Schema.Class<AuthoringRevisionSummary>(
  "AuthoringRevisionSummary",
)({
  id: EntryRevisionId,
  entryId: EntryId,
  scope: EntryRevisionScope,
  locale: Schema.NullOr(LocaleTag),
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

export class AuthoringRevisionPage extends Schema.Class<AuthoringRevisionPage>(
  "AuthoringRevisionPage",
)({
  items: Schema.Array(AuthoringRevisionSummary).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class AuthoringRevision extends Schema.Class<AuthoringRevision>("AuthoringRevision")({
  revision: AuthoringRevisionSummary,
  values: AuthoringEntryValues,
  compatible: Schema.Boolean,
  currentSchemaRevisionId: SchemaRevisionId,
  currentContractHash: ContractHash,
}) {}

export class AuthoringRevisionComparisonItem extends Schema.Class<AuthoringRevisionComparisonItem>(
  "AuthoringRevisionComparisonItem",
)({
  fieldId: CollectionFieldId,
  apiKey: Schema.NullOr(AuthoringValueKey),
  change: EntryRevisionComparisonChange,
  before: Schema.optionalKey(AuthoringJsonValue),
  after: Schema.optionalKey(AuthoringJsonValue),
  inCurrentSchema: Schema.Boolean,
}) {}

export class AuthoringRevisionComparison extends Schema.Class<AuthoringRevisionComparison>(
  "AuthoringRevisionComparison",
)({
  entryId: EntryId,
  scope: EntryRevisionScope,
  from: AuthoringRevisionSummary,
  to: AuthoringRevisionSummary,
  items: Schema.Array(AuthoringRevisionComparisonItem).check(
    Schema.isMaxLength(entryRevisionComparisonLimits.maximumItems),
  ),
  restrictedChanges: Schema.Boolean,
  schemaDiffers: Schema.Boolean,
}) {}

export const AuthoringListRevisionsQuery = Schema.Struct({
  scope: EntryRevisionScope,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}).annotate({ identifier: "AuthoringListRevisionsQuery" });
export type AuthoringListRevisionsQuery = typeof AuthoringListRevisionsQuery.Type;

export const AuthoringRestoreRevisionRequest = Schema.Struct({
  scope: EntryRevisionScope,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  expectedVersion: EntryDraftVersion,
  commandId: EntryCommandId,
}).annotate({ identifier: "AuthoringRestoreRevisionRequest" });
export type AuthoringRestoreRevisionRequest = typeof AuthoringRestoreRevisionRequest.Type;

export const AuthoringEntryPageResponse = ApiSuccessSchema(AuthoringEntryPage);
export const AuthoringCreateEntryResponse = ApiSuccessSchema(AuthoringCreateEntryResult);
export const AuthoringEntryDraftResponse = ApiSuccessSchema(AuthoringEntryDraft);
export const AuthoringRenameEntryResponse = ApiSuccessSchema(AuthoringEntrySummary);
export const AuthoringSaveEntryDraftResponse = ApiSuccessSchema(AuthoringSaveEntryDraftResult);
export const AuthoringGeneratedFormResponse = ApiSuccessSchema(AuthoringGeneratedForm);
export const AuthoringRevisionPageResponse = ApiSuccessSchema(AuthoringRevisionPage);
export const AuthoringRevisionResponse = ApiSuccessSchema(AuthoringRevision);
export const AuthoringRevisionComparisonResponse = ApiSuccessSchema(AuthoringRevisionComparison);
export const AuthoringRestoreRevisionResponse = ApiSuccessSchema(AuthoringSaveEntryDraftResult);
