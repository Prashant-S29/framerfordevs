// Defines the schema-backed M6 field vocabulary, structured values, editor metadata, and limits.

import { Schema } from "effect";

import { ProjectRole } from "../access";
import { fieldSystemLimits, fieldSystemValidationProfile } from "../../lib/field/profile";
import { iso4217MinorUnits, iso4217RegistryProfile } from "../../registry/iso-4217.generated";

import { Uuid, UuidValue } from "../uuid";
export const collectionFieldKindValues = [
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

export const CollectionFieldKind = Schema.Literals(collectionFieldKindValues);
export type CollectionFieldKind = typeof CollectionFieldKind.Type;

export const fieldNodeRoleValues = ["root", "object_property", "list_item"] as const;
export const FieldNodeRole = Schema.Literals(fieldNodeRoleValues);
export type FieldNodeRole = typeof FieldNodeRole.Type;

export const fieldLocalizationValues = ["localized", "shared", "mixed"] as const;
export const FieldLocalization = Schema.Literals(fieldLocalizationValues);
export type FieldLocalization = typeof FieldLocalization.Type;

/** Builds an exact optional bounded string property for field defaults. */
const OptionalStringDefault = (maximum: number) =>
  Schema.optionalKey(Schema.String.check(Schema.isMaxLength(maximum)));
const OptionalNumberDefault = Schema.optionalKey(Schema.Number);
const OptionalBooleanDefault = Schema.optionalKey(Schema.Boolean);
const OptionalInteger = Schema.optionalKey(Schema.Number.check(Schema.isInt()));

const SafePattern = Schema.String.check(Schema.isMaxLength(256));
const OptionalSafePattern = Schema.optionalKey(SafePattern);
const DateValue = Schema.String.check(
  Schema.isBetweenLength(10, 10),
  Schema.isPattern(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u),
);
const DateTimeValue = Schema.String.check(Schema.isMinLength(20), Schema.isMaxLength(35));
const ExactDecimalValue = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(58),
  Schema.isPattern(/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u),
).pipe(Schema.brand("ExactDecimalValue"));
export type ExactDecimalValue = typeof ExactDecimalValue.Type;

const Iso4217CurrencyCode = Schema.String.check(
  Schema.isBetweenLength(3, 3),
  Schema.makeFilter((value) => Object.hasOwn(iso4217MinorUnits, value), {
    /** Describes an unsupported or retired currency without leaking input. */
    message: "Use a supported active ISO 4217 currency code.",
  }),
).pipe(Schema.brand("Iso4217CurrencyCode"));
export type Iso4217CurrencyCode = typeof Iso4217CurrencyCode.Type;

const UniqueProjectRoles = Schema.Array(ProjectRole).check(
  Schema.isMaxLength(7),
  Schema.makeFilter((roles) => new Set(roles).size === roles.length, {
    /** Describes duplicate role metadata. */
    message: "Project roles must be unique.",
  }),
);

export class FieldEditorMetadata extends Schema.Class<FieldEditorMetadata>("FieldEditorMetadata")(
  Schema.Struct({
    helpText: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    placeholder: Schema.NullOr(Schema.String.check(Schema.isMaxLength(200))),
    visibleToRoles: UniqueProjectRoles,
    editableByRoles: UniqueProjectRoles,
  }).annotate({ closedObject: true }),
) {}

export const EditorLayoutNodeId = UuidValue.pipe(Schema.brand("EditorLayoutNodeId"));
export type EditorLayoutNodeId = typeof EditorLayoutNodeId.Type;

const LayoutTitle = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100));
const LayoutDescription = Schema.NullOr(Schema.String.check(Schema.isMaxLength(500)));
const VisibleProjectRoles = UniqueProjectRoles.check(Schema.isMinLength(1));

export class EditorFieldPlacement extends Schema.Class<EditorFieldPlacement>(
  "EditorFieldPlacement",
)(
  Schema.Struct({
    id: EditorLayoutNodeId,
    fieldId: Uuid,
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
    helpTextOverride: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    visibleToRoles: VisibleProjectRoles,
  }).annotate({ closedObject: true }),
) {}

