import { z } from "zod";

const apiKeyPattern = /^[a-z][a-z0-9_]{0,62}$/u;
const reservedKeys = new Set([
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

const apiKey = z
  .string()
  .trim()
  .min(1, "Enter an API key.")
  .max(63, "API keys can contain at most 63 characters.")
  .refine(
    (value) =>
      apiKeyPattern.test(value) &&
      !value.includes("__") &&
      !value.endsWith("_") &&
      !reservedKeys.has(value),
    "Use a non-reserved lowercase snake-case key beginning with a letter.",
  );

const displayName = z
  .string()
  .trim()
  .min(1, "Enter a display name.")
  .max(100, "Display names can contain at most 100 characters.");

export const entryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter an entry name.")
  .max(100, "Entry names can contain at most 100 characters.")
  .refine(
    (value) =>
      ![...value].some((character) => {
        const codePoint = character.codePointAt(0);
        return (
          codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))
        );
      }),
    "Entry names cannot contain control characters.",
  );

export const collectionFormSchema = z.object({
  displayName,
  apiKey,
  description: z.string().trim().max(500, "Descriptions can contain at most 500 characters."),
});

export const fieldFormSchema = z.object({
  displayLabel: displayName,
  apiKey,
  kind: z.enum([
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
  ]),
  localization: z.enum(["localized", "shared", "mixed"]),
  helpText: z.string().max(500, "Help text can contain at most 500 characters."),
  placeholder: z.string().max(200, "Placeholders can contain at most 200 characters."),
  required: z.boolean(),
  deprecated: z.boolean(),
});

export function cmsKeyFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .replace(/_{2,}/gu, "_")
    .slice(0, 63)
    .replace(/_+$/gu, "");
}
