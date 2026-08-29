// Defines tenant-neutral exact-locale Authoring entry read and draft contracts.

import { Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import { AuthoringJsonValue, AuthoringValueMutation, AuthoringValueMutations } from "..";
import {
  EntryCommandId,
  EntryDisplayName,
  EntryDraftVersion,
  EntryId,
  EntryNameVersion,
  EntryRevisionId,
} from "../../entry";
import { LocaleTag } from "../../locale";
import { Cursor, IsoDateTime, PageLimit } from "../../platform";
import {
  CollectionApiKey,
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
  items: Schema.Array(AuthoringEntrySummary).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export const AuthoringEntryValues = Schema.Record({
  key: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(63),
    Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
  ),
  value: AuthoringJsonValue,
});
export type AuthoringEntryValues = typeof AuthoringEntryValues.Type;

export class AuthoringEntryValidationIssue extends Schema.Class<AuthoringEntryValidationIssue>(
  "AuthoringEntryValidationIssue",
)({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  scope: Schema.Literal("shared", "localized"),
  locale: Schema.NullOr(LocaleTag),
  code: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export class AuthoringEntryValidation extends Schema.Class<AuthoringEntryValidation>(
  "AuthoringEntryValidation",
)({
  valid: Schema.Boolean,
  issues: Schema.Array(AuthoringEntryValidationIssue).pipe(Schema.maxItems(50)),
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
}).annotations({
  identifier: "AuthoringListEntriesQuery",
  parseOptions: { onExcessProperty: "error" },
});
export type AuthoringListEntriesQuery = typeof AuthoringListEntriesQuery.Type;

export const AuthoringCreateEntryRequest = Schema.Struct({
  displayName: EntryDisplayName,
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  commandId: EntryCommandId,
  mutations: Schema.Array(AuthoringValueMutation).pipe(Schema.maxItems(500)),
}).annotations({
  identifier: "AuthoringCreateEntryRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type AuthoringCreateEntryRequest = typeof AuthoringCreateEntryRequest.Type;

export const AuthoringRenameEntryRequest = Schema.Struct({
  displayName: EntryDisplayName,
  expectedNameVersion: EntryNameVersion,
}).annotations({
  identifier: "AuthoringRenameEntryRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type AuthoringRenameEntryRequest = typeof AuthoringRenameEntryRequest.Type;

export const AuthoringSaveEntryDraftRequest = Schema.Struct({
  schemaRevisionId: SchemaRevisionId,
  contractHash: ContractHash,
  commandId: EntryCommandId,
  expectedSharedVersion: EntryDraftVersion,
  expectedLocalizedVersion: EntryDraftVersion,
  mutations: AuthoringValueMutations,
}).annotations({
  identifier: "AuthoringSaveEntryDraftRequest",
  parseOptions: { onExcessProperty: "error" },
});
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

export const AuthoringEntryPageResponse = ApiSuccessSchema(AuthoringEntryPage);
export const AuthoringCreateEntryResponse = ApiSuccessSchema(AuthoringCreateEntryResult);
export const AuthoringEntryDraftResponse = ApiSuccessSchema(AuthoringEntryDraft);
export const AuthoringRenameEntryResponse = ApiSuccessSchema(AuthoringEntrySummary);
export const AuthoringSaveEntryDraftResponse = ApiSuccessSchema(AuthoringSaveEntryDraftResult);
export const AuthoringGeneratedFormResponse = ApiSuccessSchema(AuthoringGeneratedForm);
