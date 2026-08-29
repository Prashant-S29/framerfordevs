import { assert, describe, it } from "@effect/vitest";

import { defineCollection, defineField, defineSchema } from "./compose";
import type { ProjectSchema } from "./index";

const schema = {
  collections: [
    {
      sourceKey: "posts",
      apiKey: "posts",
      fields: [
        {
          sourceKey: "title",
          apiKey: "title",
          kind: "short_text",
          required: true,
          localization: "localized",
          configuration: { minLength: 1, maxLength: 160, pattern: "^[^\\n]+$" },
        },
        {
          sourceKey: "summary",
          apiKey: "summary",
          kind: "long_text",
          required: false,
          localization: "localized",
          configuration: { maxLength: 2_000 },
        },
        {
          sourceKey: "body",
          apiKey: "body",
          kind: "rich_text",
          required: true,
          localization: "localized",
          configuration: {
            styles: ["normal", "h2", "blockquote"],
            decorators: ["strong", "em"],
            links: true,
            lists: ["bullet", "number"],
          },
        },
        {
          sourceKey: "score",
          apiKey: "score",
          kind: "number",
          required: false,
          localization: "shared",
          configuration: { mode: "floating_point", minimum: 0, maximum: 100 },
        },
        {
          sourceKey: "weight",
          apiKey: "weight",
          kind: "decimal",
          required: false,
          localization: "shared",
          configuration: { precision: 12, scale: 4, minimum: "0.0001" },
        },
        {
          sourceKey: "price",
          apiKey: "price",
          kind: "money",
          required: false,
          localization: "shared",
          configuration: {
            currencies: ["USD", "EUR"],
            default: { amount: "19.99", currency: "USD" },
          },
        },
        {
          sourceKey: "featured",
          apiKey: "featured",
          kind: "boolean",
          required: true,
          localization: "shared",
          configuration: { default: false },
        },
        {
          sourceKey: "publish_date",
          apiKey: "publish_date",
          kind: "date",
          required: false,
          localization: "shared",
          configuration: { minimum: "2026-01-01" },
        },
        {
          sourceKey: "event_time",
          apiKey: "event_time",
          kind: "date_time",
          required: false,
          localization: "shared",
          configuration: { minimum: "2026-01-01T00:00:00.000Z" },
        },
        {
          sourceKey: "status",
          apiKey: "status",
          kind: "enum",
          required: true,
          localization: "shared",
          configuration: {
            options: [
              { sourceKey: "draft", value: "draft" },
              { sourceKey: "published", value: "published" },
            ],
            default: "draft",
          },
        },
        {
          sourceKey: "canonical_url",
          apiKey: "canonical_url",
          kind: "url",
          required: false,
          localization: "localized",
          configuration: {},
        },
        {
          sourceKey: "contact_email",
          apiKey: "contact_email",
          kind: "email",
          required: false,
          localization: "shared",
          configuration: {},
        },
        {
          sourceKey: "slug",
          apiKey: "slug",
          kind: "slug",
          required: true,
          localization: "localized",
          configuration: { maxLength: 120 },
        },
        {
          sourceKey: "metadata",
          apiKey: "metadata",
          kind: "json",
          required: false,
          localization: "shared",
          configuration: { maxBytes: 4_096, maxDepth: 8, default: { source: "fixture" } },
        },
        {
          sourceKey: "seo",
          apiKey: "seo",
          kind: "object",
          required: false,
          localization: "localized",
          configuration: {},
          fields: [
            {
              sourceKey: "seo_title",
              apiKey: "title",
              kind: "short_text",
              required: false,
              localization: "localized",
              configuration: { maxLength: 70 },
            },
          ],
        },
        {
          sourceKey: "tags",
          apiKey: "tags",
          kind: "list",
          required: false,
          localization: "localized",
          configuration: { maxItems: 20, uniqueItems: true },
          item: {
            sourceKey: "tag_item",
            kind: "short_text",
            localization: "localized",
            configuration: { maxLength: 63 },
          },
        },
        {
          sourceKey: "author",
          apiKey: "author",
          kind: "reference",
          required: false,
          localization: "shared",
          configuration: { targetCollectionSourceKey: "authors" },
        },
        {
          sourceKey: "hero",
          apiKey: "hero",
          kind: "external_asset",
          required: false,
          localization: "localized",
          configuration: {},
        },
      ],
    },
  ],
} as const satisfies ProjectSchema;

describe("declarative schema contracts", () => {
  it("preserves literal configuration correlation for every field kind", () => {
    assert.strictEqual(schema.collections[0]?.fields.length, 18);
    assert.strictEqual(schema.collections[0]?.fields[14]?.kind, "object");
    assert.strictEqual(schema.collections[0]?.fields[15]?.kind, "list");
  });

  it("provides pure identity helpers for isolated Tier 2 composition", () => {
    const title = defineField({
      sourceKey: "title",
      apiKey: "title",
      kind: "short_text",
      required: true,
      localization: "localized",
      configuration: { maxLength: 160 },
    });
    const posts = defineCollection({ sourceKey: "posts", apiKey: "posts", fields: [title] });
    const project = defineSchema({ collections: [posts] });
    assert.strictEqual(project.collections[0]?.fields[0], title);
  });
});
