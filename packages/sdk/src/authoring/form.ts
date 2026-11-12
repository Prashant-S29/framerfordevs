// Defines the exact browser-safe role-projected Authoring generated-form response DTO.

import { Schema } from "effect";

const Uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const Digest = Schema.String.check(
  Schema.isBetweenLength(64, 64),
  Schema.isPattern(/^[0-9a-f]{64}$/u),
);
const ApiKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.isPattern(/^[a-z][a-z0-9_]{0,62}$/u),
);
const ProjectRole = Schema.Literals([
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
]);
const Roles = Schema.Array(ProjectRole).check(
  Schema.isMaxLength(7),
  Schema.makeFilter((values) => new Set(values).size === values.length),
);
const VisibleRoles = Roles.check(Schema.isMinLength(1));
const optionalInteger = Schema.optionalKey(Schema.Number.check(Schema.isInt()));
const optionalNumber = Schema.optionalKey(Schema.Number.check(Schema.isFinite()));
const optionalBoolean = Schema.optionalKey(Schema.Boolean);
const optionalString = (maximum: number) =>
  Schema.optionalKey(Schema.String.check(Schema.isMaxLength(maximum)));
interface JsonObject {
  readonly [key: string]: JsonValue;
}
type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | JsonObject;
const JsonValue: Schema.Codec<JsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.Number.check(Schema.isFinite()),
    Schema.String,
    Schema.Array(JsonValue),
    Schema.Record(Schema.String, JsonValue),
  ]),
);

const PortableTextKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
);
const PortableTextSpan = Schema.Struct({
  _key: PortableTextKey,
  _type: Schema.Literal("span"),
  text: Schema.String.check(Schema.isMaxLength(100_000)),
  marks: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))).check(
    Schema.isMaxLength(32),
  ),
}).annotate({ closedObject: true });
const PortableTextLink = Schema.Struct({
  _key: PortableTextKey,
  _type: Schema.Literal("link"),
  href: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
}).annotate({ closedObject: true });
const PortableTextBlock = Schema.Struct({
  _key: PortableTextKey,
  _type: Schema.Literal("block"),
  style: Schema.Literals(["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"]),
  listItem: Schema.optionalKey(Schema.Literals(["bullet", "number"])),
  level: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 3 })),
  ),
  children: Schema.Array(PortableTextSpan).check(Schema.isMaxLength(5_000)),
  markDefs: Schema.Array(PortableTextLink).check(Schema.isMaxLength(1_000)),
}).annotate({ closedObject: true });
const PortableTextDocument = Schema.Struct({
  version: Schema.Literal(1),
  profile: Schema.Literal("ffd-portable-text"),
  blocks: Schema.Array(PortableTextBlock).check(Schema.isMaxLength(500)),
}).annotate({ closedObject: true });

const TextConfiguration = (maximum: number) =>
  Schema.Struct({
    minLength: optionalInteger,
    maxLength: optionalInteger,
    pattern: optionalString(256),
    default: optionalString(maximum),
  }).annotate({ closedObject: true });
