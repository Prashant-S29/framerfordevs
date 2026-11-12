// Adapts strictly decoded Studio field-ID projections into the transport-free content renderer.

import {
  adaptContentFormDefinition,
  type ContentFormDefinition,
  type ContentFormField,
  type ContentFieldKind,
  type PortableTextDocument,
} from "@framerfordevs/content-form";

import type {
  StudioFormDto,
  StudioFormFieldDto,
  StudioJsonObject,
} from "../../../contracts/content";

function value(configuration: StudioJsonObject, key: string): unknown {
  return Reflect.get(configuration, key);
}

function optionalNumber(configuration: StudioJsonObject, key: string): number | undefined {
  const candidate = value(configuration, key);
  return typeof candidate === "number" ? candidate : undefined;
}

function optionalString(configuration: StudioJsonObject, key: string): string | undefined {
  const candidate = value(configuration, key);
  return typeof candidate === "string" ? candidate : undefined;
}

function optionalBoolean(configuration: StudioJsonObject, key: string): boolean | undefined {
  const candidate = value(configuration, key);
  return typeof candidate === "boolean" ? candidate : undefined;
}

function strings(configuration: StudioJsonObject, key: string): ReadonlyArray<string> | undefined {
  const candidate = value(configuration, key);
  if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== "string")) {
    return undefined;
  }
  return candidate.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function optionalDefault(configuration: StudioJsonObject): Readonly<Record<string, unknown>> {
  const configured = value(configuration, "default");
  return configured === undefined ? {} : { default: configured };
}

function portableTextStyle(item: string) {
  switch (item) {
    case "normal":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
    case "blockquote":
      return item;
    default:
      return undefined;
  }
}

function portableTextDecorator(item: string) {
  switch (item) {
    case "strong":
    case "em":
    case "underline":
    case "strike-through":
    case "code":
      return item;
    default:
      return undefined;
  }
}

function portableTextList(item: string): "bullet" | "number" | undefined {
  return item === "bullet" || item === "number" ? item : undefined;
}

function externalAssetKind(
  item: unknown,
): "image" | "video" | "audio" | "document" | "archive" | "other" | undefined {
  switch (item) {
    case "image":
    case "video":
    case "audio":
    case "document":
    case "archive":
    case "other":
      return item;
    default:
      return undefined;
  }
}

function record(input: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? Object.fromEntries(Object.entries(input))
    : undefined;
}

function portableTextDocument(input: unknown): PortableTextDocument | undefined {
  const document = record(input);
  const blocks = document === undefined ? undefined : Reflect.get(document, "blocks");
  if (
    document === undefined ||
    Reflect.get(document, "version") !== 1 ||
    Reflect.get(document, "profile") !== "ffd-portable-text" ||
    !Array.isArray(blocks)
  ) {
    return undefined;
  }
  const decodedBlocks = blocks.flatMap((blockInput) => {
    const block = record(blockInput);
    if (block === undefined || Reflect.get(block, "_type") !== "block") return [];
    const key = Reflect.get(block, "_key");
    const styleInput = Reflect.get(block, "style");
    const style = typeof styleInput === "string" ? portableTextStyle(styleInput) : undefined;
    const children = Reflect.get(block, "children");
    const markDefs = Reflect.get(block, "markDefs");
    if (
      typeof key !== "string" ||
      style === undefined ||
      !Array.isArray(children) ||
      !Array.isArray(markDefs)
    ) {
      return [];
    }
    const decodedChildren = children.flatMap((spanInput) => {
      const span = record(spanInput);
      if (span === undefined || Reflect.get(span, "_type") !== "span") return [];
      const spanKey = Reflect.get(span, "_key");
      const text = Reflect.get(span, "text");
      const marks = Reflect.get(span, "marks");
      return typeof spanKey === "string" &&
        typeof text === "string" &&
        Array.isArray(marks) &&
        marks.every((mark) => typeof mark === "string")
        ? [
            {
              _key: spanKey,
              _type: "span" as const,
              text,
              marks: strings({ marks }, "marks") ?? [],
            },
          ]
        : [];
    });
    const decodedMarkDefs = markDefs.flatMap((markInput) => {
      const mark = record(markInput);
      if (mark === undefined || Reflect.get(mark, "_type") !== "link") return [];
      const markKey = Reflect.get(mark, "_key");
      const href = Reflect.get(mark, "href");
      return typeof markKey === "string" && typeof href === "string"
        ? [{ _key: markKey, _type: "link" as const, href }]
        : [];
    });
    if (decodedChildren.length !== children.length || decodedMarkDefs.length !== markDefs.length) {
      return [];
    }
    const listItemInput = Reflect.get(block, "listItem");
    const listItem =
      typeof listItemInput === "string" ? portableTextList(listItemInput) : undefined;
    const levelInput = Reflect.get(block, "level");
    return [
      {
        _key: key,
        _type: "block" as const,
        style,
        ...(listItem === undefined ? {} : { listItem }),
        ...(typeof levelInput === "number" ? { level: levelInput } : {}),
        children: decodedChildren,
        markDefs: decodedMarkDefs,
      },
    ];
  });
  return decodedBlocks.length === blocks.length
    ? { version: 1, profile: "ffd-portable-text", blocks: decodedBlocks }
    : undefined;
}

