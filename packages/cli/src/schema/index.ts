import { Schema } from "effect";

const Uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const Digest = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(/^[0-9a-f]{64}$/u),
);
const ApiKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.makeFilter((value) => !value.includes("__") && !value.endsWith("_")),
);
const SourceKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9_-]{0,62}$/u),
  Schema.makeFilter(
    (value) =>
      !value.includes("--") &&
      !value.includes("__") &&
      !value.endsWith("-") &&
      !value.endsWith("_"),
  ),
);
const EnvironmentKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9-]{0,62}$/u),
  Schema.makeFilter((value) => !value.includes("--") && !value.endsWith("-")),
);
export const RelativeProjectPath = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(240),
  Schema.makeFilter((value) => {
    if (value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
    const segments = value.split("/");
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }),
);
const ApiBaseUrl = Schema.String.check(
  Schema.isMaxLength(2_048),
  Schema.makeFilter((value) => {
    try {
      const url = new URL(value);
      const local =
        url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
      return (
        (url.protocol === "https:" || (local && url.protocol === "http:")) &&
        url.username.length === 0 &&
        url.password.length === 0 &&
        url.search.length === 0 &&
        url.hash.length === 0 &&
        (url.pathname === "" || url.pathname === "/")
      );
    } catch {
      return false;
    }
  }),
);

const CliConfigBase = {
  apiBaseUrl: ApiBaseUrl,
  projectId: Uuid,
  environment: EnvironmentKey,
  output: RelativeProjectPath,
} as const;

export class CliConfigV1 extends Schema.Class<CliConfigV1>("CliConfigV1")(
  Schema.Struct({
    schemaVersion: Schema.Literal(1),
    ...CliConfigBase,
  }),
) {}

export class CliSchemaBuildConfig extends Schema.Class<CliSchemaBuildConfig>(
  "CliSchemaBuildConfig",
)(Schema.Struct({ entry: RelativeProjectPath })) {}

export class CliConfigV2 extends Schema.Class<CliConfigV2>("CliConfigV2")(
  Schema.Struct({
    schemaVersion: Schema.Literal(2),
    ...CliConfigBase,
    schema: RelativeProjectPath,
    schemaBuild: Schema.optionalKey(CliSchemaBuildConfig),
  }),
) {}

export const CliConfig = Schema.Union([CliConfigV1, CliConfigV2]).annotate({
  identifier: "CliConfig",
});
export type CliConfig = typeof CliConfig.Type;

export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export const JsonValue: Schema.Codec<JsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Number.check(Schema.isFinite()),
    Schema.String,
    Schema.Array(JsonValue),
    Schema.Record(Schema.String, JsonValue),
  ]),
);

export const FieldKind = Schema.Literals([
  "short_text",
  "long_text",
  "rich_text",
  "number",
  "decimal",
  "money",
  "boolean",
  "date",
  "date_time",
  "enum",
  "url",
  "email",
  "slug",
  "json",
  "object",
  "list",
  "reference",
  "external_asset",
]);
export type FieldKind = typeof FieldKind.Type;

export interface NormalizedContractFieldType {
  readonly id: string;
  readonly apiKey: string | null;
  readonly kind: FieldKind;
  readonly required: boolean | null;
  readonly localization: "localized" | "shared" | "mixed";
  readonly configuration: JsonValue;
  readonly children: ReadonlyArray<NormalizedContractFieldType>;
}

export const NormalizedContractField: Schema.Codec<NormalizedContractFieldType> = Schema.suspend(
  () =>
    Schema.Struct({
      id: Uuid,
      apiKey: Schema.NullOr(ApiKey),
      kind: FieldKind,
      required: Schema.NullOr(Schema.Boolean),
      localization: Schema.Literals(["localized", "shared", "mixed"]),
      configuration: JsonValue,
      children: Schema.Array(NormalizedContractField),
    }),
);

export class NormalizedCollectionContract extends Schema.Class<NormalizedCollectionContract>(
  "NormalizedCollectionContract",
)({
  formatVersion: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 2 })),
  validationProfile: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  currencyRegistryProfile: Schema.NullOr(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  ),
  collectionApiKey: ApiKey,
  fields: Schema.Array(NormalizedContractField).check(Schema.isMaxLength(100)),
}) {}

