// Locks collection-wide schema matching and exact optional entry/locale matching for entry events.

import { assert, describe, it } from "@effect/vitest";

import { matchInvalidationMappings, type InvalidationMappingRecord } from "./invalidation-mappings";

const entryId = "019fae8b-1234-7000-8000-000000000001";
const localeId = "019fae8b-1234-7000-8000-000000000002";
const mappings: ReadonlyArray<InvalidationMappingRecord> = [
  {
    eventTypes: ["cms.schema.published", "cms.entry.published", "cms.entry.unpublished"],
    entryId: null,
    localeId: null,
    routePath: "/",
    semanticTags: ["site:homepage"],
  },
  {
    eventTypes: ["cms.entry.published"],
    entryId,
    localeId,
    routePath: "/gu/article",
    semanticTags: ["page:article", "site:homepage"],
  },
  {
    eventTypes: ["cms.entry.published"],
    entryId: "019fae8b-1234-7000-8000-000000000003",
    localeId,
    routePath: "/gu/other",
    semanticTags: ["page:other"],
  },
];

describe("invalidation mapping matcher", () => {
  it("keeps schema publication collection-wide", () => {
    assert.deepStrictEqual(
      matchInvalidationMappings(mappings, {
        eventType: "cms.schema.published",
        entryId: null,
        localeId: null,
      }),
      { semanticTags: ["site:homepage"], routes: ["/"] },
    );
  });

  it("matches optional exact entry and locale while sorting and deduplicating", () => {
    assert.deepStrictEqual(
      matchInvalidationMappings(mappings, {
        eventType: "cms.entry.published",
        entryId,
        localeId,
      }),
      {
        semanticTags: ["page:article", "site:homepage"],
        routes: ["/", "/gu/article"],
      },
    );
  });

  it("does not reuse publish-only routes for unpublish", () => {
    assert.deepStrictEqual(
      matchInvalidationMappings(mappings, {
        eventType: "cms.entry.unpublished",
        entryId,
        localeId,
      }),
      { semanticTags: ["site:homepage"], routes: ["/"] },
    );
  });
});
