const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const localeTag = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const hash = /^[0-9a-f]{64}$/u;
const cursor = /^[A-Za-z0-9_-]{1,1024}$/u;
const issueCode = /^[a-z][a-z0-9_]{0,63}$/u;
const maximumResponseBytes = 4 * 1_024 * 1_024;

const fieldKinds = new Set([
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

const configurationKeys: Readonly<Record<string, ReadonlyArray<string>>> = {
  short_text: ["minLength", "maxLength", "pattern", "default"],
  long_text: ["minLength", "maxLength", "pattern", "default"],
  rich_text: ["styles", "decorators", "links", "lists", "minLength", "maxLength", "default"],
  number: ["mode", "minimum", "maximum", "default"],
  decimal: ["precision", "scale", "minimum", "maximum", "default"],
  money: ["currencies", "allowNegative", "default"],
  boolean: ["default"],
  date: ["minimum", "maximum", "default"],
  date_time: ["minimum", "maximum", "default"],
  enum: ["options", "default"],
  url: ["default"],
  email: ["default"],
  slug: ["minLength", "maxLength", "pattern", "default"],
  json: ["maxBytes", "maxDepth", "default"],
  object: ["default"],
  list: ["minItems", "maxItems", "uniqueItems", "default"],
  reference: ["targetCollectionId"],
  external_asset: ["default"],
};

const forbiddenKeys = new Set([
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "apikey",
  "sourcekey",
  "visibletoroles",
  "editablebyroles",
  "credential",
  "roles",
  "rawactions",
  "membershipmetadata",
  "proto",
  "prototype",
  "constructor",
]);

export type StudioJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<StudioJsonValue>
  | StudioJsonObject;
export interface StudioJsonObject {
  readonly [key: string]: StudioJsonValue;
}

export interface StudioContentCapabilities {
  readonly canCreate: boolean;
  readonly canRename: boolean;
  readonly canSaveLocalized: boolean;
  readonly canSaveShared: boolean;
  readonly canPublish: boolean;
  readonly canPublishPresentation: boolean;
}

export interface StudioContentContextDto {
  readonly locales: ReadonlyArray<{
    readonly id: string;
    readonly tag: string;
    readonly displayName: string;
    readonly canRead: true;
    readonly canWrite: boolean;
    readonly canPublish: boolean;
  }>;
  readonly collections: ReadonlyArray<{
    readonly id: string;
    readonly displayName: string;
    readonly capabilities: StudioContentCapabilities;
  }>;
  readonly configurationNotices: ReadonlyArray<{
    readonly collectionId: string;
    readonly displayName: string;
    readonly reason: "empty_schema" | "projection_invalid";
  }>;
}

export interface StudioEntrySummaryDto {
  readonly id: string;
  readonly displayName: string;
  readonly nameVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioEntryPageDto {
  readonly items: ReadonlyArray<StudioEntrySummaryDto>;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly count: Readonly<{
    readonly value: number;
    readonly relation: "exact" | "at_least";
  }>;
}

export interface StudioResolvedEntryLabelsDto {
  readonly items: ReadonlyArray<{ readonly id: string; readonly displayName: string }>;
}

export interface StudioFormFieldDto {
  readonly id: string;
  readonly parentFieldId: string | null;
  readonly nodeRole: "root" | "object_property" | "list_item";
  readonly displayLabel: string | null;
  readonly kind: string;
  readonly required: boolean | null;
  readonly localization: "shared" | "localized" | "mixed" | null;
  readonly position: number;
  readonly helpText: string | null;
  readonly placeholder: string | null;
  readonly configuration: StudioJsonObject;
  readonly children: ReadonlyArray<StudioFormFieldDto>;
}

export interface StudioFormGroupDto {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly columns: 1 | 2;
  readonly fields: ReadonlyArray<{
    readonly id: string;
    readonly fieldId: string;
    readonly position: number;
    readonly helpTextOverride: string | null;
  }>;
}

export interface StudioFormDto {
  readonly collectionId: string;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly canEdit: boolean;
  readonly fields: ReadonlyArray<StudioFormFieldDto>;
  readonly editableFieldIds: ReadonlyArray<string>;
  readonly tabs: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
    readonly position: number;
    readonly groups: ReadonlyArray<StudioFormGroupDto>;
  }>;
  readonly sidebarGroups: ReadonlyArray<StudioFormGroupDto>;
  readonly currencyMinorUnits: Readonly<Record<string, number>>;
}

export interface StudioValidationDto {
  readonly status: "valid" | "invalid" | "restricted_issues";
  readonly issues: ReadonlyArray<{
    readonly fieldId: string;
    readonly path: string;
    readonly scope: "shared" | "localized";
    readonly localeId: string | null;
    readonly locale: string | null;
    readonly code: string;
    readonly message: string;
  }>;
  readonly capped: boolean;
}

export interface StudioNewEntryWorkspaceDto {
  readonly localeId: string;
  readonly locale: string;
  readonly form: StudioFormDto;
  readonly capabilities: StudioContentCapabilities;
}

export interface StudioEntryWorkspaceDto extends StudioNewEntryWorkspaceDto {
  readonly draft: Readonly<{
    readonly entry: StudioEntrySummaryDto;
    readonly schemaRevisionId: string;
    readonly contractHash: string;
    readonly sharedVersion: number;
    readonly sharedRevisionId: string | null;
    readonly sharedValues: StudioJsonObject;
    readonly localizedVersion: number;
    readonly localizedRevisionId: string | null;
    readonly localizedValues: StudioJsonObject;
    readonly validation: StudioValidationDto;
  }>;
  readonly publication: StudioPublicationStatusDto;
}

export type StudioRevisionScope = "shared" | "localized";

export interface StudioRevisionSummaryDto {
  readonly id: string;
  readonly scope: StudioRevisionScope;
  readonly sequence: number;
  readonly previousRevisionId: string | null;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly changedFieldIds: ReadonlyArray<string>;
  readonly restoredFromRevisionId: string | null;
  readonly authoredByUserId: string | null;
  readonly authoredByCredentialId: string | null;
  readonly authoredAt: string;
  readonly compatible: boolean;
}

export interface StudioRevisionPageDto {
  readonly items: ReadonlyArray<StudioRevisionSummaryDto>;
  readonly nextCursor: string | null;
}

export interface StudioRevisionDto {
  readonly revision: StudioRevisionSummaryDto;
  readonly values: StudioJsonObject;
}

export interface StudioRevisionComparisonItemDto {
  readonly fieldId: string;
  readonly change: "added" | "removed" | "changed";
  readonly before?: StudioJsonValue;
  readonly after?: StudioJsonValue;
  readonly inCurrentSchema: boolean;
}

export interface StudioRevisionComparisonDto {
  readonly from: StudioRevisionSummaryDto;
  readonly to: StudioRevisionSummaryDto;
  readonly items: ReadonlyArray<StudioRevisionComparisonItemDto>;
  readonly restrictedChanges: boolean;
  readonly schemaDiffers: boolean;
}

export interface StudioPublicationSummaryDto {
  readonly id: string;
  readonly sequence: number;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly changedFieldIds: ReadonlyArray<string>;
  readonly publishedAt: string;
  readonly current: boolean;
}

export interface StudioPublicationStatusDto {
  readonly state: "published" | "unpublished" | "never_published";
  readonly stateVersion: number;
  readonly currentPublication: StudioPublicationSummaryDto | null;
  readonly sharedChanged: boolean;
  readonly localizedChanged: boolean;
  readonly schemaChanged: boolean;
  readonly changedSincePublication: boolean;
}

export interface StudioPublicationPageDto {
  readonly items: ReadonlyArray<StudioPublicationSummaryDto>;
  readonly nextCursor: string | null;
}

export interface StudioPublicationPlanDto {
  readonly authorityHash: string | null;
  readonly stateVersion: number;
  readonly currentPublicationId: string | null;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly sharedVersion: number;
  readonly sharedRevisionId: string | null;
  readonly localizedVersion: number;
  readonly localizedRevisionId: string | null;
  readonly wouldCreatePublication: boolean;
  readonly validation: StudioValidationDto;
  readonly entryIssues: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

export interface StudioDeliveryReadBackDto {
  readonly status: "verified" | "superseded";
  readonly currentPublicationId: string | null;
}

export interface StudioPublishResultDto {
  readonly commandId: string;
  readonly resultKind: "changed" | "no_op";
  readonly stateVersion: number;
  readonly publication: StudioPublicationSummaryDto;
  readonly delivery: StudioDeliveryReadBackDto;
}

export interface StudioUnpublishResultDto {
  readonly commandId: string;
  readonly resultKind: "changed" | "no_op";
  readonly stateVersion: number;
  readonly unpublishedPublicationId: string | null;
  readonly unpublishedAt: string;
  readonly delivery: StudioDeliveryReadBackDto;
}

export interface StudioCreateEntryResultDto {
  readonly entry: StudioEntrySummaryDto;
  readonly commandId: string;
  readonly sharedVersion: number;
  readonly sharedRevisionId: string | null;
  readonly localizedVersion: number;
  readonly localizedRevisionId: string | null;
  readonly validation: StudioValidationDto;
}

export interface StudioMutationReceiptDto {
  readonly entryId: string;
  readonly commandId: string;
  readonly sharedChanged: boolean;
  readonly sharedVersion: number;
  readonly sharedRevisionId: string | null;
  readonly localizedChanged: boolean;
  readonly localizedVersion: number;
  readonly localizedRevisionId: string | null;
  readonly validation: StudioValidationDto;
}

export type StudioContentBrowserErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STUDIO_COLLECTION_CONFIGURATION_INVALID"
  | "LOCALE_UNAVAILABLE"
  | "CMS_CAPABILITY_REQUIRED"
  | "STUDIO_REGISTRATION_INACTIVE"
  | "STUDIO_AUTHORITY_CHANGED"
  | "STUDIO_GRANT_INVALID"
  | "STALE_SCHEMA"
  | "DRAFT_VERSION_CONFLICT"
  | "NAME_VERSION_CONFLICT"
  | "COMMAND_CONFLICT"
  | "REVISION_INCOMPATIBLE"
  | "PUBLICATION_INVALID"
  | "PUBLICATION_STATE_CONFLICT"
  | "PRESENTATION_ROLE_VISIBILITY_FORBIDDEN"
  | "PRESENTATION_SCOPE_RESTRICTED"
  | "PUBLISHED_SCHEMA_REQUIRED"
  | "INVALID_CURSOR"
  | "STALE_CURSOR"
  | "REQUEST_TOO_LARGE"
  | "STUDIO_RESPONSE_TOO_LARGE"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "STUDIO_AUTH_REQUIRED"
  | "STUDIO_REQUEST_INVALID"
  | "STUDIO_ORIGIN_INVALID"
  | "STUDIO_SESSION_INVALID"
  | "STUDIO_UPSTREAM_UNAVAILABLE"
  | "STUDIO_CONFIGURATION_INVALID"
  | "STUDIO_ROUTE_NOT_FOUND"
  | "STUDIO_RATE_LIMITED"
  | "STUDIO_FORBIDDEN"
  | "STUDIO_PROJECT_UNAVAILABLE"
  | "STUDIO_CMS_DISABLED";

export interface StudioContentBrowserFailure {
  readonly ok: false;
  readonly data: null;
  readonly error: Readonly<{
    readonly code: StudioContentBrowserErrorCode;
    readonly message: string;
    readonly retryable?: boolean;
    readonly requestId?: string;
    readonly configurationReason?: "empty_schema" | "projection_invalid";
    readonly details?: ReadonlyArray<StudioJsonObject>;
  }>;
  readonly message: string;
}

export interface StudioContentRouteExpectation {
  readonly collectionId?: string;
  readonly locale?: string;
  readonly entryId?: string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Readonly<Record<string, unknown>>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).toSorted().join(",") === [...keys].toSorted().join(",");
}

function boundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function integer(
  value: unknown,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function validLocale(value: unknown): value is string {
  return boundedString(value, 2, 35) && localeTag.test(value);
}

function safeKey(key: string): boolean {
  return !forbiddenKeys.has(key.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/gu, ""));
}

function copyJson(value: unknown, depth = 0, budget = { nodes: 0 }): StudioJsonValue {
  budget.nodes += 1;
  if (depth > 24 || budget.nodes > 10_000) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => copyJson(item, depth + 1, budget));
  if (!isRecord(value)) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  const result: Record<string, StudioJsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!safeKey(key)) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    result[key] = copyJson(item, depth + 1, budget);
  }
  return result;
}

