// Defines the strict presentation-only projection and immutable publication result for Authoring v1.

import { Schema } from "effect";

import { ApiSuccessSchema } from "../../response/api";
import { StructureHash } from "..";
import { FieldEditorMetadata, EnumOptionId, EditorLayout } from "../../field";
import { IsoDateTime } from "../../platform";
import {
  CollectionDescription,
  CollectionDisplayName,
  CollectionFieldDisplayLabel,
  CollectionFieldId,
  CollectionId,
  ContractHash,
  SchemaHash,
  SchemaPublicationCommandId,
  SchemaRevisionId,
  SchemaRevisionSequence,
} from "../../schema";

export class AuthoringEnumOptionPresentation extends Schema.Class<AuthoringEnumOptionPresentation>(
  "AuthoringEnumOptionPresentation",
)(
  Schema.Struct({
    optionId: EnumOptionId,
    label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

const AuthoringEnumOptionPresentations = Schema.Array(AuthoringEnumOptionPresentation).pipe(
  Schema.maxItems(100),
  Schema.filter(
    (options) => new Set(options.map((option) => option.optionId)).size === options.length,
    {
      message: () => "Enum option presentation IDs must be unique.",
    },
  ),
);

export class AuthoringFieldPresentation extends Schema.Class<AuthoringFieldPresentation>(
  "AuthoringFieldPresentation",
)(
  Schema.Struct({
    fieldId: CollectionFieldId,
    displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
    editor: FieldEditorMetadata,
    enumOptions: AuthoringEnumOptionPresentations,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const AuthoringFieldPresentations = Schema.Array(AuthoringFieldPresentation).pipe(
  Schema.minItems(1),
  Schema.maxItems(100),
  Schema.filter((fields) => new Set(fields.map((field) => field.fieldId)).size === fields.length, {
    message: () => "Field presentation IDs must be unique.",
  }),
);
export type AuthoringFieldPresentations = typeof AuthoringFieldPresentations.Type;

export class AuthoringCollectionPresentation extends Schema.Class<AuthoringCollectionPresentation>(
  "AuthoringCollectionPresentation",
)(
  Schema.Struct({
    displayName: CollectionDisplayName,
    description: Schema.NullOr(CollectionDescription),
    fields: AuthoringFieldPresentations,
    editorLayout: EditorLayout,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const AuthoringPublishPresentationRequest = Schema.Struct({
  commandId: SchemaPublicationCommandId,
  expectedRevisionId: SchemaRevisionId,
  expectedSequence: SchemaRevisionSequence,
  presentation: AuthoringCollectionPresentation,
}).annotations({
  identifier: "AuthoringPublishPresentationRequest",
  parseOptions: { onExcessProperty: "error" },
});
export type AuthoringPublishPresentationRequest = typeof AuthoringPublishPresentationRequest.Type;

export class AuthoringPresentationRevision extends Schema.Class<AuthoringPresentationRevision>(
  "AuthoringPresentationRevision",
)({
  collectionId: CollectionId,
  revisionId: SchemaRevisionId,
  previousRevisionId: Schema.NullOr(SchemaRevisionId),
  sequence: SchemaRevisionSequence,
  schemaHash: SchemaHash,
  structureHash: StructureHash,
  contractHash: ContractHash,
  publishedAt: IsoDateTime,
}) {}

export class AuthoringPresentationSnapshot extends Schema.Class<AuthoringPresentationSnapshot>(
  "AuthoringPresentationSnapshot",
)({
  revision: AuthoringPresentationRevision,
  presentation: AuthoringCollectionPresentation,
}) {}

export class AuthoringPublishPresentationResult extends Schema.Class<AuthoringPublishPresentationResult>(
  "AuthoringPublishPresentationResult",
)({
  commandId: SchemaPublicationCommandId,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
  revision: AuthoringPresentationRevision,
  presentation: AuthoringCollectionPresentation,
}) {}

export const AuthoringPresentationSnapshotResponse = ApiSuccessSchema(
  AuthoringPresentationSnapshot,
);
export const AuthoringPublishPresentationResponse = ApiSuccessSchema(
  AuthoringPublishPresentationResult,
);
