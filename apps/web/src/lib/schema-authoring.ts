import type {
  CollectionDraftSchema,
  CollectionFieldAuthoringNodeEncoded,
  CollectionFieldDefinition,
  CollectionFieldKind,
} from "@framerfordevs/api/contracts/schemas";
import { iso4217MinorUnits } from "@framerfordevs/api/registry/iso-4217.generated";
import { z } from "zod";

import { cmsKeyFromName } from "@/lib/cms-validation";

const maximumAuthoringBytes = 1_048_576;
const maximumFieldNodes = 100;
const maximumDefinitionDepth = 8;
const maximumDirectProperties = 50;
const exactDecimalPattern = /^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u;
const apiKeyPattern = /^[a-z][a-z0-9_]{0,62}$/u;
const enumValuePattern = /^[a-z][a-z0-9_]{0,62}$/u;
const portableTextKeyPattern = /^[A-Za-z0-9_-]+$/u;
const datePattern = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const currencyCodes = new Set(Object.keys(iso4217MinorUnits));
const reservedApiKeys = new Set([
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
const projectRoles = [
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
] as const;

const optionalInteger = z.number().int().optional();
const optionalNumber = z.number().finite().optional();
const optionalPattern = z.string().max(256).optional();
const exactDecimal = z
  .string()
  .min(1)
  .max(58)
  .regex(exactDecimalPattern, "Use a canonical exact decimal string.");
const currencyCode = z
  .string()
  .length(3)
  .refine((value) => currencyCodes.has(value), "Use a supported ISO 4217 currency code.");
const dateValue = z.string().length(10).regex(datePattern);
const dateTimeValue = z.string().min(20).max(35);
const uniqueStrings = <T extends z.ZodType<string>>(schema: T, maximum: number) =>
  z
    .array(schema)
    .max(maximum)
    .refine((values) => new Set(values).size === values.length, "Values must be unique.");

const editorMetadataSchema = z
  .object({
    helpText: z.string().max(500).nullable(),
    placeholder: z.string().max(200).nullable(),
    visibleToRoles: uniqueStrings(z.enum(projectRoles), 7),
    editableByRoles: uniqueStrings(z.enum(projectRoles), 7),
  })
  .strict();

const portableTextSpanSchema = z
  .object({
    _key: z.string().min(1).max(64).regex(portableTextKeyPattern),
    _type: z.literal("span"),
    text: z.string().max(100_000),
    marks: z.array(z.string().min(1).max(64)).max(32),
  })
  .strict();
const portableTextLinkSchema = z
  .object({
    _key: z.string().min(1).max(64).regex(portableTextKeyPattern),
    _type: z.literal("link"),
    href: z.string().min(1).max(2_048),
  })
  .strict();
const portableTextDocumentSchema = z
  .object({
    version: z.literal(1),
    profile: z.literal("ffd-portable-text"),
    blocks: z
      .array(
        z
          .object({
            _key: z.string().min(1).max(64).regex(portableTextKeyPattern),
            _type: z.literal("block"),
            style: z.enum(["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"]),
            listItem: z.enum(["bullet", "number"]).optional(),
            level: z.number().int().min(1).max(3).optional(),
            children: z.array(portableTextSpanSchema).max(5_000),
            markDefs: z.array(portableTextLinkSchema).max(1_000),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

const configurationSchemas = {
  short_text: z
    .object({
      minLength: optionalInteger,
      maxLength: optionalInteger,
      pattern: optionalPattern,
      default: z.string().max(500).optional(),
    })
    .strict(),
  long_text: z
    .object({
      minLength: optionalInteger,
      maxLength: optionalInteger,
      pattern: optionalPattern,
      default: z.string().max(50_000).optional(),
    })
    .strict(),
  rich_text: z
    .object({
      styles: uniqueStrings(
        z.enum(["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"]),
        7,
      ).optional(),
      decorators: uniqueStrings(
        z.enum(["strong", "em", "underline", "strike-through", "code"]),
        5,
      ).optional(),
      links: z.boolean().optional(),
      lists: uniqueStrings(z.enum(["bullet", "number"]), 2).optional(),
      minLength: optionalInteger,
      maxLength: optionalInteger,
      default: portableTextDocumentSchema.optional(),
    })
    .strict(),
  number: z
    .object({
      mode: z.enum(["integer", "floating_point"]).optional(),
      minimum: optionalNumber,
      maximum: optionalNumber,
      default: optionalNumber,
    })
    .strict(),
  decimal: z
    .object({
      precision: z.number().int().min(1).max(38).optional(),
      scale: z.number().int().min(0).max(18).optional(),
      minimum: exactDecimal.optional(),
      maximum: exactDecimal.optional(),
      default: exactDecimal.optional(),
    })
    .strict(),
  money: z
    .object({
      currencies: uniqueStrings(currencyCode, 50).min(1),
      allowNegative: z.boolean().optional(),
      default: z.object({ amount: exactDecimal, currency: currencyCode }).strict().optional(),
    })
    .strict(),
  boolean: z.object({ default: z.boolean().optional() }).strict(),
  date: z
    .object({
      minimum: dateValue.optional(),
      maximum: dateValue.optional(),
      default: dateValue.optional(),
    })
    .strict(),
  date_time: z
    .object({
      minimum: dateTimeValue.optional(),
      maximum: dateTimeValue.optional(),
      default: dateTimeValue.optional(),
    })
    .strict(),
  enum: z
    .object({
      options: z
        .array(
          z
            .object({
              id: z.uuid(),
              value: z.string().min(1).max(63).regex(enumValuePattern),
              label: z.string().min(1).max(100),
              position: z.number().int().min(0).max(99),
            })
            .strict(),
        )
        .min(1)
        .max(100),
      default: z.string().min(1).max(63).regex(enumValuePattern).optional(),
    })
    .strict()
    .superRefine((configuration, context) => {
      const values = configuration.options.map((option) => option.value);
      const ids = configuration.options.map((option) => option.id);
      if (new Set(values).size !== values.length)
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Enum option values must be unique.",
        });
      if (new Set(ids).size !== ids.length)
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Enum option IDs must be unique.",
        });
      if (configuration.default !== undefined && !values.includes(configuration.default))
        context.addIssue({
          code: "custom",
          path: ["default"],
          message: "Choose a configured enum option as the default.",
        });
    }),
  url: z.object({ default: z.string().max(2_048).optional() }).strict(),
  email: z.object({ default: z.string().max(254).optional() }).strict(),
  slug: z
    .object({
      minLength: optionalInteger,
      maxLength: optionalInteger,
      pattern: optionalPattern,
      default: z.string().max(200).optional(),
    })
    .strict(),
  json: z
    .object({
      maxBytes: optionalInteger,
      maxDepth: optionalInteger,
      default: z.unknown().optional(),
    })
    .strict(),
  object: z.object({ default: z.unknown().optional() }).strict(),
  list: z
    .object({
      minItems: optionalInteger,
      maxItems: optionalInteger,
      uniqueItems: z.boolean().optional(),
      default: z.unknown().optional(),
    })
    .strict(),
  reference: z.object({ targetCollectionId: z.uuid() }).strict(),
  external_asset: z
    .object({
      default: z
        .object({
          source: z.literal("external"),
          url: z.string().min(1).max(2_048),
          kind: z.enum(["image", "video", "audio", "document", "archive", "other"]),
          title: z.string().max(500).nullable(),
          alt: z.string().max(500).nullable(),
          width: z.number().int().min(1).max(100_000).nullable(),
          height: z.number().int().min(1).max(100_000).nullable(),
        })
        .strict()
        .optional(),
    })
    .strict(),
} as const;

const commonAuthoringFields = {
  id: z.uuid().nullable(),
  apiKey: z
    .string()
    .min(1)
    .max(63)
    .regex(apiKeyPattern, "Use a lowercase snake-case API key.")
    .refine(
      (value) => !value.includes("__") && !value.endsWith("_") && !reservedApiKeys.has(value),
      "Use a non-reserved lowercase snake-case API key.",
    )
    .nullable(),
  displayLabel: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => value === value.trim(), "Remove leading or trailing label spaces.")
    .nullable(),
  required: z.boolean().nullable(),
  localization: z.enum(["localized", "shared", "mixed"]).nullable(),
  deprecated: z.boolean(),
  editor: editorMetadataSchema,
};

const authoringFieldSchema: z.ZodType<CollectionFieldAuthoringNodeEncoded> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    authoringVariant("short_text", configurationSchemas.short_text),
    authoringVariant("long_text", configurationSchemas.long_text),
    authoringVariant("rich_text", configurationSchemas.rich_text),
    authoringVariant("number", configurationSchemas.number),
    authoringVariant("decimal", configurationSchemas.decimal),
    authoringVariant("money", configurationSchemas.money),
    authoringVariant("boolean", configurationSchemas.boolean),
    authoringVariant("date", configurationSchemas.date),
    authoringVariant("date_time", configurationSchemas.date_time),
    authoringVariant("enum", configurationSchemas.enum),
    authoringVariant("url", configurationSchemas.url),
    authoringVariant("email", configurationSchemas.email),
    authoringVariant("slug", configurationSchemas.slug),
    authoringVariant("json", configurationSchemas.json),
    authoringVariant("object", configurationSchemas.object),
    authoringVariant("list", configurationSchemas.list),
    authoringVariant("reference", configurationSchemas.reference),
    authoringVariant("external_asset", configurationSchemas.external_asset),
  ]),
);

