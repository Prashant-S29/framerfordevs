// Owns excluded schema and Presentation-mutation transport for CLI operator workflows.

import type { ProjectSchema } from "@framerfordevs/schema";
import { isProjectSchema } from "@framerfordevs/schema/validate";
import {
  AuthoringCollectionPresentation,
  AuthoringPresentationRevision,
  AuthoringPresentationSnapshot,
} from "@framerfordevs/sdk/authoring";
import { Schema } from "effect";

import type { JsonObject, JsonValue } from "../../schema";

export interface AuthoringOperatorClientOptions {
  readonly baseUrl: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly token: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

export interface AuthoringOperatorResponse<A> {
  readonly status: number;
  readonly body:
    | { readonly ok: true; readonly data: A; readonly error: null; readonly message: string }
    | {
        readonly ok: false;
        readonly data: null;
        readonly error: { readonly code: string };
        readonly message: string;
      }
    | null;
}

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
  identifier: "CliAuthoringProjectSchemaDocument",
});

export class AuthoringSchemaAuthority extends Schema.Class<AuthoringSchemaAuthority>(
  "CliAuthoringSchemaAuthority",
)({
  projectManifestHash: Digest,
  revisionIds: Schema.Record({ key: SourceKey, value: Uuid }),
}) {}

export class AuthoringSchemaPlanRequest extends Schema.Class<AuthoringSchemaPlanRequest>(
  "CliAuthoringSchemaPlanRequest",
)({ project: ProjectDocument }) {}

export class AuthoringSchemaApplyRequest extends Schema.Class<AuthoringSchemaApplyRequest>(
  "CliAuthoringSchemaApplyRequest",
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

export class AuthoringCollectionIdentity extends Schema.Class<AuthoringCollectionIdentity>(
  "CliAuthoringCollectionIdentity",
)({ sourceKey: SourceKey, collectionId: Uuid, apiKey: ApiKey }) {}

export class AuthoringFieldIdentity extends Schema.Class<AuthoringFieldIdentity>(
  "CliAuthoringFieldIdentity",
)({
  collectionSourceKey: SourceKey,
  sourceKey: SourceKey,
  fieldId: Uuid,
  apiKey: Schema.NullOr(ApiKey),
}) {}

export class AuthoringEnumOptionIdentity extends Schema.Class<AuthoringEnumOptionIdentity>(
  "CliAuthoringEnumOptionIdentity",
)({
  collectionSourceKey: SourceKey,
  fieldSourceKey: SourceKey,
  sourceKey: SourceKey,
  optionId: Uuid,
}) {}

export class AuthoringSchemaValidationIssue extends Schema.Class<AuthoringSchemaValidationIssue>(
  "CliAuthoringSchemaValidationIssue",
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
  "CliAuthoringSchemaChange",
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
).annotations({ identifier: "CliAuthoringSchemaCandidate" });

export class AuthoringAppliedRevision extends Schema.Class<AuthoringAppliedRevision>(
  "CliAuthoringAppliedRevision",
)({
  collectionSourceKey: SourceKey,
  collectionId: Uuid,
  revisionId: Uuid,
  structureHash: Digest,
  contractHash: Digest,
  changed: Schema.Boolean,
}) {}

export class AuthoringSchemaExport extends Schema.Class<AuthoringSchemaExport>(
  "CliAuthoringSchemaExport",
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
).annotations({ identifier: "CliAuthoringSchemaPlan" });

export class AuthoringSchemaApply extends Schema.Class<AuthoringSchemaApply>(
  "CliAuthoringSchemaApply",
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

export class AuthoringPublishPresentationRequest extends Schema.Class<AuthoringPublishPresentationRequest>(
  "CliAuthoringPublishPresentationRequest",
)({
  commandId: Uuid,
  expectedRevisionId: Uuid,
  expectedSequence: Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(1)),
  presentation: AuthoringCollectionPresentation,
}) {}

export class AuthoringPublishPresentationResult extends Schema.Class<AuthoringPublishPresentationResult>(
  "CliAuthoringPublishPresentationResult",
)({
  commandId: Uuid,
  replayed: Schema.Boolean,
  noOp: Schema.Boolean,
  revision: AuthoringPresentationRevision,
  presentation: AuthoringCollectionPresentation,
}) {}

const AuthoringErrorDetail = Schema.Struct({
  path: Schema.optionalWith(Schema.String.pipe(Schema.maxLength(256)), { exact: true }),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
  scope: Schema.optionalWith(Schema.Literal("shared", "localized"), { exact: true }),
  expectedVersion: Schema.optionalWith(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
    { exact: true },
  ),
  currentVersion: Schema.optionalWith(
    Schema.Number.pipe(Schema.int(), Schema.greaterThanOrEqualTo(0)),
    { exact: true },
  ),
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
const AuthoringPublicError = Schema.Struct({
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
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(jsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item)]));
  }
  throw new Error("CLI_AUTHORING_RESPONSE_INVALID");
}

