import type { ProjectSchema } from "./index";

const API_KEY_PATTERN = /^[a-z][a-z0-9_]{0,62}$/u;
const SOURCE_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,62}$/u;
const DECIMAL_PATTERN = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const CURRENCY_PATTERN = /^[A-Z]{3}$/u;
const RESERVED_KEYS = new Set([
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
const FIELD_KINDS = new Set([
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
const LOCALIZATIONS = new Set(["localized", "shared", "mixed"]);
const BASE_FIELD_KEYS = [
  "sourceKey",
  "apiKey",
  "kind",
  "required",
  "localization",
  "deprecated",
  "configuration",
];
const BASE_ITEM_KEYS = ["sourceKey", "kind", "localization", "deprecated", "configuration"];

export interface StaticSchemaValidationIssue {
  readonly path: string;
  readonly code: string;
}

export type StaticSchemaValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly issues: ReadonlyArray<StaticSchemaValidationIssue> };

interface ValidationContext {
  readonly issues: Array<StaticSchemaValidationIssue>;
  readonly collectionSourceKeys: Set<string>;
  readonly collectionApiKeys: Set<string>;
  readonly referenceTargets: Array<{ readonly sourceKey: string; readonly path: string }>;
}

interface CollectionContext {
  readonly fieldSourceKeys: Set<string>;
  nodes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function property(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

function addIssue(context: ValidationContext, path: string, code: string): void {
  if (context.issues.length < 50) context.issues.push({ path, code });
}

function exactKeys(
  context: ValidationContext,
  value: Record<string, unknown>,
  path: string,
  allowed: ReadonlyArray<string>,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) addIssue(context, `${path}.${key}`, "property_unknown");
  }
}

function validateSourceKey(
  context: ValidationContext,
  value: unknown,
  path: string,
): value is string {
  if (
    typeof value !== "string" ||
    !SOURCE_KEY_PATTERN.test(value) ||
    value.includes("--") ||
    value.includes("__") ||
    value.endsWith("-") ||
    value.endsWith("_") ||
    RESERVED_KEYS.has(value)
  ) {
    addIssue(context, path, "source_key_invalid");
    return false;
  }
  return true;
}

function validateApiKey(context: ValidationContext, value: unknown, path: string): value is string {
  if (
    typeof value !== "string" ||
    !API_KEY_PATTERN.test(value) ||
    value.includes("__") ||
    value.endsWith("_") ||
    RESERVED_KEYS.has(value)
  ) {
    addIssue(context, path, "api_key_invalid");
    return false;
  }
  return true;
}

function validateOptionalBoolean(
  context: ValidationContext,
  value: Record<string, unknown>,
  key: string,
  path: string,
): void {
  const candidate = property(value, key);
  if (candidate !== undefined && typeof candidate !== "boolean") {
    addIssue(context, `${path}.${key}`, "boolean_invalid");
  }
}

function validateOptionalString(
  context: ValidationContext,
  value: Record<string, unknown>,
  key: string,
  path: string,
  maximum: number,
): void {
  const candidate = property(value, key);
  if (candidate !== undefined && (typeof candidate !== "string" || candidate.length > maximum)) {
    addIssue(context, `${path}.${key}`, "string_invalid");
  }
}

function validateOptionalFiniteNumber(
  context: ValidationContext,
  value: Record<string, unknown>,
  key: string,
  path: string,
): void {
  const candidate = property(value, key);
  if (candidate !== undefined && (typeof candidate !== "number" || !Number.isFinite(candidate))) {
    addIssue(context, `${path}.${key}`, "number_invalid");
  }
}

function validateOptionalInteger(
  context: ValidationContext,
  value: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
): void {
  const candidate = property(value, key);
  if (
    candidate !== undefined &&
    (typeof candidate !== "number" ||
      !Number.isInteger(candidate) ||
      candidate < minimum ||
      candidate > maximum)
  ) {
    addIssue(context, `${path}.${key}`, "integer_invalid");
  }
}

function validateTextConfiguration(
  context: ValidationContext,
  configuration: Record<string, unknown>,
  path: string,
  defaultMaximum: number,
): void {
  exactKeys(context, configuration, path, ["minLength", "maxLength", "pattern", "default"]);
  validateOptionalInteger(context, configuration, "minLength", path, 0, defaultMaximum);
  validateOptionalInteger(context, configuration, "maxLength", path, 0, defaultMaximum);
  validateOptionalString(context, configuration, "pattern", path, 256);
  validateOptionalString(context, configuration, "default", path, defaultMaximum);
}

function validateDecimal(
  context: ValidationContext,
  value: unknown,
  path: string,
  optional: boolean,
): void {
  if (optional && value === undefined) return;
  if (typeof value !== "string" || value.length > 58 || !DECIMAL_PATTERN.test(value)) {
    addIssue(context, path, "decimal_invalid");
  }
}

function validateStringArray(
  context: ValidationContext,
  value: unknown,
  path: string,
  allowed: ReadonlySet<string>,
  maximum: number,
): void {
  if (!Array.isArray(value) || value.length > maximum) {
    addIssue(context, path, "array_invalid");
    return;
  }
  const unique = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !allowed.has(item) || unique.has(item)) {
      addIssue(context, `${path}[${index}]`, "array_item_invalid");
    } else {
      unique.add(item);
    }
  }
}

function validatePortableText(context: ValidationContext, value: unknown, path: string): void {
  if (!isRecord(value)) {
    addIssue(context, path, "portable_text_invalid");
    return;
  }
  exactKeys(context, value, path, ["version", "profile", "blocks"]);
  if (property(value, "version") !== 1 || property(value, "profile") !== "ffd-portable-text") {
    addIssue(context, path, "portable_text_profile_invalid");
  }
  const blocks = property(value, "blocks");
  if (!Array.isArray(blocks) || blocks.length > 500) {
    addIssue(context, `${path}.blocks`, "portable_text_blocks_invalid");
    return;
  }
  for (const [index, block] of blocks.entries()) {
    if (!isRecord(block)) {
      addIssue(context, `${path}.blocks[${index}]`, "portable_text_block_invalid");
      continue;
    }
    exactKeys(context, block, `${path}.blocks[${index}]`, [
      "_key",
      "_type",
      "style",
      "listItem",
      "level",
      "children",
      "markDefs",
    ]);
    if (
      typeof property(block, "_key") !== "string" ||
      property(block, "_type") !== "block" ||
      typeof property(block, "style") !== "string" ||
      !Array.isArray(property(block, "children")) ||
      !Array.isArray(property(block, "markDefs"))
    ) {
      addIssue(context, `${path}.blocks[${index}]`, "portable_text_block_invalid");
    }
  }
}

function validateExternalAsset(context: ValidationContext, value: unknown, path: string): void {
  if (!isRecord(value)) {
    addIssue(context, path, "external_asset_invalid");
    return;
  }
  exactKeys(context, value, path, ["source", "url", "kind", "title", "alt", "width", "height"]);
  if (property(value, "source") !== "external")
    addIssue(context, `${path}.source`, "literal_invalid");
  const url = property(value, "url");
  if (typeof url !== "string" || url.length === 0 || url.length > 2_048) {
    addIssue(context, `${path}.url`, "url_invalid");
  }
  const kind = property(value, "kind");
  if (
    typeof kind !== "string" ||
    !new Set(["image", "video", "audio", "document", "archive", "other"]).has(kind)
  ) {
    addIssue(context, `${path}.kind`, "asset_kind_invalid");
  }
  for (const key of ["title", "alt"]) {
    const candidate = property(value, key);
    if (candidate !== null && (typeof candidate !== "string" || candidate.length > 500)) {
      addIssue(context, `${path}.${key}`, "nullable_string_invalid");
    }
  }
  for (const key of ["width", "height"]) {
    const candidate = property(value, key);
    if (
      candidate !== null &&
      (typeof candidate !== "number" ||
        !Number.isInteger(candidate) ||
        candidate < 1 ||
        candidate > 100_000)
    ) {
      addIssue(context, `${path}.${key}`, "nullable_dimension_invalid");
    }
  }
}

function validateConfiguration(
  context: ValidationContext,
  kind: string,
  value: unknown,
  path: string,
): void {
  if (!isRecord(value)) {
    addIssue(context, path, "configuration_invalid");
    return;
  }
  switch (kind) {
    case "short_text":
      validateTextConfiguration(context, value, path, 500);
      return;
    case "long_text":
      validateTextConfiguration(context, value, path, 50_000);
      return;
    case "rich_text": {
      exactKeys(context, value, path, [
        "styles",
        "decorators",
        "links",
        "lists",
        "minLength",
        "maxLength",
        "default",
      ]);
      const styles = property(value, "styles");
      if (styles !== undefined)
        validateStringArray(
          context,
          styles,
          `${path}.styles`,
          new Set(["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"]),
          7,
        );
      const decorators = property(value, "decorators");
      if (decorators !== undefined)
        validateStringArray(
          context,
          decorators,
          `${path}.decorators`,
          new Set(["strong", "em", "underline", "strike-through", "code"]),
          5,
        );
      const lists = property(value, "lists");
      if (lists !== undefined)
        validateStringArray(context, lists, `${path}.lists`, new Set(["bullet", "number"]), 2);
      validateOptionalBoolean(context, value, "links", path);
      validateOptionalInteger(context, value, "minLength", path, 0, 100_000);
      validateOptionalInteger(context, value, "maxLength", path, 0, 100_000);
      const defaultValue = property(value, "default");
      if (defaultValue !== undefined)
        validatePortableText(context, defaultValue, `${path}.default`);
      return;
    }
    case "number": {
      exactKeys(context, value, path, ["mode", "minimum", "maximum", "default"]);
      const mode = property(value, "mode");
      if (mode !== undefined && mode !== "integer" && mode !== "floating_point") {
        addIssue(context, `${path}.mode`, "number_mode_invalid");
      }
      validateOptionalFiniteNumber(context, value, "minimum", path);
      validateOptionalFiniteNumber(context, value, "maximum", path);
      validateOptionalFiniteNumber(context, value, "default", path);
      return;
    }
    case "decimal":
      exactKeys(context, value, path, ["precision", "scale", "minimum", "maximum", "default"]);
      validateOptionalInteger(context, value, "precision", path, 1, 38);
      validateOptionalInteger(context, value, "scale", path, 0, 18);
      validateDecimal(context, property(value, "minimum"), `${path}.minimum`, true);
      validateDecimal(context, property(value, "maximum"), `${path}.maximum`, true);
      validateDecimal(context, property(value, "default"), `${path}.default`, true);
      return;
    case "money": {
      exactKeys(context, value, path, ["currencies", "allowNegative", "default"]);
      const currencies = property(value, "currencies");
      const allowedCurrencies = new Set<string>();
      if (!Array.isArray(currencies) || currencies.length === 0 || currencies.length > 50) {
        addIssue(context, `${path}.currencies`, "currencies_invalid");
      } else {
        for (const [index, currency] of currencies.entries()) {
          if (
            typeof currency !== "string" ||
            !CURRENCY_PATTERN.test(currency) ||
            allowedCurrencies.has(currency)
          ) {
            addIssue(context, `${path}.currencies[${index}]`, "currency_invalid");
          } else {
            allowedCurrencies.add(currency);
          }
        }
      }
      validateOptionalBoolean(context, value, "allowNegative", path);
      const defaultValue = property(value, "default");
      if (defaultValue !== undefined) {
        if (!isRecord(defaultValue)) {
          addIssue(context, `${path}.default`, "money_default_invalid");
        } else {
          exactKeys(context, defaultValue, `${path}.default`, ["amount", "currency"]);
          validateDecimal(
            context,
            property(defaultValue, "amount"),
            `${path}.default.amount`,
            false,
          );
          const currency = property(defaultValue, "currency");
          if (
            typeof currency !== "string" ||
            !CURRENCY_PATTERN.test(currency) ||
            !allowedCurrencies.has(currency)
          ) {
            addIssue(context, `${path}.default.currency`, "currency_invalid");
          }
        }
      }
      return;
    }
    case "boolean":
      exactKeys(context, value, path, ["default"]);
      validateOptionalBoolean(context, value, "default", path);
      return;
    case "date":
    case "date_time": {
      exactKeys(context, value, path, ["minimum", "maximum", "default"]);
      for (const key of ["minimum", "maximum", "default"]) {
        const candidate = property(value, key);
        if (
          candidate !== undefined &&
          (typeof candidate !== "string" ||
            (kind === "date"
              ? !DATE_PATTERN.test(candidate)
              : candidate.length < 20 || candidate.length > 35))
        ) {
          addIssue(context, `${path}.${key}`, "temporal_invalid");
        }
      }
      return;
    }
    case "enum": {
      exactKeys(context, value, path, ["options", "default"]);
      const options = property(value, "options");
      const values = new Set<string>();
      if (!Array.isArray(options) || options.length === 0 || options.length > 100) {
        addIssue(context, `${path}.options`, "enum_options_invalid");
      } else {
        const sourceKeys = new Set<string>();
        for (const [index, option] of options.entries()) {
          const optionPath = `${path}.options[${index}]`;
          if (!isRecord(option)) {
            addIssue(context, optionPath, "enum_option_invalid");
            continue;
          }
          exactKeys(context, option, optionPath, ["sourceKey", "value"]);
          const sourceKey = property(option, "sourceKey");
          if (validateSourceKey(context, sourceKey, `${optionPath}.sourceKey`)) {
            if (sourceKeys.has(sourceKey))
              addIssue(context, `${optionPath}.sourceKey`, "source_key_duplicate");
            sourceKeys.add(sourceKey);
          }
          const optionValue = property(option, "value");
          if (validateApiKey(context, optionValue, `${optionPath}.value`)) {
            if (values.has(optionValue))
              addIssue(context, `${optionPath}.value`, "enum_value_duplicate");
            values.add(optionValue);
          }
        }
      }
      const defaultValue = property(value, "default");
      if (defaultValue !== undefined) {
        if (typeof defaultValue !== "string" || !values.has(defaultValue)) {
          addIssue(context, `${path}.default`, "enum_default_invalid");
        }
      }
      return;
    }
    case "url":
      exactKeys(context, value, path, ["default"]);
      validateOptionalString(context, value, "default", path, 2_048);
      return;
    case "email":
      exactKeys(context, value, path, ["default"]);
      validateOptionalString(context, value, "default", path, 254);
      return;
    case "slug":
      validateTextConfiguration(context, value, path, 200);
      return;
    case "json":
      exactKeys(context, value, path, ["maxBytes", "maxDepth", "default"]);
      validateOptionalInteger(context, value, "maxBytes", path, 1, 262_144);
      validateOptionalInteger(context, value, "maxDepth", path, 1, 64);
      return;
    case "object": {
      exactKeys(context, value, path, ["default"]);
      const defaultValue = property(value, "default");
      if (defaultValue !== undefined && !isRecord(defaultValue)) {
        addIssue(context, `${path}.default`, "object_default_invalid");
      }
      return;
    }
    case "list": {
      exactKeys(context, value, path, ["minItems", "maxItems", "uniqueItems", "default"]);
      validateOptionalInteger(context, value, "minItems", path, 0, 100);
      validateOptionalInteger(context, value, "maxItems", path, 0, 100);
      validateOptionalBoolean(context, value, "uniqueItems", path);
      const defaultValue = property(value, "default");
      if (
        defaultValue !== undefined &&
        (!Array.isArray(defaultValue) || defaultValue.length > 100)
      ) {
        addIssue(context, `${path}.default`, "list_default_invalid");
      }
      return;
    }
    case "reference": {
      exactKeys(context, value, path, ["targetCollectionSourceKey"]);
      const target = property(value, "targetCollectionSourceKey");
      const targetPath = `${path}.targetCollectionSourceKey`;
      if (validateSourceKey(context, target, targetPath)) {
        context.referenceTargets.push({ sourceKey: target, path: targetPath });
      }
      return;
    }
    case "external_asset": {
      exactKeys(context, value, path, ["default"]);
      const defaultValue = property(value, "default");
      if (defaultValue !== undefined)
        validateExternalAsset(context, defaultValue, `${path}.default`);
      return;
    }
  }
}

function validateField(
  context: ValidationContext,
  collection: CollectionContext,
  value: unknown,
  path: string,
  depth: number,
  listItem: boolean,
  siblingApiKeys: Set<string>,
): void {
  collection.nodes += 1;
  if (collection.nodes > 100) {
    addIssue(context, path, "field_nodes_exceeded");
    return;
  }
  if (depth > 8) {
    addIssue(context, path, "field_depth_exceeded");
    return;
  }
  if (!isRecord(value)) {
    addIssue(context, path, "field_invalid");
    return;
  }
  const kind = property(value, "kind");
  const extraKeys = kind === "object" ? ["fields"] : kind === "list" ? ["item"] : [];
  exactKeys(context, value, path, [...(listItem ? BASE_ITEM_KEYS : BASE_FIELD_KEYS), ...extraKeys]);

  const sourceKey = property(value, "sourceKey");
  if (validateSourceKey(context, sourceKey, `${path}.sourceKey`)) {
    if (collection.fieldSourceKeys.has(sourceKey)) {
      addIssue(context, `${path}.sourceKey`, "source_key_duplicate");
    }
    collection.fieldSourceKeys.add(sourceKey);
  }
  if (!listItem) {
    const apiKey = property(value, "apiKey");
    if (validateApiKey(context, apiKey, `${path}.apiKey`)) {
      if (siblingApiKeys.has(apiKey)) addIssue(context, `${path}.apiKey`, "api_key_duplicate");
      siblingApiKeys.add(apiKey);
    }
    if (typeof property(value, "required") !== "boolean") {
      addIssue(context, `${path}.required`, "required_invalid");
    }
  }
  const localization = property(value, "localization");
  if (typeof localization !== "string" || !LOCALIZATIONS.has(localization)) {
    addIssue(context, `${path}.localization`, "localization_invalid");
  }
  validateOptionalBoolean(context, value, "deprecated", path);
  if (typeof kind !== "string" || !FIELD_KINDS.has(kind)) {
    addIssue(context, `${path}.kind`, "field_kind_invalid");
    return;
  }
  validateConfiguration(context, kind, property(value, "configuration"), `${path}.configuration`);
  if (kind === "object") {
    const fields = property(value, "fields");
    if (!Array.isArray(fields) || fields.length === 0 || fields.length > 50) {
      addIssue(context, `${path}.fields`, "object_fields_invalid");
    } else {
      const childApiKeys = new Set<string>();
      for (const [index, field] of fields.entries()) {
        validateField(
          context,
          collection,
          field,
          `${path}.fields[${index}]`,
          depth + 1,
          false,
          childApiKeys,
        );
      }
    }
  }
  if (kind === "list") {
    validateField(
      context,
      collection,
      property(value, "item"),
      `${path}.item`,
      depth + 1,
      true,
      new Set(),
    );
  }
}

export function validateStaticProjectSchema(value: unknown): StaticSchemaValidationResult {
  const context: ValidationContext = {
    issues: [],
    collectionSourceKeys: new Set(),
    collectionApiKeys: new Set(),
    referenceTargets: [],
  };
  if (!isRecord(value)) {
    addIssue(context, "$", "project_invalid");
    return { valid: false, issues: context.issues };
  }
  exactKeys(context, value, "$", ["collections"]);
  const collections = property(value, "collections");
  if (!Array.isArray(collections) || collections.length === 0 || collections.length > 50) {
    addIssue(context, "$.collections", "collections_invalid");
    return { valid: false, issues: context.issues };
  }
  for (const [index, collectionValue] of collections.entries()) {
    const path = `$.collections[${index}]`;
    if (!isRecord(collectionValue)) {
      addIssue(context, path, "collection_invalid");
      continue;
    }
    exactKeys(context, collectionValue, path, ["sourceKey", "apiKey", "fields"]);
    const sourceKey = property(collectionValue, "sourceKey");
    if (validateSourceKey(context, sourceKey, `${path}.sourceKey`)) {
      if (context.collectionSourceKeys.has(sourceKey)) {
        addIssue(context, `${path}.sourceKey`, "source_key_duplicate");
      }
      context.collectionSourceKeys.add(sourceKey);
    }
    const apiKey = property(collectionValue, "apiKey");
    if (validateApiKey(context, apiKey, `${path}.apiKey`)) {
      if (context.collectionApiKeys.has(apiKey))
        addIssue(context, `${path}.apiKey`, "api_key_duplicate");
      context.collectionApiKeys.add(apiKey);
    }
    const fields = property(collectionValue, "fields");
    if (!Array.isArray(fields) || fields.length > 100) {
      addIssue(context, `${path}.fields`, "collection_fields_invalid");
      continue;
    }
    const collection: CollectionContext = {
      fieldSourceKeys: new Set(),
      nodes: 0,
    };
    const rootApiKeys = new Set<string>();
    for (const [fieldIndex, field] of fields.entries()) {
      validateField(
        context,
        collection,
        field,
        `${path}.fields[${fieldIndex}]`,
        1,
        false,
        rootApiKeys,
      );
    }
  }
  for (const reference of context.referenceTargets) {
    if (!context.collectionSourceKeys.has(reference.sourceKey)) {
      addIssue(context, reference.path, "reference_target_unknown");
    }
  }
  return context.issues.length === 0 ? { valid: true } : { valid: false, issues: context.issues };
}

/** Narrows untrusted input only after the complete closed structural contract passes. */
export function isProjectSchema(value: unknown): value is ProjectSchema {
  return validateStaticProjectSchema(value).valid;
}

export const validateProjectSchema = validateStaticProjectSchema;