export class ToolingApiError extends Schema.Class<ToolingApiError>("ToolingApiError")({
  code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  details: Schema.optionalKey(Schema.Array(JsonValue).check(Schema.isMaxLength(50))),
  retryable: Schema.Boolean,
  requestId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
}) {}

export const ToolingFailureResponse = Schema.Struct({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: ToolingApiError,
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
});

export function ToolingSuccessResponse<A, I, R>(schema: Schema.Codec<A, I, R>) {
  return Schema.Struct({
    ok: Schema.Literal(true),
    data: schema,
    error: Schema.Null,
    message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  });
}

export class ToolingProject extends Schema.Class<ToolingProject>("ToolingProject")({
  id: Uuid,
  key: EnvironmentKey,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
}) {}

export class ToolingProjectPage extends Schema.Class<ToolingProjectPage>("ToolingProjectPage")({
  items: Schema.Array(ToolingProject).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512))),
}) {}

export class ToolingEnvironment extends Schema.Class<ToolingEnvironment>("ToolingEnvironment")({
  id: Uuid,
  key: EnvironmentKey,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  primary: Schema.Boolean,
}) {}

export class ToolingEnvironmentPage extends Schema.Class<ToolingEnvironmentPage>(
  "ToolingEnvironmentPage",
)({
  projectId: Uuid,
  items: Schema.Array(ToolingEnvironment).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512))),
}) {}

export class ToolingLocale extends Schema.Class<ToolingLocale>("ToolingLocale")({
  id: Uuid,
  tag: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
    Schema.isPattern(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u),
  ),
}) {}

export class ToolingCollectionSummary extends Schema.Class<ToolingCollectionSummary>(
  "ToolingCollectionSummary",
)({
  id: Uuid,
  key: ApiKey,
  revisionId: Uuid,
  revisionSequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  contractHash: Digest,
}) {}

export class ToolingManifestPage extends Schema.Class<ToolingManifestPage>("ToolingManifestPage")({
  projectId: Uuid,
  environmentId: Uuid,
  environmentKey: EnvironmentKey,
  locales: Schema.Array(ToolingLocale).check(Schema.isMaxLength(100)),
  localeContractHash: Digest,
  collections: Schema.Array(ToolingCollectionSummary).check(Schema.isMaxLength(50)),
  nextCursor: Schema.NullOr(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512))),
}) {}

export class ToolingCollectionRevision extends Schema.Class<ToolingCollectionRevision>(
  "ToolingCollectionRevision",
)({
  projectId: Uuid,
  environmentId: Uuid,
  environmentKey: EnvironmentKey,
  collectionId: Uuid,
  collectionKey: ApiKey,
  revisionId: Uuid,
  revisionSequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  contractHash: Digest,
  publishedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  ),
  contract: NormalizedCollectionContract,
}) {}

export class PulledToolingAuthority extends Schema.Class<PulledToolingAuthority>(
  "PulledToolingAuthority",
)({
  cacheVersion: Schema.Literal(1),
  manifest: ToolingManifestPage,
  revisions: Schema.Array(ToolingCollectionRevision),
}) {}

export class LockedCollection extends Schema.Class<LockedCollection>("LockedCollection")({
  id: Uuid,
  key: ApiKey,
  revisionId: Uuid,
  revisionSequence: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  contractHash: Digest,
  contract: NormalizedCollectionContract,
}) {}

export class GeneratedFileDigest extends Schema.Class<GeneratedFileDigest>("GeneratedFileDigest")({
  path: RelativeProjectPath,
  sha256: Digest,
}) {}

export class SchemaBuildInputDigest extends Schema.Class<SchemaBuildInputDigest>(
  "SchemaBuildInputDigest",
)({
  path: RelativeProjectPath,
  sha256: Digest,
}) {}

export class SchemaBuildManifest extends Schema.Class<SchemaBuildManifest>("SchemaBuildManifest")({
  formatVersion: Schema.Literal(1),
  runtime: Schema.Literal("quickjs-emscripten-0.32.0-experimental"),
  memoryLimitHard: Schema.Literal(false),
  typescriptVersion: Schema.Literal("6.0.3"),
  composePackage: Schema.Literal("@framerfordevs/schema/compose"),
  inputs: Schema.Array(SchemaBuildInputDigest).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  output: Schema.Struct({
    path: RelativeProjectPath,
    sha256: Digest,
  }),
}) {}

