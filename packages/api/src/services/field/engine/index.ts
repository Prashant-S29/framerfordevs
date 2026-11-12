import { Context, Effect, Layer, Schema } from "effect";

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

function decodeConfiguration(kind: CollectionFieldKind, input: unknown) {
  switch (kind) {
    case "short_text":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.short_text, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "long_text":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.long_text, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "rich_text":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.rich_text, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "number":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.number, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "decimal":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.decimal, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "money":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.money, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "boolean":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.boolean, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "date":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.date, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "date_time":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.date_time, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "enum":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.enum, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "url":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.url, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "email":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.email, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "slug":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.slug, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "json":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.json, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "object":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.object, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "list":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.list, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "reference":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.reference, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
    case "external_asset":
      return Schema.decodeUnknownResult(fieldConfigurationSchemas.external_asset, {
        ...configurationParseOptions,
        onExcessProperty: "error",
      })(input);
  }
}

function validateConfigurationOperation(
  kind: CollectionFieldKind,
  input: unknown,
): Effect.Effect<FieldConfigurationValidationResult> {
  const decoded = decodeConfiguration(kind, input);
  if (decoded._tag === "Success") {
    return Effect.succeed({ valid: true, configuration: decoded.success, issues: [] });
  }
  const message = decoded.failure.message.slice(0, 512);
  return Effect.succeed({
    valid: false,
    configuration: null,
    issues: [{ path: "configuration", code: "configuration_invalid", message }],
  });
}

function validateValueOperation(
  definition: ValueFieldDefinition,
  value: unknown,
  path?: string,
): Effect.Effect<FieldValueValidationResult> {
  return Effect.succeed(validateFieldValue(definition, value, path));
}

function validateDefinitionsOperation(
  roots: ReadonlyArray<ValueFieldDefinition>,
): Effect.Effect<DefinitionTreeValidationResult> {
  return Effect.succeed(validateDefinitionTree(roots));
}

function validateAggregateDocumentOperation(
  document: unknown,
): Effect.Effect<AggregateSchemaValidationResult> {
  return Effect.succeed(validateAggregateSchemaDocument(document));
}

function validateLayoutOperation(
  layout: EditorLayout,
  fields: ReadonlyArray<LayoutFieldDefinition>,
): Effect.Effect<EditorLayoutValidationResult> {
  return Effect.succeed(validateEditorLayout(layout, fields));
}

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

export class FieldEngine extends Context.Service<FieldEngine, ReturnType<typeof makeFieldEngine>>()(
  "FieldEngine",
) {}

export const FieldEngineLive = Layer.succeed(FieldEngine, makeFieldEngine());
