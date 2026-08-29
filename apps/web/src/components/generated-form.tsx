// Adapts dashboard form and validation authority to the private browser-safe renderer.

import type { CollectionFieldDefinition } from "@framerfordevs/api/contracts/schemas";
import { validateFieldValue } from "@framerfordevs/api/lib/field-validation";
import {
  adaptContentFormDefinition,
  ContentForm,
  type ContentFormField,
  type ContentFormProps,
} from "@framerfordevs/content-form";
import { useMemo } from "react";

export interface GeneratedFormProps extends Omit<ContentFormProps, "validateField"> {
  readonly validationFields: ReadonlyArray<CollectionFieldDefinition>;
}

function validationField(
  field: ContentFormField,
  fields: ReadonlyMap<string, CollectionFieldDefinition>,
): CollectionFieldDefinition | null {
  const source = fields.get(field.id);
  if (!source) return null;
  const children = field.children.flatMap((child) => {
    const projected = validationField(child, fields);
    return projected ? [projected] : [];
  });
  return { ...source, children };
}

function fieldMap(fields: ReadonlyArray<CollectionFieldDefinition>) {
  const result = new Map<string, CollectionFieldDefinition>();
  const stack = [...fields];
  while (stack.length > 0) {
    const field = stack.pop();
    if (!field) continue;
    result.set(field.id, field);
    stack.push(...field.children);
  }
  return result;
}

export function GeneratedForm({ definition, validationFields, ...props }: GeneratedFormProps) {
  const fields = useMemo(() => fieldMap(validationFields), [validationFields]);
  const projectedDefinition = useMemo(() => adaptContentFormDefinition(definition), [definition]);
  return (
    <ContentForm
      {...props}
      definition={projectedDefinition}
      validateField={(field, value) => {
        const source = validationField(field, fields);
        return source
          ? validateFieldValue(source, value)
          : { issues: [{ message: "The field definition is unavailable." }] };
      }}
    />
  );
}