export class AuthoringLockedCollection extends Schema.Class<AuthoringLockedCollection>(
  "AuthoringLockedCollection",
)({ sourceKey: SourceKey, collectionId: Uuid, apiKey: ApiKey }) {}

export class AuthoringLockedField extends Schema.Class<AuthoringLockedField>(
  "AuthoringLockedField",
)({
  collectionSourceKey: SourceKey,
  sourceKey: SourceKey,
  fieldId: Uuid,
  apiKey: Schema.NullOr(ApiKey),
}) {}

export class AuthoringLockedEnumOption extends Schema.Class<AuthoringLockedEnumOption>(
  "AuthoringLockedEnumOption",
)({
  collectionSourceKey: SourceKey,
  fieldSourceKey: SourceKey,
  sourceKey: SourceKey,
  optionId: Uuid,
}) {}

export class AuthoringSchemaLock extends Schema.Class<AuthoringSchemaLock>("AuthoringSchemaLockV2")(
  Schema.Struct({
    lockVersion: Schema.Literal(2),
    authoringApi: Schema.Literal("authoring/v1"),
    projectId: Uuid,
    environmentId: Uuid,
    environmentKey: EnvironmentKey,
    projectSha256: Digest,
    schemaFileSha256: Digest,
    projectManifestHash: Digest,
    revisionIds: Schema.Record(SourceKey, Uuid),
    structureHashes: Schema.Record(SourceKey, Digest),
    contractHashes: Schema.Record(SourceKey, Digest),
    collections: Schema.Array(AuthoringLockedCollection).check(Schema.isMaxLength(100)),
    fields: Schema.Array(AuthoringLockedField).check(Schema.isMaxLength(10_000)),
    enumOptions: Schema.Array(AuthoringLockedEnumOption).check(Schema.isMaxLength(10_000)),
  }),
) {}

export const ContentMutationOperation = Schema.Literals([
  "entry.create",
  "entry.update",
  "entry.publish",
  "entry.unpublish",
]);
export type ContentMutationOperation = typeof ContentMutationOperation.Type;

export class ContentMutationRetryJournal extends Schema.Class<ContentMutationRetryJournal>(
  "ContentMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: ContentMutationOperation,
    commandId: Uuid,
    fingerprint: Digest,
  }),
) {}

export const ControlPlaneMutationOperation = Schema.Literals([
  "workspace.create",
  "project.create",
  "project.capability.enable",
  "studio_registration.put",
  "studio_registration.runtime.set",
  "project_locale.create",
  "invalidation_mapping.create",
  "webhook.delivery.replay",
]);
export type ControlPlaneMutationOperation = typeof ControlPlaneMutationOperation.Type;

export class ControlPlaneMutationRetryJournal extends Schema.Class<ControlPlaneMutationRetryJournal>(
  "ControlPlaneMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: ControlPlaneMutationOperation,
    commandId: Uuid,
    fingerprint: Digest,
  }),
) {}

export class SchemaMutationRetryJournal extends Schema.Class<SchemaMutationRetryJournal>(
  "SchemaMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: Schema.Literal("schema.apply"),
    commandId: Uuid,
    fingerprint: Digest,
  }),
) {}

export class PresentationMutationRetryJournal extends Schema.Class<PresentationMutationRetryJournal>(
  "PresentationMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: Schema.Literal("presentation.publish"),
    commandId: Uuid,
    fingerprint: Digest,
  }),
) {}

export class SchemaLock extends Schema.Class<SchemaLock>("SchemaLock")({
  lockVersion: Schema.Literal(1),
  generatorVersion: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  sdkCompatibility: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  toolingApi: Schema.Literal("tooling/v1"),
  projectId: Uuid,
  environmentId: Uuid,
  environmentKey: EnvironmentKey,
  locales: Schema.Array(ToolingLocale).check(Schema.isMaxLength(100)),
  localeContractHash: Digest,
  collections: Schema.Array(LockedCollection),
  files: Schema.Array(GeneratedFileDigest).check(Schema.isMinLength(6), Schema.isMaxLength(6)),
}) {}
