// Parses the strict raw Delivery query grammar into canonical typed predicates without Express or database dependencies.

import { createHash } from "node:crypto";

import type {
  DeliveryFilterOperator,
  DeliveryQueryScalarKind,
  DeliverySortDirection,
} from "../contracts/delivery";
import { canonicalizeLocaleTag } from "../contracts/locale-tag";
import { canonicalDateTime, parseExactDecimal, validDate } from "./field-validation";

export interface DeliveryQueryCapability {
  readonly fieldId: string;
  readonly fieldKey: string;
  readonly kind: DeliveryQueryScalarKind;
  readonly filterable: boolean;
  readonly sortable: boolean;
}

export interface DeliveryQueryIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type DeliveryFilterValue = string | number | boolean;

export interface DeliveryFilter {
  readonly fieldId: string;
  readonly fieldKey: string;
  readonly kind: DeliveryQueryScalarKind;
  readonly operator: DeliveryFilterOperator;
  readonly value: DeliveryFilterValue;
  readonly canonicalValue: string;
}

export interface DeliverySort {
  readonly fieldId: string;
  readonly fieldKey: string;
  readonly kind: DeliveryQueryScalarKind;
  readonly direction: DeliverySortDirection;
}

export interface ParsedDeliveryListQuery {
  readonly locale: string;
  readonly limit: number;
  readonly cursor: string | null;
  readonly filters: ReadonlyArray<DeliveryFilter>;
  readonly sort: DeliverySort | null;
  readonly expand: ReadonlyArray<string>;
  readonly queryHash: string;
}

export type DeliveryQueryParseResult =
  | { readonly ok: true; readonly value: ParsedDeliveryListQuery }
  | { readonly ok: false; readonly issues: ReadonlyArray<DeliveryQueryIssue> };

const textKinds = new Set<DeliveryQueryScalarKind>(["short_text", "slug", "email", "enum"]);
const orderedKinds = new Set<DeliveryQueryScalarKind>(["number", "decimal", "date", "date_time"]);
const equalityOnlyKinds = new Set<DeliveryQueryScalarKind>([...textKinds, "boolean", "reference"]);
const fieldKeyPattern = /^[a-z][a-z0-9_]{0,62}$/u;
const cursorPattern = /^[A-Za-z0-9_-]+$/u;

/** Creates one bounded issue that identifies grammar/capability, never the supplied value. */
function issue(path: string, code: string, message: string): DeliveryQueryIssue {
  return { path: path.slice(0, 256), code, message: message.slice(0, 512) };
}

/** Reads one singleton parameter while rejecting duplicate query coercion ambiguity. */
function singleton(
  parameters: URLSearchParams,
  key: string,
  required: boolean,
  issues: Array<DeliveryQueryIssue>,
): string | null {
  const values = parameters.getAll(key);
  if (values.length === 0) {
    if (required)
      issues.push(issue(key, `${key}_required`, `The ${key} query parameter is required.`));
    return null;
  }
  if (values.length !== 1) {
    issues.push(
      issue(key, "duplicate_parameter", `The ${key} parameter must appear exactly once.`),
    );
    return null;
  }
  const value = values[0] ?? "";
  if (value.length === 0) {
    issues.push(issue(key, "empty_parameter", `The ${key} parameter cannot be empty.`));
    return null;
  }
  return value;
}

/** Applies the closed operator matrix for the configured scalar kind. */
function operatorAllowed(
  kind: DeliveryQueryScalarKind,
  operator: string,
): operator is DeliveryFilterOperator {
  if (
    operator !== "eq" &&
    operator !== "ne" &&
    operator !== "gt" &&
    operator !== "gte" &&
    operator !== "lt" &&
    operator !== "lte"
  ) {
    return false;
  }
  if (equalityOnlyKinds.has(kind)) return operator === "eq" || operator === "ne";
  return orderedKinds.has(kind);
}

/** Rejects controls and normalizes exact text comparisons to NFC. */
function canonicalText(value: string): string | null {
  if (value.length > 2_048) return null;
  for (const character of value) {
    const point = character.codePointAt(0);
    if (point !== undefined && (point <= 31 || (point >= 127 && point <= 159))) return null;
  }
  return value.normalize("NFC");
}

