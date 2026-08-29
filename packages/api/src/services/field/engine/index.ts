// Wraps the pure M6 field kernel in named replaceable Effect service operations.

import { Context, Effect, Layer, ParseResult, Schema } from "effect";

import {
  type CollectionFieldKind,
  type FieldConfiguration,
  type EditorLayout,
  fieldConfigurationSchemas,
  type FieldValidationIssue,
} from "../../../contracts/field";
import {
  type EditorLayoutValidationResult,
  type LayoutFieldDefinition,
  validateEditorLayout,
} from "../../../lib/field/layout";
import {
  type AggregateSchemaValidationResult,
  validateAggregateSchemaDocument,
} from "../../../lib/field/document";
import {
  type DefinitionTreeValidationResult,
  type FieldValueValidationResult,
  type ValueFieldDefinition,
  validateDefinitionTree,
  validateFieldValue,
} from "../../../lib/field/validation";

export interface FieldConfigurationValidationResult {
  readonly valid: boolean;
  readonly configuration: FieldConfiguration | null;
  readonly issues: ReadonlyArray<FieldValidationIssue>;
}

const configurationParseOptions = {
  errors: "all",
  onExcessProperty: "error",
} as const;

/** Decodes one kind-correlated configuration with strict excess-property handling. */
function decodeConfiguration(kind: CollectionFieldKind, input: unknown) {
  switch (kind) {
    case "short_text":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.short_text,
        configurationParseOptions,
      )(input);
    case "long_text":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.long_text,
        configurationParseOptions,
      )(input);
    case "rich_text":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.rich_text,
        configurationParseOptions,
      )(input);
    case "number":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.number,
        configurationParseOptions,
      )(input);
    case "decimal":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.decimal,
        configurationParseOptions,
      )(input);
    case "money":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.money,
        configurationParseOptions,
      )(input);
    case "boolean":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.boolean,
        configurationParseOptions,
      )(input);
    case "date":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.date,
        configurationParseOptions,
      )(input);
    case "date_time":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.date_time,
        configurationParseOptions,
      )(input);
    case "enum":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.enum,
        configurationParseOptions,
      )(input);
    case "url":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.url,
        configurationParseOptions,
      )(input);
    case "email":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.email,
        configurationParseOptions,
      )(input);
    case "slug":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.slug,
        configurationParseOptions,
      )(input);
    case "json":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.json,
        configurationParseOptions,
      )(input);
    case "object":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.object,
        configurationParseOptions,
      )(input);
    case "list":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.list,
        configurationParseOptions,
      )(input);
    case "reference":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.reference,
        configurationParseOptions,
      )(input);
    case "external_asset":
      return Schema.decodeUnknownEither(
        fieldConfigurationSchemas.external_asset,
        configurationParseOptions,
      )(input);
  }
}

/** Validates one configuration and converts parser details into bounded safe feedback. */
function validateConfigurationOperation(
  kind: CollectionFieldKind,
  input: unknown,
): Effect.Effect<FieldConfigurationValidationResult> {
  const decoded = decodeConfiguration(kind, input);
  if (decoded._tag === "Right") {
    return Effect.succeed({ valid: true, configuration: decoded.right, issues: [] });
  }
  const message = ParseResult.TreeFormatter.formatErrorSync(decoded.left).slice(0, 512);
  return Effect.succeed({
    valid: false,
    configuration: null,
    issues: [{ path: "configuration", code: "configuration_invalid", message }],
  });
}

/** Validates and normalizes one field value through the pure deterministic kernel. */
function validateValueOperation(
  definition: ValueFieldDefinition,
  value: unknown,
  path?: string,
): Effect.Effect<FieldValueValidationResult> {
  return Effect.succeed(validateFieldValue(definition, value, path));
}

/** Validates recursive structure, depth, and localization through the pure kernel. */
function validateDefinitionsOperation(
  roots: ReadonlyArray<ValueFieldDefinition>,
): Effect.Effect<DefinitionTreeValidationResult> {
  return Effect.succeed(validateDefinitionTree(roots));
}

/** Validates and canonicalizes the complete management schema under the aggregate byte ceiling. */
function validateAggregateDocumentOperation(
  document: unknown,
): Effect.Effect<AggregateSchemaValidationResult> {
  return Effect.succeed(validateAggregateSchemaDocument(document));
}

/** Validates editor layout independently from API/value contract compilation. */
function validateLayoutOperation(
  layout: EditorLayout,
  fields: ReadonlyArray<LayoutFieldDefinition>,
): Effect.Effect<EditorLayoutValidationResult> {
  return Effect.succeed(validateEditorLayout(layout, fields));
}

/** Constructs the production service without creating a local runtime or Layer. */
export function makeFieldEngine() {
  return {
    validateConfiguration: Effect.fn("FieldEngine.validateConfiguration")(
      validateConfigurationOperation,
    ),
    validateValue: Effect.fn("FieldEngine.validateValue")(validateValueOperation),
    validateDefinitions: Effect.fn("FieldEngine.validateDefinitions")(validateDefinitionsOperation),
    validateLayout: Effect.fn("FieldEngine.validateLayout")(validateLayoutOperation),
    validateAggregateDocument: Effect.fn("FieldEngine.validateAggregateDocument")(
      validateAggregateDocumentOperation,
    ),
  };
}

export class FieldEngine extends Context.Tag("FieldEngine")<
  FieldEngine,
  ReturnType<typeof makeFieldEngine>
>() {}

export const FieldEngineLive = Layer.succeed(FieldEngine, makeFieldEngine());