function isJsonArray(value: JsonValue): value is ReadonlyArray<JsonValue> {
  return Array.isArray(value);
}

function jsonObject(value: unknown): JsonObject {
  const decoded = jsonValue(value);
  if (decoded === null || isJsonArray(decoded) || typeof decoded !== "object") {
    throw new Error("CLI_AUTHORING_RESPONSE_INVALID");
  }
  return decoded;
}

function requestBody<A, I>(schema: Schema.Schema<A, I, never>, value: unknown): JsonObject {
  return jsonObject(Schema.decodeUnknownSync(schema)(value, { onExcessProperty: "error" }));
}

function decodeEnvelope<A, I>(value: unknown, dataSchema: Schema.Schema<A, I, never>) {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    typeof value.ok !== "boolean" ||
    typeof value.message !== "string" ||
    !("data" in value) ||
    !("error" in value)
  ) {
    throw new Error("CLI_AUTHORING_RESPONSE_INVALID");
  }
  if (value.ok) {
    if (value.error !== null) throw new Error("CLI_AUTHORING_RESPONSE_INVALID");
    return {
      ok: true as const,
      data: Schema.decodeUnknownSync(dataSchema)(value.data, { onExcessProperty: "error" }),
      error: null,
      message: value.message,
    };
  }
  if (value.data !== null) throw new Error("CLI_AUTHORING_RESPONSE_INVALID");
  const error = Schema.decodeUnknownSync(AuthoringPublicError)(value.error, {
    onExcessProperty: "error",
  });
  return {
    ok: false as const,
    data: null,
    error: { code: error.code },
    message: value.message,
  };
}

function origin(value: string): URL {
  const url = new URL(value);
  const local =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    throw new Error("CLI_AUTHORING_ORIGIN_INVALID");
  }
  return url;
}

function segment<I>(schema: Schema.Schema<string, I, never>, value: unknown) {
  return encodeURIComponent(Schema.decodeUnknownSync(schema)(value));
}

function requestSignal(input: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return input === undefined ? timeout : AbortSignal.any([input, timeout]);
}

async function boundedBody(response: Response) {
  const length = response.headers.get("content-length");
  if (length !== null && Number(length) > maximumResponseBytes) {
    throw new Error("CLI_AUTHORING_RESPONSE_TOO_LARGE");
  }
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
        throw new Error("CLI_AUTHORING_RESPONSE_TOO_LARGE");
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

export function makeAuthoringOperatorClient(options: AuthoringOperatorClientOptions) {
  if (options.token.length < 1 || encoder.encode(options.token).byteLength > 16_384) {
    throw new Error("CLI_AUTHORING_TOKEN_INVALID");
  }
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error("CLI_AUTHORING_TIMEOUT_INVALID");
  }
  const base = origin(options.baseUrl);
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const root = `/api/authoring/v1/projects/${segment(Uuid, options.projectId)}/environments/${segment(Uuid, options.environmentId)}`;
  const request = async <A, I>(
    path: string,
    method: "GET" | "POST",
    body: JsonObject | undefined,
    dataSchema: Schema.Schema<A, I, never>,
  ): Promise<AuthoringOperatorResponse<A>> => {
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new Error("CLI_AUTHORING_ORIGIN_INVALID");
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized !== undefined && encoder.encode(serialized).byteLength > maximumRequestBytes) {
      throw new Error("CLI_AUTHORING_REQUEST_TOO_LARGE");
    }
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${options.token}`,
    });
    if (serialized !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetchImplementation(url, {
      method,
      headers,
      ...(serialized === undefined ? {} : { body: serialized }),
      redirect: "error",
      signal: requestSignal(undefined, timeoutMs),
    });
    const text = await boundedBody(response);
    return {
      status: response.status,
      body: text === "" ? null : decodeEnvelope(JSON.parse(text), dataSchema),
    };
  };
  const collectionPath = (collectionKey: string) =>
    `${root}/collections/${segment(ApiKey, collectionKey)}`;

  return {
    schema: {
      export: () => request(`${root}/schema/export`, "GET", undefined, AuthoringSchemaExport),
      plan: (body: AuthoringSchemaPlanRequest) =>
        request(
          `${root}/schema/plan`,
          "POST",
          requestBody(AuthoringSchemaPlanRequest, body),
          AuthoringSchemaPlan,
        ),
      apply: (body: AuthoringSchemaApplyRequest) =>
        request(
          `${root}/schema/apply`,
          "POST",
          requestBody(AuthoringSchemaApplyRequest, body),
          AuthoringSchemaApply,
        ),
    },
    presentation: {
      get: (collectionKey: string) =>
        request(
          `${collectionPath(collectionKey)}/presentation`,
          "GET",
          undefined,
          AuthoringPresentationSnapshot,
        ),
      publish: (collectionKey: string, body: AuthoringPublishPresentationRequest) =>
        request(
          `${collectionPath(collectionKey)}/presentation`,
          "POST",
          requestBody(AuthoringPublishPresentationRequest, body),
          AuthoringPublishPresentationResult,
        ),
    },
  };
}
