// Defines the exact browser-to-loopback operation allowlist; it contains no hosted authority.

import { AuthoringMutationSchema } from "@framerfordevs/sdk/authoring";
import { Schema, SchemaTransformation } from "effect";

import * as SchemaStrict from "../../schema-strict";
const Uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const Digest = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(/^[0-9a-f]{64}$/u),
);
const Version = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const ApiKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.makeFilter((value) => !value.includes("__") && !value.endsWith("_")),
);
const Locale = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u),
);
const Cursor = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
);
const DisplayName = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => value.trim().normalize("NFC"),
      encode: (value) => value,
    }),
  ),
).check(Schema.isMinLength(1), Schema.isMaxLength(100));
const Mutations = Schema.Array(AuthoringMutationSchema).check(Schema.isMaxLength(500));
const NonEmptyMutations = Mutations.check(Schema.isMinLength(1));

const scoped = { collectionKey: ApiKey, locale: Locale };
const identified = { ...scoped, entryId: Uuid };
const exact = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct(fields).annotate({ closedObject: true });

const SchemaLocal = exact({ operation: Schema.Literal("schema.local") });
const FormGet = exact({
  operation: Schema.Literal("form.get"),
  collectionKey: ApiKey,
});
const EntriesList = exact({
  operation: Schema.Literal("entries.list"),
  ...scoped,
  limit: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 50 })),
  ),
  cursor: Schema.optionalKey(Cursor),
});
const EntryGet = exact({ operation: Schema.Literal("entry.get"), ...identified });
const EntryCreate = exact({
  operation: Schema.Literal("entry.create"),
  ...scoped,
  displayName: DisplayName,
  schemaRevisionId: Uuid,
  contractHash: Digest,
  mutations: Mutations,
});
const EntryRename = exact({
  operation: Schema.Literal("entry.rename"),
  ...identified,
  displayName: DisplayName,
  expectedNameVersion: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
});
const EntrySave = exact({
  operation: Schema.Literal("entry.save"),
  ...identified,
  schemaRevisionId: Uuid,
  contractHash: Digest,
  expectedSharedVersion: Version,
  expectedLocalizedVersion: Version,
  mutations: NonEmptyMutations,
});
const PublicationStatus = exact({
  operation: Schema.Literal("publication.status"),
  ...identified,
});
const PublicationValidate = exact({
  operation: Schema.Literal("publication.validate"),
  ...identified,
});
const PublicationPublish = exact({
  operation: Schema.Literal("publication.publish"),
  ...identified,
  authorityHash: Digest,
  expectedStateVersion: Version,
  expectedPublicationId: Schema.NullOr(Uuid),
  expectedSchemaRevisionId: Uuid,
  expectedContractHash: Digest,
  expectedSharedVersion: Version,
  expectedSharedRevisionId: Schema.NullOr(Uuid),
  expectedLocalizedVersion: Version,
  expectedLocalizedRevisionId: Schema.NullOr(Uuid),
});
const PublicationUnpublish = exact({
  operation: Schema.Literal("publication.unpublish"),
  ...identified,
  expectedStateVersion: Version,
  expectedPublicationId: Schema.NullOr(Uuid),
});

export const EditorOperationRequest = Schema.Union([
  SchemaLocal,
  FormGet,
  EntriesList,
  EntryGet,
  EntryCreate,
  EntryRename,
  EntrySave,
  PublicationStatus,
  PublicationValidate,
  PublicationPublish,
  PublicationUnpublish,
]);

export type EditorOperationRequest = typeof EditorOperationRequest.Type;

export function decodeEditorOperationRequest(value: unknown): EditorOperationRequest {
  return SchemaStrict.decodeUnknownSync(EditorOperationRequest)(value, {
    onExcessProperty: "error",
  });
}

export const editorMutationOperations = new Set<EditorOperationRequest["operation"]>([
  "entry.create",
  "entry.rename",
  "entry.save",
  "publication.publish",
  "publication.unpublish",
]);
