import type { CollectionSchema, ProjectSchema } from "@framerfordevs/schema";

const articles = {
  sourceKey: "articles",
  apiKey: "articles",
  fields: [
    {
      sourceKey: "title",
      apiKey: "title",
      kind: "short_text",
      required: true,
      localization: "localized",
      configuration: { maxLength: 160 },
    },
    {
      sourceKey: "internal_note",
      apiKey: "internal_note",
      kind: "long_text",
      required: false,
      localization: "shared",
      configuration: {},
    },
  ],
} as const satisfies CollectionSchema;

export default {
  collections: [articles],
} as const satisfies ProjectSchema;
