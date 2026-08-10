// Provides dependency-light deterministic validation for M6 field values and recursive definitions.

import { RE2JS } from "re2js";

import type {
  CollectionFieldKind,
  FieldConfigurationByKind,
  FieldLocalization,
  FieldNodeRole,
  FieldValidationIssue,
} from "../contracts/field-system";
import { fieldSystemLimits } from "./field-system-profile";
import { iso4217MinorUnits } from "../registry/iso-4217.generated";

interface ValueFieldBase {
  readonly id: string;
  readonly apiKey: string | null;
  readonly required: boolean | null;
  readonly localization: FieldLocalization | null;
  readonly nodeRole: FieldNodeRole;
  readonly position: number;
  readonly children: ReadonlyArray<ValueFieldDefinition>;
}

export type ValueFieldDefinition = {
  readonly [Kind in CollectionFieldKind]: ValueFieldBase & {
    readonly kind: Kind;
    readonly configuration: FieldConfigurationByKind[Kind];
  };
}[CollectionFieldKind];

export interface FieldValueValidationResult {
  readonly valid: boolean;
  readonly value: unknown;
  readonly issues: ReadonlyArray<FieldValidationIssue>;
  readonly capped: boolean;
}

export interface DefinitionTreeValidationResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<FieldValidationIssue>;
  readonly capped: boolean;
}

interface MutableIssueCollector {
  readonly issues: Array<FieldValidationIssue>;
  capped: boolean;
}

interface ParsedDecimal {
  readonly canonical: string;
  readonly negative: boolean;
  readonly coefficient: string;
  readonly precision: number;
  readonly scale: number;
}

const decimalPattern = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;
const datePattern = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/u;
const dateTimePattern =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|[+-][0-9]{2}:[0-9]{2})$/u;
const emailPattern = /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[^\s@<>(),;:"\\[\]]+$/u;
const slugPattern =
  /^(?:[\p{Ll}\p{Lo}\p{Lm}\p{N}][\p{Ll}\p{Lo}\p{Lm}\p{N}\p{M}]*)(?:-(?:[\p{Ll}\p{Lo}\p{Lm}\p{N}][\p{Ll}\p{Lo}\p{Lm}\p{N}\p{M}]*))*$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const portableTextKeyPattern = /^[A-Za-z0-9_-]{1,64}$/u;
const dangerousKeys = new Set(["__proto__", "prototype", "constructor"]);
const textEncoder = new TextEncoder();

/** Creates a bounded mutable issue collector for one validation operation. */
function makeCollector(): MutableIssueCollector {
  return { issues: [], capped: false };
}

/** Appends a safe issue while preserving the global issue-count bound. */
function addIssue(
  collector: MutableIssueCollector,
  path: string,
  code: string,
  message: string,
): void {
  if (collector.issues.length >= fieldSystemLimits.issues) {
    collector.capped = true;
    return;
  }
  collector.issues.push({ path, code, message });
}

/** Returns whether a value is a non-array object with a standard or null prototype. */
function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Copies a known decoded Effect Schema class into inert JSON data for value validation. */
function copyDecodedSchemaClass(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copyDecodedSchemaClass);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value).map((key) => [key, copyDecodedSchemaClass(Reflect.get(value, key))]),
  );
}

/** Returns whether an object contains only the exact approved own keys. */
function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

/** Counts Unicode code points rather than UTF-16 code units. */
function codePointLength(value: string): number {
  return [...value].length;
}

/** Detects C0/C1 controls, optionally preserving line feeds for long text. */
function hasRejectedControl(value: string, allowLineFeed: boolean): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (allowLineFeed && codePoint === 10) continue;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return true;
  }
  return false;
}

/** Parses a canonical exact decimal into bounded comparison components. */
export function parseExactDecimal(value: string): ParsedDecimal | null {
  if (!decimalPattern.test(value)) return null;
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const decimalIndex = unsigned.indexOf(".");
  const integer = decimalIndex === -1 ? unsigned : unsigned.slice(0, decimalIndex);
  const fraction = decimalIndex === -1 ? "" : unsigned.slice(decimalIndex + 1);
  const coefficientWithZeroes = `${integer}${fraction}`;
  const coefficient = coefficientWithZeroes.replace(/^0+/u, "") || "0";
  return {
    canonical: value,
    negative,
    coefficient,
    precision: coefficient.length,
    scale: fraction.length,
  };
}

/** Compares two already parsed exact decimals without binary floating-point conversion. */
export function compareExactDecimals(left: ParsedDecimal, right: ParsedDecimal): number {
  if (left.negative !== right.negative) return left.negative ? -1 : 1;
  const scale = Math.max(left.scale, right.scale);
  const leftInteger =
    left.coefficient
      .padEnd(left.coefficient.length + scale - left.scale, "0")
      .replace(/^0+/u, "") || "0";
  const rightInteger =
    right.coefficient
      .padEnd(right.coefficient.length + scale - right.scale, "0")
      .replace(/^0+/u, "") || "0";
  const magnitude =
    leftInteger.length === rightInteger.length
      ? leftInteger.localeCompare(rightInteger)
      : leftInteger.length < rightInteger.length
        ? -1
        : 1;
  return left.negative ? -magnitude : magnitude;
}

/** Runs a user-authored RE2 pattern as an exact whole-value match. */
function matchesSafePattern(pattern: string, value: string): boolean {
  return RE2JS.compile(pattern).testExact(value);
}

/** Checks configurable string constraints shared by text and slug fields. */
function validateStringBounds(
  value: string,
  configuration: {
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly pattern?: string;
  },
  absoluteMaximum: number,
  collector: MutableIssueCollector,
  path: string,
): void {
  const length = codePointLength(value);
  const minimum = configuration.minLength ?? 0;
  const maximum = Math.min(configuration.maxLength ?? absoluteMaximum, absoluteMaximum);
  if (length < minimum)
    addIssue(collector, path, "length_minimum", `Use at least ${minimum} characters.`);
  if (length > maximum)
    addIssue(collector, path, "length_maximum", `Use at most ${maximum} characters.`);
  if (configuration.pattern !== undefined) {
    try {
      if (!matchesSafePattern(configuration.pattern, value)) {
        addIssue(
          collector,
          path,
          "pattern_mismatch",
          "The value does not match the configured pattern.",
        );
      }
    } catch {
      addIssue(collector, path, "pattern_invalid", "The configured safe pattern is invalid.");
    }
  }
}