function copyJsonObject(value: unknown): StudioJsonObject {
  if (!isRecord(value)) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  const result: Record<string, StudioJsonValue> = {};
  const budget = { nodes: 1 };
  for (const [key, item] of Object.entries(value)) {
    if (!safeKey(key)) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    result[key] = copyJson(item, 1, budget);
  }
  return result;
}

function capabilities(value: unknown): StudioContentCapabilities {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "canCreate",
      "canRename",
      "canSaveLocalized",
      "canSaveShared",
      "canPublish",
      "canPublishPresentation",
    ]) ||
    typeof value.canCreate !== "boolean" ||
    typeof value.canRename !== "boolean" ||
    typeof value.canSaveLocalized !== "boolean" ||
    typeof value.canSaveShared !== "boolean" ||
    typeof value.canPublish !== "boolean" ||
    typeof value.canPublishPresentation !== "boolean"
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return {
    canCreate: value.canCreate,
    canRename: value.canRename,
    canSaveLocalized: value.canSaveLocalized,
    canSaveShared: value.canSaveShared,
    canPublish: value.canPublish,
    canPublishPresentation: value.canPublishPresentation,
  };
}

function entrySummary(value: unknown): StudioEntrySummaryDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["id", "displayName", "nameVersion", "createdAt", "updatedAt"]) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    !boundedString(value.displayName, 1, 100) ||
    !integer(value.nameVersion, 1) ||
    typeof value.createdAt !== "string" ||
    !isoDateTime.test(value.createdAt) ||
    typeof value.updatedAt !== "string" ||
    !isoDateTime.test(value.updatedAt)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return {
    id: value.id,
    displayName: value.displayName,
    nameVersion: value.nameVersion,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function optionalInteger(value: unknown): boolean {
  return value === undefined || Number.isSafeInteger(value);
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function optionalString(value: unknown, maximum: number): boolean {
  return value === undefined || boundedString(value, 0, maximum);
}

const exactDecimal = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;
const exactDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const enumValue = /^[a-z][a-z0-9_]{0,62}$/u;
const portableTextKey = /^[A-Za-z0-9_-]+$/u;

function optionalPattern(value: unknown, pattern: RegExp, maximum: number): boolean {
  return value === undefined || (boundedString(value, 1, maximum) && pattern.test(value));
}

function portableText(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["version", "profile", "blocks"]) ||
    value.version !== 1 ||
    value.profile !== "ffd-portable-text" ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > 500
  ) {
    return false;
  }
  return value.blocks.every(
    (block) =>
      isRecord(block) &&
      Object.keys(block).every((key) =>
        ["_key", "_type", "style", "listItem", "level", "children", "markDefs"].includes(key),
      ) &&
      ["_key", "_type", "style", "children", "markDefs"].every((key) => key in block) &&
      boundedString(block._key, 1, 64) &&
      portableTextKey.test(block._key) &&
      block._type === "block" &&
      ["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"].includes(String(block.style)) &&
      (block.listItem === undefined ||
        block.listItem === "bullet" ||
        block.listItem === "number") &&
      (block.level === undefined || block.level === 1 || block.level === 2 || block.level === 3) &&
      Array.isArray(block.children) &&
      block.children.length <= 5_000 &&
      block.children.every(
        (span) =>
          isRecord(span) &&
          exactKeys(span, ["_key", "_type", "text", "marks"]) &&
          boundedString(span._key, 1, 64) &&
          portableTextKey.test(span._key) &&
          span._type === "span" &&
          boundedString(span.text, 0, 100_000) &&
          Array.isArray(span.marks) &&
          span.marks.length <= 32 &&
          span.marks.every((mark) => boundedString(mark, 1, 64)),
      ) &&
      Array.isArray(block.markDefs) &&
      block.markDefs.length <= 1_000 &&
      block.markDefs.every(
        (definition) =>
          isRecord(definition) &&
          exactKeys(definition, ["_key", "_type", "href"]) &&
          boundedString(definition._key, 1, 64) &&
          portableTextKey.test(definition._key) &&
          definition._type === "link" &&
          boundedString(definition.href, 1, 2_048),
      ),
  );
}

function externalAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, ["source", "url", "kind", "title", "alt", "width", "height"]) &&
    value.source === "external" &&
    boundedString(value.url, 1, 2_048) &&
    ["image", "video", "audio", "document", "archive", "other"].includes(String(value.kind)) &&
    (value.title === null || boundedString(value.title, 0, 500)) &&
    (value.alt === null || boundedString(value.alt, 0, 500)) &&
    (value.width === null || integer(value.width, 1, 100_000)) &&
    (value.height === null || integer(value.height, 1, 100_000))
  );
}

function validConfiguration(kind: string, value: Readonly<Record<string, unknown>>): boolean {
  switch (kind) {
    case "short_text":
    case "long_text":
    case "slug":
      return (
        optionalInteger(value.minLength) &&
        optionalInteger(value.maxLength) &&
        optionalString(value.pattern, 256) &&
        optionalString(value.default, kind === "long_text" ? 50_000 : kind === "slug" ? 200 : 500)
      );
    case "rich_text":
      return (
        (value.styles === undefined ||
          (Array.isArray(value.styles) &&
            value.styles.every((item) =>
              ["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"].includes(String(item)),
            ))) &&
        (value.decorators === undefined ||
          (Array.isArray(value.decorators) &&
            value.decorators.every((item) =>
              ["strong", "em", "underline", "strike-through", "code"].includes(String(item)),
            ))) &&
        (value.links === undefined || typeof value.links === "boolean") &&
        (value.lists === undefined ||
          (Array.isArray(value.lists) &&
            value.lists.every((item) => item === "bullet" || item === "number"))) &&
        optionalInteger(value.minLength) &&
        optionalInteger(value.maxLength) &&
        (value.default === undefined || portableText(value.default))
      );
    case "number":
      return (
        (value.mode === undefined || value.mode === "integer" || value.mode === "floating_point") &&
        optionalNumber(value.minimum) &&
        optionalNumber(value.maximum) &&
        optionalNumber(value.default)
      );
    case "decimal":
      return (
        (value.precision === undefined || integer(value.precision, 1, 38)) &&
        (value.scale === undefined || integer(value.scale, 0, 18)) &&
        optionalPattern(value.minimum, exactDecimal, 58) &&
        optionalPattern(value.maximum, exactDecimal, 58) &&
        optionalPattern(value.default, exactDecimal, 58)
      );
    case "money":
      return (
        Array.isArray(value.currencies) &&
        value.currencies.length >= 1 &&
        value.currencies.length <= 50 &&
        value.currencies.every(
          (currency) => typeof currency === "string" && /^[A-Z]{3}$/u.test(currency),
        ) &&
        new Set(value.currencies).size === value.currencies.length &&
        (value.allowNegative === undefined || typeof value.allowNegative === "boolean") &&
        (value.default === undefined ||
          (isRecord(value.default) &&
            exactKeys(value.default, ["amount", "currency"]) &&
            boundedString(value.default.amount, 1, 58) &&
            exactDecimal.test(value.default.amount) &&
            typeof value.default.currency === "string" &&
            /^[A-Z]{3}$/u.test(value.default.currency)))
      );
    case "boolean":
      return value.default === undefined || typeof value.default === "boolean";
    case "date":
      return (
        optionalPattern(value.minimum, exactDate, 10) &&
        optionalPattern(value.maximum, exactDate, 10) &&
        optionalPattern(value.default, exactDate, 10)
      );
    case "date_time":
      return [value.minimum, value.maximum, value.default].every(
        (item) => item === undefined || (boundedString(item, 1, 35) && isoDateTime.test(item)),
      );
    case "enum": {
      if (!Array.isArray(value.options) || value.options.length < 1 || value.options.length > 100)
        return false;
      const optionsValid = value.options.every(
        (option) =>
          isRecord(option) &&
          exactKeys(option, ["id", "value", "label", "position"]) &&
          typeof option.id === "string" &&
          uuid.test(option.id) &&
          boundedString(option.value, 1, 63) &&
          enumValue.test(option.value) &&
          boundedString(option.label, 1, 100) &&
          integer(option.position, 0, 99),
      );
      const ids = value.options.flatMap((option) =>
        isRecord(option) && typeof option.id === "string" ? [option.id] : [],
      );
      const values = value.options.flatMap((option) =>
        isRecord(option) && typeof option.value === "string" ? [option.value] : [],
      );
      return (
        optionsValid &&
        new Set(ids).size === ids.length &&
        new Set(values).size === values.length &&
        optionalPattern(value.default, enumValue, 63)
      );
    }
    case "url":
      return optionalString(value.default, 2_048);
    case "email":
      return optionalString(value.default, 254);
    case "json":
      return optionalInteger(value.maxBytes) && optionalInteger(value.maxDepth);
    case "object":
      return true;
    case "list":
      return (
        optionalInteger(value.minItems) &&
        optionalInteger(value.maxItems) &&
        (value.uniqueItems === undefined || typeof value.uniqueItems === "boolean")
      );
    case "reference":
      return typeof value.targetCollectionId === "string" && uuid.test(value.targetCollectionId);
    case "external_asset":
      return value.default === undefined || externalAsset(value.default);
    default:
      return false;
  }
}

