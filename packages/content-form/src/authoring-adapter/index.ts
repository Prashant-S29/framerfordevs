// Projects a recursively decoded Authoring DTO into the renderer's minimal inert authority.

import {
  adaptContentFormDefinition,
  type ContentEditorLayout,
  type ContentFieldKind,
  type ContentFormDefinition,
  type ContentFormField,
} from "../model";

interface JsonObject {
  readonly [key: string]: JsonValue;
}
type JsonValue = null | boolean | number | string | ReadonlyArray<JsonValue> | JsonObject;

export interface AuthoringContentFormFieldSource {
  readonly id: string;
  readonly parentFieldId: string | null;
  readonly nodeRole: "root" | "object_property" | "list_item";
  readonly apiKey: string | null;
  readonly displayLabel: string | null;
  readonly kind: ContentFieldKind;
  readonly required: boolean | null;
  readonly localization: "localized" | "shared" | "mixed" | null;
  readonly position: number;
  readonly editor: {
    readonly helpText: string | null;
    readonly placeholder: string | null;
  };
  readonly configuration: JsonObject;
  readonly children: ReadonlyArray<AuthoringContentFormFieldSource>;
}

export interface AuthoringContentFormSource {
  readonly canEdit: boolean;
  readonly fields: ReadonlyArray<AuthoringContentFormFieldSource>;
  readonly editableFieldIds: ReadonlyArray<string>;
  readonly editorLayout: ContentEditorLayout;
  readonly currencyMinorUnits: Readonly<Record<string, number>>;
}

function record(value: JsonValue | undefined): JsonObject | null {
  return typeof value === "object" && value !== null && !(value instanceof Array) ? value : null;
}

function moneyConfiguration(configuration: JsonObject) {
  const currencies = Array.isArray(configuration.currencies)
    ? configuration.currencies.filter((value): value is string => typeof value === "string")
    : [];
  const configuredDefault = record(configuration.default);
  const defaultValue =
    configuredDefault &&
    typeof configuredDefault.amount === "string" &&
    typeof configuredDefault.currency === "string"
      ? { amount: configuredDefault.amount, currency: configuredDefault.currency }
      : undefined;
  return {
    currencies,
    ...(typeof configuration.allowNegative === "boolean"
      ? { allowNegative: configuration.allowNegative }
      : {}),
    ...(defaultValue ? { default: defaultValue } : {}),
  };
}

function enumConfiguration(configuration: JsonObject) {
  const options = Array.isArray(configuration.options)
    ? configuration.options.flatMap((value) => {
        const option = record(value);
        return option &&
          typeof option.id === "string" &&
          typeof option.value === "string" &&
          typeof option.label === "string" &&
          typeof option.position === "number"
          ? [
              {
                id: option.id,
                value: option.value,
                label: option.label,
                position: option.position,
              },
            ]
          : [];
      })
    : [];
  return {
    options,
    ...(typeof configuration.default === "string" ? { default: configuration.default } : {}),
  };
}

function adaptAuthoringField(field: AuthoringContentFormFieldSource): ContentFormField {
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
    children: field.children.map(adaptAuthoringField),
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
      return { ...base, kind: field.kind, configuration: moneyConfiguration(field.configuration) };
    case "boolean":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "date":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "date_time":
      return { ...base, kind: field.kind, configuration: field.configuration };
    case "enum":
      return { ...base, kind: field.kind, configuration: enumConfiguration(field.configuration) };
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
      return {
        ...base,
        kind: field.kind,
        configuration: {
          targetCollectionId:
            typeof field.configuration.targetCollectionId === "string"
              ? field.configuration.targetCollectionId
              : "",
        },
      };
    case "external_asset":
      return { ...base, kind: field.kind, configuration: field.configuration };
  }
}

/** Removes transport/revision/role metadata after strict Authoring v1 decoding. */
export function adaptAuthoringGeneratedForm(
  definition: AuthoringContentFormSource,
): ContentFormDefinition {
  return adaptContentFormDefinition({
    canEdit: definition.canEdit,
    fields: definition.fields.map(adaptAuthoringField),
    editableFieldIds: definition.editableFieldIds,
    editorLayout: definition.editorLayout,
    currencyMinorUnits: definition.currencyMinorUnits,
  });
}