/** Validates Gregorian calendar components without JavaScript date rollover. */
function isValidDateParts(year: number, month: number, day: number): boolean {
  if (year < 0 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (monthLengths[month - 1] ?? 0);
}

/** Validates and returns a canonical date string when possible. */
function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = datePattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isValidDateParts(year, month, day) ? value : null;
}

/** Validates an RFC 3339 instant and returns its canonical UTC millisecond representation. */
function canonicalDateTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = dateTimePattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offset = match[8] ?? "";
  if (!isValidDateParts(year, month, day) || hour > 23 || minute > 59 || second > 59) return null;
  if (offset !== "Z") {
    const offsetHours = Number(offset.slice(1, 3));
    const offsetMinutes = Number(offset.slice(4, 6));
    if (offsetHours > 23 || offsetMinutes > 59) return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/** Validates safe absolute HTTP(S) URLs without performing any network request. */
function validHttpUrl(value: unknown, httpsOnly: boolean): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const parsed = new URL(value);
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    if (httpsOnly ? parsed.protocol !== "https:" : !["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/** Validates Portable Text link targets under the profile protocol allowlist. */
function validRichTextLink(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    hasRejectedControl(value, false)
  )
    return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#") && value.length > 1) return true;
  try {
    const parsed = new URL(value);
    return (
      !parsed.username &&
      !parsed.password &&
      ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)
    );
  } catch {
    return false;
  }
}

/** Performs bounded JSON compatibility, depth, cycle, and dangerous-key preflight checks. */
function preflightJson(
  value: unknown,
  maximumDepth: number,
  maximumBytes: number,
  maximumNodes: number,
  collector: MutableIssueCollector,
  path: string,
): boolean {
  const stack: Array<{
    readonly value: unknown;
    readonly depth: number;
    readonly path: string;
    readonly leaving: boolean;
  }> = [{ value, depth: 1, path, leaving: false }];
  const ancestors = new WeakSet<object>();
  let nodes = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.leaving) {
      if (typeof current.value === "object" && current.value !== null)
        ancestors.delete(current.value);
      continue;
    }
    nodes += 1;
    if (nodes > maximumNodes) {
      addIssue(collector, path, "json_nodes_exceeded", "The value contains too many JSON nodes.");
      return false;
    }
    if (current.depth > maximumDepth) {
      addIssue(
        collector,
        current.path,
        "json_depth_exceeded",
        `JSON depth cannot exceed ${maximumDepth}.`,
      );
      return false;
    }

    const currentValue = current.value;
    if (
      currentValue === null ||
      typeof currentValue === "string" ||
      typeof currentValue === "boolean"
    ) {
      continue;
    }
    if (typeof currentValue === "number") {
      if (!Number.isFinite(currentValue)) {
        addIssue(collector, current.path, "json_number_invalid", "JSON numbers must be finite.");
        return false;
      }
      continue;
    }
    if (typeof currentValue !== "object") {
      addIssue(collector, current.path, "json_type_invalid", "Use only JSON-compatible values.");
      return false;
    }
    if (ancestors.has(currentValue)) {
      addIssue(collector, current.path, "json_cycle", "Cyclic JSON values are not supported.");
      return false;
    }
    ancestors.add(currentValue);
    stack.push({ ...current, leaving: true });

    if (Array.isArray(currentValue)) {
      for (let index = 0; index < currentValue.length; index += 1) {
        if (!Object.hasOwn(currentValue, index)) {
          addIssue(
            collector,
            `${current.path}.${index}`,
            "json_sparse_array",
            "Sparse arrays are not supported.",
          );
          return false;
        }
        stack.push({
          value: currentValue[index],
          depth: current.depth + 1,
          path: `${current.path}.${index}`,
          leaving: false,
        });
      }
      continue;
    }
    if (!isPlainRecord(currentValue)) {
      addIssue(
        collector,
        current.path,
        "json_object_invalid",
        "JSON objects must be plain objects.",
      );
      return false;
    }
    for (const key of Object.keys(currentValue)) {
      if (dangerousKeys.has(key)) {
        addIssue(
          collector,
          `${current.path}.${key}`,
          "json_key_unsafe",
          "This object key is reserved.",
        );
        return false;
      }
      stack.push({
        value: Reflect.get(currentValue, key),
        depth: current.depth + 1,
        path: `${current.path}.${key}`,
        leaving: false,
      });
    }
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    addIssue(
      collector,
      path,
      "json_serialization_failed",
      "The value cannot be serialized as JSON.",
    );
    return false;
  }
  if (textEncoder.encode(serialized).byteLength > maximumBytes) {
    addIssue(
      collector,
      path,
      "json_size_exceeded",
      `The serialized value cannot exceed ${maximumBytes} bytes.`,
    );
    return false;
  }
  return true;
}