function authoringVariant<Kind extends CollectionFieldKind, Configuration extends z.ZodType>(
  kind: Kind,
  configuration: Configuration,
) {
  return z
    .object({
      ...commonAuthoringFields,
      kind: z.literal(kind),
      configuration,
      children: z.array(authoringFieldSchema).max(maximumDirectProperties),
    })
    .strict();
}

const authoringDocumentSchema = z
  .object({
    version: z.literal(1),
    fields: z.array(authoringFieldSchema).max(maximumFieldNodes),
  })
  .strict();

export interface SchemaEditorIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface SchemaEditorField {
  readonly localId: string;
  readonly id: string | null;
  readonly apiKey: string | null;
  readonly displayLabel: string | null;
  readonly kind: CollectionFieldKind;
  readonly required: boolean | null;
  readonly localization: "localized" | "shared" | "mixed" | null;
  readonly deprecated: boolean;
  readonly editor: CollectionFieldAuthoringNodeEncoded["editor"];
  readonly configuration: unknown;
  readonly children: ReadonlyArray<SchemaEditorField>;
}

export interface SchemaAuthoringDocument {
  readonly version: 1;
  readonly fields: ReadonlyArray<CollectionFieldAuthoringNodeEncoded>;
}

export interface ParsedAuthoringDocument {
  readonly valid: boolean;
  readonly fields: ReadonlyArray<SchemaEditorField>;
  readonly issues: ReadonlyArray<SchemaEditorIssue>;
}

