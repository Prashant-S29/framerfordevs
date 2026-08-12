// Parses the closed bounded Preview query grammar without consulting headers, persistence, or credentials.

import { Option, Schema } from "effect";

import { EntryRevisionId } from "../contracts/entries";
import { canonicalizeLocaleTag } from "../contracts/locale-tag";
import { previewLimits, type PreviewRevisionSelector } from "../contracts/preview";

export interface PreviewQueryIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface CurrentPreviewQuery {
  readonly locale: string;
}

export interface RevisionPreviewQuery extends CurrentPreviewQuery {
  readonly sharedRevision: PreviewRevisionSelector;
  readonly localizedRevision: PreviewRevisionSelector;
}

export type PreviewQueryResult<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly issues: ReadonlyArray<PreviewQueryIssue> };

const textEncoder = new TextEncoder();

/** Creates one deterministic query rejection without echoing raw selector values. */
function invalid(path: string, code: string, message: string): PreviewQueryResult<never> {
  return { ok: false, issues: [{ path, code, message }] };
}

/** Performs common byte, allowlist, singleton, and exact-locale validation. */
function parseBaseQuery(
  rawQuery: string,
  allowed: ReadonlySet<string>,
): PreviewQueryResult<{ readonly parameters: URLSearchParams; readonly locale: string }> {
  if (textEncoder.encode(rawQuery).byteLength > previewLimits.queryBytes) {
    return invalid("query", "query_too_large", "The Preview query cannot exceed 4096 bytes.");
  }
  const parameters = new URLSearchParams(rawQuery);
  for (const key of parameters.keys()) {
    if (!allowed.has(key)) {
      return invalid(
        key,
        "query_parameter_unknown",
        "This Preview query parameter is unsupported.",
      );
    }
  }
  for (const key of allowed) {
    if (parameters.getAll(key).length > 1) {
      return invalid(key, "duplicate_parameter", "Preview query parameters may appear only once.");
    }
  }
  const rawLocale = parameters.get("locale");
  if (rawLocale === null || rawLocale.length === 0) {
    return invalid("locale", "locale_required", "The locale query parameter is required.");
  }
  const locale = canonicalizeLocaleTag(rawLocale);
  if (locale === undefined) {
    return invalid("locale", "locale_invalid", "Use a supported canonical locale tag.");
  }
  return { ok: true, value: { parameters, locale } };
}

/** Decodes one explicit historical source selector, including version-0 absence. */
function parseRevisionSelector(
  parameters: URLSearchParams,
  key: "sharedRevision" | "localizedRevision",
): PreviewQueryResult<PreviewRevisionSelector> {
  const raw = parameters.get(key);
  if (raw === null || raw.length === 0) {
    return invalid(
      key,
      "revision_selector_required",
      "An explicit revision or `none` is required.",
    );
  }
  if (raw === "none") return { ok: true, value: "none" };
  const revisionId = Option.getOrUndefined(Schema.decodeUnknownOption(EntryRevisionId)(raw));
  return revisionId === undefined
    ? invalid(key, "revision_selector_invalid", "Use `none` or a valid revision ID.")
    : { ok: true, value: revisionId };
}

/** Parses the current-draft route, which accepts only one explicit locale. */
export function parseCurrentPreviewQuery(
  rawQuery: string,
): PreviewQueryResult<CurrentPreviewQuery> {
  const parsed = parseBaseQuery(rawQuery, new Set(["locale"]));
  return parsed.ok ? { ok: true, value: { locale: parsed.value.locale } } : parsed;
}

/** Parses the historical route with mandatory shared and localized source authority. */
export function parseRevisionPreviewQuery(
  rawQuery: string,
): PreviewQueryResult<RevisionPreviewQuery> {
  const parsed = parseBaseQuery(
    rawQuery,
    new Set(["locale", "sharedRevision", "localizedRevision"]),
  );
  if (!parsed.ok) return parsed;
  const shared = parseRevisionSelector(parsed.value.parameters, "sharedRevision");
  if (!shared.ok) return shared;
  const localized = parseRevisionSelector(parsed.value.parameters, "localizedRevision");
  if (!localized.ok) return localized;
  return {
    ok: true,
    value: {
      locale: parsed.value.locale,
      sharedRevision: shared.value,
      localizedRevision: localized.value,
    },
  };
}