/** Produces deterministic JSON text for bounded uniqueness and hashing comparisons. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    const items: Array<string> = [];
    for (const item of value) items.push(canonicalJson(item));
    return `[${items.join(",")}]`;
  }
  if (!isPlainRecord(value)) return JSON.stringify(value) ?? "null";
  const entries: Array<string> = [];
  for (const key of Object.keys(value).sort()) {
    entries.push(`${JSON.stringify(key)}:${canonicalJson(Reflect.get(value, key))}`);
  }
  return `{${entries.join(",")}}`;
}

/** Validates a Portable Text profile document without trusting editor output. */
function validateRichText(
  value: unknown,
  configuration: FieldConfigurationByKind["rich_text"],
  collector: MutableIssueCollector,
  path: string,
): void {
  if (!preflightJson(value, 8, fieldSystemLimits.valueBytes, 20_000, collector, path)) return;
  const documentKeys = new Set(["version", "profile", "blocks"]);
  const blockKeysAllowed = new Set([
    "_key",
    "_type",
    "style",
    "listItem",
    "level",
    "children",
    "markDefs",
  ]);
  const markKeysAllowed = new Set(["_key", "_type", "href"]);
  const spanKeysAllowed = new Set(["_key", "_type", "text", "marks"]);
  if (
    !isPlainRecord(value) ||
    !hasOnlyKeys(value, documentKeys) ||
    value.version !== 1 ||
    value.profile !== "ffd-portable-text" ||
    !Array.isArray(value.blocks)
  ) {
    addIssue(
      collector,
      path,
      "rich_text_document_invalid",
      "Use an ffd-portable-text version 1 document.",
    );
    return;
  }

  const blockKeys = new Set<string>();
  let spanCount = 0;
  let markCount = 0;
  let textLength = 0;
  for (let blockIndex = 0; blockIndex < value.blocks.length; blockIndex += 1) {
    const blockPath = `${path}.blocks.${blockIndex}`;
    const block = value.blocks[blockIndex];
    if (
      !isPlainRecord(block) ||
      !hasOnlyKeys(block, blockKeysAllowed) ||
      block._type !== "block" ||
      typeof block._key !== "string" ||
      !portableTextKeyPattern.test(block._key)
    ) {
      addIssue(
        collector,
        blockPath,
        "rich_text_block_invalid",
        "Use a supported Portable Text block.",
      );
      continue;
    }
    if (blockKeys.has(block._key))
      addIssue(
        collector,
        `${blockPath}._key`,
        "rich_text_key_duplicate",
        "Block keys must be unique.",
      );
    blockKeys.add(block._key);

    const styles = new Set<string>(
      configuration.styles ?? ["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"],
    );
    if (typeof block.style !== "string" || !styles.has(block.style)) {
      addIssue(
        collector,
        `${blockPath}.style`,
        "rich_text_style_invalid",
        "The block style is not allowed.",
      );
    }
    const hasList = block.listItem !== undefined;
    if (hasList) {
      const lists = new Set<string>(configuration.lists ?? ["bullet", "number"]);
      if (typeof block.listItem !== "string" || !lists.has(block.listItem)) {
        addIssue(
          collector,
          `${blockPath}.listItem`,
          "rich_text_list_invalid",
          "The list kind is not allowed.",
        );
      }
      if (!Number.isInteger(block.level) || Number(block.level) < 1 || Number(block.level) > 3) {
        addIssue(
          collector,
          `${blockPath}.level`,
          "rich_text_level_invalid",
          "List level must be between 1 and 3.",
        );
      }
    } else if (block.level !== undefined) {
      addIssue(
        collector,
        `${blockPath}.level`,
        "rich_text_level_without_list",
        "Only list blocks may define a level.",
      );
    }

    if (!Array.isArray(block.markDefs) || !Array.isArray(block.children)) {
      addIssue(
        collector,
        blockPath,
        "rich_text_children_invalid",
        "Blocks require markDefs and children arrays.",
      );
      continue;
    }
    const annotationKeys = new Set<string>();
    for (let markIndex = 0; markIndex < block.markDefs.length; markIndex += 1) {
      markCount += 1;
      const mark = block.markDefs[markIndex];
      const markPath = `${blockPath}.markDefs.${markIndex}`;
      if (
        !isPlainRecord(mark) ||
        !hasOnlyKeys(mark, markKeysAllowed) ||
        mark._type !== "link" ||
        typeof mark._key !== "string" ||
        !portableTextKeyPattern.test(mark._key) ||
        !validRichTextLink(mark.href)
      ) {
        addIssue(
          collector,
          markPath,
          "rich_text_mark_invalid",
          "Only safe link annotations are supported.",
        );
        continue;
      }
      if (configuration.links === false)
        addIssue(
          collector,
          markPath,
          "rich_text_links_disabled",
          "Links are disabled for this field.",
        );
      if (annotationKeys.has(mark._key))
        addIssue(
          collector,
          `${markPath}._key`,
          "rich_text_key_duplicate",
          "Mark keys must be unique per block.",
        );
      annotationKeys.add(mark._key);
    }

    const spanKeys = new Set<string>();
    for (let spanIndex = 0; spanIndex < block.children.length; spanIndex += 1) {
      spanCount += 1;
      const span = block.children[spanIndex];
      const spanPath = `${blockPath}.children.${spanIndex}`;
      if (
        !isPlainRecord(span) ||
        !hasOnlyKeys(span, spanKeysAllowed) ||
        span._type !== "span" ||
        typeof span._key !== "string" ||
        !portableTextKeyPattern.test(span._key) ||
        typeof span.text !== "string" ||
        !Array.isArray(span.marks)
      ) {
        addIssue(
          collector,
          spanPath,
          "rich_text_span_invalid",
          "Use a supported Portable Text span.",
        );
        continue;
      }
      if (spanKeys.has(span._key))
        addIssue(
          collector,
          `${spanPath}._key`,
          "rich_text_key_duplicate",
          "Span keys must be unique per block.",
        );
      spanKeys.add(span._key);
      textLength += codePointLength(span.text);
      const decorators = new Set<string>(
        configuration.decorators ?? ["strong", "em", "underline", "strike-through", "code"],
      );
      const seenMarks = new Set<string>();
      for (const mark of span.marks) {
        if (typeof mark !== "string" || (!decorators.has(mark) && !annotationKeys.has(mark))) {
          addIssue(
            collector,
            `${spanPath}.marks`,
            "rich_text_mark_unknown",
            "Span marks must reference an allowed decorator or annotation.",
          );
          continue;
        }
        if (seenMarks.has(mark))
          addIssue(
            collector,
            `${spanPath}.marks`,
            "rich_text_mark_duplicate",
            "Span marks must be unique.",
          );
        seenMarks.add(mark);
      }
    }
  }

  if (value.blocks.length > 500 || spanCount > 5_000 || markCount > 1_000 || textLength > 100_000) {
    addIssue(
      collector,
      path,
      "rich_text_limits_exceeded",
      "The rich-text document exceeds platform limits.",
    );
  }
  const minimum = configuration.minLength ?? 0;
  const maximum = Math.min(configuration.maxLength ?? 100_000, 100_000);
  if (textLength < minimum || textLength > maximum) {
    addIssue(
      collector,
      path,
      "rich_text_length_invalid",
      `Rich text must contain between ${minimum} and ${maximum} characters.`,
    );
  }
}