export class EditorLayoutGroup extends Schema.Class<EditorLayoutGroup>("EditorLayoutGroup")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: LayoutTitle,
    description: LayoutDescription,
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 19 })),
    columns: Schema.Literals([1, 2]),
    visibleToRoles: VisibleProjectRoles,
    fields: Schema.Array(EditorFieldPlacement).check(Schema.isMaxLength(100)),
  }).annotate({ closedObject: true }),
) {}

export class EditorLayoutTab extends Schema.Class<EditorLayoutTab>("EditorLayoutTab")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: LayoutTitle,
    description: LayoutDescription,
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 9 })),
    visibleToRoles: VisibleProjectRoles,
    groups: Schema.Array(EditorLayoutGroup).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
  }).annotate({ closedObject: true }),
) {}

export class EditorLayout extends Schema.Class<EditorLayout>("EditorLayout")(
  Schema.Struct({
    version: Schema.Literal(1),
    tabs: Schema.Array(EditorLayoutTab).check(Schema.isMinLength(1), Schema.isMaxLength(10)),
    sidebarGroups: Schema.Array(EditorLayoutGroup).check(Schema.isMaxLength(10)),
  }).annotate({ closedObject: true }),
) {}

export const ShortTextConfiguration = Schema.Struct({
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  pattern: OptionalSafePattern,
  default: OptionalStringDefault(500),
}).annotate({
  identifier: "ShortTextConfiguration",
  closedObject: true,
});
export type ShortTextConfiguration = typeof ShortTextConfiguration.Type;

export const LongTextConfiguration = Schema.Struct({
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  pattern: OptionalSafePattern,
  default: OptionalStringDefault(50_000),
}).annotate({
  identifier: "LongTextConfiguration",
  closedObject: true,
});
export type LongTextConfiguration = typeof LongTextConfiguration.Type;

export const NumberConfiguration = Schema.Struct({
  mode: Schema.optionalKey(Schema.Literals(["integer", "floating_point"])),
  minimum: OptionalNumberDefault,
  maximum: OptionalNumberDefault,
  default: OptionalNumberDefault,
}).annotate({
  identifier: "NumberConfiguration",
  closedObject: true,
});
export type NumberConfiguration = typeof NumberConfiguration.Type;

export const DecimalConfiguration = Schema.Struct({
  precision: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 38 })),
  ),
  scale: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 18 })),
  ),
  minimum: Schema.optionalKey(ExactDecimalValue),
  maximum: Schema.optionalKey(ExactDecimalValue),
  default: Schema.optionalKey(ExactDecimalValue),
}).annotate({
  identifier: "DecimalConfiguration",
  closedObject: true,
});
export type DecimalConfiguration = typeof DecimalConfiguration.Type;

export class MoneyValue extends Schema.Class<MoneyValue>("MoneyValue")(
  Schema.Struct({
    amount: ExactDecimalValue,
    currency: Iso4217CurrencyCode,
  }).annotate({ closedObject: true }),
) {}

export const MoneyCurrencies = Schema.Array(Iso4217CurrencyCode).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(50),
  Schema.makeFilter((currencies) => new Set(currencies).size === currencies.length, {
    /** Describes duplicate money currency configuration. */
    message: "Money currencies must be unique.",
  }),
);
export type MoneyCurrencies = typeof MoneyCurrencies.Type;

export const MoneyConfiguration = Schema.Struct({
  currencies: MoneyCurrencies,
  allowNegative: Schema.optionalKey(Schema.Boolean),
  default: Schema.optionalKey(MoneyValue),
}).annotate({
  identifier: "MoneyConfiguration",
  closedObject: true,
});
export type MoneyConfiguration = typeof MoneyConfiguration.Type;

export const BooleanConfiguration = Schema.Struct({
  default: OptionalBooleanDefault,
}).annotate({
  identifier: "BooleanConfiguration",
  closedObject: true,
});
export type BooleanConfiguration = typeof BooleanConfiguration.Type;

export const DateConfiguration = Schema.Struct({
  minimum: Schema.optionalKey(DateValue),
  maximum: Schema.optionalKey(DateValue),
  default: Schema.optionalKey(DateValue),
}).annotate({
  identifier: "DateConfiguration",
  closedObject: true,
});
export type DateConfiguration = typeof DateConfiguration.Type;

