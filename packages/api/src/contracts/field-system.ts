// Defines the schema-backed M6 field vocabulary, structured values, editor metadata, and limits.

import { Schema } from "effect";

import { ProjectRole } from "./access";
import { fieldSystemLimits, fieldSystemValidationProfile } from "../lib/field-system-profile";
import { iso4217MinorUnits, iso4217RegistryProfile } from "../registry/iso-4217.generated";

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

export const CollectionFieldKind = Schema.Literal(...collectionFieldKindValues);
export type CollectionFieldKind = typeof CollectionFieldKind.Type;

export const fieldNodeRoleValues = ["root", "object_property", "list_item"] as const;
export const FieldNodeRole = Schema.Literal(...fieldNodeRoleValues);
export type FieldNodeRole = typeof FieldNodeRole.Type;

export const fieldLocalizationValues = ["localized", "shared", "mixed"] as const;
export const FieldLocalization = Schema.Literal(...fieldLocalizationValues);
export type FieldLocalization = typeof FieldLocalization.Type;

/** Builds an exact optional bounded string property for field defaults. */
const OptionalStringDefault = (maximum: number) =>
  Schema.optionalWith(Schema.String.pipe(Schema.maxLength(maximum)), { exact: true });
const OptionalNumberDefault = Schema.optionalWith(Schema.Number, { exact: true });
const OptionalBooleanDefault = Schema.optionalWith(Schema.Boolean, { exact: true });
const OptionalInteger = Schema.optionalWith(Schema.Number.pipe(Schema.int()), { exact: true });

const SafePattern = Schema.String.pipe(Schema.maxLength(256));
const OptionalSafePattern = Schema.optionalWith(SafePattern, { exact: true });
const DateValue = Schema.String.pipe(
  Schema.length(10),
  Schema.pattern(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u),
);
const DateTimeValue = Schema.String.pipe(Schema.minLength(20), Schema.maxLength(35));
const ExactDecimalValue = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(58),
  Schema.pattern(/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u),
  Schema.brand("ExactDecimalValue"),
);
export type ExactDecimalValue = typeof ExactDecimalValue.Type;

const Iso4217CurrencyCode = Schema.String.pipe(
  Schema.length(3),
  Schema.filter(
    /** Restricts money values to the pinned generated registry. */
    (value) => Object.hasOwn(iso4217MinorUnits, value),
    {
      /** Describes an unsupported or retired currency without leaking input. */
      message: () => "Use a supported active ISO 4217 currency code.",
    },
  ),
  Schema.brand("Iso4217CurrencyCode"),
);
export type Iso4217CurrencyCode = typeof Iso4217CurrencyCode.Type;

const UniqueProjectRoles = Schema.Array(ProjectRole).pipe(
  Schema.maxItems(7),
  Schema.filter(
    /** Prevents ambiguous duplicate role metadata. */
    (roles) => new Set(roles).size === roles.length,
    {
      /** Describes duplicate role metadata. */
      message: () => "Project roles must be unique.",
    },
  ),
);