/** Validates one field value recursively and appends path-aware issues. */
function validatePresentValue(
  definition: ValueFieldDefinition,
  value: unknown,
  collector: MutableIssueCollector,
  path: string,
): unknown {
  switch (definition.kind) {
    case "short_text":
    case "long_text":
    case "slug": {
      if (typeof value !== "string") {
        addIssue(collector, path, "string_required", "Use a string value.");
        return value;
      }
      const normalized = value.normalize("NFC");
      const absoluteMaximum =
        definition.kind === "short_text" ? 500 : definition.kind === "long_text" ? 50_000 : 200;
      validateStringBounds(normalized, definition.configuration, absoluteMaximum, collector, path);
      if (
        definition.kind === "short_text" &&
        (normalized.includes("\n") || hasRejectedControl(normalized, false))
      ) {
        addIssue(
          collector,
          path,
          "short_text_control",
          "Short text cannot contain line breaks or control characters.",
        );
      }
      if (definition.kind === "long_text" && hasRejectedControl(normalized, true)) {
        addIssue(
          collector,
          path,
          "long_text_control",
          "Long text contains an unsupported control character.",
        );
      }
      if (definition.kind === "slug" && !slugPattern.test(normalized)) {
        addIssue(
          collector,
          path,
          "slug_invalid",
          "Use a normalized lowercase Unicode slug with single hyphens.",
        );
      }
      return normalized;
    }
    case "rich_text":
      validateRichText(value, definition.configuration, collector, path);
      return value;
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        addIssue(collector, path, "number_invalid", "Use a finite JSON number.");
        return value;
      }
      const mode = definition.configuration.mode ?? "floating_point";
      if (mode === "integer" && !Number.isSafeInteger(value))
        addIssue(collector, path, "integer_invalid", "Use a safe integer.");
      if (
        definition.configuration.minimum !== undefined &&
        value < definition.configuration.minimum
      )
        addIssue(collector, path, "number_minimum", "The number is below the configured minimum.");
      if (
        definition.configuration.maximum !== undefined &&
        value > definition.configuration.maximum
      )
        addIssue(collector, path, "number_maximum", "The number exceeds the configured maximum.");
      return value;
    }
    case "decimal": {
      if (typeof value !== "string") {
        addIssue(collector, path, "decimal_invalid", "Use a canonical exact decimal string.");
        return value;
      }
      const parsed = parseExactDecimal(value);
      if (!parsed) {
        addIssue(collector, path, "decimal_invalid", "Use a canonical exact decimal string.");
        return value;
      }
      const precision = definition.configuration.precision ?? 38;
      const scale = definition.configuration.scale ?? 18;
      if (parsed.precision > precision)
        addIssue(
          collector,
          path,
          "decimal_precision",
          `Decimal precision cannot exceed ${precision}.`,
        );
      if (parsed.scale > scale)
        addIssue(collector, path, "decimal_scale", `Decimal scale cannot exceed ${scale}.`);
      const minimum =
        definition.configuration.minimum === undefined
          ? null
          : parseExactDecimal(definition.configuration.minimum);
      const maximum =
        definition.configuration.maximum === undefined
          ? null
          : parseExactDecimal(definition.configuration.maximum);
      if (minimum && compareExactDecimals(parsed, minimum) < 0)
        addIssue(
          collector,
          path,
          "decimal_minimum",
          "The decimal is below the configured minimum.",
        );
      if (maximum && compareExactDecimals(parsed, maximum) > 0)
        addIssue(collector, path, "decimal_maximum", "The decimal exceeds the configured maximum.");
      return value;
    }
    case "money": {
      if (
        !isPlainRecord(value) ||
        typeof value.amount !== "string" ||
        typeof value.currency !== "string"
      ) {
        addIssue(collector, path, "money_invalid", "Use an exact amount and allowed currency.");
        return value;
      }
      const keys = Object.keys(value);
      if (keys.length !== 2 || !keys.includes("amount") || !keys.includes("currency"))
        addIssue(collector, path, "money_keys_invalid", "Money supports only amount and currency.");
      const amount = parseExactDecimal(value.amount);
      if (!amount)
        addIssue(
          collector,
          `${path}.amount`,
          "money_amount_invalid",
          "Use a canonical exact amount.",
        );
      else if (amount.precision > 38)
        addIssue(
          collector,
          `${path}.amount`,
          "money_precision",
          "Money amounts cannot exceed 38 digits of precision.",
        );
      let currencyAllowed = false;
      for (const currency of definition.configuration.currencies) {
        if (currency === value.currency) currencyAllowed = true;
      }
      if (!currencyAllowed)
        addIssue(
          collector,
          `${path}.currency`,
          "money_currency_invalid",
          "Use a currency allowed by this field.",
        );
      const minorUnit = Reflect.get(iso4217MinorUnits, value.currency);
      if (amount && typeof minorUnit === "number" && amount.scale > minorUnit)
        addIssue(
          collector,
          `${path}.amount`,
          "money_minor_unit",
          `This currency supports at most ${minorUnit} fractional digits.`,
        );
      if (amount?.negative && definition.configuration.allowNegative !== true)
        addIssue(
          collector,
          `${path}.amount`,
          "money_negative",
          "Negative money values are not allowed.",
        );
      return value;
    }
    case "boolean":
      if (typeof value !== "boolean")
        addIssue(collector, path, "boolean_invalid", "Use a boolean value.");
      return value;
    case "date": {
      const canonical = validDate(value);
      if (!canonical) {
        addIssue(collector, path, "date_invalid", "Use a valid YYYY-MM-DD calendar date.");
        return value;
      }
      if (
        definition.configuration.minimum !== undefined &&
        canonical < definition.configuration.minimum
      )
        addIssue(collector, path, "date_minimum", "The date is before the configured minimum.");
      if (
        definition.configuration.maximum !== undefined &&
        canonical > definition.configuration.maximum
      )
        addIssue(collector, path, "date_maximum", "The date is after the configured maximum.");
      return canonical;
    }
    case "date_time": {
      const canonical = canonicalDateTime(value);
      if (!canonical) {
        addIssue(
          collector,
          path,
          "date_time_invalid",
          "Use a valid RFC 3339 instant with an offset.",
        );
        return value;
      }
      const minimum =
        definition.configuration.minimum === undefined
          ? null
          : canonicalDateTime(definition.configuration.minimum);
      const maximum =
        definition.configuration.maximum === undefined
          ? null
          : canonicalDateTime(definition.configuration.maximum);
      if (minimum && canonical < minimum)
        addIssue(
          collector,
          path,
          "date_time_minimum",
          "The instant is before the configured minimum.",
        );
      if (maximum && canonical > maximum)
        addIssue(
          collector,
          path,
          "date_time_maximum",
          "The instant is after the configured maximum.",
        );
      return canonical;
    }
    case "enum": {
      if (typeof value !== "string") {
        addIssue(collector, path, "enum_invalid", "Use one configured enum value.");
        return value;
      }
      let found = false;
      for (const option of definition.configuration.options) {
        if (option.value === value) found = true;
      }
      if (!found) addIssue(collector, path, "enum_invalid", "Use one configured enum value.");
      return value;
    }
    case "url": {
      const canonical = validHttpUrl(value, false);
      if (!canonical)
        addIssue(
          collector,
          path,
          "url_invalid",
          "Use an absolute HTTP or HTTPS URL without credentials.",
        );
      return canonical ?? value;
    }
    case "email": {
      if (
        typeof value !== "string" ||
        value.length > 254 ||
        !emailPattern.test(value) ||
        hasRejectedControl(value, false)
      ) {
        addIssue(collector, path, "email_invalid", "Use one valid email address.");
        return value;
      }
      const separator = value.lastIndexOf("@");
      return `${value.slice(0, separator)}@${value.slice(separator + 1).toLowerCase()}`;
    }
    case "json": {
      const maximumDepth = Math.min(definition.configuration.maxDepth ?? 10, 10);
      const maximumBytes = Math.min(definition.configuration.maxBytes ?? 65_536, 65_536);
      preflightJson(value, maximumDepth, maximumBytes, 10_000, collector, path);
      return value;
    }
    case "object": {
      if (!isPlainRecord(value)) {
        addIssue(collector, path, "object_invalid", "Use an object value.");
        return value;
      }
      const expectedKeys = new Set<string>();
      const normalized: Record<string, unknown> = {};
      for (const child of definition.children) {
        if (child.apiKey === null) continue;
        expectedKeys.add(child.apiKey);
        const childValue = Reflect.get(value, child.apiKey);
        const validated = validateValueInternal(
          child,
          childValue,
          collector,
          `${path}.${child.apiKey}`,
        );
        if (validated !== undefined) normalized[child.apiKey] = validated;
      }
      for (const key of Object.keys(value)) {
        if (!expectedKeys.has(key))
          addIssue(
            collector,
            `${path}.${key}`,
            "object_key_unknown",
            "This object property is not defined by the schema.",
          );
      }
      preflightJson(
        normalized,
        fieldSystemLimits.definitionMaxDepth,
        fieldSystemLimits.valueBytes,
        20_000,
        collector,
        path,
      );
      return normalized;
    }
    case "list": {
      if (!Array.isArray(value)) {
        addIssue(collector, path, "list_invalid", "Use an array value.");
        return value;
      }
      const minimum = definition.configuration.minItems ?? 0;
      const maximum = Math.min(
        definition.configuration.maxItems ?? fieldSystemLimits.listItems,
        fieldSystemLimits.listItems,
      );
      if (value.length < minimum)
        addIssue(collector, path, "list_minimum", `Use at least ${minimum} items.`);
      if (value.length > maximum)
        addIssue(collector, path, "list_maximum", `Use at most ${maximum} items.`);
      const itemDefinition = definition.children[0];
      if (!itemDefinition) {
        addIssue(collector, path, "list_item_missing", "The list item definition is missing.");
        return value;
      }
      const normalized: Array<unknown> = [];
      const unique = new Set<string>();
      for (let index = 0; index < value.length; index += 1) {
        const item = validateValueInternal(
          itemDefinition,
          value[index],
          collector,
          `${path}.${index}`,
        );
        normalized.push(item);
        if (definition.configuration.uniqueItems === true) {
          const identity = canonicalJson(item);
          if (unique.has(identity))
            addIssue(
              collector,
              `${path}.${index}`,
              "list_item_duplicate",
              "List items must be unique.",
            );
          unique.add(identity);
        }
      }
      preflightJson(
        normalized,
        fieldSystemLimits.definitionMaxDepth,
        fieldSystemLimits.valueBytes,
        20_000,
        collector,
        path,
      );
      return normalized;
    }
    case "reference":
      if (typeof value !== "string" || !uuidPattern.test(value)) {
        addIssue(collector, path, "reference_invalid", "Use a stable entry UUID.");
        return value;
      }
      return value.toLowerCase();
    case "external_asset": {
      if (!isPlainRecord(value)) {
        addIssue(
          collector,
          path,
          "external_asset_invalid",
          "Use structured external asset metadata.",
        );
        return value;
      }
      const allowedKeys = new Set(["source", "url", "kind", "title", "alt", "width", "height"]);
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key))
          addIssue(
            collector,
            `${path}.${key}`,
            "external_asset_key_unknown",
            "This asset property is not supported.",
          );
      }
      if (value.source !== "external")
        addIssue(
          collector,
          `${path}.source`,
          "external_asset_source",
          "Asset source must be external.",
        );
      if (!validHttpUrl(value.url, true))
        addIssue(
          collector,
          `${path}.url`,
          "external_asset_url",
          "Use an absolute HTTPS asset URL without credentials.",
        );
      if (!["image", "video", "audio", "document", "archive", "other"].includes(String(value.kind)))
        addIssue(collector, `${path}.kind`, "external_asset_kind", "Use a supported asset kind.");
      for (const key of ["title", "alt"]) {
        const metadata = Reflect.get(value, key);
        if (
          metadata !== null &&
          (typeof metadata !== "string" ||
            codePointLength(metadata) > 500 ||
            hasRejectedControl(metadata, false))
        )
          addIssue(
            collector,
            `${path}.${key}`,
            "external_asset_text",
            "Asset text must be null or at most 500 safe characters.",
          );
      }
      for (const key of ["width", "height"]) {
        const dimension = Reflect.get(value, key);
        if (
          dimension !== null &&
          (!Number.isSafeInteger(dimension) || Number(dimension) < 1 || Number(dimension) > 100_000)
        )
          addIssue(
            collector,
            `${path}.${key}`,
            "external_asset_dimension",
            "Asset dimensions must be null or positive integers up to 100000.",
          );
      }
      return value;
    }
  }
}