/** Decodes one raw filter value into its exact comparison representation. */
export function decodeDeliveryFilterValue(
  kind: DeliveryQueryScalarKind,
  value: string,
): { readonly value: DeliveryFilterValue; readonly canonical: string } | null {
  if (textKinds.has(kind)) {
    const canonical = canonicalText(value);
    return canonical === null ? null : { value: canonical, canonical };
  }
  if (kind === "number") {
    if (value.length > 128 || value.trim() !== value || value.length === 0) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || String(parsed) !== value) return null;
    return { value: parsed, canonical: value };
  }
  if (kind === "decimal") {
    return parseExactDecimal(value) === null ? null : { value, canonical: value };
  }
  if (kind === "boolean") {
    if (value !== "true" && value !== "false") return null;
    return { value: value === "true", canonical: value };
  }
  if (kind === "date") {
    const canonical = validDate(value);
    return canonical === null ? null : { value: canonical, canonical };
  }
  if (kind === "date_time") {
    const canonical = canonicalDateTime(value);
    return canonical === null ? null : { value: canonical, canonical };
  }
  if (kind === "reference") {
    const canonical = value.toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      canonical,
    )
      ? { value: canonical, canonical }
      : null;
  }
  return null;
}

/** Parses, validates, and deterministically orders all dynamic filter parameters. */
function parseFilters(
  parameters: URLSearchParams,
  capabilities: ReadonlyMap<string, DeliveryQueryCapability>,
  issues: Array<DeliveryQueryIssue>,
): ReadonlyArray<DeliveryFilter> {
  const filters: Array<DeliveryFilter> = [];
  const seen = new Set<string>();
  let filterParameterCount = 0;
  for (const [key, rawValue] of parameters) {
    if (!key.startsWith("filter.")) continue;
    filterParameterCount += 1;
    if (filterParameterCount > 5) {
      issues.push(issue("filter", "filter_limit_exceeded", "At most five filters are allowed."));
      break;
    }
    const parts = key.split(".");
    const fieldKey = parts[1] ?? "";
    const operator = parts[2] ?? "";
    if (parts.length !== 3 || !fieldKeyPattern.test(fieldKey) || operator.length === 0) {
      issues.push(
        issue(key, "filter_syntax_invalid", "Filter syntax must be filter.{fieldKey}.{operator}."),
      );
      continue;
    }
    if (seen.has(key)) {
      issues.push(issue(key, "duplicate_filter", "A filter predicate may appear only once."));
      continue;
    }
    seen.add(key);
    const capability = capabilities.get(fieldKey);
    if (capability === undefined || !capability.filterable) {
      issues.push(
        issue(key, "filter_field_unsupported", "This field is not configured for filtering."),
      );
      continue;
    }
    if (!operatorAllowed(capability.kind, operator)) {
      issues.push(
        issue(
          key,
          "filter_operator_unsupported",
          "This operator is not supported for the configured field kind.",
        ),
      );
      continue;
    }
    if (rawValue.length === 0) {
      issues.push(issue(key, "filter_value_empty", "Filter values cannot be empty."));
      continue;
    }
    const parsed = decodeDeliveryFilterValue(capability.kind, rawValue);
    if (parsed === null) {
      issues.push(
        issue(
          key,
          "filter_value_invalid",
          "The filter value is invalid for the configured field kind.",
        ),
      );
      continue;
    }
    filters.push({
      fieldId: capability.fieldId,
      fieldKey: capability.fieldKey,
      kind: capability.kind,
      operator,
      value: parsed.value,
      canonicalValue: parsed.canonical,
    });
  }
  return filters.sort(
    (left, right) =>
      left.fieldId.localeCompare(right.fieldId) || left.operator.localeCompare(right.operator),
  );
}

/** Parses one configured field sort with mandatory entry-ID tie-breaking deferred to SQL. */
function parseSort(
  rawSort: string | null,
  capabilities: ReadonlyMap<string, DeliveryQueryCapability>,
  issues: Array<DeliveryQueryIssue>,
): DeliverySort | null {
  if (rawSort === null) return null;
  const direction: DeliverySortDirection = rawSort.startsWith("-") ? "desc" : "asc";
  const fieldKey = direction === "desc" ? rawSort.slice(1) : rawSort;
  if (!fieldKeyPattern.test(fieldKey)) {
    issues.push(
      issue(
        "sort",
        "sort_syntax_invalid",
        "Sort must name one root field, optionally prefixed with '-'.",
      ),
    );
    return null;
  }
  const capability = capabilities.get(fieldKey);
  if (capability === undefined || !capability.sortable) {
    issues.push(
      issue("sort", "sort_field_unsupported", "This field is not configured for sorting."),
    );
    return null;
  }
  return {
    fieldId: capability.fieldId,
    fieldKey: capability.fieldKey,
    kind: capability.kind,
    direction,
  };
}