function richTextConfiguration(configuration: StudioJsonObject) {
  const styles = strings(configuration, "styles")?.flatMap((item) => {
    const decoded = portableTextStyle(item);
    return decoded === undefined ? [] : [decoded];
  });
  const decorators = strings(configuration, "decorators")?.flatMap((item) => {
    const decoded = portableTextDecorator(item);
    return decoded === undefined ? [] : [decoded];
  });
  const lists = strings(configuration, "lists")?.flatMap((item) => {
    const decoded = portableTextList(item);
    return decoded === undefined ? [] : [decoded];
  });
  const configuredDefault = portableTextDocument(value(configuration, "default"));
  return {
    ...(styles === undefined ? {} : { styles }),
    ...(decorators === undefined ? {} : { decorators }),
    ...(lists === undefined ? {} : { lists }),
    ...(optionalBoolean(configuration, "links") === undefined
      ? {}
      : { links: optionalBoolean(configuration, "links") }),
    ...(optionalNumber(configuration, "minLength") === undefined
      ? {}
      : { minLength: optionalNumber(configuration, "minLength") }),
    ...(optionalNumber(configuration, "maxLength") === undefined
      ? {}
      : { maxLength: optionalNumber(configuration, "maxLength") }),
    ...(configuredDefault === undefined ? {} : { default: configuredDefault }),
  };
}

function moneyConfiguration(configuration: StudioJsonObject) {
  const currencies = strings(configuration, "currencies") ?? [];
  const configuredDefault = value(configuration, "default");
  const defaultValue =
    typeof configuredDefault === "object" &&
    configuredDefault !== null &&
    !Array.isArray(configuredDefault) &&
    typeof Reflect.get(configuredDefault, "amount") === "string" &&
    typeof Reflect.get(configuredDefault, "currency") === "string"
      ? {
          amount: String(Reflect.get(configuredDefault, "amount")),
          currency: String(Reflect.get(configuredDefault, "currency")),
        }
      : undefined;
  return {
    currencies,
    ...(optionalBoolean(configuration, "allowNegative") === undefined
      ? {}
      : { allowNegative: optionalBoolean(configuration, "allowNegative") }),
    ...(defaultValue === undefined ? {} : { default: defaultValue }),
  };
}

function enumConfiguration(configuration: StudioJsonObject) {
  const configured = value(configuration, "options");
  const options = Array.isArray(configured)
    ? configured.flatMap((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
        const id = Reflect.get(item, "id");
        const optionValue = Reflect.get(item, "value");
        const label = Reflect.get(item, "label");
        const position = Reflect.get(item, "position");
        return typeof id === "string" &&
          typeof optionValue === "string" &&
          typeof label === "string" &&
          typeof position === "number"
          ? [{ id, value: optionValue, label, position }]
          : [];
      })
    : [];
  const configuredDefault = optionalString(configuration, "default");
  return {
    options,
    ...(configuredDefault === undefined ? {} : { default: configuredDefault }),
  };
}