export interface InferredAuthoringDocument {
  readonly valid: boolean;
  readonly fields: ReadonlyArray<SchemaEditorField>;
  readonly issues: ReadonlyArray<SchemaEditorIssue>;
  readonly warnings: ReadonlyArray<string>;
}

const defaultEditorMetadata = {
  helpText: null,
  placeholder: null,
  visibleToRoles: [...projectRoles],
  editableByRoles: ["owner", "developer", "content_admin", "editor", "client_editor"],
} satisfies CollectionFieldDefinition["editor"];

export const fieldKindOptions = [
  ["short_text", "Short Text"],
  ["long_text", "Long Text"],
  ["rich_text", "Rich Text"],
  ["number", "Number"],
  ["decimal", "Exact Decimal"],
  ["money", "Money"],
  ["boolean", "Boolean"],
  ["date", "Date"],
  ["date_time", "Date & Time"],
  ["enum", "Enum / Select"],
  ["url", "URL"],
  ["email", "Email"],
  ["slug", "Slug"],
  ["json", "JSON"],
  ["object", "Object"],
  ["list", "List"],
  ["reference", "Entry Reference"],
  ["external_asset", "External Asset"],
] as const satisfies ReadonlyArray<readonly [CollectionFieldKind, string]>;

export function fieldKindLabel(kind: CollectionFieldKind): string {
  return fieldKindOptions.find(([value]) => value === kind)?.[1] ?? kind;
}

export function defaultFieldConfiguration(
  kind: CollectionFieldKind,
  collectionId: string,
): CollectionFieldAuthoringNodeEncoded["configuration"] {
  switch (kind) {
    case "money":
      return { currencies: ["USD"] };
    case "enum":
      return {
        options: [{ id: crypto.randomUUID(), value: "option", label: "Option", position: 0 }],
      };
    case "reference":
      return { targetCollectionId: collectionId };
    default:
      return {};
  }
}

function withLocalIds(node: CollectionFieldAuthoringNodeEncoded): SchemaEditorField {
  const parsed = authoringFieldSchema.parse(node);
  return {
    ...parsed,
    localId: parsed.id ?? crypto.randomUUID(),
    children: parsed.children.map(withLocalIds),
  };
}

