// Defines tenant-neutral exact-locale Authoring publication authority and commands.

import { Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import { EntryCommandId, EntryDraftVersion, EntryId, EntryRevisionId } from "../../entry";
import { LocaleTag } from "../../locale";
import { IsoDateTime } from "../../platform";
import {
  EntryPublicationHash,
  EntryPublicationId,
  EntryPublicationSequence,
  EntryPublicationSize,
  EntryPublicationStateVersion,
} from "../../publication";
import { ContractHash, SchemaRevisionId } from "../../schema";

export class AuthoringPublicationIssue extends Schema.Class<AuthoringPublicationIssue>(
  "AuthoringPublicationIssue",
)({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export class AuthoringPublicationSummary extends Schema.Class<AuthoringPublicationSummary>(
  "AuthoringPublicationSummary",
)({
  id: EntryPublicationId,
  entryId: EntryId,
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
  size: EntryPublicationSize,
  publishedAt: IsoDateTime,
  current: Schema.Boolean,
}) {}

export class AuthoringPublicationStatus extends Schema.Class<AuthoringPublicationStatus>(
  "AuthoringPublicationStatus",
)({
  entryId: EntryId,
  locale: LocaleTag,
  state: Schema.Literal("published", "unpublished"),
  stateVersion: EntryPublicationStateVersion,
  currentPublication: Schema.NullOr(AuthoringPublicationSummary),
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

export class AuthoringPublicationPlan extends Schema.Class<AuthoringPublicationPlan>(
  "AuthoringPublicationPlan",
)({
  entryId: EntryId,
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
  issues: Schema.Array(AuthoringPublicationIssue).pipe(Schema.maxItems(50)),
  capped: Schema.Boolean,
  contentHash: Schema.NullOr(EntryPublicationHash),
  authorityHash: Schema.NullOr(EntryPublicationHash),
  size: Schema.NullOr(EntryPublicationSize),
  referencesWouldRefresh: Schema.Boolean,
  wouldCreatePublication: Schema.Boolean,
}) {}

type EmptyAuthoringRequest = Readonly<Record<string, never>>;

function isEmptyAuthoringRequest(input: unknown): input is EmptyAuthoringRequest {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).length === 0
  );
}

export const AuthoringValidatePublicationRequest = Schema.declare<EmptyAuthoringRequest>(
  isEmptyAuthoringRequest,
  {
    identifier: "AuthoringValidatePublicationRequest",
    jsonSchema: { type: "object", properties: {}, additionalProperties: false },
  },
);

export const AuthoringPublishEntryRequest = Schema.Struct({
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
}).annotations({
  identifier: "AuthoringPublishEntryRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type AuthoringPublishEntryRequest = typeof AuthoringPublishEntryRequest.Type;

export const AuthoringUnpublishEntryRequest = Schema.Struct({
  commandId: EntryCommandId,
  expectedStateVersion: EntryPublicationStateVersion,
  expectedPublicationId: Schema.NullOr(EntryPublicationId),
}).annotations({
  identifier: "AuthoringUnpublishEntryRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type AuthoringUnpublishEntryRequest = typeof AuthoringUnpublishEntryRequest.Type;

export class AuthoringPublishEntryResult extends Schema.Class<AuthoringPublishEntryResult>(
  "AuthoringPublishEntryResult",
)({
  entryId: EntryId,
  locale: LocaleTag,
  commandId: EntryCommandId,
  stateVersion: EntryPublicationStateVersion,
  resultKind: Schema.Literal("changed", "no_op"),
  publication: AuthoringPublicationSummary,
}) {}

export class AuthoringUnpublishEntryResult extends Schema.Class<AuthoringUnpublishEntryResult>(
  "AuthoringUnpublishEntryResult",
)({
  entryId: EntryId,
  locale: LocaleTag,
  commandId: EntryCommandId,
  stateVersion: EntryPublicationStateVersion,
  resultKind: Schema.Literal("changed", "no_op"),
  unpublishedPublicationId: Schema.NullOr(EntryPublicationId),
  unpublishedPublicationSequence: Schema.NullOr(EntryPublicationSequence),
  unpublishedAt: IsoDateTime,
}) {}

export const AuthoringPublicationStatusResponse = ApiSuccessSchema(AuthoringPublicationStatus);
export const AuthoringPublicationPlanResponse = ApiSuccessSchema(AuthoringPublicationPlan);
export const AuthoringPublishEntryResponse = ApiSuccessSchema(AuthoringPublishEntryResult);
export const AuthoringUnpublishEntryResponse = ApiSuccessSchema(AuthoringUnpublishEntryResult);
