import { describe, expect, it } from "vitest";

import type { StudioFormDto, StudioJsonObject } from "../../../contracts/content";
import { adaptStudioContentForm } from "./index";

const configurations: ReadonlyArray<readonly [string, StudioJsonObject]> = [
  ["short_text", { minLength: 1, default: "Text" }],
  ["long_text", {}],
  [
    "rich_text",
    {
      styles: ["normal", "h2"],
      decorators: ["strong"],
      links: true,
      lists: ["bullet"],
      default: { version: 1, profile: "ffd-portable-text", blocks: [] },
    },
  ],
  ["number", { mode: "integer", minimum: 0 }],
  ["decimal", { precision: 10, scale: 2 }],
  ["money", { currencies: ["USD"] }],
  ["boolean", { default: true }],
  ["date", {}],
  ["date_time", {}],
  ["enum", { options: [{ id: "one", value: "one", label: "One", position: 0 }] }],
  ["url", {}],
  ["email", {}],
  ["slug", {}],
  ["json", { maxDepth: 4 }],
  ["object", { default: {} }],
  ["list", { maxItems: 10 }],
  ["reference", { targetCollectionId: "55555555-5555-4555-8555-555555555555" }],
  [
    "external_asset",
    {
      default: {
        source: "external",
        url: "https://cdn.example.test/image.png",
        kind: "image",
        title: null,
        alt: "Example",
        width: 100,
        height: 50,
      },
    },
  ],
];

function projectedForm(): StudioFormDto {
  const fields = configurations.map(([kind, configuration], index) => ({
    id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    parentFieldId: null,
    nodeRole: "root" as const,
    displayLabel: `Field ${index + 1}`,
    kind,
    required: false,
    localization: "localized" as const,
    position: index,
    helpText: null,
    placeholder: null,
    configuration,
    children: [],
  }));
  return {
    collectionId: "55555555-5555-4555-8555-555555555555",
    schemaRevisionId: "77777777-7777-4777-8777-777777777777",
    contractHash: "a".repeat(64),
    canEdit: true,
    fields,
    editableFieldIds: fields.map((field) => field.id),
    tabs: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        title: "Content",
        description: null,
        position: 0,
        groups: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            title: "Fields",
            description: null,
            position: 0,
            columns: 2,
            fields: fields.map((field, index) => ({
              id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              fieldId: field.id,
              position: index,
              helpTextOverride: null,
            })),
          },
        ],
      },
    ],
    sidebarGroups: [],
    currencyMinorUnits: { USD: 2 },
  };
}

describe("Studio content-form adapter", () => {
  it("adapts all 18 strict projected kinds without introducing API keys", () => {
    const adapted = adaptStudioContentForm(projectedForm());
    expect(adapted.fields.map((field) => field.kind)).toEqual(configurations.map(([kind]) => kind));
    expect(adapted.fields.every((field) => field.apiKey === null)).toBe(true);
    expect(adapted.fields[2]?.configuration).toEqual({
      styles: ["normal", "h2"],
      decorators: ["strong"],
      links: true,
      lists: ["bullet"],
      default: { version: 1, profile: "ffd-portable-text", blocks: [] },
    });
    expect(adapted.fields[17]?.configuration).toEqual(configurations[17]?.[1]);
  });
});