export class FieldEditorMetadata extends Schema.Class<FieldEditorMetadata>("FieldEditorMetadata")(
  Schema.Struct({
    helpText: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    placeholder: Schema.NullOr(Schema.String.pipe(Schema.maxLength(200))),
    visibleToRoles: UniqueProjectRoles,
    editableByRoles: UniqueProjectRoles,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const EditorLayoutNodeId = Schema.UUID.pipe(Schema.brand("EditorLayoutNodeId"));
export type EditorLayoutNodeId = typeof EditorLayoutNodeId.Type;

const LayoutTitle = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100));
const LayoutDescription = Schema.NullOr(Schema.String.pipe(Schema.maxLength(500)));
const VisibleProjectRoles = UniqueProjectRoles.pipe(Schema.minItems(1));

export class EditorFieldPlacement extends Schema.Class<EditorFieldPlacement>(
  "EditorFieldPlacement",
)(
  Schema.Struct({
    id: EditorLayoutNodeId,
    fieldId: Schema.UUID,
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
    helpTextOverride: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    visibleToRoles: VisibleProjectRoles,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class EditorLayoutGroup extends Schema.Class<EditorLayoutGroup>("EditorLayoutGroup")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: LayoutTitle,
    description: LayoutDescription,
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 19)),
    columns: Schema.Literal(1, 2),
    visibleToRoles: VisibleProjectRoles,
    fields: Schema.Array(EditorFieldPlacement).pipe(Schema.maxItems(100)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class EditorLayoutTab extends Schema.Class<EditorLayoutTab>("EditorLayoutTab")(
  Schema.Struct({
    id: EditorLayoutNodeId,
    title: LayoutTitle,
    description: LayoutDescription,
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 9)),
    visibleToRoles: VisibleProjectRoles,
    groups: Schema.Array(EditorLayoutGroup).pipe(Schema.minItems(1), Schema.maxItems(20)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class EditorLayout extends Schema.Class<EditorLayout>("EditorLayout")(
  Schema.Struct({
    version: Schema.Literal(1),
    tabs: Schema.Array(EditorLayoutTab).pipe(Schema.minItems(1), Schema.maxItems(10)),
    sidebarGroups: Schema.Array(EditorLayoutGroup).pipe(Schema.maxItems(10)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const ShortTextConfiguration = Schema.Struct({
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  pattern: OptionalSafePattern,
  default: OptionalStringDefault(500),
}).annotations({
  identifier: "ShortTextConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type ShortTextConfiguration = typeof ShortTextConfiguration.Type;

export const LongTextConfiguration = Schema.Struct({
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  pattern: OptionalSafePattern,
  default: OptionalStringDefault(50_000),
}).annotations({
  identifier: "LongTextConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type LongTextConfiguration = typeof LongTextConfiguration.Type;

export const NumberConfiguration = Schema.Struct({
  mode: Schema.optionalWith(Schema.Literal("integer", "floating_point"), { exact: true }),
  minimum: OptionalNumberDefault,
  maximum: OptionalNumberDefault,
  default: OptionalNumberDefault,
}).annotations({
  identifier: "NumberConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type NumberConfiguration = typeof NumberConfiguration.Type;

export const DecimalConfiguration = Schema.Struct({
  precision: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 38)), {
    exact: true,
  }),
  scale: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(0, 18)), {
    exact: true,
  }),
  minimum: Schema.optionalWith(ExactDecimalValue, { exact: true }),
  maximum: Schema.optionalWith(ExactDecimalValue, { exact: true }),
  default: Schema.optionalWith(ExactDecimalValue, { exact: true }),
}).annotations({
  identifier: "DecimalConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type DecimalConfiguration = typeof DecimalConfiguration.Type;

export class MoneyValue extends Schema.Class<MoneyValue>("MoneyValue")(
  Schema.Struct({
    amount: ExactDecimalValue,
    currency: Iso4217CurrencyCode,
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const MoneyCurrencies = Schema.Array(Iso4217CurrencyCode).pipe(
  Schema.minItems(1),
  Schema.maxItems(50),
  Schema.filter(
    /** Prevents duplicate currency options in generated money controls. */
    (currencies) => new Set(currencies).size === currencies.length,
    {
      /** Describes duplicate money currency configuration. */
      message: () => "Money currencies must be unique.",
    },
  ),
);
export type MoneyCurrencies = typeof MoneyCurrencies.Type;

export const MoneyConfiguration = Schema.Struct({
  currencies: MoneyCurrencies,
  allowNegative: Schema.optionalWith(Schema.Boolean, { exact: true }),
  default: Schema.optionalWith(MoneyValue, { exact: true }),
}).annotations({
  identifier: "MoneyConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type MoneyConfiguration = typeof MoneyConfiguration.Type;

export const BooleanConfiguration = Schema.Struct({
  default: OptionalBooleanDefault,
}).annotations({
  identifier: "BooleanConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type BooleanConfiguration = typeof BooleanConfiguration.Type;

export const DateConfiguration = Schema.Struct({
  minimum: Schema.optionalWith(DateValue, { exact: true }),
  maximum: Schema.optionalWith(DateValue, { exact: true }),
  default: Schema.optionalWith(DateValue, { exact: true }),
}).annotations({
  identifier: "DateConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type DateConfiguration = typeof DateConfiguration.Type;

export const DateTimeConfiguration = Schema.Struct({
  minimum: Schema.optionalWith(DateTimeValue, { exact: true }),
  maximum: Schema.optionalWith(DateTimeValue, { exact: true }),
  default: Schema.optionalWith(DateTimeValue, { exact: true }),
}).annotations({
  identifier: "DateTimeConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type DateTimeConfiguration = typeof DateTimeConfiguration.Type;

export const EnumOptionId = Schema.UUID.pipe(Schema.brand("EnumOptionId"));
export type EnumOptionId = typeof EnumOptionId.Type;

export const EnumOptionValue = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
  Schema.brand("EnumOptionValue"),
);
export type EnumOptionValue = typeof EnumOptionValue.Type;

export class EnumOption extends Schema.Class<EnumOption>("EnumOption")(
  Schema.Struct({
    id: EnumOptionId,
    value: EnumOptionValue,
    label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const EnumConfiguration = Schema.Struct({
  options: Schema.Array(EnumOption).pipe(Schema.minItems(1), Schema.maxItems(100)),
  default: Schema.optionalWith(EnumOptionValue, { exact: true }),
}).annotations({
  identifier: "EnumConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type EnumConfiguration = typeof EnumConfiguration.Type;

export const UrlConfiguration = Schema.Struct({
  default: OptionalStringDefault(2_048),
}).annotations({
  identifier: "UrlConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type UrlConfiguration = typeof UrlConfiguration.Type;

export const EmailConfiguration = Schema.Struct({
  default: OptionalStringDefault(254),
}).annotations({
  identifier: "EmailConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type EmailConfiguration = typeof EmailConfiguration.Type;

export const SlugConfiguration = Schema.Struct({
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  pattern: OptionalSafePattern,
  default: OptionalStringDefault(200),
}).annotations({
  identifier: "SlugConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type SlugConfiguration = typeof SlugConfiguration.Type;

export const JsonConfiguration = Schema.Struct({
  maxBytes: OptionalInteger,
  maxDepth: OptionalInteger,
  default: Schema.optionalWith(Schema.Unknown, { exact: true }),
}).annotations({
  identifier: "JsonConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type JsonConfiguration = typeof JsonConfiguration.Type;

export const ObjectConfiguration = Schema.Struct({
  default: Schema.optionalWith(Schema.Unknown, { exact: true }),
}).annotations({
  identifier: "ObjectConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type ObjectConfiguration = typeof ObjectConfiguration.Type;

export const ListConfiguration = Schema.Struct({
  minItems: OptionalInteger,
  maxItems: OptionalInteger,
  uniqueItems: Schema.optionalWith(Schema.Boolean, { exact: true }),
  default: Schema.optionalWith(Schema.Unknown, { exact: true }),
}).annotations({
  identifier: "ListConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type ListConfiguration = typeof ListConfiguration.Type;

export const ReferenceConfiguration = Schema.Struct({
  targetCollectionId: Schema.UUID,
}).annotations({
  identifier: "ReferenceConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type ReferenceConfiguration = typeof ReferenceConfiguration.Type;

export const ExternalAssetKind = Schema.Literal(
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "other",
);
export type ExternalAssetKind = typeof ExternalAssetKind.Type;

export class ExternalAssetValue extends Schema.Class<ExternalAssetValue>("ExternalAssetValue")(
  Schema.Struct({
    source: Schema.Literal("external"),
    url: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
    kind: ExternalAssetKind,
    title: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    alt: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
    width: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.between(1, 100_000))),
    height: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.between(1, 100_000))),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const ExternalAssetConfiguration = Schema.Struct({
  default: Schema.optionalWith(ExternalAssetValue, { exact: true }),
}).annotations({
  identifier: "ExternalAssetConfiguration",
  parseOptions: { onExcessProperty: "error" },
});
export type ExternalAssetConfiguration = typeof ExternalAssetConfiguration.Type;

export const PortableTextKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
  Schema.brand("PortableTextKey"),
);
export type PortableTextKey = typeof PortableTextKey.Type;

export const PortableTextDecorator = Schema.Literal(
  "strong",
  "em",
  "underline",
  "strike-through",
  "code",
);
export type PortableTextDecorator = typeof PortableTextDecorator.Type;

export class PortableTextLinkMark extends Schema.Class<PortableTextLinkMark>(
  "PortableTextLinkMark",
)(
  Schema.Struct({
    _key: PortableTextKey,
    _type: Schema.Literal("link"),
    href: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class PortableTextSpan extends Schema.Class<PortableTextSpan>("PortableTextSpan")(
  Schema.Struct({
    _key: PortableTextKey,
    _type: Schema.Literal("span"),
    text: Schema.String.pipe(Schema.maxLength(100_000)),
    marks: Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64))).pipe(
      Schema.maxItems(32),
    ),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class PortableTextBlock extends Schema.Class<PortableTextBlock>("PortableTextBlock")(
  Schema.Struct({
    _key: PortableTextKey,
    _type: Schema.Literal("block"),
    style: Schema.Literal("normal", "h2", "h3", "h4", "h5", "h6", "blockquote"),
    listItem: Schema.optionalWith(Schema.Literal("bullet", "number"), { exact: true }),
    level: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 3)), {
      exact: true,
    }),
    children: Schema.Array(PortableTextSpan).pipe(Schema.maxItems(5_000)),
    markDefs: Schema.Array(PortableTextLinkMark).pipe(Schema.maxItems(1_000)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export class PortableTextDocument extends Schema.Class<PortableTextDocument>(
  "PortableTextDocument",
)(
  Schema.Struct({
    version: Schema.Literal(1),
    profile: Schema.Literal("ffd-portable-text"),
    blocks: Schema.Array(PortableTextBlock).pipe(Schema.maxItems(500)),
  }).annotations({ parseOptions: { onExcessProperty: "error" } }),
) {}

export const RichTextConfiguration = Schema.Struct({
  styles: Schema.optionalWith(
    Schema.Array(Schema.Literal("normal", "h2", "h3", "h4", "h5", "h6", "blockquote")),
    { exact: true },
  ),
  decorators: Schema.optionalWith(Schema.Array(PortableTextDecorator), { exact: true }),
  links: Schema.optionalWith(Schema.Boolean, { exact: true }),
  lists: Schema.optionalWith(Schema.Array(Schema.Literal("bullet", "number")), { exact: true }),
  minLength: OptionalInteger,
  maxLength: OptionalInteger,
  default: Schema.optionalWith(PortableTextDocument, { exact: true }),
}).annotations({
  identifier: "RichTextConfiguration",
  parseOptions: { onExcessProperty: "error" },
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
  path: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(256)),
  code: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64)),
  message: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512)),
}) {}

export const FieldValidationIssues = Schema.Array(FieldValidationIssue).pipe(
  Schema.maxItems(fieldSystemLimits.issues),
);
export type FieldValidationIssues = typeof FieldValidationIssues.Type;

export {
  fieldSystemLimits,
  fieldSystemValidationProfile,
  iso4217MinorUnits,
  iso4217RegistryProfile,
};
