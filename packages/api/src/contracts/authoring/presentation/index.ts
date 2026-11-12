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
    label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
  }),
) {}

const AuthoringEnumOptionPresentations = Schema.Array(AuthoringEnumOptionPresentation).check(
  Schema.isMaxLength(100),
  Schema.makeFilter(
    (options) => new Set(options.map((option) => option.optionId)).size === options.length,
    {
      message: "Enum option presentation IDs must be unique.",
    },
  ),
);

export class AuthoringFieldPresentation extends Schema.Class<AuthoringFieldPresentation>(
  "AuthoringFieldPresentation",
)(
  Schema.Struct({
    fieldId: CollectionFieldId,
    displayLabel: Schema.NullOr(CollectionFieldDisplayLabel),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
    editor: FieldEditorMetadata,
    enumOptions: AuthoringEnumOptionPresentations,
  }),
) {}

export const AuthoringFieldPresentations = Schema.Array(AuthoringFieldPresentation).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.makeFilter(
    (fields) => new Set(fields.map((field) => field.fieldId)).size === fields.length,
    {
      message: "Field presentation IDs must be unique.",
    },
  ),
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
  }),
) {}

export const AuthoringPublishPresentationRequest = Schema.Struct({
  commandId: SchemaPublicationCommandId,
  expectedRevisionId: SchemaRevisionId,
  expectedSequence: SchemaRevisionSequence,
  presentation: AuthoringCollectionPresentation,
}).annotate({ identifier: "AuthoringPublishPresentationRequest" });
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
