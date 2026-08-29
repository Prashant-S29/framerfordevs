import type { JSONSchema as ORPCJsonSchema } from "@orpc/openapi";
import type { ConditionalSchemaConverter, SchemaConvertOptions } from "@orpc/openapi";
import { JSONSchema, Schema } from "effect";

type ORPCSchema = Parameters<ConditionalSchemaConverter["condition"]>[0];

function toOrpcJsonSchema(schema: JSONSchema.JsonSchema7Root): Exclude<ORPCJsonSchema, boolean> {
  return JSON.parse(JSON.stringify(schema));
}

export class EffectSchemaToJsonSchemaConverter implements ConditionalSchemaConverter {
  condition(schema: ORPCSchema): boolean {
    return schema !== undefined && Schema.isSchema(schema);
  }

  convert(
    schema: ORPCSchema,
    _options: SchemaConvertOptions,
  ): [required: boolean, jsonSchema: Exclude<ORPCJsonSchema, boolean>] {
    if (!Schema.isSchema(schema)) {
      throw new Error("Expected an Effect Schema.");
    }
    return [true, toOrpcJsonSchema(JSONSchema.make(schema))];
  }
}
