// Defines the exact browser-safe role-projected Authoring generated-form response DTO.

import { Schema } from "effect";

const Uuid = Schema.String.pipe(
  Schema.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
);
const Digest = Schema.String.pipe(Schema.length(64), Schema.pattern(/^[0-9a-f]{64}$/u));
const ApiKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.pattern(/^[a-z][a-z0-9_]{0,62}$/u),
);
const ProjectRole = Schema.Literal(
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
);
const Roles = Schema.Array(ProjectRole).pipe(
  Schema.maxItems(7),
  Schema.filter((values) => new Set(values).size === values.length),
);
const VisibleRoles = Roles.pipe(Schema.minItems(1));
const optionalInteger = Schema.optionalWith(Schema.Number.pipe(Schema.int()), { exact: true });
const optionalNumber = Schema.optionalWith(Schema.Number.pipe(Schema.finite()), { exact: true });
const optionalBoolean = Schema.optionalWith(Schema.Boolean, { exact: true });
const optionalString = (maximum: number) =>
  Schema.optionalWith(Schema.String.pipe(Schema.maxLength(maximum)), { exact: true });
interface JsonObject {
  readonly [key: string]: JsonValue;
}
type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | JsonObject;
const JsonValue: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.Boolean,
    Schema.Number.pipe(Schema.finite()),
    Schema.String,
    Schema.Array(JsonValue),
    Schema.Record({ key: Schema.String, value: JsonValue }),
  ),
);