function configuration(kind: string, value: unknown): StudioJsonObject {
  if (!isRecord(value)) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  const allowed = configurationKeys[kind];
  if (
    allowed === undefined ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    !validConfiguration(kind, value)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return copyJsonObject(value);
}

interface FieldCollection {
  readonly fields: ReadonlyArray<StudioFormFieldDto>;
  readonly ids: Set<string>;
  readonly rootIds: Set<string>;
}

function formFields(value: unknown): FieldCollection {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  const ids = new Set<string>();
  const rootIds = new Set<string>();
  let nodes = 0;
  const decode = (
    input: unknown,
    parent: StudioFormFieldDto | null,
    depth: number,
  ): StudioFormFieldDto => {
    nodes += 1;
    if (
      nodes > 100 ||
      depth > 24 ||
      !isRecord(input) ||
      !exactKeys(input, [
        "id",
        "parentFieldId",
        "nodeRole",
        "displayLabel",
        "kind",
        "required",
        "localization",
        "position",
        "helpText",
        "placeholder",
        "configuration",
        "children",
      ]) ||
      typeof input.id !== "string" ||
      !uuid.test(input.id) ||
      ids.has(input.id) ||
      typeof input.kind !== "string" ||
      !fieldKinds.has(input.kind) ||
      !(input.displayLabel === null || boundedString(input.displayLabel, 1, 100)) ||
      !(input.required === null || typeof input.required === "boolean") ||
      !(
        input.localization === null ||
        input.localization === "shared" ||
        input.localization === "localized" ||
        input.localization === "mixed"
      ) ||
      !integer(input.position, 0, 99) ||
      !(input.helpText === null || boundedString(input.helpText, 0, 500)) ||
      !(input.placeholder === null || boundedString(input.placeholder, 0, 200)) ||
      !Array.isArray(input.children) ||
      input.children.length > 100
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    const expectedRole =
      parent === null ? "root" : parent.kind === "list" ? "list_item" : "object_property";
    if (
      input.nodeRole !== expectedRole ||
      (parent === null
        ? input.parentFieldId !== null
        : input.parentFieldId !== parent.id || (parent.kind !== "object" && parent.kind !== "list"))
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    ids.add(input.id);
    if (parent === null) rootIds.add(input.id);
    const base: StudioFormFieldDto = {
      id: input.id,
      parentFieldId: parent?.id ?? null,
      nodeRole: expectedRole,
      displayLabel: input.displayLabel,
      kind: input.kind,
      required: input.required,
      localization: input.localization,
      position: input.position,
      helpText: input.helpText,
      placeholder: input.placeholder,
      configuration: configuration(input.kind, input.configuration),
      children: [],
    };
    const children = input.children.map((child) => decode(child, base, depth + 1));
    if (
      ((input.kind === "object" || input.kind === "list") && children.length === 0) ||
      (input.kind === "list" && children.length !== 1) ||
      (input.kind !== "object" && input.kind !== "list" && children.length !== 0)
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    return { ...base, children };
  };
  return { fields: value.map((field) => decode(field, null, 0)), ids, rootIds };
}

function group(
  value: unknown,
  rootIds: ReadonlySet<string>,
  placementIds: Set<string>,
  placedFieldIds: Set<string>,
): StudioFormGroupDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["id", "title", "description", "position", "columns", "fields"]) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    !boundedString(value.title, 1, 100) ||
    !(value.description === null || boundedString(value.description, 0, 500)) ||
    !integer(value.position, 0, 19) ||
    (value.columns !== 1 && value.columns !== 2) ||
    !Array.isArray(value.fields) ||
    value.fields.length < 1 ||
    value.fields.length > 100
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    position: value.position,
    columns: value.columns,
    fields: value.fields.map((placement) => {
      if (
        !isRecord(placement) ||
        !exactKeys(placement, ["id", "fieldId", "position", "helpTextOverride"]) ||
        typeof placement.id !== "string" ||
        !uuid.test(placement.id) ||
        placementIds.has(placement.id) ||
        typeof placement.fieldId !== "string" ||
        !rootIds.has(placement.fieldId) ||
        placedFieldIds.has(placement.fieldId) ||
        !integer(placement.position, 0, 99) ||
        !(placement.helpTextOverride === null || boundedString(placement.helpTextOverride, 0, 500))
      ) {
        throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
      }
      placementIds.add(placement.id);
      placedFieldIds.add(placement.fieldId);
      return {
        id: placement.id,
        fieldId: placement.fieldId,
        position: placement.position,
        helpTextOverride: placement.helpTextOverride,
      };
    }),
  };
}

function form(value: unknown): StudioFormDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "collectionId",
      "schemaRevisionId",
      "contractHash",
      "canEdit",
      "fields",
      "editableFieldIds",
      "tabs",
      "sidebarGroups",
      "currencyMinorUnits",
    ]) ||
    typeof value.collectionId !== "string" ||
    !uuid.test(value.collectionId) ||
    typeof value.schemaRevisionId !== "string" ||
    !uuid.test(value.schemaRevisionId) ||
    typeof value.contractHash !== "string" ||
    !hash.test(value.contractHash) ||
    typeof value.canEdit !== "boolean" ||
    !Array.isArray(value.editableFieldIds) ||
    value.editableFieldIds.length > 100 ||
    !Array.isArray(value.tabs) ||
    value.tabs.length > 10 ||
    !Array.isArray(value.sidebarGroups) ||
    value.sidebarGroups.length > 10 ||
    (value.tabs.length === 0 && value.sidebarGroups.length === 0) ||
    !isRecord(value.currencyMinorUnits)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const decodedFields = formFields(value.fields);
  const editableFieldIds = value.editableFieldIds.map((fieldId) => {
    if (typeof fieldId !== "string" || !decodedFields.ids.has(fieldId)) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    return fieldId;
  });
  if (new Set(editableFieldIds).size !== editableFieldIds.length) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const placementIds = new Set<string>();
  const placedFieldIds = new Set<string>();
  const tabs = value.tabs.map((tab) => {
    if (
      !isRecord(tab) ||
      !exactKeys(tab, ["id", "title", "description", "position", "groups"]) ||
      typeof tab.id !== "string" ||
      !uuid.test(tab.id) ||
      !boundedString(tab.title, 1, 100) ||
      !(tab.description === null || boundedString(tab.description, 0, 500)) ||
      !integer(tab.position, 0, 9) ||
      !Array.isArray(tab.groups) ||
      tab.groups.length < 1 ||
      tab.groups.length > 20
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    return {
      id: tab.id,
      title: tab.title,
      description: tab.description,
      position: tab.position,
      groups: tab.groups.map((item) =>
        group(item, decodedFields.rootIds, placementIds, placedFieldIds),
      ),
    };
  });
  const sidebarGroups = value.sidebarGroups.map((item) =>
    group(item, decodedFields.rootIds, placementIds, placedFieldIds),
  );
  if (placedFieldIds.size !== decodedFields.rootIds.size) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const currencyMinorUnits: Record<string, number> = {};
  for (const [currency, units] of Object.entries(value.currencyMinorUnits)) {
    if (!/^[A-Z]{3}$/u.test(currency) || !integer(units, 0, 3)) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    currencyMinorUnits[currency] = units;
  }
  return {
    collectionId: value.collectionId,
    schemaRevisionId: value.schemaRevisionId,
    contractHash: value.contractHash,
    canEdit: value.canEdit,
    fields: decodedFields.fields,
    editableFieldIds,
    tabs,
    sidebarGroups,
    currencyMinorUnits,
  };
}

function validation(value: unknown, visibleFieldIds: ReadonlySet<string>): StudioValidationDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["status", "issues", "capped"]) ||
    (value.status !== "valid" &&
      value.status !== "invalid" &&
      value.status !== "restricted_issues") ||
    !Array.isArray(value.issues) ||
    value.issues.length > 50 ||
    typeof value.capped !== "boolean"
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const issues = value.issues.map((issue) => {
    if (
      !isRecord(issue) ||
      !exactKeys(issue, ["fieldId", "path", "scope", "localeId", "locale", "code", "message"]) ||
      typeof issue.fieldId !== "string" ||
      !visibleFieldIds.has(issue.fieldId) ||
      issue.path !== `field/${issue.fieldId}` ||
      (issue.scope !== "shared" && issue.scope !== "localized") ||
      !(
        issue.localeId === null ||
        (typeof issue.localeId === "string" && uuid.test(issue.localeId))
      ) ||
      !(issue.locale === null || validLocale(issue.locale)) ||
      !boundedString(issue.code, 1, 64) ||
      !issueCode.test(issue.code) ||
      !boundedString(issue.message, 1, 512)
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    const scope: "shared" | "localized" = issue.scope;
    return {
      fieldId: issue.fieldId,
      path: issue.path,
      scope,
      localeId: issue.localeId,
      locale: issue.locale,
      code: issue.code,
      message: issue.message,
    };
  });
  if (
    (value.status === "valid" && issues.length !== 0) ||
    (value.status === "invalid" && issues.length === 0)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return { status: value.status, issues, capped: value.capped };
}

function fieldIds(fields: ReadonlyArray<StudioFormFieldDto>): Set<string> {
  const result = new Set<string>();
  const visit = (items: ReadonlyArray<StudioFormFieldDto>): void => {
    for (const item of items) {
      result.add(item.id);
      visit(item.children);
    }
  };
  visit(fields);
  return result;
}

function values(value: unknown, visibleFieldIds: ReadonlySet<string>): StudioJsonObject {
  if (!isRecord(value) || Object.keys(value).some((key) => !visibleFieldIds.has(key))) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return copyJsonObject(value);
}

function newWorkspace(
  value: unknown,
  expected: StudioContentRouteExpectation,
): StudioNewEntryWorkspaceDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["localeId", "locale", "form", "capabilities"]) ||
    typeof value.localeId !== "string" ||
    !uuid.test(value.localeId) ||
    !validLocale(value.locale)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const decodedForm = form(value.form);
  if (
    (expected.collectionId !== undefined && decodedForm.collectionId !== expected.collectionId) ||
    (expected.locale !== undefined && value.locale !== expected.locale)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return {
    localeId: value.localeId,
    locale: value.locale,
    form: decodedForm,
    capabilities: capabilities(value.capabilities),
  };
}

