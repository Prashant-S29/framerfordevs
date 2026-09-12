// Defines strict, non-secret CLI config, Tooling wire, normalized contract, and lock formats.

import { Schema } from "effect";

const Uuid = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const Digest = Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u));
const ApiKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.filter((value) => !value.includes("__") && !value.endsWith("_")),
);
const SourceKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_-]{0,62}$/u),
  Schema.filter(
    (value) =>
      !value.includes("--") &&
      !value.includes("__") &&
      !value.endsWith("-") &&
      !value.endsWith("_"),
  ),
);
const EnvironmentKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9-]{0,62}$/u),
  Schema.filter((value) => !value.includes("--") && !value.endsWith("-")),
);
export const RelativeProjectPath = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(240),
  Schema.filter((value) => {
    if (value.includes("\\") || value.includes("\0") || value.startsWith("/")) return false;
    const segments = value.split("/");
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  }),
);
const ApiBaseUrl = Schema.String.pipe(
  Schema.maxLength(2_048),
  Schema.filter((value) => {
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
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class CliSchemaBuildConfig extends Schema.Class<CliSchemaBuildConfig>(
  "CliSchemaBuildConfig",
)(
  Schema.Struct({ entry: RelativeProjectPath }).annotations({
    parseOptions: { onExcessProperty: "error" },
  }),
) {}

export class CliConfigV2 extends Schema.Class<CliConfigV2>("CliConfigV2")(
  Schema.Struct({
    schemaVersion: Schema.Literal(2),
    ...CliConfigBase,
    schema: RelativeProjectPath,
    schemaBuild: Schema.optionalWith(CliSchemaBuildConfig, { exact: true }),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const CliConfig = Schema.Union(CliConfigV1, CliConfigV2).annotations({
  identifier: "CliConfig",
});
export type CliConfig = typeof CliConfig.Type;

export type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export const JsonValue: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.Boolean,
    Schema.Number.pipe(Schema.finite()),
    Schema.String,
    Schema.Array(JsonValue),
    Schema.Record({ key: Schema.String, value: JsonValue }),
  ),
);

export const FieldKind = Schema.Literal(
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
);
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

export const NormalizedContractField: Schema.Schema<NormalizedContractFieldType> = Schema.suspend(
  () =>
    Schema.Struct({
      id: Uuid,
      apiKey: Schema.NullOr(ApiKey),
      kind: FieldKind,
      required: Schema.NullOr(Schema.Boolean),
      localization: Schema.Literal("localized", "shared", "mixed"),
      configuration: JsonValue,
      children: Schema.Array(NormalizedContractField),
    }),
);

export class NormalizedCollectionContract extends Schema.Class<NormalizedCollectionContract>(
  "NormalizedCollectionContract",
)({
  formatVersion: Schema.Number.pipe(Schema.int(), Schema.between(1, 2)),
  validationProfile: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  currencyRegistryProfile: Schema.NullOr(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  ),
  collectionApiKey: ApiKey,
  fields: Schema.Array(NormalizedContractField).pipe(Schema.maxItems(100)),
}) {}

export class ToolingApiError extends Schema.Class<ToolingApiError>("ToolingApiError")({
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  details: Schema.optionalWith(Schema.Array(JsonValue).pipe(Schema.maxItems(50)), {
    exact: true,
  }),
  retryable: Schema.Boolean,
  requestId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
}) {}

export const ToolingFailureResponse = Schema.Struct({
  ok: Schema.Literal(false),
  data: Schema.Null,
  error: ToolingApiError,
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
});

export function ToolingSuccessResponse<A, I, R>(schema: Schema.Schema<A, I, R>) {
  return Schema.Struct({
    ok: Schema.Literal(true),
    data: schema,
    error: Schema.Null,
    message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  });
}

export class ToolingProject extends Schema.Class<ToolingProject>("ToolingProject")({
  id: Uuid,
  key: EnvironmentKey,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
}) {}

export class ToolingProjectPage extends Schema.Class<ToolingProjectPage>("ToolingProjectPage")({
  items: Schema.Array(ToolingProject).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512))),
}) {}

export class ToolingEnvironment extends Schema.Class<ToolingEnvironment>("ToolingEnvironment")({
  id: Uuid,
  key: EnvironmentKey,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  primary: Schema.Boolean,
}) {}

export class ToolingEnvironmentPage extends Schema.Class<ToolingEnvironmentPage>(
  "ToolingEnvironmentPage",
)({
  projectId: Uuid,
  items: Schema.Array(ToolingEnvironment).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512))),
}) {}