function definitionToAuthoring(
  field: CollectionFieldDefinition,
): CollectionFieldAuthoringNodeEncoded {
  return authoringFieldSchema.parse({
    id: field.id,
    apiKey: field.apiKey,
    displayLabel: field.displayLabel,
    kind: field.kind,
    required: field.required,
    localization: field.localization,
    deprecated: field.deprecated,
    editor: field.editor,
    configuration: field.configuration,
    children: field.children.map(definitionToAuthoring),
  });
}

export function fieldsFromDraft(draft: CollectionDraftSchema): ReadonlyArray<SchemaEditorField> {
  return draft.fields.map((field) => withLocalIds(definitionToAuthoring(field)));
}

export function createSchemaField(options: {
  readonly kind: CollectionFieldKind;
  readonly collectionId: string;
  readonly parent?: SchemaEditorField;
  readonly suggestedLabel?: string;
  readonly suggestedKey?: string;
}): SchemaEditorField {
  const listItem = options.parent?.kind === "list";
  const inherited = options.parent !== undefined && options.parent.localization !== "mixed";
  const displayLabel = options.suggestedLabel ?? (listItem ? null : "Untitled Field");
  const apiKey = options.suggestedKey ?? (listItem ? null : "untitled_field");
  const node = authoringFieldSchema.parse({
    id: null,
    apiKey,
    displayLabel,
    kind: options.kind,
    required: listItem ? null : false,
    localization: listItem || inherited ? null : "localized",
    deprecated: false,
    editor: listItem && options.parent ? options.parent.editor : defaultEditorMetadata,
    configuration: defaultFieldConfiguration(options.kind, options.collectionId),
    children: [],
  });
  return withLocalIds(node);
}

function rawAuthoringField(field: SchemaEditorField): unknown {
  return {
    id: field.id,
    apiKey: field.apiKey,
    displayLabel: field.displayLabel,
    kind: field.kind,
    required: field.required,
    localization: field.localization,
    deprecated: field.deprecated,
    editor: field.editor,
    configuration: field.configuration,
    children: field.children.map(rawAuthoringField),
  };
}

function rawAuthoringDocument(fields: ReadonlyArray<SchemaEditorField>): unknown {
  return { version: 1, fields: fields.map(rawAuthoringField) };
}

export function authoringDocument(
  fields: ReadonlyArray<SchemaEditorField>,
): SchemaAuthoringDocument {
  return authoringDocumentSchema.parse(rawAuthoringDocument(fields));
}

export function stringifyAuthoringDocument(fields: ReadonlyArray<SchemaEditorField>): string {
  return JSON.stringify(rawAuthoringDocument(fields), null, 2);
}

function zodIssues(error: z.ZodError): ReadonlyArray<SchemaEditorIssue> {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join(".") || "document",
    code: issue.code,
    message: issue.message,
  }));
}

export function parseAuthoringDocument(source: string): ParsedAuthoringDocument {
  if (new TextEncoder().encode(source).byteLength > maximumAuthoringBytes)
    return {
      valid: false,
      fields: [],
      issues: [
        {
          path: "document",
          code: "document_size_exceeded",
          message: "Schema JSON cannot exceed 1 MiB.",
        },
      ],
    };
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      valid: false,
      fields: [],
      issues: [
        {
          path: "document",
          code: "json_parse_failed",
          message: error instanceof Error ? error.message : "Enter valid JSON.",
        },
      ],
    };
  }
  const parsed = authoringDocumentSchema.safeParse(value);
  if (!parsed.success) return { valid: false, fields: [], issues: zodIssues(parsed.error) };
  const fields = parsed.data.fields.map(withLocalIds);
  const structuralIssues = validateEditorFields(fields);
  return { valid: structuralIssues.length === 0, fields, issues: structuralIssues };
}

export function findEditorField(
  fields: ReadonlyArray<SchemaEditorField>,
  localId: string,
): SchemaEditorField | undefined {
  const stack = [...fields];
  while (stack.length > 0) {
    const field = stack.pop();
    if (!field) break;
    if (field.localId === localId) return field;
    stack.push(...field.children);
  }
  return undefined;
}

