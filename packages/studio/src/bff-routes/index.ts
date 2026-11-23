const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const studioContentResponseLimitBytes = 4 * 1_024 * 1_024;

export function studioContentRequestLimitBytes(route: string): number {
  if (route.endsWith("/search")) return 2 * 1_024;
  if (route.endsWith("/resolve")) return 8 * 1_024;
  if (studioContentCommandRoute(route)) return 4 * 1_024;
  if (route.endsWith("/presentation/publish")) return 256 * 1_024;
  return 1 * 1_024 * 1_024;
}

export function studioResolutionIds(
  route: string,
  body: unknown,
): ReadonlyArray<string> | undefined {
  if (!route.endsWith("/resolve") || !isRecord(body) || !Array.isArray(body.entryIds)) {
    return undefined;
  }
  return body.entryIds.flatMap((entryId) => (typeof entryId === "string" ? [entryId] : []));
}

function studioContentErrorStatus(code: unknown): number | null {
  switch (code) {
    case "VALIDATION_ERROR":
    case "INVALID_CURSOR":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
    case "PRESENTATION_ROLE_VISIBILITY_FORBIDDEN":
    case "PRESENTATION_SCOPE_RESTRICTED":
    case "STUDIO_REGISTRATION_INACTIVE":
    case "STUDIO_AUTHORITY_CHANGED":
    case "STUDIO_GRANT_INVALID":
      return 403;
    case "NOT_FOUND":
    case "LOCALE_UNAVAILABLE":
      return 404;
    case "STUDIO_COLLECTION_CONFIGURATION_INVALID":
    case "CMS_CAPABILITY_REQUIRED":
    case "STALE_SCHEMA":
    case "DRAFT_VERSION_CONFLICT":
    case "NAME_VERSION_CONFLICT":
    case "COMMAND_CONFLICT":
    case "STALE_CURSOR":
    case "REVISION_INCOMPATIBLE":
    case "PUBLICATION_STATE_CONFLICT":
    case "PUBLISHED_SCHEMA_REQUIRED":
      return 409;
    case "PUBLICATION_INVALID":
      return 422;
    case "REQUEST_TOO_LARGE":
    case "STUDIO_RESPONSE_TOO_LARGE":
      return 413;
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL_ERROR":
      return 500;
    case "SERVICE_UNAVAILABLE":
      return 503;
    default:
      return null;
  }
}
const forbiddenStudioContentResponseKeys = new Set([
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "secret",
  "sourcekey",
  "apikey",
  "visibletoroles",
  "editablebyroles",
  "roles",
  "roleauthority",
  "effectiveactions",
  "membershipmetadata",
  "rawactions",
]);

function safeStudioContentResponseValue(value: unknown): boolean {
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > 100_000 || current.depth > 32) return false;
    if (typeof current.value === "string" && current.value.length > 1_000_000) return false;
    if (typeof current.value !== "object" || current.value === null) continue;
    if (Array.isArray(current.value)) {
      for (const item of current.value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    for (const [key, item] of Object.entries(current.value)) {
      const normalizedKey = key.toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]/gu, "");
      if (forbiddenStudioContentResponseKeys.has(normalizedKey)) return false;
      stack.push({ value: item, depth: current.depth + 1 });
    }
  }
  return true;
}

function boundedStudioContentString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function exactStudioContentKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): boolean {
  return Object.keys(value).toSorted().join(",") === [...keys].toSorted().join(",");
}

function validStudioContentCapabilities(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "canCreate",
      "canRename",
      "canSaveLocalized",
      "canSaveShared",
      "canPublish",
      "canPublishPresentation",
    ]) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

function validStudioContentIsoDateTime(value: unknown): boolean {
  return (
    boundedStudioContentString(value, 20, 35) &&
    typeof value === "string" &&
    Number.isFinite(Date.parse(value))
  );
}

function validStudioContentEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["id", "displayName", "nameVersion", "createdAt", "updatedAt"]) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    boundedStudioContentString(value.displayName, 1, 100) &&
    Number.isSafeInteger(value.nameVersion) &&
    Number(value.nameVersion) >= 1 &&
    validStudioContentIsoDateTime(value.createdAt) &&
    validStudioContentIsoDateTime(value.updatedAt)
  );
}

function validStudioContentValidation(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactStudioContentKeys(value, ["status", "issues", "capped"]) ||
    (value.status !== "valid" &&
      value.status !== "invalid" &&
      value.status !== "restricted_issues") ||
    !Array.isArray(value.issues) ||
    value.issues.length > 50 ||
    typeof value.capped !== "boolean"
  ) {
    return false;
  }
  return value.issues.every(
    (issue) =>
      isRecord(issue) &&
      exactStudioContentKeys(issue, [
        "fieldId",
        "path",
        "scope",
        "localeId",
        "locale",
        "code",
        "message",
      ]) &&
      typeof issue.fieldId === "string" &&
      uuid.test(issue.fieldId) &&
      boundedStudioContentString(issue.path, 1, 256) &&
      (issue.scope === "shared" || issue.scope === "localized") &&
      (issue.localeId === null ||
        (typeof issue.localeId === "string" && uuid.test(issue.localeId))) &&
      (issue.locale === null || boundedStudioContentString(issue.locale, 2, 35)) &&
      boundedStudioContentString(issue.code, 1, 64) &&
      typeof issue.code === "string" &&
      /^[a-z][a-z0-9_]{0,63}$/u.test(issue.code) &&
      boundedStudioContentString(issue.message, 1, 512),
  );
}

const studioFieldConfigurationKeys: Readonly<Record<string, ReadonlyArray<string>>> = {
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

function optionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function optionalInteger(value: unknown): boolean {
  return value === undefined || Number.isSafeInteger(value);
}

function optionalBoundedString(value: unknown, maximum: number): boolean {
  return value === undefined || boundedStudioContentString(value, 0, maximum);
}

const exactDecimal = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;
const exactDate = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const enumOptionValue = /^[a-z][a-z0-9_]{0,62}$/u;
const portableTextKey = /^[A-Za-z0-9_-]+$/u;

function optionalPatternString(value: unknown, pattern: RegExp, maximum: number): boolean {
  return (
    value === undefined ||
    (boundedStudioContentString(value, 1, maximum) &&
      typeof value === "string" &&
      pattern.test(value))
  );
}

function onlyStudioContentKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function validPortableTextSpan(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["_key", "_type", "text", "marks"]) &&
    boundedStudioContentString(value._key, 1, 64) &&
    portableTextKey.test(value._key) &&
    value._type === "span" &&
    boundedStudioContentString(value.text, 0, 100_000) &&
    Array.isArray(value.marks) &&
    value.marks.length <= 32 &&
    value.marks.every((mark) => boundedStudioContentString(mark, 1, 64))
  );
}

function validPortableTextLink(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["_key", "_type", "href"]) &&
    boundedStudioContentString(value._key, 1, 64) &&
    portableTextKey.test(value._key) &&
    value._type === "link" &&
    boundedStudioContentString(value.href, 1, 2_048)
  );
}

