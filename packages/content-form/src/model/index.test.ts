import { describe, expect, it } from "vitest";

import { adaptContentFormDefinition, contentFieldKinds, type ContentFormDefinition } from "./index";

const definition: ContentFormDefinition = {
  canEdit: true,
  fields: [
    {
      id: "field",
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "title",
      displayLabel: "Title",
      kind: "short_text",
      required: true,
      localization: "localized",
      position: 0,
      editor: { helpText: null, placeholder: null },
      configuration: {},
      children: [],
    },
  ],
  editableFieldIds: ["field"],
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: "tab",
        title: "Content",
        description: null,
        position: 0,
        groups: [
          {
            id: "group",
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            fields: [{ id: "placement", fieldId: "field", position: 0, helpTextOverride: null }],
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
  currencyMinorUnits: { USD: 2 },
};

describe("content-form model", () => {
  it("keeps the closed 18-kind renderer vocabulary", () => {
    expect(contentFieldKinds).toHaveLength(18);
    expect(new Set(contentFieldKinds).size).toBe(18);
  });

  it("projects compatible inputs into an exact inert DTO", () => {
    const source = {
      ...definition,
      source: "published",
      revisionId: "secret-revision-metadata",
      role: "owner",
      fields: definition.fields.map((field) => ({ ...field, deprecated: false })),
      editorLayout: {
        ...definition.editorLayout,
        tabs: definition.editorLayout.tabs.map((tab) => ({
          ...tab,
          visibleToRoles: ["owner"],
          groups: tab.groups.map((group) => ({
            ...group,
            visibleToRoles: ["owner"],
            fields: group.fields.map((placement) => ({
              ...placement,
              visibleToRoles: ["owner"],
            })),
          })),
        })),
      },
    };

    const projected = adaptContentFormDefinition(source);
    expect(projected).toEqual(definition);
    expect(projected).not.toBe(source);
    expect("source" in projected).toBe(false);
    expect("deprecated" in (projected.fields[0] ?? {})).toBe(false);
    expect("visibleToRoles" in (projected.editorLayout.tabs[0] ?? {})).toBe(false);
  });
});