export function findEditorFieldParent(
  fields: ReadonlyArray<SchemaEditorField>,
  localId: string,
): SchemaEditorField | undefined {
  const stack = [...fields];
  while (stack.length > 0) {
    const field = stack.pop();
    if (!field) break;
    if (field.children.some((child) => child.localId === localId)) return field;
    stack.push(...field.children);
  }
  return undefined;
}

export function editorFieldPath(
  fields: ReadonlyArray<SchemaEditorField>,
  localId: string,
): string | undefined {
  const stack: Array<{
    readonly fields: ReadonlyArray<SchemaEditorField>;
    readonly path: string;
  }> = [{ fields, path: "fields" }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    for (let index = 0; index < current.fields.length; index += 1) {
      const field = current.fields[index];
      if (!field) continue;
      const path = `${current.path}.${index}`;
      if (field.localId === localId) return path;
      if (field.children.length > 0)
        stack.push({ fields: field.children, path: `${path}.children` });
    }
  }
  return undefined;
}

export function updateEditorField(
  fields: ReadonlyArray<SchemaEditorField>,
  localId: string,
  update: (field: SchemaEditorField) => SchemaEditorField,
): ReadonlyArray<SchemaEditorField> {
  return fields.map((field) =>
    field.localId === localId
      ? update(field)
      : field.children.length > 0
        ? { ...field, children: updateEditorField(field.children, localId, update) }
        : field,
  );
}

export function normalizeEditorFieldTree(field: SchemaEditorField): SchemaEditorField {
  const children = field.children.map((child) => {
    if (field.kind === "list")
      return normalizeEditorFieldTree({
        ...child,
        apiKey: null,
        displayLabel: null,
        required: null,
        localization: null,
        editor: field.editor,
      });
    const localization =
      field.localization === "mixed" ? (child.localization ?? "localized") : null;
    return normalizeEditorFieldTree({
      ...child,
      localization,
      required: localization === "mixed" ? null : (child.required ?? false),
    });
  });
  return { ...field, children };
}

export function removeEditorField(
  fields: ReadonlyArray<SchemaEditorField>,
  localId: string,
): ReadonlyArray<SchemaEditorField> {
  return fields
    .filter((field) => field.localId !== localId)
    .map((field) => ({ ...field, children: removeEditorField(field.children, localId) }));
}

export function appendEditorField(
  fields: ReadonlyArray<SchemaEditorField>,
  field: SchemaEditorField,
  parentLocalId: string | null,
): ReadonlyArray<SchemaEditorField> {
  if (parentLocalId === null) return [...fields, field];
  return updateEditorField(fields, parentLocalId, (parent) => ({
    ...parent,
    children: [...parent.children, field],
  }));
}

export function moveEditorField(
  fields: ReadonlyArray<SchemaEditorField>,
  localId: string,
  direction: -1 | 1,
): ReadonlyArray<SchemaEditorField> {
  const moveSiblings = (
    siblings: ReadonlyArray<SchemaEditorField>,
  ): ReadonlyArray<SchemaEditorField> => {
    const index = siblings.findIndex((field) => field.localId === localId);
    if (index < 0)
      return siblings.map((field) => ({ ...field, children: moveSiblings(field.children) }));
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return siblings;
    const next = [...siblings];
    const current = next[index];
    const other = next[target];
    if (!current || !other) return siblings;
    next[index] = other;
    next[target] = current;
    return next;
  };
  return moveSiblings(fields);
}

export function siblingApiKeyConflict(
  fields: ReadonlyArray<SchemaEditorField>,
  localId: string,
  apiKey: string | null,
): boolean {
  if (apiKey === null) return false;
  const stack: Array<ReadonlyArray<SchemaEditorField>> = [fields];
  while (stack.length > 0) {
    const siblings = stack.pop();
    if (!siblings) break;
    if (siblings.some((field) => field.localId === localId))
      return siblings.some((field) => field.localId !== localId && field.apiKey === apiKey);
    for (const field of siblings) stack.push(field.children);
  }
  return false;
}