function validPortableTextDocument(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactStudioContentKeys(value, ["version", "profile", "blocks"]) ||
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
      onlyStudioContentKeys(block, [
        "_key",
        "_type",
        "style",
        "listItem",
        "level",
        "children",
        "markDefs",
      ]) &&
      ["_key", "_type", "style", "children", "markDefs"].every((key) => key in block) &&
      boundedStudioContentString(block._key, 1, 64) &&
      portableTextKey.test(block._key) &&
      block._type === "block" &&
      (block.style === "normal" ||
        block.style === "h2" ||
        block.style === "h3" ||
        block.style === "h4" ||
        block.style === "h5" ||
        block.style === "h6" ||
        block.style === "blockquote") &&
      (block.listItem === undefined ||
        block.listItem === "bullet" ||
        block.listItem === "number") &&
      (block.level === undefined || block.level === 1 || block.level === 2 || block.level === 3) &&
      Array.isArray(block.children) &&
      block.children.length <= 5_000 &&
      block.children.every(validPortableTextSpan) &&
      Array.isArray(block.markDefs) &&
      block.markDefs.length <= 1_000 &&
      block.markDefs.every(validPortableTextLink),
  );
}

function validExternalAsset(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["source", "url", "kind", "title", "alt", "width", "height"]) &&
    value.source === "external" &&
    boundedStudioContentString(value.url, 1, 2_048) &&
    (value.kind === "image" ||
      value.kind === "video" ||
      value.kind === "audio" ||
      value.kind === "document" ||
      value.kind === "archive" ||
      value.kind === "other") &&
    (value.title === null || boundedStudioContentString(value.title, 0, 500)) &&
    (value.alt === null || boundedStudioContentString(value.alt, 0, 500)) &&
    (value.width === null ||
      (Number.isInteger(value.width) &&
        Number(value.width) >= 1 &&
        Number(value.width) <= 100_000)) &&
    (value.height === null ||
      (Number.isInteger(value.height) &&
        Number(value.height) >= 1 &&
        Number(value.height) <= 100_000))
  );
}

function validStudioContentFieldConfiguration(kind: unknown, value: unknown): boolean {
  if (typeof kind !== "string" || !isRecord(value)) return false;
  const allowed = studioFieldConfigurationKeys[kind];
  if (allowed === undefined || Object.keys(value).some((key) => !allowed.includes(key)))
    return false;
  switch (kind) {
    case "short_text":
    case "long_text":
    case "slug":
      return (
        optionalInteger(value.minLength) &&
        optionalInteger(value.maxLength) &&
        optionalBoundedString(value.pattern, 256) &&
        optionalBoundedString(
          value.default,
          kind === "long_text" ? 50_000 : kind === "slug" ? 200 : 500,
        )
      );
    case "rich_text":
      return (
        (value.styles === undefined ||
          (Array.isArray(value.styles) &&
            value.styles.every(
              (item) =>
                item === "normal" ||
                item === "h2" ||
                item === "h3" ||
                item === "h4" ||
                item === "h5" ||
                item === "h6" ||
                item === "blockquote",
            ))) &&
        (value.decorators === undefined ||
          (Array.isArray(value.decorators) &&
            value.decorators.every(
              (item) =>
                item === "strong" ||
                item === "em" ||
                item === "underline" ||
                item === "strike-through" ||
                item === "code",
            ))) &&
        (value.links === undefined || typeof value.links === "boolean") &&
        (value.lists === undefined ||
          (Array.isArray(value.lists) &&
            value.lists.every((item) => item === "bullet" || item === "number"))) &&
        optionalInteger(value.minLength) &&
        optionalInteger(value.maxLength) &&
        (value.default === undefined || validPortableTextDocument(value.default))
      );
    case "number":
      return (
        (value.mode === undefined || value.mode === "integer" || value.mode === "floating_point") &&
        optionalFiniteNumber(value.minimum) &&
        optionalFiniteNumber(value.maximum) &&
        optionalFiniteNumber(value.default)
      );
    case "decimal":
      return (
        (value.precision === undefined ||
          (Number.isInteger(value.precision) &&
            Number(value.precision) >= 1 &&
            Number(value.precision) <= 38)) &&
        (value.scale === undefined ||
          (Number.isInteger(value.scale) &&
            Number(value.scale) >= 0 &&
            Number(value.scale) <= 18)) &&
        optionalPatternString(value.minimum, exactDecimal, 58) &&
        optionalPatternString(value.maximum, exactDecimal, 58) &&
        optionalPatternString(value.default, exactDecimal, 58)
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
            exactStudioContentKeys(value.default, ["amount", "currency"]) &&
            boundedStudioContentString(value.default.amount, 1, 58) &&
            typeof value.default.amount === "string" &&
            exactDecimal.test(value.default.amount) &&
            typeof value.default.currency === "string" &&
            /^[A-Z]{3}$/u.test(value.default.currency)))
      );
    case "boolean":
      return value.default === undefined || typeof value.default === "boolean";
    case "date":
      return (
        optionalPatternString(value.minimum, exactDate, 10) &&
        optionalPatternString(value.maximum, exactDate, 10) &&
        optionalPatternString(value.default, exactDate, 10)
      );
    case "date_time":
      return (
        optionalBoundedString(value.minimum, 35) &&
        optionalBoundedString(value.maximum, 35) &&
        optionalBoundedString(value.default, 35)
      );
    case "enum":
      return (
        Array.isArray(value.options) &&
        value.options.length >= 1 &&
        value.options.length <= 100 &&
        value.options.every(
          (option) =>
            isRecord(option) &&
            exactStudioContentKeys(option, ["id", "value", "label", "position"]) &&
            typeof option.id === "string" &&
            uuid.test(option.id) &&
            boundedStudioContentString(option.value, 1, 63) &&
            typeof option.value === "string" &&
            enumOptionValue.test(option.value) &&
            boundedStudioContentString(option.label, 1, 100) &&
            Number.isInteger(option.position) &&
            Number(option.position) >= 0 &&
            Number(option.position) <= 99,
        ) &&
        optionalPatternString(value.default, enumOptionValue, 63)
      );
    case "url":
      return optionalBoundedString(value.default, 2_048);
    case "email":
      return optionalBoundedString(value.default, 254);
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
      return value.default === undefined || validExternalAsset(value.default);
    default:
      return false;
  }
}

function validStudioContentFormField(value: unknown, depth = 0): boolean {
  if (
    depth > 24 ||
    !isRecord(value) ||
    !exactStudioContentKeys(value, [
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
    typeof value.id !== "string" ||
    !uuid.test(value.id) ||
    !(
      value.parentFieldId === null ||
      (typeof value.parentFieldId === "string" && uuid.test(value.parentFieldId))
    ) ||
    (value.nodeRole !== "root" &&
      value.nodeRole !== "object_property" &&
      value.nodeRole !== "list_item") ||
    !(value.displayLabel === null || boundedStudioContentString(value.displayLabel, 1, 100)) ||
    typeof value.kind !== "string" ||
    !(value.kind in studioFieldConfigurationKeys) ||
    !(value.required === null || typeof value.required === "boolean") ||
    !(
      value.localization === null ||
      value.localization === "shared" ||
      value.localization === "localized" ||
      value.localization === "mixed"
    ) ||
    !Number.isInteger(value.position) ||
    Number(value.position) < 0 ||
    Number(value.position) > 99 ||
    !(value.helpText === null || boundedStudioContentString(value.helpText, 0, 500)) ||
    !(value.placeholder === null || boundedStudioContentString(value.placeholder, 0, 200)) ||
    !validStudioContentFieldConfiguration(value.kind, value.configuration) ||
    !Array.isArray(value.children) ||
    value.children.length > 100
  ) {
    return false;
  }
  return value.children.every((child) => validStudioContentFormField(child, depth + 1));
}

function validStudioContentPlacement(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["id", "fieldId", "position", "helpTextOverride"]) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    typeof value.fieldId === "string" &&
    uuid.test(value.fieldId) &&
    Number.isInteger(value.position) &&
    Number(value.position) >= 0 &&
    Number(value.position) <= 99 &&
    (value.helpTextOverride === null || boundedStudioContentString(value.helpTextOverride, 0, 500))
  );
}