function workspace(
  value: unknown,
  expected: StudioContentRouteExpectation,
): StudioEntryWorkspaceDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["localeId", "locale", "form", "capabilities", "draft", "publication"])
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const base = newWorkspace(
    {
      localeId: value.localeId,
      locale: value.locale,
      form: value.form,
      capabilities: value.capabilities,
    },
    expected,
  );
  const draft = value.draft;
  if (
    !isRecord(draft) ||
    !exactKeys(draft, [
      "entry",
      "schemaRevisionId",
      "contractHash",
      "sharedVersion",
      "sharedRevisionId",
      "sharedValues",
      "localizedVersion",
      "localizedRevisionId",
      "localizedValues",
      "validation",
    ]) ||
    typeof draft.schemaRevisionId !== "string" ||
    draft.schemaRevisionId !== base.form.schemaRevisionId ||
    typeof draft.contractHash !== "string" ||
    draft.contractHash !== base.form.contractHash ||
    !integer(draft.sharedVersion, 0) ||
    !(
      draft.sharedRevisionId === null ||
      (typeof draft.sharedRevisionId === "string" && uuid.test(draft.sharedRevisionId))
    ) ||
    !integer(draft.localizedVersion, 0) ||
    !(
      draft.localizedRevisionId === null ||
      (typeof draft.localizedRevisionId === "string" && uuid.test(draft.localizedRevisionId))
    )
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const entry = entrySummary(draft.entry);
  if (expected.entryId !== undefined && entry.id !== expected.entryId) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const visibleIds = fieldIds(base.form.fields);
  return {
    ...base,
    draft: {
      entry,
      schemaRevisionId: draft.schemaRevisionId,
      contractHash: draft.contractHash,
      sharedVersion: draft.sharedVersion,
      sharedRevisionId: draft.sharedRevisionId,
      sharedValues: values(draft.sharedValues, visibleIds),
      localizedVersion: draft.localizedVersion,
      localizedRevisionId: draft.localizedRevisionId,
      localizedValues: values(draft.localizedValues, visibleIds),
      validation: validation(draft.validation, visibleIds),
    },
    publication: publicationStatus(value.publication, visibleIds),
  };
}

function nullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && uuid.test(value));
}

function visibleFieldIdList(
  value: unknown,
  visibleIds: ReadonlySet<string>,
): ReadonlyArray<string> {
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    value.some((id) => typeof id !== "string" || !visibleIds.has(id)) ||
    new Set(value).size !== value.length
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return value.flatMap((id) => (typeof id === "string" ? [id] : []));
}

function dateTime(value: unknown): value is string {
  return (
    boundedString(value, 20, 35) && isoDateTime.test(value) && Number.isFinite(Date.parse(value))
  );
}

function revisionSummary(
  value: unknown,
  visibleIds: ReadonlySet<string>,
): StudioRevisionSummaryDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "id",
      "scope",
      "sequence",
      "previousRevisionId",
      "schemaRevisionId",
      "contractHash",
      "changedFieldIds",
      "restoredFromRevisionId",
      "authoredByUserId",
      "authoredByCredentialId",
      "authoredAt",
      "compatible",
    ]) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    (value.scope !== "shared" && value.scope !== "localized") ||
    !integer(value.sequence, 1) ||
    !nullableUuid(value.previousRevisionId) ||
    typeof value.schemaRevisionId !== "string" ||
    !uuid.test(value.schemaRevisionId) ||
    typeof value.contractHash !== "string" ||
    !hash.test(value.contractHash) ||
    !nullableUuid(value.restoredFromRevisionId) ||
    !(value.authoredByUserId === null || boundedString(value.authoredByUserId, 1, 255)) ||
    !nullableUuid(value.authoredByCredentialId) ||
    !dateTime(value.authoredAt) ||
    typeof value.compatible !== "boolean"
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const scope: StudioRevisionScope = value.scope;
  return {
    id: value.id,
    scope,
    sequence: value.sequence,
    previousRevisionId: value.previousRevisionId,
    schemaRevisionId: value.schemaRevisionId,
    contractHash: value.contractHash,
    changedFieldIds: visibleFieldIdList(value.changedFieldIds, visibleIds),
    restoredFromRevisionId: value.restoredFromRevisionId,
    authoredByUserId: value.authoredByUserId,
    authoredByCredentialId: value.authoredByCredentialId,
    authoredAt: value.authoredAt,
    compatible: value.compatible,
  };
}

function publicationSummary(
  value: unknown,
  visibleIds: ReadonlySet<string>,
): StudioPublicationSummaryDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "id",
      "sequence",
      "schemaRevisionId",
      "contractHash",
      "changedFieldIds",
      "publishedAt",
      "current",
    ]) ||
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    !integer(value.sequence, 1) ||
    typeof value.schemaRevisionId !== "string" ||
    !uuid.test(value.schemaRevisionId) ||
    typeof value.contractHash !== "string" ||
    !hash.test(value.contractHash) ||
    !dateTime(value.publishedAt) ||
    typeof value.current !== "boolean"
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return {
    id: value.id,
    sequence: value.sequence,
    schemaRevisionId: value.schemaRevisionId,
    contractHash: value.contractHash,
    changedFieldIds: visibleFieldIdList(value.changedFieldIds, visibleIds),
    publishedAt: value.publishedAt,
    current: value.current,
  };
}

function publicationStatus(
  value: unknown,
  visibleIds: ReadonlySet<string>,
): StudioPublicationStatusDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "state",
      "stateVersion",
      "currentPublication",
      "sharedChanged",
      "localizedChanged",
      "schemaChanged",
      "changedSincePublication",
    ]) ||
    (value.state !== "published" &&
      value.state !== "unpublished" &&
      value.state !== "never_published") ||
    !integer(value.stateVersion, 0) ||
    (value.state === "published") !== (value.currentPublication !== null) ||
    (value.state === "never_published" && value.stateVersion !== 0) ||
    typeof value.sharedChanged !== "boolean" ||
    typeof value.localizedChanged !== "boolean" ||
    typeof value.schemaChanged !== "boolean" ||
    typeof value.changedSincePublication !== "boolean"
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return {
    state: value.state,
    stateVersion: value.stateVersion,
    currentPublication:
      value.currentPublication === null
        ? null
        : publicationSummary(value.currentPublication, visibleIds),
    sharedChanged: value.sharedChanged,
    localizedChanged: value.localizedChanged,
    schemaChanged: value.schemaChanged,
    changedSincePublication: value.changedSincePublication,
  };
}

function cursorPage<T>(
  value: unknown,
  item: (value: unknown) => T & { readonly id: string },
): { readonly items: ReadonlyArray<T>; readonly nextCursor: string | null } {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["items", "nextCursor"]) ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    !(
      value.nextCursor === null ||
      (typeof value.nextCursor === "string" && cursor.test(value.nextCursor))
    )
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const items = value.items.map(item);
  if (new Set(items.map((candidate) => candidate.id)).size !== items.length) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return { items, nextCursor: value.nextCursor };
}

function deliveryReadBack(value: unknown): StudioDeliveryReadBackDto {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["status", "currentPublicationId"]) ||
    (value.status !== "verified" && value.status !== "superseded") ||
    !nullableUuid(value.currentPublicationId)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return { status: value.status, currentPublicationId: value.currentPublicationId };
}

