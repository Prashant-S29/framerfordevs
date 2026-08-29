// Defines the exact browser-to-loopback operation allowlist; it contains no hosted authority.

import { AuthoringMutationSchema } from "@framerfordevs/sdk/authoring";
import { Schema } from "effect";

const Uuid = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const Digest = Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u));
const Version = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
const ApiKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.filter((value) => !value.includes("__") && !value.endsWith("_")),
);
const Locale = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u),
);
const Cursor = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(512),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
);
const DisplayName = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value) => value.trim().normalize("NFC"),
    encode: (value) => value,
  }),
  Schema.minLength(1),
  Schema.maxLength(100),
);
const Mutations = Schema.Array(AuthoringMutationSchema).pipe(Schema.maxItems(500));
const NonEmptyMutations = Mutations.pipe(Schema.minItems(1));

const scoped = { collectionKey: ApiKey, locale: Locale };
const identified = { ...scoped, entryId: Uuid };
const exact = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct(fields).annotations({ parseOptions: { onExcessProperty: "error" } });

const SchemaLocal = exact({ operation: Schema.Literal("schema.local") });
const FormGet = exact({
  operation: Schema.Literal("form.get"),
  collectionKey: ApiKey,
});
const EntriesList = exact({
  operation: Schema.Literal("entries.list"),
  ...scoped,
  limit: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 50)), {
    exact: true,
  }),
  cursor: Schema.optionalWith(Cursor, { exact: true }),
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
  expectedNameVersion: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
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

export const EditorOperationRequest = Schema.Union(
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
);

export type EditorOperationRequest = typeof EditorOperationRequest.Type;

export function decodeEditorOperationRequest(value: unknown): EditorOperationRequest {
  return Schema.decodeUnknownSync(EditorOperationRequest)(value, { onExcessProperty: "error" });
}

export const editorMutationOperations = new Set<EditorOperationRequest["operation"]>([
  "entry.create",
  "entry.rename",
  "entry.save",
  "publication.publish",
  "publication.unpublish",
]);