/** Applies absence/default semantics before validating a present field value. */
function validateValueInternal(
  definition: ValueFieldDefinition,
  value: unknown,
  collector: MutableIssueCollector,
  path: string,
): unknown {
  if (value === undefined) {
    const configuredDefault = Reflect.get(definition.configuration, "default");
    if (configuredDefault !== undefined)
      return validatePresentValue(
        definition,
        copyDecodedSchemaClass(configuredDefault),
        collector,
        path,
      );
    if (definition.required) addIssue(collector, path, "required", "This field is required.");
    return undefined;
  }
  if (value === null) {
    addIssue(collector, path, "null_unsupported", "Null is not a supported field value.");
    return value;
  }
  return validatePresentValue(definition, value, collector, path);
}

/** Validates one field value, applies defaults, and returns bounded issues. */
export function validateFieldValue(
  definition: ValueFieldDefinition,
  value: unknown,
  path = definition.apiKey ?? "value",
): FieldValueValidationResult {
  const collector = makeCollector();
  const normalized = validateValueInternal(definition, value, collector, path);
  return {
    valid: collector.issues.length === 0,
    value: normalized,
    issues: collector.issues,
    capped: collector.capped,
  };
}

/** Validates type-specific configuration relationships and configured defaults. */
function validateConfigurationSemantics(
  definition: ValueFieldDefinition,
  collector: MutableIssueCollector,
  path: string,
): void {
  const invalidRange = (minimum: number | undefined, maximum: number | undefined) =>
    minimum !== undefined && maximum !== undefined && minimum > maximum;
  const validateLengthRange = (
    minimum: number | undefined,
    maximum: number | undefined,
    absoluteMaximum: number,
  ) => {
    if (
      (minimum !== undefined && (minimum < 0 || minimum > absoluteMaximum)) ||
      (maximum !== undefined && (maximum < 0 || maximum > absoluteMaximum)) ||
      invalidRange(minimum, maximum)
    )
      addIssue(
        collector,
        `${path}.configuration`,
        "configuration_range_invalid",
        "Configured length bounds must be ordered within platform limits.",
      );
  };

  switch (definition.kind) {
    case "short_text":
    case "long_text":
    case "slug": {
      const absoluteMaximum =
        definition.kind === "short_text" ? 500 : definition.kind === "long_text" ? 50_000 : 200;
      validateLengthRange(
        definition.configuration.minLength,
        definition.configuration.maxLength,
        absoluteMaximum,
      );
      if (definition.configuration.pattern !== undefined) {
        try {
          RE2JS.compile(definition.configuration.pattern);
        } catch {
          addIssue(
            collector,
            `${path}.configuration.pattern`,
            "pattern_invalid",
            "The configured safe pattern is invalid.",
          );
        }
      }
      break;
    }
    case "rich_text": {
      const configuration = definition.configuration;
      validateLengthRange(configuration.minLength, configuration.maxLength, 100_000);
      for (const values of [configuration.styles, configuration.decorators, configuration.lists]) {
        if (values !== undefined && new Set(values).size !== values.length)
          addIssue(
            collector,
            `${path}.configuration`,
            "configuration_values_duplicate",
            "Configured rich-text allowlists must contain unique values.",
          );
      }
      break;
    }
    case "number": {
      const configuration = definition.configuration;
      if (
        [configuration.minimum, configuration.maximum, configuration.default].some(
          (value) => value !== undefined && !Number.isFinite(value),
        )
      )
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_number_invalid",
          "Number bounds and defaults must be finite.",
        );
      if (invalidRange(configuration.minimum, configuration.maximum))
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_range_invalid",
          "The configured minimum cannot exceed the maximum.",
        );
      if (
        configuration.mode === "integer" &&
        [configuration.minimum, configuration.maximum, configuration.default].some(
          (value) => value !== undefined && !Number.isSafeInteger(value),
        )
      )
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_integer_invalid",
          "Integer field bounds and defaults must be safe integers.",
        );
      break;
    }
    case "decimal": {
      const configuration = definition.configuration;
      const precision = configuration.precision ?? 38;
      const scale = configuration.scale ?? 18;
      if (scale > precision)
        addIssue(
          collector,
          `${path}.configuration.scale`,
          "configuration_scale_invalid",
          "Decimal scale cannot exceed decimal precision.",
        );
      const minimum =
        configuration.minimum === undefined ? null : parseExactDecimal(configuration.minimum);
      const maximum =
        configuration.maximum === undefined ? null : parseExactDecimal(configuration.maximum);
      if (minimum && maximum && compareExactDecimals(minimum, maximum) > 0)
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_range_invalid",
          "The configured minimum cannot exceed the maximum.",
        );
      break;
    }
    case "money": {
      const configuration = definition.configuration;
      if (new Set(configuration.currencies).size !== configuration.currencies.length)
        addIssue(
          collector,
          `${path}.configuration.currencies`,
          "configuration_values_duplicate",
          "Configured currencies must be unique.",
        );
      break;
    }
    case "date": {
      const configuration = definition.configuration;
      if (
        (configuration.minimum !== undefined && validDate(configuration.minimum) === null) ||
        (configuration.maximum !== undefined && validDate(configuration.maximum) === null)
      )
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_date_invalid",
          "Date bounds must be valid calendar dates.",
        );
      if (
        configuration.minimum !== undefined &&
        configuration.maximum !== undefined &&
        configuration.minimum > configuration.maximum
      )
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_range_invalid",
          "The configured minimum date cannot exceed the maximum date.",
        );
      break;
    }
    case "date_time": {
      const configuration = definition.configuration;
      const minimum = canonicalDateTime(configuration.minimum);
      const maximum = canonicalDateTime(configuration.maximum);
      if (
        (configuration.minimum !== undefined && minimum === null) ||
        (configuration.maximum !== undefined && maximum === null)
      )
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_date_time_invalid",
          "Date-time bounds must be valid RFC 3339 instants.",
        );
      if (minimum && maximum && minimum > maximum)
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_range_invalid",
          "The configured minimum instant cannot exceed the maximum instant.",
        );
      break;
    }
    case "enum": {
      const configuration = definition.configuration;
      const ids = new Set<string>();
      const values = new Set<string>();
      const positions = new Set<number>();
      for (const option of configuration.options) {
        if (ids.has(option.id) || values.has(option.value) || positions.has(option.position))
          addIssue(
            collector,
            `${path}.configuration.options`,
            "enum_option_duplicate",
            "Enum option IDs, values, and positions must be unique.",
          );
        ids.add(option.id);
        values.add(option.value);
        positions.add(option.position);
      }
      for (let expected = 0; expected < configuration.options.length; expected += 1) {
        if (!positions.has(expected)) {
          addIssue(
            collector,
            `${path}.configuration.options`,
            "enum_position_not_dense",
            "Enum option positions must be dense and begin at zero.",
          );
          break;
        }
      }
      break;
    }
    case "json": {
      const configuration = definition.configuration;
      if (
        (configuration.maxBytes !== undefined &&
          (configuration.maxBytes < 1 || configuration.maxBytes > 65_536)) ||
        (configuration.maxDepth !== undefined &&
          (configuration.maxDepth < 1 || configuration.maxDepth > 10))
      )
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_limit_invalid",
          "JSON limits must remain within platform bounds.",
        );
      break;
    }
    case "list": {
      const configuration = definition.configuration;
      if (
        (configuration.minItems !== undefined &&
          (configuration.minItems < 0 || configuration.minItems > fieldSystemLimits.listItems)) ||
        (configuration.maxItems !== undefined &&
          (configuration.maxItems < 0 || configuration.maxItems > fieldSystemLimits.listItems)) ||
        invalidRange(configuration.minItems, configuration.maxItems)
      )
        addIssue(
          collector,
          `${path}.configuration`,
          "configuration_range_invalid",
          "List bounds must be ordered within platform limits.",
        );
      break;
    }
    case "boolean":
    case "email":
    case "url":
    case "object":
    case "reference":
    case "external_asset":
      break;
  }

  const configuredDefault = Reflect.get(definition.configuration, "default");
  if (configuredDefault !== undefined) {
    const classBackedDefault =
      definition.kind === "money" ||
      definition.kind === "external_asset" ||
      definition.kind === "rich_text";
    const value =
      classBackedDefault && !isPlainRecord(configuredDefault)
        ? copyDecodedSchemaClass(configuredDefault)
        : configuredDefault;
    validatePresentValue(definition, value, collector, `${path}.configuration.default`);
  }
}

