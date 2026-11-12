// Wraps the pure M6 field kernel in named replaceable Effect service operations.

import { Context, Effect, Layer } from "effect";

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

import * as SchemaStrict from "../../../lib/schema-strict";
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
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.short_text,
        configurationParseOptions,
      )(input);
    case "long_text":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.long_text,
        configurationParseOptions,
      )(input);
    case "rich_text":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.rich_text,
        configurationParseOptions,
      )(input);
    case "number":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.number,
        configurationParseOptions,
      )(input);
    case "decimal":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.decimal,
        configurationParseOptions,
      )(input);
    case "money":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.money,
        configurationParseOptions,
      )(input);
    case "boolean":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.boolean,
        configurationParseOptions,
      )(input);
    case "date":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.date,
        configurationParseOptions,
      )(input);
    case "date_time":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.date_time,
        configurationParseOptions,
      )(input);
    case "enum":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.enum,
        configurationParseOptions,
      )(input);
    case "url":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.url,
        configurationParseOptions,
      )(input);
    case "email":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.email,
        configurationParseOptions,
      )(input);
    case "slug":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.slug,
        configurationParseOptions,
      )(input);
    case "json":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.json,
        configurationParseOptions,
      )(input);
    case "object":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.object,
        configurationParseOptions,
      )(input);
    case "list":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.list,
        configurationParseOptions,
      )(input);
    case "reference":
      return SchemaStrict.decodeUnknownResult(
        fieldConfigurationSchemas.reference,
        configurationParseOptions,
      )(input);
    case "external_asset":
      return SchemaStrict.decodeUnknownResult(
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

export class FieldEngine extends Context.Service<FieldEngine, ReturnType<typeof makeFieldEngine>>()(
  "FieldEngine",
) {}

export const FieldEngineLive = Layer.succeed(FieldEngine, makeFieldEngine());