const RichTextConfiguration = Schema.Struct({
  styles: Schema.optionalKey(
    Schema.Array(Schema.Literals(["normal", "h2", "h3", "h4", "h5", "h6", "blockquote"])),
  ),
  decorators: Schema.optionalKey(
    Schema.Array(Schema.Literals(["strong", "em", "underline", "strike-through", "code"])),
  ),
  links: optionalBoolean,
  lists: Schema.optionalKey(Schema.Array(Schema.Literals(["bullet", "number"]))),
  minLength: optionalInteger,
  maxLength: optionalInteger,
  default: Schema.optionalKey(PortableTextDocument),
}).annotate({ closedObject: true });
const NumberConfiguration = Schema.Struct({
  mode: Schema.optionalKey(Schema.Literals(["integer", "floating_point"])),
  minimum: optionalNumber,
  maximum: optionalNumber,
  default: optionalNumber,
}).annotate({ closedObject: true });
const Decimal = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(58),
  Schema.isPattern(/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u),
);
const DecimalConfiguration = Schema.Struct({
  precision: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 38 })),
  ),
  scale: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 18 })),
  ),
  minimum: Schema.optionalKey(Decimal),
  maximum: Schema.optionalKey(Decimal),
  default: Schema.optionalKey(Decimal),
}).annotate({ closedObject: true });
const Currency = Schema.String.check(Schema.isBetweenLength(3, 3), Schema.isPattern(/^[A-Z]{3}$/u));
const MoneyValue = Schema.Struct({ amount: Decimal, currency: Currency }).annotate({
  closedObject: true,
});
const MoneyConfiguration = Schema.Struct({
  currencies: Schema.Array(Currency).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(50),
    Schema.makeFilter((values) => new Set(values).size === values.length),
  ),
  allowNegative: optionalBoolean,
  default: Schema.optionalKey(MoneyValue),
}).annotate({ closedObject: true });
const BooleanConfiguration = Schema.Struct({ default: optionalBoolean }).annotate({
  closedObject: true,
});
const DateValue = Schema.String.check(
  Schema.isBetweenLength(10, 10),
  Schema.isPattern(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u),
);
const DateConfiguration = Schema.Struct({
  minimum: Schema.optionalKey(DateValue),
  maximum: Schema.optionalKey(DateValue),
  default: Schema.optionalKey(DateValue),
}).annotate({ closedObject: true });
const DateTimeValue = Schema.String.check(Schema.isMinLength(20), Schema.isMaxLength(35));
const DateTimeConfiguration = Schema.Struct({
  minimum: Schema.optionalKey(DateTimeValue),
  maximum: Schema.optionalKey(DateTimeValue),
  default: Schema.optionalKey(DateTimeValue),
}).annotate({ closedObject: true });
const EnumOption = Schema.Struct({
  id: Uuid,
  value: ApiKey,
  label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
}).annotate({ closedObject: true });
const EnumConfiguration = Schema.Struct({
  options: Schema.Array(EnumOption).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  default: Schema.optionalKey(ApiKey),
}).annotate({ closedObject: true });
const JsonConfiguration = Schema.Struct({
  maxBytes: optionalInteger,
  maxDepth: optionalInteger,
  default: Schema.optionalKey(JsonValue),
}).annotate({ closedObject: true });
const ObjectConfiguration = Schema.Struct({
  default: Schema.optionalKey(JsonValue),
}).annotate({ closedObject: true });
const ListConfiguration = Schema.Struct({
  minItems: optionalInteger,
  maxItems: optionalInteger,
  uniqueItems: optionalBoolean,
  default: Schema.optionalKey(JsonValue),
}).annotate({ closedObject: true });
const ReferenceConfiguration = Schema.Struct({ targetCollectionId: Uuid }).annotate({
  closedObject: true,
});
const ExternalAsset = Schema.Struct({
  source: Schema.Literal("external"),
  url: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  kind: Schema.Literals(["image", "video", "audio", "document", "archive", "other"]),
  title: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  alt: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  width: Schema.NullOr(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100_000 })),
  ),
  height: Schema.NullOr(
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100_000 })),
  ),
}).annotate({ closedObject: true });
const ExternalAssetConfiguration = Schema.Struct({
  default: Schema.optionalKey(ExternalAsset),
}).annotate({ closedObject: true });
const configurations = {
  short_text: TextConfiguration(500),
  long_text: TextConfiguration(50_000),
  rich_text: RichTextConfiguration,
  number: NumberConfiguration,
  decimal: DecimalConfiguration,
  money: MoneyConfiguration,
  boolean: BooleanConfiguration,
  date: DateConfiguration,
  date_time: DateTimeConfiguration,
  enum: EnumConfiguration,
  url: Schema.Struct({ default: optionalString(2_048) }).annotate({
    closedObject: true,
  }),
  email: Schema.Struct({ default: optionalString(254) }).annotate({
    closedObject: true,
  }),
  slug: TextConfiguration(200),
  json: JsonConfiguration,
  object: ObjectConfiguration,
  list: ListConfiguration,
  reference: ReferenceConfiguration,
  external_asset: ExternalAssetConfiguration,
} as const;

interface AuthoringFormFieldBase {
  readonly id: string;
  readonly parentFieldId: string | null;
  readonly nodeRole: "root" | "object_property" | "list_item";
  readonly apiKey: string | null;
  readonly displayLabel: string | null;
  readonly required: boolean | null;
  readonly localization: "localized" | "shared" | "mixed" | null;
  readonly deprecated: boolean;
  readonly position: number;
  readonly editor: typeof AuthoringFieldEditor.Type;
  readonly children: ReadonlyArray<AuthoringFormField>;
}