/** Validates recursive shape, localization, depth, and direct-list invariants. */
export function validateDefinitionTree(
  roots: ReadonlyArray<ValueFieldDefinition>,
): DefinitionTreeValidationResult {
  const collector = makeCollector();
  const stack: Array<{
    readonly definition: ValueFieldDefinition;
    readonly depth: number;
    readonly inheritedLocalization: Exclude<FieldLocalization, "mixed"> | null;
    readonly belowList: boolean;
    readonly parentKind: "object" | "list" | null;
  }> = [];
  const identities = new Set<string>();
  let nodes = 0;

  if (roots.length > fieldSystemLimits.fieldNodes)
    addIssue(
      collector,
      "fields",
      "field_count_exceeded",
      `A schema can contain at most ${fieldSystemLimits.fieldNodes} field nodes.`,
    );

  for (let index = roots.length - 1; index >= 0; index -= 1) {
    const root = roots[index];
    if (root)
      stack.push({
        definition: root,
        depth: 1,
        inheritedLocalization: null,
        belowList: false,
        parentKind: null,
      });
  }

  const rootPositions = new Set<number>();
  const rootKeys = new Set<string>();
  for (const root of roots) {
    if (root.apiKey !== null) {
      if (rootKeys.has(root.apiKey))
        addIssue(
          collector,
          `fields.${root.id}.apiKey`,
          "field_api_key_duplicate",
          "Root field API keys must be unique.",
        );
      rootKeys.add(root.apiKey);
    }
    if (rootPositions.has(root.position))
      addIssue(
        collector,
        `fields.${root.id}.position`,
        "field_position_duplicate",
        "Sibling positions must be unique.",
      );
    rootPositions.add(root.position);
  }
  for (let expected = 0; expected < roots.length; expected += 1) {
    if (!rootPositions.has(expected)) {
      addIssue(
        collector,
        "fields",
        "field_position_not_dense",
        "Root field positions must be dense and begin at zero.",
      );
      break;
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const definition = current.definition;
    const path = `fields.${definition.id}`;
    nodes += 1;
    if (nodes > fieldSystemLimits.fieldNodes) {
      addIssue(
        collector,
        "fields",
        "field_count_exceeded",
        `A schema can contain at most ${fieldSystemLimits.fieldNodes} field nodes.`,
      );
      break;
    }
    if (current.depth > fieldSystemLimits.definitionMaxDepth)
      addIssue(
        collector,
        path,
        "field_depth_exceeded",
        `Field depth cannot exceed ${fieldSystemLimits.definitionMaxDepth}.`,
      );
    if (identities.has(definition.id))
      addIssue(collector, path, "field_id_duplicate", "Field IDs must be unique.");
    identities.add(definition.id);
    validateConfigurationSemantics(definition, collector, path);

    if (current.parentKind === null && definition.nodeRole !== "root")
      addIssue(collector, path, "field_role_invalid", "Top-level fields must use the root role.");
    if (current.parentKind === "object" && definition.nodeRole !== "object_property")
      addIssue(
        collector,
        path,
        "field_role_invalid",
        "Object children must use the object-property role.",
      );
    if (current.parentKind === "list" && definition.nodeRole !== "list_item")
      addIssue(collector, path, "field_role_invalid", "List children must use the list-item role.");
    if (definition.nodeRole === "list_item" && definition.position !== 0)
      addIssue(collector, path, "list_item_position", "List item position must be zero.");
    if (definition.nodeRole === "list_item" && definition.required !== null)
      addIssue(
        collector,
        path,
        "list_item_required_invalid",
        "List item definitions inherit presence from their parent.",
      );
    if (definition.nodeRole === "list_item" && definition.apiKey !== null)
      addIssue(
        collector,
        path,
        "list_item_key_invalid",
        "List item definitions cannot have API keys.",
      );
    if (definition.nodeRole !== "list_item" && definition.apiKey === null)
      addIssue(
        collector,
        path,
        "field_key_required",
        "Root and object properties require API keys.",
      );

    if (definition.kind === "list") {
      if (definition.children.length > 1)
        addIssue(
          collector,
          path,
          "list_item_count",
          "A list can contain at most one item definition.",
        );
      if (definition.children[0]?.kind === "list")
        addIssue(
          collector,
          path,
          "list_of_list",
          "A direct list-of-list is not supported; insert an object boundary.",
        );
    } else if (definition.kind === "object") {
      if (definition.children.length > fieldSystemLimits.directObjectProperties)
        addIssue(
          collector,
          path,
          "object_properties_exceeded",
          `An object can contain at most ${fieldSystemLimits.directObjectProperties} properties.`,
        );
    } else if (definition.children.length > 0) {
      addIssue(
        collector,
        path,
        "field_children_invalid",
        "Only object and list fields may contain child definitions.",
      );
    }

    const effectiveLocalization = current.inheritedLocalization ?? definition.localization;
    if (current.inheritedLocalization !== null && definition.localization !== null)
      addIssue(
        collector,
        path,
        "localization_inherited",
        "Descendants of atomic fields must inherit localization.",
      );
    if (definition.kind !== "object" && effectiveLocalization === "mixed")
      addIssue(
        collector,
        path,
        "localization_mixed_invalid",
        "Only objects may use mixed localization.",
      );
    if (
      current.belowList &&
      (definition.localization === "mixed" || effectiveLocalization === "mixed")
    )
      addIssue(
        collector,
        path,
        "localization_list_mixed",
        "List subtrees cannot use mixed localization.",
      );
    if (
      definition.nodeRole !== "list_item" &&
      effectiveLocalization !== "mixed" &&
      definition.required === null
    )
      addIssue(
        collector,
        path,
        "field_required_missing",
        "Root and object-property fields require a presence rule.",
      );
    if (definition.kind === "object" && effectiveLocalization === "mixed") {
      if (definition.required !== null)
        addIssue(
          collector,
          path,
          "mixed_object_required",
          "Mixed objects cannot define independent required presence.",
        );
      if (Reflect.get(definition.configuration, "default") !== undefined)
        addIssue(
          collector,
          path,
          "mixed_object_default",
          "Mixed objects cannot define a direct default.",
        );
    }

    const siblingKeys = new Set<string>();
    const siblingPositions = new Set<number>();
    for (const child of definition.children) {
      if (siblingPositions.has(child.position))
        addIssue(
          collector,
          `${path}.${child.id}.position`,
          "field_position_duplicate",
          "Sibling positions must be unique.",
        );
      siblingPositions.add(child.position);
    }
    if (definition.kind === "object") {
      for (let expected = 0; expected < definition.children.length; expected += 1) {
        if (!siblingPositions.has(expected)) {
          addIssue(
            collector,
            path,
            "field_position_not_dense",
            "Object-property positions must be dense and begin at zero.",
          );
          break;
        }
      }
    }
    for (let index = definition.children.length - 1; index >= 0; index -= 1) {
      const child = definition.children[index];
      if (!child) continue;
      if (child.apiKey !== null) {
        if (siblingKeys.has(child.apiKey))
          addIssue(
            collector,
            `${path}.${child.apiKey}`,
            "field_key_duplicate",
            "Sibling API keys must be unique.",
          );
        siblingKeys.add(child.apiKey);
      }
      const inherited =
        definition.kind === "list" || effectiveLocalization !== "mixed"
          ? effectiveLocalization === "mixed"
            ? null
            : effectiveLocalization
          : null;
      stack.push({
        definition: child,
        depth: current.depth + 1,
        inheritedLocalization: inherited,
        belowList: current.belowList || definition.kind === "list",
        parentKind:
          definition.kind === "object" ? "object" : definition.kind === "list" ? "list" : null,
      });
    }
  }

  return {
    valid: collector.issues.length === 0,
    issues: collector.issues,
    capped: collector.capped,
  };
}
