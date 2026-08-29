import { describe, expect, it } from "vitest";

import { cmsKeyFromName, collectionFormSchema, fieldFormSchema } from "./index";

describe("CMS browser validation", () => {
  it("accepts the same canonical collection key profile as the API", () => {
    expect(
      collectionFormSchema.safeParse({
        displayName: "Blog posts",
        apiKey: "blog_posts",
        description: "Editorial content",
      }).success,
    ).toBe(true);
  });

  it.each(["id", "constructor", "BlogPosts", "blog-posts", "blog__posts", "blog_posts_"])(
    "rejects unsafe or non-canonical key %s",
    (apiKey) => {
      expect(
        collectionFormSchema.safeParse({
          displayName: "Blog posts",
          apiKey,
          description: "",
        }).success,
      ).toBe(false);
    },
  );

  it("creates a bounded lowercase snake-case suggestion", () => {
    expect(cmsKeyFromName("  Café & Latest Posts  ")).toBe("cafe_latest_posts");
    expect(cmsKeyFromName("A".repeat(100))).toHaveLength(63);
  });

  it("accepts all M6 field kinds and rejects unknown kinds", () => {
    const definition = {
      displayLabel: "Title",
      apiKey: "title",
      localization: "localized",
      helpText: "",
      placeholder: "",
      required: true,
      deprecated: false,
    };
    expect(fieldFormSchema.safeParse({ ...definition, kind: "short_text" }).success).toBe(true);
    expect(fieldFormSchema.safeParse({ ...definition, kind: "object" }).success).toBe(true);
    expect(fieldFormSchema.safeParse({ ...definition, kind: "markdown" }).success).toBe(false);
  });
});