function resultKind(value: unknown): "changed" | "no_op" {
  if (value !== "changed" && value !== "no_op") throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  return value;
}

const contentErrorCodes = new Set<string>([
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "STUDIO_COLLECTION_CONFIGURATION_INVALID",
  "LOCALE_UNAVAILABLE",
  "CMS_CAPABILITY_REQUIRED",
  "STUDIO_REGISTRATION_INACTIVE",
  "STUDIO_AUTHORITY_CHANGED",
  "STUDIO_GRANT_INVALID",
  "STALE_SCHEMA",
  "DRAFT_VERSION_CONFLICT",
  "NAME_VERSION_CONFLICT",
  "COMMAND_CONFLICT",
  "REVISION_INCOMPATIBLE",
  "PUBLICATION_INVALID",
  "PUBLICATION_STATE_CONFLICT",
  "PRESENTATION_ROLE_VISIBILITY_FORBIDDEN",
  "PRESENTATION_SCOPE_RESTRICTED",
  "PUBLISHED_SCHEMA_REQUIRED",
  "INVALID_CURSOR",
  "STALE_CURSOR",
  "REQUEST_TOO_LARGE",
  "STUDIO_RESPONSE_TOO_LARGE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
  "STUDIO_AUTH_REQUIRED",
  "STUDIO_REQUEST_INVALID",
  "STUDIO_ORIGIN_INVALID",
  "STUDIO_SESSION_INVALID",
  "STUDIO_UPSTREAM_UNAVAILABLE",
  "STUDIO_CONFIGURATION_INVALID",
  "STUDIO_ROUTE_NOT_FOUND",
  "STUDIO_RATE_LIMITED",
  "STUDIO_FORBIDDEN",
  "STUDIO_PROJECT_UNAVAILABLE",
  "STUDIO_CMS_DISABLED",
]);

function isContentErrorCode(value: unknown): value is StudioContentBrowserErrorCode {
  return typeof value === "string" && contentErrorCodes.has(value);
}

function validFailureStatus(code: StudioContentBrowserErrorCode, status: number): boolean {
  const statuses: Readonly<Record<StudioContentBrowserErrorCode, ReadonlyArray<number>>> = {
    VALIDATION_ERROR: [400],
    UNAUTHORIZED: [401],
    FORBIDDEN: [403],
    NOT_FOUND: [404],
    STUDIO_COLLECTION_CONFIGURATION_INVALID: [409],
    LOCALE_UNAVAILABLE: [404],
    CMS_CAPABILITY_REQUIRED: [409],
    STUDIO_REGISTRATION_INACTIVE: [403],
    STUDIO_AUTHORITY_CHANGED: [403],
    STUDIO_GRANT_INVALID: [403],
    STALE_SCHEMA: [409],
    DRAFT_VERSION_CONFLICT: [409],
    NAME_VERSION_CONFLICT: [409],
    COMMAND_CONFLICT: [409],
    REVISION_INCOMPATIBLE: [409],
    PUBLICATION_INVALID: [422],
    PUBLICATION_STATE_CONFLICT: [409],
    PRESENTATION_ROLE_VISIBILITY_FORBIDDEN: [403],
    PRESENTATION_SCOPE_RESTRICTED: [403],
    PUBLISHED_SCHEMA_REQUIRED: [409],
    INVALID_CURSOR: [400],
    STALE_CURSOR: [409],
    REQUEST_TOO_LARGE: [413],
    STUDIO_RESPONSE_TOO_LARGE: [413],
    RATE_LIMITED: [429],
    SERVICE_UNAVAILABLE: [503],
    INTERNAL_ERROR: [500],
    STUDIO_AUTH_REQUIRED: [401],
    STUDIO_REQUEST_INVALID: [400, 405, 413, 415, 431],
    STUDIO_ORIGIN_INVALID: [403],
    STUDIO_SESSION_INVALID: [401],
    STUDIO_UPSTREAM_UNAVAILABLE: [500, 502, 503, 504],
    STUDIO_CONFIGURATION_INVALID: [503],
    STUDIO_ROUTE_NOT_FOUND: [404],
    STUDIO_RATE_LIMITED: [429],
    STUDIO_FORBIDDEN: [403],
    STUDIO_PROJECT_UNAVAILABLE: [404],
    STUDIO_CMS_DISABLED: [409],
  };
  return statuses[code].includes(status);
}

const detailPath =
  /^(?:path|entry|expected[A-Z][A-Za-z]{0,40}|field\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu;

function errorDetail(value: unknown): StudioJsonObject {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "path",
          "code",
          "message",
          "scope",
          "expectedVersion",
          "currentVersion",
          "currentRevisionId",
        ].includes(key),
    ) ||
    !boundedString(value.code, 1, 64) ||
    !issueCode.test(value.code) ||
    !boundedString(value.message, 1, 512) ||
    !(
      value.path === undefined ||
      (typeof value.path === "string" && detailPath.test(value.path))
    ) ||
    !(value.scope === undefined || value.scope === "shared" || value.scope === "localized") ||
    !(value.expectedVersion === undefined || integer(value.expectedVersion, 0)) ||
    !(value.currentVersion === undefined || integer(value.currentVersion, 0)) ||
    !(
      value.currentRevisionId === undefined ||
      value.currentRevisionId === null ||
      (typeof value.currentRevisionId === "string" && uuid.test(value.currentRevisionId))
    )
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return copyJsonObject(value);
}