function kind(value: string): ContentFieldKind {
  switch (value) {
    case "short_text":
    case "long_text":
    case "rich_text":
    case "number":
    case "decimal":
    case "money":
    case "boolean":
    case "date":
    case "date_time":
    case "enum":
    case "url":
    case "email":
    case "slug":
    case "json":
    case "object":
    case "list":
    case "reference":
    case "external_asset":
      return value;
  }
  throw new Error("STUDIO_CONTENT_FORM_INVALID");
}

function adaptField(field: StudioFormFieldDto): ContentFormField {
  const fieldKind = kind(field.kind);
  const base = {
    id: field.id,
    parentFieldId: field.parentFieldId,
    nodeRole: field.nodeRole,
    apiKey: null,
    displayLabel: field.displayLabel,
    required: field.required,
    localization: field.localization,
    position: field.position,
    editor: { helpText: field.helpText, placeholder: field.placeholder },
    children: field.children.map(adaptField),
  };
  switch (fieldKind) {
    case "short_text":
    case "long_text":
    case "slug":
      return {
        ...base,
        kind: fieldKind,
        configuration: {
          ...(optionalNumber(field.configuration, "minLength") === undefined
            ? {}
            : { minLength: optionalNumber(field.configuration, "minLength") }),
          ...(optionalNumber(field.configuration, "maxLength") === undefined
            ? {}
            : { maxLength: optionalNumber(field.configuration, "maxLength") }),
          ...(optionalString(field.configuration, "pattern") === undefined
            ? {}
            : { pattern: optionalString(field.configuration, "pattern") }),
          ...(optionalString(field.configuration, "default") === undefined
            ? {}
            : { default: optionalString(field.configuration, "default") }),
        },
      };
    case "rich_text":
      return {
        ...base,
        kind: fieldKind,
        configuration: richTextConfiguration(field.configuration),
      };
    case "number": {
      const mode = value(field.configuration, "mode");
      return {
        ...base,
        kind: fieldKind,
        configuration: {
          ...(mode === "integer" || mode === "floating_point" ? { mode } : {}),
          ...(optionalNumber(field.configuration, "minimum") === undefined
            ? {}
            : { minimum: optionalNumber(field.configuration, "minimum") }),
          ...(optionalNumber(field.configuration, "maximum") === undefined
            ? {}
            : { maximum: optionalNumber(field.configuration, "maximum") }),
          ...(optionalNumber(field.configuration, "default") === undefined
            ? {}
            : { default: optionalNumber(field.configuration, "default") }),
        },
      };
    }
    case "decimal":
      return {
        ...base,
        kind: fieldKind,
        configuration: {
          ...(optionalNumber(field.configuration, "precision") === undefined
            ? {}
            : { precision: optionalNumber(field.configuration, "precision") }),
          ...(optionalNumber(field.configuration, "scale") === undefined
            ? {}
            : { scale: optionalNumber(field.configuration, "scale") }),
          ...(optionalString(field.configuration, "minimum") === undefined
            ? {}
            : { minimum: optionalString(field.configuration, "minimum") }),
          ...(optionalString(field.configuration, "maximum") === undefined
            ? {}
            : { maximum: optionalString(field.configuration, "maximum") }),
          ...(optionalString(field.configuration, "default") === undefined
            ? {}
            : { default: optionalString(field.configuration, "default") }),
        },
      };
    case "money":
      return { ...base, kind: fieldKind, configuration: moneyConfiguration(field.configuration) };
    case "boolean":
      return {
        ...base,
        kind: fieldKind,
        configuration:
          optionalBoolean(field.configuration, "default") === undefined
            ? {}
            : { default: optionalBoolean(field.configuration, "default") },
      };
    case "date":
    case "date_time":
      return {
        ...base,
        kind: fieldKind,
        configuration: {
          ...(optionalString(field.configuration, "minimum") === undefined
            ? {}
            : { minimum: optionalString(field.configuration, "minimum") }),
          ...(optionalString(field.configuration, "maximum") === undefined
            ? {}
            : { maximum: optionalString(field.configuration, "maximum") }),
          ...(optionalString(field.configuration, "default") === undefined
            ? {}
            : { default: optionalString(field.configuration, "default") }),
        },
      };
    case "enum":
      return { ...base, kind: fieldKind, configuration: enumConfiguration(field.configuration) };
    case "url":
    case "email":
      return {
        ...base,
        kind: fieldKind,
        configuration:
          optionalString(field.configuration, "default") === undefined
            ? {}
            : { default: optionalString(field.configuration, "default") },
      };
    case "json":
      return {
        ...base,
        kind: fieldKind,
        configuration: {
          ...(optionalNumber(field.configuration, "maxBytes") === undefined
            ? {}
            : { maxBytes: optionalNumber(field.configuration, "maxBytes") }),
          ...(optionalNumber(field.configuration, "maxDepth") === undefined
            ? {}
            : { maxDepth: optionalNumber(field.configuration, "maxDepth") }),
          ...optionalDefault(field.configuration),
        },
      };
    case "object":
      return { ...base, kind: fieldKind, configuration: optionalDefault(field.configuration) };
    case "list":
      return {
        ...base,
        kind: fieldKind,
        configuration: {
          ...(optionalNumber(field.configuration, "minItems") === undefined
            ? {}
            : { minItems: optionalNumber(field.configuration, "minItems") }),
          ...(optionalNumber(field.configuration, "maxItems") === undefined
            ? {}
            : { maxItems: optionalNumber(field.configuration, "maxItems") }),
          ...(optionalBoolean(field.configuration, "uniqueItems") === undefined
            ? {}
            : { uniqueItems: optionalBoolean(field.configuration, "uniqueItems") }),
          ...optionalDefault(field.configuration),
        },
      };
    case "reference":
      return {
        ...base,
        kind: fieldKind,
        configuration: {
          targetCollectionId: optionalString(field.configuration, "targetCollectionId") ?? "",
        },
      };
    case "external_asset": {
      const configuredDefault = record(value(field.configuration, "default"));
      const source =
        configuredDefault === undefined ? undefined : Reflect.get(configuredDefault, "source");
      const url =
        configuredDefault === undefined ? undefined : Reflect.get(configuredDefault, "url");
      const configuredKind =
        configuredDefault === undefined ? undefined : Reflect.get(configuredDefault, "kind");
      const assetKind = externalAssetKind(configuredKind);
      const title =
        configuredDefault === undefined ? undefined : Reflect.get(configuredDefault, "title");
      const alt =
        configuredDefault === undefined ? undefined : Reflect.get(configuredDefault, "alt");
      const width =
        configuredDefault === undefined ? undefined : Reflect.get(configuredDefault, "width");
      const height =
        configuredDefault === undefined ? undefined : Reflect.get(configuredDefault, "height");
      const defaultValue =
        source === "external" &&
        typeof url === "string" &&
        assetKind !== undefined &&
        (title === null || typeof title === "string") &&
        (alt === null || typeof alt === "string") &&
        (width === null || typeof width === "number") &&
        (height === null || typeof height === "number")
          ? { source: "external" as const, url, kind: assetKind, title, alt, width, height }
          : undefined;
      return {
        ...base,
        kind: fieldKind,
        configuration: defaultValue === undefined ? {} : { default: defaultValue },
      };
    }
  }
}

/** Removes transport/revision metadata after strict Studio DTO decoding. */
export function adaptStudioContentForm(form: StudioFormDto): ContentFormDefinition {
  return adaptContentFormDefinition({
    canEdit: form.canEdit,
    fields: form.fields.map(adaptField),
    editableFieldIds: [...form.editableFieldIds],
    editorLayout: {
      version: 1,
      tabs: form.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        description: tab.description,
        position: tab.position,
        groups: tab.groups.map((group) => ({
          ...group,
          fields: group.fields.map((placement) => ({ ...placement })),
        })),
      })),
      sidebarGroups: form.sidebarGroups.map((group) => ({
        ...group,
        fields: group.fields.map((placement) => ({ ...placement })),
      })),
    },
    currencyMinorUnits: { ...form.currencyMinorUnits },
  });
}
