import { describe, expect, it } from "vitest";

import { adaptAuthoringGeneratedForm, type AuthoringContentFormSource } from "./index";

const base = {
  parentFieldId: null,
  nodeRole: "root" as const,
  required: false,
  localization: "localized" as const,
  position: 0,
  editor: { helpText: null, placeholder: null, visibleToRoles: ["owner"] },
  children: [],
};
const source: AuthoringContentFormSource = {
  canEdit: true,
  fields: [
    {
      ...base,
      id: "money",
      apiKey: "money",
      displayLabel: "Money",
      kind: "money",
      configuration: {
        currencies: ["USD", "JPY"],
        allowNegative: false,
        default: { amount: "10", currency: "USD" },
      },
    },
    {
      ...base,
      id: "enum",
      apiKey: "status",
      displayLabel: "Status",
      kind: "enum",
      configuration: {
        options: [{ id: "option", value: "draft", label: "Draft", position: 0 }],
        default: "draft",
      },
    },
    {
      ...base,
      id: "reference",
      apiKey: "author",
      displayLabel: "Author",
      kind: "reference",
      configuration: { targetCollectionId: "authors" },
    },
  ],
  editableFieldIds: ["money", "enum", "reference"],
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
            fields: [
              { id: "money-p", fieldId: "money", position: 0, helpTextOverride: null },
              { id: "enum-p", fieldId: "enum", position: 1, helpTextOverride: null },
              { id: "reference-p", fieldId: "reference", position: 2, helpTextOverride: null },
            ],
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
  currencyMinorUnits: { USD: 2, JPY: 0 },
};

describe("Authoring content-form adapter", () => {
  it("preserves kind-specific authority while dropping transport and role metadata", () => {
    const result = adaptAuthoringGeneratedForm(source);
    expect(result).toEqual({
      ...source,
      fields: source.fields.map(({ editor, ...field }) => ({
        ...field,
        editor: { helpText: editor.helpText, placeholder: editor.placeholder },
      })),
    });
    expect("visibleToRoles" in (result.fields[0]?.editor ?? {})).toBe(false);
  });
});