function validStudioContentGroup(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "id",
      "title",
      "description",
      "position",
      "columns",
      "fields",
    ]) &&
    typeof value.id === "string" &&
    uuid.test(value.id) &&
    boundedStudioContentString(value.title, 1, 100) &&
    (value.description === null || boundedStudioContentString(value.description, 0, 500)) &&
    Number.isInteger(value.position) &&
    Number(value.position) >= 0 &&
    Number(value.position) <= 19 &&
    (value.columns === 1 || value.columns === 2) &&
    Array.isArray(value.fields) &&
    value.fields.length <= 100 &&
    value.fields.every(validStudioContentPlacement)
  );
}

function validStudioContentForm(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !exactStudioContentKeys(value, [
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
    !/^[0-9a-f]{64}$/u.test(value.contractHash) ||
    typeof value.canEdit !== "boolean" ||
    !Array.isArray(value.fields) ||
    value.fields.length > 100 ||
    !value.fields.every((field) => validStudioContentFormField(field)) ||
    !Array.isArray(value.editableFieldIds) ||
    value.editableFieldIds.length > 100 ||
    value.editableFieldIds.some((id) => typeof id !== "string" || !uuid.test(id)) ||
    !Array.isArray(value.tabs) ||
    value.tabs.length > 10 ||
    !Array.isArray(value.sidebarGroups) ||
    value.sidebarGroups.length > 10 ||
    (value.tabs.length === 0 && value.sidebarGroups.length === 0) ||
    !value.sidebarGroups.every(validStudioContentGroup) ||
    !isRecord(value.currencyMinorUnits) ||
    Object.entries(value.currencyMinorUnits).some(
      ([currency, units]) =>
        !/^[A-Z]{3}$/u.test(currency) ||
        !Number.isInteger(units) ||
        Number(units) < 0 ||
        Number(units) > 3,
    )
  ) {
    return false;
  }
  return value.tabs.every(
    (tab) =>
      isRecord(tab) &&
      exactStudioContentKeys(tab, ["id", "title", "description", "position", "groups"]) &&
      typeof tab.id === "string" &&
      uuid.test(tab.id) &&
      boundedStudioContentString(tab.title, 1, 100) &&
      (tab.description === null || boundedStudioContentString(tab.description, 0, 500)) &&
      Number.isInteger(tab.position) &&
      Number(tab.position) >= 0 &&
      Number(tab.position) <= 9 &&
      Array.isArray(tab.groups) &&
      tab.groups.length >= 1 &&
      tab.groups.length <= 20 &&
      tab.groups.every(validStudioContentGroup),
  );
}

function validStudioContentPage(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["items", "hasMore", "nextCursor", "count"]) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.items.every(validStudioContentEntry) &&
    typeof value.hasMore === "boolean" &&
    (value.nextCursor === null || boundedStudioContentString(value.nextCursor, 1, 1_024)) &&
    isRecord(value.count) &&
    exactStudioContentKeys(value.count, ["value", "relation"]) &&
    Number.isInteger(value.count.value) &&
    Number(value.count.value) >= 0 &&
    Number(value.count.value) <= 1_000 &&
    (value.count.relation === "exact" ||
      (value.count.relation === "at_least" && value.count.value === 1_000))
  );
}

export type StudioContentSuccessKind =
  | "context"
  | "page"
  | "resolve"
  | "new_workspace"
  | "entry_workspace"
  | "create"
  | "rename"
  | "save"
  | "revision_page"
  | "revision"
  | "revision_comparison"
  | "restore"
  | "publication_status"
  | "publication_page"
  | "publication_plan"
  | "publish"
  | "unpublish"
  | "presentation"
  | "presentation_publish";

function studioUuidOrNull(value: unknown): boolean {
  return value === null || (typeof value === "string" && uuid.test(value));
}

function studioUuid(value: unknown): boolean {
  return typeof value === "string" && uuid.test(value);
}

function studioHash(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function studioCount(value: unknown, minimum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function studioFieldIds(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 100 &&
    value.every(studioUuid) &&
    new Set(value).size === value.length
  );
}

function validStudioRevisionSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
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
    ]) &&
    studioUuid(value.id) &&
    (value.scope === "shared" || value.scope === "localized") &&
    studioCount(value.sequence, 1) &&
    studioUuidOrNull(value.previousRevisionId) &&
    studioUuid(value.schemaRevisionId) &&
    studioHash(value.contractHash) &&
    studioFieldIds(value.changedFieldIds) &&
    studioUuidOrNull(value.restoredFromRevisionId) &&
    (value.authoredByUserId === null ||
      boundedStudioContentString(value.authoredByUserId, 1, 255)) &&
    studioUuidOrNull(value.authoredByCredentialId) &&
    validStudioContentIsoDateTime(value.authoredAt) &&
    typeof value.compatible === "boolean"
  );
}

function validStudioPublicationSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "id",
      "sequence",
      "schemaRevisionId",
      "contractHash",
      "changedFieldIds",
      "publishedAt",
      "current",
    ]) &&
    studioUuid(value.id) &&
    studioCount(value.sequence, 1) &&
    studioUuid(value.schemaRevisionId) &&
    studioHash(value.contractHash) &&
    studioFieldIds(value.changedFieldIds) &&
    validStudioContentIsoDateTime(value.publishedAt) &&
    typeof value.current === "boolean"
  );
}

function validStudioPublicationStatus(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "state",
      "stateVersion",
      "currentPublication",
      "sharedChanged",
      "localizedChanged",
      "schemaChanged",
      "changedSincePublication",
    ]) &&
    (value.state === "published" ||
      value.state === "unpublished" ||
      value.state === "never_published") &&
    studioCount(value.stateVersion, 0) &&
    (value.currentPublication === null ||
      validStudioPublicationSummary(value.currentPublication)) &&
    (value.state === "published") === (value.currentPublication !== null) &&
    typeof value.sharedChanged === "boolean" &&
    typeof value.localizedChanged === "boolean" &&
    typeof value.schemaChanged === "boolean" &&
    typeof value.changedSincePublication === "boolean"
  );
}

function validStudioDeliveryReadBack(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["status", "currentPublicationId"]) &&
    (value.status === "verified" || value.status === "superseded") &&
    studioUuidOrNull(value.currentPublicationId)
  );
}