function failure(
  value: Readonly<Record<string, unknown>>,
  status: number,
): StudioContentBrowserFailure {
  if (
    value.ok !== false ||
    value.data !== null ||
    !isRecord(value.error) ||
    !boundedString(value.message, 1, 512)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const error = value.error;
  if (
    Object.keys(error).some(
      (key) =>
        !["code", "message", "retryable", "requestId", "configurationReason", "details"].includes(
          key,
        ),
    ) ||
    !isContentErrorCode(error.code) ||
    !validFailureStatus(error.code, status) ||
    !boundedString(error.message, 1, 512) ||
    !(error.retryable === undefined || typeof error.retryable === "boolean") ||
    !(error.requestId === undefined || boundedString(error.requestId, 1, 128)) ||
    !(
      error.configurationReason === undefined ||
      error.configurationReason === "empty_schema" ||
      error.configurationReason === "projection_invalid"
    ) ||
    (error.code === "STUDIO_COLLECTION_CONFIGURATION_INVALID") !==
      (error.configurationReason !== undefined) ||
    !(
      error.details === undefined ||
      (Array.isArray(error.details) && error.details.length >= 1 && error.details.length <= 20)
    )
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  const details = error.details?.map(errorDetail);
  return {
    ok: false,
    data: null,
    error: {
      code: error.code,
      message: error.message,
      ...(error.retryable === undefined ? {} : { retryable: error.retryable }),
      ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
      ...(error.configurationReason === undefined
        ? {}
        : { configurationReason: error.configurationReason }),
      ...(details === undefined ? {} : { details }),
    },
    message: value.message,
  };
}

type Decoder<T> = (value: unknown) => T;

export function decodeStudioContentEnvelope<T>(
  value: unknown,
  status: number,
  decodeData: (value: unknown) => T,
): T | StudioContentBrowserFailure {
  return envelope(value, status, decodeData);
}

function envelope<T>(
  value: unknown,
  status: number,
  decodeData: Decoder<T>,
): T | StudioContentBrowserFailure {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["ok", "data", "error", "message"]) ||
    !boundedString(value.message, 1, 512)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  if (value.ok === true) {
    if (status !== 200 || value.error !== null) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    return decodeData(value.data);
  }
  if (status < 400 || status > 599) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  return failure(value, status);
}

export function decodeStudioContentContextResponse(
  value: unknown,
  status: number,
): StudioContentContextDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, ["locales", "collections", "configurationNotices"]) ||
      !Array.isArray(data.locales) ||
      data.locales.length > 100 ||
      !Array.isArray(data.collections) ||
      data.collections.length > 50 ||
      !Array.isArray(data.configurationNotices) ||
      data.configurationNotices.length > 50
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    const localeIds = new Set<string>();
    const locales: StudioContentContextDto["locales"] = data.locales.map((item) => {
      if (
        !isRecord(item) ||
        !exactKeys(item, ["id", "tag", "displayName", "canRead", "canWrite", "canPublish"]) ||
        typeof item.id !== "string" ||
        !uuid.test(item.id) ||
        localeIds.has(item.id) ||
        !validLocale(item.tag) ||
        !boundedString(item.displayName, 1, 100) ||
        item.canRead !== true ||
        typeof item.canWrite !== "boolean" ||
        typeof item.canPublish !== "boolean"
      )
        throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
      localeIds.add(item.id);
      return {
        id: item.id,
        tag: item.tag,
        displayName: item.displayName,
        canRead: true,
        canWrite: item.canWrite,
        canPublish: item.canPublish,
      };
    });
    const collectionIds = new Set<string>();
    const collections: StudioContentContextDto["collections"] = data.collections.map((item) => {
      if (
        !isRecord(item) ||
        !exactKeys(item, ["id", "displayName", "capabilities"]) ||
        typeof item.id !== "string" ||
        !uuid.test(item.id) ||
        collectionIds.has(item.id) ||
        !boundedString(item.displayName, 1, 100)
      )
        throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
      collectionIds.add(item.id);
      return {
        id: item.id,
        displayName: item.displayName,
        capabilities: capabilities(item.capabilities),
      };
    });
    const configurationNotices: StudioContentContextDto["configurationNotices"] =
      data.configurationNotices.map((item) => {
        if (
          !isRecord(item) ||
          !exactKeys(item, ["collectionId", "displayName", "reason"]) ||
          typeof item.collectionId !== "string" ||
          !uuid.test(item.collectionId) ||
          collectionIds.has(item.collectionId) ||
          !boundedString(item.displayName, 1, 100) ||
          (item.reason !== "empty_schema" && item.reason !== "projection_invalid")
        )
          throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
        collectionIds.add(item.collectionId);
        return {
          collectionId: item.collectionId,
          displayName: item.displayName,
          reason: item.reason,
        };
      });
    return { locales, collections, configurationNotices };
  });
}

export function decodeStudioEntryPageResponse(
  value: unknown,
  status: number,
): StudioEntryPageDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, ["items", "hasMore", "nextCursor", "count"]) ||
      !Array.isArray(data.items) ||
      data.items.length > 50 ||
      typeof data.hasMore !== "boolean" ||
      !(
        data.nextCursor === null ||
        (typeof data.nextCursor === "string" && cursor.test(data.nextCursor))
      ) ||
      !isRecord(data.count) ||
      !exactKeys(data.count, ["value", "relation"]) ||
      !integer(data.count.value, 0, 1_000) ||
      (data.count.relation !== "exact" && data.count.relation !== "at_least") ||
      (data.count.relation === "at_least" && data.count.value !== 1_000)
    )
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    const items = data.items.map(entrySummary);
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    return {
      items,
      hasMore: data.hasMore,
      nextCursor: data.nextCursor,
      count: { value: data.count.value, relation: data.count.relation },
    };
  });
}

export function decodeStudioResolveEntriesResponse(
  value: unknown,
  status: number,
  requestedEntryIds: ReadonlyArray<string>,
): StudioResolvedEntryLabelsDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, ["items"]) ||
      !Array.isArray(data.items) ||
      data.items.length > requestedEntryIds.length
    )
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    const items = data.items.map((item) => {
      if (
        !isRecord(item) ||
        !exactKeys(item, ["id", "displayName"]) ||
        typeof item.id !== "string" ||
        !uuid.test(item.id) ||
        !boundedString(item.displayName, 1, 100)
      )
        throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
      return { id: item.id, displayName: item.displayName };
    });
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    let previousIndex = -1;
    for (const item of items) {
      const index = requestedEntryIds.indexOf(item.id);
      if (index <= previousIndex) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
      previousIndex = index;
    }
    return { items };
  });
}

export function decodeStudioNewEntryWorkspaceResponse(
  value: unknown,
  status: number,
  expected: StudioContentRouteExpectation,
): StudioNewEntryWorkspaceDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => newWorkspace(data, expected));
}

export function decodeStudioEntryWorkspaceResponse(
  value: unknown,
  status: number,
  expected: StudioContentRouteExpectation,
): StudioEntryWorkspaceDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => workspace(data, expected));
}

export function decodeStudioCreateEntryResponse(
  value: unknown,
  status: number,
  expected: StudioContentRouteExpectation,
  visibleFieldIds: ReadonlySet<string>,
): StudioCreateEntryResultDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, [
        "entry",
        "commandId",
        "sharedVersion",
        "sharedRevisionId",
        "localizedVersion",
        "localizedRevisionId",
        "validation",
      ]) ||
      typeof data.commandId !== "string" ||
      !uuid.test(data.commandId) ||
      !integer(data.sharedVersion, 0) ||
      !(
        data.sharedRevisionId === null ||
        (typeof data.sharedRevisionId === "string" && uuid.test(data.sharedRevisionId))
      ) ||
      !integer(data.localizedVersion, 0) ||
      !(
        data.localizedRevisionId === null ||
        (typeof data.localizedRevisionId === "string" && uuid.test(data.localizedRevisionId))
      )
    )
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    const entry = entrySummary(data.entry);
    const projectedValidation = validation(data.validation, visibleFieldIds);
    if (expected.entryId !== undefined && entry.id !== expected.entryId)
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    return {
      entry,
      commandId: data.commandId,
      sharedVersion: data.sharedVersion,
      sharedRevisionId: data.sharedRevisionId,
      localizedVersion: data.localizedVersion,
      localizedRevisionId: data.localizedRevisionId,
      validation: projectedValidation,
    };
  });
}

export function decodeStudioRenameEntryResponse(
  value: unknown,
  status: number,
  expected: StudioContentRouteExpectation,
): StudioEntrySummaryDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    const entry = entrySummary(data);
    if (expected.entryId !== undefined && entry.id !== expected.entryId)
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    return entry;
  });
}

export function decodeStudioSaveEntryDraftResponse(
  value: unknown,
  status: number,
  expected: StudioContentRouteExpectation,
  visibleFieldIds: ReadonlySet<string>,
): StudioMutationReceiptDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, [
        "entryId",
        "commandId",
        "sharedChanged",
        "sharedVersion",
        "sharedRevisionId",
        "localizedChanged",
        "localizedVersion",
        "localizedRevisionId",
        "validation",
      ]) ||
      typeof data.entryId !== "string" ||
      !uuid.test(data.entryId) ||
      typeof data.commandId !== "string" ||
      !uuid.test(data.commandId) ||
      typeof data.sharedChanged !== "boolean" ||
      !integer(data.sharedVersion, 0) ||
      !(
        data.sharedRevisionId === null ||
        (typeof data.sharedRevisionId === "string" && uuid.test(data.sharedRevisionId))
      ) ||
      typeof data.localizedChanged !== "boolean" ||
      !integer(data.localizedVersion, 0) ||
      !(
        data.localizedRevisionId === null ||
        (typeof data.localizedRevisionId === "string" && uuid.test(data.localizedRevisionId))
      ) ||
      (expected.entryId !== undefined && data.entryId !== expected.entryId)
    )
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    return {
      entryId: data.entryId,
      commandId: data.commandId,
      sharedChanged: data.sharedChanged,
      sharedVersion: data.sharedVersion,
      sharedRevisionId: data.sharedRevisionId,
      localizedChanged: data.localizedChanged,
      localizedVersion: data.localizedVersion,
      localizedRevisionId: data.localizedRevisionId,
      validation: validation(data.validation, visibleFieldIds),
    };
  });
}

