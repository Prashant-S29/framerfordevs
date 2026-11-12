import { JsonSchema, Schema } from "effect";

export type JsonSchemaObject = JsonSchema.JsonSchema;

export interface JsonSchemaRoot extends JsonSchemaObject {
  readonly $schema: string;
  readonly $defs?: JsonSchema.Definitions;
}

export function make(schema: Schema.Top): JsonSchemaRoot {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" });
  const root = { $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12, ...document.schema };
  return Object.keys(document.definitions).length === 0
    ? root
    : { ...root, $defs: document.definitions };
}