function validStudioCursorPage(
  value: Readonly<Record<string, unknown>>,
  item: (value: unknown) => boolean,
): boolean {
  return (
    exactStudioContentKeys(value, ["items", "nextCursor"]) &&
    Array.isArray(value.items) &&
    value.items.length <= 50 &&
    value.items.every(item) &&
    (value.nextCursor === null ||
      (typeof value.nextCursor === "string" && /^[A-Za-z0-9_-]{1,1024}$/u.test(value.nextCursor)))
  );
}

function studioPosition(value: unknown, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}

function studioNullableText(value: unknown, maximum: number): boolean {
  return value === null || boundedStudioContentString(value, 0, maximum);
}

function validStudioPresentationGroup(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, [
      "id",
      "title",
      "description",
      "position",
      "columns",
      "fields",
    ]) &&
    studioUuid(value.id) &&
    boundedStudioContentString(value.title, 1, 100) &&
    studioNullableText(value.description, 500) &&
    studioPosition(value.position, 19) &&
    (value.columns === 1 || value.columns === 2) &&
    Array.isArray(value.fields) &&
    value.fields.length <= 100 &&
    value.fields.every(
      (placement) =>
        isRecord(placement) &&
        exactStudioContentKeys(placement, ["fieldId", "position", "helpTextOverride"]) &&
        studioUuid(placement.fieldId) &&
        studioPosition(placement.position, 99) &&
        studioNullableText(placement.helpTextOverride, 500),
    )
  );
}

function validStudioPresentationLayout(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["tabs", "sidebarGroups"]) &&
    Array.isArray(value.tabs) &&
    value.tabs.length >= 1 &&
    value.tabs.length <= 10 &&
    value.tabs.every(
      (tab) =>
        isRecord(tab) &&
        exactStudioContentKeys(tab, ["id", "title", "description", "position", "groups"]) &&
        studioUuid(tab.id) &&
        boundedStudioContentString(tab.title, 1, 100) &&
        studioNullableText(tab.description, 500) &&
        studioPosition(tab.position, 9) &&
        Array.isArray(tab.groups) &&
        tab.groups.length >= 1 &&
        tab.groups.length <= 20 &&
        tab.groups.every(validStudioPresentationGroup),
    ) &&
    Array.isArray(value.sidebarGroups) &&
    value.sidebarGroups.length <= 10 &&
    value.sidebarGroups.every(validStudioPresentationGroup)
  );
}

function validStudioPresentationField(value: unknown, document: boolean): boolean {
  const keys = ["fieldId", "displayLabel", "position", "helpText", "placeholder", "enumOptions"];
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, document ? [...keys, "parentFieldId", "kind"] : keys) &&
    studioUuid(value.fieldId) &&
    (value.displayLabel === null || boundedStudioContentString(value.displayLabel, 1, 100)) &&
    studioPosition(value.position, 99) &&
    studioNullableText(value.helpText, 500) &&
    studioNullableText(value.placeholder, 200) &&
    Array.isArray(value.enumOptions) &&
    value.enumOptions.length <= 100 &&
    value.enumOptions.every(
      (option) =>
        isRecord(option) &&
        exactStudioContentKeys(option, ["optionId", "label", "position"]) &&
        studioUuid(option.optionId) &&
        boundedStudioContentString(option.label, 1, 100) &&
        studioPosition(option.position, 99),
    ) &&
    (!document ||
      (studioUuidOrNull(value.parentFieldId) && boundedStudioContentString(value.kind, 1, 32)))
  );
}

function validStudioPresentationDocument(value: unknown, document: boolean): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["displayName", "description", "fields", "layout"]) &&
    boundedStudioContentString(value.displayName, 1, 100) &&
    studioNullableText(value.description, 500) &&
    Array.isArray(value.fields) &&
    value.fields.length >= 1 &&
    value.fields.length <= 100 &&
    value.fields.every((field) => validStudioPresentationField(field, document)) &&
    validStudioPresentationLayout(value.layout)
  );
}

function validStudioPresentation(value: unknown): boolean {
  return (
    isRecord(value) &&
    exactStudioContentKeys(value, ["collectionId", "revisionId", "sequence", "presentation"]) &&
    studioUuid(value.collectionId) &&
    studioUuid(value.revisionId) &&
    studioCount(value.sequence, 1) &&
    validStudioPresentationDocument(value.presentation, true)
  );
}

function validStudioPresentationBody(value: Readonly<Record<string, unknown>>): boolean {
  return (
    exactStudioContentKeys(value, [
      "commandId",
      "expectedRevisionId",
      "expectedSequence",
      "presentation",
    ]) &&
    studioUuid(value.commandId) &&
    studioUuid(value.expectedRevisionId) &&
    studioCount(value.expectedSequence, 1) &&
    validStudioPresentationDocument(value.presentation, false)
  );
}

function studioPresentationTarget(
  route: string,
  query: string,
  method: string,
): StudioContentTarget | null | undefined {
  const match = /^\/api\/content\/collections\/([^/]+)\/presentation(\/publish)?$/u.exec(route);
  if (match === null) return undefined;
  const collectionId = match[1] ?? "";
  if (!uuid.test(collectionId) || query !== "") return null;
  const upstreamPath = `/collections/${collectionId}/presentation`;
  if (match[2] === undefined) {
    return method === "GET"
      ? { upstreamPath, bodyAllowed: false, successKind: "presentation" }
      : null;
  }
  return method === "POST"
    ? {
        upstreamPath: `${upstreamPath}/publish`,
        bodyAllowed: true,
        successKind: "presentation_publish",
      }
    : null;
}

