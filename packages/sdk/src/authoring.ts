// Provides bounded Promise and Effect clients for the originless Authoring v1 protocol.

import type { ProjectSchema } from "@framerfordevs/schema";
import { isProjectSchema } from "@framerfordevs/schema/validate";
import { Effect, Schema, Stream } from "effect";

import {
  AuthoringEditorLayout,
  AuthoringFieldEditor,
  AuthoringGeneratedForm,
} from "./authoring-form.js";
export {
  AuthoringEditorLayout,
  AuthoringFieldEditor,
  AuthoringFormField,
  AuthoringGeneratedForm,
} from "./authoring-form.js";

import type {
  ApiEnvelope,
  ApiFailure,
  ApiSuccess,
  ClientRequestOptions,
  JsonObject,
  JsonValue,
  PublicApiError,
  SdkResponse,
} from "./client.js";

export type AuthoringMutation = typeof AuthoringMutationSchema.Type;

export interface AuthoringClientOptions {
  readonly baseUrl: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

export interface AuthoringListOptions extends ClientRequestOptions {
  readonly limit?: number;
  readonly cursor?: string;
}

export type AuthoringData = JsonObject;
export type AuthoringImportEntryResult =
  | {
      readonly index: number;
      readonly ok: true;
      readonly response: SdkResponse<AuthoringCreateResult>;
    }
  | { readonly index: number; readonly ok: false; readonly error: unknown };

const Uuid = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const Digest = Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u));
const Version = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0));
const PositiveVersion = Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1));
const IsoDateTime = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);
const Locale = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u),
);
const EntryDisplayName = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value) => value.trim().normalize("NFC"),
    encode: (value) => value,
  }),
  Schema.minLength(1),
  Schema.maxLength(100),
  Schema.filter((value) => {
    for (const character of value) {
      const codePoint = character.codePointAt(0);
      if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)))
        return false;
    }
    return true;
  }),
);
const ApiKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.filter((value) => !value.includes("__") && !value.endsWith("_")),
);
const reservedSourceKeys = new Set([
  "id",
  "entry_id",
  "collection_id",
  "locale",
  "schema_revision",
  "publication_id",
  "publication_sequence",
  "created_at",
  "updated_at",
  "published_at",
  "_meta",
  "__proto__",
  "prototype",
  "constructor",
]);
const SourceKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_-]{0,62}$/u),
  Schema.filter(
    (value) =>
      !value.includes("--") &&
      !value.includes("__") &&
      !value.endsWith("-") &&
      !value.endsWith("_") &&
      !reservedSourceKeys.has(value),
  ),
);
const ProjectDocument = Schema.declare<ProjectSchema>(isProjectSchema, {
  identifier: "SdkAuthoringProjectSchemaDocument",
});
const Cursor = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(512),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
);
const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.Boolean,
    Schema.Number.pipe(Schema.finite()),
    Schema.String,
    Schema.Array(JsonValueSchema),
    Schema.Record({ key: Schema.String, value: JsonValueSchema }),
  ),
);
const JsonObjectSchema: Schema.Schema<JsonObject> = Schema.Record({
  key: Schema.String,
  value: JsonValueSchema,
});

