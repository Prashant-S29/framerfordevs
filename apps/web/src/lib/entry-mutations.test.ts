// Verifies partition-safe draft mutation paths for atomic and mixed-object fields.

import { describe, expect, it } from "vitest";

import { fieldMutations } from "./entry-mutations";

const leaf = (id: string, localization: "shared" | "localized") => ({
  id,
  kind: "short_text",
  localization,
  children: [],
});

describe("entry mutations", () => {
  it("uses descendant paths for mixed objects and root paths for atomic fields", () => {
    const fields = [
      {
        id: "banner",
        kind: "object",
        localization: "mixed" as const,
        children: [leaf("title", "localized"), leaf("content", "localized")],
      },
      leaf("summary", "localized"),
    ];

    expect(
      fieldMutations(
        {
          banner: { title: "Default title", content: { version: 1, blocks: [] } },
          summary: "Summary",
        },
        {},
        fields,
      ),
    ).toEqual([
      { operation: "set", path: ["banner", "title"], value: "Default title" },
      {
        operation: "set",
        path: ["banner", "content"],
        value: { version: 1, blocks: [] },
      },
      { operation: "set", path: ["summary"], value: "Summary" },
    ]);
  });

  it("recurses through nested mixed objects and emits scoped unsets", () => {
    const fields = [
      {
        id: "page",
        kind: "object",
        localization: "mixed" as const,
        children: [
          {
            id: "banner",
            kind: "object",
            localization: "mixed" as const,
            children: [leaf("title", "localized")],
          },
        ],
      },
    ];

    expect(fieldMutations({}, { page: { banner: { title: "Previous" } } }, fields)).toEqual([
      { operation: "unset", path: ["page", "banner", "title"] },
    ]);
  });
});
