// Defines the browser-safe, role-projected DTO consumed by the controlled content renderer.

export const contentFieldKinds = [
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
] as const;

export type ContentFieldKind = (typeof contentFieldKinds)[number];
export type ContentFieldLocalization = "localized" | "shared" | "mixed";
export type ContentFieldNodeRole = "root" | "object_property" | "list_item";

interface TextConfiguration {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly default?: string;
}

export interface PortableTextSpan {
  readonly _key: string;
  readonly _type: "span";
  readonly text: string;
  readonly marks: ReadonlyArray<string>;
}

export interface PortableTextLinkMark {
  readonly _key: string;
  readonly _type: "link";
  readonly href: string;
}

export interface PortableTextBlock {
  readonly _key: string;
  readonly _type: "block";
  readonly style: "normal" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote";
  readonly listItem?: "bullet" | "number";
  readonly level?: number;
  readonly children: ReadonlyArray<PortableTextSpan>;
  readonly markDefs: ReadonlyArray<PortableTextLinkMark>;
}

export interface PortableTextDocument {
  readonly version: 1;
  readonly profile: "ffd-portable-text";
  readonly blocks: ReadonlyArray<PortableTextBlock>;
}

export interface RichTextConfiguration {
  readonly styles?: ReadonlyArray<"normal" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote">;
  readonly decorators?: ReadonlyArray<"strong" | "em" | "underline" | "strike-through" | "code">;
  readonly links?: boolean;
  readonly lists?: ReadonlyArray<"bullet" | "number">;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly default?: PortableTextDocument;
}

interface NumberConfiguration {
  readonly mode?: "integer" | "floating_point";
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: number;
}

interface DecimalConfiguration {
  readonly precision?: number;
  readonly scale?: number;
  readonly minimum?: string;
  readonly maximum?: string;
  readonly default?: string;
}

interface MoneyConfiguration {
  readonly currencies: ReadonlyArray<string>;
  readonly allowNegative?: boolean;
  readonly default?: { readonly amount: string; readonly currency: string };
}

interface BooleanConfiguration {
  readonly default?: boolean;
}

interface DateConfiguration {
  readonly minimum?: string;
  readonly maximum?: string;
  readonly default?: string;
}

interface EnumConfiguration {
  readonly options: ReadonlyArray<{
    readonly id: string;
    readonly value: string;
    readonly label: string;
    readonly position: number;
  }>;
  readonly default?: string;
}

interface JsonConfiguration {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly default?: unknown;
}

interface ObjectConfiguration {
  readonly default?: unknown;
}

interface ListConfiguration {
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly default?: unknown;
}

interface ReferenceConfiguration {
  readonly targetCollectionId: string;
}

interface ExternalAssetConfiguration {
  readonly default?: {
    readonly source: "external";
    readonly url: string;
    readonly kind: "image" | "video" | "audio" | "document" | "archive" | "other";
    readonly title: string | null;
    readonly alt: string | null;
    readonly width: number | null;
    readonly height: number | null;
  };
}

export interface ContentFieldConfigurationByKind {
  readonly short_text: TextConfiguration;
  readonly long_text: TextConfiguration;
  readonly rich_text: RichTextConfiguration;
  readonly number: NumberConfiguration;
  readonly decimal: DecimalConfiguration;
  readonly money: MoneyConfiguration;
  readonly boolean: BooleanConfiguration;
  readonly date: DateConfiguration;
  readonly date_time: DateConfiguration;
  readonly enum: EnumConfiguration;
  readonly url: { readonly default?: string };
  readonly email: { readonly default?: string };
  readonly slug: TextConfiguration;
  readonly json: JsonConfiguration;
  readonly object: ObjectConfiguration;
  readonly list: ListConfiguration;
  readonly reference: ReferenceConfiguration;
  readonly external_asset: ExternalAssetConfiguration;
}

export interface ContentFieldBase {
  readonly id: string;
  readonly parentFieldId: string | null;
  readonly nodeRole: ContentFieldNodeRole;
  readonly apiKey: string | null;
  readonly displayLabel: string | null;
  readonly required: boolean | null;
  readonly localization: ContentFieldLocalization | null;
  readonly position: number;
  readonly editor: {
    readonly helpText: string | null;
    readonly placeholder: string | null;
  };
  readonly children: ReadonlyArray<ContentFormField>;
}

export type ContentFormField = {
  readonly [Kind in ContentFieldKind]: ContentFieldBase & {
    readonly kind: Kind;
    readonly configuration: ContentFieldConfigurationByKind[Kind];
  };
}[ContentFieldKind];

export interface ContentFieldPlacement {
  readonly id: string;
  readonly fieldId: string;
  readonly position: number;
  readonly helpTextOverride: string | null;
}

export interface ContentLayoutGroup {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly columns: 1 | 2;
  readonly fields: ReadonlyArray<ContentFieldPlacement>;
}

export interface ContentLayoutTab {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly position: number;
  readonly groups: ReadonlyArray<ContentLayoutGroup>;
}

export interface ContentEditorLayout {
  readonly version: 1;
  readonly tabs: ReadonlyArray<ContentLayoutTab>;
  readonly sidebarGroups: ReadonlyArray<ContentLayoutGroup>;
}

export interface ContentFormDefinition {
  readonly canEdit: boolean;
  readonly fields: ReadonlyArray<ContentFormField>;
  readonly editableFieldIds: ReadonlyArray<string>;
  readonly editorLayout: ContentEditorLayout;
  readonly currencyMinorUnits: Readonly<Record<string, number>>;
}

function copyField(field: ContentFormField): ContentFormField {
  const base = {
    id: field.id,
    parentFieldId: field.parentFieldId,
    nodeRole: field.nodeRole,
    apiKey: field.apiKey,
    displayLabel: field.displayLabel,
    required: field.required,
    localization: field.localization,
    position: field.position,
    editor: {
      helpText: field.editor.helpText,
      placeholder: field.editor.placeholder,
    },
    children: field.children.map(copyField),
  };
  switch (field.kind) {
    case "short_text":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "long_text":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "rich_text":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "number":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "decimal":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "money":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "boolean":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "date":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "date_time":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "enum":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "url":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "email":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "slug":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "json":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "object":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "list":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "reference":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "external_asset":
      return { ...base, kind: field.kind, configuration: field.configuration };
  }
}

function copyGroup(group: ContentLayoutGroup): ContentLayoutGroup {
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    position: group.position,
    columns: group.columns,
    fields: group.fields.map((field) => ({
      id: field.id,
      fieldId: field.fieldId,
      position: field.position,
      helpTextOverride: field.helpTextOverride,
    })),
  };
}

/** Projects management or Authoring form authority into the renderer's exact minimal DTO. */
export function adaptContentFormDefinition(
  definition: ContentFormDefinition,
): ContentFormDefinition {
  return {
    canEdit: definition.canEdit,
    fields: definition.fields.map(copyField),
    editableFieldIds: [...definition.editableFieldIds],
    editorLayout: {
      version: 1,
      tabs: definition.editorLayout.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        description: tab.description,
        position: tab.position,
        groups: tab.groups.map(copyGroup),
      })),
      sidebarGroups: definition.editorLayout.sidebarGroups.map(copyGroup),
    },
    currencyMinorUnits: { ...definition.currencyMinorUnits },
  };
}