function validStudioHistorySuccessData(
  kind: StudioContentSuccessKind,
  value: Readonly<Record<string, unknown>>,
): boolean | null {
  switch (kind) {
    case "revision_page":
      return validStudioCursorPage(value, validStudioRevisionSummary);
    case "publication_page":
      return validStudioCursorPage(value, validStudioPublicationSummary);
    case "revision":
      return (
        exactStudioContentKeys(value, ["revision", "values"]) &&
        validStudioRevisionSummary(value.revision) &&
        validStudioContentEntryValues(value.values)
      );
    case "revision_comparison":
      return (
        exactStudioContentKeys(value, [
          "from",
          "to",
          "items",
          "restrictedChanges",
          "schemaDiffers",
        ]) &&
        validStudioRevisionSummary(value.from) &&
        validStudioRevisionSummary(value.to) &&
        Array.isArray(value.items) &&
        value.items.length <= 200 &&
        value.items.every(
          (item) =>
            isRecord(item) &&
            onlyStudioContentKeys(item, [
              "fieldId",
              "change",
              "before",
              "after",
              "inCurrentSchema",
            ]) &&
            studioUuid(item.fieldId) &&
            (item.change === "added" || item.change === "removed" || item.change === "changed") &&
            typeof item.inCurrentSchema === "boolean",
        ) &&
        typeof value.restrictedChanges === "boolean" &&
        typeof value.schemaDiffers === "boolean"
      );
    case "publication_status":
      return validStudioPublicationStatus(value);
    case "publication_plan":
      return (
        exactStudioContentKeys(value, [
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
        ]) &&
        (value.authorityHash === null || studioHash(value.authorityHash)) &&
        studioCount(value.stateVersion, 0) &&
        studioUuidOrNull(value.currentPublicationId) &&
        studioUuid(value.schemaRevisionId) &&
        studioHash(value.contractHash) &&
        studioCount(value.sharedVersion, 0) &&
        studioUuidOrNull(value.sharedRevisionId) &&
        studioCount(value.localizedVersion, 0) &&
        studioUuidOrNull(value.localizedRevisionId) &&
        typeof value.wouldCreatePublication === "boolean" &&
        validStudioContentValidation(value.validation) &&
        Array.isArray(value.entryIssues) &&
        value.entryIssues.length <= 50 &&
        value.entryIssues.every(
          (issue) =>
            isRecord(issue) &&
            exactStudioContentKeys(issue, ["code", "message"]) &&
            typeof issue.code === "string" &&
            /^[a-z][a-z0-9_]{0,63}$/u.test(issue.code) &&
            boundedStudioContentString(issue.message, 1, 512),
        )
      );
    case "publish":
      return (
        exactStudioContentKeys(value, [
          "commandId",
          "resultKind",
          "stateVersion",
          "publication",
          "delivery",
        ]) &&
        studioUuid(value.commandId) &&
        (value.resultKind === "changed" || value.resultKind === "no_op") &&
        studioCount(value.stateVersion, 0) &&
        validStudioPublicationSummary(value.publication) &&
        validStudioDeliveryReadBack(value.delivery)
      );
    case "unpublish":
      return (
        exactStudioContentKeys(value, [
          "commandId",
          "resultKind",
          "stateVersion",
          "unpublishedPublicationId",
          "unpublishedAt",
          "delivery",
        ]) &&
        studioUuid(value.commandId) &&
        (value.resultKind === "changed" || value.resultKind === "no_op") &&
        studioCount(value.stateVersion, 0) &&
        studioUuidOrNull(value.unpublishedPublicationId) &&
        validStudioContentIsoDateTime(value.unpublishedAt) &&
        validStudioDeliveryReadBack(value.delivery)
      );
    default:
      return null;
  }
}

function validStudioContentEntryValues(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).every((key) => uuid.test(key));
}

function validStudioContentSuccessData(
  kind: StudioContentSuccessKind,
  value: unknown,
  requestedResolutionIds?: ReadonlyArray<string>,
): boolean {
  if (!isRecord(value)) return false;
  const history = validStudioHistorySuccessData(kind, value);
  if (history !== null) return history;
  if (kind === "presentation") return validStudioPresentation(value);
  if (kind === "presentation_publish") {
    return (
      exactStudioContentKeys(value, ["replayed", "noOp", "presentation"]) &&
      typeof value.replayed === "boolean" &&
      typeof value.noOp === "boolean" &&
      validStudioPresentation(value.presentation)
    );
  }
  if (kind === "page") return validStudioContentPage(value);
  if (kind === "resolve") {
    if (
      requestedResolutionIds === undefined ||
      !exactStudioContentKeys(value, ["items"]) ||
      !Array.isArray(value.items) ||
      value.items.length > requestedResolutionIds.length ||
      !value.items.every(
        (item) =>
          isRecord(item) &&
          exactStudioContentKeys(item, ["id", "displayName"]) &&
          typeof item.id === "string" &&
          uuid.test(item.id) &&
          boundedStudioContentString(item.displayName, 1, 100),
      ) ||
      new Set(value.items.map((item) => (isRecord(item) ? item.id : null))).size !==
        value.items.length
    ) {
      return false;
    }
    let previousIndex = -1;
    return value.items.every((item) => {
      if (!isRecord(item) || typeof item.id !== "string") return false;
      const index = requestedResolutionIds.indexOf(item.id);
      if (index <= previousIndex) return false;
      previousIndex = index;
      return true;
    });
  }
  if (kind === "rename") return validStudioContentEntry(value);
  if (kind === "context") {
    return (
      exactStudioContentKeys(value, ["locales", "collections", "configurationNotices"]) &&
      Array.isArray(value.locales) &&
      value.locales.length <= 100 &&
      value.locales.every(
        (locale) =>
          isRecord(locale) &&
          exactStudioContentKeys(locale, [
            "id",
            "tag",
            "displayName",
            "canRead",
            "canWrite",
            "canPublish",
          ]) &&
          typeof locale.id === "string" &&
          uuid.test(locale.id) &&
          boundedStudioContentString(locale.tag, 2, 35) &&
          boundedStudioContentString(locale.displayName, 1, 100) &&
          locale.canRead === true &&
          typeof locale.canWrite === "boolean" &&
          typeof locale.canPublish === "boolean",
      ) &&
      Array.isArray(value.collections) &&
      value.collections.length <= 50 &&
      value.collections.every(
        (collection) =>
          isRecord(collection) &&
          exactStudioContentKeys(collection, ["id", "displayName", "capabilities"]) &&
          typeof collection.id === "string" &&
          uuid.test(collection.id) &&
          boundedStudioContentString(collection.displayName, 1, 100) &&
          validStudioContentCapabilities(collection.capabilities),
      ) &&
      Array.isArray(value.configurationNotices) &&
      value.configurationNotices.length <= 50 &&
      value.configurationNotices.every(
        (notice) =>
          isRecord(notice) &&
          exactStudioContentKeys(notice, ["collectionId", "displayName", "reason"]) &&
          typeof notice.collectionId === "string" &&
          uuid.test(notice.collectionId) &&
          boundedStudioContentString(notice.displayName, 1, 100) &&
          (notice.reason === "empty_schema" || notice.reason === "projection_invalid"),
      )
    );
  }
  if (kind === "new_workspace" || kind === "entry_workspace") {
    const expected =
      kind === "new_workspace"
        ? ["localeId", "locale", "form", "capabilities"]
        : ["localeId", "locale", "form", "capabilities", "draft", "publication"];
    if (
      !exactStudioContentKeys(value, expected) ||
      typeof value.localeId !== "string" ||
      !uuid.test(value.localeId) ||
      !boundedStudioContentString(value.locale, 2, 35) ||
      !validStudioContentForm(value.form) ||
      !validStudioContentCapabilities(value.capabilities)
    ) {
      return false;
    }
    if (kind === "new_workspace") return true;
    const draft = value.draft;
    return (
      validStudioPublicationStatus(value.publication) &&
      isRecord(draft) &&
      exactStudioContentKeys(draft, [
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
      ]) &&
      validStudioContentEntry(draft.entry) &&
      typeof draft.schemaRevisionId === "string" &&
      uuid.test(draft.schemaRevisionId) &&
      typeof draft.contractHash === "string" &&
      /^[0-9a-f]{64}$/u.test(draft.contractHash) &&
      Number.isSafeInteger(draft.sharedVersion) &&
      Number(draft.sharedVersion) >= 0 &&
      (draft.sharedRevisionId === null ||
        (typeof draft.sharedRevisionId === "string" && uuid.test(draft.sharedRevisionId))) &&
      validStudioContentEntryValues(draft.sharedValues) &&
      Number.isSafeInteger(draft.localizedVersion) &&
      Number(draft.localizedVersion) >= 0 &&
      (draft.localizedRevisionId === null ||
        (typeof draft.localizedRevisionId === "string" && uuid.test(draft.localizedRevisionId))) &&
      validStudioContentEntryValues(draft.localizedValues) &&
      validStudioContentValidation(draft.validation)
    );
  }
  if (kind === "create") {
    return (
      exactStudioContentKeys(value, [
        "entry",
        "commandId",
        "sharedVersion",
        "sharedRevisionId",
        "localizedVersion",
        "localizedRevisionId",
        "validation",
      ]) &&
      validStudioContentEntry(value.entry) &&
      typeof value.commandId === "string" &&
      uuid.test(value.commandId) &&
      Number.isSafeInteger(value.sharedVersion) &&
      Number(value.sharedVersion) >= 0 &&
      (value.sharedRevisionId === null ||
        (typeof value.sharedRevisionId === "string" && uuid.test(value.sharedRevisionId))) &&
      Number.isSafeInteger(value.localizedVersion) &&
      Number(value.localizedVersion) >= 0 &&
      (value.localizedRevisionId === null ||
        (typeof value.localizedRevisionId === "string" && uuid.test(value.localizedRevisionId))) &&
      validStudioContentValidation(value.validation)
    );
  }
  return (
    exactStudioContentKeys(value, [
      "entryId",
      "commandId",
      "sharedChanged",
      "sharedVersion",
      "sharedRevisionId",
      "localizedChanged",
      "localizedVersion",
      "localizedRevisionId",
      "validation",
    ]) &&
    typeof value.entryId === "string" &&
    uuid.test(value.entryId) &&
    typeof value.commandId === "string" &&
    uuid.test(value.commandId) &&
    typeof value.sharedChanged === "boolean" &&
    Number.isSafeInteger(value.sharedVersion) &&
    Number(value.sharedVersion) >= 0 &&
    (value.sharedRevisionId === null ||
      (typeof value.sharedRevisionId === "string" && uuid.test(value.sharedRevisionId))) &&
    typeof value.localizedChanged === "boolean" &&
    Number.isSafeInteger(value.localizedVersion) &&
    Number(value.localizedVersion) >= 0 &&
    (value.localizedRevisionId === null ||
      (typeof value.localizedRevisionId === "string" && uuid.test(value.localizedRevisionId))) &&
    validStudioContentValidation(value.validation)
  );
}