export const DateTimeConfiguration = Schema.Struct({
  minimum: Schema.optionalKey(DateTimeValue),
  maximum: Schema.optionalKey(DateTimeValue),
  default: Schema.optionalKey(DateTimeValue),
}).annotate({
  identifier: "DateTimeConfiguration",
  closedObject: true,
});
export type DateTimeConfiguration = typeof DateTimeConfiguration.Type;

export const EnumOptionId = UuidValue.pipe(Schema.brand("EnumOptionId"));
export type EnumOptionId = typeof EnumOptionId.Type;

export const EnumOptionValue = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9_]{0,62}$/u),
).pipe(Schema.brand("EnumOptionValue"));
export type EnumOptionValue = typeof EnumOptionValue.Type;

export class EnumOption extends Schema.Class<EnumOption>("EnumOption")(
  Schema.Struct({
    id: EnumOptionId,
    value: EnumOptionValue,
    label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
  }).annotate({ closedObject: true }),
) {}

export const EnumConfiguration = Schema.Struct({
  options: Schema.Array(EnumOption).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  default: Schema.optionalKey(EnumOptionValue),
}).annotate({
  identifier: "EnumConfiguration",
  closedObject: true,
});
export type EnumConfiguration = typeof EnumConfiguration.Type;

export const UrlConfiguration = Schema.Struct({
  default: OptionalStringDefault(2_048),
}).annotate({
  identifier: "UrlConfiguration",
  closedObject: true,
});
export type UrlConfiguration = typeof UrlConfiguration.Type;

export const EmailConfiguration = Schema.Struct({
  default: OptionalStringDefault(254),
}).annotate({
  identifier: "EmailConfiguration",
  closedObject: true,
});
export type EmailConfiguration = typeof EmailConfiguration.Type;

export const SlugConfiguration = Schema.Struct({
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  pattern: OptionalSafePattern,
  default: OptionalStringDefault(200),
}).annotate({
  identifier: "SlugConfiguration",
  closedObject: true,
});
export type SlugConfiguration = typeof SlugConfiguration.Type;

export const JsonConfiguration = Schema.Struct({
  maxBytes: OptionalInteger,
  maxDepth: OptionalInteger,
  default: Schema.optionalKey(Schema.Unknown),
}).annotate({
  identifier: "JsonConfiguration",
  closedObject: true,
});
export type JsonConfiguration = typeof JsonConfiguration.Type;

export const ObjectConfiguration = Schema.Struct({
  default: Schema.optionalKey(Schema.Unknown),
}).annotate({
  identifier: "ObjectConfiguration",
  closedObject: true,
});
export type ObjectConfiguration = typeof ObjectConfiguration.Type;

export const ListConfiguration = Schema.Struct({
  minItems: OptionalInteger,
  maxItems: OptionalInteger,
  uniqueItems: Schema.optionalKey(Schema.Boolean),
  default: Schema.optionalKey(Schema.Unknown),
}).annotate({
  identifier: "ListConfiguration",
  closedObject: true,
});
export type ListConfiguration = typeof ListConfiguration.Type;

export const ReferenceConfiguration = Schema.Struct({
  targetCollectionId: Uuid,
}).annotate({
  identifier: "ReferenceConfiguration",
  closedObject: true,
});
export type ReferenceConfiguration = typeof ReferenceConfiguration.Type;

export const ExternalAssetKind = Schema.Literals([
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "other",
]);
export type ExternalAssetKind = typeof ExternalAssetKind.Type;

export class ExternalAssetValue extends Schema.Class<ExternalAssetValue>("ExternalAssetValue")(
  Schema.Struct({
    source: Schema.Literal("external"),
    url: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
    kind: ExternalAssetKind,
    title: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    alt: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
    width: Schema.NullOr(
      Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100_000 })),
    ),
    height: Schema.NullOr(
      Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100_000 })),
    ),
  }).annotate({ closedObject: true }),
) {}