export function validateEditorFields(
  fields: ReadonlyArray<SchemaEditorField>,
): ReadonlyArray<SchemaEditorIssue> {
  const decoded = authoringDocumentSchema.safeParse(rawAuthoringDocument(fields));
  const issues: Array<SchemaEditorIssue> = decoded.success ? [] : [...zodIssues(decoded.error)];
  const ids = new Set<string>();
  const stack: Array<{
    readonly fields: ReadonlyArray<SchemaEditorField>;
    readonly depth: number;
    readonly path: string;
    readonly parent?: SchemaEditorField;
  }> = [{ fields, depth: 1, path: "fields" }];
  let count = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const keys = new Set<string>();
    for (let index = 0; index < current.fields.length; index += 1) {
      const field = current.fields[index];
      if (!field) continue;
      count += 1;
      const path = `${current.path}.${index}`;
      if (count > maximumFieldNodes)
        issues.push({
          path: "fields",
          code: "field_count_exceeded",
          message: "Use at most 100 fields.",
        });
      if (current.depth > maximumDefinitionDepth)
        issues.push({ path, code: "field_depth_exceeded", message: "Use at most 8 field levels." });
      if (ids.has(field.localId))
        issues.push({
          path: `${path}.id`,
          code: "field_id_duplicate",
          message: "Field IDs must be unique.",
        });
      ids.add(field.localId);
      if (field.apiKey !== null) {
        if (keys.has(field.apiKey))
          issues.push({
            path: `${path}.apiKey`,
            code: "field_key_duplicate",
            message: `The sibling API key “${field.apiKey}” is already in use.`,
          });
        keys.add(field.apiKey);
      }
      if (field.kind !== "object" && field.kind !== "list" && field.children.length > 0)
        issues.push({
          path: `${path}.children`,
          code: "field_parent_kind_invalid",
          message: "Only object and list fields can contain child definitions.",
        });
      if (field.kind === "list" && field.children.length > 1)
        issues.push({
          path: `${path}.children`,
          code: "list_item_count_invalid",
          message: "A list can have only one item definition.",
        });
      if (field.kind === "list" && field.children[0]?.kind === "list")
        issues.push({
          path: `${path}.children.0.kind`,
          code: "nested_list_direct",
          message: "Add an object boundary between nested lists.",
        });
      if (field.localization === "mixed" && field.kind !== "object")
        issues.push({
          path: `${path}.localization`,
          code: "mixed_localization_invalid",
          message: "Mixed localization is available only for object fields.",
        });
      if (field.children.length > 0)
        stack.push({
          fields: field.children,
          depth: current.depth + 1,
          path: `${path}.children`,
          parent: field,
        });
    }
  }
  return issues.slice(0, 50);
}

function displayLabelFromKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[^A-Za-z0-9]+/gu, " ")
    .trim();
  if (!words) return "Field";
  return words
    .split(/\s+/u)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ")
    .slice(0, 100);
}