function validStudioContentErrorDetail(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "path",
    "code",
    "message",
    "scope",
    "expectedVersion",
    "currentVersion",
    "currentRevisionId",
  ]);
  return (
    Object.keys(value).every((key) => allowed.has(key)) &&
    boundedStudioContentString(value.code, 1, 64) &&
    boundedStudioContentString(value.message, 1, 512) &&
    (value.path === undefined || boundedStudioContentString(value.path, 0, 256)) &&
    (value.scope === undefined || value.scope === "shared" || value.scope === "localized") &&
    (value.expectedVersion === undefined ||
      (Number.isSafeInteger(value.expectedVersion) && Number(value.expectedVersion) >= 0)) &&
    (value.currentVersion === undefined ||
      (Number.isSafeInteger(value.currentVersion) && Number(value.currentVersion) >= 0)) &&
    (value.currentRevisionId === undefined ||
      value.currentRevisionId === null ||
      (typeof value.currentRevisionId === "string" && uuid.test(value.currentRevisionId)))
  );
}

export function validStudioContentEnvelope(
  value: unknown,
  status: number,
  successKind: StudioContentSuccessKind,
  requestedResolutionIds?: ReadonlyArray<string>,
): value is Readonly<Record<string, unknown>> {
  if (
    !isRecord(value) ||
    Object.keys(value).sort().join(",") !== "data,error,message,ok" ||
    !boundedStudioContentString(value.message, 1, 512) ||
    !safeStudioContentResponseValue(value)
  ) {
    return false;
  }
  if (value.ok === true) {
    return (
      status === 200 &&
      value.error === null &&
      validStudioContentSuccessData(successKind, value.data, requestedResolutionIds)
    );
  }
  if (value.ok !== false || status < 400 || status > 599 || value.data !== null) return false;
  const error = value.error;
  if (!isRecord(error)) return false;
  const allowed = new Set([
    "code",
    "message",
    "details",
    "configurationReason",
    "retryable",
    "requestId",
  ]);
  const expectedStatus = studioContentErrorStatus(error.code);
  const configurationReasonIsCoherent =
    error.code === "STUDIO_COLLECTION_CONFIGURATION_INVALID"
      ? error.configurationReason === "empty_schema" ||
        error.configurationReason === "projection_invalid"
      : error.configurationReason === undefined;
  return (
    Object.keys(error).every((key) => allowed.has(key)) &&
    expectedStatus !== null &&
    status === expectedStatus &&
    boundedStudioContentString(error.message, 1, 512) &&
    typeof error.retryable === "boolean" &&
    boundedStudioContentString(error.requestId, 1, 128) &&
    configurationReasonIsCoherent &&
    (error.details === undefined ||
      (Array.isArray(error.details) &&
        error.details.length >= 1 &&
        error.details.length <= 20 &&
        error.details.every(validStudioContentErrorDetail)))
  );
}

export interface StudioContentTarget {
  readonly upstreamPath: string;
  readonly bodyAllowed: boolean;
  readonly successKind: StudioContentSuccessKind;
}

export function isStudioContentShellRoute(route: string): boolean {
  if (route === "/content") return true;
  const layout = /^\/content\/([^/]+)\/layout$/u.exec(route);
  if (layout !== null) return uuid.test(layout[1] ?? "");
  const match = /^\/content\/([^/]+)\/locales\/([^/]+)(?:\/entries\/(new|[^/]+))?$/u.exec(route);
  if (match === null || !uuid.test(match[1] ?? "")) return false;
  const locale = match[2] ?? "";
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(locale) || locale.length > 35) {
    return false;
  }
  const entry = match[3];
  return entry === undefined || entry === "new" || uuid.test(entry);
}

