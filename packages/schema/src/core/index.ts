// Type-only, dependency-free contracts for the closed M13 Tier 1 schema grammar.

export type SchemaJsonPrimitive = null | boolean | number | string;
export type SchemaJsonValue =
  | SchemaJsonPrimitive
  | SchemaJsonObject
  | ReadonlyArray<SchemaJsonValue>;
export interface SchemaJsonObject {
  readonly [key: string]: SchemaJsonValue;
}

export type FieldLocalization = "localized" | "shared" | "mixed";
export type NumberMode = "integer" | "floating_point";
export type ExternalAssetKind = "image" | "video" | "audio" | "document" | "archive" | "other";
export type PortableTextStyle = "normal" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote";
export type PortableTextDecorator = "strong" | "em" | "underline" | "strike-through" | "code";
export type PortableTextListKind = "bullet" | "number";

export interface PortableTextLinkMark {
  readonly _key: string;
  readonly _type: "link";
  readonly href: string;
}

export interface PortableTextSpan {
  readonly _key: string;
  readonly _type: "span";
  readonly text: string;
  readonly marks: ReadonlyArray<string>;
}

export interface PortableTextBlock {
  readonly _key: string;
  readonly _type: "block";
  readonly style: PortableTextStyle;
  readonly listItem?: PortableTextListKind;
  readonly level?: 1 | 2 | 3;
  readonly children: ReadonlyArray<PortableTextSpan>;
  readonly markDefs: ReadonlyArray<PortableTextLinkMark>;
}

export interface PortableTextDocument {
  readonly version: 1;
  readonly profile: "ffd-portable-text";
  readonly blocks: ReadonlyArray<PortableTextBlock>;
}

export interface MoneyValue {
  readonly amount: string;
  readonly currency: string;
}

export interface ExternalAssetValue {
  readonly source: "external";
  readonly url: string;
  readonly kind: ExternalAssetKind;
  readonly title: string | null;
  readonly alt: string | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface ShortTextConfiguration {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly default?: string;
}

export interface LongTextConfiguration {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly default?: string;
}

export interface RichTextConfiguration {
  readonly styles?: ReadonlyArray<PortableTextStyle>;
  readonly decorators?: ReadonlyArray<PortableTextDecorator>;
  readonly links?: boolean;
  readonly lists?: ReadonlyArray<PortableTextListKind>;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly default?: PortableTextDocument;
}

export interface NumberConfiguration {
  readonly mode?: NumberMode;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: number;
}

export interface DecimalConfiguration {
  readonly precision?: number;
  readonly scale?: number;
  readonly minimum?: string;
  readonly maximum?: string;
  readonly default?: string;
}

export interface MoneyConfiguration {
  readonly currencies: ReadonlyArray<string>;
  readonly allowNegative?: boolean;
  readonly default?: MoneyValue;
}

export interface BooleanConfiguration {
  readonly default?: boolean;
}

export interface DateConfiguration {
  readonly minimum?: string;
  readonly maximum?: string;
  readonly default?: string;
}

export interface DateTimeConfiguration {
  readonly minimum?: string;
  readonly maximum?: string;
  readonly default?: string;
}

export interface EnumOptionSchema {
  readonly sourceKey: string;
  readonly value: string;
}

export interface EnumConfiguration {
  readonly options: ReadonlyArray<EnumOptionSchema>;
  readonly default?: string;
}

export interface UrlConfiguration {
  readonly default?: string;
}

export interface EmailConfiguration {
  readonly default?: string;
}

export interface SlugConfiguration {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly default?: string;
}

export interface JsonConfiguration {
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly default?: SchemaJsonValue;
}

export interface ObjectConfiguration {
  readonly default?: SchemaJsonObject;
}

export interface ListConfiguration {
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly default?: ReadonlyArray<SchemaJsonValue>;
}

export interface ReferenceConfiguration {
  readonly targetCollectionSourceKey: string;
}

export interface ExternalAssetConfiguration {
  readonly default?: ExternalAssetValue;
}

export interface FieldConfigurationByKind {
  readonly short_text: ShortTextConfiguration;
  readonly long_text: LongTextConfiguration;
  readonly rich_text: RichTextConfiguration;
  readonly number: NumberConfiguration;
  readonly decimal: DecimalConfiguration;
  readonly money: MoneyConfiguration;
  readonly boolean: BooleanConfiguration;
  readonly date: DateConfiguration;
  readonly date_time: DateTimeConfiguration;
  readonly enum: EnumConfiguration;
  readonly url: UrlConfiguration;
  readonly email: EmailConfiguration;
  readonly slug: SlugConfiguration;
  readonly json: JsonConfiguration;
  readonly object: ObjectConfiguration;
  readonly list: ListConfiguration;
  readonly reference: ReferenceConfiguration;
  readonly external_asset: ExternalAssetConfiguration;
}

export type FieldKind = keyof FieldConfigurationByKind;
export type LeafFieldKind = Exclude<FieldKind, "object" | "list">;

interface NamedFieldSchemaBase<K extends FieldKind> {
  readonly sourceKey: string;
  readonly apiKey: string;
  readonly kind: K;
  readonly required: boolean;
  readonly localization: FieldLocalization;
  readonly deprecated?: boolean;
}

interface ListItemSchemaBase<K extends FieldKind> {
  readonly sourceKey: string;
  readonly kind: K;
  readonly localization: FieldLocalization;
  readonly deprecated?: boolean;
}

type NamedLeafFieldSchema = {
  readonly [K in LeafFieldKind]: NamedFieldSchemaBase<K> & {
    readonly configuration: FieldConfigurationByKind[K];
  };
}[LeafFieldKind];

type LeafListItemSchema = {
  readonly [K in LeafFieldKind]: ListItemSchemaBase<K> & {
    readonly configuration: FieldConfigurationByKind[K];
  };
}[LeafFieldKind];

export interface ObjectFieldSchema extends NamedFieldSchemaBase<"object"> {
  readonly configuration: ObjectConfiguration;
  readonly fields: ReadonlyArray<FieldSchema>;
}

export interface ListFieldSchema extends NamedFieldSchemaBase<"list"> {
  readonly configuration: ListConfiguration;
  readonly item: ListItemSchema;
}

export interface ObjectListItemSchema extends ListItemSchemaBase<"object"> {
  readonly configuration: ObjectConfiguration;
  readonly fields: ReadonlyArray<FieldSchema>;
}

export interface NestedListItemSchema extends ListItemSchemaBase<"list"> {
  readonly configuration: ListConfiguration;
  readonly item: ListItemSchema;
}

export type FieldSchema = NamedLeafFieldSchema | ObjectFieldSchema | ListFieldSchema;
export type ListItemSchema = LeafListItemSchema | ObjectListItemSchema | NestedListItemSchema;

export interface CollectionSchema {
  readonly sourceKey: string;
  readonly apiKey: string;
  readonly fields: ReadonlyArray<FieldSchema>;
}

export interface ProjectSchema {
  readonly collections: ReadonlyArray<CollectionSchema>;
}
