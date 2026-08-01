import {
  extlangTagAliases,
  languageSubtagAliases,
  regionSubtagAliases,
  registeredLanguageSubtags,
  registeredRegionSubtags,
  registeredScriptSubtags,
  registeredTagAliases,
  registeredVariantSubtags,
  scriptSubtagAliases,
  unsupportedGrandfatheredTags,
  variantSubtagAliases,
} from "./locale-registry.generated";

export const localeTagMaxLength = 64;
export const localeTagPattern = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u;

export type LocaleTagValidationErrorCode =
  | "empty"
  | "too_long"
  | "malformed"
  | "unknown_language"
  | "unknown_script"
  | "unknown_region"
  | "unknown_variant"
  | "unsupported_extension"
  | "unsupported_private_use"
  | "unsupported_grandfathered";

export type LocaleTagValidationResult =
  | { readonly ok: true; readonly tag: string }
  | { readonly ok: false; readonly code: LocaleTagValidationErrorCode };

const languagePattern = /^[A-Za-z]{2,8}$/u;
const scriptPattern = /^[A-Za-z]{4}$/u;
const regionPattern = /^(?:[A-Za-z]{2}|[0-9]{3})$/u;
const variantPattern = /^(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3})$/u;
const singletonPattern = /^[A-Za-z0-9]$/u;

function invalid(code: LocaleTagValidationErrorCode): LocaleTagValidationResult {
  return { ok: false, code };
}

function isPrivateUseLanguage(subtag: string): boolean {
  return subtag.length === 3 && subtag >= "qaa" && subtag <= "qtz";
}

function isPrivateUseScript(subtag: string): boolean {
  return subtag >= "qaaa" && subtag <= "qabx";
}

function isPrivateUseRegion(subtag: string): boolean {
  return (
    subtag === "aa" ||
    subtag === "zz" ||
    (subtag >= "qm" && subtag <= "qz") ||
    (subtag >= "xa" && subtag <= "xz")
  );
}

function titleCase(value: string): string {
  return `${value[0]?.toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function validateCanonicalLocaleTag(
  value: string,
  visitedAliases: ReadonlySet<string>,
): LocaleTagValidationResult {
  const normalizedTag = value.toLowerCase();
  const preferredTag = registeredTagAliases.get(normalizedTag);
  if (preferredTag) {
    if (visitedAliases.has(normalizedTag)) return invalid("malformed");
    return validateCanonicalLocaleTag(preferredTag, new Set([...visitedAliases, normalizedTag]));
  }
  if (unsupportedGrandfatheredTags.has(normalizedTag)) {
    return invalid("unsupported_grandfathered");
  }

  const parts = value.split("-");
  const firstPart = parts[0];
  if (!firstPart) return invalid("malformed");

  let language = firstPart.toLowerCase();
  if (language === "x" || isPrivateUseLanguage(language)) {
    return invalid("unsupported_private_use");
  }
  if (!languagePattern.test(firstPart)) return invalid("malformed");
  if (!registeredLanguageSubtags.has(language)) return invalid("unknown_language");

  let index = 1;
  const possibleExtlang = parts[index]?.toLowerCase();
  if (possibleExtlang && /^[a-z]{3}$/u.test(possibleExtlang)) {
    const preferredExtlang = extlangTagAliases.get(`${language}-${possibleExtlang}`);
    if (!preferredExtlang) return invalid("malformed");
    language = preferredExtlang.toLowerCase();
    index += 1;
  }

  language = languageSubtagAliases.get(language)?.toLowerCase() ?? language;
  if (!registeredLanguageSubtags.has(language)) return invalid("unknown_language");

  let script: string | undefined;
  const possibleScript = parts[index];
  if (possibleScript && scriptPattern.test(possibleScript)) {
    const normalizedScript = possibleScript.toLowerCase();
    if (isPrivateUseScript(normalizedScript)) return invalid("unsupported_private_use");
    if (!registeredScriptSubtags.has(normalizedScript)) return invalid("unknown_script");
    script = titleCase(scriptSubtagAliases.get(normalizedScript) ?? normalizedScript);
    index += 1;
  }

  let region: string | undefined;
  const possibleRegion = parts[index];
  if (possibleRegion && regionPattern.test(possibleRegion)) {
    const normalizedRegion = possibleRegion.toLowerCase();
    if (isPrivateUseRegion(normalizedRegion)) return invalid("unsupported_private_use");
    if (!registeredRegionSubtags.has(normalizedRegion)) return invalid("unknown_region");
    region = (regionSubtagAliases.get(normalizedRegion) ?? normalizedRegion).toUpperCase();
    index += 1;
  }

  const variants: Array<string> = [];
  const seenVariants = new Set<string>();
  for (; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part) return invalid("malformed");
    if (singletonPattern.test(part)) {
      return invalid(
        part.toLowerCase() === "x" ? "unsupported_private_use" : "unsupported_extension",
      );
    }
    if (!variantPattern.test(part)) return invalid("malformed");

    const normalizedVariant = part.toLowerCase();
    if (!registeredVariantSubtags.has(normalizedVariant)) return invalid("unknown_variant");
    const canonicalVariant =
      variantSubtagAliases.get(normalizedVariant)?.toLowerCase() ?? normalizedVariant;
    if (seenVariants.has(canonicalVariant)) return invalid("malformed");
    seenVariants.add(canonicalVariant);
    variants.push(canonicalVariant);
  }

  const tag = [language, script, region, ...variants]
    .filter((part) => part !== undefined)
    .join("-");
  return tag.length <= localeTagMaxLength ? { ok: true, tag } : invalid("too_long");
}

export function validateAndCanonicalizeLocaleTag(value: string): LocaleTagValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) return invalid("empty");
  if (trimmed.length > localeTagMaxLength) return invalid("too_long");
  if (!localeTagPattern.test(trimmed)) {
    if (/^(?:x(?:-|$)|.*-x(?:-|$))/iu.test(trimmed)) return invalid("unsupported_private_use");
    return invalid("malformed");
  }
  return validateCanonicalLocaleTag(trimmed, new Set());
}

export function localeTagValidationMessage(code: LocaleTagValidationErrorCode): string {
  switch (code) {
    case "empty":
      return "Enter a locale tag.";
    case "too_long":
      return `Locale tags must be at most ${localeTagMaxLength} characters.`;
    case "unknown_language":
      return "The language subtag is not registered in the IANA Language Subtag Registry.";
    case "unknown_script":
      return "The script subtag is not registered in the IANA Language Subtag Registry.";
    case "unknown_region":
      return "The region subtag is not registered in the IANA Language Subtag Registry.";
    case "unknown_variant":
      return "The variant subtag is not registered in the IANA Language Subtag Registry.";
    case "unsupported_extension":
      return "Locale extensions are not supported.";
    case "unsupported_private_use":
      return "Private-use locale tags and subtags are not supported.";
    case "unsupported_grandfathered":
      return "This grandfathered locale tag has no safe registered replacement.";
    case "malformed":
      return "Use a registered BCP 47 locale tag such as en, en-GB, or zh-Hant-TW.";
  }
}

export function canonicalizeLocaleTag(value: string): string | undefined {
  const result = validateAndCanonicalizeLocaleTag(value);
  return result.ok ? result.tag : undefined;
}