export function decodeStudioRevisionPageResponse(
  value: unknown,
  status: number,
  scope: StudioRevisionScope,
  visibleFieldIds: ReadonlySet<string>,
): StudioRevisionPageDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    const page = cursorPage(data, (item) => revisionSummary(item, visibleFieldIds));
    if (page.items.some((item) => item.scope !== scope)) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    return page;
  });
}

export function decodeStudioRevisionResponse(
  value: unknown,
  status: number,
  revisionId: string,
  visibleFieldIds: ReadonlySet<string>,
): StudioRevisionDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (!isRecord(data) || !exactKeys(data, ["revision", "values"])) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    const revision = revisionSummary(data.revision, visibleFieldIds);
    if (revision.id !== revisionId) throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    return { revision, values: values(data.values, visibleFieldIds) };
  });
}

function comparisonItem(
  value: unknown,
  visibleIds: ReadonlySet<string>,
): StudioRevisionComparisonItemDto {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !["fieldId", "change", "before", "after", "inCurrentSchema"].includes(key),
    ) ||
    typeof value.fieldId !== "string" ||
    !uuid.test(value.fieldId) ||
    typeof value.inCurrentSchema !== "boolean" ||
    (value.inCurrentSchema && !visibleIds.has(value.fieldId)) ||
    (value.change !== "added" && value.change !== "removed" && value.change !== "changed") ||
    (value.change === "added") !== !("before" in value) ||
    (value.change === "removed") !== !("after" in value)
  ) {
    throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
  }
  return {
    fieldId: value.fieldId,
    change: value.change,
    ...("before" in value ? { before: copyJson(value.before) } : {}),
    ...("after" in value ? { after: copyJson(value.after) } : {}),
    inCurrentSchema: value.inCurrentSchema,
  };
}

export function decodeStudioRevisionComparisonResponse(
  value: unknown,
  status: number,
  expected: { readonly fromRevisionId: string; readonly toRevisionId: string },
  visibleFieldIds: ReadonlySet<string>,
): StudioRevisionComparisonDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, ["from", "to", "items", "restrictedChanges", "schemaDiffers"]) ||
      !Array.isArray(data.items) ||
      data.items.length > 200 ||
      typeof data.restrictedChanges !== "boolean" ||
      typeof data.schemaDiffers !== "boolean"
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    const from = revisionSummary(data.from, visibleFieldIds);
    const to = revisionSummary(data.to, visibleFieldIds);
    const items = data.items.map((item) => comparisonItem(item, visibleFieldIds));
    if (
      from.id !== expected.fromRevisionId ||
      to.id !== expected.toRevisionId ||
      from.scope !== to.scope ||
      new Set(items.map((item) => item.fieldId)).size !== items.length
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    return {
      from,
      to,
      items,
      restrictedChanges: data.restrictedChanges,
      schemaDiffers: data.schemaDiffers,
    };
  });
}

export function decodeStudioPublicationStatusResponse(
  value: unknown,
  status: number,
  visibleFieldIds: ReadonlySet<string>,
): StudioPublicationStatusDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => publicationStatus(data, visibleFieldIds));
}

export function decodeStudioPublicationPageResponse(
  value: unknown,
  status: number,
  visibleFieldIds: ReadonlySet<string>,
): StudioPublicationPageDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) =>
    cursorPage(data, (item) => publicationSummary(item, visibleFieldIds)),
  );
}

export function decodeStudioPublicationPlanResponse(
  value: unknown,
  status: number,
  visibleFieldIds: ReadonlySet<string>,
): StudioPublicationPlanDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, [
        "authorityHash",
        "stateVersion",
        "currentPublicationId",
        "schemaRevisionId",
        "contractHash",
        "sharedVersion",
        "sharedRevisionId",
        "localizedVersion",
        "localizedRevisionId",
        "wouldCreatePublication",
        "validation",
        "entryIssues",
      ]) ||
      !(
        data.authorityHash === null ||
        (typeof data.authorityHash === "string" && hash.test(data.authorityHash))
      ) ||
      !integer(data.stateVersion, 0) ||
      !nullableUuid(data.currentPublicationId) ||
      typeof data.schemaRevisionId !== "string" ||
      !uuid.test(data.schemaRevisionId) ||
      typeof data.contractHash !== "string" ||
      !hash.test(data.contractHash) ||
      !integer(data.sharedVersion, 0) ||
      !nullableUuid(data.sharedRevisionId) ||
      !integer(data.localizedVersion, 0) ||
      !nullableUuid(data.localizedRevisionId) ||
      typeof data.wouldCreatePublication !== "boolean" ||
      !Array.isArray(data.entryIssues) ||
      data.entryIssues.length > 50
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    const entryIssues = data.entryIssues.map((issue) => {
      if (
        !isRecord(issue) ||
        !exactKeys(issue, ["code", "message"]) ||
        !boundedString(issue.code, 1, 64) ||
        !issueCode.test(issue.code) ||
        !boundedString(issue.message, 1, 512)
      ) {
        throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
      }
      return { code: issue.code, message: issue.message };
    });
    return {
      authorityHash: data.authorityHash,
      stateVersion: data.stateVersion,
      currentPublicationId: data.currentPublicationId,
      schemaRevisionId: data.schemaRevisionId,
      contractHash: data.contractHash,
      sharedVersion: data.sharedVersion,
      sharedRevisionId: data.sharedRevisionId,
      localizedVersion: data.localizedVersion,
      localizedRevisionId: data.localizedRevisionId,
      wouldCreatePublication: data.wouldCreatePublication,
      validation: validation(data.validation, visibleFieldIds),
      entryIssues,
    };
  });
}

export function decodeStudioPublishResponse(
  value: unknown,
  status: number,
  visibleFieldIds: ReadonlySet<string>,
): StudioPublishResultDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, ["commandId", "resultKind", "stateVersion", "publication", "delivery"]) ||
      typeof data.commandId !== "string" ||
      !uuid.test(data.commandId) ||
      !integer(data.stateVersion, 0)
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    return {
      commandId: data.commandId,
      resultKind: resultKind(data.resultKind),
      stateVersion: data.stateVersion,
      publication: publicationSummary(data.publication, visibleFieldIds),
      delivery: deliveryReadBack(data.delivery),
    };
  });
}

export function decodeStudioUnpublishResponse(
  value: unknown,
  status: number,
): StudioUnpublishResultDto | StudioContentBrowserFailure {
  return envelope(value, status, (data) => {
    if (
      !isRecord(data) ||
      !exactKeys(data, [
        "commandId",
        "resultKind",
        "stateVersion",
        "unpublishedPublicationId",
        "unpublishedAt",
        "delivery",
      ]) ||
      typeof data.commandId !== "string" ||
      !uuid.test(data.commandId) ||
      !integer(data.stateVersion, 0) ||
      !nullableUuid(data.unpublishedPublicationId) ||
      !dateTime(data.unpublishedAt)
    ) {
      throw new Error("STUDIO_CONTENT_RESPONSE_INVALID");
    }
    return {
      commandId: data.commandId,
      resultKind: resultKind(data.resultKind),
      stateVersion: data.stateVersion,
      unpublishedPublicationId: data.unpublishedPublicationId,
      unpublishedAt: data.unpublishedAt,
      delivery: deliveryReadBack(data.delivery),
    };
  });
}

export const studioContentBrowserLimits = {
  responseBytes: maximumResponseBytes,
  searchRequestBytes: 2 * 1_024,
  resolveRequestBytes: 8 * 1_024,
  maximumResolvedEntries: 100,
  mutationRequestBytes: 1 * 1_024 * 1_024,
  commandRequestBytes: 4 * 1_024,
  presentationRequestBytes: 256 * 1_024,
  historyPageLimit: 20,
} as const;