export class ToolingLocale extends Schema.Class<ToolingLocale>("ToolingLocale")({
  id: Uuid,
  tag: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u),
  ),
}) {}

export class ToolingCollectionSummary extends Schema.Class<ToolingCollectionSummary>(
  "ToolingCollectionSummary",
)({
  id: Uuid,
  key: ApiKey,
  revisionId: Uuid,
  revisionSequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  contractHash: Digest,
}) {}

export class ToolingManifestPage extends Schema.Class<ToolingManifestPage>("ToolingManifestPage")({
  projectId: Uuid,
  environmentId: Uuid,
  environmentKey: EnvironmentKey,
  locales: Schema.Array(ToolingLocale).pipe(Schema.maxItems(100)),
  localeContractHash: Digest,
  collections: Schema.Array(ToolingCollectionSummary).pipe(Schema.maxItems(50)),
  nextCursor: Schema.NullOr(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512))),
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
  revisionSequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  contractHash: Digest,
  publishedAt: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)),
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
  revisionSequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
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
  inputs: Schema.Array(SchemaBuildInputDigest).pipe(Schema.minItems(1), Schema.maxItems(32)),
  output: Schema.Struct({
    path: RelativeProjectPath,
    sha256: Digest,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
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
    revisionIds: Schema.Record({
      key: SourceKey,
      value: Uuid,
    }),
    structureHashes: Schema.Record({ key: SourceKey, value: Digest }),
    contractHashes: Schema.Record({ key: SourceKey, value: Digest }),
    collections: Schema.Array(AuthoringLockedCollection).pipe(Schema.maxItems(100)),
    fields: Schema.Array(AuthoringLockedField).pipe(Schema.maxItems(10_000)),
    enumOptions: Schema.Array(AuthoringLockedEnumOption).pipe(Schema.maxItems(10_000)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const ContentMutationOperation = Schema.Literal(
  "entry.create",
  "entry.update",
  "entry.publish",
  "entry.unpublish",
);
export type ContentMutationOperation = typeof ContentMutationOperation.Type;

export class ContentMutationRetryJournal extends Schema.Class<ContentMutationRetryJournal>(
  "ContentMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: ContentMutationOperation,
    commandId: Uuid,
    fingerprint: Digest,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const ControlPlaneMutationOperation = Schema.Literal(
  "workspace.create",
  "project.create",
  "project.capability.enable",
  "studio_registration.put",
);
export type ControlPlaneMutationOperation = typeof ControlPlaneMutationOperation.Type;

export class ControlPlaneMutationRetryJournal extends Schema.Class<ControlPlaneMutationRetryJournal>(
  "ControlPlaneMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: ControlPlaneMutationOperation,
    commandId: Uuid,
    fingerprint: Digest,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class SchemaMutationRetryJournal extends Schema.Class<SchemaMutationRetryJournal>(
  "SchemaMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: Schema.Literal("schema.apply"),
    commandId: Uuid,
    fingerprint: Digest,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class PresentationMutationRetryJournal extends Schema.Class<PresentationMutationRetryJournal>(
  "PresentationMutationRetryJournal",
)(
  Schema.Struct({
    formatVersion: Schema.Literal(1),
    operation: Schema.Literal("presentation.publish"),
    commandId: Uuid,
    fingerprint: Digest,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class SchemaLock extends Schema.Class<SchemaLock>("SchemaLock")({
  lockVersion: Schema.Literal(1),
  generatorVersion: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(32)),
  sdkCompatibility: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(32)),
  toolingApi: Schema.Literal("tooling/v1"),
  projectId: Uuid,
  environmentId: Uuid,
  environmentKey: EnvironmentKey,
  locales: Schema.Array(ToolingLocale).pipe(Schema.maxItems(100)),
  localeContractHash: Digest,
  collections: Schema.Array(LockedCollection),
  files: Schema.Array(GeneratedFileDigest).pipe(Schema.minItems(6), Schema.maxItems(6)),
}) {}