const PortableTextKey = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(64),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
);
const PortableTextSpan = Schema.Struct({
  _key: PortableTextKey,
  _type: Schema.Literal("span"),
  text: Schema.String.pipe(Schema.maxLength(100_000)),
  marks: Schema.Array(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(64))).pipe(
    Schema.maxItems(32),
  ),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const PortableTextLink = Schema.Struct({
  _key: PortableTextKey,
  _type: Schema.Literal("link"),
  href: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const PortableTextBlock = Schema.Struct({
  _key: PortableTextKey,
  _type: Schema.Literal("block"),
  style: Schema.Literal("normal", "h2", "h3", "h4", "h5", "h6", "blockquote"),
  listItem: Schema.optionalWith(Schema.Literal("bullet", "number"), { exact: true }),
  level: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 3)), {
    exact: true,
  }),
  children: Schema.Array(PortableTextSpan).pipe(Schema.maxItems(5_000)),
  markDefs: Schema.Array(PortableTextLink).pipe(Schema.maxItems(1_000)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const PortableTextDocument = Schema.Struct({
  version: Schema.Literal(1),
  profile: Schema.Literal("ffd-portable-text"),
  blocks: Schema.Array(PortableTextBlock).pipe(Schema.maxItems(500)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });

const TextConfiguration = (maximum: number) =>
  Schema.Struct({
    minLength: optionalInteger,
    maxLength: optionalInteger,
    pattern: optionalString(256),
    default: optionalString(maximum),
  }).annotations({ parseOptions: { onExcessProperty: "error" } });
const RichTextConfiguration = Schema.Struct({
  styles: Schema.optionalWith(
    Schema.Array(Schema.Literal("normal", "h2", "h3", "h4", "h5", "h6", "blockquote")),
    { exact: true },
  ),
  decorators: Schema.optionalWith(
    Schema.Array(Schema.Literal("strong", "em", "underline", "strike-through", "code")),
    { exact: true },
  ),
  links: optionalBoolean,
  lists: Schema.optionalWith(Schema.Array(Schema.Literal("bullet", "number")), { exact: true }),
  minLength: optionalInteger,
  maxLength: optionalInteger,
  default: Schema.optionalWith(PortableTextDocument, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const NumberConfiguration = Schema.Struct({
  mode: Schema.optionalWith(Schema.Literal("integer", "floating_point"), { exact: true }),
  minimum: optionalNumber,
  maximum: optionalNumber,
  default: optionalNumber,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const Decimal = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(58),
  Schema.pattern(/^(?:0|-[1-9][0-9]*|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u),
);
const DecimalConfiguration = Schema.Struct({
  precision: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(1, 38)), {
    exact: true,
  }),
  scale: Schema.optionalWith(Schema.Number.pipe(Schema.int(), Schema.between(0, 18)), {
    exact: true,
  }),
  minimum: Schema.optionalWith(Decimal, { exact: true }),
  maximum: Schema.optionalWith(Decimal, { exact: true }),
  default: Schema.optionalWith(Decimal, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const Currency = Schema.String.pipe(Schema.length(3), Schema.pattern(/^[A-Z]{3}$/u));
const MoneyValue = Schema.Struct({ amount: Decimal, currency: Currency }).annotations({
  parseOptions: { onExcessProperty: "error" },
});
const MoneyConfiguration = Schema.Struct({
  currencies: Schema.Array(Currency).pipe(
    Schema.minItems(1),
    Schema.maxItems(50),
    Schema.filter((values) => new Set(values).size === values.length),
  ),
  allowNegative: optionalBoolean,
  default: Schema.optionalWith(MoneyValue, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const BooleanConfiguration = Schema.Struct({ default: optionalBoolean }).annotations({
  parseOptions: { onExcessProperty: "error" },
});
const DateValue = Schema.String.pipe(
  Schema.length(10),
  Schema.pattern(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u),
);
const DateConfiguration = Schema.Struct({
  minimum: Schema.optionalWith(DateValue, { exact: true }),
  maximum: Schema.optionalWith(DateValue, { exact: true }),
  default: Schema.optionalWith(DateValue, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const DateTimeValue = Schema.String.pipe(Schema.minLength(20), Schema.maxLength(35));
const DateTimeConfiguration = Schema.Struct({
  minimum: Schema.optionalWith(DateTimeValue, { exact: true }),
  maximum: Schema.optionalWith(DateTimeValue, { exact: true }),
  default: Schema.optionalWith(DateTimeValue, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const EnumOption = Schema.Struct({
  id: Uuid,
  value: ApiKey,
  label: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const EnumConfiguration = Schema.Struct({
  options: Schema.Array(EnumOption).pipe(Schema.minItems(1), Schema.maxItems(100)),
  default: Schema.optionalWith(ApiKey, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const JsonConfiguration = Schema.Struct({
  maxBytes: optionalInteger,
  maxDepth: optionalInteger,
  default: Schema.optionalWith(JsonValue, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const ObjectConfiguration = Schema.Struct({
  default: Schema.optionalWith(JsonValue, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const ListConfiguration = Schema.Struct({
  minItems: optionalInteger,
  maxItems: optionalInteger,
  uniqueItems: optionalBoolean,
  default: Schema.optionalWith(JsonValue, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const ReferenceConfiguration = Schema.Struct({ targetCollectionId: Uuid }).annotations({
  parseOptions: { onExcessProperty: "error" },
});
const ExternalAsset = Schema.Struct({
  source: Schema.Literal("external"),
  url: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(2_048)),
  kind: Schema.Literal("image", "video", "audio", "document", "archive", "other"),
  title: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
  alt: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
  width: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.between(1, 100_000))),
  height: Schema.NullOr(Schema.Number.pipe(Schema.int(), Schema.between(1, 100_000))),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const ExternalAssetConfiguration = Schema.Struct({
  default: Schema.optionalWith(ExternalAsset, { exact: true }),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
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
  url: Schema.Struct({ default: optionalString(2_048) }).annotations({
    parseOptions: { onExcessProperty: "error" },
  }),
  email: Schema.Struct({ default: optionalString(254) }).annotations({
    parseOptions: { onExcessProperty: "error" },
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
  helpText: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
  placeholder: Schema.NullOr(Schema.String.pipe(Schema.maxLength(200))),
  visibleToRoles: Roles,
  editableByRoles: Roles,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const Children: Schema.Schema<ReadonlyArray<AuthoringFormField>> = Schema.Array(
  Schema.suspend((): Schema.Schema<AuthoringFormField> => AuthoringFormField),
).pipe(Schema.maxItems(100));
function fieldVariant<Kind extends keyof typeof configurations>(kind: Kind) {
  return Schema.Struct({
    id: Uuid,
    parentFieldId: Schema.NullOr(Uuid),
    nodeRole: Schema.Literal("root", "object_property", "list_item"),
    apiKey: Schema.NullOr(ApiKey),
    displayLabel: Schema.NullOr(Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))),
    kind: Schema.Literal(kind),
    required: Schema.NullOr(Schema.Boolean),
    localization: Schema.NullOr(Schema.Literal("localized", "shared", "mixed")),
    deprecated: Schema.Boolean,
    position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
    editor: AuthoringFieldEditor,
    configuration: configurations[kind],
    children: Children,
  }).annotations({ parseOptions: { onExcessProperty: "error" } });
}
export const AuthoringFormField: Schema.Schema<AuthoringFormField> = Schema.Union(
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
);

const Placement = Schema.Struct({
  id: Uuid,
  fieldId: Uuid,
  position: Schema.Number.pipe(Schema.int(), Schema.between(0, 99)),
  helpTextOverride: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
  visibleToRoles: VisibleRoles,
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const Group = Schema.Struct({
  id: Uuid,
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
  position: Schema.Number.pipe(Schema.int(), Schema.between(0, 19)),
  columns: Schema.Literal(1, 2),
  visibleToRoles: VisibleRoles,
  fields: Schema.Array(Placement).pipe(Schema.maxItems(100)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
const Tab = Schema.Struct({
  id: Uuid,
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  description: Schema.NullOr(Schema.String.pipe(Schema.maxLength(500))),
  position: Schema.Number.pipe(Schema.int(), Schema.between(0, 9)),
  visibleToRoles: VisibleRoles,
  groups: Schema.Array(Group).pipe(Schema.minItems(1), Schema.maxItems(20)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });
export const AuthoringEditorLayout = Schema.Struct({
  version: Schema.Literal(1),
  tabs: Schema.Array(Tab).pipe(Schema.minItems(1), Schema.maxItems(10)),
  sidebarGroups: Schema.Array(Group).pipe(Schema.maxItems(10)),
}).annotations({ parseOptions: { onExcessProperty: "error" } });

export class AuthoringGeneratedForm extends Schema.Class<AuthoringGeneratedForm>(
  "SdkAuthoringGeneratedForm",
)({
  source: Schema.Literal("published"),
  collectionId: Uuid,
  revisionId: Uuid,
  formatVersion: Schema.Literal(1, 2),
  validationProfile: Schema.String.pipe(
    Schema.minLength(1),
    Schema.maxLength(64),
    Schema.pattern(/^[a-z0-9][a-z0-9@._-]{0,63}$/u),
  ),
  currencyRegistryProfile: Schema.NullOr(
    Schema.String.pipe(Schema.pattern(/^iso-4217@[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)),
  ),
  contractHash: Digest,
  role: ProjectRole,
  canEdit: Schema.Boolean,
  fields: Schema.Array(AuthoringFormField).pipe(Schema.maxItems(100)),
  editableFieldIds: Schema.Array(Uuid).pipe(
    Schema.maxItems(100),
    Schema.filter((values) => new Set(values).size === values.length),
  ),
  editorLayout: AuthoringEditorLayout,
  currencyMinorUnits: Schema.Record({
    key: Currency,
    value: Schema.Number.pipe(Schema.int(), Schema.between(0, 4)),
  }),
}) {}