export function studioContentTarget(
  route: string,
  query: string,
  method: string,
): StudioContentTarget | null {
  if (route === "/api/content/context" && method === "GET" && query === "") {
    return { upstreamPath: "/context", bodyAllowed: false, successKind: "context" };
  }
  const presentation = studioPresentationTarget(route, query, method);
  if (presentation !== undefined) return presentation;
  const match =
    /^\/api\/content\/collections\/([^/]+)\/locales\/([^/]+)\/entries(?:\/(.*))?$/u.exec(route);
  if (match === null || !uuid.test(match[1] ?? "")) return null;
  const collectionId = match[1] as string;
  const locale = match[2] ?? "";
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(locale) || locale.length > 35) return null;
  const suffix = match[3];
  const base = `/collections/${collectionId}/locales/${locale}/entries`;
  if (suffix === undefined && method === "GET") {
    const parameters = new URLSearchParams(query);
    const keys = [...parameters.keys()];
    if (
      keys.some((key) => key !== "cursor" && key !== "limit") ||
      new Set(keys).size !== keys.length
    ) {
      return null;
    }
    const cursor = parameters.get("cursor");
    const limit = parameters.get("limit");
    if (
      (cursor !== null && !/^[A-Za-z0-9_-]{1,1024}$/u.test(cursor)) ||
      (limit !== null && !/^(?:[1-4][0-9]|50)$/u.test(limit))
    ) {
      return null;
    }
    return {
      upstreamPath: `${base}${query === "" ? "" : `?${query}`}`,
      bodyAllowed: false,
      successKind: "page",
    };
  }
  const history = studioHistoryTarget(base, suffix ?? "", query, method);
  if (history !== undefined) return history;
  if (query !== "") return null;
  if (suffix === "search" && method === "POST") {
    return { upstreamPath: `${base}/search`, bodyAllowed: true, successKind: "page" };
  }
  if (suffix === "resolve" && method === "POST") {
    return { upstreamPath: `${base}/resolve`, bodyAllowed: true, successKind: "resolve" };
  }
  if (suffix === "new" && method === "GET") {
    return {
      upstreamPath: `${base}/new`,
      bodyAllowed: false,
      successKind: "new_workspace",
    };
  }
  if (suffix === undefined && method === "POST") {
    return { upstreamPath: base, bodyAllowed: true, successKind: "create" };
  }
  const nested = /^([0-9a-f-]+)\/(name|draft)$/iu.exec(suffix ?? "");
  if (nested !== null && uuid.test(nested[1] ?? "") && method === "PATCH") {
    return {
      upstreamPath: `${base}/${nested[1]}/${nested[2]}`,
      bodyAllowed: true,
      successKind: nested[2] === "name" ? "rename" : "save",
    };
  }
  if (suffix !== undefined && uuid.test(suffix) && method === "GET") {
    return {
      upstreamPath: `${base}/${suffix}`,
      bodyAllowed: false,
      successKind: "entry_workspace",
    };
  }
  return null;
}

function studioPageQuery(query: string, scopeRequired: boolean): boolean {
  const parameters = new URLSearchParams(query);
  const keys = [...parameters.keys()];
  const allowed = scopeRequired ? ["scope", "cursor", "limit"] : ["cursor", "limit"];
  if (keys.some((key) => !allowed.includes(key)) || new Set(keys).size !== keys.length) {
    return false;
  }
  const scope = parameters.get("scope");
  const cursor = parameters.get("cursor");
  const limit = parameters.get("limit");
  return (
    (!scopeRequired || scope === "shared" || scope === "localized") &&
    (cursor === null || /^[A-Za-z0-9_-]{1,1024}$/u.test(cursor)) &&
    (limit === null || /^(?:[1-4][0-9]|50)$/u.test(limit))
  );
}

function studioHistoryTarget(
  base: string,
  suffix: string,
  query: string,
  method: string,
): StudioContentTarget | null | undefined {
  const match =
    /^([0-9a-f-]{36})\/(revisions|publications|publication)(?:\/(validate|publish|unpublish)|\/([0-9a-f-]{36})(?:\/(restore)|\/compare\/([0-9a-f-]{36}))?)?$/iu.exec(
      suffix,
    );
  if (match === null) return undefined;
  const [, entryId = "", family, action, revisionId, restore, toRevisionId] = match;
  if (
    !uuid.test(entryId) ||
    (revisionId !== undefined && !uuid.test(revisionId)) ||
    (toRevisionId !== undefined && !uuid.test(toRevisionId))
  ) {
    return null;
  }
  const entry = `${base}/${entryId}`;
  const canonicalQuery = new URLSearchParams(query).toString();
  const read = (upstreamPath: string, successKind: StudioContentSuccessKind) =>
    method === "GET" ? { upstreamPath, bodyAllowed: false, successKind } : null;
  const command = (upstreamPath: string, successKind: StudioContentSuccessKind) =>
    method === "POST" && query === "" ? { upstreamPath, bodyAllowed: true, successKind } : null;
  if (family === "revisions" && revisionId === undefined) {
    if (action !== undefined || !studioPageQuery(query, true)) return null;
    return read(`${entry}/revisions?${canonicalQuery}`, "revision_page");
  }
  if (family === "publications") {
    if (action !== undefined || revisionId !== undefined || !studioPageQuery(query, false)) {
      return null;
    }
    return read(
      `${entry}/publications${canonicalQuery === "" ? "" : `?${canonicalQuery}`}`,
      "publication_page",
    );
  }
  if (query !== "") return null;
  if (family === "revisions" && revisionId !== undefined) {
    if (action !== undefined) return null;
    if (toRevisionId !== undefined) {
      return read(
        `${entry}/revisions/${revisionId}/compare/${toRevisionId}`,
        "revision_comparison",
      );
    }
    if (restore !== undefined)
      return command(`${entry}/revisions/${revisionId}/restore`, "restore");
    return read(`${entry}/revisions/${revisionId}`, "revision");
  }
  if (family !== "publication" || revisionId !== undefined) return null;
  if (action === undefined) return read(`${entry}/publication`, "publication_status");
  if (action === "validate") return command(`${entry}/publication/validate`, "publication_plan");
  return command(`${entry}/publication/${action}`, action === "publish" ? "publish" : "unpublish");
}

function boundedStudioMutationValue(value: unknown): boolean {
  const stack: Array<{ readonly value: unknown; readonly depth: number }> = [{ value, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > 10_000 || current.depth > 24) return false;
    if (typeof current.value !== "object" || current.value === null) continue;
    const nested = Array.isArray(current.value) ? current.value : Object.values(current.value);
    for (const item of nested) stack.push({ value: item, depth: current.depth + 1 });
  }
  return true;
}

function validStudioMutation(value: unknown): boolean {
  if (!isRecord(value) || typeof value.operation !== "string" || !Array.isArray(value.path)) {
    return false;
  }
  if (
    value.path.length < 1 ||
    value.path.length > 16 ||
    value.path.some(
      (segment) =>
        !(
          (typeof segment === "string" && uuid.test(segment)) ||
          (typeof segment === "number" &&
            Number.isSafeInteger(segment) &&
            segment >= 0 &&
            segment <= 100)
        ),
    )
  ) {
    return false;
  }
  if (value.operation === "set") {
    return (
      Object.keys(value).sort().join(",") === "operation,path,value" &&
      boundedStudioMutationValue(value.value)
    );
  }
  if (value.operation === "unset") {
    return Object.keys(value).sort().join(",") === "operation,path";
  }
  if (value.operation === "list_insert") {
    return (
      Object.keys(value).sort().join(",") === "index,operation,path,value" &&
      typeof value.index === "number" &&
      Number.isSafeInteger(value.index) &&
      value.index >= 0 &&
      value.index <= 100 &&
      boundedStudioMutationValue(value.value)
    );
  }
  if (value.operation === "list_remove") {
    return (
      Object.keys(value).sort().join(",") === "index,operation,path" &&
      typeof value.index === "number" &&
      Number.isSafeInteger(value.index) &&
      value.index >= 0 &&
      value.index <= 99
    );
  }
  return false;
}

function validStudioMutations(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 500 && value.every(validStudioMutation);
}

export function studioContentCommandRoute(route: string): boolean {
  return /\/entries\/[^/]+\/(?:revisions\/[^/]+\/restore|publication\/(?:validate|publish|unpublish))$/u.test(
    route,
  );
}