/** Parses normalized expansion paths while rejecting indexes, duplicates, and depth/count excess. */
function parseExpand(
  rawExpand: string | null,
  issues: Array<DeliveryQueryIssue>,
): ReadonlyArray<string> {
  if (rawExpand === null) return [];
  const paths = rawExpand.split(",");
  if (paths.length > 10) {
    issues.push(
      issue("expand", "expand_path_limit_exceeded", "At most ten expansion paths are allowed."),
    );
    return [];
  }
  const unique = new Set<string>();
  for (const path of paths) {
    const segments = path.split(".");
    if (
      segments.length < 1 ||
      segments.length > 2 ||
      segments.some((segment) => !fieldKeyPattern.test(segment))
    ) {
      issues.push(
        issue(
          "expand",
          "expand_path_invalid",
          "Expansion paths contain one or two field-key segments.",
        ),
      );
      continue;
    }
    if (unique.has(path)) {
      issues.push(issue("expand", "expand_path_duplicate", "Expansion paths must be unique."));
      continue;
    }
    unique.add(path);
  }
  return [...unique].sort();
}

export function decodeDeliveryExpand(
  rawExpand: string | null,
):
  | { readonly ok: true; readonly value: ReadonlyArray<string> }
  | { readonly ok: false; readonly issues: ReadonlyArray<DeliveryQueryIssue> } {
  const issues: Array<DeliveryQueryIssue> = [];
  const value = parseExpand(rawExpand, issues);
  return issues.length === 0 ? { ok: true, value } : { ok: false, issues };
}

/** Hashes only canonical public query authority for cursor binding without retaining raw values. */
function queryHash(value: Omit<ParsedDeliveryListQuery, "cursor" | "queryHash">): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        locale: value.locale,
        limit: value.limit,
        filters: value.filters.map((filter) => [
          filter.fieldId,
          filter.kind,
          filter.operator,
          filter.canonicalValue,
        ]),
        sort: value.sort,
        expand: value.expand,
      }),
      "utf8",
    )
    .digest("hex");
}

/** Parses the list endpoint from the original query string so duplicate keys cannot be hidden. */
export function parseDeliveryListQuery(
  rawQuery: string,
  configuredCapabilities: ReadonlyArray<DeliveryQueryCapability>,
): DeliveryQueryParseResult {
  if (Buffer.byteLength(rawQuery, "utf8") > 8_192) {
    return {
      ok: false,
      issues: [issue("query", "query_too_large", "The query string cannot exceed 8192 bytes.")],
    };
  }
  const parameters = new URLSearchParams(rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery);
  const issues: Array<DeliveryQueryIssue> = [];
  const knownSingletons = new Set(["locale", "limit", "cursor", "sort", "expand"]);
  for (const key of parameters.keys()) {
    if (!knownSingletons.has(key) && !key.startsWith("filter.")) {
      issues.push(issue(key, "query_parameter_unknown", "This query parameter is not supported."));
    }
  }
  const localeInput = singleton(parameters, "locale", true, issues);
  const locale = localeInput === null ? undefined : canonicalizeLocaleTag(localeInput);
  if (localeInput !== null && locale === undefined) {
    issues.push(
      issue("locale", "locale_invalid", "The locale must be a canonical supported BCP 47 tag."),
    );
  }
  const limitInput = singleton(parameters, "limit", false, issues);
  const limit = limitInput === null ? 20 : Number(limitInput);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (limitInput !== null && String(limit) !== limitInput)
  ) {
    if (limitInput !== null)
      issues.push(issue("limit", "limit_invalid", "Limit must be an integer from 1 through 50."));
  }
  const cursor = singleton(parameters, "cursor", false, issues);
  if (cursor !== null && (cursor.length > 1_024 || !cursorPattern.test(cursor))) {
    issues.push(issue("cursor", "cursor_invalid", "The cursor encoding is invalid."));
  }
  const capabilities = new Map(configuredCapabilities.map((field) => [field.fieldKey, field]));
  const filters = parseFilters(parameters, capabilities, issues);
  const sort = parseSort(singleton(parameters, "sort", false, issues), capabilities, issues);
  const expand = parseExpand(singleton(parameters, "expand", false, issues), issues);
  if (
    issues.length > 0 ||
    locale === undefined ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    return { ok: false, issues: issues.slice(0, 50) };
  }
  const authority = { locale, limit, filters, sort, expand };
  return {
    ok: true,
    value: {
      ...authority,
      cursor,
      queryHash: queryHash(authority),
    },
  };
}
