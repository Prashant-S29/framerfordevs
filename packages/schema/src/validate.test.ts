import { assert, describe, it } from "@effect/vitest";

import { validateStaticProjectSchema } from "./validate";

function project(configuration: Record<string, unknown> = { maxLength: 160 }) {
  return {
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
            configuration,
          },
        ],
      },
    ],
  };
}

describe("static project schema contract", () => {
  it("accepts the closed structural document", () => {
    assert.deepStrictEqual(validateStaticProjectSchema(project()), { valid: true });
  });

  it("accepts every kind-correlated configuration and nested role", () => {
    const field = (sourceKey: string, kind: string, configuration: unknown) => ({
      sourceKey,
      apiKey: sourceKey,
      kind,
      required: false,
      localization: "localized",
      configuration,
    });
    const value = {
      collections: [
        {
          sourceKey: "authors",
          apiKey: "authors",
          fields: [field("name", "short_text", {})],
        },
        {
          sourceKey: "posts",
          apiKey: "posts",
          fields: [
            field("title", "short_text", {
              minLength: 1,
              maxLength: 160,
              pattern: "^[^\\n]+$",
              default: "Title",
            }),
            field("summary", "long_text", { maxLength: 2_000, default: "Summary" }),
            field("body", "rich_text", {
              styles: ["normal", "h2"],
              decorators: ["strong", "em"],
              links: true,
              lists: ["bullet", "number"],
              minLength: 1,
              maxLength: 10_000,
              default: {
                version: 1,
                profile: "ffd-portable-text",
                blocks: [
                  {
                    _key: "block-1",
                    _type: "block",
                    style: "normal",
                    children: [],
                    markDefs: [],
                  },
                ],
              },
            }),
            field("score", "number", {
              mode: "floating_point",
              minimum: 0,
              maximum: 100,
              default: 50,
            }),
            field("weight", "decimal", {
              precision: 12,
              scale: 4,
              minimum: "0.0001",
              maximum: "99.9999",
              default: "1.5",
            }),
            field("price", "money", {
              currencies: ["USD", "EUR"],
              allowNegative: false,
              default: { amount: "19.99", currency: "USD" },
            }),
            field("featured", "boolean", { default: false }),
            field("publish_date", "date", {
              minimum: "2026-01-01",
              maximum: "2026-12-31",
              default: "2026-08-23",
            }),
            field("event_time", "date_time", {
              minimum: "2026-01-01T00:00:00.000Z",
              maximum: "2026-12-31T23:59:59.999Z",
              default: "2026-08-23T00:00:00.000Z",
            }),
            field("status", "enum", {
              options: [
                { sourceKey: "draft", value: "draft" },
                { sourceKey: "published", value: "published" },
              ],
              default: "draft",
            }),
            field("canonical_url", "url", { default: "https://example.com" }),
            field("contact_email", "email", { default: "hello@example.com" }),
            field("slug", "slug", { minLength: 1, maxLength: 120, default: "post" }),
            field("metadata", "json", {
              maxBytes: 4_096,
              maxDepth: 8,
              default: { source: "fixture" },
            }),
            {
              ...field("seo", "object", { default: { title: "SEO" } }),
              fields: [
                {
                  ...field("seo_title", "short_text", { maxLength: 70 }),
                  apiKey: "title",
                },
              ],
            },
            {
              ...field("tags", "list", {
                minItems: 0,
                maxItems: 20,
                uniqueItems: true,
                default: ["typescript"],
              }),
              item: {
                sourceKey: "tag_item",
                kind: "short_text",
                localization: "localized",
                configuration: { maxLength: 63 },
              },
            },
            field("author", "reference", { targetCollectionSourceKey: "authors" }),
            field("hero", "external_asset", {
              default: {
                source: "external",
                url: "https://example.com/hero.jpg",
                kind: "image",
                title: null,
                alt: "Hero",
                width: 1_600,
                height: 900,
              },
            }),
          ],
        },
      ],
    };
    assert.deepStrictEqual(validateStaticProjectSchema(value), { valid: true });
  });

  it("rejects excess configuration and project properties", () => {
    const value = {
      ...project({ maxLength: 160, executable: "no" }),
      credential: "no",
    };
    const result = validateStaticProjectSchema(value);
    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.deepInclude(result.issues, {
        path: "$.credential",
        code: "property_unknown",
      });
      assert.deepInclude(result.issues, {
        path: "$.collections[0].fields[0].configuration.executable",
        code: "property_unknown",
      });
    }
  });

  it("rejects duplicate source identities and enum values", () => {
    const value = {
      collections: [
        {
          sourceKey: "posts",
          apiKey: "posts",
          fields: [
            {
              sourceKey: "status",
              apiKey: "status",
              kind: "enum",
              required: true,
              localization: "shared",
              configuration: {
                options: [
                  { sourceKey: "draft", value: "draft" },
                  { sourceKey: "draft", value: "draft" },
                ],
              },
            },
          ],
        },
      ],
    };
    const result = validateStaticProjectSchema(value);
    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.isTrue(result.issues.some((issue) => issue.code === "source_key_duplicate"));
      assert.isTrue(result.issues.some((issue) => issue.code === "enum_value_duplicate"));
    }
  });

  it("rejects enum defaults and reference targets outside the complete project", () => {
    const value = {
      collections: [
        {
          sourceKey: "posts",
          apiKey: "posts",
          fields: [
            {
              sourceKey: "status",
              apiKey: "status",
              kind: "enum",
              required: true,
              localization: "shared",
              configuration: {
                options: [{ sourceKey: "draft", value: "draft" }],
                default: "missing",
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
          ],
        },
      ],
    };
    const result = validateStaticProjectSchema(value);
    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.isTrue(result.issues.some((issue) => issue.code === "enum_default_invalid"));
      assert.isTrue(result.issues.some((issue) => issue.code === "reference_target_unknown"));
    }
  });

  it("rejects generated IDs, presentation metadata, and list-item API keys", () => {
    const value = {
      collections: [
        {
          id: "019fae8b-1234-7000-8000-000000000001",
          sourceKey: "posts",
          apiKey: "posts",
          displayName: "Posts",
          fields: [
            {
              sourceKey: "tags",
              apiKey: "tags",
              kind: "list",
              required: false,
              localization: "localized",
              configuration: {},
              item: {
                sourceKey: "tag_item",
                apiKey: "forbidden",
                kind: "short_text",
                localization: "localized",
                configuration: {},
              },
            },
          ],
        },
      ],
    };
    const result = validateStaticProjectSchema(value);
    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.isTrue(result.issues.some((issue) => issue.path.endsWith(".id")));
      assert.isTrue(result.issues.some((issue) => issue.path.endsWith(".displayName")));
      assert.isTrue(result.issues.some((issue) => issue.path.endsWith(".item.apiKey")));
    }
  });
});