function studioVersion(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validStudioHistoryBody(route: string, value: Readonly<Record<string, unknown>>): boolean {
  if (route.endsWith("/restore")) {
    return (
      exactStudioContentKeys(value, [
        "scope",
        "schemaRevisionId",
        "contractHash",
        "expectedVersion",
        "commandId",
      ]) &&
      (value.scope === "shared" || value.scope === "localized") &&
      studioUuid(value.schemaRevisionId) &&
      studioHash(value.contractHash) &&
      studioVersion(value.expectedVersion) &&
      studioUuid(value.commandId)
    );
  }
  if (route.endsWith("/validate")) return Object.keys(value).length === 0;
  if (route.endsWith("/unpublish")) {
    return (
      exactStudioContentKeys(value, [
        "commandId",
        "expectedStateVersion",
        "expectedPublicationId",
      ]) &&
      studioUuid(value.commandId) &&
      studioVersion(value.expectedStateVersion) &&
      studioUuidOrNull(value.expectedPublicationId)
    );
  }
  return (
    exactStudioContentKeys(value, [
      "commandId",
      "authorityHash",
      "expectedStateVersion",
      "expectedPublicationId",
      "expectedSchemaRevisionId",
      "expectedContractHash",
      "expectedSharedVersion",
      "expectedSharedRevisionId",
      "expectedLocalizedVersion",
      "expectedLocalizedRevisionId",
    ]) &&
    studioUuid(value.commandId) &&
    studioHash(value.authorityHash) &&
    studioVersion(value.expectedStateVersion) &&
    studioUuidOrNull(value.expectedPublicationId) &&
    studioUuid(value.expectedSchemaRevisionId) &&
    studioHash(value.expectedContractHash) &&
    studioVersion(value.expectedSharedVersion) &&
    studioUuidOrNull(value.expectedSharedRevisionId) &&
    studioVersion(value.expectedLocalizedVersion) &&
    studioUuidOrNull(value.expectedLocalizedRevisionId)
  );
}

export function validStudioContentBody(route: string, value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (route.endsWith("/presentation/publish")) return validStudioPresentationBody(value);
  if (studioContentCommandRoute(route)) return validStudioHistoryBody(route, value);
  if (route.endsWith("/search")) {
    return (
      Object.keys(value).sort().join(",") === "cursor,limit,query" &&
      typeof value.query === "string" &&
      value.query.trim().length >= 2 &&
      value.query.trim().length <= 100 &&
      (value.cursor === null ||
        (typeof value.cursor === "string" && /^[A-Za-z0-9_-]{1,1024}$/u.test(value.cursor))) &&
      typeof value.limit === "number" &&
      Number.isSafeInteger(value.limit) &&
      value.limit >= 10 &&
      value.limit <= 50
    );
  }
  if (route.endsWith("/resolve")) {
    return (
      exactStudioContentKeys(value, ["entryIds"]) &&
      Array.isArray(value.entryIds) &&
      value.entryIds.length >= 1 &&
      value.entryIds.length <= 100 &&
      value.entryIds.every((entryId) => typeof entryId === "string" && uuid.test(entryId)) &&
      new Set(value.entryIds).size === value.entryIds.length
    );
  }
  if (route.endsWith("/name")) {
    return (
      Object.keys(value).sort().join(",") === "displayName,expectedNameVersion" &&
      typeof value.displayName === "string" &&
      value.displayName.trim().length >= 1 &&
      value.displayName.trim().length <= 100 &&
      typeof value.expectedNameVersion === "number" &&
      Number.isSafeInteger(value.expectedNameVersion) &&
      value.expectedNameVersion >= 1
    );
  }
  const isDraft = route.endsWith("/draft");
  const expectedKeys = isDraft
    ? "commandId,contractHash,expectedLocalizedVersion,expectedSharedVersion,localizedMutations,schemaRevisionId,sharedMutations"
    : "commandId,contractHash,displayName,localizedMutations,schemaRevisionId,sharedMutations";
  if (Object.keys(value).sort().join(",") !== expectedKeys) return false;
  return (
    typeof value.commandId === "string" &&
    uuid.test(value.commandId) &&
    typeof value.schemaRevisionId === "string" &&
    uuid.test(value.schemaRevisionId) &&
    typeof value.contractHash === "string" &&
    /^[0-9a-f]{64}$/u.test(value.contractHash) &&
    validStudioMutations(value.sharedMutations) &&
    validStudioMutations(value.localizedMutations) &&
    (isDraft
      ? typeof value.expectedSharedVersion === "number" &&
        Number.isSafeInteger(value.expectedSharedVersion) &&
        value.expectedSharedVersion >= 0 &&
        typeof value.expectedLocalizedVersion === "number" &&
        Number.isSafeInteger(value.expectedLocalizedVersion) &&
        value.expectedLocalizedVersion >= 0
      : typeof value.displayName === "string" &&
        value.displayName.trim().length >= 1 &&
        value.displayName.trim().length <= 100)
  );
}
export function escapeStudioHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export const studioPreviewLaunchMessages: Readonly<Record<string, string>> = {
  PREVIEW_TARGET_REQUIRED:
    "Preview is off for this environment. Ask a developer to set a Preview URL.",
  PREVIEW_REVISION_INCOMPATIBLE:
    "This point in history uses another content model and cannot be previewed.",
  NOT_FOUND: "This entry is unavailable or you no longer have access.",
  FORBIDDEN: "You do not have access to preview this entry.",
  RATE_LIMITED: "Preview is busy. Wait a moment and reload the preview.",
};

export function validPreviewHandoff(
  value: unknown,
  status: number,
  previewUrl: string,
): value is { readonly data: { readonly token: string } } {
  return (
    status === 200 &&
    isRecord(value) &&
    value.ok === true &&
    isRecord(value.data) &&
    typeof value.data.token === "string" &&
    value.data.token.length <= 2_048 &&
    /^ffd_pvh_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/u.test(value.data.token) &&
    value.data.previewUrl === previewUrl
  );
}

export interface StudioDocumentInput {
  readonly host: "mounted" | "local_editor";
  readonly mountPath: string;
  readonly dashboardOrigin: string | null;
  readonly entryScript: string;
  readonly stylesheets: ReadonlyArray<string>;
  readonly previewEnabled: boolean;
}

export function renderStudioDocument(input: StudioDocumentInput): string {
  const meta = [
    `<meta name="ffd-studio-mount" content="${escapeStudioHtml(input.mountPath)}">`,
    input.host === "local_editor" ? '<meta name="ffd-studio-host" content="local_editor">' : "",
    input.dashboardOrigin === null
      ? ""
      : `<meta name="ffd-studio-dashboard-origin" content="${escapeStudioHtml(input.dashboardOrigin)}">`,
    input.previewEnabled ? '<meta name="ffd-studio-preview" content="enabled">' : "",
  ].join("");
  const stylesheets = input.stylesheets
    .map(
      (path) => `<link rel="stylesheet" href="${escapeStudioHtml(`${input.mountPath}${path}`)}">`,
    )
    .join("");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${meta}<title>Studio</title>${stylesheets}</head><body><a class="sr-only focus:not-sr-only" href="#main-content">Skip to content</a><div id="studio-root"></div><noscript>Studio requires JavaScript.</noscript><script type="module" src="${escapeStudioHtml(`${input.mountPath}${input.entryScript}`)}"></script></body></html>\n`;
}