export const ExternalAssetConfiguration = Schema.Struct({
  default: Schema.optionalKey(ExternalAssetValue),
}).annotate({
  identifier: "ExternalAssetConfiguration",
  closedObject: true,
});
export type ExternalAssetConfiguration = typeof ExternalAssetConfiguration.Type;

export const PortableTextKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
).pipe(Schema.brand("PortableTextKey"));
export type PortableTextKey = typeof PortableTextKey.Type;

export const PortableTextDecorator = Schema.Literals([
  "strong",
  "em",
  "underline",
  "strike-through",
  "code",
]);
export type PortableTextDecorator = typeof PortableTextDecorator.Type;

export class PortableTextLinkMark extends Schema.Class<PortableTextLinkMark>(
  "PortableTextLinkMark",
)(
  Schema.Struct({
    _key: PortableTextKey,
    _type: Schema.Literal("link"),
    href: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  }).annotate({ closedObject: true }),
) {}

export class PortableTextSpan extends Schema.Class<PortableTextSpan>("PortableTextSpan")(
  Schema.Struct({
    _key: PortableTextKey,
    _type: Schema.Literal("span"),
    text: Schema.String.check(Schema.isMaxLength(100_000)),
    marks: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))).check(
      Schema.isMaxLength(32),
    ),
  }).annotate({ closedObject: true }),
) {}

export class PortableTextBlock extends Schema.Class<PortableTextBlock>("PortableTextBlock")(
  Schema.Struct({
    _key: PortableTextKey,
    _type: Schema.Literal("block"),
    style: Schema.Literals(["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"]),
    listItem: Schema.optionalKey(Schema.Literals(["bullet", "number"])),
    level: Schema.optionalKey(
      Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 3 })),
    ),
    children: Schema.Array(PortableTextSpan).check(Schema.isMaxLength(5_000)),
    markDefs: Schema.Array(PortableTextLinkMark).check(Schema.isMaxLength(1_000)),
  }).annotate({ closedObject: true }),
) {}

export class PortableTextDocument extends Schema.Class<PortableTextDocument>(
  "PortableTextDocument",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    profile: Schema.Literal("ffd-portable-text"),
    blocks: Schema.Array(PortableTextBlock).check(Schema.isMaxLength(500)),
  }).annotate({ closedObject: true }),
) {}

export const RichTextConfiguration = Schema.Struct({
  styles: Schema.optionalKey(
    Schema.Array(Schema.Literals(["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"])),
  ),
  decorators: Schema.optionalKey(Schema.Array(PortableTextDecorator)),
  links: Schema.optionalKey(Schema.Boolean),
  lists: Schema.optionalKey(Schema.Array(Schema.Literals(["bullet", "number"]))),
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  default: Schema.optionalKey(PortableTextDocument),
}).annotate({
  identifier: "RichTextConfiguration",
  closedObject: true,
});
export type RichTextConfiguration = typeof RichTextConfiguration.Type;

export const fieldConfigurationSchemas = {
  short_text: ShortTextConfiguration,
  long_text: LongTextConfiguration,
  rich_text: RichTextConfiguration,
  number: NumberConfiguration,
  decimal: DecimalConfiguration,
  money: MoneyConfiguration,
  boolean: BooleanConfiguration,
  date: DateConfiguration,
  date_time: DateTimeConfiguration,
  enum: EnumConfiguration,
  url: UrlConfiguration,
  email: EmailConfiguration,
  slug: SlugConfiguration,
  json: JsonConfiguration,
  object: ObjectConfiguration,
  list: ListConfiguration,
  reference: ReferenceConfiguration,
  external_asset: ExternalAssetConfiguration,
} as const;

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

export type FieldConfiguration = FieldConfigurationByKind[CollectionFieldKind];

export class FieldValidationIssue extends Schema.Class<FieldValidationIssue>(
  "FieldValidationIssue",
)({
  path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
}) {}

export const FieldValidationIssues = Schema.Array(FieldValidationIssue).check(
  Schema.isMaxLength(fieldSystemLimits.issues),
);
export type FieldValidationIssues = typeof FieldValidationIssues.Type;

export {
  fieldSystemLimits,
  fieldSystemValidationProfile,
  iso4217MinorUnits,
  iso4217RegistryProfile,
};