export type AuthoringFormField = {
  readonly [Kind in keyof typeof configurations]: AuthoringFormFieldBase & {
    readonly kind: Kind;
    readonly configuration: (typeof configurations)[Kind]["Type"];
  };
}[keyof typeof configurations];

export const AuthoringFieldEditor = Schema.Struct({
  helpText: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  placeholder: Schema.NullOr(Schema.String.check(Schema.isMaxLength(200))),
  visibleToRoles: Roles,
  editableByRoles: Roles,
}).annotate({ closedObject: true });
const Children: Schema.Codec<ReadonlyArray<AuthoringFormField>> = Schema.Array(
  Schema.suspend((): Schema.Codec<AuthoringFormField> => AuthoringFormField),
).check(Schema.isMaxLength(100));
function fieldVariant<Kind extends keyof typeof configurations>(kind: Kind) {
  return Schema.Struct({
    id: Uuid,
    parentFieldId: Schema.NullOr(Uuid),
    nodeRole: Schema.Literals(["root", "object_property", "list_item"]),
    apiKey: Schema.NullOr(ApiKey),
    displayLabel: Schema.NullOr(
      Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    ),
    kind: Schema.Literal(kind),
    required: Schema.NullOr(Schema.Boolean),
    localization: Schema.NullOr(Schema.Literals(["localized", "shared", "mixed"])),
    deprecated: Schema.Boolean,
    position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
    editor: AuthoringFieldEditor,
    configuration: configurations[kind],
    children: Children,
  }).annotate({ closedObject: true });
}
export const AuthoringFormField: Schema.Codec<AuthoringFormField> = Schema.Union([
  fieldVariant("short_text"),
  fieldVariant("long_text"),
  fieldVariant("rich_text"),
  fieldVariant("number"),
  fieldVariant("decimal"),
  fieldVariant("money"),
  fieldVariant("boolean"),
  fieldVariant("date"),
  fieldVariant("date_time"),
  fieldVariant("enum"),
  fieldVariant("url"),
  fieldVariant("email"),
  fieldVariant("slug"),
  fieldVariant("json"),
  fieldVariant("object"),
  fieldVariant("list"),
  fieldVariant("reference"),
  fieldVariant("external_asset"),
]);

const Placement = Schema.Struct({
  id: Uuid,
  fieldId: Uuid,
  position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 99 })),
  helpTextOverride: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  visibleToRoles: VisibleRoles,
}).annotate({ closedObject: true });
const Group = Schema.Struct({
  id: Uuid,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 19 })),
  columns: Schema.Literals([1, 2]),
  visibleToRoles: VisibleRoles,
  fields: Schema.Array(Placement).check(Schema.isMaxLength(100)),
}).annotate({ closedObject: true });
const Tab = Schema.Struct({
  id: Uuid,
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  description: Schema.NullOr(Schema.String.check(Schema.isMaxLength(500))),
  position: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 9 })),
  visibleToRoles: VisibleRoles,
  groups: Schema.Array(Group).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
}).annotate({ closedObject: true });
export const AuthoringEditorLayout = Schema.Struct({
  version: Schema.Literal(1),
  tabs: Schema.Array(Tab).check(Schema.isMinLength(1), Schema.isMaxLength(10)),
  sidebarGroups: Schema.Array(Group).check(Schema.isMaxLength(10)),
}).annotate({ closedObject: true });

export class AuthoringGeneratedForm extends Schema.Class<AuthoringGeneratedForm>(
  "SdkAuthoringGeneratedForm",
)({
  source: Schema.Literal("published"),
  collectionId: Uuid,
  revisionId: Uuid,
  formatVersion: Schema.Literals([1, 2]),
  validationProfile: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(64),
    Schema.isPattern(/^[a-z0-9][a-z0-9@._-]{0,63}$/u),
  ),
  currencyRegistryProfile: Schema.NullOr(
    Schema.String.check(Schema.isPattern(/^iso-4217@[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)),
  ),
  contractHash: Digest,
  role: ProjectRole,
  canEdit: Schema.Boolean,
  fields: Schema.Array(AuthoringFormField).check(Schema.isMaxLength(100)),
  editableFieldIds: Schema.Array(Uuid).check(
    Schema.isMaxLength(100),
    Schema.makeFilter((values) => new Set(values).size === values.length),
  ),
  editorLayout: AuthoringEditorLayout,
  currencyMinorUnits: Schema.Record(
    Currency,
    Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 4 })),
  ),
}) {}
