import type { CollectionSchema, FieldSchema, ListItemSchema, ProjectSchema } from "./core";

export function defineField<const Field extends FieldSchema | ListItemSchema>(field: Field): Field {
  return field;
}

export function defineCollection<const Collection extends CollectionSchema>(
  collection: Collection,
): Collection {
  return collection;
}

export function defineSchema<const Project extends ProjectSchema>(project: Project): Project {
  return project;
}