function uniqueKey(raw: string, used: Set<string>): string {
  const initial = cmsKeyFromName(raw) || "field";
  let candidate = initial;
  let suffix = 2;
  while (used.has(candidate)) {
    const ending = `_${suffix}`;
    candidate = `${initial.slice(0, 63 - ending.length)}${ending}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sampleCategory(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

export function inferAuthoringDocument(
  source: string,
  collectionId: string,
): InferredAuthoringDocument {
  if (new TextEncoder().encode(source).byteLength > maximumAuthoringBytes)
    return {
      valid: false,
      fields: [],
      warnings: [],
      issues: [
        {
          path: "sample",
          code: "sample_size_exceeded",
          message: "Sample JSON cannot exceed 1 MiB.",
        },
      ],
    };
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    return {
      valid: false,
      fields: [],
      warnings: [],
      issues: [
        {
          path: "sample",
          code: "json_parse_failed",
          message: error instanceof Error ? error.message : "Enter valid JSON.",
        },
      ],
    };
  }
  if (!isPlainObject(value))
    return {
      valid: false,
      fields: [],
      warnings: [],
      issues: [
        {
          path: "sample",
          code: "sample_root_invalid",
          message: "Use a JSON object at the top level.",
        },
      ],
    };

  const warnings: Array<string> = [];
  let nodeCount = 0;
  const inferField = (
    key: string,
    sample: unknown,
    parent: SchemaEditorField | undefined,
    depth: number,
    path: string,
    siblingKeys: Set<string>,
  ): SchemaEditorField => {
    nodeCount += 1;
    const label = parent?.kind === "list" ? undefined : displayLabelFromKey(key);
    const apiKey = parent?.kind === "list" ? undefined : uniqueKey(key, siblingKeys);
    let kind: CollectionFieldKind = "json";
    if (typeof sample === "string") kind = sample.length > 500 ? "long_text" : "short_text";
    else if (typeof sample === "number") kind = "number";
    else if (typeof sample === "boolean") kind = "boolean";
    else if (Array.isArray(sample)) kind = "list";
    else if (isPlainObject(sample)) kind = "object";
    else warnings.push(`${path}: null values are inferred as JSON fields.`);

    if (parent?.kind === "list" && kind === "list") {
      kind = "json";
      warnings.push(`${path}: nested arrays require an object boundary and were inferred as JSON.`);
    }
    const field = createSchemaField({
      kind,
      collectionId,
      parent,
      ...(label === undefined ? {} : { suggestedLabel: label }),
      ...(apiKey === undefined ? {} : { suggestedKey: apiKey }),
    });
    if (kind === "number" && typeof sample === "number")
      return {
        ...field,
        configuration: { mode: Number.isInteger(sample) ? "integer" : "floating_point" },
      };
    if (kind === "object" && isPlainObject(sample) && depth < maximumDefinitionDepth) {
      const used = new Set<string>();
      const entries = Object.entries(sample).slice(0, maximumDirectProperties);
      const children: Array<SchemaEditorField> = [];
      for (const [childKey, child] of entries) {
        if (nodeCount >= maximumFieldNodes) break;
        children.push(inferField(childKey, child, field, depth + 1, `${path}.${childKey}`, used));
      }
      if (Object.keys(sample).length > maximumDirectProperties)
        warnings.push(
          `${path}: only the first ${maximumDirectProperties} object properties were inferred.`,
        );
      return { ...field, children };
    }
    if (kind === "list" && Array.isArray(sample) && depth < maximumDefinitionDepth) {
      if (nodeCount >= maximumFieldNodes) {
        warnings.push(
          `${path}: the list item was omitted at the ${maximumFieldNodes}-field limit.`,
        );
        return field;
      }
      const representative = sample.find((item) => item !== null);
      if (representative === undefined) {
        warnings.push(`${path}: the empty/null-only array uses a short-text item placeholder.`);
        return {
          ...field,
          children: [createSchemaField({ kind: "short_text", collectionId, parent: field })],
        };
      }
      const categories = new Set(sample.filter((item) => item !== null).map(sampleCategory));
      if (categories.size > 1)
        warnings.push(
          `${path}: heterogeneous array items were inferred from the first non-null item.`,
        );
      return {
        ...field,
        children: [inferField("item", representative, field, depth + 1, `${path}[0]`, new Set())],
      };
    }
    if (depth >= maximumDefinitionDepth && (kind === "object" || kind === "list"))
      warnings.push(`${path}: descendants beyond depth ${maximumDefinitionDepth} were omitted.`);
    return field;
  };

  const used = new Set<string>();
  const fields: Array<SchemaEditorField> = [];
  for (const [key, sample] of Object.entries(value).slice(0, maximumDirectProperties)) {
    if (nodeCount >= maximumFieldNodes) break;
    fields.push(inferField(key, sample, undefined, 1, key, used));
  }
  if (Object.keys(value).length > maximumDirectProperties)
    warnings.push(`Only the first ${maximumDirectProperties} root properties were inferred.`);
  if (nodeCount >= maximumFieldNodes)
    warnings.push(`Inference stopped at the ${maximumFieldNodes}-field limit.`);
  const issues = validateEditorFields(fields);
  return { valid: issues.length === 0, fields, issues, warnings };
}

function detailFromValue(value: unknown): SchemaEditorIssue | undefined {
  if (typeof value !== "object" || value === null || !("message" in value)) return undefined;
  if (typeof value.message !== "string") return undefined;
  const path = "path" in value && typeof value.path === "string" ? value.path : "schema";
  const code = "code" in value && typeof value.code === "string" ? value.code : "schema_invalid";
  return { path, code, message: value.message };
}

export function applicationErrorDetails(error: unknown): ReadonlyArray<SchemaEditorIssue> {
  let current: unknown = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current !== "object" || current === null) return [];
    if ("details" in current && Array.isArray(current.details)) {
      const details = current.details.flatMap((value) => {
        const detail = detailFromValue(value);
        return detail ? [detail] : [];
      });
      if (details.length > 0) return details;
    }
    if ("data" in current) {
      current = current.data;
      continue;
    }
    if ("error" in current) {
      current = current.error;
      continue;
    }
    break;
  }
  const fallback = detailFromValue(error);
  return fallback ? [fallback] : [];
}
