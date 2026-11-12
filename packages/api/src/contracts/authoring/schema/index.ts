// Defines strict M13 complete-project schema plan/apply request and response contracts.

import type { ProjectSchema } from "@framerfordevs/schema";
import { isProjectSchema } from "@framerfordevs/schema/validate";
import { Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import {
  AuthoringProjectScope,
  AuthoringSchemaAuthority,
  CollectionSourceKey,
  EnumOptionSourceKey,
  FieldSourceKey,
  ProjectStructureManifestHash,
  SchemaApplyCommandId,
  SchemaPlanHash,
  StructureHash,
} from "..";
import { EnumOptionId } from "../../field";
import {
  CollectionApiKey,
  CollectionFieldApiKey,
  CollectionFieldId,
  CollectionId,
  ContractHash,
  SchemaChangeClassification,
  SchemaChangeCode,
  SchemaChangeId,
  SchemaRevisionId,
} from "../../schema";

export const AuthoringProjectSchemaDocument = Schema.declare<ProjectSchema>(isProjectSchema, {
  identifier: "AuthoringProjectSchemaDocument",
  description: "A complete strictly validated code-owned project schema document.",
});
export type AuthoringProjectSchemaDocument = typeof AuthoringProjectSchemaDocument.Type;

export class AuthoringSchemaValidationIssue extends Schema.Class<AuthoringSchemaValidationIssue>(
  "AuthoringSchemaValidationIssue",
)({
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  code: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
    Schema.isPattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export class AuthoringSchemaChange extends Schema.Class<AuthoringSchemaChange>(
  "AuthoringSchemaChange",
)({
  changeId: SchemaChangeId,
  code: SchemaChangeCode,
  classification: SchemaChangeClassification,
  collectionSourceKey: CollectionSourceKey,
  fieldSourceKey: Schema.NullOr(FieldSourceKey),
  summary: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
}) {}

const CandidateWithAllocatedIdentities = Schema.Struct({
  collectionSourceKey: CollectionSourceKey,
  collectionId: CollectionId,
  currentRevisionId: Schema.NullOr(SchemaRevisionId),
  containsUnallocatedIdentities: Schema.Literal(false),
  candidateStructureHash: StructureHash,
  candidateContractHash: ContractHash,
}).annotate({ closedObject: true });

const CandidateWithUnallocatedIdentities = Schema.Struct({
  collectionSourceKey: CollectionSourceKey,
  collectionId: Schema.NullOr(CollectionId),
  currentRevisionId: Schema.NullOr(SchemaRevisionId),
  containsUnallocatedIdentities: Schema.Literal(true),
  candidateStructureHash: Schema.Null,
  candidateContractHash: Schema.NullOr(ContractHash),
}).annotate({ closedObject: true });

/**
 * `candidateStructureHash` is always present. It is exactly `null` when any candidate identity has
 * not yet received its server-generated ID; omission is never used to represent this state.
 */
export const AuthoringSchemaCandidate = Schema.Union([
  CandidateWithAllocatedIdentities,
  CandidateWithUnallocatedIdentities,
]).annotate({ identifier: "AuthoringSchemaCandidate" });
export type AuthoringSchemaCandidate = typeof AuthoringSchemaCandidate.Type;

export class AuthoringSchemaExportInput extends Schema.Class<AuthoringSchemaExportInput>(
  "AuthoringSchemaExportInput",
)({
  scope: AuthoringProjectScope,
}) {}

export class AuthoringSchemaPlanInput extends Schema.Class<AuthoringSchemaPlanInput>(
  "AuthoringSchemaPlanInput",
)({
  scope: AuthoringProjectScope,
  project: AuthoringProjectSchemaDocument,
}) {}

export const AuthoringSchemaPlanRequest = Schema.Struct({
  project: AuthoringProjectSchemaDocument,
}).annotate({
  identifier: "AuthoringSchemaPlanRequest",
  closedObject: true,
});
export type AuthoringSchemaPlanRequest = typeof AuthoringSchemaPlanRequest.Type;

const AuthoringSchemaPlanBase = {
  current: AuthoringSchemaAuthority,
  changes: Schema.Array(AuthoringSchemaChange).check(Schema.isMaxLength(10_000)),
  candidates: Schema.Array(AuthoringSchemaCandidate).check(Schema.isMaxLength(100)),
} as const;

const ValidAuthoringSchemaPlan = Schema.Struct({
  ...AuthoringSchemaPlanBase,
  valid: Schema.Literal(true),
  planHash: SchemaPlanHash,
  issues: Schema.Array(AuthoringSchemaValidationIssue).check(Schema.isMaxLength(50)),
}).annotate({ closedObject: true });

const InvalidAuthoringSchemaPlan = Schema.Struct({
  ...AuthoringSchemaPlanBase,
  valid: Schema.Literal(false),
  planHash: Schema.Null,
  issues: Schema.Array(AuthoringSchemaValidationIssue).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(50),
  ),
}).annotate({ closedObject: true });

export const AuthoringSchemaPlan = Schema.Union([
  ValidAuthoringSchemaPlan,
  InvalidAuthoringSchemaPlan,
]).annotate({ identifier: "AuthoringSchemaPlan" });
export type AuthoringSchemaPlan = typeof AuthoringSchemaPlan.Type;

export const AcknowledgedAuthoringSchemaChangeIds = Schema.Array(SchemaChangeId).check(
  Schema.isMaxLength(10_000),
  Schema.makeFilter((values) => new Set(values).size === values.length, {
    message: "Acknowledged schema change IDs must be unique.",
  }),
);
export type AcknowledgedAuthoringSchemaChangeIds = typeof AcknowledgedAuthoringSchemaChangeIds.Type;

export class AuthoringSchemaApplyInput extends Schema.Class<AuthoringSchemaApplyInput>(
  "AuthoringSchemaApplyInput",
)({
  scope: AuthoringProjectScope,
  project: AuthoringProjectSchemaDocument,
  commandId: SchemaApplyCommandId,
  expectedCurrent: AuthoringSchemaAuthority,
  expectedPlanHash: SchemaPlanHash,
  acknowledgedChangeIds: AcknowledgedAuthoringSchemaChangeIds,
}) {}

export const AuthoringSchemaApplyRequest = Schema.Struct({
  project: AuthoringProjectSchemaDocument,
  commandId: SchemaApplyCommandId,
  expectedCurrent: AuthoringSchemaAuthority,
  expectedPlanHash: SchemaPlanHash,
  acknowledgedChangeIds: AcknowledgedAuthoringSchemaChangeIds,
}).annotate({
  identifier: "AuthoringSchemaApplyRequest",
  closedObject: true,
});
export type AuthoringSchemaApplyRequest = typeof AuthoringSchemaApplyRequest.Type;

export class AppliedCollectionSourceIdentity extends Schema.Class<AppliedCollectionSourceIdentity>(
  "AppliedCollectionSourceIdentity",
)({
  sourceKey: CollectionSourceKey,
  collectionId: CollectionId,
  apiKey: CollectionApiKey,
}) {}

export class AppliedFieldSourceIdentity extends Schema.Class<AppliedFieldSourceIdentity>(
  "AppliedFieldSourceIdentity",
)({
  collectionSourceKey: CollectionSourceKey,
  sourceKey: FieldSourceKey,
  fieldId: CollectionFieldId,
  apiKey: Schema.NullOr(CollectionFieldApiKey),
}) {}

export class AppliedEnumOptionSourceIdentity extends Schema.Class<AppliedEnumOptionSourceIdentity>(
  "AppliedEnumOptionSourceIdentity",
)({
  collectionSourceKey: CollectionSourceKey,
  fieldSourceKey: FieldSourceKey,
  sourceKey: EnumOptionSourceKey,
  optionId: EnumOptionId,
}) {}

export class AppliedCollectionRevision extends Schema.Class<AppliedCollectionRevision>(
  "AppliedCollectionRevision",
)({
  collectionSourceKey: CollectionSourceKey,
  collectionId: CollectionId,
  revisionId: SchemaRevisionId,
  structureHash: StructureHash,
  contractHash: ContractHash,
  changed: Schema.Boolean,
}) {}

export class AuthoringSchemaExportResult extends Schema.Class<AuthoringSchemaExportResult>(
  "AuthoringSchemaExportResult",
)({
  project: AuthoringProjectSchemaDocument,
  current: AuthoringSchemaAuthority,
  collections: Schema.Array(AppliedCollectionSourceIdentity).check(Schema.isMaxLength(100)),
  fields: Schema.Array(AppliedFieldSourceIdentity).check(Schema.isMaxLength(10_000)),
  enumOptions: Schema.Array(AppliedEnumOptionSourceIdentity).check(Schema.isMaxLength(10_000)),
  revisions: Schema.Array(AppliedCollectionRevision).check(Schema.isMaxLength(100)),
}) {}

export class AuthoringSchemaApplyResult extends Schema.Class<AuthoringSchemaApplyResult>(
  "AuthoringSchemaApplyResult",
)({
  commandId: SchemaApplyCommandId,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
  projectManifestHash: ProjectStructureManifestHash,
  collections: Schema.Array(AppliedCollectionSourceIdentity).check(Schema.isMaxLength(100)),
  fields: Schema.Array(AppliedFieldSourceIdentity).check(Schema.isMaxLength(10_000)),
  enumOptions: Schema.Array(AppliedEnumOptionSourceIdentity).check(Schema.isMaxLength(10_000)),
  revisions: Schema.Array(AppliedCollectionRevision).check(Schema.isMaxLength(100)),
}) {}

export const AuthoringSchemaExportResponse = ApiSuccessSchema(AuthoringSchemaExportResult);
export const AuthoringSchemaPlanResponse = ApiSuccessSchema(AuthoringSchemaPlan);
export const AuthoringSchemaApplyResponse = ApiSuccessSchema(AuthoringSchemaApplyResult);