const MutationPath = Schema.Array(ApiKey).pipe(Schema.minItems(1), Schema.maxItems(16));
const SetMutation = Schema.Struct({
  operation: Schema.Literal("set"),
  scope: Schema.Literal("shared", "localized"),
  path: MutationPath,
  value: JsonValueSchema,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const UnsetMutation = Schema.Struct({
  operation: Schema.Literal("unset"),
  scope: Schema.Literal("shared", "localized"),
  path: MutationPath,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
export const AuthoringMutationSchema = Schema.Union(SetMutation, UnsetMutation).annotations({
  identifier: "SdkAuthoringMutation",
});

export class AuthoringSchemaAuthority extends Schema.Class<AuthoringSchemaAuthority>(
  "SdkAuthoringSchemaAuthority",
)({
  projectManifestHash: Digest,
  revisionIds: Schema.Record({ key: SourceKey, value: Uuid }),
}) {}

export class AuthoringSchemaPlanRequest extends Schema.Class<AuthoringSchemaPlanRequest>(
  "SdkAuthoringSchemaPlanRequest",
)({ project: ProjectDocument }) {}

export class AuthoringSchemaApplyRequest extends Schema.Class<AuthoringSchemaApplyRequest>(
  "SdkAuthoringSchemaApplyRequest",
)({
  project: ProjectDocument,
  commandId: Uuid,
  expectedCurrent: AuthoringSchemaAuthority,
  expectedPlanHash: Digest,
  acknowledgedChangeIds: Schema.Array(Digest).pipe(
    Schema.maxItems(10_000),
    Schema.filter((values) => new Set(values).size === values.length),
  ),
}) {}

export class AuthoringEnumOptionPresentation extends Schema.Class<AuthoringEnumOptionPresentation>(
  "SdkAuthoringEnumOptionPresentation",
)(
  Schema.Struct({
    optionId: Uuid,
    label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class AuthoringFieldPresentation extends Schema.Class<AuthoringFieldPresentation>(
  "SdkAuthoringFieldPresentation",
)(
  Schema.Struct({
    fieldId: Uuid,
    displayLabel: Schema.NullOr(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
    editor: AuthoringFieldEditor,
    enumOptions: Schema.Array(AuthoringEnumOptionPresentation).pipe(
      Schema.maxItems(100),
      Schema.filter(
        (options) => new Set(options.map((option) => option.optionId)).size === options.length,
      ),
    ),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class AuthoringCollectionPresentation extends Schema.Class<AuthoringCollectionPresentation>(
  "SdkAuthoringCollectionPresentation",
)(
  Schema.Struct({
    displayName: EntryDisplayName,
    description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    fields: Schema.Array(AuthoringFieldPresentation).pipe(
      Schema.minItems(1),
      Schema.maxItems(100),
      Schema.filter(
        (fields) => new Set(fields.map((field) => field.fieldId)).size === fields.length,
      ),
    ),
    editorLayout: AuthoringEditorLayout,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class AuthoringPublishPresentationRequest extends Schema.Class<AuthoringPublishPresentationRequest>(
  "SdkAuthoringPublishPresentationRequest",
)({
  commandId: Uuid,
  expectedRevisionId: Uuid,
  expectedSequence: PositiveVersion,
  presentation: AuthoringCollectionPresentation,
}) {}

export class AuthoringPresentationRevision extends Schema.Class<AuthoringPresentationRevision>(
  "SdkAuthoringPresentationRevision",
)({
  collectionId: Uuid,
  revisionId: Uuid,
  previousRevisionId: Schema.NullOr(Uuid),
  sequence: PositiveVersion,
  schemaHash: Digest,
  structureHash: Digest,
  contractHash: Digest,
  publishedAt: IsoDateTime,
}) {}

export class AuthoringPresentationSnapshot extends Schema.Class<AuthoringPresentationSnapshot>(
  "SdkAuthoringPresentationSnapshot",
)({
  revision: AuthoringPresentationRevision,
  presentation: AuthoringCollectionPresentation,
}) {}

export class AuthoringPublishPresentationResult extends Schema.Class<AuthoringPublishPresentationResult>(
  "SdkAuthoringPublishPresentationResult",
)({
  commandId: Uuid,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
  revision: AuthoringPresentationRevision,
  presentation: AuthoringCollectionPresentation,
}) {}

export class AuthoringCreateEntryRequest extends Schema.Class<AuthoringCreateEntryRequest>(
  "SdkAuthoringCreateEntryRequest",
)({
  displayName: EntryDisplayName,
  schemaRevisionId: Uuid,
  contractHash: Digest,
  commandId: Uuid,
  mutations: Schema.Array(AuthoringMutationSchema).pipe(Schema.maxItems(500)),
}) {}

export class AuthoringRenameEntryRequest extends Schema.Class<AuthoringRenameEntryRequest>(
  "SdkAuthoringRenameEntryRequest",
)({
  displayName: EntryDisplayName,
  expectedNameVersion: PositiveVersion,
}) {}

export class AuthoringSaveDraftRequest extends Schema.Class<AuthoringSaveDraftRequest>(
  "SdkAuthoringSaveDraftRequest",
)({
  schemaRevisionId: Uuid,
  contractHash: Digest,
  commandId: Uuid,
  expectedSharedVersion: Version,
  expectedLocalizedVersion: Version,
  mutations: Schema.Array(AuthoringMutationSchema).pipe(Schema.minItems(1), Schema.maxItems(500)),
}) {}

export class AuthoringPublishRequest extends Schema.Class<AuthoringPublishRequest>(
  "SdkAuthoringPublishRequest",
)({
  commandId: Uuid,
  authorityHash: Digest,
  expectedStateVersion: Version,
  expectedPublicationId: Schema.NullOr(Uuid),
  expectedSchemaRevisionId: Uuid,
  expectedContractHash: Digest,
  expectedSharedVersion: Version,
  expectedSharedRevisionId: Schema.NullOr(Uuid),
  expectedLocalizedVersion: Version,
  expectedLocalizedRevisionId: Schema.NullOr(Uuid),
}) {}

export class AuthoringUnpublishRequest extends Schema.Class<AuthoringUnpublishRequest>(
  "SdkAuthoringUnpublishRequest",
)({
  commandId: Uuid,
  expectedStateVersion: Version,
  expectedPublicationId: Schema.NullOr(Uuid),
}) {}

export class AuthoringCollectionIdentity extends Schema.Class<AuthoringCollectionIdentity>(
  "SdkAuthoringCollectionIdentity",
)({ sourceKey: SourceKey, collectionId: Uuid, apiKey: ApiKey }) {}

export class AuthoringFieldIdentity extends Schema.Class<AuthoringFieldIdentity>(
  "SdkAuthoringFieldIdentity",
)({
  collectionSourceKey: SourceKey,
  sourceKey: SourceKey,
  fieldId: Uuid,
  apiKey: Schema.NullOr(ApiKey),
}) {}

export class AuthoringEnumOptionIdentity extends Schema.Class<AuthoringEnumOptionIdentity>(
  "SdkAuthoringEnumOptionIdentity",
)({
  collectionSourceKey: SourceKey,
  fieldSourceKey: SourceKey,
  sourceKey: SourceKey,
  optionId: Uuid,
}) {}

export class AuthoringSchemaValidationIssue extends Schema.Class<AuthoringSchemaValidationIssue>(
  "SdkAuthoringSchemaValidationIssue",
)({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

const SchemaChangeCode = Schema.Literal(
  "collection.metadata.updated",
  "collection.api_key.updated",
  "schema.format.upgraded",
  "schema.currency_profile.updated",
  "editor_layout.updated",
  "field.added.optional",
  "field.added.required",
  "field.api_key.updated",
  "field.label.updated",
  "field.kind.updated",
  "field.required.enabled",
  "field.required.disabled",
  "field.localization.updated",
  "field.deprecated",
  "field.undeprecated",
  "field.position.updated",
  "field.structure.updated",
  "field.configuration.updated",
  "field.editor.updated",
  "field.removed",
);

export class AuthoringSchemaChange extends Schema.Class<AuthoringSchemaChange>(
  "SdkAuthoringSchemaChange",
)({
  changeId: Digest,
  code: SchemaChangeCode,
  classification: Schema.Literal("non_breaking", "potentially_breaking", "breaking"),
  collectionSourceKey: SourceKey,
  fieldSourceKey: Schema.NullOr(SourceKey),
  summary: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
}) {}

const AllocatedSchemaCandidate = Schema.Struct({
  collectionSourceKey: SourceKey,
  collectionId: Uuid,
  currentRevisionId: Schema.NullOr(Uuid),
  containsUnallocatedIdentities: Schema.Literal(false),
  candidateStructureHash: Digest,
  candidateContractHash: Digest,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const UnallocatedSchemaCandidate = Schema.Struct({
  collectionSourceKey: SourceKey,
  collectionId: Schema.NullOr(Uuid),
  currentRevisionId: Schema.NullOr(Uuid),
  containsUnallocatedIdentities: Schema.Literal(true),
  candidateStructureHash: Schema.Null,
  candidateContractHash: Schema.NullOr(Digest),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
export const AuthoringSchemaCandidate = Schema.Union(
  AllocatedSchemaCandidate,
  UnallocatedSchemaCandidate,
).annotations({ identifier: "SdkAuthoringSchemaCandidate" });

export class AuthoringAppliedRevision extends Schema.Class<AuthoringAppliedRevision>(
  "SdkAuthoringAppliedRevision",
)({
  collectionSourceKey: SourceKey,
  collectionId: Uuid,
  revisionId: Uuid,
  structureHash: Digest,
  contractHash: Digest,
  changed: Schema.Boolean,
}) {}

export class AuthoringSchemaExport extends Schema.Class<AuthoringSchemaExport>(
  "SdkAuthoringSchemaExport",
)({
  project: ProjectDocument,
  current: AuthoringSchemaAuthority,
  collections: Schema.Array(AuthoringCollectionIdentity).pipe(Schema.maxItems(100)),
  fields: Schema.Array(AuthoringFieldIdentity).pipe(Schema.maxItems(10_000)),
  enumOptions: Schema.Array(AuthoringEnumOptionIdentity).pipe(Schema.maxItems(10_000)),
  revisions: Schema.Array(AuthoringAppliedRevision).pipe(Schema.maxItems(100)),
}) {}

const AuthoringSchemaPlanBase = {
  current: AuthoringSchemaAuthority,
  changes: Schema.Array(AuthoringSchemaChange).pipe(Schema.maxItems(10_000)),
  candidates: Schema.Array(AuthoringSchemaCandidate).pipe(Schema.maxItems(100)),
} as const;
export const AuthoringSchemaPlan = Schema.Union(
  Schema.Struct({
    ...AuthoringSchemaPlanBase,
    valid: Schema.Literal(true),
    planHash: Digest,
    issues: Schema.Array(AuthoringSchemaValidationIssue).pipe(Schema.maxItems(50)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
  Schema.Struct({
    ...AuthoringSchemaPlanBase,
    valid: Schema.Literal(false),
    planHash: Schema.Null,
    issues: Schema.Array(AuthoringSchemaValidationIssue).pipe(
      Schema.minItems(1),
      Schema.maxItems(50),
    ),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
).annotations({ identifier: "SdkAuthoringSchemaPlan" });
export type AuthoringSchemaPlan = typeof AuthoringSchemaPlan.Type;

export class AuthoringSchemaApply extends Schema.Class<AuthoringSchemaApply>(
  "SdkAuthoringSchemaApply",
)({
  commandId: Uuid,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
  projectManifestHash: Digest,
  collections: Schema.Array(AuthoringCollectionIdentity).pipe(Schema.maxItems(100)),
  fields: Schema.Array(AuthoringFieldIdentity).pipe(Schema.maxItems(10_000)),
  enumOptions: Schema.Array(AuthoringEnumOptionIdentity).pipe(Schema.maxItems(10_000)),
  revisions: Schema.Array(AuthoringAppliedRevision).pipe(Schema.maxItems(100)),
}) {}

export class AuthoringEntrySummary extends Schema.Class<AuthoringEntrySummary>(
  "SdkAuthoringEntrySummary",
)({
  id: Uuid,
  displayName: EntryDisplayName,
  nameVersion: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class AuthoringValidationIssue extends Schema.Class<AuthoringValidationIssue>(
  "SdkAuthoringValidationIssue",
)({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  scope: Schema.Literal("shared", "localized"),
  locale: Schema.NullOr(Locale),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export class AuthoringValidation extends Schema.Class<AuthoringValidation>(
  "SdkAuthoringValidation",
)({
  valid: Schema.Boolean,
  issues: Schema.Array(AuthoringValidationIssue).pipe(Schema.maxItems(50)),
  capped: Schema.Boolean,
}) {}

export class AuthoringEntryPage extends Schema.Class<AuthoringEntryPage>("SdkAuthoringEntryPage")({
  items: Schema.Array(AuthoringEntrySummary).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class AuthoringEntryDraft extends Schema.Class<AuthoringEntryDraft>(
  "SdkAuthoringEntryDraft",
)({
  entry: AuthoringEntrySummary,
  locale: Locale,
  schemaRevisionId: Uuid,
  contractHash: Digest,
  sharedVersion: Version,
  sharedRevisionId: Schema.NullOr(Uuid),
  sharedValues: JsonObjectSchema,
  localizedVersion: Version,
  localizedRevisionId: Schema.NullOr(Uuid),
  localizedValues: JsonObjectSchema,
  canEditShared: Schema.Boolean,
  validation: AuthoringValidation,
}) {}

export class AuthoringDraftMutationResult extends Schema.Class<AuthoringDraftMutationResult>(
  "SdkAuthoringDraftMutationResult",
)({
  entryId: Uuid,
  commandId: Uuid,
  sharedChanged: Schema.Boolean,
  sharedVersion: Version,
  sharedRevisionId: Schema.NullOr(Uuid),
  localizedChanged: Schema.Boolean,
  localizedVersion: Version,
  localizedRevisionId: Schema.NullOr(Uuid),
  validation: AuthoringValidation,
}) {}

export class AuthoringCreateResult extends Schema.Class<AuthoringCreateResult>(
  "SdkAuthoringCreateResult",
)({
  entry: AuthoringEntrySummary,
  commandId: Uuid,
  sharedVersion: Version,
  sharedRevisionId: Schema.NullOr(Uuid),
  localizedVersion: Version,
  localizedRevisionId: Schema.NullOr(Uuid),
  validation: AuthoringValidation,
}) {}

export class AuthoringPublicationSize extends Schema.Class<AuthoringPublicationSize>(
  "SdkAuthoringPublicationSize",
)({
  documentBytes: Version,
  referenceManifestBytes: Version,
  combinedBytes: Version,
  maximumBytes: Version,
  bucket: Schema.Literal("small", "medium", "large", "near_limit", "over_limit"),
}) {}

export class AuthoringPublicationSummary extends Schema.Class<AuthoringPublicationSummary>(
  "SdkAuthoringPublicationSummary",
)({
  id: Uuid,
  entryId: Uuid,
  locale: Locale,
  sequence: PositiveVersion,
  schemaRevisionId: Uuid,
  contractHash: Digest,
  sharedRevisionId: Schema.NullOr(Uuid),
  sharedVersion: Version,
  localizedRevisionId: Schema.NullOr(Uuid),
  localizedVersion: Version,
  contentHash: Digest,
  authorityHash: Digest,
  documentHash: Digest,
  size: AuthoringPublicationSize,
  publishedAt: IsoDateTime,
  current: Schema.Boolean,
}) {}

export class AuthoringPublicationStatus extends Schema.Class<AuthoringPublicationStatus>(
  "SdkAuthoringPublicationStatus",
)({
  entryId: Uuid,
  locale: Locale,
  state: Schema.Literal("published", "unpublished"),
  stateVersion: Version,
  currentPublication: Schema.NullOr(AuthoringPublicationSummary),
  currentSchemaRevisionId: Uuid,
  currentContractHash: Digest,
  currentSharedRevisionId: Schema.NullOr(Uuid),
  currentSharedVersion: Version,
  currentLocalizedRevisionId: Schema.NullOr(Uuid),
  currentLocalizedVersion: Version,
  sharedChanged: Schema.Boolean,
  localizedChanged: Schema.Boolean,
  schemaChanged: Schema.Boolean,
  changedSincePublication: Schema.Boolean,
}) {}

export class AuthoringPublicationIssue extends Schema.Class<AuthoringPublicationIssue>(
  "SdkAuthoringPublicationIssue",
)({
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[a-z][a-z0-9_]{0,63}$/u),
  ),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export class AuthoringPublicationPlan extends Schema.Class<AuthoringPublicationPlan>(
  "SdkAuthoringPublicationPlan",
)({
  entryId: Uuid,
  locale: Locale,
  stateVersion: Version,
  currentPublicationId: Schema.NullOr(Uuid),
  schemaRevisionId: Uuid,
  contractHash: Digest,
  sharedRevisionId: Schema.NullOr(Uuid),
  sharedVersion: Version,
  localizedRevisionId: Schema.NullOr(Uuid),
  localizedVersion: Version,
  valid: Schema.Boolean,
  issues: Schema.Array(AuthoringPublicationIssue).pipe(Schema.maxItems(50)),
  capped: Schema.Boolean,
  contentHash: Schema.NullOr(Digest),
  authorityHash: Schema.NullOr(Digest),
  size: Schema.NullOr(AuthoringPublicationSize),
  referencesWouldRefresh: Schema.Boolean,
  wouldCreatePublication: Schema.Boolean,
}) {}

export class AuthoringPublishResult extends Schema.Class<AuthoringPublishResult>(
  "SdkAuthoringPublishResult",
)({
  entryId: Uuid,
  locale: Locale,
  commandId: Uuid,
  stateVersion: Version,
  resultKind: Schema.Literal("changed", "no_op"),
  publication: AuthoringPublicationSummary,
}) {}

export class AuthoringUnpublishResult extends Schema.Class<AuthoringUnpublishResult>(
  "SdkAuthoringUnpublishResult",
)({
  entryId: Uuid,
  locale: Locale,
  commandId: Uuid,
  stateVersion: Version,
  resultKind: Schema.Literal("changed", "no_op"),
  unpublishedPublicationId: Schema.NullOr(Uuid),
  unpublishedPublicationSequence: Schema.NullOr(PositiveVersion),
  unpublishedAt: IsoDateTime,
}) {}

const AuthoringErrorDetail = Schema.Struct({
  path: Schema.optionalWith(Schema.String.pipe(Schema.maxLength(256)), { exact: true }),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  scope: Schema.optionalWith(Schema.Literal("shared", "localized"), { exact: true }),
  expectedVersion: Schema.optionalWith(Version, { exact: true }),
  currentVersion: Schema.optionalWith(Version, { exact: true }),
  currentRevisionId: Schema.optionalWith(Schema.NullOr(Uuid), { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const AuthoringErrorCode = Schema.Literal(
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CMS_CAPABILITY_REQUIRED",
  "PUBLISHED_SCHEMA_REQUIRED",
  "STALE_SCHEMA",
  "DRAFT_CONFLICT",
  "PUBLICATION_CONFLICT",
  "PUBLICATION_INVALID",
  "COMMAND_CONFLICT",
  "RISKY_ACKNOWLEDGEMENT_REQUIRED",
  "SOURCE_IDENTITY_CONFLICT",
  "REQUEST_TOO_LARGE",
  "RESPONSE_TOO_LARGE",
  "CREDENTIAL_INVALID",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
);
const AuthoringPublicErrorSchema = Schema.Struct({
  code: AuthoringErrorCode,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(
    Schema.Array(AuthoringErrorDetail).pipe(Schema.minItems(1), Schema.maxItems(50)),
    { exact: true },
  ),
  retryable: Schema.Boolean,
  requestId: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(128),
    Schema.pattern(/^[A-Za-z0-9._:-]+$/u),
  ),
}).annotations({ parseOptions: { onExcessProperty: "error" } });

const maximumRequestBytes = 1_048_576;
const maximumResponseBytes = 4_194_304;
const defaultTimeoutMs = 15_000;
const maximumPages = 10_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (isRecord(value))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  throw new Error("Authoring response contains a non-JSON value.");
}

function isJsonArray(value: JsonValue): value is ReadonlyArray<JsonValue> {
  return Array.isArray(value);
}

function jsonObject(value: unknown): JsonObject {
  const decoded = jsonValue(value);
  if (decoded === null || isJsonArray(decoded) || typeof decoded !== "object")
    throw new Error("Authoring response data is invalid.");
  return decoded;
}

function requestBody<A, I>(schema: Schema.Schema<A, I, never>, value: unknown): JsonObject {
  return jsonObject(
    Schema.decodeUnknownSync(schema)(value, {
      onExcessProperty: "error",
    }),
  );
}

function decodeEnvelope<A>(value: unknown, decodeData: (value: unknown) => A): ApiEnvelope<A> {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    !("ok" in value) ||
    !("data" in value) ||
    !("error" in value) ||
    !("message" in value) ||
    typeof value.ok !== "boolean" ||
    typeof value.message !== "string"
  )
    throw new Error("Authoring response envelope is invalid.");
  if (value.ok) {
    if (value.error !== null) throw new Error("Authoring success envelope is invalid.");
    return {
      ok: true,
      data: decodeData(value.data),
      error: null,
      message: value.message,
    } satisfies ApiSuccess<A>;
  }
  if (value.data !== null) throw new Error("Authoring failure envelope is invalid.");
  const error = Schema.decodeUnknownSync(AuthoringPublicErrorSchema)(value.error, {
    onExcessProperty: "error",
  });
  const publicError: PublicApiError = {
    code: error.code,
    message: error.message,
    ...(error.details === undefined
      ? {}
      : { details: error.details.map((detail) => jsonObject(detail)) }),
    retryable: error.retryable,
    requestId: error.requestId,
  };
  return { ok: false, data: null, error: publicError, message: value.message } satisfies ApiFailure;
}

function origin(value: string): URL {
  const url = new URL(value);
  const local =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "" && url.pathname !== "/")
  )
    throw new Error("Use an HTTPS API origin or explicit localhost development origin.");
  return url;
}

function segment(value: string): string {
  if (value.length < 1 || value.length > 128)
    throw new Error("An Authoring route segment is out of bounds.");
  return encodeURIComponent(value);
}

function pathValue<I>(schema: Schema.Schema<string, I, never>, value: unknown): string {
  const decoded = Schema.decodeUnknownSync(schema)(value);
  return segment(decoded);
}

function signal(input: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return input === undefined ? timeout : AbortSignal.any([input, timeout]);
}

async function boundedBody(response: Response) {
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maximumResponseBytes)
    throw new Error("Authoring response is too large.");
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Array<Uint8Array> = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumResponseBytes) {
        await reader.cancel();
        throw new Error("Authoring response is too large.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return decoder.decode(bytes);
}

function optionalNumber(value: string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function authoringV1(options: AuthoringClientOptions) {
  if (options.token.length < 1) throw new Error("Authoring requires an explicit bearer token.");
  if (encoder.encode(options.token).byteLength > 16_384)
    throw new Error("Authoring bearer token exceeds the fixed bound.");
  const configuredTimeout = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isInteger(configuredTimeout) || configuredTimeout < 1 || configuredTimeout > 120_000)
    throw new Error("Authoring timeout is out of bounds.");
  const base = origin(options.baseUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const root = `/api/authoring/v1/projects/${pathValue(Uuid, options.projectId)}/environments/${pathValue(Uuid, options.environmentId)}`;
  const request = async <A, I>(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body: JsonObject | undefined,
    dataSchema: Schema.Schema<A, I, never>,
    requestOptions: ClientRequestOptions = {},
  ): Promise<SdkResponse<A>> => {
    const url = new URL(path, base);
    if (url.origin !== base.origin)
      throw new Error("Authoring request escaped the configured origin.");
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized !== undefined && encoder.encode(serialized).byteLength > maximumRequestBytes)
      throw new Error("Authoring request is too large.");
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${options.token}`,
    });
    if (serialized !== undefined) headers.set("Content-Type", "application/json");
    const requestTimeout = requestOptions.timeoutMs ?? configuredTimeout;
    if (!Number.isInteger(requestTimeout) || requestTimeout < 1 || requestTimeout > 120_000)
      throw new Error("Authoring timeout is out of bounds.");
    const response = await fetchImplementation(url, {
      method,
      headers,
      ...(serialized === undefined ? {} : { body: serialized }),
      redirect: "error",
      signal: signal(requestOptions.signal, requestTimeout),
    });
    const text = await boundedBody(response);
    const responseBody =
      text === ""
        ? null
        : decodeEnvelope(JSON.parse(text), (value) =>
            Schema.decodeUnknownSync(dataSchema)(value, { onExcessProperty: "error" }),
          );
    return {
      status: response.status,
      body: responseBody,
      etag: null,
      lastModified: null,
      cacheControl: response.headers.get("cache-control"),
      requestId: response.headers.get("x-request-id"),
      rateLimit: {
        limit: optionalNumber(response.headers.get("ratelimit-limit")),
        remaining: optionalNumber(response.headers.get("ratelimit-remaining")),
        reset: optionalNumber(response.headers.get("ratelimit-reset")),
        retryAfter: optionalNumber(response.headers.get("retry-after")),
      },
    };
  };
  const collectionPath = (collectionKey: string) =>
    `${root}/collections/${pathValue(ApiKey, collectionKey)}`;
  const entriesPath = (collectionKey: string, locale: string) =>
    `${collectionPath(collectionKey)}/locales/${pathValue(Locale, locale)}/entries`;
  const entryPath = (collectionKey: string, locale: string, entryId: string) =>
    `${entriesPath(collectionKey, locale)}/${pathValue(Uuid, entryId)}`;

  const client = {
    presentation: {
      get: (collectionKey: string, input: ClientRequestOptions = {}) =>
        request(
          `${collectionPath(collectionKey)}/presentation`,
          "GET",
          undefined,
          AuthoringPresentationSnapshot,
          input,
        ),
      publish: (
        collectionKey: string,
        body: AuthoringPublishPresentationRequest,
        input: ClientRequestOptions = {},
      ) =>
        request(
          `${collectionPath(collectionKey)}/presentation`,
          "POST",
          requestBody(AuthoringPublishPresentationRequest, body),
          AuthoringPublishPresentationResult,
          input,
        ),
    },
    form: {
      get: (collectionKey: string, input: ClientRequestOptions = {}) =>
        request(
          `${collectionPath(collectionKey)}/form`,
          "GET",
          undefined,
          AuthoringGeneratedForm,
          input,
        ),
    },
    schema: {
      export: (input: ClientRequestOptions = {}) =>
        request(`${root}/schema/export`, "GET", undefined, AuthoringSchemaExport, input),
      plan: (body: AuthoringSchemaPlanRequest, input: ClientRequestOptions = {}) =>
        request(
          `${root}/schema/plan`,
          "POST",
          requestBody(AuthoringSchemaPlanRequest, body),
          AuthoringSchemaPlan,
          input,
        ),
      apply: (body: AuthoringSchemaApplyRequest, input: ClientRequestOptions = {}) =>
        request(
          `${root}/schema/apply`,
          "POST",
          requestBody(AuthoringSchemaApplyRequest, body),
          AuthoringSchemaApply,
          input,
        ),
    },
    entries: {
      list: (collectionKey: string, locale: string, input: AuthoringListOptions = {}) => {
        const queryInput = Schema.decodeUnknownSync(
          Schema.Struct({
            limit: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 50)), {
              exact: true,
            }),
            cursor: Schema.optionalWith(Cursor, { exact: true }),
          }),
        )({
          ...(input.limit === undefined ? {} : { limit: input.limit }),
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        });
        const query = new URLSearchParams();
        if (queryInput.limit !== undefined) query.set("limit", String(queryInput.limit));
        if (queryInput.cursor !== undefined) query.set("cursor", queryInput.cursor);
        const suffix = query.size === 0 ? "" : `?${query}`;
        return request(
          `${entriesPath(collectionKey, locale)}${suffix}`,
          "GET",
          undefined,
          AuthoringEntryPage,
          input,
        );
      },
      create: (
        collectionKey: string,
        locale: string,
        body: AuthoringCreateEntryRequest,
        input: ClientRequestOptions = {},
      ) =>
        request(
          entriesPath(collectionKey, locale),
          "POST",
          requestBody(AuthoringCreateEntryRequest, body),
          AuthoringCreateResult,
          input,
        ),
      rename: (
        collectionKey: string,
        locale: string,
        entryId: string,
        body: AuthoringRenameEntryRequest,
        input: ClientRequestOptions = {},
      ) =>
        request(
          entryPath(collectionKey, locale, entryId),
          "PATCH",
          requestBody(AuthoringRenameEntryRequest, body),
          AuthoringEntrySummary,
          input,
        ),
      getDraft: (
        collectionKey: string,
        locale: string,
        entryId: string,
        input: ClientRequestOptions = {},
      ) =>
        request(
          `${entryPath(collectionKey, locale, entryId)}/draft`,
          "GET",
          undefined,
          AuthoringEntryDraft,
          input,
        ),
      saveDraft: (
        collectionKey: string,
        locale: string,
        entryId: string,
        body: AuthoringSaveDraftRequest,
        input: ClientRequestOptions = {},
      ) =>
        request(
          `${entryPath(collectionKey, locale, entryId)}/draft`,
          "PATCH",
          requestBody(AuthoringSaveDraftRequest, body),
          AuthoringDraftMutationResult,
          input,
        ),
      publicationStatus: (
        collectionKey: string,
        locale: string,
        entryId: string,
        input: ClientRequestOptions = {},
      ) =>
        request(
          `${entryPath(collectionKey, locale, entryId)}/publication`,
          "GET",
          undefined,
          AuthoringPublicationStatus,
          input,
        ),
      validatePublication: (
        collectionKey: string,
        locale: string,
        entryId: string,
        input: ClientRequestOptions = {},
      ) =>
        request(
          `${entryPath(collectionKey, locale, entryId)}/publication/validate`,
          "POST",
          requestBody(
            Schema.Struct({}).annotations({ parseOptions: { onExcessProperty: "error" } }),
            {},
          ),
          AuthoringPublicationPlan,
          input,
        ),
      publish: (
        collectionKey: string,
        locale: string,
        entryId: string,
        body: AuthoringPublishRequest,
        input: ClientRequestOptions = {},
      ) =>
        request(
          `${entryPath(collectionKey, locale, entryId)}/publication/publish`,
          "POST",
          requestBody(AuthoringPublishRequest, body),
          AuthoringPublishResult,
          input,
        ),
      unpublish: (
        collectionKey: string,
        locale: string,
        entryId: string,
        body: AuthoringUnpublishRequest,
        input: ClientRequestOptions = {},
      ) =>
        request(
          `${entryPath(collectionKey, locale, entryId)}/publication/unpublish`,
          "POST",
          requestBody(AuthoringUnpublishRequest, body),
          AuthoringUnpublishResult,
          input,
        ),
      pages: async function* (
        collectionKey: string,
        locale: string,
        input: Omit<AuthoringListOptions, "cursor"> = {},
      ) {
        const seen = new Set<string>();
        let cursor: string | undefined;
        for (let page = 0; page < maximumPages; page += 1) {
          const response = await this.list(collectionKey, locale, { ...input, cursor });
          yield response;
          if (response.body === null || !response.body.ok) return;
          const next = response.body.data.nextCursor;
          if (next === null) return;
          if (typeof next !== "string") throw new Error("Authoring page cursor is invalid.");
          if (seen.has(next)) throw new Error("Authoring pagination repeated a cursor.");
          seen.add(next);
          cursor = next;
        }
        throw new Error("Authoring pagination exceeded the fixed page bound.");
      },
    },
  };
  return {
    ...client,
    helpers: {
      saveCurrentDraft: async (
        collectionKey: string,
        locale: string,
        entryId: string,
        commandId: string,
        mutations: ReadonlyArray<AuthoringMutation>,
        input: ClientRequestOptions = {},
      ) => {
        const current = await client.entries.getDraft(collectionKey, locale, entryId, input);
        if (current.body === null || !current.body.ok)
          return { kind: "draft_unavailable" as const, response: current };
        const draft = current.body.data;
        const response = await client.entries.saveDraft(
          collectionKey,
          locale,
          entryId,
          {
            schemaRevisionId: draft.schemaRevisionId,
            contractHash: draft.contractHash,
            commandId,
            expectedSharedVersion: draft.sharedVersion,
            expectedLocalizedVersion: draft.localizedVersion,
            mutations,
          },
          input,
        );
        return { kind: "save_attempted" as const, response };
      },
      importEntries: async (
        collectionKey: string,
        locale: string,
        bodies: ReadonlyArray<AuthoringCreateEntryRequest>,
        options: { readonly concurrency?: number; readonly signal?: AbortSignal } = {},
      ) => {
        if (bodies.length > 1_000)
          throw new Error("Authoring import exceeds the fixed item bound.");
        const concurrency = options.concurrency ?? 4;
        if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
          throw new Error("Authoring import concurrency is out of bounds.");
        const results = new Map<number, AuthoringImportEntryResult>();
        let nextIndex = 0;
        const worker = async () => {
          while (true) {
            const index = nextIndex;
            nextIndex += 1;
            const body = bodies[index];
            if (body === undefined) return;
            try {
              results.set(index, {
                index,
                ok: true,
                response: await client.entries.create(collectionKey, locale, body, {
                  signal: options.signal,
                }),
              });
            } catch (error) {
              results.set(index, { index, ok: false, error });
            }
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(concurrency, bodies.length) }, () => worker()),
        );
        return Array.from({ length: bodies.length }, (_, index) => {
          const result = results.get(index);
          if (result === undefined) throw new Error("Authoring import result is unavailable.");
          return result;
        });
      },
      validateThenPublish: async (
        collectionKey: string,
        locale: string,
        entryId: string,
        commandId: string,
        input: ClientRequestOptions = {},
      ) => {
        const validation = await client.entries.validatePublication(
          collectionKey,
          locale,
          entryId,
          input,
        );
        if (
          validation.body === null ||
          !validation.body.ok ||
          !validation.body.data.valid ||
          validation.body.data.authorityHash === null
        )
          return { kind: "not_publishable" as const, validation };
        const plan = validation.body.data;
        const authorityHash = plan.authorityHash;
        if (authorityHash === null) return { kind: "not_publishable" as const, validation };
        const publication = await client.entries.publish(
          collectionKey,
          locale,
          entryId,
          {
            commandId,
            authorityHash,
            expectedStateVersion: plan.stateVersion,
            expectedPublicationId: plan.currentPublicationId,
            expectedSchemaRevisionId: plan.schemaRevisionId,
            expectedContractHash: plan.contractHash,
            expectedSharedVersion: plan.sharedVersion,
            expectedSharedRevisionId: plan.sharedRevisionId,
            expectedLocalizedVersion: plan.localizedVersion,
            expectedLocalizedRevisionId: plan.localizedRevisionId,
          },
          input,
        );
        return { kind: "publish_attempted" as const, validation, publication };
      },
    },
  };
}

export function authoringV1Effect(options: AuthoringClientOptions) {
  const client = authoringV1(options);
  const wrap = <A>(operation: () => Promise<A>) => Effect.tryPromise(operation);
  return {
    presentation: {
      get: (collection: string, input?: ClientRequestOptions) =>
        wrap(() => client.presentation.get(collection, input)),
      publish: (
        collection: string,
        body: AuthoringPublishPresentationRequest,
        input?: ClientRequestOptions,
      ) => wrap(() => client.presentation.publish(collection, body, input)),
    },
    form: {
      get: (collection: string, input?: ClientRequestOptions) =>
        wrap(() => client.form.get(collection, input)),
    },
    schema: {
      export: (input?: ClientRequestOptions) => wrap(() => client.schema.export(input)),
      plan: (body: AuthoringSchemaPlanRequest, input?: ClientRequestOptions) =>
        wrap(() => client.schema.plan(body, input)),
      apply: (body: AuthoringSchemaApplyRequest, input?: ClientRequestOptions) =>
        wrap(() => client.schema.apply(body, input)),
    },
    entries: {
      list: (collection: string, locale: string, input?: AuthoringListOptions) =>
        wrap(() => client.entries.list(collection, locale, input)),
      create: (
        collection: string,
        locale: string,
        body: AuthoringCreateEntryRequest,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.create(collection, locale, body, input)),
      rename: (
        collection: string,
        locale: string,
        entryId: string,
        body: AuthoringRenameEntryRequest,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.rename(collection, locale, entryId, body, input)),
      getDraft: (
        collection: string,
        locale: string,
        entryId: string,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.getDraft(collection, locale, entryId, input)),
      saveDraft: (
        collection: string,
        locale: string,
        entryId: string,
        body: AuthoringSaveDraftRequest,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.saveDraft(collection, locale, entryId, body, input)),
      publicationStatus: (
        collection: string,
        locale: string,
        entryId: string,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.publicationStatus(collection, locale, entryId, input)),
      validatePublication: (
        collection: string,
        locale: string,
        entryId: string,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.validatePublication(collection, locale, entryId, input)),
      publish: (
        collection: string,
        locale: string,
        entryId: string,
        body: AuthoringPublishRequest,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.publish(collection, locale, entryId, body, input)),
      unpublish: (
        collection: string,
        locale: string,
        entryId: string,
        body: AuthoringUnpublishRequest,
        input?: ClientRequestOptions,
      ) => wrap(() => client.entries.unpublish(collection, locale, entryId, body, input)),
      pages: (
        collection: string,
        locale: string,
        input: Omit<AuthoringListOptions, "cursor"> = {},
      ) =>
        Stream.fromAsyncIterable(client.entries.pages(collection, locale, input), (cause) => cause),
    },
    helpers: {
      saveCurrentDraft: (
        collection: string,
        locale: string,
        entryId: string,
        commandId: string,
        mutations: ReadonlyArray<AuthoringMutation>,
        input?: ClientRequestOptions,
      ) =>
        wrap(() =>
          client.helpers.saveCurrentDraft(collection, locale, entryId, commandId, mutations, input),
        ),
      importEntries: (
        collection: string,
        locale: string,
        bodies: ReadonlyArray<AuthoringCreateEntryRequest>,
        options?: { readonly concurrency?: number; readonly signal?: AbortSignal },
      ) => wrap(() => client.helpers.importEntries(collection, locale, bodies, options)),
      validateThenPublish: (
        collection: string,
        locale: string,
        entryId: string,
        commandId: string,
        input?: ClientRequestOptions,
      ) =>
        wrap(() =>
          client.helpers.validateThenPublish(collection, locale, entryId, commandId, input),
        ),
    },
  };
}
